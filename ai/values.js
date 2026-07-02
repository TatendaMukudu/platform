/* ============================================================
   ai/values.js — the AI reasons from the org's OWN values

   No presets, no worldview toggle. An organisation enters its
   values (at setup and in Settings → Values); every AI surface
   then reasons from those values. A faith org that lists
   "faith, grace, service, integrity" gets guidance shaped by
   that, without any religious special-casing or preaching.

   The values colour HOW the AI thinks — never the wording of
   its answer (no lecturing, quoting, or parroting).
   ============================================================ */

function valuesDirective(values, orgName) {
  const list = (Array.isArray(values) ? values : [])
    .map(v => String(v).trim()).filter(Boolean);
  if (!list.length) return '';
  return `REASON FROM THIS ORGANISATION'S VALUES:
${orgName ? orgName + ' has' : 'This organisation has'} chosen to value: ${list.join(', ')}.
Let these values shape HOW you reason and what you prioritise — not how you speak on the surface.
- Let them quietly guide your judgement, then give ordinary, warm, practical guidance in plain words.
- Do not lecture, moralise, quote or name sources, or parrot the values back. The perspective informs your thinking; it never becomes the wording of your answer.
- Keep each person's dignity, growth, and honest-but-kind guidance at the centre.`;
}

module.exports = { valuesDirective };
