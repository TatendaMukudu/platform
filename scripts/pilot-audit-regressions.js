/* Independent pilot audit, 2026-09-05, against 103e37d.
 * Run explicitly: node scripts/pilot-audit-regressions.js
 * Deliberately not in scripts/test.js yet: these assertions describe required
 * behaviour and expose unresolved defects. A nonzero exit is expected on the
 * audited revision. No production data, database or model calls are used.
 */
'use strict';
process.env.NODE_ENV = 'test';
process.env.DB_OPTIONAL = '1';
process.env.DATABASE_URL = '';
const assert = require('node:assert/strict');
const S = require('../server');
require('../ai/gateway').setDeterministicOnly(true);
const A = 'audit_a', B = 'audit_b';
const user = (id, role, orgCode, nodes = []) => ({
  id, name: id, email: `${id}@example.test`, role, orgCode,
  status: 'active', assignedNodeIds: nodes,
});
S._loadAllStores({
  orgMeta: { [A]: { orgName: 'Audit A', orgMode: 'sports' }, [B]: { orgName: 'Audit B', orgMode: 'sports' } },
  orgStore: { [A]: { orgName: 'Audit A', orgMode: 'sports' }, [B]: { orgName: 'Audit B', orgMode: 'sports' } },
  orgUsers: {
    [A]: { p1: user('p1', 'member', A, ['n']), p2: user('p2', 'member', A, ['n']),
      admin: user('admin', 'superadmin', A), reset: { ...user('reset', 'member', A), passwordSet: false } },
    [B]: { outsider: user('outsider', 'member', B) },
  },
  orgNodes: { [A]: { n: { nodeId: 'n', name: 'Audit group', memberIds: ['p1', 'p2'], leaderIds: [], childNodeIds: [] } } },
  inviteTokens: { 'audit-once': { orgCode: A, role: 'member', usageLimit: 1, useCount: 0, expiresAt: Date.now() + 60000 } },
});
S._rebuildEmailIndex();
const tokens = {
  p1: S.issueToken('p1', A, 'member'), p2: S.issueToken('p2', A, 'member'),
  admin: S.issueToken('admin', A, 'superadmin'), outsider: S.issueToken('outsider', B, 'member'),
};
let pass = 0, fail = 0;
async function check(name, fn) {
  try { await fn(); pass++; console.log('PASS', name); }
  catch (e) { fail++; console.log('FAIL', name, '—', e.message); }
}
const server = S.app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(path, who, body, method = body ? 'POST' : 'GET') {
    const response = await fetch(base + path, {
      method, headers: { 'Content-Type': 'application/json', ...(who ? { Authorization: `Bearer ${tokens[who]}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(2000),
    });
    return { status: response.status, body: await response.json() };
  }
  try {
    await check('anonymous Focus creation is refused', async () => {
      assert.equal((await request('/api/me/focus', null, { text: 'Anonymous' })).status, 401);
    });
    await check('member cannot create an admin in another organisation', async () => {
      const r = await request('/api/auth/bulk-import', 'p1', { orgCode: B, users: [{ name: 'Imported admin', email: 'imported@example.test', role: 'admin' }] });
      assert.ok([403, 404].includes(r.status), `expected refusal; received ${r.status}`);
      assert.equal(Object.values(S.orgUsers[B]).some(u => u.email === 'imported@example.test'), false);
    });
    await check('member cannot change another organisation mode', async () => {
      await request('/api/platform/update-org-mode', 'p1', { orgCode: B, orgMode: 'changed' });
      assert.equal(S.orgMeta[B].orgMode, 'sports');
    });
    await check('member cannot overwrite own organisation metadata', async () => {
      await request('/api/platform/register-org', 'p1', { orgName: 'Changed by member', orgMode: 'changed' });
      assert.equal(S.orgStore[A].orgName, 'Audit A');
    });
    const made = await request('/api/me/focus', 'p1', { text: 'Private first' });
    assert.equal(made.status, 200);
    const privateId = made.body.focus.id;
    await check('private Focus is hidden from teammate', async () => {
      const r = await request('/api/objects?kind=focus&scope=self', 'p2');
      assert.equal(r.body.objects.some(o => o.id === privateId), false);
    });
    await check('another organisation cannot read private Focus thread', async () => {
      assert.equal((await request(`/api/objects/focus/${privateId}/thread?scope=self`, 'outsider')).status, 404);
    });
    await check('non-owner cannot record private Focus outcome', async () => {
      assert.equal((await request('/api/me/focus/outcome', 'p2', { focusId: privateId, outcome: 'helped' })).status, 404);
    });
    const invited = await request('/api/me/focus', 'p1', { text: 'Invited focus', participants: ['p2'] });
    assert.equal(invited.status, 200);
    const focusId = invited.body.focus.id;
    await check('named invitee can see invited Focus', async () => {
      const r = await request('/api/objects?kind=focus&scope=self', 'p2');
      assert.equal(r.body.objects.some(o => o.id === focusId), true);
    });
    const narrowed = await request(`/api/me/focus/${focusId}/visibility`, 'p1', { visibility: 'private' });
    assert.equal(narrowed.status, 200);
    await check('private-again confirmation actually revokes invitee read access', async () => {
      const r = await request('/api/objects?kind=focus&scope=self', 'p2');
      assert.equal(r.body.objects.some(o => o.id === focusId), false);
    });
    await check('private-again confirmation also revokes Forum access', async () => {
      const r = await request(`/api/forum/focus/${focusId}`, 'p2');
      assert.ok([403, 404].includes(r.status), `expected refusal; received ${r.status}`);
    });
    await check('owner can record a Focus outcome', async () => {
      assert.equal((await request('/api/me/focus/outcome', 'p1', { focusId, outcome: 'helped' })).status, 200);
    });
    await check('retrying one outcome does not create another feedback vote', async () => {
      const before = S.noticeFeedback[A].self_set.useful;
      await request('/api/me/focus/outcome', 'p1', { focusId, outcome: 'helped' });
      assert.equal(S.noticeFeedback[A].self_set.useful, before);
    });
    await check('correcting one outcome does not leave multiple votes for that Focus', async () => {
      await request('/api/me/focus/outcome', 'p1', { focusId, outcome: 'no' });
      const feedback = S.noticeFeedback[A].self_set;
      assert.equal(feedback.useful + feedback.dismiss, 1);
    });
    await check('one-use invite permits at most one concurrent registration', async () => {
      const responses = await Promise.all([1, 2].map(n => request('/api/auth/join-invite', null, {
        token: 'audit-once', name: `Concurrent ${n}`, email: `concurrent${n}@example.test`, password: 'Fixture-password-only',
      })));
      assert.equal(responses.filter(r => r.status === 200).length, 1);
      assert.equal(S.inviteTokens['audit-once'].useCount, 1);
    });
    await check('admin reset leaves a login that returns a controlled response', async () => {
      const reset = await request('/api/auth/update-user', 'admin', { userId: 'reset', updates: { resetPassword: true } }, 'PUT');
      assert.equal(reset.status, 200);
      const login = await request('/api/auth/login', null, { email: 'reset@example.test', password: 'Fixture-password-only' });
      assert.ok([400, 401, 403].includes(login.status), `unexpected status ${login.status}`);
    });
  } catch (e) { fail++; console.error('FAIL fixture/setup:', e.stack); }
  finally {
    server.closeAllConnections(); server.close();
    console.log(`pilot-audit-regressions: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
});
