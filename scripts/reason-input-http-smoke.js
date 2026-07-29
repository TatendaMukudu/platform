/* Truth layer — LANGUAGE becomes reasoner signal (HTTP). Proves the input-richness wiring:
   a member's SHARED notes, read deterministically (ai/comprehend, no model), accumulate into
   a belief the reasoner raises to their leader — while PRIVATE and SENSITIVE notes never feed
   the org reasoner at all. Boots the real app (DB_OPTIONAL). Run: node scripts/reason-input-http-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const C = 'inpa', DAY = 86400000, now = Date.now();
const iso = n => new Date(now - n * DAY).toISOString();
const note = (id, author, content, days, type, sensitivity) => ({
  id, orgCode: C, authorId: author, authorName: author, content, type, tag: null,
  sensitivity: sensitivity || 'normal', createdAt: iso(days), aiResponse: null,
});

_loadAllStores({
  orgMeta: { [C]: { orgName: 'I', orgMode: 'sports' } },
  orgUsers: { [C]: {
    coachA: { id: 'coachA', name: 'Alex', role: 'coach',  orgCode: C, status: 'active', leadershipNodeIds: ['teamA'] },
    uma:    { id: 'uma',    name: 'Uma',  role: 'member', orgCode: C, status: 'active' },
    ken:    { id: 'ken',    name: 'Ken',  role: 'member', orgCode: C, status: 'active' },
  } },
  orgNodes: { [C]: {
    teamA: { nodeId: 'teamA', parentId: null, leaderIds: ['coachA'], memberIds: ['uma', 'ken'] },
  } },
  orgNotes: {
    // Uma SHARES three notes over three days, in her own words — should accumulate to a belief.
    u1: note('u1', 'uma', 'Honestly I am exhausted and overwhelmed this week, could use some help.', 8, 'shared'),
    u2: note('u2', 'uma', 'Still shattered and stretched too thin — so much on.', 5, 'shared'),
    u3: note('u3', 'uma', 'Drained again today, overwhelmed by everything on my plate.', 1, 'shared'),
    // Ken writes the SAME sentiment but PRIVATELY (and one sensitive) — must NEVER feed the org reasoner.
    k1: note('k1', 'ken', 'Exhausted and overwhelmed, struggling badly.', 6, 'private'),
    k2: note('k2', 'ken', 'Feeling really low and anxious lately.', 3, 'shared', 'sensitive'),
    k3: note('k3', 'ken', 'Drained and overwhelmed again.', 1, 'private'),
  },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const tok = issueToken('coachA', C, 'coach');
  const agenda = async () => (await fetch(base + '/api/reason/agenda?refresh=1', { headers: { Authorization: `Bearer ${tok}` } })).json();

  try {
    const a = await agenda();
    const umaBeliefs = (a.agenda || []).filter(x => x.subjectId === 'uma');
    ok('1 · a member\'s SHARED notes, read deterministically, become a belief the leader sees', a.ok && umaBeliefs.length > 0);
    ok('1 · …of a load/wellbeing kind, from her own words', umaBeliefs.some(b => /overload|withdraw|momentum|isolation|baseline_shift/.test(b.kind)));
    ok('1 · …raised support-first (it\'s wellbeing, not a task)', umaBeliefs.length > 0 && umaBeliefs.every(b => b.register === 'support'));

    /* PRIVATE + SENSITIVE notes never feed the org reasoner */
    ok('2 · a member\'s PRIVATE notes never become an org belief', !(a.agenda || []).some(x => x.subjectId === 'ken'));
    ok('2 · nothing from a private/sensitive note surfaces to the leader', !/anxious|struggling badly|low and anxious/i.test(JSON.stringify(a)));
  } catch (e) { fail++; console.log('  ✗ HTTP suite threw:', e && e.message); }

  server.close();
  console.log(`\nreason-input-http-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
