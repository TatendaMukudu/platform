/* ============================================================
   ai/primitives.js — Universal Primitives + the Universal Pattern Engine

   The kernel does not know "soccer" or "grades." It reasons over PRIMITIVE TYPES
   that exist in every human system, and recognizes STRUCTURES that recur across
   all of them. A domain adapter tags each signal with a primitive + valence; the
   kernel does the rest, identically, whether the source is a classroom, a clinic,
   a sales floor, or a family.

   PRIMITIVE TYPES (the few universal concepts the kernel exposes):
     outcome       a result that matters relative to an aim  (grade, KPI, win, recovery)
     state         an internal condition                     (mood, wellbeing, stress)
     participation showing up / doing the work               (attendance, check-ins, activity)
     relational    connection between actors                 (communication, mentoring, helping)
     capability    what an actor can do                      (skill, fitness, competence)
     load          demand placed on an actor                 (workload, training load, academic load)
     resource      what enables action                       (time, budget, capacity)

   VALENCE says which way is "good", and it comes from the AIM, never hardcoded:
     up-good | down-good | neutral   (stress is down-good; mood is up-good)

   UNIVERSAL STRUCTURES (recurring everywhere — the whole point):
     withdrawal · isolation · overload · plateau
   Each is defined over primitive types + self-relative shift, so it is domain-free.
   Honest by construction: evidence + confidence, never a cause.
   ============================================================ */

const baseline = require('./baseline');

const PRIMITIVE = {
  OUTCOME: 'outcome', STATE: 'state', PARTICIPATION: 'participation',
  RELATIONAL: 'relational', CAPABILITY: 'capability', LOAD: 'load', RESOURCE: 'resource',
};

const STRUCTURE_LABEL = {
  withdrawal: 'Pulling back',
  data_gap:   'Gone quiet',
  isolation:  'Becoming isolated',
  overload:   'Overload risk',
  plateau:    'Plateau',
};

/* Canonical empirical identities — the measured dimensions and observed structures
   already owned by the kernel. This is the single machine-readable vocabulary used
   by claim classification and org-context provenance hygiene. Adding an identity is
   a deliberate epistemic change, not a display-language tweak.

   Sources: this module's primitive taxonomy and documented examples; ai/reason.js
   AXIS keys/axis names; ai/understanding.js THEME_ALLOWLIST; ai/packs.js valenceFor
   down-good terms; STRUCTURE_LABEL keys; plus founder-ratified morale/performance. */
const EMPIRICAL_CONCEPTS = Object.freeze(new Set([
  ...Object.values(PRIMITIVE),
  'attendance', 'wellbeing', 'mood', 'stress', 'workload', 'skill', 'fitness',
  'competence', 'grade', 'kpi', 'win', 'recovery', 'communication', 'mentoring',
  'helping', 'activity', 'time', 'budget', 'capacity',
  // ai/reason.js AXIS keys and axis names.
  'momentum_drop', 'recovering', 'quiet_improvement', 'repeated_concern',
  'baseline_shift', 'member_team_divergence', 'invisible_load', 'overload',
  'withdrawal', 'data_gap', 'isolation', 'plateau',
  'momentum', 'concern', 'baseline', 'alignment', 'load', 'engagement',
  'connection', 'growth',
  // ai/understanding.js THEME_ALLOWLIST.
  'motivation', 'confidence', 'fatigue', 'focus', 'belonging', 'conflict',
  'recognition', 'progress', 'setback', 'support_need', 'logistics',
  // ai/packs.js valenceFor down-good terms.
  'burnout', 'anxiety', 'pain', 'absence', 'turnover', 'incident', 'defect',
  'error', 'risk',
  ...Object.keys(STRUCTURE_LABEL),
  // Founder additions: distinct concepts, not aliases for mood/outcome.
  'morale', 'performance',
]));
const STRUCTURE_ACTION = {
  withdrawal: 'Reach out — participation is dropping from their own normal. Ask what changed, listen first.',
  data_gap:   'Reconnect, no assumptions — they were regular, then went quiet. A simple “thinking of you, how are things?” is enough.',
  isolation:  'Reconnect them — their connection signals are thinning. A shared task or a check-in with a peer can help.',
  overload:   'Ease the load — demand is up while wellbeing is down. Remove or defer something before pushing further.',
  plateau:    'Change the stimulus — growth has flattened despite steady effort. Try a new challenge or a different approach.',
};

const _sevFromPct = pct => { const a = Math.abs(pct || 0); return a >= 50 ? 'high' : a >= 25 ? 'medium' : 'low'; };
const _minConf = (a, b) => { const rank = { tentative: 0, learning: 0, emerging: 1, clear: 2 }; return (rank[a] ?? 0) <= (rank[b] ?? 0) ? a : b; };
const _pct = sh => (Number.isFinite(sh.deviationPct) ? `${Math.abs(sh.deviationPct)}% ` : '');

/* A stream got WORSE than its own normal (direction depends on valence). */
function _declined(s) {
  if (!s.shift.unusual) return false;
  return s.shift.direction === (s.valence === 'down-good' ? 'above' : 'below');
}
/* A stream got HIGHER than its own normal (raw direction up, regardless of good/bad). */
function _rose(s) {
  return s.shift.unusual && s.shift.direction === 'above';
}

/* The Universal Pattern Engine. streams: [{ key, label, primitive, valence, series }].
   Returns findings [{ type, severity, basis, confidence }] — domain-free structures. */
function structuralPatterns(streams, now) {
  const S = (streams || []).map(s => ({ ...s, shift: baseline.shift(s.series, now) }));
  const of = p => S.filter(s => s.primitive === p);
  const out = [];

  // WITHDRAWAL — a participation stream is reduced-but-PRESENT vs their own normal.
  // (_declined needs an unusual shift, which needs recent data — so a fully-silent
  //  person never trips withdrawal; that case is data_gap below.)
  of(PRIMITIVE.PARTICIPATION).filter(_declined).slice(0, 1).forEach(s =>
    out.push({ type: 'withdrawal', severity: _sevFromPct(s.shift.deviationPct),
      basis: `participation (${s.label}) is ${_pct(s.shift)}below their usual`, confidence: s.shift.confidence }));

  // DATA GAP — they have a real history but have gone SILENT lately. This is
  // distinct from withdrawal (reduced-but-present): it's uncertainty, not a claim
  // about their state — and without it a fully-silent person becomes INVISIBLE
  // (nothing else fires on an empty recent window). Reconnect, don't diagnose.
  const RECENT_MS = 14 * 86400000;
  of(PRIMITIVE.PARTICIPATION).forEach(s => {
    if (out.some(o => o.type === 'withdrawal' || o.type === 'data_gap')) return;
    const b = baseline.computeBaseline(s.series, now);
    const recentN = (s.series || []).filter(p => p && Number.isFinite(p.t) && now - p.t < RECENT_MS).length;
    if (b.points >= baseline.MIN_POINTS && recentN === 0) {
      out.push({ type: 'data_gap', severity: 'medium',
        basis: `${s.label}: no activity in ~2 weeks, though they were regular before`,
        confidence: b.points >= 12 ? 'emerging' : 'tentative' });
    }
  });

  // ISOLATION — a relational (connection) stream is thinning.
  of(PRIMITIVE.RELATIONAL).filter(_declined).slice(0, 1).forEach(s =>
    out.push({ type: 'isolation', severity: 'medium',
      basis: `connection (${s.label}) is thinning vs their usual`, confidence: s.shift.confidence }));

  // OVERLOAD — demand is elevated AND an up-good wellbeing state is declining.
  const loadUp    = of(PRIMITIVE.LOAD).filter(_rose);
  const stateDown = of(PRIMITIVE.STATE).filter(s => s.valence !== 'down-good' && _declined(s));
  if (loadUp.length && stateDown.length) {
    out.push({ type: 'overload', severity: 'high',
      basis: `${loadUp[0].label} is up while ${stateDown[0].label} is down — a load/strain mismatch`,
      confidence: _minConf(loadUp[0].shift.confidence, stateDown[0].shift.confidence) });
  }

  // PLATEAU — a capability/outcome has been flat over a long window despite effort.
  // "Not statistically unusual" is not the same as flat: gradual movement can remain
  // inside the deviation threshold while still changing materially over the window.
  const effortSteady = of(PRIMITIVE.PARTICIPATION).some(p => !_declined(p));
  [...of(PRIMITIVE.CAPABILITY), ...of(PRIMITIVE.OUTCOME)].forEach(s => {
    const b = baseline.computeBaseline(s.series, now);
    const materiallyFlat = s.shift.direction === 'flat' ||
      (Number.isFinite(s.shift.deviationPct) && Math.abs(s.shift.deviationPct) <= 5);
    if (b.points >= 8 && materiallyFlat && effortSteady && !out.some(o => o.type === 'plateau')) {
      out.push({ type: 'plateau', severity: 'low',
        basis: `${s.label} has been flat for a while despite steady effort`,
        confidence: b.points >= 12 ? 'emerging' : 'tentative' });
    }
  });

  const SEV = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => SEV[a.severity] - SEV[b.severity]).slice(0, 4);
}

module.exports = { PRIMITIVE, EMPIRICAL_CONCEPTS, STRUCTURE_LABEL, STRUCTURE_ACTION, structuralPatterns };
