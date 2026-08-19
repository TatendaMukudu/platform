# Architecture review — what is IntelliQ harnessed to?

**Reviewer:** Claude (architecture) · `main` @ `8e13bce`
**Headline: the premise is substantially already built. Do not create a new primitive.**

Every claim cites the implementation. Where I did not verify something I say so.

---

# Section 1 — Current state

## The one path that IS harnessed to organisational purpose

It exists, end to end, and it is the important one:

```
POST /api/org-context/preview   (server.js:9729)   natural language → PROPOSED records
POST /api/org-context/confirm   (server.js:9751)   → _confirmOrgContext (:9493)  human authorises
        ↓
_orgContextConfig(code) → _buildOrgStateInputs (:9478)
        ↓
orgState.deriveOrgState(...)    (server.js:9544)
        ↓
orgState.stateToUncertainties(state) → inquiry.buildUncertainty(u)   (:9555, :9875)
        ↓
                          INQUIRIES
```

`ai/org-context.js:18` models `['event','objective','responsibility','requirement','rhythm','dependency','decision']`.
`ai/org-state.js:91` normalises an `objective` carrying `scope`, `owner`, `status`, `priority`,
`targetAt`, **`successCriteria`** and **`provenance`**.

So: *an organisation states an objective, a human confirms it, and it generates inquiries.* That
is the founder's core loop, already implemented. `ai/org-state.js:258` even knows when the mandate
is missing — it emits the limitation `"no explicit objectives/events configured — state is thin"`.

**The productised-consultant claim is TRUE.** `/api/org-context/preview` takes how someone
describes their organisation and returns proposed structured records for confirmation. It never
auto-confirms (`ai/org-context.js:11-13`), and it hard-blocks surveillance/wellbeing content from
becoming operating rules (`:12-14`, `FORBIDDEN` at `:22`). That is the strategic asset, and it is
built.

## What is harnessed to tenant identity only

Everything else. Traced by asking one question of each subsystem: *does it read an objective, or
only `orgCode`?*

| Subsystem | Root today | Harnessed to purpose? |
|---|---|---|
| Evidence log | `evidenceLog[code]` | **No** — tenant only |
| Retrieval | `_retrieveGrounding({code, purpose, …})` (`:8273`) | **No** — see below |
| Belief kernel | `ai/reason.js` | **No** — zero `objective` references |
| Inquiry kernel | `ai/diagnose.js` | **No** — zero references |
| Admissibility | `ai/admissibility.js` | **No** — zero references |
| Outcome intelligence | `ai/outcome-intelligence.js` | **No** — pattern/intervention only |
| Forum | `forumThreads[code]` | **No** |
| Intelligence feed / priority | `ai/intelligence-feed.js` | **No** |
| Connectors, persistence, audit | keyed by `orgCode` | **No**, correctly |

**The `purpose` parameter in `_retrieveGrounding` is a false friend.** It is an *authorisation*
scope — `personal_assistance`, `organisation_reasoning` (`server.js:7347-7348`) — not an
organisational objective. Retrieval understands who may see something. It has no concept of what
the organisation is trying to achieve.

## The dead primitive — and a live pilot trap

`orgGoals` (`server.js:964`) is a **second, competing concept** that already exists and is orphaned:

- written by `POST /api/org/goals` (`:13315`) and from a profile import (`:2030-2031`)
- read back by `GET /api/org/goals` (`:13308`), edited (`:13324`), deleted (`:13334`)
- persisted (`:155`, `:5868`)
- **consumed by no reasoning subsystem anywhere**

There is a goals UI endpoint. If Falcon's admin types their goals into it, those goals go into a
store that nothing reads. They will believe they have told IntelliQ what matters. They will not
have. This is the sharpest pilot risk in this review.

`orgValues` (`:963`) is marginally better but not harnessed either: it reaches LLM prompt text
(`:638`, `:743`, `:505`) and nothing deterministic.

---

# Section 2 — Gap analysis

| Requirement | Status | Evidence |
|---|---|---|
| Natural-language onboarding → proposed context → human confirmation | **ENFORCED** | `/api/org-context/preview` + `/confirm`, `_confirmOrgContext:9493`; `org-context-http-smoke` |
| Objectives carry success criteria | **ENFORCED** | `ai/org-state.js:94` `successCriteria` |
| Declared context never auto-confirmed | **ENFORCED** | `ai/org-context.js:11-13`; authority-by-confirmer |
| Surveillance content cannot become an operating rule | **ENFORCED** | `ai/org-context.js:22` `FORBIDDEN`; `org-context-smoke` |
| Goals produce inquiries | **ENFORCED** | `stateToUncertainties` → `buildUncertainty` (`:9555`) |
| Organisational provenance on objectives | **PARTIAL** | `provenance` exists (`org-state.js:95`) and `prov()` (`:86`) records `source`/`kind`/`confidence` — but **no `by` and no `at`**. We know a thing was declared; not who declared it or when. |
| Declared ≠ observed | **PARTIAL** | `prov.kind` distinguishes `'explicit'` from `'derived'` — the seam is right. But the belief kernel never reads it, so nothing downstream treats a declaration differently from evidence. |
| Versioned mandate; history not rewritten | **PARTIAL** | org-context supports supersession (covered by `org-context-http-smoke`). Not verified that a belief formed under v1 remains interpretable after v2. Marked PARTIAL rather than claimed. |
| Contextual retrieval | **OPEN** | `_retrieveGrounding` has no objective input. Deliberately deferred — see §5. |
| Governed AI; generated content is not authority | **ENFORCED** | `assembleGoverned` demotes uncited claims (`prompt-injection-smoke`); `requiresConfirmation` throughout |
| Goal → inquiry → evidence → belief → intervention → outcome traceable | **PARTIAL** | Each link exists; the chain is not joined. An inquiry does not record which objective produced it. |
| One organisational-purpose concept | **CONTRADICTS** | `orgGoals` is a parallel dead concept with live CRUD endpoints |

---

# Section 3 — Recommended root model

## **C — compose existing primitives. One promotion, one retirement. No new object.**

**Do NOT introduce `OrganizationalMandate`.** It would be a third concept alongside
`org-context` records and `orgGoals`, and the second one is already causing the problem this
review found. A god-object here buys nothing that `objective` + `provenance` + supersession does
not already provide.

**Promote:** `ai/org-context.js` records — specifically `objective` — as the architectural root
for organisational purpose. It already has the right shape, the right governance (propose →
human-confirm), the right refusals, and the only working path to inquiries.

**Retire:** `orgGoals`. Either redirect `/api/org/goals` onto org-context objectives, or remove
the endpoints. Leaving a writable store nothing reads is worse than not having it.

**The Mandate is a view, not a table.** "What Falcon says it is" is the set of confirmed
org-context records at a point in time. Versioning is supersession, which exists. Adding a
wrapper object would duplicate state that must then be kept in sync — the classic second source
of truth.

---

# Section 4 — Invariants

Corrected against the implementation rather than adopted as given.

**M1 · One organisational-purpose concept.** An organisation's objectives live in exactly one
place. A store that accepts organisational goals and is read by no reasoning path is a defect.
*(Currently CONTRADICTED by `orgGoals`.)*

**M2 · No objective without human provenance.** Every objective records who supplied or approved
it and when, in addition to the existing `source`/`kind`/`confidence`.

**M3 · Declared is not observed.** An objective's `provenance.kind === 'explicit'` means *this was
stated*, never *this is true*. No confidence derived from evidence may be attributed to a
declaration, and no declaration may be counted as an origin in `deriveConfidence`.
*(Note: the correct wording is narrower than the founder's draft. A declaration IS evidence — of
what leadership believed at T0. What it is not, is evidence that the claim is correct.)*

**M4 · Changing the mandate does not rewrite history.** Superseding an objective leaves prior
objectives, and everything formed under them, intact and readable.

**M5 · A belief remains interpretable under the mandate active when it formed.** An inquiry
records which objective produced it, so a later reader can ask "why did we care about this?"

**M6 · Machine-proposed context is never self-authorising.** Already true and must stay true.

**M7 · Retrieval relevance never overrides governance.** An objective may inform what is *worth*
retrieving; it may never widen what is *permitted*. Admissibility and purpose-scoping run first.
*(This one matters most for the future seam — see §5.)*

---

# Section 5 — Pilot-minimum design

Ruthless. The harness path already works; the pilot needs it to not be undermined.

## P0 — required before Falcon

**P0-A · Retire the competing goals concept.** One place for objectives. Without this, Falcon's
admin can type their purpose into a dead store — the pilot's first impression is a lie.

**P0-B · Objectives record who declared them and when.** `prov()` gains `by` and `at`. Roughly
three fields; makes M2 real and is the basis of every later "you told us at T0" statement.

**P0-C · An inquiry records the objective that produced it.** One field on the uncertainty path
(`stateToUncertainties` → `buildUncertainty`). This is the join that makes the whole chain
traceable, and it is the cheapest high-value change in this review.

That is all. Three small changes.

## P1 — valuable during the pilot, not before

- Surfacing "you declared X at T0; evidence since indicates Y" as a leader-facing read.
- Objective-aware ranking in the intelligence feed.
- Contextual follow-up question generation beyond what `preview` already does.

## P2 — after the pilot teaches us

- Objective-aware retrieval (the seam is one optional parameter on `_retrieveGrounding`; do not
  build it now).
- Richer ontology, sector templates, mandate diffing, cross-objective dependency reasoning.

**Explicitly NOT building:** an `OrganizationalMandate` object, a goal hierarchy, OKR machinery,
a second retrieval path, or any sector-specific onboarding schema.

---

# Section 6 — Falcon onboarding flow, on the existing architecture

No new architecture required. This is `/api/org-context/preview` used properly.

```
1  UNIVERSAL LAYER — asked of every organisation
   What is this organisation? Why does it exist? What is it trying to accomplish?
   What outcomes define success? What must not be sacrificed? Who may change these?
   How is it structured?

2  FALCON ANSWERS, in prose
   "A boarding school. Academic achievement, character formation, independence,
    sport. We think our biggest problem is communication between houses and staff."

3  PREVIEW  → proposed records, nothing persisted
   objective  "Academic achievement"      successCriteria: <asked, not assumed>
   objective  "Character formation"       successCriteria: <asked>
   declaration "Leadership believes communication between houses is a problem"
               provenance { kind: 'explicit', by: <head>, at: T0 }
   responsibility / rhythm / structure records

4  CONTEXTUAL FOLLOW-UPS — driven by what they said, not a fixed script
   "How do you currently know whether character formation is occurring?"
   "Where are you least confident?"
   "What are you already trying?"

5  HUMAN CONFIRMATION  → _confirmOrgContext. Authority is the confirmer's.

6  UNKNOWNS become the first inquiries
   org-state emits "no evidence bears on character formation" as an uncertainty,
   which becomes a proposed inquiry, which a human accepts.

7  EVIDENCE accumulates against those inquiries. The loop starts.
```

The communication claim enters as a **declaration with provenance**, not as a fact. Six months
later IntelliQ can say: *"Leadership stated at T0 that communication was the main problem.
Evidence since points at Fridays and one house. Here is what remains contested."*

That sentence is the product. It requires P0-B and P0-C and nothing else.

---

# Section 7 — Test plan

| Invariant | Failing test to write first | Asserts |
|---|---|---|
| M1 | `scripts/org-mandate-smoke.js` | An objective written through the goals path is readable through the objectives path; no store accepts organisational goals that no reasoning path reads |
| M2 | same | An objective without `provenance.by` and `provenance.at` is rejected at confirmation |
| M3 | same | A declaration never appears as an origin in `deriveConfidence`; declaring something does not raise confidence in it |
| M5 | same | An inquiry generated from an objective records that objective's id, and still resolves it after the objective is superseded |
| M4 | covered | `org-context-http-smoke` already covers supersession/history |
| M7 | covered | `retrieval-smoke`, `private-evidence-smoke` already cover governance-before-relevance |

One new suite, four assertions. Written before implementation, by me, per the established split.

---

# Section 8 — Codex brief (P0 only)

**Not yet written.** The three P0 changes are small and well-defined, but the P0 pilot-blocker
queue (`docs/briefs/p0-pilot-blockers.md`) is dispatched first and touches `server.js` in regions
that P0-A and P0-C would also touch. Writing this brief now would create avoidable merge conflict
with work already in flight.

**Sequence:** current P0 blockers land → I write `org-mandate-smoke.js` → one Codex brief for
P0-A/B/C together (they are one coherent change, not three).

---

# The plain-English answer

> **If Falcon completes onboarding tomorrow, roughly the question-asking half of IntelliQ becomes
> harnessed to what Falcon says it exists to accomplish. The answer-forming half only knows the
> data belongs to Falcon.**

Concretely. Falcon states its objectives, a human confirms them, and those objectives **do** shape
what IntelliQ notices is missing and what it proposes investigating — through
`org-state → stateToUncertainties → inquiries` (`server.js:9555`). That path is real and it is the
one that matters most, because it decides what the organisation ends up looking at.

But once an inquiry exists, everything downstream forgets why. The evidence log, retrieval, the
belief kernel, admissibility, outcome intelligence and the forum contain **zero references to
objectives**. They know the tenant. They do not know the mission. A belief about Falcon is formed,
ranked, contested and resolved without any component being able to say which of Falcon's
objectives it bears on.

And there is a live trap: `orgGoals` has working CRUD endpoints and no readers. Falcon's admin can
enter their goals there and nothing in the system will ever consult them.

**The good news is how small the gap is.** The founder's premise is not a rebuild — it is three
fields and a retirement. The harness exists; it is attached at one end.
