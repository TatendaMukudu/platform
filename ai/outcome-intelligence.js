/* ============================================================
   ai/outcome-intelligence.js — Outcome Intelligence (pure)

   The learning loop without prediction. This module answers:

     When this pattern appeared before, what support was tried,
     what changed afterward, and how much recorded history do we have?

   It does NOT predict a person, diagnose, claim causation, rank people, or execute
   an intervention. It summarizes already-recorded action/outcome history so the
   UI and assistant can say cautious things like:

     "This pattern has appeared 3 times. A supportive check-in was followed by
      improvement in 3 of 5 recorded cases here."

   PURE: no DB, no AI, no IO. Identical records in, identical brief out. The caller
   owns privacy/scoping before records reach this module.

   `safe` is COMPUTED, never declared. It is the result of running every line this
   module emits through ai/language-guard.js — the one canonical no-prediction /
   no-diagnosis check. A module that stamps itself safe is asserting its own
   confidence, which AGENTS.md §2 forbids, and downstream gates trust the field.
   ============================================================ */

'use strict';

const guard = require('./language-guard');

const OUTCOMES = ['improved', 'steady', 'worsened', 'unclear'];
const SMALL_SAMPLE = 3;

const LABELS = {
  supportive_checkin: 'supportive check-in',
  checkin: 'check-in',
  recognise: 'recognition',
  recognition: 'recognition',
  assessment: 'assessment',
  set_assessment: 'assessment',
  reduce_load: 'load reduction',
  peer_checkin: 'peer check-in',
  route_support: 'routing to support',
};

function _s(v, n = 120) { return String(v == null ? '' : v).trim().slice(0, n); }
function _key(v) { return _s(v || 'unknown', 80).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'unknown'; }
function _label(v) { const k = _key(v); return LABELS[k] || _s(v || k, 80).replace(/_/g, ' '); }
function _num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

function normalizeOutcome(v) {
  const x = _key(v);
  if (['improved', 'positive', 'better', 'resolved', 'helped'].includes(x)) return 'improved';
  if (['steady', 'held', 'stable', 'maintained', 'neutral'].includes(x)) return 'steady';
  if (['worsened', 'negative', 'worse', 'declined', 'not_helpful'].includes(x)) return 'worsened';
  return 'unclear';
}

function normalizeRecord(record = {}) {
  const patternType = _key(record.patternType || record.pattern || record.kind);
  const interventionType = _key(record.interventionType || record.intervention || record.action || record.verb);
  return {
    id: record.id != null ? _s(record.id, 80) : null,
    patternType,
    interventionType,
    interventionLabel: _label(record.interventionLabel || record.interventionType || record.intervention || record.action || record.verb),
    outcome: normalizeOutcome(record.outcome || record.result || record.evaluation),
    subjectId: record.subjectId != null ? _s(record.subjectId, 80) : null,
    scope: record.scope != null ? _s(record.scope, 120) : null,
    at: record.at || record.createdAt || record.evaluatedAt || null,
    evidenceRefs: Array.isArray(record.evidenceRefs) ? record.evidenceRefs.map(r => _s(r, 80)).filter(Boolean) : [],
    open: record.open === true || normalizeOutcome(record.outcome || record.result || record.evaluation) === 'unclear',
  };
}

function _emptyCounts() { return { improved: 0, steady: 0, worsened: 0, unclear: 0 }; }
function _rate(n, total) { return total ? Math.round((n / total) * 100) : null; }

function summarize(records = [], opts = {}) {
  const targetPattern = opts.patternType ? _key(opts.patternType) : null;
  const targetScope = opts.scope != null ? _s(opts.scope, 120) : null;
  const clean = (records || []).map(normalizeRecord).filter(r => {
    if (!r.patternType || r.patternType === 'unknown') return false;
    if (!r.interventionType || r.interventionType === 'unknown') return false;
    if (targetPattern && r.patternType !== targetPattern) return false;
    if (targetScope && r.scope && r.scope !== targetScope) return false;
    return true;
  });

  const byPattern = new Map();
  for (const r of clean) {
    const p = byPattern.get(r.patternType) || { patternType: r.patternType, totalCases: 0, openCases: 0, interventions: new Map() };
    p.totalCases++;
    if (r.open) p.openCases++;
    const i = p.interventions.get(r.interventionType) || {
      interventionType: r.interventionType,
      interventionLabel: r.interventionLabel,
      total: 0,
      counts: _emptyCounts(),
      evidenceRefs: [],
    };
    i.total++;
    i.counts[r.outcome] = _num(i.counts[r.outcome]) + 1;
    i.evidenceRefs.push(...r.evidenceRefs);
    p.interventions.set(r.interventionType, i);
    byPattern.set(r.patternType, p);
  }

  const patterns = [...byPattern.values()].map(p => {
    const interventions = [...p.interventions.values()].map(i => {
      const useful = i.counts.improved + i.counts.steady;
      const limitations = ['not_causal'];
      if (i.total <= SMALL_SAMPLE) limitations.push('small_sample');
      if (i.counts.unclear) limitations.push('outcome_still_unclear');
      return {
        interventionType: i.interventionType,
        interventionLabel: i.interventionLabel,
        total: i.total,
        improved: i.counts.improved,
        steady: i.counts.steady,
        worsened: i.counts.worsened,
        unclear: i.counts.unclear,
        useful,
        usefulRate: _rate(useful, i.total),
        improvedRate: _rate(i.counts.improved, i.total),
        evidenceRefs: [...new Set(i.evidenceRefs)].sort(),
        limitations,
        line: outcomeLine(i.interventionLabel, i.counts, i.total),
      };
    }).sort((a, b) => (b.useful - a.useful) || (b.total - a.total) || a.interventionType.localeCompare(b.interventionType));
    return {
      patternType: p.patternType,
      totalCases: p.totalCases,
      openCases: p.openCases,
      interventions,
      limitations: p.totalCases <= SMALL_SAMPLE ? ['small_sample', 'not_causal'] : ['not_causal'],
    };
  }).sort((a, b) => (b.totalCases - a.totalCases) || a.patternType.localeCompare(b.patternType));

  const safe = patterns.every(p => p.interventions.every(i => guard.describesOnly(i.line)));
  return { patterns, generatedBy: 'outcome-intelligence', safe };
}

function outcomeLine(label, counts, total) {
  const c = { ..._emptyCounts(), ...(counts || {}) };
  const name = _label(label);
  if (!total) return `No recorded outcomes yet for ${name}.`;
  const parts = [];
  if (c.improved) parts.push(`${c.improved} improved`);
  if (c.steady) parts.push(`${c.steady} held steady`);
  if (c.worsened) parts.push(`${c.worsened} worsened`);
  if (c.unclear) parts.push(`${c.unclear} still unclear`);
  return `${name} was followed by: ${parts.join(', ')} (${total} recorded case${total === 1 ? '' : 's'}).`;
}

function bestForPattern(summary, patternType) {
  const p = (summary && summary.patterns || []).find(x => x.patternType === _key(patternType));
  return p && p.interventions.length ? p.interventions[0] : null;
}

function earlySignalBrief({ patternType, signalCount = 0, outcomeSummary = null, scopeLabel = 'here' } = {}) {
  const p = _key(patternType);
  const best = bestForPattern(outcomeSummary, p);
  const limitations = ['not_causal'];
  const signal = signalCount > 0
    ? `This pattern has appeared ${signalCount} time${signalCount === 1 ? '' : 's'} ${scopeLabel}.`
    : `This pattern is present ${scopeLabel}.`;

  if (!best) {
    return {
      patternType: p,
      signal,
      outcomeLine: 'No recorded outcome history for this pattern yet.',
      suggestedNextStep: null,
      limitations: [...limitations, 'no_outcome_history'],
      safe: guard.describesOnly(signal),
    };
  }

  if (best.total <= SMALL_SAMPLE) limitations.push('small_sample');
  if (best.unclear) limitations.push('outcome_still_unclear');
  return {
    patternType: p,
    signal,
    outcomeLine: best.line,
    suggestedNextStep: {
      text: `${best.interventionLabel} has recorded outcome history for this pattern ${scopeLabel}. Review before acting.`,
      interventionType: best.interventionType,
      requiresConfirmation: true,
    },
    limitations,
    safe: [signal, best.line, `${best.interventionLabel} has recorded outcome history for this pattern ${scopeLabel}. Review before acting.`]
      .every(t => guard.describesOnly(t)),
  };
}

function assertSafeText(text) {
  const s = String(text || '');
  const banned = /\b(will|guarantee|predict|diagnos|caused|because|certain|destined|likely to)\b/i;
  return { ok: !banned.test(s), violations: banned.test(s) ? ['predictive_or_causal_language'] : [] };
}

module.exports = {
  OUTCOMES, SMALL_SAMPLE,
  normalizeOutcome, normalizeRecord, summarize, outcomeLine, bestForPattern, earlySignalBrief, assertSafeText,
  _key,
};