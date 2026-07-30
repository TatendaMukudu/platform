/* ============================================================
   ai/process-observations.js — Process Observations (pure)

   The long-term source of genuine PROCESS signal: it learns how the ORGANISATION works
   by reading recorded action→outcome history (via ai/outcome-intelligence) and emitting
   the universal process primitives that ai/process-reflection reflects on. This is the
   "closed-loop organisational learning" thesis aimed at method, not people: the system
   notices that a WAY OF WORKING reliably helps (worth protecting) or repeatedly doesn't
   land (worth a lighter version) — grounded in what actually happened, never predicted.

   THE LINE THAT KEEPS IT SAFE (a process lens, never a performance lens):
     • STRUCTURAL + AGGREGATE ONLY. A signal is about a PATTERN's response across MANY
       recorded cases (≥ minCases), never one case and never a person. Emitted signals
       carry NO subjectId and an explicit 'aggregate' limitation — so a "friction" read can
       never become "person X keeps needing help." assertStructural enforces it.
     • NEVER NAG. A mixed picture (roughly as many worsened as improved) yields NOTHING —
       the system only speaks when the recorded history is clearly one way.
     • NEVER CAUSAL / PREDICTIVE. Every signal carries 'not_causal'; downstream
       process-reflection adds the process-not-person framing and its own safe-text guard.

   PURE: imports nothing, no DB / AI / IO. Identical summary in → identical signals out.
   The caller composes outcome-intelligence.summarize(records) and hands the result here.
   ============================================================ */

'use strict';

function _s(v, n = 160) { return String(v == null ? '' : v).trim().slice(0, n); }
function _key(v) { return _s(v || 'unknown', 80).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'unknown'; }
function _pretty(k) { return _key(k).replace(/_/g, ' '); }
function _n(v) { const x = Number(v); return Number.isFinite(x) ? x : 0; }

/* Turn an outcome-intelligence summary (patterns × interventions × recorded outcomes) into
   structural process signals. For each pattern with enough recorded, RESOLVED history:
     • clearly-helped (improved dominates, at/above strongRate) → a STRENGTH worth protecting.
     • clearly-didn't-land (worsened dominates)               → FRICTION worth a lighter test.
     • mixed / thin                                            → nothing (never nag). */
function fromOutcomeSummary(summary = {}, { minCases = 4, strongRate = 0.6 } = {}) {
  const out = [];
  for (const p of (summary && summary.patterns || [])) {
    const total = _n(p.totalCases);
    if (total < minCases) continue;                       // aggregate only — never a single case
    let improved = 0, steady = 0, worsened = 0;
    for (const i of (p.interventions || [])) { improved += _n(i.improved); steady += _n(i.steady); worsened += _n(i.worsened); }
    const resolved = improved + worsened;
    if (resolved < minCases) continue;                    // not enough decided outcomes to judge the process
    const pretty = _pretty(p.patternType);
    let kind, polarity;
    if (improved >= worsened && (improved / total) >= strongRate) { kind = 'successful_support'; polarity = 'strength'; }
    else if (worsened > improved) { kind = 'repeated_exception'; polarity = 'friction'; }
    else continue;                                        // mixed → the system stays quiet
    out.push({
      id: 'po_' + _key(p.patternType),
      kind,
      label: `way the team responds to ${pretty}`,
      level: 'org',
      polarity,
      occurrences: total,
      confidence: total >= 8 ? 'clear' : 'emerging',
      basis: [`${improved} improved, ${steady} held, ${worsened} worsened across ${total} recorded case${total === 1 ? '' : 's'}`],
      limitations: ['not_causal', 'aggregate'],
      // NO subjectId — this is about the PROCESS (how we respond), never about a person.
    });
  }
  return out.sort((a, b) => (b.occurrences - a.occurrences) || a.id.localeCompare(b.id));
}

/* The safety invariant every emitted signal must hold: structural (no subject) + explicitly
   aggregate. A caller (or test) uses this to prove no process signal can name a person. */
function assertStructural(signal) {
  const ok = !!signal && signal.subjectId == null && Array.isArray(signal.limitations) && signal.limitations.includes('aggregate');
  return { ok, violations: ok ? [] : ['not_structural_or_missing_aggregate_guard'] };
}

module.exports = { fromOutcomeSummary, assertStructural, _key };
