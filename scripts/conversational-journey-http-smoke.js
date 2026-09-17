/* Truth layer — THE PERSON TALKS, AND THE MACHINERY HAPPENS BEHIND THEM.

   Founder's law: "Conversation first. Structure second." A person should reach a Focus, an
   Inquiry, an outcome, the Forum and the Library by saying ordinary things — not by operating a
   state machine that happens to be wearing a chat window.

   WHAT WAS ACTUALLY MISSING, and it was one thing rather than thirteen. Every canonical owner
   already existed: `ai/composer-actions.js` has create_focus (from an inquiry, a high, a low, a
   focus, a bare conversation), create_inquiry, record_focus_outcome, attach_material,
   keep_in_library, discuss_with_group and share_to_forum, each with its confirmation rule. The
   deterministic command reader already turned "create a focus about X" into a proposal.

   What did not exist was the shortest sentence in the language. A consequential action is
   PROPOSED and then CONFIRMED, and confirming meant pressing a button carrying the proposal's id.
   "Yeah" names no id. So a person who read the card and said yes in words fell through to be
   answered as if they had made a new remark, and the action they had just agreed to never
   happened. One missing sentence, and every journey below was unreachable by talking.

   NOTHING NEW EXECUTES ANYTHING. Resolution says WHICH proposal was meant; the confirmation still
   goes through POST /api/assistant/turn/:turnId/confirm — the same single mutation path, the same
   frozen payload, the same re-checked authority. A second way to execute an action would be the
   dangerous version of this, and there is not one. Section G is the proof of that.

   MODELS ARE OFF, which is the pilot's state and is not an excuse for anything here: every step
   below is deterministic. The reader turns words into a proposal, the resolver turns "yeah" into
   which proposal, and the governed owner does the writing. What a model would add is the prose
   around it, and no assertion in this file depends on prose.

   Run: node scripts/conversational-journey-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
process.env.IQ_DETERMINISTIC_ONLY = '1';

const S = require('../server.js');
const actions = require('../ai/composer-actions.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const C = 'cvj';
_loadAllStores({
  orgMeta: { [C]: { orgName: 'Highlanders', orgMode: 'sports' } },
  orgUsers: { [C]: {
    me:   { id: 'me', name: 'Tendai', email: 'me@cvj.io', role: 'member', orgCode: C,
      status: 'active', assignedNodeIds: ['first'], profileComplete: true },
    mate: { id: 'mate', name: 'Rudo', email: 'r@cvj.io', role: 'member', orgCode: C,
      status: 'active', assignedNodeIds: ['first'], profileComplete: true },
    coach: { id: 'coach', name: 'Coach', email: 'c@cvj.io', role: 'coach', orgCode: C,
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
  /* Saying yes and having it happen: the two halves a person experiences as one. */
  const acceptAndConfirm = async (word, who) => {
    const r = await say(word, who);
    const acc = resp(r).acceptance;
    if (!acc || !acc.resolves) return { acc, confirmed: null };
    const done = await call('POST', `/api/assistant/turn/${acc.turnId}/confirm`,
      { proposalId: acc.resolves }, who);
    return { acc, confirmed: done };
  };
  const myFocuses = async who => (await call('GET', '/api/objects?kind=focus&scope=self', undefined, who));
  const countFocuses = r => (((r || {}).j || {}).objects || []).length;

  try {
    /* ══ A — THE SENTENCE THAT WAS MISSING ═════════════════════════════════════════════════ */
    console.log('\n  A — SAYING YES IN WORDS REACHES THE THING THAT WAS OFFERED');
    const before = countFocuses(await myFocuses('me'));
    const offered = await say('Create a focus about speaking first after we concede', 'me');
    const props = resp(offered).proposedActions || [];
    ok('A1 an ordinary sentence produces a governed proposal rather than a silent write',
      props.length === 1 && props[0].actionType === 'create_focus');
    ok('A2 …and nothing exists yet, because a proposal is not a write',
      countFocuses(await myFocuses('me')) === before);
    const { acc, confirmed } = await acceptAndConfirm('yeah', 'me');
    ok('A3 "yeah" resolves to the one thing that was offered', !!acc && acc.resolves === props[0].id);
    ok('A4 …and confirming it reaches the governed owner', !!confirmed && confirmed.status === 200);
    const after = await myFocuses('me');
    ok('A5 …so the Focus now exists, created by talking', countFocuses(after) === before + 1);
    ok('A6 …carrying the words the person actually used',
      /speaking first after we concede/i.test(JSON.stringify(after.j)));

    /* ══ B — AND IT WILL NOT GUESS ═════════════════════════════════════════════════════════
       The half that makes A safe. Two proposals and a bare "yeah" is not a choice, and choosing
       one would be the product committing somebody to a consequence they did not pick. */
    console.log('\n  B — TWO THINGS OFFERED AND A BARE YES IS A QUESTION, NOT A GUESS');
    const two = [{ id: 'x1', label: 'one', actionType: 'create_focus' },
                 { id: 'x2', label: 'two', actionType: 'create_inquiry' }];
    const ambiguous = actions.resolveAcceptance('yeah', two);
    ok('B1 a bare yes against two proposals asks which', !!ambiguous && !!ambiguous.ask);
    ok('B2 …and resolves nothing at all', !ambiguous.resolved);
    const picked = actions.resolveAcceptance('the second one', two);
    ok('B3 …while an ordinal picks exactly the one they named',
      !!picked.resolved && picked.resolved.id === 'x2');
    const outOfRange = actions.resolveAcceptance('the fourth one', two);
    ok('B4 …and an ordinal out of range asks rather than taking the nearest',
      !!outOfRange.ask && !outOfRange.resolved);
    ok('B5 a sentence that merely contains "yes" is talking, not confirming',
      actions.resolveAcceptance('yes, I was worried about that and we go quiet after conceding', two) === null);
    ok('B6 …and a question is never a confirmation',
      actions.resolveAcceptance('yes?', two) === null);
    ok('B7 declining stops it, rather than falling through to be answered',
      (actions.resolveAcceptance('not now', two) || {}).declined === true);
    ok('B8 …and with nothing pending, an ordinary "ok" is just a word',
      actions.resolveAcceptance('ok', []) === null);

    /* ══ C — A LOW BECOMES AN INQUIRY BY TALKING ═══════════════════════════════════════════ */
    console.log('\n  C — SOMETHING NOTICED BECOMES SOMETHING INVESTIGATED');
    const inqOffer = await say('Create an inquiry about why we go quiet after conceding', 'me');
    const inqProps = resp(inqOffer).proposedActions || [];
    ok('C1 wanting to understand something produces a create_inquiry proposal',
      inqProps.length === 1 && inqProps[0].actionType === 'create_inquiry');
    const inqDone = await acceptAndConfirm('do that', 'me');
    ok('C2 …and "do that" carries it to the governed owner',
      !!inqDone.confirmed && inqDone.confirmed.status === 200);

    /* ══ D — AND THE SAME SENTENCE FROM INSIDE AN OBJECT ═══════════════════════════════════
       `create_focus` lists inquiry, high, low, focus and conversation among its contexts, which is
       the founder's law that the four forms are one intelligence. This drives it from inside an
       object rather than from a bare conversation, which is the transition a person experiences as
       "I understand this now, I want to work on it". */
    console.log('\n  D — FROM INSIDE AN OBJECT, THE SAME WORDS REACH THE SAME OWNER');
    const mine = ((after.j || {}).objects || [])[0];
    const fromObject = await say('Create a focus about talking earlier in the build-up', 'me',
      { about: { kind: 'focus', id: String(mine.id) } });
    const objProps = resp(fromObject).proposedActions || [];
    ok('D1 the proposal is offered inside an object context too',
      objProps.some(p => p.actionType === 'create_focus'));
    const n2 = countFocuses(await myFocuses('me'));
    const objDone = await acceptAndConfirm('yes', 'me');
    ok('D2 …and saying yes creates it', !!objDone.confirmed && objDone.confirmed.status === 200);
    ok('D3 …as one more Focus, not a duplicate of the one we were standing in',
      countFocuses(await myFocuses('me')) === n2 + 1);

    /* ══ E — A STALE YES IS NOT A YES ══════════════════════════════════════════════════════
       "Yeah" answers what was just said. A proposal from earlier in the conversation, already
       superseded by other turns, must not be executed by a word aimed at something else. */
    console.log('\n  E — YES ANSWERS THE LAST THING, NOT SOMETHING FROM EARLIER');
    const staleOffer = await say('Create a focus about set-piece marking', 'me');
    const staleId = (resp(staleOffer).proposedActions || [])[0];
    ok('E1 something is offered', !!staleId);
    /* THE INTERVENING TURN MUST CARRY NO PROPOSALS OF ITS OWN, or this section proves nothing.
       The first version said "Actually let me think about the left side for a minute", which the
       capture path turned into its own proposal — so the most recent turn had something pending
       either way and a mutation that reached back past it stayed green. A plain question produces
       nothing, which is the only shape that exposes the reach-back. */
    const interleave = await say('Why?', 'me');
    ok('E1b the intervening turn offers nothing, so a reach-back would have to skip it',
      (resp(interleave).proposedActions || []).length === 0);
    const n3 = countFocuses(await myFocuses('me'));
    const late = await say('yeah', 'me');
    const lateAcc = resp(late).acceptance;
    ok('E2 …and after an unrelated turn, "yeah" does not reach back for it',
      !lateAcc || lateAcc.resolves !== staleId.id);
    ok('E3 …and nothing was created by saying it', countFocuses(await myFocuses('me')) === n3);

    /* ══ F — CONFIRMATION IS STILL CONFIRMATION ════════════════════════════════════════════ */
    console.log('\n  F — AND THE GOVERNED GATES ARE UNTOUCHED');
    const reuse = await say('Create a focus about pressing higher', 'me');
    const reuseProp = (resp(reuse).proposedActions || [])[0];
    const first = await acceptAndConfirm('sure', 'me');
    ok('F1 a confirmed proposal executes', first.confirmed.status === 200);
    const again = await call('POST', `/api/assistant/turn/${first.acc.turnId}/confirm`,
      { proposalId: reuseProp.id }, 'me');
    ok('F2 …and cannot be executed twice', again.status === 409);
    /* SOMEBODY ELSE'S PROPOSAL IS NOT THEIRS TO ACCEPT. The id is not an authorisation. */
    const stolen = await call('POST', `/api/assistant/turn/${first.acc.turnId}/confirm`,
      { proposalId: reuseProp.id }, 'mate');
    ok('F3 …and another person cannot confirm it with the id alone', stolen.status === 404);

    /* ══ G — NO SECOND WAY TO EXECUTE ══════════════════════════════════════════════════════
       The whole safety argument rests on this: resolution SAYS which proposal was meant and
       writes nothing. If saying yes could ever write on its own, everything above would be a new
       unconfirmed mutation path wearing a conversation. */
    console.log('\n  G — SAYING YES WRITES NOTHING BY ITSELF');
    const g0 = countFocuses(await myFocuses('me'));
    const gOffer = await say('Create a focus about restarting quickly', 'me');
    ok('G1 a proposal is on the table', (resp(gOffer).proposedActions || []).length === 1);
    const gSaid = await say('yeah', 'me');                    // resolved, deliberately NOT confirmed
    ok('G2 …and saying yes resolves it', !!resp(gSaid).acceptance && !!resp(gSaid).acceptance.resolves);
    ok('G3 …but writes nothing until the confirmation goes through the one route',
      countFocuses(await myFocuses('me')) === g0);

  } catch (e) { fail++; console.error('  FAIL conversational-journey suite threw:', e && e.stack); }

  server.close();
  console.log(`\nconversational-journey-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
