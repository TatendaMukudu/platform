/* Truth layer — A CONVERSATION YOU CANNOT COME BACK TO IS NOT A CONVERSATION.

   The founder spoke to an inquiry, got a genuinely good answer, went back, reopened it, and it
   was blank. Their words: "it's gotta keep the chat history if the thread has been interacted
   with before. This helps build context for the user as well."

   That is not a nice-to-have — a system whose whole claim is that understanding COMPOUNDS
   cannot forget the last thing it was told. And there were two separate holes:

     1. Home kept its conversation id in a JS variable and nowhere else. Every reload started a
        conversation with no memory, while the real one sat on the server with everything in it.
        Reproducible every single time and invisible from the server side, which is why the
        server probe kept coming back green.

     2. The three history reads (object thread, inquiry thread, conversation route) each mapped
        messages by hand and had already drifted: one carried provenance, two did not. A message
        could therefore show its sources live and lose them on reopen depending only on which
        screen you came back through.

   And the thing that made both worse: SOURCES existed only on the live response. The chips were
   there while the bubble was on screen and gone the moment you came back — which is the half
   that matters, because checking something is the reason you reopen a thread at all.

   So this suite pins the round trip end to end, plus the two rules that keep the rating honest:
   a rating lands on a MESSAGE and never on a person or a belief, and both reply paths cite.

   Run: node scripts/message-history-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
process.env.IQ_COMPOSER = '1';

const fs = require('fs');
const path = require('path');
const gateway = require('../ai/gateway.js');

let _enabled = true;
gateway.enabled = () => _enabled;
gateway.complete = async () => 'That tracks. Arriving late leaves no space to settle, so the warm-up ends up doing double duty.';
gateway.completeJSON = async () => null;

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, inquiryStates, assistantConversations } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

const C = 'hst';
_loadAllStores({
  orgMeta:  { [C]: { orgName: 'Trafford United FC', orgMode: 'sports' } },
  orgUsers: { [C]: { ash: { id: 'ash', name: 'Ashton Mbeki', role: 'member', orgCode: C, status: 'active' } } },
});
_rebuildEmailIndex();

const seedInquiry = () => ({
  inquiryId: 'inq_att1', topic: { canonicalConcept: 'football.attendance_timing', label: 'Session attendance' },
  status: 'probable', confidence: { band: 'probable', because: ['2 things you have told me'] },
  hypotheses: [{ id: 'h1', statement: 'arriving in time for warm-up is a key condition for a good session' }],
  leadingHypothesisId: 'h1',
  signals: [{ id: 's1', kind: 'observation', contributedBy: 'ash', originRef: 'o1', statement: 'late again', at: new Date().toISOString() }],
  missingSignals: [{ question: 'was the better session due to the warm-up itself?' }],
  falsifiers: ['arriving on time but skipping warm-up still produces a good session'],
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
});

/* A real assigned item with a usable title, so the composer's retrieval is NOT empty. Without
   this the source assertions compare two empty arrays and pass no matter what the server does —
   which is exactly what happened on the first mutation run: deleting the stored sources left the
   suite green. A source test with nothing to source is not a test. */
S.assessmentAssignments[C] = [{ id: 'as1', assigneeId: 'ash', title: 'Pre-session routine review', status: 'assigned' }];

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = { Authorization: `Bearer ${issueToken('ash', C, 'member')}`, 'Content-Type': 'application/json' };
  const get  = u => fetch(base + u, { headers: H }).then(r => r.json());
  const post = (u, b) => fetch(base + u, { method: 'POST', headers: H, body: JSON.stringify(b) }).then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const settle = () => new Promise(r => setTimeout(r, 250));

  try {
    inquiryStates[C] = { 'member:ash': { 'football.attendance_timing': seedInquiry() } };

    /* ── H1-H4: the object thread remembers. Open, speak, come back. ── */
    const open1 = await get('/api/objects/inquiry/inq_att1/thread?scope=self');
    ok('H1 an untouched thread opens with no messages — the opening is composed, not stored (L-OC1)',
      open1.ok === true && (open1.messages || []).length === 0 && !!open1.opening);

    const sent = await post('/api/assistant/turn', {
      text: 'I think arriving in time for the warm-up stresses you out a lot less', about: open1.about });
    ok('H2 speaking into the thread is accepted', sent.status === 200 && sent.j && sent.j.ok);
    await settle();

    const open2 = await get('/api/objects/inquiry/inq_att1/thread?scope=self');
    ok('H3 coming back to the thread shows what was said — both turns, in order',
      (open2.messages || []).length === 2 && open2.messages[0].role === 'user' && open2.messages[1].role === 'assistant');
    ok('H4 …and the words are the actual words, not a summary of them',
      /warm-up stresses you out/.test((open2.messages[0] || {}).text || ''));

    /* ── H5: a SECOND open with no client state at all. This is the reload case — the one that
       has no server-side symptom, which is why it survived every probe. ── */
    const open3 = await get('/api/objects/inquiry/inq_att1/thread?scope=self');
    ok('H5 a cold reopen (no conversationId sent, nothing remembered client-side) still finds it',
      (open3.messages || []).length === 2 && open3.conversation && open3.conversation.id);

    /* ── H6-H8: sources. Live and on reopen — the same, or the chips are decoration. ── */
    const liveSources = ((sent.j.response || {}).sources) || [];
    ok('H6 a composed reply says what it read — the composed path used to cite NOTHING before this, so the better the answer the less you could check it',
      Array.isArray(liveSources) && liveSources.length > 0 &&
      liveSources.some(s => /Pre-session routine review/.test(s.label || '')));
    const stored = (open2.messages[1] || {}).sources;
    ok('H7 the sources are stored WITH the message, so reopening the thread does not strip them',
      Array.isArray(stored) && stored.length === liveSources.length && stored.length > 0 &&
      JSON.stringify(stored) === JSON.stringify(liveSources));
    ok('H8 every source is a pointer — a label plus a line, never an unbounded dump',
      (stored || []).every(s => s && typeof s.label === 'string' && s.label.length <= 80 && String(s.detail || '').length <= 180));

    /* ── H9-H10: the three history reads agree. They were three hand-written maps and had
       already drifted; one carried provenance and two did not. ── */
    const convId = open3.conversation.id;
    const viaConv = await get('/api/assistant/conversations/' + encodeURIComponent(convId));
    const shape = m => Object.keys(m).sort().join(',');
    ok('H9 the conversation route returns the same message shape as the thread route',
      viaConv.ok && shape(viaConv.messages[1]) === shape(open3.messages[1]));
    ok('H10 …and the same content, so which screen you come back through cannot change what you see',
      viaConv.messages[1].text === open3.messages[1].text &&
      JSON.stringify(viaConv.messages[1].sources) === JSON.stringify(open3.messages[1].sources));

    /* ── H11-H15: rating a REPLY. The boundary is the point. ── */
    const before = JSON.parse(JSON.stringify(inquiryStates[C]['member:ash']['football.attendance_timing']));
    const rated = await post('/api/assistant/reply-feedback', { conversationId: convId, messageId: open3.messages[1].id, rating: 'down' });
    ok('H11 a reply can be marked not useful', rated.status === 200 && rated.j && rated.j.rating === 'down');
    const after = inquiryStates[C]['member:ash']['football.attendance_timing'];
    ok('H12 …and it changes NOTHING about the belief — a thumbs-down that moved confidence would let a reader downvote a finding they disliked out of existence',
      JSON.stringify(after) === JSON.stringify(before));
    const open4 = await get('/api/objects/inquiry/inq_att1/thread?scope=self');
    ok('H13 the rating survives a reopen, so it is a considered mark rather than a gesture',
      (open4.messages[1] || {}).rating === 'down');
    const cleared = await post('/api/assistant/reply-feedback', { conversationId: convId, messageId: open3.messages[1].id, rating: null });
    ok('H14 a rating can be taken back — one you cannot undo is one people stop giving',
      cleared.status === 200 && cleared.j.rating === null);
    // Addressed by the user message's REAL id. An earlier version fell back to a made-up id, so
    // the 404 arrived because the message did not exist rather than because rating your own
    // words is refused — and removing the role filter left the suite green.
    const ownId = (open3.messages[0] || {}).id;
    ok('H15a the user\'s own message carries an id, so H15 is addressing a real message',
      typeof ownId === 'string' && ownId.length > 2);
    const ownWords = await post('/api/assistant/reply-feedback', { conversationId: convId, messageId: ownId, rating: 'up' });
    ok('H15 your OWN message cannot be rated — a judgement on a person\'s account of themselves is exactly what this system does not do',
      ownWords.status === 404 && (open3.messages[0] || {}).rating == null);

    /* ── H16-H17: the deterministic path cites too. Both paths or neither: provenance that
       depends on which engine wrote the reply teaches people the chips are decoration. ── */
    _enabled = false;
    const det = await post('/api/assistant/turn', { text: 'what have I told you about my attendance?' });
    ok('H16 the deterministic path still answers with the model off', det.status === 200 && det.j.ok);
    ok('H17 …and its reply carries a sources array too, from the citations it already had — both paths cite or neither does',
      Array.isArray((det.j.response || {}).sources));
    ok('H17b the deterministic reply is stored with its sources field present, like a composed one',
      (await get('/api/assistant/conversations/' + encodeURIComponent(det.j.conversationId)))
        .messages.every(m => Array.isArray(m.sources)));
    _enabled = true;

    /* ── H18-H22: the CLIENT half. Home kept its conversation id in a variable and nowhere
       else — the one hole no server test can see, so it is checked structurally. ── */
    const appjs = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
    // The CALL, not the definition. The first version matched `async _restoreChat(` too, so
    // deleting the one line that actually invokes it left this green — the same call-site
    // blindness that let a whole vocabulary exist five times without being wired to anything.
    ok('H18 Home restores its conversation on load rather than starting blank every reload',
      /async\s+_restoreChat\s*\(/.test(appjs) && /this\._restoreChat\s*\(\s*\)/.test(appjs));
    const homeSlice = appjs.slice(appjs.indexOf('_renderHome() {'), appjs.indexOf('_chatKey()'));
    ok('H18b …and it is called from Home itself, not from somewhere Home may never reach',
      /this\._restoreChat\s*\(\s*\)/.test(homeSlice));
    ok('H19 …and the id is persisted, not held in a variable that dies with the page',
      /localStorage\.setItem\(this\._chatKey\(\)/.test(appjs));
    ok('H20 …per account, so two people on one device never land in each other\'s thread',
      /_chatKey\s*\(\s*\)\s*\{[^}]*Auth/.test(appjs));
    // `=` and not `==`: the first version of this counted `this._chatConvId === id` as a write
    // and reported a hole that was not there. A guard that miscounts is worse than no guard —
    // it sends you looking for a bug in code that is correct.
    const writes = (appjs.match(/this\._chatConvId\s*=(?!=)/g) || []).length;
    ok('H21 every write of the conversation id goes through the one helper — a second assignment is a second place to forget to persist',
      writes === 1 && /_rememberChat\(/.test(appjs));
    ok('H22 the action row exists once and is used by the thread, the opening and Home',
      (appjs.match(/_msgActions\(/g) || []).length >= 4 && (appjs.match(/^\s{2}_msgActions\(/m) || []).length === 1);

    /* ── H23: no colour on the rating. D14b — nothing about a person is ever red or green, and
       a thumbs-down sitting inside a conversation about someone is close enough to count. ── */
    const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'styles.css'), 'utf8');
    const actBlock = css.slice(css.indexOf('.iq-msg-acts{'), css.indexOf('.iq-resumed{'));
    ok('H23 the action row carries no danger/warning/success colour — a red thumbs-down is a verdict rendered in a conversation about a person (D14b)',
      actBlock.length > 100 && !/--danger|--warning|--success|--good/.test(actBlock));

  } catch (e) { fail++; console.error('  FAIL suite threw:', e && e.stack); }

  server.close();
  console.log(`\nmessage-history-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
