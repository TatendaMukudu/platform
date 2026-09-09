/* BROWSER CHECK — the pilot-closure blockers, driven in a real Chromium at a real phone size.

   NOT part of `npm test`, deliberately and for the same reason scripts/mobile-inspect.js is not:
   the truth layer is hermetic and must run with no browser binary. This is the other kind of
   evidence. Everything the hermetic suites assert about these four fixes is asserted about
   SOURCE — that a control is emitted, that a marker is rendered, that an accept list is derived
   — and source is not a screen. Three of the four blockers were features whose route worked,
   whose tests passed, and which no person could reach. That failure is invisible to a suite that
   never opens the page, so this opens it.

   Run: node scripts/library-browser-check.js
   Needs: playwright-core (devDependency) and the Chromium at EXE below. */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
process.env.IQ_COMPOSER = '1';

const path = require('path');
const { chromium } = require('playwright-core');
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const IPHONE = { width: 390, height: 844 };   // the founder's device class

const ai = require('../ai/gateway.js');
const teamState = require('../ai/team-state.js');
const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, _teamFocuses } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

const C = 'lbc';
_loadAllStores({
  orgMeta:  { [C]: { orgName: 'Alma College', orgMode: 'sports' } },
  orgUsers: { [C]: {
    me: { id: 'me', name: 'A Player', email: 'me@x.io', role: 'member', orgCode: C, status: 'active',
          assignedNodeIds: ['n1'], profileComplete: true },
  } },
  orgNodes: { [C]: { n1: { nodeId: 'n1', name: 'First Team', memberIds: ['me'], leaderIds: [] } } },
});
_rebuildEmailIndex();
_teamFocuses(C, 'n1').push(teamState.newFocus({
  focusId: 'tf1', nodeId: 'n1', text: 'Saturday away — the press', by: 'me', now: Date.now() }));

(async () => {
  const server = await new Promise(res => { const s = app.listen(0, () => res(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = issueToken('me', C, 'member');
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: IPHONE, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  const page = await ctx.newPage();
  page.on('pageerror', e => console.error('  [page error]', e.message));
  await page.addInitScript(([t, code]) => {
    localStorage.setItem('iq_auth', JSON.stringify({
      user: { id: 'me', name: 'A Player', role: 'member', orgCode: code, profileComplete: true },
      org: { orgName: 'Alma College', orgMode: 'sports', organizationProfileComplete: true },
      token: t, permissions: {}, domain: null,
    }));
    localStorage.setItem('iq_profile_complete_me', '1');
  }, [token, C]);
  await page.goto(`${base}/`, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(900);
  const notice = await page.$('button:has-text("I understand")');
  if (notice) { await notice.click().catch(() => {}); await page.waitForTimeout(400); }

  const go = async r => { await page.evaluate(x => navigate(x), r); await page.waitForTimeout(1100); };
  const api = (m, u, b) => page.evaluate(async ([m, u, b, t]) => {
    const r = await fetch(u, { method: m, headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
      body: b ? JSON.stringify(b) : undefined });
    return { status: r.status, j: await r.json().catch(() => null) };
  }, [m, u, b, token]);

  /* ── 1. OPEN LIBRARY, AND CONFIRM IT IS THE SHELF ─────────────────────────────────────── */
  console.log('\n  OPEN LIBRARY');
  await go('notes');
  ok('B1 the Library page renders the shelf, not the retired copy-taking modal',
    !!(await page.$('#shelf-list')) && !(await page.$('#iq-lib-modal')));

  /* ── 2. CREATE A FOLDER ───────────────────────────────────────────────────────────────── */
  console.log('\n  CREATE A FOLDER');
  page.once('dialog', d => d.accept('Set pieces'));
  await page.evaluate(() => MemberApp.newShelfFolder());
  await page.waitForTimeout(700);
  const chipText = await page.$eval('#shelf-folders', el => el.textContent || '').catch(() => '');
  ok('B2 a folder can be created and named, and its chip appears', /Set pieces/.test(chipText));

  /* ── 3. KEEP SOMETHING, THEN PUT IT IN THE FOLDER ─────────────────────────────────────── */
  console.log('\n  PUT SOMETHING IN IT');
  await page.evaluate(() => MemberApp.fileToShelf('focus', 'tf1'));
  await page.waitForTimeout(700);
  await page.evaluate(() => MemberApp._renderShelf());
  await page.waitForTimeout(500);

  const sel = await page.$('.shelf-move-select');
  ok('B3 the row carries a folder control — the door that did not exist', !!sel);

  const before = await api('GET', '/api/library/shelf');
  const fid = ((before.j && before.j.folders) || []).find(f => f.name === 'Set pieces');
  ok('B3b …offering the folder that was just made', !!fid && (await sel.$$('option')).length === 2);

  if (sel && fid) {
    await sel.selectOption(fid.id);
    await page.waitForTimeout(800);
  }
  const afterMove = await api('GET', '/api/library/shelf');
  const movedRow = ((afterMove.j && afterMove.j.items) || []).find(i => i.refId === 'tf1');
  const movedFolder = ((afterMove.j && afterMove.j.folders) || []).find(f => f.id === (fid || {}).id);
  ok('B4 choosing the folder actually FILED it there — the server now holds the folder on the filing',
    !!movedRow && movedRow.folderId === (fid || {}).id);
  ok('B4b …and the folder count is no longer permanently zero', !!movedFolder && movedFolder.count === 1);

  /* ── 4. OPEN THE FOLDER ───────────────────────────────────────────────────────────────── */
  console.log('\n  OPEN THE FOLDER');
  await page.evaluate(id => MemberApp.openShelfFolder(id), (fid || {}).id);
  await page.waitForTimeout(600);
  const inFolder = await page.$eval('#shelf-list', el => el.textContent || '').catch(() => '');
  ok('B5 opening the folder shows what is in it', /Saturday away/.test(inFolder));

  /* ── 5. MOVE IT BACK OUT ──────────────────────────────────────────────────────────────── */
  console.log('\n  MOVE IT BACK OUT');
  const sel2 = await page.$('.shelf-move-select');
  if (sel2) { await sel2.selectOption(''); await page.waitForTimeout(800); }
  const afterOut = await api('GET', '/api/library/shelf');
  const loose = ((afterOut.j && afterOut.j.items) || []).find(i => i.refId === 'tf1');
  ok('B6 it can be moved back out of the folder, through the same one control',
    !!loose && loose.folderId === null);
  ok('B6b …and it is still on the shelf — moving is not removing',
    ((afterOut.j && afterOut.j.items) || []).length === 1);

  /* ── 6. THE MATERIAL PICKER ───────────────────────────────────────────────────────────── */
  console.log('\n  THE MATERIAL FILE PICKER');
  /* A PERSONAL focus, made through the real route. The object thread reads the `self` bucket, so
     the squad focus above — which is what the shelf rows point at — is legitimately not there.
     This was worth finding: it is the harness that was wrong, not the product. */
  const mine = await api('POST', '/api/me/focus', { text: 'Finishing under pressure' });
  const myFocusId = mine.j && mine.j.focus && (mine.j.focus.id || mine.j.focus.focusId);
  ok('B7pre a personal focus was created to open a thread on', !!myFocusId);
  // Reached the way a person reaches it: the focus bucket, then the card. Opening the thread
  // straight off the Library page left the renderer without the container it writes into.
  await go('focus');
  await page.evaluate(id => MemberApp.openObjectThread('focus', id), String(myFocusId)).catch(() => {});
  await page.waitForTimeout(1600);
  const acc = await page.$eval('#iqt-mat-file', el => el.getAttribute('accept')).catch(() => null);
  /* THE ACCEPT ATTRIBUTE AS THE BROWSER SEES IT. Read off the live element rather than off the
     template, because the two disagreed: the guard was `window.AttachmentHandler`, the handler is
     a top-level const, and a top-level const is not a property of window — so the attribute
     rendered empty and the picker offered every file on the phone. Every source-level assertion
     was green throughout, because the source said the right thing. */
  ok('B7 the Material picker exists on the object thread and advertises a NON-EMPTY accept list — an empty one offers everything', !!acc);
  ok('B7b …and it does not offer a PDF or an image, which it would have to refuse after the file was chosen',
    !!acc && !/\.pdf/i.test(acc) && !/image/i.test(acc));
  ok('B7c …while still offering the formats it can read, including the founder\'s PowerPoint case',
    !!acc && /\.pptx/.test(acc) && /\.docx/.test(acc) && /\.xlsx/.test(acc) && /\.csv/.test(acc));

  /* ── 7. THE DEGRADED REPLY, RENDERED ──────────────────────────────────────────────────── */
  console.log('\n  A DEGRADED REPLY, ON THE SCREEN');
  ai.enabled = () => false;                       // no model → the composer cannot write the reply
  await go('home');
  const turn = await api('POST', '/api/assistant/turn', { text: 'How has my week been going?' });
  ok('B8 the turn still answers with the model unavailable',
    !!(turn.j && turn.j.response && turn.j.response.responseText));
  ok('B8b …and the response carries the structured degraded marker over the wire',
    !!(turn.j && turn.j.response && turn.j.response.composer && turn.j.response.composer.degraded === true));

  const rendered = await page.evaluate(c => {
    const d = document.createElement('div');
    d.innerHTML = iqDegradedNote(c);
    document.body.appendChild(d);
    const el = d.querySelector('.iq-degraded');
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { text: el.textContent.trim(), visible: el.offsetHeight > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' };
  }, turn.j.response.composer);
  ok('B9 the client renders the marker, and it is actually visible on a phone-sized screen',
    !!rendered && rendered.visible);
  ok('B9b …saying the normal response is unavailable, in words',
    !!rendered && /normal response isn't available right now/.test(rendered.text));
  ok('B9c …and naming no provider, model, key or error',
    !!rendered && !/provider|key|401|anthropic|openai|error/i.test(rendered.text));

  await browser.close();
  server.close();
  console.log(`\nlibrary-browser-check: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('  FAIL harness threw:', e && e.message); process.exit(1); });
