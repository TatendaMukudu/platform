/* ============================================================
   ai/manifest.js — ONE RECORD OF WHAT MAY BE SAID, AND FIVE CHANNELS THAT SAY IT (pure)

   THE PROBLEM THIS EXISTS FOR. One answer leaves this product through five different doors —
   the prose, the card, the graph, the source chips and the voice — and until now each door
   decided for itself what it was allowed to carry. That is five chances to disagree about one
   answer, and they were already disagreeing: `verifyGrounding` checked the model's prose against
   a BLOB OF CONTEXT TEXT with substring matching, the chart gate checked plotted values against
   a list of refs, the citation gate checked external text against its own sources, and voice
   checked nothing at all because it read whatever the screen happened to contain.

   Four verifiers, four vocabularies, and no way to ask the one question that matters: IS THE
   THING THIS PERSON IS BEING TOLD THE SAME THING WE APPROVED?

   ── THE MANIFEST ────────────────────────────────────────────────────────────────────────────

   Deterministic code decides what may be said and writes it down as CLAIMS. Each claim carries
   its own identity, its stance, what it rests on, and — crucially — the organisation-specific
   PARTICULARS it is permitted to state: the numbers, the dates, the names. The model then writes
   prose, the renderer draws a card, the chart plots points, the voice reads it out, and every one
   of them is checked against the same record.

   WHY PARTICULARS RATHER THAN KEYWORDS. The old check asked "does this number appear anywhere in
   the context?" — and the context is thousands of words including timestamps, ids and unrelated
   figures, so almost any small number was somewhere in it. "You have 3 focuses" passed because
   the digit 3 occurred in a date. A manifest lists the numbers this claim may state, which is a
   much smaller and much more exact set, and a figure outside it is refused whatever else is in
   the bundle.

   ── THE LAWS ────────────────────────────────────────────────────────────────────────────────

   L-MF1  ONE MANIFEST PER ANSWER. Every channel is verified against the same one. A channel that
          builds its own idea of what is allowed is a channel that will eventually disagree.

   L-MF2  A PARTICULAR MUST BE APPROVED, NOT MERELY PRESENT SOMEWHERE. Numbers, dates and names
          that are organisation-specific are checked against the claim's own declared particulars.
          Substring presence in a context blob is not approval.

   L-MF3  STANCE TRAVELS WITH THE CLAIM. `recorded`, `inferred`, `external`, `general`, `advice`.
          A reader told something in the wrong stance has been misled even if every word is true —
          "you have been arriving late" and "it looks like you have been arriving late" are
          different claims about how much anybody knows.

   L-MF4  A GRAPH PLOTS THE MANIFEST. Every value drawn must be a value the manifest holds. A
          chart is the most persuasive object a product can show, and a number nobody can argue
          with is exactly the wrong place for an unapproved figure.

   L-MF5  VOICE SAYS WHAT THE SCREEN SAYS. It may not add a claim, and it may not drop one the
          manifest marked as carrying the uncertainty — because a spoken sentence sounds more
          certain than a written one, and the qualification is the first thing a summariser cuts.

   L-MF6  EVERY EXTERNAL CLAIM CARRIES ITS SOURCE. Uncited external material is refused here as
          firmly as ai/websearch.js refuses it, so a second route to the screen does not become a
          way around the first gate.

   PURE: no IO, no LLM, no clock of its own. Given a manifest and some output, it answers.
   ============================================================ */

'use strict';

/* L-MF3 — the closed vocabulary. Five, and each means something different about how much anybody
   actually knows:

     recorded  somebody put this in the record. The strongest thing this product says.
     inferred  the kernel worked it out from what is recorded. True of the reasoning, not of the
               world, and a reader is entitled to know which they are being told.
     external  it came from outside IntelliQ. Needs a source (L-MF6).
     general   general knowledge, not about this organisation at all.
     advice    a suggestion. Never a finding, and never phrased as one. */
const STANCES = Object.freeze(['recorded', 'inferred', 'external', 'general', 'advice']);

/* The five doors an answer leaves by. Named so a verifier can say WHICH one disagreed. */
const CHANNELS = Object.freeze(['prose', 'card', 'graph', 'citations', 'voice']);

const _s = (v, n = 400) => String(v == null ? '' : v).slice(0, n);
const _arr = v => (Array.isArray(v) ? v : []);
const _num = v => (Number.isFinite(Number(v)) ? Number(v) : null);

/* ── WHAT COUNTS AS AN ORGANISATION-SPECIFIC PARTICULAR ──────────────────────────────────────
   The distinction that makes this checkable rather than pedantic.

   "Three phases" in general coaching advice is not a claim about this organisation. "Three of
   your teammates" is. The difference is not in the digit, so the rule cannot be about digits
   alone — it is about whether the sentence is making the number a fact ABOUT THE RECORD.

   These are the shapes that do that, and they are deliberately narrow: a verifier that flags
   every number flags nothing, because a caller drowning in false positives switches it off. */
/* A NUMBER WRITTEN AS A WORD IS STILL A NUMBER, and the first version of this file missed it
   completely: the patterns matched `\d`, so "Four separate accounts point the same way" sailed
   through while "4 separate accounts" was refused. A model writes small counts as words most of
   the time, so the digit-only check was failing in the common case and passing in the rare one.

   Found by running the verifier against its own examples rather than by reading it — which is
   the point of the founder's "do not rely only on keyword checks": a check that recognises one
   spelling of a thing recognises the spelling, not the thing. */
const _WORD_NUMBERS = Object.freeze({
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  /* Stops at fifty deliberately. Past that a model writes digits, and every entry here is a
     word that could also appear innocently ("one of the things you said"), so the list is kept
     to the range where the false-positive cost is worth the catch. Vague quantifiers —
     "several", "a few", "most" — are NOT here: they state no figure, so there is no figure to
     approve, and refusing them would refuse honest hedging. */
});
const _NUMBER_WORD = Object.keys(_WORD_NUMBERS).join('|');
const _COUNTABLE = '(?:of\\s+(?:your|the|this)|separate|independent|distinct|different|people|players|members|teammates|accounts|origins|occasions|records|times|sessions|focuses|inquiries|highs|lows)';
const _COUNT_CLAIM = new RegExp(`\\b(\\d{1,4}|${_NUMBER_WORD})\\s+${_COUNTABLE}\\b`, 'gi');
const _POSSESSIVE_COUNT = new RegExp(`\\b(?:you|they|we)\\s+have\\s+(\\d{1,4}|${_NUMBER_WORD})\\b`, 'gi');
const _ORDINAL_RESULT = new RegExp(`\\b(?:won|lost|drew|scored|conceded|finished)\\s+(\\d{1,4}|${_NUMBER_WORD})\\b`, 'gi');
/* Dates in the shapes a person writes them. A bare year is excluded: "the 2024 season" is context,
   not a claim that something happened on a date this record holds. */
const _DATE_CLAIM = /\b(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)(?:\s+\d{4})?|(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:,?\s+\d{4})?|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})\b/gi;
const _QUOTED = /[“"]([^”"]{8,200})[”"]/g;

/* ── BUILDING ONE ────────────────────────────────────────────────────────────────────────────
   `claim()` normalises one approved statement. Nothing here decides anything — the caller has
   already decided, and this is the shape that decision travels in. */
function claim({
  id = '', text = '', stance = 'recorded', basis = [], at = null,
  numbers = [], dates = [], names = [], limitations = [], carriesUncertainty = false,
  citation = null, privacy = null,
} = {}) {
  return {
    id: _s(id, 80) || `c_${Math.abs(_hash(_s(text, 400)))}`,
    text: _s(text, 1000),
    stance: STANCES.includes(_s(stance, 20)) ? _s(stance, 20) : 'inferred',
    // What it rests on. Refs only — a statement is never copied into a basis.
    basis: [...new Set(_arr(basis).map(r => _s(r, 120)).filter(Boolean))],
    at: _num(at),
    /* THE PARTICULARS THIS CLAIM MAY STATE. Declared by whoever approved the claim, because only
       they know which figures the claim is actually about. An empty list means the claim may
       state no organisation-specific figure at all, which is the safe default. */
    numbers: [...new Set(_arr(numbers).map(n => _num(n)).filter(n => n !== null))],
    dates: [...new Set(_arr(dates).map(d => _s(d, 40)).filter(Boolean))],
    names: [...new Set(_arr(names).map(n => _s(n, 120)).filter(Boolean))],
    limitations: _arr(limitations).map(l => _s(l, 300)).filter(Boolean),
    /* L-MF5 — marks the claim whose absence would change what a listener believes. The
       qualification, the caveat, the "only one account so far". A summariser cuts these first. */
    carriesUncertainty: carriesUncertainty === true,
    // L-MF6 — an external claim without one of these is refused by `verify`.
    citation: citation && citation.url
      ? { url: _s(citation.url, 500), title: _s(citation.title, 200), at: _s(citation.at, 40) }
      : null,
    privacy: privacy ? { scope: _s(privacy.scope, 40), audience: _s(privacy.audience, 120) } : null,
  };
}

function _hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = ((h << 5) - h + str.charCodeAt(i)) | 0; }
  return h;
}

/* One manifest for one answer. */
function manifest({ subject = '', claims = [], graph = null, limitations = [], privacyScope = '', at = null } = {}) {
  const cs = _arr(claims).map(c => (c && c.id && c.stance ? c : claim(c)));
  return {
    subject: _s(subject, 160),
    at: _num(at),
    claims: cs,
    /* L-MF4 — the graph's own provenance, kept beside the claims rather than inside one, because
       a series is drawn from many claims and belongs to the answer rather than to a sentence. */
    graph: graph ? {
      series: _arr(graph.series).map(s => ({
        key: _s(s && s.key, 80),
        unit: _s(s && s.unit, 40),
        shape: _s(s && s.shape, 20),
        points: _arr(s && s.points).map(p => ({
          at: _num(p && p.at), value: _num(p && p.value),
          refs: [...new Set(_arr(p && p.refs).map(r => _s(r, 120)).filter(Boolean))],
        })),
      })),
    } : null,
    limitations: _arr(limitations).map(l => _s(l, 300)).filter(Boolean),
    privacyScope: _s(privacyScope, 120),
    // Every ref any claim rests on, so a caller can check a source is still authorised without
    // walking the claims itself.
    basis: [...new Set(cs.flatMap(c => c.basis))],
  };
}

/* ── THE PARTICULARS SOME TEXT ACTUALLY STATES ───────────────────────────────────────────────
   Extracted rather than guessed at, so the verifier and its tests agree about what was claimed. */
function particularsIn(text) {
  const t = _s(text, 4000);
  const numbers = new Set(), dates = new Set(), quotes = new Set();
  let m;
  for (const re of [_COUNT_CLAIM, _POSSESSIVE_COUNT, _ORDINAL_RESULT]) {
    re.lastIndex = 0;
    while ((m = re.exec(t)) !== null) {
      const raw = String(m[1] || '').toLowerCase();
      // A digit, or a number written as a word. Both are the same claim to a reader.
      const n = Object.prototype.hasOwnProperty.call(_WORD_NUMBERS, raw) ? _WORD_NUMBERS[raw] : _num(raw);
      if (n !== null) numbers.add(n);
    }
  }
  _DATE_CLAIM.lastIndex = 0;
  while ((m = _DATE_CLAIM.exec(t)) !== null) dates.add(m[1].trim());
  _QUOTED.lastIndex = 0;
  while ((m = _QUOTED.exec(t)) !== null) quotes.add(m[1].trim());
  return { numbers: [...numbers], dates: [...dates], quotes: [...quotes] };
}

/* ── THE GATE ────────────────────────────────────────────────────────────────────────────────
   One function, five channels, one manifest. Returns { ok, violations } and NEVER a partly
   approved output — a caller that gets `ok:false` has nothing to show and must degrade.

   `roster` is the organisation's people, supplied so a name can be recognised as a name. A name
   NOT on the roster is not this module's business: it could be a public figure in general advice,
   and refusing it would make general knowledge unusable. */
function verify(channel, output, mf, { roster = [] } = {}) {
  const violations = [];
  const ch = CHANNELS.includes(_s(channel, 20)) ? _s(channel, 20) : null;
  if (!ch) return { ok: false, violations: [{ kind: 'unknown_channel', channel: _s(channel, 40) }] };
  if (!mf || !_arr(mf.claims).length) return { ok: false, violations: [{ kind: 'no_manifest' }] };

  const approvedNumbers = new Set(mf.claims.flatMap(c => c.numbers));
  const approvedDates = new Set(mf.claims.flatMap(c => c.dates.map(d => d.toLowerCase())));
  const approvedNames = new Set(mf.claims.flatMap(c => c.names.map(n => n.toLowerCase())));
  const approvedText = mf.claims.map(c => c.text.toLowerCase()).join(' \n ');

  /* ── GRAPH (L-MF4) ──────────────────────────────────────────────────────────────────────── */
  if (ch === 'graph') {
    const allowed = new Map();
    for (const s of _arr(mf.graph && mf.graph.series)) {
      allowed.set(s.key, new Set(s.points.map(p => `${p.at}|${p.value}`)));
    }
    for (const s of _arr(output && output.series)) {
      const key = _s(s && s.key, 80);
      const set = allowed.get(key);
      if (!set) { violations.push({ kind: 'graph_series_not_in_manifest', series: key }); continue; }
      for (const p of _arr(s && s.points)) {
        const sig = `${_num(p && p.at)}|${_num(p && p.value)}`;
        if (!set.has(sig)) {
          violations.push({ kind: 'graph_value_not_in_manifest', series: key,
            at: _num(p && p.at), value: _num(p && p.value) });
        }
      }
    }
    return { ok: !violations.length, violations };
  }

  /* ── CITATIONS (L-MF6) ──────────────────────────────────────────────────────────────────── */
  if (ch === 'citations') {
    const approved = new Set(mf.claims.map(c => c.citation && c.citation.url).filter(Boolean));
    for (const c of _arr(output)) {
      const url = _s(c && c.url, 500);
      if (!url) { violations.push({ kind: 'citation_without_url' }); continue; }
      if (!approved.has(url)) violations.push({ kind: 'citation_not_in_manifest', url });
    }
    // And the other direction: an external claim whose source did not travel with it.
    for (const c of mf.claims) {
      if (c.stance === 'external' && !c.citation) {
        violations.push({ kind: 'external_claim_without_citation', claim: c.id });
      }
    }
    return { ok: !violations.length, violations };
  }

  /* ── PROSE, CARD AND VOICE all say words, so they are checked the same way ───────────────── */
  const text = _s(typeof output === 'string' ? output : (output && output.text) || '', 8000);
  const said = particularsIn(text);

  // L-MF2 — a figure the manifest does not hold is refused, whatever else is in the bundle.
  for (const n of said.numbers) {
    if (!approvedNumbers.has(n)) violations.push({ kind: 'number_not_in_manifest', channel: ch, value: n });
  }
  for (const d of said.dates) {
    if (!approvedDates.has(d.toLowerCase())) violations.push({ kind: 'date_not_in_manifest', channel: ch, value: d });
  }
  for (const q of said.quotes) {
    if (!approvedText.includes(q.toLowerCase())) violations.push({ kind: 'quote_not_in_manifest', channel: ch, value: _s(q, 80) });
  }
  // A name from the organisation's own roster must have been approved for this answer.
  for (const raw of _arr(roster)) {
    const person = _s(raw, 120).trim();
    if (!person || person.length < 3) continue;
    const re = new RegExp(`\\b${person.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (re.test(text) && !approvedNames.has(person.toLowerCase())) {
      violations.push({ kind: 'name_not_in_manifest', channel: ch, value: person });
    }
  }

  /* ── L-MF5 — VOICE MAY NOT DROP THE UNCERTAINTY ─────────────────────────────────────────── */
  if (ch === 'voice') {
    const lower = text.toLowerCase();
    for (const c of mf.claims) {
      if (!c.carriesUncertainty) continue;
      /* Matched on the claim's distinctive words rather than the whole sentence: a voice channel
         legitimately rephrases for the ear, and demanding a verbatim match would either fail
         every honest rendering or be dropped as unusable. The test is that the SUBSTANCE survived
         — enough of the claim's own uncommon words to be recognisably the same statement. */
      const words = c.text.toLowerCase().split(/[^a-z0-9']+/).filter(w => w.length > 4);
      const distinctive = words.slice(0, 8);
      const present = distinctive.filter(w => lower.includes(w)).length;
      if (!distinctive.length || present < Math.max(1, Math.ceil(distinctive.length * 0.5))) {
        violations.push({ kind: 'voice_dropped_uncertainty', claim: c.id, text: _s(c.text, 80) });
      }
    }
  }

  return { ok: !violations.length, violations };
}

/* ── DO TWO CHANNELS AGREE? ──────────────────────────────────────────────────────────────────
   The card and the prose are the pair most likely to drift, because they are written by different
   code from the same answer. Compared by CLAIM IDS rather than by words: they are meant to read
   differently, and comparing the prose would either pass everything or fail everything. */
function channelsAgree(a = [], b = []) {
  const A = new Set(_arr(a).map(x => _s(x, 80)));
  const B = new Set(_arr(b).map(x => _s(x, 80)));
  const onlyA = [...A].filter(x => !B.has(x));
  const onlyB = [...B].filter(x => !A.has(x));
  return { ok: !onlyA.length && !onlyB.length, onlyA, onlyB };
}

/* The sentence under a refusal. A caller that cannot show its answer should say something true
   rather than nothing, and "held back" without a reason teaches people to click past refusals. */
function refusalNote(violations = []) {
  const v = _arr(violations)[0] || {};
  switch (v.kind) {
    case 'number_not_in_manifest':
      return 'Held back — it stated a figure about your records that the record does not support.';
    case 'date_not_in_manifest':
      return 'Held back — it stated a date that is not in the record it claims to describe.';
    case 'name_not_in_manifest':
      return 'Held back — it named somebody this answer was not authorised to name.';
    case 'quote_not_in_manifest':
      return 'Held back — it quoted something that is not in the record.';
    case 'graph_value_not_in_manifest':
    case 'graph_series_not_in_manifest':
      return 'Held back — the picture showed a value that does not come from the record.';
    case 'citation_not_in_manifest':
    case 'citation_without_url':
    case 'external_claim_without_citation':
      return 'Held back — something from outside IntelliQ arrived without its source.';
    case 'voice_dropped_uncertainty':
      return 'Read aloud was held back — it left out how uncertain this is, and spoken words carry more weight than written ones.';
    case 'no_manifest':
      return 'Held back — there is no approved answer behind this.';
    default:
      return 'Held back — this could not be traced to the record it claims to show.';
  }
}

module.exports = {
  STANCES, CHANNELS,
  claim, manifest, particularsIn, verify, channelsAgree, refusalNote,
};
