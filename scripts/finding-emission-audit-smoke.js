#!/usr/bin/env node
'use strict';

/* D19/D27/D28/D40 substrate: a real finding response leaves a bounded, content-free,
   tamper-evident EMISSION record. An HTTP response is not proof that the person read it. */
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV = 'test';

const S = require('../server');
const audit = require('../ai/audit');

let passed = 0;
let failed = 0;
const check = (name, condition) => {
  if (condition) { passed++; console.log('  PASS', name); }
  else { failed++; console.log('  FAIL', name); }
};

const CODE = 'finding-audit';
const DAY = 86400000;
const now = Date.now();
const metric = (id, subjectId, primitive, label, value, unit, daysAgo) => ({
  id, orgCode: CODE, status: 'active', subjectId, ownerRef: subjectId, type: 'metric',
  label, value, unit, observedAt: new Date(now - daysAgo * DAY).toISOString(),
  provider: 'test', source: 'observed', visibility: 'shared', sensitivity: 'normal', promoted: true,
  attributes: { primitive, valence: 'up-good' },
});

S._loadAllStores({
  orgMeta: { [CODE]: { orgName: 'Finding Audit' } },
  orgUsers: { [CODE]: {
    lead: { id: 'lead', name: 'Lead', email: 'lead@audit.test', role: 'superadmin', status: 'active', orgCode: CODE },
    state: { id: 'state', name: 'Private State Person', email: 'state@audit.test', role: 'member', status: 'active', orgCode: CODE, supervisorId: 'lead' },
    cap: { id: 'cap', name: 'Performance Person', email: 'cap@audit.test', role: 'member', status: 'active', orgCode: CODE, supervisorId: 'lead' },
  } },
  memberCheckins: { [`${CODE}:state`]: [
    { mood: 4.2, ts: new Date(now - 40 * DAY).toISOString() },
    { mood: 4.1, ts: new Date(now - 35 * DAY).toISOString() },
    { mood: 4.0, ts: new Date(now - 30 * DAY).toISOString() },
    { mood: 2.2, ts: new Date(now - 6 * DAY).toISOString() },
    { mood: 2.1, ts: new Date(now - 3 * DAY).toISOString() },
  ] },
  evidenceLog: { [CODE]: [
    ...[40, 35, 30, 6, 3].map((d, i) => metric(`mood_${i}`, 'state', 'state', 'mood', [4.2, 4.1, 4.0, 2.2, 2.1][i], '/5', d)),
    ...[90, 80, 70, 60, 50, 40, 35, 30, 25, 20, 7, 2].map((d, i) => metric(`cap_${i}`, 'cap', 'capability', 'Pass completion', 83, '%', d)),
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
    const entry = (S.auditLog[CODE] || []).find(e => e.action === 'finding_view' && e.actor === 'lead');
    const expectedRefs = (body.items || []).map(item => item.id || `finding:${item.memberId}:${item.patternType}`).sort();

    check('E1 leader briefing records exactly the finding references it emitted',
      response.status === 200 && expectedRefs.length >= 2 && entry &&
      JSON.stringify(entry.findingRefs) === JSON.stringify(expectedRefs));

    const serialized = JSON.stringify(S.auditLog[CODE] || []);
    const allowedKeys = ['seq', 'actor', 'action', 'subjectIds', 'findingRefs', 'basis', 'at', 'prevHash', 'hash'];
    check('E2 the durable emission record is references-only and contains no finding content or figures',
      entry && (S.auditLog[CODE] || []).every(auditEntry => Object.keys(auditEntry).every(key => allowedKeys.includes(key))) &&
      !/Private State Person|Performance Person|Pass completion|Momentum dropping|83%|2\.1\/5/.test(serialized));

    check('E3 finding references participate in the intact hash chain', audit.verify(S.auditLog[CODE] || []).ok === true);
    const tampered = JSON.parse(JSON.stringify(S.auditLog[CODE] || []));
    tampered[tampered.length - 1].findingRefs = ['finding:forged:claim'];
    check('E4 changing a recorded finding reference breaks chain verification', audit.verify(tampered).ok === false);

    check('E5 adding finding references does not weaken the audit action allow-list',
      audit.record({ actor: 'lead', action: 'finding_headline', subjectIds: ['cap'],
        findingRefs: ['finding:cap:plateau'], basis: 'leader intelligence briefing', at: now },
      audit.tip(S.auditLog[CODE] || [])) === null);

    for (let i = 0; i < 5001; i++) {
      S._audit(CODE, { actor: 'lead', action: 'finding_view', subjectIds: ['cap'],
        findingRefs: [`finding:cap:bounded_${i}`], basis: 'leader intelligence briefing' });
    }
    check('E6 emission recording respects AUDIT_CAP and the retained chain still verifies',
      S.auditLog[CODE].length === 5000 && audit.verify(S.auditLog[CODE]).ok === true);
  } catch (error) {
    failed++; console.log('  FAIL suite threw:', error && error.message);
  } finally {
    server.close(() => {
      console.log(`\nfinding-emission-audit-smoke: ${passed} passed, ${failed} failed`);
      process.exit(failed ? 1 : 0);
    });
  }
});
