# Codex — review round 1

You are reviewing **IntelliQ** (`TatendaMukudu/platform`), a system that forms and governs
beliefs about people in an organisation. It goes live with Alma College Men's Soccer on
**26 September 2026**. Nothing here is a toy: the laws about who may see what are the product.

**Read `docs/reviews/PROTOCOL.md` first and follow it exactly.** It carries the non-negotiables,
the mutation standard of proof, the nine ways an assertion lies in this repo, the report format,
and a list of things already known that you should not re-report.

Work on branch `codex/review-r1` off current `main`. Do not merge.

---

## Why you

You found the CI failure the rest of us missed. `main` had been red since `103e37d` because
`actions/checkout` fetches one commit and `docs-status-smoke` needs real history to check the
documentation index's ancestry — and the guard reported "not an ancestor", which was true of the
checkout and false of the repository. You diagnosed it, proved the fix green in #81, and it is
now on `main`. That is exactly the class of thing this lane is for: the machinery underneath,
where a wrong answer looks like a right one.

---

## Your lane: the boundary and the substrate

Everything between the network and the kernel. Concretely:

**Authority and tenancy**
- `server.js` — every `app.get/post/patch/delete`. For each route ask **both** questions:
  *whose organisation is this acting on* (session, never the body) and *does this caller have
  the authority for this act* (`requirePermission`, role ceilings, node leadership).
  A route that answers only the first looks fixed from outside and is not.
- `scripts/auth-boundary-smoke.js`, `scripts/tenant-authority-smoke.js`,
  `scripts/cross-org-isolation-http-smoke.js`, `scripts/authority-truth-smoke.js`.
- Recently changed and worth hard attention: `/api/auth/bulk-import`,
  `/api/platform/update-org-mode`, `/api/platform/register-org`.

**The model boundary**
- `ai/gateway.js` — attribution is required, not defaulted. `_requireOrg` must throw
  `LLM_UNATTRIBUTED` **before** any provider or budget is touched. Check every exit: `complete`,
  `completeJSON`, `understand`, `transcribe`, `searchWeb`. Two of those had no budget check at
  all until recently, and had no caller, which is why nobody noticed.
- `scripts/provider-boundary-smoke.js`. Does it count all thirty-five exits, or only the ones
  its regex happens to match? A guard that sees sixteen of thirty-five will never see the next
  one.

**Persistence, erasure and durability**
- `_loadAllStores`, `_durableUnits`, the split-persistence path, `scheduleSave`.
- The new `shelfFilings` store (from PR #80): it is in the persisted set, the load path and the
  erasure path. Verify all three, and verify it survives a restart.
- **Erasure must mean it.** When a person is erased, walk every store that could hold something
  about them and confirm it is gone — and confirm the things that must survive (the audit chain,
  org-level beliefs that are not personal data) do.
- `scripts/persistence-durability-smoke.js`, `scripts/org-purge-smoke.js`,
  `scripts/delete-cas-boundary-smoke.js`.

**Rate limits, abuse, and the proxy**
- `ai/rate-limit.js`, `scripts/abuse-controls-http-smoke.js`.
- The SSRF guard on outbound connections.

**CI and build integrity**
- `.github/workflows/ci.yml`, `scripts/test.js`, `scripts/deadcode-scan.js`,
  `scripts/asset-version-smoke.js`, `scripts/reachability-smoke.js`,
  `scripts/scope-parity-smoke.js`, `scripts/harness-integrity-smoke.js`.
- Is every suite in `scripts/` actually registered in `scripts/test.js`? An unregistered suite
  is a suite that does not run.
- Does `npm test` fail for every way a suite can fail — assertion, throw, timeout, non-zero exit
  with no output?

---

## Specific things to go at

1. **The `dedupeOn` change I landed today** (`ai/proactive.js`, `server.js`
   `_beliefStateFindings`). Insights were deduplicated on `subjectId:patternType:audience`, so a
   person with two Highs saw one. I added an optional discriminator. **Check it did not widen
   anything**: more findings now reach `behaviour.plan`, which means more reach the surface.
   Is the per-bucket limit still doing its job? Can a leader-audience insight now appear twice
   where it should appear once? Is `audienceSafe` still applied to every one of them?

2. **`GET /api/library/shelf` and its two siblings** (new in PR #80). The read resolves each
   filed reference through the reader's own gate. I believe filing confers no access. Try to
   prove me wrong: a stale filing after a role change, a node deletion, an org move, a
   concurrent write. Also: `POST /api/library/shelf` checks readability on the way in — is the
   404 for "not yours" byte-identical to the 404 for "does not exist"?

3. **`_materialContext`'s new declared filter** (`server.js`). It narrows the document handed to
   a turn to the sections the reader marked `not_yet`. Check the scoping: a person in two
   squads, a material referenced from two objects, a legacy engagement record with no `on`
   field. Does anything let one squad's declarations narrow another squad's turn?

4. **The seed installs into a live store.** `POST /api/admin/seed-alma` calls `_loadAllStores`
   with a whole store. What happens to an existing organisation when it runs? Is it gated
   correctly? Can it be run twice? Should it be runnable in production at all?

---

## What I would most like you to disbelieve

I wrote every assertion in `tenant-authority-smoke`, `shelf-http-smoke`, `shelf-smoke`,
`material-reach-http-smoke` and `seed-alma-smoke`, and I wrote the mutations that prove them.
An agent that writes both is blind in the same place twice.

**Pick the assertions that matter most and try to make them lie.** Specifically hunt for
patterns 1, 2 and 3 from the protocol — definition-not-call, second-call-site, and masked-by-an-
outer-gate. I have already shipped five of pattern 1 and caught them only by mutation.

If you find one of my assertions is worthless, that is the single most valuable thing you can
return. Say so plainly and rewrite it.

---

## Deliverable

- Fixes on `codex/review-r1`, each with an assertion and a mutation that proves the assertion.
- `docs/reviews/codex-r1.md` in the exact format the protocol specifies.
- `npm test` green on your branch.
- Do not merge. Do not open a PR unless asked.

Label every finding **reproduced** or **read**. If something touches a law, do not fix it —
escalate it with the decision the founder has to make.
