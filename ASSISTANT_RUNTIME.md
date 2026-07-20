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
`{ responseText, mode: insight|assist|answer|combined, groundedClaims[], inferred[], limitations[],
proposedActions[], qa, privacyNotice, followUpState }`. One coherent IntelliQ voice. It distinguishes
what the user said, what evidence supports, what is inferred, what is only a suggestion, and what
needs confirmation. Internal capability routing is not surfaced unless it helps the user approve.

When the input carries a **question** intent, the turn answers it through the ONE
question-answering path — the hoisted helper `_assistantAnswer(code, userId, question)` — and
returns `qa: { answer, purpose, confidence, limitations, cites, bounded }`. The same helper backs the
`/api/workspace/ask` compatibility shim, so there is a single reasoning implementation, not a parallel
truth path. Work/org-scoped questions select `workspace_shared_reasoning` (private evidence excluded
before context); personal questions are owner-scoped. Answers are post-kernel bounded (cite only
authorised evidence, never raise confidence or drop limitations).

## The unified MyWorkspace interface (Slice 1 — UI)
One surface (`#iq-myworkspace`, mounted at the top of the member home) presents the runtime as a
single relationship, not a set of tools:

- **One persistent composer** (`#iq-composer-input` → `MemberApp.wsSend` → `assistantTurn`) posts
  every message to the same `POST /api/assistant/turn`. There is no per-lens or per-capability
  chat, and `wsSend` is the only conversation entry point (one thread, `#iq-conversation`).
- **Lenses are bounded context hints, not assistants.** The lens bar (`_wsLenses`:
  Today/Me/Work/Notes/Plans/History) sets `_wsActiveLens`, passed as `lens` on the turn. The server
  treats it as **emphasis only** — `_lensPrioritize` re-orders which proposal leads while the
  authorised context (`context.basisIds`, `context.purpose`) stays identical across lenses. Proven
  in the suite: today→`calendar_draft` leads, notes→`capture` leads, same basis.
- **Attention area (~3 items).** `_loadAttention` reads the existing authorised
  `GET /api/workspace/today` projection and renders a small set; each item routes **into** the same
  composer via `wsAttentionInto(text) → wsSend()`. It is not a second surface or truth path.
- **Response prioritisation.** `_renderAssistant` shows the grounded response, then
  `response.primaryActions` (≤ 2) as confirmable cards; the remainder sit behind a
  `More options` `<details>` from `response.moreActions`. One primary insight + a recommended action
  by default, extras folded away.
- **Confirmable proposal cards** expose **Confirm / Edit-Correct / Dismiss**. Confirm → runtime
  confirm path; Edit/Correct updates the *proposal* (not the original message); Dismiss hides it
  client-side without touching state. A visibility increase is refused (409) and only proceeds
  through an explicit `confirmVisibilityIncrease` confirmation.
- **Privacy is visible.** Cards carry `iq-badge-private` / share / `iq-badge-draft` badges;
  personal input is Private (only_me) by default, and calendar proposals are labelled draft-only
  (`draftOnly`), never presented as scheduled.
- **Personalised check-in card** (`_renderCheckinProposal`) exposes confirm / change-timing /
  generalise / reject, with no internal evidence IDs and generic fallback when grounded context is
  thin; an active topic is not resurfaced.

The legacy `#me-composer` (mood check-in → `/api/compose`) coexists during transition; its
consolidation into the unified composer is the next interface step (not this slice).

## Tests
`scripts/assistant-runtime-smoke.js` (30 checks) proves the runtime's 21 invariants + 2 auth checks.
`scripts/assistant-interface-smoke.js` (26 checks) proves the interface contract: every lens routes
through the one endpoint, lens is a bounded hint (identical basis, only emphasis reorders), one
IntelliQ identity/one composer/one thread, small prioritised set + More options, private-by-default,
calendar draft-only, confirm/correct/dismiss, explicit visibility-increase confirmation, generic
non-resurfacing check-in, and attention routing into the same conversation. Because there is no
browser harness in this repo, frontend contracts are proven by HTTP behaviour **plus static source
guards** over `js/member-view.js`/`index.html`/`css/member.css` — an honest limitation, not a live
DOM test. Full truth layer green (assistant-interface 26, assistant-runtime 30,
assessment-presentation 23, scenario-convergence 25, advisor 45, check-in 59, endpoints 222,
all suites).

## Deferred (report)
Not in this slice: navigation rebuild / DB-table renames; the `memberResults` raw
display-projection migration; tutorials migration; a second assistant endpoint; correction-based
profiling; member calendar **execution**; capability-specific AI chat. The `#me-composer` mood
check-in still coexists and its consolidation is the next interface step. Each future capability
plugs into the same turn → propose → confirm → action-contract path without a second assistant.

## Follow-up capability reports (out of scope for Slice 1)

**1. Member-authorised calendar execution policy.** Today a calendar proposal is draft-only:
`_CAPABILITIES.calendar` builds the action to the `recommend → draft` stage and stops; the card is
labelled `draftOnly` and never implies a scheduled event. Execution already exists in the action
contract (leaders/policy path) and is proven for the organisational flow, but member-initiated
execution needs an explicit member-authorisation policy: who may let IntelliQ write to their own
calendar, under what standing consent, with what per-event confirmation and revocation, and how a
draft transitions to `execute` without becoming an ambient background scheduler. Recommendation:
gate on an explicit per-user "allow IntelliQ to place drafts on my calendar" setting plus
per-event confirm, reusing the existing `require_approval` policy machinery — no new endpoint.

**2. Assigned-work assistance capability.** The runtime recognises assigned-work intent but the UI
holds a strict boundary: IntelliQ can help a member think/prepare but performs **no direct writes**
to assigned work (submissions, assessments, commitments owned by the org side). A future capability
could offer read-only situational help (what's due, what a rubric asks) and *propose* a
member-owned plan/commitment — still never writing the assessment record itself. It must route
through the same propose→confirm path, keep member-private by default, and never let the member's
assistant mutate org-owned assessment truth.

**3. Bounded preference learning from repeated corrections.** Corrections are recorded on the turn
artifact and applied to the *proposal only*; no permanent preference is inferred (invariant: a
single correction never becomes a standing profile). A bounded future mechanism could detect a
**repeated** correction pattern (e.g. the user consistently re-scopes captures to note, or narrows
visibility) and offer an explicit, reviewable, revocable default — proposed and confirmed, never
silently inferred, never derived from sensitive content, and always inspectable/erasable. Until
then corrections stay per-turn and non-behavioural.

**4. Remaining raw display-only legacy reads.** The unified surface reads only authorised
projections (`/api/workspace/today`, the assistant turn context). The legacy raw `memberResults`
display projection and the `#me-composer` mood path still exist as read/display surfaces during
transition; they were intentionally **not** migrated (minimal-migration constraint) and do not feed
the assistant's truth path. Next-step consolidation folds the mood composer into the unified
composer and retires the raw display projection once the canonical projection covers its fields.
