# Going Live — DB + keys + seed (≈15 min)

Everything below is what turns the built product into a real, running pilot. The
code is already done; this is just plugging in the three things it needs.

## 1 · A free, reliable database (Neon Postgres)
1. Create a free project at **https://neon.tech** (the free tier is plenty for a pilot).
2. Copy the connection string (starts with `postgres://…`).
3. On Render → your service → **Environment**, set:
   - `DATABASE_URL = postgres://…`

That's the only required variable. `db.js` creates its schema automatically on boot.

## 2 · The AI keys (Claude + OpenAI)
Set on Render → Environment:
- `ANTHROPIC_API_KEY = sk-ant-…`   ← Claude runs all the reasoning (advisor, briefings, reflections)
- `OPENAI_API_KEY = sk-…`          ← automatic fallback if Claude hiccups, **and** powers embeddings (cross-member similarity)

The gateway uses **Claude first, OpenAI as fallback** — so an outage on either
never takes the product down, and it runs on **either key alone**. Embeddings turn
on automatically once `OPENAI_API_KEY` is present (no other config needed).

Optional overrides (sensible defaults already set):
- `AI_MODEL_REASON` (default `claude-sonnet-4-6`) · `AI_MODEL_MICRO` (default Haiku)
- `OPENAI_MODEL` (default `gpt-4o-mini`)
- `EMBEDDINGS_MODEL` (default `text-embedding-3-small`, dim 1536)

## 3 · Seed a real demo squad (so it's not empty on first open)
From your machine (or a Render shell), with the same `DATABASE_URL`:

```bash
DATABASE_URL='postgres://…' node scripts/seed.js
```

This writes a complete demo club with ~6 weeks of back-dated check-ins + signals,
engineered so the kernel shows a **real, varied briefing immediately**:
- **Maya Chen** — went quiet → *withdrawal*
- **Deshawn Ellis** — load up while mood dips → *overload*
- **Priya Anand** — quietly improving → *bright spot*
- **Jordan / Sam / Chris** — steady

⚠ It overwrites the `main` store, so point it at your **demo/pilot** database.

**Log in (all passwords `demo1234`):**
- Coach → `coach@demo.club` (lands on the unified Home: their own read + the squad)
- Athlete → `maya@demo.club` (their private mirror) · also deshawn / priya / jordan / sam / chris `@demo.club`

## 4 · What to watch (the actual test)
Open as the coach. The one question that decides everything:
> **Does the briefing make you want to do something you wouldn't have?**

If yes for even one athlete, the thesis holds — put it in front of a real coach at
Alma or Kettering next. If it's "nice but I wouldn't act," that's the most valuable
thing you can learn, early and cheap.

## Notes
- No `DATABASE_URL` → the app refuses to boot (by design — no silent data loss).
- No AI key → the product still runs; AI-written text (reflections, narratives)
  shows a safe fallback line, and the deterministic kernel (patterns, baselines,
  roster, briefing structure) works fully.
- To reset the demo: re-run `node scripts/seed.js`.
