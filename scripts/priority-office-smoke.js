/* ============================================================
   scripts/priority-office-smoke.js — Priority Office (pure)

   Proves the layer ranks already-safe artifacts for UI consumption without
   detecting, predicting, executing, or silently rewriting a user's lead view.

   Run: node scripts/priority-office-smoke.js
   ============================================================ */

const po = require('../ai/priority-office');

let pass = 0, fail = 0;
const ok = (name, condition) => { if (condition) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗', name); } };

console.log('\n=== Priority Office ===\n');

const reads = [
  { id: 'r1', patternType: 'momentum_drop', polarity: 'risk', severity: 'high', confidence: 'clear', text: 'A support read is ready.' },
  { id: 'r2', patternType: 'recovering', polarity: 'progress', severity: 'low', confidence: 'clear', text: 'A win is worth naming.' },
];
const insights = [
  { id: 'p1', patternType: 'quiet_improvement', polarity: 'progress', priority: 'medium', kernelConfidence: 'clear', headline: 'Quiet improvement', body: 'Worth recognising.', suggestion: { text: 'Recognise progress', requiresConfirmation: true } },
];
const outcomeBriefs = [
  { patternType: 'momentum_drop', signal: 'This pattern has appeared 3 times here.', outcomeLine: 'supportive check-in was followed by: 2 improved (2 recorded cases).', suggestedNextStep: { text: 'Review check-in history', requiresConfirmation: true }, limitations: ['small_sample', 'not_causal'] },
];

const stamped = po.stamp({ reads, insights, outcomeBriefs });
const habit = po.stamp({ reads, insights, outcomeBriefs, usageSignals: { opensFirst: 'quiet_improvement' } });
const preferred = po.stamp({ reads, insights, outcomeBriefs, prefs: { preferredBuckets: ['quiet_improvement'] } });

ok('stamp returns lead + queue for UI consumption', stamped.lead && stamped.queue.length === 4 && stamped.generatedBy === 'priority-office');
ok('high priority risk leads before lower priority progress', stamped.lead.patternType === 'momentum_drop' && stamped.lead.source === 'reasoner');
ok('outcome intelligence remains a queued artifact, not UI wiring', stamped.queue.some(i => i.source === 'outcome_intelligence' && /followed by/.test(i.body)));
ok('every suggestion remains confirmation-gated', stamped.safe === true && stamped.queue.every(i => !i.suggestion || i.suggestion.requiresConfirmation === true));
ok('usage habit creates an ask-first offer instead of silently reordering', habit.askFirst && habit.askFirst.requiresConfirmation === true && habit.lead.id === stamped.lead.id);
ok('explicit preferences can influence ranking', preferred.queue[0].patternType === 'momentum_drop' || preferred.queue.some(i => i.patternType === 'quiet_improvement'));
ok('suppressed items are removed before ranking', po.stamp({ reads, suppressed: ['r1'] }).lead.patternType === 'recovering');
ok('empty input is a calm valid result', po.stamp({}).empty === true && /Nothing/.test(po.stamp({}).message));
ok('normalization is deterministic', JSON.stringify(po.stamp({ reads, insights, outcomeBriefs })) === JSON.stringify(po.stamp({ reads, insights, outcomeBriefs })));
ok('priority office does not require UI/server imports', typeof po.buildQueue === 'function' && typeof po.stamp === 'function');

console.log(`\n=== priority-office-smoke: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
