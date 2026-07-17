/* ============================================================
   scripts/connector-harness.js — prove the Connector SDK with sample payloads.

   Runs real, differently-shaped provider responses through the SAME contract:
   propose a mapping → apply it deterministically → resolve identity with confidence
   → show the normalized, provenanced observations. This is the harness every new
   connector is validated against before it's trusted.

   Run:  node scripts/connector-harness.js   (part of `npm test`)
   ============================================================ */

const sdk = require('../lib/connector-sdk');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

// A tiny roster to resolve against.
const users = {
  u1: { email: 'tatenda@club.fc', name: 'Tatenda Mukudu', externalIds: ['athlete_47219'] },
  u2: { email: 'sam@club.fc', name: 'Sam Fox' },
  u3: { email: 'sam2@club.fc', name: 'Sam Fox' },   // deliberate duplicate name → conflict
};

console.log('\n=== Connector SDK harness ===\n');

// ── Manifests validate against the capability contract ──
ok('all reference manifests are valid against the capability contract',
   Object.values(sdk.MANIFESTS).every(m => sdk.validateManifest(m)));
ok('a manifest with an unknown capability is rejected',
   !sdk.validateManifest({ provider: 'x', authentication: 'oauth2', capabilities: ['communication.read', 'nonsense.capability'] }));

// ── Identity resolution WITH confidence (never silently merge) ──
ok('email match → confirmed', sdk.resolveIdentity(users, { email: 'tatenda@club.fc', minutes: 84 }).confidence === 'confirmed');
ok('external id match → confirmed', sdk.resolveIdentity(users, { athlete: 'athlete_47219' }).key === 'externalId' || sdk.resolveIdentity(users, { externalId: 'athlete_47219' }).confidence === 'confirmed');
ok('unique name → probable (surface for review, not silent)', sdk.resolveIdentity(users, { player: 'Tatenda Mukudu' }).confidence === 'probable');
ok('duplicate name → conflict (NEVER auto-merged)', sdk.resolveIdentity(users, { name: 'Sam Fox' }).confidence === 'conflict');
ok('no match → unmatched', sdk.resolveIdentity(users, { name: 'Nobody Here' }).confidence === 'unmatched');

// ── Category A: a Hudl-style match export (roster, wide rows) ──
const hudl = [
  { athlete: 'Tatenda Mukudu', fixture: 'match_456', minutes: 84, 'high_speed_m': 612, passes: 41 },
  { athlete: 'Sam Fox', fixture: 'match_456', minutes: 90, 'high_speed_m': 540, passes: 33 },
];
const hudlMap = sdk.proposeMapping(hudl);
ok('proposeMapping detects the subject + event + metric fields', hudlMap && hudlMap.subjectField === 'athlete' && hudlMap.eventField === 'fixture' && hudlMap.fields.length === 3);
const hudlOut = sdk.applyMapping(hudl[0], hudlMap);
ok('applyMapping yields normalized metric observations with the event attached',
   hudlOut.length === 3 && hudlOut.every(o => o.type === 'metric' && o.event === 'match_456') && hudlOut.find(o => o.label === 'minutes').value === 84);

// ── Category B: a Strava-style activity (self, nested-ish, string numbers) ──
const strava = [{ email: 'tatenda@club.fc', distance: '10400', moving_time: '3120', average_heartrate: 154 }];
const stravaMap = sdk.proposeMapping(strava);
ok('a self-activity export maps cleanly (email subject, 3 metrics)', stravaMap && stravaMap.subjectField === 'email' && stravaMap.fields.length === 3);
ok('string-encoded numbers are applied as real numbers', sdk.applyMapping(strava[0], stravaMap).find(o => o.label === 'distance').value === 10400);

// ── Category C: the universal CSV/webhook fallback ──
const csv = [{ name: 'Sam Fox', rpe: 7, wellness: 3 }];   // name is ambiguous here → should NOT auto-write
const csvId = sdk.resolveIdentity(users, csv[0]);
ok('the fallback still refuses to guess an ambiguous person', csvId.confidence === 'conflict' && csvId.id === null);

console.log(`\n=== connector-harness: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
