# MyWorkspace — Assigned-Work Canonicalization (Slice 1)

**Scope:** `Assign → Submit → Assess → Revision → Canonical Evidence`.
This is a canonical-evidence migration, not a UI rewrite. "Studio" is legacy implementation
terminology only — the product experience is **MyWorkspace** (one environment, many lenses).

## What changed

### Canonical primitives now emitted (live)
The assigned-work lifecycle produces claim-bounded canonical evidence through the **single**
production `AssessmentAdapter` (no parallel logic; the idempotent backfill delegates to the
same `assessment()` method):

| Event | Endpoint | Canonical evidence (`attributes.primitive`) |
|---|---|---|
| Assign | `POST /api/assessments/assign` (both paths) | `commitment` — issuer, assignee, criteria, **criteriaVersion** |
| Submit | `POST /api/assessments/:id/submit` | `submission` (append-only) + `revision` on resubmit |
| Return | `POST /api/assessments/:id/return` | `assessment` (complete) + `observation` (authored feedback) |

### The Assessment is a complete object, never a naked number
A returned score is canonical evidence carrying `assessmentId · submissionId · assessorId ·
subjectId · rubric · score · scoreScale · qualitativeFeedback · confidence · limitations` in a
new bounded envelope field, **`attributes`** (`lib/evidence.js`). Downstream reasoning consumes
the complete object via `_assessmentEvidenceFor()` — the dedicated reader, mirroring how mood is
read via `_canonicalMoodSeries()`.

### Submissions are append-only; resubmission is a Revision
`assignment.submissions[]` is append-only. Each submit creates a `submission` record
(`{id, response, note, submittedAt, iteration, revisionOf, respondsToAssessmentId}`); a
resubmission links to the prior submission and to the assessment it answers. `a.response`/`a.note`
remain the latest snapshot for backwards compatibility. The kernel (`_assignmentProgress()`)
answers: **iterations**, **responded-to-feedback**, **improved** (score trend), **what changed** —
from evidence, never from a bare status.

### Shared privacy classification (no hard-coded `normal`)
- MyWorkspace conversation captures (`/api/studio/chat`) now classify sensitivity with the same
  `privacy.classifyText` used by check-ins — a hardship typed into the composer is protected.
- Submission notes are classified; a hardship note becomes `sensitive` (informs, never quoted).
- AI conversation behaviour is unchanged — only the signal's classification changed.

### Criteria integrity
Assignment criteria are now **deep-copied and versioned** (`criteriaVersion`) at issue, closing
the shared-reference fragility flagged in the inventory. No template-edit path exists, so a
historical expectation cannot be rewritten.

## Backwards compatibility (deliberate)
- **All legacy signals are preserved unchanged** — the return score signal, the submit
  participation signal, `_publicAssignment`, `assessment` numeric streams, `_personStrengths`.
- The canonical Assessment is **not promoted** to a kernel signal, so there is **no
  double-counted score signal**. The legacy signal remains the (non-authoritative) signal-layer
  representation during migration; canonical evidence is authoritative for new reasoning.
- Consistency is proven: `canonical Assessment.value === legacy signal.valueNum === record.score`.

### Score-only reasoning reduced (where possible, in scope)
`_studioMemberRead` "recent reviews" now consumes the complete Assessment (score with its scale)
via `_assessmentEvidenceFor`, falling back to the raw record only if nothing is canonicalised yet.

## Explicitly out of scope (unchanged)
Frontend redesign · DB table renames · scenario/`memberResults` convergence · `_gatherSignals`
rewrite · tutorials · AI conversation behaviour. The advisor still reads the (promoted) gateway
and therefore no longer sees assessment scores it only ever saw via backfill-promotion — a future
slice will point the advisor at `_assessmentEvidenceFor`.

## Tests
`scripts/workspace-assessment-smoke.js` (30 checks) drives the real HTTP flow end-to-end and
proves: commitment/submission/revision/assessment/observation emission, append-only + revision
lineage, complete-object assessment, kernel progress reasoning, privacy classification,
canonical/legacy consistency, single-signal (no double count), backwards-compatible projection,
and the single-adapter path. Full truth layer green (advisor 45, check-in 59, adapters 12,
evidence 21, endpoints 222, all suites).
