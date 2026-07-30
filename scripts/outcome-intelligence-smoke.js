/* ============================================================
   scripts/outcome-intelligence-smoke.js — Outcome Intelligence (pure)

   Proves the layer summarizes recorded action/outcome history without prediction,
   diagnosis, causation, execution, or invented evidence.

   Run: node scripts/outcome-intelligence-smoke.js
   ============================================================ */

const oi = require('../ai/outcome-intelligence');

let pass = 0, fail = 0;
const ok = (name, condition) => { if (condition) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗', name); } };

console.log('\n=== Outcome Intelligence ===\n');

const records = [
  { id: 'a1', patternType: 'momentum_drop', interventionType: 'supportive_checkin', outcome: 'improved', evidenceRefs: ['e1'] },
  { id: 'a2', patternType: 'momentum_drop', interventionType: 'supportive_checkin', outcome: 'steady', evidenceRefs: ['e2'] },
  { id: 'a3', patternType: 'momentum_drop', interventionType: 'supportive_checkin', outcome: 'worsened', evidenceRefs: ['e3'] },
  { id: 'a4', patternType: 'momentum_drop', interventionType: 'recognise', outcome: 'improved', evidenceRefs: ['e4'] },
  { id: 'a5', patternType: 'withdrawal', interventionType: 'peer_checkin', outcome: 'unclear', evidenceRefs: ['e5'] },
];

const summary = oi.summarize(records, { patternType: 'momentum_drop' });
const pat = summary.patterns[0];
const best = oi.bestForPattern(summary, 'momentum_drop');
const brief = oi.earlySignalBrief({ patternType: 'momentum_drop', signalCount: 3, outcomeSummary: summary, scopeLabel: 'in this group' });

ok('summarize returns one requested pattern', summary.patterns.length === 1 && pat.patternType === 'momentum_drop');
ok('interventions are counted honestly', pat.totalCases === 4 && best.total === 3 && best.improved === 1 && best.steady === 1 && best.worsened === 1);
ok('evidence refs are deduped and retained for audit', best.evidenceRefs.join(',') === 'e1,e2,e3');
ok('outcome line is historical, not predictive', /was followed by/.test(best.line) && oi.assertSafeText(best.line).ok);
ok('early brief includes signal count and outcome history', /appeared 3 times/.test(brief.signal) && /recorded case/.test(brief.outcomeLine));
ok('suggested next step is confirmation-gated', brief.suggestedNextStep && brief.suggestedNextStep.requiresConfirmation === true);
ok('limitations preserve small sample / not causal', brief.limitations.includes('not_causal') && brief.limitations.includes('small_sample'));
ok('missing history is explicit and does not invent a suggestion', !oi.earlySignalBrief({ patternType: 'plateau', outcomeSummary: summary }).suggestedNextStep);
ok('outcome aliases normalize into bounded labels', oi.normalizeOutcome('helped') === 'improved' && oi.normalizeOutcome('declined') === 'worsened');
ok('module output is deterministic', JSON.stringify(oi.summarize(records)) === JSON.stringify(oi.summarize(records)));

console.log(`\n=== outcome-intelligence-smoke: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
