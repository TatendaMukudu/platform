/* Truth layer — Lane F subject identity.
   Only the four ratified kinds parse; every unknown kind fails closed at the
   production Inquiry boundary. */
process.env.DB_OPTIONAL = '1'; process.env.NODE_ENV = 'test';
const refs = require('../ai/subject-ref');
const S = require('../server');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };
const C = 'subject-ref';
S._loadAllStores({ orgMeta: { [C]: {} }, orgUsers: { [C]: { m: { id: 'm', role: 'member', status: 'active' } } },
  orgNodes: { [C]: { g: { nodeId: 'g', memberIds: ['m'], leaderIds: [] } } } });

/* D-A3 tightened the relationship grammar: an opaque id no longer parses, because a subject that
   does not name its endpoints is one erasure cannot find. The valid form is built, not spelled. */
const REL = refs.relationshipRef(['m', 'n'], { concept: 'communication' });
for (const ref of ['member:m', 'group:g', `organisation:${C}`, REL]) {
  ok(`SR ${ref} parses as a typed subject`, refs.parse(ref)?.ref === ref);
}
ok('SR an opaque relationship id no longer parses — endpoints are part of the contract',
  refs.parse('relationship-claim:r1') === null);
ok('SR unknown subject kinds fail closed in the parser', refs.parse('actor:m') === null);
ok('SR the production resolver validates member, group and organisation identities',
  S._resolveSubjectRef(C, 'member:m')?.kind === 'member' && S._resolveSubjectRef(C, 'group:g')?.kind === 'group'
  && S._resolveSubjectRef(C, `organisation:${C}`)?.kind === 'organisation');
ok('SR an unknown kind cannot create a first-class inquiry', S._inquiryFor(C, 'actor:m', 'x', 'X', '', Date.now()) === null);
ok('SR a known typed subject reaches the existing inquiry owner',
  S._inquiryFor(C, 'member:m', 'x', 'X', '', Date.now())?.subjectRef === 'member:m');
console.log(`\nsubject-ref-smoke: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
