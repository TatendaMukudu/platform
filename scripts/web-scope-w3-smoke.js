'use strict';

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV = 'test';

const graph = require('../ai/org-graph');
const packet = require('../ai/scoped-intelligence-packet');
const srv = require('../server');
const workspace = require('../lib/workspace');

let pass = 0, fail = 0;
const ok = (name, value) => { if (value) { pass++; console.log('  OK', name); } else { fail++; console.log('  FAIL', name); } };

const nodes = [
  { nodeId: 'root', leaderIds: ['rootLead'], memberIds: [] },
  { nodeId: 'midA', parentId: 'root', leaderIds: ['midLead'], memberIds: [] },
  { nodeId: 'midB', parentId: 'root', leaderIds: ['otherLead'], memberIds: ['otherMember'] },
  { nodeId: 'leaf', parentId: 'midA', leaderIds: ['leafLead'], memberIds: ['leafMember'] },
  { nodeId: 'leaf2', parentIds: ['midA', 'midB'], leaderIds: ['multiLead'], memberIds: [] },
];
const g = graph.buildGraph(nodes);
const scope = ids => graph.visibleScope(g, { leaderNodeIds: ids });

console.log('\n=== W-3 Web scope ===\n');
ok('W3-1 leader gains direct parent', scope(['leaf']).join(',') === 'leaf,midA');
ok('W3-2 direct parent does not grant sibling subtree', !scope(['leaf']).includes('leaf2') && !scope(['leaf']).includes('midB'));
ok('W3-3 direct parent does not grant grandparent', !scope(['leaf']).includes('root'));
ok('W3-4 member scope remains node plus direct parent', graph.visibleScope(g, { memberNodeIds: ['leaf'] }).join(',') === 'leaf,midA');
ok('W3-5 multi-parent leader gains both parents without either subtree', scope(['leaf2']).join(',') === 'leaf2,midA,midB');
ok('W3-6 root leader gains no extra node beyond its existing subtree', scope(['root']).join(',') === 'leaf,leaf2,midA,midB,root');

const rootRole = packet.actorScope(nodes, { userId: 'rootLead' });
const twoTier = [
  { nodeId: 'twoRoot', leaderIds: ['twoRootLead'], memberIds: [] },
  { nodeId: 'twoLeaf', parentId: 'twoRoot', leaderIds: ['twoLeafLead'], memberIds: [] },
];
const midRole = packet.actorScope(twoTier, { userId: 'twoLeafLead' });
ok('W3-7 only a leader of a parentless node is top leader', rootRole.role === 'top_leader' && midRole.role === 'leader');

const cyclic = graph.buildGraph([
  { nodeId: 'a', parentId: 'b', leaderIds: ['cycleLead'] },
  { nodeId: 'b', parentId: 'a' },
]);
ok('W3-8 cycles terminate with a finite unique scope', graph.visibleScope(cyclic, { leaderNodeIds: ['a'] }).join(',') === 'a,b');

const CODE = 'w3';
srv._loadAllStores({
  orgMeta: { [CODE]: { professionals: [{ userId: 'pro', responsibility: 'support' }], safeguardingLeadId: 'safe' } },
  orgUsers: { [CODE]: {
    leafLead: { id: 'leafLead', role: 'coach', status: 'active' },
    leafMember: { id: 'leafMember', role: 'member', status: 'active' },
    parentMember: { id: 'parentMember', role: 'member', status: 'active' },
    siblingMember: { id: 'siblingMember', role: 'member', status: 'active' },
    pro: { id: 'pro', role: 'member', status: 'active' }, safe: { id: 'safe', role: 'member', status: 'active' },
  } },
  orgNodes: { [CODE]: {
    parent: { nodeId: 'parent', leaderIds: [], memberIds: ['parentMember'] },
    child: { nodeId: 'child', parentId: 'parent', leaderIds: ['leafLead'], memberIds: ['leafMember'] },
    sibling: { nodeId: 'sibling', parentId: 'parent', leaderIds: [], memberIds: ['siblingMember'] },
  } },
});
const people = srv.getVisibleUserIds(CODE, 'leafLead');
ok('W3-9 parent Web scope adds no parent or sibling person identity', people.includes('leafMember') && !people.includes('parentMember') && !people.includes('siblingMember'));
const privateItem = workspace.buildItem({ id: 'private-parent', org: CODE, ownerId: 'parentMember', scope: 'personal_private', text: 'I am struggling with a private parent concern' });
srv._interpretInput(CODE, { text: privateItem.text, ownerId: 'parentMember', subjectId: 'parentMember', item: privateItem });
const privateExists = (srv.evidenceLog[CODE] || []).some(e => e.visibility === 'private' && e.ownerRef === 'parentMember');
// Deliberately hostile legacy shape: even a private envelope incorrectly
// marked promoted must be stopped by the organisational-purpose gate itself.
srv.evidenceLog[CODE].push({ id: 'private-promoted-hostile', status: 'active', visibility: 'private', promoted: true, ownerRef: 'parentMember', subjectId: 'parentMember', type: 'statement' });
ok('W3-10 parent Web scope admits no private evidence', privateExists && !srv._kernelEvidence(CODE, { purpose: 'organisation_reasoning', viewerId: 'leafLead' }).some(e => e.ownerRef === 'parentMember'));
ok('W3-11 responsibility metadata adds no Web node', graph.visibleNodesFor(srv.orgNodes[CODE], 'pro').length === 0 && graph.visibleNodesFor(srv.orgNodes[CODE], 'safe').length === 0);
ok('W3-12 another tenant node cannot enter this graph', !graph.visibleScope(g, { leaderNodeIds: ['foreign'] }).includes('foreign'));

console.log(`\n=== web-scope-w3-smoke: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
