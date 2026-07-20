# Unified MyWorkspace Assistant Runtime — Slice 1

One user-facing IntelliQ assistant, one MyWorkspace composer. This slice proves a single
interaction can be interpreted safely and routed through the **existing** OS architecture —
canonical evidence gateway, kernel, and the universal action contract — without creating a
separate assistant, notes, planning or check-in truth system, and without a
conversation-evidence primitive.

## The bounded turn
```
user input
  → claim-bounded interpretation      (_assistantInterpret)
  → authorised context retrieval       (_assistantContext — existing readers only)
  → kernel reasoning                   (_recordKernelDerivation, basis IDs retained)
  → audience-safe response             (_composeForAudience, post-kernel bounded)
  → optional action PROPOSALS          (_assistantProposals — never executed)
  → explicit approval                  (POST /turn/:id/confirm)
  → execution through existing capability (workspace capture · calendar draft · check-in reg.)
  → observable outcome
```
The model never writes to a capability store. The raw message is stored as an **interaction
artifact** (`rawInput` + `originalInputRef`); only user-confirmed, policy-approved
interpretations become canonical evidence (via the workspace capture capability) or actions.

## Endpoints
- `POST /api/assistant/turn` — one composer. Interpret + reason + propose. Persists only the
  bounded turn artifact + reasoning artifacts; **nothing** reaches a capability store.
- `GET /api/assistant/turn/:turnId` — inspect the bounded interpretation artifact (self-only).
- `POST /api/assistant/turn/:turnId/confirm` — approve one proposal → route to its existing
  capability. Visibility increases **only** with an explicit `overrides.confirmVisibilityIncrease`.
- `POST /api/assistant/turn/:turnId/correct` — bounded corrections to the interpretation/proposal;
  the original message is immutable.
- `GET /api/assistant/checkin-proposals` — the caller's registered personalised check-ins.

## Bounded interpretation artifact
`{ turnId, userId, organisationId, originalInputRef, candidateIntents[], candidateClaims[]
(verifiedFact:false), suggestedPrivacy, proposedEvidence[], proposedActions[], confidence,
ambiguities, limitations }`. Inspectable, not chain-of-thought. Claims are distinguished from
verified facts; nothing silently becomes canonical truth.

## Privacy defaults
- Personal composer input defaults to **private** (`suggestClassification`'s private floor).
- Work-related wording does **not** become organisation-visible automatically.
- AI interpretation cannot raise visibility; any increase requires an explicit user confirm
  (`VIS_RANK` gate on confirm).
- Sensitive/restricted content passes through the **shared** `privacy.classifyText`.
- Private evidence stays owner-only; unavailable to leader-support purposes.
- The original content is preserved separately from derived interpretations.

## Authorised context assembler
`_assistantContext` retrieves **only** through existing authorised readers: `_composeToday`
(attention), owner workspace items (plans/commitments), `_kernelEvidence` at
`personal_assistance` (owner-only), `_assessmentKernelState`, `_checkinKernelState`. No raw store
assembly, no `_gatherSignals`. Retains basis IDs, purpose, visibility eligibility, confidence,
limitations.

## Action proposals (nothing auto-executes)
Each proposal: `{ id, actionType, capability, payload, visibility, why, requiredApproval,
policyResult, evidenceBasis }`. On confirm:
- **capture** (note/plan/commitment/reflection/observation) → the workspace-item capability
  (`buildItem` + `_interpretInput`) — the same path as `/api/workspace`.
- **calendar_draft** → the universal action contract, `recommend → draft` **only** (a calendar
  event changes external state, so it stays a draft awaiting execution; never auto-executed).
- **checkin_proposal** → a bounded personalised check-in registered in `checkinProposals`.

## Personalised check-in (bounded)
Created only with a real basis (a user follow-up request + a commitment / feedback-awaiting /
concern) — **never** solely because hardship was detected. Retains why, basis, trigger time,
sensitivity, expiration, and whether the topic may be referenced explicitly (sensitive topics are
referenced gently, never quoted). An active topic is not resurfaced. Generic fallback when
grounded context is thin.

## Response contract
`{ responseText, mode: insight|assist|combined, groundedClaims[], inferred[], limitations[],
proposedActions[], privacyNotice, followUpState }`. One coherent IntelliQ voice. It distinguishes
what the user said, what evidence supports, what is inferred, what is only a suggestion, and what
needs confirmation. Internal capability routing is not surfaced unless it helps the user approve.

## Frontend (minimal)
`MemberApp.assistantTurn/confirmProposal/correctProposal` route one composer through the unified
runtime, rendering the grounded response, confirmable proposals, and a clear privacy notice. No
separate Me/Plans/Notes/Work chat; no mandatory pre-input category selectors. The full composer UI
wiring is deferred to the interface slice.

## Tests
`scripts/assistant-runtime-smoke.js` (30 checks) proves all 21 invariants end-to-end + 2 auth
checks. Full truth layer green (assistant-runtime 30, assessment-presentation 23,
scenario-convergence 25, advisor 45, check-in 59, endpoints 222, all suites).

## Deferred (report)
Not in this slice: the composer UI redesign / lens rework; assigned-work-help routing (intent is
detected, no capability wired yet); calendar **execution** for members (draft only here); a
learning mechanism for repeated corrections (corrections are recorded, bounded, but do not yet
feed behaviour); external provider writes; the raw `memberResults` display-projection migration;
tutorials. The runtime can safely support these next — each new capability plugs into the same
turn → propose → confirm → action-contract path without a second assistant.
