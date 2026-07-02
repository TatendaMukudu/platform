# Update — Embeddings + pgvector foundation (gated, ready to switch on)

**Merged to main:** `fbbc5e1` (deploying)

The scale version of cross-member similarity is now built and wired — but
**dormant** until you provision it. With no embeddings key (current prod),
nothing changes; the rule-based cohort keeps working.

## What was built
- **`ai/embeddings.js`** — embeds text via any OpenAI-compatible endpoint
  (OpenAI, Voyage…). Off unless `EMBEDDINGS_API_KEY` is set.
- **`db.js`** — `initVectors()` creates the `vector` extension, a
  `member_vectors` table, and an ivfflat index. **Non-fatal**: if pgvector isn't
  available it disables itself and logs — never blocks boot. Plus
  `upsertMemberVector()` and `nearestMembers()` (cosine).
- **Profile build** now fire-and-forget embeds each member's behavioural summary
  and upserts the vector (when enabled).
- **`/api/member/:id/similar`** uses **nearest-neighbour** cohort when live, else
  the existing pattern-overlap cohort. Both anonymous. Same endpoint + UI.

## To switch it on (your two inputs)
1. **Neon/Postgres:** ensure `CREATE EXTENSION vector` is allowed (Neon supports
   pgvector out of the box).
2. **Embeddings key:** set these env vars on Render:
   - `EMBEDDINGS_API_KEY` = your provider key (required)
   - `EMBEDDINGS_URL` (default `https://api.openai.com/v1/embeddings`)
   - `EMBEDDINGS_MODEL` (default `text-embedding-3-small`)
   - `EMBEDDINGS_DIM` (default `1536` — must match the model)

On next deploy it logs "pgvector ready ✓", profiles start embedding as they
rebuild, and "Similar patterns" switches to true nearest-neighbour — no code or
UI change. Until then it's invisible and safe.

## Notes / honesty
- I can't test the live pgvector path from here (no DB/key). The code follows the
  standard node-pg + pgvector pattern; first real run on your deploy is the
  confirmation.
- Vectors populate as profiles rebuild (on profile open / staleness), so
  similarity gets better over the first days after enabling.

## Verification
- `node --check` on server.js/db.js/embeddings.js; module loads disabled without a key.

## Still open
- Turn it on (env above) — then optional anonymised cross-ORG learning.
- Microsoft Graph / Google connectors (need your app registration).
