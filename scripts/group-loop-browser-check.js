/* BROWSER CHECK — THE GROUP'S HALF OF THE A → B LOOP, WALKED BY A PERSON.

   NOT part of `npm test`: the truth layer is hermetic and must run with no browser binary. This
   is the other kind of evidence, and this surface is exactly why that distinction exists. Every
   route below has been correct, governed and tested server-side for weeks. `group-loop-smoke.js`
   asserts all of it over HTTP. None of that said anything about whether a coach could REACH it,
   and the answer was no: three routes with no client caller at all, which `reachability-smoke`
   records by name and which is why the human evidence web was reported PARTIAL twice running.

   So this opens the real app at a real phone size, as a real coach, and walks:

     the team card on Home  →  the group  →  what the group is working out
                            →  set a focus out of one of those inquiries
                            →  record what came of it
                            →  see it kept, with its outcome, and set another

   A route with no door is a capability nobody has. A door is only a door if somebody walks
   through it, so nothing below asserts against source — every assertion reads the DOM a person
   would be looking at, or the state the server actually holds afterwards.

   Run: node scripts/group-loop-browser-check.js
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
const C = 'glb';
const SIG = (source, originRef, at) => ({ kind: 'observation', status: 'active', source, originRef,
  at, turnId: `t_${source}`, directness: 'direct', authority: 'corroborated', specificity: 0.7,
  ref: `ev_${originRef}` });

_loadAllStores({
  orgMeta:  { [C]: { orgName: 'Alma College', orgMode: 'sports', organizationProfileComplete: true } },
  orgUsers: { [C]: {
    coach:  { id: 'coach',  name: 'Head Coach', email: 'c@x.io', role: 'coach',  orgCode: C, status: 'active',
      leadershipNodeIds: ['first'], assignedNodeIds: ['first'], profileComplete: true },
    p1:     { id: 'p1', name: 'Player One', email: 'p1@x.io', role: 'member', orgCode: C, status: 'active',
      assignedNodeIds: ['first'], profileComplete: true },
    p2:     { id: 'p2', name: 'Player Two', email: 'p2@x.io', role: 'member', orgCode: C, status: 'active',
      assignedNodeIds: ['first'], profileComplete: true },
  } },
  orgNodes: { [C]: { first: { nodeId: 'first', name: 'First Team', parentId: null, childNodeIds: [],
    memberIds: ['p1', 'p2', 'coach'], leaderIds: ['coach'] } } },
  /* TWO INDEPENDENT ORIGINS, deliberately. One telling is refused by the kernel, and a fixture the
     kernel refuses would make every assertion below pass against an empty screen for the wrong
     reason — the empty-fixture lie this project keeps finding in its own tests. */
  inquiryStates: { [C]: { 'group:first': {
    inq_press: {
      inquiryId: 'inq_press', subjectRef: 'group:first',
      topic: { canonicalConcept: 'football.press_shape', label: 'Press shape' },
      status: 'exploring',
      hypotheses: [{ id: 'h1', statement: 'The press keeps forcing us backwards',
        confidence: { score: 0.6, band: 'probable' }, status: 'open' }],
      leadingHypothesisId: 'h1',
      signals: [SIG('p1', 'o_p1', NOW - 3 * DAY), SIG('p2', 'o_p2', NOW - 2 * DAY)],
      confidence: { score: 0.6, band: 'probable', because: ['2 independent origins'] },
      missingSignals: [{ question: 'What changes when we start deeper?' }],
      falsifiers: [{ statement: 'We keep the ball when we start deeper' }],
      timeline: [], lastUpdatedAt: NOW,
    },
  } } },
  /* A REAL CANDIDATE FOR p1, so the member's own way in is asserted against a rendered control
     rather than against an empty box. `status: 'detected'` and `contributorId` are what the route
     filters on -- getting either wrong would produce zero cards, and "zero cards" satisfies a
     naive check for free, which is the empty-fixture lie this project keeps finding in its tests. */
  groupCandidates: { [C]: [{
    candidateId: 'cand_press', nodeId: 'first', contributorId: 'p1', ownerId: 'p1',
    concept: 'football.press_shape', label: 'How we press from the front',
    reason: 'you said something that might concern this group',
    status: 'detected', scope: 'group', evidenceRef: 'ev_o_p1',
    createdAt: NOW - DAY, expiresAt: NOW + 30 * DAY,
  }] },
});
_rebuildEmailIndex();

(async () => {
  const server = await new Promise(res => { const s = app.listen(0, () => res(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = issueToken('coach', C, 'coach');
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: IPHONE, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  // Excluded BY NAME with its reason: index.html loads Chart.js from a CDN and this run has no
  // network, so it fires on every page in the product, on this branch and on its base alike.
  const HARNESS_ONLY = [/^Chart is not defined$/];
  const pageErrors = [];
  page.on('pageerror', e => { if (!HARNESS_ONLY.some(rx => rx.test(e.message))) pageErrors.push(e.message); });

  await page.addInitScript(([t, code]) => {
    localStorage.setItem('iq_auth', JSON.stringify({
      user: { id: 'coach', name: 'Head Coach', role: 'coach', orgCode: code, profileComplete: true },
      org: { orgName: 'Alma College', orgMode: 'sports', organizationProfileComplete: true },
      token: t, permissions: {}, domain: null }));
    localStorage.setItem('iq_profile_complete_coach', '1');
  }, [token, C]);

  const text = sel => page.evaluate(s => ((document.querySelector(s) || {}).innerText || '').trim(), sel);
  const api = (m, u) => page.evaluate(async ([m, u, t]) => {
    const r = await fetch(u, { method: m, headers: { Authorization: 'Bearer ' + t } });
    return { status: r.status, j: await r.json().catch(() => null) };
  }, [m, u, token]);

  try {
    await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const notice = await page.$('button:has-text("I understand")');
    if (notice) { await notice.click().catch(() => {}); await page.waitForTimeout(400); }

    console.log('\n  A — THE TEAM CARD ON HOME IS A DOOR, NOT A POSTER');
    await page.evaluate(() => navigate('home'));
    await page.waitForTimeout(1800);
    const card = await page.$('.tstate-card');
    ok('GB-A1 the group card renders on Home', !!card);
    ok('GB-A2 …and it is operable — a role, a tab stop and a handler, not a div you can only look at',
      !!(card && await card.evaluate(el => el.getAttribute('role') === 'button'
        && el.getAttribute('tabindex') === '0' && !!el.getAttribute('onclick'))));
    ok('GB-A2b …with an accessible name that says where it goes',
      !!(card && /First Team/i.test(await card.evaluate(el => el.getAttribute('aria-label') || ''))));
    const cardBox = card && await card.boundingBox();
    ok('GB-A3 …and a target a thumb can hit at 390px',
      !!cardBox && cardBox.height >= 44 && cardBox.width >= 44);

    console.log('\n  B — IT OPENS THE GROUP, AND THE GROUP SAYS WHAT IT IS WORKING OUT');
    await card.click();
    await page.waitForTimeout(1600);
    const groupText = await text('.iq-group-thread');
    ok('GB-B1 the group screen opens', !!groupText);
    ok('GB-B2 …naming the group and how many people are in it',
      /First Team/.test(groupText) && /3 people/.test(groupText));
    /* THE READ THAT HAD NO CALLER. This is /api/group/:nodeId/inquiry reaching a screen. */
    const inqRows = await page.$$('.iqg-inq-row');
    ok('GB-B3 …and the inquiries the group is working out are RENDERED, not fetched and dropped',
      inqRows.length === 1);
    ok('GB-B4 …with the topic a person can read, not the canonical key',
      /Press shape/.test(groupText) && !/football\.press_shape/.test(groupText));
    ok('GB-B5 …what it rests on, counted as separate accounts rather than as voices',
      /2 separate accounts/.test(groupText));
    ok('GB-B6 …and what is still unknown, which is the half that makes it an inquiry',
      /What changes when we start deeper\?/.test(groupText));
    ok('GB-B7 no evidence internals reach the screen — the group holds references, never words',
      !/o_p1|ev_o_p1|turnId/.test(groupText));

    console.log('\n  C — A LEADER SETS A FOCUS OUT OF ONE OF THEM');
    const startBtn = await page.$('.iqg-inq-row button');
    ok('GB-C1 a leader is offered the control that starts one', !!startBtn);
    ok('GB-C1b …and it says what it does, in the group\'s language',
      /Work on this as a group/i.test(await startBtn.evaluate(el => el.textContent)));
    await startBtn.click();
    await page.waitForTimeout(500);
    const panel = await page.$('.iqg-start');
    ok('GB-C2 …which opens a panel asking what the group will actually do',
      !!panel && /What will this group do about it\?/i.test(await text('.iqg-start')));
    ok('GB-C2b …saying plainly who will see it and that the origin is recorded',
      /Everyone in this group will see it/i.test(await text('.iqg-start')));

    // Empty text must not create anything. A blank commitment is not a commitment.
    await page.click('.iqg-start .btn-primary');
    await page.waitForTimeout(600);
    const afterBlank = await api('GET', '/api/group/first/state');
    ok('GB-C3 setting it with nothing typed creates NOTHING',
      !(afterBlank.j && afterBlank.j.focus));
    ok('GB-C3b …and says so rather than failing silently',
      /Say what the group will do/i.test(await text('.iqg-start')));

    await page.fill('.iqg-start textarea', 'Start our build-up deeper for three matches');
    await page.click('.iqg-start .btn-primary');
    await page.waitForTimeout(1600);
    const afterSet = await api('GET', '/api/group/first/state');
    ok('GB-C4 typing it and confirming reaches the server and a real focus exists',
      !!(afterSet.j && afterSet.j.focus && afterSet.j.focus.focusId));
    ok('GB-C4b …with the leader\'s own words, unchanged',
      afterSet.j.focus.text === 'Start our build-up deeper for three matches');
    /* THE POINT OF SETTING IT FROM HERE. `origin.from === 'inquiry'` is what stops outcome
       learning crediting the system for a coach's own idea, and it is only true if the doorway
       actually carried the inquiry id. */
    ok('GB-C5 …and it records that it came OUT OF the inquiry, not out of a leader\'s hunch',
      afterSet.j.focus.origin && afterSet.j.focus.origin.from === 'inquiry'
      && afterSet.j.focus.origin.inquiryId === 'inq_press');
    const groupAfterSet = await text('.iq-group-thread');
    ok('GB-C6 the screen comes back showing what the group is now working on',
      /Start our build-up deeper/.test(groupAfterSet));
    ok('GB-C6b …and says it came from an open inquiry', /from an open inquiry/i.test(groupAfterSet));

    console.log('\n  D — AND WHAT CAME OF IT IS RECORDED');
    const outBtns = await page.$$('.iqg-outcome-btns button');
    ok('GB-D1 three outcome words are offered', outBtns.length === 3);
    const outLabels = await Promise.all(outBtns.map(b => b.evaluate(el => el.textContent.trim())));
    ok('GB-D1b …including "too tangled to tell", which is a first-class answer rather than a failure to answer',
      outLabels.some(l => /tangled/i.test(l)));
    ok('GB-D2 every one of them is a real tap target at 390px', await (async () => {
      for (const b of outBtns) { const bb = await b.boundingBox(); if (!bb || bb.height < 44) return false; }
      return true;
    })());
    const focusId = afterSet.j.focus.focusId;
    await outBtns[2].click();                                   // "Too tangled to tell"
    await page.waitForTimeout(1600);
    const afterOutcome = await api('GET', '/api/group/first/state');
    ok('GB-D3 recording it reaches the server',
      (afterOutcome.j.history || []).some(f => f.focusId === focusId
        && f.outcome && f.outcome.result === 'unclear'));
    const closedText = await text('.iq-group-thread');
    ok('GB-D4 …and the screen keeps it, with what came of it, rather than losing it',
      /What this group has tried/i.test(closedText) && /Too tangled to tell/i.test(closedText));
    /* THE SENTENCE THAT STOPS THE LOOP BEING READ AS A VERDICT, asserted as the LAW rather than
       as one spelling of it. The first version of this looked for the wording used beside a
       RUNNING focus -- and once the focus is closed that block is gone, so it was checking the
       wrong screen for a sentence that was correctly present in different words. Two things have
       to hold on any screen showing what came of a focus: a disclaimer of cause is present, and
       no causal claim is made anywhere on it. */
    ok('GB-D5 the closed loop carries an explicit disclaimer of cause',
      /nothing here says a focus caused what followed|never a claim that the focus caused it/i.test(closedText));
    ok('GB-D5b …and claims cause nowhere on the screen',
      !/because of this focus|the focus worked|caused by|led to the improvement|proved/i.test(closedText));

    console.log('\n  E — AND THE LOOP RUNS AGAIN');
    const rows2 = await page.$$('.iqg-inq-row button');
    ok('GB-E1 the inquiry is still there to work on again', rows2.length === 1);
    await rows2[0].click();
    await page.waitForTimeout(400);
    await page.fill('.iqg-start textarea', 'Press higher instead, for three matches');
    await page.click('.iqg-start .btn-primary');
    await page.waitForTimeout(1600);
    const reopened = await api('GET', '/api/group/first/state');
    ok('GB-E2 a NEW focus is set on the same inquiry after the first one closed',
      reopened.j.focus && reopened.j.focus.focusId !== focusId
      && reopened.j.focus.text === 'Press higher instead, for three matches');
    ok('GB-E2b …hanging off the same thing it addressed',
      reopened.j.focus.origin.inquiryId === 'inq_press');
    const bothText = await text('.iq-group-thread');
    ok('GB-E3 …and both attempts are on screen: what is running now, and what was tried before',
      /Press higher instead/.test(bothText) && /Start our build-up deeper/.test(bothText));

    /* A SEPARATE CONTEXT, NOT A TOKEN SWAP IN THE SAME TAB. Swapping localStorage under a live
       page leaves the previous session's state in memory -- Auth.token, the cached roster, the
       rendered DOM -- so the first version of this measured the coach's screen and called it the
       member's. A second context is a second browser as far as the app is concerned, which is
       what "what does a member see" actually asks. */
    console.log('\n  F — A MEMBER SEES THE SAME LOOP AND IS OFFERED NONE OF THE CONTROLS');
    const memberTok = issueToken('p1', C, 'member');
    const mctx = await browser.newContext({ viewport: IPHONE, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const mpage = await mctx.newPage();
    mpage.on('pageerror', e => { if (!HARNESS_ONLY.some(rx => rx.test(e.message))) pageErrors.push(e.message); });
    await mpage.addInitScript(([t, code]) => {
      localStorage.setItem('iq_auth', JSON.stringify({
        user: { id: 'p1', name: 'Player One', role: 'member', orgCode: code, profileComplete: true },
        org: { orgName: 'Alma College', orgMode: 'sports', organizationProfileComplete: true },
        token: t, permissions: {}, domain: null }));
      localStorage.setItem('iq_profile_complete_p1', '1');
    }, [memberTok, C]);
    await mpage.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
    await mpage.waitForTimeout(1500);
    const mNotice = await mpage.$('button:has-text("I understand")');
    if (mNotice) { await mNotice.click().catch(() => {}); await mpage.waitForTimeout(400); }
    await mpage.evaluate(() => MemberApp.openGroupNode('first'));
    await mpage.waitForTimeout(1800);
    const memberText = await mpage.evaluate(() =>
      ((document.querySelector('.iq-group-thread') || {}).innerText || '').trim());
    ok('GB-F1 a member of the group can open it and read the same loop',
      /Press shape/.test(memberText) && /Press higher instead/.test(memberText));
    ok('GB-F2 …and is offered no control to set a focus', (await mpage.$$('.iqg-inq-row button')).length === 0);
    ok('GB-F3 …nor to record an outcome', (await mpage.$$('.iqg-outcome-btns button')).length === 0);
    ok('GB-F4 …and is told who does, rather than shown a dead control or nothing at all',
      /A leader of this group records what came of it/i.test(memberText));

    /* AND THE SERVER IS STILL THE GATE. Hiding a control is a courtesy; this is the check that
       the courtesy is not load-bearing. The member forges the call the hidden button would have
       made, and the route refuses it. */
    const forged = await mpage.evaluate(async ([t, b]) => {
      const r = await fetch('/api/group/first/focus', { method: 'POST',
        headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'I am not a leader', fromInquiryId: 'inq_press' }) });
      return r.status;
    }, [memberTok, base]);
    ok('GB-F5 a member who forges the call the hidden control would have made is refused by the server',
      forged === 403);

    /* ── THE INPUT HALF, ON A SCREEN ─────────────────────────────────────────────────────────
       A member's own private noticings about this group. This surface was rendering into
       `#me-group`, which carries `hidden` and which nothing ever un-hides, so it had `display:none`
       and `offsetParent:null` on every Home render — verified in Chromium, not argued from source.
       Offering a noticing is the ONLY way a member's observation becomes something the group can
       reason about, and a group inquiry opens only when two INDEPENDENT people have done it. With
       no visible control the group loop had no door in at the bottom either. */
    console.log('\n  G — THE MEMBER\'S OWN WAY IN IS ON A SCREEN THEY CAN SEE');
    const mineBox = await mpage.$('#iqg-mine');
    ok('GB-G0 the member\'s private noticings for this group render on the group screen', !!mineBox);
    const mineVisible = mineBox && await mineBox.evaluate(el => {
      const cs = getComputedStyle(el);
      return cs.display !== 'none' && cs.visibility !== 'hidden' && !el.hasAttribute('hidden');
    });
    ok('GB-G0b …in an element that is actually VISIBLE — the defect was a renderer writing into display:none',
      mineVisible === true);
    const mineText = await mpage.evaluate(() => ((document.querySelector('#iqg-mine') || {}).innerText || ''));
    ok('GB-G0c …naming the thing this member could offer, so the box is not empty by accident',
      /How we press from the front/.test(mineText));
    const offerBtns = await mpage.$$('#iqg-mine .mg-actions button');
    ok('GB-G0c2 …with all four controls a person can reach — three directions and "keep it to myself"',
      offerBtns.length === 4);
    ok('GB-G0c3 …each one a real tap target at 390px', await (async () => {
      for (const b of offerBtns) { const bb = await b.boundingBox(); if (!bb || bb.height < 44) return false; }
      return true;
    })());
    ok('GB-G0c4 …and it says plainly that nobody can see it yet',
      /Nobody can see this yet/i.test(mineText));
    ok('GB-G0d …and it never says the group can already see them',
      !/the group can see|shared with|visible to the group/i.test(mineText));

    console.log('\n  H — NO PAGE ERRORS ALONG THE WAY');
    ok(`GB-G1 the whole walk raised no uncaught error (${pageErrors.length})`, pageErrors.length === 0);
    if (pageErrors.length) pageErrors.forEach(e => console.error('        ' + e));

  } catch (e) { fail++; console.error('  FAIL group-loop browser check threw:', e && e.stack); }

  await browser.close();
  server.close();
  console.log(`\ngroup-loop-browser-check: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
