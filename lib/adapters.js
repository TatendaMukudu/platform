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
    visibility: base.visibility || 'normal',
    // provenance: a model-extracted transcript is NOT original human evidence
    provenanceKind: c.derivation === 'extracted-by-model' ? 'model' : 'rule',
    derivation: c.derivation || 'reported',
    context: c.context || null,   // rubric / evaluator / limitations carried through
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

/* ── ASSESSMENT — a score keeps what it REPRESENTS: rubric, evaluator, submission.
   A completed assessment is not a positive outcome; that needs separate outcome
   evidence. Distinct events (assigned / submitted / returned / scored). */
const AssessmentAdapter = {
  capability: 'assessment',
  toCanonicalEvidence(a, ctx = {}) {
    if (!a) return [];
    const base = { capability: 'assessment', recordId: a.id, subjectId: a.assigneeId || ctx.subjectId || null,
      occurredAt: a.returnedAt || a.submittedAt || a.assignedAt || ctx.now, recordedAt: a.returnedAt || ctx.now, visibility: 'normal' };
    const out = [];
    if (a.status === 'returned' && Number.isFinite(Number(a.score))) {
      out.push(_claim(base, { claimId: 'score', type: 'metric', label: `Assessment score: ${_s(a.title, 60)}`, value: Number(a.score), unit: '/100',
        derivation: 'measured', confidence: 'confirmed',
        context: { kind: 'assessment_score', rubric: _s(a.guidance || a.description || '', 200), evaluator: a.assignerId || 'system', submissionId: a.id, limitations: 'reflects the leader\'s stated expectation, not a universal performance truth' } }));
    }
    return out;
  },
};

const ADAPTERS = { checkin: CheckInAdapter, studio: StudioAdapter, assessment: AssessmentAdapter };

module.exports = { sourceKey, CheckInAdapter, StudioAdapter, AssessmentAdapter, ADAPTERS };
