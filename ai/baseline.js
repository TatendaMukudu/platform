/* ============================================================
   ai/baseline.js — the Behavior Engine (Service #3 of 7)

   "Compare a person to THEMSELVES, not to everyone else."

   Every member gradually develops a behavioural fingerprint: their own normal
   for a handful of dimensions (mood, check-in cadence, reflection cadence,
   contribution, supporting others). A change relative to that personal normal —
   even when the absolute number looks fine, even when it's still "average" — is
   the early signal. That is far more valuable, and far fairer, than a fixed
   threshold that treats a naturally-quiet person like a disengaged one.

   PURE + PRIVACY-SAFE: this module only ever sees numeric time-series (derived
   features), never raw text. Same guarantee as ai/intelligence.js.

   HONEST STATISTICS (no fake ML):
   - Baselines use robust stats (median + MAD), so one outlier can't move a norm.
   - A deviation is only called "unusual" when it exceeds ~2 robust deviations
     AND there is enough history to HAVE a normal (else confidence = 'learning').
   - Confidence is evidence-volume, never a probability claim.
   ============================================================ */

const DAY = 86400000;
const RECENT_MS   = 14 * DAY;   // "lately" — the window we test
const BASELINE_MS = 90 * DAY;   // learn "normal" from the trailing ~3 months before that
const MIN_POINTS  = 5;          // need at least this many baseline points to have a normal

/* Dimension metadata. concernDir = which direction is worth a leader's attention
   ('below' = withdrawal, 'both' = either way, e.g. over-supporting others). */
const DIMENSIONS = {
  mood:               { label: 'mood',              concernDir: 'below' },
  check_in_frequency: { label: 'check-in cadence',  concernDir: 'below' },
  reflection_cadence: { label: 'reflection cadence',concernDir: 'below' },
  contribution:       { label: 'contribution',      concernDir: 'below' },
  helping:            { label: 'supporting others', concernDir: 'both'  },
};

const round1 = n => Math.round(n * 10) / 10;
const cap    = s => String(s || '').replace(/^./, c => c.toUpperCase());

function _median(a) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function _mad(a, med) {                       // median absolute deviation (robust spread)
  if (!a.length) return 0;
  return _median(a.map(v => Math.abs(v - med)));
}

/* Baseline for one dimension from a value series [{t, v}] (ascending).
   Returns { normal, spread, points } computed from the trailing window that
   EXCLUDES the recent window, so "normal" isn't contaminated by "lately". */
function computeBaseline(series, now, recentMs = RECENT_MS) {
  const base = (series || [])
    .filter(p => now - p.t >= recentMs && now - p.t < recentMs + BASELINE_MS)
    .map(p => p.v);
  if (base.length < MIN_POINTS) return { normal: null, spread: null, points: base.length };
  const normal = _median(base);
  const spread = Math.max(_mad(base, normal), 0.15 * Math.abs(normal), 0.5); // floor: don't be hair-trigger
  return { normal, spread, points: base.length };
}

/* Detect deviation-from-self for one dimension. Never asserts a cause — only
   "this is unusual for them, and by how much." */
function detectDeviation(dimension, series, now) {
  const meta = DIMENSIONS[dimension] || { label: dimension, concernDir: 'both' };
  const { normal, spread, points } = computeBaseline(series, now);
  const recent = _median((series || []).filter(p => now - p.t < RECENT_MS).map(p => p.v));

  if (normal == null || recent == null) {
    return { dimension, label: meta.label, unusual: false, confidence: 'learning', normal: null, recent: recent != null ? round1(recent) : null };
  }
  const diff = recent - normal;
  const unusual = Math.abs(diff) > 2 * spread;
  const direction = diff > 0 ? 'above' : diff < 0 ? 'below' : 'flat';
  const deviationPct = normal !== 0 ? Math.round((diff / Math.abs(normal)) * 100) : null;
  const confidence = points >= 12 ? 'clear' : points >= 8 ? 'emerging' : 'tentative';
  // Only flag when the direction is one a leader should care about for this dim.
  const concerning = unusual && (meta.concernDir === 'both' || meta.concernDir === direction);
  return { dimension, label: meta.label, unusual, concerning, direction, normal: round1(normal), recent: round1(recent), deviationPct, confidence };
}

/* Generic self-relative shift for an ARBITRARY numeric stream (not tied to a named
   dimension) — used by cross-signal reasoning so a stat sheet, a grade, or a KPI
   can be compared to its own normal exactly like mood. Never a score. */
function shift(series, now) {
  const { normal, spread, points } = computeBaseline(series, now);
  const recent = _median((series || []).filter(p => now - p.t < RECENT_MS).map(p => p.v));
  if (normal == null || recent == null) {
    return { unusual: false, confidence: 'learning', normal: null, recent: recent != null ? round1(recent) : null, direction: 'flat', deviationPct: null };
  }
  const diff = recent - normal;
  return {
    unusual: Math.abs(diff) > 2 * spread,
    direction: diff > 0 ? 'above' : diff < 0 ? 'below' : 'flat',
    normal: round1(normal), recent: round1(recent),
    deviationPct: normal !== 0 ? Math.round((diff / Math.abs(normal)) * 100) : null,
    confidence: points >= 12 ? 'clear' : points >= 8 ? 'emerging' : 'tentative',
  };
}

/* The member's fingerprint (their normals) for display — self-relative, no text. */
function fingerprint(dimensionSeries, now) {
  const out = {};
  Object.keys(dimensionSeries || {}).forEach(dim => {
    const b = computeBaseline(dimensionSeries[dim], now);
    if (b.normal != null) out[dim] = { label: (DIMENSIONS[dim] || {}).label || dim, normal: round1(b.normal), basis: b.points };
  });
  return out;
}

/* Run all dimensions; return the concerning deviations (most extreme first),
   plus the fingerprint. This is what the briefing/hypothesis engines consume. */
function analyze(dimensionSeries, now) {
  const deviations = [];
  Object.keys(dimensionSeries || {}).forEach(dim => {
    const d = detectDeviation(dim, dimensionSeries[dim], now);
    if (d.concerning) deviations.push(d);
  });
  deviations.sort((a, b) => Math.abs(b.deviationPct || 0) - Math.abs(a.deviationPct || 0));
  return { deviations, fingerprint: fingerprint(dimensionSeries, now) };
}

/* Human phrase for a deviation — self-relative, honest, never a diagnosis. */
function phrase(dev) {
  if (!dev || !dev.unusual) return null;
  const dir = dev.direction === 'below' ? 'below' : 'above';
  const pct = dev.deviationPct != null ? `${Math.abs(dev.deviationPct)}% ${dir} their usual` : `${dir} their usual`;
  return `${cap(dev.label)} is ${pct} (${dev.recent} vs a normal of ${dev.normal})`;
}

module.exports = {
  analyze, detectDeviation, computeBaseline, fingerprint, phrase, shift,
  DIMENSIONS, RECENT_MS, BASELINE_MS, MIN_POINTS,
};
