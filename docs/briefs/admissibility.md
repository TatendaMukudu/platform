# Brief: `ai/admissibility.js` — the retrieval-boundary lifecycle gate

**For:** Codex
**From:** Claude (architecture)
**Branch:** start from current `main`. Do NOT use `codex/outcome-priority-office` — it is
withdrawn, see `docs/briefs/codex-fix-outcome-priority-office.md`.
**Arbiter:** `scripts/admissibility-smoke.js` already exists and is currently RED. Your job is
to make it green without editing it. Then `node scripts/test.js` must be green too.

---

> ## CORRECTED — the premise below was wrong
>
> This brief said the retrieval boundary had no awareness of evidence lifecycle. It does.
> `_kernelEvidence` in server.js — "the ONLY door to kernel reasoning" — opens with
> `if (env.status !== 'active') return false;`, so superseded envelopes never reach
> `_retrieveGrounding`, and the allowlist form fails closed on lifecycle states not yet
> invented. I asserted the opposite in three files without checking the code.
>
> Note too that the two layers use different vocabularies: `lib/evidence.js` envelopes are
> `['active','held','superseded','deleted','rejected']`; `ai/diagnose.js` signals are
> `['active','superseded','withdrawn']`. A gate written for one does not fit the other, so
> "wire admissibility into `_retrieveGrounding`" was never the right follow-up.
>
> What is genuinely missing is smaller and real: `diagnose.isActive(null)` is `true`, so a
> malformed signal counts as support; and nothing reports *why* a signal was excluded, which
> is what makes a correction visible rather than a silently shorter answer.
>
> **The module is built and merged** (`ai/admissibility.js`, 25/25). This brief is kept as the
> record of an architectural claim that the repository disproved.

## The task in one sentence

Write `ai/admissibility.js` so that `node scripts/admissibility-smoke.js` passes.

The suite is the specification. It was written before the module, by someone who will not
implement it, and it carries the reasoning for every rule in its comments — read those first,
they explain *why* each case exists, which matters more than the assertions.

**Do not edit the suite to make it pass.** If you believe an assertion is wrong, say so in the
PR with your reasoning and leave it failing. Repository truth beats this brief, but a test you
were asked to satisfy is not yours to weaken silently — that is the one move that makes the
whole arrangement worthless.

---

## What the module is

A pure gate answering exactly one question: **may this signal ground an answer right now?**

```js
admit(signal)       → { admissible: boolean, status: string, reason: string|null }
partition(signals)  → { admissible: [...signals], excluded: [{ ref, status, reason }] }
```

`_retrieveGrounding` in `server.js` currently has no awareness of signal lifecycle, so a
withdrawn account can still ground a current factual claim. That is what makes corrections
cosmetic, and it is the gap this closes. **You are not wiring it in** — see out of scope.

## The two things that are easy to get wrong

**1. Allowlist, never denylist.** `SIGNAL_STATUSES` in `ai/diagnose.js` is
`['active','superseded','withdrawn']`. Admit only what you recognise as admissible; everything
unrecognised is inadmissible. Excluding a list of known-bad values fails OPEN — the day
someone adds `'disputed'`, every disputed signal starts grounding answers until a human
notices. AGENTS.md §2 epistemic invariant 7.

**2. This is not `isActive`.** `ai/diagnose.js` has:

```js
const isActive = s => !s || !s.status || s.status === 'active';
```

`isActive(null)` is **true**. That is correct for the confidence kernel and wrong for a
retrieval gate. You must be stricter for a missing or malformed signal, and identical for a
signal with no status (legacy rows must keep working). The suite pins both directions, and the
divergence must be deliberate and visible, not quiet.

## Read before writing

- `ai/diagnose.js` — the header, `SIGNAL_STATUSES`, `isActive`, `supersede`. This is the
  vocabulary; do not invent a parallel one.
- `scripts/admissibility-smoke.js` — the whole file, comments included.
- `AGENTS.md` §2, the seven epistemic invariants.

## Out of scope — these already have homes

| Not your job | Where it lives |
|---|---|
| counting independent origins | `ai/diagnose.js:deriveConfidence` |
| whether evidence may enter a group | `ai/contribution.js:mayContribute` |
| who may read a subject | the server's auth layer |
| predictive / diagnostic phrasing | `ai/language-guard.js` |
| wiring into `_retrieveGrounding` | Claude, on the current branch |

If a rule you are writing starts to look like confidence, authorisation or phrasing, it belongs
in one of those instead. A second confidence function is a defect, not a feature.

Also: no new durable store, no changes to `ai/diagnose.js`, no changes to `server.js`.

## Registration

Add `'admissibility-smoke.js'` to the suite list in `scripts/test.js` **in the same commit**
that adds the module. An unregistered suite does not count — that is how three red suites got
reported as done last time.

## Acceptance

Paste, verbatim, not summarised:

1. `node scripts/admissibility-smoke.js` — the full output.
2. `node scripts/test.js` — the final verdict line.
3. Anything in this brief or in the suite the repository proved wrong.

A red result reported honestly is worth more than a green one that was not run.

**Push to a branch off current `main`.** Work that is not pushed did not happen.
