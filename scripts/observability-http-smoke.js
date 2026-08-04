/* Truth layer — OBSERVABILITY (HTTP). Proves the error surface is wired: a captured error is
   visible to a superadmin (redacted), and NOT to anyone else. Boots the real app (DB_OPTIONAL).
   Run: node scripts/observability-http-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, _captureError } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const C = 'obs';
_loadAllStores({
  orgMeta:  { [C]: { orgName: 'Club' } },
  orgUsers: { [C]: {
    boss: { id: 'boss', name: 'Boss', role: 'superadmin', orgCode: C, status: 'active' },
    joe:  { id: 'joe',  name: 'Joe',  role: 'member',     orgCode: C, status: 'active' },
  } },
});
_rebuildEmailIndex();

// Capture an error carrying PII/secret — the log must redact it.
_captureError(new Error('failed for joe@club.com with Bearer supersecrettoken12345'), { route: '/api/x', method: 'POST', status: 500, orgCode: C });

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = (who) => fetch(base + '/api/admin/errors', { headers: { Authorization: `Bearer ${issueToken(who, C, who === 'boss' ? 'superadmin' : 'member')}` } }).then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));

  try {
    const admin = await get('boss');
    ok('1 · a superadmin can see recent errors', admin.j && admin.j.ok && (admin.j.errors || []).length >= 1);
    ok('2 · the error is REDACTED (no email / token leaks into the log)', !/joe@club\.com|supersecrettoken/.test(JSON.stringify(admin.j.errors)));
    ok('3 · a plain member cannot read the error log (403)', (await get('joe')).status === 403);

    /* 4 — metrics: a turn is counted, visible to the org superadmin, refused to a member */
    await fetch(base + '/api/assistant/turn', { method: 'POST', headers: { Authorization: `Bearer ${issueToken('joe', C, 'member')}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'hello' }) });
    const met = await fetch(base + '/api/admin/metrics', { headers: { Authorization: `Bearer ${issueToken('boss', C, 'superadmin')}` } }).then(r => r.json());
    ok('4 · a superadmin sees per-org usage metrics (a turn was counted)', met.ok && met.metrics.some(m => m.orgCode === C && (m.events.turn || 0) >= 1));
    ok('4 · …scoped to their own org (no cross-org leak by default)', met.scope === 'org' && met.metrics.every(m => m.orgCode === C));
    ok('4 · a plain member cannot read metrics (403)', (await fetch(base + '/api/admin/metrics', { headers: { Authorization: `Bearer ${issueToken('joe', C, 'member')}` } })).status === 403);
  } catch (e) { fail++; console.log('  ✗ threw:', e && e.message); }

  server.close();
  console.log(`\nobservability-http-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
