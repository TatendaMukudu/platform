/* Truth layer — D-A2: ANONYMOUS TO HUMANS, KNOWN TO THE KERNEL.

   Forum contributions are anonymous to every other human reader, leaders included. The author
   sees their own message marked as theirs, because a person must be able to find and correct
   what they said.

   The half that matters more is what does NOT change. Anonymity is a RENDERING property, not
   destruction of provenance. If authorship were actually removed:

     · one person could manufacture consensus by posting five times
     · repeated claims would look independent and echoes would corroborate
     · corrections could not be attributed and withdrawals would be unsafe
     · abuse could not be told apart from independent evidence

   So the kernel keeps `authorId` on the stored message and the origin machinery keeps counting
   origins. Only the read projection drops the name.

   FOUNDER DECISION, RECORDED: contextual inference remains possible in a very small group —
   "someone said the sessions feel rushed" in a team of four is close to naming. That is accepted
   deliberately rather than papered over: Forum is deliberation, not a claim, and the aggregation
   floors already govern what may become evidence. Suppressing a small team's discussion would
   make Forum useless exactly where teams are smallest. What follows from that acceptance is a
   duty not to make deanonymisation EASIER — no author-ordered ids, no author-derived metadata.

   Run: node scripts/forum-anonymity-smoke.js */

'use strict';
const forum = require('../ai/forum');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

const t = forum.newThread({ inquiryId: 'inq1', nodeId: 'u18', subjectRef: 'group:u18' });
t.messages.push(forum.newMessage({ id: 'm1', authorId: 'pA', text: 'The winger jumps early.', now: 1 }));
t.messages.push(forum.newMessage({ id: 'm2', authorId: 'pB', text: 'I see it differently.', now: 2 }));
t.messages.push(forum.removeMessage(forum.newMessage({ id: 'm3', authorId: 'pC', text: 'gone', now: 3 }), { now: 4 }));

const asA = forum.visibleThread(t, { viewerId: 'pA' });
const asB = forum.visibleThread(t, { viewerId: 'pB' });
const asLeader = forum.visibleThread(t, { viewerId: 'coach' });

/* ── ANONYMOUS TO HUMANS ─────────────────────────────────────────────────── */
ok('A1 no reader receives another person\'s authorship',
  [asA, asB, asLeader].every(v => v.messages.every(m => m.authorId == null)));
ok('A2 a LEADER is not an exception — the whole point is candour with the people above you',
  asLeader.messages.every(m => m.authorId == null && m.mine !== true));
ok('A3 the author sees their own message marked as theirs',
  asA.messages.find(m => m.messageId === 'm1').mine === true
  && asB.messages.find(m => m.messageId === 'm2').mine === true);
ok('A4 …and not anybody else\'s',
  asA.messages.find(m => m.messageId === 'm2').mine === false);

/* No author-derived metadata may survive the projection. A field that correlates with identity
   is the same leak wearing a different name. */
ok('A5 nothing in the projection carries an author-derived value',
  [asA, asB, asLeader].every(v => !JSON.stringify(v).includes('pA')
    && !JSON.stringify(v).includes('pB') && !JSON.stringify(v).includes('pC')));

/* ── KNOWN TO THE KERNEL ─────────────────────────────────────────────────── */
ok('A6 the stored message still carries protected authorship',
  t.messages[0].authorId === 'pA' && t.messages[1].authorId === 'pB');
ok('A7 authorship still governs who may edit, remove and contribute',
  forum.mayEdit({ actorId: 'pA', message: t.messages[0] }) === true
  && forum.mayEdit({ actorId: 'pB', message: t.messages[0] }) === false
  && forum.mayContributeMessage({ actorId: 'pB', message: t.messages[0], inNode: true }).allowed === false);
ok('A8 origin machinery is untouched — a declared echo still cannot add an origin',
  forum.originForMessage(t.messages[1], { echoesMessage: { contributedOrigin: 'o1' } }).originKind === 'reported');

/* ── REMOVAL AND TOMBSTONES ──────────────────────────────────────────────── */
ok('A9 a removed message stays a tombstone and reveals nothing',
  asA.messages.find(m => m.messageId === 'm3').status === 'removed'
  && asA.messages.find(m => m.messageId === 'm3').text == null
  && asA.messages.find(m => m.messageId === 'm3').mine === false);

/* ── NO VIEWER, NO OWNERSHIP ─────────────────────────────────────────────── */
ok('A10 with no viewer identified nothing is anyone\'s — it fails closed, not open',
  forum.visibleThread(t).messages.every(m => m.authorId == null && m.mine === false));

console.log(`\nforum-anonymity-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
