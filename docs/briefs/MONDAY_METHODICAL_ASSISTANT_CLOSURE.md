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

### 1a. Keep chat ownership separate from evidence/direction ownership

Founder law: **chat always belongs to the people in it; admissible evidence and reusable direction/learning belong to the organization at their governed standing.** Never make chat organizational property merely because a Focus or learning object references it.

The assistant may reason from three source classes and must preserve which class supported a suggestion:
- current/internal evidence;
- prior organizational learning/direction;
- cited external knowledge/research/public examples.

External evidence can justify proposing a B/path when research or another organization's documented experience supports it, but it does not prove the same result will occur here. Preserve citations/provenance, population/context, limitations and meaningful differences. The proposal remains a candidate until the human chooses it. If tried, the local action/outcome becomes new organizational learning while retaining the external source lineage.

Do not copy another organization's/private person's chat as precedent. Cross-org/public examples enter only through an authorized external-knowledge path with appropriate sourcing.

### 1aa. Offer options from more than one evidence base

Do not force IntelliQ to collapse its reasoning into one suggestion. When useful, present a **small option set** whose members may come from different bases at the same time: current/internal evidence, prior organizational learning, and cited external knowledge/research. "Learn more / do not act yet" may itself be a legitimate option when uncertainty is material.

Each candidate should retain why it exists and its source class. Do not rank a winner merely because several candidates exist. The person/authorized group chooses which B, if any, becomes deliberate work.

Current repo finding: `scripts/decision-intelligence-http-smoke.js` deliberately asserts that generated Q6/Q7 options do **not** exist yet. That was an earlier safety decision, not evidence that the founder's current product direction is implemented. Replace that absence only through the existing governed suggestion/proposal architecture, with provenance and no automatic action/ranking.

### 1b. Preserve journey conversation, never transfer another person's chat### 1b. Preserve journey conversation, never transfer another person's chat

When a High/Low/Inquiry produces a deliberate B and becomes the basis for a Focus, preserve the conversation/Forum journey for the **same authorized participant set**. The human experience should be continuous rather than "old object closed, new empty chat."

Implement this through existing governed thread/object relationships; do not copy messages into a new truth store.

Critical negative law: similar-A retrieval across another person/team does **not** inherit their conversation. It may retrieve only admissible reusable direction/learning — e.g. prior B/intervention shape/outcome learning at the reader's permitted standing. Private chat, Forum contributions, identities and source evidence remain behind their original audience gates. Relationship is not readership.

Add adversarial tests for:
- same participant(s): High/Low/Inquiry -> Focus reopens with conversational continuity;
- unauthorized/new participant: relationship does not expose predecessor chat;
- different person with similar A: prior B/learning can be available when admissible, predecessor chat cannot;
- leaving/removal/audience change does not create durable conversation access through the Focus edge.

### 2. Simplify object thread UI without deleting capability### 2. Simplify object thread UI without deleting capability

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

### 3. Onboarding can legitimately seed Inquiries, Highs and Lows

Founder correction: do **not** assume onboarding-derived objects such as "What they say they bring" or "Where they are trying to get to" are unwanted merely because they originated during onboarding.

Onboarding is attributed world/self/org context, not empirical truth. Precisely because it establishes claims, roles, goals, descriptions, expectations and unknowns, it can create useful epistemic starting points.

The requirement is semantic quality, not deletion:
- If onboarding exposes an important question that IntelliQ genuinely does not know and has reason to investigate, phrase/present it as a real Inquiry.
- If onboarding plus admissible evidence supports "something appears to be going well", it may surface through the existing High path at the correct standing.
- If onboarding plus admissible evidence supports "something may deserve attention", it may surface through the existing Low path at the correct standing.
- A person's self-description remains attributed knowledge; authority/repetition does not convert it into empirical truth.
- Absence of knowledge alone should not flood the product with arbitrary questions. Curiosity must be relevant to the person's/team's desired states, role/context, current evidence, contradiction, uncertainty, change, or information value.

Audit the current onboarding -> Inquiry/High/Low projection and improve the human phrasing/standing while preserving canonical context and provenance. Do not delete these objects merely to make the screen look cleaner. This is potentially high-risk because it touches projection/identity; trace owner first and mutation-test.

The long-term direction is a bounded **curiosity / truth-challenge loop** over the existing kernel, not a second truth system: current beliefs/context/evidence are periodically or event-triggeredly challenged for contradiction, weak support, important unknowns, stale assumptions, unexplained change, and useful discriminating questions. Candidate questions do not become canonical Inquiries merely because an LLM generated them. The kernel/governed deterministic layer evaluates whether the question is admissible, non-duplicate, relevant, genuinely unresolved, and worth learning; accepted candidates can then become or strengthen canonical Inquiries.

The same challenge process may strengthen or change the standing of existing Inquiries/Highs/Lows as new evidence arrives. It must not score people, invent uncertainty for engagement, or ask questions indefinitely.

### 4. Home copy and cold start

Home should be a calm current briefing, not a truth-maintenance-system report. The screenshot exposed copy such as "Nothing has crossed the line into a group finding yet..." This may be epistemically correct but is poor default UX.

Preserve the underlying distinction; simplify the default presentation. Cold start should say, in human language, that IntelliQ is still learning and invite conversation. Do not fabricate findings to avoid emptiness.

### 5. Focus shape

Founder clarification: Focus is downstream of understanding. Inquiries, Highs and Lows are discovery/understanding surfaces; a Focus exists when that understanding helps a human identify a desirable B and deliberately choose to work toward it.

A High can lead to a Focus ("this is going well; I want to develop it further"), a Low can lead to a Focus ("this deserves attention; I want to change it"), and an Inquiry can lead to a Focus once enough has been learned to justify trying a direction. A Focus does not require that every uncertainty is settled, and the system must not force a rigid High/Low -> Inquiry -> Focus sequence. Humans may start anywhere, but deliberate B + human choice is the Focus threshold.

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
