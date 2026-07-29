/* ============================================================
   ai/comprehend.js — deterministic UNDERSTANDING (pure)

   The parallel to ai/voice.js, for the ears. It turns free text into the SAME bounded
   features the LLM edge produced — sentiment, allow-listed themes, intensity — using a
   transparent lexicon + rules. No model, nothing leaves the box.

   It is deliberately MODEST: it will not catch sarcasm, nuance, or a clever turn of
   phrase the way an LLM would. But the only thing we EVER allow out of understanding is
   a handful of bounded features (see ai/understanding), and for that a lexicon gets
   surprisingly far — honestly, privately, testably, for free. Its output is still passed
   through ai/understanding.sanitizeFeatures upstream as the guard.

   What stays an LLM's job: nuanced, free-form conversation (answering a question in
   prose). This module measures how small that remaining job is.

   PURE: imports nothing, no IO. Handles negation ("not tired" ≠ tired).
   ============================================================ */

// Allow-listed THEMES → trigger stems (token.startsWith). Keys mirror ai/understanding's
// allow-list, so the output is in-bounds by construction. Clinical / protected words are
// deliberately ABSENT — they can never become a theme.
const THEME = {
  workload:     ['workload', 'overload', 'swamp', 'stretch', 'deadline', 'piling', 'stacked', 'slammed'],
  fatigue:      ['tired', 'exhaust', 'drain', 'knacker', 'fatigue', 'burnt', 'burned', 'shattered', 'sleep'],
  motivation:   ['motivat', 'unmotivat', 'bothered', 'uninspired', 'fired', 'driven', 'apath'],
  confidence:   ['confiden', 'doubt', 'nervous', 'assured', 'unsure', 'insecure', 'self-belief'],
  focus:        ['focus', 'distract', 'concentrat', 'scattered', 'locked'],
  belonging:    ['belong', 'exclud', 'isolat', 'alone', 'lonely', 'outsider'],
  conflict:     ['argument', 'argu', 'clash', 'tension', 'disagree', 'conflict', 'fallout'],
  recognition:  ['recognis', 'recogniz', 'appreciat', 'praise', 'credit', 'overlook'],
  progress:     ['progress', 'improv', 'stronger', 'breakthrough', 'growing', 'climb', 'sharper'],
  setback:      ['setback', 'worse', 'slipp', 'regress', 'declin', 'plateau'],
  support_need: ['stuck', 'struggl', 'overwhelm', 'help'],
  logistics:    ['schedul', 'travel', 'venue', 'transport', 'fixture', 'logistic'],
};

const POS = ['good', 'great', 'better', 'strong', 'progress', 'improv', 'confiden', 'happy', 'proud', 'positive', 'love', 'enjoy', 'excited', 'recognis', 'appreciat', 'breakthrough', 'growing', 'climb', 'sharper', 'motivat'];
const NEG = ['bad', 'worse', 'struggl', 'tired', 'exhaust', 'overload', 'overwhelm', 'stress', 'anxious', 'worried', 'flat', 'stuck', 'isolat', 'frustrat', 'difficult', 'poor', 'tension', 'setback', 'drain', 'doubt', 'unmotivat', 'lonely'];
const NEGATORS = new Set(['not', 'no', 'never', 'without', 'hardly', 'barely', 'isnt', 'arent', 'wasnt', 'dont', 'doesnt', 'didnt', 'cant', 'wont', 'aint']);
const INTENSE = new Set(['very', 'really', 'so', 'extremely', 'totally', 'completely', 'absolutely', 'incredibly', 'beyond', 'massively']);

function _tokens(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/[''`]/g, '').replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(Boolean);
}
function _negatedBefore(toks, i) {
  for (let j = Math.max(0, i - 3); j < i; j++) if (NEGATORS.has(toks[j])) return true;
  return false;
}
const _starts = (tok, stems) => stems.some(st => tok.startsWith(st));

/* Turn text into bounded features. Deterministic; negation-aware; invents nothing. */
function comprehend(text) {
  const toks = _tokens(text);
  if (!toks.length) return { sentiment: 0, themes: [], intensity: 'low', sensitive: false };

  const themes = [];
  for (const [theme, stems] of Object.entries(THEME)) {
    for (let i = 0; i < toks.length; i++) {
      if (_starts(toks[i], stems) && !_negatedBefore(toks, i)) { if (!themes.includes(theme)) themes.push(theme); break; }
    }
  }

  let score = 0, hits = 0;
  for (let i = 0; i < toks.length; i++) {
    let s = _starts(toks[i], POS) ? 1 : _starts(toks[i], NEG) ? -1 : 0;
    if (s !== 0) { if (_negatedBefore(toks, i)) s = -s; score += s; hits++; }
  }
  const sentiment = score > 0 ? 1 : score < 0 ? -1 : 0;
  const intensity = (toks.some(t => INTENSE.has(t)) || Math.abs(score) >= 3) ? 'high' : (hits > 0 ? 'medium' : 'low');
  return { sentiment, themes: themes.slice(0, 5), intensity, sensitive: false };
}

module.exports = { comprehend, THEME, POS, NEG };
