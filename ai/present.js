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
/* ── HAS THE LEADING EXPLANATION EARNED STANDING OF ITS OWN? ──────────────────────────────────
   The same predicate `ai/team-state.js` applies, for the same reason, at the other owner that
   renders a claim beside a confidence band. `ai/diagnose.js newHypothesis` births a hypothesis at
   `tentative` with "nothing supports this yet" written in, and `applyProposals` raises it only
   from evidence — so `tentative` is exactly "nobody has evidenced this". Absent standing reads as
   unsupported, which is the safe direction and the one an older projection gets. */
function hypothesisHasStanding(i) {
  if (!i || !i.hypothesis) return false;
  const band = String(((i.hypothesisStanding || {}).band) || '').trim();
  return !!band && band !== 'tentative';
}

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
      /* ── AND THE BADGE IS THE CLAIM'S, SO WITH NO CLAIM THERE IS NO BADGE ──────────────────
         `thinking` below is already gated: a hypothesis is admitted as the card's claim only when
         the kernel gave it standing of its own. This field was not, and it is the OTHER half of
         the same law -- which this file's own note twenty lines down predicted, in the sentence
         "a law with one owner and two renderers is a law with a hole in it".

         The hole was rendered. Driven at 390px on a group's own question, the card read:

             Communication after results
             WELL SUPPORTED
             I don't have a read on this yet -- what has been described is on the record,
             and the reason for it is still open.

         Two adjacent lines contradicting each other, and the reader resolves it the wrong way
         round every time, because a badge in capitals is louder than a sentence. The band is the
         OBSERVATION's -- earned by five people describing something -- and with `thinking` empty
         there is no claim for it to be a band ABOUT, so it lands on the observation, which is not
         what a confidence badge means anywhere else in the product.

         NOTHING IS LOST BY REMOVING IT. How well established the observation is was never the
         badge's job and is already said better, in words, by the provenance line the same card
         carries: "five people, five independent sources". A band is for what IntelliQ BELIEVES;
         the provenance is for what it was TOLD. Keeping both and labelling neither is what
         produced the contradiction.

         `band` is left untouched: it is the enum a caller styles from, and the surfaces gate the
         badge on `standing` being present, so a null standing renders nothing. */
      standing: (hypothesisHasStanding(i) ? humanBand(conf.band) : null),
      band: String(conf.band || 'tentative'),
      /* The badge's explanation, composed from the counts the score was computed from — see
         confidenceWhy. It rides on `summary` because the badge is on the first screen and its
         tooltip has to travel with it; a surface that had to reach into `detail` for the words
         beside a summary field is a surface that will eventually invent its own. */
      standingWhy: confidenceWhy(conf),
      status: humanStatus(i.status),
      /* ── WHAT WE THINK, AND WHAT SOMEBODY HAS MERELY SUGGESTED ───────────────────────────
         `thinking` is rendered by every card DIRECTLY UNDER the band badge above, so whatever
         goes here is read at that band. That was safe while a hypothesis could only arrive from
         evidence. It stopped being safe when a human could propose one: the card then printed
         "players are worried about criticising each other" under a badge reading WELL SUPPORTED,
         on Home, where the badge had been earned by five people describing the thing the theory
         claims to explain — none of whom endorsed the theory.

         `ai/team-state.js` already refused this for the squad surface. The rule needed to be
         here as well, because this is the OTHER owner that renders a claim beside a band, and a
         law with one owner and two renderers is a law with a hole in it.

         So a hypothesis is admitted as `thinking` only when the kernel has given it standing of
         its own — read from the band the kernel computed for THAT hypothesis, never recounted
         here (L-DC1). Otherwise it travels as `possibleExplanation`, at its own standing, where
         a card cannot mistake it for the finding. Absent standing reads as unsupported, which is
         the safe direction and the one an older projection gets. */
      thinking: hypothesisHasStanding(i) ? String(i.hypothesis) : null,
      possibleExplanation: (!hypothesisHasStanding(i) && i.hypothesis) ? {
        statement: String(i.hypothesis),
        standing: humanBand((i.hypothesisStanding || {}).band || 'tentative'),
        band: String((i.hypothesisStanding || {}).band || 'tentative'),
        supportedBy: Number((i.hypothesisStanding || {}).supportedBy) || 0,
      } : null,
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

/* ── A FOCUS IS NOT AN INQUIRY ────────────────────────────────────────────────────────────────
   Every object on the bucket read was run through `inquiryCard`, whatever kind it was. For an
   inquiry, a high and a low that is right: each is something IntelliQ believes from evidence,
   and a confidence band is the honest thing to say about it. A FOCUS IS NOT A BELIEF. It is a
   commitment a person or a group made, in their own words, and it is true because they said it.

   Driven through the real route: a member typed "Work on my first touch" into POST /api/me/focus
   and the card came back reading

       standing:  "Early thinking"
       status:    "Looking into this"
       band:      "tentative"
       claim:     "My read is that Work on my first touch. Not sure yet."

   The product was hedging about whether somebody meant what they had just typed. The founder's
   law is that deterministic code decides and the prose reports that decision; here deterministic
   code decided a commitment was a tentative hypothesis, which is not a wording problem.

   THE SHAPE IS IDENTICAL on purpose — same `summary` and `detail` keys, same field names — so
   every surface that renders a card keeps working and nobody is tempted to write a second card
   renderer for this one kind. Only the CONTENT changes, to say what a commitment actually has:
   who set it, whether it is still open, when it is due a look, and how it turned out. */
const FOCUS_STANDING = Object.freeze({
  active:    'Being worked on',
  done:      'Closed',
  abandoned: 'Dropped',
});
/* ── TWO VOCABULARIES, BECAUSE THERE ARE TWO GRAINS ───────────────────────────────────────────
   A PERSONAL focus asks whether it helped YOU; a GROUP focus asks what happened to the group, and
   `ai/team-state.js OUTCOME_RESULTS` is better/no_change/worse/unclear. They were deliberately
   kept separate when the group vocabulary was introduced, and both need a reading — a composer
   answering "did it work?" at group grain was printing the raw enum (`after it: better`) because
   only the personal one had words. The keys do not collide; `unclear` means the same in both. */
const FOCUS_OUTCOME_TEXT = Object.freeze({
  helped:  'It helped',
  no:      'It did not help',
  mixed:   'Mixed',
  better:    'It got better',
  no_change: 'Nothing changed',
  worse:     'It got worse',
  unclear: 'Too tangled up in other things to tell',
});

/* The same words, lower-cased for the middle of a sentence ("and after it, it got better"). */
function outcomeText(result) { return FOCUS_OUTCOME_TEXT[String(result || '').trim()] || null; }

/* ── DID IT HELP: TRUE, FALSE, OR NOT KNOWN — ACROSS BOTH VOCABULARIES ────────────────────────
   The table above is the only place that knows both spellings, so the predicate belongs beside
   it rather than in each reader. Every caller that asked this question wrote
   `o === 'better'` / `o === 'no_change' || o === 'worse'`, which is the GROUP vocabulary only —
   so a PERSONAL focus recorded as `no` was invisible to the rule that a failed tactic must not
   come back as a fresh option. That rule is the founder's experiment law and it must not depend
   on which grain the focus happens to be at.

   `unclear` and `mixed` return null, and null is not false. "Too tangled up in other things to
   tell" is a recorded outcome that says nothing about whether the thing helped, and treating it
   as a failure would turn honest uncertainty into evidence against a tactic. */
function outcomeHelped(result) {
  const r = String(result || '').trim();
  if (r === 'helped' || r === 'better') return true;
  if (r === 'no' || r === 'no_change' || r === 'worse') return false;
  return null;
}

/* ── A HEADING A PERSON CAN READ AT A GLANCE ──────────────────────────────────────────────────
   Founder, from a live screenshot: a Focus card was using the whole raw paragraph as its title,
   so the heading was the entire thing the person had typed and there was nothing left for the
   card to say.

   WHAT THIS DOES NOT DO IS SUMMARISE. Turning "I think I'm doing well communicating, but I want
   to get much better at organizing everyone when we're under pressure" into "Communicate better
   under pressure" is a language task, and language is the model's half of the founder's law —
   deterministic code that tried it would be inventing a claim about what somebody meant. Models
   are off for the pilot, which is exactly when a fabricated heading would do the most damage.

   So it takes a LEAD, never a summary: the first sentence, and if that is still long, the first
   clause of it, cut at a word boundary. Nothing is invented and nothing is reordered — every word
   in the lead is a word the person wrote, in the order they wrote it. The full text is carried
   beside it as `full` so the card can show their own words underneath, and `leadIsWhole` says
   whether anything was left out, so a surface never implies it is showing everything when it is
   not. A short Focus is unaffected: it is its own lead and `leadIsWhole` is true. */
const LEAD_MAX = 64;
function focusLead(text) {
  const t = String(text == null ? '' : text).trim().replace(/\s+/g, ' ');
  if (!t) return { lead: '', full: '', leadIsWhole: true };
  if (t.length <= LEAD_MAX) return { lead: t, full: t, leadIsWhole: true };

  // First sentence, if there is one and it is not itself enormous.
  const stop = t.search(/[.!?](\s|$)/);
  let lead = stop > 0 ? t.slice(0, stop).trim() : t;

  /* Still long: cut at a clause boundary — but the LAST one that fits, not the first. Taking the
     first turned "Stay involved and help organise the team during difficult moments, especially
     after we concede" into "Stay involved", which is a fragment rather than a heading: the
     earliest boundary in a long sentence is usually the least informative place to stop. */
  if (lead.length > LEAD_MAX) {
    const BOUNDARY = /[,;:]|\s[—–-]\s|\sbut\s|\sand\s|\sso that\s|\sbecause\s/gi;
    let best = -1, m;
    while ((m = BOUNDARY.exec(lead)) !== null) {
      if (m.index <= LEAD_MAX && m.index > 20) best = m.index;
      if (m.index > LEAD_MAX) break;
    }
    if (best > 20) lead = lead.slice(0, best).trim();
  }
  // Still long: cut at the last word boundary that fits, never mid-word.
  if (lead.length > LEAD_MAX) {
    const cut = lead.slice(0, LEAD_MAX).lastIndexOf(' ');
    lead = lead.slice(0, cut > 12 ? cut : LEAD_MAX).trim();
  }
  lead = lead.replace(/[,;:.\-—–]+$/, '').trim();
  return { lead: lead || t.slice(0, LEAD_MAX).trim(), full: t, leadIsWhole: lead === t };
}

function focusCard(focus = {}, opts = {}) {
  const f = focus && typeof focus === 'object' ? focus : {};
  const status = ['active', 'done', 'abandoned'].includes(f.status) ? f.status : 'active';
  /* EITHER SHAPE. A group Focus records `{ result, note, recordedBy, at }`; a personal one was
     stored as the bare string `'helped'` until the server's constructor was corrected, and those
     records are already on disk. Reading both here is what keeps one card honest about two
     histories, without rewriting somebody's stored record to suit a reader. */
  const outcome = typeof f.outcome === 'string' && f.outcome
    ? { result: f.outcome, note: '', recordedBy: null, at: null }
    : (f.outcome && typeof f.outcome === 'object' ? f.outcome : null);
  const text = String(f.text || (f.topic && f.topic.label) || '').trim();
  const _lead = focusLead(text);
  /* WHOSE COMMITMENT IT IS. The caller knows; this only renders it. "You" and a group's name are
     the only two answers, because a Focus set for somebody else is not a thing the product has. */
  const mine = opts.mine !== false && !opts.groupName;
  const who = opts.groupName ? String(opts.groupName) : 'You';

  /* `Number(null)` is 0 and 0 is finite, so a Focus with no review date read as one due in 1970
     and every card said "Due a look". Absence is checked before the number is. */
  const reviewAt = f.reviewAt == null || f.reviewAt === '' || !Number.isFinite(Number(f.reviewAt))
    ? null : Number(f.reviewAt);
  const overdue = reviewAt != null && Number.isFinite(Number(opts.now)) && Number(opts.now) > reviewAt;

  return {
    inquiryId: null,                          // a Focus is not an inquiry and never claims to be
    focusId: String(f.focusId || f.id || ''),
    canonicalConcept: '',

    summary: {
      /* THE HEADING IS A LEAD, AND THE PERSON'S OWN WORDS ARE KEPT WHOLE BESIDE IT. `title` used
         to be the entire text, which on a real phone made the card's heading a paragraph. */
      title: _lead.lead || 'A focus',
      /* Exactly what they wrote, never trimmed, so nothing downstream has to go back for it and
         no surface is tempted to reconstruct it from the lead. */
      full: _lead.full,
      /* False means the heading is showing less than they wrote, which is the only condition
         under which a card owes them the rest. */
      leadIsWhole: _lead.leadIsWhole,
      /* `standing` is the state of the commitment, not a confidence band. `band` is carried
         because callers style by it, and a commitment's band is not tentative — it is `stated`,
         a value no confidence scale produces, so a surface can never mistake one for the other. */
      standing: FOCUS_STANDING[status],
      band: 'stated',
      standingWhy: mine ? 'You set this, so it is what you decided to work on — not something IntelliQ inferred.'
                        : `${who} set this. It is a commitment, not a conclusion drawn from evidence.`,
      status: outcome ? FOCUS_OUTCOME_TEXT[outcome.result] || FOCUS_OUTCOME_TEXT.unclear
            : overdue ? 'Due a look'
            : status === 'active' ? 'Open' : FOCUS_STANDING[status],
      // The person's own words, unchanged. Never re-worded, never summarised.
      thinking: text || null,
      /* The prompt belongs to whoever can answer it. Asking a squad member "what would tell you
         this was working" about their coach's commitment is asking the wrong person. */
      openQuestion: mine && status === 'active' && !outcome && !f.target
        ? 'What would tell you this was working?' : null,
      moreUnknowns: 0,
    },

    detail: {
      because: [],
      origin: f.origin && typeof f.origin === 'object' ? { ...f.origin } : null,
      stillUnknown: [],
      alternatives: [],
      falsifiers: [],
      evidenceCount: 0,
      independentOrigins: 0,
      contributors: Array.isArray(f.participants) ? f.participants.length : 0,
      corrected: 0,
      contested: false,
      // What a commitment has that a hypothesis does not.
      target: f.target ? String(f.target) : null,
      reviewAt,
      overdue,
      outcome: outcome ? {
        result: outcome.result || 'unclear',
        reading: FOCUS_OUTCOME_TEXT[outcome.result] || FOCUS_OUTCOME_TEXT.unclear,
        note: String(outcome.note || ''),
        at: Number.isFinite(Number(outcome.at)) ? Number(outcome.at) : null,
      } : null,
    },
  };
}

module.exports = { BAND_TEXT, STATUS_TEXT, FOCUS_STANDING, FOCUS_OUTCOME_TEXT,
  looksLikeKey, humanTopic, humanBand, humanStatus, confidenceWhy, inquiryCard, focusCard, focusLead, hypothesisHasStanding, outcomeText, outcomeHelped };
