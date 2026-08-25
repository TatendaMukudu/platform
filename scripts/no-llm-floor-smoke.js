/* B1 — mutation-sensitive no-LLM production floor.
   This proves deterministic ingestion/projection, group-Inquiry creation, Focus
   create/outcome durability and governed reads. It does NOT claim deterministic
   personal-Inquiry creation or semantic retrieval. */
process.env.DB_OPTIONAL='1'; process.env.NODE_ENV='test'; process.env.IQ_DETERMINISTIC_ONLY='1';
const gateway=require('../ai/gateway'), embeddings=require('../ai/embeddings'), graph=require('../ai/org-graph');
gateway.setDeterministicOnly(true);
let modelCalls=0;
const exits=['complete','completeJSON','understand','transcribe']; const originals={};
for(const name of exits){originals[name]=gateway[name];gateway[name]=async()=>{modelCalls++;throw new Error(`model exit ${name}`)}}
const realEmbed=embeddings.embed;embeddings.embed=async()=>{modelCalls++;throw new Error('model exit embed')};
const S=require('../server'); let pass=0,fail=0; const ok=(n,c)=>{c?pass++:fail++;console.log(c?'  ✓':'  ✗',n)};
const C='floor',now=Date.now(),D=86400000;
const ev=(id,s,v,d,vis='shared')=>({id,orgCode:C,status:'active',subjectId:s,type:'metric',label:'mood',visibility:vis,value:v,observedAt:new Date(now-d*D).toISOString(),provider:'checkin',source:'observed',originRef:`origin:${id}`,originKind:'direct_observation'});
const users={lead:{id:'lead',name:'Lead',email:'l@f',role:'superadmin',orgCode:C,status:'active'},a:{id:'a',name:'A',email:'a@f',role:'member',orgCode:C,status:'active'},b:{id:'b',name:'B',email:'b@f',role:'member',orgCode:C,status:'active'},c:{id:'c',name:'C',email:'c@f',role:'member',orgCode:C,status:'active'},d:{id:'d',name:'D',email:'d@f',role:'member',orgCode:C,status:'active'}};
const nodes={root:{nodeId:'root',parentId:null,childNodeIds:['team'],leaderIds:['lead'],memberIds:[]},team:{nodeId:'team',parentId:'root',childNodeIds:[],leaderIds:['lead'],memberIds:['a','b','c','d']}};
const series=(s,old,recent)=>[ev(`${s}1`,s,old,30),ev(`${s}2`,s,old,25),ev(`${s}3`,s,old,20),ev(`${s}4`,s,recent,5),ev(`${s}5`,s,recent,3),ev(`${s}6`,s,recent,1)];
S._loadAllStores({orgMeta:{[C]:{orgName:'Floor'}},orgUsers:{[C]:users},orgNodes:{[C]:nodes},evidenceLog:{[C]:[...series('a',4,2),...series('b',4,2),...series('c',2,4),...series('d',2,4),ev('private','a',1,1,'private')]}});S._backfillUserNodeIds();S._rebuildEmailIndex();
const server=S.app.listen(0,async()=>{await new Promise(r=>server.listening?r():server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
 const token=id=>S.issueToken(id,C,users[id].role); const call=async(method,path,id,body)=>{const r=await fetch(base+path,{method,headers:{Authorization:`Bearer ${token(id)}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return{status:r.status,body:await r.json().catch(()=>({}))}};
 try{
  // F-1 mutation: removing any switch guard makes one conjunct false.
  ok('F-1 every model capability is disabled',gateway.deterministicOnly()&&!gateway.enabled()&&!gateway.canUnderstand('text')&&!gateway.canTranscribe()&&!embeddings.enabled());
  // F-2 mutation: break the graph parent traversal and the leader loses team.
  ok('F-2 Web scope resolves through the production graph',graph.visibleNodesFor(nodes,'lead').includes('team'));
  const lead=await call('GET','/api/intelligence/briefing?refresh=1','lead');
  // F-3 mutation: admit private evidence and its id can enter a rendered payload.
  ok('F-3 private evidence contributes nothing to leader output',lead.status===200&&!JSON.stringify(lead.body).includes('origin:private'));
  // F-4 mutation: stub _webIntelligence to [] and these polarities disappear.
  ok('F-4 deterministic Web High and Low both surface',lead.body.items.some(x=>x.kind==='high')&&lead.body.items.some(x=>x.kind==='low'));
  // F-5 mutation: remove complement floor and k=n publishes.
  const all={momentum_drop:{findings:['a','b'].map(()=>({type:'momentum_drop',confidence:'clear',severity:'medium'})),contributions:['a','b'].map(x=>({status:'contributed',contributorId:x,originRef:x}))}};
  ok('F-5 all-member cohort is suppressed',S._webIntelligence(all,2,{momentum_drop:{}},now).length===0);
  // F-6/F-8 begin with no group inquiry, then create candidates and cross the real contribution route.
  ok('F-6 inquiry does not exist before contribution',!S.inquiryStates[C]);
  for(const [id,origin] of [['a','oa'],['b','ob']]) S._noteGroupCandidates(C,id,`member:${id}`,[{id:`e_${id}`,level:'observation',text:'shape unclear',sourceSpan:'our shape is unclear',concerns:'group',originRef:origin,originKind:'direct_observation',turnId:`t_${id}`}],'shape','Shape');
  for(const id of ['a','b']){const cand=S.groupCandidates[C].find(x=>x.contributorId===id);await call('POST','/api/group/team/contribute',id,{candidateId:cand.candidateId})}
  const created=Object.values(S.inquiryStates[C]['group:team'])[0];
  ok('F-6 two independent contributions create a real group Inquiry',created&&created.signals.length===2);
  ok('F-8 Inquiry signals preserve contributor origins',new Set(created.signals.map(x=>x.originRef)).size===2&&created.signals.some(x=>x.originRef==='oa'));
  // F-7 mutation: force the opening decision true and one-origin echoes create an inquiry.
  const echoes={momentum_drop:{findings:['a','b'].map(()=>({type:'momentum_drop',confidence:'clear',severity:'medium'})),contributions:['a','b'].map(x=>({status:'contributed',contributorId:x,originRef:'same'}))}};
  ok('F-7 repeated one-origin reports create no Web artifact',S._webIntelligence(echoes,4,{momentum_drop:{}},now).length===0);
  // F-11/F-12 mutation: break prepared/act or focus/outcome and no durable done Focus exists.
  const made=await call('POST','/api/me/prepared/act','a',{text:'Protect recovery time',type:'momentum_drop',decision:'approve'});const focusId=made.body.focuses?.[0]?.id;
  const outcome=await call('POST','/api/me/focus/outcome','a',{focusId,outcome:'helped'});
  ok('F-11 Focus is created and advanced through production routes',made.status===200&&outcome.status===200&&S.userAiProfiles[`${C}:a`].focuses[0].status==='done');
  ok('F-12 outcome learning moves reliability feedback',S.noticeFeedback[C].momentum_drop.useful===1);
  // Persistence mutation: remove either store registration and reconstruction reads empty.
  const units=S._durableUnits(), iqUnit=JSON.parse(JSON.stringify(units[`store:inquiryStates:${C}`])), focusUnit=JSON.parse(JSON.stringify(units[`store:userAiProfiles:${C}`]));
  delete S.inquiryStates[C]; delete S.userAiProfiles[`${C}:a`]; S._applyUnits({[`store:inquiryStates:${C}`]:iqUnit,[`store:userAiProfiles:${C}`]:focusUnit});
  const inquiryRead=await call('GET','/api/group/team/inquiry','lead');const exportRead=await call('GET','/api/me/export','a');
  ok('F-11 persisted Focus survives reconstruction and owner read',exportRead.body.aiMemory.focuses.some(x=>x.id===focusId&&x.status==='done'&&x.outcome==='helped'));
  ok('F-6 persisted Inquiry survives reconstruction and governed read',inquiryRead.body.inquiries.some(x=>x.inquiryId===created.inquiryId&&x.independentOrigins===2));
  // F-15 mutation: make projection actor-independent and these same-reality endpoints converge.
  const self=await call('GET','/api/proactive/insights','a');ok('F-15 same reality gives governed actor-specific projections',self.status===200&&JSON.stringify(self.body)!==JSON.stringify(lead.body));
  // F-18 mutation: any provider dependency increments this counter and fails.
  ok('F-18 full tested lifecycle made zero model calls',modelCalls===0);
 }catch(e){fail++;console.log('  ✗ suite threw',e.stack||e.message)}finally{for(const n of exits)gateway[n]=originals[n];embeddings.embed=realEmbed;gateway.setDeterministicOnly(false);server.close();console.log(`\nno-llm-floor-smoke: ${pass} passed, ${fail} failed`);process.exit(fail?1:0)}});
