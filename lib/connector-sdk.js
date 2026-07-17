/* ============================================================
   lib/connector-sdk.js — the Connector SDK & capability contract.

   The foundation for "any authorized data an org produces becomes usable context,
   without entering it twice." It defines:

     • PRIMITIVES  — the universal IntelliQ data model every external record maps to
     • CAPABILITIES — what a connection can DO (read context vs. take action)
     • resolveIdentity() — map an external record to a Person, WITH CONFIDENCE
       (never silently merge an ambiguous match)
     • proposeMapping() — inspect a sample and draft a field→primitive mapping
     • applyMapping()   — apply a VERIFIED, versioned mapping deterministically
       (so the AI never freely reinterprets unknown JSON on every sync)
     • MANIFESTS — reference connectors declaring their auth + capabilities

   Pure and dependency-free so it can be unit-tested by the harness in isolation.
   ============================================================ */

/* The universal data model — external records normalize into these. */
const PRIMITIVES = [
  'person', 'organization', 'team', 'role', 'relationship', 'event', 'activity',
  'observation', 'metric', 'document', 'message', 'task', 'decision',
  'commitment', 'goal', 'assessment', 'intervention', 'outcome',
];

/* Capabilities describe what a connection provides — organised by capability, NOT by
   app or industry, so Gmail and Outlook both offer `communication.read`, and a GPS
   vendor, a wearable, and a gradebook all offer `metrics.ingest`. Broad at the core:
   a connector declares capabilities, never a vertical. Split into knowledge (read /
   ingest) and change (action); action capabilities always require confirmation +
   audit before anything is written back to the outside world. */
const CAPABILITIES = {
  read: [
    'communication.read',   // email, chat, messages (Gmail, Outlook, Teams, Slack)
    'calendar.read',        // events, availability
    'files.read',           // documents, sheets, attachments
    'tasks.read',           // to-dos, tickets, assignments
    'people.sync',          // roster / directory of members
    'metrics.ingest',       // any numeric stream (GPS, wearables, grades, KPIs)
    'events.ingest',        // discrete occurrences (a match, a lesson, a shift)
    'observations.ingest',  // qualitative notes / feedback / wellbeing entries
  ],
  action: [
    'communication.send',   // send a message / email
    'calendar.manage',      // create / update events
    'tasks.manage',         // create / update tasks
    'report.share',         // push a summary out
    'intervention.create',  // propose a support action
  ],
};
const ALL_CAPABILITIES = [...CAPABILITIES.read, ...CAPABILITIES.action];

const SUBJECT_KEYS = ['userid', 'id', 'externalid', 'email', 'mail', 'emailaddress', 'name', 'fullname', 'player', 'member', 'athlete', 'employee', 'student', 'user', 'person'];
const META_KEYS    = ['date', 'ts', 'timestamp', 'time', 'label', 'value', 'unit', 'event', 'eventid', 'externalid', 'id'];

/* ── Identity resolution ────────────────────────────────────────────────────
   Returns { id, confidence, key } where confidence is:
     confirmed  — matched by email or a linked external id (safe to use)
     probable   — matched by a UNIQUE exact name (surface for review)
     conflict   — the name matched more than one person (never auto-merge)
     unmatched  — no match found
   `users` is { userId → { email, name, externalIds? } }. */
function resolveIdentity(users, record) {
  const norm = k => String(k).toLowerCase().replace(/[\s_-]/g, '');
  const get = (keys) => { for (const k of Object.keys(record || {})) if (keys.includes(norm(k))) { const v = record[k]; if (v != null && v !== '') return String(v); } return null; };
  const ids = Object.keys(users || {});

  const rawId = get(['userid', 'id', 'user']);
  if (rawId && users[rawId]) return { id: rawId, confidence: 'confirmed', key: 'userId' };

  const ext = get(['externalid', 'accountid']);
  if (ext) { const id = ids.find(k => (users[k].externalIds || []).includes(ext)); if (id) return { id, confidence: 'confirmed', key: 'externalId' }; }

  const email = get(['email', 'mail', 'emailaddress']);
  if (email) { const e = email.toLowerCase().trim(); const id = ids.find(k => (users[k].email || '').toLowerCase().trim() === e); if (id) return { id, confidence: 'confirmed', key: 'email' }; }

  const name = get(['name', 'fullname', 'player', 'member', 'athlete', 'employee', 'student', 'person']);
  if (name) {
    const n = name.toLowerCase().trim();
    const matches = ids.filter(k => (users[k].name || '').toLowerCase().trim() === n);
    if (matches.length === 1) return { id: matches[0], confidence: 'probable', key: 'name' };
    if (matches.length > 1)  return { id: null, confidence: 'conflict', key: 'name', ambiguous: name };
  }
  return { id: null, confidence: 'unmatched', key: null };
}

/* ── Mapping proposal ────────────────────────────────────────────────────────
   Inspect sample records and draft a mapping contract for an admin to VERIFY.
   Deterministic + heuristic; the server may refine `label` wording with AI, but the
   structure (which field is the subject, which are metrics) is proposed here so the
   admin signs off before anything is trusted. */
function proposeMapping(records) {
  const recs = (Array.isArray(records) ? records : [records]).filter(r => r && typeof r === 'object' && !Array.isArray(r)).slice(0, 50);
  if (!recs.length) return null;
  const keys = [...new Set(recs.flatMap(r => Object.keys(r)))];
  const norm = k => k.toLowerCase().replace(/[\s_-]/g, '');
  const subjectField = keys.find(k => ['email', 'mail', 'emailaddress'].includes(norm(k)))
    || keys.find(k => SUBJECT_KEYS.includes(norm(k)));
  const dateField = keys.find(k => ['date', 'ts', 'timestamp', 'time'].includes(norm(k))) || null;
  const eventField = keys.find(k => ['event', 'eventid', 'fixture', 'match', 'session'].includes(norm(k))) || null;
  const fields = keys.filter(k => k !== subjectField && k !== dateField && k !== eventField && !META_KEYS.includes(norm(k)))
    .map(k => {
      const vals = recs.map(r => r[k]).filter(v => v != null && v !== '');
      const numeric = vals.filter(v => typeof v === 'number' || /^-?\d+(?:\.\d+)?$/.test(String(v).trim())).length;
      const isNum = vals.length && numeric / vals.length >= 0.6;
      return isNum ? { from: k, primitive: 'metric', label: k, include: true } : null;
    }).filter(Boolean);
  if (!subjectField || !fields.length) return null;
  return { version: 1, status: 'proposed', subjectField, dateField, eventField, fields };
}

/* ── Mapping application ─────────────────────────────────────────────────────
   Apply a VERIFIED mapping to one record → normalized items with provenance.
   Only fields the admin marked include:true are used, so future data is validated
   against the agreed contract rather than re-guessed. Returns [] on mismatch. */
function applyMapping(record, mapping) {
  if (!record || !mapping || !Array.isArray(mapping.fields)) return [];
  const out = [];
  const date = mapping.dateField ? record[mapping.dateField] : (record.date || record.ts || record.timestamp || null);
  const event = mapping.eventField ? record[mapping.eventField] : null;
  mapping.fields.filter(f => f.include !== false).forEach(f => {
    const raw = record[f.from];
    const value = typeof raw === 'number' ? raw : (typeof raw === 'string' && /^-?\d+(?:\.\d+)?$/.test(raw.trim()) ? Number(raw.trim()) : null);
    if (value == null || !Number.isFinite(value)) return;
    out.push({ type: f.primitive || 'metric', label: String(f.label || f.from).slice(0, 80), value, date: date || null, event: event || null });
  });
  return out;
}

function validateManifest(m) {
  if (!m || !m.provider || !m.authentication) return false;
  const caps = m.capabilities || [];
  return Array.isArray(caps) && caps.every(c => ALL_CAPABILITIES.includes(c));
}

/* Reference connector manifests — three categories proving the contract:
   communication/calendar (OAuth), individual activity (OAuth), universal fallback. */
const MANIFESTS = {
  google_workspace: {
    provider: 'google_workspace', label: 'Google Workspace', authentication: 'oauth2',
    capabilities: ['calendar.read', 'communication.read', 'files.read'],
    subject: 'self',
  },
  microsoft365: {
    provider: 'microsoft365', label: 'Microsoft 365 / Teams', authentication: 'oauth2',
    capabilities: ['calendar.read', 'communication.read'],
    subject: 'self',
  },
  strava: {
    provider: 'strava', label: 'Strava', authentication: 'oauth2',
    capabilities: ['events.ingest', 'metrics.ingest'],
    subject: 'self',
  },
  csv_webhook: {
    provider: 'csv_webhook', label: 'CSV / Webhook (universal fallback)', authentication: 'api_key',
    capabilities: ['metrics.ingest', 'observations.ingest', 'people.sync'],
    subject: 'roster',
  },
};

module.exports = { PRIMITIVES, CAPABILITIES, ALL_CAPABILITIES, MANIFESTS, resolveIdentity, proposeMapping, applyMapping, validateManifest };
