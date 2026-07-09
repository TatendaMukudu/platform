# Update — The unified coach home (simple, athletics-framed)

Took the mockup you approved and built it into the real product. Kept the
leader-node privilege model exactly as it was — coaches see their squad, athletes
see themselves, admins see all — and simplified the surface on top.

## What changed (frontend only — kernel untouched)

**One home, grown by responsibility.** The coach's landing (`leader-home`, now
titled **"Home"**) is one calm screen with two zones:
1. **You** — a compact version of the coach's *own* mirror (their reflection +
   "Your direction: climbing"), pulled from `/api/me/record`. Because leaders
   develop too — the split-identity confusion is now the feature: you're one
   person who's developing, with a squad zone below if you lead people.
2. **Your people** — the early-warning briefing (who needs you today, why, the
   evidence, the next step, the learning loop) — unchanged logic, calmer framing.

**Athletics vocabulary as a skin** (`_v()`), consistent with the
vocabulary-is-a-skin principle: in sports mode the UI says *athletes / squad*,
elsewhere *members / team*. The kernel never changes; only the words do.

**Simpler nav:** the coach's main item is now **Home** (🏠), "My Members" → "My
People". The permission gating (leaderOnly + grants) is untouched.

**Calmer copy, no scores:** "You, then your squad." · "Your athletes — 3 could use
you today." · "each compared to a person's own normal — directional, never scores.
Private detail informs the read but is never shown."

## Files
| File | Change |
|---|---|
| `js/app.js` | `renderIntelligence()` → unified You-strip + squad briefing; `_v()` vocab + trajectory words; titles |
| `js/data.js` | nav: leader-home → "Home" 🏠; "My People" |
| `css/styles.css` | `.intel-you` strip + `.intel-section` styles |
| `index.html` | asset cache-bust `?v=20260705o` |

## Preserved (as you asked)
- The leader-node privilege model (`_isLeader`, `getVisibleUserIds`, LEADER_GRANTS)
  — who-sees-whom is exactly as before.
- The athlete's own home mirror (unchanged).
- All kernel logic + the 24/24 quality harness (backend not touched).

## Verification
- `node --check` on app.js/data.js — clean; `node scripts/eval.js` → **24/24**
  (kernel unchanged). Visual behaviour is best confirmed on your live deploy — the
  "You" strip needs a real `/api/me/record` (a live DB + AI key) to show its
  reflection; until then it falls back to a warm welcome line.

## Design match
This is the approved mockup, made real: one surface, two zones (You / your people),
athletics-framed, no dashboard for the coach, no score for anyone.
