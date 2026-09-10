/* BROWSER CHECK — ONBOARDING AUTHORITY AND PARTIAL OUTCOMES, in a real Chromium.

   NOT part of `npm test`: it needs a browser binary and the truth layer is hermetic.

   Everything here is a claim about what a person SEES, and this repository has learned four times
   that a passing suite says nothing about that. Three of the four corrections in this round are
   claims of exactly that kind:

     - the onboarding controls are hidden from somebody who lacks `edit_members`, and shown to
       somebody who has it — asserted server-side already, but the screen is a separate question;
     - a batch of invites where some rows fail renders the failures, with reasons;
     - Add Member whose placement step fails still shows the account and the link, and offers the
       placement again rather than replacing the panel with an error.

   Run: node scripts/onboard-browser-check.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const { chromium } = require('playwright-core');
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

const C = 'obc';
_loadAllStores({
  orgMeta:  { [C]: { orgName: 'Alma College', orgMode: 'sports', organizationProfileComplete: true } },
  orgUsers: { [C]: {
    boss: { id: 'boss', name: 'A Coach', email: 'boss@x.io', role: 'admin', orgCode: C, status: 'active',
      assignedNodeIds: ['n1'], leadershipNodeIds: ['n1'], profileComplete: true, passwordSet: true, passwordHash: 'x' },
    // Leads a node — and that is deliberately NOT enough to add people any more.
    lead: { id: 'lead', name: 'A Lead', email: 'lead@x.io', role: 'member', orgCode: C, status: 'active',
      assignedNodeIds: ['n1'], leadershipNodeIds: ['n1'], profileComplete: true, passwordSet: true, passwordHash: 'x' },
  } },
  orgNodes: { [C]: { n1: { nodeId: 'n1', name: 'First Team', parentId: null, childNodeIds: [],
    memberIds: ['boss', 'lead'], leaderIds: ['boss', 'lead'], rev: 0 } } },
});
_rebuildEmailIndex();

(async () => {
  const server = await new Promise(res => { const s = app.listen(0, () => res(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  // Chart.js comes from a CDN this run cannot reach; excluded by name so the exclusion cannot grow.
  const HARNESS_ONLY = [/^Chart is not defined$/];

  /* Sign in as a given person the way the app itself does, then open the Org Tree page. The
     permissions in localStorage are the ones the SERVER hands back, fetched here rather than
     invented, so the test cannot pass by agreeing with itself about what a role implies. */
  const openAs = async (userId, role) => {
    const token = issueToken(userId, C, role);
    const me = await fetch(`${base}/api/auth/me`, { headers: { Authorization: 'Bearer ' + token } })
      .then(r => r.json());
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => { if (!HARNESS_ONLY.some(rx => rx.test(e.message))) errs.push(e.message); });
    await page.addInitScript(([t, code, u, perms]) => {
      localStorage.setItem('iq_auth', JSON.stringify({
        user: u, org: { orgName: 'Alma College', orgMode: 'sports', organizationProfileComplete: true },
        token: t, permissions: perms, domain: null }));
      localStorage.setItem(`iq_profile_complete_${u.id}`, '1');
    }, [token, C, { ...me.user, passwordHash: undefined }, me.permissions]);
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await page.evaluate(() => navigate('people'));
    await page.waitForTimeout(1500);
    return { page, ctx, errs, token, perms: me.permissions };
  };

  const visible = (page, sel) => page.evaluate(s => {
    const el = document.querySelector(s);
    if (!el) return null;                      // absent is a different answer from hidden
    const r = el.getBoundingClientRect();
    return !el.hidden && r.width > 0 && r.height > 0;
  }, sel);

  try {
    console.log('\n  A — THE SCREEN AGREES WITH THE SERVER ABOUT WHO MAY ADD PEOPLE');
    const A1 = await openAs('boss', 'admin');
    ok('OB-A1 the server says an admin holds edit_members', A1.perms.edit_members === true);
    ok('OB-A2 …and the Add Member control is on the page for them', await visible(A1.page, '#people-add-member') === true);
    ok('OB-A3 …as is the Onboard tab', await visible(A1.page, '#people-tabbtn-onboard') === true);
    ok('OB-A4 …and pressing it actually opens the panel with the three link-based methods',
      await A1.page.evaluate(async () => {
        switchPeopleTab('onboard');
        await new Promise(r => setTimeout(r, 400));
        return (document.getElementById('onboard-hub-content') || {}).innerText || '';
      }).then(t => /Add Member/.test(t) && /invite link/i.test(t)));
    ok('OB-A5 …with no page error along the way', A1.errs.length === 0 || console.log('     errors:', A1.errs) || false);

    const A2 = await openAs('lead', 'member');
    ok('OB-A6 the server says leading a node does NOT confer edit_members', A2.perms.edit_members !== true);
    ok('OB-A7 …so the Add Member control is not shown to them', await visible(A2.page, '#people-add-member') === false);
    ok('OB-A8 …nor the Onboard tab', await visible(A2.page, '#people-tabbtn-onboard') === false);
    /* THE DEEP LINK. Hiding a button is not authority; the tab can still be reached by a stale
       nav or a pasted link, and what happens then is the part that matters. */
    ok('OB-A9 …and reaching the tab anyway lands them back on the tree, not on a panel of dead controls',
      await A2.page.evaluate(async () => {
        switchPeopleTab('onboard');
        await new Promise(r => setTimeout(r, 400));
        const onboard = document.getElementById('people-tab-onboard');
        const tree    = document.getElementById('people-tab-tree');
        return getComputedStyle(onboard).display === 'none' && getComputedStyle(tree).display !== 'none';
      }));
    ok('OB-A10 …and if the panel is rendered directly it says whose job this is, rather than offering the form',
      await A2.page.evaluate(async () => {
        renderOnboardHub();
        await new Promise(r => setTimeout(r, 300));
        const t = (document.getElementById('onboard-hub-content') || {}).innerText || '';
        return /not part of your access/i.test(t) && !/EMAIL ADDRESS/i.test(t);
      }));
    ok('OB-A11 …with no page error', A2.errs.length === 0 || console.log('     errors:', A2.errs) || false);

    console.log('\n  B — A BATCH OF INVITES SHOWS THE ROWS THAT FAILED');
    const B = A1;
    /* Two addresses the server will refuse (they are not addresses) and one it will accept. The
       old panel rendered the one link and said nothing at all about the other two. */
    const batch = await B.page.evaluate(async () => {
      _openOnboardSection('invite');
      await new Promise(r => setTimeout(r, 300));
      document.getElementById('ob-invite-emails').value =
        'real.person@example.com\nnot-an-address\nalso bad';
      await _submitEmailInvites();
      await new Promise(r => setTimeout(r, 600));
      return { out: (document.getElementById('ob-invite-result') || {}).innerText || '',
               box: (document.getElementById('ob-invite-emails') || {}).value || '' };
    });
    ok('OB-B1 the result says how many of how many, so a partial batch cannot read as a whole one',
      /1 of 3/.test(batch.out));
    ok('OB-B2 …and names every address that failed', /not-an-address/.test(batch.out) && /also bad/.test(batch.out));
    ok('OB-B3 …the one that worked still shows its link to copy', /Copy Link/.test(batch.out));
    ok('OB-B4 …and the failed addresses are still in the box, the successful one gone, so a resubmit cannot double it',
      /not-an-address/.test(batch.box) && !/real\.person@example\.com/.test(batch.box));

    console.log('\n  C — ADD MEMBER NEVER LOSES AN ACCOUNT IT JUST MADE');
    /* The failure is INJECTED at the tree route, which is the boundary that really fails in the
       wild: a compare-and-set conflict when somebody else moved the tree. Everything before it —
       the account, the invite link — is the real thing. */
    const partial = await B.page.evaluate(async () => {
      const realFetch = window.fetch;
      window.fetch = (u, o) => (String(u).includes('/api/tree/node/')
        ? Promise.resolve(new Response(JSON.stringify({ error: 'conflict' }), { status: 409 }))
        : realFetch(u, o));
      _openOnboardSection('add');
      await new Promise(r => setTimeout(r, 400));
      document.getElementById('ob-add-first').value = 'Injected';
      document.getElementById('ob-add-last').value  = 'Person';
      document.getElementById('ob-add-email').value = 'injected@example.com';
      const sel = document.getElementById('ob-add-node');
      if (sel) sel.value = 'n1';
      await _submitAddPerson();
      await new Promise(r => setTimeout(r, 800));
      window.fetch = realFetch;
      return (document.getElementById('ob-add-result') || {}).innerText || '';
    });
    ok('OB-C1 the account it created is still reported as created', /Account created for Injected Person/.test(partial));
    ok('OB-C2 …the invite link is still there to hand over', /Copy Invite Link/i.test(partial) || /set their password/i.test(partial));
    ok('OB-C3 …the placement that failed is named, with the unit it did not join',
      /Not added to First Team/.test(partial));
    ok('OB-C4 …and the placement is offered again on its own, without re-creating the account',
      /Retry placement/.test(partial));
    ok('OB-C5 the account really does exist on the server, so the screen was telling the truth',
      Object.values(S.orgUsers[C]).some(u => u.email === 'injected@example.com'));
    ok('OB-C6 …and the retry, once the tree answers normally, actually places them',
      await B.page.evaluate(async () => {
        const btn = [...document.querySelectorAll('#ob-add-assign button')][0];
        if (!btn) return false;
        btn.click();
        await new Promise(r => setTimeout(r, 900));
        return /Placed\./.test((document.getElementById('ob-add-assign') || {}).innerText || '');
      }));
    ok('OB-C7 …which the server confirms, exactly once — the retry did not double the membership',
      (S.orgNodes[C].n1.memberIds || []).filter(id =>
        (S.orgUsers[C][id] || {}).email === 'injected@example.com').length === 1);
    ok('OB-C8 …and no page error was thrown by any of it', B.errs.length === 0 || console.log('     errors:', B.errs) || false);

    /* ══ D — A PARTIAL CSV IMPORT IS NOT "IMPORT FAILED" ══════════════════════════════════════
       Found by this gate, and it was shipped green through CI because NOTHING tested this
       function. When the route was corrected to stop claiming blanket success, the client's
       `if (!data.ok) throw new Error(data.error || 'Import failed')` turned that correction into
       the opposite lie: a three-row file with one bad address created two real accounts, and the
       screen said "Import failed". The coach was told nobody was imported while two people had
       accounts, was never shown which row was wrong, and the roster was never refreshed because
       the throw skipped it. */
    console.log('\n  D — A PARTIAL CSV IMPORT REPORTS EVERY ROW');
    const imported = await B.page.evaluate(async () => {
      _openOnboardSection('import');
      await new Promise(r => setTimeout(r, 400));
      // The exact shape _previewImportFile produces from a parsed CSV.
      _importRows = [
        { name: 'Row One', email: 'row1@example.com', role: 'member' },
        { name: 'Row Two', email: 'row2@example.com', role: 'member' },
        { name: 'Row Bad', email: 'not-an-address',   role: 'member' },
      ];
      await _submitImport();
      await new Promise(r => setTimeout(r, 900));
      return (document.getElementById('ob-import-result') || {}).innerText || '';
    });
    ok('OB-D1 the screen does NOT say the import failed when two accounts were created',
      !/^Import failed/.test(imported.trim()) && !/^Could not/i.test(imported.trim()));
    ok('OB-D2 …it says how many of how many', /2 of 3 imported/.test(imported));
    ok('OB-D3 …and names the row that could not be imported, with the reason',
      /Row Bad/.test(imported) && /Invalid email/i.test(imported));
    ok('OB-D4 the two accounts really do exist on the server, so the screen was telling the truth',
      ['row1@example.com', 'row2@example.com']
        .every(e => Object.values(S.orgUsers[C]).some(u => u.email === e))
      && !Object.values(S.orgUsers[C]).some(u => u.email === 'not-an-address'));
    ok('OB-D5 …and a clean import still reads as a plain success',
      await B.page.evaluate(async () => {
        _importRows = [{ name: 'Row Three', email: 'row3@example.com', role: 'member' }];
        await _submitImport();
        await new Promise(r => setTimeout(r, 800));
        const t = (document.getElementById('ob-import-result') || {}).innerText || '';
        return /1 of 1 imported/.test(t) && !/could not be imported/.test(t);
      }));
    ok('OB-D6 …and no page error was thrown by any of it', B.errs.length === 0 || console.log('     errors:', B.errs) || false);

    /* ══ E — A RETRY THAT ALSO FAILS IS STILL RETRYABLE ═══════════════════════════════════════
       OB-C6 only ever exercised a retry that SUCCEEDED. If the first retry fails too — a
       genuinely contended tree, or an operator without manage_tree — the control must survive,
       or the placement state is lost and the account is stranded outside its unit with no way
       back except editing the Org Tree by hand. */
    console.log('\n  E — A RETRY THAT ALSO FAILS IS STILL RETRYABLE');
    const stubborn = await B.page.evaluate(async () => {
      const realFetch = window.fetch;
      window.fetch = (u, o) => (String(u).includes('/api/tree/node/')
        ? Promise.resolve(new Response(JSON.stringify({ error: 'conflict' }), { status: 409 }))
        : realFetch(u, o));
      _openOnboardSection('add');
      await new Promise(r => setTimeout(r, 400));
      document.getElementById('ob-add-first').value = 'Stubborn';
      document.getElementById('ob-add-last').value  = 'Case';
      document.getElementById('ob-add-email').value = 'stubborn@example.com';
      const sel = document.getElementById('ob-add-node');
      if (sel) sel.value = 'n1';
      await _submitAddPerson();
      await new Promise(r => setTimeout(r, 800));
      // First retry, still refused.
      document.querySelector('#ob-add-assign button').click();
      await new Promise(r => setTimeout(r, 900));
      const after = (document.getElementById('ob-add-assign') || {}).innerText || '';
      const stillThere = !!document.querySelector('#ob-add-assign button');
      // Second retry, this time the tree answers normally.
      window.fetch = realFetch;
      let placed = false;
      if (stillThere) {
        document.querySelector('#ob-add-assign button').click();
        await new Promise(r => setTimeout(r, 900));
        placed = /Placed\./.test((document.getElementById('ob-add-assign') || {}).innerText || '');
      }
      return { after, stillThere, placed };
    });
    ok('OB-E1 a retry that also fails says so', /Still not placed/.test(stubborn.after));
    ok('OB-E2 …and does NOT take the retry control away with it', stubborn.stillThere === true);
    ok('OB-E3 …so the third attempt can still place them once the tree is free', stubborn.placed === true);
    ok('OB-E4 …exactly once, with no duplicate membership from three attempts',
      (S.orgNodes[C].n1.memberIds || []).filter(id =>
        (S.orgUsers[C][id] || {}).email === 'stubborn@example.com').length === 1);
    /* OB-E5 REACHES THE CASE THE OTHERS CANNOT. Every retry above ran while the person was NOT
       yet in the node, so removing the already-present check was a no-op and nothing went red —
       PROTOCOL's ninth lie. Idempotency only means anything AFTER a successful placement, so
       this calls the real function once more on somebody who is already there. */
    const stubbornId = Object.values(S.orgUsers[C]).find(u => u.email === 'stubborn@example.com').id;
    ok('OB-E5 placing somebody who is ALREADY in the unit is a no-op, not a second membership',
      await B.page.evaluate(async id => (await _assignMemberToNode('n1', id)) === '', stubbornId)
      && (S.orgNodes[C].n1.memberIds || []).filter(x => x === stubbornId).length === 1);
  } catch (e) {
    fail++; console.error('  FAIL onboard browser check threw:', e && e.stack);
  }

  await browser.close();
  server.close();
  console.log(`\nonboard-browser-check: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
