# Universal Systems Intelligence — the Human-System Ontology
*Foundational principle: one reasoning engine for any organized human system. The honest architecture, the minimal primitive set, and the trap that kills projects like this.*

---

## Verdict

**Yes, the philosophy is right — and you're already most of the way there.** But the
slogan "the Kernel should contain no domain-specific logic" needs one word of
precision or it will mislead you into a 40-year-old graveyard. Here it is:

> **The Kernel is domain-agnostic in its LOGIC, and domain-parameterized in its
> METADATA.** No domain *reasoning* lives in the Kernel. Domain *knowledge* lives
> entirely in the adapter/pack, as two things only: **vocabulary translation** and
> **metadata parameters.** The Kernel never sees the word "grade" — it sees "an
> outcome-signal, this scale, up-is-good, linked to this aim, observed at this time."

That single distinction is the whole answer. "No logic, yes parameters." Everything
below elaborates it.

---

## The trap (aggressive critique — this is where projects like this die)

**Universal ontologies are a graveyard.** Cyc, the Semantic Web, upper ontologies,
schema.org, Palantir's ontology — every serious attempt to "model everything
universally" either collapsed into abstraction so vague it was useless, or leaked
domain specifics everywhere until it wasn't universal. The dream is seductive and the
corpses are many. You survive it with three disciplines:

1. **Keep the primitive set brutally small and strictly *behavioral*** — things you
   can observe and measure. The instant you start modeling *meaning* ("what a grade
   really is") in the Kernel, you've lost.
2. **Don't flatten away the meaning that makes you useful.** "Grades" and "KPIs" are
   both "measurable outcomes" — but a grade has a scale, a subject, a developmental
   valence a sales KPI doesn't. If the Kernel reduces everything to "outcome," it will
   reason correctly and advise uselessly-generically. The fix: primitives carry
   **typed metadata** (see below), so the Kernel reasons over universal *structure*
   while the domain supplies the *values*.
3. **Universality is an ENGINEERING property, not a business one.** The engine can be
   agnostic; **trust, regulation, and go-to-market stay stubbornly per-vertical** —
   healthcare has HIPAA, education has FERPA/COPPA, work has employment law. A universal
   Kernel still ships behind vertical packs, vertical language, and vertical
   compliance. Industry-agnostic *by design* is true and powerful. Industry-agnostic
   *in go-to-market* is a fantasy — you still win one vertical first.

---

## The minimal primitive set

The smallest set from which any classroom, club, company, unit, congregation, or
family can be modeled — **five entities over one dimension.** Everything else is
*derived*, not primitive.

| Primitive | What it is | Already in the code as |
|---|---|---|
| **Actor** | Anything that acts or is acted upon. **Recursive** — a person, a team, an org are all Actors; an org is an Actor made of Actors. | `orgUsers`, teams/groups, org |
| **Aim** | A desired direction or state (goal, value, KPI target, "who they're becoming"). The reference everything is judged against. | goals / values / the Alignment Layer |
| **Signal** | A timestamped, provenanced, typed observation about an Actor's state. The atom of evidence. | `orgSignals` (shipped) |
| **Relation** | A typed, directional link between Actors (reports-to, plays-with, teaches, mentors, member-of). The edges where culture, communication, leadership live. | nodes / hierarchy / groups |
| **Event** | Something that happened at a time that may perturb the system (a match, an exam, a reorg, a schedule change). **An Intervention is an Event with intent + an Actor + an intended effect** — and it's where causal license comes from. | interventions (seed) |
| **Time** *(dimension)* | The substrate every primitive is stamped in. Longitudinal reasoning is impossible without it as first-class. | timestamps everywhere |

**Everything else in your list is derived from these five:**
- **Behavior** = a pattern of an Actor's Signals over Time.
- **Outcome** = a Signal an Actor *cares about* (Signal linked to an Aim).
- **Participation** = the cadence/consistency of an Actor's Signals. *(attendance =
  availability = absenteeism = presence — all the same primitive dynamics.)*
- **Performance** = Outcome relative to Aim.
- **Resource / Constraint** = a state Signal or attribute that enables/limits Aim-attainment.
- **Feedback** = an Event that carries a result back to an Actor (an intervention's
  recorded outcome).
- **Culture** = the aggregate pattern of Relations + shared Aims across Actors.
- **Leadership** = an Actor whose Relations measurably shift others' Outcomes.

The elegance: **five nouns and time, and the entire vocabulary of every industry
becomes derivations, not new concepts.** And you already instantiate all six — this
isn't a rebuild, it's a *renaming and a tightening* of what exists.

---

## The metadata that keeps it sharp (the "no logic, yes parameters" mechanism)

A Signal is not just a number — it carries **universal-structure metadata whose
values are domain-supplied:**

```
Signal {
  actor, time, provenance, sensitivity,   // universal
  primitiveType: outcome | state | participation | relational | event-marker,
  valence:  up-good | down-good | neutral, // is a rise good, bad, or neither?
  scale:    { kind, min?, max?, unit? },   // how to read the number
  cadence:  how often it's expected,       // for participation reasoning
  aimLink:  which Aim this bears on,        // makes it an Outcome
}
```

The **Kernel reasons over this structure** (self-relative shift, co-movement,
participation dynamics, alignment-to-aim) with **zero domain logic.** The **domain
pack supplies the values** ("in education, a 'grade' is primitiveType=outcome,
valence=up-good, scale 0–100, aimLink=academic"). Change the pack, not the Kernel.

---

## How semantic equivalence actually works (grades = KPIs = performance)

Your diagram (Domain → Adapter → Universal → Kernel → translate back) is exactly
right. The mapping — recognizing "grades," "performance," "KPIs," "patient outcomes"
as the same *outcome-signal* — lives in the **adapter**, and is produced three ways,
in order of preference:

1. **Declared** — a pack states the mapping for known fields. Deterministic, auditable.
2. **Inferred** — for an *unknown* incoming field, an LLM/embedding maps it to the
   nearest primitive + aim. This is precisely what language models are *built* for —
   so **rent it, don't build a bespoke ontology-learner.** "Semantic equivalence"
   is cheap now in a way it wasn't for Cyc.
3. **Human-confirmed** — the inferred mapping is proposed to a person once; their
   confirmation becomes a declared mapping and teaches the system. (This is also
   proprietary data — how *this* customer's world maps to the universal frame.)

The Kernel never touches step 1–3. It receives universal Signals and emits universal
conclusions; the **Coach agent translates back** into the domain's language on the way
out ("their *reflection cadence* is down" → for a coach, "he's logging fewer training
notes"). One engine; the vocabulary is a skin at both ends.

---

## The direct answers

- **Does the philosophy make sense?** Yes — with "no logic, yes parameters" as the
  guardrail against the ontology graveyard.
- **Can the Kernel reason on universal principles?** Yes; it largely already does. The
  five primitives + metadata are enough, and they're mostly built.
- **How to define the primitives?** As small, behavioral, observable entities (Actor,
  Aim, Signal, Relation, Event) over Time, each carrying universal-structure metadata
  whose values the domain supplies.
- **Smallest set to model any human system?** **Five nouns and time.** Everything
  else — performance, participation, culture, leadership, burnout, engagement —
  derives.
- **Industry-agnostic by design vs by expansion?** By design in the *engine* (one
  Kernel, packs are configuration). By expansion in *trust and go-to-market* (each
  vertical earns its own compliance and credibility). Hold both truths.

---

## One-line synthesis

**Five primitives and time, reasoned over by a Kernel with no domain logic and only
domain metadata; vocabulary translated in and out at the edges.** That makes IntelliQ
industry-agnostic by architecture — one engine that understands any organized human
system — while you still, deliberately, go deep in one vertical first, because trust is
never universal. Build the ontology thin, keep the meaning at the edges, and let the
same Kernel quietly turn out to work for the classroom, the club, and the company —
not because you built three AIs, but because you built one, correctly.
