/* Truth layer — PILOT CRACKDOWN.

   Every assertion here corresponds to something a real person hit on a real iPhone against the
   deployed product. They are grouped by the defect they prevent returning, not by module, because
   the thing worth guarding is the experience rather than the file.

   Run: node scripts/pilot-crackdown-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const fs = require('fs'), path = require('path');
const A = require('../ai/composer-actions.js');
const S = require('../server.js');
const { _loadAllStores, _rebuildEmailIndex, _durableUnits, _metricRecord, _migrateLegacyMetrics, orgMetrics } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { let v = false; try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };
const R = f => { try { return fs.readFileSync(path.join(__dirname, '..', f), 'utf8'); } catch (_) { return ''; } };
/* COMMENTS ARE NOT CODE. Four assertions in the first run of this suite went red against prose in
   the very comments explaining the fix -- one matched the word "mood" inside a sentence promising
   not to read moods, and two matched a comment quoting the old email claim verbatim. An assertion
   a comment can break is an assertion a comment can also satisfy. Anything testing BEHAVIOUR reads
   the decommented source; only assertions about documentation read the raw file. */
const decomment = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const APP = decomment(R('js/app.js'));
const APP_RAW = R('js/app.js');
const ACTIONS_SRC = decomment(R('ai/composer-actions.js'));
const SERVER = decomment(R('server.js'));

/* ══ A — A QUESTION IS NOT A COMMITMENT ══════════════════════════════════════════════════════
   Live: the founder asked "Why is this the thing worth looking at, and what is it resting on?"
   and was offered a Focus titled with that sentence. Seven ordinary questions did the same in
   every object context. */
console.log('\n  A — A QUESTION NEVER BECOMES A FOCUS');
const ctx = kind => ({ object: { kind, id: 'q1', label: 'Recovery between games' },
  folders: [], groups: [], contacts: [] });
const propose = (text, kind = 'inquiry', requested = false, prior = []) => {
  const c = ctx(kind);
  return A.ground(A.normalize({ actions: [{ type: 'create_focus', arguments: {}, reason: 'r' }] }, c),
    { text, priorMessages: prior, context: c, requested });
};
const titled = r => (r.actions[0] && r.actions[0].arguments && r.actions[0].arguments.text) || null;

const QUESTIONS = ['Why is this the thing worth looking at, and what is it resting on?', 'Why this?',
  'What is this resting on?', 'Tell me more', 'What changed?', 'Who can see this?', 'Should I work on this?'];

ok('PX-A1 not one of the seven live questions produces a Focus, in ANY object context',
  ['inquiry', 'focus', 'high', 'low'].every(k => QUESTIONS.every(q => titled(propose(q, k)) === null)));
ok('PX-A2 …and no untitled Focus is proposed instead — the action is dropped, not weakened',
  QUESTIONS.every(q => propose(q).actions.length === 0));
ok('PX-A3 …the person is told what WOULD start one, rather than met with silence',
  /say what you would want to change/i.test(String(propose('Why this?').needsClarification || '')));
/* The other coercion path: "Should I work on this?" contains "this", and the antecedent branch
   would have lifted the PREVIOUS turn into the title. */
ok('PX-A4 …and a question containing "this" does not lift the previous turn into a Focus title',
  titled(propose('Should I work on this?', 'inquiry', false, [{ role: 'user', text: 'my first touch is poor' }])) === null);

console.log('\n  A — BUT REAL INTENT STILL WORKS');
ok('PX-A5 a stated intention still starts a Focus',
  titled(propose('I want to work on my first touch under pressure')) === 'I want to work on my first touch under pressure'
  && !!titled(propose('Let me start a focus on sleep before away games')));
/* "Work on this" on an object thread stages the action and then asks what to change; the answer
   is a bare noun phrase with no marker and no question mark. Pressing the control IS the
   declaration, so that path must not be caught by the guard above. */
ok('PX-A6 …and the control path still accepts a bare noun phrase, because the press declared intent',
  titled(propose('Sharper first touch under pressure', 'inquiry', true)) === 'Sharper first touch under pressure');
ok('PX-A7 …which the model-proposed path does NOT, so the guard is doing the work',
  titled(propose('Sharper first touch under pressure', 'inquiry', false)) === null);
/* ── AND THE GATE MUST COVER THE MODEL'S OWN WORDS ────────────────────────────────────────────
   Every assertion above passes `arguments: {}`, so all of them exercise the FALLBACK path — the
   one that manufactures a title when the model supplied none. An independent review pointed out
   that the model usually does supply one, and that `raw.text` was copied in above the gate, so
   the guard sat in the one place the model never had to pass through. Reproduced: every question
   below staged a Focus as soon as the model proposed a title for it, and the first was even
   labelled `user_stated`, because "improve recovery" is a substring of the question that only
   ASKED about recovery.

   `proposeWithModelText` drives `normalize()` on a model reply that carries text, exactly as the
   real path does, rather than reaching into `ground()` with a hand-built object. */
const proposeWithModelText = (text, modelText, kind = 'inquiry', requested = false) => {
  const c = ctx(kind);
  return A.ground(A.normalize({ actions: [{ type: 'create_focus', arguments: { text: modelText }, reason: 'r' }] }, c),
    { text, priorMessages: [], context: c, requested });
};
ok('PX-A12 a question does not stage a Focus just because the model supplied a title for it',
  ['How can I improve recovery?', 'Should I work on this?', 'What changed?', 'Why this?']
    .every(q => titled(proposeWithModelText(q, 'improve recovery')) === null));
ok('PX-A13 …the action is dropped rather than staged untitled, in every object context',
  ['inquiry', 'focus', 'high', 'low'].every(k =>
    proposeWithModelText('How can I improve recovery?', 'improve recovery', k).actions.length === 0));
ok('PX-A14 …but a stated intention still takes the model\'s title',
  titled(proposeWithModelText('I want to work on my first touch', 'first touch under pressure'))
    === 'first touch under pressure');
ok('PX-A15 …and a pressed control still does, because the press was the declaration',
  titled(proposeWithModelText('Sharper first touch', 'Sharper first touch', 'inquiry', true))
    === 'Sharper first touch');
/* The gate is for the action that manufactures a commitment. An Inquiry opens a question rather
   than a promise, so it is deliberately not narrowed here — asserted so that narrowing it later
   is a decision somebody makes on purpose. */
ok('PX-A16 create_inquiry is NOT narrowed by this gate — it opens a question, not a commitment',
  (() => {
    /* Deliberately NOT ctx('inquiry'): create_inquiry is not offered on an object that already IS
       an inquiry, so normalize drops it and the assertion would have passed against a surface
       that refuses everything -- the empty-fixture lie. It is offered on a Focus, so that is
       where this is asked. Verified: available(ctx('focus')) contains create_inquiry. */
    const c = ctx('focus');
    if (!A.available(c).map(a => a.type).includes('create_inquiry')) return false;
    const r = A.ground(A.normalize({ actions: [{ type: 'create_inquiry', arguments: { text: 'what changed in recovery' }, reason: 'r' }] }, c),
      { text: 'What changed?', priorMessages: [], context: c });
    return r.actions.length === 1 && r.actions[0].arguments.text === 'what changed in recovery';
  })());
ok('PX-A8 the guard reads sentence SHAPE, not sentiment — no lexicon of moods or directions',
  !/\b(worried|anxious|struggl|negative|positive|sentiment|mood|frustrat)\b/i.test(ACTIONS_SRC));

/* ── AND THE GUARD MUST NOT REFUSE THE PLAINEST REQUEST THERE IS ────────────────────────────────
   The first version of the guard listed `start a focus` and `make this a focus` as two hand-written
   literals. So it refused "Create a focus for recovery" — a coach asking for a Focus in the most
   direct words available was answered by a surface asking them what they wanted to change. The
   guard was doing exactly what it was written to do and was still wrong, which is why these are
   asserted from the phrasing side rather than from the regex. */
const ASKS = ['Create a focus for recovery', 'Set up a focus for recovery', 'New focus: recovery',
  'Setting up a focus on sleep', 'Add a focus for nutrition', 'Make this a focus',
  'Start a focus on set pieces', 'Create focus for away travel'];
ok('PX-A9 asking for a Focus in so many words starts one, in every phrasing a coach would use',
  ASKS.every(t => titled(propose(t)) === t));
ok('PX-A10 …and the same words in a QUESTION still do not, so the guard is not simply weakened',
  ['What should I create a focus for?', 'How do I create a focus?', 'Should I make this a focus?',
    'Can you set up a focus?', 'Which focus should I add?'].every(q => titled(propose(q)) === null));
/* PX-A9b EXISTS BECAUSE PX-A9 COULD NOT BITE ON THE ANCHOR. A gate mutation anchored the family
   to `^`, so only a sentence STARTING with the request would be taken — and every phrasing in
   PX-A9 starts with it, so nothing went red. People do not always open with the verb. */
ok('PX-A9b …including when the request is not the first thing in the sentence',
  ['I would like to create a focus for recovery', 'Actually, create a focus for recovery',
    'Please set up a focus for sleep', 'Right, new focus: recovery'].every(t => titled(propose(t)) === t));
/* PX-A9c — THE POSSESSIVE FORM. Applying the gate to model-supplied text surfaced a phrase the
   family had always missed: "Make that my focus" was refused, because `my` and `that` were not in
   the determiner list. Only CA3b in composer-actions-smoke caught it, so it is pinned here too,
   beside the rest of the phrasings a coach actually uses. */
ok('PX-A9c …and when the determiner is a possessive rather than an article',
  ['Make that my focus', 'Make this my focus', 'Make it my focus', 'Make this our focus']
    .every(t => titled(propose(t)) === t));
ok('PX-A11 …and a sentence merely CONTAINING the word focus is not a request to create one',
  titled(propose('My focus has been all over the place lately')) === null
  && titled(propose('That focus is finished')) === null);

/* ══ B — METRICS HAVE ONE SHAPE ══════════════════════════════════════════════════════════════
   Live: Settings showed "1 undefined / 2 undefined / 3 undefined / 4 undefined". */
console.log('\n  B — A METRIC IS A RECORD, NOT A STRING');
ok('PX-B1 the canonical record carries the four fields the routes look things up by',
  (() => { const m = _metricRecord('Training Load', 0);
    return m && m.metricId && m.name === 'Training Load' && m.source === 'org' && m.order === 0; })());
ok('PX-B2 …the id is DERIVED from the name, so it is identical across seed, server and restart',
  _metricRecord('Training Load').metricId === _metricRecord({ name: 'Training Load' }).metricId);
ok('PX-B3 …an existing id is never rewritten, so nothing referencing a metric loses it',
  _metricRecord({ metricId: 'met_original', name: 'Sleep' }).metricId === 'met_original');
ok('PX-B4 …and an empty name is not a metric', _metricRecord('  ') === null && _metricRecord({ name: '' }) === null);
/* PX-B5 and PX-B6 USED TO READ SOURCE, and an independent audit was right to call them false
   greens: one matched a literal `.map(` in the seed and the other a literal
   `const metric = _metricRecord({ name, source }` in server.js. Both passed while renaming a
   metric returned HTTP 500. A line of code existing is not that line running, and neither
   assertion would have survived a rename that changed nothing.

   What replaces them is behavioural and lives in scripts/metric-lifecycle-smoke.js, which drives
   the routes. What stays HERE is the one property that is genuinely about the shape of the
   repository rather than the behaviour of a request: that there is exactly ONE implementation of
   metric identity. Two copies of a hash cannot be caught by exercising either one of them. */
ok('PX-B5 nothing outside the canonical owner mints a metric id',
  ['server.js', 'scripts/seed-alma.js', 'js/app.js'].every(f => !/met_['"`+ ]|'met_'\s*\+/.test(decomment(R(f))))
  && /met_/.test(R('ai/metric-record.js')));
ok('PX-B6 …and no second djb2 hash was copied out of it to derive one',
  ['scripts/seed-alma.js', 'js/app.js'].every(f => !/5381/.test(decomment(R(f)))));

/* PX-B6b — THE SAME OWNERSHIP QUESTION, FOR TREE NODES, and it needs its own assertion for the
   reason the metric one does. A gate mutation replaced the importer's call to `_addTreeNode` with
   a FAITHFUL re-implementation — same id prefix, same fields, same duplicate scan — and every
   behavioural assertion stayed green, correctly, because the behaviour was identical. Behaviour
   tests cannot see a second owner on the day it is written; they see it on the day the two copies
   drift, which is too late. One place mints a node id, and this is what says so. */
/* The first version of this counted the literal `'nd_' + generateId()`, spaces and all — so a copy
   written `'nd_'+generateId()` slipped straight past it, which the gate mutation proved. Counting
   an exact spelling is the vacuous-regex lie wearing a different hat. Any concatenation of the
   prefix with anything is what gets counted now. */
const MINTS_NODE_ID = /(['"`]nd_['"`]\s*\+)|(\+\s*['"`]nd_)|(`nd_\$\{)/g;
ok('PX-B6b exactly one place in the server mints an Org Tree node id, however it is spelled',
  (SERVER.match(MINTS_NODE_ID) || []).length === 1);
ok('PX-B6c …and it is inside the canonical owner, not in a route or an importer',
  (() => {
    const owner = SERVER.slice(SERVER.indexOf('function _addTreeNode(code,'));
    const body  = owner.slice(0, owner.indexOf('\napp.post('));
    return body.length > 200 && new RegExp(MINTS_NODE_ID.source).test(body);
  })());
ok('PX-B7 the SETTINGS renderer can never print "undefined" at a person, whatever shape reaches it',
  (() => {
    // Scoped to the one renderer that showed it. `${m.name}` is correct elsewhere, on paths fed
    // by routes that already guarantee the shape; asserting across the whole file said nothing
    // about the defect and failed against unrelated correct code.
    const fn = APP.slice(APP.indexOf('async function renderMetricsSettings()'),
                         APP.indexOf('function renderAddMetric()'));
    return fn.length > 200 && /Unnamed metric/.test(fn) && !/\$\{m\.name\}/.test(fn);
  })());

console.log('\n  B — AND THE MIGRATION IS IDEMPOTENT');
orgMetrics.__crackdown_legacy = ['Training Load', 'Sleep'];
orgMetrics.__crackdown_clean = [_metricRecord('Minutes', 0)];
const repaired = _migrateLegacyMetrics();
const legacyAfter = JSON.stringify(orgMetrics.__crackdown_legacy);
ok('PX-B8 legacy strings already in the database are repaired in place', repaired >= 2
  && orgMetrics.__crackdown_legacy.every(m => m && m.metricId && m.name));
ok('PX-B9 …to the SAME ids the seed would produce — one rule, not two',
  orgMetrics.__crackdown_legacy[0].metricId === _metricRecord('Training Load').metricId);
ok('PX-B10 …a second run changes nothing, so restarts do not churn identities',
  (_migrateLegacyMetrics(), JSON.stringify(orgMetrics.__crackdown_legacy) === legacyAfter));
delete orgMetrics.__crackdown_legacy; delete orgMetrics.__crackdown_clean;

/* ══ C — THE AUDIENCE CHIP ═══════════════════════════════════════════════════════════════════
   Live: "Coaching staff · Alma College Men's Soccer1" — a bare reach count with no unit, glued
   to the group name by a span carrying no margin. */
console.log('\n  C — A COUNT SAYS WHAT IT COUNTS');
const CHIP = APP.slice(APP.indexOf('async _renderAudiences('), APP.indexOf('_pickAudience(id, i) {'));
ok('PX-C1 the reach is never rendered as a bare integer beside the name',
  !/\$\{esc\(a\.reaches\)\}<\/span>/.test(CHIP));
ok('PX-C2 …it is parenthesised and carries its own noun, singular or plural',
  /\(\$\{esc\(a\.reaches\)\} \$\{a\.reaches === 1 \? 'person' : 'people'\}\)/.test(CHIP));
ok('PX-C3 …which is the form the route that produces the field already documents',
  /\(2 people\)/.test(R('server.js')));
ok('PX-C4 …and a group legitimately named with a number is untouched — the name is still escaped whole',
  /\$\{esc\(a\.label\)\}/.test(CHIP));

/* ══ D — NO NATIVE BROWSER DIALOGS ON THE PILOT PATH ═════════════════════════════════════════
   Live: naming a Library folder, and correcting a proposal, both opened a browser prompt. On a
   phone that reads as the browser interrupting rather than as IntelliQ asking. */
console.log('\n  D — THE PRODUCT ASKS, NOT THE BROWSER');
ok('PX-D1 naming a Library folder no longer opens a native prompt',
  !/prompt\('Name this folder'\)/.test(APP));
ok('PX-D2 …it opens the same .iq-field inline row the rest of the product uses — no second modal system',
  /iq-shelf-newfolder/.test(APP) && /iq-field-input/.test(APP) && /_createShelfFolder/.test(APP));
ok('PX-D3 …and the field has somewhere to render, or the control would do nothing',
  /id="iq-shelf-newfolder"/.test(R('index.html')));
ok('PX-D4 correcting a proposal no longer opens a native prompt',
  !/window\.prompt\(/.test(APP));
ok('PX-D5 …it opens inside the proposal card, and still reaches the one correction route',
  /iq-correct-box/.test(APP) && /_sendCorrection/.test(APP)
  && /turn\/\$\{turnId\}\/correct/.test(APP));
/* PX-D6b — THE LAST ONE. "I acted on this" on a Priority Office card opened `prompt()` to collect
   a sentence that then became a stored record: the same defect as the two above, on a leader
   surface the pilot exercises, and the reason PX-D6 had to be scoped to MemberApp to pass. */
ok('PX-D6b acting on a flag no longer opens a native prompt either',
  (() => {
    const fn = APP.slice(APP.indexOf('function intelAct(memberId'),
                         APP.indexOf('async function _intelActSave('));
    return fn.length > 200 && !/(^|[^.\w])prompt\(/.test(fn)
      && /iq-field-input/.test(fn) && /_intelActSave\(/.test(fn);
  })());
ok('PX-D6c …and the note still reaches the one route that records it',
  /\/api\/intelligence\/act/.test(APP)
  && APP.indexOf('async function _intelActSave(') < APP.indexOf('/api/intelligence/act'));
/* PX-D6d — ROLE BINDING RETIRED, founder decision. The Team Readiness control opened a native
   prompt and asked for a member's USER ID, which nobody knows: the last native input prompt in
   the product, and a control with no path to a correct answer. Retired rather than replaced with
   a member picker, which would be a feature rather than a pilot correction. The ROUTE survives —
   it is a real confirmed mutation with history, and other code reads its bindings. */
ok('PX-D6d the role-binding control and its prompt are gone, not just hidden',
  !/trBindPrompt/.test(APP_RAW) && !/Bind \$\{_escAdvisor\(x\.roleRef/.test(APP_RAW));
ok('PX-D6e …leaving no dead handler behind, because nothing still calls it',
  !/onclick="trBindPrompt/.test(APP_RAW));
ok('PX-D6f …and the route it used is untouched, so nothing that reads bindings broke',
  /app\.post\('\/api\/org-context\/role-binding'/.test(SERVER) && /function _bindRole\(/.test(SERVER));
ok('PX-D6g NO native input prompt survives anywhere in the client, on any surface',
  (() => {
    const files = ['js/app.js', 'js/tree.js', 'js/ui.js', 'js/chat.js', 'js/data.js', 'js/auth.js'];
    return files.every(f => !/(^|[^.\w])prompt\s*\(/.test(decomment(R(f))));
  })());
ok('PX-D6 nothing on the member pilot path calls prompt() at all any more',
  (() => {
    // The member surface is MemberApp; the remaining two prompts are in leader/admin tooling.
    const member = APP.slice(APP.indexOf('const MemberApp'));
    return !/(^|[^.\w])prompt\(/.test(member);
  })());

/* ══ E — THE INVITE CLAIM ════════════════════════════════════════════════════════════════════
   Live: a card offering to "Send personalised email invites" above a panel admitting delivery is
   not active. Nothing in this repository sends email. */
console.log('\n  E — THE PRODUCT DOES NOT CLAIM TO SEND EMAIL');
ok('PX-E1 there is genuinely no email provider, client or send path anywhere',
  (() => {
    const files = [SERVER, decomment(R('db.js')), R('package.json'), APP];
    return !files.some(src => /nodemailer|sendgrid|postmark|mailgun|@aws-sdk\/client-ses|smtp|resend\.emails/i.test(src));
  })());
ok('PX-E2 …so no surface promises to send one', !/Send personalised email invites/.test(APP));
ok('PX-E3 …and what it actually does is what it says: it creates links',
  /Create one invite link per email address/.test(APP));
ok('PX-E4 …stated plainly rather than in a parenthetical afterthought',
  /IntelliQ does not send the email/.test(APP));

/* ══ E2 — A BATCH SAYS WHAT HAPPENED TO EVERY ROW ═══════════════════════════════════════════
   The email-invite panel pushed a result only `if (data.ok)` and swallowed every thrown request
   in an empty catch. Paste ten addresses, have nine refused, and the screen showed one link under
   a heading about sharing them: the nine simply never appeared. */
console.log('\n  E — AND A BATCH REPORTS ITS FAILURES');
const BATCH = APP.slice(APP.indexOf('async function _submitEmailInvites()'),
                        APP.indexOf('async function _createJoinLink()'));
/* The first version of PX-E5 asserted only that `failures.push(` appeared somewhere in the
   function. Deleting the `else` branch that records a REFUSAL left it green, because the catch
   branch that records a thrown REQUEST still matched — the second call site trap, exactly as
   PROTOCOL describes it. Both branches are pinned separately now: a refusal and a network failure
   are two different ways to lose a row and each needs its own record. */
ok('PX-E5 a row the server REFUSED is recorded with the reason it gave',
  BATCH.length > 400 && /else failures\.push\(\{ email, reason: data\.error/.test(BATCH));
ok('PX-E5b …and a row whose request THREW is recorded too, rather than silently skipped',
  /catch\s*\(e\)\s*\{\s*failures\.push\(/.test(BATCH) && !/catch\s*\(e\)\s*\{\s*\/\*/.test(BATCH));
ok('PX-E6 …the count rendered is created-out-of-attempted, so a partial batch cannot read as whole',
  /of \$\{emails\.length\}/.test(BATCH));
ok('PX-E7 …every failed address is rendered with its reason',
  /failures\.map\(/.test(BATCH) && /f\.reason/.test(BATCH));
ok('PX-E8 …failed addresses stay in the box and succeeded ones do not, so a resubmit cannot double a link',
  /box\.value = failures\.map/.test(BATCH));
/* ── AND THE ONE THE PREVIOUS ROUND BROKE WHILE FIXING ITS SERVER ───────────────────────────────
   `bulk-import` was corrected to stop returning `ok: true` over failed rows. The client's
   `if (!data.ok) throw new Error(data.error || 'Import failed')` then turned that correction into
   the opposite lie: a three-row file with one bad address created two real accounts and the
   screen said "Import failed" — no counts, no failed row, and no roster refresh, because the
   throw skipped it. Nothing tested this function, so it went green through CI.

   The behavioural proof is in scripts/onboard-browser-check.js (section D), which drives the real
   `_submitImport`. That suite needs a browser and is deliberately not in `npm test`, so this pins
   the same law hermetically: the whole-request refusal is what throws, never the per-row report. */
const IMPORTFN = APP.slice(APP.indexOf('async function _submitImport()'),
                           APP.indexOf('async function _submitEmailInvites()'));
ok('PX-E9c a partial import is a per-row REPORT, so only a refused request throws',
  IMPORTFN.length > 400 && /if \(!res\.ok\)/.test(IMPORTFN)
  && !/if \(!data\.ok\)/.test(IMPORTFN));
ok('PX-E9c2 …and a tree conflict says plainly that nothing was imported, which the rollback makes true',
  /409/.test(IMPORTFN) && /Nothing was imported/.test(IMPORTFN));
ok('PX-E9d …the count says how many of how many, and every failed row is rendered with its reason',
  /of \$\{data\.total \?\? _importRows\.length\} imported/.test(IMPORTFN)
  && /failed\.map\(/.test(IMPORTFN) && /f\.reason/.test(IMPORTFN));
ok('PX-E9e …and the roster is refreshed whatever the per-row outcome was',
  IMPORTFN.indexOf('loadRealOrgData') > IMPORTFN.indexOf('failed.map('));

/* The same pattern, in a second place, found while checking for mutation residue: adding
   AI-suggested metrics counted only successes and toasted "success" whatever happened. */
ok('PX-E9b the metric bulk-add says how many of how many, and names what was refused',
  (() => {
    const fn = APP.slice(APP.indexOf('async function _addSuggestedMetrics()'),
                         APP.indexOf('async function _addSuggestedMetrics()') + 1400);
    return fn.length > 300 && /refused\.push\(/.test(fn) && /of \$\{names\.length\}/.test(fn)
      && !/catch\(e\) \{ \}/.test(fn);
  })());
ok('PX-E9 …and an address is escaped before it is written into the page',
  /_escHtml\(r\.email\)/.test(BATCH) && /_escHtml\(f\.email\)/.test(BATCH)
  && !/\$\{r\.email\}/.test(BATCH));

/* ══ E3 — ADD MEMBER NEVER LOSES AN ACCOUNT IT JUST MADE ════════════════════════════════════
   Two writes with no transaction between them: create the account, then place them in the tree.
   The second used to `throw`, so a compare-and-set conflict replaced the whole panel with "The
   organisation tree changed. Reload and try again." The account existed. No invite link had been
   minted, so there was nothing to share, and filling the form in again hit "An account with this
   email already exists" — the dormant-account dead end, reached through a different door. */
console.log('\n  E — AND ADD MEMBER TELLS THE TRUTH ABOUT A PARTIAL SUCCESS');
const ADDP = APP.slice(APP.indexOf('async function _submitAddPerson()'),
                       APP.indexOf('async function _assignMemberToNode('));
ok('PX-E10 a failed placement no longer throws away the account that was just created',
  ADDP.length > 400 && !/throw new Error\(treeData\.error/.test(ADDP)
  && /assignError/.test(ADDP));
ok('PX-E11 …the invite link is still minted, so there is something to hand the person',
  ADDP.indexOf('assignError') < ADDP.indexOf('/api/auth/invite'));
ok('PX-E12 …the screen names the unit that was not joined and offers that step again on its own',
  /Retry placement/.test(APP) && /_retryAddMemberAssignment/.test(APP));
ok('PX-E13 …and the toast does not say "added" over a placement that did not happen',
  /placement still pending/.test(ADDP));
const ASSIGN = APP.slice(APP.indexOf('async function _assignMemberToNode('),
                         APP.indexOf('async function _retryAddMemberAssignment('));
ok('PX-E14 the retry is idempotent: somebody already in the node is left alone, not added twice',
  /currentIds\.includes\(userId\)/.test(ASSIGN));
ok('PX-E15 …and it re-reads the tree first, because a stale revision is what caused the conflict',
  /OrgTree\.load\(\)/.test(ASSIGN) && /ifRev: node\.rev/.test(ASSIGN));
ok('PX-E16 the node picker is only offered to somebody who may write the tree',
  /Auth\.canDo\('manage_tree'\)/.test(APP.slice(APP.indexOf('function _openOnboardSection('),
                                                 APP.indexOf('function _openOnboardSection(') + 1400)));

/* Explicit permission grants must be a MAP, not an array — that assertion needs the seed built,
   which is asynchronous, so it lives in scripts/metric-lifecycle-smoke.js (section F) where there
   is an async context to await it in. Written here first, it would have handed `ok()` a Promise,
   which is truthy whatever it resolves to: a green that could never go red. */

/* ══ E5 — SETTINGS MAY NOT CLAIM CAPABILITIES THE PRODUCT DOES NOT HAVE ══════════════════════
   Live, the founder read a Settings panel headed "Active Features" listing, under green ticks:
   Full IntelliQ, Real-time monitoring, Behavioural trend analysis, Wellness alerts, AI development
   plans, External data integration, Mandated reporter tools, Advanced analytics, and Complete
   security. None of it was checked against anything. It came from a client-side constant selected
   by a "Platform Grade" the SERVER HAS NO NOTION OF -- `switchGrade` set a variable in the browser,
   re-rendered, and toasted "Switched to A-Grade Platform" for a change that never left the page.

   "Complete security" is the one that must never be printed under any circumstances. It was
   printed with a tick beside it. */
console.log('\n  E — AND SETTINGS DOES NOT CLAIM CAPABILITIES THAT DO NOT EXIST');
/* DECOMMENTED, INCLUDING HTML COMMENTS. The first run of these five went red against the very
   comments explaining the removal -- the same trap the header of this file describes, met again by
   the person who wrote the warning. `decomment` handles JS; an HTML comment needed stripping too,
   because index.html now carries a note saying what the panel used to claim. */
const _deHtml = t => String(t).replace(/<!--[\s\S]*?-->/g, ' ');
const CLIENT_SRC = decomment(APP_RAW) + decomment(R('js/data.js')) + decomment(R('js/ui.js'))
  + decomment(_deHtml(R('index.html')));
ok('PX-E18 the nine tier claims are gone from every client source',
  ['Real-time monitoring', 'Behavioral trend analysis', 'Behavioural trend analysis',
   'Wellness alerts', 'AI development plans', 'External data integration',
   'Mandated reporter tools', 'Advanced analytics']
    .every(claim => !new RegExp(claim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(CLIENT_SRC)));
ok('PX-E19 …and "Complete security" appears nowhere, which is the one that can never be earned',
  !/Complete security/i.test(CLIENT_SRC));
ok('PX-E20 the platform-grade tier system is gone: no constant, no switcher, no badge',
  !/PLATFORM_GRADES\s*=/.test(CLIENT_SRC) && !/function switchGrade/.test(CLIENT_SRC)
  && !/function gradeBadgeHTML/.test(CLIENT_SRC));
ok('PX-E21 …and no surface prints a letter grade as a verdict, on an organisation or on a person',
  !/-Grade/.test(CLIENT_SRC));
/* PX-E22 FIRST MATCHED THE DEFINITION, NOT THE CALL -- PROTOCOL's first lie, and deleting the call
   from renderSettings left it green. It now requires renderSettings to actually call it.

   REWRITTEN AGAIN, September 2026, and worth saying why rather than quietly re-spelling it. The
   middle clause matched the literal `fetch('/api/health'` -- a PROXY for "the panel asks the
   server at render time", which is the actual law. The panel now asks through MemberApp._read,
   the app's one bounded reader, so the proxy went stale while the law it stood for held. The
   proxy is replaced with the law, tightened: the read must happen INSIDE _renderRealCapabilities
   (the old clause would have been satisfied by a fetch anywhere in a 12,000-line file) and it
   must be a live read of /api/health by either transport. Nothing has been relaxed -- a constant
   in place of the read still fails, and now so does a read that moved out of the panel. */
const _capPanel = APP.slice(APP.indexOf('async function _renderRealCapabilities('),
  APP.indexOf('async function _renderBuildLine('));
/* THE 600-CHARACTER WINDOW WENT STALE, September 2026, for a legitimate reason: Settings was
   split into three tiers (You / Organisation / Platform) and the host capability panel now lives
   in the superadmin tab, so renderSettings reaches it through
   `if (_maySeeSettingsTab('platform')) _renderRealCapabilities();` rather than as a bare call in
   the first few lines. The window was measuring PROXIMITY, which was never the law.

   The law has two halves and both are asserted directly: renderSettings must REACH the panel, and
   the panel must perform a LIVE READ rather than render a constant. Widened where it was an
   artefact, tightened where it matters — the read must be inside the panel, not anywhere in a
   twelve-thousand-line file. */
const _settingsFn = APP.slice(APP.indexOf('function renderSettings(){'),
  APP.indexOf('const _POLICY_COLOR'));
ok('PX-E22 what Settings shows instead is read from the server at render time, not from a constant',
  _settingsFn.length > 200 && /_renderRealCapabilities\(\)/.test(_settingsFn)
  && _capPanel.length > 400
  && /(MemberApp\._read|fetch)\(\s*'\/api\/health'/.test(_capPanel)
  && /not a plan or a tier/.test(APP_RAW));
ok('PX-E23 …and it can say OFF, which a list of ticks had no way to express',
  /\$\{on \? 'ON' : 'OFF'\}/.test(APP_RAW));

/* ══ F — PERSISTENCE STAYS BOUNDED ═══════════════════════════════════════════════════════════
   Not a live defect: a guard against returning to the whole-platform blob that put the database
   at 92% of its monthly transfer allowance. */
console.log('\n  F — A WRITE COSTS WHAT IT CHANGED');
ok('PX-F1 split persistence is the default, not an opt-in somebody has to remember',
  /PERSISTENCE_MODE = \['split', 'dual', 'main'\]\.includes\(process\.env\.PERSISTENCE_MODE\)\s*\n\s*\? process\.env\.PERSISTENCE_MODE : 'split'/.test(SERVER));
ok('PX-F2 startup reads durable UNITS, not the legacy blob',
  /const loaded = await db\.loadStores\(\{ withRevisions: true \}\)/.test(SERVER));
ok('PX-F3 …and the legacy blob is a FUNCTION, so a healthy start never pays for it',
  /const loadLegacyBlob = async \(\) => \{/.test(SERVER)
  && /await _reconstruct\(loadLegacyBlob\)/.test(SERVER));
ok('PX-F4 a save writes only units whose content HASH changed',
  /if \(_saveHashes\.get\(key\) !== h\) \{\s*\n\s*changed\[key\] = value;/.test(SERVER));

/* ══ G — ONBOARDING, FROM CODEX'S INDEPENDENT AUDIT ══════════════════════════════════════════
   Six findings were reported; five were reproduced here against this branch before anything was
   changed, and each assertion below pins the fix for one of them. The sixth — that invite
   authority depended on node leadership — was a founder decision rather than a defect, and has
   since been decided: the canonical `edit_members` permission, never a position in the tree. It
   is asserted in scripts/onboard-invite-smoke.js section F, where the other authority laws live. */
console.log('\n  G — CSV IS PARSED, NOT SPLIT');
const CSVROWS = (() => {
  const b = APP_RAW.slice(APP_RAW.indexOf('function _parseCSVRows(text) {'));
  const rows = b.slice(0, b.indexOf('\nfunction _parseCSV(text)'));
  const p2 = b.slice(b.indexOf('function _parseCSV(text)'));
  const fn = p2.slice(0, p2.indexOf('\n}\n') + 3);
  const _rows = new Function('return ' + rows)();
  return { rows: _rows, parse: new Function('_parseCSVRows', 'return ' + fn)(_rows) };
})();
ok('PX-G1 a quoted comma no longer shifts every column after it',
  (() => { const r = CSVROWS.parse('name,email,role\n"Lovelace, Ada",ada@example.com,member')[0];
    return r && r.name === 'Lovelace, Ada' && r.email === 'ada@example.com' && r.role === 'member'; })());
ok('PX-G2 …plain rows are unchanged',
  (() => { const r = CSVROWS.parse('name,email,role\nAda Lovelace,ada@example.com,member')[0];
    return r && r.name === 'Ada Lovelace' && r.email === 'ada@example.com'; })());
ok('PX-G3 …and a doubled quote inside a quoted field is one literal quote',
  (CSVROWS.parse('name,email\n"She said ""hi""",e@x.io')[0] || {}).name === 'She said "hi"');
ok('PX-G4 the parser is a scanner, not a split on commas',
  !/line\.split\(','\)/.test(APP) && /function _parseCSVRows/.test(APP));

console.log('\n  G — A SPREADSHEET IS UNTRUSTED INPUT');
ok('PX-G5 every preview cell and header is escaped before it reaches innerHTML',
  (() => { const prev = APP.slice(APP.indexOf('async function _previewImportFile()'),
                                 APP.indexOf('function _parseCSVRows'));
    return /_escHtml\(k\)/.test(prev) && /_escHtml\(v\|\|''\)/.test(prev)
      && !/\$\{k\}<\/th>/.test(prev) && !/\$\{v\|\|''\}<\/td>/.test(prev); })());
ok('PX-G6 …including the parse-error message, which also came from the file',
  /_escHtml\(e\.message\)/.test(APP));

console.log('\n  G — THE PICKER OFFERS ONLY WHAT IT CAN READ');
ok('PX-G7 the file input no longer advertises a format onboarding cannot parse',
  /id="ob-import-file" accept="\.csv"/.test(APP_RAW));
ok('PX-G8 …a workbook chosen anyway is refused with a sentence, never parsed as text',
  /cannot be imported yet/.test(APP) && /\(xlsx\|xls\)\$/.test(APP));
ok('PX-G9 …and no surface still claims XLSX import works',
  !/Upload a CSV or XLSX/.test(APP_RAW) && !/<strong>XLSX<\/strong>/.test(APP_RAW));

console.log('\n  F — AND THE PILOT ORGANISATION IS SMALL');
(async () => {
  const { buildAlmaStore, ALMA_CODE } = require('./seed-alma.js');
  const { store } = await buildAlmaStore();
  _loadAllStores(store); _rebuildEmailIndex();
  const units = _durableUnits();
  const sizes = Object.entries(units).map(([k, v]) => [k, Buffer.byteLength(JSON.stringify(v), 'utf8')]);
  const total = sizes.reduce((n, [, b]) => n + b, 0);
  const biggest = sizes.sort((a, b) => b[1] - a[1])[0];

  /* A COLD START READS EVERY UNIT. That is the honest shape of the current design, and for one
     pilot organisation it is small. The number is pinned so that if it ever stops being small,
     this goes red before a bill does. 512 KB is generous headroom over the measured 110 KB. */
  ok(`PX-F5 a cold start reads the whole store, and the whole store is small (${(total / 1024).toFixed(0)} KB)`,
    total > 0 && total < 512 * 1024);
  ok(`PX-F6 …and no single unit dominates it (largest ${(biggest[1] / 1024).toFixed(0)} KB)`,
    biggest[1] < total * 0.75);
  ok('PX-F7 …the store is partitioned per organisation, so a second org cannot enlarge the first',
    Object.keys(units).filter(k => k.split(':').length === 3).every(k => k.split(':')[2] === ALMA_CODE || k.split(':')[2] === '_'));
  ok('PX-F8 …and the seed produces metrics that need no migration on arrival',
    (() => { const before = JSON.stringify(orgMetrics[ALMA_CODE]); _migrateLegacyMetrics();
      return JSON.stringify(orgMetrics[ALMA_CODE]) === before; })());

  console.log(`\npilot-crackdown-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('  FAIL suite threw:', e && e.stack); process.exit(1); });
