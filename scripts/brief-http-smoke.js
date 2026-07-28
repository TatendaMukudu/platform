/* Truth layer — the node-aware BRIEF over HTTP. Proves the web does its four jobs: LEVEL
   (a node leader gets the leader brief, a member the member brief), SCOPE (a leader's reads
   are their own branch — a sibling's person never appears), ROUTE (a member is pointed at a
   real leader), and that every offer is proposal-gated. Boots the real app (DB_OPTIONAL).
   Run: node scripts/brief-http-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const C = 'brfa', DAY = 86400000, now = Date.now(), d = n => now - n * DAY;
const belief = (subjectId, name, scope, kind, polarity) => ({
  id: `${subjectId}::${kind}`, subjectId, subjectName: name, scope, kind, axis: 'momentum', polarity,
  claim: `${name}'s momentum has been running below their own normal.`,
  support: [{ id: subjectId + '1', t: d(9), severity: 'medium', basis: 'x' }, { id: subjectId + '2', t: d(5), severity: 'medium', basis: 'x' }, { id: subjectId + '3', t: d(1), severity: 'high', basis: 'x' }],
  counter: [], careFlag: false, firstSeen: d(9), lastSeen: d(1), whatWouldConfirm: 'x', whatWouldRefute: 'a return toward normal',
});

_loadAllStores({
  orgMeta: { [C]: { orgName: 'B', orgMode: 'sports' } },
  orgUsers: { [C]: {
    coachA: { id: 'coachA', name: 'Alex Stone', role: 'coach',  orgCode: C, status: 'active', leadershipNodeIds: ['teamA'] },
    coachB: { id: 'coachB', name: 'Bev Kaur',   role: 'coach',  orgCode: C, status: 'active', leadershipNodeIds: ['teamB'] },
    joe:    { id: 'joe',    name: 'Joe Park',   role: 'member', orgCode: C, status: 'active' },
    bob:    { id: 'bob',    name: 'Bob True',  role: 'member', orgCode: C, status: 'active' },
  } },
  orgNodes: { [C]: {
    root:  { nodeId: 'root',  parentId: null,  leaderIds: [],         memberIds: [], childNodeIds: ['teamA', 'teamB'] },
    teamA: { nodeId: 'teamA', parentId: 'root', leaderIds: ['coachA'], memberIds: ['joe'] },
    teamB: { nodeId: 'teamB', parentId: 'root', leaderIds: ['coachB'], memberIds: ['bob'] },
  } },
  reasonLedger: { [C]: [ belief('joe', 'Joe', 'teamA', 'momentum_drop', 'risk'), belief('bob', 'Bob', 'teamB', 'momentum_drop', 'risk') ] },
  orgPlaybook: { [C]: [ { fingerprint: 'pb1', status: 'active', statement: 'Thursday video sessions are how we operate.' } ] },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const tok = { coachA: issueToken('coachA', C, 'coach'), coachB: issueToken('coachB', C, 'coach'), joe: issueToken('joe', C, 'member') };
  const brief = async who => (await fetch(base + '/api/brief', { headers: { Authorization: `Bearer ${tok[who]}` } })).json();
  const actions = b => (b.offers || []).map(o => o.action);

  try {
    /* ── 1 · LEVEL — a node leader gets the leader brief + leader offers ── */
    const a = await brief('coachA');
    ok('1 · a node leader is briefed at leader level', a.ok && a.level === 'leader');
    ok('1 · …and offered leader actions (report / set an assessment)', actions(a).includes('report') && actions(a).includes('set_assessment'));

    /* ── 2 · SCOPE — a leader's reads are their own branch only (no cross-branch leak) ── */
    ok('2 · the teamA lead\'s brief speaks to their own person', a.items.some(i => /Joe/.test(i.text)));
    ok('2 · …and never the sibling branch\'s person', !/Bob|teamB/i.test(JSON.stringify(a)));
    const b = await brief('coachB');
    ok('2 · the teamB lead sees their own person, not teamA\'s (leak-safe both ways)', b.items.some(i => /Bob/.test(i.text)) && !/Joe|teamA/i.test(JSON.stringify(b)));

    /* ── 3 · LEVEL — a member gets the member brief + member offers ── */
    const j = await brief('joe');
    ok('3 · a member is briefed at member level', j.ok && j.level === 'member');
    ok('3 · …with a personal-assessment offer, not leader actions', actions(j).includes('self_assessment') && !actions(j).includes('report') && !actions(j).includes('set_assessment'));
    ok('3 · the member\'s reads are about THEM, self-phrased', j.items.some(i => /^your |^you/i.test(i.text)));

    /* ── 4 · ROUTE — the member is pointed at a real leader who can help ── */
    const help = (j.offers || []).find(o => o.action === 'ask_help');
    ok('4 · a member is offered a route to the person above them', !!help && /Alex/.test(help.text));

    /* ── 5 · every offer everywhere is proposal-gated ── */
    ok('5 · all offers require confirmation (the brief proposes, never acts)', [a, b, j].every(x => (x.offers || []).every(o => o.requiresConfirmation === true)));

    /* ── 6 · the opening greets the person ── */
    ok('6 · the opening greets by name + time of day', /(Morning|Afternoon|Evening) Alex/.test(a.opening));
  } catch (e) { fail++; console.log('  ✗ HTTP suite threw:', e && e.message); }

  server.close();
  console.log(`\nbrief-http-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
