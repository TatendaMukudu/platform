# IntelliQ OS v1 — Architecture (frozen)

> **Status: frozen.** This document describes the invariant architectural contracts
> of IntelliQ OS v1. It is intentionally high-level — not implementation detail. Once
> capabilities (calendar, email, Slack, CRM, analytics…) start landing, the constant
> temptation is to "just make an exception." **This is the reference that says no.**
> A change that violates a contract below is not a shortcut — it is a redesign, and
> should be treated as one (proposed, reviewed, and this document updated first).

## The whole system is one loop

```
                Reality
                   ▲
                   │ learns
                   │
        Actions ◄────── IntelliQ OS ──────► Understanding
                   │
                   ▼
                Reality
```

Everything else — connections, evidence, identity, mappings, sync, kernel, policies —
exists to make that loop **trustworthy**. The moat is not "we connect to things." It
is: *a universal organisational memory that can safely reason, act, and learn from
outcomes.*

## The four invariant layers

```
Reality → Connection Layer → Truth Pipeline → Universal Kernel → Execution Layer → Reality
```

---

### 1. Connection Layer — how reality arrives

**Contract.** Any authorised source an organisation already produces can become
context, without entering it twice. Connections are defined by **capability**
(`communication.read`, `calendar.read`, `metrics.ingest`, …), never by app or
industry. A connector's only job is to deliver raw records and declare what it can do.

**Invariants**
- A connector never writes to the kernel directly. Its output is raw records only.
- Delivery is unreliable by assumption (late, twice, out of order, partial, missing).
  Reliability is the layer's problem, not the kernel's — see Sync below.
- Credentials and secrets never leave this layer in readable form.

---

### 2. Truth Pipeline — how reality becomes trustworthy

**Contract.**
`raw record → approved meaning → resolved identity → canonical evidence → kernel signal`.
Nothing becomes organisational truth until it has crossed this boundary.

**Invariants**
- **Immutable raw.** The original record is stored verbatim and never mutated. It is
  the provenance root every downstream fact points back to.
- **Canonical envelope.** Every record normalises to one shape (`lib/evidence.js`)
  carrying provider, subject/group refs, evidence type, value, observed-vs-retrieved
  time, identity confidence, lifecycle status, visibility, mapping version, raw ref.
- **Approved meaning only.** AI/inspection may *propose* what data means; only an
  **approved, versioned mapping** may create canonical evidence (`lib/mapping.js`).
  Versions are immutable (edit forks a draft); activation never silently reinterprets
  history (reprocessing is explicit); schema drift pauses, it never guesses.
- **Identity is confidence, not a guess.** confirmed / probable / unmatched / conflict.
  A fuzzy match *proposes*; it never silently attaches. Held-back evidence is retained
  and re-resolved when the roster changes. Deterministic ids auto-confirm; names do not.
- **Promote exactly once**, and always with the **original `observed_at`** — late or
  reprocessed history is never mistaken for a new event.
- **Never corrupt truth.** Corrections supersede the prior fact (same factual identity);
  deletions are lifecycle events (`deleted_at_source`), not raw-history erasure.

---

### The three reasoning boundaries (cross-cutting invariant)

Reasoning is never one generic model call. It is three separate, typed stages, and no
service may quietly do another's job (`lib/reasoning.js`):

```
raw input → PRE-KERNEL → canonical evidence → KERNEL → derived evidence →
POST-KERNEL → authorised experience/action
```

- **Pre-kernel** (InputInterpretation) turns raw material into claim-bounded canonical
  evidence. It may classify, extract claims, assign provenance, propose visibility. It
  may **not** conclude a pattern, infer causation, or promote a model interpretation
  into observed fact. "Sam seemed distracted / said it was too much / asked to move
  Friday" is valid; "confirmed overload" is not. A model transformation must preserve
  its raw source.
- **Kernel** reasons only over **policy-admissible canonical evidence** (never raw).
  Every output retains **basis evidence IDs**, a confidence, and its limitations.
- **Post-kernel** (Experience/Action) turns an authorised kernel result into an
  experience. It may choose audience, channel, wording, timing. It may **not** add
  facts, **raise confidence**, drop a limitation, or cite evidence outside the
  audience's authorised set.

We store **inspectable reasoning artifacts** (result, basis, confidence, limitations,
policy context, provenance, decision state) — **never private chain-of-thought**.

**Private canonical evidence (correction).** Privacy governs evidence *consumption* and
*visibility* — it does not exempt meaningful AI-used data from canonicalisation. A
`personal_private` item that IntelliQ stores/remembers/uses becomes **private canonical
evidence** (owner-only) so it can power the owner's personal reasoning — while staying
structurally excluded from all organisational reasoning. The kernel gateway is
**purpose-scoped**: `personal_assistance / personal_memory / personal_planning`
retrieve private evidence for its owner; `leader_support / group_reasoning /
organisation_reasoning` exclude it **before any context is built**. Private evidence
emits no organisational signal, is never citable to leaders, and derived evidence
inherits its owner-only ceiling (derived output can never be broader than its narrowest
basis). There is **no raw personal-memory path** outside canonical evidence.

### 3. Universal Kernel — how reality is understood

**Contract.** The kernel reasons only over **universal primitives** (state,
participation, load, capability, relational, outcome, resource) via self-relative
baselines and structural/trajectory patterns. It is industry-agnostic.

**Invariants**
- **No provider, industry, role, or workflow is hard-coded** into the kernel when it
  can be a universal primitive, a capability, or a configurable domain definition.
- **Meaning ≠ language ≠ context.** The kernel stores universal meaning; domain packs
  supply display language; the subject's real role supplies context. Vocabulary is a
  presentation lens (`ai/packs.js`) — it never changes a claim's meaning or confidence.
- **Privacy is structural.** Sensitive information *informs* reasoning but is never
  revealed or quoted to the organisation; leaders see aggregate, evidence-based
  signals — never private words.
- **Honesty by construction.** Confidence, source, and status travel with every claim.
  The kernel says "pattern" / "early signal", not "prediction".

---

### 4. Execution Layer — how IntelliQ acts on reality

**Contract.** Every capability implements ONE model, not bespoke CRUD:
`recommend → draft → confirm → execute → observe → evaluate → learn`
(`lib/action.js`), with three authority levels — **recommend / draft / execute**.

**Invariants**
- **Read, reason, and act are separate authorities.** Recommending and drafting are
  free (nothing outward happens). Executing is the only outward step.
- **Policy gates every outward step.** Before executing, IntelliQ asks not "can I?" but
  "am I *allowed* to, by this organisation's rules?" (`lib/policy.js`): allow /
  require_approval / deny / escalate, most-restrictive-wins, and **execute needs
  approval by default on silence** — the assistant never auto-acts unasked.
- **The loop must close.** `observe → evaluate → learn` is not optional. A capability
  that cannot answer *"did this improve the organisation?"* is incomplete. Evaluation
  feeds a signal back to the kernel.
- **Capabilities are thin edges.** A new capability plugs stage executors into the
  registry. It gets **no bespoke endpoints, no private truth logic, and no policy
  exemptions.** If a capability seems to need any of those, the contract is wrong —
  fix the contract, not the capability.
- **Every action is audited** end to end (who proposed, who approved, what policy
  decided, what executed, what was observed and evaluated).

## What "done" means for a capability

A capability is complete when, and only when, it:
1. declares its verbs and reads through the Truth Pipeline (never a side channel);
2. grounds its recommendation in evidence (carries `rationale` + `evidenceRefs`);
3. drafts without side effects;
4. executes **only** through the policy gate;
5. observes the real outcome;
6. evaluates whether the organisation improved and emits that back to the kernel.

Calendar, email, tasks, meetings — each is this same shape. The first one to prove it
end to end sets the template; every one after is repetition, not invention.

## Where the bottleneck now lives

The OS architecture is no longer the bottleneck. The next frontier is **product
experience** — MyWorkspace, organisational workflows, and assistant experiences that
feel indispensable — built on top of these frozen contracts, not by redesigning them.
