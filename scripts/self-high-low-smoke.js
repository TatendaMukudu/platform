'use strict';

process.env.DB_OPTIONAL = '1';

/* D4/D5/D6: Self Highs and Lows are a projection of the person's existing
   proactive insights through the canonical polarity owner. They are not a new
   detector, and the self HTTP boundary never accepts a subject identity. */

const feed = require('../ai/intelligence-feed');
const behaviour = require('../ai/behaviour');
const proactive = require('../ai/proactive');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = require('../server');

let pass = 0;
let fail = 0;
function ok(name, condition) {
  if (condition) { console.log(`  PASS  ${name}`); pass++; }
  else { console.error(`  FAIL  ${name}`); fail++; }
}

const neutral = proactive.toInsight(
  { type: 'baseline_shift', severity: 'low', confidence: 'clear' },
  { audience: 'self', subjectId: 'member' },
);
const gapWithLegacyRisk = { ...neutral, id: 'gap', dedupeKey: 'gap', patternType: 'data_gap', polarity: 'risk' };

ok('a neutral self finding appears in neither High nor Low',
  feed.bucketOf(neutral) === null
  && Object.values(behaviour.plan([neutral], { audience: 'self' }).groups).every(group => group.insights.length === 0));

ok('a data gap appears in neither bucket even when an older producer labels it risk',
  feed.bucketOf(gapWithLegacyRisk) === null
  && Object.values(behaviour.plan([gapWithLegacyRisk], { audience: 'self' }).groups).every(group => group.insights.length === 0));

/* THE POSITIVE CASE, and it is the one that matters. Emptying the entire bucket table still
   passed every assertion above, because they all check that something is ABSENT — so a projection
   that produced no Highs and no Lows at all looked perfectly healthy. This is the D26 lesson
   again: the assertion that catches a real regression is the one saying the feature WORKS. */
const aLow = proactive.toInsight(
  { type: 'withdrawal', severity: 'high', confidence: 'clear' },
  { audience: 'self', subjectId: 'member' },
);
const aHigh = proactive.toInsight(
  { type: 'recovering', severity: 'medium', confidence: 'clear' },
  { audience: 'self', subjectId: 'member' },
);
ok('a self finding that needs attention IS bucketed as a Low',
  feed.bucketOf(aLow) === 'low'
  && (behaviour.plan([aLow], { audience: 'self' }).groups.low || {}).insights.length === 1);
ok('a self finding that is going well IS bucketed as a High',
  feed.bucketOf(aHigh) === 'high'
  && (behaviour.plan([aHigh], { audience: 'self' }).groups.high || {}).insights.length === 1);

const CODE = 'self-hl';
const DAY = 86400000;
const now = Date.now();
const evidence = (id, value, daysAgo) => ({
  id, orgCode: CODE, status: 'active', subjectId: 'member', type: 'metric', label: 'mood',
  visibility: 'shared', value, observedAt: new Date(now - daysAgo * DAY).toISOString(),
  provider: 'checkin', source: 'observed',
});

_loadAllStores({
  orgMeta: { [CODE]: { orgName: 'Self High Low', createdAt: new Date().toISOString() } },
  orgUsers: { [CODE]: {
    lead: { id: 'lead', name: 'Leader', email: 'lead@self.test', role: 'superadmin', orgCode: CODE, status: 'active' },
    member: { id: 'member', name: 'Member', email: 'member@self.test', role: 'member', orgCode: CODE, supervisorId: 'lead', status: 'active' },
  } },
  evidenceLog: { [CODE]: [
    evidence('old-1', 4.2, 40), evidence('old-2', 4.1, 35), evidence('old-3', 4.0, 30),
    evidence('new-1', 2.2, 6), evidence('new-2', 2.0, 3), evidence('new-3', 2.1, 1),
  ] },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const read = async (path, token) => {
    const response = await fetch(base + path, { headers: { Authorization: `Bearer ${token}` } });
    return { status: response.status, body: await response.json() };
  };
  const flatten = body => Object.values(body.groups || {}).flatMap(group => group.insights || []);

  try {
    const member = await read('/api/proactive/insights', issueToken('member', CODE, 'member'));
    const injected = await read('/api/proactive/insights?subjectId=member', issueToken('lead', CODE, 'superadmin'));
    ok('the self High/Low HTTP path uses only the caller and cannot be aimed at another subject',
      member.status === 200
      && flatten(member.body).some(item => item.subjectId === 'member')
      && injected.status === 200
      && flatten(injected.body).every(item => item.subjectId !== 'member'));
  } catch (err) {
    console.error(err);
    fail++;
  } finally {
    server.close(() => {
      console.log(`\nself-high-low-smoke: ${pass} passed, ${fail} failed`);
      process.exit(fail ? 1 : 0);
    });
  }
});
