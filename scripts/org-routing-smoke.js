/* Truth layer — NODE-AWARE ROUTING (pure). Proves unresolved work routes to an EXPLICIT
   owner (never inferred from ancestry), escalates to the nearest leader when unowned, flags
   multi-parent-with-no-owner as a CONFLICT (surfaced to all, resolved by nobody), dedupes a
   person reached via several paths, and rolls audience-safe summaries UP a leader's own
   subtree while never showing a sibling branch. No DB / AI / IO. Run: node scripts/org-routing-smoke.js */

const G = require('../ai/org-graph.js');
const R = require('../ai/org-routing.js');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

/*  root(ceo)
      ├─ teamA(coachA)
      │    ├─ trainers(tl, member joe)   ← also child of psych (multi-parent)
      │    ├─ kit(—)                      (no leader)
      │    └─ shared(—)                   ← also child of psych (multi-parent, no leader)
      ├─ teamB(coachB)
      └─ psych(psychLead)                                                        */
const graph = G.buildGraph([
  { nodeId: 'root', parentId: null, leaderIds: ['ceo'] },
  { nodeId: 'teamA', parentId: 'root', leaderIds: ['coachA'] },
  { nodeId: 'teamB', parentId: 'root', leaderIds: ['coachB'] },
  { nodeId: 'psych', parentId: 'root', leaderIds: ['psychLead'] },
  { nodeId: 'trainers', parentIds: ['teamA', 'psych'], leaderIds: ['tl'], memberIds: ['joe'] },
  { nodeId: 'kit', parentId: 'teamA', leaderIds: [] },
  { nodeId: 'shared', parentIds: ['teamA', 'psych'], leaderIds: [] },
]);
const items = [
  { id: 'i1', label: 'game plan', urgency: 'high', subjectNodeId: 'trainers', ownerUserId: 'joe' },     // explicit owner
  { id: 'i2', label: 'availability', urgency: 'medium', subjectNodeId: 'trainers' },                     // no owner → node leader tl
  { id: 'i3', label: 'kit order', urgency: 'low', subjectNodeId: 'kit' },                                // no leader → escalate to coachA
  { id: 'i4', label: 'shared protocol', urgency: 'high', subjectNodeId: 'shared' },                      // multi-parent, no owner → CONFLICT
  { id: 'i5', label: 'orphan task', urgency: 'normal', subjectNodeId: null },                            // no node → unassigned
];
const routes = R.buildRoutes(graph, items);
const route = id => routes.find(r => r.itemId === id);

/* ── 1 · explicit owner wins (never inferred) ── */
ok('1 · an item with an explicit owner routes to that owner', route('i1').via === 'owner' && route('i1').targets[0] === 'joe' && route('i1').conflict === false);

/* ── 2 · a leader ON the node owns an unowned item ── */
ok('2 · an unowned item routes to the node\'s own leader', route('i2').via === 'node_leader' && route('i2').targets[0] === 'tl');

/* ── 3 · escalate to the nearest leader above when the node has none ── */
ok('3 · a leaderless node escalates to the nearest leader above (single parent → no conflict)', route('i3').via === 'escalated' && route('i3').targets[0] === 'coachA' && route('i3').conflict === false);

/* ── 4 · MULTI-PARENT + no owner = a conflict, surfaced to all, decided by nobody ── */
ok('4 · a multi-parent unowned item is a CONFLICT routed to both parents\' leaders', route('i4').conflict === true && route('i4').targets.join() === 'coachA,psychLead');
const conf = R.conflicts(routes);
ok('4 · conflicts are reported for a human to assign a primary owner (not inferred)', conf.length === 1 && conf[0].itemId === 'i4' && /a leader needs to decide/i.test(conf[0].reason) && conf[0].sharedBetween.join() === 'psych,teamA');

/* ── 5 · a node-less item is first-class unassigned (needs an owner) ── */
ok('5 · an item with no node is unassigned, needing an owner (never guessed)', route('i5').via === 'unassigned' && route('i5').needsOwner === true && route('i5').targets.length === 0);

/* ── 6 · inbox — deduped, urgency-ordered ── */
ok('6 · joe\'s inbox has the item they own', R.inboxFor(routes, 'joe').map(x => x.itemId).join() === 'i1');
const coachAInbox = R.inboxFor(routes, 'coachA');
ok('6 · coachA\'s inbox gathers escalations to them, most-urgent first, deduped', coachAInbox.map(x => x.itemId).join() === 'i4,i3');
ok('6 · psychLead only sees the conflict escalated to them (not sibling-only work)', R.inboxFor(routes, 'psychLead').map(x => x.itemId).join() === 'i4');
ok('6 · a routed item tells the recipient who ELSE shares it (transparency, still one entry)', coachAInbox.find(x => x.itemId === 'i4').sharedWith.includes('psychLead'));

/* ── 7 · rollups climb a leader's OWN subtree; a sibling branch is never included ── */
const rollA = R.rollupFor(graph, items, { leaderNodeIds: ['teamA'] });
ok('7 · coachA\'s rollup covers their whole subtree (trainers, kit, shared)', rollA.total === 4 && rollA.byUrgency.high === 2 && rollA.unassigned >= 1);
const rollB = R.rollupFor(graph, items, { leaderNodeIds: ['teamB'] });
ok('7 · a sibling branch lead sees NONE of the other branch\'s work (isolation)', rollB.total === 0 && rollB.items.length === 0);
const rollTop = R.rollupFor(graph, items, { leaderNodeIds: ['root'] });
ok('7 · the top leader\'s rollup spans everything beneath them', rollTop.total === 4);

/* ── 8 · audience-safe output — labels + urgency + counts, no raw ids ── */
ok('8 · rollups + inbox expose only safe labels/urgency (no evidence, no owner leakage of others)', !/ownerUserId|subjectNodeId|evidence|contentHash/.test(JSON.stringify([rollA, coachAInbox])));
ok('8 · determinism: identical inputs → identical routes', JSON.stringify(R.buildRoutes(graph, items)) === JSON.stringify(routes));

console.log(`\norg-routing-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
