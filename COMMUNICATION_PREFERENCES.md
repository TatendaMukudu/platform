# COMMUNICATION_PREFERENCES.md — bounded personalisation

How a proactive insight *reads* can be tuned by the person receiving it. What can be tuned is a
**fixed, tiny allow-list**. This is deliberate: personalisation is a place privacy quietly leaks, so
IntelliQ makes protected traits **structurally impossible** to store or infer.

## The allow-list (`ai/proactive.PREF_SCHEMA`)

| Preference | Values | Default | Effect |
|---|---|---|---|
| `length` | `standard`, `brief` | `standard` | `brief` trims the body to its first sentence |
| `tone` | `warm`, `plain` | `warm` | `plain` drops the warm clause after an em dash |
| `cadence` | `as_it_happens`, `daily`, `weekly` | `as_it_happens` | how often proactive surfacing is expected (advisory; the surface itself stays pull-based today) |

That is the entire surface area. There is no free-text field, no "tell us about yourself," no learned
persona.

## Guarantees

- **Allow-list only.** `normalizePreferences(input)` keeps only these keys with these exact values and
  drops everything else. Any attempt to smuggle a protected trait as a key or value (`race`,
  `diagnosis`, `religion`, …) is simply not stored — there is nowhere to put it.
- **Never inferred.** Preferences are only ever set by the person explicitly, via
  `PUT /api/proactive/preferences`. IntelliQ never derives a preference from behaviour, and never
  infers a protected trait as a proxy for one.
- **Changes HOW, never WHAT.** `applyPreferences` only reshapes the rendered body of an insight. It
  never changes which insights surface, their severity, their order, or their evidence. Same inputs →
  same output (deterministic).
- **Self-audience only.** Preferences apply to a person's own insights. Leader-audience insights are
  **always** rendered in the standard, care-first form — a supporter never sees a member's preferences
  and cannot tune what they see about someone else.
- **No protected traits, any audience.** Separately from preferences, `audienceSafe` forbids
  protected-trait vocabulary in any rendered proactive text.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/proactive/preferences` | Returns the viewer's normalised preferences + the allow-list schema |
| PUT | `/api/proactive/preferences` | Stores `{ length, tone, cadence }` after normalisation; ignores anything else |

Body shape: `{ "preferences": { "length": "brief", "tone": "plain", "cadence": "daily" } }`.

## Why so small on purpose

A richer personalisation surface (channel, time-of-day, "how do you like feedback") is exactly where a
system starts inferring things about a person it was never told — and where a leader might glimpse
something private. Until there is a concrete pilot need, the allow-list stays minimal. Growth here is a
deliberate product decision, not a default, and any new key must be provably free of protected-trait
inference before it ships.

## Where to look

- `ai/proactive.js`: `PREF_SCHEMA`, `PREF_DEFAULTS`, `normalizePreferences`, `applyPreferences`.
- `server.js`: `proactivePrefs` store + `/api/proactive/preferences`.
- `scripts/proactive-smoke.js` tests 12, 13, 17 — junk/protected keys dropped, deterministic
  application, HTTP round-trip stores only allow-listed knobs.
