/* B2/B3: Web publication needs safe cohort complements and independent origins. */
process.env.DB_OPTIONAL='1'; process.env.NODE_ENV='test';
const S=require('../server');
let pass=0,fail=0; const ok=(n,c)=>{c?pass++:fail++;console.log(c?'  ✓':'  ✗',n)};
const finding=(confidence='clear',severity='medium')=>({type:'momentum_drop',confidence,severity});
const group=(ids,origins,conf=['clear'],sev=['medium'])=>({momentum_drop:{
 findings:ids.map((_,i)=>finding(conf[i%conf.length],sev[i%sev.length])),
 contributions:ids.map((id,i)=>({status:'contributed',contributorId:id,originRef:origins[i],authority:'self_report'}))
}});
const run=(g,n)=>S._webIntelligence(g,n,{momentum_drop:{shown:0,helpful:0}},Date.now());
ok('k=n is suppressed even though k clears the minimum',run(group(['a','b','c','d','e'],['oa','ob','oc','od','oe']),5).length===0);
ok('a complement below the floor is suppressed',run(group(['a','b','c','d','e'],['oa','ob','oc','od','oe']),9).length===0);
ok('a below-floor finding cohort is suppressed',run(group(['a','b'],['oa','ob']),12).length===0);
ok('safe two-sided cohort may surface',run(group(['a','b','c','d','e'],['oa','ob','oc','od','oe']),12).length===1);
ok('ten relays of one origin are not corroboration',run(group(['a','b','c','d','e'],Array(5).fill('rumour')),8).length===0);
ok('missing origins fail closed',run(group(['a','b','c','d','e'],[null,null,null,null,null]),12).length===0);
const derived=run(group(['a','b','c','d','e'],['oa','ob','oc','od','oe'],['clear','tentative'],['low','high']),12)[0];
ok('confidence is conservative and severity reflects strongest constituent',derived?.kernelConfidence==='tentative'&&derived?.severity==='high');
ok('internal origins are never rendered',derived&&!JSON.stringify(derived).includes('oa')&&!JSON.stringify(derived).includes('ob'));
console.log(`\nprivacy-inference-smoke: ${pass} passed, ${fail} failed`);process.exit(fail?1:0);
