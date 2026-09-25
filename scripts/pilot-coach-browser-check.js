/* BROWSER CHECK — THE SEPTEMBER 26 ALMA PILOT, WALKED BY A COACH ON A PHONE.

   NOT part of `npm test`: the truth layer is hermetic and must run with no browser binary. This
   is the other kind of evidence, and the founder's rule for this pass is why it exists:

     "The previous outcome bug survived because tests called the route correctly while the UI
      sent the wrong value. Do not repeat that mistake."

   So every consequential action below is driven by CLICKING THE RENDERED CONTROL, and each one is
   checked at four places: what the screen offered, what value the browser emitted, what the
   canonical store holds afterwards, and what the screen says next. An assertion against a route
   this file never taps proves nothing about the product a coach uses.

   THE TEN-SECOND TEST is the frame. A coach opening IntelliQ should understand, in about ten
   seconds: what is happening, what IntelliQ understands, what it does NOT understand, what we are
   working on, what happened with what we tried, and what deserves attention next. They should
   need to understand none of: inquiry internals, the evidence graph, object ids, how confidence
   is implemented, origin accounting, packets, cross-evidence, the Priority Office, or the
   internal ontology. This file asserts both halves — what must be on the screen, and what must
   not be.

   MODELS ARE OFF THROUGHOUT. Provider-down is the state the pilot runs in, so it is the state
   the walkthrough runs in. Nothing below is allowed to depend on a model being reachable.

   Run: node scripts/pilot-coach-browser-check.js
   Needs: playwright-core (devDependency) and the Chromium at EXE below. */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
process.env.IQ_DETERMINISTIC_ONLY = '1';

const { chromium } = require('playwright-core');
/* The browser gate installs Chromium through this exact Playwright package. Resolve that install
   instead of pinning an old runner path, while preserving CHROMIUM_PATH for local/alternate runs. */
const { chromiumPath } = require('./lib/chromium-path.js');
/* One owner for "which browser". Resolving `chromium.executablePath()` directly returns the
   build playwright-core was published against, which in this container does not exist — and a
   launch on a missing executable HANGS rather than failing, so the gate produced no output and
   looked like an environment without Chromium. See scripts/lib/chromium-path.js. */
const EXE = chromiumPath(chromium);
const IPHONE = { width: 390, height: 844 };   // the founder's device class

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

const DAY = 86400000, NOW = Date.now();
const C = 'pilot';
const SQUAD = Array.from({ length: 14 }, (_, i) => 'p' + (i + 1));

const users = {
  coach: { id: 'coach', name: 'Coach Reyes', email: 'c@alma.io', role: 'coach', orgCode: C,
    status: 'active', leadershipNodeIds: ['first'], assignedNodeIds: ['first'], profileComplete: true },
  // A coach of a DIFFERENT squad in the same organisation: every id resolves for them and only
  // the audience boundary stands between the two.
  other: { id: 'other', name: 'Reserves Coach', email: 'o@alma.io', role: 'coach', orgCode: C,
    status: 'active', leadershipNodeIds: ['res'], assignedNodeIds: ['res'], profileComplete: true },
  r1: { id: 'r1', name: 'Reserve One', email: 'r1@alma.io', role: 'member', orgCode: C,
    status: 'active', assignedNodeIds: ['res'], profileComplete: true },
  // A brand-new coach with nothing at all — the cold start the pilot actually begins at.
  fresh: { id: 'fresh', name: 'New Coach', email: 'n@alma.io', role: 'coach', orgCode: C,
    status: 'active', leadershipNodeIds: ['cold'], assignedNodeIds: ['cold'], profileComplete: true },
};
for (const id of SQUAD) users[id] = { id, name: 'Player ' + id.slice(1), email: id + '@alma.io',
  role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['first'], profileComplete: true };

/* FIVE INDEPENDENT ORIGINS on each inquiry. The two-sided cohort floor needs k >= 5 AND n-k >= 5,
   so a thinner fixture could only ever prove that the floor withholds — and every assertion below
   would pass against an empty screen for the wrong reason, which is the empty-fixture lie this
   project keeps finding in its own tests. */
const SIG = (source, originRef, at) => ({ kind: 'observation', status: 'active', source, originRef,
  at, turnId: `t_${source}`, directness: 'direct', authority: 'corroborated', specificity: 0.7,
  ref: `ev_${originRef}`, contributedBy: source });

const inq = (id, concept, label, hyps) => ({
  inquiryId: id, subjectRef: 'group:first',
  topic: { canonicalConcept: concept, label },
  status: 'exploring',
  hypotheses: hyps || [],
  leadingHypothesisId: (hyps && hyps[0] && hyps[0].id) || null,
  signals: Array.from({ length: 5 }, (_, i) => SIG('p' + (i + 1), `o_${id}_${i}`, NOW - (i + 1) * DAY)),
  confidence: { score: 0.7, band: 'supported', because: ['5 independent origins'],
    origin: { independentOrigins: 5, occasions: 5, signals: 5, contradictions: 0, retired: 0, unestablishedSources: 0 } },
  missingSignals: [], falsifiers: [{ statement: 'Talking stays the same after the next loss' }],
  timeline: [], lastUpdatedAt: NOW, alternatives: [],
});

_loadAllStores({
  orgMeta:  { [C]: { orgName: 'Alma College', orgMode: 'sports', organizationProfileComplete: true } },
  orgUsers: { [C]: users },
  orgNodes: { [C]: {
    first: { nodeId: 'first', name: 'First Team', parentId: null, childNodeIds: [],
      memberIds: [...SQUAD, 'coach'], leaderIds: ['coach'] },
    res:   { nodeId: 'res', name: 'Reserves', parentId: null, childNodeIds: [],
      memberIds: ['r1', 'other'], leaderIds: ['other'] },
    cold:  { nodeId: 'cold', name: 'New Squad', parentId: null, childNodeIds: [],
      memberIds: ['fresh'], leaderIds: ['fresh'] },
  } },
  /* FOUR live questions, because "a squad has more than three things going on" is the ordinary
     case and was the condition under which three of them had no object at all. One carries a
     human explanation somebody offered; one carries no human label, so its canonical key would
     be printed if anything on the way to the screen stopped asking present.humanTopic. */
  inquiryStates: { [C]: { 'group:first': {
    comms: inq('inq_comms', 'football.communication_after_result', 'Communication after results',
      [{ id: 'h1', statement: 'players are worried about criticising each other',
         confidence: { score: 0, band: 'tentative', because: ['nothing supports this yet'] },
         status: 'open', supportRefs: [], challengeRefs: [] }]),
    late:  inq('inq_late', 'football.late_game_shape', 'How the last twenty minutes go', []),
    keyed: inq('inq_keyed', 'football.attendance_timing', '', []),
    set:   inq('inq_set', 'football.set_piece_marking', 'Set-piece marking', []),
  } } },
});
_rebuildEmailIndex();

(async () => {
  const server = await new Promise(res => { const s = app.listen(0, () => res(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const tok = who => issueToken(who, C, who === 'coach' || who === 'other' || who === 'fresh' ? 'coach' : 'member');

  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });

  /* Chart.js is loaded from a CDN by index.html and this run has no network, so it fires on every
     page in the product, on this branch and on its base alike. Excluded BY NAME with its reason —
     a blanket filter would swallow the bugs this file exists to find. */
  /* ── THE EXCUSE LIST IS EMPTY, AND THAT IS THE ASSERTION ──────────────────────────────────
     This held `/^Chart is not defined$/`, called a harness artifact. It was not one. Chart.js
     arrives from a CDN and `js/charts.js` touched `Chart.defaults` at MODULE LOAD, so on any
     connection that could not fetch it — a filtered network, an installed app with no signal,
     this build environment — the assignment threw, the whole file stopped evaluating, every
     chart helper below it ceased to exist, and a pilot user got an uncaught error on every page
     load. Suppressing it here is why PC-F4 stayed green about a journey that really was throwing.

     `js/charts.js` now degrades honestly and says where the picture would have been, so nothing
     needs excusing. Keeping this list empty is what stops the next real error being renamed a
     harness artifact: an error on this journey fails the check, whatever it is. */
  const HARNESS_ONLY = [];

  const openAs = async (who, name) => {
    const ctx = await browser.newContext({ viewport: IPHONE, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on('pageerror', e => { if (!HARNESS_ONLY.some(rx => rx.test(e.message))) pageErrors.push(e.message); });
    const t = tok(who);
    await page.addInitScript(([token, code, id, nm]) => {
      localStorage.setItem('iq_auth', JSON.stringify({
        user: { id, name: nm, role: 'coach', orgCode: code, profileComplete: true },
        org: { orgName: 'Alma College', orgMode: 'sports', organizationProfileComplete: true },
        token, permissions: {}, domain: null }));
      localStorage.setItem(`iq_profile_complete_${id}`, '1');
    }, [t, C, who, name]);
    await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1600);
    const notice = await page.$('button:has-text("I understand")');
    if (notice) { await notice.click().catch(() => {}); await page.waitForTimeout(400); }
    await page.evaluate(() => navigate('home'));
    await page.waitForTimeout(2400);
    return { page, ctx, token: t, pageErrors };
  };

  const textOf = (page, sel) => page.evaluate(s => {
    const el = s ? document.querySelector(s) : document.body;
    return el ? (el.innerText || '').trim() : '';
  }, sel);

  const api = (page, token, m, u, b) => page.evaluate(async ([m, u, t, b]) => {
    const r = await fetch(u, { method: m, headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
      body: b === undefined ? undefined : JSON.stringify(b) });
    return { status: r.status, j: await r.json().catch(() => null) };
  }, [m, u, token, b]);

  /* EVERY REQUEST THE PAGE ACTUALLY SENDS, recorded. This is what makes the four-place check
     possible: the control's own emitted body, not a body this file composed and hoped matched. */
  const recordPosts = page => {
    const posts = [];
    page.on('request', r => {
      if (r.method() !== 'POST') return;
      let body = null;
      try { body = JSON.parse(r.postData() || 'null'); } catch (_) { body = r.postData(); }
      posts.push({ url: r.url().replace(base, ''), body });
    });
    return posts;
  };

  let coach;
  try {
    coach = await openAs('coach', 'Coach Reyes');
    const posts = recordPosts(coach.page);

    /* ══ A — THE TEN-SECOND TEST ══════════════════════════════════════════════════════════════ */
    console.log('\n  A — WHAT A COACH UNDERSTANDS IN TEN SECONDS');
    const home = await textOf(coach.page, null);
    ok('PC-A1 what is happening: the squad and the thing the squad noticed are both named',
      /First Team/.test(home) && /Communication after results/i.test(home));
    /* PC-A2 — THE SAME LAW, AFTER FINDINGS R1 #37 SPLIT THE STATE IT WAS MEASURING.
       This asserted that Home says "I don't have a read on this yet". On this fixture that
       sentence appeared DIRECTLY ABOVE "Someone suggested: ..." and "Nothing supports this yet"
       — the founder photographed exactly that on an Inquiry — so the screen denied having a
       candidate in the line above the candidate.

       There are three states, not two: nothing proposed, a candidate nobody supports, and an
       admitted read. What IntelliQ owes a reader here is that it has not concluded anything, and
       the suggestion line says that precisely. So the assertion is now that the screen carries
       the candidate WITHOUT the sentence denying it — both halves, because the absence alone
       would pass on a blank screen, and the genuine no-read state keeps its own proof at PC-N2. */
    ok('PC-A2 what IntelliQ understands: with a suggestion on the record it claims no read and does not deny the suggestion',
      /Someone suggested/i.test(home) && !/don't have a read on this yet/i.test(home));
    ok('PC-A3 what it does NOT understand: the open unknown is on the first screen, labelled as unknown',
      /STILL UNKNOWN|still unknown/i.test(home) && /nothing recorded supports it yet/i.test(home));
    ok('PC-A4 what someone thinks might explain it, marked as a suggestion rather than a finding',
      /Someone suggested/i.test(home) && /Nothing supports this yet/i.test(home));
    /* "What happened with what we tried" cannot be asserted here — nothing has been tried yet,
       and an assertion that passes because its subject does not exist is the vacuous kind this
       repository keeps catching in its own tests. It is checked at PC-D16, after the coach has
       actually recorded an outcome, against the same first screen. */

    console.log('\n  A2 — AND WHAT A COACH IS NEVER MADE TO UNDERSTAND');
    ok('PC-A6 no canonical concept key reaches the screen',
      !/football\.|\battendance_timing\b|canonicalConcept/.test(home));
    ok('PC-A7 no object id, ref or internal address',
      !/inq_|tf_|\binquiry:|low:inq|high:inq|focus:tf/.test(home));
    ok('PC-A8 no architecture vocabulary — packet, cross-evidence, priority office, origin accounting',
      !/packet|cross-evidence|priority office|independentOrigins|origin count|truth store/i.test(home));
    ok('PC-A9 no raw confidence enum or score',
      !/\btentative\b|\bsupported\b|\bemerging\b|score:|\b0\.\d\b/.test(home));
    ok('PC-A10 no causal claim anywhere on the first screen',
      !/because of this focus|the focus worked|caused by|proved|led to the improvement/i.test(home));

    /* ══ B — ONE JOURNEY, NO DEAD ENDS ═══════════════════════════════════════════════════════ */
    console.log('\n  B — HOME -> THE GROUP -> THE QUESTION, BY TAPPING');
    const card = await coach.page.$('.tstate-card');
    ok('PC-B1 the group card is on Home and is operable',
      !!card && await card.evaluate(el => el.getAttribute('role') === 'button' && !!el.getAttribute('onclick')));
    await card.click();
    await coach.page.waitForTimeout(1800);
    const group = await textOf(coach.page, '.iq-group-thread');
    ok('PC-B2 it opens the group rather than summarising it and leading nowhere', !!group);
    const rows = await coach.page.$$('.iqg-inq-row');
    ok('PC-B3 all four of the squad\'s questions are rendered, not just the ranked one',
      rows.length === 4);
    ok('PC-B4 …and the one with no human label is read out loud rather than printed as a key',
      /Attendance timing/i.test(group) && !/football\.attendance_timing/.test(group));
    const opener = await coach.page.$('.iqg-inq-open');
    ok('PC-B5 the question itself is a door', !!opener);
    const openBox = opener && await opener.boundingBox();
    ok('PC-B6 …and a thumb can hit it at 390px', !!openBox && openBox.height >= 44);
    await opener.click();
    await coach.page.waitForTimeout(2000);
    const thread = await textOf(coach.page, '.iq-object-thread');
    ok('PC-B7 tapping it opens that question\'s own screen', !!thread && thread.length > 80);
    ok('PC-B8 …which is not an error page, which is what three of the four used to give',
      !/could not be opened|not found|Nothing has been lost/i.test(thread));

    /* ══ C — THE QUESTION'S SCREEN READS AS A QUESTION ═══════════════════════════════════════ */
    console.log('\n  C — AN INQUIRY FEELS LIKE A QUESTION, NOT A DATABASE RECORD');
    ok('PC-C1 what we are seeing, in the group\'s own topic',
      /Communication after results/i.test(thread));
    ok('PC-C2 what it rests on, as independence rather than as a count of voices',
      /independent source|separate accounts|several people/i.test(thread));
    ok('PC-C3 what might explain it — offered as a suggestion, with what it rests on beside it',
      /Someone suggested it is because/i.test(thread) && /nothing on the record supports that yet/i.test(thread));
    /* AND THE QUESTION'S OWN SCREEN DOES NOT DENY IT EITHER, findings R1 #37. The lede fell back
       to the voice layer's no-read sentence whenever there was no ADMITTED read, which is true in
       two different states — nothing proposed, and something proposed that nobody supports. The
       second is this fixture, and the screen printed "I don't have a read on this yet" directly
       above the suggestion it did have. The line below it already states the state exactly. */
    ok('PC-C3b …and the screen does not deny having the suggestion in the line above it',
      !/don't have a read on this yet/i.test(thread));
    ok('PC-C4 what would show we have this wrong',
      /What would change my mind/i.test(thread));
    ok('PC-C5 what we still do not know',
      /nothing recorded supports it yet/i.test(thread));
    ok('PC-C6 and whether there is enough to try anything — said plainly when the answer is no',
      /Not enough evidence yet to suggest anything worth trying/i.test(thread));
    console.log('\n  C2 — AND NO SECTION EXISTS ONLY BECAUSE THE SCHEMA HAS ONE');
    ok('PC-C7 nothing has been tried yet, so there is no "what we have tried" heading',
      !/What we have tried about this/i.test(thread));
    ok('PC-C8 no apology for a chart nobody asked for',
      !/Nothing on the record to draw yet/i.test(thread));
    ok('PC-C9 no apology for outside reading this deployment never does',
      !/No outside reading here/i.test(thread));
    ok('PC-C10 no instruction manual for attachments — the control is there, the essay is not',
      !/Attach a deck, a document or a spreadsheet/i.test(thread));
    /* PC-C11 — THE LAW IS UNCHANGED AND THE DOOR MOVED, findings R1 #30. This asserted the words
       "Attach material", the page-level picker that used to sit under this screen's material
       list. The founder had that control removed, and the reasoning was that it was the WORSE of
       two doors to the same capability: it refused images and PDFs ("no text came out of that
       one") while the composer's paperclip beside it reads a picture through the vision gateway
       and binds the description to the same object.

       So what must still be true is what this assertion was always for — a capability with no
       door is a capability nobody has — and it is asserted at the door that exists. Read as a
       rendered, non-hidden control rather than as text, because this one is an icon. */
    const attachDoor = await coach.page.$$eval('.iq-attach',
      els => els.filter(el => !el.hidden && el.getClientRects().length > 0).length).catch(() => 0);
    ok('PC-C11 attaching is still reachable from this screen, because a capability with no door is a capability nobody has',
      attachDoor >= 1);
    ok('PC-C11b …and the door that was removed is genuinely gone rather than merely renamed',
      !/Attach material/i.test(thread));

    /* ══ D — THE COACH DECIDES, AND THE CONTROL EMITS WHAT THE SERVER RECORDS ════════════════ */
    console.log('\n  D — THE RENDERED CONTROL, THE EMITTED VALUE, THE STORE, AND THE SCREEN AFTER');
    await coach.page.evaluate(() => MemberApp.openGroupNode('first'));
    await coach.page.waitForTimeout(1800);
    const startBtns = await coach.page.$$('.iqg-inq-row button');
    const startBtn = (await Promise.all(startBtns.map(async b => ({ b, t: await b.evaluate(el => el.textContent) }))))
      .find(x => /Work on this as a group/i.test(x.t));
    ok('PC-D1 a leader is offered the control that starts something, in the group\'s own words',
      !!startBtn);
    await startBtn.b.click();
    await coach.page.waitForTimeout(500);
    await coach.page.fill('.iqg-start textarea', 'Player-led debrief after the next two matches');
    posts.length = 0;
    await coach.page.click('.iqg-start .btn-primary');
    await coach.page.waitForTimeout(1800);
    const focusPost = posts.find(p => /\/api\/group\/first\/focus$/.test(p.url));
    ok('PC-D2 the BROWSER sent the coach\'s own words, unchanged',
      !!focusPost && focusPost.body.text === 'Player-led debrief after the next two matches');
    ok('PC-D3 …and sent WHICH question it came out of, which is what makes the origin real',
      !!focusPost && focusPost.body.fromInquiryId === 'inq_comms');
    const st1 = await api(coach.page, coach.token, 'GET', '/api/group/first/state');
    const focusId = ((st1.j || {}).focus || {}).focusId;
    ok('PC-D4 the canonical store holds a focus with those words',
      !!focusId && st1.j.focus.text === 'Player-led debrief after the next two matches');
    ok('PC-D5 …recorded as having come OUT OF the inquiry, not out of a leader\'s hunch',
      st1.j.focus.origin && st1.j.focus.origin.from === 'inquiry'
      && st1.j.focus.origin.inquiryId === 'inq_comms');
    const afterSet = await textOf(coach.page, '.iq-group-thread');
    ok('PC-D6 and the screen comes back saying what the group is now working on',
      /Player-led debrief after the next two matches/.test(afterSet));

    console.log('\n  D2 — WHAT CAME OF IT, THE SAME FOUR WAYS');
    const outBtns = await coach.page.$$('.iqg-outcome-btns button');
    const labels = await Promise.all(outBtns.map(b => b.evaluate(el => el.textContent.trim())));
    ok('PC-D7 four outcome words are offered, including "it got worse"',
      outBtns.length === 4 && labels.some(l => /worse/i.test(l)));
    ok('PC-D8 …and "too tangled to tell", which is a first-class answer rather than a failure to answer',
      labels.some(l => /tangled/i.test(l)));
    ok('PC-D9 …every one a real tap target at 390px', await (async () => {
      for (const b of outBtns) { const bb = await b.boundingBox(); if (!bb || bb.height < 44) return false; }
      return true;
    })());
    const betterIdx = labels.findIndex(l => /got better/i.test(l));
    ok('PC-D10 the button a coach would press for good news says so in plain words', betterIdx >= 0);
    posts.length = 0;
    await outBtns[betterIdx].click();
    await coach.page.waitForTimeout(1800);
    const outPost = posts.find(p => /\/outcome$/.test(p.url));
    /* THE BUG THIS BLOCK EXISTS FOR. The screen said "It helped", the browser sent a word the
       group vocabulary does not contain, and the server coerced it to `unclear` — so every time a
       coach reported good news the record said "too tangled to tell". The route test passed
       throughout, because it sent the right word itself. */
    ok('PC-D11 pressing "It got better" makes the browser emit `better`, not a word the group vocabulary lacks',
      !!outPost && outPost.body.result === 'better');
    const st2 = await api(coach.page, coach.token, 'GET', '/api/group/first/state');
    ok('PC-D12 …and the canonical store records `better`, not `unclear`',
      (st2.j.history || []).some(f => f.focusId === focusId && f.outcome && f.outcome.result === 'better'));
    const afterOut = await textOf(coach.page, '.iq-group-thread');
    ok('PC-D13 …and the screen reads it back in the same words it offered',
      /It got better/i.test(afterOut));
    ok('PC-D14 …with a disclaimer of cause, on the screen that shows the outcome',
      /nothing here says a focus caused what followed|never a claim that the focus caused it/i.test(afterOut));
    ok('PC-D15 …and no causal claim anywhere on it',
      !/because of this focus|the focus worked|caused by|led to the improvement|proved/i.test(afterOut));

    /* AND THE FIFTH TEN-SECOND QUESTION, NOW THAT THERE IS AN ANSWER TO IT. Checked here rather
       than in section A because at that point nothing had been tried, and an assertion whose
       subject does not exist passes for the wrong reason. */
    await coach.page.evaluate(() => navigate('home'));
    await coach.page.waitForTimeout(2200);
    const homeAfter = await textOf(coach.page, null);
    ok('PC-D16 what happened with what we tried reaches the FIRST screen, in the group\'s own word',
      /Player-led debrief after the next two matches/.test(homeAfter) && /it got better/i.test(homeAfter));
    ok('PC-D17 …and the first screen still claims no cause for it',
      !/because of this focus|the focus worked|caused by|led to the improvement|proved/i.test(homeAfter));

    /* ══ E — BOTH ENDS TELL THE SAME STORY ══════════════════════════════════════════════════ */
    console.log('\n  E — THE QUESTION AND THE FOCUS AGREE ABOUT WHAT HAPPENED');
    await coach.page.evaluate(() => MemberApp.openObjectThread('inquiry', 'inq_comms', 'group:first'));
    await coach.page.waitForTimeout(2200);
    const qSide = await textOf(coach.page, '.iq-object-thread');
    ok('PC-E1 from the QUESTION: what was tried about it, and what came of it',
      /What we have tried about this/i.test(qSide)
      && /Player-led debrief after the next two matches/.test(qSide)
      && /after it: it got better/i.test(qSide));
    ok('PC-E2 …said once, not three times, now that the connections panel adds rather than repeats',
      (qSide.match(/Player-led debrief after the next two matches/g) || []).length === 1);
    ok('PC-E3 …and still claims no cause',
      /Nothing here says a focus caused what followed it/i.test(qSide));
    await coach.page.evaluate(id => MemberApp.openObjectThread('focus', id, 'group:first'), focusId);
    await coach.page.waitForTimeout(2200);
    const fSide = await textOf(coach.page, '.iq-object-thread');
    ok('PC-E4 from the FOCUS: what question it came out of',
      /Communication after results/i.test(fSide));
    ok('PC-E5 …and the same outcome word the question\'s screen used',
      /It got better/i.test(fSide));
    ok('PC-E6 …and what has been recorded since, which is the part only this end can say',
      /Recorded since/i.test(fSide));

    /* ══ F — MOBILE ═════════════════════════════════════════════════════════════════════════ */
    console.log('\n  F — AT 390px, WHICH IS WHERE THIS IS READ');
    ok('PC-F1 no horizontal scrolling anywhere on the journey', await coach.page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1));
    ok('PC-F2 the composer is reachable and is the last thing on the page',
      !!(await coach.page.$('.iq-object-thread textarea, .iq-object-thread input[type=text]')));
    ok('PC-F3 every verdict control is a real tap target', await (async () => {
      const vs = await coach.page.$$('.iqt-verdict');
      if (!vs.length) return false;
      for (const v of vs) { const bb = await v.boundingBox(); if (!bb || bb.height < 40) return false; }
      return true;
    })());
    if (coach.pageErrors.length) console.error('    page errors:', coach.pageErrors);
    ok('PC-F4 nothing on this journey threw in the browser', coach.pageErrors.length === 0);

    /* ══ G — WHO ELSE ═══════════════════════════════════════════════════════════════════════ */
    console.log('\n  G — THE SAME PRODUCT, AS SOMEBODY ELSE');
    const player = await openAs('p1', 'Player 1');
    const pHome = await textOf(player.page, null);
    ok('PC-G1 an ordinary player opens the app without an error',
      !!pHome && !/could not|error/i.test(pHome) && player.pageErrors.length === 0);
    ok('PC-G2 …and sees their squad',
      /First Team/.test(pHome));
    await player.page.evaluate(() => MemberApp.openGroupNode('first'));
    await player.page.waitForTimeout(1800);
    const pGroup = await textOf(player.page, '.iq-group-thread');
    ok('PC-G3 …can read what the group is working out',
      /Communication after results/i.test(pGroup));
    ok('PC-G4 …is offered the explanation door, because leading a group is not evidence about why something happens',
      /Suggest what might explain it/i.test(pGroup));
    ok('PC-G5 …and is NOT offered the leader-only control',
      !/Work on this as a group/i.test(pGroup));
    await player.ctx.close();

    const outsider = await openAs('other', 'Reserves Coach');
    const oHome = await textOf(outsider.page, null);
    ok('PC-G6 a coach of another squad in the same organisation sees their own squad',
      /Reserves/.test(oHome));
    ok('PC-G7 …and not one word of the first team\'s question or its explanation',
      !/Communication after results/i.test(oHome) && !/worried about criticising/i.test(oHome));
    const peek = await api(outsider.page, outsider.token, 'GET', '/api/objects?kind=inquiry&scope=group:first');
    ok('PC-G8 …and cannot reach the first team\'s objects by asking for them',
      peek.status === 403 || ((peek.j || {}).objects || []).length === 0);
    await outsider.ctx.close();

    /* ══ H — COLD START ═════════════════════════════════════════════════════════════════════ */
    console.log('\n  H — A COACH WHOSE SQUAD HAS SAID NOTHING YET');
    const fresh = await openAs('fresh', 'New Coach');
    const cold = await textOf(fresh.page, null);
    ok('PC-H1 the app opens and does not fail',
      !!cold && fresh.pageErrors.length === 0);
    ok('PC-H2 …and says what it does not have, rather than rendering a broken-looking blank',
      /Nothing has crossed the line into a group finding yet|No findings saved yet|nothing/i.test(cold));
    ok('PC-H3 …with no fabricated finding, question, explanation or outcome to fill the screen',
      !/Communication after results/i.test(cold) && !/It got better/i.test(cold)
      && !/Someone suggested/i.test(cold));
    ok('PC-H4 …and the composer is still there, which is how it stops being empty',
      !!(await fresh.page.$('#iq-composer-input')));
    await fresh.ctx.close();

    /* ══ J — VOICE, AS PART OF THE JOURNEY RATHER THAN AS A FEATURE ═════════════════════════
       Voice is already built and tested and is not redesigned here. What this checks is the part
       a pilot actually depends on: that it is present, that it degrades honestly where it is not
       available, that typing never stops working, and that a spoken sentence carries no more
       authority than a typed one — it lands in the same composer, goes through the same governed
       turn, and confirms the same way.

       Headless Chromium has no SpeechRecognition, which makes this the unsupported-browser case
       for free — the one a coach on an older phone will hit. */
    console.log('\n  J — VOICE IS A WAY IN, NOT A SECOND AUTHORITY');
    await coach.page.evaluate(() => navigate('home'));
    await coach.page.waitForTimeout(1800);
    const mic = await coach.page.$('#iq-mic');
    ok('PC-J1 the microphone is offered beside the composer, on the screen a coach lands on',
      !!mic);
    ok('PC-J2 …labelled for what it does, and announced as a control rather than a toggle with no state',
      !!mic && /speak instead of typing/i.test(await mic.evaluate(el => el.getAttribute('aria-label') || '')));
    const micBox = mic && await mic.boundingBox();
    ok('PC-J3 …and a thumb can hit it at 390px', !!micBox && micBox.height >= 36 && micBox.width >= 36);
    /* THE TWO WAYS VOICE CAN BE UNUSABLE, and a pilot hits both: a browser with no speech
       recognition at all, and one that has it and is refused the microphone. Headless Chromium
       reports support and is then denied permission, which is the SECOND case — the commoner one
       on a real phone, where a coach taps the mic and the permission sheet is dismissed. The
       assertion covers whichever this build produces rather than pinning one, because a check
       that only passes on the branch that happens to run is a check of the harness. */
    const supported = await coach.page.evaluate(
      () => !!(window.IQVoice && window.IQVoice.isSupported && window.IQVoice.isSupported()));
    await mic.click();
    await coach.page.waitForTimeout(700);
    const voiceState = await textOf(coach.page, '#iq-voice-state');
    ok('PC-J4 whichever way voice is unusable here, the product says which one it was',
      supported
        ? /microphone access was declined|no speech was picked up|could not hear/i.test(voiceState)
        : /not available in this browser/i.test(voiceState));
    ok('PC-J5 …and every one of those sentences ends by pointing at typing, which always works',
      /just type|typing works as normal|or type/i.test(voiceState));
    ok('PC-J6b …and it is announced, so a coach who cannot see the state line is still told',
      await coach.page.evaluate(() => {
        const el = document.getElementById('iq-voice-state');
        return !!el && el.getAttribute('role') === 'status' && !!el.getAttribute('aria-live');
      }));
    ok('PC-J6 …and nothing was recorded by tapping it — a microphone that cannot listen must not create anything',
      !posts.some(p => /assistant\/turn/.test(p.url) && p.body && /^$/.test(String(p.body.text || 'x'))));
    /* A TRANSCRIPT IS JUST TEXT IN THE BOX. That is the whole authority claim: voice fills the
       same field a thumb would, and everything after it is the path a typed sentence takes. */
    posts.length = 0;
    await coach.page.fill('#iq-composer-input', 'Talking dropped off again after Saturday');
    await coach.page.evaluate(() => MemberApp.wsSend());
    await coach.page.waitForTimeout(2200);
    const spoken = posts.find(p => /assistant\/turn/.test(p.url));
    ok('PC-J7 what lands in the composer goes through the ordinary governed turn',
      !!spoken && spoken.body.text === 'Talking dropped off again after Saturday');
    ok('PC-J8 …carrying no marker that would let a spoken sentence be treated as better evidence',
      !!spoken && !('voice' in spoken.body) && !('spoken' in spoken.body) && !('transcript' in spoken.body));
    ok('PC-J9 …and typing remained available throughout, which is the rule that makes voice optional',
      await coach.page.evaluate(() => {
        const t = document.getElementById('iq-composer-input');
        return !!t && !t.disabled && !t.readOnly;
      }));

    /* ══ J2 — THE THREAD YOU ARE IN IS THE SUBJECT, ON THE RENDERED SCREEN ═══════════════════
       LIVE iPHONE (findings R1 #43), which asks for this proof by name: "add browser proof that
       unrelated recent/team topics cannot hijack a personal Inquiry thread."

       The HTTP suite proves the route. This is the half that decides whether a person believes
       it, and it is the half the finding is written from: they are standing inside ONE question,
       on a 390px screen, with three other live questions in the same squad — and they type six
       words. What comes back has to be about the thing whose name is at the top of the screen.

       DRIVEN THROUGH THE REAL COMPOSER, not a fetch: the founder's own rule for this pass is that
       a bug survived once because the tests called the route correctly while the UI sent something
       else, and the subject of a turn is carried by the UI. */
    posts.length = 0;
    await coach.page.evaluate(() => MemberApp.openObjectThread('inquiry', 'inq_comms', 'group:first'));
    await coach.page.waitForTimeout(1400);
    /* THE THREAD GROWS ITS OWN COMPOSER — `iq-object-input`, sending through `inquirySend` — and
       the shell one stands down when it does. That is the whole reason this is a browser gate:
       the subject of a turn is carried by whichever box the person actually typed into, and there
       are two of them on this product. */
    await coach.page.fill('#iq-object-input', 'What should I focus on?');
    await coach.page.evaluate(() => MemberApp.inquirySend());
    await coach.page.waitForTimeout(2400);
    const boundTurn = posts.find(p => /assistant\/turn/.test(p.url));
    /* THE WIRE FORMAT IS A REF STRING, and pinning it is the point rather than an inconvenience:
       the server resolves `about` through `_aboutRef`, and an assertion written against a shape
       the client does not send would pass on a build where the binding was dropped entirely. */
    ok('PC-J10 the composer sends the turn bound to the question on the screen',
      !!boundTurn && String(boundTurn.body.about) === 'inquiry:inq_comms'
      && boundTurn.body.surface === 'inquiry');
    const boundSaid = await coach.page.evaluate(() => {
      const t = [...document.querySelectorAll('.iqt-turns .iq-msg-iq, .iq-msg-iq')];
      return t.length ? t[t.length - 1].textContent : '';
    });
    /* THE TITLE ALONE IS NOT ENOUGH: the attention digest LISTS this squad's questions, so it
       names this one while being an answer about all four. A mutation proved it. What has to be
       on the screen is the object's OWN read — the sentence only that reader writes. */
    ok('PC-J11 …and the answer on the screen is about THAT question',
      /Communication after results/i.test(boundSaid)
      && /on the record here, not a fresh reading of it/i.test(boundSaid));
    /* THE THREE OTHER LIVE QUESTIONS IN THE SAME SQUAD. Each is a real object with a real title,
       which is what makes this a hijack test rather than a spelling test: the attention digest
       lists them, and on the live build one of them answered a question asked inside this one. */
    ok('PC-J12 …and not about the squad\'s other live questions',
      !/last twenty minutes|Set-piece marking|attendance/i.test(boundSaid));
    ok('PC-J13 …with the wider reading offered rather than silently dropped',
      /across everything rather than this one/i.test(boundSaid));

    /* ══ K — SAYING IT, ON THE PHONE, WITH NO MODEL ═════════════════════════════════════════
       The founder's rule for this pass, applied to the newest path in the product:

         "The previous outcome bug survived because tests called the route correctly while the UI
          sent the wrong value. Do not repeat that mistake."

       `readCommand` is covered hermetically. What is NOT covered by that is the thing that bug
       was made of: whether the RENDERED composer, on a 390px screen, with every model off, sends
       what the coach typed and then shows them what happened. So this types into the real field,
       sends with the real control, and checks the emitted body, the store and the next screen. */
    console.log('\n  K — A COACH TYPES AN INSTRUCTION INTO THE COMPOSER ON A PHONE');
    posts.length = 0;
    await coach.page.evaluate(() => navigate('home'));
    await coach.page.waitForTimeout(1200);
    await coach.page.fill('#iq-composer-input', 'Create a focus to reconnect substitutes');
    await coach.page.evaluate(() => MemberApp.wsSend());
    await coach.page.waitForTimeout(2600);
    const madeTurn = posts.find(p => /assistant\/turn/.test(p.url));
    ok('PC-K1 the rendered control sends the coach\'s sentence unchanged, with no model anywhere',
      !!madeTurn && madeTurn.body.text === 'Create a focus to reconnect substitutes');
    const afterSay = await textOf(coach.page, null);
    /* FOCUS IS THE ONE DELIBERATE CREATION PRIMITIVE. The card is the visible boundary between
       conversation and a consequential commitment: nothing exists until the person confirms. */
    const approve = await coach.page.evaluate(() => {
      const card = document.querySelector('.iq-proposal[data-proposal], .tdy-prop[id^="today-prop-"]');
      if (!card) return null;
      const btn = [...card.querySelectorAll('button')].find(b => /confirm/i.test(b.textContent || ''));
      return { label: (card.innerText || '').trim(), confirm: !!btn };
    });
    ok('PC-K2 …and a deliberate Focus is offered back as an approvable control rather than announced as done',
      !!approve && approve.confirm === true
      && /focus/i.test(approve.label)
      && !/I have created|I have opened|created for you/i.test(afterSay));
    ok('PC-K3 …and nothing was written before they approved it',
      !posts.some(p => /\/confirm/.test(p.url)));

    /* SAYING YES RESOLVES THE VISIBLE PROPOSAL, BUT STILL USES THE ONE CONFIRMATION MUTATION PATH. */
    const focusesBefore = await coach.page.evaluate(() =>
      fetch('/api/objects?kind=focus&scope=self', { headers: MemberApp._authHeaders() })
        .then(r => r.json()).then(j => (j.objects || []).length).catch(() => -1));
    posts.length = 0;
    await coach.page.fill('#iq-composer-input', 'yeah');
    await coach.page.evaluate(() => MemberApp.wsSend());
    await coach.page.waitForTimeout(2600);
    const confirmPost = posts.find(p => /\/confirm/.test(p.url));
    ok('PC-K3b typing "yeah" reaches the Focus that was offered, with no button pressed',
      !!confirmPost);
    ok('PC-K3c …through the one governed confirmation route, carrying the proposal it resolved to',
      !!confirmPost && /\/api\/assistant\/turn\/[^/?#]+\/confirm(\?|#|$)/.test(String(confirmPost.url))
      && !!(confirmPost.body || {}).proposalId);
    const focusesAfter = await coach.page.evaluate(() =>
      fetch('/api/objects?kind=focus&scope=self', { headers: MemberApp._authHeaders() })
        .then(r => r.json()).then(j => (j.objects || []).length).catch(() => -1));
    ok('PC-K3d …and the Focus the coach chose now exists, once',
      focusesBefore >= 0 && focusesAfter === focusesBefore + 1);
    ok('PC-K3e …and the whole acceptance still fits a 390px screen',
      await coach.page.evaluate(() =>
        document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));

    /* INQUIRY IS GOVERNED DISCOVERY, NOT A SECOND DELIBERATE-CREATION PRIMITIVE. A command may
       contribute the person's question to conversation, but it must not manufacture standing. */
    const inquiriesBefore = await coach.page.evaluate(() =>
      fetch('/api/objects?kind=inquiry&scope=self', { headers: MemberApp._authHeaders() })
        .then(r => r.json()).then(j => (j.objects || []).length).catch(() => -1));
    posts.length = 0;
    await coach.page.fill('#iq-composer-input', 'Create an inquiry into why substitutes feel disconnected');
    await coach.page.evaluate(() => MemberApp.wsSend());
    await coach.page.waitForTimeout(2600);
    const afterInquiry = await textOf(coach.page, null);
    const inquiriesAfter = await coach.page.evaluate(() =>
      fetch('/api/objects?kind=inquiry&scope=self', { headers: MemberApp._authHeaders() })
        .then(r => r.json()).then(j => (j.objects || []).length).catch(() => -1));
    ok('PC-K3f asking to create an Inquiry is answered as governed discovery, not as a missing-model failure',
      /inquiry is not something I create|question or unknown|governed discovery/i.test(afterInquiry)
      && !/language model is unavailable|no model configured/i.test(afterInquiry));
    ok('PC-K3g …and no approval control is manufactured for that Inquiry command',
      !posts.some(p => /\/confirm/.test(p.url)));
    ok('PC-K3h …and no canonical Inquiry standing is manufactured by the command',
      inquiriesBefore >= 0 && inquiriesAfter === inquiriesBefore);
    ok('PC-K3i …while the product says plainly that nothing was saved or shared',
      /nothing was saved or shared/i.test(afterInquiry));

    /* AND THE HALF THAT IS NOT AN ACTION AT ALL. A High and a Low are not created by asking; they
       appear when people in a group have offered the same observation and said which way it
       points. The product must say that plainly rather than failing silently or pretending. */
    posts.length = 0;
    await coach.page.fill('#iq-composer-input', 'Create a Low about our set pieces');
    await coach.page.evaluate(() => MemberApp.wsSend());
    await coach.page.waitForTimeout(2600);
    const afterLow = await textOf(coach.page, null);
    ok('PC-K4 asking for a Low is answered with what a Low actually is, in a coach\'s words',
      /not something I create|is what appears|people in a group|offered the same/i.test(afterLow));
    ok('PC-K5 …and it says outright that nothing was saved or shared, which is the coach\'s real question',
      /nothing was saved or shared/i.test(afterLow));
    ok('PC-K6 …and it uses none of the words a coach should never need — no inquiry ids, no bands, no packets',
      !/inquiryId|nodeId|subjectRef|candidateId|packet|cross-evidence|Priority Office|canonicalConcept/i.test(afterLow));
    ok('PC-K7 …and no High or Low was conjured by asking for one',
      !posts.some(p => /\/contribute|\/confirm/.test(p.url)));
    /* AND IT ALL FITS THE DEVICE. A reply a coach has to scroll sideways to read is a reply they
       do not read, and this one is the longest sentence the product says. */
    ok('PC-K8 …and the whole exchange fits a 390px screen with no sideways scrolling',
      await coach.page.evaluate(() =>
        document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));

    /* ══ L — EVERY DOOR THE PRODUCT OFFERS ACTUALLY OPENS ══════════════════════════════════
       `navigate` fails SAFE to Home for an unknown destination, which is right and is also how a
       menu item pointing at a page nobody built becomes invisible. "Organisation" was in
       PAGE_TITLES with no route and no alias, so a person with `view_team` tapped it and arrived
       at Home, with the title reading Home, every time, and nothing logged.

       The guard is not the bug; a menu offering a destination the router does not have is. So
       this asserts the two halves separately: every id the product OFFERS resolves to itself, and
       the fallback still works for an id it does not offer. */
    console.log('\n  L — EVERY DESTINATION THE PRODUCT OFFERS RESOLVES TO ITSELF');
    const doors = await coach.page.evaluate(() => {
      const ids = new Set();
      // The nav drawer's own list, whatever it currently holds.
      for (const n of (MemberApp._NAV || [])) ids.add(n.id);
      for (const n of (MemberApp._NAV_EXTRA || [])) ids.add(n.id);
      // And every destination the account menu can emit.
      for (const b of document.querySelectorAll('.topbar-account-link[data-page]')) ids.add(b.dataset.page);
      return [...ids];
    });
    ok('PC-L1 the product offers destinations at all, so this is not measuring an empty list',
      doors.length >= 8);
    /* AN ALIAS IS NOT A STRAY. `organisation` deliberately folds to `people`, and half a dozen
       retired identities fold to `leader-home`; landing somewhere else on purpose is the whole
       point of NAV_ALIASES. What must not happen is falling THROUGH the alias table and the route
       table into the safety net, which is indistinguishable on screen from arriving somewhere.
       So the expected destination is resolved the way `navigate` resolves it, and the assertion is
       that the app got there. */
    const strays = [];
    for (const id of doors) {
      const r = await coach.page.evaluate(async (d) => {
        const want = (typeof NAV_ALIASES !== 'undefined' && NAV_ALIASES[d]) || d;
        navigate(d); await new Promise(r => setTimeout(r, 200));
        return { want, got: AppState.currentPage };
      }, id);
      if (r.got !== r.want) strays.push(`${id} -> ${r.got} (wanted ${r.want})`);
    }
    ok('PC-L2 …and every one of them reaches the destination it resolves to rather than the safety net: '
      + (strays.length ? strays.join(', ') : 'all resolve'), strays.length === 0);
    /* AND THE FALLBACK IS STILL THERE. Removing the stray is not the same as removing the guard,
       and a product that hard-fails on a stale bookmark is worse than one that goes Home. */
    ok('PC-L3 …while an id the product does not offer still fails safe to Home',
      await coach.page.evaluate(async () => {
        navigate('a-page-that-was-never-built'); await new Promise(r => setTimeout(r, 200));
        return AppState.currentPage === 'home';
      }));

    /* ══ I — PROVIDER DOWN ══════════════════════════════════════════════════════════════════ */
    console.log('\n  I — AND EVERY LINE ABOVE WAS WRITTEN WITH NO MODEL REACHABLE');
    ok('PC-I1 the whole walkthrough ran with models switched off',
      process.env.IQ_DETERMINISTIC_ONLY === '1');
    /* AND THAT IS NOT THE SAME AS "it did not crash". A provider-down journey that is honest
       shows no degraded notice, because nothing on it was waiting for a model in the first place:
       every sentence a coach read came from the kernel. A degraded banner here would mean some
       part of this path had quietly become model-dependent. */
    await coach.page.evaluate(() => navigate('home'));
    await coach.page.waitForTimeout(2200);
    const finalHome = await textOf(coach.page, null);
    ok('PC-I2 …so no screen on it carried a degraded or model-unavailable notice',
      !/could not be composed|model is unavailable|no model configured|IntelliQ is running without/i.test(finalHome));
    ok('PC-I3 …and the first screen still reads as a product rather than as a fallback',
      /First Team/.test(finalHome) && /Communication after results/i.test(finalHome));

    /* ══ N — A BADGE IS A STATEMENT ABOUT A CLAIM ══════════════════════════════════════════
       Found by reading the rendered screen rather than by testing a function. On Home, on
       Inquiries and on Lows, the group's own question rendered:

           Communication after results
           WELL SUPPORTED
           I don't have a read on this yet — what has been described is on the record, and
           the reason for it is still open.

       Two adjacent lines contradicting each other in IntelliQ's own voice, and the reader
       resolves it the wrong way round every time because a badge in capitals is louder than a
       sentence. The band was the OBSERVATION's, earned by five people describing something; the
       claim it was sitting above was the missing EXPLANATION.

       Both owners had the hole. `ai/present.js` already gated `thinking` on the hypothesis having
       standing and left `standing` — the badge — ungated, which its own comment had predicted in
       the words "a law with one owner and two renderers is a law with a hole in it".
       `ai/voice.js` said in a comment that the band is "deliberately NOT spoken here" and then
       returned it as a field two lines below.

       The assertion is the law rather than the spelling: wherever the product says it has no read
       yet, no confidence word appears on that screen. It does NOT assert the provenance line is
       absent — "five people, five independent sources" is a fact about the record that stays true
       and is the right thing to show when there is no read. */
    console.log('\n  N — NO CONFIDENCE WORD ON A SCREEN THAT SAYS IT HAS NO READ');
    const _BANDS = /\b(WELL SUPPORTED|FAIRLY SURE|LIKELY|TAKING SHAPE|EARLY THINKING)\b/i;
    const contradictions = [];
    for (const dest of ['home', 'inquiry', 'low', 'high']) {
      await coach.page.evaluate(d => navigate(d), dest);
      await coach.page.waitForTimeout(1500);
      const body = await textOf(coach.page, null);
      if (/don't have a read on this yet/i.test(body) && _BANDS.test(body)) {
        contradictions.push(`${dest} (${(body.match(_BANDS) || [])[0]})`);
      }
    }
    ok('PC-N1 no screen pairs "I have no read" with a confidence badge: '
      + (contradictions.length ? contradictions.join(', ') : 'none'), contradictions.length === 0);
    /* AND THE CONTROL. If the no-read sentence had simply stopped appearing, N1 would pass while
       the product said nothing at all — so the state this measures has to still be reachable. */
    /* THE CONTROL, AND IT WAS WRONG FIRST. It pinned the no-read state to the `low` screen, and
       on this fixture the Lows bucket is empty — "Nothing needs attention right now." So N1 was
       passing over a screen with no claim on it at all, which is exactly the vacuous-pass shape
       a control exists to catch, and the control caught itself.

       The honest control is that the state N1 measures is REACHABLE somewhere in the product,
       not that it lives on a screen chosen in advance. */
    let sawNoRead = false, sawProvenance = false;
    for (const dest of ['home', 'inquiry', 'low', 'high']) {
      await coach.page.evaluate(d => navigate(d), dest);
      await coach.page.waitForTimeout(1200);
      const b = await textOf(coach.page, null);
      if (/don't have a read on this yet/i.test(b)) sawNoRead = true;
      if (/independent source/i.test(b)) sawProvenance = true;
    }
    ok('PC-N2 …and that state is genuinely reachable, so N1 was not measuring empty screens',
      sawNoRead);
    ok('PC-N3 …with what the record DOES establish still said plainly where there is a record',
      sawProvenance);

    /* ══ O — THE COMPOSER IS EVER-PRESENT, NOT EVER-DOMINANT ══════════════════════════════
       The founder's report was that it looked enormous, and measurement agreed: at rest the wrap
       was 154px on a 390px screen -- 18% of the viewport -- of which the INPUT was 61px and the
       furniture around it was 93px. Most of what a person saw before typing a word was chrome.

       The empty `.iq-voice-state` was reserving ~20px under every composer in the app for a status
       line that only fills while the microphone is live. It now collapses when empty and restores
       the instant it has something to say, so nothing is hidden -- there was nothing to hide.

       WHAT IS NOT REDUCED, AND WHY. The remaining band is the audience row, and it is 44px because
       `@media (max-width:640px)` sets `min-height:44px` on every tap target on a phone. That rule
       was added deliberately and shrinking a control to make a screen look tidier is trading a
       real accessibility property for a visual one. So the floor here is the input plus one
       accessible row, and this asserts the product stays at that floor rather than drifting back
       above it. */
    console.log('\n  O — THE COMPOSER AT REST, AND WHEN IT GROWS');
    await coach.page.evaluate(() => navigate('home'));
    await coach.page.waitForTimeout(1600);
    const rest = await coach.page.evaluate(() => {
      const w = document.querySelector('.iq-composer-wrap');
      const ta = document.getElementById('iq-composer-input');
      const st = document.querySelector('.iq-voice-state');
      return { vh: window.innerHeight, wrap: Math.round(w.getBoundingClientRect().height),
        state: Math.round(st.getBoundingClientRect().height), ph: ta.placeholder };
    });
    ok('PC-O1 at rest it takes under a fifth of the screen (' + rest.wrap + 'px of ' + rest.vh + ')',
      rest.wrap > 0 && rest.wrap / rest.vh < 0.20);
    ok('PC-O2 …and the empty status line reserves nothing (' + rest.state + 'px)', rest.state <= 1);
    /* THE INVITATION, NOT A DESCRIPTION OF THE INPUT. "Type anything" describes the text box;
       this asks the person something. */
    ok('PC-O3 …and it asks rather than labelling itself: ' + JSON.stringify(rest.ph),
      /what.s on your mind/i.test(rest.ph));

    console.log('\n  O2 — AND IT GROWS WITH THE TEXT, THEN STOPS AND SCROLLS');
    await coach.page.fill('#iq-composer-input', 'One line');
    await coach.page.waitForTimeout(250);
    const one = await coach.page.evaluate(() =>
      Math.round(document.querySelector('.iq-composer-wrap').getBoundingClientRect().height));
    ok('PC-O4 one line is still the resting size', Math.abs(one - rest.wrap) <= 2);
    await coach.page.fill('#iq-composer-input',
      Array.from({ length: 14 }, (_, i) => 'Line ' + (i + 1) + ' of something long a coach might write').join('\n'));
    await coach.page.waitForTimeout(350);
    const many = await coach.page.evaluate(() => {
      const w = document.querySelector('.iq-composer-wrap');
      const ta = document.getElementById('iq-composer-input');
      return { wrap: Math.round(w.getBoundingClientRect().height),
        scrolls: ta.scrollHeight > ta.clientHeight + 2 };
    });
    ok('PC-O5 fourteen lines grows it, but not past a third of the screen (' + many.wrap + 'px)',
      many.wrap > rest.wrap && many.wrap / rest.vh < 0.34);
    ok('PC-O6 …and past its maximum the text scrolls inside it rather than pushing the object away',
      many.scrolls === true);
    await coach.page.fill('#iq-composer-input', '');
    await coach.page.waitForTimeout(250);
    ok('PC-O7 …and clearing it returns to the resting size',
      Math.abs(await coach.page.evaluate(() =>
        Math.round(document.querySelector('.iq-composer-wrap').getBoundingClientRect().height)) - rest.wrap) <= 2);

    /* ══ P — THE ORG TREE'S FIRST JOB IS "WHERE DO I SIT" ═════════════════════════════════
       Its first purpose is understanding the organisation you belong to; management is second. On
       a phone a member got the second one's shape: the tree rendered COLLAPSED to the root, so the
       whole page read "Alma College / 2 in subtree" and the person's own team, their coach, and
       the fact that they are in any of it were all behind a chevron. Driven at 390px before it was
       changed -- a member could not see their own team's name on the page at all.

       The path from the root to the viewer's own node is now opened once on first render.
       Presentation only: `_expanded` decides what is DRAWN, never what may be read, and every node
       in that path had already passed the server's audience rules to reach this client.

       AND THE ROW COUNTS PEOPLE ONCE. `memberIds` and `leaderIds` overlap -- leading a team you
       are in is the ordinary case -- and adding the two lengths counted that person twice, so a
       squad of two whose coach also plays read "3 people · 1 leader · 2 in subtree", a line
       contradicting itself in its own last clause. `_subtreeMemberCount` twelve lines above had
       always done it properly with a Set. */
    console.log('\n  P — A COACH LANDS ON THE TREE AND CAN SEE WHERE THEY SIT');
    await coach.page.evaluate(() => navigate('people'));
    await coach.page.waitForTimeout(2200);
    const tree = await coach.page.evaluate(() => {
      const el = document.getElementById('page-people');
      const txt = el ? el.innerText : '';
      return { txt, ownNode: /First Team/.test(txt),
        contradiction: /(\d+) people[^|]*?·\s*(\d+) in subtree/.test(txt) };
    });
    ok('PC-S1 their own node is on the screen without anybody tapping a chevron', tree.ownNode);
    /* THE COUNT IS CONSISTENT WITH ITSELF. A row saying more people than its own subtree holds is
       the double-count, and it is the version a reader notices without being able to explain. */
    ok('PC-S2 …and no row claims more people than the subtree it sits in', await coach.page.evaluate(() => {
      const txt = (document.getElementById('page-people') || {}).innerText || '';
      for (const line of txt.split('\n')) {
        const p = line.match(/(\d+)\s+(?:person|people)/);
        const s = line.match(/(\d+)\s+in subtree/);
        if (p && s && Number(p[1]) > Number(s[1])) return false;
      }
      return true;
    }));

    /* ══ M — AND THE OTHER PHONE ═══════════════════════════════════════════════════════════
       Everything above ran at 390px, which is the narrow end of the device class and the right
       place to find clipping. 430px is the other end — a Pro Max — and it finds the opposite
       failure: layouts that were tuned by hand for the narrow case and stretch badly, and any
       element with a fixed width that only overflows once the viewport is wider than it.

       This is a second VIEWPORT, not a second walkthrough: the same session, the same data, the
       same screens, re-measured. The assertion that matters on both is the same one — a person
       should never have to scroll sideways — plus the composer still being reachable, because a
       sticky composer that leaves the viewport at one width and not the other is the defect this
       catches and no route test ever could. */
    console.log('\n  M — THE SAME SCREENS AT 430px, WHICH IS THE OTHER END OF THE DEVICE CLASS');
    await coach.page.setViewportSize({ width: 430, height: 932 });
    await coach.page.waitForTimeout(600);
    const wideOverflow = [];
    for (const dest of ['home', 'inquiry', 'focus', 'high', 'low', 'notes', 'people', 'settings']) {
      await coach.page.evaluate(d => navigate(d), dest);
      await coach.page.waitForTimeout(900);
      const bad = await coach.page.evaluate(() =>
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      if (bad) wideOverflow.push(dest);
    }
    ok('PC-M1 no screen scrolls sideways at 430px: '
      + (wideOverflow.length ? wideOverflow.join(', ') : 'none'), wideOverflow.length === 0);
    await coach.page.evaluate(() => navigate('home'));
    await coach.page.waitForTimeout(1400);
    ok('PC-M2 …and the composer is still on the screen and usable at that width',
      await coach.page.evaluate(() => {
        const t = document.getElementById('iq-composer-input');
        if (!t || t.disabled || t.readOnly) return false;
        const r = t.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.left >= 0 && r.right <= window.innerWidth + 1;
      }));
    /* AND THE NARROW END STILL HOLDS AFTERWARDS, so this section cannot pass by having quietly
       left the page in a state the earlier assertions were not measured against. */
    await coach.page.setViewportSize(IPHONE);
    await coach.page.waitForTimeout(600);
    await coach.page.evaluate(() => navigate('home'));
    await coach.page.waitForTimeout(1400);
    ok('PC-M3 …and going back to 390px still does not scroll sideways',
      await coach.page.evaluate(() =>
        document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));

    /* ══ PC-P — THE COMPOSER IS THE PRODUCT'S DOOR, ON EVERY PAGE ═══════════════════════════════
       Founder's law: ever-present, not ever-dominant. Driven as a new member at 390px it was
       neither. It was rendered inside #page-home's own template, so it was the main event on Home
       and did not exist on Focus, Inquiries, Highs, Lows, Library, People or Settings — seven
       pages on which the way back to IntelliQ was to notice the menu and navigate Home.

       Measured rather than asserted about markup: an element in the DOM is not a composer a thumb
       can reach, and the first version of this fix put one on every page ninety pixels below the
       fold. */
    console.log('\n  PC-S THE COMPOSER, ON EVERY PAGE A MEMBER CAN OPEN');
    const composerOn = async (route) => {
      await coach.page.evaluate(r => navigate(r), route);
      await coach.page.waitForTimeout(1100);
      return coach.page.evaluate(() => {
        const el = document.getElementById('iq-composer-input');
        if (!el) return { there: false };
        const c = getComputedStyle(el); const b = el.getBoundingClientRect();
        return {
          there: b.height > 0 && b.width > 0 && c.display !== 'none' && c.visibility !== 'hidden',
          // ON SCREEN, not merely in the layout. Sticky inside a container taller than the
          // viewport puts it past the fold, which is how the first attempt failed.
          onScreen: b.bottom <= window.innerHeight + 1 && b.top >= 0,
          placeholder: el.placeholder || '',
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        };
      });
    };
    const ROUTES = ['home', 'focus', 'inquiry', 'high', 'low', 'notes', 'people', 'settings'];
    const seen = [];
    for (const r of ROUTES) seen.push([r, await composerOn(r)]);
    ok('PC-S1 every page a member can open offers the composer',
      seen.every(([, s]) => s.there));
    ok('PC-S2 …within the screen rather than below the fold',
      seen.every(([, s]) => s.onScreen));
    /* THIS ASSERTED THE OPPOSITE LAW UNTIL THIS PASS, and correctly so at the time: there was one
       invitation and it was Home's, everywhere. The founder's correction is that the page a person
       is standing on should ask in its own words — the same intelligence, a different door — so
       what survives here is the part that was always the point: every page offers one, and it
       invites them to SPEAK rather than to query. PC-U asserts the exact wording room by room. */
    ok('PC-S3 …each with a real invitation to say something, not an empty box',
      seen.every(([, s]) => typeof s.placeholder === 'string' && s.placeholder.trim().length > 8));
    ok('PC-S4 …and no page scrolls sideways because of it',
      seen.every(([, s]) => !s.overflow));
    if (!seen.every(([, s]) => s.there && s.onScreen)) {
      console.error('    ', JSON.stringify(seen.filter(([, s]) => !(s.there && s.onScreen))));
    }

    /* THE OTHER HALF, AND THE ONE THAT MAKES THIS SAFE. Two composers on one screen is a question
       about which one is listening, and on the Forum the answer decides who reads what you type.
       A page that brought its own wins; the shell one stands down and comes back afterwards. */
    const fid = await coach.page.evaluate(async () => {
      const r = await fetch('/api/me/focus', { method: 'POST',
        headers: { Authorization: 'Bearer ' + (JSON.parse(localStorage.getItem('iq_auth') || '{}').token || ''),
          'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Talk earlier in the build-up' }) });
      const j = await r.json().catch(() => null);
      return j && j.focus && j.focus.id;
    });
    const composerCount = () => coach.page.evaluate(() => {
      const vis = el => { if (!el) return false; const c = getComputedStyle(el); const b = el.getBoundingClientRect();
        return b.height > 0 && b.width > 0 && c.display !== 'none' && c.visibility !== 'hidden'; };
      return ['iq-composer-input', 'iq-object-input', 'iq-forum-input']
        .filter(id => vis(document.getElementById(id)));
    });
    await coach.page.evaluate(i => MemberApp.openObjectThread('focus', i), String(fid)).catch(() => {});
    await coach.page.waitForTimeout(1800);
    const inThread = await composerCount();
    ok('PC-S5 inside an object thread there is exactly one composer, and it is the thread\'s own',
      inThread.length === 1 && inThread[0] === 'iq-object-input');
    await coach.page.evaluate(() => MemberApp._renderBucketPage('focus')).catch(() => {});
    await coach.page.waitForTimeout(1500);
    const backOut = await composerCount();
    ok('PC-S6 …and coming back out, the shell composer takes the surface again',
      backOut.length === 1 && backOut[0] === 'iq-composer-input');

    /* AND ASKING FROM ANOTHER PAGE PUTS THE ANSWER WHERE THEY CAN SEE IT. The conversation lives
       on Home, so the first version of this sent the turn, rendered the reply correctly, and
       showed the person nothing — the reply went into a page that was not on screen. */
    await coach.page.evaluate(() => navigate('notes'));
    await coach.page.waitForTimeout(1100);
    await coach.page.fill('#iq-composer-input', 'What should I be paying attention to?');
    await coach.page.click('#iq-shell-composer .iq-send');
    await coach.page.waitForTimeout(2600);
    const landed = await coach.page.evaluate(() => {
      const c = document.getElementById('iq-conversation');
      /* WHAT MATTERS IS THAT THEY CAN SEE IT, not which route name the app is on. The first
         version of this also asserted AppState.currentPage === 'home' and failed while the
         product was correct -- AppState is not reachable as a window property here, so the check
         was reading undefined. The visible conversation IS the law. */
      return { visible: !!(c && c.offsetParent !== null),
        carries: !!(c && /paying attention to/.test(c.innerText || '')) };
    });
    ok('PC-S7 asking from another page lands on the visible conversation rather than nowhere',
      landed.visible);
    ok('PC-S8 …carrying the question that was actually asked', landed.carries);

    /* ══ PC-T — NO PRIVACY CONTROL THAT DOES NOT WORK ══════════════════════════════════════════
       The composer used to show a "Private | Public" pill next to every message. It set a flag
       that reached nothing — not the request body, not any other reader — so it was a promise
       about who could read you that the product had no way to keep.

       Founder's law, and the reason it was removed rather than wired up: talking to IntelliQ is
       private conversation; contributing to other people is a separate deliberate act with its own
       audience, its own words and its own confirmation. A global public MODE is the wrong shape
       even when it works, because sharing one sentence would silently change the audience of every
       sentence after it.

       The hermetic half of this lives in composer-privacy-law-http-smoke. This is the half that
       can only be seen: what a person's eyes actually find on the row beneath the composer, on
       every page it now appears on. */
    console.log('\n  PC-T THE COMPOSER PROMISES NOTHING IT CANNOT KEEP');
    const hintOn = async (route) => {
      await coach.page.evaluate(r => navigate(r), route);
      await coach.page.waitForTimeout(1000);
      return coach.page.evaluate(() => {
        const vis = el => { if (!el) return false; const c = getComputedStyle(el);
          const b = el.getBoundingClientRect();
          return b.height > 0 && b.width > 0 && c.display !== 'none' && c.visibility !== 'hidden'; };
        const hint = document.querySelector('#iq-shell-composer .iq-composer-hint');
        return {
          toggle: !!document.getElementById('iq-vis'),
          // Any control at all on this row that offers a public/share choice, however it is built.
          publicWord: !!hint && /\bpublic\b|\bshare\b/i.test(hint.innerText || ''),
          text: hint ? (hint.innerText || '').replace(/\s+/g, ' ').trim() : '(no hint row)',
          hintVisible: vis(hint),
        };
      });
    };
    const hints = [];
    for (const r of ['home', 'focus', 'notes', 'settings']) hints.push([r, await hintOn(r)]);
    ok('PC-T1 no page offers a Private/Public toggle beside the composer',
      hints.every(([, h]) => !h.toggle));
    ok('PC-T2 …and nothing on that row offers to make a message public or shared',
      hints.every(([, h]) => !h.publicWord));
    /* AND IT DID NOT GO SILENT. Deleting the pill and saying nothing leaves a person guessing,
       which is its own small dishonesty on a surface whose whole subject is who can read you. */
    ok('PC-T3 …while the row still says plainly that this is private to them',
      hints.every(([, h]) => h.hintVisible && /private to you/i.test(h.text)));
    ok('PC-T4 …and still offers the explanation of who can see what',
      hints.every(([, h]) => /who can see what i say here/i.test(h.text)));
    if (!hints.every(([, h]) => !h.toggle && !h.publicWord && /private to you/i.test(h.text))) {
      console.error('    ', JSON.stringify(hints));
    }

    /* THE OTHER HALF, AND THE ONE THAT MAKES THE REMOVAL SAFE RATHER THAN MERELY TIDY. A person
       must still be able to contribute deliberately, so the object's own audience control has to
       be on its own thread, where the thing being shared is in front of them. */
    console.log('\n  PC-T5 AND THE DELIBERATE WAY TO SHARE IS STILL THERE');
    const shareable = await coach.page.evaluate(async () => {
      const r = await fetch('/api/me/focus', { method: 'POST',
        headers: { Authorization: 'Bearer ' + (JSON.parse(localStorage.getItem('iq_auth') || '{}').token || ''),
          'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'say something on the bus home after a loss' }) });
      const j = await r.json().catch(() => null);
      return j && j.focus && j.focus.id;
    });
    await coach.page.evaluate(i => MemberApp.openObjectThread('focus', i), String(shareable)).catch(() => {});
    await coach.page.waitForTimeout(1800);
    const onThread = await coach.page.evaluate(() => {
      const bar = document.querySelector('.iqt-bar');
      const aud = document.querySelector('.iqt-forum[onclick*="openAudience"]');
      const vis = el => { if (!el) return false; const c = getComputedStyle(el);
        const b = el.getBoundingClientRect();
        return b.height > 0 && b.width > 0 && c.display !== 'none' && c.visibility !== 'hidden'; };
      return { hasAudience: !!aud && vis(aud),
        tap: aud ? Math.round(aud.getBoundingClientRect().height) : 0,
        barHTML: bar ? (bar.innerHTML || '').slice(0, 400) : '(no bar)' };
    });
    ok('PC-T5 the object a person owns still carries its own audience control, on its own thread',
      onThread.hasAudience);
    ok('PC-T6 …and it is still reachable with a thumb', onThread.tap >= 36);

    /* ══ PC-U — ONE COMPOSER, AND THE ROOM IT IS STANDING IN ═══════════════════════════════════
       Founder's law: the invitation is an urge to start talking, not an input schema. The page
       gives the Composer context — it is how "this" and "that" get resolved — and must not narrow
       what a person may say. Somebody on Focuses can still ask why the last one failed.

       It was one line everywhere. The bar is deliberately NOT rebuilt on navigation, because that
       is what protects a half-typed sentence, and the consequence was that the placeholder was
       whatever the first page to render it had asked for: measured at 390px, Highs, Lows,
       Inquiries, Focuses and Library all still read "What's on your mind?".

       Asserted as exact strings because these are the founder's own words for each room, and an
       approximate match would let them drift back into one generic line. */
    console.log('\n  PC-U THE INVITATION FITS THE ROOM, AND THE DRAFT SURVIVES THE WALK');
    /* THESE FOUR WERE TRIMMED ON 2026-09-24, and the exactness is still the point. Findings R1
       #12: four of them were cut off mid-word on a real iPhone, because attach, mic and send are
       three 44px tap targets and the text field was left 176px of a 342px bar. The layout gave
       way first — an empty composer no longer shows a send button — and the copy came the rest of
       the way. `composer-fit-browser-check` measures the drawn width of each of these against the
       field's own content box at 390px and 430px, so a future kind word cannot quietly clip them
       again. What this assertion protects is unchanged: each room asks in its own words, pinned
       exactly, so they cannot drift back into one generic line. */
    const WANT = {
      home:    'What’s on your mind?',
      high:    'What have you noticed?',
      low:     'What have you noticed?',
      inquiry: 'What are you wondering?',
      focus:   'What are you working on?',
      notes:   'Ask about what you kept…',
    };
    const seenPh = {};
    for (const r of Object.keys(WANT)) {
      await coach.page.evaluate(x => navigate(x), r);
      await coach.page.waitForTimeout(950);
      seenPh[r] = await coach.page.evaluate(() => {
        const e = document.getElementById('iq-composer-input');
        return e ? e.placeholder : '(absent)';
      });
    }
    const wrong = Object.keys(WANT).filter(r => seenPh[r] !== WANT[r]);
    ok('PC-U1 every page asks in its own words', wrong.length === 0);
    if (wrong.length) console.error('    ', JSON.stringify(wrong.map(r => [r, seenPh[r], WANT[r]])));
    /* THE HALF THAT STOPS THIS PASSING ON ONE SHARED STRING. Six identical placeholders would
       satisfy "every page has one"; four distinct ones is what makes them the room's own. */
    /* FIVE, NOT SIX: Highs and Lows deliberately share "Tell me what you've noticed…", because
       noticing something good and noticing something wrong are the same act of telling IntelliQ
       what you saw. Counted rather than assumed — the first version of this said four and failed
       against a correct product. */
    ok('PC-U2 …and those words are genuinely different room to room',
      new Set(Object.values(seenPh)).size === 5);
    /* NOT A SEARCH BOX. Founder: "What do you want to know?" turns IntelliQ into one. */
    ok('PC-U3 …and none of them asks what the person wants to KNOW',
      !Object.values(seenPh).some(p => /what do you want to know/i.test(p)));

    /* THE COST OF GETTING THIS WRONG. Retargeting the placeholder must not rebuild the bar, or
       navigating away from a half-written sentence throws it away. */
    await coach.page.evaluate(() => navigate('focus'));
    await coach.page.waitForTimeout(900);
    await coach.page.fill('#iq-composer-input', 'a sentence I have not finished');
    await coach.page.evaluate(() => navigate('notes'));
    await coach.page.waitForTimeout(950);
    const carried = await coach.page.evaluate(() => {
      const e = document.getElementById('iq-composer-input');
      return { v: e ? e.value : null, ph: e ? e.placeholder : null };
    });
    ok('PC-U4 a half-typed sentence survives walking to another page',
      carried.v === 'a sentence I have not finished');
    ok('PC-U5 …while the invitation underneath it has still changed',
      carried.ph === WANT.notes);
    await coach.page.evaluate(() => { const e = document.getElementById('iq-composer-input'); if (e) e.value = ''; });
    if (!onThread.hasAudience) console.error('    ', onThread.barHTML);

  } catch (e) {
    fail++; console.error('  FAIL pilot walkthrough threw:', e && e.stack);
  }

  if (coach) { try { await coach.ctx.close(); } catch (_) {} }
  await browser.close();
  server.close();
  console.log(`\npilot-coach-browser-check: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
