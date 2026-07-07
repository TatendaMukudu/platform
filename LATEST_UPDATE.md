# Update — Domain Packs (universal) + Cross-Signal Reasoning

Built the two positives you greenlit — **industry-agnostic**, on the frozen kernel,
quality-checked. Both lenses (IntelliQ + Platform) got smarter at once.

## What I built

### 1. Domain Pack framework — `ai/packs.js` (new, universal)
A Domain Pack is a small declarative lens the five agents load — **not** an agent,
**not** a subsystem, **not** tied to any industry. It maps signal sources →
universal behavioural dimensions. The default **Universal Human pack** covers the
dimensions *every* person has (mood, check-in cadence, reflection cadence,
contribution, supporting others) regardless of whether they're a student, athlete,
employee, or patient. A vertical pack can plug in later by adding dimensions +
mappings — the kernel and the five agents never change. Vocabulary lives in packs;
intelligence lives in the kernel.

### 2. Cross-signal reasoning — `ai/agents.js` (Analyst) + `ai/baseline.js`
"Discover connections humans never stated" — the **honest** version:
- Takes a person's numeric streams — the five behavioural dimensions **plus any raw
  signal** (a stat, a grade, attendance, a KPI) — so it's genuinely *cross of
  anything*, not one industry.
- Finds pairs that (a) each shifted from their **own** normal lately AND (b) actually
  **co-move** over the window (Pearson r ≥ 0.6, ≥ 6 shared weeks).
- Surfaces them as a **connection with confidence** — *"X and Y have moved together
  for them lately"* — and **never** as a cause. Domain-agnostic because it reasons
  over numbers-vs-self, not industry meaning.
- `baseline.shift()` added so any arbitrary stream can be measured self-relatively.

### 3. Both lenses surface it
- **IntelliQ mirror:** *"🔗 X & Y have been moving together for you lately — a
  connection worth noticing, not a cause."*
- **Platform briefing card:** the same connection as evidence under each member,
  labelled "(a connection, not a cause)."

### 4. Quality measured — `scripts/eval.js`
4 new golden cases (now **11/11**): cross-signal connects genuinely co-moving
shifted streams, **stays silent** on unrelated/noisy streams, **never** emits a
causal word, and the universal pack resolves industry-agnostically.

## Files
| File | Change |
|---|---|
| `ai/packs.js` | **new** — universal, pluggable Domain Pack framework |
| `ai/agents.js` | **new** `crossSignal()` (Analyst) + Pearson/weekly-bucket helpers |
| `ai/baseline.js` | **new** `shift()` — self-relative shift for any numeric stream |
| `ai/intelligence.js` | briefing item carries `connections` |
| `server.js` | build streams (dims + raw numeric signals) → `crossSignal`; expose on `/me/record` + briefing |
| `js/member-view.js` | connections in the IntelliQ mirror |
| `js/app.js` | connections on the Platform briefing card |
| `css/styles.css` | connection styles · `index.html` cache-bust `?v=20260705l` |

## Verification
- `node scripts/eval.js` → **11/11**; baseline **12/12**; intelligence **15/15**;
  `node --check` on all 7 changed files — clean.
- Honesty guaranteed by test: no causal language, silent on noise, self-relative.

## Architecture preserved
- Five agents unchanged; packs are lenses, not subsystems. One kernel, two lenses.
- Universal by default, vertical by addition — **zero industry lock-in.**
- No new pages. Privacy intact (numeric streams only; no text in reasoning).

## Honest caveat
- Deterministic parts fully tested. Cross-signal quality on *real* data (does a true
  connection show up, is it useful) is a live-pilot question — the math is honest and
  conservative (needs real co-movement + self-shift), so it errs toward silence, not
  false alarms.
