'use strict';
process.env.DB_OPTIONAL='1'; process.env.NODE_ENV='test'; process.env.IQ_COMPOSER='1';
const { chromium } = require('playwright-core');
const EXE='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const S=require('../server.js'); const {app,_loadAllStores,_rebuildEmailIndex,issueToken}=S;
const C='nv1';
// A BRAND NEW ORDINARY MEMBER. No focuses, no highs, no lows, no inquiries, no forum, no folders.
_loadAllStores({orgMeta:{[C]:{orgName:'Alma College',orgMode:'sports'}},
 orgUsers:{[C]:{me:{id:'me',name:'Sam',email:'sam@x.io',role:'member',orgCode:C,status:'active',assignedNodeIds:['n1'],profileComplete:true}}},
 orgNodes:{[C]:{n1:{nodeId:'n1',name:'First Team',memberIds:['me'],leaderIds:[]}}}});
_rebuildEmailIndex();
(async()=>{
 const server=await new Promise(r=>{const s=app.listen(0,()=>r(s));});
 const base=`http://127.0.0.1:${server.address().port}`; const token=issueToken('me',C,'member');
 const browser=await chromium.launch({executablePath:EXE,args:['--no-sandbox']});
 const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
 const page=await ctx.newPage();
 page.on('pageerror',e=>console.error('  [PAGE ERROR]',e.message));
 await page.addInitScript(([t,code])=>{localStorage.setItem('iq_auth',JSON.stringify({user:{id:'me',name:'Sam',role:'member',orgCode:code,profileComplete:true},org:{orgName:'Alma College',orgMode:'sports',organizationProfileComplete:true},token:t,permissions:{},domain:null}));localStorage.setItem('iq_profile_complete_me','1');},[token,C]);
 await page.goto(base+'/',{waitUntil:'networkidle'}).catch(()=>{}); await page.waitForTimeout(1200);
 const notice=await page.$('button:has-text("I understand")'); if(notice){await notice.click().catch(()=>{});await page.waitForTimeout(500);}
 const look = async (label) => {
   await page.waitForTimeout(1000);
   const r = await page.evaluate(() => {
     const vis = el => { const c=getComputedStyle(el); const b=el.getBoundingClientRect();
       return b.height>0 && b.width>0 && c.display!=='none' && c.visibility!=='hidden' && c.opacity!=='0'; };
     const pg = [...document.querySelectorAll('.page')].find(vis);
     const txt = pg ? (pg.innerText||'').trim().replace(/\n{2,}/g,'\n').split('\n').slice(0,14) : ['(no visible page)'];
     const btns = [...document.querySelectorAll('button,a[href],select')].filter(vis)
       .map(b=>(b.innerText||b.getAttribute('aria-label')||'').trim()).filter(Boolean);
     const comp = document.querySelector('#iq-composer, .iq-composer, [data-composer]');
     const inp = document.querySelector('#iq-composer-input, .iq-composer textarea, .iq-composer input[type=text]');
     return { txt, btns:[...new Set(btns)].slice(0,16),
       composerVisible: !!(comp&&vis(comp)), placeholder: inp?(inp.getAttribute('placeholder')||''):'(none)',
       overflow: document.documentElement.scrollWidth>document.documentElement.clientWidth };
   });
   console.log('\n===== '+label+' =====');
   console.log('WHAT SAM READS:'); r.txt.forEach(l=>console.log('   '+l));
   console.log('WHAT SAM CAN PRESS: '+r.btns.join(' | '));
   console.log('COMPOSER: '+(r.composerVisible?'visible':'ABSENT')+'  PLACEHOLDER: "'+r.placeholder+'"  OVERFLOW: '+(r.overflow?'YES':'no'));
 };
 await look('HOME');
 for (const p of ['focus','notes','settings']) {
   await page.evaluate(x=>navigate(x),p).catch(()=>{});
   await page.waitForTimeout(1000);
   const d = await page.evaluate(() => {
     const cands = ['#iq-composer','.iq-composer','[data-composer]','#iq-composer-input','.iq-composer-wrap','form.iq-composer'];
     const out = {};
     for (const s of cands) { const el=document.querySelector(s); if(!el){out[s]='(absent from DOM)';continue;}
       const c=getComputedStyle(el); const b=el.getBoundingClientRect();
       out[s] = 'display='+c.display+' vis='+c.visibility+' h='+Math.round(b.height)+' w='+Math.round(b.width)+' top='+Math.round(b.top); }
     const inp=document.querySelector('textarea,input[type=text]');
     out['FIRST TEXT INPUT']= inp? (inp.id||inp.className)+' h='+Math.round(inp.getBoundingClientRect().height)+' top='+Math.round(inp.getBoundingClientRect().top) : 'none';
     return out;
   });
   console.log('\n== COMPOSER ON '+p.toUpperCase()+' ==');
   for (const k in d) console.log('   '+k+': '+d[k]);
 }
 await browser.close(); server.close(); process.exit(0);
})();
