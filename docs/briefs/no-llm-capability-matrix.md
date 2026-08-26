# No-LLM capability floor — the real matrix and its proof contract

**Status:** CURRENT implementation brief. **Nothing implemented.**
**Stage 12** of the final pre-implementation hardening program. Preceded by `bc01d5e`.
**Written against:** `bc01d5e`.
**Replaces** the PR #74 suite's approach entirely — see the fake-green detector in
`docs/briefs/pr74-final-correction-contract.md`.

**The claim being tested:**

> If all model completion is disabled, IntelliQ still functions as a meaningful organisational
> intelligence harness.

**What that claim does NOT mean:** that deterministic IntelliQ equals model-enabled IntelliQ. It
means the organisation does not lose the harness.

---

## 1 · Classification vocabulary

| Class | Meaning |
|---|---|
| **DET** | deterministic code, no learned component |
| **STAT** | deterministic statistics (median/MAD, Wilson) — still no learned component |
| **LEARNED-LOCAL** | a learned model that could run on the box |
| **GEN-REQUIRED** | a generative model is required; no deterministic path exists |
| **GEN-OPTIONAL** | works without a model; a model improves it |
| **NOT IMPL** | the capability does not exist |

---

## 2 · THE MATRIX

| # | Capability | Class | Production path | Provable today? |
|---|---|---|---|---|
| 1 | **Evidence ingestion — structured** | **DET** | `_ingestAdapterEvidence:7857`, connectors, CSV | **yes** |
| 2 | **Evidence ingestion — free text** | **GEN-REQUIRED** | `_intakeTurn:9175` returns early when `!ai.enabled()` | yes — provable as *absent* |
| 3 | **Provenance** | **DET** | `originOf:451`, `originRef`/`originKind` preserved by `toGroupProposal:242` | **yes** |
| 4 | **Web resolution** | **DET** | `ai/org-graph.js` — pure, imports nothing | **yes** |
| 5 | **Privacy / admissibility** | **DET** | `_kernelEvidence:7760`, `_inheritedVisibility:7795`, `audienceSafe:293` | **yes** |
| 6 | **HIGH** | **STAT** | `baseline`+`intel.detectPatterns` → polarity → `behaviour.plan` | **yes** |
| 7 | **LOW** | **STAT** | same | **yes** |
| 8 | **Personal Inquiry — creation** | **GEN-REQUIRED** | only `_intakeTurn` writes `member:*` | yes — provable as *absent* |
| 9 | **Personal Inquiry — persistence** | **DET** | `inquiryStates` in `_persistedStores:184` | **yes** |
| 10 | **Group Inquiry — creation** | **DET** | `_admitGroupContributions:12588` | **yes** |
| 11 | **Group Inquiry — maintenance** | **DET** | `applyProposals`, `boundFrontier` | **yes** |
| 12 | **Focus — persistence** | **DET** | `userAiProfiles` in `_persistedStores` | **yes** |
| 13 | **Focus — creation** | **DET** | `/api/me/prepared/act:4838` | **yes** |
| 14 | **Focus — progress** | **NOT IMPL** | no field, no path | n/a |
| 15 | **Outcome intelligence** | **STAT** | Wilson lower bound `outcome-intelligence.js:79` | **yes** |
| 16 | **Org memory** | **DET** | `orgStateHistory`, `ai/org-memory.js:406` | **yes** |
| 17 | **Correction / supersession** | **DET** | `diagnose.js:485`, `canCorrect:476` | **yes** |
| 18 | **Contest** | **DET** | `status:'disputed'`, `server.js:10890` | **yes** |
| 19 | **Decision history** | **NOT IMPL** | `decision` is forward-looking only (J4) | n/a |
| 20 | **Retrieval — keyword/structured** | **DET** | `_retrieveGrounding:8684` | **yes** |
| 21 | **Semantic retrieval** | **LEARNED-LOCAL** | `ai/embeddings.js` — OpenAI today; **joins the switch per C7** | yes — provable as *degraded* |
| 22 | **Document understanding** | **GEN-REQUIRED** | `gateway.understand:281` — **no caller in production** | yes — absent |
| 23 | **Audio transcription** | **GEN-REQUIRED** | `gateway.transcribe:338` — **no caller in production** | yes — absent |
| 24 | **Vision** | **GEN-REQUIRED** | same as 22 | yes — absent |
| 25 | **Language / explanation** | **GEN-OPTIONAL** | `reason.speak` deterministic; optional restyle at the edge | **yes** |
| 26 | **Question generation** | **GEN-OPTIONAL** | `inquiry.planInquiries:285` selects and gates deterministically; wording templated | **yes** |
| 27 | **Hypothesis generation** | **GEN-OPTIONAL** | `ai/diagnose.js` structures them; the model proposes candidates | partial |

### The honest summary

**Nineteen of twenty-seven are DET or STAT.** Four are GEN-REQUIRED and three of those four
(document, audio, vision) **have no production caller at all**, so their absence costs nothing today.

**The single real loss with models disabled is free-text ingestion** (rows 2 and 8): personal
Inquiry cannot be created or maintained from prose. Everything else degrades in articulacy, not in
capability.

> **One-line statement for the constitution:** *without models, IntelliQ stops being able to read
> prose, and keeps everything it knows.*

---

## 3 · THE PROOF CONTRACT

`scripts/no-llm-floor-smoke.js` (new). **Replaces** `no-llm-harness-smoke.js` and
`pilot-loop-smoke §10`.

### 3.1 · Harness requirements — all four, or the suite proves nothing

1. `IQ_DETERMINISTIC_ONLY = '1'` **and** no API key.
2. **`gateway.complete`, `completeJSON`, `understand`, `transcribe` all stubbed to throw**, with a
   counter. Two is not enough — Stage A found four reachable exits plus the raw `client` export.
3. **`embeddings.embed` stubbed to throw** (post-C7 it is inside the switch; the stub proves the flow
   does not depend on it either way).
4. **A mutation record per assertion.** Every assertion names, in a comment, the production mutation
   that makes it red.

Precedent: `group-subject-smoke.js:19` and `forum-smoke.js:15` already run under the switch. Those
two plus `no-egress-smoke` are the only three suites that do.

### 3.2 · Assertions

Each row states the **mutation** that must turn it red. An assertion with no constructible mutation
is deleted.

| Id | Capability | Assertion | Mutation that must break it |
|---|---|---|---|
| **F-1** | switch active | `deterministicOnly() && !enabled() && !canTranscribe() && !canUnderstand() && !embeddings.enabled()` | remove any guard |
| **F-2** | Web resolution | a three-tier fixture yields the exact expected scope per actor | break `visibleScope`'s parent loop |
| **F-3** | privacy | a private-only member contributes **nothing** to any leader-visible count | remove the `private` branch at `:7773` |
| **F-4** | **Web High/Low** | a seeded org yields ≥1 High and ≥1 Low with the correct polarity | stub `_webIntelligence` to `[]` (**known to work** — verified) |
| **F-5** | **two-sided floor** | `k = n` yields nothing | remove the complement check |
| **F-6** | **Group Inquiry CREATION** | contribute two independent origins ⇒ an inquiry **appears** in `inquiryStates` that was not seeded | stub `_admitGroupContributions` |
| **F-7** | **ECHO** | ten contributions, one origin ⇒ **no** inquiry created | force `shouldOpenGroupInquiry` to `open:true` |
| **F-8** | provenance | the created inquiry's signals carry the **contributors'** origin refs, unchanged | make `toGroupProposal` mint a new ref |
| **F-9** | correction | supersede one signal ⇒ confidence band **moves** | stub `supersede` |
| **F-10** | contest | a dissenting signal ⇒ `status: 'disputed'` | remove the contest branch |
| **F-11** | Focus durability | create via `/api/me/prepared/act`, restart the store, read it back | break `_persistedStores` registration |
| **F-12** | Focus outcome learning | record `helped` ⇒ `noticeFeedback` moves ⇒ `reliability` changes | stub `_recordNoticeFeedback` |
| **F-13** | outcome intelligence | two interventions with different rates rank by **Wilson**, not raw rate | replace Wilson with a raw ratio |
| **F-14** | org memory | a state change appears in `orgStateHistory` and `changedSince` finds it | stub `orgMemory.changedSince` |
| **F-15** | **same reality, different actors** | member and leader hit **the same endpoint**; assert the specific governed difference | make the projection actor-independent |
| **F-16** | keyword retrieval | a grounded answer cites real evidence ids | stub `_retrieveGrounding` |
| **F-17** | deterministic language | `reason.speak` returns a non-empty rundown with no score and no name | stub `speak` |
| **F-18** | **zero model calls** | all five stubs uncalled | any production path reaching a provider |
| **F-19** | **honest absence — personal Inquiry** | free text produces **no** `member:*` inquiry, and the response says so rather than erroring | make `_intakeTurn` proceed without a model |
| **F-20** | **honest absence — semantic retrieval** | retrieval falls back to keyword **cleanly**, no exception | make the fallback throw |

### 3.3 · The four assertions that carry the claim

**F-6, F-7, F-8 and F-15.** They are the difference between "state survives" and "the harness works":

- **F-6** proves something is **created** deterministically. Every assertion in the PR #74 suite read
  back a seeded object; none created one.
- **F-7** proves the epistemic law holds with no model — the ECHO rule is the moat.
- **F-8** proves provenance survives a boundary crossing.
- **F-15** proves one reality yields different governed projections, which is the harness thesis in
  one assertion.

### 3.4 · What the suite must NOT claim

Explicitly written into the file header so the next reader is not misled:

- **not** that personal Inquiry works without a model — it does not (F-19 asserts the absence);
- **not** that Focus is *derived* or *progressed* without a model — only durable and readable;
- **not** that document, audio or vision work — they have no caller at all;
- **not** that semantic retrieval works — it degrades to keyword (F-20).

---

## 4 · IMPLEMENTATION PACKET

**Title:** real no-LLM capability floor (GW-6, C5)
**Why now:** the current claim rests on six green-by-construction assertions, and `pilot-loop-smoke
§10` — the sole assertion behind the harness claim — contains `&& false`.

**Files to inspect:** `ai/gateway.js:262-351`, `ai/embeddings.js:20`, `server.js:9175` (intake early
return), `:12588` (deterministic inquiry), `scripts/group-subject-smoke.js` (the template),
`scripts/no-egress-smoke.js`, `scripts/pilot-loop-smoke.js:180-190`.
**Files expected to change:** `scripts/no-llm-floor-smoke.js` (new), `scripts/test.js`,
`scripts/no-llm-harness-smoke.js` (deleted), `scripts/pilot-loop-smoke.js` (§10 removed).

**RED:** F-5, F-6, F-7, F-8, F-15, F-19, F-20 — seven failures before any change.
**Adversarial RED:** run the suite with **all five stubs removed** and a key present. F-18 must go
red. If it stays green, the stubs are not intercepting and the whole suite is theatre.

**Implementation constraint**
- Every assertion carries its mutation in a comment.
- **No assertion may read back a value the test seeded.**
- The suite must fail if any of the five model exits is reached.

**Non-goals:** making personal Inquiry deterministic; building fallbacks for vision or audio; changing
`_intakeTurn`.

**Stop conditions:** an assertion with no constructible mutation (delete it); F-18 green with the
stubs removed (the harness is broken).

**Definition of done:** F-1..F-20 green under the switch; each demonstrated red under its stated
mutation; F-18 red with stubs removed; `no-llm-harness-smoke.js` deleted; `pilot-loop-smoke §10`
removed with a comment pointing here; `scripts/test.js`'s registry line claiming exactly §2's
summary.

**Dependencies:** C7 (embeddings in the switch) for F-1. Otherwise independent.
**Commit boundary:** one commit. **This is queue item 1 and sequences before C1-C4.**
