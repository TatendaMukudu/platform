# Pilot Hardening — Sprint 1 (audit + fixes)

Stabilization before a customer demo. **No** architecture / AI / kernel / privacy / proposal / workflow /
navigation changes. Truth layer green throughout (34 suites, 967 assertions; interface 90).

## Ranked audit

### P0 — fixed (would fail in front of a customer)
- **Assigned-work submit crashed.** `_assessSubmit` read `.me-row` (renamed to `.aw-item` in Phase 2 →
  `null.querySelectorAll` crash) and `this._assessChat` (removed in Cut C → `undefined` crash). The
  "Send to \<leader\>" button was dead. **Fixed** — reads `.aw-item`; dead per-item-chat code removed.
- **Hung turn showed "thinking…" forever.** No request timeout. **Fixed** — 30s `AbortController` timeout
  → an explained error bubble with **Try again** (message preserved).
- **Silent proposal-confirm failure / blank card.** Network or `!ok` left the card unchanged with no
  feedback. **Fixed** — inline error in the card; never blank, never silent.

### P1 — fixed
- **Double-submit** on Send, Confirm, and assigned-work Submit (rapid demo clicks could double-fire).
  **Fixed** — in-flight guards + button loading states (`Working…` / spinner / `Sending…`).
- **Lost input on failure.** The composer cleared the text before the turn resolved. **Fixed** — on
  failure the message is preserved and retryable.
- **Redundant fetch + jitter.** Attention refetched `/api/workspace/today` on every lens tab switch
  though it isn't lens-specific. **Fixed** — loaded once per render.
- **First-run orientation missing.** A new user saw only "What would you like to do today?" **Fixed** —
  a one-line orientation ("your private space… nothing is shared unless you choose"), no new page.
- **Loading states.** Blank waits on attention. **Fixed** — skeletons + a typing indicator (Phase 2),
  send spinner (this sprint).

### P2 — documented, not done this sprint
- Full **accessibility** pass (modal keyboard/focus-trap, contrast sweep, SR labels beyond the composer).
- **Copy consistency** sweep across all secondary surfaces; some terse empty/error strings remain.
- **Structured logging / observability** (levels, request ids, correlation id in error copy).
- **Perf** caching for org-wide reads; lazy-loading heavy management sections.
- **Secondary-surface error states** (notes/inbox loaders delegate to their own handlers — spot-checked,
  full pass deferred).
- Pin Node `engines`; verify `color-mix` on the customer's Safari fleet.

## Consistency notes (Part 1)
- **Radius / spacing / buttons:** the assistant, assigned-work and apps surfaces were unified onto the
  design tokens in Phase 2 (radius `--radius*`, one gradient primary, quiet secondaries). Legacy
  leader/management/settings surfaces still use older local styles — light-touch only, a broader token
  sweep is P2.
- **Terminology:** one vocabulary on the member surfaces — "Ask IntelliQ", "Assigned to you",
  "Needs you", "Private by default", "Confirm". No engineering terms on member-facing copy.

## Deliverables
- `DEMO.md` — a rehearsed 7-minute script: beats, exact clicks, expected responses, fallbacks, timing,
  "things never to click", known risks, recovery path.
- `RELEASE_CHECKLIST.md` — build / tests / a11y / perf / mobile / desktop / logging / health / seed /
  demo account / browsers / known limitations / rollback.
- This audit.

## Honest limitations
- Frontend verified via HTTP behaviour + static guards + headless-Chromium screenshots — **no automated
  DOM/E2E/visual-regression** in CI. Reliability fixes are guarded by design and manually rendered, not
  unit-tested at the DOM level.
- The accessibility P0 is **not** complete; it's the top of the next sprint (documented above and in
  PILOT_READINESS.md). This sprint bought **reliability + demo confidence**, not full a11y compliance.
