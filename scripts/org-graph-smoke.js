/* Truth layer — ORG INFORMATION-WEB scoping (pure). Proves the asymmetric visibility: a
   parent sees its ENTIRE subtree (to the furthest descendant); a child sees ONLY its
   direct parent (not siblings, not other branches, not grandparents); multi-parent nodes
   are honoured; routing walks up to the nearest leader; cycles are safe. No DB / AI / IO.
   Run: node scripts/org-graph-smoke.js */

const G = require('../ai/org-graph.js');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

/*  root
      ├─ teamA        (leader: coachA)
      │    ├─ trainers   (leader: trainerLead, member: joe)   ← also a child of psych (multi-parent)
      │    └─ psych      (leader: psychLead)
      └─ teamB        (leader: coachB)                        */
const nodes = [
  { nodeId: 'root',     parentId: null,   leaderIds: ['ceo'],        memberIds: [] },
  { nodeId: 'teamA',    parentId: 'root',  leaderIds: ['coachA'],     memberIds: [] },
  { nodeId: 'teamB',    parentId: 'root',  leaderIds: ['coachB'],     memberIds: [] },
  { nodeId: 'trainers', parentIds: ['teamA', 'psych'], leaderIds: ['trainerLead'], memberIds: ['joe'] },
  { nodeId: 'psych',    parentId: 'teamA', leaderIds: ['psychLead'],  memberIds: [] },
];
const graph = G.buildGraph(nodes);

/* ── 1 · graph construction (multi-parent honoured both ways) ── */
ok('1 · trainers has TWO parents (teamA + psych)', [...graph.parentsOf.get('trainers')].sort().join() === 'psych,teamA');
ok('1 · descendants of root reach every node', (() => { const d = G.descendants(graph, 'root'); return ['teamA', 'teamB', 'trainers', 'psych'].every(n => d.has(n)); })());

/* ── 2 · a PARENT sees its whole subtree ── */
const coachA = G.visibleNodesFor(nodes, 'coachA');
ok('2 · a team lead sees its own node + all descendants (trainers, psych)', coachA.includes('teamA') && coachA.includes('trainers') && coachA.includes('psych'));
ok('2 · a team lead does NOT see a sibling branch (teamB)', !coachA.includes('teamB'));
const ceo = G.visibleNodesFor(nodes, 'ceo');
ok('2 · the top leader sees the entire organisation', ['root', 'teamA', 'teamB', 'trainers', 'psych'].every(n => ceo.includes(n)));

/* ── 3 · a CHILD sees ONLY its direct parent(s) ── */
const joe = G.visibleNodesFor(nodes, 'joe');
ok('3 · a member sees their own node + its direct parents (teamA, psych) — multi-parent', joe.includes('trainers') && joe.includes('teamA') && joe.includes('psych'));
ok('3 · a member does NOT see grandparents (root), siblings, or other branches (teamB)', !joe.includes('root') && !joe.includes('teamB'));

/* ── 4 · tenant/branch isolation between siblings ── */
const coachB = G.visibleNodesFor(nodes, 'coachB');
ok('4 · one branch lead sees nothing of the other branch', coachB.includes('teamB') && !coachB.includes('teamA') && !coachB.includes('trainers'));

/* ── 5 · canSee — org-wide (null scope) is visible to all; a scoped item follows the web ── */
ok('5 · null-scoped (org-wide) evidence is visible to everyone', G.canSee(coachB, null) === true && G.canSee(joe, null) === true);
ok('5 · evidence scoped to a node is hidden from actors outside that scope', G.canSee(coachB, 'trainers') === false && G.canSee(coachA, 'trainers') === true);
ok('5 · a member cannot see evidence scoped above their parent', G.canSee(joe, 'root') === false && G.canSee(joe, 'teamA') === true);

/* ── 6 · routing — a question about a node goes to the nearest leader at/above it ── */
ok('6 · a question about a led node routes to that node\'s leader', G.routeTarget(graph, 'trainers').leaderIds.includes('trainerLead'));
const leaderless = G.buildGraph(nodes.concat([{ nodeId: 'kit', parentId: 'teamA', leaderIds: [] }]));
ok('6 · a question about a leaderless node walks UP to the nearest leader', G.routeTarget(leaderless, 'kit').leaderIds.includes('coachA'));
ok('6 · a node with no leader anywhere above routes to nobody (first-class, not guessed)', G.routeTarget(G.buildGraph([{ nodeId: 'x', parentId: null, leaderIds: [] }]), 'x').nodeId === null);

/* ── 7 · cycle safety + determinism ── */
const cyclic = G.buildGraph([{ nodeId: 'a', parentId: 'b' }, { nodeId: 'b', parentId: 'a' }]);
ok('7 · a cycle does not hang (descendants terminates)', (() => { const d = G.descendants(cyclic, 'a'); return d.has('b') && d.has('a'); })());
ok('7 · scope output is deterministic + sorted', JSON.stringify(G.visibleNodesFor(nodes, 'coachA')) === JSON.stringify([...G.visibleNodesFor(nodes, 'coachA')].sort()));

/* ── 8 · empty / no-structure safety (the default that preserves behaviour) ── */
ok('8 · an actor in an org with no nodes has an empty scope (so null-scoped stays org-wide)', JSON.stringify(G.visibleNodesFor([], 'anyone')) === '[]');
ok('8 · an unknown user resolves to no scope', JSON.stringify(G.visibleNodesFor(nodes, 'ghost')) === '[]');

console.log(`\norg-graph-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
