'use strict';

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV = 'test';

const fs = require('fs');
const graph = require('../ai/org-graph');
const srv = require('../server');

let pass = 0, fail = 0;
const ok = (name, value) => { if (value) { pass++; console.log('  OK', name); } else { fail++; console.log('  FAIL', name); } };
const sorted = values => [...new Set(values)].sort();

const CODE = 'parity';
const nodes = [
  { nodeId: 'root', childNodeIds: ['mid','sibling'], leaderIds: ['rootLead'], memberIds: [] },
  { nodeId: 'mid', parentId: 'root', childNodeIds: ['leaf','multi'], leaderIds: ['midLead'], memberIds: ['memberCoach'] },
  { nodeId: 'sibling', parentId: 'root', childNodeIds: ['multi'], leaderIds: ['siblingLead'], memberIds: ['siblingMember'] },
  { nodeId: 'leaf', parentId: 'mid', leaderIds: ['leafLead'], memberIds: ['plainMember'] },
  { nodeId: 'multi', parentIds: ['mid', 'sibling'], leaderIds: ['multiLead'], memberIds: ['multiMember'] },
];
const users = Object.fromEntries(['rootLead','midLead','memberCoach','siblingLead','siblingMember','leafLead','plainMember','multiLead','multiMember','super'].map(id => [id, {
  id, role: id === 'super' ? 'superadmin' : (id === 'plainMember' || id.endsWith('Member') ? 'member' : 'coach'), status: 'active',
}]));
srv._loadAllStores({ orgMeta: { [CODE]: {} }, orgUsers: { [CODE]: users }, orgNodes: { [CODE]: Object.fromEntries(nodes.map(n => [n.nodeId, n])) } });

function webPeople(actor) {
  const visible = new Set(graph.visibleNodesFor(nodes, actor));
  const out = [];
  for (const n of nodes) if (visible.has(n.nodeId)) out.push(...(n.leaderIds || []), ...(n.memberIds || []));
  return sorted(out);
}
function difference(actor) {
  const governance = sorted(srv.getVisibleUserIds(CODE, actor));
  const web = webPeople(actor);
  return { governanceOnly: governance.filter(x => !web.includes(x)), webOnly: web.filter(x => !governance.includes(x)) };
}

const expected = {
  rootLead: { governanceOnly: [], webOnly: [] },
  midLead: { governanceOnly: [], webOnly: ['rootLead'] },
  leafLead: { governanceOnly: [], webOnly: ['memberCoach','midLead'] },
  memberCoach: { governanceOnly: ['leafLead','multiLead','multiMember','plainMember'], webOnly: ['midLead','rootLead'] },
  plainMember: { governanceOnly: [], webOnly: ['leafLead','memberCoach','midLead'] },
  super: { governanceOnly: sorted(Object.keys(users)), webOnly: [] },
};

console.log('\n=== W-4 scope parity ===\n');
for (const [actor, want] of Object.entries(expected)) {
  const got = difference(actor);
  console.log(`${actor}: governance-only=[${got.governanceOnly}] web-only=[${got.webOnly}]`);
  ok(`W4-${actor} divergence is explicit`, JSON.stringify(got) === JSON.stringify(want));
}

// This is an inventory, not a migration. It fails when a scope call site is
// added or removed without updating the audited classification in the brief.
const source = fs.readFileSync(require.resolve('../server'), 'utf8').split('\n');
const inventory = [];
for (let i = 0; i < source.length; i++) {
  const line = source[i];
  if (/getVisibleUserIds\(/.test(line)) inventory.push({ line: i + 1, source: 'getVisibleUserIds' });
  if (/(?:_inNode|_leadsNode)\(/.test(line)) inventory.push({ line: i + 1, source: '_inNode/_leadsNode' });
  if (/orgGraph\.(?:canSee|visibleNodesFor|visibleScope)\(/.test(line)) inventory.push({ line: i + 1, source: 'orgGraph' });
}
console.log(`audited scope references: ${inventory.length}`);
for (const row of inventory) console.log(`server.js:${row.line} ${row.source}`);
/* 62 -> 65, September 2026. Three call sites were added deliberately and each is named here,
   because the whole value of this number is that it cannot move by accident:

     _rosterChange x2 (_leadsNode) — a leader may change the roster of a node THEY lead, and may
       not remove a co-leader of it. Scoped to the node, never the subtree: leading the First
       Team does not make somebody a leader of everything beneath it.
     _contactsFor x1 (getVisibleUserIds) — the ADDRESSABLE set folds in the readable one, because
       a leader who can already see a person's record can obviously write their name. The
       reverse does not hold and must never be made to: contacts are names, not records. */
/* 65 -> 66, September 2026. One more, named for the same reason:

     /api/leader/observation x1 (_leadsNode) — a coach may record what they saw about somebody
       ON A SQUAD THEY LEAD. Deliberately NOT a permission check: a broad org-wide permission
       would let somebody write about a player they have never met, and leading the node is the
       thing that actually licenses the account. Scoped to the node, exactly as the roster is. */
/* 66 -> 71, September 2026. Attached material and the graphs drawn from it. FIVE call sites, all
   _leadsNode, and every one of them answers the same question: material attached to a squad
   object reaches everybody in that squad, so who may put it there and who may see the AGGREGATE
   picture of how it landed are both scoped to leading that node.

   Deliberately _leadsNode and not a permission, for the reason /api/leader/observation gives: an
   org-wide permission would let somebody act on a squad they have never met. Leading the node is
   the thing that licenses it.

     _mayAttach x1 — attaching to a SQUAD object is a leader's act. Attaching to your own object
       is anybody's, and that branch takes no scope call at all.
     /api/materials/:id/understanding x1 — the report of how it landed is for whoever attached it
       or whoever leads the group. A player reading it would be reading their squad.
     /api/materials/:id/recompose x1 — recreating somebody else's briefing is not the same as
       reading it and asking about it, which any member of the audience may do.
     _spreadChart x1 — the same rule as the report, applied to the picture of it. A chart is the
       report with the argument removed, so it cannot be the looser surface.
     _timelineChart x1 — a suite forced this one open. Every player would otherwise have seen a
       dot for each teammate who engaged: a count of their squad drawn from nothing they were
       shown, and in a small squad a list of who was in the room. The dots are the leader's; the
       dates the focus itself carries are everybody's. */
/* 71 -> 69, September 2026. TWO REMOVED, on a founder decision, and a number going DOWN is the
   rarer and more interesting direction for this ledger.

   "Why can't a squad see how many of their peers engaged?" The report of how material landed, and
   the chart of it, were gated on leading the group. That was a SECOND RULE DOING THE COHORT
   FLOOR'S JOB BADLY: the floor — five either side, so no reader can put the names back — is what
   makes a count of people safe to show, and a role check stacked on top of it protects nothing
   further while withholding from a squad a nameless fact about that squad.

     /api/materials/:id/understanding -1 — reading how it landed is now everybody's.
     _spreadChart -1 — and so is the picture of it, because a chart cannot be the tighter surface
       than the report it draws.

   The two that REMAIN on material are authorship, not readership: _mayAttach (putting material in
   front of a squad) and /api/materials/:id/recompose (recreating somebody else's briefing).
   _timelineChart keeps its call but now reads the cohort floor rather than the role, and the
   per-person dots it drew were replaced by a single count for everybody — one dated dot per
   person carried WHEN each answered, which in a squad is often enough to say who. */
ok('W4 inventory names every current scope reference', inventory.length === 69 && inventory.every(r => Number.isInteger(r.line) && r.source));

console.log('\nMigration law: BRIDGE never; GATE governance AND Web; ENUMERATE/FILTER migrate later; WEB re-test only.');
console.log(`\n=== scope-parity-smoke: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
