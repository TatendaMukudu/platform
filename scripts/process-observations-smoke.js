/* Truth layer — PROCESS OBSERVATIONS (pure). Proves the long-term process source: recorded
   action→outcome recurrence becomes STRUCTURAL process signals — a way of working that
   reliably helps (protect) or repeatedly doesn't land (lighten) — grounded, aggregate, and
   NEVER about a person. It composes with outcome-intelligence (in) and process-reflection
   (out). No DB / AI / IO. Run: node scripts/process-observations-smoke.js */

const PO = require('../ai/process-observations.js');
const OI = require('../ai/outcome-intelligence.js');
const PR = require('../ai/process-reflection.js');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

// Build recorded intervention→outcome history (the orgInterventions shape, mapped for OI):
// a pattern the team responds to WELL (mostly positive), one it responds to POORLY (mostly
// negative), one MIXED (must stay quiet), and one THIN (below the aggregate floor).
const rec = (patternType, action, outcome, i) => ({ id: `${patternType}_${i}`, patternType, interventionType: action, outcome, subjectId: `person${i}` });
const records = [
  ...[0,1,2,3,4,5].map(i => rec('momentum_drop', 'supportive checkin', i < 5 ? 'improved' : 'worsened', i)),      // 5 improved / 1 worsened → strength
  ...[0,1,2,3,4].map(i => rec('overload', 'add more tasks', i < 1 ? 'improved' : 'worsened', 'o'+i)),             // 1 improved / 4 worsened → friction
  ...[0,1,2,3].map(i => rec('disengagement', 'a nudge', i < 2 ? 'improved' : 'worsened', 'd'+i)),                 // 2 / 2 → mixed → quiet
  ...[0,1].map(i => rec('isolation', 'a chat', 'improved', 'is'+i)),                                              // only 2 cases → below floor → quiet
];
const summary = OI.summarize(records);
const signals = PO.fromOutcomeSummary(summary, { minCases: 4, strongRate: 0.6 });
const byPattern = k => signals.find(s => s.id === 'po_' + k);

/* ── 1 · a reliably-helpful response becomes a STRENGTH worth protecting ── */
const good = byPattern('momentum_drop');
ok('1 · a way of working that reliably helps → a strength signal', good && good.polarity === 'strength' && good.kind === 'successful_support');
ok('1 · …grounded in the recorded counts, not invented', good && /5 improved/.test(good.basis[0]) && good.occurrences === 6);

/* ── 2 · a repeatedly-unhelpful response becomes FRICTION worth a lighter version ── */
const bad = byPattern('overload');
ok('2 · a way of working that repeatedly doesn\'t land → a friction signal', bad && bad.polarity === 'friction' && bad.kind === 'repeated_exception');

/* ── 3 · NEVER NAG — a mixed or thin picture stays silent ── */
ok('3 · a mixed response (2 improved / 2 worsened) yields nothing', !byPattern('disengagement'));
ok('3 · a thin response (below the aggregate floor) yields nothing', !byPattern('isolation'));

/* ── 4 · STRUCTURAL — no signal ever names or points at a person ── */
ok('4 · no emitted signal carries a subjectId', signals.every(s => s.subjectId == null));
ok('4 · every signal is guarded aggregate + not-causal', signals.every(s => PO.assertStructural(s).ok && s.limitations.includes('not_causal')));
ok('4 · a person id never appears anywhere in the output', !/person\d|person o|person d|person is/i.test(JSON.stringify(signals)));

/* ── 5 · it composes with process-reflection into a method-not-person question ── */
const reflected = PR.reflect(signals);
ok('5 · the signals reflect into process-not-person questions', reflected.reflections.length >= 2 && reflected.reflections.every(r => r.processNotPerson && r.requiresConfirmation));
ok('5 · the friction reflection challenges the METHOD, never the person', reflected.reflections.some(r => r.polarity === 'friction') && reflected.reflections.every(r => PR.assertProcessSafe(r).ok));

/* ── 6 · determinism ── */
ok('6 · identical summary → identical signals', JSON.stringify(PO.fromOutcomeSummary(summary)) === JSON.stringify(PO.fromOutcomeSummary(summary)));

console.log(`\nprocess-observations-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
