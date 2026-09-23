# IntelliQ layer-integrity audit — R1

**Status:** read-only architecture/invariant audit; no production semantics changed  
**Branch:** `codex/pilot-recovery-gate-r7`  
**Audited head:** `814cc39543300ee4cf051e291956815a70479ce9`  
**Purpose:** freeze confidence in the core layers before the remaining Methodical Assistant / Composer closure. This report is evidence, not permission to redesign working layers.

## Executive result

The core layered architecture is materially coherent and heavily guarded. The current repository registers **288 smoke suites** in `scripts/test.js`, and the preceding exact PR #90 head `cab88021de557205fda8e91c1f5f6e18beadeab4` completed the full Truth Layer green, including the PostgreSQL restart job and rendered Coach/player Chromium gates.

This audit found **no reason to redesign the core truth/privacy/authority/evidence layers before the Alma pilot**.

It did find two important non-blocking architecture/documentation seams:

1. `docs/ttd/layer-map.md` is stale about `opportunity`. It says D4 folds opportunity into High, while the current canonical owner `ai/intelligence-feed.js` explicitly maps `opportunity: null` with the newer rule that a possible direction is not evidence that something is already going well. Current code is safer and consistent with the newer Methodical Assistant law; the old document should not be treated as executable truth.
2. Scope ownership is safe but not fully consolidated. `scripts/scope-parity-smoke.js` deliberately inventories **76 current scope references** and documents remaining parallel mechanisms. This is controlled debt, not an observed pilot break. Do not “clean it up” before the pilot without a failing behavioral proof.

The weakest architectural area remains delivery/presentation, not truth. The pilot-critical delivery paths are now browser-gated, but not every historical route in the repository has a real-browser journey.

## Layer-by-layer audit

### L1 — Capture / evidence intake

**Owners:** `ai/capture.js`, `ai/intake.js`, adapters/connectors, canonical evidence store.

**Verdict: GREEN / freeze for pilot.**

Registered evidence includes capture/intake, evidence durability, origin independence/correction, onboarding evidence, attachment boundaries, import conflict, connector behavior, material classification, and cross-evidence tests.

Important proven invariants:
- one contribution does not become multiple independent origins;
- duplicate material cannot manufacture corroboration;
- correction/supersession survives persistence;
- attaching material is not itself contributing evidence;
- source/provenance survives the path into governed evidence.

No production redesign justified.

### L2 — Admissibility / privacy / audience

**Owners:** `_kernelEvidence`, `ai/admissibility.js`, `ai/privacy.js`, `ai/audience.js`.

**Verdict: GREEN / high confidence.**

This is one of the strongest layers. The repository guards privacy before reasoning rather than retrieving globally and censoring afterwards.

Registered adversarial families cover:
- admissibility;
- private evidence;
- privacy inference;
- object and Forum audiences;
- cross-org isolation;
- tenant authority;
- session authority;
- auth boundaries;
- safeguarding;
- provider boundary;
- attachment/photo boundaries;
- reading scope;
- Forum revocation;
- cross-evidence joins.

The cross-evidence tests explicitly assert that joining relationships/evidence adds **no new readable object** and that private wording never enters the relationship bundle.

No production redesign justified.

### L3 — Primitive semantics

**Owners:** `ai/primitives.js`, `ai/baseline.js`, domain packs.

**Verdict: GREEN.**

The layer remains domain-neutral at the kernel level. The registered primitive/baseline/temporal/process suites protect primitive assignment and historical comparison.

Main risk is not primitive correctness but accidental domain-language leakage at projection. That is guarded elsewhere.

### L4 — Detection / change

**Owners:** intelligence/baseline/structural pattern code.

**Verdict: GREEN.**

Current tests protect:
- minimum-history floors;
- independent-origin behavior;
- temporal distinctness;
- robust baseline behavior;
- process observations/reflection;
- evidence direction entering the later polarity layer.

No evidence in this audit of a second detection owner that should be removed now.

### L5/L6 — Direction, polarity, High/Low bucketing

**Canonical owner:** `ai/intelligence-feed.js`.

**Verdict: GREEN IN CODE; DOCUMENTATION DRIFT FOUND.**

`scripts/governance-smoke.js` explicitly asserts that the polarity taxonomy is authored once and that no other module owns High/Low membership.

Current canonical mapping:
- risk/friction -> Low;
- progress/milestone/strength -> High;
- neutral -> neither;
- opportunity -> neither;
- data_gap -> neither.

The current code comment on opportunity is important: a possible direction is not evidence that something is already going well. This is more consistent with the present Methodical Assistant law than the older layer-map statement that opportunity folds into High.

**Action for Claude:** do not change the canonical mapping merely to make `docs/ttd/layer-map.md` true. Treat the map as stale historical documentation unless the founder explicitly re-ratifies the older rule.

### L7 — Inquiry / uncertainty / hypotheses

**Owners:** Inquiry/diagnosis/contribution kernel.

**Verdict: GREEN / core product strength.**

Registered suites protect:
- inquiry creation from governed evidence;
- hypotheses remaining hypotheses rather than conclusions;
- unsupported explanations remaining tentative;
- rival explanations;
- resolution/adjudication;
- contest/correction;
- contribution authority;
- stable identity/relationships.

`intelligence-continuity-http-smoke.js` is particularly important: the same underlying situation is read through group state, object index, object thread, Focus relationship and Composer, and those surfaces must agree on origins, hypothesis standing, unknowns, outcome and causal restraint.

No production redesign justified.

### L8 — Scope / organizational disclosure

**Owners:** org graph, audience resolver, current membership/leadership, disclosure floors.

**Verdict: GREEN FOR PILOT, CONTROLLED CONSOLIDATION DEBT.**

Strongly proven:
- membership is resolved live;
- removal revokes on the next read;
- relationship is not readership;
- leaders act downward in their subtree, not sideways/upward;
- ordinary members cannot self-assign or self-promote;
- a leader cannot rewrite their own anchor;
- tenant boundaries fail closed;
- platform authority is separate from tenant superadmin authority.

Known debt:
- `scope-parity-smoke.js` inventories 76 scope references and records remaining parallel mechanisms.

This is not a reason for pre-pilot refactoring. It is a reason to keep the parity suite mandatory.

### L9 — Projection / human-facing truth

**Owners:** governed projection, voice/presentation, object/thread projection.

**Verdict: GREEN ON TESTED SURFACES; PER-SURFACE RISK REMAINS.**

Important protections:
- evidence standing and delivery reliability are separate;
- unsupported explanations cannot borrow the standing of the underlying observation;
- causal language is refused when only sequence/outcome is known;
- language continuity is explicit;
- degraded/provider-failure copy is honest;
- output manifest/claim binding prevents generated prose from widening facts.

The architectural risk is historical: projection rules are often enforced per surface. A new surface can forget the projection owner even if the owner itself is correct. Keep browser/reachability checks whenever a new surface is added.

### L10 — Delivery / browser surface

**Verdict: PILOT PATHS GREEN; REPOSITORY-WIDE EXHAUSTIVENESS NOT CLAIMED.**

Historically weakest layer.

Now required Chromium CI covers:
- Settings roles/permissions;
- Forum sharing through rendered controls;
- full Coach pilot journey at phone width;
- player/group pilot journey at phone width.

The registered suite also carries front-end/reachability/library/chart tests.

This proves the pilot paths materially better than before. It does **not** prove every legacy route has an ergonomic browser door. Do not interpret green CI as “every possible screen is perfect.”

### Authority / org-tree layer

**Verdict: GREEN / high confidence.**

`org-tree-authority-http-smoke.js` covers both positive and negative cases:
- no self-placement;
- no self-promotion;
- legitimate leaders can build/manage descendants;
- leaders cannot act outside their subtree;
- tree shape does not imply leadership;
- superadmin/explicit manage-tree grants still work;
- client mirrors server authority;
- forged body/header identity does not matter;
- absent/suspended accounts fail closed.

This directly matches the founder's organization-authority law.

### Persistence / durability layer

**Verdict: GREEN IN CI; LIVE PROVIDER-SPECIFIC DURABILITY STILL EXTERNAL.**

Registered durability suites cover store serialization/reconstruction, deletion non-resurrection, evidence correction/origin relationships, chat/inquiry continuity, safeguarding/audit continuity and durable erasure.

The required CI job proves acknowledged-write restart against PostgreSQL.

Still not claimed by this audit:
- live Neon restart/reconnect behavior;
- live Render lifecycle behavior;
- production-network failure modes.

Those are deployment proofs, not reasons to redesign persistence code now.

### Organizational memory / learning

**Verdict: GREEN AT THE GOVERNED DATA LAYER.**

Registered suites cover:
- org memory snapshots/diffs;
- learning observations;
- playbook candidates;
- explicit human confirmation before playbook write;
- non-causal wording;
- tenant/privacy boundaries.

Important architectural law remains: prior organizational learning may inform later options without inheriting predecessor private chat.

The remaining Methodical Assistant gap is **using** this layer naturally in candidate suggestions, not rebuilding the learning layer.

### Cross-evidence / relationship layer

**Verdict: GREEN / freeze.**

Tests prove:
- refs/labels may travel, private wording does not;
- unrelated objects are excluded;
- other people's/other tenants' objects are excluded;
- both ends of the relationship read the correct direction;
- joins do not widen authorized object sets.

This is exactly the layer the Methodical Assistant should consume rather than duplicate.

### Model/provider boundary

**Verdict: GOVERNANCE GREEN; LIVE QUALITY UNPROVEN.**

Prompt-injection tests prove a compromised/jailbroken model output cannot make uncited organization claims canonical and forged citations are rejected.

Provider-boundary/degraded-honesty tests protect failure modes.

Still external:
- quality of the live provider on realistic Coach/player language;
- latency/recovery behavior under the production provider;
- real multimodal interpretation quality.

The model is replaceable. These are quality/deployment gates, not truth-layer ownership gaps.

### Composer / Methodical Assistant

**Verdict: PARTIAL — deliberately NOT frozen.**

This is the one major product layer that should continue changing tonight.

The governed foundation is strong:
- different question types receive different grounded answers;
- Focus creation is propose -> confirm -> canonical owner;
- privacy and audience law hold;
- attachments are bounded conversational material;
- outcomes feed learning;
- deterministic fallback works.

But the current registered decision-intelligence suite still positively asserts the absence of generated option sets. That is the clearest remaining mismatch with the newer founder-ratified Methodical Assistant direction.

See `docs/briefs/CLAUDE_METHODICAL_ASSISTANT_CLOSURE_R1.md` for the exact closure contract.

## Deep invariant checklist

The following architecture-level invariants are currently backed by registered suites and/or required browser CI:

- model reads / kernel writes;
- relevance is not authorization;
- relationship is not readership;
- one origin cannot masquerade as many;
- attaching is not evidencing;
- user assertion is not organizational truth;
- High/Low/Inquiry standing is governed rather than commanded;
- Focus is deliberate commitment;
- disagreement/unsupported hypotheses remain visible as disagreement/uncertainty;
- current membership controls current readership;
- failed authorization must not mutate canonical state;
- body-supplied identity cannot override session identity;
- tenant superadmin is not platform operator;
- private chat does not become Forum;
- Forum does not inherit private chat;
- related objects do not inherit source readership;
- outcome sequence is not causal proof;
- external knowledge is not local proof;
- organizational learning can survive without predecessor private chat;
- consequential writes require human confirmation/authority;
- provider failure is not silently presented as successful reasoning;
- persistence/restart does not resurrect deleted state.

## What should NOT be changed before the pilot without a new failing proof

Freeze these owners semantically:
- capture/evidence envelope;
- admissibility/privacy/audience;
- primitive semantics and baseline rules;
- polarity/bucket owner;
- Inquiry kernel and hypothesis standing;
- org graph + authority owner;
- relationship/cross-evidence readers;
- persistence/CAS/durable-store semantics;
- organizational memory/learning owners.

Allowed work should consume these layers, not reorganize them.

## What remains worth changing

1. Methodical Assistant / Composer behavior described in the Claude closure handoff.
2. Concrete UX defects exposed by real Coach/player/browser rehearsal.
3. Live-environment fixes only when live Render/Neon/provider/iPhone evidence proves them.
4. Documentation drift where old prose contradicts current ratified product law/code.

Do not start broad “architecture cleanup” before Alma.

## External truth still required before pilot

CI cannot prove:
- exact candidate running on Render;
- live Neon durability/restart/reconnect;
- real provider reasoning quality/recovery;
- actual iPhone/Safari microphone, file picker, layout and session behavior;
- real invite-link/email operational flow if an external delivery provider is involved.

Those must remain named external gates rather than being converted into code-confidence claims.
