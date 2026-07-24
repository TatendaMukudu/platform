/* ============================================================
   ai/org-memory.js — PURE Organisational Memory
     Phase A  : versioned, deduplicated history of the derived org-state.
     Integrity: every moment is explainable (WHAT changed, WHY, from which governed
                action) and safe to compare across time (semantic versioning).

   The organisation's episodic record: an append-only timeline of what the DERIVED
   org-state looked like at each meaningful moment. It answers "what changed, why, and
   when?" — never "what should we do?". No learning, no patterns, no playbook yet; that
   is Phase B and it will be a SEPARATE governed loop.

   Each snapshot carries:
     • the OBSERVABLE derived state (focus, readiness, per-requirement claim states,
       question/context counts) — a compact, redacted projection, never raw evidence;
     • an INTERNAL trigger descriptor (which governed boundary produced this moment) —
       server-derived, never client-trusted, never surfaced verbatim to the frontend;
     • the SEMANTIC versions of the reasoning that produced it, so two moments are only
       compared when they were computed under the same interpretation rules.

   diff() classifies each change with a user-facing direction (resolved/lapsed/appeared/
   removed/changed) AND an internal, deterministic CAUSE (evidence vs structure vs time
   vs rules) plus, for removals, a structural reason. When two moments were computed
   under incompatible semantics, diff() returns a neutral REBASELINE moment instead of
   inventing organisational transitions.

   Discipline:
     • PURE — imports nothing (no DB/UI/storage/network; clock only via a passed `now`).
     • DERIVED — a projection over what the caller already authorised; NEVER mutates it.
     • PRIVACY — only ever sees the org-admissible projection the caller passes in.
     • DETERMINISTIC — no LLM, no free-form inference; identical inputs → identical output.
     • NON-BLAMING — public wording is neutral and uncertainty-aware; unknown stays unknown.
   ============================================================ */

const MEMORY_SCHEMA_VERSION = 2;   // Phase A was implicitly v1; v2 adds trigger + semantics + cause

/* A tiny, dependency-free, stable string hash (djb2 xor). Deterministic across runs —
   used only to detect "did the observable derived state change?", never for security. */
function _hash(str) {
  let h = 5381;
  const s = String(str);
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36);
}

const parse = t => { if (!t) return null; const ms = new Date(t).getTime(); return Number.isFinite(ms) ? ms : null; };

/* ── TRIGGER taxonomy — the governed boundary that produced a moment. The server derives
   this; it is NEVER trusted from a client. Public surfaces get only the safe category. ── */
const TRIGGER_TYPES = Object.freeze(['context_confirmed', 'uncertainty_resolved', 'role_binding_changed',
  'evidence_superseded', 'evidence_removed', 'temporal_recalculation', 'system_rebaseline']);
const TRIGGER_CATEGORY = Object.freeze({
  context_confirmed:     'operating context was updated',
  uncertainty_resolved:  'a question was answered',
  role_binding_changed:  'a role assignment changed',
  evidence_superseded:   'information was replaced',
  evidence_removed:      'information was removed',
  temporal_recalculation:'time passed',
  system_rebaseline:     "IntelliQ's interpretation rules changed",
});
// Keep ONLY the safe structural fields — never raw evidence text or free-form content.
function _normalizeTrigger(t) {
  if (!t || typeof t !== 'object') return null;
  const type = TRIGGER_TYPES.includes(t.type) ? t.type : 'temporal_recalculation';
  const out = { type };
  if (t.boundary != null)   out.boundary   = String(t.boundary).slice(0, 60);
  if (t.actorRef != null)   out.actorRef   = String(t.actorRef).slice(0, 80);
  if (t.recordRef != null)  out.recordRef  = String(t.recordRef).slice(0, 120);
  if (t.occurredAt != null) out.occurredAt = String(t.occurredAt).slice(0, 40);
  return out;
}
const _triggerType = s => (s && s.trigger && s.trigger.type) || null;
function _triggerCategory(triggerOrSnap) {
  const t = triggerOrSnap && triggerOrSnap.trigger ? triggerOrSnap.trigger : triggerOrSnap;
  const type = t && t.type ? t.type : null;
  return type ? (TRIGGER_CATEGORY[type] || null) : null;
}

/* ── SEMANTIC compatibility. Two moments may be diffed as organisational change ONLY when
   the STRUCTURE and MEANING of the projection that produced them match. A missing/legacy
   semantics block (a Phase-A snapshot) is treated as UNKNOWN → not comparable, so the
   first versioned moment after it becomes a neutral rebaseline rather than a false diff.
   The memory schema version is intentionally NOT part of comparability: bumping how memory
   stores a moment must not, by itself, invalidate organisational comparison. ── */
function compatible(a, b) {
  const sa = a && a.semantics, sb = b && b.semantics;
  if (!sa || !sb) return false;
  return sa.orgStateSchemaVersion === sb.orgStateSchemaVersion
      && sa.projectionRulesVersion === sb.projectionRulesVersion
      && sa.readinessRulesVersion === sb.readinessRulesVersion;
}

/* ── Ordinal ranks so a transition can be labelled improvement / regression, never by
   opaque judgement. Higher is "more ready". Neutral states (not-yet-due / n/a) sit above
   problems but below a confirmed known, so lapsing from known still reads down. ── */
const CLAIM_RANK = Object.freeze({
  known: 4, not_applicable: 3, not_yet_due: 3, superseded: 2,
  stale: 1, insufficient_information: 1, unsupported: 0, missing: 0, disputed: 0,
});
const READINESS_RANK = Object.freeze({
  ready: 4, not_yet_due: 3, partially_ready: 2, insufficient_information: 1, not_ready: 0,
});
const claimRank = s => (CLAIM_RANK[s] != null ? CLAIM_RANK[s] : 1);
const readinessRank = s => (READINESS_RANK[s] != null ? READINESS_RANK[s] : 1);

/* ── Normalise the claim states into a deterministically-ordered, compact list. Stable
   order (by requirementId then claimType) makes the content hash iteration-invariant. ── */
function _claims(state) {
  return (state.claimStates || [])
    .map(c => ({ requirementId: c.requirementId || null, claimType: c.claimType || null, state: c.state || 'insufficient_information' }))
    .sort((a, b) => String(a.requirementId).localeCompare(String(b.requirementId)) || String(a.claimType).localeCompare(String(b.claimType)));
}
// The event/parent key a requirement belongs to (requirementId is `${eventId}:${claim}`).
const _reqParent = rid => { const s = String(rid || ''); const i = s.indexOf(':'); return i > 0 ? s.slice(0, i) : null; };

/* ── SNAPSHOT — one moment on the timeline. Derived structure only; no raw evidence text,
   no private content, no free-form prose. The content hash covers the OBSERVABLE derived
   state (focus + readiness + claims + context count) but deliberately EXCLUDES the
   timestamp, fingerprint, trigger, and semantics, so two moments that look the same to a
   leader hash the same and the timeline does not accrue noise. ── */
function snapshot({ state = {}, readiness = {}, contextRecords = [], fingerprint = null, now = Date.now(), version = 1, trigger = null, semantics = null } = {}) {
  const r = readiness || {};
  const focus = r.focus
    ? { kind: r.focus.kind || null, id: r.focus.id || null, title: r.focus.title || null, type: r.focus.type || null, at: r.focus.at || null }
    : (state.focus || null);
  const readinessStatus = (r.readiness && r.readiness.status) || 'insufficient_information';
  const constrained = ((r.readiness && r.readiness.constrainedAreas) || []).map(a => a.label || a.id).filter(Boolean).sort();
  const supported = ((r.readiness && r.readiness.supportedAreas) || []).map(a => a.label || a.id).filter(Boolean).sort();
  const claims = _claims(state);
  const questions = (r.nextQuestions || []);
  const contextActive = (contextRecords || []).filter(rec => (rec.status || 'active') === 'active').length;

  const observable = JSON.stringify({
    focus: focus ? { kind: focus.kind, id: focus.id, title: focus.title } : null,
    readinessStatus, constrained, supported,
    claims: claims.map(c => `${c.requirementId}|${c.claimType}|${c.state}`),
    contextActive,
  });

  return {
    schema: 'org-memory/v' + MEMORY_SCHEMA_VERSION, version,
    memorySchemaVersion: MEMORY_SCHEMA_VERSION,
    semantics: semantics ? {
      orgStateSchemaVersion: semantics.orgStateSchemaVersion != null ? semantics.orgStateSchemaVersion : null,
      projectionRulesVersion: semantics.projectionRulesVersion != null ? semantics.projectionRulesVersion : null,
      readinessRulesVersion: semantics.readinessRulesVersion != null ? semantics.readinessRulesVersion : null,
      memorySchemaVersion: MEMORY_SCHEMA_VERSION,
    } : null,
    trigger: _normalizeTrigger(trigger),   // INTERNAL — redacted before any public surface
    at: new Date(now).toISOString(),
    fingerprint: fingerprint != null ? String(fingerprint) : null,
    pack: (state.organisation && state.organisation.pack) || 'universal',
    focus,
    readinessStatus,
    constrained, supported,
    claims,
    openQuestions: questions.length,
    blockingQuestions: questions.filter(q => q.blocking === true).length,
    contextActive,
    contentHash: _hash(observable),
  };
}

/* A redacted public view of a snapshot: drops the internal content hash, the raw trigger
   (only the safe category survives), and the semantic version numbers. */
function publicSnapshot(s) {
  if (!s) return null;
  return {
    at: s.at, fingerprint: s.fingerprint, pack: s.pack, version: s.version,
    triggerCategory: _triggerCategory(s),
    focus: s.focus, readinessStatus: s.readinessStatus,
    constrained: s.constrained, supported: s.supported,
    claims: s.claims, openQuestions: s.openQuestions, blockingQuestions: s.blockingQuestions,
    contextActive: s.contextActive,
  };
}

/* ── shouldRecord — append a moment ONLY when it is meaningful: no previous moment
   (baseline); OR the observable derived state changed (content hash differs); OR the
   semantics became incompatible with the head (a rebaseline is itself a recordable event
   — the interpretation basis changed, even if the output happens to look the same). ── */
function shouldRecord(prev, next) {
  if (!next) return false;
  if (!prev) return true;
  if (!compatible(prev, next)) return true;
  return prev.contentHash !== next.contentHash;
}

/* Focus identity for change detection (kind+id, falling back to title). */
const _focusKey = f => (f ? `${f.kind || ''}:${f.id || f.title || ''}` : null);

/* ── CAUSE classification — deterministic, from the transition shape + the governed
   trigger that produced the moment. NEVER an LLM, never free-form. Additional metadata;
   the user-facing direction (resolved/lapsed/…) is unchanged. ── */
function classifyCause(from, to, triggerType, parentRemoved) {
  if (to === 'not_applicable') return 'became_not_applicable';
  if (from === 'known' && to === 'stale') return 'became_stale';
  if (from === 'not_yet_due' && to && to !== 'not_yet_due') return 'became_due';
  if (from == null) return 'structure_added';                       // a requirement started being tracked
  if (to == null) {                                                 // a requirement stopped being tracked
    if (triggerType === 'evidence_removed') return 'evidence_removed';
    if (triggerType === 'evidence_superseded') return 'evidence_superseded';
    return 'structure_removed';
  }
  if (to === 'known') return triggerType === 'evidence_superseded' ? 'evidence_superseded' : 'evidence_added';
  if (from === 'known') {                                           // lapsed away from a recorded value
    if (triggerType === 'evidence_removed') return 'evidence_removed';
    if (triggerType === 'evidence_superseded') return 'evidence_superseded';
    return 'unknown';
  }
  if (to === 'disputed') return 'evidence_added';                   // a second, conflicting claim arrived
  return 'unknown';
}

/* Structural reason for a REMOVED requirement — kept internal so Phase B never treats all
   removals as equivalent. Neutral: never implies wrongdoing. */
function removalReason(triggerType, parentRemoved) {
  if (triggerType === 'evidence_superseded') return 'superseded';
  if (triggerType === 'evidence_removed') return 'intentionally_removed';
  if (parentRemoved) return 'parent_removed';
  if (triggerType === 'context_confirmed') return 'no_longer_applicable';   // a governed context change retired/edited it
  return 'unknown';
}

/* ── DIFF — deterministic "what changed" between two moments. When the moments are
   semantically incompatible, returns a neutral REBASELINE (no invented transitions). ── */
function diff(prev, next) {
  if (!next) return null;
  const trigCat = _triggerCategory(next);
  if (!prev) {
    return { from: null, to: next.at, baseline: true, rebaseline: false, semanticsChanged: false,
      fingerprintChanged: true, triggerCategory: trigCat,
      focus: { changed: false, from: null, to: next.focus || null },
      readiness: { changed: false, from: null, to: next.readinessStatus, direction: 'same' },
      claimTransitions: [], causes: [], contextDelta: next.contextActive || 0, nothingChanged: false,
      summary: ['The organisation timeline begins here.'] };
  }

  // Incompatible semantics → a rebaseline moment. Report facts (focus/readiness labels)
  // but NEVER frame the change as an organisational gain/slip or invent claim transitions.
  if (!compatible(prev, next)) {
    return { from: prev.at, to: next.at, baseline: false, rebaseline: true, semanticsChanged: true,
      fingerprintChanged: prev.fingerprint !== next.fingerprint,
      triggerCategory: TRIGGER_CATEGORY.system_rebaseline,
      focus: { changed: _focusKey(prev.focus) !== _focusKey(next.focus), from: prev.focus || null, to: next.focus || null },
      readiness: { changed: prev.readinessStatus !== next.readinessStatus, from: prev.readinessStatus, to: next.readinessStatus, direction: 'semantics_changed' },
      claimTransitions: [], causes: ['semantics_changed'], contextDelta: 0, nothingChanged: false,
      summary: ["IntelliQ's interpretation rules changed. Moments before this point are not directly comparable to those after it."] };
  }

  const triggerType = _triggerType(next);
  const focusChanged = _focusKey(prev.focus) !== _focusKey(next.focus);
  const rPrev = readinessRank(prev.readinessStatus), rNext = readinessRank(next.readinessStatus);
  const readinessDir = prev.readinessStatus === next.readinessStatus ? 'same' : rNext > rPrev ? 'improved' : rNext < rPrev ? 'regressed' : 'changed';

  const key = c => `${c.requirementId || ''}::${c.claimType || ''}`;
  const prevBy = Object.fromEntries((prev.claims || []).map(c => [key(c), c]));
  const nextBy = Object.fromEntries((next.claims || []).map(c => [key(c), c]));
  const nextParents = new Set((next.claims || []).map(c => _reqParent(c.requirementId)).filter(Boolean));
  const keys = [...new Set([...Object.keys(prevBy), ...Object.keys(nextBy)])].sort();
  const claimTransitions = [];
  for (const k of keys) {
    const a = prevBy[k], b = nextBy[k];
    let from = null, to = null, direction = null, rid = null, ct = null;
    if (a && b) {
      if (a.state === b.state) continue;
      from = a.state; to = b.state; rid = b.requirementId; ct = b.claimType;
      const up = claimRank(b.state) > claimRank(a.state), down = claimRank(b.state) < claimRank(a.state);
      direction = b.state === 'known' && a.state !== 'known' ? 'resolved'
        : a.state === 'known' && b.state !== 'known' ? 'lapsed'
        : up ? 'improved' : down ? 'regressed' : 'changed';
    } else if (b && !a) {
      from = null; to = b.state; direction = 'appeared'; rid = b.requirementId; ct = b.claimType;
    } else {
      from = a.state; to = null; direction = 'removed'; rid = a.requirementId; ct = a.claimType;
    }
    const parent = _reqParent(rid);
    const parentRemoved = direction === 'removed' && parent != null && !nextParents.has(parent);
    const cause = classifyCause(from, to, triggerType, parentRemoved);
    const t = { requirementId: rid, claimType: ct, from, to, direction, cause };
    if (direction === 'removed') t.removalReason = removalReason(triggerType, parentRemoved);
    claimTransitions.push(t);
  }

  const contextDelta = (next.contextActive || 0) - (prev.contextActive || 0);
  const nothingChanged = !focusChanged && readinessDir === 'same' && !claimTransitions.length && contextDelta === 0;

  // Moment-level causes = the distinct per-transition causes, plus a boundary-level cause
  // for changes that do not surface as a claim transition (e.g. a role binding shifts
  // ownership/readiness without moving any claim state).
  const causes = [...new Set(claimTransitions.map(t => t.cause))];
  if (triggerType === 'role_binding_changed' && !causes.includes('ownership_changed')) causes.push('ownership_changed');
  if (contextDelta !== 0 && !claimTransitions.length && !causes.includes(contextDelta > 0 ? 'structure_added' : 'structure_removed'))
    causes.push(contextDelta > 0 ? 'structure_added' : 'structure_removed');

  const cl = ct => String(ct || 'requirement').replace(/_/g, ' ');
  const summary = [];
  if (focusChanged) summary.push(next.focus ? `Focus moved to ${next.focus.title || next.focus.id || 'a new item'}.` : 'There is no longer a confirmed focus.');
  if (readinessDir === 'improved') summary.push(`Overall readiness improved (${prev.readinessStatus} → ${next.readinessStatus}).`);
  else if (readinessDir === 'regressed') summary.push(`Overall readiness slipped (${prev.readinessStatus} → ${next.readinessStatus}).`);
  else if (readinessDir === 'changed') summary.push(`Overall readiness changed (${prev.readinessStatus} → ${next.readinessStatus}).`);
  for (const t of claimTransitions) {
    if (t.direction === 'resolved') summary.push(`${cl(t.claimType)} is now recorded.`);
    else if (t.direction === 'lapsed') summary.push(`${cl(t.claimType)} is no longer current (${t.from} → ${t.to}).`);
    else if (t.direction === 'appeared') summary.push(`${cl(t.claimType)} became a tracked requirement (${t.to}).`);
    else if (t.direction === 'removed') summary.push(`${cl(t.claimType)} is no longer tracked.`);
    else summary.push(`${cl(t.claimType)} changed (${t.from} → ${t.to}).`);
  }
  if (triggerType === 'role_binding_changed' && !claimTransitions.length) summary.push('A role assignment changed.');
  if (contextDelta > 0) summary.push(`${contextDelta} operating-context record${contextDelta === 1 ? '' : 's'} added.`);
  else if (contextDelta < 0) summary.push(`${-contextDelta} operating-context record${contextDelta === -1 ? '' : 's'} retired or superseded.`);
  if (!summary.length) summary.push('No observable change to the derived organisational state.');

  return { from: prev.at, to: next.at, baseline: false, rebaseline: false, semanticsChanged: false,
    fingerprintChanged: prev.fingerprint !== next.fingerprint, triggerCategory: trigCat,
    focus: { changed: focusChanged, from: prev.focus || null, to: next.focus || null },
    readiness: { changed: readinessDir !== 'same', from: prev.readinessStatus, to: next.readinessStatus, direction: readinessDir },
    claimTransitions, causes, contextDelta, nothingChanged, summary };
}

/* ── record — append a snapshot to a timeline iff meaningful, keeping it bounded. Pure:
   it does not mutate the input array. ── */
function record(timeline, snap, { cap = 300 } = {}) {
  const list = Array.isArray(timeline) ? timeline : [];
  const prev = list.length ? list[list.length - 1] : null;
  if (!shouldRecord(prev, snap)) return { timeline: list, recorded: false, snapshot: prev };
  const next = list.concat([snap]);
  const trimmed = next.length > cap ? next.slice(next.length - cap) : next;
  return { timeline: trimmed, recorded: true, snapshot: snap };
}

/* ── EXPLAIN — a redacted, leader-safe explanation of a single moment vs the one before
   it: the safe trigger category, whether the comparison is semantically compatible, the
   transitions with their (safe) cause categories, readiness labels, and any limitations
   (unknown causes / a rules change). NEVER exposes actor/record IDs, raw evidence, hashes,
   internal boundary names, semantic version numbers, or requirement record ids. ── */
function explainMoment(prev, snap) {
  if (!snap) return null;
  const d = diff(prev, snap) || {};
  const rulesChanged = !!d.semanticsChanged;
  const transitions = (d.claimTransitions || []).map(t => {
    const o = { claim: String(t.claimType || 'requirement').replace(/_/g, ' '), from: t.from, to: t.to, direction: t.direction, cause: t.cause };
    if (t.removalReason) o.removalReason = t.removalReason;
    return o;
  });
  const limitations = [];
  if (rulesChanged) limitations.push("IntelliQ's interpretation rules changed since the previous moment; direct comparison is limited.");
  if (transitions.some(t => t.cause === 'unknown')) limitations.push('Some changes could not be attributed to a specific cause.');
  if (transitions.some(t => t.removalReason === 'unknown')) limitations.push('The reason a requirement stopped being tracked could not be determined.');
  return {
    at: snap.at,
    trigger: _triggerCategory(snap),
    semanticallyCompatible: prev ? compatible(prev, snap) : true,
    rulesChanged,
    fromReadiness: prev ? prev.readinessStatus : null,
    toReadiness: snap.readinessStatus,
    focusChanged: !!(d.focus && d.focus.changed),
    focusTitle: snap.focus ? (snap.focus.title || snap.focus.type || null) : null,
    transitions,
    causes: d.causes || [],
    summary: d.summary || [],
    limitations,
  };
}

/* ── TIMELINE VIEW — ordered most-recent-first, each moment carrying the diff to the one
   before it, so "what changed at each step" needs no re-derivation. ── */
function buildTimeline(snapshots, { limit = 50 } = {}) {
  const asc = (snapshots || []).slice().sort((a, b) => (parse(a.at) || 0) - (parse(b.at) || 0));
  const steps = asc.map((s, i) => ({ snapshot: publicSnapshot(s), changed: diff(i > 0 ? asc[i - 1] : null, s) }));
  const recent = steps.slice(Math.max(0, steps.length - limit)).reverse();
  return { count: asc.length, entries: recent, summary: summariseTimeline(asc) };
}

/* ── summariseTimeline — read-only rollup over the whole history (counts, not learning).
   Semantics-change (rebaseline) moments are counted separately and NEVER as gains/slips. ── */
function summariseTimeline(snapshots) {
  const asc = (snapshots || []).slice().sort((a, b) => (parse(a.at) || 0) - (parse(b.at) || 0));
  let improvements = 0, regressions = 0, resolved = 0, lapsed = 0, rebaselines = 0, lastChangeAt = null;
  for (let i = 1; i < asc.length; i++) {
    const d = diff(asc[i - 1], asc[i]);
    if (!d || d.nothingChanged) continue;
    lastChangeAt = asc[i].at;
    if (d.semanticsChanged) { rebaselines++; continue; }
    if (d.readiness.direction === 'improved') improvements++;
    else if (d.readiness.direction === 'regressed') regressions++;
    for (const t of d.claimTransitions) {
      if (t.direction === 'resolved' || t.direction === 'improved') resolved++;
      else if (t.direction === 'lapsed' || t.direction === 'regressed') lapsed++;
    }
  }
  return {
    count: asc.length,
    spanFrom: asc.length ? asc[0].at : null,
    spanTo: asc.length ? asc[asc.length - 1].at : null,
    readinessImprovements: improvements, readinessRegressions: regressions,
    claimsResolved: resolved, claimsLapsed: lapsed, rebaselines,
    lastChangeAt,
  };
}

/* ── changedSince — "what changed" between an anchor and the head. Anchor may be a
   fingerprint, an ISO timestamp, or `steps` moments back; default is the previous moment. ── */
function changedSince(snapshots, { fingerprint = null, since = null, steps = null } = {}) {
  const asc = (snapshots || []).slice().sort((a, b) => (parse(a.at) || 0) - (parse(b.at) || 0));
  if (!asc.length) return { anchor: null, head: null, changed: null };
  const head = asc[asc.length - 1];
  let anchor = null;
  if (fingerprint != null) anchor = asc.find(s => String(s.fingerprint) === String(fingerprint)) || null;
  else if (since != null) { const ms = parse(since); anchor = ms != null ? [...asc].reverse().find(s => (parse(s.at) || 0) <= ms) || asc[0] : asc[0]; }
  else if (steps != null && steps > 0) anchor = asc[Math.max(0, asc.length - 1 - steps)];
  else anchor = asc.length >= 2 ? asc[asc.length - 2] : null;
  return { anchor: publicSnapshot(anchor), head: publicSnapshot(head), changed: diff(anchor, head) };
}

/* Locate a moment by fingerprint + the moment immediately before it (for /explain). */
function momentByFingerprint(snapshots, fingerprint) {
  const asc = (snapshots || []).slice().sort((a, b) => (parse(a.at) || 0) - (parse(b.at) || 0));
  const idx = asc.findIndex(s => String(s.fingerprint) === String(fingerprint));
  if (idx < 0) return { snapshot: null, prev: null };
  return { snapshot: asc[idx], prev: idx > 0 ? asc[idx - 1] : null };
}

module.exports = {
  MEMORY_SCHEMA_VERSION, TRIGGER_TYPES, TRIGGER_CATEGORY, CLAIM_RANK, READINESS_RANK,
  snapshot, publicSnapshot, shouldRecord, compatible, diff, record,
  classifyCause, removalReason, explainMoment, momentByFingerprint,
  buildTimeline, summariseTimeline, changedSince,
};
