# Codex methodical-assistant closure — running handoff

**Branch:** `codex/pilot-recovery-gate-r7` / draft PR #90  
**Started from:** `c63215f4862055de9f12d3e277aea873a9b15c7a`  
**Current recorded remote head:** `130863e3838d0eedf90272820d02fe8353acf884`
**Verdict:** **SAFE TO MERGE: NO.** Nothing was merged or deployed.

This is the evidence ledger for the closure pass governed by
`docs/briefs/MONDAY_METHODICAL_ASSISTANT_CLOSURE.md`,
`docs/rnd/CONVERSATIONAL_PRODUCT_LAW.md`, and
`docs/rnd/INTELLIGENCE_EXPERIENCE_LAW.md`.

## 1. Remote persistence path

The shell checkout has no `gh` binary and no HTTPS credentials. Work did not proceed on the
assumption that this was the only persistence path.

The connected GitHub integration exposes authenticated Git-data writes: blob, tree, commit and
non-force ref update. The target branch was read at `c63215f`, then a no-op non-force ref update to
that same SHA succeeded and the branch was read back unchanged. Every later checkpoint used this
sequence:

1. read the target ref and require the expected parent SHA;
2. create blobs and a tree over that parent's tree;
3. create one commit with that exact parent;
4. read the ref again and fail closed on divergence;
5. update the existing ref with `force: false`;
6. read the ref back and fetch it locally;
7. require the local and remote tree SHAs to be identical before realigning the local branch.

No write targeted `main`, PR #89, or any branch except `codex/pilot-recovery-gate-r7`.

## 2. PR #89 reconciliation

Pinned state at the start of the pass:

- current `main`: `84d2c6afe073d99c65317aa0fc62b3e47c4c7448`;
- PR #89 handoff: `27b66644ab797e3f00e0cba266f3e1e1a39aab7e`;
- PR #90: `c63215f4862055de9f12d3e277aea873a9b15c7a`.

`27b6664` is an ancestor of PR #90. PR #90 contained 170 later commits; PR #89 contained zero
commits absent from PR #90. Therefore no merge or cherry-pick was needed, and none was performed.

## 3. Remote checkpoints

### `a726384cfe68ba28e323382597dc2b75410335f2` — restore closure baseline gates

The first full `npm test` was red for two pre-existing maintenance failures:

- the browser assets had changed at `89426b4`, but `index.html` and the asset fingerprint still
  carried the prior cache stamp;
- `docs/INDEX.md` was 32 commits stale and still routed current work to the older pilot programme.

The checkpoint bumped the shared asset stamp to `20260919a`, recorded the exact asset fingerprint,
and routed the index to the ratified Monday closure brief.

Proof:

- `node scripts/asset-version-smoke.js` — 7 passed, 0 failed;
- `node scripts/docs-status-smoke.js` — 17 passed, 0 failed;
- `npm test` — green, all registered suites.

### `35e6754fe22617017273e3ddf77432c0950f12f4` — separate evidence standing from delivery reliability

Canonical owners traced: `ai/proactive.js` produces `kernelConfidence` and `reliabilityLabel`;
`ai/intelligence-feed.js` normalizes feed artifacts; `ai/priority-office.js` ranks delivery.

Positive law: evidence standing records support for a claim. Delivery reliability records whether
people found this kind of noticing useful to surface. Negative law: delivery feedback can never
increase or decrease epistemic support.

The feed and Priority Office now carry explicit `evidenceStanding` and `deliveryReliability`.
The legacy `confidence` adapter is evidence-only. No schema migration or second store was added.

Proof:

- `intelligence-feed-smoke` — 20 passed;
- `priority-office-smoke` — 12 passed;
- `scoped-intelligence-packet-smoke` — 23 passed;
- `intelligence-packet-http-smoke` — 8 passed;
- `npm test` — green, all registered suites.

Mutation: wiring `deliveryReliability` into the compatibility `confidence` field made both focused
suites red with two failures each. Restoring evidence standing returned them to green.

### `98d4d2a2683b63968dc5913dad4aedcb84cdef1f` — make attention reflect meaningful change

Canonical owners traced: `ai/intelligence-feed.js` owns polarity-to-bucket mapping;
`ai/proactive.js` projects findings; `ai/behaviour.js` owns delivery ordering.

Positive law: a High represents evidence that something meaningful is going well; Home spends
attention according to declared human consequence/priority. Negative law: a candidate opportunity
or app check-in frequency cannot manufacture a High or notification, and Home cannot force a
positive ahead of a higher-priority Low merely for engagement.

Changes:

- generic `opportunity` remains in the feed/option layer and maps to neither High nor Low;
- `checkin_streak` remains neutral recorded context rather than a milestone High;
- genuine non-usage milestones still map to High;
- Home compares the strongest High and Low and leads with the higher-priority record.

Proof:

- `intelligence-feed-smoke` — 20 passed;
- `proactive-smoke` — 80 passed;
- `priority-office-smoke` — 12 passed;
- `governance-smoke` — 9 passed;
- `npm test` — green, all registered suites.

Mutations, all red as required:

- restore `opportunity -> high`: feed and proactive suites fail;
- force check-in streaks back to non-neutral milestones: proactive suite fails;
- restore forced High-first opening: proactive suite fails.

### `130863e3838d0eedf90272820d02fe8353acf884` — characterize temporal audience boundaries

Canonical owners traced: `ai/audience.js::resolve` owns stored node-audience references;
`server.js::_forumAccess` owns group Forum admission; the Focus source route remains keyed to the
source owner's own workspace.

Positive current behavior, pending founder policy: node-members and Forum rooms resolve against
the current roster, so a later join currently gains an existing node-members audience and
historical Forum speech; leaving revokes both on the next read. Negative law: current membership,
a shared Focus and its relationship to a source conversation must never combine to grant a new
participant access to that private predecessor chat.

No production behavior or temporal policy changed. The tests explicitly label join-after-share
as characterization so the current expansion cannot change silently before the founder decides
whether historical Forum/shared material should snapshot its original audience.

Proof:

- `audience-disclosure-smoke` — 48 passed;
- `forum-audience-smoke` — 89 passed;
- `focus-continuity-smoke` — 45 passed;
- `npm test` — green, all registered suites.

Mutations, both red as required:

- removing current node members from `ai/audience.js::resolve` failed the join-after-share
  assertion (47 passed, 1 failed);
- disabling member admission at `server.js::_forumAccess` failed the historical Forum join case
  (80 passed, 9 failed). The mutation was restored before the full run.

## 4. Environment and remaining external proof

This pass used in-process memory and deterministic/provider-failure paths. The full suite reported
green, but local Chromium remains unavailable under `/opt/pw-browsers`; the registered frontend
smoke therefore skips its rendered-browser work in this container.

Still not performed or claimed:

- Render deployment/restart;
- Neon durability/restart;
- live provider behavior;
- actual iPhone input/output, picker, layout and spoken-caveat proof;
- founder/coach human acceptance on the deployed build.

These are external proof gaps, not permission to weaken the code gates. The branch remains unsafe
to merge independently because PR #90 contains PR #89's wider delta and the live/device gates are
still outstanding.

## 5. Next closure seam

The latest `INTELLIGENCE_EXPERIENCE_LAW.md` at `7a1900a` materially expands methodical
conversation, response-quality, evidence-direction, experimentation and help-seeking acceptance.
The next implementation seam should be selected from that matrix by tracing the real Home/object
Composer path and finding the first behavioral failure, with priority on response/action quality
through A -> B -> experiment -> outcome -> learning rather than adding another pure helper.

One founder decision remains narrow and external: whether a new node member should read historical
Forum speech and other previously shared node material. Current behavior is now pinned rather than
silently treated as ratified. Regardless of that choice, private predecessor conversation remains
inaccessible.
