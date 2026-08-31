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
S._loadAllStores({ orgMeta: { [C]: {} }, orgUsers: { [C]: { a: { id: 'a', role: 'member', status: 'active' } } } });

let inquiry = S._inquiryFor(C, 'relationship-claim:leadership-in-team', 'leadership_contribution', 'Leadership contribution', '', Date.now());
ok('F53.1 a relationship claim is created as the existing Inquiry shape',
  !!(inquiry && inquiry.inquiryId && inquiry.subjectRef === 'relationship-claim:leadership-in-team'
    && (inquiry.relationshipClaim || {}).claimId === 'leadership-in-team'));

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
  S.inquiryStates[C]['relationship-claim:leadership-in-team'].leadership_contribution.relationshipClaim.claimId === 'leadership-in-team');

ok('F53.6 unknown relationship-like subject kinds still fail closed',
  S._inquiryFor(C, 'relationship:bad', 'x', 'X', '', Date.now()) === null);

/* D53 is a SHAPE, not a shipped capability: nothing in the product constructs one of these yet.
   That matters because erasure removes `member:<id>` and nothing else — a relationship claim
   naming an erased person would outlive them. Whoever wires the first producer owns that
   question, and this assertion is how they are made to notice, since the claim-id format is the
   founder's call rather than something to guess at here. */
const serverSrc = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
ok('F53.7 nothing in production mints a relationship-claim ref — wiring one means answering erasure first',
  !/['"`]relationship-claim:/.test(serverSrc));

console.log(`\nrelationship-inquiry-owner-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
