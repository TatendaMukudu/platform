/* Truth layer — the NO-PREDICTION / NO-DIAGNOSIS guard (pure). Attacks it with predictive
   and diagnostic phrasings (all must be caught) AND defends it with the system's OWN
   deterministic outputs — the reasoner, brief, and report lines that are the fallback — which
   must all PASS, or the guard would reject its own safe floor. No DB / AI / IO.
   Run: node scripts/language-guard-smoke.js */

const G = require('../ai/language-guard.js');
const reason = require('../ai/reason.js');
const brief = require('../ai/brief.js');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

/* ── 1 · prediction / forecasting is caught ── */
const predictive = [
  'His momentum will likely worsen before the final.',
  'They are trending toward a drop in form.',
  'This is expected to lead to more absences.',
  'If this continues, the group will struggle.',
  'She is on track to fall behind her peers.',
  'The team is at risk of declining next month.',
  'I predict a dip in the coming weeks.',
  'Performance is going to drop.',
  'They are likely to disengage.',
  'This could lead to burnout.',
];
predictive.forEach((t, i) => ok(`1.${i + 1} · caught: "${t.slice(0, 42)}…"`, G.predictsOrDiagnoses(t)));

/* ── 1b · bald prophecies about people are caught without banning future tense ── */
const personProphecies = [
  'This player will quit by December.',
  'She will drop out before the end of term.',
  'He will fail the next assessment.',
  'This member will burn out.',
  'They will leave the squad.',
  'Marcus will decline over the next month.',
  "He won't recover in time.",
  'The player will quit by December.',
  'Your player will quit by December.',
  'She will disengage before the next check-in.',
];
personProphecies.forEach((t, i) => ok(`1b.${i + 1} · caught: "${t}"`, G.predictsOrDiagnoses(t)));

const systemFutures = [
  'The assessment will open tomorrow.',
  'The system will request another response.',
  "The report will include last month's sessions.",
  'IntelliQ will show the trend once there is enough history.',
  'This check-in will take about two minutes.',
  'The reminder will be sent on Friday morning.',
];
systemFutures.forEach((t, i) => ok(`1c.${i + 1} · system fact allowed: "${t}"`, G.describesOnly(t)));

/* ── 2 · diagnosis is caught ── */
['He seems clinically depressed.', 'This looks like an anxiety disorder.', 'Possible ADHD.', 'A diagnosis of burnout.'].forEach((t, i) =>
  ok(`2.${i + 1} · caught: "${t}"`, G.predictsOrDiagnoses(t)));

/* ── 3 · honest DESCRIPTIVE language passes (past / present, what recurred) ── */
const descriptive = [
  'Pulling back is showing up across 17 people in the Under-15s — worth looking at as a group.',
  "Joe's momentum has been running below his own normal — three check-ins now.",
  'The same concern keeps recurring for Ada.',
  'A supportive check-in — listen first, before anything task-related.',
  'The cup final is Saturday — a natural moment to have a quiet word before then.',
  'Growth has flattened despite steady effort.',
];
descriptive.forEach((t, i) => ok(`3.${i + 1} · passes descriptive: "${t.slice(0, 38)}…"`, G.describesOnly(t)));

[
  'Signals indicate elevated disengagement risk.',
  'Attendance has dropped in three of the last four weeks.',
  'This pattern has appeared twice before in this squad.',
  'Two accounts disagree about what happened on Saturday.',
].forEach((t, i) => ok(`3b.${i + 1} · grounded observation allowed`, G.describesOnly(t)));

/* ── 4 · the system's OWN deterministic outputs pass (the guard never rejects its floor) ── */
const now = Date.parse('2026-07-28T09:00:00Z');
const agenda = reason.reason({ now, observations: [
  { id: 'a', subjectId: 'joe', subjectName: 'Joe', kind: 'momentum_drop', severity: 'high', basis: 'x', t: now - 6 * 86400000 },
  { id: 'b', subjectId: 'joe', subjectName: 'Joe', kind: 'momentum_drop', severity: 'high', basis: 'x', t: now - 3 * 86400000 },
  { id: 'c', subjectId: 'joe', subjectName: 'Joe', kind: 'momentum_drop', severity: 'high', basis: 'x', t: now - 1 * 86400000 },
] }).agenda;
ok('4 · the reasoner spoken floor is prediction-free', G.describesOnly(reason.speak(agenda, { now })));
ok('4 · a reasoner claim is prediction-free', G.describesOnly(agenda[0] && agenda[0].claim));
ok('4 · a brief opening (leader) is prediction-free', G.describesOnly(brief.compose({ level: 'leader', name: 'Tyler', reads: [{ text: 'x', polarity: 'risk' }] }).opening));
ok('4 · a brief opening (member) is prediction-free', G.describesOnly(brief.compose({ level: 'member', name: 'Sam', reads: [] }).opening));

let threw = false;
for (const value of ['', null, undefined, 0, {}, [], 'a'.repeat(5000)]) {
  try { G.predictsOrDiagnoses(value); } catch (_) { threw = true; }
}
ok('5 · guard is total for empty and non-string input', !threw);
ok('5 · empty input is not a prediction', G.predictsOrDiagnoses('') === false);

console.log(`\nlanguage-guard-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
