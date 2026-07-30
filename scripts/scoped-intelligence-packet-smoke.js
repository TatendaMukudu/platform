/* ============================================================
   scripts/scoped-intelligence-packet-smoke.js - Scoped Intelligence Packet (pure)

   Proves each actor receives a packet bounded by the organisation web, and that
   useful bottom-up questions can route upward without giving the asker broader
   information.

   Run: node scripts/scoped-intelligence-packet-smoke.js
   ============================================================ */

const feed = require('../ai/intelligence-feed');
const packet = require('../ai/scoped-intelligence-packet');

let pass = 0, fail = 0;
const ok = (name, condition) => { if (condition) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗', name); } };

console.log('\n=== Scoped Intelligence Packet ===\n');

const nodes = [
  { nodeId: 'root', leaderIds: ['ceo'], memberIds: [] },
  { nodeId: 'sales', parentId: 'root', leaderIds: ['salesLead'], memberIds: [] },
  { nodeId: 'ops', parentId: 'root', leaderIds: ['opsLead'], memberIds: [] },
  { nodeId: 'salesA', parentId: 'sales', leaderIds: ['salesALead'], memberIds: ['maya'] },
  { nodeId: 'salesB', parentId: 'sales', leaderIds: ['salesBLead'], memberIds: ['niko'] },
  { nodeId: 'opsA', parentId: 'ops', leaderIds: ['opsALead'], memberIds: ['omar'] },
];

const normalized = feed.collect({ extras: [
  { id: 'sales-risk', source: 'extra', kind: 'belief', scope: 'salesA', patternType: 'momentum_drop', polarity: 'risk', priority: 'high', confidence: 'clear', title: 'Sales A needs attention', body: 'A scoped risk is visible.' },
  { id: 'sales-win', source: 'extra', kind: 'surface', scope: 'salesB', patternType: 'recovering', polarity: 'progress', priority: 'medium', confidence: 'clear', title: 'Sales B working well', body: 'A scoped win is visible.' },
  { id: 'ops-risk', source: 'extra', kind: 'belief', scope: 'opsA', patternType: 'overload', polarity: 'risk', priority: 'high', confidence: 'clear', title: 'Ops A needs attention', body: 'A sibling branch risk.' },
  { id: 'maya-self', source: 'extra', kind: 'personal_working_pattern', level: 'personal', subjectId: 'maya', patternType: 'own_work_first', polarity: 'strength', priority: 'medium', confidence: 'emerging', title: 'Maya working pattern', body: 'Personal scoped pattern.' },
] });

const ceo = packet.buildPacket({ actor: { userId: 'ceo' }, nodes, feed: normalized });
const sales = packet.buildPacket({ actor: { userId: 'salesLead' }, nodes, feed: normalized });
const ops = packet.buildPacket({ actor: { userId: 'opsLead' }, nodes, feed: normalized });
const maya = packet.buildPacket({ actor: { userId: 'maya' }, nodes, feed: normalized, questions: [{ text: 'Why do we run approval twice?', kind: 'process_challenge', scopeNodeId: 'salesA' }] });
const niko = packet.buildPacket({ actor: { userId: 'niko' }, nodes, feed: normalized });

const ids = p => p.queue.map(i => i.id).sort();

ok('CEO packet reaches the full web', ceo.role === 'top_leader' && ['root','sales','salesA','salesB','ops','opsA'].every(n => ceo.visibleNodes.includes(n)));
ok('CEO can see sales and ops scoped artifacts', ids(ceo).includes('sales-risk') && ids(ceo).includes('ops-risk'));
ok('branch lead sees own subtree but not sibling branch under CEO', ids(sales).includes('sales-risk') && ids(sales).includes('sales-win') && !ids(sales).includes('ops-risk'));
ok('other branch lead sees own subtree but not sales branch', ids(ops).includes('ops-risk') && !ids(ops).includes('sales-risk'));
ok('least leader only sees their immediate led branch below', packet.buildPacket({ actor: { userId: 'salesALead' }, nodes, feed: normalized }).visibleNodes.join(',') === 'salesA');
ok('member packet includes self and direct parent context, not sibling or grandparent', maya.visibleNodes.includes('salesA') && maya.visibleNodes.includes('sales') && !maya.visibleNodes.includes('root') && !maya.visibleNodes.includes('salesB'));
ok('member can use own personal artifact', ids(maya).includes('maya-self'));
ok('member cannot consume sibling branch artifact', !ids(niko).includes('sales-risk') && ids(niko).includes('sales-win'));
ok('useful member question routes upward safely', maya.upwardQuestions.length === 1 && maya.upwardQuestions[0].routeLeaderIds.includes('salesALead') && maya.upwardQuestions[0].carriesPrivateContent === false);
ok('question artifact enters the packet without granting wider access', ids(maya).some(id => id.startsWith('q_')) && !ids(maya).includes('ops-risk'));
ok('private/sensitive questions do not route upward', packet.buildPacket({ actor: { userId: 'maya' }, nodes, feed: normalized, questions: [{ text: 'private thing', sensitivity: 'private', scopeNodeId: 'salesA' }] }).upwardQuestions.length === 0);
ok('packet output is deterministic', JSON.stringify(packet.buildPacket({ actor: { userId: 'salesLead' }, nodes, feed: normalized })) === JSON.stringify(packet.buildPacket({ actor: { userId: 'salesLead' }, nodes, feed: normalized })));

console.log(`\n=== scoped-intelligence-packet-smoke: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
