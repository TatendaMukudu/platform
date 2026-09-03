/* Truth layer — DELETING A SEED FROM THE REPOSITORY DOES NOT DELETE IT FROM THE DATABASE.

   Removing scripts/seed-club.js from git removes the ability to CREATE Trafford United. It does
   nothing whatsoever about the 21.5 MB of it already sitting in Postgres, which would go on
   being loaded on every cold start forever. The founder's instruction was "delete all our
   seeds"; the half that costs money is the half that lives in the database.

   So the purge is a runtime operation, and it has to agree with the persistence layer about
   what an organisation OWNS. That agreement is the whole risk: _durableUnits decides a key
   belongs to an org if it IS the org code or is prefixed with it, and a purge using any other
   rule would leave keys that no longer classify, drop them into the ":_" catch-all, and make
   them both permanent and expensive — the opposite of the intended effect, arrived at while
   appearing to succeed.

   Three things are asserted, and the third is the one that bites:
     · everything the org owned is gone, across every store, including token-keyed sessions
     · nothing belonging to any OTHER organisation is touched
     · no orphan is left behind in the catch-all unit

   Run: node scripts/org-purge-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const { _loadAllStores, _rebuildEmailIndex, _purgeOrg, _durableUnits, _unclassified,
  orgMeta, orgUsers, orgSignals, inquiryStates, activeSessions, emailIndex, assistantConversations } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

const GONE = 'old-demo-club';
const KEEP = 'the-real-pilot';

_loadAllStores({
  orgMeta: {
    [GONE]: { orgName: 'A Seed Nobody Wants Any More' },
    [KEEP]: { orgName: 'An Actual Customer' },
  },
  orgUsers: {
    [GONE]: { p1: { id: 'p1', name: 'Seeded Person', email: 'seed@old.demo', orgCode: GONE, status: 'active' } },
    [KEEP]: { r1: { id: 'r1', name: 'Real Person', email: 'real@pilot.org', orgCode: KEEP, status: 'active' } },
  },
  orgSignals: { [GONE]: [{ id: 's1', valueText: 'seeded evidence' }], [KEEP]: [{ id: 's2', valueText: 'real evidence' }] },
  // Composite keys — the "<org>:<user>" shape the persistence layer partitions on a prefix.
  inquiryStates: { [GONE]: { 'member:p1': { c: { inquiryId: 'i1' } } }, [KEEP]: { 'member:r1': { c: { inquiryId: 'i2' } } } },
  assistantConversations: { [`${GONE}:p1`]: [{ id: 'conv_a', messages: [] }], [`${KEEP}:r1`]: [{ id: 'conv_b', messages: [] }] },
  // Token-keyed: no org anywhere in the KEY, only in the value. The sweep cannot see these by
  // name, and a session left behind authenticates into an organisation that no longer exists.
  // expiresAt is load-bearing in the FIXTURE: sessions without one are pruned the moment the
  // stores load, so the first version of this suite asserted that a token was gone after the
  // purge when it had never survived long enough to be there. A vacuous pass on the one
  // assertion that covers the hardest case.
  activeSessions: {
    tok_seeded: { orgCode: GONE, userId: 'p1', expiresAt: Date.now() + 3600000 },
    tok_real:   { orgCode: KEEP, userId: 'r1', expiresAt: Date.now() + 3600000 },
  },
});
_rebuildEmailIndex();

const unitsFor = (org) => Object.keys(_durableUnits()).filter(k => k.endsWith(':' + org));

try {
  ok('OP1 both organisations are present before the purge (or everything below passes for free)',
    !!orgMeta[GONE] && !!orgMeta[KEEP] && unitsFor(GONE).length > 0);
  ok('OP1b …and both sessions actually survived loading, so OP5 and OP7 are testing something',
    !!activeSessions.tok_seeded && !!activeSessions.tok_real);

  const before = unitsFor(GONE).length;
  const result = _purgeOrg(GONE);

  ok('OP2 the purge reports what it removed, rather than a boolean — "purged" and "purged nothing" look identical otherwise',
    result && result.keys > 0 && typeof result.stores === 'object' && Object.keys(result.stores).length >= 4);

  ok('OP3 the organisation itself is gone', !orgMeta[GONE] && !orgUsers[GONE]);
  ok('OP4 …and its evidence, inquiries and conversations with it, across every store',
    !orgSignals[GONE] && !inquiryStates[GONE] && !assistantConversations[`${GONE}:p1`]);
  ok('OP5 …including a session keyed by its TOKEN, which the by-name sweep cannot see — one left behind authenticates into an org that no longer exists',
    !activeSessions.tok_seeded);
  ok('OP6 …and its people are out of the email index, so the address stops resolving',
    !emailIndex['seed@old.demo']);

  ok('OP7 THE OTHER ORGANISATION IS UNTOUCHED — every store, including the token-keyed one',
    !!orgMeta[KEEP] && !!orgUsers[KEEP] && !!orgSignals[KEEP] && !!inquiryStates[KEEP] &&
    !!assistantConversations[`${KEEP}:r1`] && !!activeSessions.tok_real && !!emailIndex['real@pilot.org']);

  ok('OP8 the durable units for that org are gone, which is what removes the rows from Postgres',
    before > 0 && unitsFor(GONE).length === 0);
  ok('OP9 …and the other org still has its units', unitsFor(KEEP).length > 0);

  /* The one that bites. If the purge disagreed with _durableUnits about ownership — say it
     deleted orgMeta first, so isOrg() stopped recognising the code — every remaining key would
     stop classifying and land in the ":_" catch-all: still stored, still loaded on every boot,
     and now impossible to find. A purge that appears to succeed while making the problem
     permanent is worse than one that fails. */
  const catchAll = Object.entries(_durableUnits()).filter(([k]) => k.endsWith(':_'));
  const orphans = catchAll.flatMap(([, v]) => Object.keys(v)).filter(k => k === GONE || k.startsWith(GONE + ':'));
  if (orphans.length) console.error('       orphaned into the catch-all:', orphans.join(', '));
  ok('OP10 nothing landed in the ":_" catch-all — an orphan there is stored forever and findable by nobody',
    orphans.length === 0);

  const second = _purgeOrg(GONE);
  ok('OP11 purging again is safe and honestly reports that it removed nothing',
    second.keys === 0);

} catch (e) { fail++; console.error('  FAIL suite threw:', e && e.stack); }

/* ── THE ROUTE. _purgeOrg is the dangerous part; the route is what stands in front of it, and
   until now nothing tested that. Two gates, and both have to hold: the platform key, and the
   org's own code typed back. A yes/no confirms that somebody pressed a button; typing the name
   confirms they know WHICH organisation is about to stop existing. ── */
(async () => {
  process.env.IQ_PLATFORM_KEY = 'test-platform-key';
  const { app, issueToken, orgMeta: meta } = S;
  S._loadAllStores({
    orgMeta: { doomed: { orgName: 'Doomed' }, safe: { orgName: 'Safe' } },
    orgUsers: {
      doomed: { d1: { id: 'd1', name: 'D', orgCode: 'doomed', role: 'superadmin', status: 'active' } },
      safe:   { s1: { id: 's1', name: 'S', orgCode: 'safe',   role: 'superadmin', status: 'active' } },
    },
  });
  S._rebuildEmailIndex();

  const server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const del = (code, { key, confirm } = {}) => fetch(`${base}/api/admin/org/${code}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...(key ? { 'x-platform-key': key } : {}) },
    body: JSON.stringify(confirm === undefined ? {} : { confirm }),
  }).then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));

  try {
    const noKey = await del('doomed', { confirm: 'doomed' });
    ok('OP12 without the platform key it is refused — an org superadmin cannot delete an organisation from the app',
      noKey.status === 403 && !!meta.doomed);

    const orgAdmin = await fetch(`${base}/api/admin/org/doomed`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${issueToken('d1', 'doomed', 'superadmin')}` },
      body: JSON.stringify({ confirm: 'doomed' }),
    });
    ok('OP13 …not even with a superadmin session for that very org — the blast radius belongs to whoever runs the platform',
      orgAdmin.status === 403 && !!meta.doomed);

    const noConfirm = await del('doomed', { key: 'test-platform-key' });
    ok('OP14 the key alone is not enough — the org code has to be typed back, so a mis-click cannot delete the wrong one',
      noConfirm.status === 400 && !!meta.doomed);

    const wrongConfirm = await del('doomed', { key: 'test-platform-key', confirm: 'safe' });
    ok('OP15 …and confirming with a DIFFERENT org code is refused rather than obeyed',
      wrongConfirm.status === 400 && !!meta.doomed && !!meta.safe);

    const done = await del('doomed', { key: 'test-platform-key', confirm: 'doomed' });
    ok('OP16 with both, it goes — and reports what it removed and what the instance now costs to load',
      done.status === 200 && done.j && done.j.ok === true && done.j.existed === true &&
      typeof done.j.freedMB === 'number' && typeof done.j.remainingMB === 'number' && !meta.doomed);
    ok('OP17 …and the other organisation is still here', !!meta.safe);

    const absent = await del('never-existed', { key: 'test-platform-key', confirm: 'never-existed' });
    ok('OP18 deleting something that was never there says so, rather than reporting a success that removed nothing',
      absent.status === 200 && absent.j.existed === false);
  } catch (e) { fail++; console.error('  FAIL route checks threw:', e && e.stack); }

  server.close();
  console.log(`\norg-purge-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
