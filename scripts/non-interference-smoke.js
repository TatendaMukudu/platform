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
console.log(`\nnon-interference-smoke: ${pass} passed, ${fail} failed`);process.exit(fail?1:0);
