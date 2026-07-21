# Pilot Readiness Audit

An honest, customer's-eye evaluation of IntelliQ after Phase 1. **No fixes are made here** — this is a
prioritised checklist for the Pilot Hardening phase. Findings are grounded in the current code, not
aspiration. Severity: **P0** (fix before a real pilot), **P1** (fix early in the pilot), **P2** (polish).

## Summary judgement
The OS is architecturally complete and internally consistent: one assistant, one runtime, one truth
path, one navigation authority, privacy enforced server-side, writes gated by explicit confirmation.
The **backend is pilot-grade**. The **frontend is functional but under-hardened** — the biggest risks are
the absence of a browser/E2E harness, thin accessibility, and no structured observability. Nothing found
is architectural; everything below is hardening.

## Findings by area

### First-run experience
- **P1** — No guided first-run/onboarding for a brand-new member landing on the unified composer; they
  see an empty thread + attention area. Empty states exist but there's no "here's how to start" nudge.
- **P2** — Leader's first view of a member profile depends on a digest that may be sparse for new members
  (handled: "UNANCHORED / absence is the finding"), but the copy could orient the leader better.

### Empty states
- **Good** — Broad coverage (`empty-hint` used ~55× app.js, ~18× member-view); attention area shows
  "Nothing needs you right now"; assigned work and notes have genuine empty states (no fake demo data).
- **P2** — A few empty states are terse ("Couldn't load…"); tone/consistency pass wanted.

### Loading behaviour
- **Good** — Skeletons/"IntelliQ is thinking…" present (~21 app.js, ~8 member-view); the composer shows a
  pending bubble per turn.
- **P1** — No global request-timeout/cancel UX on slow turns beyond the profile fetch's `AbortController`;
  a hung `/api/assistant/turn` shows "thinking…" indefinitely.

### Error behaviour
- **Good** — Frontend try/catch is dense (~49 in member-view); server has ~140 catch/5xx guards; failures
  degrade to honest messages, not blank screens; `navigate()` fails safe to Home.
- **P1** — Error copy is generic ("Couldn't process that just now"); no correlation id shown for support.

### Mobile experience
- **P1** — Mobile is the same `#sidebar-nav` drawer (converged in Cut G) — good, but the unified composer,
  proposal cards and profile modal have **not** been exercised on small viewports; likely layout issues in
  cards/tables. No responsive test.

### Performance
- **P1** — Single-process Node with a single JSONB blob persisted via `scheduleSave()`; fine for a small
  pilot, but `_aggregateOrgData` and profile digests recompute on each request with no caching layer beyond
  the behavioral-profile cache. Watch org-insights latency as data grows.
- **P2** — No pagination on some list endpoints (results/timeline slice in code, but org-wide reads scan
  all members).

### Accessibility
- **P0/P1** — **Thin.** Very few `aria-*`/`role` attributes outside the composer lens bar. Keyboard
  navigation, focus management on modals, and screen-reader labels are largely unaddressed. This is the
  most significant UX gap for a real customer with accessibility requirements.

### Permission boundaries
- **Good (backend)** — Enforced server-side everywhere (`getVisibleUserIds`, `_userHasPerm`, purpose-scoped
  canonical reads); leader-support subject is revalidated every turn; cross-org/unknown reveal nothing.
- **P2** — Frontend nav visibility is permission-based, but a few onclick handlers assume a role; harmless
  (server enforces) but worth a sweep.

### Privacy
- **Good** — Private owner-only evidence excluded before leader context; sensitive informs-not-quoted;
  no existence leak; explicit confirmation for visibility increases; contentless participation signals.
  Locked by `private-evidence-smoke` (18) + `advisor-migration` (45).
- **P1** — Verify redaction end-to-end with a real AI key present (truth layer runs key-less); the
  `privacy.redact` last line of defence should be exercised against a live model in staging.

### Demo reliability
- **Good** — Deterministic fallbacks everywhere (works with no AI key); seed scripts exist
  (`seed-club.js`, `club-stress.js`).
- **P1** — A scripted, repeatable demo walkthrough (member turn → proposal → confirm → leader support)
  is not codified; build one for consistent pilot demos.

### Failure recovery
- **Good** — `navigate()` fails safe; renderers catch; the container never left blank (Cut G).
- **P1** — On a persistence (`scheduleSave`) failure, there's no user-visible "your change may not have
  saved" signal; confirm the save path surfaces failures.

### Logging
- **P1** — `console.error/warn` only (~31 server). No log levels, no request ids, no structured JSON logs.
  Adequate for a tiny pilot; insufficient for diagnosing a customer incident.

### Observability
- **P1** — `/api/health` exists (booleans only). No metrics/latency/error-rate instrumentation, no
  per-turn tracing. Add minimal request timing + error counters before the pilot.

### Anything confusing
- **P2** — "MyWorkspace" nav item now shows assigned-work records while Home is the composer; the labels
  could confuse (two "workspace"-ish surfaces). A naming pass would help.
- **P2** — Leaders use their own Home composer for member support (with a subject chip); this is correct
  but may surprise leaders expecting a dedicated leader console.

## Prioritised checklist

**P0 — before a real pilot**
- [ ] Accessibility baseline: keyboard nav, focus trapping on modals, `aria` labels on the composer,
      proposal cards, nav, and profile modal.

**P1 — early in the pilot**
- [ ] Add a browser/E2E smoke harness (composer → proposal → confirm; leader subject; navigation).
- [ ] Turn timeout/cancel UX for `/api/assistant/turn`; surface save failures.
- [ ] Mobile/responsive pass on composer, proposal cards, profile modal.
- [ ] Structured logging (levels + request ids) and minimal observability (timing + error counters).
- [ ] First-run onboarding nudge on the empty composer.
- [ ] Codified demo walkthrough script.
- [ ] Exercise privacy redaction against a live AI model in staging.

**P2 — polish**
- [ ] Empty-state copy consistency; error copy with a support/correlation id.
- [ ] Naming pass (Home vs "MyWorkspace" vs assigned-work).
- [ ] Pagination/caching for org-wide reads as data grows.
- [ ] Frontend role-branch sweep (defence-in-depth; server already enforces).

**Not in scope (deliberate):** connectors, new AI capabilities, attachment/voice UI, interface
redesign — these remain post-pilot-hardening.

## Update — proactive intelligence layer (shipped)

The **proactive surfacing layer** and its **preference/outcome learning** are now built (previously
listed here as out of scope). They are a bounded, post-kernel projection — no new detector, no second
truth path, deterministic, surface-only (every suggestion proposal-gated). See
`PROACTIVE_INTELLIGENCE.md`, `OUTCOME_LEARNING.md`, `COMMUNICATION_PREFERENCES.md`, and the Part-1
audit `PROACTIVE_BASELINE.md`. Covered by `scripts/proactive-smoke.js` (38 assertions, in the truth
layer). This does **not** change the P0/P1/P2 hardening priorities above (accessibility, E2E harness,
observability) — those still gate a real pilot. The proactive layer inherits the same frontend
hardening caveats (verified by HTTP + static guards, not DOM/E2E).
