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



## 9. Layer ownership trace — Focus -> Action -> Outcome -> Learning -> future A -> B

Source-inspected at \`83739ff127bcc5438b5e27e46f9f447e808879cf\`. This is an ownership map, not runtime certification.

### What already works architecturally

The repo has a real A -> B spine rather than only conversational rhetoric:

1. **Focus is the deliberate commitment projection.** Personal Focus creation converges through the canonical personal-Focus owner; \`scripts/focus-ownership-parity-smoke.js\` explicitly compares direct and Composer transports and checks lifecycle/audit/feedback parity.
2. **Focus starts an Action-loop record.** \`scripts/focus-action-owner-smoke.js\` asserts that approving a Focus creates one canonical Action record in \`actionsLog\`, and recording a Focus outcome advances that same Action through evaluate -> learn rather than storing a duplicate action identity inside Focus.
3. **Cross-evidence is a read, not a truth store.** \`ai/cross-evidence.js\` reconstructs addresses/projected-from/shared-evidence/outcome/prior-attempt relationships from already-scoped canonical records.
4. **Group A -> B has a real production-path acceptance suite.** \`scripts/group-focus-loop-http-smoke.js\` creates a group Focus from a real group Inquiry, records the outcome through the real route, adds later evidence, and asks Composer about the result.
5. **Outcome Intelligence is deliberately retrospective.** \`ai/outcome-intelligence.js\` summarizes recorded intervention/outcome history and exposes sample size/uncertainty; it does not predict a future outcome.
6. **Organizational Memory and Learning are derived/redacted.** \`ai/org-memory.js\` stores compact derived organizational moments; \`ai/org-learning.js\` derives observations over compatible history without raw evidence/person identifiers.
7. **Playbook confirmation remains governed.** \`ai/org-playbook.js\` derives candidates with counter-evidence/confidence, but the module does not persist a playbook entry itself; human confirmation shapes the durable entry and later history can contest it.

This is directionally the architecture required by the product law:
\`Focus -> Action -> Outcome -> new evidence -> changed understanding -> derived transition knowledge -> future precedent\`.

### Important architectural mismatch: there are TWO organizational-learning families

The current repo has two related but not identical learning paths:

**A. Derived org-state history**
\`org-memory -> org-learning -> org-playbook\`

This learns repeated changes in the derived organizational state and can produce governed candidate practices.

**B. Focus/action outcome history**
\`Focus -> actionsLog/outcome -> outcome-intelligence -> cross-evidence priorAttempts\`

This learns what was tried around a particular pattern/Focus and what recorded outcome followed.

Both are legitimate. The mistake would be treating them as two competing meanings of "organizational learning."

Canonical conceptual contract going forward:

> **Organizational learning is governed, provenance-preserving knowledge derived from historical state transitions and attempts/outcomes.**

The two families are INPUTS/derivers for that contract:
- org-memory history answers **what changed around the organization over time?**
- Focus/action outcome history answers **what did people deliberately try and what was observed afterward?**

Do not merge their storage during pilot. Do not create a third learning store. During/post pilot, converge their READ contract so Composer can retrieve comparable precedent with source class and limitations.

### Focus has two storage/shape families today

\`ai/cross-evidence.js\` explicitly documents:
- personal Focus: \`raw.addresses = {kind,id}\`, personal outcome/resolution shape;
- group Focus: \`raw.origin.inquiryId\`, group outcome record with \`outcome.at\`.

The reader currently supports both rather than rewriting historical records. That is the correct pilot choice.

However, this is technical debt with architectural consequence. New code must not invent a third Focus lineage/outcome shape. Any new common Focus reader should normalize at the READ boundary. Storage migration can wait until after pilot unless a correctness bug requires it.

### The Action loop is canonical enough to preserve

The important ownership invariant from the existing tests is:

> Focus projects commitment; \`actionsLog\` owns the execution/evaluation/learning lifecycle.

Do not add action identity/state inside Focus merely to make the UI easier. Focus may reference/derive action history, but Action owns its own lifecycle. Likewise, an outcome recorded on Focus must converge on the Action owner rather than becoming a disconnected feedback field.

Required runnable proof to retain:
- create Focus -> exactly one Action-loop record;
- retry/reload -> no duplicate Action;
- outcome -> same Action advances to evaluated/learn;
- changed tactic on same B normally remains the same Focus but may create the next action/attempt under that Focus;
- materially changed B requires deliberate Focus change/new Focus according to canonical Focus law.

### Learning must distinguish sequence from causation

\`ai/cross-evidence.js::loop\` is architecturally careful: it reports what the Focus addressed, the recorded outcome, prior attempts, and evidence observed afterward, while explicitly refusing to call the Focus causal.

\`ai/outcome-intelligence.js\` similarly reports recorded history/sample size rather than predicting.

Preserve this hard boundary:
- "X was tried, Y was recorded afterward" is history.
- "X caused Y" requires stronger evidence and is not implied by temporal order.
- repeated positive history can become useful precedent with uncertainty; it does not become universal prescription.
- failed attempts are learning too and should suppress repetitive suggestions unless conditions materially changed.

### Learning retrieval must be authorized separately from source conversation

Future A -> B reasoning may retrieve a governed derivative of an earlier Focus journey. It must NOT retrieve the private conversation merely because the earlier Focus is similar.

Safe precedent shape should be roughly:
\`{ comparableA, chosenBShape, action/interventionShape, conditions, recordedOutcome, limitations, resultingLearning, provenanceClass }\`

It should not require:
\`{ personIdentity, privateMessages, rawNotes }\`.

This is where the founder law "conversation belongs to its people; evidence and reusable direction/learning belong to the organization at their governed standing" becomes executable.

### A concrete risk: outcome history can become accidental prescription

\`ai/outcome-intelligence.js::bestForPattern\` sorts intervention history and returns the first intervention; \`earlySignalBrief\` correctly phrases it as recorded outcome history and says "Review before acting." This is currently cautious.

Do not allow downstream consumers to reinterpret \`bestForPattern\` as "recommended intervention." A better long-term name would be \`strongestRecordedHistoryForPattern\` or similar, but avoid rename churn before pilot. Tests should pin that the result is precedent/history, not an instruction and never auto-creates Focus/action.

### A concrete risk: old object-and-focus brief is stale

\`docs/briefs/object-and-focus-contract.md\` still says Inquiry is durable and may be created by intake, and describes Focus fields/stages against a much older SHA. Current ratified product law now says High/Low/Inquiry are governed discovery standings and Focus is the only primary intelligence object deliberately created.

**Next coding agent must not implement that brief literally.** It should either be marked superseded or reconciled against \`docs/rnd/INTELLIGENCE_EXPERIENCE_LAW.md\` before any Focus storage migration. The useful privacy/participation tests in the brief remain valuable, but its ontology/status text is historical.

### Pre-pilot / during / post-pilot staging

**Pre/player-pilot correctness**
- preserve one Focus lifecycle owner across direct + Composer transports;
- preserve exactly-one Action-loop creation and outcome convergence;
- prove reload/idempotency;
- no outcome-history -> prescription promotion;
- no private predecessor conversation through cross-evidence/learning;
- governed prior-attempt retrieval only inside authorized scope;
- fix stale documentation precedence so an agent cannot resurrect user-created Inquiry semantics.

**During pilot**
- introduce a normalized Focus read adapter covering personal/group lineage/outcome shapes;
- make attempt/action history first-class in Focus presentation without duplicating Action state;
- connect Focus outcome -> evidence/updated standing -> changed source H/L/I visibly;
- converge outcome-history and org-learning retrieval behind one provenance-bearing precedent READ contract;
- use pilot outcomes to test whether "same A" matching is actually useful before generalizing it.

**Post-pilot**
- migrate Focus storage/shape only if needed for shared multi-writer scale;
- consolidate organizational learning/playbook/memory presentation and compatibility readers;
- richer transition graph/Web-of-Webs;
- causal/experimental inference only where design/evidence genuinely supports it;
- external/sensor outcome sources and cross-system adapters.

### Runnable acceptance tests for the next coding agent

1. Same Focus create through direct vs Composer produces same canonical state/side effects.
2. Same Focus create retry after reload produces no duplicate Focus or Action.
3. Recording an outcome advances the same Action; it does not create a second action/learning record.
4. A second tactic toward the same B can be represented as another attempt/action without forced Focus proliferation.
5. Prior failed attempt is present in authorized future reasoning and materially changes the option set/wording.
6. Prior attempt from another unauthorized person/group is absent even when A/B text is identical.
7. Focus-derived organizational precedent contains no raw/private conversation text or person identity.
8. Outcome history cannot auto-create a Focus/action and cannot be rendered as causal proof.
9. Later contradictory evidence can downgrade/contest a previously useful precedent without deleting history.
10. Group and personal Focus shapes normalize to the same read contract while preserving their canonical writers.
11. Source H/L/I can change after Focus outcome/new evidence without being deleted merely because a Focus existed.
12. "Why did this work?" can answer from recorded attempt/outcome/evidence with explicit uncertainty and no invented causation.



## 10. End-to-end object + Composer/material closure map

Source-inspected at \`8f11cc0c76b926c611e91a96bd9290eb38d90504\`. This section is the acceptance map for the founder requirement: High/Low/Inquiry/Focus must each do the correct epistemic job end-to-end, and Composer attachments must be readable/reasonable without laundering files into truth.

### One end-to-end law

Every ordinary path should be explainable as:

\`human turn / file / image / governed system source -> attributed source/material -> admissibility + scope -> canonical evidence only when warranted -> understanding/belief -> governed H/L/I standing -> scoped retrieval -> Composer reasoning -> optional human-confirmed Focus -> Action -> Outcome -> new evidence -> changed standing/learning -> later scoped retrieval\`.

No shortcut may skip from upload/message directly to High/Low/Inquiry standing or Focus merely because the model found the content persuasive.

### High

Expected business:
- High is a READ projection of governed positive standing (progress/milestone/strength), not a stored user-created record.
- \`ai/intelligence-feed.js::bucketOf\` remains sole High/Low polarity-to-bucket owner.
- generic opportunity is not High.
- High can be discussed, challenged, strengthened or weakened by later evidence.
- human may deliberately start a Focus to preserve/strengthen what is working; starting Focus itself is not evidence that the High is true.
- outcome/new evidence can change or withdraw the High.

Required E2E: admitted independent evidence -> reasoned positive standing -> High appears -> private chat about High -> optional confirmed Focus addressing High -> outcome -> later evidence -> High changes/holds; no private source text leaks when Focus audience widens.

### Low

Expected business:
- Low is the symmetric READ projection of governed risk/friction/negative standing.
- not a user-created problem label and not automatically a recommendation.
- may provoke an Inquiry when the reason is unresolved, but Inquiry is not a mandatory waterfall stage.
- may become Focus only after a human chooses a B.
- successful Focus does not automatically erase Low; later governed evidence changes the standing.

Required E2E mirrors High with negative/counter-evidence and must prove High <-> uncertain/neither <-> Low transitions are recomputation, not duplicate objects.

### Inquiry

Expected business:
- Inquiry is governed unresolved understanding / information need, not a user command.
- \`ai/inquiry.js\` owns information-value/ask-or-derive planning; \`ai/diagnose.js\` owns richer evidence-ref-backed investigation state.
- a human question/suggestion remains attributed input; it can contribute to the kernel deciding an Inquiry is worth surfacing but cannot command canonical standing.
- Inquiry may settle into High, Low, neither, or nuanced understanding.
- Inquiry can also remain unresolved while a human chooses a Focus; no forced sequence.

Required E2E after removal of \`create_inquiry\`: ordinary unresolved question and explicit "make this an Inquiry" both preserve the human contribution; kernel independently decides whether to surface an Inquiry. Provider/model failure must not silently drop the contribution.

### Focus

Expected business:
- only primary intelligence object deliberately created by human commitment.
- B remains human choice; model can propose/clarify but cannot silently create.
- can originate Home, High, Low, Inquiry or direct intention.
- source is a REFERENCE, never copied conversation.
- widening Focus audience does not widen predecessor chat.
- creation converges on canonical owner and exactly one Action-loop record.
- outcome advances same Action and can generate governed new evidence/learning.
- prior attempts should influence future options without becoming causal proof/prescription.

### Composer + attachment/media path

The current design is directionally strong and should be preserved:

1. **Picker/capability boundary — \`js/attachments.js\`.**
   - Composer picker advertises only readable image types plus server-readable material extensions.
   - image types are explicitly bounded rather than \`image/*\`/HEIC false-green.
   - legacy Knowledge/Data Sources path is narrower and must never substitute filename/parser receipt for content.

2. **Universal conversation attachment door — \`POST /api/assistant/attachments\`.**
   - attachment is retained as material/context first, not evidence.
   - \`ai/material.js\` declares three epistemic classes: external context, personal evidence, organisation evidence.
   - attaching alone has epistemic effect NONE.
   - personal evidence requires deliberate classification; organisation evidence requires authority + stated provenance + explicit confirmation, otherwise it is downgraded to readable context.

3. **Images.**
   - image bytes are read once through the vision-capable gateway and converted to an attributed material description.
   - later turns reason over the retained description/material, not silently re-read unavailable binary.
   - the model's description of an image is weak/contextual material, not objective organizational evidence.

4. **Documents/data.**
   - material follows author structure (slides/headings/sections), not model-invented topic buckets.
   - \`contextFor\` and \`findIn\` provide bounded relevant passages.
   - Composer gets material explicitly labelled as attached context and is instructed to work from it first.
   - external material is explicitly labelled not-local-evidence.
   - partial/narrowed retrieval is disclosed to the model so prose cannot pretend it saw the whole file.

5. **Reasoning return path — \`ai/composer.js\`.**
   - Composer receives already-scoped beliefs/evidence/material/conversation/object relationships/attention.
   - it reasons/writes; deterministic verification checks grounding.
   - proposals remain candidates until deterministic confirmation/writer.
   - Forum text is labelled conversation, NOT evidence.

### Attachment hiccups that MUST be runtime-proved before player rollout

The code/comments/tests indicate intended support for JPEG/PNG/WebP/GIF plus DOCX/XLSX/PPTX/text/CSV, with PDF handled as document bytes on the conversational/model path. Do not infer device/provider success from source inspection.

Runnable agent/device acceptance:
1. iPhone photo from picker -> upload -> vision read -> immediate answer about visible content -> reload -> follow-up answer from retained material.
2. PNG/JPEG/WebP/GIF each either read or cleanly refuse before upload; HEIC must not be offered/false-green unless server support is added.
3. PDF -> actual document content reaches model; filename/receipt never substitutes for text/content.
4. DOCX/PPTX/XLSX -> actual author content/structure reaches server material path; missing browser helper library must not matter on canonical Composer server-reader path.
5. TXT/MD/CSV -> exact meaningful content retained; quoted CSV/multiline cases do not corrupt meaning.
6. Unsupported/corrupt/empty binary -> clear refusal, no material-as-evidence, no fake summary.
7. Provider unavailable during image/document understanding -> honest degraded state; attachment retained if safe; retry can later enrich it without duplicate material/evidence.
8. malicious prompt text inside a document/image remains untrusted source content and cannot override system/governance or manufacture actions.
9. private attachment on private conversation cannot become readable from a shared H/L/I/Focus merely because that object references a derivative.
10. deleting source bytes/history follows lifecycle law while legitimate governed derivatives retain provenance/tombstone rather than dangling copied text.
11. asking "what does section/slide X say?" retrieves the relevant retained section, not merely the first context window.
12. multilingual material (at least Shona/Ndebele plus non-Latin script fixture) survives segmentation/retrieval without language allowlist.

### Cross-object Composer acceptance matrix

Run the SAME conversational questions against Home, High, Low, Inquiry and Focus:
- "What do we actually know?"
- "Why do you think that?"
- "What are we missing?"
- "What contradicts this?"
- "What have we already tried?"
- "What happened after that?"
- "What could we do next?"
- "Show me the evidence."
- "I disagree."
- "Work on this."
- "Start a new chat about this."

Expected:
- Home can reason without manufacturing an object.
- H/L/I answers from their governed standing and authorised basis.
- Focus prioritizes B/current A/attempts/outcomes/learning.
- "Work on this" on H/L/I proposes Focus, never mutates immediately.
- "I disagree" contributes/challenges; it does not directly flip polarity.
- "Show evidence" deepens within same scope; no privacy widening.
- New Chat creates a new participant-owned thread around same object, not a duplicate object.
- explicit depth request may exceed concise-first response while preserving same truth envelope.

### Highest-value runnable closure order

1. Run/fix existing attachment suites: \`attachment-boundary-http-smoke\`, \`attachment-retry-http-smoke\`, \`material-accept-smoke\`, \`material-reach-http-smoke\`, \`material-smoke\`, \`material-classification-smoke\`.
2. Run/fix \`intelligence-feed-smoke\`, \`inquiry-smoke\`, \`inquiry-http-smoke\`, \`focus-continuity-smoke\`, \`focus-ownership-parity-smoke\`, \`focus-action-owner-smoke\`, \`group-focus-loop-http-smoke\`.
3. Add the cross-object Composer matrix above through real \`/api/assistant/turn\`.
4. Add attachment -> object journey: attach -> reason -> deliberate evidence promotion where permitted -> standing changes -> Focus proposal -> confirm -> outcome -> changed standing.
5. Mutation-test each boundary: attachment becomes evidence on upload; user command creates Inquiry; High/Low bucket owner bypassed; Focus created before confirm; source conversation exposed after audience widening; outcome history rendered as prescription. Every mutation must turn the acceptance suite red.
6. Full registered suite + PostgreSQL restart proof + Chromium/mobile rendered flows + live provider image/PDF/Office proof.

Do not call Composer/player-ready until those production-path checks are green or the remaining external checks are explicitly named.


## 11. Founder acceptance priorities — prose-first pilot closure

The founder's release question is not whether every module exists. It is whether the whole product behaves like one methodical intelligence system. Treat the following as the ordered acceptance contract.

1. **Input truth:** conversation, image, file, onboarding, check-in, assessment and system data enter through their declared source/material/evidence boundary. An attachment is readable material first; it never gains evidentiary standing merely because a model read it.
2. **Prose is the product:** for the same authorised truth envelope, Composer must answer naturally and usefully. It should answer when it can, ask one high-information question when needed, brainstorm/relate when that is the useful move, challenge assumptions when warranted, and propose action only when the conversation has earned it. It must not expose packet/kernel jargon, manufacture certainty, default to interrogation, or default to generic encouragement.
3. **H/L/I symmetry:** High, Low and Inquiry are sibling governed discovery standings over the same admitted evidence/understanding substrate. High/Low differ by governed polarity; Inquiry differs because uncertainty/information value remains unresolved. None is user-created. None owns evidence. Each can be discussed, challenged and changed by later evidence.
4. **Focus from every Composer context:** Home, High, Low, Inquiry and existing Focus conversation can all reach the canonical Focus proposal/confirmation machinery when a human deliberately chooses a B. Existing Focus conversation should normally refine B/path/attempt rather than proliferate Focuses.
5. **Personal vs organisational reasoning:** a member can reason over their own authorised personal evidence. Another player cannot. A coach/leader receives only material granted by scope/governance and aggregate/derived organisational intelligence where permitted; role or relationship alone never grants another person's private evidence/conversation. Test BOTH output and non-interference: private data must not change an unauthorised reader's wording, confidence, recommendations or omissions.
6. **A->B loop:** individual and collaborative paths must both close: A/understanding -> human B -> Focus -> attempt/action -> outcome -> evidence -> changed understanding -> learning -> next decision. Peer/group collaboration adds governed participants/Forum; it must not replace the individual loop or leak predecessor private conversation.
7. **Web:** relationships connect canonical objects and make relevant history discoverable; they never grant readership or create truth. The useful Web question is whether authorised reasoning can traverse from current A to relevant evidence, source standing, Focus, attempts/outcomes and learning without copying those records into a second graph.
8. **Library:** explicit reference/filing surface, not memory gate and not truth store. Filing must not grant access, duplicate evidence, or become the way conversation is remembered. It should make retained authorised material/objects easy to find and reuse.
9. **Memory:** remember governed facts, evidence refs, object lineage, attempts/outcomes, accepted preferences/decisions and authorised conversation history at the appropriate owner/scope. Do not convert transient model prose, private wording, repeated echoes, inferred sentiment or a filename/parser receipt into durable truth.
10. **Minimal UI:** show the current meaning and useful next move first; deeper evidence/history is available on demand. No raw confidence dashboards, meaningless event-count graphs, database terminology or action-pill forests. Common H/L/I/Focus screen skeleton; type-specific meaning.
11. **Syntax is necessary, logic is the gate:** \`node --check\`/registered suite green is required but cannot certify the product. Production-path HTTP, mutation, rendered browser/mobile, persistence/reload and live-provider attachment tests are required for the corresponding claims.

### Prose acceptance matrix

For Home, personal High, personal Low, personal Inquiry, personal Focus, shared/group H/L/I, and shared/group Focus, exercise:
- direct factual/personal question;
- organisational question;
- "Why?";
- "What do we actually know?";
- "What contradicts this?";
- "What are we missing?";
- "What have I/we tried?";
- "What happened afterward?";
- "What could I/we do next?";
- "Brainstorm with me";
- "I just want to think this through";
- "I disagree";
- "Show me the evidence";
- "Explain this fully";
- deliberate "Work on this / make this my focus";
- ordinary question containing the word focus, which must NOT create one.

Score by invariants, not style preference: answers the asked question; correct scope/person; evidence/interpretation distinction; uncertainty calibrated; no causal overclaim; no privacy inference; no unnecessary question; no unnecessary object/action; concise first; materially deeper on request; natural language; next move proportional to evidence.

### Media parity acceptance

Conversation and retained material need not share the same ingestion mechanics, but after safe ingestion they should be similarly useful to reasoning. Run the same substantive question first against pasted text, then TXT/CSV, DOCX, PPTX, XLSX, PDF and an image containing equivalent information. Expected conclusions should agree within source limitations; differences must come from extraction/visibility/provenance, not arbitrary path behavior.

For images specifically test: chart/table, photographed written note, screenshot containing prose, and ordinary scene relevant to a question. The retained vision description must be attributable and inspectable enough for follow-up, and must not be promoted to organisation evidence automatically.

### Release evidence required

The next runnable coding agent should create one durable matrix/report that records, for every row above: production route, canonical owner, positive assertion, negative/counterexample assertion, mutation, reload proof where relevant, and whether live provider/device proof was actually performed. Do not summarize a missing row as "covered by architecture."


## 12. Pre-Claude checkpoint — 2026-09-22

Branch head after this checkpoint: \`867c427c8befdcf57cf965e56be78219a0d6189e\`.

### Direct correction made

\`scripts/composer-coach-questions-smoke.js\` still encoded the obsolete law that an explicit "Create an Inquiry..." command should produce a \`create_inquiry\` proposal. That contradicted the ratified Pilot Interaction Model even though production code search no longer exposes \`create_inquiry\`.

The suite now asserts the current law:
- explicit "Create an Inquiry..." cannot manufacture governed Inquiry standing;
- no \`create_inquiry\` action is proposed;
- prose must not claim an Inquiry was created;
- canonical Inquiry count remains unchanged.

This matters because leaving the old assertion would either fail the next full suite or pressure an implementation agent to resurrect a forbidden action merely to make tests green.

### What source inspection says is already unusually well covered

The registered truth suite already contains production-path coverage for:
- attachment/material reach and retry;
- Composer answer hijack/privacy/person reads;
- Coach questions with provider off;
- Composer creation/confirmation and group-vs-personal outcome vocabulary;
- intelligence continuity across Inquiry/object/thread/Focus/outcome/Composer;
- Focus ownership, Action owner and continuity;
- Library HTTP/reference/migration;
- Web intelligence and scope;
- object conversation screen;
- group Focus loop.

Do not rewrite these. Run them, attack them, and extend only missing founder acceptance rows.

### Known stale prose/comments to reconcile, not blindly implement

Some test-file headers/comments still describe the older eighteen-action Composer vocabulary including \`create_inquiry\`. Treat executable current law and \`INTELLIGENCE_EXPERIENCE_LAW.md\` as authoritative. Search all comments/docs for old user-created Inquiry semantics while touching nearby code; remove/mark them when safe so future agents are not misled.

### First execution order for Claude

1. Refresh remote and start at this head or newer; do not redo prior commits.
2. Run \`npm test\` immediately. Fix any red caused by the Inquiry-law correction before feature work.
3. Run the attachment/material and Composer suites individually so failures are attributable.
4. Run rendered browser gates at both pilot widths.
5. Add only the missing prose/media parity matrix rows from §11.
6. Mutation-test the exact owner/boundary each new assertion claims.
7. Then attack end-to-end: private personal input/material -> personal reasoning; independent governed contributions -> H/L/I; deliberate B -> Focus; outcome -> changed understanding; future authorised retrieval.
8. Live-provider proof for image/PDF/Office and mobile device proof remain external until actually performed. Never infer them from hermetic green tests.

### My current architecture belief, for challenge rather than deference

- The fundamental layering is sound enough for pilot: evidence/material, reasoning, governed standing, presentation, attention, Composer and commitment are separable and mostly have named owners.
- The largest risk is now **semantic drift between paths**, not absence of architecture: provider vs deterministic prose, personal vs group Focus grains, attachment vs conversation reasoning, old vs new Inquiry semantics, and multiple read projections of one understanding.
- H/L/I should converge on the same governed-standing READ contract, not identical persistence.
- Focus should remain the only deliberate primary intelligence object.
- The A->B loop is real in code, but pilot readiness depends on proving that outcome/new evidence visibly changes later understanding and prose rather than merely being stored.
- Privacy must be tested as non-interference, not only endpoint denial.
- Prose quality is the release surface. A technically correct kernel with generic, repetitive, interrogative or machinery-exposing prose is not a successful pilot.

### Do not spend tonight on

- schema unification for personal/group Focus;
- merging \`reason.js\` and \`diagnose.js\`;
- a new graph/truth/memory store;
- causal inference;
- anonymous experience mediation;
- broad Web-of-Webs visualization;
- temporal Forum-history semantics without founder decision.

Those can consume the night while doing little for the Coach/player experience.



## 13. Deep-pass defect fixed — Inquiry command was being mislabeled Low

Head after fix/tests: \`fa05acf6c589f08363ed551f56c4ec230f6744d5\`.

Source inspection found a real semantic bug in \`ai/composer-actions.js::readCommand\` after user-created Inquiry was removed. The command regex still recognizes \`inquiry|enquiry|high|low\`, but the no-action branch returned:

\`kind: word === 'high' ? 'high' : 'low'\`

That meant **"Create an Inquiry into X" was deterministically classified as a Low**. It did not create an Inquiry, which was safe for writes, but it corrupted the user's intended epistemic direction before reasoning: an unresolved question became a negative standing label.

Fixed at \`7098141cd9faa0a353fe8b2d2eb68f2119c04142\`:
- Inquiry/enquiry now normalize to \`kind: inquiry\`, \`type: null\`.
- High remains High, Low remains Low.
- only Focus maps to the consequential \`create_focus\` action.

Pinned at \`fa05acf6c589f08363ed551f56c4ec230f6744d5\` in \`scripts/composer-actions-smoke.js\` with explicit Inquiry/enquiry/Low assertions.

**Claude must run this suite.** I could inspect and commit through GitHub but did not execute Node in this environment, so syntax/runtime green is not claimed.

### Deep-pass principle reinforced

Removal of a forbidden mutation is not complete until every upstream intent parser, fallback, test, UI label and downstream reader preserves the replacement semantics. Search for this pattern around every retired action. A fail-closed write path can still be semantically wrong on the read/reasoning path.



## 14. PR closure hygiene for tonight — do not make Claude re-review history

Open-PR inventory observed from GitHub on 2026-09-22:
- **#90** \`codex/pilot-recovery-gate-r7\` — CURRENT pilot closure branch. Continue here. Do not merge/deploy until gates pass.
- **#89** \`claude/pilot-live-recovery-r1\` — older recovery branch at \`27b66644...\`. #90 was already established as containing/superseding its useful recovery work. Do not merge #89 separately; after #90 closure, verify no unique surviving delta, then close/supersede #89.
- **#85** \`claude/platform-work-summary-nmb0cm\` — old review/work-summary lineage. Treat as historical until a net-integration comparison proves a unique current-main delta.
- **#81** \`codex/ci-history-checkout\` — CI/documentation ancestry utility, not a Coach-pilot product feature. Keep out of tonight's product closure unless current CI requires it.
- **#75/#74/#73/#67** target #85 rather than main. They belong to an older stacked-review lineage. Do not individually merge into current main/#90 merely because they are open; first check whether #90/main already contains equivalent implementation.
- **#66/#65/#64/#63/#62/#59/#58/#12** are old main-targeting PRs. They require a NET INTEGRATION EFFECT check against current main/#90, not an old-base diff. Assume nothing from title/age.

### Fast close-out procedure for stale PRs

For every PR other than #90, Claude should spend minutes, not hours:
1. refresh current main + #90;
2. inspect PR intent and changed paths;
3. search current #90 for the same canonical owner/behavior/test;
4. classify **superseded / unique small delta worth porting / intentionally obsolete / unrelated post-pilot**;
5. if unique and pilot-critical, port the smallest delta into #90 and test it — do NOT merge the stale branch wholesale;
6. record the equivalence evidence and close/supersede stale PR only after remote truth confirms it.

Do not resurrect old ontology (user-created Inquiry, parallel packets/truth stores, duplicate Focus owner, authority-as-evidence, private-to-shared shortcuts) from an old PR.

### Credit-saving rule

Do not run a comprehensive historical audit before coding. The only historical question worth paying for is:
**"Does this open PR contain a unique pilot-critical behavior that current #90 lacks?"**
If no, classify it and move on.



## 15. Deep-pass operating contract — exhaustive without burning agent time

Founder explicitly wants a head-to-toe pass, but this is **verification of the product already built, not permission to expand pilot scope**.

Current remote checkpoint when this section was written: \`3e0f8a9de8cb8de954bcd2263d66524b0d77e015\`.

The repository currently contains **416 JavaScript files** including production modules and harnesses. Do not interpret “look at every bit” as “rewrite every bit.” Use the existing 300+ focused smoke/browser/adversarial suites as executable maps, then inspect owners when a seam fails or when two paths disagree.

### Cheapest-first loop

1. Syntax/static gate across production JS first. A parse/import failure outranks product polish.
2. Run the registered \`npm test\` suite once at the current head. Do not repeatedly pay for the full suite after every tiny edit.
3. Group failures by canonical owner and fix root causes, not assertions.
4. For each repaired owner, run only its focused suite(s) + one hostile opposite/mutation.
5. Re-run full \`npm test\` after a meaningful batch, not after every commit.
6. Browser/mobile checks are a separate gate: source tests do not prove a reachable screen.
7. Live-provider/device/Neon/Render checks remain external proof; never fake them with fixtures.

### End-to-end seams that matter more than file count

Trace each in both self and authorized group scope where applicable:
- raw conversation -> comprehension -> evidence/provenance -> understanding -> governed High/Low/Inquiry;
- H/L/I -> participant-owned conversation -> deliberate Focus proposal/confirmation;
- Focus -> canonical Action -> Outcome -> derived learning -> later Composer reasoning;
- attachment/image/document -> attributed material -> authorized reasoning -> optional evidence promotion;
- Library filing -> live referenced object/conversation -> reopen/resume without copying;
- Web/cross-evidence relationship -> authorized read (relationship must never grant access);
- Forum -> current authorized audience -> no private predecessor transcript leakage;
- voice -> same Composer/action path -> no second semantics;
- onboarding/context -> attributed world context, not automatic empirical truth;
- provider-down -> honest degraded prose, no false claims/writes;
- reload/restart -> same identity, audience, object lineage, attempts/outcomes and conversation continuity.

### Finding discipline

Classify findings as:
- **PILOT-BLOCKING DEFECT** — existing intended behavior is wrong/unreachable/unsafe; fix now if owner is clear.
- **PILOT PROOF GAP** — implementation looks right but required runtime/browser/provider proof is missing; add/repair the narrow test or leave exact command.
- **STALE SEMANTICS** — old docs/comments/tests/UX can resurrect obsolete law; correct only where it can mislead execution or behavior.
- **POST-PILOT** — improvement not required for current intended behavior; record, do not implement.

Every finding should name: symptom, canonical owner, exact path, violated law, smallest proof, and whether code changed.

### Newly proven connection defect fixed during this pass

At \`3e0f8a9\`, \`js/app.js::openFromShelf\` was corrected. A Library entry of kind \`conversation\` navigated to Home and returned, so the “live reference” did not reopen the referenced conversation at all. It now navigates Home and calls the existing canonical \`wsLoadConversation(refId)\` path. This is not a new Library feature; it closes the existing Library-as-index contract.

Add a browser assertion when the browser gate is next run: keep/reference a conversation, leave it, open it from Library, and prove the same conversation id/messages resume rather than merely landing on Home.

### Important execution bias

Prefer **connection defects** over cosmetic cleanup. A route existing is not proof a person can reach it. A test passing is not proof the UI calls it with the right identity/scope. A correct object is not proof later reasoning reads it. A stored outcome is not proof future prose learns from it.

Do not spend Claude time re-reading all 416 files linearly if static gates and focused ownership tests already cover them. Spend it on contradictions between layers and on the end-to-end seams above.


## 16. Pass checkpoint — UI/read-path inspection and CI state

Observed current CI for \`67247249...\`: Truth Layer is running. At observation time:
- PostgreSQL acknowledged-write restart: **success**
- \`node scripts/test.js\`: **in progress**
- Settings roles in Chromium: **in progress**

Do not duplicate those jobs manually while the same commit is still running. Read their result first.

### UI/read-path inspection

The current bucket renderer already contains several important anti-surface-fix protections:
- one card renderer for H/L/I/Focus;
- failed reads are distinct from empty state;
- render tickets prevent a slow prior bucket request overwriting a newer page;
- group/self list uses \`scope=all\`;
- Forum availability comes from the server rather than a client guess;
- object threads propagate scope through their internal reads;
- Home/bucket object cards converge on the same thread path.

Preserve these. They are exactly the sort of connection invariants a visual rewrite can accidentally undo.

### Library connection defect

\`3e0f8a9\` fixed conversation rows reopening only Home rather than the referenced live conversation. Browser proof remains required.

One suspicious legacy mapping remains in \`js/app.js::openFromShelf\`:
\`material -> focus\` before \`openObjectThread\`.
A material is not conceptually a Focus, and the app already has \`openMaterial(materialId)\`. Before changing this, prove whether \`material\` is currently fileable/reachable through the Library and what \`refId\` represents. If it is a materialId, route it through \`openMaterial\`; if it is intentionally an owning Focus id, fix the naming/contract rather than guessing. **Do not implement from this note alone.**

### Graph/presentation constraint

Do not add a graph because the product has data. Existing chart/graph code must be judged by one question: does it communicate a meaningful change, trajectory, comparison, contradiction, relationship or progress toward B? If it merely renders recorded events/counts/points, hide/remove it from pilot UI rather than redesigning the intelligence layer.



## 17. CI is RED — failures are mostly obsolete Inquiry semantics, not ten independent product regressions

Truth Layer for \`67247249...\` completed \`node scripts/test.js\` RED. Do **not** merge. The log reports “10 steps failed”, but root-cause clustering matters:

### Cluster A — obsolete user-created Inquiry contract (primary)

These suites still expect \`create_inquiry\` or a human confirmation to mint an Inquiry:
- \`scripts/human-origin-http-smoke.js\` — HO-F1 then throws reading \`requiredApproval\`.
- \`scripts/conversational-journey-http-smoke.js\` — C1/C3.
- \`scripts/conversational-commands-http-smoke.js\` — A2/H2.
- \`scripts/product-promise-http-smoke.js\` — C1 then throws reading proposal id.
- \`scripts/conversational-continuity-http-smoke.js\` — A1/A2/A3 then throws reading \`explained\`.
- \`scripts/multilingual-universality-http-smoke.js\` — throws after the expected old Inquiry path is absent.
- \`scripts/pilot-crackdown-smoke.js\` — PX-A16 explicitly asserts \`create_inquiry\` is not narrowed.

Current ratified law is the opposite: High/Low/Inquiry are governed discovery standings; only Focus is deliberately created by a human. **Do not restore \`create_inquiry\` to make CI green.** Rewrite these assertions to prove the new contract:
1. explicit Inquiry wording preserves inquiry/question intent;
2. no consequential create action/proposal is emitted;
3. conversation/evidence can feed the governed Inquiry owner;
4. an Inquiry appears only when the kernel/standing rules justify it;
5. no false prose claims “I created/opened an Inquiry.”

Fix the tests at the semantic boundary, not by weakening them to “no crash”. Preserve their original hostile/continuity purpose where still applicable.

### Cluster B — Composer smoke

\`scripts/composer-smoke.js\` also failed. Pull its exact assertion/log before editing; do not assume it is the same cause.

### Cluster C — asset stamp

\`scripts/asset-version-smoke.js\` AV5/AV5b failed after \`js/app.js\` changed. This is expected release hygiene, not a product-law defect. Run the repository's prescribed stamp flow (\`npm run stamp:record\` after the required index stamp bump) once the UI batch is stable, not after every app.js edit.

### Cluster D — stale review status

\`scripts/docs-status-smoke.js\` says a tracked status document is 40 commits behind HEAD. Update the canonical status/checkpoint once after the correction batch. Do not churn it per commit.

### What passed in the same full run

Important owners remained green in the log, including:
- voice input 89/0;
- object conversation screen 4/0;
- chart governance 53/0;
- material 31/0 and material reach 87/0;
- shelf 23/0 and shelf HTTP 33/0;
- focus Action owner 3/0 and Focus ownership parity 27/0;
- evidence polarity 26/0 and highs/lows 24/0;
- group Focus loop 40/0;
- Forum audience 98/0;
- attachment retry 32/0;
- material classification 43/0;
- output manifest 90/0;
- endpoint smoke 222/0.

This is strong evidence that the red run is concentrated around semantic migration/release bookkeeping rather than a broad syntax collapse.

### Agent order from here

1. Fix Cluster A stale tests **without resurrecting user-created Inquiry**.
2. Inspect/fix Composer smoke exact failure.
3. Run those focused suites.
4. Continue product connection defects.
5. At the end of the UI batch, fix asset stamp.
6. Refresh status doc.
7. Run full \`npm test\` again.
8. Then browser/mobile gates.



## 17. CI triage after Inquiry-law change — do not mistake stale acceptance for product regressions

A fresh Truth Layer run on \`da31f9f...\` exposed the remaining blast radius of the ratified rule **Focus is the only human-created primary intelligence object**. The failures are useful: several older end-to-end suites still encode the superseded product where a human utterance proposes/confirms \`create_inquiry\`.

Known stale-law suites from that run:
- \`scripts/human-origin-http-smoke.js\` — HO-F1 onward explicitly expects a coach to create/confirm a personal Inquiry.
- \`scripts/conversational-journey-http-smoke.js\` — C1/C3 expect \`create_inquiry\` proposal + created surface object.
- \`scripts/conversational-commands-http-smoke.js\` — A2/H2 expect \`create_inquiry\`.
- \`scripts/product-promise-http-smoke.js\` — C1 chain expects old Inquiry proposal.
- \`scripts/conversational-continuity-http-smoke.js\` — A1-A3 expects “why does that keep happening” to be offered/confirmed into Inquiry.
- \`scripts/multilingual-universality-http-smoke.js\` — downstream throw after old proposal expectation; inspect before editing, but likely same stale contract.
- \`scripts/composer-smoke.js\` also failed; inspect exact assertions before classification.

**Do not restore \`create_inquiry\` to make these green.** Rewrite the acceptance around current law:
- explicit human “create/open an Inquiry” = attributed inquiry/discovery intent, no canonical write merely because they commanded it;
- the conversation should still reason about the unresolved question;
- a canonical Inquiry appears only through the governed discovery/kernel path when evidence/standing earns it;
- deliberate B can become Focus through confirmation.

Separate non-product reds:
- \`asset-version-smoke.js\` AV5/AV5b — client asset changed without corresponding cache stamp/fingerprint update. This is release hygiene and must be fixed before deployment after UI JS settles.
- \`docs-status-smoke.js\` — durable status document is 44 commits behind HEAD. Refresh near closure; do not burn cycles updating it after every commit.

This CI run also proves the majority of the system remained green across voice, relationship refs, anonymity, classification scope, dummy pilot, group/objective/Focus owners, curiosity, object conversation screen, notices, pilot rehearsal, roster, Focus reach, web sources, Forum reach, escalation, provider boundary, auth/tenant authority, UI states, chart governance, material reach, shelf HTTP, priority surfaces, onboarding, persistence, Focus continuity, evidence polarity, H/L, org purge, Composer actions, Focus ownership parity, output manifest/channels, cross-evidence, attachment retry, Forum audience, and endpoint smoke.

Interpretation: the current red is concentrated, not evidence that the whole platform is broken. Fix the stale Inquiry acceptance contract at its seams; do not redesign the architecture.

---

## 7. Claude closure round — 2026-09-23

**Branch head at start:** `62413af` · **Head at end:** `260c4ed` · **Nothing merged or deployed.**

Four commits, each reversible on its own:

| SHA | What changed in production |
|---|---|
| `db65514` | `IQVoice.stop` releases the microphone lease and aborts the recogniser when `stop()` throws |
| `5d58ff6` | `POST /api/evidence/import` allowlists deliverable formats; an unverifiable pdf/docx extraction claim is refused |
| `843fd27` | `_inquiryOptions` — a small justified option set at `worth_testing`, plus its render |
| `260c4ed` | One owner for Chromium resolution; ten browser gates actually run; two stale assertions corrected |

### HIGH 1-3 re-verified by mutation, not by reading

The three blockers fixed before this round were reproduced and mutation-proven rather than taken on trust:

- **HIGH 1** — reverting `/api/auth/me` to direct `verifyToken` turns `session-authority-http-smoke` red (4 failures: inactive, suspended, future-status, deleted).
- **HIGH 2** — reverting `_forumAccess` to remembered node membership turns `forum-audience-smoke` red (FA-C6c/d/e); removing the live gate from PATCH alone turns FA-C6g/h red.
- **HIGH 3** — removing `interruptActive` turns `voice-input-smoke` red (V20a-d).

**HIGH 3 was incomplete.** Mutating the second half of `isLive` survived, which exposed that `IQVoice.stop`'s catch path cleared the target's session while leaving both the app-wide lease and the recogniser itself alive. Two reachable consequences from one ordinary tap: `cancelAll` (sign-out, every navigation) iterated the session registry, found nothing and released nothing; and the next Composer told a control that had already stopped that listening "moved to another composer". The first attempted fix released the lease without aborting — V20j caught that, proving two started unaborted recognizers. Fixed at the owner; V20g-V20k added; mutations of each half die separately.

**HIGH 4 was already closed on the browser side by this branch**, and closed better than the approach I had started: the Knowledge door now offers only what `AttachmentHandler` can itself turn into text, with Office files going to the conversation/material server reader. The **owner** was still permissive — driven straight at the route with the browser bypassed, `{format:'pdf', content:'PDF document attached: scouting.pdf'}` returned `200 {imported:1}`. A door being honest is not the same as the owner being safe.

### Methodical Assistant — the named option-set gap is closed

`decision-intelligence-http-smoke` asserted the **absence** of option sets. That posture was right about the dangerous half and it is preserved exactly: nothing is ranked, scored or auto-selected. What it was wrong about is offering.

Nothing generated. Every option names something the record already holds, gated by the kernel's own answer to question 8 (`readiness.state === 'worth_testing'`): the supported explanation with its evidence refs, a prior attempt about *this* question recorded as having helped, and `learn_more` — always present, so declining is a visible choice. Below that state, options are `null` and the existing readiness/`wouldHelp` remain the honest answer.

A tactic recorded `no_change`/`worse` becomes a **caution**, never an option; when everything tried has failed the tactic is dropped and the payload says another variation is not the useful next move.

Rendered as reading rather than buttons — the row's one governed door into a Focus is unchanged, so no second path to a canonical write. 75 assertions; nine mutations red (five owner, four render).

### The browser gates were not running, and that is why two assertions were stale

The previous section of this handoff recorded local Chromium as unavailable. **It was not.** playwright-core resolves chromium-1228; the image ships chromium-1194; a launch on a missing executable hangs rather than failing, so the gates emitted nothing and the absence was written down as an environment limitation.

All ten pass here against the real binary: pilot-coach 133, group-loop 55, forum-share 13, settings-tiers 45, chart-shape 42, library 33, onboard 34, priority-surface 39, stack 114, voice-output 19.

Resolution now has one owner (`scripts/lib/chromium-path.js`, 14 registered assertions). Six other checks had the mirror bug — hard-coded chromium-1194, correct today and wrong at the next image update.

Two stale assertions surfaced the moment the gates ran, both correct product changes no test could contradict while nothing executed:

- `CS-R1b` demanded an emptied chart say something; the Sep-16 pilot pass deliberately reversed that (a refusal earns a sentence, nothing-to-draw earns silence). Corrected, and `CS-R2c/d` added to prove a real refusal still reaches the screen in the server's own words — the half that was missing.
- `library B7d` demanded `.docx/.pptx` disappear unless JSZip loaded, which after the server-side Office decision required the formats to vanish exactly when the change was designed to keep them working. Corrected, with PDF as the control.

### Proof run this round

- `npm test` — green, every registered suite, twice (after the option work and after the browser-gate work).
- Ten browser gates — green, real Chromium, listed above.
- Mutations — 9 on the option set, 5 on voice, 1 on the import owner, 2 on HIGH 1/2, 4 on the render. Every one red, then restored.

### Still external, not claimed

Live Render; live Neon durability/restart; real provider quality and recovery; actual iPhone/Safari microphone, picker, layout and session behaviour; real invite/email delivery. Chromium in CI is **no longer** in this list.

### Exact next seam

The acceptance matrix items that still have no registered production-path proof, in the order I would take them:

1. **Option sets from organisational precedent and external knowledge across objects.** `_inquiryOptions` covers the group-inquiry read. The equivalent for a personal object, and the external-knowledge source class, have no producer yet — I deliberately did not fabricate one, so `sourceClass` makes room for it without inventing a citation.
2. **Attachment conversation depth** (matrix 16-18): summarise/compare/question/extract/challenge from the same material producing appropriately different governed answers, and prompt-injection through attachment content.
3. **P1 conversation navigation** in `PRIORITY_RND.md` — multiple private chats per object; the object thread still opens only the most recently updated matching conversation.

## 8. Claude closure round two — 2026-09-23

**Head at end:** `68e782c`. Nothing merged or deployed. Three further commits.

| SHA | Production change |
|---|---|
| `5778e4f` | A document's text is fenced as content in the model prompt; the fence cannot be closed by the document |
| `4c46bbb` | A summarise request with material bound reaches the document, not the organisation reader; the repeat guard's copy follows what the turn was |
| `68e782c` | The object thread reports this person's other conversations about the object |

### Matrix 16-18 — attachment conversation depth

Asked one scouting report five ways on the real path. Two defects, neither in a helper:

- **"Summarise this scouting report" was answered by the organisation reader.** The branch catching overview words carries a comment saying it is for an org/team overview "not a topic", and its second alternative never checked — `summar\w*` claimed any turn containing the word. A coach who had just attached a report was told "Afternoon. All good on your side right now." with the document unread in the same call's `materialRow`. A document bound to the turn is what "this" refers to; those unscoped words no longer claim the turn when material is present unless the person also named the organisation.
- **A comparison question was answered with action machinery.** The repeat-suppression guard's substitute copy assumed a repeat meant the person restating an action, so two questions legitimately retrieving the same passage produced "I heard that as a change to what you wanted. Nothing was saved or shared."

**What this round deliberately did not do:** manufacture a difference between "what does it say about X" and "is that claim supported?". Models are off, deterministic retrieval can report contents and cannot adjudicate support, and the suite asserts that convergence. Inventing a distinction there would be the overclaim the product exists to refuse.

**Prompt fence (item 17).** No exploit was found and none is claimed — a hostile document proposed nothing, created nothing, widened nothing, and the kernel held. What was missing was one layer up: material text is up to 12,000 characters of multi-line content and went into the prompt in the same shape as the instructions around it, arriving *before* the line telling the model to answer only from the document. It is now delimited and explained, and the delimiter is defanged in the content so a document cannot close its own fence.

### A flaky privacy assertion, and why that matters more than it looks

`degraded-honesty` DH-E2 went red once in a full run and passed fourteen times alone. Cause: the leak matcher tested every machine word as a raw substring of the whole JSON envelope, so `turn_a500zjfd` matched "500" and a millisecond field of `.429Z` matched "429". About one generated id in ten thousand contains one, and a turn payload carries several ids and several timestamps.

A flaky guard gets re-run until it is green, and the day it catches something real it is indistinguishable from the noise. The numeric codes now match with digit boundaries against the text a person actually reads; everything else keeps whole-payload matching. Verified strictly stronger against a leaked 500, a leaked 429, a named provider and a raw `Error:`; ten consecutive green runs.

### P1 conversation navigation

The object thread opened the most recently updated conversation and said nothing about the rest — the product deciding silently which of somebody's own conversations they meant. The store and list route already worked; the thread now reports them, read from the same per-person workspace key, ids and labels only. Two people with private chats about one shared object still cannot see each other's, proved from both ends including a direct request for the other's conversation id.

### Proof this round

- `npm test` — green (three times across the round).
- Browser gates, real Chromium: pilot-coach 133, group-loop 55, stack 114, priority-surface 39, library 33, chart-shape 42.
- Mutations — 3 attachment-depth, 4 fence, 4 conversation-switcher. All red, then restored.

### Exact next seam

1. **Option sets for a personal object.** `_inquiryOptions` serves the group-inquiry read only. The personal equivalent and the external-knowledge source class have no producer; I did not fabricate one, and `sourceClass` leaves room without inventing a citation.
2. **Matrix items 12-14** — outcome reported changes what is suggested next; a materially identical failed tactic is not recycled; exhausted tactics route to human help. `_inquiryOptions` implements the shape (`cautions`, `exhausted`); the *conversational* half is unproven.
3. **Forum Ask IntelliQ** (PRIORITY_RND P2) — every governed Forum should expose it without widening scope. Not yet inspected.

### External gates unchanged

Live Render, live Neon, real provider quality, real iPhone/Safari, real invite delivery. Chromium in CI is not among them.

## 9. Claude closure round three — 2026-09-23

**Head at end:** `4b3555a`. Nothing merged or deployed.

| SHA | Production change |
|---|---|
| `4b3555a` | A focus reply says what was already tried on the same question and the outcome recorded |

### Matrix 12-14 — and the class of defect it belongs to

The experiment law was implemented **only in the layer that runs when a model writes the prose**. `ai/composer.js` carries prior attempts into the model's context and forbids repackaging a materially identical unsuccessful one. Measured: a turn bound to a group focus makes one provider call — the bounded action read — and the prose comes from the deterministic object reader. With models off, which is the pilot's configuration, none of it reached anybody.

A coach on their second attempt, asking what else to try, got: *"You are working on 'Rotate the press in the last twenty'. Nothing has been recorded about how it went yet."* The record held that "Extra fitness block on Tuesdays" had been tried and recorded as `no_change`. The most useful fact available was the one omitted.

This is worth naming as a class: **a rule that lives only in the model's prompt is absent in the pilot.** Anything in `SYSTEM_PROMPT` or `buildContext` should be assumed unreachable until proven on the deterministic path.

**A second finding underneath it.** The focus→source relationship has two spellings: personal focuses store `addresses: {kind,id}`, group focuses store `origin.inquiryId`. The reader looked at one, so it knew a personal focus's question and not a group's. Read under both names rather than renamed — consolidating is a canonical-owner change with its own blast radius, and this is a reader. **Recorded as a real consolidation candidate for a later pass.**

### Test-side correction worth carrying forward

The causal caveat is delivered on `response.qa.limitations`; the turn's top-level `limitations` describes the context it answered from. They are different statements and reading the wrong one makes a present caveat look missing. Any future assertion about an answer's own caveats should read the `qa`.

### Proof

- `prior-attempts-http-smoke` — 10 assertions, registered. Four mutations red: attempts not carried, group spelling ignored, attempts from any question bleeding in, causal limitation dropped.
- `npm test` — green.
- Browser gates: pilot-coach 133, group-loop 55.

### Parked, with the reason — Forum "Ask IntelliQ" (PRIORITY_RND P2)

The Forum has its own composer, which sends human speech to the room. There is no Ask IntelliQ.

Building it is **not** a UI task. The assistant answers from `_allObjectsFor(code, userId)` — the individual reader's authorised set. A Forum answer must be bounded by what the ROOM can read, and posting an answer computed for the asker into the room would widen readership, which P2 explicitly forbids.

The safest design, and my recommendation: **IntelliQ answers the asker only**, from the object's own governed projection that every member of the room can already read, and getting it into the room uses the existing governed share action. That needs no new audience owner and cannot widen readership by construction.

That is a founder-facing architecture choice with a privacy cliff, and it is P2 — below the acceptance matrix. Recorded rather than silently built.

### Exact next seam

1. **Option sets for a personal object.** `_inquiryOptions` serves the group-inquiry read only; the personal equivalent has no producer. The external-knowledge source class also has none — deliberately not fabricated.
2. **Matrix 14 proper** — "tactics exhausted → route to human help". `_inquiryOptions` says another variation is not the useful next move; nothing yet routes to a person.
3. **Forum Ask IntelliQ**, once the founder rules on the scope question above.

## 10. Claude closure round four — 2026-09-23

**Head at end:** `33acd6d`. Nothing merged or deployed.

| SHA | Production change |
|---|---|
| `33acd6d` | Ask IntelliQ inside a Forum, answered privately; and the two ways the app failed to take you to a room |

### The founder ruling, and what it made buildable

> Answer the asker privately using only the Forum/object-governed projection; never automatically
> publish that answer to the room. Sharing into the Forum must remain deliberate through the
> existing governed share path.

That resolves the privacy cliff recorded in §9 by removing it rather than managing it. `POST
/api/group/:nodeId/forum/:inquiryId/ask` is gated by the room's own live `_forumAccess`, is bounded
to one `_groupInquiryProjections` entry, and composes its answer **deterministically** — no model in
the path, and the response says so (`answers: 'current_object_read'`) instead of implying free-form
answering it does not have. It posts nothing, persists nothing and touches no thread.

The three properties the suite exists for are privacy properties, not answer quality: the room's
gate decides who may ask; two members of one room receive the **same** answer, because the scope is
the object rather than the asker; and the room is byte-for-byte unchanged by asking.

**It is a button, not a second text box.** Two boxes on that screen would be the costliest ambiguity
in the product — the difference between them is who reads what you type — and a box would promise
answering the deterministic path does not have. A box would be a capability claim; a button is the
truth.

### Two defects the rendered gate found, both on the founder-walked share path

Neither was visible to any server-side assertion, because nothing about the responses changed.

1. **`openForum` drew the room into a page that was not on screen.** Confirming a share returns
   `forum:{...}` and the client opens the room — including from Home, where `#iq-inquiries-page` is
   hidden. The room rendered into nothing. A second after deliberately putting their words in front
   of twelve people, the person's screen did not move. `openObjectThread` already carries this exact
   fix *with a comment saying the bug shipped once*; its sibling never got it.

2. **`todayTurnConfirm` received `d.forum` and dropped it.** The same governed action, confirmed from
   Home rather than from a conversation, settled the card saying "Posted to the forum for this" and
   left the person on Home with no way to see what they had just posted. Two doors to one write
   behaving differently is read as the product being unreliable.

### The mutation that matters most this round

Replacing the navigation guard with `window.MemberApp` — which **is always false**, because
`MemberApp` is a top-level `const` and therefore a global *lexical* binding, never a property of
`window`. It is a fix that passes inspection and does nothing. `FB-7a` catches it. Carry this
forward: in this codebase a `window.X` guard on a top-level `const` silently disables the code it
appears to protect.

### Two of my own assertions were false green, and were corrected before being trusted

- **`FA-E1`** searched the whole of `js/app.js` for `forumAsk()` — which also matches the handler's
  own definition. Deleting the button a person actually taps would have left it green. Now scoped to
  the room's markup.
- **`FB-17`** asked whether the private answer sits outside the message list using three plausible
  selector names, none of which exist in the markup. `querySelector` returned null, the clause fell
  through to true, and moving the answer bodily into the real list did not fail it. The list is
  `.iqt-turns`. **A selector that matches nothing is not a weak check; it is an absent one wearing
  the costume of a check.** Worth adding to the false-green list alongside source-text assertions.

This is also why six source-text assertions about `js/app.js` were backed by rendered ones: source
text is not a screen. A button can be present in the file and unreachable, off-viewport, or under the
fixed composer bar — which is how `FB-4` failed once before.

### Proof

- `forum-ask-http-smoke` — 21 assertions, registered. Deterministic (`IQ_DETERMINISTIC_ONLY=1`).
- `forum-share-browser-check` — 13 to 21 assertions; the room is opened, tapped and read on a real
  390px Chromium, and the other member reads the room afterwards.
- **Sixteen mutations, each required red then restored:** drop the live gate; answer per-asker; post
  into the room; `posted:true`; delete the tappable control; point the fetch at the room route; add a
  second composer; dress the answer as a message bubble; solid border; 26px tap target; remove the
  navigate guard; drop `d.forum`; the `window.MemberApp` no-op; hide the control with `display:none`;
  move the answer into `.iqt-turns`; wrap the answer in `iq-msg`.
- `npm test` — full Truth Layer green (twice this round).
- **All ten browser gates green on real Chromium**, 535 assertions: chart-shape 42, forum-share 21,
  group-loop 55, library 33, onboard 34, pilot-coach 133, priority-surface 39, settings-tiers 45,
  stack 114, voice-output 19.
- Asset stamp `20260923d` recorded.

### Exact next seam

1. **Matrix 14 proper** — "tactics exhausted → route to human help". `_inquiryOptions` already drops
   the tactic when `didNotHelp.length > 0 && !helped.length`, so it says another variation is not the
   useful next move; **nothing then routes to a person.** The person who has tried everything gets a
   shorter list and no next move. Must use existing audience/authority owners — no new store, no new
   lifecycle.
2. **Option sets for a personal object.** `_inquiryOptions` serves the group-inquiry read only. The
   external-knowledge source class still has no producer and is deliberately not fabricated.
3. **Consolidation candidate (carried):** the two spellings of the focus→source relationship,
   `addresses` vs `origin.inquiryId`.

### External gates unchanged

Live Render, live Neon, real provider quality, real iPhone/Safari, real invite delivery.

## 11. Claude closure round five — 2026-09-23

**Head at end:** `20d1ead`. Nothing merged or deployed.

| SHA | Production change |
|---|---|
| `305b322` | Matrix 14 — when everything the group tried did not help, name somebody who can look at it with them |
| `d0881fc` | Matrix 15 — ask again and get more, not the same 186 characters back |
| `20d1ead` | "Tell me more about it" inside a Focus is about the Focus, not the organisation |

### Matrix 14 — routing to a person without disclosing one

`_inquiryOptions` already knew the state and already said "somebody else's help" was the useful next
move; it offered no way to get it. `_peopleWithStandingFor` now names somebody, and only if they pass
**both** filters: they lead this node (standing, held on the node), **and** `_contactsFor` already
returns them (addressability, bounded by the tree). The intersection is what makes this safe —
suggesting a person is a disclosure, and relevance is not authorisation.

Where the two filters come apart is the test that matters: a leader of **this** node who has left is
still in `leaderIds`, so standing alone would name them. Being told to go and ask somebody who is
gone is the failure the filter exists to prevent.

The projection gained an optional `viewerId`. Everything else in it belongs to the node and reads the
same for everyone — the property the Forum ask ruling turns on — and "who could you bring in" is the
one question that is about the reader by nature. Callers that serve no particular person pass nothing
and get no option, which is the fail-closed direction. **No client change was needed**: the group
screen's option renderer already reads that route.

### Matrix 15 — and the same model-only-layer class, for the third time

"Start concise, then go materially deeper when they ask for depth or evidence" lived only in
`ai/composer.js`'s system prompt. With models off a coach asking three escalating questions received
**the same 186 characters three times**. Measured.

**The trigger is repetition, not vocabulary.** The call site carries a standing decision that matching
English question cues there "would rebuild the allowlist problem one layer down" — and it would work
in English only. Asking again while standing in the same object *is* the signal that the short answer
was not enough, in any language. Depth is chosen by whether the concise read has already been said in
this conversation, from the same per-person store, with no new state.

Two more defects on the same path: a third ask used to fall back to the **concise** answer, repeating
across a gap the repeat guard cannot see (it only compares the immediately previous message), so the
person received *less* than a moment earlier. And the guard read `!!qa && !actionReading.unavailable`
with the unavailable arm first — with models off that is always true, so every repeated answer was
reported as a change request the product could not interpret.

### The rule this round adds to the false-green list

**A mutation that does not run proves nothing, and neither does one that does not mutate.** Three
mutations "survived" this round and every one was a harness fault or a real finding:

- the leak mutation injected an empty string, so the privacy assertion was never tested;
- two left `server.js` unparseable and the suite never started — the mutation harness now runs
  `node --check` and refuses to report a result otherwise;
- `if (depth && !added) return null` was a genuine equivalent mutant.

### Three dead safeguards removed, on the same principle

`c.id !== viewerId` in `_peopleWithStandingFor` (`_contactsFor` already excludes the asker), `if
(depth && !added) return null` (both paths reach the same exhausted answer), and a `!(opts.object)`
guard on the pronoun branch (those words are claimed earlier by the reasoning register anyway, so the
alternative was dead code). **A line that reads as a safeguard while changing nothing is worse than
its absence, because the next reader will believe it is load-bearing.** In each case the law itself is
still asserted, against the composed behaviour.

### Proof

- `exhausted-help-http-smoke` 18, `exhausted-help-browser-check` 16, `answer-depth-http-smoke` 32 —
  all new, all registered (the browser gate is run by name, as its ten siblings are).
- **Eighteen mutations**, each required red then restored, across the three seams.
- `npm test` — full Truth Layer green after every round.
- **All eleven browser gates green on real Chromium**: chart-shape 42, exhausted-help 16, forum-share
  21, group-loop 55, library 33, onboard 34, pilot-coach 133, priority-surface 39, settings-tiers 45,
  stack 114, voice-output 19.

### Exact next seam

1. **"Go deeper." bound to an object** is classified as a statement rather than a question, so it is
   offered as a note to capture instead of being answered. Reproduced. Upstream of the branch fixed
   here, in `capture.classify`; honest rather than wrong, so recorded rather than forced.
2. **Matrix 8 and 9** — cited external knowledge supplying an option with provenance, and a mixed
   internal + precedent + external set. There is still no producer for the external-knowledge source
   class, and it has been deliberately not fabricated across three rounds. **This is a founder-facing
   gap, not an oversight**: it needs a decision about where external knowledge comes from.
3. **Matrix 10 and 11** — rejecting an option writes nothing; choosing one reaches a governed
   confirmation and a Focus. The option sets are rendered as reading, and the governed door is the
   existing "Work on this as a group" control, so this is likely provable without new production code.
4. **Consolidation candidate (carried, third round):** the two spellings of the focus→source
   relationship, `addresses` vs `origin.inquiryId`.

### External gates unchanged

Live Render, live Neon, real provider quality, real iPhone/Safari, real invite delivery.

## 12. Claude closure round six — 2026-09-23

**Head at end:** `b91f179`. Nothing merged or deployed.

| SHA | Change |
|---|---|
| `6d4e89e` | Matrix 10 and 11 proved on a real screen — no production change was needed |
| `b91f179` | The durable-restart check run for the first time, against a real PostgreSQL |

### Matrix 10 and 11 — and why "no production change" is the finding

Options render as reading and the only door into a Focus is the existing control, so "rejecting an
option" is not a control to press. Walked rather than assumed: the door opens with an **empty** field
and no option pre-selected (a textarea arriving pre-filled is a choice made *for* somebody wearing the
clothes of a choice they made); backing out leaves the record byte-identical; their own words,
deliberately confirmed, do reach it.

And the **server** is the gate, not the panel — deleting the client-side empty check changes nothing a
person can see, so the forged calls are asserted directly: a blank commitment is refused 400, and a
Focus claiming an origin inquiry that is not this group's is refused 404.

### The persistence layer had never been run, and did not need a live database

`scripts/durable-restart-check.js` has always said what the problem was: the truth layer is hermetic,
`DB_OPTIONAL=1` is an in-memory store, and "nothing survives a restart" is the one failure it is
structurally unable to see. It was carried as an external gate with live Neon.

**Part of the reason it went unrun is that the documented command does not work.** `db.js` asks for
SSL; a local PostgreSQL answers "the server does not support SSL connections"; the first boot never
comes up. `db.js` has had `PG_SSL_DISABLE` for exactly this and the usage line never mentioned it.
PostgreSQL 16 is in the standard container image — this was a few lines away, not a live database away.

`scripts/local-postgres.sh` now provisions a throwaway cluster and prints the working command.
**Result: 35 passed, 0 failed**, with the service process actually killed between writes and reads.

**And the check is not vacuous.** Two of my mutations survived first, both because I picked the wrong
owner: `scheduleSave` is the debounced path and `_saveProtectedUnit` is not what this flow writes
through. Neutering `db.saveStores` — every durable write, at the lowest level — turns twelve
assertions red. *That* is the mutation that proves it.

**Report it as what it is.** A local PostgreSQL has no network partition, no connection ceiling, no
cold start, no pooler and no managed-service failure modes. It is not Neon, not Render, and says
nothing about the deployed build. It proves the persistence code in this commit writes to a real
database and reads it back after a restart.

### Acceptance matrix status

| Items | State |
|---|---|
| 1-7 | Closed in earlier rounds |
| **8, 9** | **Open, and founder-facing.** Cited external knowledge supplying an option, and a mixed internal + precedent + external set. There is still no producer for the external-knowledge source class; it has been deliberately not fabricated across four rounds because inventing a citation is the one thing this product must not do. **This needs a decision about where external knowledge comes from, not more engineering.** |
| 10, 11 | Closed this round, on a real screen |
| 12, 13, 14 | Closed |
| 15 | Closed |
| 16, 17, 18 | Closed |
| 19 | Covered by `degraded-honesty-http-smoke` and `composer-degraded-http-smoke`, including the recovery half (DH-G1: the very next ordinary request after recovery is the considered one) |
| 20 | Persistence half proven against a real PostgreSQL this round. Neon and Render remain genuinely external |

### Exact next seam

1. **Matrix 8 and 9** — blocked on the founder decision above, not on engineering.
2. **"Go deeper." bound to an object** is classified as a statement rather than a question, so it is
   offered as a note to capture instead of being answered. Reproduced; upstream in `capture.classify`;
   honest rather than wrong.
3. **Consolidation candidate (carried, fourth round):** the two spellings of the focus→source
   relationship, `addresses` vs `origin.inquiryId`.

### External gates, now narrower

Live Render, live Neon (network, pooler, cold start), real provider quality, real iPhone/Safari, real
invite delivery. **The persistence layer is no longer among them.**
