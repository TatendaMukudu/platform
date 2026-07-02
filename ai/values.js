/* ============================================================
   ai/values.js — the AI reasons from stated values & aims

   No presets. Two lenses, same principle:
     • orgDirective   — the ORGANISATION's values, desired traits,
                        and definition of success (captured at setup,
                        editable in Settings → Values).
     • memberDirective — the PERSON's own goals, values, strengths
                        and growth areas (captured at member onboarding).

   These colour HOW the AI thinks — never the wording of its answer
   (no lecturing, quoting, or parroting).
   ============================================================ */

function _clean(arr) {
  return (Array.isArray(arr) ? arr : []).map(v => String(v).trim()).filter(Boolean);
}

const _RULES = `- Let these quietly guide your judgement, then give ordinary, warm, practical guidance in plain words.
- Do not lecture, moralise, quote or name sources, or parrot them back. The perspective informs your thinking; it never becomes the wording of your answer.
- Keep each person's dignity, growth, and honest-but-kind guidance at the centre.`;

/* Organisation lens — values (guardrails), desired traits, success definition. */
function orgDirective(values, traits, success, orgName) {
  const v = _clean(values), t = _clean(traits), s = (success || '').trim();
  if (!v.length && !t.length && !s) return '';
  const who = orgName ? orgName : 'This organisation';
  const parts = [`REASON FROM ${who.toUpperCase()}'S VALUES:`];
  if (v.length) parts.push(`It values: ${v.join(', ')}.`);
  if (t.length) parts.push(`It wants to see: ${t.join(', ')}.`);
  if (s)        parts.push(`Success looks like: ${s}`);
  parts.push('Let these shape how you reason and what you prioritise — not how you speak.');
  parts.push(_RULES);
  return parts.join('\n');
}

/* Member lens — the person's own aims and values (used by member-facing AI). */
function memberDirective(profile, memberName) {
  if (!profile) return '';
  const goals = _clean([profile.goal, profile.mainGoals, profile.longTermGoals, profile.identity])
    .filter((g, i, a) => a.indexOf(g) === i);
  const vals  = _clean(profile.selectedValues);
  const grow  = _clean([profile.improvementAreas]);
  const str   = _clean([profile.strengths]);
  if (!goals.length && !vals.length && !grow.length && !str.length) return '';
  const who = memberName || 'this person';
  const parts = [`REASON FROM ${who.toUpperCase()}'S OWN GOALS & VALUES:`];
  if (goals.length) parts.push(`What they want: ${goals.slice(0, 3).join('; ')}.`);
  if (vals.length)  parts.push(`What they value: ${vals.join(', ')}.`);
  if (str.length)   parts.push(`Strengths to build on: ${str.join(', ')}.`);
  if (grow.length)  parts.push(`Growth areas they named: ${grow.join(', ')}.`);
  parts.push('Anchor your response to what THEY are trying to become.');
  parts.push(_RULES);
  return parts.join('\n');
}

module.exports = { orgDirective, memberDirective };
