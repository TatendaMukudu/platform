/* ============================================================
   ai/language-guard.js — the no-prediction / no-diagnosis guard (PURE)

   The rule the whole system lives by: IntelliQ DESCRIBES what recurred and what
   co-occurred. It never says what WILL happen (prediction / forecast), and never names
   what someone HAS (a diagnosis). The deterministic core already obeys this by
   construction. This guard exists for the LLM EDGES: any model-phrased text must pass
   through here, and anything that predicts or diagnoses is rejected — the caller falls
   back to the deterministic, descriptive line.

   Deliberately aggressive: a false positive just means the honest deterministic sentence
   is shown instead, which is always safe. Under-blocking is the only real danger.
   PURE: imports nothing, no IO. The tests both attack it (predictive phrasings must be
   caught) and defend it (the system's own deterministic outputs must pass).
   ============================================================ */

// Prediction / forecasting — claims about the FUTURE, or trajectories toward an outcome.
const PREDICTIVE = new RegExp([
  'predict', 'forecast', 'anticipat', 'projec(?:ted|tion)', 'prognos',
  'likely\\s+to', 'unlikely\\s+to', 'expect(?:ed|s)?\\s+to', 'going\\s+to', 'set\\s+to',
  'bound\\s+to', 'destined', 'on\\s+track\\s+to', 'head(?:ed|ing)?\\s+(?:for|toward)',
  'trend(?:ing)?\\s+toward', 'could\\s+lead\\s+to', 'would\\s+lead\\s+to', 'may\\s+lead\\s+to',
  'if\\s+(?:this|it|things?|nothing)\\s+(?:continue|persist|keep|change)',
  'at\\s+risk\\s+of', 'in\\s+danger\\s+of',
  'will\\s+(?:likely|probably|continue|keep|worsen|improve|drop|decline|struggle|happen|become|end\\s+up|get\\s+worse|get\\s+better|lead|start|stop|fail|succeed)',
].join('|'), 'i');

// Bald prophecies need a narrower boundary than a blanket ban on "will": ordinary
// product facts ("the report will open") are allowed, while a person + outcome is not.
// The subject list covers pronouns, person nouns, and names; the verb list is limited to
// personal outcomes rather than every possible future-tense action.
const PERSON_FUTURE = /\b(?:[Hh]e|[Ss]he|[Tt]hey|[Tt]his\s+(?:player|member|person|student|employee|athlete)|[A-Z][a-z]+)\s+(?:will|won't|will\s+not)\s+(?:quit|drop\s+out|fail|burn\s+out|leave|decline|recover)\b/;

// Diagnosis — naming a clinical condition. IntelliQ never does this. These are STEMS
// (diagnos → diagnose/diagnosis/diagnostic), so they don't take a trailing word boundary.
const DIAGNOSTIC = /diagnos|clinically|depress(?:ion|ed)|anxiety\s+disorder|bipolar|\badhd\b|autis(?:m|tic)|ptsd|\bdisorder\b|syndrome|patholog/i;

/* Does this text predict the future or name a condition? */
function predictsOrDiagnoses(text) {
  const t = String(text == null ? '' : text);
  return PREDICTIVE.test(t) || PERSON_FUTURE.test(t) || DIAGNOSTIC.test(t);
}

/* Convenience: true when the text is SAFE to show (describes, doesn't predict/diagnose). */
function describesOnly(text) { return !predictsOrDiagnoses(text); }

module.exports = { predictsOrDiagnoses, describesOnly, PREDICTIVE, PERSON_FUTURE, DIAGNOSTIC };
