# Midnight ideas — an idea-to-evidence holding space

**Artifact status:** non-authoritative thinking record  
**Last grounded against the repository:** 2026-08-16

This is the durable place for architectural and product ideas that are worth preserving but are
not ready to become product truth, an RFC, a brief, a requirement, or code. It lives under
`docs/ideas/` rather than `docs/product/` because the authoritative product-truth convention is
already `docs/ttd/`, while executable handoffs live in `docs/briefs/` (`AGENTS.md` §4b;
`docs/ttd/intelliq-ttd-v1.md`). The directory name makes the maturity boundary visible.

> **Entries here are not implementation authority.** An entry becomes implementation authority
> only after it passes through the repository's normal architectural decision, RFC, or bounded
> brief process and, where appropriate, is expressed as executable invariants/tests. Repository
> truth may contradict this document; if it does, update the entry rather than the code.

The intended path is:

> **idea → architectural hypothesis → validated invariant → brief/RFC → implementation → test**

## Status vocabulary and maintenance

- **EXISTING** — verified in current code; cite the module (and preferably its test).
- **EMERGING** — direction strongly implied by multiple existing architectural choices.
- **HYPOTHESIS** — worth testing, but neither accepted nor implementation authority.
- **DECIDED** — explicitly accepted product/architecture direction; cite the decision source.
- **REJECTED** — considered and intentionally not pursued; preserve the reason.
- **SUPERSEDED** — replaced by a later entry or decision; link to it.

Each entry should stay short: **idea; why; architectural relationship/implications; assumptions;
questions; risks; supporting and contradicting evidence; promotion gate**. “EXISTING” describes
only the cited substrate, never the whole proposed idea. When an entry advances, link the durable
decision artifact and retain this history.

## Architectural compass

These statements are a proposed vocabulary for evaluating the entries, not a schema:

- **Beliefs** describe what the organisation currently has warranted reason to think is true.
- **Skills** describe what the organisation has learned how to do.
- **Inquiries** organise uncertainty and learning.
- **Governance** controls when beliefs, skills, permissions, and actions may change.
- **Outcomes** provide reality feedback.
- **Memory** preserves how this evolved.
- **LLMs reason within this system; they do not define organisational truth.**

The terms *Inquiry*, *Belief*, *Claim*, *Signal*, and *Evidence envelope* already have narrower,
reconciled meanings in the product ontology (`docs/ttd/intelliq-ttd-v1.md` §3). Future discussion
must use those meanings or explicitly propose changing them.

---

## 1. IntelliQ as an organisational harness

**Status: HYPOTHESIS**, built on **DECIDED/EXISTING** governance boundaries.

**Idea and why it matters.** IntelliQ may be better understood not merely as an organisational
agent, but as an **organisational harness**: a governed, evidence-backed representation of what an
organisation is, currently believes and knows, does and has learned; what its people, internal
systems, AI/models/agents, external evidence, and market say; and what actually happened. The
harness is an **arbiter of evidence and organisational state, not an oracle**.

The world remains probabilistic and contested: people and models can be wrong, sources can
conflict, and evidence can stale. “Deterministic” should describe governance where appropriate—
provenance, admissibility, identity, authorisation, lifecycle, correction, contradiction,
confidence derivation, evidence requirements, action boundaries, auditability, and promotion of
learning—not infallible truth.

**Relationship and implications.** This extends the existing chassis/bodywork distinction and
constitutional boundary (`docs/ttd/intelliq-ttd-v1.md` §§1–2), the deterministically derived belief
ledger (`ai/reason.js`, `ARCHITECTURE.md` §§2–3), evidence lifecycle/admissibility
(`lib/evidence.js`, `ai/admissibility.js`), correction/contradiction handling (`ai/diagnose.js`),
and audited events (`ai/audit.js`). It would broaden their organisational coverage, not weaken
their privacy, consent, evidence, or fail-closed constraints.

**Assumptions/questions/risks.** Can one harness cover descriptions, beliefs, actions, and learned
practice without collapsing their different authority rules? What state is canonical versus a
projection? Risks include centralising surveillance, presenting warranted belief as fact, stale
evidence, and turning a metaphor into an unbounded platform rewrite.

**Promotion gate.** Define bounded user decisions this framing improves; reconcile it with the two
products/one-kernel decision in `AGENTS.md` §1; test it against the Constitution and evidence
classes; then ratify terminology in the TTD/RFC before any brief.

## 2. Actors, claims, evidence, outcomes

**Status: HYPOTHESIS.**

**Idea and why it matters.** Explore whether explicit relationships among **actors** (people,
groups, organisational units, agents/models, systems, machines, connectors, external sources),
**claims**, **evidence**, and **outcomes** would let the harness distinguish who asserted what,
what bears on it, and what happened after action.

**Relationship and collision.** Do not introduce these as four new primitives without
reconciliation. The repository already defines a Claim as “a statement made to a human, which
must be grounded,” an Inquiry as the primary reasoning container, and a Belief as the reasoner's
durable read (`docs/ttd/intelliq-ttd-v1.md` §3; `ai/conversation.js`; `ai/diagnose.js`;
`ai/reason.js`). Evidence envelopes already carry lifecycle, subject, visibility, and provenance
(`lib/evidence.js`); inquiries reference rather than copy evidence (`ai/diagnose.js`). Groups and
identity exist in the organisation graph (`ai/org-graph.js`), Forum speech is deliberately not
evidence until contributed (`ai/forum.js`, `ai/contribution.js`), and intervention/outcome history
already exists (`ai/outcome-intelligence.js`).

**Assumptions/questions/risks.** Is “actor” identity, evidence origin, claimant, author, subject,
or some combination? Does Claim need broadening beyond human-facing speech, or is Hypothesis or
Belief the correct existing concept? Outcomes can be reported evidence rather than ground truth.
Risks are parallel lifecycles, provenance duplication, and confusing relevance with authorisation.

**Promotion gate.** Inventory current entities and lifecycle boundaries; demonstrate a real query
they cannot express; resolve naming in the TTD; specify privacy/tenant/authority semantics; only
then propose an RFC and invariant cases.

## 3. Inquiry-derived organisational skills

**Status: HYPOTHESIS with a material EXISTING near-equivalent.**

**Idea and why it matters.** An organisation may learn demonstrated ways of operating through a
cycle such as **Inquiry → Pattern → Candidate Skill → Tested Skill → Adopted Skill →
Revised/Contested/Retired Skill**, potentially at individual, group/Forum, and organisation scope.
A traditional agent skill instructs an agent how to act; an IntelliQ organisational skill would
record how this organisation has evidence that it can successfully perform a task. It would
retain provenance, counter-evidence, outcomes, applicability, exceptions, review history, and
adoption authority—but no schema is proposed here.

An LLM may propose that the organisation learned something; it must never promote that proposal.
Deterministic governance and authorised human action decide whether evidence is sufficient for
adoption.

**Relationship and collision.** The learning cycle aligns with the TTD loop
(`docs/ttd/intelliq-ttd-v1.md` §1), inquiries/hypotheses (`ai/diagnose.js`), organisational memory
and recurring observations (`ai/org-memory.js`, `ai/org-learning.js`), and outcome history
(`ai/outcome-intelligence.js`). More importantly, `ai/org-playbook.js` already derives
counter-evidenced **candidate practices**, requires leader confirmation before durable
organisational knowledge, and reviews confirmed entries as holding/contested/unsupported; the
server supports confirmation and retirement (`server.js`, `/api/org-playbook...`). “Skill” may
therefore duplicate or rename the existing **organisational playbook/practice** abstraction.
Forum is a deliberation surface, not an evidence scope (`ai/forum.js`).

**Assumptions/questions/risks.** Must a practice demonstrate successful outcomes rather than mere
recurrence? Who may adopt at each scope? How are exceptions and failed transfer represented?
Risks include laundering correlation into capability, majority rule, private-to-group leakage,
and equating leader confirmation with demonstrated effectiveness.

**Promotion gate.** First decide whether this is an evolution of playbook practices or a genuinely
different concept. Require outcome-linked evidence and counter-evidence rules, scoped adoption
authority, challenge/retirement semantics, privacy review, and golden cases before a brief.

## 4. The organisation as its own learning context

**Status: EMERGING direction; the full equation remains HYPOTHESIS.**

**Idea and why it matters.** Organisation-specific intelligence need not require a separately
fine-tuned model:

> general model intelligence + governed organisational context + organisational memory + learned
> practices/skills + governance = organisation-specific intelligence

Inquiries, evidence, decisions, outcomes, corrections, Forums, interventions, patterns, practices,
and history can supply evolving operational context. Two organisations using the same model could
therefore behave differently. Prefer **organisational learning without requiring continuous model
retraining** over calling private history “training data.”

**Relationship/evidence.** The current architecture already separates deterministic reasoning
from the LLM edge (`ARCHITECTURE.md` §§1–3), stores organisational context and memory
(`ai/org-context.js`, `ai/org-memory.js`), and derives observations and confirmed playbook entries
without model training (`ai/org-learning.js`, `ai/org-playbook.js`). This supports the direction;
it does not prove the proposed combination is sufficient.

**Questions/risks.** What context is admissible for which task, how is freshness enforced, and how
does deletion propagate? Risks include accidental cross-org retrieval, unbounded context, private
content reuse, and mistaking stored history for validated learning.

**Promotion gate.** Demonstrate organisation-specific benefit on governed tasks without retraining;
define retrieval, deletion, privacy, provenance, and evaluation boundaries; then decide through an
RFC/TTD amendment.

## 5. Human + machine governance

**Status: HYPOTHESIS, extending EXISTING human/system boundaries.**

**Idea and why it matters.** At maturity, the same harness may govern employees, leaders,
internal/external LLMs, coding or functional agents, forecasting/recommendation systems,
autonomous workflows, and possibly machines. It need not replace them. It may need to answer:
who/what is the actor; what may it access, claim, decide, or execute; what evidence and source
support its output; how current or contradicted it is; which decisions may depend on it; whether a
human must arbitrate; what happened after action; and whether that outcome may modify knowledge.

**Relationship/evidence.** Session-derived identity and org scoping are existing HTTP boundaries
(`ARCHITECTURE.md` §6; `server.js`). Contribution separates relevance from authorisation and
recognises a narrow `system` contributor role (`ai/contribution.js`). Model output is already a
proposal behind deterministic gates (`ai/diagnose.js`, `ai/reasoning-register.js`). These do not
amount to a general machine-actor permission or execution model.

**Questions/risks.** Can machine identity reuse the organisation graph without pretending a model
is a person? Who is accountable for delegated actions and model/version changes? Risks include a
disconnected “AI governance” subsystem, permission laundering, unverifiable provenance, confused
human accountability, and unsafe execution.

**Promotion gate.** Start with one bounded machine-actor use case; map it to existing identity,
provenance, admissibility, authorisation, audit, and action boundaries; threat-model it; ratify new
semantics only where existing concepts cannot carry them; require fail-closed tests.

## 6. Model-agnostic IntelliQ

**Status: EMERGING, not yet a general routing architecture.**

**Idea and why it matters.** Preserve a stable deterministic harness behind a model
abstraction/routing boundary that could use local, hosted, frontier, or customer-owned models.
Evaluate models on IntelliQ-specific tasks: inquiry synthesis, evidence/structured extraction,
contradiction detection, Forum synthesis, candidate-practice discovery, explanation,
classification, and grounded reasoning. Routine work might use inexpensive/local models while
stronger models are reserved for justified tasks.

**Relationship/evidence.** `ai/gateway.js` is already the single LLM edge with Anthropic and
OpenAI paths plus deterministic/no-egress fallback (`ARCHITECTURE.md` §§2, 7). Governed business
logic is outside vendor branches. This materially supports vendor independence, but current
configuration is not the proposed local/customer-owned routing and evaluation system.

**Questions/risks.** Is routing based on task, privacy, cost, capability, tenant policy, or all of
them? How are model/version provenance and equivalent safety measured? Risks include inconsistent
outputs crossing one deterministic gate, hidden data egress, benchmark gaming, and routing
complexity becoming product logic.

**Promotion gate.** Define a model-neutral task contract and IntelliQ-specific eval corpus; prove
governance equivalence and egress controls across at least two implementations; then RFC routing.

## 7. Sports as an initial vertical, not the core ontology

**Status: HYPOTHESIS as go-to-market; DECIDED for domain-agnostic kernel design.**

**Idea and why it matters.** Sport, particularly football/player development, is a promising
proving ground: people, teams, coaches, specialist departments, repeated interventions, frequent
and measurable outcomes, conflicting perspectives, long-term development, and institutional
memory all make “can an organisation systematically learn from itself?” unusually testable.
Sport may be a distribution wedge, not an architectural cage.

**Relationship/evidence.** The repository has explicitly decided on one universal kernel that is
domain-agnostic in logic and domain-parameterised in metadata (`AGENTS.md` §1). Generic primitives
and adapter/domain-pack boundaries already carry domain meaning (`ai/primitives.js`,
`ai/adapters.js`, `ai/packs.js`; `UNIVERSAL_PRIMITIVES.md`). Use an `Inquiry` with a generic
`subjectRef` (`ai/diagnose.js:newInquiry`), not a parallel `PlayerInquiry`, unless evidence proves a
domain-specific primitive is necessary.

**Questions/risks.** Which sports workflows provide fast, ethical outcome feedback? Which sport
terms belong only in UI, adapters, or packs? Risks include proxying human development by narrow
performance measures, medical/privacy harm, and sports nouns leaking into kernel logic.

**Promotion gate.** Validate the wedge with users; define vertical-specific metadata/adapters and
interfaces; run universality/privacy/fairness invariants; reject any core primitive that cannot
justify itself outside sport.

---

## Open synthesis

The strongest current collision is productive: the proposed “inquiry-derived skill” overlaps the
existing governed organisational **playbook practice**. The next architectural work should not
name or schema a Skill. It should ask whether outcome-demonstrated capability is a stricter
lifecycle stage of a practice, or a different thing, and let evidence plus a council decision
settle that question.

The larger harness framing is compatible with the repository only if “deterministic” continues to
refer to governed transitions and derivations—not to a claim that IntelliQ owns uncontested truth.
