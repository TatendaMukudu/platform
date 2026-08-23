# PR #74 correction contract

**Status:** implementation brief. Architecture is settled here; Codex implements decisions.
**Stage F** of the architecture loop. Preceded by `938207b`.
**Target branch:** `codex/web-intelligence-no-llm` @ `1c02dc9`. **Do not modify PR #74 from any
other branch. Do not merge.**
**Source of findings:** the independent review of PR #74 (CORRECTIONS REQUIRED).
**Line numbers below are at `1c02dc9`**, verified by reading that commit.

Nine corrections. Each carries FILES · FUNCTIONS · TEST-FIRST RED · EXPECTED GREEN · NON-GOALS ·
STOP CONDITIONS · REGRESSION SUITES · COMPLETION CRITERION.

**Baseline before starting:** `npm test` green; `pilot-loop-smoke` 28 passed / 1 failed (the P0-5
Forum echo assertion, which is expected and must not change).

---

## C1 · The privacy floor must gate the whole payload

**Severity: pilot blocker.** Demonstrated live during review.

### The defect

`/api/intelligence/briefing` returns, in one response, a summary claiming the floor was applied and
a rollup that breaches it:

```
items   : []
summary : "No aggregate pattern currently clears the privacy and confidence floors
           for your visible group."
rollup  : {"memberCount":2,"activeThisWeek":0,"participation":0,
           "momentum":"softening","patternCounts":{"momentum_drop":1,"repeated_concern":1}}
```

With a two-person scope and a roster that returns both names, `momentum_drop: 1` identifies a person.
`momentum` is rendered by `js/app.js` and is a direct function of below-floor counts.

- **FILES:** `server.js`
- **FUNCTIONS:** `_sanitizeBriefingForLeader` (`:4134`); the `rollup` literal (`:4246`); `momentum`
  and `participation` derivation (`:4220-4222`)

### TEST-FIRST RED

`scripts/web-intelligence-smoke.js`, new assertions:

1. Seed a **two-member** scope where exactly **one** member has a pattern.
2. Assert `items.length === 0` (already true).
3. Assert `JSON.stringify(res.rollup)` contains **no** `patternCounts` entry with a value below
   `MIN_COHORT`.
4. Assert `rollup.momentum === 'steady'` when every contributing count is below floor.
5. Assert `rollup.participation === null` (not `0`) when `memberCount < MIN_COHORT`.

Assertions 3-5 **must fail** before the change.

### EXPECTED GREEN

`_sanitizeBriefingForLeader` gates the rollup as well as `summary` and `items`, following the
`cohortValid` precedent at `server.js:16932` (which zeroes `cohortSize` *and* empties
`sharedPatterns` together):

- `patternCounts` — drop every entry whose count `< MIN_COHORT`.
- `momentum` — compute from the **gated** counts only.
- `participation` / `activeThisWeek` — `null` below `MIN_COHORT`, not `0`.

Import `MIN_COHORT` from one place; do not re-declare a literal `2`.

- **NON-GOALS:** re-introducing per-member items; changing `MIN_COHORT`; touching the roster.
- **STOP IF:** removing a rollup field breaks a frontend read that has no null-safe path — report,
  do not silently keep the field.
- **REGRESSION:** `web-intelligence-smoke`, `proactive-smoke`, `endpoint-smoke`.
- **DONE WHEN:** a below-floor payload publishes no count, and the summary's claim is true of the
  whole response.

---

## C2 · Count independent origins, not people

**Severity: pilot blocker.** Demonstrated live: one origin retold by three people surfaced a Web Low.

### The defect

`_webIntelligence` (`:4154`) receives only `patternCounts`, which is incremented once per member per
finding (`:4215`). It never sees `originRef`. Counting people is exactly the "contributors" measure
`ai/contribution.js:203` rejects, and its `ECHO` verdict exists to refuse this case.

- **FILES:** `server.js`
- **FUNCTIONS:** `_webIntelligence` (`:4154`); the `patternCounts` accumulation (`:4215`)

### TEST-FIRST RED

`scripts/web-intelligence-smoke.js`:

1. **Echo case** — three members whose evidence all carries **one** `originId`, `originKind:
   'retelling'`. Assert `items.length === 0`.
2. **Corroboration case** — three members with three distinct `originId`s. Assert a Web Low
   surfaces.
3. **Mixed** — two distinct origins across four people. Assert it surfaces (rule
   `INDEPENDENT_CORROBORATION`).
4. Assert the artifact carries an internal `openingRule` matching `contribution.js`'s vocabulary.

Assertion 1 **must fail** before the change.

### EXPECTED GREEN

Accumulate `{ contributors:Set<subjectId>, origins:Set<originRef>, authorities:n }` per pattern type
instead of an integer, then gate with the **existing** function — do not reimplement the rule:

```js
const decision = contribution.shouldOpenGroupInquiry(perTypeContributions, { now });
if (!decision.open) continue;
```

- **NON-GOALS:** a new corroboration rule; changing `MIN_INDEPENDENT_ORIGINS`; touching
  `ai/contribution.js`.
- **STOP IF:** `shouldOpenGroupInquiry`'s input shape does not fit without modifying it — report the
  mismatch rather than editing the epistemic module.
- **REGRESSION:** `web-intelligence-smoke`, `group-subject-smoke`, `pilot-loop-smoke` (must stay
  28/1).
- **DONE WHEN:** ten people retelling one origin surface nothing; two independent origins surface.

---

## C3 · Confidence and severity must be derived, never asserted

**Severity: pilot blocker** — a Web artifact currently claims what the kernel never established.

### The defect

`server.js:4162`:

```js
type, polarity, severity: positive ? 'low' : 'medium', confidence: 'emerging',
```

Both are literals. The kernel's real severity (possibly `high`) is discarded.

- **FILES:** `server.js` · **FUNCTIONS:** `_webIntelligence` (`:4154`)

### TEST-FIRST RED

1. Seed a cohort whose constituent findings are all `severity: 'high'`; assert the Web Low carries
   `severity: 'high'`, not `'medium'`.
2. Seed constituents with mixed confidence (`tentative`, `clear`); assert the artifact carries the
   **minimum** (`tentative`).
3. Assert no artifact carries a confidence band absent from every constituent.

All three **must fail** before the change.

### EXPECTED GREEN

Per `web-semantics-and-continuous-intelligence.md` §22 / **L-W15**: confidence is the **minimum**
across contributing origins; severity is the **maximum** across constituent findings. Carry the
provenance block internally (`originRefs[]`, `contributorCount`, `independentOriginCount`,
`openingRule`, `minConfidence`, `maxSeverity`) and **never render it** — same rule as `basis`.

- **NON-GOALS:** inventing a new confidence vocabulary; rendering provenance.
- **STOP IF:** constituent findings do not carry a confidence value — report; do not default to
  `'emerging'`.
- **REGRESSION:** `web-intelligence-smoke`, `proactive-smoke`, `intelligence-smoke`.
- **DONE WHEN:** no Web artifact carries a confidence or severity that no constituent carries.

---

## C4 · `audienceSafe` must structurally protect the Web projection

**Severity: pilot blocker** by the review's stated criterion.

### The defect

`ai/proactive.js:300` checks exactly one field. Measured — every equivalent identity vector passes:

| Attack | Result |
|---|---|
| name in rendered body | **PASSES** |
| member id in body | **PASSES** |
| evidence id in body | **PASSES** |
| forged `subjectRef` / `ownerRef` / `contributorId` / `memberId` / `subjectName` / `evidenceIds` | **all PASS** |
| `perspective:'web'` + `audience:'self'` carrying person-level `basis` | **PASSES** (`:275` gates basis on audience, not perspective) |
| forged `subjectId` | BLOCKED |

- **FILES:** `ai/proactive.js` · **FUNCTIONS:** `audienceSafe` (`:293`); `toInsight` (`:215`, `:275`)

### TEST-FIRST RED

Add to `scripts/proactive-smoke.js` — one assertion per row above, each expecting a violation.
Eleven of twelve **must fail** before the change.

### EXPECTED GREEN

Three changes, in this order:

1. **Deny-list the identity siblings.** For `perspective === 'web'`, any of
   `subjectId`, `subjectRef`, `ownerRef`, `contributorId`, `memberId`, `subjectName`, `evidenceIds`
   being non-null is `web_subject_exposed`.
2. **Gate `basis` on perspective as well as audience** (`:275`): a `perspective: 'web'` artifact
   carries `basis: []` for **every** audience.
3. **Derive `perspective`, do not accept it** — per `self-and-web-orchestration.md` **L-C5**,
   compute it from `subjectRef` inside `toInsight` rather than from `opts`. This closes the
   laundering route at the source rather than validating it afterwards.

Item 3 is the important one: 1 and 2 harden a validator; 3 removes the need to trust the producer.

- **NON-GOALS:** a general name detector in free text (a separate, harder problem — record it as a
  limitation, do not attempt it here); changing `PROTECTED_RE`, `SCORE_RE` or `QUOTE_RE`.
- **STOP IF:** deriving `perspective` changes behaviour for any existing self-audience insight —
  report; the derivation must be a no-op outside the Web path.
- **REGRESSION:** `proactive-smoke` (78 assertions), `web-intelligence-smoke`, `governance-smoke`.
- **DONE WHEN:** every row above is blocked, and no producer can set `perspective` directly.

---

## C5 · The no-LLM suite must exercise production

**Severity: pilot blocker.** Six of eight assertions are green by construction.

### The defect, measured

| Assertion | Status |
|---|---|
| deterministic-only mode is active | weak — passes with no key regardless |
| leader receives a deterministic Web High/Low | **real** — fails under mutation |
| member and leader receive different projections | **green by construction** — two different endpoints, passes on an org with zero evidence |
| evidence and provenance remain canonical | **fixture readback** — passes with no HTTP request |
| private evidence absent from Web projection | near-vacuous — no `originId` ever appears in a briefing |
| unresolved Inquiry remains represented | **fixture readback** |
| existing Focus remains represented | **fixture readback**, and in a shape production cannot read (`{focus:{…}}` vs `mem.focuses[]`, `server.js:4846`) |
| zero model calls | real for the tested flow |

- **FILES:** `scripts/no-llm-harness-smoke.js`, `scripts/test.js:86`

### TEST-FIRST RED

Delete the three fixture-readback assertions and the different-projections assertion, and replace:

1. **Inquiry — use the deterministic path.** `_admitGroupContributions` (`server.js:12588`) is fully
   model-free: `shouldOpenGroupInquiry` → `toGroupProposal` → `applyProposals` → `inquiryStates`.
   Assert an inquiry is **created** with models disabled. `scripts/group-subject-smoke.js:19` already
   runs under `IQ_DETERMINISTIC_ONLY=1` and is the template.
2. **Focus — assert only what is true.** With models off, Focus is **durable and readable**; it is
   not derived, discovered or progressed. Write the assertion against `mem.focuses[]` through
   `/api/me/focus/outcome`, and **name the limitation in the assertion text**.
3. **Same state, different actors.** Two actors, the **same endpoint**, one seeded org; assert the
   two payloads differ in the specific governed way (member sees own subject; leader sees an
   aggregate and no subject). The current comparison across two different endpoints must go.
4. **Private evidence.** Assert a private-only member does **not** supply the second person needed
   to clear the cohort floor — the property the review verified independently.

### EXPECTED GREEN

Every assertion must fail under mutation. **Mutation-test each one before declaring the suite done**:
break the production path it claims to prove and confirm a red.

- **NON-GOALS:** making personal Inquiry work without a model (`_intakeTurn:9175` returns early when
  `!ai.enabled()` — this is a **true limitation**, document it, do not fix it here); adding new
  product capability.
- **STOP IF:** an assertion cannot be made to fail under mutation — delete it rather than ship it.
- **REGRESSION:** full `npm test`; `pilot-loop-smoke` stays 28/1.
- **DONE WHEN:** every assertion has been shown red under a targeted mutation, and `scripts/test.js`'s
  registry line claims only what is proven.

---

## C6 · Deterministic-only must close the model exits

**Severity: pre-pilot.** Downgraded from the review's "live" classification by Stage A: `understand()`
and `transcribe()` are **invoked nowhere in production** (exhaustive grep). They are latent, not
live. One real bug remains.

### The defects

| Path | Behaviour under `IQ_DETERMINISTIC_ONLY=1` | Reachable? |
|---|---|---|
| `complete` / `completeJSON` | hard-refuses | correct |
| `understand()` (`gateway.js:281`) | **reaches the provider** — no internal check | **no caller** |
| `transcribe()` (`gateway.js:338`) | **reaches the provider** | **no caller** |
| `canTranscribe()` (`:337`) | **returns `true`** — ignores the switch | **yes — `server.js:6124`** |
| `gateway.client` (`:351`) | raw SDK exported, unguarded | no caller |

**The live bug is `canTranscribe()`.** `server.js:6124` reports `voice: ai.canTranscribe()` to the
client, so a no-egress org is advertised a transcription capability it has explicitly disabled.

- **FILES:** `ai/gateway.js`, `scripts/no-egress-smoke.js`

### TEST-FIRST RED

In `no-egress-smoke.js`, with `IQ_DETERMINISTIC_ONLY=1` and both keys set:

1. `canTranscribe() === false` — **fails today**.
2. `canUnderstand() === false` — passes; must not regress.
3. `understand()` rejects with a deterministic-mode error, not a provider error — **fails today**.
4. `transcribe()` rejects likewise — **fails today**.
5. The capability endpoint reports `voice: false` — **fails today**.

### EXPECTED GREEN

Add the `deterministicOnly()` guard to `canTranscribe()`, and the same hard refusal `complete()` has
to both `understand()` and `transcribe()`. **Either delete `client` from the exports or document why
it is exported** — an unguarded raw SDK handle should not be reachable by accident.

- **NON-GOALS:** building a deterministic transcription or vision fallback; changing the env-force
  semantics.
- **STOP IF:** any caller of `understand`/`transcribe` is discovered — report before changing
  behaviour.
- **REGRESSION:** `no-egress-smoke`, `endpoint-smoke` (asserts the capability report).
- **DONE WHEN:** every export that can reach a provider refuses in deterministic mode, and the
  capability endpoint tells the truth.

---

## C7 · The embeddings claim must be settled in writing

**Severity: pre-pilot. Contains a founder decision — see D-E3 / D-B2.**

`ai/embeddings.js:20` — `enabled()` is `!!KEY`, entirely outside `deterministicOnly()`. Two live call
sites (`server.js:8675`, `16821`) plus boot (`17577`).

**Option A — bring it inside the switch.** Semantic retrieval degrades to keyword in no-egress mode.
**Option B — leave it outside and narrow the claim in writing** to "no generative model".

**Recommendation: A.** A school buying no-egress will not accept "except embeddings", and
`deterministic-web-intelligence.md` **L-B1** already establishes that an embedding may accelerate
retrieval but may never be cited — so losing it costs recall, never truth.

- **BLOCKED ON:** founder answer. **Do not choose silently.**
- **Whichever is chosen:** `scripts/test.js`'s no-LLM registry line and the §19 doc addendum must
  state it explicitly.

---

## C8 · The deterministic prompt capability must be restored or explicitly retired

**Severity: pre-pilot** — a capability regression, not a safety one.

PR #74 replaced `prompts: promptsRaw` with `prompts: []`. But `_reasonedPrompts` has a
**deterministic branch** at `server.js:4094`:

```js
if (!ai.enabled()) return cands.slice(0, 4);
```

It was already a working no-LLM leader capability built from grounded `_promptCandidates`
(`server.js:4011`). The §19 doc addendum describes this as *"optional enrichment… not invoked"*,
which is inaccurate for the deterministic branch — it was removed, not skipped.

### Required

1. **Audit `_promptCandidates` for person-level content.** It reads `getVisibleUserIds` (`:4014`) and
   builds candidates from assessment outcomes and development themes. Determine per candidate kind
   whether it names or implies an individual.
2. **Then choose, and say which:**
   - **Restore** the deterministic branch for candidate kinds that are aggregate-safe; or
   - **Retire** it explicitly, correcting the doc addendum to say the capability was removed on
     privacy grounds and naming which candidate kinds failed the audit.

- **NON-GOALS:** restoring the LLM ranking call; adding new candidate kinds.
- **STOP IF:** the audit shows every candidate kind is person-level — report; retirement is then
  correct and the doc must say so.
- **DONE WHEN:** the doc addendum matches what the code does, and the reason is on the record.

---

## C9 · The severed leader feedback loop must be documented

**Severity: documentation** — no code change required.

`/api/intelligence/act` (`:4290`), `/outcome` (`:4317`) and `/notice-feedback` (`:4352`) remain
server-side with **zero frontend callers** after PR #74 removed `intelAct`, `intelDismiss`,
`intelOutcome` and `intelNoticeFeedback` from `js/app.js`.

`_webIntelligence` gates on `confidence.shouldSurface(reliabilityByType[type])`, so the output now
depends on a signal whose only input path was deleted. `shouldSurface(undefined)` returns `true`
(`ai/confidence.js:35`), so nothing breaks — the loop simply never learns.

**Required:** record in the PR description and in `web-semantics…` §19 that the Confidence Engine's
leader-feedback path is severed, that the gate is consequently inert, and whether a replacement
surface is planned. **Do not re-add the old buttons** — they were person-level by construction and
their removal was correct.

---

## Sequencing

| Order | Corrections | Why |
|---|---|---|
| 1 | **C5** | the suite must be able to detect regressions before anything is changed |
| 2 | **C1, C2, C3** | the three privacy/epistemic blockers; C2 and C3 touch the same function |
| 3 | **C4** | independent of the above; item 3 (derive `perspective`) touches `toInsight` |
| 4 | **C6** | independent |
| 5 | **C7** | blocked on the founder |
| 6 | **C8, C9** | audit and documentation |

C5 first is the one non-obvious ordering decision, and it is deliberate: fixing C1-C3 against a suite
with six green-by-construction assertions would produce green with no evidence.

## Global stop conditions

- Any regression outside the named suites.
- `pilot-loop-smoke` moving off 28/1.
- Any correction requiring a change to `ai/contribution.js`, `ai/diagnose.js` or `ai/org-graph.js` —
  those are epistemic modules and are out of scope here.
- Reaching C7 without a founder answer.

## Completion criterion for the PR

`npm test` green; `pilot-loop-smoke` 28/1; every new assertion demonstrated red under a targeted
mutation; C7 answered and recorded; the doc addendum matching the code. Then, and only then, request
re-review.
