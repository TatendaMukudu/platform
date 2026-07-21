# IntelliQ — Pilot Release Checklist

Go / no-go for a pilot deployment. Tick every **Must** before shipping to a paying customer. Items
marked _(deferred)_ are documented in `PILOT_READINESS.md` and are acceptable for a controlled pilot.

## Build
- [ ] **Must** — `npm start` (or `node server.js`) boots cleanly; `/api/health` returns 200.
- [ ] **Must** — Correct env: `DATABASE_URL` (Neon), any AI key (optional — app degrades without it),
      OAuth client ids/secrets only for apps you'll demo. Secrets never logged.
- [ ] Node **v22** (dev/prod parity). No `engines` pin today — pin before GA. _(P2)_
- [ ] `DB_OPTIONAL=1` is a **test-only** switch — never set in production.

## Tests
- [ ] **Must** — `npm test` GREEN: 35 suites, hermetic (no DB / no AI key).
  - Includes: assistant-runtime (30), assistant-interface (90), advisor/privacy (45),
    check-in (59+26), assessment (30/16/25/23), endpoint HTTP authz (217), evidence/privacy/reasoning,
    **proactive surfacing (38)**.
- [ ] `node --check` on all sources (part of the truth layer).
- [ ] Browser smoke `npm run smoke:frontend` (Playwright) — **not** in the truth layer; run manually
      where a browser is available. _(deferred: no E2E harness in CI)_

## Accessibility
- [ ] Composer, lenses, chips, send, attention items, proposal/retry buttons have visible focus + labels.
- [ ] `role=tablist/tab` + `aria-selected` on lenses; `aria-live` on attention/conversation;
      `role=status` on the thinking indicator; `prefers-reduced-motion` honoured; 40px touch targets.
- [ ] **_(deferred — P0 for next sprint):_** full keyboard/focus-trap audit on modals, a contrast sweep,
      and screen-reader labelling beyond the composer. Tracked in PILOT_READINESS.md.

## Performance
- [ ] First paint shows the hero + skeletons (no blank/unfinished feel).
- [ ] No refetch of attention on lens switch (fixed). Motion is opacity/transform only.
- [ ] **_(deferred — P1/P2):_** caching for org-wide reads (`_aggregateOrgData`) and lazy-loading heavy
      management sections as data grows. No measured hotspot at pilot scale.

## Mobile
- [ ] **Must** — 320 / 360 / 390 / 430: no horizontal overflow, send button visible, chips wrap, lens
      bar scrolls. (Verified at a true 360px column; `body{overflow-x:hidden}` is the safety net.)
- [ ] App/permission actions go full-width; comfortable tap targets.

## Desktop
- [ ] **Must** — 768 / 1024 / 1440: composer max-width 720px centred; cards breathe; no clipping.

## Logging
- [ ] `console.error/warn` present on failures; no stack traces or secrets reach the client.
- [ ] **_(deferred — P1):_** structured logs (levels + request ids) and a correlation id surfaced in
      error copy for support.

## Health endpoint
- [ ] **Must** — `GET /api/health` returns booleans only (never secrets); used for uptime checks.

## Seed data
- [ ] **Must** — `npm run seed` (or `scripts/seed-club.js`) populates a coherent org: users, an assigned
      item or two, a little check-in history, at least one returned assessment for the leader beat.
- [ ] `npm run demo:club` (`club-stress.js`) available for a richer, stress-seeded org.

## Demo account
- [ ] **Must** — a **member** demo login on Home with seeded data (see DEMO.md).
- [ ] **Must** — a **leader/admin** demo login that can see ≥1 member (for leader support).
- [ ] Rehearse DEMO.md end-to-end once; confirm the "Things never to click" list with whoever presents.

## Browser support
- [ ] **Must** — latest Chrome/Edge, Safari, Firefox (desktop) and mobile Safari/Chrome. Dark theme only.
- [ ] Uses standard APIs (fetch, AbortController, flexbox, `color-mix`); no framework runtime. `color-mix`
      is supported in all current evergreens — verify Safari ≥ 16.2 for the customer's fleet. _(P2)_

## Known limitations (acceptable for pilot)
- Proactive insights are surface-only and deterministic; every suggestion is proposal-gated (no
  autonomous action). Reliability learning is org-scoped and pattern-type-grained, not per-person.
  See `PROACTIVE_INTELLIGENCE.md`.
- Deterministic leader-support narrative (no separate AI persona) — by design.
- Attachment upload / voice / leader team-import UI deferred (capabilities preserved as functions).
- Legacy leader/org analytics still read the canonicalised `memberResults` mirror (documented in
  `PHASE1_COMPLETION.md`; not on the assistant truth path).
- No E2E/visual-regression harness in CI; frontend verified via HTTP + static guards + manual screenshots.
- Accessibility P0 (modals/contrast/SR) not yet complete.

## Rollback plan
- [ ] Deploys are a single Node process + a Neon JSONB store. **Rollback = redeploy the previous commit**
      (`git revert` / redeploy prior build); no schema migration is involved, so rollback is safe and fast.
- [ ] Data is server-side and append-oriented; a rollback of app code does not lose member data.
- [ ] If a bad build ships: redeploy the last green `main` commit, confirm `/api/health`, re-run
      `npm test` against the rolled-back tree, then resume.
- [ ] Keep the last-known-good commit hash recorded with each deploy.
