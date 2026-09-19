/* Truth layer — WHOSE ORGANISATION IS THIS, AND WHOSE MACHINE.

   Two findings, one root confusion: authority over a thing being mistaken for authority over the
   place that thing lives in. Both reproduced through the real routes at head 99a6544.

   ── ONE ───────────────────────────────────────────────────────────────────────────────────────
   PUT /api/org/profile took the target organisation from the BODY and then asked whether the
   caller's user id existed, as a superadmin, INSIDE THE TARGET THEY HAD CHOSEN:

       const code = (orgCode || req.iqSession?.orgCode || '')
       const user = orgUsers[code]?.[req.iqSession.userId]

   So the authorisation question was "are you a superadmin over there", answered by an id
   collision. Two organisations that both contain a `root`, an `admin` or an `owner` — which is to
   say most of them — were one request apart. Driven: A's superadmin sent `{ orgCode: 'B' }` and
   B's profile was rewritten, 200, with A left untouched.

   ── TWO ───────────────────────────────────────────────────────────────────────────────────────
   Three routes that act on the WHOLE INSTANCE were guarded by `manage_settings`, a permission
   every tenant superadmin holds by role. Driven: a superadmin of an unrelated tenant, holding no
   platform key, called `seed-alma` and REPLACED the pilot organisation — its profile overwritten,
   one person replaced by thirty-one, six weeks of real data purged — and then flipped the host's
   language-model mode for everybody.

   The fix is not a new mechanism. `_isPlatformAdmin` and `IQ_PLATFORM_KEY` already guard the most
   destructive route in the product; three routes of the same kind simply did not use them.

   FAILED REQUESTS MUST MAKE NO MUTATION, and that is asserted by comparing the whole target store
   byte for byte rather than by reading a status code. A 403 that still wrote would look identical
   to a 403 that did not.

   Run: node scripts/tenant-boundary-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
/* THE HOST HAS AN OPERATOR. Set before server.js loads, because `_isPlatformAdmin` reads the
   environment at call time but the point of the fixture is a host where a key genuinely exists —
   otherwise "the operator succeeds" could not be driven at all and the suite would only ever
   prove that everybody is refused. */
process.env.IQ_PLATFORM_KEY = 'test-platform-key-r7';

const S  = require('../server.js');
const ai = require('../ai/gateway.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, orgMeta, orgUsers } = S;

let pass = 0, fail = 0;
/* A THROW IS A FAILURE, NOT A SILENT EXIT — PROTOCOL lie #8. */
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const A = 'tba', B = 'tbb';
/* The seed's fixed target. `seed-alma` replaces THIS code whoever asks, which is the whole
   reason it is a platform operation: the caller does not choose what it destroys. */
const PILOT = process.env.ALMA_CODE || 'alma-mens-soccer';

_loadAllStores({
  orgMeta: {
    [A]: { orgName: 'Alma College', orgMode: 'sports', orgSummary: 'A original' },
    [B]: { orgName: 'Beta Institute', orgMode: 'education', orgSummary: 'B original' },
    [PILOT]: { orgName: 'THE REAL PILOT', orgMode: 'sports', orgSummary: 'six weeks of real pilot data' },
  },
  orgUsers: {
    /* THE SAME USER ID, SUPERADMIN IN BOTH. Without the collision, "authorised by looking you up
       in the tenant you asked for" and "authorised by your own tenant" give the same answer and
       no assertion can tell them apart. */
    [A]: { root: { id: 'root', name: 'A Owner', email: 'r@tba.io', role: 'superadmin', orgCode: A, status: 'active' } },
    [B]: { root: { id: 'root', name: 'B Owner', email: 'r@tbb.io', role: 'superadmin', orgCode: B, status: 'active' } },
    [PILOT]: { coach: { id: 'coach', name: 'Head Coach', email: 'c@pilot.io', role: 'superadmin', orgCode: PILOT, status: 'active' } },
  },
  orgNodes: { [A]: {}, [B]: {}, [PILOT]: {} },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = t => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });
  const KEY = { 'Content-Type': 'application/json', 'x-platform-key': process.env.IQ_PLATFORM_KEY };
  const put  = (u, b, t) => fetch(base + u, { method: 'PUT', headers: H(t), body: JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const post = (u, b, h) => fetch(base + u, { method: 'POST', headers: h, body: JSON.stringify(b || {}) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));

  /* THE WHOLE TENANT, AS BYTES. A status code says what the route answered; this says what it
     did. They are different questions and only the second one is the finding. */
  const snap = code => JSON.stringify({ meta: orgMeta[code], users: orgUsers[code] });

  const tokA = issueToken('root', A, 'superadmin');
  const tokB = issueToken('root', B, 'superadmin');

  try {
    console.log('\n  A — THE ORGANISATION YOU CAN CHANGE IS THE ONE YOU ARE SIGNED IN TO');
    const bBefore = snap(B);
    const cross = await put('/api/org/profile', { orgCode: B, orgSummary: 'PWNED FROM A', orgMode: 'business' }, tokA);
    ok('TB-A1 a superadmin of A naming B in the body is REFUSED (was 200)',
      cross.status === 403);
    ok('TB-A1b …and B is byte-identical afterwards, which is the part a status code cannot tell you',
      snap(B) === bBefore);
    ok('TB-A1c …and the refusal says which organisation they may change, rather than a bare Forbidden',
      /only change the organisation you are signed in to/i.test(String((cross.j || {}).error || '')));

    /* THE LEGITIMATE UPDATE STILL WORKS, and only where it should. A gate that refused everything
       would pass every assertion above. */
    const aOk = await put('/api/org/profile', { orgSummary: 'A updated legitimately' }, tokA);
    ok('TB-A2 the same person updating their OWN organisation succeeds',
      aOk.status === 200 && orgMeta[A].orgSummary === 'A updated legitimately');
    ok('TB-A2b …and B is still untouched by it',
      snap(B) === bBefore);

    /* AND NAMING YOUR OWN ORGANISATION IS FINE, because a client that sends what it is entitled
       to send should not be punished for saying so out loud. */
    const aNamed = await put('/api/org/profile', { orgCode: A, orgSummary: 'A named itself' }, tokA);
    ok('TB-A3 naming your OWN organisation in the body is accepted — it agrees with the session',
      aNamed.status === 200 && orgMeta[A].orgSummary === 'A named itself');
    const aUpper = await put('/api/org/profile', { orgCode: A.toUpperCase(), orgSummary: 'A shouted' }, tokA);
    ok('TB-A3b …in any case, because an org code is not case-sensitive anywhere else either',
      aUpper.status === 200 && orgMeta[A].orgSummary === 'A shouted');

    /* THE OTHER DIRECTION, so this is a rule rather than one hard-coded tenant. */
    const aBefore = snap(A);
    const back = await put('/api/org/profile', { orgCode: A, orgSummary: 'PWNED FROM B' }, tokB);
    ok('TB-A4 and B\'s superadmin cannot reach A either',
      back.status === 403 && snap(A) === aBefore);

    console.log('\n  B — THE HOST IS NOT A TENANT');
    const pilotBefore = snap(PILOT);
    const modeBefore = ai.deterministicOnly();

    const seed = await post('/api/admin/seed-alma', {}, H(tokA));
    ok('TB-B1 a superadmin of an UNRELATED tenant cannot replace the demo organisation (was 200)',
      seed.status === 403);
    ok('TB-B1b …and the pilot organisation is byte-identical — no profile overwritten, nobody added',
      snap(PILOT) === pilotBefore);
    ok('TB-B1c …and the refusal names the authority they are missing rather than the permission they thought they had',
      /platform key/i.test(String((seed.j || {}).error || ''))
      && /whoever runs this instance/i.test(String((seed.j || {}).note || '')));

    const mode = await post('/api/admin/llm-mode', { deterministicOnly: !modeBefore }, H(tokA));
    ok('TB-B2 …nor flip deterministic-only mode for the whole instance (was 200)',
      mode.status === 403);
    ok('TB-B2b …and the host\'s mode is unchanged, which is the mutation the status code hides',
      ai.deterministicOnly() === modeBefore);

    const self = await post('/api/admin/llm-selftest', {}, H(tokA));
    ok('TB-B3 …nor run the host self-test, which reports host state and spends the host\'s budget (was 200)',
      self.status === 403);

    /* THE PILOT'S OWN SUPERADMIN IS STILL A TENANT SUPERADMIN. Being the top of the organisation
       the seed would overwrite does not make somebody the operator of the machine — and if it
       did, the boundary would be a coincidence of naming rather than a rule. */
    const pilotTok = issueToken('coach', PILOT, 'superadmin');
    const selfSeed = await post('/api/admin/seed-alma', {}, H(pilotTok));
    ok('TB-B4 not even the pilot\'s OWN superadmin may run a host operation on it',
      selfSeed.status === 403 && snap(PILOT) === pilotBefore);

    console.log('\n  C — AND THE PLATFORM OPERATOR CAN');
    const opMode = await post('/api/admin/llm-mode', { deterministicOnly: !modeBefore }, KEY);
    ok('TB-C1 the platform key succeeds where every tenant superadmin was refused',
      opMode.status === 200 && ai.deterministicOnly() === !modeBefore);
    ai.setDeterministicOnly(modeBefore);
    const wrong = await post('/api/admin/llm-mode', { deterministicOnly: !modeBefore },
      { 'Content-Type': 'application/json', 'x-platform-key': 'not-the-key' });
    ok('TB-C2 …and a WRONG key is refused, so C1 is about the key rather than about the header being present',
      wrong.status === 403 && ai.deterministicOnly() === modeBefore);

    const opSeed = await post('/api/admin/seed-alma', {}, KEY);
    ok('TB-C3 …and the operator can replace the demo organisation, so the capability still exists',
      opSeed.status === 200);
    ok('TB-C3b …which is what actually replaced it — proving B1b was a refusal and not a broken route',
      snap(PILOT) !== pilotBefore && Object.keys(orgUsers[PILOT] || {}).length > 1);

    console.log('\n  D — AND A TENANT\'S OWN SETTINGS ARE STILL A TENANT\'S OWN');
    /* THE OTHER HALF OF THE INSTRUCTION: preserve legitimate tenant permissions. A fix that
       locked an organisation out of its own configuration would pass every assertion above and
       be a worse product. `backfill-canonical` reads `req.iqSession.orgCode` and touches only
       that organisation, so it is tenant work and stays where it was. */
    const backfill = await post('/api/admin/backfill-canonical', { dryRun: true }, H(tokA));
    ok('TB-D1 a tenant superadmin can still run the tenant-scoped maintenance route',
      backfill.status === 200);
    ok('TB-D1b …and it reports on THEIR organisation, which is why it is theirs to run',
      !!(backfill.j && backfill.j.ok));

  } catch (e) { fail++; console.error('  FAIL tenant-boundary suite threw:', e && e.stack); }

  server.close();
  console.log(`\ntenant-boundary-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
