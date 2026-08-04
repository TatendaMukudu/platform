/* ============================================================
   ai/errorlog.js — a tiny, redacting error ring buffer.

   Pilots fail silently unless you can see what broke. This keeps the last N errors in memory
   (redacted — never a raw email, token, or bearer header), so a superadmin can look, and it can
   optionally forward to a webhook (Slack/Discord/log sink) with no SDK. Pure: the store is passed
   in, so it's fully testable and does no IO of its own.
   ============================================================ */

const CAP = 200;

// Strip anything that could carry PII or a secret out of a message before we keep or forward it.
function redact(s) {
  return String(s == null ? '' : s)
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')               // emails
    .replace(/\bBearer\s+[\w.\-]+/gi, 'Bearer [token]')            // auth headers
    .replace(/\b(sk-[a-z]+-)[A-Za-z0-9_\-]{6,}/g, '$1[redacted]') // api keys
    .replace(/\b[A-Fa-f0-9]{32,}\b/g, '[hex]')                     // long hex tokens/ids
    .slice(0, 1000);
}

/* Record one error. `meta` is a small context object ({ route, method, orgCode?, status }).
   Returns the stored (redacted) entry so a caller can also forward it. */
function record(store, err, meta = {}, { cap = CAP, now = Date.now() } = {}) {
  if (!store.items) store.items = [];
  const entry = {
    id: 'err_' + Math.random().toString(36).slice(2, 10),
    at: new Date(now).toISOString(),
    message: redact(err && err.message || err),
    stack: redact((err && err.stack) || '').split('\n').slice(0, 4).join('\n'),
    route: redact(meta.route || ''), method: meta.method || '', status: meta.status || 500,
    orgCode: meta.orgCode || null,   // an org CODE is not PII; helps locate a pilot's issue
  };
  store.items.push(entry);
  if (store.items.length > cap) store.items.splice(0, store.items.length - cap);
  return entry;
}

/* Most recent first. */
function list(store, limit = 100) {
  return (store.items || []).slice(-limit).reverse();
}

module.exports = { record, list, redact };
