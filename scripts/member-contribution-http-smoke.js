/* Truth layer — THE MEMBER'S OWN HALF OF THE A→B LOOP, FROM THE COMPOSER OUT.

   WHAT THIS EXISTS TO FIX. group-subject-smoke proves the contribution boundary thoroughly, and
   it proves it by calling `_noteGroupCandidates` directly. The independent gate was right that
   this is not the same claim: seeding a candidate proves the rules a candidate is subject to, and
   says nothing about whether a person talking to IntelliQ ever produces one. The whole defect
   class this engagement keeps finding is exactly that shape — a correct mechanism with no door.

   So every step below starts at POST /api/assistant/turn, which is the personal composer, and
   walks to a group Focus with a recorded outcome:

     1  a member says something in their own private conversation
     2  the system NOTICES it might concern their squad, and does nothing else
     3  the member deliberately contributes it
     4  what crosses is a REFERENCE, never their words
     5  one voice is not corroboration, and the same voice twice is not two
     6  a second independent origin from a second person opens the group inquiry
     7  a leader sets a Focus OUT OF that inquiry
     8  the leader records what came of it
     9  the closed focus stays, with its outcome, beside whatever is running now

   THE MODEL BOUNDARY IS STUBBED, NOT THE PATH. ai.completeJSON is the one seam — it is where a
   model reads an utterance and proposes what was observed. Everything after it is the real
   intake, the real grounding, the real classifier, the real candidate store and the real routes.

   Run: node scripts/member-contribution-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
process.env.IQ_COMPOSER = '1';

const ai = require('../ai/gateway.js');
const contribution = require('../ai/contribution.js');
const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, groupCandidates, inquiryStates, _teamFocuses } = S;

let pass = 0, fail = 0;
/* A THROW IS A FAILURE, NOT A SILENT EXIT — PROTOCOL lie #8. */
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const C = 'ctr', X = 'far';
_loadAllStores({
  orgMeta: { [C]: { orgName: 'Alma College', orgMode: 'sports' }, [X]: { orgName: 'Elsewhere', orgMode: 'sports' } },
  orgUsers: {
    [C]: {
      coach: { id: 'coach', name: 'Head Coach', email: 'c@x.io', role: 'coach', orgCode: C, status: 'active', leadershipNodeIds: ['u18'], assignedNodeIds: [] },
      alex:  { id: 'alex',  name: 'Alex Mbeki', email: 'a@x.io', role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['u18'] },
      bo:    { id: 'bo',    name: 'Bo Lindqvist', email: 'b@x.io', role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['u18'] },
      cass:  { id: 'cass',  name: 'Cass Oyelaran', email: 'd@x.io', role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['u18'] },
      out:   { id: 'out',   name: 'Other Squad', email: 'o@x.io', role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['res'] },
    },
    [X]: { far: { id: 'far', name: 'Far Away', email: 'f@x.io', role: 'coach', orgCode: X, status: 'active', leadershipNodeIds: ['theirs'] } },
  },
  orgNodes: {
    [C]: {
      u18: { nodeId: 'u18', name: 'Under 18s', parentId: null, childNodeIds: [], memberIds: ['alex', 'bo', 'cass'], leaderIds: ['coach'] },
      res: { nodeId: 'res', name: 'Reserves', parentId: null, childNodeIds: [], memberIds: ['out'], leaderIds: [] },
    },
    [X]: { theirs: { nodeId: 'theirs', name: 'Theirs', parentId: null, childNodeIds: [], memberIds: [], leaderIds: ['far'] } },
  },
});
_rebuildEmailIndex();

const REAL = { enabled: ai.enabled, budgetAvailable: ai.budgetAvailable, complete: ai.complete, completeJSON: ai.completeJSON };
/* What the model "reads" out of the next utterance. Set before each turn; the intake path, the
   grounding, the scope classifier and the candidate store are all real below this line. */
let NEXT = null;
Object.assign(ai, {
  enabled: () => true,
  budgetAvailable: () => true,
  // The composed reply is not what this suite is about; an empty one degrades the turn to the
  // deterministic path, which still stores the turn and still runs intake.
  complete: async () => '',
  completeJSON: async () => NEXT,
});

const SAID = {
  alex: 'Our press trigger is unclear and we keep stepping at different times in the second half.',
  bo:   'We are not agreeing on when to press as a team, the squad goes at different moments.',
  cass: 'We are not agreeing on when to press as a team, the squad goes at different moments.',
};
/* The SAME phenomenon named the same way by two people, from two DIFFERENT occasions. That is
   what corroboration means here. The third fixture repeats the second one's origin, which is what
   it means for a room to agree with itself. */
const propose = (id, origin, utterance) => ({
  worthInquiry: true,
  proposals: [{
    level: 'observation', id, originRef: origin, originKind: 'first_hand',
    text: 'the press trigger is unclear across the squad',
    sourceSpan: utterance, domainConcept: 'press_trigger', concerns: 'group',
  }],
  concepts: [], unknowns: [],
});

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = t => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });
  const T = {
    coach: issueToken('coach', C, 'coach'), alex: issueToken('alex', C, 'member'),
    bo: issueToken('bo', C, 'member'), cass: issueToken('cass', C, 'member'),
    out: issueToken('out', C, 'member'), far: issueToken('far', X, 'coach'),
  };
  const get  = (u, t) => fetch(base + u, { headers: H(t) }).then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const post = (u, t, b) => fetch(base + u, { method: 'POST', headers: H(t), body: JSON.stringify(b || {}) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));

  /* THE COMPOSER, then the wait. Intake runs UNAWAITED so that understanding a turn never delays
     answering it, which means a test that reads the candidate list immediately reads it too
     early — and a test that sleeps a fixed time is a test that goes green on a fast machine and
     red on a slow one. Poll for the thing, with a ceiling, and fail loudly if it never arrives. */
  const speak = async (who, text, payload) => {
    NEXT = payload;
    await post('/api/assistant/turn', T[who], { text });
    for (let i = 0; i < 60; i++) {
      const r = await get('/api/group/u18/candidates', T[who]);
      if (r.j && (r.j.candidates || []).length) return r.j.candidates;
      await new Promise(res => setTimeout(res, 25));
    }
    return [];
  };

  try {
    console.log('\n  1-2 — A PERSON SAYS SOMETHING, AND THE SYSTEM NOTICES WITHOUT PUBLISHING');
    const alexCands = await speak('alex', SAID.alex, propose('ev_alex_1', 'alex_sat_match', SAID.alex));
    ok('MC1 a member talking to IntelliQ in their OWN conversation produces a group candidate — the door the loop was missing',
      alexCands.length === 1 && alexCands[0].concept === 'press_trigger');
    ok('MC1b …and it is a NOTICING, not a publication: the group subject does not exist yet',
      !(inquiryStates[C] || {})['group:u18']);
    const byBo = await get('/api/group/u18/candidates', T.bo);
    const byCoach = await get('/api/group/u18/candidates', T.coach);
    ok('MC2a another member of the same node sees none of it',
      byBo.status === 200 && (byBo.j.candidates || []).length === 0);
    ok('MC2b leading the node grants no view of a member\'s private noticing either',
      byCoach.status === 200 && (byCoach.j.candidates || []).length === 0);
    ok('MC2c somebody on another squad cannot even ask',
      (await get('/api/group/u18/candidates', T.out)).status === 403);
    ok('MC2d …and another tenant gets the same answer a non-existent node gets',
      (await get('/api/group/u18/candidates', T.far)).status === 404);

    console.log('\n  3-4 — WHAT CROSSES IS A REFERENCE, AND ONLY BECAUSE THEY SAID SO');
    const candA = groupCandidates[C].find(c => c.contributorId === 'alex');
    ok('MC3 the candidate holds a REFERENCE to their evidence and NOT their words',
      !!candA && candA.evidenceRef === 'ev_alex_1'
      && !JSON.stringify(candA).includes('stepping at different times'));
    ok('MC3b …and it carries the ORIGIN, so contributing later cannot launder a retelling into a second account',
      candA.originRef === 'alex_sat_match');

    ok('MC4 a leader cannot contribute somebody else\'s account for them — leadership governs the group, not the contents of a private conversation',
      (await post('/api/group/u18/contribute', T.coach, { candidateId: candA.candidateId })).status === 403);
    ok('MC4b …nor can a member of a different squad',
      (await post('/api/group/u18/contribute', T.out, { candidateId: candA.candidateId })).status === 403);
    ok('MC4c …nor another tenant, which fails closed at the node rather than at the candidate',
      (await post('/api/group/u18/contribute', T.far, { candidateId: candA.candidateId })).status === 404);
    ok('MC4d …and nothing has been contributed by any of those attempts',
      groupCandidates[C].every(c => c.status === 'detected'));

    const first = await post('/api/group/u18/contribute', T.alex, { candidateId: candA.candidateId });
    ok('MC5 the member themselves contributes it, deliberately',
      first.status === 200 && first.j.contributed === candA.candidateId);
    ok('MC5b ONE VOICE IS NOT CORROBORATION — the group inquiry does not open on a single account',
      first.j.groupInquiry === 'not yet' && first.j.decision && first.j.decision.open === false
      && first.j.decision.rule === 'BELOW_THRESHOLD');
    ok('MC5c …and still nothing exists at the group subject, so "not yet" means nothing was written',
      !(inquiryStates[C] || {})['group:u18']);

    /* CONTRIBUTING TWICE. The honest answer is a refusal that SAYS the thing is already
       contributed, not a silent second write that would count one account twice. */
    const again = await post('/api/group/u18/contribute', T.alex, { candidateId: candA.candidateId });
    ok('MC6 contributing the same candidate again is refused, and the refusal says what state it is in',
      again.status === 409 && /already contributed/i.test(again.j.error || ''));
    ok('MC6b …and the candidate is still contributed exactly once',
      groupCandidates[C].filter(c => c.candidateId === candA.candidateId && c.status === 'contributed').length === 1);

    console.log('\n  5 — A ROOM AGREEING WITH ITSELF IS STILL ONE ORIGIN');
    const cassCands = await speak('cass', SAID.cass, propose('ev_cass_1', 'alex_sat_match', SAID.cass));
    ok('MC7 a second PERSON produces their own candidate',
      cassCands.length === 1);
    const candC = groupCandidates[C].find(c => c.contributorId === 'cass');
    const echo = await post('/api/group/u18/contribute', T.cass, { candidateId: candC.candidateId });
    ok('MC7b …and two people relaying the SAME origin does not open the inquiry — repetition is not corroboration',
      echo.j.groupInquiry === 'not yet' && echo.j.decision.rule === 'ECHO'
      && echo.j.decision.contributors === 2 && echo.j.decision.independentOrigins === 1);
    ok('MC7c …and the refusal is explainable in the vocabulary the rule is written in, not a bare no',
      /repetition, not corroboration/i.test(echo.j.decision.reason || ''));

    console.log('\n  6 — TWO INDEPENDENT ORIGINS, TWO PEOPLE, AND IT OPENS');
    const boCands = await speak('bo', SAID.bo, propose('ev_bo_1', 'bo_tue_session', SAID.bo));
    const candB = groupCandidates[C].find(c => c.contributorId === 'bo');
    ok('MC8 the third member\'s account comes from a DIFFERENT occasion', !!candB && candB.originRef === 'bo_tue_session');
    const opened = await post('/api/group/u18/contribute', T.bo, { candidateId: candB.candidateId });
    ok('MC8b …and the group inquiry opens, on independent origins rather than on head count',
      opened.j.groupInquiry === 'open' && opened.j.decision.rule === 'INDEPENDENT_CORROBORATION'
      && opened.j.decision.independentOrigins === 2);

    const groupInq = await get('/api/group/u18/inquiry', T.alex);
    const inqJSON = JSON.stringify(groupInq.j);
    ok('MC9 the squad can now read what it is working out',
      groupInq.status === 200 && /press/i.test(inqJSON));
    ok('MC9a NO PRIVATE TEXT CROSSED — not one of the three sentences anybody actually typed',
      !inqJSON.includes('stepping at different times') && !inqJSON.includes('the squad goes at different moments'));
    ok('MC9b …and the leader reads the same object rather than a second, richer one',
      /press/i.test(JSON.stringify((await get('/api/group/u18/inquiry', T.coach)).j)));
    ok('MC9c …while somebody on another squad cannot read it at all',
      (await get('/api/group/u18/inquiry', T.out)).status === 403);
    const gid = (() => {
      const bySubject = (inquiryStates[C] || {})['group:u18'] || {};
      const inq = Object.values(bySubject)[0];
      return inq && inq.inquiryId;
    })();
    ok('MC9d the admitted signals count TWO origins and not three voices',
      (() => {
        const inq = Object.values((inquiryStates[C] || {})['group:u18'] || {})[0];
        const origins = new Set((inq.signals || []).map(s => s.originRef).filter(Boolean));
        return origins.size === 2 && (inq.signals || []).length >= 2;
      })());

    console.log('\n  7-9 — A FOCUS OUT OF IT, AN OUTCOME, AND WHAT WAS LEARNED STAYS');
    ok('MC10 a MEMBER cannot set the squad\'s focus',
      (await post('/api/group/u18/focus', T.alex, { text: 'Press on the centre-back\'s first touch', fromInquiryId: gid })).status === 403);
    const badOrigin = await post('/api/group/u18/focus', T.coach, { text: 'Something else', fromInquiryId: 'inq_not_ours' });
    ok('MC10b …and a leader naming an inquiry that is not this group\'s is refused rather than quietly credited',
      badOrigin.status === 404);
    const focus = await post('/api/group/u18/focus', T.coach, { text: 'Press on the centre-back\'s first touch', fromInquiryId: gid });
    ok('MC11 the leader sets a focus OUT OF the inquiry the squad\'s own accounts opened',
      focus.status === 200 && focus.j.focus && focus.j.focus.origin
      && focus.j.focus.origin.from === 'inquiry' && focus.j.focus.origin.inquiryId === gid);
    const fid = focus.j.focus.focusId;
    ok('MC11b …and `from: inquiry` is what stops outcome learning crediting the system for a coach\'s own idea',
      (await post('/api/group/u18/focus', T.coach, { text: 'A coach\'s own hunch' })).j.focus.origin.from !== 'inquiry');

    const outcome = await post(`/api/group/u18/focus/${fid}/outcome`, T.coach, { result: 'unclear', note: 'ran alongside two other changes' });
    ok('MC12 the leader records what came of it, and "we cannot separate it" is a first-class answer',
      outcome.status === 200 && outcome.j.focus.outcome && outcome.j.focus.outcome.result === 'unclear');
    ok('MC12b a member cannot close the squad\'s focus',
      (await post(`/api/group/u18/focus/${fid}/outcome`, T.alex, { result: 'helped' })).status === 403);

    const state = await get('/api/group/u18/state', T.alex);
    const stJSON = JSON.stringify(state.j);
    ok('MC13 the closed focus is KEPT with its outcome — "we tried that, here is what happened" is the most valuable thing a group record holds',
      state.status === 200 && /unclear/.test(stJSON) && /centre-back/.test(stJSON));
    ok('MC13b …and the loop can reopen: a second focus on the SAME inquiry after the first closed',
      (await post('/api/group/u18/focus', T.coach, { text: 'Try a deeper trigger instead', fromInquiryId: gid })).j.focus.origin.inquiryId === gid);
    ok('MC13c …and that is visible on the group\'s own object, not somewhere else',
      /deeper trigger/.test(JSON.stringify((await get('/api/group/u18/state', T.alex)).j)));

    console.log('\n  AND THE CONTROLS ARE REACHABLE, NOT JUST THE ROUTES');
    const APP = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'app.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    ok('MC14 the member\'s contribution surface fetches the real candidate route',
      /\/api\/group\/\$\{[^}]*\}\/candidates/.test(APP));
    ok('MC14b …and the contribute control posts to the real contribute route',
      /\/api\/group\/\$\{[^}]*\}\/contribute/.test(APP));
    ok('MC14c …and the leader\'s focus-from-inquiry control posts fromInquiryId, so the loop is closed from the UI too',
      /fromInquiryId/.test(APP));
    ok('MC14d …and the outcome control posts to the outcome route',
      /\/api\/group\/\$\{[^}]*\}\/focus\/\$\{[^}]*\}\/outcome/.test(APP));

  } catch (e) { fail++; console.error('  FAIL member-contribution suite threw:', e && e.stack); }

  Object.assign(ai, REAL);
  server.close();
  console.log(`\nmember-contribution-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
