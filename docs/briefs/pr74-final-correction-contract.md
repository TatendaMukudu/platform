# PR #74 — FINAL correction contract

**Status:** CURRENT implementation brief. **Supersedes `docs/briefs/pr74-correction-contract.md`**,
which remains as history and must not be implemented from — its C1 fix is defeated by the complement
attack (§C1 below).
**Stage 2** of the final pre-implementation hardening program. Preceded by `48bb6e7`.
**Target:** `codex/web-intelligence-no-llm` @ `1c02dc9`. **Do not modify PR #74 from another branch.
Do not merge.**
**Line numbers pinned at `1c02dc9`.** Attacks in this document were **executed**, not reasoned about.

Every correction carries: **RED TEST · NAIVE FIX THAT IS STILL WRONG · ADVERSARIAL TEST · PRODUCTION
CHANGE · GREEN STATE · REGRESSION BOUNDARY**.

**Baseline:** `npm test` green; `pilot-loop-smoke` 28 passed / 1 failed (the P0-5 Forum echo
assertion — expected, must not change).

---

## C1 · The privacy floor must be TWO-SIDED and gate the whole payload

**Severity: pilot blocker.** The previous brief's fix is insufficient.

### RED TEST

Three fixtures, three assertions, all failing today:

| Fixture | Assert |
|---|---|
| 2 members, **1** declining | `rollup.patternCounts` contains no entry; `momentum === 'steady'`; `participation === null` |
| 2 members, **both** declining | `items.length === 0` **and** `rollup.patternCounts` empty |
| 3 members, **2** declining | `items.length === 0` |

### NAIVE FIX THAT IS STILL WRONG

> *"Drop every `patternCounts` entry whose count `< MIN_COHORT`."*

This is what the previous brief specified. **Measured against fixture 2:**

```
memberCount   : 2
patternCounts : {"momentum_drop":2,"repeated_concern":2}
items         : 2 Web Lows surfaced
roster        : Ann, Ben
```

`count = 2` passes the filter. `count == memberCount` means the leader has learned that **both named
people** have momentum drop. The naive fix protects nobody in the case a leader most cares about — a
unit where everyone is struggling.

### ADVERSARIAL TEST

`P-1` and `P-2` from `docs/ttd/privacy-inference-attacks.md` §4:

```
P-1  k == n            ⇒ no aggregate and no count   (2 of 2 declining)
P-2  n - k < MIN_COHORT ⇒ no aggregate and no count   (2 of 3 declining)
P-12 roster + briefing together contain no (name, pattern) pair
```

### PRODUCTION CHANGE

- **FILES:** `server.js`
- **FUNCTIONS:** `_webIntelligence` (`:4154`); `_sanitizeBriefingForLeader` (`:4134`); the `rollup`
  literal (`:4246`); `momentum` / `participation` derivation (`:4220-4222`)

Implement **L-PR1**: an aggregate is disclosable only when `k >= MIN_COHORT` **and**
`n - k >= MIN_COHORT`, where `n = members.length`. Apply to:

- `_webIntelligence`'s gate (currently `count < 2`);
- every `patternCounts` entry before it reaches `rollup`;
- `momentum`, computed from **gated** counts only;
- `participation` and `activeThisWeek` — `null` below floor, never `0`.

Import `MIN_COHORT` from a single place. Do not re-declare a literal `2`.

### GREEN STATE

Fixtures 1-3 publish no count and no item. An 8-member scope with 3 declining still publishes both.

### REGRESSION BOUNDARY
`web-intelligence-smoke`, `proactive-smoke`, `endpoint-smoke`, new `privacy-inference-smoke`.

### NON-GOALS / STOP
Do not change `MIN_COHORT`. Do not add noise or rounding. **Stop and report** if removing a rollup
field breaks a frontend read with no null-safe path.

---

## C2 · Count independent origins, not people

**Severity: pilot blocker.** Demonstrated: one origin retold by three people surfaced a Web Low.

### RED TEST
1. Three members, **one shared** `originId`, `originKind: 'retelling'` ⇒ `items.length === 0`.
2. Three members, three distinct origins ⇒ a Web Low surfaces.
3. The artifact carries an internal `openingRule` from `contribution.js`'s vocabulary.

### NAIVE FIX THAT IS STILL WRONG

> *"Replace the integer counter with `new Set(findings.map(f => f.originRef)).size`."*

Two ways this stays wrong:

- **Falsy origins collapse to one.** `ai/contribution.js:203` filters first —
  `new Set(live.filter(c => c.originRef).map(c => c.originRef))`. A hand-rolled Set counts
  `undefined` as a legitimate origin, so **three findings with no origin at all clear a threshold of
  two**. Conservatism about unknown origin is a deliberate existing property; reimplementing loses it.
- **It skips the other two opening rules.** `LEADER_OPENED` and `AUTHORITATIVE_SOURCE`
  (`contribution.js:213-223`) legitimately open on fewer origins. A Set-size check silently narrows
  the law rather than applying it.

### ADVERSARIAL TEST
4. Three findings with **no** `originRef` ⇒ nothing surfaces (defeats the falsy collapse).
5. One authoritative finding ⇒ surfaces under `AUTHORITATIVE_SOURCE` (defeats the over-narrow Set).
6. Two contributors, two origins, **one later corrected** ⇒ recount; the artifact withdraws.

### PRODUCTION CHANGE
Accumulate `{ contributors:Set, origins:Set, authorities:n }` per pattern type, then **call the
existing function** — do not reimplement the rule:

```js
const decision = contribution.shouldOpenGroupInquiry(perTypeContributions, { now });
if (!decision.open) continue;
```

### GREEN STATE
Ten people retelling one origin ⇒ nothing. Two independent origins ⇒ surfaces.

### REGRESSION BOUNDARY
`web-intelligence-smoke`, `group-subject-smoke`, `pilot-loop-smoke` **must stay 28/1**.

### STOP
If `shouldOpenGroupInquiry`'s input shape does not fit, **report the mismatch** — do not edit
`ai/contribution.js`.

---

## C3 · Confidence and severity must be derived

**Severity: pilot blocker.** `server.js:4162` hardcodes both.

### RED TEST
1. All constituents `severity: 'high'` ⇒ artifact is `high`, not `medium`.
2. Constituents mixed `tentative` / `clear` ⇒ artifact is `tentative`.
3. No artifact carries a band absent from every constituent.

### NAIVE FIX THAT IS STILL WRONG

> *"Take the maximum confidence across constituents."*

Backwards. Confidence is a **weakest-link** property: an aggregate is only as trustworthy as its
least-supported member. Taking the max lets one `clear` constituent launder four `tentative` ones —
which is the same error as counting voices instead of origins, in a different field.

Severity is the opposite: **maximum**, because an aggregate containing a high-severity finding is at
least that serious.

### ADVERSARIAL TEST
4. Four `tentative` + one `clear` ⇒ artifact is `tentative` (defeats max-confidence).
5. Four `low` + one `high` severity ⇒ artifact is `high` (defeats min-severity).

### PRODUCTION CHANGE
`L-W15`: confidence = **min** across contributing origins; severity = **max** across constituents.
Carry `{originRefs, contributorCount, independentOriginCount, openingRule, minConfidence,
maxSeverity, computedAtFingerprint}` internally and **never render it** — same rule as `basis`.

### STOP
If a constituent carries no confidence value, **report** — do not default to `'emerging'`.

---

## C4 · `audienceSafe` must be an ALLOW-LIST for Web artifacts

**Severity: pilot blocker.**

### RED TEST
Measured — eleven of twelve identity vectors pass today:

| Vector | Today |
|---|---|
| name in rendered body | **PASSES** |
| member id in body | **PASSES** |
| evidence id in body | **PASSES** |
| forged `subjectRef` / `ownerRef` / `contributorId` / `memberId` / `subjectName` / `evidenceIds` | **all PASS** |
| `perspective:'web'` + `audience:'self'` carrying person-level `basis` | **PASSES** (`:275` gates basis on audience, not perspective) |
| forged `subjectId` | BLOCKED |

### NAIVE FIX THAT IS STILL WRONG

> *"Add `subjectRef`, `ownerRef`, `contributorId`, `memberId`, `subjectName`, `evidenceIds` to the
> violation check."*

**A deny-list fails open on the next field anyone adds.** The whole defect is that `subjectId` was
the only field anyone thought of; enumerating six more repeats the mistake with a longer list. The
seventh field — added in six months by someone extending the artifact — will pass.

### ADVERSARIAL TEST
7. Attach a field **not on any list** (`assigneeRef`, `authorId`, `personKey`) ⇒ must be a violation.
   A deny-list fails this. An allow-list passes it.
8. `perspective:'web'` + `audience:'self'` with populated `basis` ⇒ violation.
9. `perspective` supplied by the caller as `'web'` while `subjectRef` names a person ⇒ the derived
   perspective must be `'self'`, so the artifact never claims to be an aggregate.

### PRODUCTION CHANGE
Three changes, in order — **item 3 is the one that matters**:

1. **Allow-list.** For `perspective === 'web'`, assert the artifact's key set is a subset of a frozen
   `WEB_ARTIFACT_KEYS`. Any unknown key is `web_unknown_field`.
2. **Gate `basis` on perspective**, not only audience (`:275`): a Web artifact carries `basis: []` for
   every audience.
3. **Derive `perspective` from `subjectRef` inside `toInsight`** (L-C5) rather than accepting
   `opts.perspective`. 1 and 2 harden a validator; **3 removes the need to trust the producer.**

### NON-GOALS
A general name detector in free text — a separate, harder problem. **Record it as a stated
limitation**; do not attempt it here. `_webIntelligence` uses fixed `PATTERN_LABEL` text, so the
current producer cannot emit a name.

### STOP
If deriving `perspective` changes behaviour for any existing self-audience insight, **report** — the
derivation must be a no-op outside the Web path.

---

## C5 · The no-LLM suite must exercise production

**Severity: pilot blocker. Sequence this FIRST.**

### RED TEST — the current suite's own failures

| Assertion | Verdict | Proof |
|---|---|---|
| deterministic-only mode active | weak | passes with no key regardless of the switch |
| Web High/Low | **real** | fails under mutation of `_webIntelligence` |
| member vs leader projections differ | **green by construction** | passes on an org with **zero evidence** — two endpoints, two schemas |
| evidence/provenance canonical | **fixture readback** | passes with **no HTTP request at all** |
| private evidence absent | near-vacuous | no `originId` ever appears in a briefing |
| Inquiry represented | **fixture readback** | ditto |
| Focus represented | **fixture readback**, wrong shape | `{focus:{…}}` vs production `mem.focuses[]` (`server.js:4846`) |
| zero model calls | real for the tested flow | |

### NAIVE FIX THAT IS STILL WRONG

> *"Keep the assertions but seed richer fixtures."*

A richer fixture readback is still a readback. **The test must be shown to fail when the production
path is removed**, which no amount of fixture detail achieves.

### ADVERSARIAL TEST — the mutation gate

> **Every assertion in this suite must be demonstrated RED under a targeted mutation of
> production before the suite is declared done.** Record the mutation used, per assertion, in a
> comment. An assertion whose mutation cannot be constructed is deleted, not shipped.

### PRODUCTION CHANGE — the replacement assertions

1. **Inquiry — route through the deterministic path.** `_admitGroupContributions`
   (`server.js:12588`) is model-free: `shouldOpenGroupInquiry` → `toGroupProposal` →
   `applyProposals` → `inquiryStates`. Assert an inquiry is **created** with models disabled.
   `scripts/group-subject-smoke.js:19` already runs under `IQ_DETERMINISTIC_ONLY=1`.
2. **Focus — assert only what is true.** Durable and readable without a model; **not** derived,
   discovered or progressed. Assert through `/api/me/focus/outcome` against `mem.focuses[]`, and
   **state the limitation in the assertion text**.
3. **Same reality, different actors.** Two actors, **the same endpoint**, one seeded org. Assert the
   governed difference: the member's payload carries their own subject; the leader's carries an
   aggregate and no subject.
4. **Private evidence.** Assert a private-only member does **not** supply the second person needed to
   clear the cohort floor.

### NON-GOALS
Making personal Inquiry work without a model. `_intakeTurn` (`:9175`) returns early when
`!ai.enabled()` — a **true limitation**. Document it; do not fix it here.

### GREEN STATE
Every assertion red under mutation; `scripts/test.js:86` claims only what is proven.

---

## C6 · Deterministic-only must close the model exits

**Severity: pre-pilot.** Downgraded from the review's classification: `understand()` and
`transcribe()` are **invoked nowhere in production** (exhaustive grep, Stage A). Latent, not live.
**One live bug remains.**

### RED TEST
With `IQ_DETERMINISTIC_ONLY=1` and both keys set:

| # | Assert | Today |
|---|---|---|
| 1 | `canTranscribe() === false` | **FAILS** — returns `true` |
| 2 | `canUnderstand() === false` | passes |
| 3 | `understand()` rejects with a deterministic-mode error | **FAILS** — reached the provider (401) |
| 4 | `transcribe()` rejects likewise | **FAILS** — reached the provider (403) |
| 5 | the capability endpoint reports `voice: false` | **FAILS** — `server.js:6124` |

### NAIVE FIX THAT IS STILL WRONG

> *"Add `if (deterministicOnly()) return false` to `canTranscribe()`."*

Fixes the report and leaves `transcribe()` itself reachable. The gate and the function must both
refuse, because the gate is advisory and the function is the boundary — exactly the asymmetry that
made `complete()` safe and these two not.

### ADVERSARIAL TEST
6. Call `transcribe()` **directly**, ignoring the gate ⇒ deterministic-mode rejection, not a provider
   error.
7. Call `understand()` directly ⇒ same.
8. `gateway.client` is either **absent from exports** or documented with a reason.

### PRODUCTION CHANGE
`deterministicOnly()` guard in `canTranscribe()`; the same hard refusal `complete()` has inside both
`understand()` and `transcribe()`; remove or justify the `client` export.

### STOP
If any caller of `understand`/`transcribe` is discovered, **report before changing behaviour**.

---

## C7 · Embeddings — RESOLVED, no longer founder-blocked

**Stage 1 resolved this.** The founder's ratified enumeration of places truth must not live **names
"embedding" explicitly**, and the no-egress promise is that *"nothing about their people ever leaves
the box"*. Embedding a person's text sends that text to OpenAI.

**Decision: `ai/embeddings.js` joins the switch.** `enabled()` becomes
`!!KEY && !gateway.deterministicOnly()`.

Per L-B1 an embedding may never be cited, so **nothing citable is lost** — only recall. State in
`scripts/test.js`'s registry line and the §19 addendum that semantic retrieval degrades to keyword in
no-egress mode.

### RED TEST
`embeddings.enabled() === false` under `IQ_DETERMINISTIC_ONLY=1` — **fails today**.

### ADVERSARIAL TEST
With the switch on, exercise `server.js:8675` and `16821` and assert **no outbound call** and a clean
keyword fallback — not an exception.

---

## C8 · Audit `_promptCandidates`, then restore or retire

**Severity: pre-pilot.** `prompts: []` was hardcoded, but `_reasonedPrompts` had a **deterministic
branch** (`server.js:4094`): `if (!ai.enabled()) return cands.slice(0, 4)`. The §19 addendum calls
this *"optional enrichment… not invoked"*, which is inaccurate — it was removed.

### REQUIRED
1. Audit each candidate kind in `_promptCandidates` (`:4011`) for person-level content.
2. **Then choose and say which:** restore the deterministic branch for aggregate-safe kinds, or
   retire it explicitly and correct the addendum to name which kinds failed the audit.

### NAIVE FIX THAT IS STILL WRONG
> *"Restore `prompts: promptsRaw`."*

Restores the LLM ranking call too, and restores any person-level candidate kinds unaudited. The
deterministic branch and the model branch must be separated before either is restored.

---

## C9 · Document the severed leader feedback loop

**Documentation only.** `/api/intelligence/act` (`:4290`), `/outcome` (`:4317`),
`/notice-feedback` (`:4352`) have **zero frontend callers**. `_webIntelligence` gates on
`confidence.shouldSurface(reliabilityByType[type])`, so it depends on a signal whose only input path
was deleted. `shouldSurface(undefined)` returns `true` (`ai/confidence.js:35`), so nothing breaks —
the loop simply never learns.

Record in the PR description and §19. **Do not re-add the old buttons** — they were person-level by
construction and their removal was correct.

---

## Sequencing

| Order | Corrections | Why |
|---|---|---|
| 1 | **C5** | the suite must be able to detect regressions before anything changes |
| 2 | **C1** | two-sided floor; the largest behaviour change |
| 3 | **C2, C3** | same function as C1; C3 depends on C2's accumulator |
| 4 | **C4** | independent; item 3 touches `toInsight` |
| 5 | **C6, C7** | gateway; independent of everything above |
| 6 | **C8, C9** | audit and documentation |

## Global stop conditions

- Any regression outside the named suites.
- `pilot-loop-smoke` moving off 28/1.
- Any correction requiring a change to `ai/contribution.js`, `ai/diagnose.js` or `ai/org-graph.js` —
  epistemic modules, out of scope here.
- Any assertion that cannot be demonstrated red under mutation.

## Definition of done

`npm test` green; `pilot-loop-smoke` 28/1; **every new assertion demonstrated red under a recorded
mutation**; `privacy-inference-smoke` P-1/P-2/P-12 green; the §19 addendum matching the code. Then
request re-review.

---

## Fake-green detector — apply to every assertion written

An assertion is insufficient if **any** of these is true:

1. it passes with **no HTTP request** made;
2. it passes on an org with **zero evidence**;
3. it compares **two different endpoints**;
4. it asserts a value the test itself seeded;
5. it asserts a forbidden value is **absent from a response where it could never appear**;
6. it asserts a function **exists** or has a type;
7. it contains `|| true`, `&& false`, or a predicate with a constant operand;
8. **its production path cannot be mutated to make it fail.**

Rule 8 subsumes the others and is the only one that must be *demonstrated* rather than reviewed.
