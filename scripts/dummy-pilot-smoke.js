/* Adversarial dummy pilot.
   This suite grows in six pushed steps. Step 1 pins the synthetic organisation itself:
   one person may hold several classifications without becoming several people or widening
   the hierarchy. Later steps exercise the real production boundaries over this fixture. */
'use strict';

process.env.DB_OPTIONAL = '1';
process.env.IQ_DETERMINISTIC_ONLY = '1';

const diagnose = require('../ai/diagnose');
const forum = require('../ai/forum');
const teamState = require('../ai/team-state');
const contribution = require('../ai/contribution');
const S = require('../server');

let pass = 0;
let fail = 0;
const ok = (name, condition) => {
  if (condition) { pass++; console.log('  PASS', name); }
  else { fail++; console.error('  FAIL', name); }
};

function member(id, role = 'member') {
  return { id, name: id, email: `${id}@dummy.test`, role, status: 'active',
    assignedNodeIds: [], leadershipNodeIds: [] };
}

function buildOrganisation() {
  const code = 'dummy-pilot';
  const users = {
    coach: member('coach', 'coach'),
    captain: member('captain'), mid2: member('mid2'), mid3: member('mid3'),
    forward1: member('forward1'), forward2: member('forward2'), physio: member('physio'),
    otherCaptain: member('otherCaptain'),
  };
  const nodes = {
    first: { nodeId: 'first', name: 'First Team', parentId: null, childNodeIds: [],
      leaderIds: ['coach'], memberIds: ['captain', 'mid2', 'mid3', 'forward1', 'forward2', 'physio'],
      classifications: {
        captain: ['captain', 'midfielder', 'sophomore'], mid2: ['midfielder'], mid3: ['midfielder'],
        forward1: ['forward'], forward2: ['forward'], physio: ['physio'],
      } },
    second: { nodeId: 'second', name: 'Second Team', parentId: null, childNodeIds: [],
      leaderIds: [], memberIds: ['otherCaptain'], classifications: { otherCaptain: ['captain'] } },
  };
  for (const id of nodes.first.memberIds) users[id].assignedNodeIds = ['first'];
  users.coach.assignedNodeIds = ['first'];
  users.coach.leadershipNodeIds = ['first'];
  users.otherCaptain.assignedNodeIds = ['second'];
  return { code, users, nodes };
}

function buildObjects(org) {
  const now = Date.UTC(2026, 7, 1);
  const privateInquiry = diagnose.newInquiry({
    subjectRef: 'member:captain', topic: 'personal_load', label: 'Personal load', now,
  });
  privateInquiry.inquiryId = 'inq_private_captain';
  privateInquiry.signals.push({ id: 'private_inquiry_signal', kind: 'observation', status: 'active',
    visibility: 'private', originRef: 'captain_private_inquiry', sourceSpan: 'PRIVATE_INQUIRY_SENTENCE' });
  const sharedInquiry = diagnose.newInquiry({
    subjectRef: 'group:first', topic: 'role_clarity', label: 'Role clarity', now,
  });
  sharedInquiry.inquiryId = 'inq_shared_role_clarity';

  const personalFocus = {
    focusId: 'focus_personal', text: 'Prepare calmly for the next session', status: 'active',
    visibility: 'private', ownerId: 'captain', participants: ['captain'], createdAt: now + 1,
  };
  const sharedFocus = teamState.newFocus({
    focusId: 'focus_shared', nodeId: 'first', text: 'Clarify roles before the next session',
    by: 'coach', now, inquiry: sharedInquiry,
  });

  // These are inquiry-shaped findings before projection. The real team surface later decides
  // whether either may be disclosed; the six-person fixture deliberately cannot clear a
  // five-person two-sided floor.
  const groupHigh = { inquiryId: 'inq_high', subjectRef: 'group:first', kind: 'high',
    topic: { canonicalConcept: 'peer_support', label: 'Peer support' }, hypothesis: 'Peer support is holding',
    confidence: { band: 'supported' }, independentOrigins: 5, contributors: 5, status: 'open', signals: [] };
  const groupLow = { inquiryId: 'inq_low', subjectRef: 'group:first', kind: 'low',
    topic: { canonicalConcept: 'role_clarity', label: 'Role clarity' }, hypothesis: 'Role clarity needs attention',
    confidence: { band: 'supported' }, independentOrigins: 5, contributors: 5, status: 'open', signals: [] };

  const forumThread = forum.newThread({
    inquiryId: sharedInquiry.inquiryId, nodeId: 'first', subjectRef: 'group:first', now,
  });
  forumThread.messages.push(forum.newMessage({
    id: 'forum_seed', authorId: 'captain', text: 'The roles felt unclear in the last session.', now,
  }));

  const evidence = {
    publicAccount: { id: 'ev_public', visibility: 'normal', subjectRef: 'member:captain',
      concept: 'role_clarity', originRef: 'captain_direct', text: 'Public account', status: 'active' },
    privateAccount: { id: 'ev_private', visibility: 'private', ownerRef: 'member:captain',
      subjectRef: 'member:captain', concept: 'role_clarity', originRef: 'captain_private', text: 'PRIVATE_SENTENCE', status: 'active' },
    corrected: { id: 'ev_corrected', visibility: 'normal', subjectRef: 'member:captain',
      concept: 'role_clarity', originRef: 'captain_direct', corrects: 'ev_public', status: 'active' },
    echoes: Array.from({ length: 5 }, (_, i) => ({ id: `ev_echo_${i}`, concept: 'role_clarity',
      contributorId: i ? `echo_${i}` : 'captain', originRef: 'captain_direct', status: 'contributed' })),
  };
  return { privateInquiry, sharedInquiry, personalFocus, sharedFocus, groupHigh, groupLow, forumThread, evidence };
}

async function main() {
  const fixture = buildOrganisation();
  fixture.objects = buildObjects(fixture);
  const first = fixture.nodes.first;
  ok('DP-0 builds one eight-person organisation with one triple-classified captain and separate shared label',
    Object.keys(fixture.users).length === 8
    && first.memberIds.length === 6
    && first.classifications.captain.length === 3
    && first.memberIds.filter(id => id === 'captain').length === 1
    && fixture.nodes.second.classifications.otherCaptain.includes('captain')
    && !first.memberIds.includes('otherCaptain'));
  ok('DP-00 builds every required private, shared, corrected, conflicting, and echoed pilot object',
    fixture.objects.privateInquiry.subjectRef === 'member:captain'
    && fixture.objects.sharedInquiry.subjectRef === 'group:first'
    && fixture.objects.personalFocus.visibility === 'private'
    && fixture.objects.sharedFocus.origin.inquiryId === fixture.objects.sharedInquiry.inquiryId
    && fixture.objects.groupHigh.kind === 'high' && fixture.objects.groupLow.kind === 'low'
    && fixture.objects.forumThread.messages.length === 1
    && fixture.objects.evidence.privateAccount.visibility === 'private'
    && fixture.objects.evidence.corrected.corrects === fixture.objects.evidence.publicAccount.id
    && fixture.objects.evidence.echoes.every(e => e.originRef === 'captain_direct'));

  const code = fixture.code;
  const relationshipInquiry = diagnose.newInquiry({
    subjectRef: 'relationship-claim:captain~mid2#communication', topic: 'communication',
    label: 'Communication relationship', now: Date.UTC(2026, 7, 2),
  });
  relationshipInquiry.inquiryId = 'inq_relationship_private';
  relationshipInquiry.signals.push({ id: 'rel_private_signal', kind: 'observation', status: 'active',
    visibility: 'private', sourceSpan: 'RELATIONSHIP_PRIVATE_SENTENCE', originRef: 'captain_private' });
  S._loadAllStores({
    orgMeta: { [code]: { orgName: 'Dummy Pilot', orgMode: 'sports' } },
    orgUsers: { [code]: fixture.users }, orgNodes: { [code]: fixture.nodes },
    inquiryStates: { [code]: {
      'member:captain': { personal_load: fixture.objects.privateInquiry },
      'group:first': { role_clarity: fixture.objects.sharedInquiry },
      'relationship-claim:captain~mid2#communication': { communication: relationshipInquiry },
    } },
    forumThreads: { [code]: { [fixture.objects.sharedInquiry.inquiryId]: fixture.objects.forumThread } },
    teamFocuses: { [code]: { first: [fixture.objects.sharedFocus] } },
    userAiProfiles: { [`${code}:captain`]: { focuses: [fixture.objects.personalFocus] } },
  });
  const server = S.app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = id => ({ Authorization: `Bearer ${S.issueToken(id, code, fixture.users[id].role)}`,
    'Content-Type': 'application/json' });
  const call = async (id, path, method = 'GET', body) => {
    const response = await fetch(base + path, { method, headers: headers(id),
      body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  };
  const inquiryId = fixture.objects.sharedInquiry.inquiryId;
  const forumPath = `/api/group/first/forum/${inquiryId}`;

  // ATTACK 1: speech remains epistemically inert, even at volume from one author.
  const beforeSignals = fixture.objects.sharedInquiry.signals.length;
  const postResponses = [];
  for (let i = 0; i < 5; i++) postResponses.push(await call('captain', forumPath, 'POST', { text: `Repeated view ${i}` }));
  ok('DP-1 one user posting five times cannot manufacture anonymous consensus',
    postResponses.every(r => r.status === 200 && r.body.epistemicEffect === 'none')
    && fixture.objects.sharedInquiry.signals.length === beforeSignals);

  // ATTACK 2: once deliberately contributed, declared echoes preserve the prime origin.
  const threadAfterPosts = await call('captain', forumPath);
  const ids = threadAfterPosts.body.messages.slice(-5).map(m => m.messageId);
  const original = await call('captain', `${forumPath}/${ids[0]}/contribute`, 'POST', {});
  const mid2Post = await call('mid2', forumPath, 'POST', { text: 'I heard the same account.' });
  const mid3Post = await call('mid3', forumPath, 'POST', { text: 'That is what I was told too.' });
  const echoA = await call('mid2', `${forumPath}/${mid2Post.body.messageId}/contribute`, 'POST', { echoes: ids[0] });
  const echoB = await call('mid3', `${forumPath}/${mid3Post.body.messageId}/contribute`, 'POST', { echoes: ids[0] });
  ok('DP-2 forum echoes preserve one origin and trigger the ECHO verdict',
    original.status === 200 && echoA.body.origin === 'reported' && echoB.body.origin === 'reported'
    && echoB.body.decision?.rule === 'ECHO' && echoB.body.decision?.independentOrigins === 1);

  // ATTACKS 3-4: inspect complete JSON, not a hand-picked identity field.
  const forumResponses = [];
  for (const id of ['captain', 'mid2', 'mid3', 'coach']) forumResponses.push(await call(id, forumPath));
  const payload = JSON.stringify(forumResponses);
  ok('DP-3 anonymous authorship is absent from every complete Forum API payload',
    forumResponses.every(r => r.status === 200)
    && !payload.includes('"authorId":"captain"') && !payload.includes('captain@dummy.test'));
  const coachPayload = JSON.stringify(forumResponses[3].body);
  ok('DP-4 a leader cannot infer an author from a Forum summary or citation',
    !coachPayload.includes('captain') && !coachPayload.includes('citation') && !coachPayload.includes('summary'));

  // ATTACK 5: classifications are labels only and never enter vertical scope.
  const savedClasses = first.classifications;
  first.classifications = {};
  const beforeClassification = JSON.stringify(S.getVisibleUserIds(code, 'captain').sort());
  S._setClassifications(code, 'first', 'captain', ['captain', 'midfielder', 'sophomore']);
  S._setClassifications(code, 'second', 'otherCaptain', ['captain']);
  const afterClassification = JSON.stringify(S.getVisibleUserIds(code, 'captain').sort());
  ok('DP-5 classification membership widens no person visibility',
    beforeClassification === afterClassification && !JSON.parse(afterClassification).includes('otherCaptain'));
  first.classifications = savedClasses;

  // ATTACK 6: one person projected through three cohort labels is still one voice and one origin.
  const triple = ['captain', 'midfielder', 'sophomore'].map(tag => ({ status: 'contributed',
    contributorId: 'captain', originRef: 'captain_direct', evidenceRef: `class_${tag}` }));
  const tripleDecision = contribution.shouldOpenGroupInquiry(triple);
  ok('DP-6 the triple-classified captain counts as one contributor and one origin',
    tripleDecision.open === false && tripleDecision.contributors === 1 && tripleDecision.independentOrigins === 1);

  // ATTACK 7: a shared Focus projection never joins the participants' private state.
  const groupState = await call('captain', '/api/group/first/state');
  ok('DP-7 a shared Focus exposes no unrelated private participant data',
    groupState.status === 200 && groupState.body.focus?.focusId === 'focus_shared'
    && !JSON.stringify(groupState.body).includes('focus_personal')
    && !JSON.stringify(groupState.body).includes('Prepare calmly'));

  // ATTACK 8: the personal Inquiry route is bound to the authenticated person, not participants.
  const otherInquiry = await call('mid2', '/api/inquiry?subjectId=captain');
  ok('DP-8 a participant cannot reach another person private Inquiry',
    otherInquiry.status === 200 && !JSON.stringify(otherInquiry.body).includes('inq_private_captain'));

  // ATTACK 9: neither endpoint of a relationship may turn the self route into a private-evidence join.
  const relationReads = await Promise.all(['captain', 'mid2'].map(id => call(id, '/api/inquiry')));
  ok('DP-9 a relationship Inquiry leaks no private evidence between its endpoints',
    relationReads.every(r => r.status === 200
      && !JSON.stringify(r.body).includes('RELATIONSHIP_PRIVATE_SENTENCE')
      && !JSON.stringify(r.body).includes('inq_relationship_private')));

  await new Promise(resolve => server.close(resolve));
  console.log(`\ndummy-pilot-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch(error => { console.error(error); process.exit(1); });
