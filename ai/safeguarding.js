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
const CONCERN = [
  /\b(hopeless|worthless|pointless|can'?t (cope|go on|do this|take (it|this) any ?more)|giving up|falling apart|breaking down)\b/,
  /\b(so|really|completely|totally|utterly)\s+(alone|empty|numb|overwhelmed|exhausted|broken|lost)\b/,
  /\bhate\s+(myself|my life|everything)\b/,
  /\bcry(ing)?\s+(all|every|myself)\b/,
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

module.exports = { detect, composeResponse, DEFAULT_RESOURCES };
