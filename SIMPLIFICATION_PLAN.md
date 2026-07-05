# Simplification + Data-Centralization Plan

Two goals: (1) make the app dead-simple for members, lead nodes, and super
admins; (2) make a person's data ONE thing, not scattered. Below is what's
already done, what's still fragmented, and a sequenced plan with effort/risk so
you can pick a starting point. Nothing here is built yet — it's for your call.

---

## Part 1 — Data centralization

### What we already built (the good part)
- **A unified Signal layer.** Every input — note, check-in, assessment result,
  weekly reflection, uploaded sheet — emits into ONE store (`orgSignals`).
- **A single read view.** The member-profile **Data tab** reads from that one
  place, so "everything about a person" already has a home.

### What's still fragmented (the honest part)
1. **Two competing keys.** Data is keyed sometimes by **user ID**, sometimes by
   **name** (`userKey` vs `memberKey`). This is the root cause of the bugs already
   fixed (#9 double-count, #10 false "unanchored"). Biggest source of "data in the
   wrong place."
2. **Six parallel stores.** Canonical data still lives in `memberCheckins`,
   `memberResults`, `orgNotes`, `weeklyAssessments`, `memberGoals`,
   `userAiProfiles`. Signals are a *mirror*, not yet the source of truth — some
   screens read the spine, others reach into the old stores.
3. **The member has no "everything about me" view.** Leaders get the unified Data
   tab; the member sees their own data split across Progress / Notes / Check-In.

### The fix
- **Make userId the ONLY key** (migrate name-key reads/writes). Kills the bug
  class and makes every store line up on one identity.
- **One `getMemberRecord(userId)` read-path** every screen composes from, with the
  Signal layer as the index.
- **Give the member their own unified record view** (same Data view, self-serve).

---

## Part 2 — Simplification (per persona)

Today: **21 nav items**, permission-filtered. Where it hurts:

| Persona | Sees | Problem |
|---|---|---|
| Member | 6 | **Check-In** and **Notes** are the same act — two doors for one job |
| Lead node | ~13 | **Dashboard, My Members, Intelligence, Group Health** = four surfaces, one question ("who needs me?") |
| Super admin | ~20 | **"Intelligence" appears twice**; five analytics-ish pages (Insights, Intelligence, Organisation Health, Group Health, Intelligence-again) |

### Target shape
- **Member (~4):** Home (with ONE input box — type / talk / attach, via the
  `IQComposer` we already built), Assessments, Progress, Inbox.
- **Lead node (~6):** one **Dashboard** that opens on "who needs you today" (the
  briefing engine we built), with Group Health + My Members as drill-downs inside
  it — not separate nav entries. Plus Assignments, My Groups, Data Sources.
- **Super admin:** collapse the five analytics pages into one **Intelligence**
  home; rename so no two nav items share a label.

---

## Recommended sequence

| # | Change | User-visible | Effort | Risk | Why here |
|---|--------|--------------|--------|------|----------|
| 1 | **Nav cleanup** — merge member Check-In+Notes into one input; de-duplicate admin labels; collapse the 5 analytics pages under one Intelligence home | High | Low–Med | Low | Instant "feels simpler," reversible, no data touched |
| 2 | **Leader Dashboard** — make the briefing the landing surface; fold Group Health / My Members in as drill-downs | High | Med | Low | Turns 4 surfaces into 1; engine already exists |
| 3 | **Member "My Record"** — one self-serve "everything about me" view | High | Med | Low | Removes the member's data-scatter |
| 4 | **Unify data keys** — userId everywhere + one member-record read-path | Invisible | High | Med | The real centralization; do last, carefully, with a migration |

**My recommendation:** start with **#1** — biggest perceived simplicity gain for
the least risk, and it doesn't touch data. Then #2, #3, and save #4 (the
structural key-unification) for when you can watch it on real data.

---

## To proceed
Tell me a number (or "do 1–3") and I'll build it on the branch, deploy to main,
and attach a summary as usual. #4 I'd want to do as its own careful pass with a
data migration and your eyes on it.
