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
| D | **me-composer** (mood) | `/api/compose` (server) + `#me-composer` (index.html) + `member-view.js:526` | A 2nd capture path (mood/"what happened") outside the unified turn | medium — mood capture must be absorbed by the runtime, not dropped |
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
- [ ] **D — absorb the me-composer mood capture into the unified turn.** Move optional mood /
  "what happened" into the one composer's interpretation → proposal path; retire `#me-composer` and
  `/api/compose`'s duplicate capture. Keep the check-in intelligence pipeline intact.
- [ ] **C — fold Studio into the one assistant.** Assigned-work help routes through `_assistantTurn`
  under the assigned-work boundary (recognise intent, propose member-owned plans, **never** write the
  org-owned assessment record). Retire `/api/studio/chat` as a separate conversation; keep assigned-work
  *cards* as attention/context.
- [ ] **E — fold the Individual Advisor into the one runtime** with a leader audience, preserving the
  canonical evidence + kernel + post-kernel privacy guarantees the 45 advisor tests lock in.
- [ ] **G — converge the two nav routers** once A–E land; one page router, permission-based.
- [ ] **F — retire remaining `memberResults` raw display reads** once the canonical projection covers them.

## Coexistence still in place (documented debt)
- `/api/workspace/ask` (server) — now a **thin shim** over the one `_assistantAnswer` helper (cut B);
  no parallel reasoning remains. The endpoint can be retired entirely once no client depends on the
  legacy `{answer,…}` shape.
- `#me-composer` + `/api/compose` — mood capture; folds in cut D.
- Studio (`/api/studio*`) — assigned-work chat; folds in cut C.

Every proactive/learning capability (Phases 2–3) is built **only after** the truth path is single —
a proactive insight that could be generated by two different runtimes is not trustworthy.
