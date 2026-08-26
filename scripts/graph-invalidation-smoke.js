/* B6 — cache invalidation proven through person-removal and tree-mutation HTTP routes. */
process.env.DB_OPTIONAL='1';process.env.NODE_ENV='test';
const db=require('../db');db.loadStores=async()=>({units:{},revisions:{}});db.saveStores=async units=>({rows:Object.keys(units).length,conflicts:[]});
const S=require('../server');let pass=0,fail=0;const ok=(n,c)=>{c?pass++:fail++;console.log(c?'  ✓':'  ✗',n)};const C='graph-http';
const users={admin:{id:'admin',name:'Admin',email:'admin@g',role:'superadmin',orgCode:C,status:'active'},coach:{id:'coach',name:'Coach',email:'coach@g',role:'coach',orgCode:C,status:'active'},a:{id:'a',name:'A',email:'a@g',role:'member',orgCode:C,status:'active'},b:{id:'b',name:'Erased B',email:'b@g',role:'member',orgCode:C,status:'active'},c:{id:'c',name:'Moved C',email:'c@g',role:'member',orgCode:C,status:'active'},d:{id:'d',name:'Other D',email:'d@g',role:'member',orgCode:C,status:'active'}};
const nodes={team:{nodeId:'team',name:'Team',parentId:null,childNodeIds:[],leaderIds:['coach'],memberIds:['a','b','c'],rev:0},other:{nodeId:'other',name:'Other',parentId:null,childNodeIds:[],leaderIds:[],memberIds:['d'],rev:0}};
(async()=>{await S._reconstruct({orgMeta:{[C]:{orgName:'Graph'}},orgUsers:{[C]:users},orgNodes:{[C]:nodes}});S._rebuildEmailIndex();
 const server=S.app.listen(0);await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`, token=id=>S.issueToken(id,C,users[id]?.role||'member');
 const call=async(method,path,id,body)=>{const r=await fetch(base+path,{method,headers:{Authorization:`Bearer ${token(id)}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return{status:r.status,body:await r.json().catch(()=>({}))}};
 try{
  const first=await call('GET','/api/intelligence/roster','coach');const names=x=>x.body.roster.map(r=>r.name).sort().join(',');
  ok('reader cache is populated with governed members',first.status===200&&names(first)==='A,Erased B,Moved C');
  const erased=await call('DELETE','/api/auth/users/b?deleteData=true','admin');const afterErase=await call('GET','/api/intelligence/roster','coach');
  ok('person removal route succeeds',erased.status===200);
  ok('next cached read immediately excludes erased identity',afterErase.status===200&&names(afterErase)==='A,Moved C'&&!JSON.stringify(afterErase.body).includes('Erased B'));
  ok('no private or unrelated identity leaks after erasure',!JSON.stringify(afterErase.body).includes('Other D')&&!/evidence|checkin|basis/i.test(JSON.stringify(afterErase.body)));
  const moved=await call('PUT','/api/tree/node/team','admin',{ifRev:0,memberIds:['a'],leaderIds:['coach']});const afterMove=await call('GET','/api/intelligence/roster','coach');
  ok('tree mutation crosses the protected durable route',moved.status===200&&moved.body.node.rev===1);
  ok('affected reader loses exactly the removed scope without TTL wait',afterMove.status===200&&names(afterMove)==='A'&&!JSON.stringify(afterMove.body).includes('Moved C'));
  const fp=S._orgGraphFingerprint(C);S.orgUsers[C].coach.name='Renamed';ok('graph fingerprint excludes profile names',S._orgGraphFingerprint(C)===fp);
 }catch(e){fail++;console.log('  ✗ suite threw',e.stack||e.message)}finally{server.close();console.log(`\ngraph-invalidation-smoke: ${pass} passed, ${fail} failed`);process.exit(fail?1:0)}})();
