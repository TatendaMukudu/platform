# Brief: Evidence Admissibility — retrieval boundary hardening

**For:** Implementation (user)  
**From:** Architecture (Claude)  
**Branch:** `claude/platform-work-summary-nmb0cm`  
**Arbiter:** `node scripts/test.js` must be green.

Read `AGENTS.md`, `.claude/agents/worker.md`, and `PERSISTENCE.md` first.

---

## Why this exists

The retrieval boundary (`_retrieveGrounding` in server.js) today has **zero awareness** of evidence status or origin structure. Three consequences:

1. **Corrections become cosmetic.** A claim cites evidence that was later superseded → evidence is still returned, still grounds the answer, and the correction is invisible to the user.
2. **Contradictions disappear.** Two active origins disagree on the same fact → both are returned (both ground the answer), but the system presents only the more confident-sounding text.
3. **Privacy leaks silently.** A contributor provides sensitive Self evidence; later a Forum message attributes the same fact to "the group" → if the group query pulls Self evidence, the private origin becomes public.

All three happen at retrieval time. This module is the gate that prevents them.

---

## Three points you must investigate first

Before writing code, read and understand the shape of:

1. **Retrieve paths** (`_retrieveGrounding` in server.js) — Where does retrieval happen? What does it return? What context does it have access to? (Read the full function, including all branches.)

2. **Diagnose kernel** (`ai/diagnose.js` header and the following functions: `isActive`, `originRef`, `originKind`, `deriveConfidence`) — How does the epistemic kernel track evidence status? What does "active" mean? What fields carry origin structure?

3. **Evidence-producing paths** — Search the codebase for functions that create evidence objects. How is `status` set? When? By whom? (Look for places that push to `signals` array or create inquiry results.)

---

## Scope

**One new pure module.** `ai/admissibility.js`. No other files, no wiring, no test registration (that comes next). Nothing else.

### Contract

```javascript
admissible(evidence, { activeInquiries, allOrigins }) → { status, reason }
```

**Inputs:**
- `evidence`: a single evidence object with fields `{ ref, status, originRef, originKind, ...}` (as defined in diagnose.js)
- `activeInquiries`: set of inquiry IDs currently being reasoned over (to prevent privacy leaks)
- `allOrigins`: map of `originRef → { originKind, ... }` (full origin metadata)

**Output:** `{ status: 'admissible' | 'superseded' | 'crossed_origin' | 'private' | 'unknown', reason: string }`

**Admissibility rules** (in precedence order):

1. **Superseded** — `evidence.status !== 'active'`. Corrected evidence never grounds an answer, ever. (Do not try to "upgrade" old evidence or merge it with new.)

2. **Crossed origin** — `evidence.originKind === 'Self'` AND NOT `evidence.originRef in activeInquiries`. A contributor's private evidence cannot ground an answer in a query they did not contribute to. (Note: multiple people *can* share a node/inquiry — the boundary is the originating contributor's inquiry, not the subject.)

3. **Private** — `evidence.originKind === 'Self'` AND the inquiry is in `activeInquiries` but the contributor is known not to have accessed that inquiry. (This requires checking against the inquiries index; see how other modules do it. If unsure, return `unknown`, not an assumption.)

4. **Unknown** — evidence is missing a `status` or `originRef` field. **Fail closed.** Never assume "probably active" or "probably public." Return unknown.

5. **Admissible** — passed all gates above.

### Forbidden

- Never compute confidence, ever. That's `ai/confidence.js`.
- Never check permissions, roles, or org scope. Those are wired elsewhere.
- Never call the LLM. This is deterministic.
- Never mutate the evidence object.
- Never assert its own confidence about the rules (only return what is *known* to be true).
- Pure function: no I/O, no process state, no side effects.

---

## Tests — `scripts/admissibility-smoke.js`, **not** registered in test.js yet

Deterministic, no LLM:

1. **Superseded evidence is rejected** — an evidence object with `status: 'withdrawn'` returns `{ status: 'superseded', reason: '...' }`. (Not downgraded, not silently ignored — rejected.)

2. **Active evidence is admissible** — an evidence object with `status: 'active'`, valid `originRef`, and `originKind` returns `{ status: 'admissible', reason: '' }`.

3. **Crossed origin is rejected** — a Self evidence from contributor A, for an inquiry that A did not contribute to, returns `{ status: 'crossed_origin', reason: '...' }`. (Even if A is reading that inquiry, A's own Self evidence stays private.)

4. **Missing status field** — an evidence object without a `status` field returns `{ status: 'unknown', reason: 'no status' }`.

5. **Missing originRef** — returns `{ status: 'unknown', reason: 'no originRef' }`.

6. **Future-proofing** — an evidence object with an unrecognized `status` (e.g., `'pending'`, a hypothetical future state) returns `{ status: 'unknown', reason: 'unrecognized status: pending' }`, never assumes it is active. This test guards against silent fail-open on new evidence states.

7. **Batch with mixed admissibility** — call admissible on a list of 5 evidence objects (1 active, 1 superseded, 1 crossed origin, 1 unknown, 1 missing field). Assert that each is correctly classified, independent of the others.

---

## Out of scope

- Do not wire this into `_retrieveGrounding` yet (that's next).
- Do not register the smoke suite in `scripts/test.js` yet (I will do that when I review).
- Do not build "admissibility for groups" or "admissibility for external sources." This module handles the lifecycle gates only.
- Do not create a new durable store or cache.
- Do not move any logic from `ai/diagnose.js`.

---

## Reporting

Push the branch when complete. In the PR:

- Files changed (should be two: `ai/admissibility.js` and `scripts/admissibility-smoke.js`).
- Summary of the three investigation points (what you found about retrieval, diagnose kernel, evidence production).
- Test results: run `node scripts/admissibility-smoke.js` and paste output.
- Anything in this brief the repository proved wrong. Repository truth wins.
