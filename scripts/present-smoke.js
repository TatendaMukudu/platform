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

console.log(`\npresent-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
