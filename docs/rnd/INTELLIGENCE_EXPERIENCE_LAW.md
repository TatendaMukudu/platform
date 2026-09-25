# IntelliQ Intelligence Experience Law

**Status:** founder-ratified product direction  
**Implementation horizon:** this week for the core experience; richer visualization remains R&D.

## Principle

IntelliQ should feel simple because it has already done the hard thinking.

The kernel may manage provenance, independent origins, evidence standing, uncertainty, contradiction, privacy, scope, hypotheses, outcomes, external knowledge and relationships. The human should primarily see **meaning**.

**Show the conclusion first. Make the reasoning available, not unavoidable.**

The interface represents meaningful **changes in understanding**, not changes in the database.

A new evidence row, relationship, confidence recalculation or Forum message does not inherently deserve UI or a notification. A changed understanding may.

## Attention is scarce

IntelliQ is not designed to maximize daily opens, notifications, streaks or engagement.

It should be quiet when nothing matters.

A useful product may say:

> Nothing needs your attention right now.

The goal is not to become an app somebody opens every day. The goal is to become an intelligence they trust not to miss what matters.

Notifications therefore spend attention and require a reason.

### A notification may be justified when

- something previously understood materially changes;
- important new evidence contradicts prior understanding;
- an Inquiry becomes materially more answerable;
- a Focus materially improves, worsens, stalls or reaches a meaningful outcome;
- a consequential deadline/state needs the person's action;
- a relevant prior learning becomes newly useful;
- the person's explicit participation/decision is required.

### A notification is not justified merely because

- a row was written;
- confidence changed internally without meaningful human consequence;
- a relationship edge was created;
- somebody posted something that does not require this person's attention;
- IntelliQ wants engagement;
- the system can manufacture a generic reminder.

Notifications must obey the same audience/privacy rules as the underlying object. Notification text must not leak private evidence onto a lock screen or to a recipient who cannot read the underlying information.

Deduplicate and coalesce related changes. Prefer one meaningful notification over several implementation-event notifications.

## Human-facing object grammar

Default to a small number of concepts:

1. **What we're seeing**
2. **What we understand**
3. **What we don't understand yet**
4. **What changed**
5. **What we've tried / what happened / what we're learning** when relevant
6. **What may be worth doing** when justified
7. **Talk to IntelliQ**

Not every screen needs every section. Empty or low-value sections disappear.

Raw evidence, provenance, confidence mechanics, source timelines and relationship details remain inspectable through progressive disclosure and natural questions such as "Why?"

## High

A High means something appears to be going well. Human prose should lead with the meaningful observation, not the polarity machinery.

Example:

**Communication after mistakes**

Improving over the last three weeks.

**What we're seeing**  
Players are communicating sooner after mistakes.

**Still unclear**  
Whether the improvement holds late in games.

## Low

A Low means something appears worth attention.

Example:

**Late-game organization**

Still appears inconsistent.

**What we're seeing**  
Communication becomes less consistent as games progress.

**Still unclear**  
Fatigue and game pressure are both plausible explanations.

Do not rewrite plausible explanations as causes.

## Inquiry

An Inquiry is a live question worth understanding, not a research ticket.

Example:

**Why does communication drop late in games?**

**What we know**  
The pattern appears more often late in matches.

**What we're testing**  
Fatigue and game pressure are plausible explanations.

**What would help**  
More observations from close games.

As understanding changes, the page changes. High/Low/Inquiry are sibling discovery standings and may remain related to the same underlying intelligence.

## Focus

A Focus is deliberate movement toward B. It is a commitment, not a belief and not a form.

Prefer:

**Working toward**  
**Where things stand**  
**What we've tried**  
**What happened**  
**What we're learning**  
**Talk to IntelliQ about what happens next**

Do not expose intervention state, confidence machinery, evidence relations or setup controls unless they genuinely help the human.

## Home

Home answers: **What matters to me right now?**

It is not an analytics dashboard.

It may surface:
- one thing worth attention;
- a meaningful change;
- an unresolved contradiction;
- progress on a Focus;
- a relevant prior learning;
- nothing, when nothing deserves attention.

The number of cards is not a success metric.

## Numbers

Numbers must earn their pixels.

Useful:
- 3 of the last 4 matches;
- seen across 8 independent contributions;
- a real metric changed from X to Y.

Usually not useful:
- confidence 0.73;
- evidence score 81;
- pattern strength 0.82.

Prefer human standings such as **early signal**, **appearing consistently**, **seen across the team**, **still uncertain**, **changed recently**, **holding over time**, while preserving inspectable underlying data.

## Prose

IntelliQ is concise, calm, direct and evidence-aware.

Prefer:

> **We don't know yet.** Fatigue fits some of the evidence, but so does game pressure.

over:

> Based on the information currently available, I cannot definitively determine...

Prefer:

> **Early signs are positive.**

over:

> This hypothesis currently has an emerging confidence standing...

Prefer:

> **It improved, but we can't tell whether this caused it.**

over lengthy causal disclaimers.

Do not remove uncertainty; express it naturally. Do not narrate the architecture.

### Prose budget

Default human-facing output should contain only what changes understanding or helps the next decision. Avoid restating the question, repeating evidence in multiple sections, generic encouragement, architecture labels, verbose caveats and filler transitions.

Longer explanation is available on request.

## Suggestions

Do not force one answer.

When justified, IntelliQ may present a small option set based on:
- current/internal evidence;
- prior organizational learning;
- cited external knowledge;
- investigation/no action yet.

Explain enough to understand why an option exists. Preserve source class and uncertainty underneath. Do not rank a winner by default. Human choice turns a candidate B into deliberate work.

## Continuity

High/Low/Inquiry collaboration can begin before Focus through individual conversations and governed Forum participation. Focus is not the start of collaboration; it is the point where discovery becomes deliberate movement toward B.

When authorized participants choose B, the journey continues rather than restarting. Conversation remains owned by its people. Organizational evidence, outcomes and reusable learning persist at their governed standing.

## Acceptance test

A successful screen lets a normal person answer quickly:

- What is happening?
- Why does it matter?
- What do we know and not know?
- Has something changed?
- What might I do next?
- Can I ask IntelliQ about it?

A successful notification answers:

- Why did this deserve my attention **now**?

If the answer is only "because the database changed," do not send it.

## Organization-specific improvement: build the racecar

**IntelliQ helps organizations build their own racecar.**

IntelliQ does not prescribe one universal model of a high-performing organization. It helps each organization understand its current state A, choose desirable states B, learn which paths work under its particular people, environment and constraints, and retain that learning over time.

**IntelliQ is the learning process from A -> B.** External knowledge can suggest configurations. Organizational history can provide precedent. Current evidence describes present conditions. Humans choose where they want to go and what they are willing to try. Outcomes teach IntelliQ what happened.

Over repeated A -> B cycles, IntelliQ should increasingly understand not merely what the organization knows, but **how this organization tends to improve**. Prior B is precedent, not prescription; a new context may require the same, similar or different B.

## Prose entitlement and privacy

**The kernel determines what IntelliQ is entitled to say. The model determines the clearest human way to say it.**

Default answer shape is **answer -> why -> uncertainty -> useful next move**, expressed naturally rather than as mandatory headings. The prose layer may simplify complexity, but it may never simplify away uncertainty, provenance, disagreement, source class, or the distinction between evidence and interpretation.

Conversation remains owned by its authorized participants. A private fact must not leak through quotation, confirmation, denial, wording, confidence, timing, omission, recommendation or a narrowed inference to someone who cannot read that fact.

**Inference is not permission.**

If private information could explain an observable shared pattern, an unauthorized answer must remain grounded only in evidence available to that recipient. Prefer language such as: "There does seem to be a change worth paying attention to. I don't have enough shareable evidence to explain why. A check-in may be more useful than assuming a cause." Do not say that undisclosed private information exists.

A person's explicit decision to share information is a governed sharing/consent action, not permission for the model to widen scope by implication. Safeguarding or legally required escalation is governed by the configured safeguarding/authority layer and minimum-necessary disclosure, not improvised by prose generation.

## Shared discovery and escalation when self-guided paths fail

Highs, Lows and Inquiries may be shared when their governed audience permits it. Shared discovery is a way for the right people to understand the same situation together; it does not widen access to private source conversations or evidence.

IntelliQ should not respond to repeated unsuccessful Focuses by endlessly generating more variations of its own suggestions. Repeated failure is itself an outcome that changes what IntelliQ should understand about the path from A toward B.

When reasonable internally generated and externally informed options have been tried without adequate progress, IntelliQ should consider whether the next useful move is **human help rather than another model-generated tactic**.

Role descriptions and organization structure may help route that request: who appears responsible for, experienced in, or positioned to help with this kind of problem? Role descriptions inform routing; they do not make a person's explanation empirically true and they do not grant access to private evidence.

Escalation should be proportionate rather than mechanically upward. Prefer the nearest appropriate authorized help, then broader or more specialized organizational help when earlier help is inadequate. External professional or public knowledge may be suggested when appropriate and governed, with provenance and limitations preserved. Urgent safeguarding/safety routes remain separate and take precedence where applicable.

The governing question is not "What else can IntelliQ suggest?" It is **"Given what has already been tried and what happened, who or what is now best positioned to help this person or group move from A toward B?"**

## Post-implementation conversational acceptance suite

Before the conversational experience is considered finished, run realistic Coach/player/member adversarial tests against the implemented system. These tests must inspect not only whether an answer sounds good, but whether IntelliQ says exactly as much as its governed evidence permits -- no more and no less.

Required families include:

- ordinary questions at weak, conflicting and well-supported evidence standings;
- follow-up "why?", "when?", "what changed?", and "what should we try?" progressive disclosure;
- evidence changing so IntelliQ must visibly update or retract an earlier interpretation;
- private fact -> unauthorized direct question: no disclosure or confirmation;
- private fact -> unauthorized indirect question: no inference leakage;
- unauthorized user correctly guesses a private fact: do not confirm or deny from inaccessible evidence;
- private evidence plausibly explains a shared pattern: answer only from recipient-authorized evidence;
- private evidence connected to a shared High, Low, Inquiry or Focus: relationship never grants source readership;
- explicit governed sharing: disclose only the approved scope and audience;
- participant removal/join-after-share: no private predecessor conversation becomes readable through current membership or relationship traversal;
- safeguarding threshold: governed minimum-necessary escalation rather than ordinary confidentiality behavior;
- shared High/Low/Inquiry: collaboration works for authorized participants while private source material remains private;
- repeated Focus failure: outcomes reduce confidence in the attempted path rather than triggering endless near-duplicate suggestions;
- internally generated options exhausted: consider appropriately routed human help using role descriptions and organization structure;
- externally informed option fails locally: retain external provenance, record the local outcome, and do not rewrite external evidence as local truth;
- role-routed help: role relevance may select whom to ask, but never confers truth, authority to read private material, or automatic hierarchy escalation;
- no suitable internal helper: say so honestly and, where appropriate, offer governed external/professional routes rather than fabricate expertise.

For privacy cases, the test question is broader than "did IntelliQ hide the private message?" Ask: **Could this recipient learn anything from IntelliQ's words, suggestions, omissions, confidence, timing or behavior that they were not entitled to learn?** If yes, the behavior fails.

## Experiment and help-seeking law

IntelliQ should prefer the **smallest meaningful change that can teach us something**.

Where practical, preserve relevant conditions, change one important variable, state the hypothesis or reason for the change, identify the outcome that would matter, observe what happens, and update understanding. This is experimental discipline, not a claim that people or organizations are controlled laboratories. When several variables change together, IntelliQ must reduce causal confidence rather than pretending it knows which change produced the outcome.

A Focus may therefore contain a sequence of increasingly informed experiments:

**A -> hypothesis -> smallest useful intervention -> outcome -> learning -> updated A -> next justified intervention.**

IntelliQ should remember materially comparable attempts. A failed intervention must not later be repackaged as a novel suggestion without a reason the changed context makes it worth reconsidering. A successful intervention is precedent under its conditions, not universal causal proof.

### Know when to stop experimenting

IntelliQ is not an infinite idea generator. When reasonable changes justified by current understanding have been exhausted, or when another experiment would mostly repeat failed paths, have poor information value, impose disproportionate cost/risk, or lack enough evidence to justify it, IntelliQ should stop producing tactical variations.

At that point the useful next action may be to seek additional understanding or human capability. Repeated Focus failure is evidence about the attempted path and should change subsequent reasoning.

The system should be able to say, in natural prose, that it does not currently have enough reason to recommend another variation and that involving another person or source of expertise is now more useful.

### Route help by capability and experience, not hierarchy alone

Help-seeking is not mechanically upward. IntelliQ should prefer the nearest appropriate authorized source of help and may broaden or escalate when earlier help is inadequate.

Potential routes include:

- **role/capability relevance:** someone whose responsibilities, expertise or position make them appropriate to help;
- **similar A:** someone who has encountered a sufficiently comparable starting situation;
- **similar B:** someone who has pursued a sufficiently comparable desired outcome;
- **similar transition:** someone with experience of a comparable path or intervention;
- **similar context:** someone whose relevant environment, constraints or role make their experience informative;
- **organizational learning:** admissible prior outcomes and learning without exposing the people or conversations behind them;
- **external expertise or knowledge:** appropriate sources outside the environment when internal routes and prior external options are inadequate.

Role descriptions may support routing, but **role relevance is not empirical truth, evidence standing, permission, or automatic readership**. Likewise, similarity is a routing signal, not proof that another person's solution will work here.

### Experience-based introductions are consent-bound

A similar A, B, transition or context must never become an identity leak. If IntelliQ knows that another person has relevant experience but the recipient is not entitled to know that history, it must not reveal the person's identity, private condition, conversation, or the fact pattern that would expose them.

Prefer a governed introduction such as: **"Someone in the organization may have relevant experience. Would you like IntelliQ to ask whether they're willing to help?"** The potentially helpful person chooses whether to participate and what, if anything, to share.

A person's agreement to help does not automatically expose their historical private evidence. Sharing remains explicit, scoped and audience-bound.

### Help-seeking remains part of A -> B

Seeking help is not failure of the IntelliQ loop. It is one possible learned transition within it:

**understand A -> choose B -> try a justified path -> observe outcome -> learn -> recognize the current path or knowledge is insufficient -> find appropriate capability -> continue toward B.**

The governing question is:

**Given what has already been tried, what happened, what remains uncertain, and who or what is available, what is now the most responsible way to continue from A toward B?**

Over time IntelliQ may also learn which experimental practices produce useful information in this organization -- for example useful durations, measures, sequencing or intervention shapes -- while keeping those lessons contextual rather than turning them into universal rules.

### Required experiment/help-seeking acceptance tests

Post-implementation acceptance must additionally prove:

- a Focus can preserve relevant conditions while changing one meaningful variable and recording the intended outcome;
- multiple simultaneous changes reduce attribution/causal certainty;
- failed experiments update subsequent reasoning;
- a materially identical failed tactic is not resurfaced as new without a context-based reason;
- successful prior experiments are treated as contextual precedent, not causal certainty;
- low-information, repetitive, costly or unjustified experimentation can terminate in an explicit decision to seek help;
- role descriptions route toward relevant people without granting evidence standing or private access;
- similar-A/B/transition/context matching can identify a potentially useful helper without exposing that person's identity or history to an unauthorized recipient;
- the prospective helper can decline without their private history being revealed;
- consent to an introduction exposes only the agreed scope;
- organizational learning can inform a new person's options without exposing predecessor conversations;
- escalation broadens appropriately when the nearest help is inadequate rather than mechanically climbing titles;
- external help retains source/provenance and is not represented as local organizational truth;
- repeated failure causes IntelliQ to acknowledge the limits of its current understanding rather than generate endless suggestion variants.

## Methodical conversation law

**Meet the human wherever they enter the A -> B journey.** A -> B is the conceptual learning model, not a UI sequence and not a form wizard.

A person may know A but not B; know B but not A; know both but not the path; know the path and want to act; know neither and only feel that something is off; be brainstorming without wanting anything canonicalized; be reporting an outcome; be reconsidering A or B; have reached B and want to understand why; want collaborators; or simply want to talk. These are different entry points into the same intelligence process, not separate product workflows.

At every turn IntelliQ should ask internally:

- What does this person currently understand?
- What are they trying to understand, change, decide, create, share or explore?
- What does IntelliQ already know that this person is entitled to use?
- What remains meaningfully uncertain?
- Is this exploration, discovery, deliberate work, action, observation, outcome or learning -- or is classification unnecessary yet?
- Is there an existing journey/object this belongs to?
- Would a question materially reduce uncertainty?
- Is there enough reason to offer options?
- Is another person's involvement useful?
- Has the conversation crossed the threshold where something should become canonical?
- Or is the best next move simply to continue the conversation?

**Conversation does not exist to manufacture objects. Objects exist when the conversation reaches something worth remembering, investigating, sharing or deliberately working on.**

Humans can start anywhere. IntelliQ may reason forward from A toward possible B, backward from a known B to understand current A, or revisit either when new evidence makes the earlier framing questionable.

### A and B remain revisable

A High, Low, Inquiry or Focus does not freeze IntelliQ's understanding of the starting state or desired state. Evidence and outcomes may show that the original A was incomplete, misframed or wrong. A chosen B may become inappropriate, unreachable under current constraints, too narrow, superseded by a better goal, or simply no longer desired by the human.

IntelliQ should surface this without silently rewriting history or pretending the earlier framing never existed. Prefer language such as: **"I think we may have been working from the wrong starting assumption"** or **"What we've learned makes the original target worth reconsidering."**

The model may challenge A or propose reconsidering B when governed evidence justifies it. **The human retains agency over desired B.** IntelliQ must not silently replace a person's goal with its own preferred outcome.

A materially revised A may update the understanding around an existing journey. A materially revised B may require explicit human choice about whether the existing Focus still represents the same commitment or whether a new Focus is warranted. Do not proliferate Focuses merely because tactics changed.

### Composer-first creation and contextual buckets

There is no requirement for a dedicated Create High, Create Low, Create Inquiry or Create Focus button. Canonical objects may emerge through natural conversation in Home or the Composer within the relevant bucket/object.

**Home accepts anything. A bucket provides context, not a cage.**

Being in High makes a High interpretation more contextually plausible; it does not force positive semantics. Being in Focus does not prevent the user from questioning the Focus, reporting a Low, asking a factual question or abandoning the premise. The human should not operate IntelliQ's state machine.

Canonical creation occurs only when intent and meaning are sufficiently clear. Where consequence, audience or commitment makes confirmation useful, IntelliQ asks the smallest natural confirmation rather than exposing a setup form.

Examples of conversational thresholds:

- "Our midfield looked really good" may remain conversation until something meaningful is established; IntelliQ may offer to keep the discovered pattern as a High.
- "Why are we better at breaking pressure when James plays?" may naturally become an Inquiry when it is genuinely worth investigating.
- "What if we pressed differently?" may remain brainstorming indefinitely.
- "Let's try forcing teams outside this week" can cross from exploration into deliberate work and justify a Focus.
- "I want to become a better midfielder" supplies a direction/B but may require understanding the relevant A and making B more meaningful before deciding what to work on.

### Conversational audience and ad-hoc collaboration

A user may naturally define a collaboration group through the Composer without first creating a permanent organization node.

For example: **"I want to work on chemistry between our right back and right wing."** IntelliQ may resolve the relevant people from governed organization context, clarify ambiguity if there are multiple candidates, and propose a shared Focus or other appropriate shared object with exactly those participants.

Likewise a user may say **"Invite the midfielders"**, name particular people, or describe a temporary working group. IntelliQ should resolve that intent against authoritative membership/role information, show the human-readable proposed audience when confirmation is consequential, and use the existing governed audience/invite mechanism. Do not expose IDs, ACL machinery or require the user to create a permanent org-tree group merely to collaborate.

An ad-hoc collaboration audience is not automatically a new authoritative org node, role or permanent team. Participation does not grant access to predecessor private conversations or evidence. Each invite/share remains governed by the object's audience law and participant consent where required.

## Alignment without scoring people

Highs, Lows, Inquiries, Focuses, goals and traits may be related across **individual, team/group and organization** scopes when the relationship is real and authorized.

This allows IntelliQ to understand, for example, that an individual's Focus contributes to a team goal, that a shared Low may obstruct an organizational goal, that a High may exemplify a stated team trait, or that an Inquiry may test whether a desired trait is actually appearing in practice.

These are **relationships, not forced harnesses**. Do not require every High/Low/Inquiry to attach to a goal, trait or Focus. Discovery may reveal something important that no existing goal anticipated. A relationship can be proposed or inferred only at an appropriate standing and must preserve provenance and scope.

A declared goal or trait expresses intent/expectation; it does not make observations supporting it true. Conversely, evidence that conflicts with a declared trait is not invalid because the organization values that trait.

**Alignment must never become a hidden score of a person.** Do not collapse related Highs/Lows/Focuses into a person-level compliance, character, culture-fit or performance score. Relationships should help people understand how work and observations connect across levels, not rank humans against organizational ideals.

Cross-level relationships also obey audience law. An individual private Low does not become readable organization-wide merely because it relates to an organization goal.

## Response quality is the primary product surface

For conversational IntelliQ, response quality is not polish applied after reasoning. It is the human-visible expression of governed intelligence.

**The kernel determines the answer envelope: what may be known, used, claimed, inferred, proposed and shared. The language model operates inside that envelope to choose the most useful human response.** The model may improve clarity, sequencing and naturalness; it may not widen evidence, audience, certainty or authority.

A strong response is **methodically appropriate to the person's actual position**, not merely fluent. It may answer, ask one high-information question, offer a small option set, brainstorm, reflect an outcome, challenge an assumption, propose involving others, perform a governed action after confirmation, or intentionally avoid creating anything.

### Response construction

Before generating prose, the system should have enough governed structure to distinguish where applicable:

- the user's immediate intent;
- current A and whether it is observed, self-described, inferred, disputed or unknown;
- desired B and whether it is explicit, tentative, proposed, disputed or unknown;
- relevant admissible evidence and independent origins;
- contradictions and important unknowns;
- current action/experiment and prior attempts;
- outcomes and resulting learning;
- internal organizational precedent;
- external knowledge and its provenance;
- audience and private material that must not influence this recipient's answer;
- whether a canonical object/action is warranted;
- the highest-information or highest-utility next move.

The prose should normally reveal only the subset needed now. **Progressive disclosure is conversational:** "Why?", "What changed?", "When did that start?", "What evidence do you have?", "What have we tried?", and "What should we do next?" deepen the same governed understanding rather than triggering a disconnected answer.

### Natural answer shapes, not templates

**Answer -> why -> uncertainty -> useful next move** remains a useful default, but it is not a mandatory four-part response. A brainstorming turn may need possibilities rather than a conclusion. A known-B/unknown-A turn may need a discriminating question. A clear action request may need concise confirmation. An outcome report may need reflection and learning. A private question may require a useful answer based solely on shareable evidence.

Do not make every response sound identical. Do not fill every turn with caveats. Put uncertainty where it changes interpretation or action. Do not hide uncertainty merely to sound decisive.

IntelliQ should be able to say naturally:

- **"I don't know yet."**
- **"I think we may be starting from the wrong assumption."**
- **"That used to fit the evidence; it doesn't fit as well now."**
- **"You've already tried something materially similar and it didn't help."**
- **"I don't think another suggestion from me is the best next step."**
- **"This may be worth keeping as a High."**
- **"That sounds like something you want to deliberately work on. Want me to keep it as a Focus?"**
- **"We can just think this through; we don't need to create anything yet."**

The exact wording may vary. The semantic discipline may not.

### Response-quality failure modes

A response fails even if eloquent when it:

- answers beyond admissible evidence;
- exposes or is materially steered by inaccessible private information;
- turns an interpretation into a fact;
- treats repeated reports as independent corroboration;
- invents a cause from correlation;
- assumes A or B merely to complete a workflow;
- creates an object because the user happens to be in that bucket;
- pushes action while the user is only brainstorming;
- asks questions whose answers are already available in governed context;
- keeps questioning after enough is known to offer a useful option;
- keeps suggesting after repeated failure should trigger help-seeking;
- treats role authority as empirical truth;
- presents external knowledge as local evidence;
- exposes kernel/database terminology instead of meaning;
- becomes verbose without increasing understanding;
- gives a generic supportive answer where a concrete governed action is available;
- silently changes the user's B.

## Expanded methodical conversation acceptance matrix

Implementation is not complete merely because each canonical object can be created. Acceptance must exercise end-to-end conversation through Home and every bucket/object Composer with realistic paraphrases and follow-ups.

At minimum test:

- A known / B unknown;
- B known / A unknown;
- A and B known / path unknown;
- A, B and path known / user wants to act;
- neither known / vague discomfort;
- brainstorming with no canonical object created;
- brainstorming that later crosses into deliberate Focus;
- user reports an outcome rather than asks a question;
- evidence shows original A was wrong or incomplete;
- evidence makes B worth reconsidering while preserving human agency;
- user reaches B and asks why it worked;
- user abandons or changes a Focus;
- Home conversation naturally creates a High, Low, Inquiry or Focus;
- each bucket Composer can handle intent outside its bucket without forcing classification;
- user asks to share with named individuals;
- user asks to share with an existing group such as midfielders;
- user creates an ad-hoc collaboration such as right back + right wing without creating a permanent org node;
- ambiguous role/group resolution requires clarification before sharing;
- shared object does not expose predecessor private conversation;
- individual/team/org Highs, Lows, Inquiries and Focuses can relate to relevant goals/traits/Focuses without mandatory attachment;
- a cross-level relationship never widens audience;
- goal/trait alignment never produces a hidden person score;
- conversation resumes an existing journey after time/reload rather than manufacturing a duplicate object;
- a user rejects a suggestion;
- repeated experiments fail and IntelliQ changes strategy;
- the appropriate next move is human help;
- the appropriate next move is simply conversation and no object/action;
- progressive "why/when/what changed/what have we tried/what next" questions remain consistent with the same governed evidence;
- prose remains concise at first response and deepens on request;
- provider paraphrase/code-switching does not change the deterministic privacy, audience, evidence or canonicalization result.

For each scenario, test both **what IntelliQ does** and the nearest dangerous thing it must **not** do. Mutation-test the governing assertions where feasible. A polished answer without the correct governed action is a failure; a correct backend mutation with awkward, misleading or machinery-exposing prose is also a failure.

## Evidence direction and polarity law

**Evidence contributes to direction before it contributes to polarity.**

Every admissible piece of evidence should be allowed to affect governed understanding where it is relevant. When a meaningful reference exists -- for example an individual, group or organization goal, trait, expected behaviour, Focus, hypothesis, desired B or prior understanding -- evidence may:

- support movement toward or consistency with that reference;
- support movement away from or inconsistency with it;
- contradict or complicate the reference itself;
- be relevant but directionally ambiguous;
- or be too weak/isolated to justify a directional conclusion yet.

High and Low are **human-facing governed standings over meaningful patterns**, not automatic wrappers around individual evidence events. One positive observation may contribute toward a High without manufacturing a High immediately; one negative observation may contribute toward a Low without manufacturing a Low immediately. Independent origins, repetition, corrections, contradiction, scope, recency and other canonical standing rules still apply.

A High may emerge when the governed body of evidence justifies that something meaningful appears to be going well, holding, improving or aligning with a desired direction. A Low may emerge when the governed body of evidence justifies that something meaningful appears worth attention, is deteriorating, obstructing a desired direction or materially conflicting with an expectation. Neither standing is required when the evidence remains ambiguous or the reference itself is questionable.

**Declared goals, traits, role descriptions and expected behaviours are reference context, not empirical truth.** Evidence that aligns with a description may support a High; evidence that conflicts may support a Low; but outcomes may instead show that the description or desired behaviour deserves reconsideration. IntelliQ must not label beneficial behavior a Low merely because it differs from a declared expectation.

Example: if a midfielder's role description says to play forward whenever possible, repeated recycling of possession is not automatically a Low. If governed outcomes show that recycling under particular pressure improves possession or progression, IntelliQ should be able to surface that the expectation itself may need refinement.

Evidence may relate across authorized individual, group/team and organization references without widening audience. The same evidence must not be copied into parallel truth stores simply to support different views; relationships should point back to canonical governed evidence/provenance.

### Required direction/polarity tests

Implementation must prove at least:

- a single positive observation can contribute toward a possible High without automatically creating one;
- a single negative observation can contribute toward a possible Low without automatically creating one;
- sufficiently supported independent evidence can produce the appropriate High/Low standing;
- repeated reports from one origin do not masquerade as independent corroboration;
- ambiguous evidence can remain unpolarized;
- contradictory evidence can weaken or complicate an existing High/Low rather than being discarded;
- a correction supersedes the corrected contribution without erasing provenance;
- evidence can support or conflict with individual, group/team and organization goals/traits/Focuses where authorized;
- alignment with a declared trait does not turn the declaration itself into evidence;
- evidence with beneficial outcomes can challenge a role description or expected behaviour rather than being mechanically labelled a Low;
- cross-level relationships do not widen readership or leak private evidence;
- one canonical evidence record can inform multiple authorized relationships without being copied into multiple truth systems.


## Pilot interaction model: governed discovery, deliberate Focus, participant-owned conversation

The following is founder-ratified pilot product law and should be implemented in the current closure stack rather than left as post-pilot R&D.

### One deliberate creation primitive

**Focus is the only primary intelligence object a human deliberately creates.**

High, Low and Inquiry are governed IntelliQ standings over evidence and unresolved understanding. A human may notice, suggest, challenge, discuss or contribute evidence toward any of them, but a command such as "create a High", "save this as a Low" or "make this an Inquiry" must not manufacture canonical standing merely because the user requested the label.

The three discovery standings are symmetric from the human interaction perspective:

- **High**: governed positive understanding -- something meaningful appears to be working, holding, improving or moving in a desirable direction.
- **Low**: governed attention-worthy understanding -- something meaningful appears to be deteriorating, obstructing a desired direction or otherwise worth attention.
- **Inquiry**: governed unresolved understanding -- a question/unknown is sufficiently valuable and unresolved to deserve standing.

Humans and the model may suggest any of the three. Their contributions enter the existing governed evidence/curiosity path. The kernel decides when evidence/question value justifies surfacing, strengthening, weakening, revising or retiring the standing. Do not create parallel \`create_high\`, \`create_low\` or user-commanded \`create_inquiry\` truth stores.

A human statement such as "I think this is a High" is an attributed contribution, not empirical truth. IntelliQ may say that evidence is not yet sufficient to call it a High, or that it fits an already supported pattern. High/Low/Inquiry remain alive as evidence changes.

### Home and bucket interaction

**Home accepts anything. High, Low and Inquiry buckets provide context, not cages.**

The Home Composer may naturally receive observations, questions, goals, outcomes, brainstorming and explicit desire to work on something. It may contribute to High/Low/Inquiry standing or lead to a proposed Focus.

Within Highs, Lows and Inquiries, the same Composer remains available. The bucket gives useful contextual prior but does not force the user's turn into that classification. A statement in Low may weaken the Low, support a High, raise an Inquiry or lead toward Focus. A statement in Inquiry may answer it, complicate it or lead toward Focus. A statement in High may challenge the High or deliberately seek to strengthen what is working.

Do not expose ontology commands as the normal UX.

### Focus creation is a conversational commitment

A Focus is different because it represents deliberate human choice of a B worth working toward.

When conversation reaches a sufficiently clear candidate B, IntelliQ may propose a Focus. It must not silently create one. The smallest natural flow is:

1. reflect the proposed B in human language;
2. establish whether this is genuinely deliberate work rather than brainstorming;
3. ask who should participate: **just the person or other members too**;
4. resolve named people, governed groups/roles or ad-hoc participants against authoritative organization membership;
5. clarify ambiguity before consequential sharing;
6. show the proposed audience/commitment where confirmation is consequential;
7. human confirms;
8. existing canonical Focus owner creates the Focus;
9. the Focus appears in Focuses and the authorized participant can continue working on it.

Do not require a form for title/status/visibility/category/metric merely because those fields exist internally. Do not create permanent org-tree nodes for ad-hoc collaboration.

A Focus can arise from Home, High, Low, Inquiry or an existing Focus conversation. Same B with refined A or a changed tactic normally continues the existing Focus. A materially different B requires explicit human choice before a new Focus or material revision.

### Conversation belongs to its author/participants and travels with them

**The object does not own the conversation. The author/participants own the conversation.**

A conversation may begin on Home and later become related to a High, Low, Inquiry and Focus as the person's journey evolves. That conversation follows its authorized author/participants across those transitions. Moving from Low -> Inquiry -> Focus does not reset the person's journey and does not transfer ownership to the object.

The same canonical object may therefore have multiple participant-owned conversations. Tatenda may have a private conversation around a Low, Tyler may have a different private conversation around the same Low, and Coach may have another. Shared access to the Low never grants access to one another's private conversations.

When a person invites new members while creating or working on a Focus, the new members do not inherit predecessor private conversation. Existing participants retain their own journey. New participants receive only the shared Focus/object context they are authorized to read and may begin their own participant-owned conversation or participate in an explicitly shared conversation/Forum.

**Relationship does not imply readership. Object membership does not imply predecessor-chat readership.**

### New Chat is valid inside every intelligence space

Home, High, Low, Inquiry and Focus should allow **New Chat**.

New Chat means a fresh transcript/conversational session from the current context. It does **not** mean a new High/Low/Inquiry/Focus and does not erase governed memory.

When a new chat begins around an existing object, IntelliQ may use the current object's authorized understanding, relevant evidence, outcomes, organizational learning and admissible summaries from the participant's earlier conversations. The UI need not force years of work into one immortal transcript.

The product should preserve continuity of understanding while allowing clean conversational sessions.

### One shared object-page skeleton

High, Low, Inquiry and Focus should use the same interaction skeleton. Their semantics and displayed intelligence differ; the human interaction architecture does not.

Each object view should provide, as applicable:

1. **Header** -- concise title, type/standing/status, audience/participants and material change state.
2. **Current useful understanding** -- the minimum information a person needs to understand why this object matters now.
3. **Relevant uncertainty/evidence/learning** -- progressively disclosed rather than database machinery.
4. **Your chats / participant chats** -- authorized participant-owned conversations and New Chat.
5. **Forum** -- when a governed multi-person Forum is available.
6. **Composer** -- always available to talk naturally to IntelliQ about the object.

Object-specific content may include:

- High: what appears to be working; why; what remains uncertain or could change the standing.
- Low: what appears worth attention; why; contradictions/unknowns.
- Inquiry: the unresolved question; what is known; plausible explanations; what would most improve understanding.
- Focus: working-toward B; current A/where things stand; attempts/actions; outcomes; what is being learned.

Focus is semantically downstream/deliberate, but it does not require a completely different page architecture.

### Private chat and Forum are distinct conversational surfaces

Every object may have participant-owned chat with IntelliQ. When the governed audience permits a multi-person Forum, the object may also expose Forum as the human-to-human collaborative surface.

Forum does not read private chats. Private conversation does not become Forum merely because it concerns the same object. Governed sharing may contribute admissible material without exposing private wording or predecessor transcript.

A subtle people/Forum control near the object header is preferable to exposing authorization machinery in the body.

### Remove legacy keep/private-note interaction from the primary product

Private conversation is already private according to its audience. IntelliQ should not ask users to "keep this private", "save this privately", "remember this privately" or create generic private-note records as the normal response to ordinary conversation.

Do not make the human manage memory machinery.

- **Focus** is the explicit action for deliberate work.
- **Library** is the explicit surface for material intentionally kept as reference.
- **Evidence/intelligence** is handled through governed canonical paths.
- **Conversation** persists according to participant/audience and retention law.

Legacy proposal cards/actions whose product meaning is merely "keep this -- private to you" should be removed or consolidated away from the primary conversational experience once production ownership is traced and regression coverage exists.

Do not ask "save this to Library?" after every Focus creation. A Library suggestion is appropriate only when there is a distinct reference artifact/material worth keeping, such as a plan, document, source or useful generated summary.

### Focus-derived organizational learning

**A private Focus journey is not itself automatically organization-readable evidence. Its governed, admissible derivative learning may become reusable organizational precedent.**

The organization may learn from authorized Focus journeys without inheriting the person's identity or private conversation. A reusable derivative may include, where governance permits:

- a comparable A/context;
- the shape of the chosen B;
- intervention/action attempted;
- recorded outcome;
- conditions/limitations;
- resulting learning and uncertainty.

Do not transport private wording, private notes, predecessor transcript or identity merely because the journey was useful. Do not claim causation from sequence.

This reusable transition knowledge supports the racecar law: over repeated A -> B cycles the organization learns how it tends to improve under particular conditions.

When another authorized person encounters a materially comparable A, IntelliQ may use admissible organizational precedent before inventing another tactic. Similarity is not proof that the same path will work.

If reasonable model-generated options, organizational precedent and appropriate external knowledge are exhausted, human help may be the highest-information next move. Existing consent-bound experience routing law applies: IntelliQ may ask a potentially relevant person whether they are willing to help without revealing their private history to the seeker.

Anonymous mediated experience-sharing is a **Priority R&D extension**, not required to block the Coach pilot. Direct identity disclosure requires appropriate consent.

### Minimal surface, expandable depth

**IntelliQ starts concise; it is not permanently constrained to be concise.**

For the pilot, concise mobile-first responses remain the default. Long-term product law is minimum useful answer first, with progressively deeper reasoning when the person asks for it. A fixed word ceiling is an implementation default, not epistemic/product law.

"Why?", "show me the evidence", "walk me through everything we have tried", or an equivalent request should allow the model to provide materially more detail while preserving the same deterministic privacy, evidence, provenance and uncertainty envelope.

Post-pilot, IntelliQ may learn or honor user presentation preferences (for example summary-first versus detailed reasoning) without changing truth standards, authorization, privacy or confidence.

### Visualizations must communicate meaning

Do not visualize data merely because data exists.

A graph/timeline belongs on an object only when it helps a person understand a material pattern, change, contradiction, trajectory or outcome. A dot showing that a recorded event exists, raw graph topology, record-count machinery or explanatory database language should not dominate the default object surface.

Prefer human meaning such as "changed recently", "appearing consistently", a useful trend over time, or competing evidence directions. Richer Web/graph exploration may exist as deeper disclosure/R&D rather than mandatory object-page chrome.

### Pilot acceptance additions

Before Coach-ready closure, registered production-path proof should cover:

- user cannot manufacture High, Low or Inquiry standing merely by commanding the label;
- a user's suggested High/Low/Inquiry is preserved as attributed contribution/question through existing governed evidence/curiosity ownership;
- independent governed evidence can cause High/Low/Inquiry to surface without a user create command;
- Home can naturally contribute toward any discovery standing and can propose a Focus;
- High, Low and Inquiry bucket Composers provide context without forcing classification;
- Focus proposal asks whether it is private to the current person or includes other members before consequential sharing;
- named member/group/ad-hoc audience is resolved and confirmed through existing authority;
- confirmed Focus appears in Focuses and is resumable after reload;
- predecessor participant-owned conversation remains available to its author/participants when the journey transitions into Focus;
- newly invited participant cannot read predecessor private conversation;
- two different people can hold separate private chats around the same object without cross-read;
- New Chat around an existing High/Low/Inquiry/Focus creates a fresh transcript without creating a duplicate object or losing governed object context;
- Forum availability follows canonical live audience rules and never imports private chat;
- legacy generic "keep this/private to you" action is not offered as the normal response to ordinary Home conversation;
- Library remains a reference-material surface rather than a prerequisite for conversational memory;
- Focus-derived reusable organizational learning excludes predecessor private wording/identity and preserves outcome/causal uncertainty;
- object views expose a common interaction skeleton while presenting type-appropriate intelligence;
- meaningless record-existence visualization is not required for an object to be usable;
- initial prose can remain concise while explicit requests for deeper reasoning are not artificially truncated by a fixed product-law word ceiling.

## Priority R&D extensions from the pilot interaction model

These are aligned with the architecture but should not delay Coach closure unless already safely present:

- consent-bound anonymous mediation between people with materially comparable prior Focus journeys;
- adaptive per-user response-depth/presentation preferences;
- live wearable/sensor-assisted Focus loops, including explicitly authorized health/fitness signals;
- richer meaningful temporal/Web visualization over accumulated A -> B journeys.

Wearable/sensor direction must preserve the same architecture: external signal -> governed provenance/scope -> evidence -> current A/Focus context -> observation/outcome -> learning. A biometric or sensor reading is evidence, not an automatic diagnosis, causal claim or command.
