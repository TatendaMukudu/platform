/* ============================================================
   ai/connectors.js — consent-gated external source adapters

   Connect the kernel to an external app (calendar, a health app, a fitness
   tracker) and map its data into the SAME universal signals the kernel already
   understands — so an integration adds a mapping here and NOTHING else changes.

   Two hard rules, enforced in server.js, never bypassable here:
     1. CONSENT FIRST — a connector never runs without the person's recorded,
        revocable consent for that source's scope. The individual consents to
        THEIR OWN data; drawing someone else's app data is never allowed.
     2. DATA MINIMISATION — a connector maps only to a few numeric signals
        (load/state/participation), never raw content. No message bodies, no
        event titles, no locations — just the shapes the kernel reasons over.

   `map(raw)` is the pure, testable transform. The actual API/OAuth fetch is the
   integration point (stubbed in the server until a provider's credentials exist).
   ============================================================ */

'use strict';

// Aggregate dated items into a per-day count signal (e.g. meetings/day = load).
function _perDay(items, label, primitive, valence) {
  const byDay = {};
  (items || []).forEach(it => {
    const d = it && it.date ? String(it.date).slice(0, 10) : null;   // YYYY-MM-DD
    if (!d) return;
    byDay[d] = (byDay[d] || 0) + 1;
  });
  return Object.entries(byDay).map(([d, n]) => ({
    label, valueNum: n, ts: new Date(d + 'T12:00:00Z').toISOString(), primitive, valence,
  }));
}

const CONNECTORS = {
  calendar: {
    id: 'calendar', label: 'Calendar', scope: 'external:calendar',
    describes: 'how busy your days are, from your calendar (counts only — never event details)',
    // raw: [{ date }] — one entry per event. We keep the COUNT per day, not titles.
    map(raw) { return _perDay(raw, 'Calendar load', 'load', 'down-good'); },
  },
  health: {
    id: 'health', label: 'Health', scope: 'external:health',
    describes: 'sleep and activity from a health app (numbers only)',
    // raw: [{ date, sleepHours?, steps? }]
    map(raw) {
      const out = [];
      (raw || []).forEach(d => {
        if (!d || !d.date) return;
        const ts = new Date(String(d.date).slice(0, 10) + 'T12:00:00Z').toISOString();
        if (Number.isFinite(d.sleepHours)) out.push({ label: 'Sleep', valueNum: d.sleepHours, ts, primitive: 'state', valence: 'up-good' });
        if (Number.isFinite(d.steps))      out.push({ label: 'Activity', valueNum: d.steps, ts, primitive: 'participation', valence: 'up-good' });
      });
      return out;
    },
  },
  fitness: {
    id: 'fitness', label: 'Training', scope: 'external:fitness',
    describes: 'training load from a fitness app (session counts only)',
    // raw: [{ date }] — one entry per session.
    map(raw) { return _perDay(raw, 'Training load', 'load', 'down-good'); },
  },
};

function list() {
  return Object.values(CONNECTORS).map(c => ({ id: c.id, label: c.label, scope: c.scope, describes: c.describes }));
}
function get(id) { return CONNECTORS[id] || null; }

module.exports = { CONNECTORS, list, get, _perDay };
