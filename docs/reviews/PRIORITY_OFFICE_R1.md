# Priority Office — foundation, round 1

**Base:** `claude/cross-evidence-r2` @ `94c868341a219fec18b9f2d4876582cae23dfec4`
**Branch:** `claude/priority-office-r1`

---

## What was built, and where it went

**Nothing new was created that already had an owner.** `ai/priority-office.js` already existed and
already ranked — `normalizeItem`, `_score`, `buildQueue`, `stamp`, used by
`ai/scoped-intelligence-packet.js` and by `server.js:15241`. What it did **not** have was any
notion of a canonical object, a relationship, or a reason.

So the attention desk is a **second window on the same module**, not a second Priority Office:

```
ai/priority-office.js
  buildQueue(...)      ← existing: ranks already-derived FEED ARTIFACTS   (untouched)
  attentionQueue(...)  ← new:      ranks CANONICAL OBJECTS, with reasons
```

A separate module would have been a second answer to "what matters", and two answers to that
question is the drift this codebase has spent the week correcting.

| Piece | Where | Why there |
|---|---|---|
| `attentionQueue` | inside `ai/priority-office.js` | one Priority Office |
| `_declareFocusRelation` | beside the other Focus owners in `server.js` | it is a field **of a Focus**, not a new store |
| `declare_focus_relation` | `ai/composer-actions.js`, `confirmation: true` | the governed suggest-then-confirm path already exists |
| `GET /api/me/attention` | `server.js` | the retrieval contract |
| `POST /api/objects/focus/:id/evidence-relation` | `server.js` | the direct control |

---

## The candidate model

Candidates are canonical objects — `inquiry`, `focus`, `high`, `low` — addressed as `kind:id`,
the same ref `about` binds threads by and the shelf files by.

`attentionQueue` takes **objects and edges the caller has already authorised**, plus `seen`
(when they last looked), `marked` (what they said is important) and `currentOriginCount` — the
kernel's own function, passed in rather than re-implemented, so this desk cannot invent a second
definition of independence.

It takes **no userId, no org and no store** (`PO-B1`). It cannot decide access even by accident.

---

## The ranking law — a declared sequence, not a score

```js
const ATTENTION_REASONS = Object.freeze([
  'explicitly_prioritised',         // a human said so. Nothing outranks that.
  'contradiction_added',            // an account disagreeing arrived since they looked
  'new_independent_evidence',       // the count of CURRENT INDEPENDENT ORIGINS grew
  'unresolved_after_focus_outcome', // work closed out; the question it addressed is still open
  'outcome_missing',                // a focus has run 14 days with nothing recorded
  'related_state_changed',          // something it is connected to moved
]);
```

**The order of that array IS the ranking law.** Ties break on when the thing actually changed, then
on the canonical ref, so identical inputs always produce an identical order.

There is **no weighted score** — asserted by `PO-G3`, which requires the emitted order to match the
declared sequence and forbids a `score` or `weight` field on any row. A weighted sum is a number
nobody can argue with and everybody has to trust; a declared list is something a founder can read
and disagree with.

The one tuned number, `OUTCOME_OVERDUE_MS = 14 days`, is a named constant with its reasoning beside
it — the founder's review rhythm — so it is a number somebody can change on purpose.

---

## Deterministic reason codes

Every row carries one, from the closed vocabulary (`PO-G1`), plus **every other reason it had, each
with its own detail** (`PO-G2`). Details are counts and refs only — `{ originsBefore: 1,
originsNow: 2 }`, `{ focus: 'focus:f1', outcome: 'helped' }`, `{ openForDays: 40 }`. No statement
travels into a ranking row (`PO-J2`).

The vocabulary is enforced **at the writer**, and mutation `P3` proves it is load-bearing: making a
call site emit `looks_risky` caused the edge to be **discarded**, turning `PO-F3` red.

---

## Two real defects this pass found in its own work

Both were caught by mutation, not by review, and both are worth recording.

**1. The historical origin count retroactively erased history.** To decide whether independent
evidence had *grown*, I filtered signals to those dated before the last look and counted them with
**today's** status. A record that was standing when the person last looked, and has since been
corrected, therefore read as though it had never existed — so the count appeared to grow and **a
plain correction surfaced as new independent evidence.** A correction is not news.

Fixed by restoring the historical view: a signal superseded by something that arrived *after* the
last look was still standing at the last look, and is counted as active for that comparison only.
Mutation `P2` reverts it and `PO-D1` goes red.

**2. Secondary reasons lost their detail.** The first version kept only the winning reason's
detail and reduced the rest to bare words — so when an object had two reasons, the answer to
"which focus, and what did they record" was silently discarded while the row still looked
complete. Each reason now carries its own detail. `P8` proves it.

I also rewrote `PO-F2`, which had asserted against the row's stringified blob and would have stayed
green if the detail moved anywhere in the row, or was carried by an unrelated reason.

---

## Privacy proof

The order is enforced by construction:

```
_allObjectsFor(code, userId)     ← authorise: the same gate every object surface uses
        ↓  (only that set is passed on)
attentionQueue({ objects, edges })  ← rank: takes no identity, no store
```

- `PO-A1` — an object the caller did not pass in never appears, however many edges point at it.
- `PO-A2` — **and it cannot influence the order of what is visible either.** This is the assertion
  the brief specifically asked for: no hidden object may shift a visible ranking in a way that
  leaks its existence.
- `PO-A4` — over HTTP, somebody from another squad gets a list that names none of it.
- `P9` — building the list without the gate turns `PO-A4` red.
- `PO-K3` — declaring a relation against evidence you cannot see is **404, not "wrong ref"**,
  so the route cannot be used as an existence oracle. `P11` proves it.

---

## Origin-independence proof

- `PO-C1` — three more records from **one account already present** raises nothing. `P1` (count
  records instead of origins) turns it red.
- `PO-C2` — the count comes from `diagnose.currentOriginCount`, the kernel's own function, passed
  in rather than reimplemented.
- `PO-D1`/`PO-D2` — a correction is not fresh support, with the historical-status fix above.

---

## The declared Focus relation

**Founder law, implemented exactly:** evidence relative to a Focus is **declared, never inferred**.

- Vocabulary: `supports`, `undermines`, `unclear`. Closed, enforced **at the writer**
  (`_declareFocusRelation`), so a proposal cannot smuggle a fourth word in from elsewhere
  (`PO-K10`, `P10`).
- **Two doors, one owner.** The direct control
  (`POST /api/objects/focus/:id/evidence-relation`) and the governed composer action
  (`declare_focus_relation`, `confirmation: true`) both end at `_declareFocusRelation`, which is
  the only thing that writes (`PO-K8`, `P13`).
- **Nothing is stored until confirmation** on the model-suggested path (`PO-K9`, `P14`).
- **It lives on the Focus** — `focus.evidenceRelations` — because it is a fact about that Focus.
  Not a relationship table, not an evidence record, not a store.
- **Changing your mind supersedes and keeps the earlier call** (`PO-K7`, `P12`), the same way a
  corrected signal stays in the record.
- The note says what it is: *"It says how you read it, and it changes nothing about how certain the
  evidence itself is."* (`PO-K5`)

**Why the inference is forbidden, written into the code so nobody re-derives it as an
optimisation:** a signal's `direction` is declared *about an Inquiry* — whether the thing being
asked about is getting better or worse. Whether that same record supports or undermines *what a
Focus is trying to do* is a different question. Evidence that a problem is worsening might mean the
work is failing, or that it is aimed at the right thing and started late. Reading one off the other
would be the sentiment lexicon returning through a side door.

---

## A → B → what next, walked on real data

Against the Alma seed (28 players, 54 pieces of evidence), as a real player. **10/10.**

| Step | Result |
|---|---|
| **A** — an open question in their record | present |
| **→ Focus** started to work on it | records what it addresses |
| **→ declared** how one piece of evidence stands to the work | `supports`, by the person |
| **→ outcome** recorded | through the canonical Focus owner |
| **→ "what should I look at next?"** | a lawful ordered set |
| — | the still-open question the work addressed **is in it**, with `unresolved_after_focus_outcome` |
| — | every row has a reason code from the closed vocabulary |
| — | nothing is a score, nothing predicts |
| **→ asked in the composer** | answers, composer state never silent |

---

## Mutations

Sixteen, each breaking a production line; stdout and stderr both read; a crash with no FAIL line is
never counted.

| # | Mutation | Red |
|---|---|---|
| P1 | count records instead of independent origins | `PO-C1` |
| P2 | compute the historical count with today's status | `PO-D1` |
| P3 | emit an invented reason code | `PO-F3` — the code was **discarded**, proving the guard |
| P4 | order by a hidden numeric score | `PO-G3`, `PO-I1`, `PO-L2` |
| P5 | carry the evidence statement into a ranking row | `PO-J2` |
| P6 | let an unauthorised object enter through an edge | `PO-A1`, `PO-A2` |
| P7 | stop noticing the half-shut loop | `PO-F1`, `PO-F2`, `PO-L1`, `PO-L2` |
| P8 | drop each reason's own detail | `PO-F2` |
| P9 | build the list without the authorisation gate | `PO-A4` |
| P10 | accept any word as a relation | `PO-K2`, `PO-K10` |
| P11 | allow a relation against unseen evidence | `PO-K3` |
| P12 | overwrite an earlier call instead of superseding | `PO-K7` |
| P13 | bypass the canonical owner in the confirm branch | `PO-K8` |
| P14 | let the relation be written without confirmation | `PO-K9` |
| P15 | stop forbidding the model from adding a candidate | `PO-H1` |
| P16 | stop forbidding prediction, causation and person-rating | `PO-H3` |

**16 of 16 bit.** P3 required a second attempt: opening the vocabulary guard alone was a no-op
(PROTOCOL lie #9), because nothing emits an invalid code today. Making a call site emit one proved
the guard is load-bearing.

---

## Test results

```
npm test  →  ✓ TRUTH LAYER GREEN — all sources parse, all suites pass.   (exit 0)
```

| Suite | Result |
|---|---|
| `priority-office-attention-smoke` (**new**, registered) | **38** passed |
| A → B → next walk on the Alma seed | **10** passed |
| `cross-evidence-smoke` | 39 |
| `focus-ownership-parity-smoke` | 23 |
| `origin-correction-smoke` / `origin-independence-smoke` | 51 / 14 |
| `composer-actions-smoke` | 45 |
| `forum-smoke` | 71 |
| `turn-grounding-smoke` | 28 |
| `epistemic-invariants-smoke` | 16 |
| `reachability-smoke` / `deadcode-scan` | 9 / 12 |

**One guard went red and was answered honestly, not worked around.** `reachability-smoke` flagged
both new routes as orphans, because no client screen calls them. They are declared in
`BACKEND_ONLY` with reasons that say exactly that: the attention list **does** reach the user today
(the composer assembles it server-side, so "what should I look at?" is answerable in conversation),
and the model-suggested half of the declared relation **is** reachable as a confirmed composer
action — but neither has a screen yet, and the brief asked for a retrieval contract rather than a
dashboard. Faking a caller to silence the guard would have been the wrong fix.

---

## What remains R&D

1. **A surface.** Both routes want a door when there is a screen for them. Today the capability
   reaches people through conversation only.
2. **`gpt/cross-evidence-pilot`'s priority-inheritance rule** — *a related artifact may inherit the
   highest existing priority among its related visible artifacts, and never manufacture one higher
   than all its inputs.* Still unused, still sound, and it belongs on the **feed** side
   (`buildQueue`), not this one.
3. **Using the declared relation in ranking.** Now that `supports`/`undermines` can be recorded, a
   later pass could surface "you marked two pieces of evidence as undermining this work". I did not
   build it: almost no relations exist yet, and a reason code that fires for nobody is untestable.
4. **Read receipts.** `?since=` makes the caller supply "when I last looked". A real
   last-seen store is a design decision about whether IntelliQ remembers being read.
5. **Team-level attention.** Everything here is per-reader through `_allObjectsFor`, which already
   includes squad objects. A coach-shaped view is a different question about aggregation.

---

SCOPE FIRST: **PASS**
NO SECOND STORE: **PASS**
DETERMINISTIC ELIGIBILITY: **PASS**
EXPLAINABLE PRIORITY: **PASS**
NO PERSON SCORING: **PASS**
NO PREDICTION: **PASS**
DECLARED FOCUS RELATION: **PASS**
COMPOSER RETRIEVAL: **PASS**
A→B→NEXT LOOP: **PASS**
npm test: **GREEN**

READY FOR PILOT PRIORITY SURFACING: **YES** — as a conversational capability. It needs a screen
before it is a *visible* surface, and that is UI work, not law work.

Not merged.
