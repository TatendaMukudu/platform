# P0-5′ — origin independence as an object-agnostic invariant

**Status:** CURRENT implementation brief. **Nothing implemented.**
**Stage 11** of the final pre-implementation hardening program. Preceded by `ad08c90`.
**Written against:** `ad08c90`.

**The law, which survives Forum's retirement:**

> **AUTHORSHIP IS PRESERVED. AN ECHO DOES NOT BECOME AN INDEPENDENT ORIGIN.**

---

## 1 · Headline — the boundary is not where the failing test points

`pilot-loop-smoke §4` fails against the **Forum** feeder, which is being retired. Fixing that feeder
is effort spent on a dying surface. But tracing where the law is actually enforced produced a
sharper finding:

> **Origin independence is enforced deterministically *within* an intake turn, and by prompt
> instruction *across* turns.**

`originRef` is **model-supplied**. `ai/diagnose.js:823-839` is a prompt asking the model to give two
accounts of the same occurrence the same ref; `originOf(p)` (`:451`) accepts whatever string arrives,
trimmed and capped at 120 characters. Nothing validates that a ref corresponds to a real occurrence,
and nothing detects two refs naming one.

This is the exact attack surface the crappy-model benchmark must probe, and it is currently defended
by an instruction rather than by the kernel.

---

## 2 · What actually defends the law today

`deriveConfidence` (`ai/diagnose.js:218-260`) computes **two independent axes**, and they fail
differently:

| Axis | Computed from | Model can inflate it? |
|---|---|---|
| **independence** | `known = Set(originRef)` (`:225-231`) | **YES** — invent distinct refs |
| **temporal** | `occasions = Set(`source@turnId`)` (`:254`) | **NO** — the server stamps `source` (`server.js:9333`) and `turnId` |

Plus `UNKNOWN_ORIGIN_CAP` (`:238`): signals with **no** ref earn at most the credit of *"possibly one
corroborating voice, however large the room."* Omitting a ref is therefore safe; **inventing one is
not.**

### The residual attack, stated precisely

| Scenario | independence | temporal | Defended? |
|---|---|---|---|
| Model invents 3 refs **in one turn** | inflated to 3 | **1 occasion** | **YES** — temporal collapses it |
| Model omits refs entirely | capped at `UNKNOWN_ORIGIN_CAP` | n/a | **YES** |
| **3 people each retell the captain in 3 separate turns, model assigns 3 distinct refs** | **3** | **3** | **NO** |

The third row is the founder's own "five teammates repeating the captain" case. Both axes inflate
together, and the only thing standing between it and manufactured corroboration is the model reading
line 831 of a prompt and obeying it.

---

## 3 · Where the law IS deterministic

The **contribution** boundary is safe, and this is why P0-5′ relocates rather than dying:

```
groupCandidates → contribution.toGroupProposal (ai/contribution.js:242)
                   "ORIGIN SURVIVES INTACT. Nothing here mints a new originRef."
                → diagnose.applyProposals
                → shouldOpenGroupInquiry (:194)
                   contributors / independentOrigins / authorities → ECHO
```

Origins here are **inherited from existing evidence**, not named by a model. `shouldOpenGroupInquiry`
filters falsy refs (`:203`) and returns an explicit `ECHO` verdict for *"repetition, not
corroboration"*.

**So the law has a deterministic home already. What it lacks is coverage of the boundary where
origins are first minted.**

---

## 4 · P0-5′ — the object-agnostic invariant

> **P0-5′.** For any boundary at which evidence enters or crosses into a shared object — Inquiry,
> Focus, group, or Web aggregate — the number of **independent origins** must not exceed the number
> of distinct underlying occurrences. No transformation of evidence may increase it. Specifically:
>
> 1. **Retelling preserves the origin.** A contribution is a change of audience, never of basis.
> 2. **Machine transformation mints nothing.** Summarising, extracting, translating, classifying or
>    re-phrasing a human account produces a derived artifact with the **same** `originRef`.
> 3. **Absent origin is not independent origin.** It earns capped credit and never full credit.
> 4. **One occasion is one occasion.** Several signals from one source in one turn corroborate
>    nothing.

Clause 2 is the one with no deterministic enforcement today.

### The four boundaries

| Boundary | Status | Enforcement |
|---|---|---|
| **Intake** — text → proposals | **PROMPT-ENFORCED ONLY** | `ai/diagnose.js:823-839`; `temporal` catches only the same-turn case |
| **Contribution** — Self → group | **DETERMINISTIC** | `toGroupProposal`, `shouldOpenGroupInquiry` |
| **Focus collaboration** | not built | must inherit the contribution rule (`object-and-focus-contract.md` L-F3) |
| **Web aggregate** | being fixed by C2 | inherits whatever intake produced |

**The Web aggregate's guarantee is only as strong as intake's.** C2 makes `_webIntelligence` count
origins instead of people, which is necessary and not sufficient: if intake minted three refs for one
occurrence, C2 faithfully counts three.

---

## 5 · TEST CONTRACT

`scripts/origin-independence-smoke.js` (new), registered in `scripts/test.js`. Object-agnostic:
each case runs at **both** the contribution boundary and the Web-aggregate boundary.

| Id | Case | Expected | Fails today? |
|---|---|---|---|
| **O-1** | one person repeats one origin twice | 1 independent origin; no corroboration | passes |
| **O-2** | **ten people repeat one origin** | 1 origin; `ECHO`; **no Web artifact** | contribution passes; **Web fails** (C2) |
| **O-3** | two independent origins, two people | 2 origins; opens | passes |
| **O-4** | **machine summary of one human origin** | the summary carries the human's `originRef`; total stays 1 | **NO TEST EXISTS** |
| **O-5** | **machine extraction from one human origin** | same | **NO TEST EXISTS** |
| **O-6** | **human account + machine summary of it** | 1 origin, not 2 | **NO TEST EXISTS** |
| **O-7** | two humans independently observe one fact | 2 origins — genuine corroboration, must **not** be suppressed | passes |
| **O-8** | correction to an origin | the corrected signal supersedes; the count does not rise | partially — `canCorrect` (`:476`) |
| **O-9** | superseded origin | excluded from `known` | `status !== 'active'` filtered upstream |
| **O-10** | contested origin | both live; the disagreement is the finding; count unchanged | passes |
| **O-11** | **model emits 3 distinct refs for one occurrence, one turn** | `temporal` collapses to 1 occasion | passes — assert it, it is undefended elsewhere |
| **O-12** | **model emits 3 distinct refs across 3 turns for one occurrence** | **currently inflates to 3** | **YES — the open hole** |
| **O-13** | model omits all refs | `UNKNOWN_ORIGIN_CAP` applies | passes; assert it |
| **O-14** | model emits an `originRef` naming a non-existent occurrence | **currently accepted** | **YES** |

**O-4, O-5 and O-6 are the clauses the founder named and the repository has never tested.**
**O-12 and O-14 are the open hole.**

---

## 6 · Closing O-12 and O-14 — options, none chosen

The honest position: this is **not a pilot blocker**, because it requires a model that disobeys a
direct instruction, and the same-turn case is already defended. But it is the single place where a
weak model *can* reduce organisational integrity, so it belongs in the benchmark and in the queue.

| Option | Mechanism | Cost | Assessment |
|---|---|---|---|
| **A · resolve refs against evidence** | reject an `originRef` that does not resolve to a known evidence id or a prior ref | medium | strongest; needs a ref namespace the model can address |
| **B · server-stamped origins** | the server derives `originRef` from the evidence it wrote, never the model | medium | eliminates the class entirely — **but** loses the model's ability to say *"these two accounts are the same occurrence"*, which is genuinely useful |
| **C · novelty budget** | a turn may introduce at most N new origin refs; excess degrade to unknown | low | cheap, blunt, and preserves the useful case |
| **D · leave prompt-enforced, test it** | benchmark arm B probes it; no production change | zero | honest for the pilot |

**Recommendation: D for the pilot, C soon after.** B is tempting and wrong — it would discard the one
thing the model is genuinely better at here, which is recognising that two differently-worded accounts
describe the same occurrence. C keeps that and bounds the damage.

**Do not implement any of them now.** Record O-12 and O-14 as the benchmark's origin-corruption
probes (Stage 14).

---

## 7 · What must NOT be done

- **Do not fix the Forum UI feeder.** `pilot-loop-smoke §4` should be **relocated**, not repaired:
  move the assertion to `origin-independence-smoke` against the contribution boundary, and let the
  Forum-specific case retire with the surface.
- **Do not weaken the assertion to make it pass.** If the relocated test fails, that is the finding.
- **Do not touch `ai/contribution.js` or `ai/diagnose.js`.** Both are correct at their own boundary.

---

## 8 · Implementation packet

**Title:** P0-5′ — object-agnostic origin independence
**Why now:** the law currently has one deterministic home and one prompt-enforced boundary, and
nothing tests the machine-transformation clause the founder named.
**Authoritative law:** P0-5′ §4; `ai/contribution.js:203`; `ai/diagnose.js:218-260`.

**Files to inspect:** `ai/contribution.js:194-260`, `ai/diagnose.js:218-260, 445-459, 823-839`,
`server.js:9333` (source stamping), `:12588` (contribution admission).
**Files expected to change:** `scripts/origin-independence-smoke.js` (new), `scripts/test.js`,
`scripts/pilot-loop-smoke.js` (§4 relocated with a comment naming this brief).

**RED:** O-2 at the Web boundary, O-4, O-5, O-6, O-12, O-14 — six failures.
**Adversarial RED:** O-7 must **pass** throughout. A naive fix that suppresses any two signals sharing
a subject would satisfy O-2 and destroy genuine corroboration; O-7 is the assertion that catches it.

**Non-goals:** closing O-12/O-14 in production; changing `MIN_INDEPENDENT_ORIGINS`,
`UNKNOWN_ORIGIN_CAP` or the confidence formula; reviving Forum.
**Stop conditions:** any change required inside `ai/contribution.js` or `ai/diagnose.js`; O-7 turning
red.
**Definition of done:** O-1..O-11 and O-13 green; O-12 and O-14 present and **marked as known-open
with a comment naming the benchmark**; `pilot-loop-smoke` no longer carries the Forum-specific
assertion and its count is restated in the queue.
**Commit boundary:** one commit. **Dependencies:** C2 (the Web boundary must count origins before
O-2 can be asserted there).

---

## 9 · Consequence for the pilot-loop baseline

`pilot-loop-smoke` is currently **28 passed / 1 failed**, and every brief in this programme uses that
as the untouched baseline. Once §4 relocates, the baseline becomes **28/0 with one assertion moved**,
and the queue and every stop condition referencing "28/1" must be restated in the same commit.

**Until then, 28/1 remains the baseline and must not drift.**
