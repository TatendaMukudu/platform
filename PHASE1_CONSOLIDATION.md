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
| C | **Studio** chat surface | `/api/studio*` (server) + `_studioHtml`/`_renderAssessments` (member-view) | A 2nd conversational assistant identity + thread for assigned work | **done** ✅ |
| D | **me-composer** (mood) | `/api/compose` (server) + `#me-composer` (index.html) + `member-view.js:526` | A 2nd capture path (mood/"what happened") outside the unified turn | **done** ✅ |
| E | **Individual Advisor AI** | `/api/advisor/:memberId/ask` + threads; app.js profile modal | A 2nd chat surface (leader→member). Already canonical (kernel + post-kernel, 45 tests) but still a separate thread/identity | **done** ✅ |
| F | **`memberResults` raw display projections** | `server.js` (several reads) | Display reads that bypass the canonical assessment projection | low/medium — display-only; retire once the canonical projection covers the fields (see ASSISTANT_RUNTIME.md report 4) |
| G | **Two nav systems** | app.js `navigate()` + `MemberApp.switchTab` pageMap | Parallel routers that disagreed about what `assessments` shows | **done** ✅ |

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
- [x] **C — fold Studio into the one assistant.** Removed the Studio conversational assistant (routes
  `/api/studio`, `/studio/chat`, `/studio/plan/:id`, and the per-item `/api/assessments/:id/discuss`
  chat) and its frontend chat UI. Assigned work is now **authorised context + records**: the unified
  `_assistantTurn` reads `_assignedWorkContext` (own work, released-fields-only), gives grounded
  **assistance** (explain/status — no writes), and offers a confirmable **`submit_work`** proposal
  executed by the existing `_submitAssignment` capability — the assistant never writes assessment truth.
  See the Cut C section below. **Shipped.**
- [x] **E — fold the Individual Advisor into the one runtime** with a leader audience. A
  server-validated `subjectMemberId` on `/api/assistant/turn` → `_leaderSupportTurn`, which reuses the
  **unchanged** `_advisorKernelReasoning` kernel + `_composeForAudience(leader_support)` post-kernel
  bound. The separate `/api/advisor/:memberId/ask` route, the `ADVISOR_SYSTEM` persona prompt, and the
  Advisor composer are removed; the 45 privacy tests are preserved. See the Cut E section below. **Shipped.**
- [x] **G — converge the navigation into one canonical authority.** `navigate()` (app.js) is the sole
  router: a validated `NAV_ROUTES` destination map + `NAV_ALIASES`, one renderer owner per destination,
  fail-safe to Home for unknown/retired destinations, and transient assistant-context (member subject +
  assigned-work target) cleared on every navigation. The dead `MemberApp.switchTab` alias and the
  redundant second nav binder are removed. See the Cut G section below. **Shipped.**
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

## Cut C — Studio / assigned work (detail)

**Removed (assistant identity / conversational shells):**
- Studio routes `GET /api/studio` (greeting/thread/proactive), `POST /api/studio/chat` (the coach
  runtime), `POST /api/studio/plan/:id` — a second assistant identity + composer + conversation.
- The per-item `POST /api/assessments/:id/discuss` — a second conversational shell on each assignment.
- Frontend: `_studioHtml` + all `_studio*` chat handlers; the per-item `assess-conv` chat +
  `_assessDiscussSend`. `_renderAssessments` now renders records only (`_assessHtml`).
- Studio-conversation helpers `_studioThread` / `_studioMemoryContext`. The `studioThreads` store is
  **retained as a read-only archive** (load/save intact; not surfaced as a live conversation — no
  migration that changes authorship, timestamps, privacy, or work-item association).

**Preserved (genuine capability):**
- Assessment records + lifecycle: `/api/assessments` (list, role-scoped track record), `draft`,
  `plan`, `templates`, `assign`, `:id/submit`, `:id/return`, `:id/presentation`, `:id/summarize`
  (leader review) — untouched.
- **`_submitAssignment(code, userId, id, {response, note})`** — extracted from the submit route so the
  route AND the assistant's `submit_work` proposal share ONE validated, authorised, append-only write
  (never blanks an existing response). Canonicalisation happens exactly once.
- Data-ingestion functions `_extractMetricsFromText` / `_importTeamTable` and the office/`ai.transcribe`
  utilities are preserved (now exported, capability-tested directly).
- `_studioMemberRead` — an authorised self-read, reused by the check-in acknowledgement (kept).

**Authorised assigned-work context** — `_assignedWorkContext(code, userId, workItemId?)`: the member's
OWN assignments only; feedback/score included ONLY once released (status `returned`); a foreign/unknown
work-item id yields no items (no leak). Basis IDs = the authorised assignment ids. Owner-scoped,
inspectable, released-fields-only. Carried on the response as a bounded `assignedWork` extension, not a
second top-level contract.

**Assistance vs. action:**
- *Assistance (no confirmation)* — `assigned_work_help` intent + authorised context → a grounded
  explanation (`_assignedWorkExplain`) of instructions/criteria/status/**released** feedback+score.
  Ambiguous target (>1 item, none focused) → the turn asks which one (follow-up), never guesses.
- *Action (proposal + confirm)* — `assigned_work_submit` intent + an unambiguous item → a `submit_work`
  proposal stating the exact effect (work item, what is submitted, resulting status, review triggered,
  not reversible, validation if nothing saved). Confirm → `_submitAssignment`. The confirmed-guard makes
  it at-most-once (no duplicate submission).

**No-direct-writes boundary:** the assistant response generator never writes assessment truth
(definitions, criteria, scores, feedback, approval, completion). Only the existing capability, via an
explicit confirmed proposal, persists a change. No `edit_assignment` / `set_score` / `approve` proposal
type exists.

**Draft / save / submit distinction:** the assessment model has no separate *draft* store — a member
fills the response fields (record UI) and submits. The assistant may *generate* draft text in the thread
(assistance, clearly not saved/submitted); saving-as-you-go is out of model, so **no `save_draft`
proposal is fabricated** (documented, not invented). Submitting is the only write, and only via the
`submit_work` proposal. `submit_work` submits the member's **existing saved response** (never blanks it).

**Deferred (documented interface exceptions — capability preserved, presentation removed):**
- **Attachment ingestion UI + voice** (member evidence upload, `/studio/transcribe`): the Studio upload
  surface is gone; `_extractMetricsFromText` / office parsing / `ai.transcribe` remain as functions to be
  re-wired as an authorised attachment capability on the unified composer. Not pretended-consolidated.
- **Leader team-import UI** (`_importTeamTable`): the function is preserved and tested; its upload entry
  point is **leader-side, deferred to Cut E** (leader consolidation), not this member-facing slice.
- **Legacy Studio conversations**: retained as a read-only data-layer archive (`studioThreads`), not
  surfaced; no live second conversation kept.

**Test evidence:** `assistant-interface-smoke` 46 → **62** (authorised context, explain-no-write,
released-only feedback/score, foreign-id-no-leak, submit-proposal-effect, no-write-before-confirm,
capability-exec, duplicate-submit rejection, existing-response-not-blanked, org-truth-immutable,
stale-context regression, static guards). `endpoint-smoke` 223 → **217** (Studio transport removed;
discuss authorisation migrated to the unified turn; metric-extraction + team-import migrated to
capability-level; office round-trip kept). All assessment/privacy suites green.

## Cut E — Individual Advisor / leader support (detail)

**Removed (assistant identity):**
- `POST /api/advisor/:memberId/ask` — the separate Advisor route/runtime.
- `ADVISOR_SYSTEM` — the "You are the Individual Advisor" persona prompt (a separate identity).
- Frontend Advisor composer: `askAdvisor`, `renderAdvisorChips`, `setAdvisorQuestion`,
  `_renderAdvisorAnswer`, `ADVISOR_CHIPS`, and the profile-modal Advisor input/chips/response.

**Preserved (kernel + privacy — unchanged):**
- **`_advisorKernelReasoning`** — the leader-support kernel: retrieves ONLY leader-authorised canonical
  evidence via `_canonicalContext({purpose:'leader_support', viewerId, subjectId})` (private excluded
  upstream), reconstructs a **directional trajectory** (never a score), tiers evidence
  (citable / informing-not-quoted / private-excluded), retains basis IDs + confidence + limitations.
- `_composeForAudience(purpose:'leader_support')` post-kernel bound (cites only authorised evidence,
  never raises confidence or drops limits) and `privacy.redact` defence-in-depth. **All 45
  advisor-migration privacy tests pass unchanged** (they exercise the kernel + post-kernel directly;
  only the 4 route-source checks were re-pointed at `_leaderSupportTurn`, assertions un-weakened).

**Unified runtime path** — `_assistantTurn(…, {subjectMemberId})`: when a subject id is present it is
validated by **`_resolveLeaderSubject`** (org membership · active org · requester's visible scope ·
`view_insights`/`review_checkins`/superadmin) and, on success, routed to `_leaderSupportTurn`
(mode `leader_support`, canonical response contract: grounded claims from the kernel citable tier,
directional `inferred`, `limitations`, empty `primaryActions`, a leader-support `privacyNotice`,
`subject` metadata, post-kernel `cites`). A separate `_assistantAdvisorAnswer` end-to-end runtime was
**not** created; the kernel differs by reasoning task, the identity and response contract do not.

**Explicit subject-context model** — one identity, explicit context (not an invisible audience switch):
- The subject is set ONLY from an authorised entry point (`MemberApp.askAboutMember(id, name)` from the
  member profile's "Ask IntelliQ"), carried as `subjectMemberId`, and **revalidated server-side every
  turn** — a frontend id is never trusted.
- A visible **member chip** (`#iq-subject`) shows the active subject + "answers use only what you're
  authorised to see" + an **Exit** control. Never silently active.
- The subject is **cleared on fresh Home render and on lens change**; a general turn (no subject) is
  `personal_assistance` and can never reuse a stale member. A subject is **never inferred** from
  pronouns, page history, or stale state.

**No existence leak** — unknown / unauthorised / cross-org / no-permission subjects ALL return the same
`unavailable` response with no context, so the reply cannot reveal whether a member exists or is in scope.

**No-direct-writes** — a leader question is assistance-only (empty proposals). It never creates
feedback, interventions, assessments, notes, calendar events, or visibility changes. (The former
Advisor route auto-recorded a derived-evidence artifact on every ask; the unified leader-support turn
**does not** — a tightening toward pure assistance. Consequential leader actions keep their existing
proposal pathways.)

**History** — legacy `advisorThreads` are retained as a **read-only archive**: `GET /api/advisor/
:memberId/threads` (authorised by visible scope, no reasoning) still serves them, surfaced as "Past
IntelliQ support notes (archive)" in the profile. New leader-support turns live in `assistantTurns`
with explicit `audience:'leader'`, `purpose:'leader_support'`, `subjectMemberId` metadata — subject
and audience boundaries retained; no records merged or rewritten.

**Deferred (leader-side, not this cut):** leader team-import UI and leader assessment management remain
as-is (they do not depend on the Advisor runtime); their interface work stays deferred and documented.

**Test evidence:** `assistant-interface-smoke` 62 → **79** (E1–E17 + regressions: leader_support via the
one endpoint, canonical contract, directional-not-score, private-never-leaks, assistance-only,
server-validated subject, cross-org/unknown no-leak-parity, A→B no bleed, general-turn-no-stale-subject,
pronoun-no-subject-no-leak, static guards). `advisor-migration-smoke` **45/45** preserved. Full truth
layer green.

## Cut G — navigation convergence (detail)

**Routers identified:** `navigate(page)` (app.js) was already the primary dispatcher; the only other
"router" was `MemberApp.switchTab` (a dead old-bottom-nav alias layer, **no callers**) plus a redundant
second nav-item click binder at DOMContentLoaded (the sidebar is empty until it renders, so it bound
nothing). Navigation uses **no** location hash / history / query-string for page routing (hashes are used
only by the auth/invite flow); the "mobile" nav is the **same** `#sidebar-nav` as desktop (a drawer with
a `.open` class) — so there is **one** destination map for both.

**Canonical router selected:** hardened `navigate()` into the single authority:
- `NAV_ROUTES` — the one destination → renderer map (one owner per destination, arrow-wrapped).
- `NAV_ALIASES` — legacy folds (`org-insights` → `leader-home`, `group-health` → `leader-home`)
  resolved to the ONE canonical destination (no second renderer, no duplicate state).
- **Validate → fail safe:** an unknown / unavailable / retired destination resolves to **Home** (never a
  blank container, never a resurrected Studio/Advisor identity); a renderer error also falls back to Home.
- **One-authority state:** `navigate()` alone updates `.page`/`.nav-item` active classes, the topbar
  title, `AppState.currentPage`, and closes the mobile drawer.

**Duplicate logic removed:** `MemberApp.switchTab` (dead) and the second DOMContentLoaded nav binder.
The one dynamic, permission-filtered binder (where `#sidebar-nav` renders) delegates to `navigate()`.

**Destination & alias map:** My Space (`home`, `assessments`, `apps`, `checkin`, `notes`, `inbox`,
`stats`); Leader (`leader-home`, `leader-people`, `leader-groups`, `data-sources`, `assignments`);
Management (`org-health`, `analytics`, `intelliq`, `scenarios`, `organisation`, `people`, `alerts`,
`reports`, `settings`); legacy dashboards (`dashboard`, `members`). Aliases: `org-insights`,
`group-health` → `leader-home`. **No** `studio` / `advisor` destination or alias exists — retired
assistant identities cannot be reached or resurrected through navigation.

**Context lifecycle (one place):** every `navigate()` clears the member-support **subject**
(`clearSubject()`) and the assigned-work **target** (`_wsWorkItemId`) BEFORE rendering, so a general turn
can never act on a stale member/work context. Explicit entry points (`askAboutMember` / `askAboutWork`)
navigate first, then set their context — surviving the clear. `_renderMyWorkspace` also clears defensively
on fresh render. Lens change clears the subject (Cut E). Unconfirmed proposals follow the existing
proposal lifecycle (a proposal only executes on explicit confirm; navigating away never executes it).

**Permissions:** frontend nav **visibility** already uses capability/permission checks
(`Auth.canDo(mod.permission)` + `Auth.isLeaderNode()` over `WORKSPACE_MODULES`); server-side enforcement
of data/actions is unchanged and authoritative. `navigate()` was not given new authorisation power
(visibility ≠ authorisation); access was not broadened. Unknown/unavailable destinations reveal nothing
(fail to Home).

**Mobile/desktop:** one markup (`#sidebar-nav`), one destination map, one dispatcher — mobile is the same
drawer; closing it does not clear or duplicate context (context clearing is owned by `navigate()`).

**Remaining `memberResults` dependencies reserved for Cut F (NOT migrated here):**
- Backend `memberResults` reads still back the leader-facing **member profile** display
  (`GET /api/member/:memberId/profile`, app.js `loadBehavioralProfile` ~app.js:4817) reached from the
  `people` / `leader-people` / `members` destinations, and the leader `GET /api/platform/member-results`
  view. The canonical router **reaches** these display surfaces but their data source is untouched — this
  is the precise migration map for Cut F. No `memberResults` read was changed in this cut.

**Test evidence:** `assistant-interface-smoke` 79 → **86** — the real `navigate()` + `NAV_ROUTES`/
`NAV_ALIASES` evaluated in a stubbed scope (alias→canonical, unknown→Home fail-safe, every-navigation
clears subject+work), plus static guards (one `navigate()`, no `studio`/`advisor` destinations, `switchTab`
gone, one nav binder). Full truth layer green.

**Limitations (honest):** no browser harness — DOM-level behaviour (active classes, drawer close, focus)
is proven by evaluating the real routing logic in a stubbed scope + static guards, not a live DOM.
Deep-link/Back-Forward page routing is intentionally **not** added (the app has never used hash/history
for pages; auth/invite hash handling is unchanged). Role-string checks outside navigation
(e.g. shell selection `role === 'member'` in `launchApp`) are unchanged — they are not navigation
destinations and were out of scope.

## Coexistence still in place (documented debt)
- `/api/workspace/ask` (server) — a **thin shim** over the one `_assistantAnswer` helper (cut B);
  no parallel reasoning remains. Retire once no client depends on the legacy `{answer,…}` shape.
- Attachment-ingestion UI + voice, and leader team-import UI — capabilities preserved as functions,
  their entry points deferred (see Cut C / Cut E deferred exceptions).
- `studioThreads` and `advisorThreads` — read-only archives of legacy Studio / Advisor conversations
  (served read-only, no live runtime).

Every proactive/learning capability (Phases 2–3) is built **only after** the truth path is single —
a proactive insight that could be generated by two different runtimes is not trustworthy.
