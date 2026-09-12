# The founder's phone and restart script

**What this is.** Everything in `docs/reviews/CLAUDE_PILOT_LIVE_RECOVERY_R1.md` that a container
cannot check. Each step names the screen, the exact action, what you should see, and — the part
that matters — **what it means if you see something else**. Nothing here needs a developer; it
needs your phone, the deployed instance, and about forty minutes.

**Why it exists.** Six rounds of this engagement have found the same class of defect over and over:
a capability that exists in the source, passes every hermetic test, and produces nothing on a real
screen. The only instrument that has reliably caught those is a person using the product. These are
the checks no test in this repository can do, listed so that none of them is skipped because it was
the awkward one.

**Before you start.** Note the commit you are testing: Settings → You → the build line at the
bottom. Write it down. If any step behaves oddly, the first question is always whether the phone is
running the build you think it is.

---

## A · The build on the device — 5 minutes

| # | Do this | Expect | If not |
|---|---|---|---|
| A1 | Open the app on your phone. Settings → **You** → read the build line. | A short commit hash, a start time, and an asset stamp. | If the line is missing, the phone is running a build older than this work. Go to A2. |
| A2 | Pull down to refresh. If a "new version" prompt appears, take it. | The build line changes to the commit you deployed. | If it does not change after a reload, the service worker is serving a stale shell. Close every tab of the app, reopen, and check again. Record it if it persists — that is a deployment defect, not a product one. |
| A3 | Compare the commit on the phone with the commit Render says it deployed. | Identical. | If they differ, **stop**. Everything below would be testing the wrong build, which is how a whole round of findings gets attributed to the wrong code. |

---

## B · Reading aloud, on an actual iPhone — 10 minutes

**This is the one thing six rounds have never been able to check.** Every assertion about reading
aloud in this repository runs against a stubbed speech engine in headless Chromium. Chromium is not
Safari and a stub is not a voice. Until you do this, VOICE OUTPUT is PARTIAL, and the report says so.

| # | Do this | Expect | If not |
|---|---|---|---|
| B1 | Ask IntelliQ any question. On the reply, press the speaker control. | It **speaks**, in a voice, out of the phone. | Silence with the button showing "Reading aloud…" is the founder's original defect returning. Note the exact state the row shows. |
| B2 | Listen to the whole thing. | The spoken words are the words on screen, **and then** any caveats under the answer, **and then** "this rests on N sources". | If the caveats are missing, the spoken answer is more confident than the written one, which is the failure this round fixed at `_speechFor`. Record exactly which sentence was dropped. |
| B3 | Press the same control again while it is speaking. | It stops, and the row says **Stopped**. | A control that does nothing when pressed is the defect class. |
| B4 | Start it reading, then **ask a new question** without touching the control. | The old reply stops. The row that was reading says "Stopped — a newer reply took over". | Two answers speaking at once is what this is checking. |
| B5 | Start it reading, then navigate to another screen. | It stops. | |
| B6 | Silence the phone with the side switch, then press the control. | Either nothing is heard (iOS honours the silent switch) **or** it plays. Either is acceptable — note which. | This is information, not a pass/fail. iOS behaviour here differs by version and it is worth knowing which you have. |
| B7 | Settings → You → read the **Speaking instead of typing** and **Reading replies aloud** rows. | Both say "offered by this browser", and the speaking row says the microphone is a separate permission. | If a row promises the microphone itself, the label is lying about what it checked. |

---

## C · Two-member Forums — 8 minutes

You need a second device or a second account you can sign into.

| # | Do this | Expect | If not |
|---|---|---|---|
| C1 | Sign in as the coach. Open a squad High, Low, Inquiry or Focus. | The Forum icon is on the object's screen **and** on its card in the list. | If the card and the screen disagree, that is the defect round 5 fixed at `_forumAudience` — record which one is wrong. |
| C2 | Open a **personal** focus of your own that nobody else is on. | No Forum icon, and the screen says there is nobody to discuss it with. | An icon here would offer a room of one. |
| C3 | In the squad object's Forum, post a sentence. Sign in as a player on the second device and open the same object's Forum. | They see the sentence. Nobody's name is on it — not even to you. | Authorship is deliberately hidden from everybody, leaders included. A name appearing is a privacy defect. |
| C4 | As the player, open the same object's **private** conversation with IntelliQ and ask about it. | The reply is informed by what was said in that object's Forum. | This is the founder's rule: Forum content may inform private conversation **for that same object**. |
| C5 | Ask about a **different** object. | Nothing from the first object's Forum appears. | |
| C6 | As the player, say something private to IntelliQ. Check the Forum. | It is **not** there. | Private conversation never enters a Forum without an explicit share. |
| C7 | Ask IntelliQ to put something you just said to the group. **Edit the wording** on the card before confirming. | The room shows **your edited words**, not the ones IntelliQ proposed. | This path was dead until this round — the edit box could not post. |
| C8 | Take the player off the squad (Settings → people). As that player, open the object again. | The Forum is gone, immediately — not after a refresh or a wait. | |

---

## D · Attachment retry on a bad connection — 6 minutes

This is the step most likely to be skipped and the one most likely to find something. Do it
somewhere with poor signal, or turn mobile data off mid-upload.

| # | Do this | Expect | If not |
|---|---|---|---|
| D1 | Attach a document (`.docx`, `.pptx`, `.xlsx`, `.csv` or `.txt`) in a conversation. | "Read N parts from <filename>." | |
| D2 | Try to attach a `.pdf` or a photo. | The picker should not offer them for this path. | If it offers a PDF and then refuses it, the picker is advertising what it cannot read. |
| D3 | Start an attachment and **kill the connection mid-upload** (aeroplane mode). Wait for the card to settle. | It says it could not **confirm** whether it saved — not that nothing was saved — and offers **Try again**. | "Nothing was saved" is a claim the phone cannot make. If you see it, the build is older than this round. |
| D4 | Reconnect and press **Try again**. | One document attached. **One** conversation in your list, not two. | Duplicate threads for one upload is the defect this round fixed. Count the threads carefully. |
| D5 | Scroll your conversation list. | No orphaned thread holding the same document. | |

---

## E · Onboarding and permissions — 8 minutes

| # | Do this | Expect | If not |
|---|---|---|---|
| E1 | As an administrator, invite somebody. Send yourself the link. | A working invite link. | |
| E2 | **Restart the service** (Render → Manual Deploy → Restart), then open the invite link. | It still works. | An invite that dies on restart makes onboarding impossible on any day you deploy. |
| E3 | Activate the account, choose a password, sign in. | You land in the right organisation with the role the invite carried. | |
| E4 | As that new member, try to reach something administrative — Settings → any organisation tab. | You see only your own Settings. | |
| E5 | Sign out and back in with the new password. | It works. | If it does not, the password did not reach durable storage. |
| E6 | Give somebody **manage_metrics** and nothing else. Sign in as them, open Settings → Organisation. | They see Organisation Details and the metrics they can edit. The connection cards say they need the organisation-settings permission, rather than showing buttons that refuse them. | Buttons that produce a 403 are a screen offering work it will not accept. |

---

## F · Neon persistence and restart — 6 minutes

**Nothing in this repository has tested Neon.** Round 5 ran the real server against a real
PostgreSQL 16 in a container, which is not the same claim: no network partition, no pooler, no cold
start, no managed-service failure modes.

| # | Do this | Expect | If not |
|---|---|---|---|
| F1 | Create something real — an object, a focus, a conversation with two or three turns. | | |
| F2 | Render → **Restart** the service. Wait for it to come back. | | |
| F3 | Open the app. Do **not** sign in again if you do not have to. | Your session still works, and everything from F1 is there. | |
| F4 | Settings → You → the build line. | It reports the stores loaded and ready. | A healthy instance reporting "not ready" was a real defect this engagement found; if it returns, the readiness probe is lying again. |
| F5 | Record a focus outcome. Restart again. Check it survived. | | |
| F6 | **If you can**, have two people write at the same moment — both creating an account, or both closing a focus — then restart and check both survived. | Both there. | Round 5 observed **one of two concurrent writes surviving** against a local PostgreSQL: a lost update. If you see it here, run one instance for the pilot. This is the open operations question. |

---

## G · Session expiry — 3 minutes

| # | Do this | Expect | If not |
|---|---|---|---|
| G1 | Leave the app open on the phone overnight, or until the session expires. | | |
| G2 | In the morning, try to send a message. | One clear "your session has ended, sign in again" — and the composer, the microphone and the paperclip all stop offering to work. | Controls that stay live after the session dies produce a string of failures that each look like a different bug. |
| G3 | Sign in again. | Your conversation is still there. | |

---

## What to write down

For each step that does **not** behave as described: the step number, what you saw instead, the
build line from Settings → You, and the time. That is enough to reproduce it. A screenshot of the
build line with the failure on screen is worth more than a description of either.

**And the steps that pass matter too.** B1 through B7 have never been observed by anybody. When you
have done them, reading aloud stops being PARTIAL — and that is one of the two conditions still
holding this pull request at SAFE TO MERGE: NO.
