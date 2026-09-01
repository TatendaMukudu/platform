/* Truth layer — D53: A RELATIONSHIP CLAIM IS AN INQUIRY, never an edge store.

   "D contributes to leadership in Group X" is a claim that can be supported, challenged,
   corrected and contested — which is what an Inquiry already is. So D53 adds no graph, no edge
   table and no second lifecycle; it establishes a subject KIND and lets the existing machinery
   carry it.

   What that makes this suite responsible for is the inheritance itself. Asserting that
   `falsifiers` is an array proves nothing — newInquiry gives every inquiry that array, empty,
   and it stays empty here. The inheritance worth pinning is the part that is COMPUTED: a
   confidence band derived from the evidence rather than asserted, and a timeline that records
   both the support and the challenge.

   Run: node scripts/relationship-inquiry-owner-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const fs = require('fs');
const path = require('path');
const S = require('../server');
const d = require('../ai/diagnose');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

const C = 'relation-inquiry';
S._loadAllStores({ orgMeta: { [C]: {} }, orgUsers: { [C]: {
  a: { id: 'a', role: 'member', status: 'active' },
  b: { id: 'b', role: 'member', status: 'active' },
} } });

/* D-A3: the subject NAMES its endpoints, so erasure can find it without an index. */
const subjectRef = require('../ai/subject-ref');
const REL_REF = subjectRef.relationshipRef(['a', 'b'], { concept: 'leadership' });

let inquiry = S._inquiryFor(C, REL_REF, 'leadership_contribution', 'Leadership contribution', '', Date.now());
ok('F53.1 a relationship claim is created as the existing Inquiry shape',
  !!(inquiry && inquiry.inquiryId && inquiry.subjectRef === REL_REF
    && ((inquiry.relationshipClaim || {}).endpoints || []).join(',') === 'a,b'
    && (inquiry.relationshipClaim || {}).concept === 'leadership'));

const proposal = (id, polarity) => ({ id, level: 'observation', source: 'human', originRef: id,
  originKind: 'direct', occasionRef: id, polarity, specificity: 0.8, at: Date.now() });
inquiry = d.applyProposals(inquiry, [proposal('support', 'supports'), proposal('challenge', 'contradicts')], { now: Date.now() });

ok('F53.2 support and challenge both land as signals on the claim',
  inquiry.signals.length === 2 && (inquiry.timeline || []).length === 2);

/* The inheritance that actually matters: the number is DERIVED. A relationship claim must not be
   able to assert its own confidence any more than any other inquiry can. */
ok('F53.3 the claim carries a confidence band computed from its evidence, never asserted',
  !!(inquiry.confidence && typeof inquiry.confidence.score === 'number'
    && typeof inquiry.confidence.band === 'string'
    && Array.isArray(inquiry.confidence.because) && inquiry.confidence.because.length > 0));

ok('F53.4 no relationship or ontology edge store was added',
  !('relationships' in S._persistedStores()) && !('edges' in S._persistedStores()));

const snap = JSON.parse(JSON.stringify(S._persistedStores()));
delete S.inquiryStates[C];
S._loadAllStores(snap);
ok('F53.5 relationship identity survives the existing persistence owner',
  S.inquiryStates[C][REL_REF].leadership_contribution.relationshipClaim.concept === 'leadership');

ok('F53.6 unknown relationship-like subject kinds still fail closed',
  S._inquiryFor(C, 'relationship:bad', 'x', 'X', '', Date.now()) === null);

/* D-A3 · ERASURE. The whole reason endpoints live in the reference. Removing a person must take
   with them every claim that NAMES them — including one whose other endpoint is still here, and
   including a directed claim where they are the object rather than the subject. A claim about an
   erased person outliving them is the breach this closes. */
const directedRef = subjectRef.relationshipRef(['a', 'b'], { concept: 'mentorship', directed: true });
S._inquiryFor(C, directedRef, 'mentorship', 'Mentorship', '', Date.now());
S._inquiryFor(C, 'member:b', 'own_thing', 'Own thing', '', Date.now());
S._eraseSubjectInquiries(C, 'a');
ok('F53.8 erasing a person removes every relationship claim that names them',
  !S.inquiryStates[C][REL_REF] && !S.inquiryStates[C][directedRef]);
ok('F53.9 …and leaves the other endpoint\'s own subject untouched',
  !!S.inquiryStates[C]['member:b']);

/* D53 is a SHAPE, not a shipped capability: nothing in the product constructs one of these yet.
   Erasure is now answered (F53.8), so this is no longer a hole — it is a deliberate gate. The
   first producer is a product decision about WHEN IntelliQ may propose that two people have
   something worth investigating between them, and it should be made on purpose rather than
   arrived at. This assertion is how whoever wires it is made to notice. */
const serverSrc = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
ok('F53.7 nothing in production mints a relationship-claim ref — wiring one means answering erasure first',
  !/['"`]relationship-claim:/.test(serverSrc));

console.log(`\nrelationship-inquiry-owner-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
