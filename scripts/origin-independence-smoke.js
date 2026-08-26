/* P0-5′ — authorship survives transformations; echoes mint no independence.
   O-12/O-14 remain benchmark probes by ratified contract: model-issued refs across
   turns are prompt-enforced today and are not silently claimed solved here. */
process.env.DB_OPTIONAL='1';process.env.NODE_ENV='test';
const c=require('../ai/contribution'),d=require('../ai/diagnose'),S=require('../server');let pass=0,fail=0;const ok=(n,x)=>{x?pass++:fail++;console.log(x?'  ✓':'  ✗',n)};
const contribution=(who,origin,id=who)=>({status:'contributed',contributorId:who,evidenceRef:`e_${id}`,concept:'shape',label:'Shape',originRef:origin,originKind:'direct_observation',occasion:`t_${id}`,authority:'self_report'});
const decision=x=>c.shouldOpenGroupInquiry(x,{now:Date.now()});
const web=x=>S._webIntelligence({momentum_drop:{findings:x.map(()=>({type:'momentum_drop',confidence:'clear',severity:'medium'})),contributions:x}},Math.max(12,x.length+5),{momentum_drop:{}},Date.now());
const one=[contribution('a','prime')];const repeat=[contribution('a','prime','1'),contribution('a','prime','2')];
ok('O-1 one person repeating one origin remains one origin',decision(repeat).independentOrigins===1&&!decision(repeat).open);
const echoes=Array.from({length:10},(_,i)=>contribution(`p${i}`,'prime',i));
ok('O-2 ten people repeating one origin receive ECHO',decision(echoes).rule==='ECHO'&&decision(echoes).independentOrigins===1);
ok('O-2 repeated origin creates no Web artifact',web(echoes).length===0);
// Two independent origins is what OPENS an inquiry (the origin rule). Publishing it as a Web
// artifact is a separate, stricter question — the cohort floor of five — so the fixture
// carries five contributors to exercise both rules rather than conflating them.
const independent=[contribution('a','oa'),contribution('b','ob')];
const publishable=['a','b','c','d','e'].map(id=>contribution(id,`o_${id}`));
ok('O-3 two people with two origins open the inquiry',decision(independent).rule==='INDEPENDENT_CORROBORATION');
ok('O-3 …and a cohort that also clears the disclosure floor may be published',web(publishable).length===1);
const original=contribution('a','human-origin');
const summary=c.toGroupProposal({...original,evidenceRef:'summary',originKind:'machine_summary'});
const extraction=c.toGroupProposal({...original,evidenceRef:'extract',originKind:'machine_extraction'});
ok('O-4 machine summary preserves prime human origin',summary.originRef==='human-origin');
ok('O-5 machine extraction preserves prime human origin',extraction.originRef==='human-origin');
ok('O-6 human account plus transformations remain one origin',new Set([original.originRef,summary.originRef,extraction.originRef]).size===1);
ok('O-7 genuine independent human observations are not suppressed',decision(independent).open);
let inq=d.newInquiry({subjectRef:'group:x',topic:'shape',now:1});inq=d.applyProposals(inq,[c.toGroupProposal(original,{now:2})],{now:2});
const replacement={...c.toGroupProposal({...original,evidenceRef:'replacement'},{now:3}),corrects:'e_a',correctionReason:'corrected'};inq=d.applyProposals(inq,[replacement],{now:3});
ok('O-8 correction supersedes without increasing active origins',inq.signals.some(s=>s.ref==='e_a'&&s.status==='superseded')&&new Set(inq.signals.filter(d.isActive).map(s=>s.originRef)).size===1);
ok('O-9 superseded origins do not support current confidence',d.deriveConfidence(inq.signals,{now:3}).because.some(x=>/1 independent origin/.test(x)));
const contested=d.applyProposals(inq,[{...c.toGroupProposal(contribution('b','other','dissent'),{now:4}),corrects:'replacement'}],{now:4});
ok('O-10 unauthorised correction becomes visible dissent',contested.signals.some(s=>s.dissents)&&new Set(contested.signals.filter(d.isActive).map(s=>s.originRef)).size===2);
const sameTurn=['x','y','z'].map((o,i)=>({ref:`s${i}`,status:'active',originRef:o,source:'same',turnId:'turn',directness:'direct',authority:'self_report',specificity:.6,at:5}));
ok('O-11 invented refs in one turn remain one temporal occasion',d.deriveConfidence(sameTurn,{now:5}).because.some(x=>/3 signals across 1 occasion/.test(x)));
const unknown=Array.from({length:5},(_,i)=>({ref:`u${i}`,status:'active',source:`p${i}`,turnId:`t${i}`,at:5}));
ok('O-13 missing origins are explicitly unestablished and capped',d.deriveConfidence(unknown,{now:5}).because.some(x=>/origin not established/.test(x)));
console.log(`\norigin-independence-smoke: ${pass} passed, ${fail} failed`);process.exit(fail?1:0);
