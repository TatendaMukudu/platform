/* Adversarial dummy pilot.
   This suite grows in six pushed steps. Step 1 pins the synthetic organisation itself:
   one person may hold several classifications without becoming several people or widening
   the hierarchy. Later steps exercise the real production boundaries over this fixture. */
'use strict';

process.env.DB_OPTIONAL = '1';
process.env.IQ_DETERMINISTIC_ONLY = '1';

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

const fixture = buildOrganisation();
const first = fixture.nodes.first;
ok('DP-0 builds one eight-person organisation with one triple-classified captain and separate shared label',
  Object.keys(fixture.users).length === 8
  && first.memberIds.length === 6
  && first.classifications.captain.length === 3
  && first.memberIds.filter(id => id === 'captain').length === 1
  && fixture.nodes.second.classifications.otherCaptain.includes('captain')
  && !first.memberIds.includes('otherCaptain'));

console.log(`\ndummy-pilot-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

