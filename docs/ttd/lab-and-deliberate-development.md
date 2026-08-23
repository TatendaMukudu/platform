# Lab, deliberate development, and the three intelligences

> **EXPLORATION, NOT LAW.** Predates the High/Low/Inquiry/Focus/Web ratification. Where it and
> `intelliq-constitution.md` §2 differ, the constitution governs.

**Status:** architecture exploration. Nothing implemented. Nothing queued ahead of the pilot
blockers.

**Verdict in one line: Lab already exists and is called `mem.focuses`. It is one string, a status
and an outcome, and it already runs the founder's loop end to end — High/Low → deliberate work →
outcome → learning. Every richer thing the founder wants to hang off it also exists, in six systems
that do not know about each other. Lab is not a new domain object. It is a foreign key.**

The one part of this proposal I would resist outright is section 10 — strengths recommending
mentors. Not the ambition. The mechanism, which cannot be built from what exists without leaking
both people. Section J says why, and what a safe version looks like.

---

# 0 · What I checked

Read: `ai/self-model.js`, `ai/person-model.js`, `ai/lifecycle.js`, `ai/assessment-view.js`,
`ai/org-playbook.js`, `ai/priority-office.js`, `lib/action.js`, plus the modules covered in the
two prior explorations. Read in region in `server.js`: the assessment lifecycle (5040–5800), the
focus lifecycle (4550–4600), memory (1060–1090), interventions (4010–4065), capability
observations (7595–7645), the canonical assessment reader (7611–7640), library (12580–12660),
scenarios (14590–14760), goals (15626–15680). Searched for: goals, skills, interventions,
outcomes, habits, recommendations, resources, preferences, external retrieval.

---

# A · Existing capability map

| Founder's Lab concept | Exists as | Where | Gap |
|---|---|---|---|
| "I want to work on this" | **`mem.focuses`** — `{ id, text, type, status: active\|done, outcome, createdAt, resolvedAt }` | `server.js:1071`, created 4568, closed 4583 | It is one line of text. No goal, no origin, no people, no resources, no assessment |
| Approve → it becomes work | `POST /api/me/prepared/act` | `server.js:4557` | none — this is the "Work on this" button, already built |
| Report how it went | `POST /api/me/focus/outcome` — `helped \| no \| mixed` | `server.js:4583` | none |
| Outcome teaches the system | feeds `_recordNoticeFeedback` → the Confidence Engine | `server.js:4576`, `4600` | none |
| Goal | `memberGoals` + `normalizeMemberGoals` | `server.js:964`, `15626` | Profile-derived, `{ title, status, source }`, not linked to anything |
| Baseline / assessment | `assessmentTemplates` + `assessmentAssignments` | `server.js:978-979` | See H |
| Self-assessment | `selfOnly` path in assign | `server.js:5397` | Exists; never surfaced as a baseline |
| Reassessment | assessments are timestamped and rubric-versioned | `criteriaVersion`, `server.js:5410` | **Nothing compares assessment N to assessment 1** |
| Practice / exercise | **scenarios** — AI-drafted, assigned, responded to, scored on strength/development dimensions | `server.js:824`, `14590`, `14710` | Keyed by member *name* (`memberKey`), a real weakness |
| Intervention | `orgInterventions` + `POST /api/intelligence/act` | `server.js:4017` | Leader-owned; tied to `patternType` |
| Intervention outcome | `POST /api/intelligence/outcome` — `positive \| neutral \| negative` | `server.js:4042` | none |
| What worked, ranked | `outcome-intelligence.summarize` — ranks interventions by outcome, never by volume | `ai/outcome-intelligence.js` | none; `pilot-loop-smoke` §6 asserts it |
| Organisational learning | `ai/org-learning.js` observations → `ai/org-playbook.js` candidate practices → leader confirms | both modules | Never reaches a member's development |
| Strengths / development areas | `_capabilityDims(code, id, 'strength'\|'development')` over canonical capability observations | `server.js:7595` | Computed for leader support; not a user-facing thing to work on |
| Internal resources | `libraryItems` (`note\|chat\|artifact`, private\|shared, folders) + `orgTutorials` (title, body, **url**, kind) | `server.js:12580`, `985`, `5803` | No relevance model; nothing recommends one |
| External resources | **nothing** | searched: no web search, no fetch except configured connector URLs behind `_urlIsSafe` | The largest genuine gap in this document |
| Preferences | `proactivePrefs` (`length/tone/cadence`, allow-listed) · `personModel` VOCAB · `selfModel` PATTERNS | `server.js:4102`, `ai/person-model.js:26`, `ai/self-model.js:36` | No learning-format preference |
| Ask before adopting a preference | `askFirstOffer`, `requiresConfirmation: true` | `ai/priority-office.js:102` | none — the right pattern already |
| Execution contract | `recommend → draft → confirm → execute → observe → evaluate → learn` | `lib/action.js:26` | Never used for development work |
| Participants on a development object | **nothing** | | See I |
| Privacy scope on development | assessment visibility `private` → owner + personal purpose only | `server.js:7628` | Focuses have no visibility field at all |
| Progress visualisation | **nothing** | unchanged from `expression-and-initiative.md` §4 | |

## A.1 · The finding that reframes the whole document

`server.js:4557-4600` is the founder's Lab loop, complete, shipped, and rendered:

```
a High or Low produces a suggestion (proposal-gated)
  → POST /api/me/prepared/act { decision: 'approve' }
  → mem.focuses.unshift({ text, type, status: 'active', outcome: null })
  → rendered on Home as "Your focus" with Helped / Didn't buttons  (js/member-view.js:380-389)
  → POST /api/me/focus/outcome { outcome: 'helped' | 'no' | 'mixed' }
  → _recordNoticeFeedback(code, type, 'useful' | 'dismiss')
  → the Confidence Engine stops surfacing kinds of noticing that don't help this org
```

That is: **understand → choose → try → measure → learn → adapt.** All six stages of the founder's
section 19 loop, in forty lines, self-scoped, with the outcome feeding back into what gets
surfaced. It has been running the whole time and nobody called it Lab.

What it does not have is everything else in this document.

---

# B · Lab necessity verdict

**Lab is not a new domain concept. It is a container — and the container already exists in
degenerate form.**

Concretely, the founder's Lab decomposes into things that all exist:

| Lab section | Is really | Already a domain object? |
|---|---|---|
| Goal | a stated intention | `memberGoals` — yes, weakly |
| Why / origin | provenance | **no — the missing foreign key** |
| People | participants | no |
| Current focus | `mem.focuses[i]` | **yes — this is the container** |
| Practice / action | a scenario, or an intervention, or a focus | yes, three ways |
| Resources | library items, tutorials | yes internally, no externally |
| Assessments | assignments + canonical assessment evidence | yes, fully |
| Reflections | notes, check-ins, assistant turns | yes |
| Progress | reassessment delta | **no** |
| Evidence | canonical envelopes | yes |

**Nine of ten already have a home. The Lab's job is to hold references to them and to record why
they belong together.** That is a join table with a provenance record, not a new kernel.

The honest statement of what to build is therefore not "build Lab". It is:

> **Grow `mem.focuses` from `{ text }` into a record that knows where it came from, what it is
> trying to change, what has been tried, and what would count as evidence that it worked.**

And that is the same shape of fix `organisational-harness-review.md` prescribed for inquiries not
recording their objective, and `organisational-harness-addendum.md` prescribed with `prov()` gaining
`by` and `at`. **Three separate explorations have now independently found the same missing
primitive: things in this system do work and forget why they started.**

## B.1 · Should the user-facing word be "Lab"?

The concept is real and the name is good — it says *deliberate, bounded, reversible, experimental*,
which is exactly right and is not what "goal", "plan" or "task" say. Keep the word. But note that
it names a **container over existing objects**, not a new kind of thing, and the moment it starts
acquiring its own storage for goals, resources, assessments or messages, it has become the seventh
parallel system in a codebase that already has `orgGoals`, `orgGroups`, `orgMessages` and
`memberGoals` competing with things the kernel actually reads.

---

# C · High → Lab

Works today, end to end, with one gap.

```
kernel finding (recovering | quiet_improvement | milestone)          ai/intelligence, _streakMilestones
  → proactive.toInsight → polarity 'progress' | 'milestone'          ai/proactive.js:244
  → behaviour.plan → bucket 'worth_celebrating'                      ai/behaviour.js:33
  → the card carries a suggestion, proposal-gated                    proactive MESSAGES[type].self.suggestion
  → "Talk this through" opens a governed thread                      js/member-view.js:2865
  → the suggestion button → /api/me/prepared/act approve             js/member-view.js:2801
  → mem.focuses gains { text, type: patternType }                    server.js:4568
```

**The founder's "This looks worth nurturing. Want to work on it in Lab?" is one string change** —
the existing `EXPLORE.progress.self` already says *"What do you think helped create this? Worth
protecting what's working."* (`ai/proactive.js:55`), which is the same move without the container.

**The gap:** `mem.focuses` records `type: patternType` but not *which insight*. `dedupeKey` is
`subjectId:patternType:audience` (`ai/proactive.js:244`) and is stable — so recording it is one
field, and it is what makes "why does this Lab exist" answerable later.

**Two things must not happen**, and neither does today:
- A High must not auto-create a Lab. `prepared/act` requires an explicit decision (4561). Correct.
- A Lab created from a High must not be visible to a leader by default. Focuses are self-scoped
  (`_getMemory(code, userId)`, keyed `${orgCode}:${userId}`). Correct today, fragile — see N.

---

# D · Low → Lab

Identical code path. `needs_attention` is the same bucket machinery with `polarity: 'risk'`, the
same card, the same suggestion, the same approve route.

The one asymmetry worth naming: **the founder's Low → Lab list is much longer than the High list**
(baseline, assessment, goal, practice, intervention, reflection, resources, human assistance,
reassessment, outcome). That asymmetry is how Lab becomes a remediation centre despite section 1
forbidding it. If the first Lab built is a Low Lab with ten sections and the High Lab is a card
with a nurture prompt, the product will have said which one it is really for.

**Build the High path first.** It is the same code, it is the harder product question, and it is
the one that distinguishes this from every performance-improvement tool.

---

# E · Inquiry → Lab

This is the path with the least existing support and the clearest conceptual case.

**What exists.** `ai/inquiry.js` already models the exact decision the founder describes. Every
uncertainty carries `hypotheses`, `derivable` ("could this be answered from evidence we already
hold?"), `systemOfRecord` ("an authorised record that could answer without asking a person"), and
`resolutionOwner` (`ai/inquiry.js:44-58`). The module's governing rule is written as:

> *"Ask 'what decision / risk / goal / uncertainty would this resolve — and is asking this person
> the safest, least-costly way to resolve it?'"* — `ai/inquiry.js:16`

**That is already a resolution-strategy chooser.** It knows the options are: derive it from
evidence we have, read it from a system of record, or ask a person. The founder is adding a fourth:
**test it**.

That is a genuinely new member of an existing enum, not a new system — and it is the cleanest
addition in this entire document. `UNCERTAINTY.UNSUPPORTED_HYPOTHESIS` already exists
(`ai/inquiry.js:27`) and is described as *"a pattern has competing explanations, none confirmed"* —
which is precisely the case where an experiment beats another question.

**The founder's distinction holds and the architecture already encodes it:**

> Inquiry investigates. Lab deliberately tries.

An Inquiry is `ai/diagnose.js` accumulating evidence about a subject. A Lab would be an
`lib/action.js` record — `recommend → draft → confirm → execute → observe → evaluate → learn` —
whose `observe` produces evidence back into that Inquiry. **They are already different objects with
different modules.** Do not collapse them; the code has not.

**What is missing:** a resolution strategy of `experiment`, and the outcome of that experiment
entering the Inquiry through the existing contribution boundary rather than a new door.

---

# F · User-created Lab

*"I want to become better at public speaking."*

**What exists.** Almost all of the pieces, none of the path:

- The intent is captured — `ai/capture.js` distinguishes an explicit save command from a
  declarative statement, and `looksDeclarative` exists precisely so the caller can *offer* rather
  than save silently (`ai/capture.js:15`).
- Goals exist — `memberGoals` (`server.js:964`), but populated only from the onboarding profile
  (`server.js:1942`) and read by prompt-assembly, not by any development machinery.
- Practice exists — `POST /api/draft-scenario` (`server.js:824`) drafts a practice exercise with a
  model, assignable and scorable.
- Assessment exists — a self-assigned template is already legal (`selfOnly`, `server.js:5397`).

**The genuine gaps:**

1. **No route from a stated intention to a focus.** `mem.focuses` can only be created by approving
   a prepared suggestion (`server.js:4557`). There is no `POST /api/me/focus` with a user's own
   words. That is the single smallest missing piece in this document and it unlocks all of §6.
2. **`memberGoals` is a dead-end store**, read by prompt assembly and nothing else — the same
   pattern as `orgGoals`, which is already queued for retirement (P0-A). **Do not connect Lab to
   `memberGoals`.** Either the focus carries its own goal text, or `memberGoals` gets promoted the
   way `org-context` objectives are being promoted. Two dead goal stores is already one too many.
3. **Scenario drafting is keyed by member name**, not id (`memberKey(code, resolvedName)`,
   `server.js:14618`) — a real defect that would surface immediately if scenarios became a
   development primitive.

---

# G · Lab → High / Low / Inquiry feedback

**Partially works, and the part that works is the important one.**

Works today:
- Focus outcome → `_recordNoticeFeedback` → the Confidence Engine stops surfacing kinds of
  noticing that do not help (`server.js:4600`). The system genuinely learns from development.
- Intervention outcome → `outcome-intelligence.summarize` → ranked by what worked, with
  `limitations: ['not_causal']` and stated historically ("was followed by"), guarded by
  `ai/language-guard.js` and asserted by `pilot-loop-smoke` §6.
- Org memory → `ai/org-learning` observations → `ai/org-playbook` candidate practices → a leader
  confirms → org knowledge. Counter-evidence first, confidence as a band, never causal.

**Does not work:**
- A focus outcome produces **no evidence about the person**. `helped` teaches the Confidence
  Engine about a *pattern type*; it never enters `evidenceLog` as an observation that this person
  worked on something and it went well. So the founder's `Low → Lab → improvement → High` loop
  cannot close: the High would have to be detected independently from the underlying signals,
  which it might be, by coincidence.
- Nothing carries the origin, so nothing can say *"this High followed the work you did"* — the
  claim the founder most wants and the one that most obviously must not be causal.

**The correct shape**, using only existing machinery: a completed focus emits a canonical evidence
envelope of `primitive: 'outcome'` (`ai/primitives.js:12`), subject `member:<id>`, authority
`self_report`, with `limitations` carrying `not_causal`. It then flows through the same kernel as
everything else. **No new evidence system**, which §24 forbids and which would be the obvious wrong
move.

---

# H · Assessment audit

## H.1 · What assessments actually are today

A **leader-assigned instrument**, not a self-measurement tool.

```
leader creates a template          assessmentTemplates[code]           server.js:978
  → assigns to members             POST /api/assessments/assign        5391
     criteria SNAPSHOTTED + versioned at issue — a later template edit cannot rewrite history (5408)
  → member submits                 POST /api/assessments/:id/submit    5463
  → leader returns with feedback + score 0..100                        5718
  → _canonicaliseAssessment → canonical evidence with assessor, rubric, scale, feedback,
     submissionId, confidence, limitations                              5731
  → the naked score is RETIRED from the signal stream — a contentless completion marker only (5735)
```

Two things here are genuinely excellent and constrain everything below:

**H.1.1 · The naked number was deliberately killed.** `server.js:5733`:

> *"the value-bearing legacy score signal is RETIRED to a CONTENTLESS completion marker. Every
> consumer now reads canonical evidence, so no assessment value re-enters a stream."*

And `_assessmentEvidenceFor` (`server.js:7618`) is documented as *"reasoning consumes the whole
object — assessor, rubric, scale, feedback — never an isolated number."* The founder's constraint
*"do not invent scores merely to make progress visual"* is not a new rule. **It is a rule this
codebase already fought for and won**, and any Lab progress bar is an attempt to re-lose it.

**H.1.2 · `ai/assessment-view.js` already refuses to lead with a score**, distinguishes a generated
projection from real human feedback, and detects placeholder feedback repeated across members so it
is never presented as individual. That module is what a Lab checkpoint should render.

## H.2 · Do assessments belong inside Lab?

**Partly, and the split matters more than the answer.**

| Kind | Belongs in Lab? | Why |
|---|---|---|
| Self-assessment ("where do you think you are now?") | **Yes** | It is the person's own instrument, private, and it is the only honest baseline for personal development. Legal today (`selfOnly`) and surfaced nowhere |
| Invited human assessment (a coach the user asked) | **Yes, with consent as the gate** | The invitation is what makes it development rather than appraisal |
| Leader-assigned organisational assessment | **No** | This is a work judgement with a score, an assessor, and an audit trail. It is a record *about* the person for the organisation. Putting it inside a development container makes the container a performance file — see N.2 |
| Evidence-derived measures | **Only where the person can see the derivation** | `ai/assessment-view.js` already does this properly |

**The load-bearing distinction: who owns the instrument.** The privacy architecture already knows
this — `_assessmentEvidenceFor` admits a `private` assessment only for its owner under a personal
purpose, and *never* for a leader-facing purpose (`server.js:7628`). **A Lab assessment should
default to `visibility: 'private'`**, which makes it structurally invisible to leader reads without
a single new rule.

## H.3 · Reassessment is the actual missing feature

Assessments carry `criteriaVersion` and are timestamped and rubric-tagged. Nothing anywhere
compares assessment N to assessment 1 on the same rubric. The founder's *"You've worked on this
several times. Want to reassess?"* needs one comparison function and a trigger — and the trigger
already has a home: `ai/lifecycle.js` turns a stale-but-required record into a proactive uncertainty
the Inquiry Engine decides whether to ask about. **A baseline that has gone stale relative to work
done is exactly that shape.**

---

# I · Human collaboration without cloning Forum

**The distinction is clean and the architecture supports it: Forum is a place to talk. A Lab is a
place to work. A Lab does not need messages.**

If a Lab needs a conversation, it should *have a Forum thread*, not *be one* — the same
relationship a card thread already has to `/api/assistant/turn` (`js/member-view.js:2900`). One
`threadRef` field, and every messaging concern stays in exactly one place.

**What a Lab needs that Forum does not provide:**

| Need | Forum | Lab |
|---|---|---|
| Who is here | node membership or (proposed) participant set | an explicit invited set — always small, always by name |
| What they can do | read + post + contribute their own account | observe, assess, suggest a resource, respond to a reflection |
| Why they are here | they are in the group | **the owner asked them** |
| Default | everyone in the node | **nobody** |

That last row is the whole design. **A Lab is private by default and grows by invitation; a Forum
thread is shared by default within a scope.** Building Lab participation on the Forum participant
model would invert the default, which is the failure mode.

**What can be reused directly:** `mayRead` / `mayPost` / `mayEdit` as a shape (`ai/forum.js:104`),
and — crucially — `mayContributeMessage`'s rule that *only the author may offer their own statement
as evidence* (`ai/forum.js:127`). An invited coach observing a Lab must not be able to turn the
owner's reflection into organisational evidence. That rule already exists and must apply here
verbatim.

**Never silently invite** (§24). `contribution.mayContribute` already requires `explicit: true`
with the reason *"contribution must be deliberate, never automatic"* (`ai/contribution.js:132`).
Same discipline, applied to invitation.

---

# J · Expertise recommendation — and the one refusal

## J.1 · Why "invite your coach, they helped here before" is safe

`_personStrengths` / `_capabilityDims` (`server.js:7595`) compute a person's recurring strength
dimensions from canonical capability observations. Recommending *your own* coach based on *their
prior contributions to your own record* uses only evidence the user is already authorised to see.
That is safe, and it is the founder's strength example. Build it.

## J.2 · Why section 10 cannot be built from what exists

*"You've become particularly strong at X. There is an opt-in Lab working on X. Would you be
interested in contributing?"*

This requires two reads and **both leak**:

1. **Reading person A's strength.** `_capabilityDims` is called with `purpose: 'leader_support'`
   (`server.js:7596`), and the strengths derive from assessments scored by *their* leader. Using
   that to make an offer to A about someone else's Lab is a use of A's performance record for a
   purpose A never agreed to. The self-model states the governing principle for exactly this case:
   a personal model *"is NEVER shared with a leader above them and never used to evaluate them — it
   only ever proposes a convenience back to the person it's about"* (`ai/self-model.js:17`).
2. **Knowing that a Lab about X exists.** Even unnamed, the existence of an offer is information.
   The founder's own constraint — *"do not expose another user's weakness to recommend a mentor"* —
   is violated by the offer itself if the pool is small. A squad is a small pool. So is a
   department. **k-anonymity does not survive contact with a team of eleven.**

## J.3 · The version that is safe

Invert the direction. **The person who wants help searches; the person who could help has already
volunteered.**

- A person may **declare** an area they are willing to help with. Explicit, revocable, theirs. It
  is a *declaration* — the record type `organisational-harness-addendum.md` already identified as
  missing (P1) and which would now have a second use.
- A Lab owner may **ask** to be matched, and sees only people who declared.
- IntelliQ may **rank** declared helpers using evidence the asker is already authorised to see, and
  must be able to answer "why this person" from that evidence alone.
- IntelliQ **never initiates** the offer to the potential helper. The helper's willingness was
  given once, in advance, deliberately.

This gives the founder people-teaching-people without either read in J.2, and it reuses a record
type already on the roadmap.

## J.4 · The persistent-difficulty case

The founder's phrasing is already correct and — importantly — is **already expressible under the
existing language guard**:

> *"You've worked on this for several weeks, but your own assessments haven't shown much
> improvement. Continuing the same approach may not be helping."*

That describes recorded history and does not diagnose, which is exactly what
`ai/language-guard.describesOnly` tests. It also uses *the person's own* assessments, which is the
only class of evidence that can safely ground it.

`ai/safeguarding.js` and its routes (`server.js:12745`) already exist for the genuine duty-of-care
path, with a lead role and resources. **Development stagnation must never route into
safeguarding**, and the fact that both could produce "involve someone" text is precisely why the
two must stay separate modules with separate triggers.

---

# K · Resource intelligence

## K.1 · Internal resources exist; nothing recommends one

`libraryItems` — `note | chat | artifact`, `private | shared`, folders, `sourceRef`
(`server.js:12591`, `11088`). `orgTutorials` — org-level pinned how-tos with a `url`
(`server.js:985`). `ai/retrieval.js` provides hybrid ranking (semantic + authority + freshness +
lexical), a grounding artifact, and a citation validator — **and it is already the right engine**.

Two things it does not have: any notion of *pedagogical fit* (a policy document and a tutorial rank
the same way), and any notion of *what this person has already tried*.

## K.2 · External resources do not exist at all

No web search, no general fetch. Connectors fetch only configured URLs, behind `_urlIsSafe`
(`server.js:6694`) which blocks private addresses, with a 15-second abort, rate-limit parsing and
failure classification.

**This is the largest genuine build in this document** and it is the one with the least existing
support. It also carries a running cost that `pilot-plan-and-market.md` did not budget for.

## K.3 · Resources as evidence versus resources as tools (§12)

The founder's distinction is right, and the answer is that **`lib/evidence.js` already has the
field for it and it is being used for the wrong axis.**

`retrieval.TRUST_RANK` (`ai/retrieval.js:20`) ranks *authority over an organisational fact*. A
tutorial has none — but neither does it want any. The previous exploration reached the same
conclusion for research papers: **external material needs a different axis, not a lower rung.**

The clean formulation:

> **Evidence answers "what is true here". A resource answers "what might help here". They are
> different questions and must never share a ranking.**

Concretely, and without overloading evidence (§12's warning, which is correct):

- A resource is a **reference with provenance and a reason**, never a signal. It never reaches
  `deriveConfidence`, never counts as an origin, never opens an inquiry.
- A resource *may* be cited in a Lab as "why we tried this".
- The same artifact can be both — a research paper as an external sighting informing an Inquiry
  (previous document, section I) and as a resource in a Lab. **The object is the same; the use is
  different, and the use is what carries the authority.** That is one field on the reference, not
  two stores.

## K.4 · "Why this resource?"

The founder's real requirement is not search quality. It is that the recommendation can explain
itself, which means it must be *derived from things that already have explanations*:

| Input | Exists | Where |
|---|---|---|
| what they are trying to develop | the focus text | `mem.focuses` |
| what they have tried | prior focuses, scenarios, interventions | all three stores |
| what evidence exists | canonical assessment evidence | `_assessmentEvidenceFor` |
| what remains difficult | `_capabilityDims(..., 'development')` | `server.js:7595` |
| what they prefer | `proactivePrefs` + person model | bounded allow-lists |
| what is unknown | inquiry `stillUnknown` | `ai/diagnose.js` |

**Every input already exists.** A deterministic first version — rank library items and tutorials by
`retrieval` score against the focus text, filtered by what has already been tried — needs no model
and can already answer "why this". That is the version to build, for the same reason the Evidence
Scout's first version should be deterministic: it cannot invent, and it costs nothing.

---

# L · Personalisation audit

**Safe to remember today**, because each is a bounded allow-list that drops anything off it:

| Store | Contents | Guard |
|---|---|---|
| `proactivePrefs` | `length`, `tone`, `cadence` | `normalizePreferences` drops off-list; protected traits can never be stored or inferred (`ai/proactive.js:23`) |
| `personModel` | categorical tokens only: timing, communication, motivators, overwhelmers, coaching | `VOCAB`, `ai/person-model.js:26`; raw text *cannot* enter, so a disclosure cannot leak |
| `selfModel` | four accommodation-shaped interaction patterns | `PATTERNS`, `ai/self-model.js:36`; private to the person, never shared with a leader, never used to evaluate |
| `mem.recentThemes` / `openThreads` | themes and open loops | allow-listed themes via `ai/understanding.sanitizeFeatures` |

**Missing for Lab:** a learning-format preference (video before text, examples before practice,
check-in cadence for development work).

**And the answer is not a new store.** `personModel.VOCAB.communication` already has
`['brief','detailed','visual','direct','gentle']` — `visual` is most of what the founder wants.
Adding a `learning: ['examples_first','practice_first','reading','video','audio']` dimension to
`VOCAB` is one line and inherits every guarantee: categorical tokens only, a confidence floor of
three observations before it is asserted (`FLOOR`, `ai/person-model.js:36`), and self-owned.

**The consent pattern is already correct and must not be weakened.** `askFirstOffer`
(`ai/priority-office.js:102`) proposes rather than silently reorders. The founder's example — *"You
often choose videos before written explanations. Want me to lead with video?"* — is that function,
with a different label.

The trap named in `expression-and-initiative.md` §3 applies exactly here and is worth restating,
because Lab is where it would first bite: **an inferred preference applied silently is engagement
optimisation; an inferred preference that asks is assistance.** With resources in the loop, silent
adoption becomes a content-recommendation engine — which §24 forbids and which is what most
learning products decayed into.

---

# M · Lab canvas proposal

The founder is right that not every Lab needs every section, and `ai/behaviour.js` already owns
exactly this judgement — grouping, ordering, volume, and silence. **A Lab canvas should be a
`behaviour.plan()` over the Lab's own parts, not a template.**

The rule that makes it self-shaping without a new layer:

> **A section appears when it has content that changed. It does not appear as an empty placeholder
> inviting the user to fill it in.**

That is the same discipline as `BUCKET_EMPTY` — a first-class empty state where absence is
meaningful, nothing at all where it is not.

| Section | Shows when | Source |
|---|---|---|
| Goal | always | the focus text |
| Why / origin | the Lab came from a High, Low or Inquiry | `originRef` (missing) |
| People | anyone was invited | participants (missing) |
| Current focus | there is a next step | the focus itself |
| What has been tried | ≥1 attempt recorded | scenarios / interventions / prior focuses |
| Resources | ≥1 was suggested and each can say why | library, tutorials |
| Assessments | a baseline exists | `_assessmentEvidenceFor`, private |
| Reflections | the person wrote one | notes, assistant turns |
| Progress | **a reassessment on the same rubric exists** | not before |
| Evidence | there is any | canonical envelopes |

**Progress deserves its own warning.** It is the section every user will want and the one most
likely to manufacture a false claim. A progress line asserts *there is a trend* — which
`expression-and-initiative.md` §5.1 identified as an epistemic claim, not a presentation choice.
With one baseline and no reassessment, there is no trend, and drawing one is the exact failure
`_declined` and `baseline.MIN_POINTS` exist to prevent elsewhere in the kernel. **No reassessment,
no progress section.**

---

# N · Privacy threat analysis

## N.1 · What is already right

- Focuses are keyed `${orgCode}:${userId}` and every route is self-scoped (`server.js:4557`, 4583).
- The self-model's rule is written down and is the correct one for all development data:
  *"NEVER shared with a leader above them and never used to evaluate them"* (`ai/self-model.js:17`).
- A private assessment is admitted only for its owner under a personal purpose, never for a
  leader-facing one (`server.js:7628`).
- Library items default to `private` and only `shared` ones cross to others (`server.js:12596`).
- The person model cannot store raw text at all, so a disclosure cannot leak.

## N.2 · Threat 1 — Lab becomes a performance file

The sharpest risk here, and it does not require a bug.

A Lab is a **durable record that a named person was working on a named weakness, for how long, with
what result.** Today no such record exists in a leader-readable form: `_capabilityDims` yields three
dimension words, `mem.focuses` is self-scoped, and the assessment score has been deliberately
stripped from the signal stream.

Add a Lab with an origin, a baseline, checkpoints and an outcome, and make it visible to a leader —
and IntelliQ has built a performance-management file, which is the product it has spent this entire
architecture avoiding being.

**Required:** a Lab is `private` by default, self-scoped, and **an organisational assessment
assigned by a leader must never be automatically pulled into a personal Lab.** The direction of
travel matters: the person may choose to bring their assessment into their Lab. The Lab must never
reach into the assessment record and display it as development history.

## N.3 · Threat 2 — silent promotion of personal learning

§21 asks what happens when a personal Lab produces useful organisational learning. The answer
should be the one this codebase already gives twice: **`ai/contribution.js`, unchanged.** Explicit,
owner-only, non-automatic, and the group receives *the claim and a reference, never the words*
(`toGroupProposal` sets `sourceSpan: null`, `verbatim: false`).

The danger is that Lab looks like a natural place to add a second door. There must not be one.

## N.4 · Threat 3 — the org-originated Lab

If a Lab originates from an **organisational** High or Low (a team Low, a node subject), whose is
it? The honest answer is that origin does not confer ownership: **a Lab is owned by whoever created
it, regardless of what prompted it.** A team Lab on a node subject is a different object from a
personal Lab that happened to start from a team observation, and conflating them is how a person's
private development work ends up attached to a group record.

## N.5 · Threat 4 — participant departure

If an invited coach leaves the Lab, they lose access going forward. They do not lose what they
already saw, and nothing should pretend otherwise. **The honest surface is a visible participant
history**, not silent revocation — the same reasoning that makes a removed forum message keep its
tombstone (`ai/forum.js:70`).

## N.6 · Threat 5 — sensitive development material

*"I want to work on my confidence after what happened last year."* `privacy.classifyText` would
classify that `SENSITIVE` at minimum, `RESTRICTED` if it names a topic on the list
(`ai/privacy.js:26`). Lab text must be classified on entry — the same requirement the previous
document raised for forum speech (its §G.2), and for the same reason: **a store that is only read
by humans today becomes dangerous the moment anything reasons over it.**

## N.7 · Administrator visibility

There is no admin override on `_getMemory` today and there should not be one. If an org demands it,
the answer is that development records are the person's, and the organisation's legitimate view is
of *assessments it assigned* — which it already has, with an audit trail.

---

# O · Lifecycle analysis

Using only existing state vocabularies. **No parallel state machine**, per §5 and §24.

```
  kernel finding ──> ProactiveInsight ──> bucket          ai/intelligence → ai/proactive → ai/behaviour
        │              polarity: risk | progress | milestone | opportunity
        │
        └─ the person chooses ─────────> focus            server.js:4557   status: active | done
                                            │             requiresConfirmation — never automatic
                                            ├─ practice   assignedScenarios → memberResults → canonical
                                            ├─ action     lib/action.js  recommend→draft→confirm→execute→observe→evaluate→learn
                                            ├─ assess     assessmentAssignments  assigned→submitted→returned
                                            └─ reflect    notes, assistant turns
                                            │
                                            └─ outcome ──> helped | no | mixed      server.js:4583
                                                  ├─> _recordNoticeFeedback → Confidence Engine   (works today)
                                                  ├─> canonical outcome evidence                  (MISSING — see G)
                                                  └─> ai/org-learning → ai/org-playbook candidate → leader confirms
```

**Four state vocabularies already exist and none of them should be replaced:**

| Vocabulary | Values | Owner |
|---|---|---|
| focus status | `active`, `done` + `helped \| no \| mixed` | `server.js:4568` |
| action stage | `recommend → draft → confirm → execute → observe → evaluate → learn` | `lib/action.js:26` |
| assessment status | `assigned → submitted → returned` | `server.js:5410`, 5730 |
| inquiry status | `exploring → probable → supported \| disputed \| resolved` | `js/member-view.js:2698` |

**`lib/action.js` is the Lab's state machine and it was written for this.** Its header describes
*"the loop almost no assistant closes: observe — what actually happened; evaluate — did it improve
the organisation; learn — feed that back to the kernel."* A Lab is an `ActionRecord` with a longer
horizon. **Do not write a fifth vocabulary.**

**Answering §19 directly:** yes, Lab occupies the Action/Outcome side of the existing machine loop.
`Evidence → Memory → Inquiry → Understanding → Expression` is the left half and is built. `Action →
Outcome → Memory` is the right half, and it exists as `lib/action.js` + focuses + interventions +
`ai/org-learning` — **it is just not assembled into anything a person can see.** That is the most
accurate one-sentence description of what Lab is.

---

# P · Navigation verdict

**Contextual (B) for the pilot. Hybrid (C) as the honest long-run answer. Not primary.**

Reasons, in order of weight:

1. **Frequency.** Highs, Lows and Inquiries change with the evidence — daily. Development changes
   weekly at best. A tab that is unchanged for six days teaches people not to open it.
2. **It is already contextual and it already works.** "Your focus" renders on Home with Helped /
   Didn't buttons (`js/member-view.js:380`). That is the contextual placement, shipped.
3. **Concurrency.** A person will have one or two Labs. A list surface for two items is a list
   surface for nothing.
4. **The tab is the trap.** A primary destination must be filled. An empty Lab tab creates pressure
   to suggest Labs, which is how "a Low automatically becomes a Lab" happens despite §3 forbidding
   it — not by a decision, but because the tab was empty.
5. **Forum is still unbuilt.** Adding a sixth destination while the fifth has no interface is how a
   compression exercise becomes a dashboard.

**The earn condition for a tab**, stated in advance so it is a measurement and not a preference: a
user holds two or more active Labs for more than two weeks, or a Lab accumulates participants,
resources and a reassessment. Falcon will answer this in a month. Guessing it now costs a tab.

**Where it lives meanwhile:** "Your focus" on Home for the active one; a Lab opens as an expanded
context from the card that created it — the same `openInsightThread` container the previous document
recommended for Inquiries. **One interaction model, three object types.**

---

# Q · Contradictions and challenges

**Q.1 · Lab is the largest scope expansion across three documents, and the constraint list proves
the founder already knows.** §24 forbids: an LMS, a task manager, a content recommendation engine,
another inquiry system, another forum, another evidence system, arbitrary scores, engagement
optimisation. Seven of those eight are things Lab would naturally become. **A concept that requires
eight prohibitions to stay itself is a concept under pressure**, and the pressure comes from Lab
being defined by what it contains rather than by what it decides.

The sharper definition, which needs no prohibitions: **a Lab is the record of a decision to work on
something, and what happened.** Everything else is a reference.

**Q.2 · The MVP already shipped and nobody noticed.** `mem.focuses` runs the entire loop. The most
valuable thing to do is not to build Lab — it is to find out whether anyone uses "Your focus", and
what they wish it remembered. **That is a pilot question with a free answer, and building Lab first
throws it away.**

**Q.3 · Assessment inside Lab is where this becomes a performance product.** Leader-assigned
assessments are scored work judgements with an assessor and an audit trail. The moment those appear
in a development container, IntelliQ is HR software. The saving distinction is ownership of the
instrument (H.2), and it is one default — `visibility: 'private'` — away from being fine or being
wrong.

**Q.4 · Progress visualisation is the single most likely place this system tells its first lie.**
Every other surface refuses false precision: bands not scores, `because` strings, `stillUnknown`,
`not_causal`, the naked assessment number deliberately retired. A progress bar in a Lab asserts a
trend from what will usually be one baseline and a feeling. **Ship Lab without progress, and let a
real reassessment earn it.**

**Q.5 · Resource recommendation with no external retrieval is a bigger build than it looks.** No
web search exists. Adding one brings: a running cost the market plan did not budget, a quality
problem, a provenance problem (K.3), and a category of failure the system has never had — being
confidently wrong about the outside world rather than honestly uncertain about the inside.
**Internal-only resources — library plus tutorials, ranked by `ai/retrieval`, filtered by what has
been tried — is most of the value at none of the risk.**

**Q.6 · Section 10 leaks in both directions and I would not build it as specified** (J.2). The
inverted version in J.3 gets the founder what they want and is smaller.

**Q.7 · "Development creates new understanding" is the claim most at risk of becoming causal.**
`Low → Lab → improvement → High` is a causal story and the system is forbidden from telling it.
`outcome-intelligence` already solved this problem once: *"was followed by"*, with
`limitations: ['not_causal']`, asserted by `pilot-loop-smoke` §6. **Lab must inherit that phrasing
verbatim**, or the most emotionally satisfying moment in the product becomes its first false claim.

**Q.8 · The thing nobody has costed: Lab is the first feature that makes IntelliQ responsible for
someone's development over months.** Highs and Lows are observations — wrong ones are forgettable.
A Lab that ran twelve weeks and produced nothing is a person's time. That raises the standard for
"recommend only when there is a reason" from a preference to an obligation, and it is a reason to
build the loop before the content.

**Q.9 · One thing the founder is right about that the architecture does not reflect.** *"Sometimes
the most intelligent answer is another human."* Every routing decision in this codebase currently
ends in IntelliQ answering, retrieving, or staying silent. `ai/inquiry.js` has `resolutionOwner` —
the role best able to answer — computed and carried on every uncertainty (`ai/inquiry.js:55`), and
**nothing acts on it.** The most under-used field in the system is the one that says a person could
resolve this. That is a genuine finding and it is smaller than everything else in section 17.

---

# R · Implementation sequence

## R.0 · Ahead of everything here

`P0-1` evidence durability · `P0-2` shutdown durability · `P0-3` optimistic concurrency ·
`P0-D` authority on empirical claims · `P0-5` the forum echo-origin defect. Then the two near-free
items from the previous document (render `basis`; finish emptying Home).

**Nothing in this document precedes those.**

## R.1 · Before first demo

1. **`POST /api/me/focus` — create a focus from your own words** (F.1). The single smallest missing
   piece; it turns "Your focus" from something only IntelliQ can start into something a person can.
   Delivers most of §6 for roughly one route.
2. **Record the origin on a focus** — `originRef` (the insight's `dedupeKey`, already stable) and
   `originKind` (`high | low | inquiry | self`). One field, and it is the same missing foreign key
   three explorations have now independently found.

Estimate: well under a day, and it makes "Work on this" demonstrable as a concept.

## R.2 · Between demo and first pilot

3. **A completed focus emits canonical outcome evidence** with `not_causal` (G). Closes the loop
   without a new evidence system.
4. **Classify focus text on entry** via `privacy.classifyText` (N.6). Same requirement as forum
   speech; do them together.
5. **Name it Lab in the interface** if the concept survives step 1. A word, not a destination.

## R.3 · Learn during the pilot

6. **Watch whether anyone uses "Your focus"** and what they wish it remembered (Q.2). This is the
   deliverable of the pilot for this document. Build nothing until it answers.
7. **Self-assessment as a baseline** (H.2), private by default, only if someone asks how to tell
   whether they are getting better.
8. **Internal resource suggestion** — library and tutorials ranked by `ai/retrieval` against the
   focus text, filtered by what has been tried, deterministic, able to answer "why this" (K.4).

## R.4 · P1

- Invited participants (I) — private by default, invitation explicit, the forum authorship rule
  applied verbatim.
- Reassessment comparison and the progress section (H.3, M) — only after a real second assessment
  on the same rubric exists.
- `experiment` as a resolution strategy on an uncertainty (E) — the cleanest single addition in
  this document, and worth doing early if any pilot Inquiry stalls with competing explanations.
- `learning` dimension in `personModel.VOCAB` (L), adopted only via `askFirstOffer`.
- Act on `resolutionOwner` (Q.9) — the under-used field.

## R.5 · P2 and beyond

- External resources (K.2) — needs the external-sighting semantics from the previous document
  first, plus a cost decision.
- Declared willingness to help, and matching (J.3) — needs `declaration` as a record type, already
  P1 in the harness addendum.
- Team and organisational Labs — after personal ones have earned it. A team Lab needs a group
  subject, which means a node, which means the ad-hoc participant problem from the previous
  document is a prerequisite.

## R.6 · Never

- A leader-visible view of a person's Labs.
- Automatic Lab creation from a High or a Low.
- Progress visualisation without a reassessment.
- Any score invented to make progress legible.
- An unsolicited offer to one person derived from another person's development record.

---

# The honest summary

Lab is real, and it is already running.

`mem.focuses` takes a proposal-gated suggestion from a High or a Low, waits for the person to
approve it, holds it as active work, asks how it went, and feeds the answer back into what the
system chooses to surface. Understand, choose, try, measure, learn, adapt — all six, in forty
lines, self-scoped, shipped.

What it cannot do is remember why it started, what was tried, who helped, or what would count as
evidence that it worked. Every one of those exists elsewhere: goals, assessments, scenarios,
interventions, outcome ranking, capability observations, the library, the person model, and an
execution contract in `lib/action.js` that was written for exactly this and has never been used for
it. The right half of the machine loop — Action, Outcome, Memory — is built and unassembled.

So Lab is a foreign key and a canvas, not a kernel. The two smallest things that would prove it are
a route to start a focus in your own words, and a field recording where it came from.

The two things I would refuse are a leader-visible development record and an unsolicited mentor
offer derived from someone's assessment history. Both are one default away from being fine, and one
default away from making this a performance-management product.

And the most valuable thing available right now is not in this document. It is finding out whether
anyone at Falcon uses "Your focus", and what they wish it had remembered.
