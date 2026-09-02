#!/usr/bin/env node
'use strict';

/* Wiring contract for the self-scoped answerability screen. The server owns subject selection,
   projection and audit semantics; the browser may only render those governed responses. */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const app = read('js/app.js');
const html = read('index.html');
const server = read('server.js');
const reachability = read('scripts/reachability-smoke.js');

let passed = 0;
let failed = 0;
function check(name, condition) {
  if (condition) { passed++; console.log('  PASS', name); }
  else { failed++; console.log('  FAIL', name); }
}

const nav = app.slice(app.indexOf('const NAV_ROUTES'), app.indexOf('function navigate'));
const topbar = app.slice(app.indexOf('function renderTopbar'), app.indexOf('async function _addSafeguardingNav'));
/* The slice started at renderMyData, but the record RENDERER (_answerabilityRecords) is defined
   above it — so the assertion meant to stop a raw JSON dump could not see the function doing the
   dumping. Verified by mutation: reinstating the <pre> left this suite green. It now starts at
   the helper. */
const screen = app.slice(app.indexOf('const _CONFIDENCE_WORDS'), app.indexOf('/* ── ALERT COMPOSE FLOW'));
const orphanSet = reachability.slice(reachability.indexOf('const KNOWN_ORPHANS'), reachability.indexOf('const server'));
/* D21 moved the sentence to its ONE home, ai/safeguarding.SAFETY_EXCEPTION, and serves it on
   GET /api/safeguarding/config. This assertion therefore got STRONGER, not looser: it used to
   compare two hardcoded literals and pass as long as they matched, which meant two copies of a
   safety promise were acceptable so long as somebody kept them in step. It now requires that
   the client hold no copy at all. */
const sgModule = read('ai/safeguarding.js');
const ownedSentence = (sgModule.match(/const SAFETY_EXCEPTION = '([^']+)'/) || [])[1];

check('A1 My data is a real route with a real page',
  /'my-data':\s*\(\)\s*=>\s*renderMyData\(\)/.test(nav) && html.includes('id="page-my-data"'));
/* Whitespace-insensitive: the previous form pinned a literal newline and six spaces, so
   reformatting turned this red for a reason that was not behaviour. Same claim, same mutation
   sensitivity — permission-gate the entry or drop it from ACCOUNT_LINKS and it still goes red. */
check('A2 every authenticated person gets the account-menu entry without a management permission',
  /const PERSONAL\s*=\s*\[\s*\{\s*id:\s*'my-data'/.test(topbar)
  && /const ACCOUNT_LINKS\s*=\s*\[\s*\.\.\.PERSONAL,\s*\.\.\.SETUP\s*\]/.test(topbar)
  && !/PERSONAL[\s\S]{0,80}Auth\.canDo/.test(topbar));
check('A3 the screen can request only the authenticated caller, never a supplied subject',
  screen.includes("fetch('/api/me/data', { headers: Auth._headers() })") && !/subjectId|userId|\/api\/report\/person|leader-facing/.test(screen));
/* The headings changed when this screen was rewritten for people rather than for me: "What we
   hold" became "What IntelliQ thinks about you". What must not change is that all three
   questions are still answered, so this pins the SECTIONS BY THEIR SUBSTANCE rather than by
   their wording — a rename is a product decision, a missing section is a regression. */
check('A4 the screen still answers all three questions: what is held, who looked, who I speak to',
  /What IntelliQ thinks about you|What we hold/.test(screen)
  && screen.includes('Who has looked') && screen.includes('Who I speak to')
  && screen.includes('held.reads') && screen.includes('accessTrail') && screen.includes('audienceData'));

/* A5 used to require `held.myNotes`, a section retired with the notes concept. Its real point
   was that this screen reads from ONE authenticated response and derives nothing of its own —
   and to that I have added the failure the founder actually hit: it rendered
   JSON.stringify(item, null, 2) in a <pre>, so the one screen whose job is to make a person
   feel safe was the least readable in the product. A page you cannot read is not transparency,
   it is the appearance of it. */
check('A5 the reads come from the one response, and no raw record is dumped on the person',
  screen.includes('held.reads')
  && !/JSON\.stringify\(item/.test(screen)
  && !/<pre/.test(screen));
/* The "it knows me" surface. /api/self/patterns and /api/self/:habitId/feedback were both built
   and both orphaned — a private model of how somebody works, that the person could not see and
   could not refuse. Rendering the kernel's PATTERN KEY would be a leak of internal vocabulary,
   so the sentence is composed here and the key never reaches a screen. */
check('A5b what IntelliQ has learned about you is shown, refusable, and never shows a raw pattern key',
  screen.includes("fetch('/api/self/patterns'")
  && app.includes("/api/self/${encodeURIComponent(habitId)}/feedback")
  && ['accept', 'dismiss', 'reject'].every(r => app.includes(`data-response="${r}"`))
  && app.includes('_SELF_PATTERN_TEXT')
  // The key must not be RENDERED. Asserting it is absent from the source would be wrong — the
  // lookup table has to contain it — so this asserts the renderer goes through the translator
  // and never interpolates the raw pattern into markup.
  && screen.includes('_selfPatternText(h.pattern)')
  && !/\$\{_?escHtml\(h\.pattern\)\}|\$\{h\.pattern\}/.test(screen));
check('A6 the access trail comes from that response and renders only its content-free fields',
  screen.includes('held.accessTrail') && ['entry.actor', 'entry.action', 'entry.at', 'entry.basis'].every(field => screen.includes(field)));
check('A7 audiences come from the self-scoped endpoint and the D21 exception is SERVED, not copied',
  screen.includes("fetch('/api/me/audiences', { headers: Auth._headers() })")
  // The sentence exists exactly once, in the module that owns the duty of care.
  && !!ownedSentence && ownedSentence.includes('safeguarding lead is told')
  // The server serves it from that home rather than re-typing it.
  && /safetyException: safeguarding\.SAFETY_EXCEPTION/.test(server)
  // The client fetches it and holds no copy of its own. A literal here again fails this.
  && screen.includes("fetch('/api/safeguarding/config'")
  && !app.includes('a safeguarding lead is told. That is the one case'));
check('A8 download uses the self-scoped export as a file',
  screen.includes("fetch('/api/me/export', { headers: Auth._headers() })") && screen.includes("link.download = 'intelliq-my-data.json'"));
check('A9 no general evidence-withdrawal affordance was invented', !/withdraw/i.test(screen));
check('A10 all three answerability routes left frozen orphan debt',
  !['/api/me/data', '/api/me/export', '/api/me/audiences'].some(route => orphanSet.includes(`'${route}'`)));

console.log(`\nanswerability-screen-smoke: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
