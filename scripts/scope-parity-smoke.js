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
ok('W4 inventory names every current scope reference', inventory.length === 62 && inventory.every(r => Number.isInteger(r.line) && r.source));

console.log('\nMigration law: BRIDGE never; GATE governance AND Web; ENUMERATE/FILTER migrate later; WEB re-test only.');
console.log(`\n=== scope-parity-smoke: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
