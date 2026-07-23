/* ============================================================
   ai/capture.js — PURE capture-intent detection

   Decides, from ONE turn's text, whether the user is DELIBERATELY asking IntelliQ
   to remember something. This module never persists and never reasons about truth —
   it only classifies intent so the caller can honour the trust rule:

     • detection is automatic;
     • persistence is deliberate.

   Two signals:
     detectCommand(text) — an EXPLICIT save instruction ("remember this", "save these
       meeting minutes", "add this to our organisation knowledge"). These may save
       immediately (the user asked), and we distinguish PERSONAL from ORGANISATION
       scope and lift out the payload to store.
     looksDeclarative(text) — the message is informational (statements/data) rather
       than a question or chit-chat. These are NEVER saved silently; the caller
       offers a one-tap "Save it as evidence?" instead.

   Deterministic. No AI key. No side effects.
   ============================================================ */

// Verbs that begin an explicit save instruction.
const SAVE_VERB = '(?:remember|save|store|keep|note|record|log|add|memorise|memorize)';
// Words that mark ORGANISATION scope ("our team knowledge", "the club records").
const ORG_WORD = '(?:organisation|organization|org|team|company|club|group|department|squad)';

/* Detect an explicit save command. Returns null when there is none, else
   { scope: 'organisation'|'personal', payload, phrase }.
   `payload` is the content to store (the command phrasing stripped off); when the
   command is bare ("remember this") with no inline content, payload is '' and the
   caller should ask what to save (or attach the prior message). */
function detectCommand(text) {
  const raw = String(text == null ? '' : text).trim();
  if (!raw) return null;
  const l = raw.toLowerCase();

  // Must OPEN with a save verb (or "please <verb>") — "why should I save this?" is a
  // question, not a command, so we only treat a leading instruction as a command.
  const lead = new RegExp('^\\s*(?:please\\s+|can you\\s+|could you\\s+|pls\\s+)?' + SAVE_VERB + '\\b', 'i');
  if (!lead.test(raw)) return null;
  // A question form ("should I save this?", "do you remember…?") is not a command.
  if (/^\s*(?:do|should|can|could|would|will|did)\b/i.test(raw) || /\?\s*$/.test(raw)) {
    if (!/^\s*(?:please\s+)?(?:can|could) you\b/i.test(raw)) return null;
  }

  const orgScope = new RegExp('\\b(?:to|in|into|for|as)\\s+(?:our|the|my)\\s+' + ORG_WORD +
    '\\s+(?:knowledge|memory|record|records|evidence|wiki|handbook|files?)\\b', 'i').test(raw)
    || new RegExp('\\b(?:organisation|organization|org|team|company|club)\\s+(?:knowledge|memory|records?|evidence)\\b', 'i').test(raw)
    || new RegExp('\\b' + SAVE_VERB + '\\b[\\s\\S]{0,40}\\b(?:for|to|with)\\s+(?:the\\s+)?' + ORG_WORD + '\\b', 'i').test(raw);

  // Strip the leading instruction clause to recover the payload the user wants stored.
  let payload = raw
    .replace(new RegExp('^\\s*(?:please\\s+|can you\\s+|could you\\s+|pls\\s+)?' + SAVE_VERB +
      '(?:\\s+(?:this|that|these|those|the following|it))?' +
      '(?:\\s+(?:as|to|in|into|for)\\s+(?:our|the|my)\\s+' + ORG_WORD +
      '\\s+(?:knowledge|memory|record|records|evidence|wiki|handbook|files?))?' +
      '\\s*[:,\\-–—]?\\s*', 'i'), '')
    .trim();
  // If stripping left a bare pointer ("this"/"that"), there is no inline content.
  if (/^(?:this|that|these|those|it|the following)?\.?$/i.test(payload)) payload = '';

  return { scope: orgScope ? 'organisation' : 'personal', payload, phrase: raw.slice(0, 80) };
}

const QUESTION_RE = /\?\s*$|^\s*(?:who|what|when|where|why|how|which|whose|whom|is|are|am|do|does|did|can|could|should|would|will|may|might|shall|has|have|had)\b/i;
// Markers that a message is carrying INFORMATION worth keeping (minutes, stats, a
// policy, a plan) rather than a passing remark.
const INFO_RE = /\b(minutes|agenda|notes?|stats?|statistics|results?|score(?:s|line)?|policy|policies|procedure|plan|line-?up|lineup|roster|schedule|fixture|report|summary|record|data|figures?|budget|objectives?|targets?|decisions?|action items?)\b/i;

/* True when the message reads as durable INFORMATION (not a question, not chit-chat)
   that the user MIGHT want kept — so the caller offers a one-tap save. Deliberately
   conservative: a short line or a question never triggers an unsolicited offer. */
function looksDeclarative(text) {
  const raw = String(text == null ? '' : text).trim();
  if (raw.length < 40) return false;                 // too short to be a durable record
  if (QUESTION_RE.test(raw)) return false;           // a question, not an assertion
  const words = raw.split(/\s+/).length;
  const hasInfoMarker = INFO_RE.test(raw);
  const hasStructure = /[\n;:]|(?:\d+[.)]\s)|(?:^|\s)[-*]\s/.test(raw);   // lists / a "label: …" record / multiple clauses
  const hasNumbers = /\d/.test(raw);
  // Substantial AND carries at least one signal of being a record.
  return words >= 8 && (hasInfoMarker || hasStructure || (hasNumbers && words >= 12));
}

module.exports = { detectCommand, looksDeclarative };
