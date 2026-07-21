# Phase 2 — Pilot Hardening: UX & Visual Polish

Presentation-only. **No architecture, navigation, privacy, kernel, proposal or workflow changes.**
Every Phase-1 guard and the full truth layer stay green (interface 90). The goal: make IntelliQ feel
like a premium 1.0 — clean, calm, professional — by *removing* noise, not adding features.

## 1. UX audit (screens ranked by importance)

| # | Screen | Importance | Issues found | Status |
|---|--------|-----------|--------------|--------|
| 1 | **Home / MyWorkspace** | Critical (this is the product) | Duplicate headings (greeting + name + "MyWorkspace"); a giant white composer block (CSS used light-mode token fallbacks on a dark app); oversized textarea + vertical Send; unfinished empty state ("Nothing needs you"); too many boxes | **Fixed** |
| 2 | **Assigned work** | High | Row-border noise; inline styles; weak score hierarchy; "Ask IntelliQ" looked like a secondary-app button; cramped feedback | **Fixed** |
| 3 | **Apps** | High | Full-width Connect button dominated each card; dashed permission boxes; borders over whitespace | **Fixed** |
| 4 | Lenses (Today/Me/Work/…) | Medium | Heavy pill borders; small tap targets; harsh active fill | **Fixed** |
| 5 | Proposal cards | Medium | Heavy borders; the inline Confirm inherited the global full-width button | **Fixed** |
| 6 | Empty / loading states | Medium | "No data" terseness; blank waits; layout jumps | **Improved** (home hero + skeletons; broader copy pass deferred) |
| 7 | Leader/management analytics, settings | Lower | Denser legacy surfaces | **Deferred** (documented) |

## 2. Design principles applied

- **Remove before add.** One heading, one obvious action per surface, fewer boxes.
- **Whitespace over borders.** Row-borders → calm cards with padding; dashed boxes removed.
- **Typography for hierarchy.** Greeting eyebrow + name; score as a large numeral with a quiet "/100";
  uppercase micro-labels only where they orient.
- **Dark-native.** Rebuilt the workspace on the real dark tokens (`--bg-surface/-card/-hover`,
  `--accent`, `--text-*`) — no stray white blocks; elegant, not heavy.
- **Buttons secondary until needed.** The primary action is a content-sized gradient; everything else
  is quiet (ghost/outline/link).
- **Calm motion.** 180–220ms fades, a typing indicator, skeletons — all disabled under
  `prefers-reduced-motion`.

## 3. What changed (by surface)

**Home / MyWorkspace (the hero)**
- One heading: the page-header greeting + name; removed the redundant "MyWorkspace" title/subtitle.
- Hero composer: one rounded container, borderless auto-growing input, round send button, focus-within
  accent ring, placeholder "Ask, capture a thought, or make a plan…", a quiet privacy/keyboard hint.
- Premium empty state: "What would you like to do today?" + **Reflect / Capture / Plan / Ask IntelliQ**
  chips that prefill the one composer (no new capability).
- Order: attention → composer → conversation.

**Assigned work** — token cards; large score numeral; soft status badges; quoted feedback block;
"Ask IntelliQ about this" as a subtle accent link (contextual assistance, not an app button).

**Apps** — icon + title + one description + a per-app privacy line + a compact Connect button; calm
nested permission surfaces; lightweight category groups.

## 4. Accessibility improvements

- `focus-visible` rings on lenses, chips, send, attention items, the Ask-IntelliQ link, and work fields.
- `role="tablist"/"tab"` + `aria-selected` on the lens bar; `aria-live` on attention + conversation;
  `role="status"` + `aria-label="IntelliQ is thinking"` on the typing indicator (dots are `aria-hidden`).
- Minimum 40px tap targets on touch devices (`@media (hover:none)`).
- Reduced-motion honoured.
- **Still open (P0 from PILOT_READINESS):** full keyboard/focus-trap audit on modals, contrast sweep,
  and screen-reader labelling beyond the composer — a dedicated a11y pass is the next hardening item.

## 5. Mobile improvements

- Mobile-first `@media (max-width:640px)`: horizontally scrollable lens bar, wider bubbles, full-width
  app/permission actions, tighter spacing.
- Composer flex fix (`flex:1 1 0%; min-width:0`) so the input shrinks and the send button never clips
  under `body{overflow-x:hidden}`.
- Empty-state chips wrap instead of overflowing.
- Verified at a true 360px column (no overflow; send + chips fit).

## 6. Performance improvements

- No new network calls or renders; skeletons replace blank waits on attention.
- Motion is GPU-friendly (opacity/transform) and reduced-motion-aware.
- (Perceived) the hero + skeletons reduce the "empty/unfinished" feel on first paint.
- Deeper perf (caching org-wide reads, lazy sections) remains a documented P1/P2 in PILOT_READINESS.

## 7. Honest limitations

- **No browser/E2E harness in the truth layer** — visual correctness is verified with headless-Chromium
  screenshots + static guards, not automated DOM/visual regression. Screenshots are a manual aid.
- **Headless screenshot caveat:** raw `--window-size` lays out at ~500px regardless of the flag, so
  "mobile" was verified with an explicit narrow (360px) container, not true device emulation.
- **Voice / attachment composer icons intentionally omitted** — those capabilities are deferred
  (Phase 1); shipping non-functional icons would violate "everything feels intentional."
- **Copy/empty-state consistency pass** and the **P0 accessibility audit** are scoped but not complete —
  tracked in PILOT_READINESS.md.
- Legacy leader/management/settings surfaces got light touch only; a broader pass is deferred.

## Commits
1. `a59fa8c` — MyWorkspace hero (heading, composer, empty state, motion, a11y).
2. `870cf3c` — assigned work + apps cards.
3. `416e368` — context chips + mobile responsiveness.
