# Phase 1 — Finish the OS: Completion Proof

Engineering proof that IntelliQ OS **V1 is complete**. Every architecture promise below is verified
with its implementation and the tests that lock it. This is not marketing — each row is falsifiable and
covered by the truth layer (`npm test`, 34 suites, all green).

Cuts A–G are shipped: **A** duplicate composer, **B** question-answering, **C** Studio,
**D** me-composer/check-in, **E** Individual Advisor, **F** memberResults decision reads,
**G** navigation convergence.

## Architecture promises (verified)

| Promise | Status | Implementation | Proof / tests |
|---|---|---|---|
| **One assistant identity** | ✅ | The unified IntelliQ assistant; no Studio / Advisor / me-composer / per-item chat identities exist | `assistant-interface-smoke` guards (no studio/advisor composer or endpoint; one IntelliQ voice) |
| **One composer** | ✅ | `#iq-myworkspace` / `#iq-composer-input` → `wsSend` — the only member text entry | interface P1/C/D/E static guards; `#me-composer` + old MyWorkspace + Studio + Advisor composers removed |
| **One conversation** | ✅ | One thread `#iq-conversation`; `async wsSend` is the single entry point | interface guard: exactly one `async wsSend` |
| **One assistant runtime** | ✅ | `_assistantTurn` — the single turn pipeline (interpret → context → kernel → response → proposals) | `assistant-runtime-smoke` (30); no per-lens/per-capability runtime |
| **One question-answering path** | ✅ | `_assistantAnswer`; `/api/workspace/ask` is a thin shim over it | interface P1(B): shim and turn return the SAME answer |
| **One check-in path** | ✅ | `_recordCheckin` (canonical check-in capability); `/api/compose` deleted | interface D-suite; `checkin-migration` (59) + `checkin-hardening` (26) |
| **One assigned-work assistance path** | ✅ | `_assignedWorkContext` + `assigned_work_*` intents → `submit_work` via `_submitAssignment` | interface C-suite (authorised context, no-write-before-confirm, one capability) |
| **One leader-support path** | ✅ | `_leaderSupportTurn` reusing `_advisorKernelReasoning`; `/api/advisor/:id/ask` + `ADVISOR_SYSTEM` deleted | interface E-suite; `advisor-migration` (45) unchanged |
| **One proposal system** | ✅ | `_assistantProposals` → `POST /turn/:id/confirm` (capture · calendar_draft · checkin_proposal · checkin_log · submit_work) | runtime + interface suites; duplicate-confirm rejected (409) |
| **One execution model** | ✅ | Nothing executes without an explicit confirmed proposal; confirm routes to the existing capability | runtime "nothing saved before confirmation"; interface C6/D6 |
| **One navigation authority** | ✅ | `navigate()` + `NAV_ROUTES`/`NAV_ALIASES`; `switchTab` + 2nd binder removed | interface G-suite (real `navigate()` evaluated: alias→canonical, unknown→Home, context clear) |
| **One truth path** | ✅ | Canonical evidence via authorised readers only; every capture converges to canonical | `evidence-smoke`, `legacy-convergence-smoke`, `private-evidence-smoke` |
| **Canonical evidence only** | ✅ | OS decision paths read `_canonicalContext`/`_kernelEvidence`/`_assessmentKernelState`; **no memberResults** | interface **F guard**: 11 OS functions contain zero `memberResults` |
| **Kernel-first reasoning** | ✅ | `_recordKernelDerivation` retains basis IDs; post-kernel `_composeForAudience` bounds cites | `reasoning-boundaries-smoke` (14); advisor-migration kernel checks |
| **Privacy preserved** | ✅ | Private owner-only excluded before leader context; sensitive informs-not-quoted; no existence leak | `private-evidence-smoke` (18); advisor-migration (45); interface E9/E8 |
| **Explicit confirmation for writes + visibility increases** | ✅ | Writes only on confirm; a visibility increase needs `confirmVisibilityIncrease` (409 otherwise) | runtime "visibility cannot increase without explicit confirmation"; interface guards |

## Legacy removed (retired components)

| Component | What it was | Retired in |
|---|---|---|
| Duplicate MyWorkspace composer (app.js `MyWorkspace`) | a 2nd composer surface | Cut A |
| `/api/workspace/ask` **runtime** | a 2nd question-answering reasoning path | Cut B (now a thin shim over `_assistantAnswer`) |
| Studio assistant (`/api/studio`, `/studio/chat`, `/studio/plan`) + frontend chat | a 2nd conversational identity/thread | Cut C |
| Per-assessment discussion (`/api/assessments/:id/discuss`) | a per-item chat shell | Cut C |
| `me-composer` + `/api/compose` **runtime** | a 2nd mood/capture path | Cut D (folded into `_recordCheckin`) |
| Individual Advisor (`/api/advisor/:memberId/ask`) + `ADVISOR_SYSTEM` prompt + Advisor composer | a 2nd assistant identity/runtime/prompt | Cut E (folded into `_leaderSupportTurn`) |
| Duplicate navigation (`MemberApp.switchTab`, 2nd DOMContentLoaded nav binder) | a 2nd nav alias layer | Cut G |
| `_buildAdvisorContext` (177 lines) | legacy **raw-store** reasoning reader (result mirrors + raw check-ins + legacy memory) | Cut F (profile digest now canonical) |
| `launchMemberView`, `_memberErrorHTML` | dead frontend shims (no callers) | Cut F sweep |
| Studio conversation helpers (`_studioThread`, `_studioMemoryContext`) | live 2nd-conversation state | Cut C (`studioThreads` kept read-only archive) |

Retired identities cannot be reached or resurrected: navigation has **no** studio/advisor destinations
or aliases; the deleted endpoints 404; static guards fail the build if a second composer/router/identity
is reintroduced.

## Remaining intentional limitations (deliberate scope, not debt)

- **Attachment upload UI deferred** — the ingestion functions (`_extractMetricsFromText`,
  `_importTeamTable`, office parsing) are preserved and capability-tested; their upload surface is
  deferred for re-wiring onto the unified composer.
- **Voice UI deferred** — `ai.transcribe` retained; the Studio voice control was removed.
- **Leader team-import UI deferred** — `_importTeamTable` preserved; leader-side re-wire is post-Phase-1.
- **Browser harness absent** — no DOM/E2E harness in the truth layer; frontend contracts are proven by
  HTTP behaviour + static source guards + evaluating real routing logic in a stubbed scope. Honest, but
  not a live DOM test.
- **Leader-support narrative is deterministic** — the leader-support answer is a grounded summary of the
  canonical kernel citable tier (no separate AI persona). Removing the `ADVISOR_SYSTEM` persona was
  intentional; a unified-identity narrative would require an async model call, out of Phase-1 scope.
- **Proactive intelligence intentionally absent** — the OS is reactive by design in V1.
- **Preference learning intentionally absent** — corrections stay per-turn and non-behavioural.

## Remaining technical debt (genuine — with why / impact / removal plan)

1. **Legacy leader/org analytics still read the canonicalised `memberResults` mirror.**
   - *Where:* `_aggregateOrgData` (org-insights / patterns / predictions) and `_measureInterventionOutcome`
     (intervention-outcome loop). Both labelled `TECH DEBT (Cut F)` in source.
   - *Why it exists:* these predate the canonical-evidence migration and were **not** part of the assistant
     OS; migrating them is a data-source swap across a wide, test-locked leader/management surface
     (`intelligence-smoke`, `eval`, `reasoning-boundaries`, interventions) — a change the "do not redesign"
     constraint excludes from Phase 1.
   - *Impact:* bounded — `memberResults` is **fully canonicalised** (`_canonicaliseScenarioResult`), so these
     read the same data via the legacy mirror, not a divergent source. They do **not** feed the assistant,
     leader-support, check-in or assigned-work paths (proven by the F guard). No user-facing divergence.
   - *Removal plan:* in pilot hardening, add a canonical assessment reader and repoint both functions to it,
     gated by the intelligence/eval/intervention suites; then delete the `memberResults` store reads and
     retire the mirror once the display/export routes are re-sourced.

2. **`memberResults` display/export mirror retained (archive/read-only).**
   - *Where:* `/api/platform/member-results`, `/api/platform/org-results`, `/api/me/export`,
     `/api/member/submit-result` (mirror write). All labelled `ARCHIVE / READ-ONLY (Cut F)` / `LEGACY MIRROR`.
   - *Why:* raw historical results are still shown/exported for leaders and members. Permitted by the rule
     ("historical display… archive/read-only… cannot influence reasoning").
   - *Impact:* none on reasoning — pure display/export of verbatim records.
   - *Removal plan:* re-source these views from the canonical assessment projection in a later cut, then
     drop the `memberResults` store entirely (deletion + persistence plumbing remain until then).

## Test evidence

Full truth layer **GREEN** — 34 suites, ~967 assertions, run by `npm test` (no DB, no AI key; hermetic).

| Layer | Suite(s) | Assertions |
|---|---|---|
| Truth layer (all) | `scripts/test.js` | 34 suites green |
| Assistant runtime | `assistant-runtime-smoke` | 30 |
| Assistant interface (+ Cuts A–G + F guard) | `assistant-interface-smoke` | 90 |
| Advisor / leader-support privacy | `advisor-migration-smoke` | 45 |
| Assessment | `workspace-assessment` · `assessment-consumption` · `scenario-convergence` · `assessment-presentation` | 30 · 16 · 25 · 23 |
| Check-in | `checkin-migration` · `checkin-hardening` | 59 · 26 |
| Endpoint (HTTP authz + surfaces) | `endpoint-smoke` | 217 |
| Migration / evidence / privacy | `legacy-convergence` · `evidence` · `private-evidence` · `reasoning-boundaries` | 12 · 21 · 18 · 14 |

**Honest limitation of the evidence:** frontend behaviour is proven by HTTP + static guards + stubbed-scope
evaluation of the real routing logic, not a live browser/DOM harness. Adding one is a pilot-hardening item.
