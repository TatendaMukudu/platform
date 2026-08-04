/* Truth layer — CROSS-ORG ISOLATION (HTTP). The privacy guarantee, proven: the write
   endpoints that once trusted a body-supplied orgCode/authorId now take identity ONLY from the
   session. A user in org A cannot: write into org B, forge another person's identity, invite
   themselves in as an admin, or edit/escalate another user. Unauthenticated calls are refused.
   Boots the real app (DB_OPTIONAL). Run: node scripts/cross-org-isolation-http-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, orgNotes, memberCheckins, orgUsers, libraryItems } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const A = 'orga', B = 'orgb';
_loadAllStores({
  orgMeta:  { [A]: { orgName: 'Club A' }, [B]: { orgName: 'Club B' } },
  orgUsers: {
    [A]: { alex: { id: 'alex', name: 'Alex', role: 'member', orgCode: A, status: 'active' } },
    [B]: { boss: { id: 'boss', name: 'Boss', role: 'superadmin', orgCode: B, status: 'active' },
           bella: { id: 'bella', name: 'Bella', role: 'member', orgCode: B, status: 'active' } },
  },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  // Alex is a plain MEMBER of org A. He will try to reach into org B and to forge identities.
  const alex = issueToken('alex', A, 'member');
  const post = (tok, path, body) => fetch(base + path, { method: 'POST', headers: tok ? { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const put = (tok, path, body) => fetch(base + path, { method: 'PUT', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));

  try {
    /* 1 — unauthenticated writes are refused (was: wide open) */
    ok('1 · posting a note with NO token is 401', (await post(null, '/api/notes', { orgCode: B, authorId: 'boss', content: 'x', type: 'shared' })).status === 401);

    /* 2 — a note is authored by the SESSION user in the SESSION org — body identity is ignored */
    const beforeB = (orgNotes && Object.values(orgNotes).filter(n => n.orgCode === B).length) || 0;
    await post(alex, '/api/notes', { orgCode: B, authorId: 'boss', content: 'forged into B as boss', type: 'shared' });
    const afterB = Object.values(orgNotes).filter(n => n.orgCode === B).length;
    const alexNote = Object.values(orgNotes).find(n => n.content === 'forged into B as boss');
    ok('2 · the note did NOT land in org B', afterB === beforeB);
    ok('2 · …it was written in org A, authored by Alex (body identity ignored)', alexNote && alexNote.orgCode === A && alexNote.authorId === 'alex');

    /* 3 — a check-in cannot be forged for another person / another org */
    await post(alex, '/api/member/checkin', { orgCode: B, memberName: 'Bella', mood: 1, note: 'forged' });
    const bellaKeys = Object.keys(memberCheckins || {}).filter(k => /bella/i.test(k));
    ok('3 · no check-in was forged for Bella in org B', bellaKeys.every(k => (memberCheckins[k] || []).every(c => c.note !== 'forged')));

    /* 4 — a plain member cannot invite anyone (let alone as an admin to another org) */
    ok('4 · a member inviting an admin is refused (403)', (await post(alex, '/api/auth/invite', { orgCode: B, role: 'superadmin' })).status === 403);

    /* 5 — a plain member cannot create a user (in any org) */
    ok('5 · a member creating a user is refused (403)', (await post(alex, '/api/auth/create-user', { orgCode: B, name: 'Mole', email: 'mole@x.com', role: 'admin' })).status === 403);

    /* 6 — a plain member cannot edit/escalate another user */
    const r6 = await put(alex, '/api/auth/update-user', { orgCode: B, userId: 'bella', updates: { role: 'superadmin' } });
    ok('6 · a member updating another user is refused (403)', r6.status === 403 && orgUsers[B].bella.role === 'member');

    /* 7 — a plain member cannot create a group (in any org) */
    ok('7 · a member creating a group is refused (403)', (await post(alex, '/api/groups/create', { orgCode: B, name: 'Ghost' })).status === 403);

    /* 8 — the legitimate self-path still works: Alex writes his OWN note in org A */
    const okNote = await post(alex, '/api/notes', { content: 'my own note', type: 'private' });
    ok('8 · a user CAN still write their own data (not over-locked)', okNote.j && okNote.j.ok);

    /* 9 — READ isolation: a query-string orgCode can't read another org's data */
    const get = (tok, path) => fetch(base + path, { headers: { Authorization: `Bearer ${tok}` } }).then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
    // Seed a group in org B so there's something to (not) leak.
    S.orgGroups[B] = [{ id: 'gB', name: 'B-only group', memberIds: ['bella'], leadIds: ['boss'] }];
    const leak = await get(alex, '/api/groups?orgCode=' + B);
    ok('9 · reading /api/groups?orgCode=B returns only org A (query orgCode ignored)', leak.j && (leak.j.groups || []).every(g => g.name !== 'B-only group'));
    ok('9 · an unauthenticated read is refused (401)', (await fetch(base + '/api/groups?orgCode=' + B)).status === 401);
  } catch (e) { fail++; console.log('  ✗ HTTP suite threw:', e && e.message); }

  server.close();
  console.log(`\ncross-org-isolation-http-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
