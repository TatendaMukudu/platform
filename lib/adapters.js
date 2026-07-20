/* ============================================================
   lib/adapters.js — Capability → Canonical Evidence adapters (pure).

   Legacy capabilities (daily check-in, Studio, assessments) keep their own
   OPERATIONAL records + surfaces, but they no longer own independent truth. Each
   adapter is a TRANSLATION BOUNDARY: it turns one operational record into one or more
   claim-bounded canonical-evidence inputs, preserving source id, provenance,
   actor/subject, occurred-vs-recorded time, visibility and epistemic status.

   Adapters may classify and structure. They may NOT detect longitudinal patterns or
   generate recommendations — that is the kernel's job. Output is idempotent: the same
   record + claim always yields the same stable `sourceKey`, so replay/backfill never
   duplicates a real-world event as several independent facts.

   Pure + dependency-free.
   ============================================================ */

const _s = (v, n) => (v == null ? '' : String(v)).slice(0, n);
const _hash = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h.toString(36); };

/* A stable identity for a claim from a capability record — the dedupe anchor. */
function sourceKey({ capability, recordId, claimId, occurredAt, subjectId }) {
  return `${capability}:${_s(recordId, 64)}:${_s(claimId, 40)}:${_s(subjectId || '', 40)}:${_s(occurredAt || '', 30)}`;
}

/* Shape a normalized canonical-evidence input (the server records it via _recordEvidence). */
function _claim(base, c) {
  return {
    provider: base.capability, source: base.capability,
    externalId: sourceKey({ capability: base.capability, recordId: base.recordId, claimId: c.claimId, occurredAt: base.occurredAt, subjectId: base.subjectId }),
    subjectId: base.subjectId || null, ownerRef: base.ownerRef || null, workspaceItemId: null,
    type: c.type || 'observation', label: c.label, value: c.value != null ? c.value : null, unit: c.unit || null,
    valueText: c.valueText != null ? _s(c.valueText, 2000) : null,
    observedAt: base.occurredAt, retrievedAt: base.recordedAt || base.occurredAt,
    confidence: c.confidence || (base.subjectId ? 'confirmed' : 'unmatched'),
    visibility: c.visibility || base.visibility || 'normal',
    // provenance: a model-extracted transcript is NOT original human evidence
    provenanceKind: c.derivation === 'extracted-by-model' ? 'model' : 'rule',
    derivation: c.derivation || 'reported',
    context: c.context || null,       // rubric / evaluator / limitations carried through (raw provenance)
    attributes: c.attributes || null, // the COMPLETE structured primitive object (on the envelope)
    // Only the score claim promotes to a legacy kernel signal (backwards compat); the
    // lifecycle claims (commitment/submission/revision/observation) are canonical evidence only.
    promote: c.promote !== false,
    primitive: c.primitive || null,   // which canonical primitive this claim represents
  };
}

/* ── CHECK-IN — one check-in may carry SEVERAL claims (a rating, a statement, a
   concern). Never collapse it into one opaque signal. Privacy from the record. */
const CheckInAdapter = {
  capability: 'checkin',
  toCanonicalEvidence(rec, ctx = {}) {
    if (!rec) return [];
    const base = { capability: 'checkin', recordId: rec.id || rec.ts || `${ctx.subjectId}:${rec.date}`,
      subjectId: ctx.subjectId || null, ownerRef: ctx.private ? ctx.subjectId : null,
      occurredAt: rec.ts || rec.date || ctx.now, recordedAt: rec.ts || ctx.now,
      visibility: ctx.private ? 'private' : 'sensitive' };   // check-ins are sensitive by default; private if the record says so
    const out = [];
    const mood = rec.mood != null ? Number(rec.mood) : null;
    if (Number.isFinite(mood)) out.push(_claim(base, { claimId: 'mood', type: 'metric', label: 'Self-rated mood', value: mood, unit: '/5', derivation: 'measured', confidence: 'confirmed' }));
    const text = rec.note || rec.text || '';
    if (text && text.trim()) out.push(_claim(base, { claimId: 'note', type: 'observation', label: 'Check-in note', valueText: text, derivation: 'reported', confidence: 'low' }));
    return out;
  },
};

/* ── STUDIO — a meaningful message becomes a claim; extracted metrics/files carry
   their extraction provenance and are never treated as original human evidence. */
const StudioAdapter = {
  capability: 'studio',
  toCanonicalEvidence(msg, ctx = {}) {
    if (!msg || msg.role === 'assistant') return [];   // the assistant's words are not evidence about the person
    const text = msg.text || (msg.media ? `[shared ${msg.media.kind}]` : '');
    if (!text || !text.trim()) return [];
    const base = { capability: 'studio', recordId: msg.id || msg.ts, subjectId: ctx.subjectId || null,
      ownerRef: ctx.private ? ctx.subjectId : null, occurredAt: msg.ts || ctx.now, recordedAt: msg.ts || ctx.now,
      visibility: ctx.private ? 'private' : (ctx.visibility || 'normal') };
    const l = text.toLowerCase();
    let type = 'observation', derivation = 'reported', confidence = 'low';
    if (/\bi will|i'll|commit|by (monday|tuesday|wednesday|thursday|friday|tomorrow)\b/.test(l)) { type = 'observation'; derivation = 'requested'; confidence = 'medium'; }
    return [_claim(base, { claimId: 'msg', type, label: 'Studio message', valueText: text, derivation, confidence })];
  },
};

/* ── ASSESSMENT / ASSIGNED WORK — the assign → submit → assess → revise lifecycle.
   Distinct epistemic objects, never flattened into one "assessment signal":
     • commitment  — what was asked (issuer, assignee, criteria + version).
     • submission  — what was actually provided (append-only; a resubmission is a revision).
     • revision    — a resubmission linked to the prior submission + the feedback it answers.
     • assessment  — a returned score as a COMPLETE object (assessor, rubric, scale, feedback,
                     submissionId) — never a naked number.
     • observation — the reviewer's feedback as a separate AUTHORED claim.
   A completed assessment is not a positive outcome; that needs separate outcome evidence. */
const AssessmentAdapter = {
  capability: 'assessment',

  /* Backwards-compatible entry point used by the idempotent backfill — the score object. */
  toCanonicalEvidence(a, ctx = {}) { return this.assessment(a, ctx); },

  _base(a, at, ctx, visibility) {
    return { capability: 'assessment', recordId: a.id, subjectId: a.assigneeId || ctx.subjectId || null,
      occurredAt: at || ctx.now, recordedAt: at || ctx.now, visibility: visibility || 'normal' };
  },

  /* COMMITMENT — what was asked/agreed. An assignment is not proof work happened. */
  commitment(a, ctx = {}) {
    if (!a || !a.id) return [];
    const base = this._base(a, a.assignedAt || ctx.now, ctx, 'normal');
    return [_claim(base, { claimId: 'commitment', type: 'event', primitive: 'commitment', promote: false,
      label: `Assigned: ${_s(a.title, 60)}`, valueText: _s(a.description || a.title || 'Assignment', 400),
      derivation: 'reported', confidence: 'confirmed',
      attributes: { primitive: 'commitment', assignmentId: a.id, issuerId: a.assignerId || 'system',
        assigneeId: a.assigneeId || null, title: _s(a.title, 120), criteria: _s(a.guidance || a.description || '', 600),
        criteriaVersion: a.criteriaVersion != null ? Number(a.criteriaVersion) : 1, dueAt: a.dueAt || null } })];
  },

  /* SUBMISSION — what was provided. Append-only; `sub` is one record from a.submissions.
     A resubmission (revisionOf set) ALSO yields a linked revision claim. */
  submission(a, sub, ctx = {}) {
    if (!a || !sub || !sub.id) return [];
    const base = this._base({ ...a, id: `${a.id}:${sub.id}` }, sub.submittedAt || ctx.now, ctx, ctx.visibility || 'normal');
    const out = [_claim(base, { claimId: 'submission', type: 'document', primitive: 'submission', promote: false,
      label: `Submission: ${_s(a.title, 60)}`, valueText: _s(sub.note || '(submitted)', 800),
      derivation: 'reported', confidence: 'confirmed', visibility: ctx.visibility || 'normal',
      attributes: { primitive: 'submission', submissionId: sub.id, assignmentId: a.id, authorId: a.assigneeId || null,
        iteration: sub.iteration != null ? Number(sub.iteration) : 1, revisionOf: sub.revisionOf || null,
        declaredComplete: true } })];
    if (sub.revisionOf) out.push(_claim(this._base({ ...a, id: `${a.id}:${sub.id}:rev` }, sub.submittedAt || ctx.now, ctx, 'normal'),
      { claimId: 'revision', type: 'event', primitive: 'revision', promote: false,
        label: `Revision ${sub.iteration || 2}: ${_s(a.title, 50)}`, valueText: `Iteration ${sub.iteration || 2}`,
        derivation: 'reported', confidence: 'confirmed',
        attributes: { primitive: 'revision', submissionId: sub.id, previousSubmissionId: sub.revisionOf,
          assignmentId: a.id, iteration: sub.iteration != null ? Number(sub.iteration) : 2,
          respondsToAssessmentId: sub.respondsToAssessmentId || null } }));
    return out;
  },

  /* ASSESSMENT — a returned score as a COMPLETE object, plus the feedback as an authored
     observation. The score claim promotes (backwards-compat kernel signal); the rest do not. */
  assessment(a, ctx = {}) {
    if (!a || a.status !== 'returned' || !Number.isFinite(Number(a.score))) return [];
    const base = this._base(a, a.returnedAt || ctx.now, ctx, 'normal');
    const submissionId = ctx.submissionId
      || (Array.isArray(a.submissions) && a.submissions.length ? a.submissions[a.submissions.length - 1].id : a.id);
    const assessmentId = `as_${a.id}`;
    const rubric = _s(a.guidance || a.description || '', 600);
    const out = [_claim(base, { claimId: 'score', type: 'metric', primitive: 'assessment', promote: false,
      // Canonical evidence only — the legacy return signal remains the signal-layer
      // representation during migration, so there is no double-counted score signal.
      label: `Assessment score: ${_s(a.title, 60)}`, value: Number(a.score), unit: '/100',
      valueText: null, derivation: 'measured', confidence: 'confirmed',
      attributes: { primitive: 'assessment', assessmentId, submissionId, assessorId: a.assignerId || 'system',
        subjectId: a.assigneeId || null, rubric, score: Number(a.score), scoreScale: '0-100',
        qualitativeFeedback: _s(a.feedback || '', 800), confidence: null,
        limitations: 'reflects the leader\'s stated expectation, not a universal performance truth' },
      context: { kind: 'assessment_score', rubric: _s(rubric, 200), evaluator: a.assignerId || 'system', submissionId,
        limitations: 'reflects the leader\'s stated expectation, not a universal performance truth' } })];
    if (a.feedback && a.feedback.trim()) out.push(_claim(this._base({ ...a, id: `${a.id}:fb` }, a.returnedAt || ctx.now, ctx, 'normal'),
      { claimId: 'feedback', type: 'observation', primitive: 'observation', promote: false,
        label: `Feedback: ${_s(a.title, 60)}`, valueText: _s(a.feedback, 800), derivation: 'reported', confidence: 'confirmed',
        attributes: { primitive: 'observation', observerId: a.assignerId || 'system', subjectId: a.assigneeId || null,
          dimension: _s(a.title, 80), basis: _s(rubric, 200), relatesToAssessmentId: assessmentId } }));
    return out;
  },
};

const ADAPTERS = { checkin: CheckInAdapter, studio: StudioAdapter, assessment: AssessmentAdapter };

module.exports = { sourceKey, CheckInAdapter, StudioAdapter, AssessmentAdapter, ADAPTERS };
