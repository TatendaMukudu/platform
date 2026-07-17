/* ============================================================
   scripts/action-smoke.js — the universal Action Contract (pure).

   The stage machine + record shape that every capability implements.

   Run:  node scripts/action-smoke.js   (part of `npm test`)
   ============================================================ */

const a = require('../lib/action');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

console.log('\n=== Action contract ===\n');

// ── The progression is Recommend → Draft → Confirm → Execute → Observe → Evaluate → Learn ──
ok('the stages are the full execution loop', a.STAGES.join('>') === 'recommend>draft>confirm>execute>observe>evaluate>learn');
ok('three authority levels: recommend / draft / execute', a.AUTHORITY.join(',') === 'recommend,draft,execute');

// ── Legal transitions only ──────────────────────────────────────────────────
ok('recommend can advance to draft', a.canAdvance('recommend', 'draft'));
ok('draft can go to confirm OR straight to execute (policy permitting)', a.canAdvance('draft', 'confirm') && a.canAdvance('draft', 'execute'));
ok('execute advances to observe', a.canAdvance('execute', 'observe'));
ok('observe → evaluate → learn closes the loop', a.canAdvance('observe', 'evaluate') && a.canAdvance('evaluate', 'learn'));
ok('you cannot jump recommend → execute (must draft first)', !a.canAdvance('recommend', 'execute'));
ok('you cannot go backwards (execute → draft)', !a.canAdvance('execute', 'draft'));

// ── Record shape ────────────────────────────────────────────────────────────
const act = a.buildAction({ org: 'CO', capability: 'intervention', verb: 'create', actorId: 'u1', subjectId: 's1', rationale: 'they went quiet', evidenceRefs: ['sig_1', 'sig_2'] });
ok('a built action starts at recommend/proposed', act.stage === 'recommend' && act.status === 'proposed');
ok('the action carries WHY (rationale) + the evidence that grounds it', act.rationale === 'they went quiet' && act.evidenceRefs.length === 2);
ok('org is normalised; an initial audit entry exists', act.org === 'co' && act.audit.length === 1 && act.audit[0].stage === 'recommend');
ok('policy/execution/observation/evaluation start empty (filled as it progresses)',
   act.policy === null && act.execution === null && act.observation === null && act.evaluation === null);
ok('summarize gives a compact lifecycle view', a.summarize(act).capability === 'intervention' && a.summarize(act).stage === 'recommend');

console.log(`\n=== action-smoke: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
