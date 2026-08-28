#!/usr/bin/env node
'use strict';

/* The safeguarding queue is intentionally a thin reader of an already-governed API. These
   assertions pin the frontend wiring without creating a second detector, ranker or access rule.
   Each case was mutation-tested against the named production line (see the delivery report). */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const reachability = fs.readFileSync(path.join(root, 'scripts/reachability-smoke.js'), 'utf8');

let passed = 0;
let failed = 0;
function check(name, condition) {
  if (condition) { passed++; console.log('  PASS', name); }
  else { failed++; console.log('  FAIL', name); }
}

const nav = app.slice(app.indexOf('const NAV_ROUTES'), app.indexOf('function navigate'));
const navGate = app.slice(app.indexOf('async function _addSafeguardingNav'), app.indexOf('const IQPush'));
const queue = app.slice(app.indexOf('async function renderSafeguardingQueue'), app.indexOf('/* ── ALERT COMPOSE FLOW'));
const orphanSet = reachability.slice(reachability.indexOf('const KNOWN_ORPHANS'), reachability.indexOf('const server'));

check('S1 safeguarding is a real route with a real page container',
  /safeguarding:\s*\(\)\s*=>\s*renderSafeguardingQueue\(\)/.test(nav) && /id="page-safeguarding"/.test(html));
check('S2 navigation is added only after config names this reader as the lead',
  navGate.includes("fetch('/api/safeguarding/config'") && navGate.includes('config.isLead !== true') && navGate.includes("navigate('safeguarding')"));
check('S3 the queue reads flags and organisation resources through their governed APIs',
  queue.includes("fetch('/api/safeguarding/flags'") && queue.includes("fetch('/api/safeguarding/config'"));
check('S4 a direct non-lead visit fails closed without rendering flag content',
  queue.includes('flagsResponse.status === 403') && queue.includes('available only to the designated safeguarding lead'));
check('S5 open flags are placed before resolved flags without severity re-ranking',
  queue.includes("flags.filter(flag => flag.status === 'open')\n      .concat(flags.filter(flag => flag.status === 'resolved'))"));
check('S6 the lead card renders identity, time, detector severity/category, excerpt and resources',
  ['flag.subjectName', 'flag.at', 'flag.severity', 'flag.category', 'flag.excerpt', 'config.resources', 'resource.contact'].every(token => queue.includes(token)));
check('S7 resolution posts the optional bounded note to the existing route',
  queue.includes('maxlength="500"') && queue.includes('/api/safeguarding/flags/${encodeURIComponent(button.dataset.flagId)}/resolve') && queue.includes('JSON.stringify({ note })'));
check('S8 all three newly reachable routes are removed from frozen orphan debt',
  !orphanSet.includes("'/api/safeguarding/config'") && !orphanSet.includes("'/api/safeguarding/flags'") && !orphanSet.includes("'/api/safeguarding/flags/:id/resolve'"));

console.log(`\nsafeguarding-screen-smoke: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
