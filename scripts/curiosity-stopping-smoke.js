'use strict';
const D = require('../ai/diagnose');
let pass=0, fail=0; const ok=(n,c)=>{if(c){pass++;console.log('  PASS',n)}else{fail++;console.error('  FAIL',n)}};

const created=[]; const frontier=[];
for(let i=0;i<20;i++){
  const concept=`routine-${i}`;
  const route=D.enforceConversationRoute({concept,route:{action:'create',relationship:'NEW'},frontier,createdIds:created});
  if(route.action==='create') { const id=`i-${i}`; created.push(id); frontier.push({inquiryId:id,concept,aliases:[]}); }
}
ok('C1 twenty routine turns cannot open more than the per-conversation inquiry cap', created.length===D.CONVERSATION_NEW_INQUIRY_CAP && created.length===2);
const existing=[{inquiryId:'known',concept:'sleep',label:'Sleep',aliases:['rest']}];
const same=D.enforceConversationRoute({concept:'rest',route:{action:'create',relationship:'NEW'},frontier:existing,createdIds:[]});
ok('C2 a model create proposal for an existing concept is downgraded to attach',same.action==='apply'&&same.targetId==='known'&&same.relationship==='SAME_AS');

const inquiry={inquiryId:'q1',topic:{label:'Sleep'},confidence:{score:0.2},missingSignals:[{question:'What changed around sleep?',resolves:'sleep change'}],hypotheses:[],signals:[]};
const conv={}; const now=Date.now();
const first=D.nextConversationNeed([inquiry],conv,now); D.recordConversationQuestion(conv,first.candidate,now);
ok('C3 the same unknown is not asked again inside the cooling window',first&&D.nextConversationNeed([inquiry],conv,now+1000)===null);
D.noteConversationResponse(conv,'No, I would rather not discuss that.');
ok('C4 declined means declined even after the cooling window',D.nextConversationNeed([inquiry],conv,now+D.QUESTION_COOLDOWN_MS+1)===null);
const capped={curiosity:{asked:Array.from({length:D.CONVERSATION_QUESTION_CAP},(_,i)=>({key:`old-${i}`,at:now}))}};
ok('C5 the hard question cap stops a conversation from becoming an interrogation',D.nextConversationNeed([inquiry],capped,now)===null);
console.log(`\ncuriosity-stopping-smoke: ${pass} passed, ${fail} failed`); process.exit(fail?1:0);
