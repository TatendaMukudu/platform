# Final surface + multimodal + Forum pass — report

**STARTING SHA** `951c3066f360792d8148786614f53f5df4d7f89b` (fetched; matched the head reported)
**ENDING SHA** `f137896` · **Branch** `gpt/ab-decision-spine-r1` · **Not merged.**

Five commits. The pass was asked to finish the human-facing half, prove the group loop, prove
attachments, and determine photos. Three of those are done. One — photos — is answered with a
trace and a refusal to build, for the reason given in §3.

---

## 1 · Surface changes

| Surface | What the user sees first | What IntelliQ knows underneath | Hidden until asked |
|---|---|---|---|
| **Home** | the question, the group, what it does and does not have a read on, the provenance line | full inquiry state, priority ranking, cross-evidence, forum, attention codes | every hypothesis, origins, ids, bands with no claim |
| **High / Low / Inquiry** | title, the honest read or "I don't have a read on this yet", provenance | band, score, origin shape, alternatives, unknowns, falsifiers, forum, tried-before | all of it, until the object is opened or asked about |
| **Focus** | the commitment in the person's own words, who set it, what came of it | origin inquiry, action lifecycle, outcome, learning | no band at all — a commitment is not a belief |
| **Forum** | what people are saying about this one object | authorship, contribution state, origin identity | authors never reach the composer; only text does |
| **Composer** | one reply | material, beliefs, evidence, connections, forum, attention, org context, onboarding goals | everything; this is the escape hatch |
| **Attachments** | the document named, its parts, what it is and is not | segments, provenance, classification, engagement | section text until asked |
| **Org Tree / Library / Settings** | unchanged this pass | — | — |

**The one change a user will actually notice** is in §2.

---

## 2 · The badge that contradicted its own sentence

Found by reading the rendered screen, not by testing a function. On Home, Inquiries and Lows the
group's own question rendered:

```
Communication after results
WELL SUPPORTED
I don't have a read on this yet — what has been described is on the record,
and the reason for it is still open.
```

Two adjacent lines contradicting each other in IntelliQ's own voice — and the reader resolves it
the wrong way round every time, because a badge in capitals is louder than a sentence. The band
was the OBSERVATION's, earned by five people describing something. The claim it sat above was the
missing EXPLANATION.

**Both owners had the hole, and both had warned about it in their own comments.** `ai/present.js`
gated `thinking` on the hypothesis having standing and left `standing` — the badge — ungated,
which its own note predicted in the words *"a law with one owner and two renderers is a law with a
hole in it"*. `ai/voice.js` said the band is *"deliberately NOT spoken here"* and then returned it
as a field two lines below.

Nothing was lost by removing it. How well established the observation is was never the badge's job
and is already said better, in words, by the provenance line on the same card: *"five people, five
independent sources"*. A band is for what IntelliQ **believes**; provenance is for what it was
**told**.

**Which half was demonstrated:** `present.js` was the repair — reverting it alone puts the
contradiction back on Home and Inquiries. `voice.js` is the consistency half: reverting that line
alone leaves every screen correct, because no surface renders `explained.confidence`. Recorded in
the code so the next reader is not misled.

---

## 3 · PHOTO SUPPORT: **NO**

Traced before building, as instructed. Every piece exists and none of them are connected.

| Layer | State |
|---|---|
| `js/attachments.js` | **Accepts images.** `image/jpeg`, `png`, `gif`, `webp`, `svg+xml`; `ACCEPT_ATTR: 'image/*,…'`; `_processImage()` produces `{kind:'image', preview, claudeMsg:null}` |
| `ai/gateway.js` | **Speaks vision.** `understand()` builds Claude `{type:'image', source:{type:'base64'}}` blocks and OpenAI `image_url`; `canUnderstand('image')` is true with either key. Its own comment says *"a photo of a whiteboard"* |
| `ai.understand()` callers | **None in production.** Two test scripts, plus `server.js:7775` using `canUnderstand()` as a capability flag for a readiness report |
| `POST /api/assistant/attachments` | **Text only.** Reads `b.text`; no binary, no base64, no mimetype |
| `ai/material.js` | `KINDS = ['pptx','docx','xlsx','text','csv','pdf']` — no image. `hasReadableText` would reject binary |
| The image path that does exist | `claudeMsg` is consumed only by **Scenarios** (`_openScenario`, `sendScenarioMessage`) — a separate, older surface, not the Composer |

**So the seam is exact:** the gateway can already accept an image, and the client can already
produce one. What is missing is a server door that accepts binary, a material kind that survives
`hasReadableText`, storage and provenance for bytes rather than text, and a composer context path.

**I did not build it**, and the reason is scope rather than architecture. §20 permits "the smallest
coherent extension to the existing gateway" — but this is not one extension. It is an upload
contract, a storage shape, a privacy and provenance model for image bytes, and a context path,
landing immediately before independent testing, in a pass whose own instruction ends *"Do not add
more product after this."* Connecting it properly is a pass of its own; connecting it hastily is
how the attachment door came to exist without delivering anything, which is the defect the previous
pass spent its time repairing.

**One trust defect worth fixing now or flagging loudly:** `server.js:7775` reports
`readsFiles: ai.canUnderstand()` — so with a Claude key configured, a readiness surface can tell an
operator this build reads files, while the Composer cannot receive one. Not changed this pass; it
is listed below.

**HEIC:** not supported and not practical here — it is absent from the client's type map entirely,
so an iPhone photo taken at default settings would not be offered by the picker. Stated as an
iPhone limitation rather than pretended.

---

## 4 · Attachments

**SUPPORTED TYPES:** pptx, docx, xlsx, csv, text, md, pdf. Images are accepted by the picker and
cannot become material (§3).

**DO ATTACHMENTS REASON WITH INTELLIQ CONTEXT: YES.** Exact path:

```
POST /api/assistant/attachments  →  material.segment  →  materials store (refs: conversation|object)
POST /api/assistant/turn         →  _conversationMaterialContext  →  material.contextFor
                                 →  composer.buildContext({ material, beliefs, evidence,
                                     connections, forum, attention, need, … })
                                 →  ai.complete(system = SYSTEM_PROMPT + worldview + domain + member goals)
models off                       →  _assistantAnswer({ material })  →  names the document and its parts,
                                     says plainly it is not a reading of it
```

No laundering: material never reaches `applyProposals`. Asserted in
`attachment-boundary-http-smoke.js` (23), including the admission-time case that a re-read cannot
see.

---

## 5 · Forum

**FORUM → COMPOSER:** `_forumContext(code, userId, aboutRef)` → object must be in
`_allObjectsFor` for this reader → `_forumAudience` → membership re-checked → last 6 messages,
**text only, no authors** → `composer.buildContext({ forum })`.

**COMPOSER → FORUM:** no path. A private turn reaches the room only through the `share_to_forum`
action, which is confirmation-gated and shares only the edited words. Driven: the coach says
something private about their family and a private opinion about the squad, and the room carries
neither and does not grow.

**FORUM → INQUIRY:** only through `POST …/:messageId/contribute`, by the message's **own author**,
once. A declared echo carries the echoed account's origin marked `reported`/`inferred`.

**FORUM → FOCUS:** via the inquiry the focus was started from; no direct edge.

Five messages from one person are one origin. Leader status buys nothing.
`forum-direction-http-smoke.js` (21).

---

## 6 · Group loop: **13/4 → 55/0**

The product was right in all three places. The test was selecting controls **by position**, and a
positional selector does not fail when the UI changes — it silently retargets and reports something
false about a control nobody touched.

- **C1** `.iqg-inq-row button` meant "the first button", and a later pass made the question's title
  a door to its thread. The click opened the thread; the panel never appeared; the run died on a
  30-second timeout.
- **D1** asserted **three** outcome words and clicked index 2 for "too tangled to tell". The group
  vocabulary was corrected earlier on this branch to better/no_change/worse/unclear — so index 2 is
  now `worse`. A test clicking by position would have recorded **the opposite of what it claimed**
  while staying green on everything after it.
- **F2** asserted a member sees **no** button. That was never the law: a member may not *set a
  focus*, and reading the question is everybody's. Counting buttons cannot tell those apart.

All three now select by the handler they invoke. F2 gained its second half — the read affordance
must be present — so it cannot pass by the product hiding the row from members.

---

## 7 · Preserved from earlier passes

Org context (16), onboarding (21), attachments (23), org-tree authority (30), forum (21) — all
green. The four onboarding rules, as enforced in `POST /api/auth/complete-profile`:

1. **One person is one origin** — every answer carries `self:<userId>`, so five boxes are five
   signals and one origin, and onboarding alone can never open a group finding (which needs two).
2. **No direction, ever** — every signal is `neutral`. "What would you like to improve?" is not
   filed as a decline and "what are your strengths?" is not filed as an improvement.
3. **One concept per question**, named for the question rather than the topic — there is no
   classifier and one must not be invented.
4. **Short answers are not accounts** — under 12 characters is dropped rather than recorded.

The main goal is treated differently and becomes a **Focus**, because a thing you want to do is a
commitment rather than an account of you.

---

## 8 · Verification

```
npm test                       280 suites, 0 failed        EXIT 0
```

| Browser gate | Result |
|---|---|
| stack | 114 / 0 |
| pilot-coach (390px + 430px) | 97 / 0 |
| group-loop | **55 / 0** (was 13 / 4) |
| settings-tiers | 41 / 0 |
| priority-surface | 39 / 0 |
| onboard | 34 / 0 |
| library | 24 / 0 |
| voice-output | 19 / 0 |
| forum-share | 13 / 0 |
| chart-shape | 39 / **1** — pre-existing |

**390px and 430px:** no horizontal overflow on home, inquiry, focus, high, low, library, org tree,
settings; composer on screen and usable at both.

**Mutations this pass:** start-control handler removed → GB-C1; `worse` removed → GB-D1; leader
gate removed → GB-F2; echo mints its own origin → FD-F2/F3; anybody contributes anybody's message →
FD-E2/E3; object gate removed → FD-B1/B2/B3; `present.js` badge ungated → PC-N1 on home and
inquiry. Two no-ops recorded: the forum membership re-check (masked by the object gate) and the
`voice.js` confidence field (no rendered consumer).

---

## 9 · Live things not verified

- **Photos**, end to end. §3 is a trace, not a test.
- **Settings IA, Library simplification, Org Tree presentation.** Their gates are green and their
  information architecture is unchanged; the brief asked for simplification and this pass spent its
  budget on the group loop, Forum and the badge contradiction.
- **`chart-shape` CS-R1b**, pre-existing at the starting SHA.
- **A model actually reading an attachment.** Everything here ran models-off; the composer's
  material and directive paths are verified by capturing the prompt, not by reading a reply.

---

## 10 · What the founder would still have to explain to a normal user

1. **Why a photo cannot be attached** when the picker offers one. The file is accepted by the
   control and then cannot become material.
2. **Why the same object says "several people" on Home and "five people, five independent sources"
   on Lows.** Both are true; the vaguer form exists so a small group cannot be pointed at. A coach
   seeing both in one session will read it as inconsistency.
3. **What a Forum is for**, as distinct from the Composer. The product does not currently say.

---

## 11 · Verdict

Group loop proven. Attachments proven. Forum proven. Photos traced and deliberately not built.
The simplification half is **partly** done: the contradiction that made cards actively misleading
is fixed and pinned, and Settings, Library and Org Tree are untouched.

**READY FOR INDEPENDENT TESTING: YES**

The one blocker the brief named — the unexplained coach-facing group-loop failure — is resolved
and understood. The remaining items are unstarted work and known limitations, both listed above,
neither of which stops a coach completing the journey.
