# IntelliQ constitution — the organisational intelligence harness

**Status:** constitutional addendum to `docs/ttd/intelliq-ttd-v1.md`. Doctrine and repository
reconciliation. **Nothing implemented in this pass.**

**Companion audits:** `product-reconciliation-audit.md` (object model),
`leadership-intelligence.md` (privacy), `lab-and-deliberate-development.md` (Focus),
`product-compression-and-forum-intelligence.md` (Forum), `conversation-as-capability.md`.

**Extended by:** `web-semantics-and-continuous-intelligence.md` — the Web adjudication. It
supersedes this document's treatment of the Web wherever the two differ: it defines the
structural Web law (self, one level above, everything beneath), separates Web scope from
governance, kernel and projection, rules on the SELF/ORG perspective for each object, and
specifies the continuous Web intelligence worker and its no-LLM floor.

Status vocabulary is inherited from TTD v1: **ENFORCED · PARTIAL · SPECIFIED · OPEN · DISCOVER**,
plus **LEGACY** and **MISSING** for this document's reconciliation tables. No claim is marked
ENFORCED without a cited file.

---

# 1 · Product identity

> **IntelliQ is an organisational intelligence harness: a governed, deterministic substrate that
> holds an organisation's evidence, structure, authority, privacy and memory — over which
> replaceable intelligence engines reason.**

The durable advantage cannot be owning the best model. Models improve, commoditise and get
replaced. The harness must survive all three.

**The corollary that makes this testable:** removing every generative model must degrade IntelliQ's
articulacy, not its memory, governance, permissions, provenance or state.

## 1.1 · The honest position

This thesis is **already partly true and partly aspirational**, and the split is not where the
founder's framing assumes.

- **Already true:** the entire truth-layer suite runs with no API key by deliberate design
  (`scripts/test.js:10`), and `ai/gateway.js:56` carries a real switch —
  `IQ_DETERMINISTIC_ONLY=1` plus a runtime `setDeterministicOnly()`. The no-LLM test is not a
  doctrine to invent. It is an environment variable that exists.
- **Not yet true:** the deterministic substrate is V1 and in places crude. §9 names which parts.

**Do not confuse knowing where IntelliQ is going with having built it.**

---

# 2 · Product object model

Five objects. Four are product-visible; one is a scope primitive that should stay invisible.

## 2.1 · HIGH / LOW

**Purpose.** Surfacing, not storage. *"Something meaningful went well / did not go well,"*
delivered to whoever it is relevant to.

**Implementation — IMPLEMENTED.** `ai/behaviour.js:32` `BUCKET` maps polarity to
`worth_celebrating` / `needs_attention` over `proactive.toInsight` artifacts
(`ai/proactive.js:244`). Ranked within bucket, capped at three, with per-audience empty states and
a written calm line for silence (`ai/behaviour.js:44`).

**Durability — DERIVED, NOT STORED.** `_proactiveInsights` (`server.js:4155`) recomputes on every
read. Only `insightSuppression` (mute list) and `noticeFeedback` (counters) persist.

**Authority.** None. A High is a projection of a belief, never a claim of its own.

**Missing.** The founder's model widens Highs and Lows beyond the person — *"a Focus used by your
team is associated with improvement across 40% of the group."* That is **group-scoped surfacing**,
and it does not exist. Every insight today is subject-scoped to one person. This is the same gap
`leadership-intelligence.md` identified from the leader's side: **the loop runs at the individual
grain and was never rebuilt at the group grain.** It is one gap, seen from two directions.

**Migration.** Rename two bucket labels. Group-scoped surfacing is a real build, not a rename.

## 2.2 · INQUIRY

**Purpose.** The epistemic object. *"There is something worth understanding."*

**Implementation — IMPLEMENTED and the strongest object in the product.** `inquiryStates` keyed by
`subjectRef`, `ai/diagnose.js` (1,122 lines) for evidence, confidence bands, supersession and
contest; `ai/inquiry.js` for uncertainty typing, value/cost gating and routing.

Carries: signals, hypotheses, `confidence.because`, `stillUnknown`, `alternatives`, `timeline`,
contest state, corrections. Every one of those is rendered today (`js/member-view.js:2686`).

**Durability.** Persisted, org-partitioned, rides the P0-3 CAS.

**Authority.** This is where P0-D lives: organisational authority settles arrangements; evidence
settles empirical propositions (`ai/inquiry.js` `claimNature`).

**Missing.** No conversational affordance — the cards are read-only. No participants.

## 2.3 · FOCUS

**Purpose.** The action object. *"This is something we are deliberately working on."*

**Implementation — IMPLEMENTED, minimally.** `mem.focuses` (`server.js:1160`), created by
approving a prepared suggestion (`4557`), closed with `helped | no | mixed` (`4583`), feeding
`_recordNoticeFeedback` → the Confidence Engine.

**Durability — DURABLE.** `userAiProfiles` is in `_persistedStores` (`server.js:184`), so Focus
already rides the P0-3 CAS. This is better than the founder assumed.

**Missing:** self-creation route, origin, participants, scope/visibility, links to what was tried.

**The record today is `{ id, text, type, status, outcome, createdAt, resolvedAt }`.** One string
and a verdict. It runs the whole loop and remembers nothing about why.

## 2.4 · WEB — the finding that most corrects founder assumption

**Purpose.** *"What organisational reality is relevant and potentially visible to this person?"*

**Implementation — IMPLEMENTED, and it is already the production scoping mechanism.**

`ai/org-graph.js` — pure, cycle-safe, multi-parent, with a deliberate asymmetry stated in its own
header: *"A PARENT sees UP THE WHOLE SUBTREE beneath it… A CHILD sees ONLY what comes from its
DIRECT PARENT — not its siblings, not other branches, not its grandparents."*

**It is wired at ten production call sites in `server.js`** (corrected from "nine"), not aspirational:

| Site | Use |
|---|---|
| `server.js:9830` | filters the admissible evidence pool by `orgGraph.canSee` |
| `server.js:9842` | `visibleNodesFor` — outside the hierarchy yields org-wide evidence only |
| `server.js:9850`, `11182`, `11205`, `11670` | `scopeOfActor` |
| `server.js:11145` | `routeTarget` — where a question should go |
| `server.js:11202`, `11669` | `buildGraph` |

`ai/scoped-intelligence-packet.js` sits on top (`buildPacket`, called `server.js:10096`) and states
the sibling rule and the upward-question rule: *"A good question may travel upward as a safe
artifact, but the asker does not receive broader information just because they asked it."*

**Verdict: the Web is not a future primitive. It is the live scope engine for evidence visibility
and question routing.** The founder's framing under-credits it.

**What is genuinely missing:** Web governs *evidence retrieval* scope. It does **not** yet govern
*surfacing* — Highs and Lows are computed per person, so a member never receives team-relevant
intelligence through their Web. That is §2.1's gap again.

**The law that must not erode.** Web determines *relevance*; governance determines *permission*.
Web scope never overrides privacy, authorship, tenant isolation or safeguarding. Today this holds
structurally because `org-graph` *"NEVER reads evidence content; it only reasons over node
structure + membership."* Keep that property — it is what makes the two layers separable.

---

# 3 · Deterministic harness map

Actual layers, bottom to top:

```
PERSISTENCE      db.js — iq_store, durable units store:<name>:<org>, revision CAS      ENFORCED (P0-3)
IDENTITY         orgUsers, orgCode partitioning, emailIndex                            ENFORCED
STRUCTURE        orgNodes + ai/org-graph.js                                            ENFORCED
SCOPE (Web)      org-graph.canSee / visibleNodesFor / routeTarget                      ENFORCED
AUTHORISATION    _userHasPerm, getVisibleUserIds, requirePermission                    ENFORCED
PRIVACY          ai/privacy.js classify/gate/redact; visibility on evidence            ENFORCED
EVIDENCE         lib/evidence.js envelope; evidenceLog + cold tier                     ENFORCED (P0-1)
PROVENANCE       prov(), originRef/originKind, authority tiers                         ENFORCED
CONTRIBUTION     ai/contribution.js — relevance ≠ authorisation, origin counting       ENFORCED
KERNEL           ai/diagnose.js — confidence, supersession, admissibility, contest     ENFORCED
CLAIM NATURE     ai/inquiry.js claimNature + primitives.EMPIRICAL_CONCEPTS             ENFORCED (P0-D)
BELIEF           ai/reason.js — hypotheses, counter-evidence, readiness, register      ENFORCED
PROJECTION       ai/proactive.js — audience safety                                     ENFORCED (one path)
DELIVERY         ai/behaviour.js — grouping, volume, silence                           ENFORCED
ACTION           lib/action.js contract; orgInterventions; mem.focuses                 PARTIAL
MEMORY           ai/org-memory.js, org-learning.js, org-playbook.js                    ENFORCED
LANGUAGE         ai/gateway.js — the only model boundary                               ENFORCED
```

**The architectural fact worth naming:** the model sits at the *top*, as one replaceable layer,
and `ai/behaviour.js` imports nothing from the kernel by construction. That is the harness thesis
already expressed in the import graph.

---

# 4 · The no-LLM audit

`IQ_DETERMINISTIC_ONLY=1` makes `gateway.generate` throw (`ai/gateway.js:139`). What survives:

**FULLY DETERMINISTIC — works untouched**

Identity, tenant isolation, permissions, Web scope, privacy classification, evidence recording and
retrieval, provenance, corrections and supersession, contest, confidence bands, claim-nature
classification, belief formation, High/Low computation and ranking, silence, Focus lifecycle,
intervention outcomes, "what worked" ranking, organisational memory and learning, playbook
candidates, org-state derivation, uncertainty generation, question routing, readiness projection.

**`pilot-loop-smoke.js` proves this deliberately** — the complete value loop with no model, no key,
no network. Its header: *"remove the reasoning model and IntelliQ becomes less articulate, not less
intelligent."*

**PARTIAL — degrades, does not die**

- Understanding of free text: `ai/comprehend.js` is a deterministic lexicon producing the same
  bounded features the model produces. Its own header concedes it *"will not catch sarcasm,
  nuance, or a clever turn of phrase"* — honest.
- Answering: `retrieval.extractiveAnswer` produces cited answers from authorised passages only.
- Org-context extraction: `ai/org-context.js` `extract()` is regex-based and works with no model.

**DIES**

Conversational prose, hypothesis generation in language, assessment drafting, scenario drafting,
narrative enrichment of the leader briefing.

**Verdict: the thesis holds today more than it is claimed to.** What dies is expression. What
survives is the organisation.

**The gap worth recording:** there is no registered test that runs the suite with
`IQ_DETERMINISTIC_ONLY=1` and asserts a floor of surviving capability. The switch exists; the
executable law does not. See §7 PL-1.

---

# 5 · Legacy reconciliation

| Concept | Repository truth | Verdict |
|---|---|---|
| **Forum** | `forumThreads` + 4 routes; **zero client references** | **ABSORB** — retire the store, keep `ai/forum.js` as the policy module Focus/Inquiry reuse |
| **Assessments** | full lifecycle, canonicalised as evidence with assessor/rubric/scale; naked score deliberately retired (`server.js:5733`) | **KEEP — internal capability.** Measurement inside Focus/Inquiry. No storage migration |
| **Reflections / check-ins** | `memberCheckins` + `_recordCheckin` (`4748`), notes, assistant turns | **KEEP — internal capability.** Three ways of producing evidence |
| **Interventions** | `orgInterventions`, `/act`, `/outcome`, `outcome-intelligence.summarize` | **KEEP — internal capability.** An attempt inside a Focus |
| **Scenarios** | AI-drafted practice, scored, canonicalised — **keyed by member *name*** (`server.js:14618`) | **KEEP — internal capability.** Name-keying is post-pilot debt |
| **Leader roster / briefing** | live, fetched by `js/app.js`, named people + behavioural labels + evidence basis, **bypassing `audienceSafe`** | **MIGRATE BEFORE PILOT** |
| `orgGroups` / `orgMessages` | parallel to `orgNodes`; kernel never reads | **RETIRE** |
| `orgGoals` / `memberGoals` | CRUD nothing reads | **RETIRE** |
| Legacy nav destinations | `dashboard`, `members`, `analytics`, `alerts`, `leader-groups` | **RETIRE** |

## 5.1 · Forum's laws that must survive verbatim

Not paraphrased into a new module — carried across:

1. **Inertness by construction.** `ai/forum.js` contains no evidence vocabulary, so ten people
   agreeing changes nothing. Whatever holds conversation inside a Focus must have the same
   property, or the guarantee is lost when the module is replaced.
2. **Authorship.** *"only the author may offer their own statement as evidence"* (`ai/forum.js:127`)
   — with leadership explicitly granting no exception. In a coach-created Focus this is more
   load-bearing, not less.
3. **Origin counting.** `ai/contribution.js:203` counts **origins, not contributors**. This is
   already object-agnostic and survives Forum entirely.

---

# 6 · Infrastructure gap register

Recorded, not implemented. Status per TTD vocabulary.

| # | Gap | Status | Note |
|---|---|---|---|
| G1 | **Participant model** | **MISSING** | No product object has one. `participants` on events is a *count* (`ai/org-state.js:325` divides by 25). All five Focus collaboration scenarios reduce to this |
| G2 | **Origin foreign key** | **MISSING** | Focus does not record which High/Low/Inquiry produced it. Four audits have now independently found the same primitive: *things do work and forget why they started* |
| G3 | **Group-scoped surfacing** | **MISSING** | Highs/Lows are per-person. Blocks both member Web-relevant intelligence and leader organisational intelligence — one gap, two symptoms |
| G4 | **Leader privacy projection** | **PARTIAL** | Two leader paths, opposite postures; only `/api/proactive/insights/leader/:subjectId` is governed |
| G5 | **Replay / reconstruction** | **PARTIAL** | Evidence is append-only with supersession; org-memory fingerprints moments. No point-in-time reconstruction of a belief |
| G6 | **Executable no-LLM floor** | **MISSING** | The switch exists; no test asserts what must survive |
| G7 | **Reassessment comparison** | **MISSING** | Assessments are rubric-versioned and timestamped; nothing compares N to 1 |
| G8 | **Cohort minimum on leadership signals** | **MISSING** | `MIN_COHORT = 2` exists once (`server.js:16932`) and protects a member view, not a leader one |
| G9 | **Policy as data** | **OPEN** | Permissions are code constants (`server.js:1556`). Adequate for pilot; a Cedar/OPA-shaped externalisation is a real future question |
| G10 | **P0-6 inquiry recovery** | **OPEN** | Pre-scale, not pilot |
| G11 | **Scenario identity** | **LEGACY** | Keyed by member name |
| G12 | **External knowledge class** | **MISSING** | No evidence class for "the world said this" |

---

# 7 · Product laws

## 7.1 · Founder-ratified existing law — restated, not created

| | Law | Status |
|---|---|---|
| L1 | Private information may inform reasoning; it may never be revealed | ENFORCED |
| L2 | Membership is not consent — contribution is deliberate, never automatic | ENFORCED |
| L3 | Only the author may offer their own statement as evidence | ENFORCED |
| L4 | Repetition is not corroboration — count origins, not contributors | ENFORCED |
| L5 | Organisational authority settles arrangements; evidence settles empirical propositions | ENFORCED (P0-D) |
| L6 | Confidence is a band with a stated basis, never a score | ENFORCED |
| L7 | Correction supersedes without erasing; exclusion is reported | ENFORCED |
| L8 | Silence is a valid, confident outcome | ENFORCED |
| L9 | Every consequential proposal is confirmation-gated | ENFORCED |
| L10 | Causation is never claimed; history is stated as history | ENFORCED |
| L11 | An acknowledged mutation is durable, or the failure is loud | ENFORCED (P0-2/P0-3) |

## 7.2 · Proposed law — REQUIRES ADJUDICATION

Not constitutionalised by this document. Each needs founder ratification.

**PL-1 · Model independence.** *IntelliQ must retain identity, Web, permissions, privacy, evidence,
provenance, history, inquiries, Focuses, actions, outcomes and organisational memory with every
generative model disabled.* Testable today via `IQ_DETERMINISTIC_ONLY=1`; needs a registered floor
test (G6). **Recommend ratifying** — it is nearly true already and cheap to pin.

**PL-2 · Web is relevance, not permission.** *Web scope determines what may be relevant; governance
determines what is permissible. Web never widens privacy, authorship, tenant isolation or
safeguarding.* Holds structurally today. **Recommend ratifying.**

**PL-3 · No standing per-person behavioural surface.** *No leader-visible object may present an
identifiable person's inferred behavioural state as standing information.* Currently **violated**
(`/api/intelligence/roster`). **Requires the D1 decision in §9.**

**PL-4 · Surfacing carries no authority.** *A High or Low is a projection of a belief and never a
claim of its own; it cannot be cited as evidence.* True today by construction. **Recommend
ratifying** — it is what keeps High/Low from becoming a fourth truth store.

**PL-5 · Every deliberate object records its origin.** *A Focus, and an Inquiry, must record what
produced it.* Not true today (G2). **Recommend ratifying** — it is the primitive four audits found.

**PL-6 · External architecture is evidence, not authority.** *An external system's design becomes
IntelliQ architecture only through: external principle → repository comparison → identified gap →
harness test → adjudication → executable law → implementation → independent review.* **Recommend
ratifying** — it is the process this session has actually used.

---

# 8 · Pilot versus later

**What Falcon actually needs**

1. P0-1/2/3/D — established; P0-D approved at `932a0c3`
2. Leader privacy migration (G4) — a named list of pupils labelled *Gone quiet* is a pilot-safety
   issue, not a tidiness one
3. `POST /api/me/focus` — without it Focus is a suggestion sink, not a product object
4. Focus origin (G2)
5. Home able to say nothing — connect `ai/inquiry.js` plans to `/api/me/context.ask`, which today
   always fires

**Premature for Falcon**

Participants and shared/group/org Focus (G1) · group-scoped surfacing (G3) · replay (G5) ·
policy-as-data (G9) · external knowledge (G12) · reassessment comparison (G7) · P0-6 (G10) ·
Forum store retirement · scenario re-keying (G11).

**The discipline:** Falcon teaches which of these matter. Building them first is guessing with
extra steps.

---

# 9 · Founder decisions required

**D1 · Does a leader keep any standing per-person view?** *(gates PL-3 and the pilot)*
- **(a)** No standing view; leaders see people through an invited Focus or the governed
  per-subject route when they already have a concern. **Recommended.**
- (b) Roster of names with no labels — who I lead, last active only.
- (c) Keep labels behind a stricter permission.
*Consequence:* (a) removes the most concretely useful thing a leader has today and is the product
thesis. (c) keeps the surveillance surface and makes the compression untrue.

**D2 · Coach-created Focus — create, or propose?**
- **(a)** Propose only; the person accepts, exactly as `mem.focuses` works today. **Recommended.**
- (b) Direct creation for operational team work; person-topic Focuses require acceptance.
*Consequence:* (b) makes Focus a task-assignment system, which is what Lab was told not to become.

**D3 · Ratify PL-1, PL-2, PL-4, PL-5, PL-6?**
Recommend yes to all five. Each restates something the architecture already does; ratifying makes
them arbitrable rather than cultural.

**D4 · Does `opportunities` survive?**
The third bucket is self-audience-only and never shown to a leader (`ai/behaviour.js:78`). The
four-object model has no home for it.
- **(a)** Fold into Highs, re-enforcing leader-invisibility at the new boundary. **Recommended.**
- (b) Retire it.

---

# 10 · Next implementation sequence

Smallest ordered set that moves the architecture toward the harness. **Not implemented here.**

1. **Leader privacy migration.** Strip `topLabel`/`status` from `/api/intelligence/roster`; route
   `/api/intelligence/briefing` through `audienceSafe`. Test first — it fails today.
2. **`POST /api/me/focus`.** Create a Focus in your own words.
3. **Focus origin.** `originRef` + `originKind`. `dedupeKey` is already stable.
4. **The no-LLM floor test.** Run the suite with `IQ_DETERMINISTIC_ONLY=1` and assert the surviving
   capability floor. Cheapest way to make PL-1 real, and it protects every future change.
5. **Home can say nothing.** Connect inquiry plans to `ask`.

1–3 are the pilot. 4 is the constitution becoming executable. 5 is the product finally matching
`behaviour.js`'s existing belief that silence is success.

---

# 11 · Critical notes

**Where we were wrong about ourselves.** The Web is not aspirational — it is the live scope engine,
wired at nine call sites. Focus is not ephemeral — it is durable and already rides the P0-3 CAS.
The no-LLM test is not a doctrine to invent — it is `IQ_DETERMINISTIC_ONLY`.

**Where we are cruder than the language suggests.** Relevance is node-membership plus recency
weights, not a model of relevance. Confidence is a count of independent origins mapped to three
words. `ai/comprehend.js` is a stemmed lexicon. Structural pattern detection is five hand-written
rules over baseline deviation. **These are V1 hypotheses and should be replaceable without
corrupting accumulated truth — which is the entire reason the substrate is separated from them.**

**Where "revolutionary" is ordinary infrastructure.** Durable-unit CAS is optimistic concurrency.
The evidence envelope is a normalised event record. Org-graph is a DAG with reachability. That is
not a criticism — ordinary infrastructure done correctly is what the harness *is*. The unusual part
is not the mechanisms; it is that the epistemic laws are enforced by import graphs and executable
tests rather than by convention.

**The one thing genuinely distinctive**, and it should be defended above any feature: *repetition
is not corroboration.* `ai/contribution.js:203` counts origins rather than voices, so a confident
room cannot manufacture organisational certainty. Every other property here can be found somewhere
else in the industry. That one is the moat.

---

# 12 · The infrastructure question

*Added in the final pre-implementation pass. This is the answer the founder asked to become part of
the constitution.*

**If GPT, Claude and every generative provider vanished tomorrow, what would IntelliQ still do?**

Answered against production code, not aspiration. Each row was verified in
`docs/ttd/web-semantics-and-continuous-intelligence.md` §21.

## 12.1 · What survives intact

The organisation keeps its harness. Specifically, and with no degradation:

- **Evidence and its lifecycle** — capture, status, supersession, deletion, the `active`-only gate
  into kernel reasoning.
- **Provenance** — `originRef` and `originKind` on every signal, preserved across contribution.
- **Independent-origin counting** — `ai/contribution.js:203`. Repetition still fails to become
  corroboration.
- **Correction and contest state** — a challenged belief still becomes `contested` rather than being
  resolved by rank.
- **Authority versus empirical truth** — P0-D's five-tier precedence.
- **Scope and permissions** — the Web, `getVisibleUserIds`, node stamping, tenant isolation.
- **Privacy projection** — `audienceSafe`, the language guard, the disclosure floors.
- **Organisational state** — objectives, requirements, rhythms, responsibilities, readiness.
- **Contradiction and gap detection** — `missing_required`, `stale`, `contradiction`,
  `unresolved_owner`, all deterministic.
- **Pattern detection** — the seven trajectory detectors and the five structural patterns.
- **High / Low derivation** — polarity → bucket → plan, with silence as a first-class outcome.
- **Group Inquiry** — creation, corroboration gating, frontier bounding, all model-free.
- **Focus persistence and outcome learning.**
- **Intervention → outcome → efficacy ranking.**
- **Organisational memory** — timeline, fingerprints, changed-since.
- **Actor-specific projection** — the shared fold plus per-actor filtering.
- **Durability** — durable-unit CAS, shutdown flush, reconstruction.

That list is the product. It is why the claim "IntelliQ is a harness" is defensible rather than
marketing.

## 12.2 · What becomes substantially worse

- **Free-text becomes lower-yield.** Structured signals still land; prose loses its best reader.
- **Language flattens.** `reason.speak` gives a correct deterministic rundown; the warm rephrase is
  gone. The system sounds like a report rather than a colleague.
- **Semantic retrieval degrades to keyword.** `ai/embeddings.js` is an OpenAI path; without it,
  cross-member similarity falls back to rules.
- **Question phrasing gets blunter.** `planInquiries` still selects and gates the right questions;
  the wording is templated.
- **Document and image understanding stops.** `understand()` is the only reader of PDFs and photos.

## 12.3 · What stops entirely

Three things, named precisely because overstating this is how the harness claim gets discredited:

1. **Personal Inquiry creation and maintenance from free text.** `_intakeTurn` (`server.js:9175`)
   returns early when `!ai.enabled()`, and nothing else writes `inquiryStates` for a `member:*`
   subject. Group Inquiry is unaffected — it is fully deterministic.
2. **Document / vision understanding.** No fallback exists.
3. **Audio transcription.** No fallback exists.

> **The honest one-line summary:** *without models, IntelliQ stops being able to read prose, and
> keeps everything it knows.* Ingestion narrows; the harness is whole.

## 12.4 · The standing law

> **L-H1 (proposed).** No organisational truth, memory, scope, provenance, correction history,
> graph, or action/outcome record may live only inside a model, a prompt, a context window, or a
> provider's store. A model may read the harness and write proposals into it. It may never *be* the
> place something is kept.
>
> The test of any new capability is: *if the provider vanished mid-sentence, what would the
> organisation have lost?* If the answer includes anything in §12.1, the design is wrong.

Better models make IntelliQ better by reasoning **over** the kernel. They must never become the
kernel.

---

# 13 · Consolidated gap register

Supersedes the separate G1-G12 (§6) and GW-1-GW-10
(`web-semantics-and-continuous-intelligence.md` §14). **Those two registers are now closed**; this
is the single list. Ids are preserved so older references resolve — no gap has been renamed, three
have been merged, and merges are stated.

Priority: **P** pilot blocker · **PRE** pre-pilot · **POST** post-pilot · **S** scale · **R** research.

| Id | Gap | Current repository truth | Target | Depends on | Testable completion | Pri |
|---|---|---|---|---|---|---|
| GW-7 | Leader privacy projection bypasses `audienceSafe` | roster/briefing at `server.js:4250`/`4150`; `audienceSafe` has one call site (`:4452`) | both routed through the projection | — | T-W13 green | **P** |
| GW-11 | Privacy floor applied to `items`, bypassed by `rollup` | measured: `items:[]` + `patternCounts:{momentum_drop:1}` on a 2-person scope | floors gate the whole payload (§23) | — | below-floor payload publishes no count | **P** |
| GW-12 | Web aggregation counts people, not origins | `_webIntelligence` never sees `originRef`; confidence hardcoded | §22 contract | — | one origin × ten people ⇒ nothing | **P** |
| GW-6 | No executable no-LLM floor (was G6) | `pilot-loop-smoke §10` is `&& false`; 3 of 8 PR #74 assertions are fixture readback | §21 matrix, per capability | — | mutation-tested suite | **P** |
| GW-13 | Model exits outside the switch | `understand()`/`transcribe()` reach providers under `IQ_DETERMINISTIC_ONLY`; `canTranscribe()` ignores it; embeddings outside entirely | all gated or explicitly documented | — | probe shows refusal, not 401/403 | **P** |
| GW-2 | Leader Web omits one level above | `visibleScope:68` | L-W1 | D-W6, D-W7 | T-W3.1-3.8 | **PRE** |
| GW-14 | W-3 breaks `top_leader` derivation | measured: two-tier org promotes every leader | structural role | GW-2 | T-W3.7 | **PRE** |
| GW-1 | Three scope mechanisms disagree | 11 Web · 20 GATE · 19 ENUMERATE · 10 FILTER · 5 BRIDGE | one authority, four honest kinds | GW-2, D-W5 | `scope-parity-smoke` complete | **PRE** |
| GW-5 | Graph change invalidates nothing | `rosterCache`/`intelBriefingCache` TTL-only at 2 h | L-W13 | GW-2 | T-GI.5 | **PRE** |
| G1 | Participant model absent | no object has one | `participantIds` on Focus/Inquiry | — | T-B.1 | **PRE** |
| G2 | Origin foreign key absent | Focus forgets what started it | `origin.from` | G1 | Focus records its Inquiry/High/Low | **PRE** |
| G4 | Leader privacy projection partial | *merged into GW-7* | — | — | — | — |
| G8 | Cohort minimum on leader signals | *merged into GW-11* | — | — | — | — |
| G3 | Group-scoped surfacing absent | Highs/Lows are per-person; no member org intelligence | §21 row "member org intelligence" | GW-1 | a member receives a governed Web High | **POST** |
| GW-8 | No aggregate-safe projection | `SCORE_RE` rejects any leader percentage | §23 shape gating | GW-11 | a rate renders at n≥4 | **POST** |
| GW-9 | Focus lacks origin/scope/participants | `mem.focuses` is text+status | §26 field set | G1, G2 | fields present, D-W3 enforceable | **POST** |
| GW-3 | Multi-parent routing disagreement | `routeTarget` picks first; `_nearestLeaders` reports conflict | one answer | — | conflict surfaced, not guessed | **POST** |
| G5 | No point-in-time reconstruction | supersession preserves history; no `asOf` | `asOf` retrieval | — | belief-as-at-T1 | **POST** |
| G7 | No reassessment comparison | versioned, never compared | compare N to 1 | — | — | **POST** |
| G12 | No external-knowledge evidence class | absent | a class for "the world said this" | — | — | **POST** |
| GW-4 | Nodes have no lifetime | project groups never expire | node validity window | GW-5 | expired node leaves every Web | **S** |
| GW-10 | Web filter returns a bare boolean | `canSee` gives no reason | `partition()`-shaped return | GW-1 | filtered read states what it withheld | **S** |
| G11 | Scenario identity by name | legacy | re-key by id | — | — | **S** |
| G10 | P0-6 inquiry recovery | open | — | — | — | **S** |
| G9 | Policy as data | permissions are constants (`server.js:1556`) | externalised policy | — | — | **R** |

**Five pilot blockers, all in PR #74's correction set.** Nothing else blocks Falcon.

---

# 14 · Document hierarchy and hygiene

## 14.1 · The order of authority

```
FOUNDING PRODUCT INTENT   founder statements in session; not a file
  └─ CONSTITUTION         this document — identity, object model, gap register, §12 law
      └─ TTD v1           intelliq-ttd-v1.md — enforcement status of every law
          └─ ADJUDICATIONS    web-semantics-…, product-reconciliation-audit,
          │                   leadership-intelligence, organisational-harness-*
          └─ IMPLEMENTATION BRIEFS   docs/briefs/* — mechanical, cite line numbers
              └─ EXECUTABLE INVARIANTS   scripts/*-smoke.js registered in scripts/test.js
                  └─ PRODUCTION      server.js, ai/*, js/app.js
```

**Rule:** a lower layer may narrow an upper one, never widen it. Where a document and the code
disagree, **the code is the finding and the document is the defect** — but the document is corrected
in place with the correction marked, never silently edited.

## 14.2 · Contradictions found in this pass

| Where | Contradiction | Resolution |
|---|---|---|
| `web-semantics…` §1, §14, D-W1 | Claimed `org-graph-smoke.js:33` must be amended for W-3 | **Wrong — measured 18/18 pass.** Corrected in §20; real change is `scoped-intelligence-packet-smoke.js:47` |
| `web-semantics…` §12 | Implied "no-LLM" covers Inquiry generally | Only **group** Inquiry is deterministic; personal intake is model-required. §21 |
| `constitution` §6 G4/G8 | Duplicated GW-7 and GW-11 under other names | Merged; §13 is the single register |
| `organisational-harness-addendum` §1 | "Authorisation ENFORCED — leader sees node **plus all descendants**" | Still true, but now the **old** law. W-3 adds one level up |
| `organisational-harness-addendum` §7 | "Epistemic scope distinct from authorisation — PARTIAL" | Now named: Web ≠ governance ≠ kernel ≠ projection, `web-semantics…` §3 |
| Across the TTD | "Forum" as a live destination | Forum is being absorbed. Its **laws** survive (§5.1); its UI feeder is not worth fixing — §27 |
| `constitution` §2.4 | "Web is wired at nine call sites" | **Eleven** in `server.js`; full audit in the W-3/W-4 brief §3.3 |

## 14.3 · Consolidation recommended

The TTD is ~9,400 lines across fourteen files. Two are now largely historical and should be marked
rather than deleted:

- `round-3-cross-examination.md` — answered by TTD v1; **mark SUPERSEDED**.
- `pilot-readiness-review.md` — its blocker list is now the §13 register; **mark SUPERSEDED BY §13**.

`product-compression-and-forum-intelligence.md` (978 lines) and `lab-and-deliberate-development.md`
(848 lines) are explorations, not law. They should carry a header line saying so, because they
contain product framing — reflections, assessments, Forum-as-destination — that later documents
retired.

**Do not create further parallel documents.** The next architecture output should extend this
constitution or the Web semantics adjudication.
