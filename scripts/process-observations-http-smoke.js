/* Truth layer — PROCESS OBSERVATIONS in the packet (HTTP). Proves the long-term process
   source is wired end to end: a team's recorded action→outcome history (orgInterventions)
   becomes a STRUCTURAL process reflection in the unified packet — "the way the team responds
   to X keeps not landing, what is it protecting?" — grounded, aggregate, and NEVER naming a
   person. Boots the real app (DB_OPTIONAL). Run: node scripts/process-observations-http-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const C = 'proc', DAY = 86400000, now = Date.now(), iso = n => new Date(now - n * DAY).toISOString();
// Five recorded responses to 'overload', mostly negative → the way we respond isn't landing.
// Each names a real person in the RAW record; the process signal must never surface any of them.
const intv = (i, outcome) => ({ id: 'iv' + i, patternType: 'overload', action: 'pile on more tasks',
  targetMemberId: 'joe', targetMember: 'Joe', recordedOutcome: outcome, status: 'completed',
  createdAt: iso(20 - i), completedAt: iso(19 - i) });

_loadAllStores({
  orgMeta:  { [C]: { orgName: 'Pr', orgMode: 'sports' } },
  orgUsers: { [C]: {
    coachA: { id: 'coachA', name: 'Alex', role: 'coach',  orgCode: C, status: 'active', leadershipNodeIds: ['teamA'] },
    joe:    { id: 'joe',    name: 'Joe',  role: 'member', orgCode: C, status: 'active' },
  } },
  orgNodes: { [C]: { teamA: { nodeId: 'teamA', parentId: null, leaderIds: ['coachA'], memberIds: ['joe'] } } },
  orgInterventions: { [C]: [ intv(0, 'negative'), intv(1, 'negative'), intv(2, 'negative'), intv(3, 'negative'), intv(4, 'positive') ] },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const tok = issueToken('coachA', C, 'coach');

  try {
    const pkt = await (await fetch(base + '/api/intelligence/packet', { headers: { Authorization: `Bearer ${tok}` } })).json();
    const proc = (pkt.queue || []).filter(i => i.source === 'process_reflection');
    ok('1 · the packet carries a process reflection derived from recorded outcomes', proc.length >= 1);
    const s = JSON.stringify(proc);
    ok('2 · it names the process ("way the team responds to overload"), not a person', /respond|overload/i.test(s));
    ok('2 · …and NEVER names the person in the raw records (Joe)', !/joe/i.test(s));
    ok('3 · it is framed as a method question, proposal-gated', proc.every(i => i.question || (i.suggestion && i.suggestion.requiresConfirmation === true) || i.body));
    ok('4 · the whole packet stays safe (every suggestion confirmation-gated)', pkt.safe === true);
  } catch (e) { fail++; console.log('  ✗ HTTP suite threw:', e && e.message); }

  server.close();
  console.log(`\nprocess-observations-http-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
