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

### 1b. Preserve journey conversation, never transfer another person's chat

When a High/Low/Inquiry produces a deliberate B and becomes the basis for a Focus, preserve the conversation/Forum journey for the **same authorized participant set**. The human experience should be continuous rather than "old object closed, new empty chat."

Implement this through existing governed thread/object relationships; do not copy messages into a new truth store.

Critical negative law: similar-A retrieval across another person/team does **not** inherit their conversation. It may retrieve only admissible reusable direction/learning — e.g. prior B/intervention shape/outcome learning at the reader's permitted standing. Private chat, Forum contributions, identities and source evidence remain behind their original audience gates. Relationship is not readership.

Add adversarial tests for:
- same participant(s): High/Low/Inquiry -> Focus reopens with conversational continuity;
- unauthorized/new participant: relationship does not expose predecessor chat;
- different person with similar A: prior B/learning can be available when admissible, predecessor chat cannot;
- leaving/removal/audience change does not create durable conversation access through the Focus edge.

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

### 2a. Whole-stack adversarial closure: prove the layers, do not trust the architecture diagram

Before Coach-ready, trace representative messy real-language turns through the **actual production call graph**, not isolated pure functions. For each fixture record the state at every boundary:

raw turn / attachment / onboarding -> semantic interpretation -> proposal -> privacy classification -> admissibility -> evidence/provenance -> Inquiry/kernel standing -> polarity/curiosity -> scoped read model -> Composer response/object surface -> persistence/reload.

Required fixture families:
- useful ordinary conversation that should become evidence;
- same claim repeated by one origin vs independent corroboration;
- ambiguous language that must remain unresolved;
- contradiction/correction;
- private contribution related to a shared object;
- shared/team Inquiry with individual private threads plus Forum;
- High and Low candidates with explicit direction;
- externally informed suggestion with citation/provenance;
- malicious prompt injection in user text and attachment-derived text;
- cross-org identifiers and forged body identity;
- removed/unauthorized participant attempting to follow relationship edges;
- provider failure/recovery and reload.

For provider-backed tests, use realistic paraphrases/code-switching rather than test-keyword strings. Capture the model's proposed semantics, then prove deterministic/kernel governance can reject, narrow or withhold them. A passing LLM response alone is not a truth-layer pass.

Run the existing security/privacy families together and report exact pass/fail counts, including at minimum auth-boundary, tenant-boundary, cross-org-isolation, object/forum audience, composer privacy law, org-tree authority, prompt injection, provider boundary, safeguarding, attachment/photo boundaries, scope parity and Web scope. Mutation-test the gates whose removal would create disclosure or unauthorized mutation. Do not call the product "secure", "private", or "compliant" merely because these tests pass; report the threat model and untested boundaries.

### 2aa. Compliance is a requirements matrix, not a universal pass/fail test

Do **not** claim IntelliQ "passes every country's educational/organizational laws." Law depends on jurisdiction, age, institution type, data category, role (controller/processor/etc.), deployment, contracts, retention, cross-border transfers, safeguarding duties and actual operations outside this repository.

Build/maintain a jurisdictional requirements matrix from authoritative current sources, beginning with the pilot's actual jurisdictions and then expanding by market. Each requirement must map to: jurisdiction, sector/population, applicability trigger, product/control requirement, repository evidence/test, operational/non-code requirement, owner, status, source URL/title/date checked, and legal-review-needed flag.

Separate:
1. code-verifiable controls (access, deletion mechanics, auditability, consent/authorization enforcement, minimization, export, retention enforcement, child/guardian gates where applicable);
2. configuration/deployment controls;
3. contracts/policies/process/training/vendor obligations;
4. questions requiring qualified local counsel.

Never turn absence of a failing test into a legal-compliance assertion.

### 2b. High / Low production path is currently inconsistent and must be reconciled

Repository audit finding: the High/Low implementation contains **conflicting generations of product law**.

Current `ai/team-state.js` says evidence may determine direction when direction itself was explicitly recorded at the evidence boundary (for example independent origins marking improvement/decline, documented metric movement, or recorded Focus outcomes). `combinedValence` then treats the person's own call as a second account: evidence can file a High/Low, disagreement becomes more important, and a person's call cannot erase an evidence-backed Low.

But `scripts/highs-lows-smoke.js` still opens with the older law that "NOBODY BUT THE PERSON CALLS IT" and later asserts an uncalled strong belief produces no polarity. Parts of that suite therefore describe an earlier implementation and may conflict with the current owner. Do not patch around this contradiction. Establish the production call graph and update tests/comments only after proving which owner the live routes use.

Founder-ratified target semantics:
- High/Low are sibling discovery standings alongside Inquiry, not sentiment buttons and not LLM labels over prose.
- The system may surface a High/Low autonomously **only when governed evidence contains a defensible direction**. It must not infer "good/bad" merely from positive/negative wording.
- Direction can come from explicit attributed observations/contributions, measured change, recorded outcomes, or other canonical evidence whose semantics genuinely establish direction.
- Independent origins vote; repeated echoes do not.
- Thin/tentative evidence stays Inquiry/unknown rather than being forced into High/Low.
- Conflicting direction is a contested finding / Inquiry-worthy state, not an averaged verdict.
- Human calls are attributed accounts and may seed/strengthen understanding, but do not overwrite contrary canonical evidence.
- Human-created High/Low remains an attributed observation until evidence standing supports a broader claim.
- LLM may interpret a contribution into a **candidate** direction when language is genuinely semantic/ambiguous, but the kernel must validate provenance/standing before any High/Low is canonical. Do not implement a keyword sentiment classifier.
- High/Low must retain the underlying Inquiry/evidence identity so conversation, Forum, provenance and later Focus continuity do not fork into parallel truth.

Trace end-to-end:
raw conversation/onboarding/contribution/metric/outcome -> proposal/evidence envelope -> direction field (if justified) -> Inquiry/kernel standing -> combined/evidence valence -> polarity owner -> object index -> High/Low bucket -> openable thread -> Forum -> Focus origin -> outcome/learning.

Prove at least:
1. two+ independent directed origins can surface a High/Low without a manual tap when standing permits;
2. repeated statements from one origin cannot;
3. undirected evidence cannot be guessed into a bucket;
4. human call alone cannot promote thin evidence to organizational truth;
5. contrary human call cannot erase evidence-backed Low;
6. conflicting independent directions remain contested;
7. machine-detected/metric/outcome direction reaches the same canonical polarity owner;
8. surfaced High/Low is actually present in `/api/objects`, opens, can be discussed privately, can have governed Forum context, and can become the origin of a Focus without losing lineage;
9. privacy/cohort gates remain identical at every surface.

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

## Intelligence experience / attention law

Implement the core human-facing rules in `docs/rnd/INTELLIGENCE_EXPERIENCE_LAW.md` this week. Treat it as founder-ratified direction for the Coach/player experience, not optional visual polish.

Key acceptance:
- show meaning before machinery; reasoning/provenance is progressive disclosure;
- Home shows what matters now and is allowed to show nothing;
- High/Low/Inquiry/Focus use the minimal human grammar in that law;
- prose is concise, direct and naturally uncertainty-aware;
- numbers earn their pixels; internal scores do not become dashboard decoration;
- notifications are attention events, not database events: changed understanding, meaningful Focus movement/outcome, contradiction, required decision/action, or newly relevant learning;
- notification audience/privacy is no wider than the underlying object and lock-screen text must not leak private evidence;
- dedupe/coalesce related notification events;
- no engagement-driven reminders/streak behavior.

Do not create a second presentation/intelligence engine to achieve this. Reuse the existing presentation/read models and Composer. Prefer subtraction and progressive disclosure.

### Newly uncovered attention-layer conflicts

Repository audit found older engagement-oriented behavior that conflicts with the ratified intelligence-experience law:

- `ai/proactive.js::milestoneFinding` turns **check-in streaks** into Highs ("Nice streak going", "A personal best") and tells leaders consistent checking-in is a moment to acknowledge. `scripts/proactive-smoke.js` explicitly protects this behavior.
- `ai/intelligence-feed.js` maps generic `opportunity` to **High**. `scripts/intelligence-feed-smoke.js` explicitly asserts opportunity => High. Under the current product law a High means evidence that something appears to be going well; an opportunity/candidate direction is not automatically evidence of that.
- `ai/behaviour.js` says Home should "lead with a win" and the old proactive test describes Home as "needs / celebrate / opportunity". Reconcile this with the newer rule that Home shows what matters now and does not manufacture engagement.

Do not mechanically delete all milestones or opportunities. Reclassify by meaning:
- a genuine outcome/performance milestone supported by canonical evidence may be a High;
- an app-usage/check-in streak is not inherently human/organizational improvement and must not become a High merely to reward engagement;
- an opportunity/suggested direction belongs in the governed option/next-step layer unless evidence independently establishes a High;
- priority is about human consequence/information value, not product engagement.

Update the old tests only after tracing every live caller and proving the replacement behavior end-to-end. Add a regression that app-usage frequency alone cannot manufacture a High or notification.

### Newly uncovered privacy semantics: dynamic audiences can expand historical readership

`ai/audience.js` deliberately stores audiences as references and resolves them against **current** node membership. That correctly removes access when somebody leaves, but it also means a newly added member/leader can become able to read historical material that was shared before they joined. The file currently presents this as structurally avoiding stale permissions, but that is only one side of the policy.

Do not change this blindly. Founder/product law is required per audience kind:
- Does "the team" mean **whoever is on the team now**, including access to historical shared records?
- Or **the people who were in the audience when it was contributed**, with future members seeing only later organizational learning/derived evidence?
- Are Forum history, contributed evidence, canonical High/Low/Inquiry/Focus state, and raw shared conversation governed by the same temporal rule? They probably should not be assumed to be.

Until ratified, add adversarial coverage documenting current behavior for join-after-share and leave-after-share. Treat relationship/history access separately from organizational learning. A new member must never gain private source conversation merely because current node membership resolves them into a shared object's audience.

### Newly uncovered privacy weakness: regex sensitivity is not a sufficient semantic privacy classifier

`ai/privacy.js::classifyText` uses English regex/topic lists for restricted/sensitive classification and `redact` only strips exact private strings of length >=16. These are useful last-line heuristics, not a complete privacy boundary. They can miss:
- non-English/code-switched sensitive disclosures;
- euphemisms/novel wording;
- model paraphrases of private content;
- short identifying fragments;
- sensitive facts inferred by combining otherwise-normal facts.

Do not remove these defenses, but do not treat their passing tests as proof that private meaning cannot leak. Provider-backed adversarial fixtures must include paraphrase attacks and multilingual/code-switched sensitive material. Structural audience/scope/provenance gates remain primary; output redaction is defense-in-depth only.

### Newly uncovered confidence naming collision

`ai/confidence.js` computes **reliability of a noticing type based on whether users found prior notices useful/dismissed**. Other layers also carry kernel/evidence confidence about whether a claim/pattern is supported. These are different concepts and must never collapse into one human-facing "confidence".

Audit every `confidence`, `kernelConfidence`, `reliabilityLabel`, and ranking use. User feedback can calibrate whether a class of notification is useful to surface; it must not increase/decrease the truth standing of the underlying evidence. Prefer explicit internal names such as `evidenceStanding` vs `deliveryReliability` where ambiguity exists, without gratuitous schema churn.

