/* Truth layer — A FOCUS IS A CONVERSATION WE DELIBERATELY KEEP WORKING ON.

   Founder direction: the journey is conversation → confirmed focus → return → reflection, and it
   should feel like one thing rather than a form that interrupts a chat.

   What it used to be: the "Make it a focus" button copied the person's previous message into a
   form; the form posted text, target, date and audience with NO reference to where any of it came
   from; success said "Focus set" and pointed at the Focuses list — ending the conversation at the
   exact moment somebody had committed to continuing it.

   ── THE ONE DECISION EVERYTHING ELSE FOLLOWS ────────────────────────────────────────────────

   THE SOURCE IS A REFERENCE, NEVER A COPY. Copying the transcript onto the focus would put a
   person's private words inside an object they can later share with a coach — and then sharing
   the focus would hand over the conversation that produced it without anybody deciding to. A
   reference cannot leak that way, because reading it goes back through a route that checks
   ownership every time. Widening the focus's audience widens nothing else.

   That is the assertion this suite exists for, and it is asserted from BOTH ends: the stored
   object holds no words, and the people a focus is shared with cannot reach them.

   ── AND THE REFERENCE IS VALIDATED, NOT TRUSTED ─────────────────────────────────────────────

   A conversation id from the client is a claim. It is checked against the caller's own history,
   in their own organisation, and a bad one becomes NO reference rather than a stored pointer to
   somebody else's thread.

   Hermetic: deterministic-only for the whole file, with a credential present, so nothing here can
   reach a provider. Disposable fixtures only.

   Run: node scripts/focus-continuity-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
process.env.IQ_DETERMINISTIC_ONLY = '1';
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'sk-test-not-a-real-key';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, _getMemory, assistantConversations } = S;
// The workspace key is the same shape the server builds; not exported, and not worth exporting
// for one test — but it must stay in step, which FC-fixture failures would show immediately.
const _wsKey = (code, userId) => `${String(code || '').toLowerCase()}:${userId}`;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

const C = 'foccont';
_loadAllStores({
  orgMeta:  { [C]: { orgName: 'A Club', orgMode: 'sports' } },
  orgUsers: { [C]: {
    me:    { id: 'me',    name: 'A Player',    email: 'me@x.io', role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['n1'] },
    mate:  { id: 'mate',  name: 'A Teammate',  email: 'mt@x.io', role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['n1'] },
    coach: { id: 'coach', name: 'A Coach',     email: 'co@x.io', role: 'coach',  orgCode: C, status: 'active', leadershipNodeIds: ['n1'] },
    out:   { id: 'out',   name: 'Other Squad', email: 'ou@x.io', role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['n2'] },
  } },
  orgNodes: { [C]: {
    n1: { nodeId: 'n1', name: 'First Team', parentId: null, childNodeIds: [], memberIds: ['me', 'mate'], leaderIds: ['coach'] },
    n2: { nodeId: 'n2', name: 'Reserves',   parentId: null, childNodeIds: [], memberIds: ['out'], leaderIds: [] },
  } },
});
_rebuildEmailIndex();

/* THE CONVERSATION THIS ALL COMES FROM. Deliberately MULTI-TOPIC: the founder's rule is that
   making a focus must not destructively reassign a whole thread, and a single-subject fixture
   could not tell the difference between "bound the thread" and "referenced two messages of it". */
const MY_CONV = {
  id: 'conv_multi', title: 'Saturday', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  messages: [
    { id: 'm1', role: 'user',      text: 'My ankle has been sore since Tuesday.', at: Date.now() - 5000 },
    { id: 'm2', role: 'assistant', text: 'How is it when you change direction?',  at: Date.now() - 4000 },
    { id: 'm3', role: 'user',      text: 'We need to help the team win games.',   at: Date.now() - 3000 },
    { id: 'm4', role: 'assistant', text: 'Where do games tend to get away from you?', at: Date.now() - 2000 },
    { id: 'm5', role: 'user',      text: 'After we concede, everyone goes quiet.', at: Date.now() - 1000 },
  ],
};
assistantConversations[_wsKey(C, 'me')] = [MY_CONV];
/* Somebody ELSE's conversation, so "validated, not trusted" has something real to be tested
   against rather than only a made-up id. */
assistantConversations[_wsKey(C, 'mate')] = [{
  id: 'conv_theirs', title: 'Theirs', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  messages: [{ id: 'x1', role: 'user', text: 'Something private of mine.', at: Date.now() }],
}];

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = t => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });
  const get  = (u, t) => fetch(base + u, { headers: H(t) }).then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const post = (u, t, b) => fetch(base + u, { method: 'POST', headers: H(t), body: JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));

  const meT = issueToken('me', C, 'member');
  const mateT = issueToken('mate', C, 'member');
  const coachT = issueToken('coach', C, 'coach');
  const outT = issueToken('out', C, 'member');
  const focuses = () => (_getMemory(C, 'me').focuses || []);

  try {
    /* ── FC1-FC3: the focus remembers where it came from. ── */
    const made = await post('/api/me/focus', meT, {
      text: 'How we regroup after conceding',
      sourceConversationId: 'conv_multi',
      sourceMessageIds: ['m4', 'm5'],
    });
    ok('FC1 a focus can be started from a conversation, and it is private by default',
      made.status === 200 && made.j.ok === true && made.j.focus.visibility === 'private');
    ok('FC1b …and it remembers the conversation and the messages it came from',
      made.j.focus.source && made.j.focus.source.conversationId === 'conv_multi' &&
      JSON.stringify(made.j.focus.source.messageIds) === JSON.stringify(['m4', 'm5']));
    const FID = made.j.focus.id;

    /* FC2 — THE DECISION EVERYTHING ELSE FOLLOWS. */
    const stored = focuses().find(f => f.id === FID);
    const storedJSON = JSON.stringify(stored);
    ok('FC2 THE STORED FOCUS HOLDS NO WORDS FROM THE CONVERSATION — a reference, not a copy, which is what stops sharing a focus from handing over the chat that produced it',
      !/everyone goes quiet/.test(storedJSON) && !/get away from you/.test(storedJSON) &&
      !!stored.source && stored.source.conversationId === 'conv_multi');
    ok('FC2b …and what it does hold is ids and a timestamp, nothing else',
      Object.keys(stored.source).sort().join(',') === 'at,conversationId,messageIds');

    /* FC3 — the conversation is UNTOUCHED. The founder's rule: do not destructively reassign a
       whole multi-topic thread. This one is about an ankle AND about conceding goals. */
    const conv = assistantConversations[_wsKey(C, 'me')][0];
    ok('FC3 the conversation keeps its own identity — a thread that was also about an ankle is not retitled or re-pointed because one part of it became a focus',
      conv.id === 'conv_multi' && conv.title === 'Saturday' && !conv.about &&
      (conv.messages || []).length === 5);

    /* ── FC4-FC6: coming back to it. ── */
    const src = await get(`/api/me/focus/${FID}/source`, meT);
    ok('FC4 the owner can return to the focus and see where it started',
      src.status === 200 && src.j.available === true && src.j.exact === true);
    ok('FC4b …reading the referenced messages LIVE from their own history, which is why nothing had to be copied',
      (src.j.messages || []).map(m => m.id).join(',') === 'm4,m5' &&
      /everyone goes quiet/.test(JSON.stringify(src.j.messages)));
    ok('FC4c …and it says plainly that sharing the focus does not share this',
      /does not share this conversation/i.test(src.j.note || ''));

    /* ── FC5-FC7: THE PRIVACY LINE, from the other end. Share it, then check nobody gained
       anything but the focus. ── */
    await post(`/api/me/focus/${FID}/visibility`, meT, { visibility: 'shared' });
    ok('FC5 the focus can be shared with whoever leads them',
      focuses().find(f => f.id === FID).visibility === 'shared');
    ok('FC5b …AND THE SOURCE DOES NOT TRAVEL WITH IT — a leader who can now read the focus still gets nothing from the conversation behind it',
      (await get(`/api/me/focus/${FID}/source`, coachT)).status === 404);
    ok('FC6 a teammate gets nothing either',
      (await get(`/api/me/focus/${FID}/source`, mateT)).status === 404);
    ok('FC6b …and somebody in another squad gets nothing',
      (await get(`/api/me/focus/${FID}/source`, outT)).status === 404);
    ok('FC7 …404 rather than 403, because confirming there IS a conversation behind it is itself a disclosure',
      (await get(`/api/me/focus/${FID}/source`, coachT)).status === 404);

    /* ── FC8-FC9: VALIDATED, NOT TRUSTED. ── */
    const forged = await post('/api/me/focus', meT, {
      text: 'Something with a stolen reference',
      sourceConversationId: 'conv_theirs', sourceMessageIds: ['x1'],
    });
    ok('FC8 a conversation id belonging to somebody ELSE is refused as a reference — and becomes NO reference rather than a stored pointer to their thread',
      forged.status === 200 && forged.j.focus.source === null &&
      !focuses().find(f => f.id === forged.j.focus.id).source);
    const badMsgs = await post('/api/me/focus', meT, {
      text: 'Real conversation, invented messages',
      sourceConversationId: 'conv_multi', sourceMessageIds: ['m4', 'nope', 'x1'],
    });
    ok('FC9 message ids that are not in that thread are dropped, and the real one is kept — a partly wrong reference is narrowed rather than trusted or discarded whole',
      JSON.stringify(badMsgs.j.focus.source.messageIds) === JSON.stringify(['m4']));
    const ghost = await post('/api/me/focus', meT, {
      text: 'A conversation that never existed', sourceConversationId: 'conv_nope', sourceMessageIds: ['a'],
    });
    ok('FC9b an unknown conversation is no reference at all',
      ghost.j.focus.source === null);

    /* ── FC10-FC11: RETRIES AND DOUBLE TAPS. ── */
    const before = focuses().length;
    const again = await post('/api/me/focus', meT, {
      text: 'How we regroup after conceding',
      sourceConversationId: 'conv_multi', sourceMessageIds: ['m4', 'm5'],
    });
    ok('FC10 a retry or a double tap does not leave two identical focuses behind',
      again.status === 200 && again.j.already === true && focuses().length === before);
    ok('FC10b …and it returns the SAME focus, so the second tap cannot look like a different outcome from the first',
      again.j.focus.id === FID);
    /* FC10c — the reduced response was its own defect: a successful retry rendered without the
       target, the date or the source, so repeating a call looked like a worse result than making
       it once. */
    ok('FC10c …carrying the full shape, not a reduced one — a retry that renders as less than the original teaches people not to retry',
      again.j.focus.source && again.j.focus.source.conversationId === 'conv_multi' &&
      'target' in again.j.focus && 'reviewAt' in again.j.focus && 'visibility' in again.j.focus);

    /* ── FC12: THE CONVERSATION CONTINUES. Confirming a focus must not end the exchange. ── */
    ok('FC12 the server hands back ONE useful next question, so confirming continues the conversation instead of closing it',
      typeof made.j.next === 'string' && made.j.next.length > 5 && /\?$/.test(made.j.next));
    const withTarget = await post('/api/me/focus', meT, {
      text: 'Lead the warm-up', target: 'The group starts without me chasing them',
    });
    ok('FC12b …and the question follows what the focus is actually missing, which is why it can be asked with the writing engine off',
      /tell you this was working/i.test(made.j.next) && /when should we look/i.test(withTarget.j.next));

    /* ── FC13: BROAD GOALS ARE ACCEPTED. Nobody is made to invent a metric. ── */
    const broad = await post('/api/me/focus', meT, { text: 'Help the team win games' });
    ok('FC13 a broad goal is accepted with no target and no date — refusing to start one until somebody invents a metric is how a tool teaches people to make one up',
      broad.status === 200 && broad.j.focus.target === null && broad.j.focus.reviewAt === null);

    /* ── FC14: the source survives a focus that is later closed, so reflection has something to
       reflect against. ── */
    const gone = await get(`/api/me/focus/${FID}/source`, meT);
    ok('FC14 the reference still resolves after the focus has been shared and worked on',
      gone.status === 200 && gone.j.available === true);
    /* And when the person deletes their own history, the focus stands rather than breaking. */
    assistantConversations[_wsKey(C, 'me')] = [];
    const orphan = await get(`/api/me/focus/${FID}/source`, meT);
    ok('FC14b …and when they erase their own history, the focus stands on its own rather than erroring — their record is theirs to delete',
      orphan.status === 200 && orphan.j.available === false && /no longer here/i.test(orphan.j.note || ''));

    /* ── FC15: THE CALL SITES. A journey nothing invokes is not a journey. ── */
    const src_ = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'app.js'), 'utf8');
    ok('FC15 the proposal is rendered in the conversation, compact and editable, with a clear action',
      /_renderFocusProposal\(j, p\)/.test(src_) && /Start this focus/.test(src_));
    ok('FC15b …the target and the date are PROGRESSIVELY DISCLOSED, not asked before somebody has agreed to the thing',
      /Add a target or a date/.test(src_) && /_focusPropMore\(/.test(src_));
    ok('FC15c …confirming stays in the conversation and attaches the focus rather than redirecting to a list',
      /_renderFocusAttached\(/.test(src_) && /Focus started/.test(src_));
    ok('FC15d …the source refs are actually sent',
      /sourceConversationId: src\.conversationId/.test(src_) && /sourceMessageIds: src\.messageIds/.test(src_));
    ok('FC15e …a double tap is refused on the client too, not only deduped on the server',
      /if \(go && go\.disabled\) return;/.test(src_));
    /* FC15g — THE SCREENSHOT, on this path. "Authentication required" over a filled-in focus
       while the app looked signed in: the token lives in localStorage and the session on the
       server, so a restart ends one and not the other and nothing revalidates until a write
       fails. Anchored to THIS handler — the legacy form has its own, and matching the shared
       pattern let a deleted handler pass on the strength of the other one. */
    ok('FC15g a dead session in the conversation keeps the draft and offers a way back, rather than printing an error over words somebody then loses',
      /this\._focusDraftStash\(body\); this\._renderFocusSignIn\(id\);/.test(src_) &&
      /Sign in and come back/.test(src_));
    ok('FC15h …and success is only reported after the server confirms it, never optimistically',
      /if \(!r\.ok \|\| !jj \|\| !jj\.ok\) throw new Error/.test(src_) &&
      src_.indexOf('_renderFocusAttached(id, jj)') > src_.indexOf('if (!r.ok || !jj || !jj.ok) throw new Error'));
    const srv_ = require('fs').readFileSync(require('path').join(__dirname, '..', 'server.js'), 'utf8');
    ok('FC15f …and the proposal comes from the EXISTING bounded intents, not a new detector written for this feature',
      /interp\.intents\.find\(i => i\.type === 'plan' \|\| i\.type === 'commitment'\)/.test(srv_));

  } catch (e) { fail++; console.error('  FAIL suite threw:', e && e.stack); }

  server.close();
  console.log(`\nfocus-continuity-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
