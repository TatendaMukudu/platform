/* ============================================================
   The composer capability vocabulary.

   A model may select one of these names and propose arguments. It cannot execute one,
   choose an audience, resolve an object, or grant itself authority. The server resolves
   the current context through the reader's existing gates and dispatches a confirmed
   proposal through the existing mutation capability.
   ============================================================ */

'use strict';

const ACTIONS = Object.freeze({
  create_focus: { contexts: ['inquiry', 'high', 'low', 'focus', 'conversation', null], confirmation: true,
    description: 'Start a private focus in the user words; target and review date are optional and never invented.' },
  update_focus: { contexts: ['focus'], confirmation: true,
    description: 'Change the wording, target, review date, or audience of the current focus.' },
  record_focus_outcome: { contexts: ['focus'], confirmation: true,
    description: 'Record the user declared outcome of the current focus.' },
  inspect_inquiry: { contexts: ['inquiry'], confirmation: false,
    description: 'Open or explain the current inquiry and its governed evidence.' },
  create_inquiry: { contexts: [null, 'focus', 'high', 'low'], confirmation: true,
    description: 'Open a private inquiry on a topic stated by the user; it starts unsettled.' },
  show_evidence: { contexts: ['inquiry', 'high', 'low', 'focus'], confirmation: false,
    description: 'Open the governed evidence view for the current object.' },
  settle_inquiry: { contexts: ['inquiry'], confirmation: true,
    description: 'Record the owner call that the current inquiry is settled; never decide confidence.' },
  disagree_with_inquiry: { contexts: ['inquiry', 'high', 'low'], confirmation: true,
    description: 'Contribute the user own contradicting account through the existing evidence boundary.' },
  request_research: { contexts: ['inquiry', 'high', 'low', 'focus'], confirmation: false,
    description: 'Show external cited reading for the current object; it is never internal evidence.' },
  attach_material: { contexts: ['inquiry', 'high', 'low', 'focus'], confirmation: true,
    description: 'Attach an uploaded material reference to the current object.' },
  keep_in_library: { contexts: ['inquiry', 'high', 'low', 'focus', 'conversation', 'material'], confirmation: true,
    description: 'File a live reference on the user shelf; filing grants no access and creates no copy.' },
  create_library_folder: { contexts: [null, 'inquiry', 'high', 'low', 'focus', 'conversation', 'material'], confirmation: true,
    description: 'Create a personal Library folder.' },
  discuss_with_group: { contexts: [null, 'conversation', 'inquiry', 'high', 'low', 'focus'], confirmation: true,
    description: 'Open the governed Forum room; a private noticing is first promoted to a Focus with an explicit group.' },
  navigate_to_object: { contexts: ['inquiry', 'high', 'low', 'focus', 'conversation', 'material'], confirmation: false,
    description: 'Return a safe address for the current object.' },
});

const MODEL_SCHEMA = Object.freeze({
  actions: [{ type: 'one ACTION name', arguments: 'object containing only values stated by the user', reason: 'short explanation' }],
  needsClarification: 'string or null',
});

function available(context = {}) {
  const kind = context.object && context.object.kind || null;
  return Object.entries(ACTIONS)
    .filter(([, a]) => a.contexts.includes(kind))
    .map(([type, a]) => ({ type, description: a.description, requiresConfirmation: a.confirmation }));
}

function prompt({ text, context = {}, priorMessages = [] } = {}) {
  return JSON.stringify({
    rule: 'Interpret intent only. Propose actions; never claim execution, permission, safety, confidence or visibility. Use no action when the person is only talking. Do not infer missing dates, targets, audiences, folder names or outcomes.',
    currentContext: {
      surface: context.surface || null,
      object: context.object ? { kind: context.object.kind, id: context.object.id, label: context.object.label || null } : null,
      folders: (context.folders || []).map(f => ({ id: f.id, name: f.name })),
      groups: (context.groups || []).map(g => ({ id: g.id, name: g.name })),
      contacts: (context.contacts || []).map(c => ({ id: c.id, name: c.name, with: c.with || null })),
      forumAvailable: context.forumAvailable === true,
      attachment: context.attachment ? { id: context.attachment.id, name: context.attachment.name } : null,
    },
    availableActions: available(context),
    conversation: (priorMessages || []).slice(-6).map(m => ({ role: m.role, text: String(m.text || '').slice(0, 300) })),
    user: String(text || '').slice(0, 1000),
    output: MODEL_SCHEMA,
  });
}

function normalize(result, context = {}) {
  const allowed = new Set(available(context).map(a => a.type));
  const rows = Array.isArray(result && result.actions) ? result.actions : [];
  const actions = [];
  for (const row of rows.slice(0, 3)) {
    const type = String(row && row.type || '');
    if (!allowed.has(type)) continue;
    const raw = row && row.arguments && typeof row.arguments === 'object' ? row.arguments : {};
    const args = {};
    for (const key of ['text', 'target', 'reviewOn', 'visibility', 'outcome', 'because', 'folderName', 'folderId', 'materialId', 'groupId']) {
      if (typeof raw[key] === 'string' && raw[key].trim()) args[key] = raw[key].trim().slice(0, key === 'because' ? 600 : 300);
    }
    if (Array.isArray(raw.participantIds)) args.participantIds = [...new Set(raw.participantIds.map(String))].slice(0, 20);
    actions.push({ type, arguments: args, reason: String(row.reason || '').slice(0, 240), requiresConfirmation: ACTIONS[type].confirmation });
  }
  return { actions, needsClarification: typeof result?.needsClarification === 'string' ? result.needsClarification.slice(0, 300) : null };
}

module.exports = { ACTIONS, MODEL_SCHEMA, available, prompt, normalize };
