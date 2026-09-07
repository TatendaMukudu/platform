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

  const { store } = await buildAlmaStore();
  S._loadAllStores(store); S._rebuildEmailIndex(); S._backfillUserNodeIds();
  const users = S.orgUsers[ALMA_CODE];
  const member = Object.values(users).find(u => u.role === 'member' && S.inquiryStates[ALMA_CODE]?.[`member:${u.id}`]);
  const inquiry = Object.values(S.inquiryStates[ALMA_CODE][`member:${member.id}`])[0];
  const token = S.issueToken(member.id, ALMA_CODE, member.role);
  const server = S.app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, body) => {
    const r = await fetch(base + path, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
    return { status: r.status, json: await r.json() };
  };
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
    ok('CA12c disagreement uses the governed contradicting-account boundary', disagreed.json.outcome === 'contested'
      && (afterDisagree.signals || []).some(s => s.dissents === true && s.originRef === `self:${member.id}`));
    const settleTurn = await turn('settle_inquiry', 'I think this is settled now.', about);
    const settled = await confirm(settleTurn, 'settle_inquiry');
    ok('CA12d settling remains a confirmed owner call rather than a model state change', settled.json.outcome === 'resolved');

    const beforeEvidence = (S.evidenceLog[ALMA_CODE] || []).length;
    const attachment = await call('/api/assistant/attachments', { title: 'External paper', filename: 'paper.txt', kind: 'text', text: 'A cited external account, not an observation of this organisation.', conversationId: focusTurn.json.conversationId, about });
    ok('CA13 composer attachment is stored as material on the current object', attachment.json.ok && attachment.json.attachedTo.kind === 'inquiry');
    ok('CA14 external material has no epistemic effect', attachment.json.epistemicEffect === 'none' && (S.evidenceLog[ALMA_CODE] || []).length === beforeEvidence);

    const noModel1 = await call('/api/assistant/turn', { text: 'I do not know if we communicate efficiently.', conversationId: focusTurn.json.conversationId });
    const noModel2 = await call('/api/assistant/turn', { text: 'No, I would like to discuss it with the team.', conversationId: focusTurn.json.conversationId });
    ok('CA15 consecutive turns cannot repeat the same canned conversational packet', noModel1.json.response.responseText !== noModel2.json.response.responseText);

    const groupId = (member.assignedNodeIds || [])[0];
    const discussTurn = await turn('discuss_with_group', 'No, I would like to discuss it with the team.', null,
      { groupId, text: 'How we communicate efficiently on the field' });
    const discussed = await confirm(discussTurn, 'discuss_with_group');
    ok('CA15b rejecting private handling can promote the topic to a governed shared Focus and Forum',
      discussed.json.outcome === 'open_forum' && discussed.json.focus?.visibility === 'invited' && discussed.json.forum?.room === 'focus');

    ok('CA16 object buttons are shortcuts into the assistant action path',
      /beginObjectAction\('create_focus'/.test(require('fs').readFileSync(require('path').join(__dirname, '../js/app.js'), 'utf8')));
    ok('CA17 the graph explains points, threshold, current origins and repeated-source behaviour',
      ['Each point is a dated moment', 'needed before this can be called', 'originSeries', 'does not add another origin'].every(x => require('fs').readFileSync(require('path').join(__dirname, '../js/app.js'), 'utf8').includes(x)));
    const mobileCss = require('fs').readFileSync(require('path').join(__dirname, '../css/member.css'), 'utf8');
    ok('CA18 the phone composer and proposal controls stay compact rather than consuming the viewport',
      /@media \(max-width:640px\)[\s\S]*?\.iq-composer-input\{max-height:120px\}[\s\S]*?\.iq-proposal-actions/.test(mobileCss));
  } catch (e) { fail++; console.error('  FAIL HTTP path threw', e && e.stack); }
  server.close();
  console.log(`\ncomposer-actions-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
