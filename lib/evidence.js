/* ============================================================
   lib/evidence.js — the Canonical Evidence Envelope.

   THE universal boundary between connectors and the kernel. Every piece of
   incoming information — an API response, a webhook, a CSV row, an email, a
   document, or a manual entry — is normalised into ONE shape before it can become
   a kernel signal. Connectors differ wildly on the outside; past this envelope
   they are identical.

       External source
         → raw immutable record        (stored verbatim, never mutated)
         → validated mapping           (versioned; admin-approved)
         → identity resolution         (confidence: confirmed/probable/unmatched/conflict)
         → CANONICAL EVIDENCE ENVELOPE ← this file
         → kernel signal
         → assistant context
         → authorized action

   Pure and dependency-free so the harness can validate it in isolation. It stores
   nothing and reasons about nothing — it only defines and enforces the contract.
   ============================================================ */

/* What KIND of evidence this is (not an industry noun — a universal shape). */
const EVIDENCE_TYPES = ['metric', 'observation', 'event', 'message', 'document', 'attendance', 'assessment', 'activity'];

/* Identity resolution confidence (mirrors lib/connector-sdk.resolveIdentity). An
   envelope is only promoted to a kernel signal when its subject is resolved; an
   unmatched/conflict envelope is still STORED (for audit + later re-resolution),
   but never silently attached to a person. */
const CONFIDENCE_STATES = ['confirmed', 'probable', 'unmatched', 'conflict'];

/* Lifecycle status of the evidence itself (distinct from identity confidence).
   active     — current, in effect
   held       — stored, but its MEANING is not yet approved (no active mapping, or
                schema drift): retained for inspection, never promoted until released
   superseded — a newer envelope replaced it (e.g. a corrected value)
   deleted    — the source reported the record was removed (deletion handling)
   rejected   — an admin/validation rejected it; never reaches the kernel */
const LIFECYCLE_STATES = ['active', 'held', 'superseded', 'deleted', 'rejected'];

/* Visibility policy — reuses the kernel's sensitivity model so the privacy layer
   treats connector evidence exactly like any other signal. */
const VISIBILITY_POLICIES = ['normal', 'sensitive', 'private'];

const _s = (v, n) => (v == null ? '' : String(v)).slice(0, n);
const _iso = (v) => { if (!v) return null; const d = new Date(v); return isNaN(d) ? null : d.toISOString(); };

/* Normalise a structured attributes bag: a shallow, bounded, JSON-safe map (scalars,
   or short string arrays). Keeps a complete primitive object on the envelope without
   letting an arbitrary/huge payload through. Returns null when there is nothing to carry. */
function _boundedAttributes(a) {
  if (!a || typeof a !== 'object' || Array.isArray(a)) return null;
  const out = {};
  let n = 0;
  for (const k of Object.keys(a)) {
    if (n >= 32) break;
    const key = _s(k, 48); if (!key) continue;
    const v = a[k];
    if (v == null) { out[key] = null; }
    else if (typeof v === 'number' && Number.isFinite(v)) { out[key] = v; }
    else if (typeof v === 'boolean') { out[key] = v; }
    else if (Array.isArray(v)) { out[key] = v.slice(0, 20).map(x => _s(x, 200)); }
    else { out[key] = _s(v, 800); }
    n++;
  }
  return Object.keys(out).length ? out : null;
}

/* Build a canonical envelope from loosely-shaped input. Deterministic + pure:
   normalises types, clamps lengths, and fills the required boundary fields. Does
   NOT resolve identity or validate business rules beyond structure — callers pass
   the already-resolved subject + confidence. Returns a frozen-shape object; use
   validateEnvelope() to check it before trusting it. */
function buildEnvelope(input = {}) {
  const now = new Date().toISOString();
  const type = EVIDENCE_TYPES.includes(input.type) ? input.type : 'metric';
  const hasNum = input.value != null && Number.isFinite(Number(input.value));
  return {
    // identity of the evidence
    id:               _s(input.id, 64) || null,          // assigned by the store if absent
    org:              _s(input.org, 64).toLowerCase(),
    provider:         _s(input.provider || input.source || 'manual', 40),
    source:           _s(input.source || input.provider || 'manual', 40),
    externalId:       input.externalId != null ? _s(input.externalId, 200) : null,

    // who + which group it concerns
    subjectRef:       input.subjectRef != null ? _s(input.subjectRef, 200) : null,  // the RAW key the source used
    subjectId:        input.subjectId != null ? _s(input.subjectId, 64) : null,     // the RESOLVED person, if any
    groupRef:         input.groupRef != null ? _s(input.groupRef, 200) : null,

    // what it is + its value
    type,
    label:            _s(input.label || 'Evidence', 120),
    value:            hasNum ? Number(input.value) : null,
    unit:             input.unit != null ? _s(input.unit, 24) : null,
    valueText:        input.valueText != null ? _s(input.valueText, 2000) : null,

    // when it happened vs when we saw it
    event:            input.event != null ? _s(input.event, 200) : null,
    observedAt:       _iso(input.observedAt || input.date || input.ts) || now,
    windowEnd:        _iso(input.windowEnd) || null,     // for a time-window observation
    retrievedAt:      _iso(input.retrievedAt) || now,

    // trust + governance
    confidence:       CONFIDENCE_STATES.includes(input.confidence) ? input.confidence : 'unmatched',
    status:           LIFECYCLE_STATES.includes(input.status) ? input.status : 'active',
    visibility:       VISIBILITY_POLICIES.includes(input.visibility) ? input.visibility : 'normal',
    // owner-only PRIVATE evidence carries the owner it belongs to — the gateway uses
    // this to admit it for the owner's personal reasoning ONLY.
    ownerRef:         input.ownerRef != null ? _s(input.ownerRef, 64) : null,

    // structured primitive attributes — a COMPLETE canonical object (e.g. an Assessment
    // with assessor/rubric/scale/feedback/submissionId) rather than a naked number. Bounded
    // + primitive/JSON-safe; downstream reasoning consumes this, never an isolated value.
    attributes:       _boundedAttributes(input.attributes),

    // provenance chain
    rawRef:           input.rawRef != null ? _s(input.rawRef, 64) : null,           // → the raw immutable record
    workspaceItemId:  input.workspaceItemId != null ? _s(input.workspaceItemId, 64) : null,  // → the MyWorkspace item
    derivedFrom:      Array.isArray(input.derivedFrom) ? input.derivedFrom.slice(0, 50).map(x => _s(x, 64)) : [],  // basis for derived evidence
    mappingVersion:   input.mappingVersion != null ? Number(input.mappingVersion) || null : null,

    createdAt:        _iso(input.createdAt) || now,
  };
}

/* Structural validation — the guarantees the kernel relies on. Returns
   { ok, errors[] }. A false here means the envelope must not be stored/promoted. */
function validateEnvelope(env) {
  const errors = [];
  if (!env || typeof env !== 'object') return { ok: false, errors: ['not an object'] };
  if (!env.org) errors.push('org required');
  if (!EVIDENCE_TYPES.includes(env.type)) errors.push('invalid type');
  if (!CONFIDENCE_STATES.includes(env.confidence)) errors.push('invalid confidence');
  if (!LIFECYCLE_STATES.includes(env.status)) errors.push('invalid status');
  if (!VISIBILITY_POLICIES.includes(env.visibility)) errors.push('invalid visibility');
  if (!env.observedAt || isNaN(new Date(env.observedAt))) errors.push('invalid observedAt');
  // Evidence must carry SOMETHING to reason about.
  if (env.value == null && !env.valueText) errors.push('no value or valueText');
  return { ok: errors.length === 0, errors };
}

/* A stable fingerprint used for DEDUPLICATION: the same source record re-sent (a
   webhook retry, an overlapping incremental sync) collapses to one envelope. Keyed
   on the facts that make an observation THE SAME observation — never on value, so a
   corrected value is recognised as a supersede, not a new fact. */
function dedupeKey(env) {
  const parts = [
    env.org, env.provider,
    env.externalId || '',
    env.subjectId || env.subjectRef || '',
    env.type, env.label,
    env.observedAt || '',
  ];
  const s = parts.join('|');
  let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h.toString(36);
}

/* Only envelopes whose subject is resolved AND that are active promote to a kernel
   signal. This is the gate that stops a fuzzy/unmatched record from ever silently
   becoming organisational truth. Re-checked after EVERY resolution event. */
function promotable(env) {
  return !!env && env.status === 'active' && !env.promoted
    && (env.confidence === 'confirmed' || env.confidence === 'probable')
    && !!env.subjectId;
}

/* WHO/WHAT performed a resolution — provenance for the identity lifecycle.
   deterministic — a hard identifier matched (email / external id / member id)
   candidate     — a fuzzy signal PROPOSED a match (name/role/etc.) — never auto-confirms
   admin         — a human confirmed it
   rule          — a deterministic re-resolution pass (e.g. after a roster sync)
   model         — an AI suggestion (proposal only)
   reversal      — a previous resolution was undone */
const RESOLUTION_METHODS = ['deterministic', 'candidate', 'admin', 'rule', 'model', 'reversal'];

/* Build (do not apply) an append-only resolution event capturing the FROM state,
   the TO state, and who/why. The caller appends it to env.resolutions and updates
   the envelope's current identity — the event preserves the history so nothing is
   ever lost. Pure. */
function resolutionEvent(env, patch = {}) {
  return {
    from:       { confidence: env.confidence, subjectId: env.subjectId || null },
    to:         { confidence: patch.confidence || env.confidence, subjectId: patch.subjectId != null ? String(patch.subjectId) : (env.subjectId || null) },
    by:         _s(patch.by || 'system', 64),
    method:     RESOLUTION_METHODS.includes(patch.method) ? patch.method : 'rule',
    confidence: CONFIDENCE_STATES.includes(patch.confidence) ? patch.confidence : env.confidence,
    reason:     _s(patch.reason || '', 240),
    ts:         _iso(patch.ts) || new Date().toISOString(),
  };
}

module.exports = {
  EVIDENCE_TYPES, CONFIDENCE_STATES, LIFECYCLE_STATES, VISIBILITY_POLICIES, RESOLUTION_METHODS,
  buildEnvelope, validateEnvelope, dedupeKey, promotable, resolutionEvent,
};
