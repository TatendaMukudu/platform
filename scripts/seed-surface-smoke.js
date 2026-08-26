/* H4 — the existing demo seed reaches the team-grain surface through production builders. */
process.env.DB_OPTIONAL='1';process.env.NODE_ENV='test';
process.env.CLUB_DAYS='30';
const {buildDemoStore,DEMO_CODE}=require('./seed');
const {buildClubStore}=require('./seed-club');
const T=require('../ai/team-state');
const S=require('../server');
let pass=0,fail=0;const ok=(n,c)=>{c?pass++:fail++;console.log(c?'  PASS':'  FAIL',n)};
(async()=>{try{
 const store=await buildDemoStore();S._loadAllStores(store);S._backfillUserNodeIds();
 const node=store.orgNodes[DEMO_CODE].demo_varsity;
 const surface=T.buildTeamState({node:{...node,memberCount:node.memberIds.length},
  inquiries:S._groupInquiryProjections(DEMO_CODE,node.nodeId),focuses:S._teamFocuses(DEMO_CODE,node.nodeId),now:Date.now()});
 // H4-1 mutation: remove either role_clarity offer in extendDemoTeamSurface.
 ok('H4-1 seed has an open group Inquiry with two independent origins',surface.low?.basis?.independentOrigins===2);
 // H4-2 mutation: change the peer_support contribution valence.
 ok('H4-2 seed has a contributed High',surface.high?.about==='Peer support'&&surface.high.source==='contributed');
 // H4-3 mutation: change the role_clarity contribution valence.
 ok('H4-3 seed has a contributed Low',surface.low?.about==='Role clarity'&&surface.low.source==='contributed');
 // H4-4 mutation: remove recordFocusOutcome from the seed path.
 ok('H4-4 seed has a team Focus with a recorded outcome',surface.history.some(f=>f.focusId==='tf_demo_role_clarity'&&f.outcome?.result==='better'));
 // H4-5 mutation: add a second travel_routine contributor so the cohort floor clears.
 ok('H4-5 seed visibly reports one finding withheld by the cohort floor',surface.withheld.some(w=>w.about==='Travel routine'&&w.blocked.some(b=>b.gate==='cohort')));
 // H4-6 mutation: remove extendSeedTeamSurface from buildClubStore.
 const club=await buildClubStore();S._loadAllStores(club.store);S._backfillUserNodeIds();
 const clubCode=club.summary.code, clubNodeId=Object.keys(club.store.teamFocuses[clubCode])[0], clubNode=club.store.orgNodes[clubCode][clubNodeId];
 const clubSurface=T.buildTeamState({node:{...clubNode,memberCount:clubNode.memberIds.length},
  inquiries:S._groupInquiryProjections(clubCode,clubNodeId),focuses:S._teamFocuses(clubCode,clubNodeId),now:Date.now()});
 ok('H4-6 full club seed reaches the same High/Low/Focus/withheld surface',!!clubSurface.high&&!!clubSurface.low&&clubSurface.history.some(f=>f.outcome)&&clubSurface.withheld.length>0);
}catch(e){fail++;console.error(e.stack||e.message)}finally{console.log(`\nseed-surface-smoke: ${pass} passed, ${fail} failed`);process.exit(fail?1:0)}})();
