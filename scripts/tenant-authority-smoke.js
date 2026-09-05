/* Truth layer — AUTHENTICATION IS NOT AUTHORITY, AND THE TENANT IS NEVER THE CALLER'S TO CHOOSE.

   Three routes, reproduced by Codex against disposable fixtures while the full npm test was
   green, which is the interesting part: every one of them had already been through a security
   pass.

     POST /api/auth/bulk-import        a member of org A could post org B and CREATE AN ADMIN there
     POST /api/platform/update-org-mode  a member of org A could change org B's mode
     POST /api/platform/register-org   cross-org was closed, but any member could still rename
                                       their OWN org — and a test recorded that as expected

   THE SHAPE OF THE MISTAKE, which is the reason this suite exists rather than three one-line
   fixes: the earlier pass answered "who are you" and stopped. Taking the organisation from the
   session closes cross-tenant writes and leaves every ordinary member of that tenant able to
   perform an operation they have no authority over. Two questions, and a route that answers one
   of them looks fixed from the outside.

   So every case below is asked FOUR ways, because only the four together mean anything:

     ANONYMOUS       no session at all
     ESCALATION      a real session in this org, without the authority
     CROSS-TENANT    a real session in another org, naming this one
     AUTHORISED      somebody who may — without which the three refusals could be a route
                     that simply does not work

   Hermetic: deterministic-only is forced for the whole suite, so no assertion can reach a
   provider even if a route is wide open. Disposable fixtures only; no real organisation appears.

   Run: node scripts/tenant-authority-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
/* NO EGRESS, for the whole file. A credential is deliberately present so what is proven is the
   refusal rather than the absence of a key. */
process.env.IQ_DETERMINISTIC_ONLY = '1';
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'sk-test-not-a-real-key';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, orgUsers, orgStore, orgMeta, emailIndex } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

const A = 'tenanta', B = 'tenantb';
_loadAllStores({
  orgMeta: {
    [A]: { orgName: 'Alpha Club', orgMode: 'sports' },
    [B]: { orgName: 'Beta Club',  orgMode: 'sports' },
  },
  orgStore: {
    [A]: { orgName: 'Alpha Club', orgMode: 'sports' },
    [B]: { orgName: 'Beta Club',  orgMode: 'sports' },
  },
  orgUsers: {
    [A]: {
      aMember: { id: 'aMember', name: 'A Member', email: 'am@x.io', role: 'member', orgCode: A, status: 'active' },
      aCoach:  { id: 'aCoach',  name: 'A Coach',  email: 'ac@x.io', role: 'coach',  orgCode: A, status: 'active' },
      aAdmin:  { id: 'aAdmin',  name: 'A Admin',  email: 'ad@x.io', role: 'admin',  orgCode: A, status: 'active' },
      aOwner:  { id: 'aOwner',  name: 'A Owner',  email: 'ao@x.io', role: 'superadmin', orgCode: A, status: 'active' },
    },
    [B]: {
      bMember: { id: 'bMember', name: 'B Member', email: 'bm@x.io', role: 'member', orgCode: B, status: 'active' },
      bOwner:  { id: 'bOwner',  name: 'B Owner',  email: 'bo@x.io', role: 'superadmin', orgCode: B, status: 'active' },
    },
  },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (path, token, body) => fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body || {}),
  }).then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));

  const T = {
    aMember: issueToken('aMember', A, 'member'),
    aCoach:  issueToken('aCoach',  A, 'coach'),
    aAdmin:  issueToken('aAdmin',  A, 'admin'),
    aOwner:  issueToken('aOwner',  A, 'superadmin'),
    bMember: issueToken('bMember', B, 'member'),
    bOwner:  issueToken('bOwner',  B, 'superadmin'),
  };
  const countB = () => Object.keys(orgUsers[B] || {}).length;
  const countA = () => Object.keys(orgUsers[A] || {}).length;

  try {
    /* ══ 1. BULK IMPORT — the worst of the three, because it MINTS ACCOUNTS. ══ */

    const rows = [{ name: 'Planted Admin', email: 'planted@x.io', role: 'admin' }];

    const anon = await call('/api/auth/bulk-import', null, { orgCode: B, users: rows });
    ok('TA1 ANONYMOUS: no session cannot import anybody',
      anon.status === 401 && countB() === 2);

    /* THE REPRODUCED FINDING. A member of A, posting B's code, creating an admin in B. */
    const cross = await call('/api/auth/bulk-import', T.aMember, { orgCode: B, users: rows });
    ok('TA2 CROSS-TENANT: a member of org A cannot import into org B by naming it in the body — this created an ADMIN in another organisation',
      cross.status === 403 && countB() === 2);
    ok('TA2b …and nothing leaked into the global email index either, which is what would have made the account reachable',
      !emailIndex['planted@x.io']);

    /* TA2c — A MUTATION SAID THIS SUITE WAS MASKED, and it was right.

       Deleting the tenant check entirely changed no answer above, because TA2's caller is an
       ordinary member: the PERMISSION gate refuses them first, and the tenant rule is never
       reached. Two gates in series and only the outer one under test — the same masking that hid
       an ownership rule in auth-boundary-smoke.

       This is the case where the tenant check is the ONLY thing standing: somebody who genuinely
       may import, naming an organisation that is not theirs. */
    const crossByAuthorised = await call('/api/auth/bulk-import', T.aAdmin, {
      orgCode: B, users: [{ name: 'Tenant Probe', email: 'tp@x.io', role: 'member' }],
    });
    ok('TA2c an ADMIN — who may import, and is refused only by the tenant rule — still cannot import into another organisation',
      crossByAuthorised.status === 403 && countB() === 2 && !emailIndex['tp@x.io']);
    ok('TA2d …and the refusal does not quietly redirect the import into their OWN organisation instead, which would be a silent success nobody asked for',
      countA() === 4);

    const escalate = await call('/api/auth/bulk-import', T.aMember, { users: rows });
    ok('TA3 ESCALATION: a member cannot import into their OWN organisation — being in a tenant is not authority over its roster',
      escalate.status === 403 && countA() === 4);

    const coach = await call('/api/auth/bulk-import', T.aCoach, { users: rows });
    ok('TA3b …and neither can a coach, who may see the roster but not edit it',
      coach.status === 403 && countA() === 4);

    /* THE ROLE CEILING. An admin has edit_members and may not mint an invite above their own
       level — so they must not be able to mint the account directly either. */
    const ceiling = await call('/api/auth/bulk-import', T.aAdmin, {
      users: [{ name: 'Super Plant', email: 'sp@x.io', role: 'superadmin' },
              { name: 'Ordinary Signing', email: 'os@x.io', role: 'member' }],
    });
    ok('TA4 THE ROLE CEILING HOLDS HERE TOO: an admin cannot create somebody above their own level, which they already could not do through an invite',
      ceiling.status === 200 && !emailIndex['sp@x.io']);
    ok('TA4b …refused per ROW, so the rest of the spreadsheet still imports and the refusal names the line rather than failing silently',
      emailIndex['os@x.io'] &&
      (ceiling.j.failed || []).some(f => /above your own level/i.test(f.reason || '')));

    /* AUTHORISED. Without this the four refusals could be a route that simply does not work. */
    const allowed = await call('/api/auth/bulk-import', T.aAdmin, {
      users: [{ name: 'Real Signing', email: 'rs@x.io', role: 'member' }],
    });
    ok('TA5 AUTHORISED: somebody who may edit members CAN import into their own organisation',
      allowed.status === 200 && (allowed.j.created || []).length === 1 && !!emailIndex['rs@x.io']);
    ok('TA5b …into the SESSION\'s organisation, so the account lands where the importer actually is',
      (emailIndex['rs@x.io'] || {}).orgCode === A);

    /* ══ 2. UPDATE ORG MODE — the mode drives the domain pack, so it sets the vocabulary and
       reasoning parameters for everybody in that organisation. ══ */

    ok('TA6 ANONYMOUS: no session cannot change a mode',
      (await call('/api/platform/update-org-mode', null, { orgCode: B, orgMode: 'wrecked' })).status === 401 &&
      orgMeta[B].orgMode === 'sports');
    ok('TA7 CROSS-TENANT: a member of A cannot change B\'s mode',
      (await call('/api/platform/update-org-mode', T.aMember, { orgCode: B, orgMode: 'wrecked' })).status === 403 &&
      orgMeta[B].orgMode === 'sports');
    ok('TA7b …and neither can B\'s OWN superadmin reach across into A, because authority is scoped to a tenant and does not travel',
      (await call('/api/platform/update-org-mode', T.bOwner, { orgCode: A, orgMode: 'wrecked' })).status === 403 &&
      orgMeta[A].orgMode === 'sports');
    ok('TA8 ESCALATION: a member cannot change their own organisation\'s mode',
      (await call('/api/platform/update-org-mode', T.aMember, { orgMode: 'wrecked' })).status === 403 &&
      orgMeta[A].orgMode === 'sports');
    ok('TA8b …nor can an admin, because manage_settings is the superadmin\'s by role default and this is a settings change',
      (await call('/api/platform/update-org-mode', T.aAdmin, { orgMode: 'wrecked' })).status === 403 &&
      orgMeta[A].orgMode === 'sports');
    const modeOk = await call('/api/platform/update-org-mode', T.aOwner, { orgMode: 'education' });
    ok('TA9 AUTHORISED: the organisation\'s own superadmin can change its mode',
      modeOk.status === 200 && orgMeta[A].orgMode === 'education');
    orgMeta[A].orgMode = 'sports';

    /* ══ 3. REGISTER ORG — cross-tenant was already closed. The half that was open was every
       member of a tenant renaming that tenant, and a test recorded it as correct. ══ */

    ok('TA10 ANONYMOUS: no session cannot register an organisation',
      (await call('/api/platform/register-org', null, { orgName: 'HACKED' })).status === 401 &&
      orgStore[A].orgName === 'Alpha Club');
    ok('TA11 CROSS-TENANT: naming another organisation in the body reaches nothing',
      (await call('/api/platform/register-org', T.aMember, { orgCode: B, orgName: 'HACKED' })).status === 403 &&
      orgStore[B].orgName === 'Beta Club');
    /* THE ONE THE OLD TEST DEFENDED. */
    ok('TA12 ESCALATION: a member cannot rename their OWN organisation — the previous suite asserted that they could, and called it working',
      (await call('/api/platform/register-org', T.aMember, { orgName: 'HACKED' })).status === 403 &&
      orgStore[A].orgName === 'Alpha Club');
    const reg = await call('/api/platform/register-org', T.aOwner, { orgName: 'Alpha Club Renamed', orgMode: 'sports' });
    ok('TA13 AUTHORISED: somebody who may manage settings CAN register their own organisation',
      reg.status === 200 && orgStore[A].orgName === 'Alpha Club Renamed');
    ok('TA13b …and a blank field never blanks a name that is already there, so a partial call is a merge and not a wipe',
      (await call('/api/platform/register-org', T.aOwner, { orgMode: 'sports' })).status === 200 &&
      orgStore[A].orgName === 'Alpha Club Renamed');
    orgStore[A].orgName = 'Alpha Club';

    /* ══ 4. NO EGRESS. Every assertion above ran with a credential present and the no-egress
       switch on, so what has been proven is the refusal and not the absence of a key. ══ */
    const ai = require('../ai/gateway.js');
    ok('TA14 the whole suite ran with a credential present and no model reachable, so these are refusals rather than a missing key',
      ai.deterministicOnly() === true && !!process.env.ANTHROPIC_API_KEY);

  } catch (e) { fail++; console.error('  FAIL suite threw:', e && e.stack); }

  server.close();
  console.log(`\ntenant-authority-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
