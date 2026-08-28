/* Truth layer — REACHABILITY. Nothing may be built and then quietly become unreachable.

   `scripts/deadcode-scan.js` reports zero dead functions and is correct — it checks FUNCTIONS.
   An orphaned route is a live function: its handler is referenced by `app.get(...)`, so it looks
   alive to a function-level scanner while being unreachable to every actual user.

   That is precisely how the leader's outcome loop lost its caller. POST /api/intelligence/act,
   /outcome and /notice-feedback each had a working handler, a passing test, and no caller
   anywhere in the front end. The Confidence Engine simply stopped receiving feedback and nothing
   went red.

   THE RULE THIS ENFORCES: no NEW orphans. Not "zero orphans" — the sweep found 92 of 298 routes
   already unreachable and pretending otherwise would make this suite fail on day one and get
   deleted. The known set is frozen below as recorded debt. Anything outside it must be reachable
   from the front end, exercised by a test, or declared backend-only with a reason.

   Run: node scripts/reachability-smoke.js */

'use strict';
const fs = require('fs'), path = require('path');
const R = f => { try { return fs.readFileSync(path.join(__dirname, '..', f), 'utf8'); } catch (_) { return ''; } };

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.log('  FAIL', n); } };

/* Routes that legitimately have no front-end caller. Each needs a REASON, not just an entry —
   an allow-list without reasons becomes a place to hide things. */
const BACKEND_ONLY = new Map(Object.entries({
  '/api/webhooks/:code/:connId': 'inbound from a third party',
  '/api/oauth/callback': 'inbound redirect',
  '/api/health': 'infrastructure probe',
  '/api/admin/access-log': 'operator tooling',
  '/api/admin/errors': 'operator tooling',
  '/api/admin/metrics': 'operator tooling',
  '/api/admin/persistence': 'operator tooling',
  '/api/admin/llm-mode': 'operator tooling',
  '/api/admin/backfill-canonical': 'one-off migration',
  '/api/admin/checkin-classification-audit': 'one-off audit',
  '/api/admin/checkin-reconciliation': 'one-off migration',
  '/api/auth/delete-user': 'operator tooling',
  '/api/auth/load-sample': 'operator tooling',
  '/api/platform/update-org-mode': 'operator tooling',
  '/api/platform/org-results': 'operator tooling',
  '/api/platform/member-results': 'operator tooling',
  '/api/platform/org-checkins': 'operator tooling',
  '/api/delivery/unsubscribe': 'reached from an email link, not the app',
  '/api/identity/reresolve': 'operator tooling',
}));

/* KNOWN DEBT — unreachable today, recorded so the count cannot grow silently.

   This is not an allow-list. It is a bill. Every entry is a feature that was built and never
   surfaced, and `docs/ttd/duplication-sweep.md` §B names the ones that matter — the safeguarding
   lead's queue above all, because a flag is routed to somebody with no screen to see it on. */
const KNOWN_ORPHANS = new Set([
  '/api/actions', '/api/actions/:id', '/api/actions/:id/approve', '/api/actions/:id/draft',
  '/api/actions/:id/evaluate', '/api/actions/:id/execute', '/api/actions/:id/observe',
  '/api/actions/:id/reject', '/api/actions/propose',
  '/api/artifact/render', '/api/assessments/draft', '/api/assessments/self/:id',
  '/api/assistant/answer-feedback', '/api/assistant/checkin-proposals', '/api/assistant/opening',
  '/api/assistant/remember', '/api/calendar', '/api/checkin/me/intelligence',
  '/api/connectors/manifest', '/api/delivery/preview', '/api/delivery/test',
  '/api/failures', '/api/failures/:id/dismiss', '/api/failures/:id/retry',
  '/api/identity/review', '/api/inquiry/recommendations', '/api/intelligence/success',
  '/api/intelliq/intervention/:id', '/api/kernel/coreasoning', '/api/knowledge/health',
  '/api/mappings/awaiting', '/api/me/actions', '/api/me/actions/:id/approve',
  '/api/me/actions/:id/reject',
  '/api/me/sources/contribute', '/api/me/sources/pull', '/api/member/checkin', '/api/member/join',
  '/api/notes/pinned', '/api/org-context/import/preview', '/api/org-context/role-bindings',
  '/api/org-state', '/api/org/divisions', '/api/org/profile', '/api/permissions',
  '/api/policies/evaluate', '/api/proactive/preferences', '/api/reason/brief', '/api/reason/me',
  '/api/reason/understand', '/api/report/person/:userId',
  '/api/self/observe',
  '/api/signals/import', '/api/signals/import-csv', '/api/signals/recent', '/api/signals/sources',
  '/api/weekly/member', '/api/weekly/org', '/api/weekly/synthesis',
  '/api/workspace/briefing', '/api/workspace/classify', '/api/workspace/group-health',
  '/api/workspace/history', '/api/workspace/items', '/api/workspace/today',
]);

const server = R('server.js');
const FRONT_FILES = ['js/app.js', 'js/member-view.js', 'js/auth.js', 'js/chat.js', 'js/data.js',
  'js/ui.js', 'js/tree.js', 'js/attachments.js', 'js/scenarios.js', 'js/charts.js', 'index.html'];
const front = FRONT_FILES.map(R).join('');

const routes = [...new Set((server.match(/app\.(?:get|post|patch|put|delete)\(\s*'([^']+)'/g) || [])
  .map(m => m.replace(/^.*'([^']+)'.*$/, '$1')))].sort();

const reachable = r => { const base = r.split(':')[0].replace(/\/$/, ''); return base.length > 5 && front.includes(base); };

console.log('\n  ROUTE REACHABILITY');
ok(`every route is reachable, backend-only, or recorded debt (${routes.length} routes)`, (() => {
  const surprises = routes.filter(r => !reachable(r) && !BACKEND_ONLY.has(r) && !KNOWN_ORPHANS.has(r));
  if (surprises.length) {
    console.log('\n    NEW ORPHANS — built, and nothing calls them:');
    surprises.forEach(r => console.log('      ' + r));
    console.log('\n    Give it a caller, give it a test, or add it to BACKEND_ONLY with a reason.');
    console.log('    Do NOT add it to KNOWN_ORPHANS — that set is frozen debt, not a parking space.\n');
  }
  return surprises.length === 0;
})());

// The debt must SHRINK. If a route on the bill becomes reachable, take it off the bill — otherwise
// the list stops describing reality and stops being worth reading.
{
  const nowReachable = [...KNOWN_ORPHANS].filter(r => reachable(r));
  if (nowReachable.length) {
    console.log('\n    These are on the debt list but now have a caller — remove them from KNOWN_ORPHANS:');
    nowReachable.forEach(r => console.log('      ' + r));
  }
  ok('the debt list still describes reality', nowReachable.length === 0);
}

// Every entry on the allow-list must state WHY, so it cannot become a hiding place.
ok('every backend-only route carries a reason', [...BACKEND_ONLY.values()].every(v => v && v.length > 8));

/* THE LOOP THAT ALREADY BROKE ONCE. Named individually rather than left to the general check,
   because this is the outcome loop the pilot exists to test and it went unreachable silently. */
console.log('\n  THE LEADER OUTCOME LOOP — named, because it broke before');
for (const r of ['/api/intelligence/act', '/api/intelligence/outcome', '/api/intelligence/notice-feedback']) {
  ok(`${r} is declared and reachable from the UI`,
    server.includes(`app.post('${r}'`) && front.includes(`fetch('${r}'`));
}

/* Likewise the surfaces built most recently — the ones with the least habit around them. */
console.log('\n  RECENT SURFACES');
ok('the team surface is reachable', front.includes('/api/group/mine') && front.includes('/state'));
ok('the open question is reachable', front.includes('/api/inquiry/lead'));
/* D30 — the front end must RENDER the kernel's sentences, not assemble its own. A renderer that
   builds prose from raw fields is how one object came to read differently on every surface. */
ok('the lead question renders the composed explanation, not hand-built prose',
  front.includes('lead.explained') && front.includes('wouldChangeMyMind'));

console.log(`\nreachability-smoke: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
