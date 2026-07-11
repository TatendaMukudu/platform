/* Truth layer — ENDPOINT AUTHORIZATION + the Individual Experience surface.

   Boots the real Express app in-process (DB_OPTIONAL=1, no Postgres, no AI key),
   seeds two members + a leader in memory, and drives the HTTP endpoints to prove
   the access-control class stays closed and the "Me" context works. This is the
   HTTP-level guard the pure suites can't provide — it exercises requireAuth,
   session-identity, permissions, scope, and the composer end to end.

   Run:  node scripts/endpoint-smoke.js   (part of `npm test`) */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = require('../server.js');

const CODE = 'testco';
const iso  = new Date().toISOString();
const coachId = 'coach1', aId = 'mA', bId = 'mB';

_loadAllStores({
  orgMeta:  { [CODE]: { orgName: 'Test Co', createdAt: iso } },
  orgUsers: { [CODE]: {
    [coachId]: { id: coachId, name: 'Coach', email: 'coach@t.co', role: 'superadmin', orgCode: CODE, supervisorId: null, status: 'active' },
    [aId]:     { id: aId, name: 'Member A', email: 'a@t.co', role: 'member', orgCode: CODE, supervisorId: coachId, status: 'active' },
    [bId]:     { id: bId, name: 'Member B', email: 'b@t.co', role: 'member', orgCode: CODE, supervisorId: coachId, status: 'active' },
  } },
  memberCheckins: { [`${CODE}:${aId}`]: [{ memberName: 'Member A', text: 'normal week', mood: 4, date: '01/01/2026', ts: iso }] },
  orgNotes: {
    noteB: { id: 'noteB', noteId: 'noteB', orgCode: CODE, authorId: bId, authorName: 'Member B', type: 'private', content: 'B private secret', createdAt: iso },
    noteA: { id: 'noteA', noteId: 'noteA', orgCode: CODE, authorId: aId, authorName: 'Member A', type: 'private', content: 'A private', createdAt: iso },
  },
  userAiProfiles: { [`${CODE}:${aId}`]: { openThreads: [{ id: 't1', text: 'A open thread', resolved: false, date: '2026-01-01' }], recentThemes: [], priorFollowUps: [], lastUpdated: iso } },
});
_rebuildEmailIndex();

const tokCoach = issueToken(coachId, CODE, 'superadmin');
const tokA     = issueToken(aId, CODE, 'member');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, tok, opts = {}) => {
    const headers = { ...(opts.headers || {}), ...(tok ? { Authorization: `Bearer ${tok}` } : {}) };
    if (opts.body) headers['Content-Type'] = 'application/json';
    const r = await fetch(base + path, { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    let j = null; try { j = await r.json(); } catch (_) {}
    return { status: r.status, j };
  };

  try {
    // ── requireAuth ──────────────────────────────────────────────────────────
    ok('me/context requires auth (401 without a token)', (await call('/api/me/context', null)).status === 401);
    ok('org-tree requires auth (401 without a token)',   (await call('/api/auth/org-tree', null)).status === 401);

    // ── the "Me" context surface works for the member ────────────────────────
    const ctx = await call('/api/me/context', tokA);
    ok('me/context returns the proactive open-state', ctx.status === 200 && ctx.j?.ok === true && typeof ctx.j.opening === 'string');

    // ── Person Model / memory is self-only (governance) ──────────────────────
    const mem = await call('/api/user/memory', tokA);
    ok('user/memory returns the caller\'s OWN model', mem.status === 200 && (mem.j?.memory?.openThreads || []).some(t => t.id === 't1'));
    const spoof = await call('/api/user/memory?userId=' + bId, tokA);
    ok('user/memory ignores a spoofed userId (self-only, no cross-read)',
       spoof.status === 200 && (spoof.j?.memory?.openThreads || []).some(t => t.id === 't1'));

    // ── notes IDOR closed — session identity, not the query requesterId ──────
    const notes = await call('/api/notes?requesterId=' + bId, tokA);
    const leaked = (notes.j?.notes || []).some(n => n.content === 'B private secret');
    ok('notes cannot read another member\'s private note via requesterId (IDOR closed)', notes.status === 200 && !leaked);

    // ── permission gates on leader-facing member data ───────────────────────
    ok('org-checkins denies a plain member (403)',  (await call('/api/platform/org-checkins', tokA)).status === 403);
    ok('org-checkins allows a leader (200)',         (await call('/api/platform/org-checkins', tokCoach)).status === 200);
    ok('member-results denies A reading B (403)',    (await call('/api/platform/member-results?memberName=Member%20B', tokA)).status === 403);
    ok('member-results allows the leader (200)',     (await call('/api/platform/member-results?memberName=Member%20B', tokCoach)).status === 200);

    // ── leader check-in text is privacy-filtered (sensitive redacted) ───────
    // (Seed a hardship check-in for A; the leader sees engagement, never the words.)
    const compHardship = await call('/api/compose', tokA, { method: 'POST', body: { text: 'I have been really struggling to cope this week.' } });
    ok('compose accepts input and acknowledges', compHardship.status === 200 && compHardship.j?.ok === true);
    const oc = await call('/api/platform/org-checkins', tokCoach);
    const aEntries = oc.j?.checkins?.['Member A'] || [];
    const hardship = aEntries.find(e => e.private === true);
    ok('a hardship check-in is redacted from the leader view (text null, private true)',
       !!hardship && hardship.text === null);
    ok('a neutral check-in stays visible to the leader',
       aEntries.some(e => e.private === false && typeof e.text === 'string'));

  } catch (e) {
    fail++; console.log('  ✗ threw:', e.message);
  } finally {
    server.close();
    console.log(`\nendpoint-smoke: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
});
