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
