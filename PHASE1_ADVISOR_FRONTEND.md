# Phase 1 — "Ask Advisor" Frontend

**Branch:** `claude/platform-work-summary-nmb0cm` · **Commit:** `15ba7b9`

Additive only — the rest of the member profile is untouched.

## What I added

A new **"Ask Advisor"** tab in the existing profile modal (`index.html`), wired to logic in `js/app.js` and styled in `css/styles.css`:

- **Question textbox** + **four prompt chips** that prefill it: *How do I motivate this person? / How should I hold them accountable? / How should I approach them right now? / What leadership opportunity fits them?*
- **Calls `POST /api/advisor/:memberId/ask`** using the existing `Auth._headers()` token; renders the answer with the requester's **role-lens badge**.
- **Loading state** ("🤖 IntelliQ is considering {name}…", button → "Thinking…").
- **Safe empty/error states** — no member, blank question, and API failure all render a clean message instead of breaking.
- **Privacy note** inline: *"🔒 Advisor may use protected context to generate safe recommendations, but private notes are not revealed."*
- **Prior history** via `GET /api/advisor/:memberId/threads` — loaded on profile open and refreshed after each question.
- All AI/user text is **HTML-escaped** (`_escAdvisor`) to avoid injection in the rendered output.

## Verification
- `node --check` passes on `app.js`, `server.js`, `auth.js`.
- All five `pm-advisor-*` IDs match between `index.html` and `app.js`; all four handler functions are defined; chip → `setAdvisorQuestion` wiring confirmed.
- Backend privacy/lens unit tests still pass; both advisor routes confirmed registered.
- No formal test runner exists in the repo (`package.json` has only `start`/`dev`), so those are the available checks.

**Honest caveat:** A live UI click-through wasn't possible in the container (no `DATABASE_URL`/`ANTHROPIC_API_KEY`), so this is verified at the syntax/contract level, not a rendered end-to-end run. The tab uses the profile's existing generic tab switcher and proven `Auth`/`fetch` patterns, so risk is low — but a real click-through on the deploy is the last honest check.

## Next
- Keep Phase 1 here, or move on to Phase 2 (signals table + dual-write).
