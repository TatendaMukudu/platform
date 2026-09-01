/* Truth layer — D-A3: ENDPOINT-BEARING RELATIONSHIP REFERENCES.

   A relationship claim is an Inquiry subject (D53). For erasure to be able to find one, the
   subject must SAY who it is about — otherwise removing a person leaves claims naming them alive
   in a store that has to be kept in step by hand. So the endpoints live in the reference itself
   and erasure is a property of the ref, not of an index.

   Two things this must get right, both of which are silent failures if it does not:

     • A↔B and B↔A must be ONE subject. Two refs for one relationship means two inquiries, two
       confidences and two halves of the same evidence, neither of which ever corroborates the
       other.
     • Where direction genuinely matters ("A mentors B" is not "B mentors A"), it must be stated
       explicitly. Direction carried by accidental endpoint ordering is direction that a sort
       silently destroys.

   NO RELATIONSHIP STORE. Nothing here persists anything; a ref is a string with a grammar.

   Run: node scripts/relationship-ref-smoke.js */

'use strict';
const S = require('../ai/subject-ref');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

/* CANONICAL SYMMETRY — the one that prevents a split subject. */
const ab = S.relationshipRef(['b_player', 'a_coach'], { concept: 'communication' });
const ba = S.relationshipRef(['a_coach', 'b_player'], { concept: 'communication' });
ok('R1 an undirected relationship is the SAME subject whichever way it is named', ab === ba);
ok('R2 …and it is a valid subject reference of the relationship kind',
  (S.parse(ab) || {}).kind === 'relationship-claim');

/* ERASURE DISCOVERY — the reason the endpoints are in the ref at all. */
ok('R3 both endpoints are recoverable from the reference alone',
  S.endpointsOf(ab).join(',') === 'a_coach,b_player');
ok('R4 a reference can be tested for whether it names a person',
  S.mentions(ab, 'a_coach') === true && S.mentions(ab, 'b_player') === true
  && S.mentions(ab, 'c_other') === false);
ok('R5 a non-relationship reference names nobody through this door',
  S.endpointsOf('member:a_coach').length === 0 && S.mentions('group:u18', 'a_coach') === false);

/* DIRECTION IS DECLARED, NEVER INFERRED FROM ORDER. */
const mentors = S.relationshipRef(['a_coach', 'b_player'], { concept: 'mentorship', directed: true });
const mentored = S.relationshipRef(['b_player', 'a_coach'], { concept: 'mentorship', directed: true });
ok('R6 a directed relationship keeps its direction and is NOT collapsed by sorting', mentors !== mentored);
ok('R7 …and direction is readable as a fact, not implied by position',
  S.parse(mentors).directed === true && S.parse(ab).directed === false);
ok('R8 …while a directed reference still yields both endpoints for erasure',
  S.endpointsOf(mentors).sort().join(',') === 'a_coach,b_player');

/* THE CONCEPT IS PART OF THE SUBJECT. Two different questions about one pair of people are two
   inquiries, not one that accumulates unrelated evidence. */
ok('R9 the same pair under a different concept is a different subject',
  S.relationshipRef(['a_coach', 'b_player'], { concept: 'trust' }) !== ab);
ok('R10 …and the concept is recoverable', S.parse(ab).concept === 'communication');

/* FAIL CLOSED — Lane D invariant 14 still governs. */
ok('R11 a relationship reference with one endpoint is refused',
  S.relationshipRef(['a_coach'], { concept: 'x' }) === null && S.relationshipRef([], {}) === null);
ok('R12 a self-relationship is refused', S.relationshipRef(['a', 'a'], { concept: 'x' }) === null);
ok('R13 an endpoint carrying the grammar\'s own separators is refused',
  S.relationshipRef(['a~b', 'c'], { concept: 'x' }) === null
  && S.relationshipRef(['a>b', 'c'], { concept: 'x' }) === null
  && S.relationshipRef(['a#b', 'c'], { concept: 'x' }) === null);
ok('R14 a malformed relationship reference does not parse',
  S.parse('relationship-claim:') === null && S.parse('relationship-claim:only-one#x') === null);
ok('R15 unknown subject kinds still fail closed', S.parse('relationship:a~b#x') === null);

console.log(`\nrelationship-ref-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
