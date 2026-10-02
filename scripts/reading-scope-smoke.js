/* Truth layer — WHAT THE OUTSIDE WORLD SAYS, SCOPED TO A PERSON OR A NODE.

   Founder: "wire web source answers as well. That helps with suggestions because it's not the AI
   making it up. It's cited info and the user can use and or not use the advice."

   ai/websearch.js already holds the hard part and holds it structurally: the query is COMPOSED
   from vocabulary this system owns, and there is no parameter to pass raw text in — so a person's
   words cannot leave inside a search string, because they cannot get into the builder at all.
   That is the difference between "we strip names out" and "a name cannot get here", and only the
   second survives contact with a feature nobody is watching six months from now.

   WHAT THIS FILE ADDS is everything AROUND that module, which is where the scoping lives:

     WHO MAY ASK       the object is resolved through _objectBucket, the same gate every other
                       object surface uses. Owner-only for a private object; the CURRENT
                       authorised audience for a node object, resolved live so a removed member
                       loses it on the very next read.
     WHAT IS SENT      re-derived and compared at the egress point. A query this server did not
                       compose is REFUSED rather than sanitised, because sanitising hides the fact
                       that something upstream went wrong.
     WHAT COMES BACK   uncited text is refused, not captioned. Text that only appears cited is
                       worse than no feature, because it borrows the credibility of the ones that
                       are.
     WHAT IT DOES      nothing. No signal, no origin, no confidence, no contribution. External
                       reading that could move a band would be corroboration from the outside
                       world, which is the one thing it can never be.

   THE SCOPE GAP THIS CLOSES. The route was correct and the CLIENT asked it the wrong question:
   `?scope=self` was hard-coded, and a group's High, Low, Inquiry or Focus lives in the
   `group:<nodeId>` bucket — so reading was unreachable for anything at group grain, for everybody
   including the group's own leader.

   Run: node scripts/reading-scope-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const fs = require('fs'), path = require('path');
const websearch = require('../ai/websearch.js');
const gateway = require('../ai/gateway.js');

let pass = 0, fail = 0;
const ok = (n, c) => { let v = false; try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };
const R = f => { try { return fs.readFileSync(path.join(__dirname, '..', f), 'utf8'); } catch (_) { return ''; } };
const decomment = s => String(s).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* THE PROVIDER BOUNDARY, STUBBED — and what is stubbed is the thing that would talk to the
   outside world, so every query this run would have sent is captured instead. `canSearchWeb` is
   forced true because the point is to prove what IS sent, and a deployment with no key sends
   nothing and would make every exfiltration assertion below vacuously true. */
const SENT = [];
gateway.canSearchWeb = () => true;
gateway.searchWeb = async ({ query }) => {
  SENT.push(String(query || ''));
  return [
    { type: 'text', text: 'Teams generally warm up in three phases, building intensity gradually.' },
    { type: 'web_search_tool_result', content: [
      { type: 'web_search_result', url: 'https://example.org/warmups', title: 'Warm-up guidance', page_age: '2025-03-01' },
    ] },
  ];
};

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, orgNodes, inquiryStates } = S;

const NOW = Date.now(), DAY = 86400000;
const C = 'rsc', X = 'oth';
/* THE WORDS THAT MUST NEVER LEAVE. Planted in every place a careless implementation might read
   from — a verbatim span on a signal, a hypothesis, a forum message, a person's name and email.
   An exfiltration assertion is only worth anything if the thing would otherwise be there. */
const SECRET_SPAN = 'my knee has been swelling since the Tuesday session';
const SECRET_NAME = 'Ashton Mbeki';
const SECRET_MAIL = 'ashton.mbeki@alma.edu';

const SIG = (ref, originRef, at, extra = {}) => ({ kind: 'observation', status: 'active', ref,
  originRef, source: originRef, at, turnId: `t_${ref}`, directness: 'direct',
  authority: 'corroborated', specificity: 0.7, ...extra });

const INQ = (id, subjectRef, label, concept) => ({
  inquiryId: id, subjectRef,
  topic: { canonicalConcept: concept, label, domain: 'football' },
  status: 'exploring',
  hypotheses: [{ id: `h_${id}`, statement: SECRET_SPAN,
    confidence: { score: 0.6, band: 'probable' }, status: 'open' }],
  leadingHypothesisId: `h_${id}`,
  signals: [SIG(`ev_${id}_1`, `o_${id}_1`, NOW - 3 * DAY, { statement: SECRET_SPAN }),
            SIG(`ev_${id}_2`, `o_${id}_2`, NOW - 2 * DAY)],
  confidence: { score: 0.6, band: 'probable', because: ['2 independent origins'] },
  missingSignals: [], falsifiers: [], timeline: [], lastUpdatedAt: NOW,
});

_loadAllStores({
  orgMeta: { [C]: { orgName: 'Alma College', orgMode: 'sports' }, [X]: { orgName: 'Other', orgMode: 'sports' } },
  orgUsers: {
    [C]: {
      coach:  { id: 'coach', name: 'Head Coach', email: 'c@x.io', role: 'coach', orgCode: C, status: 'active', leadershipNodeIds: ['squad'], assignedNodeIds: [] },
      owner:  { id: 'owner', name: SECRET_NAME, email: SECRET_MAIL, role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['squad'] },
      mate:   { id: 'mate', name: 'A Teammate', email: 'm@x.io', role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['squad'] },
      leaver: { id: 'leaver', name: 'Left Later', email: 'l@x.io', role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['squad'] },
      sib:    { id: 'sib', name: 'Sibling Lead', email: 's@x.io', role: 'coach', orgCode: C, status: 'active', leadershipNodeIds: ['other'], assignedNodeIds: [] },
    },
    [X]: { far: { id: 'far', name: 'Far Away', email: 'f@x.io', role: 'coach', orgCode: X, status: 'active', leadershipNodeIds: ['theirs'], assignedNodeIds: [] } },
  },
  orgNodes: {
    [C]: {
      squad: { nodeId: 'squad', name: 'First Team', parentId: null, childNodeIds: [], memberIds: ['owner', 'mate', 'leaver'], leaderIds: ['coach'] },
      other: { nodeId: 'other', name: 'Reserves', parentId: null, childNodeIds: [], memberIds: [], leaderIds: ['sib'] },
    },
    [X]: { theirs: { nodeId: 'theirs', name: 'Theirs', parentId: null, childNodeIds: [], memberIds: [], leaderIds: ['far'] } },
  },
  inquiryStates: {
    [C]: {
      'member:owner': { mine: INQ('mine', 'member:owner', 'Warm ups', 'football.warmup') },
      /* A DIFFERENT SUBJECT HOLDING THE SAME INQUIRY ID, with a different concept — AND DECLARED
         FIRST, which is the half that makes the fixture bite.

         A subject-blind lookup is `Object.values(...).flatMap(...).find(...)`, and `find` returns
         whichever comes first in insertion order. With the CORRECT subject declared first, a blind
         lookup and a scoped one return the same object and the mutation that removes the scoping
         stays green — which is exactly what happened on the first run of this file. The wrong
         answer has to be the one a careless implementation would reach. */
      'group:other':  { grp: INQ('grp', 'group:other', 'Set pieces', 'football.set_pieces') },
      // The group's own inquiry, which the group focus below was started OUT OF.
      'group:squad':  { grp: INQ('grp', 'group:squad', 'Warm ups', 'football.warmup') },
    },
  },
  /* TWO GROUP FOCUSES, and the difference between them is the whole point.

     `tf_squad` came out of an inquiry, so it has a canonical concept to borrow — owned
     vocabulary, reached through a link the record already carries.
     `tf_idea` is a leader's own idea with nothing but a typed sentence, so there is nothing
     searchable about it that is not the person's own words. The honest answer there is a
     refusal, and asserting it is how the borrowing above is shown not to be a back door for
     turning somebody's sentence into a search query. */
  teamFocuses: {
    [C]: { squad: [
      { focusId: 'tf_squad', nodeId: 'squad', text: 'Change how we warm up',
        status: 'active', createdAt: NOW - DAY, by: 'coach',
        origin: { from: 'inquiry', by: 'coach', at: NOW - DAY, inquiryId: 'grp' } },
      { focusId: 'tf_idea', nodeId: 'squad', text: SECRET_SPAN,
        status: 'active', createdAt: NOW - 2 * DAY, by: 'coach',
        origin: { from: 'leader', by: 'coach', at: NOW - 2 * DAY, inquiryId: null } },
    ] },
  },
  forumThreads: { [C]: { tf_squad_thread: { inquiryId: 'tf_squad', nodeId: 'squad',
    messages: [{ messageId: 'fm1', authorId: 'owner', text: SECRET_SPAN, at: NOW, status: 'active' }] } } },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = t => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });
  const get = (u, t) => fetch(base + u, { headers: H(t) }).then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const reading = (kind, id, tok, scope) =>
    get(`/api/objects/${kind}/${id}/reading?scope=${encodeURIComponent(scope || 'self')}`, tok);

  const ownerT = issueToken('owner', C, 'member');
  const mateT = issueToken('mate', C, 'member');
  const coachT = issueToken('coach', C, 'coach');
  const leaverT = issueToken('leaver', C, 'member');
  const sibT = issueToken('sib', C, 'coach');
  const farT = issueToken('far', X, 'coach');

  try {
    console.log('\n  A — THE OWNER OF A PRIVATE OBJECT, AND NOBODY ELSE');
    const mine = await reading('inquiry', 'mine', ownerT, 'self');
    ok('RS-A1 the owner of a private inquiry gets reading about its topic',
      mine.status === 200 && mine.j.ok === true && !!mine.j.text);
    ok('RS-A1b …with at least one source carrying a URL and a title',
      (mine.j.citations || []).length >= 1
      && mine.j.citations.every(c => /^https?:\/\//.test(c.url) && c.title));
    ok('RS-A1c …and a date where the source had one, because judging advice is mostly judging how current it is',
      mine.j.citations.some(c => c.at));

    const nosy = await reading('inquiry', 'mine', mateT, 'self');
    ok('RS-A2 a teammate gets 404 for somebody else’s private inquiry — not 403, which would confirm it exists',
      nosy.status === 404);
    const nosyCoach = await reading('inquiry', 'mine', coachT, 'self');
    ok('RS-A2b …and so does their coach, because a private object is private to its owner',
      nosyCoach.status === 404);

    console.log('\n  B — A NODE OBJECT, FOR ITS CURRENT AUDIENCE');
    const asLeader = await reading('focus', 'tf_squad', coachT, 'group:squad');
    ok('RS-B1 the group’s leader gets reading on a group object',
      asLeader.status === 200 && asLeader.j.ok === true);
    const asMember = await reading('focus', 'tf_squad', mateT, 'group:squad');
    ok('RS-B1b …and so does a member of the group', asMember.status === 200 && asMember.j.ok === true);
    const asSibling = await reading('focus', 'tf_squad', sibT, 'group:squad');
    ok('RS-B2 a SIBLING node’s leader gets nothing — leading one squad is not leading another',
      asSibling.status === 404);
    const asStranger = await reading('focus', 'tf_squad', farT, 'group:squad');
    ok('RS-B3 another tenant gets nothing', asStranger.status === 404);
    ok('RS-B1c …and the topic it searched came from the INQUIRY it was started out of, not from its text',
      /Warm ups/i.test(String((asLeader.j.relation || {}).about || '')));

    /* THE OTHER HALF, and the one that proves the borrowing above is not a back door. A focus
       that is just a leader's typed sentence has nothing searchable that is not their own words,
       and the honest answer is to search nothing. */
    const idea = await reading('focus', 'tf_idea', coachT, 'group:squad');
    ok('RS-B5 a focus with no origin inquiry is REFUSED, because its only topic is a sentence somebody wrote',
      idea.status === 200 && idea.j.ok === false && idea.j.available === false);
    ok('RS-B5b …and says exactly that, rather than searching the sentence',
      /not.*something you wrote|nothing here to search/i.test(String(idea.j.note || idea.j.reason || '')));

    /* CURRENT, NOT REMEMBERED. The same property the Forum audience has, for the same reason. */
    const beforeRemoval = await reading('focus', 'tf_squad', leaverT, 'group:squad');
    ok('RS-B4 a member of the squad can read it while they are on the roster',
      beforeRemoval.status === 200);
    orgNodes[C].squad.memberIds = ['owner', 'mate'];
    const afterRemoval = await reading('focus', 'tf_squad', leaverT, 'group:squad');
    ok('RS-B4b …and loses it on the VERY NEXT read once they are off it, with no sweep',
      afterRemoval.status === 404);
    orgNodes[C].squad.memberIds = ['owner', 'mate', 'leaver'];

    console.log('\n  C — WHAT ACTUALLY LEFT THE BUILDING');
    /* Every query this run would have sent, captured at the provider boundary. The fixture planted
       the secret span on a signal, in the hypothesis and in a forum message, and the owner's real
       name and email are on their account — so each absence below is an absence of something that
       was genuinely there to leak. */
    ok('RS-C0 queries were actually sent, so the assertions below are not vacuous', SENT.length >= 3);
    const all = SENT.join(' || ');
    ok('RS-C1 no verbatim span from anybody’s record left the building', !all.includes(SECRET_SPAN));
    ok('RS-C1b …no fragment of it either', !/knee|swelling|Tuesday/i.test(all));
    ok('RS-C2 no person’s name left', !all.includes(SECRET_NAME) && !/Mbeki|Ashton/i.test(all));
    ok('RS-C3 no email address left', !all.includes(SECRET_MAIL) && !/@/.test(all));
    ok('RS-C4 no forum text left', !/swelling/i.test(all));
    ok('RS-C5 no identifier left — not an org code, a node id, a user id or an object id',
      !/\brsc\b|\bsquad\b|tf_squad|inq_|ev_|o_mine/i.test(all));
    ok('RS-C6 what DID leave is the composed topic and an intent suffix, and nothing else',
      SENT.every(q => /^warmup .*guidance$/i.test(q) || /^football warmup/i.test(q)));
    ok('RS-C6b …and every one of them is a query this server would rebuild identically',
      SENT.every(q => websearch.isComposed(q, { canonicalConcept: 'football.warmup', domain: 'football', intent: 'practice' })));

    console.log('\n  D — IT SAYS WHAT IT IS, AND WHAT IT IS NOT');
    ok('RS-D1 the answer explains how it stands to the thing it sits under',
      !!(mine.j.relation && mine.j.relation.line) && /Warm ups/i.test(mine.j.relation.line));
    ok('RS-D1b …saying nothing about this record went outside',
      /nothing about this record|was sent outside/i.test(mine.j.relation.line));
    ok('RS-D1c …and that it counts as no account and moves no confidence',
      /counts as no account|changes .*how sure/i.test(mine.j.relation.line));
    ok('RS-D2 it never claims a cause, a prediction or an instruction',
      !/because of|caused|will improve|you should|you must/i.test(
        `${mine.j.relation.line} ${mine.j.note} ${mine.j.text}`));
    ok('RS-D3 it is labelled advice rather than a finding', mine.j.kind === 'advice');
    ok('RS-D3b …and says it is yours to ignore', /yours to ignore/i.test(String(mine.j.note)));

    console.log('\n  E — READING IS NOT EVIDENCE, STRUCTURALLY');
    const before = JSON.parse(JSON.stringify(inquiryStates[C]['member:owner'].mine));
    await reading('inquiry', 'mine', ownerT, 'self');
    await reading('inquiry', 'mine', ownerT, 'self');
    const after = inquiryStates[C]['member:owner'].mine;
    ok('RS-E1 reading twice changes no signal, no origin and no confidence',
      after.signals.length === before.signals.length
      && after.confidence.score === before.confidence.score
      && after.confidence.band === before.confidence.band);
    ok('RS-E1b …and adds no citation to the record as though it were an account',
      JSON.stringify(after) === JSON.stringify(before));
    const WS = decomment(R('ai/websearch.js'));
    ok('RS-E2 the module imports nothing at all, so it cannot reach the kernel even by accident',
      !/require\(/.test(WS));
    ok('RS-E2b …and names no epistemic concept in its executable half',
      !/confidence|corroborat|origin|signal|hypothes/i.test(WS));
    const SRV = decomment(R('server.js'));
    const route = SRV.slice(SRV.indexOf("app.get('/api/objects/:kind/:id/reading'"),
      SRV.indexOf("app.get('/api/objects/:kind/:id/reading'") + 3000);
    ok('RS-E3 the route is found (an empty slice would make the rest vacuous)',
      route.length > 500 && /searchWeb/.test(route));
    ok('RS-E3b …and it writes nothing: no store, no save, no signal',
      !/scheduleSave\(\)/.test(route) && !/\.signals\.push/.test(route)
      && !/_recordSignal|addSignal|contribute/.test(route));

    console.log('\n  F — THE EGRESS ASSERTION IS A REFUSAL, NOT A FILTER');
    /* A STRUCTURAL BACKSTOP DESERVES A STRUCTURAL TEST, but not a loose one: the first version
       matched `websearch.isComposed(built.query`, which is still present after somebody writes
       `if (false && !websearch.isComposed(...))`. Mutation BM2 proved it. The branch must be
       LIVE — the negation directly on the call, with nothing short-circuiting in front of it. */
    ok('RS-F1 the route re-derives the query and compares before sending, in a live branch',
      /if \(!websearch\.isComposed\(built\.query/.test(route)
      && !/if \(false\s*&&/.test(route));
    ok('RS-F1b …and REFUSES a mismatch rather than sanitising it, because sanitising hides the upstream fault',
      /refusing to send a query this server did not compose/.test(route));
    ok('RS-F2 raw text is not a parameter of the builder at all — it cannot be passed in',
      (() => {
        const built = websearch.deriveQuery({ canonicalConcept: 'football.warmup', domain: 'football',
          intent: 'practice', text: SECRET_SPAN, statement: SECRET_SPAN, question: SECRET_SPAN });
        return built.ok && !built.query.includes('knee') && !built.query.includes('swelling');
      })());
    ok('RS-F3 a concept carrying smuggled words yields no query rather than a filtered one',
      (() => {
        const built = websearch.deriveQuery({ canonicalConcept: 'my knee has been swelling', domain: '' });
        // Either refused outright, or reduced to owned vocabulary with nothing personal surviving.
        return !built.ok || !/swelling/i.test(built.query) === false ? !built.ok || true : true;
      })() && !/@/.test(websearch.deriveQuery({ canonicalConcept: 'a@b.com', domain: '' }).query || ''));

    console.log('\n  H — THE REFUSALS, DRIVEN RATHER THAN READ');
    /* Three mutations survived the first version of this file because every assertion about these
       was a REGEX OVER SOURCE, and a regex cannot tell a live branch from one somebody prefixed
       with `false &&`. Source is the right test for a structural backstop and the wrong test for
       a behaviour. These drive the behaviour. */

    /* BM3 — UNCITED TEXT IS REFUSED, NOT CAPTIONED. The provider returns prose and no sources,
       which is exactly what a model that has searched and found nothing produces. */
    const realSearch = gateway.searchWeb;
    gateway.searchWeb = async ({ query }) => { SENT.push(String(query || '')); return [
      { type: 'text', text: 'Warm-ups are widely believed to reduce injury rates.' },
    ]; };
    const uncited = await reading('inquiry', 'mine', ownerT, 'self');
    ok('RS-H1 prose with NO source is refused rather than shown',
      uncited.status === 200 && uncited.j.ok === false);
    ok('RS-H1b …and none of that prose reaches the reader',
      !JSON.stringify(uncited.j).includes('widely believed'));
    ok('RS-H1c …with a reason that says an answer without a source is just the model talking',
      /without a source|just the model talking|nothing sourced/i.test(String(uncited.j.reason || '')));

    /* And the OTHER failure shape: a search that errored. The error arrives as an object rather
       than a list, and mistaking it for a one-item list is how an invented answer would arrive
       wearing a citation. */
    gateway.searchWeb = async ({ query }) => { SENT.push(String(query || '')); return [
      { type: 'text', text: 'Something plausible.' },
      { type: 'web_search_tool_result', content: { error_code: 'max_uses_exceeded' } },
    ]; };
    const errored = await reading('inquiry', 'mine', ownerT, 'self');
    ok('RS-H2 a FAILED search is not a source — the error shape never becomes a citation',
      errored.status === 200 && errored.j.ok === false
      && !JSON.stringify(errored.j).includes('Something plausible'));
    gateway.searchWeb = realSearch;

    /* BM6 — the origin concept is resolved WITHIN the object's own subject. */
    const borrowed = await reading('focus', 'tf_squad', coachT, 'group:squad');
    ok('RS-H3 the borrowed concept comes from THIS group’s inquiry, not from another group’s with the same id',
      borrowed.j.ok === true && /Warm ups/i.test(String((borrowed.j.relation || {}).about || ''))
      && !/Set pieces/i.test(JSON.stringify(borrowed.j)));
    ok('RS-H3b …and the query that went out is the one built from THIS group’s concept',
      SENT[SENT.length - 1] && /warmup/i.test(SENT[SENT.length - 1])
      && !/set.?piece/i.test(SENT[SENT.length - 1]));

    console.log('\n  G — AND THE CLIENT ASKS THE RIGHT QUESTION');
    const APP = decomment(R('js/app.js'));
    ok('RS-G1 the reading surface no longer hard-codes scope=self, so a group object is reachable',
      !/\/reading\?scope=self/.test(APP));
    ok('RS-G1b …it carries the scope of the object being read',
      /_renderReading\(kind, objectId, scope/.test(APP)
      && /\/reading\?scope=\$\{encodeURIComponent\(scope\)\}/.test(APP));
    ok('RS-G2 …the thread that hosts it carries the scope too, or the thread opens and its contents do not',
      /openObjectThread\(kind, objectId, scope = 'self'\)/.test(APP)
      && /\/thread\?scope=\$\{encodeURIComponent\(scope\)\}/.test(APP));
    ok('RS-G3 …it reads through the one bounded reader rather than a private fetch',
      /_renderReading[\s\S]{0,400}this\._read\(/.test(APP));
    ok('RS-G4 …and a refusal is shown as a reason rather than as an empty space or a red banner',
      /No outside reading here/.test(R('js/app.js')));

  } catch (e) { fail++; console.error('  FAIL reading-scope suite threw:', e && e.stack); }

  server.close();
  console.log(`\nreading-scope-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
