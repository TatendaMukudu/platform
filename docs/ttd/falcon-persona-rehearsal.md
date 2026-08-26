# Falcon pilot rehearsal — personas and scenario traces

**Status:** CURRENT. The pre-pilot acceptance rehearsal.
**Stage 15** of the final pre-implementation hardening program. Preceded by `d77aea0`.
**Written against:** `d77aea0`.

**Purpose:** trace seventeen realistic scenarios end to end against **repository truth**, so the gap
between what IntelliQ promises Falcon and what it currently does is a list rather than a feeling.

**Legend.** WORKS · **PARTIAL** · **BLOCKED** (a named blocker prevents it) · **ABSENT** (no path).

---

## 1 · PERSONAS

Falcon's shape: `School → Sport → 1st XI`, plus a Safeguarding Lead and a visiting Physio.

### P1 · Ash — player, 16

| | |
|---|---|
| Role | `member`; `view_team: false` (`server.js:1781`) |
| Node | member of `1st-XI` |
| **Self** | own check-ins, own private captures, own Inquiries, own Focuses, own assessments |
| **Web** | `1st-XI` + its direct parent `Sport` — **members do not get descendants** |
| May create | check-ins, private captures, shared notes, own Focus, contributions to a group Inquiry |
| May see | own everything; node-scoped shared material in their Web |
| Highs / Lows | **Self only.** `_proactiveInsights(audience:'self')` |
| Inquiries | Self Inquiry (model-required); group Inquiry for `1st-XI` |
| Focus | own; may be invited to others (**ABSENT** — G1) |
| Org intelligence | **ABSENT** — G3, no Web → Self path |
| **Must never see** | any other player's evidence, mood, patterns or Inquiries; anything from Rugby; any leader's private material |

### P2 · Dana — 1st XI coach

| | |
|---|---|
| Role | `coach`; `view_team: true` (`:1773`) |
| Node | **leader** of `1st-XI` |
| **Web** | `1st-XI` + descendants + (post-W-3) `Sport` |
| May see | patterns about visible players, **audience-safe**, no numbers, no quotes, no basis |
| Highs / Lows | leader-audience per player + Web aggregates over `1st-XI` |
| **Must never see** | a player's private capture; a player's raw check-in text; Rugby's players |
| **Live risk** | if Dana is also listed as a *member* of `Sport`, rule 3(a2) grants every person under `Sport` — **including Rugby** (Stage 1 §4) |

### P3 · Morgan — Director of Sport

| | |
|---|---|
| Role | `admin` or `coach`; leader of `Sport` |
| **Web** | `Sport` + `1st-XI` + Rugby + … + (post-W-3) `School` |
| Highs / Lows | aggregates across programmes; per-person only for those in scope |
| **Must never see** | private captures; academic-side material outside `Sport` |

### P4 · Reeve — Headmaster

| | |
|---|---|
| Role | `superadmin` — `_userHasPerm` returns **true unconditionally** (`:2649`) |
| **Web** | the whole graph; `role: 'top_leader'` (leads a parentless node, post-W-3) |
| **Must never see** | private captures — **`_kernelEvidence:7773` excludes them even from a superadmin** |
| Note | superadmin bypasses *permissions*, not *privacy*. Worth asserting; currently untested |

### P5 · Sam — visiting physio

| | |
|---|---|
| Role | `member` or `coach`, **no node** — or a `Support` node outside the sport branch |
| **Web** | their own node only |
| Intended | invited into **one** Ash Focus; sees that Focus and nothing else |
| Status | **ABSENT** — participation does not exist (G1) |
| **Must never see** | Ash's other Focuses, Inquiries, check-ins, or any squad-mate |

### P6 · Jo — Safeguarding Lead

| | |
|---|---|
| Mechanism | `safeguardingLeadId` (`:11470`) — a **routing** target, not a Web |
| **Web** | unchanged by the responsibility (L-W10) |
| Receives | routed flags only |
| **Must never see** | anything not routed to them |
| Status | routing WORKS; **W3-11 asserts the non-widening and does not exist yet** |

---

## 2 · SCENARIO TRACES

### S1 · Ash privately writes "I'm nervous receiving under pressure"

| Step | Result |
|---|---|
| evidence | WORKS — `visibility:'private'`, `ownerRef: ash` |
| origin | WORKS — `originRef` from the capture |
| Self admissibility | WORKS — personal branch admits it |
| Web admissibility | WORKS (correctly excludes) — `:7773` |
| **Self LOW** | **ABSENT** — T-1: the Self pattern pipeline reads `orgSignals`, not the personal branch |
| Self attention item | **PARTIAL** — `_composeToday` yields *"you marked 1 thing private; it stayed private"* |
| Self INQUIRY | WORKS **if a model is available**; **ABSENT** without one |
| Self FOCUS | WORKS — via a prepared suggestion |
| Dana sees | **nothing.** Correct |
| memory | WORKS — durable, correctable |

**Verdict: PARTIAL.** The privacy half is exactly right. The *usefulness to Ash* half is missing —
this is T-1, and it is the clearest single example of why T-1 matters.

### S2 · Squad-wide decline — 6 of 11 players

| Step | Result |
|---|---|
| detection | WORKS — `intel.detectPatterns` per player |
| Web LOW to Dana | **BLOCKED** — C1/C2/C3. Today it surfaces, counting **people not origins**, with hardcoded confidence |
| two-sided floor | 6 of 11 ⇒ complement 5 ≥ 2 ⇒ **discloses correctly** once C1 lands |
| Ash learns | **ABSENT** — G3 |
| Morgan sees | WORKS — a `Sport`-level roll-up via `rollUpShared` |

**Verdict: BLOCKED on C1-C3.** The detection is right; the projection is not.

### S3 · Positive recovery across the squad

Same path, `polarity: progress` → Web High. **BLOCKED on the same three.** Worth noting the product
consequence: today the Highs are as unsafe as the Lows, and it is the Highs a coach will want to
share, which is when a leaked cohort becomes a conversation in a corridor.

### S4 · Dana proposes a development Focus for Ash

| Step | Result |
|---|---|
| Dana may see Ash | WORKS — GATE |
| create the Focus | **ABSENT** — only `/api/me/prepared/act` (self) writes `mem.focuses` |
| record who created it | **BLOCKED** — J2, `origin.by` |
| Ash accepts / declines | **ABSENT** |
| coach's rationale ≠ truth | WORKS — P0-D holds |

**Verdict: ABSENT.** Falcon can run without it — Dana talks to Ash — but it is the most visible
missing product surface, and **D-W3 shapes it.**

### S5 · Ash creates their own Focus

Only reachable by **approving a system suggestion**. There is no "I want to work on this" entry
point. **PARTIAL** — the loop exists; the front door does not.

### S6 · Sam joins one Ash Focus

**ABSENT** — G1. The twelve bridge invariants (B-1..B-12) are specified and unwritten. **Do not build
this for the pilot**; if Falcon wants a physio involved, the physio talks to the coach.

### S7 · A rumour repeated by four players from one origin

| Step | Result |
|---|---|
| four contributions, one `originRef` | WORKS |
| `shouldOpenGroupInquiry` | WORKS — `ECHO`, no inquiry |
| **Web LOW** | **BLOCKED** — C2. Today it counts four people and surfaces |
| across four separate turns with model-assigned refs | **OPEN** — P0-5′ O-12 |

**Verdict: BLOCKED on C2, with a known-open residual.** This is the moat scenario, and it currently
holds at one boundary and fails at the other.

### S8 · Two coaches independently observe the same problem

Two origins ⇒ `INDEPENDENT_CORROBORATION` ⇒ opens. **WORKS.** The control for S7 — a fix that
suppresses S7 must not suppress this.

### S9 · Morgan asks "what changed this month?"

`orgMemory.changedSince` + `orgStateHistory` — **WORKS deterministically.** Articulacy degrades
without a model; the answer does not disappear.

### S10 · Reeve asks "where does attention need to go?"

`/api/intelligence/briefing` at the top level. **BLOCKED on C1-C4** like every other briefing read.
Post-fix: WORKS, over the whole graph.

### S11 · An observation is corrected

| Step | Result |
|---|---|
| supersede | WORKS — `diagnose.js:485` |
| confidence recomputes | WORKS |
| derived artifact narrows | WORKS — `_inheritedVisibility` |
| **already-emitted `orgSignal`** | **BROKEN — T-2.** The signal keeps influencing patterns |
| Web artifact withdraws | **BLOCKED** — C2/C3 must land first |

**Verdict: PARTIAL, with a real defect.** T-2 is the one correctness bug in the correction path.

### S12 · Ash contests a coach's interpretation

`status: 'contested'`, both accounts live, no resolution by rank. **WORKS**, and it is one of the
strongest things in the product.

### S13 · Ash's behaviour changes over eight months

| Step | Result |
|---|---|
| old observations retained | WORKS |
| **current inference reflects the change** | **BROKEN — O-1.** Measured: 50 old observations outrank 20 recent |
| one intense week creates a label | **BROKEN — O-1 / D-2** |

**Verdict: BROKEN.** An eight-month pilot is long enough for this to bite, and it bites in the
direction of mischaracterising a teenager.

### S14 · Morgan runs an intervention

Recorded with `patternType`, `targetMemberId`, outcome. **WORKS.** But `reason` is the string
`'briefing'` — the intervention cannot name the Inquiry it answers (**J3**).

### S15 · The outcome is measured six weeks later

Wilson lower bound, efficacy ranking, feeds `learning`. **WORKS — and it is Level-2 statistics, not a
heuristic.** The strongest deterministic capability in the product.

### S16 · The provider is unavailable

| Capability | Result |
|---|---|
| Web resolution, privacy, scope | WORKS |
| High / Low | WORKS |
| group Inquiry | WORKS |
| Focus persistence + outcome | WORKS |
| org memory, correction, contest | WORKS |
| **personal Inquiry from prose** | **STOPS** |
| semantic retrieval | degrades to keyword |
| **currently provable?** | **NO** — six of eight assertions are green by construction (C5) |

**Verdict: WORKS but UNPROVEN.** Stage 12's suite is what converts this row from a claim to a fact.

### S17 · A weak model proposes something false

| Attempt | Kernel |
|---|---|
| a conclusion | rejects |
| an asserted confidence | discards |
| a fabricated span | rejects |
| private disclosure | never admitted |
| authoritative empirical claim | P0-D holds |
| **fabricated `originRef`** | **ACCEPTS — X-4 / O-14** |
| **duplicate origins across turns** | **INFLATES — X-6 / O-12** |

**Verdict: MOSTLY WORKS, two open holes**, both in origin naming, both benchmark probes.

---

## 3 · THE REHEARSAL SCORECARD

| Verdict | Scenarios |
|---|---|
| **WORKS** | S8, S9, S12, S15 |
| **PARTIAL** | S1, S5, S11, S16 |
| **BLOCKED on PR #74 corrections** | S2, S3, S7, S10 |
| **BROKEN** | S13 (O-1), and T-2 inside S11 |
| **ABSENT** | S4, S6, and the Ash half of S2 |

### What this says about pilot readiness

**Four scenarios blocked by one PR.** S2, S3, S7 and S10 are all `/api/intelligence/briefing`, and
all four unblock together when C1-C4 land. That is the single highest-leverage change in the
programme.

**Two scenarios broken by defects with no product dependency.** S13 (person-model decay) and T-2
(correction propagation) are independent of every Web and Focus decision and can be fixed in
parallel.

**Two scenarios absent by design decision.** S4 and S6 need Focus work. **Falcon can run without
both** — a coach can talk to a player, and a physio can talk to a coach. They are the most *visible*
gaps and the least *urgent*.

**One scenario unproven rather than broken.** S16 works; nothing demonstrates it.

---

## 4 · WHAT FALCON GETS ON DAY ONE, HONESTLY

**Assuming the six pilot blockers land and nothing else** (reduced from eight at Stage 16 —
`docs/ttd/pilot-blocker-challenge-and-packets.md`).

| Persona | Receives |
|---|---|
| **Ash** | own check-ins; own Self Highs and Lows from shared signals; own Focus via suggestion; own Inquiry if a model is available; a privacy reassurance. **No organisational intelligence.** |
| **Dana** | audience-safe per-player patterns; Web aggregates over the squad that respect the two-sided floor and count origins; a roster with names and roles and **no behavioural labels**; the ability to record an intervention and its outcome |
| **Morgan** | the same, one tier up, plus cross-programme roll-ups within `Sport` |
| **Reeve** | the whole graph, same rules; **no access to private captures** |
| **Sam** | nothing — not onboarded for the pilot |
| **Jo** | routed safeguarding flags |

**The honest pitch:** *IntelliQ notices things about your squad without telling you things about
individuals you shouldn't know, remembers why it noticed, and can prove it wasn't the model making it
up.* Everything in that sentence is deliverable with the eight blockers fixed.

**What must not be promised:** a player receiving team intelligence; coach-created Focuses; physio
collaboration; behaviour that adapts as a person changes.

---

## 5 · REHEARSAL AS AN EXECUTABLE ACCEPTANCE TEST

`scripts/falcon-rehearsal-smoke.js` — **PRE-PILOT, after the blockers.**

One fixture with all six personas and the real Falcon shape. Seventeen scenario assertions, each
tagged with its §2 verdict. **The suite ships with the ABSENT and BROKEN rows asserted as
currently-failing**, marked with the gap id, so the rehearsal doubles as the pilot-readiness
dashboard.

**Six negative assertions carry the safety claim:**

| # | Assertion |
|---|---|
| R-1 | Ash never receives any artifact naming another player |
| R-2 | Dana never receives Ash's private capture, in any field, on any endpoint |
| R-3 | **Reeve — superadmin — never receives a private capture** (currently untested) |
| R-4 | Dana never receives a Rugby player in any payload (the 3(a2) case) |
| R-5 | Jo's Web is byte-identical before and after being made Safeguarding Lead |
| R-6 | no payload to any persona contains a `(name, pattern)` pair below the two-sided floor |

**R-3 and R-4 are the two nobody has tested.** R-3 because superadmin short-circuits permissions and
it is easy to assume it short-circuits privacy too — it does not, and that should be locked down.
R-4 because it is a live leak (Stage 1 §4).
