# The creation-owner map — High, Low, Inquiry, Focus

**Status: investigation, not authority.** Nothing in this file is a decision. It records what the
repository does today, found by driving it rather than by reading it, and names the two places
where fulfilling the brief would require a founder decision rather than a repair.

Baseline `1f63248`. Every probe below ran against that head.

---

## 0 · The correction this map begins with

The previous pass reported that "Create a Focus to try player-led debriefs" and "Record that it
helped" failed because **intent machinery is missing**. The founder was right to challenge that
conclusion. It is wrong.

`ai/composer-actions.js` has held an eighteen-action vocabulary for some time, including
`create_focus`, `create_inquiry` and `record_focus_outcome`, each with contexts, a confirmation
flag and a description written for a model to select from. The governed pipeline behind it —
`normalize` → `ground` → proposal → confirmation card → canonical owner — is complete.

What actually happened in that test is narrower and more important: **the interpretation step is
model-gated, and the pass ran with models off.** `_composerActionInterpret` returns
`{ actions: [], unavailable: true }` when `!ai.enabled()`, so no action is ever selected and the
deterministic path files the utterance as a generic `capture`.

Driven again with a stubbed interpreter, the whole of §XIX steps 1–6 already works:

```
"Create a Focus to try player-led debriefs."
  -> actionType: create_focus, label "Start this focus"
  -> requiredApproval: true, changesPersistentState: true
  -> textSource: "user_stated"
  -> focuses before confirm: 0
  -> reply: "I can start this focus — say the word and I'll do it. Nothing happens until you confirm."
  -> POST /api/assistant/turn/:turnId/confirm
  -> { ok: true, confirmed: "create_focus", outcome: "created", focus: { id: "foc_…" } }
  -> focuses after confirm: 1
```

No mutation before confirmation, wording taken from the person, canonical owner writes. The
machinery is real and it is reachable. **Disposition for Focus creation by utterance: REUSE.**

---

## 1 · The table

| | HIGH | LOW | INQUIRY | FOCUS |
|---|---|---|---|---|
| **1. Canonical owner** | `ai/team-state.js buildTeamState` (group) / `ai/proactive.js` (self) — a **projection**, never a record | same as High | `ai/diagnose.js` inquiry state, written into `inquiryStates` | `_createPersonalFocus` (self) · `ai/team-state.js newFocus` via route (group) |
| **2. Creation route(s)** | **none** | **none** | **none** — minted only inside `_intakeTurn` | `POST /api/me/focus` · `POST /api/group/:nodeId/focus` |
| **3. Personal path** | valenced contribution → projection | valenced contribution → projection | `_intakeTurn` on a conversation turn | `POST /api/me/focus`; composer `create_focus` |
| **4. Group path** | `POST /api/group/:nodeId/contribute` with `valence: 'working_well'`, then the cohort floor | same with `valence: 'worth_attention'` | opens when ≥2 independent contributors clear `shouldOpenGroupInquiry` | `POST /api/group/:nodeId/focus`, leader-gated |
| **5. Composer action** | **none** | **none** | `create_inquiry` | `create_focus`, `update_focus`, `record_focus_outcome` |
| **6. Confirmation owner** | n/a | n/a | `POST /api/assistant/turn/:turnId/confirm` | same |
| **7. Authority gate** | `contribution.mayContribute` | same | same | `_leadsNode` (group) · owner (personal) |
| **8. Privacy / admissibility** | `classifyScope`, cohort floor `MIN_COHORT`, independent origins | same | same | audience resolver; `strictAudience` |
| **9. Provenance owner** | candidate `contributorId`, server-stamped | same | `p.source = userId`, server-stamped | `origin.by` / `origin.from` |
| **10. Standing owner** | `diagnose.deriveConfidence` → `fitForSurface` | same | same | **none, and correctly none** — a Focus is an intention |
| **11. Relationship reader** | `ai/cross-evidence.js` | same | same | same |
| **12. UI can reach it** | only if a candidate exists | only if a candidate exists | only via intake | yes — "Work on this", the group screen, `POST /api/me/focus` |
| **13. Disposition** | **REPORT** (§3) | **REPORT** (§3) | **REPORT** (§3) | **REUSE** |

### Duplicate canonical owners

**None found for the same semantic action.** `_createPersonalFocus` and `teamState.newFocus`
write two *different* objects — a personal focus and a team focus — which have different
audiences, different outcome vocabularies and different authority gates. That is two objects, not
two owners of one object, and it is long-standing.

---

## 2 · What the founder's law already holds

Verified rather than assumed:

- **Contribution proves the contribution, not the claim.** The valence a contributor declares is
  recorded as theirs (`cand.valence`, with `contributorId` and `contributorRole`); whether it
  becomes a group High or Low is decided by the cohort floor and independent-origin count, never
  by who said it. `server.js:16346` states this in the code: *"a sentiment lexicon deciding a
  team's Highs and Lows is the same mistake as the one that destroyed meaning at the Self layer,
  made at group scale where being wrong is more expensive."*
- **The model never stamps a source.** `for (const p of props) p.source = userId` — *"a model free
  to label its own proposals could turn one person's message into several corroborating voices."*
- **The model never mutates.** Every `ACTIONS` entry that changes state carries
  `confirmation: true`, and the confirm route re-resolves the object, re-checks the guard and
  rejects a changed payload with `proposal_payload_changed`.
- **A Focus has no confidence band.** `voice.explainObject` short-circuits for `kind === 'focus'`
  and returns `confidence: null`, with the reason written in: a commitment is true because
  somebody made it, and there is nothing for IntelliQ to be confident about.

---

## 3 · The two places this brief cannot be fulfilled without a founder decision

### 3.1 · The entire creation half is model-gated, and the pilot runs with models off

`_intakeTurn` returns `null` on its first line when `!ai.enabled()`. Driven, with models off:

```
A player says "Nobody talks after we lose. It has been like that for weeks."
  group candidates minted : 0
  personal inquiries minted: 0
```

So in the pilot's actual running state:

- no Inquiry can come into being from anything a human says;
- no candidate is minted, so no contribution can be made, so **no High and no Low can exist at
  all**;
- every explicit "Create a High / Low / Inquiry / Focus…" utterance is filed as a generic
  `capture`, and the reply talks about a *reasoning engine* being switched off, which is about a
  different subsystem entirely.

**Focus is the only one of the four a human can create with no provider**, through the two routes
in the table and through the "Work on this" control.

This is not a bug with a repair. It is the architecture: extraction is a model's job, and the
repository is explicit that it should be. Making a human able to *deliberately start* a High, a
Low or an Inquiry without a provider needs one of:

- **(a)** a deterministic command shape — "Create a Low about X" — routed to the SAME governed
  action pipeline through the existing `requestedAction` branch, which already bypasses the model
  and is what every pressed control in the UI uses. This adds no second intent engine and no new
  owner; it adds a narrow parser. §XXII explicitly contemplates it and asks for the reasoning to
  be documented.
- **(b)** an explicit creation surface (the §XII fallback), which would need a `create_high` /
  `create_low` action and a candidate-minting path that is not intake — **a new owner**.
- **(c)** accept it, and make provider-down say so honestly instead of talking about a reasoning
  engine.

**(b) is a BUILD and is not taken.** (a) and (c) are within REUSE/CONNECT/REPAIR. The founder
decides which.

### 3.2 · `record_focus_outcome` knows only the personal outcome vocabulary

Driven directly at the kernel:

```
"It helped"       outcome=helped    -> recorded
"It got better"   outcome=better    -> refused; asks "did it help, not help, or was it mixed?"
"Nothing changed" outcome=no_change -> refused; same question
```

A group Focus's own screen offers **It got better / Nothing changed / It got worse / Too tangled
to tell** — `teamState.OUTCOME_RESULTS`. The composer grounding knows only
`helped / mixed / did not help`, which is the *personal* vocabulary. So a coach who says "it got
better" about a team focus is asked to answer in words the product does not offer them, and the
canonical group route would reject the answer if they did.

**It refuses rather than mis-records**, so it is safe and wrong rather than dangerous. It is the
same class as the defect repaired in `ai/present.js` last pass — two vocabularies, one owner not
knowing the other exists — and the repair belongs at the existing owner. **Disposition: REPAIR.**

---

## 4 · Smaller findings, not yet acted on

- **`checkin_log` outranks nothing and survives everything.** Composer proposals replace `capture`
  and `focus_proposal` but not `checkin_log`, so an utterance that produces no semantic action
  lands on "Log this as today's check-in?" — which is why "Record that it helped" looked like a
  capture failure.
- **`create_inquiry` has `contexts: [null, 'focus', 'high', 'low']`** — it is not offered *on* an
  inquiry, which is right, and it is offered from nothing, which is what §XIII wants.
- **No `create_high` / `create_low` action exists**, consistent with High and Low being
  projections rather than records. §XXIII anticipates exactly this and says to preserve it.

---

## 5 · What is NOT proposed

No new truth store. No Decision object. No second recommendation engine. No change to ontology,
privacy, confidence, authority or evidence semantics. No general intent engine. High and Low stay
projections.
