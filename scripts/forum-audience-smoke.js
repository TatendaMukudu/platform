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
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, orgNodes, orgUsers, forumThreads,
  _forumAudience, _forumContext, groupCandidates, inquiryStates } = S;

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
    /* FA-E5 REWRITTEN, AND NOT WEAKENED. It pinned the parameter NAME `about`, which was right
       about the law (one object, no parameter for another) and wrong about what that parameter
       was carrying: `about` is the headline and body a prompt reads, and this reader needs the
       object's identity. The two were being conflated, which is exactly the defect block I now
       guards. The law is unchanged and asserted the same way — one bound ref in, no second
       object reachable — and the behaviour is driven below rather than only read here. */
    ok('FA-E5 the server resolves the room from the object the turn is BOUND to, with no parameter for another',
      /function _forumContext\(code, userId, aboutRef\)/.test(SRC)
      && /_forumContext\(code, userId, aboutRef\)/.test(SRC)
      && /aboutRef: actionContext\.objectRef/.test(SRC));
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

    /* ══ H — ALL FOUR KINDS, AND A KIND THAT IS NOT ONE ═══════════════════════════════════
       The founder's rule names High, Low, Inquiry and Focus. A group High is a PROJECTION of an
       inquiry rather than a stored record, so it cannot be seeded into the bucket the way a focus
       can — it is driven here against the canonical owner, with the object shape the bucket
       actually produces for it, rather than left untested because it is inconvenient to fixture. */
    console.log('\n  H — THE RULE IS ONE RULE, AND IT COVERS ALL FOUR KINDS');
    const obj = (kind, raw, extra) => ({ kind, id: 'x1', about: `${kind}:x1`, raw: raw || {}, ...(extra || {}) });
    for (const kind of ['high', 'low', 'inquiry', 'focus']) {
      const inRoom = _forumAudience(C, 'p1', obj(kind, { nodeId: 'crowd' }));
      ok(`FA-H1 a group ${kind.toUpperCase()} on a three-person node has a forum, and says how many can read it`,
        inRoom.available === true && inRoom.readable === 3 && inRoom.forumKind === 'group');
      const alone = _forumAudience(C, 'solo', obj(kind, { nodeId: 'lonely' }));
      ok(`FA-H2 …and the same ${kind.toUpperCase()} on a ONE-person node has none, with the reason said out loud`,
        alone.available === false && alone.readable === 1 && /nobody else in this group/i.test(alone.reason || ''));
      const personal = _forumAudience(C, 'p1', obj(kind, {}));
      ok(`FA-H3 …and a PERSONAL ${kind.toUpperCase()} nobody else can read has none either`,
        personal.available === false && /just you/i.test(personal.reason || ''));
    }
    ok('FA-H4 a group subjectRef resolves the room even when the object carries no nodeId of its own',
      _forumAudience(C, 'p1', obj('high', { subjectRef: 'group:crowd' })).available === true);
    ok('FA-H5 a kind that is not one of the four is REFUSED rather than falling through to a room',
      (() => { const r = _forumAudience(C, 'p1', obj('material', { nodeId: 'crowd' }));
        return r.available === false && /High, a Low, an Inquiry or a Focus/.test(r.reason || ''); })());
    ok('FA-H5b …including an object with no kind at all, which is the shape a bug arrives in',
      _forumAudience(C, 'p1', { id: 'x', raw: { nodeId: 'crowd' } }).available === false);
    ok('FA-H6 an EMPTY node — one that exists with nobody on it — has no room either',
      _forumAudience(C, 'sib', obj('inquiry', { nodeId: 'sibling' })).available === false);
    /* ── AN ACCOUNT IS NOT A PERSON YOU CAN TALK TO ────────────────────────────────────────
       This owner asked only whether the account OBJECT existed, while eleven other readers in
       the codebase ask about `status`. That fails OPEN: a person the rest of the product treats
       as gone was still counted toward the two a room needs, so the last two people in a squad
       could be one living person and one departed one. AGENTS.md invariant 7 forbids exactly
       that shape.

       CLASSIFIED HONESTLY: no route in the product currently writes a non-active status onto an
       account — `_removePerson` deletes the record and strips the rosters — so this is a rule
       made consistent with the other eleven readers, not a live defect reproduced through a
       product path. The state is reachable through seeded and imported data, which is where the
       other readers' checks came from in the first place. */
    {
      const was = orgUsers[C].p2 && orgUsers[C].p2.status;
      ok('FA-H7 a three-person node is a room of three while everybody is present',
        _forumAudience(C, 'p1', obj('inquiry', { nodeId: 'crowd' })).readable === 3);
      orgUsers[C].p2.status = 'removed';
      const short = _forumAudience(C, 'p1', obj('inquiry', { nodeId: 'crowd' }));
      ok('FA-H7b …and an account marked as gone stops counting, on the very next read',
        short.readable === 2 && short.available === true);
      /* The three people on this node are two players and the LEADER, so reducing it to one
         present person means marking the coach gone as well. Asserting against the wrong count
         here would have reported a product defect that was a fixture mistake — the same trap that
         caught the "shrink the roster to one member" case, where the coach was still in the room. */
      const wasCoach = orgUsers[C].coach.status;
      orgUsers[C].coach.status = 'removed';
      const pair = _forumAudience(C, 'p1', obj('inquiry', { nodeId: 'crowd' }));
      ok('FA-H7c …and when that leaves ONE person present, the room closes rather than being offered to nobody',
        pair.readable === 1 && pair.available === false
        && /nobody else in this group/i.test(pair.reason || ''));
      orgUsers[C].p2.status = was; orgUsers[C].coach.status = wasCoach;
      ok('FA-H7d …and it reopens when they are back, because the answer is computed rather than stored',
        _forumAudience(C, 'p1', obj('inquiry', { nodeId: 'crowd' })).available === true);
      /* AN ACCOUNT WITH NO STATUS FIELD AT ALL is present. Refusing those would empty every room
         in an organisation whose records predate the field, which is a worse failure than the one
         this rule prevents. */
      delete orgUsers[C].p2.status;
      ok('FA-H7e an account written before this field existed still counts, because "not marked otherwise" is the rule and not "marked active"',
        _forumAudience(C, 'p1', obj('inquiry', { nodeId: 'crowd' })).readable === 3);
      orgUsers[C].p2.status = was;
    }

    /* ══ I — ONE WAY, ONE OBJECT, AND IT IS BEHAVIOUR RATHER THAN A PROMISE ═══════════════ */
    console.log('\n  I — FORUM INFORMS THIS OBJECT\'S CONVERSATION, AND NO OTHER');
    /* DRIVEN THROUGH THE ROOM A PERSON ACTUALLY OPENS, and that is what found the defect this
       block now guards: a squad's focus is written at `focus:<id>` by _forumRoom, and the read
       was keyed on the AUDIENCE's forumKind rather than on the object's kind — which for a group
       focus says 'group', so the composer looked for `tf_crowd`, found nothing, and returned
       "no forum" for a room the person could open by tapping the icon on the same screen. The
       founder's rule was silently not happening for the commonest Focus in the product. */
    await post('/api/forum/focus/tf_crowd', p1T, { text: 'We are stepping at different moments in the press' });
    const ctxSame = _forumContext(C, 'p1', 'focus:tf_crowd');
    ok('FA-I1 a turn about THIS object is handed this object\'s room',
      !!ctxSame && ctxSame.messages.length === 1 && /stepping at different moments/.test(ctxSame.messages[0].text));
    ok('FA-I1a …and a GROUP focus is not a special case that quietly gets nothing — its room is written where its writer writes it',
      !!ctxSame && ctxSame.sameObject === 'focus:tf_crowd');
    ok('FA-I1b …with no author on it, because forum speech is anonymous to every human and the one reader that is not a human must not be the way round that',
      !('authorId' in ctxSame.messages[0]) && !JSON.stringify(ctxSame).includes('p1'));
    ok('FA-I2 …and a turn about a DIFFERENT object the same person can also read is handed nothing from it',
      _forumContext(C, 'p1', 'inquiry:inq_crowd') === null);
    ok('FA-I2b …and neither is a group object in a node this person is not on',
      _forumContext(C, 'p1', 'inquiry:inq_lonely') === null);
    ok('FA-I3 somebody who cannot read the object at all gets nothing',
      _forumContext(C, 'solo', 'focus:tf_crowd') === null);
    ok('FA-I3b …and neither does another tenant, which fails closed at the object rather than at the room',
      _forumContext(X, 'far', 'focus:tf_crowd') === null);
    ok('FA-I4 a person REMOVED from the node gets nothing on the very next read, with nothing swept',
      (() => {
        const node = orgNodes[C].crowd;
        const keep = node.memberIds.slice();
        node.memberIds = keep.filter(id => id !== 'p1');
        const after = _forumContext(C, 'p1', 'focus:tf_crowd');
        node.memberIds = keep;
        return after === null;
      })());
    ok('FA-I4b …and it comes back when they do, because nothing was stored to go stale',
      !!_forumContext(C, 'p1', 'focus:tf_crowd'));

    /* ══ J — SPEECH IS NOT EVIDENCE UNTIL ITS AUTHOR OFFERS IT ════════════════════════════ */
    console.log('\n  J — SAYING IT CHANGES NOTHING UNTIL SOMEBODY OFFERS IT');
    const beforeSignals = JSON.stringify((inquiryStates[C] || {})['group:crowd'] || {});
    const spoke = await post('/api/group/crowd/forum/inq_crowd', p2T, { text: 'I saw the same thing on Saturday from the far side' });
    ok('FA-J1 posting into the room says so: no epistemic effect at all',
      spoke.status === 200 && spoke.j.epistemicEffect === 'none');
    ok('FA-J1b …and the group inquiry is byte-for-byte what it was before anybody spoke',
      JSON.stringify((inquiryStates[C] || {})['group:crowd'] || {}) === beforeSignals);
    const notMine = await post(`/api/group/crowd/forum/inq_crowd/${spoke.j.messageId}/contribute`, p1T, {});
    ok('FA-J2 somebody else cannot offer YOUR words as evidence — authorship, not leadership',
      notMine.status === 403);
    const mineNow = await post(`/api/group/crowd/forum/inq_crowd/${spoke.j.messageId}/contribute`, p2T, {});
    ok('FA-J2b …and its author can, through the SAME contribution boundary everything else uses',
      mineNow.status === 200);
    ok('FA-J3 …which produces a candidate holding the MESSAGE ID, never the words',
      (() => { const c = (groupCandidates[C] || []).find(x => x.evidenceRef === spoke.j.messageId);
        return !!c && !JSON.stringify(c).includes('far side'); })());

    /* ══ K — THE INDICATOR ON THE CARD IS THE SERVER'S ANSWER ═════════════════════════════
       And it was not. The card decided for itself: `item.shared === true || participants.length > 1`.
       Neither field survives the objects projection — `shared` is written by the thread route and
       `participants` lives on `raw` — so the indicator was a FOURTH availability rule that could
       never be true, and a person scanning their list could not tell which threads had anybody in
       them. Found by looking for the literal word "Forum" the founder asked to have removed. */
    console.log('\n  K — AND THE CARD ASKS THE SAME OWNER AS THE SCREEN');
    const list = await get('/api/objects?kind=focus&scope=all', p1T);
    ok('FA-K1 the objects list carries whether each one has a room',
      list.status === 200 && (list.j.objects || []).every(o => typeof o.forumAvailable === 'boolean'));
    ok('FA-K2 …true for the squad focus and false for the one-person one, which is the same answer its own screen gives',
      (() => {
        const byId = Object.fromEntries((list.j.objects || []).map(o => [o.id, o.forumAvailable]));
        return byId.tf_crowd === true && (!('tf_lonely' in byId) || byId.tf_lonely === false);
      })());
    ok('FA-K3 the card renders the ICON and not the word "Forum"',
      /iq-inq-forum[^>]*>\s*<svg/.test(R('js/app.js')) && !/>Forum<\/span>/.test(R('js/app.js')));
    ok('FA-K3b …with its meaning carried accessibly, since a glyph on its own says nothing to a screen reader',
      /class="iq-inq-forum" role="img" aria-label="Others can discuss this"/.test(R('js/app.js')));
    ok('FA-K4 …and NO surface computes availability for itself any more, the client included',
      !/item\.shared === true \|\| \(Array\.isArray\(item\.participants\)/.test(APP)
      && /item\.forumAvailable === true/.test(APP));

    /* ══ L — AND IT REACHES THE MODEL, WHICH IS THE ONLY THING THAT MAKES ANY OF IT TRUE ═══
       Every assertion above about the Forum-informs-this-object rule is an assertion about a
       function. This one is about the PRODUCT: it drives the real turn and reads what the model
       was actually handed, because the defect this block exists for was two readers returning
       null on every call while the bundle they fed looked exactly like "there was nothing to
       add". A capability that silently produces nothing is indistinguishable from one that is
       not wired at all — and for a fortnight, that is what this was. */
    console.log('\n  L — AND THE ROOM ACTUALLY REACHES THE TURN');
    {
      const gw = require('../ai/gateway.js');
      const REAL = { enabled: gw.enabled, budgetAvailable: gw.budgetAvailable, complete: gw.complete };
      let handed = '';
      Object.assign(gw, {
        enabled: () => true, budgetAvailable: () => true,
        complete: async (o) => { handed = String((o && o.user) || ''); return ''; },
      });
      await post('/api/assistant/turn', p1T, { text: 'What should we do about this focus?', about: { kind: 'focus', id: 'tf_crowd' } });
      ok('FA-L1 a turn bound to the object is handed that object\'s room',
        /stepping at different moments/.test(handed));
      ok('FA-L1b …with the rule printed beside the data, so a model handed six agreeing messages cannot write "the group agrees"',
        /not evidence|does not (?:make|count)|changes nothing/i.test(handed));
      handed = '';
      await post('/api/assistant/turn', p1T, { text: 'And what about the other thing?', about: { kind: 'inquiry', id: 'inq_crowd' } });
      ok('FA-L2 …and a turn bound to a DIFFERENT object is handed none of it',
        !/stepping at different moments/.test(handed));
      Object.assign(gw, REAL);
    }

  } catch (e) { fail++; console.error('  FAIL forum-audience suite threw:', e && e.stack); }

  server.close();
  console.log(`\nforum-audience-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
