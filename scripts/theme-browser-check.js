/* BROWSER CHECK — LIGHT IS THE PILOT DEFAULT, NAVY IS THE ALTERNATIVE, AND BOTH ARE READABLE.

   PRIORITY_RND P2 ratified light mode as the default pilot experience with the original navy as
   the dark alternative, and said the information architecture, spacing, accents and object
   semantics stay the same between them.

   THE THREE THINGS A THEME CAN GET WRONG, and all three are invisible to a hermetic test because
   they are properties of a rendered page:

     it is not actually the default — the app boots into the other one, or flashes;
     something is unreadable — a colour that worked on navy at 1.6:1 on white is not a colour,
       it is a decoration where content was meant to be;
     the two themes are different PRODUCTS — a control present in one and missing in the other.

   So this measures contrast on the real rendered page rather than trusting the palette comment,
   and compares the two themes structurally rather than by eye.

   Run: node scripts/theme-browser-check.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
process.env.IQ_DETERMINISTIC_ONLY = '1';

const { chromium } = require('playwright-core');
const { chromiumPath } = require('./lib/chromium-path.js');
const EXE = chromiumPath(chromium);
const IPHONE = { width: 390, height: 844 };

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

const C = 'thm', NOW = Date.now(), DAY = 86400000;
const SQUAD = ['p1', 'p2', 'p3', 'p4', 'p5'];
const SIG = (w, n) => ({ kind: 'observation', status: 'active', source: w, originRef: `o_${w}_${n}`,
  at: NOW - 9 * DAY, turnId: `t_${w}_${n}`, directness: 'direct', authority: 'corroborated',
  specificity: 0.7, ref: `ev_${w}_${n}`, contributedBy: w, text: 'we fade late' });

_loadAllStores({
  orgMeta: { [C]: { orgName: 'Alma College', orgMode: 'sports', organizationProfileComplete: true } },
  orgUsers: { [C]: Object.fromEntries([
    ...SQUAD.map((id, i) => [id, { id, name: `Player ${i + 1}`, email: `${id}@t.io`, role: 'member',
      orgCode: C, status: 'active', assignedNodeIds: ['n'], profileComplete: true }]),
    ['coach', { id: 'coach', name: 'Dana Coach', email: 'c@t.io', role: 'coach', orgCode: C,
      status: 'active', leadershipNodeIds: ['n'], assignedNodeIds: ['n'], profileComplete: true }],
  ]) },
  orgNodes: { [C]: { n: { nodeId: 'n', name: 'First Team', parentId: null, childNodeIds: [],
    memberIds: [...SQUAD, 'coach'], leaderIds: ['coach'] } } },
  inquiryStates: { [C]: { 'group:n': { q1: {
    inquiryId: 'q1', subjectRef: 'group:n',
    topic: { canonicalConcept: 'f.late', label: 'How the last twenty go' }, status: 'exploring',
    hypotheses: [{ id: 'h1', statement: 'the legs go in the last twenty',
      supportRefs: SQUAD.map((w, i) => `ev_${w}_${i}`), challengeRefs: [],
      confidence: { score: 0.7, band: 'probable' }, status: 'open', createdAt: NOW }],
    leadingHypothesisId: 'h1', signals: SQUAD.map((w, i) => SIG(w, i)),
    confidence: { score: 0.7, band: 'probable', because: ['5 independent origins'] },
    missingSignals: [{ question: 'does it happen away from home too?' }],
    falsifiers: [{ statement: 'we keep the ball when we start deeper' }],
    timeline: [], lastUpdatedAt: NOW,
  } } } },
});
_rebuildEmailIndex();

/* WCAG relative luminance and contrast, computed in the page against the colours the browser
   actually resolved — not against the hex in the stylesheet. A token can be perfect and still be
   overridden by a rule nobody remembered, and it is the rendered pair that a person reads. */
const CONTRAST_FN = `
  function _lum(rgb) {
    var m = String(rgb).match(/\\d+(\\.\\d+)?/g) || [0, 0, 0];
    var v = [m[0], m[1], m[2]].map(function (x) {
      x = Number(x) / 255;
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  }
  function _contrast(fg, bg) {
    var a = _lum(fg), b = _lum(bg);
    var hi = Math.max(a, b), lo = Math.min(a, b);
    return (hi + 0.05) / (lo + 0.05);
  }
  /* The background a person actually sees behind this text.

     ALPHA IS COMPOSITED, NOT IGNORED, and getting that wrong is how this check first reported a
     defect that was not there. A chip painted rgba(124,90,245,0.15) is fifteen percent purple
     over the page, not solid purple — reading the three numbers and dropping the alpha scored it
     as nearly black and called a perfectly readable chip 1.25:1. So every translucent layer from
     the text outwards is blended onto the first opaque one, back to front, which is what the
     compositor does and therefore what the eye receives. */
  function _rgba(c) {
    var m = String(c).match(/[0-9.]+/g) || [0, 0, 0];
    return { r: +m[0] || 0, g: +m[1] || 0, b: +m[2] || 0, a: m.length > 3 ? +m[3] : 1 };
  }
  function _over(f, b) {
    return { r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a),
      b: f.b * f.a + b.b * (1 - f.a), a: 1 };
  }
  function _str(c) { return 'rgb(' + c.r + ',' + c.g + ',' + c.b + ')'; }
  function _bgBehind(el) {
    var layers = [];
    for (var e = el; e && e !== document.documentElement; e = e.parentElement) {
      var c = _rgba(getComputedStyle(e).backgroundColor);
      if (c.a === 0) continue;
      layers.push(c);
      if (c.a === 1) break;
    }
    var base = _rgba(getComputedStyle(document.body).backgroundColor);
    if (!layers.length || layers[layers.length - 1].a !== 1) {
      layers.push(base.a === 1 ? base : { r: 255, g: 255, b: 255, a: 1 });
    }
    var out = layers[layers.length - 1];
    for (var i = layers.length - 2; i >= 0; i--) out = _over(layers[i], out);
    return _str(out);
  }
  /* AND THE TEXT COLOUR TOO: a colour can be translucent, and the same mistake there would score
     faint text as though it were solid. */
  function _fgOver(color, bg) {
    var f = _rgba(color);
    return f.a === 1 ? color : _str(_over(f, _rgba(bg)));
  }
`;

(async () => {
  const server = await new Promise(res => { const s = app.listen(0, () => res(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const errors = [];

  /* `pre` runs before anything paints, which is the only place a "did it boot into the right
     theme" question can honestly be asked. */
  const open = async (pre) => {
    const ctx = await browser.newContext({ viewport: IPHONE, deviceScaleFactor: 2,
      isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    page.on('pageerror', e => { if (!/^Chart is not defined$/.test(e.message)) errors.push(e.message); });
    await page.addInitScript(([t, code]) => {
      localStorage.setItem('iq_auth', JSON.stringify({
        user: { id: 'coach', name: 'Dana Coach', role: 'coach', orgCode: code, profileComplete: true },
        org: { orgName: 'Alma College', orgMode: 'sports', organizationProfileComplete: true },
        token: t, permissions: null, domain: null }));
      localStorage.setItem('iq_profile_complete_coach', '1');
    }, [issueToken('coach', C, 'coach'), C]);
    if (pre) await page.addInitScript(pre);
    await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1700);
    const notice = await page.$('button:has-text("I understand")');
    if (notice) { await notice.click().catch(() => {}); await page.waitForTimeout(500); }
    return { ctx, page };
  };

  /* Every element carrying real words, measured where it sits. Headings, labels, body copy,
     provenance lines — not icons, not empty nodes. */
  const audit = (page) => page.evaluate(`(() => {
    ${CONTRAST_FN}
    var out = [];
    var els = document.querySelectorAll('h1,h2,h3,p,span,div,button,a,label,li,td,th');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var own = '';
      for (var j = 0; j < el.childNodes.length; j++) {
        if (el.childNodes[j].nodeType === 3) own += el.childNodes[j].textContent;
      }
      own = own.trim();
      if (own.length < 3) continue;
      var r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      var cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.opacity === '0') continue;
      var bg = _bgBehind(el);
      out.push({ text: own.slice(0, 40), ratio: _contrast(_fgOver(cs.color, bg), bg),
        size: parseFloat(cs.fontSize), weight: Number(cs.fontWeight) || 400 });
    }
    return out;
  })()`);

  /* WCAG AA: 4.5:1 for body text, 3:1 for large text (>=24px, or >=18.66px bold). */
  const worst = (rows) => rows
    .map(r => ({ ...r, need: (r.size >= 24 || (r.size >= 18.66 && r.weight >= 700)) ? 3 : 4.5 }))
    .filter(r => r.ratio < r.need)
    .sort((a, b) => a.ratio - b.ratio);

  try {
    console.log('\n  A — IT BOOTS INTO LIGHT, WITHOUT BEING ASKED AND WITHOUT A FLASH');
    const L = await open(null);
    ok('THM-A1 a person who has chosen nothing gets the light theme',
      (await L.page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'light');
    /* THE MARKUP CARRIES IT, which is what makes "no flash" true rather than hoped for: the
       attribute is in the HTML the server sent, so there is no first paint in the other theme. */
    const html = await (await fetch(base + '/')).text();
    ok('THM-A2 …and it is in the served markup, so the first paint is already light',
      /<html[^>]*data-theme="light"/.test(html));
    ok('THM-A3 …and the page really is light, not merely labelled light',
      await L.page.evaluate(`(() => { ${CONTRAST_FN}
        return _lum(getComputedStyle(document.body).backgroundColor) > 0.7; })()`));
    /* NATIVE FURNITURE FOLLOWS. Without color-scheme the browser draws scrollbars, selects and
       date pickers from its own default and they sit against the theme rather than in it. */
    ok('THM-A4 …and the browser\'s own controls are told which theme they are in',
      (await L.page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)) === 'light');

    console.log('\n  B — AND EVERYTHING WITH WORDS IN IT IS READABLE, ON EVERY SURFACE');
    /* SIX SCREENS, NOT ONE. Home alone is about twenty elements, and a palette can be perfect
       there and unreadable on the object page — which is where the provenance lines, the muted
       captions and the small print actually live, and where a light theme is most likely to
       fail. Auditing one screen would be measuring the easiest case and reporting it as the
       product. */
    const WALK = [
      ['Home', null],
      ['Inquiries', () => navigate('inquiry')],
      ['the group', () => MemberApp.openGroupNode('n')],
      ['an inquiry', () => MemberApp.openObjectThread('inquiry', 'q1', 'group:n')],
      ['its Forum', () => MemberApp.openForum('n', 'q1', 'group', 'inquiry')],
      ['Library', () => navigate('notes')],
      ['Org tree', () => navigate('people')],
    ];
    const sweep = async (page, label) => {
      let total = 0; const bad = []; const tiny = [];
      for (const [name, go] of WALK) {
        if (go) { await page.evaluate(go); await page.waitForTimeout(1100); }
        const rows = await audit(page);
        total += rows.length;
        for (const r of worst(rows)) bad.push({ ...r, screen: name });
        for (const r of rows.filter(x => x.size < 10)) tiny.push({ ...r, screen: name });
      }
      if (bad.length) {
        console.error(`        ${label}: ${bad.length} unreadable`);
        bad.slice(0, 8).forEach(r =>
          console.error(`        ${r.ratio.toFixed(2)}:1 (needs ${r.need}) ${r.size}px on ${r.screen} — "${r.text}"`));
      }
      return { total, bad, tiny };
    };
    const lightSweep = await sweep(L.page, 'light');
    /* LEGIBILITY IS NOT CONTRAST. A ratio of 12:1 at 9px is still text a person holds the phone
       closer to read, and "mobile-first clarity" is an explicit pilot concern. Measured and
       reported here rather than silently rescaled: the type scale bottoms out at 0.58rem against
       a 14px root, so anything that fails this is a decision about the SCALE, not about one rule,
       and rescaling the product is not something a theme change should smuggle in. */
    const tiny = (rows) => rows.filter(r => r.size < 10);
    ok(`THM-B1 the light theme has real content across the walk to measure (${lightSweep.total} elements over ${WALK.length} screens)`,
      lightSweep.total > 120);
    ok('THM-B2 …and every one of them meets AA for its size',
      lightSweep.bad.length === 0);
    ok(`THM-B3 …and nothing carrying words renders below 10px (${lightSweep.tiny.length} found)`,
      lightSweep.tiny.length === 0);
    if (lightSweep.tiny.length) lightSweep.tiny.slice(0, 6).forEach(r =>
      console.error(`        ${r.size}px on ${r.screen} — "${r.text}"`));

    console.log('\n  C — NAVY IS STILL THERE, AND STILL READABLE');
    const D = await open(() => { try { localStorage.setItem('iq_theme', 'dark'); } catch (e) {} });
    ok('THM-C1 a device that chose navy boots into navy',
      (await D.page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'dark');
    ok('THM-C2 …and it really is dark',
      await D.page.evaluate(`(() => { ${CONTRAST_FN}
        return _lum(getComputedStyle(document.body).backgroundColor) < 0.1; })()`));
    ok('THM-C3 …with its own native controls',
      (await D.page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)) === 'dark');
    const darkSweep = await sweep(D.page, 'navy');
    ok(`THM-C4 …and every element across the same walk meets AA there too (${darkSweep.total} elements)`,
      darkSweep.total > 120 && darkSweep.bad.length === 0);

    console.log('\n  D — THE SAME PRODUCT, NOT TWO PRODUCTS');
    /* "The information architecture, spacing, accents and object semantics stay the same between
       themes" — so the two pages must carry the SAME words and the SAME controls. A theme that
       hides a control is a different product wearing the same name. */
    /* AND NOTHING SPILLS SIDEWAYS. Raising the type scale is exactly the change that pushes a
       phone layout past its own width, and a horizontal scrollbar on a 390px screen is the most
       obvious "this was not built for my phone" signal there is. */
    for (const [label, pg] of [['light', L.page], ['navy', D.page]]) {
      const over = await pg.evaluate(async (screens) => {
        const out = [];
        for (const s of screens) {
          // eslint-disable-next-line no-eval
          try { eval(s.go); } catch (e) {}
          await new Promise(r => setTimeout(r, 900));
          if (document.documentElement.scrollWidth > window.innerWidth + 1) {
            out.push(s.name + ' (' + document.documentElement.scrollWidth + 'px)');
          }
        }
        return out;
      }, [{ name: 'Home', go: "navigate('home')" },
          { name: 'the group', go: "MemberApp.openGroupNode('n')" },
          { name: 'an inquiry', go: "MemberApp.openObjectThread('inquiry','q1','group:n')" },
          { name: 'Org tree', go: "navigate('people')" },
          { name: 'Settings', go: "navigate('settings')" }]);
      ok(`THM-D0 the ${label} theme fits a 390px screen with no sideways scroll`, over.length === 0);
      if (over.length) console.error('        overflowing: ' + over.join(', '));
    }

    const shape = (page) => page.evaluate(() => ({
      text: (document.body.innerText || '').replace(/\s+/g, ' ').trim(),
      buttons: [...document.querySelectorAll('button')]
        .filter(b => b.offsetParent !== null).length,
    }));
    for (const pg of [L.page, D.page]) { await pg.evaluate(() => navigate('home')); }
    await L.page.waitForTimeout(1200);
    const ls = await shape(L.page), ds = await shape(D.page);
    ok('THM-D1 both themes render the same words', ls.text === ds.text && ls.text.length > 80);
    ok('THM-D2 …and the same number of usable controls', ls.buttons === ds.buttons && ls.buttons > 0);

    console.log('\n  E — AND A PERSON CAN CHOOSE, ON A PHONE');
    await L.page.evaluate(() => navigate('settings'));
    await L.page.waitForTimeout(900);
    const opts = L.page.locator('[data-theme-set]');
    ok('THM-E1 Settings offers both, as real tap targets', await opts.count() === 2
      && (await opts.first().boundingBox()).height >= 44);
    /* "SAYS WHICH ONE IS ON" HAS TO BE VISIBLE. Asserting the class alone passes on a page where
       the class is styled as nothing at all — the JS sets it either way, so a mutation that
       removed every visual difference survived. What a person can see is that the two controls do
       not look the same. */
    const look = (sel) => L.page.evaluate((s) => {
      const el = document.querySelector(s); const cs = getComputedStyle(el);
      return cs.borderColor + '|' + cs.color + '|' + cs.backgroundColor;
    }, sel);
    ok('THM-E2 …and the one that is on is marked, and looks different from the one that is not',
      await L.page.locator('[data-theme-set="light"].is-on').count() === 1
      && (await look('[data-theme-set="light"]')) !== (await look('[data-theme-set="dark"]')));
    await L.page.locator('[data-theme-set="dark"]').click();
    await L.page.waitForTimeout(400);
    ok('THM-E3 choosing navy changes the page immediately',
      (await L.page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'dark'
      && await L.page.evaluate(`(() => { ${CONTRAST_FN}
        return _lum(getComputedStyle(document.body).backgroundColor) < 0.1; })()`));
    ok('THM-E4 …and the control now says navy is the one that is on',
      await L.page.locator('[data-theme-set="dark"].is-on').count() === 1
      && await L.page.locator('[data-theme-set="light"].is-on').count() === 0);
    /* AND IT SURVIVES A RELOAD, which is the whole point of remembering it. */
    await L.page.reload({ waitUntil: 'domcontentloaded' });
    await L.page.waitForTimeout(1200);
    ok('THM-E5 …and it is still navy after a reload, chosen once rather than every time',
      (await L.page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'dark');

    ok('THM-F1 none of that raised an uncaught client error', errors.length === 0);
    if (errors.length) errors.slice(0, 4).forEach(e => console.error('        ' + e));

    await L.ctx.close(); await D.ctx.close();
  } catch (e) { fail++; console.error('  FAIL theme browser check threw:', e && e.stack); }

  await browser.close();
  server.close();
  console.log(`\ntheme-browser-check: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
