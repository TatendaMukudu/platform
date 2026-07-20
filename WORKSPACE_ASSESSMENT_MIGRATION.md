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

---

# Slice 3 — Scenario / memberResults canonical convergence

**Scope:** collapse the legacy scenario/`memberResults` assessment representation into the same
canonical assessment model as assigned work. The interaction surfaces stay separate; the **truth
representation is now one**. ("Studio" is not a product concept — the user-facing system is
**MyWorkspace**; the AI is the **unified IntelliQ assistant**.)

## Legacy scenario lifecycle (inventory)
`POST /api/platform/assign-scenario` → `assignedScenarios` (pending). Member completes a scenario;
it is **scored client-side** (the scorer prompt defines a system 0-100 `overall` composite plus
sub-dimensions, `strengths[]`, `development[]`, `summary`). `POST /api/member/submit-result` stores
`{...result, memberName, memberId, submittedAt}` in `memberResults[memberKey]` and (previously)
emitted a value-bearing `source:'assessment'` **number** signal (overall) and a **text** signal
encoding `Strengths:/Development:`. The raw response text is **not** retained server-side.
Fields: `scenarioId, scenarioTitle, domain, date, score (overall number), dimensions {overall,
summary, strengths[], development[]}, memberId, submittedAt`. Incomplete historical records
(missing `dimensions`, or missing `memberId`) are handled explicitly, never inferred.

## Canonical mapping (one adapter)
`AssessmentAdapter.scenarioResult()` maps a `memberResult` into the **same primitives** as assigned
work, all unpromoted:
- **submission** — a completion event (`sourceType:'scenario'`, `responseRetained:false`; the raw
  response isn't retained — a limitation, not an invention).
- **assessment** — `overall` on the scenario's **system-defined 0-100 scale** (documented via
  `scaleBasis`, not inferred), `assessorType:'automated'`, rubric = the scenario itself (so scenario
  and assigned-work assessments are correctly **incomparable**), summary = qualitative feedback.
  A record with no score yields a submission but **no invented assessment**.
- **observations** — each strength/development becomes a **contextual** capability observation
  (`observationType:'capability'`, `polarity`, `dimension`, `relatesToAssessmentId`, basis,
  limitations) — never an unqualified permanent trait.

## Live + backfill (same code path, idempotent)
`_canonicaliseScenarioResult` runs at the `submit-result` write boundary; `_backfillCanonical` now
iterates `memberResults` through the **same** adapter method. Idempotent via the stable
`scenarioId:submittedAt` source key — repeated backfill records nothing new, and a live-canonicalised
scenario is not re-created.

## Consumer migration (off legacy signals)
- `_personStrengths` and the development-area consumers (`_studioMemberRead` [legacy name only],
  the leader team view, the dev-areas aggregate) now read **structured capability observations**
  via `_capabilityDims`/`_capabilityObservations` (canonical-first, legacy text fallback during the
  migration window) — no regex parsing of `Strengths:/Development:`.
- The leader team view's recent score reads the complete canonical Assessment (with scale).
- `_buildMemberIntelInput` numeric streams **skip** `source:'assessment'` and instead build
  **canonical assessment streams**, one per comparable group (same scale + rubric), self-relative —
  incompatible rubrics are never pooled.

## Legacy signal cutover (phased)
Emit canonical live → backfill historical → migrate consumers → verify no double-count → **retire**
the value-bearing signals. Both the scenario overall/text signals and the assigned-work return score
signal are now **contentless completion markers** (`modality:'participation'`, `valueNum:null`). One
real assessment is counted **once** — the value lives only in canonical evidence.

## Privacy
Same boundaries as assigned work: a private scenario assessment is excluded from leader-support
kernel state and admitted only for its owner under personal assistance; the AI summary is classified
(sensitive → non-quotable); the raw response is never stored, so it cannot leak.

## Tests
`scripts/scenario-convergence-smoke.js` (25 checks) proves all 18 invariants: live canonicalization,
same-adapter idempotent backfill, score+scale linkage, missing-scale→limitation, structured
strength/development observations, source-assessment IDs retained, private exclusion, no raw-response
leakage, one kernel-state contract for both paths, incomparable rubrics, numeric streams off the
legacy value, no double-count, and the value-signal cutover — with assigned-work / advisor / check-in
behaviour unchanged. Full truth layer green (scenario-convergence 25, assessment-consumption 16,
workspace-assessment 30, advisor 45, check-in 59, endpoints 222, all suites).

## Remaining legacy dependencies (final report)
- **Display/aggregate reads of the `memberResults` store** (member exports, org dashboards,
  `_aggregateOrgData`, the legacy `_buildAdvisorContext`/`_buildBehavioralProfile`) still read the
  raw `memberResults` array for **display**, not as reasoning truth. They are unchanged and out of
  scope (no reasoning conclusion depends on them).
- **The journey-timeline view** renders `events` of `type:'assessment'` (`e.data.overall`) for
  display only — not a signal consumer.
- **A contentless completion marker** (`source:'assessment'`, `valueNum:null`) is retained for
  participation cadence + last-activity (the same named consumer as the check-in frozen marker). No
  external dependency on the value-bearing signal was identified; if one surfaces, it must read
  canonical evidence.
- **Frontend `_scoreLabel`/`_scoreColor`** still derive a client-side qualitative label from a score
  (flagged in the original inventory) — a separate frontend concern, not touched here.
No unidentified legacy value-signal consumer remains in the reasoning paths.

---

# Slice 4 — Server-supplied assessment presentation state

**Scope:** remove client-side qualitative judgment of assessment scores. Assessment *meaning*
is supplied by the authorised server/kernel state; the frontend renders it. Presentation-truth
migration, not a frontend redesign.

## Frontend score-interpretation inventory
- **Qualitative interpretation (migrated):** `scoreLabel` (ui.js), `_scoreLabel`/`_scoreColor`
  (member-view.js), `getScoreLabel` (scenarios.js) — threshold → verdict word / judgment colour.
- **`/100` scale assumption:** member result copy, timeline — now the presentation carries the
  real scale; legitimate numeric display of assignment scores (scale genuinely 100) is preserved.
- **Dashboard aggregate colour (`scoreColor`, app.js):** `iqScore`/`wellnessScore` are non-canonical
  KPIs, not assessment scores — see remaining boundary.

## Server presentation contract
`_assessmentPresentationState(code, subjectId, {purpose, viewerId})`, derived from the assessment
kernel state, exposed at `GET /api/assessments/:memberId/presentation` (authorised: self →
personal_assistance; leader → leader_support with visible scope + `view_insights`). Bounded,
audience-safe shape: `{ assessmentId, scoreDisplay, verdict, label, direction, comparable,
confidence, limitations, basisIds, revisionState, feedbackActedUpon, feedbackThemes }`.
- **verdict** — a bounded enum (`strong · meeting_expectation · developing · concern · improving ·
  declining · stable · incomparable · uninterpreted · unknown`). Scale-aware: `45/50` → `strong`,
  `45/100` → `developing`. Comparability-aware: different rubric → `incomparable`. Missing
  scale/rubric → `uninterpreted`.
- **scoreDisplay** — keeps the original score + its own scale (`45 / 50`, `82 / 100`), or
  `Score recorded — scale unavailable`. Never assumes `/100`.
- No raw feedback / response text; `feedbackThemes` are assessed *dimensions* only. Private
  assessments are excluded before a leader-facing state is formed; owner-only under personal
  assistance.

## Frontend migration
- `scoreLabel`, `getScoreLabel`, `_scoreLabel`, `_scoreColor` **neutralized** — they no longer
  derive a verdict/colour from a raw score (they render the number neutrally). `scoreColor`
  returns a neutral colour (no threshold judgment).
- The **only** sanctioned score-to-visual mapping is `verdictStyle(verdict)` in ui.js — it maps a
  bounded **server** verdict to a badge style, never a raw score.
- `_loadAssessmentPresentation()` fetches the server state and fills `[data-assessment-verdict]`
  slots (member result screen). Fallback with no presentation: raw score + scale +
  "interpretation unavailable", never a client verdict.

## Tests
`scripts/assessment-presentation-smoke.js` (23 checks) proves all 15 invariants: `45/50 ≠ 45/100`,
no `/100` assumption, incomparable rubrics, missing scale → limitation, raw score without verdict,
client thresholds/colours removed (static source guards), `verdictStyle` from server verdicts only,
improving state, feedback-acted-upon accuracy, private excluded from leader presentation, no raw
feedback surfaced, one contract for assigned-work + scenario, and endpoint authorization — with
assigned-work / advisor / check-in behaviour unchanged. Full truth layer green.

## Final report — remaining frontend-created developmental judgments
- **Dashboard aggregate KPIs** (`iqScore`, `wellnessScore`, `overall`, per-metric `scores[k]`) in
  `js/app.js` are coloured via `scoreColor`, which is now **neutral** (no threshold judgment) — so
  no verdict is created there, but these are **non-canonical aggregate metrics**, not assessment
  scores. Giving them their own server-supplied interpretation is a separate follow-up (not an
  assessment-score judgment).
- **Mood labels** (`moodVal >= 4 ? 'Strong'…`, app.js/member-view) are check-in presentation, out
  of scope (and check-in logic must not change here).
- **Chart legends** (e.g. wellness doughnut `['Excellent','Good',…]`) are static category labels,
  not score→verdict.
No client-side qualitative judgment of an **assessment score** remains; assessment meaning is
server-supplied. The next boundary is the raw `memberResults` display-projection migration and the
MyWorkspace interface changes — deferred as instructed.
