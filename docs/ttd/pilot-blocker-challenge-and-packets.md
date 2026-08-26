# Pilot blocker challenge and Codex implementation packets

**Status:** CURRENT. Supersedes the blocker classification in
`docs/ttd/consolidated-implementation-queue.md` §2.
**Stages 16 and 17** of the final pre-implementation hardening program. Preceded by `8317ec8`.
**Written against:** `8317ec8`.

**Method:** for every claimed blocker, *can Falcon safely operate without this?* For every deferred
item, *is there a real pilot path that fails without it?* Answers derived from the scenario traces
in `falcon-persona-rehearsal.md`, not from architectural preference.

---

## PART 1 — THE CHALLENGE (Stage 16)

### 1.1 · Result: three demoted, two promoted

| Item | Was | Now | Reason |
|---|---|---|---|
| C5 no-LLM suite | BLOCKER | **BLOCKER (dependency)** | not a runtime risk; it blocks *verification* of C1-C4 |
| C1 two-sided floor | BLOCKER | **BLOCKER** | demonstrated live person-level disclosure |
| C2 count origins | BLOCKER | **BLOCKER** | the moat law fails; a rumour becomes organisational intelligence |
| C3 derived confidence | BLOCKER | **PRE-PILOT** *(ships with C2)* | epistemic overclaim, **no disclosure** |
| C4 allow-list | BLOCKER | **BLOCKER (item 3 only)** | items 1-2 are latent; item 3 must land with PR #74 |
| **J2 `focus.origin`** | BLOCKER | **PRE-PILOT** | **the unrecoverability premise is false — see 1.2** |
| C6 `canTranscribe` | BLOCKER | **CONDITIONAL** | only bites in no-egress mode |
| C7 embeddings | BLOCKER | **CONDITIONAL** | same |
| **O-1 person-model (bursty half)** | PRE-PILOT | **BLOCKER** | **see 1.3** |
| **GI-6 erasure cache** | PRE-PILOT | **BLOCKER** | **see 1.4** |

### 1.2 · J2 demoted — the unrecoverability argument does not hold

J2 was classified a blocker because *"intent cannot be back-filled."* **Checked: there is exactly one
path that creates a Focus** — `/api/me/prepared/act` (`server.js:4838`), which requires the owner to
approve a suggestion.

Every Focus Falcon creates during the pilot is therefore, unambiguously,
`origin: { by: 'self', from: null }`. **A back-fill is deterministic, not a guess.**

> **The blocker re-arms the moment a second creation path ships.** If coach-created or
> coach-proposed Focus (S4) lands during the pilot, `origin.by` must land **first**. Recorded as a
> conditional, not removed.

### 1.3 · O-1 promoted — the bursty half is a pilot-duration harm

The change-over-time half (D-1) needs years and does not bite in a three-month pilot. **The bursty
half (D-2) bites in week one.**

Measured: **three observations inside a single day** clear `FLOOR = 3` and assert a dimension. There
is no per-observation timestamp, so one difficult afternoon for a 16-year-old produces a
characterisation that persists for the entire pilot with no mechanism to age out.

In a school, with minors, that is a product harm rather than a technical debt. **The distinct-days
half of O-1 is a pilot blocker.** The dormancy half remains pre-pilot.

### 1.4 · GI-6 promoted — an erasure path that does not erase

`_removePerson` (`server.js:1903`) is headed *"Hard-delete ALL of this person's data (GDPR Art 17 —
right to erasure). Must leave NO orphaned personal data anywhere."* It invalidates nothing across 167
lines, and `rosterCache` holds `{id, name, role}` with a 2-hour TTL.

**A child removed from Falcon has their name served from every leader's cached roster for up to two
hours after erasure.** A pilot with minors, where a parent may withdraw consent, is exactly the
context where this is not tolerable. The fix is one helper called from two places.

### 1.5 · The deferred list, challenged

*Is there a real pilot path that fails without this?*

| Deferred item | Pilot path that fails? | Verdict |
|---|---|---|
| peer intelligence (comparison Web) | none — Falcon's value is within-branch | **stays deferred** |
| model router (G-5) | none | stays deferred |
| **gateway budget (G-1)** | **yes** — 18 unbudgeted provider calls in request paths; a usage spike burns credit with no ceiling | **PRE-PILOT, confirmed** |
| local models | none | stays deferred |
| GNNs / graph analytics | none | stays deferred — permanently |
| ontology joins beyond Focus | none. J1/J3 improve traceability; nothing fails | stays PRE-PILOT |
| continuous autonomous Inquiry creation | none — propose-only is sufficient | stays deferred |
| full W-4 migration | none — the harness is enough | stays deferred |
| behaviour→aim bearings (J5) | none | stays deferred |
| **W-3** | none *strictly* — but S2/S9 improve materially, and Falcon **has** a Director above coaches | stays PRE-PILOT |
| **T-1 (Self High/Low blind to private evidence)** | none — it errs toward non-disclosure | stays PRE-PILOT |
| **T-2 (corrections don't reach signals)** | **possibly** — a corrected observation keeps influencing patterns. Rare in three months, not impossible | stays PRE-PILOT, watch it |

**Nothing else promotes.** The deferral discipline holds.

### 1.6 · Final blocker set — six items

| # | Blocker | One-line justification |
|---|---|---|
| **B1** | C5 · real no-LLM suite | without it, B2-B4 cannot be shown to work |
| **B2** | C1 · two-sided cohort floor | measured person-level disclosure |
| **B3** | C2 (+C3) · count origins, derive confidence | the moat law fails at the Web boundary |
| **B4** | C4 item 3 · derive `perspective` | closes laundering at the source, and PR #74 is open now |
| **B5** | O-1 (distinct-days half) | one bad day labels a child for the pilot |
| **B6** | GI-6 · invalidate on person removal | an erasure that does not erase |

**Conditionals:** J2 if coach-Focus ships · C6 + C7 if Falcon deploys no-egress.

**Down from eight to six, with two of the six newly promoted.** The set is smaller *and* different.

---

## PART 2 — CODEX IMPLEMENTATION PACKETS (Stage 17)

Independently executable except where dependencies are stated. **Do not combine unrelated fixes to
reduce PR count.**

---

### PACKET 1 — Real no-LLM capability floor  ·  **B1**

**Why now:** the current claim rests on six green-by-construction assertions; `pilot-loop-smoke §10`
contains `&& false`. Nothing else can be verified until this exists.
**Authoritative law:** `docs/briefs/no-llm-capability-matrix.md` (full spec, F-1..F-20).
**Starting truth:** three suites run under the switch (`group-subject-smoke:19`, `forum-smoke:15`,
`no-egress-smoke`). Four model exits plus a raw `client` export.
**Inspect:** `ai/gateway.js:262-351`, `ai/embeddings.js:20`, `server.js:9175`, `:12588`,
`scripts/group-subject-smoke.js`, `scripts/pilot-loop-smoke.js:180-190`.
**Change:** `scripts/no-llm-floor-smoke.js` (new), `scripts/test.js`, delete
`no-llm-harness-smoke.js`, remove `pilot-loop-smoke §10`.
**RED:** F-5, F-6, F-7, F-8, F-15, F-19, F-20.
**Adversarial RED:** remove all five stubs with a key present — **F-18 must go red.** If it stays
green the stubs are not intercepting and the suite is theatre.
**Constraint:** every assertion carries its mutation in a comment; no assertion reads back a seeded
value.
**Non-goals:** making personal Inquiry deterministic; vision/audio fallbacks.
**Stop:** an assertion with no constructible mutation — delete it.
**Done:** F-1..F-20 green; each demonstrated red; registry line claims exactly the matrix §2 summary.
**Commit:** one. **Depends on:** Packet 6 (C7) for F-1 only.

---

### PACKET 2 — Two-sided cohort floor  ·  **B2**

**Why now:** measured — a two-member scope where both decline publishes a Web Low naming both.
**Authoritative law:** L-PR1, `docs/ttd/privacy-inference-attacks.md` §2.
**Inspect:** `server.js:4134` `_sanitizeBriefingForLeader`, `:4154` `_webIntelligence`, `:4220-4222`,
`:4246`, `:16932` `MIN_COHORT`.
**Change:** `server.js`, `scripts/privacy-inference-smoke.js` (new), `scripts/test.js`.
**RED:** P-1 (`k = n`), P-2 (`n−k < MIN_COHORT`), P-3, P-6, P-7, P-12.
**Adversarial RED:** the naive fix — *"drop entries below `MIN_COHORT`"* — **passes P-3 and fails
P-1.** P-1 is the assertion that catches it.
**Constraint:** import `MIN_COHORT` from one place; `participation` → `null`, never `0`; no noise, no
rounding.
**Non-goals:** changing `MIN_COHORT`; per-member items; the roster.
**Stop:** a frontend read breaks with no null-safe path — report.
**Done:** P-1, P-2, P-3, P-6, P-7, P-12 green; an 8-member/3-declining scope still publishes.
**Commit:** one. **Depends on:** Packet 1.

---

### PACKET 3 — Count origins, derive confidence  ·  **B3**

**Why now:** one origin retold by three people surfaces a Web Low.
**Authoritative law:** `ai/contribution.js:203`; L-W15.
**Inspect:** `server.js:4154`, `:4215`; `ai/contribution.js:194-260`.
**Change:** `server.js`, `scripts/web-intelligence-smoke.js`.
**RED:** echo case ⇒ nothing; all-`high` constituents ⇒ `severity: 'high'`; mixed confidence ⇒
**minimum**.
**Adversarial RED:** (a) three findings with **no** `originRef` ⇒ nothing — catches a hand-rolled
`Set` that lost `contribution.js`'s falsy filter; (b) one authoritative finding ⇒ **surfaces** —
catches a Set-size check that skipped `AUTHORITATIVE_SOURCE`; (c) four `tentative` + one `clear` ⇒
`tentative` — catches max-confidence.
**Constraint:** **call `shouldOpenGroupInquiry`; do not reimplement the rule.** Carry provenance
internally, never render it.
**Non-goals:** editing `ai/contribution.js`; a new corroboration rule.
**Stop:** the input shape does not fit — report the mismatch, do not edit the epistemic module.
**Done:** ten people/one origin ⇒ nothing; two origins ⇒ surfaces; `pilot-loop-smoke` still 28/1.
**Commit:** one (C2 and C3 share the accumulator). **Depends on:** Packet 2.

---

### PACKET 4 — Derive `perspective`; allow-list Web artifacts  ·  **B4**

**Why now:** PR #74 accepts `perspective` from the caller, which is the first step toward eight
stored object types and toward identity laundering.
**Authoritative law:** L-C5, L-OB1.
**Inspect:** `ai/proactive.js:213-277`, `:293-309`.
**Change:** `ai/proactive.js`, `scripts/proactive-smoke.js`.
**RED:** a field not on any deny-list (`assigneeRef`, `authorId`) ⇒ violation; `web` + `self`
carrying `basis` ⇒ violation; caller-supplied `perspective:'web'` with a person `subjectRef` ⇒
derived as `self`.
**Adversarial RED:** the deny-list fix passes the six named fields and **fails the unnamed
seventh**. That assertion is the packet.
**Constraint:** frozen `WEB_ARTIFACT_KEYS` allow-list; derive perspective inside `toInsight`.
**Non-goals:** a name detector in free text — **record as a stated limitation**.
**Stop:** deriving perspective changes any existing self-audience insight — report.
**Done:** all twelve identity vectors blocked; no producer can set `perspective`.
**Commit:** one. **Depends on:** Packet 1.

---

### PACKET 5 — Person-model distinct-days  ·  **B5**

**Why now:** three observations in one day label a child for the pilot's duration.
**Authoritative law:** R9; L-PM1; the template is `ai/self-model.js:66-69`.
**Inspect:** `ai/person-model.js` (whole), `ai/self-model.js:29,47,66-69`, `server.js:8004-8019`.
**Change:** `ai/person-model.js`, `scripts/person-model-temporal-smoke.js` (new), `scripts/test.js`.
**RED:** PM-1 (bursty), PM-4 (recent change), PM-6 (old high-volume vs new low-volume).
**Adversarial RED:** **PM-8 reactivation** — a fix that *drops* dormant entries passes PM-3 and fails
PM-8. History must return in full, not restart at one.
**Constraint:** reuse `STALE` from `self-model.js`; **no new constant**; **no weighted scores** —
`evidence` stays a legible count of distinct days; old-shape data reads as dormant, never
synthesised.
**Non-goals:** deleting history; an erase surface; changing `FLOOR`; `publicProjection`.
**Stop:** any consumer reads `m[dim][token]` as a number — report the list first.
**Done:** PM-1..PM-12 green; `publicProjection` byte-identical.
**Commit:** two — `person-model.js` first, `_capabilityDims` (D-3) second, different consumers.
**Depends on:** none.

---

### PACKET 6 — Invalidate projections on structural change  ·  **B6**

**Why now:** an erased person's name is served from cached rosters for up to two hours.
**Authoritative law:** L-W13; `docs/briefs/web-final-contract.md` §2.
**Starting truth:** **two** mutation paths, not one — `_commitTreeMutation` (`:2450`) and
`_removePerson` (`:1903`), the second invalidating nothing.
**Inspect:** `server.js:1903-2070`, `:2450-2478`, `:3632` (`BRIEFING_TTL`), `:9863`, `:9951`.
**Change:** `server.js` (one helper, two call sites, one fingerprint),
`scripts/graph-invalidation-smoke.js` (new), `scripts/test.js`.
**RED:** GI-3, GI-4, **GI-5**, **GI-6**, GI-7, GI-8, GI-9.
**Adversarial RED:** the naive fix — *"invalidate the cache for the user who moved"* — passes GI-3
and **fails GI-5**, because the person who moved is not the person whose projection went stale.
**Constraint:** fingerprint hashes ids, parents, leaders, members **only** — never names, or every
rename invalidates. `_removePerson` must also call `_backfillUserNodeIds()`.
**Non-goals:** distributed consistency; zookies; a cache framework.
**Stop:** a third mutation path is discovered — report it before changing anything.
**Done:** GI-1..GI-10 green; GI-6 proves an erased name is gone on the next read.
**Commit:** one. **Depends on:** none. **Runs in parallel with Packets 1-4.**

---

### PACKET 7 — Gateway budget and telemetry  ·  PRE-PILOT (G-1, G-2, G-3)

**Why now:** 18 of 23 model calls reach a provider with no budget check, in request paths.
**Inspect:** `ai/gateway.js` (whole), `server.js:11413-11429`.
**Change:** `ai/gateway.js`, `server.js` (remove the now-redundant caller checks),
`scripts/no-egress-smoke.js`.
**RED:** a call from an unbudgeted site is refused when the org is over budget — fails today;
`canTranscribe() === false` under the switch — fails today; `understand()`/`transcribe()` refuse
with a deterministic-mode error — fail today.
**Adversarial RED:** call `transcribe()` **directly**, bypassing the gate — must refuse. A fix that
only patches `canTranscribe()` passes the gate test and fails this.
**Constraint:** budget denominated in estimated tokens by tier, not calls. Degrade, never error to a
user.
**Non-goals:** routing tables; caching; re-tiering.
**Done:** every provider-reaching export refuses under the switch; every call is budgeted; telemetry
records `(org, task, tier, tokens, cacheHit)`.
**Commit:** one. **Depends on:** none. Delivers C6 and C7.

---

### PACKET 8 — W-3 Web law  ·  PRE-PILOT

Full spec: `docs/briefs/web-final-contract.md` Part 1. **Two edits** (`ai/org-graph.js:68-72`;
`ai/scoped-intelligence-packet.js:41`), **one amended assertion**
(`scoped-intelligence-packet-smoke.js:47`), **twelve new invariants** including W3-9/W3-10 which
assert D-W6's negatives.
**Adversarial RED:** the naive fix recomputes descendants from the added parent; **W3-2 and W3-5**
catch it.
**Depends on:** D-W6 ✓, D-W7 ✓ (both resolved). **Commit:** one, both edits.

---

### PACKET 9 — W-4 parity harness  ·  PRE-PILOT, no behaviour change

Full spec: `web-final-contract.md` Part 3. Produces the complete divergence list, including the
3(a2) row. **Ships no production change.**
**Depends on:** Packet 8.

---

### PACKET 10 — J1, J3, P0-B foreign keys  ·  PRE-PILOT

Three single fields: `inquiry.servesObjectiveId`, `intervention.respondsToInquiryId`, `prov()` gains
`by` and `at`. Each unlocks a deterministic sweep. **Three separate commits** — different consumers,
different blast radii.
**Depends on:** none.

---

## PART 3 — EXECUTION ORDER

```
LANE A (PR #74, serial)      Packet 1 → 2 → 3 → 4 → re-review
LANE B (independent)         Packet 5 ‖ Packet 6 ‖ Packet 7
LANE C (Web, serial)         Packet 8 → 9
LANE D (fields)              Packet 10
```

**Lanes A and C must not run simultaneously past Packet 9** — W-4's first migration target is the
briefing endpoint Lane A owns. Lanes B and D conflict with nothing.

**Falcon-ready when:** Packets 1-6 are green and the rehearsal suite
(`falcon-persona-rehearsal.md` §5) passes its six negative assertions.

Packets 7-10 improve the pilot; they do not gate it.
