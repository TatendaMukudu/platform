#!/usr/bin/env node
'use strict';

const feed = require('../ai/intelligence-feed');
const scoped = require('../ai/scoped-intelligence-packet');

let pass = 0, fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log('PASS', name); }
  else { fail++; console.error('FAIL', name); }
};

const nodes = [
  { nodeId: 'root', parentId: null, leaderIds: ['ceo'], memberIds: [] },
  { nodeId: 'teamA', parentId: 'root', leaderIds: ['coachA'], memberIds: ['u1'] },
  { nodeId: 'teamB', parentId: 'root', leaderIds: ['coachB'], memberIds: ['u2'] },
];

const items = [
  feed.normalizeArtifact({
    id: 'focus:communication', level: 'person', subjectId: 'u1', scope: 'teamA',
    priority: 'low', confidence: 'emerging', title: 'Communication focus',
    body: 'This is currently a low-attention focus.', conceptRefs: ['communication_under_pressure'],
    objectRefs: ['focus:communication'], evidenceRefs: ['ev:focus'],
  }, { source: 'extra' }),
  feed.normalizeArtifact({
    id: 'inquiry:communication', level: 'person', subjectId: 'u1', scope: 'teamA',
    priority: 'high', confidence: 'clear', title: 'Related inquiry',
    body: 'This related inquiry already deserves high attention.', conceptRefs: ['communication_under_pressure'],
    objectRefs: ['inquiry:communication'], evidenceRefs: ['ev:inq'],
  }, { source: 'extra' }),
  feed.normalizeArtifact({
    id: 'hidden:sibling', level: 'team', scope: 'teamB',
    priority: 'urgent', confidence: 'clear', title: 'Sibling branch item',
    body: 'This belongs to another branch.', conceptRefs: ['communication_under_pressure'],
    evidenceRefs: ['ev:hidden'],
  }, { source: 'extra' }),
];

const packet = scoped.buildPacket({ actor: { userId: 'u1' }, nodes, feed: items, currentItemId: 'focus:communication' });
const rel = packet.relatedItems.find(x => x.relatedItemIds && x.relatedItemIds.includes('focus:communication'));

ok('authorised related evidence is proactively surfaced', !!rel);
ok('low current item inherits existing high attention from authorised related item', rel && rel.priority === 'high');
ok('relationship changes attention but not confidence', rel && rel.confidence === 'none');
ok('hidden sibling urgent item cannot escalate the relationship', rel && rel.priority !== 'urgent');
ok('hidden sibling item is absent from related ids', rel && !rel.relatedItemIds.includes('hidden:sibling'));
ok('hidden sibling evidence ref is absent from relationship', rel && !(rel.evidenceRefs || []).includes('ev:hidden'));
ok('relationship is available to the same priority queue', packet.queue.some(x => x.id === rel.id));

const onlyLow = [
  feed.normalizeArtifact({ id: 'a', scope: 'teamA', priority: 'low', title: 'A', body: 'A', conceptRefs: ['x'] }, { source: 'extra' }),
  feed.normalizeArtifact({ id: 'b', scope: 'teamA', priority: 'low', title: 'B', body: 'B', conceptRefs: ['x'] }, { source: 'extra' }),
];
const lowPacket = scoped.buildPacket({ actor: { userId: 'u1' }, nodes, feed: onlyLow, currentItemId: 'a' });
ok('two low related items do not manufacture high attention', lowPacket.relatedItems.length === 1 && lowPacket.relatedItems[0].priority === 'low');

const textOnly = [
  feed.normalizeArtifact({ id: 't1', scope: 'teamA', priority: 'high', title: 'same phrase', body: 'same phrase' }, { source: 'extra' }),
  feed.normalizeArtifact({ id: 't2', scope: 'teamA', priority: 'low', title: 'same phrase', body: 'same phrase' }, { source: 'extra' }),
];
const textPacket = scoped.buildPacket({ actor: { userId: 'u1' }, nodes, feed: textOnly, currentItemId: 't2' });
ok('matching prose alone cannot create a cross-evidence relationship', textPacket.relatedItems.length === 0);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
