/* ============================================================
   ai/proactive.js — the Proactive Surfacing Layer

   "I noticed something that may deserve your attention."

   This module is a PURE, POST-KERNEL PROJECTION. It contains NO detection,
   NO second reasoning engine, NO database access, and NO AI calls. It takes
   findings the kernel already produced (ai/intelligence.detectPatterns +
   structural patterns, and the attention items server-side) and renders them
   as one inspectable artifact — the ProactiveInsight — under a single,
   deterministic surfacing policy, with audience safety and bounded
   communication preferences.

   Invariants enforced here:
     • Surface, never act. Every ProactiveInsight.suggestion is proposal-gated
       (requiresConfirmation: true). This module never executes anything.
     • Audience safety. A leader-audience insight carries ONLY a directional,
       care-first message + a care flag — never a number, a quote, private
       dimensions, or an implication of private disclosure. audienceSafe()
       proves it; the tests attack it adversarially.
     • Works with no AI key. Every message is a deterministic template keyed by
       pattern type and audience — no model is ever consulted.
     • Bounded personalisation. Communication preferences are a fixed allow-list
       (length / tone / cadence). Protected traits can never be stored or
       inferred; normalizePreferences() drops anything off the allow-list.
   ============================================================ */

const voice = require('./voice');

// Ranking — severity first, then how confident the kernel is. Lower = surfaced first.

/* ── Polarity — the Attention Engine's core idea ─────────────────────────────
   Attention is not positive or negative; it is "this matters." Every insight
   carries a POLARITY (what kind of thing it is) that is INDEPENDENT of its
   PRIORITY (how much it matters). A milestone can be high-priority; a risk can
   be low. Polarity is a projection of an EXISTING kernel pattern — no new
   detector, no new reasoning. Attention items and dynamic findings (milestone,
   opportunity) carry their own polarity on the finding. */
const PATTERN_POLARITY = {
  // negative — needs attention
  baseline_shift: 'neutral', momentum_drop: 'risk', repeated_concern: 'risk',
  member_team_divergence: 'risk', invisible_load: 'risk', withdrawal: 'risk',
  data_gap: 'neutral', isolation: 'risk', overload: 'risk', plateau: 'risk',
  // positive — worth celebrating (already emitted by the kernel today)
  recovering: 'progress', quiet_improvement: 'progress',
};
// NOTE: bucket mapping, ordering, volume, empty-state and opening messages are
// DELIVERY decisions and live in the behaviour layer (ai/behaviour.js), not here.
// This module (the projection) owns only the artifact and its audience-safety.

/* Per-polarity EXPLORE prompts — the natural conversation an insight can start.
   Non-alarmist for risks, reinforcing for wins. Never diagnose, predict, or assume
   a cause; always an invitation, phrased as a question. These let the assistant
   BEGIN a conversation from a verified artifact instead of waiting to be asked. */
const EXPLORE = voice.PATTERN_EXPLORE;

/* ── Per-pattern DETERMINISTIC message structures ────────────────────────────
   audience 'self'   — the person, about their OWN week. May be specific; it's
                       their own evidence. First person, warm, non-clinical.
   audience 'leader' — someone authorised to support that person. DIRECTIONAL and
                       care-first ONLY: a label, a gentle "worth a moment", and a
                       suggested next step that is itself proposal-gated. NEVER a
                       number, a quote, or a private dimension. If a pattern could
                       imply a private disclosure, the leader form stays generic
                       and leans on the care flag.
   Each returns { headline, body, suggestion }. No AI, ever. */
const MESSAGES = voice.PATTERN_MESSAGES;

/* Attention items (from _composeToday) are already fully phrased server-side and
   are self-audience only. They project straight through with their own text. */
const ATTENTION_HEADLINE = {
  privacy:    'Your private items have stayed private',
  commitment: 'Open commitments',
  action:     'Waiting on your approval',
  recent:     'IntelliQ is keeping your recent captures in mind',
};

/* A generic, honest fallback — never leaks, never a number. */
const _fallback = voice.patternFallback;

/* Small, dependency-free stable hash → deterministic insight ids (so dedupe and
   suppression are stable across renders without persisting a counter). */
function _hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/* ── The ProactiveInsight artifact ───────────────────────────────────────────
   ONE inspectable object. A projection of an existing kernel finding — it adds
   no conclusion the kernel did not already reach.
     id            stable, derived from subject+pattern+audience (dedupe/suppress)
     dedupeKey     subjectId:patternType:audience
     patternType   the kernel pattern (or attention kind)
     audience      'self' | 'leader'
     subjectId     who the insight is ABOUT
     subjectLabel  'you' (self) or the person's name (leader)
     severity      'high' | 'medium' | 'low'   (from the kernel finding)
     kernelConfidence  the kernel's own confidence word
     reliabilityLabel  the Confidence Engine's honest label for this pattern type
     headline / body   the rendered, audience-safe message
     suggestion    { text, requiresConfirmation:true, proposalType } — never auto-run
     basis         internal, privacy-safe evidence strings — NEVER rendered to a leader
     careFlag      contentless "there may be private context" nudge
     surfacedAt    iso timestamp
   Everything renderable to a leader is directional + care-first by construction. */
function toInsight(finding, opts = {}) {
  const audience = opts.audience === 'leader' ? 'leader' : 'self';
  // Perspective is derived from the governed subject reference. Producers cannot
  // relabel a person artifact as Web merely by passing an option.
  const subjectRef = opts.subjectRef || finding.subjectRef || null;
  const perspective = typeof subjectRef === 'string' && subjectRef.startsWith('web:') ? 'web' : 'self';
  const patternType = finding.patternType || finding.type || finding.kind || 'unknown';
  const subjectId = perspective === 'web' ? null : (opts.subjectId || finding.subjectId || null);
  const subjectName = opts.subjectName || finding.name || null;
  const subjectLabel = perspective === 'web' ? 'your visible scope' : (audience === 'leader' ? (subjectName || 'this person') : 'you');

  // Message resolution, in order:
  //  1. finding.render — a dynamic, audience-shaped message (milestone/opportunity),
  //     which carry a computed number the static table can't hold. The CALLER is
  //     responsible for making finding.render[audience] audience-safe (leader forms
  //     must stay directional + numberless); audienceSafe() re-checks it here.
  //  2. attention items carry their own server-composed text.
  //  3. kernel patterns use the static table.
  let msg;
  if (finding.render) {
    msg = finding.render[audience] || finding.render.self || finding.render;
  } else if (finding.kind && ATTENTION_HEADLINE[finding.kind]) {
    msg = { headline: ATTENTION_HEADLINE[finding.kind], body: finding.text || '', suggestion: null };
  } else {
    msg = (MESSAGES[patternType] && MESSAGES[patternType][audience]) || _fallback(audience, patternType);
  }

  const severity = finding.severity || (finding.kind === 'action' ? 'medium' : 'low');
  // Polarity: explicit on the finding (milestone/opportunity/neutral attention) else
  // mapped from the pattern type; defaults to neutral. A pure projection.
  const polarity = finding.polarity || PATTERN_POLARITY[patternType] || 'neutral';
  // Priority is INDEPENDENT of polarity — how much this matters, not whether it's
  // good or bad. Derived from the finding's own severity so a milestone or an
  // opportunity can outrank a low risk.
  const priority = finding.priority || severity;
  const dedupeKey = `${subjectId || 'self'}:${patternType}:${audience}`;
  const suggestionText = msg.suggestion;

  return {
    id: 'pi_' + _hash(dedupeKey),
    dedupeKey,
    patternType,
    audience,
    perspective,
    subjectId,
    subjectLabel,
    polarity,
    priority,
    // The conversation this insight can start — a projection, not a generated line.
    // (Its Home BUCKET is decided by the behaviour layer, not baked into the artifact.)
    explore: (EXPLORE[polarity] && EXPLORE[polarity][audience]) || '',
    severity,
    kernelConfidence: finding.confidence || null,
    reliabilityLabel: opts.reliabilityLabel || null,
    headline: msg.headline,
    body: msg.body,
    // A proposal-gated suggestion. This module NEVER executes it — the caller must
    // route it through the existing proposal→confirm→execute pipeline.
    suggestion: suggestionText ? {
      text: suggestionText,
      requiresConfirmation: true,
      proposalType: audience === 'leader' ? 'checkin_proposal' : 'capture',
    } : null,
    // Internal only. The surfacing layer keeps evidence for AUDIT, but the leader UI
    // must never render it — audienceSafe() checks the rendered fields, not this.
    basis: perspective === 'web' || audience === 'leader' ? [] : (Array.isArray(finding.basis) ? finding.basis : finding.basis ? [finding.basis] : []),
    // A WEB artifact has no subject, so there is nobody it could be carrying private context
    // ABOUT — and the presence of the flag is itself a side channel, which is the whole reason
    // the leader sanitizer omits it rather than setting it false. So a Web artifact does not
    // carry the key at all, and WEB_ARTIFACT_KEYS below no longer permits it: a producer that
    // attaches one fails audienceSafe and is dropped, rather than passing with `false`.
    ...(perspective === 'web' ? {} : { careFlag: !!finding.careFlag }),
    ...(finding.openingRule ? { openingRule: finding.openingRule } : {}),
    surfacedAt: opts.now ? new Date(opts.now).toISOString() : new Date().toISOString(),
  };
}

/* ── Audience safety ─────────────────────────────────────────────────────────
   Proves a leader-audience insight cannot leak private evidence — directly, by
   quotation, by number, or by a rendered dimension. Scans ONLY the fields a human
   sees (headline, body, suggestion.text). Returns { ok, violations }.
   For self-audience insights numbers/specifics are fine (it's their own data), so
   only quote-leakage of long verbatim strings is checked. */
const SCORE_RE = /\d(?:\.\d)?\s*\/\s*5\b|\b\d{1,3}\s*%/;              // "3.4/5", "60%"
const QUOTE_RE = /[“"«][^”"»]{25,}[”"»]/;                            // a long verbatim quotation
// Protected-trait vocabulary must never appear in any rendered proactive text,
// for any audience. IntelliQ never names or infers these.
const PROTECTED_RE = /\b(race|ethnic(?:ity)?|religio(?:n|us)|sexual|gender identity|disab(?:led|ility)|pregnan|diagnos|depress(?:ed|ion)|anxiety disorder|medicat|therapy|HIV|immigration)\b/i;
const WEB_ARTIFACT_KEYS = Object.freeze([
  'id', 'dedupeKey', 'patternType', 'audience', 'perspective', 'subjectId', 'subjectLabel',
  'polarity', 'priority', 'explore', 'severity', 'kernelConfidence', 'reliabilityLabel',
  'headline', 'body', 'suggestion', 'basis', 'openingRule', 'surfacedAt', 'kind',
]);

function audienceSafe(insight) {
  const violations = [];
  if (!insight) return { ok: true, violations };
  const rendered = [insight.headline, insight.body, insight.suggestion && insight.suggestion.text]
    .filter(Boolean).join('  ');

  if (PROTECTED_RE.test(rendered)) violations.push('protected_trait_language');
  if (insight.perspective === 'web') {
    if (insight.subjectId != null) violations.push('web_subject_exposed');
    if (Array.isArray(insight.basis) && insight.basis.length) violations.push('web_basis_exposed');
    if (Object.keys(insight).some(key => !WEB_ARTIFACT_KEYS.includes(key))) violations.push('web_unknown_field');
  }

  if (insight.audience === 'leader') {
    if (SCORE_RE.test(rendered))  violations.push('numeric_leak');
    if (QUOTE_RE.test(rendered))  violations.push('verbatim_quote');
    // A leader-rendered insight must not carry evidence basis strings.
    if (Array.isArray(insight.basis) && insight.basis.length) violations.push('basis_exposed_to_leader');
    // Any suggested action must be proposal-gated — never auto-run against a person.
    if (insight.suggestion && insight.suggestion.requiresConfirmation !== true) violations.push('unconfirmed_action');
  } else {
    if (QUOTE_RE.test(rendered))  violations.push('verbatim_quote');
  }
  return { ok: violations.length === 0, violations };
}

/* ── Communication preferences (bounded) ─────────────────────────────────────
   A fixed allow-list. Nothing else can be stored, and nothing is ever inferred —
   the caller must set these explicitly. Protected traits are structurally
   impossible to store: only these keys, only these values, exist. */
const PREF_SCHEMA = Object.freeze({
  length:  ['standard', 'brief'],
  tone:    ['warm', 'plain'],
  cadence: ['as_it_happens', 'daily', 'weekly'],
});
const PREF_DEFAULTS = Object.freeze({ length: 'standard', tone: 'warm', cadence: 'as_it_happens' });

/* Keep only allow-listed keys with allow-listed values; drop everything else
   (including any attempt to smuggle a protected trait as a key or value). */
function normalizePreferences(input) {
  const out = { ...PREF_DEFAULTS };
  const src = (input && typeof input === 'object') ? input : {};
  for (const key of Object.keys(PREF_SCHEMA)) {
    const v = src[key];
    if (typeof v === 'string' && PREF_SCHEMA[key].includes(v)) out[key] = v;
  }
  return out;
}

/* Apply bounded preferences to a rendered insight — deterministic phrasing knobs
   only. 'brief' trims the body to its first sentence; 'plain' drops the warm
   clause after an em dash. Never changes WHAT is surfaced, only HOW it reads.
   Returns a new insight; does not mutate. */
function applyPreferences(insight, prefs) {
  if (!insight) return insight;
  const p = normalizePreferences(prefs);
  let body = insight.body || '';
  if (p.length === 'brief' && body) {
    const firstStop = body.search(/[.!?]\s/);
    if (firstStop > 0) body = body.slice(0, firstStop + 1);
  }
  if (p.tone === 'plain' && body.includes(' — ')) {
    body = body.split(' — ')[0].replace(/[.!?]*$/, '') + '.';
  }
  return { ...insight, body, appliedPreferences: p };
}

/* ── Dynamic positive findings (milestone / opportunity) ─────────────────────
   These carry a computed value the static table can't hold (a streak length, a
   sustained trend), so they ship an audience-shaped `render`. They are STILL
   projections of existing canonical series — the server computes them by counting
   over evidence it already has, not by any new reasoning. The leader form is
   directional and numberless by construction; audienceSafe() re-checks it. */

/* A milestone — a threshold reached (a streak, a personal best). Positive, worth
   celebrating. `days` is the person's own count; the leader form never carries it. */
function milestoneFinding({ key, subjectId, days, best, priority } = {}) {
  const d = Number(days) || 0;
  return {
    polarity: 'milestone',
    patternType: key || 'milestone',
    subjectId,
    severity: 'low',
    priority: priority || (best ? 'medium' : 'low'),   // priority ≠ polarity
    confidence: 'clear',
    render: {
      self: {
        headline: best ? 'A personal best' : 'Nice streak going',
        body: `${d} days of checking in, unbroken${best ? ' — your longest run yet' : ''}. Consistency like that compounds.`,
        suggestion: null,
      },
      leader: {
        headline: 'Consistently engaged',
        body: 'They’ve been checking in consistently lately — a good moment to acknowledge it.',
        suggestion: 'Consider recognising their consistency.',
      },
    },
  };
}

/* An opportunity — something worth pursuing, framed as a QUESTION, never a verdict
   or a prediction. SELF-AUDIENCE ONLY (the attention() grouper drops any
   opportunity bucket for a leader). Derived conservatively from a sustained
   positive pattern the kernel already found. */
function opportunityFinding({ key, subjectId, headline, body, suggestion, priority, confidence } = {}) {
  return {
    polarity: 'opportunity',
    patternType: key || 'opportunity',
    subjectId,
    severity: 'low',
    priority: priority || 'medium',
    confidence: confidence || 'emerging',
    render: { self: { headline, body, suggestion: suggestion || null } },
  };
}

module.exports = {
  // Projection only: artifacts + audience-safety. Delivery (grouping, ordering,
  // volume, opening, empty-state) lives in ai/behaviour.js.
  milestoneFinding, opportunityFinding,
  toInsight, audienceSafe,
  normalizePreferences, applyPreferences,
  MESSAGES, EXPLORE, PREF_SCHEMA, PREF_DEFAULTS,
  PATTERN_POLARITY,
  WEB_ARTIFACT_KEYS,
  // exported for tests
  _hash, _fallback,
};
