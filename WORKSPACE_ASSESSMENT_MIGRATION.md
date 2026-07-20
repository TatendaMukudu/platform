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
and the single-adapter path.

---

# Slice 2 — Complete-Assessment consumption in the unified assistant

**Scope:** connect the MyWorkspace assistant/advisor and the relevant numeric reasoning to the
complete canonical Assessment lifecycle. Evidence consumption only — no scenario/`memberResults`
convergence.

## What changed
- **Authorised complete-assessment reader** — `_assessmentEvidenceFor` is documented + hardened
  as an authorised reader (org boundary, subject, purpose, visibility, authorship); a private
  assessment is admitted only for its owner under a personal purpose, never for leader/org.
- **Bounded assessment kernel state** — `_assessmentKernelState(code, subjectId, {purpose, viewerId})`
  reconstructs the developmental journey from commitment/submission/revision/assessment/observation
  evidence: latest complete assessment, comparable history, score + scale, rubric, assessor,
  feedback themes (dimensions, never raw text), iterations, feedback-acted-upon, what changed,
  direction (`improvement | decline | stable | incomparable | unknown`), confidence, limitations,
  and basis IDs. Assessments are compared only when scale **and** rubric match; otherwise
  `incomparable`. A missing scale/rubric yields a limitation, not an interpretation.
- **Scale-aware reasoning** — the naked `score < 50` concern (which assumed a percentage) is
  replaced, in `_buildMemberIntelInput` and `_memberAlert`, by `_assessmentConcerns`: a score
  below **half of its own scale**, read from canonical evidence. `45/50` no longer triggers the
  rule that `45/100` does; an unknown scale raises no false concern.
- **Advisor integration** — `_advisorKernelReasoning` now consumes the complete Assessment
  (scale-aware, journey-aware) instead of a `/100`-hardcoded score; feedback is surfaced as
  themes and "acted upon", never as quoted text. Assessment basis IDs join the kernel artifact.

## Double-counting audit (proven)
One real assessment is counted **once** in each place: the legacy value signal (unchanged) feeds
the self-relative numeric streams; concern detection reads **only** canonical assessments
(scale-aware); the assistant reads the complete object. No path counts the same assessment twice.
Canonical assessments remain **unpromoted**, so they never enter the numeric/aggregate streams
alongside the legacy signal.

## Privacy
Three boundaries preserved: private assessments/submissions excluded before leader-support kernel
state is formed; owner may use their own under personal assistance; raw feedback / submission text
is never quoted through the assistant (only structural themes). The feedback observation is
unpromoted, so it is not reachable through the gateway either.

## Tests
`scripts/assessment-consumption-smoke.js` (16 checks) proves all 12 invariants:
live-without-backfill, score+scale together, `45/50 ≠ 45/100`, incomparable rubrics, revision
responds-to-feedback, private excluded from leader-support, sensitive feedback not quoted,
no double-count, missing scale→limitation, inspectable basis IDs, and unchanged non-assessment
advisor behaviour. Full truth layer green (advisor 45, check-in 59, workspace-assessment 30,
assessment-consumption 16, endpoints 222, adapters 12, evidence 21, all suites).

## Remaining consumers still dependent on legacy score signals
- **`_buildMemberIntelInput` numeric capability streams** (`agents.crossSignal` /
  `primitives.structuralPatterns`) still read the legacy `source:'assessment'` value signal —
  intentionally, because they reason **self-relatively** (value vs the member's own baseline), so
  they are scale-safe and must not be double-fed by promoting canonical assessments.
- **`_personStrengths` / `_studioMemberRead` development-area parsing** still regex-parse
  `Strengths:/Development:` from the legacy **scenario** (`memberResults`) `source:'assessment'`
  text signals — that is the scenario/`memberResults` representation, deferred to the next slice.
- The **legacy return score signal** is preserved for the above self-relative streams and remains
  non-authoritative.
Severing these requires the scenario/`memberResults` convergence (next slice) so a single
canonical representation feeds every consumer.
