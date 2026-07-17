/* ============================================================
   scripts/policy-smoke.js — the Policy Engine (the organisational constitution).

   Proves the assistant asks "am I allowed to?", not just "can I?". Pure.

   Run:  node scripts/policy-smoke.js   (part of `npm test`)
   ============================================================ */

const p = require('../lib/policy');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const D = p.defaultPolicies();
const evalReq = req => p.evaluate(D, req);

console.log('\n=== Policy engine (the constitution) ===\n');

// ── The user's example constitution, enforced ──────────────────────────────
ok('AI may DRAFT an email (nothing outward)', evalReq({ capability: 'email', verb: 'send', stage: 'draft' }).allowed);
ok('AI may NOT send an email without approval', evalReq({ capability: 'email', verb: 'send', stage: 'execute' }).requiresApproval);
ok('AI may schedule a meeting', evalReq({ capability: 'calendar', verb: 'create', stage: 'execute' }).allowed);
ok('AI may NOT delete a meeting (deny wins)', evalReq({ capability: 'calendar', verb: 'delete', stage: 'execute' }).denied);
ok('AI may recommend an intervention', evalReq({ capability: 'intervention', verb: 'create', stage: 'recommend' }).allowed);
ok('AI may NOT execute an intervention without approval', evalReq({ capability: 'intervention', verb: 'create', stage: 'execute' }).requiresApproval);
ok('AI may auto-approve a purchase under $100', evalReq({ capability: 'purchase', verb: 'approve', stage: 'execute', amount: 40 }).allowed);
ok('AI needs approval for a purchase of $100+', evalReq({ capability: 'purchase', verb: 'approve', stage: 'execute', amount: 250 }).requiresApproval);
ok('AI must ESCALATE an HR-related action', evalReq({ capability: 'task', verb: 'update', stage: 'execute', category: 'hr' }).escalate);
ok('a safeguarding action escalates to a human', evalReq({ capability: '*', verb: '*', stage: 'execute', category: 'safeguarding' }).escalateTo === 'admin');

// ── Precedence: most-restrictive wins ──────────────────────────────────────
const mixed = [
  { id: 'a', effect: 'allow', capability: 'email', verb: 'send', stage: 'execute', enabled: true },
  { id: 'd', effect: 'deny', capability: 'email', verb: 'send', stage: 'execute', enabled: true },
];
ok('a DENY overrides an ALLOW for the same action', p.evaluate(mixed, { capability: 'email', verb: 'send', stage: 'execute' }).denied);
ok('require_approval beats a plain allow (safe by default)',
   p.evaluate([{ id: 'x', effect: 'allow', capability: 'x', verb: 'y', stage: 'execute', enabled: true }, { id: 'z', effect: 'require_approval', capability: 'x', verb: 'y', stage: 'execute', enabled: true }], { capability: 'x', verb: 'y', stage: 'execute' }).requiresApproval);

// ── Safe defaults — the assistant never auto-executes on silence ────────────
ok('an unknown EXECUTE action needs approval by default', evalReq({ capability: 'unknown', verb: 'zap', stage: 'execute' }).requiresApproval);
ok('an unknown RECOMMEND is allowed (nothing outward)', evalReq({ capability: 'unknown', verb: 'zap', stage: 'recommend' }).allowed);

// ── Conditions ──────────────────────────────────────────────────────────────
ok('a disabled rule does not apply', p.evaluate([{ id: 'q', effect: 'deny', capability: 'email', verb: 'send', stage: 'execute', enabled: false }], { capability: 'email', verb: 'send', stage: 'execute' }).denied === false);
ok('an amount condition only matches within range',
   !p.ruleMatches({ effect: 'allow', capability: 'purchase', verb: 'approve', stage: 'execute', conditions: { maxAmount: 100 } }, { capability: 'purchase', verb: 'approve', stage: 'execute', amount: 500 }));
ok('a category condition matches on the request category',
   p.ruleMatches({ effect: 'escalate', capability: '*', verb: '*', stage: 'execute', conditions: { categories: ['hr'] } }, { capability: 'task', verb: 'x', stage: 'execute', category: 'HR' }));

console.log(`\n=== policy-smoke: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
