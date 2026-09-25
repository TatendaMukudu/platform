/* BROWSER CHECK — READING ALOUD, IN A REAL BROWSER, IN EVERY STATE A PERSON CAN BE IN.

   NOT part of `npm test`: the truth layer is hermetic and must run with no browser binary.
   voice-input-smoke drives js/voice-output.js against a stubbed speechSynthesis, which proves the
   state machine; it says nothing about whether the control is REACHABLE on a rendered reply, at
   phone width, from the markup the app actually produces.

   That distinction is the whole reason this engagement exists. The previous read-aloud defect was
   not a wrong state — it was a control that did nothing when tapped, and no hermetic assertion
   can see the difference between that and a control nobody can reach.

   Five states, four of them driven by tapping a real button:

     supported     the control is drawn on a rendered reply and starts
     stopped       pressing it again stops it, and the row says so
     interrupted   a second reply takes over, and the first row says THAT
     failed        the engine throws, and the row offers a retry
     unsupported   a browser with no speechSynthesis gets the reason, not a dead button

   THE ENGINE IS STUBBED, THE PAGE IS NOT. Headless Chromium has `speechSynthesis` and usually no
   voices, so a real `speak()` may never fire `onstart` and the test would be measuring the
   container's audio stack rather than the product. The stub is installed in the page before the
   app loads, so everything above it — the markup, the delegation, the live region, the tap target
   — is the real thing.

   Run: node scripts/voice-output-browser-check.js
   Needs: playwright-core (devDependency) and the Chromium at EXE below. */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const { chromium } = require('playwright-core');
const { chromiumPath } = require('./lib/chromium-path.js');
/* One owner for "which browser" — this was a hard-coded build path. See
   scripts/lib/chromium-path.js for why resolving it per-file kept going wrong. */
const EXE = chromiumPath(chromium);
const IPHONE = { width: 390, height: 844 };   // the founder's device class

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

const C = 'vob';
const NOW = Date.now(), DAY = 86400000;
const SPEECH_A = 'The first approved answer. This rests on 2 sources, shown under the reply.';
const SPEECH_B = 'The second approved answer. This rests on 1 source, shown under the reply.';

_loadAllStores({
  orgMeta:  { [C]: { orgName: 'Alma College', orgMode: 'sports', organizationProfileComplete: true } },
  orgUsers: { [C]: { ash: { id: 'ash', name: 'Ashton Mbeki', email: 'a@x.io', role: 'member',
    orgCode: C, status: 'active', assignedNodeIds: [], profileComplete: true } } },
  orgNodes: { [C]: {} },
  /* TWO ASSISTANT REPLIES, EACH WITH ITS OWN APPROVED RENDERING. Two is the number: with one row
     there is no interruption to observe, and "a newer reply took over" is the state most likely
     to be wrong because it is the only one that spans two controls. */
  assistantConversations: { [`${C}:ash`]: [{
    id: 'conv_1', title: 'A conversation', createdAt: new Date(NOW - DAY).toISOString(),
    updatedAt: new Date(NOW).toISOString(),
    messages: [
      { id: 'm1', role: 'user', text: 'first question', at: new Date(NOW - 600).toISOString() },
      { id: 'm2', role: 'assistant', text: 'The first approved answer.', at: new Date(NOW - 500).toISOString(),
        speech: SPEECH_A, sources: [{ kind: 'record', label: 'Something you told me', detail: 'a' },
          { kind: 'belief', label: 'What I am working out', detail: 'b' }] },
      { id: 'm3', role: 'user', text: 'second question', at: new Date(NOW - 400).toISOString() },
      { id: 'm4', role: 'assistant', text: 'The second approved answer.', at: new Date(NOW - 300).toISOString(),
        speech: SPEECH_B, sources: [{ kind: 'record', label: 'Something else', detail: 'c' }] },
    ],
  }] },
});
_rebuildEmailIndex();

/* THE STUB, installed before the app loads. It records what it was asked to say and lets the test
   decide whether the engine works — which is the one thing a headless container cannot be trusted
   to have. `__iqSpeech` is the page-side record the assertions read. */
const STUB = `
  window.__iqSpeech = { spoken: [], cancels: 0, mode: 'ok' };
  /* defineProperty, NOT assignment. \`window.speechSynthesis\` is a read-only accessor in Chromium,
     so \`window.speechSynthesis = {...}\` fails SILENTLY in sloppy mode and the native object stays
     — which is how the first version of this file ended up calling the real engine with a fake
     utterance and reading the resulting throw as a product defect. */
  Object.defineProperty(window, 'SpeechSynthesisUtterance', {
    configurable: true, writable: true, value: function (t) { this.text = t; },
  });
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: {
      cancel: function () { window.__iqSpeech.cancels++; },
      speak: function (u) {
        if (window.__iqSpeech.mode === 'throw') throw new Error('engine refused');
        window.__iqSpeech.spoken.push(u.text);
        window.__iqSpeech.last = u;
        if (window.__iqSpeech.mode === 'ok' && typeof u.onstart === 'function') u.onstart();
      },
    },
  });
`;

/* THE SAME ENGINE, WITH A WORKING PAUSE. Everything else is identical, so any difference in
   section G below is the product's pause path and nothing about the harness. `paused` is a real
   readable property here because that is what the product interrogates before it is willing to
   say the word "Paused" to anybody. */
/* AND AN ENGINE THAT ACCEPTS `pause()` AND CARRIES ON TALKING. This is the case the product's
   fail-safe was actually written for, and it is not the same as an engine with no pause at all:
   here the call succeeds, nothing throws, and only `paused` tells the truth. Without this stub a
   mutation that says "Paused" without ever asking survives, because section B's engine throws
   before it can lie and section G's engine really does pause. */
const STUB_DEAF_PAUSE = STUB + `
  (function () {
    var ss = window.speechSynthesis;
    Object.defineProperty(ss, 'paused', { configurable: true, get: function () { return false; } });
    ss.pause = function () { window.__iqSpeech.pauses = (window.__iqSpeech.pauses || 0) + 1; };
    ss.resume = function () {};
  })();
`;

/* AND ONE THAT PAUSES BUT WILL NOT RESUME. The mirror of the case above, and the same law:
   a control reading "Reading aloud…" over silence is the same lie as one reading "Paused" over
   sound. Here the product must get the reading going again rather than relabel a dead control. */
const STUB_STUCK_RESUME = STUB + `
  (function () {
    var ss = window.speechSynthesis;
    var isPaused = false;
    Object.defineProperty(ss, 'paused', { configurable: true, get: function () { return isPaused; } });
    ss.pause = function () { isPaused = true; };
    ss.resume = function () { window.__iqSpeech.resumes = (window.__iqSpeech.resumes || 0) + 1; };
    var origCancel = ss.cancel;
    ss.cancel = function () { isPaused = false; origCancel.call(ss); };
  })();
`;

const STUB_PAUSE = STUB + `
  (function () {
    var ss = window.speechSynthesis;
    var isPaused = false;
    Object.defineProperty(ss, 'paused', { configurable: true, get: function () { return isPaused; } });
    ss.pause = function () { isPaused = true; window.__iqSpeech.pauses = (window.__iqSpeech.pauses || 0) + 1; };
    ss.resume = function () { isPaused = false; window.__iqSpeech.resumes = (window.__iqSpeech.resumes || 0) + 1; };
    var origCancel = ss.cancel;
    ss.cancel = function () { isPaused = false; origCancel.call(ss); };
  })();
`;

(async () => {
  const server = await new Promise(res => { const s = app.listen(0, () => res(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = issueToken('ash', C, 'member');
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const HARNESS_ONLY = [/^Chart is not defined$/];
  const pageErrors = [];

  const openAs = async (extraInit) => {
    const ctx = await browser.newContext({ viewport: IPHONE, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    page.on('pageerror', e => { if (!HARNESS_ONLY.some(rx => rx.test(e.message))) pageErrors.push(e.message); });
    await page.addInitScript(([t, code]) => {
      localStorage.setItem('iq_auth', JSON.stringify({
        user: { id: 'ash', name: 'Ashton Mbeki', role: 'member', orgCode: code, profileComplete: true },
        org: { orgName: 'Alma College', orgMode: 'sports', organizationProfileComplete: true },
        token: t, permissions: {}, domain: null }));
      localStorage.setItem('iq_profile_complete_ash', '1');
    }, [token, C]);
    if (extraInit) await page.addInitScript(extraInit);
    await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1400);
    const notice = await page.$('button:has-text("I understand")');
    if (notice) { await notice.click().catch(() => {}); await page.waitForTimeout(400); }
    return { ctx, page };
  };

  /* THE CONVERSATION, RESTORED THE WAY THE APP RESTORES IT. `_restoreChat` is what a person's
     own session does when they come back to Home with a thread in memory — the same renderer,
     the same action rows, the same `speech` off the stored message. It refuses to run over a
     thread that already has children, so the box is cleared first exactly as a fresh open would
     leave it. */
  const openThread = async (page) => {
    await page.evaluate(() => {
      const box = document.getElementById('iq-conversation');
      if (box) box.innerHTML = '';
      MemberApp._rememberChat('conv_1');
      return MemberApp._restoreChat();
    });
    await page.waitForTimeout(900);
  };

  try {
    console.log('\n  A — SUPPORTED: THE CONTROL IS DRAWN ON A RENDERED REPLY AND IT STARTS');
    const { page } = await openAs(STUB);
    await openThread(page);
    const buttons = await page.$$('.iq-act-voice');
    ok('VOB-A0 the conversation rendered its replies with a read-aloud control on each — an empty thread satisfies every negative assertion below for free',
      buttons.length === 2);
    if (buttons.length === 2) {
      const box = await buttons[0].boundingBox();
      /* THE ACTION ROW'S TARGET IS 36px, which is the row's own long-standing size (copy, useful,
         not useful, sources) and below the 44px the rest of this product uses for primary
         controls. Changing it is a product decision about that whole row, not about voice, so
         what is asserted here is that the voice control is NOT WORSE THAN ITS SIBLINGS — a
         regression in this one control would be invisible to a rule that only checked 44. The
         36px row itself is recorded in the report as an open observation rather than silently
         normalised by a test written to match it. */
      const sibling = await page.evaluate(() => {
        const r = document.querySelector('.iq-msg-acts');
        const other = r.querySelector('.iq-act:not(.iq-act-voice)');
        const b = r.querySelector('.iq-act-voice');
        const ob = other.getBoundingClientRect(), vb = b.getBoundingClientRect();
        return { other: { w: ob.width, h: ob.height }, voice: { w: vb.width, h: vb.height } };
      });
      ok('VOB-A0b …as a real tap target, no smaller than the other controls in the same row',
        !!box && box.height >= 36 && box.width >= 36
        && sibling.voice.h >= sibling.other.h && sibling.voice.w >= sibling.other.w);

      await buttons[0].click();
      await page.waitForTimeout(200);
      const spoken = await page.evaluate(() => window.__iqSpeech.spoken.slice());
      ok('VOB-A1 tapping it speaks the SERVER\'S approved rendering, verbatim — the browser composed nothing',
        spoken.length === 1 && spoken[0] === `${SPEECH_A}`);
      const s1 = await buttons[0].getAttribute('data-voice-state');
      const said1 = await page.evaluate(() =>
        document.querySelectorAll('.iq-msg-acts .iq-act-said')[0].textContent);
      ok('VOB-A2 …and the row says it is speaking, in the live region beside the control',
        s1 === 'speaking' && /reading aloud/i.test(said1));

      console.log('\n  B — AN ENGINE THAT CANNOT PAUSE FALLS BACK TO STOPPING, AND SAYS STOPPED');
      /* THIS STUB HAS NO `pause`, WHICH IS THE POINT OF IT. The control is Play/Pause now, and
         `speechSynthesis.pause()` is not honoured everywhere — some engines have no pause at all,
         others accept the call and keep talking. On those, a button reading "Paused" over audio
         the person can still hear is a lie they can hear. So the engine is asked afterwards
         whether it actually paused, and when it did not, this is what must happen: a real stop,
         reported as a stop. Section G proves the other half on an engine that can. */
      await buttons[0].click();
      await page.waitForTimeout(200);
      const s2 = await buttons[0].getAttribute('data-voice-state');
      const said2 = await page.evaluate(() =>
        document.querySelectorAll('.iq-msg-acts .iq-act-said')[0].textContent);
      ok('VOB-B1 the state is stopped and the person is told',
        s2 === 'stopped' && /stopped/i.test(said2));
      ok('VOB-B1c …and it never claims a pause this engine could not give it',
        s2 !== 'paused' && !/paused/i.test(said2));
      ok('VOB-B1b …and the engine was actually cancelled, not merely relabelled',
        (await page.evaluate(() => window.__iqSpeech.cancels)) > 0);

      console.log('\n  C — INTERRUPTED: A SECOND REPLY TAKES OVER, AND THE FIRST ROW SAYS THAT');
      await buttons[0].click();                      // start the first again
      await page.waitForTimeout(150);
      await buttons[1].click();                      // and let the second take over
      await page.waitForTimeout(200);
      const states = await page.evaluate(() =>
        [...document.querySelectorAll('.iq-act-voice')].map(b => b.getAttribute('data-voice-state')));
      const saids = await page.evaluate(() =>
        [...document.querySelectorAll('.iq-msg-acts .iq-act-said')].map(e => e.textContent));
      ok('VOB-C1 the first row is INTERRUPTED, not left announcing that it is still reading',
        states[0] === 'interrupted' && /newer reply took over/i.test(saids[0]));
      ok('VOB-C2 …and the second is the one speaking, with its own approved rendering',
        states[1] === 'speaking'
        && (await page.evaluate(() => window.__iqSpeech.spoken.slice(-1)[0])) === `${SPEECH_B}`);

      console.log('\n  D — FAILED: THE ENGINE REFUSES, AND THE ROW OFFERS A RETRY');
      await page.evaluate(() => { window.__iqSpeech.mode = 'throw'; });
      await buttons[0].click();
      await page.waitForTimeout(200);
      const s4 = await buttons[0].getAttribute('data-voice-state');
      const said4 = await page.evaluate(() =>
        document.querySelectorAll('.iq-msg-acts .iq-act-said')[0].textContent);
      ok('VOB-D1 a failure is announced rather than swallowed into something that looks like success',
        s4 === 'error' && /failed/i.test(said4));
      ok('VOB-D1b …with a retry the person can act on, in words',
        /press again|try again|retry/i.test(said4));
      await page.evaluate(() => { window.__iqSpeech.mode = 'ok'; });
      await buttons[0].click();
      await page.waitForTimeout(200);
      ok('VOB-D2 …and pressing again after a failure actually works, so the retry is not a suggestion',
        (await buttons[0].getAttribute('data-voice-state')) === 'speaking');

      /* ══ D2 — A NEW ANSWER, WHICH IS NOT THE SAME EVENT AS A SECOND BUTTON ═════════════════
         Section C proves that pressing a different row's control takes over. An independent gate
         was right that this is a DIFFERENT event from the one the founder's defect describes:
         somebody asks a second question while the first reply is still being spoken, touching no
         control at all, and the old answer finishes over the new one on screen — two answers at
         once, and the one they are looking at is not the one they can hear.

         Until now that case was pinned by a regex over js/app.js. This drives the real renderer:
         `_renderAssistant` is the method every reply goes through, called here with the shape the
         route returns, while an utterance is genuinely live. */
      console.log('\n  D2 — A NEW ANSWER ARRIVING STOPS THE OLD ONE, WITHOUT ANYBODY TOUCHING A CONTROL');
      /* D2 left this row SPEAKING, and pressing the control that is speaking is the stop control —
         so there is deliberately no click here. The point of the section is that nobody touches
         anything. */
      ok('VOB-D3pre a reply is genuinely being spoken before the new answer arrives',
        (await buttons[0].getAttribute('data-voice-state')) === 'speaking'
        && (await page.evaluate(() => !!window.IQVoiceOut.speaking())) === true);
      const cancelsBefore = await page.evaluate(() => window.__iqSpeech.cancels);
      await page.evaluate(() => {
        // The shape the turn route returns, rendered by the method every reply goes through.
        MemberApp._renderAssistant({ turnId: 't_new', response: {
          responseText: 'A completely different answer.', speech: 'A completely different answer.',
          mode: 'personal_assistance', composer: { degraded: false, reason: null },
          groundedClaims: [], inferred: [], limitations: [], proposedActions: [],
          primaryActions: [], moreActions: [], sources: [], cites: [],
        } });
      });
      await page.waitForTimeout(200);
      const afterNew = await page.evaluate(() => ({
        state: document.querySelectorAll('.iq-act-voice')[0].getAttribute('data-voice-state'),
        said: document.querySelectorAll('.iq-msg-acts .iq-act-said')[0].textContent,
        cancels: window.__iqSpeech.cancels,
        live: !!window.IQVoiceOut.speaking(),
      }));
      ok('VOB-D3 the row that was reading is told a newer reply took over, rather than left announcing that it is still going',
        afterNew.state === 'interrupted' && /newer reply took over/i.test(afterNew.said));
      ok('VOB-D3b …and the ENGINE was actually cancelled, so the old answer is not still audible over the new one',
        afterNew.cancels > cancelsBefore && afterNew.live === false);
    }

    console.log('\n  E — UNSUPPORTED: NO BUTTON AT ALL, AND THE REASON IN ITS PLACE');
    /* A REAL DEVICE CLASS, not a contrivance: browsers differ on speech synthesis, and the
       failure this replaces was a control that did nothing when tapped. */
    const { page: p2 } = await openAs(`
      Object.defineProperty(window, 'speechSynthesis', { value: undefined, configurable: true });
      Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: undefined, configurable: true });
    `);
    await openThread(p2);
    ok('VOB-E0 the same conversation still renders its replies, so the absence below is about the control and not the thread',
      (await p2.$$('.iq-msg-acts')).length >= 2);
    ok('VOB-E1 no read-aloud button is drawn at all',
      (await p2.$$('.iq-act-voice')).length === 0);
    const note = await p2.evaluate(() => {
      const el = document.querySelector('[data-voice="unsupported"]');
      return el ? el.textContent.trim() : null;
    });
    ok('VOB-E2 …and the person is told why, where the button would have been',
      !!note && /cannot read replies aloud/i.test(note));
    ok('VOB-E3 …and the Settings row agrees with the control, because both ask the same owner',
      (await p2.evaluate(() => !!(window.IQVoiceOut && window.IQVoiceOut.isSupported() === false))) === true);

    console.log('\n  G — PLAY, PAUSE, AND CARRY ON FROM THE SAME PLACE');
    /* THE RATIFIED CONTROL. It drew a SPEAKER and pressing it while reading CANCELLED, so one
       glyph meant both "start" and "throw away where you were", and the only way back into a long
       answer was the top of it. A triangle when idle, a pause bar while playing, and resume. */
    {
      const { page: gp } = await openAs(STUB_PAUSE);
      await openThread(gp);
      const b0 = (await gp.$$('.iq-act-voice'))[0];
      const shape = async () => gp.evaluate(() => {
        const b = document.querySelector('.iq-act-voice');
        return { state: b.getAttribute('data-voice-state'), title: b.getAttribute('title'),
          label: b.getAttribute('aria-label'),
          rects: b.querySelectorAll('rect').length, paths: b.querySelectorAll('path').length,
          said: (document.querySelector('.iq-msg-acts .iq-act-said') || {}).textContent || '' };
      });
      const idle = await shape();
      ok('VOB-G1 at rest it is a PLAY triangle, not a speaker',
        idle.state === 'idle' && idle.paths === 1 && idle.rects === 0 && /play/i.test(idle.title));
      await b0.click(); await gp.waitForTimeout(200);
      const playing = await shape();
      ok('VOB-G2 while it is reading, the control is a PAUSE bar and says so',
        playing.state === 'speaking' && playing.rects === 2 && /pause/i.test(playing.title)
        && /pause/i.test(playing.label));
      /* CANCELS BEFORE THE PRESS, so the claim below is about what THIS press did. Two cancels
         have already happened legitimately — one when the thread was restored, one that `speak`
         issues before starting — so a bound like "no more than one cancel in total" would have
         been asserting the harness's history rather than the product's behaviour. It failed for
         that reason, which is the assertion being wrong rather than the product. */
      const cancelsBefore = await gp.evaluate(() => window.__iqSpeech.cancels);
      await b0.click(); await gp.waitForTimeout(200);
      const paused = await shape();
      ok('VOB-G3 pressing it pauses rather than throwing the place away',
        paused.state === 'paused' && /paused/i.test(paused.said));
      /* PAUSED, NOT CANCELLED — the distinction the whole change is about. A cancel here would
         discard the position, which is exactly what the old control did. */
      ok('VOB-G3b …and the press paused the engine without cancelling it, which is what loses the place',
        (await gp.evaluate(() => window.__iqSpeech.pauses)) === 1
        && (await gp.evaluate(() => window.__iqSpeech.cancels)) === cancelsBefore);
      ok('VOB-G3c …and the icon goes back to PLAY, because that is what pressing it will do next',
        paused.rects === 0 && paused.paths === 1 && /resume/i.test(paused.title + paused.label));
      await b0.click(); await gp.waitForTimeout(200);
      const resumed = await shape();
      ok('VOB-G4 pressing it again carries on from the same place',
        resumed.state === 'speaking' && resumed.rects === 2);
      ok('VOB-G4b …by resuming the engine rather than starting the reading over',
        (await gp.evaluate(() => window.__iqSpeech.resumes)) === 1
        && (await gp.evaluate(() => window.__iqSpeech.spoken.length)) === 1);
    }

    console.log('\n  H — AN ENGINE THAT TAKES THE PAUSE AND KEEPS TALKING IS NOT CALLED PAUSED');
    /* The honesty half of the control. Saying "Paused" over audio the person can still hear is a
       lie they can hear, and it is the specific way a pause feature goes wrong in the field. */
    {
      const { page: hp } = await openAs(STUB_DEAF_PAUSE);
      await openThread(hp);
      const hb = (await hp.$$('.iq-act-voice'))[0];
      await hb.click(); await hp.waitForTimeout(200);
      ok('VOB-H1 it is reading', (await hb.getAttribute('data-voice-state')) === 'speaking');
      await hb.click(); await hp.waitForTimeout(200);
      const st = await hb.getAttribute('data-voice-state');
      const said = await hp.evaluate(() =>
        (document.querySelector('.iq-msg-acts .iq-act-said') || {}).textContent || '');
      ok('VOB-H2 the engine was asked to pause', (await hp.evaluate(() => window.__iqSpeech.pauses)) === 1);
      ok('VOB-H3 …and because it did not, the control does NOT claim it paused',
        st !== 'paused' && !/paused/i.test(said));
      ok('VOB-H4 …it stops for real and says stopped, so what is on screen matches what is audible',
        st === 'stopped' && /stopped/i.test(said));
    }

    console.log('\n  H2 — AND ONE THAT WILL NOT RESUME GETS THE READING GOING AGAIN, NOT A DEAD LABEL');
    {
      const { page: ip } = await openAs(STUB_STUCK_RESUME);
      await openThread(ip);
      const ib = (await ip.$$('.iq-act-voice'))[0];
      await ib.click(); await ip.waitForTimeout(180);            // play
      await ib.click(); await ip.waitForTimeout(180);            // pause (this engine can)
      ok('VOB-H2a it paused', (await ib.getAttribute('data-voice-state')) === 'paused');
      const spokenBefore = await ip.evaluate(() => window.__iqSpeech.spoken.length);
      await ib.click(); await ip.waitForTimeout(250);            // resume, which this engine ignores
      const st2 = await ib.getAttribute('data-voice-state');
      ok('VOB-H2b the engine was asked to resume', (await ip.evaluate(() => window.__iqSpeech.resumes)) === 1);
      /* IT SAYS IT IS READING ONLY IF IT IS. Since this engine will not carry on from where it
         was, the honest recovery is to read it again — so there must be a NEW utterance behind
         the label, not just the label. */
      ok('VOB-H2c …and because it would not, the reading is actually started again rather than relabelled',
        (st2 === 'speaking' || st2 === 'starting')
        && (await ip.evaluate(() => window.__iqSpeech.spoken.length)) === spokenBefore + 1);
    }

    console.log('\n  F — NO PAGE ERRORS ALONG THE WAY');
    ok(`VOB-F1 the whole walk raised no uncaught error (${pageErrors.length})`, pageErrors.length === 0);
    if (pageErrors.length) pageErrors.forEach(e => console.error('        ' + e));

  } catch (e) { fail++; console.error('  FAIL voice-output browser check threw:', e && e.stack); }

  await browser.close();
  server.close();
  console.log(`\nvoice-output-browser-check: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
