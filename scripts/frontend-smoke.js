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

    for (const p of pages) {
      await page.evaluate(pg => { if (typeof navigate === 'function') navigate(pg); }, p);
      await page.waitForTimeout(300);
      ok(`[${label}] navigate('${p}') — no error boundary`, !(await boundary()));
    }
    ok(`[${label}] zero uncaught JS errors across all pages`, errors.length === 0);
    errors.slice(0, 6).forEach(e => console.log('        ', e));
    await ctx.close();
  };

  try {
    await runSession('member', member, ['home', 'checkin', 'notes', 'inbox']);
    // Coach now also has their own "Me" space (id 'home') alongside the team view.
    await runSession('coach',  coach,  ['home', 'leader-home', 'leader-people', 'people', 'organisation', 'settings']);
  } catch (e) {
    fail++; console.log('  ✗ smoke threw:', e.message);
  } finally {
    await browser.close();
    server.close();
    console.log(`\nfrontend-smoke: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
})();
