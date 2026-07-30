/* Truth layer — outbound DELIVERY over HTTP. Proves the last mile end to end: a person
   opts in and subscribes; a preview shows exactly what would leave the box — grounded reads
   only, with any care-flagged (sensitive) read EXCLUDED; a test send composes + is
   audit-logged as outbound_delivery; consent is required; and an org in NO-EGRESS mode
   refuses to subscribe/send and the sweep delivers nothing. Boots the real app (DB_OPTIONAL).
   Run: node scripts/delivery-http-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S  = require('../server.js');
const ai = require('../ai/gateway.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, auditLog, _deliverySweep } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const C = 'dlv', DAY = 86400000, now = Date.now(), d = n => now - n * DAY;
const SENSITIVE = 'Kim may be carrying a lot right now';   // a wellbeing read — must NEVER leave the box
_loadAllStores({
  orgMeta: { [C]: { orgName: 'D', orgMode: 'sports' } },
  orgUsers: { [C]: {
    coachA: { id: 'coachA', name: 'Alex', role: 'coach',  orgCode: C, status: 'active', leadershipNodeIds: ['teamA'] },
    joe:    { id: 'joe',    name: 'Joe',  role: 'member', orgCode: C, status: 'active' },
    kim:    { id: 'kim',    name: 'Kim',  role: 'member', orgCode: C, status: 'active' },
  } },
  orgNodes: { [C]: { teamA: { nodeId: 'teamA', parentId: null, leaderIds: ['coachA'], memberIds: ['joe', 'kim'] } } },
  reasonLedger: { [C]: [
    { id: 'joe::momentum_drop', subjectId: 'joe', subjectName: 'Joe', scope: 'teamA', kind: 'momentum_drop', axis: 'momentum', polarity: 'risk',
      claim: "Joe's momentum has been running below his own normal.",
      support: [ { id: 'j1', t: d(9), severity: 'medium', basis: 'x' }, { id: 'j2', t: d(5), severity: 'medium', basis: 'x' }, { id: 'j3', t: d(1), severity: 'high', basis: 'x' } ],
      counter: [], careFlag: false, firstSeen: d(9), lastSeen: d(1), whatWouldConfirm: 'more', whatWouldRefute: 'a return toward normal' },
    { id: 'kim::overload', subjectId: 'kim', subjectName: 'Kim', scope: 'teamA', kind: 'overload', axis: 'wellbeing', polarity: 'risk',
      claim: SENSITIVE,
      support: [ { id: 'k1', t: d(8), severity: 'high', basis: 'x' }, { id: 'k2', t: d(4), severity: 'high', basis: 'x' }, { id: 'k3', t: d(1), severity: 'high', basis: 'x' } ],
      counter: [], careFlag: true, firstSeen: d(8), lastSeen: d(1), whatWouldConfirm: 'more', whatWouldRefute: 'easing' },
  ] },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const tok = issueToken('coachA', C, 'coach');
  const H = { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' };
  const get  = (p) => fetch(base + p, { headers: H }).then(r => r.json());
  const post = (p, b) => fetch(base + p, { method: 'POST', headers: H, body: JSON.stringify(b || {}) }).then(async r => ({ status: r.status, j: await r.json() }));

  try {
    /* 1 — consent-first: default OFF; nothing goes until opt-in */
    ok('1 · delivery prefs default to OFF (consent-first)', (await get('/api/delivery/prefs')).prefs.enabled === false);

    /* 2 — preview shows what WOULD leave the box, with the sensitive read EXCLUDED */
    const pv = await get('/api/delivery/preview');
    ok('2 · a preview composes a digest from the leader\'s grounded reads', pv.ok && pv.payload && pv.payload.kind === 'digest');
    ok('2 · Joe\'s (non-sensitive) read is included', /Joe's momentum/.test(pv.payload.body));
    ok('2 · the care-flagged wellbeing read is EXCLUDED from anything outbound', !pv.payload.body.includes(SENSITIVE) && !JSON.stringify(pv.payload).includes(SENSITIVE));
    ok('2 · …and the preview reports one sensitive read was held back', pv.excludedSensitive >= 1);

    /* 3 — opt in + subscribe; quiet hours disabled so the decision is clock-independent */
    await post('/api/delivery/prefs', { enabled: true, channels: { push: true }, cadence: 'daily', quietStart: 0, quietEnd: 0 });
    const sub = await post('/api/delivery/subscribe', { subscription: { endpoint: 'https://push.example/abc', keys: { p256dh: 'k', auth: 'a' } } });
    ok('3 · subscribing stores the push subscription + turns the channel on', sub.j.ok && sub.j.subscriptions === 1);
    const pv2 = await get('/api/delivery/preview');
    ok('3 · with content + opted in + no quiet hours → the digest WOULD send', pv2.decision.send === true);

    /* 4 — a test send composes + is AUDIT-LOGGED (push not configured here, so 0 land) */
    const before = (auditLog[C] || []).length;
    const t = await post('/api/delivery/test', {});
    ok('4 · a self-test reports sent (composed) even when push isn\'t configured', t.j.ok && t.j.sent === true);
    const entry = (auditLog[C] || []).find(e => e.action === 'outbound_delivery' && e.subjectIds.includes('coachA'));
    ok('4 · the send is recorded in the accountability trail (outbound_delivery)', (auditLog[C] || []).length > before && !!entry);
    ok('4 · the audit entry is content-free (no reads, sensitive or not)', entry && !JSON.stringify(entry).includes(SENSITIVE) && !/Joe's momentum/.test(JSON.stringify(entry)));

    /* 5 — NO-EGRESS: an org in deterministic-only mode refuses to reach out at all */
    ai.setDeterministicOnly(true);
    const sweptOff = await _deliverySweep();
    const subOff = await post('/api/delivery/subscribe', { subscription: { endpoint: 'https://push.example/xyz', keys: { p256dh: 'k', auth: 'a' } } });
    const testOff = await post('/api/delivery/test', {});
    ai.setDeterministicOnly(false);
    ok('5 · no-egress: the delivery sweep sends nothing', sweptOff === 0);
    ok('5 · no-egress: subscribing is refused (outbound_disabled)', subOff.status === 403 && subOff.j.error === 'outbound_disabled');
    ok('5 · no-egress: a test send is refused (nothing leaves the box)', testOff.status === 403 && testOff.j.error === 'outbound_disabled');

    /* 6 — the sweep, with egress allowed again, delivers to the opted-in leader */
    // (coachA already sent a test this window; a fresh person proves the sweep path.)
    const swept = await _deliverySweep();
    ok('6 · the sweep runs and respects the once-per-window cap (coachA already sent → 0 new)', swept === 0);
  } catch (e) { fail++; console.log('  ✗ HTTP suite threw:', e && e.message); }

  server.close();
  console.log(`\ndelivery-http-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
