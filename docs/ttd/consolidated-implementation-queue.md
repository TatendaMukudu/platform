# Consolidated implementation queue

> **PARTIAL.** The 46-item register and its priority classes remain valid as a catalogue.
> **Its blocker classification is SUPERSEDED** by
> `docs/ttd/pilot-blocker-challenge-and-packets.md` (Stage 16), which challenged every claimed
> blocker and reduced eight to six — demoting J2, C3, C6 and C7, and promoting O-1 and GI-6.
> For implementation order, read that document.


**Status:** the single ordered queue. Supersedes every prior queue.
**Stage G** of the architecture loop. Preceded by `810e396` (PR #74 correction contract).
**Written against:** `810e396`.

**Supersedes and absorbs:** the P0 register (`docs/briefs/p0-pilot-blockers.md`), the constitution's
§10 sequence, `web-semantics…` §18, the W-3/W-4 brief §7, the ontology audit §14, and the Stage A/B/C
/D/E adoption lists. Where any of those disagrees with this document, **this document governs**.

**Governing rule:** *future infrastructure must not delay the pilot unless a concrete current safety
or correctness failure exists.* Applied strictly below — only eight items are classified as blocking.

---

## 1 · Priority classes

| Class | Meaning |
|---|---|
| **PILOT BLOCKER** | a live safety or correctness failure, or a field that cannot be back-filled once records exist |
| **PRE-PILOT** | should land before Falcon, but the pilot could start without it |
| **PILOT EXPERIMENT** | deliberately learned from Falcon rather than decided in advance |
| **POST-PILOT** | wait for pilot evidence |
| **SCALE** | needed at a second organisation or beyond |
| **RESEARCH** | no implementation intent yet |

---

## 2 · THE QUEUE

### PILOT BLOCKERS — eight items

Ordered by dependency, not severity. Everything here is a live defect or an unrecoverable omission.

| # | Item | Source | Why it blocks | Depends on |
|---|---|---|---|---|
| **1** | **C5 · no-LLM suite exercises production** | PR #74 review | six of eight assertions are green by construction; without this, corrections 2-4 cannot be shown to work | — |
| **2** | **C1 · privacy floor gates the whole payload** | PR #74 review | demonstrated live: a two-person scope publishes a per-person count while claiming the floor was applied | 1 |
| **3** | **C2 · count origins, not people** | PR #74 review | demonstrated live: one origin retold by three people surfaces a Web Low | 1 |
| **4** | **C3 · confidence/severity derived, not asserted** | PR #74 review | a Web artifact claims what the kernel never established | 1, 3 |
| **5** | **C4 · `audienceSafe` protects the Web projection** | PR #74 review | every identity vector except one passes today | 1 |
| **6** | **J2 · `focus.origin { by, from }`** | ontology audit | **unrecoverable** — intent cannot be back-filled onto records created without it | — |
| **7** | **C6 · `canTranscribe()` respects the switch** | Stage A | a no-egress org is advertised a capability it has disabled | — |
| **8** | **C7 · settle the embeddings claim** | Stage A/B | **founder-blocked**; the no-LLM claim is currently ambiguous in writing | founder |

**Items 6 and 7 are independent of PR #74** and can run in parallel with 1-5 if a second session is
available. Items 1-5 are one PR and must not be split.

### PRE-PILOT — eleven items

| # | Item | Source | Note | Depends on |
|---|---|---|---|---|
| 9 | **C8 · audit `_promptCandidates`, then restore or retire** | PR #74 review | a capability regression; the doc must match the code either way | — |
| 10 | **C9 · document the severed feedback loop** | PR #74 review | documentation only | — |
| 11 | **E1 · move `_llmBudgetOk` inside the gateway** | Stage A | fixes 19 unbudgeted call sites at once; an unbudgeted provider call in a request path is a live pilot cost risk | — |
| 12 | **E2 · token-denominated cost telemetry** | Stage A | a call counter cannot distinguish 160 tokens from 4,000 | 11 |
| 13 | **O-1 · person-model decay** | Stage E | a live defect: a 2026 dimension outranks a 2028 one, permanently | — |
| 14 | **W-3 · leader gains direct parents + role fix** | W-3/W-4 brief | founder law FW-2; includes the `top_leader` regression fix | D-W6, D-W7 |
| 15 | **GW-5 · graph-change invalidation** | Stage B, W-3/W-4 brief | rosters and briefings are stale for up to 2h after a re-parent | 14 |
| 16 | **W-4 parity harness** | W-3/W-4 brief | no behaviour change; enumerates the scope divergence | 14, D-W5 |
| 17 | **J1 · `inquiry.servesObjectiveId`** | ontology audit (= P0-C) | unlocks two Level-1 sweeps | — |
| 18 | **J3 · `intervention.respondsToInquiryId`** | ontology audit | today `reason` is the string literal `'briefing'` | — |
| 19 | **P0-B · `prov()` gains `by` and `at`** | harness addendum | **verified still absent** (`ai/org-state.js:86`); without it no later reconstruction is possible | — |
| 20 | **B1 · the four Level-1 deterministic sweeps** | Stage B | needs the foreign keys above; no new mathematics | 17, 18, 6 |

### PILOT EXPERIMENT — four items

Deliberately learned from Falcon rather than decided in advance.

| # | Item | Question Falcon answers |
|---|---|---|
| 21 | **E7 · crappy model benchmark, arms A and B** | does the kernel hold against a weak model? Must run **before** any re-tiering |
| 22 | **D-W4 · may the worker open a group Inquiry unprompted?** | how often do leaders agree with the corroboration verdict? |
| 23 | **D-C1 · may private evidence count toward an aggregate?** | how often is a real pattern invisible because it is private? |
| 24 | **J4 scoping · decision-as-history** | which joins does Falcon actually need? Watch a dozen real decisions first |

### POST-PILOT — ten items

| # | Item | Source | Gated on |
|---|---|---|---|
| 25 | E4 · re-tier 15 phrasing/extraction sites to a cheap worker | Stage A | 21, D-E2 |
| 26 | E5 · content-addressed proposal cache | Stage A | 12 |
| 27 | E6 · move background-class model calls behind `_reasonSweep` | Stage A | 26 |
| 28 | G3 · member organisational intelligence (Web → Self) | constitution, Stage C | C2/C3 contracts |
| 29 | G1 · Focus `participantIds` + `scopeNodeId` | ontology audit | 6 |
| 30 | P0-5′ · origin preservation at the Focus/Inquiry boundary | Stage F, W-3/W-4 brief §... | 29 |
| 31 | W-4 P1 migration (3 ENUMERATE sites) | W-3/W-4 brief | 16 |
| 32 | GW-8 · aggregate-safe projection (rates at n≥4) | Stage D, `web-semantics` §23 | 2 |
| 33 | J5 · behaviour → aim bearings | ontology audit | real Falcon capability observations |
| 34 | P0-A · reconcile `orgGoals` with org-context objectives | harness review | see §3 |

### SCALE — seven items

| # | Item | Trigger |
|---|---|---|
| 35 | Comparison Web (peer aggregates) | a second organisation, plus D-P1/D-P2 |
| 36 | W-4 P2 migration (10 further sites) | 31 proving safe |
| 37 | `webCandidates` durable store | a shorter cadence or a second org makes re-surfacing observable |
| 38 | GW-4 · node validity windows | the first fixed-term intervention group |
| 39 | GW-3 · multi-parent routing reconciliation | a genuine matrix org |
| 40 | GW-10 · reason-carrying Web filter | quality of explanation |
| 41 | Local/on-box T1 model path | D-E1; a school that requires it |

### RESEARCH — five items, no implementation intent

| # | Item | Status |
|---|---|---|
| 42 | Structural similarity for peer comparability | the one graph technique worth adopting later (Stage B §3) |
| 43 | Causal inference / difference-in-differences on interventions | needs J3 and real cohorts |
| 44 | G9 · policy as data (Cedar/OPA-shaped) | permissions are code constants |
| 45 | P0-6 · inquiry-state concurrency recovery | unadjudicated; not a pilot blocker |
| 46 | Classical ML, GNNs, graph embeddings | **rejected** — L-B1, L-B2 |

---

## 3 · P0 REGISTER RECONCILIATION

Verified at `810e396`:

| Id | Claim | Actual status |
|---|---|---|
| **P0-A** retire `orgGoals` | *"written by a UI and read by nothing — the sharpest pilot risk"* | **partially overtaken.** `orgGoals` is now read at `server.js:17028` into a citable `ORG priorities` string. It still reaches **no deterministic reasoning** — the duplication with org-context `objective` stands, but the "types into a void" risk is reduced. **Reclassified POST-PILOT (34).** |
| **P0-B** `prov()` gains `by`/`at` | queued | **still absent** — `ai/org-state.js:86-88` returns `{source, rule, confidence, kind, evidenceIds}`. **PRE-PILOT (19)**, because without a timestamp on declarations no later reconstruction is possible at all. |
| **P0-C** inquiry records its objective | queued | **still absent** = **J1**, PRE-PILOT (17). |
| **P0-D** empirical precedence | PR #73 | **landed.** |
| **P0-3** durable concurrency | PR #72 | **landed.** |
| **P0-5** echo origin | `pilot-loop-smoke §4` failing | **relocates** — the law survives, the Forum feeder does not. POST-PILOT (30) as P0-5′. |
| **P0-6** inquiry-state recovery | unadjudicated | RESEARCH (45). |

---

## 4 · WHAT FALCON ACTUALLY NEEDS

**Eight blockers and eleven pre-pilot items.** Nothing else.

Read the other way: of 46 tracked items, **38 are explicitly not required for the pilot**. That is
the point of this document — the queue has been growing faster than the pilot has been approaching,
and most of it is genuinely deferrable.

### The critical path

```
C5 → C1 ─┬→ C2 → C3 ──┐
         └→ C4 ────────┴→ PR #74 re-review → APPROVE
J2, C6 ──────────────────→ (parallel, independent)
C7 ──────────────────────→ (founder)
                     then: E1 · O-1 · W-3 → GW-5 → W-4 parity
                           J1 · J3 · P0-B → B1 sweeps
```

Nothing on the critical path requires new infrastructure, a new store, a new dependency, or a
migration.

### Estimated shape, not schedule

- Items 1-5 are one PR against `codex/web-intelligence-no-llm`.
- Items 6, 7, 11, 13, 17, 18, 19 are each a single field or a single function.
- Item 14 (W-3) is one loop body plus one role derivation plus eight invariants.
- Item 15 (GW-5) is one function plus one call in `_commitTreeMutation`.
- Item 16 (W-4 parity) is a new test file and **no production change**.

---

## 5 · SEQUENCING RULES

Four rules that the queue order encodes and that must not be violated:

1. **C5 before C1-C4.** Fixing privacy blockers against a suite with six green-by-construction
   assertions produces green with no evidence.
2. **E7 before E4.** Re-tiering to cheap models before the integrity benchmark is the one sequencing
   mistake available in Stage A.
3. **W-3 before W-4.** W-3 changes what `visibleScope` returns and every consumer inherits it;
   migrating consumers in the same change makes the blast radius unmeasurable.
4. **The comparison Web must never be bundled with W-3.** Stage D's sequencing law.

---

## 6 · PARALLELISM

If more than one Codex session is available:

| Lane | Items | Conflicts with |
|---|---|---|
| **A** | 1-5 (PR #74 corrections) | nothing else may touch `server.js:4134-4300` or `ai/proactive.js` |
| **B** | 6, 13, 17, 18, 19 (single fields) | lane A only if it touches Focus |
| **C** | 7, 11, 12 (gateway) | nothing |
| **D** | 14, 15, 16 (Web) | must be strictly serial within the lane |

Lanes A and D must not run simultaneously if lane D reaches W-4, because W-4's first migration
targets `/api/intelligence/briefing`, which lane A owns.
