/* ============================================================
   ai/org-learning.js — PURE Learning Engine, Phase B1: OBSERVATIONS, not recommendations

   Converts compatible organisational-memory history into deterministic, inspectable
   LONGITUDINAL OBSERVATIONS. An observation describes something that recurred in the
   recorded history — e.g. "availability information moved from not recorded to recorded
   on three occasions". It is NOT a discovered truth, a recommendation, a causal claim,
   a forecast, or a best practice. Those are later phases and are deliberately absent.

   The vocabulary is strict and layered:
     • moment    — one recorded derived state (owned by ai/org-memory).
     • interval  — a valid comparison between two chronologically-adjacent, SEMANTICALLY
                   COMPATIBLE moments (built here).
     • observation — a deterministic summary of one or more intervals (built here).
     • candidate pattern — future work (Phase B2); NOT implemented.

   Discipline:
     • PURE — imports nothing. The memory differ is INJECTED via options so this module
       reuses org-memory's deterministic diff without importing it.
     • DETERMINISTIC — no LLM, no embeddings, no clustering, no confidence, no scoring.
       Identical history → identical observations + identical fingerprints.
     • OBSERVATIONAL — never mutates memory/state/evidence; only reads what it is given.
     • NON-CAUSAL / NON-EVALUATIVE — wording says "recurred" / "co-occurred with", never
       "caused", "led to", "improved", "resulted in", "healthy", or "effective".
     • PRIVACY — public output is redacted to safe structural categories only. No raw
       evidence, member/actor ids, record/requirement ids, hashes, versions, or trigger
       boundaries ever cross the public boundary.
   ============================================================ */

const OBSERVATION_SCHEMA_VERSION = 1;
const OBSERVATION_RULES_VERSION  = 1;

function _hash(str) { let h = 5381; const s = String(str); for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i); return (h >>> 0).toString(36); }
const parse = t => { if (!t) return null; const ms = new Date(t).getTime(); return Number.isFinite(ms) ? ms : null; };
const _reqParent = rid => { const s = String(rid || ''); const i = s.indexOf(':'); return i > 0 ? s.slice(0, i) : null; };
const uniq = arr => [...new Set(arr)];

/* ── Safe, normalised labels. Public output uses these — never the raw claimType/id. A
   claimType we don't recognise maps to a generic category (not a fabricated specific). ── */
const SUBJECT_LABELS = Object.freeze({
  availability: 'availability information',
  game_plan: 'preparation information',
  kickoff_time: 'scheduling information', session_time: 'scheduling information', meeting_time: 'scheduling information',
  meeting_owner: 'ownership information', owner: 'ownership information', ownership: 'ownership information',
  completion_status: 'completion information', approval: 'approval requirement',
});
const subjectLabel = ct => SUBJECT_LABELS[ct] || 'a recurring operating requirement';
const STATE_LABELS = Object.freeze({
  known: 'recorded', missing: 'not recorded', stale: 'out of date', disputed: 'in conflict',
  not_yet_due: 'not yet due', not_applicable: 'not applicable', unsupported: 'unsupported', superseded: 'replaced',
});
const stateLabel = s => STATE_LABELS[s] || String(s || 'unestablished');
const CAUSE_LABELS = Object.freeze({
  evidence_added: 'information being recorded', evidence_superseded: 'information being replaced',
  evidence_removed: 'information being removed', structure_added: 'a requirement being added',
  structure_changed: 'a requirement changing', structure_removed: 'a requirement being removed',
  ownership_changed: 'an ownership change', became_due: 'a requirement becoming due',
  became_stale: 'information becoming out of date', became_not_applicable: 'a requirement becoming not applicable',
});
const causeLabel = c => CAUSE_LABELS[c] || 'a change';
const READINESS_LABELS = Object.freeze({ ready: 'ready', partially_ready: 'partially ready', not_ready: 'not ready',
  insufficient_information: 'not enough information', not_yet_due: 'not yet due', not_applicable: 'not applicable' });
const readinessLabel = s => READINESS_LABELS[s] || String(s || 'unknown');

/* ══ INTERVALS ══════════════════════════════════════════════════════════════════════
   A comparison between two chronologically-adjacent moments. Only SEMANTICALLY COMPATIBLE
   pairs are analysable; incompatible pairs (a rules rebaseline, or legacy unknown-
   semantics history) are retained as DIAGNOSTIC intervals and excluded from derivation.
   No interval ever spans more than one adjacency, so none can cross a semantics boundary. */
function intervalFingerprint(fromFp, toFp) { return `${fromFp}→${toFp}`; }

function buildIntervals(timeline, { diff, orgRef = null } = {}) {
  if (typeof diff !== 'function') throw new Error('buildIntervals requires an injected memory diff function');
  // Keep only well-formed moments for THIS tenant, with a parseable time + a fingerprint.
  const clean = (timeline || []).filter(m => m && m.fingerprint != null && parse(m.at) != null
    && (orgRef == null || m.orgRef == null || m.orgRef === orgRef));
  // Deterministic chronological order; de-duplicate identical fingerprints (a repeated
  // persisted moment must not manufacture a zero-length interval).
  const seen = new Set();
  const asc = clean.slice().sort((a, b) => (parse(a.at) - parse(b.at)) || String(a.fingerprint).localeCompare(String(b.fingerprint)))
    .filter(m => { const k = String(m.fingerprint); if (seen.has(k)) return false; seen.add(k); return true; });

  const intervals = [];
  for (let i = 1; i < asc.length; i++) {
    const prev = asc[i - 1], next = asc[i];
    const startedAt = prev.at, endedAt = next.at;
    const durationMs = parse(endedAt) - parse(startedAt);
    if (!(durationMs >= 0)) continue;                              // malformed/reversed → fail safe
    const legacy = !prev.semantics || !next.semantics;
    const d = diff(prev, next) || {};
    const incompatible = legacy || d.semanticsChanged === true;
    const incompatibilityReason = legacy ? 'legacy_unknown_semantics' : (d.semanticsChanged ? 'semantics_changed' : null);
    intervals.push({
      fingerprint: intervalFingerprint(prev.fingerprint, next.fingerprint),
      fromFingerprint: prev.fingerprint, toFingerprint: next.fingerprint,
      startedAt, endedAt, durationMs,
      compatible: !incompatible, incompatibilityReason,
      triggerCategory: d.triggerCategory || null,
      readinessTransition: d.readiness ? { from: d.readiness.from, to: d.readiness.to, direction: d.readiness.direction } : { from: null, to: null, direction: 'same' },
      transitions: incompatible ? [] : (d.claimTransitions || []),   // no analytical transitions across a boundary
      causes: incompatible ? [] : (d.causes || []),
      fromClaims: _claimMap(prev), toClaims: _claimMap(next),
      limitations: [],
    });
  }
  return intervals;
}
function _claimMap(moment) { const m = {}; for (const c of (moment.claims || [])) m[c.requirementId || (`?:${c.claimType}`)] = c.state; return m; }

/* ══ OBSERVATIONS ═══════════════════════════════════════════════════════════════════ */
function deriveObservations(intervals, { minOccurrences = 2, minDistinctEvents = 2, minStableMoments = 3 } = {}) {
  const analyzable = (intervals || []).filter(i => i.compatible);
  const total = analyzable.length;
  const rebaselineInterrupted = (intervals || []).some(i => i.incompatibilityReason === 'semantics_changed');
  const out = [];
  if (!total) return out;

  // Flatten transitions across analysable intervals into an ordered event stream.
  const events = [];
  for (const iv of analyzable) for (const t of (iv.transitions || [])) {
    events.push({ subject: t.claimType || null, requirementId: t.requirementId || null, from: t.from, to: t.to,
      direction: t.direction, cause: t.cause, intervalFp: iv.fingerprint, at: iv.endedAt });
  }
  events.sort((a, b) => (parse(a.at) - parse(b.at)) || String(a.intervalFp).localeCompare(String(b.intervalFp)));

  const bump = (map, key, ev) => { const g = map.get(key) || { intervals: [], events: [], parents: new Set() };
    g.intervals.push(ev.intervalFp); g.events.push(ev); if (ev.requirementId) g.parents.add(_reqParent(ev.requirementId) || ev.requirementId); map.set(key, g); };

  // Helpers to finish an observation with support + contradictions + limitations.
  const finish = (o, group, opts = {}) => {
    const ivFps = uniq(group.intervalFingerprints || group.intervals).sort();
    const times = (group.events || []).map(e => e.at).filter(Boolean).sort();
    const occ = opts.occurrenceCount != null ? opts.occurrenceCount : (group.events ? group.events.length : ivFps.length);
    const distinctEvents = group.parents ? group.parents.size : (opts.distinctEvents || 0);
    const support = { intervalFingerprints: ivFps, occurrenceCount: occ,
      firstObservedAt: times[0] || opts.firstObservedAt || null, lastObservedAt: times[times.length - 1] || opts.lastObservedAt || null };
    const contradictions = [];
    if (opts.reverseAlsoOccurred) contradictions.push('reverse_transition_also_occurred');
    if (opts.sequenceDidNotRecurRecently) contradictions.push('did_not_recur_in_most_recent_history');
    if (distinctEvents === 1) contradictions.push('depends_on_a_single_event');
    if (total > 1 && ivFps.length < total / 2) contradictions.push('present_in_a_minority_of_intervals');
    if (rebaselineInterrupted) contradictions.push('history_interrupted_by_a_rules_change');
    const limitations = [];
    if (total < 3) limitations.push('based on a short history');
    if (distinctEvents === 1) limitations.push('depends on a single event');
    if ((group.events || []).some(e => e.cause === 'unknown')) limitations.push('some changes have an undetermined cause');
    const klass = opts.klass;
    const identityKey = _hash(JSON.stringify([o.type, o.subject, klass]));
    const fingerprint = _hash(JSON.stringify([o.type, o.subject, klass, ivFps, OBSERVATION_RULES_VERSION]));
    return { ...o, subjectLabel: subjectLabel(o.subject), klass,
      occurrenceCount: occ, distinctEvents, firstObservedAt: support.firstObservedAt, lastObservedAt: support.lastObservedAt,
      support, possibleContradictions: uniq(contradictions), limitations: uniq(limitations),
      identityKey, fingerprint, observationSchemaVersion: OBSERVATION_SCHEMA_VERSION, observationRulesVersion: OBSERVATION_RULES_VERSION };
  };

  // A · REPEATED TRANSITION — (subject, from→to) recurred ≥ minOccurrences.
  const byTransition = new Map();
  for (const ev of events) if (ev.direction && ev.subject) bump(byTransition, `${ev.subject}|${ev.from}|${ev.to}`, ev);
  for (const [key, g] of byTransition) {
    if (g.events.length < minOccurrences) continue;
    const [subject, from, to] = key.split('|');
    const reverseAlsoOccurred = byTransition.has(`${subject}|${to === 'null' ? 'null' : to}|${from}`) && (byTransition.get(`${subject}|${to}|${from}`) || {}).events?.length > 0;
    out.push(finish({ type: 'repeated_transition', subject, transitionCategory: { from: from === 'null' ? null : from, to: to === 'null' ? null : to } }, g,
      { klass: `transition:${from}>${to}`, reverseAlsoOccurred }));
  }

  // B · REPEATED CAUSE — (subject, cause) recurred ≥ minOccurrences (cause known).
  const byCause = new Map();
  for (const ev of events) if (ev.cause && ev.cause !== 'unknown' && ev.subject) bump(byCause, `${ev.subject}|${ev.cause}`, ev);
  for (const [key, g] of byCause) {
    if (g.events.length < minOccurrences) continue;
    const [subject, cause] = key.split('|');
    out.push(finish({ type: 'repeated_cause', subject, causeCategory: cause }, g, { klass: `cause:${cause}` }));
  }

  // C · TRANSITION SEQUENCE — explicitly-coded ordered sequences occurring ≥ minOccurrences.
  //     Per-subject sequences over that subject's ordered transitions.
  const bySubjectEvents = new Map();
  for (const ev of events) if (ev.subject) { const a = bySubjectEvents.get(ev.subject) || []; a.push(ev); bySubjectEvents.set(ev.subject, a); }
  const SEQS = [
    { name: 'appeared_then_resolved', start: e => e.direction === 'appeared', end: e => e.direction === 'resolved' },
    { name: 'resolved_then_lapsed',   start: e => e.direction === 'resolved', end: e => e.direction === 'lapsed' },
    { name: 'became_stale_then_recorded', start: e => e.cause === 'became_stale', end: e => e.direction === 'resolved' },
  ];
  for (const [subject, evs] of bySubjectEvents) {
    for (const seq of SEQS) {
      let armed = false, count = 0, fps = [], evList = [], lastEndAt = null;
      for (const ev of evs) {
        if (!armed && seq.start(ev)) { armed = true; fps.push(ev.intervalFp); evList.push(ev); }
        else if (armed && seq.end(ev)) { armed = false; count++; fps.push(ev.intervalFp); evList.push(ev); lastEndAt = ev.at; }
      }
      if (count >= minOccurrences) {
        const g = { intervalFingerprints: fps, events: evList, parents: new Set(evList.map(e => e.requirementId ? (_reqParent(e.requirementId) || e.requirementId) : null).filter(Boolean)) };
        const recent = analyzable.slice(-Math.max(1, Math.ceil(total / 3))).map(i => i.endedAt);
        out.push(finish({ type: 'transition_sequence', subject, sequenceName: seq.name }, g,
          { klass: `sequence:${seq.name}`, occurrenceCount: count, sequenceDidNotRecurRecently: lastEndAt && recent.length ? parse(lastEndAt) < parse(recent[0]) : false }));
      }
    }
  }
  // Interval-level sequence: an ownership change followed by a later resolution.
  { let armed = false, count = 0, fps = [], firstAt = null, lastAt = null;
    for (const iv of analyzable) {
      const ownership = (iv.causes || []).includes('ownership_changed');
      const resolved = (iv.transitions || []).some(t => t.direction === 'resolved');
      if (!armed && ownership) { armed = true; fps.push(iv.fingerprint); firstAt = firstAt || iv.endedAt; }
      else if (armed && resolved) { armed = false; count++; fps.push(iv.fingerprint); lastAt = iv.endedAt; }
    }
    if (count >= minOccurrences) {
      const g = { intervalFingerprints: fps, events: fps.map(f => ({ intervalFp: f, at: null })), parents: new Set() };
      out.push(finish({ type: 'transition_sequence', subject: 'ownership', sequenceName: 'ownership_changed_then_resolved' }, g,
        { klass: 'sequence:ownership_changed_then_resolved', occurrenceCount: count, firstObservedAt: firstAt, lastObservedAt: lastAt, distinctEvents: 0 }));
    }
  }

  // D · RECURRING REQUIREMENT TYPE — the same subject appeared across ≥ minDistinctEvents events.
  const bySubjectAll = new Map();
  for (const ev of events) if (ev.subject) bump(bySubjectAll, ev.subject, ev);
  for (const [subject, g] of bySubjectAll) {
    if (g.parents.size < minDistinctEvents) continue;
    out.push(finish({ type: 'recurring_requirement_type', subject }, g, { klass: `recurring:${subject}` }));
  }

  // E · READINESS CO-OCCURRENCE — a readiness transition repeatedly co-occurred (in the
  //     same interval) with a defined transition class. NON-CAUSAL by construction.
  const byCo = new Map();
  for (const iv of analyzable) {
    const rt = iv.readinessTransition;
    if (!rt || rt.direction === 'same' || rt.from == null) continue;
    const classes = uniq((iv.transitions || []).map(t => t.direction).filter(Boolean));
    for (const cls of classes) {
      const key = `${rt.from}>${rt.to}|${cls}`;
      const g = byCo.get(key) || { intervalFingerprints: [], events: [], parents: new Set(), rt };
      g.intervalFingerprints.push(iv.fingerprint); g.events.push({ intervalFp: iv.fingerprint, at: iv.endedAt }); byCo.set(key, g);
    }
  }
  for (const [key, g] of byCo) {
    if (g.events.length < minOccurrences) continue;
    const [rk, cls] = key.split('|');
    out.push(finish({ type: 'readiness_co_occurrence', subject: rk, readiness: { from: g.rt.from, to: g.rt.to }, coClass: cls }, g, { klass: `readiness:${rk}|${cls}` }));
  }

  // F · STABLE NON-CHANGE — a claim held the same significant state across ≥ minStableMoments
  //     consecutive compatible moments. Neutral: absence of change is neither good nor bad.
  const runs = _stableRuns(analyzable, minStableMoments);
  for (const r of runs) {
    const g = { intervalFingerprints: r.intervalFps, events: r.intervalFps.map((f, i) => ({ intervalFp: f, at: r.times[i] || null })),
      parents: new Set([_reqParent(r.requirementId) || r.requirementId].filter(Boolean)) };
    out.push(finish({ type: 'stable_non_change', subject: r.subject, state: r.state }, g,
      { klass: `stable:${r.subject}:${r.state}`, occurrenceCount: r.moments }));
  }

  // Deterministic ordering (dedupe identical fingerprints first — same support ⇒ one obs).
  const byFp = new Map();
  for (const o of out) if (!byFp.has(o.fingerprint)) byFp.set(o.fingerprint, o);
  return [...byFp.values()].sort((a, b) =>
    String(b.lastObservedAt || '').localeCompare(String(a.lastObservedAt || '')) ||
    (b.occurrenceCount - a.occurrenceCount) || a.fingerprint.localeCompare(b.fingerprint));
}

/* Runs of consecutive compatible intervals where a requirement's state never changed. */
function _stableRuns(analyzable, minStableMoments) {
  const runs = [];
  // Requirement ids present throughout (use the chain fromClaims/toClaims).
  const ids = uniq(analyzable.flatMap(iv => [...Object.keys(iv.fromClaims || {}), ...Object.keys(iv.toClaims || {})]));
  for (const rid of ids) {
    let runLen = 0, state = null, fps = [], times = [];
    for (const iv of analyzable) {
      const a = (iv.fromClaims || {})[rid], b = (iv.toClaims || {})[rid];
      if (a != null && b != null && a === b && (state == null || state === a)) { state = a; runLen = runLen === 0 ? 2 : runLen + 1; fps.push(iv.fingerprint); times.push(iv.endedAt); }
      else { if (runLen >= minStableMoments) runs.push({ requirementId: rid, subject: (rid.split(':')[1] || rid), state, moments: runLen, intervalFps: fps.slice(), times: times.slice() });
        runLen = 0; state = null; fps = []; times = []; }
    }
    if (runLen >= minStableMoments) runs.push({ requirementId: rid, subject: (rid.split(':')[1] || rid), state, moments: runLen, intervalFps: fps.slice(), times: times.slice() });
  }
  return runs;
}

/* ── Neutral, non-causal one-line summary (display only — excluded from the fingerprint). ── */
function summariseObservation(o) {
  const n = o.occurrenceCount, occ = `${n} occasion${n === 1 ? '' : 's'}`;
  switch (o.type) {
    case 'repeated_transition': return `${cap(o.subjectLabel)} moved from ${stateLabel(o.transitionCategory.from)} to ${stateLabel(o.transitionCategory.to)} on ${occ}.`;
    case 'repeated_cause':      return `${cap(causeLabel(o.causeCategory))} recurred for ${o.subjectLabel} on ${occ}.`;
    case 'transition_sequence': return `For ${o.subjectLabel}, the sequence “${seqLabel(o.sequenceName)}” occurred ${n} time${n === 1 ? '' : 's'}.`;
    case 'recurring_requirement_type': return `${cap(o.subjectLabel)} came up across ${o.distinctEvents} different events.`;
    case 'readiness_co_occurrence': { const [rf, rt] = String(o.subject).split('>'); return `Readiness moving from ${readinessLabel(rf)} to ${readinessLabel(rt)} co-occurred with ${dirLabel(o.coClass)} on ${occ}.`; }
    case 'stable_non_change':   return `${cap(o.subjectLabel)} stayed ${stateLabel(o.state)} across ${o.occurrenceCount} recorded moments.`;
    default: return 'A repeated pattern was observed in the recorded history.';
  }
}
const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);
const SEQ_LABELS = Object.freeze({ appeared_then_resolved: 'first appeared, then was recorded', resolved_then_lapsed: 'was recorded, then lapsed',
  became_stale_then_recorded: 'went out of date, then was recorded again', ownership_changed_then_resolved: 'ownership changed, then a requirement was recorded' });
const seqLabel = n => SEQ_LABELS[n] || String(n || '').replace(/_/g, ' ');
const DIR_LABELS = Object.freeze({ resolved: 'information being recorded', lapsed: 'information lapsing', appeared: 'a new requirement appearing',
  removed: 'a requirement being removed', improved: 'a readiness change', regressed: 'a readiness change', changed: 'a requirement changing' });
const dirLabel = d => DIR_LABELS[d] || 'a change';

/* ── PUBLIC redaction — the only shape an org leader ever sees. No raw evidence, ids,
   member/actor refs, hashes, versions, or trigger boundaries. Memory fingerprints (already
   exposed by the memory timeline) are the sole links back into history. ── */
function publicObservation(o) {
  if (!o) return null;
  return {
    fingerprint: o.fingerprint,
    type: o.type,
    summary: summariseObservation(o),
    subjectLabel: o.subjectLabel,
    occurrenceCount: o.occurrenceCount,
    distinctEvents: o.distinctEvents,
    firstObservedAt: o.firstObservedAt, lastObservedAt: o.lastObservedAt,
    transitionCategory: o.type === 'repeated_transition' ? { from: stateLabel(o.transitionCategory.from), to: stateLabel(o.transitionCategory.to) } : undefined,
    causeCategory: o.type === 'repeated_cause' ? causeLabel(o.causeCategory) : undefined,
    sequence: o.type === 'transition_sequence' ? seqLabel(o.sequenceName) : undefined,
    coOccurrence: o.type === 'readiness_co_occurrence' ? dirLabel(o.coClass) : undefined,
    hasContradictions: (o.possibleContradictions || []).length > 0,
    contradictions: (o.possibleContradictions || []).map(safeContradiction),
    limitations: o.limitations || [],
    supportingMoments: uniq((o.support && o.support.intervalFingerprints || []).flatMap(fp => String(fp).split('→'))),
    status: o.status || 'active',
  };
}
const CONTRA_LABELS = Object.freeze({
  reverse_transition_also_occurred: 'The reverse change also occurred in the history.',
  did_not_recur_in_most_recent_history: 'It did not recur in the most recent history.',
  depends_on_a_single_event: 'It depends on a single event.',
  present_in_a_minority_of_intervals: 'It was present in a minority of comparable moments.',
  history_interrupted_by_a_rules_change: "The history was interrupted by a change in IntelliQ's interpretation rules.",
});
const safeContradiction = c => CONTRA_LABELS[c] || 'Other history may qualify this observation.';

/* Detail view = public observation + explicit note it is history, not advice. */
function explainObservation(o) {
  const p = publicObservation(o);
  if (!p) return null;
  return { ...p, kind: 'historical_description',
    disclaimer: 'This is a description of repeated history. It is not a recommendation, a prediction, or proof of cause.' };
}

function observationFingerprint(o) { return o && o.fingerprint || null; }

module.exports = {
  OBSERVATION_SCHEMA_VERSION, OBSERVATION_RULES_VERSION,
  buildIntervals, deriveObservations, summariseObservation, explainObservation,
  publicObservation, observationFingerprint, intervalFingerprint,
  subjectLabel, stateLabel, causeLabel,
};
