/* ============================================================
   The composer capability vocabulary.

   A model may select one of these names and propose arguments. It cannot execute one,
   choose an audience, resolve an object, or grant itself authority. The server resolves
   the current context through the reader's existing gates and dispatches a confirmed
   proposal through the existing mutation capability.
   ============================================================ */

'use strict';

const { FOCUS_RELATIONS } = require('./cross-evidence.js');

/* ── AN ACTION SCHEMA THAT DOES NOT NAME ITS ARGUMENTS IS NOT A BOUNDED SCHEMA ────────────────
   Every entry below declares `args`: the arguments THE MODEL MAY AUTHOR for that action, by the
   exact key the rest of this pipeline reads, each with what it means.

   It was found by driving the eight actions no test had ever driven. `create_library_folder` was
   offered, proposed, shown on a card and CONFIRMED BY A PERSON, and then answered 400 "folder
   name required" — because the model had supplied `{ name: 'Restarts' }` and the one key this
   code reads is `folderName`. Nothing anywhere had ever told it that. The schema handed to the
   model said `arguments: 'object containing only values stated by the user'` and stopped, so
   `folderName`, `reviewOn`, `materialId`, `groupId`, `because` and the rest had to be GUESSED,
   and a wrong guess was silently dropped by an allowlist one function away. The person who
   pressed Confirm got an error or, worse, a thing created with the value missing.

   Two properties, and the second is the reason this is a tightening rather than a convenience:

     · the model is told the vocabulary, so it can supply what the person actually said;
     · `normalize` filters PER ACTION from this same declaration rather than from a second
       hand-written union, so an argument belonging to one action can no longer ride in on
       another. `create_focus` used to accept `visibility` from the model — which the card never
       showed and the canonical owner never read, so it was dead weight that nonetheless looked
       like the model setting an audience.

   WHAT IS NOT DECLARED IS AS DELIBERATE AS WHAT IS. `evidenceRef` is never authorable: the law
   splits the proposal so the server supplies identifiers and the model may suggest one of three
   words. Where an id IS declared — `folderId`, `groupId`, `materialId` — it is a HINT that must
   match something the server already put in `currentContext`, and `ground` re-resolves every one
   of them against the person's own lawful context before it reaches a proposal. */
const ACTIONS = Object.freeze({
  create_focus: { contexts: ['inquiry', 'high', 'low', 'focus', 'conversation', null], confirmation: true,
    args: { text: 'the commitment in the person own words', target: 'a measurable target ONLY if they stated one',
      reviewOn: 'a review date ONLY if they stated one' },
    description: 'Start a private focus in the user words. Inside an existing focus, use this ONLY for a deliberately separate desired state, never for a tactic adjustment or rewording; the existing focus remains unchanged. Target and review date are optional and never invented.' },
  update_focus: { contexts: ['focus'], confirmation: true,
    args: { text: 'the new wording, in the person own words', target: 'a target ONLY if they stated one',
      reviewOn: 'a review date ONLY if they stated one',
      visibility: 'private or shared, ONLY if they said which',
      participantIds: 'ids from currentContext.contacts, ONLY if they named people' },
    description: 'Revise the desired state, wording, target, review date, or audience of the current focus while preserving the same canonical commitment. Use this, not create_focus, for tactic adjustments or a revision the person says is still the same commitment.' },
  record_focus_outcome: { contexts: ['focus'], confirmation: true,
    args: { outcome: 'the outcome word the person themselves used' },
    description: 'Record the user declared outcome of the current focus.' },
  inspect_inquiry: { contexts: ['inquiry'], confirmation: false, args: {},
    description: 'Open or explain the current inquiry and its governed evidence.' },
  show_evidence: { contexts: ['inquiry', 'high', 'low', 'focus'], confirmation: false, args: {},
    description: 'Open the governed evidence view for the current object.' },
  settle_inquiry: { contexts: ['inquiry'], confirmation: true, args: {},
    description: 'Record the owner call that the current inquiry is settled; never decide confidence.' },
  disagree_with_inquiry: { contexts: ['inquiry', 'high', 'low'], confirmation: true,
    args: { because: 'the person own account of why they disagree, in their words' },
    description: 'Contribute the user own contradicting account through the existing evidence boundary.' },
  request_research: { contexts: ['inquiry', 'high', 'low', 'focus'], confirmation: false, args: {},
    description: 'Show external cited reading for the current object; it is never internal evidence.' },
  attach_material: { contexts: ['inquiry', 'high', 'low', 'focus'], confirmation: true,
    args: { materialId: 'the id of a document from currentContext.attachment or one the person named; the server re-resolves it and discards anything else' },
    description: 'Attach an uploaded material reference to the current object.' },
  keep_in_library: { contexts: ['inquiry', 'high', 'low', 'focus', 'material'], confirmation: true,
    args: { folderId: 'an id from currentContext.folders, ONLY if the person named a folder that is in that list' },
    description: 'File the current intelligence object or material as an intentional Library reference. This is not conversational memory: never offer it merely to remember, keep private, or preserve an ordinary conversation.' },
  create_library_folder: { contexts: [null, 'inquiry', 'high', 'low', 'focus', 'conversation', 'material'], confirmation: true,
    args: { folderName: 'the folder name in the person own words; never invented' },
    description: 'Create a personal Library folder.' },
  discuss_with_group: { contexts: [null, 'conversation', 'inquiry', 'high', 'low', 'focus'], confirmation: true,
    args: { groupId: 'an id from currentContext.groups', text: 'what the person wants to put to the group, in their words',
      participantIds: 'ids from currentContext.contacts, ONLY if they named people' },
    description: 'Open the governed Forum room; a private noticing is first promoted to a Focus with an explicit group.' },
  /* PRIVATE -> FORUM IS A DISCLOSURE, AND DISCLOSURE IS NEVER A SIDE EFFECT.

     FOUNDER DECISION, September 2026: Forum content may inform private conversation for that same
     object; private conversation NEVER enters a Forum without a separate explicit Share to Forum
     action, an audience preview, and a confirmation.

     The direction is the whole design. Forum -> private is a READ of a room the person can already
     open from the same screen, so it shows them nothing new. This is the other way, and every
     property below exists because of that asymmetry:

       it is its own action, not an argument on another one, so it can never be reached as a
       variation of something the person meant to do;
       `confirmation: true`, so nothing is written until a human presses confirm;
       the text is the PERSON'S, carried in `text` and editable on the card, because a share whose
       wording the person did not see is a share they did not make;
       the audience is resolved and PREVIEWED by the server from the object's current readable
       room, so the card names who will see it rather than describing them.

     The model may OFFER it -- "do you want to put that to the group?" -- and that is the whole of
     its authority. It never chooses the room (that is the object's), never chooses the words
     (those are the person's), and cannot make the share happen. */
  share_to_forum: { contexts: ['inquiry', 'high', 'low', 'focus'], confirmation: true,
    args: { text: 'the wording to share, taken from what the person actually said in this conversation' },
    description: 'OFFER to put something the person has said into the Forum for the object they are looking at. Propose ONLY the wording, taken from what they actually said. You do not choose the room -- it is the room of the object in view -- and nothing is shared until they read the audience and confirm. Never offer this for anything they have not themselves just said in this conversation.' },
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
    /* `evidenceRef` IS ABSENT ON PURPOSE and adding it here would be the same breach as adding it
       to the old allowlist: the evidence is whatever the person has in view, resolved by the
       server, and the model authors one of three words and nothing else. */
    args: { relation: 'one word from relationVocabulary and nothing else' },
    description: `OFFER to record how the piece of evidence currently in view stands to this focus: ${FOCUS_RELATIONS.join(', ')}. Propose ONLY the relation word. The evidence and the focus are already decided by what the person is looking at -- do not name, guess or ask for an identifier for either. The person decides the word; you never decide for them, and you never read it off the direction the evidence carries on an inquiry.` },
  /* PERSONAL ATTENTION OVERRIDE. Two named actions rather than one carrying a boolean, because an
     action whose meaning depends on an argument the model may omit has a default, and the default
     here would be switching something ON in somebody's record. There is no such thing as a
     half-supplied "unprioritise". The target is never authored by the model: it is the object the
     turn is bound to. */
  prioritise_object: { contexts: ['inquiry', 'high', 'low', 'focus'], confirmation: true, args: {},
    description: 'Mark the CURRENT object as one the person wants kept near the top for them. It is private to them, it changes nothing about who can see the object, and it says nothing about what the organisation thinks. It is not a score and there are no levels.' },
  unprioritise_object: { contexts: ['inquiry', 'high', 'low', 'focus'], confirmation: true, args: {},
    description: 'Take the person own priority mark off the CURRENT object, returning it to ordinary ordering.' },
  navigate_to_object: { contexts: ['inquiry', 'high', 'low', 'focus', 'conversation', 'material'], confirmation: false, args: {},
    description: 'Return a safe address for the current object.' },
});

/* The one argument that is a list of ids rather than a string. Named here so `normalize` reads
   its shape from the same place it reads the vocabulary, instead of carrying a second rule. */
const ARG_IS_LIST = Object.freeze(new Set(['participantIds']));

/* ── A COMMAND SHAPE, WHICH IS NOT AN INTENT ENGINE ───────────────────────────────────────────
   FOUNDER ADJUDICATION, September 2026. The action vocabulary above is complete, and the pipeline
   behind it — ground, propose, confirm, canonical owner — is provider-independent. Only the
   INTERPRETATION step is model-gated: `_composerActionInterpret` selects nothing when no model is
   configured. So in the pilot's actual running state, where the provider is off, a person could
   not start an Inquiry or a Focus by saying so, and the reply talked about a reasoning engine.

   THIS IS SYNTAX. It reads the shape of a sentence — a leading imperative verb, immediately
   naming one of the product's own object words — and returns which ACTION that names. It does
   not classify mood, infer what somebody meant, resolve an object, choose an audience, or decide
   anything is true. Given a sentence it does not match, it returns null and the turn proceeds
   exactly as it did before.

   WHAT IT DELIBERATELY DOES NOT DO, and each of these is the difference between a parser and an
   engine:

     · it does not set `requested`. A pressed control IS a declaration of intent, which is why
       that flag exists; a regex is not, so the reading it produces goes through the SAME
       grounding every model-proposed action gets. TODAY that changes no outcome, and saying so
       is more honest than implying a guard that is currently doing no work: this parser already
       refuses a question and already requires a payload, so the grounding's own question and
       stated-intent tests find nothing left to catch. It matters the day somebody widens the
       shape — `requested: true` would silently exempt the wider version from the tests that stop
       a question becoming a commitment.
     · it never supplies an argument the person did not write. The payload is the remainder of
       their own sentence, and if that is empty there is nothing to propose.
     · it names only actions that ALREADY EXIST. There is no create_high and no create_low here,
       because High and Low are PROJECTIONS of contributed observations rather than records, and
       inventing an action for them would be inventing a second canonical owner. A sentence that
       asks for one is reported by name so the caller can say where that actually happens.
     · it writes nothing and confirms nothing. Everything after it is the governed path.

   PURE: no IO, no model, deterministic. */
const _COMMAND_RE = new RegExp(
  '^\\s*(?:please\\s+|can\\s+you\\s+|could\\s+you\\s+)?'
  + '(?:create|start|open|make|set\\s+up|add)\\s+'
  + '(?:a|an|the|my|our)?\\s*'
  + '(focus|inquiry|enquiry|high|low)\\b'
  + '\\s*(?::|,|-|\u2014)?\\s*'
  + '(?:about|on|into|for|to|that|regarding)?\\s*'
  + '(.*)$', 'i');

/* Object word -> the action that already owns it. High and Low are absent on purpose. */
const _COMMAND_ACTION = Object.freeze({
  focus: 'create_focus',
});

/* ── SAYING YES IN WORDS ───────────────────────────────────────────────────────────────────────
   A consequential action is PROPOSED and then CONFIRMED. The proposal already shows the person
   exactly what would happen — the words, the audience, the object — and confirmation has until now
   meant pressing a button carrying that proposal's id.

   So a person who reads the card and types "yeah" has done the human half of confirming, and the
   product did nothing with it: the id lives on a button, "yeah" names no id, and the sentence fell
   through to the ordinary answering path. That is the machinery showing through at the exact moment
   the founder's law says it should not — "the person talks, IntelliQ handles the machinery".

   THIS READS THE WORDS AND NOTHING ELSE. It resolves no object, executes nothing, and grants no
   authority; the caller matches what it returns against proposals it already made and then goes
   through the SAME confirm path, with the same frozen payload and the same re-checked authority.
   There is no second mutation path, which is the only reason this is safe to add at all.

   THE WHOLE MESSAGE MUST BE THE ACCEPTANCE. "yes" inside a sentence is a person talking, not a
   person confirming — "yes, I was worried about that, and I think we go quiet after we concede" is
   an account, and treating it as a confirmation would execute something they were still discussing.
   So these patterns are anchored at both ends and deliberately short.

   DECLINE IS READ TOO, and is not the absence of acceptance. "no" must stop a pending proposal
   rather than fall through to be answered as a new remark. */
const _ACCEPT_RE = /^\s*(?:ok(?:ay)?|yes|yeah|yep|yup|sure|please\s+do|go\s+ahead|do\s+(?:it|that)|let'?s\s+do\s+(?:it|that)|make\s+it\s+so|sounds\s+good|agreed|i\s+agree|that\s+one)\s*[.!]*\s*$/i;
const _DECLINE_RE = /^\s*(?:no|nope|not\s+(?:now|that|yet)|don'?t|cancel|leave\s+it|never\s+mind|nevermind|forget\s+it)\s*[.!]*\s*$/i;

/* Which one of several, in the words people actually use. "the first one", "number 2", "the second".
   Anchored the same way, and ordinals only — there is no "the big one" or "the communication one",
   because choosing by description is an interpretation and this file does not interpret. */
const _ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth'];
const _ORDINAL_RE = new RegExp(
  '^\\s*(?:(?:let\'?s\\s+)?(?:do|try|use|take|go\\s+with)\\s+)?'
  + '(?:the\\s+)?(?:(' + _ORDINALS.join('|') + ')|(?:number\\s*|#)?([1-5]))'
  + '(?:\\s+one)?\\s*[.!]*\\s*$', 'i');

/* Returns { kind: 'accept'|'decline', ordinal: 1-based index or null } or null for anything else.
   Null is the common answer and means "this is not an acceptance", which leaves every existing
   path exactly as it was. */
function readAcceptance(text) {
  const raw = String(text == null ? '' : text).trim();
  if (!raw || raw.length > 40) return null;     // a long sentence is talking, not confirming
  if (/\?\s*$/.test(raw)) return null;           // "yes?" is a question, not an answer
  if (_DECLINE_RE.test(raw)) return { kind: 'decline', ordinal: null };
  if (_ACCEPT_RE.test(raw)) return { kind: 'accept', ordinal: null };
  const m = _ORDINAL_RE.exec(raw);
  if (m) {
    const word = m[1] ? _ORDINALS.indexOf(String(m[1]).toLowerCase()) + 1 : Number(m[2]);
    if (word >= 1 && word <= 5) return { kind: 'accept', ordinal: word };
  }
  return null;
}

/* ── AND WHAT THAT ACCEPTANCE REFERS TO ────────────────────────────────────────────────────────
   Given what the person said and the proposals they were lastShown, which one did they mean?

   THE ONLY TWO SAFE ANSWERS ARE "exactly this one" AND "ask them". One pending proposal and a bare
   "yeah" is unambiguous. Several pending and a bare "yeah" is NOT — and guessing the first would
   be the product choosing a consequential action on somebody's behalf, which is the one thing the
   founder's law forbids. An ordinal picks one only when it is in range; "the fourth one" against
   two proposals is a misunderstanding, not a selection, and saying so is better than acting.

   Returns { resolved: proposal } | { ask: 'question' } | { declined: true } | null. */
function resolveAcceptance(said, offered = []) {
  const acc = readAcceptance(said);
  if (!acc) return null;
  const list = (Array.isArray(offered) ? offered : []).filter(Boolean);
  if (!list.length) return null;                       // nothing pending: it was just a remark
  if (acc.kind === 'decline') return { declined: true };
  if (acc.ordinal != null) {
    if (acc.ordinal > list.length) {
      return { ask: list.length === 1
        ? 'I only offered one thing there — did you mean that one?'
        : `I offered ${list.length}. Which of them did you mean?` };
    }
    return { resolved: list[acc.ordinal - 1] };
  }
  if (list.length === 1) return { resolved: list[0] };
  return { ask: `I offered ${list.length} things there. Which one did you mean?` };
}

function readCommand(text) {
  const raw = String(text == null ? '' : text).trim();
  if (!raw) return null;
  // A QUESTION IS NOT A COMMAND. "Should I create a focus for this?" is somebody thinking aloud.
  if (/\?\s*$/.test(raw)) return null;
  const m = _COMMAND_RE.exec(raw);
  if (!m) return null;
  const word = String(m[1] || '').toLowerCase();
  const rest = String(m[2] || '').trim().replace(/[.!]+$/, '').trim();
  const type = _COMMAND_ACTION[word];
  if (!type) {
    /* High, Low and Inquiry are governed discovery standings. Naming one is useful intent,
       but never a create action. Preserve WHICH standing the person named so the caller can
       explain the correct governed path; collapsing `inquiry` into `low` would turn an
       uncertainty request into a negative conclusion before the kernel has reasoned at all. */
    const kind = word === 'enquiry' ? 'inquiry' : word;
    return { kind, type: null, text: rest.slice(0, 300) };
  }
  if (!rest) return null;                 // "create a focus" with nothing after it names nothing
  return { kind: 'focus', type, text: rest.slice(0, 300) };
}

const MODEL_SCHEMA = Object.freeze({
  actions: [{ type: 'one ACTION name',
    arguments: 'object using ONLY the keys that action declares in availableActions[].arguments, and only values the person actually stated',
    reason: 'short explanation' }],
  /* ── WHETHER THEY DECLARED IT OR ASKED ABOUT IT, WHICH ONLY LANGUAGE CAN TELL ─────────────
     `create_focus` manufactures a commitment, so it is the one action that must not be staged
     from somebody merely wondering aloud. That test used to be an ENGLISH WORD LIST — "work on",
     "I want to", "let's", "get better at" — and it sat after the model had already read the
     sentence and chosen the action.

     So a Shona speaker saying "Ndinoda kushanda pakutaura kutanga" — I want to work on speaking
     first — got no Focus. The model understood, picked the right action and supplied the right
     words, and deterministic code then re-did the interpretation in one language and threw it
     away. That is the allowlist the language layer already lost once, arriving one layer down at
     the action that matters most.

     Reading a sentence is the model's half, so it is asked. This is a CLOSED TWO-VALUE FIELD, not
     free text: `ground` accepts nothing else, and the question test still overrides it, because
     "should I work on this?" is not a declaration however it is labelled. Deterministic code
     keeps the veto; what it stops doing is deciding, in English, what the sentence meant. */
  intent: "'stated' when the person is declaring what they will do, 'asked_about' when they are asking, wondering or discussing it — in whatever language they wrote",
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
    /* THE ARGUMENT NAMES TRAVEL WITH THE ACTION. Without this the model was asked to fill an
       object whose keys it had never been told, and a wrong guess died silently one function
       away — after a person had already confirmed it. */
    .map(([type, a]) => ({ type, description: a.description, arguments: a.args || {},
      requiresConfirmation: a.confirmation }));
}

function prompt({ text, context = {}, priorMessages = [] } = {}) {
  const inFocus = context.object && context.object.kind === 'focus';
  return JSON.stringify({
    rule: 'Interpret intent only. Propose actions; never claim execution, permission, safety, confidence or visibility. Use no action when the person is only talking. Do not infer missing dates, targets, audiences, folder names or outcomes. You never author an identifier: the object and the evidence in view are already decided by what the person is looking at, and any id you write will be discarded.',
    journeyRule: inFocus
      ? 'This conversation is already inside a Focus. A changed tactic does not create a new Focus. Use update_focus only when the person deliberately revises this same commitment. Use create_focus only when they clearly choose a separate desired state; it leaves the current Focus and its history unchanged. If it is unclear whether revised B is the same commitment or a separate one, propose neither and ask that smallest clarification. You may question the starting assumption without rewriting any record.'
      : 'Do not manufacture a Focus merely because a tactic or option was discussed. A Focus is a desired state the person deliberately chooses.',
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

/* ── A LENGTH CAP THAT CANNOT CUT A CHARACTER IN HALF ─────────────────────────────────────────
   `slice` counts UTF-16 code units, and a character outside the Basic Multilingual Plane is two
   of them. Measured: a 302-code-unit topic whose 300th and 301st units are the halves of one
   character came back 300 long and ENDED IN A LONE SURROGATE (U+D840) -- half a character, which
   a browser renders as the replacement glyph and which stops being recoverable the moment
   anything writes it as UTF-8 bytes. It is somebody's own question, stored canonically, with a
   broken character on the end of it.

   That is the rare half of Han, the historic scripts, and anything else above U+FFFF. It costs
   one comparison to not do it: if the cap would land between the two halves, keep one character
   less.

   WHAT THIS DOES NOT CLAIM. This is the boundary where a person's relayed words become a
   proposal payload and then a canonical record, which is the one that matters most; the several
   `_s(v, n)` helpers across ai/* still cap by code unit, and this is not a repo-wide fix. */
function _cut(s, n) {
  if (s.length <= n) return s;
  const code = s.charCodeAt(n - 1);
  return s.slice(0, code >= 0xd800 && code <= 0xdbff ? n - 1 : n);
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
    /* FILTERED FROM THE ACTION'S OWN DECLARATION, which is the same one the model was shown.
       It used to be a hand-written union of every key any action might carry, which meant two
       things: the vocabulary was written in two places and could drift (it had — nothing told
       the model any of these names existed), and an argument belonging to one action rode along
       on every other. `relation` is accepted where it is declared and `evidenceRef` is accepted
       NOWHERE: the founder's law splits the proposal so the server supplies the identifiers and
       the model may suggest one of three words. Adding `evidenceRef` to the declaration -- the
       obvious one-line fix for the dead path -- would be exactly the thing the law forbids. */
    for (const key of Object.keys(ACTIONS[type].args || {})) {
      if (ARG_IS_LIST.has(key)) {
        if (Array.isArray(raw[key])) args[key] = [...new Set(raw[key].map(String))].slice(0, 20);
      } else if (typeof raw[key] === 'string' && raw[key].trim()) {
        args[key] = _cut(raw[key].trim(), key === 'because' ? 600 : 300);
      }
    }
    actions.push({ type, arguments: args, reason: String(row.reason || '').slice(0, 240), requiresConfirmation: ACTIONS[type].confirmation });
  }
  /* AND THE MODEL'S READING OF THE SENTENCE, BOUNDED TO TWO WORDS. Anything else — free text, a
     missing field, an older provider that has never heard of it — normalises to null, which is
     simply not a declaration. A field that could carry arbitrary text into `ground` would be a
     way for a model to talk its way past the commitment gate. */
  const intent = result && result.intent === 'stated' ? 'stated'
    : (result && result.intent === 'asked_about' ? 'asked_about' : null);
  return { actions, intent,
    needsClarification: typeof result?.needsClarification === 'string' ? result.needsClarification.slice(0, 300) : dropped };
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
      || /^\s*(why|what|who|whom|whose|when|where|which|how|should|shall|could|can|would|will|do|does|did|is|are|was|were|am|tell me|explain|show me)\b/i.test(t)
      // A question can begin with hesitation, not a question word: "I'm not sure can you
      // create the focus" was saved verbatim as a Focus on a phone. A pressed control is
      // intent to work, not permission to use a question as the commitment's wording.
      || /\b(?:can|could|would|will|should)\s+you\b|\b(?:i(?:'|’)?m|i am)\s+not\s+sure\s+(?:if|whether)\b|\bi\s+wonder\s+(?:if|whether)\b/i.test(t);
    /* ASKING FOR A FOCUS IN SO MANY WORDS IS THE PLAINEST INTENT THERE IS, and the first version
       of this list did not contain it. It had `start a focus` and `make this a focus` written out
       as two literals, so "Create a focus for recovery", "Set up a focus for recovery" and
       "New focus: recovery" — the three ways a coach is most likely to phrase it — fell through to
       the clarification and got asked what they wanted to change by a surface they had just told.
       Two hand-written literals where a family of phrasings exists is the same defect as two
       descriptions of one rule; the family is written once, here. */
    /* The determiner list carries POSSESSIVES as well as articles. Applying this gate to
       model-supplied text surfaced a phrase the family had always missed: "Make that my focus" is
       about as plain an instruction as exists, and it was refused, because `my` and `that` were
       not in the list. The suite caught it (CA3b), and the right answer was to widen the family
       rather than to relax the assertion — the product was wrong, not the test. */
    const _asksForAFocus = /\b(?:creat(?:e|ing)|set(?:ting)?\s*up|start(?:ing)?|mak(?:e|ing)|add(?:ing)?|new)\s+(?:this\s+|that\s+|it\s+|a\s+|an\s+|the\s+|another\s+|my\s+|our\s+)*focus\b/i;
    /* THE ENGLISH LIST SURVIVES AS THE MODELS-OFF FALLBACK, where it is the only signal there is,
       and is no longer the only way to declare intent. */
    const _statesIntent = t => _asksForAFocus.test(t)
      || /\b(work(?:ing)? on|focus on|commit to|i want to|i'?m going to|i am going to|i need to|i'?ll|let me|let'?s|going to try|try to|get better at|improve|practi[cs]e)\b/i.test(t);
    /* THE MODEL'S READING OF THE SENTENCE, bounded to one of two values and to nothing else. A
       missing or unrecognised value is simply not a declaration, so an older provider, a
       malformed reply or a models-off turn all fall back to the English list rather than to
       staging a commitment nobody made. */
    const _modelSaysStated = String((reading && reading.intent) || '') === 'stated';
    const _mayTakeWording = !_isQuestion(current)
      && (requested || _statesIntent(current) || _modelSaysStated);

    /* ── AND THE GATE APPLIES TO THE MODEL'S OWN WORDS, NOT ONLY TO THE FALLBACKS ──────────────
       This block used to sit ABOVE the gate and copied `raw.text` in unconditionally, so the
       three fallbacks below — each carefully guarded — only ever ran when the model supplied
       nothing. An independent review reported it and it reproduced exactly:

         "How can I improve recovery?"  + model text "improve recovery"  -> STAGED
         "Should I work on this?"       + model text "improve recovery"  -> STAGED
         "What changed?"                + model text "improve recovery"  -> STAGED

       The guard was in the one place the model never needed to go through. Worse, the first of
       those was labelled `user_stated`, because "improve recovery" is a substring of the question
       — so the provenance said the person had asked for a Focus they had only asked ABOUT.

       `create_focus` is the action that manufactures a commitment, so it is the one that has to
       ask. `discuss_with_group` still reaches a confirmation card that names the group.
       A pressed control still declares intent by itself, which is what `requested` carries. */
    if (raw.text && (action.type !== 'create_focus' || _mayTakeWording)) {
      args.text = raw.text;
      sources.text = stated(raw.text) ? 'user_stated' : 'model_suggested';
    }

    if (!args.text && ['create_focus', 'discuss_with_group'].includes(action.type)
        && /\b(this|that|it)\b/i.test(current)
        && (action.type === 'discuss_with_group' || _mayTakeWording)) {
      const antecedent = priorUser[priorUser.length - 1];
      if (antecedent) { args.text = antecedent.slice(0, 300); sources.text = 'user_stated_reference'; }
    }
    if (!args.text && action.type === 'create_focus' && current.trim()
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

    /* ── THE OUTCOME VOCABULARY IS THE BOUND FOCUS'S, NOT ONE OF THEM ──────────────────────
       This knew only the PERSONAL words. A personal focus asks whether it helped YOU; a GROUP
       focus asks what happened to the group, and `ai/team-state.js OUTCOME_RESULTS` is
       better / no_change / worse / unclear. The two were deliberately kept apart when the group
       vocabulary was introduced, and this owner was never told the second one existed.

       Driven at the kernel: a coach saying "it got better" about a team focus grounded nothing
       and was asked "did it help, not help, or was it mixed?" — the personal words, about a focus
       whose own screen offers the other four. So the product asked somebody to answer in a
       vocabulary it does not offer them, and the canonical group route would have refused the
       answer if they had given it.

       It REFUSED rather than mis-recording, which is the safe direction and is why this is a
       seam rather than a wound. The repair is to read which vocabulary the bound focus actually
       uses — a group focus carries a nodeId, which is the same thing every other reader keys on —
       and to require the person's own literal word either way. Nothing is inferred, no word is
       accepted that the person did not write, and the two vocabularies stay separate. */
    if (action.type === 'record_focus_outcome' && raw.outcome) {
      const outcome = String(raw.outcome);
      const _bound = (context && context.object) || {};
      const _isGroupFocus = _bound.kind === 'focus'
        && !!(_bound.nodeId || (_bound.raw && _bound.raw.nodeId));
      /* One literal test per word, in each vocabulary. A group focus never accepts "helped" and
         a personal one never accepts "no_change", because a word from the other grain is a word
         the canonical owner for THIS focus would reject. */
      const GROUP_WORDS = {
        better:    /\bgot better\b|\bwas better\b|\bimproved\b|\bbetter\b/i,
        no_change: /\bnothing changed\b|\bno change\b|\bthe same\b|\bunchanged\b/i,
        worse:     /\bgot worse\b|\bwas worse\b|\bworse\b/i,
        unclear:   /\btoo tangled\b|\bcan['’]?t tell\b|\bcannot tell\b|\bhard to tell\b|\bunclear\b/i,
      };
      /* THE VOCABULARY IS THE MEANINGS, AND A MEANING HAS MORE THAN ONE ORDINARY WORDING.
         The rule here is that the OUTCOME WORD MUST BE THE PERSON'S OWN — a model may not decide
         for somebody how it went. That rule is untouched. What was too narrow was the list of
         ways a person is allowed to have said each of the three things: "that didn't work" and
         "no real difference" are as plainly an outcome as "it didn't help", and both were
         refused. The founder named both as acceptance cases.

         This is not the intent layer and must not become it: three closed meanings, matched
         against what the person literally wrote, and anything outside them still asks. */
      const SELF_WORDS = {
        helped: /\b(helped|worked|made a difference)\b/i,
        mixed:  /\b(mixed|some days|hit and miss|on and off)\b/i,
        no:     /\b(?:did|has|have|had)\s*n[o’']?t\s+(?:really\s+)?(?:help|work)(?:ed)?\b|\bno\s+(?:real\s+)?(?:change|difference|improvement)\b|\bnothing\s+changed\b|\bsame\s+as\s+before\b/i,
      };
      const words = _isGroupFocus ? GROUP_WORDS : SELF_WORDS;
      const test = words[outcome];
      const explicit = !!test && test.test(current);
      if (explicit) { args.outcome = outcome; sources.outcome = 'user_stated'; }
      /* AND THE QUESTION OFFERS THE WORDS THAT FOCUS'S OWN SCREEN OFFERS. Asking a coach "did it
         help, not help, or was it mixed?" about a team focus invites an answer the route refuses. */
      else needsClarification = needsClarification || (_isGroupFocus
        ? 'What happened for the group after this focus: did it get better, did nothing change, did it get worse, or is it too tangled to tell?'
        : 'What happened with this focus: did it help, not help, or was it mixed?');
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

    /* ── WHICH DOCUMENT "THIS" IS ───────────────────────────────────────────────────────────
       FOUNDER DECISION, September 2026: "when there is exactly one safe referent, resolve it;
       when several are plausible, do not guess — ask the smallest clarification."

       This used to bind ONLY to `context.attachment`, the file uploaded in this very turn. So
       "use this as evidence", said three messages after attaching the report, resolved nothing,
       the required argument was missing, and the action was dropped in silence. The capability
       existed the whole time and could not be addressed.

       The pool is the server's — materials on the bound object or this conversation that this
       reader may actually read (`_composerActionMaterials`). Nothing here trusts an id: a model
       naming one that is not in the pool does not get a fallback to whatever else is lying
       around, because substituting a different document for the one somebody named is a worse
       failure than asking. It asks.

       THIS IS THE LANGUAGE-FREE HALF ON PURPOSE. Steps 1 and 3 read no words at all, so a Shona
       or Ndebele sentence the model understood resolves exactly as an English one does. Step 2
       matches a document's own title, which is whatever the person called their file — not a
       vocabulary this repo ships. */
    const attachment = context.attachment || null;
    if (action.type === 'attach_material') {
      const pool = [];
      const seen = new Set();
      for (const m of [...(attachment ? [attachment] : []), ...(context.materials || [])]) {
        const id = m && m.id != null ? String(m.id) : '';
        if (!id || seen.has(id)) continue;
        seen.add(id); pool.push({ id, name: String((m && m.name) || '') });
      }
      let picked = null;
      if (raw.materialId) {
        // 1 — NAMED, AND CHECKED. An id that is not in this reader's pool resolves to nothing.
        picked = pool.find(m => m.id === String(raw.materialId)) || null;
        if (!picked) needsClarification = needsClarification
          || 'I could not find that document here. Open it, or attach it again, and I can use it.';
      }
      if (!picked && !needsClarification) {
        // 2 — THEY NAMED THE FILE. One match is an answer; two is still a question.
        const named = pool.filter(m => currentHas(m.name));
        if (named.length === 1) picked = named[0];
        // 3 — EXACTLY ONE SAFE REFERENT.
        else if (!named.length && pool.length === 1) picked = pool[0];
        else if (pool.length > 1) {
          const names = pool.slice(0, 3).map(m => m.name).filter(Boolean);
          needsClarification = names.length > 1
            ? `Which one do you mean — ${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}?`
            : 'Which document do you mean?';
        } else if (!pool.length) {
          needsClarification = 'I do not have a document here to use. Attach it and I can.';
        }
      }
      if (picked) { args.materialId = picked.id; sources.materialId = 'deterministically_resolved'; }
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
      /* A FOLDER WITH NO NAME CANNOT BE CREATED, so it must not reach a card that says it can.
         Driving this action for the first time produced the whole sequence — offered, proposed,
         shown, CONFIRMED BY A PERSON — and then 400 "folder name required". Naming the argument
         in the schema is the fix at the model boundary; this is the defence behind it, and it is
         the same rule `create_focus` has carried since it was written: an action whose one
         argument is missing is not a weaker proposal, it is one that cannot be carried out. */
      : action.type === 'create_library_folder' ? ['folderName']
      : action.type === 'record_focus_outcome' ? ['outcome'] : [];
    if (required.some(k => !args[k])) continue;
    actions.push({ ...action, arguments: args, argumentSources: sources });
  }
  /* THE READING TRAVELS ON, because the sentence was read once and two places need to know what
     it was. `intent` is already the bounded two-value field the commitment gate uses; the turn
     handler needs the OTHER value of it — 'asked_about' — to know somebody is asking something
     when they asked it without a question mark in a language whose question words are not
     English. Dropping it here meant the model read the sentence, said what it read, and the
     answer began one function later with nothing but a `?` and an English word list. */
  return { actions, needsClarification, intent: (reading && reading.intent) || null };
}

module.exports = { ACTIONS, MODEL_SCHEMA, available, prompt, normalize, ground, readCommand,
  readAcceptance, resolveAcceptance };
