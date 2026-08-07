/* ============================================================
   ai/reasoning-register.js — TWO REGISTERS OF KNOWLEDGE, kept honest.

   The core insight: not every question is an "org truth" question. A member can ask
   something the deterministic core rightly owns ("how's my team doing?" — ORG FACT), or
   something the core has no business inventing but an LLM can genuinely reason about ("why
   is a 4-3-3 better than a 5-3-2?" — WORLD KNOWLEDGE), or both at once ("given how we're
   doing, should we switch to a back four?" — MIXED). Forcing all three through the org-truth
   path is why a fair question dead-ended with "not enough authorised evidence".

   This module does two PURE things (no IO, no LLM, no DB):
     1. classifyRegister(question) — decide which register a question lives in. Deterministic,
        feature-based; this is the structured replacement for brittle keyword branches.
     2. assembleGoverned(...) — take PROVENANCE-TAGGED claims (from the LLM at the edge) and
        enforce CITE-OR-ASK in code, not just in the prompt:
          • org_data  → kept ONLY if it cites real authorised evidence; otherwise it is
                        demoted to an open question ("I don't have that recorded — is it…?").
                        The LLM physically cannot pass an invented org fact off as truth.
          • general   → kept, but LABELLED as general reasoning, never as your data.
          • user_input→ never asserted; returned as a confirmation-gated capture proposal.

   The belief ledger is still only ever written by deterministic derivation elsewhere. This
   layer reasons and explains; it never decides what is true about the org.
   ============================================================ */

/* ── 1. REGISTER CLASSIFIER ──────────────────────────────────────────────────
   Feature detectors over the lowered question. Kept deliberately readable and each
   independently testable. Order of combination matters (see below). */

// Does the question reference THIS organisation / its people / its state?
const ORG = new RegExp([
  /\b(our|my)\s+(team|squad|club|org|organisation|organization|group|department|company|players?|staff|people|members?|side|cohort|class)\b/.source,
  /\b(the)\s+(team|squad|club|org|organisation|organization|group|department|players?|staff|side)\b/.source,
  /\bhow(?:'s| is| are| do| did)\s+(?:we|us|the team|the org|things|everyone|the group|the squad|the club)\b/.source,
  /\b(who needs|what'?s outstanding|what needs (?:doing|me|attention)|are we ready|how are we doing|what changed)\b/.source,
  /\b(we|us|our|everyone|internally|in here|in our)\b/.source,
].join('|'), 'i');

// Is this a general-knowledge / reasoning / advice question the LLM can legitimately answer?
const WORLD = new RegExp([
  /\bwhy\b/.source,
  /\bhow (?:do|does|to|would|can|should)\b/.source,
  /\bwhat (?:is|are|makes|would|kind of|type of)\b/.source,
  /\b(explain|define|meaning of|tell me how)\b/.source,
  /\btell me (?:more )?about\b/.source,
  /\bwhat do you know about\b/.source,
  /\b(difference between|better than|worse than|vs\.?|versus|compared? to|instead of)\b/.source,
  /\b(pros and cons|trade-?offs?|advantages?|disadvantages?|benefits?)\b/.source,
  /\bshould (?:i|we|you|they)\b/.source,
  /\bis it (?:better|worth|good|bad|wise|smart)\b/.source,
  /\bbest (?:way|approach|formation|method|practice|strategy|option)\b/.source,
  /\bwhen should\b/.source,
].join('|'), 'i');

// Is the person asking for help BUILDING or PLANNING something?
const PLAN = new RegExp([
  /\b(plan|planning|roadmap|schedule)\b/.source,
  /\b(create|build|draft|design|outline|structure|put together|come up with|write (?:me|a|up)|prepare (?:a|me)|map out|sketch)\b/.source,
  /\bhelp me (?:with|build|create|plan|work|figure|prepare|design|draft|think|put)\b/.source,
  /\bwork (?:on|through|out)\b/.source,
  /\b(session|drill|training|curriculum|programme|program|agenda|strategy for|approach for)\b/.source,
].join('|'), 'i');

/* Is the person asking about THIS CONVERSATION rather than the organisation's records?
   "What did I just tell you?" is not an org lookup — answering it from the evidence store
   dead-ends ("not enough authorised evidence") even though the answer is right there in the
   thread. Recall is answered DETERMINISTICALLY from the conversation, so it needs no model,
   sends nothing anywhere, and cannot fabricate.
   NOTE the deliberate narrowness: "what did I say ABOUT MY SORE KNEE" names a topic, so it is a
   lookup of recorded evidence, NOT thread recall. Recall fires only when the question is plainly
   about this exchange — it says "just", or it names no topic at all. */
const RECALL = new RegExp([
  // "just" is the giveaway that they mean this exchange rather than something recorded
  /\bwhat did i just (?:say|tell you|mention|ask)\b/.source,
  /\bwhat was i just (?:saying|talking about|asking)\b/.source,
  /\bwhat (?:did|have) we just (?:say|said|discuss(?:ed)?|talk(?:ed)? about|cover(?:ed)?)\b/.source,
  /\bdo you (?:remember|recall) what i just (?:said|told you)\b/.source,
  /\b(?:remind me|tell me) what i just (?:said|told you)\b/.source,
  // …or a BARE "what did I say?" that names no topic at all
  /\bwhat did i (?:say|tell you)\s*\??$/.source,
  /\b(?:repeat|recap) (?:that|what i (?:just )?said|our (?:chat|conversation))\b/.source,
].join('|'), 'i');

/* Return the register plus the raw signals (so callers/tests can see WHY). A question that
   touches the org AND asks for reasoning/planning is MIXED — the most valuable case, where
   world knowledge is fused with the grounded read. Pure org-state questions stay org_fact so
   they keep the deterministic path (no model needed, no egress). */
function classifyRegister(question) {
  const q = String(question || '').toLowerCase().trim();
  const hasOrg  = ORG.test(q);
  const hasWorld = WORLD.test(q);
  const hasPlan = PLAN.test(q);
  const hasRecall = RECALL.test(q);
  let register;
  if (!q) register = 'org_fact';
  // Recall is unambiguous and wins outright — it is about the thread, not the records.
  else if (hasRecall) register = 'recall';
  else if (hasOrg && (hasWorld || hasPlan)) register = 'mixed';
  else if (hasPlan && !hasOrg) register = 'planning';
  else if (hasWorld && !hasOrg) register = 'world_knowledge';
  else register = 'org_fact';                 // default: try the grounded read (safe, no egress)
  return { register, signals: { hasOrg, hasWorld, hasPlan, hasRecall } };
}

/* ── OUTPUT POLISH ───────────────────────────────────────────────────────────
   The output IS the product, so the model's prose gets a deterministic pass before anyone
   reads it. Deliberately limited to transforms that CANNOT damage meaning or grammar: strip
   emoji (house style), drop the assistant-ese prefaces ("Great question!", "Certainly,"),
   and normalise whitespace. Anything riskier than this — rewriting a sentence into second
   person, say — is left to the prompt, because a bad rewrite is worse than the original. */
const _EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{1F900}-\u{1F9FF}]/gu;
function polish(s) {
  return String(s == null ? '' : s)
    .replace(_EMOJI, '')
    .replace(/^\s*(?:great|good|excellent|interesting)\s+question[!.,]*\s*/i, '')
    .replace(/^\s*(?:certainly|sure thing|sure|of course|absolutely|happy to help)[!.,]+\s*/i, '')
    // The reply is rendered as PLAIN TEXT, so markdown emphasis arrives as literal asterisks
    // ("**Body shape on receipt.**"). Strip the markers and keep the words.
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s.,;:!?)]|$)/g, '$1$2')
    .replace(/(^|\n)\s*[-–•]\s+/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/* Answer a RECALL question from the conversation itself. Pure and deterministic: it quotes
   what was actually said and invents nothing, so it needs no model and no egress. Returns
   null when there is nothing to recall, so the caller can say so honestly. */
function composeRecall(priorMessages = []) {
  const said = (Array.isArray(priorMessages) ? priorMessages : [])
    .filter(m => m && m.role === 'user' && String(m.text || '').trim());
  if (!said.length) return null;
  const last = _clip(String(said[said.length - 1].text).trim(), 300);
  if (said.length === 1) return `You told me: “${last}”`;
  const before = said.slice(0, -1).slice(-2).map(m => `“${_clip(String(m.text).trim(), 120)}”`);
  return `The last thing you told me was: “${last}” Before that: ${before.join(', ')}.`;
}

// Does answering this register benefit from world-knowledge reasoning (i.e. an LLM edge)?
// org_fact is answered purely from the deterministic read; the rest want reasoning.
function wantsReasoning(register) { return register === 'world_knowledge' || register === 'mixed' || register === 'planning'; }

/* ── 2. GOVERNED ASSEMBLER ───────────────────────────────────────────────────
   Given the provenance-tagged claims an LLM produced (each { text, provenance, evidenceRefs?,
   confidence? }), plus the set of authorised evidence ids for THIS turn, enforce cite-or-ask
   and compose a clean, honest answer. The LLM's raw prose is never trusted directly — the
   answer is composed from VALIDATED claims, so an uncited org fact can't survive into it. */
function assembleGoverned({ claims = [], openQuestions = [], captures = [], allowedRefs = [], lead = '' } = {}) {
  const allowed = new Set(allowedRefs || []);
  const grounded = [];         // org_data, cites real authorised evidence
  const general  = [];         // world knowledge, labelled
  const asks     = [];         // things it doesn't know / demoted uncited org claims
  const proposals = [];        // user_input → confirmation-gated captures

  for (const raw of Array.isArray(claims) ? claims : []) {
    const text = polish(raw && raw.text);
    if (!text) continue;
    const prov = String(raw.provenance || raw.tag || '').toLowerCase();
    const conf = raw.confidence || 'medium';
    if (prov === 'org_data' || prov === 'org') {
      const refs = (Array.isArray(raw.evidenceRefs) ? raw.evidenceRefs : []).filter(r => allowed.has(r));
      if (refs.length) grounded.push({ text, evidenceRefs: refs, confidence: conf });
      else asks.push(`I don't have "${_clip(text)}" recorded — is that right, or should I look into it?`); // CITE-OR-ASK
    } else if (prov === 'general' || prov === 'world' || prov === 'world_knowledge') {
      general.push({ text, confidence: conf });
    } else if (prov === 'user_input' || prov === 'user' || prov === 'asserted') {
      proposals.push({ text, kind: raw.kind || 'note' });
    } else {
      // Unknown/absent provenance about the org is unsafe to assert — treat as a question,
      // never as fact. (An LLM that forgets to tag doesn't get to smuggle a claim through.)
      asks.push(`I want to check something before I say it as fact: ${_clip(text)}`);
    }
  }
  for (const oq of Array.isArray(openQuestions) ? openQuestions : []) {
    const t = polish(oq); if (t) asks.push(t);
  }
  for (const c of Array.isArray(captures) ? captures : []) {
    const t = String(c && (c.text || c) || '').trim(); if (t) proposals.push({ text: t, kind: (c && c.kind) || 'note' });
  }

  // Compose: general reasoning, then the grounded read (clearly "from your data"), then the
  // honest gaps. De-duplicated, trimmed, and never claiming org fact without a citation.
  const parts = [];
  if (lead) parts.push(String(lead).trim());
  if (general.length) parts.push(general.map(g => g.text).join(' '));
  if (grounded.length) parts.push('From your recorded signals: ' + grounded.map(g => g.text).join(' '));
  if (asks.length) parts.push(asks.slice(0, 2).join(' '));
  const answer = parts.join(' ').replace(/\s+/g, ' ').trim();

  const provenance = [
    ...general.map(g => ({ tag: 'general', text: g.text })),
    ...grounded.map(g => ({ tag: 'org_data', text: g.text, refs: g.evidenceRefs })),
    ...asks.map(a => ({ tag: 'ask', text: a })),
  ];
  // Confidence: grounded-with-evidence is medium; general-only is honestly 'general' (labelled,
  // not a claim about the org); nothing usable is 'none'.
  let confidence = 'none';
  if (grounded.length) confidence = 'medium';
  else if (general.length) confidence = 'general';

  const limitations = [];
  if (general.length) limitations.push('includes general reasoning, clearly separate from your recorded data');
  if (grounded.length) limitations.push('grounded claims cite your recorded signals only');
  if (asks.length) limitations.push('some of this I flagged to check rather than assert');

  return { answer, grounded, general, asks, captureProposals: proposals, provenance, confidence, limitations,
    usable: !!(answer && (grounded.length || general.length || asks.length)) };
}

function _clip(s, n = 90) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; }

/* ── 3. THE PROMPT (kept here so it is versioned + testable, not buried in a call site) ──
   The single system contract for the reasoning edge. Every rule that keeps the LLM honest
   lives in ONE place. The assembler above is the belt to this prompt's braces — even if the
   model ignores an instruction, an uncited org claim is demoted in code. */
const SYSTEM_PROMPT = [
  'You are the reasoning voice of IntelliQ, a governed organisational assistant.',
  'You reason in TWO clearly separated registers and you never blur them:',
  '  • GENERAL knowledge — domain reasoning you legitimately know (tactics, methods, planning,',
  '    trade-offs). Tag these claims "general". You may reason freely here.',
  '  • ORG data — facts about THIS organisation. You may ONLY state an org fact if it is present',
  '    in the AUTHORISED CONTEXT provided to you, and you MUST cite its evidence id in',
  '    evidenceRefs. Tag these "org_data". If you do not have it, DO NOT guess — put it in',
  '    openQuestions instead. Never invent a name, number, date, result, or event.',
  'If the user asserts something about their org that you cannot verify, do NOT treat it as',
  '  fact: put it in "captures" so it can be confirmed and recorded — tag any use of it',
  '  "user_input".',
  'When you genuinely do not know something, say so via openQuestions. Being honest about a gap',
  '  is always better than filling it.',
  'HOW TO WRITE (the output is the product — govern it as carefully as the facts):',
  '  • Speak TO the person, not about them: "you", never their name in the third person.',
  '  • Plain, warm, direct British English. Short sentences. No jargon, no filler, no hype.',
  '  • No emojis, no exclamation marks, no bullet characters inside claim text.',
  '  • Do not preface with "Great question", "Certainly", or restate the question back.',
  '  • Be concrete and specific. One clear idea per claim; cut every word that earns nothing.',
  'Respond ONLY with JSON: { "claims": [ { "text": string, "provenance": "general"|"org_data"',
  '  |"user_input", "evidenceRefs": string[]?, "confidence": "high"|"medium"|"low"? } ],',
  '  "openQuestions": string[], "captures": [ { "text": string, "kind": "note" } ] }.',
].join('\n');

/* Build the user message: the question plus the authorised, de-identified-where-appropriate
   context the model may cite. Context rows are { ref, text }. Pure string assembly. */
function buildUserMessage({ question, context = [], priorMessages = [] } = {}) {
  const lines = [];
  // Conversation memory — prior turns give a follow-up its context ("yes, for my U16s"). It is
  // conversational history, NOT a source of org truth: org claims still require a citation below.
  const prior = (Array.isArray(priorMessages) ? priorMessages : []).filter(m => m && m.text).slice(-8);
  if (prior.length) {
    lines.push('CONVERSATION SO FAR (for continuity only — not a source of org facts):');
    for (const m of prior) lines.push(`  ${m.role === 'assistant' ? 'You' : 'User'}: ${_clip(m.text, 240)}`);
    lines.push('');
  }
  lines.push(`QUESTION: ${String(question || '').trim()}`, '');
  if (context.length) {
    lines.push('AUTHORISED CONTEXT (the ONLY org facts you may cite; use the ref in evidenceRefs):');
    for (const c of context.slice(0, 24)) lines.push(`  [${c.ref}] ${_clip(c.text, 200)}`);
  } else {
    lines.push('AUTHORISED CONTEXT: (none — you have no org facts for this question; reason in general terms and/or ask.)');
  }
  return lines.join('\n');
}

module.exports = { classifyRegister, wantsReasoning, assembleGoverned, buildUserMessage, composeRecall, polish, SYSTEM_PROMPT };
