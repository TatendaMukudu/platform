# Cross-evidence — round 2

**Base:** `claude/pilot-integration-r2` @ `1a6fffedcb77ceb6e4a4770beca7755440e83936`
(= PR #86 @ `9879dcb` + the pilot integration proof — one exact branch head, so no reconstruction
was needed).
**Branch:** `claude/cross-evidence-r2`
**Prior work read:** `gpt/cross-evidence-pilot` @ `9782f7f411ca9675959e6701369d0e4ae2ed1563`

---

## The finding this pass rests on

**The relationships were not missing. The reader was.**

Before writing anything I went looking for what the product already stores, and found that every
edge the founder asked for is already a field on a governed object:

| Edge | Field that already exists | Where |
|---|---|---|
| Focus → Inquiry / High / Low | `focus.addresses = { kind, id }` | `_personalFocusAddress`, `server.js:8598` |
| High / Low → Inquiry | `raw.inquiryId` | the projection carries it |
| Focus → its outcome | `focus.outcome`, `focus.resolvedAt` | `_recordPersonalFocusOutcome` |
| Focus → Conversation | `focus.source = { conversationId, messageIds }` | reference, never a copy |
| Evidence lineage | `signal.status`, `signal.supersededBy`, `originRef` | `ai/diagnose.js` |

And then I checked whether anything reads them back:

```
$ grep -n "addresses" server.js | grep -v addressesKind|addressesId
server.js:5805,5807,5818   ← forward only: focus → its source, in /api/me/focus/:id/source
$ grep "app.get.*related" server.js
(nothing)
```

`addresses` was read **forward only**, in one route. There was **no reverse traversal** and **no
related retrieval anywhere**. So the honest shape of this work is a **reader over existing
canonical fields**, not a relationship store. That is what got built, and it is why "no second
truth store" is structural here rather than a promise: there is nothing to keep in sync, because
nothing is written.

---

## What was reused, and what was rewritten

**Reused unchanged:** `_allObjectsFor` (the authorised object gate), `_createPersonalFocus` /
`_recordPersonalFocusOutcome` (the canonical Focus owners), `ai/diagnose.js` origin law,
`composer.buildContext`. No owner was duplicated.

**Read but not carried forward: `gpt/cross-evidence-pilot`'s `ai/evidence-neighborhood.js`.** It is
a competent pure helper, and it operates on the **feed/attention layer** — pairing
already-normalised feed artifacts by `evidenceRefs` / `conceptRefs` / `objectRefs` and inheriting
the higher priority. That is the right module for the *Priority Office* problem. It is not the
module for the founder's questions in this brief, which are about **canonical objects** — "which
Inquiry caused this Focus", "did the outcome move us toward B". Those are different layers, and
merging them would have produced one module answering two questions badly. Its priority-inheritance
rule is preserved for the Priority Office pass; see "What remains".

**Written new:** `ai/cross-evidence.js` (pure), one route, one composer context block.

---

## The canonical relationship schema

An edge is four fields and nothing else:

```js
{ from: 'focus:foc1', type: 'addresses', to: 'inquiry:inq1', basis: 'focus.addresses' }
```

`basis` names the field that produced the edge, so no edge can be mistaken for a judgement.
The vocabulary is **closed** and every type is an existing field read in one direction:

| Type | Existing field | Inverse |
|---|---|---|
| `addresses` | `focus.addresses` | `addressed_by` |
| `projected_from` | `raw.inquiryId` on a High/Low | `projected_to` |
| `shares_evidence` | identical `signal.ref` | symmetric |
| `supersedes` | `signal.supersededBy` | `superseded_by` |

Refs use the canonical `kind:id` shape — the same one `about` binds threads by and the shelf files
by. A second address format would be a second identity for the same object.

---

## Stopped on — the ontology question

**`informed_by`, `reinforced_by`, `contradicted_by` and `led_to` are NOT implemented, deliberately.**

The brief said to add only types "already justified by existing brief/product law", and to stop
and name the smallest founder decision rather than invent a schema. Working through them:

- **`led_to`** needs no decision — it is `addresses` read backwards, which is `addressed_by`, and
  it is implemented under that name.
- **`informed_by`** is `addresses` under a softer word. Two names for one edge is the drift this
  repository has been correcting all week.
- **`reinforced_by` / `contradicted_by`** are the real decision, and they are **not derivable from
  anything stored today**. A signal carries a *declared* `direction` (`improvement` / `decline` /
  `neutral`) and a `dissents` flag — but both are declared **about the inquiry**, not about whether
  the evidence supports or undermines *the direction a Focus is trying to move in*. Mapping one
  onto the other is an inference the product makes nowhere, and inventing it inside a retrieval
  layer would be an ontology change wearing a reader's clothes.

**The founder decision, stated as small as it goes:**

> When somebody records evidence on an Inquiry that a Focus is working on, does IntelliQ ask them
> whether it supports or undermines what the Focus is trying to do — as a **declared** field, the
> way direction already is? Or does it stay silent about that relationship?

Declared, it is a small addition to an existing capture path and the reader picks it up for free.
Inferred, it is a new epistemic claim and needs its own law. **I have implemented neither.**

---

## Scope and privacy behaviour

The order is enforced by construction, not by discipline:

```
_allObjectsFor(code, userId)        ← authorise: the same gate every object surface uses
        ↓  (only the authorised set is passed on)
crossEvidence.neighbourhood(...)    ← relate: takes no userId, no org, no store
        ↓
label the far side from the same authorised objects
```

`ai/cross-evidence.js` **takes no identity at all** — asserted by `CE-D2` against its function
signatures. It therefore cannot decide access even by accident, and an edge to an object the caller
did not pass in is unreachable rather than filtered (`CE-D1`).

Over HTTP, a reader who cannot open the object gets **404, not a filtered list** (`CE-D3`), and the
refusal names nothing that was there (`CE-D4`). Mutation `X10` — resolving the object without the
gate — turned both red.

---

## The A → B walkthrough, walked

A real player (Ravi Okonkwo) in a real Chromium at 390×844, against the Alma seed. **14/14.**

| Step | Proven |
|---|---|
| **A** — an open question in their record | `AB1`, and they can see what it rests on `AB2` |
| **→ Focus** started to work on it | records *what it addresses* `AB3` |
| "Why did we create this focus?" | answerable from the record `AB4`, in words not ids `AB5` |
| asked in the composer | answers, bound to this focus `AB6`, composer state never silent `AB7` |
| **→ outcome** recorded | through the canonical owner `AB8` |
| "Did this help?" | reads the outcome off the loop `AB9` |
| "What changed after?" | **a count of records observed since**, not a claim `AB10` |
| — | nothing predicts anything `AB11`; the loop names what it cannot say `AB12` |
| read from the other end | "what is being done about this question" `AB13` |
| — | no statement travelled inside an edge `AB14` |

**`observedSince` is the careful part.** It counts current records that arrived on the addressed
object *after* the outcome was recorded. It is named for what it is. It is not a claim the Focus
caused them, and the composer context says so in the same block: *"That is what has been observed
since; it is NOT evidence the focus caused it, and you must not say it was."* Product law 3 —
correlation is not cause — and the no-prediction law both survive.

When the loop is incomplete it says so rather than answering anyway: *"this focus does not say what
it was started to work on"*, *"no outcome has been recorded yet"*, *"nothing has been recorded on it
since the outcome"*.

---

## Proactive surfacing — the substrate only

Built: deterministic candidate identification (`edges`), a related-things retrieval
(`neighbourhood`), both over the authorised set only.

**Not built, on purpose:** ranking, autonomous action, automatic visibility expansion, automatic
Forum creation, prediction, or any path by which a model writes truth. Deterministic code decides
what is eligible; the model may only phrase it.

---

## Mutations

Twelve, each breaking a production line and requiring the **named** assertion to go red. stdout and
stderr both read; a crash with no FAIL line is never counted.

| # | Mutation | Red |
|---|---|---|
| X1 | stop reading `focus.addresses` | `CE-A1` (+8) |
| X2 | stop reading the High's `inquiryId` | `CE-B1`, `CE-B2` |
| X3 | carry the statement into the edge | `CE-C1`, `CE-C2` |
| X4 | return edges to objects never passed in | `CE-D1` |
| X5 | count shared origins per **signal** not per origin | `CE-E1`, `CE-E2` |
| X6 | let a superseded record cast a current vote | `CE-F2` |
| X7 | count records from *before* the outcome as movement since | `CE-G3` |
| X8 | stop naming where the loop is open | `CE-I1`, `CE-H4`, `CE-G7` |
| X9 | emit an invented type (`informed_by`) | `CE-A1` — the closed vocabulary **dropped it**, which is the guard proving itself |
| X10 | resolve the object without the authorisation gate | `CE-D3`, `CE-D4` |
| X11 | drop the loop from the response | `CE-G6` (+3) |
| X12 | stop telling the model a connection is not corroboration | `CC-1` |

**11 of 12 bit the assertion I named.** X9 bit `CE-A1` instead of `CE-B4`, and the reason is the
better outcome: with `informed_by` emitted, the `REL.includes(type)` guard **discarded the edge
entirely**, so the Focus→Inquiry assertion went red. The vocabulary is load-bearing, which is what
I was trying to establish.

### Two of my own assertions could not go red, and were fixed

- **`CE-E1`/`CE-E2` stood on a fixture too thin to test them.** The focus had one signal, so
  counting signals and counting origins agreed and X5 changed nothing. The fixture now carries
  **two signals from one account** — the only shape in which the corroboration error is visible.
  X5 then bit.
- **`CE-D2` was vacuous** (PROTOCOL lie #4). `X.edges.length === 1` is always `0`, because
  `Function.length` does not count parameters with defaults. Rewritten to assert the law it was
  reaching for: no function in the module takes a `userId`, an org code, or a request.

I also made `CE-H3`/`CE-H4`/`CE-G6`/`CE-G7` fail rather than throw on a missing loop, so X11 names
itself instead of killing the run (lie #8).

---

## Test results

```
npm test  →  ✓ TRUTH LAYER GREEN — all sources parse, all suites pass.   (exit 0)
```

| Suite | Result |
|---|---|
| `cross-evidence-smoke` (**new**, registered in `npm test`) | **39** passed |
| A → B browser walk | **14** passed |
| `focus-ownership-parity-smoke` | 23 |
| `origin-correction-smoke` / `origin-independence-smoke` | 51 / 14 |
| `composer-actions-smoke` | 45 |
| `forum-smoke` | 71 |
| `turn-grounding-smoke` (citations) | 28 |
| `chart-governance-smoke` | 34 |
| `library-door-smoke` / `shelf-http-smoke` | 21 / 33 |
| `material-accept-smoke` | 14 |
| `composer-degraded-http-smoke` | 13 + 2 |

---

## What remains for Priority Office

1. **The founder decision above** — declared support/contradiction, or silence.
2. **`gpt/cross-evidence-pilot`'s priority-inheritance rule**, which is sound and unused:
   *a related artifact may inherit the highest existing priority among its related visible
   artifacts, and may never manufacture one higher than all its inputs.* That is the "small here,
   serious elsewhere" behaviour without a new significance score.
3. **The insertion point** the brief names: `visibleItems → connect → packetItems → priority.stamp`,
   inside the existing scoped path. `ai/priority-office.js` and
   `ai/scoped-intelligence-packet.js` are both already on this tree.
4. **Ranking is not built and should not be** until 1 is answered — what deserves attention depends
   on whether evidence can be known to cut against a direction.

---

SCOPE FIRST: **PASS**
CANONICAL REFS: **PASS**
NO SECOND TRUTH STORE: **PASS**
FOCUS → INQUIRY: **PASS**
HIGH/LOW → FOCUS: **PASS** (via the Inquiry they were projected from, which is the edge that exists)
OUTCOME/LEARNING LOOP: **PASS**
PRIVACY: **PASS**
COMPOSER RETRIEVAL: **PASS**
A → B LOOP: **PASS**
npm test: **GREEN**

READY FOR PRIORITY-OFFICE FOUNDATION NEXT: **YES** — with one founder decision first
(`reinforced_by` / `contradicted_by`: declared, or silent).

Not merged.
