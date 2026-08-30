/* Truth layer — D52: Focus is the product projection over the Action loop. */
process.env.DB_OPTIONAL='1'; process.env.NODE_ENV='test';
const S=require('../server'); let pass=0,fail=0; const ok=(n,c)=>{if(c){pass++;console.log('  PASS',n)}else{fail++;console.error('  FAIL',n)}};
const C='focus-action',U='u';
S._loadAllStores({orgMeta:{[C]:{}},orgUsers:{[C]:{[U]:{id:U,name:'U',email:'u@f.test',role:'member',status:'active'}}}});S._rebuildEmailIndex();
const server=S.app.listen(0,async()=>{const base=`http://127.0.0.1:${server.address().port}`,H={Authorization:`Bearer ${S.issueToken(U,C,'member')}`,'Content-Type':'application/json'};
try{const made=await fetch(base+'/api/me/prepared/act',{method:'POST',headers:H,body:JSON.stringify({text:'Practice scanning',type:'growth',decision:'approve'})}).then(r=>r.json());
const focus=made.focuses[0], action=(S.actionsLog[C]||[]).find(a=>a.focusRef===focus.id);
ok('F52.1 approving a Focus creates its canonical Action-loop record',action?.stage==='observe'&&action.status==='executed');
await fetch(base+'/api/me/focus/outcome',{method:'POST',headers:H,body:JSON.stringify({focusId:focus.id,outcome:'helped'})});
ok('F52.2 recording the Focus outcome advances the same Action through evaluate into learn',action.stage==='learn'&&action.status==='evaluated'&&action.evaluation.improved===true);
const snap=JSON.parse(JSON.stringify(S._persistedStores()));ok('F52.3 Focus does not store a duplicate action identity',!JSON.stringify(snap.userAiProfiles).includes('actionId')&&snap.actionsLog[C].some(a=>a.focusRef===focus.id));
}catch(e){fail++;console.error('  FAIL suite threw',e.stack)}server.close(()=>{console.log(`\nfocus-action-owner-smoke: ${pass} passed, ${fail} failed`);process.exit(fail?1:0)})});
