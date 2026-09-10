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

/* Is this list already canonical? The migration asks before touching anything, so a healthy store
   is never rewritten and never triggers a save. */
function needsRepair(list) {
  if (!Array.isArray(list)) return false;
  return list.some(m => !m || typeof m !== 'object' || Array.isArray(m)
    || typeof m.metricId !== 'string' || !m.metricId
    || metricName(m.name) === null || m.name !== metricName(m.name));
}

module.exports = { metricName, metricId, metricRecord, needsRepair };
