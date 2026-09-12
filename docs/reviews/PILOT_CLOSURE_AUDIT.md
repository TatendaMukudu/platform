# Pilot closure audit

Audited against `main` at `5683df3`, 9 September 2026, ahead of the Alma College Men's Soccer
pilot on 26 September 2026.

Scope constraints observed: no product code was implemented, nothing was merged, PR #84 was not
modified, and the PR #84 ownership review was not redone.

Method: read plus reproduce. Where a finding says "reproduced" I ran it. Where it says "read" I
traced it in source and did not execute it. `npm test` was run in full and is GREEN (exit 0), so
nothing below is a failing test — every finding is something the suite does not test, or tests
in a place the user never reaches.

---

## Executive verdict

**PILOT CLOSURE IS FINITE.**

Four things must be fixed. Three of them are small and mechanical; one is a founder decision
rather than an implementation. Six things must be verified on a real device or a real deploy
before 26 September, four of which were already carried as explicitly OPEN and remain OPEN. Nine
things are safe to defer. Thirteen of the fifteen open pull requests should be closed.

The recurring shape of this audit is not broken logic. It is **doors**. The server routes are in
good condition — authorisation is consistent, the forum rooms enforce membership, the cohort
floor holds, the audit vocabulary is closed. What is missing, repeatedly, is the control in the
interface that reaches the route. A test that exercises the route passes; the person holding the
phone cannot get there. Three of the four blockers below are that exact failure.

The second shape is **two of something**. Two Libraries, five file pickers with four different
accept lists, three stacked comments describing the same forum rule in three contradictory ways.
Each pair started as a replacement that never removed what it replaced.

Nothing found here changes the ontology, the privacy law, the epistemic law, or the tenant
boundary. One item (LIB-2) changes product semantics and is presented as a decision, not chosen.

---

## Must fix before pilot

### BLOCKER 1 — LIB-1: shelf folders can be created but nothing can ever be put in one

**Evidence, reproduced by reading the only call site.**

- `MemberApp.fileToShelf(kind, id, folderId)` — `js/app.js:9012`. Takes a folder.
- Its only call site — `js/app.js:11207` — passes **two** arguments:
  `onclick="MemberApp.fileToShelf('${esc(kind)}','${esc(objectId)}')"`. `folderId` is
  `undefined`, sent as `null`.
- The shelf row markup — `js/app.js:8983-8991` — has exactly two controls: open the object, and
  Remove. There is no move control.
- `MemberApp.openShelfFolder(id)` — `js/app.js:8994` — only sets a client-side filter. It does
  not become the destination for the next Keep.
- `MemberApp.newShelfFolder()` — `js/app.js:8996` — creates and names a folder, and nothing else.

**User consequence.** A player or coach can create and name folders. Every folder chip renders
`count` = 0 forever (`js/app.js:8960-8962`). Opening any folder always shows the empty state
written for that case: *"Nothing is in this folder yet. Your other N items are still there."*
This is the feature the founder asked for in this cycle, described as *"open and name folders
store focuses, highs and lows of your choice there"*. It is half built: the naming half.

**Why it shipped.** The server supports it completely. `POST /api/library/shelf`
(`server.js:14277-14296`) accepts `folderId`, validates ownership of the folder, and `shelf.file`
returns `moved` for a re-file — filing and moving are one operation. `scripts/shelf-http-smoke.js`
exercises that route directly at lines 64, 84, 137 and 142, including a move between two folders.
The suite proves the route. Nothing proves the door.

**Smallest safe correction.** Add a folder control to the shelf row that calls
`fileToShelf(i.kind, i.refId, folderId)` — the existing route already treats that as a move.
Optionally have Keep default to `this._shelfFolder` when a folder is open. No server change, no
new law.

**Test that should prove it.** A DOM assertion over the string `_renderShelf` produces: it must
contain a control whose handler passes a third argument to `fileToShelf`. Mutate by deleting the
third argument and confirm the assertion goes red. The existing HTTP suite must stay untouched —
it is testing a different thing correctly.

**Overlaps PR #84?** No.

---

### BLOCKER 2 — VOICE-1: the degraded voice is indistinguishable from the normal voice

**Evidence, read.**

`ai/composer.js:255` defines `degradeLine(topic)`, documented at line 252 as the answer for
exactly this case: *"When there is no model, no budget, or the reply failed verification, we
never fake it."*

`degradeLine` is **never called from `server.js`**. Reproduced:

```
$ grep -rn "degradeLine" --include=*.js . | grep -v node_modules
./ai/composer.js:255:function degradeLine(topic) {
./ai/composer.js:262:module.exports = { SYSTEM_PROMPT, buildContext, verifyGrounding, degradeLine };
./scripts/composer-smoke.js:122: ... c.degradeLine('finishing')
./scripts/composer-smoke.js:123: ... c.degradeLine('finishing')
```

Its only caller is its own smoke test, which asserts the wording of a function nothing invokes.
This is the seventh occurrence of the definition-not-call family recorded in
`docs/reviews/PROTOCOL.md`.

`_composeTurn` has **six** exits that return `null`:

| Exit | Line | Cause |
|---|---|---|
| flag off / no model / over budget | `server.js:10218` | configuration or budget |
| empty reply | `server.js:10324` | model returned nothing usable |
| grounding cage refusal | `server.js:10339` | the model invented an organisational specific |
| thrown | `server.js:10357` | rejected model id, auth failure, rate limit |

Every one falls through to `server.js:13957-13969`, which stitches deterministic sentences that
present themselves as ordinary IntelliQ prose:

- `"Thank you for telling me — that sounds like a lot to be carrying. It stays private with me, and I'm here."`
- `` `I can ${otherProps...} — say the word and I'll do it. Nothing happens until you confirm.` ``
- `'Noted. Tell me what you\'d like me to do with this, or ask me anything.'`

None of them says the reply is degraded.

**User consequence.** `render.yaml:19-20` sets `IQ_COMPOSER: "1"`, so the composer is on in the
deployed environment and the founder will demo the model voice. If the API key is rejected, the
org crosses its LLM budget mid-demo, or the grounding cage refuses one reply, the product does
not fail — it changes character, silently, mid-conversation, and keeps going. On stage there is
no way to tell "IntelliQ is reasoning" from "IntelliQ is reciting a template". That is the
opposite of the founder's one-voice law, whose third clause is that deterministic code *verifies*
the prose, not that it impersonates it.

**Mitigating fact.** The failure is not invisible to the operator. Each exit logs a distinct line
(`[composer] skipped —`, `[composer] refused —`, `[composer] threw:`) and increments a distinct
metric (`composer_off`, `composer_skipped`, `composer_empty`, `composer_refused`,
`composer_error`, `composer_used`) — `server.js:10222, 10326, 10341, 10356`. The diagnosis exists.
Only the person reading the screen is not told.

**Smallest safe correction.** Two options, and the choice is the founder's:

1. **Mark it.** Have the deterministic branch set a flag on the response (`degraded: true`) that
   the client renders as a quiet line — not an error, a statement. Smallest possible change; no
   prose is rewritten.
2. **Speak it.** Use `composer.degradeLine(topic)` in the one case the deterministic branch
   currently answers with `'Noted. Tell me what you'd like me to do with this...'` — the branch
   that fires when there is no insight, no action, no answer and nothing sensitive. That is the
   case `degradeLine` was written for, and it is where the template is least honest.

I recommend (1) for the pilot and (2) after it. (2) alone still leaves the other five branches
speaking in the normal voice.

**Test that should prove it.** Force each of the six exits and assert the response carries the
degraded marker. Mutate by removing the marker from one exit and confirm that exit's assertion
goes red — six mutations, six independent bites, because a single shared assertion would let five
of the exits regress unnoticed.

**Overlaps PR #84?** No.

---

### BLOCKER 3 — LIB-2: there are two products called Library, and the button opens the old one

**This is a founder decision, not an implementation. I have not chosen.**

**Evidence, read.**

Two complete systems coexist on `main`:

| | Old Library | New shelf |
|---|---|---|
| Store | `libraryItems` / `_libItems` (`server.js:13056`) | `shelfFilings` / `_shelfOf`, `ai/shelf.js` |
| Routes | `/api/library`, `/api/library/from-chat`, `/api/library/:id` (`server.js:16767-16840`) | `/api/library/shelf` (`server.js:14263-14310`) |
| Client | `window.IQLib`, `libLoad`, `libRender`, `libMove`, `libShare`, `libDelete` (`js/app.js:5903-6008`) | `MemberApp._renderShelf` etc. (`js/app.js:8908-9040`) |
| What it stores | a **copy** — `title`, `body` up to 20,000 characters | a **reference** — kind and id, resolved live |
| Sharing | `visibility: 'shared'` — grants other people a read | grants nobody anything |
| Reached from | the Today header button labelled **"Library"** (`js/app.js:5543`) | the member Notes page (`index.html:910`) |

They share one folder namespace. `_libFolders` backs both, and `/api/library/folders` returns
`itemCount` computed from `_libItems` (`server.js:14186`) while the shelf page reads `count` from
`shelf.view`. Each page reads its own field, so neither displays a wrong number — but one folder
named "Shooting" appears on both surfaces meaning two different things.

**User consequence.** The Today header button reads
`title="Your Library — folders, notes, saved chats"` and opens the copy-taking system. The comment
above the new shelf (`js/app.js:8955`) records the founder's own reasoning for building it —
*"won't conversations, focuses save on their own?" They do. So the Library stops saving and starts
INDEXING* — and the old system, which saves, is the one behind the button named Library.

**The decision.** Retire the old Library (retiring `/api/library`, `from-chat`, notes, and shared
visibility with it), or keep both and rename one. This removes or renames a whole surface and
changes what "keep" means to a user, so per the standing rule I am stopping on it rather than
choosing.

**If the answer is "retire it":** the smallest safe correction for the pilot is to repoint
`js/app.js:5543` at the shelf and leave the old routes in place, dark, until after 26 September.
Deleting the store during pilot week risks data that already exists.

**Overlaps PR #84?** No.

---

### BLOCKER 4 — MAT-1: the material picker offers file types it will always refuse

**Evidence, read.**

`js/app.js:11469` sets the material file input's accept list to `AttachmentHandler.ACCEPT_ATTR` =
`image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv` (`js/attachments.js:43`).

`attachMaterial` (`js/app.js:11484-11512`) sends `parsed.content`. Of the seven processors:

| Kind | Returns text? | Line |
|---|---|---|
| docx | yes | `js/attachments.js:105` |
| xlsx | yes | `js/attachments.js:126` |
| pptx | yes | `js/attachments.js:157` |
| text | yes | `js/attachments.js:172` |
| csv | yes | `js/attachments.js:185` |
| **pdf** | **no** — base64 only | `js/attachments.js:76-87` |
| **image** | **no** — base64 only | `js/attachments.js:63-74` |

So a picked PDF or image reaches
`if (!text.trim()) return say('No text came out of that one...')` and is refused after selection.

I initially suspected pptx and xlsx were dead too; they use shorthand properties (`content,`
rather than `content: content`) and are fine. **PowerPoint attach works** — the founder's stated
scouting-deck case is intact.

**User consequence.** The picker invites a PDF, the user selects one, and the product then
explains it cannot read it. Scouting reports and opposition analyses are overwhelmingly PDFs. The
refusal message is honest and well written; the problem is that the picker offered the file in the
first place.

**Smallest safe correction.** One line: give the material input its own accept list
(`.txt,.md,.markdown,.csv,.docx,.xlsx,.pptx`) instead of borrowing the chat composer's, which
legitimately accepts images and PDFs because the chat path sends them to the model as document
blocks. Do **not** widen `ACCEPT_ATTR` — the chat path needs it as it is.

**Test that should prove it.** Assert the material input's accept attribute contains no `.pdf` and
no `image/*`, and that every extension it does list maps to a processor returning `content`.
Mutate by adding `.pdf` back and confirm red.

**Overlaps PR #84?** No.

---

## Must verify before pilot

These cannot be settled by reading source. Each needs a real device, a real deploy, or a founder
answer.

1. **HOME-1 — is there a second thing on Home?** `_renderMeContext` (`js/app.js:7742`) writes
   recognition cards ("You were noticed") into `me-recognition`, and `index.html:781` does **not**
   mark that element `hidden` — unlike `me-noticed`, `me-questions` and `me-prepared`
   (`index.html:799-801`), which are hidden. So Home may render greeting + workspace + a
   recognition strip. If it does, that is a second thing on Home, and "HOME IS ONE QUESTION" says
   there may not be one. **Verify in a browser; if present, this is a founder decision, not a bug
   report.**

2. **COMPOSER-LIVE — is the model actually answering in the deployed environment?**
   `render.yaml:19-20` sets `IQ_COMPOSER: "1"`, but the flag being on is not the model being
   reachable. Check the deployed logs for `[composer] used` versus `[composer] skipped — no model
   configured` before the demo. If the key is absent or the org is over budget, every reply on 26
   September is the deterministic voice, and per BLOCKER 2 nothing on screen will say so.

3. **Real-device behaviour on iPhone.** Carried forward as explicitly OPEN. Still OPEN — nothing
   in this audit ran in a browser.

4. **Library shelf controls on a real device.** Carried forward as explicitly OPEN. Still OPEN.
   Note that BLOCKER 1 means the folder controls cannot be meaningfully device-tested until the
   move control exists.

5. **The 29 tap targets and their re-measurement.** Carried forward as explicitly OPEN. Still
   OPEN — not re-measured.

6. **Whether the ownership finding creates actual data exposure rather than only incorrect
   permissions.** Carried forward as explicitly OPEN. Still OPEN, and deliberately untouched: it
   belongs to the PR #84 lane.

---

## Safe to defer

None of these has a user consequence at the pilot. Several are the residue of decisions that were
made correctly and then not swept up.

1. **`_loadIntelliQRecord` is never called.** `js/app.js:8024`, roughly sixty lines fetching
   `/api/me/record`, with no caller anywhere in `js/app.js`. Dead.

2. **`_renderWeeklyPrompt` renders into an invisible container.** `js/app.js:8086` writes into
   `home-weekly-prompt`, declared `style="display:none"` at `index.html:808`. It is called
   (`js/app.js:8331`) and its output cannot be seen.

3. **`home-stat-row` and `home-focus` are referenced nowhere.** `index.html:805-806`. Dead DOM
   from before HOME IS ONE QUESTION.

4. **`me-questions` and `me-prepared` are written but hidden.** `_renderMeContext` builds "Still
   open for you" and the prepared list (`js/app.js:7787-7800+`) into elements marked `hidden` at
   `index.html:800-801`, and nothing removes the attribute.

5. **Home fetches `/api/me/context` and discards most of it.** `js/app.js:7752` on every Home
   render, after which `briefEl.innerHTML = ''` (`js/app.js:7767`) and `notEl.innerHTML = ''`
   (`js/app.js:7784`) deliberately blank the two surfaces the response was built for, with
   comments explaining that the Attention surface owns them now. One round-trip per Home render
   on a phone, for a payload that is mostly thrown away.

6. **A stale comment stack contradicts itself.** `server.js:15216-15236` carries three generations
   of comment about the same rule. The second says *"WHAT IS ACTUALLY WIRED: ... a personal focus
   with people invited satisfies the founder's rule but has no route behind it"*. The third says
   *"THE GAP IS CLOSED."* The third is correct — `/api/forum/:kind/:objectId` exists at
   `server.js:15472` and the client routes to it correctly via `forumKind`
   (`server.js:15241`, `js/app.js:11696`). A reader must reach the bottom to learn the first two
   paragraphs are false.

7. **Deleting a folder orphans shelf filings.** `server.js:14212` clears `folderId` on `_libItems`
   only. Shelf entries keep a `folderId` pointing at a folder that no longer exists. They remain
   visible under "Everything", so nothing is lost; they are simply unreachable by chip. (Moot
   until BLOCKER 1 is fixed, since no shelf entry can currently hold a `folderId` at all.)

8. **A third meaning of "library".** The duplicate-material response says *"This is already in
   your library"* (`server.js:16204`), where "library" means neither the old Library nor the
   shelf — it means the org's material store.

9. **An empty span sized for a removed emoji.** `js/app.js:8091`:
   `<span style="font-size:var(--fs-3xl)"></span>`. Correct under the no-emoji law; leaves an
   empty element holding space.

**Explicitly not a defect.** The personal focus routes — create (`server.js:5710`), tried
(`server.js:5913`), outcome (`server.js:6004`) — write no `_audit` entry, while the group
equivalents (`server.js:14760`, `14798`) and `/api/me/focus/:id/visibility` (`server.js:5987`) do.
This looked like an inconsistency and is not one. `_audit` is a disclosure and emission trail with
a closed vocabulary — `audit.record` returns null for an unrecognised action (`server.js:11261`)
— and the routes that audit are exactly the routes that change who can see something. A person
recording their own attempt at their own focus discloses nothing. The absence is the law working,
not a gap in it. I record this because it was raised as a finding in the parallel lane and, on
this reading, should not be actioned.

---

## One-voice audit

The law is DETERMINISTIC CODE DECIDES → THE LLM WRITES THE USER-FACING PROSE → DETERMINISTIC CODE
VERIFIES THE PROSE. All three clauses are implemented. The gap is in what happens when clause two
does not run.

**Clause 1 — decides.** Intact. `_composeTurn` retrieves through the existing scoped paths
(`_reasonScopedAgenda`, `_retrieveGrounding`, the person's own assigned work, `_professionals`) and
hands the model a bundle it did not choose.

**Clause 2 — writes.** Behind `IQ_COMPOSER` (`server.js:707`), on in deploy (`render.yaml:19-20`).
The gate is deliberately wide (`server.js:13950`): every turn with text goes to the composer
except an explicit command carrying its own payload.

**Clause 3 — verifies.** `composer.verifyGrounding` (`ai/composer.js:215`) checks three classes of
invented organisational specific — a roster name not in the context, a quoted title that does not
exist, a count claim whose number is absent — and the caller refuses the reply on any violation
(`server.js:10336-10341`). The cage is honest about its own limit: it does not attempt to check
open-domain football knowledge and says so.

**Deterministic prose still in normal operation.** Counted on `main`:

| Location | Literals | User-facing in model-on operation? |
|---|---|---|
| `ai/voice.js` | 47 | Yes — phrase bank, by design |
| `server.js` `note:` / `reason:` / `hint:` / `message:` fields | ~155 | Mostly route responses and card metadata, not turn prose |
| `ai/present.js` | 9 | Yes — card composition, deliberate |
| `ai/proactive.js` | 7 | Yes |
| `ai/stance.js` | 6 | Yes — record / reading / recommendation framing |
| `ai/behaviour.js` | 3 | Yes |
| `ai/chart.js` | 1 | Refusal note only |
| `server.js:13957-13969` turn fallback | 4 sentences | **Only when the composer did not run** |

The first six rows are legitimate. They are card furniture, framing and labels — structure, not
the assistant's reply — and moving them to the model would put prose that must be identical every
time behind something that varies. They should stay deterministic.

The last row is the one that matters, and it is BLOCKER 2. It is the only place where a
deterministic sentence stands in for the assistant's own reply while claiming its voice.

**Model-off fallback: not clearly degraded.** Confirmed. See BLOCKER 2.

---

## Attachment audit

Five file inputs, four different accept lists:

| Input | Location | Accepts | Goes to |
|---|---|---|---|
| `ob-import-file` | `js/app.js:3276` | `.csv,.xlsx,.xls` | roster import |
| `iqc-file-*` | `js/app.js:4280` | `image/*,.pdf,+7` | chat composer |
| `kn-file` | `js/app.js:5348` | `.txt,.md,.markdown,.csv,.json,.pdf,.doc,.docx` | knowledge |
| `iqt-mat-file` | `js/app.js:11469` | `ACCEPT_ATTR` (all) | **`/api/materials`** |
| `iq-attach-input` | `js/app.js:11777` | `.txt,.md,.markdown,.csv,.json,.pdf,.doc,.docx` | `wsAttach` |
| `acm-file-input` | `index.html:1220` | `image/*,.pdf,+7` | alert composer |

Three of these accept `.json` and `.markdown`, which `AttachmentHandler.ACCEPTED`
(`js/attachments.js:17-32`) does not map — a `.json` file picked there throws
`Unsupported file type`. Two accept `.pdf` on paths that cannot read a PDF. Only the material
input is a pilot blocker (BLOCKER 4) because it is the one a coach will reach for on the day; the
rest are deferrable.

**Server side is sound.** `POST /api/materials` (`server.js:16172`) validates the attach target
kind, resolves the object through `_allObjectsFor` (so it cannot be attached to something the
user cannot see), enforces `_mayAttach`, caps text at `material.TEXT_CAP` with a 413, refuses an
empty segmentation, and deduplicates by checksum so the same deck attached twice is one document
with two refs rather than two records — with the engagement staying attached to the one document.
`L-MT2` holds: `POST /api/materials/:id/engaged` refuses an unrecognised state rather than
coercing it. Nothing here is broken.

---

## Library audit

Covered in full at BLOCKER 1 (folders unreachable) and BLOCKER 3 (two Libraries), with the folder
orphan at deferred item 7 and the third meaning of the word at deferred item 8.

What is right and should not be touched: the shelf stores a reference and never a copy; the empty
state distinguishes an empty folder from an empty library and says so
(`js/app.js:8975-8978`); `POST /api/library/shelf` checks the thing is readable by the person
filing it *before* storing the reference, explicitly to stop the route becoming an existence
oracle (`server.js:14270-14276`); `DELETE` says "Taken off your shelf. Nothing was deleted."
Those are the load-bearing decisions and they are all correct.

---

## Graph audit

**Not broken.** `ai/chart.js` (299 lines) builds three governed shapes — `firming`, `timeline`,
`spread` — over a frozen kind list, a frozen unit list and frozen band steps. `governChart`
(`ai/chart.js:201`) decides whether a chart may be drawn at all and `refusalNote`
(`ai/chart.js:278`) explains a refusal in words. The route `/api/objects/:kind/:id/chart`
(`server.js:16584`) builds from the record, governs, and returns `chart: null` plus the refusal
note when the governor says no (`server.js:16598-16600`). The client reaches it:
`_renderChart` (`js/app.js:11379`) fetches that exact path and is called from the object thread
(`js/app.js:11242`). `chart.js@4.4.3` is loaded (`index.html:52`).

The spread chart carries `cohort` and `floor`, so the cohort floor travels with the picture rather
than being applied only upstream of it. No finding.

---

## Citation audit

**Internal citations: not broken.** The deterministic path carries `qa.citations`
(`server.js:11089, 13997`) and the client renders them (`js/app.js:11356`). When the composer
takes over, `groundedClaims` and `inferred` are deliberately emptied — because they are the raw
material the model reasoned over, not what it said — and the basis is instead returned as
`sources` from the four retrieval channels (`server.js:10352-10357`). The client renders those
(`_sourcesHTML`, `js/app.js:9774, 10341, 11840, 12451`). The comment at `server.js:10345` is
correct that this closes a real hole: previously the better the answer, the fewer citations it
carried. Both paths now show their basis.

**External citations: wired and constrained.** `ai/websearch.js` is required at `server.js:65`
and used at `server.js:15377-15406`. The query is *derived* (`websearch.deriveQuery`) and then
checked by `websearch.isComposed` before it is issued — a query the module did not compose is
refused rather than sent. `ai/gateway.js:464` records why: the module has no parameter through
which a person's words could reach the outside. The answer comes back through
`websearch.answerFrom` and is returned with `citations` and `kind: 'advice'`
(`server.js:15410`). No finding.

---

## Forum audit

**Not broken.** Two rooms, one policy.

- Group inquiry rooms: `/api/group/:nodeId/forum/:inquiryId` (`server.js:15285-15340`, contribute
  at `15532`).
- Object rooms: `/api/forum/:kind/:objectId` (`server.js:15472-15510`).

Both resolve membership first and gate on it. `_forumRoom` returns 403 `not part of this` when the
caller is not a member (`server.js:15455`), `_roomAccess` reuses the same `inNode` predicate
`ai/forum.js` already reads (`server.js:15461`) rather than inventing a second one, and both read
and post re-check via `forum.mayRead` / `forum.mayPost`. The thread is capped
(`forum.THREAD_CAP`), edits are restricted to the author's own speech, and every read carries the
line that matters: *"Nothing said here counts as evidence unless its author deliberately offers it
as their account."* `epistemicEffect: 'none'` is returned on post. Speech does not become evidence
by being said, which was the whole point.

The client picks the right room: the server returns `forumKind` (`server.js:15241`), the client
passes it as `room` and `_forumURL` (`js/app.js:11696`) branches once, in one line. An invited
personal focus reaches `/api/forum/focus/:id`; a group thread reaches the node route. The founder
rule (two or more people means a forum) and what is reachable now agree.

Only finding: the contradictory comment stack, deferred item 6.

---

## Inquiry audit

**Not broken.** The routes are complete: pending (`server.js:11576`), dismiss (`11593`),
recommendations (`12795`), group inquiry (`14720`), lead (`14994`), list (`15683`), thread
(`15744`), plus the forum routes above. `ai/present.js inquiryCard` composes the band union
correctly after the fix landed in #80.

One observation carried to the PR adjudication rather than treated as a defect here: the origin
shaping

```js
independentOrigins: new Set(active.filter(s => s.originRef).map(s => s.originRef)).size,
contested: inq.status === 'disputed' || active.some(s => s.dissents)
```

appears **verbatim twice**, at `server.js:15599-15606` (`GET /api/me/calls`) and
`server.js:15633-15636` (`POST /api/me/call`). Two descriptions of one rule always drift. This is
exactly what PR #84 centralises into `ai/diagnose.js`, which is the argument for that PR
independent of anything in its own review.

---

## High-Low audit

**Not broken, and correctly defended.** The four gates hold. `/api/me/calls`
(`server.js:15594`) filters to beliefs that pass `teamState.readyForCall(shaped)` before offering
the question, so a call cannot be made on something that has not met the floor. `/api/me/call`
(`server.js:15622`) validates the valence against exactly `working_well` / `worth_attention` /
`null` and 400s anything else — direction is declared, not inferred, and the lexicon has not
crept back in through this door.

Ruling 2 is enforced at the route as well as in the kernel (`server.js:15640` onward): withdrawing
a call cannot be used to clear a Low the evidence raised. The comment states the reason — *"it's
dangerous if a person decides what their baseline is"* — and the code matches it.

The question asked is *"Is this working well, or worth attention?"*, about the thing, never about
the person (`server.js:15615-15616`). That framing is a law and it is held.

---

## Focus audit

Excluding the PR #84 ownership work, as instructed.

**Not broken.** Personal focus: create (`server.js:5710`), source (`5875`), tried (`5913`),
visibility (`5987`), outcome (`6004`). Group focus: create (`14760`), outcome (`14798`). The
audit-entry asymmetry between them is explicitly not a defect — see the note at the end of the
deferred section.

`/api/me/focus/:id/tried` writes the attempt, sets `askedAt`, updates `mem.lastUpdated` and calls
`scheduleSave()`, so durability holds.

---

## Composer-button audit

`js/app.js` carries 328 `onclick=` handlers and three composer instances (`js/app.js:10284`
workspace, `11238` object thread, `11730` forum), all built by one `_composerHTML`
(`js/app.js:11770`) so they cannot drift.

The object thread — the densest surface — offers five verdict buttons plus back plus forum:

| Control | Line | Could the composer do this? |
|---|---|---|
| Work on this | `11199` | Yes, but it commits state; a button is the right shape for a commitment |
| Keep | `11207` | Yes — "keep this" is a sentence |
| That's settled | `11208` | Yes |
| I disagree | `11209` | **No — keep.** Contesting must be unambiguous and recorded as such |
| Not now | `11210` | Yes |
| Forum | `11234` | Navigation, not speech. Keep |

Three of the five verdicts (Keep, That's settled, Not now) are things a person would more
naturally say than tap, and the composer is already on the same screen. That said: **this is a
product-shape decision, not a defect**, and it is not pilot-blocking. A tap is faster than typing
on a phone, and the founder works from an iPhone. I record the analysis and recommend no change
before 26 September.

The one control that should be added rather than removed is the folder control from BLOCKER 1 —
which is the opposite of "less buttons", and is correct, because filing into a named folder is a
choice among existing names, not a sentence.

---

## Deterministic hiccups reproduced

`npm test` — 222 suites — **GREEN, exit 0**, run in full on `5683df3` for this audit.

No new failing test was found, and none was manufactured. The hiccups below are the ones that do
not show up as a red test, which is the category the brief asked for:

1. **Six silent composer exits produce four indistinguishable template replies.** Reproduced by
   reading every exit and the single fallback branch they all reach. BLOCKER 2.
2. **A folder that can never contain anything.** Reproduced by exhausting the call sites of
   `fileToShelf`. BLOCKER 1.
3. **A file picker that offers what it refuses.** Reproduced by matching `ACCEPT_ATTR` against the
   processor table. BLOCKER 4.
4. **A Home render that fetches, computes and discards.** Reproduced by tracing
   `_renderMeContext` to the two `innerHTML = ''` statements and the three `hidden` targets.
   Deferred items 4 and 5.
5. **A dead function that still costs a reader.** `_loadIntelliQRecord`, no callers. Deferred
   item 1.

The reason none of these is red is consistent: **every one of them is a door, and the suites test
rooms.** `shelf-http-smoke` proves the shelf route accepts a folder. `composer-smoke` proves
`degradeLine` returns good prose. `material-smoke` proves segmentation. All true; all silent about
whether a person can reach any of it. The protocol's definition-not-call family is the same
mistake at a smaller scale, and this audit found its seventh instance.

---

## Open PR adjudication

Fifteen open. Ahead/behind measured against `main`.

**Still valuable — 2**

- **#84** `codex/review-r1` (ahead 8, behind 0). Centralises origin identity into `ai/diagnose.js`.
  The duplication it removes is real and I found it independently at `server.js:15599` and
  `15633`. Under correction in the parallel lane; untouched here by instruction.
- **#85** `claude/platform-work-summary-nmb0cm` (ahead 1, behind 0). The `AGENTS.md`
  report-deliverable carve-out. Small, mine, and the reason this document can exist without
  tripping the green-before-merge rule.

**Close — 13**

- **#81** `codex/ci-history-checkout` (ahead 1, behind 3). **Superseded.** The `fetch-depth: 0`
  fix it proposes is already on `main`, applied via #80. Closing it costs nothing.
- **#75** (behind 185), **#74** (208), **#73** (212), **#67** (232), **#66** (232), **#65** (232),
  **#64** (244), **#63** (232), **#62** (232), **#59** (241), **#58** (244), **#12** (behind 278,
  ahead 351). Every one is between 185 and 278 commits behind. Rebasing any of them is a rewrite,
  not a merge. Most of what they proposed reached `main` independently — `ai/language-guard.js`,
  `ai/outcome-intelligence.js`, `ai/org-context.js`, `ai/primitives.js`, and the
  `authority-truth`, `language-guard`, `outcome-intelligence`, `web-intelligence` and
  `persistence-durability` suites are all on `main` today.

**Harvest before closing.** Four ideas in that set are genuinely absent from `main` and should be
recorded as R&D notes rather than lost with the branches:

| Idea | PR | Why it is worth keeping |
|---|---|---|
| `ai/refusal.js` | #64 | A first-class refusal object, rather than refusal encoded as a null return |
| `ai/evidence-class.js` | #62 | Typing evidence by class rather than by shape |
| prediction-boundary tests | #58, #59 | Asserts where the system may not predict |
| no-LLM harness test | #74 | Proves the product is coherent with the model off — directly relevant to BLOCKER 2 |

The last of those is the most immediately useful: a suite that runs the product with the model off
and asserts the replies are *marked* as degraded is exactly the test BLOCKER 2 needs.

---

## Proposed PILOT_CLOSURE.md

```
# Pilot closure — Alma College Men's Soccer, 26 September 2026

Closed scope. Nothing enters this list after 12 September without displacing something on it.

## Fix
1. LIB-1  Shelf row gets a folder control; Keep files into the open folder.
2. VOICE-1 Every composer exit marks the reply degraded. Six exits, six assertions.
3. LIB-2  FOUNDER DECISION: retire the old Library, or rename one of the two.
          If retire: repoint the Today header button at the shelf. Leave the old
          routes dark until after the pilot. Do not delete the store in pilot week.
4. MAT-1  The material file input gets its own accept list. Do not widen ACCEPT_ATTR.

## Verify
5. Is there a recognition strip on Home? If yes, founder decision.
6. Is the model actually answering in deploy? Read the composer metrics before the demo.
7. Real-device behaviour on iPhone.            [OPEN]
8. Library shelf controls on a real device.    [OPEN — blocked on 1]
9. The 29 tap targets, re-measured.            [OPEN]
10. Whether the ownership finding is exposure or only permissions. [OPEN — PR #84 lane]

## Not in scope
Everything in "Safe to defer" in PILOT_CLOSURE_AUDIT.md. Everything in R&D_DIRECTION.md.
Reshaping the object-thread verdict buttons.

## The rule
npm test green before anything merges. No finding is fixed by weakening a test.
```

---

## Proposed R&D_DIRECTION.md

```
# R&D direction — after 26 September

Not a queue. A record of what was set down deliberately, and why.

## Harvested from closed PRs
- ai/refusal.js — refusal as a first-class object, not a null return.        (from #64)
- ai/evidence-class.js — evidence typed by class, not by shape.             (from #62)
- prediction-boundary suite — assert where the system may not predict.  (from #58, #59)
- no-LLM harness suite — prove the product is coherent with the model off.  (from #74)

## Raised by the pilot-closure audit
- The one Library. Retire the copy-taking store, migrate anything in it, remove
  /api/library, from-chat, and shared visibility. Whole-surface removal; not pilot work.
- Home, swept. Remove home-stat-row, home-focus, home-insight, home-weekly-prompt,
  _loadIntelliQRecord, and the discarded half of /api/me/context. HOME IS ONE QUESTION
  should be true of the DOM, not only of what renders.
- The composer's honest voice. degradeLine is written and never called. Decide what the
  assistant says when it has nothing, rather than letting a template say something.
- One accept list, derived from the processor table, so a picker can never offer a file
  type that will be refused after selection.
- Doors, not rooms. Every route-level suite in this repo should be paired with an
  assertion that a person can reach it. This audit found four features that work and
  cannot be used.

## Standing
Nothing here is scheduled. Nothing here displaces pilot scope.
```

---

## What I could not verify

- **Anything requiring a browser.** No page was rendered. HOME-1, the tap targets, and the shelf
  controls on a device are all read-only findings and are listed as verification items, not as
  defects.
- **Anything requiring the live model.** The composer was not exercised against a real API. The
  grounding cage was read, not run against model output.
- **Anything requiring the deploy.** `render.yaml` says `IQ_COMPOSER=1`; whether the model key is
  present and the org is within budget on the deployed instance is unknown from here.
- **The PR #84 ownership question**, deliberately — it belongs to the parallel lane and was not
  re-examined. The origin duplication I found at `server.js:15599` and `15633` is offered as
  independent support for the PR's existence, not as a review of it.
- **The twelve stale PRs' diffs in detail.** I compared them by ahead/behind and by whether their
  central modules exist on `main`. I did not read all 351 commits of #12.
- **Whether the demo seed data still produces Highs and Lows** after the changes merged in #80 and
  #83. The seed script exists (`scripts/demo-walkthrough.js`) and was not re-run for this audit.

---

## Counts

- **PILOT BLOCKERS: 4** (LIB-1, VOICE-1, LIB-2, MAT-1 — one of which, LIB-2, is a founder
  decision rather than an implementation)
- **PILOT VERIFICATION ITEMS: 6** (of which 4 were already carried as OPEN and remain OPEN)
- **SAFE-TO-DEFER ITEMS: 9**
- **OPEN PRS TO CLOSE: 13**
- **OPEN PRS STILL VALUABLE: 2**

## Verdict

**PILOT CLOSURE IS FINITE.**

Four blockers. Three are mechanical and small — a control on a row, a marker on a response, an
accept attribute. The fourth is a decision only the founder can make, and it can be settled in a
sentence with the implementation deferred until after the pilot. The verification list is six
items, four of which were already known to be open. No blocker touches ontology, privacy law,
epistemic law, or the tenant boundary. The suite is green and no finding here asks for it to be
weakened.

The scope is closed and it fits in the time remaining.
