# Conversation as a capability

**Status:** architecture note. Refines `product-compression-and-forum-intelligence.md` §D and
`lab-and-deliberate-development.md` §I. Nothing implemented.

**Verdict: the synthesis is right, it makes the roadmap smaller, and it removes the one proposal I
refused last round. One line of it does not hold — and the reason is the same reason the founder's
own worked example is already in the correct order.**

---

# 1 · What this resolves

Last round I refused free-topic Forum threads. `ai/forum.js:35` states it plainly:

> *"an unanchored thread is a place where a topic can accumulate apparent importance without ever
> passing the evidence boundary."*

My proposed fix was to separate the container from the anchor and make the contributor choose a
subject at the door. **The founder's version is better and needs no such surgery**: a thread is
always attached to an object that already exists, so it is always anchored. The invariant survives
untouched — the anchor set simply grows from one kind of thing to four.

That is worth stating as a plain win: *conversation is a capability, not a destination* removes an
architectural concession I was prepared to make.

It also collapses two roadmap items into one. Forum participants
(`product-compression` §D.3, deferred to P1) and Lab participants (`lab-and-deliberate-development`
§I, P1) were the same feature described twice. They are now one build.

---

# 2 · The finding that decides the shape

**Two of the four objects can carry a conversation. Two cannot, and it is not a matter of
plumbing.**

| Object | Stored? | Where |
|---|---|---|
| Inquiry | **yes** | `inquiryStates[code][subjectRef]` |
| Focus | **yes** | `mem.focuses`, `server.js:1071` |
| High | **no — derived on every read** | `_proactiveInsights`, `server.js:4155` |
| Low | **no — derived on every read** | same function |

A High or Low is a **projection**, recomputed from kernel findings each time
`/api/proactive/insights` is called. Nothing about it is persisted. The only things stored *about*
an insight are `insightSuppression` (a mute list keyed by `dedupeKey`, `server.js:4103`) and
`noticeFeedback` (per-type counters, `server.js:3486`).

Two consequences, both confirmed by reading the code rather than inferred:

**2.1 · The existing High/Low conversation binding lives in the browser.**
`_cardThreadsLoad` / `_cardThreadsSave` (`js/member-view.js:2854-2855`) keep the
`dedupeKey → conversationId` map in `localStorage`. The conversation survives on the server; the
link from the insight to it does not. Clear the cache and the thread is orphaned. That is fine for
a private card thread and unacceptable for a shared one.

**2.2 · Assistant conversations are structurally self-scoped.**
`assistantConversations` is keyed by `_wsKey(code, userId)` — `${orgCode}:${userId}`
(`server.js:8108`, `10976`). **A shared thread cannot be an assistant conversation.** It would have
to be a `forumThread`, which is org-partitioned and anchored — which is exactly the store built for
it.

So the two conversation machineries are not interchangeable, and which one applies is decided by
whether the object is durable and whether the thread is shared:

```
private thread on a derived object   →  assistant conversation (exists, localStorage-bound)
shared  thread on a durable object   →  forum thread            (exists, has the evidence door)
shared  thread on a derived object   →  nothing can hold it
```

---

# 3 · Why the founder's own example is already correct

From the proposal:

> You open a Low → talk to IntelliQ privately → **Work on this** → creates a Focus → **Invite
> Coach** → a shared thread appears.

The invitation happens *after* the Focus exists, not on the Low. That ordering is not a stylistic
choice — **it is the only one the architecture permits**, for the reason in §2. Promotion to a
durable object is what makes a shared conversation possible at all.

Which means the closing line of the proposal is the one thing that does not hold:

> *"A High can invite a coach to nurture it. A Low can invite someone to help."*

Inviting someone into a High or a Low would be inviting them into a recomputation. There is no
object there to hold a participant list, and the thread that appears to hang off the card is a
browser key pointing at a private conversation.

**The correction is small and preserves the intent entirely:** a High or Low can be *talked
about* privately, and **inviting someone is what turns it into a Focus.** The invite gesture and
the "Work on this" gesture are the same gesture. That is arguably a better product — there is one
way to make something collaborative, and it always produces a durable thing that remembers.

---

# 4 · The second finding: what an invited person sees

`ai/proactive.js:273` empties `basis` for a leader audience, and `audienceSafe` re-checks it at
303. A self-audience insight may legitimately carry specifics — it is the person's own evidence —
that the leader form of the same finding would never carry.

So: **if a coach is invited into work that originated from a self-audience High or Low, they must
receive the leader-audience projection of that finding, not the self one.**

The machinery already exists — `proactive.toInsight(finding, { audience: 'leader' })` produces it,
and `audienceSafe` proves it. What does not exist is any code path where an artifact computed for
one audience is re-rendered for another. Today that never happens because nothing is ever shared.
The moment invitation exists, it happens on the first invite.

This is the sharpest privacy defect that this design introduces, it is invisible until someone
invites a coach, and it is roughly one function call to prevent.

---

# 5 · What "Focus" now has to mean

The founder's model makes Focus the general container for deliberate work. That is broader than
`lab-and-deliberate-development.md` framed it, and I think the broadening is right — but it should
be said out loud, because it changes one thing.

The founder's earlier Forum examples were: *mental health support · Saturday game plan · first-year
attendance · product launch · retention concerns.* Under this model, a conversation that is not
about a High, Low or Inquiry has to attach to something — and the honest answer is that
**"Saturday game plan" is a Focus with no origin.** It is a thing people are deliberately working
on together. It is not development, and Focus should not be defined as development.

That resolves the "where do bare conversations live" question without a Messages destination, and
it means the single missing route identified in the Lab document —
**`POST /api/me/focus` with the user's own words** (`lab-and-deliberate-development.md` §R.1) — is
now load-bearing for the entire product model, not just for §6 of the Lab proposal.

**It also means "Lab" is probably the wrong word and `Focus` is the right one.** It is already the
word in the code, it does not imply development or deficit, and it survives being used for
"Saturday game plan" in a way "Lab" does not.

---

# 6 · The shell

`product-compression-and-forum-intelligence.md` §C proposed a shared container with a per-type
opening move and close action. `lab-and-deliberate-development.md` §M proposed sections that appear
only when they have content that changed. The founder's shell —
*title / status / participants / conversation / evidence / actions / resources / history* —
is the superset. The three combine cleanly:

> **One shell. A section appears when it has content. The object type decides which sections can
> ever appear.**

| Section | High / Low | Inquiry | Focus |
|---|---|---|---|
| Status | polarity + priority | `exploring → probable → supported \| disputed \| resolved` | `active \| done` + `helped \| no \| mixed` |
| Participants | **never** (§3) | yes | yes |
| Conversation | private only | shared | shared |
| Evidence | `basis`, audience-projected (§4) | `because`, `stillUnknown`, `alternatives` | outcome evidence |
| Actions | the proposal-gated suggestion | contribute, contest | try, assess, reflect |
| Resources | no | no | yes |
| History | no | `timeline` | attempts + outcomes |
| Close means | acted / muted | answered or contested | helped / didn't |

The differences are real and load-bearing — `lab-and-deliberate-development.md` §C.1 already warned
that a Focus must not reuse the reasoner's response verbs, because dismissing a question is not
the same act as suppressing a belief. One shell, four behaviours, no shared vocabulary where the
meanings differ.

---

# 7 · Net effect on the roadmap

**Removed:**
- Free-topic threads and the container/anchor split (`product-compression` §D.3). Not needed.
- Ad-hoc participant sets with no group subject — the hardest problem in that document. An object
  supplies the subject, so the problem does not arise.
- Forum as a destination, and with it the sixth navigation tab.

**Merged:** Forum participants and Focus participants are one feature.

**Promoted:** `POST /api/me/focus` moves from "the smallest missing piece for user-created Labs" to
the single route the whole model rests on. It was already first in
`lab-and-deliberate-development.md` §R.1 and is now unambiguously the first thing to build.

**Added, and both are cheap:**
1. A durable `dedupeKey → conversationId` binding, or the honest acceptance that a High/Low thread
   is private and browser-local until it is promoted to a Focus. **Prefer the second for the
   pilot** — it costs nothing and it is true.
2. The audience re-projection at the invite boundary (§4). Must land in the same change as
   invitation, never after it.

**Unchanged and still ahead of all of it:** P0-1, P0-2, P0-3, P0-D, P0-5 — five suites, 38 failing
assertions (`docs/briefs/p0-pilot-blockers.md`).

---

# 8 · Where I would still push back

**8.1 · "Everything important can become collaborative" is a stronger claim than it sounds.**
Every object that can carry participants is an object that can carry a durable record of who saw
what. Consent fixes ownership; it does not fix persistence. A coach invited into a Focus about
confidence under pressure has seen it, and leaving does not unsee it. That is honest and
acceptable — but it must be said *at the invite*, not in a settings page. The system already has
the right instinct one file over: `ai/contribution.js:132` refuses anything not `explicit`, on the
grounds that *"contribution must be deliberate, never automatic."*

**8.2 · Four shells that differ in eight ways is four shells.** The table in §6 is a real
simplification for the user and it is not much of one for the implementation. That is the correct
trade and it should be made with eyes open — the win is that the user learns one interaction, not
that the code gets smaller.

**8.3 · Focus becoming the container for all deliberate work makes it the busiest object in the
product**, and `mem.focuses` is currently an array on a memory profile with no id stability
guarantees beyond `foc_` + `generateId()`, no visibility field, and no participants. It is the
right place to grow, and it will need the same `rev` treatment P0-3 is adding to nodes and
inquiries the moment two people can write to one.

That last point is worth flagging now rather than later: **if Focus gains participants, it joins
the protected set in Decision B.** Not for the pilot — but the brief should not be widened later
by surprise.

---

# The short version

Conversation as a capability is right, and it removes the one thing I refused last round.

Two of the four objects can actually hold a conversation. Inquiries and Focuses are stored; Highs
and Lows are recomputed on every read, their thread binding lives in `localStorage`, and assistant
conversations are keyed to a single user by construction. So a shared thread needs a durable
object — which is why the founder's own worked example already invites the coach *after* creating
the Focus, and why the closing line about inviting someone into a High does not hold.

The correction makes the product cleaner rather than poorer: **inviting someone is what turns a
noticing into a Focus.** One gesture, one durable thing, one place that remembers.

And "Focus" is the better word. It is already in the code, and it survives "Saturday game plan" in
a way "Lab" does not.
