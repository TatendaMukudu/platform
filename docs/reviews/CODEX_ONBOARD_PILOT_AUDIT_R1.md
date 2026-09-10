# IntelliQ onboarding pilot-readiness audit — Codex R1

**Read:** `claude/pilot-crackdown-r1` @ `7c066f9b79b656b389da08e6392dfd88cda14bbc`
**Lane:** independent behavioral audit of Members / Onboard / Invite and Org Tree
**Review branch:** `codex/onboard-pilot-audit-r1`
**Ran:** `npm install`; `node /tmp/codex-onboard-audit2.js`; `node /tmp/codex-client-audit.js`; an isolated `_parseCSV` execution; targeted `rg` reads; `npm test`

## Scope actually covered

I exercised the real Express routes in-process against disposable two-organisation stores. The
harness used real issued sessions and inspected the resulting authoritative in-memory stores. I
also executed the exact client CSV parser and the Org Tree cancel/load functions in a VM with a
minimal browser boundary. No production data, database, email provider, or model was used.

Covered:

- Add Member, including stored account state, tenant choice, authority, activation, and retry.
- Generate Join Link and registration, including tenant binding, role ceiling, use, and listing.
- The misleadingly named Invite by Email flow, including target binding and delivery.
- CSV and XLSX separately, malformed rows, duplicates, partial results, retry, and bounds.
- Org Tree create, cancel, refresh, authority, malformed name, and duplicate/retry behavior.
- Cross-organisation writes and privilege-escalation attempts on invite, import, member creation,
  and tree creation.

Not covered: a real browser/device, clipboard permissions, concurrent bulk imports, process death
during a debounced non-tree save, a real PostgreSQL restart, and external mail delivery telemetry.
The email conclusion does not need telemetry: there is no mail implementation to invoke.

## Verdict matrix

| Flow | Verdict | Behavioral result |
|---|---|---|
| Add Member | **BROKEN** | Stores a real inactive-password account, then generates a different self-registration invite which cannot activate that account. |
| Generate Join Link | **WORKS** | A link registers a new account into the session organisation at the permitted role; tenant and role escalation probes were refused/contained. |
| Invite flow | **PARTIAL** | Generates usable links, but does not send mail, does not bind a link to the entered email, and silently omits failed addresses. |
| CSV import | **PARTIAL** | Plain CSV creates accounts and reports row failures/skips, but quoted CSV is corrupted and no file/row bound exists below the generic request limit. |
| XLSX import | **UI ONLY** | The picker advertises XLSX, but onboarding reads it as text and sends it through the CSV parser. |
| Org Tree create node | **PARTIAL** | A permitted admin creates durable route state, but blank trimmed names and duplicate retries are accepted. |
| Node cancel | **WORKS** | Executing `_closeInlineModal()` changed the live overlay display from `flex` to `none` without a request. |
| Node refresh | **WORKS** | Executing `OrgTree.load()` made one `/api/tree` request and replaced stale client nodes with the server response. |
| Duplicate/retry behavior | **PARTIAL** | Member/import duplicates do not multiply accounts, but Add Member cannot recover activation and repeated tree creates produce duplicate nodes. |
| Authority | **PARTIAL** | Import/tree gates and role ceilings hold; invite generation additionally requires leadership, so an otherwise normal admin who leads no node receives 403. |
| Invitation organisation scoping | **WORKS** | The invite stores the session organisation even when the body names another organisation; registration lands in the stored organisation. |
| Privilege escalation resistance | **WORKS** | Plain-member invite/import/tree/create probes returned 403; an admin's superadmin invite/import rows were refused. |

## Reproduced failures

### PB-1 — Add Member creates an account its generated invite cannot activate

**Reproduced.** An admin posted the same shape as `_submitAddPerson`. The route returned 200 and
stored `added@a.test` in `audit-a` with `passwordSet:false`. The subsequent invite was stored with
no `email`. Registration through that invite using the added member's address returned 400:

```text
add member stored consequence: status 200, passwordSet false
add-member generated invite: status 200, inviteEmail ""
add-member invite activation attempt: status 400
response: "An account with this email already exists. Please log in instead."
accountStillExists true, passwordSet false
```

The UI calls the second token a link to “set their password,” but it is a new-account token. The
existing account cannot log in because its random password is unknown, and it cannot register
because its email is already indexed. A retry returns “An account with this email already exists”
and leaves exactly one still-unactivated account. This is a pilot blocker and a false-success path:
the stored consequence is real, while the promised handoff is unusable.

There is a second partial-failure trap. Add Member creates the account before optional tree
assignment. If assignment conflicts/fails, the outer handler reports an error although the account
already exists; retry then hits the duplicate-account error. I did not inject a conflict into this
client sequence, so that sub-finding is **Read**, not reproduced.

### PB-2 — XLSX onboarding is not implemented

**Read, conclusive call-path trace.** The onboarding input accepts `.xlsx` and `.xls`, but
`_previewImportFile()` always calls `file.text()` and then `_parseCSV(text)`. It never calls
`XLSX.read`, never reads an `ArrayBuffer`, and never uses the repository's separate attachment
XLSX processor. A ZIP-based XLSX workbook is therefore treated as CSV text. The button exists;
the format implementation does not.

**XLSX IMPORT: UI ONLY.** This is a pilot blocker.

### PB-3 — valid quoted CSV is silently column-shifted

**Reproduced** by executing the exact `_parseCSV` function:

```text
plain:
[{"name":"Ada Lovelace","email":"ada@example.com","role":"member"}]

quoted comma input: "Lovelace, Ada",ada@example.com,member
parsed:
[{"name":"Lovelace","email":"Ada","role":"ada@example.com"}]
```

The parser is `split(',')`, not CSV parsing. Quoted commas corrupt name, email, and role. The
preview shows the corrupted values, and server validation will then fail or import unintended
values. Plain comma-delimited files work.

Malformed/partial behavior at the server is materially better: in a five-row request it created
the valid member, skipped the duplicate, and returned three explicit failures (invalid email,
missing email, and attempted superadmin). Exact retry created zero and left one account.

**Read:** there is no client file-size limit, row limit, or server row-count limit. The only bound
is Express's platform-wide 25 MB JSON limit. A sub-25 MB import can request thousands of sequential
bcrypt hashes in one HTTP request. I did not load-test that denial-of-service boundary.

### PB-4 — Invite by Email is neither email delivery nor an email-bound invitation

**Reproduced.** Generating an invite with `label:"target@a.test"` produced `invite-info.email:""`.
Registration with `different@a.test` then returned 200, created that different account in the
correct organisation, and consumed the link. The entered address is presentation metadata only.

The client loops over addresses, but sends each as `label`, not `email`; it performs no email-format
validation and suppresses every per-address exception. If one of several requests fails, only the
successful links appear, with no failed-address count or reason. This silent partial result is
**Read** from the client loop.

### PB-5 — normal admin invite authority depends on unrelated tree leadership

**Reproduced.** An `admin` with default admin permissions but no node/group/supervisor leadership
received 403 “Only a leader can create invites.” After the same admin was made a node leader, the
invite succeeded. By contrast, the join-link listing explicitly accepts admin/superadmin (or
`manage_settings`). This makes onboarding availability depend on org-tree placement rather than
the otherwise documented admin authority. Whether this is intended ontology needs a founder call;
I did not change it.

### PB-6 — Org Tree create is not retry-safe and accepts an empty stored name

**Reproduced.** Two identical `POST /api/tree/node` calls both returned 200 and produced distinct
ids; the store contained two `Retry Node` entries. A lost response followed by a human retry will
therefore duplicate structure. A direct request with `name:"   "` also returned 200 and stored
`name:""`: validation occurs before trimming.

Create itself works: the authorised request returned 200, the node existed in authoritative state,
and a subsequent `/api/tree` refresh returned it. A plain member's create returned 403. Cancel also
works and performs no mutation.

## Security and scoping evidence

The following were **Reproduced** against two disposable organisations:

- An authorised inviter sending `orgCode:audit-b` stored the invite under session org `audit-a`;
  joining created a member in `audit-a` at role `member`.
- An admin attempting a `superadmin` invite received 403.
- A plain member attempting an invite received 403.
- A plain member attempting bulk import received 403 `edit_members`.
- An authorised admin attempting bulk import into the other org received 403; no cross-org email
  index entry was created.
- An admin import containing a `superadmin` row did not create it, while a valid member row in the
  same request did create successfully.
- A plain member attempting Org Tree creation received 403 `manage_tree`.
- A plain non-leader member attempting Add Member received 403. A node leader with role `member`
  could add a member, and the server forced the new member's supervisor to that leader.

I found no reproduced cross-tenant write or successful privilege escalation in these paths.

## Email delivery determination

**NOT IMPLEMENTED. EMAIL DELIVERY: NO.** Targeted repository search found no email provider,
SMTP client, queue, mail SDK, send function, or outbound mail request in production code or
dependencies. `package.json` contains no mail package. `/api/auth/invite` only stores a token,
logs its URL, and responds with that URL. The client explicitly asks the admin to copy it.

This is not “configured off”: there is no implementation to configure. No email is sent.

## Code-reading concerns (not reproduced)

- Add Member's account-first/tree-second transaction can report failure after account creation.
- Invite-by-email suppresses individual request errors and does not report partial failure.
- There is no import-specific file-size or row-count bound; only the generic 25 MB JSON parser
  ceiling protects the server.
- Import group names auto-create Org Tree nodes without using the tree mutation's revision/CAS
  durability boundary. This audit confirmed the behavior by reading but did not simulate a crash.
- CSV preview interpolates spreadsheet headers and cell values into `innerHTML` without escaping.
  A spreadsheet is therefore an HTML injection surface in an admin's browser. I did not execute a
  browser payload in this pass.

## Fixed

None. The requested output is independent reproduction evidence. The defects sit in active
onboarding/server/tree files and are best handed back rather than changed during Claude's work.

## Refused / escalated

- Decide whether invite authority is “any admin who can onboard” or “only a person who currently
  leads a node/group/supervisor subtree.” Current UI and route/listing gates do not express one
  consistent answer.
- Decide whether Add Member should create a dormant account first and activate that identity, or
  whether it should create only a targeted invitation and defer account creation. Implementing
  both produces the reproduced dead end.

## Not fixed, and why

All six pilot blockers were left untouched. They affect `js/app.js`, `server.js`, or `js/tree.js`,
the exact active implementation under audit. A report-only commit avoids conflicting with Claude
and gives exact reproduction evidence as requested.

## Mutation map

No assertions were added to the repository and no fix is claimed, so there is no production
mutation claim. The audit harness itself used positive controls: valid same-org member import,
valid join registration, authorised tree creation, and fresh tree read all returned 200 while
adjacent authority/scoping probes returned 403. This distinguishes working gates from dead routes.

## Touched another lane

None. Only this review document was added.

## What I could not verify

- Real-browser XLSX error presentation, clipboard behavior, and mobile interaction.
- Persistence after an actual database restart or failure between split-store writes.
- Concurrent duplicate requests rather than sequential retry.
- Resource exhaustion at the maximum accepted import payload.
- External delivery logs; no external check can be made for a sender that does not exist.

---

ADD MEMBER: FAIL

JOIN LINK: PASS

CSV IMPORT: PARTIAL

XLSX IMPORT: FAIL

EMAIL DELIVERY: NO

ORG TREE: FAIL

PILOT BLOCKERS FOUND: 6
