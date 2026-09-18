# IntelliQ — Monday Closure Handoff

Status: implementation handoff from build branch after founder UX review, 2026-09-18.
Baseline after safe edits: `codex/pilot-recovery-gate-r7` at or after `89426b4`.

Read `docs/rnd/CONVERSATIONAL_PRODUCT_LAW.md` first. This file is deliberately a narrow implementation map, not a second product specification.

## Already changed safely

The redundant bucket-level **Start a focus** control was removed from `js/app.js`. Focus creation remains available through the Composer/canonical `create_focus` owner. Do not restore the button to fix a test; update stale UI expectations instead after proving behavior.

## Important current truth discovered during static inspection

The current branch already contains more of the final direction than the screenshots suggested:
- `MemberApp._PLACEHOLDER` already owns concise contextual Composer nudges and explicitly treats them as context, not modes.
- Object threads already use one `_OBJECT_PLACEHOLDER`.
- Office browser CDNs for JSZip/SheetJS are already removed in `index.html`; comments state server-side `lib/office.js` owns DOCX/XLSX/PPTX parsing.
- Object threads already connect opening/readiness/tried-before/related/outcome data and use the existing governed Composer action owner.
- The shell Composer has measured viewport reservation and mobile-specific CSS.

Do not redo these areas without a failing behavioral proof.

## P0 — Monday Coach candidate

### 1. Methodical assistant, using existing intelligence

Implement/finish the founder-ratified method in the existing Composer/reasoning architecture, not a new brain:

Experience -> understand -> clarify/ground only when useful -> identify meaningful uncertainty -> investigate existing evidence/history -> ask the highest-value question when needed -> offer a small number of justified candidates when enough is known -> human chooses -> Focus/action -> observe -> outcome -> learn -> adjust.

Inside an existing Focus:

Focus -> act -> observe -> understand -> adjust -> act again -> outcome -> learn.

A Focus must not automatically spawn Focuses. Prefer actions/experiments/adjustments inside the existing Focus while desired B is materially unchanged. A new Focus only follows a meaningfully different objective plus deliberate human choice.

The model chooses/interprets conversational moves from bounded capabilities. Deterministic/kernel code continues to validate referents, authority, privacy, confirmation, and canonical writes.

Do not add an English question/command regex system. Do not create `methodical-assistant.js` as a parallel intelligence owner. Reuse Inquiry unknowns/hypotheses, evidence/retrieval, tried-before, outcomes, org learning, external research, and Focus state.

Acceptance examples are semantic, not phrase lists:
- "We've been going quiet after conceding." -> understand/ground rather than immediate Focus.
- "Is that actually happening?" -> evidence/history before another human question when possible.
- "Why?" -> Inquiry/unknowns.
- "What would help us understand this?" -> information-gain next move.
- "What could we try?" -> reasoned candidates with basis/source standing.
- "The first one." / "Yeah." -> governed deliberate Focus/action.
- In Focus: "We tried it today." -> correct outcome path, not another Focus.
- "That helped." -> learning without causal overclaim.
- "What should we do next?" -> adjust existing Focus unless B materially changed.

### 2. Simplify object thread UI without deleting capability

Static inspection shows `openObjectThread` still permanently renders a verdict row:
- Work on this
- Keep
- That's settled (Inquiry)
- I disagree
- Keep near the top / Take off my priorities
- Not now

This is exactly the state-machine exposure the founder rejected. Do NOT simply delete every action blindly: first prove each remains naturally reachable through the Composer/bounded action schema. Then remove/demote permanent controls whose conversational route is proven. Minimal audience/privacy controls may remain where an informed explicit choice is genuinely needed.

The Focus/object page should lead with human meaning:
- what this is / what you are working toward;
- where things stand;
- what has been tried, only when present;
- what happened, only when present;
- what has been learned, only when present;
- Composer.

Technical relationship/provenance/confidence machinery should be progressive disclosure or conversationally answerable rather than a day-one wall. Do not weaken epistemic truth to simplify presentation.

### 3. Real Inquiries, not onboarding-field placeholders

Audit why the screenshots showed onboarding-derived cards such as "What they say they bring" and "Where they are trying to get to" as Inquiries with "I don't have a read on this yet."

Onboarding is attributed world/self context. It may seed curiosity, but absence of a read is not itself a worthwhile Inquiry. Do not delete canonical onboarding context. Correct the projection/index/presentation so the Inquiry bucket contains genuine questions being investigated, while context remains available to the assistant.

This is potentially high-risk because it touches object projection/identity. Trace owner first and mutation-test.

### 4. Home copy and cold start

Home should be a calm current briefing, not a truth-maintenance-system report. The screenshot exposed copy such as "Nothing has crossed the line into a group finding yet..." This may be epistemically correct but is poor default UX.

Preserve the underlying distinction; simplify the default presentation. Cold start should say, in human language, that IntelliQ is still learning and invite conversation. Do not fabricate findings to avoid emptiness.

### 5. Focus shape

The screenshot showed a Focus whose title/body bundled multiple goals: team performance, own skills/consistency, communication, culture, responsibility, competitive goals.

The methodical assistant should clarify a meaningful B when several materially distinct goals are bundled, rather than creating a giant Focus or splitting automatically. Human choice decides. Existing Focus records must remain valid; do not migrate/destructively rewrite history merely for prettier cards.

### 6. Composer mobile clipping

The configured strings are already concise:
- Home: What's on your mind?
- High/Low: Tell me what you've noticed…
- Inquiry: What are you wondering about?
- Focus: What do you want to work on?
- Library: Ask about what you've kept…
- object: Talk to IntelliQ about this…

Yet founder screenshots at phone width visually clipped several placeholders. Treat this as a rendered-layout defect, not a copy-authoring defect. Measure at 390 and 430 px with attach + mic + send present. Fix layout only after reproducing. Do not shorten phrases until they lose their intended meaning merely to fit a broken flex layout. Verify textarea width, control widths/gaps, placeholder behavior, and real iOS if available.

### 7. Library subtraction

Library means "things I wanted to find again." Current screenshot over-explains reference semantics and makes New folder prominent on an empty Library.

Simplify copy. Do not change canonical reference semantics. Demote folder administration on cold start; preserve conversational keep/find. Folder creation may remain available secondarily.

### 8. Degraded provider UX

The deterministic fallback is safety/reliability infrastructure, not the normal product personality. Keep it truthful and capable, but do not let a large technical degraded-mode explanation dominate ordinary interaction. Provider-backed methodical behavior is the Coach product. Never pretend deterministic fallback understood arbitrary language it did not understand.

## P1 — before player pilot

Prove the complete conversational journey with persistence/reload and privacy:
observation/High/Low -> Inquiry -> evidence/group contribution as useful -> justified suggestions -> deliberate Focus -> action -> outcome -> learning -> adjusted next move.

Also prove attachment-as-turn, retained-source reread/deletion law, multilingual continuity, audience boundaries, Library reopen, and unbound "What have we learned?" synthesis through the correct existing/read-model architecture.

## Priority R&D during/after pilot

Do not block Coach on richer connection visualization, graph/Web-of-Webs exploration, advanced dashboards/analytics, sophisticated Library organization, or deeper organizational-learning presentation.

Underlying canonical connections are NOT deferred. IntelliQ must already know and reason across Low/High -> Inquiry -> Focus -> action -> outcome -> learning relationships. Only richer human-facing visualization/manipulation is deferred.

## Verification law

Do not claim closure from a 200, persistence row, or prose saying "done." Consequential promises remain:

promise -> canonical truth -> human-facing door -> reopen -> continue -> unauthorized reader denied.

Run existing product-promise gates and relevant suites after each consequential change. Mutation-test new consequential assertions and verify mutations actually apply. Keep browser exception suppression empty. Do not weaken privacy, authority, evidence standing, canonical identity, or tenant isolation for UX.

## Stop condition

For Monday, stop adding capability when Coach can:
1. open the deployed build on a phone;
2. talk naturally from Home/buckets;
3. receive purposeful methodical next moves rather than endless questions;
4. move from understanding to a justified suggestion and deliberate Focus without operating forms;
5. continue inside that Focus through action/outcome/learning without Focus proliferation;
6. navigate away/reload/reopen and retain coherent state;
7. do this through a polished UI that does not require understanding IntelliQ's machinery.

Anything not required for that acceptance path goes to priority R&D unless it is a safety/privacy/authority/data-integrity defect.
