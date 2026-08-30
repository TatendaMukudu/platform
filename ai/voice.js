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


/* Pattern and assessment prose have one deterministic owner (D30). */
const PATTERN_EXPLORE = {
  risk:        { self: 'Would you like to explore what changed — or think about who could support you?', leader: 'Want help preparing a supportive check-in?' },
  progress:    { self: 'What do you think helped create this? Worth protecting what’s working.',          leader: 'Worth recognising — want help finding the right words?' },
  milestone:   { self: 'Worth pausing on — want to note what made it possible, so you can keep it going?', leader: 'A good moment to acknowledge — want to prepare a note?' },
  opportunity: { self: 'Want to explore building on this?',                                                leader: '' },
  neutral:     { self: 'Want to take a look together?',                                                    leader: '' },
};

const PATTERN_MESSAGES = {
  baseline_shift: {
    self:   { headline: 'Something shifted from your usual',
              body: 'A few things are running differently from your own normal lately. Not good or bad — just different. Worth a moment to notice.',
              suggestion: 'Take a minute to reflect on what changed this week.' },
    leader: { headline: 'Unusual for them',
              body: "Something is running differently from this person's own normal lately. A curious, no-assumptions check-in may help.",
              suggestion: 'Consider a gentle 1:1 — lead with curiosity, not conclusions.' },
  },
  momentum_drop: {
    self:   { headline: 'Your momentum has dipped',
              body: 'Your recent check-ins are running lower than they were. That happens. If something is weighing on you, this is a good place to name it.',
              suggestion: 'Log how you’re really doing — no pressure to fix anything.' },
    leader: { headline: 'Momentum dropping',
              body: 'Their recent momentum looks softer than before. A personal check-in — listening first — is usually the right first step.',
              suggestion: 'Consider reaching out for a supportive check-in.' },
  },
  quiet_improvement: {
    self:   { headline: 'You’ve been quietly climbing',
              body: 'Things have been trending up for you lately, without much fanfare. Worth acknowledging to yourself.',
              suggestion: 'Note what’s been working — so you can keep doing it.' },
    leader: { headline: 'Quiet improvement',
              body: 'They’ve been improving quietly, with little recognition. A specific, genuine acknowledgement tends to make gains hold.',
              suggestion: 'Consider recognising the progress specifically.' },
  },
  recovering: {
    self:   { headline: 'You’re climbing back',
              body: 'You were in a rougher patch and you’ve been climbing back toward your normal. That took something — good to see.',
              suggestion: 'Acknowledge the turnaround to yourself — naming it helps it hold.' },
    leader: { headline: 'Climbing back',
              body: 'They’ve climbed out of a dip toward their own normal. Naming the turnaround out loud helps it stick.',
              suggestion: 'Consider acknowledging the turnaround.' },
  },
  repeated_concern: {
    self:   { headline: 'A theme keeps coming up',
              body: 'The same concern has surfaced a few times now. Recurring things are worth a single, focused look rather than many small ones.',
              suggestion: 'Pick one small focus for the recurring theme.' },
    leader: { headline: 'Repeated concern',
              body: 'A theme has recurred for them more than once — not a one-off. Naming it together and agreeing one small shared focus can help.',
              suggestion: 'Consider a conversation to name the recurring theme together.' },
  },
  member_team_divergence: {
    self:   { headline: 'You’re on a different track from the group',
              body: 'Your trajectory is moving differently from your team’s lately. Neither is wrong — but it can be worth understanding why.',
              suggestion: 'Reflect on what’s pulling you a different way right now.' },
    leader: { headline: 'Pulling away from the team',
              body: 'Their trajectory is diverging from the group’s. A 1:1 to understand what’s pulling them a different way — to integrate, not push — can help.',
              suggestion: 'Consider a 1:1 to understand the divergence.' },
  },
  invisible_load: {
    self:   { headline: 'You may be carrying a lot for others',
              body: 'You’ve been supporting others a lot lately. Make sure you’re not carrying more than is sustainable.',
              suggestion: 'Check what you can hand off or set down this week.' },
    leader: { headline: 'Carrying invisible load',
              body: 'They may be carrying a lot for others while under strain themselves. Offering to redistribute, or simply acknowledging the load, can help.',
              suggestion: 'Consider checking whether some load can be redistributed.' },
  },
  withdrawal: {
    self:   { headline: 'You’ve been pulling back',
              body: 'Your participation has eased off from your own normal. If something changed, this is a good place to say so.',
              suggestion: 'Share what changed — even a line helps IntelliQ support you.' },
    leader: { headline: 'Pulling back',
              body: 'Their participation is easing from their own normal. Reaching out — asking what changed and listening first — is a good first step.',
              suggestion: 'Consider reaching out to ask how they’re doing.' },
  },
  data_gap: {
    self:   { headline: 'It’s been quiet',
              body: 'You were checking in regularly, then it went quiet. No pressure — whenever you’re ready, IntelliQ is here.',
              suggestion: 'A quick check-in whenever it suits you.' },
    leader: { headline: 'Gone quiet',
              body: 'They were regular, then went quiet. A simple, no-assumptions “thinking of you, how are things?” is usually enough.',
              suggestion: 'Consider a light, no-assumptions reconnect.' },
  },
  isolation: {
    self:   { headline: 'Your connections have thinned',
              body: 'Your connection signals have been thinning lately. A shared task or a peer catch-up can help re-anchor things.',
              suggestion: 'Reach out to one person this week.' },
    leader: { headline: 'Becoming isolated',
              body: 'Their connection signals are thinning. A shared task or a peer check-in can help reconnect them.',
              suggestion: 'Consider helping them reconnect — a shared task or peer check-in.' },
  },
  overload: {
    self:   { headline: 'You may be overloaded',
              body: 'Demand looks high while wellbeing has dipped. Before pushing further, it’s worth easing something.',
              suggestion: 'Defer or drop one thing this week.' },
    leader: { headline: 'Overload risk',
              body: 'Demand appears high while wellbeing is down. Removing or deferring something before pushing further can help.',
              suggestion: 'Consider easing their load before adding to it.' },
  },
  plateau: {
    self:   { headline: 'Things have plateaued',
              body: 'Steady effort, but growth has flattened. A change of stimulus — a new challenge or approach — can restart it.',
              suggestion: 'Try one new challenge or approach.' },
    leader: { headline: 'Plateau',
              body: 'Growth has flattened despite steady effort. A new challenge or a change of approach can help restart it.',
              suggestion: 'Consider changing the stimulus — a new challenge or approach.' },
  },
};

function patternFallback(audience, patternType) {
  const label = patternType || 'a pattern';
  return audience === 'leader'
    ? { headline: 'Worth a moment', body: `IntelliQ noticed something (${label}) that may be worth a supportive check-in.`, suggestion: 'Consider a supportive check-in.' }
    : { headline: 'Worth a moment', body: 'IntelliQ noticed something in your week that may be worth a moment.', suggestion: 'Take a moment to reflect.' };
}

const STRUCTURE_LABEL = Object.freeze({ withdrawal: 'Pulling back', data_gap: 'Gone quiet', isolation: 'Becoming isolated', overload: 'Overload risk', plateau: 'Plateau' });

const norm = s => String(s == null ? '' : s).trim();

/* Generic, non-individual comments that carry no member-specific signal. */
const GENERIC_FEEDBACK = [
  /^good( detail| job| work| stuff)?[.! ]*$/i, /^great( job| work| stuff)?[.! ]*$/i,
  /^nice( one| work)?[.! ]*$/i, /^well done[.! ]*$/i, /^keep it up[.! ]*$/i,
  /^good detail\s*[—-]\s*keep it up[.! ]*$/i, /^solid[.! ]*$/i, /^ok(ay)?[.! ]*$/i,
  /^thanks?[.! ]*$/i, /^noted[.! ]*$/i,
];

/* Is this feedback a placeholder — empty, generic, or duplicated across other assessments
   (a sample value repeated verbatim, so not individual to this member)? */
function isPlaceholderFeedback(text, otherFeedbackTexts = []) {
  const t = norm(text);
  if (!t) return true;
  if (GENERIC_FEEDBACK.some(re => re.test(t))) return true;
  const dupes = (otherFeedbackTexts || []).map(norm).filter(x => x && x.toLowerCase() === t.toLowerCase());
  if (dupes.length >= 1) return true;              // the same comment appears elsewhere → sample/non-individual
  return false;
}

const RATIO_LABEL = [
  [0.85, 'Strong', 'The recorded evidence meets this expectation well.'],
  [0.6, 'Meeting the expectation', 'The recorded evidence is in line with what was asked.'],
  [0.4, 'Developing', 'There is a start here, but not yet enough evidence that it is happening reliably.'],
  [0, 'Needs attention', 'The recorded evidence is below what this expects.'],
];

/* ── project — the member's view. Inputs are already-confirmed/derived facts:
   { title, status, requiredCount, answeredCount, partialCount, feedback,
     otherFeedbackTexts, score, scoreMax } ── */
function project({ title = 'Assessment', status = 'assigned', requiredCount = 0, answeredCount = 0,
  partialCount = 0, feedback = '', otherFeedbackTexts = [], score = null, scoreMax = null } = {}) {

  const humanFeedback = !isPlaceholderFeedback(feedback, otherFeedbackTexts) ? norm(feedback) : '';
  const feedbackKind = humanFeedback ? 'human' : (norm(feedback) ? 'generic' : 'none');
  const remaining = Math.max(0, requiredCount - answeredCount);
  const strengths = [], attentionAreas = [], nextActions = [], limitations = [];
  let statusLabel, summary;
  let optionalScore = { show: false, value: score, max: scoreMax };

  if (status === 'returned') {
    // A reviewed result. Lead with meaning; the score supports, it does not headline.
    const ratio = (Number.isFinite(score) && Number.isFinite(scoreMax) && scoreMax > 0) ? score / scoreMax : null;
    if (ratio != null) {
      const [, label, meaning] = RATIO_LABEL.find(([t]) => ratio >= t);
      statusLabel = label;
      summary = meaning;
      optionalScore = { show: true, value: score, max: scoreMax };   // the number helps interpret a reviewed result
      if (ratio >= 0.6) strengths.push('The submitted work is meeting the expectation for this rubric.');
      if (ratio < 0.6) attentionAreas.push('There is not yet enough evidence that this is happening reliably.');
    } else {
      statusLabel = 'Reviewed';
      summary = 'Your submission has been reviewed.';
    }
    if (humanFeedback) { strengths.length = 0; nextActions.push('Read your leader\'s note below and reply if you have a question.'); }
    else if (feedbackKind === 'generic') limitations.push('The note attached is a general comment, not specific feedback on your work.');
    if (ratio != null && ratio < 0.6) nextActions.push('Give one recent, concrete example — or ask your leader what “good” looks like here.');
  } else if (status === 'submitted') {
    statusLabel = 'Submitted — awaiting review';
    summary = `You've completed ${title}. It's with your leader for review.`;
    nextActions.push('Nothing needed right now — you\'ll see the result here once it\'s reviewed.');
  } else if (answeredCount > 0 || partialCount > 0) {
    statusLabel = 'In progress';
    summary = `You've covered ${answeredCount} of ${requiredCount} part${requiredCount === 1 ? '' : 's'} so far.`;
    if (remaining > 0) nextActions.push(`Continue the conversation to cover the ${remaining} remaining part${remaining === 1 ? '' : 's'}.`);
    if (partialCount > 0) { attentionAreas.push(`${partialCount} answer${partialCount === 1 ? '' : 's'} ${partialCount === 1 ? 'was' : 'were'} a bit tentative and could be firmed up.`); limitations.push('Some responses are recorded but not yet firm.'); }
  } else {
    statusLabel = 'Not started';
    summary = `${title} is ready when you are. IntelliQ will ask a few short questions rather than hand you a blank form.`;
    nextActions.push('Start the conversation — it only asks for what it doesn\'t already know.');
  }

  const evidenceBasisSummary = requiredCount
    ? `Based on ${answeredCount} of ${requiredCount} recorded response${requiredCount === 1 ? '' : 's'}${humanFeedback ? ' and your leader\'s note' : ''}.`
    : 'Based on your recorded responses.';
  if (requiredCount && answeredCount < requiredCount && status !== 'returned') limitations.push(`${remaining} part${remaining === 1 ? '' : 's'} not yet covered.`);

  return {
    title, statusLabel, summary,
    strengths, attentionAreas, nextActions,
    limitations: [...new Set(limitations)],
    evidenceBasisSummary,
    optionalScore,
    feedbackKind,                                  // 'human' | 'generic' | 'none' — the UI shows human feedback ONLY when 'human'
    humanFeedback,                                 // '' unless a real, individual comment
    complete: status === 'returned' || status === 'submitted',
  };
}

/* ── answerAboutAssessment — the assistant, carrying the LEADER'S context down the web,
   answers a member's question about the work they've been set. The context is the brief
   the leader discussed when creating it (assignment/template description + guidance) — so
   the assistant is genuinely informed at the child end, not guessing. Deterministic: it
   conveys the leader's own words, framed; when there's no context, it says so honestly and
   offers to ask the leader rather than inventing an expectation. ── */
function answerAboutAssessment({ question = '', brief = '', guidance = '', fields = [], leaderName = 'your leader' } = {}) {
  const q = norm(question);
  const brf = norm(brief), gd = norm(guidance);
  const who = norm(leaderName) || 'your leader';
  const hasContext = !!(brf || gd);
  const fieldList = (fields || []).map(f => f && f.label).filter(Boolean);
  if (!hasContext) {
    return { hasContext: false, routeToLeader: true,
      answer: `${who} didn't leave extra notes on this one. What it's asking for: ${fieldList.length ? fieldList.join(', ') : 'your response'}. Want me to check with them for more detail?` };
  }
  const wantsHow = /\bhow\b|approach|format|structure|example|look like/.test(q);
  const parts = [`Here's what ${who} is looking for: ${brf || gd}`];
  if (wantsHow && gd && gd !== brf) parts.push(gd);
  return { hasContext: true, routeToLeader: false, answer: parts.join(' ') };
}


module.exports = {
  greeting, leaderOpening, memberOpening,
  explainObject, provenance, confidencePlain,
  PATTERN_EXPLORE, PATTERN_MESSAGES, patternFallback, STRUCTURE_LABEL,
  projectAssessment: project, isPlaceholderFeedback, answerAboutAssessment,
  _pick, _num,
};
