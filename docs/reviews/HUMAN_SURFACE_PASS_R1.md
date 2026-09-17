# Final human-surface + Composer + multimodal connection pass — report

**STARTING SHA** `72f2ca4c2d4cd64bbf5b07082e04ab2dc2e0af36` · **ENDING SHA** _(filled at the end)_
**Branch** `gpt/ab-decision-spine-r1` · **Not merged.**

Six commits. The brief named four areas and said that unfinished Settings, Library, Org Tree or
Composer surface work prevents YES. All four were attempted and all four landed. What follows
separates what was **measured on a rendered screen** from what was **read in source**, because
three of the four defects in this pass were invisible to source and two of my own claims during it
were wrong for exactly that reason.

---

## 1 · §A — The Composer is ever-present

**Before:** it was neither ever-present nor un-dominant. It was rendered inside `#page-home`'s own
template, so it belonged to a page rather than to the product. Driven as a brand-new member at
390px with nothing seeded:

| Page | Composer |
|---|---|
| Home | present, and the main event |
| Focus, Inquiries, Highs, Lows, Library, People, Settings | **absent** |

On seven of eight pages the way back to IntelliQ was to notice the menu and navigate Home. This
was not a bug in any function — every test passed, and the code even documented the arrangement
(`.iq-composer — Home, object threads, Forum`). It was a statement about where the door is.

**After:** the composer lives in `#iq-shell-composer`, a sibling of `<main>`, and navigation cannot
take it away. Two rules decide whether it is on screen, both about not asking one question twice:

- **A page that brought its own composer wins.** An object thread and the Forum each render one,
  and each sends somewhere different. On the Forum the difference decides *who reads what you
  type*, so two boxes on one screen is the most costly ambiguity in the product. The shell one
  stands down and returns on the way out.
- **A session that has ended stands it down**, which is `_sessionEnded`'s existing job.

It asks the DOM which composers are on screen rather than being told the route, so a new page with
its own composer needs no list updated here.

### Three defects this produced, all found by measuring rather than reading

1. **It rendered nowhere at all.** The first version guarded on `Auth.currentUser`, which is falsy
   in the ordinary signed-in case — so the composer disappeared from Home too. The guard was also
   unnecessary: the sign-in screen hides `#app` outright.
2. **It sat ninety pixels below the fold.** `position:sticky` does not hold it, because
   `.page-content` declares `overflow-y:auto` while `.main-wrap` is `min-height:100vh` — the box
   grows with its content and the *body* scrolls, so sticky pins to the bottom of a container
   taller than the screen. Measured on Settings at 390x844: `bottom = 934`. It is `position:fixed`
   now, with `--iq-shell-composer-h` reserving room below the page so the last card is never
   covered. Fixed rather than restructuring the scroll model, which is not a change to make for a
   bar.
3. **A stale microphone message followed the user everywhere.** The composer used to be rebuilt by
   every navigation, and the voice status line depended on that. With the rebuild gone,
   *"Microphone access was declined. You can allow it in your browser settings, or just type."*
   stayed under the composer on every page for the rest of the session. Caught by **PC-O2**
   measuring 31px where an empty line reserves nothing — an assertion written in an earlier pass
   about something else entirely.

### And one pre-existing bug it exposed

`_restoreChat` checked `box.children.length` **before** its `await` and wrote `innerHTML` after —
a check-before-await race. Anything written while the request was in flight was overwritten by a
restore of the same conversation *minus what the person had just said*. Reachable by typing
quickly on a freshly opened Home; much easier to hit now that asking from another page navigates
Home and writes immediately. It re-checks the live element after the await.

**Asking from another page lands somewhere visible.** The conversation lives on Home, so the first
working version sent the turn, rendered the reply correctly, and showed the person nothing. A send
that appears to do nothing is worse than a composer that was never offered.

**Pinned by** `pilot-coach-browser-check` **PC-S1–S8**: the composer present and *on screen* on all
eight member pages, the same words everywhere, no sideways scroll, exactly one composer inside an
object thread and it is the thread's own, the shell one returning on the way out, and a question
asked from Library landing in a visible conversation carrying the words actually typed.

---

## 2 · §H — The Library

Two separate pieces of work: the law underneath, and the surface on top.

### The law: a shelf entry is a reference, not a copy

`library-reference-http-smoke.js`, **17 assertions**, registered in `npm test`. The Library's whole
idea is "things I wanted to find again", and it rests on a property that is invisible when it works
and catastrophic when it does not. The copy-at-Keep-time defect fails three ways that all look like
the product working:

- the object is reworded and the Library shows the old text, so two screens disagree and the
  Library is the one people trust, because it is the one they chose to keep;
- permission is revoked and the copy stays readable — a privacy failure no audience check can
  catch, because nothing is being read from the object at all;
- the object is deleted and the entry is a ghost of something nobody can open.

The existing browser check covers filing, foldering and moving. Nothing covered what happens when
the world moves. Section **B** rewords the focus in place and asserts the Library shows the new
wording and not the old; **E** removes it and asserts the entry either drops out or says it is
unavailable — the property, not an implementation; **F** is the control that stops every other
assertion passing against a Library that renders nothing.

**D3 was caught on the first read as a duplicate of D2** — both asserted the same expression, so
the existence-oracle sentence proved nothing D2 had not. Refusing is not the property; refusing
*identically* is. An id that was never minted and a real id belonging to another team must come
back with the same status and the same reason, or the refusal enumerates another team's shelf one
guess at a time. Rewritten as D3/D4/D5.

**Mutations — four, all caught, each by the assertion that claims to own it:**

| Mutation against the production owner | Caught by |
|---|---|
| the Library keeps a copy of the wording at filing time | B2, B3 |
| a filed thing that has gone away keeps its row and its old words | E1, E2 |
| the filing route trusts the read gate later instead of checking now | D2, D3 |
| refusals differ — unreadable-but-real 403, never-existed 404 | **D4 only** |

The last one is the proof the D3 rewrite was load-bearing rather than cosmetic.

### The surface: the item's own words get the row

Measured, not read. At 390px the row is 369px wide and the item's own words had **153px** of it,
because a folder select (86px) and a Remove button (60px) sat beside them and never moved.

**Nothing was cut off — it wrapped**, which is worse to read and easier to miss: a one-sentence
focus became a **four-line ribbon 126px wide**, in the one surface whose whole job is recognising
something again at a glance. With the fix: **321px, two lines.**

> A correction to my own first claim here. I reported the labels as "truncated at about
> twenty-four characters". They were not; that was an artifact of my probe slicing text at 40
> characters. The defect is real and the numbers above are the measured ones.

Both neighbours are filing machinery — you pick a folder once and remove something once, while you
read the label every time the page opens. At phone width the row wraps, the words take the full
348px, and the two controls drop to a second line. Nothing hidden, nothing removed; only an
argument about which of them gets the space. `.shelf-x` borrowed its tap height from the tall card
beside it, so on its own line it states 44px itself.

**Pinned by** `library-browser-check` **B10–B10f**, including the half that stops this being won by
deletion: both controls must still be there and still be thumb-sized. **B10c first asked "is the
label cut off" and never failed** — it measures the wrap shape now, and fails when the fix is
reverted.

---

## 3 · The naïve-user test (§N)

A brand-new member, 390px, nothing seeded, no explanation given. What Sam actually reads:

| Page | First screen |
|---|---|
| **Home** | "Good afternoon / Sam", "No findings saved yet. As you talk, what IntelliQ works out will appear here.", the Private control, "Who can see what I say here?", and the group: *"Nothing has crossed the line into a group finding yet. That is a real answer, not an empty one — it means no pattern here rests on more than one account."* |
| **Focus** | "You are not working on anything yet. Start a focus when you want to change something." + the control |
| **Inquiries** | "Nothing being worked out yet. Talk to IntelliQ and it will start." |
| **Highs / Lows** | "Nothing has stood out as going well yet." / "Nothing needs attention right now." |
| **Library** | "Your library is empty. Open a focus, a high, a low or a conversation and choose Keep to put it here — it stays live, and this only remembers where it is." |
| **People** | their own node open to them, "First Team · 1 person · Sam" |
| **Settings** | "You", "This device", and the build both sides are running |

Every empty state says **why** it is empty and what would change it, and the group one refuses to
pretend that nothing found is nothing known. No page scrolls sideways at 390px. The composer is on
all eight.

---

## 4 · What I did not fix, and why

**The composer's Private/Public button does not reach the turn.** `_wsShare` is set by
`toggleVisibility` and read nowhere else — it is not in the `assistantTurn` request body and no
other code consults it. So the control beside the composer that appears to choose who can see what
you say has no effect on what is sent.

I am reporting this rather than changing it. The brief's own instruction is to stop and ask when a
finding materially changes privacy law, and giving that button an effect *is* a privacy-law change:
it would decide the visibility of everything a person types. Which way it should default, whether
it should persist across turns, and whether it belongs beside the composer at all are the founder's
questions, not mine. **This is the most significant open item in this report.**

Also unresolved and unchanged:

- **`chart-shape` CS-R1b**, pre-existing at the starting SHA.
- **A model actually reading an attachment or a photo.** Everything here ran models-off; the
  composer's material and image paths are verified by capturing the prompt, not by reading a reply.
- **HEIC**, as stated in the previous report: absent from the client's type map, so an iPhone photo
  at default settings is not offered by the picker. An iPhone limitation, stated rather than
  pretended.

---

## 5 · Verification

_(filled at the end)_

---

## 6 · Verdict

_(filled at the end)_
