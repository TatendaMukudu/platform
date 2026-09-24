/* Cloud Chromium gate for the human-facing private-to-Forum decision.
   The HTTP suites prove the route. This clicks the standard and Home controls that supply
   text and consent, at 390px, then has another member read the actual room. */
'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV = 'test';
process.env.IQ_COMPOSER = '1';
const { chromium } = require('playwright-core');
const ai = require('../ai/gateway.js');
const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, orgNodes } = S;
let pass = 0, fail = 0;
function ok(label, condition) {
  if (condition) { pass++; console.log('  PASS', label); }
  else { fail++; console.error('  FAIL', label); }
}
const C = 'fsh', X = 'fsx';
const NOW = Date.UTC(2026, 2, 10, 9, 0, 0), DAY = 86400000;
const SQUAD = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'p11', 'p12'];

const SIG = (who, n, at) => ({ kind: 'observation', status: 'active', source: who,
  originRef: `o_${who}_${n}`, at, turnId: `t_${who}_${n}`, directness: 'direct',
  authority: 'corroborated', specificity: 0.7, ref: `ev_${who}_${n}`, contributedBy: who,
  text: 'something the squad noticed' });

const INQ = (id, concept, label, unknowns = []) => ({
  inquiryId: id, subjectRef: 'group:sq', topic: { canonicalConcept: concept, label },
  status: 'exploring',
  hypotheses: [{ id: `h_${id}`, statement: `A working read about ${label}`,
    confidence: { score: 0.7, band: 'probable' }, status: 'open' }],
  leadingHypothesisId: `h_${id}`,
  signals: SQUAD.slice(0, 5).map((w, i) => SIG(w, id, NOW - (10 - i) * DAY)),
  confidence: { score: 0.7, band: 'probable', because: ['5 independent origins'] },
  missingSignals: unknowns.map(question => ({ question })),
  falsifiers: [], timeline: [], lastUpdatedAt: NOW,
});

_loadAllStores({
  orgMeta:  { [C]: { orgName: 'Alma College', orgMode: 'sports' }, [X]: { orgName: 'Elsewhere', orgMode: 'sports' } },
  orgUsers: {
    [C]: {
      coach: { id: 'coach', name: 'Head Coach', email: 'c@f.io', role: 'coach', orgCode: C, status: 'active', leadershipNodeIds: ['sq'], assignedNodeIds: [] },
      ...Object.fromEntries(SQUAD.map((id, i) => [id, { id, name: `Player ${i + 1}`, email: `${id}@f.io`, role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['sq'] }])),
      out: { id: 'out', name: 'Other Squad', email: 'o@f.io', role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['res'] },
    },
    [X]: { far: { id: 'far', name: 'Far Away', email: 'f@f.io', role: 'coach', orgCode: X, status: 'active', leadershipNodeIds: ['th'] } },
  },
  orgNodes: {
    [C]: {
      sq:  { nodeId: 'sq',  name: 'First Team', parentId: null, childNodeIds: [], memberIds: SQUAD, leaderIds: ['coach'] },
      res: { nodeId: 'res', name: 'Reserves',   parentId: null, childNodeIds: [], memberIds: ['out'], leaderIds: [] },
    },
    [X]: { th: { nodeId: 'th', name: 'Theirs', parentId: null, childNodeIds: [], memberIds: [], leaderIds: ['far'] } },
  },
  inquiryStates: { [C]: { 'group:sq': {
    inq_q: INQ('inq_q', 'football.build_up', 'Building from the back',
      ['does starting deeper actually help, or does it just move the problem?']),
  } } },
  /* A FOCUS SHARED WITH CHOSEN PEOPLE — created from a conversation, no originating Inquiry, a
     room because two or more people can read it. That is the exact shape the live iPhone Ask
     failure appeared on, and it has no node, which is what broke the group-shaped ask route. */
  userAiProfiles: { [`${C}:p1`]: { focuses: [{
    id: 'foc_ui', text: 'Focus more on wins and conceding less', status: 'active',
    visibility: 'selected', participants: ['p1', 'p2'],
    createdAt: new Date(NOW - 3 * DAY).toISOString(),
    target: 'fewer goals conceded in the last twenty minutes',
  }] } },
  teamFocuses: { [C]: {
    sq:  [{ focusId: 'tf_press', nodeId: 'sq', text: 'Press from the first touch', status: 'active',
      createdAt: NOW - 6 * DAY, by: 'coach', origin: { from: 'leader', by: 'coach', at: NOW - 6 * DAY, inquiryId: null } }],
    res: [{ focusId: 'tf_solo', nodeId: 'res', text: 'One person, one focus', status: 'active',
      createdAt: NOW - 3 * DAY, by: 'out', origin: { from: 'leader', by: 'out', at: NOW - 3 * DAY, inquiryId: null } }],
  } },
});
_rebuildEmailIndex();

/* THE WORDS. Distinctive enough that finding them anywhere they do not belong is unmistakable. */
const SAID    = 'the middle third is where we keep losing it';
const EDITED  = 'we keep losing it in the middle third, and that is the bit to work on';
const PRIVATE = 'honestly I think the goalkeeper is costing us games';


const REAL = { enabled: ai.enabled, budgetAvailable: ai.budgetAvailable, complete: ai.complete, completeJSON: ai.completeJSON };
let offerText = SAID;
Object.assign(ai, {
  enabled: () => true, budgetAvailable: () => true,
  complete: async () => '',
  completeJSON: async o => String((o && o.taskType) || '') === 'composer_action_interpret'
    ? { actions: [{ type: 'share_to_forum', arguments: { text: offerText },
      reason: 'You said you wanted the squad to see this.' }] } : null,
});

(async () => {
  const server = await new Promise(resolve => { const s = app.listen(0, () => resolve(s)); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const token = issueToken('p1', C, 'member');
  const reader = issueToken('p2', C, 'member');
  const H = t => ({ Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' });
  const req = async (url, t, body) => {
    const r = await fetch(base + url, { method: body ? 'POST' : 'GET', headers: H(t),
      body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, j: await r.json() };
  };
  const room = () => req('/api/group/sq/forum/inq_q', reader);
  const stage = async () => {
    const r = await req('/api/assistant/turn', token,
      { text: 'Put this to the group: ' + SAID, about: { kind: 'inquiry', id: 'inq_q' } });
    const p = ((r.j && r.j.response && r.j.response.proposedActions) || [])
      .find(x => x.actionType === 'share_to_forum');
    return { envelope: r.j, prop: p };
  };
  /* PINNED, THE WAY ITS NINE SIBLINGS ARE. This alone fell back to
     `chromium.executablePath()`, which resolves against the playwright package's expected build
     rather than what is on the machine — here it asked for `chromium-1228` and the container has
     `chromium-1194`. The launch then failed inside an unhandled rejection, so the process did not
     exit: it printed the error and HUNG, which is worse than failing, because a harness that runs
     the checks in a loop stops at this one and never reaches the rest.

     `CHROMIUM_PATH` still wins when it is set, so a machine with a different build overrides it
     the same way it always could. What changes is the fallback: the known path, not a guess. */
  /* Resolve the browser from the Playwright installation used by THIS runner. The old
     hard-coded /opt/pw-browsers/chromium-1194 path was from an earlier image; GitHub Actions now
     installs Playwright's current Chromium into its cache, so the old path caused an
     unhandled launch rejection and left the server alive until the job timeout. */
  const { chromiumPath } = require('./lib/chromium-path.js');
  /* One owner for "which browser". Resolving `chromium.executablePath()` directly returns the
     build playwright-core was published against, which in this container does not exist — and a
     launch on a missing executable HANGS rather than failing, so the gate produced no output and
     looked like an environment without Chromium. See scripts/lib/chromium-path.js. */
  const EXE = chromiumPath(chromium);
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => { if (!/^Chart is not defined$/.test(e.message)) errors.push(e.message); });
  try {
    await page.addInitScript(([t, code]) => {
      localStorage.setItem('iq_auth', JSON.stringify({
        user: { id: 'p1', name: 'Player 1', role: 'member', orgCode: code, profileComplete: true },
        org: { orgName: 'Alma College', orgMode: 'sports', organizationProfileComplete: true },
        token: t, permissions: null, domain: null }));
      localStorage.setItem('iq_profile_complete_p1', '1');
    }, [token, C]);
    await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1700);
    const notice = await page.$('button:has-text("I understand")');
    if (notice) await notice.click().catch(() => {});
    await page.waitForTimeout(900);
    /* STAGED WHERE THE PRODUCT PUTS THESE CARDS. It used to be appended to document.body, which is
       outside the app's layout entirely — and once the composer moved into the shell as a fixed
       bar, the bar sat over the bottom of the viewport and swallowed the click on Confirm, so
       FB-4 timed out waiting for a POST that the button never got to send.

       The product renders a proposal into the conversation, inside `.page-content`, which
       reserves room below itself for exactly this reason. Staging it there is both the fix and
       the more faithful harness: a card floated over the app in a place no card ever appears
       cannot tell us whether a real one is reachable. */
    await page.evaluate(() => {
      const root = document.createElement('section');
      root.id = 'forum-browser-gate';
      (document.querySelector('.page-content') || document.body).appendChild(root);
    });
    ok('FB-0 two authorized people have a real empty room', (await room()).j.messages.length === 0);

    const first = await stage();
    ok('FB-1 the standard surface gets an actual governed offer', !!first.envelope && !!first.prop);
    await page.evaluate(envelope => {
      document.getElementById('forum-browser-gate').innerHTML = MemberApp._renderAssistant(envelope);
    }, first.envelope);
    const standard = page.locator('#forum-browser-gate .iq-proposal[data-proposal="' + first.prop.id + '"]');
    ok('FB-2 standard card shows exact proposed words, audience count and privacy boundary',
      (await standard.innerText()).includes(SAID)
      && /Audience:/.test(await standard.innerText())
      && /13 current readers/.test(await standard.innerText())
      && /rest of this conversation stays private/.test(await standard.innerText()));
    ok('FB-3 rendering alone does not publish private chat', (await room()).j.messages.length === 0);
    await standard.locator('textarea.iq-share-edit').fill(EDITED);
    const [standardResponse] = await Promise.all([
      page.waitForResponse(r => r.url().includes('/confirm') && r.request().method() === 'POST'),
      standard.locator('button.btn-primary').click({ force: true }),
    ]);
    ok('FB-4 clicking standard Confirm posts only edited words',
      standardResponse.status() === 200 && (await room()).j.messages.some(m => m.text === EDITED)
      && !(await room()).j.messages.some(m => m.text === SAID));

    const second = await stage();
    ok('FB-5 Home receives a second actual proposal', !!second.prop);
    await page.evaluate(envelope => {
      document.getElementById('forum-browser-gate').innerHTML = todayRenderProposals(envelope);
    }, second.envelope);
    const home = page.locator('#today-prop-' + second.prop.id);
    ok('FB-6 Home shows exact proposed words and current readers before Confirm',
      (await home.locator('textarea.iq-share-edit').inputValue()) === SAID
      && /13 current readers/.test(await home.innerText())
      && /rest of this conversation stays private/.test(await home.innerText()));
    const homeWords = 'our own note about changing shape at half-time';
    await home.locator('textarea.iq-share-edit').fill(homeWords);
    const [homeResponse] = await Promise.all([
      page.waitForResponse(r => r.url().includes('/confirm') && r.request().method() === 'POST'),
      home.locator('button:has-text("Confirm")').click({ force: true }),
    ]);
    ok('FB-7 clicking Home Confirm posts those edited words for another member',
      homeResponse.status() === 200 && (await room()).j.messages.some(m => m.text === homeWords));
    /* AND THEN THE APP HAS TO TAKE THEM THERE. Confirming this action returns `forum:{…}` and the
       client opens the room — but the room renders into #iq-inquiries-page, which lives inside
       the Inquiries page, and this confirmation was on Home. Rendering into a hidden page is
       indistinguishable, to the person, from the app doing nothing: they have just deliberately
       put their words in front of twelve people and the screen does not move.

       `openObjectThread` already carries the fix for precisely this, with a comment saying the
       bug shipped once ("tapping the card on Home silently did nothing"). Its sibling never got
       it. This assertion is what makes that a shipped fix rather than a comment. */
    await page.waitForTimeout(1100);
    ok('FB-7a …and the room they just posted into is actually on screen, not drawn on a hidden page',
      await page.locator('#iq-inquiries-page .iq-object-thread').isVisible()
      && (await page.locator('#iq-inquiries-page .iqt-turns').innerText()).includes(homeWords));

    const beforeStale = (await room()).j.messages.length;
    const stale = await stage();
    await page.evaluate(envelope => {
      document.getElementById('forum-browser-gate').innerHTML = MemberApp._renderAssistant(envelope);
    }, stale.envelope);
    const staleCard = page.locator('#forum-browser-gate .iq-proposal[data-proposal="' + stale.prop.id + '"]');
    const roster = orgNodes[C].sq.memberIds.slice();
    orgNodes[C].sq.memberIds = roster.filter(x => x !== 'p3').concat(['out']);
    const [staleResponse] = await Promise.all([
      page.waitForResponse(r => r.url().includes('/confirm') && r.request().method() === 'POST'),
      staleCard.locator('button.btn-primary').click({ force: true }),
    ]);
    await page.waitForTimeout(150);
    ok('FB-8 server refuses a same-size changed audience and posts nothing',
      staleResponse.status() === 409 && (await room()).j.messages.length === beforeStale);
    ok('FB-9 standard UI names changed readers and disables stale confirmation',
      /people who can read|audience changed/i.test(await staleCard.innerText())
      && (await staleCard.locator('button.btn-primary').count() === 0
        || await staleCard.locator('button.btn-primary').isDisabled()));
    orgNodes[C].sq.memberIds = roster;

    const staleHome = await stage();
    await page.evaluate(envelope => {
      document.getElementById('forum-browser-gate').innerHTML = todayRenderProposals(envelope);
    }, staleHome.envelope);
    const homeCard = page.locator('#today-prop-' + staleHome.prop.id);
    orgNodes[C].sq.memberIds = roster.filter(x => x !== 'p4').concat(['out']);
    const [staleHomeResponse] = await Promise.all([
      page.waitForResponse(r => r.url().includes('/confirm') && r.request().method() === 'POST'),
      homeCard.locator('button:has-text("Confirm")').click({ force: true }),
    ]);
    await page.waitForTimeout(150);
    ok('FB-10 Home refuses the changed audience without posting',
      staleHomeResponse.status() === 409 && (await room()).j.messages.length === beforeStale);
    ok('FB-11 Home names changed readers and removes stale Confirm',
      /people who can read|audience changed/i.test(await homeCard.innerText())
      && await homeCard.locator('button:has-text("Confirm")').count() === 0);
    orgNodes[C].sq.memberIds = roster;

    /* ── ASKING INTELLIQ FROM INSIDE THE ROOM, ON A PHONE ────────────────────────────────────
       The HTTP suite proves the route never posts. That is the server's half. This is the half
       that decides whether a person believes it: they are standing in a room with other people's
       speech on screen, and they tap something. If the answer lands looking like a message, or
       the room gains a line, the product has told them the opposite of the truth — and no
       server-side assertion can catch that, because nothing about the response would change.

       It also replaces six assertions that read js/app.js as text. Source text is not a screen.
       A button can be present in the file and unreachable, off-viewport, or under the fixed
       composer bar — which is exactly how FB-4 failed once before. */
    const beforeAsk = (await room()).j.messages.length;
    await page.evaluate(() => MemberApp.openForum('sq', 'inq_q', 'group', 'inquiry'));
    await page.waitForTimeout(900);
    const askBtn = page.locator('button.iqf-ask');
    ok('FB-13 the real room renders an Ask IntelliQ control',
      await askBtn.count() === 1 && await askBtn.isVisible());
    const box = await askBtn.boundingBox();
    ok('FB-14 …big enough to hit with a thumb, and inside a 390px screen',
      !!box && box.height >= 40 && box.x >= 0 && (box.x + box.width) <= 390);
    /* ONE BOX, NOT TWO. The room's composer sends to the room; asking must not look like a
       second place to type, because the difference between two boxes here is who reads you. */
    ok('FB-15 …and the room still offers exactly one place to type',
      await page.locator('#iq-forum-input').count() === 1
      && await page.locator('.iqf-ask-row textarea, .iqf-ask-row input').count() === 0);
    const [askResponse] = await Promise.all([
      page.waitForResponse(r => /\/forum\/inq_q\/ask$/.test(r.url()) && r.request().method() === 'POST'),
      askBtn.click(),
    ]);
    await page.waitForTimeout(400);
    const answerText = (await page.locator('#iqf-answer').innerText()).trim();
    ok('FB-16 tapping it answers the asker on screen, under a heading naming who can see it',
      askResponse.status() === 200 && answerText.length > 40
      && /only you can see this/i.test(answerText));
    /* NOT A MESSAGE. Not in the list, and not wearing a message's clothes. */
    /* `.iqt-turns` IS THE LIST, and naming it exactly is the whole assertion. This first read
       `.iqf-msgs, .iqf-list, #iqf-messages` — three plausible names, none of which exist in the
       markup. `querySelector` returned null, the clause fell through to true, and moving the
       answer bodily inside the real list left it green. A selector that matches nothing is not a
       weak check, it is an absent one wearing the costume of a check. */
    ok('FB-17 …rendered outside the room\'s message list, not as another line of speech',
      await page.locator('#iqf-answer .iq-msg, #iqf-answer .iqf-msg').count() === 0
      && await page.evaluate(() => {
        const a = document.getElementById('iqf-answer');
        const list = document.querySelector('.iqt-turns');
        return !!a && !!list && !list.contains(a);
      }));
    ok('FB-18 …and the room itself gained nothing from the asking',
      (await room()).j.messages.length === beforeAsk);
    /* AND THE OTHER PERSON. The one who would have been spoken to, had this leaked. */
    ok('FB-19 …so the other member reads the room and finds none of that answer',
      !JSON.stringify((await room()).j.messages).includes(answerText.slice(-60)));

    /* ── ASK INTELLIQ IN A FOCUS FORUM, WHICH IS WHERE IT BROKE LIVE ────────────────────────
       Findings R1 #19: on a real iPhone the founder opened a Focus Forum, tapped "Ask IntelliQ
       about this", and was shown

         Unknown API endpoint: POST /group//forum/foc_rkvv6fnb/ask

       — a group route with an empty node segment, because a Focus room has no node and the ask
       built its own path. The room itself had always worked for both kinds; only the ask was
       group-shaped. This walks the same tap on the same kind of room. */
    const focusRoom = await page.evaluate(async () => {
      const t = JSON.parse(localStorage.getItem('iq_auth')).token;
      const r = await fetch('/api/forum/focus/foc_ui', { headers: { Authorization: 'Bearer ' + t } });
      return { status: r.status, j: await r.json().catch(() => null) };
    });
    ok('FB-20 the Focus has a room its members can open', focusRoom.status === 200);
    await page.evaluate(() => MemberApp.openForum('', 'foc_ui', 'focus', 'focus'));
    await page.waitForTimeout(1400);
    const askBtn2 = page.locator('button.iqf-ask');
    ok('FB-21 …and the room offers Ask IntelliQ', await askBtn2.count() === 1 && await askBtn2.isVisible());
    const [askRes] = await Promise.all([
      page.waitForResponse(r => /\/ask$/.test(r.url()) && r.request().method() === 'POST'),
      askBtn2.click(),
    ]);
    /* THE EXACT LIVE SIGNATURE. An empty segment is what `/group//forum/` is, and it is the one
       thing this assertion exists to catch. */
    ok('FB-22 …addressed at the room that was opened, with no empty segment in the path',
      !/\/\//.test(askRes.url().replace(/^https?:\/\//, '')) && askRes.status() === 200);
    await page.waitForTimeout(500);
    const answer2 = (await page.locator('#iqf-answer').innerText()).trim();
    ok('FB-23 …and a private answer renders, under a heading naming who can see it',
      answer2.length > 40 && /only you can see this/i.test(answer2));
    ok('FB-24 …without adding anything to the room',
      await page.evaluate(async () => {
        const t = JSON.parse(localStorage.getItem('iq_auth')).token;
        const r = await fetch('/api/forum/focus/foc_ui', { headers: { Authorization: 'Bearer ' + t } });
        const j = await r.json();
        return (j.messages || []).length === 0;
      }));

    ok('FB-12 these rendered journeys raised no uncaught client error', errors.length === 0);
  } catch (e) { fail++; console.error('  FAIL browser fixture threw:', e && e.stack); }
  finally {
    Object.assign(ai, REAL);
    await ctx.close(); await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
  console.log('forum-share-browser-check: ' + pass + ' passed, ' + fail + ' failed');
  process.exitCode = fail ? 1 : 0;
})();
