# Brief: Principal Agent, slice 1 — roles and claim validation

**For:** Codex (implementer)
**From:** Claude (architecture)
**Branch:** `claude/platform-work-summary-nmb0cm`
**Arbiter:** `node scripts/test.js` must be green. Run it twice — one suite has been
timing-sensitive under load.

Read `AGENTS.md` and `.claude/agents/worker.md` first. The invariants in the latter are not
style preferences; they are enforced in code and covered by the truth layer.

---

## Why this exists

All 23 model call sites in IntelliQ live in `server.js` and go through `ai/gateway.js`. Two
findings from the audit shape this task:

1. **21 of 23 hardcode `tier: 'reason'`.** The cheap/expensive tier split already exists in the
   gateway and is economically inert — everything goes to the expensive model regardless of
   whether the task is hard.
2. **Verification exists and works, once.** `ai/composer.js` `verifyGrounding` is a real critic:
   the model writes the reply, deterministic code checks every organisational specific against
   retrieved material and refuses fabrications. It is inlined at one site. The other 22 model
   paths have no verification at all.

This slice turns the second finding into a reusable component and gives the first a decision
procedure. It does **not** build an agent framework.

---

## If you cannot see the branch

Codex's workspace is pinned to an older `main` and its proxy blocks GitHub, so it may be
working from a tree that lacks this session's commits. **That is fine for this slice**, because
the split below is deliberately conflict-free: sections 1, 2 and the test suite are all NEW
files that merge cleanly onto any base. Section 3 (wiring `_assistantAnswer`) is the only part
that touches existing code — **skip it if you cannot see this branch**, and say so in the PR.
Claude does the wiring on the current branch, where the surrounding state is known.

Do not register the suite in `scripts/test.js` if you are working from an older base — that file
has gained several suites and the edit will conflict. Say in the PR that registration is pending
and Claude will add the line.

## Scope

Two new pure modules, and **one** existing path routed through them. Nothing else.

### 1. `ai/roles.js`

Model **roles**, not model brands. Business logic must never name a vendor.

```
WORKER       — draft, extract, classify. Cheap tier.
CRITIC       — check a draft against evidence. Cheap tier.
JUDGE        — resolve material disagreement, or a high-risk claim. Expensive tier.
SYNTHESIZER  — compose across many inquiries. Expensive tier.
```

Export a pure `roleFor(task)` and a pure `escalate(state)` implementing:

- well-grounded and unambiguous → WORKER only
- CRITIC rejected a claim → one WORKER retry with the rejection as input
- second rejection, or contradictory active origins → JUDGE
- insufficient evidence → **stop and return `unknown`**, never escalate to invent an answer

Escalation must be **bounded**: a hard iteration ceiling (2 is enough), and every path must
terminate. No "keep thinking until good".

Roles map to existing `MODELS.micro` / `MODELS.reason` in `ai/gateway.js`. Do not add a provider,
do not change the gateway's fallback behaviour.

### 2. `ai/claims.js`

A typed claim, and validation of claims against retrieved evidence.

```
observation | inference | hypothesis | recommendation | unknown
```

Reuse the existing vocabulary where it matches — `ai/diagnose.js` already has
`LEVELS = ['observation','interpretation','hypothesis','conclusion']` and
`MODEL_MAY_PROPOSE`. **Do not create a second competing taxonomy.** If the existing levels fit,
use them and say so; if they do not, explain precisely why before adding to them.

`validateClaims(claims, { evidence })` must:

- require every `observation` to carry a ref present in the supplied evidence;
- **downgrade** rather than delete an unsupported claim — an unsupported observation becomes a
  hypothesis or an `unknown`, so the reader learns the system is unsure rather than seeing
  nothing;
- reject any claim whose ref points at **superseded** evidence (`diagnose.isActive` is false);
- never let a claim assert its own confidence — that is computed, not stated.

Generalise `composer.verifyGrounding`'s discipline. Do not delete `verifyGrounding`; the composer
keeps working until a later slice migrates it.

### 3. Route exactly one path

`_assistantAnswer` in `server.js` — chosen because it already calls `verifyGrounding`, so this
proves the generalisation without inventing new behaviour. Leave the other 22 call sites alone.

### 4. Trace

Return a structured trace with the result. **No chain-of-thought.** References and decisions only:

```json
{ "objective": "...", "role": "WORKER", "tier": "micro",
  "inquiriesConsulted": [], "evidenceConsulted": [],
  "claimsAccepted": [], "claimsDowngraded": [], "claimsRejected": [],
  "uncertainties": [], "escalations": 0, "iterations": 1, "ms": 0 }
```

Attach it to the existing `assistantTurns` record. **Do not create a new durable store** — see
`PERSISTENCE.md` for why monolithic agent memory is forbidden here.

---

## Tests — `scripts/principal-smoke.js`, registered in `scripts/test.js`

Adversarial, deterministic, model OFF where possible:

1. **Unsupported claim** — worker confidently invents a fact absent from evidence → downgraded or
   rejected, never asserted.
2. **Contradictory evidence** — two active origins disagree → the answer exposes uncertainty
   rather than picking whichever text reads more confidently.
3. **Superseded evidence** — a claim cites evidence that was corrected → does not support current
   factual output.
4. **Privacy** — a group task where relevant Self evidence exists but was never contributed →
   the agent cannot see or use it.
5. **Origin echo** — five contributors relaying one source → not treated as five independent
   origins.
6. **Weak worker** — deliberately poor worker output → verification prevents it becoming durable
   truth.
7. **Model swap** — two fake implementations satisfying the same role → the path produces the
   same governed outcome with no vendor-specific branch anywhere in business logic.

Also assert: **iteration ceiling is enforced**, and **insufficient evidence returns `unknown`
without escalating**.

---

## Out of scope — do not build

Sub-agents, tool registries, retrieval changes, connector work, Organisation, leader briefs,
notifications, a new durable store, a second confidence function, or any framework dependency.

Do not move permissions, identity, origin counting or confidence into a prompt. Those stay
deterministic. The LLM proposes; the kernel decides.

---

## Reporting

Open a PR against the branch above and report: files changed, whether the existing `diagnose`
levels were reused or extended and why, what the LLM controls versus what deterministic code
controls, test results, and anything in this brief the repository proved wrong. Repository truth
wins over this document.
