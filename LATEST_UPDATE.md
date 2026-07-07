# Update — Confidence Engine + Proactive Feedback + Source Adapters

"Do everything" — the remaining positives (#1 adapter, #4 proactive/feedback,
#5 Confidence Engine) are built, additive, and quality-gated. The intelligence
loop is now complete end-to-end: **notice → surface (confidence-gated) → feedback
→ learn what's worth surfacing.**

## What I built

### #5 · The Confidence Engine — `ai/confidence.js` (new)
The system now tracks **where it's reliable** and says so honestly. Per kind of
noticing it keeps a feedback tally and reports a tier: **calibrating** (below the
feedback floor — never claims reliability), **promising**, **reliable**, or
**unproven**. Two gates:
- **label** — every surfaced noticing carries an honest reliability label.
- **suppress** — a noticing type that has earned enough feedback AND proven mostly
  unhelpful is quietly stood down. The kernel stops nagging about what doesn't land
  *here* — the seed of "more proactive as confidence rises," and its inverse.

### #4 · Proactive feedback loop (both lenses)
- **Platform briefing:** each flag shows its reliability label; a **"Not useful"**
  control teaches the Confidence Engine (dismiss), and **acting on a flag** counts
  as useful. Suppressed types stop appearing.
- **IntelliQ mirror:** the person can mark a connection **"not helpful"** — their
  record, their say. Both lenses feed the same Confidence Engine.
- `POST /api/intelligence/notice-feedback { type, feedback }` — the teach signal.
- Feedback is **persisted** (`noticeFeedback` store) so the kernel keeps learning
  across restarts.

### #1 · Source adapters — `ai/adapters.js` (new) + CSV import
The "everything is a signal" contract, made real: an adapter turns any source into
the universal per-member shape the kernel already understands. Shipped a robust
**CSV adapter** (quoted-field safe) + `POST /api/signals/import-csv` — a
spreadsheet becomes per-member metric signals through the same attribution +
scope-safety path as the smart import. New sources now need an adapter and
**nothing else in the kernel**. (Pilot-ready: Alma/Kettering will have
spreadsheets.)

## Files
| File | Change |
|---|---|
| `ai/confidence.js` | **new** — Confidence Engine (reliability · suppress · label) |
| `ai/adapters.js` | **new** — source adapters + CSV parser |
| `server.js` | `noticeFeedback` store (persisted); `_reliabilityByType`; briefing gating+labels; `/notice-feedback`; `/signals/import-csv` |
| `js/app.js` | reliability chip + Not-useful/act feedback on briefing cards |
| `js/member-view.js` | "not helpful" on the mirror; feedback method |
| `css/styles.css` | reliability + dismiss styles · `index.html` `?v=20260705m` |
| `scripts/eval.js` | +5 golden cases (Confidence Engine + adapter) |

## Verification
- `node scripts/eval.js` → **16/16**; baseline **12/12**; intelligence **15/15**;
  `node --check` on all changed files — clean.
- Honesty guaranteed by test: thin feedback → "calibrating" (never claims
  reliability); mostly-dismissed types are suppressed; a promising type is not.

## The loop, now complete
`Signal → Observe → Analyse (patterns · self-relative shifts · cross-signal
connections) → surface via the two lenses, CONFIDENCE-GATED → human feedback
(useful/dismiss/outcome) → Learn (what works + what's worth surfacing)` — one
kernel, two lenses, five agents, no new pages, no industry lock-in.

## Honest caveat
- All deterministic logic is fully tested. Whether the *right* things get dismissed
  vs kept is a real-data question — but the mechanism is conservative (it only
  suppresses after ≥6 responses that are mostly negative), so it won't over-prune
  early. The Confidence Engine gets genuinely valuable only once real people are
  giving feedback — i.e. your pilot.
