/* ============================================================
   lib/action.js — the universal Action Contract (the Execution Layer's spine).

   Every capability — calendar, email, tasks, interventions, purchases, and every
   future one — is an implementation of ONE execution model, not bespoke CRUD:

       recommend → draft → confirm → execute → observe → evaluate → learn

   (Reading is the Truth Pipeline that already exists; actions begin at recommend.)

   Three levels of AUTHORITY, each a bigger responsibility than the last:
       recommend  — "you might want to…"        (nothing outward)
       draft      — "here's exactly what I'd do" (nothing outward)
       execute    — actually does it             (outward; policy-gated)

   The last stages are the loop almost no assistant closes:
       observe  — what actually happened
       evaluate — did it improve the organisation?
       learn    — feed that back to the kernel

   Pure + deterministic: the stage machine and record shape. The server owns
   capability executors, policy enforcement, storage, and audit.
   ============================================================ */

const STAGES = ['recommend', 'draft', 'confirm', 'execute', 'observe', 'evaluate', 'learn'];
const AUTHORITY = ['recommend', 'draft', 'execute'];   // the three levels the policy gates

/* The legal next stages from each stage (a small state machine). `confirm` is the
   approval gate that sits between draft and execute; it may be skipped when policy
   allows the action outright. */
const _NEXT = {
  recommend: ['draft', 'rejected'],
  draft:     ['confirm', 'execute', 'rejected'],
  confirm:   ['execute', 'rejected'],
  execute:   ['observe', 'failed'],
  observe:   ['evaluate'],
  evaluate:  ['learn'],
  learn:     [],
};

function canAdvance(fromStage, toStage) {
  return Array.isArray(_NEXT[fromStage]) && _NEXT[fromStage].includes(toStage);
}

const _s = (v, n) => (v == null ? '' : String(v)).slice(0, n);

/* Build a normalised action record from a proposal. Nothing here decides whether it
   is ALLOWED — that's the policy engine, applied by the server before advancing to
   execute. */
function buildAction(input = {}) {
  const now = new Date().toISOString();
  return {
    id: _s(input.id, 64) || null,
    org: _s(input.org, 64).toLowerCase(),
    capability: _s(input.capability || 'generic', 40),
    verb: _s(input.verb || 'act', 40),
    stage: STAGES.includes(input.stage) ? input.stage : 'recommend',
    authority: AUTHORITY.includes(input.authority) ? input.authority : 'recommend',
    actorId: input.actorId != null ? _s(input.actorId, 64) : 'system',   // who initiated
    subjectId: input.subjectId != null ? _s(input.subjectId, 64) : null,
    groupRef: input.groupRef != null ? _s(input.groupRef, 120) : null,
    category: input.category != null ? _s(input.category, 40) : null,     // e.g. 'hr' — policy input
    amount: input.amount != null && Number.isFinite(Number(input.amount)) ? Number(input.amount) : null,
    tags: Array.isArray(input.tags) ? input.tags.slice(0, 8).map(t => _s(t, 40)) : [],
    rationale: _s(input.rationale, 2000),               // WHY — grounded in evidence
    evidenceRefs: Array.isArray(input.evidenceRefs) ? input.evidenceRefs.slice(0, 50).map(r => _s(r, 64)) : [],
    draft: (input.draft && typeof input.draft === 'object') ? input.draft : null,
    policy: null,            // decision snapshot, set at each gated stage
    approvals: [],
    status: input.status || 'proposed',
    execution: null,         // result of execute
    observation: null,       // what happened
    evaluation: null,        // did it help
    audit: [{ stage: 'recommend', by: input.actorId || 'system', at: now }],
    createdAt: now, updatedAt: now,
  };
}

/* A compact summary of where an action is in its lifecycle (for lists/queues). */
function summarize(a) {
  return { id: a.id, capability: a.capability, verb: a.verb, stage: a.stage, status: a.status,
    authority: a.authority, subjectId: a.subjectId, category: a.category,
    requiresApproval: !!(a.policy && a.policy.requiresApproval), createdAt: a.createdAt, updatedAt: a.updatedAt };
}

module.exports = { STAGES, AUTHORITY, canAdvance, buildAction, summarize };
