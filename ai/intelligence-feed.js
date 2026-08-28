/* ============================================================
   ai/intelligence-feed.js - Unified Intelligence Feed (pure)

   A single intake desk for already-derived, already-scoped artifacts. It does not
   detect, reason, rank, deliver, read evidence, call AI, or touch storage.

   Engines discover. This layer normalizes. Priority Office ranks. Behaviour/UI
   deliver later.

   Inputs may come from:
     - reasoner agenda/proposals
     - proactive insights
     - outcome-intelligence briefs
     - process-reflection reflections
     - self-model proposals/settings
     - org-playbook candidates/entries/reviews

   The caller owns authorization and privacy before artifacts reach this module.
   ============================================================ */

'use strict';

const guard = require('./language-guard');

const SOURCES = Object.freeze([
  'reasoner', 'proactive', 'outcome_intelligence', 'process_reflection', 'self_model', 'org_playbook', 'extra',
]);
const LEVELS = Object.freeze(['personal', 'person', 'team', 'org', 'scope']);
const POLARITIES = Object.freeze(['risk', 'progress', 'milestone', 'opportunity', 'friction', 'strength', 'neutral']);
const POLARITY_ALIASES = Object.freeze({
  difficulty: 'friction',
  condition: 'opportunity',
  working_well: 'strength',
  worth_attention: 'friction',
});
const POLARITY_BUCKET = Object.freeze({
  risk: 'low',
  friction: 'low',
  progress: 'high',
  milestone: 'high',
  opportunity: 'high',
  strength: 'high',
  neutral: null,
});
const BUCKETS = Object.freeze(['high', 'low']);
const PRIORITIES = Object.freeze(['urgent', 'high', 'medium', 'low', 'none']);
const CONFIDENCES = Object.freeze(['confirmed', 'clear', 'reliable', 'well_supported', 'supported', 'emerging', 'promising', 'tentative', 'calibrating', 'low', 'none']);

const SOURCE_KIND = Object.freeze({
  reasoner: 'belief',
  proactive: 'surface',
  outcome_intelligence: 'outcome_history',
  process_reflection: 'process_question',
  self_model: 'personal_working_pattern',
  org_playbook: 'practice_review',
  extra: 'artifact',
});

function _s(v, n = 240) { return String(v == null ? '' : v).trim().slice(0, n); }
function _key(v) { return _s(v || 'unknown', 100).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'unknown'; }
function _hash(str) { let h = 5381; const s = String(str); for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i); return (h >>> 0).toString(36); }
function _oneOf(list, v, fallback) { const k = _key(v); return list.includes(k) ? k : fallback; }
function _arr(v, n = 160) { return Array.isArray(v) ? v.map(x => _s(x, n)).filter(Boolean) : v ? [_s(v, n)] : []; }
function _proposal(suggestion) {
  if (!suggestion) return null;
  if (typeof suggestion === 'string') return { text: _s(suggestion, 240), requiresConfirmation: true };
  const text = _s(suggestion.text || suggestion.label || suggestion.action || suggestion.proposalType || '', 240);
  if (!text && !suggestion.proposalType && !suggestion.interventionType) return null;
  return { ...suggestion, text: text || _s(suggestion.proposalType || suggestion.interventionType, 120), requiresConfirmation: suggestion.requiresConfirmation === true };
}
function _priorityFromUrgency(urgency, fallback) {
  const u = Number(urgency);
  if (!Number.isFinite(u)) return fallback;
  if (u >= 12) return 'urgent';
  if (u >= 9) return 'high';
  if (u >= 5) return 'medium';
  return 'low';
}
function _level(item, fallback = 'scope') {
  if (item && item.level) return _oneOf(LEVELS, item.level, fallback);
  if (item && item.subjectId) return 'person';
  if (item && item.scope) return 'team';
  return fallback;
}
function _id(source, kind, item) {
  return _s(item.id || item.dedupeKey || item.beliefId || item.fingerprint || item.habitId || item.sourceSignalId ||
    ('if_' + _hash(JSON.stringify([source, kind, item.patternType || item.kind || item.type, item.subjectId || item.scope, item.title || item.headline || item.claim || item.statement || item.body || item.question]))), 140);
}

/* The ONE polarity vocabulary and High/Low decision. Producers retain the specific polarity
   because risk is not friction and progress is not strength; consumers ask this owner only
   whether the finding is a High, a Low, or neither. `data_gap` is our missing information,
   never a Low about the person (D6), regardless of an older producer's polarity. */
function normalizePolarity(value, fallback = 'neutral') {
  const key = _key(value);
  const canonical = POLARITY_ALIASES[key] || key;
  return POLARITIES.includes(canonical) ? canonical : fallback;
}
function bucketOf(itemOrPolarity) {
  const item = itemOrPolarity && typeof itemOrPolarity === 'object' ? itemOrPolarity : null;
  const patternType = _key(item && (item.patternType || item.type || item.kind));
  if (patternType === 'data_gap') return null;
  const polarity = normalizePolarity(item ? item.polarity : itemOrPolarity);
  return POLARITY_BUCKET[polarity] || null;
}

function normalizeArtifact(item = {}, opts = {}) {
  const source = _oneOf(SOURCES, opts.source || item.source || item.generatedBy, 'extra');
  const kind = _key(opts.kind || item.feedKind || item.itemKind || item.kind || SOURCE_KIND[source] || 'artifact');
  const patternType = _key(item.patternType || item.type || item.kind || item.action || kind);
  const priority = _oneOf(PRIORITIES, item.priority || item.severity, _priorityFromUrgency(item.urgency, 'low'));
  const confidence = _oneOf(CONFIDENCES, item.confidence || item.kernelConfidence || item.reliability || item.confidenceLabel, 'none');
  const suggestion = _proposal(item.suggestion || item.suggestedNextStep || item.proposal);
  const title = _s(item.title || item.headline || item.signal || item.claim || item.statement || item.question || patternType.replace(/_/g, ' '), 180);
  const body = _s(item.body || item.outcomeLine || item.why || item.text || item.line || item.reason || '', 500);
  const id = _id(source, kind, { ...item, patternType, title, body });
  return {
    id,
    source,
    kind,
    level: _level(item, opts.level || 'scope'),
    subjectId: item.subjectId != null ? _s(item.subjectId, 100) : null,
    subjectLabel: item.subjectLabel || item.subjectName ? _s(item.subjectLabel || item.subjectName, 120) : null,
    scope: item.scope != null ? _s(item.scope, 140) : null,
    patternType,
    polarity: normalizePolarity(item.polarity),
    priority,
    confidence,
    title,
    body,
    question: item.question ? _s(item.question, 360) : null,
    suggestion,
    target: item.target ? _s(item.target, 120) : null,
    limitations: _arr(item.limitations, 160),
    evidenceRefs: _arr(item.evidenceRefs || item.cites || item.supportingMoments, 100),
    rationale: _arr(item.rationale, 180),
    requiresConfirmation: suggestion ? suggestion.requiresConfirmation === true : item.requiresConfirmation === true,
    /* Computed from the text this artifact will actually show, not inherited on trust.
       `item.safe !== false` alone was a denylist: a producer that never sets the field — and
       none of them do — got `safe: true` for free, and scoped-intelligence-packet:canUseItem
       reads this as an authorisation gate. So unchecked text authorised itself.
       An explicit upstream `safe: false` still wins; what changes is that silence no longer
       counts as a clean bill of health. AGENTS.md §2 invariants 1 and 7. */
    safe: item.safe !== false && [title, body, suggestion && suggestion.text]
      .filter(Boolean).every(t => guard.describesOnly(t)),
    generatedBy: 'intelligence-feed',
    originalSource: source,
  };
}

function fromReasoner(agenda = [], proposals = []) {
  const byBelief = new Map((proposals || []).filter(Boolean).map(p => [p.beliefId, p]));
  return (agenda || []).filter(Boolean).map(a => normalizeArtifact({
    id: a.beliefId,
    kind: a.kind,
    patternType: a.kind,
    subjectId: a.subjectId,
    subjectLabel: a.subjectName,
    scope: a.scope,
    polarity: a.polarity,
    severity: a.severity,
    confidence: a.confidence,
    priority: _priorityFromUrgency(a.urgency, a.severity || 'low'),
    title: a.claim,
    body: a.timing ? `${a.why || a.claim} ${a.timing}` : (a.why || ''),
    suggestion: byBelief.get(a.beliefId) || null,
    limitations: a.readiness === 'hold' ? ['held_by_reasoner'] : [],
    rationale: [a.register && `register:${a.register}`, a.readiness && `readiness:${a.readiness}`, a.shared && 'shared_pattern'].filter(Boolean),
  }, { source: 'reasoner', kind: 'belief' }));
}

function fromProactive(insights = []) {
  return (insights || []).filter(Boolean).map(i => normalizeArtifact({
    ...i,
    kind: 'surface',
    title: i.headline,
    body: i.body,
    confidence: i.kernelConfidence || i.reliabilityLabel,
  }, { source: 'proactive', kind: 'surface' }));
}

function fromOutcomeBriefs(briefs = []) {
  return (briefs || []).filter(Boolean).map(b => normalizeArtifact({
    ...b,
    kind: 'outcome_history',
    title: b.signal || 'Outcome history available',
    body: b.outcomeLine,
    polarity: 'neutral',
    priority: b.limitations && b.limitations.includes('no_outcome_history') ? 'low' : 'medium',
    suggestion: b.suggestedNextStep || null,
  }, { source: 'outcome_intelligence', kind: 'outcome_history' }));
}

function fromProcessReflections(reflections = []) {
  return (reflections || []).filter(Boolean).map(r => normalizeArtifact({
    ...r,
    kind: 'process_question',
    patternType: r.kind,
    title: r.label || r.question,
    body: r.why,
    polarity: r.polarity === 'friction' ? 'friction' : r.polarity === 'strength' ? 'strength' : 'neutral',
    priority: r.severity || 'medium',
    suggestion: { text: r.question, requiresConfirmation: true, proposalType: 'process_reflection' },
  }, { source: 'process_reflection', kind: 'process_question' }));
}

function fromSelfModel({ habits = [], proposals = [], settings = null } = {}) {
  const proposalItems = (proposals || []).filter(Boolean).map(p => normalizeArtifact({
    id: p.habitId,
    kind: 'personal_working_pattern',
    patternType: p.pattern || p.setting,
    level: 'personal',
    polarity: 'strength',
    priority: 'medium',
    confidence: p.seenOnDays >= 6 ? 'clear' : 'emerging',
    title: (p.pattern || p.setting || 'working pattern').replace(/_/g, ' '),
    body: p.text,
    suggestion: { text: p.text, setting: p.setting, habitId: p.habitId, requiresConfirmation: true },
    rationale: [`seen_on_days:${p.seenOnDays || 0}`],
  }, { source: 'self_model', kind: 'personal_working_pattern' }));

  const settingItems = (settings && Array.isArray(settings._applied) ? settings._applied : []).map(s => normalizeArtifact({
    id: s.habitId || s.setting,
    kind: 'accepted_accommodation',
    patternType: s.pattern || s.setting,
    level: 'personal',
    polarity: 'strength',
    priority: 'low',
    confidence: 'confirmed',
    title: `Accepted accommodation: ${_s(s.setting, 80).replace(/_/g, ' ')}`,
    body: s.label ? `IntelliQ is already adapting around ${s.label}.` : 'IntelliQ is already adapting around this working pattern.',
    suggestion: null,
  }, { source: 'self_model', kind: 'accepted_accommodation' }));

  const transparentHabits = (habits || []).filter(h => h && h.status && h.status !== 'open').map(h => normalizeArtifact({
    id: h.id || h.habitId,
    kind: 'habit_status',
    patternType: h.pattern,
    level: 'personal',
    polarity: h.status === 'accepted' ? 'strength' : 'neutral',
    priority: 'low',
    confidence: h.confidence || 'none',
    title: `Self-model: ${(h.pattern || 'habit').replace(/_/g, ' ')}`,
    body: `Status: ${h.status}.`,
    suggestion: null,
  }, { source: 'self_model', kind: 'habit_status' }));

  return [...proposalItems, ...settingItems, ...transparentHabits];
}

function fromOrgPlaybook({ candidates = [], entries = [], reviews = [] } = {}) {
  const candidateItems = (candidates || []).filter(Boolean).map(c => normalizeArtifact({
    id: c.fingerprint,
    kind: 'practice_candidate',
    patternType: c.type,
    level: 'org',
    polarity: 'strength',
    priority: c.confidence === 'well_supported' ? 'high' : 'medium',
    confidence: c.confidence,
    title: c.subjectLabel || 'Candidate practice',
    body: c.statement,
    evidenceRefs: c.supportingMoments || c.sample || [],
    limitations: c.limitations || [],
    suggestion: { text: 'Review this as a candidate practice.', requiresConfirmation: true, proposalType: 'playbook_candidate_review' },
    rationale: [`supporting:${(c.counterEvidence && c.counterEvidence.supporting) || 0}`, `against:${(c.counterEvidence && c.counterEvidence.contradicting) || 0}`],
  }, { source: 'org_playbook', kind: 'practice_candidate' }));

  const entryItems = (entries || []).filter(Boolean).map(e => normalizeArtifact({
    id: e.fingerprint,
    kind: 'confirmed_practice',
    patternType: e.type,
    level: 'org',
    polarity: 'strength',
    priority: 'low',
    // The band computed when the practice was confirmed, not a fresh assertion that it is
    // confirmed. playbookEntryFrom preserves it as confidenceAtConfirmation; hardcoding
    // 'confirmed' here discarded a real derived value. Absent it, claim nothing.
    confidence: e.confidenceAtConfirmation,
    title: e.subjectLabel || 'Confirmed practice',
    body: e.statement,
    evidenceRefs: e.supportingMoments || e.sample || [],
    limitations: e.limitations || [],
  }, { source: 'org_playbook', kind: 'confirmed_practice' }));

  const reviewItems = (reviews || []).filter(Boolean).map(r => normalizeArtifact({
    id: r.fingerprint || r.entryFingerprint || r.id,
    kind: 'practice_review',
    patternType: r.type || r.status,
    level: 'org',
    polarity: r.status === 'holding' ? 'strength' : r.status === 'contested' ? 'friction' : 'neutral',
    priority: r.status === 'contested' ? 'high' : r.status === 'unsupported' ? 'medium' : 'low',
    confidence: r.currentConfidence || r.confidence || 'none',
    title: r.label || r.subjectLabel || r.status || 'Practice review',
    body: r.reason || r.statement || '',
    limitations: r.limitations || [],
    suggestion: r.status && r.status !== 'holding' ? { text: 'Review whether this practice still belongs in the playbook.', requiresConfirmation: true, proposalType: 'playbook_lifecycle_review' } : null,
  }, { source: 'org_playbook', kind: 'practice_review' }));

  return [...candidateItems, ...entryItems, ...reviewItems];
}

function collect(input = {}, opts = {}) {
  const items = [
    ...fromReasoner(input.reasoner && input.reasoner.agenda || input.agenda || [], input.reasoner && input.reasoner.proposals || input.proposals || []),
    ...fromProactive(input.proactive && input.proactive.insights || input.insights || []),
    ...fromOutcomeBriefs(input.outcomeIntelligence && input.outcomeIntelligence.briefs || input.outcomeBriefs || []),
    ...fromProcessReflections(input.processReflection && input.processReflection.reflections || input.reflections || []),
    ...fromSelfModel(input.selfModel || {}),
    ...fromOrgPlaybook(input.orgPlaybook || {}),
    ...(input.extras || []).map(x => normalizeArtifact(x, { source: 'extra' })),
  ];
  return finalize(items, opts);
}

function finalize(items = [], opts = {}) {
  const suppressed = new Set((opts.suppressed || []).map(x => _s(x)));
  const seen = new Set();
  const out = [];
  for (const raw of (items || [])) {
    const item = raw && raw.generatedBy === 'intelligence-feed' ? raw : normalizeArtifact(raw);
    if (!item.safe || suppressed.has(item.id)) continue;
    const dedupe = `${item.source}:${item.kind}:${item.patternType}:${item.subjectId || item.scope || ''}:${item.title}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push({ ...item, rationale: [...item.rationale, `source:${item.source}`] });
  }
  return {
    items: out.sort((a, b) => a.source.localeCompare(b.source) || a.id.localeCompare(b.id)),
    generatedBy: 'intelligence-feed',
    safe: out.every(i => i.safe && (!i.suggestion || i.suggestion.requiresConfirmation === true)),
    empty: out.length === 0,
  };
}

function toPriorityInput(feed = {}) {
  const items = Array.isArray(feed) ? feed : (feed.items || []);
  return { feedItems: items };
}

module.exports = {
  SOURCES, LEVELS, POLARITIES, POLARITY_ALIASES, POLARITY_BUCKET, BUCKETS,
  PRIORITIES, CONFIDENCES, SOURCE_KIND, normalizePolarity, bucketOf,
  normalizeArtifact, collect, finalize, toPriorityInput,
  fromReasoner, fromProactive, fromOutcomeBriefs, fromProcessReflections, fromSelfModel, fromOrgPlaybook,
  _key,
};
