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
    }
  } catch (e) { fail++; console.error('  FAIL repro suite threw:', e && e.stack); }

  await browser.close();
  server.close();
  console.log(`\nlive-recovery-repro: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
