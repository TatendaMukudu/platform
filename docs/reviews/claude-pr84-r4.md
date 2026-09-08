# Independent review — PR #84, canonical ownership correction

**Reviewed head:** `0c7117fa3799f1013846c40dac5072348e72d7a9` — verified as the current head of
`codex/review-r1`. The three named commits `9e20872`, `5729309`, `0c7117f` are the last three of
eight. **No later changes.** Base `main` is `5683df3` and has not moved since the PR opened, so
the diff reviewed is the diff that would merge.

**Read:** `AGENTS.md`, `docs/reviews/PROTOCOL.md`, `docs/reviews/codex-r2.md`,
`docs/reviews/codex-r3.md`, the PR description, and the full diff (22 files, +1690/-332).

**Method:** Codex's summary, PASS verdicts, mutation map and CI claims were treated as assertions
to verify. Mutations were reproduced in an isolated copy of the reviewed head at
`/tmp/.../m84` so the branch was never modified. No implementation was changed by this review.

---

## Findings, most severe first

### F1 — An undeclared, live change to when a High or a Low surfaces

**Severity: high (product law changed while the report states it did not).**
`ai/team-state.js:184` (`evidenceValence`), via `ai/diagnose.js:200` (`originIdentity`).

The direction-vote key changed from `sig.originRef || sig.ref` to `diagnose.originIdentity(sig)`,
which reads `originRef` only. `diagnose.originOf` writes `originRef: null` whenever a proposal
carries no established origin, and every signal carries its own unique `ref`.

**Failure scenario.** Two accounts arrive with no established origin, each declaring `decline`.
Before this PR each keyed on its own `ref`, so they counted as **two independent origins**,
cleared `MIN_ORIGINS = 2`, and filed a Low. After this PR they count as **zero**.

**Reproduced** (against the reviewed head):

```
two signals {originRef: null, direction: 'decline'}
  NEW: ok=false polarity=neutral origins=0 blocked=["undirected"]
  OLD: keyed on sig.ref -> 2 distinct origins -> a filed Low
```

**Violated requirement.** Brief item 5: *"Check that centralization did not change product law."*
`docs/reviews/codex-r3.md` states under *Refused / escalated*: *"The correction removes duplicate
ownership without changing privacy, ontology, epistemic or Forum contribution law."* That
statement is false as written.

**Assessment.** The new behaviour is, in my judgement, **correct** — it is L-OR1, and it is what
`originOf`'s own comment already says: *"A kind without a reference cannot be distinguished from
any other occurrence of that kind, so it establishes nothing about independence."* The old
fallback let unattributed repetition masquerade as corroboration. This is a fix, and it moves
conservatively (fewer Highs and Lows, not more).

But it is a change in what the product asserts about people, shipped inside a pass declared to
change no such thing, with no assertion pinning it.

**Smallest correction.** No code change. Declare it in `codex-r3.md`, and add one assertion
fixing the new rule — an account with no established origin casts no direction vote — so the
change is deliberate and guarded rather than incidental.

---

### F2 — A second undeclared origin-law change, latent rather than live

**Severity: moderate.** `ai/team-state.js:170` (`originsOf`).

Old code required `sig.status === 'active'` strictly. The new delegation to
`diagnose.currentOriginCount` uses `diagnose.isActive`, which treats a **missing** `status` as
active.

**Reproduced:**

| signals | old `originsOf` | new `originsOf` |
|---|---|---|
| no `status` field at all | **0** | **2** |
| explicit `status: 'active'` | 2 | 2 |
| superseded then replaced, same origin | 2 | 2 |

A belief whose signals carry no explicit status went from *never* able to clear the origins gate
to clearing it immediately.

**Why it is latent, not live.** `diagnose.applyProposals` (`ai/diagnose.js:545`) always writes
`status: 'active'`, so no production path currently produces a status-less signal. The change
affects hand-constructed signal objects only — several test fixtures build them this way.

**Assessment.** Again the new reading is the more defensible one: `isActive` is the codebase's
canonical predicate and "missing means active" is the convention everywhere else. The old
`originsOf` was the outlier. But the contract of a load-bearing function changed silently.

**Smallest correction.** Declare it. Optionally assert the intended reading directly.

---

### F3 — The parity suite cannot detect `mem.lastUpdated` failing on update or outcome

**Severity: moderate (missing evidence, not an implementation defect).**
`scripts/focus-ownership-parity-smoke.js:41`.

```js
lastUpdated: Number.isFinite(Date.parse(S._getMemory(code, 'owner').lastUpdated)),
```

This reduces the value to a **boolean**. Create runs first and sets it, so from then on the
boolean is permanently true. FP2, FP6 and FP8 compare `JSON.stringify(directEffects) ===
JSON.stringify(composerEffects)` — comparing `true === true`.

**Reproduced, in an isolated copy of the reviewed head:**

| Mutation | Result |
|---|---|
| remove `mem.lastUpdated` from `_updatePersonalFocus` (`server.js:8702`) | **NOTHING WENT RED** |
| remove `mem.lastUpdated` from `_recordPersonalFocusOutcome` (`server.js:8720`) | **NOTHING WENT RED** |
| remove `mem.lastUpdated` from `_createPersonalFocus` (`server.js:8642`) | FP2, FP10 red |
| remove only `focus.updatedAt` from the update owner | FP6 red |
| remove only `focus.resolvedAt` from the outcome owner | FP8 red |

**Violated requirement.** Brief item 2 lists `lastUpdated` as a dimension the parity suite must
compare. FP6's text says *"both update transports set equivalent timestamps, lastUpdated and
audit hooks"* and FP8's says *"outcome parity includes learn lifecycle, notice feedback,
lastUpdated and audit"*. Neither predicate can detect that side effect being lost.

**Codex's mutation map row is half true.** *"Remove canonical update timestamp/lastUpdated
assignment → FP6"* conflates two assignments on one line. The `updatedAt` half bites; the
`lastUpdated` half does not. `mem.lastUpdated` is a real freshness marker written from five other
places (`server.js:1629, 5667, 5815, 8629, 15733`).

**Smallest correction.** Capture the value rather than a boolean: read `mem.lastUpdated` before
each transport and assert it strictly advances.

---

### F4 — Audience authorization is unasserted for two of the three cases the brief names

**Severity: moderate (missing evidence; implementation verified correct).**
`server.js:8568` and `server.js:8573`.

**Reproduced:**

| Mutation | Result |
|---|---|
| drop the `_inNode` membership check — share to a group you are not in | **NOTHING WENT RED** |
| drop `strict && rejected.length` — stop refusing non-contacts | **NOTHING WENT RED** |
| drop `expectedParticipantIds` from the group-sharing confirmation | CA15c3 red |

**The implementation is correct.** Verified directly against `_resolvePersonalFocusAudience`:

```
own group                          -> ok    invited ["me","peer"]
a group I am NOT in                -> 403   audience unavailable
a group that does not exist        -> 403   audience unavailable
non-contact named, strict          -> 403   audience unavailable
non-contact named, lenient         -> ok    private ["me"]      (silently narrowed)
stale snapshot                     -> 409   stale_audience
```

So this is a gap in evidence, not in behaviour. Membership-change-between-proposal-and-
confirmation **is** covered (`composer-actions-smoke.js:197`, verified red).

**Related, and also unasserted.** The two transports differ in authority enforcement: direct
create (`server.js:5689`) is lenient and tells the person *"Some names could not be added"*;
composer create (`server.js:17300`) passes `strictAudience: true` and refuses with 403. That is
defensible — a model should not silently narrow an audience it proposed — but brief item 2 lists
*"Source rejection and authority enforcement"* as a parity dimension, and the divergence is
neither asserted nor documented.

**Smallest correction.** Two assertions: unauthorized group refused, and strict non-contact
refused. One line in the runtime note recording the deliberate strict/lenient asymmetry.

---

### F5 — The "sole owner" claim is slightly overstated

**Severity: low (pre-existing; no divergence today).** `server.js:5803-5806`.

`POST /api/me/focus/:id/tried` writes `focus.attempts` and `focus.askedAt` — Focus lifecycle
state, and `askedAt` drives the follow-up clock — without going through `_updatePersonalFocus`.
It sets `mem.lastUpdated` and calls `scheduleSave()`, but unlike create, update and outcome it
writes **no `_audit` entry**.

Untouched by this PR beyond line shifts, and the composer vocabulary
(`ai/composer-actions.js:12-40`) has no counterpart action, so there is no entry-point divergence
to find. It simply means `_createPersonalFocus`/`_updatePersonalFocus`/`_recordPersonalFocusOutcome`
are not quite the *only* writers of personal-Focus state.

**Smallest correction.** None required for this PR. Record it so the ownership claim is accurate.

---

### F6 — Historical mutation evidence is unavailable

`/tmp/focus-mutations.py`, cited in `codex-r3.md`'s **Ran** line, **does not exist** in this
environment. Its 16-row mutation map is therefore an unverified historical claim except for the
rows I reproduced myself. Those results are below; two of them contradict the map.

---

## Mutations I reproduced

All against `0c7117f` in an isolated copy. A non-zero exit with no `FAIL` line was counted as red
and is reported as such; none occurred.

| # | Mutation | Result |
|---|---|---|
| M-A | composer create bypasses the shared owner and writes `mem.focuses` itself | FP1, FP2, FP3 red |
| M-B | `_recordNoticeFeedback` removed from the outcome owner | FP8 red |
| M-C | `mem.lastUpdated` removed from the **outcome** owner | **nothing red** |
| M-C2 | `mem.lastUpdated` removed from the **update** owner | **nothing red** |
| M-C3 | `mem.lastUpdated` removed from the **create** owner | FP2, FP10 red |
| M-C4 | only `focus.updatedAt` removed from the update owner | FP6 red |
| M-C5 | only `focus.resolvedAt` removed from the outcome owner | FP8 red |
| M-D | source validation replaced with an unvalidated pass-through | FP1, FP3, FP5 red |
| M-E | audience resolution ignores `groupId` | FP9 red |
| M-F1 | same-origin collapse removed (each signal its own origin) | OP1, OP3 red |
| M-F2 | missing `originRef` counted as an independent origin | OP1 red |
| M-G | stale-membership rejection removed from group-sharing confirm | CA15c3 red |
| M-H | unauthorized group accepted | **nothing red** |
| M-I | strict non-contact rejection disabled | **nothing red** |

Eleven of fourteen bite. The three that do not are F3 and F4.

I also checked the two static assertions the brief warned about. **FP11 is sound**: its
`directCreateBody` slice is 1168 characters containing exactly one route and one
`_createPersonalFocus(` call, so it cannot be satisfied by a second call site; `confirmBody` is
ordered and contains the three expected owner calls and zero direct mutations. **FP12 is
part-static** — it matches a sentence in `ASSISTANT_RUNTIME.md` — but it also asserts real
behaviour (`unchangedBeforeConfirm`, and that a proposal was produced), so it is not a
documentation check presented alone as behavioural proof.

---

## Tests actually run

`npm test` at `0c7117f` — **TRUTH LAYER GREEN**, all sources parse, all suites pass.

| Suite | Result |
|---|---|
| focus-ownership-parity-smoke | 15 passed, 0 failed |
| composer-actions-smoke | 41 passed, 0 failed |
| focus-creation-smoke | 16 / focus-continuity-smoke 44 / focus-action-owner-smoke 3 |
| team-state-smoke | 135 passed, 0 failed |
| highs-lows-smoke 24 · self-high-low-smoke 5 | 0 failed |
| chart-governance-smoke | 34 passed, 0 failed |
| origin-correction-smoke 51 · origin-independence-smoke 14 | 0 failed |
| material-reach-http-smoke | 87 passed, 0 failed |
| private-evidence-smoke 18 · forum-smoke 71 | 0 failed |
| shelf-http-smoke 33 · scope-parity-smoke 7 · object-conversation-screen-http-smoke 4 | 0 failed |

**CI at the reviewed head:** run `34193623163`, `node scripts/test.js`, **success**, 06:11:53 →
06:13:25. (`codex-r3.md` cites run `34193479545` at `5729309`, the previous commit; the head has
its own green run. Not a discrepancy, just an earlier citation.)

---

## Verification gaps

- **No live model provider.** Every path exercised is model-off and deterministic. Interpretation
  quality, and the behaviour of `ground()` on genuinely ambiguous group names, were not tested.
  The brief's requirement that *"ambiguous names must require clarification rather than guessing"*
  is therefore **unverified**: `_resolvePersonalFocusAudience` takes a `groupId`, not a name, so
  name resolution happens upstream in the composer where a model is required.
- **No browser or device.** Item 4's client controls were verified by reading `js/app.js` and
  confirming each posts to a server route that enforces authority; none were exercised in a
  rendered page.
- **No Render deploy, no production data.**
- **Threshold duplication** (`contribution.MIN_INDEPENDENT_ORIGINS` vs `teamState.MIN_ORIGINS`)
  left as pre-existing debt, as instructed. I confirmed this PR did not change either constant.
- I did not re-review the parts of PR #84 that predate the correction commits (the composer
  action surface from `00cebd0`–`6680a7e`) beyond running its suites; this review is scoped to the
  narrow correction as instructed.

---

## Implementation defects vs missing evidence

- **Implementation defects: none.** Every behaviour I tested is correct, including the six
  audience cases and the three canonical owners.
- **Undeclared behaviour change: F1 (live), F2 (latent).** Both are, in my reading, improvements
  — but the report asserts no law changed, and one of them alters when a High or a Low is filed.
- **Missing evidence: F3, F4.** Three assertions name side effects their predicates cannot
  detect, proven by mutations that bite nothing.
- **Documentation accuracy: F5, F6.**

---

FOCUS OWNERSHIP:
PASS

CONTROL-SURFACE CLAIM:
ACCURATELY NARROWED

CANONICAL OWNERSHIP:
PASS

FINAL ACCEPTANCE:
FAIL

Ownership is genuinely centralised and I could not break it. Acceptance is withheld on F1 — a
live change to when the product files a High or a Low, shipped inside a pass whose report states
that no epistemic law changed — and on F3 and F4, where three assertions relied upon as proof of
parity and authority were shown by mutation to be unable to fail. None of these requires a
redesign; F1 and F2 need a corrected report plus one assertion each, and F3 and F4 need four
assertions. Not merged.
