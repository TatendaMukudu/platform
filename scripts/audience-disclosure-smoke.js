/* Truth layer — INQUIRY FORMATION IS NOT DISCLOSURE, and "who can see this?" is answerable.

   Two laws, made mechanical.

   L-ID1  INQUIRY FORMATION IS NOT DISCLOSURE.
          A private interaction may update private evidence, a private inquiry and a private
          noticing. None of that is a contribution. The organisation must not learn the content,
          and must not learn that the inquiry EXISTS — a leader who can see that IntelliQ has
          become curious about someone has been told something about them.

   L-AU1  AUDIENCE NARROWS, IT NEVER GRANTS.
          An audience is a durable REFERENCE resolved against current membership, never a stored
          list of people. It can hide a record from someone admissibility would have allowed. It
          can never reveal one to someone admissibility excludes.

   The adversarial set this exists to defeat:
     1  create an organisational inquiry from private evidence with no authorised contribution
     2  reveal that a private inquiry exists, through a coach or group API
     3  leak private text through a group read, a pattern, a Focus or a generated question
     5  get a wrong answer from "who can see this?" after contribution state changes
     6  retain a stale audience permission after membership or role changes

   Run: node scripts/audience-disclosure-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV = 'test';
process.env.IQ_DETERMINISTIC_ONLY = '1';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.log('  FAIL', n); } };

const A = require('../ai/audience.js');
const S = require('../server.js');
const { app, orgMeta, orgUsers, orgNodes, issueToken, evidenceLog, inquiryStates, groupCandidates } = S;

const C = 'aud', OTHER = 'elsewhere';
const now = Date.now(), DAY = 86400000;
const SECRET = 'PRIVATE_TEXT_MUST_NEVER_APPEAR';

(async () => {

  // ── PURE LAYER ─────────────────────────────────────────────────────────────────────────────
  console.log('\n  THE REFERENCE — resolved now, never remembered');
  {
    const nodes = { mens: { nodeId: 'mens', name: "Men's Soccer", memberIds: ['p1', 'p2'], leaderIds: ['coach'] } };
    const ref = A.audienceRef({ kind: 'node_leaders', nodeId: 'mens' });
    ok('a1 · an audience stores a reference, not a list of people',
      Object.keys(ref).sort().join(',') === 'kind,nodeId' && !('userIds' in ref));
    ok('a1 · it resolves to whoever leads the node right now',
      A.resolve(ref, { nodes }).userIds.join(',') === 'coach');

    // THE STALE-PERMISSION ATTACK (adversarial 6). Change who leads, resolve the SAME stored
    // reference, and the answer must change with no rewrite and no sweep.
    nodes.mens.leaderIds = ['newcoach'];
    ok('a1 · ADVERSARIAL 6: replacing the leader changes the audience with no record rewritten',
      A.resolve(ref, { nodes }).userIds.join(',') === 'newcoach'
      && !A.includes(ref, 'coach', { nodes }));

    // A deleted node must FAIL CLOSED, never fall back to something broader.
    ok('a1 · a vanished group narrows to the author, never widens',
      A.resolve(A.audienceRef({ kind: 'node_members', nodeId: 'gone' }), { ownerId: 'p1', nodes }).userIds.join(',') === 'p1');
    ok('a1 · an unknown kind falls back to `self`, the only safe direction to guess',
      A.audienceRef({ kind: 'everyone_everywhere' }).kind === 'self');
    ok('a1 · a node-scoped audience with no node is refused as unresolvable',
      !A.isResolvable({ kind: 'node_leaders', nodeId: null }));
    ok('a1 · the author always retains their own material',
      A.includes(A.audienceRef({ kind: 'node_leaders', nodeId: 'mens' }), 'p1', { ownerId: 'p1', nodes }));
  }

  console.log('\n  THE LABEL — accurate, never comforting');
  {
    const d = A.describe(A.audienceRef({ kind: 'node_leaders', nodeId: 'mens' }), { nodeName: "Men's Soccer" });
    ok('a2 · the label names the actual group, not a category',
      d.label === "Coaching staff · Men's Soccer");
    ok('a2 · every audience can be inspected before submitting', !!d.explanation && d.explanation.length > 40);
    ok('a2 · "Only me" says plainly that even the EXISTENCE is not visible',
      /no leader can see it or see that it exists/.test(A.EXPLANATIONS.self));
    ok('a2 · nothing anywhere claims anonymity',
      !Object.values(A.LABELS).concat(Object.values(A.EXPLANATIONS)).some(t => /anonymous/i.test(t)));
    ok('a2 · the forum label distinguishes speech from evidence',
      /not evidence until you separately contribute/.test(A.EXPLANATIONS.node_forum));
  }

  // ── HTTP ───────────────────────────────────────────────────────────────────────────────────
  const mk = (id, name, role = 'member') => ({ id, name, email: `${id}@a.test`, role, orgCode: C, status: 'active', assignedNodeIds: [], leadershipNodeIds: [] });
  orgMeta[C] = { orgName: 'Audience FC', orgMode: 'sports' };
  orgMeta[OTHER] = { orgName: 'Elsewhere', orgMode: 'sports' };
  const NAMES = ['Ana', 'Bo', 'Cy', 'Dee', 'Eze', 'Fi', 'Gil', 'Hal', 'Ivy', 'Jo', 'Kit', 'Lu'];
  orgUsers[C] = { coach: mk('coach', 'Jordan', 'coach'), head: mk('head', 'Sam', 'superadmin'), outsider: mk('outsider', 'Zed') };
  NAMES.forEach((n, i) => { orgUsers[C][`m${i}`] = mk(`m${i}`, n); });
  orgUsers[OTHER] = { alien: mk('alien', 'Far') };
  orgNodes[C] = {
    mens: { nodeId: 'mens', name: "Men's Soccer", parentId: null, childNodeIds: [],
            memberIds: NAMES.map((_, i) => `m${i}`), leaderIds: ['coach'] },
  };
  orgNodes[OTHER] = {};

  // The private capture. Owner-only, never promoted, carrying a marker string we can hunt for.
  evidenceLog[C] = [{
    id: 'ev_private', orgCode: C, status: 'active', type: 'note', label: 'reflection',
    subjectId: 'm0', ownerRef: 'm0', visibility: 'private', promoted: false,
    valueText: SECRET, observedAt: new Date(now - DAY).toISOString(),
    originRef: 'origin:private', originKind: 'direct_observation',
    audience: { kind: 'self', nodeId: null },
  }, {
    id: 'ev_shared', orgCode: C, status: 'active', type: 'note', label: 'observation',
    subjectId: 'm0', ownerRef: 'm0', visibility: 'normal', promoted: true,
    valueText: 'our shape after conceding is unclear', observedAt: new Date(now - DAY).toISOString(),
    originRef: 'origin:shared', originKind: 'direct_observation',
    audience: { kind: 'node_leaders', nodeId: 'mens' },
  }];

  // A PRIVATE inquiry about m0, formed from that private interaction. This is the thing the
  // organisation must not learn the existence of.
  inquiryStates[C] = { 'member:m0': { confidence_dip: {
    inquiryId: 'inq_private_m0', subjectRef: 'member:m0',
    topic: { canonicalConcept: 'confidence_dip', label: 'PRIVATE_INQUIRY_LABEL' },
    hypotheses: [{ id: 'h', statement: SECRET, confidence: { band: 'emerging' }, status: 'active' }],
    leadingHypothesisId: 'h',
    signals: [{ ref: 'ev_private', kind: 'observation', originRef: 'origin:private', at: now }],
    missingSignals: [{ question: 'PRIVATE_QUESTION_MUST_NOT_LEAK' }],
    confidence: { band: 'emerging', score: 0.4 }, status: 'exploring',
    timeline: [], createdAt: now, lastUpdatedAt: now,
  } } };
  groupCandidates[C] = [];

  S._loadAllStores({ orgMeta: { [C]: orgMeta[C], [OTHER]: orgMeta[OTHER] }, orgUsers: { [C]: orgUsers[C], [OTHER]: orgUsers[OTHER] },
                     orgNodes: { [C]: orgNodes[C], [OTHER]: orgNodes[OTHER] }, evidenceLog: { [C]: evidenceLog[C] },
                     inquiryStates: { [C]: inquiryStates[C] } });
  S._backfillUserNodeIds(); S._rebuildEmailIndex();

  const server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = (id, org = C) => ({ Authorization: `Bearer ${issueToken(id, org, (orgUsers[org][id] || {}).role || 'member')}`, 'Content-Type': 'application/json' });
  const GET = (id, p, org = C) => fetch(base + p, { headers: H(id, org) }).then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) }));
  const POST = (id, p, b, org = C) => fetch(base + p, { method: 'POST', headers: H(id, org), body: JSON.stringify(b || {}) })
    .then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) }));

  try {
    console.log('\n  L-ID1 — a private inquiry exists, and the organisation cannot tell');
    {
      // ADVERSARIAL 1: is there ANY organisational inquiry, without a contribution?
      const grp = await GET('coach', '/api/group/mens/inquiry');
      ok('b1 · ADVERSARIAL 1: no group inquiry exists without an authorised contribution',
        grp.status === 200 && (grp.body.inquiries || []).length === 0);

      // ADVERSARIAL 2: does any leader-facing surface reveal that the private inquiry exists?
      const surfaces = await Promise.all([
        GET('coach', '/api/group/mens/state'),
        GET('coach', '/api/group/mens/inquiry'),
        GET('coach', '/api/inquiry/lead'),
        GET('coach', '/api/intelligence/briefing?refresh=1'),
        GET('coach', '/api/intelligence/roster?refresh=1'),
        POST('coach', '/api/assistant/turn', { text: 'How is the team doing?' }),
        POST('coach', '/api/assistant/turn', { text: 'How is Ana doing?' }),
      ]);
      const blob = JSON.stringify(surfaces.map(r => r.body));
      ok('b1 · ADVERSARIAL 2: no leader surface reveals the private inquiry exists',
        !blob.includes('PRIVATE_INQUIRY_LABEL') && !blob.includes('inq_private_m0'));
      // ADVERSARIAL 3: text, and the QUESTION derived from it, are both private.
      ok('b1 · ADVERSARIAL 3: no private text reaches any leader surface', !blob.includes(SECRET));
      ok('b1 · ADVERSARIAL 3: nor the open question derived from it',
        !blob.includes('PRIVATE_QUESTION_MUST_NOT_LEAK'));
      ok('b1 · ADVERSARIAL 3: nor its origin reference', !blob.includes('origin:private'));

      // The member's OWN lead inquiry may of course carry it — that is the whole point.
      const mine = await GET('m0', '/api/inquiry/lead');
      ok('b1 · …while the person themselves does see their own open question',
        mine.body.lead && mine.body.lead.source === 'self');
    }

    console.log('\n  "CAN MY COACH SEE WHAT I JUST SAID?"');
    let answer = null;
    {
      const r = await GET('m0', '/api/evidence/ev_private/audience');
      answer = r.body;
      ok('c1 · the person can ask, and gets a deterministic answer', r.status === 200);
      ok('c1 · the answer is "Only you", and says nothing was contributed',
        /^Only you\./.test(answer.statement) && /has not been contributed/.test(answer.statement));
      ok('c1 · it names what it was derived from, so it is checkable',
        (answer.derivedFrom || []).includes('current node membership'));
      ok('c1 · the safety exception is stated in advance, not only once it applies',
        !!answer.safetyException && /safeguarding lead/.test(answer.safetyException));
      ok('c1 · nobody but the coach is listed as able to see it',
        Array.isArray(answer.canSee) && answer.canSee.join(',') === 'm0');
    }
    {
      const r = await GET('m0', '/api/evidence/ev_shared/audience');
      ok('c2 · a coach-audience record says so, and names the group',
        /Coaching staff · Men's Soccer/.test(r.body.statement));
      ok('c2 · …and resolves to the current coach', r.body.canSee.join(',') === 'coach');
    }
    ok('c3 · another member cannot ask about somebody else\'s record',
      (await GET('m1', '/api/evidence/ev_private/audience')).status === 404);
    ok('c3 · a leader cannot either — position grants no view of a private record',
      (await GET('coach', '/api/evidence/ev_private/audience')).status === 404);
    ok('c3 · a record that does not exist gives the SAME answer, so existence is never confirmed',
      (await GET('m1', '/api/evidence/ev_nope/audience')).status === 404);
    ok('c3 · another organisation gets nothing',
      (await GET('alien', '/api/evidence/ev_private/audience', OTHER)).status === 404);

    console.log('\n  THE AUDIENCES A PERSON IS OFFERED, BEFORE THEY SPEAK');
    {
      const r = await GET('m0', '/api/me/audiences');
      const kinds = (r.body.audiences || []).map(a => a.kind);
      ok('d1 · every audience is named and explained before submission',
        r.status === 200 && (r.body.audiences || []).every(a => a.label && a.explanation));
      ok('d1 · the offer is built from this person\'s real groups',
        kinds.includes('self') && kinds.includes('node_leaders') && kinds.includes('node_members'));
      ok('d1 · each one says how many people it actually reaches',
        r.body.audiences.filter(a => a.kind === 'node_leaders').every(a => a.reaches === 1));
      ok('d1 · the note refuses the word "anonymous" and says what is true instead',
        /not the same as being anonymous/.test(r.body.note));
      const out = await GET('outsider', '/api/me/audiences');
      ok('d1 · someone in no group is offered only "Only me"',
        (out.body.audiences || []).length === 1 && out.body.audiences[0].kind === 'self');
    }

    console.log('\n  ADVERSARIAL 5 — the answer must change when contribution state does');
    {
      // Cross the real boundary, exactly as a person would.
      S._noteGroupCandidates(C, 'm0', 'member:m0', [{
        id: 'ev_shared', level: 'observation', text: 'shape unclear',
        sourceSpan: 'our shape after conceding is unclear', concerns: 'group',
        originRef: 'origin:shared', originKind: 'direct_observation', turnId: 't1',
      }], 'shape', 'Shape after conceding');
      const cand = (S.groupCandidates[C] || []).find(c => c.evidenceRef === 'ev_shared');
      ok('e1 · a noticing alone does not change the answer',
        /counts toward no group finding/.test((await GET('m0', '/api/evidence/ev_shared/audience')).body.statement));

      await POST('m0', '/api/group/mens/contribute', { candidateId: cand.candidateId, valence: 'worth_attention' });
      const after = await GET('m0', '/api/evidence/ev_shared/audience');
      ok('e1 · ADVERSARIAL 5: after contributing, the answer says so',
        /counts toward what the group is working out/.test(after.body.statement) && after.body.contributed === true);
      ok('e1 · …and the private record is still untouched by it',
        (await GET('m0', '/api/evidence/ev_private/audience')).body.contributed === false);
    }

    console.log('\n  ADVERSARIAL 6 — membership changes, over HTTP');
    {
      orgNodes[C].mens.leaderIds = ['head'];
      const r = await GET('m0', '/api/evidence/ev_shared/audience');
      ok('e2 · replacing the coach changes who can see it, with no record rewritten',
        r.body.canSee.join(',') === 'head' && !r.body.canSee.includes('coach'));
      orgNodes[C].mens.leaderIds = [];
      const gone = await GET('m0', '/api/evidence/ev_shared/audience');
      ok('e2 · a group with no leader reaches nobody — it fails closed, not open',
        gone.body.canSee.length === 0);
      orgNodes[C].mens.leaderIds = ['coach'];
    }

    console.log('\n  THE FLOOR — five, and it refuses rather than bends');
    {
      const T = require('../ai/team-state.js');
      ok('f1 · the floor is five', T.MIN_COHORT === 5);
      ok('f1 · 4 of 12 is refused, where it used to pass', !T.cohortFloor(4, 12).ok);
      ok('f1 · 5 of 12 clears both sides', T.cohortFloor(5, 12).ok);
      ok('f1 · 8 of 12 is refused — only four left uncounted', !T.cohortFloor(8, 12).ok);
      ok('f1 · a SIX-person group can never publish, at any k',
        [1, 2, 3, 4, 5, 6].every(k => !T.cohortFloor(k, 6).ok));
      ok('f1 · ten is the smallest group that can publish anything',
        T.cohortFloor(5, 10).ok && [1,2,3,4,5,6,7,8,9].every(k => !T.cohortFloor(k, 9).ok));
      // The refusal must EXPLAIN itself — a silent floor is indistinguishable from no finding.
      ok('f1 · and every refusal says which side failed',
        /below the floor/.test(T.cohortFloor(2, 12).reason) && /names the rest/.test(T.cohortFloor(11, 12).reason));
    }

  } catch (e) {
    fail++;
    console.log('  FAIL suite threw:', e.stack || e.message);
  } finally {
    server.close();
    console.log(`\naudience-disclosure-smoke: ${pass} passed, ${fail} failed\n`);
    process.exit(fail ? 1 : 0);
  }
})();
