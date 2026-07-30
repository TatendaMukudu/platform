/* ============================================================
   ai/providers/google.js — Google Calendar / Gmail as a PERSONAL source (pure)

   The first real provider behind the connector SDK (ai/connectors.js). Google's APIs
   don't speak the kernel's language, so this module is the NORMALISER: it turns a raw
   Google Calendar or Gmail API response into the SDK's tiny raw shape ([{ date }, …]),
   which connectors.calendar.map() / connectors.email.map() then minimise to numbers-only
   before anything reaches the kernel. Adding Google is a mapping — nothing else changes.

   TWO HARD RULES, inherited from the SDK and enforced here by construction:
     • DATA MINIMISATION — the INSIGHT tier emits ONLY a date per event/message. No
       titles, no bodies, no locations, no attendees. Just the shape the kernel counts.
     • LEAST PRIVILEGE — read-only scopes; Gmail is metadata-only (never a body). The
       richer ASSIST tier (event times/titles/locations, to help the person schedule) is
       a SEPARATE scope and a SEPARATE consent, and its data stays private to the person.

   PURE: imports nothing, no network, no clock of its own. The live OAuth token exchange
   and the API fetch are the server's integration point; this is the part that must be
   provably correct, so it's the part that's pure and tested.
   ============================================================ */

'use strict';

// The OAuth2 authorization-code endpoints. A refresh token needs offline access plus a
// forced consent the first time (Google only returns a refresh_token on first grant).
const AUTH = {
  authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl:     'https://oauth2.googleapis.com/token',
  extraAuth:    { access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' },
};

// Least-privilege scopes, per tier. INSIGHT reads only what's needed to COUNT: calendar
// read-only, Gmail METADATA only (headers/labels — never a body). ASSIST is a separate,
// explicit grant that lets IntelliQ read fuller event detail and create events to
// schedule/prepare for the person; it never widens what the org can see.
const SCOPES = {
  calendar:        ['https://www.googleapis.com/auth/calendar.readonly'],
  email:           ['https://www.googleapis.com/auth/gmail.metadata'],
  calendar_assist: ['https://www.googleapis.com/auth/calendar.events'],
};

// The API endpoints the server fetches (timeMin/timeMax/q are appended by the caller).
const DATA = {
  calendar:  'https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&maxResults=250',
  gmailList: 'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=250',
  gmailMsg:  'https://gmail.googleapis.com/gmail/v1/users/me/messages/',   // + {id}?format=metadata
};

// Normalise an ISO datetime, a plain date, or an epoch-ms value to YYYY-MM-DD (or null).
function _dayOf(x) {
  if (x == null) return null;
  const s = String(x);
  if (/^\d{9,}$/.test(s)) { const d = new Date(Number(s)); return isNaN(+d) ? null : d.toISOString().slice(0, 10); }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);          // date or datetime string
  const d = new Date(s); return isNaN(+d) ? null : d.toISOString().slice(0, 10);
}

/* Google Calendar events.list response → the SDK's raw shape.
   INSIGHT (default): [{ date }] per non-cancelled event — a COUNT source, no detail.
   ASSIST: per-event { date, start, end, title, location, attendeeCount } for scheduling —
   still no attendee identities and no description; stays private to the person. */
function normalizeCalendar(resp, { assist = false } = {}) {
  const items = (resp && Array.isArray(resp.items)) ? resp.items : [];
  const out = [];
  for (const ev of items) {
    if (!ev || ev.status === 'cancelled') continue;
    const start = ev.start && (ev.start.dateTime || ev.start.date);
    const date = _dayOf(start);
    if (!date) continue;
    if (!assist) { out.push({ date }); continue; }
    out.push({
      date,
      start: (ev.start && (ev.start.dateTime || ev.start.date)) || null,
      end:   (ev.end   && (ev.end.dateTime   || ev.end.date))   || null,
      title:    ev.summary  ? String(ev.summary).slice(0, 140)  : null,
      location: ev.location ? String(ev.location).slice(0, 140) : null,
      attendeeCount: Array.isArray(ev.attendees) ? ev.attendees.length : 0,
    });
  }
  return out;
}

/* Gmail message metadata → the SDK's raw shape: [{ date }] per message, from internalDate
   (epoch ms) or a Date header. NEVER a subject, snippet, or body — inbox LOAD only. */
function normalizeGmail(resp) {
  const msgs = (resp && Array.isArray(resp.messages)) ? resp.messages
             : (Array.isArray(resp) ? resp : []);
  const out = [];
  for (const m of msgs) {
    if (!m) continue;
    let date = null;
    if (m.internalDate != null) date = _dayOf(m.internalDate);
    else if (m.payload && Array.isArray(m.payload.headers)) {
      const h = m.payload.headers.find(x => x && String(x.name).toLowerCase() === 'date');
      if (h) date = _dayOf(h.value);
    }
    if (date) out.push({ date });
  }
  return out;
}

/* Dispatcher — map a personal connector source id to the right Google normaliser, so the
   server can hand a raw Google API response straight through to connectors.<id>.map(). */
function normalize(source, resp, opts = {}) {
  if (source === 'calendar') return normalizeCalendar(resp, opts);
  if (source === 'email')    return normalizeGmail(resp);
  return [];
}

// Which personal connector sources this provider can feed (used to gate the pull path).
const SOURCES = ['calendar', 'email'];

module.exports = { AUTH, SCOPES, DATA, SOURCES, normalize, normalizeCalendar, normalizeGmail, _dayOf };
