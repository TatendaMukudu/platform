/* ============================================================
   lib/policy.js — the Policy Engine (the organizational constitution).

   NOT permissions (who may use a feature). POLICIES: what the assistant is ALLOWED
   to DO on the organisation's behalf, by its own rules. Before any action, IntelliQ
   asks not "can I?" but "am I allowed to, according to THIS organisation's rules?"

     AI may draft emails            → allow(draft)
     AI may not send without approval → require_approval(execute, email.send)
     AI may schedule meetings        → allow(execute, calendar.create)
     AI may not delete meetings      → deny(execute, calendar.delete)
     AI may approve purchases < $100 → allow(execute, purchase.approve, maxAmount:100)
     AI must escalate HR actions     → escalate(category: hr)

   Pure + deterministic so the decision is auditable and testable in isolation. The
   server owns storage, editing, and enforcement at each stage boundary.
   ============================================================ */

const EFFECTS = ['allow', 'require_approval', 'deny', 'escalate'];

/* Decision precedence (most-restrictive wins): a DENY overrides everything; an
   ESCALATE (needs a higher authority) beats a plain approval; REQUIRE_APPROVAL beats
   ALLOW (safe by default). If nothing matches, execute-class actions still need
   approval — the assistant never auto-executes on silence. */
const _RANK = { deny: 4, escalate: 3, require_approval: 2, allow: 1 };

const _norm = s => String(s == null ? '' : s).toLowerCase().trim();
const _match = (ruleVal, reqVal) => ruleVal == null || ruleVal === '*' || _norm(ruleVal) === _norm(reqVal);

/* Does a rule apply to this request? Capability/verb/stage match (with '*'), and any
   conditions (amount ceiling, category/tag sets, actor role) are satisfied. */
function ruleMatches(rule, req) {
  if (!rule || !EFFECTS.includes(rule.effect)) return false;
  if (!_match(rule.capability, req.capability)) return false;
  if (!_match(rule.verb, req.verb)) return false;
  if (!_match(rule.stage, req.stage)) return false;
  const c = rule.conditions || {};
  if (c.maxAmount != null) { const amt = Number(req.amount); if (!Number.isFinite(amt) || amt > c.maxAmount) return false; }
  if (c.minAmount != null) { const amt = Number(req.amount); if (!Number.isFinite(amt) || amt < c.minAmount) return false; }
  if (Array.isArray(c.categories) && c.categories.length) { if (!c.categories.map(_norm).includes(_norm(req.category))) return false; }
  if (Array.isArray(c.tags) && c.tags.length) { const rt = (req.tags || []).map(_norm); if (!c.tags.map(_norm).some(t => rt.includes(t))) return false; }
  if (Array.isArray(c.roles) && c.roles.length) { if (!c.roles.map(_norm).includes(_norm(req.actorRole))) return false; }
  return true;
}

/* Evaluate a proposed action against the org's constitution. Returns
   { effect, allowed, requiresApproval, escalate, rule, reason }. `req` = {
   capability, verb, stage, amount?, category?, tags?, actorRole? }. */
function evaluate(policies, req) {
  const matched = (Array.isArray(policies) ? policies : []).filter(r => r.enabled !== false && ruleMatches(r, req));
  // Highest-rank (most restrictive) matched rule wins; ties break to the more specific.
  matched.sort((a, b) => (_RANK[b.effect] - _RANK[a.effect]) || (_specificity(b) - _specificity(a)));
  const top = matched[0];

  const isExecute = _norm(req.stage) === 'execute' || _norm(req.stage) === 'confirm';
  let effect, reason;
  if (top) { effect = top.effect; reason = top.note || `matched policy: ${top.effect} ${top.capability || '*'}.${top.verb || '*'}`; }
  else if (isExecute) { effect = 'require_approval'; reason = 'no policy grants this action — approval required by default'; }
  else { effect = 'allow'; reason = 'recommend/draft is allowed by default (nothing outward happens)'; }

  return {
    effect,
    allowed: effect === 'allow',
    requiresApproval: effect === 'require_approval' || effect === 'escalate',
    escalate: effect === 'escalate',
    escalateTo: effect === 'escalate' ? (top && top.escalateTo) || 'admin' : null,
    denied: effect === 'deny',
    rule: top ? { id: top.id, effect: top.effect, capability: top.capability, verb: top.verb } : null,
    reason,
  };
}
function _specificity(r) { return (r.capability && r.capability !== '*' ? 1 : 0) + (r.verb && r.verb !== '*' ? 1 : 0) + (r.stage && r.stage !== '*' ? 1 : 0) + (r.conditions ? 1 : 0); }

/* The DEFAULT constitution every org starts with — conservative: read/recommend/
   draft are free; anything OUTWARD or destructive needs approval or is denied. An
   org edits this in Settings; the shape is intentionally small and human-readable. */
function defaultPolicies() {
  const R = (id, effect, capability, verb, extra = {}) => ({ id, effect, capability, verb, stage: extra.stage || 'execute', conditions: extra.conditions || null, escalateTo: extra.escalateTo || null, note: extra.note || null, enabled: true, builtin: true });
  return [
    R('draft-anything', 'allow', '*', '*', { stage: 'draft', note: 'IntelliQ may draft anything for review' }),
    R('recommend-anything', 'allow', '*', '*', { stage: 'recommend', note: 'IntelliQ may recommend anything' }),
    R('email-send', 'require_approval', 'email', 'send', { note: 'emails require a human to approve before sending' }),
    R('message-send', 'require_approval', 'message', 'send', { note: 'messages require approval before sending' }),
    R('calendar-create', 'allow', 'calendar', 'create', { note: 'IntelliQ may schedule meetings' }),
    R('calendar-delete', 'deny', 'calendar', 'delete', { note: 'IntelliQ may never delete meetings' }),
    R('task-manage', 'allow', 'task', 'update', { note: 'IntelliQ may update tasks' }),
    R('intervention-execute', 'require_approval', 'intervention', 'create', { note: 'supportive interventions need approval before they reach a person' }),
    R('purchase-small', 'allow', 'purchase', 'approve', { conditions: { maxAmount: 100 }, note: 'purchases under $100 may be auto-approved' }),
    R('purchase-large', 'require_approval', 'purchase', 'approve', { conditions: { minAmount: 100 }, note: 'purchases of $100+ need approval' }),
    R('hr-escalate', 'escalate', '*', '*', { conditions: { categories: ['hr'] }, escalateTo: 'admin', note: 'HR-related actions must be escalated to a human admin' }),
    R('safeguarding-escalate', 'escalate', '*', '*', { conditions: { categories: ['safeguarding'] }, escalateTo: 'admin', note: 'safeguarding actions must be escalated' }),
  ];
}

module.exports = { EFFECTS, ruleMatches, evaluate, defaultPolicies };
