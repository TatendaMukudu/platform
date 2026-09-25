/* BROWSER CHECK — THE BOX YOU TYPE IN IS ON THE SCREEN, AND THE INVITATION IN IT IS WHOLE.

   TWO LIVE iPHONE BLOCKERS, and they are the same surface seen from two ends.

   FINDINGS R1 #22 — "the Focus conversation composer is effectively off-screen after long
   responses". Driven here at 390x844 against a real Focus with two dozen turns, the composer
   measured `top: 7203` in an 844px viewport on a 7431px page. Not buried. Absent. The cause was
   not a missing rule: it carried `position:sticky;bottom:0`, and sticky resolves against the
   nearest ANCESTOR SCROLL CONTAINER — `main.page-content`, which has `overflow:auto` while its
   height grows with its content and the document scrolls on `body`. A scrollport with no scroll
   range never engages a sticky element, so the rule was inert on the object thread and in the
   Forum room alike.

   FINDINGS R1 #12 — the placeholder cut off on Highs, Lows, the Library and a Focuses surface.
   Measured, the copy was not the cause: the composer row is 342px at 390px and the text field got
   176px of it, because attach, mic and send are each a 44px tap target and 44px is the floor a
   thumb needs. About twenty characters fit.

   WHAT THIS FILE IS FOR, beyond the two fixes. A placeholder is the easiest thing in a product to
   lengthen by one kind word, and the damage is invisible to whoever writes it — they are not on a
   phone. So the fit is MEASURED: the drawn width of the actual string against the field's own
   content box, at the two widths the founder holds. A gate, not a note.

   AND IT ASSERTS WHY IT FITS. A field that fits everything because it is enormous and a field
   that fits because the copy was cut to six words are different products, so the share of the row
   the writing gets is asserted too.

   NOT part of `npm test`: the truth layer is hermetic and must run with no browser binary. Where
   a thing IS on a screen is not a fact source can answer.

   Run: node scripts/composer-fit-browser-check.js
   Needs: playwright-core (devDependency) and the Chromium at EXE below. */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
process.env.IQ_COMPOSER = '1';

const { chromium } = require('playwright-core');
const { chromiumPath } = require('./lib/chromium-path.js');
const EXE = chromiumPath(chromium);
const WIDTHS = [390, 430];

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, assistantConversations } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

const C = 'cfb', NOW = Date.now(), DAY = 86400000;
_loadAllStores({
  orgMeta: { [C]: { orgName: 'Alma College', orgMode: 'sports', organizationProfileComplete: true } },
  orgUsers: { [C]: { me: { id: 'me', name: 'A Player', email: 'm@cf.io', role: 'member', orgCode: C,
    status: 'active', assignedNodeIds: ['n1'], profileComplete: true } } },
  orgNodes: { [C]: { n1: { nodeId: 'n1', name: 'First Team', memberIds: ['me'], leaderIds: [] } } },
  userAiProfiles: { [`${C}:me`]: { focuses: [{ id: 'foc_long', text: 'Concede fewer late goals',
    status: 'active', visibility: 'only_me', createdAt: new Date(NOW - 3 * DAY).toISOString() }] } },
});
_rebuildEmailIndex();

/* A THREAD LONG ENOUGH TO PUSH THE COMPOSER OFF THE BOTTOM, which is the whole of #22. Two dozen
   turns with real paragraphs in them, not two — the defect only appears once the page is taller
   than the viewport, and a short fixture would pass on a broken build. */
const LONG = 'This is the kind of answer that arrives after a real question: several sentences, each '
  + 'of them saying something, and together long enough that the screen fills. ';
const msgs = [];
for (let i = 0; i < 24; i++) {
  msgs.push({ role: i % 2 ? 'assistant' : 'user', id: 'm_' + i,
    at: new Date(NOW - (24 - i) * 60000).toISOString(),
    text: i % 2 ? LONG.repeat(3) : 'And what about the last ten minutes?' });
}
assistantConversations[`${C}:me`] = [{ id: 'c_long', title: 'Late goals', about: 'focus:foc_long',
  createdAt: new Date(NOW - DAY).toISOString(), updatedAt: new Date().toISOString(), messages: msgs }];

/* Every surface that renders a composer and that the founder named. `library` and `notes` are two
   routes onto the Library, and both were in the report. */
const PAGES = ['home', 'high', 'low', 'inquiry', 'focus', 'notes', 'library'];

(async () => {
  const server = await new Promise(res => { const s = app.listen(0, () => res(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = issueToken('me', C, 'member');
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const pageErrors = [];

  /* MEASURE THE DRAWN TEXT, not the character count. A placeholder is not clipped at some number
     of letters — it is clipped when the glyphs the browser actually draws, in the font the
     composer actually uses, are wider than the field's content box. Anything else is a guess
     about typography made in a test file. */
  const measure = (page) => page.evaluate(() => {
    const ta = document.querySelector('.iq-composer-wrap textarea');
    if (!ta) return { none: true };
    const cs = getComputedStyle(ta);
    const box = ta.getBoundingClientRect();
    const inner = box.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth);
    const m = document.createElement('span');
    m.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font:${cs.font};letter-spacing:${cs.letterSpacing}`;
    m.textContent = ta.getAttribute('placeholder') || '';
    document.body.appendChild(m);
    const textW = m.getBoundingClientRect().width;
    m.remove();
    const row = ta.closest('.iq-composer');
    const vis = sel => { const el = row.querySelector(sel);
      return !!el && el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none'; };
    return { text: ta.getAttribute('placeholder') || '', inner, textW,
      rowW: row.getBoundingClientRect().width, rowH: row.getBoundingClientRect().height,
      mic: vis('.iq-mic'), send: vis('.iq-send'), attach: vis('.iq-attach') };
  });

  try {
    for (const width of WIDTHS) {
      console.log(`\n  AT ${width}px`);
      const ctx = await browser.newContext({ viewport: { width, height: 844 },
        deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      const page = await ctx.newPage();
      page.on('pageerror', e => pageErrors.push(`${width}: ${e.message}`));
      await page.addInitScript(([t, code]) => {
        localStorage.setItem('iq_auth', JSON.stringify({
          user: { id: 'me', name: 'A Player', role: 'member', orgCode: code, profileComplete: true },
          org: { orgName: 'Alma College', orgMode: 'sports', organizationProfileComplete: true },
          token: t, permissions: {}, domain: null }));
        localStorage.setItem('iq_profile_complete_me', '1');
      }, [token, C]);
      await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
      const notice = await page.$('button:has-text("I understand")');
      if (notice) { await notice.click().catch(() => {}); await page.waitForTimeout(400); }

      /* ── A — THE INVITATION FITS, ON EVERY SURFACE THAT HAS ONE ─────────────────────────── */
      const clipped = [], narrow = [];
      for (const dest of PAGES) {
        await page.evaluate(d => { try { navigate(d); } catch (_) {} }, dest);
        await page.waitForTimeout(1000);
        const m = await measure(page);
        if (m.none) { clipped.push(`${dest}: no composer`); continue; }
        if (m.textW > m.inner) clipped.push(`${dest}: "${m.text}" ${Math.round(m.textW - m.inner)}px over`);
        // AND NOT BY BEING A SLIVER. The field must still be most of the bar.
        if (m.inner / m.rowW < 0.55) narrow.push(`${dest}: ${Math.round(100 * m.inner / m.rowW)}%`);
      }
      ok(`CF-${width}-A1 every composer invitation is drawn whole: ${clipped.length ? clipped.join('; ') : 'all fit'}`,
        clipped.length === 0);
      ok(`CF-${width}-A2 …and it fits because the field is most of the bar, not because the copy was cut to nothing: ${narrow.length ? narrow.join('; ') : 'all wide'}`,
        narrow.length === 0);

      /* ── B — ONE CONTROL ON THE RIGHT, AND IT IS THE RIGHT ONE ──────────────────────────── */
      await page.evaluate(() => { try { navigate('home'); } catch (_) {} });
      await page.waitForTimeout(1100);
      const empty = await measure(page);
      ok(`CF-${width}-B1 an empty composer offers the microphone and no send button, because there is nothing to send`,
        empty.mic === true && empty.send === false);
      ok(`CF-${width}-B2 …and attaching is still offered either way`, empty.attach === true);
      /* ONE SHORT LINE FIRST, because the height question and the swap question need different
         inputs. A sentence long enough to wrap grows the field legitimately, so comparing the bar
         empty against the bar holding a wrapped sentence measures the auto-grow rather than the
         control swap — the first version of this did exactly that and reported a failure that was
         not there. */
      await page.fill('#iq-composer-input', 'One line');
      await page.waitForTimeout(300);
      const short = await measure(page);
      /* AND THE BAR DOES NOT MOVE WHEN THEY SWAP. The text field's own minimum is below both
         controls, so the row's height was taken from whichever one was showing — 44px for the
         microphone, 40px for the send button — and the composer lost four pixels on the first
         keystroke and got them back on send. Small, and exactly the kind of movement that makes a
         box feel unsteady under a thumb. */
      ok(`CF-${width}-B6 …and the bar is the same height empty as it is with a line in it`,
        Math.abs(empty.rowH - short.rowH) <= 1);
      await page.fill('#iq-composer-input', 'We conceded again in the last ten minutes.');
      await page.waitForTimeout(350);
      const typed = await measure(page);
      ok(`CF-${width}-B3 typing swaps them: send appears, the microphone stands down`,
        typed.send === true && typed.mic === false);
      /* AND THE SWAP IS NOT COSMETIC. A send button that appears and does nothing would satisfy
         everything above; this presses it and looks for the words in the conversation. */
      await page.click('#iq-shell-composer .iq-send');
      await page.waitForTimeout(2600);
      const landed = await page.evaluate(() => {
        const c = document.getElementById('iq-conversation');
        return !!(c && /last ten minutes/i.test(c.innerText || ''));
      });
      ok(`CF-${width}-B4 …and pressing it actually sends the turn`, landed === true);
      const cleared = await measure(page);
      ok(`CF-${width}-B5 …after which the box is empty again and the microphone is back`,
        cleared.mic === true && cleared.send === false);

      /* ── C — AND ON A LONG THREAD IT IS ON THE SCREEN AT ALL ────────────────────────────── */
      await page.evaluate(() => MemberApp.openObjectThread('focus', 'foc_long'));
      await page.waitForTimeout(2400);
      const thread = await page.evaluate(() => {
        const wraps = [...document.querySelectorAll('.iq-composer-wrap')]
          .filter(w => w.getClientRects().length > 0);
        const w = document.querySelector('.iq-object-thread .iq-composer-wrap');
        if (!w) return { none: true, count: wraps.length };
        const r = w.getBoundingClientRect();
        return { none: false, count: wraps.length, top: r.top, bottom: r.bottom, h: r.height,
          vh: window.innerHeight, docH: document.documentElement.scrollHeight, scrollY: window.scrollY,
          position: getComputedStyle(w).position,
          onScreen: r.top < window.innerHeight && r.bottom > 0 };
      });
      ok(`CF-${width}-C1 the thread is genuinely long, or this proves nothing`,
        !thread.none && thread.docH > thread.vh * 3);
      ok(`CF-${width}-C2 …and the composer is on the screen without scrolling a single pixel`,
        thread.onScreen === true && thread.scrollY === 0);
      ok(`CF-${width}-C3 …sitting on the bottom edge rather than somewhere in the middle`,
        Math.abs(thread.bottom - thread.vh) <= 2);
      /* EXACTLY ONE. Two composers on one screen is the costliest ambiguity this product can
         produce, because the difference between them is who reads what you type. */
      ok(`CF-${width}-C4 …and it is the only composer on the screen`, thread.count === 1);
      /* AND IT STAYS. A bar that is on screen at the top and gone at the bottom is the same bug
         with a different scroll position. */
      /* TO THE VERY END, INSTANTLY. Two things cost an hour here and are worth writing down.
         `html` carries `scroll-behavior: smooth`, so `window.scrollTo` ANIMATES and a position
         read straight afterwards is still zero — a scroll assertion can fail while the product is
         correct, and it did. And `scrollIntoView({block:'end'})` is the wrong instrument for this
         law in any case: it aligns the element's bottom with the VIEWPORT's bottom, which is
         underneath a fixed bar by definition, so it could never pass whatever the page reserved. */
      await page.evaluate(() => {
        window.scrollTo({ top: 10 ** 7, behavior: 'instant' });
        document.documentElement.scrollTop = 10 ** 7;
      });
      await page.waitForTimeout(600);
      const atEnd = await page.evaluate(() => {
        const w = document.querySelector('.iq-object-thread .iq-composer-wrap');
        const r = w.getBoundingClientRect();
        /* THE LAST THING IN THE FLOW, whatever it happens to be. An earlier version of this read
           the last message in `.iqt-turns`, which is not the bottom of the page — the related
           panel and the thread's own tail sit below it — so it measured something 380px short of
           the end and reported a failure that was not there. */
        const inFlow = [...document.querySelectorAll('.iq-object-thread > *')]
          .filter(el => !el.classList.contains('iq-composer-wrap') && el.getClientRects().length);
        const last = inFlow.length ? inFlow[inFlow.length - 1].getBoundingClientRect() : null;
        const main = document.querySelector('main.page-content');
        return { onScreen: r.top < window.innerHeight && r.bottom > 0,
          bottom: r.bottom, vh: window.innerHeight, h: r.height,
          reserved: main ? parseFloat(getComputedStyle(main).paddingBottom) : 0,
          atBottom: Math.abs(document.documentElement.scrollHeight
            - (document.documentElement.scrollTop + window.innerHeight)) <= 2,
          lastBottom: last ? last.bottom : null, composerTop: r.top };
      });
      ok(`CF-${width}-C5 …and is still there at the very bottom of the conversation`,
        atEnd.onScreen === true && Math.abs(atEnd.bottom - atEnd.vh) <= 2);
      /* AND NOTHING IS HIDDEN UNDERNEATH IT. A bar fixed over the last thing somebody said is how
         a reader concludes the conversation ended a paragraph earlier than it did. */
      /* AND NOTHING IS HIDDEN UNDERNEATH IT. A bar fixed over the last thing somebody said is how
         a reader concludes the conversation ended a paragraph earlier than it did. Asserted at
         the mechanism AND at the screen: the page reserves the bar's measured height, and at the
         very end of the scroll the last thing in the flow is above it. */
      ok(`CF-${width}-C6 …and the page reserves the bar's own measured height beneath its content`,
        atEnd.reserved >= atEnd.h);
      ok(`CF-${width}-C6b …so at the end of the scroll the last thing written is clear of it`,
        atEnd.atBottom === true
        && atEnd.lastBottom !== null && atEnd.lastBottom <= atEnd.composerTop + 1);
      const sideways = await page.evaluate(() =>
        document.documentElement.scrollWidth > window.innerWidth + 1);
      ok(`CF-${width}-C7 …and the page does not scroll sideways`, sideways === false);

      await ctx.close();
    }

    console.log('\n  NO PAGE ERRORS');
    ok(`CF-Z1 the whole walk raised no uncaught error (${pageErrors.length})`, pageErrors.length === 0);
    if (pageErrors.length) pageErrors.forEach(e => console.error('        ' + e));

  } catch (e) { fail++; console.error('  FAIL composer fit browser check threw:', e && e.stack); }

  await browser.close();
  server.close();
  console.log(`\ncomposer-fit-browser-check: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
