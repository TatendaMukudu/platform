/* BROWSER CHECK — WHICH SCREEN AM I ON, AND WHAT IS THAT CONTROL.

   Three defects found by driving the real app at 390px rather than reading it:

     THE BAR DID NOT FOLLOW THE SCREEN. `navigate()` names the PAGE, which is right until a page
       renders something else into itself — and four surfaces do. Opening a Forum from an inquiry
       left the bar reading "Inquiries" over a screen headed "Forum", so the product gave two
       answers to the one question a person asks without thinking.

     TWO UNLABELLED GLYPHS. The object page carried a tray and a pair of people, side by side, with
       their meaning available to a screen reader and to nobody else. Priority R&D P2 requires the
       product term Forum to be used consistently and the access point to be CLEAR, and an unnamed
       glyph is not a clear access point.

     FOUR NAMES FOR ONE PLACE. The nav said "Org tree", the bar said "Members", the heading said
       "Members", the only tab said "Org Tree" — and a person got there by tapping the one word
       that then appeared nowhere on the screen they landed on.

   Run: node scripts/naming-browser-check.js */

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

const C = 'nam', NOW = Date.now(), DAY = 86400000;
const SQUAD = ['p1', 'p2', 'p3', 'p4', 'p5'];
const SIG = (w, n) => ({ kind: 'observation', status: 'active', source: w, originRef: `o_${w}_${n}`,
  at: NOW - 9 * DAY, turnId: `t_${w}_${n}`, directness: 'direct', authority: 'corroborated',
  specificity: 0.7, ref: `ev_${w}_${n}`, contributedBy: w, text: 'we fade late' });

_loadAllStores({
  orgMeta: { [C]: { orgName: 'Alma College', orgMode: 'sports', organizationProfileComplete: true } },
  orgUsers: { [C]: Object.fromEntries([
    ...SQUAD.map((id, i) => [id, { id, name: `Player ${i + 1}`, email: `${id}@n.io`, role: 'member',
      orgCode: C, status: 'active', assignedNodeIds: ['n'], profileComplete: true }]),
    ['coach', { id: 'coach', name: 'Dana Coach', email: 'c@n.io', role: 'coach', orgCode: C,
      status: 'active', leadershipNodeIds: ['n'], assignedNodeIds: ['n'], profileComplete: true }],
  ]) },
  orgNodes: { [C]: { n: { nodeId: 'n', name: 'First Team', parentId: null, childNodeIds: [],
    memberIds: [...SQUAD, 'coach'], leaderIds: ['coach'] } } },
  inquiryStates: { [C]: { 'group:n': { q1: {
    inquiryId: 'q1', subjectRef: 'group:n',
    topic: { canonicalConcept: 'f.late', label: 'How the last twenty go' }, status: 'exploring',
    hypotheses: [{ id: 'h1', statement: 'the legs go in the last twenty',
      supportRefs: SQUAD.map((w, i) => `ev_${w}_${i}`), challengeRefs: [],
      confidence: { score: 0.7, band: 'probable' }, status: 'open', createdAt: NOW }],
    leadingHypothesisId: 'h1', signals: SQUAD.map((w, i) => SIG(w, i)),
    confidence: { score: 0.7, band: 'probable', because: ['5 independent origins'] },
    missingSignals: [{ question: 'does it happen away from home too?' }],
    falsifiers: [{ statement: 'we keep the ball when we start deeper' }],
    timeline: [], lastUpdatedAt: NOW,
  } } } },
  /* A FOCUS OF THE COACH'S OWN, so section E can compare two kinds rendered by the same owner. */
  userAiProfiles: { [`${C}:coach`]: { focuses: [{
    id: 'f_press', text: 'Press from the first touch', status: 'active',
    createdAt: new Date(NOW - 2 * DAY).toISOString(),
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
    await page.waitForTimeout(1700);
    const notice = await page.$('button:has-text("I understand")');
    if (notice) { await notice.click().catch(() => {}); await page.waitForTimeout(500); }
    return { ctx, page };
  };

  try {
    const { ctx, page } = await openAs('coach', 'coach', 'Dana Coach');
    const bar = () => page.evaluate(() =>
      ((document.querySelector('.topbar-title') || {}).textContent || '').trim());
    const go = async (fn) => { await page.evaluate(fn); await page.waitForTimeout(1300); };

    console.log('\n  A — THE BAR SAYS WHICH SCREEN YOU ARE ON');
    ok('NM-A1 Home says Home', (await bar()) === 'Home');
    await go(() => navigate('inquiry'));
    ok('NM-A2 the list of inquiries says Inquiries', (await bar()) === 'Inquiries');
    await go(() => MemberApp.openObjectThread('inquiry', 'q1', 'group:n'));
    /* THE KIND, NOT THE OBJECT. The heading already carries the object's own title; the bar adds
       which of the four things this is. */
    ok('NM-A3 one inquiry says Inquiry, not the bucket it came from', (await bar()) === 'Inquiry');
    await go(() => MemberApp.openForum('n', 'q1', 'group', 'inquiry'));
    ok('NM-A4 its Forum says Forum — this is the one that used to say "Inquiries"',
      (await bar()) === 'Forum');
    /* AND GOING BACK PUTS THE LIST'S NAME BACK, so returning does not leave the bar announcing
       something that is no longer on screen. */
    await go(() => MemberApp._renderBucketPage('inquiry'));
    ok('NM-A5 back to the list says Inquiries again', (await bar()) === 'Inquiries');

    console.log('\n  B — AND THE DOORS OFF AN OBJECT HAVE THEIR NAMES ON THEM');
    await go(() => MemberApp.openObjectThread('inquiry', 'q1', 'group:n'));
    const doors = page.locator('.iqt-doors .iqt-forum');
    ok('NM-B1 both doors are on a row of their own, out of the header', await doors.count() === 2);
    const forumDoor = page.locator('.iqt-doors .iqt-forum', { hasText: 'Forum' }).first();
    ok('NM-B2 the Forum door carries the product\'s own word, visibly',
      /\bForum\b/.test(await forumDoor.innerText()));
    /* WHO IS IN THE ROOM, BESIDE ITS NAME. A room exists because of who can read it. */
    ok('NM-B3 …and says how many people can read it', /\d+ can read this/i.test(await forumDoor.innerText()));
    ok('NM-B4 …as a real tap target at 390px, inside the screen',
      await (async () => { const b = await forumDoor.boundingBox();
        return !!b && b.height >= 44 && b.x >= 0 && (b.x + b.width) <= 390; })());
    const audDoor = page.locator('.iqt-doors .iqt-forum[onclick*="openAudience"]');
    ok('NM-B5 the audience door is named too, rather than being a second mystery glyph',
      await audDoor.count() === 1 && /who can see this/i.test(await audDoor.innerText()));
    /* AND NEITHER SHOUTS. A duplicate `.iqt-forum` rule styled this uppercase, so the doorway read
       as a section heading — which is exactly what the header note had warned a label would do. */
    ok('NM-B6 …and the labels are not uppercased into headings',
      (await forumDoor.evaluate(el => getComputedStyle(el).textTransform)) === 'none');
    /* THE ROOM STILL OPENS. A label is worth nothing if the door stopped working. */
    await forumDoor.click();
    await page.waitForTimeout(1400);
    ok('NM-B7 …and tapping Forum actually opens the Forum',
      (await bar()) === 'Forum'
      && /Forum/.test(await page.evaluate(() =>
        ((document.querySelector('.iqt-title') || {}).textContent || ''))));

    console.log('\n  C — AND ONE PLACE HAS ONE NAME');
    await go(() => navigate('people'));
    const names = await page.evaluate(() => ({
      bar: ((document.querySelector('.topbar-title') || {}).textContent || '').trim(),
      head: ((document.querySelector('#page-people .section-title') || {}).textContent || '').trim(),
      body: (document.querySelector('#page-people') || {}).innerText || '',
    }));
    ok('NM-C1 the bar and the heading agree', names.bar === 'Org tree' && names.head === 'Org tree');
    ok('NM-C2 …and it is the same word the person tapped in the menu',
      await page.evaluate(async () => {
        MemberApp.navToggle();
        await new Promise(r => setTimeout(r, 400));
        const it = [...document.querySelectorAll('.iq-nav-item')]
          .find(b => /org tree/i.test(b.textContent || ''));
        const t = it ? it.textContent.trim() : '';
        MemberApp.navClose();
        return t === 'Org tree';
      }));
    ok('NM-C3 …and the old name is nowhere on the screen',
      !/\bMembers\b/.test(names.body));
    /* A TAB STRIP WITH ONE TAB IN IT IS A CONTROL WITH NOTHING TO SWITCH TO. */
    const strip = await page.evaluate(() => {
      const el = document.getElementById('people-tabs');
      if (!el) return { present: false };
      const vis = [...el.querySelectorAll('.tab-btn')].filter(b => b.offsetParent !== null).length;
      return { present: true, shown: el.offsetParent !== null, tabs: vis };
    });
    ok('NM-C4 the tab strip is shown only when there is somewhere else to go',
      strip.present && (strip.shown ? strip.tabs > 1 : true));

    console.log('\n  D — AND A FAILURE READS LIKE A SENTENCE, NOT LIKE AN API');
    /* `_readFailedHTML` renders "${message} Nothing has been lost.", and the message came straight
       off the server's `error` field — so a 404 reached the screen as "not found Nothing has been
       lost.". Lower case, no punctuation, an API fragment as the first thing a person reads. */
    await go(() => MemberApp.openObjectThread('inquiry', 'no_such_object_at_all', 'group:n'));
    const failed = await page.evaluate(() =>
      ((document.querySelector('.iq-read-failed') || {}).innerText || '').trim());
    ok('NM-D0 opening something that is not there says so', failed.length > 0);
    ok('NM-D0b …in a sentence, starting with a capital and ending in a full stop',
      /^[A-Z]/.test(failed) && /\.\s*$/.test(failed.split('\n')[0].trim()));
    ok('NM-D0c …and never shows the server\'s own error code as prose',
      !/not found/i.test(failed));
    ok('NM-D0d …while still offering a way out rather than a dead end',
      /try again/i.test(failed) || /back to/i.test(failed));

    console.log('\n  E — AND THE OBJECT KINDS DIFFER IN INFORMATION, NOT IN MECHANICS');
    /* P2: "The object kinds should differ in INFORMATION, not in basic interaction mechanics."
       `openObjectThread` is the single renderer for all four, so the grammar cannot diverge by
       kind — this walks two of them to show the skeleton really is the same one on screen.

       HIGH AND LOW ARE NOT SEEDED HERE, and that is deliberate rather than an omission: they are
       kernel-derived projections, not store rows, so a fixture that hand-built one would be
       asserting the renderer against a state the kernel would never produce — the empty-fixture
       lie this repository keeps finding in its own tests. They travel through the same
       `openObjectThread`, which is what makes the shared grammar structural rather than a
       coincidence of two fixtures. */
    const skeleton = () => page.evaluate(() => {
      const root = document.querySelector('.iq-object-thread');
      if (!root) return null;
      return {
        back: !!root.querySelector('.iqt-back'),
        title: ((root.querySelector('.iqt-title') || {}).textContent || '').trim(),
        composer: !!document.querySelector('#iq-object-input, .iq-composer textarea, #iq-composer-input'),
        bar: ((document.querySelector('.topbar-title') || {}).textContent || '').trim(),
      };
    });
    await go(() => MemberApp.openObjectThread('inquiry', 'q1', 'group:n'));
    const inq = await skeleton();
    await go(() => MemberApp.openObjectThread('focus', 'f_press'));
    const foc = await skeleton();
    ok('NM-E1 both kinds render the same page shell', !!inq && !!foc);
    ok('NM-E2 …each with a way back, its own title, and one composer',
      !!inq && !!foc && inq.back && foc.back && inq.composer && foc.composer
      && inq.title.length > 0 && foc.title.length > 0);
    ok('NM-E3 …and the bar names the kind, which is the one thing that should differ',
      inq.bar === 'Inquiry' && foc.bar === 'Focus');
    ok('NM-E4 …and they are genuinely different objects, not the same screen twice',
      inq.title !== foc.title);

    console.log('\n  F — AND YOUR OTHER CHATS ARE ONE TAP AWAY (Priority R&D P1)');
    /* P1 asks that a person can answer, without thinking: where are my other chats, which one am I
       in, and how do I start fresh without losing this one. The drawer is the answer, so it has to
       actually list them — the fixture above has no conversations, and a "Recent" heading over an
       empty box satisfies a careless assertion for the wrong reason. This makes two real ones
       through the ordinary turn route first. */
    for (const t of ['What is going on with the last twenty?', 'And what about the long throws?']) {
      await page.evaluate(async ([text, base]) => {
        const tok = JSON.parse(localStorage.getItem('iq_auth')).token;
        await fetch('/api/assistant/turn', { method: 'POST',
          headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }) });
      }, [t, base]);
    }
    const recents = await page.evaluate(async () => {
      MemberApp.navToggle();
      await new Promise(r => setTimeout(r, 900));
      const box = document.getElementById('iq-nav-recents');
      const items = [...document.querySelectorAll('.iq-nav-recent')];
      const out = { count: items.length, labels: items.map(b => (b.textContent || '').trim()),
        empty: /no conversations yet/i.test((box || {}).innerText || ''),
        newChat: !!document.querySelector('.iq-nav-new'),
        newChatBox: null };
      const nb = document.querySelector('.iq-nav-new');
      if (nb) { const r = nb.getBoundingClientRect(); out.newChatBox = { h: r.height, right: r.right }; }
      MemberApp.navClose();
      return out;
    });
    ok('NM-F1 the menu lists the conversations this person actually has',
      recents.count >= 2 && !recents.empty);
    ok('NM-F2 …with human-readable titles rather than ids',
      recents.labels.every(l => l.length > 3 && !/^conv_/.test(l)));
    ok('NM-F3 …and a way to start a fresh one without losing them, as a real tap target',
      recents.newChat && recents.newChatBox.h >= 44 && recents.newChatBox.right <= 390);

    ok('NM-D1 none of that raised an uncaught client error', errors.length === 0);
    if (errors.length) errors.slice(0, 4).forEach(e => console.error('        ' + e));
    await ctx.close();
  } catch (e) { fail++; console.error('  FAIL naming browser check threw:', e && e.stack); }

  await browser.close();
  server.close();
  console.log(`\nnaming-browser-check: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
