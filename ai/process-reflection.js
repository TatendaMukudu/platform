/* ============================================================
   ai/process-reflection.js — Process Reflection (pure)

   A layer for challenging and protecting ways of working without attacking people.
   It combines already-derived personal and organisational process signals into
   reflection prompts the UI can consume later.

   It asks about METHODS, not identity:
     "This handoff appears costly. What is it protecting?"
     "This routine has held five times. What should be protected about it?"

   It handles both friction and strength. IntelliQ does not only flag what is bad;
   it also questions what is working so the organisation/person understands why it
   should be kept, repeated, or shared.

   PURE: imports nothing, no DB, no AI, no IO. The caller owns privacy/scoping and
   supplies already-safe process observations.
   ============================================================ */

'use strict';

const LEVELS = ['personal', 'team', 'org'];
const POLARITIES = ['friction', 'strength', 'neutral'];
const SEVERITY_RANK = { high: 0, medium: 1, low: 2 };

const KIND_LABELS = {
  costly_handoff: 'costly handoff',
  repeated_delay: 'repeated delay',
  low_use_ritual: 'low-use routine',
  manual_rework: 'manual rework',
  stale_requirement: 'stale requirement',
  repeated_exception: 'repeated exception',
  working_routine: 'working routine',
  reliable_habit: 'reliable habit',
  successful_support: 'successful support pattern',
  effective_practice: 'effective practice',
};

function _s(v, n = 180) { return String(v == null ? '' : v).trim().slice(0, n); }
function _key(v) { return _s(v || 'unknown', 80).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'unknown'; }
function _hash(str) { let h = 5381; const s = String(str); for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i); return (h >>> 0).toString(36); }
function _label(kind, label) { return _s(label || KIND_LABELS[_key(kind)] || _key(kind).replace(/_/g, ' '), 120); }

function normalizeSignal(signal = {}) {
  const kind = _key(signal.kind || signal.type || signal.pattern || signal.processType);
  const level = LEVELS.includes(_key(signal.level || signal.scopeLevel)) ? _key(signal.level || signal.scopeLevel) : 'personal';
  const polarity = POLARITIES.includes(_key(signal.polarity)) ? _key(signal.polarity)
    : ['working_routine', 'reliable_habit', 'successful_support', 'effective_practice'].includes(kind) ? 'strength'
    : ['costly_handoff', 'repeated_delay', 'low_use_ritual', 'manual_rework', 'stale_requirement', 'repeated_exception'].includes(kind) ? 'friction'
    : 'neutral';
  const occurrences = Math.max(0, Number(signal.occurrences || signal.occurrenceCount || signal.count || 0) || 0);
  return {
    id: _s(signal.id || signal.fingerprint || ('prs_' + _hash(JSON.stringify(signal))), 100),
    kind,
    label: _label(kind, signal.label || signal.subjectLabel || signal.statement),
    level,
    polarity,
    severity: ['high', 'medium', 'low'].includes(_key(signal.severity || signal.priority)) ? _key(signal.severity || signal.priority) : (occurrences >= 5 ? 'high' : occurrences >= 3 ? 'medium' : 'low'),
    confidence: _key(signal.confidence || signal.confidenceLabel || 'emerging'),
    occurrences,
    subjectId: signal.subjectId != null ? _s(signal.subjectId, 80) : null,
    owner: signal.owner || signal.resolutionOwner || null,
    basis: Array.isArray(signal.basis) ? signal.basis.map(x => _s(x, 180)).filter(Boolean) : signal.basis ? [_s(signal.basis, 180)] : [],
    limitations: Array.isArray(signal.limitations) ? signal.limitations.map(x => _s(x, 180)) : [],
  };
}

function _target(level, owner) {
  if (owner) return owner;
  if (level === 'personal') return 'self';
  if (level === 'team') return 'team-lead';
  return 'org-lead';
}

function _challengeQuestion(s) {
  if (s.polarity === 'strength') {
    if (s.level === 'personal') return `This ${s.label} seems to be working for you. What part of it should IntelliQ help protect or repeat?`;
    return `This ${s.label} seems to be working here. What is worth protecting, repeating, or teaching to others?`;
  }
  if (s.polarity === 'friction') {
    if (s.level === 'personal') return `This ${s.label} seems to create friction in your process. What is it trying to protect, and is there a lighter way to do it?`;
    return `This ${s.label} appears to create repeated friction. What is it protecting, and should a lighter version be tested?`;
  }
  return `This process keeps appearing. What does it protect, and should it stay the same?`;
}

function _why(s) {
  const count = s.occurrences ? `It has appeared ${s.occurrences} time${s.occurrences === 1 ? '' : 's'}.` : 'It appears in the recorded process history.';
  if (s.polarity === 'strength') return `${count} IntelliQ is checking what to protect, not just what to fix.`;
  if (s.polarity === 'friction') return `${count} IntelliQ is challenging the method, not the person.`;
  return `${count} IntelliQ is asking whether this process still earns its place.`;
}

function reflectSignal(signal = {}) {
  const s = normalizeSignal(signal);
  const question = _challengeQuestion(s);
  return {
    id: 'pr_' + _hash([s.id, s.level, s.kind, s.polarity].join('|')),
    sourceSignalId: s.id,
    kind: s.kind,
    label: s.label,
    level: s.level,
    polarity: s.polarity,
    severity: s.severity,
    confidence: s.confidence,
    question,
    why: _why(s),
    target: _target(s.level, s.owner),
    requiresConfirmation: true,
    processNotPerson: true,
    protectsGood: s.polarity === 'strength',
    challengesFriction: s.polarity === 'friction',
    suggestedSurface: s.polarity === 'strength' ? 'process_strength' : 'process_attention',
    basis: s.level === 'personal' ? s.basis : [],
    limitations: [...new Set(['not_causal', ...s.limitations])],
    safe: true,
  };
}

function reflect(signals = [], opts = {}) {
  const limit = Number.isInteger(opts.limit) ? opts.limit : 5;
  const suppressed = new Set((opts.suppressed || []).map(_s));
  const seen = new Set();
  const reflections = (signals || []).map(reflectSignal)
    .filter(r => !suppressed.has(r.id) && !suppressed.has(r.sourceSignalId))
    .filter(r => {
      const k = `${r.level}:${r.kind}:${r.label}:${r.polarity}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => {
      const sev = (SEVERITY_RANK[a.severity] ?? 2) - (SEVERITY_RANK[b.severity] ?? 2);
      if (sev) return sev;
      if (a.polarity !== b.polarity) return a.polarity === 'friction' ? -1 : b.polarity === 'friction' ? 1 : a.polarity.localeCompare(b.polarity);
      return a.id.localeCompare(b.id);
    })
    .slice(0, Math.max(0, limit));
  return { reflections, generatedBy: 'process-reflection', safe: reflections.every(r => r.requiresConfirmation && r.processNotPerson) };
}

function fromSelfModelHabit(habit = {}) {
  const pattern = _key(habit.pattern);
  const strength = ['opens_view', 'own_work_first', 'own_assessment_first', 'readiness_first'].includes(pattern);
  return normalizeSignal({
    id: habit.id,
    kind: strength ? 'reliable_habit' : 'personal_process',
    label: habit.label || pattern.replace(/_/g, ' '),
    level: 'personal',
    polarity: strength ? 'strength' : 'neutral',
    occurrences: habit.dayCount || (Array.isArray(habit.days) ? habit.days.length : 0),
    confidence: habit.confidence,
  });
}

function fromPlaybookReview(entry = {}, review = {}) {
  const status = _key(review.status || entry.status);
  return normalizeSignal({
    id: entry.fingerprint || entry.candidateFingerprint,
    kind: status === 'holding' ? 'effective_practice' : status === 'contested' ? 'repeated_exception' : 'stale_requirement',
    label: entry.subjectLabel || entry.statement || 'practice',
    level: 'org',
    polarity: status === 'holding' ? 'strength' : 'friction',
    occurrences: (review.counterEvidenceNow && review.counterEvidenceNow.supporting) || (entry.counterEvidenceAtConfirmation && entry.counterEvidenceAtConfirmation.supporting) || 0,
    confidence: review.currentConfidence || entry.confidenceAtConfirmation,
    limitations: entry.limitations || [],
  });
}

function assertProcessSafe(reflection) {
  const text = [reflection && reflection.question, reflection && reflection.why].filter(Boolean).join(' ');
  const identityAttack = /\b(you are|they are|lazy|careless|bad at|incompetent|disorganized person|uncommitted)\b/i.test(text);
  const predictive = /\b(will|guarantee|predict|diagnos|caused|because)\b/i.test(text);
  return { ok: !identityAttack && !predictive && !!(reflection && reflection.processNotPerson), violations: [identityAttack && 'identity_attack', predictive && 'predictive_or_causal_language', !(reflection && reflection.processNotPerson) && 'not_marked_process'].filter(Boolean) };
}

module.exports = {
  LEVELS, POLARITIES,
  normalizeSignal, reflectSignal, reflect, fromSelfModelHabit, fromPlaybookReview, assertProcessSafe,
  _key,
};