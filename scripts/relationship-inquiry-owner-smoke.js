/* Truth layer — D53: a relationship claim is an Inquiry, never an edge store. */
process.env.DB_OPTIONAL='1';process.env.NODE_ENV='test';
const S=require('../server'),d=require('../ai/diagnose');let pass=0,fail=0;const ok=(n,c)=>{if(c){pass++;console.log('  PASS',n)}else{fail++;console.error('  FAIL',n)}};
const C='relation-inquiry';S._loadAllStores({orgMeta:{[C]:{}},orgUsers:{[C]:{a:{id:'a',role:'member',status:'active'}}}});
let inquiry=S._inquiryFor(C,'relationship-claim:leadership-in-team','leadership_contribution','Leadership contribution','',Date.now());
ok('F53.1 a relationship claim is created as the existing Inquiry shape',inquiry?.inquiryId&&inquiry.subjectRef==='relationship-claim:leadership-in-team'&&inquiry.relationshipClaim.claimId==='leadership-in-team');
const proposal=(id,polarity)=>({id,level:'observation',source:'human',originRef:id,originKind:'direct',occasionRef:id,polarity,specificity:0.8,at:Date.now()});
inquiry=d.applyProposals(inquiry,[proposal('support','supports'),proposal('challenge','contradicts')],{now:Date.now()});
ok('F53.2 relationship support and challenge use Inquiry evidential machinery',
  inquiry.signals.length===2&&Array.isArray(inquiry.hypotheses)&&Array.isArray(inquiry.falsifiers)&&Array.isArray(inquiry.timeline));
ok('F53.3 no relationship or ontology edge store was added',!('relationships' in S._persistedStores())&&!('edges' in S._persistedStores()));
const snap=JSON.parse(JSON.stringify(S._persistedStores()));delete S.inquiryStates[C];S._loadAllStores(snap);
ok('F53.4 relationship identity and inquiry history survive the existing persistence owner',S.inquiryStates[C]['relationship-claim:leadership-in-team'].leadership_contribution.relationshipClaim.claimId==='leadership-in-team');
ok('F53.5 unknown relationship-like subject kinds still fail closed',S._inquiryFor(C,'relationship:bad','x','X','',Date.now())===null);
console.log(`\nrelationship-inquiry-owner-smoke: ${pass} passed, ${fail} failed`);process.exit(fail?1:0);
