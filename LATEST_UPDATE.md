# Update — Platform Intelligence Loop v1 (shipped)

The pivot from "dashboard app" to "intelligence system," built as the smallest
powerful version. **No new pages** — I consolidated three overlapping surfaces
into one, and the only new code is the engine + one endpoint family.

The loop is now real end to end:
**Input → Signal → Pattern → Judgment → Action → Outcome → Learning**

---

## Architecture

- **`ai/intelligence.js` (new)** — a pure, testable pattern engine. Privacy by
  construction: it receives ONLY derived features (mood numbers, signal
  weights/timestamps, counts, directions, booleans) — **never raw text** — so it
  structurally cannot quote or reveal a private note. Sensitive context enters
  only as a boolean flag that softens tone.
- **`server.js`** — `_buildMemberIntelInput()` assembles those safe features from
  existing stores through the privacy gate; **one** endpoint
  `GET /api/intelligence/briefing` consolidates who-needs-attention + why-now +
  evidence + recommended action + a group rollup (folds the old Group/Org Health).
  The intervention loop is closed with `/act` + `/outcome`, tied to the pattern.
  The only AI call is the aggregate summary — routed through the existing gateway.
- **Frontend** — one `renderIntelligence()` surface reusing the leader-home page.
  Nav consolidated (below).

## The 5 patterns (honest language — "pattern/early signal", never "prediction")
1. **momentum_drop** — mood down over the last 2 weeks vs the prior ~4.
2. **quiet_improvement** — rising steadily, now in a good place, little visible
   recognition (the person to praise before they feel invisible).
3. **repeated_concern** — ≥3 concern signals over ~6 weeks (recurring, not a
   one-off).
4. **member_team_divergence** — trending opposite to their team.
5. **invisible_load** — actively supporting others while their own signals strain.

Each finding carries a **privacy-safe basis** (counts + direction only) and a
**confidence** that is honest about volume: tentative (<3) · emerging (3–5) ·
clear (6+). No fake ML.

## Files changed
| File | Change |
|---|---|
| `ai/intelligence.js` | **new** — engine: 5 detectors + briefing composer |
| `scripts/intelligence-smoke.js` | **new** — 13 checks, runs with plain `node` |
| `server.js` | require + `_buildMemberIntelInput`, `_learningByPattern`, 3 endpoints |
| `js/app.js` | `renderIntelligence` + card + `intelAct`/`intelOutcome`; dispatch + titles |
| `js/data.js` | nav consolidation |
| `css/styles.css` | intel-* styles |
| `index.html` | asset cache-bust `?v=20260705i` |

## UX simplification (fewer surfaces, one entry)
- Leader **main entry is now "Intelligence"** (the daily briefing).
- **Removed** the duplicate leader nav items *Group Health* and *Intelligence
  (org-insights)* — folded into the one briefing (old links redirect there).
- **Renamed** the admin "Intelligence" page to **"IntelliQ Engine"** so the word
  "Intelligence" names exactly one thing. "Organisation Health" now stands alone
  (no more Group-vs-Org-Health confusion).

## Privacy safeguards
- Engine inputs contain **zero** raw text — verified by a smoke assertion that a
  composed item has no `valueText/note/content/text` field.
- Sensitive signals only set a boolean `careFlag` ("there may be personal context
  — lead with care"); the detail is never sent.
- The aggregate AI summary is instructed to **never name an individual** and runs
  through the privacy-gated gateway.
- The named per-member detail is deterministic (no AI), shown only to a leader
  already scoped to that member.

## The learning loop
- On a briefing card: **"I acted on this"** logs an intervention tied to the
  pattern → then **👍 / 😐 / 👎** records the outcome.
- `_learningByPattern()` aggregates outcomes per pattern, and the next briefing
  surfaces *"here, X has tended to help with this pattern (n/m positive)"* — but
  only after ≥2 measured outcomes, and it never overrides the care-first default.

## Tests / smoke
- `node scripts/intelligence-smoke.js` → **13/13** (each detector fires + stays
  quiet correctly; honest-language check; privacy-by-construction check).
- `node --check` on server.js, js/app.js, js/data.js — all pass.

## Honest limits (v1)
- Detectors are heuristics over real signals — deliberately conservative, honestly
  labelled. Not statistical models.
- Team trajectory is O(peers) per member — fine for pilot-size orgs, wants
  precompute later.
- Admins reach the briefing when they lead a node; a pure-superadmin org-wide
  entry can come next.
- **Not run against a live DB/AI key here** — engine is proven in isolation; the
  end-to-end path is your California test.
