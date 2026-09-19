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
  /* A SQUAD'S OWN FOCUS, which every member can open and only its leader may put material on.
     Section E8 needs an object whose audience is a whole group rather than a list of named
     people: that is the only shape where "may I attach here" has a different answer from
     "may I open this". */
  teamFocuses: { [C]: { first: [
    { focusId: 'tf_restart', nodeId: 'first', text: 'Organise the first restart after conceding',
      status: 'active', createdAt: Date.now() - 6 * 86400000, by: 'coach',
      origin: { from: 'leader', by: 'coach', at: Date.now() - 6 * 86400000, inquiryId: null } },
  ] } },
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
       The founder's case, in their words: "Use this as evidence" produces no proposal. Through
       the model path it is `attach_material`, and the reason it produced nothing was NOT the
       vocabulary — the model has had that action all along (A2 above). It was referent binding:
       the material argument bound only to a file uploaded in the SAME turn, so a document
       attached three messages ago could not be named. */
    console.log('\n  E — USING SOMETHING AS EVIDENCE GOES THROUGH THE GOVERNED OWNER');
    /* THE REAL JOURNEY, not a convenient one. The report is uploaded into an ORDINARY CHAT —
       nothing on screen, no object bound — which is how a person on a phone actually does it.
       Only afterwards do they open the Focus and say to use it. So the document is not this
       turn's attachment, is not attached to the Focus, and until this pass could not be named. */
    const att = await call('POST', '/api/assistant/attachments',
      { filename: 'results.txt', text: 'Draw 1-1. Draw 0-0. Draw 2-2. Draw 1-1. Draw 3-3.' }, 'me');
    ok('E1 a material exists to talk about', att.status === 200 && !!att.j.materialId);
    const evConv = att.j.conversationId;
    const onFocus = async () => (((await call('GET',
      `/api/objects/focus/${fid}/materials`, undefined, 'me')).j || {}).materials || []);
    ok('E1b …and the Focus has nothing on it yet', (await onFocus()).length === 0);
    /* THE GAP THIS CLOSES. Nothing is uploaded on this turn; the conversation simply moves on,
       which is what makes "this" a referent rather than an upload receipt. */
    modelPicks('show_evidence');
    await say('what does that tell you', 'me',
      { conversationId: evConv, about: { kind: 'focus', id: String(fid) } });
    modelPicks('attach_material', { materialId: att.j.materialId });
    const evOffer = await say('use this as evidence', 'me',
      { conversationId: evConv, about: { kind: 'focus', id: String(fid) } });
    const evProp = props(evOffer).find(p => p.actionType === 'attach_material');
    ok('E2 …and a document from EARLIER in the conversation is still what "this" means', !!evProp);
    ok('E2b …bound to that document and no other',
      !!evProp && String(((evProp.effect || {}).material || {}).id) === String(att.j.materialId));
    /* AND THE CARD SAYS SO. A confirmation that names no file asks somebody to agree to
       "attach this material" about a document it will not identify. */
    ok('E2c …and the confirmation names the file by the name they gave it',
      !!evProp && ((evProp.effect || {}).material || {}).name === 'results.txt');
    ok('E3 …and it is proposed, not written: it needs a confirmation',
      !!evProp && evProp.requiredApproval !== false);
    ok('E3b …so nothing has been attached yet', (await onFocus()).length === 0);
    /* AND THEN THE GOVERNED OWNER WRITES. This is the assertion that makes the whole section
       about the product rather than about a card: the Focus really does end up holding it. */
    const evDone = await call('POST', `/api/assistant/turn/${evOffer.j.turnId}/confirm`,
      { proposalId: evProp.id }, 'me');
    ok('E3c confirming reaches the canonical owner', evDone.status === 200);
    const nowOn = await onFocus();
    ok('E3d …and the Focus now holds exactly that document',
      nowOn.length === 1 && String(nowOn[0].materialId || nowOn[0].id) === String(att.j.materialId));
    /* THE OTHER HALF OF THE FOUNDER'S RULE. An id the model names that this reader cannot open is
       not a licence to substitute the document that IS lying around. */
    modelPicks('attach_material', { materialId: 'mat_does_not_exist' });
    const ghost = await say('use that one as evidence', 'me',
      { conversationId: evConv, about: { kind: 'focus', id: String(fid) } });
    ok('E4 an unresolvable material id attaches nothing at all',
      !props(ghost).some(p => p.actionType === 'attach_material'));
    ok('E4b …and does not quietly substitute the one real document instead',
      !JSON.stringify(props(ghost)).includes(String(att.j.materialId)));
    /* AND POSSESSING ANOTHER PERSON'S ID IS NOT ACCESS. Rudo's private attachment exists; Tendai
       naming its real id must reach exactly the same nothing as naming a fictional one. */
    const hers = await call('POST', '/api/assistant/attachments',
      { filename: 'hers.txt', text: 'Rudo private notes about the back four shape.' }, 'mate');
    ok('E5 the other person really does have a material', hers.status === 200 && !!hers.j.materialId);
    modelPicks('attach_material', { materialId: hers.j.materialId });
    const stolen = await say('use that one as evidence', 'me',
      { conversationId: evConv, about: { kind: 'focus', id: String(fid) } });
    ok('E6 another person\'s material id is not a way to attach their document',
      !JSON.stringify(props(stolen)).includes(String(hers.j.materialId)));
    /* AND THE HARDER VERSION, ON AN OBJECT THEY BOTH HAVE OPEN. Above, Rudo's document is
       somewhere Tendai cannot reach at all, so the refusal could come from the shape of the pool
       rather than from a permission. Here it hangs on a Focus they are both in — it is in the
       place the pool looks — and the ONLY thing keeping it out is that a private material belongs
       to the person who uploaded it. Seeing where something is filed is not reading it. */
    const shared = await call('POST', '/api/me/focus',
      { text: 'Keep talking through the second half', groupId: 'first' }, 'coach');
    const shid = shared.j.focus.id;
    const hersHere = await call('POST', '/api/assistant/attachments',
      { filename: 'rudo-notes.txt', about: { kind: 'focus', id: String(shid) },
        text: 'Rudo: I stopped calling for it once we went behind.' }, 'mate');
    ok('E6b a document of hers hangs on a Focus they are both in', hersHere.status === 200);
    ok('E6c …and that Focus is open to him', (await call('GET',
      `/api/objects/focus/${shid}/materials`, undefined, 'me')).status === 200);
    modelPicks('attach_material', { materialId: hersHere.j.materialId });
    const overReach = await say('use this as evidence', 'me',
      { about: { kind: 'focus', id: String(shid) } });
    ok('E6d …but it is still not his to name: nothing is proposed',
      !props(overReach).some(p => p.actionType === 'attach_material'));
    ok('E6e …and its id never appears in what he is offered',
      !JSON.stringify(props(overReach)).includes(String(hersHere.j.materialId)));

    /* ══ E7 — AND WHEN SEVERAL THINGS ARE PLAUSIBLE, IT ASKS ═══════════════════════════════
       "Do not guess if several consequential referents are plausible." A second document on the
       same Focus makes "this" genuinely ambiguous, and the safe answer is a question. */
    console.log('\n  E7 — TWO DOCUMENTS MAKE "THIS" A QUESTION, NOT A GUESS');
    const att2 = await call('POST', '/api/assistant/attachments',
      { filename: 'notes.txt', conversationId: evConv, about: { kind: 'focus', id: String(fid) },
        text: 'Second half we stopped talking. Nobody organised the restart.' }, 'me');
    ok('E7a a second document is in the same conversation', att2.status === 200);
    modelPicks('attach_material', {});
    const ambiguous = await say('use this as evidence', 'me',
      { conversationId: evConv, about: { kind: 'focus', id: String(fid) } });
    ok('E7b with two plausible documents nothing is attached',
      !props(ambiguous).some(p => p.actionType === 'attach_material'));
    ok('E7c …and the person is asked which, by name',
      /which one do you mean/i.test(String(resp(ambiguous).responseText || ''))
      && /notes\.txt/.test(String(resp(ambiguous).responseText || ''))
      && /results\.txt/.test(String(resp(ambiguous).responseText || '')));
    /* NAMING ONE RESOLVES IT. The only word-reading step, and the word is the person's own
       filename rather than anything this repo ships a pattern for. */
    modelPicks('attach_material', {});
    const byName = await say('use notes.txt as evidence', 'me',
      { conversationId: evConv, about: { kind: 'focus', id: String(fid) } });
    const named = props(byName).find(p => p.actionType === 'attach_material');
    ok('E7d naming the document resolves the ambiguity', !!named);
    ok('E7e …to the one that was named', !!named
      && JSON.stringify(named).includes(String(att2.j.materialId))
      && !JSON.stringify(named).includes(String(att.j.materialId)));

    /* ══ E8 — AND THE COMPOSER IS NOT A SECOND DOOR AROUND WHO MAY ATTACH ══════════════════
       Material on a group object reaches everybody in that group, so `POST /api/materials` has
       always required that you LEAD the node. Reaching the same write by talking must meet the
       same rule: being able to open an object is not permission to put things on it. */
    console.log('\n  E8 — TALKING TO INTELLIQ DOES NOT RAISE WHO MAY ATTACH');
    const sqid = 'tf_restart';
    const squadSeen = await call('GET', '/api/objects?kind=focus&scope=group:first', undefined, 'me');
    ok('E8a the squad Focus is a real object the member can see',
      (((squadSeen.j || {}).objects) || []).some(o => String(o.id) === sqid));
    const mineOnSquad = await call('GET', `/api/objects/focus/${sqid}/materials`, undefined, 'me');
    ok('E8b …and they can open what is on it', mineOnSquad.status === 200);
    const memberDoc = await call('POST', '/api/assistant/attachments',
      { filename: 'mine.txt', text: 'My own note about how the restarts went for me.' }, 'me');
    modelPicks('attach_material', { materialId: memberDoc.j.materialId });
    const push = await say('use this as evidence', 'me',
      { conversationId: memberDoc.j.conversationId, about: { kind: 'focus', id: String(sqid) } });
    const pushProp = props(push).find(p => p.actionType === 'attach_material');
    ok('E8c a member can still be OFFERED it, because offering is not doing', !!pushProp);
    const refused = await call('POST', `/api/assistant/turn/${push.j.turnId}/confirm`,
      { proposalId: pushProp && pushProp.id }, 'me');
    ok('E8d …and confirming is refused: they do not lead that group', refused.status === 403);
    /* READ AS THE PERSON WHO OWNS THE DOCUMENT. Reading as the leader would pass whether or not
       the attach happened, because a private material is not theirs to see either way — the
       assertion would hold for the wrong reason. */
    ok('E8e …so nothing reached the group object',
      (((await call('GET', `/api/objects/focus/${sqid}/materials`, undefined, 'me')).j || {})
        .materials || []).length === 0);
    /* AND THE RULE IS ABOUT AUTHORITY, NOT ABOUT THE ACTION. The person who leads it may. */
    const coachDoc = await call('POST', '/api/assistant/attachments',
      { filename: 'plan.txt', text: 'Restart plan: nearest player speaks first, then the keeper.' }, 'coach');
    modelPicks('attach_material', { materialId: coachDoc.j.materialId });
    const led = await say('use this as evidence', 'coach',
      { conversationId: coachDoc.j.conversationId, about: { kind: 'focus', id: String(sqid) } });
    const ledProp = props(led).find(p => p.actionType === 'attach_material');
    const allowed = await call('POST', `/api/assistant/turn/${led.j.turnId}/confirm`,
      { proposalId: ledProp && ledProp.id }, 'coach');
    ok('E8f the person who leads the group may attach the same way', allowed.status === 200);

    /* ══ F — ASKING THE TEAM ═══════════════════════════════════════════════════════════════ */
    console.log('\n  F — ASKING THE TEAM REACHES THE EXISTING FORUM MACHINERY');
    const conv = await say('we keep going quiet after we concede', 'me');
    const cid = (conv.j || {}).conversationId;
    modelPicks('discuss_with_group', { groupId: 'first' });
    const forumOffer = await say('ask the team about this', 'me', { conversationId: cid });
    ok('F1 "ask the team" becomes a governed discussion proposal',
      props(forumOffer).some(p => p.actionType === 'discuss_with_group'));
    ok('F1b …carrying what the person actually said, not the command',
      /concede/i.test(JSON.stringify(props(forumOffer).find(p => p.actionType === 'discuss_with_group') || {})));
    /* AND NOT INTO A GROUP THEY ARE NOT IN. The model naming a node is not authorisation. */
    modelPicks('discuss_with_group', { groupId: 'nowhere' });
    const badGroup = await say('ask the reserves about this', 'me', { conversationId: cid });
    const bg = props(badGroup).find(p => p.actionType === 'discuss_with_group');
    ok('F2 …and a group the person is not in is not silently accepted from the model',
      !bg || !/nowhere/.test(JSON.stringify(bg)));

    /* ══ G — RECORDING WHAT HAPPENED ═══════════════════════════════════════════════════════
       The outcome word must be the person's own. A model that decides for them what happened is
       writing a claim about the world in somebody else's name. */
    console.log('\n  G — SAYING WHAT HAPPENED REACHES record_focus_outcome');
    modelPicks('record_focus_outcome', { outcome: 'helped' });
    const outOffer = await say('we tried it today and it helped', 'me',
      { about: { kind: 'focus', id: String(fid) } });
    const outProp = props(outOffer).find(p => p.actionType === 'record_focus_outcome');
    ok('G1 an ordinary sentence about what happened becomes an outcome proposal', !!outProp);
    ok('G2 …and it is confirmed rather than written, because an outcome is a claim about the world',
      !!outProp && outProp.requiredApproval !== false);
    /* THE MODEL MAY NOT DECIDE WHAT HAPPENED. Same action, same context, same person — but the
       word is the model's alone, and the sentence does not contain it. */
    modelPicks('record_focus_outcome', { outcome: 'helped' });
    const invent = await say('we tried it today', 'me', { about: { kind: 'focus', id: String(fid) } });
    ok('G3 an outcome the person never said is not recorded on their behalf',
      !props(invent).some(p => p.actionType === 'record_focus_outcome'));
    ok('G4 …they are asked, in the words their own Focus offers',
      /did it help, not help, or was it mixed/i.test(String(resp(invent).responseText || '')));

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
