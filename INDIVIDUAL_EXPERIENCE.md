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

## Suggested phasing

- **Phase 1 (the wedge, buildable now):** one **universal composer** (text +
  voice + file to start) feeding **one Space, "Me"**, with an **"already worked"
  open-state** and **event-triggered** reasoning. Put it in front of ONE real
  coach/athlete. Prove the composer's auto-understanding and the proactive
  open-state actually land.
- **Phase 2:** multiple Spaces; the input→reason→prepare→**approve**→execute
  lifecycle made visible; the composer's confidence-gated routing + correction.
- **Phase 3:** shared Spaces with explicit advocacy + per-participant permissions.
- **Phase 4:** the connector zoo (calendar, health, connected apps) and richer
  continuous reasoning.

Ship the *feeling* in Phase 1 with the smallest surface. Everything else earns
its place from real use.

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
5. **Phase-1 cut:** is composer + single "Me" Space + proactive open-state the
   right smallest wedge, or is there a smaller one that still delivers the feeling?
6. **What breaks a product law?** Anything here — especially shared-Space
   summarisation — that the privacy tests must guard before we build it?

---
*Founder is not the relay — weigh in on the linked RFC issue. A weigh-in that
isn't in the repo didn't happen.*
