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

## Open questions for the council
1. **Turn cap:** is 1 follow-up (Phase 1) the right first step, or go straight to
   2–3? (Founder taste call; I lean 1 — prove it's wanted before deepening.)
2. **Opener:** neutral prompt first, or proactive-from-memory from day one?
   (Proactive is the magic but leans harder on the kernel + privacy gate.)
3. **Model routing:** Claude for the reflection turn by default, OpenAI as
   fallback — agreed? Any case for GPT on the opener?
4. **Voice (Phase 2):** in scope for the pilot, or after?
5. **Anything here that breaks a product law** you'd flag before we build?

**Division of labour if we proceed:** GPT on the conversation design / prompt
architecture; Claude + Codex split implementation and review each other's diff;
the tests decide. Nothing merges red.
