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

/* Write ACTIONS a connector can perform on the person's behalf (with a separate
   write consent scope). The actual provider call is the integration point; here
   we validate + shape the action. Each returns { summary } for the approval card. */
const ACTIONS = {
  schedule_meeting: {
    id: 'schedule_meeting', label: 'Schedule a meeting', writeScope: 'external:calendar:write',
    // params: { title, withWhom?, date?, durationMins? }
    prepare(p = {}) {
      const title = String(p.title || 'Meeting').slice(0, 140);
      const when  = p.date ? String(p.date).slice(0, 40) : 'a time that works';
      const who   = p.withWhom ? ` with ${String(p.withWhom).slice(0, 80)}` : '';
      return { valid: true, summary: `Schedule “${title}”${who} — ${when} (${p.durationMins || 30} min).`, payload: { title, ...p } };
    },
  },
  send_email: {
    id: 'send_email', label: 'Send an email', writeScope: 'external:email:write',
    // params: { to, subject, body }
    prepare(p = {}) {
      if (!p.to || !p.subject) return { valid: false, error: 'to + subject required' };
      return { valid: true, summary: `Email “${String(p.subject).slice(0, 120)}” to ${String(p.to).slice(0, 120)}.`, payload: { to: p.to, subject: p.subject, body: String(p.body || '').slice(0, 4000) } };
    },
  },
};

/* ── Two tiers of access, so richer data can help WITHOUT becoming surveillance ─
   Every connector has an INSIGHT tier (`scope`) — numbers only, and the ONLY tier
   that can ever inform org-facing patterns. Some connectors also offer an ASSIST
   tier (`assist.scope`) — a SEPARATE, explicit consent that lets IntelliQ read
   fuller detail (event times, titles, locations, attendees) so it can act for the
   PERSON: schedule meetings, prepare them, draft messages. Assist data is used
   only to help the individual, shown back only to them, and NEVER surfaced to the
   org or folded into org-level signals. `category` lets the UI group apps and lets
   different industries add their own without touching the kernel. */
const CONNECTORS = {
  calendar: {
    id: 'calendar', label: 'Calendar', scope: 'external:calendar', category: 'Productivity',
    describes: 'how busy your days are (counts only — never event details)',
    assist: {
      scope: 'external:calendar:assist',
      describes: 'let IntelliQ read event times, titles, and locations so it can schedule and prepare meetings for you (stays private to you)',
    },
    contribute: {
      scope: 'external:calendar:contribute',
      describes: 'let IntelliQ turn what it sees here into numbers for your growth record — combined with how you feel (numbers only, and you can see everything that crosses)',
    },
    // raw: [{ date }] — one entry per event. We keep the COUNT per day, not titles.
    map(raw) { return _perDay(raw, 'Calendar load', 'load', 'down-good'); },
  },
  email: {
    id: 'email', label: 'Email', scope: 'external:email', category: 'Productivity',
    describes: 'how heavy your inbox is (message counts only — never content)',
    assist: {
      scope: 'external:email:assist',
      describes: 'let IntelliQ draft and send routine emails on your behalf (each one you approve first; stays private to you)',
    },
    contribute: {
      scope: 'external:email:contribute',
      describes: 'let IntelliQ turn inbox load into numbers for your growth record (numbers only, and you can see everything that crosses)',
    },
    // raw: [{ date }] — one entry per message. Count per day, never subjects/bodies.
    map(raw) { return _perDay(raw, 'Inbox load', 'load', 'down-good'); },
  },
  health: {
    id: 'health', label: 'Health', scope: 'external:health', category: 'Wellbeing',
    describes: 'rest and activity levels (numbers only — never content)',
    contribute: {
      scope: 'external:health:contribute',
      describes: 'let IntelliQ keep rest and activity as numbers in your growth record, alongside how you feel (numbers only, and you can see everything that crosses)',
    },
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
    id: 'fitness', label: 'Activity', scope: 'external:fitness', category: 'Wellbeing',
    describes: 'exercise and activity, as session counts (numbers only)',
    contribute: {
      scope: 'external:fitness:contribute',
      describes: 'let IntelliQ keep your training as numbers in your growth record, alongside how you feel (numbers only, and you can see everything that crosses)',
    },
    // raw: [{ date }] — one entry per session.
    map(raw) { return _perDay(raw, 'Activity load', 'load', 'down-good'); },
  },
  // Generic connector — ANY software a team uses. You send dated numeric points
  // with a label ({ date, label, value }); the kernel reasons over them like any
  // other signal. This is how IntelliQ plugs into industry-specific tools (a CRM,
  // an LMS, a machine-monitoring system, a stats platform) without a bespoke
  // integration — still numbers only, so the privacy model is unchanged.
  custom: {
    id: 'custom', label: 'Other software', scope: 'external:custom', category: 'Your tools',
    describes: 'connect any other tool your team uses — send it numbers (a score, a count, a rating) and IntelliQ reasons over them (numbers only)',
    contribute: {
      scope: 'external:custom:contribute',
      describes: 'let those numbers become part of your growth record, alongside how you feel (numbers only, and you can see everything that crosses)',
    },
    // raw: [{ date, label?, value }] — generic dated numeric points.
    map(raw) {
      const out = [];
      (raw || []).forEach(d => {
        const v = d && Number(d.value);
        if (!d || !d.date || !Number.isFinite(v)) return;
        const ts = new Date(String(d.date).slice(0, 10) + 'T12:00:00Z').toISOString();
        out.push({ label: String(d.label || 'Metric').slice(0, 60), valueNum: v, ts, primitive: 'capability', valence: 'up-good' });
      });
      return out;
    },
  },
};

function _publicConnector(c) {
  return {
    id: c.id, label: c.label, scope: c.scope, describes: c.describes,
    category: c.category || 'Other',
    assist:     c.assist     ? { scope: c.assist.scope,     describes: c.assist.describes }     : null,
    contribute: c.contribute ? { scope: c.contribute.scope, describes: c.contribute.describes } : null,
  };
}
function list() { return Object.values(CONNECTORS).map(_publicConnector); }
function get(id) { return CONNECTORS[id] || null; }
function getAction(id) { return ACTIONS[id] || null; }
function listActions() { return Object.values(ACTIONS).map(a => ({ id: a.id, label: a.label, writeScope: a.writeScope })); }

module.exports = { CONNECTORS, ACTIONS, list, get, getAction, listActions, _perDay };
