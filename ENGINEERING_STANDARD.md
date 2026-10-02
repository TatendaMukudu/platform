# ENGINEERING_STANDARD.md — one-pass durable implementation

This is the coding contract beneath AGENTS.md and TESTING.md. AGENTS defines product law and authority; TESTING defines proof. This file defines how an implementer should build so the first implementation is already shaped to survive review.

## 1. Start from the owner, not the symptom

Before editing, trace the production call graph and name:
- the canonical owner of the state/decision;
- every writer;
- every reader/human-facing surface;
- persistence/reload path;
- authorization/scope gate;
- provenance/evidence boundary;
- existing tests that claim to guard it.

Search for older owners and contradictory tests/comments. Never add a second owner because the first is inconvenient. Repository truth beats a brief.

## 2. State the law before code

Write the positive and negative property in plain language.

Example:
- Positive: an authorized participant can continue their own conversation when an Inquiry becomes a Focus.
- Negative: a relationship edge never grants another participant access to that conversation.

If the change materially chooses ontology, privacy, epistemic law, or Web semantics and the founder has not chosen it, stop and escalate.

## 3. Preserve the architecture

- LLM proposes; deterministic/kernel code decides permissions, identity, standing, confidence, state transitions and canonical writes.
- Evidence is referenced, never copied.
- Relationship is not readership.
- Relevance is not authorization.
- Origins vote, not repeated signals.
- Corrections supersede; do not erase history.
- Conversation remains participant/audience-bound.
- External knowledge retains source/provenance and never becomes local proof merely by retrieval.
- One canonical owner per concept. Extend readers/projections before inventing stores.
- Fail closed on unknown scope/status/identity.

## 4. Treat every boundary as hostile

Validate and bound data at ingress. Never trust body-supplied identity/org/role when session truth exists. Assume user text, attachments, imported files, model output, URLs, old persisted rows and relationship refs can be malformed or adversarial.

No secret in source/logs. No direct provider exit outside the gateway. No model-generated permission, audience, confidence, evidence standing or canonical identifier accepted as authoritative.

## 5. Make writes atomic and retry-safe

Consequential writes must have:
- explicit authorization before mutation;
- validation before mutation;
- one canonical mutation path;
- CAS/version protection where shared state can race;
- idempotency where retries are plausible;
- no partial success that leaves canonical stores disagreeing;
- durable flush/persistence behavior;
- deterministic reconstruction after reload.

Do not repair a failed multi-store write by silently inventing missing truth.

## 6. Privacy and data minimization are structural

Store only what the owner requires. Pass refs/derived shape instead of raw private text whenever possible. A shared object may be informed by private evidence without inheriting the private source or conversation.

Every new relationship must be tested from both ends by an unauthorized reader. Every new projection must prove it cannot widen audience.

## 7. Output cannot outrun evidence

Before human-facing output, prove:
- claims have admissible provenance;
- confidence/standing is computed;
- uncertainty/contradiction survives rendering;
- correlation is not rewritten as cause;
- external evidence is distinguished from local evidence;
- suggestions remain options until human choice;
- no raw private material entered the projection accidentally.

A fluent LLM response is not proof.

## 8. Build the vertical slice, not an isolated helper

For consequential capability, prove:
intent -> route -> owner -> canonical state -> persistence -> read model -> UI/API surface -> reopen/reload -> continuation -> unauthorized denial.

A helper returning the right value while no production route calls it is unfinished.

## 9. Test the opposite, then mutate

Every new law needs:
- golden positive case;
- nearest negative/adversarial case;
- boundary case;
- persistence/reload case when stateful;
- authorization/privacy case when scoped.

Then break the exact production line and prove the intended assertion goes red. Restore it and run the full suite. A crash, empty fixture, masked outer gate, dead helper, regex hit or no-op mutation is not proof.

Provider-backed tests complement deterministic tests; they never replace them. Use realistic messy language and prove governance can reject/narrow model proposals.

## 10. Prefer deletion and consolidation

Before adding code ask whether the capability already exists under another name. Delete dead parallel ownership when safe. Do not create a packet, cache, relationship table, confidence field, assistant brain or truth store merely to make one screen easier.

## 11. Performance and operability

Bound loops, collections, context windows, imported data and model spend. Avoid N+1 provider/database work. Give failures actionable codes/messages without leaking sensitive data. Degraded mode must remain truthful.

## 12. Definition of done

An implementation is not done until:
1. syntax/static checks pass;
2. focused tests pass;
3. mutations prove new assertions bite;
4. full `npm test` is green;
5. relevant provider/browser/live proof is run when the behavior depends on it;
6. diff is reviewed against current target, not only merge base;
7. no unrelated behavior changed;
8. limitations and unverified surfaces are written down;
9. commit is small enough to explain and revert;
10. documentation/product law is updated when behavior changed.

Never report a command as run unless it actually ran. CI/shared repository truth outranks agent self-report.

## 13. One-pass implementation checklist

Before coding: owner, law, threats, callers, tests.
While coding: smallest canonical change, no widened scope, no duplicate state.
Before push: focused test -> mutation -> full suite -> diff review -> persistence/privacy proof.
Before handoff: exact SHA, commands/results, what changed, what remains uncertain.

The goal is not fewer review passes by lowering scrutiny. The goal is to make the first pass already contain the reasoning, boundaries and proof that later reviewers would otherwise have to force into the code.
