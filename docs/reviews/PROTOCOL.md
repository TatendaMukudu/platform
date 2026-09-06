# Review round 1 — the protocol all three agents are held to

Three agents review IntelliQ independently, fix what they find, record it, then review each
other. Claude, Codex and Astra. This file is the contract; the three prompts beside it
(`prompt-claude.md`, `prompt-codex.md`, `prompt-astra.md`) say who looks where.

**Target:** `main` at the commit you start from. Record that SHA in your report.
**Pilot:** Alma College Men's Soccer, 26 September 2026. That is the deadline everything here
is measured against.

---

## 1. The non-negotiables

These are not style preferences. Each one is a law the product's claims rest on, and several
were learned by getting them wrong.

- **No emojis.** Not in the UI, not in code, not in commit messages, not in docs. Where an icon
  is genuinely needed, an inline SVG.
- **`npm test` GREEN before anything merges.** No exceptions.
- **Never make a failing test pass by weakening it.** If a test is wrong, say why it is wrong
  and rewrite it to assert the real law. Deleting an inconvenient assertion is a finding
  against you, not a fix.
- **Never weaken** tenant isolation, the cohort floor, provenance, admissibility, authority
  truth, or durability.
- **Direction is DECLARED, never inferred.** No sentiment lexicon, no classifier, no "sounded
  worried", no embedding similarity deciding what a person meant. A ~40-stem lexicon was
  removed from this codebase for destroying information. It must not return by the back door,
  and the back doors are: relevance scoring, "smart" defaults, and anything that reads a
  person's words to decide what they are allowed to be told.
- **Evidence is referenced, never copied.** `applyProposals` stores a ref, an origin and a
  shape — never the statement text.
- **`about` is the thread-binding key.** Conversations are found by `conversation.about ===
  object.about`. Never write a label into it.
- **Every model exit goes through `ai/gateway.js`** carrying an org. `PLATFORM_ORG` is the
  explicit sentinel for a caller that genuinely belongs to no organisation.
- **Origins vote, not signals.** Five messages from one origin are one vote.
- **Never commit secrets.** Do not read, print, move or rotate the GitHub PAT. Do not disable
  TLS verification or unset `HTTPS_PROXY`.

**STOP AND ASK.** If a finding materially changes ontology, privacy law, epistemic law or
fundamental web semantics, do not fix it. Write it up under *Refused / escalated* and state the
decision the founder has to make. Do not silently choose.

---

## 2. The standard of proof: mutation

A passing assertion is not evidence. An assertion that **cannot go red** proves nothing, and
this repo has produced nine distinct ways for one to look fine and be worthless.

For every assertion you write, and every assertion you rely on to say something is safe:

1. Break the production line it guards.
2. Run the suite. Confirm the assertion goes **red**.
3. Restore.
4. Record it in your mutation map.

**Read both stdout and stderr.** `FAIL` goes to stderr in most suites here. A harness that read
stdout only once reported twelve mutations as "nothing went red" when all twelve had bitten.

**A crash is not a pass.** If a mutation makes a suite throw before it prints any `FAIL`, your
harness must treat a non-zero exit with no FAIL line as red.

### The nine ways an assertion lies here

Every one of these was found in this repository, in real suites, written by careful people.

| # | The lie | How it looks |
|---|---|---|
| 1 | Matches a function's **definition**, not its **call** | `/async _renderChart\(/` passes when nothing ever calls it. **Five occurrences.** |
| 2 | Matches a **second call site** | The same call appears twice in the file; deleting the one under test leaves it green. |
| 3 | **Masked** by an outer gate | The permission check refuses before the tenant rule is reached, so deleting the tenant rule changes nothing. |
| 4 | **Vacuous regex** | A font-stack pattern excluded quote characters, so every quoted stack matched an empty string. |
| 5 | **Empty fixture** | A squad of six can never clear a cohort floor of five, so every assertion passes against a permanently-refusing surface. |
| 6 | **Asserts the bug as correct** | `ok('...the route still works', orgStore[A].orgName === 'HACKED')`. |
| 7 | Harness reads **stdout only** | `FAIL` goes to stderr. |
| 8 | A **throw** kills the script | No FAIL line is ever printed; the harness reads silence as success. |
| 9 | The **mutation** is a no-op | Commenting out dead code proves nothing about the assertion. |

### And one about reviewing

A previous review compared a branch against **its own merge base** rather than against `main`.
Every file read as new work; it was not new work, and every conclusion in the review was wrong.

> "What did this add since it forked" is the wrong question when the branch is stale.
> **"What would change if this merged"** is the right one.

Review against the target. State in your report which SHA you actually read.

---

## 3. Reproduced, or read?

Label every finding as one of two things, and never blur them:

- **Reproduced** — you ran something and it failed. Give the exact command and the output.
- **Read** — you reasoned from the code and believe it is wrong, but did not make it fail. Say
  so plainly.

A read concern is still worth reporting. Presenting one as if it were reproduced is not.

This matters here specifically: agents in this project have reported findings this session that
were confidently wrong, and other agents have been right when contradicted. Neither deference
nor dismissal — reproduce it.

---

## 4. Branches, and staying out of each other's way

One branch per agent, off current `main`:

```
claude/review-r1
codex/review-r1
astra/review-r1
```

Commit and push your own branch. **Do not merge to `main`** — the founder decides what lands
and in what order, because three branches touching `server.js` will conflict and the resolution
is a judgement about which fix is right, not a mechanical merge.

If you need to change a file another agent's lane owns, do it anyway if it is a real fix, but
**say so in your report under a heading "Touched another lane"** so the conflict is expected
rather than discovered.

---

## 4b. If you cannot push

Check first, before doing any work:

```
git push --dry-run origin HEAD:refs/heads/<agent>/connectivity-check
```

Two failures, two different meanings:

| What you see | What it means |
|---|---|
| `could not read Username for 'https://github.com'` | **No credential at all.** Nothing was offered. Common for read-only repo connectors, which cannot be fixed with a token. |
| `Invalid username or token` / `403` | **A credential was offered and refused.** Expired, revoked, wrong value, or a stale one baked into a cached container or left in the remote URL. See `docs/CODEX_PUSH_PATH.md`. |

**Do not stop.** A review's deliverable is findings, and findings survive the container.
AGENTS.md requires stopping when you cannot push, and that rule is written for implementation
work whose only artifact is a commit — it does not apply here. Do the review and deliver the
report in chat instead; someone with write access commits it, attributed to you.

State at the top of your report, in one line, that you could not push and that nothing in it
has been run through CI. Then everything else in this protocol still applies: mutation is
still the standard of proof, and a fix you could not run is a **read** finding, not a fixed
one.

---

## 5. What you write down

`docs/reviews/<agent>-r1.md`, with exactly these headings. The headings are fixed so the three
reports can be read side by side and so cross-review has something to check against.

```markdown
# Review round 1 — <agent>

**Read:** main @ <sha>
**Lane:** <your lane>
**Ran:** <the commands you actually ran>

## Scope actually covered
Files and paths you read. And explicitly: what you did NOT look at.

## Reproduced failures
For each: what breaks, the exact command, the output, and who it hurts.

## Code-reading concerns (not reproduced)
Say plainly that you did not make these fail.

## Fixed
One line each: what, where, the assertion that now holds, the mutation that proves it.

## Refused / escalated
Findings that touch a law. NOT fixed. State the decision the founder has to make.

## Not fixed, and why
Real findings you chose to leave. Scale is the founder's call, not yours.

## Mutation map
| Mutation | Assertion that went red |

## Touched another lane
Files outside your lane that you changed, and why.

## What I could not verify
The honest limits of this pass.
```

**A report with an empty "What I could not verify" section is not finished.** Every pass has
limits. Not stating them is the most expensive kind of quiet.

---

## 6. Cross-review

When all three reports exist, each agent reads the other two and writes
`docs/reviews/<agent>-crossreview-r1.md`:

- For each **fix** the other two claim: try to break it. Write the mutation you tried and
  whether their assertion caught it. A fix whose assertion cannot go red is not a fix.
- For each **finding** they report: do you agree it is real? If you disagree, reproduce your
  disagreement rather than asserting it.
- Anything they marked *Refused / escalated*: do you agree it needs the founder, or is it
  ordinary work somebody flinched at?

Cross-review is not a courtesy pass. The point is that three agents who all wrote their own
tests will each be blind in the same places they were blind while writing them.

---

## 7. Already known — do not report these as new findings

All of these are real, all are already written down, and none needs rediscovering:

- The **notes routes** and `POST /api/library/from-chat` are live but unreachable from the
  Library page. `from-chat` still snapshots a conversation into a flattened copy stored beside
  the live one. Retiring them is a pending founder decision.
- **Folder sharing is not built.** Folders are personal. The legacy `visibility: 'shared'` flag
  on library note items bypasses the governed audiences — a second, quieter access rule.
  Rebuilding sharing on the real audiences is a pending founder decision.
- **29 tap-target findings** remain, all inside larger touch areas.
- **Nothing merged on 6 September has been opened in a browser or on a device.** Everything is
  asserted through HTTP read paths and a headless harness.
- `scripts/mobile-inspect.js` is **not** in `npm test`: it needs a browser binary and the truth
  layer is deliberately hermetic.
- `docs/rnd/` is **not** an implementation queue. Do not build from it.

---

## 8. What lands, and when

Round 1 is check, fix, record, cross-review. **Then** — and only then — we move to trying to
break it deliberately: adversarial input, hostile roles, cross-tenant probing, malformed
payloads, races. That is round 2 and it has its own brief.

Do not start breaking things in round 1. A repository being changed by three agents at once is
hard enough to reason about without half of it being under attack.
