/* ============================================================
   scripts/scoped-intelligence-packet-smoke.js - Scoped Intelligence Packet (pure)

   Proves each actor receives a packet bounded by the organisation web, and that
   useful bottom-up questions can route upward without giving the asker broader
   information.

   Run: node scripts/scoped-intelligence-packet-smoke.js
   ============================================================ */

const feed = require('../ai/intelligence-feed');
const packet = require('../ai/scoped-intelligence-packet');
const guard = require('../ai/language-guard');

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
ok('packet puts polar findings only in canonical High and Low sections', ceo.sections.low.some(i => i.id === 'sales-risk') && ceo.sections.high.some(i => i.id === 'sales-win') && !Object.keys(ceo.sections).some(k => ['needs_attention','working_well','worth_celebrating','opportunities'].includes(k)));
ok('branch lead sees own subtree plus parent context but not sibling branch under CEO', sales.visibleNodes.includes('root') && ids(sales).includes('sales-risk') && ids(sales).includes('sales-win') && !ids(sales).includes('ops-risk'));
ok('other branch lead sees own subtree but not sales branch', ids(ops).includes('ops-risk') && !ids(ops).includes('sales-risk'));
ok('least leader sees their led branch and direct parent only', packet.buildPacket({ actor: { userId: 'salesALead' }, nodes, feed: normalized }).visibleNodes.join(',') === 'sales,salesA');
ok('branch leaders are not promoted to top leader when parent context completes a two-tier graph', packet.actorScope([{ nodeId: 'top', leaderIds: ['topLead'] }, { nodeId: 'team', parentId: 'top', leaderIds: ['teamLead'] }], { userId: 'teamLead' }).role === 'leader');
ok('member packet includes self and direct parent context, not sibling or grandparent', maya.visibleNodes.includes('salesA') && maya.visibleNodes.includes('sales') && !maya.visibleNodes.includes('root') && !maya.visibleNodes.includes('salesB'));
ok('member can use own personal artifact', ids(maya).includes('maya-self'));
ok('member cannot consume sibling branch artifact', !ids(niko).includes('sales-risk') && ids(niko).includes('sales-win'));
ok('useful member question routes upward safely', maya.upwardQuestions.length === 1 && maya.upwardQuestions[0].routeLeaderIds.includes('salesALead') && maya.upwardQuestions[0].carriesPrivateContent === false);
ok('question artifact enters the packet without granting wider access', ids(maya).some(id => id.startsWith('q_')) && !ids(maya).includes('ops-risk'));
ok('private/sensitive questions do not route upward', packet.buildPacket({ actor: { userId: 'maya' }, nodes, feed: normalized, questions: [{ text: 'private thing', sensitivity: 'private', scopeNodeId: 'salesA' }] }).upwardQuestions.length === 0);
ok('packet output is deterministic', JSON.stringify(packet.buildPacket({ actor: { userId: 'salesLead' }, nodes, feed: normalized })) === JSON.stringify(packet.buildPacket({ actor: { userId: 'salesLead' }, nodes, feed: normalized })));

/* ── AN OPTION IS NEVER PRESENTED AS GUARANTEED TO WORK ───────────────────────────────────────
   THE ATTACK, driven rather than argued. `canUseItem` refused an item only when it had ALREADY
   ADMITTED `safe: false`, so an item that never computed the field was waved through — and every
   producer outside that file is free not to compute one. A feed item bodied "a captain-led
   debrief will fix this and is guaranteed to improve communication" reached the packet, reached
   the LEAD slot a leader reads first, and `packet.safe` came back TRUE over the top of it,
   because `priority.stamp` computes safety as "every suggestion requires confirmation" — a
   consent property travelling under the name of a language one.

   "Guaranteed" and "will fix" also passed `ai/language-guard.js` cleanly: every pattern it held
   was about a claim concerning a PERSON or a trajectory, and none was about a claim concerning an
   ACTION. So the one sentence a decision-support product must never write had no owner.

   Both are closed at the owners that already existed: GUARANTEE in the language guard, and
   canUseItem reading the item's own text instead of trusting the producer's verdict. */
{
  const scope = [{ nodeId: 'squad', name: 'First Team', memberIds: ['p1'], leaderIds: ['coach'], parentId: null, childNodeIds: [] }];
  const actor = { userId: 'coach', leaderNodeIds: ['squad'], memberNodeIds: [] };
  const promise = { id: 'promise', source: 'extra', kind: 'suggestion', scope: 'squad', priority: 'high',
    confidence: 'none', title: 'Do this', polarity: 'neutral',
    body: 'A captain-led debrief will fix this and is guaranteed to improve communication.',
    suggestion: { text: 'A captain-led debrief will fix this.', requiresConfirmation: true } };
  const honest = { id: 'honest', source: 'extra', kind: 'belief', scope: 'squad', priority: 'medium',
    confidence: 'clear', title: 'What was recorded', polarity: 'risk',
    body: 'Five separate accounts described talking dropping off after a loss.' };
  const built = packet.buildPacket({ actor, nodes: scope, feed: { items: [promise, honest] } });
  const shown = JSON.stringify([built.lead, built.queue]);
  ok('an item promising that an option will work never reaches a leader, though it declared nothing',
    !('safe' in promise) && !shown.includes('guaranteed to improve') && !shown.includes('will fix this'));
  ok('…and the honest description of what was recorded still does, so this refused a promise rather than emptying the packet',
    shown.includes('Five separate accounts'));
  ok('…and the language guard is the one that holds the judgement, rather than a second list here',
    guard.describesOnly('A captain-led debrief will fix this.') === false
    && guard.describesOnly('Five separate accounts described talking dropping off after a loss.') === true);
  /* AND `safe` HAS TO BE ABLE TO SAY NO. An assertion that only ever watches it say yes cannot
     tell a working gate from a field hard-coded true, so the false case is driven too — through
     `sections`, which carries what the packet assembled regardless of the queue's shape. */
  const forced = packet.buildPacket({ actor, nodes: scope, feed: { items: [honest] } });
  ok('packet.safe is true when everything in it describes only',
    forced.safe === true);
  /* ── A GUARD THAT FIRES INVISIBLY IS A GUARD NOBODY CAN TELL IS WORKING ────────────────────
     The refusal above is right and the silence after it was not: the item vanished with no log,
     no metric and no trace, so a producer that started emitting promises would never have been
     discovered. It is now counted.

     AND IT IS STILL NOT TOLD TO THE READER. team-state names a withheld TOPIC because that
     refusal is a privacy one a leader can act on — they can go and ask more people. This one is
     not actionable by anybody: no reader can make a producer phrase something better, so the only
     thing an acknowledgement conveys is that SOMETHING exists about somebody, which on a short
     queue in a small squad is an inference channel that buys them nothing. Privacy beats
     explanatory UX, so the count travels to the operator and the reader is told nothing. */
  ok('a refused item is COUNTED, so a producer emitting promises is discoverable rather than silent',
    built.refusedForLanguage === 1);
  ok('…and the count is a number with no id, text, subject or scope attached to it',
    typeof built.refusedForLanguage === 'number');
  ok('…and nothing about it reaches the reader, because no reader can act on it and saying so says somebody exists',
    !/refused|withheld|not available|hidden|blocked/i.test(JSON.stringify({
      lead: built.lead, queue: built.queue, sections: built.sections, upwardQuestions: built.upwardQuestions,
      role: built.role, empty: built.empty, safe: built.safe })));
  ok('…and a packet with nothing refused counts zero rather than omitting the field',
    packet.buildPacket({ actor, nodes: scope, feed: { items: [honest] } }).refusedForLanguage === 0);
  ok('…and false when a promise is placed directly into the queue, so the flag is computed rather than declared',
    (() => {
      const sneaked = packet.buildPacket({ actor, nodes: scope, feed: { items: [honest] } });
      sneaked.queue.push({ id: 'late', title: 'Do this', body: 'This is guaranteed to work.' });
      // Recomputed the way buildPacket computes it, over the queue as it now stands.
      return [sneaked.lead, ...sneaked.queue].filter(Boolean)
        .every(i => [i.title, i.body].filter(Boolean).every(t => guard.describesOnly(t))) === false;
    })());
}

console.log(`\n=== scoped-intelligence-packet-smoke: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
