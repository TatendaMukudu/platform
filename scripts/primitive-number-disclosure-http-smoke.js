#!/usr/bin/env node
'use strict';

/* D26 over the real leader HTTP boundary: primitive provenance, not numeric syntax, decides
   disclosure. One person's state scale stays private while a capability percentage survives. */
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV = 'test';
const S = require('../server');

let passed = 0;
let failed = 0;
const check = (name, condition) => {
  if (condition) { passed++; console.log('  PASS', name); }
  else { failed++; console.log('  FAIL', name); }
};

const CODE = 'd26';
const DAY = 86400000;
const now = Date.now();
const cap = (id, daysAgo) => ({
  id, orgCode: CODE, status: 'active', subjectId: 'cap', ownerRef: 'cap', type: 'metric',
  label: 'Pass completion', value: 83, unit: '%', observedAt: new Date(now - daysAgo * DAY).toISOString(),
  provider: 'test', source: 'observed', visibility: 'shared', sensitivity: 'normal', promoted: true,
  attributes: { primitive: 'capability', valence: 'up-good' },
});
const mood = (id, value, daysAgo) => ({
  id, orgCode: CODE, status: 'active', subjectId: 'state', ownerRef: 'state', type: 'metric',
  label: 'mood', value, unit: '/5', observedAt: new Date(now - daysAgo * DAY).toISOString(),
  provider: 'checkin', source: 'observed', visibility: 'shared', sensitivity: 'sensitive', promoted: true,
  attributes: { primitive: 'state', valence: 'up-good' },
});

S._loadAllStores({
  orgMeta: { [CODE]: { orgName: 'D26 Test' } },
  orgUsers: { [CODE]: {
    lead: { id: 'lead', name: 'Lead', email: 'lead@d26.test', role: 'superadmin', status: 'active', orgCode: CODE },
    state: { id: 'state', name: 'State Member', email: 'state@d26.test', role: 'member', status: 'active', orgCode: CODE, supervisorId: 'lead' },
    cap: { id: 'cap', name: 'Capability Member', email: 'cap@d26.test', role: 'member', status: 'active', orgCode: CODE, supervisorId: 'lead' },
  } },
  memberCheckins: { [`${CODE}:state`]: [
    { mood: 4.2, ts: new Date(now - 40 * DAY).toISOString() },
    { mood: 4.1, ts: new Date(now - 35 * DAY).toISOString() },
    { mood: 4.0, ts: new Date(now - 30 * DAY).toISOString() },
    { mood: 2.2, ts: new Date(now - 6 * DAY).toISOString() },
    { mood: 2.1, ts: new Date(now - 3 * DAY).toISOString() },
  ] },
  evidenceLog: { [CODE]: [
    mood('mood_1', 4.2, 40), mood('mood_2', 4.1, 35), mood('mood_3', 4.0, 30),
    mood('mood_4', 2.2, 6), mood('mood_5', 2.1, 3),
    ...[90, 80, 70, 60, 50, 40, 35, 30, 25, 20, 7, 2].map((d, i) => cap(`cap_${i}`, d)),
  ] },
});
S._rebuildEmailIndex();

const server = S.app.listen(0, async () => {
  try {
    const token = S.issueToken('lead', CODE, 'superadmin');
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/intelligence/briefing?refresh=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await response.json();
    const stateItem = (body.items || []).find(item => item.memberId === 'state');
    const capabilityItem = (body.items || []).find(item => item.memberId === 'cap');
    /* Both numeric forms, not just the scale. This member's mood falls 4.2 -> 2.1, so the
       leaky sentence is "mood is ~48% below their usual" — a PERCENTAGE on a state primitive,
       which is precisely the leak a browser pass found on /api/intelligence/watch. Asserting
       only on "/5" would pass while the percentage branch was broken. */
    check('D26-1 a member state figure never reaches the leader briefing response',
      response.status === 200 && stateItem && stateItem.fingerprint === undefined &&
      !/\b\d+(?:\.\d+)?\s*\/\s*5\b/.test(JSON.stringify(stateItem)) &&
      !/\b\d+(?:\.\d+)?\s*%/.test(JSON.stringify(stateItem)));
    check('D26-2 a member capability percentage survives the same leader briefing response',
      response.status === 200 && capabilityItem && /Pass completion[^.]*83%/.test(capabilityItem.whyNow || ''));
  } catch (error) {
    failed++; console.log('  FAIL HTTP suite threw:', error && error.message);
  } finally {
    server.close(() => {
      console.log(`\nprimitive-number-disclosure-http-smoke: ${passed} passed, ${failed} failed`);
      process.exit(failed ? 1 : 0);
    });
  }
});
