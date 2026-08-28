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
const screen = app.slice(app.indexOf('async function renderMyData'), app.indexOf('/* ── ALERT COMPOSE FLOW'));
const orphanSet = reachability.slice(reachability.indexOf('const KNOWN_ORPHANS'), reachability.indexOf('const server'));
const serverSentence = (server.match(/const safetyException = '([^']+)'/) || [])[1];
const screenSentence = (app.match(/const ANSWERABILITY_SAFEGUARDING_EXCEPTION = '([^']+)'/) || [])[1];

check('A1 My data is a real route with a real page',
  /'my-data':\s*\(\)\s*=>\s*renderMyData\(\)/.test(nav) && html.includes('id="page-my-data"'));
check('A2 every authenticated person gets the account-menu entry without a management permission',
  topbar.includes("const PERSONAL = [\n      { id: 'my-data'") && topbar.includes('const ACCOUNT_LINKS = [...PERSONAL, ...SETUP]'));
check('A3 the screen can request only the authenticated caller, never a supplied subject',
  screen.includes("fetch('/api/me/data', { headers: Auth._headers() })") && !/subjectId|userId|\/api\/report\/person|leader-facing/.test(screen));
check('A4 the screen names all three answerability sections',
  ['What we hold', 'Who has looked', 'Who I speak to'].every(label => screen.includes(label)));
check('A5 the subject-view reads, private habits and own notes come directly from the one response',
  ['held.reads', 'held.workingHabits', 'held.myNotes'].every(field => screen.includes(field)));
check('A6 the access trail comes from that response and renders only its content-free fields',
  screen.includes('held.accessTrail') && ['entry.actor', 'entry.action', 'entry.at', 'entry.basis'].every(field => screen.includes(field)));
check('A7 audiences come from the self-scoped endpoint and carry the exact D21 exception',
  screen.includes("fetch('/api/me/audiences', { headers: Auth._headers() })") && serverSentence && screenSentence === serverSentence);
check('A8 download uses the self-scoped export as a file',
  screen.includes("fetch('/api/me/export', { headers: Auth._headers() })") && screen.includes("link.download = 'intelliq-my-data.json'"));
check('A9 no general evidence-withdrawal affordance was invented', !/withdraw/i.test(screen));
check('A10 all three answerability routes left frozen orphan debt',
  !['/api/me/data', '/api/me/export', '/api/me/audiences'].some(route => orphanSet.includes(`'${route}'`)));

console.log(`\nanswerability-screen-smoke: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
