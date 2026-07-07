# Update — Kernel Agents + the IntelliQ Mirror + a Quality Harness

Built for quality, not speed. A coherent vertical slice of the frozen
architecture: the kernel's cognitive agents are now a named layer, the person's
own IntelliQ lens is real, and quality is now **measured**, not felt.

## What I built

### 1. The kernel agent layer — `ai/agents.js` (new)
The kernel is now an explicit set of five named cognitive agents, each with one
job and a shared honesty contract (evidence-backed · confidence-rated ·
directional-never-scored · self-relative):
- **Observer** "I notice" · **Historian** "I remember" · **Analyst** "I connect" ·
  **Coach** "I reflect" · **Learner** "I improve".
- This module owns the two pure-reasoning agents: `analyst()` (composes the
  baseline + pattern engines into one assessment) and `coachReflectionPrompt()`
  (the person-facing IntelliQ reflection — warm, self-relative, values-anchored).
- Both lenses call the **same** agents; only the questions and the consent scope
  differ. No raw text ever enters — inputs are privacy-safe features only.

### 2. The IntelliQ lens — the person's own record
- **`GET /api/me/record`** (new): a person's *own* behavioural portrait
  (self-relative "normals"), what's shifted vs **their own** normal lately, their
  stated values/goals, and a warm reflection from the **Coach** agent (via the
  gateway, redacted as a last line). It's theirs — self-owned, self-relative.
- **Home is now a mirror, not a scoreboard.** Removed the "IntelliQ **Score**" and
  the "🔥 streak" (the exact journaling-app anti-patterns) and replaced them with:
  a warm "What IntelliQ notices about you" reflection, a self-relative portrait,
  a "vs your own normal, lately" row, and a directional word ("your direction"),
  never a number. Footer makes ownership explicit: *"This is yours… never a score,
  never shared without your say."*

### 3. Quality is now measured — `scripts/eval.js` (new)
A golden-set harness over the deterministic kernel (the seed of the **Confidence
Engine** you called a moat). Every case the kernel gets wrong becomes a permanent
golden case, so it can only improve. **7/7 passing**, covering: self-relative dip
fires, a naturally-quiet-but-stable person is *never* flagged (fairness), sparse
history stays honestly "learning," genuine decline fires, learning only surfaces
with ≥2 outcomes, the Coach prompt forbids scores — and **no output ever contains
NaN**.

### 4. A real quality bug the harness caught
The pattern detectors could emit **"NaN/5"** to a human if a mood series was ever
malformed (`drop < 0.5` let `NaN` slip through). Hardened `momentum_drop` and
`quiet_improvement` with finite-number guards — the kernel now can never surface
NaN. This is exactly why "best" needs measurement: it surfaced a defect that
"works on my data" would have shipped.

## Files
| File | Change |
|---|---|
| `ai/agents.js` | **new** — the five-agent kernel layer (Analyst + Coach + contract) |
| `scripts/eval.js` | **new** — golden-set quality harness (7 cases) |
| `ai/intelligence.js` | NaN-safety guards in two detectors |
| `server.js` | `require agents`; `GET /api/me/record` (IntelliQ lens) |
| `js/member-view.js` | Home → IntelliQ mirror; removed score/streak; `_loadIntelliQRecord()` |
| `css/styles.css` | `.iq-mirror` styles |
| `index.html` | asset cache-bust `?v=20260705k` |

## Verification
- `node scripts/eval.js` → **7/7**; `baseline-smoke` **12/12**; `intelligence-smoke`
  **15/15**; `node --check` on every changed file — all pass.
- Not run against a live DB/AI key here — the reflection's AI copy is the only
  part unproven until you run it live (the deterministic kernel is fully covered).

## Architecture preserved
- One kernel, two lenses: `/api/me/record` (IntelliQ) and `/api/intelligence/*`
  (Platform) call the same agents. Apps stay thin.
- Privacy: agents see only features; the person's own reflection is redacted as a
  belt-and-suspenders; sensitive context only softens tone, never enumerated.
- No new pages. IntelliQ improved by *replacing* the scoreboard, not adding surface.

## What's next (same plan, quality bar)
- Sharpen Platform: route the briefing through `agents.analyst` (DRY), tighten
  "why now," add a golden case per pattern.
- Stable-ID migration (T1) as its own tested ticket — deliberately deferred from a
  blind big-bang; it needs a backfill + a live run to do safely.
- Seed script + `LIVE_SETUP.md` so you can run the whole loop on real data.
