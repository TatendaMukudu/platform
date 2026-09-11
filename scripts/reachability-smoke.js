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
  '/api/groups/create': 'the Groups UI was retired in September 2026 (the tree is the one structure). The routes and their stores stay for orgs that already have groups, and group-model-owner-smoke + cross-org-isolation-http-smoke still exercise this one; removing the subsystem is its own piece of work, not a side effect of hiding a tab.',
  '/api/platform/assign-scenario': 'assessments and scenarios were taken OUT of the pilot in September 2026 (founder decision) and their eight pages were cut, which removed this route\'s only caller. The subsystem itself stays and stays tested — endpoint-smoke, workspace-assessment-smoke and assessment-consumption-smoke all still exercise it — because taking a surface out of a pilot is not the same act as deleting a capability, and conflating the two is how a decision about one week becomes a decision about the product.',
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
  '/api/library/from-chat': 'FOUNDER DECISION, September 2026: there is one user-facing product called Library and it is the shelf, which indexes live governed objects BY REFERENCE. This route is the old one\'s copy-taking act — it flattened a live conversation into a second record that sat beside it and drifted from it with no way to tell which you were reading. Its caller is gone and the control that used to invoke it now files a reference through POST /api/library/shelf. The route and everything anybody already saved through it are deliberately untouched: retiring a surface is not the same act as deleting somebody\'s records, and doing both in the week before a pilot is how records are lost. Removing the subsystem is its own piece of work, after the pilot.',
  '/api/objects/focus/:id/evidence-relation': 'the DIRECT half of the founder\'s September 2026 declared-relation law (supports / undermines / unclear), and it is BACKEND-ONLY IN BOTH DIRECTIONS TODAY. An earlier version of this entry claimed the model-suggested half was already reachable because declare_focus_relation is a registered composer action. That was wrong, and reproducing it is what found the defect: composer-actions normalize() retains a fixed list of argument keys which does not include `relation` or `evidenceRef`, so a proposal reaches the confirm branch carrying neither and the canonical owner refuses it. Registration is not reachability. Completing that path means deciding what evidence identifiers a model may be shown in order to name ONE piece of evidence, which is a disclosure decision and not a UI question, so it is written up in docs/reviews/PRIORITY_SURFACE_R1.md as a founder decision rather than guessed at here. The direct route works, is exercised including its refusals by priority-office-attention-smoke, and is the control a focus screen will use.',
  '/api/identity/reresolve': 'operator tooling',
  '/api/objects/:kind/:id/related': 'the cross-evidence reader, September 2026. It DOES reach people -- the composer assembles the same neighbourhood server-side through _crossEvidenceContext, so "why did we create this focus" and "did it help" are answerable in conversation -- but no screen fetches it. It was declared reachable until 10 September only because the prefix test above could not tell it apart from its neighbours; this entry is the correction, not a new state of affairs.',
  '/api/objects/:kind/:id/priority': 'the DIRECT half of the personal attention override, September 2026. The screen deliberately does NOT call it: the verdict on an object thread stages `prioritise_object` through beginObjectAction, so a button does not own a mutation and confirmation still crosses the one dispatcher, exactly as Keep and Settled do. Both doors end at the same canonical owner, _setPersonalPriority. This route is the explicit control for a caller that has no conversation to go through, and priority-closure-smoke exercises it including its refusals.',
}));

/* EXPOSED WHEN THE PREFIX HOLE WAS CLOSED, 10 September 2026.

   These are NOT new orphans and they are NOT in KNOWN_ORPHANS, which is frozen debt from the
   original sweep and must not become a parking space. They are routes the old prefix test was
   silently passing: nothing in the front end mentions their final segment, verified one by one.

   They are recorded separately, dated, so the two facts stay distinguishable — what the September
   sweep found, and what the guard itself was hiding. Nobody has decided what to do with them;
   deciding is its own piece of work and is not a side effect of fixing a regex. The list may
   shrink. It must not grow: a route added here after today is a new orphan wearing an old coat. */
const PREFIX_HOLE_ORPHANS = new Set([
  '/api/connections/:id/cursor/reset', '/api/connections/:id/health', '/api/connections/:id/inspect',
  '/api/connections/:id/pause', '/api/connections/:id/resume',
  '/api/evidence/:id/reject', '/api/evidence/:id/reverse',
  '/api/mappings/:id/activate', '/api/mappings/:id/approve', '/api/mappings/:id/edit',
  '/api/mappings/:id/reject', '/api/mappings/:provider/rollback',
  '/api/notes/:noteId/pin', '/api/notes/:noteId/share', '/api/notes/:noteId/unpin',
  '/api/notes/:noteId/unshare',
  '/api/org-context/:id/supersede',
]);

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
/* js/voice.js was missing from this list, so anything only voice.js calls read as unreachable and
   anything voice.js is the sole caller of could not be seen at all. Every client file, or the
   guard is measuring a subset and calling it the product. */
const FRONT_FILES = ['js/app.js', 'js/auth.js', 'js/chat.js', 'js/data.js',
  'js/ui.js', 'js/tree.js', 'js/attachments.js', 'js/scenarios.js', 'js/charts.js',
  'js/voice.js', 'index.html'];
const front = FRONT_FILES.map(R).join('');

/* ── EXPOSED BY CLOSING THE TAIL HOLE, 11 September 2026 ────────────────────────────────────
   Tightening `reachable` (the tail must now follow the prefix inside one quoted URL) revealed
   routes the looser rule had been passing on a stranger's words. Two separate accidents were
   doing it: `/health` in `/api/connections/:id/health` was satisfied by an unrelated call to
   `/api/health`, and every `/api/group/:nodeId/...` route was satisfied because `/api/group` is a
   PREFIX OF `/api/groups`, which the client calls constantly.

   These are NOT in KNOWN_ORPHANS, which this file says is frozen debt rather than a parking
   space. They are a dated, counted set with a different meaning: each one needs a decision, and
   the count must not grow. The most consequential are named in the report --
   `/api/group/:nodeId/focus` and `/api/group/:nodeId/inquiry` have no client caller at all, which
   means group-level Focus and Inquiry creation is server-side only and the node half of the A->B
   loop is reachable by nothing a person can tap. */
const TAIL_HOLE_EXPOSED = new Set([
  '/api/assessments/:id/ask', '/api/assessments/:memberId/presentation',
  '/api/assessments/templates/:id/stage', '/api/checkin/:memberId/intelligence',
  '/api/connections/:id/mapping', '/api/evidence/:id/audience', '/api/evidence/:id/resolve',
  '/api/group/:nodeId/focus', '/api/group/:nodeId/focus/:focusId/outcome',
  '/api/group/:nodeId/inquiry', '/api/group/:nodeId/roster', '/api/group/:nodeId/roster/:userId',
  '/api/group/:nodeId/withdraw', '/api/inquiry/:id/dismiss', '/api/mappings/:id/retire',
  '/api/me/focus/:id/source', '/api/me/focus/:id/visibility', '/api/messages/:msgId/read',
  '/api/notes/:noteId/ask', '/api/org-context/:id/retire',
  '/api/org-learning/observations/:fingerprint/dismiss',
  '/api/org-memory/moments/:fingerprint/explain', '/api/org-playbook/:fingerprint/retire',
  '/api/org-playbook/candidates/:fingerprint/confirm',
  '/api/org-playbook/candidates/:fingerprint/dismiss', '/api/reason/:beliefId/feedback',
]);

const routes = [...new Set((server.match(/app\.(?:get|post|patch|put|delete)\(\s*'([^']+)'/g) || [])
  .map(m => m.replace(/^.*'([^']+)'.*$/, '$1')))].sort();

/* WHAT COUNTS AS REACHED.

   THE HOLE THIS CLOSED, found on 10 September 2026. The old test was
   `front.includes(route.split(':')[0])` — it truncated a route at its first parameter and looked
   for the PREFIX. So `/api/objects/:kind/:id/priority` was "reachable" because some other code
   fetches something under `/api/objects`, and so was every other route sharing a prefix with a
   route anybody calls. Eighteen routes were passing this guard with nothing calling them, and two
   of those were built in the last fortnight by the same agent writing this comment.

   It now requires the literal tail as well: the segments AFTER the last parameter have to appear
   in the front end too. `/api/objects/:kind/:id/priority` needs `/priority` to be mentioned
   somewhere, not just `/api/objects`. Still a substring test — it cannot prove the fetch is
   reached, only that the words exist — but it can no longer be satisfied by an unrelated
   neighbour, which is the failure it actually had. */
const reachable = r => {
  if (!r.includes(':')) return r.length > 5 && front.includes(r);
  const segs = r.split('/').filter(Boolean);
  const firstParam = segs.findIndex(s => s.startsWith(':'));
  const prefix = '/' + segs.slice(0, firstParam).join('/');
  const tail = segs.slice(firstParam + 1).filter(s => !s.startsWith(':'));
  /* AND THE TAIL HAS TO FOLLOW THE PREFIX IN ONE STRING. A second hole, found on 11 September
     2026 when an unrelated new call to `/api/health` made `/api/connections/:id/health` look
     reached: `front.includes('/health')` is true of `/api/health`, so any route whose last
     segment happens to be a word used elsewhere could be satisfied by a stranger. Requiring the
     tail to appear AFTER the prefix inside the same quoted URL -- no quote or backtick in between
     -- means a neighbour on a different path can no longer stand in for it. */
  if (prefix.length <= 5 || !front.includes(prefix)) return false;
  return tail.every(t => new RegExp(
    prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "[^'\"`\\s]{0,160}/" + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  ).test(front));
};

console.log('\n  ROUTE REACHABILITY');
ok(`the tail-hole set is exactly the 26 it exposed, and has not grown (${TAIL_HOLE_EXPOSED.size})`,
  TAIL_HOLE_EXPOSED.size === 26);
ok('…and every route in it is still a real declared route, so the set cannot outlive its subject',
  [...TAIL_HOLE_EXPOSED].every(r => routes.includes(r)));
ok(`every route is reachable, backend-only, or recorded debt (${routes.length} routes)`, (() => {
  const surprises = routes.filter(r => !reachable(r) && !BACKEND_ONLY.has(r) && !KNOWN_ORPHANS.has(r)
    && !TAIL_HOLE_EXPOSED.has(r)
    && !PREFIX_HOLE_ORPHANS.has(r));
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

/* THE PREFIX-HOLE LIST MAY SHRINK AND MUST NOT GROW. Pinned to a number as well as a predicate:
   without the count, a new orphan could be added to that set and the suite would still be green,
   which is precisely how a recorded bill turns into a place to put things. */
{
  const fixed = [...PREFIX_HOLE_ORPHANS].filter(r => reachable(r));
  if (fixed.length) console.log('\n    These now have a caller — remove them from PREFIX_HOLE_ORPHANS:\n      ' + fixed.join('\n      '));
  ok('the prefix-hole list still describes reality, and has not grown past the 17 it exposed',
    fixed.length === 0 && PREFIX_HOLE_ORPHANS.size <= 17);
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
/* The Priority Office door, named because it spent a whole pass declared backend-only. A route
   in the file is not a door; the door is a FETCH whose result is RENDERED. Both halves, or this
   check would pass against a fetch whose answer is dropped on the floor. */
ok('the Priority Office reaches a screen: Home fetches the attention list and renders it',
  /_read\('\/api\/me\/attention'/.test(front) && /_renderAttention\(att\.data\.items\)/.test(front)
  && /_renderAttention\(items\)\s*\{/.test(front));

console.log(`\nreachability-smoke: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
