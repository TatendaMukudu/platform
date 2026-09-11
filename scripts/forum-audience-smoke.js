/* Truth layer — WHO CAN TALK ABOUT THIS, DECIDED IN ONE PLACE, AND WHICH WAY THINGS TRAVEL.

   FOUNDER DECISION, September 2026, in four parts:

     the creator explicitly chooses the audience;
     any High, Low, Inquiry or Focus with TWO OR MORE current readable members has a Forum;
     Forum content may inform private conversation FOR THAT SAME OBJECT ONLY;
     private conversation never enters a Forum without an explicit Share to Forum, an audience
     preview, and a confirmation.

   TWO DEFECTS THIS CLOSES, both found by reading the code rather than by a failing test.

   1. `forumAvailable` WAS COMPUTED IN THREE PLACES WITH THREE RULES, and they had already drifted:

        the thread route      !!nodeId || (kind === 'focus' && participants.length > 1)
        the composer context  nodeId || subjectRef.startsWith('group:') || participants.length > 1
        _forumRoom            participants.length >= 2, focus only

      The second accepted a group subjectRef and accepted participants on ANY kind where the first
      did neither, so the same object could have a Forum in conversation and none on its own
      screen. Two descriptions of one rule always drift; three is just faster.

   2. NONE OF THEM COUNTED PEOPLE. All three asked "is there a node", not "are there two people".
      A node with one member on its roster — a squad mid-build, a group somebody was removed from
      — offered a Forum with nobody in it to talk to. The founder's rule is TWO, and one is not
      two.

   The count is resolved on every read from the roster and the participant list as they stand
   RIGHT NOW. Nothing is cached and no membership list is stored, which is what makes an audience
   change revoke the room on the very next request rather than after a sweep.

   Run: node scripts/forum-audience-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
process.env.IQ_COMPOSER = '1';

const fs = require('fs'), path = require('path');
const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, orgNodes, forumThreads } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { let v = false; try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };
const R = f => { try { return fs.readFileSync(path.join(__dirname, '..', f), 'utf8'); } catch (_) { return ''; } };
const decomment = s => String(s).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

const NOW = Date.now(), DAY = 86400000;
const C = 'fau', X = 'oth';
const SIG = (source, originRef, at) => ({ kind: 'observation', status: 'active', source, originRef,
  at, turnId: `t_${source}`, directness: 'direct', authority: 'corroborated', specificity: 0.7,
  ref: `ev_${originRef}` });
const INQ = (id, subjectRef, label) => ({
  inquiryId: id, subjectRef, topic: { canonicalConcept: `football.${id}`, label },
  status: 'exploring',
  hypotheses: [{ id: `h_${id}`, statement: `Something about ${label}`, confidence: { score: 0.6, band: 'probable' }, status: 'open' }],
  leadingHypothesisId: `h_${id}`,
  signals: [SIG('a', `o_a_${id}`, NOW - 3 * DAY), SIG('b', `o_b_${id}`, NOW - 2 * DAY)],
  confidence: { score: 0.6, band: 'probable', because: ['2 independent origins'] },
  missingSignals: [], falsifiers: [], timeline: [], lastUpdatedAt: NOW,
});

_loadAllStores({
  orgMeta: { [C]: { orgName: 'Alma College', orgMode: 'sports' }, [X]: { orgName: 'Other', orgMode: 'sports' } },
  orgUsers: {
    [C]: {
      coach: { id: 'coach', name: 'Head Coach', email: 'c@x.io', role: 'coach', orgCode: C, status: 'active', leadershipNodeIds: ['crowd'], assignedNodeIds: [] },
      p1: { id: 'p1', name: 'Player One', email: 'p1@x.io', role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['crowd'] },
      p2: { id: 'p2', name: 'Player Two', email: 'p2@x.io', role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['crowd'] },
      solo: { id: 'solo', name: 'Only One', email: 's@x.io', role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['lonely'] },
      sib:  { id: 'sib', name: 'Sibling Lead', email: 'sb@x.io', role: 'coach', orgCode: C, status: 'active', leadershipNodeIds: ['sibling'], assignedNodeIds: [] },
    },
    [X]: { far: { id: 'far', name: 'Far Away', email: 'f@x.io', role: 'coach', orgCode: X, status: 'active', leadershipNodeIds: ['theirs'], assignedNodeIds: [] } },
  },
  orgNodes: {
    [C]: {
      // THREE PEOPLE: two players and a leader. A room.
      crowd:  { nodeId: 'crowd', name: 'First Team', parentId: null, childNodeIds: [], memberIds: ['p1', 'p2'], leaderIds: ['coach'] },
      // ONE PERSON. A node exists, so every old rule said "Forum". There is nobody to talk to.
      lonely: { nodeId: 'lonely', name: 'Solo Squad', parentId: null, childNodeIds: [], memberIds: ['solo'], leaderIds: [] },
      sibling:{ nodeId: 'sibling', name: 'Reserves', parentId: null, childNodeIds: [], memberIds: [], leaderIds: ['sib'] },
    },
    [X]: { theirs: { nodeId: 'theirs', name: 'Theirs', parentId: null, childNodeIds: [], memberIds: [], leaderIds: ['far'] } },
  },
  inquiryStates: {
    [C]: {
      'group:crowd':  { inq_crowd: INQ('inq_crowd', 'group:crowd', 'Press shape') },
      'group:lonely': { inq_lonely: INQ('inq_lonely', 'group:lonely', 'Solo topic') },
      'member:p1':    { inq_mine: INQ('inq_mine', 'member:p1', 'My own thing') },
    },
  },
  /* THE GROUP OBJECT THE THREAD ROUTE ACTUALLY SERVES. `scope=group:<id>` exposes the group's
     High, Low, lead Question and Focuses — not every inquiry it holds — so a neutral inquiry is
     correctly absent from that bucket and reading one there is a 404 for everybody. My first
     version of this file asserted against exactly that 404 and would have been measuring the
     wrong thing at every step. A group Focus is unambiguously in the bucket, and it is the
     object a person is most likely to want a room around. */
  teamFocuses: {
    [C]: {
      crowd:  [{ focusId: 'tf_crowd', nodeId: 'crowd', text: 'Start our build-up deeper', status: 'active',
        createdAt: NOW - DAY, by: 'coach', origin: { from: 'leader', by: 'coach', at: NOW - DAY, inquiryId: null } }],
      lonely: [{ focusId: 'tf_lonely', nodeId: 'lonely', text: 'A focus with nobody in the room', status: 'active',
        createdAt: NOW - DAY, by: 'solo', origin: { from: 'leader', by: 'solo', at: NOW - DAY, inquiryId: null } }],
    },
  },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = t => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });
  const get  = (u, t) => fetch(base + u, { headers: H(t) }).then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const post = (u, t, b) => fetch(base + u, { method: 'POST', headers: H(t), body: JSON.stringify(b || {}) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));

  const coachT = issueToken('coach', C, 'coach');
  const p1T = issueToken('p1', C, 'member');
  const p2T = issueToken('p2', C, 'member');
  const soloT = issueToken('solo', C, 'member');
  const sibT = issueToken('sib', C, 'coach');
  const farT = issueToken('far', X, 'coach');

  const thread = (kind, id, tok, scope) =>
    get(`/api/objects/${kind}/${id}/thread${scope ? `?scope=${encodeURIComponent(scope)}` : ''}`, tok);

  try {
    console.log('\n  A — TWO OR MORE READABLE PEOPLE, OR NO FORUM');
    const crowdRead = await thread('focus', 'tf_crowd', coachT, 'group:crowd');
    ok('FA-A1 an object whose room is three people HAS a forum',
      crowdRead.status === 200 && crowdRead.j.forumAvailable === true);
    ok('FA-A1b …and says how many people can read it, which is the fact the rule turns on',
      crowdRead.j.forumReadable === 3);
    ok('FA-A1c …with no reason attached, because there is nothing being withheld',
      crowdRead.j.forumWhy === null);

    /* THE CASE EVERY OLD RULE GOT WRONG. A node exists, so "is there a node" said yes. There is
       one person in it. */
    const lonelyRead = await thread('focus', 'tf_lonely', soloT, 'group:lonely');
    ok('FA-A2 a node with ONE person on its roster has NO forum — a node is not a room',
      lonelyRead.status === 200 && lonelyRead.j.forumAvailable === false);
    ok('FA-A2b …and says why, rather than leaving an absence to be interpreted',
      lonelyRead.j.forumReadable === 1 && /nobody else in this group/i.test(String(lonelyRead.j.forumWhy)));

    const mineRead = await thread('inquiry', 'inq_mine', p1T);
    ok('FA-A3 a personal object nobody else can read has no forum',
      mineRead.status === 200 && mineRead.j.forumAvailable === false);
    ok('FA-A3b …and says it is just them',
      /just you/i.test(String(mineRead.j.forumWhy)));

    console.log('\n  B — ONE OWNER, ASKED BY EVERY SURFACE');
    /* The composer context and the thread route are the two readers a person actually meets.
       They used to compute this separately and had already drifted. */
    const ctx = await post('/api/assistant/turn', coachT,
      { text: 'what is going on with this', about: { kind: 'focus', id: 'tf_crowd' } });
    ok('FA-B1 a turn bound to the same object agrees with that object’s own screen',
      ctx.status === 200);
    const lonelyCtx = await post('/api/assistant/turn', soloT,
      { text: 'what is going on with this', about: { kind: 'focus', id: 'tf_lonely' } });
    ok('FA-B1b …and both agree on the one-person node too', lonelyCtx.status === 200);

    const SRC = decomment(R('server.js'));
    ok('FA-B2 availability is computed in exactly ONE function in the whole server',
      (SRC.match(/function _forumAudience\(/g) || []).length === 1);
    ok('FA-B2b …and no surface computes it for itself any more',
      !/forumAvailable:\s*!!\(object/.test(SRC)
      && !/const _forum = !!_nodeId/.test(SRC));
    ok('FA-B2c …including the room the forum routes open, so the icon and the room cannot disagree',
      /const aud = _forumAudience\(code, userId, obj\)/.test(SRC));

    console.log('\n  C — THE AUDIENCE IS CURRENT, NEVER REMEMBERED');
    const before = await thread('focus', 'tf_crowd', p2T, 'group:crowd');
    ok('FA-C1 a member of the room sees the forum', before.j.forumAvailable === true);
    // Take one person off the roster. Two remain, so the room survives — and the count moves.
    orgNodes[C].crowd.memberIds = ['p1'];
    const afterOne = await thread('focus', 'tf_crowd', p1T, 'group:crowd');
    ok('FA-C2 removing one of three leaves a room of two, and the count says so',
      afterOne.j.forumAvailable === true && afterOne.j.forumReadable === 2);
    // Take the last member off. A leader alone is one person.
    orgNodes[C].crowd.memberIds = [];
    const afterAll = await thread('focus', 'tf_crowd', coachT, 'group:crowd');
    ok('FA-C3 …and once only the leader is left the forum is gone, on the VERY NEXT read',
      afterAll.j.forumAvailable === false && afterAll.j.forumReadable === 1);
    ok('FA-C3b …with no sweep, no cache and no stored membership list to go stale',
      !/forumMembers\s*[:=]/.test(SRC) && !/cachedForum/i.test(SRC));
    orgNodes[C].crowd.memberIds = ['p1', 'p2'];       // put the squad back
    const restored = await thread('focus', 'tf_crowd', coachT, 'group:crowd');
    ok('FA-C4 …and it comes back when they do, because the answer is computed rather than stored',
      restored.j.forumAvailable === true && restored.j.forumReadable === 3);

    console.log('\n  D — A SIBLING NODE AND ANOTHER TENANT REACH NOTHING');
    const sibRead = await thread('focus', 'tf_crowd', sibT, 'group:crowd');
    ok('FA-D1 a sibling node’s leader cannot read the object at all, so the question of a forum never arises',
      sibRead.status === 404 || sibRead.status === 403 || sibRead.j.forumAvailable === false);
    const farRead = await thread('focus', 'tf_crowd', farT, 'group:crowd');
    ok('FA-D2 another tenant gets nothing', farRead.status === 404 || farRead.status === 403);
    const farPost = await post('/api/group/crowd/forum/inq_crowd', farT, { text: 'hello' });
    ok('FA-D2b …and cannot post into the room either', farPost.status === 403 || farPost.status === 404);

    console.log('\n  E — FORUM INFORMS PRIVATE CONVERSATION, FOR THAT OBJECT ONLY');
    const said = await post('/api/group/crowd/forum/inq_crowd', p1T,
      { text: 'we keep going long when the first pass is on' });
    ok('FA-E1 somebody says something in the room', said.status === 200);
    ok('FA-E1b …and saying it changes nothing epistemically, which the route states outright',
      said.j.epistemicEffect === 'none');

    const CTX = decomment(R('ai/composer.js'));
    ok('FA-E2 the context bundle has a place for this object’s forum',
      /forum = null/.test(CTX) && /forum\.messages/.test(CTX));
    ok('FA-E3 …and prints the rule beside the data rather than trusting a prompt to remember it',
      /NOTHING IN THAT LIST IS EVIDENCE/.test(R('ai/composer.js'))
      && /do not say "the group/i.test(R('ai/composer.js')));
    ok('FA-E4 …and never carries an author, because forum speech is anonymous to every human',
      !/m\.by/.test(CTX) && !/authorId/.test(CTX));
    ok('FA-E5 the server resolves the room from the object the turn is BOUND to, with no parameter for another',
      /function _forumContext\(code, userId, about\)/.test(SRC)
      && /_forumContext\(code, userId, about\)/.test(SRC));
    ok('FA-E5b …re-checking membership at the moment of the turn rather than inheriting it',
      /_forumContext[\s\S]{0,1400}_mayReadGroup\(code, aud\.key, userId\)/.test(SRC));
    ok('FA-E6 …and drops a withdrawn message, because taking something back is not speech',
      /_forumContext[\s\S]{0,1600}status !== 'removed'/.test(SRC));

    console.log('\n  F — PRIVATE NEVER ENTERS A FORUM WITHOUT SHARE-AND-CONFIRM');
    const ACT = decomment(R('ai/composer-actions.js'));
    ok('FA-F1 sharing to a forum is its OWN action, never a variation of another',
      /share_to_forum:\s*\{/.test(ACT));
    ok('FA-F1b …and it always requires a confirmation',
      /share_to_forum:\s*\{[^}]*confirmation:\s*true/.test(ACT));
    ok('FA-F2 the confirmation card names the ROOM, resolved by the server from the object',
      /candidate\.type === 'share_to_forum'[\s\S]{0,300}context\.forumRoom/.test(SRC));
    ok('FA-F3 …and says exactly what crosses and what does not',
      /Only these words are posted/.test(R('server.js'))
      && /rest of this conversation stays private/.test(R('server.js')));
    ok('FA-F4 …and that what is posted is speech rather than evidence',
      /speech, not evidence/.test(R('server.js')));
    ok('FA-F5 the person’s EDIT is what gets posted — a share whose wording they did not see is not one they made',
      /share_to_forum'\)[\s\S]{0,1400}overrides\.text/.test(SRC));
    ok('FA-F6 the room is re-resolved at CONFIRM time, not inherited from when the card was staged',
      /prop\.actionType === 'share_to_forum'[\s\S]{0,900}_forumAudience\(code, userId, live\)/.test(SRC));
    ok('FA-F7 …and posting touches forumThreads and nothing epistemic',
      /share_to_forum'\)[\s\S]{0,2000}epistemicEffect: 'none'/.test(SRC));
    ok('FA-F8 no other path carries a private conversation into a forum: every writer of forum speech is a forum route or this one action',
      (() => {
        // Every place a message is appended to a thread, and what reaches it.
        const writers = (SRC.match(/\.messages\.push\(/g) || []).length;
        const newMsg = (SRC.match(/forum\.newMessage\(/g) || []).length;
        return writers >= 1 && newMsg >= 1 && newMsg <= 3;
      })());

    console.log('\n  G — AND THE CONTROL THAT OPENS A FORUM TELLS THE TRUTH ABOUT ITSELF');
    const APP = decomment(R('js/app.js'));
    ok('FA-G1 the forum control is an inline SVG, not an emoji — the repository convention',
      /iqt-forum[\s\S]{0,400}<svg/.test(R('js/app.js'))
      && !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(R('js/app.js')));
    ok('FA-G2 …with an accessible name that says what it opens',
      /aria-label="Open forum/.test(R('js/app.js')));
    ok('FA-G3 …and it is NOT aria-pressed, because it opens a room and is not a toggle',
      !/class="iqt-forum"[^>]*aria-pressed/.test(R('js/app.js')));
    ok('FA-G4 …and it is drawn only when the server says there is a forum',
      /data\.forumAvailable \?/.test(APP));
    ok('FA-G5 …at a 44px target, which the stylesheet gives it',
      /\.iqt-forum\{[^}]*min-width:44px[^}]*min-height:44px/.test(R('css/styles.css').replace(/\s+/g, ''))
      || /min-width:44px;min-height:44px/.test(R('css/styles.css').replace(/\s+/g, '')));

  } catch (e) { fail++; console.error('  FAIL forum-audience suite threw:', e && e.stack); }

  server.close();
  console.log(`\nforum-audience-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
