/* B5: person understanding is earned across days, can dorm, correct, reactivate. */
const pm=require('../ai/person-model'); const {STALE,REJECT}=require('../ai/self-model');
const DAY=86400000,T=Date.UTC(2026,0,1);let pass=0,fail=0;const ok=(n,c)=>{c?pass++:fail++;console.log(c?'  ✓':'  ✗',n)};
let m=pm.blankModel(); for(let i=0;i<9;i++)pm.update(m,{communication:'brief',at:T+i*1000});
ok('many observations on one day remain one temporal observation',m.communication.brief.days.length===1&&!pm.understanding(m,{now:T+DAY}).communication);
[1,2].forEach(d=>pm.update(m,{communication:'brief',at:T+d*DAY}));
ok('three distinct days establish an understanding',pm.understanding(m,{now:T+2*DAY}).communication?.evidence===3);
ok('old observations become dormant without being erased',!pm.understanding(m,{now:T+2*DAY+STALE+1}).communication&&m.communication.brief.days.length===3);
pm.update(m,{communication:'brief',at:T+2*DAY+STALE+2});
ok('recent evidence reactivates the preserved history',pm.understanding(m,{now:T+2*DAY+STALE+2}).communication?.evidence===4);
pm.correct(m,{dimension:'communication',token:'brief',at:T+2*DAY+STALE+3});
ok('correction suppresses the characterization without deleting history',!pm.understanding(m,{now:T+2*DAY+STALE+4}).communication&&m.communication.brief.days.length===4);
ok('correction cooldown has the ratified duration',m.communication.brief.rejectedUntil===T+2*DAY+STALE+3+REJECT);
ok('public projection remains contentless',JSON.stringify(pm.publicProjection(m))===JSON.stringify({hasModel:true,interactions:m.interactions}));
console.log(`\nperson-model-temporal-smoke: ${pass} passed, ${fail} failed`);process.exit(fail?1:0);
