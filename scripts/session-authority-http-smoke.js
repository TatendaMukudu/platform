/* Truth layer — A TOKEN IS NOT A PERSON, AND A SESSION IS NOT A STANDING PERMISSION.

   A session records who signed in. It is not a record of who they still are, and until this file
   existed nothing in the product asked the difference. Reproduced through the real routes at head
   99a6544:

     issue a token to an active member
     set orgUsers[org][user].status = 'inactive'
     GET /api/contacts with the old token            ->  200

   The same for `suspended`. And worse than the finding as reported: DELETE the account outright
   and it still answered 200, because `requireAuth` never resolved the user at all. A token was in
   effect a bearer capability that outlived the person holding it — which is the shape of every
   "we removed them on Friday and they were still reading it on Monday" incident.

   ONE HALF OF THE FINDING IS REFUTED AND SAYS SO. `requirePermission` already resolved the
   current user and read the CURRENT role, so a role DOWNGRADE was already refused correctly.
   Section C drives that and asserts it, because a guard that only covers the broken half leaves
   the working half free to break later, and because reporting a fix for something that already
   worked is its own kind of false green.

   EVERY ASSERTION HERE IS AN HTTP PROOF. Nothing reads source, nothing calls a middleware
   directly: a token goes over the wire to a real route and the status code is the finding.

   Run: node scripts/session-authority-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, orgUsers, userPermissions } = S;

let pass = 0, fail = 0;
/* A THROW IS A FAILURE, NOT A SILENT EXIT — PROTOCOL lie #8. */
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const A = 'sau', B = 'sbu';

_loadAllStores({
  orgMeta: {
    [A]: { orgName: 'Alma College', orgMode: 'sports' },
    [B]: { orgName: 'Beta Institute', orgMode: 'education' },
  },
  orgUsers: {
    [A]: {
      ash:  { id: 'ash',  name: 'Ashton Mbeki', email: 'a@sau.io', role: 'member', orgCode: A, status: 'active' },
      boss: { id: 'boss', name: 'Club Admin',   email: 'b@sau.io', role: 'admin',  orgCode: A, status: 'active' },
      root: { id: 'root', name: 'Owner',        email: 'r@sau.io', role: 'superadmin', orgCode: A, status: 'active' },
      /* AN ACCOUNT WRITTEN BEFORE `status` EXISTED. Refusing these would sign out every person in
         an older organisation, which is a worse failure than the one this rule prevents — so the
         rule is "present unless marked otherwise" rather than "marked active". */
      old:  { id: 'old',  name: 'Legacy Account', email: 'o@sau.io', role: 'member', orgCode: A },
    },
    /* THE SAME USER ID IN A SECOND TENANT. Without it, "resolved inside the session's org" is a
       claim no assertion can distinguish from "resolved somewhere". */
    [B]: {
      ash:  { id: 'ash',  name: 'A Different Ashton', email: 'a@sbu.io', role: 'superadmin', orgCode: B, status: 'active' },
    },
  },
  orgNodes: { [A]: {}, [B]: {} },
});
_rebuildEmailIndex();
userPermissions[A] = { ash: {} };

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = t => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });
  const get  = (u, t) => fetch(base + u, { headers: H(t) }).then(r => r.status);
  const post = (u, b, t) => fetch(base + u, { method: 'POST', headers: H(t), body: JSON.stringify(b) })
    .then(r => r.status);

  /* TWO ROUTES, because the product has two doors and they used to disagree. `/api/contacts` is
     `requireAuth` only; the metrics write is `requirePermission('manage_metrics')`. A fix applied
     to one of them is not a fix. */
  const READ  = t => get('/api/contacts', t);
  const WRITE = t => post('/api/metrics', { name: `M ${Date.now()}${Math.random()}`, unit: 'count' }, t);

  const restore = (org, id, patch) => Object.assign(orgUsers[org][id], patch);

  try {
    console.log('\n  A — WHILE THE ACCOUNT IS PRESENT, EVERYTHING WORKS');
    const ashTok  = issueToken('ash',  A, 'member');
    const bossTok = issueToken('boss', A, 'admin');
    const oldTok  = issueToken('old',  A, 'member');
    ok('SA-A1 an active member reads what they are entitled to',
      (await READ(ashTok)) === 200);
    ok('SA-A2 an active admin can make the write their permission covers',
      (await WRITE(bossTok)) === 200);
    ok('SA-A3 an account written before `status` existed still works — the rule is "not marked otherwise", not "marked active"',
      (await READ(oldTok)) === 200);

    console.log('\n  B — AND THE MOMENT IT IS NOT, THE OLD TOKEN STOPS WORKING');
    /* THE REPRODUCTION, one state at a time, on BOTH doors. Each is restored before the next so a
       failure names one status rather than the first one tried. */
    for (const status of ['inactive', 'suspended', 'removed', 'archived']) {
      restore(A, 'ash', { status });
      const r = await READ(ashTok);
      ok(`SA-B1 a '${status}' account is refused on a requireAuth route (was 200)`, r === 401);
    }
    restore(A, 'ash', { status: 'active' });

    for (const status of ['inactive', 'suspended']) {
      restore(A, 'boss', { status });
      ok(`SA-B2 a '${status}' admin is refused on a requirePermission route (was 200)`,
        (await WRITE(bossTok)) === 401);
    }
    restore(A, 'boss', { status: 'active' });

    /* AN UNRECOGNISED STATUS FAILS CLOSED. The rule allowlists the good state rather than
       enumerating bad ones, so a status nobody has thought of yet denies rather than admits —
       AGENTS.md epistemic invariant 7. Enumerating the bad states is how the next one slips in. */
    restore(A, 'ash', { status: 'pending_review_2027' });
    ok('SA-B3 a status nobody has defined yet is refused, because the rule allowlists rather than blocklists',
      (await READ(ashTok)) === 401);
    restore(A, 'ash', { status: 'active' });

    console.log('\n  C — A DELETED ACCOUNT, WHICH IS WORSE THAN THE FINDING AS REPORTED');
    const goneAsh = orgUsers[A].ash;
    delete orgUsers[A].ash;
    ok('SA-C1 a token whose account no longer exists at all is refused on a requireAuth route (was 200)',
      (await READ(ashTok)) === 401);
    /* AND C1 IS ALSO THE CROSS-TENANT PROOF, which is worth saying because the mutation found it
       rather than the author. `ash` is a MEMBER in A and a SUPERADMIN in B. A resolution that
       falls back to "find this id anywhere" would hand A's deleted member B's superadmin — and
       both requests would answer 200, so nothing would look wrong from either side. The write
       below is the sharper half: it asks for a permission A's ash never had. */
    ok('SA-C1a …and a PERMISSION route refuses too, so a lookup that fell back to another tenant could not lend this token B\'s superadmin',
      (await WRITE(ashTok)) === 401);
    orgUsers[A].ash = goneAsh;
    ok('SA-C1b …and works again once the account is back, so C1 is about the account and not about the token expiring',
      (await READ(ashTok)) === 200);

    console.log('\n  D — THE ROLE IS RE-READ, NOT REMEMBERED (this half was ALREADY correct)');
    /* REFUTED, and driven anyway. `requirePermission` resolved the current user and read the
       current role before this round, so a downgrade was already refused. The assertion exists so
       that stays true, not because it was broken. */
    ok('SA-D1 an admin can write while they are an admin',
      (await WRITE(bossTok)) === 200);
    restore(A, 'boss', { role: 'member' });
    ok('SA-D2 …and the SAME token is refused the moment the stored role is downgraded',
      (await WRITE(bossTok)) === 403);
    restore(A, 'boss', { role: 'admin' });
    ok('SA-D3 …and restored when the role is, because the answer is computed per request rather than stored in the token',
      (await WRITE(bossTok)) === 200);

    /* AND THE SUPERADMIN BYPASS READS THE CURRENT RECORD TOO. It is the widest authority in the
       product and it was the one branch that returned before any presence question was asked. */
    const rootTok = issueToken('root', A, 'superadmin');
    ok('SA-D4 an active superadmin passes the permission gate',
      (await WRITE(rootTok)) === 200);
    restore(A, 'root', { status: 'inactive' });
    ok('SA-D5 …and an INACTIVE superadmin does not — the widest authority is not exempt from being present',
      (await WRITE(rootTok)) === 401);
    restore(A, 'root', { status: 'active' });
    restore(A, 'root', { role: 'member' });
    ok('SA-D6 …and a superadmin downgraded to member loses the bypass on the next request',
      (await WRITE(rootTok)) === 403);
    restore(A, 'root', { role: 'superadmin' });

    console.log('\n  E — AND THE TENANT IS THE SESSION\'S, NEVER A COLLIDING ID SOMEWHERE ELSE');
    /* `ash` exists in BOTH organisations, and is a superadmin in the second. If the lookup ever
       drifted to "find this user id anywhere", a member of A would silently acquire B's authority
       — and because both requests succeed, nothing would look wrong. */
    const ashInB = issueToken('ash', B, 'superadmin');
    ok('SA-E1 the same id in another tenant is a different person, and their token works there',
      (await READ(ashInB)) === 200);
    restore(A, 'ash', { status: 'inactive' });
    ok('SA-E2 …and deactivating A\'s ash does not disturb B\'s ash, because they were never the same record',
      (await READ(ashInB)) === 200);
    ok('SA-E2b …while A\'s ash is refused, so E2 is not passing because nothing was deactivated',
      (await READ(ashTok)) === 401);
    restore(A, 'ash', { status: 'active' });
    restore(B, 'ash', { status: 'inactive' });
    ok('SA-E3 …and deactivating B\'s ash does not sign out A\'s ash either — the resolution is per tenant in both directions',
      (await READ(ashTok)) === 200 && (await READ(ashInB)) === 401);
    restore(B, 'ash', { status: 'active' });

    console.log('\n  F — THE REFUSAL SAYS ENOUGH AND NOT MORE');
    restore(A, 'ash', { status: 'suspended' });
    const body = await fetch(base + '/api/contacts', { headers: H(ashTok) }).then(r => r.json()).catch(() => null);
    ok('SA-F1 the reason is one a person can act on — log in again',
      !!body && /log in again/i.test(String(body.error || '')));
    ok('SA-F2 …and does not disclose the account\'s state, which a holder of a stale token is not entitled to and cannot act on',
      !!body && !/suspend|inactive|removed|deleted|not found|no such/i.test(String(body.error || '')));
    restore(A, 'ash', { status: 'active' });

  } catch (e) { fail++; console.error('  FAIL session-authority suite threw:', e && e.stack); }

  server.close();
  console.log(`\nsession-authority-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
