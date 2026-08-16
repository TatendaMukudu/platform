/* ============================================================
   ai/refusal.js — CONSTITUTIONAL REFUSAL (pure)

   A policy deny is not a generic error. This projection explains the boundary, offers a
   non-executing alternative, and supplies a bounded content-free audit label. It never changes
   the policy decision and has no execution surface.
   ============================================================ */
'use strict';
const clean=(v,n)=>String(v==null?'':v).replace(/\s+/g,' ').trim().slice(0,n);
function fromPolicyDenial(decision={},request={}) {
  if (decision.denied!==true || decision.effect!=='deny') return null;
  const rule=decision.rule&&typeof decision.rule==='object'?decision.rule:{};
  const capability=clean(request.capability||rule.capability||'action',48);
  const verb=clean(request.verb||rule.verb||'perform',48);
  const explanation=clean(decision.reason||`The organisation constitution forbids ${capability}.${verb}.`,240);
  return Object.freeze({
    refused:true,
    boundary:'organisation_constitution',
    ruleId:clean(rule.id||'deny',80),
    explanation,
    alternative:`Keep this as a draft, or choose a permitted ${capability} action.`,
    auditBasis:clean(`constitution · ${rule.id||'deny'} · ${capability}.${verb}`,120),
  });
}
module.exports={fromPolicyDenial};
