/* Truth layer — THE PRESENTATION LAYER. Don't make people read the database.

   `football.attendance_timing` and the bare word `probable` were reaching a sixteen-year-old's
   phone. This suite pins the translation, and — more importantly — pins what the translation is
   NOT allowed to do:

     · canonical identity survives untouched, because a prettier label must never become the
       thing the kernel keys on
     · four bands in, four bands out, one to one — collapsing or inventing one would be an
       epistemic change wearing a UI costume
     · a human's own words are never rewritten, only machine keys are
     · the first screen carries ONE open question, because six is a form and one is curiosity

   Run: node scripts/present-smoke.js */

'use strict';
const P = require('../ai/present');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

/* ── THE FOUNDER'S EXACT COMPLAINT ───────────────────────────────────────── */
const theKey = { canonicalConcept: 'football.attendance_timing', label: 'football.attendance_timing' };
ok('PR1 the reported case reads as English, not as a key',
  P.humanTopic(theKey) === 'Attendance timing');
ok('PR2 …and the canonical key is untouched by having been read',
  theKey.canonicalConcept === 'football.attendance_timing');

/* ── IDENTITY IS NEVER TRADED FOR A NICER LABEL ──────────────────────────── */
const card = P.inquiryCard({ inquiryId: 'inq_1', topic: theKey,
  confidence: { band: 'probable', because: ['two independent origins'] },
  status: 'probable', hypothesis: 'Arrivals slip when the session follows a fixture',
  stillUnknown: ['What changes on fixture days?', 'Who sets the meet time?'],
  alternatives: [{ statement: 'Transport is the constraint', band: 'emerging' }],
  falsifiers: ['Arrivals are on time after the next fixture'],
  signals: 4, independentOrigins: 2, contributors: 2 });
ok('PR3 the card carries the canonical key alongside the human title',
  card.canonicalConcept === 'football.attendance_timing' && card.summary.title === 'Attendance timing');
ok('PR4 …and the inquiry id, so the surface can act on the real object',
  card.inquiryId === 'inq_1');

/* ── TRANSLATION, NOT RE-BANDING ─────────────────────────────────────────── */
const bands = ['supported', 'probable', 'emerging', 'tentative'];
const phrases = bands.map(P.humanBand);
ok('PR5 every band has a phrase', phrases.every(p => typeof p === 'string' && p.length > 2));
ok('PR6 …and no two bands collapse into the same phrase — four in, four out',
  new Set(phrases).size === 4);
ok('PR7 …and none of the machine words reaches a reader',
  !phrases.some(p => bands.includes(p.toLowerCase())));
ok('PR8 an unknown band fails to the most cautious reading, never to the most confident',
  P.humanBand('nonsense') === P.humanBand('tentative') && P.humanBand('') === P.humanBand('tentative'));

/* Status is a SEPARATE axis and must not be folded into confidence: an inquiry can be well
   supported and disputed at once, which is the most informative state the system has. */
ok('PR9 status and band are translated separately',
  P.humanStatus('disputed') !== P.humanBand('supported')
  && P.inquiryCard({ confidence: { band: 'supported' }, status: 'disputed' }).summary.status
     === P.humanStatus('disputed'));
ok('PR10 …and a disputed inquiry is marked contested in the detail',
  P.inquiryCard({ status: 'disputed' }).detail.contested === true);

/* ── A HUMAN'S OWN WORDS ARE NEVER REWRITTEN ─────────────────────────────── */
ok('PR11 a real label is left exactly alone',
  P.humanTopic({ canonicalConcept: 'football.attendance_timing', label: 'Why are players arriving late?' })
    === 'Why are players arriving late?');
ok('PR12 the key test is narrow — spaces and capitals mean a person wrote it',
  P.looksLikeKey('football.attendance_timing') === true
  && P.looksLikeKey('Training arrival patterns') === false
  && P.looksLikeKey('Role clarity') === false
  && P.looksLikeKey('attendance') === false);

/* ── PROGRESSIVE DISCLOSURE IS A DATA SHAPE, NOT A CSS TRICK ─────────────── */
ok('PR13 the first screen carries ONE open question, not the whole list',
  card.summary.openQuestion === 'What changes on fixture days?' && card.summary.moreUnknowns === 1);
ok('PR14 …while the full list stays available underneath',
  card.detail.stillUnknown.length === 2);
ok('PR15 the reasoning, rivals and falsifiers are in the detail, never on the first screen',
  card.detail.because.length === 1 && card.detail.alternatives.length === 1
  && card.detail.falsifiers.length === 1
  && !('because' in card.summary) && !('alternatives' in card.summary));
ok('PR16 an alternative carries its own standing, translated the same way',
  card.detail.alternatives[0].standing === P.humanBand('emerging'));

/* ── DEGRADE HONESTLY ────────────────────────────────────────────────────── */
const empty = P.inquiryCard({});
ok('PR17 an empty inquiry produces a card rather than throwing',
  !!empty && typeof empty.summary.title === 'string' && empty.summary.title.length > 0);
ok('PR18 …with nothing invented: no thinking, no question, no counts',
  empty.summary.thinking === null && empty.summary.openQuestion === null
  && empty.detail.evidenceCount === 0 && empty.detail.because.length === 0);
ok('PR19 a malformed inquiry cannot throw either',
  !!P.inquiryCard(null) && !!P.inquiryCard(undefined) && !!P.inquiryCard('nonsense'));
ok('PR20 signals count works whether the kernel sent a number or an array',
  P.inquiryCard({ signals: 7 }).detail.evidenceCount === 7
  && P.inquiryCard({ signals: [1, 2, 3] }).detail.evidenceCount === 3);

/* ── WHAT THE BADGE CLAIMS ABOUT THE EVIDENCE ─────────────────────────────────────────────────
   The badge's tooltip was written in the browser from the BAND ALONE — a seven-entry lookup whose
   text for `supported`, `strong` and `clear` was "several separate accounts point the same way".
   An independent review called it, and it is the worst possible sentence to get wrong here: the
   entire origin/occasion apparatus in ai/diagnose.js exists to stop a room agreeing with itself
   from reading as corroboration, and the badge was asserting exactly that corroboration from a
   number that cannot carry it.

   Six evidence shapes, driven through the REAL deriveConfidence rather than hand-written
   confidence objects, because the defect lives in the gap between what the kernel computed and
   what the reader was told. A hand-written fixture would close that gap by construction. */
const D = require('../ai/diagnose');
const SIG = o => Object.assign({ kind: 'observation', status: 'active', at: Date.now(),
  directness: 'direct', authority: 'corroborated', specificity: 0.7 }, o);
const why = signals => P.confidenceWhy(D.deriveConfidence(signals));
const bandOf = signals => D.deriveConfidence(signals).band;

console.log('\n  THE BADGE SAYS WHAT THE EVIDENCE IS, NOT WHAT THE BAND IS');

/* 1 — nothing recorded. */
ok('PR21 with nothing recorded, the badge says so and claims no accounts at all',
  /nothing has been recorded/.test(why([])) && !/separate accounts/.test(why([])));

/* 2 — everything since corrected or withdrawn. A record that exists and no longer holds anything
   up is a different state from a record that was never written. */
const withdrawn = [SIG({ source: 'a', originRef: 'o1', status: 'withdrawn' })];
ok('PR22 a record whose every signal was corrected or withdrawn says that, rather than "nothing recorded"',
  /corrected or withdrawn/.test(why(withdrawn)) && !/nothing has been recorded/.test(why(withdrawn)));

/* 3 — one account, said once. */
const once = [SIG({ source: 'a', originRef: 'o1', turnId: 't1' })];
ok('PR23 one account given once is described as one account, said once',
  /rests on one account/.test(why(once)) && /said once/.test(why(once))
  && !/separate accounts/.test(why(once)));

/* 4 — ONE ORIGIN, FOUR TELLINGS. The captain says it after Saturday's match and four teammates
   repeat it. The old text called this several separate accounts pointing the same way, which is
   the precise thing the origin model was written to refuse. */
const retold = ['a', 'b', 'c', 'd'].map((s, n) => SIG({ source: s, originRef: 'o1', turnId: 't' + n }));
ok('PR24 four people retelling ONE origin is named as one account retold — never as separate accounts',
  /trace back to one account/.test(why(retold)) && !/separate accounts/.test(why(retold)));

/* 5 — ORIGIN NEVER ESTABLISHED. This is the one that reaches a high band while the independence
   claim is unavailable: unknown origins are capped, not refused, so the band can be `supported`
   with `independentOrigins` at zero. Reading the band alone, the old tooltip asserted exactly the
   independence the kernel had failed to establish. */
const unknownOrigin = ['a', 'b', 'c'].map((s, n) => SIG({ source: s, turnId: 't' + n }));
ok('PR25 several reports of UNESTABLISHED origin say the origin is unestablished',
  /where it came from has not been established/.test(why(unknownOrigin))
  && !/separate accounts/.test(why(unknownOrigin)));
ok('PR25b …and this is exactly the shape whose BAND would have justified the old claim, which is why the band cannot be the source',
  bandOf(unknownOrigin) === 'supported'
  && D.deriveConfidence(unknownOrigin).origin.independentOrigins === 0);

/* 6 — two genuinely independent origins: the ONLY shape that earns the claim. */
const independent = [SIG({ source: 'a', originRef: 'o1', turnId: 't1' }),
  SIG({ source: 'b', originRef: 'o2', turnId: 't2' })];
ok('PR26 two established, distinct origins DO earn "separate accounts point the same way"',
  /separate accounts point the same way/.test(why(independent)));

/* 7 — and they stop pointing the same way the moment one of them dissents. */
const contested = [SIG({ source: 'a', originRef: 'o1', turnId: 't1' }),
  SIG({ source: 'b', originRef: 'o2', turnId: 't2', dissents: true })];
ok('PR27 separate accounts that DISAGREE are never described as pointing the same way',
  /do not all agree/.test(why(contested)) && !/point the same way/.test(why(contested)));
ok('PR27b …and the contradiction is stated once, not appended to a clause that already said it',
  (why(contested).match(/agree|contradicted/g) || []).length === 1);

/* THE SIX SHAPES MUST READ DIFFERENTLY. If two of them produce one sentence, the badge is back to
   describing a band. */
const six = [why([]), why(withdrawn), why(once), why(retold), why(unknownOrigin), why(independent)];
ok('PR28 six different evidence shapes produce six different sentences',
  new Set(six).size === 6);

/* NO KERNEL VOCABULARY, NO NUMBERS. The presentation layer exists to stop "four origins across
   six occasions" reaching a sixteen-year-old, and a count is the easiest way to leak it. */
ok('PR29 no sentence leaks a number, an identifier or the kernel’s own words',
  six.every(s => !/\d/.test(s) && !/originRef|independentOrigins|occasion.?s?=|signal\w*=|band|score/i.test(s)));

/* FROM THE SHAPE, NOT FROM THE BAND. A confidence object with no computed shape cannot answer
   the question, and the honest answer to an unanswerable question is to say less. */
ok('PR30 a confidence object with no computed shape makes NO claim about accounts',
  !/separate accounts|one account|has not been established/.test(P.confidenceWhy({ band: 'supported' })));
ok('PR30b …and the band is not consulted at all — two different bands over the SAME evidence shape read identically',
  P.confidenceWhy({ band: 'tentative', origin: D.deriveConfidence(independent).origin })
  === P.confidenceWhy({ band: 'supported', origin: D.deriveConfidence(independent).origin }));
ok('PR31 a malformed confidence cannot throw',
  typeof P.confidenceWhy(null) === 'string' && typeof P.confidenceWhy('nonsense') === 'string'
  && typeof P.confidenceWhy({ origin: 'nope' }) === 'string');

/* IT REACHES THE CARD, where the badge actually reads it. A function nothing calls is the
   difference between a fix and a fix that shipped. */
const shaped = P.inquiryCard({ topic: theKey, confidence: D.deriveConfidence(retold) });
ok('PR32 the card carries the explanation beside the badge it explains',
  /trace back to one account/.test(shaped.summary.standingWhy));
ok('PR32b …and carries the shape itself in the detail, so a caller never has to parse the English',
  !!shaped.detail.origin && shaped.detail.origin.independentOrigins === 1
  && shaped.detail.origin.signals === 4);
ok('PR32c …while an inquiry with no computed shape carries null rather than a fabricated one',
  P.inquiryCard({ topic: theKey, confidence: { band: 'probable' } }).detail.origin === null);

console.log(`\npresent-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
