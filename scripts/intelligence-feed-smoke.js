/* ============================================================
   scripts/intelligence-feed-smoke.js - Unified Intelligence Feed (pure)

   Proves the feed gathers already-safe artifacts from the six senses into one
   strict shape, without detection, prediction, privacy leakage, execution, or UI
   delivery decisions.

   Run: node scripts/intelligence-feed-smoke.js
   ============================================================ */

const feed = require('../ai/intelligence-feed');
const po = require('../ai/priority-office');

let pass = 0, fail = 0;
const ok = (name, condition) => { if (condition) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗', name); } };

console.log('\n=== Unified Intelligence Feed ===\n');

const reasoner = {
  agenda: [{
    beliefId: 'b1', kind: 'momentum_drop', subjectId: 'm1', subjectName: 'Mia', scope: 'u15',
    polarity: 'risk', severity: 'high', confidence: 'clear', urgency: 11, readiness: 'ripe', register: 'support',
    claim: "Mia's momentum has been running below their own normal.",
    why: 'The same signal has recurred.',
  }],
  proposals: [{ beliefId: 'b1', proposalType: 'supportive_checkin', text: 'Prepare a supportive check-in.', requiresConfirmation: true }],
};
const proactive = { insights: [{ id: 'pi1', patternType: 'recovering', polarity: 'progress', priority: 'medium', kernelConfidence: 'clear', headline: 'Climbing back', body: 'A good turn is visible.' }] };
const outcomeIntelligence = { briefs: [{ patternType: 'momentum_drop', signal: 'This pattern has appeared 3 times here.', outcomeLine: 'supportive check-in was followed by: 2 improved (3 recorded cases).', suggestedNextStep: { text: 'Review support history.', requiresConfirmation: true }, limitations: ['small_sample', 'not_causal'] }] };
const processReflection = { reflections: [{ id: 'pr1', kind: 'costly_handoff', label: 'approval step', level: 'org', polarity: 'friction', severity: 'high', confidence: 'emerging', question: 'What is this process protecting?', why: 'It has appeared 5 times.', target: 'org-lead', requiresConfirmation: true, processNotPerson: true, safe: true }] };
const selfModel = { proposals: [{ habitId: 'own_work_first:', pattern: 'own_work_first', setting: 'self_first', text: 'Want Today to open with your own work?', seenOnDays: 4, requiresConfirmation: true }], settings: { _applied: [{ setting: 'readiness_first', habitId: 'readiness_first:', pattern: 'readiness_first' }] } };
const orgPlaybook = { candidates: [{ fingerprint: 'cand1', type: 'repeated_transition', subjectLabel: 'weekly review', statement: 'A weekly review recurred before smoother handoffs.', confidence: 'supported', counterEvidence: { supporting: 3, contradicting: 0 }, supportingMoments: ['m1'] }], reviews: [{ id: 'rev1', status: 'contested', type: 'transition_sequence', subjectLabel: 'handoff practice', reason: 'Later history argues against this practice more than before.', currentConfidence: 'emerging' }] };

const collected = feed.collect({ reasoner, proactive, outcomeIntelligence, processReflection, selfModel, orgPlaybook });
const priorityInput = feed.toPriorityInput(collected);
const stamped = po.stamp({ ...priorityInput, usageSignals: { opensFirst: 'self_model' } });

ok('collect returns one safe feed object', collected.generatedBy === 'intelligence-feed' && collected.safe === true && collected.items.length >= 8);
ok('all six sources are represented', ['reasoner','proactive','outcome_intelligence','process_reflection','self_model','org_playbook'].every(s => collected.items.some(i => i.source === s)));
ok('reasoner proposal stays confirmation-gated', collected.items.some(i => i.source === 'reasoner' && i.suggestion && i.suggestion.requiresConfirmation === true));
ok('outcome item carries cautious limitations', collected.items.some(i => i.source === 'outcome_intelligence' && i.limitations.includes('small_sample') && i.limitations.includes('not_causal')));
ok('process item is a question, not a delivery bucket', collected.items.some(i => i.source === 'process_reflection' && i.kind === 'process_question' && /protecting/.test(i.question || i.body)));
ok('self-model proposals and accepted settings can both enter the feed', collected.items.some(i => i.kind === 'personal_working_pattern') && collected.items.some(i => i.kind === 'accepted_accommodation'));
ok('org playbook candidates and reviews enter the feed', collected.items.some(i => i.kind === 'practice_candidate') && collected.items.some(i => i.kind === 'practice_review'));
ok('priority office consumes feedItems directly', stamped.lead && stamped.queue.length === collected.items.length && stamped.generatedBy === 'priority-office');
ok('priority lead favors high-priority risk/friction before lower-priority strengths', ['risk','friction'].includes(stamped.lead.polarity));
ok('usage habit creates ask-first offer without silently changing the lead', stamped.askFirst && stamped.askFirst.requiresConfirmation === true && stamped.lead.id === po.stamp(priorityInput).lead.id);
ok('suppression happens before the feed reaches ranking', feed.collect({ reasoner }, { suppressed: ['b1'] }).items.length === 0);
ok('collection is deterministic', JSON.stringify(feed.collect({ reasoner, proactive, outcomeIntelligence, processReflection, selfModel, orgPlaybook })) === JSON.stringify(feed.collect({ reasoner, proactive, outcomeIntelligence, processReflection, selfModel, orgPlaybook })));

console.log(`\n=== intelligence-feed-smoke: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
