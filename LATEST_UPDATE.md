# Latest Update — Alignment-Aware Advisor + Smoke Test

**Branch:** `claude/platform-work-summary-nmb0cm`
**Latest commits:** `df68a43` (alignment-aware Advisor) · `6091f63` (smoke test)

---

## 1. Advisor is now alignment-aware (commit df68a43)

Folded the Alignment Layer canon into the Individual Advisor. Additive, no schema migration, existing behavior preserved.

**Three alignment frames added to context (stated aims, all citable):**
- **MEMBER aims** (member goals) — flags "unanchored" explicitly when no goal is set
- **TEAM context** (group name + coach emphasis)
- **ORG values** (guardrails) + ORG priorities

**System prompt rewritten to the canon:**
- Alignment = coherence between behavior over time and stated aims; directional, never obedience, never a score
- Directional vocabulary enforced (converging / sustaining / stalled / diverging / unanchored / unknown) — "never say 62% aligned"
- Conflict doctrine baked in (member↔team = seek integration; team↔org = guardrail + culture signal; unanchored = highest care; aligned-all = reinforce/stretch)
- Privacy gate + role lens unchanged and still applied

**New briefing mode:**
- `POST /api/advisor/:memberId/ask` accepts `mode:'briefing'` → the 4-question briefing (what we're seeing / why / how it aligns / what to try next)
- UI: "📋 Full Briefing" button next to "Ask Advisor"

## 2. Smoke test + checklist (commit 6091f63)

- `scripts/advisor-smoke.js` — end-to-end test against a LIVE instance. Run: `npm run smoke:advisor`. Checks auth, member resolution, question mode, briefing mode, thread persistence, guardrails (empty→400, no-auth→401), and soft-warns on score leakage.
- `ADVISOR_SMOKE.md` — run instructions + 5-minute manual UI checklist.

**Run it:**
```bash
BASE_URL=http://localhost:3000 EMAIL=you@example.com PASSWORD=secret npm run smoke:advisor
```
(If your key is Haiku-only, set `AI_MODEL_REASON=claude-haiku-4-5-20251001`.)

## Verification done here
- `node --check` passes on server.js, app.js, smoke script
- AI modules load; all six `pm-advisor-*` IDs match across HTML/JS; mode wiring consistent
- **Not** run live end-to-end (no DB/API key in this container) — that run is yours

## Next
- Run the smoke test live, then Phase 2 (signals table + dual-write).
