# Model / worker economics architecture

**Status:** architecture. **Nothing implemented.** No production code changed.
**Stage A** of the autonomous architecture loop. Preceded by `ff56cca` (ontology investigation).
**Written against:** `ff56cca`. Every call site below was enumerated mechanically and attributed to
its enclosing endpoint or function.

**The law this document serves:**

> **USE THE CHEAPEST INTELLIGENCE CAPABLE OF SAFELY COMPLETING THE TASK.**

and its non-negotiable companion:

> **A weak model may make worse proposals. It must not make IntelliQ less true, less private, or
> less governed.**

---

## 1 · Executive finding

Three measurements, each of which changes the architecture:

**F-1 · IntelliQ runs almost entirely on the expensive tier.** Of 24 model call sites, **22 use
`tier: 'reason'`** (default `claude-sonnet-5`) and **2 use `tier: 'micro'`** (default
`claude-haiku-4-5`). There is no routing logic — the tier is a string literal at each call site,
chosen once when the call was written and never revisited.

**F-2 · Most model calls are unbudgeted.** `_llmBudgetOk` (`server.js:11420`) enforces 240/hour and
2000/day per org, and **only 5 of 24 call sites consult it** (`8928`, `8981`, `9176`, `9432`,
`9489`). The remaining 19 call the provider with no budget check. The budget is real but it guards
the intake path and little else.

**F-3 · Two model exits are dead code, and one of them lies.** `ai.understand()` and
`ai.transcribe()` are exported from `ai/gateway.js:351` and **invoked nowhere in production** —
verified by exhaustive grep. This corrects the PR #74 review, which classified them as live escapes:
they are *latent*, not *live*. But `server.js:6124` still reports `voice: ai.canTranscribe()` to the
client, and `canTranscribe()` ignores `deterministicOnly()`, so a no-egress org is **advertised a
transcription capability it has explicitly disabled**.

**There is no model router, no content cache, no batching, no escalation policy and no cost
telemetry beyond a per-org call counter.** That is the gap this document specifies.

---

## 2 · CURRENT MODEL CALL MAP

All 24 completion sites. `Det?` = is there a deterministic fallback if the model is absent.
`Budget?` = does the site consult `_llmBudgetOk`. `Tier` = the literal in the call.

| # | Site | Owner | Purpose | Tier | maxTok | Sync | Det? | Budget? | Target tier |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `3339` | `POST /api/intelligence/prepare` | phrase a prepared plan | reason | 500 | sync | partial | no | **T1** |
| 2 | `3372` | `POST /api/intelligence/prepare` | phrase a strength-spread | reason | 500 | sync | partial | no | **T1** |
| 3 | `3408` | `POST /api/intelligence/prepare` | phrase an intent message | reason | 500 | sync | partial | no | **T1** |
| 4 | `3732` | `GET /api/workspace/briefing` | narrative summary | reason | — | sync | **yes** | no | **T1** |
| 5 | `4103` | `_reasonedPrompts` | rank + phrase leader offers | reason | 500 | sync | **yes** (`:4094`) | no | **T1** |
| 6 | `4214` | `GET /api/intelligence/briefing` | narrative summary | reason | 200 | sync | **yes** | no | **T1** (removed by PR #74) |
| 7 | `4623` | `GET /api/me/record` | reflective line | reason | 220 | sync | **yes** | no | **T1** |
| 8 | `4814` | `_recordCheckin` | check-in acknowledgement | reason | 320 | sync | **yes** | no | **T0/T1** |
| 9 | `5429` | `POST /api/assessments/draft` | draft assessment fields | reason | 600 | sync | no | no | **T2** |
| 10 | `5532` | `POST /api/assessments/plan` | plan insight + plan | reason | 1100 | sync | no | no | **T2** |
| 11 | `5585` | `POST /api/assessments/plan/chat` | planning conversation | reason | 900 | sync | no | no | **T2** |
| 12 | `6060` | `POST /api/assessments/:id/summarize` | summarise submissions | reason | 600 | sync | no | no | **T1** |
| 13 | `6198` | `POST /api/admin/llm-selftest` | self-test both tiers | both | 160 | sync | n/a | no | n/a |
| 14 | `8937` | `_governedReason` | grounded org answer | ? | — | sync | **yes** | **yes** | **T2** |
| 15 | `9076` | `_composeTurn` | compose assistant reply | reason | 320 | sync | **yes** | **yes** | **T1** |
| 16 | `9187` | `_intakeTurn` | **prose → proposals** | **micro** | 4000 | sync | **no** | **yes** | **T1** |
| 17 | `9436` | `_kernelCoReason` | kernel co-reasoning | reason | — | sync | **yes** | **yes** | **T2** |
| 18 | `9495` | `_renderArtifact` | render an artifact | reason | — | sync | **yes** | **yes** | **T1** |
| 19 | `13299` | `POST /api/assistant/turn/:id/confirm` | self-assessment fields | reason | 500 | sync | no | no | **T1** |
| 20 | `13970` | `GET /api/groups/:id/copilot` | group copilot actions | reason | 500 | sync | no | no | **T1** |
| 21 | `14193` | `POST /api/notes/:id/ask` | answer about a note | reason | — | sync | partial | no | **T1** |
| 22 | `16773` | `_buildBehavioralProfile` | behavioural narrative | reason | 800 | sync | no | no | **T2** |
| 23 | `17271` | `POST /api/signals/import` | parse an import | reason | 1100 | sync | no | no | **T1** |
| 24 | `3339-3408` group | (counted above) | — | — | — | — | — | — | — |

### Non-completion model paths

| Path | Where | Status | Deterministic mode | Risk |
|---|---|---|---|---|
| `ai.understand()` | `gateway.js:281` | **exported, never called** | **fails open** — no internal check | latent |
| `ai.transcribe()` | `gateway.js:338` | **exported, never called** | **fails open**; `canTranscribe()` ignores the switch | latent + **capability endpoint lies** (`server.js:6124`) |
| `gateway.client` | `gateway.js:351` | raw SDK object exported | unguarded | latent escape hatch |
| `embeddings.embed()` | `server.js:8675`, `16821` | **live, 2 call sites** | **outside the switch** — `enabled()` is `!!KEY` | **live learned-model dependency** |
| `db.initVectors` | `server.js:17577` | boot, gated on `embeddings.enabled()` | outside the switch | live |

### What the map says

- **Everything is synchronous.** Not one completion runs in the background. Every model call sits in
  a request path, which is why `AI_BRIEF_MS = 8000` (`server.js:3635`) exists as a race-timeout
  rather than a queue.
- **Nothing is cached by content.** `intelBriefingCache` caches a *response* for 2h by
  `code:userId`; two identical inputs from different users each pay for a call.
- **Nothing is batched.** `_reasonedPrompts` already assembles a candidate list and asks the model to
  rank it — the one batch-shaped call in the product, and it is a good template.
- **The one genuinely irreducible call is #16**, `_intakeTurn`: prose → structured proposals, at
  `maxTokens: 4000`, and it is *already* on `micro`. Whoever wrote it made the right economics call
  and nobody repeated it elsewhere.

---

## 3 · THE THREE TIERS

> **T0 · DETERMINISTIC.** No model. Code, graph traversal, statistics, templates.
> **T1 · WORKER.** A cheap or local model. Bounded task, schema-constrained output, no authority.
> **T2 · SUPERVISOR.** A frontier model. Open reasoning, ambiguity, synthesis, adversarial review.

### Tier assignment law

> **L-E1 (proposed).** A task is assigned the **lowest tier that can produce an acceptable
> proposal**, never the lowest tier that can produce a correct answer — because no tier produces
> answers. Every tier produces proposals; the kernel produces answers. Tier choice therefore
> affects *quality of proposal only*, and can never affect truth, privacy, authority or provenance.

That law is what makes cheap tiers safe here and would not make them safe in a typical LLM product.
It holds only because `MODEL_MAY_PROPOSE` (`ai/diagnose.js:47`) already excludes `conclusion`, and
because confidence is computed deterministically (`ai/diagnose.js:22-23`).

### Distribution today vs target

| Tier | Today | Target | Change |
|---|---|---|---|
| T0 | the entire kernel | unchanged | — |
| T1 | 1 site (`_intakeTurn`) | **15 sites** | phrasing, ranking, extraction, summarising |
| T2 | 22 sites | **5 sites** | grounded answers, kernel co-reasoning, assessment planning, behavioural narrative, adversarial review |

**Fifteen of twenty-two `reason`-tier calls are phrasing or extraction tasks**, which is where the
money is going and where a cheap worker is sufficient.

---

## 4 · THE TASK ROUTER

Model-independent by construction. No provider name appears in a call site.

```
callSite → TaskSpec → router → { tier, provider, model } → gateway → proposal → kernel
```

### TaskSpec — what a call site declares

```
{
  task:        'phrase' | 'rank' | 'extract' | 'summarise' | 'answer' | 'coreason' | 'review',
  minTier:     0 | 1 | 2,        // the floor, from L-E2 below
  schema:      [...],            // required for anything above 'phrase'
  determinismFallback: fn | null,// what runs at T0 if no model is available
  cacheKey:    string | null,    // content-addressed; null = uncacheable
  budgetClass: 'interactive' | 'background' | 'bulk',
  egress:      'permitted' | 'org-only' | 'forbidden',
  maxTokens, timeoutMs
}
```

A call site names the **task**, never the model. Models become configuration — one table mapping
`(task, tier) → model id`, overridable per deployment and per org.

### L-E2 — the tier floor is a safety property, not a quality preference

> A task may declare a **minimum** tier only when a lower tier would create a *governance* risk, not
> when it would merely produce a worse proposal. The only governance-relevant reasons to require
> T2 are: (a) the task must reason over adversarial or untrusted input; (b) the task must recognise
> when it does not know. Everything else is a quality preference and must not be encoded as a floor.

### Escalation

Escalation is **kernel-triggered, never model-requested**. A worker cannot ask for a better model —
that would let a cheap model spend money by claiming difficulty.

| Trigger | Action |
|---|---|
| Schema validation fails twice | escalate one tier |
| Proposal cites a span not present in the source (`diagnose.js` span check) | escalate once, then drop |
| Proposal claims `conclusion` level | **reject, do not escalate** — the tier is not the problem |
| Kernel rejects every proposal in a batch | escalate once |
| Budget class is `bulk` | **never escalate** — degrade instead |

### Graceful degradation ladder

```
T2 unavailable → T1  → T0 deterministic fallback → honest empty state
```

`behaviour.plan`'s calm empty states (`ai/behaviour.js:36-47`) are already the bottom of this ladder
and are a first-class product outcome, not a failure. **Degradation must never surface an error to a
person.**

---

## 5 · CONTEXT PACKET

The unit a worker receives. Deliberately not "the conversation so far".

```
ContextPacket {
  purpose,                    // the governed purpose, as _retrieveGrounding already uses
  scopeSignature,             // Web scope + evidence fingerprint — the cache key
  admissibleRefs: [],         // evidence REFERENCES, never content, where possible
  admissibleContent: [],      // only what the purpose genuinely requires
  frontier: [],               // open inquiries, for identity resolution
  vocabulary: [],             // allowed concept labels
  refusals: [],               // what this worker may not propose
  provenanceStamp             // machine identity — see §8
}
```

Two properties matter more than the shape:

- **The packet is assembled by the kernel, not the worker.** A worker never retrieves. This is
  already true (`_retrieveGrounding` runs server-side) and must stay true.
- **The packet is the cache key.** `scopeSignature` already exists in the form
  `${code}|${purpose}|v1|${fingerprint}|${scopeSig}` (`server.js:9951`). Content-addressed model
  caching is therefore a small extension of a key that is already computed.

---

## 6 · CACHING, BATCHING, BACKGROUND

### Cache

> **L-E3 (proposed).** A model call whose ContextPacket hashes to a packet already answered, and
> whose underlying evidence fingerprint has not moved, must not be repeated. Cache the *proposal*,
> never the rendered text, so governance re-runs on every read.

Caching the proposal rather than the output is the important half: a cached proposal still passes
through `audienceSafe`, span checks and confidence derivation for the new reader.

Estimated hit rate is high for exactly the calls that dominate volume — briefing narratives and
prepared-plan phrasing are recomputed per reader over identical org state.

### Batch

`_reasonedPrompts` (`server.js:4091`) is the template: assemble N grounded candidates, ask once for
a ranked subset, map ids back. Applicable immediately to sites 1-3 (three separate calls in one
endpoint) and to any per-member loop.

> **L-E4 (proposed).** A model call inside a per-person loop is a design error. Batch to one call
> per cohort with ids, and map back deterministically.

### Background

Every completion is currently synchronous. The correct split:

| Class | Examples | Where it should run |
|---|---|---|
| `interactive` | assistant turn, note ask | request path, tight timeout, T1 |
| `background` | briefing narrative, prepared phrasing | **after `_reasonSweep`**, cached for the next read |
| `bulk` | import parsing, summarise | queued, never escalates |

This is what makes *"IntelliQ feels like it is constantly thinking"* affordable: the deterministic
sweep already runs every 30 minutes (`server.js:17599`); the phrasing rides on its result and is warm
when someone looks. **The feeling comes from the sweep, not from inference.**

---

## 7 · COST BUDGETS AND TELEMETRY

Today: 240/hour, 2000/day per org, honoured at 5 of 24 sites, counted as `_metric(code, 'llm_call')`
— **a call counter, not a cost meter**. It cannot distinguish a 160-token phrasing from a
4,000-token intake.

> **L-E5 (proposed).** Budget is denominated in **estimated tokens by tier**, not calls. Every
> gateway call records `(org, task, tier, promptTokens, completionTokens, cacheHit, escalated)`. A
> budget that cannot tell a cheap call from an expensive one cannot shape behaviour.

Budget classes degrade differently: `interactive` degrades to T1 then T0; `background` defers to the
next sweep; `bulk` queues. **No class ever fails a user-visible request because of budget.**

---

## 8 · MACHINE PROVENANCE AND THE INJECTION BOUNDARY

> **L-E6 (proposed).** Every proposal records which engine produced it:
> `{ tier, modelId, promptVersion, at }`. When a model is later found to have been systematically
> wrong, its proposals must be findable. Without this, swapping engines is unauditable.

This composes with the existing origin law: the machine stamp is **not** an `originRef`. A model is
never an origin of evidence. It is the *proposer* of an interpretation whose origin remains whatever
the human material was.

The injection boundary is already correct and must be inherited: `assembleGoverned` demotes uncited
claims, span containment is checked (`ai/diagnose.js:55+`), and `prompt-injection-smoke` covers it.
**A cheaper model raises injection risk, so the span check becomes more load-bearing, not less.**

---

## 9 · CRAPPY MODEL BENCHMARK

The point of the benchmark is not to find the best model. It is to **prove the invariant**:

> Quality varies. Truth integrity, privacy, authority and provenance do not.

### Arms

| Arm | Engine | Purpose |
|---|---|---|
| **A** | `IQ_DETERMINISTIC_ONLY=1`, no key | the capability floor |
| **B** | a deliberately weak model | adversarial — does weakness leak past the kernel? |
| **C** | a competent cheap worker | the intended T1 |
| **D** | frontier | the intended T2 and the quality ceiling |

All four run against **one fixture organisation** with identical seeded evidence, identical Web,
identical actors. Same inputs, same governance, four engines.

### Measured per arm

**Quality (expected to vary):** proposal usefulness; High/Low usefulness; Inquiry proposal
usefulness; Focus suggestion usefulness; latency; prompt/completion tokens; estimated cost.

**Integrity (expected to be identical across all four):**

| Invariant | Assertion |
|---|---|
| No proposal above `hypothesis` is accepted | `MODEL_MAY_PROPOSE` holds in every arm |
| No fabricated span is admitted | span containment rejects, in every arm |
| No confidence is model-asserted | every confidence traces to `deriveConfidence` |
| Origins are counted, never voices | echo produces no corroboration, in every arm |
| No private evidence reaches a leader surface | `private-evidence-smoke` invariants hold |
| `audienceSafe` violations are zero | in every arm |
| Authority does not settle empirical claims | P0-D holds |
| Tenant isolation holds | in every arm |

### The benchmark's actual output

Two numbers per arm, and one boolean:

- **usefulness score** (human-rated on a fixed rubric) — expected A < B < C < D
- **cost per organisation-day** — expected A = 0 < B < C < D
- **integrity violations** — **expected 0 in all four arms.** Any non-zero result in arm B is a
  kernel defect, not a model defect, and blocks the tier programme.

> **L-E7 (proposed).** Arm B is a **kernel test wearing a model costume**. Its purpose is to attack
> the governance boundary with the weakest plausible adversary. A violation in arm B must be fixed
> in the kernel, never by requiring a better model.

---

## 10 · EXTERNAL ARCHITECTURE REVIEW

Studied for primitives, not for adoption. IntelliQ must remain pilot-buildable.

| Source | Primitive solved | Do we need it? | Have it? | Verdict | Cost / complexity |
|---|---|---|---|---|---|
| **LiteLLM** | one API over many providers; per-key budgets; fallback chains | **yes** — exactly §4 | **partly** — `ai/gateway.js` already abstracts Claude + OpenAI with automatic fallback | **ADAPT the pattern, REJECT the dependency** | low / low — the gateway is ~350 lines and already does the hard part |
| **OpenRouter** | model-as-configuration; routing by price/capability | **yes** — the idea | no | **ADAPT concept** — a `(task,tier)→model` table | none |
| **vLLM** | high-throughput self-hosted serving | not at Falcon scale | no | **LATER** | high / high |
| **Ollama / llama.cpp** | local model execution; zero egress | **yes, strategically** — a T1 that never leaves the box is the strongest possible answer to a school's privacy question | no | **LATER, but design for it** — the router must not assume a network provider | medium / medium |
| **LangChain** | chains, prompt templates, tool glue | **no** | we have better — a governed kernel, not a chain | **REJECT** | would invert control; the kernel must own the loop |
| **LangGraph** | explicit state-machine agent graphs; checkpointing | the *idea* yes, the library no | **yes** — `_reasonSweep` + `_reasonNudge` is already a level-triggered controller | **REJECT library, KEEP pattern** | high complexity for no new capability |
| **Microsoft AutoGen** | multi-agent conversation | **no** | n/a | **REJECT** | agents negotiating truth is precisely what the kernel exists to prevent |
| **Dapr Agents** | durable actors, pub/sub, per-agent state | no at pilot scale | partly (durable units) | **REJECT for pilot** | operational dependency |
| **Temporal** | durable execution, retries, workflow history | **no** — reasoning is idempotent recomputation, not a resumable workflow | n/a | **REJECT** (restated from Web adjudication §13) | high |
| **Camunda** | BPMN process orchestration | no | n/a | **REJECT** | wrong shape entirely |
| **Ray** | distributed compute | no | n/a | **REJECT** | one dyno |
| **NVIDIA NIM / Nemotron** | packaged inference microservices; open weights | not as architecture | n/a | **REJECT as architecture, LATER as a T1 candidate** | models are configuration, never architecture |

### The three lessons worth keeping

1. **LiteLLM's budget-per-key** — budgets belong at the gateway, not at the call site. IntelliQ's
   budget is currently checked by callers, which is why 19 of 24 sites skip it. Moving the check
   into `gateway.complete` fixes all 19 at once. **This is the single highest-value change in this
   document.**
2. **OpenRouter's model-as-config** — no provider name in a call site. IntelliQ is close: `MODELS`
   (`gateway.js:27`) is already env-overridable; what leaks is `tier` chosen per call site.
3. **LangGraph's level-triggered checkpointing** — already implemented as `_reasonSweep`. Confirms
   the design rather than suggesting a change.

### What must not happen

Making LangChain or LangGraph foundational would invert control: the framework would own the loop
and the kernel would become a tool it calls. IntelliQ's entire value is that the kernel owns the
loop and the model is the tool. **That inversion is the one architectural mistake from which this
product could not recover.**

---

## 11 · MINIMUM VIABLE ADOPTION

Ordered by value per unit of risk. None requires new infrastructure.

| # | Change | Effect | Size |
|---|---|---|---|
| **E1** | Move `_llmBudgetOk` **inside** `gateway.complete`/`completeJSON` | 19 unbudgeted sites become budgeted at once | small |
| **E2** | Record `(org, task, tier, tokens, cacheHit)` per call | budget becomes a cost meter (L-E5) | small |
| **E3** | Retire or gate `understand`/`transcribe`; stop `canTranscribe()` ignoring the switch | closes the latent escapes and the lying capability endpoint | small |
| **E4** | Re-tier the 15 phrasing/extraction sites to `micro` behind a `task` label | the bulk of the saving | medium |
| **E5** | Content-addressed proposal cache keyed on the existing scope signature | removes duplicate calls across readers | medium |
| **E6** | Move `background`-class calls behind `_reasonSweep` | latency and cost, and it is what makes "always thinking" affordable | medium |
| **E7** | Crappy model benchmark, arms A + B only | proves the invariant before any re-tiering ships | medium |

**E1 + E3 are the pilot-relevant ones.** E1 because an unbudgeted provider call in a request path is
a live cost risk during a pilot; E3 because a no-egress org is currently told it has voice
transcription.

**E7 should run before E4.** Re-tiering without the integrity benchmark is the one sequencing
mistake available here.

---

## 12 · DEFERRED

- Any inference framework (LangChain, LangGraph, AutoGen, Dapr, Temporal, Ray).
- Self-hosted serving (vLLM) or local execution (Ollama) — **design for it, do not build it**.
- Multi-agent or agent-negotiation architectures — permanently rejected, not deferred.
- Fine-tuning or model specialisation of any kind.
- A separate worker process or queue infrastructure; `background` can ride the existing sweep.
- Choosing a specific T1 model. Models are configuration; the table is the deliverable.

---

## 13 · FOUNDER DECISIONS ARISING

### D-E1 · Is a local/on-box T1 a pilot selling point or a post-pilot capability?

A school asking *"where does our children's data go"* has a much better answer if T1 runs on the box.
It is also the strongest possible expression of the harness thesis.
**Recommendation: design the router so a local provider is a config entry, build nothing now.**
Blocks: nothing. Shapes: the router interface.

### D-E2 · What is an acceptable quality floor for T1 on member-facing text?

Arms B and C will differ visibly in warmth and specificity. The benchmark measures it; only the
founder can say what is acceptable to put in front of a Falcon player.
**Blocks: E4 (re-tiering).** Cannot be answered from the repository.

### D-E3 · Does `embeddings` count as a model dependency for the no-LLM claim?

`ai/embeddings.js:20` — `enabled()` is `!!KEY`, entirely outside `deterministicOnly()`. Either it
joins the switch (and semantic retrieval goes dark in no-egress mode) or the claim is narrowed in
writing to "no generative model".
**Recommendation: join the switch.** A school buying no-egress will not accept "except embeddings".
**Blocks: the no-LLM floor test wording (PR #74 correction 5).**
