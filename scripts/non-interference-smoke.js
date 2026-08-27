/* Lane C — authorised output is invariant to private context. */
process.env.DB_OPTIONAL='1';process.env.NODE_ENV='test';
const S=require('../server'),intel=require('../ai/intelligence'),reason=require('../ai/reason');let pass=0,fail=0;const ok=(n,c)=>{c?pass++:fail++;console.log(c?'  PASS':'  FAIL',n)};
const finding={type:'plateau',severity:'medium',confidence:'clear',basis:'steady effort with flat outcome'};
const publicMember={id:'m',name:'Member',deviations:[],connections:[],hasSensitiveContext:false};
const privateWorld={...publicMember,hasSensitiveContext:true};
const publicItem=intel.composeBriefingItem(publicMember,[finding]),privateItem=intel.composeBriefingItem(privateWorld,[finding]);
const clean=x=>S._sanitizeBriefingForLeader({summary:'Same state',items:[x]});
// C01 mutation: restore `{...it}` without removing careFlag; payloads differ.
ok('C01 leader briefing is identical across private-context worlds',JSON.stringify(clean(publicItem))===JSON.stringify(clean(privateItem)));
// C02 mutation: retain b.careFlag in _register; private world flips scout to support.
const belief={polarity:'risk',axis:'growth',severity:'medium'};
ok('C02 leader recommendation register ignores private context',reason._register({...belief,careFlag:false})==='scout'&&reason._register({...belief,careFlag:true})==='scout');
// C03 mutation: allow the flag into sanitizer; this key appears.
ok('C03 leader payload contains no private-context flag',!Object.prototype.hasOwnProperty.call(clean(privateItem).items[0],'careFlag'));
// C04 mutation: delete careFlag at composition and the subject-side distinction disappears.
ok('C04 subject-side item may still retain contentless care context',publicItem.careFlag===false&&privateItem.careFlag===true);

/* C05/C06 — THE WATCH SURFACE. Found by a browser pass a month before the pilot: the coach's
   early-warning strip shipped `careFlag` and raw deviation percentages, because the corrections
   that cleaned the briefing were applied to _sanitizeBriefingForLeader and this endpoint never
   went through it. Every leader-facing surface must obey the same rules, and the way to keep
   that true is to assert it per surface rather than per function. */
const src=require('fs').readFileSync(require('path').join(__dirname,'..','server.js'),'utf8');
const watchRow=src.slice(src.indexOf('GET /api/intelligence/watch'),src.indexOf('GET /api/intelligence/watch')+3000);
// C05 mutation: put `careFlag: item.careFlag` back on the row.
ok('C05 the watch row carries no private-context flag',!/careFlag:\s*item\.careFlag/.test(watchRow));
// C06 mutation: drop either _stripLeaderNumbers call and a member's figures reach a coach.
ok('C06 the watch row strips a member\'s numbers, as the briefing does',
  /why:\s*_stripLeaderNumbers\(item\.whyNow\)/.test(watchRow)&&/action:\s*_stripLeaderNumbers\(item\.recommendedAction\)/.test(watchRow));

console.log(`\nnon-interference-smoke: ${pass} passed, ${fail} failed`);process.exit(fail?1:0);
