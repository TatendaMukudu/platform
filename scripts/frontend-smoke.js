/* Truth layer — FRONTEND smoke. Boots the real app in a real (headless) Chromium,
   logs in as a member and a coach against the seeded demo, and clicks through
   every page. FAILS on any uncaught JS error or the app's error boundary. This is
   the guard that would have caught the hydrateIcons navigate() crash.

   Uses the pre-installed Chromium via playwright-core (no browser download).
   Run:  node scripts/frontend-smoke.js   (or `npm run smoke:frontend`) */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const { chromium } = require('playwright-core');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = require('../server.js');
const seed = require('../scripts/seed');

// Resolve the pre-installed Chromium binary (pinned build dir may vary).
const fs = require('fs'), path = require('path');
function findChrome() {
  // 1. Let playwright-core resolve it (honours PLAYWRIGHT_BROWSERS_PATH; works in CI
  //    once `npx playwright install chromium` has run).
  try { const p = chromium.executablePath(); if (p && fs.existsSync(p)) return p; } catch (_) {}
  // 2. Scan the pre-installed browser dir used by this environment.
  for (const root of ['/opt/pw-browsers', process.env.PLAYWRIGHT_BROWSERS_PATH].filter(Boolean)) {
    try {
      for (const d of fs.readdirSync(root)) {
        if (!d.startsWith('chromium-') || d.includes('headless_shell')) continue;
        const p = path.join(root, d, 'chrome-linux', 'chrome');
        if (fs.existsSync(p)) return p;
      }
    } catch (_) {}
  }
  return null;
}

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

(async () => {
  const CHROME = findChrome();
  if (!CHROME) { console.log('  ⚠ Chromium not found under /opt/pw-browsers — skipping frontend smoke.'); process.exit(0); }

  const demo = await seed.buildDemoStore();
  _loadAllStores(demo);
  _rebuildEmailIndex();
  const CODE    = seed.DEMO_CODE;
  const users   = demo.orgUsers[CODE];
  const coach   = Object.values(users).find(u => u.role === 'superadmin');
  const member  = Object.values(users).find(u => u.role === 'member');
  const orgName = demo.orgMeta[CODE].orgName;

  const server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });

  const runSession = async (label, user, pages) => {
    const token = issueToken(user.id, CODE, user.role);
    const auth  = JSON.stringify({ user, org: { orgCode: CODE, orgName, orgMode: '' }, token, permissions: null });
    const ctx   = await browser.newContext();
    const page  = await ctx.newPage();
    const errors = [];
    // Ignore CDN-lib "not defined" errors — we deliberately block the CDN for
    // hermeticity, so these are test artifacts, not app bugs. Real code crashes
    // (e.g. a ReferenceError in navigate) are NOT ignored.
    const IGNORE = /\b(Chart|XLSX|JSZip)\b is not defined/;
    page.on('pageerror', e => { if (!IGNORE.test(e.message)) errors.push(`pageerror: ${e.message}`); });
    // Hermetic: block external (CDN) requests so the smoke never depends on network.
    await page.route('**/*', r => {
      const u = r.request().url();
      return (u.startsWith(base) || u.startsWith('data:')) ? r.continue() : r.abort();
    });
    // Stub the CDN globals so chart/export code paths run instead of throwing.
    await page.addInitScript(() => {
      const noop = () => {};
      // Auto-vivifying object so any nested access (Chart.defaults.font.family = …) works.
      const deep = () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : (t[k] = deep())), set: (t, k, v) => { t[k] = v; return true; } });
      function ChartStub() { return { destroy: noop, update: noop, resize: noop, data: { datasets: [] }, options: {} }; }
      ChartStub.register = noop; ChartStub.defaults = deep();
      window.Chart = window.Chart || ChartStub;
      window.XLSX = window.XLSX || { utils: { json_to_sheet: () => ({}), book_new: () => ({}), book_append_sheet: noop, aoa_to_sheet: () => ({}) }, writeFile: noop };
      window.JSZip = window.JSZip || function () { return { file: noop, generateAsync: () => Promise.resolve(new Blob()) }; };
    });
    await page.addInitScript(a => { try { localStorage.setItem('iq_auth', a); } catch (_) {} }, auth);
    await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1400);   // let boot + data load settle

    const boundary = () => page.evaluate(() => document.body.innerText.includes('Something went wrong loading IntelliQ'));
    ok(`[${label}] app boots without the error boundary`, !(await boundary()));

    // Nav must be REACHABLE: the mobile hamburger opens the sidebar drawer, so it
    // must actually contain a visible glyph/icon — an empty button (e.g. a control
    // glyph stripped by an over-eager emoji sweep) strands the user with no nav.
    const navReachable = await page.evaluate(() => {
      const h = document.getElementById('topbar-hamburger');
      if (!h) return false;
      return (h.querySelector('svg') || (h.textContent || '').trim().length > 0) ? true : false;
    });
    ok(`[${label}] the nav is reachable (hamburger has a visible control)`, navReachable);

    // The "press it 4 times" bug: open→navigate cycles left stale outside-click
    // handlers that slammed the drawer shut on the next tap. After several cycles,
    // one tap on the hamburger (its SVG child is the real target) must still OPEN it.
    if (typeof (await page.evaluate(() => typeof toggleSidebar)) === 'string') {
      const opensInOneTap = await page.evaluate(() => {
        const sb = document.getElementById('sidebar');
        for (let i = 0; i < 3; i++) { sb.classList.remove('open'); toggleSidebar(); navigate('home'); }
        return true;
      });
      await page.waitForTimeout(40);  // let any close-handler timeouts attach
      const stayedOpen = await page.evaluate(() => {
        const sb = document.getElementById('sidebar');
        sb.classList.remove('open');
        const h = document.getElementById('topbar-hamburger');
        (h.querySelector('svg') || h).dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return sb.classList.contains('open');
      });
      ok(`[${label}] the menu opens in a single tap (no stale close-handler leak)`, opensInOneTap && stayedOpen);
    }

    for (const p of pages) {
      await page.evaluate(pg => { if (typeof navigate === 'function') navigate(pg); }, p);
      await page.waitForTimeout(300);
      ok(`[${label}] navigate('${p}') — no error boundary`, !(await boundary()));
      // REFRESH on this route: a real reload must also boot cleanly (catches boot-time
      // parse/init errors that only a fresh load surfaces).
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(700);
      ok(`[${label}] refresh on '${p}' — no error boundary`, !(await boundary()));
    }

    // LOADING RESOLVES: no proactive/leader surface may sit forever on a spinner.
    // (Team = "Reading the signals…"; member Home = attention/opening.)
    const stuck = await page.evaluate(() => {
      const t = document.body.innerText || '';
      return /Reading the signals|Building timeline…|Reading the directional picture/.test(t);
    });
    ok(`[${label}] no surface is stuck on a loading state`, !stuck);

    ok(`[${label}] zero uncaught JS errors across all pages`, errors.length === 0);
    errors.slice(0, 6).forEach(e => console.log('        ', e));
    return errors;
  };

  // Exercise the leader Support view (member timeline modal) + morning check-in —
  // routes the base smoke never opened, and the ones the pass flagged.
  const runLeaderExtras = async (user) => {
    const token = issueToken(user.id, CODE, user.role);
    const auth  = JSON.stringify({ user, org: { orgCode: CODE, orgName, orgMode: '' }, token, permissions: null });
    const ctx   = await browser.newContext();
    const page  = await ctx.newPage();
    const errors = [];
    const IGNORE = /\b(Chart|XLSX|JSZip)\b is not defined/;
    page.on('pageerror', e => { if (!IGNORE.test(e.message)) errors.push(`pageerror: ${e.message}`); });
    await page.route('**/*', r => { const u = r.request().url(); return (u.startsWith(base) || u.startsWith('data:')) ? r.continue() : r.abort(); });
    await page.addInitScript(a => { try { localStorage.setItem('iq_auth', a); } catch (_) {} }, auth);
    await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1400);
    const boundary = () => page.evaluate(() => document.body.innerText.includes('Something went wrong loading IntelliQ'));
    // Load the People page so the roster is populated, then open the first member's
    // Support timeline (viewMemberTimeline).
    await page.evaluate(() => { if (typeof navigate === 'function') navigate('people'); });
    await page.waitForTimeout(900);
    const opened = await page.evaluate(() => {
      const list = (window.AppState && Array.isArray(AppState.members)) ? AppState.members : [];
      const m = list.find(x => x && (x.userId || x.id));
      if (!m || typeof viewMemberTimeline !== 'function') return 'no-member';
      viewMemberTimeline(m.name, m.userId || m.id); return 'ok';
    });
    await page.waitForTimeout(1200);
    ok(`[leader] Support timeline opens without the error boundary`, !(await boundary()));
    ok(`[leader] Support timeline resolves (not stuck on "Building timeline…")`,
       !(await page.evaluate(() => /Building timeline…/.test((document.getElementById('member-timeline-content')||{}).innerText || ''))));
    ok(`[leader] Support view zero uncaught JS errors`, errors.length === 0);
    errors.slice(0, 6).forEach(e => console.log('        ', e));
    await ctx.close();
    return errors;
  };

  // Team = ONE interface. After the async org-data load settles on leader-home, the
  // surface must be the privacy-safe briefing (renderIntelligence) — NOT the legacy
  // dashboard that a stale second dispatch used to swap in (per-member mood icons +
  // "Avg Mood" scores). This guards the "two different interfaces for Team" fix.
  const runLeaderHomeCheck = async (user) => {
    const token = issueToken(user.id, CODE, user.role);
    const auth  = JSON.stringify({ user, org: { orgCode: CODE, orgName, orgMode: '' }, token, permissions: null });
    const ctx   = await browser.newContext();
    const page  = await ctx.newPage();
    const errors = [];
    const IGNORE = /\b(Chart|XLSX|JSZip)\b is not defined/;
    page.on('pageerror', e => { if (!IGNORE.test(e.message)) errors.push(`pageerror: ${e.message}`); });
    await page.route('**/*', r => { const u = r.request().url(); return (u.startsWith(base) || u.startsWith('data:')) ? r.continue() : r.abort(); });
    await page.addInitScript(a => { try { localStorage.setItem('iq_auth', a); } catch (_) {} }, auth);
    await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { if (typeof navigate === 'function') navigate('leader-home'); });
    await page.waitForTimeout(1800);   // let the org-data load + any re-render settle
    const home = await page.evaluate(() => (document.getElementById('ldr-home-content') || {}).innerText || '');
    ok('[leader-home] renders the ONE briefing surface (not the legacy dashboard)', !/Avg Mood/i.test(home));
    ok('[leader-home] shows no per-member mood score to a leader', !/\d(?:\.\d)?\s*\/\s*5/.test(home));
    ok('[leader-home] resolved to a real briefing (attention or a calm empty state)',
       home.length > 0 && !/Reading the signals/.test(home));

    // Every OTHER reachable leader/admin surface obeys the same rule: direction +
    // status, never a member's (or the org's) mood as a number or "Avg Mood" score.
    const scan = async (route, elId) => {
      await page.evaluate(pg => { if (typeof navigate === 'function') navigate(pg); }, route);
      await page.waitForTimeout(1100);
      return page.evaluate(id => (document.getElementById(id) || document.querySelector('.page.active') || {}).innerText || '', elId);
    };
    for (const [route, elId] of [['organisation', 'myteam-content'], ['org-health', 'org-health-content']]) {
      const txt = await scan(route, elId);
      ok(`[${route}] shows no mood score (x/5) to a leader`, !/\d(?:\.\d)?\s*\/\s*5/.test(txt));
      ok(`[${route}] shows no "Avg Mood" number card`, !/Avg Mood/i.test(txt));
    }
    // The legacy IntelliQ page leaked per-member mood + names via server narrative;
    // it's retired. navigate('intelliq') must land on the privacy-safe briefing.
    await page.evaluate(() => { if (typeof navigate === 'function') navigate('intelliq'); });
    await page.waitForTimeout(400);
    const landed = await page.evaluate(() => (document.querySelector('.page.active') || {}).id || '');
    ok('[intelliq] retired → redirects to the privacy-safe briefing', landed === 'page-leader-home');
    ok('[leader surfaces] zero uncaught JS errors', errors.length === 0);
    errors.slice(0, 6).forEach(e => console.log('        ', e));
    await ctx.close();
    return errors;
  };

  try {
    const e1 = await runSession('member', member, ['home', 'checkin', 'notes', 'assessments', 'apps', 'inbox']);
    // Coach now also has their own "Me" space (id 'home') alongside the team view.
    const e2 = await runSession('coach',  coach,  ['home', 'assessments', 'apps', 'data-sources', 'leader-home', 'leader-people', 'people', 'organisation', 'settings']);
    const e3 = await runLeaderExtras(coach);
    const e4 = await runLeaderHomeCheck(coach);
    // Surface the exact parse/runtime error text (e.g. "Unexpected token") if any slipped through.
    [...e1, ...e2, ...e3, ...e4].filter(x => /Unexpected token|SyntaxError/i.test(x)).forEach(x => console.log('  ‼ PARSE ERROR:', x));
  } catch (e) {
    fail++; console.log('  ✗ smoke threw:', e.message);
  } finally {
    await browser.close();
    server.close();
    console.log(`\nfrontend-smoke: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
})();
