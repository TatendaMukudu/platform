/* THE DEMO, LOOKED AT. Review round 1, Claude's lane.

   Everything merged on 6 September was asserted through HTTP read paths and a headless
   harness. Nothing had been opened in a browser. Two agents reviewing server logic while
   nobody looks at the screen is how a pilot arrives with a working backend and an app nobody
   can use — so the bar for this pass is a screenshot, not a regex.

   The difference from scripts/mobile-inspect.js is the fixture. That one boots a single player
   with no records, so it can only ever photograph empty screens. This boots the SEEDED ALMA
   ORGANISATION and walks it as both roles, so what is on the screen is what a coach and a
   player will actually see on 26 September.

   It also compares the SCREEN against the API. For each surface it asks the server what the
   person may see, then asks the page what it is showing, and reports where those disagree.
   A surface that renders a lawful refusal as an absence, or an absence as a reassurance, is
   the failure this product cannot afford, and it is invisible to both a source-string
   assertion and a screenshot looked at on its own.

   Not part of `npm test`: it needs a browser binary and the truth layer is hermetic.

   Usage:
     node scripts/demo-walkthrough.js              # capture + compare, both roles
     node scripts/demo-walkthrough.js --role coach
     node scripts/demo-walkthrough.js --scene library
   ============================================================ */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV = 'test';
process.env.IQ_DETERMINISTIC_ONLY = '1';

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

const OUT = process.env.IQ_SHOT_DIR || path.join(__dirname, '..', 'docs', 'shots', 'r1');
const EXE = process.env.IQ_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const IPHONE = { width: 390, height: 844 };   // iPhone 14/15, the founder's device class

const { buildAlmaStore, ALMA_CODE } = require('./seed-alma.js');
const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, _backfillUserNodeIds, issueToken, orgUsers } = S;

const findings = [];
const note = (surface, severity, what) => { findings.push({ surface, severity, what }); };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const onlyRole  = process.argv.includes('--role')  ? process.argv[process.argv.indexOf('--role') + 1]  : null;
  const onlyScene = process.argv.includes('--scene') ? process.argv[process.argv.indexOf('--scene') + 1] : null;

  const { store, summary } = await buildAlmaStore();
  _loadAllStores(store); _rebuildEmailIndex(); try { _backfillUserNodeIds(); } catch (_) {}
  console.log(`\n  ${summary.orgName}: ${summary.players} players, ${summary.evidence} pieces of evidence, ${summary.inquiries} inquiries, ${summary.calls} calls`);

  const server = await new Promise(res => { const s = app.listen(0, () => res(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;

  const U = orgUsers[ALMA_CODE];
  const coach  = Object.values(U).find(u => u.email === 'coach@alma.edu');
  const player = Object.values(U).find(u => u.email === 'player@alma.edu');
  const quiet  = Object.values(U).find(u => u.role === 'member' && !store.inquiryStates[ALMA_CODE][`member:${u.id}`]);

  const ROLES = {
    coach:  { user: coach,  role: 'superadmin' },
    player: { user: player, role: 'member' },
    quiet:  { user: quiet,  role: 'member' },
  };

  /* WHAT THE SERVER SAYS THIS PERSON MAY SEE. The other half of every comparison below. */
  const api = async (u, tok) => {
    const r = await fetch(base + u, { headers: { Authorization: `Bearer ${tok}` } });
    return { status: r.status, j: await r.json().catch(() => null) };
  };

  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });

  /* Sign in by planting the one key Auth actually reads. This is a rendering harness, not an
     auth test — and an earlier version of the sibling harness planted three invented keys, so
     every scene quietly photographed the login page. Plausible-looking wrong output. */
  const openAs = async (ctx, who, route) => {
    const { user, role } = ROLES[who];
    const token = issueToken(user.id, ALMA_CODE, role);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e && e.message || e)));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
    await page.addInitScript(([t, code, u, r]) => {
      localStorage.setItem('iq_auth', JSON.stringify({
        user: { id: u.id, name: u.name, role: r, orgCode: code, profileComplete: true },
        org: { orgName: "Alma College Men's Soccer", orgMode: 'sports', organizationProfileComplete: true },
        token: t, permissions: {}, domain: null,
      }));
      localStorage.setItem(`iq_profile_complete_${u.id}`, '1');
    }, [token, ALMA_CODE, { id: user.id, name: user.name }, role]);
    await page.goto(`${base}/`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(900);
    // The one-time safeguarding notice covers the composer on a first run.
    const btn = await page.$('button:has-text("I understand")');
    if (btn) { await btn.click().catch(() => {}); await page.waitForTimeout(400); }
    if (route && route !== 'home') {
      await page.evaluate(r => { if (typeof navigate === 'function') navigate(r); }, route).catch(() => {});
      await page.waitForTimeout(1400);
    }
    page._iqErrors = errors;
    page._iqToken = token;
    return page;
  };

  const shot = async (page, name) => {
    const f = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: f, fullPage: false });
    return f;
  };

  /* The visible text of the active page only. `.page` sections all exist in the DOM at once and
     are shown or hidden, so reading document.body would report every screen at once — which
     would make every "is it on the page" check pass everywhere. */
  const visibleText = page => page.evaluate(() => {
    const secs = [...document.querySelectorAll('.page')].filter(s => {
      const cs = getComputedStyle(s);
      return cs.display !== 'none' && cs.visibility !== 'hidden' && s.offsetHeight > 0;
    });
    return secs.map(s => s.innerText).join('\n').replace(/\s+/g, ' ').trim();
  });

  const overflow = page => page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);

  const SCENES = ['home', 'high', 'low', 'inquiry', 'focus', 'notes'];
  const LABEL = { notes: 'library', high: 'highs', low: 'lows', inquiry: 'inquiries', focus: 'focuses' };

  for (const who of Object.keys(ROLES)) {
    if (onlyRole && onlyRole !== who) continue;
    if (!ROLES[who].user) { note(who, 'harness', 'no such fixture user'); continue; }
    console.log(`\n  ── ${who.toUpperCase()} (${ROLES[who].user.name}) ──`);

    for (const scene of SCENES) {
      if (onlyScene && onlyScene !== scene) continue;
      const ctx = await browser.newContext({ viewport: IPHONE, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      const page = await openAs(ctx, who, scene);
      const name = `${who}-${LABEL[scene] || scene}`;
      await shot(page, name);
      const text = await visibleText(page);
      const ox = await overflow(page);

      console.log(`     ${name.padEnd(22)} ${String(text.length).padStart(5)} chars  overflow=${ox}px`);
      if (ox > 2) note(name, 'layout', `horizontal overflow of ${ox}px at 390px`);
      if (page._iqErrors.length) note(name, 'js', page._iqErrors.slice(0, 3).join(' | '));
      if (!text || text.length < 20) note(name, 'blank', 'the visible page has almost no text on it');

      /* ── THE COMPARISON. What the API said this person may see, against what is on screen. ── */
      if (['high', 'low', 'inquiry'].includes(scene)) {
        const r = await api(`/api/objects?kind=${scene}&scope=all`, page._iqToken);
        const objs = (r.j && r.j.objects) || [];
        const shown = objs.filter(o => {
          const h = (o.explained && o.explained.headline) || '';
          return h && text.includes(h.replace(/\.$/, '').slice(0, 40));
        });
        console.log(`        api says ${objs.length}, page shows ${shown.length}`);
        if (objs.length && !shown.length) {
          note(name, 'MISSING', `the server returned ${objs.length} ${scene}(s) and none of their headlines are on the page`);
        } else if (objs.length > shown.length) {
          const lost = objs.filter(o => !shown.includes(o)).map(o => (o.explained || {}).headline);
          note(name, 'partial', `${objs.length - shown.length} of ${objs.length} not on the page: ${lost.join(' / ')}`);
        }
        if (!objs.length && !/nothing|no |yet|empty|not/i.test(text)) {
          note(name, 'empty-state', 'the bucket is empty and the page does not say so in words');
        }
      }
    }

    /* ── THE COACH'S WITHHELD FINDING. The most distinctive thing this product does, and I
       have only ever seen it in a JSON payload. ── */
    if (who === 'coach') {
      const ctx = await browser.newContext({ viewport: IPHONE, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      const page = await openAs(ctx, 'coach', 'home');
      const tok = page._iqToken;
      const nodes = await api('/api/org-tree', tok);
      const varsity = JSON.stringify(nodes.j || {}).match(/"nodeId":"([^"]+)","name":"Varsity Squad"/);
      const nodeId = varsity ? varsity[1] :
        Object.values(S.orgNodes[ALMA_CODE]).find(n => n.name === 'Varsity Squad').nodeId;
      const st = await api(`/api/group/${nodeId}/state`, tok);
      const sq = (st.j && (st.j.state || st.j)) || {};
      console.log(`     squad state: high=${!!sq.high} low=${!!sq.low} withheld=${(sq.withheld || []).length}`);
      const text = await visibleText(page);
      if ((sq.withheld || []).length && !/can't put in front of you|cannot put in front of you|too few people/i.test(text)) {
        note('coach-home', 'MISSING', `the server is withholding ${(sq.withheld || []).length} finding(s) and Home says nothing about it — a leader shown nothing concludes nothing is there`);
      }
      await shot(page, 'coach-squad-home');
    }
  }

  await browser.close();
  server.close();

  console.log(`\n  ── FINDINGS ──`);
  if (!findings.length) console.log('     none');
  for (const f of findings) console.log(`     [${f.severity}] ${f.surface}: ${f.what}`);
  console.log(`\n  screenshots in ${OUT}\n`);
  fs.writeFileSync(path.join(OUT, 'findings.json'), JSON.stringify(findings, null, 1));
  process.exit(0);
})().catch(e => { console.error('walkthrough threw:', e && e.stack); process.exit(1); });
