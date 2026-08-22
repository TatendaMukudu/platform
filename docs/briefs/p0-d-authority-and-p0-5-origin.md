# P0-D and P0-5 — the two epistemic blockers

**Companion to:** `docs/briefs/p0-pilot-blockers.md` (P0-1, P0-2, P0-3).
**Sources:** `docs/ttd/organisational-harness-addendum.md` §authority-vs-truth;
`docs/ttd/pilot-readiness-review.md`.

Both are small. Both sit in the product's two most distinctive claims — *authority does not
decide truth* and *agreement is not corroboration* — and both are currently false in code.

Neither touches `server.js`. **They can be dispatched alongside P0-1/2/3 with zero merge risk.**

---

# Brief 4 — P0-D · Authority may settle an arrangement, never a fact

## Problem

`ai/inquiry.js` → `adjudicateAnswer()`. Three branches — negation, affirmation, and plain
statement — each read:

```js
authority:  isOwner ? 'authoritative' : (isMember ? 'shared_but_unverified' : 'reported')
confidence: isOwner ? 'high' : 'medium'
proposal:   { …, corroborationNeeded: !isOwner }
```

`isOwner` is a **role** fact: this person is the responsible owner for this requirement.

For an **operational** claim that is correct and should not change. The coach who sets kick-off
time *is* the system of record for kick-off time; their word settles it, and needing a second
voice to confirm the coach's own decision would be absurd.

For an **empirical** claim it is a category error. *"The squad is fatigued"*, *"morale is down"*,
*"attendance improved"* are propositions about the world. No role makes one true.

The consequence is not cosmetic. `ai/org-state.js:217`:

```js
// A claim explicitly flagged as needing corroboration does NOT satisfy the requirement
const satisfying = candidates.filter(e => !(e.attributes && e.attributes.corroborationNeeded === true));
```

So `corroborationNeeded: false` means **satisfied**. A leader's unevidenced impression currently
closes an empirical question, and the state machine records it as known.

This is the one place in the system where position outranks evidence.

## Invariant

> A person's role may determine what they are entitled to **decide**. It may never determine
> whether an empirical proposition is **true**. An empirical claim always needs corroboration,
> whoever made it.

## The model

A new pure export in `ai/inquiry.js`:

```js
claimNature(claimType) → 'operational' | 'empirical'
```

**`operational` is an ALLOW-LIST.** Its members are the claim types the packs actually define
(`ai/org-state.js:61-80`):

```
meeting_time · meeting_owner · completion_status
kickoff_time · game_plan · availability · session_time
```

**Everything else is `empirical`, including anything unclassified**, and the direction of that
default is the entire safety property. If unknown types defaulted to operational, every claim type
added in future would ship with this defect until someone remembered to classify it.

Then `adjudicateAnswer` consults it in all three branches:

| | operational | empirical |
|---|---|---|
| `authority` when `isOwner` | `'authoritative'` (unchanged) | never `'authoritative'` |
| `confidence` when `isOwner` | `'high'` (unchanged) | not `'high'` |
| `corroborationNeeded` | `!isOwner` (unchanged) | **always `true`** |
| `limitations` | unchanged | must state why, in words a human can check |

Nothing else in the vocabulary changes. `needs_corroboration`, `shared_but_unverified` and
`reported` already exist and already mean the right things.

## On `availability` — the edge worth naming

`availability` is on the operational list and it is the least comfortable member. In the sports
pack it matches *"availab | who's in|out | selected | squad | injur"* — a mix of **squad selection**
(the coach's decision, operational) and **injury** (a fact about a person's body, empirical).

**Keep it operational for the pilot.** In this pack it is read as a selection claim, and splitting
it needs a real Falcon case to split it correctly. Record it here as a known edge rather than
guessing a sub-taxonomy now.

## Failing test

`node scripts/authority-truth-smoke.js` — currently **0 passed, 14 failed**. It stops at the first
case because `claimNature` does not exist; the remaining thirteen run once it does.

Cases 4 and 8 are **regression guards**, not new behaviour: an owner must still settle an
operational claim, and a hedged answer must still be a non-definite placeholder. If the fix
over-reaches, those go red before anything else does.

## Allowed surface

`ai/inquiry.js` only. Add `claimNature` to the exports block.

## Prohibited shortcuts

- Inferring nature from the **answer text**. It is a property of the claim, not of the sentence,
  and case 7 asserts this.
- Making nature depend on **who answered**. That collapses the distinction back into authority.
- Defaulting an unknown claim type to `operational`.
- Removing owner authority from operational claims — that breaks a correct behaviour and case 4.
- Introducing a third nature. Two is enough for a pilot; a spectrum is a research project.
- Touching `ai/org-state.js`. The corroboration gate already exists and already works; this brief
  makes the right claims reach it.

## Acceptance

`authority-truth-smoke` green and registered in `scripts/test.js`; `inquiry-smoke`,
`inquiry-http-smoke`, `org-state-smoke`, `readiness-smoke`, `epistemic-invariants-smoke` still
green; `node scripts/test.js` green.

## Do not touch

`server.js`, `ai/org-state.js`, `ai/diagnose.js`.

---

# Brief 5 — P0-5 · A declared echo must never become an independent origin

## Problem

`ai/forum.js` → `originForMessage(message, { echoesMessage })`:

```js
if (echoesMessage && echoesMessage.contributedOrigin) {
  return { originRef: String(echoesMessage.contributedOrigin), originKind: 'reported', directness: 'inferred' };
}
return { originRef: `forum_${message.messageId}`, originKind: 'direct_observation', directness: 'direct' };
```

The echo branch fires only when `contributedOrigin` is truthy. The caller
(`server.js:12491-12492`) resolves that by looking up the echoed message's candidate:

```js
const origin = forum.originForMessage(msg, {
  echoesMessage: echoed ? { contributedOrigin: (_groupCands(code).find(c => c.evidenceRef === echoed.contributedAs) || {}).originRef } : null,
});
```

So `contributedOrigin` is populated **only if the echoed message has already been contributed**
(`msg.contributedAs` is set) **and** its candidate still exists (candidates expire after
14 days — `CANDIDATE_TTL_MS`, `ai/contribution.js:50`).

In the ordinary human sequence — people discuss, someone agrees, *then* both decide to put it on
the record — the original has not been contributed at the moment the echo is contributed. The
author explicitly declares the echo, and the system mints it as a fresh
`direct_observation` with its own `originRef`.

**The author said "I'm agreeing with Ash". The system recorded "an independent observation".**

Two of those and `contribution.shouldOpenGroupInquiry` (`ai/contribution.js:219`) sees two
independent origins from two people and opens a group inquiry under
`INDEPENDENT_CORROBORATION` — which is precisely the ECHO case the function's own branch at
`:224` exists to refuse.

This is the "five teammates repeating the captain" failure, reachable through the forum, which is
exactly where a room agrees with itself.

## Invariant

> A declared echo never produces a new origin. If the original's origin cannot be resolved, the
> echo is still not an origin — it fails closed as reported, never open as independent.

## The fix

Two parts, and the second is the one that matters.

**1 · The echo branch must not require `contributedOrigin`.** A declared echo of a message that
has not been contributed still points at a real message. The stable identifier for that message's
origin already exists and is deterministic: `forum_${echoesMessage.messageId}` — the same string
`originForMessage` would mint for the original if it were contributed. So an echo of an
uncontributed message can carry the origin the original *will* have, and when the original is
later contributed the two agree by construction.

**2 · Fail closed when nothing resolves.** If `echoesMessage` is present but yields no usable
identifier at all, the result must still be `originKind: 'reported'` with `directness: 'inferred'`
— never `direct_observation`. **The declaration is what matters, not whether the lookup
succeeded.** An echo whose original cannot be found is a retelling of something, and a retelling
of an unknown thing is worth less than a retelling of a known one, never more.

Do not change `newMessage`, `visibleThread`, `mayContributeMessage`, or anything on the server side
of the contribute route unless a test demands it. `ai/forum.js` is pure; keep it that way.

## Failing test

`node scripts/pilot-loop-smoke.js` — currently **28 passed, 1 failed**. The failing assertion is
§4:

```
✗ 4 · an echo does NOT become an independent origin
```

There is no separate smoke file and one is not needed. This assertion sits inside the pilot gate
on purpose: it is one of the five properties that file names as *"what makes this product
different from a dashboard"*, and it should stay where the whole loop is proven.

**Acceptance is `pilot-loop-smoke` at 29/29.**

## Allowed surface

`ai/forum.js` — `originForMessage` only. If the caller in `server.js:12488-12493` needs to pass
the echoed message itself rather than a synthesised `{ contributedOrigin }` object, that call site
may change; nothing else in `server.js` may.

## Prohibited shortcuts

- Guessing echo-ness from wording. `ai/forum.js:141` is explicit that the author declares it, and
  that inferring it *"would either invent independence or destroy it"*.
- Making the echo carry no origin at all. `shouldOpenGroupInquiry` counts `origins` from
  `c.originRef`, so a null origin silently drops the contribution out of the count — a different
  bug that happens to pass this test.
- Extending candidate TTL to make the lookup succeed more often. That treats a timing accident as
  the cause; the defect is that the code trusts a lookup where a declaration was given.
- Changing `MIN_INDEPENDENT_ORIGINS`.

## Acceptance

`pilot-loop-smoke` **29 passed, 0 failed**; `forum-smoke`, `contest-smoke`, `diagnose-smoke`,
`group-subject-smoke`, `origin-correction-smoke` still green; full suite green.

## Do not touch

`ai/contribution.js`, `ai/diagnose.js`.

---

# Dispatch

| Brief | Files touched | Overlaps with |
|---|---|---|
| P0-1 | `server.js` (~6034) + `db.js` | P0-2, P0-3 in `module.exports` only |
| P0-2 | `server.js` (~273–390) | P0-1, P0-3 in `module.exports` only |
| P0-3 | `server.js` (node/inquiry endpoints) | P0-1, P0-2 in `module.exports` only |
| **P0-D** | **`ai/inquiry.js`** | **nothing** |
| **P0-5** | **`ai/forum.js`** (+ one call site) | **nothing** |

**P0-D and P0-5 are merge-free.** They can run at the same time as anything else, and they are the
two smallest jobs in the queue. If Codex is picking up work in order, these are the cheapest wins
and they are in the claims the product is sold on.

Suggested order for a single worker: **P0-5 → P0-D → P0-2 → P0-1 → P0-3.** Smallest first, the
two pure-module jobs before the three that share an exports block, and P0-3 last because its
surface is the widest.

---

# The rules that apply to all five

From `AGENTS.md` and `docs/CODEX_PUSH_PATH.md`, restated because they are what a stranded task
costs:

- **`npm test` green before anything merges.** No DB and no API key needed.
- **The test is the arbiter.** These five suites were written before the fixes, by the reviewer.
  **Do not edit an assertion to make it pass.** If an assertion is genuinely wrong, say so with
  the reasoning and stop — that is a finding, not a blocker.
- **Register the new suite in `scripts/test.js` in the same commit that makes it green.** A green
  test nothing runs is not a guarantee.
- **Push to `codex/<topic>`, never to `main`, never to another agent's branch.** Open a PR — a
  pushed branch generates no webhook anyone receives.
- **A task is not done until it is pushed.** Local commits die with the container.
- **Paste real command output, never a summary of it.** `implemented != tested != integration-tested
  != proven`.
- **No emojis** — anywhere, including commit messages (`CLAUDE.md`).

## Verified state at time of writing

Run against a clean `npm install`, on this commit:

```
evidence-durability-smoke:  0 passed,  9 failed
shutdown-durability-smoke:  0 passed,  7 failed
write-conflict-smoke:       0 passed,  7 failed
authority-truth-smoke:      0 passed, 14 failed
pilot-loop-smoke:          28 passed,  1 failed
```

Five suites, 38 failing assertions, five files. That is the whole pilot gate.
