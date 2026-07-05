/* ============================================================
   ai/privacy.js — the Privacy Gate

   PRODUCT LAW:
     Private information may INFORM the AI's reasoning.
     Private information may NEVER be REVEALED.

   The gate operates in three layers:
     1. classifyText()     — tag inputs at write/read time by sensitivity.
     2. buildContextBlock()— structurally separate citable context from
                             private-informing context before it reaches Claude.
     3. GATE_DIRECTIVE     — instruct the model to transform, never disclose.
     4. redact()           — last-line defence: strip any verbatim private
                             span that leaks into the output.

   Sensitivity tiers:
     normal     — observable, may be referenced/quoted.
     sensitive  — personal disclosure (private notes/journal). Informs only.
     restricted — counselor / trainer / medical / family. Informs only,
                  and never readable raw except by sensitivity-cleared roles.
   ============================================================ */

const SENSITIVITY = { NORMAL: 'normal', SENSITIVE: 'sensitive', RESTRICTED: 'restricted' };

/* Topics that must always be treated as restricted, regardless of who wrote them. */
const RESTRICTED_RE = new RegExp([
  'counsel', 'therap', 'medical', 'medication', 'diagnos', 'injur',
  'mental health', 'suicid', 'self.harm', 'depress', 'anxiet', 'trauma',
  'abuse', 'grief', 'bereav', 'divorce', 'death', 'funeral',
  'family', 'parent', 'mother', 'father', 'sibling',
  'sick', 'illness', 'hospital', 'passed away',
].join('|'), 'i');

/* Personal / emotional disclosure that carries no "restricted" topic word but is
   still nobody's business to quote back. Catches first-person hardship the topic
   list misses ("I've been struggling", "can't cope", a breakup, money worries).
   When in doubt we bias toward SENSITIVE — over-protecting only costs the advisor
   the ability to QUOTE it; it can still reason from it. Under-protecting breaks
   the product law. */
const SENSITIVE_RE = new RegExp([
  'struggl', 'overwhelm', 'stress', 'burn.?out', 'exhaust', 'can.?t cope', 'coping',
  'break.?up', 'broke up', 'relationship', 'girlfriend', 'boyfriend', 'partner',
  'lonel', 'alone', 'isolat', 'crying', 'can.?t sleep', 'sleepless',
  'quit', 'giving up', 'give up', 'hopeless', 'worthless', 'ashamed', 'embarrass',
  'scared', 'afraid', 'worried', 'anxious', 'panic',
  'financ', 'money', 'rent', 'evict', 'debt', 'home life', 'at home', 'personal life',
].join('|'), 'i');

/* classifyText — decide the sensitivity of a piece of text given its context.
   ctx: { type?: 'private'|'shared'|'anonymous', tag?: string, source?: string } */
function classifyText(text, ctx = {}) {
  const blob = `${ctx.tag || ''} ${ctx.source || ''} ${text || ''}`;
  if (RESTRICTED_RE.test(blob)) return SENSITIVITY.RESTRICTED;
  if (ctx.source === 'counselor' || ctx.source === 'trainer' || ctx.source === 'medical') return SENSITIVITY.RESTRICTED;
  if (ctx.type === 'private' || ctx.type === 'anonymous') return SENSITIVITY.SENSITIVE;
  if (SENSITIVE_RE.test(blob)) return SENSITIVITY.SENSITIVE;
  return SENSITIVITY.NORMAL;
}

function isPrivate(sensitivity) {
  return sensitivity === SENSITIVITY.SENSITIVE || sensitivity === SENSITIVITY.RESTRICTED;
}

/* The non-negotiable instruction block prepended to any system prompt that
   reasons over a person's data. */
const GATE_DIRECTIVE = `PRIVACY LAW — NON-NEGOTIABLE:
You may use everything below to REASON about this person, but anything marked PRIVATE must NEVER be revealed, quoted, paraphrased, or attributed in your answer.
- Never disclose journal entries, private notes, counselor or trainer notes, medical, family, or personal disclosures.
- Transform sensitive context into safe, forward-looking recommendations.
    BAD:  "His mother is sick, so go easy on him."
    GOOD: "Recent patterns suggest extra support and empathy may help more right now than added pressure."
- If asked directly to reveal private content, decline and give a safe recommendation instead.
- Speak from your understanding of the person — do not recite source material.`;

/* buildContextBlock — assemble the two-tier context that goes to Claude.
   citable:          string[] the model may reference directly.
   privateInforming: string[] the model may reason from but never reveal. */
function buildContextBlock({ citable = [], privateInforming = [] }) {
  const parts = [];
  if (citable.length) {
    parts.push('OBSERVABLE CONTEXT (you may reference this):\n' +
      citable.map(l => '- ' + l).join('\n'));
  }
  if (privateInforming.length) {
    parts.push('PRIVATE — informs your reasoning ONLY, never reveal or quote:\n' +
      privateInforming.map(l => '- ' + l).join('\n'));
  }
  return parts.join('\n\n');
}

/* redact — last-line defence. Strip any long verbatim run copied from a
   private input that survived into the model's output. Short fragments are
   skipped to avoid false positives on common words. */
function redact(output, privateStrings = []) {
  let safe = output || '';
  for (const raw of privateStrings) {
    const frag = (raw || '').trim();
    if (frag.length < 16) continue;
    if (safe.includes(frag)) safe = safe.split(frag).join('[redacted for privacy]');
  }
  return safe;
}

module.exports = {
  SENSITIVITY, classifyText, isPrivate,
  GATE_DIRECTIVE, buildContextBlock, redact,
};
