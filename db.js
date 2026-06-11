/* ============================================================
   db.js — Postgres persistence layer for IntelliQ

   Replaces store.json file I/O with Neon Postgres.
   Uses a single JSONB blob ('main') so the in-memory object
   structure stays identical — only the transport changes.

   Startup output (all required, no silent failures):
     [db] Connecting to Neon Postgres...
     [db] Connected ✓ (database: neondb)
     [db] Schema ready ✓
     [db] Store loaded ✓  orgs:2  users:15  metrics:8

   FATAL if DATABASE_URL is not set or connection fails at boot.
   There is NO silent fallback — without Postgres the platform
   cannot persist anything and the process exits.
   ============================================================ */

const { Pool } = require('pg');

/* ── Require DATABASE_URL before anything else ────────────────────────────── */
if (!process.env.DATABASE_URL) {
  console.error('');
  console.error('[db] ═══════════════════════════════════════════════════════');
  console.error('[db] FATAL: DATABASE_URL environment variable is not set.');
  console.error('[db]');
  console.error('[db] Steps to fix:');
  console.error('[db]   1. Create a free Neon project at https://neon.tech');
  console.error('[db]   2. Go to your project → Connection Details');
  console.error('[db]   3. Copy the connection string (starts with postgres://)');
  console.error('[db]   4. Add DATABASE_URL=<connection-string> to Render → Environment');
  console.error('[db] ═══════════════════════════════════════════════════════');
  console.error('');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 8000,
});

/* ── Schema ───────────────────────────────────────────────────────────────── */
const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS iq_store (
    store_key   TEXT        PRIMARY KEY,
    store_value JSONB       NOT NULL DEFAULT '{}',
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

/* ── init ─────────────────────────────────────────────────────────────────── *
   Connect to Postgres, run schema, log diagnostics.
   Exits with code 1 on any failure — no partial starts.
   ─────────────────────────────────────────────────────────────────────────── */
async function init() {
  console.log('[db] Connecting to Neon Postgres...');

  let client;
  try {
    client = await pool.connect();
  } catch (err) {
    console.error('[db] FATAL: Cannot connect to Postgres.');
    console.error('[db] Error:', err.message);
    console.error('[db] Verify DATABASE_URL is correct and Neon project is active.');
    process.exit(1);
  }

  try {
    const dbRes = await client.query('SELECT current_database()');
    const dbName = dbRes.rows[0]?.current_database || '(unknown)';
    console.log(`[db] Connected ✓ (database: ${dbName})`);

    await client.query(SCHEMA_SQL);
    console.log('[db] Schema ready ✓');
  } catch (err) {
    console.error('[db] FATAL: Schema initialisation failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

/* ── loadMain ─────────────────────────────────────────────────────────────── *
   Returns the full store object (same shape as store.json was).
   Logs a diagnostic summary of what was found.
   Exits on DB error — never returns partial/undefined data.
   ─────────────────────────────────────────────────────────────────────────── */
async function loadMain() {
  try {
    const res = await pool.query(
      "SELECT store_value FROM iq_store WHERE store_key = 'main'"
    );

    if (res.rows.length === 0) {
      console.log('[db] Store is empty — starting fresh.');
      return {};
    }

    const data = res.rows[0].store_value;

    // Diagnostic summary
    const orgs    = Object.keys(data.orgMeta    || {}).length;
    const users   = Object.values(data.orgUsers || {})
                      .reduce((n, u) => n + Object.keys(u || {}).length, 0);
    const metrics = Object.values(data.orgMetrics || {})
                      .reduce((n, m) => n + (Array.isArray(m) ? m.length : 0), 0);

    console.log(`[db] Store loaded ✓  orgs:${orgs}  users:${users}  metrics:${metrics}`);
    return data;

  } catch (err) {
    console.error('[db] FATAL: Failed to load store from Postgres:', err.message);
    process.exit(1);
  }
}

/* ── saveMain ─────────────────────────────────────────────────────────────── *
   Upserts the full store object. Called by scheduleSave() in server.js.
   Throws on error (caller should catch and log — non-fatal for the request).
   ─────────────────────────────────────────────────────────────────────────── */
async function saveMain(data) {
  await pool.query(
    `INSERT INTO iq_store (store_key, store_value, updated_at)
     VALUES ('main', $1, NOW())
     ON CONFLICT (store_key)
     DO UPDATE SET store_value = EXCLUDED.store_value,
                   updated_at  = NOW()`,
    [data]
  );
}

module.exports = { init, loadMain, saveMain };
