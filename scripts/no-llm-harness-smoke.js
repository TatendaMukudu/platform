/* W-2: real deterministic organizational capability, through production boundaries. */
process.env.DB_OPTIONAL='1'; process.env.NODE_ENV='test';
const gateway=require('../ai/gateway'); gateway.setDeterministicOnly(true);
let modelCalls=0; const realComplete=gateway.complete, realJSON=gateway.completeJSON;
gateway.complete=async()=>{modelCalls++;throw new Error('model called')}; gateway.completeJSON=async()=>{modelCalls++;throw new Error('model called')};
const proactive=require('../ai/proactive'); const S=require('../server');
let pass=0,fail=0;const ok=(n,c)=>{(c?pass++:fail++);console.log(c?'  ✓':'  ✗',n)};
const C='floor',now=Date.now(),D=86400000;const ev=(id,s,v,d,vis='shared')=>({id,orgCode:C,status:'active',subjectId:s,type:'metric',label:'mood',visibility:vis,value:v,observedAt:new Date(now-d*D).toISOString(),provider:'checkin',source:'observed',originId:`origin:${id}`});
S._loadAllStores({orgUsers:{[C]:{lead:{id:'lead',name:'Lead',email:'l@f',role:'superadmin',orgCode:C,status:'active'},a:{id:'a',name:'A',email:'a@f',role:'member',orgCode:C,status:'active'},b:{id:'b',name:'B',email:'b@f',role:'member',orgCode:C,status:'active'}}},orgNodes:{[C]:{team:{nodeId:'team',parentId:null,leaderIds:['lead'],memberIds:['a','b']}}},evidenceLog:{[C]:[ev('a1','a',4,30),ev('a2','a',4,25),ev('a0','a',4,20),ev('a3','a',2,5),ev('a5','a',2,3),ev('a4','a',2,1,'private'),ev('b1','b',4,30),ev('b2','b',4,25),ev('b0','b',4,20),ev('b3','b',2,5),ev('b5','b',2,3),ev('b4','b',2,1)]},inquiryStates:{[C]:{'member:a':{attendance:{inquiryId:'inq_a',status:'open',signals:[{ref:'a3'}]}}}},userAiProfiles:{[`${C}:a`]:{focus:{title:'Prepare for the review',status:'active'},outcomes:[{state:'improving'}]}}});S._rebuildEmailIndex();
const server=S.app.listen(0,async()=>{const base=`http://127.0.0.1:${server.address().port}`;const call=async(p,t)=>{const r=await fetch(base+p,{headers:{Authorization:`Bearer ${t}`}});let j={};try{j=await r.json()}catch{}return{status:r.status,j}};try{
 const lead=S.issueToken('lead',C,'superadmin'),a=S.issueToken('a',C,'member'); const brief=await call('/api/intelligence/briefing?refresh=1',lead); const self=await call('/api/proactive/insights',a);
 ok('deterministic-only mode is active',gateway.deterministicOnly()&&!gateway.enabled());
 ok('leader receives a deterministic Web High/Low',brief.status===200&&brief.j.items.some(i=>['high','low'].includes(i.kind)));
 ok('member and leader receive different governed projections',self.status===200&&JSON.stringify(self.j)!==JSON.stringify(brief.j));
 ok('evidence and independent provenance remain in canonical state',S.evidenceLog[C].some(e=>e.originId==='origin:a3'));
 ok('private evidence is absent from Web projection',!JSON.stringify(brief.j).includes('origin:a4'));
 ok('an unresolved Inquiry remains represented',S.inquiryStates[C]['member:a'].attendance.status==='open');
 ok('an existing Focus remains represented',S.userAiProfiles[`${C}:a`].focus.status==='active');
 ok('tested production path made zero model calls',modelCalls===0);
}catch(e){fail++;console.log('  ✗ suite threw',e.message)}finally{gateway.complete=realComplete;gateway.completeJSON=realJSON;gateway.setDeterministicOnly(false);server.close();console.log(`\nno-llm-harness-smoke: ${pass} passed, ${fail} failed`);process.exit(fail?1:0)}});
