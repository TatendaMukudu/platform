/* BROWSER CHECK — the whole pilot surface, at BOTH phone sizes, in a real Chromium.

   NOT part of `npm test`: it needs a browser binary and the truth layer is hermetic. This is the
   other kind of evidence, and this repository has now produced the same lesson four times — a
   route that worked, a suite that passed, and nobody able to reach the thing. `window.MemberApp`
   being undefined, a material picker offering every file type, forty controls reported dead that
   were not, and a Priority Office nobody could see. Every one was invisible to a suite that never
   opened the page.

   TWO WIDTHS, because 390x844 and 430x932 are the two devices the pilot squad actually carries and
   a layout that survives one can still overflow the other.

   Run: node scripts/stack-browser-check.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
process.env.IQ_COMPOSER = '1';

const { chromium } = require('playwright-core');
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const WIDTHS = [{ name: '390x844', width: 390, height: 844 }, { name: '430x932', width: 430, height: 932 }];

const S = require('../server.js');
const teamState = require('../ai/team-state.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, _teamFocuses } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

const DAY = 86400000, NOW = Date.now(), C = 'sbc';
const sig = (ref, origin, at, extra = {}) => ({ ref, originRef: origin, status: 'active', at, ...extra });
const SECRET = 'said privately that things at home are hard';

_loadAllStores({
  orgMeta:  { [C]: { orgName: 'Alma College', orgMode: 'sports' } },
  orgUsers: { [C]: {
    me:   { id: 'me', name: 'A Player', email: 'sbc@x.io', role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['n1'], profileComplete: true },
    mate: { id: 'mate', name: 'A Teammate', email: 'sbc2@x.io', role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['n1'], profileComplete: true },
  } },
  orgNodes: { [C]: { n1: { nodeId: 'n1', name: 'First Team', memberIds: ['me', 'mate'], leaderIds: [] } } },
  inquiryStates: { [C]: {
    'member:me': {
      q1: { inquiryId: 'q1', topic: { label: 'Recovery between games' }, status: 'open',
        signals: [sig('ev1', 'o_me', NOW - 30 * DAY, { statement: SECRET }), sig('ev2', 'o_coach', NOW - DAY)],
        hypotheses: [], confidence: { band: 'emerging', because: [] }, missingSignals: [] },
      q2: { inquiryId: 'q2', topic: { label: 'Travel and academics' }, status: 'open',
        signals: [sig('r1', 'o_me', NOW - 3 * DAY), sig('r2', 'o_me', NOW - 2 * DAY), sig('r3', 'o_me', NOW - DAY)],
        hypotheses: [], confidence: { band: 'emerging', because: [] }, missingSignals: [] },
    },
  } },
});
_rebuildEmailIndex();
_teamFocuses(C, 'n1').push(teamState.newFocus({ focusId: 'tf1', nodeId: 'n1', text: 'Saturday away — the press', by: 'me', now: NOW }));

(async () => {
  const server = await new Promise(res => { const s = app.listen(0, () => res(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = issueToken('me', C, 'member');
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });

  /* index.html loads Chart.js from a CDN and this run has no network, so `Chart is not defined`
     fires at load on every page, on this branch and on its base alike. Excluded BY NAME with the
     reason, so the exclusion cannot quietly grow into a place to hide a real one. */
  const HARNESS_ONLY = [/^Chart is not defined$/];

  for (const W of WIDTHS) {
    console.log(`\n══════ ${W.name} ══════`);
    const ctx = await browser.newContext({ viewport: { width: W.width, height: W.height },
      deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => { if (!HARNESS_ONLY.some(rx => rx.test(e.message))) errs.push(e.message); });

    await page.addInitScript(([t, code]) => {
      localStorage.setItem('iq_auth', JSON.stringify({
        user: { id: 'me', name: 'A Player', role: 'member', orgCode: code, profileComplete: true },
        org: { orgName: 'Alma College', orgMode: 'sports', organizationProfileComplete: true },
        token: t, permissions: {}, domain: null }));
      localStorage.setItem('iq_profile_complete_me', '1');
    }, [token, C]);

    const api = (m, u, b) => page.evaluate(async ([m, u, b, t]) => {
      const r = await fetch(u, { method: m, headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
        body: b ? JSON.stringify(b) : undefined });
      return { status: r.status, j: await r.json().catch(() => null) };
    }, [m, u, b, token]);

    const go = async r => { await page.evaluate(x => navigate(x), r); await page.waitForTimeout(1200); };
    const text = async sel => page.evaluate(s => (document.querySelector(s) || {}).innerText || '', sel);
    /* THE THREE THINGS A LAYOUT GETS WRONG ON A PHONE, measured rather than eyeballed. */
    const layout = async label => {
      const m = await page.evaluate(() => {
        const d = document.documentElement;
        /* CUT OFF, not PARKED. The first version of this flagged `.notif-panel` — a drawer that
           sits at translateX(100%) by design and slides in when opened. An element parked wholly
           outside the viewport is not an overflow bug; an element that STARTS inside it and runs
           off the edge is, because that is content a person can see the beginning of and not the
           end. So both halves are required: it must begin on screen and end off it. */
        const wide = [...document.querySelectorAll('body *')].filter(el => {
          const r = el.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) return false;
          if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ visibilityProperty: true, opacityProperty: true })) return false;
          const cs = getComputedStyle(el);
          if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') return false;
          const startsOnScreen = r.left < window.innerWidth - 1 && r.right > 1;
          return startsOnScreen && (r.right > window.innerWidth + 1 || r.left < -1);
        }).slice(0, 3).map(el => el.className || el.tagName);
        return { scrollW: d.scrollWidth, clientW: d.clientWidth, wide };
      });
      ok(`${label}: no sideways scroll`, m.scrollW <= m.clientW + 1);
      ok(`${label}: nothing sticking out of the viewport`, m.wide.length === 0 || console.log('     overflowing:', m.wide) || false);
    };
    /* A CONTROL THAT DOES NOTHING is the failure this project keeps shipping. An inline handler
       naming something that does not exist at runtime is dead, and it looks identical to a live
       one until somebody taps it. */
    const deadControls = async label => {
      const dead = await page.evaluate(() => {
        const out = [];
        for (const el of document.querySelectorAll('[onclick],[onkeydown]')) {
          const code = (el.getAttribute('onclick') || '') + ';' + (el.getAttribute('onkeydown') || '');
          /* `event` IS DEFINED INSIDE AN INLINE HANDLER and nowhere else. Scanning from outside
             one, `event.preventDefault` looks dead — it is not; the handler body receives it
             implicitly at call time. Flagging it produced three false product failures on every
             screen, which is the same class of mistake this whole file exists to avoid making. */
          for (const m of code.matchAll(/([A-Za-z_$][\w$]*)\s*\.\s*([A-Za-z_$][\w$]*)\s*\(/g)) {
            const [, obj, fn] = m;
            if (obj === 'event' || obj === 'this') continue;
            let host = null;
            try { host = eval(obj); } catch (_) { host = undefined; }
            if (!host || typeof host[fn] !== 'function') out.push(`${obj}.${fn} (${(el.textContent || '').trim().slice(0, 24)})`);
          }
          for (const m of code.matchAll(/(?:^|[;{\s])([A-Za-z_$][\w$]*)\s*\(/g)) {
            const fn = m[1];
            if (['if', 'for', 'while', 'return', 'function', 'catch', 'switch', 'eval', 'void'].includes(fn)) continue;
            let f = null; try { f = eval(fn); } catch (_) { f = undefined; }
            if (typeof f !== 'function') out.push(`${fn}() (${(el.textContent || '').trim().slice(0, 24)})`);
          }
        }
        return [...new Set(out)];
      });
      if (dead.length) console.log('     dead handlers:', dead.slice(0, 6).join(', '));
      ok(`${label}: every inline control names something that exists`, dead.length === 0);
    };

    await page.goto(`${base}/`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(900);
    const notice = await page.$('button:has-text("I understand")');
    if (notice) { await notice.click().catch(() => {}); await page.waitForTimeout(400); }

    /* ── SET UP THE LOOP THE PILOT EXISTS TO TEST ───────────────────────────────────────── */
    const mk = await api('POST', '/api/me/focus', { text: 'Sleep before away games', addressesKind: 'inquiry', addressesId: 'q1' });
    const fid = mk.j && mk.j.focus && mk.j.focus.id;
    await api('POST', '/api/me/focus/outcome', { focusId: fid, outcome: 'helped' });

    console.log('\n  HOME — ONE QUESTION, AND THE PRIORITY SURFACE');
    await go('workspace');
    ok('Home renders its one brief slot', !!(await page.$('#iq-brief')));
    ok('…and the Priority Office put a real element in it', !!(await page.$('#iq-brief .iq-att-primary')));
    const homeTxt = await text('#iq-brief');
    ok('…naming the open question the closed-out work addressed', /Recovery between games/i.test(homeTxt));
    ok('…with the reason in plain words, no code, no score, no rank',
      /still open/i.test(homeTxt) && !/_/.test(homeTxt) && !/\d+%|\bscore\b|\brank\b|\bpriority\b/i.test(homeTxt));
    ok('…at most one card and two quiet lines',
      (await page.$$('#iq-brief .iq-att-primary')).length === 1 && (await page.$$('#iq-brief .iq-att-also')).length <= 2);
    ok('…and no private statement reached the screen', !homeTxt.includes(SECRET));
    ok('…one composer, not two', (await page.$$('#iq-composer-input')).length === 1);
    await layout('Home'); await deadControls('Home');

    console.log('\n  WHY THIS? — A COMPOSED TURN, BOUND TO THE OBJECT');
    await page.click('#iq-brief button:has-text("Why this?")');
    await page.waitForTimeout(2200);
    const convo = await text('#iq-conversation');
    ok('the question appears above the answer', /worth looking at/i.test(convo));
    ok('…an answer comes back, never a blank bubble',
      (await page.$$('#iq-conversation .iq-msg-iq')).length > 0 && convo.trim().length > 60);
    ok('…with no model configured it says so, through the existing degraded notice',
      (await page.$$('#iq-conversation .iq-degraded')).length > 0);
    ok('…and nothing predicts or claims a cause',
      !/\bwill\b (?:get|be) (?:worse|better)|\bbecause of\b|\bcaused\b|\bpredict/i.test(convo));
    ok('…the composer is bound to the canonical inquiry',
      /"kind":"inquiry"/.test(await page.evaluate(() => JSON.stringify(MemberApp._composerAbout || null))));

    console.log('\n  THE OBJECT THREAD — INQUIRY, AND ITS CONTROLS');
    await go('workspace');
    await page.click('#iq-brief .iq-att-primary .iq-inq-topic');
    await page.waitForTimeout(1700);
    const thread = await text('#iq-inquiries-page');
    ok('the surfaced item opens the CANONICAL object', /Recovery between games/i.test(thread));
    ok('…bound by kind and id',
      /"objectId":"q1"/.test(await page.evaluate(() => JSON.stringify(MemberApp._inquiryThread || null))));
    ok('…offering Work on this, Keep, and the priority mark, as verdicts',
      !!(await page.$('#iq-inquiries-page button:has-text("Work on this")'))
      && !!(await page.$('#iq-inquiries-page button:has-text("Keep")'))
      && !!(await page.$('#iq-inquiries-page button:has-text("Keep near the top")')));
    ok('…and exactly one back control, not two ways out of the same screen',
      (await page.$$('#iq-inquiries-page .iqt-back')).length === 1);
    await layout('Inquiry thread'); await deadControls('Inquiry thread');

    console.log('\n  PRIORITY — MARK, THEN UNMARK, THROUGH THE SCREEN');
    await page.click('#iq-inquiries-page button:has-text("Keep near the top")');
    await page.waitForTimeout(1800);
    const beforeConfirm = await api('GET', '/api/me/attention');
    ok('clicking marks NOTHING yet — confirmation is still owed',
      !((beforeConfirm.j.items || []).some(r => r.reason === 'explicitly_prioritised')));
    const cbtn = await page.$('#iq-inquiries-page button:has-text("Confirm")');
    ok('…a confirmation is on screen', !!cbtn);
    if (cbtn) { await cbtn.click(); await page.waitForTimeout(1800); }
    const marked = await api('GET', '/api/me/attention');
    const top = (marked.j.items || [])[0];
    ok('…after confirming, the marked thing is first',
      !!top && top.reason === 'explicitly_prioritised' && top.ref === 'inquiry:q1');
    ok('…and it says the PERSON marked it', /^You marked this/.test(String(top.why || '')));
    await go('workspace');
    const markedHome = await text('#iq-brief');
    ok('…Home shows it, still one card, still no badge or number',
      /You marked this/i.test(markedHome) && !/\d+%|\bpriority\b|\brank\b/i.test(markedHome));
    await page.click('#iq-brief .iq-att-primary .iq-inq-topic');
    await page.waitForTimeout(1700);
    const offBtn = await page.$('#iq-inquiries-page button:has-text("Take off my priorities")');
    ok('…the control now offers the undo, so it never lies about state', !!offBtn);
    if (offBtn) {
      await offBtn.click(); await page.waitForTimeout(1500);
      const c2 = await page.$('#iq-inquiries-page button:has-text("Confirm")');
      if (c2) { await c2.click(); await page.waitForTimeout(1800); }
    }
    const cleared = await api('GET', '/api/me/attention');
    ok('…and unmarking returns the list to what the record alone says',
      !((cleared.j.items || []).some(r => r.reason === 'explicitly_prioritised')));
    const q1t = await api('GET', '/api/objects/inquiry/q1/thread?scope=self');
    ok('…with visibility untouched throughout, and nothing settled',
      q1t.j.prioritised === false && q1t.j.shared === false
      && String((q1t.j.raw || {}).status || 'open') !== 'settled');

    console.log('\n  THE OTHER BUCKETS — HIGH, LOW, FOCUS');
    for (const [route, label] of [['high', 'High'], ['low', 'Low'], ['focus', 'Focus']]) {
      await go(route);
      const shell = await page.$(`#page-${route}`) || await page.$('#iq-inquiries-page');
      ok(`${label} bucket renders without an error state`, !!shell
        && !/could not be loaded|something went wrong/i.test(await text(`#page-${route}`) || ''));
      await layout(label); await deadControls(label);
    }

    console.log('\n  LIBRARY, MATERIAL, FORUM, GRAPH');
    /* THE ROUTE IS `notes`, THE NAV LABEL IS "Library". Historical, and worth stating rather than
       fixing here: renaming a route in an integration pass is a change nobody asked for. The first
       version of this walked `navigate('library')`, which does not exist, rendered nothing, and
       reported the Library as broken — a harness failure that looked exactly like a product one. */
    await go('notes');
    const lib = await text('#page-notes');
    ok('one visible Library, and it is the shelf', !!(await page.$('#page-notes'))
      && !/saved copy|snapshot of this conversation/i.test(lib));
    ok('…with no second Library surface beside it',
      (await page.$$('#page-notes')).length === 1);
    await layout('Library'); await deadControls('Library');

    const accept = await page.evaluate(() => {
      const i = document.querySelector('input[type=file]');
      return i ? (i.getAttribute('accept') || '') : null;
    });
    ok('the material picker names the types it can actually read, rather than offering everything',
      accept === null || (accept.length > 0 && accept.includes('.')));

    const forumProbe = await api('GET', `/api/objects/inquiry/q1/thread?scope=self`);
    ok('Forum availability is stated by the server, not guessed by the page',
      typeof forumProbe.j.forumAvailable === 'boolean');
    const chart = await api('GET', '/api/objects/inquiry/q1/chart');
    ok('the graph answers, and every point names its evidence',
      chart.status === 200 && (chart.j.series || []).every(s => (s.points || []).every(p => Array.isArray(p.refs))));
    ok('…and a point value EQUALS the number of refs it names, never a supplied count',
      (chart.j.series || []).filter(s => s.unit === 'count')
        .every(s => (s.points || []).every(p => p.value === p.refs.length)));

    console.log('\n  A -> B -> NEXT, END TO END');
    const rel = await api('GET', `/api/objects/focus/${fid}/related`);
    ok('the loop knows what the focus addressed and what was recorded',
      rel.j.loop && rel.j.loop.addresses === 'inquiry:q1' && rel.j.loop.outcome === 'helped');
    ok('…and states what came after as OBSERVED, never as caused',
      rel.j.loop.observedSince !== undefined && !/caused|because of|proves/i.test(JSON.stringify(rel.j.loop)));
    const next = await api('GET', '/api/me/attention');
    ok('…and what to look at next is the still-open question',
      (next.j.items || []).some(r => r.ref === 'inquiry:q1'
        && [r.reason, ...(r.alsoBecause || [])].includes('unresolved_after_focus_outcome')));

    console.log('\n  THE COMPOSER ITSELF');
    await go('workspace');
    const comp = await page.evaluate(() => {
      const i = document.getElementById('iq-composer-input');
      if (!i) return null;
      const r = i.getBoundingClientRect();
      return { fs: parseFloat(getComputedStyle(i).fontSize), w: r.width, right: r.right };
    });
    ok('the composer does not trigger the iOS zoom', !!comp && comp.fs >= 16);
    ok('…and fits the viewport with a gutter', !!comp && comp.right <= (await page.evaluate(() => window.innerWidth)) - 4);
    ok(`no page errors of the product's own at ${W.name}`, errs.length === 0 || console.log('     errors:', errs.slice(0, 4)) || false);

    await ctx.close();
  }

  await browser.close();
  server.close();
  console.log(`\nstack-browser-check: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
