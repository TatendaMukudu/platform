# Pilot readiness review

**Reviewer:** Claude (architecture)
**Date:** 2026-08-15 · `main` @ `a6cdaf3`
**Verdict: READY AFTER BLOCKERS.** Four blockers, all small, all cited. None is a redesign.

Every architectural claim below cites a file and line. Where I could not verify something I say
so rather than guessing — this project has already been burned once by an architectural claim
written without opening the code.

---

# A. Current architecture map

## What actually exists

**Shape.** One Node process. `server.js` is 17,237 lines; `ai/` is ~30 pure modules; ~130
registered suites in `scripts/test.js`. Persistence is Postgres (`db.js`) holding JSONB rows,
one per *durable unit* — `store:<name>:<orgCode>` — so a mutation writes only what changed
(`_durableUnits`/`_applyUnits`, proven by `scripts/persistence-smoke.js` case 3).

**State.** 92 in-memory stores, every one keyed by `orgCode` (`server.js:954-1040`). At boot,
`db.loadStores()` → `_applyUnits(rows)` (`server.js:405-411`) loads **every organisation into
one heap**.

**The epistemic kernel — genuinely strong, and the differentiator.**

| Concern | Where | Guarded by |
|---|---|---|
| Signals, origins, corrections | `ai/diagnose.js` — `ORIGIN_KINDS:163`, `supersede:485`, `UNKNOWN_ORIGIN_CAP:177` | `origin-correction-smoke` |
| Retrieval lifecycle gate | `server.js:_kernelEvidence:7355` (`status !== 'active'` → excluded, allowlist) | `admissibility-smoke` |
| Contested beliefs | `ai/reason.js:238`, `applyFeedback:490` | `contest-smoke` (27), `contest-http-smoke` (11) |
| Contribution boundary | `ai/contribution.js` — "membership is not consent" (`:14`) | `group-subject-smoke` |
| Deliberation | `ai/forum.js` — speech is not evidence, *by file shape* | `forum-smoke` |
| Language guard | `ai/language-guard.js` | `language-guard-smoke` (43) |
| Activity ≠ outcome | `ai/packs.js:primitiveForSignal`, `ai/primitives.js` | `activity-outcome-smoke` (23) |
| LLM independence | `ai/gateway.js:58` `deterministicOnly()`, `:137` no-egress backstop | `no-egress-smoke` |
| Prompt injection | `assembleGoverned` demotes uncited org claims to questions | `prompt-injection-smoke` |
| Audit | `ai/audit.js` — hash-chained, action allowlist (`:29-36`) | `audit-smoke` |
| GDPR | erasure `server.js:1754`, retention purge `:452` | `audit-http-smoke` |

**Tenant isolation is structural, not conventional.** Every store is `store[orgCode]`; `orgCode`
comes from `req.iqSession.orgCode`, never from user input. The pgvector path is scoped in SQL —
`nearestMembers` has `WHERE org_code = $1` on every clause including the subselects
(`db.js:280-293`). Evidence vectors are partitioned in memory (`evidenceVectors[code]`,
`server.js:8246`). Covered by `cross-org-isolation-http-smoke`.

**I looked for cross-tenant leakage and did not find any.** That is the single most reassuring
finding in this review.

---

# B. Pilot readiness verdict

## READY AFTER BLOCKERS

The engineering is not the risk. The kernel is better than the product model claimed, privacy is
structural rather than promised, and the truth layer is unusually disciplined for a pre-revenue
product.

Four things must change first. All four are *data-integrity* problems, and each one silently
destroys the exact thing IntelliQ sells: an honest record.

---

# C. Pilot blockers

## P0-1 — Evidence is silently destroyed at 8,000 envelopes per org

**Claim.** The organisation's evidence log is FIFO-truncated, dropping the oldest evidence with
no audit event, no notice, and no invalidation of anything citing it.

**Code.** `server.js:1040` `EVIDENCE_LOG_CAP = 8000`; `:6036-6038`:

```js
if (log.length > EVIDENCE_LOG_CAP) {
  const dropped = log.splice(0, log.length - EVIDENCE_LOG_CAP);
  dropped.forEach(d => { if (d.rawRef) delete rawEvidence[d.rawRef]; });
}
```

**Failure scenario.** A 100-person org with daily check-ins generates ~25,000 envelopes a year,
so the cap is reached in roughly four months. From then on, every new piece of evidence deletes
the oldest. A belief formed in month two cites `evidenceId` values that no longer exist;
`_retrieveGrounding` iterates `evidenceLog[code]`, so those claims quietly lose their grounding
and the answer shrinks with no explanation. `_evictEvidenceVector` is **not** called on drop, so
the vector index keeps pointing at deleted evidence.

This contradicts LAW E4 (provenance), LAW E6 (corrections preserve history) and the product
thesis itself. It is also the worst kind of bug: invisible, gradual, and it corrupts the record
rather than crashing.

**Invariant.** Evidence is never destroyed as a side effect of volume. If a working-set bound is
needed, evidence moves to cold storage and remains resolvable by reference; anything citing it
either still resolves or is explicitly marked unresolvable.

**Test.** Push past the cap; assert that an evidence id cited by an existing signal still
resolves, that no evidence disappears without an audit entry, and that the vector index holds no
entry for absent evidence.

**Boundary.** `server.js` around `:6034`, and whatever cold path is chosen. Prefer the smallest
thing that stops the loss — raising a number is not a fix.

## P0-2 — Every deploy silently loses unsaved writes

**Claim.** Saves are debounced 1.5s and there is no shutdown handler, so SIGTERM discards
whatever is in the window plus any failed-save retry backlog.

**Code.** `server.js:273` `SAVE_DEBOUNCE_MS` default 1500; `:386` the debounce timer;
`:283` retry backoff. `grep "process.on(" server.js db.js` returns only `unhandledRejection` and
`uncaughtException` — **no `SIGTERM`, `SIGINT` or `beforeExit`**.

**Failure scenario.** Render sends SIGTERM on every deploy. A person submits a check-in, contests
a belief, or posts a contribution; 1.4s later the process exits. The write is gone, the user saw
a success response, and nothing records that it happened. If a save had already failed and was
waiting on the retry backoff, that whole batch is lost too.

**Invariant.** No acknowledged write is lost on graceful shutdown. On SIGTERM the process flushes
pending saves, including the retry backlog, before exiting.

**Test.** `scripts/persistence-smoke.js` already fakes the store and controls timers — extend it:
mutate, trigger the shutdown path before the debounce fires, assert the unit was written.

**Boundary.** `server.js` save scheduler. Roughly ten lines.

## P0-3 — Concurrent writers silently overwrite each other

**Claim.** Stores are mutated in place with no version, no compare-and-set and no conflict
detection. Last write wins and the loser is never told.

**Code.** The pattern throughout is `store[code][id].field = value; scheduleSave();`. The only
lock anywhere is `_syncLocks` (`server.js:1007`), scoped to connector runs. I searched for
optimistic-concurrency machinery and found none.

**Failure scenario.** Two leaders open the same node, both edit membership, both save. The second
write erases the first with no error and no trace. At 100 people this happens weekly, and because
the loser sees success, nobody reports it — it presents as "IntelliQ forgot".

**Invariant.** A write against stale state is refused or merged, never silently applied. At
minimum: detect and surface the conflict.

**Test.** Simulate two readers of one object, both mutating, assert the second is refused or
merged and never silently discards the first.

**Boundary.** The write path for the few genuinely shared objects — org nodes, inquiries, group
subjects. **Not** a general framework; per-object versions on the contended stores only.

## P0-4 — The value loop is not proven end to end

**Claim.** No test walks activity → inquiry → evidence → deliberation → understanding → action →
measured outcome → updated knowledge. Every stage is individually tested; the whole is not.

**Code.** `scripts/resolve-loop-smoke.js` covers uncertainty → answer → adjudicate → confirm →
readiness, which is one segment. Nothing joins forum deliberation to contribution to belief to
intervention to outcome.

**Failure scenario.** Not a runtime failure — a *pilot* failure. Every part works and the product
still cannot demonstrate the thing it exists to do, and nobody discovers this until it is in
front of a customer.

**Invariant.** The closed loop is executable and green.

**Test.** See §G.

**Boundary.** A new HTTP smoke. No production change expected — and if one *is* required, that is
the most valuable finding this review could produce.

## Not blockers, and I want to be explicit

- **Cross-tenant leakage** — searched, structurally partitioned, SQL-scoped, tested. Fine.
- **Prompt injection** — guarded and tested.
- **Single process / no horizontal scale** — correct for a pilot. See §E.
- **17k-line `server.js`** — a velocity problem, not a safety one. DEFER UNTIL SCALE.

---

# D. Forum architecture decision

**The hard part is already right, and it is right structurally rather than by rule.**
`ai/forum.js` cannot create evidence because it contains no reference to evidence, confidence,
origins or hypotheses (`:5-11`). Ten people agreeing in a thread changes nothing. `THREAD_CAP`
is 500 — "a deliberation, not an archive" (`:33`).

Answering the questions that matter, against what exists:

| Question | Answer |
|---|---|
| What is a thread epistemically? | **Speech.** Not evidence, not corroboration, not an origin. |
| Why attached to an inquiry? | It gives deliberation a subject and a scope. Access derives from the node (`mayRead:104`). |
| What can leave and become evidence? | Only a **deliberate contribution** by the author, through `ai/contribution.js`. |
| Does discussion become organisational truth? | **No.** By construction. |
| Repetition? | `originForMessage(message, { echoesMessage })` (`:146`) — a message that echoes another is not an independent origin. |

## What is missing, and my recommendation

The forum has an **inbound** door and no **outbound** one. It can turn speech into evidence; it
has no representation of what a deliberation *concluded*. Today a thread that resolves something
leaves nothing behind but 500 messages.

Recommended model — three objects, not one:

```
THREAD      speech           already exists, ai/forum.js
DECISION    what was settled MISSING — a typed record: question, options considered,
                             outcome, who authorised it, which messages informed it
SUMMARY     what was said    LLM-drafted, human-confirmed, NEVER evidence
```

**The transitions, and who authorises each:**

| Transition | Mode |
|---|---|
| conversation → claim | **assisted** — the model may propose "this looks like a claim"; the author decides |
| claim → evidence | **explicitly human-authorised** — already true, `ai/contribution.js` |
| evidence → contest | **automatic** — the kernel already does this |
| deliberation → decision | **explicitly human-authorised** — a decision is an act, not a summary |
| decision → organisational knowledge | **assisted then authorised** — via the playbook path that already exists |
| anything → summary | **automatic to draft, never to trust** — a summary is a rendering, never a citation |

**The one rule that matters most:** a generated summary may never be cited as evidence. That is
how circular provenance starts — a model summarises a thread, the summary is stored, a later
model cites the summary as a source, and the organisation now believes something no human ever
said. `ai/audit.js` has no `summary_promoted` action; nothing currently prevents this because
nothing currently does it. Add the prohibition **before** adding summaries.

**Context-window volume:** never send a thread to a model. Send the decision record and the
contributed evidence. `THREAD_CAP` bounds the store; it should not bound the context — the
context should not contain threads at all.

**DEFER UNTIL SCALE:** moderation workflows, thread search, cross-thread synthesis, very large
forums. A pilot forum is ten people and a handful of threads.

---

# E. Scale map

**Now (1 org, 50–500 people).** The architecture is adequate. One process, all state in heap,
per-unit persistence. Fix the four blockers and it holds.

**Before 10 customers.**
- *Sessions in memory* (`server.js:489`) prevent running two instances. Any redundancy or
  zero-downtime deploy needs sessions out of process first. This is also the real fix for P0-2.
- *Evidence working set*: whatever replaces the FIFO cap must not require the full history in
  heap.

**Before 100 customers.**
- **All orgs in one heap is the wall.** `db.loadStores()` loads every tenant at boot
  (`server.js:405`). Boot time and memory both grow linearly with customers, and one noisy
  tenant degrades all of them. The fix is lazy per-org load with eviction — the durable-unit
  keying (`store:<name>:<orgCode>`) already makes this possible without a data migration, which
  is a genuinely good decision already banked.
- JSONB blobs per unit stop being queryable; the stores that need querying (evidence, forum)
  want real columns and indexes.

**Later — do not spend time now.**
Sharding, read replicas, queues, a service split, GraphRAG, multi-region. None of these are
reachable from a pilot, and building them now would be the classic mistake.

---

# F. Governance map

The distinction the product needs and does not yet name:

```
READ → INFER → PROPOSE → WRITE → PROMOTE → EXECUTE
```

None of these implies the next. What exists today:

| Operation | Human | Machine | Enforced where |
|---|---|---|---|
| READ | purpose-scoped, org-scoped | same path | `_kernelEvidence:7349` |
| INFER | n/a | permitted on what it may read | `ai/gateway.js` |
| PROPOSE | n/a | always `requiresConfirmation` | `proactive`, `priority-office` |
| WRITE | permission-gated | **no machine write path** | `_userHasPerm` |
| PROMOTE | `confirmedBy`/`confirmedAt` | forbidden | `ai/org-playbook.js:128` |
| EXECUTE | human only | **does not exist** | — |

**The good news for pilot: machines cannot write, promote or execute. That boundary is real.**
The gap is that it is enforced by each path remembering, not by one named model — TTD LAW A1 is
PARTIAL for exactly this reason.

**Primitive needed today so nothing must be retrofitted:** every action record should carry
`actor` (human id or machine id), `operation` (one of the six), and `authorisedBy`. `ai/audit.js`
already has the chain and the allowlist — extend the allowlist, do not build a framework.

**DEFER UNTIL SCALE:** IntelliQ as a governance layer over an org's *other* AI systems. It is a
genuinely strong long-term position and it needs zero code now.

---

# G. Pilot closed-loop test

`scripts/pilot-loop-http-smoke.js` — the test that says the product works.

```
 1  org created, three people, one node
 2  evidence enters (check-in + a connector record)
 3  a group inquiry opens on the node
 4  a forum thread opens on the inquiry
 5  two members discuss                    → assert: no belief moved
 6  one member deliberately contributes    → assert: NOW a signal exists, with origin
 7  a second member contributes an echo    → assert: still ONE origin, not two
 8  the kernel forms a belief with confidence and a stated basis
 9  a leader sees it audience-safe         → assert: no private text, no score
10  an intervention is proposed            → assert: requiresConfirmation
11  a human confirms it
12  an outcome is recorded
13  outcome-intelligence reflects it       → assert: efficacy ranking, evidence separate
14  the subject contests the belief        → assert: contested, disclosed, not erased
15  resolving evidence arrives             → assert: resolved, history intact
16  the whole chain is reconstructible from the audit log
```

Steps 5–7 and 14–16 are the ones that make IntelliQ different from a dashboard. If any of them
cannot be walked end to end, that is the finding.

---

# H. Codex queue

**P0 — before any real organisational data.**

| # | Brief | Surface |
|---|---|---|
| P0-1 | Evidence must never be destroyed by volume | `server.js:6034`, cold path |
| P0-2 | Flush pending saves on SIGTERM | `server.js` save scheduler |
| P0-3 | Concurrent writes to shared objects detect conflict | node/inquiry write paths |

**P1 — before the pilot ends.**

| # | Brief | Surface |
|---|---|---|
| P1-1 | Forum decision record (the missing outbound door) | `ai/forum.js` + endpoint |
| P1-2 | A generated summary may never be cited as evidence | `ai/audit.js` allowlist + composer |
| P1-3 | Actor/operation/authorisedBy on every audited action | `ai/audit.js` |

**P2 — before 10 customers.** Sessions out of process; lazy per-org load with eviction.

**Mine, not Codex's:** every invariant above (P0-4 included), and arbitration of each result.

**DEFER UNTIL SCALE:** skills as a formal primitive (no `ai/skills.js` exists — and the playbook
already carries the "when X, Y works here" shape with `confidenceAtConfirmation`, so the
primitive may already be there under another name); GraphRAG; MCP; agent frameworks; model
routing; memory hierarchies beyond what exists.

**On retrieval technology, since it was asked:** IntelliQ needs **none** of RAG-the-fashion. It
has purpose-scoped structured retrieval over an evidence log with a lifecycle gate, plus pgvector
for member similarity. The retrieval problem here is *authorisation and epistemic state*, not
semantic recall, and that is already the harder half and already solved. Adding GraphRAG would
add a second retrieval path that does not understand `_kernelEvidence`'s gates — a new way to
surface something that matches textually but is inadmissible. That is a downgrade wearing a
fashionable name.
