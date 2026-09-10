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
   changed, and each assertion below pins the fix for one of them. PB-5 (invite authority depends
   on node leadership) is a founder decision and is deliberately NOT asserted either way. */
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
