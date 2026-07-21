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

// Ranking — severity first, then how confident the kernel is. Lower = surfaced first.
const SEV_RANK  = { high: 0, medium: 1, low: 2 };
const CONF_RANK = { clear: 0, confirmed: 0, emerging: 1, medium: 1, tentative: 2, low: 2, calibrating: 2 };

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
const MESSAGES = {
  baseline_shift: {
    self:   { headline: 'Something shifted from your usual',
              body: 'A few things are running differently from your own normal lately. Not good or bad — just different. Worth a moment to notice.',
              suggestion: 'Take a minute to reflect on what changed this week.' },
    leader: { headline: 'Unusual for them',
              body: "Something is running differently from this person's own normal lately. A curious, no-assumptions check-in may help.",
              suggestion: 'Consider a gentle 1:1 — lead with curiosity, not conclusions.' },
  },
  momentum_drop: {
    self:   { headline: 'Your momentum has dipped',
              body: 'Your recent check-ins are running lower than they were. That happens. If something is weighing on you, this is a good place to name it.',
              suggestion: 'Log how you’re really doing — no pressure to fix anything.' },
    leader: { headline: 'Momentum dropping',
              body: 'Their recent momentum looks softer than before. A personal check-in — listening first — is usually the right first step.',
              suggestion: 'Consider reaching out for a supportive check-in.' },
  },
  quiet_improvement: {
    self:   { headline: 'You’ve been quietly climbing',
              body: 'Things have been trending up for you lately, without much fanfare. Worth acknowledging to yourself.',
              suggestion: 'Note what’s been working — so you can keep doing it.' },
    leader: { headline: 'Quiet improvement',
              body: 'They’ve been improving quietly, with little recognition. A specific, genuine acknowledgement tends to make gains hold.',
              suggestion: 'Consider recognising the progress specifically.' },
  },
  recovering: {
    self:   { headline: 'You’re climbing back',
              body: 'You were in a rougher patch and you’ve been climbing back toward your normal. That took something — good to see.',
              suggestion: 'Acknowledge the turnaround to yourself — naming it helps it hold.' },
    leader: { headline: 'Climbing back',
              body: 'They’ve climbed out of a dip toward their own normal. Naming the turnaround out loud helps it stick.',
              suggestion: 'Consider acknowledging the turnaround.' },
  },
  repeated_concern: {
    self:   { headline: 'A theme keeps coming up',
              body: 'The same concern has surfaced a few times now. Recurring things are worth a single, focused look rather than many small ones.',
              suggestion: 'Pick one small focus for the recurring theme.' },
    leader: { headline: 'Repeated concern',
              body: 'A theme has recurred for them more than once — not a one-off. Naming it together and agreeing one small shared focus can help.',
              suggestion: 'Consider a conversation to name the recurring theme together.' },
  },
  member_team_divergence: {
    self:   { headline: 'You’re on a different track from the group',
              body: 'Your trajectory is moving differently from your team’s lately. Neither is wrong — but it can be worth understanding why.',
              suggestion: 'Reflect on what’s pulling you a different way right now.' },
    leader: { headline: 'Pulling away from the team',
              body: 'Their trajectory is diverging from the group’s. A 1:1 to understand what’s pulling them a different way — to integrate, not push — can help.',
              suggestion: 'Consider a 1:1 to understand the divergence.' },
  },
  invisible_load: {
    self:   { headline: 'You may be carrying a lot for others',
              body: 'You’ve been supporting others a lot lately. Make sure you’re not carrying more than is sustainable.',
              suggestion: 'Check what you can hand off or set down this week.' },
    leader: { headline: 'Carrying invisible load',
              body: 'They may be carrying a lot for others while under strain themselves. Offering to redistribute, or simply acknowledging the load, can help.',
              suggestion: 'Consider checking whether some load can be redistributed.' },
  },
  withdrawal: {
    self:   { headline: 'You’ve been pulling back',
              body: 'Your participation has eased off from your own normal. If something changed, this is a good place to say so.',
              suggestion: 'Share what changed — even a line helps IntelliQ support you.' },
    leader: { headline: 'Pulling back',
              body: 'Their participation is easing from their own normal. Reaching out — asking what changed and listening first — is a good first step.',
              suggestion: 'Consider reaching out to ask how they’re doing.' },
  },
  data_gap: {
    self:   { headline: 'It’s been quiet',
              body: 'You were checking in regularly, then it went quiet. No pressure — whenever you’re ready, IntelliQ is here.',
              suggestion: 'A quick check-in whenever it suits you.' },
    leader: { headline: 'Gone quiet',
              body: 'They were regular, then went quiet. A simple, no-assumptions “thinking of you, how are things?” is usually enough.',
              suggestion: 'Consider a light, no-assumptions reconnect.' },
  },
  isolation: {
    self:   { headline: 'Your connections have thinned',
              body: 'Your connection signals have been thinning lately. A shared task or a peer catch-up can help re-anchor things.',
              suggestion: 'Reach out to one person this week.' },
    leader: { headline: 'Becoming isolated',
              body: 'Their connection signals are thinning. A shared task or a peer check-in can help reconnect them.',
              suggestion: 'Consider helping them reconnect — a shared task or peer check-in.' },
  },
  overload: {
    self:   { headline: 'You may be overloaded',
              body: 'Demand looks high while wellbeing has dipped. Before pushing further, it’s worth easing something.',
              suggestion: 'Defer or drop one thing this week.' },
    leader: { headline: 'Overload risk',
              body: 'Demand appears high while wellbeing is down. Removing or deferring something before pushing further can help.',
              suggestion: 'Consider easing their load before adding to it.' },
  },
  plateau: {
    self:   { headline: 'Things have plateaued',
              body: 'Steady effort, but growth has flattened. A change of stimulus — a new challenge or approach — can restart it.',
              suggestion: 'Try one new challenge or approach.' },
    leader: { headline: 'Plateau',
              body: 'Growth has flattened despite steady effort. A new challenge or a change of approach can help restart it.',
              suggestion: 'Consider changing the stimulus — a new challenge or approach.' },
  },
};

/* Attention items (from _composeToday) are already fully phrased server-side and
   are self-audience only. They project straight through with their own text. */
const ATTENTION_HEADLINE = {
  privacy:    'Your private items have stayed private',
  commitment: 'Open commitments',
  action:     'Waiting on your approval',
  recent:     'IntelliQ is keeping your recent captures in mind',
};

/* A generic, honest fallback — never leaks, never a number. */
function _fallback(audience, patternType) {
  const label = patternType || 'a pattern';
  return audience === 'leader'
    ? { headline: 'Worth a moment', body: `IntelliQ noticed something (${label}) that may be worth a supportive check-in.`, suggestion: 'Consider a supportive check-in.' }
    : { headline: 'Worth a moment', body: 'IntelliQ noticed something in your week that may be worth a moment.', suggestion: 'Take a moment to reflect.' };
}

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
  const patternType = finding.patternType || finding.type || finding.kind || 'unknown';
  const subjectId = opts.subjectId || finding.subjectId || null;
  const subjectName = opts.subjectName || finding.name || null;
  const subjectLabel = audience === 'leader' ? (subjectName || 'this person') : 'you';

  // Message: attention items carry their own text; kernel patterns use the table.
  let msg;
  if (finding.kind && ATTENTION_HEADLINE[finding.kind]) {
    msg = { headline: ATTENTION_HEADLINE[finding.kind], body: finding.text || '', suggestion: null };
  } else {
    msg = (MESSAGES[patternType] && MESSAGES[patternType][audience]) || _fallback(audience, patternType);
  }

  const severity = finding.severity || (finding.kind === 'action' ? 'medium' : 'low');
  const dedupeKey = `${subjectId || 'self'}:${patternType}:${audience}`;
  const suggestionText = msg.suggestion;

  return {
    id: 'pi_' + _hash(dedupeKey),
    dedupeKey,
    patternType,
    audience,
    subjectId,
    subjectLabel,
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
    basis: audience === 'leader' ? [] : (Array.isArray(finding.basis) ? finding.basis : finding.basis ? [finding.basis] : []),
    careFlag: !!finding.careFlag,
    surfacedAt: opts.now ? new Date(opts.now).toISOString() : new Date().toISOString(),
  };
}

/* ── Deterministic surfacing policy ──────────────────────────────────────────
   • Rank by severity, then kernel confidence, then a stable id tiebreak.
   • Cap at `limit` (default 3). "Nothing needs your attention" is a first-class,
     valid, non-error result — empty:true with a calm message.
   • De-duplicate by dedupeKey (same subject+pattern+audience surfaces once).
   • Drop anything the caller marked suppressed (per-insight mute).
   Pure — same inputs always yield the same ordered output. */
function surface(insights, opts = {}) {
  const limit = Number.isInteger(opts.limit) ? opts.limit : 3;
  const suppressed = opts.suppressed instanceof Set ? opts.suppressed
                   : new Set(Array.isArray(opts.suppressed) ? opts.suppressed : []);
  const seen = new Set();
  const ranked = (insights || [])
    .filter(i => i && !suppressed.has(i.dedupeKey) && !suppressed.has(i.id))
    .filter(i => (seen.has(i.dedupeKey) ? false : (seen.add(i.dedupeKey), true)))
    .sort((a, b) => {
      const s = (SEV_RANK[a.severity] ?? 3) - (SEV_RANK[b.severity] ?? 3);
      if (s) return s;
      const c = (CONF_RANK[a.kernelConfidence] ?? 3) - (CONF_RANK[b.kernelConfidence] ?? 3);
      if (c) return c;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    })
    .slice(0, Math.max(0, limit));

  if (!ranked.length) {
    const leader = (insights || [])[0]?.audience === 'leader' || opts.audience === 'leader';
    return {
      empty: true,
      message: leader ? 'Nothing needs your attention right now.' : 'Nothing needs you right now.',
      insights: [],
    };
  }
  return { empty: false, message: null, insights: ranked };
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

function audienceSafe(insight) {
  const violations = [];
  if (!insight) return { ok: true, violations };
  const rendered = [insight.headline, insight.body, insight.suggestion && insight.suggestion.text]
    .filter(Boolean).join('  ');

  if (PROTECTED_RE.test(rendered)) violations.push('protected_trait_language');

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

module.exports = {
  toInsight, surface, audienceSafe,
  normalizePreferences, applyPreferences,
  MESSAGES, PREF_SCHEMA, PREF_DEFAULTS,
  SEV_RANK, CONF_RANK,
  // exported for tests
  _hash, _fallback,
};
