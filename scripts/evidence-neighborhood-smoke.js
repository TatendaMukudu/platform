#!/usr/bin/env node
'use strict';

const n = require('../ai/evidence-neighborhood');
const feed = require('../ai/intelligence-feed');
let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log('PASS', name); }
  else { fail++; console.error('FAIL', name); }
}

const low = { id: 'focus:a', level: 'personal', subjectId: 'u1', priority: 'low', evidenceRefs: ['ev:1'], conceptRefs: ['communication'] };
const high = { id: 'inq:b', level: 'personal', subjectId: 'u1', priority: 'high', evidenceRefs: ['ev:2'], conceptRefs: ['communication'] };
let rel = n.connect([low, high]);
ok('related low + high inherits existing high attention', rel.length === 1 && rel[0].priority === 'high');
ok('relationship never authors epistemic confidence', rel[0] && rel[0].confidence === 'none');
ok('same concept is explicit relationship', rel[0] && rel[0].relationKinds.includes('same_concept'));

const low2 = { id: 'low:c', priority: 'low', objectRefs: ['obj:x'] };
const low3 = { id: 'low:d', priority: 'low', objectRefs: ['obj:x'] };
rel = n.connect([low2, low3]);
ok('two low items do not manufacture high priority', rel.length === 1 && rel[0].priority === 'low');

const sameTextOnlyA = { id: 'a', priority: 'medium', title: 'confidence under pressure', body: 'same words' };
const sameTextOnlyB = { id: 'b', priority: 'medium', title: 'confidence under pressure', body: 'same words' };
ok('text similarity without canonical refs makes no relationship', n.connect([sameTextOnlyA, sameTextOnlyB]).length === 0);

const sameEvidenceA = { id: 'a1', priority: 'medium', evidenceRefs: ['ev:z'] };
const sameEvidenceB = { id: 'b1', priority: 'medium', evidenceRefs: ['ev:z'] };
rel = n.connect([sameEvidenceA, sameEvidenceB]);
ok('same canonical evidence creates one relationship', rel.length === 1 && rel[0].relationKinds.includes('same_evidence'));
ok('evidence stays referenced once in relationship artifact', rel[0] && JSON.stringify(rel[0].evidenceRefs) === JSON.stringify(['ev:z']));

const focus = { id: 'focus:f1', priority: 'low', addressesRef: 'inquiry:i1' };
const inquiry = { id: 'inquiry:i1', priority: 'medium' };
rel = n.connect([focus, inquiry]);
ok('explicit Focus address relationship survives by reference', rel.length === 1 && rel[0].relationKinds.includes('explicit_address'));

/* Real repository shapes: group Focus stores origin.inquiryId; High/Low projections carry
   inquiryId. The feed must turn those already-owned IDs into refs without a mapping store. */
const realFocus = feed.normalizeArtifact({
  focusId: 'tf_1', kind: 'focus', priority: 'low', text: 'Speak earlier after turnovers',
  origin: { from: 'inquiry', inquiryId: 'inq_1' },
});
const realLow = feed.normalizeArtifact({
  id: 'low_1', kind: 'low', priority: 'high', inquiryId: 'inq_1',
  title: 'Communication after turnovers',
});
ok('real Focus shape derives its own focus object ref', realFocus.objectRefs.includes('focus:tf_1'));
ok('real Focus shape derives explicit address to its originating Inquiry', realFocus.addressesRefs.includes('inquiry:inq_1'));
ok('real High/Low projection shape derives Inquiry object ref', realLow.objectRefs.includes('inquiry:inq_1'));
rel = n.connect([realFocus, realLow]);
ok('real Focus and High/Low projection connect through existing Inquiry identity', rel.length === 1 && rel[0].relationKinds.includes('explicit_address'));
ok('real connected High can proactively raise attention without raising confidence', rel[0] && rel[0].priority === 'high' && rel[0].confidence === 'none');

const inquiryWithSignals = feed.normalizeArtifact({
  inquiryId: 'inq_2', kind: 'inquiry', priority: 'medium', topic: { canonicalConcept: 'decision_under_pressure' },
  signals: [{ ref: 'evidence:one' }, { ref: 'evidence:two' }],
});
ok('Inquiry canonical concept survives without prose matching', inquiryWithSignals.conceptRefs.includes('decision_under_pressure'));
ok('Inquiry evidence remains refs only', JSON.stringify(inquiryWithSignals.evidenceRefs) === JSON.stringify(['evidence:one', 'evidence:two']));

const football = [{ id: 'f1', priority: 'low', conceptRefs: ['decision_under_pressure'] }, { id: 'f2', priority: 'medium', conceptRefs: ['decision_under_pressure'] }];
const classroom = [{ id: 'c1', priority: 'low', conceptRefs: ['decision_under_pressure'] }, { id: 'c2', priority: 'medium', conceptRefs: ['decision_under_pressure'] }];
const business = [{ id: 'b1', priority: 'low', conceptRefs: ['decision_under_pressure'] }, { id: 'b2', priority: 'medium', conceptRefs: ['decision_under_pressure'] }];
ok('domain-free logic gives same relationship shape for sport school and business',
  n.connect(football)[0].relationKinds[0] === n.connect(classroom)[0].relationKinds[0] &&
  n.connect(classroom)[0].relationKinds[0] === n.connect(business)[0].relationKinds[0]);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);