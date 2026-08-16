/* Truth layer — LAW C2: a constitutional refusal is explained, offers a compliant
   alternative, is recordable content-free, and never weakens the boundary. */
'use strict';
const R = require('../ai/refusal');
const A = require('../ai/audit');
let pass=0, fail=0; const ok=(n,c)=>{if(c){pass++;console.log('  ✓',n);}else{fail++;console.log('  ✗',n);}};
const decision={ denied:true, effect:'deny', reason:'IntelliQ may never delete meetings', rule:{id:'calendar-delete',effect:'deny',capability:'calendar',verb:'delete'} };
const r=R.fromPolicyDenial(decision,{capability:'calendar',verb:'delete',stage:'execute'});
console.log('constitutional-refusal-smoke — LAW C2\n');
ok('1 · a deny becomes an explicit refusal', r && r.refused===true);
ok('2 · it names the constitutional boundary and matched rule', r.boundary==='organisation_constitution' && r.ruleId==='calendar-delete');
ok('3 · it explains the refusal without exposing policy internals', /never delete meetings/i.test(r.explanation) && !JSON.stringify(r).includes('conditions'));
ok('4 · it offers a non-executing compliant alternative', /draft|permitted/i.test(r.alternative));
ok('5 · it never converts deny into approval or execution', !('allowed' in r) && !('execute' in r));
ok('6 · a non-denial creates no refusal', R.fromPolicyDenial({denied:false,effect:'allow'},{})===null);
const entry=A.record({actor:'coach',action:'constitutional_refusal',basis:r.auditBasis,at:1});
ok('7 · the conflict is accepted by the accountability log', entry && entry.action==='constitutional_refusal');
ok('8 · the record is content-free', entry && !('explanation' in entry) && !('alternative' in entry) && !('request' in entry));
const hostile=R.fromPolicyDenial({...decision,reason:'x'.repeat(1000)},{capability:'x'.repeat(500),verb:'delete',stage:'execute'});
ok('9 · output is bounded against hostile policy text', hostile.explanation.length<=240 && hostile.auditBasis.length<=120);
console.log(`\nconstitutional-refusal-smoke: ${pass} passed, ${fail} failed`); process.exit(fail?1:0);
