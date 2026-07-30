/* Truth layer — the GOOGLE provider normaliser (pure). Proves the first real provider
   behind the connector SDK turns raw Google API JSON into the SDK's tiny [{date}] shape
   while holding the two hard rules by construction: the INSIGHT tier emits ONLY a date
   (never a title, body, or location), Gmail is counted from metadata only, all-day and
   timed events both resolve, cancelled events are dropped, the ASSIST tier carries fuller
   detail (a separate, private tier), and it's deterministic. No DB / AI / IO / network.
   Run: node scripts/google-provider-smoke.js */

const G = require('../ai/providers/google.js');
const connectors = require('../ai/connectors.js');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

/* A realistic Google Calendar events.list response: a timed event, an all-day event, a
   cancelled one (must be dropped), and one with no start (must be skipped). */
const calResp = { items: [
  { status: 'confirmed', summary: 'Sensitive 1:1 with Sam', location: 'Room 3',
    start: { dateTime: '2026-07-20T09:00:00Z' }, end: { dateTime: '2026-07-20T09:30:00Z' },
    attendees: [{ email: 'a@x' }, { email: 'b@x' }] },
  { status: 'confirmed', summary: 'Leave day', start: { date: '2026-07-21' }, end: { date: '2026-07-22' } },
  { status: 'confirmed', summary: 'Another meeting', start: { dateTime: '2026-07-20T14:00:00Z' } },
  { status: 'cancelled', summary: 'Cancelled sync', start: { dateTime: '2026-07-20T16:00:00Z' } },
  { status: 'confirmed', summary: 'No start' },
] };

/* ── 1 · INSIGHT calendar: one {date} per real event, and NOTHING but the date ── */
const cal = G.normalizeCalendar(calResp);
ok('1 · a timed + all-day + second timed event all resolve to a date (3 kept)', cal.length === 3);
ok('1 · a cancelled event is dropped', !cal.some(e => e.date === '2026-07-20' && false) && cal.length === 3);
ok('1 · a timed event yields its day', cal.some(e => e.date === '2026-07-20'));
ok('1 · an all-day event yields its day', cal.some(e => e.date === '2026-07-21'));
ok('1 · INSIGHT rows carry ONLY a date — no title / location / attendees leak', cal.every(e => Object.keys(e).length === 1 && 'date' in e));
ok('1 · the sensitive event title never appears in the insight output', !/Sensitive|Sam|Room 3/.test(JSON.stringify(cal)));

/* ── 2 · it composes with the SDK: normalise → calendar.map() → per-day load numbers ── */
const loads = connectors.get('calendar').map(cal);
ok('2 · two events on 2026-07-20 become a single per-day load of 2', loads.some(s => s.ts.startsWith('2026-07-20') && s.valueNum === 2));
ok('2 · the all-day event becomes a load of 1 on its day', loads.some(s => s.ts.startsWith('2026-07-21') && s.valueNum === 1));
ok('2 · every emitted signal is a finite number (nothing but counts crosses)', loads.every(s => Number.isFinite(s.valueNum)));

/* ── 3 · Gmail: counted from metadata only (internalDate / Date header), never content ── */
const gmailResp = { messages: [
  { id: 'm1', internalDate: String(Date.parse('2026-07-20T08:00:00Z')) },
  { id: 'm2', internalDate: String(Date.parse('2026-07-20T18:00:00Z')) },
  { id: 'm3', payload: { headers: [ { name: 'Subject', value: 'Payroll — CONFIDENTIAL' }, { name: 'Date', value: 'Tue, 21 Jul 2026 10:00:00 +0000' } ] } },
] };
const mail = G.normalizeGmail(gmailResp);
ok('3 · every message with a date is counted (3)', mail.length === 3);
ok('3 · the message subject never leaks into the mapped output', !/Payroll|CONFIDENTIAL|Subject/.test(JSON.stringify(mail)) && mail.every(m => Object.keys(m).length === 1));
const inbox = connectors.get('email').map(mail);
ok('3 · two messages on 2026-07-20 become an inbox load of 2', inbox.some(s => s.ts.startsWith('2026-07-20') && s.valueNum === 2));

/* ── 4 · the ASSIST tier carries fuller detail — a SEPARATE, private tier ── */
const assist = G.normalizeCalendar(calResp, { assist: true });
const a0 = assist.find(e => e.date === '2026-07-20' && e.title);
ok('4 · assist keeps event times, title, location + an attendee COUNT (to schedule)', a0 && a0.start && a0.title === 'Sensitive 1:1 with Sam' && a0.location === 'Room 3' && a0.attendeeCount === 2);
ok('4 · assist still never carries attendee identities or a description', !/a@x|b@x|description/.test(JSON.stringify(assist)));

/* ── 5 · least-privilege scopes: read-only, Gmail metadata-only ── */
ok('5 · calendar insight scope is read-only', G.SCOPES.calendar.every(s => /readonly/.test(s)));
ok('5 · gmail scope is metadata-only (never a body)', G.SCOPES.email.length === 1 && /gmail\.metadata/.test(G.SCOPES.email[0]));
ok('5 · a refresh token is requested (offline access, forced consent once)', G.AUTH.extraAuth.access_type === 'offline' && G.AUTH.extraAuth.prompt === 'consent');

/* ── 6 · the dispatcher + date parsing + determinism ── */
ok('6 · normalize() dispatches by source id', G.normalize('calendar', calResp).length === 3 && G.normalize('email', gmailResp).length === 3 && G.normalize('nope', {}).length === 0);
ok('6 · _dayOf handles ISO, plain date, and epoch-ms', G._dayOf('2026-07-20T09:00:00Z') === '2026-07-20' && G._dayOf('2026-07-21') === '2026-07-21' && G._dayOf(String(Date.parse('2026-07-22T00:00:00Z'))) === '2026-07-22' && G._dayOf('nonsense') === null);
ok('6 · identical input → identical output (deterministic)', JSON.stringify(G.normalizeCalendar(calResp)) === JSON.stringify(cal));

console.log(`\ngoogle-provider-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
