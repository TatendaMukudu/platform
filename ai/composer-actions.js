/* ============================================================
   The composer capability vocabulary.

   A model may select one of these names and propose arguments. It cannot execute one,
   choose an audience, resolve an object, or grant itself authority. The server resolves
   the current context through the reader's existing gates and dispatches a confirmed
   proposal through the existing mutation capability.
   ============================================================ */

'use strict';

const { FOCUS_RELATIONS } = require('./cross-evidence.js');

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
  /* DECLARED, NEVER INFERRED (founder law, September 2026). The model may notice that a piece of
     evidence looks like it bears on what somebody is working on and OFFER to mark it -- "this may
     support what you're working on, mark it that way?" -- and that is the whole of its authority
     here. Nothing is written until the person confirms, and the vocabulary is three closed words,
     so the model cannot invent a fourth relation or decide which one applies. */
  /* BOUND CONTEXT CHOOSES WHAT; THE MODEL MAY SUGGEST THE RELATION; THE HUMAN CONFIRMS; THE
     CANONICAL OWNER WRITES. `requiresBoundEvidence` is what makes the first clause structural:
     the action is not even OFFERED unless the server has already resolved exactly one piece of
     evidence from the person's own lawful context. So the model is never handed a list of refs to
     pick from, never told one exists that it cannot see, and never in a position to name an
     identifier at all. The only thing it authors here is one of three words. */
  declare_focus_relation: { contexts: ['focus'], confirmation: true, requiresBoundEvidence: true,
    description: `OFFER to record how the piece of evidence currently in view stands to this focus: ${FOCUS_RELATIONS.join(', ')}. Propose ONLY the relation word. The evidence and the focus are already decided by what the person is looking at -- do not name, guess or ask for an identifier for either. The person decides the word; you never decide for them, and you never read it off the direction the evidence carries on an inquiry.` },
  /* PERSONAL ATTENTION OVERRIDE. Two named actions rather than one carrying a boolean, because an
     action whose meaning depends on an argument the model may omit has a default, and the default
     here would be switching something ON in somebody's record. There is no such thing as a
     half-supplied "unprioritise". The target is never authored by the model: it is the object the
     turn is bound to. */
  prioritise_object: { contexts: ['inquiry', 'high', 'low', 'focus'], confirmation: true,
    description: 'Mark the CURRENT object as one the person wants kept near the top for them. It is private to them, it changes nothing about who can see the object, and it says nothing about what the organisation thinks. It is not a score and there are no levels.' },
  unprioritise_object: { contexts: ['inquiry', 'high', 'low', 'focus'], confirmation: true,
    description: 'Take the person own priority mark off the CURRENT object, returning it to ordinary ordering.' },
  navigate_to_object: { contexts: ['inquiry', 'high', 'low', 'focus', 'conversation', 'material'], confirmation: false,
    description: 'Return a safe address for the current object.' },
});

const MODEL_SCHEMA = Object.freeze({
  actions: [{ type: 'one ACTION name', arguments: 'object containing only values stated by the user', reason: 'short explanation' }],
  needsClarification: 'string or null',
});

/* An action is available when the CONTEXT can support it, not when the model would like it to be.
   `requiresBoundEvidence` is checked here rather than at grounding so that an action with no
   lawful target is never even listed -- the model cannot ask for what it was not offered, and
   there is nothing for it to guess at. */
function available(context = {}) {
  const kind = context.object && context.object.kind || null;
  const boundEvidence = !!(context.evidence && context.evidence.ref);
  return Object.entries(ACTIONS)
    .filter(([, a]) => a.contexts.includes(kind))
    .filter(([, a]) => !a.requiresBoundEvidence || boundEvidence)
    .map(([type, a]) => ({ type, description: a.description, requiresConfirmation: a.confirmation }));
}

function prompt({ text, context = {}, priorMessages = [] } = {}) {
  return JSON.stringify({
    rule: 'Interpret intent only. Propose actions; never claim execution, permission, safety, confidence or visibility. Use no action when the person is only talking. Do not infer missing dates, targets, audiences, folder names or outcomes. You never author an identifier: the object and the evidence in view are already decided by what the person is looking at, and any id you write will be discarded.',
    relationVocabulary: FOCUS_RELATIONS,
    currentContext: {
      surface: context.surface || null,
      object: context.object ? { kind: context.object.kind, id: context.object.id, label: context.object.label || null } : null,
      folders: (context.folders || []).map(f => ({ id: f.id, name: f.name })),
      groups: (context.groups || []).map(g => ({ id: g.id, name: g.name })),
      contacts: (context.contacts || []).map(c => ({ id: c.id, name: c.name, with: c.with || null })),
      forumAvailable: context.forumAvailable === true,
      attachment: context.attachment ? { id: context.attachment.id, name: context.attachment.name } : null,
      /* A BOOLEAN, NOT A REF, AND NEVER THE WORDS. The model is told only WHETHER exactly one
         piece of evidence is bound to this turn, so it knows whether "this evidence" has a
         referent. It is never shown which, and never shown what it says: naming it is the
         server's job and reading it is nobody's. */
      evidenceInView: !!(context.evidence && context.evidence.ref),
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
  /* WHY IT WAS DROPPED, WHEN THE REASON IS SOMETHING THE PERSON CAN FIX. An action filtered out
     for want of bound evidence is not a misunderstanding — it is a real request with a missing
     referent, and the founder's law says to ask which evidence they mean rather than guess. A
     control can request this action directly, so it can be dropped here even though the model was
     never offered it; without this, tapping it would produce silence. */
  let dropped = null;
  for (const row of rows.slice(0, 3)) {
    const type = String(row && row.type || '');
    if (!allowed.has(type)) {
      if (ACTIONS[type] && ACTIONS[type].requiresBoundEvidence && !(context.evidence && context.evidence.ref)) {
        dropped = dropped || 'Which piece of evidence do you mean? Open it and I can record how you read it.';
      }
      continue;
    }
    const raw = row && row.arguments && typeof row.arguments === 'object' ? row.arguments : {};
    const args = {};
    /* `relation` is retained and `evidenceRef` is DELIBERATELY NOT. The founder's law splits the
       proposal in two: the server supplies the identifiers, the model may suggest one of three
       words. Adding `evidenceRef` here -- the obvious one-line fix for the dead path -- would be
       exactly the thing the law forbids. */
    for (const key of ['text', 'target', 'reviewOn', 'visibility', 'outcome', 'because', 'folderName', 'folderId', 'materialId', 'groupId', 'relation']) {
      if (typeof raw[key] === 'string' && raw[key].trim()) args[key] = raw[key].trim().slice(0, key === 'because' ? 600 : 300);
    }
    if (Array.isArray(raw.participantIds)) args.participantIds = [...new Set(raw.participantIds.map(String))].slice(0, 20);
    actions.push({ type, arguments: args, reason: String(row.reason || '').slice(0, 240), requiresConfirmation: ACTIONS[type].confirmation });
  }
  return { actions, needsClarification: typeof result?.needsClarification === 'string' ? result.needsClarification.slice(0, 300) : dropped };
}

/* Model output is a reading, not a source of user intent. Consequential values are
   retained only when they are grounded in the user's own words or resolve to a
   named object already present in the server-built context. Suggested Focus/forum
   wording is allowed, but is marked so the confirmation surface can name it as a
   suggestion rather than silently attributing it to the person. */
function ground(reading = {}, { text = '', priorMessages = [], context = {}, requested = false } = {}) {
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
    /* ── A QUESTION IS NOT A COMMITMENT ─────────────────────────────────────────────────────
       Both fallbacks below manufacture a Focus TITLE out of the person's raw words when the
       model proposed create_focus and supplied none. Neither asked whether the person had said
       anything resembling intent — so on a real phone, asking "Why is this the thing worth
       looking at, and what is it resting on?" produced a proposal to start a Focus called
       exactly that. Seven ordinary questions did the same, in every object context.

       The rule the product already applies everywhere else is the fix: a consequential value is
       taken from the turn only when the turn EXPLICITLY carries it. `record_focus_outcome` will
       not accept "helped" unless the person wrote "helped"; `visibility` will not widen unless
       the person wrote "share". `create_focus` was the one consequential action that would take
       anything at all.

       THIS IS SYNTAX, NOT SENTIMENT. It reads the shape of the sentence — is it phrased as a
       question, does it contain a stated intent to act — exactly as the outcome check reads for
       a literal word. It does not classify mood, infer direction, or decide what somebody meant.
       That distinction is the one PROTOCOL draws, and it is the reason no lexicon is returning
       here by the back door.

       A CONTROL IS ITSELF THE DECLARATION. "Work on this" on an object thread stages this action
       and then asks the person what they want to change; they answer with a bare noun phrase
       ("Sharper first touch") that carries no marker and is not a question. That is intent
       already declared by pressing the button, so `requested` bypasses the test. Only the
       model-proposed path has to find intent in the words, because only there is intent in
       doubt. */
    const _isQuestion = t => /\?\s*$/.test(String(t).trim())
      || /^\s*(why|what|who|whom|whose|when|where|which|how|should|shall|could|can|would|will|do|does|did|is|are|was|were|am|tell me|explain|show me)\b/i.test(t);
    /* ASKING FOR A FOCUS IN SO MANY WORDS IS THE PLAINEST INTENT THERE IS, and the first version
       of this list did not contain it. It had `start a focus` and `make this a focus` written out
       as two literals, so "Create a focus for recovery", "Set up a focus for recovery" and
       "New focus: recovery" — the three ways a coach is most likely to phrase it — fell through to
       the clarification and got asked what they wanted to change by a surface they had just told.
       Two hand-written literals where a family of phrasings exists is the same defect as two
       descriptions of one rule; the family is written once, here. */
    const _asksForAFocus = /\b(?:creat(?:e|ing)|set(?:ting)?\s*up|start(?:ing)?|mak(?:e|ing)|add(?:ing)?|new)\s+(?:this\s+|a\s+|an\s+|the\s+|another\s+)*focus\b/i;
    const _statesIntent = t => _asksForAFocus.test(t)
      || /\b(work(?:ing)? on|focus on|commit to|i want to|i'?m going to|i am going to|i need to|i'?ll|let me|let'?s|going to try|try to|get better at|improve|practi[cs]e)\b/i.test(t);
    const _mayTakeWording = requested || (_statesIntent(current) && !_isQuestion(current));

    if (!args.text && ['create_focus', 'discuss_with_group'].includes(action.type)
        && /\b(this|that|it)\b/i.test(current)
        && (action.type === 'discuss_with_group' || _mayTakeWording)) {
      const antecedent = priorUser[priorUser.length - 1];
      if (antecedent) { args.text = antecedent.slice(0, 300); sources.text = 'user_stated_reference'; }
    }
    if (!args.text && ['create_focus', 'create_inquiry'].includes(action.type) && current.trim()
        && _mayTakeWording) {
      args.text = current.trim().slice(0, 300); sources.text = 'user_stated';
    }
    if (!args.text && action.type === 'create_focus' && current.trim() && !_mayTakeWording) {
      // Say why nothing happened. Silence after a question that the model read as intent is how
      // somebody learns not to trust the surface.
      needsClarification = needsClarification
        || 'I can answer that, or start a focus on it — say what you would want to change and I will set one up.';
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

    /* ── THE DECLARED FOCUS RELATION ────────────────────────────────────────────────────────
       BOUND CONTEXT CHOOSES WHAT. `evidenceRef` is taken from the server-resolved binding and
       from nowhere else -- never from `raw`, so whatever the model wrote in that field is simply
       never read. The relation is the ONE thing it may author, checked against the closed
       vocabulary here and again at the writer.

       `model_suggested` is the lawful source for the word: the founder's law is that the model
       may propose it and the human confirms. It is marked as suggested rather than stated so the
       confirmation surface can say whose idea it was, exactly as it does for suggested wording. */
    if (action.type === 'declare_focus_relation') {
      const bound = context.evidence && context.evidence.ref ? String(context.evidence.ref) : '';
      const word = String(raw.relation || '').trim().toLowerCase();
      if (bound) { args.evidenceRef = bound; sources.evidenceRef = 'deterministically_resolved'; }
      if (FOCUS_RELATIONS.includes(word)) {
        args.relation = word;
        sources.relation = currentHas(word) ? 'user_stated' : 'model_suggested';
      } else if (bound) {
        needsClarification = needsClarification
          || `Does that evidence support what this focus is trying to do, undermine it, or is it unclear?`;
      }
      if (!bound) {
        // NO GUESSING, AND NO LIST OF HIDDEN REFS. If nothing is bound, the person is asked which
        // evidence they mean rather than being offered a choice they never made visible.
        needsClarification = needsClarification
          || 'Which piece of evidence do you mean? Open it and I can record how you read it.';
      }
    }

    /* The priority mark takes NO arguments at all. Its target is the object the turn is bound to,
       resolved by the server, so there is nothing here for a model to fill in wrongly. */

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
      // Both halves required: no evidence, no proposal — and no relation word, no proposal either.
      // A half-formed relation proposal would reach a confirmation card that could not say what
      // confirming it would do.
      : action.type === 'declare_focus_relation' ? ['evidenceRef', 'relation']
      // A create_focus with no lawful wording is not a weaker proposal, it is an untitled
      // commitment. Dropped, with the clarification above explaining what would start one.
      : action.type === 'create_focus' ? ['text']
      : action.type === 'record_focus_outcome' ? ['outcome'] : [];
    if (required.some(k => !args[k])) continue;
    actions.push({ ...action, arguments: args, argumentSources: sources });
  }
  return { actions, needsClarification };
}

module.exports = { ACTIONS, MODEL_SCHEMA, available, prompt, normalize, ground };
