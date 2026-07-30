/* ============================================================
   scripts/process-reflection-smoke.js — Process Reflection (pure)

   Proves IntelliQ can challenge or protect ways of working without attacking the
   person, predicting, diagnosing, or changing a process automatically.

   Run: node scripts/process-reflection-smoke.js
   ============================================================ */

const PR = require('../ai/process-reflection');

let pass = 0, fail = 0;
const ok = (name, condition) => { if (condition) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗', name); } };

console.log('\n=== Process Reflection ===\n');

const personalFriction = PR.reflectSignal({
  id: 'p1', kind: 'manual_rework', label: 'planning handoff', level: 'personal', polarity: 'friction', occurrences: 4, basis: ['task restarted after plan changed'],
});
const personalStrength = PR.reflectSignal({
  id: 'p2', kind: 'reliable_habit', label: 'night-before planning', level: 'personal', polarity: 'strength', occurrences: 6,
});
const orgFriction = PR.reflectSignal({
  id: 'o1', kind: 'costly_handoff', label: 'approval step', level: 'org', polarity: 'friction', occurrences: 7,
});
const orgStrength = PR.reflectSignal({
  id: 'o2', kind: 'working_routine', label: 'weekly review', level: 'team', polarity: 'strength', occurrences: 5,
});

const queue = PR.reflect([personalStrength, orgFriction, personalFriction, orgStrength], { limit: 3 });
const fromHabit = PR.reflectSignal(PR.fromSelfModelHabit({ id: 'readiness_first:', pattern: 'readiness_first', dayCount: 5, confidence: 'emerging' }));
const fromReview = PR.reflectSignal(PR.fromPlaybookReview({ fingerprint: 'pb1', subjectLabel: 'approval practice', counterEvidenceAtConfirmation: { supporting: 3 }, confidenceAtConfirmation: 'supported' }, { status: 'holding', currentConfidence: 'supported', counterEvidenceNow: { supporting: 4 } }));

ok('personal friction challenges the method, not identity', /friction in your process/i.test(personalFriction.question) && personalFriction.processNotPerson);
ok('personal strength asks what to protect/repeat', /working for you/i.test(personalStrength.question) && personalStrength.protectsGood === true);
ok('org friction asks what the process protects before changing it', /What is it protecting/i.test(orgFriction.question) && orgFriction.challengesFriction === true);
ok('team/org strength can be challenged as a good process', /protecting, repeating, or teaching/i.test(orgStrength.question));
ok('leader/org reflections strip basis while personal can keep own basis', orgFriction.basis.length === 0 && personalFriction.basis.length === 1);
ok('every reflection is confirmation-gated and process-not-person', [personalFriction, personalStrength, orgFriction, orgStrength].every(r => r.requiresConfirmation && r.processNotPerson));
ok('safe text guard catches no attacks or predictive claims in shipped prompts', [personalFriction, personalStrength, orgFriction, orgStrength].every(r => PR.assertProcessSafe(r).ok));
ok('queue ranks high-occurrence friction first but still includes strengths', queue.reflections[0].polarity === 'friction' && queue.reflections.some(r => r.polarity === 'strength'));
ok('self-model habits convert into personal strength process signals', fromHabit.polarity === 'strength' && /working for you/.test(fromHabit.question));
ok('playbook holding review converts into org strength process signal', fromReview.polarity === 'strength' && /working here/.test(fromReview.question));
ok('suppression removes a reflection before ranking', PR.reflect([orgFriction], { suppressed: [orgFriction.id] }).reflections.length === 0);
ok('the layer is deterministic', JSON.stringify(PR.reflect([personalStrength, orgFriction])) === JSON.stringify(PR.reflect([personalStrength, orgFriction])));

console.log(`\n=== process-reflection-smoke: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
