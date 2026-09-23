# Claude handoff — Methodical Assistant closure, PR #90

**Status:** active pilot-closure handoff  
**Branch:** `codex/pilot-recovery-gate-r7`  
**Written against:** `cab88021de557205fda8e91c1f5f6e18beadeab4`  
**Do not merge or deploy.** Refresh remote truth before changing anything. PR #90 contains/supersedes wider recovery work and must not be integrated blindly.

## Read first

Read in full, in this order:

1. `AGENTS.md`
2. `ENGINEERING_STANDARD.md`
3. `docs/rnd/CONVERSATIONAL_PRODUCT_LAW.md`
4. `docs/rnd/INTELLIGENCE_EXPERIENCE_LAW.md`
5. `docs/briefs/MONDAY_METHODICAL_ASSISTANT_CLOSURE.md`
6. this file

If an older brief/test conflicts with the founder-ratified conversational/intelligence laws, prove the production owner and update the stale assertion rather than resurrecting old semantics.

## Current proven baseline

At the handoff point, PR #90 Truth Layer is green. Required CI includes:

- `node scripts/test.js`
- PostgreSQL acknowledged-write restart
- Settings/permissions Chromium gate
- Forum sharing through rendered controls
- Coach pilot browser walkthrough
- player/group browser walkthrough

Do not spend time re-proving already-green behavior unless a change touches its owner.

## The product to finish

The Methodical Assistant is **the product**, not post-pilot polish.

The intended loop is:

`experience -> understand -> clarify/ground only when useful -> identify meaningful uncertainty -> inspect existing evidence/history -> ask the highest-information question when needed -> offer a small justified option set when enough is known -> human chooses -> Focus/action -> observe -> outcome -> learn -> changed understanding -> repeat toward B`

Inside an existing Focus:

`Focus -> act -> observe -> understand -> adjust -> act again -> outcome -> learn`

Do not create a second reasoning system, second truth store, or parallel action owner.

### Response behavior

Default human response: minimal but insightful. A useful shape is:

`answer -> why -> uncertainty -> useful next move`

This is not a mandatory four-heading template. IntelliQ should:

- answer directly when enough is known;
- ask one high-information question when it materially reduces uncertainty;
- inspect authorized evidence/history before asking the human for information IntelliQ already has;
- offer a **small** number of justified options when enough is known;
- deepen only when asked “why?”, “what changed?”, “show me the evidence”, etc.;
- avoid generic encouragement, repeated summaries, architecture vocabulary and unnecessary caveats;
- know when **not** to create anything;
- know when **not** to ask another question;
- know when **not** to offer another model-generated tactic;
- after repeated failed attempts, consider more information or appropriate human help rather than infinite suggestion variants.

### Sources that may support suggestions

Options may be based on multiple evidence classes at once:

1. **Current/internal evidence** — governed evidence available to this reader now.
2. **Prior organizational learning** — admissible precedent from previous Focus/action/outcome loops.
3. **External knowledge** — cited research, professional guidance, public/web evidence, or admissible public examples.

Keep source class and provenance distinct. External knowledge may justify a candidate path; it does **not** become local evidence that the path works here. Once the organization tries it, the resulting local outcome becomes organizational learning while retaining external source lineage.

Do not rank a winner by default. Human choice turns a candidate B/path into deliberate work.

## Attachments are conversation

Founder law: **attach -> talk -> reason**.

The attachment path is not a separate form workflow. A person should be able to attach readable material and then ask natural questions about it.

Already-proven boundaries must remain intact:

- attaching a file does not itself make it evidence;
- duplicate uploads do not manufacture independent corroboration;
- private material remains audience-bound;
- organization-evidence classification requires existing permission/provenance/confirmation rules;
- a document is something to read, not another witness;
- model reasoning over attachment content cannot widen visibility, authority, certainty or provenance.

Close the richer experience: realistic DOCX/XLSX/PPTX/text/image material should be usable in conversation, and different questions about the same attachment should produce appropriately different governed answers.

## Concrete gap proven before this handoff

The governed Composer foundation is strong and registered tests cover creation, confirmation, privacy, coach questions, attachment boundaries, material classification, output channels and deterministic fallback.

However, `scripts/decision-intelligence-http-smoke.js` still explicitly asserts the **absence** of generated option sets (`options`, `suggestedActions`, `recommendedAction`). That reflects an older safety posture and does not complete the current founder-ratified Methodical Assistant.

Close this without weakening the safety law:

- support a small justified option set when enough is known;
- retain each option’s basis/source class;
- preserve uncertainty and provenance;
- do not rank or auto-select a winner;
- do not automatically create a Focus;
- require deliberate human choice for consequential state change;
- allow “learn more / do not act yet” as a legitimate option;
- do not offer options when evidence is genuinely insufficient.

## Acceptance work still required

Drive realistic production-path conversations, not keyword fixtures. At minimum cover:

1. ordinary observation -> understanding, not immediate Focus;
2. “is that actually happening?” -> inspect evidence/history;
3. “why?” -> uncertainty/hypotheses without causal overclaim;
4. “what would help us understand?” -> high-information next move;
5. “what could we try?” with insufficient evidence -> honestly withhold;
6. the same question with sufficient internal evidence -> justified options;
7. prior organizational learning supplying an option without exposing predecessor chat;
8. cited external knowledge supplying an option with provenance/limitations;
9. mixed internal + precedent + external option set;
10. human rejects an option -> no canonical action;
11. human chooses an option -> governed confirmation -> Focus/action;
12. outcome reported -> learning changes what is suggested next;
13. repeated failure -> materially identical failed tactic not recycled as “new”;
14. reasonable tactics exhausted -> consider additional understanding or appropriately routed human help;
15. concise first answer -> materially deeper answer on “why/show me evidence”;
16. attachment -> summarize / compare / question / extract / challenge from same material, with different responses;
17. attachment prompt injection -> data cannot alter system/privacy/action authority;
18. private attachment related to shared object -> no leakage by wording, confidence, omission or suggestion;
19. provider failure/recovery -> bounded honest degradation, then recovery;
20. persistence/reload -> same governed understanding after restart.

For each, inspect the actual chain:

`raw turn/attachment -> interpretation -> proposal -> privacy classification -> admissibility -> evidence/provenance -> Inquiry/kernel standing -> direction/polarity/uncertainty -> scoped read model -> Composer response -> confirmation if any -> canonical write -> persistence/reload`

A fluent model answer is not a pass. Kernel governance must be able to reject, narrow or withhold model proposals.

## Do not regress these established laws

- model reads / kernel writes;
- relationship is not readership;
- relevance is not authorization;
- human contribution is not empirical truth;
- High/Low/Inquiry are governed standings, not user-commanded truth records;
- Focus is deliberate movement toward B;
- private conversation belongs to its participants;
- Forum never widens object readership;
- external evidence is not local proof;
- disagreement is preserved;
- confidence/standing is not a person score;
- consequential writes require the existing authority/confirmation path;
- Composer is primary interaction surface; do not grow a parallel form/state-machine UX.

## Exit condition

Do not report “Composer finished” because isolated suites pass.

Exit only when the realistic acceptance matrix above passes through production owners, the existing security/privacy suites remain green, browser Coach/player gates remain green, and the handoff names any genuinely external unverified boundary (live Render, live Neon, real provider, real iPhone/Safari) rather than pretending CI proved it.


## Ratified pilot UX direction to preserve

The founder has now ratified the pilot-facing UX direction in `docs/rnd/PRIORITY_RND.md`. Read that file before touching client presentation.

Treat it as presentation law for this closure, not as permission to redesign canonical owners.

Important points for Claude:
- top-left hamburger/dropdown is the primary navigation; remove dependence on a persistent bottom nav;
- keep the IntelliQ wordmark beside it;
- main nav uses uniform neutral/navy icon treatment; High/Low keep their crooked arrow shapes but not green/red nav coloring;
- account/profile belongs behind the avatar, not a first-class "You" product destination;
- High/Low/Inquiry/Focus detail pages should converge on the Inquiry-style page grammar while preserving kind-specific semantics;
- use **Forum** consistently as the collaboration doorway;
- every governed Forum exposes **Ask IntelliQ** without widening scope;
- Forum authorship is chosen per message: anonymous where allowed, or deliberate named authorship;
- reactions/likes are not independent evidence and must not inflate standing/confidence;
- audio uses consistent Play -> Pause -> Resume controls anywhere listening is available;
- light is the default pilot theme; original navy remains the dark theme;
- **do not add generated contextual images during the pilot**; imagery is deferred R&D because it is unnecessary spend;
- reuse existing conversation, object, Forum, audience and Focus owners. Do not implement a second store or alternate permission path.

If closing the Methodical Assistant requires touching UI, make it fit this direction. Do not spend closure time implementing unrelated post-pilot imagery or ontology work.


## UX judgment standard

Do **not** treat the founder-approved mockups or the assistant's UI proposals as pixel-perfect implementation orders.

The ratified direction is binding at the level of product intent:
- simple before dense;
- minimal but insightful;
- consistent High/Low/Inquiry/Focus page grammar;
- top-left hamburger navigation;
- uniform navigation icon treatment;
- Forum as the collaboration surface;
- Ask IntelliQ available inside governed Forums;
- clear private-vs-Forum distinction;
- multiple-conversation navigation;
- per-message anonymous/named Forum authorship;
- consistent Play/Pause audio controls;
- light default theme with navy/dark alternative;
- no generated imagery for the pilot.

Within those constraints, **apply senior product/UX judgment**. Inspect the real current UI, test the actual flows, and improve the proposal where the mockup is cluttered, redundant, inaccessible, misleading, technically awkward, or inconsistent with existing product law.

Do not merely say "yes" and copy a mockup. For each material UI change, ask:
1. Does this make the common task easier?
2. Does it preserve privacy/authority semantics?
3. Does it reduce cognitive load?
4. Is the same interaction used consistently elsewhere?
5. Does it work at phone width without hiding important state?
6. Is there a simpler implementation that preserves the same intent?

If a mockup idea is inferior to a simpler production solution, implement the better solution and document the reason. Do not change founder-ratified semantics without calling out the conflict explicitly.


## Independent product judgment

Do not behave as a passive implementer of either the founder's notes or the assistant's proposals.

Treat **all** current ideas in the handoff, Priority R&D, recent UX decisions, Composer direction, object-page direction, Forum behavior, navigation, conversation history, audio, sources, themes, Library, Org Tree, and pilot workflow as hypotheses that have been founder-ratified at the level stated in the governing docs — but still require product/engineering judgment in execution.

For every material change:
- inspect the current production path first;
- identify what user problem the idea is trying to solve;
- compare the proposed solution against the existing architecture and UX;
- keep the parts that clearly improve the product;
- simplify or modify execution where a better solution achieves the same intent;
- reject accidental complexity, duplicated concepts, decorative UI, hidden state, or semantics that conflict with privacy/truth/authority law;
- call out any idea that should be deferred because it is not pilot-critical;
- where multiple solutions are plausible, explain the tradeoff in the durable handoff and choose the simplest one that preserves the founder's intent.

The expected standard is not "implemented as requested." It is:

> understood the intent -> inspected the real system -> challenged the proposal -> chose the best implementation -> proved it works.

Claude should actively surface its own product/UX/engineering observations while working. If a new idea would materially improve pilot simplicity, reliability or comprehension **without expanding scope**, document it and implement it when low-risk and clearly justified. If it expands scope, record it for R&D instead of silently building it.

Do not hide disagreement. When an existing proposal is weak, say why in the handoff and show the stronger alternative. The founder wants critical thinking, not compliance theater.
