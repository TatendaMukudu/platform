/* MOBILE INSPECTION — look at the thing, do not assert about its source.

   A source-string assertion proves a class name is present. It cannot tell you that muted text is
   unreadable on a dark ground, that a toolbar is wrapping onto three lines at 390px, or that a
   failed request is rendering the same words as an empty one. Those are the defects being fixed
   here, so this drives a real Chromium at a real phone viewport and captures what a person would
   see.

   Usage:
     node scripts/mobile-inspect.js                 # capture every scene to /tmp screenshots
     node scripts/mobile-inspect.js --check         # capture AND run the measurable checks
     node scripts/mobile-inspect.js --scene notes   # one scene only

   Not part of `npm test`: it needs a browser binary and a running server, and the truth layer is
   deliberately hermetic. It is a tool for looking, and its measurements are reported rather than
   used as a gate.
   ============================================================ */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV = 'test';
process.env.IQ_DETERMINISTIC_ONLY = '1';

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

const OUT = process.env.IQ_SHOT_DIR || '/tmp/iq-mobile';
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const IPHONE = { width: 390, height: 844 };   // iPhone 14/15, the founder's device class

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

const C = 'shots';
_loadAllStores({
  orgMeta:  { [C]: { orgName: 'A Club', orgMode: 'sports' } },
  orgUsers: { [C]: {
    me: { id: 'me', name: 'A Player', email: 'me@x.io', role: 'member', orgCode: C, status: 'active',
          assignedNodeIds: ['n1'], profileComplete: true },
  } },
  orgNodes: { [C]: { n1: { nodeId: 'n1', name: 'First Team', memberIds: ['me'], leaderIds: [] } } },
});
_rebuildEmailIndex();

/* Relative luminance and contrast ratio, per WCAG. Reported, not enforced — the point is to
   replace "that looks a bit grey" with a number somebody can argue with. */
function _lum(rgb) {
  const c = rgb.map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(fg, bg) {
  const a = _lum(fg), b = _lum(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}
const parseRGB = s => (String(s).match(/\d+/g) || [0, 0, 0]).slice(0, 3).map(Number);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const only = process.argv.includes('--scene') ? process.argv[process.argv.indexOf('--scene') + 1] : null;
  const doCheck = process.argv.includes('--check');

  const server = await new Promise(res => { const s = app.listen(0, () => res(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = issueToken('me', C, 'member');

  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const findings = [];
  const shot = async (page, name) => {
    const f = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: f, fullPage: false });
    console.log(`  captured ${name} -> ${f}`);
    return f;
  };

  /* Every scene starts from a signed-in app at a phone viewport. The session is planted directly
     rather than typed through a login form: this is a rendering harness, not an auth test. */
  const openApp = async (ctx, { route = 'home', fail = null, empty = false, keepNotice = false } = {}) => {
    const page = await ctx.newPage();
    if (fail) {
      // A FAILED LOAD, forced. The defect being checked is that a failure renders differently
      // from an absence, and the only honest way to see that is to make one happen.
      await page.route(fail, r => r.abort('failed'));
    }
    if (empty) {
      await page.route('**/api/objects**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, objects: [] }) }));
    }
    /* The ONE key Auth actually reads. My first version planted three invented ones and every
       scene quietly rendered the login page — a harness that captures the wrong screen is worse
       than no harness, because the screenshots look plausible. */
    await page.addInitScript(([t, code]) => {
      localStorage.setItem('iq_auth', JSON.stringify({
        user: { id: 'me', name: 'A Player', role: 'member', orgCode: code, profileComplete: true },
        org: { orgName: 'A Club', orgMode: 'sports', organizationProfileComplete: true },
        token: t,
        permissions: {},
        domain: null,
      }));
      localStorage.setItem('iq_profile_complete_me', '1');
    }, [token, C]);
    /* NAVIGATE THROUGH THE APP, not through the hash. A `#notes` on the initial URL is ignored by
       the router, so every scene silently captured Home — six screenshots of the same screen with
       six different names, which is exactly the kind of plausible-looking wrong output a harness
       has to be checked for. */
    await page.goto(`${base}/`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(900);
    /* The one-time safeguarding notice covers the composer on a first run, so every screenshot
       was of that notice rather than of the screen underneath. Acknowledged here the way a person
       would, unless the scene is specifically about it. */
    if (!keepNotice) {
      const btn = await page.$('button:has-text("I understand")');
      if (btn) { await btn.click().catch(() => {}); await page.waitForTimeout(500); }
    }
    if (route && route !== 'home') {
      await page.evaluate(r => { if (typeof navigate === 'function') navigate(r); }, route).catch(() => {});
      await page.waitForTimeout(1200);
    }
    return page;
  };

  const SCENES = {
    /* The four states the brief distinguishes, so a screenshot of each can be compared. */
    home:         { route: 'home' },
    home_notice:  { route: 'home', keepNotice: true },
    home_empty:  { route: 'home', empty: true },
    home_failed: { route: 'home', fail: '**/api/objects**' },
    notes:       { route: 'notes' },
    focus:       { route: 'focus' },
    chat:        { route: 'chat' },
  };

  for (const [name, cfg] of Object.entries(SCENES)) {
    if (only && only !== name) continue;
    const ctx = await browser.newContext({ viewport: IPHONE, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await openApp(ctx, cfg);
    await shot(page, name);

    if (doCheck) {
      /* HORIZONTAL OVERFLOW — the single most common phone defect and completely invisible in
         source. */
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (overflow > 1) findings.push(`${name}: page scrolls horizontally by ${overflow}px`);

      /* CONTRAST of every visible text node against what is actually behind it. */
      const contrastRows = await page.evaluate(() => {
        const out = [];
        const seen = new Set();
        for (const el of document.querySelectorAll('body *')) {
          if (!el.textContent || !el.textContent.trim()) continue;
          if (el.children.length) continue;                       // leaf text only
          const r = el.getBoundingClientRect();
          if (r.width < 4 || r.height < 4) continue;
          const cs = getComputedStyle(el);
          if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.1) continue;
          // Walk up for the first non-transparent background.
          let bg = 'rgba(0, 0, 0, 0)', p = el;
          while (p && (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent')) { bg = getComputedStyle(p).backgroundColor; p = p.parentElement; }
          const key = `${cs.color}|${bg}|${el.className}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({ cls: String(el.className || el.tagName).slice(0, 60), color: cs.color, bg, size: cs.fontSize,
                     text: el.textContent.trim().slice(0, 40) });
        }
        return out;
      });
      for (const row of contrastRows) {
        const ratio = contrast(parseRGB(row.color), parseRGB(row.bg));
        if (ratio < 4.5) findings.push(`${name}: contrast ${ratio}:1 on "${row.text}" (${row.cls}) ${row.color} on ${row.bg}`);
      }

      /* TAP TARGETS. 44px is the platform guidance and the reason a control feels "fiddly". */
      const small = await page.evaluate(() => {
        const out = [];
        for (const el of document.querySelectorAll('button, a[href], input, select, textarea')) {
          const r = el.getBoundingClientRect();
          if (r.width < 2 || r.height < 2) continue;             // hidden
          if (r.height < 44) out.push({ t: (el.textContent || el.tagName).trim().slice(0, 30), h: Math.round(r.height) });
        }
        return out.slice(0, 12);
      });
      for (const s of small) findings.push(`${name}: tap target ${s.h}px high — "${s.t}"`);
    }
    await ctx.close();
  }

  /* THE KEYBOARD. A composer that works until the on-screen keyboard opens is a composer that
     does not work. Simulated by shrinking the visual viewport the way iOS does. */
  if (!only || only === 'keyboard') {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 380 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await openApp(ctx, { route: 'chat' });
    await shot(page, 'chat_keyboard_open');
    if (doCheck) {
      const composerVisible = await page.evaluate(() => {
        const el = document.querySelector('.iq-composer, .iqt-composer, #iq-ws-input, textarea');
        if (!el) return 'no composer found';
        const r = el.getBoundingClientRect();
        return (r.bottom <= window.innerHeight + 2 && r.top >= 0) ? 'visible' : `off-screen (top ${Math.round(r.top)}, bottom ${Math.round(r.bottom)}, viewport ${window.innerHeight})`;
      });
      if (composerVisible !== 'visible') findings.push(`keyboard: composer ${composerVisible}`);
    }
    await ctx.close();
  }

  await browser.close();
  server.close();

  console.log(`\n─── ${findings.length} finding(s) ───`);
  for (const f of findings) console.log('  •', f);
  console.log(`\nScreenshots in ${OUT}`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
