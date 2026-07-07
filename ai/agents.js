/* ============================================================
   ai/agents.js — the Kernel's Cognitive Agents

   The kernel is not a chatbot. It is a small set of NAMED cognitive agents, each
   with one bounded job, a clear contract, and honest, evidence-backed output.
   Both lenses (IntelliQ for the person, Platform for the org) invoke the SAME
   agents — they differ only in which questions they ask and what they're allowed
   to see (the consent boundary lives in server.js, not here).

   THE FIVE AGENTS
     Observer   "I notice."     evidence → typed, self-relative observations   (ai/baseline + ingest)
     Historian  "I remember."   observations → durable memory                  (server: userAiProfiles)
     Analyst    "I connect."    observations + memory → patterns & assessment   (this file: analyst)
     Coach      "I reflect."    assessment → guidance for a human               (this file: reflections)
     Learner    "I improve."    action → outcome → what-works                   (server: _learningByPattern)

   This module owns the two agents that are pure reasoning composition — Analyst
   and Coach — plus the shared honesty contract. Observer/Historian/Learner are
   stateful (they touch stores) and stay in the server, but they speak this same
   contract. Nothing here reads raw text: inputs are privacy-safe features only.

   HONESTY CONTRACT (every agent, every output)
     - Evidence-backed: every claim traces to observations.
     - Confidence-rated: tentative < emerging < clear. Never a probability it can't back.
     - Directional, never scored. No ranking of people. No "prediction" language.
     - Self-relative: compare a person to THEIR OWN normal, never to others.
   ============================================================ */

const intelligence = require('./intelligence');

const AGENTS = {
  observer:  { role: 'I notice',   job: 'evidence → self-relative observations' },
  historian: { role: 'I remember', job: 'observations → durable memory' },
  analyst:   { role: 'I connect',  job: 'observations + memory → patterns & assessment' },
  coach:     { role: 'I reflect',  job: 'assessment → guidance for a human' },
  learner:   { role: 'I improve',  job: 'action → outcome → what-works' },
};

/* ── ANALYST ───────────────────────────────────────────────────────────────
   One coherent assessment of a person from their privacy-safe feature set:
   the patterns that fired (including the self-relative baseline_shift) and a
   composed, leader-ready item. Deterministic — no model call, so it's cheap,
   testable, and never hallucinates. `learning` is the org's what-works memory. */
function analyst(memberInput, learning = {}) {
  const patterns = intelligence.detectPatterns(memberInput);
  const assessment = intelligence.composeBriefingItem(memberInput, patterns, learning);
  return { patterns, assessment };            // assessment is null when nothing fired
}

/* ── COACH (person-facing) ─────────────────────────────────────────────────
   Builds the reflection prompt for IntelliQ — the person's OWN mirror. Warm,
   brief, self-relative, anchored in THEIR values and goals. Never scores, never
   ranks, never names private detail (sensitive context only softens tone).
   Returns { system, user } for the gateway; the caller runs it (single AI path).
   This is the IntelliQ magic, and its whole job is to make someone feel SEEN. */
function coachReflectionPrompt({ name, values = [], goals = [], fingerprint = {}, deviations = [], trajectory, hasSensitiveContext = false }) {
  const system = [
    `You are IntelliQ — a personal reflection companion that belongs to ${name || 'this person'}. You are their MIRROR, not their judge. You help them see themselves clearly and grow into who THEY are trying to become.`,
    `Voice: warm, specific, unhurried, honest. Speak to them as "you". 2–3 sentences. Like someone who has paid close attention and genuinely cares.`,
    `Hard rules:
- Reason from THEIR OWN values and goals — never impose outside standards.
- Compare them only to THEIR OWN normal (self-relative). Never to other people.
- No scores, no grades, no rankings, no numbers-as-verdicts. No "prediction" language.
- Name what is real and specific; never generic praise or platitudes.
- End with ONE small, gentle suggestion that feels like their own idea — an invitation, not an instruction.`,
    hasSensitiveContext
      ? `There may be personal weight in their life right now. Let that soften your tone — be extra gentle — but never state, guess at, or refer to the private detail itself.`
      : '',
  ].filter(Boolean).join('\n\n');

  const fpLines = Object.values(fingerprint)
    .map(f => `- ${f.label}: their usual is around ${f.normal}`)
    .join('\n');
  const devLines = deviations.length
    ? deviations.map(d => `- ${d.label} is ${d.deviationPct != null ? Math.abs(d.deviationPct) + '% ' : ''}${d.direction} their usual lately`).join('\n')
    : '- nothing notably different from their own normal right now';

  const user = [
    `PERSON: ${name || 'this person'}`,
    goals.length  ? `Working toward: ${goals.join('; ')}` : 'They have not named a goal yet — invite one gently, without pressure.',
    values.length ? `What they value: ${values.join(', ')}` : '',
    trajectory ? `Overall direction (self-relative): ${trajectory}` : '',
    fpLines ? `Their behavioural normal:\n${fpLines}` : '',
    `What has shifted for them lately (vs their own normal):\n${devLines}`,
    '',
    `Write a short, warm reflection directly to them — something that makes them feel accurately seen, grounded in what is actually true above.`,
  ].filter(Boolean).join('\n');

  return { system, user };
}

/* Shared honest-language helper — one place, so every surface says it the same way. */
function confidencePhrase(confidence) {
  return confidence === 'clear' ? 'a clear pattern'
       : confidence === 'emerging' ? 'an emerging pattern'
       : confidence === 'learning' ? 'still learning your normal'
       : 'an early, tentative signal';
}

module.exports = { AGENTS, analyst, coachReflectionPrompt, confidencePhrase };
