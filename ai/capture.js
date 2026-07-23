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

// A message (or clause) is an INFORMATION REQUEST when it ends in a question mark
// or opens with an interrogative / info-imperative — not brittle topic keywords, so
// "what are our pressing triggers" and "tell me the game plan" both qualify.
const QUESTION_LEAD = /^(?:\s*(?:hey|hi|ok|okay|so|and|also|please|pls)\b[ ,]*)*(?:who|what|whats|what's|when|where|why|how|hows|how's|which|whose|whom|is|are|was|were|do|does|did|can|could|should|would|will|may|might|shall|tell me|explain|describe|show me|list|give me|walk me through|remind me (?:what|when|who|where|how|which))\b/i;
function looksLikeQuestion(text) {
  const raw = String(text == null ? '' : text).trim();
  if (!raw) return false;
  if (/\?/.test(raw)) return true;
  return QUESTION_LEAD.test(raw);
}

/* Classify ONE turn into the shape the grounded-turn pipeline needs — deterministic,
   no topic keywords. Splits into sentences so a MIXED turn ("Remember X. What is Y?")
   is separated cleanly: the command payload excludes the question, and the question
   text excludes the command. Returns:
     { kind, command, isQuestion, questionText, declarative }
   kind ∈ question | capture_command | declarative | mixed | conversation.
   The caller uses the FIELDS (command / isQuestion / questionText); `kind` is a label. */
function classify(text) {
  const raw = String(text == null ? '' : text).trim();
  const sentences = raw.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
  const qSentences   = sentences.filter(looksLikeQuestion);
  const nonQSentences = sentences.filter(s => !looksLikeQuestion(s));
  const isQuestion = qSentences.length > 0 || (sentences.length <= 1 && looksLikeQuestion(raw));
  // Detect the command on the NON-question part so a trailing question never leaks
  // into the saved payload; fall back to the whole text when there is no split.
  const nonQText = nonQSentences.join(' ').trim();
  const command = detectCommand(nonQText || raw) || (nonQText ? detectCommand(raw) : null);
  const questionText = qSentences.join(' ').trim() || (isQuestion ? raw : '');
  const declarative = looksDeclarative(raw);
  const hasPayload = !!(command && command.payload);
  let kind;
  if (hasPayload && isQuestion)  kind = 'mixed';
  else if (hasPayload)           kind = 'capture_command';
  else if (isQuestion)           kind = 'question';
  else if (declarative)          kind = 'declarative';
  else                           kind = 'conversation';
  return { kind, command, isQuestion, questionText, declarative };
}

module.exports = { detectCommand, looksDeclarative, looksLikeQuestion, classify };
