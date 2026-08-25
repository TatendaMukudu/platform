/* B6: graph truth fingerprints scope and invalidation is organisation-wide. */
process.env.DB_OPTIONAL='1';process.env.NODE_ENV='test';const S=require('../server');
let pass=0,fail=0;const ok=(n,c)=>{c?pass++:fail++;console.log(c?'  ✓':'  ✗',n)};const C='graph-cache';
S._loadAllStores({orgUsers:{[C]:{lead:{id:'lead',orgCode:C,role:'admin',status:'active'},a:{id:'a',orgCode:C,role:'member',status:'active'}}},orgNodes:{[C]:{n:{nodeId:'n',parentId:null,leaderIds:['lead'],memberIds:['a']}}}});S._backfillUserNodeIds();
const before=S._orgGraphFingerprint(C);S.orgNodes[C].n.memberIds=[];const after=S._orgGraphFingerprint(C);
ok('governed membership changes the graph fingerprint',before!==after);
S.orgUsers[C].lead.name='Renamed';ok('profile names do not enter the graph fingerprint',S._orgGraphFingerprint(C)===after);
ok('shared invalidation helper accepts the affected organisation',S._invalidateOrgProjections(C)===undefined);
S.orgNodes[C].n.memberIds=['a'];const first=S._getOrgState({actor:'lead',organisationId:C});S.orgNodes[C].n.memberIds=[];const second=S._getOrgState({actor:'lead',organisationId:C});
ok('graph mutation misses the prior cached projection without a TTL wait',first._cache.hit===false&&second._cache.hit===false);
console.log(`\ngraph-invalidation-smoke: ${pass} passed, ${fail} failed`);process.exit(fail?1:0);
