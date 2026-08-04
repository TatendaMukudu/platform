/* ============================================================
   ai/metrics.js — a tiny per-org usage counter.

   Not a billing system — a visibility scaffold, so during pilots you can answer "is anyone
   actually using it?" and "which org is driving my LLM cost?" without an analytics vendor.
   Pure: the store is passed in, no IO. Counters are per-org, per-event, and monotonic since
   process start (they reset on redeploy — fine for a directional pilot signal).
   ============================================================ */

function inc(store, orgCode, event, n = 1) {
  const code = orgCode || '_';
  const o = store[code] || (store[code] = { since: Date.now(), events: {} });
  o.events[event] = (o.events[event] || 0) + (Number(n) || 0);
  o.last = Date.now();
  return o.events[event];
}

function _sum(events) { return Object.values(events || {}).reduce((s, n) => s + n, 0); }

/* A snapshot, busiest org first. Optionally filtered to one org (a superadmin's own view). */
function snapshot(store, { orgCode } = {}) {
  let rows = Object.entries(store).map(([code, o]) => ({
    orgCode: code, since: new Date(o.since).toISOString(), last: o.last ? new Date(o.last).toISOString() : null,
    total: _sum(o.events), events: { ...o.events },
  }));
  if (orgCode) rows = rows.filter(r => r.orgCode === orgCode);
  return rows.sort((a, b) => b.total - a.total);
}

module.exports = { inc, snapshot };
