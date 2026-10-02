# Product surface — what is offered, what exists, and what the difference means

Driven in Chromium at 390px against `ebb4a36`, by navigating to every registered route and
recording where the app actually landed. Nothing here is inferred from grep; two earlier claims of
mine that were inferred from grep turned out to be wrong and are corrected below.

---

## The headline

**26 routes are registered. 8 are offered. All 26 work.**

That last part is the finding. None of the eighteen unoffered screens is broken, none throws, none
falls back to Home. They are complete, functioning surfaces that no control in the product opens.

This is therefore **not a code-cleanup question**. It is a product question about what IntelliQ
offers a person, and the answer to it is the founder's, not mine. Nothing in this section was
deleted this pass.

What a coach sees in the nav drawer:

> Chat · Inquiries · Focuses · Highs · Lows · Library · Org tree · Settings

Plus a permission-gated account menu: My data & privacy · People · Organisation · Settings.

---

## Two corrections to my own §0 report

I reported both of these from grep, and both were wrong.

**"No `data-page` attribute exists anywhere."** False. `ACCOUNT_LINKS` builds them in a template
string (`js/app.js:1630`), which a literal search for `data-page="` does not match. So
`navigate(btn.dataset.page)` at line 1635 is **live** — it is the account menu — and I was wrong
to call it dead.

**"`apps` and `inbox` route to renderers that do not exist."** False. `_renderApps` and
`_renderInbox` are both defined; my pattern required the method name at the start of the line and
they are declared `async`. Both screens render correctly when navigated to.

The one part of that §0 claim that held: the `.nav-item` selectors at `js/app.js:737` and `:740`
matched nothing. The drawer renders `iq-nav-item` and owns its own active state.

---

## Classification

| Screen | Class | Evidence | Disposition |
|---|---|---|---|
| `home` `inquiry` `focus` `high` `low` `notes` `people` `settings` | **OFFERED** | in the nav drawer | keep |
| `my-data` | **OFFERED (account menu)** | `ACCOUNT_LINKS` PERSONAL | keep |
| `organisation` | **BROKEN — REPAIRED THIS PASS** | had a PAGE_TITLE, no route, no alias; reproduced landing on Home | folded to `people` |
| `assessments` | **INTERNAL** | reached by `navGo('work')` in the drawer's own handler | keep, not a nav item |
| `leader-home` `team-readiness` `operating-context` `org-memory` `data-sources` `safeguarding` | **ACCIDENTALLY DISCONNECTED** | each has a live `navigate('…')` call site in `js/app.js`, so a control somewhere still points at them | founder's call |
| `checkin` `stats` | **INTERNAL** | called directly by `_renderHome` (`js/app.js:8508-8509`), not as destinations | keep as components |
| `apps` `inbox` | **SUPERSEDED** | complete renderers, no call site; Apps is connector setup now in Settings, Inbox is "communication-only (messages)" per its own comment | founder's call |
| `leader-people` `org-learning` `org-playbook` `operate` `leader-groups` `org-health` | **RETIRED (Platform leader UI)** | no call site anywhere; the leader surfaces the nav drawer replaced | founder's call |

---

## Why nothing was removed

§21 says to classify before changing, and §25 says not to destabilise the branch. Removing
eighteen working screens — their renderers, their DOM containers in `index.html`, and whatever
server routes only they call — is a large diff immediately before independent testing, and its
benefit is invisible to a tester because none of those screens is reachable anyway.

**The pilot complexity they cause is zero**, because a coach cannot get to them. The complexity
they cause is to the next agent reading the repository, which is a real cost and not a release
blocker.

The two things that WERE costing a user something are repaired, because both were reachable:

- **`organisation`** — a permission-gated menu item that silently landed on Home.
- **the dead `.nav-item` selectors** — a second, unread owner for "which nav item is lit".

---

## What I could not verify

- Whether any of the eighteen holds **unique capability** that a coach genuinely needs. I checked
  call sites and renderers, not the server routes each one uses. A screen like `safeguarding` may
  be the only door to something that matters, and it has a live call site, which is why it is
  classified as disconnected rather than retired.
- Whether the DOM containers in `index.html` for the retired screens cost anything measurable on
  a phone. They are parsed but never shown.
