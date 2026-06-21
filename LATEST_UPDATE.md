# Latest Update — "People" → "Members" rename

**Merged to main:** `b581c25` (deploying)

User-facing wording changed from "People" to "Members" for a more professional
feel. **Labels only** — page IDs, route keys, function names, and container IDs
are untouched, so nothing breaks.

## Changed (visible)
- Nav: **People → Members**, **My People → My Members**
- Page titles + section headers updated to match
- **Add Person → Add Member** (buttons, ➕ tooltip, onboard card + form title)
- Leader buttons "View My People" / "My People →" → **My Members**
- Asset version bumped to `?v=20260621d` so the new bundle loads

## Left untouched (on purpose)
- Code: `id="page-people"`, `navigate('people')`, `PAGE_TITLES.people` key,
  `switchPeopleTab`, `renderPeople`, `leader-people` ids — all internal, renaming
  them would break wiring for no benefit.

## To see it on your phone
Load once with a cache-bust: **`https://827l.onrender.com/?fresh=1`**
(after that, future deploys refresh automatically).

## Verification
- `node --check` passes on app.js and data.js.
- No visible "People" / "Add Person" strings remain in the UI.
