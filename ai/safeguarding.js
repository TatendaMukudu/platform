/* ============================================================
   ai/safeguarding.js — the duty of care, in code.

   Safety must NEVER depend on the LLM being switched on. This module is fully deterministic:
   it detects language that signals someone may be at risk, and returns a compassionate response
   plus real crisis resources — with the model on or off, in every org, always.

   Two tiers, erring deliberately toward sensitivity (a missed crisis is far worse than an extra
   offer of help):
     CRISIS  — immediate risk: self-harm, suicidal ideation, abuse, feeling unsafe. Surfaces
               resources, tells the person plainly we're bringing in a safe adult, and routes a
               flag to the org's safeguarding lead. Safety outranks confidentiality here — and we
               say so, rather than promising a privacy we would not keep.
     CONCERN — severe distress worth a caring nudge + resources, without forced escalation.

   Crisis numbers are real and must stay accurate; they default to UK services and are
   overridable per org (a US org sets 988/911). Getting a number wrong is itself a harm.
   ============================================================ */

// Immediate-risk patterns. Kept explicit and readable; tuned to catch real phrasings a person
// in distress actually uses, including negations of "want to live".
const CRISIS = [
  /\b(kill|hurt|harm|cut|cutting)\s+(myself|me)\b/,
  /\b(want|wanna|going|need|plan(ning)?|thinking about)\s+to\s+(die|kill myself|end (it|my life|things))\b/,
  /\b(thinking about|want to|going to|ready to|planning to|about to)\s+end(ing)?\s+it\b/,
  /\bsuicid/,
  /\bend(ing)?\s+(it all|my life)\b/,
  /\btake (my )?(own )?life\b/,
  /\bself.?harm/,
  /\b(don'?t|do not|no longer)\s+want\s+to\s+(be here|live|wake up|exist|carry on|go on)\b/,
  /\bbetter off (dead|without me|if i (was|were) (gone|dead))\b/,
  /\bno (point|reason)\s+(in\s+)?(living|life|going on|carrying on)\b/,
  /\b(being|been|getting)\s+(abused|assaulted|beaten|hit|touched|threatened)\b/,
  /\b(scared|afraid|frightened)\s+(of|to go)\s+(home|him|her|them|my (dad|mum|mom|coach))\b/,
  /\b(i (feel|am)|feeling)\s+(unsafe|in danger)\b/,
];
// Severe-distress patterns — a caring check + resources, no forced escalation.
//
// Every pattern here binds the feeling to the PERSON, or to their life as a whole.
// That binding is load-bearing, not tidiness: a bare /\bpointless\b/ fires on "it
// feels pointless walking in that late", which is a person describing a football
// session, and answering that with crisis resources is its own harm. Someone who
// gets the Samaritans number for a complaint about a drill learns the system does
// not understand them, and discounts it on the day it matters. Sensitivity is
// still the right instinct — it governs CRISIS above, where the cost of a miss is
// unbounded — but sensitivity to the wrong thing is not sensitivity.
const CONCERN = [
  // The strong words, applied to oneself. Intensifiers may sit in between.
  /\b(i'?m|i am|im|i feel|i felt|i'?ve felt|i'?ve been|i just feel|feeling)\s+(so |really |completely |totally |utterly |just |quite |very |kind ?of |kinda |a bit )*(hopeless|worthless|pointless)\b/,
  // Or applied to everything — the scope is their life, not one session.
  /\b(everything|it all|all of it|life|nothing)\s+(is |feels? |seems? |just )*(hopeless|pointless|worthless|meaningless)\b/,
  /\bwhat'?s the point (of it all|in (anything|any of it)|any ?more)\b/,
  /\bi\s+(can'?t|cannot|can not)\s+(cope|go on|keep going|do this any ?more|take (it|this) any ?more)\b/,
  /\b(i'?m|i am|im)\s+(giving up|falling apart|breaking down)\b/,
  // The milder words need an intensifier as well as the binding: "I'm exhausted"
  // after a Tuesday session is a fit person describing a hard session.
  /\b(i'?m|i am|im|i feel|feeling)\s+(so|really|completely|totally|utterly)\s+(alone|empty|numb|overwhelmed|exhausted|broken|lost)\b/,
  /\bi hate\s+(myself|my life|everything)\b/,
  /\bcry(ing)?\s+(all the time|every (day|night)|myself to sleep)\b/,
  /\bnobody (cares|would notice|understands)\b/,
];

const DEFAULT_RESOURCES = [
  { label: 'Samaritans — free, 24/7', contact: 'call 116 123' },
  { label: 'Childline (under 19) — free', contact: 'call 0800 1111' },
  { label: 'Crisis Text Line', contact: 'text SHOUT to 85258' },
  { label: 'Emergency services', contact: 'call 999 if you are in immediate danger' },
];

/* Detect risk in a piece of text. Deterministic; no IO, no model. */
function detect(text) {
  const t = String(text || '').toLowerCase();
  if (!t.trim()) return { severity: 'none', flagged: false, category: null };
  if (CRISIS.some(r => r.test(t)))  return { severity: 'crisis',  flagged: true, category: 'immediate_risk' };
  if (CONCERN.some(r => r.test(t))) return { severity: 'concern', flagged: true, category: 'severe_distress' };
  return { severity: 'none', flagged: false, category: null };
}

/* The response the PERSON sees — warm, human, and honest about what happens next. For a crisis
   it is transparent that a safe adult is being told (we never promise confidentiality we can't
   keep); for concern it stays supportive and leaves agency with the person. */
function composeResponse({ name = '', severity = 'crisis', resources = DEFAULT_RESOURCES } = {}) {
  const hi = name ? `${String(name).split(/\s+/)[0]}, ` : '';
  if (severity === 'crisis') {
    return {
      severity, escalate: true,
      message: `${hi}thank you for telling me — I'm really glad you did, and I don't want you to be alone with this. Because your safety matters more than anything, I'm not keeping this to myself: I've let your safeguarding lead know so a real person can be there for you. If you're in immediate danger, please call 999 now.`,
      resources,
    };
  }
  return {
    severity, escalate: false,
    message: `${hi}that sounds genuinely hard, and you shouldn't have to carry it by yourself. Talking to someone can really help — here are people who listen, any time, and it's completely okay to reach out.`,
    resources,
  };
}

/* THE ONE HOME for the sentence a person must read BEFORE they say anything (founder decision
   D21). It lived as a function-local const in server.js and as a second copy in js/app.js, kept
   equal only by a test comparing the two literals. A promise about somebody's safety should not
   be maintained by string comparison, so it lives here — in the module that owns the duty of
   care — and everything else reads it.

   It is a NOTICE, not a consent. Nobody may decline it; the rule applies either way. What is
   recorded is that a person was shown it, never that they permitted it. */
const SAFETY_EXCEPTION = 'If something you tell IntelliQ suggests you are at risk of harm, a safeguarding lead is told. That is the one case where safety comes before privacy, and it is decided by a fixed rule rather than by a model.';

module.exports = { detect, composeResponse, DEFAULT_RESOURCES, SAFETY_EXCEPTION };
