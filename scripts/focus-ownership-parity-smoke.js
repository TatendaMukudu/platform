/* Truth layer: one canonical owner per personal-Focus law. */
'use strict';
process.env.DB_OPTIONAL = '1'; process.env.NODE_ENV = 'test';
const fs = require('fs');
const path = require('path');
const diagnose = require('../ai/diagnose');
const teamState = require('../ai/team-state');
const S = require('../server');
let pass = 0, fail = 0;
const ok = (name, value) => value ? (pass++, console.log('  PASS', name)) : (fail++, console.error('  FAIL', name));

const store = { orgMeta: {}, orgUsers: {}, orgNodes: {}, userAiProfiles: {}, actionsLog: {}, auditLog: {}, noticeFeedback: {} };
for (const code of ['focus-direct', 'focus-composer', 'focus-group-direct', 'focus-group-composer']) {
  store.orgMeta[code] = { orgName: code };
  store.orgUsers[code] = {
    owner: { id: 'owner', name: 'Owner', email: `owner@${code}.test`, role: 'member', orgCode: code, status: 'active', assignedNodeIds: ['g'] },
    peer: { id: 'peer', name: 'Peer', email: `peer@${code}.test`, role: 'member', orgCode: code, status: 'active', assignedNodeIds: ['g'] },
    outsider: { id: 'outsider', name: 'Outsider', email: `outsider@${code}.test`, role: 'member', orgCode: code, status: 'active', assignedNodeIds: ['h'] },
  };
  store.orgNodes[code] = {
    g: { nodeId: 'g', name: 'First Group', memberIds: ['owner', 'peer'], leaderIds: [] },
    h: { nodeId: 'h', name: 'Other Group', memberIds: ['peer'], leaderIds: [] },
    z: { nodeId: 'z', name: 'Outside Group', memberIds: ['outsider'], leaderIds: [] },
  };
  store.userAiProfiles[`${code}:owner`] = { focuses: [], model: null, lastUpdated: null };
}
S._loadAllStores(store); S._rebuildEmailIndex(); S._backfillUserNodeIds();
const server = S.app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
const token = code => S.issueToken('owner', code, 'member');
const post = async (code, route, body) => {
  const r = await fetch(base + route, { method: 'POST', headers: { authorization: `Bearer ${token(code)}`, 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
  return { status: r.status, json: await r.json() };
};
const propose = (code, type, text, about, args, conversationId) => post(code, '/api/assistant/turn', {
  text, about, surface: about?.kind || 'home', conversationId, requestedAction: { type, arguments: args || {} },
});
const confirm = async (code, turn, type) => {
  const p = turn.json.response.proposedActions.find(x => x.actionType === type);
  return post(code, `/api/assistant/turn/${turn.json.turnId}/confirm`, { proposalId: p && p.id });
};
const focusState = (code, id) => S._getMemory(code, 'owner').focuses.find(f => f.id === id);
const comparable = f => ({ text: f.text, type: f.type, status: f.status, outcome: f.outcome,
  visibility: f.visibility, participants: f.participants, target: f.target || null, reviewAt: f.reviewAt || null,
  hasSource: !!f.source, sourceMessages: f.source?.messageIds || [], hasCreatedAt: Number.isFinite(Date.parse(f.createdAt)) });
const sideEffects = (code, focus) => ({
  lastUpdated: Number.isFinite(Date.parse(S._getMemory(code, 'owner').lastUpdated)),
  action: (S.actionsLog[code] || []).some(a => a.focusRef === focus.id && a.stage === (focus.status === 'done' ? 'learn' : 'observe')),
  audit: (S.auditLog[code] || []).filter(a => (a.subjectIds || []).includes('owner')).map(a => a.action).filter(a => a.startsWith('focus_')).sort(),
  feedback: S.noticeFeedback[code]?.[focus.type] || null,
});

(async () => {
  try {
    const directConversation = await post('focus-direct', '/api/assistant/turn', { text: 'Start context.' });
    const direct = await post('focus-direct', '/api/me/focus', { text: 'Defend with clearer communication', target: 'Clear calls', reviewOn: '2026-10-01', sourceConversationId: directConversation.json.conversationId });
    const composerConversation = await post('focus-composer', '/api/assistant/turn', { text: 'Start context.' });
    const createTurn = await propose('focus-composer', 'create_focus', 'Make Defend with clearer communication my focus with target Clear calls and review 2026-10-01.', null,
      { text: 'Defend with clearer communication', target: 'Clear calls', reviewOn: '2026-10-01' }, composerConversation.json.conversationId);
    const unchangedBeforeConfirm = S._getMemory('focus-composer', 'owner').focuses.length === 0;
    const composer = await confirm('focus-composer', createTurn, 'create_focus');
    const df = focusState('focus-direct', direct.json.focus.id), cf = focusState('focus-composer', composer.json.focus.id);
    ok('FP1 direct create and composer create produce the same governed Focus shape', direct.json.ok && composer.json.ok && JSON.stringify(comparable(df)) === JSON.stringify(comparable(cf)));
    const directCreateEffects = sideEffects('focus-direct', df), composerCreateEffects = sideEffects('focus-composer', cf);
    ok('FP2 both create transports apply lifecycle, lastUpdated and audit side effects', JSON.stringify(directCreateEffects) === JSON.stringify(composerCreateEffects)
      && directCreateEffects.lastUpdated && directCreateEffects.action);
    ok('FP3 both sources are validated references rather than copied conversation text', df.source?.conversationId === directConversation.json.conversationId && cf.source?.conversationId === composerConversation.json.conversationId && !JSON.stringify(df.source).includes('Start context'));

    const directRetry = await post('focus-direct', '/api/me/focus', { text: df.text, sourceConversationId: directConversation.json.conversationId });
    const retryTurn = await propose('focus-composer', 'create_focus', `Make ${cf.text} my focus.`, null, { text: cf.text });
    const composerRetry = await confirm('focus-composer', retryTurn, 'create_focus');
    ok('FP4 idempotency is identical across direct and composer create', directRetry.json.already === true && composerRetry.json.focus.id === cf.id
      && S._getMemory('focus-direct', 'owner').focuses.length === 1 && S._getMemory('focus-composer', 'owner').focuses.length === 1);

    S._getMemory('focus-direct', 'owner').lastUpdated = '2000-01-01T00:00:00.000Z';
    S._getMemory('focus-composer', 'owner').lastUpdated = '2000-01-01T00:00:00.000Z';
    const directBeforeUpdate = S._getMemory('focus-direct', 'owner').lastUpdated;
    const composerBeforeUpdate = S._getMemory('focus-composer', 'owner').lastUpdated;
    const directUpdate = await post('focus-direct', `/api/me/focus/${df.id}/visibility`, { visibility: 'shared' });
    const updateTurn = await propose('focus-composer', 'update_focus', 'Make this shared.', { kind: 'focus', id: cf.id }, { visibility: 'shared' });
    const composerUpdate = await confirm('focus-composer', updateTurn, 'update_focus');
    ok('FP5 direct visibility update and composer update use the same audience/state law', directUpdate.json.visibility === 'shared' && composerUpdate.json.focus.visibility === 'shared'
      && JSON.stringify(comparable(df)) === JSON.stringify(comparable(cf)));
    const directUpdateEffects = sideEffects('focus-direct', df), composerUpdateEffects = sideEffects('focus-composer', cf);
    ok('FP6 both update transports set equivalent timestamps, lastUpdated and audit hooks', Number.isFinite(Date.parse(df.updatedAt)) && Number.isFinite(Date.parse(cf.updatedAt))
      && JSON.stringify(directUpdateEffects) === JSON.stringify(composerUpdateEffects));
    ok('FP6a direct update advances memory lastUpdated itself', S._getMemory('focus-direct', 'owner').lastUpdated !== directBeforeUpdate);
    ok('FP6b composer update advances memory lastUpdated itself', S._getMemory('focus-composer', 'owner').lastUpdated !== composerBeforeUpdate);

    S._getMemory('focus-direct', 'owner').lastUpdated = '2001-01-01T00:00:00.000Z';
    S._getMemory('focus-composer', 'owner').lastUpdated = '2001-01-01T00:00:00.000Z';
    const directBeforeOutcome = S._getMemory('focus-direct', 'owner').lastUpdated;
    const composerBeforeOutcome = S._getMemory('focus-composer', 'owner').lastUpdated;
    const directOutcome = await post('focus-direct', '/api/me/focus/outcome', { focusId: df.id, outcome: 'helped' });
    const outcomeTurn = await propose('focus-composer', 'record_focus_outcome', 'It helped.', { kind: 'focus', id: cf.id }, { outcome: 'helped' });
    const composerOutcome = await confirm('focus-composer', outcomeTurn, 'record_focus_outcome');
    ok('FP7 direct and composer outcome produce the same closed Focus state', directOutcome.json.ok && composerOutcome.json.outcome === 'helped' && JSON.stringify(comparable(df)) === JSON.stringify(comparable(cf)));
    const directOutcomeEffects = sideEffects('focus-direct', df), composerOutcomeEffects = sideEffects('focus-composer', cf);
    ok('FP8 outcome parity includes learn lifecycle, notice feedback, lastUpdated and audit', JSON.stringify(directOutcomeEffects) === JSON.stringify(composerOutcomeEffects)
      && directOutcomeEffects.feedback?.useful === 1 && directOutcomeEffects.action && directOutcomeEffects.lastUpdated);
    ok('FP8a direct outcome advances memory lastUpdated itself', S._getMemory('focus-direct', 'owner').lastUpdated !== directBeforeOutcome);
    ok('FP8b composer outcome advances memory lastUpdated itself', S._getMemory('focus-composer', 'owner').lastUpdated !== composerBeforeOutcome);

    const gd = await post('focus-group-direct', '/api/me/focus', { text: 'Discuss our rest defence', participants: ['peer'] });
    const seedConversation = await post('focus-group-composer', '/api/assistant/turn', { text: 'Discuss our rest defence' });
    const groupTurn = await propose('focus-group-composer', 'discuss_with_group', 'Discuss this with First Group.', null,
      { text: 'Discuss our rest defence', groupId: 'g' }, seedConversation.json.conversationId);
    const gc = await confirm('focus-group-composer', groupTurn, 'discuss_with_group');
    const gdf = focusState('focus-group-direct', gd.json.focus.id), gcf = focusState('focus-group-composer', gc.json.focus.id);
    ok('FP9 explicit participants and composer group sharing resolve the same audience', gdf.visibility === 'invited' && gcf.visibility === 'invited'
      && JSON.stringify(gdf.participants) === JSON.stringify(gcf.participants));
    ok('FP10 group-created Focus uses the same lifecycle owner and side effects', sideEffects('focus-group-direct', gdf).action && sideEffects('focus-group-composer', gcf).action
      && sideEffects('focus-group-direct', gdf).lastUpdated && sideEffects('focus-group-composer', gcf).lastUpdated);

    const beforeForbidden = S._getMemory('focus-group-composer', 'owner').focuses.length;
    const forbidden = S._resolvePersonalFocusAudience('focus-group-composer', 'owner', { groupId: 'h' }, { strict: true });
    const forbiddenCreate = S._createPersonalFocus('focus-group-composer', 'owner', { text: 'Must not exist', groupId: 'h' }, { strictAudience: true });
    ok('FP10a an actor outside a requested group is refused without creating a Focus', !forbidden.ok && forbidden.status === 403
      && !forbiddenCreate.ok && S._getMemory('focus-group-composer', 'owner').focuses.length === beforeForbidden);
    const beforeStrict = comparable(gcf);
    const strictNonContact = S._resolvePersonalFocusAudience('focus-group-composer', 'owner', { participantIds: ['outsider'] }, { strict: true });
    const strictUpdate = S._updatePersonalFocus('focus-group-composer', 'owner', gcf.id, { participantIds: ['outsider'] }, { strictAudience: true });
    ok('FP10b a strict non-contact audience is refused without expanding Focus visibility', !strictNonContact.ok && strictNonContact.status === 403
      && !strictUpdate.ok && JSON.stringify(comparable(gcf)) === JSON.stringify(beforeStrict));

    const serverSource = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    const directCreateBody = serverSource.slice(serverSource.indexOf("app.post('/api/me/focus'"), serverSource.indexOf("/* GET /api/me/focus/:id/source"));
    const confirmBody = serverSource.slice(serverSource.indexOf("app.post('/api/assistant/turn/:turnId/confirm'"), serverSource.indexOf("if (prop.actionType === 'share_with_professional')"));
    ok('FP11 direct and composer transports call the shared Focus owner rather than mutating mem.focuses', /_createPersonalFocus\(/.test(directCreateBody) && /_createPersonalFocus\(/.test(confirmBody)
      && !/focuses\.unshift|focus\.status\s*=/.test(directCreateBody + confirmBody));
    ok('FP12 direct controls are allowed while model-interpreted changes remain proposal-confirmed', /explicit\s+direct control may call a canonical domain capability directly/.test(fs.readFileSync(path.join(__dirname, '../ASSISTANT_RUNTIME.md'), 'utf8'))
      && direct.json.ok && unchangedBeforeConfirm && createTurn.json.response.proposedActions.some(p => p.actionType === 'create_focus'));

    const signals = [
      { ref: 'old', originRef: 'origin-a', at: 1, status: 'superseded', supersededBy: 'new' },
      { ref: 'new', originRef: 'origin-a', at: 2, status: 'active' },
      { ref: 'repeat', originRef: 'origin-a', at: 3, status: 'active' },
      { ref: 'missing', at: 4, status: 'active' },
      { ref: 'conflict', originRef: 'origin-b', at: 5, status: 'active', dissents: true },
    ];
    ok('OP1 canonical current-origin law collapses repetition, excludes missing refs and preserves current conflict', diagnose.currentOriginCount(signals) === 2
      && diagnose.currentOriginCount(signals, { includeDissent: false }) === 1);
    ok('OP2 High/Low projection uses the same current-origin identity', teamState.originsOf({ signals }) === diagnose.currentOriginCount(signals));
    const graph = S._chartFor('focus-direct', 'owner', { kind: 'inquiry', id: 'origin-parity', raw: { signals }, present: { summary: { title: 'Origin parity' } } }, 'firming');
    const graphCount = graph.spec.series.find(x => x.key === 'origins').points.at(-1).value;
    ok('OP3 chart support count agrees with the canonical non-dissent current-origin set', graphCount === diagnose.currentOriginCount(signals, { includeDissent: false }));
    const unknownOrigins = [
      { ref: 'unique-a', at: 10, status: 'active', direction: 'improvement' },
      { ref: 'unique-b', at: 11, status: 'active', direction: 'improvement' },
    ];
    const unknownValence = teamState.evidenceValence({ signals: unknownOrigins, confidence: { band: 'supported' } });
    ok('OP4 unique signal refs without established origins provide no corroboration or High/Low filing', diagnose.currentOriginCount(unknownOrigins) === 0
      && !unknownValence.ok && unknownValence.polarity === teamState.POLARITY.NEUTRAL);
    const statusLaw = [
      { ref: 'active', originRef: 'active-origin', at: 20, status: 'active' },
      { ref: 'legacy', originRef: 'legacy-origin', at: 21 },
      { ref: 'superseded', originRef: 'old-origin', at: 22, status: 'superseded' },
      { ref: 'withdrawn', originRef: 'gone-origin', at: 23, status: 'withdrawn' },
    ];
    ok('OP5 only explicitly active signals contribute to current independent-origin state', diagnose.currentOriginCount(statusLaw) === 1
      && diagnose.currentOriginRefs(statusLaw)[0] === 'active-origin');
  } catch (e) { fail++; console.error('  FAIL ownership parity threw', e && e.stack); }
  server.close();
  console.log(`\nfocus-ownership-parity-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
