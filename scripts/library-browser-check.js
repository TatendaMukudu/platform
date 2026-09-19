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
  /* DRIVEN THROUGH THE REAL CONTROLS. This used to accept a native `dialog` event, because naming
     a folder opened `prompt()`. It does not any more — a browser dialog on a phone reads as the
     browser interrupting rather than as IntelliQ asking — so the harness now does what a person
     does: press New folder, type into the inline field, press Create. That is a better test as
     well as a necessary one; the old version could not have caught a field that never rendered. */
  let dialogs = 0;
  page.on('dialog', d => { dialogs++; d.dismiss().catch(() => {}); });
  await page.click('button:has-text("New folder")');
  await page.waitForTimeout(300);
  const field = await page.$('#iq-shelf-foldername');
  ok('B2a pressing New folder opens a field in the page, not a browser dialog', !!field && dialogs === 0);
  if (field) {
    await field.fill('Set pieces');
    await page.click('#iq-shelf-newfolder button:has-text("Create")');
    await page.waitForTimeout(800);
  }
  const chipText = await page.$eval('#shelf-folders', el => el.textContent || '').catch(() => '');
  ok('B2 a folder can be created and named, and its chip appears', /Set pieces/.test(chipText));
  ok('B2b …and the field closes once the folder exists',
    !(await page.$('#iq-shelf-foldername')));

  /* ── 3. KEEP AN OBJECT THROUGH THE GOVERNED ACTION ────────────────────────────────────────
     PR #84's law: a consequence on a governed object is proposed and confirmed, not fired by a
     button. So this presses the REAL Keep on the object thread and then confirms the proposal,
     rather than calling the shelf capability directly the way this harness used to. Model-off is
     the honest case to test it in: the typed shortcut travels as `requestedAction`, so the server
     validates a named action instead of asking a model to infer one. */
  console.log('\n  KEEP AN OBJECT THROUGH THE GOVERNED ACTION');
  const kept = await api('POST', '/api/me/focus', { text: 'Set-piece marking on the near post' });
  const keptId = kept.j && kept.j.focus && kept.j.focus.id;
  await go('focus');
  await page.evaluate(id => MemberApp.openObjectThread('focus', id), String(keptId)).catch(() => {});
  await page.waitForTimeout(1500);

  const keepBtn = await page.$('.iqt-verdicts button.iqt-verdict:has-text("Keep")');
  ok('B3pre the object thread offers Keep, and it is wired to the governed action rather than the shelf route',
    !!keepBtn && /beginObjectAction\('keep_in_library'/.test(
      await page.$eval('.iqt-verdicts', el => el.innerHTML).catch(() => '')));
  if (keepBtn) { await keepBtn.click(); await page.waitForTimeout(1600); }

  const proposedOnly = await api('GET', '/api/library/shelf');
  ok('B3pre2 …and pressing it PROPOSES rather than files — nothing is on the shelf until it is confirmed',
    (((proposedOnly.j || {}).items) || []).length === 0);

  const confirmBtn = await page.$('button:has-text("Confirm")');
  ok('B3pre3 …the proposal is on screen with a Confirm control', !!confirmBtn);
  if (confirmBtn) { await confirmBtn.click(); await page.waitForTimeout(1600); }

  const afterConfirm = await api('GET', '/api/library/shelf');
  ok('B3pre4 …and confirming files it, as a reference, through the same canonical shelf capability',
    (((afterConfirm.j || {}).items) || []).some(i => i.refId === String(keptId) && i.kind === 'focus'));

  /* ── NOW THE OTHER LAW: managing what is already on the shelf, directly. ───────────────── */
  console.log('\n  PUT IT IN A FOLDER (direct shelf management)');
  await go('notes');
  await page.waitForTimeout(600);

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
  const movedRow = ((afterMove.j && afterMove.j.items) || []).find(i => i.refId === String(keptId));
  const movedFolder = ((afterMove.j && afterMove.j.folders) || []).find(f => f.id === (fid || {}).id);
  ok('B4 choosing the folder actually FILED it there — the server now holds the folder on the filing',
    !!movedRow && movedRow.folderId === (fid || {}).id);
  ok('B4b …and the folder count is no longer permanently zero', !!movedFolder && movedFolder.count === 1);

  /* ── 4. OPEN THE FOLDER ───────────────────────────────────────────────────────────────── */
  console.log('\n  OPEN THE FOLDER');
  await page.evaluate(id => MemberApp.openShelfFolder(id), (fid || {}).id);
  await page.waitForTimeout(600);
  const inFolder = await page.$eval('#shelf-list', el => el.textContent || '').catch(() => '');
  ok('B5 opening the folder shows what is in it', /Set-piece marking on the near post/.test(inFolder));

  /* ── 5. MOVE IT BACK OUT ──────────────────────────────────────────────────────────────── */
  console.log('\n  MOVE IT BACK OUT');
  const sel2 = await page.$('.shelf-move-select');
  if (sel2) { await sel2.selectOption(''); await page.waitForTimeout(800); }
  const afterOut = await api('GET', '/api/library/shelf');
  const loose = ((afterOut.j && afterOut.j.items) || []).find(i => i.refId === String(keptId));
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
  /* ── B7c — THE LAW, NOT THE LIST, AND WHY THAT CHANGED ────────────────────────────────────
     This used to assert the literal set `.pptx .docx .xlsx .csv`, and it passed every time. It
     was reading a hard-coded attribute, not a capability. Word, PowerPoint and spreadsheets are
     read by JSZip and SheetJS, which arrive from a CDN — and in THIS environment that CDN is
     unreachable (`net::ERR_TUNNEL_CONNECTION_FAILED`, measured, not assumed). So those three
     formats have never once been readable in any browser check this engagement has run, while
     this assertion said they were on offer. It was green, and it was wrong: exactly the class
     this whole engagement keeps finding, in the file written to catch that class.

     The picker is now derived from what actually loaded, so what this must assert is the
     INVARIANT: offered is exactly readable. That holds on a coach's phone with the libraries in
     cache, holds on a stadium connection without them, and fails the moment either side drifts —
     which the literal list could not do. */
  const readerState = await page.evaluate(() => ({
    kinds: AttachmentHandler.readableMaterialKinds(),
    exts: Object.keys(AttachmentHandler.materialExtensions()),
    known: Object.keys(AttachmentHandler.MATERIAL_EXTENSIONS),
    jszip: typeof JSZip !== 'undefined', xlsx: typeof XLSX !== 'undefined',
  })).catch(() => null);
  ok('B7c the picker offers EXACTLY the formats whose reader is present in this browser',
    !!readerState && acc === readerState.exts.join(','));
  ok('B7d …and a format whose reader did not load is not advertised',
    !!readerState && (readerState.jszip || !/\.docx|\.pptx/.test(acc))
    && (readerState.xlsx || !/\.xlsx/.test(acc)));
  ok('B7e …while the formats that need no library are always there, so a lost CDN never leaves a dead door',
    !!acc && /\.txt/.test(acc) && /\.csv/.test(acc) && /\.md/.test(acc));
  /* AND THE ENVIRONMENT FACT IS PRINTED rather than inferred, because a future reader of this
     output has to be able to tell "the capability regressed" from "this box has no internet". */
  console.log(`    [readers] JSZip=${readerState && readerState.jszip} `
    + `XLSX=${readerState && readerState.xlsx} → offering ${acc}`);

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

  /* ── 8. WHO GETS THE ROW ───────────────────────────────────────────────────────────────────
     Found by measuring the rendered page rather than reading the CSS. At 390px the row is 369px
     wide and the item's own words had 153px of it: a folder select and a Remove button sat beside
     them permanently. Nothing was cut off — it wrapped, which is worse to read and easier to miss.
     The label of a single-sentence focus became a four-line ribbon 126px wide, in the one place
     whose whole job is recognising something again at a glance.

     Filing is a once-per-item act; reading the label happens every time the page opens. This
     asserts the priority, not the pixel count — a layout that puts the words first satisfies it
     however it is built, and the arrangement that caused the defect cannot. */
  console.log('\n  AT PHONE WIDTH, THE WORDS GET THE ROW');
  /* Filed fresh here: an earlier section takes its item back off the shelf, so measuring what is
     left would measure an empty page and every assertion below would be vacuous. The text is long
     enough to be worth truncating — a short label fits either layout and proves nothing. */
  const toMeasure = await api('POST', '/api/me/focus',
    { text: 'Set-piece marking on the near post, especially in the second half' });
  const measureId = toMeasure.j && toMeasure.j.focus && toMeasure.j.focus.id;
  await api('POST', '/api/library/shelf', { kind: 'focus', id: measureId });
  await go('notes');
  /* An earlier section left the page filtered to the "Set pieces" folder, so the list was showing
     its empty state rather than any row. Pressed rather than reset in code — it is the control the
     empty state tells the person to use, so driving it is worth more than assigning the field. */
  await page.click('.shelf-chip:has-text("Everything")').catch(() => {});
  await page.waitForTimeout(700);
  const geom = await page.evaluate(() => {
    const row = document.querySelector('.shelf-row');
    if (!row) return null;
    const open = row.querySelector('.shelf-open');
    const lab  = row.querySelector('.shelf-label');
    const mgmt = [...row.querySelectorAll('.shelf-move-select, .shelf-x')];
    const vis = el => { const c = getComputedStyle(el); return el.offsetHeight > 0 && c.display !== 'none' && c.visibility !== 'hidden'; };
    return {
      rowW: row.getBoundingClientRect().width,
      openW: open ? open.getBoundingClientRect().width : 0,
      /* Line count rather than clipping. "Is it cut off" was the first thing asserted here and it
         never failed: nothing is ever cut off, because the label wraps. The symptom is the shape
         of the wrap, so that is what gets measured. */
      labelLines: (() => {
        if (!lab) return 99;
        const cs = getComputedStyle(lab);
        const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4;
        return Math.round(lab.getBoundingClientRect().height / lh);
      })(),
      mgmtCount: mgmt.length,
      mgmtVisible: mgmt.every(vis),
      mgmtTaps: mgmt.every(el => el.getBoundingClientRect().height >= 44),
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  ok('B10 a filed row is on the page to measure', !!geom && geom.rowW > 0);
  ok('B10b the item\'s own words take most of the row, rather than sharing it with the filing controls',
    !!geom && geom.openW > geom.rowW * 0.8);
  /* The fixture text above is one sentence and is fixed in this file, so the line count is a fair
     thing to pin: two lines when the words have the row, four when they are sharing it. */
  ok('B10c …reading as a sentence rather than a narrow ribbon of wrapped fragments',
    !!geom && geom.labelLines <= 2);
  /* THE HALF THAT STOPS THIS BEING WON BY DELETION. Giving the words the row by removing the
     controls would pass B10b and break the product. */
  ok('B10d …while the folder control and Remove are both still there',
    !!geom && geom.mgmtCount === 2 && geom.mgmtVisible);
  ok('B10e …still thumb-sized, now that they no longer borrow the card\'s height',
    !!geom && geom.mgmtTaps);
  ok('B10f …and nothing runs off the side of the screen', !!geom && !geom.overflow);

  await browser.close();
  server.close();
  console.log(`\nlibrary-browser-check: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('  FAIL harness threw:', e && e.message); process.exit(1); });
