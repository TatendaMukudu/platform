# Update — Every input = signal + reusable multi-modal composer

**Merged to main:** `66edf64` (deploying) · asset `?v=20260621m`

Two things shipped, both from "extract as much from input as possible" + "same
composer layout (attach / voice / text) everywhere".

## 1. Every input touchpoint now emits a signal (`37e48cb`)
Nothing is lost — each interaction flows into the universal Signal layer the
Advisor & Copilot read:
- **Notes** → note signal (private/anonymous = inform-only).
- **Check-ins** (simple + freeform) → checkin signal (mood number + text).
- **Assessment submit** → assessment signals (overall score citable + summary /
  strengths / development).
- **Weekly reflection** → weekly signal (free text).
- Capture is wrapped so it never breaks the input flow; legacy name-only inputs
  are mapped to a userId so they attach correctly.

## 2. IQComposer — one reusable input bar (`66edf64`)
The same composer you're using: **📎 Attach · 🎤 Voice · text**.
- Drop-in: put `<div data-iqcompose="<textareaId>">` after any textarea and call
  `IQComposer.mountAll()`.
- Attach → parsed via the app's AttachmentHandler (Excel/Word/CSV/PDF/image).
- Voice → browser speech-to-text straight into the textarea.
- **Wired into member Notes** as the reference: attachments on a note become
  signals about the author. The same hook now drops onto assessment replies,
  check-ins, messages — anywhere — with one line.

## Next (same pattern, cheap)
- Add `data-iqcompose` to the assessment reply + check-in composers.
- Smart-attribute note/assessment attachments (route through /signals/import).
- Microsoft Graph / Google connectors (need your app registration).

Verified at node --check across files. Voice needs a speech-capable browser
(Chrome/Safari); live check needs a login.
