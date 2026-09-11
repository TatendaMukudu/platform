/* BROWSER CHECK — THREE TIERS OF SETTINGS, SEEN BY THREE PEOPLE.

   FOUNDER DECISION, September 2026: Personal Settings for every authenticated user, Organisation
   Settings for authorised administrators, Platform diagnostics for superadmins — and explicitly
   "do not give ordinary members administrative Settings merely to make the route visible".

   Both halves were wrong before. Settings was superadmin-ONLY, so an ordinary member had nowhere
   at all to answer "can this phone use its microphone" or "which build am I running" — and the
   second is the question the founder specifically needed answerable while standing in front of
   the device. And the single page mixed a club's own configuration with host diagnostics, so the
   screen that sets display language also carried a button that deletes an organisation.

   NOT part of `npm test`: the hermetic suite asserts the gating against SOURCE, and source is not
   a screen. Whether a member can actually open Settings, and what they find when they do, is a
   thing you have to look at. Three real sessions in three real contexts at 390px.

   Run: node scripts/settings-tiers-browser-check.js
   Needs: playwright-core (devDependency) and the Chromium at EXE below. */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
process.env.IQ_COMPOSER = '1';

const { chromium } = require('playwright-core');
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const IPHONE = { width: 390, height: 844 };

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

const C = 'stb';
_loadAllStores({
  orgMeta:  { [C]: { orgName: 'Alma College', orgMode: 'sports', organizationProfileComplete: true } },
  orgUsers: { [C]: {
    boss:   { id: 'boss', name: 'Platform Owner', email: 'b@x.io', role: 'superadmin', orgCode: C, status: 'active', profileComplete: true },
    admin:  { id: 'admin', name: 'Club Admin', email: 'a@x.io', role: 'admin', orgCode: C, status: 'active', profileComplete: true },
    player: { id: 'player', name: 'A Player', email: 'p@x.io', role: 'member', orgCode: C, status: 'active',
      assignedNodeIds: ['n1'], profileComplete: true },
  } },
  orgNodes: { [C]: { n1: { nodeId: 'n1', name: 'First Team', memberIds: ['player'], leaderIds: [] } } },
});
_rebuildEmailIndex();

(async () => {
  const server = await new Promise(res => { const s = app.listen(0, () => res(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const HARNESS_ONLY = [/^Chart is not defined$/];
  const pageErrors = [];

  /* Open Settings as one person and report what they can actually see. A SEPARATE CONTEXT per
     role, not a token swap in one tab — swapping localStorage under a live page leaves the
     previous session's Auth.permissions in memory, and this check is entirely about permissions. */
  const asPerson = async (id, name, role, { noSpeech = false } = {}) => {
    const ctx = await browser.newContext({ viewport: IPHONE, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    /* A BROWSER WITHOUT SPEECH RECOGNITION. This Chromium HAS it, so every device row reads ON and
       a panel that hard-coded `true` would look identical to one that asked — which is exactly
       what mutation HM5 proved, by staying green. Removing the API is how the answer is shown to
       come from the browser rather than from a constant. Safari and older Chrome differ here, so
       this is a real device class rather than a contrivance. */
    if (noSpeech) {
      await page.addInitScript(() => {
        try { delete window.SpeechRecognition; } catch (_) { window.SpeechRecognition = undefined; }
        try { delete window.webkitSpeechRecognition; } catch (_) { window.webkitSpeechRecognition = undefined; }
      });
    }
    page.on('pageerror', e => { if (!HARNESS_ONLY.some(rx => rx.test(e.message))) pageErrors.push(`${id}: ${e.message}`); });
    const token = issueToken(id, C, role);
    await page.addInitScript(([t, code, uid, uname, urole]) => {
      localStorage.setItem('iq_auth', JSON.stringify({
        user: { id: uid, name: uname, role: urole, orgCode: code, profileComplete: true },
        org: { orgName: 'Alma College', orgMode: 'sports', organizationProfileComplete: true },
        token: t, permissions: null, domain: null }));
      localStorage.setItem(`iq_profile_complete_${uid}`, '1');
    }, [token, C, id, name, role]);
    await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);
    const notice = await page.$('button:has-text("I understand")');
    if (notice) { await notice.click().catch(() => {}); await page.waitForTimeout(400); }
    // Let /api/auth/me land so Auth.permissions is the server's answer rather than the fallback.
    await page.waitForTimeout(900);
    await page.evaluate(() => navigate('settings'));
    await page.waitForTimeout(1200);
    const view = await page.evaluate(() => {
      const vis = el => !!(el && el.offsetParent !== null);
      const tabs = [...document.querySelectorAll('#page-settings .tab-btn')]
        .filter(vis).map(b => b.getAttribute('data-tab'));
      const navItems = [...document.querySelectorAll('.iq-nav-item')].map(b => (b.innerText || '').trim());
      const panels = {};
      ['you', 'org', 'metrics', 'values', 'goals', 'platform'].forEach(t => {
        const el = document.getElementById(`settings-tab-${t}`);
        panels[t] = vis(el);
      });
      return { tabs, panels, navItems,
        pageText: (document.getElementById('page-settings') || {}).innerText || '' };
    });
    return { page, ctx, view, token };
  };

  try {
    console.log('\n  A — A MEMBER HAS SETTINGS OF THEIR OWN');
    const m = await asPerson('player', 'A Player', 'member');
    ok('ST-A1 a member can open Settings at all — it used to be superadmin-only',
      m.view.tabs.length > 0);
    ok('ST-A1b …and the only tab they get is their own',
      JSON.stringify(m.view.tabs) === JSON.stringify(['you']));
    ok('ST-A2 …which is the panel actually shown', m.view.panels.you === true);
    ok('ST-A2b …with nothing administrative rendered',
      m.view.panels.org === false && m.view.panels.platform === false
      && m.view.panels.metrics === false && m.view.panels.values === false);
    /* THE POINT OF GIVING THEM THE ROUTE. Two questions a person must be able to answer about
       their own device, neither of which the server can answer for them. */
    ok('ST-A3 …and it answers what THIS DEVICE can do', /Speaking instead of typing/i.test(m.view.pageText)
      && /Reading replies aloud/i.test(m.view.pageText));
    ok('ST-A4 …and which build they are running, which is the question the founder needed answerable',
      /Which version you are running/i.test(m.view.pageText));
    ok('ST-A5 …and a way to read what IntelliQ holds about them',
      /What IntelliQ holds about you/i.test(m.view.pageText));
    /* WHAT MUST NOT BE THERE. Not greyed out — absent. */
    ok('ST-A6 a member is shown no host diagnostics at all',
      !/Remove an organisation/i.test(m.view.pageText)
      && !/Load the demo organisation/i.test(m.view.pageText)
      && !/Run LLM self-test/i.test(m.view.pageText));
    ok('ST-A6b …and no organisation configuration',
      !/Data mappings/i.test(m.view.pageText) && !/policies/i.test(m.view.pageText));
    /* REACHABLE, not merely typeable. A route somebody can only get to by calling navigate() from
       a console is not a route they have. (My first version of this asserted
       `(async () => true)() && true`, which is a truthy expression and proves nothing — deleted
       rather than left beside the real check it was pretending to introduce.) */
    const memberNav = await m.page.evaluate(() => {
      MemberApp.navToggle();
      return [...document.querySelectorAll('.iq-nav-item')].map(b => (b.innerText || '').trim());
    });
    ok('ST-A7 Settings is in the nav a member actually opens, so the route is reachable rather than only typeable',
      memberNav.length > 0 && memberNav.some(t => /Settings/i.test(t)));

    /* AND THE COURTESY IS NOT THE GATE. A member forcing the org tab from a console gets put
       back on their own, and the org routes refuse them regardless. */
    const forced = await m.page.evaluate(() => {
      switchSettingsTab('platform');
      const vis = el => !!(el && el.offsetParent !== null);
      return { platform: vis(document.getElementById('settings-tab-platform')),
               you: vis(document.getElementById('settings-tab-you')) };
    });
    ok('ST-A8 forcing an administrative tab from a console puts them back on their own',
      forced.platform === false && forced.you === true);
    /* THE REAL WRITE ROUTE, and getting this wrong the first time is worth recording: I forged a
       POST, the write is a PUT, Express answered 404 for the unmatched method — and the assertion
       reported a missing gate that was never missing. A test that names the wrong route reports a
       hole in the product where the hole is in the test, which is the more expensive direction to
       be wrong in. Both org-configuration writes are exercised now, by their real methods. */
    const refused = await m.page.evaluate(async ([t]) => {
      const h = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' };
      const values = await fetch('/api/values', { method: 'PUT', headers: h,
        body: JSON.stringify({ values: ['forged'] }) });
      const metrics = await fetch('/api/metrics', { method: 'POST', headers: h,
        body: JSON.stringify({ name: 'forged metric' }) });
      return { values: values.status, metrics: metrics.status };
    }, [m.token]);
    ok('ST-A8b …and the server refuses the write whatever the browser was persuaded to draw',
      (refused.values === 403 || refused.values === 401)
      && (refused.metrics === 403 || refused.metrics === 401));
    await m.ctx.close();

    console.log('\n  B — AN ADMINISTRATOR GETS THE ORGANISATION, NOT THE HOST');
    const a = await asPerson('admin', 'Club Admin', 'admin');
    ok('ST-B1 an administrator gets their own tab and the organisation’s',
      a.view.tabs.includes('you') && a.view.tabs.includes('org'));
    ok('ST-B1b …including what the organisation measures and stands for',
      a.view.tabs.includes('metrics') && a.view.tabs.includes('values'));
    ok('ST-B2 …and NOT the host diagnostics, which belong to whoever runs the instance',
      !a.view.tabs.includes('platform'));
    ok('ST-B2b …so no button that deletes an organisation appears on a club administrator’s screen',
      !/Remove an organisation/i.test(a.view.pageText));
    ok('ST-B3 …and they still land on their own tab first, not on the organisation’s',
      a.view.panels.you === true && a.view.panels.org === false);
    await a.ctx.close();

    console.log('\n  C — A SUPERADMIN GETS ALL THREE');
    const b = await asPerson('boss', 'Platform Owner', 'superadmin');
    ok('ST-C1 a superadmin gets every tier',
      ['you', 'org', 'metrics', 'values', 'goals', 'platform'].every(t => b.view.tabs.includes(t)));
    const platformText = await b.page.evaluate(() => {
      switchSettingsTab('platform');
      return (document.getElementById('settings-tab-platform') || {}).innerText || '';
    });
    ok('ST-C2 …and the host diagnostics are all in the platform tier, together',
      /Remove an organisation/i.test(platformText) && /Load the demo organisation/i.test(platformText)
      && /What this instance costs to load/i.test(platformText));
    ok('ST-C2b …including what the SERVER reports is switched on, which is a fact about the host',
      /What is switched on/i.test(platformText));
    ok('ST-C3 …while the device panel stays in the personal tier, because it is a fact about the device',
      !/Speaking instead of typing/i.test(platformText));
    await b.ctx.close();

    console.log('\n  D — THE DEVICE PANEL ASKS THE BROWSER, AND IS NOT A CONSTANT');
    /* The same person, the same build, a browser without speech recognition. If the panel reads
       ON here it is not reading anything. */
    const noSR = await asPerson('player', 'A Player', 'member', { noSpeech: true });
    const deviceText = await noSR.page.evaluate(() =>
      ((document.getElementById('settings-you-device') || {}).innerText || ''));
    ok('ST-D0 in a browser with no speech recognition, speaking-instead-of-typing reads OFF',
      /OFF\s*\n?\s*Speaking instead of typing/i.test(deviceText)
      || /Speaking instead of typing/i.test(deviceText) && /does not offer speech recognition/i.test(deviceText));
    ok('ST-D0b …and says it is about the browser rather than about IntelliQ',
      /about your browser, not about IntelliQ/i.test(deviceText));
    ok('ST-D0c …while reading aloud, which this browser CAN do, still reads ON — so the panel is answering per capability, not per device',
      /Reading replies aloud/i.test(deviceText) && !/cannot read text aloud/i.test(deviceText));
    ok('ST-D0d …and typing is never said to be affected',
      /Typing works as normal/i.test(deviceText));
    await noSR.ctx.close();

    console.log('\n  E — NO PAGE ERRORS');
    ok(`ST-E1 opening Settings as four different sessions raised no uncaught error (${pageErrors.length})`,
      pageErrors.length === 0);
    if (pageErrors.length) pageErrors.forEach(e => console.error('        ' + e));

  } catch (e) { fail++; console.error('  FAIL settings tiers browser check threw:', e && e.stack); }

  await browser.close();
  server.close();
  console.log(`\nsettings-tiers-browser-check: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
