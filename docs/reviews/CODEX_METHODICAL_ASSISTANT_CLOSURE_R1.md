# Codex methodical-assistant closure — running handoff

**Branch:** `codex/pilot-recovery-gate-r7` / draft PR #90  
**Started from:** `c63215f4862055de9f12d3e277aea873a9b15c7a`  
**Current recorded remote head:** `f6ca7657bf11ba9e85d73cc386c1f9a4285fec79`
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

### `f6ca7657bf11ba9e85d73cc386c1f9a4285fec79` — make Composer questions earn their turn

Canonical owner traced: `ai/composer.js` owns the one production voice and its grounded context;
the kernel-owned information need already enters that context separately. The live system prompt
nevertheless required every useful answer to end with a question, even when the governed context
already answered it or the person was brainstorming, choosing, reporting an outcome or simply
asking for an answer.

Positive law: ask the one kernel-supplied, high-information question when its answer would
materially change understanding; otherwise answer, offer a small option set, reflect an outcome,
help carry out the chosen action, brainstorm, or stop. Negative law: never ask merely to keep a
conversation moving, keep interrogating after a choice, or manufacture an Inquiry/Focus because a
person explored an idea.

The prompt now makes the useful next move conditional on actual uncertainty, treats available
actions as possibilities rather than instructions, and explicitly permits a useful turn with no
question and no action. Card-open conversations use the same rule rather than forcing a question.
No new classifier, assistant brain, object writer or store was introduced.

Proof:

- `composer-smoke` — 35 passed;
- `composer-degraded-http-smoke` — 13 passed plus 2 composer-off controls;
- `conversational-continuity-http-smoke` — 52 passed;
- `conversational-action-journeys-http-smoke` — 27 passed;
- `npm test` — green: 403 sources parsed and every registered suite passed.

Mutation: reversing the production rule so the Composer was again told to ask merely to keep the
conversation going made the focused suite red (34 passed, 1 failed). Restoring the conditional
rule returned it to 35 passed, 0 failed before the full run.

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

The next implementation seam is the expanded matrix's experiment/help-seeking boundary through
the real Focus Composer: trace how prior failed outcomes enter the authorised turn, prove that a
near-duplicate intervention is not proposed indefinitely, and either reuse the existing governed
professional/collaborator context for appropriate help-seeking or document the exact missing
canonical owner. The slice must preserve contextual precedent without converting a sequence into
causal certainty or adding a second Focus lifecycle.

One founder decision remains narrow and external: whether a new node member should read historical
Forum speech and other previously shared node material. Current behavior is now pinned rather than
silently treated as ratified. Regardless of that choice, private predecessor conversation remains
inaccessible.


## 6. Independent correction gate after \`e78a4ae059df3cdb2841006512d7a7e44e0a46f9\`

**Audit disposition:** **SAFE TO MERGE: NO.** The checkpoint at \`e78a4ae\` is substantive: governed outcomes from earlier Focus attempts on the same canonical A are carried into the next authorized conversation as contextual precedent, without treating sequence as causal proof or transporting another group's attempts. An independent gate nevertheless found four concrete HIGH blockers plus incomplete methodical A -> B acceptance coverage. These findings are the next correction queue; reproduce each against the real production path before changing behavior.

### HIGH 1 — authenticated routes bypass current-account status

Canonical owners to trace: \`server.js::_authoriseRequest\`, \`server.js::requireAuth\`, \`server.js::requirePermission\`.

Reproduced gap:
- \`GET /api/auth/me\` directly verifies the token and checks only that a user record exists.
- The bearer-token branch of \`POST /api/auth/set-password\` likewise directly verifies the token and checks user existence/\`passwordSet\`, then can mutate the password and issue a fresh token.
- Inactive, suspended and future/non-present accounts could receive 200 from \`/api/auth/me\`; an inactive first-login account could use an old bearer token to set a password and receive a fresh token.

Required correction:
- Route both paths through the canonical current-account authorization owner before mutation.
- Gone/deleted, inactive, suspended and not-yet-present accounts must be refused consistently.
- A refused set-password request must not alter password state, \`passwordSet\`, sessions, timestamps or other relevant store state and must not issue a token.
- Preserve legitimate first-login behavior for a currently present account.
- Do not add a parallel authentication/status helper.

Required registered runtime proof: active/current \`/api/auth/me\` succeeds; inactive, suspended, future/not-yet-present and deleted/missing accounts are refused; corresponding bearer set-password attempts are refused without relevant store mutation; a valid current first-login account still succeeds. Mutation weakening either route back to direct \`verifyToken\` must turn the suite red.

### HIGH 2 — group Forum authorization goes stale

Production paths: group Forum GET/POST/PATCH and canonical \`_forumAudience\` / \`_forumAccess\`.

Reproduced gap:
1. A two-person node creates Forum speech.
2. The node shrinks to one current readable person.
3. \`_forumAudience\` reports \`forumAvailable:false\`.
4. The remaining person can still GET the Forum and POST new speech.
5. A removed original author can PATCH their old message after losing room access.

Required correction:
- Resolve the live canonical Forum audience/access on every GET, POST and PATCH.
- Fewer than two current readable people means the room is unavailable.
- Anyone no longer a current reader is refused.
- Authorship never overrides current room access.
- Use the canonical owner rather than copying audience logic into handlers.
- Preserve private-to-Forum confirmation, Forum-to-private non-flow, tenant isolation and cross-object separation.

Required registered proof: normal two-person GET/POST works; shrink to singleton refuses GET/POST; removed former member is refused; removed original author cannot PATCH; unrelated tenant and sibling object remain refused; restoring a legitimate second current reader restores the room only according to existing temporal policy. Mutation removing the live gate from each handler must turn the suite red.

**Do not silently decide the temporal-history founder policy:** whether late joiners receive historical Forum/shared node material remains unresolved. Keep existing characterization tests. Private predecessor conversation remains inaccessible regardless.

### HIGH 3 — multiple Composers can run microphones simultaneously

Production paths: \`js/voice.js\`, \`MemberApp._micFor\`, shell/object/Forum composers.

Reproduced gap: voice sessions are tracked by target ID, so starting target A and then target B can leave both active with two recognizers. Existing tests only double-tap the same target and are false-green for cross-composer concurrency.

Required correction:
- Enforce exactly one module-global active microphone/recognizer.
- Starting B stops/aborts A before B becomes active and truthfully marks A interrupted/stopped.
- Late result/error/end callbacks from A cannot write into either A or B drafts.
- B can finish normally.
- Preserve same-target toggle, permission, transcription, retry and visible-state behavior.
- Do not conflate microphone input with server transcription or spoken output.

Required registered proof covers A -> B exclusivity, one recognizer, stale callback isolation, normal B completion and same-target behavior. Mutation removing global exclusivity must turn the suite red.

### HIGH 4 — Knowledge/Data Sources upload is false-green

Production paths: \`js/app.js::renderDataSources\`, \`js/app.js::uploadKnowledgeFile\`, \`AttachmentHandler.process\`, and canonical server-side attachment/material readers.

Reproduced gap: the legacy Knowledge/Data Sources picker advertises \`.txt,.md,.markdown,.csv,.json,.pdf,.doc,.docx\`, while \`uploadKnowledgeFile\` always sends \`parsed.content || parsed.summary\`. A PDF with no extracted content can therefore import a receipt such as “PDF document attached: x.pdf” as canonical evidence. DOC/DOCX are advertised even though \`AttachmentHandler\` deliberately refuses them and tells the user to attach them in conversation. Existing material-accept tests cover newer composer/material pickers rather than this legacy door.

Required correction: use one coherent existing owner. Prefer routing this door through the same canonical server-side upload/reader used by conversation attachments/materials; if the legacy door has no legitimate distinct purpose, remove/consolidate it. A parser receipt, filename, attachment acknowledgement or unsupported-document summary must never become canonical evidence.

Required registered proof: PDF genuinely imports extracted content through the canonical reader or is honestly refused; DOC/DOCX behavior matches visible support; unsupported types are not advertised; parser receipts cannot be stored as evidence; picker/server behavior remain consistent. Mutation restoring \`parsed.summary\` as evidence must turn the suite red.

### Methodical A -> B closure after the four HIGHs

Do not stop at prompt wording. Trace the real \`/api/assistant/turn -> proposal -> confirmation -> canonical owner -> persistence -> read/reload -> continued conversation\` path and continue the founder-ratified acceptance matrix in \`docs/rnd/INTELLIGENCE_EXPERIENCE_LAW.md\`.

Priority risk: Focus proliferation. Audit \`ai/composer-actions.js\` and canonical Focus owners. Required law:
- same B with refined A or changed tactic normally resumes/updates the existing Focus unless the person explicitly chooses otherwise;
- materially different B may be proposed as a new Focus but requires explicit human confirmation;
- brainstorming alone creates no Focus;
- model proposes; kernel/confirmed action owns mutation;
- do not add a second Focus store, intent engine or regex ontology.

Also prove conversational High/Low behavior: a person's stated observation remains attributed contribution/evidence; High/Low remain governed projections from evidence; do not add \`create_high\`/\`create_low\` truth stores merely because conversational commands mention those labels.

Remaining required scenarios include known A/unknown B; known B/unknown A; both known/path unknown; brainstorming with no object; brainstorming -> confirmed Focus; wrong/incomplete A; reconsidered B with human agency; outcome report/why it worked; abandon/change Focus; same journey after reload without duplication; rejected suggestion; repeated failed attempts changing strategy or routing to relevant human capability; named person/role group/ad-hoc audience ambiguity; no permanent org node for temporary collaboration; no predecessor private conversation disclosure; concise initial response with deeper reasoning on request; paraphrase and language/code-switching without changing kernel semantics.

For every new assertion: identify the production owner, prove the registered suite reaches it, and run at least one adversarial counterexample or mutation that turns it red. Source-text-only assertions are not runtime proof.

### Passing lanes to preserve and final proof

Do not regress manifest/citation/card/graph consistency; evidence standing vs delivery reliability; universal-domain behavior without sport-only kernel rules; tenant/cross-object privacy; Settings role separation and server authority; super-admin participation as administrator and ordinary participant; truthful capability reporting; demo-data truth; persistence/restart behavior; or asset-version guards.

Run focused suites after each small correction, then the complete registered suite. Run cloud CI on the exact final pushed head where available, including \`node scripts/test.js\`, PostgreSQL acknowledged-write restart, Chromium Settings roles and rendered Forum sharing. Do not claim Safari/iPhone, Render, Neon, live-provider, audible speech, picker or deployed restart verification unless actually performed.

Every durable handoff must record starting/ending SHA, root cause per blocker, files changed, tests, adversarial reproductions, mutations and red/green result, false-green tests corrected, full suite result, exact CI conclusions, unresolved founder-policy questions, external/live proof gaps and exact next weakest seam.


## 7. Direct GitHub bounded corrections after Work quota exhaustion — 2026-09-21

Remote branch work continued through bounded, canonical-owner changes that could be traced safely without a runnable repository environment. **These commits are NOT claimed runtime-green; the next coding agent must execute focused + registered suites and correct any failures before relying on them.**

Starting point for this direct pass: \`ac060b4d91b8d2894874f8df60eea3eef701aaa9\`.

### Legacy conversational Keep / Library boundary

Commits:
- \`783a62486da6ce0aa17e80869ddcf8357fdf07a4\`
- \`49e936d4fd04c5def4d0b25a5955a045dcff38a2\`

Production owner traced: \`ai/composer-actions.js::ACTIONS.keep_in_library\`.

Change:
- removed ordinary unbound \`conversation\` from the contexts in which \`keep_in_library\` is available;
- preserved intentional Library filing for governed intelligence objects/material;
- action description now states that Library filing is not conversational memory and must not be offered merely to remember/keep-private an ordinary conversation;
- added a regression assertion that \`Remember this privately.\` in ordinary conversation cannot manufacture a \`keep_in_library\` proposal.

Intent: enforce the ratified law that conversation persists by participant/audience semantics; Library is intentional reference material, not a memory gate. Do not remove legitimate Library filing flows.

Required next-agent proof: run \`scripts/composer-actions-smoke.js\`, relevant Composer HTTP journeys, full \`scripts/test.js\`, and a red mutation restoring \`conversation\` to the action context.

### Inquiry is governed standing, not a user-created object

Commits:
- \`8fc5dc91a0053091dd4d3e130a158e995567bcd9\`
- \`edcfad9b52bf10efbf7766377e1cd11279d15fa9\`

Production owner traced: \`ai/composer-actions.js\`.

Change:
- removed \`create_inquiry\` from the user-facing Composer action vocabulary;
- removed the \`inquiry\`/\`enquiry\` shortcut mapping to that action;
- removed its user-text grounding branch;
- changed the creation smoke invariant to require that High, Low **and Inquiry** have no user-create action.

Intent: Focus remains the only primary intelligence object a human deliberately creates. A human question/observation must travel through existing attributed contribution/evidence/curiosity machinery; the kernel decides whether an Inquiry earns canonical standing.

**Important next seam:** removing the action is only half of the vertical slice. The next coding agent must prove that a user's explicit "make this an Inquiry" / ordinary unresolved question is preserved as attributed input and can feed the existing governed Inquiry/curiosity owner rather than simply disappearing. Independent governed evidence/uncertainty must still be able to surface Inquiry standing. Do not reintroduce a user-commanded \`create_inquiry\` action to accomplish that.

Required next-agent proof: focused Composer creation/action suites, real \`/api/assistant/turn\` tests for commanded-Inquiry and ordinary-question paths, governed Inquiry surfacing test, mutation reintroducing \`create_inquiry\` turns the acceptance suite red, then full registered suite.

### Architectural inspection note

A direct source inspection at \`edcfad9b\` supports the broad intended layering:

\`source/material/contribution -> canonical evidence envelope -> admissibility/scope/audience -> observations/patterns -> belief/reasoning ledger -> governed High/Low/Inquiry projections -> Focus/human commitment -> action/outcome -> derived organizational learning -> authorized retrieval -> Composer -> proposal/confirmation -> canonical writer\`.

Strong boundaries already visible in code:
- \`lib/evidence.js\` owns a canonical evidence envelope and provenance/lifecycle shape;
- \`ai/audience.js\` explicitly treats audience as a narrowing reference resolved at read time, separate from admissibility/contribution;
- \`ai/reason.js\` is a pure belief ledger and does not persist itself;
- \`ai/inquiry.js\` is pure epistemic planning and says questions spend attention; it recommends rather than writes;
- \`ai/cross-evidence.js\` is explicitly read-only relationship reconstruction and cannot authorize;
- \`ai/composer.js\` is prose/reasoning inside already-scoped context, with proposal rather than direct mutation;
- \`ai/org-learning.js\` is observational/pure and deliberately redacts person/raw-evidence identifiers;
- \`db.js\` retains split per-store/per-org persistence with CAS/transactional multi-unit writes while keeping the in-memory shape stable.

Architectural risks the next implementation/review passes should treat as first-class rather than inventing new layers:
1. **Projection ownership is distributed.** Pattern/intelligence/reasoning/inquiry modules overlap conceptually. Preserve their distinct jobs: observations detect; reasoner maintains beliefs; High/Low/Inquiry are governed human-facing standings. Do not let each module become a competing truth owner.
2. **Conversation has two meanings in the repo.** \`ai/conversation.js\` is a pure structured intake/claim-planning engine, while product chat/session persistence lives elsewhere. Do not mistake that module for the participant-owned conversation store when implementing New Chat/continuity.
3. **Dynamic audience references have temporal consequences.** Current-membership resolution is structurally good for revocation but the late-join historical Forum/shared-material policy remains founder-unratified. Do not let object/chat continuity accidentally decide it.
4. **Persistence is still a transitional architecture.** Split durable units + CAS are directionally correct for the pilot, but the large in-memory aggregate remains a scalability/ownership risk. Do not attempt a relational rewrite during pilot closure.
5. **Domain-free primitives are mostly correct, but some fixed pattern actions in \`ai/primitives.js\` are prescriptive templates.** They must remain suggestions under evidence/Focus/human-choice law, never become automatic B/action truth.
6. **Org learning currently has multiple generations/concepts (\`org-learning\`, \`org-memory\`, \`org-playbook\`, outcome intelligence).** Consolidate readers/derivatives around one provenance-preserving organizational-learning contract over time; do not create another learning store for Focus-derived precedent.
7. **Scoped Intelligence Packet is a reader/presentation boundary, not a new truth store.** Keep it read-only and avoid reviving packet-centric UX/architecture.
8. **High/Low/Inquiry symmetry is not yet guaranteed by implementation.** The law now requires them to be sibling governed discovery standings. Audit their canonical projection/read paths for asymmetric lifecycle/creation semantics before building the common object page.
9. **Focus is correctly the deliberate commitment boundary only if every mutation converges on the canonical Focus owner.** Continue checking Composer confirmation, direct routes and group-Focus paths for duplicate lifecycle side effects.
10. **The LLM boundary is directionally correct only when every context item has already passed scope/admissibility/provenance gates.** Keep deterministic authorization/standing/mutation outside model output; model-generated text/action candidates are never authority.

Do not treat this architectural note as runtime proof. It is a map for the next agent to test against real call graphs and mutations.


## 8. Layer ownership trace — Evidence -> Understanding -> High/Low/Inquiry

This trace is intended to stop future agents from creating a second intelligence stack. It is based on source inspection at \`18026685082bbe37b2f2a0d011609a33e285a846\`; runtime call-graph proof remains required.

### Canonical responsibilities to preserve

| Layer | Current owner(s) | What it is allowed to own | What it must not own |
| --- | --- | --- | --- |
| Evidence contract | \`lib/evidence.js\` | canonical envelope, provenance, lifecycle, subject/source/time/value shape | belief, polarity, recommendation |
| Evidence lifecycle | \`ai/lifecycle.js\` + server admission gate | freshness/retire/review recommendations; active/held/superseded/deleted admission | human-facing High/Low or B |
| Text -> bounded observation | \`ai/understanding.js\`, \`ai/diagnose.js\` | grounded/sanitized observations and interpretations tied to evidence refs | independent truth, direct action |
| Pattern detection | \`ai/primitives.js\`, legacy/specialized detectors feeding reasoner | domain-free structures over admitted observations | automatic intervention/Focus |
| Belief ledger | \`ai/reason.js\` | support/counter-evidence, confidence standing, contest/dormancy, agenda candidates | persistence authority, user commitment |
| Inquiry epistemic planning | \`ai/inquiry.js\` | decide what is worth learning/asking, information value/routing | user-commanded creation, evidence writes |
| Inquiry state/projection | \`ai/diagnose.js\` | evidence-ref-backed unresolved understanding, hypotheses, confidence/timeline | copied evidence text, independent authorization |
| High/Low polarity owner | \`ai/intelligence-feed.js::normalizePolarity/bucketOf\` | the ONE High/Low mapping from governed finding polarity | detection, evidence standing, authorization |
| Presentation | \`ai/present.js\`, \`ai/stance.js\` | human wording/cards consistent with standing | changing standing or manufacturing truth |
| Attention | \`ai/priority-office.js\` | rank already-authorized canonical objects/read artifacts | truth, authorization, prediction/person scoring |
| LLM response | \`ai/composer.js\` | useful prose/reasoning inside scoped envelope; candidate actions | evidence/standing/auth/write authority |
| Commitment | canonical Focus owner(s) reached by confirmed Composer/direct routes | human-chosen B, Focus lifecycle/outcome | silently converting discovery into commitment |

### Architectural conclusion

The target architecture should converge on this single flow:

\`canonical evidence -> admitted observations -> reasoned belief/uncertainty -> governed standing -> High/Low/Inquiry projection -> authorized conversation -> human-chosen Focus -> action/outcome -> new evidence -> learning\`.

There must NOT be independent High/Low/Inquiry creation stores or separate model-authored truth. High/Low are already centralized at \`ai/intelligence-feed.js::bucketOf\`; Inquiry should converge on the same conceptual standing boundary even though its richer epistemic state lives in \`ai/diagnose.js\`.

### Concrete seam found: High/Low symmetry is centralized; Inquiry symmetry is conceptual, not yet structural

\`ai/intelligence-feed.js\` explicitly calls itself the **ONE polarity vocabulary and High/Low decision** and maps governed polarities to \`high\`/\`low\`. This is good and should remain the sole bucket owner.

Inquiry differs because \`ai/diagnose.js\` owns a richer evidence-ref-backed Inquiry projection with hypotheses, missing signals, confidence and timeline. That richer state is legitimate; forcing it into the simple polarity map would lose epistemic structure. The convergence point should therefore be a common **governed-standing/read contract**, not one identical storage shape.

Required post/pilot-safe consolidation:
- define/read one small standing contract consumed by object lists/pages: \`{ kind: high|low|inquiry, canonicalRef, subject/scope, title, standing, evidenceRefs/counts, changedAt, uncertainty/status }\`;
- adapt existing High/Low feed artifacts and Inquiry projections into it at READ time;
- do not migrate truth stores merely to make UI symmetric;
- common H/L/I object-page skeleton should consume this contract;
- Focus remains a different commitment contract.

### Concrete seam found: pattern modules contain action language

\`ai/primitives.js::STRUCTURE_ACTION\` couples detection of structures such as overload/plateau/withdrawal with fixed action advice. This does not currently prove an unauthorized write, but it crosses the desired layer boundary: a detector knows A; it should not own B/path.

Pilot-safe rule:
- do not delete these templates blindly if existing UX/tests depend on them;
- treat them only as candidate option text downstream of governed standing;
- they must never auto-create Focus or be represented as learned/local truth;
- after pilot, move intervention generation/selection behind the option/Focus boundary and preserve provenance (generic heuristic vs org precedent vs external evidence).

### Concrete seam found: two epistemic engines need an explicit relationship, not merger

\`ai/reason.js\` is a general belief ledger over observations. \`ai/diagnose.js\` also maintains Inquiry signals/hypotheses/confidence. They overlap in evidence weighing but serve different jobs: belief maintenance versus investigation state. Do not merge them during pilot.

Required architectural invariant:
- Reasoner may establish/challenge a belief/uncertainty.
- Inquiry state may investigate that unresolved understanding and track hypotheses/missing evidence.
- Inquiry evidence must reference canonical evidence/origins and must not become a second source.
- Settling/changing an Inquiry must feed the shared governed understanding/read layer rather than create a competing final truth.

### Concrete seam found: Priority Office correctly ranks records, but old feed ranking remains

\`ai/priority-office.js\` contains both older heterogeneous queue ranking and newer canonical-object attention logic. This is acceptable transitionally, but future work should avoid adding a third attention system. During pilot, preserve behavior and route new H/L/I/Focus attention through canonical-object attention where possible; after pilot, retire compatibility ranking once all producers have migrated.

### Tests the next runnable agent should add/strengthen

1. One admitted evidence origin repeated many times cannot create multiple independent standing votes.
2. A correction/supersession changes standing without erasing history.
3. A neutral/data-gap observation creates neither High nor Low.
4. A user saying "make this a High/Low/Inquiry" cannot directly create standing.
5. The same governed evidence can move a standing High -> uncertain/neither -> Low (or inverse) as counter-evidence arrives, without creating duplicate canonical truths.
6. Inquiry can be surfaced by unresolved/high-information uncertainty even though no user-create action exists.
7. High/Low/Inquiry read adapters expose the common minimal standing contract without widening authorization.
8. A pattern action template cannot create a Focus or masquerade as organization-learned precedent.
9. Priority ranking changes attention only; mutating priority/preferences cannot change evidence standing.
10. LLM output cannot alter kind/polarity/standing unless a deterministic confirmed canonical action owns that transition.

### Staging across pilot

**Pre/player-pilot correctness:** direct-create prohibitions; canonical High/Low bucket owner; governed Inquiry surfacing; evidence lifecycle/provenance; scope/audience; Focus-only deliberate commitment; no detector/template auto-commit.

**During pilot consolidation:** common H/L/I read contract; common object-page skeleton; canonical-object attention migration; explicit Reasoner -> Inquiry -> standing call graph; remove dead compatibility readers only after runtime proof.

**Post-pilot evolution:** move fixed intervention templates out of detection; consolidate old heterogeneous feed/packet compatibility; rationalize org-learning/memory/playbook readers; persistence/schema evolution when scale requires it.

