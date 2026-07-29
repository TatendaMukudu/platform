/* Truth layer — THE BRAIN DOES NOT SLEEP (HTTP). Proves the reasoner heartbeat:
   a background sweep reasons over every org WITHOUT any leader opening the app, so a
   belief is already waiting the first time a leader looks; and an event nudge (a note
   shared via the real endpoint) drops the stale tick cache so the very next read
   re-reasons with the new input instead of serving a pre-note belief state.
   Boots the real app (DB_OPTIONAL). Run: node scripts/reason-heartbeat-http-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken,
        _reasonSweep, _reasonNudge, reasonLedger, reasonTickCache } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const C = 'hbeat', DAY = 86400000, now = Date.now();
const iso = n => new Date(now - n * DAY).toISOString();
const note = (id, author, content, days, type) => ({
  id, orgCode: C, authorId: author, authorName: author, content, type, tag: null,
  sensitivity: 'normal', createdAt: iso(days), aiResponse: null,
});

_loadAllStores({
  orgMeta: { [C]: { orgName: 'H', orgMode: 'sports' } },
  orgUsers: { [C]: {
    coachA: { id: 'coachA', name: 'Alex', role: 'coach',  orgCode: C, status: 'active', leadershipNodeIds: ['teamA'] },
    uma:    { id: 'uma',    name: 'Uma',  role: 'member', orgCode: C, status: 'active' },
  } },
  orgNodes: { [C]: {
    teamA: { nodeId: 'teamA', parentId: null, leaderIds: ['coachA'], memberIds: ['uma'] },
  } },
  orgNotes: {
    u1: note('u1', 'uma', 'Honestly I am exhausted and overwhelmed this week, could use some help.', 8, 'shared'),
    u2: note('u2', 'uma', 'Still shattered and stretched too thin — so much on.', 5, 'shared'),
    u3: note('u3', 'uma', 'Drained again today, overwhelmed by everything on my plate.', 1, 'shared'),
    // Uma keeps one more note PRIVATE — she'll share it through the real endpoint below.
    u4: note('u4', 'uma', 'Overwhelmed once more, could really use a hand.', 0, 'private'),
  },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const umaTok = issueToken('uma', C, 'member');

  try {
    /* 1 — the heartbeat: NOBODY has opened the app. Run the background sweep and the
       ledger for this org is already populated, calibrated, ready to be read. */
    ok('0 · before the heartbeat, the org has no belief ledger yet', !(reasonLedger[C] || []).length);
    const n = _reasonSweep(now);
    ok('1 · the background sweep reasons over the org (no leader present)', n >= 1);
    ok('1 · …and a belief about Uma is already waiting in the ledger', (reasonLedger[C] || []).some(b => b.subjectId === 'uma'));
    ok('1 · …so the FIRST time a leader looks, the read is current (cache warm)', !!reasonTickCache[C]);

    /* 2 — the event nudge (unit): a nudge drops the stale cache so the next read
       re-reasons WITH the new input, rather than serving the old belief state. */
    const before = reasonTickCache[C];
    _reasonNudge(C);
    ok('2 · a nudge drops the org\'s stale tick cache (next read re-reasons)', !reasonTickCache[C] && !!before);

    /* 3 — the nudge is WIRED into the real share path: an author sharing a note is new
       admissible input, so the share endpoint must nudge the reasoner. Re-warm, share
       via the real HTTP endpoint, and the cache must be gone. */
    _reasonSweep(now);
    ok('3 · cache is warm again after a sweep', !!reasonTickCache[C]);
    const r = await (await fetch(base + '/api/notes/u4/share', {
      method: 'POST', headers: { Authorization: `Bearer ${umaTok}`, 'Content-Type': 'application/json' }, body: '{}',
    })).json();
    ok('3 · the author shares a note through the real endpoint', r.ok === true && r.shared === true);
    ok('3 · …and sharing NUDGED the reasoner (stale cache dropped → next read re-reasons)', !reasonTickCache[C]);

  } catch (e) { fail++; console.log('  ✗ HTTP suite threw:', e && e.message); }

  server.close();
  console.log(`\nreason-heartbeat-http-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
