/* ============================================================
   ai/voice.js — IntelliQ's OWN voice (pure, deterministic)

   The assistant speaks in this voice — not an LLM's. It composes warm, natural sentences
   from facts the caller already holds, so by construction it:
     • cannot predict (it has no notion of the future — it only arranges given facts),
     • cannot fabricate (it invents no fact; it phrases the ones passed in),
     • needs no API key, and sends nothing anywhere.

   Light, STABLE variety — a small set of phrasings chosen by a seed derived from the
   content — keeps it from sounding robotic without ever being random (the same state
   always reads the same way). PURE: imports nothing, no IO.
   ============================================================ */

const _GREET = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' };
const _WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const _cap = s => (s && s.length ? s[0].toUpperCase() + s.slice(1) : s);
const _num = n => (n >= 0 && n <= 10 ? _WORDS[n] : String(n));

// Stable choice from a small set, seeded by a string — deterministic, never random.
function _pick(arr, seed) {
  let h = 2166136261; const s = String(seed || '');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return arr[(h >>> 0) % arr.length];
}

function greeting(name, timeOfDay) {
  const g = _GREET[timeOfDay] || 'Hello';
  return `${g}${name ? ', ' + name : ''}.`;
}

/* A leader's opening — an aggregate read (if given) and how much is worth a look. */
function leaderOpening({ name = '', timeOfDay = 'afternoon', count = 0, rollupHeadline = null, areaLabel = 'your area', seed = '' } = {}) {
  const g = greeting(name, timeOfDay);
  const c = Math.max(0, count | 0);
  const nThings = `${_num(c)} thing${c === 1 ? '' : 's'}`;
  if (rollupHeadline) {
    const tail = c ? _pick([` And ${nThings} worth a closer look.`, ` There ${c === 1 ? 'is one thing' : 'are ' + _num(c) + ' things'} to keep an eye on, too.`], seed + 'h') : '';
    return `${g} ${_cap(String(rollupHeadline))}.${tail}`;
  }
  if (!c) return `${g} ${_pick([`${_cap(areaLabel)} looks steady — nothing needs you this second.`, `All calm across ${areaLabel} right now.`, `${_cap(areaLabel)} is ticking along; nothing's asking for you today.`], seed)}`;
  return `${g} ${_pick([`${_cap(areaLabel)} is mostly steady — ${nThings} worth a look.`, `A calm stretch in ${areaLabel}, bar ${nThings} I'd flag.`, `Not much stirring in ${areaLabel}, though ${nThings} caught my eye.`], seed)}`;
}

/* A member's opening — for them, about their own side. */
function memberOpening({ name = '', timeOfDay = 'afternoon', count = 0, seed = '' } = {}) {
  const g = greeting(name, timeOfDay);
  const c = Math.max(0, count | 0);
  if (!c) return `${g} ${_pick(['You’re steady — nothing needs you this second.', 'All good on your side right now.', 'Nothing pressing for you today — I’m here if you want to dig into anything.'], seed)}`;
  return `${g} ${_pick(['One thing on your side worth a look.', 'There’s something I’d gently flag on your side.', 'A thing or two worth a moment on your side.'], seed)}`;
}

/* ════════════════════════════════════════════════════════════════════════════
   EXPLAINING AN OBJECT — the composer (founder decisions D30, D34, D12, D11)

   Until now this module could only say hello: three functions, all of them openings. Every other
   sentence a person read came from fixed per-pattern tables in ai/proactive.js. This is the part
   that turns a governed object — an inquiry, a High, a Low, a Focus — into the four blocks a
   person actually reads:

       the claim  ·  why I think that  ·  what I still don't know  ·  what would change my mind

   It is COMPOSED FRESH EVERY TIME and never stored (object-as-conversation §2). If the evidence
   moves, the explanation moves, because it was never a copy.

   THE VOICE IS "A COLLEAGUE WHO NOTICED" (D34). Warm, first person, no hedging theatre. It says
   what it saw and asks. It never says what to do — that is the coach voice, and the sentence a
   coach would write ("that usually catches up with people, ease off this week") is a PREDICTION
   which ai/language-guard.js would reject anyway.

   Three properties hold by construction rather than by anyone remembering them:
     • It cannot predict or diagnose — it only arranges facts it was handed.
     • It cannot name a contributor. It is given COUNTS and has no field for a name (D38).
     • Kernel status words never reach a person (D11) — 'disputed' becomes "points both ways",
       because on a team object that word reads as "the team is in conflict" when it usually
       means two people described the same week differently.

   PURE: no IO, no model, deterministic. The same object always reads the same way.
   ════════════════════════════════════════════════════════════════════════════ */

/* Confidence band → what a person would actually say. The kernel's eleven bands collapse to
   four, because nobody distinguishes "well_supported" from "reliable" out loud. */
const _BAND_PLAIN = {
  confirmed: 'confident', clear: 'confident', reliable: 'confident',
  well_supported: 'confident', supported: 'confident',
  probable: 'fairly confident',
  emerging: 'starting to think so', promising: 'starting to think so',
  tentative: 'not sure yet', calibrating: 'not sure yet', low: 'not sure yet', none: 'not sure yet',
};
function confidencePlain(band) { return _BAND_PLAIN[String(band || '').toLowerCase()] || 'not sure yet'; }

/* A span in weeks, in words — "four weeks", not "27 days". */
function _span(days) {
  const d = Math.max(0, Math.round(Number(days) || 0));
  if (!d) return null;
  if (d < 10) return `${_num(d)} day${d === 1 ? '' : 's'}`;
  const w = Math.round(d / 7);
  return `${_num(w)} week${w === 1 ? '' : 's'}`;
}

/* THE PROVENANCE CHIP — one line under any claim, and the cheapest credibility in the product.
   A web citation can say which page. This says how many people said it INDEPENDENTLY and over
   how long, which is a stronger claim and one no summariser can make.

   `banded` exists for L-D27: a finding whose subject is a leader must never carry a count small
   enough to identify who spoke. It bands to "several" and it is the DEFAULT when the caller does
   not say — silence must not buy precision. */
function provenance({ contributors = 0, independentOrigins = 0, spanDays = 0, sources = 0, banded = true } = {}) {
  const parts = [];
  const c = Math.max(0, contributors | 0), o = Math.max(0, independentOrigins | 0);
  if (c > 0) parts.push(banded ? (c === 1 ? 'someone' : 'several people') : `${_num(c)} ${c === 1 ? 'person' : 'people'}`);
  // Independence is the part that matters and the part everyone else omits.
  if (o > 1 && !banded) parts.push(`${_num(o)} independent sources`);
  else if (o > 1) parts.push('more than one independent source');
  const s = Math.max(0, sources | 0);
  if (!o && s > 0) parts.push(`${_num(s)} ${s === 1 ? 'source' : 'sources'}`);
  const span = _span(spanDays);
  if (span) parts.push(`over ${span}`);
  return parts.length ? parts.join(', ') : null;
}

const _sentence = s => {
  const t = String(s == null ? '' : s).trim().replace(/\s+/g, ' ');
  if (!t) return '';
  return /[.!?]$/.test(t) ? t : t + '.';
};

/* Compose the four blocks. Everything is OPTIONAL: an object with nothing but a label still
   produces an honest explanation rather than an empty one, because a card that renders blank is
   how a person learns the product has nothing to say. */
function explainObject(obj = {}) {
  const {
    kind = 'inquiry', label = '', claim = '', band = 'tentative',
    because = [], contributors = 0, independentOrigins = 0, spanDays = 0, sources = 0,
    stillUnknown = [], falsifiers = [], contested = false, parkedBecause = null,
    banded = true, seed = '',
  } = obj;

  const sure = confidencePlain(band);
  const prov = provenance({ contributors, independentOrigins, spanDays, sources, banded });

  // THE CLAIM. Stated as something I think, never as a fact — the epistemic ladder in grammar.
  const headline = _sentence(label);
  const claimLine = claim
    ? `${_pick(['I think', 'My read is', 'What I make of it'], seed + 'c')} ${_sentence(String(claim).replace(/^I think\s+/i, ''))} ${_cap(sure)}.`
        .replace('What I make of it ', 'What I make of it: ').replace('My read is ', 'My read is that ')
    : `I'm ${sure} about this one.`;

  // WHY I THINK THAT. Counts and independence — never a name, never a quote.
  const reasons = (Array.isArray(because) ? because : []).map(_sentence).filter(Boolean);
  const why = [prov ? _cap(prov) + '.' : null, ...reasons].filter(Boolean).join(' ') || null;

  // WHAT I STILL DON'T KNOW — the collection frontier, already computed and never rendered.
  const unknown = (Array.isArray(stillUnknown) ? stillUnknown : [])
    .map(u => _sentence(typeof u === 'string' ? u : (u && u.question) || '')).filter(Boolean);

  // WHAT WOULD CHANGE MY MIND. The line no competitor can write: a system that regenerates a
  // summary each time holds no belief across time, so it has nothing to falsify.
  const change = (Array.isArray(falsifiers) ? falsifiers : [])
    .map(f => _sentence(typeof f === 'string' ? f : (f && (f.statement || f.text)) || '')).filter(Boolean);

  return {
    kind,
    headline,
    claim: claimLine,
    confidence: sure,
    provenance: prov,
    whyIThinkThat: why,
    stillUnknown: unknown,
    wouldChangeMyMind: change,
    // D11 — the kernel's word never surfaces. D36 — contested is a state, not an error, and the
    // sentence that matters is the one telling a person they were not overwritten.
    contested: contested
      ? 'What we have points both ways. Both accounts are kept, and it has pulled my confidence down.'
      : null,
    // D10 — parking is a judgement the system already makes silently. Saying it out loud is how
    // a person can disagree with the ranking.
    setAside: parkedBecause ? _sentence(parkedBecause) : null,
    // The next-best question belongs to the caller, under the stopping rule (D35, §16). This
    // module deliberately does not invent one: a composer that always asks is an interrogation.
  };
}

module.exports = {
  greeting, leaderOpening, memberOpening,
  explainObject, provenance, confidencePlain,
  _pick, _num,
};
