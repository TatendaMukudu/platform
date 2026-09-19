/* REPRODUCTION — the founder's live failures, driven in a real Chromium against the real client.

   This file exists to FAIL against the code as it was, and to keep failing if any of it returns.
   Every case below is one of the numbered observations from the founder's live session on an
   iPhone. Nothing here is a unit test of a helper: each one opens the real page, puts the real
   server into the state the founder was in, and reads what a person would have seen.

   Run: node scripts/live-recovery-repro.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
process.env.IQ_COMPOSER = '1';

const { chromium } = require('playwright-core');
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

const C = 'lrr';
_loadAllStores({
  orgMeta:  { [C]: { orgName: 'Alma College', orgMode: 'sports', organizationProfileComplete: true } },
  orgUsers: { [C]: {
    me: { id: 'me', name: 'A Player', email: 'lrr@x.io', role: 'member', orgCode: C, status: 'active',
      assignedNodeIds: ['n1'], profileComplete: true, passwordSet: true, passwordHash: 'x' },
    mate: { id: 'mate', name: 'A Teammate', email: 'lrr2@x.io', role: 'member', orgCode: C, status: 'active',
      assignedNodeIds: ['n1'], profileComplete: true, passwordSet: true, passwordHash: 'x' },
  } },
  orgNodes: { [C]: { n1: { nodeId: 'n1', name: 'First Team', parentId: null, childNodeIds: [],
    memberIds: ['me', 'mate'], leaderIds: [], rev: 0 } } },
});
_rebuildEmailIndex();

/* ── A SAME-ORIGIN ENDPOINT THAT SENDS ITS HEADERS AND THEN STOPS ──────────────────────────────
   HARNESS-ONLY, mounted onto the app instance inside this test process. It is not in server.js and
   never ships; it exists because `fetch` resolves on the RESPONSE HEADERS, and no route interceptor
   can express "answer, then stall mid-body" — Playwright's fulfil sends a complete body or nothing
   at all. The condition it recreates is the ordinary shape of a dropped mobile connection: the
   phone already has `HTTP/1.1 200` and `Content-Type: application/json`, and the bytes stop.

   Same origin deliberately, because the thing under test is the client's own read, and a
   cross-origin stand-in would be testing CORS. */
app.get('/__harness/stalled-body', (req, res) => {
  res.status(200);
  res.set('Content-Type', 'application/json');
  res.write('{"objects":[');          // headers flushed, body opened, and never finished
  // No res.end(), ever. The socket is closed when the harness closes the server.
});

(async () => {
  const server = await new Promise(res => { const s = app.listen(0, () => res(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = issueToken('me', C, 'member');
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const HARNESS_ONLY = [/^Chart is not defined$/];

  /* Open the app as a signed-in member, with a route interceptor the test controls. `plan` maps a
     URL substring to what the server should appear to do: 'hang', a status code, or null to pass
     through. This is how the founder's conditions are recreated without breaking the server for
     every other case. */
  const openApp = async (plan = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => { if (!HARNESS_ONLY.some(rx => rx.test(e.message))) errs.push(e.message); });
    await page.route('**/api/**', async route => {
      const url = route.request().url();
      const hit = Object.keys(plan).find(k => url.includes(k));
      if (!hit) return route.continue();
      const how = plan[hit];
      if (how === 'hang') return;                       // never fulfilled: the request that never comes back
      if (typeof how === 'number') {
        return route.fulfill({ status: how, contentType: 'application/json',
          body: JSON.stringify({ error: how === 401 ? 'Authentication required.' : 'server error' }) });
      }
      if (how === 'html500') {
        return route.fulfill({ status: 500, contentType: 'text/html', body: '<html>nope</html>' });
      }
      // The connection refused outright — a phone off the network, which is a different outcome
      // from a request that hangs and a different one again from a server that answers badly.
      if (how === 'offline') return route.abort('failed');
      // An arbitrary reply, so a surface can be driven through a specific payload rather than only
      // through a status code. `{ status, body, contentType }`; a non-string body is JSON-encoded.
      if (how && typeof how === 'object') {
        return route.fulfill({
          status: how.status == null ? 200 : how.status,
          contentType: how.contentType || 'application/json',
          body: typeof how.body === 'string' ? how.body : JSON.stringify(how.body),
        });
      }
      return route.continue();
    });
    await page.addInitScript(([t, code]) => {
      localStorage.setItem('iq_auth', JSON.stringify({
        user: { id: 'me', name: 'A Player', role: 'member', orgCode: code, profileComplete: true },
        org: { orgName: 'Alma College', orgMode: 'sports', organizationProfileComplete: true },
        token: t, permissions: {}, domain: null }));
      localStorage.setItem('iq_profile_complete_me', '1');
    }, [token, C]);
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    return { page, ctx, errs };
  };
  const text = (page, sel) => page.evaluate(s => ((document.querySelector(s) || {}).innerText || '').trim(), sel);

  try {
    /* ══ 1 — HOME STAYED ON "Looking at your record…" ════════════════════════════════════════
       The founder watched this indefinitely. `_loadTopQuestion` awaits `/api/me/attention` and
       then four `/api/objects` requests with NO timeout and NO abort, so a request that never
       comes back leaves that line on the screen for as long as the person is willing to wait. */
    console.log('\n  OBSERVATION 1 — HOME MUST NOT HANG ON "Looking at your record…"');
    {
      const { page, ctx } = await openApp({ '/api/me/attention': 'hang', '/api/objects': 'hang' });
      await page.evaluate(() => navigate('home'));
      await page.waitForTimeout(19000);     // past the bound, plus the second round of reads
      const brief = await text(page, '#iq-brief');
      ok('LR-1 Home does not sit on "Looking at your record…" once a request has clearly hung',
        !/Looking at your record/i.test(brief));
      ok('LR-1b …it says the record could not be loaded, and offers a way to try again',
        /could not be loaded|try again/i.test(brief));
      await ctx.close();
    }

    /* ══ 7,8,9,11 — A FAILED READ RENDERED AS AN EMPTY RECORD ═══════════════════════════════
       `_renderBucketPage` called `r.json()` without checking `r.ok`, so a 401/403/500 with a JSON
       error body produced `{error:…}`, `(j && j.objects) || []` produced [], and the page showed
       the EMPTY state. The founder suspected exactly this: "the application may have disguised a
       failed retrieval as an empty record". */
    console.log('\n  OBSERVATIONS 7-11 — A FAILED READ IS NOT AN EMPTY RECORD');
    for (const [label, plan] of [['500 with a JSON body', { '/api/objects': 500 }],
                                 ['500 with an HTML body', { '/api/objects': 'html500' }],
                                 ['403', { '/api/objects': 403 }]]) {
      const { page, ctx } = await openApp(plan);
      await page.evaluate(() => MemberApp._renderBucketPage('high'));
      await page.waitForTimeout(1500);
      const body = await text(page, '#iq-inquiries-page');
      ok(`LR-7 (${label}) Highs does not claim nothing has stood out when the read FAILED`,
        !/Nothing has stood out as going well/i.test(body));
      ok(`LR-7b (${label}) …it says what happened and offers a retry`,
        /could not|try again/i.test(body));
      await ctx.close();
    }

    /* ══ 10 — LOWS SHOWED THE HIGHS COPY ════════════════════════════════════════════════════
       Two renders in flight at once. The header is written synchronously at call time and the
       body asynchronously when the request returns, so tapping Highs and then Lows leaves the
       Lows header above whichever body resolves last. The founder saw the Lows page carrying
       "Nothing has stood out as going well yet." */
    console.log('\n  OBSERVATION 10 — A SLOWER EARLIER REQUEST MUST NOT OVERWRITE THE PAGE YOU ARE ON');
    {
      const { page, ctx } = await openApp();
      // Make the FIRST (high) request slow and the second (low) fast, which is the founder's order.
      await page.route('**/api/objects**', async route => {
        const url = route.request().url();
        if (url.includes('kind=high')) { await new Promise(r => setTimeout(r, 2500)); }
        return route.continue();
      });
      await page.evaluate(async () => {
        MemberApp._renderBucketPage('high');            // not awaited: still in flight
        await new Promise(r => setTimeout(r, 200));
        MemberApp._renderBucketPage('low');             // the page the person is actually on
      });
      await page.waitForTimeout(4000);
      const header = await text(page, '#page-inquiry .page-header-title');
      const body = await text(page, '#iq-inquiries-page');
      ok('LR-10 the header still says Lows', /Lows/i.test(header));
      ok('LR-10b …and the body is NOT the Highs copy underneath it',
        !/Nothing has stood out as going well/i.test(body));
      await ctx.close();
    }

    /* ══ 3,4,5 — ONE COHERENT EXPIRED-SESSION STATE ═════════════════════════════════════════
       The founder saw "Your session may have expired" and "Your record could not be loaded"
       at the same time, several competing retry controls, and a composer that still accepted
       typing, voice and attachments while signed out. */
    console.log('\n  OBSERVATIONS 3-5 — AN EXPIRED SESSION IS ONE STATE, NOT SEVERAL');
    {
      const { page, ctx } = await openApp({ '/api/': 401 });
      await page.evaluate(() => navigate('home'));
      await page.waitForTimeout(3000);
      const whole = await page.evaluate(() => document.body.innerText || '');
      const expired = /session .*expired|sign in again/i.test(whole);
      const alsoConnection = /connection problem|could not be loaded just now/i.test(whole);
      ok('LR-3 an expired session does not ALSO claim a connection problem',
        !(expired && alsoConnection));
      const retries = await page.evaluate(() => [...document.querySelectorAll('button')]
        .filter(b => /try again|retry|reload/i.test(b.innerText || '') && b.offsetParent !== null).length);
      ok('LR-4 at most one retry control is offered at a time', retries <= 1);
      const live = await page.evaluate(() => {
        const q = id => document.getElementById(id);
        const usable = el => el && !el.disabled && el.offsetParent !== null;
        return { input: usable(q('iq-composer-input')), mic: usable(q('iq-mic')), attach: usable(q('iq-attach')) };
      });
      ok('LR-5 the composer, microphone and attachment controls are not left usable while signed out',
        !live.input && !live.mic && !live.attach);
      await ctx.close();
    }

    /* ══ 7-9 (object detail) — A TERMINAL DEAD END ══════════════════════════════════════════
       One catch-all around the whole render wrote "This could not be opened right now." with no
       retry and no distinction between 401, 403, 500 and a rendering bug. */
    console.log('\n  OBSERVATIONS 7-9 — OPENING AN OBJECT THAT FAILS IS RECOVERABLE');
    {
      const { page, ctx } = await openApp({ '/api/object/': 500 });
      await page.evaluate(() => MemberApp.openObjectThread('inquiry', 'anything'));
      await page.waitForTimeout(1500);
      const body = await text(page, '#iq-inquiries-page');
      ok('LR-9 a failed object open offers a way back or a way to try again',
        /try again|back/i.test(body));
      await ctx.close();
    }

    /* ══ PHASE 2 — ONE TERMINAL SESSION STATE, FOR EVERY WAY OF WRITING ═════════════════════
       `_read` already turned a 401 into the terminal state. The gate found that every WRITE path
       answered it locally instead: the composer POST returned `{reason:'auth'}` to its own caller,
       an upload turned it into "I couldn't save that", the card thread reported a connection
       problem, and the Forum swallowed it entirely — having already cleared the box. Meanwhile
       `_sessionEnded` only ever selected `.iq-composer`, so the card thread stayed usable and a
       live microphone kept listening. */
    console.log('\n  PHASE 2 — A 401 ON ANY WRITE ENDS THE SESSION EVERYWHERE');
    const writeCases = [
      ['the composer POST', async page => page.evaluate(async () => {
        document.getElementById('iq-composer-input').value = 'hello';
        await MemberApp.wsSend();
      })],
      /* The card thread needs the same two things production gives it: an insight in the registry
         and a rendered card carrying its key. Anything less and cardSend returns before it ever
         reaches the network, which would make this assertion pass against a surface that never
         ran -- PROTOCOL's empty fixture. */
      ['a card-thread write', async page => page.evaluate(async () => {
        MemberApp._insights = { ...(MemberApp._insights || {}), x: { headline: 'h', body: 'b' } };
        document.body.insertAdjacentHTML('beforeend',
          '<div class="iq-insight" data-key="x"><div class="iq-cardthread-msgs"></div>'
          + '<div class="iq-cardthread-input"><textarea class="iq-cardthread-ta"></textarea></div></div>');
        if (!MemberApp._cardEl('x')) throw new Error('fixture did not render the card');
        await MemberApp.cardSend('x', 'hello');
      })],
      ['a Forum write', async page => page.evaluate(async () => {
        MemberApp._forumCtx = { nodeId: 'n1', objectId: 'o1', room: 'r', backKind: 'high' };
        document.body.insertAdjacentHTML('beforeend',
          '<textarea id="iq-forum-input">something worth keeping</textarea>');
        await MemberApp.forumSend();
      })],
    ];
    for (const [label, act] of writeCases) {
      const { page, ctx } = await openApp();
      await page.evaluate(() => navigate('home'));
      await page.waitForTimeout(900);
      // Everything is fine until the write. Only then does the server refuse.
      await page.route('**/api/**', route => route.fulfill({ status: 401,
        contentType: 'application/json', body: JSON.stringify({ error: 'Authentication required.' }) }));
      try { await act(page); } catch (_) { /* the surface may throw; the app-wide state is the test */ }
      await page.waitForTimeout(900);
      const state = await page.evaluate(() => {
        const usable = el => el && !el.disabled && el.offsetParent !== null;
        return {
          over: !!MemberApp._sessionOver,
          composer: usable(document.getElementById('iq-composer-input')),
          mic: usable(document.getElementById('iq-mic')),
          attachVisible: [...document.querySelectorAll('.iq-attach')].some(e => !e.hidden),
          cardTa: [...document.querySelectorAll('.iq-cardthread-ta')].some(t => !t.disabled),
        };
      });
      ok(`LR-S1 (${label}) a 401 ends the session for the whole app, not just this surface`, state.over === true);
      ok(`LR-S2 (${label}) …the composer, microphone and paperclip are all closed`,
        !state.composer && !state.mic && !state.attachVisible);
      ok(`LR-S3 (${label}) …including the card thread, which is a separate place to write`, !state.cardTa);
      await ctx.close();
    }

    /* THE FORUM MESSAGE ITSELF. Losing what somebody wrote is worse than showing them a failure,
       and this lost it silently: the box was cleared before the request, and every outcome was
       swallowed by an empty catch. */
    {
      const { page, ctx } = await openApp();
      await page.evaluate(() => navigate('home'));
      await page.waitForTimeout(800);
      await page.route('**/api/**', route => route.fulfill({ status: 401,
        contentType: 'application/json', body: JSON.stringify({ error: 'Authentication required.' }) }));
      const kept = await page.evaluate(async () => {
        MemberApp._forumCtx = { nodeId: 'n1', objectId: 'o1', room: 'r', backKind: 'high' };
        document.body.insertAdjacentHTML('beforeend',
          '<textarea id="iq-forum-input">something worth keeping</textarea>');
        await MemberApp.forumSend();
        await new Promise(r => setTimeout(r, 400));
        return document.getElementById('iq-forum-input').value;
      });
      ok('LR-S4 a Forum message that does not post is given back, not silently lost',
        kept === 'something worth keeping');
      await ctx.close();
    }

    /* THE LATE TRANSCRIPT. A recogniser left running delivers whenever it finishes, so a session
       that ended mid-sentence could put text into a composer minutes later — on a page that has
       no session to send it with, after the person was told to sign in. */
    {
      const { page, ctx } = await openApp();
      await page.evaluate(() => navigate('home'));
      await page.waitForTimeout(900);
      const res = await page.evaluate(async () => {
        // A fake recogniser with the surface IQVoice drives, so the test is deterministic and
        // does not need a microphone or a permission prompt.
        let aborted = false, live = null;
        window.SpeechRecognition = function () {
          live = this;
          this.start = () => {}; this.stop = () => {}; this.abort = () => { aborted = true; };
        };
        const ta = document.getElementById('iq-composer-input');
        ta.value = '';
        IQVoice.start('iq-composer-input', {});
        const listening = IQVoice.isListening('iq-composer-input');
        // The session ends because of something else entirely — an unrelated read.
        MemberApp._sessionEnded();
        // …and only then does the recogniser deliver.
        /* READ IT AT THE MOMENT IT WOULD BE WRITTEN. The first version waited 200ms and read the
           textarea afterwards, and the mutation that removes the guard did NOT turn it red --
           something between the write and the read put the box back. Measured directly with the
           guard removed, the late result really does land ("a late sentence"), so the assertion
           was testing the wrong instant rather than the wrong law. */
        let afterResult = ta.value;
        if (live && live.onresult) {
          live.onresult({ resultIndex: 0, results: [Object.assign(
            [{ transcript: 'a late sentence' }], { isFinal: true, length: 1 })] });
          afterResult = ta.value;
        }
        return { listening, aborted, text: afterResult, handler: !!(live && live.onresult),
                 stillListening: IQVoice.isListening('iq-composer-input') };
      });
      ok('LR-S5 an ended session cancels a live microphone', res.listening === true && res.stillListening === false);
      // The handler must EXIST, or this would pass against a recogniser that was never wired --
      // an empty fixture proving nothing about what a real late result would do.
      ok('LR-S6 …and a transcript that arrives afterwards is not inserted',
        res.handler === true && !/late sentence/.test(res.text));
      await ctx.close();
    }

    /* ══ PHASE C — WHAT THE CAPABILITY PANEL ACTUALLY RENDERS ═══════════════════════════════
       Five states of "is the model writing these replies", driven through the real panel in a
       real browser. Four of them used to render identically, because the row read the host flag
       alone and the reason line read a field that did not exist in the payload. The assertions
       below read the rendered text, not the payload: the defect was entirely in the gap between
       the two, so a test that checked the JSON would have passed throughout.

       `_renderRealCapabilities` is called directly rather than through the Settings nav, because
       #settings-features is in the document at every route and the panel is the unit under test.
       It is the real production function writing into the real node. */
    console.log('\n  PHASE C — THE FIVE STATES OF THE COMPOSER, AS RENDERED');
    {
      const HEALTH = (composer, extra = {}) => ({ body: Object.assign({
        ok: true, ai: { enabled: true, claude: true, openai: false }, voice: false, readsFiles: true,
        composer, time: new Date().toISOString(),
        build: { commit: 'abc1234', commitShort: 'abc1234', startedAt: new Date().toISOString(),
          startId: 'hz1', assetStamp: 'unknown' },
        readiness: { process: true, storesLoaded: true, ready: true, durableStore: true },
      }, extra) });

      // What a person actually sees: the label, whether it reads ON or OFF, and the reason under it.
      const readPanel = page => page.evaluate(async () => {
        await _renderRealCapabilities();
        const box = document.getElementById('settings-features');
        const flat = d => (d.innerText || '').replace(/\s+/g, ' ').trim();
        const rows = [...box.querySelectorAll('div')].map(flat).filter(t => /^(ON|OFF) /.test(t));
        return { text: box.innerText || '', rows, banners: box.querySelectorAll('.iq-read-failed').length };
      });
      /* NEVER READ A MISSING ROW AS A PASSING ONE. Every negative assertion below ("no reason is
         printed", "is never rendered as a missing key") is satisfied for free by the empty string,
         so a broken selector would have reported the whole phase green against nothing at all —
         which is exactly what the first version of this did. The row must be FOUND to be judged. */
      const NO_ROW = '<<the row was not rendered>>';
      const modelRow = p => p.rows.find(t => /Conversation written by the model/.test(t)) || NO_ROW;

      const plan = {};
      const { page, ctx } = await openApp(plan);

      /* C1 — enabled and writable. */
      plan['/api/health'] = HEALTH({ on: true, effective: true, why: null, deterministicOnly: false,
        providerKey: true, providerReachable: true, providerFaultAt: null,
        writes: 'on — the model writes the reply and the deterministic core grounds it' });
      const p1 = await readPanel(page);
      ok('LR-C0 the panel renders its four capability rows (an empty panel satisfies every negative assertion below for free)',
        p1.rows.length === 4 && modelRow(p1) !== NO_ROW);
      ok('LR-C1 composer enabled and writable renders ON for "written by the model"',
        /^ON /.test(modelRow(p1)) && /Conversation written by the model/.test(modelRow(p1)));
      ok('LR-C1b …with no reason printed beneath it, because there is nothing to act on',
        /^ON /.test(modelRow(p1))
        && !/is not writing|no language-model key|deterministic-only|provider/i.test(modelRow(p1)));

      /* C2 — the switch on, the writes off. THE ORIGINAL DEFECT: this payload rendered ON. */
      plan['/api/health'] = HEALTH({ on: true, effective: false, why: 'no language-model key is configured',
        deterministicOnly: false, providerKey: false, providerReachable: true, providerFaultAt: null,
        writes: 'off — no language-model key is configured; every reply is written by the deterministic templates' });
      const p2 = await readPanel(page);
      ok('LR-C2 the host switch being ON does not make the model row say ON — the defect the review found',
        p2.rows.length === 4 && /^OFF /.test(modelRow(p2)));
      ok('LR-C2b …while the host switch keeps its OWN row, which is still honestly ON',
        /^ON /.test(p2.rows.find(r => /composer surface/.test(r)) || NO_ROW));

      /* C3 — no model key. The reason must be the server's, not the client's fallback. */
      ok('LR-C3 no model key prints the SERVER’S reason, the one a person can act on',
        /^OFF /.test(modelRow(p2)) && /no language-model key is configured/.test(modelRow(p2)));

      /* C4 — deterministic-only, WITH a key present. Previously indistinguishable from C3: the
         panel printed "No language-model key is configured" at a customer who had deliberately
         forbidden egress and may have to prove it. */
      plan['/api/health'] = HEALTH({ on: true, effective: false,
        why: 'deterministic-only mode is on — no model is called', deterministicOnly: true,
        providerKey: true, providerReachable: true, providerFaultAt: null,
        writes: 'off — deterministic-only mode is on — no model is called; every reply is written by the deterministic templates' });
      const p4 = await readPanel(page);
      ok('LR-C4 deterministic-only mode is named on screen as its own cause',
        /^OFF /.test(modelRow(p4)) && /deterministic-only/.test(modelRow(p4)));
      ok('LR-C4b …and is never rendered as a missing key, which is the opposite diagnosis',
        /^OFF /.test(modelRow(p4)) && !/key is configured/.test(modelRow(p4)));

      /* C5 — provider unavailable. Every switch green, the provider refusing. */
      plan['/api/health'] = HEALTH({ on: true, effective: false,
        why: 'the language-model provider rejected the configured key', deterministicOnly: false,
        providerKey: true, providerReachable: false, providerFaultAt: new Date().toISOString(),
        writes: 'off — the language-model provider rejected the configured key; every reply is written by the deterministic templates' });
      const p5 = await readPanel(page);
      ok('LR-C5 a provider that refuses is named on screen, though the flag, the key and egress are all green',
        /^OFF /.test(modelRow(p5)) && /provider/.test(modelRow(p5)));
      ok('LR-C5b …and the four distinct payloads produce four distinguishable readings, not one',
        ![p1, p2, p4, p5].some(p => modelRow(p) === NO_ROW)
        && new Set([modelRow(p1), modelRow(p2), modelRow(p4), modelRow(p5)]).size === 4);

      /* ── THE PANEL'S OWN READ. It reports on the system; it must not be the part that fails
         silently. Each outcome is a different sentence and a different available action. ── */
      console.log('\n  PHASE C — AND WHEN THE PANEL ITSELF CANNOT READ');
      plan['/api/health'] = 'offline';
      const off = await readPanel(page);
      ok('LR-C6 a request that never reaches the server says so, and offers a retry',
        off.banners === 1 && /could not be reached/i.test(off.text) && /Try again/.test(off.text));

      plan['/api/health'] = { status: 200, contentType: 'text/plain', body: 'not json at all' };
      const mal = await readPanel(page);
      ok('LR-C7 a 200 that is not a record says the reply could not be read — never an empty panel',
        mal.banners === 1 && /could not read the reply/i.test(mal.text));

      plan['/api/health'] = 401;
      const auth = await readPanel(page);
      ok('LR-C8 a 401 is reported as an ended session, not as "could not check"',
        auth.banners === 1 && /session has ended/i.test(auth.text) && /Sign in/.test(auth.text));
      ok('LR-C8b …and it offers signing in rather than a retry that cannot work',
        !/Try again/.test(auth.text));

      /* NO DUPLICATE BANNERS. The failure banner is written OVER the panel; three failed reads in
         a row must leave one, not three, and must not leave a stale row list above them. */
      plan['/api/health'] = 'offline';
      await readPanel(page); await readPanel(page);
      const thrice = await readPanel(page);
      ok('LR-C9 three failed reads in a row leave exactly ONE banner',
        thrice.banners === 1);
      ok('LR-C9b …and no stale capability rows underneath it, which would be the old answer shown as the current one',
        thrice.rows.length === 0);

      /* RETRY. The control on the banner is the real one a person taps. */
      plan['/api/health'] = HEALTH({ on: true, effective: true, why: null, deterministicOnly: false,
        providerKey: true, providerReachable: true, providerFaultAt: null,
        writes: 'on — the model writes the reply and the deterministic core grounds it' });
      const retried = await page.evaluate(async () => {
        const box = document.getElementById('settings-features');
        const btn = [...box.querySelectorAll('button')].find(b => /Try again/.test(b.innerText || ''));
        if (!btn) return { clicked: false };
        btn.click();
        await new Promise(r => setTimeout(r, 800));
        return { clicked: true, text: box.innerText || '',
          banners: box.querySelectorAll('.iq-read-failed').length };
      });
      ok('LR-C10 tapping the retry on the banner re-reads and renders the real panel',
        retried.clicked === true && retried.banners === 0
        && /Conversation written by the model/.test(retried.text));

      /* ── THE READ IS BOUNDED THROUGH THE BODY ─────────────────────────────────────────────
         Against the code as it was, this hangs for ever: the timer was cleared when the headers
         arrived, and res.json() then awaited bytes that never came with nothing left to abort it.
         The race below is the assertion — a read that does not come back loses it. ── */
      console.log('\n  PHASE C — A BODY THAT STOPS MID-TRANSFER IS STILL BOUNDED');
      const stalled = await page.evaluate(async () => {
        const started = Date.now();
        const r = await Promise.race([
          MemberApp._read('/__harness/stalled-body', { timeoutMs: 1200 }),
          new Promise(res => setTimeout(() => res({ NEVER_CAME_BACK: true }), 8000)),
        ]);
        return { r, ms: Date.now() - started };
      });
      ok('LR-C11 a reply whose HEADERS arrive and whose BODY never completes still comes back',
        !stalled.r.NEVER_CAME_BACK);
      ok('LR-C11b …bounded by the timeout the caller asked for, not by the caller giving up',
        stalled.ms < 6000);
      ok('LR-C11c …reported as a TIMEOUT, because the server sent nothing yet rather than nonsense',
        stalled.r.ok === false && stalled.r.reason === 'timeout');

      await ctx.close();
    }

    /* ══ PHASE 1 — THE PHONE CAN SAY WHICH BUILD IT IS RUNNING ══════════════════════════════
       The first pass closed by admitting stale assets could not be ruled out. These drive the
       real comparison in a real browser: the client reads the stamp it actually loaded, asks the
       server which one it is serving, and says so where a person can read it. */
    console.log('\n  PHASE 1 — BUILD IDENTITY, VISIBLE WITHOUT DEVTOOLS');
    {
      const { page, ctx } = await openApp();
      const same = await page.evaluate(async () => {
        const st = await _checkBuildIdentity();
        return { client: st.clientStamp, server: st.serverStamp, commit: st.commit, stale: st.stale };
      });
      ok('LR-B1 the client reports the stamp it actually loaded, not "unknown"',
        /^[0-9a-z]+$/.test(same.client) && same.client !== 'unknown');
      ok('LR-B2 …the server reports the same one when nothing is stale',
        same.server === same.client && same.stale === false);
      ok('LR-B3 …and a real commit comes back, so a person can compare it with the PR head',
        /^[0-9a-f]{7}$/.test(same.commit));

      /* THE STALE CASE. The server is made to report a different stamp -- exactly what an old
         cached shell talking to a newer server looks like. */
      await page.route('**/api/health', async route => {
        const res = await route.fetch();
        const j = await res.json();
        j.build = { ...(j.build || {}), assetStamp: 'DIFFERENT' };
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(j) });
      });
      const stale = await page.evaluate(async () => {
        const st = await _checkBuildIdentity();
        const shown = await _announceStaleBuild();
        const bar = document.getElementById('iq-stale-build');
        return { stale: st.stale, shown, text: bar ? bar.innerText : '',
                 buttons: bar ? bar.querySelectorAll('button').length : 0 };
      });
      ok('LR-B4 a device running older assets than the server is DETECTED', stale.stale === true);
      ok('LR-B5 …and told so in plain words, with one way to fix it',
        /older version/i.test(stale.text) && stale.buttons === 1);
      /* Offered, not performed: a reload the product triggers by itself is how a reload loop
         starts, and the founder was already looking at a page that would not settle. */
      const url1 = page.url();
      await page.evaluate(() => _announceStaleBuild());
      await page.waitForTimeout(1200);
      ok('LR-B6 …offered once, and the page does not reload itself',
        page.url() === url1
        && (await page.evaluate(() => document.querySelectorAll('#iq-stale-build').length)) === 1);
      await ctx.close();
    }

    /* ══ 18 — AUDIENCE SPACING ══════════════════════════════════════════════════════════════ */
    console.log('\n  OBSERVATION 18 — AUDIENCE NAMES ARE NOT GLUED TO THEIR COUNTS');
    {
      const { page, ctx } = await openApp();
      const glued = await page.evaluate(() => {
        const s = document.body.innerHTML;
        return /[A-Za-z)]\(\d+ (person|people)\)/.test(s);
      });
      ok('LR-18 no audience renders as Name(1 person) with no space', !glued);
      await ctx.close();
    }

    /* ══ 20 — "EARLY THINKING" ══════════════════════════════════════════════════════════════ */
    console.log('\n  OBSERVATION 20 — NO UNEXPLAINED BAND LABEL');
    {
      const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'app.js'), 'utf8');
      /* The first version of this looked for the word "thinking" inside the title attribute, which
         says nothing about whether the badge is explained -- it only matched the phrasing I happened
         to write. What matters is that the label a person cannot interpret now carries, at the render
         site, an explanation of WHAT IT MEASURES, reachable by keyboard and by screen reader. */
      const bandSites = (src.match(/class="iq-inq-band iq-band-/g) || []).length;
      const explained = (src.match(/_confidenceWhy\(/g) || []).length;
      ok('LR-20 every confidence badge carries a plain-language explanation of what it measures',
        bandSites >= 2 && explained >= bandSites
        && /How sure IntelliQ is/.test(src) && /aria-label="\$\{esc\(sum\.standing\)\}/.test(src));
      ok('LR-20b …and it is reachable without a mouse',
        /class="iq-inq-band iq-band-\$\{esc\(sum\.band \|\| 'tentative'\)\}" tabindex="0"/.test(src));

      /* LR-20c — AND THE EXPLANATION IS NOT WRITTEN HERE. The first version of LR-20 was satisfied
         by a band→sentence lookup in the browser, which is what an independent review then found
         was asserting independence the kernel had specifically failed to establish. A map keyed on
         the band cannot be right, so its absence is the assertion. */
      /* COMMENTS ARE NOT CODE. The comment that replaced the table quotes the sentence the table
         used to print, because a fix whose reason is not written down gets undone — and a guard
         reading the raw file would see that quotation and call the defect present. */
      const CODE = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
      ok('LR-20c the browser holds no band-keyed table of confidence sentences',
        !/_CONFIDENCE_WHY\s*=/.test(CODE)
        && !/several separate accounts point the same way/.test(CODE));
      ok('LR-20d …and the badge reads the explanation the SERVER composed',
        /standingWhy/.test(src));
    }

    /* ══ PHASE D — THE BADGE IN A REAL BROWSER ══════════════════════════════════════════════
       The card is rendered by the real _objectCard with the real projection shape, and the title
       and aria-label a person would actually get are read off the DOM. The band is held constant
       across two opposite evidence shapes, because the defect was precisely that the band decided
       the sentence: if the band still decides it, these two read the same. */
    console.log('\n  PHASE D — THE CONFIDENCE BADGE SAYS WHAT THE EVIDENCE IS');
    {
      const { page, ctx } = await openApp();
      const present = require('../ai/present.js');
      const diagnose = require('../ai/diagnose.js');
      const SIG = o => Object.assign({ kind: 'observation', status: 'active', at: Date.now(),
        directness: 'direct', authority: 'corroborated', specificity: 0.7 }, o);
      // Same band, opposite evidence: three reports of unestablished origin, versus two
      // established independent ones. Both land on `supported`.
      const unknownOrigin = ['a', 'b', 'c'].map((s, n) => SIG({ source: s, turnId: 't' + n }));
      const independent = [SIG({ source: 'a', originRef: 'o1', turnId: 't1' }),
        SIG({ source: 'b', originRef: 'o2', turnId: 't2' })];
      const cardFor = signals => present.inquiryCard({
        topic: { canonicalConcept: 'football.press_shape', label: 'Press shape' },
        hypothesis: 'The press keeps forcing us backwards',
        confidence: diagnose.deriveConfidence(signals),
      });
      const a = cardFor(unknownOrigin), b = cardFor(independent);
      ok('LR-D0 both fixtures land on the SAME band, so the band cannot be what distinguishes them',
        a.summary.band === 'supported' && b.summary.band === 'supported');

      const read = card => page.evaluate(p => {
        const html = MemberApp._objectCard({ kind: 'inquiry', id: 'i1', present: p }, 'inquiry');
        const host = document.createElement('div');
        host.innerHTML = html;
        const badge = host.querySelector('.iq-inq-band');
        return badge ? { title: badge.getAttribute('title') || '', aria: badge.getAttribute('aria-label') || '' } : null;
      }, card);
      const ra = await read(a), rb = await read(b);
      ok('LR-D1 the badge is rendered with an explanation a person can read',
        !!ra && ra.title.length > 10 && !!rb && rb.title.length > 10);
      ok('LR-D2 reports of UNESTABLISHED origin never claim separate accounts — the review’s finding',
        !!ra && !/separate accounts/.test(ra.title)
        && /where it came from has not been established/.test(ra.title));
      ok('LR-D3 …while two genuinely independent origins DO say so, at the same band',
        !!rb && /separate accounts point the same way/.test(rb.title));
      ok('LR-D4 so two opposite evidence shapes at ONE band read differently on screen',
        !!ra && !!rb && ra.title !== rb.title);
      ok('LR-D5 …and a screen reader is told the same thing as the tooltip, not less',
        !!ra && ra.aria.includes(ra.title) && !!rb && rb.aria.includes(rb.title));
      await ctx.close();
    }
  } catch (e) { fail++; console.error('  FAIL repro suite threw:', e && e.stack); }

  await browser.close();
  server.close();
  console.log(`\nlive-recovery-repro: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
