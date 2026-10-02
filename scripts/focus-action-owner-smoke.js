/* Truth layer — a personal Focus outcome remains in its owner's record. */
process.env.DB_OPTIONAL='1'; process.env.NODE_ENV='test';
const S=require('../server'); let pass=0,fail=0; const ok=(n,c)=>{if(c){pass++;console.log('  PASS',n)}else{fail++;console.error('  FAIL',n)}};
const C='focus-action',U='u';
S._loadAllStores({orgMeta:{[C]:{}},orgUsers:{[C]:{[U]:{id:U,name:'U',email:'u@f.test',role:'member',status:'active'}}}});S._rebuildEmailIndex();
const server=S.app.listen(0,async()=>{const base=`http://127.0.0.1:${server.address().port}`,H={Authorization:`Bearer ${S.issueToken(U,C,'member')}`,'Content-Type':'application/json'};
try{const made=await fetch(base+'/api/me/prepared/act',{method:'POST',headers:H,body:JSON.stringify({text:'Practice scanning',type:'growth',decision:'approve'})}).then(r=>r.json());
const focus=made.focuses[0], action=(S.actionsLog[C]||[]).find(a=>a.focusRef===focus.id);
ok('F52.1 approving a personal Focus leaves no organisation-visible Action-loop record',!action);
await fetch(base+'/api/me/focus/outcome',{method:'POST',headers:H,body:JSON.stringify({focusId:focus.id,outcome:'helped'})});
ok('F52.2 recording an outcome updates the owner-owned Focus',S._getMemory(C,U).focuses.find(f=>f.id===focus.id)?.outcome?.result==='helped');
const snap=JSON.parse(JSON.stringify(S._persistedStores()));ok('F52.3 the outcome survives persistence without entering shared learning',!JSON.stringify(snap.userAiProfiles).includes('actionId')&&!(snap.actionsLog[C]||[]).some(a=>a.focusRef===focus.id)&&!(snap.noticeFeedback[C]||{}).growth);
}catch(e){fail++;console.error('  FAIL suite threw',e.stack)}server.close(()=>{console.log(`\nfocus-action-owner-smoke: ${pass} passed, ${fail} failed`);process.exit(fail?1:0)})});
