# High / Low / Inquiry / Forum end-to-end audit — R1

**Status:** read-only behavior audit; no production semantics changed  
**Branch:** `codex/pilot-recovery-gate-r7`  
**Audited against:** `7b1111fc2b5871ebc40eb28b31f6c093fe5153d4`

## Executive finding

High, Low and Inquiry are not three independent intelligence systems. At self and org-node/group grain they are projections over the same governed evidence/Inquiry machinery, with scope/admissibility applied before reasoning. The node/group implementation explicitly treats `group:<nodeId>` as a subject reference, not as a separate engine.

The current implementation is strong end-to-end for **individual** and **org-node/team/group** objects. It also supports **selected-person audiences** for personal High/Low/Inquiry and participant-scoped Focuses, but a selected audience is not itself a new epistemic subject. There is currently no equivalent canonical `org:<id>` High/Low/Inquiry object family in `_objectBucket`, and there is no first-class ad-hoc selected-cohort Inquiry/High/Low subject distinct from a personal object shared to selected people.

That distinction should be preserved rather than blurred.

## Individual grain

Working end-to-end:

`private conversation / onboarding / evidence -> member:<userId> inquiry/evidence -> governed standing -> High/Low/Inquiry projection -> object list -> object thread -> private Composer -> optional explicit audience -> optional Forum when 2+ current readers`

Important properties:
- personal evidence remains private by default;
- personal High/Low/Inquiry share the same object/audience machinery;
- High/Low/Inquiry may be shared by name without giving invitees the predecessor private conversation;
- an invited reader sees the same object projection, not a copied second object;
- withdrawing the audience removes access on the next read;
- an invited reader cannot re-share the object onward.

## Node/team/group grain

Working end-to-end:

`member private noticing -> private group candidate -> deliberate contribution -> independent-origin gate -> group:<nodeId> Inquiry -> direction/polarity -> High/Low/Inquiry surface -> object index -> private per-person object thread + governed Forum -> Focus -> outcome -> learning`

The key architectural proof is `scripts/group-subject-smoke.js`: Group is a SUBJECT, not an engine. It runs through the same Inquiry identity/confidence/correction machinery used elsewhere.

The group path specifically proves:
- membership does not automatically publish private speech;
- group relevance alone is insufficient; the contributor must deliberately contribute;
- a leader cannot publish a member's private account for them;
- repeated echoes of one origin do not become independent corroboration;
- independent origins can open/strengthen a group Inquiry;
- High/Low direction is carried by governed contributions/evidence rather than sentiment inference;
- correction/withdrawal recomputes the group read;
- private verbatim text does not appear on the group read;
- all of the group's live inquiries are indexed as objects, not only the one selected for the headline surface.

## Selected-member / ad-hoc audience grain

### What DOES exist

A personal Focus can have explicit participants. The canonical Focus owner resolves the audience, and selected invitees can read that Focus but not the private source conversation that produced it.

A personal High, Low or Inquiry can also be shared to selected named contacts through the common object-audience owner. The invited reader receives the same object, and a Forum becomes available once there are at least two current authorized readers.

This is a **read/collaboration audience**, not a new truth subject.

### What does NOT yet exist as the same object family

There is no first-class `selected:<audience>` or ad-hoc-cohort subject feeding its own evidence -> Inquiry -> High/Low path.

Therefore a High/Low/Inquiry shared with Tyler and Alex means:

> “this person's governed object is now readable/discussable by Tyler and Alex”

not:

> “IntelliQ has derived a collective High/Low/Inquiry whose empirical subject is exactly Tyler + Alex.”

If the selected people are represented by a real organization node, the existing `group:<nodeId>` path is the collective subject. If they are only an ad-hoc Focus audience, the Focus works, its Forum works, but that audience is not currently a separate epistemic grain.

Do not silently equate readership with subjecthood.

## Organisation-wide grain

The repository has organization-level state, memory, learning, reasoner and intelligence surfaces, but the four-object `_objectBucket` currently handles:

- `self`
- `group:<nodeId>`
- merged `all` over those authorized objects

It does not expose a canonical `org:<id>` Inquiry/High/Low subject family.

So the statement “individual, team and whole-organization Highs/Lows/Inquiries all run through the same four-object system” is **not yet proven true**. Whole-org intelligence exists elsewhere, but not as the same canonical High/Low/Inquiry object grain.

This is a real product-model gap if the founder wants explicit organization-wide High/Low/Inquiry objects for the pilot. It should not be patched by treating a root node as the organization unless that is deliberately ratified.

## Multiple private conversations

Yes. The server stores multiple private conversations per user and exposes:

- list conversations newest first;
- open a conversation;
- delete the user's own conversation;
- filter by `about=<object ref>`.

Home currently exposes **New** and **History** controls. A fresh chat gets a new conversation id; History lists prior chats and can reopen one for continued conversation.

Object threads are bound by `conversation.about === object.about`. The object thread reader currently selects the **most recently updated matching conversation** for that object.

This means multiple private chats are real, but the product does **not** currently have a persistent ChatGPT/Claude-style conversation sidebar. In fact, the front-end regression suite explicitly asserts the old sectioned sidebar navigation is gone.

A compact conversation-history rail/drawer could improve discoverability without changing truth architecture, but it is UX work, not a missing conversation store.

## Forum

Forum is structurally strong and has a real access point.

Current law:
- any High, Low, Inquiry or Focus with **2+ current authorized readers** has a Forum;
- one reader means no Forum;
- audience is re-resolved on every read/write;
- removal revokes immediately;
- Forum -> private object conversation may inform that object's context;
- private conversation -> Forum requires an explicit `share_to_forum` proposal, audience preview and confirmation;
- Forum speech is speech, not automatic evidence;
- private predecessor chat/material does not become readable because the Forum exists.

The object thread UI renders an inline SVG Forum control only when the server returns `forumAvailable === true`. It has an accessible `Open forum...` label and a minimum 44x44 tap target. The browser gate proves a user can confirm a share and another authorized member can read the resulting room.

## End-to-end verdict

### Strong / freeze
- individual High/Low/Inquiry;
- org-node/team/group High/Low/Inquiry;
- common Inquiry/evidence kernel;
- audience/privacy boundaries;
- private object conversations;
- group/object Forums;
- Focus origin/outcome linkage.

### Real gaps / do not paper over
1. explicit organization-wide High/Low/Inquiry objects are not currently the same canonical object family;
2. an ad-hoc selected-person audience is collaboration/readership, not a distinct collective truth subject;
3. conversation history exists but lacks a persistent ChatGPT/Claude-style navigation rail;
4. object thread opens the most recent matching private conversation rather than exposing all matching object conversations in a small thread-history selector.

These are product/UX/modeling decisions, not evidence that the existing self/group truth layers are broken.
