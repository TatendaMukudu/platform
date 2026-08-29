#!/usr/bin/env node
'use strict';
process.env.DB_OPTIONAL = '1';
process.env.IQ_DETERMINISTIC_ONLY = '1';
const S = require('../server');
let pass = 0, fail = 0;
const ok = (name, condition) => { if (condition) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } };
const code = 'finding-change';
const person = (id, role = 'member') => ({ id, name: id, email: `${id}@change.test`, role, status: 'active', assignedNodeIds: role === 'member' ? ['team'] : [], leadershipNodeIds: role === 'member' ? [] : ['team'] });
const ids = ['p1','p2','p3','p4','p5'];
const concept = 'session_order';
S._loadAllStores({
  orgMeta: { [code]: { orgName: 'Finding Change' } },
  orgUsers: { [code]: { coach: person('coach', 'coach'), ...Object.fromEntries(Array.from({ length: 14 }, (_, i) => [`p${i + 1}`, person(`p${i + 1}`)])) } },
  orgNodes: { [code]: { team: { nodeId: 'team', name: 'Team', parentId: null, childNodeIds: [], memberIds: Array.from({ length: 14 }, (_, i) => `p${i + 1}`), leaderIds: ['coach'] } } },
  inquiryStates: { [code]: { 'group:team': { fragile: {
    inquiryId: 'inq_fragile', subjectRef: 'group:team', topic: { canonicalConcept: concept, label: 'session organisation' },
    hypotheses: [{ id: 'h1', statement: 'The withdrawn sentence was training is chaos after the red cones', confidence: { score: 0.7, band: 'probable' }, status: 'leading', supportRefs: ids.map((_, i) => `${concept}_e${i}`), challengeRefs: [] }], leadingHypothesisId: 'h1',
    signals: ids.map((uid, i) => ({ ref: `${concept}_e${i}`, kind: 'observation', source: uid, authority: 'self_report', directness: 'direct', specificity: 0.8, originRef: `${concept}_o${i}`, contributedBy: uid, contributorVisibility: 'anonymous', status: 'active', at: i + 1 })),
    aliases: [concept], provenance: [], missingSignals: [], falsifiers: [], confidence: { score: 0.7, band: 'probable', because: [] }, status: 'probable', timeline: [], lastUpdatedAt: 10,
  } } } },
  groupCandidates: { [code]: ids.map((uid, i) => ({ candidateId: `fragile_c${i}`, nodeId: 'team', concept, label: 'session organisation', contributorId: uid, evidenceRef: `${concept}_e${i}`, originRef: `${concept}_o${i}`, status: 'admitted', contributedAt: i + 1, valence: 'worth_attention' })) },
  deliveryPrefs: { [`${code}:coach`]: { enabled: true, channels: { push: true, email: false }, cadence: 'daily', quietStart: 23, quietEnd: 0, lastSentAt: 0 } },
});
S._rebuildEmailIndex();
const server = S.app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const auth = id => ({ Authorization: `Bearer ${S.issueToken(id, code, S.orgUsers[code][id].role)}`, 'Content-Type': 'application/json' });
  try {
    const shown = await fetch(`${base}/api/group/team/state`, { headers: auth('coach') }).then(r => r.json());
    await fetch(`${base}/api/group/team/state`, { headers: auth('p2') }); // emitted too, but not opted in
    const ref = shown.low && `inquiry:${shown.low.inquiryId}`;
    ok('N1 the real HTTP emission records the finding reference and viewer', shown.low && (S.auditLog[code] || []).some(e => e.actor === 'coach' && (e.findingRefs || []).includes(ref)));
    const response = await fetch(`${base}/api/group/team/withdraw`, { method: 'POST', headers: auth('p1'), body: JSON.stringify({ candidateId: 'fragile_c0', reason: 'the withdrawn sentence was wrong' }) });
    const withdrawn = await response.json(), prefs = S.deliveryPrefs[`${code}:coach`];
    ok('N2 withdrawal that drops the finding queues only the opted-in prior viewer', response.status === 200 && withdrawn.changeNoticesQueued === 1 && prefs.pendingFindingChanges.length === 1 && prefs.pendingFindingChanges[0].findingRef === ref && !S.deliveryPrefs[`${code}:p2`]);
    const attempt = await S._deliverFindingChanges(code, 'coach', { now: new Date('2026-08-29T12:00:00Z').getTime() });
    const notice = JSON.stringify(attempt.payloads || []);
    ok('N3 the notice contains none of the withdrawn content', /finding you were shown/i.test(notice) && !/training is chaos|red cones|withdrawn sentence|session_order|p1/.test(notice));
    ok('N4 the audit trail stays references-only after reconciliation', !/training is chaos|red cones|withdrawn sentence/.test(JSON.stringify(S.auditLog[code] || [])));
  } catch (e) { fail++; console.log('  FAIL suite threw', e && e.message); }
  finally { server.close(() => { console.log(`\nfinding-change-notice-http-smoke: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); }); }
});
