/* ============================================================
   ai/websearch.js — CITED ADVICE FROM OUTSIDE (pure)

   Founder: "Yes wire web source answers as well. That helps with suggestions because it's not
   the AI making it up. It's cited info and the user can use and or not use the advice."

   That sentence contains the entire specification, including the two hard parts.

   "NOT THE AI MAKING IT UP" — an answer with no source is exactly what this feature exists to
   replace, so an uncited answer is refused rather than shown. Not down-ranked, not captioned
   with a disclaimer: refused. A model that has searched and found nothing must say it found
   nothing, because a plausible paragraph is indistinguishable from a sourced one to the person
   reading it at speed, and that person is deciding what to do about their own body or their own
   team on the strength of it.

   "THE USER CAN USE AND OR NOT USE THE ADVICE" — it arrives as material with its sources
   attached, never as an instruction and never as a finding of this system. Nothing here ever
   becomes evidence about anybody. The kernel is not told. It is the same boundary the forum
   keeps: this produces reading, not belief.

   AND THE PART THE FOUNDER DID NOT HAVE TO SAY, because it is the law everywhere else in this
   codebase: A QUERY IS COMPOSED, NEVER COPIED.

   Searching the web means handing a string to somebody else's infrastructure. If that string
   could be built from what a person typed, then sooner or later a sentence somebody wrote about
   their knee, their form, or their coach leaves this system inside a search query — and no
   amount of care at the call site prevents it, because the call site is where care runs out.
   So the query is not sanitised, filtered or redacted. It is BUILT, out of vocabulary this
   system already owns: the canonical concept on the inquiry and the domain it belongs to.
   Raw text is not an input to this module at all. There is no parameter to pass it in.

   That is the difference between "we strip names out" and "a name cannot get here", and only
   the second one survives contact with a feature nobody is watching six months from now.

   FOUR LAWS:

     L-WS1  THE QUERY IS COMPOSED, NEVER COPIED. Built from owned vocabulary. A person's words
            are not an input, so they cannot be an output.
     L-WS2  NO ANSWER WITHOUT A SOURCE. Uncited text is refused, not shown.
     L-WS3  READING, NEVER EVIDENCE. Nothing here reaches the kernel, moves a confidence, or
            becomes a fact about a person.
     L-WS4  IT IS ADVICE, AND IT SAYS SO. Offered with its sources, declinable, never phrased
            as what the person should do.

   PURE: imports nothing, no IO, no network, no clock. The caller owns the egress decision, the
   deterministic-only check and the budget.
   ============================================================ */

'use strict';

/* Concept keys look like "soccer.warmup" or "football.set_pieces.defending". The vocabulary is
   the system's own, which is precisely why it is safe to send: nobody typed it. */
const _WORD = /^[a-z0-9][a-z0-9_-]*$/i;

/* A hard ceiling on what can be built. A query is a handful of words about a topic; anything
   longer means something unexpected got into the vocabulary and the right response is to stop
   rather than to truncate and hope. */
const MAX_TERMS = 8;
const MAX_QUERY = 120;

/* Words added to aim the search at practice rather than at trivia. Fixed here rather than
   passed in, because a caller-supplied suffix is a caller-supplied query with extra steps. */
const INTENT = Object.freeze({
  practice: 'best practice guidance',
  research: 'research evidence',
  coaching: 'coaching guidance',
});

function _terms(key) {
  return String(key || '')
    .split(/[.\s_-]+/)
    .map(s => s.trim())
    .filter(Boolean)
    .filter(t => _WORD.test(t))
    .map(t => t.toLowerCase());
}

/* ── L-WS1 ───────────────────────────────────────────────────────────────────
   Build a query out of the concept and the domain. Note what is NOT a parameter: there is no
   `text`, no `statement`, no `question`. A caller holding a person's sentence has nowhere to
   put it, which is the only reliable way to keep it out. */
function deriveQuery({ canonicalConcept = '', domain = '', intent = 'practice' } = {}) {
  const conceptTerms = _terms(canonicalConcept);
  const domainTerms = _terms(domain);
  if (!conceptTerms.length) {
    return { ok: false, query: '', reason: 'no concept to search on — there is nothing here that is not somebody\'s own words' };
  }
  // The domain often repeats the concept's first segment ("sports" / "soccer.warmup"). Keeping
  // both makes a worse query, not a safer one.
  const seen = new Set();
  const terms = [...domainTerms, ...conceptTerms].filter(t => {
    if (seen.has(t)) return false;
    seen.add(t);
    return true;
  }).slice(0, MAX_TERMS);

  const suffix = INTENT[intent] || INTENT.practice;
  const query = `${terms.join(' ')} ${suffix}`.trim().slice(0, MAX_QUERY);
  return { ok: true, query, terms, note: 'Built from the topic, not from anything you wrote.' };
}

/* A caller can hand this whatever it is about to send and get a straight answer. Used as an
   assertion at the egress point rather than as a filter: if this returns false, the right move
   is to send nothing, because something has gone wrong upstream that filtering would hide. */
function isComposed(query, { canonicalConcept = '', domain = '', intent = 'practice' } = {}) {
  const built = deriveQuery({ canonicalConcept, domain, intent });
  return built.ok && built.query === String(query || '');
}

/* ── READING THE ANSWER BACK ─────────────────────────────────────────────────
   The server tool returns `web_search_tool_result` blocks. On success their `content` is a LIST
   of results; on failure it is a single error OBJECT. Those two shapes are easy to confuse and
   confusing them turns a failed search into a citation list of length one made of an error code,
   which would then satisfy L-WS2 and let an uncited answer through on the back of it. */
function citationsFrom(content = []) {
  const blocks = Array.isArray(content) ? content : [];
  const out = [];
  const errors = [];
  for (const b of blocks) {
    if (!b || b.type !== 'web_search_tool_result') continue;
    const c = b.content;
    if (!Array.isArray(c)) {                       // the error shape, deliberately not indexed
      errors.push(String((c && c.error_code) || 'search_failed'));
      continue;
    }
    for (const r of c) {
      if (!r || r.type !== 'web_search_result' || !r.url) continue;
      out.push({
        title: String(r.title || r.url).slice(0, 200),
        url: String(r.url).slice(0, 500),
        // The published date is what lets somebody judge whether advice is current, which is
        // most of what judging a source consists of.
        at: r.page_age ? String(r.page_age).slice(0, 40) : '',
      });
    }
  }
  const seen = new Set();
  return { citations: out.filter(c => (seen.has(c.url) ? false : (seen.add(c.url), true))), errors };
}

function textFrom(content = []) {
  return (Array.isArray(content) ? content : [])
    .filter(b => b && b.type === 'text' && b.text)
    .map(b => String(b.text))
    .join('\n')
    .trim();
}

/* ── L-WS2 ───────────────────────────────────────────────────────────────────
   The gate. An answer with no sources behind it does not get shown, however good it looks —
   the whole proposition was "it's cited info", and text that only appears cited is worse than
   no feature at all because it borrows the credibility of the ones that are. */
function answerFrom(content = [], { minCitations = 1 } = {}) {
  const { citations, errors } = citationsFrom(content);
  const text = textFrom(content);
  if (citations.length < minCitations) {
    return {
      ok: false, text: '', citations: [], errors,
      reason: errors.length
        ? 'the search did not come back, so there is nothing sourced to show'
        : 'nothing came back with a source attached, and an answer without one is just the model talking',
    };
  }
  if (!text) {
    return { ok: false, text: '', citations, errors, reason: 'sources came back but nothing was written about them' };
  }
  return {
    ok: true, text, citations, errors,
    // L-WS4, carried with the payload rather than left to each surface to remember.
    kind: 'advice',
    note: 'From outside IntelliQ, with its sources. Worth reading, yours to ignore — it is not a finding about you and it changes nothing here.',
  };
}

module.exports = {
  INTENT, MAX_TERMS, MAX_QUERY,
  deriveQuery, isComposed, citationsFrom, textFrom, answerFrom,
};
