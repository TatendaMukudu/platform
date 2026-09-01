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
  const sharedInquiry = diagnose.newInquiry({
    subjectRef: 'group:first', topic: 'role_clarity', label: 'Role clarity', now,
  });
  sharedInquiry.inquiryId = 'inq_shared_role_clarity';

  const personalFocus = {
    focusId: 'focus_personal', text: 'Prepare calmly for the next session', status: 'active',
    visibility: 'private', ownerId: 'captain', participants: ['captain'], createdAt: now,
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

console.log(`\ndummy-pilot-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
