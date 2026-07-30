/* Truth layer — AMBIENT SENSING (HTTP). Proves reason-on-event is no longer limited to a
   shared note: ANY new signal reaching the kernel (here, a member syncing their calendar)
   nudges the reasoner, so the next read re-reasons WITH the new reality instead of serving a
   stale, pre-signal belief state. This is what makes the brain feel awake between heartbeats.
   Boots the real app (DB_OPTIONAL). Run: node scripts/reason-ambient-http-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, reasonTickCache } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const C = 'amb';
_loadAllStores({
  orgMeta: { [C]: { orgName: 'A', orgMode: 'business' } },
  orgUsers: { [C]: {
    coachA: { id: 'coachA', name: 'Alex', role: 'coach',  orgCode: C, status: 'active', leadershipNodeIds: ['teamA'] },
    uma:    { id: 'uma',    name: 'Uma',  role: 'member', orgCode: C, status: 'active' },
  } },
  orgNodes: { [C]: { teamA: { nodeId: 'teamA', parentId: null, leaderIds: ['coachA'], memberIds: ['uma'] } } },
  // Uma has consented + connected her calendar (so a pull emits signals through the kernel).
  userConsents:     { [`${C}:uma`]: { 'external:calendar': { granted: true } } },
  connectedSources: { [`${C}:uma`]: { calendar: { connectedAt: new Date().toISOString(), lastPull: null } } },
});
_rebuildEmailIndex();

const calResp = { items: [
  { status: 'confirmed', start: { dateTime: '2026-07-20T09:00:00Z' } },
  { status: 'confirmed', start: { dateTime: '2026-07-20T14:00:00Z' } },
] };

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const coachTok = issueToken('coachA', C, 'coach');
  const umaTok   = issueToken('uma', C, 'member');

  try {
    /* 1 — warm the reasoner cache by reading the leader's agenda */
    await fetch(base + '/api/reason/agenda?refresh=1', { headers: { Authorization: `Bearer ${coachTok}` } });
    ok('1 · reading the agenda warms the org\'s reasoner cache', !!reasonTickCache[C]);

    /* 2 — a member syncs a new signal (calendar) — a plain input, not a shared note */
    const r = await (await fetch(base + '/api/me/sources/pull', {
      method: 'POST', headers: { Authorization: `Bearer ${umaTok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'calendar', provider: 'google', data: calResp }),
    })).json();
    ok('2 · the member\'s calendar sync emits signals into the kernel', r.ok && r.imported >= 1);

    /* 3 — that new signal NUDGED the reasoner: the stale cache is dropped, next read re-reasons */
    ok('3 · a new signal (not a note) nudges the reasoner — the stale cache is dropped', !reasonTickCache[C]);
  } catch (e) { fail++; console.log('  ✗ HTTP suite threw:', e && e.message); }

  server.close();
  console.log(`\nreason-ambient-http-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
