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

/* Model output is a reading, not a source of user intent. Consequential values are
   retained only when they are grounded in the user's own words or resolve to a
   named object already present in the server-built context. Suggested Focus/forum
   wording is allowed, but is marked so the confirmation surface can name it as a
   suggestion rather than silently attributing it to the person. */
function ground(reading = {}, { text = '', priorMessages = [], context = {} } = {}) {
  const current = String(text || '');
  const priorUser = (priorMessages || []).filter(m => m && m.role === 'user')
    .map(m => String(m.text || '')).filter(Boolean);
  const corpus = [current, ...priorUser].join('\n').toLowerCase();
  const stated = value => !!String(value || '').trim() && corpus.includes(String(value).trim().toLowerCase());
  const currentHas = value => !!String(value || '').trim() && current.toLowerCase().includes(String(value).trim().toLowerCase());
  const actions = [];
  let needsClarification = reading.needsClarification || null;

  for (const action of (reading.actions || [])) {
    const raw = action.arguments || {};
    const args = {};
    const sources = {};
    const keepStated = key => {
      if (raw[key] && stated(raw[key])) { args[key] = raw[key]; sources[key] = 'user_stated'; }
    };
    ['because', 'folderName', 'target', 'reviewOn'].forEach(keepStated);

    if (raw.text) {
      args.text = raw.text;
      sources.text = stated(raw.text) ? 'user_stated' : 'model_suggested';
    }
    if (!args.text && ['create_focus', 'discuss_with_group'].includes(action.type) && /\b(this|that|it)\b/i.test(current)) {
      const antecedent = priorUser[priorUser.length - 1];
      if (antecedent) { args.text = antecedent.slice(0, 300); sources.text = 'user_stated_reference'; }
    }
    if (!args.text && ['create_focus', 'create_inquiry'].includes(action.type) && current.trim()) {
      args.text = current.trim().slice(0, 300); sources.text = 'user_stated';
    }
    if (action.type === 'disagree_with_inquiry' && !args.because && current.trim()) {
      args.because = current.trim().slice(0, 600); sources.because = 'user_stated';
    }

    if (action.type === 'record_focus_outcome' && raw.outcome) {
      const outcome = String(raw.outcome);
      const explicit = outcome === 'helped' ? /\bhelped\b/i.test(current)
        : outcome === 'mixed' ? /\bmixed\b/i.test(current)
        : /\b(did not|didn['’]t|has not|hasn['’]t) help\b|\bno (?:change|difference|improvement)\b/i.test(current);
      if (explicit) { args.outcome = outcome; sources.outcome = 'user_stated'; }
      else needsClarification = needsClarification || 'What happened with this focus: did it help, not help, or was it mixed?';
    }

    const folders = context.folders || [];
    const folder = folders.find(f => String(f.id) === String(raw.folderId) && currentHas(f.name));
    if (folder) { args.folderId = folder.id; sources.folderId = 'deterministically_resolved'; }

    const attachment = context.attachment || null;
    if (raw.materialId && attachment && String(raw.materialId) === String(attachment.id)) {
      args.materialId = String(attachment.id); sources.materialId = 'deterministically_resolved';
    }

    const groups = context.groups || [];
    const namedGroups = groups.filter(g => currentHas(g.name));
    let group = namedGroups.length === 1 ? namedGroups[0] : null;
    if (!group && /\b(the |my |our )?(team|group|squad)\b/i.test(current) && groups.length === 1) group = groups[0];
    if (action.type === 'discuss_with_group' && !(context.object && context.forumAvailable)) {
      if (group) { args.groupId = group.id; sources.groupId = 'deterministically_resolved'; }
      else needsClarification = needsClarification || (groups.length > 1
        ? 'Which group do you want to discuss this with?'
        : 'There is no unambiguous group available for this discussion.');
    }

    const contacts = context.contacts || [];
    const namedContacts = contacts.filter(c => currentHas(c.name));
    if (action.type === 'update_focus' && namedContacts.length) {
      args.participantIds = namedContacts.map(c => c.id); sources.participantIds = 'deterministically_resolved';
    }
    if (raw.visibility && /\b(private|only me|share|shared|visible)\b/i.test(current)) {
      args.visibility = /\b(private|only me)\b/i.test(current) ? 'private' : 'shared';
      sources.visibility = 'user_stated';
    }

    const required = action.type === 'discuss_with_group' && !(context.object && context.forumAvailable) ? ['groupId', 'text']
      : action.type === 'attach_material' ? ['materialId']
      : action.type === 'record_focus_outcome' ? ['outcome'] : [];
    if (required.some(k => !args[k])) continue;
    actions.push({ ...action, arguments: args, argumentSources: sources });
  }
  return { actions, needsClarification };
}

module.exports = { ACTIONS, MODEL_SCHEMA, available, prompt, normalize, ground };
