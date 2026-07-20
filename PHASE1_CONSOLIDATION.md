# Phase 1 — Finish the OS (legacy consolidation)

**Goal (frozen architecture, pilot-hardening):** exactly one assistant, one runtime, one
truth path, one proposal system, one execution pathway, one kernel truth path. Remove every
legacy surface that duplicates or bypasses the unified assistant runtime, *where safe*, and
document any coexistence that must remain temporarily.

This is a **sequence of small, individually-tested commits**, not one rewrite — each answers the
pilot question ("would this make a customer trust and rely on IntelliQ every day?"). The audit
below is the map; the checklist is the order.

## Audit — what still bypasses/duplicates the unified runtime

| # | Legacy surface | Where | Duplicates / bypasses | Risk to cut |
|---|----------------|-------|-----------------------|-------------|
| A | **Old `MyWorkspace` composer** (app.js) | `js/app.js` object + `navigate('assessments')` | A 2nd composer (`mw-input`, own lenses, `ask`, `capture`) twinning the unified `#iq-myworkspace` on Home | **done** ✅ |
| B | **`/api/workspace/ask`** rule-based Q&A | `server.js:7524` | A 2nd question-answering *truth path* parallel to `_assistantTurn` (own work-scope detection + private-inventory answers) | **done** ✅ |
| C | **Studio** chat surface | `/api/studio*` (server) + `_studioHtml`/`_renderAssessments` (member-view) | A 2nd conversational assistant identity + thread for assigned work | high — 78 refs; assigned-work help must move into the one assistant under the assigned-work boundary (recognise intent, no direct writes) |
| D | **me-composer** (mood) | `/api/compose` (server) + `#me-composer` (index.html) + `member-view.js:526` | A 2nd capture path (mood/"what happened") outside the unified turn | **done** ✅ |
| E | **Individual Advisor AI** | `/api/advisor/:memberId/ask` + threads; app.js profile modal | A 2nd chat surface (leader→member). Already canonical (kernel + post-kernel, 45 tests) but still a separate thread/identity | medium — fold the leader "ask about member" into the one runtime with a leader audience, preserving privacy guarantees |
| F | **`memberResults` raw display projections** | `server.js` (several reads) | Display reads that bypass the canonical assessment projection | low/medium — display-only; retire once the canonical projection covers the fields (see ASSISTANT_RUNTIME.md report 4) |
| G | **Two nav systems** | app.js `navigate()` + `MemberApp.switchTab` pageMap | Parallel routers that disagreed about what `assessments` shows | low — converge routing once surfaces A–D are unified |

## Non-goals (unchanged from the frozen architecture)
Do **not** redesign the kernel/evidence/action contracts, add parallel systems, rename DB tables,
or add bespoke capability logic. Consolidate onto the canonical implementation only.

## Ordered checklist

- [x] **A — remove the duplicate member composer.** Delete the old `MyWorkspace` app.js object
  (222 lines); route the "MyWorkspace" nav slot to `MemberApp._renderAssessments()` (the assigned-work
  surface). Result: one composer/one runtime on Home ("Me"). Guarded by `assistant-interface-smoke`
  (P1 checks). **Shipped.**
- [x] **B — fold `/api/workspace/ask` into the one question-answering path.** Extracted the Q&A
  reasoning into a single hoisted helper `_assistantAnswer(code, userId, question)` (work-scope purpose
  selection + grounded private-inventory / what-changed / focus / stuck answers, post-kernel bounded).
  BOTH the unified `_assistantTurn` (when the input carries a `question` intent → `response.qa`) and the
  `/api/workspace/ask` endpoint (now a thin shim) call it — one reasoning implementation, one truth path.
  Guarded by `assistant-interface-smoke` (the shim and the turn produce the SAME answer; work-scoped
  questions exclude private evidence). `workspace-experience-smoke` stays green unchanged. **Shipped.**
- [x] **D — absorb the me-composer mood/check-in into the unified turn.** Current-state language in
  the one composer now yields a confirmable **"Log this as today's check-in?"** proposal
  (`actionType: checkin_log`); on confirm it executes the **canonical check-in capability**
  (`_recordCheckin`, extracted from the old compose body) — same store, participation signal,
  canonical evidence, person-model update and acknowledgement. `/api/compose` is **deleted** and
  `#me-composer` + its handlers (`composeSubmit/composeMood/composeVoice`) removed; member text entry
  is the one `#iq-myworkspace` composer. See the Cut D section below. **Shipped.**
- [ ] **C — fold Studio into the one assistant.** Assigned-work help routes through `_assistantTurn`
  under the assigned-work boundary (recognise intent, propose member-owned plans, **never** write the
  org-owned assessment record). Retire `/api/studio/chat` as a separate conversation; keep assigned-work
  *cards* as attention/context.
- [ ] **E — fold the Individual Advisor into the one runtime** with a leader audience, preserving the
  canonical evidence + kernel + post-kernel privacy guarantees the 45 advisor tests lock in.
- [ ] **G — converge the two nav routers** once A–E land; one page router, permission-based.
- [ ] **F — retire remaining `memberResults` raw display reads** once the canonical projection covers them.

## Cut D — me-composer / mood check-in (detail)

**Removed (legacy):**
- `#me-composer` DOM block in `index.html` (mood faces + textarea + Add/Voice + response slot).
- `MemberApp.composeMood / composeSubmit / composeVoice` and `_composerMood` in `js/member-view.js`.
- The `POST /api/compose` route (**deleted** — no external/compatibility caller remained; the only
  production caller was `#me-composer`).

**Preserved (capability):** the entire check-in pipeline, extracted verbatim into one internal
function **`_recordCheckin(code, userId, {text, mood})`** (server.js): store `memberCheckins` →
contentless participation signal → `_canonicaliseCheckin` (canonical evidence; hardship stays
owner-only-private) → `_updateUserMemory` (person model) → grounded/AI-optional acknowledgement +
"noticed". No reasoning or side effect is duplicated anywhere.

**One path to a check-in:** current-state language → bounded interpretation (`checkin_log` intent) →
confirmable proposal (`_assistantProposals`) → `POST /confirm` → `_recordCheckin` → canonical
evidence/person model → single outcome (`acknowledgement` + `noticed`) returned into the one thread.
No server-side HTTP self-call; no mood-specific alternate runtime.

**Compatibility route decision:** **deleted** (`Preferred`). Tests seed check-in fixtures by calling
`_recordCheckin` directly; user-behaviour is tested through the assistant-turn → confirm flow. The
retired route now 404s (asserted). No thin shim retained (nothing to preserve), so there is exactly
one way to record a check-in.

**Bounded interpretation (inspectable, not an unbounded guess):** `_assistantInterpret` distinguishes
current first-person self-report (→ propose) from historical / hypothetical-general / third-party /
quoted-or-reported / advice-request-mentioning-emotion (→ no proposal), and honours an explicit
"log this" (→ immediately confirmable). Regex-based, confidence-bearing, with an `ambiguity` note on
non-explicit proposals. **Limitation (documented honestly):** free-text state detection is heuristic
and deliberately conservative — it declines to propose when intent is uncertain, and a genuine
current-state message can be missed (the member can always type an explicit "log this").

**Privacy preserved:** check-ins are private by default (`only_me`); visibility increases still require
`confirmVisibilityIncrease`; a **sensitive/urgent disclosure is answered supportively and is NOT
reduced to a logging card** (the `checkin_log` proposal is suppressed unless the user explicitly asks
to log); hardship stays owner-only-private canonical evidence and never leaks to leader/org reasoning
(unchanged — proven by `checkin-migration`, `checkin-hardening`, `endpoint-smoke` leader redaction).
No numeric mood is manufactured from free text (`mood: null` unless explicitly provided).

**Corrections:** Confirm / Edit-Correct / Dismiss preserved. Editing a `checkin_log` updates the
**proposed record** (`payload.textOverride` / `proposedRecord.text`), never the original message;
"not today / cancel" removes it. Duplicate submission is blocked by the proposal `confirmed` guard
(≤ once → no double write; regression-tested).

**Test evidence:** `assistant-interface-smoke` 32 → **46** (D4–D14 + duplicate-submit + exactly-once +
sensitive-not-logged + explicit-immediate). `endpoint-smoke` 222 → **223** (route 404 + capability
seed). `checkin-migration` (59) and `checkin-hardening` (26) unchanged and green. Full truth layer green.

## Coexistence still in place (documented debt)
- `/api/workspace/ask` (server) — a **thin shim** over the one `_assistantAnswer` helper (cut B);
  no parallel reasoning remains. Retire once no client depends on the legacy `{answer,…}` shape.
- Studio (`/api/studio*`) — assigned-work chat; folds in cut C (**not in this slice**).

Every proactive/learning capability (Phases 2–3) is built **only after** the truth path is single —
a proactive insight that could be generated by two different runtimes is not trustworthy.
