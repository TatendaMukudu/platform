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

   L-MF6  EVERY EXTERNAL CLAIM CARRIES ITS SOURCE, AND THE SOURCE ACTUALLY USED IS THE ONE SHOWN.
          Uncited external material is refused here as firmly as ai/websearch.js refuses it, so a
          second route to the screen does not become a way around the first gate. And the other
          direction, which is the one a reader cannot check for themselves: an external claim whose
          source is APPROVED but NOT EMITTED is refused too. A reply resting on a page nobody is
          shown is indistinguishable, on screen, from a reply resting on the page above it.

   L-MF7  A GRAPH MAY NOT OUTRUN ITS SENTENCE. A series drawn as a `trend` asserts movement over
          time, which is a stronger claim than the same points drawn as states — so the movement
          has to be a claim somebody approved, named on the series. And where that claim carries
          the uncertainty, the picture carries it too: a line with no stated limit is read as a
          finding, and a chart is the most persuasive object this product can put on a screen.

   L-MF8  ONE ANSWER, NOT FIVE. `approve()` is the runtime gate: every channel this answer will
          leave by, checked against the SAME manifest in one place, plus the agreement between
          them by claim id. A channel verified in isolation can still be the odd one out, and the
          odd one out is what a reader ends up believing.

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
/* `sources` is here because wiring the voice channel found it missing: the spoken disclosure says
   "this rests on N sources", which is a count about THIS ORGANISATION'S record and was sailing
   through unchecked because the word was not on this list. A figure the verifier does not
   recognise as a figure is a figure nobody approved. */
const _COUNTABLE = '(?:of\\s+(?:your|the|this)|separate|independent|distinct|different|people|players|members|teammates|accounts|origins|occasions|records|times|sessions|sources|focuses|inquiries|highs|lows)';
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
      /* THE MOMENTS THE RECORD HOLDS. Supplied by whoever owns the record, not by whoever drew
         the picture — which is what makes a plotted timestamp checkable at all. */
      moments: [...new Set(_arr(graph.moments).map(t => _num(t)).filter(t => t !== null))],
      series: _arr(graph.series).map(s => ({
        key: _s(s && s.key, 80),
        unit: _s(s && s.unit, 40),
        shape: _s(s && s.shape, 20),
        /* L-MF7 — the claim the MOVEMENT rests on. Only a `trend` needs one: states and
           categories assert no change, so there is no extra claim to approve. */
        claim: _s(s && s.claim, 80),
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

/* ── L-MF2b — A FIGURE BELONGS TO THE CLAIM IT IS ABOUT ──────────────────────────────────────
   `particularsIn` answers "which figures does this text state". That is the wrong question on its
   own, and an independent gate was right to say so: pooling every approved number into one set
   asks only whether the figure appears SOMEWHERE in the manifest, so an answer holding "two
   accounts concern recovery" and "three accounts concern attendance" approves

       "Three separate accounts concern recovery."

   — a sentence in which every word is approved, every figure is approved, and the claim it makes
   is false. Both halves are real; the crossing is the lie, and the pooled set cannot see a
   crossing because it has thrown away which claim each number came from.

   WHAT DECIDES. A figure carries the words around it — the rest of its clause — and those words
   say what it is a count OF. The figure is refused when the text's own context points MORE
   CLEARLY at a claim that did not approve it than at any claim that did. That comparison, rather
   than a threshold, is what keeps this usable: a rephrasing ("records mentioning recovery" for
   "accounts concerning recovery") loses coverage against every claim equally and so accuses
   nobody, while a crossed number loses it against exactly one. A figure with no context at all —
   "this rests on 3 sources" — has nothing to be about, and falls back to the membership test that
   was already there rather than to a guess.

   WHY THE CLAUSE AND NOT THE SENTENCE. "Two separate accounts concern recovery, and three concern
   attendance" is one sentence about two things. Read whole, its context contains both topics and
   binds neither. The clause is the unit a figure is actually about. */
const _CLAUSE_END = /[.,;:!?—]|\s+(?:and|but|while|whereas|although|though|which|whose)\s+/i;

function _contextAfter(text, index) {
  const rest = _s(text, 8000).slice(index);
  const m = rest.match(_CLAUSE_END);
  return (m ? rest.slice(0, m.index) : rest).trim().split(/\s+/).slice(0, 8).join(' ');
}

/* A subject can precede the figure: "Recovery concerned three separate accounts." Looking only
   after the number leaves this clause without a topic and lets it borrow another claim's three. */
function _contextBefore(text, index) {
  const prefix = _s(text, 8000).slice(0, index);
  const ends = new RegExp(_CLAUSE_END.source, 'gi');
  let boundary = 0, previous = 0, separator = '', m;
  while ((m = ends.exec(prefix)) !== null) {
    previous = boundary;
    boundary = m.index + m[0].length;
    separator = m[0];
  }
  const current = prefix.slice(boundary).trim();
  // A colon or introductory comma can separate a topic from its figure without
  // starting a new claim: "For recovery, there were three accounts."
  const intro = /^[,:]$/.test(separator) && current.split(/\s+/).filter(Boolean).length <= 2
    ? prefix.slice(previous, boundary - separator.length).trim() : '';
  return [intro, current].filter(Boolean).join(' ').split(/\s+/).slice(-8).join(' ');
}

/* Every place this text states a figure, WITH the words that say what it counts. Deliberately a
   second function rather than a richer `particularsIn`: that one is the public summary and is
   asserted against by name elsewhere, and widening a shape callers already read is how a fix
   becomes a second defect. */
function _numberSites(text) {
  const t = _s(text, 4000);
  const sites = [];
  for (const re of [_COUNT_CLAIM, _POSSESSIVE_COUNT, _ORDINAL_RESULT]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(t)) !== null) {
      const raw = String(m[1] || '').toLowerCase();
      const n = Object.prototype.hasOwnProperty.call(_WORD_NUMBERS, raw) ? _WORD_NUMBERS[raw] : _num(raw);
      if (n !== null) sites.push({ value: n, context: [_contextBefore(t, m.index),
        _contextAfter(t, m.index + m[0].length)].filter(Boolean).join(' ') });
    }
  }
  return sites;
}

/* HOW MUCH OF THIS CONTEXT DOES THAT CLAIM ACCOUNT FOR? Counted in distinctive words, the same
   currency `_survives` uses, so "is this the same statement" and "is this figure about that
   statement" are not two different notions of sameness drifting apart. */
function _covers(claimText, context) {
  const words = [...new Set(_s(context, 200).toLowerCase().split(/[^a-z0-9']+/).filter(w => w.length > 4))];
  if (!words.length) return 0;
  const lower = _s(claimText, 1000).toLowerCase();
  return words.filter(w => lower.includes(w)).length;
}

/* DID THE SUBSTANCE SURVIVE? Matched on a statement's distinctive words rather than the whole
   sentence, because a voice channel legitimately rephrases for the ear and demanding a verbatim
   match would either fail every honest rendering or be switched off as unusable. The test is that
   enough of the statement's own uncommon words are there for it to be recognisably the same thing
   said — not that it was said the same way. */
function _survives(statement, lowerText) {
  const words = _s(statement, 400).toLowerCase().split(/[^a-z0-9']+/).filter(w => w.length > 4);
  const distinctive = words.slice(0, 8);
  if (!distinctive.length) return false;
  const present = distinctive.filter(w => lowerText.includes(w)).length;
  return present >= Math.max(1, Math.ceil(distinctive.length * 0.5));
}

/* WHICH APPROVED CLAIMS IS THIS CHANNEL ACTUALLY RESTING ON? Derived from the text rather than
   declared by the caller, deliberately: a caller that declares its own claim list is a caller
   whose list stays right while its output drifts, which is the whole failure this file exists to
   catch. Same substance test as the voice laws use, so "what the prose rests on" and "what voice
   must not drop" are one question asked once. */
function claimsIn(text, mf) {
  const lower = _s(text, 8000).toLowerCase();
  return _arr(mf && mf.claims).filter(c => _survives(c.text, lower)).map(c => c.id);
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
    for (const s of _arr(mf.graph && mf.graph.series)) allowed.set(s.key, s);
    const byId = new Map(mf.claims.map(c => [c.id, c]));
    /* FAIL CLOSED ON A MANIFEST THAT CANNOT VOUCH FOR TIME. A picture with dated points, checked
       against a record that declared no moments, is a picture checked against nothing — and an
       empty list read as "no constraint" is the fail-open shape this codebase keeps finding in
       its own gates (AGENTS.md, epistemic invariant 7). If a caller plots dates it has to say
       which dates the record holds. */
    const moments = new Set(_arr(mf.graph && mf.graph.moments));
    const anyDated = _arr(output && output.series).some(s => _arr(s && s.points).some(p => _num(p && p.at) !== null));
    if (anyDated && !moments.size) violations.push({ kind: 'graph_moments_unknown' });
    for (const s of _arr(output && output.series)) {
      const key = _s(s && s.key, 80);
      const approvedSeries = allowed.get(key);
      if (!approvedSeries) { violations.push({ kind: 'graph_series_not_in_manifest', series: key }); continue; }
      const set = new Set(approvedSeries.points.map(p => `${p.at}|${p.value}`));
      for (const p of _arr(s && s.points)) {
        const sig = `${_num(p && p.at)}|${_num(p && p.value)}`;
        if (!set.has(sig)) {
          violations.push({ kind: 'graph_value_not_in_manifest', series: key,
            at: _num(p && p.at), value: _num(p && p.value) });
        }
      }
      /* Each dated picture, not only a trend, must use a moment actually recorded. */
      if (moments.size) {
        for (const p of _arr(s && s.points)) {
          const at = _num(p && p.at);
          if (at !== null && !moments.has(at))
            violations.push({ kind: 'graph_time_not_in_record', series: key, at });
        }
      }
      /* ── L-MF7 — A LINE IS A CLAIM, AND SOMEBODY HAS TO HAVE MADE IT ──────────────────────
         Drawn as a trend, this series says the thing moved. The values being individually
         approved does not approve that: the same approved points drawn as states say only that
         each was recorded, which is a weaker and often the only honest statement. So the
         movement is named on the approved series, and a caller that cannot name it cannot draw
         the line. */
      if (_s(s && s.shape, 20) === 'trend') {
        const claimId = _s(approvedSeries.claim, 80);
        const c = claimId ? byId.get(claimId) : null;
        if (!c) {
          violations.push({ kind: 'graph_trend_without_claim', series: key, claim: claimId || null });
        } else if (c.carriesUncertainty && !_arr(output && output.limitations).length) {
          /* The picture that rests on a qualified claim has to show the qualification. A reader
             who takes in the line and none of the prose has been told the strong half only. */
          violations.push({ kind: 'graph_dropped_uncertainty', series: key, claim: c.id });
        }
      }
    }
    return { ok: !violations.length, violations };
  }

  /* ── CITATIONS (L-MF6) ──────────────────────────────────────────────────────────────────── */
  if (ch === 'citations') {
    const approved = new Set(mf.claims.map(c => c.citation && c.citation.url).filter(Boolean));
    const shown = new Set();
    for (const c of _arr(output)) {
      const url = _s(c && c.url, 500);
      if (!url) { violations.push({ kind: 'citation_without_url' }); continue; }
      shown.add(url);
      if (!approved.has(url)) violations.push({ kind: 'citation_not_in_manifest', url });
    }
    for (const c of mf.claims) {
      // An external claim whose source did not travel with it.
      if (c.stance === 'external' && !c.citation) {
        violations.push({ kind: 'external_claim_without_citation', claim: c.id });
        continue;
      }
      /* AND THE DIRECTION A READER CANNOT CHECK: the source this claim was actually built from
         is approved, and then not shown. Nothing on screen distinguishes an answer resting on a
         page you were given from one resting on a page you were not — so the citation channel
         has to carry every source the answer used, not merely no source it did not. */
      if (c.stance === 'external' && c.citation && !shown.has(c.citation.url)) {
        violations.push({ kind: 'citation_omitted', claim: c.id, url: c.citation.url });
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
  /* L-MF2b — and a figure the manifest DOES hold is still refused if it has been attached to the
     wrong claim. Only figures that cleared the membership test above reach this, so a reader of a
     refusal gets one reason rather than two for the same word. */
  const crossed = new Set();
  for (const site of _numberSites(text)) {
    if (!approvedNumbers.has(site.value) || crossed.has(site.value)) continue;
    let held = -1, heldBy = null, other = -1, otherIs = null;
    for (const c of mf.claims) {
      const score = _covers(c.text, site.context);
      if (c.numbers.includes(site.value)) {
        if (score > held) { held = score; heldBy = c.id; }
      } else if (score > other) { other = score; otherIs = c.id; }
    }
    if (other > held) {
      crossed.add(site.value);
      violations.push({ kind: 'number_crossed_claims', channel: ch, value: site.value,
        statedAbout: otherIs, approvedFor: heldBy });
    }
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
      if (!_survives(c.text, lower)) {
        violations.push({ kind: 'voice_dropped_uncertainty', claim: c.id, text: _s(c.text, 80) });
      }
    }
    /* THE LIMITATIONS ARE NOT OPTIONAL EITHER. "This rests on one account" is the sentence that
       makes the sentence before it safe to hear, and it is the first thing a summariser cuts —
       for the same reason a person skims past it, which is that it is the least interesting part.
       Checked for both the answer's own limits and any a single claim carries. */
    for (const lim of [..._arr(mf.limitations), ...mf.claims.flatMap(c => _arr(c.limitations))]) {
      if (!_survives(lim, lower)) violations.push({ kind: 'voice_dropped_limitation', text: _s(lim, 120) });
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

/* ── L-MF8 — THE RUNTIME GATE ────────────────────────────────────────────────────────────────
   ONE ANSWER, EVERY DOOR IT LEAVES BY, ONE PLACE.

   `verify` answers about one channel. That is what a unit test needs and it is NOT what a reader
   needs, because a reader is not shown one channel — they are shown the prose, the card beside
   it, the picture under it, the chips below that, and then they press the speaker. Five separately
   verified channels can each be defensible and still not be the same answer, and the one that
   disagrees is the one somebody walks away believing.

   So callers do not verify channel by channel. They hand the whole answer here and get back
   either the approved result or a refusal — never a partly approved answer, because a caller
   holding "the prose was fine" will ship the prose.

   Each channel arrives as `{ value, claims }`: what will be shown, and which claims of the
   manifest it rests on. The claims are what makes AGREEMENT checkable — the channels are meant
   to read differently, so comparing their words would either pass everything or fail everything,
   while comparing what they rest on asks the question that matters. Prose is the reference where
   it exists, because prose is the channel the others were derived from. */
function approve(mf, channels = {}, { roster = [] } = {}) {
  const violations = [];
  if (!mf || !_arr(mf.claims).length) {
    const v = [{ kind: 'no_manifest' }];
    return { ok: false, violations: v, note: refusalNote(v), channels: {} };
  }
  const known = new Set(mf.claims.map(c => c.id));
  const given = CHANNELS.filter(ch => channels && channels[ch] != null);
  if (!given.length) {
    const v = [{ kind: 'no_channels' }];
    return { ok: false, violations: v, note: refusalNote(v), channels: {} };
  }

  const declared = {};
  for (const ch of given) {
    const spec = channels[ch];
    const value = spec && Object.prototype.hasOwnProperty.call(spec, 'value') ? spec.value : spec;
    const r = verify(ch, value, mf, { roster });
    if (!r.ok) violations.push(...r.violations);
    /* A channel may DECLARE what it rests on or stay silent. Silence is honest for a channel
       that carries no claims of its own — a citation list rests on the claims, not the other way
       round — so only declarations are compared, and a declaration naming a claim this answer
       does not hold is refused whatever else it says. */
    if (spec && Array.isArray(spec.claims)) {
      const ids = spec.claims.map(x => _s(x, 80)).filter(Boolean);
      for (const id of ids) {
        if (!known.has(id)) violations.push({ kind: 'claim_not_in_manifest', channel: ch, claim: id });
      }
      declared[ch] = ids;
    }
  }

  const names = Object.keys(declared);
  const ref = Object.prototype.hasOwnProperty.call(declared, 'prose') ? 'prose' : names[0];
  for (const ch of names) {
    if (ch === ref) continue;
    const agree = channelsAgree(declared[ref], declared[ch]);
    if (!agree.ok) {
      violations.push({ kind: 'channels_disagree', a: ref, b: ch,
        onlyA: agree.onlyA.slice(0, 8), onlyB: agree.onlyB.slice(0, 8) });
    }
  }

  const ok = !violations.length;
  return {
    ok, violations, note: ok ? '' : refusalNote(violations),
    channels: ok ? Object.fromEntries(given.map(ch => {
      const spec = channels[ch];
      return [ch, spec && Object.prototype.hasOwnProperty.call(spec, 'value') ? spec.value : spec];
    })) : {},
  };
}

/* The sentence under a refusal. A caller that cannot show its answer should say something true
   rather than nothing, and "held back" without a reason teaches people to click past refusals. */
function refusalNote(violations = []) {
  const v = _arr(violations)[0] || {};
  switch (v.kind) {
    case 'number_not_in_manifest':
      return 'Held back — it stated a figure about your records that the record does not support.';
    case 'number_crossed_claims':
      return 'Held back — it attached a figure from your records to the wrong thing.';
    case 'date_not_in_manifest':
      return 'Held back — it stated a date that is not in the record it claims to describe.';
    case 'name_not_in_manifest':
      return 'Held back — it named somebody this answer was not authorised to name.';
    case 'quote_not_in_manifest':
      return 'Held back — it quoted something that is not in the record.';
    case 'graph_value_not_in_manifest':
    case 'graph_series_not_in_manifest':
      return 'Held back — the picture showed a value that does not come from the record.';
    case 'graph_moments_unknown':
      return 'Held back — the picture is dated and nothing said which dates the record actually holds.';
    case 'graph_time_not_in_record':
      return 'Held back — the picture put something at a moment the record does not have.';
    case 'graph_trend_without_claim':
      return 'Held back — the picture drew a line through the record, and nothing in this answer claims it moved.';
    case 'graph_dropped_uncertainty':
      return 'Held back — the picture showed the finding without the limit that goes with it.';
    case 'citation_not_in_manifest':
    case 'citation_without_url':
    case 'external_claim_without_citation':
      return 'Held back — something from outside IntelliQ arrived without its source.';
    case 'citation_omitted':
      return 'Held back — this used something from outside IntelliQ and did not show you which source.';
    case 'voice_dropped_uncertainty':
      return 'Read aloud was held back — it left out how uncertain this is, and spoken words carry more weight than written ones.';
    case 'voice_dropped_limitation':
      return 'Read aloud was held back — it left out what this answer cannot show.';
    case 'channels_disagree':
      return 'Held back — two parts of this answer were not saying the same thing.';
    case 'claim_not_in_manifest':
      return 'Held back — part of this answer rests on something that was never approved.';
    case 'no_channels':
    case 'no_manifest':
      return 'Held back — there is no approved answer behind this.';
    default:
      return 'Held back — this could not be traced to the record it claims to show.';
  }
}

module.exports = {
  STANCES, CHANNELS,
  claim, manifest, particularsIn, claimsIn, verify, approve, channelsAgree, refusalNote,
};
