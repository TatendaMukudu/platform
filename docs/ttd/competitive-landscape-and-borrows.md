# Competitive landscape, and what is worth borrowing

**Status:** CURRENT. Market and architecture research, conducted August 2026.
**Purpose:** identify who we compete with, how they solve the problems we solve, and what we
should take from them before the pilot.

**Read §3 first if you read nothing else** — it contains the one finding that should change a
decision this month.

---

## 1 · WHO WE ACTUALLY COMPETE WITH

Three distinct markets, and we sit awkwardly across all three. That is a strategic fact worth
naming: nobody is doing exactly what we do, which is either a moat or a sign the category does
not exist.

### 1.1 · Athlete management systems — the Alma neighbours

| Product | What it is | How it reasons |
|---|---|---|
| **Teamworks** (owns **Smartabase**) | The category leader. Started as team comms, now a full AMS: training logs, calendar, compliance, academics, scheduling | Consolidates wearables, medical records and subjective wellness into one athlete profile. **Configurable alerting on organisation-defined thresholds.** Role-based permissions across coach / physio / nutritionist / sports scientist |
| **Kitman Labs** | "Intelligence Platform" — physical health, nutrition, mental wellbeing; integrates with campus medical centres | Injury-risk modelling. Explicitly positions on **translating complex data into practical guidance for non-technical users** — role-specific dashboards |
| **Catapult / Hudl** | Hardware-led (GPS, load) plus video | Load and performance metrics; not a reasoning layer |

**How they deploy intelligence:** thresholds and models over consolidated data, surfaced as
dashboards. The organisation defines what counts as an alert. There is no epistemic layer — a
flag is a flag, not a claim with a confidence band and an origin count.

**What they have that we do not:** wearable and medical integrations, injury-risk models with
real validation, and years of institutional trust.

### 1.2 · School wellbeing — the Falcon neighbours

| Product | What it is |
|---|---|
| **STEER Education** (formerly AS Tracking) | **Our closest philosophical competitor.** Peer-reviewed mental-health tracking for ages 8–18. Online assessment three times a year |
| **Komodo Wellbeing** | Real-time student-voice capture, wellbeing insight for schools |
| **CPOMS StudentSafe** | The safeguarding record system. **Both STEER and Komodo integrate into it** |

**STEER matters more than anything else in this document.** Its stated pitch is:

> alerts schools to students who may have emerging mental health risks, **but are not showing
> visible signs of vulnerability**, and identifies students who may be hiding safeguarding
> concerns.

That is, almost word for word, the question `docs/rnd/intelliq-rnd-program.md` C3 calls "the
hardest open question in the register" — the silent spiral. **STEER has already answered it, in
the direction of telling the school, and has peer review and awards behind that answer.**

Two consequences:

1. The market has already accepted disclosure-to-school for safeguarding. Our instinct to hold
   that back is defensible on principle but it is **not** the industry default, and a school will
   ask why we do less than the tool they already have.
2. **CPOMS is the integration point for UK schools.** A Falcon deployment that does not reach
   CPOMS is a second system for a DSL to check, which is how school software dies.

### 1.3 · Employee listening — the general case

**Culture Amp**, **Peakon** (Workday), **Glint** (Microsoft), **Perceptyx**, **Eletive**,
**CultureMonkey**.

All of them do team-level aggregate reporting to managers with a confidentiality floor. That is
the same problem our two-sided cohort floor solves — see §3, because their answer differs from
ours by a factor of two to five.

---

## 2 · ARCHITECTURE PEERS — how others build the layers we built

We are not competing with these, but they have solved our problems at larger scale.

### 2.1 · Palantir Foundry Ontology — the closest structural analogue to our kernel

Foundry's ontology has two layers, and the mapping to ours is striking:

| Foundry | IntelliQ |
|---|---|
| **Semantic layer** — objects, properties, links | evidence envelopes, inquiries, `orgNodes`, `subjectRef` |
| **Kinetic layer** — Action Types, functions, dynamic security | the contribution boundary, `_commitTreeMutation`, proposal→confirm→execute |
| Write-back separated from side effects; **the source system stays authoritative** | P0-D authority-vs-truth |
| Lineage and action audit trails **native from day one, not bolted on** | `prov()`, the evidence log, `_audit` |

Their central rule is one we already enforce, stated better than we state it:

> Users **cannot issue direct UPDATE queries**. They can only change state through defined
> Action Types — with validation rules, business constraints, side effects and a full audit
> trail.

**The difference: theirs are declared as data; ours are written in code.** That is exactly the
G9 "policy as data" item parked in the R&D register, and Palantir is the existence proof that it
works at scale. Not a pilot change — but the parking decision should now record that a serious
implementation exists rather than treating it as speculative.

### 2.2 · Durable execution — Temporal, DBOS, Restate, Inngest

The dominant 2026 pattern for production agents, and it is our architecture in different words:

> Separate the **deterministic outer loop** from the **non-deterministic inner calls**. The
> outer loop lives in workflow code that must replay to the same state; activities are the LLM
> calls and tool invocations.

That is "models propose, the kernel adjudicates." Two useful confirmations:

- **`LangGraph + Temporal` is the production stack, not LangGraph alone** — which vindicates our
  refusal to adopt an orchestration framework as a *reasoning* layer.
- Their determinism comes from **replay against a journal**. Ours comes from recomputability
  from the evidence log. Same property, different mechanism, and ours is the cheaper one because
  we already event-source.

### 2.3 · Policy engines — OPA/Rego, Cedar, Microsoft Agent Governance Toolkit

The consensus position, which we should quote in our own materials because it is ours:

> Since LLM reasoning is non-deterministic, security must be enforced **at the point of action
> execution** through a deterministic policy layer **independent of the LLM** — replacing
> prompt-based constraints with machine-readable policies.

We do this. `_kernelEvidence` is a deterministic gate independent of the model, applied before
context is assembled rather than after generation. Most guardrail products filter *output*; we
filter *admissibility*. That is a stronger position and we do not currently say so.

### 2.4 · Statistical disclosure control — the mature field we have been reinventing

This is the most useful section in the document. Cell suppression is a decades-old discipline
with settled rules, used by national statistics offices and mandated for US education data by
FERPA and the Department of Education's Privacy Technical Assistance Center.

Their vocabulary maps onto ours exactly:

| SDC term | Ours |
|---|---|
| **Primary suppression** — a cell below the threshold is withheld | `cohortFloor` failing on `k < MIN_COHORT` |
| **Complementary suppression** — additional cells are withheld so the primary cannot be recovered by arithmetic against row/column totals | our two-sided rule, `n − k < MIN_COHORT` |
| **Threshold rule** | `MIN_COHORT` |

**Our two-sided floor is a rediscovery of complementary suppression.** That is reassuring — it
means the complement attack we found by experiment is a known attack with a known name.

But it also means we can read ahead, and reading ahead produces §3.

---

## 3 · THE FINDING THAT SHOULD CHANGE A DECISION

### `MIN_COHORT = 2` is below every published standard we can find.

| Source | Threshold |
|---|---|
| Culture Amp (and stated industry norm for employee listening) | **5** |
| Some platforms, for smaller teams where 5 could still identify | **10** |
| US education SDC practice / PTAC-vetted guidance | **5**, or the "Rule of 10" |
| **IntelliQ today** | **2** |

We chose 2 by reasoning from first principles about small teams. Everyone else chose 5 or 10 by
reasoning about the same problem with more data and, in the education case, with a regulator
looking over their shoulder.

**This is a founder decision, not an engineering one, and it is genuinely hard:**

- At `MIN_COHORT = 5` in a 12-person squad, the two-sided rule admits a count only when between
  **5 and 7** people contributed. Narrow.
- At `MIN_COHORT = 5` in a 20-person squad: between 5 and 15. Comfortable.
- At `MIN_COHORT = 5` in a 6-person coaching staff: **never**. That group can never have a High
  or a Low.

So raising it makes small groups permanently silent, which is a real product cost. But shipping
a school pilot at 2 when the sector standard is 5 is a defensible-sounding position right up
until someone asks us to defend it in front of a DSL or a parent.

**Recommendation:** make the floor a per-organisation setting with a **default of 5**, recorded
with who set it and why, and require an explicit decision to go below it. That is what every
platform above does — Culture Amp's "usually 5, may vary depending on the exact circumstances"
is precisely a configurable floor with a safe default.

**What must not happen:** the floor being lowered silently to make a demo look better.

---

## 4 · THE OTHER BORROWS, RANKED BY PILOT VALUE

### B1 · Complementary suppression across the whole payload, not one finding at a time

Our floor is applied **per finding**. SDC applies it **across a table**, because a reader can do
arithmetic between cells and totals.

Our team surface publishes, in one response: `high.basis {contributors, of}`,
`low.basis {contributors, of}`, `node.memberCount`, and `withheld[]` naming the topics we held
back. The leader briefing separately publishes `patternCounts` per type and a participation
percentage.

We have never checked whether those are *jointly* safe. SDC's whole point is that individually
safe cells can be jointly disclosive.

**Action:** an inference-attack pass that treats the entire payload as a table. This is a real
gap and it is cheap to test.

### B2 · Configurable vocabulary for metric streams

Smartabase's selling point is a "flexible data architecture" over arbitrary imported metrics.
Kitman's is configurable dashboards per role.

Meanwhile the pilot rehearsal found that our leader briefing reads `_canonicalMoodSeries`, which
requires a label matching `/mood/i`. **An identical stream labelled "session engagement"
produces no briefing at all.** A school sending "wellbeing" or "check-in score" gets an empty
page and no error.

Both competitors would ingest that without blinking. **This is the most embarrassing gap in the
list and the cheapest to close.**

### B3 · CPOMS integration for any school deployment

Not a pilot blocker for Alma. A hard requirement for Falcon. Both of our nearest school
competitors integrate into it, which tells us schools will not adopt a second safeguarding
record.

### B4 · Say the EU AI Act thing out loud

Article 13 transparency obligations for high-risk systems take effect **August 2026** — now —
with penalties up to €35m. Education and employment are named high-risk categories.

The requirement is that a person can interpret an output and understand how the decision was
made. Our provenance, citation and epistemic-ladder architecture is **already ahead of this**,
while most feedback platforms do theme extraction and sentiment with no traceability at all.

**This is a moat and we do not currently claim it.** It belongs in the pilot conversation with
Alma, not just in the code.

### B5 · Record that "policy as data" has an existence proof

G9 stays parked. But `docs/rnd/intelliq-rnd-program.md` should note Palantir Action Types as a
production implementation of the pattern, so the next person to raise it starts from evidence
rather than from scratch.

---

## 5 · WHAT WE DO THAT NONE OF THEM APPEAR TO

Stated carefully, because "nobody does this" is usually wrong:

1. **Origin counting, not contributor counting.** No competitor surfaced in this research
   distinguishes five people repeating one account from five independent accounts. Every survey
   platform counts responses. This is our sharpest technical differentiator and it is invisible
   in a demo unless we show it.
2. **The contribution boundary — membership is not consent.** Employee-listening tools treat
   everything said in a survey as the organisation's material by construction. We require a
   deliberate act per item, with a valence the person chooses.
3. **The group as a first-class subject.** Competitors aggregate individuals into a team view.
   We hold an inquiry *about the team* that can be corroborated, contested, corrected and
   withdrawn on its own terms.
4. **Refusing to conclude.** `MODEL_MAY_PROPOSE` excludes `conclusion`. Every competitor ships
   AI-suggested action plans as assertions.
5. **A meaningful capability with models disabled.** No competitor claims this. It is worth
   proving publicly, and `no-llm-floor-smoke` now can.

---

## 6 · WHAT THEY HAVE THAT WE DO NOT — honestly

- **Validation.** STEER is peer-reviewed. We have assertions, not evidence of effect.
- **A structured instrument.** STEER runs a designed assessment three times a year. We rely on
  conversation, which is richer and far less reliable at producing data on a schedule.
- **Benchmarks.** Every listening platform offers norms across organisations. We have one org.
- **Integrations.** Wearables, medical, MIS, CPOMS.
- **Trust.** Teamworks and Kitman have been in athletic departments for years.

The honest read: **we are better on epistemics and worse on everything operational.** For a
pilot that is survivable, because the pilot is testing the epistemics. It is not survivable at
the second or third customer.

---

## 7 · WHAT TO DO BEFORE THE PILOT

| # | Action | Class | Owner |
|---|---|---|---|
| 1 | Decide the cohort floor: default 5, per-org, explicit override | **founder decision** | founder |
| 2 | Fix the `/mood/i` vocabulary dependency (B2) | **code, cheap** | next session |
| 3 | Whole-payload inference-attack pass (B1) | **code, bounded** | next session |
| 4 | Put the EU AI Act transparency position in the Alma conversation (B4) | **positioning** | founder |
| 5 | Note Palantir Action Types against G9 (B5) | **documentation** | done with this file |
| 6 | CPOMS integration | **post-pilot, Falcon blocker** | — |

Items 2 and 3 are the only code changes this research implies before the pilot. Item 1 is the
one that matters most and it is not ours to make.

---

## 8 · SOURCES

Market: Teamworks / Smartabase, Kitman Labs, STEER Education, Komodo Wellbeing, CPOMS,
Culture Amp confidentiality guidance.
Architecture: Palantir Foundry Ontology documentation, Temporal durable-agent guidance,
Open Policy Agent and Cedar guardrail practice, Microsoft Agent Governance Toolkit.
Disclosure control: US Federal Committee on Statistical Methodology SPWP-22, Department of
Education / PTAC-vetted state suppression guidance, tabular cell-suppression literature.
Regulation: EU AI Act Article 13 transparency obligations, effective August 2026.
