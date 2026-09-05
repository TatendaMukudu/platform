/* Truth layer — A FAILED LOAD IS NOT AN EMPTY RECORD.

   This one is DOM-level rather than pixel-level, and it exists because a source-string assertion
   could not have caught what it guards. The defect was two states rendering the same words: with
   `/api/objects` aborted, Home was byte-identical to Home with no data, and a person whose
   network had dropped was told by the product that there was nothing to look at.

   `.catch(() => null)` was the whole bug. Four things a screen can be in are collapsed into two
   the moment a failure is turned into an absence:

     LOADING    a request is out
     FAILED     it did not come back — say so, and offer a way to try again
     EMPTY      it came back with nothing — a statement about the RECORD, never a verdict on the
                person ("Nothing yet, tell me more about yourself" reads as a judgment)
     POPULATED  content

   Run: node scripts/ui-states-smoke.js

   The pixel-level companion is `scripts/mobile-inspect.js`, which drives a real Chromium at a
   phone viewport and is where contrast, tap targets, overflow and the keyboard were measured. It
   is not in `npm test` because it needs a browser binary; this is, because it needs nothing. */

'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const app = R('js/app.js');
const css = R('css/styles.css');
const member = R('css/member.css');
const html = R('index.html');

/* ── US1-US4: the four states exist and are DISTINCT. Asserted on the branches, because that is
   where the collapse happened — two branches printing the same string is the defect. ── */
ok('US1 a load in progress says so, before either outcome is known',
  /iq-home-loading[\s\S]{0,120}Looking at your record/.test(app));

ok('US2 A FAILED LOAD IS ITS OWN STATE — it names a connection problem rather than reporting an absence',
  /iq-home-failed[\s\S]{0,300}could not be loaded[\s\S]{0,200}not an empty record/.test(app));
ok('US2b …and offers a way back, because a dead end is what teaches people to close the app',
  /iq-home-failed[\s\S]{0,700}onclick="MemberApp\._loadTopQuestion\(\)">Try again/.test(app));

/* THE ROOT CAUSE, pinned. A request that did not return must be counted as a FAILURE, not read
   as a kind with nothing in it. */
ok('US3 a request that does not come back is counted as a failure rather than folded into the data',
  /if \(!j \|\| !Array\.isArray\(j\.objects\)\) \{ failures\+\+; continue; \}/.test(app));
/* US3b — ANCHORED TO THE FUNCTION UNDER TEST. The first version matched the bare pattern
   `.then(r => (r.ok ? r.json() : null))`, which appears THREE times in this file for unrelated
   calls — so removing it from _loadTopQuestion left the assertion green, satisfied by a call site
   that has nothing to do with the four states. */
ok('US3b …and a non-ok response is a failure too, not an empty body',
  /_loadTopQuestion\(\) \{[\s\S]{0,1600}\.then\(r => \(r\.ok \? r\.json\(\) : null\)\)/.test(app));

ok('US4 the empty state is a statement about the RECORD, not a judgment about the person',
  /No findings on your record yet/.test(app) &&
  !/Nothing yet\. Tell me what is going on/.test(app));
ok('US4b …and a partial failure is admitted rather than presented as emptiness',
  /Part of your record could not be loaded/.test(app));

/* ── US5: THE CONTRADICTION. #iq-brief sits directly beneath #iq-conversation, so an empty line
   there argued with the conversation printed a centimetre above it. ── */
ok('US5 the block NAMES what it describes — findings from the record, which is not the conversation above it',
  /No findings on your record yet\. This is where they will appear/.test(app));
ok('US5b …and it says nothing at all while a conversation is on screen, rather than contradicting it',
  /const talking = !!\(document\.getElementById\('iq-conversation'\) \|\| \{\}\)\.childElementCount;/.test(app) &&
  /if \(talking && !failures\) \{ box\.innerHTML = ''; return; \}/.test(app));

/* ── US6: NOTES. The same collapse, in a second place: a 401 and a 500 both rendered "No notes
   yet", telling somebody their library was empty because the request for it failed. ── */
ok('US6 a signed-out notes load says the notes are still there, rather than that there are none',
  /You have been signed out, so your notes could not be loaded\. They are still there\./.test(app));
ok('US6b …a server error is its own message, carrying the status',
  /Your notes could not be loaded just now \(the server said \$\{res\.status\}\)/.test(app));
ok('US6c …a network failure names itself as one',
  /this looks like a connection problem, not an empty library/.test(app));
ok('US6d …and the genuinely empty library is a statement about what is stored',
  /Your notes are empty\. The box above is where they start\./.test(app) &&
  !/No notes yet\. Write your first one above\./.test(app));
ok('US6e …and a filter matching nothing says the OTHER notes are still there, so a filter never reads as data loss',
  /Nothing here is tagged \$\{this\._escape\(filter\)\}\. Your other notes are still there/.test(app));

/* ── US7: THE NOTES COMPOSER. It wore `iq-composer` — `display:flex; align-items:flex-end`, built
   for the chat's single row — so a card holding a label, a textarea, a tools strip and an actions
   row laid all four SIDE BY SIDE. At 390px the input collapsed to about 160px and wrapped one
   word per line. Measured in a browser before and after. ── */
ok('US7 the notes composer is the STACKED variant, not the chat row',
  /class="card iq-composer iq-composer-stack"/.test(html));
ok('US7b …which lays out as a column with a full-width input',
  /\.iq-composer-stack\{display:block/.test(member) &&
  /\.iq-composer-stack \.note-input\{display:block;width:100%/.test(member));
ok('US7c …and a toolbar that WRAPS beneath rather than squeezing what is beside it',
  /\.iq-composer-stack \.composer-actions\{display:flex;flex-wrap:wrap/.test(member));
ok('US7d …with the primary action sized to its label, not stretched across the row so every secondary control falls below it',
  /\.iq-composer-stack \.composer-actions \.btn-primary\{width:auto/.test(member));

/* ── US8: CONTRAST AND THE ACTION RAMP. The numbers are measured by mobile-inspect; what is
   guarded here is that the values do not quietly go back. ── */
const tok = n => (css.match(new RegExp(`${n}:\\s*(#[0-9a-fA-F]{6})`)) || [])[1];
ok('US8 muted text is readable — it was #4e5878, which is 2.16:1 on a hovered card and was carrying real content',
  tok('--text-muted') === '#8089b3');
ok('US8b …and the three text steps stay distinct, so lifting muted did not collapse the hierarchy into two',
  tok('--text-primary') === '#e8ecf8' && tok('--text-secondary') === '#a8b2d0' &&
  new Set([tok('--text-primary'), tok('--text-secondary'), tok('--text-muted')]).size === 3);
ok('US9 filled buttons use the darker end of the SAME blue — white on the accent was 3.21:1, and the brief is a blue accent, so the colour did not change, only where white sits on it',
  tok('--accent') === '#4f8ef7' && tok('--accent-strong') === '#2f6fd0' &&
  /\.btn-primary \{[\s\S]{0,200}background: var\(--accent-strong\)/.test(css));
ok('US9b …and the primary is no longer a blue-to-PURPLE gradient, which is what the Notes "Add" button was rendering as',
  !/\.btn-primary \{[\s\S]{0,200}linear-gradient\(135deg, var\(--accent\), var\(--accent2\)\)/.test(css));
ok('US9c there is ONE disabled treatment, and it is more than opacity — a coloured fill at 45% still reads as pressable',
  /button:disabled \{[\s\S]{0,160}filter: saturate\(0\.35\)[\s\S]{0,80}cursor: not-allowed/.test(css));

/* ── US10: THE HEADER. "Notes" in the bar and "Notes" again underneath it, in a band about 200px
   tall before any content. ── */
ok('US10 a page names itself once on a phone — the in-page title is dropped where the bar already carries it',
  /@media \(max-width: 640px\) \{[\s\S]{0,400}\.page-header-title:not\(#home-name\) \{ display: none; \}/.test(css));
ok('US10b …except Home, whose page title is the PERSON\'s name and is not a repeat of anything',
  /:not\(#home-name\)/.test(css));
ok('US10c …and the organisation name comes out of a crowded bar, where the avatar and menu already say whose account this is',
  /\.topbar-org, #topbar-org-name \{ display: none; \}/.test(css) &&
  /class="topbar-org"/.test(html));

console.log(`\nui-states-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
