/* BROWSER CHECK — THE MOMENT THE PRODUCT SAYS "STOP TRYING VARIATIONS", ON A PHONE.

   Acceptance matrix 14. `exhausted-help-http-smoke.js` proves the route: who may be named, that
   nobody is named who the asker could not already write to, and that nothing is sent. This is the
   other half — whether any of it reaches the person standing in front of the screen, and whether
   it arrives as READING or as a control.

   That distinction is the whole reason this file exists. A suggestion to bring somebody in must
   not arrive as a button, because a button beside a person's name is a button that messages them,
   and nothing here has consent to do that. The UI subtraction law: a permanent control does not go
   on screen merely because a backend value exists.

   The group-loop gate could not host this. Its inquiry has no supported hypothesis, so the kernel
   correctly answers `not_enough_evidence` and offers no options at all — a fixture that never
   reaches the state under test would have made every assertion below pass against an empty screen.

   Run: node scripts/exhausted-help-browser-check.js */

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

const C = 'ehb', NOW = Date.now(), DAY = 86400000;
const SQUAD = ['p1', 'p2', 'p3', 'p4', 'p5'];
const SIG = (w, n) => ({ kind: 'observation', status: 'active', source: w, originRef: `o_${w}_${n}`,
  at: NOW - 9 * DAY, turnId: `t_${w}_${n}`, directness: 'direct', authority: 'corroborated',
  specificity: 0.7, ref: `ev_${w}_${n}`, contributedBy: w, text: 'we fade late' });

_loadAllStores({
  orgMeta: { [C]: { orgName: 'Alma College', orgMode: 'sports', organizationProfileComplete: true } },
  orgUsers: { [C]: Object.fromEntries([
    ...SQUAD.map((id, i) => [id, { id, name: `Player ${i + 1}`, email: `${id}@e.io`, role: 'member',
      orgCode: C, status: 'active', assignedNodeIds: ['n'], profileComplete: true }]),
    ['coach', { id: 'coach', name: 'Dana Coach', email: 'c@e.io', role: 'coach', orgCode: C,
      status: 'active', leadershipNodeIds: ['n'], assignedNodeIds: ['n'], profileComplete: true }],
  ]) },
  orgNodes: { [C]: { n: { nodeId: 'n', name: 'First Team', parentId: null, childNodeIds: [],
    memberIds: [...SQUAD, 'coach'], leaderIds: ['coach'] } } },
  /* A SUPPORTED EXPLANATION, so the kernel reaches `worth_testing` and there is a real options
     list to take something away from. Five independent origins — one telling is refused. */
  inquiryStates: { [C]: { 'group:n': { q1: {
    inquiryId: 'q1', subjectRef: 'group:n',
    topic: { canonicalConcept: 'f.late', label: 'How the last twenty go' }, status: 'exploring',
    hypotheses: [{ id: 'h1', statement: 'the legs go in the last twenty',
      supportRefs: SQUAD.map((w, i) => `ev_${w}_${i}`), challengeRefs: [],
      confidence: { score: 0.7, band: 'probable' }, status: 'open', createdAt: NOW }],
    leadingHypothesisId: 'h1', signals: SQUAD.map((w, i) => SIG(w, i)),
    confidence: { score: 0.7, band: 'probable', because: ['5 independent origins'] },
    missingSignals: [], falsifiers: [], timeline: [], lastUpdatedAt: NOW,
  } } } },
  /* AND THE GROUP HAS ALREADY ACTED ON IT, AND IT CHANGED NOTHING. */
  teamFocuses: { [C]: { n: [{
    focusId: 'tf_a', nodeId: 'n', text: 'Extra fitness block on Tuesdays', status: 'done',
    createdAt: NOW - 5 * DAY, by: 'coach',
    origin: { from: 'inquiry', by: 'coach', at: NOW - 5 * DAY, inquiryId: 'q1' },
    outcome: { result: 'no_change', at: NOW - DAY, by: 'coach' },
  }] } },
});
_rebuildEmailIndex();

(async () => {
  const server = await new Promise(res => { const s = app.listen(0, () => res(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const errors = [];

  const openAs = async (who, role, name) => {
    const ctx = await browser.newContext({ viewport: IPHONE, deviceScaleFactor: 2,
      isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    page.on('pageerror', e => { if (!/^Chart is not defined$/.test(e.message)) errors.push(e.message); });
    await page.addInitScript(([t, code, id, r, nm]) => {
      localStorage.setItem('iq_auth', JSON.stringify({
        user: { id, name: nm, role: r, orgCode: code, profileComplete: true },
        org: { orgName: 'Alma College', orgMode: 'sports', organizationProfileComplete: true },
        token: t, permissions: null, domain: null }));
      localStorage.setItem(`iq_profile_complete_${id}`, '1');
    }, [issueToken(who, C, role), C, who, role, name]);
    await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1600);
    const notice = await page.$('button:has-text("I understand")');
    if (notice) { await notice.click().catch(() => {}); await page.waitForTimeout(400); }
    await page.evaluate(() => MemberApp.openGroupNode('n'));
    await page.waitForTimeout(1800);
    return { ctx, page };
  };

  try {
    console.log('\n  A — A MEMBER READS A QUESTION THE GROUP HAS ALREADY ACTED ON');
    const m = await openAs('p1', 'member', 'Player 1');
    const memberText = await m.page.evaluate(() =>
      ((document.querySelector('.iq-group-thread') || {}).innerText || '').trim());
    ok('EHB-A1 the group screen opens and shows the question',
      /last twenty/i.test(memberText));
    ok('EHB-A2 …and says what was already tried about it, and that it did not help',
      /Extra fitness block/i.test(memberText));

    console.log('\n  B — SO THE SCREEN STOPS OFFERING VARIATIONS AND NAMES A PERSON');
    /* THE OPTION THAT IS GONE. With nothing recorded as having helped, testing the leading
       explanation is no longer offered — that is the kernel's judgement, and this is where a
       person would see it. */
    ok('EHB-B1 another variation of the same tactic is no longer among the options',
      !/Test whether the legs go in the last twenty/i.test(memberText));
    ok('EHB-B2 …and the member is told, by name, who carries responsibility here',
      /Ask Dana Coach to look at this with you/i.test(memberText));
    ok('EHB-B3 …with what that would teach',
      /reads the same record differently/i.test(memberText));
    ok('EHB-B4 …and that bringing somebody in is not a verdict either',
      /Agreement is not corroboration/i.test(memberText));
    ok('EHB-B5 …while "learn more before acting" is still there, so this is not a funnel',
      /Learn more before acting/i.test(memberText));

    console.log('\n  C — AND IT IS READING, NOT A CONTROL THAT MESSAGES ANYBODY');
    const optShape = await m.page.evaluate(() => {
      const opt = [...document.querySelectorAll('.iqg-inq-opt')]
        .find(el => /Ask Dana Coach/i.test(el.innerText || ''));
      if (!opt) return null;
      return { controls: opt.querySelectorAll('button, a, input, [onclick]').length,
        visible: !!(opt.offsetParent || opt.getClientRects().length) };
    });
    ok('EHB-C1 the option carries no control at all — naming somebody is not permission to message them',
      !!optShape && optShape.controls === 0);
    ok('EHB-C2 …and it is actually on screen, not written into a hidden element',
      !!optShape && optShape.visible === true);
    const boxOk = await m.page.evaluate(() => {
      const opt = [...document.querySelectorAll('.iqg-inq-opt')]
        .find(el => /Ask Dana Coach/i.test(el.innerText || ''));
      if (!opt) return false;
      const r = opt.getBoundingClientRect();
      return r.left >= 0 && r.right <= 390 && r.width > 100;
    });
    ok('EHB-C3 …and it fits a 390px screen without pushing the page sideways', boxOk);
    ok('EHB-C4 …and the page still says out loud that none of this is a recommendation',
      /not a recommendation/i.test(memberText));

    console.log('\n  D — AND THE LEADER IS NOT TOLD TO GO AND ASK THEMSELVES');
    const c = await openAs('coach', 'coach', 'Dana Coach');
    const coachText = await c.page.evaluate(() =>
      ((document.querySelector('.iq-group-thread') || {}).innerText || '').trim());
    ok('EHB-D1 the leader reads the same question', /last twenty/i.test(coachText));
    ok('EHB-D2 …and is never told to ask themselves about it',
      !/Ask Dana Coach/i.test(coachText));
    /* AND THE STATE IS STILL REACHED FOR THEM. The escalation is absent because there is nobody
       else with standing, not because the leader is shown a different, rosier question — so the
       options list has to be PRESENT and merely missing the one option, which a bare negative
       could not tell apart from an empty screen. */
    ok('EHB-D3 …while still being told that another variation is not the useful next move',
      !/Test whether the legs go in the last twenty/i.test(coachText)
      && /Learn more before acting/i.test(coachText));

    console.log('\n  F — READING AN OPTION IS NOT CHOOSING ONE (matrix 10 and 11)');
    /* THE TWO HALVES THE MATRIX ASKS FOR, on the screen where options actually appear. Options are
       rendered as reading rather than as buttons, so "rejecting" one is not a control to press —
       the proof that matters is that reading a set and then backing out of the governed door
       leaves the record exactly as it was, and that the door never arrives pre-filled with an
       option the person did not write. A textarea carrying a suggestion is a choice made FOR them
       wearing the clothes of a choice they made. */
    const groupState = () => c.page.evaluate(async () => {
      const t = JSON.parse(localStorage.getItem('iq_auth')).token;
      const r = await fetch('/api/group/n/state', { headers: { Authorization: 'Bearer ' + t } });
      const j = await r.json().catch(() => null);
      /* COUNT DISTINCT FOCUS IDS. The response carries `focus` (the active one) and `history`
         (those that have run); `focuses` is an INPUT to buildTeamState and is not on the wire at
         all. Reading a key that is never sent returns 0 every time, which would have made every
         "the record is unchanged" assertion below compare 0 to 0 and prove nothing. */
      const ids = new Set();
      if ((j || {}).focus && j.focus.focusId) ids.add(j.focus.focusId);
      for (const f of ((j || {}).history || [])) if (f && f.focusId) ids.add(f.focusId);
      return ids.size;
    });
    const before = await groupState();
    ok('EHB-F1 the leader is offered the one governed door beside the options',
      await c.page.locator('button[onclick*="startGroupFocus"]').count() >= 1);
    await c.page.locator('button[onclick*="startGroupFocus"]').first().click();
    await c.page.waitForTimeout(500);
    ok('EHB-F2 …and it opens asking for their own words, with nothing chosen for them',
      await c.page.locator('.iqg-start textarea').count() === 1
      && (await c.page.locator('.iqg-start textarea').inputValue()) === '');
    ok('EHB-F3 …with no option pre-selected anywhere in the panel',
      !/Ask Dana Coach|Learn more before acting/i.test(
        await c.page.locator('.iqg-start').innerText()));
    /* MATRIX 10 — BACKING OUT WRITES NOTHING. */
    await c.page.locator('.iqg-start button:has-text("Not now")').click();
    await c.page.waitForTimeout(500);
    ok('EHB-F4 backing out closes it', await c.page.locator('.iqg-start').count() === 0);
    ok('EHB-F5 …and the record is exactly as it was — reading options wrote nothing',
      (await groupState()) === before);
    /* MATRIX 11 — AND CHOOSING GOES THROUGH THE GOVERNED DOOR, IN THEIR OWN WORDS. */
    await c.page.locator('button[onclick*="startGroupFocus"]').first().click();
    await c.page.waitForTimeout(400);
    await c.page.locator('.iqg-start textarea').fill('');
    await c.page.locator('.iqg-start button:has-text("Set this focus")').click();
    await c.page.waitForTimeout(600);
    ok('EHB-F6 an empty commitment is refused rather than saved as a blank focus',
      (await groupState()) === before && await c.page.locator('.iqg-start').count() === 1);
    /* AND THE SERVER OWNS THAT, not the panel. Deleting the client-side empty check changes
       nothing a person can see, because the route refuses it anyway — which is the right shape
       (hiding a control is a courtesy) but means the assertion above cannot tell the two apart.
       This forges the call the bypassed panel would have made. */
    const forgedEmpty = await c.page.evaluate(async () => {
      const t = JSON.parse(localStorage.getItem('iq_auth')).token;
      const r = await fetch('/api/group/n/focus', { method: 'POST',
        headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '   ', fromInquiryId: 'q1' }) });
      return r.status;
    });
    ok('EHB-F6b …and the server refuses it too, so the panel check is a courtesy and not the gate',
      forgedEmpty === 400 && (await groupState()) === before);
    /* AND A FOCUS CANNOT CLAIM IT CAME OUT OF AN INQUIRY THAT IS NOT THIS GROUP'S. */
    const forgedOrigin = await c.page.evaluate(async () => {
      const t = JSON.parse(localStorage.getItem('iq_auth')).token;
      const r = await fetch('/api/group/n/focus', { method: 'POST',
        headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Something real', fromInquiryId: 'not_ours' }) });
      return r.status;
    });
    ok('EHB-F6c …nor claim an origin inquiry that does not belong to this group',
      forgedOrigin === 404 && (await groupState()) === before);
    await c.page.locator('.iqg-start textarea').fill('Rotate the press in the last twenty');
    await c.page.locator('.iqg-start button:has-text("Set this focus")').click();
    await c.page.waitForTimeout(1200);
    ok('EHB-F7 …and their own words, deliberately confirmed, do reach the record',
      (await groupState()) === before + 1);
    ok('EHB-F8 …and the screen comes back showing what the group is now working on',
      /Rotate the press in the last twenty/i.test(
        await c.page.evaluate(() => (document.querySelector('.iq-group-thread') || {}).innerText || '')));

    console.log('\n  E — NOTHING WAS SENT BY ANY OF THAT');
    const inbox = await c.page.evaluate(async () => {
      const t = JSON.parse(localStorage.getItem('iq_auth')).token;
      const r = await fetch('/api/inbox', { headers: { Authorization: 'Bearer ' + t } });
      return { status: r.status, body: await r.text() };
    });
    ok('EHB-E1 the person named was never told they were suggested',
      inbox.status !== 200 || !/last twenty/i.test(inbox.body));
    ok('EHB-E2 the whole walk raised no uncaught client error', errors.length === 0);
    if (errors.length) errors.forEach(e => console.error('        ' + e));

    await m.ctx.close(); await c.ctx.close();
  } catch (e) { fail++; console.error('  FAIL exhausted-help browser check threw:', e && e.stack); }

  await browser.close();
  server.close();
  console.log(`\nexhausted-help-browser-check: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
