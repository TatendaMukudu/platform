/* Truth layer — the GOOGLE connector over HTTP. Proves the first real provider works end
   to end behind the SDK: a person connects their calendar/inbox (consent-gated), a raw
   Google API payload is pulled and MINIMISED to numbers-only before it reaches the kernel
   (no titles, no subjects ever emitted), consent + connection are enforced, a source Google
   can't feed is refused, and — the governance line — an org in NO-EGRESS mode refuses the
   external pull outright. Boots the real app (DB_OPTIONAL).
   Run: node scripts/google-connector-http-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S  = require('../server.js');
const ai = require('../ai/gateway.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, orgSignals } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const C = 'gcal';
_loadAllStores({
  orgMeta:  { [C]: { orgName: 'G', orgMode: 'business' } },
  orgUsers: { [C]: { uma: { id: 'uma', name: 'Uma', role: 'member', orgCode: C, status: 'active' } } },
  // Uma has consented to the calendar + email insight scopes and connected both sources.
  userConsents: { [`${C}:uma`]: {
    'external:calendar': { granted: true }, 'external:email': { granted: true }, 'external:health': { granted: true },
  } },
  connectedSources: { [`${C}:uma`]: {
    calendar: { connectedAt: new Date().toISOString(), lastPull: null },
    email:    { connectedAt: new Date().toISOString(), lastPull: null },
    health:   { connectedAt: new Date().toISOString(), lastPull: null },
  } },
});
_rebuildEmailIndex();

// Realistic raw Google API payloads — a sensitive title + subject are present in the raw,
// and must NEVER survive into the kernel signals.
const calResp = { items: [
  { status: 'confirmed', summary: 'Sensitive 1:1 with the CEO', location: 'Boardroom',
    start: { dateTime: '2026-07-20T09:00:00Z' }, end: { dateTime: '2026-07-20T09:30:00Z' } },
  { status: 'confirmed', summary: 'Standup', start: { dateTime: '2026-07-20T10:00:00Z' } },
  { status: 'cancelled', summary: 'Dropped', start: { dateTime: '2026-07-20T11:00:00Z' } },
] };
const gmailResp = { messages: [
  { id: 'm1', payload: { headers: [ { name: 'Subject', value: 'Layoffs — CONFIDENTIAL' }, { name: 'Date', value: 'Mon, 20 Jul 2026 08:00:00 +0000' } ] } },
  { id: 'm2', internalDate: String(Date.parse('2026-07-20T18:00:00Z')) },
] };

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const tok = issueToken('uma', C, 'member');
  const H = { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' };
  const pull = (body) => fetch(base + '/api/me/sources/pull', { method: 'POST', headers: H, body: JSON.stringify(body) }).then(async r => ({ status: r.status, j: await r.json() }));

  try {
    /* 1 — a raw Google Calendar payload is normalised → minimised → emitted as counts */
    const r1 = await pull({ source: 'calendar', provider: 'google', data: calResp });
    ok('1 · a Google calendar pull succeeds and emits minimised signals', r1.status === 200 && r1.j.ok === true && r1.j.imported >= 1);
    const sigs = (orgSignals[C] || []).filter(s => s.subjectId === 'uma');
    ok('1 · two non-cancelled events on one day become a per-day load of 2', sigs.some(s => Number(s.valueNum) === 2 && /2026-07-20/.test(String(s.ts))));
    ok('1 · every emitted signal is a finite number (only counts cross the boundary)', sigs.length > 0 && sigs.every(s => Number.isFinite(Number(s.valueNum))));

    /* 2 — DATA MINIMISATION: the sensitive title/location never reach the kernel */
    ok('2 · no event title or location survives into the kernel signals', !/Sensitive|CEO|Boardroom|Standup/.test(JSON.stringify(orgSignals[C] || [])));

    /* 3 — Gmail metadata → inbox load, and the subject never crosses */
    const r3 = await pull({ source: 'email', provider: 'google', data: gmailResp });
    ok('3 · a Gmail pull emits an inbox-load count', r3.status === 200 && r3.j.ok === true && r3.j.imported >= 1);
    ok('3 · the email subject never reaches the kernel', !/Layoffs|CONFIDENTIAL|Subject/.test(JSON.stringify(orgSignals[C] || [])));

    /* 4 — a source Google can't feed is refused (health is consented+connected, but Google
       only feeds calendar/email — so this reaches the provider mismatch, not the gates) */
    const r4 = await pull({ source: 'health', provider: 'google', data: {} });
    ok('4 · asking Google for a source it does not feed is refused', r4.status === 400 && r4.j.error === 'provider_source_mismatch');

    /* 5 — no-egress mode: the external pull is refused outright (the governance line) */
    ai.setDeterministicOnly(true);
    const r5 = await pull({ source: 'calendar', provider: 'google', data: calResp });
    ai.setDeterministicOnly(false);
    ok('5 · an org in no-egress mode refuses the external pull (nothing leaves the box)', r5.status === 403 && r5.j.error === 'egress_disabled');

    /* 6 — consent + connection are still enforced (a different, unconsented member) */
    const strangerTok = issueToken('nobody', C, 'member');
    const r6 = await fetch(base + '/api/me/sources/pull', { method: 'POST', headers: { Authorization: `Bearer ${strangerTok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ source: 'calendar', provider: 'google', data: calResp }) });
    ok('6 · a person who never consented cannot pull (403 consent_required)', r6.status === 403 && (await r6.json()).error === 'consent_required');
  } catch (e) { fail++; console.log('  ✗ HTTP suite threw:', e && e.message); }

  server.close();
  console.log(`\ngoogle-connector-http-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
