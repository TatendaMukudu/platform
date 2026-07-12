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
  isolation:  'Becoming isolated',
  overload:   'Overload risk',
  plateau:    'Plateau',
};
const STRUCTURE_ACTION = {
  withdrawal: 'Reach out — participation is dropping from their own normal. Ask what changed, listen first.',
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

  // WITHDRAWAL — a participation stream fell below their own normal.
  of(PRIMITIVE.PARTICIPATION).filter(_declined).slice(0, 1).forEach(s =>
    out.push({ type: 'withdrawal', severity: _sevFromPct(s.shift.deviationPct),
      basis: `participation (${s.label}) is ${_pct(s.shift)}below their usual`, confidence: s.shift.confidence }));

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
  const effortSteady = of(PRIMITIVE.PARTICIPATION).some(p => !_declined(p));
  [...of(PRIMITIVE.CAPABILITY), ...of(PRIMITIVE.OUTCOME)].forEach(s => {
    const b = baseline.computeBaseline(s.series, now);
    if (b.points >= 8 && !s.shift.unusual && effortSteady && !out.some(o => o.type === 'plateau')) {
      out.push({ type: 'plateau', severity: 'low',
        basis: `${s.label} has been flat for a while despite steady effort`,
        confidence: b.points >= 12 ? 'emerging' : 'tentative' });
    }
  });

  const SEV = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => SEV[a.severity] - SEV[b.severity]).slice(0, 4);
}

module.exports = { PRIMITIVE, STRUCTURE_LABEL, STRUCTURE_ACTION, structuralPatterns };
