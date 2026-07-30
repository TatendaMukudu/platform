/* ============================================================
   ai/priority-office.js — Priority Office (pure)

   The final stamping desk before delivery. It decides which already-safe items
   deserve attention first, and whether to ask the user before changing their lead
   view. It does NOT detect, reason, scope, summarize raw evidence, execute, or
   create a new fact.

   Inputs are artifacts from other layers: reasoner reads, proactive insights,
   outcome-intelligence briefs, confidence labels, and explicit/user-behaviour
   preferences. Output is a ranked queue the UI can consume later.

   PURE: imports nothing, no DB, no AI, no IO.
   ============================================================ */

'use strict';

const PRIORITY_RANK = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };
const CONF_RANK = { confirmed: 0, clear: 1, reliable: 1, emerging: 2, promising: 2, tentative: 3, calibrating: 3, low: 3, none: 4 };
const POLARITY_RANK = { risk: 0, neutral: 1, opportunity: 2, progress: 3, milestone: 3 };

function _s(v, n = 160) { return String(v == null ? '' : v).trim().slice(0, n); }
function _key(v) { return _s(v || 'unknown', 80).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'unknown'; }
function _rank(map, value, fallback) { const k = _key(value); return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : fallback; }
function _hash(str) { let h = 5381; const s = String(str); for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i); return (h >>> 0).toString(36); }

function normalizeItem(item = {}, source = 'unknown') {
  const patternType = _key(item.patternType || item.type || item.kind || item.action);
  const polarity = _key(item.polarity || (item.outcomeLine ? 'neutral' : 'neutral'));
  const priority = _key(item.priority || item.severity || 'low');
  const confidence = _key(item.kernelConfidence || item.confidence || item.reliability || 'none');
  const id = _s(item.id || item.dedupeKey || `${source}:${patternType}:${item.subjectId || item.scope || ''}` || ('po_' + _hash(JSON.stringify(item))), 120);
  const title = _s(item.headline || item.title || item.signal || item.opening || patternType.replace(/_/g, ' '), 160);
  const body = _s(item.body || item.outcomeLine || item.text || item.line || '', 400);
  const suggestion = item.suggestion || item.suggestedNextStep || null;
  return {
    id,
    source,
    patternType,
    subjectId: item.subjectId != null ? _s(item.subjectId, 80) : null,
    scope: item.scope != null ? _s(item.scope, 120) : null,
    bucket: _key(item.bucket || item.suggestedSurface || item.group || patternType),
    polarity,
    priority,
    confidence,
    title,
    body,
    suggestion: suggestion ? { ...suggestion, requiresConfirmation: suggestion.requiresConfirmation === true } : null,
    limitations: Array.isArray(item.limitations) ? item.limitations.map(x => _s(x, 160)) : [],
    rationale: Array.isArray(item.rationale) ? item.rationale.map(x => _s(x, 160)) : [],
    original: item,
  };
}

function _score(item, prefs = {}) {
  let score = 0;
  score += (4 - _rank(PRIORITY_RANK, item.priority, 4)) * 100;
  score += (4 - _rank(CONF_RANK, item.confidence, 4)) * 20;
  score += (4 - _rank(POLARITY_RANK, item.polarity, 2)) * 8;
  if (item.limitations.includes('no_outcome_history')) score -= 10;
  if (item.limitations.includes('small_sample')) score -= 5;
  const preferred = Array.isArray(prefs.preferredBuckets) ? prefs.preferredBuckets.map(_key) : [];
  if (preferred.includes(item.bucket) || preferred.includes(item.patternType)) score += 12;
  if (prefs.pinnedFirst && (_key(prefs.pinnedFirst) === item.bucket || _key(prefs.pinnedFirst) === item.patternType)) score += 30;
  return score;
}

function buildQueue({ reads = [], insights = [], outcomeBriefs = [], extras = [], prefs = {}, suppressed = [] } = {}) {
  const suppressedSet = new Set((suppressed || []).map(_s));
  const all = [
    ...reads.map(x => normalizeItem(x, 'reasoner')),
    ...insights.map(x => normalizeItem(x, 'proactive')),
    ...outcomeBriefs.map(x => normalizeItem(x, 'outcome_intelligence')),
    ...extras.map(x => normalizeItem(x, 'extra')),
  ].filter(i => i.title || i.body).filter(i => !suppressedSet.has(i.id));

  const seen = new Set();
  const queue = all.filter(i => {
    const k = `${i.source}:${i.patternType}:${i.subjectId || i.scope || ''}:${i.title}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).map(i => {
    const score = _score(i, prefs);
    const rationale = [...i.rationale];
    rationale.push(`priority:${i.priority}`);
    if (i.confidence && i.confidence !== 'none') rationale.push(`confidence:${i.confidence}`);
    if (i.source === 'outcome_intelligence') rationale.push('outcome_history');
    if (i.limitations.length) rationale.push(...i.limitations.map(l => `limitation:${l}`));
    return { ...i, score, rationale };
  }).sort((a, b) => (b.score - a.score) || a.id.localeCompare(b.id));

  return queue;
}

function askFirstOffer(queue, usage = {}) {
  const preferred = _key(usage.opensFirst || usage.asksFirst || usage.preferredFirst);
  if (!preferred || preferred === 'unknown' || !queue.length) return null;
  const match = queue.find(i => i.bucket === preferred || i.patternType === preferred || i.source === preferred);
  if (!match || match.id === queue[0].id) return null;
  return {
    text: `You often look for ${preferred.replace(/_/g, ' ')} first. Want IntelliQ to lead with that when it is available?`,
    preferredTarget: preferred,
    targetItemId: match.id,
    requiresConfirmation: true,
  };
}

function stamp(input = {}) {
  const queue = buildQueue(input);
  const lead = queue[0] || null;
  return {
    lead,
    queue,
    askFirst: askFirstOffer(queue, input.usageSignals || {}),
    empty: queue.length === 0,
    message: queue.length ? null : 'Nothing needs prioritising right now.',
    generatedBy: 'priority-office',
    safe: queue.every(i => !i.suggestion || i.suggestion.requiresConfirmation === true),
  };
}

module.exports = {
  normalizeItem, buildQueue, askFirstOffer, stamp,
  PRIORITY_RANK, CONF_RANK, POLARITY_RANK,
  _score, _key,
};