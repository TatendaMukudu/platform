# Update — Values + goal now REQUIRED to finish setup (org & member)

**Merged to main:** `073e70c` (deploying) · asset `?v=20260621s`

The AI's anchors can no longer be skipped on either side.

## Org setup
- Must have **at least one core value AND one organisation goal** to finish.
- Enforced in the wizard (can't approve without them) *and* on the server
  (`complete-org-profile` rejects otherwise).
- These already flow into the live stores the AI reads (from the last update).

## Member setup
- Must have **a main goal AND at least one value** to finish.
- The onboarding routes you back to the missing step; the server
  (`complete-profile`) enforces it too.

## Safety: repair path preserved
Login re-sync (for members whose server record was lost) now posts
`{ repair: true }` — the server re-affirms completion **without** re-validating or
overwriting existing goals/values. This also fixes a latent bug where the old
empty-body repair could blank a member's goals.

## Net effect
Every org and every member now starts with the anchors the alignment engine
needs — values (guardrails) and a goal (direction). No more "unanchored" members
or value-less orgs slipping through, so the Advisor/Copilot/briefings always have
a "north" to reason from.

## Verification
- `node --check` on server.js/app.js. Live check: try finishing setup with no
  value/goal — it should stop you.

## Still open
- Per-group values lens; AI memory/profile upgrade; Graph/Google connectors.
