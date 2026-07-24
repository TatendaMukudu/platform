/* ============================================================
   ai/org-memory.js — PURE Organisational Memory (Phase A: history, not learning)

   The organisation's episodic record: a versioned, append-only timeline of what the
   DERIVED org-state looked like at each meaningful moment. It answers "what changed,
   and when?" — never "what should we do?". No learning, no patterns, no playbook yet;
   that is Phase B and it will be a SEPARATE governed loop.

   A snapshot is a compact, deterministic projection of an already-derived org-state +
   its readiness view model: the focus, the readiness status, the per-requirement claim
   states, open-question counts, and the active operating-context count — each moment
   fingerprinted so a stale/duplicate projection is never recorded twice.

   Discipline (identical to the rest of the system):
     • PURE — imports nothing (no DB, UI, storage, network, clock beyond a passed `now`).
     • DERIVED — a projection over what the caller already authorised; it is NOT a second
       source of truth and it NEVER mutates the state it observes.
     • PRIVACY — it only ever sees the org-state/readiness the caller passes in. Callers
       MUST build those from organisation-admissible evidence only; private evidence must
       never reach here (it never enters the org-state projection in the first place).
     • DETERMINISTIC — the same inputs always produce the same snapshot content hash and
       the same diff, so the timeline is reproducible and the "what changed" is auditable.
   ============================================================ */

const SCHEMA = 'org-memory/v1';

/* A tiny, dependency-free, stable string hash (djb2 xor). Deterministic across runs —
   used only to detect "did the observable derived state change?", never for security. */
function _hash(str) {
  let h = 5381;
  const s = String(str);
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36);
}

const parse = t => { if (!t) return null; const ms = new Date(t).getTime(); return Number.isFinite(ms) ? ms : null; };

/* ── Ordinal ranks so a transition can be labelled improvement / regression, never by
   opaque judgement. Higher is "more ready". Neutral states (not-yet-due / n/a) sit
   above problems but below a confirmed known, so lapsing from known still reads down. ── */
const CLAIM_RANK = Object.freeze({
  known: 4, not_applicable: 3, not_yet_due: 3, superseded: 2,
  stale: 1, insufficient_information: 1, unsupported: 0, missing: 0, disputed: 0,
});
const READINESS_RANK = Object.freeze({
  ready: 4, not_yet_due: 3, partially_ready: 2, insufficient_information: 1, not_ready: 0,
});
const claimRank = s => (CLAIM_RANK[s] != null ? CLAIM_RANK[s] : 1);
const readinessRank = s => (READINESS_RANK[s] != null ? READINESS_RANK[s] : 1);

/* ── Normalise the claim states into a deterministically-ordered, compact list. The
   order (by requirementId then claimType) is stable regardless of input order, so the
   content hash is invariant to the projection's iteration order. ── */
function _claims(state) {
  return (state.claimStates || [])
    .map(c => ({ requirementId: c.requirementId || null, claimType: c.claimType || null, state: c.state || 'insufficient_information' }))
    .sort((a, b) => String(a.requirementId).localeCompare(String(b.requirementId)) || String(a.claimType).localeCompare(String(b.claimType)));
}

/* ── SNAPSHOT — one moment on the timeline. Captures the derived structure only; no raw
   evidence text, no private content, no free-form prose that could carry either. The
   content hash covers the OBSERVABLE derived state (focus + readiness + claims + context
   count) but deliberately EXCLUDES the timestamp and fingerprint, so two projections
   that look the same to a human hash the same and the timeline does not accrue noise. ── */
function snapshot({ state = {}, readiness = {}, contextRecords = [], fingerprint = null, now = Date.now(), version = 1 } = {}) {
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

  // The observable signature — everything a leader would perceive as "the situation",
  // minus when we looked. Stable ordering everywhere → reproducible hash.
  const observable = JSON.stringify({
    focus: focus ? { kind: focus.kind, id: focus.id, title: focus.title } : null,
    readinessStatus, constrained, supported,
    claims: claims.map(c => `${c.requirementId}|${c.claimType}|${c.state}`),
    contextActive,
  });

  return {
    schema: SCHEMA, version,
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

/* A redacted public view of a snapshot (drops the internal content hash). */
function publicSnapshot(s) {
  if (!s) return null;
  return {
    at: s.at, fingerprint: s.fingerprint, pack: s.pack, version: s.version,
    focus: s.focus, readinessStatus: s.readinessStatus,
    constrained: s.constrained, supported: s.supported,
    claims: s.claims, openQuestions: s.openQuestions, blockingQuestions: s.blockingQuestions,
    contextActive: s.contextActive,
  };
}

/* ── shouldRecord — append to the timeline ONLY when the observable derived state has
   actually changed. No previous snapshot ⇒ always record the baseline. Otherwise dedupe
   on the content hash, so a mutation that leaves every claim/focus/readiness identical
   (e.g. adding evidence that changes nothing derivable) does not pollute the history. ── */
function shouldRecord(prev, next) {
  if (!next) return false;
  if (!prev) return true;
  return prev.contentHash !== next.contentHash;
}

/* Focus identity for change detection (kind+id, falling back to title). */
const _focusKey = f => (f ? `${f.kind || ''}:${f.id || f.title || ''}` : null);

/* ── DIFF — the deterministic "what changed" between two snapshots. Classifies each
   claim transition as resolved / lapsed / changed / appeared / removed, reports focus
   and readiness movement with a direction, and produces plain-language, NON-BLAMING
   summary lines. No judgement beyond the exposed ordinal ranks. ── */
function diff(prev, next) {
  if (!next) return null;
  if (!prev) {
    return { from: null, to: next.at, baseline: true, fingerprintChanged: true,
      focus: { changed: false, from: null, to: next.focus || null },
      readiness: { changed: false, from: null, to: next.readinessStatus, direction: 'same' },
      claimTransitions: [], contextDelta: next.contextActive || 0, nothingChanged: false,
      summary: ['The organisation timeline begins here.'] };
  }

  const focusChanged = _focusKey(prev.focus) !== _focusKey(next.focus);
  const rPrev = readinessRank(prev.readinessStatus), rNext = readinessRank(next.readinessStatus);
  const readinessDir = prev.readinessStatus === next.readinessStatus ? 'same' : rNext > rPrev ? 'improved' : rNext < rPrev ? 'regressed' : 'changed';

  // Claim transitions keyed by requirementId (falling back to claimType).
  const key = c => `${c.requirementId || ''}::${c.claimType || ''}`;
  const prevBy = Object.fromEntries((prev.claims || []).map(c => [key(c), c]));
  const nextBy = Object.fromEntries((next.claims || []).map(c => [key(c), c]));
  const keys = [...new Set([...Object.keys(prevBy), ...Object.keys(nextBy)])].sort();
  const claimTransitions = [];
  for (const k of keys) {
    const a = prevBy[k], b = nextBy[k];
    if (a && b) {
      if (a.state === b.state) continue;
      const up = claimRank(b.state) > claimRank(a.state);
      const down = claimRank(b.state) < claimRank(a.state);
      const direction = b.state === 'known' && a.state !== 'known' ? 'resolved'
        : a.state === 'known' && b.state !== 'known' ? 'lapsed'
        : up ? 'improved' : down ? 'regressed' : 'changed';
      claimTransitions.push({ requirementId: b.requirementId, claimType: b.claimType, from: a.state, to: b.state, direction });
    } else if (b && !a) {
      claimTransitions.push({ requirementId: b.requirementId, claimType: b.claimType, from: null, to: b.state, direction: 'appeared' });
    } else if (a && !b) {
      claimTransitions.push({ requirementId: a.requirementId, claimType: a.claimType, from: a.state, to: null, direction: 'removed' });
    }
  }

  const contextDelta = (next.contextActive || 0) - (prev.contextActive || 0);
  const nothingChanged = !focusChanged && readinessDir === 'same' && !claimTransitions.length && contextDelta === 0;

  const cl = ct => String(ct || 'requirement').replace(/_/g, ' ');
  const summary = [];
  if (focusChanged) summary.push(next.focus
    ? `Focus moved to ${next.focus.title || next.focus.id || 'a new item'}.`
    : 'There is no longer a confirmed focus.');
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
  if (contextDelta > 0) summary.push(`${contextDelta} operating-context record${contextDelta === 1 ? '' : 's'} added.`);
  else if (contextDelta < 0) summary.push(`${-contextDelta} operating-context record${contextDelta === -1 ? '' : 's'} retired or superseded.`);
  if (!summary.length) summary.push('No observable change to the derived organisational state.');

  return { from: prev.at, to: next.at, baseline: false, fingerprintChanged: prev.fingerprint !== next.fingerprint,
    focus: { changed: focusChanged, from: prev.focus || null, to: next.focus || null },
    readiness: { changed: readinessDir !== 'same', from: prev.readinessStatus, to: next.readinessStatus, direction: readinessDir },
    claimTransitions, contextDelta, nothingChanged, summary };
}

/* ── record — append a snapshot to a timeline if (and only if) it is a meaningful
   change, keeping the timeline bounded (oldest dropped past `cap`). Returns the new
   timeline plus whether it was recorded — pure: it does not mutate the input array. ── */
function record(timeline, snap, { cap = 300 } = {}) {
  const list = Array.isArray(timeline) ? timeline : [];
  const prev = list.length ? list[list.length - 1] : null;
  if (!shouldRecord(prev, snap)) return { timeline: list, recorded: false, snapshot: prev };
  const next = list.concat([snap]);
  const trimmed = next.length > cap ? next.slice(next.length - cap) : next;
  return { timeline: trimmed, recorded: true, snapshot: snap };
}

/* ── TIMELINE VIEW — ordered most-recent-first, each moment carrying the diff to the
   moment before it (so "what changed at each step" is answered without re-deriving). ── */
function buildTimeline(snapshots, { limit = 50 } = {}) {
  const asc = (snapshots || []).slice().sort((a, b) => (parse(a.at) || 0) - (parse(b.at) || 0));
  const steps = asc.map((s, i) => ({ snapshot: publicSnapshot(s), changed: diff(i > 0 ? asc[i - 1] : null, s) }));
  const recent = steps.slice(Math.max(0, steps.length - limit)).reverse();
  return { count: asc.length, entries: recent, summary: summariseTimeline(asc) };
}

/* ── summariseTimeline — read-only rollup over the whole history. Counts, not learning:
   how many meaningful moments, the span, how often readiness improved vs slipped, and
   how many claims were resolved vs lapsed. Phase B will reason ABOUT this; A only counts. ── */
function summariseTimeline(snapshots) {
  const asc = (snapshots || []).slice().sort((a, b) => (parse(a.at) || 0) - (parse(b.at) || 0));
  let improvements = 0, regressions = 0, resolved = 0, lapsed = 0, lastChangeAt = null;
  for (let i = 1; i < asc.length; i++) {
    const d = diff(asc[i - 1], asc[i]);
    if (!d || d.nothingChanged) continue;
    lastChangeAt = asc[i].at;
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
    claimsResolved: resolved, claimsLapsed: lapsed,
    lastChangeAt,
  };
}

/* ── changedSince — "what changed" between an anchor and the head of the timeline. The
   anchor may be a fingerprint, an ISO timestamp, or `steps` snapshots back from head.
   Returns a diff computed from the anchor snapshot to the latest one (deterministic). ── */
function changedSince(snapshots, { fingerprint = null, since = null, steps = null } = {}) {
  const asc = (snapshots || []).slice().sort((a, b) => (parse(a.at) || 0) - (parse(b.at) || 0));
  if (!asc.length) return { anchor: null, head: null, changed: null };
  const head = asc[asc.length - 1];
  let anchor = null;
  if (fingerprint != null) anchor = asc.find(s => String(s.fingerprint) === String(fingerprint)) || null;
  else if (since != null) { const ms = parse(since); anchor = ms != null ? [...asc].reverse().find(s => (parse(s.at) || 0) <= ms) || asc[0] : asc[0]; }
  else if (steps != null && steps > 0) anchor = asc[Math.max(0, asc.length - 1 - steps)];
  else anchor = asc.length >= 2 ? asc[asc.length - 2] : null;   // default: the previous moment
  return { anchor: publicSnapshot(anchor), head: publicSnapshot(head), changed: diff(anchor, head) };
}

module.exports = {
  SCHEMA, CLAIM_RANK, READINESS_RANK,
  snapshot, publicSnapshot, shouldRecord, diff, record,
  buildTimeline, summariseTimeline, changedSince,
};
