# Peer Web semantics — edge classes, not a wider scope

**Status:** adjudication. **Nothing implemented.** No production code changed. No executable test
modified.
**Stage D** of the autonomous architecture loop. Preceded by `96098fa` (Self and Web orchestration).
**Written against:** `96098fa`.

**The question:** the founder asks whether *peers at the same structural level* should be part of a
node's organisational Web, so that a Soccer Coach can learn *"recovery outcomes are improving across
two peer programmes"* without being able to inspect a Rugby player's evidence.

---

## 1 · Verdict

# REVISE — but not by widening `visibleScope`

**Peers must not enter the Web scope set.** They must be a **separate edge class** that grants
*aggregate eligibility only* and is structurally incapable of reaching evidence.

Two reasons, the first decisive:

**D-1 · Widening `visibleScope` would contradict a law stated in three modules.** Branch isolation
is not an incidental property; it is written down as a rule in three separate places:

- `ai/org-routing.js:16` — *"BRANCH ISOLATION. A leader's rollup covers only their own subtree; a
  sibling branch's items never appear."*
- `ai/org-routing.js:79` — *"A sibling branch never appears. Counts + labels only."*
- `ai/org-answer.js:6` — *"the asker's branch of the information web (they never see a sibling…)"*

and asserted executably at `scripts/org-graph-smoke.js:33` and `:44`. `visibleScope` feeds
`canSee`, which feeds `_orgAdmissibleEvidence` (`server.js:9830`) — **the evidence pool**. Adding
peers there grants evidence access by construction, which is precisely what the founder says must
not happen.

**D-2 · The founder's own requirement separates the two concepts.** *"PEER AWARENESS does NOT equal
PEER PERSON-LEVEL DISCLOSURE."* A single `visibleScope` set cannot express that distinction, because
it has exactly one consumer semantics: admissibility. **The requirement is therefore not a wider
scope — it is a second scope with different powers.**

> **Revised law L-W1′ (proposed).** The Web is not one set. It is **three scopes with different
> powers over the same graph**, plus object bridges that are not scopes at all.

---

## 2 · THE FOUR EDGE CLASSES

| Class | Question | Members | Grants | Never grants |
|---|---|---|---|---|
| **REASONING WEB** | what territory may inform my reasoning | self + direct parents + descendants | evidence admissibility via `canSee` | anything lateral |
| **COMPARISON WEB** | which units are structurally comparable to mine | sibling nodes under a shared parent meeting a similarity test | **eligibility to be included in an aggregate I may read** | evidence, identity, membership, counts below floor |
| **DISCLOSURE SCOPE** | what may be rendered to this reader | derived from audience + floors | rendered text | anything the two above excluded |
| **OBJECT BRIDGE** | am I a participant in this object | explicit `participantIds` / node membership | that object and its own record | any node in any Web |

Only **REASONING WEB** is passed to `canSee`. That single constraint is what makes the design safe,
and it should be an executable invariant rather than a convention.

### The type-level guarantee

> **L-P1 (proposed).** `comparisonScope()` and `reasoningScope()` return **distinguishable types**,
> and `canSee` accepts only the latter. A comparison scope must be structurally incapable of
> reaching the evidence pool — not merely never passed to it by current callers.

In practice: `reasoningScope` returns `string[]` as today; `comparisonScope` returns
`{ __comparisonOnly: true, nodeIds: string[] }`, and `canSee` rejects any argument carrying that
brand. A future contributor who unions them gets a failure, not a leak. This is cheap and it removes
the entire class of mistake.

---

## 3 · THE COMPARISON WEB

### Membership

A node `P` is a comparison peer of node `N` when **all** hold:

1. `P ≠ N` and `P` shares at least one direct parent with `N` (true siblings only — never cousins,
   never a second level).
2. `P` is **structurally comparable** to `N` (§4).
3. `P` has enough evidence to clear the disclosure floors on its own (`web-semantics` §23).

Condition 1 keeps it bounded: peers of peers are not peers, so the relation does not transit. That
is the property that stops a coach reaching the whole organisation through two hops.

### Powers

A comparison peer contributes **only** to an aggregate that has already cleared every floor. It
contributes:

- **no** evidence to `_orgAdmissibleEvidence`
- **no** person to `getVisibleUserIds`
- **no** node to `reasoningScope`
- **no** routing target
- **no** membership, identity or roster entry

> **L-P2 (proposed).** A comparison peer contributes **statistics, never records**. The only thing
> that may cross a comparison edge is a number that has already cleared the cohort floor for its
> disclosure shape, computed over a union of peers, and carrying no node identity.

### The subtlety that decides the whole design

**Node-level aggregates can identify people.** A node usually has one leader. *"Programme X's
recovery outcomes are declining"* is, to anyone who can read the org chart, a statement about a
**named person's work**. Cohort floors count *members*, so they do not protect the leader at all.

The founder's own example sentence — *"recovery outcomes are improving across two peer programmes"*
— is safe **only because it does not say which two**. With three sibling programmes and a coach who
knows all of them, "two of three improving" plus their own knowledge is close to identifying the
third.

> **L-P3 (proposed).** A comparison aggregate must span **at least `MIN_PEER_NODES` peer nodes** and
> must **never name or rank the nodes it spans**. Where fewer than `MIN_PEER_NODES` comparable peers
> exist, the aggregate is withheld entirely — it is not narrowed, not fuzzed, and not reported with
> a caveat.

`MIN_PEER_NODES` has no repository precedent. The existing floors (`MIN_COHORT = 2`,
`MIN_SEG = 4`) govern *people*, not *nodes*, and reusing them here would be the arbitrary-threshold
mistake the earlier passes avoided. **Recorded as founder decision D-P1 (§7).**

---

## 4 · STRUCTURAL COMPARABILITY

Deterministic, four features, no library — the Level-2 technique identified in Stage B §3 as the one
worth adopting.

| Feature | Source | Why it matters |
|---|---|---|
| shares a direct parent | `graph.parentsOf` | organisational peerhood, not similarity-by-accident |
| similar depth | `ancestors().size` | a squad and a department are not peers |
| similar membership size | `memberIds.length`, within a ratio band | a 4-person unit and a 60-person unit do not compare |
| similar evidence density | active envelopes per member | prevents a data-rich unit dominating a data-poor one |

All four are computable from `orgNodes` plus a count over `evidenceLog`. **No graph library, no
embeddings, no learned similarity** — consistent with L-B1 and L-B2.

> **L-P4 (proposed).** Comparability is deterministic and inspectable. A person shown a peer
> aggregate must be able to be told *why* those units were comparable, in one sentence, from the
> four features. If it cannot be explained, it must not be shown.

---

## 5 · EXTERNAL PATTERNS — relationship scope vs permission

The distinction the founder is reaching for is well-established, and every system that has met it
solved it the same way: **separate the relation from the permission it grants.**

| System | The pattern | IntelliQ analogue |
|---|---|---|
| **Zanzibar / SpiceDB** | a relation tuple is not a permission; permissions are *computed* from relations by explicit rules. `member` and `viewer` are different, and one does not imply the other | REASONING vs COMPARISON are two relations over one graph; only one computes to evidence admissibility |
| **AWS Cedar** | typed principals/resources/actions; policies are analysable, so "can a peer ever read evidence?" is answerable statically | the branded return type (L-P1) is the poor-man's version: a type error where Cedar gives a proof |
| **OPA** | decisions carry reasons; a denial is explainable | L-P4 — a comparison must be explainable, and GW-10 asks the same of `canSee` |
| **Palantir Ontology** | link types have their own permissioning, distinct from object permissioning | a comparison edge with strictly fewer powers than a membership edge |
| **Glean** | relevance ranking is separate from access filtering; a document can be *relevant* and *unreadable* | exactly peer awareness without peer disclosure |

**Glean's split is the closest fit and worth stating plainly:** relevance and access are different
questions, and conflating them is the standard enterprise-search failure. IntelliQ has already
separated them once (Web scope vs governance, `web-semantics` §3); the comparison Web is the same
separation applied laterally.

None of these justifies adopting a technology. All four confirm the shape.

---

## 6 · WHAT CHANGES, AND WHAT DOES NOT

### W-3 is unaffected

The W-3 contract (`docs/briefs/w3-w4-implementation-contract.md` §2) stands **exactly as written**:
leader gains direct parents, no sibling expansion, one loop body, one amended assertion, plus the
`top_leader` role fix. The comparison Web is **additive and separate** — it is not a revision of
W-3 and must not be bundled into it.

> **Sequencing law.** The comparison Web must not be implemented in the same change as W-3. W-3
> changes what `visibleScope` returns and every consumer inherits it; adding a second scope class in
> the same change makes the blast radius unmeasurable.

### What the founder gets

| Founder requirement | Delivered by | Status |
|---|---|---|
| "Recovery outcomes improving across two peer programmes" | comparison aggregate over ≥ `MIN_PEER_NODES`, floors applied, nodes unnamed | new — needs D-P1 |
| Coach cannot inspect a Rugby player's evidence | comparison edges never reach `canSee` (L-P1) | by construction |
| Peer awareness ≠ peer disclosure | four edge classes | the whole design |
| No unrestricted lateral person-level access | L-P2, L-P3 | by construction |

---

## 7 · FOUNDER DECISIONS

### D-P1 · How many peer nodes must an aggregate span?

**Scenario.** A Director of Sport oversees Soccer, Rugby and Netball. The Soccer Coach is shown
*"recovery outcomes are improving across peer programmes."* With three siblings, that sentence plus
the coach's own knowledge of their own programme narrows the subject to two — and each programme has
one identifiable leader.

- **Option A — `MIN_PEER_NODES = 2`.** Matches `MIN_COHORT`'s spirit ("one is not a cohort").
  *Against:* at two peers, a coach who knows one programme has effectively identified the other.
- **Option B — `MIN_PEER_NODES = 3`.** The smallest number at which excluding your own knowledge
  still leaves genuine ambiguity. *Against:* many organisations have only two or three siblings, so
  peer intelligence would rarely fire at Falcon.
- **Option C — no fixed count; require that the aggregate remains true if any single peer is
  removed.** A leave-one-out stability test rather than a threshold. *For:* principled, adapts to
  structure, and refuses exactly the cases where one unit is driving the signal. *Against:* harder
  to explain in one sentence, which brushes against L-P4.

**Recommendation: C, with B as the floor.** Require ≥3 comparable peers *and* leave-one-out
stability. This is the one place a threshold alone is insufficient, because the risk is not cohort
size but *whether one identifiable unit is carrying the claim*.

**Blocks:** any implementation of the comparison Web. **Does not block:** W-3, W-4, the pilot.

### D-P2 · Is a node leader's identifiability a person-level disclosure?

If a node has one leader, a statement about that node is a statement about that person's work.
Today's floors count members and would not notice.

- **Option A — treat node-level statements as person-level when the node has one leader**, and apply
  `audienceSafe`-grade projection to them.
- **Option B — accept it.** A leader's programme outcomes are legitimately organisational
  information, not personal information, and shielding them would make organisational learning
  impossible.

**Recommendation: B, with L-P3's no-naming rule as the mitigation.** A leader's *programme* is a
legitimate object of organisational attention in a way a member's *wellbeing* is not — but the
aggregate should still never name or rank the units, so the observation stays about the pattern
rather than about the colleague.

**Blocks:** the comparison Web's phrasing contract.

---

## 8 · TESTS TO WRITE BEFORE ANY IMPLEMENTATION

| Id | Invariant | Fails today? |
|---|---|---|
| T-P1 | `canSee` rejects a comparison-scoped argument (brand check, L-P1) | n/a — not built |
| T-P2 | A comparison peer's evidence is absent from `_orgAdmissibleEvidence` for every actor | passes trivially today; must hold after |
| T-P3 | A comparison peer's members are absent from `getVisibleUserIds` | passes today; must not regress |
| T-P4 | Peerhood does not transit — a peer of a peer is not a peer | n/a |
| T-P5 | An aggregate spanning fewer than `MIN_PEER_NODES` is withheld entirely, not narrowed | n/a |
| T-P6 | A comparison aggregate names no node and ranks no node | n/a |
| T-P7 | Leave-one-out: removing any single peer does not flip the aggregate's direction | n/a — D-P1 option C |
| T-P8 | Comparability is explainable from the four features | n/a |

**T-P2 and T-P3 should be written now, before the comparison Web exists.** Both are currently true,
neither is arbitrated, and they are exactly the properties a future peer implementation would
silently break.

---

## 9 · DEFERRED

- Any implementation of the comparison Web before D-P1 and D-P2 are answered.
- Cross-parent comparability ("which units anywhere resemble mine") — unbounded, and the bounded
  sibling version has not yet proved useful.
- Learned or embedding-based similarity — L-B1.
- Peer intelligence in the pilot. Falcon's value comes from within-branch intelligence; peer
  comparison is a second-organisation capability and should wait for evidence that anyone wants it.
