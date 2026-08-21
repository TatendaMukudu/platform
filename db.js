/* ============================================================
   db.js — Postgres persistence layer for IntelliQ

   Replaces store.json file I/O with Neon Postgres.
   Uses a single JSONB blob ('main') so the in-memory object
   structure stays identical — only the transport changes.

   Startup output (all required, no silent failures):
     [db] Connecting to Neon Postgres...
     [db] Connected (database: neondb)
     [db] Schema ready
     [db] Store loaded  orgs:2  users:15  metrics:8

   FATAL if DATABASE_URL is not set or connection fails at boot.
   There is NO silent fallback — without Postgres the platform
   cannot persist anything and the process exits.
   ============================================================ */

const { Pool } = require('pg');

/* ── DB_OPTIONAL: in-memory test mode ─────────────────────────────────────────
   When DB_OPTIONAL=1 (used by the endpoint smoke test), skip the fatal exit and
   run with no Postgres — init/loadMain/saveMain become no-ops. Production is
   unchanged: DATABASE_URL is set, DB_OPTIONAL is not, and the real pool is used. */
const DB_OPTIONAL = process.env.DB_OPTIONAL === '1';

/* ── Require DATABASE_URL before anything else ────────────────────────────── */
if (!process.env.DATABASE_URL && !DB_OPTIONAL) {
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

const pool = process.env.DATABASE_URL ? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 8000,
}) : null;

/* ── Schema ───────────────────────────────────────────────────────────────── */
const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS iq_store (
    store_key   TEXT        PRIMARY KEY,
    store_value JSONB       NOT NULL DEFAULT '{}',
    rev         BIGINT      NOT NULL DEFAULT 0,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  ALTER TABLE iq_store ADD COLUMN IF NOT EXISTS rev BIGINT NOT NULL DEFAULT 0;
  CREATE TABLE IF NOT EXISTS cold_evidence (
    org_code    TEXT        NOT NULL,
    evidence_id TEXT        NOT NULL,
    envelope    JSONB,
    raw_record  JSONB,
    archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    erased_at   TIMESTAMPTZ,
    PRIMARY KEY (org_code, evidence_id)
  );
`;

/* ── init ─────────────────────────────────────────────────────────────────── *
   Connect to Postgres, run schema, log diagnostics.
   Exits with code 1 on any failure — no partial starts.
   ─────────────────────────────────────────────────────────────────────────── */
async function init() {
  if (!pool) { console.log('[db] DB_OPTIONAL — running in-memory, no Postgres.'); return; }
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
    console.log(`[db] Connected (database: ${dbName})`);

    await client.query(SCHEMA_SQL);
    console.log('[db] Schema ready');
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
  if (!pool) return {};
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

    console.log(`[db] Store loaded  orgs:${orgs}  users:${users}  metrics:${metrics}`);
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
  if (!pool) return;
  await pool.query(
    `INSERT INTO iq_store (store_key, store_value, updated_at)
     VALUES ('main', $1, NOW())
     ON CONFLICT (store_key)
     DO UPDATE SET store_value = EXCLUDED.store_value,
                   updated_at  = NOW()`,
    [data]
  );
}

/* ── SPLIT PERSISTENCE ────────────────────────────────────────────────────── *
   saveMain above writes the entire platform — every org, user, conversation and
   inquiry — on every call. Neon sits outside Render, so each of those writes is
   billed egress over the public internet, and a single conversation turn ships
   the whole product twice. These functions write durable UNITS instead: one row
   per store, per organisation, so a mutation costs what it changed.

   Deliberately still key/value. The durable-unit boundary is the fix; a
   relational schema is a different project with different risks.
   ─────────────────────────────────────────────────────────────────────────── */

/* Write several units in ONE transaction. A save cycle that touches a
   conversation and the inquiry it produced must land together or not at all —
   otherwise a crash between two statements leaves the two halves of one logical
   turn disagreeing, which the single-blob write could never do. */
async function saveStores(units, { expect = {} } = {}) {
  if (!pool) return { rows: 0, bytes: 0, conflicts: [] };
  const entries = Object.entries(units || {});
  if (!entries.length) return { rows: 0, bytes: 0, conflicts: [] };

  let bytes = 0;
  const conflicts = [];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [key, value] of entries) {
      const json = JSON.stringify(value);
      bytes += Buffer.byteLength(json, 'utf8');
      const res = await client.query(
        `INSERT INTO iq_store (store_key, store_value, rev, updated_at)
         SELECT $1, $2::jsonb, 1, NOW()
          WHERE $3 = 0
         ON CONFLICT (store_key)
         DO UPDATE SET store_value = EXCLUDED.store_value,
                       rev         = iq_store.rev + 1,
                       updated_at  = NOW()
          WHERE iq_store.rev = $3`,
        [key, json, Number(expect[key] || 0)]
      );
      if (res.rowCount !== 1) conflicts.push(key);
    }
    if (conflicts.length) {
      await client.query('ROLLBACK');
      return { rows: 0, bytes, conflicts };
    }
    await client.query('COMMIT');
    return { rows: entries.length, bytes, conflicts: [] };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw err;                       // caller keeps the units dirty and retries
  } finally {
    client.release();
  }
}

/* Read every split unit back. Returns { 'store:orgUsers:acme': {...}, ... } —
   reassembly into the in-memory shape belongs to the caller, which is the only
   place that knows that shape. */
async function loadStores({ withRevisions = false } = {}) {
  if (!pool) return withRevisions ? { units: {}, revisions: {} } : {};
  const res = await pool.query(
    "SELECT store_key, store_value, rev FROM iq_store WHERE store_key LIKE 'store:%'"
  );
  const units = {}, revisions = {};
  for (const r of res.rows) {
    units[r.store_key] = r.store_value;
    revisions[r.store_key] = Number(r.rev || 0);
  }
  return withRevisions ? { units, revisions } : units;
}

/* Remove unit rows that no longer exist in memory. Deletion was free under the
   old model because the whole blob was replaced; under split rows an emptied
   unit would otherwise persist forever as a ghost. */
async function deleteStores(keys, { expect = {} } = {}) {
  if (!pool || !keys || !keys.length) return { rows: 0, conflicts: [] };
  const client = await pool.connect();
  const conflicts = [];
  let rows = 0;
  try {
    await client.query('BEGIN');
    for (const key of keys) {
      const res = await client.query(
        `DELETE FROM iq_store
          WHERE store_key = $1
            AND rev = $2`,
        [key, Number(expect[key] || 0)]
      );
      if (res.rowCount === 1) rows++;
      else conflicts.push(key);
    }
    if (conflicts.length) {
      await client.query('ROLLBACK');
      return { rows: 0, conflicts };
    }
    await client.query('COMMIT');
    return { rows, conflicts: [] };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw err;
  } finally {
    client.release();
  }
}

/* What the store actually costs, per row. The one number the bandwidth
   investigation could not get from the repository. */
async function storeSizes(limit = 20) {
  if (!pool) return [];
  const res = await pool.query(
    `SELECT store_key, pg_column_size(store_value) AS bytes, updated_at
       FROM iq_store ORDER BY pg_column_size(store_value) DESC LIMIT $1`,
    [limit]
  );
  return res.rows;
}

/* ── COLD EVIDENCE ────────────────────────────────────────────────────────── *
   The hot evidence log is a bounded reasoning working set. These rows are the
   durable reference target for evidence that leaves it. Every operation is
   tenant-scoped by the composite (org_code, evidence_id) key. */
async function archiveColdEvidence(orgCode, records) {
  const rows = Array.isArray(records) ? records : [records];
  if (!rows.length) return { archived: 0 };
  if (!pool) return { archived: rows.length };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const row of rows) {
      const envelope = row && (row.envelope || row);
      if (!envelope || !envelope.id) throw new Error('cold evidence requires an evidence id');
      await client.query(
        `INSERT INTO cold_evidence
           (org_code, evidence_id, envelope, raw_record, archived_at, erased_at)
         VALUES ($1, $2, $3::jsonb, $4::jsonb, NOW(), NULL)
         ON CONFLICT (org_code, evidence_id) DO UPDATE
           SET envelope = EXCLUDED.envelope,
               raw_record = EXCLUDED.raw_record,
               archived_at = NOW(),
               erased_at = NULL
         WHERE cold_evidence.erased_at IS NULL`,
        [orgCode, envelope.id, JSON.stringify(envelope), JSON.stringify(row.rawRecord ?? null)]
      );
    }
    await client.query('COMMIT');
    return { archived: rows.length };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw err;
  } finally {
    client.release();
  }
}

async function resolveColdEvidence(orgCode, evidenceId) {
  if (!pool) return null;
  const res = await pool.query(
    `SELECT envelope, raw_record AS "rawRecord", archived_at AS "archivedAt",
            erased_at AS "erasedAt"
       FROM cold_evidence
      WHERE org_code = $1 AND evidence_id = $2`,
    [orgCode, evidenceId]
  );
  return res.rows[0] || null;
}

/* Erasure retains only the composite identity and timestamp. That contentless
   tombstone distinguishes an erased id from one that never existed without
   retaining the envelope or raw personal content. */
async function eraseColdEvidence(orgCode, evidenceId) {
  if (!pool) return { erased: true };
  await pool.query(
    `INSERT INTO cold_evidence
       (org_code, evidence_id, envelope, raw_record, archived_at, erased_at)
     VALUES ($1, $2, NULL, NULL, NOW(), NOW())
     ON CONFLICT (org_code, evidence_id) DO UPDATE
       SET envelope = NULL, raw_record = NULL, erased_at = NOW()
     WHERE cold_evidence.org_code = $1 AND cold_evidence.evidence_id = $2`,
    [orgCode, evidenceId]
  );
  return { erased: true };
}

async function eraseColdEvidenceForSubject(orgCode, userId) {
  if (!pool) return { erased: 0 };
  const res = await pool.query(
    `UPDATE cold_evidence
        SET envelope = NULL, raw_record = NULL, erased_at = NOW()
      WHERE org_code = $1
        AND erased_at IS NULL
        AND (envelope->>'subjectId' = $2 OR envelope->>'ownerRef' = $2
             OR envelope->'attributes'->>'contributorId' = $2)`,
    [orgCode, userId]
  );
  return { erased: res.rowCount || 0 };
}

async function eraseColdEvidenceBefore(orgCode, cutoffIso) {
  if (!pool) return { erased: 0 };
  const res = await pool.query(
    `UPDATE cold_evidence
        SET envelope = NULL, raw_record = NULL, erased_at = NOW()
      WHERE org_code = $1
        AND erased_at IS NULL
        AND COALESCE(envelope->>'observedAt', envelope->>'createdAt') IS NOT NULL
        AND (COALESCE(envelope->>'observedAt', envelope->>'createdAt'))::timestamptz < $2::timestamptz`,
    [orgCode, cutoffIso]
  );
  return { erased: res.rowCount || 0 };
}

/* ── pgvector (optional) ──────────────────────────────────────────────────── *
   Cross-member similarity storage. Entirely non-fatal: if pgvector isn't
   available (extension missing / permissions), it disables itself and the app
   falls back to rule-based similarity. Enabled only after initVectors() succeeds
   AND embeddings are configured (checked by the caller).
   ─────────────────────────────────────────────────────────────────────────── */
let _vectorsEnabled = false;

async function initVectors(dim = 1536) {
  if (!pool) return;
  const d = parseInt(dim, 10) || 1536;
  let client;
  try {
    client = await pool.connect();
    await client.query('CREATE EXTENSION IF NOT EXISTS vector');
    await client.query(
      `CREATE TABLE IF NOT EXISTS member_vectors (
         org_code   TEXT NOT NULL,
         user_id    TEXT NOT NULL,
         embedding  vector(${d}) NOT NULL,
         summary    TEXT,
         updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         PRIMARY KEY (org_code, user_id)
       )`
    );
    try {
      await client.query(
        `CREATE INDEX IF NOT EXISTS member_vectors_emb_idx
           ON member_vectors USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)`
      );
    } catch (_) { /* index is best-effort */ }
    _vectorsEnabled = true;
    console.log('[db] pgvector ready — cross-member similarity enabled');
  } catch (err) {
    _vectorsEnabled = false;
    console.log('[db] pgvector not available — similarity uses rule-based fallback (' + err.message + ')');
  } finally {
    if (client) client.release();
  }
}

function vectorsReady() { return _vectorsEnabled; }

async function upsertMemberVector(orgCode, userId, embedding, summary) {
  if (!_vectorsEnabled || !Array.isArray(embedding) || !embedding.length) return;
  const vec = '[' + embedding.join(',') + ']';
  await pool.query(
    `INSERT INTO member_vectors (org_code, user_id, embedding, summary, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (org_code, user_id)
     DO UPDATE SET embedding = EXCLUDED.embedding, summary = EXCLUDED.summary, updated_at = NOW()`,
    [orgCode, userId, vec, summary || null]
  );
}

/* Nearest members by cosine distance. Returns [{ user_id, score }] (score 0..1). */
async function nearestMembers(orgCode, userId, k = 8) {
  if (!_vectorsEnabled) return [];
  const res = await pool.query(
    `SELECT user_id,
            1 - (embedding <=> (SELECT embedding FROM member_vectors WHERE org_code = $1 AND user_id = $2)) AS score
       FROM member_vectors
      WHERE org_code = $1 AND user_id <> $2
        AND EXISTS (SELECT 1 FROM member_vectors WHERE org_code = $1 AND user_id = $2)
      ORDER BY embedding <=> (SELECT embedding FROM member_vectors WHERE org_code = $1 AND user_id = $2)
      LIMIT $3`,
    [orgCode, userId, k]
  );
  return res.rows || [];
}

module.exports = {
  init, loadMain, saveMain,
  saveStores, loadStores, deleteStores, storeSizes,
  archiveColdEvidence, resolveColdEvidence, eraseColdEvidence,
  eraseColdEvidenceForSubject, eraseColdEvidenceBefore,
  initVectors, vectorsReady, upsertMemberVector, nearestMembers,
};
