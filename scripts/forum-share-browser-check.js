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
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
    args: ['--no-sandbox'] });
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
    await page.evaluate(() => {
      const root = document.createElement('section');
      root.id = 'forum-browser-gate';
      document.body.appendChild(root);
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
      (await home.innerText()).includes(SAID)
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
