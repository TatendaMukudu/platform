/* ============================================================
   ai/intelligence.js — the Platform Intelligence Engine (v1)

   The consolidated pattern layer of the loop:
     Input → Signal → PATTERN → Judgment → Action → Outcome → Learning

   DESIGN PRINCIPLE — PRIVACY BY CONSTRUCTION:
   This module receives ONLY privacy-safe, derived features — mood numbers,
   signal weights + timestamps, counts, directions, booleans. It NEVER receives
   raw note/check-in/reflection TEXT. Because there is no private content in its
   inputs, it structurally cannot quote or reveal one. Sensitive context can only
   arrive as a boolean flag (`hasSensitiveContext`) that softens tone — never as
   detail. The server assembles these features through the privacy gate.

   HONEST LANGUAGE (no fake ML):
   We say "pattern", "early signal", "possible concern", "trajectory" — never
   "prediction". Confidence is evidence-volume, not a statistical claim:
     tentative (<3 data points) · emerging (3–5) · clear (6+).

   Detects 5 core patterns:
     momentum_drop · quiet_improvement · repeated_concern
     member_team_divergence · invisible_load
   ============================================================ */

const DAY    = 86400000;
const RECENT = 14 * DAY;   // "last two weeks"
const PRIOR  = 42 * DAY;   // "the preceding ~4 weeks" (14–42d) / "~6 weeks" window

const avg    = a => a.reduce((s, v) => s + v, 0) / a.length;
const round1 = n => Math.round(n * 10) / 10;
const conf   = n => (n >= 6 ? 'clear' : n >= 3 ? 'emerging' : 'tentative');
const SEV_RANK = { high: 0, medium: 1, low: 2 };

const PATTERN_LABEL = {
  baseline_shift:         'Unusual for them',
  momentum_drop:          'Momentum dropping',
  quiet_improvement:      'Quiet improvement',
  repeated_concern:       'Repeated concern',
  member_team_divergence: 'Pulling away from the team',
  invisible_load:         'Carrying invisible load',
};

/* Care-oriented default next actions (used when the org has no learned action for
   this pattern yet). Honest, human, non-coercive. */
const DEFAULT_ACTION = {
  baseline_shift:         'Ask what’s changed lately — this is a shift from their OWN normal, not a judgement. Lead with curiosity.',
  momentum_drop:          'A personal check-in — ask how they’re doing and listen first, before anything task-related.',
  quiet_improvement:      'Acknowledge the progress specifically — quiet gains fade fast without recognition.',
  repeated_concern:       'Sit down together, name the recurring theme, and agree one small shared focus.',
  member_team_divergence: 'A 1:1 to understand what’s pulling them a different way from the group — integrate, don’t push.',
  invisible_load:         'Check they’re not carrying too much for others — offer to redistribute, or simply acknowledge the load.',
};

/* ── The five detectors ───────────────────────────────────────────────────────
   Each takes the normalized member feature object `m` (see server
   _buildMemberIntelInput) and returns a finding or null. `m.now` = ms timestamp.
   A finding: { type, severity, basis, confidence } — basis is a privacy-safe,
   counts-and-direction string only. */

function momentumDrop(m) {
  const pts    = (m.moodSeries || []);
  const recent = pts.filter(p => m.now - p.t <  RECENT);
  const prior  = pts.filter(p => m.now - p.t >= RECENT && m.now - p.t < PRIOR);
  if (recent.length < 2 || prior.length < 2) return null;
  const ra = avg(recent.map(p => p.mood)), pa = avg(prior.map(p => p.mood));
  if (!Number.isFinite(ra) || !Number.isFinite(pa)) return null; // never surface NaN to a human
  const drop = pa - ra;
  if (drop < 0.5) return null;                                  // not a meaningful decline
  const severity = (ra < 2.5 || drop >= 1.2) ? 'high' : 'medium';
  return {
    type: 'momentum_drop', severity,
    basis: `mood ${round1(ra)}/5 over the last two weeks vs ${round1(pa)}/5 before (${recent.length}+${prior.length} check-ins)`,
    confidence: conf(recent.length + prior.length),
  };
}

function quietImprovement(m) {
  const pts = (m.moodSeries || []).filter(p => m.now - p.t < PRIOR);
  if (pts.length < 3) return null;
  const mid = Math.floor(pts.length / 2);                       // pts are time-ascending
  const earlier = avg(pts.slice(0, mid).map(p => p.mood));
  const later   = avg(pts.slice(mid).map(p => p.mood));
  const rise = later - earlier;
  if (!Number.isFinite(rise) || !Number.isFinite(later)) return null; // never surface NaN
  if (rise < 0.4 || later < 3) return null;                     // rising AND now in a good place
  // "Quiet" = little visible recognition: few strong/public signals about them.
  const visible = (m.signalSeries || []).filter(s => m.now - s.t < PRIOR && s.weight === 'strong').length;
  if (visible > 3) return null;                                 // already highly visible → not quiet
  return {
    type: 'quiet_improvement', severity: 'low',
    basis: `mood up ${round1(rise)} over ~6 weeks with little visible recognition`,
    confidence: conf(pts.length),
  };
}

function repeatedConcern(m) {
  const c = (m.concernSeries || []).filter(x => m.now - x.t < PRIOR);
  if (c.length < 3) return null;                                // a pattern, not a one-off
  return {
    type: 'repeated_concern', severity: c.length >= 5 ? 'high' : 'medium',
    basis: `${c.length} concern signals over ~6 weeks — recurring, not a one-off`,
    confidence: conf(c.length),
  };
}

function memberTeamDivergence(m) {
  if (!m.teamTrajectory || !m.memberTrajectory) return null;
  const opposed =
    (m.memberTrajectory === 'down' && m.teamTrajectory !== 'down') ||
    (m.memberTrajectory === 'up'   && m.teamTrajectory === 'down');
  if (!opposed) return null;
  return {
    type: 'member_team_divergence', severity: m.memberTrajectory === 'down' ? 'medium' : 'low',
    basis: `trending ${m.memberTrajectory} while their team is ${m.teamTrajectory}`,
    confidence: 'emerging',
  };
}

function invisibleLoad(m) {
  const helping = (m.helpingSeries || []).filter(x => m.now - x.t < PRIOR).length;
  if (helping < 3) return null;                                 // must be actively supporting others
  const pts   = (m.moodSeries || []).filter(p => m.now - p.t < PRIOR);
  const mood  = pts.length >= 2 ? avg(pts.map(p => p.mood)) : null;
  const busy  = (m.signalSeries || []).filter(s => s.own && m.now - s.t < RECENT).length >= 5;
  const strained = mood != null && mood < 3.2;
  if (!(strained || (busy && helping >= 5))) return null;       // supporting others AND strained/overextended
  return {
    type: 'invisible_load', severity: strained ? 'medium' : 'low',
    basis: `${helping} supportive/among-others signals over ~6 weeks${mood != null ? `, own mood ${round1(mood)}/5` : ''}`,
    confidence: conf(helping),
  };
}

/* Self-relative shift: consumes deviations from the Behavior Engine (ai/baseline)
   — a change from the member's OWN normal, even if the absolute level looks fine.
   The most valuable early signal, and the fairest (no cross-member comparison). */
function baselineShift(m) {
  const devs = (m.deviations || []).filter(d => d.confidence === 'clear' || d.confidence === 'emerging');
  if (!devs.length) return null;
  const top = devs[0];
  const big = Math.abs(top.deviationPct || 0) >= 60;
  const severity = (top.dimension === 'mood' && top.direction === 'below') ? 'high' : big ? 'medium' : 'low';
  const basis = 'unusual for them — ' + devs.slice(0, 2)
    .map(d => `${d.label} ${d.direction} their usual${d.deviationPct != null ? ` (${Math.abs(d.deviationPct)}%)` : ''}`)
    .join('; ');
  return { type: 'baseline_shift', severity, basis, confidence: top.confidence };
}

const DETECTORS = [baselineShift, momentumDrop, quietImprovement, repeatedConcern, memberTeamDivergence, invisibleLoad];

/* Run all detectors over one member's features. Returns findings sorted by
   severity (most urgent first). Pure — safe to unit-test without a DB. */
function detectPatterns(m) {
  const out = [];
  for (const d of DETECTORS) {
    let f = null;
    try { f = d(m); } catch (_) { f = null; }                  // one bad detector never breaks the briefing
    if (f) out.push(f);
  }
  return out.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity]);
}

/* Compose a leader-facing briefing item from findings. Deterministic + honest —
   no AI here (the AI writes only the aggregate summary, server-side).
   `learning`: optional map patternType → { action, positive, total } from the
   org's own outcomes, so the recommended action reflects what has helped before.
   Nothing here contains private content. */
function composeBriefingItem(m, findings, learning = {}) {
  if (!findings.length) return null;
  const top = findings[0];
  const label = f => PATTERN_LABEL[f.type] || f.type;

  const learned = learning[top.type];
  const hasLearning = learned && learned.total >= 2 && learned.action;
  const recommendedAction = DEFAULT_ACTION[top.type] || 'A supportive check-in.';
  // Honest, evidence-based: only surfaced once the org has ≥2 measured outcomes
  // for this pattern. Never overwrites the care-first default.
  const learnedNote = hasLearning
    ? `Here, "${learned.action}" has tended to help with this pattern (${learned.positive}/${learned.total} positive).`
    : null;

  return {
    memberId: m.id,
    name:     m.name,
    severity: top.severity,
    patterns: findings.map(f => ({ type: f.type, label: label(f), basis: f.basis, confidence: f.confidence })),
    whyNow:   `${label(top)} — ${top.basis}.`,
    evidence: findings.map(f => f.basis),
    recommendedAction,
    learnedNote,
    // A soft, contentless nudge: there may be private context informing this.
    careFlag: !!m.hasSensitiveContext,
    patternType: top.type,
    // Self-relative evidence (Behavior Engine) — the "vs their own normal" view.
    deviations: (m.deviations || []).map(d => ({ label: d.label, direction: d.direction, deviationPct: d.deviationPct, recent: d.recent, normal: d.normal, confidence: d.confidence })),
    fingerprint: m.fingerprint || null,
    // Cross-signal connections — things that moved together for them (never causal).
    connections: m.connections || [],
  };
}

module.exports = {
  detectPatterns, composeBriefingItem,
  PATTERN_LABEL, DEFAULT_ACTION,
  // exported for tests
  _detectors: { momentumDrop, quietImprovement, repeatedConcern, memberTeamDivergence, invisibleLoad },
  RECENT, PRIOR,
};
