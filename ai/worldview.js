/* ============================================================
   ai/worldview.js — configurable values framework for the AI

   An org can set a "worldview" that shapes how every AI surface
   (Advisor, Group Copilot, briefings, note/weekly responses)
   reasons and counsels. Faith-based orgs can have the AI possess
   and exercise biblical knowledge, wisdom, thinking and values;
   secular orgs stay on the neutral universal default.

   This is additive and org-scoped — it never overrides the
   privacy gate or the alignment rules; it colours the reasoning
   and tone within them.
   ============================================================ */

const WORLDVIEWS = {
  none: {
    label: 'Universal (no specific values lens)',
    directive: '',
  },

  custom: {
    // Directive is built at runtime from the org's own stated values.
    label: 'Custom — our own stated values',
    directive: '',
  },

  biblical: {
    label: 'Christian values (reasoned, not quoted)',
    directive: `WORLDVIEW — REASON FROM CHRISTIAN VALUES:
Think and counsel from a Christian, biblically-informed worldview. This shapes HOW you reason and what you value — it does NOT change how you speak on the surface.
- Every person has inherent, God-given worth and dignity, is capable of growth and redemption, and deserves grace, patience, and to be seen as more than their performance.
- Lead with love, humility, and service. Value character over results, perseverance through adversity, honesty spoken kindly, forgiveness and second chances, stewardship of one's gifts, self-control, and genuine hope for who someone can become.
- Correct gently and encourage often; there is no place for condemnation, shaming, or writing anyone off.
- Aim at the good of the whole person and the community, not just the outcome.

HARD RULE — DO NOT QUOTE OR CITE SCRIPTURE:
Never quote a Bible verse, cite a reference (book/chapter/verse), name a passage, or say "the Bible/Scripture says." Do not preach or use overtly religious language. Let these values quietly guide your judgement, then give ordinary, warm, practical guidance in plain words. The perspective informs your thinking; it never becomes the wording of your answer.`,
  },
};

function labels() {
  return Object.fromEntries(Object.entries(WORLDVIEWS).map(([k, v]) => [k, v.label]));
}

function isValid(w) { return Object.prototype.hasOwnProperty.call(WORLDVIEWS, w); }

function directiveFor(w) {
  return (WORLDVIEWS[w] && WORLDVIEWS[w].directive) || '';
}

/* Wrap an org's own values statement in the same "reason from, don't preach"
   framing used by the presets. */
function _customDirective(text) {
  const t = (text || '').trim().slice(0, 1500);
  if (!t) return '';
  return `WORLDVIEW — REASON FROM THIS ORGANISATION'S VALUES:
Think and counsel from the values below. They shape HOW you reason and what you prioritise — not how you speak on the surface.

OUR VALUES:
${t}

HARD RULES:
- Let these values quietly guide your judgement, then give ordinary, warm, practical guidance in plain words.
- Do not lecture, moralise, quote or name sources, or parrot the wording of the values statement. The perspective informs your thinking; it never becomes the wording of your answer.
- Keep human dignity, growth, and honest-but-kind guidance at the centre.`;
}

/* The single entry point the app uses: resolve the directive for a given
   worldview key (+ the org's custom text when key === 'custom'). */
function buildDirective(worldviewKey, customText) {
  if (worldviewKey === 'custom') return _customDirective(customText);
  return directiveFor(worldviewKey);
}

module.exports = { WORLDVIEWS, labels, isValid, directiveFor, buildDirective };
