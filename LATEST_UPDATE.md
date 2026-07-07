# Update — Universal Primitives + the Cross-Domain Pattern Engine

This commit made the kernel *more universal and simpler at the same time* — no new
product surface. It now reasons about **primitive types**, not domain nouns, so the
same intelligence fires for a classroom, a clinic, a sales floor, or a family.

## What I built (and the two things I deliberately did NOT)

### Built
1. **Universal Primitive model — `ai/primitives.js` (new).** The kernel now exposes
   a handful of universal concepts — *outcome, state, participation, relational,
   capability, load, resource* — each with a **valence** (which way is "good", taken
   from the aim, never hardcoded). Everything else is a derivation.
2. **Translation layer — `ai/packs.js`.** `primitiveForSignal()` + `valenceFor()`
   map any source/field into a primitive, universally (a "Weekly Training Load"
   column → `load`; a "stress index" → `down-good`). Declared now; LLM-inferred +
   human-confirmed later. **Domain data → universal primitives, then reasoning.**
3. **Universal Pattern Engine.** Recognizes recurring structures that exist in every
   human system, over typed streams — **withdrawal · isolation · overload · plateau**
   — with evidence + confidence, never a cause. The *same code* fires whether the
   declining participation stream is "check-ins," "attendance," or "shift log-ins."
4. **Honest relationship graph.** Each briefing item now carries a `graph`
   (`nodes` = the person's typed streams, `edges` = cross-signal connections) —
   the ephemeral, **correlational** graph, exposed but never labelled causal.

### Deliberately NOT built (the challenge you asked for)
- **A persistent "universal causal graph" — no.** Per the causal doc, a stored graph
  of relationships inferred from signals is correlational fiction dressed as
  knowledge. Causal license stays with the intervention ledger; the graph is
  ephemeral and honest.
- **The multi-modal translation layer — that's adapters, not kernel intelligence.**
  It's OCR/ASR/parsers (already seeded by the CSV + vision adapters). Building it
  wouldn't make the kernel smarter, so it's not in this commit.

## How Advisor / Alignment / Signals fit (unchanged, clarified)
- **Signals** = the substrate every primitive is built from.
- **Alignment** = the aims + valence that define what "good" means for each stream.
- **Advisor / Coach** = narrates the primitive-level assessment in the domain's
  language on the way out. Same kernel; the vocabulary is a skin at both ends.

## The simplification (more power, less complexity — your principle)
The kernel no longer hardcodes five named dimensions; it reasons over *any typed
stream*. Adding a domain now means declaring source→primitive mappings (an adapter),
**never touching kernel logic.** Fewer concepts, broader reach.

## Files
| File | Change |
|---|---|
| `ai/primitives.js` | **new** — universal primitives + the cross-domain Pattern Engine |
| `ai/packs.js` | source→primitive translation (`primitiveForSignal`, `valenceFor`) |
| `ai/intelligence.js` | labels + actions for withdrawal/isolation/overload/plateau |
| `server.js` | typed streams (primitive+valence); structural patterns merged into briefing; honest graph on items + `/me/record` |
| `scripts/eval.js` | +8 golden cases · `index.html` `?v=20260705n` |

## Verification
- `node scripts/eval.js` → **24/24**; baseline **12/12**; intelligence **15/15**;
  `node --check` clean. Proven: patterns fire **domain-agnostically**, stay silent on
  steady streams, and **never assert a cause**.

## Honest caveat
- Overload/plateau only fire when the *typed* signals exist (a `load` stream, a
  `capability` stream) — which mostly arrive via imports/adapters. So their real value
  shows once a customer feeds more than check-ins. Withdrawal/isolation work on what
  you already collect. The engine is universal; the *coverage* grows with the data.
