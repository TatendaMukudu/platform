# Pre-pilot architecture audit — horizontal Web, shared objects, provenance, freeze

**Status:** adjudication. **Stages 1–6 complete. No production code changed by this pass.**
**Written against:** `6261f76`, branch `claude/platform-work-summary-nmb0cm`.
**Method:** every claim below cites a file and line read in production code. Where the commissioning
brief and the repository disagree, the code is the finding and the brief is the defect.

---

## 1 · EXECUTIVE VERDICT

# NOT READY TO FREEZE — three P0 gaps, all smaller than the brief assumes

> **UPDATE, `ae16a27`.** All three P0s below are now **CLOSED**, RED-first, with 40 assertions
> and no new stores. The founder adjudicated D-A1/D-A2/D-A3; §21 records what was built. **The
> freeze verdict now turns solely on the adversarial dummy pilot (§23), which has not yet run.**

The brief's central hypothesis is **half right**. The vertical Web is mature. The horizontal
dimension is not missing an *engine* — the truth-maintenance machinery is already subject-agnostic
and already carries lateral evidence correctly. What is missing is narrower and more specific:

1. **There is no way to say "midfielder" or "captain" without saying "hierarchy".** No substrate
   exists for a non-hierarchical, many-member classification. The only available shape — an
   `orgNode` — feeds `visibleScope → canSee → _orgAdmissibleEvidence`. Modelling a role cohort as a
   node grants evidence access by construction. This is the brief's own §5 hard requirement, and it
   is genuinely unmet.
2. **Forum is fully attributed to humans.** `visibleThread` returns `authorId` on every visible
   message, and `forum-smoke` assertion 7 *pins* that behaviour. The founder's stated pilot
   direction is the opposite. This is a privacy-law inversion, not a patch.
3. **Relationship claims are a shape with no producer and no erasure path.** Lane F established the
   subject kind; nothing in production mints one; erasure sweeps `member:<id>` and nothing else.

Everything else the brief proposes either **already exists** (§12, §13, §14, §17 and most of §9) or
should be **rejected or deferred**. The brief substantially over-estimates what is missing and
mis-identifies where the truth↔expression contract lives.

---

## 2 · REPOSITORY TRUTH — WHAT ALREADY EXISTS

| Brief section | Classification | Evidence |
|---|---|---|
| §12 observations belong in evidence, not on objects | **EXISTS** | `ai/contribution.js:150` — *"A REFERENCE to the member's evidence, never a copy of it."* The kernel stores refs throughout |
| §13 private response → shared claim without exposing the respondent | **EXISTS** | `toGroupProposal` (`contribution.js:242`) sets `sourceSpan: null`, `verbatim: false`, and comments *"the group inquiry never holds a verbatim span — which is what makes 'no private text can reach a group read' a property of the structure rather than a rule someone has to remember"* |
| §14 Forum attached to shared objects, not a message board | **EXISTS** | `forum.newThread({ inquiryId, nodeId, subjectRef })` and `forum.js:35` — *"There are deliberately no free-floating team threads."* The brief's feared design is already forbidden in code |
| §17 Forum contributions are evidence input, not truth | **EXISTS** | `shouldOpenGroupInquiry` (`contribution.js:194`) counts `MIN_INDEPENDENT_ORIGINS`, and returns an explicit `ECHO` verdict: *"N people, but no independent origins — repetition, not corroboration."* `forum.originForMessage` marks a declared echo `originKind: 'reported'` |
| §9 High/Low derived, not stored | **EXISTS** | `ai/team-state.js:4` — *"One node, read as a subject in its own right"*; `:19` — *"a department is a node with parents. Nothing below knows or cares which."* High/Low are projections gated by `isFitToBeHighOrLow`, not stores |
| §19 model reads, kernel writes | **EXISTS** | `diagnose.MODEL_MAY_PROPOSE` refuses `conclusion`; `contribution.classifyScope` declines model-claimed group relevance without collective language *in the person's own words* |
| §7 relationship as an Inquiry subject | **EXISTS (shape only)** | `ai/subject-ref.js` `KINDS` includes `relationship-claim`; `_inquiryFor` tags it. **No producer** |
| §5 role ≠ hierarchy | **MISSING** | see §7 below |
| §15 Forum anonymity | **MISSING** | see §11 below |
| §20 universal packet | **REJECT as stated** | see §3 |

---

## 3 · WHAT THIS BRIEF MISUNDERSTOOD

**M-1 · `scoped-intelligence-packet.js` is not, and should not become, the truth↔expression
contract.** The brief's §20 asks whether it can become "the universal contract between deterministic
truth and model expression". Read it: it takes an **already-normalised display feed** and filters,
sections and ranks it (`buildPacket` → `canUseItem` → `sectionItems` → `priority.stamp`). It has no
claims, no evidence references, no contradictions, no falsifiers and no derived confidence.
`confidence: 'none'` at line 137 is a **display string on a feed item**, not an epistemic state.
Expanding it toward claims would build a second intelligence layer beside the kernel — which §30
forbids. **The contract already exists elsewhere:** `ai/diagnose.js` owns the epistemic state and
`ai/voice.js explainObject` already emits the governed shape (`claim · provenance · whyIThinkThat ·
stillUnknown · wouldChangeMyMind · contested · setAside`). That is the packet. It needs completing at
the *composer boundary*, not replacing.

**M-2 · `peer-web-semantics.md` is not prior art for the horizontal Web.** It exists (260 lines) and
the brief's §1 lists it, but it adjudicates the **comparison Web** — sibling organisational nodes,
Soccer ↔ Rugby — which the brief's own §4 explicitly excludes. Its §9 already defers peer
intelligence from the pilot entirely. The brief is right to separate the two; it should not expect
that document to answer lateral questions. **Nothing is implemented from it, and nothing should be.**

**M-3 · The horizontal dimension does not need new reasoning machinery.** The brief's §3 implies
lateral understanding is a missing capability. It is not. The kernel is subject-agnostic by
construction (`contribution.js:7` — *"member:<userId> and group:<nodeId> run through the same
inquiry machinery, the same hypotheses, the same confidence, the same corrections"*). What is
missing is not a lateral engine but **lateral subjects that can be named** (§5) and **a producer
that proposes them** (§8).

**M-4 · Forum echo defects are not a live risk to reintroduce.** §17 asks to "explicitly revisit the
known Forum-origin / echo class of defects". They are closed and asserted. `ECHO` is a named verdict
with a reason string, not an implicit threshold.

---

## 4 · THE SMALLEST UNIVERSAL WEB MODEL

The repository is already close to the brief's target abstraction, with one substitution:

```
NODES (orgNodes)              — hierarchy, authority, evidence admissibility
SUBJECTS (subject-ref.js)     — member: | group: | organisation: | relationship-claim:
EVIDENCE (evidenceLog)        — provenance, origin, authority, supersession
INQUIRIES (diagnose.js)       — hypotheses, confidence, falsifiers, unknowns, contested state
PROJECTIONS (team-state.js)   — High / Low / question, derived per reader
GOVERNANCE (audience, floors) — admissible ≠ visible
```

**No Entity superclass is justified.** The brief's §2 says to create one only if repository evidence
proves it improves things. It does not: `subject-ref.js` already *is* the common identity contract,
it is typed, and it fails closed on unknown kinds. A superclass would add a layer without removing
one.

**The missing primitive is a fifth subject dimension that is not a node:** a *classification*
(role/cohort) that can be a scope for reasoning without being a position in the hierarchy.

---

## 5 · CURRENT VERTICAL WEB CAPABILITY — mature

`org-graph.js` gives `parentsOf`/`childrenOf`, `descendants`, `ancestors`, `visibleScope`,
`routeTarget`, and `canSee`. `actorScope` derives `top_leader | leader | member` from *leading a root
node*, deliberately not from incidental coverage (`scoped-intelligence-packet.js:44` — *"W-3 can make
a branch leader see every node in a shallow graph. Authority therefore comes from leading a root
node, never from incidental coverage"*). Branch isolation is asserted in three modules. **This is the
strongest part of the system and needs nothing for pilot.**

---

## 6 · CURRENT HORIZONTAL WEB CAPABILITY — the machinery is there, the subjects are not

Lateral evidence already enters the same TMS: a member contributes their own account to a
`group:<nodeId>` inquiry through `contribution.js`, origin intact, verbatim stripped. Disagreement is
already distinguished from ignorance — `team-state.statementFor` has a dedicated branch for
*"People here are describing X differently. That disagreement is the useful part."*

What cannot be expressed today:

- a subject that is **two people** (relationship) with a producer
- a subject that is **a cohort** (midfielders, captains) at all
- a subject that is **two cohorts** (midfield ↔ forwards)

The first has a shape and no producer. The second and third have no shape.

---

## 7 · ROLE / CHARACTERISTIC / BEHAVIOUR MODEL — **P0 GAP**

**Role is currently expressible in exactly two ways, and both are wrong for this purpose.**

| Substrate | What it is | Why it cannot carry "midfielder" |
|---|---|---|
| `orgNodes` | a hierarchy position | membership feeds `visibleScope → canSee → _orgAdmissibleEvidence`. A "Captains" node grants its members' evidence to whoever leads it. Worse, `scopeOfActor` promotes anyone in `leaderIds` to `role: 'leader'` — a captain would gain leader powers |
| `roleBindings` | a **singleton** responsibility binding | `server.js:10796` — `list.find(b => b.status === 'active' && b.roleRef === role)`, and binding supersedes the prior holder. One role → one person. It answers *"who is Head of Performance"*, never *"who are the midfielders"* |

So the brief's §5 hard requirement — *"role/classification membership must not silently widen
vertical authority or Web visibility"* — is **unmet, and the naive implementation violates it
immediately.** This is a genuine P0 and the largest finding in this audit.

**On characteristics and behaviours (§6): REJECT as durable records.** The brief asks whether they
should be stored. They should not. A behaviour is a claim with provenance, confidence, contradiction
and falsifiers — which is an Inquiry. Adding a characteristic store would create exactly the
permanent psychological labelling §6 forbids, and would duplicate machinery that already handles
revision. **Represent them as projections over evidence-backed beliefs, as §6 itself suggests.**
No new store.

---

## 8 · RELATIONSHIP INQUIRY MODEL — shape without producer, and an erasure hole

`subject-ref.js` parses `relationship-claim:<id>` and fails closed on unknown kinds
(`subject-ref-smoke`, mutation-verified). `_inquiryFor` tags `relationshipClaim: { claimId }`. All
ordinary Inquiry laws then apply for free — confidence is computed, not asserted
(`relationship-inquiry-owner-smoke` F53.3).

Three things are missing:

- **No producer.** Both callers of `_inquiryFor` pass internally-derived refs (`member:${userId}` at
  `server.js:9598`, `subject.subjectRef` at `:13164`). `F53.7` asserts nothing in production mints
  one, precisely so that wiring the first producer is a deliberate act.
- **No erasure path.** `server.js:2089` deletes `inquiryStates[code]['member:'+userId]` and nothing
  else. A relationship claim naming an erased person would outlive them. **The claim-id format is a
  founder decision (§24 below) — it cannot be guessed here.**
- **No endpoint-privacy rule.** §7's requirement that private evidence from one endpoint must not
  become visible to the other is currently vacuous: with no producer, there is nothing to leak. It
  becomes load-bearing the moment a producer exists, and must be written *before* one is.

---

## 9 · HIGH / LOW SCOPE MODEL — already correct, needs no work

High and Low are **derived per reader** from a group inquiry that passes `isFitToBeHighOrLow`, with
the two-sided cohort floor applied (`MIN_COHORT`, `team-state.js:140`) and the L-D27 banded
projection for leader subjects. The brief's §9 fear — that High/Low would multiply into `selfHigh`,
`teamHigh`, `relationshipHigh` — is already structurally prevented: perspective is derived, not
stored. **Once a subject kind exists, High/Low project over it without change.** This is the clearest
case in the audit of "already solved; leave it alone".

---

## 10 · FOCUS MODEL — complete for pilot

D51/D52 (Lane F) made a Goal a Focus and put Focus on the Action loop
(`propose → approve → execute → observe → evaluate`), with `_beginFocusAction` /
`_completeFocusAction` closing back into evidence. `origin: { by, from }` semantics survive. Both
shapes the brief names (awareness / action) are expressible. **No completion percentages exist and
none should be added.** Nothing required here for pilot.

---

## 11 · SHARED OBJECTS AND ANONYMOUS FORUM — **P0 GAP**

Forum's architecture is right and its anonymity is absent.

**Right:** every thread is anchored to a real group inquiry; `forum.js` contains no reference to
evidence, confidence, origins or hypotheses, so *"ten people agreeing here changes nothing anywhere,
because there is nothing in this module that could change it"*. Contribution requires authorship
(`mayContributeMessage` refuses a leader offering a member's words). This is a genuinely good design.

**Absent:** `forum.visibleThread` (`forum.js:82`) returns `authorId: m.authorId` for every visible
message, and `GET /api/group/:nodeId/forum/:inquiryId` returns it unmodified. **Forum is fully
attributed to humans today**, and `scripts/forum-smoke.js:96` *asserts* that
(`view.body.messages[0].authorId === 'pA'`).

The substrate for the fix already exists: `contribution.toGroupProposal` already carries
`contributorVisibility: 'named' | 'anonymous'`. The kernel is already designed to know what humans
do not.

**This is a stop-and-present item, not a patch** — per the brief's own Stage 6. It inverts a ratified
assertion, changes what a person sees, and §16's question (does hiding a name protect anyone in a
five-person node?) is *unanswered*. See §24.

---

## 12 · PRIVATE RESPONSE → SHARED EVIDENCE — already correct

The contract the brief describes in §13 is implemented, and implemented structurally rather than by
convention. A contribution crosses as **concept + reference**, never text. A leader reading a group
inquiry sees the claim and its provenance counts; there is no path by which they receive the
sentence. The two-sided floor and origin counting then govern what may be said about it.
**Nothing required.**

---

## 13 · DETERMINISTIC INTELLIGENCE OWNERSHIP — correct where it is wired

The kernel owns identity, admissibility, provenance, independent origins, support, contradiction,
supersession, correction, confidence, hypotheses, falsifiers, unknowns and next-need. The model
proposes and phrases. `diagnose.MODEL_MAY_PROPOSE` admits observation/interpretation/hypothesis and
**refuses `conclusion`** — the single most important line in the system.

The failure is not ownership. It is **transmission**: see §14–17.

---

## 14 · THE EXACT PATH — where provenance dies

```
evidence → _reasonScopedAgenda → beliefs[{text}] → composer.buildContext → model → verifyGrounding → reply
                                        ▲
                                   beliefId dropped here
```

`server.js:9166` — `beliefs = agenda.filter(a => a.readiness === 'ripe').slice(0, 8).map(a => ...
{ text: a.claim })`. The claim survives; **`a.beliefId` and `a.confidence` do not.**
`buildContext` then renders `- ${b.text}` as a bare line. From the model's side, an authorised belief
and a sentence are indistinguishable.

`verifyGrounding` checks three invention classes — roster names, quoted titles, and `"you have N"`
counts. It is a **fabrication check, not a citation check.** It cannot answer "which reference
justifies this sentence" because no reference reached the model.

---

## 15 · CLAIM BASIS — partial

Traceable up to the composer boundary, lost at it. The evidence path (`_retrieveGrounding` →
`{ text, source: p.label }`) keeps a human-readable label but no id. **P1**, not P0: the numeric and
name cages already prevent fabricated specifics reaching a reader. What is missing is the ability to
*prove* grounding, not protection against inventing it.

---

## 16 · EXPRESSION BASIS — partial and inconsistent

Inquiry confidence **does** reach the model, embedded in prose:
`Working read on X (${inq.confidence.band}, not confirmed): ...` (`server.js:9214`). Agenda-belief
confidence does not. So epistemic strength is deterministically supplied for one class of statement
and left to the model's discretion for another. The kernel computes the band correctly in both
cases; only one is transmitted. **P1, and the cheapest of the three to close.**

---

## 17 · SUGGESTION BASIS — the strongest of the three, and genuinely good

`need` reaches the model with `candidate.question`, `candidate.topic` and — critically —
`distinguishes`, rendered as *"It would tell us between: A vs B"* (`composer.js:164`). The kernel
selects by expected information gain over burden (`diagnose.rankQuestions`), and Lane C bounded it so
curiosity cannot become interrogation. **A question IntelliQ asks can already be justified
deterministically.** This is the part of the brief's §21 that is already true.

---

## 18 · CITATION / PRIVACY MODEL — `usedRefs` is weaker than the brief hopes

`render-artifact.js governArtifact` takes `usedRefs` **from the model's own JSON output** and filters
it to ids that exist in the dataset. Nothing checks that the body's claims follow from those rows,
and an empty `usedRefs` passes. **`usedRefs` means "rows the model said it used".** It cannot support
*"this claim is justified by these governed references"*.

What *is* strong, and is the real guarantee, is numeric: every numeric token in the body must appear
in the dataset, or the artifact is refused and the deterministic version is shown. **A fabricated
figure cannot reach a reader.** That is a genuine deterministic cage and it is worth stating plainly
rather than replacing.

The brief's §23 separation (truth/provenance vs disclosure/citation rendering) is **correct and not
yet built**. Today there is one dataset per reader, assembled by the caller — which happens to be
safe, because scoping occurs before assembly. It is safe by *call order*, not by construction.

---

## 19 · GENERICITY VIOLATIONS DISCOVERED — fewer than expected

Searched for domain assumptions in production reasoning. **The reasoning layer is clean.** Domain
appears only as:

- `orgMode` passed as a string into prompts (`_domainDirective`), which is configuration
- domain wording packs, already governed by `packs-language-smoke` and `domain-cleanup-smoke`
- `composer.js:45` names football *in a prompt example* explaining polysemy ("finishing"). This is a
  prompt illustration, not a reasoning branch. **Acceptable, but it is the one place a sport is
  hard-coded in a shared file and should be genericised when convenient. P1.**

`team-state.js:19-20` states the genericity law explicitly and holds it. **The answer to the brief's
§26 question — "can organisational structure change without writing a new reasoning engine?" — is
yes, today, for hierarchy. It is no for classification, which is exactly the §7 gap.**

---

## 20 · CLASSIFICATION

### P0 — required for the pilot to honestly test the thesis

| Id | Finding | Why P0 |
|---|---|---|
| **P0-1** | No substrate for role/classification cohorts; the only available shape widens visibility | The brief calls it a pilot requirement, and the pilot organisation *is* role-structured. Without it the pilot tests a hierarchy, not an organisation |
| **P0-2** | Forum is attributed to humans; founder direction is anonymous | Shipping the wrong default is unrecoverable — people speak differently under each. Inverts a ratified assertion, so it needs a decision, not a patch |
| **P0-3** | Relationship claims have no erasure path | A claim naming an erased person outliving them is a privacy-law breach. Currently latent (no producer); becomes live the moment one is wired |

### P1 — real seams, not pilot blockers

- Claim-basis refs dropped at the composer boundary (§14)
- Expression basis transmitted inconsistently (§16)
- `usedRefs` is model-asserted (§18)
- Citation rendering not separated from provenance by construction (§18)
- Football example hard-coded in `composer.js` prompt (§19)

### LATER

Intervention memory · comparison/peer Web (already deferred by `peer-web-semantics.md` §9) ·
organisation-level High/Low · IntelliQ as a Forum participant (§18 of the brief) · agents.

### REJECT

- **Entity superclass** (§2) — `subject-ref.js` already is the identity contract
- **Expanding `scoped-intelligence-packet.js` into the truth contract** (§20) — builds a second
  intelligence layer; the contract is `diagnose` + `voice.explainObject`
- **Durable characteristic/behaviour records** (§6) — these are Inquiries; a store would create the
  permanent labelling the brief forbids
- **Any relationship-strength or social score** — never proposed by the code and must not be
- **A second leader-analytics permission universe** (§24) — vertical scope already governs this

---

## 21 · IMPLEMENTATION PERFORMED

**All three P0s, RED-first, at `ae16a27`.** 40 new assertions; no new stores, engines or truth
layers. Details in that commit message. Summary:

| P0 | Shape | Key guarantee |
|---|---|---|
| **D-A1** | `node.classifications = { userId: [tag] }` | `ai/org-graph.js`, which owns scope, contains no reference to it (K9, comments stripped). Three labels remain one origin (K10) |
| **D-A2** | `visibleThread(..., { viewerId })` | `authorId` never leaves the function for anyone; the stored message keeps it, so origins, echo, correction and withdrawal still work |
| **D-A3** | `relationship-claim:<a>~<b>#<concept>` | Undirected endpoints sorted so A↔B is one subject; direction declared, never positional; `_eraseSubjectInquiries` sweeps every subject naming a person |

**Four existing assertions had to move to the new laws.** Two were about to become **vacuous** —
they read `authorId` off the API view, which is now null for everyone, so they would have passed
without testing anything. Both moved to the kernel store, where authorship actually lives. One
(`subject-ref-smoke`) asserted the old opaque-id grammar and now pins the new one plus the old form
explicitly failing. One was a false positive: the "no vote, no consensus" check greps `forum.js` for
those words and tripped on a *comment explaining why consensus cannot be manufactured*; it now
strips comments and tests code rather than prose.

### The P1, specified for the immediate post-P0 pass — NOT implemented

Deferred by founder instruction. It is not required to make the dummy pilot truthful: the pilot
tests privacy, origin counting and scope, none of which depend on citation strength, and the numeric
cage already prevents fabricated figures reaching a reader.

**P1-a · carry the belief id and band to the composer.** `server.js:9166` currently does
`.map(a => ({ text: a.claim }))`. Change to `{ text: a.claim, ref: a.beliefId, band: a.confidence }`
and render in `composer.buildContext` as `- [ref] text (band)`. **Smallest useful step; do this
first.**

**P1-b · make expression basis consistent.** Inquiry band already reaches the model inside prose
(`server.js:9214`); agenda band does not. P1-a closes the gap by construction.

**P1-c · make `usedRefs` mean something.** Today it is the model's own assertion, filtered to valid
ids. Either verify each cited row's content appears in the sentence range that cites it, or rename
the field to `claimedRefs` and stop implying more than it delivers. **Renaming is the honest cheap
option and should be preferred unless verification is genuinely wanted.**

**P1-d · separate citation rendering from provenance.** Today one dataset per reader, safe by call
order rather than by construction. The fix is a `citationFor(ref, reader)` projection, so the same
governed reference renders as *"your check-ins from these dates"* to its owner and *"multiple
independent contributions"* to a leader.

**P1-e · genericity.** `composer.js:45` names football in a prompt example about polysemy. Replace
with a domain-neutral illustration.

---

## 22 · TESTS AND RESULTS

`npm test` at `6261f76`: **TRUTH LAYER GREEN.** No assertion was added, weakened or removed by this
pass. The audit relied on reading production code and on assertions already proven in the preceding
review passes (Lane C wiring, D51 migration, D53 fail-closed, D54 store ownership, harness
integrity).

---

## 23 · DUMMY PILOT

**Not run — and it is now the ONLY thing between here and a freeze verdict.** The two blockers that
made it impossible are gone: a person can hold several classifications, and a shared Forum is
anonymous. It is Stage 9 and depends on P0-1 and P0-2, both unadjudicated: a synthetic organisation
with "one person with multiple roles" and "a shared anonymous Forum" cannot be built against a system
that has neither. Building it against today's architecture would test the wrong system and produce
false confidence. **This is the single largest remaining piece of work and should follow the two
decisions below immediately.**

---

## 24 · FOUNDER DECISIONS

### D-A1 · How is a classification represented, given it must not widen visibility?

A person may be a midfielder, a captain and a sophomore simultaneously while sitting in exactly one
place in the hierarchy.

- **Option A — a `classifications` field on the membership record.** Smallest change. A node's
  `memberIds` gains a parallel map `{ userId → string[] }`. Cohort scoping reads it; `visibleScope`
  never does. *For:* one field, no new store, structurally incapable of widening scope because
  `canSee` never sees it. *Against:* a classification cannot span nodes (a "captains" cohort across
  two squads needs a union at query time).
- **Option B — a first-class `classification` subject kind** alongside `member:`/`group:`, with its
  own membership store. *For:* cohort-level Inquiries and High/Lows become natural; `midfield ↔
  forwards` is expressible as a relationship between two classification subjects. *Against:* a new
  store, which Lane D's minimum delta forbids without cause.
- **Option C — reuse `orgNodes` with a `kind: 'classification'` flag** excluded from
  `visibleScope`. *For:* no new store, reuses graph machinery. *Against:* the exclusion is a
  *rule someone must remember* in every scope computation — precisely the failure mode
  `peer-web-semantics.md` L-P1 was written to prevent. **Not recommended.**

**Recommendation: A for pilot, with B as the post-pilot shape.** A is the smallest thing that makes
the pilot honest, and it cannot leak by construction. Note that **one person with three
classifications must remain one evidence origin** — origin counting is already by `originRef`, not by
membership, so this holds for free (`contribution.js:203`).

**Blocks:** the dummy pilot, and any cohort-scoped High/Low.

### D-A2 · Forum anonymity, and what it means when the group is small

The founder's direction is anonymous-to-humans, known-to-the-kernel. The direction is not in
question; two consequences are.

- **A2a — does anonymity apply to the author's own view, and to leaders?** A member seeing their own
  message unattributed is confusing; a leader seeing authors defeats the purpose.
  *Recommendation:* anonymous to everyone including leaders; the author sees their own message marked
  as theirs, because a person must be able to find and correct what they said.
- **A2b — §16: hiding a name is not aggregation.** In a five-person node, *"someone said the sessions
  feel rushed"* is close to naming. Options: (i) accept it, anonymity is about attribution not
  inference; (ii) apply the existing `MIN_COHORT` floor to *anonymous display* as well as to
  aggregate claims, hiding the thread entirely below the floor; (iii) show it with an honest warning.
  *Recommendation:* **(i), explicitly stated to users.** Forum is deliberation, not a claim — the
  floors already govern what may become evidence, and suppressing a small team's discussion would
  make Forum useless exactly where teams are smallest. But this must be a **stated** decision, not a
  silent one, because it is the difference between candour and a false promise of safety.

**Blocks:** P0-2, and the shared-Forum half of the dummy pilot.

### D-A3 · What identifies a relationship claim, so erasure can find it?

`relationship-claim:<id>` currently accepts any id. If the id embeds its endpoints
(`relationship-claim:<memberA>~<memberB>~<concept>`), erasure can sweep by substring and the subject
is self-describing. If it is opaque, an index is required.

**Recommendation: endpoint-bearing ids**, so that erasure remains a property of the ref rather than
of a store that must be kept in step. **No producer may be wired until this is answered** — `F53.7`
enforces that.

**Blocks:** P0-3 and any automatic relationship curiosity (brief §8).

---

## 25 · FREEZE VERDICT

# NOT READY TO FREEZE

Three P0 blockers, listed in §20. All three are smaller than the brief assumes and none requires a
new engine. Two need a founder decision before any code is written; the third needs the decision in
D-A3 before its producer exists.

**What must NOT happen next:** further architecture. Once D-A1, D-A2 and D-A3 are answered, the work
is one field, one audience mode, one id convention, then the dummy pilot and the adversarial suite.
Everything in the LATER and REJECT lists stays there.

---

## FINAL QUESTION

> *Can IntelliQ become a domain-agnostic skin over arbitrary organisational structures, where one
> deterministic truth-maintenance system reasons across both vertical authority and horizontal human
> relationships, while an LLM turns that governed state into useful, evidence-grounded,
> rationale-explaining, audience-safe communication without owning truth or exposing private
> information?*

**Yes — and it is closer than this brief assumes, with one honest qualification.**

The domain-agnostic part is **already true**: the reasoning layer contains no sport, no school and no
corporation, and `team-state.js` states that as law and holds it. The single deterministic TMS is
**already subject-agnostic** and already reasons over vertical and lateral evidence through the same
machinery. The LLM already cannot own truth — it may not draw a conclusion, and it may not decide
that a private remark concerns a group.

The qualification is that **"audience-safe communication that explains its rationale" is currently
true of what IntelliQ refuses, and only partly true of what it asserts.** Provenance dies at the
composer boundary: the model receives claims as sentences, without their ids or their confidence.
IntelliQ can therefore reliably avoid saying something false, and can reliably justify a *question*
it asks — but it cannot yet prove which governed reference justifies a *statement* it makes. That is
a P1 seam, not a P0 blocker, and it is a transmission problem rather than an architectural one.

The genuine architectural answer to the founder's own thesis is narrower than the brief: IntelliQ
does not need a horizontal reasoning engine. **It needs the ability to name a lateral subject** — a
cohort, and a relationship — and the machinery it already has will do the rest.
