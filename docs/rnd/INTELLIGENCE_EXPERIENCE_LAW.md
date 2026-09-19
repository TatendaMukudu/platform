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
