# Council Brief — 2026-07-09

For the council (Codex, GPT, founder). Two parts: **(1)** what shipped this
session, and **(2)** a proposal to turn Check-In into a conversation, for
discussion before anyone builds it. Truth layer (`npm test`) is green on `main`.

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
