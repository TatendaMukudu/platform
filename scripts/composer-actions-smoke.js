/* Truth layer: the composer is the control surface; screens are views. */
'use strict';
process.env.DB_OPTIONAL = '1'; process.env.NODE_ENV = 'test';

const actions = require('../ai/composer-actions');
const { buildAlmaStore, ALMA_CODE } = require('./seed-alma');
const S = require('../server');

let pass = 0, fail = 0;
const ok = (name, value) => value ? (pass++, console.log('  PASS', name)) : (fail++, console.error('  FAIL', name));

(async () => {
  const simulatedModel = actions.normalize({ actions: [{ type: 'discuss_with_group', arguments: {}, reason: 'the person rejected private handling' }] },
    { object: null, groups: [{ id: 'team', name: 'Team' }] });
  ok('CA1 semantic model output becomes a typed action without a phrase-specific intent regex', simulatedModel.actions[0]?.type === 'discuss_with_group');
  ok('CA2 a model cannot propose an action unavailable in the current context',
    actions.normalize({ actions: [{ type: 'settle_inquiry' }] }, { object: { kind: 'focus', id: 'f1' } }).actions.length === 0);
  ok('CA3 the model-facing prompt forbids inventing audience, dates, targets and outcomes', /Do not infer missing dates, targets, audiences, folder names or outcomes/.test(actions.prompt({ text: 'do it' })));
  const hostile = actions.ground(actions.normalize({ actions: [{ type: 'create_focus', arguments: {
    text: 'A model rewrite', target: 'Invented target', reviewOn: '2030-01-02', visibility: 'shared', participantIds: ['hidden'] } }] },
    { object: null }), { text: 'Make that my focus', priorMessages: [{ role: 'user', text: 'Improve communication when we defend.' }], context: { object: null } });
  ok('CA3b consequential model fields are stripped unless grounded, while suggested wording is labelled',
    hostile.actions[0]?.arguments.target == null && hostile.actions[0]?.arguments.reviewOn == null &&
    hostile.actions[0]?.arguments.visibility == null && hostile.actions[0]?.arguments.participantIds == null &&
    hostile.actions[0]?.argumentSources.text === 'model_suggested');

  const { store } = await buildAlmaStore();
  S._loadAllStores(store); S._rebuildEmailIndex(); S._backfillUserNodeIds();
  const users = S.orgUsers[ALMA_CODE];
  const member = Object.values(users).find(u => u.role === 'member' && S.inquiryStates[ALMA_CODE]?.[`member:${u.id}`]);
  const inquiry = Object.values(S.inquiryStates[ALMA_CODE][`member:${member.id}`])[0];
  const token = S.issueToken(member.id, ALMA_CODE, member.role);
  const server = S.app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const callAs = async (authToken, path, body, method = 'POST') => {
    const r = await fetch(base + path, { method, headers: { authorization: `Bearer ${authToken}`, 'content-type': 'application/json' }, body: method === 'GET' ? undefined : JSON.stringify(body || {}) });
    return { status: r.status, json: await r.json() };
  };
  const call = (path, body, method) => callAs(token, path, body, method);
  const turn = async (type, text, about, args = {}) => call('/api/assistant/turn', { text, about, surface: about?.kind || 'home', requestedAction: { type, arguments: args } });
  const confirm = async (t, type, overrides = {}) => {
    const p = t.json.response.proposedActions.find(x => x.actionType === type);
    return call(`/api/assistant/turn/${t.json.turnId}/confirm`, { proposalId: p && p.id, overrides });
  };

  try {
    const about = { kind: 'inquiry', id: inquiry.inquiryId };
    const keepTurn = await turn('keep_in_library', 'Keep this in my Library.', about);
    ok('CA4 an explicit button shortcut enters the assistant as a typed proposal', keepTurn.json.response.proposedActions.some(p => p.actionType === 'keep_in_library'));
    ok('CA5 proposing Keep changes no shelf state', (S.shelfFilings[ALMA_CODE] || []).length === 0);
    const kept = await confirm(keepTurn, 'keep_in_library');
    ok('CA6 confirming Keep files the live inquiry reference', kept.json.ok && kept.json.filed.kind === 'inquiry' && kept.json.filed.refId === inquiry.inquiryId);
    const shelfRead = await fetch(base + '/api/library/shelf', { headers: { authorization: `Bearer ${token}` } }).then(r => r.json());
    ok('CA7 the Library read resolves that reference live', shelfRead.items.some(i => i.kind === 'inquiry' && i.refId === inquiry.inquiryId));

    const otherOwnInquiry = S._inquiryFor(ALMA_CODE, `member:${member.id}`, 'composer_context_guard',
      'Composer context guard', '', Date.now());
    const rebound = await call('/api/assistant/turn', { text: 'Keep this one.', conversationId: keepTurn.json.conversationId,
      about: { kind: 'inquiry', id: otherOwnInquiry.inquiryId }, requestedAction: { type: 'keep_in_library', arguments: {} } });
    ok('CA7b an established conversation cannot be retargeted by accessible page context',
      rebound.json.response.proposedActions.every(p => p.actionType !== 'keep_in_library') && /different object/.test(rebound.json.response.responseText));

    const folderTurn = await turn('create_library_folder', 'Create a folder called Set Pieces.', null, { folderName: 'Set Pieces' });
    const folder = await confirm(folderTurn, 'create_library_folder');
    ok('CA8 the same dispatcher creates a personal Library folder', folder.json.folder?.name === 'Set Pieces');
    const moveTurn = await turn('keep_in_library', 'Put this in Set Pieces.', about, { folderId: folder.json.folder.id });
    const moved = await confirm(moveTurn, 'keep_in_library');
    ok('CA9 filing into a folder moves the same reference rather than copying it', moved.json.outcome === 'moved' && (S.shelfFilings[ALMA_CODE] || []).length === 1);

    const focusBefore = S._allObjectsFor(ALMA_CODE, member.id).filter(o => o.kind === 'focus').length;
    const focusTurn = await turn('create_focus', 'Improve my communication when we defend.', about, { text: 'Improve my communication when we defend.' });
    ok('CA10 focus creation is proposed, not performed', focusTurn.json.response.proposedActions.some(p => p.actionType === 'create_focus') && S._allObjectsFor(ALMA_CODE, member.id).filter(o => o.kind === 'focus').length === focusBefore);
    const focus = await confirm(focusTurn, 'create_focus');
    ok('CA11 confirmation creates a private Focus through the governed dispatcher', focus.json.focus?.visibility === 'private');
    ok('CA12 no target or date is invented', focus.json.focus.target === null && focus.json.focus.reviewAt === null);

    const updateTurn = await turn('update_focus', 'Make the target calmer defensive communication.',
      { kind: 'focus', id: focus.json.focus.id }, { target: 'Calmer defensive communication' });
    const updated = await confirm(updateTurn, 'update_focus');
    ok('CA12b focus target updates through the same confirmed dispatcher', updated.json.focus?.target === 'Calmer defensive communication');

    const disagreeTurn = await turn('disagree_with_inquiry', 'I think spacing is the issue, not effort.', about,
      { because: 'I think spacing is the issue, not effort.' });
    const disagreed = await confirm(disagreeTurn, 'disagree_with_inquiry');
    const afterDisagree = Object.values(S.inquiryStates[ALMA_CODE][`member:${member.id}`]).find(i => i.inquiryId === inquiry.inquiryId);
    const dissent = (afterDisagree.signals || []).find(s => s.dissents === true && s.originRef === `self:${member.id}`);
    ok('CA12c disagreement uses the governed contradicting-account boundary', disagreed.json.outcome === 'contested'
      && dissent && (S.evidenceLog[ALMA_CODE] || []).some(e => e.id === dissent.ref && e.visibility === 'private' && e.ownerRef === member.id));
    const repeatTurn = await turn('disagree_with_inquiry', 'I still disagree: spacing, not effort.', about,
      { because: 'I still disagree: spacing, not effort.' });
    const repeated = await confirm(repeatTurn, 'disagree_with_inquiry');
    const afterRepeat = Object.values(S.inquiryStates[ALMA_CODE][`member:${member.id}`]).find(i => i.inquiryId === inquiry.inquiryId);
    const selfSignals = (afterRepeat.signals || []).filter(s => s.originRef === `self:${member.id}`);
    const activeSelf = selfSignals.filter(s => !s.status || s.status === 'active');
    ok('CA12c2 repeated disagreement revises one canonical origin instead of manufacturing corroboration',
      repeated.json.outcome === 'contested' && activeSelf.length === 1 && selfSignals.some(s => s.status === 'superseded')
      && activeSelf.every(s => (S.evidenceLog[ALMA_CODE] || []).some(e => e.id === s.ref && e.status === 'active')));
    const beforeSettle = JSON.stringify({ status: afterRepeat.status, signals: afterRepeat.signals, hypotheses: afterRepeat.hypotheses });
    const settleTurn = await turn('settle_inquiry', 'I think this is settled now.', about);
    const settled = await confirm(settleTurn, 'settle_inquiry');
    const afterSettle = Object.values(S.inquiryStates[ALMA_CODE][`member:${member.id}`]).find(i => i.inquiryId === inquiry.inquiryId);
    ok('CA12d an owner call cannot flatten a contested empirical Inquiry', settled.status === 409
      && settled.json.error === 'empirical_inquiry_cannot_be_settled_by_call'
      && JSON.stringify({ status: afterSettle.status, signals: afterSettle.signals, hypotheses: afterSettle.hypotheses }) === beforeSettle);

    const beforeEvidence = (S.evidenceLog[ALMA_CODE] || []).length;
    const attachment = await call('/api/assistant/attachments', { title: 'External paper', filename: 'paper.txt', kind: 'text', text: 'A cited external account, not an observation of this organisation.', conversationId: focusTurn.json.conversationId, about });
    ok('CA13 composer attachment is stored as material on the current object', attachment.json.ok && attachment.json.attachedTo.kind === 'inquiry');
    ok('CA14 external material has no epistemic effect', attachment.json.epistemicEffect === 'none' && (S.evidenceLog[ALMA_CODE] || []).length === beforeEvidence);
    ok('CA14b composer Material carries durable external/private provenance',
      S.materials[ALMA_CODE][attachment.json.materialId].visibility === 'private'
      && S.materials[ALMA_CODE][attachment.json.materialId].provenance === 'external'
      && S._materialContext(ALMA_CODE, member.id, about).provenance === 'external');

    const other = Object.values(users).find(u => u.role === 'member' && u.id !== member.id && S.inquiryStates[ALMA_CODE]?.[`member:${u.id}`]);
    const otherInquiry = Object.values(S.inquiryStates[ALMA_CODE][`member:${other.id}`])[0];
    const otherToken = S.issueToken(other.id, ALMA_CODE, other.role);
    const theftTurn = await callAs(otherToken, '/api/assistant/turn', { text: 'Attach this material.',
      about: { kind: 'inquiry', id: otherInquiry.inquiryId }, surface: 'inquiry', attachment: { id: attachment.json.materialId, name: 'paper.txt' },
      requestedAction: { type: 'attach_material', arguments: { materialId: attachment.json.materialId } } });
    const theftProposal = theftTurn.json.response.proposedActions.find(p => p.actionType === 'attach_material');
    const theft = await callAs(otherToken, `/api/assistant/turn/${theftTurn.json.turnId}/confirm`, { proposalId: theftProposal.id });
    ok('CA14c knowing another member private Material id grants nothing', theft.status === 404 && theft.json.error === 'not found');

    const isolatedCode = 'composer-isolated-org';
    const isolatedUser = { id: 'isolated-member', name: 'Isolated member', role: 'member', assignedNodeIds: [], leadershipNodeIds: [] };
    S.orgUsers[isolatedCode] = { [isolatedUser.id]: isolatedUser };
    S.orgNodes[isolatedCode] = {};
    const isolatedToken = S.issueToken(isolatedUser.id, isolatedCode, isolatedUser.role);
    const isolatedFocusTurn = await callAs(isolatedToken, '/api/assistant/turn', { text: 'Make Own isolated focus my focus.',
      requestedAction: { type: 'create_focus', arguments: { text: 'Own isolated focus' } } });
    const isolatedFocusProposal = isolatedFocusTurn.json.response.proposedActions.find(p => p.actionType === 'create_focus');
    const isolatedFocus = await callAs(isolatedToken, `/api/assistant/turn/${isolatedFocusTurn.json.turnId}/confirm`, { proposalId: isolatedFocusProposal.id });
    const crossOrgTurn = await callAs(isolatedToken, '/api/assistant/turn', { text: 'Attach this material.',
      about: { kind: 'focus', id: isolatedFocus.json.focus.id }, surface: 'focus', attachment: { id: attachment.json.materialId, name: 'paper.txt' },
      requestedAction: { type: 'attach_material', arguments: { materialId: attachment.json.materialId } } });
    const crossOrgProposal = crossOrgTurn.json.response.proposedActions.find(p => p.actionType === 'attach_material');
    const crossOrg = await callAs(isolatedToken, `/api/assistant/turn/${crossOrgTurn.json.turnId}/confirm`, { proposalId: crossOrgProposal.id });
    ok('CA14d knowing another organisation Material id grants nothing', crossOrg.status === 404 && crossOrg.json.error === 'not found');

    const noModel1 = await call('/api/assistant/turn', { text: 'I do not know if we communicate efficiently.' });
    const noModel2 = await call('/api/assistant/turn', { text: 'No, I would like to discuss it with the team.', conversationId: noModel1.json.conversationId,
      requestedAction: { type: 'discuss_with_group', arguments: { text: 'I do not know if we communicate efficiently.' } } });
    ok('CA15 consecutive turns cannot repeat the same canned conversational packet', noModel1.json.response.responseText !== noModel2.json.response.responseText);
    ok('CA15a an ambiguous team request asks instead of publishing', noModel2.json.response.proposedActions.length === 0 && /Which group/.test(noModel2.json.response.responseText));

    const groupId = (member.assignedNodeIds || [])[0];
    const groupName = (S.orgNodes[ALMA_CODE][groupId] || {}).name;
    const groupHighs = await call(`/api/objects?kind=high&scope=group:${encodeURIComponent(groupId)}`, null, 'GET');
    const groupHigh = groupHighs.json.objects?.[0];
    ok('CA15a2 the pilot fixture contains a reachable group High for the Forum path', groupHighs.status === 200 && !!groupHigh);
    if (groupHigh) {
      const highDiscuss = await turn('discuss_with_group', `Discuss this with ${groupName}.`,
        { kind: 'high', id: groupHigh.id }, { groupId });
      const highProposal = highDiscuss.json.response.proposedActions.find(p => p.actionType === 'discuss_with_group');
      ok('CA15a3 a group High can enter the governed Forum flow through its composer context', !!highProposal);
      const highForum = await confirm(highDiscuss, 'discuss_with_group');
      ok('CA15a4 confirming the High discussion opens its existing group room without expanding visibility',
        highForum.json.outcome === 'open_forum' && highForum.json.forum?.room === 'group'
        && highForum.json.forum?.objectId === groupHigh.id);
    }
    const discussTurn = await call('/api/assistant/turn', { text: `No, I would like to discuss it with ${groupName}.`, conversationId: noModel1.json.conversationId,
      requestedAction: { type: 'discuss_with_group', arguments: { groupId, text: 'I do not know if we communicate efficiently.' } } });
    const discussProposal = discussTurn.json.response.proposedActions.find(p => p.actionType === 'discuss_with_group');
    ok('CA15b the confirmation discloses exact shared wording, audience and private exclusions',
      discussProposal?.effect?.text === 'I do not know if we communicate efficiently.'
      && discussProposal.effect.audience?.name === groupName && /private conversation/.test(discussProposal.effect.disclosure));
    const discussed = await confirm(discussTurn, 'discuss_with_group');
    ok('CA15c rejecting private handling can promote only the confirmed payload to a governed shared Focus and Forum',
      discussed.json.outcome === 'open_forum' && discussed.json.focus?.visibility === 'invited' && discussed.json.forum?.room === 'focus');
    const sharedRaw = S._getMemory(ALMA_CODE, member.id).focuses.find(f => f.id === discussed.json.focus.id);
    const inviteeId = (sharedRaw.participants || []).find(id => id !== member.id);
    if (inviteeId) {
      const invitee = users[inviteeId], inviteeToken = S.issueToken(invitee.id, ALMA_CODE, invitee.role);
      const sourceRead = await callAs(inviteeToken, `/api/assistant/conversations/${noModel1.json.conversationId}`, null, 'GET');
      ok('CA15c2 sharing the Focus does not grant access to its source conversation', sourceRead.status === 404);
      const materialShareTurn = await call('/api/assistant/turn', { text: 'Attach this material.',
        about: { kind: 'focus', id: discussed.json.focus.id }, surface: 'focus', attachment: { id: attachment.json.materialId, name: 'paper.txt' },
        requestedAction: { type: 'attach_material', arguments: { materialId: attachment.json.materialId } } });
      const materialShareProposal = materialShareTurn.json.response.proposedActions.find(p => p.actionType === 'attach_material');
      const materialShare = await call(`/api/assistant/turn/${materialShareTurn.json.turnId}/confirm`, { proposalId: materialShareProposal.id });
      const inviteeMaterial = await callAs(inviteeToken, `/api/materials/${attachment.json.materialId}`, null, 'GET');
      const inviteeChart = await callAs(inviteeToken, `/api/objects/focus/${discussed.json.focus.id}/chart?kind=timeline`, null, 'GET');
      ok('CA15c2b attaching owner-private Material to a shared Focus does not widen its readership',
        materialShare.json.ok === true && inviteeMaterial.status === 404
        && !JSON.stringify(inviteeChart.json).includes(attachment.json.materialId) && !JSON.stringify(inviteeChart.json).includes('External paper'));

      const sharedMaterial = await call('/api/materials', { attachTo: { kind: 'focus', id: discussed.json.focus.id },
        title: 'Shared then revoked', filename: 'shared.txt', kind: 'text', text: 'Readable only while the source Focus is accessible.' });
      const inviteeInquiry = Object.values(S.inquiryStates[ALMA_CODE][`member:${invitee.id}`] || {})[0];
      if (sharedMaterial.json.ok && inviteeInquiry) {
        const revokedTurn = await callAs(inviteeToken, '/api/assistant/turn', { text: 'Attach this material.',
          about: { kind: 'inquiry', id: inviteeInquiry.inquiryId }, surface: 'inquiry',
          attachment: { id: sharedMaterial.json.materialId, name: 'shared.txt' },
          requestedAction: { type: 'attach_material', arguments: { materialId: sharedMaterial.json.materialId } } });
        const revokedProposal = revokedTurn.json.response.proposedActions.find(p => p.actionType === 'attach_material');
        sharedRaw.participants = (sharedRaw.participants || []).filter(id => id !== invitee.id);
        const revoked = await callAs(inviteeToken, `/api/assistant/turn/${revokedTurn.json.turnId}/confirm`, { proposalId: revokedProposal.id });
        ok('CA15c2c Material access revoked after proposal fails closed at confirmation', revoked.status === 404 && revoked.json.error === 'not found');
        sharedRaw.participants.push(invitee.id);
      }
    }

    const groupGuardTurn = await call('/api/assistant/turn', { text: `Discuss this with ${groupName}.`, conversationId: noModel1.json.conversationId,
      requestedAction: { type: 'discuss_with_group', arguments: { groupId, text: 'I do not know if we communicate efficiently.' } } });
    const group = S.orgNodes[ALMA_CODE][groupId];
    const removedId = (group.memberIds || []).find(id => id !== member.id);
    if (removedId) group.memberIds = group.memberIds.filter(id => id !== removedId);
    const groupStale = await confirm(groupGuardTurn, 'discuss_with_group');
    ok('CA15c3 audience membership changes invalidate the sharing proposal', groupStale.status === 409 && groupStale.json.error === 'stale_proposal');
    if (removedId) group.memberIds.push(removedId);

    const staleTurn = await turn('update_focus', 'Set the target to Defend calmly.', { kind: 'focus', id: focus.json.focus.id }, { target: 'Defend calmly' });
    const rawFocus = S._getMemory(ALMA_CODE, member.id).focuses.find(f => f.id === focus.json.focus.id);
    rawFocus.target = 'Changed elsewhere';
    const stale = await confirm(staleTurn, 'update_focus');
    ok('CA15d object changes invalidate an old confirmation', stale.status === 409 && stale.json.error === 'stale_proposal' && rawFocus.target === 'Changed elsewhere');

    const overrideTurn = await turn('update_focus', 'Set the target to Defend together.', { kind: 'focus', id: focus.json.focus.id }, { target: 'Defend together' });
    const override = await confirm(overrideTurn, 'update_focus', { target: 'Hidden replacement' });
    ok('CA15e confirmation cannot replace consequential payload fields', override.status === 409 && override.json.error === 'proposal_payload_changed' && rawFocus.target !== 'Hidden replacement');

    const replayTurn = await turn('keep_in_library', 'Keep this in my Library.', about);
    const replay1 = await confirm(replayTurn, 'keep_in_library');
    const replay2 = await confirm(replayTurn, 'keep_in_library');
    ok('CA15f exact proposal replay remains single-use', replay1.json.ok === true && replay2.status === 409 && replay2.json.error === 'already confirmed');

    const inquiryObject = S._allObjectsFor(ALMA_CODE, member.id).find(o => o.kind === 'inquiry' && o.id === inquiry.inquiryId);
    const builtGraph = S._chartFor(ALMA_CODE, member.id, inquiryObject, 'firming');
    const activeDissentRefs = new Set((afterRepeat.signals || []).filter(s => s.dissents && (!s.status || s.status === 'active')).map(s => s.ref));
    const plottedRefs = builtGraph ? builtGraph.spec.series.flatMap(s => s.points.flatMap(p => p.refs || [])) : [];
    ok('CA17a contradicting origins do not rise on the firming support line', !!builtGraph
      && plottedRefs.every(ref => !activeDissentRefs.has(ref)));
    if (builtGraph) {
      const tampered = JSON.parse(JSON.stringify(builtGraph.spec));
      tampered.series[0].points[0].refs.push('fabricated#ref');
      const governed = require('../ai/chart').governChart(tampered, { basis: builtGraph.basis });
      ok('CA17b chart governance uses an independent record basis', governed.ok === false && governed.violations.some(v => v.kind === 'outside_basis'));
    }
    const correctedGraph = S._chartFor(ALMA_CODE, member.id, { kind: 'inquiry', id: 'correction-demo', raw: { signals: [
      { ref: 'ev-old', kind: 'observation', originRef: 'origin-a', at: 1000, status: 'superseded', supersededBy: 'ev-new' },
      { ref: 'ev-new', kind: 'observation', originRef: 'origin-a', at: 5000, status: 'active' },
    ] }, present: { summary: { title: 'Correction' } } }, 'firming');
    const correctionPoints = correctedGraph.spec.series.find(s => s.key === 'origins').points;
    ok('CA17c a correction remains visible without becoming a second origin', correctionPoints.length === 2
      && correctionPoints[0].value === 1 && correctionPoints[1].value === 1 && /corrected/.test(correctionPoints[1].label));

    ok('CA16 object buttons are shortcuts into the assistant action path',
      /beginObjectAction\('create_focus'/.test(require('fs').readFileSync(require('path').join(__dirname, '../js/app.js'), 'utf8')));
    ok('CA16b an object-thread action keeps its confirm card in the conversation instead of discarding it on reload',
      /pending\.innerHTML = this\._renderAssistant\(data\)/.test(require('fs').readFileSync(require('path').join(__dirname, '../js/app.js'), 'utf8'))
      && /\$\{primary\}[\s\S]*\$\{more \? `<details class="iq-more-actions"/.test(require('fs').readFileSync(require('path').join(__dirname, '../js/app.js'), 'utf8')));
    const appSource = require('fs').readFileSync(require('path').join(__dirname, '../js/app.js'), 'utf8');
    const chartRenderer = appSource.slice(appSource.indexOf('_chartHTML(c)'), appSource.indexOf('/* ── MATERIAL', appSource.indexOf('_chartHTML(c)')));
    ok('CA17 the pilot firming graph shows one plain-language support line with time and repetition explained',
      /filter\(s => s\.key === 'origins'\)/.test(chartRenderer)
      && /Separate supporting accounts/.test(chartRenderer) && />Time</.test(chartRenderer)
      && /same account is repeated/.test(chartRenderer));
    const externalSources = S._sourceList([
      { kind: 'web', label: 'Coaching paper', detail: 'Outside research', url: 'https://example.org/paper' },
      { kind: 'web', label: 'Unsafe', detail: 'Not a link', url: 'javascript:alert(1)' },
    ], 'A separate answer');
    ok('CA17d external assistant citations retain a usable web address and reject unsafe schemes',
      externalSources[0]?.url === 'https://example.org/paper' && externalSources[1]?.url == null
      && /Open external source/.test(appSource));
    const mobileCss = require('fs').readFileSync(require('path').join(__dirname, '../css/member.css'), 'utf8');
    ok('CA18 the phone composer and proposal controls stay compact rather than consuming the viewport',
      /@media \(max-width:640px\)[\s\S]*?\.iq-composer-input\{max-height:120px\}[\s\S]*?\.iq-proposal-actions/.test(mobileCss));
  } catch (e) { fail++; console.error('  FAIL HTTP path threw', e && e.stack); }
  server.close();
  console.log(`\ncomposer-actions-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
