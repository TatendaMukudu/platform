/* ============================================================
   lib/mapping.js — the Mapping Approval Lifecycle (the interpretation boundary).

   THE rule this enforces: AI or generic inspection may PROPOSE what external data
   means, but only an APPROVED, VERSIONED mapping may create canonical evidence.

       draft → proposed → approved → active → superseded / retired

   A mapping version is IMMUTABLE once it leaves draft: editing an approved mapping
   forks a new draft. Every promotion records the mapping version it used, so
   history is always attributable and reprocessing is explicit — activating a new
   version never silently reinterprets old evidence.

   Pure + dependency-free (schema fingerprinting, drift detection, deterministic
   transforms, preview). The server owns storage, permissions, and audit.
   ============================================================ */

const STATUSES = ['draft', 'proposed', 'approved', 'active', 'superseded', 'retired'];
/* Once a version reaches these, its mapping RULES are frozen — an edit forks a new
   draft version instead of mutating an approved contract. */
const IMMUTABLE_STATUSES = ['approved', 'active', 'superseded', 'retired'];

const _num = (v) => (typeof v === 'number' ? v : (typeof v === 'string' && /^-?\d+(?:\.\d+)?$/.test(v.trim()) ? Number(v.trim()) : null));
const _coarseType = (v) => (_num(v) != null ? 'num' : (v == null || v === '' ? 'null' : 'str'));

/* Fingerprint the SHAPE of a set of records: the sorted field names + a coarse
   type per field. Two payloads with the same fingerprint mean the same thing; a
   change is schema drift the mapping must be re-reviewed for. */
function schemaFingerprint(records) {
  const recs = (Array.isArray(records) ? records : [records]).filter(r => r && typeof r === 'object' && !Array.isArray(r)).slice(0, 100);
  const types = {};
  recs.forEach(r => Object.keys(r).forEach(k => {
    const t = _coarseType(r[k]);
    if (!types[k] || types[k] === 'null') types[k] = t;     // first non-null type wins
  }));
  const fields = Object.keys(types).filter(Boolean).sort();
  const s = fields.map(k => `${k}:${types[k]}`).join('|');
  let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return { hash: h.toString(36), fields, types };
}

/* Detect schema drift between an incoming payload and an APPROVED mapping. We do
   NOT guess when the source changes shape — drift PAUSES ingestion. Catches:
   a renamed/removed field (the mapping's field is gone), a type change (a field the
   mapping reads as a number now arrives non-numeric), and a missing identity field. */
function detectDrift(records, mapping) {
  const fp = schemaFingerprint(records);
  const present = new Set(fp.fields);
  const missing = [];
  const typeChanged = [];
  (mapping.fields || []).filter(f => f.include !== false).forEach(f => {
    if (!present.has(f.from)) { missing.push(f.from); return; }
    // a field the mapping treats as a metric must still read numeric
    if ((f.primitive === 'metric' || f.evidenceType === 'metric') && fp.types[f.from] && fp.types[f.from] !== 'num') {
      typeChanged.push({ field: f.from, was: 'num', now: fp.types[f.from] });
    }
  });
  const identityMissing = !!mapping.subjectField && !present.has(mapping.subjectField);
  const drifted = missing.length > 0 || typeChanged.length > 0 || identityMissing;
  return { drifted, missing, typeChanged, identityMissing, incoming: fp.hash, expected: mapping.schemaFingerprint || null };
}

/* Only an ACTIVE mapping may create (promote) canonical evidence. Everything else —
   draft, proposed, approved-but-not-activated, superseded, retired — cannot. */
function canPromote(mapping) { return !!mapping && mapping.status === 'active'; }

function isImmutable(mapping) { return !!mapping && IMMUTABLE_STATUSES.includes(mapping.status); }

/* Deterministic per-field transform. AI may SUGGEST a transform, but runtime always
   executes these saved, closed-form rules — never a model call. */
function applyTransform(value, transform) {
  const n = _num(value);
  if (n == null || !transform) return n;
  let out = n;
  if (typeof transform.scale === 'number') out *= transform.scale;
  if (typeof transform.offset === 'number') out += transform.offset;
  if (transform.round != null) { const p = Math.pow(10, transform.round | 0); out = Math.round(out * p) / p; }
  return out;
}

/* Apply a mapping to ONE record → normalized items (deterministic; the saved rules
   only). Returns [] on mismatch. Mirrors the envelope's field vocabulary so the
   server can wrap each item directly. */
function applyMapping(record, mapping) {
  if (!record || !mapping || !Array.isArray(mapping.fields)) return [];
  const out = [];
  const date = mapping.dateField ? record[mapping.dateField] : (record.date || record.ts || record.timestamp || null);
  const event = mapping.eventField ? record[mapping.eventField] : null;
  mapping.fields.filter(f => f.include !== false).forEach(f => {
    const value = applyTransform(record[f.from], f.transform);
    if (value == null || !Number.isFinite(value)) return;
    out.push({
      type: f.evidenceType || (f.primitive === 'metric' ? 'metric' : 'metric'),
      label: String(f.label || f.from).slice(0, 80),
      value, unit: f.unit || null, date: date || null, event: event || null,
    });
  });
  return out;
}

/* Preview: transform several sample records into the items an admin will approve.
   Returns { fingerprint, samples:[{ input, output }] } — the "show before approve". */
function preview(records, mapping, n = 5) {
  const recs = (Array.isArray(records) ? records : [records]).filter(r => r && typeof r === 'object' && !Array.isArray(r)).slice(0, n);
  return {
    fingerprint: schemaFingerprint(recs).hash,
    samples: recs.map(r => ({ input: r, output: applyMapping(r, mapping) })),
  };
}

module.exports = {
  STATUSES, IMMUTABLE_STATUSES,
  schemaFingerprint, detectDrift, canPromote, isImmutable,
  applyTransform, applyMapping, preview,
};
