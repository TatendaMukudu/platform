# Pilot spec — what IntelliQ is, decided out loud

**Alma College Men's Soccer · pilot 26 September 2026.**

This is the record of a top-to-bottom sweep the founder asked for, so that the framework is
agreed before the nitty-gritties are fixed. Every decision below was PUT TO THE FOUNDER AND
ANSWERED — none of it is inferred, and where a decision changed an existing law that is said.

It is not a wish list. Each item says whether it is built, partly built, or not started.

---

## 1 · The shape of the product

| | |
|---|---|
| **One app, one composer** | A coach and a player open the same screen. Roles ADD to it; they never replace it. |
| **Home is one object** | The single highest-priority thing IntelliQ holds — of ANY kind: an inquiry, a focus, a High or a Low. Whatever needs the person's eyes first. **Built.** |
| **Buckets carry self AND team** | Highs, Lows, Inquiries and Focuses each show the person's own and their squad's, in ONE list ranked together, each card quietly labelled with who it is about. **Not built** — the client asks for `scope=self` only, so team objects never appear. |

The founder's reasoning on the single list: the most important thing should be at the top
whoever it is about. Two sections would let the squad's most urgent item sit below the person's
least urgent one.

---

## 2 · What a coach can see

This is the privacy question for a college programme, and the answer threads a needle.

**A coach cannot read a player's record.** Not their conversations, not their private focuses,
not their words. That is unchanged and it is why players tell it the truth.

**A coach sees the squad in aggregate** — how the group is going, how morale is moving, whether
focuses are landing and being engaged with.

**A NAME may appear only when the evidence behind it is already public to that audience.**

> Your top performers this week are A, B and C — *because of [public evidence]*.
> A, B and C are improving — *because of [public evidence]*.
> A, B and C are worth watching — *because of [public evidence]*.

The principle: if everyone in that room could already see the evidence, naming the person
discloses nothing new. This is what separates the above from the ranked chart deleted in
September, which named a squad's five weakest players from evidence nobody could check.

**A standing condition on the "watch" list**, raised as a risk and accepted: every name must
carry its reason, always, with no exceptions. A named negative list without its basis becomes a
leaderboard within a month.

### What counts as public evidence

| Source | Public? | Note |
|---|---|---|
| A focus the player made shared or squad-wide | **Yes** | They chose to make it the group's |
| A read a leader gave through the ladder | **Yes** | It came from staff |
| Anything the player deliberately raised | **Yes** | Raising it IS the act of making it visible |
| Forum discussion | **Group level only** | Contributions stay ANONYMOUS. A forum informs what the coach sees about the GROUP, never about a named individual |
| The player's own composer | **Never** | Private, always |

The forum line is a founder correction to a drafted option: anonymity is preserved, and forum
material is aggregate-only.

---

## 3 · Morale, without a daily check-in

Morale comes from the **direction tags** — the better/worse/neither a person declares on their
own evidence as they give it. Aggregated across a squad over time, that is a morale line built
from what people actually said about real things.

It replaces the retired daily check-in, which asked every day whether or not there was anything
to answer and taught people the question was noise. Nothing new is asked of anybody.

**Partly built.** The tags exist and are collected; the aggregate view does not.

---

## 4 · A focus is something you work towards

**Decided: a focus needs a target and a date.** What you will do, what would tell you it
worked, and when to look.

Today a focus is one line of text, which makes "did what you tried help?" a feeling rather than
a check. With a target and a review date it becomes answerable, and it feeds Highs and Lows
directly.

**Not built.** Two fields and their handling.

---

## 5 · Attachments — the replacement for assessments

The founder's direction, and the biggest single idea in this sweep:

> "If a coach can attach a PowerPoint for scouting and ask IntelliQ to recreate it for another
> game and players interact with that, then we've achieved a massive goal — focuses and forums
> can be used as an assessment tool for film, tutorials, game principles and testing
> understanding, just like we've wanted assessments to do."

**IntelliQ reads the file and works from it.** The material becomes the basis of learning and
the source of truth for that focus. It is the leader's environment, goals and truth — so
"lack of understanding" is measured AGAINST IT rather than against a generic standard.

What the coach gets back:

> "This wasn't well understood by 80% of players, and they're struggling with A, B and C."

A coach sharing material with a team or a group makes it public to that coach AND those
players, which is what licenses the reporting above.

**How understanding is measured** — through the forum OR a private conversation with the
player, and either way **the conversation flows from the context the coach supplied.** So a
focus must carry a context or a direction from its creator, and the assistant follows it: it
can surface things the coach had not thought of, correct against what the coach actually said,
and report across groups the way Highs, Lows and Inquiries already do.

**Not built.** This is the largest item on the list.

Because focus + forum + attachment covers what they were for, **notes, messages and assessments
are not being revived as surfaces.** Their routes and tests stay; nothing is deleted.

---

## 6 · Graphs

**Spontaneous, in conversation** — a chart appears while talking with the assistant inside a
focus, High, Low or Inquiry, the way people now expect. Not a dashboard. The minimal feel is
the point and graphs must not turn the product into one.

**THE NUMBERS COME FROM THE SERVER, ALWAYS.** The model may choose *when* a chart helps and
*what shape* it should take. It may never choose the values. A chart is a claim, and an invented
chart is an uncited answer wearing a nicer outfit — the same failure the outside-reading feature
already refuses.

Places a graph earns its keep:

- on a belief — origins arriving over time, the confidence band stepping up
- on a focus — what was tried, and what was recorded after
- on a squad — coverage, morale direction, whether focuses are landing
- on the ladder — where raises get stuck, and for how long

**Not built.** Chart.js is loaded and `js/charts.js` has line and radar wrappers; nothing in the
current product draws anything.

---

## 7 · Laws that already hold (built, tested, mutation-proven)

- **The evidence decides a High or a Low**, not the person. A person cannot mark themselves fine
  and cannot clear a Low; disagreeing with one makes it LOUDER.
- **Direction is declared, never inferred.** No classifier reads meaning out of anybody's words.
  The model gets no vote.
- **Origins vote, not messages.** Repetition is not corroboration. Origins that disagree are
  contested, not averaged.
- **Raising is the person's act.** Calling something sends it nowhere.
- **A pass needs a reason and raises priority.** A thing nobody owns is a bottleneck, not a
  lower priority.
- **Forum speech is not evidence** until its author deliberately offers it.
- **Outside reading is composed, cited, and never becomes evidence.**
- **Every model exit goes through one gateway**, under no-egress, budget and telemetry.
- **Public routes take identity from the session**, never from the request body.

---

## 8 · Still open

Not yet put to the founder, and needed before the pilot is called ready:

1. Who creates accounts at Alma, and who resets a password.
2. What happens on day one, when there is no evidence about anybody at all.
3. Whether a coach can record an observation about a player directly, outside the ladder.
4. What a player is told about who can see what, and when they are told it.
5. The composer's placement and feel — the founder has called it clumsy.
6. Whether the retired daily check-in's route and renderer should finally go.
