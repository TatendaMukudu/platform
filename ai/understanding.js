/* ============================================================
   ai/understanding.js — the INPUT translator's safety core

   The reasoner is bottlenecked by input poverty: it reasons off mood numbers and
   signal counts, while the richest evidence — what people actually SAY — is (rightly)
   kept out of the deterministic core for privacy. The way to feed it language WITHOUT
   breaking that wall is an LLM at the edge that reads text once and emits only
   privacy-safe, bounded FEATURES. This module is the GUARDRAIL that makes such an edge
   safe: it takes an untrusted raw classification (as an LLM would produce) and forces
   it through an allow-list, so the output structurally cannot carry raw text, a
   quotation, a protected trait, or anything off the list.

   It is the exact analogue of proactive.normalizePreferences + audienceSafe: the pure,
   testable gate that makes the feature safe REGARDLESS of what the model returns. The
   model call itself is a thin server boundary that MUST pipe through here, with a
   deterministic fallback (no key → no extra features, behaviour unchanged).

   PURE. Imports nothing. No text is ever stored or passed onward — only derived,
   bounded features. The tests attack it adversarially.
   ============================================================ */

// Universal, domain-neutral themes. NEVER identity, health, or any protected trait —
// those cannot appear here, so they cannot flow into the reasoner even if a model emits
// them. Anything off this list is dropped.
const THEME_ALLOWLIST = new Set([
  'workload', 'motivation', 'confidence', 'fatigue', 'focus', 'belonging',
  'conflict', 'recognition', 'progress', 'setback', 'support_need', 'logistics',
]);

// Belt-and-suspenders: protected-trait vocabulary that must never survive, in any field.
const PROTECTED_RE = /\b(race|ethnic(?:ity)?|religio(?:n|us)|sexual|gender identity|disab(?:led|ility)|pregnan|diagnos|depress(?:ed|ion)|anxiety disorder|medicat|therapy|HIV|immigration)\b/i;

const INTENSITY = ['low', 'medium', 'high'];

/* Force an untrusted raw classification into privacy-safe, bounded features. There is NO
   text field on the output — structurally. Sentiment is clamped to -1|0|1, themes are
   allow-listed + capped, intensity is enumerated, sensitive is a bare boolean. If any
   value smuggles protected-trait language, we fail SAFE: drop all detail, keep only the
   sensitive flag (so tone can soften) and nothing else. */
function sanitizeFeatures(raw) {
  const r = (raw && typeof raw === 'object') ? raw : {};
  const s = Number(r.sentiment);
  const out = {
    sentiment: s > 0 ? 1 : s < 0 ? -1 : 0,
    themes: [],
    intensity: INTENSITY.includes(r.intensity) ? r.intensity : 'low',
    sensitive: !!r.sensitive,
  };
  const themes = Array.isArray(r.themes) ? r.themes : [];
  for (const t of themes) {
    const k = String(t || '').toLowerCase().trim();
    if (THEME_ALLOWLIST.has(k) && !out.themes.includes(k)) out.themes.push(k);
    if (out.themes.length >= 5) break;
  }
  // Nothing on the output should contain protected-trait language. If it somehow does,
  // discard all derived detail and keep only "there may be sensitive context".
  if (PROTECTED_RE.test(JSON.stringify(out))) return { sentiment: 0, themes: [], intensity: 'low', sensitive: true };
  return out;
}

/* Which reasoner signal a theme+sentiment implies. Conservative + honest: one piece of
   text is always a single TENTATIVE, low-severity observation — the reasoner's own
   accumulation over time is what turns a real pattern into something raised. A neutral
   note, or one with no allow-listed theme, produces nothing. */
const NEG_KIND = {
  fatigue: 'overload', workload: 'overload', motivation: 'momentum_drop',
  confidence: 'momentum_drop', setback: 'momentum_drop', belonging: 'isolation',
  conflict: 'isolation', support_need: 'withdrawal', focus: 'baseline_shift',
};
const POS_KIND = { progress: 'quiet_improvement', recognition: 'quiet_improvement', confidence: 'recovering', motivation: 'recovering' };

function featuresToObservation(features, meta = {}) {
  const f = sanitizeFeatures(features);
  if (f.sentiment === 0 || !f.themes.length) return null;
  const map = f.sentiment < 0 ? NEG_KIND : POS_KIND;
  let kind = null, theme = null;
  for (const t of f.themes) { if (map[t]) { kind = map[t]; theme = t; break; } }
  if (!kind) return null;
  return {
    id: meta.id || null,
    subjectId: meta.subjectId || null,
    subjectName: meta.subjectName || null,
    scope: meta.scope || null,
    kind,
    severity: f.intensity === 'high' ? 'medium' : 'low',   // one text is never high-severity
    confidence: 'tentative',                               // one text is never more than tentative
    basis: `derived from a shared note (${theme})`,        // privacy-safe: theme label, never content
    careFlag: f.sensitive,
    t: Number.isFinite(meta.t) ? meta.t : Date.now(),
  };
}

module.exports = {
  sanitizeFeatures, featuresToObservation,
  THEME_ALLOWLIST, INTENSITY,
  // exported for tests
  _PROTECTED_RE: PROTECTED_RE, NEG_KIND, POS_KIND,
};
