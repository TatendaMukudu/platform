# IntelliQ + Platform — Session Review

**Date:** 2026-07-13
**Branch:** `claude/platform-work-summary-nmb0cm`
**Scope of this document:** everything built across this working session, plus an
honest read on what's strong and what's weak about the product as it stands
heading into the August pilot window.

---

## 1. What this product is (so the review makes sense)

One shared kernel, two lenses:

- **IntelliQ** — the individual's private growth record. Reasons about a person
  from whatever signals exist, coaches them, and keeps their sensitive context
  private *by construction*.
- **Platform** — the organizational lens over the same kernel. Leaders see
  aggregate intelligence about the people they're responsible for — patterns and
  percentages, never private words.

The spine is a six-stage cognitive loop: **Observe → Remember → Connect → Reason →
Coach → Learn**. The kernel *reasons*; the person *experiences coaching*. The
north star that's guided every decision: **the agent does the labor, the human
keeps the growth.** It should feel like a tool that removes chores, not a
surveillance system or a form to fill.

---

## 2. What was built this session

### A. Data retention (GDPR storage limitation — the last compliance item)
- Personal signals and check-ins past a retention window (default **2 years**,
  `RETENTION_DAYS` to override) are **purged on boot and once per day**.
- Only *old* data is removed — recent data is untouched.
- Wired into the live boot path only (never runs in test mode), exported for
  testing, and covered by two truth-layer assertions (old dropped, recent kept).

### B. Assessments tab (new feature)
The concept: an assessment is **a way a leader wants something done** — a
spreadsheet laid out a certain way, a film breakdown, a way of playing, a skill.

- A **leader creates** a template (title, kind, instructions, the fields to fill).
- A leader **assigns** it to people in their range (scope-enforced), or anyone
  can self-assign.
- The **assignee fills and returns** it.
- The **leader reviews** it back with feedback and an optional score.
- A returned **score becomes a citable capability signal** in the person's record
  — so an assessment isn't a dead form; it becomes part of the growth story the
  kernel reasons over. Completing one is a participation signal (engagement),
  independent of the private contents.
- **Pinned tutorials** — how-to references a leader pins that anyone can always
  refer back to (with an optional link).
- Full authorization: members can't create/assign/pin; assignees can't be forged;
  reviewers must own or oversee the assignment. Erasure and persistence wired in.
- 12 endpoint tests + the page added to the automated frontend smoke test.

### C. UX cleanup (from your feedback)
- **Home vs. "leaderboard" confusion — fixed at the source.** The leader landing
  was titling *itself* "Home" in the code, which blurred it into the personal
  "Me" space. It's now unmistakably **"Team — the people you lead."** The personal
  **"Me"** home (greeting + composer + what IntelliQ noticed about *you*) and the
  **"Team"** leader view are now clearly two different things.
- **Me / Notes redundancy — reframed.** Notes is now presented as your **library**
  (where saved things live), with the **Me composer as the single place you put
  things in.** See the recommendation in §5 for the fuller path.

### D. (Earlier in the session, for completeness)
Security hardening (IDOR class closed, broken-access-control fixes with HTTP test
proof), GDPR (erasure, export, consent ledger, reporter protection), kernel
hardening (the NaN-leak class sealed at every layer, dirty input can never produce
a bad number), cross-industry proof (the same kernel fires the same patterns on a
soccer club *and* a robotics company demo), passive-signal effectiveness
(observations/recognition from any direction — so the person who never logs in is
still served), peer-to-peer signals + safeguarding, consent-gated external
connectors (calendar/health/fitness read; schedule-meeting/send-email write via
draft→approve→execute), and leader oversight scoped to any leader's subtree in
aggregate percentages.

**Truth layer at end of session:** all suites green — 57 endpoint checks, 16
frontend-smoke checks, plus the invariant and pure-logic suites.

---

## 3. The good — what's genuinely strong

1. **Privacy is architectural, not a policy bolt-on.** The Person Model stores
   categorical tokens, not raw text; sensitive content informs the AI but is never
   quoted back to the org; the export excludes third-party welfare reports
   (Art 15(4)); erasure leaves no orphaned data. This is the hardest thing to
   retrofit and you have it built in.

2. **One kernel, many industries — proven, not claimed.** The universal primitives
   (outcome/state/participation/relational/capability/load) mean the same
   detectors fire on a striker's minutes and an engineer's workload. The company
   demo exists and the algorithm behaves. That's your real moat: you're not a
   sports app or an HR app, you're the layer underneath both.

3. **It works when people don't log in.** Recognition and observations flow from
   any node in any direction, so a factory worker or a disengaged player still has
   a growth record built *for* them — and recognition is the draw-in. This is the
   answer to the single biggest "will anyone actually use it" risk.

4. **The kernel is hard to break.** The robustness work means malformed, missing,
   or adversarial input degrades gracefully instead of producing NaNs or crashes.
   The test harness proves it every run.

5. **Compliance is close to pilot-ready.** Consent is informed + revocable,
   connectors are consent-gated read *and* write, retention is enforced, erasure
   and portability work. For a product that touches wellbeing data, this is table
   stakes you've actually met.

6. **The truth layer is a real asset.** Every push runs syntax + logic + HTTP
   authorization + a headless browser smoke test. You can move fast without
   breaking the security or the frontend silently. Most teams your size don't have
   this.

---

## 4. The bad — what's weak or unproven (be honest with yourself here)

1. **Nothing has run against a live LLM or real users.** The AI gateway is wired
   with a Claude-primary / OpenAI-fallback path and gated on `ai.enabled()`, but
   the reasoning quality, the coaching voice, and the epistemic-honesty claims are
   **untested against a real key at volume.** The deterministic fallbacks are
   solid; the LLM layer is a promise until a pilot exercises it.

2. **Thresholds are guesses.** "Overload," "quiet," "recovering," deviation
   percentages — these are reasonable defaults with **no real data to calibrate
   against.** The first pilots exist largely to tune these. Until then, treat every
   flag as a hypothesis, not a fact.

3. **External integrations are stubbed.** The connector *shapes* (calendar/health/
   fitness) and write actions (schedule-meeting/send-email) are built and tested as
   pure transforms, but the actual **OAuth + provider send is not implemented.**
   The assistant "executes" into a stub. This is honest pilot-time work, not a
   shortcut you can skip.

4. **Single JSONB blob storage won't scale.** Everything persists as one debounced
   JSONB document in Postgres. Fine for demos and small pilots; it will become a
   write-contention and memory problem well before you're at hundreds of active
   orgs. Plan the migration to per-entity tables before you scale, not after.

5. **The frontend is a large vanilla-JS monolith.** `app.js` + `member-view.js` are
   big and interdependent; a single scrambled edit took down every page earlier
   this session (which is exactly why the smoke test now exists). It's
   maintainable but fragile, and onboarding another engineer into it will be slow.

6. **Two rendering systems still overlap.** The leader app (`app.js`) and the
   member experience (`member-view.js`) share pages and route through each other.
   The new Assessments tab is built cleanly, but the general architecture still has
   seams where "who renders what" isn't obvious.

7. **Feature surface is ahead of validation.** You have oversight roll-ups,
   connectors, an assistant, assessments, peer signals — a lot of capability. None
   of it has met a real user's actual workflow. The risk isn't that it doesn't
   work; it's that you've built breadth before confirming which two or three
   features a pilot org will actually live in.

---

## 5. Recommendations before August / pilots

- **On Me vs. Notes:** the cleanest end state is *one* input (the Me composer) that
  can route to a saved note, with Notes as a pure browse/library. I made the
  low-risk half of that change (reframing + labels) rather than ripping out the
  Notes composer, because the Notes composer still owns tagging/sharing/privacy
  that Me doesn't. **Decision for you:** either fold those options into the Me
  composer and make Notes read-only browse, or keep both and accept a "quick add"
  duplicate. I'd do the former, but not until a pilot confirms people use Notes.

- **Pick the pilot's spine.** Choose the 2–3 features a first org will use daily
  (my bet: Me check-ins + recognition + the Team view) and make *those* excellent.
  Let the rest sit — it's built and tested, it can wait.

- **Get a real LLM key exercised early.** The single biggest unknown is coaching
  quality. Everything else is scaffolding around it.

- **Instrument the thresholds.** Log every flag and its outcome from day one of the
  pilot so you can calibrate from real data instead of intuition.

- **Don't scale the blob store.** Schedule the storage migration before growth, not
  during an incident.

---

## 6. Bottom line

The kernel is genuinely strong: private by construction, industry-agnostic,
hard to break, and effective even for people who don't engage daily. Compliance is
close to pilot-ready. That's a rare and defensible foundation.

The honest gap is validation, not architecture. Coaching quality, threshold
tuning, and real integrations are all "prove it in a pilot" items, and the feature
surface is a step ahead of what any real user has confirmed they need. The right
move for the next stretch is narrowing and proving, not building more.

You're in good shape to pilot in August. Go get the real data — it's the only
thing the product is now missing.
