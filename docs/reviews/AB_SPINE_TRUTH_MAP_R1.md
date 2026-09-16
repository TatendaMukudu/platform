# A→B decision spine — repository truth map

**Branch** `gpt/ab-decision-spine-r1` · **Starting SHA** `ae059a6038f8db37c3f0bb148f9a32e4094adb40`
(identical to the `codex/pilot-recovery-gate-r7` head, so this work inherits the full recovery stack)

Phase 1 of the convergence pass. Nothing in this document is inferred from the UI or from module
names. Every row was established by following functions, routes, state writes, readers and tests,
and the behavioural claims were driven through the real HTTP routes against a realistic Alma
fixture (14 squad members, 5 independent contributors — a cohort that clears the two-sided
disclosure floor).

---

## 0. Headline

**The loop already runs end to end.** Contribution → Inquiry opens at `supported` with 5
independent origins from 5 people → Focus created carrying `origin.from: 'inquiry'` and the
`inquiryId` → outcome recorded → the governed Action advances to `learn` → the completed Focus
lands in the group's `history`.

That is the spine, and it is real. It was driven, not read.

**Three of the eight coach-facing sections are structurally empty, and the loop's last arrow does
not close.** Those are the missing edges, and all of them are CONNECT or REPAIR — there is no
stage of this journey with no owner.

---

## 1. Capability map

| Desired capability | Canonical owner | Reachable? | Missing edge | Disposition |
|---|---|---|---|---|
| Observation → evidence | `_noteGroupCandidates` → `POST /api/group/:n/contribute` → `contribution.toGroupProposal` → `diagnose.applyProposals` | yes | none | **REUSE** |
| Understanding / confidence | `ai/diagnose.js`, `ai/confidence.js` | yes | none — `supported`, 0.86, 5 origins, computed | **REUSE** |
| Inquiry object | `inquiryStates` + `_admitGroupContributions` | yes, `GET /api/group/:n/inquiry` | none | **REUSE** |
| **What we don't know** | `ai/inquiry.js` `planInquiries` / `buildUncertainty`; `missingSignals` | engine reachable, **but never pointed at an inquiry's own frontier** | group inquiries always return `stillUnknown: []` | **CONNECT** |
| **What might explain it** | `diagnose.applyProposals`, `level: 'hypothesis'` | unreachable for groups | `toGroupProposal` only ever emits `level: 'observation'` | **CONNECT / adjudicate** |
| **What history suggests** | `ai/outcome-intelligence.js` `earlySignalBrief` | live, but keyed by reasoner `patternType` | not keyed by an inquiry's concept | **CONNECT** |
| Reasonable options | `ai/composer-actions.js` (14 inquiry-context actions, confirmation-gated) | yes | none | **REUSE** |
| What an option could clarify | `ai/inquiry.js` `infoGain`, `questionValue`, `discriminate` | engine reachable | not joined to the action vocabulary | **CONNECT (deferred)** |
| Worth testing → Focus | `POST /api/group/:n/focus` with `fromInquiryId`, `teamState.newFocus` | yes | none — origin verified against the group's own inquiries | **REUSE** |
| Action / confirmation | proposal → confirm dispatcher, `_beginFocusAction` | yes | none | **REUSE** |
| Focus outcome | `teamState.recordFocusOutcome`, `_completeFocusAction` | yes | none | **REUSE** |
| **Outcome → the next decision** | `ai/cross-evidence.js` `edges()` / `loop()` | `loop()` is **focus-only** | an Inquiry cannot see what was tried against it or how it went | **CONNECT** |
| What to watch next | `diagnose` `falsifiers` | populated only by hypothesis proposals | empty for groups, same root as above | **CONNECT** |
| Presentation | `ai/present.js`, `ai/voice.js`, `_objectBucket` | yes | group inquiries reach the bucket only through `state.question`'s single slot | **REPAIR** |

---

## 2. The traced path, with evidence

```
POST /api/group/:nodeId/contribute
  └→ _admitGroupContributions                          server.js:16087
       ├→ contribution.shouldOpenGroupInquiry          (2 independent origins opens it)
       ├→ contribution.toGroupProposal                 ai/contribution.js — level:'observation'
       └→ diagnose.applyProposals                      server.js:16101
            └→ confidence recomputed from ORIGINS      0.86 / supported / 5 origins
GET /api/group/:nodeId/state
  └→ teamState.buildTeamState({inquiries, findings, focuses})
       └→ low.basis {independentOrigins:5, contributors:5, of:14}   ← honest aggregate
POST /api/group/:nodeId/focus {fromInquiryId}
  └→ origin inquiry verified against THIS group's inquiries         server.js:16410
       └→ teamState.newFocus → origin {from:'inquiry', inquiryId}
POST /api/group/:nodeId/focus/:id/outcome
  └→ teamState.recordFocusOutcome  +  _completeFocusAction → stage 'learn'
```

Driven output, verbatim:

```
1 WHAT WE KNOW        confidence "supported" from 5 origins / 5 people
2 WHAT WE DON'T KNOW  []
3 WHAT MIGHT EXPLAIN  hypothesis=null alternatives=[]
8 WHAT TO WATCH NEXT  []
7 FOCUS               200  origin={"from":"inquiry","inquiryId":"inq_…"}
9 OUTCOME             200  {"result":"better","recordedBy":"coach"}
10 actionsLog         1 entry, stage "learn"
11 next view          statement IDENTICAL to before the Focus ran
```

---

## 3. The four findings, precisely located

**F1 — a group Inquiry can never hold an explanation.** `ai/contribution.js toGroupProposal`
hard-codes `level: 'observation'`. `diagnose.applyProposals` populates `hypotheses`,
`alternatives` and `falsifiers` **only** from `level === 'hypothesis'` proposals
(`ai/diagnose.js:645`). No production path emits one for a group. So sections 3 and 8 are empty
by construction, not by absence of a model. *This is the one that may need founder adjudication —
see §5.*

**F2 — `stillUnknown` is member-only.** `after.missingSignals = …` is written at `server.js:11933`,
inside the member intake path. `_admitGroupContributions` never writes it. The engine that would
decide what is worth asking (`ai/inquiry.js planInquiries`) is live and governed — value-gated,
health-guarded, non-leading — but derives uncertainties from org-state and staleness only
(`server.js:12804, 12827`), never from an inquiry's own frontier.

**F3 — the loop is one-directional.** `crossEvidence.loop(objects, focusRef)` returns `null`
unless `f.kind === 'focus'` (`ai/cross-evidence.js`), and both call sites guard on
`kind === 'focus'` (`server.js:11268, 19008`). The `addresses` edge from Focus → Inquiry already
exists in `edges()`. Nothing reads it from the Inquiry's side, so a coach opening the question
cannot see that something was tried about it, or how it went. **This is the loop's last arrow.**

**F4 — the group bucket has one inquiry slot.** `_objectBucket`'s `group:` branch adds
`state.question` — a single projection slot — so a group with a live inquiry can return zero
inquiry cards. Observed: `GET /api/objects?kind=inquiry&scope=group:squad` → no card, while
`GET /api/group/squad/inquiry` → one inquiry at `supported`.

---

## 4. Where the brief and the repository disagree

**The brief lists "curiosity / useful-next-information" as known existing machinery.** There is no
`ai/curiosity.js`. The capability exists under a different name — `ai/inquiry.js` (`infoGain`,
`questionValue`, `discriminate`, `planInquiries`) — and is the canonical owner. Repository truth
wins; no second owner will be created.

**The brief warns against "presenting historical intervention ranking as proof of the best
action".** `outcome-intelligence.bestForPattern` does rank, by Wilson lower bound. It has **no
production caller** — only tests. The live surface is `earlySignalBrief`, whose wording is
"…has recorded outcome history for this pattern here. Review before acting", carrying
`limitations: ['not_causal', …]` and a `safe` flag computed through `ai/language-guard.js`. The
law is currently held. Any new surface must keep it held.

**`scripts/prediction-boundary-smoke.js` appears deleted.** It was not a retired product
decision: commit `8406d08` absorbed it into `language-guard-smoke` and strengthened it with
`PERSON_FUTURE`. The anti-prophecy law is alive and registered. No salvage needed.

---

## 5. For founder adjudication

**F1 asks a real product question, not an implementation one.** Where should a group-level
explanation come from?

- **(a) A model proposes, a human accepts.** Matches the member path and the epistemic invariant
  ("the LLM proposes; deterministic code decides"). But it makes sections 3 and 8 empty whenever
  the provider is down, which is the pilot's normal state.
- **(b) A human proposes.** The coach or a member writes "I think it's because…" and it enters as
  a hypothesis-level contribution through the existing governed path. Deterministic, always
  available, and arguably more honest — the explanation belongs to the people who were there.
- **(c) Leave sections 3 and 8 absent for groups,** and say so on the surface.

This pass will implement **(c) plus the honest absence**, because it is the only option that
cannot be wrong, and will implement F2, F3 and F4 — which need no adjudication. **(b) looks like
the right long-term answer and is recommended, but it is a product decision and is not being taken
unilaterally.**

---

## 6. Disposition summary

- **REUSE, untouched:** evidence/contribution, confidence, Inquiry, options vocabulary, Focus
  creation from an inquiry, proposal/confirmation, outcome recording, action lifecycle.
- **CONNECT:** F2 (unknowns from the inquiry's own frontier), F3 (the inverse loop read).
- **REPAIR:** F4 (the group bucket's single inquiry slot).
- **BUILD:** nothing. No new store, no new object type, no second recommendation engine, no
  Decision object.

---

# Part II — what the pass actually found and did

Written after the work, against the map above. Where Part I turned out to be wrong, it is
corrected here rather than quietly edited, because a truth map that rewrites its own history is
not a record of anything.

## 7. Corrections to Part I

**F3 was right and understated.** The inverse loop read was missing, and repairing it exposed a
second, worse instance of the same defect: `edges()` resolved an inquiry ref by identity when an
edge was BUILT and expressed it in one name, which is correct — but a reader arriving by one of
the object's *other* names found an empty neighbourhood. A coach standing on the squad's `low`
surface read "nothing has been tried about this" while the focus that addressed it sat one edge
away under the name `inquiry:<id>`. Identity is now resolved at READ time as well
(`crossEvidence.sameThingRefs`), over the set the caller already authorised.

**F4 was overstated.** The inquiry does reach the coach — as a Low. What is actually true is
narrower and still worth recording: the group bucket has exactly three projection slots
(high / low / question), so a group's *fourth* live inquiry is invisible to any surface that reads
objects rather than `/api/group/:n/inquiry`. Not repaired this pass; listed in section 11.

**F1 was adjudicated, and the recommendation was taken.** The founder chose option (b): a human
may deliberately propose a candidate explanation through the existing governed contribution
boundary. Part I said this pass would implement (c) plus the honest absence. It implemented (b).

## 8. The trap that (b) opened, which Part I did not see

`_groupInquiryProjections` carried the leading hypothesis as a bare string while its rivals
travelled with their own band and status. So `ai/team-state.js` rendered it as the group's CLAIM
at `fit.band` — the band the OBSERVATION earned from five independent origins.

Opening the human path without fixing that would have dressed an unevidenced theory in the
standing of five people who described the thing it claims to explain and never endorsed the reason
for it. That is "authority makes it true" arriving by a side door, and it becomes reachable the
moment a human may propose an explanation.

`hypothesisStanding` now travels with the projection, carrying the hypothesis's OWN band, status
and support count. A hypothesis is admitted as the group's claim only when the kernel has given it
standing of its own — read from the computed band, never recounted (L-DC1).

A second instance of the same class: `alternatives` was every rival regardless of standing,
refuted ones included, separated only by a `status` field no consumer read. Harmless while nothing
rendered alternatives; a live defect the moment the group screen drew them under "What might
explain it". Refuted explanations now travel as `ruledOut` — kept, because corrections preserve
history and a group that cannot see what it dropped will propose it again.

## 9. The two frontier categories, which must not be collapsed

An UNKNOWN is a statement about what the record does not establish. It costs nobody anything and
is described deterministically from state, so it is not gated.

A QUESTION is an ACT. It spends somebody's attention, creates social pressure, and can distort the
behaviour it asks about. `ai/inquiry.js` decides whether one is worth asking and is genuinely hard
to pass: "why does communication drop after results" scores 0.02 and the critic blocks it
`no_reliable_owner`, because nobody is the system of record for why a group behaves a certain way.

That refusal is correct. The honest response is to say there is nothing useful to ask yet, not to
lower the bar until something comes out. Collapsing the two is how a product ends up asking a squad
a leading question in order to have something to put under a heading.

## 10. Decision Intelligence V1 — the nine, assessed

| # | Question | Disposition |
|---|---|---|
| 1 | What do we know? | **Reused.** Observation, independent origins, kernel-computed band. |
| 2 | What don't we know? | **Connected.** `_inquiryFrontier`, derived from the inquiry's own state. |
| 3 | What might explain it? | **Connected**, plus the standing repair in section 8. |
| 4 | What have we tried before? | **Connected.** The join was missing, not the data: a group Focus has recorded `origin.inquiryId` since the origin field existed. Scoped to this inquiry, and deliberately not to "similar" ones. |
| 5 | What happened afterward? | **Reused.** The outcome word, attached to the question it was about. |
| 6 | What are reasonable options? | **Not answered.** No machinery could answer it honestly. |
| 7 | What would each option teach us? | **Not answered.** Same reason. |
| 8 | Is there enough to test something? | **New, deterministic.** Three states with the reason for each. No ranking, no score, no probability. |
| 9 | What should we observe afterward? | **Connected.** `falsifiers`, computed since ai/diagnose.js was written and never rendered. |

Six and seven are refused rather than left undone, and the refusal is asserted (DI-6a, DI-6b). An
options generator would be the system proposing what to do and then, one release later, ranking
its own proposals. There is no honest way to rank them, because nothing in the record establishes
what will work. The coach writes the option in their own words — which is the "human chooses" step
the spine already had.

## 11. Still open, for the next pass or for Codex

1. **The group bucket's three projection slots.** A group's fourth live inquiry reaches no
   object surface. Corrected F4, above.
2. **Nothing in production emits `challenges`.** A hypothesis can only be refuted by writing a
   challenging proposal through the kernel; there is no route for it. The GX-L block mints the
   refutation at the kernel and says so. The same gap `level: 'hypothesis'` had before this pass.
3. **A refused packet item is dropped silently.** `canUseItem` now fails closed on language, which
   is right, but a leader is shown nothing rather than "something was withheld and why". The
   `withheld` channel that `ai/team-state.js` uses is the precedent to follow.
4. **`outcome-intelligence.bestForPattern` still has no production caller.** It ranks by Wilson
   lower bound. It should either gain a caller that is honest about what a ranking is, or be
   retired. Leaving a ranking engine in the tree with no caller is how one acquires a caller.
5. **`packet.safe` and `stamped.safe` still share a name for two different properties.** The
   packet now requires both, but `priority.stamp` continues to call a consent property `safe`.
