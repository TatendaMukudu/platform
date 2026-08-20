/* Truth layer — LAW E1: evidence establishes only within its class.

   The attack: plentiful occurrence/communication/document evidence must not support a claim
   about usefulness, understanding, reception, intent or lived experience.
   The defence: each evidence class must still establish the bounded proposition it actually
   carries, and the inquiry kernel must keep only admissible support refs.

   Run: node scripts/evidence-class-smoke.js */
'use strict';

const E = require('../ai/evidence-class.js');
const D = require('../ai/diagnose.js');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

console.log('evidence-class-smoke — LAW E1\n');

const can = (evidenceClass, claimClass, extra = {}) =>
  E.canEstablish({ evidenceClass, ...extra }, { claimClass });

// ATTACK — instrumentation may establish its bounded fact, never a stronger human claim.
ok('1 · a calendar occurrence cannot establish that feedback was useful', !can('occurrence', 'reported_experience'));
ok('1 · message metadata cannot establish how communication was received', !can('communication', 'reported_experience'));
ok('1 · an observation cannot establish the observed person’s experience', !can('observation', 'reported_experience'));
ok('1 · a written policy cannot establish that the policy was followed', !can('document', 'occurrence'));
ok('1 · unknown evidence establishes no claim', E.CLAIM_CLASSES.every(c => !can('unknown', c)));
ok('1 · an unknown claim class receives no support', !can('occurrence', 'unknown'));

// DEFEND — the boundary must not erase what each class genuinely proves.
ok('2 · occurrence evidence can establish that an occurrence happened', can('occurrence', 'occurrence'));
ok('2 · communication evidence can establish communication shape', can('communication', 'communication'));
ok('2 · self-reported experience can establish that person’s reported experience', can('reported_experience', 'reported_experience'));
ok('2 · an observation can establish what the observer perceived', can('observation', 'observation'));
ok('2 · a document can establish what was documented', can('document', 'document'));
ok('2 · derived evidence can restate a class its governed inputs establish',
  can('derived', 'occurrence', { basisClasses: ['occurrence'] }));
ok('2 · derived evidence cannot outrun its governed inputs',
  !can('derived', 'reported_experience', { basisClasses: ['occurrence', 'communication'] }));

// TOTAL + CONSERVATIVE — untrusted vocabulary is normalised, never promoted.
ok('3 · an unrecognised evidence class becomes unknown', E.evidenceClassOf({ evidenceClass: 'trust_me' }) === 'unknown');
ok('3 · origin kinds map to their bounded class',
  E.evidenceClassOf({ originKind: 'self_report' }) === 'reported_experience' &&
  E.evidenceClassOf({ originKind: 'document' }) === 'document');
ok('3 · an unrecognised claim class becomes unknown', E.claimClassOf({ claimClass: 'definitely_true' }) === 'unknown');

// KERNEL CONSEQUENCE — inadmissible refs remain in the signal history but do not support the claim.
const now = Date.UTC(2026, 7, 16);
let inquiry = D.newInquiry({ id: 'e1', subjectRef: 'member:a', concept: 'feedback_useful', now });
inquiry = D.applyProposals(inquiry, [
  { id: 'calendar', level: 'observation', text: 'a meeting occurred', sourceSpan: 'x',
    source: 'calendar', originKind: 'system', originRef: 'event:1', evidenceClass: 'reported_experience',
    specificity: 1, turnId: 't1' },
  { id: 'person', level: 'observation', text: 'it did not help me', sourceSpan: 'x',
    source: 'a', originKind: 'self_report', originRef: 'report:1', evidenceClass: 'occurrence',
    specificity: 1, turnId: 't2' },
  { id: 'attendance', level: 'observation', text: 'they attended the follow-up', sourceSpan: 'x',
    source: 'calendar', originKind: 'system', originRef: 'event:2', evidenceClass: 'occurrence',
    specificity: 1, turnId: 't3', challenges: 'useful' },
  { id: 'useful', level: 'hypothesis', text: 'the feedback was useful', claimClass: 'occurrence',
    basis: ['calendar', 'person'] },
], {
  now,
  // These stand in for a governed adapter/schema. The proposal's own class fields are untrusted.
  evidenceClassFor: p => ({
    calendar: 'occurrence', attendance: 'occurrence', person: 'reported_experience',
  }[p.id] || 'unknown'),
  claimClassFor: p => p.id === 'useful' ? 'reported_experience' : 'unknown',
});
const h = inquiry.hypotheses.find(x => x.id === 'useful');
ok('4 · the occurrence remains in history', inquiry.signals.some(s => s.ref === 'calendar'));
ok('4 · occurrence evidence is excluded from experience support', h && !h.supportRefs.includes('calendar'));
ok('4 · reported experience remains admissible support', h && h.supportRefs.includes('person'));
ok('4 · excluded evidence is explained rather than silently discarded',
  h && h.excludedSupport.some(x => x.ref === 'calendar' && x.reason === 'class_mismatch'));
ok('4 · an out-of-class challenge cannot refute the experience claim',
  h && !h.challengeRefs.includes('attendance') && h.status !== 'refuted');
ok('4 · excluded counter-evidence is also explained',
  h && h.excludedChallenge.some(x => x.ref === 'attendance' && x.reason === 'class_mismatch'));
ok('5 · proposal-authored class fields did not overrule the governed classifiers',
  inquiry.signals.find(s => s.ref === 'calendar').evidenceClass === 'occurrence' &&
  h.claimClass === 'reported_experience');

const attempted = D.applyProposals(D.newInquiry({ id: 'e2', subjectRef: 'member:a', concept: 'x', now }), [
  { id: 'model_says', level: 'observation', text: 'x', evidenceClass: 'reported_experience' },
  { id: 'model_claim', level: 'hypothesis', text: 'x', claimClass: 'reported_experience', basis: ['model_says'] },
], { now });
ok('5 · a proposal cannot author its own evidence permission',
  attempted.signals[0].evidenceClass === 'unknown' && attempted.hypotheses[0].claimClass === 'unknown');

console.log(`\nevidence-class-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
