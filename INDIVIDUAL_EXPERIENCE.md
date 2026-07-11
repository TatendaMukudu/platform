# IntelliQ — The Individual Experience (Spaces)

**Status:** design RFC (founder + GPT + Claude). Destination architecture for the
individual experience. Companion to `COUNCIL_BRIEF_2026-07-09.md` and its north
star: *the agent does the labor; the human keeps the growth.*

---

## The vision (founder, distilled)

Stop building a better notes/journal/chat app. Build an environment where **the
AI does the cognitive labor and the human thinks, learns, and decides.**

- **One universal composer.** Not separate Notes / Check-ins / Reflections /
  Uploads / Assessments — **one input.** Text, voice, PDF, spreadsheet, photo,
  video, screenshot, link, connected app, calendar, health data all enter the
  same way. The AI decides *what it is, where it belongs, what it relates to,
  and what work happens next.* The user rarely organises anything.
- **Spaces, not features.** MySpace becomes a set of living **Spaces** (Me,
  Soccer, School, Startup, Career, Family…). A Space is not a folder — it's an
  environment where people, media, AI reasoning, history, and work accumulate
  around one context.
- **The AI has already worked before you arrive.** Entering a Space, you don't
  see an empty chat — you see *"I've reviewed what changed since you were last
  here; I prepared three recommendations; two things worth discussing."*
- **Every input runs one lifecycle:** input → AI reasons → connects to existing
  knowledge → prepares useful work → **human approves** → AI executes → Space
  updates.
- **Shared Spaces.** Optionally collaborative (assistant coaches, a tutor, a
  teammate, a counselor) — the AI reasons across the Space **respecting
  permissions**, and is **explicit about whose interests it is advocating for.**
- **Continuous reasoning.** The system keeps working between visits — waiting for
  evidence, reviewing new data, preparing tomorrow's meeting. Alive, not reactive.
- **Design philosophy:** simplicity over features, intelligence over dashboards,
  context over navigation, reasoning over chat, execution over conversation,
  proactive over reactive. Every screen answers: *how do we reduce thinking about
  software so the user thinks about what matters?*

---

## Claude's council assessment (honest)

### This is coherent — it's the front door to the kernel we already built
This is **not a pivot.** Nearly every piece maps onto existing substrate:

| Vision element | Existing kernel piece |
|---|---|
| One universal composer | source adapters (`ai/adapters.js`) + the one Signal shape |
| A Space (context boundary) | the universal primitives — an **Aim** over Actors/Signals/Relations/Events |
| "AI already worked before you arrive" | proactive **Coach**, gated by the **Confidence Engine** |
| Every input → reason → prepare → approve → execute | the **Reason → Coach** spine + the Part 3 "offer, then authorize" pattern |
| Explicit advocacy / permissions | the ratified **privacy governance** (self-owned model; Platform never sees raw) |
| Continuity across visits | the **Person Model** we just shipped |

That's the reassuring part: **we don't need new intelligence, we need a new
surface over the intelligence we have.** That should discipline the build.

### The one risk that matters most: this is a cathedral, and no one is in the building
Every element here — Spaces, the composer, continuous reasoning, multimodal
ingestion, collaborative permissions, advocacy UI — is a multi-month surface.
We have **zero real users.** Building all of it before one real person validates
the *feeling* is the classic founder mistake. The vision is right as a
**destination**; it is dangerous as a **sprint.**

### Three ideas are gold — build them, in this order
1. **The one universal composer.** The single strongest idea. It kills the chore
   problem at the root: the user stops thinking about *how* they contribute.
2. **The "AI already worked" open-state** for a single Space ("Me"). This is the
   feeling — "IntelliQ already understands." Deliver it once, well.
3. **Explicit advocacy + permissions.** The thing that makes shared Spaces trusted
   instead of surveillance. Design it early even if sharing ships later.

### Two things are traps if taken literally now
1. **"Continuous reasoning" → pin it to event-triggered, not a clock.** "Feels
   alive" can mean *reason when new input arrives* (cheap, sane) or *poll and
   infer on a loop* (ruinous cost + complexity with no revenue). Start
   event-driven. The Space reasons when something changes, not every minute.
2. **"The AI auto-files everything" is the hardest AI problem here — and if it's
   wrong the user does MORE work, not less.** Auto-routing multimodal input into
   the right Space with the right connections is 80% magic / 20% infuriating.
   Non-negotiables: a **confidence threshold** (when unsure, *ask* rather than
   mis-file) and a **one-tap correction** that updates the Person Model. Wrong
   auto-organization is worse than a form.

### "Forget the current implementation" — yes to the UI, no to the engine
Redesign the *mental model* and the front door — absolutely. But do **not** throw
away the backend: the check-in / signals / notes endpoints (now security-hardened)
and the Person Model are the substrate the composer sits on. The composer is a new
**steering wheel**, not a new engine.

### Advocacy is philosophically excellent and operationally our hardest privacy problem
"The AI is explicit about whose interests it represents" is the right answer to
the surveillance risk — and in a shared coach/player Space it's genuinely hard:
the instant the AI summarises upward something a player shared privately, we're
back to surveillance. The governance we built (self-owned model, Platform never
sees raw) is the foundation; Spaces need it extended to **per-participant
visibility** and a **per-Space AI stance** ("in this Space I advocate for the
player; the coach sees themes, never private words").

---

## Council round 2 (2026-07-09) — sharpening the identity

GPT weighed in (9.8/10) and pushed the identity sharper. Founder agrees; Claude
concurs with the guardrails below. Now canon.

### 1. Contexts, not storage Spaces
A Space is not another place to store things — it is **a different version of the
intelligence.** The kernel is identical; the *reasoning stance* changes with the
context: Soccer → performance coach, Startup → cofounder, School → tutor. This is
literally our **"no logic, yes parameters"** law at the UX level — the Domain Pack
parameterises the kernel's stance. Far more valuable than folders.
> *Claude's guardrail:* the persona is a **lens, not a license.** The stance
> changes tone, priorities, vocabulary — never the product laws. Soccer-coach
> IntelliQ still gives no scores, stays self-relative, stays privacy-gated.
> "Context" is the architecture truth; the user-facing label can stay warm
> ("your Soccer").

### 2. The composer's positioning: "What happened?" not "What are you trying to do?"
Every productivity app makes the user declare intent and structure first.
IntelliQ asks only *what happened* and figures out the rest. That inversion is
the monopoly feature.

### 3. Proactive is the whole first experience
The home screen **is** the briefing — no "Start typing…". *"Good evening. Since
yesterday: recovery improved; tomorrow looks overloaded; a conflict between your
goals and your calendar; your coach mentioned something worth discussing.
Review?"* The user has done nothing; the software already has.

### 4. Reasoning is the interface — chat is almost last
A context opens as a reasoning surface: **Intelligence · Things I've noticed ·
Questions · Suggestions · Pending approvals · Recent evidence · People · Goals ·
History · Media · Chat** (chat last, on purpose). This is the UX consequence of
the Reason/Coach split — reasoning is the product, chat is one capability.

### 5. Memory is organised by reasoning, not chronology
Not "Yesterday / Tuesday / Last week" — instead **Current priorities · Emerging
patterns · Unresolved questions · Evidence · Contradictions · Decisions.** Humans
think in people/goals/patterns/decisions, not transcripts. The kernel already
produces this shape; the UI must expose it instead of a timeline.

### 6. The lifecycle closes with LEARN
`Input → Reason → Connect → Recommend → Approve → Execute →` **`Observe outcome →
Learn → Update Person Model.`** Execution isn't the end — it creates new evidence
that changes the model. This is what makes IntelliQ improve over *months* instead
of just completing tasks. We built the pieces (Learner agent, the `/outcome`
feedback, the Person Model update); the weak link is the **outcome signal** — it
needs the human to report or the system to detect it. Nurture it.

### 7. Epistemic honesty — the AI may admit uncertainty
*"I have two competing explanations for why sales dropped — A and B. I need one
more piece of evidence before I'm confident."* Rare in AI products, and it fits
our Confidence Engine + correlation-not-cause + causal-ladder work.
> *Claude's guardrail:* surface competing hypotheses only when the kernel
> genuinely has divergent signals — gate it like everything else, or it becomes
> theatre ("A: good; B: bad"). A destination feature, not Phase 1.

### The sharpened identity (the 0.2 to a 10)
Think in **contexts, not storage**; make **proactive intelligence the first thing
every user experiences**; let **reasoning, not chat, be the primary interface**;
**close the loop with learning from outcomes.** Then IntelliQ stops being "an AI
productivity app" and becomes an OS that quietly understands every domain of your
life and prepares work before you ask.

---

## Suggested phasing (council-agreed sequence)

1. **Universal composer** — one input; the AI decides what it is.
2. **One "Me" context** — a single reasoning stance to start.
3. **Proactive home** — "I've already done the work" is the first screen.
4. **Event-driven reasoning** — reason on new input / on entering a context (not a clock).
5. **Approval workflow** — the Recommend → **Approve** → Execute step, visible.
6. **Multi-context** — Soccer, School, Startup (each a reasoning stance, not a folder).
7. **Shared contexts** — explicit advocacy + per-participant permissions.
8. **Connectors + richer automation** — calendar, health, connected apps; the Learn loop deepens.

This gets the **core feeling** into a real user's hands at step 3, with the
smallest surface. Everything after earns its place from real use. Ship the
feeling first; the cathedral comes later, one validated brick at a time.

---

## Open questions for the council
1. **Person Model scope:** one model per person spanning Spaces, or one per Space?
   (A "Me" that knows you everywhere vs. context-specific understanding.)
2. **Composer confidence threshold:** what's the bar below which the AI *asks*
   where something belongs instead of auto-filing?
3. **"Continuous" reasoning:** agree to start event-triggered (reason on new
   input / on entering a Space), not a background clock?
4. **Advocacy model:** how does the AI declare and enforce "whose side I'm on" in
   a shared Space, and how is that surfaced to every participant?
5. **Phase-1 cut:** is composer + single "Me" context + proactive open-state the
   right smallest wedge, or is there a smaller one that still delivers the feeling?
6. **What breaks a product law?** Anything here — especially shared-context
   summarisation — that the privacy tests must guard before we build it?
7. **Context = reasoning stance:** should each context map to a Domain Pack that
   parameterises the kernel's tone/priorities, with the product laws held
   constant across all of them? (Claude's position: yes — persona is a lens,
   never a license.)
8. **Reasoning-first layout:** adopt the section order (Intelligence → … → Chat
   last) as the standard context view, replacing the chronological timeline?
9. **Epistemic honesty:** what's the evidence bar for surfacing competing
   hypotheses so it never degrades into theatre?

---
*Founder is not the relay — weigh in on the linked RFC issue. A weigh-in that
isn't in the repo didn't happen.*
