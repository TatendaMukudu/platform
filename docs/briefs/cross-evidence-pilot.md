# Pilot brief — cross-evidence context without packet silos

**Base read:** `main` @ `5683df3de63d8daa54d345ab39fa262db1908d2e`

## Founder direction

IntelliQ must treat a human, team and organisation as connected systems rather than isolated Focus/High/Low/Inquiry folders. A weak signal in one object may become important when related evidence strengthens elsewhere. This must be proven at pilot scale using the existing generic architecture so later expansion to overlapping teams, roles, organisations and unions does not require a second intelligence system.

A second founder hypothesis should be made testable, not encoded as truth:

> Better preparation may improve outcomes. Preparation may be reflected in how meaningfully a person/team engages with relevant material, questions, possible solutions, practice and review before an outcome.

The kernel must never turn this into the causal claim “preparation prevents poor performance.” It should preserve it as a hypothesis that can gain or lose support from longitudinal evidence and outcomes.

## Goal

For pilot, make related authorised evidence able to change what IntelliQ *attends to* across existing objects without:

- creating another packet system,
- copying evidence between objects,
- letting relevance become authorisation,
- letting an LLM infer direction or permission,
- merging distinct concepts merely because their text sounds similar,
- increasing epistemic confidence because the same origin appears in several places,
- or hard-coding football logic.

The user-facing effect should be simple:

- IntelliQ starts from the current object/context.
- It can notice that related evidence elsewhere materially changes the importance of what is being discussed.
- It can explain the connection in domain-appropriate language.
- It can ask whether the person wants to widen the view when private/cross-context material would be needed.
- Focus, High, Low and Inquiry remain different projections over one evidence system, not separate truth stores.

## Reuse before adding anything

The repository already contains the right owners. Strengthen them; do not create parallel machinery.

1. `lib/evidence.js` + canonical evidence stores own evidence/provenance.
2. `ai/diagnose.js` owns epistemic state, origin identity/counting and inquiry truth.
3. `ai/agents.js` already owns the Analyst “connect” stage and domain-free cross-signal reasoning.
4. `ai/intelligence-feed.js` is the one normalisation desk for already-derived artifacts.
5. `ai/scoped-intelligence-packet.js` already performs organisational scope filtering before Priority Office ranking.
6. `ai/org-graph.js` owns organisational visibility/routing.
7. `ai/priority-office.js` owns what deserves attention.
8. `ai/retrieval.js` owns authorised grounding.
9. PR #84’s composer path owns conversational interpretation and should consume the result; it must not become a second relevance engine.

The current packet module is internal infrastructure, not a product concept. Do not add packet selection/loading UI. If the name survives internally, it remains a bounded scoped projection only.

## Core law: scope first, relation second

Cross-evidence expansion must never run over data and then decide what a viewer may see.

Required order:

```text
canonical evidence / derived artifacts
        -> authorisation + scope
        -> related-evidence expansion over ONLY the authorised set
        -> priority office
        -> kernel-safe explanation/context
        -> composer / UI
```

This preserves AGENTS.md law: relevance is not authorisation.

## Pilot implementation slice

### 1. Add one pure relationship helper, not an engine

Add a small pure module such as `ai/evidence-neighborhood.js`.

Its job is only:

> Given already-authorised, already-normalised artifacts, identify explicit relationships that mean evidence elsewhere may materially affect attention here.

It must not read storage, call AI, set permission, set confidence, infer sentiment, or mutate an Inquiry/Focus.

It should accept normalized artifacts and return relationship artifacts/references.

### 2. Relationships allowed in pilot

Use deterministic relationships only. Prefer strongest/most explicit first:

1. **same canonical evidence ref** — two projections cite the same evidence;
2. **same canonical concept/type id** — producers explicitly emitted the same typed concept/pattern;
3. **explicit object relationship** — e.g. Focus addresses an Inquiry/High/Low, or an outcome belongs to that Focus;
4. **explicit correction/supersession lineage** — never treat historical copies as new support;
5. **explicit source-to-outcome relationship** — an Action/Focus outcome refers back to the thing it was trying to address.

Do NOT use:

- embedding similarity,
- raw-text similarity,
- keyword/sentiment matching,
- an LLM saying two concepts “feel related”,
- shared human-readable labels as identity.

Related-but-not-identical concepts can be added later only through governed canonical concept relationships. Pilot does not need a grand ontology rewrite.

### 3. Preserve relationship metadata through the existing feed

`ai/intelligence-feed.js` currently normalizes useful fields but should be extended only as necessary to retain bounded reference metadata such as:

- `objectRefs`
- `conceptRefs`
- `evidenceRefs` (already present)
- optional `contextRefs` if a current producer already has a canonical context identity

These are refs/ids only, never copied raw evidence.

Do not let producers set `safe`, permission or confidence for the relationship helper to trust.

### 4. Integrate after scope filtering, before ranking

The best existing insertion point is inside the current scoped-intelligence path:

```text
visibleItems = feedItems.filter(canUseItem(...))
related = evidenceNeighborhood.connect(visibleItems, currentObject?)
packetItems = visibleItems + related
priority.stamp(...)
```

The helper therefore cannot make inaccessible evidence visible because it never receives inaccessible evidence.

Do not make a second “cross evidence packet.”

### 5. What a relationship artifact may claim

A relationship artifact is about *attention*, not truth.

Allowed examples:

- “Related evidence elsewhere is making this worth another look.”
- “This Focus is connected to an Inquiry that has received newer evidence.”
- “The same underlying evidence is affecting more than one current object.”
- “This looks more important in the wider authorised picture than it does in this Focus alone.”

Forbidden:

- “These two issues have the same cause.”
- “This proves confidence is the problem.”
- “Three contexts means confidence is higher.”
- any numerical human score.

The relationship helper must not raise kernel confidence. It may affect **attention priority** only according to deterministic, bounded rules.

### 6. Pilot priority rule

For the first slice, keep the rule intentionally conservative:

- A related artifact may inherit the **highest existing priority** among its related visible artifacts.
- It must never manufacture a priority higher than all of its inputs merely because several items exist.
- If a low-priority current item is linked to a high-priority visible item elsewhere, the connection can surface at high priority because the high-priority fact already exists.
- Repetition by the same origin does not increase confidence or priority by count.

This gives the founder’s desired behavior — “small here but serious elsewhere should come into the light” — without inventing a new significance score.

### 7. Focus / High / Low / Inquiry continuity

Pilot must prove at least these explicit chains:

```text
Inquiry -> Focus created to address it -> Focus outcome -> Inquiry can read the outcome as governed evidence through existing boundaries
```

and

```text
High/Low projection -> source Inquiry/evidence refs -> related evidence changes -> projection can be surfaced as needing renewed attention
```

PR #84 already strengthens Focus source/address references and composer continuity. Reuse those refs. Do not store a copy of the conversation or Inquiry inside the Focus.

### 8. Composer behavior

On the PR #84 path, the composer should consume a bounded context result, not construct its own graph.

Default behavior:

- reason locally first;
- include related authorised items that could materially change the answer;
- explain why a wider item matters;
- never expose hidden source content;
- if widening requires private or other-context data not already authorised for this purpose, ask the person before widening rather than silently crossing scope.

No visible “packet” UX is required.

## Preparation hypothesis — pilot-safe version

Do not add a “preparedness score.”

Represent preparation as observable, typed events and outcomes already compatible with the kernel, for example:

- material encountered / assigned;
- meaningful engagement declared or recorded through an existing interaction boundary;
- question asked;
- solution/practice proposed;
- solution/practice attempted;
- review completed;
- outcome later recorded.

The meaningful unit is not “number of documents opened.” Activity volume is participation, not an outcome.

The system should be able to ask an empirical Inquiry such as:

> “When this person/team engages with relevant material, tests possible solutions and reviews them before the event, do later outcomes tend to improve relative to their own prior pattern?”

What counts as support must be longitudinal and provenance-backed. Counterexamples remain visible. No causal language unless a future governed method genuinely warrants it.

For the Alma pilot, a useful minimal loop is:

```text
meaningful material
    -> question / possible solution
    -> Focus or Action
    -> attempt
    -> outcome
    -> what-worked memory
    -> future preparation suggestion
```

This reuses Material, Inquiry, Focus/Action and Outcome rather than adding a Preparation subsystem.

## Tests required before merge

Add one new pure smoke suite and integration cases to existing relevant suites. Every assertion must be mutation-proven per `docs/reviews/PROTOCOL.md`.

Minimum golden cases:

1. A low-priority current artifact linked to a high-priority authorised artifact elsewhere surfaces the relationship at the existing high priority.
2. Two low-priority related artifacts do not manufacture high priority.
3. Same evidence referenced by two objects creates one relationship and never duplicates the evidence.
4. Same origin repeated through several signals does not create corroboration or higher confidence.
5. A sibling-branch/private artifact cannot influence or appear in a relationship because scope filtering occurs first.
6. A correction/superseded record does not count as an additional current relationship source.
7. Exact text similarity with no explicit canonical relationship creates no connection.
8. Focus -> Inquiry address relationship survives and is reference-only.
9. Focus outcome can feed the existing governed evidence path without the relationship helper mutating Inquiry truth directly.
10. Preparation activity volume alone cannot be labelled a positive outcome.
11. A preparation/outcome association is phrased non-causally and preserves counter-evidence.
12. Domain universality: identical typed inputs work for a football fixture, classroom assessment and business review without logic branches for any industry.

Add the new smoke suite to `scripts/test.js`; `npm test` is the arbiter.

## Explicitly out of scope for pilot

- Cross-organisation identity federation.
- Union/federation data sharing.
- A universal semantic ontology generated by the LLM.
- Automatic concept merging.
- A preparedness score.
- New leader access.
- Any weakening of cohort/privacy rules.
- Massive graph database migration.
- Replacing current Focus/High/Low/Inquiry objects.
- UI redesign.

Those should become scaling work only after the same laws are proven inside the pilot’s existing people/nodes/objects.

## Success condition

The pilot implementation is successful when this statement is mechanically true:

> An authorised piece of evidence can remain itself, preserve its provenance and origin, influence every explicitly related view that is allowed to use it, and cause IntelliQ to re-prioritise attention without being copied, leaked, double-counted, scored, or turned into a causal claim.

If that holds for one player, one coach, one Focus, one Inquiry and one related High/Low, the same law can be reused at larger graph sizes.

Repository truth beats this brief. If existing canonical owners already solve any part of this, strengthen/reuse them instead of implementing the wording literally.