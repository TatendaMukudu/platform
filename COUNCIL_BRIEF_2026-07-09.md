# Council Brief — 2026-07-09

For the council (Codex, GPT, founder). Three parts: **(0)** the north-star
principle to build against, **(1)** what shipped this session, and **(2)** a
proposal to turn Check-In into a conversation, for discussion before anyone
builds it. Truth layer (`npm test`) is green on `main`.

---

## Part 0 — North star: *the agent does the labor, the human keeps the growth*

The problem with the product today is that it is **extractive**: the user does
the work (fills the form, picks the mood, writes the line) and the value flows
elsewhere (a dashboard, a leader, a report). Effort in, benefit elsewhere — the
definition of a chore. Polish doesn't fix that; only reversing the direction of
value does.

**The principle:** the app works *for* the person. It notices, remembers,
connects, drafts, and triages in the background — and the only thing it ever
asks of them is the one act a machine genuinely can't do: an honest reflection,
a real decision, a moment of care. Everything else is carried for them. This
holds **regardless of node**:

- **Member:** no "complete your check-in" (chore). The agent opens from what it
  noticed about *them* ("Three good weeks in a row — what's clicking?"). They
  reply. Tracking, baselines, patterns stay backstage. They never see
  "analytics"; they see a mirror that knows them.
- **Lead node:** no "go review the dashboards" (chore). The agent already read
  everything and brings the *one* thing worth attention today, with a gentle way
  in. The leader's job shrinks to the human part — the conversation.

Same engine (the kernel's five agents — Observe, Remember, Connect, Reflect,
Improve), same felt experience of *something is working for me*, for everyone.

**Two hard constraints this principle lives or dies by:**
1. **The member's agent must visibly be *theirs*, not a monitor.** On a people
   product, "everything in the background" is one step from surveillance. The
   instant a member suspects the agent reports on them to the boss, the growth
   environment is dead. The privacy law (sensitive context *informs* but is
   never quoted or surfaced upward) is load-bearing here, not a checkbox.
2. **Restraint, or "background" becomes overwhelm.** An agent that surfaces
   everything it does backstage is *more* overwhelming, not less. The skill is
   what it *doesn't* show. The agent must **earn the right to interrupt**
   (extend the Confidence Engine's suppression to the whole UX). Silence is a
   feature; one thing at a time; rhythm over frequency.

**Agentic ≠ input-free.** If you automate away the reflection you automate away
the growth. Strip every *chore*; keep the one irreducible human act.

---

## Part 1 — Shipped this session

### 1a. Extended demo seed to ~6 months (`scripts/seed.js`) · commit `b38a028`
Back-dated check-ins now span 182 days with long, stable baselines and the
story arcs playing out only in the recent weeks — so the kernel's 90-day
self-relative window has real history to read against. Overload training-load
metric extended to 126 days. Verified the trajectories still produce the
intended patterns (quiet / overload / improving / steady).

### 1b. `AGENTS.md` — the shared contract · commit `b38a028`
The rules every agent works under: green-before-merge, the 9 product laws, the
privacy law, the repo map, the council's division of labour. Codex reads
`AGENTS.md` by convention — **this is the file that puts Claude and Codex on the
same rules.**

### 1c. Uniform inputs + monochrome icon system · commit `c565db8`
Two pieces of pilot feedback ("inputs aren't uniform", "emojis on everything"):

- **Uniform inputs.** Root cause: the global CSS reset stripped all input
  styling and only `.form-control` re-added it, so `.form-input` /
  `.search-input` fell back to transparent, borderless fields and `.note-input`
  diverged again. Now **one canonical rule** styles the whole form family
  identically (background, border, radius, padding, font, focus, placeholder).
- **Icon system.** Replaced coloured emoji in the chrome with a **monochrome,
  stroke-based line-icon set** (`ICON` map in `js/data.js`, inherits
  `currentColor`), injected via a `hydrateIcons()` slot filler. Covers nav,
  topbar, empty states, note chips, the Anonymous buttons, and admin card
  headers. Mode badge now shows the org name instead of a stale industry label.
- **Kept on purpose:** the mood faces on Check-In (a functional 5-point scale)
  and typographic glyphs (arrows, checks).
- Bumped asset cache-busters (`?v=20260709a`) so deployed clients pull the new
  CSS/JS instead of a cached build.

**Still emoji-laden (follow-up):** the deeper admin/leader analytics screens
rendered in `js/app.js` (~296 emoji in that one file). The icon system is in
place; extending the sweep there is straightforward but was scoped out to keep
this diff reviewable.

---

## Part 2 — PROPOSAL (for discussion): Check-In as a conversation

### The problem (founder's words)
> "Can't we get a check-in to be like a conversation between the user and the
> app? ... it's not doing much after that."

Correct. Today's flow is: pick mood → write a line → **submit → one-shot
reflection → "done" screen.** The AI answers once and the door closes. It reads
like a form, not a relationship. Notes should stay their own thing (a durable
record you write and keep) — **agreed, keep them separate.** Check-In is the one
we make feel alive.

### The idea: a short, warm exchange (2–4 turns), not a form
1. One tap on mood (unchanged — instant, never blocked on AI).
2. User writes a line.
3. IntelliQ **reflects + asks one good follow-up** — self-relative, privacy-safe
   ("That's a shift from your usual week — what changed?").
4. User can reply once or tap **Done**. Then IntelliQ closes warmly.

Feels like texting a perceptive coach who remembers you. That back-and-forth is
the reason someone opens it tomorrow.

### Why this is mostly wiring, not new infrastructure
The parts already exist:
- **`ChatEngine` (`js/chat.js`)** — turn-taking reflection UI, already used
  post-scenario. Reuse it as a compact pop-up on the check-in screen.
- **`/api/checkin/freeform`** — already calls the AI and returns a reflection.
  Extend it to accept a `messages[]` thread and return the next turn.
- **Coach agent (`ai/agents.js` `coachReflectionPrompt`)** — already
  self-relative, no scores. It becomes the conversation's system prompt.
- **Gateway (`ai/gateway.js`)** — Claude primary, OpenAI fallback. Already there.
- **Kernel memory (baselines, deviations)** — can seed a *proactive opener*
  later ("Yesterday sleep was off — how'd tonight go?").

### Guardrails (these keep it honest and cheap — and testable)
- **Bounded:** 2–4 turns then a graceful close. Not a chatbot rabbit hole, not a
  therapist. One good follow-up beats ten.
- **Never blocks the check-in:** mood + first line save immediately; the
  conversation is additive. Slow or failed AI → fall back to today's one-shot
  reflection. The data is never lost to a network hiccup.
- **Privacy law holds:** sensitive content *informs* the reply but is never
  quoted back and never surfaced to leaders (existing gate + `privacy-smoke`).
- **Self-relative, no scores, no diagnosis** — existing invariants already
  forbid this; we add a check that the conversation obeys them too.
- **Cost-capped:** turn cap + short max-tokens per turn.

### "Like a Siri" — two readings
1. **Conversational** (text back-and-forth) — this proposal, Phase 1.
2. **Voice** — add speech-to-text on the check-in box via the browser's Web
   Speech API. Cleanly a Phase 2; no backend change.

### Suggested phasing
- **Phase 1** — turn the one-shot reflection into a 1-follow-up exchange, reusing
  `ChatEngine` in a compact panel on the check-in screen. Small, shippable.
- **Phase 2** — voice input; a proactive opener seeded from the kernel's memory.
- **Phase 3** — the opener gets genuinely personal from baselines & deviations
  (the mirror that remembers).

### Truth-layer additions this would need
- **Invariant:** the check-in conversation is bounded (≤ N turns), stays
  self-relative, asserts no diagnosis, never quotes sensitive text.
- **Golden case:** the follow-up prompt shape (reflect + exactly one question).
- Rule stays: fix a bug → add a golden case; new capability → new invariant.

---

## Part 3 — The agent as a *resource*: prompt → insight + tools + offered actions

Extends Part 0. The agent isn't a reporter that answers and stops — it's an
**on-demand resource that acts.** A natural-language prompt turns into three
things: **(a)** insight pulled from the person's own data, **(b)** suggested
tools (a chart, a focus area), and **(c) actions it offers to take for them** —
always *offered*, never done unilaterally. It responds with a short menu of what
it can do next, not a dead-end answer.

### Two flagship interactions

**Member — "How can I improve?"**
The agent pulls from data and answers with a resource + a menu:
> "Your strength numbers in the gym have been trending down over the last three
> weeks. A few things I can do:
> - Draft a request to the weight trainer for a session — you approve it, or I
>   send it with what I'd suggest
> - Show you the trend as a chart
> - Point you at the two areas where you've dipped most"

A path forward and support routed to the right person — not a dead-end score.

**Lead node — "How is the team suffering?"**
The agent assembles an analyst's breakdown: patterns across recent games, themes
from what players have surfaced (**as themes and signal — never private quotes**),
and where a **disjoint** shows up (e.g. the team's self-report diverges from
results, or one group's load is up while morale is down). Then it offers:
> - A graph of the divergence
> - The two areas most worth focusing on
> - A draft message to the group, or to one player, for you to approve

A breakdown plus the tools to act — not a wall of dashboards to mine.

### The disciplines that keep this a resource, not surveillance
1. **Offer, then the human authorizes.** The agent drafts and proposes; it never
   sends a message to a third party (trainer, player) or takes an outward action
   without explicit approval. The human keeps the decision — the north star, and
   what keeps the agent *trusted*.
2. **The coach breakdown obeys the privacy law.** "What players have said"
   surfaces as *patterns, themes, aggregate signal* — never quoted private or
   sensitive disclosures, never individual attribution of protected content. A
   member's sensitive content *informs* the pattern; it is never exposed upward.
   **This is the exact line between resource and surveillance.**
3. **Suggestions are earned, not fabricated.** "Your strength is down" only fires
   when the data supports it (Confidence Engine gates it). No confident claims on
   thin evidence.
4. **Scoped by permission.** The actions the agent offers respect org structure —
   who can request what, and who a message may route to.

### What it's built on (mostly exists already)
- Kernel patterns, cross-signal connections, deviations, structural patterns →
  the "insight from data."
- Messaging + signals + groups → the "offered actions" (draft a request, route
  to a trainer/group).
- Chart.js (already loaded) + `js/charts.js` → "show me a graph." When we build
  these, use the dataviz design system so charts read as one coherent, accessible
  set in light and dark.
- Confidence Engine + privacy gate → disciplines 2 and 3 above.

---

## Part 4 — Council decisions (2026-07-09): three ratified architectural additions

GPT weighed in (via founder), approved the direction, and proposed three
additions. Founder agrees; Claude concurs with the refinements below. These are
now canon in `AGENTS.md §1`.

### 4.1 Separate **Reason** from **Coach** in the kernel
The kernel gains an explicit **Reason** stage — private internal cognition
(confidence + causation discipline, may consult sensitive signals) — distinct
from **Coach**, the *only* external face (warm, self-relative, privacy-gated).
Spine becomes: **Observe → Remember → Connect → Reason → Coach → Learn.**
> *Rule: the kernel reasons first; the person experiences coaching.* Reasoning is
> backstage and never surfaced raw. This also sharpens privacy — the Reason layer
> may use restricted signals; only the gated Coach output reaches a human.

### 4.2 **Proactive by default** — the AI increasingly initiates
The long-term default is the AI opening meaningful check-ins, not waiting for a
form: *"You slept earlier than normal yesterday — how are you feeling?"* /
*"Three weeks ago this would've stressed you; today you handled it differently —
what changed?"* Those don't feel like prompts; they feel like being remembered.
> *Claude's refinement (reconciles with the restraint law):* proactivity is the
> **destination**, gated by the Confidence Engine + timing. Silence stays the
> default *until earned*; the Person Model is what earns the right to open. So
> Phase 1 still starts with one reactive follow-up, and the AI graduates to
> proactive openers as its model of the person becomes reliable. Proactive ≠
> frequent — it means *initiating when there's something worth saying.*

### 4.3 The **Person Model** — every interaction updates the user's evolving model
The biggest addition, and the competitive moat: **continuity.** Not LLM
fine-tuning — structured *understanding* that compounds. Every conversation
updates confidence, baseline, preferences, timing, coaching style, communication
style, motivators, and what overwhelms them. After two years IntelliQ shouldn't
just remember facts; it should understand the person's patterns better than any
other software. This is the Learner stage, made first-class.
> *Claude's additions:* (a) **governance** — the person can *see and correct*
> their model (trust *and* accuracy); it's theirs. (b) **the two-product line** —
> IntelliQ exposes the model to the individual; Platform sees org-level patterns
> but **never** a member's private model. (c) **honesty** — the model asserts only
> understanding it can evidence (confidence-gated), same law as everything else.

### Product identity (council-ratified)
- **IntelliQ** = lifelong *personal* intelligence (understands an individual over time).
- **Platform** = *organisational* intelligence (understands teams and orgs).
- **Kernel** = universal reasoning over signals from any domain — shared, not duplicated.

### Truth-layer additions these imply
- **Reason is private:** internal reasoning is never surfaced raw to a human.
- **Person Model honesty:** it claims only evidenced understanding; it is
  inspectable and correctable; Platform never receives a member's private model.
- **Proactive openers** are confidence-gated and never quote sensitive content.

---

## Open questions for the council
1. **Turn cap:** is 1 follow-up (Phase 1) the right first step, or go straight to
   2–3? (Founder taste call; I lean 1 — prove it's wanted before deepening.)
2. **Opener:** neutral prompt first, or proactive-from-memory from day one?
   (Proactive is the magic but leans harder on the kernel + privacy gate.)
3. **Model routing:** Claude for the reflection turn by default, OpenAI as
   fallback — agreed? Any case for GPT on the opener?
4. **Voice (Phase 2):** in scope for the pilot, or after?
5. **Anything here that breaks a product law** you'd flag before we build?
6. **Action authorization (Part 3):** default to *draft-and-approve* for every
   outward action (agent never auto-sends to a third party), or allow a
   trusted-auto mode the user opts into per action type?
7. **Coach-breakdown altitude:** what granularity of "what players have said"
   stays firmly on the resource side of the privacy line — themes only? theme +
   anonymized count? (Never individual attribution — agreed?)
8. **Capability menu:** surface the agent's "here's what I can do" list
   proactively (contextual to the prompt) or only when asked? (Ties to restraint.)
9. **Charts on demand:** which visual vocabulary first — self-vs-own-baseline
   trend, self-report-vs-result divergence, or load-vs-morale?

**Division of labour if we proceed:** GPT on the conversation design / prompt
architecture; Claude + Codex split implementation and review each other's diff;
the tests decide. Nothing merges red.
