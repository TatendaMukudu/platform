/* ============================================================
   ai/metric-record.js — WHAT A METRIC IS, in one place.

   A metric record has always been `{ metricId, name, source, order, createdAt }` — that is the
   shape `POST /api/metrics` writes and the shape `PUT` and `DELETE` look records up by. But FOUR
   places built one: the write route, the org-approval flow, the Alma seed (with its own copy of
   the id hash), and the startup migration. Four builders of one record is how the store came to
   hold bare strings that rendered as "undefined" and could never be renamed or deleted, and how
   the seed's ids could silently drift from the server's.

   So the rule lives here, imported by all of them. `ai/` rather than a new layer because this is a
   pure function with no state and no I/O, exactly like the other kernel modules the seed already
   imports. It is deliberately NOT `ai/metrics.js`: that name is already taken by the per-org usage
   counter, which is a different thing entirely — usage events, not performance dimensions.

   THE ID IS DERIVED FROM THE NAME, not minted. A metric called "Sleep" has the same identity
   whether the seed created it, a coach typed it, or a migration repaired it — so re-seeding does
   not change a metric's identity and a restart does not churn it. The hash is djb2/base36, the
   same function `_contentHash` uses, so ids already stored keep the values they have.

   A NAME IS A STRING. Not a number, not an array, not an object. `String(entry.name)` used to
   coerce anything at all, so posting `{ name: { evil: 1 } }` stored a metric literally called
   "[object Object]", and a rename with the same body reached `.trim()` on an object and returned
   HTTP 500. Both are refused here, at the boundary, rather than at each call site.
   ============================================================ */

'use strict';

/* djb2 → base36. Kept identical to server.js's `_contentHash` on purpose: changing it would give
   every existing metric a new identity on the next migration pass. */
function _hash(s) {
  let h = 5381;
  const str = String(s == null ? '' : s);
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/* The one definition of an acceptable metric name. Returns the trimmed name, or null.

   `null` means "this is not a name", and every caller turns that into a refusal rather than a
   coercion. A number is not a name even though it has a toString; an object certainly is not. */
function metricName(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function metricId(name) {
  const n = metricName(name);
  return n ? `met_${_hash('metric:' + n)}` : null;
}

/* Build a canonical record from a bare name (the seed and the legacy migration) or from a partial
   object (the write route). Returns null when there is no lawful name, so a caller cannot
   accidentally store something shaped like a metric that is not one.

   An existing `metricId` is never rewritten — anything referencing that metric keeps working. */
function metricRecord(entry, order = 0, { now = null } = {}) {
  const isObj = entry && typeof entry === 'object' && !Array.isArray(entry);
  const name = metricName(isObj ? entry.name : entry);
  if (!name) return null;
  const created = (isObj && entry.createdAt) || now || new Date().toISOString();
  return {
    metricId: String((isObj && entry.metricId) || metricId(name)),
    name,
    source: (isObj && typeof entry.source === 'string' && entry.source.trim()) || 'org',
    order: Number.isFinite(isObj ? entry.order : NaN) ? entry.order : order,
    createdAt: created,
  };
}

/* THE ONE CASE NAME-UNIQUENESS ALONE DOES NOT COVER. A rename keeps the record's original id on
   purpose, so that anything referencing the metric keeps working — which means after renaming
   "Sleep" to "Rest Quality" there is a record holding `met_<hash of Sleep>` whose name is no
   longer Sleep. Creating "Sleep" again then derives that same id, and the two collide even though
   their names differ, so the name check never sees it. Reproduced.

   The derived id stays the first choice, so nothing already stored changes and the seed keeps the
   ids it has. Only when that exact id is already taken does a deterministic suffix step in. */
function uniqueMetricId(name, takenIds = []) {
  const base = metricId(name);
  if (!base) return null;
  const taken = new Set(takenIds);
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${_hash(String(Date.now()))}`;
}

/* ── A NAME IS AN IDENTITY, SO TWO RECORDS CANNOT SHARE ONE ────────────────────────────────────
   The id is derived from the name, which is what keeps a metric's identity stable across the
   seed, the server and a restart. The cost of that choice is that two records with one name are
   two records with one PRIMARY KEY, and nothing stopped the write route creating them. An
   independent review reported it and every part reproduced over HTTP:

     "Sleep" created twice       -> two records, both met_1fxyk9o
     deleting either one         -> BOTH disappear (the delete filters by id)
     rename away, recreate       -> a collision between "Rest Quality" and a new "Sleep"
     rename one of a pair        -> `find` matched the FIRST record, so the wrong one was renamed

   The fix keeps the derived id and adds the rule the id always implied: a name is unique within
   an organisation, compared case-insensitively because "Sleep" and "sleep" are one metric to
   everybody except a hash. Creating a name that exists returns the record that exists, which is
   the same answer the Org Tree gives when somebody presses create twice — a retry is not a second
   thing. No stored identity changes: this stops a duplicate being made, it does not renumber
   anything already there. */
function findByName(list, name) {
  const n = metricName(name);
  if (!n || !Array.isArray(list)) return null;
  const key = n.toLowerCase();
  return list.find(m => m && metricName(m.name) && m.name.trim().toLowerCase() === key) || null;
}

/* Is this list already canonical? The migration asks before touching anything, so a healthy store
   is never rewritten and never triggers a save. A duplicated name counts as damage: the store
   already holds two rows under one id and cannot be addressed unambiguously. */
function needsRepair(list) {
  if (!Array.isArray(list)) return false;
  const shapeWrong = list.some(m => !m || typeof m !== 'object' || Array.isArray(m)
    || typeof m.metricId !== 'string' || !m.metricId
    || metricName(m.name) === null || m.name !== metricName(m.name));
  if (shapeWrong) return true;
  const ids = new Set(list.map(m => m.metricId));
  return ids.size !== list.length;
}

/* Drop later records that collide with an earlier one, by id or by name. The FIRST occurrence
   wins, so the record a person has been looking at keeps its place and its identity. */
function dedupe(list) {
  if (!Array.isArray(list)) return [];
  const seenId = new Set(), seenName = new Set(), out = [];
  for (const m of list) {
    if (!m || typeof m !== 'object') continue;
    const n = metricName(m.name);
    if (!n) continue;
    const key = n.toLowerCase();
    if (seenId.has(m.metricId) || seenName.has(key)) continue;
    seenId.add(m.metricId); seenName.add(key);
    out.push(m);
  }
  return out;
}

module.exports = { metricName, metricId, metricRecord, needsRepair, findByName, dedupe, uniqueMetricId };
