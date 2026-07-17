# Architecture — IntelliQ OS

Four layers move reality into IntelliQ and let IntelliQ act back on it, all built as
universal contracts (one kernel; domain-specific behaviour at the edges):

```
Outside world → Connections → Truth Pipeline → Kernel → Execution Layer → Outside world
```

**Truth Pipeline** (bringing reality in — trustworthy by construction):
`raw record → approved meaning (mapping) → resolved identity → canonical evidence →
kernel signal`. Modules: `lib/evidence.js` (envelope), `lib/connector-sdk.js` +
identity re-resolution, `lib/mapping.js` (approval lifecycle), `lib/sync.js` (durable
sync runs, health, dead-letter).

**Execution Layer** (letting IntelliQ participate — `lib/action.js` + `lib/policy.js`):
every capability is one contract —
`recommend → draft → confirm → execute → observe → evaluate → learn` — with three
authority levels (recommend / draft / execute). Before any outward or destructive
step, the **Policy Engine** (the org's constitution) decides
`allow / require_approval / deny / escalate`. The loop closes on *evaluate* — did the
action actually improve the organisation? — and feeds that back to the kernel. Read,
reason, and act are separate authorities. A capability plugs stage executors into the
registry; no capability gets bespoke endpoints or its own truth logic.

---

# Organisational language

The single rule that keeps IntelliQ universal at its core while speaking every
organisation's own voice. Three concerns are kept **separate on purpose**:

| Concern | Lives in | Example |
|---|---|---|
| **Meaning** | the kernel's universal primitives — never changes | `person`, `group`, `event`, `observation`, `metric`, `intervention`, `outcome` |
| **Language** | the org's resolved domain vocabulary (display only) | `person → "player"`, `group → "team"`, `event → "match"` |
| **Context** | the subject's actual role + the org's own named structures | "The Captain", "Under-18s", "a staff member" |

> **Design law.** No provider, industry, role, or workflow is hard-coded into the
> kernel when it can be expressed as a universal primitive, a capability, or a
> configurable domain definition. Domain packs are a *display lens*, not hidden
> industry logic.

## The one pipeline

Organisational language has exactly **one source**. Every post-setup AI prompt
receives it the same way — no prompt independently decides what a club, school, or
business "sounds like."

```
Organisation configuration (orgMode / chosen pack / custom words)
        ↓  ai/packs.js
resolveDomain(orgMode, { pack, vocab })      → { id, label, vocab }
        ↓  ai/packs.js
domainDirective(domain, { subjectRole, avoidGenericForSubject, concepts })
        ↓  server.js  _domainDirective(code, { userId })
Every AI prompt  (briefings, Studio, planning, insights, summaries, replies…)
```

`domainDirective` is the **only** place domain language is expressed. It emits a
compact instruction the model reads as *context*, not a find-and-replace command,
and returns **empty** in universal mode with no role nuance (zero tokens, unchanged
behaviour). It always instructs: use the words naturally; respect each subject's
actual role; preserve the org's own named structures; custom words win; and wording
never changes a claim's meaning, source, or confidence (a "coach note" is still an
observation, not a verified fact).

Generated prose is stamped with `{ pack, vocabVersion }` (`_domainStamp`) so
historical outputs stay attributable to the vocabulary in effect when they were
produced, even after an org later changes its display language.

## `orgMode` is configuration, not language

`orgMode` was removed from **language generation** (no more "You are advising
athletes in a sports club" embedded in prompts). It is still legitimately used for
**configuration**: selecting an initial domain pack, onboarding, suggesting
workflows/modules, industry-relevant examples, and analytics. It may appear as a
**fact in a data payload** (e.g. `ORG: Trafford United FC (sports)`), but it must
never inject vertical *prose* that steers the model's voice.

`buildReflectionPrompt` and `buildScenarioPrompt` are deliberately
vertical-neutral: what the model knows about the org comes from the org's **own
description** (`orgSummary`) plus the resolved domain — never an industry template.

## Pre-classification prompts stay generic

Discovery prompts (`/api/org/describe`, org-setup suggestions) run **before** a
domain exists. They must stay industry-neutral — feeding a premature domain
assumption in would bias the very classification they exist to perform.

```
Generic discovery → org description → suggested pack → admin confirms/customises
→ resolved vocabulary enters later prompts
```

## Role sensitivity — permissions never invent a title

Permission tier (`superadmin`/`admin`/`coach`/`member`) and leadership status are
**not** semantic roles. A team captain has leadership permissions but is still a
player; a department admin manages settings but may not be a "manager". So role
context **suppresses** the generic noun — it never **infers** a profession.

The ladder (`_subjectRoleContext` in `server.js`):

1. **Explicit role/title** on the record (`title`/`position`/`jobTitle`) → use it verbatim.
2. **Staff-tier role assigned by the org** (`coach`/`admin`/`superadmin`) → "a staff member" (the assigned tier, domain-neutral — not a guessed job).
3. **Leadership certain, no explicit role** (a member who leads — captain *or* staff) → suppress the generic noun, use their name. **No title invented.**
4. **Otherwise** (a plain member) → the resolved generic noun is correct.

## Deterministic fallback copy

No-key fallback strings use `_vc(code, key)` (the server-side counterpart of the
frontend `_v()`) so they still speak the org's language. Remaining low-traffic
fallbacks are migrated **opportunistically** toward structured templates
(`buildFallback(kind, { personLabel: vc('person'), … })`) whenever the surface is
touched — a dedicated sweep is only worth doing before a pilot that demonstrates
no-key behaviour. Passing whole sentences through vocabulary replacement is avoided.

## Guardrails (the truth layer)

- `scripts/packs-language-smoke.js` — the same facts render in sports/education/
  business/nonprofit language; custom words win; roles override generic labels;
  named structures preserved; no blind replacement; universal mode stays silent;
  `vocabVersion` is attributable.
- `scripts/domain-cleanup-smoke.js` — no legacy vertical prose survives anywhere in
  the server; the role ladder never manufactures a title (the captain case is
  locked in).
