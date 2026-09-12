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
const LOCAL_EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const EXE = process.env.CHROMIUM_PATH || (require('fs').existsSync(LOCAL_EXE) ? LOCAL_EXE : chromium.executablePath());
const IPHONE = { width: 390, height: 844 };

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, userPermissions } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

const C = 'stb';
_loadAllStores({
  orgMeta:  { [C]: { orgName: 'Alma College', orgMode: 'sports', organizationProfileComplete: true } },
  orgUsers: { [C]: {
    boss:   { id: 'boss', name: 'Platform Owner', email: 'b@x.io', role: 'superadmin', orgCode: C, status: 'active', profileComplete: true },
    admin:  { id: 'admin', name: 'Club Admin', email: 'a@x.io', role: 'admin', orgCode: C, status: 'active', profileComplete: true },
    /* A PARTIAL GRANT, which is the case an independent gate found and the one nothing had
       driven. `SETTINGS_TAB_ACCESS.org` opens for ANY of four permissions, and the cards inside
       it call routes gated on `manage_settings` alone — so somebody with metrics and nothing else
       saw the connection cards, pressed the buttons, and collected 403s from a screen that had
       just offered them the work. A role with everything or nothing can never show this. */
    metricsonly: { id: 'metricsonly', name: 'Metrics Only', email: 'mo@x.io', role: 'member', orgCode: C, status: 'active', profileComplete: true },
    player: { id: 'player', name: 'A Player', email: 'p@x.io', role: 'member', orgCode: C, status: 'active',
      assignedNodeIds: ['n1'], profileComplete: true },
  } },
  orgNodes: { [C]: { n1: { nodeId: 'n1', name: 'First Team', memberIds: ['player'], leaderIds: [] } } },
});
_rebuildEmailIndex();

/* THE GRANT ITSELF, through the store the server reads. One permission, deliberately not the one
   the Organisation tab's controls need. */
userPermissions[C] = { metricsonly: { manage_metrics: true } };

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
    const valuesShortcutForEditor = await a.page.evaluate(() => {
      switchSettingsTab('org');
      const btn = document.getElementById('settings-org-values-shortcut');
      const visible = !!btn && getComputedStyle(btn).display !== 'none';
      if (visible) btn.click();
      return { visible, opened: !!document.getElementById('settings-tab-values') && document.getElementById('settings-tab-values').style.display !== 'none' };
    });
    ok('ST-B4 an authorised values editor sees and can use the real Organisation shortcut',
      valuesShortcutForEditor.visible && valuesShortcutForEditor.opened);
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

    console.log('\n  D1 — AND THE ROW SAYS WHICH QUESTION IT ANSWERED');
    /* `IQVoice.isSupported()` asks whether THIS BROWSER OFFERS speech recognition. It cannot ask
       whether the person has granted the microphone — a separate permission, asked the first time
       and revocable — so somebody who had declined it read "Speaking instead of typing: ON" and
       was told they could do a thing that would not work. The label now names what was checked,
       and the microphone note is shown on the ON row as well as the OFF one, because the state
       that needed explaining was the ON one and a panel that only explains its negatives leaves
       its most misleading answer bare. */
    const yes = await asPerson('player', 'A Player', 'member');
    const onText = await yes.page.evaluate(() =>
      ((document.getElementById('settings-you-device') || {}).innerText || ''));
    ok('ST-D1a the row names what was actually checked — what this BROWSER offers, not what the microphone will do',
      /Speaking instead of typing\s*—\s*offered by this browser/i.test(onText));
    ok('ST-D1b …and an ON row still says the microphone is a separate permission that can be declined or withdrawn',
      /ON/.test(onText) && /separate permission/i.test(onText) && /decline/i.test(onText));
    ok('ST-D1c …and that IntelliQ is not told either way until the button is pressed, so nobody reads ON as "they have already agreed"',
      /not told either way/i.test(onText));
    ok('ST-D1d …and the reading-aloud row names its own question too, rather than borrowing the one above it',
      /Reading replies aloud\s*—\s*offered by this browser/i.test(onText));
    await yes.ctx.close();

    console.log('\n  D2 — A PARTIAL GRANT: THE TAB IS NOT THE CONTROL');
    /* THE CASE A ROLE WITH EVERYTHING OR NOTHING CANNOT SHOW. `manage_metrics` and nothing else
       opens the Organisation tab — correctly, because that tab holds things belonging to four
       different permissions — while every connection card inside it calls a route gated on
       `manage_settings`. So this person saw the cards, pressed the buttons, and collected 403s
       from a screen that had just offered them the work.

       Both halves are driven: what is RENDERED, and what the real endpoints answer. A check on
       either alone is the thing that let this through — the routes were right the whole time. */
    const pg = await asPerson('metricsonly', 'Metrics Only', 'member');
    ok('ST-D2a the partial grant opens the Organisation tab, which is correct — it holds more than one permission\'s worth',
      pg.view.tabs.includes('org') && pg.view.tabs.includes('metrics'));
    ok('ST-D2b …and NOT the tabs whose whole content they have no permission for',
      !pg.view.tabs.includes('values') && !pg.view.tabs.includes('goals')
      && !pg.view.tabs.includes('platform'));
    const orgPanel = await pg.page.evaluate(() => {
      const el = document.getElementById('settings-tab-org');
      const wasHidden = el.style.display;
      el.style.display = 'block';                     // read the tab they can switch to
      const text = el.innerText || '';
      const live = {
        ingestBtn: !!document.getElementById('ingest-token-btn'),
        connAddBtn: !!document.getElementById('conn-add-btn'),
        domainCards: (document.getElementById('domain-catalog') || {}).children?.length || 0,
        valuesShortcut: (() => {
          const btn = document.getElementById('settings-org-values-shortcut');
          return !!btn && getComputedStyle(btn).display !== 'none';
        })(),
      };
      const gated = [...el.querySelectorAll('[data-gated="manage_settings"]')].length;
      el.style.display = wasHidden;
      return { text, live, gated };
    });
    ok('ST-D2c no control that would refuse them is drawn — the buttons are gone, not merely disabled',
      orgPanel.live.ingestBtn === false && orgPanel.live.connAddBtn === false
      && orgPanel.live.domainCards === 0);
    ok('ST-D2c-values a metrics-only grant cannot see an Edit values shortcut that would refuse or redirect them',
      orgPanel.live.valuesShortcut === false);
    ok('ST-D2d …and the reason is drawn where they were, because an absence with no explanation is indistinguishable from a broken product',
      orgPanel.gated >= 4 && /organisation-settings permission/i.test(orgPanel.text));
    ok('ST-D2e …while Organisation Details, which is a read and genuinely theirs, is still there',
      /Organisation Details/i.test(orgPanel.text));
    /* AND THE ROUTES, FROM THIS SESSION'S OWN TOKEN. The client gating is a courtesy; the server
       is the gate, and a check that only looked at the screen would pass on a build where the
       server had quietly stopped checking. */
    const asThem = async (u, init) => pg.page.evaluate(async ([url, opts]) => {
      const r = await fetch(url, { ...(opts || {}), headers: { ...(opts?.headers || {}), ...Auth._headers() } });
      return r.status;
    }, [u, init || null]);
    ok('ST-D2f the ingest-token route refuses them, which is the gate the screen was only decorating',
      (await asThem('/api/org/ingest-token')) === 403);
    ok('ST-D2g …so does the connections route',
      (await asThem('/api/connections')) === 403);
    ok('ST-D2h …and changing the display language is refused too, though that route lets any signed-in person READ it',
      (await asThem('/api/org/domain', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pack: 'education' }) })) === 403
      && (await asThem('/api/org/domain')) === 200);
    /* THE POSITIVE HALF, and it has to be a WRITE. /api/metrics is requireAuth, so reading it
       proves nothing about the grant -- every signed-in person can. The route that actually asks
       for manage_metrics is the write, and that is the one that must answer for this to be a
       grant rather than a lockout dressed as one. */
    ok('ST-D2i …while the metrics WRITE they do have permission for is accepted, so this is a grant and not a lockout',
      (await asThem('/api/metrics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Sprint count', unit: 'count' }) })) < 400);
    await pg.ctx.close();

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
