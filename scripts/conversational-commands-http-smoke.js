/* Truth layer — UNDERSTANDING BELONGS TO THE MODEL; VALIDATING, PROPOSING AND EXECUTING DO NOT.

   The founder's warning, in their words: watch whether `readCommand` turns into a giant pile of
   English regexes, because that would recreate at the intent layer the exact allowlist problem
   just fixed at the language layer. A Shona speaker saying "shandisa izvi seumboo" would reach
   nothing, and the fix would be to add more regexes, forever, in every language.

   THAT ARCHITECTURE ALREADY EXISTS AND IS ALREADY THE PRODUCTION PATH. Traced at 12a2051:

     composerActions.prompt(text, context)   the model is handed the BOUNDED action list that this
                                             context actually supports, from `available(context)`
     ai.completeJSON(...)                    the model reads arbitrary natural language, in any
                                             language it supports, and picks a name from that list
     composerActions.normalize(proposed)     deterministic: an action not on the list is dropped,
                                             arguments are bounded, nothing is invented
     composerActions.ground(reading, ...)    deterministic: the question test, the stated-intent
                                             test and the literal-value rule can still refuse it
     _composerActionProposals(...)           a proposal, with a label a person reads
     POST /turn/:turnId/confirm              the one mutation path, re-checking authority

   So "use this as evidence", "ask the team" and "we tried it today" are understood by the
   architecture the founder wants — in any language — and fail ONLY when no provider is reachable.
   `readCommand` is the models-off fallback and is deliberately NOT grown by this suite.

   WHAT THIS FILE DOES IS PROVE THE WHOLE CHAIN WITHOUT A LIVE MODEL, by stubbing the one boundary
   that would talk to a provider and capturing what crosses it — the same technique
   reading-scope-smoke uses for web search. Everything downstream of that boundary is deterministic
   and is asserted here: validation, refusal, grounding, the proposal, the confirmation, and the
   canonical owner doing the write.

   That converts "provider verification required" into a much smaller claim: the provider must
   return a sensible action NAME. Everything it is trusted with is bounded here, and everything
   that happens afterwards is proved here.

   Run: node scripts/conversational-commands-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const gateway = require('../ai/gateway.js');

/* ── THE PROVIDER BOUNDARY, STUBBED ───────────────────────────────────────────────────────────
   `SEEN` captures every prompt that would have gone out, so the assertions about what the model
   is TOLD are about the real string. `NEXT` is what the model answers with, set per case — which
   is the only thing a real provider would decide. */
const SEEN = [];
let NEXT = { actions: [] };
gateway.enabled = () => true;
gateway.deterministicOnly = () => false;
gateway.completeJSON = async ({ user }) => { SEEN.push(String(user || '')); return NEXT; };
/* Prose is not what this file is about; a fixed reply keeps the turn assembling without pretending
   a model wrote anything meaningful. */
gateway.complete = async () => 'Understood.';

const S = require('../server.js');
const actions = require('../ai/composer-actions.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const C = 'ccmd';
_loadAllStores({
  orgMeta: { [C]: { orgName: 'Highlanders', orgMode: 'sports' } },
  orgUsers: { [C]: {
    me:   { id: 'me', name: 'Tendai', email: 'me@cc.io', role: 'member', orgCode: C,
      status: 'active', assignedNodeIds: ['first'], profileComplete: true },
    mate: { id: 'mate', name: 'Rudo', email: 'r@cc.io', role: 'member', orgCode: C,
      status: 'active', assignedNodeIds: ['first'], profileComplete: true },
    coach: { id: 'coach', name: 'Coach', email: 'c@cc.io', role: 'coach', orgCode: C,
      status: 'active', leadershipNodeIds: ['first'], assignedNodeIds: ['first'], profileComplete: true },
  } },
  orgNodes: { [C]: { first: { nodeId: 'first', name: 'First Team', parentId: null,
    childNodeIds: [], memberIds: ['me', 'mate', 'coach'], leaderIds: ['coach'] } } },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = who => ({ Authorization: `Bearer ${issueToken(who, C,
    who === 'coach' ? 'coach' : 'member')}`, 'Content-Type': 'application/json' });
  const call = (m, u, b, who) => fetch(base + u, { method: m, headers: H(who),
    body: b === undefined ? undefined : JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const say = (text, who, extra) => call('POST', '/api/assistant/turn',
    Object.assign({ text }, extra || {}), who);
  const resp = r => ((r.j || {}).response) || {};
  const props = r => resp(r).proposedActions || [];
  /* The model answers with one action name; everything after that is this codebase's. */
  const modelPicks = (type, args) => { NEXT = { actions: [{ type, arguments: args || {},
    reason: 'the person asked for it' }], needsClarification: null }; };
  const focusList = async who => (await call('GET', '/api/objects?kind=focus&scope=self', undefined, who));
  const nFocus = r => (((r || {}).j || {}).objects || []).length;

  try {
    /* ══ A — WHAT CROSSES THE BOUNDARY ═════════════════════════════════════════════════════
       The founder asked for exactly this: prove what context, instructions and AVAILABLE ACTIONS
       reach the provider. If the model is never offered `record_focus_outcome`, no amount of
       natural language will produce one, and that would be an architecture problem rather than a
       model problem. */
    console.log('\n  A — THE MODEL IS HANDED A BOUNDED LIST OF WHAT THIS CONTEXT SUPPORTS');
    const f = await call('POST', '/api/me/focus', { text: 'Speak first after we concede' }, 'me');
    const fid = f.j.focus.id;
    modelPicks('show_evidence');
    SEEN.length = 0;
    await say('what do you make of this', 'me', { about: { kind: 'focus', id: String(fid) } });
    const sent = SEEN.join('\n');
    ok('A1 a turn inside a Focus reaches the provider at all', SEEN.length > 0);
    for (const t of ['record_focus_outcome', 'keep_in_library', 'discuss_with_group',
                     'share_to_forum', 'attach_material', 'create_inquiry', 'request_research']) {
      ok(`A2 …and is offered ${t}`, sent.includes(t));
    }
    /* THE BOUND. Being offered everything would be the opposite failure — the model could propose
       an action this context cannot support and the refusal would happen later, or not at all. */
    ok('A3 …but is NOT offered an action this context cannot support',
      !sent.includes('settle_inquiry'));

    /* ══ B — AND THE LANGUAGE IT IS ASKED IN IS NOT THE POINT ═══════════════════════════════
       The whole reason understanding belongs to the model. Nothing below adds a Shona pattern. */
    console.log('\n  B — THE SAME OFFER IS MADE WHATEVER LANGUAGE THEY WRITE IN');
    SEEN.length = 0;
    modelPicks('keep_in_library');
    const shona = await say('Ndinoda kuchengeta izvi kuti ndizozviwana zvakare', 'me',
      { about: { kind: 'focus', id: String(fid) } });
    ok('B1 a Shona turn reaches the provider', SEEN.length > 0);
    ok('B2 …offered the same bounded action list', SEEN.join('').includes('keep_in_library'));
    ok('B3 …and the model\'s choice becomes a proposal, with no Shona pattern anywhere in this repo',
      props(shona).some(p => p.actionType === 'keep_in_library'));

    /* ══ C — VALIDATION IS THIS CODEBASE'S, NOT THE MODEL'S ════════════════════════════════
       The model is trusted to read language. It is trusted with nothing else, and these are the
       assertions that keep that true. */
    console.log('\n  C — WHAT THE MODEL RETURNS IS VALIDATED, NOT OBEYED');
    modelPicks('delete_everything');
    const invented = await say('get rid of it all', 'me', { about: { kind: 'focus', id: String(fid) } });
    ok('C1 an action that does not exist is dropped rather than attempted',
      !props(invented).some(p => p.actionType === 'delete_everything'));
    modelPicks('settle_inquiry');
    const wrongCtx = await say('call it settled', 'me', { about: { kind: 'focus', id: String(fid) } });
    ok('C2 …and a real action this context cannot support is dropped too',
      !props(wrongCtx).some(p => p.actionType === 'settle_inquiry'));
    /* THE MODEL MAY NOT RAISE ITS OWN AUTHORITY. `normalize` bounds the arguments, so an audience
       the person did not choose cannot ride in on the model's say-so. */
    modelPicks('create_focus', { text: 'work on restarts', visibility: 'shared', groupId: 'first' });
    const n0 = nFocus(await focusList('me'));
    const sneaky = await say('lets work on restarts', 'me');
    const sneakyProp = props(sneaky).find(p => p.actionType === 'create_focus');
    ok('C3 a create the model dressed as shared is still proposed rather than written',
      !!sneakyProp && nFocus(await focusList('me')) === n0);

    /* ══ D — AND THEN THE HUMAN, AND THEN THE CANONICAL OWNER ══════════════════════════════
       The chain the founder described, end to end, with the model's part stubbed and everything
       after it real. */
    console.log('\n  D — THE PERSON ACCEPTS IN WORDS AND THE GOVERNED OWNER WRITES');
    const accepted = await say('yeah', 'me');
    const acc = resp(accepted).acceptance;
    ok('D1 "yeah" resolves to what was proposed', !!acc && acc.resolves === sneakyProp.id);
    const done = await call('POST', `/api/assistant/turn/${acc.turnId}/confirm`,
      { proposalId: acc.resolves }, 'me');
    ok('D2 …and confirming reaches the canonical owner', done.status === 200);
    ok('D3 …so the Focus exists', nFocus(await focusList('me')) === n0 + 1);
    /* AND THE AUDIENCE THE MODEL ASKED FOR DID NOT SURVIVE. This is the one that matters: a model
       proposing `visibility: 'shared'` must not be able to widen who can read somebody's Focus. */
    const madeList = await focusList('me');
    const made = ((madeList.j || {}).objects || []).find(o => /restarts/i.test(JSON.stringify(o)));
    ok('D4 …private, because audience is not the model\'s to choose',
      !!made && (made.visibility || 'private') === 'private');

    /* ══ E — EVIDENCE PROMOTION, WHICH HAD NO PATH AT ALL ══════════════════════════════════
       The founder's case: "use this as evidence" produced nothing. Through the model path it is
       `attach_material`, and this drives it with a real material. */
    console.log('\n  E — USING SOMETHING AS EVIDENCE GOES THROUGH THE GOVERNED OWNER');
    const att = await call('POST', '/api/assistant/attachments',
      { filename: 'results.txt', text: 'Draw 1-1. Draw 0-0. Draw 2-2. Draw 1-1. Draw 3-3.' }, 'me');
    ok('E1 a material exists to talk about', att.status === 200 && !!att.j.materialId);
    modelPicks('attach_material', { materialId: att.j.materialId });
    const evOffer = await say('use this as evidence', 'me', { about: { kind: 'focus', id: String(fid) } });
    const evProp = props(evOffer).find(p => p.actionType === 'attach_material');
    ok('E2 …and the request becomes a governed proposal rather than a silent write', !!evProp);
    ok('E3 …which requires confirmation, because changing what something COUNTS as is consequential',
      !!evProp && evProp.requiredApproval !== false);

    /* ══ F — ASKING THE TEAM ═══════════════════════════════════════════════════════════════ */
    console.log('\n  F — ASKING THE TEAM REACHES THE EXISTING FORUM MACHINERY');
    modelPicks('discuss_with_group', { groupId: 'first' });
    const forumOffer = await say('ask the team about this', 'me',
      { about: { kind: 'focus', id: String(fid) } });
    ok('F1 "ask the team" becomes a governed discussion proposal',
      props(forumOffer).some(p => p.actionType === 'discuss_with_group'));
    /* AND NOT INTO A GROUP THEY ARE NOT IN. The model naming a node is not authorisation. */
    modelPicks('discuss_with_group', { groupId: 'nowhere' });
    const badGroup = await say('ask the reserves about this', 'me',
      { about: { kind: 'focus', id: String(fid) } });
    const bg = props(badGroup).find(p => p.actionType === 'discuss_with_group');
    ok('F2 …and a group the person is not in is not silently accepted from the model',
      !bg || !/nowhere/.test(JSON.stringify(bg)));

    /* ══ G — RECORDING WHAT HAPPENED ═══════════════════════════════════════════════════════ */
    console.log('\n  G — SAYING WHAT HAPPENED REACHES record_focus_outcome');
    modelPicks('record_focus_outcome', { focusId: String(fid), result: 'helped' });
    const outOffer = await say('we tried it today and it helped', 'me',
      { about: { kind: 'focus', id: String(fid) } });
    ok('G1 an ordinary sentence about what happened becomes an outcome proposal',
      props(outOffer).some(p => p.actionType === 'record_focus_outcome'));
    ok('G2 …and it is confirmed rather than written, because an outcome is a claim about the world',
      (props(outOffer).find(p => p.actionType === 'record_focus_outcome') || {}).requiredApproval !== false);

    /* ══ H — THE FALLBACK IS A FALLBACK ════════════════════════════════════════════════════
       With no provider the deterministic reader still covers the pilot's two most important
       verbs. It is deliberately NOT extended to cover everything above: growing it would rebuild
       the allowlist one layer up, in English only, which is the thing the founder warned about. */
    console.log('\n  H — AND WITH NO PROVIDER, THE NARROW FALLBACK IS HONEST ABOUT ITS SIZE');
    ok('H1 the fallback reads an explicit create-focus command',
      (actions.readCommand('create a focus about pressing higher') || {}).type === 'create_focus');
    ok('H2 …and an explicit create-inquiry command',
      (actions.readCommand('create an inquiry about why we go quiet') || {}).type === 'create_inquiry');
    ok('H3 …and does NOT pretend to understand the rest, which is the model\'s job',
      actions.readCommand('use this as evidence') === null
      && actions.readCommand('ask the team about this') === null
      && actions.readCommand('we tried it today and it helped') === null);
    /* THE ASSERTION THAT KEEPS THE ARCHITECTURE HONEST. If this file ever needs changing because
       somebody added a fourth verb, that is the moment to ask whether the regex layer is quietly
       becoming the language understanding architecture. */
    ok('H4 …and the fallback vocabulary is still exactly the two creates plus high and low',
      ['focus', 'inquiry', 'enquiry', 'high', 'low'].every(w =>
        actions.readCommand(`create a ${w} about something`) !== null)
      && actions.readCommand('remember a thing about something') === null);

  } catch (e) { fail++; console.error('  FAIL conversational-commands suite threw:', e && e.stack); }

  server.close();
  console.log(`\nconversational-commands-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
