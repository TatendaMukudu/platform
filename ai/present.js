/* ============================================================
   ai/present.js — THE PRESENTATION LAYER (pure)

   The system thinks better than it looks. This module is the seam between the two, and it
   exists so that fixing the second never requires touching the first.

   The problem it solves, exactly: `diagnose.newInquiry` sets
   `label: String(label || concept || '')`, so an inquiry created without a human label carries
   its CANONICAL KEY as its label — and the surface rendered
   `topic.label || topic.canonicalConcept`, which put `football.attendance_timing` and the bare
   word `probable` in front of a sixteen-year-old.

   THE RULE HERE: canonical identity is never altered, never renamed, and never dropped. Every
   function below is a READ. `canonicalConcept` stays exactly what it was, travels with the
   projection, and remains what the kernel keys on. If a label and a key disagree, the key wins
   for identity and the label wins for reading — they are different jobs.

   The band translation is a TRANSLATION, not a re-banding. Four bands in, four bands out, one
   to one, in the same order. The epistemic layer decides how confident it is; this decides
   which English word means that. Collapsing two bands into one phrase, or inventing a fifth,
   would be an epistemic change wearing a UI costume.

   PURE: no IO, no model, no DOM. Same input, same output, always.
   ============================================================ */

'use strict';

/* Four bands, four phrases, one to one — ai/diagnose.js `_BANDS` is the owner and this is only
   its English. The phrasing is deliberately about the EVIDENCE rather than about the person:
   "not much to go on yet" says the record is thin, where "unclear" would suggest they are. */
const BAND_TEXT = Object.freeze({
  supported: 'Well supported',
  probable:  'Likely',
  emerging:  'Taking shape',
  tentative: 'Early thinking',
});

/* `status` is a different axis from `band` and is deliberately NOT collapsed into it — an
   inquiry can be well supported and disputed at the same time, and that combination is the
   most informative state the system has. */
const STATUS_TEXT = Object.freeze({
  exploring: 'Looking into this',
  probable:  'Coming into focus',
  supported: 'Holding up',
  disputed:  'People see this differently',
  resolved:  'Settled',
});

/* Domain prefixes a key may carry. Stripped for reading only; the key keeps them. */
const _KEYISH = /^[a-z0-9]+([._-][a-z0-9]+)+$/;

function _titleCase(s) {
  const t = String(s || '').trim();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

/* Does this string look like a machine key rather than something a person wrote?
   Deliberately narrow: all-lowercase with a separator and no spaces. "Training arrival" is not
   a key; "football.attendance_timing" is. A false positive here would rewrite a human's own
   words, which is worse than leaving one key on screen. */
function looksLikeKey(s) {
  const t = String(s || '').trim();
  return !!t && !/\s/.test(t) && _KEYISH.test(t);
}

/* Turn a key into something readable WITHOUT inventing meaning. The key's own words are the
   only source — no lookup table of nice names, because a table would drift out of step with
   the concepts the kernel actually mints and would start lying the first time it did.
   `football.attendance_timing` -> `Attendance timing`. */
function humanTopic(topic = {}) {
  const t = topic && typeof topic === 'object' ? topic : {};
  const label = String(t.label || '').trim();
  const key = String(t.canonicalConcept || '').trim();
  const candidate = label && !looksLikeKey(label) ? label : (label || key);
  if (!candidate) return 'Something worth understanding';
  if (!looksLikeKey(candidate)) return candidate;
  // Drop a leading domain segment ("football."), then separators become spaces.
  const parts = candidate.split('.');
  const tail = parts.length > 1 ? parts.slice(1).join('.') : parts[0];
  return _titleCase(tail.replace(/[._-]+/g, ' ').trim()) || 'Something worth understanding';
}

function humanBand(band) { return BAND_TEXT[String(band || '').trim()] || BAND_TEXT.tentative; }

/* ── WHAT THE BAND RESTS ON, SAID OUT LOUD ─────────────────────────────────────────────────────
   The badge carried a tooltip written from the BAND ALONE — a seven-entry lookup in the browser,
   whose text for anything at `supported` and above was "several separate accounts point the same
   way". A band cannot support that sentence, and an independent review was right to call it out:

     · several reports whose ORIGIN was never established reach the same band, and the whole
       origin/occasion distinction in ai/diagnose.js exists precisely because we cannot then rule
       out that a room is repeating one telling. Asserting independence there is asserting the one
       thing the model specifically failed to establish.
     · a picture resting on ONE origin retold by many is capped at 0.55 rather than refused, so it
       can sit in a band whose tooltip said "several separate accounts".
     · a contested picture — real disagreement, the most informative state the system has — was
       described as everything pointing the same way.

   So the sentence is composed HERE, from the counts ai/diagnose.js computed the score from, and
   nowhere else. Every clause below is true of `origin` or it is not printed. The band is not
   consulted: this says what the evidence IS, and the band already says how much it is worth.

   No number reaches the reader. "Several separate accounts" is a fact about the record; "four
   origins across six occasions" is the kernel's vocabulary said out loud, and the presentation
   layer exists to stop exactly that. */
function confidenceWhy(confidence = {}) {
  const c = confidence && typeof confidence === 'object' ? confidence : {};
  const o = (c.origin && typeof c.origin === 'object') ? c.origin : null;
  const n = (v) => (Number.isFinite(v) ? v : 0);

  // NO SHAPE, NO CLAIM. An older record, or a caller that did not come through deriveConfidence,
  // leaves this unanswerable — and the honest answer to an unanswerable question is to say so,
  // not to fall back on a sentence about accounts we cannot count.
  if (!o) return 'How sure IntelliQ is about this, from what has been recorded.';

  const origins = n(o.independentOrigins);
  const unestablished = n(o.unestablishedSources);
  const signals = n(o.signals);
  const occasions = n(o.occasions);
  const retired = n(o.retired);
  const contradictions = n(o.contradictions);

  let base;
  if (!signals && retired) {
    base = 'everything recorded about this has since been corrected or withdrawn';
  } else if (!signals) {
    base = 'nothing has been recorded about this yet';
  } else if (origins >= 2) {
    /* The ONLY shape that earns the independence claim: two or more established, distinct origins.
       "Point the same way" is a claim about AGREEMENT and is dropped when any of them dissents —
       a contested picture is separate accounts that DISAGREE, and appending "and some of it is
       contradicted" to "they point the same way" is one sentence saying both. */
    base = contradictions ? 'separate accounts, and they do not all agree'
      : 'separate accounts point the same way';
  } else if (origins === 1 && (signals > 1 || unestablished)) {
    // The case the old text got most wrong, and the one the origin model was written for.
    base = 'several tellings, but they all trace back to one account';
  } else if (origins === 1) {
    base = 'this rests on one account';
  } else if (unestablished > 1) {
    base = 'more than one person has said this, but where it came from has not been established';
  } else {
    base = 'this rests on very little so far';
  }

  const clauses = [];
  // Said once is a different weakness from said by one person, and both can be true.
  if (signals > 1 && occasions === 1) clauses.push('all said on one occasion');
  else if (signals === 1) clauses.push('said once');
  // Already said in the base clause for the multi-origin case; adding it twice reads as two facts.
  if (contradictions && origins < 2) clauses.push('and some of it is contradicted');
  else if (retired && signals) clauses.push('with some of it since corrected');

  return `How sure IntelliQ is: ${[base, ...clauses].join(', ')}.`;
}
function humanStatus(status) { return STATUS_TEXT[String(status || '').trim()] || STATUS_TEXT.exploring; }

/* THE CARD. Progressive disclosure is a data shape here, not a CSS trick: `summary` is what a
   person sees first and `detail` is what they get if they ask. Putting the split in the
   projection means the first screen cannot accidentally grow a field, because growing it takes
   a deliberate edit here rather than a stray line in a template. */
function inquiryCard(inquiry = {}) {
  const i = inquiry && typeof inquiry === 'object' ? inquiry : {};
  const topic = i.topic || {};
  const conf = i.confidence || {};
  const unknowns = Array.isArray(i.stillUnknown) ? i.stillUnknown.filter(Boolean) : [];
  const alts = Array.isArray(i.alternatives) ? i.alternatives : [];

  return {
    // IDENTITY — unchanged, and carried so the surface can act on the real object.
    inquiryId: i.inquiryId || null,
    canonicalConcept: String(topic.canonicalConcept || ''),

    summary: {
      title: humanTopic(topic),
      // The reading of the band, and the band itself, because a caller that wants to style by
      // band must not have to parse English back into an enum.
      standing: humanBand(conf.band),
      band: String(conf.band || 'tentative'),
      /* The badge's explanation, composed from the counts the score was computed from — see
         confidenceWhy. It rides on `summary` because the badge is on the first screen and its
         tooltip has to travel with it; a surface that had to reach into `detail` for the words
         beside a summary field is a surface that will eventually invent its own. */
      standingWhy: confidenceWhy(conf),
      status: humanStatus(i.status),
      // What we currently think, in the kernel's own words — never re-worded here.
      thinking: i.hypothesis ? String(i.hypothesis) : null,
      // ONE unknown on the first screen. The concept is one of the strongest IntelliQ has and
      // a list of six buries it; one open question reads as curiosity, six reads as a form.
      openQuestion: unknowns[0] || null,
      moreUnknowns: Math.max(0, unknowns.length - 1),
    },

    detail: {
      // Why it thinks that — the computed reasons, not prose about them.
      because: Array.isArray(conf.because) ? conf.because.filter(Boolean).map(String) : [],
      /* The evidence shape itself, so a caller can reason about it rather than parse English out
         of `because`. Read from the kernel's own answer; never recomputed here. */
      origin: (conf.origin && typeof conf.origin === 'object') ? { ...conf.origin } : null,
      stillUnknown: unknowns.map(String),
      alternatives: alts.map(a => (typeof a === 'string'
        ? { statement: a, standing: null }
        : { statement: String((a && a.statement) || ''), standing: a && a.band ? humanBand(a.band) : null })
      ).filter(a => a.statement),
      // What would show this is wrong. Computed since diagnose.js was written; it is the one
      // line no competitor produces, and it belongs on screen rather than in a store.
      falsifiers: Array.isArray(i.falsifiers) ? i.falsifiers.filter(Boolean).map(String) : [],
      evidenceCount: Number.isFinite(i.signals) ? i.signals : (Array.isArray(i.signals) ? i.signals.length : 0),
      // The HTTP projection calls this `origins`; the kernel calls it `independentOrigins`.
      // Both are read so the adapter works either side of that boundary.
      independentOrigins: Number.isFinite(i.independentOrigins) ? i.independentOrigins
        : (Number.isFinite(i.origins) ? i.origins : 0),
      contributors: Number.isFinite(i.contributors) ? i.contributors : 0,
      corrected: Number.isFinite(i.corrected) ? i.corrected : 0,
      contested: !!i.contested || i.status === 'disputed',
    },
  };
}

module.exports = { BAND_TEXT, STATUS_TEXT, looksLikeKey, humanTopic, humanBand, humanStatus,
  confidenceWhy, inquiryCard };
