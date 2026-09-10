/* BROWSER CHECK — the Priority Office surfaced on Home, in a real Chromium at a real phone size.

   NOT part of `npm test`, for the same reason library-browser-check.js and mobile-inspect.js are
   not: the truth layer is hermetic and must run with no browser binary. This is the other kind of
   evidence, and this pass is exactly the kind that needs it. The whole finding behind this work is
   that a route, a suite and a green build proved nothing about whether a person could reach the
   Priority Office. Everything the hermetic suite asserts about this surface is asserted about
   SOURCE. Source is not a screen. This opens the screen.

   Run: node scripts/priority-surface-browser-check.js
   Needs: playwright-core (devDependency) and the Chromium at EXE below. */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
process.env.IQ_COMPOSER = '1';

const { chromium } = require('playwright-core');
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const IPHONE = { width: 390, height: 844 };   // the founder's device class

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

const DAY = 86400000, NOW = Date.now();
const C = 'psb';
const sig = (ref, origin, at, extra = {}) => ({ ref, originRef: origin, status: 'active', at, ...extra });
const SECRET = 'said privately that things at home are hard';

/* q1 — an open question that has gained a genuinely NEW independent account
   q2 — an open question that gained THREE more records from ONE account already present
   q3 — an open question whose only new record CORRECTS an old one */
_loadAllStores({
  orgMeta:  { [C]: { orgName: 'Alma College', orgMode: 'sports' } },
  orgUsers: { [C]: { me: { id: 'me', name: 'A Player', email: 'psb@x.io', role: 'member', orgCode: C,
    status: 'active', assignedNodeIds: ['n1'], profileComplete: true } } },
  orgNodes: { [C]: { n1: { nodeId: 'n1', name: 'First Team', memberIds: ['me'], leaderIds: [] } } },
  inquiryStates: { [C]: { 'member:me': {
    q1: { inquiryId: 'q1', topic: { label: 'Recovery between games' }, status: 'open',
      signals: [sig('ev1', 'o_me', NOW - 30 * DAY, { statement: SECRET }), sig('ev2', 'o_coach', NOW - DAY)],
      hypotheses: [], confidence: { band: 'emerging', because: [] }, missingSignals: [] },
    q2: { inquiryId: 'q2', topic: { label: 'Travel and academics' }, status: 'open',
      signals: [sig('r1', 'o_me', NOW - 30 * DAY), sig('r2', 'o_me', NOW - 3 * DAY),
        sig('r3', 'o_me', NOW - 2 * DAY), sig('r4', 'o_me', NOW - DAY)],
      hypotheses: [], confidence: { band: 'emerging', because: [] }, missingSignals: [] },
    q3: { inquiryId: 'q3', topic: { label: 'Set-piece marking' }, status: 'open',
      signals: [{ ref: 'c1', originRef: 'o_me', status: 'superseded', supersededBy: 'c2', at: NOW - 30 * DAY },
        sig('c2', 'o_me', NOW - DAY)],
      hypotheses: [], confidence: { band: 'emerging', because: [] }, missingSignals: [] },
  } } },
});
_rebuildEmailIndex();

(async () => {
  const server = await new Promise(res => { const s = app.listen(0, () => res(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = issueToken('me', C, 'member');
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: IPHONE, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  /* PAGE ERRORS, MINUS THE ONE THIS HARNESS CAUSES ITSELF. index.html loads Chart.js from a CDN
     and this run has no network, so `Chart is not defined` fires at page load on every page in
     the product, on this branch and on its base alike. Counting it would make this check report a
     harness limitation as a product failure — the exact class of false finding that has cost this
     project more time than any real bug. It is excluded BY NAME, with the reason, so the
     exclusion cannot quietly grow into a place to hide a real one. */
  const HARNESS_ONLY = [/^Chart is not defined$/];
  const pageErrors = [];
  page.on('pageerror', e => {
    console.error('  [page error]', e.message);
    if (!HARNESS_ONLY.some(rx => rx.test(e.message))) pageErrors.push(e.message);
  });

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

  const home = async () => {
    await page.evaluate(() => navigate('workspace'));
    await page.waitForTimeout(1400);
  };

  try {
    await page.goto(`${base}/`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(900);
    const notice = await page.$('button:has-text("I understand")');
    if (notice) { await notice.click().catch(() => {}); await page.waitForTimeout(400); }

    /* ── SET UP THE STATE JOURNEY A AND B ACTUALLY DESCRIBE ─────────────────────────────────
       A focus started on q1, then closed out with an outcome, leaving q1 still open. That is
       the half-shut loop, and it is the reason Home has anything to say without a read receipt. */
    const mk = await api('POST', '/api/me/focus', { text: 'Sleep before away games', addressesKind: 'inquiry', addressesId: 'q1' });
    const fid = mk.j && mk.j.focus && mk.j.focus.id;
    ok('N0 a focus exists on the open question, so there is a real loop to close', !!fid);

    console.log('\n  JOURNEY A — OPEN HOME, SOMETHING IS SURFACED, ASK WHY');
    await api('POST', '/api/me/focus/outcome', { focusId: fid, outcome: 'helped' });
    await home();

    const brief = await page.$('#iq-brief');
    ok('N1 Home renders its one brief slot', !!brief);
    const primary = await page.$('#iq-brief .iq-att-primary');
    ok('N2 …and the Priority Office put something in it — a real element, not a route that answered',
      !!primary);
    const topic = (await page.$eval('#iq-brief .iq-att-primary .iq-inq-topic', el => el.textContent.trim()).catch(() => ''));
    ok('N3 …naming the actual open question from the record', /Recovery between games/i.test(topic));
    const why = (await page.$eval('#iq-brief .iq-att-primary .iq-inq-why', el => el.textContent.trim()).catch(() => ''));
    ok('N4 …with the reason in plain words, not a code', /still open/i.test(why) && !/_/.test(why));
    ok('N5 …and the reason is not dressed as IntelliQ talking — no assistant bubble in the brief',
      (await page.$$('#iq-brief .iq-msg-iq')).length === 0);

    /* THE SCREEN ITSELF. Everything visible on Home, read out of the DOM rather than reasoned
       about — jargon, scores and ranks are things you find by looking. */
    const seen = await page.$eval('#iq-brief', el => el.innerText);
    ok('N6 nothing on the surface shows a reason code, a score, a rank or a percentage',
      !/_/.test(seen) && !/\b\d+%|\bscore\b|\brank\b|\bpriority\b/i.test(seen));
    ok('N7 …and at most three things are surfaced: one question and two quiet lines',
      (await page.$$('#iq-brief .iq-att-primary')).length === 1
      && (await page.$$('#iq-brief .iq-att-also')).length <= 2);

    const whyBtn = await page.$('#iq-brief button:has-text("Why this?")');
    ok('N8 there is a way to ask why THIS', !!whyBtn);
    await whyBtn.click();
    await page.waitForTimeout(2200);
    const convo = await page.$eval('#iq-conversation', el => el.innerText).catch(() => '');
    ok('N9 …asking it puts the question in the conversation, above the answer',
      /worth looking at/i.test(convo));
    ok('N10 …and an answer comes back through the ordinary turn — never a blank bubble',
      (await page.$$('#iq-conversation .iq-msg-iq')).length > 0 && convo.trim().length > 60);
    /* THE DEGRADED CONTRACT, EXERCISED FOR REAL. This run has no model configured, so the reply
       came from the deterministic path — and the product must SAY so rather than let a template
       pass as IntelliQ having thought about it. That is the established contract (iqDegradedNote),
       and "Why this?" goes through the ordinary turn precisely so it inherits it rather than
       needing a second one. */
    const degraded = await page.$$('#iq-conversation .iq-degraded');
    ok('N9b …and with no model configured, the answer says so through the existing degraded notice',
      degraded.length > 0);
    const bound = await page.evaluate(() => JSON.stringify(MemberApp._composerAbout || null));
    ok('N11 …with the composer bound to the canonical object, so "this" means the inquiry',
      /"kind":"inquiry"/.test(bound) && /"id":"q1"/.test(bound));
    ok('N12 …and no private statement from the record was put on the screen',
      !convo.includes(SECRET) && !seen.includes(SECRET));

    console.log('\n  JOURNEY A (cont.) — INSPECT THE INQUIRY, THEN WORK ON IT');
    await home();
    await page.click('#iq-brief .iq-att-primary .iq-inq-topic');
    await page.waitForTimeout(1600);
    const threadTxt = await page.evaluate(() => (document.getElementById('iq-inquiries-page') || {}).innerText || '');
    ok('N13 tapping the surfaced item opens the CANONICAL object, not a copy of it',
      /Recovery between games/i.test(threadTxt));
    const boundThread = await page.evaluate(() => JSON.stringify(MemberApp._inquiryThread || null));
    ok('N14 …and the thread is bound to that object by kind and id',
      /"kind":"inquiry"/.test(boundThread) && /"objectId":"q1"/.test(boundThread));

    console.log('\n  JOURNEY B — THE LOOP LEFT HALF SHUT COMES BACK');
    await home();
    const again = await page.$eval('#iq-brief', el => el.innerText);
    ok('N15 returning Home, the question the closed-out work addressed is what is surfaced',
      /Recovery between games/i.test(again) && /still open/i.test(again));
    const loop = await api('GET', `/api/objects/focus/${fid}/related`);
    ok('N16 …and "did this help?" is answerable off the record: the outcome is on the loop',
      loop.status === 200 && loop.j && loop.j.loop && loop.j.loop.outcome === 'helped');
    ok('N17 …and what came after is stated as OBSERVED, never as caused by the work',
      loop.j.loop.observedSince !== undefined && !/caused|because of/i.test(JSON.stringify(loop.j.loop)));

    console.log('\n  JOURNEY C — INDEPENDENCE, NOT VOLUME');
    const since = await api('GET', `/api/me/attention?since=${NOW - 7 * DAY}`);
    const rows = (since.j && since.j.items) || [];
    const row = r => rows.find(x => x.ref === r);
    const reasons = r => { const x = row(r); return x ? [x.reason, ...(x.alsoBecause || [])] : []; };
    ok('N18 a genuinely new independent account brings its question up',
      reasons('inquiry:q1').includes('new_independent_evidence'));
    ok('N19 …and says it in words a person can check against the record',
      /2 separate accounts/.test(row('inquiry:q1').why));
    ok('N20 three MORE records from ONE account already present raise nothing',
      !reasons('inquiry:q2').includes('new_independent_evidence'));

    console.log('\n  JOURNEY D — A CORRECTION IS NOT NEWS');
    ok('N21 an inquiry whose only new record corrects an old one is not surfaced as fresh support',
      !reasons('inquiry:q3').includes('new_independent_evidence'));

    console.log('\n  THE SCREEN AT 390x844');
    await home();
    const m = await page.evaluate(() => {
      const doc = document.documentElement;
      const brief = document.getElementById('iq-brief');
      const btn = document.querySelector('#iq-brief button');
      const input = document.getElementById('iq-composer-input');
      const r = brief ? brief.getBoundingClientRect() : null;
      const b = btn ? btn.getBoundingClientRect() : null;
      return { scrollW: doc.scrollWidth, clientW: doc.clientWidth,
        briefRight: r ? r.right : 0, briefLeft: r ? r.left : 0,
        btnH: b ? b.height : 0, btnW: b ? b.width : 0,
        inputFs: input ? parseFloat(getComputedStyle(input).fontSize) : 0 };
    });
    ok('N22 the page does not scroll sideways', m.scrollW <= m.clientW + 1);
    ok('N23 …the surfaced item stays inside the viewport, with a gutter on both sides',
      m.briefLeft >= 8 && m.briefRight <= 390 - 8);
    ok('N24 …the "Why this?" control is a real tap target', m.btnH >= 28 && m.btnW >= 44);
    ok('N25 …and the composer still does not trigger the iOS zoom', m.inputFs >= 16);
    ok('N26 the walk threw no page errors of the product\'s own', pageErrors.length === 0);

    /* ── THE PERSONAL ATTENTION OVERRIDE, DRIVEN AS A PERSON ────────────────────────────────
       Founder decision, September 2026. The whole point of this block is that the mark is made
       through a SCREEN, by clicking, and then shows up on Home — the two halves that a route test
       cannot put together. */
    console.log('\n  PRIORITY — MARKED BY A HUMAN, ON A SCREEN');
    await home();
    await page.click('#iq-brief .iq-att-primary .iq-inq-topic');
    await page.waitForTimeout(1600);
    const markBtn = await page.$('#iq-inquiries-page button:has-text("Keep near the top")');
    ok('N28 the object thread offers the mark, beside the other verdicts', !!markBtn);
    await markBtn.click();
    await page.waitForTimeout(1800);

    /* A BUTTON DOES NOT OWN A MUTATION. It stages the same typed request the model may propose,
       and confirmation still crosses the one dispatcher — so at this point nothing is marked yet
       and there is a card asking. */
    const marksNow = await api('GET', '/api/me/attention');
    ok('N29 …and clicking it has NOT marked anything yet — confirmation is still owed',
      !((marksNow.j.items || []).some(r => r.reason === 'explicitly_prioritised')));
    const confirmBtn = await page.$('#iq-inquiries-page button:has-text("Confirm")');
    ok('N30 …a confirmation is on screen, in the person\'s own words', !!confirmBtn);
    if (confirmBtn) { await confirmBtn.click(); await page.waitForTimeout(1800); }

    const marked = await api('GET', '/api/me/attention');
    const first = (marked.j.items || [])[0];
    ok('N31 after confirming, the marked thing is what the Priority Office puts first',
      !!first && first.reason === 'explicitly_prioritised' && first.ref === 'inquiry:q1');
    ok('N32 …because the PERSON said so, and the row says that rather than implying the club did',
      /^You marked this/.test(String(first.why || '')) && first.detail && first.detail.byYou === true);

    await home();
    const homeMarked = await page.$eval('#iq-brief', el => el.innerText);
    ok('N33 …and Home shows it, still as one card and still with no badge or number',
      /Recovery between games/i.test(homeMarked) && /You marked this/i.test(homeMarked)
      && !/\d+%|\bpriority\b|\brank\b/i.test(homeMarked));
    ok('N34 …still at most three things on the first screen',
      (await page.$$('#iq-brief .iq-att-primary')).length === 1
      && (await page.$$('#iq-brief .iq-att-also')).length <= 2);

    console.log('\n  PRIORITY — AND IT COMES BACK OFF');
    await page.click('#iq-brief .iq-att-primary .iq-inq-topic');
    await page.waitForTimeout(1600);
    const offBtn = await page.$('#iq-inquiries-page button:has-text("Take off my priorities")');
    ok('N35 the control now offers the undo, so it never lies about current state', !!offBtn);
    if (offBtn) {
      await offBtn.click(); await page.waitForTimeout(1600);
      const c2 = await page.$('#iq-inquiries-page button:has-text("Confirm")');
      if (c2) { await c2.click(); await page.waitForTimeout(1800); }
    }
    const unmarked = await api('GET', '/api/me/attention');
    ok('N36 …and unmarking returns the list to what the record alone says',
      !((unmarked.j.items || []).some(r => r.reason === 'explicitly_prioritised')));
    const q1thread = await api('GET', '/api/objects/inquiry/q1/thread?scope=self');
    ok('N37 …with the object itself untouched throughout: no visibility changed, nothing settled',
      q1thread.j.prioritised === false && q1thread.j.shared === false
      && String((q1thread.j.raw || {}).status || 'open') !== 'settled');

    console.log('\n  NOTHING WAS DONE TO ANYTHING');
    const untouched = await api('GET', '/api/objects/inquiry/q1/thread?scope=self');
    ok('N27 the surfaced inquiry is still open — surfacing settled nothing',
      untouched.status === 200 && String((untouched.j.raw || {}).status || 'open') !== 'settled');
  } catch (e) {
    fail++; console.error('  FAIL browser walk threw:', e && e.stack);
  }

  await browser.close();
  server.close();
  console.log(`\npriority-surface-browser-check: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
