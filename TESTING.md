# The Truth Layer

Three AIs and a founder can argue about design all day. **The tests decide.**
This is the objective spec every contributor — Claude, Codex, GPT-guided, or human
— builds against. If `npm test` is green, the change is safe to merge. If it's
red, it doesn't merge, no matter who wrote it or how confident they are.

## Run it

```bash
npm test        # the whole truth layer — one command, one verdict
```

No database, no API key needed. Everything here is pure and deterministic on
purpose, so it's fast, hermetic, and identical on every machine and in CI.

## What it guards

| Suite | Checks | Guards |
|---|---|---|
| `node --check` (all sources) | every `.js` parses | no broken commit ships |
| `baseline-smoke.js` | 12 | self-relative baselines; fairness (a stable-low person is never flagged); honest "learning" on thin data |
| `intelligence-smoke.js` | 15 | the 6 pattern detectors fire *and stay quiet* correctly; no scores |
| `privacy-smoke.js` | 16 | **the privacy law** — sensitive/hardship classified as informs-only; team/performance text stays citable; redaction; the gate directive |
| `eval.js` | 24 | the kernel golden set — patterns, cross-signal, confidence engine, packs, adapters, primitives |
| `invariants.js` | 14 | **the product laws** (below), executable |

## The product laws (in `invariants.js`)

These are non-negotiable. Breaking one turns the suite red:

1. **Directional, never graded** — no `x/100` scores, no letter grades as verdicts.
2. **Honest language** — no "prediction" / deterministic "will quit" claims.
3. **Correlation is not cause** — cross-signal output never asserts a cause.
4. **Never surface NaN/undefined** to a human.
5. **Self-relative** — the Coach reflects vs the person's *own* normal; forbids scores.
6. **Confidence honesty** — never claims reliability below the feedback floor.
7. **Privacy by construction** — engine items carry no raw text fields; sensitive
   context is a contentless flag only.
8. **Fairness** — a stable-but-low person is never flagged for being different.
9. **Universality** — patterns fire on any typed stream, domain-free.

## The rule for every contributor

- **Green before merge.** `npm test` must pass.
- **Fix a bug → add a golden case.** Every defect becomes a permanent test so it
  can never silently return. (This is also how the Confidence Engine grows.)
- **New capability → new invariant or golden case** that pins its intended
  behaviour *and* what it must never do.
- **Two implementers (Claude + Codex) review each other's diffs.** The tests are
  the tiebreaker, not seniority or confidence.

## Also available
- `npm run seed` — stand up the demo squad (needs `DATABASE_URL`). See `LIVE_SETUP.md`.
- `npm run smoke:advisor` — end-to-end advisor check (needs a live server + creds).
