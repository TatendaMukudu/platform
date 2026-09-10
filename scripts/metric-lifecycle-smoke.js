/* Truth layer — THE LIFE OF A METRIC, over HTTP, through the routes a coach actually reaches.

   An earlier suite asserted the metric fixes by reading source: it checked that server.js contained
   the string `const metric = _metricRecord({ name, source }` and that seed-alma.js contained a
   particular `.map(`. Both passed while the product was broken, and both would have gone red on a
   rename that changed nothing about behaviour. An independent audit called them false greens and
   was right: NOTHING there called a route.

   So everything here drives the real HTTP surface, and the four things it pins are the four a coach
   does in Settings in the pilot week: see the list, add one, rename one, remove one.

   THE HOSTILE INPUTS ARE NOT THEORETICAL. `PUT` carried its own copy of the name rule
   (`req.body.name.trim()`) rather than the create route's, so a body whose name was an object threw
   inside the handler and came back as HTTP 500, and a name of three spaces was stored as the empty
   string — a row in Settings with nothing in it, which cannot be told apart from any other. One
   rule, at one boundary, is what closes both.

   Run: node scripts/metric-lifecycle-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const { app, _loadAllStores, issueToken, orgMetrics, _migrateLegacyMetrics } = S;
const canonical = require('../ai/metric-record.js');

let pass = 0, fail = 0;
const ok = (n, c) => { let v = false; try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

const A = 'mtca', B = 'mtcb';
const admin = code => ({ id: 'lead', name: 'Lead', email: `lead@${code}.test`, role: 'admin',
  orgCode: code, status: 'active', passwordSet: true, passwordHash: 'x' });
_loadAllStores({
  orgMeta:  { [A]: { orgName: 'Org A' }, [B]: { orgName: 'Org B' } },
  orgUsers: {
    [A]: { lead: admin(A), memb: { id: 'memb', name: 'Member', email: `memb@${A}.test`,
      role: 'member', orgCode: A, status: 'active', passwordSet: true, passwordHash: 'x' } },
    [B]: { lead: admin(B) },
  },
  // Org A's store is in the LEGACY shape on purpose: bare strings, exactly what the Alma seed used
  // to write and what a real deployment still has sitting in the database.
  orgMetrics: { [A]: ['Training Load', 'Sleep'], [B]: [] },
});

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const T = { a: issueToken('lead', A, 'admin'), b: issueToken('lead', B, 'admin') };
  const req = (m, u, b, t) => fetch(base + u, { method: m,
    headers: { Authorization: 'Bearer ' + (t || T.a), 'Content-Type': 'application/json' },
    body: b === undefined ? undefined : JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const list = t => req('GET', '/api/metrics', undefined, t).then(r => (r.j || {}).metrics || []);

  try {
    console.log('\n  A — WHAT WAS ALREADY IN THE DATABASE IS USABLE');
    _migrateLegacyMetrics();
    const seen = await list();
    ok('ML-A1 the two legacy strings come back as records a screen can render',
      seen.length === 2 && seen.every(m => m && typeof m === 'object' && typeof m.name === 'string' && !!m.metricId));
    ok('ML-A2 …and nothing in the payload would print "undefined" at a coach',
      !JSON.stringify(seen).includes('undefined') && seen.every(m => m.name.trim().length > 0));

    /* THE ONE THAT MATTERED. A seeded metric could not be renamed or deleted, because `PUT` and
       `DELETE` look records up by `metricId` and a bare string has none. Both were silent. */
    const load = seen.find(m => m.name === 'Training Load');
    const ren = await req('PUT', `/api/metrics/${load.metricId}`, { name: 'Training Volume' });
    ok('ML-A3 a metric that arrived as a legacy string CAN be renamed', ren.status === 200
      && ren.j.metric.name === 'Training Volume');
    ok('ML-A4 …and the rename is what a reload would show, not just what the response said',
      (await list()).some(m => m.metricId === load.metricId && m.name === 'Training Volume'));
    const del = await req('DELETE', `/api/metrics/${load.metricId}`);
    ok('ML-A5 …and it can be removed', del.status === 200
      && !(await list()).some(m => m.metricId === load.metricId));
    ok('ML-A6 …while removing an id that is not there is an honest 404, not a silent success',
      (await req('DELETE', '/api/metrics/met_nothing')).status === 404
      && (await req('PUT', '/api/metrics/met_nothing', { name: 'X' })).status === 404);

    console.log('\n  B — A NAME IS A STRING, ON BOTH WRITE ROUTES');
    const made = await req('POST', '/api/metrics', { name: '  Recovery  ' });
    ok('ML-B1 creating trims the name rather than storing the spaces',
      made.status === 200 && made.j.metric.name === 'Recovery');
    const id = made.j.metric.metricId;
    /* Each of these used to be a different wrong answer: the object stored "[object Object]" on
       create and threw a 500 on rename; the blank stored an empty name; the number stored "42". */
    for (const [label, name] of [['an object', { evil: 1 }], ['an array', ['a', 'b']],
      ['a number', 42], ['blank space', '   '], ['null', null]]) {
      const c = await req('POST', '/api/metrics', { name });
      const p = await req('PUT', `/api/metrics/${id}`, { name });
      ok(`ML-B2 ${label} is refused with 400 by BOTH create and rename — never 500, never stored`,
        c.status === 400 && p.status === 400);
    }
    ok('ML-B3 …and after all of that the metric still has the name the coach gave it',
      (await list()).find(m => m.metricId === id).name === 'Recovery');
    /* ML-B3b EXISTS BECAUSE ML-B4 COULD NOT BITE. A gate mutation changed the rename to validate
       `metricName(req.body.name)` and then store `req.body.name` RAW, which would put "  Padded  "
       in the store — and every assertion stayed green, because no test ever renamed with padding
       and ML-B4 only inspects the names that happen to be there. An assertion over a set that
       never contains the bad case is the empty-fixture lie. */
    const padded = await req('PUT', `/api/metrics/${id}`, { name: '   Padded Name   ' });
    ok('ML-B3b a rename TRIMS what it stores, rather than validating one string and storing another',
      padded.status === 200 && padded.j.metric.name === 'Padded Name'
      && (await list()).find(m => m.metricId === id).name === 'Padded Name');
    await req('PUT', `/api/metrics/${id}`, { name: 'Recovery' });   // put it back for ML-B3
    ok('ML-B4 …and no metric in the store has a name that is not a trimmed non-empty string',
      (await list()).every(m => canonical.metricName(m.name) === m.name));
    ok('ML-B5 an order that is not a number is refused rather than written into the sort key',
      (await req('PUT', `/api/metrics/${id}`, { order: 'first' })).status === 400
      && (await list()).find(m => m.metricId === id).order !== 'first');

    console.log('\n  C — ONE DEFINITION OF IDENTITY, SEED AND SERVER');
    /* The audit's sharpest finding: the seed carried its OWN copy of the id hash. Two
       implementations of one identity rule, and if they ever drifted every seeded metric would
       silently detach from the routes that address it by id. This does not read either file — it
       BUILDS the demo organisation and compares the ids it produced with the ones the running
       server derives from the same names. */
    const { buildAlmaStore, ALMA_CODE } = require('./seed-alma.js');
    const seeded = (await buildAlmaStore()).store.orgMetrics[ALMA_CODE];
    ok('ML-C1 the seed produces canonical records, not the profile\'s bare strings',
      Array.isArray(seeded) && seeded.length > 0
      && seeded.every(m => m && typeof m === 'object' && !!m.metricId && !!m.name));
    ok('ML-C2 …with exactly the ids the server derives from the same names',
      seeded.every(m => m.metricId === canonical.metricId(m.name)));
    ok('ML-C3 …so re-seeding gives a metric the same identity it had, and links do not rot',
      (await buildAlmaStore()).store.orgMetrics[ALMA_CODE]
        .every((m, i) => m.metricId === seeded[i].metricId));
    /* And the same id, reached the other way: create a metric over HTTP with a name the seed
       uses, and it lands on the identity the seed would have given it. */
    const echoed = await req('POST', '/api/metrics', { name: seeded[0].name });
    ok('ML-C4 …and a metric typed by hand collides with the seeded one rather than shadowing it',
      echoed.j.metric.metricId === seeded[0].metricId);

    console.log('\n  D — METRICS BELONG TO ONE ORGANISATION');
    ok('ML-D1 org B does not see org A\'s metrics', (await list(T.b)).length === 0);
    ok('ML-D2 …and cannot rename one of them, even holding the right id',
      (await req('PUT', `/api/metrics/${id}`, { name: 'Stolen' }, T.b)).status === 404
      && (await list()).find(m => m.metricId === id).name === 'Recovery');
    ok('ML-D3 …nor delete one', (await req('DELETE', `/api/metrics/${id}`, undefined, T.b)).status === 404
      && (await list()).some(m => m.metricId === id));
    ok('ML-D4 a member without manage_metrics cannot write metrics at all',
      (await req('POST', '/api/metrics', { name: 'Nope' }, issueToken('memb', A, 'member'))).status === 403
      && (await req('DELETE', `/api/metrics/${id}`, undefined, issueToken('memb', A, 'member'))).status === 403);
    /* The first version of this assertion minted a token for the ADMIN carrying the role claim
       'member' and expected 403. It got 200 — and the product was right: authority is read from
       the stored user, never from what the bearer token says about itself. Pinned, since a token
       that could demote or promote itself is the whole ballgame. */
    ok('ML-D5 …and authority comes from the stored person, not from what a token claims about them',
      (await req('POST', '/api/metrics', { name: 'Claimed' }, issueToken('lead', A, 'member'))).status === 200
      && (await req('POST', '/api/metrics', { name: 'Claimed Too' }, issueToken('memb', A, 'admin'))).status === 403);

    /* ══ F — A STORED PERMISSION GRANT IS THE SHAPE THAT READS IT ═══════════════════════════════
       Same class of defect as the metric shape, found while tracing invitation authority.
       `_effectivePermissions` spreads the stored grant over the role defaults —
       `{ ...roleDefaults, ...leaderGrants, ...explicit }` — so an ARRAY spreads to
       `{0:'manage_settings', 1:'manage_people', 2:'view_org'}` and grants nothing at all. The demo
       organisation stored arrays. It never showed, because the one person holding them is a
       superadmin, who bypasses every permission check; the grants never had to work. Two of the
       three names were not permissions either — the roster permission is `edit_members`. */
    console.log('\n  F — A STORED PERMISSION GRANT IS THE SHAPE THAT READS IT');
    const seedPerms = (await buildAlmaStore()).store.userPermissions[ALMA_CODE] || {};
    const grants = Object.values(seedPerms);
    ok('ML-F1 the demo organisation stores grants as a map, which is what the resolver spreads',
      grants.length > 0 && grants.every(g => g && typeof g === 'object' && !Array.isArray(g)));
    ok('ML-F2 …every key is a permission the server actually recognises',
      grants.every(g => Object.keys(g).every(k => k in S._resolveRoleDefaults('member'))));
    ok('ML-F3 …and every value is a real grant rather than an index',
      grants.every(g => Object.values(g).every(v => v === true)));

    console.log('\n  E — THE MIGRATION LEAVES A HEALTHY STORE ALONE');
    const before = JSON.stringify(orgMetrics[A]);
    const repaired = _migrateLegacyMetrics();
    ok('ML-E1 running it again repairs nothing and changes nothing',
      repaired === 0 && JSON.stringify(orgMetrics[A]) === before);
  } catch (e) { fail++; console.error('  FAIL metric lifecycle suite threw:', e && e.stack); }

  server.close();
  console.log(`\nmetric-lifecycle-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
