# IntelliQ + Platform — Session Review (2026-07-15)

**Branch:** `claude/platform-work-summary-nmb0cm` → fast-forwarded to `main` (all deployed)
**Range:** 11 commits, `16ca305 → 9729203`
**Truth layer at end of session:** green — **70 endpoint checks + 18 frontend-smoke + 22 invariants** plus the pure-logic suites, all passing.

---

## What shipped today

### 1. Data retention (last compliance item)
Personal signals + check-ins past a window (default 2 years, `RETENTION_DAYS` to override) are purged on boot and daily. Only old data goes; recent is untouched. Closes the GDPR storage-limitation gap.

### 2. Assessments tab
A leader defines *a way they want something done* (spreadsheet, film breakdown, a way of playing), assigns it, the member fills and returns it, the leader reviews with feedback + a score. **A returned score becomes a citable signal in the person's record** — so it feeds the kernel, not a dead form. Pinned tutorials let anyone refer back. Full authorization, erasure, and persistence wired in.

### 3. "Me" vs "Team" — fixed the home/leaderboard confusion
The leader landing was titling *itself* "Home" in code, blurring into the personal Me space. It's now unmistakably **"Team — the people you lead."** Notes reframed as your library.

### 4. Apps page — real connectors (was a stub)
The old "Connect a source" card was fake (a "coming soon" toast) and wasn't in the nav. Replaced with a **real Apps page** wired to the live consent/connect endpoints, reachable in My Space.

### 5. Agent summary leads the member profile
Clicking a team member already produced *"What IntelliQ understands"* — a plain-language, privacy-safe read (narrative, trajectory, what to check in about). It was buried behind a tab; it now **leads the profile**, so clicking a person opens with the agent's read, not a wall of numbers.

### 6. LLM self-test (no shell needed)
A **"Run LLM self-test"** button in Settings runs demo-shaped prompts through the live gateway and shows the output + latency + which model answered — so you can judge coaching quality on Render without a shell. Plus a CLI harness (`npm run smoke:llm`) for local/CI. Both gateway model IDs are current/valid, so it runs for real against a key.

### 7. Notes clumped into the Me tab
Notes is no longer a separate tab — the Me tab now has a Notes section (quick note + browse of what you've kept). Full options stay reachable. Removed the redundancy you flagged.

### 8. The stale-bundle bug (this was "it's not working")
Every JS/CSS file shipped under the **same** cache-buster `?v=20260711h` across several deploys, so returning phones kept serving old bundles. Bumped to `?v=20260715a` so all clients fetch fresh; future deploys now change the string automatically. Also hardened the Apps page so it can never look silently blank again.

### 9. Cross-industry / generic copy
Connector copy no longer assumes sports (was "training load from a fitness app," odd on a robotics company). Connectors now carry a **category** so different industries group their own apps without touching the kernel. Added an Email connector.

### 10. PWA — installable, no App Store
The team can install IntelliQ to their home screen (iOS + Android): open the site → Share → **Add to Home Screen**. Launches full-screen with its own icon. Network-first service worker (installability + offline) with **no stale-bundle trap**.

### 11. The consent model — three layers (the big one)
This is the ethical core, and it got fully built out today.

| Layer | Reads | Flows to | Org sees | Permission |
|---|---|---|---|---|
| **Insight** | numbers only | kernel → org patterns | aggregate only | connect |
| **Assistant** | rich detail (times, titles, locations) | acts **for you** | never | separate toggle |
| **Contribute** | rich → **distilled to numbers** | **your** growth record | aggregate only | separate toggle |

**Contribute** answers your question — *"can what the assistant sees become kernel numbers without being surveillance?"* Yes, behind a **one-way membrane** with four safeguards, each enforced and tested:

1. **Separate, explicit permission** — its own scope, off by default, never implied by the other two.
2. **Numbers cross, content never** — only `{label, value, date}` is stored; the raw payload is dropped.
3. **Visible + revocable** — *"See exactly what's crossed"* lists the numbers; turning it off blocks all further crossing immediately.
4. **Org-safe** — contributed data is the same minimised numbers as insight; the org still only sees aggregate patterns.

The magic you intuited — objective numbers (a fitness app) fused with subjective state (how you feel) — is exactly what the kernel does with these signals: heavy load *with* dropping energy = burnout; heavy load *with* rising energy = thriving. Same numbers, opposite meaning; the feeling disambiguates.

---

## The good — what's genuinely strong now

- **Privacy is architectural, and now it's a spectrum you control.** Three explicit, revocable layers, with a visible audit for the most sensitive one. This is a rare, defensible position for a wellbeing product — most tools have one blunt "connect" and hope you trust them.
- **Cross-industry is real, not claimed.** Same kernel, same detectors, on a soccer club *and* a robotics company; connectors are now categorised and extensible per industry.
- **It works when people don't log in** (recognition + observations) and now **installs like an app** (PWA) — the two biggest "will anyone use it" risks, both addressed.
- **The truth layer caught real things** and is now 70 endpoint checks deep. You can move fast without silently breaking security or the frontend.
- **Distribution is unblocked** without spending a cent — pilot on the PWA today.

## The bad — the honest gaps (unchanged from the core caveats)

- **No live LLM output has been seen yet.** The self-test button is the way to see it; until you click it on Render, coaching quality is unproven. This is the single biggest unknown.
- **Provider integrations are still stubbed.** Insight-pull, Assistant-act, and Contribute-distill all have real consent + real distillation, but the actual OAuth to Google Calendar / Outlook / a fitness app is pilot-time work. Today it's the model and the flow, not a live write to TeamBuilder.
- **Thresholds are still untuned** — every flag is a hypothesis until real pilot data calibrates it.
- **Single JSONB blob store** won't scale past small pilots — plan the migration before growth, not during an incident.
- **Feature surface keeps widening.** Assessments, three consent tiers, oversight, assistant, PWA — a lot of capability, still ahead of what any real user has confirmed they need. The next phase should narrow and prove, not add.

---

## What's waiting on you

1. **Install test** — hard-refresh the phone once, then Share → Add to Home Screen; confirm it launches full-screen.
2. **Click "Run LLM self-test"** in Settings on Render — this is how we finally see real coaching quality. If it looks flat, the fix is prompt-tuning, and I'd want to see the actual text.
3. **Decide the model tier** — reasoning currently runs `claude-sonnet-4-6`. Say the word to bump it to `claude-opus-4-8` for stronger coaching.
4. **Pick the pilot spine** — the 2–3 features a first team lives in (my bet: Me check-ins + recognition + the Team view + the agent summary) and make those excellent; let the rest sit.

---

## Bottom line

The kernel is strong and the consent model is now genuinely differentiated — private by construction, industry-agnostic, and installable. The honest gap remains **validation, not architecture**: real LLM output, real integrations, real threshold tuning. You're in good shape to pilot in August. The next move is to **narrow, install it on a real team, and get the data.**
