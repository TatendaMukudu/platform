/* Lane A — a mutation-sensitive no-LLM capability floor through HTTP boundaries.
   Every assertion below performs a request; setup may seed raw evidence/candidates,
   but no assertion merely reads back a seeded final Inquiry or Focus. */
process.env.DB_OPTIONAL='1';process.env.NODE_ENV='test';process.env.IQ_DETERMINISTIC_ONLY='1';
process.env.ANTHROPIC_API_KEY='mutation-sentinel';process.env.OPENAI_API_KEY='mutation-sentinel';
const gateway=require('../ai/gateway'),embeddings=require('../ai/embeddings');let modelCalls=0;
for(const name of ['complete','completeJSON','understand','transcribe'])gateway[name]=async()=>{modelCalls++;throw new Error(`model exit:${name}`)};
embeddings.embed=async()=>{modelCalls++;throw new Error('model exit:embed')};
const S=require('../server');let pass=0,fail=0;const ok=(n,c)=>{c?pass++:fail++;console.log(c?'  PASS':'  FAIL',n)};
const C='floor',O='other',now=Date.now(),D=86400000;
const user=(id,role='member',org=C)=>({id,name:id.toUpperCase(),email:`${id}@x`,role,orgCode:org,status:'active'});
const ev=(id,sub,v,d,visibility='shared')=>({id,orgCode:C,status:'active',subjectId:sub,type:'metric',label:'mood',visibility,value:v,observedAt:new Date(now-d*D).toISOString(),provider:'checkin',source:'observed',originRef:`origin:${id}`,originKind:'direct_observation'});
const users={lead:user('lead','superadmin'),coach:user('coach','coach'),out:user('out')};
// FOURTEEN members. The cohort floor is five and two-sided, so a four-person node can never
// publish anything and could only prove that the floor refuses, never that it permits.
const SQUAD=['a','b','c','d','e','f','g','h','i','j','k','l','m','n'];for(const id of SQUAD)users[id]=user(id);
const nodes={team:{nodeId:'team',name:'Team',parentId:null,childNodeIds:[],leaderIds:['coach'],memberIds:SQUAD,rev:0}};
const series=(s,old,recent)=>[ev(`${s}1`,s,old,30),ev(`${s}2`,s,old,25),ev(`${s}3`,s,old,20),ev(`${s}4`,s,recent,5),ev(`${s}5`,s,recent,3),ev(`${s}6`,s,recent,1)];
S._loadAllStores({orgMeta:{[C]:{orgName:'Floor'},[O]:{orgName:'Other'}},orgUsers:{[C]:users,[O]:{alien:user('alien','member',O)}},orgNodes:{[C]:nodes,[O]:{}},evidenceLog:{[C]:[...['a','b','c','d','e','f'].flatMap(id=>series(id,4,2)),...['g','h','i','j','k','l','m','n'].flatMap(id=>series(id,2,4)),ev('private','a',1,1,'private')]}});S._backfillUserNodeIds();S._rebuildEmailIndex();
for(const id of ['a','b','c','d','e'])S._noteGroupCandidates(C,id,`member:${id}`,[{id:`ge_${id}`,level:'observation',text:'shape unclear',sourceSpan:'our shape is unclear',concerns:'group',originRef:`o_${id}`,originKind:'direct_observation',turnId:`turn_${id}`}],'shape','Shape');
(async()=>{const server=S.app.listen(0);await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
 const token=(id,org=C)=>S.issueToken(id,org,(S.orgUsers[org]||{})[id]?.role||'member');
 const call=async(method,path,id='a',body,org=C)=>{const r=await fetch(base+path,{method,headers:{Authorization:`Bearer ${token(id,org)}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return{status:r.status,body:await r.json().catch(()=>({}))}};
 try{
  // A01 mutation: remove deterministicOnly from gateway.enabled; dummy credentials make this red.
  let r=await call('GET','/api/auth/me');ok('A01 switch is load-bearing with credentials present',r.status===200&&gateway.deterministicOnly()&&!gateway.enabled());
  // A02 mutation: remove node membership from visibleNodes; group discovery becomes empty.
  r=await call('GET','/api/group/mine','a');ok('A02 member resolves only their real group',r.status===200&&r.body.groups.length===1&&r.body.groups[0].nodeId==='team');
  // A03 mutation: let outsiders through _mayReadGroup.
  r=await call('GET','/api/group/team/state','out');ok('A03 group scope refuses an outsider',r.status===403);
  // A04 mutation: reveal cross-tenant existence in _groupSubjectRef.
  r=await call('GET','/api/group/team/state','alien',undefined,O);ok('A04 cross-tenant group read fails closed',r.status===404);
  // A05 mutation: seed/auto-open inquiry before explicit contribution.
  r=await call('GET','/api/group/team/state','coach');ok('A05 no group claim exists before deliberate contribution',r.status===200&&!r.body.low&&!r.body.high);
  const cand=id=>S.groupCandidates[C].find(x=>x.contributorId===id&&x.status==='detected');
  // A06 mutation: make a single ordinary origin open the inquiry.
  r=await call('POST','/api/group/team/contribute','a',{candidateId:cand('a').candidateId,valence:'worth_attention'});ok('A06 one ordinary contribution stays below threshold',r.status===200&&r.body.groupInquiry==='not yet');
  // A07 mutation: stop the second independent contribution from opening.
  r=await call('POST','/api/group/team/contribute','b',{candidateId:cand('b').candidateId,valence:'worth_attention'});ok('A07 second independent origin opens group Inquiry',r.status===200&&r.body.groupInquiry==='open');
  // Opening the inquiry and PUBLISHING it are different rules: two independent origins open it,
  // five contributors of fourteen clear the disclosure floor. Both exercised, neither conflated.
  for(const id of ['c','d','e'])await call('POST','/api/group/team/contribute',id,{candidateId:cand(id).candidateId,valence:'worth_attention'});
  // A08 mutation: mint/replace origins in toGroupProposal.
  r=await call('GET','/api/group/team/inquiry','coach');const inquiryId=r.body.inquiries?.[0]?.inquiryId;ok('A08 HTTP Inquiry read preserves every contributor origin, minting none',r.status===200&&r.body.inquiries[0].independentOrigins===5&&r.body.inquiries[0].contributors===5);
  // A09 mutation: drop contributed valence in the projection.
  r=await call('GET','/api/group/team/state','coach');ok('A09 contributed difficulty becomes a team Low',r.status===200&&r.body.low?.kind==='low');
  // A10 mutation: remove the team surface privacy marker.
  r=await call('GET','/api/group/team/state','a');ok('A10 member gets the same privacy-safe team grain',r.status===200&&r.body.carriesPrivateContent===false&&!JSON.stringify(r.body).includes('origin:private'));
  // A11 mutation: allow an all-member basis through cohortFloor.
  r=await call('GET','/api/group/team/state','coach');ok('A11 two-sided cohort basis names a safe 5-of-14 aggregate',r.body.low?.basis?.contributors===5&&r.body.low?.basis?.of===14);
  // A12 mutation: remove prepared/act creation.
  r=await call('POST','/api/me/prepared/act','a',{text:'Protect recovery',type:'momentum_drop',decision:'approve'});const focusId=r.body.focuses?.[0]?.id;ok('A12 owner creates Focus through mutation route',r.status===200&&!!focusId);
  // A13 mutation: remove focus/outcome state transition.
  r=await call('POST','/api/me/focus/outcome','a',{focusId,outcome:'helped'});ok('A13 owner records Focus outcome through mutation route',r.status===200&&S.userAiProfiles[`${C}:a`].focuses.some(f=>f.id===focusId&&f.status==='done'&&f.outcome==='helped'));
  // A14 mutation: remove Focus from _persistedStores.
  const units=S._durableUnits(),iu=units[`store:inquiryStates:${C}`]&&JSON.parse(JSON.stringify(units[`store:inquiryStates:${C}`])),fu=units[`store:userAiProfiles:${C}`]&&JSON.parse(JSON.stringify(units[`store:userAiProfiles:${C}`]));delete S.inquiryStates[C];delete S.userAiProfiles[`${C}:a`];S._applyUnits({[`store:inquiryStates:${C}`]:iu,[`store:userAiProfiles:${C}`]:fu});
  r=await call('GET','/api/me/export','a');ok('A14 completed Focus survives durable reconstruction',r.status===200&&r.body.aiMemory?.focuses?.some(f=>f.id===focusId&&f.outcome==='helped'));
  // A15 mutation: remove Inquiry from _persistedStores.
  r=await call('GET','/api/group/team/inquiry','coach');ok('A15 created Inquiry survives durable reconstruction',r.status===200&&r.body.inquiries.some(i=>i.inquiryId===inquiryId));
  // A16 mutation: bypass the deterministic team-state answer in assistant runtime.
  r=await call('POST','/api/assistant/turn','coach',{text:'How is the team doing?'});ok('A16 assistant answers team question with models disabled',r.status===200&&/Shape|Worth attention|Working well/.test(String(r.body.response?.responseText||r.body.reply||r.body.answer||'')));
  // A17 mutation: remove deterministic leader briefing fallback.
  r=await call('GET','/api/intelligence/briefing?refresh=1','lead');ok('A17 leader briefing remains useful without a model',r.status===200&&Array.isArray(r.body.items));
  // A18 mutation: weaken role permission on leader briefing.
  r=await call('GET','/api/intelligence/briefing','a');ok('A18 member cannot gain leader briefing',r.status===403);
  // A19 mutation: remove owner scoping from export.
  r=await call('GET','/api/me/export','b');ok('A19 same endpoint gives actor-specific private projection',r.status===200&&r.body.profile?.id==='b'&&!JSON.stringify(r.body).includes(focusId));
  // A20 mutation: route any tested path to a provider.
  r=await call('GET','/api/group/team/state','coach');ok('A20 complete HTTP lifecycle makes zero model calls',r.status===200&&modelCalls===0);
 }catch(e){fail++;console.log('  FAIL suite threw',e.stack||e.message)}finally{server.close();console.log(`\nno-llm-floor-smoke: ${pass} passed, ${fail} failed`);process.exit(fail?1:0)}})();
