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
