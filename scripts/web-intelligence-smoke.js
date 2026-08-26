/* W-1: leader Web intelligence uses the governed aggregate projection. */
process.env.DB_OPTIONAL='1'; process.env.NODE_ENV='test';
const proactive=require('../ai/proactive');
const S=require('../server');
let pass=0,fail=0; const ok=(n,c)=>{(c?pass++:fail++);console.log(c?'  ✓':'  ✗',n)};
const web=proactive.toInsight({type:'momentum_drop',severity:'medium',render:{leader:{headline:'A Web Low',body:'A pattern is appearing across your visible scope.',suggestion:null}}},{audience:'leader',subjectRef:'web:visible-scope',subjectId:'person'});
ok('web projection strips subject identity',web.perspective==='web'&&web.subjectId===null&&proactive.audienceSafe(web).ok);
ok('audienceSafe rejects a forged Web subject',proactive.audienceSafe({...web,subjectId:'person'}).violations.includes('web_subject_exposed'));
const selfDespiteOption=proactive.toInsight({type:'momentum_drop'},{audience:'leader',perspective:'web',subjectRef:'person:1',subjectId:'person'});
ok('caller-selected perspective cannot launder a person artifact',selfDespiteOption.perspective==='self'&&selfDespiteOption.subjectId==='person');
ok('frozen Web allow-list rejects an unknown identity-bearing field',proactive.audienceSafe({...web,futureIdentityRef:'person'}).violations.includes('web_unknown_field'));
const C='web', O='other', now=Date.now(), DAY=86400000;
const ev=(id,sub,v,d,visibility='shared')=>({id,orgCode:C,status:'active',subjectId:sub,type:'metric',label:'mood',visibility,value:v,observedAt:new Date(now-d*DAY).toISOString(),provider:'checkin',source:'observed',originId:`origin:${id}`});
S._loadAllStores({orgUsers:{[C]:{lead:{id:'lead',name:'Leader',email:'l@w',role:'superadmin',orgCode:C,status:'active'},a:{id:'a',name:'Alice',email:'a@w',role:'member',orgCode:C,status:'active'},b:{id:'b',name:'Bob',email:'b@w',role:'member',orgCode:C,status:'active'},plain:{id:'plain',name:'Member',email:'p@w',role:'member',orgCode:C,status:'active'},c:{id:'c',name:'C',email:'c@w',role:'member',orgCode:C,status:'active'}},[O]:{boss:{id:'boss',name:'Other Boss',email:'o@w',role:'superadmin',orgCode:O,status:'active'},x:{id:'x',name:'Secret Other',email:'x@w',role:'member',orgCode:O,status:'active'}}},evidenceLog:{[C]:[
 ev('a1','a',4,30),ev('a2','a',4,25),ev('a3','a',4,20),ev('a4','a',2,5),ev('a5','a',2,3),ev('a6','a',2,1,'private'),
 ev('b1','b',4,30),ev('b2','b',4,25),ev('b3','b',4,20),ev('b4','b',2,5),ev('b5','b',2,3),ev('b6','b',2,1)
]}}); S._rebuildEmailIndex();
const server=S.app.listen(0,async()=>{const base=`http://127.0.0.1:${server.address().port}`;const call=async(p,t)=>{const r=await fetch(base+p,{headers:{Authorization:`Bearer ${t}`}});return{status:r.status,j:await r.json()}};try{
 const lead=S.issueToken('lead',C,'superadmin'), member=S.issueToken('plain',C,'member'), other=S.issueToken('boss',O,'superadmin');
 const roster=await call('/api/intelligence/roster?refresh=1',lead); const blob=JSON.stringify(roster.j);
 ok('roster retains neutral identities without behavioral labels',roster.status===200&&roster.j.roster.length===4&&!/topLabel|"status"|Gone quiet|Pulling away|invisible load/.test(blob));
 const brief=await call('/api/intelligence/briefing?refresh=1',lead);
 // The briefing carries BOTH: aggregate Web items that name nobody, and the people this
 // leader is responsible for. The original form of this assertion required every item to be
 // a Web item, which encoded "the leader may not see individuals" as law. That is not the
 // architecture's position anywhere else — the roster endpoint names the same people, the
 // assistant answers "how is Jordan doing", and /api/intelligence/act takes a memberId — and
 // making one payload aggregate-only left the outcome loop with no caller. So the property is
 // split: what must hold of a WEB item, and what must hold of the payload as a whole.
 ok('briefing carries governed aggregate intelligence',brief.status===200&&brief.j.items.length>0&&brief.j.items.some(i=>i.perspective==='web'));
 ok('every Web item is subject-free',brief.j.items.filter(i=>i.perspective==='web').every(i=>i.subjectId==null&&proactive.audienceSafe(i).ok));
 ok('a person item names someone this leader is responsible for',brief.j.items.some(i=>i.perspective!=='web'&&/Alice|Bob/.test(JSON.stringify(i))));
 // The three properties that must hold whether or not people are named: no private origin,
 // no raw evidence basis, and nobody outside the reader's scope — here, another org's member.
 ok('briefing exposes no private origin, no raw basis, and nobody outside scope',!/origin:a6|"basis":\[[^\]]+|Secret Other/.test(JSON.stringify(brief.j)));
 ok('ordinary member cannot call leader surfaces',(await call('/api/intelligence/briefing',member)).status===403&&(await call('/api/intelligence/roster',member)).status===403);
 const ob=await call('/api/intelligence/briefing?refresh=1',other); ok('tenant isolation holds',ob.status===200&&!/Alice|Bob|origin:a6/.test(JSON.stringify(ob.j)));
}catch(e){fail++;console.log('  ✗ suite threw',e.message)}finally{server.close();console.log(`\nweb-intelligence-smoke: ${pass} passed, ${fail} failed`);process.exit(fail?1:0)}});
