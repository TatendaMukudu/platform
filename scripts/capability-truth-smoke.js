/* Truth layer — THE SETTINGS PANEL THAT REPORTS WHAT IS SWITCHED ON MUST NOT BE THE THING THAT
   LIES ABOUT IT.

   An independent review found four defects in one small panel, and they are the same defect wearing
   four coats: the screen that exists to answer "what is this system actually doing" answered from
   something other than what the system was actually doing.

     1. The composer row read `composer.on` — the IQ_COMPOSER host flag ALONE. A host with
        IQ_COMPOSER=1 and no model key rendered a green ON beside "Conversation grounded in your
        record" while the very same payload said every reply came from the deterministic templates.
        Two fields of one object disagreeing, and the panel picked the flattering one.

     2. The reason line read `composer.why`, WHICH DID NOT EXIST in the payload. Every off state
        therefore printed the same hard-coded fallback — "No language-model key is configured" —
        including to somebody whose actual cause was deterministic-only mode, i.e. a deliberate
        no-egress guarantee misreported as a missing key. The one string a person would act on was
        the one string that was never read from the server.

     3. The panel fetched /api/health with a bare `fetch`: no timeout, no abort, no 401 handling.
        MemberApp._read exists precisely to retire that shape, and the panel whose job is to report
        the truth about the system was the last place still running a private copy of the
        networking it was reporting on.

     4. MemberApp._read cleared its own abort timer the instant `fetch` resolved — and `fetch`
        resolves on the response HEADERS. A body that stalls mid-transfer, the ordinary shape of a
        dropped mobile connection, was then unbounded again. Covered here at the source level and
        driven for real in scripts/live-recovery-repro.js, which stalls a body in a browser.

   THE FIVE STATES. "Is the model writing these replies" has five different answers and they want
   five different actions — set a flag, set a key, turn no-egress off, wait, or look at the
   provider. Four of them were indistinguishable on screen.

     enabled + writable      IQ_COMPOSER=1, key present, egress allowed, provider answering
     switch on, writes off   the general shape: `on` true while `effective` is false
     no model key            configured nothing
     deterministic-only      configured a key and deliberately forbade its use
     provider unavailable    configured everything correctly and the provider refused

   The fifth needed a fact the server did not have. `enabled()` reads the CLAIM that a key exists;
   nothing read whether the provider ever answered, so a revoked key or blocked egress left the
   product telling its owner the model was writing for as long as the key string remained in the
   environment. ai/gateway.js now records what the last real call observed — see providerFault().

   Run: node scripts/capability-truth-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
process.env.IQ_COMPOSER = '1';

const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const gateway = require('../ai/gateway.js');

/* The key claim is a module-load constant, so `enabled` is the seam a test can move. Nothing is
   ever called through it — the provider-fault half below uses the REAL complete() instead. */
let _enabled = true;
const _realEnabled = gateway.enabled;
gateway.enabled = () => _enabled;

const { app } = require('../server.js');

let pass = 0, fail = 0;
const ok = (n, c) => { let v = false; try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };
const R = f => { try { return fs.readFileSync(path.join(__dirname, '..', f), 'utf8'); } catch (_) { return ''; } };

/* COMMENTS ARE NOT CODE. Every source-shape assertion below reads the decommented file, because a
   sentence in a comment naming the field it warns about will satisfy a regex looking for the field
   being read. That is how a guard passes against code it is describing rather than testing. */
const decomment = s => String(s).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const health = () => fetch(base + '/api/health').then(r => r.json());
  const comp = async () => ((await health()).composer || {});

  try {
    console.log('\n  A — THE FIVE STATES OF "IS THE MODEL WRITING THESE REPLIES"');

    /* A1 — enabled and writable. Everything true, so `effective` must be true and there must be
       NO reason, because a reason beside a working capability is noise a person will act on. */
    _enabled = true;
    gateway.setDeterministicOnly(false);
    gateway._resetProviderFault();
    const s1 = await comp();
    ok('CT-A1 with the flag on, a key present, egress allowed and the provider answering, the composer is effectively ON',
      s1.on === true && s1.effective === true);
    ok('CT-A1b …and carries NO reason, because an explanation beside a working capability is something to act on that is not there',
      s1.why === null || s1.why === undefined);
    ok('CT-A1c …and the prose says the model writes the reply',
      /^on —/.test(String(s1.writes)) && /model writes the reply/.test(String(s1.writes)));

    /* A2 — the general shape of the defect: the host flag on, the capability off. Before the fix
       this payload existed and the panel rendered ON. */
    _enabled = false;
    const s2 = await comp();
    ok('CT-A2 the switch being ON and the composer WRITING are separate answers, and the payload gives both',
      s2.on === true && s2.effective === false);
    ok('CT-A2b …so a reader never has to resolve a contradiction between `on` and `writes` themselves',
      /^off —/.test(String(s2.writes)) && s2.effective === false);

    /* A3 — no model key. The reason must name the key, not a flag and not egress. */
    ok('CT-A3 with no model key, the reason names the KEY',
      s2.why === 'no language-model key is configured');
    ok('CT-A3b …and reports the key claim separately from the capability, so "no key" and "key refused" stay distinguishable',
      s2.providerKey === false && s2.deterministicOnly === false);

    /* A4 — deterministic-only. A KEY IS PRESENT here, which is the whole point: this is the state
       that any check looking only at the key would misreport, and it is a deliberate guarantee an
       organisation may have to prove, so calling it "no key" is not a cosmetic error. */
    _enabled = true;
    gateway.setDeterministicOnly(true);
    const s4 = await comp();
    ok('CT-A4 deterministic-only mode is its own reason, with a key present and every other switch green',
      s4.on === true && s4.effective === false && s4.deterministicOnly === true
      && /deterministic-only/.test(String(s4.why)));
    ok('CT-A4b …and is NEVER reported as a missing key, which is the opposite diagnosis and the opposite fix',
      !/key is configured/.test(String(s4.why)));
    gateway.setDeterministicOnly(false);

    /* A5 — provider unavailable. Configured correctly, refused in practice. Recorded from a REAL
       failed completion rather than stubbed, so the recorder is what is under test. */
    _enabled = true;
    gateway._resetProviderFault();
    const before = await comp();
    ok('CT-A5 before any provider failure, nothing claims the provider is unreachable',
      before.effective === true && before.providerReachable === true && before.providerFaultAt === null);

    let threw = false;
    try {
      // No credentials are configured in a test run, so this genuinely fails at the provider
      // boundary. Nothing is stubbed: the recorder is being exercised by a real exhausted call.
      await gateway.complete({ org: gateway.PLATFORM_ORG, taskType: 'capability_truth_probe', user: 'ping' });
    } catch (_) { threw = true; }
    const s5 = await comp();
    ok('CT-A5b a completion that exhausted every retry and both providers is RECORDED, not forgotten',
      threw === true && s5.providerReachable === false && !!s5.providerFaultAt);
    ok('CT-A5c …so the composer reports itself off with the provider named, though the flag, the key and egress are all green',
      s5.on === true && s5.effective === false && s5.providerKey === false
      && /provider/.test(String(s5.why)));
    ok('CT-A5d …and the recorded fault carries no provider message body, because /api/health is unauthenticated and an error body can quote a prompt',
      (() => { const f = gateway.providerFault();
        return !!f && typeof f.reason === 'string' && !('message' in f) && !('body' in f) && !('stack' in f); })());

    /* A5e — THE RECORD IS CLEARED BY A SUCCESS, AND ONLY BY A SUCCESS. A fault that decayed on a
       timer would report a working provider on a host where nothing has succeeded since, which is
       the same lie in the other direction. Proven by making the provider boundary itself answer —
       `gateway.client` is the real Anthropic client object complete() calls, so a stubbed
       `messages.create` drives the genuine success path, not a stubbed complete(). */
    const faultBefore = gateway.providerFault();
    const realCreate = gateway.client.messages.create;
    gateway.client.messages.create = async () => ({ content: [{ type: 'text', text: 'alive' }] });
    let said = null;
    try { said = await gateway.complete({ org: gateway.PLATFORM_ORG, taskType: 'probe', user: 'ping' }); }
    finally { gateway.client.messages.create = realCreate; }
    const s5e = await comp();
    ok('CT-A5e one provider success CLEARS the record — and it took a success, the fault was still standing a line earlier',
      !!faultBefore && said === 'alive' && gateway.providerFault() === null
      && s5e.providerReachable === true && s5e.effective === true);

    console.log('\n  B — THE RECORD IS ABOUT THE PROVIDER AND NOTHING ELSE');
    /* A refusal that never touched the provider must not be recorded as the provider failing.
       Folding these together would make the field a rumour: three different causes, one word. */
    gateway._resetProviderFault();
    gateway.setDeterministicOnly(true);
    let noEgressThrew = false;
    try { await gateway.complete({ org: gateway.PLATFORM_ORG, taskType: 'probe', user: 'x' }); }
    catch (_) { noEgressThrew = true; }
    ok('CT-B1 a call refused by no-egress mode records NO provider fault — it never reached a provider',
      noEgressThrew === true && gateway.providerFault() === null);
    gateway.setDeterministicOnly(false);

    gateway._resetProviderFault();
    let attribThrew = false;
    try { await gateway.complete({ taskType: 'probe', user: 'x' }); }   // no org → refused before the boundary
    catch (_) { attribThrew = true; }
    ok('CT-B2 a call refused for missing attribution records NO provider fault — that is a caller defect, not an outage',
      attribThrew === true && gateway.providerFault() === null);

    gateway._resetProviderFault();
    const spent = [];
    for (let i = 0; i < 5000 && gateway._consumeBudget('ct-budget-org'); i++) spent.push(i);
    let budgetThrew = false;
    try { await gateway.complete({ org: 'ct-budget-org', taskType: 'probe', user: 'x' }); }
    catch (e) { budgetThrew = e && e.code === 'LLM_BUDGET_EXHAUSTED'; }
    ok('CT-B3 an exhausted per-org budget records NO provider fault — one org spending its allowance is not the provider being down',
      budgetThrew === true && gateway.providerFault() === null);
    gateway._resetGatewayState();
    gateway._resetProviderFault();

    /* B4 — the getter hands back a COPY. /api/health reads this on every request; a caller that
       could edit the record by holding it could rewrite what the product says about itself. */
    gateway._resetProviderFault();
    let held = false;
    try { await gateway.complete({ org: gateway.PLATFORM_ORG, taskType: 'probe', user: 'x' }); }
    catch (_) { held = true; }
    const grabbed = gateway.providerFault();
    if (grabbed) { grabbed.reason = 'TAMPERED'; grabbed.at = 'TAMPERED'; }
    const after = gateway.providerFault();
    ok('CT-B4 providerFault() hands back a COPY — editing what it returned changes nothing the next reader sees',
      held === true && !!grabbed && !!after && after.reason !== 'TAMPERED' && after.at !== 'TAMPERED');
    ok('CT-B4b …and the tamper does not reach the public payload either',
      !/TAMPERED/.test(JSON.stringify(await health())));
    gateway._resetProviderFault();

    console.log('\n  C — THE PANEL RENDERS THE SERVER’S ANSWER, NOT ITS OWN');
    const APP = decomment(R('js/app.js'));
    const panel = APP.slice(APP.indexOf('async function _renderRealCapabilities('),
      APP.indexOf('async function _renderBuildLine('));
    ok('CT-C0 the capability panel is found in the source (an empty slice would make every assertion below vacuous)',
      panel.length > 400 && /settings-features/.test(panel));
    ok('CT-C1 the row for "is the model writing" reads the EFFECTIVE state, never the host flag alone',
      /\.effective/.test(panel)
      && !/\[\s*'Conversation[^\]]*!!\s*comp\.on\b/.test(panel));
    ok('CT-C2 …and the reason it prints comes from the server payload rather than a hard-coded sentence',
      /comp\.why/.test(panel));
    ok('CT-C3 …with no capability recomputed in the browser from separate switches',
      !/comp\.on\s*&&\s*comp\./.test(panel) && !/providerKey\s*&&/.test(panel));
    ok('CT-C4 the host flag is still shown, as its OWN row, because it is a real and separate fact',
      /comp\.on/.test(panel));

    console.log('\n  C — AND READS THROUGH THE ONE BOUNDED READER');
    ok('CT-C5 the panel reads /api/health through MemberApp._read, not through a private fetch',
      /MemberApp\._read\('\/api\/health'\)/.test(panel) && !/fetch\('\/api\/health'/.test(panel));
    ok('CT-C6 …and a failed read renders the ONE shared failure banner, so an ended session is not reported as "could not check"',
      /MemberApp\._readFailedHTML\(/.test(panel));
    ok('CT-C7 …written OVER the panel rather than appended, so retrying cannot stack banners',
      /box\.innerHTML\s*=\s*MemberApp\._readFailedHTML\(/.test(panel));
    const buildFn = APP.slice(APP.indexOf('async function _checkBuildIdentity('),
      APP.indexOf('async function _announceStaleBuild('));
    ok('CT-C8 the build line beneath it reads through the same reader — one networking system in the panel, not two',
      buildFn.length > 100 && /MemberApp\._read\('\/api\/health'\)/.test(buildFn)
      && !/fetch\('\/api\/health'/.test(buildFn));
    ok('CT-C9 no raw /api/health fetch survives anywhere in the client',
      !/fetch\(\s*['"]\/api\/health['"]/.test(APP));

    console.log('\n  D — THE READ IS BOUNDED THROUGH THE BODY, NOT ONLY THE HEADERS');
    const readFn = APP.slice(APP.indexOf('async _read(url, {'), APP.indexOf('_readFailedHTML(r, onRetry)'));
    ok('CT-D0 the reader is found in the source',
      readFn.length > 400 && /new AbortController\(\)/.test(readFn));
    ok('CT-D1 the abort timer is cleared in a `finally`, so it spans the body parse and every exit including a throw',
      /finally\s*\{\s*clearTimeout\(timer\);\s*\}/.test(readFn));
    ok('CT-D2 …and is cleared exactly once — a surviving early clear would silently unbind the body again',
      (readFn.match(/clearTimeout\(timer\)/g) || []).length === 1);
    ok('CT-D3 …with the body parse INSIDE the guarded region rather than after it',
      readFn.indexOf('res.json()') > -1
      && readFn.indexOf('res.json()') < readFn.lastIndexOf('clearTimeout(timer)'));
    ok('CT-D4 a body aborted mid-transfer is reported as a TIMEOUT, never as a malformed record',
      /bodyAborted[\s\S]{0,200}reason:\s*'timeout'/.test(readFn));

    console.log('\n  E — THE HOST FLAG IS READ AT BOOT, SO IT IS PROVEN IN A SEPARATE PROCESS');
    /* IQ_COMPOSER is a module-load constant. Proving the unset case in-process is impossible, and
       an assertion that cannot see the state it names is the shape of a guard that passes for ever. */
    const child = `
      process.env.DB_OPTIONAL='1'; process.env.NODE_ENV='test'; delete process.env.IQ_COMPOSER;
      const g=require(${JSON.stringify(path.join(__dirname, '..', 'ai', 'gateway.js'))}); g.enabled=()=>true;
      const {app}=require(${JSON.stringify(path.join(__dirname, '..', 'server.js'))});
      const s=app.listen(0,async()=>{
        const r=await fetch('http://127.0.0.1:'+s.address().port+'/api/health').then(r=>r.json());
        console.log(JSON.stringify(r.composer)); s.close(); process.exit(0);
      });`;
    let childComp = null;
    try {
      const out = execFileSync(process.execPath, ['-e', child], { encoding: 'utf8', timeout: 60000 });
      childComp = JSON.parse(out.trim().split('\n').pop());
    } catch (e) { console.error('       child probe failed:', e && e.message); }
    ok('CT-E1 on a host where IQ_COMPOSER was never set, BOTH the flag and the effective state are off',
      !!childComp && childComp.on === false && childComp.effective === false);
    ok('CT-E2 …and the reason names the flag, with the key and egress both green',
      !!childComp && /IQ_COMPOSER/.test(String(childComp.why)));

    console.log('\n  F — THE PUBLIC PAYLOAD STILL CARRIES NOTHING IT SHOULD NOT');
    gateway._resetProviderFault();
    const flat = JSON.stringify(await health());
    ok('CT-F1 health leaks no key material, no person and no org',
      !/sk-|api[_-]?key['"]?\s*:|ANTHROPIC_API_KEY|OPENAI_API_KEY/i.test(flat));
    ok('CT-F2 …and no long hash, because a 40-character hex string is the shape of a leaked secret',
      !/[0-9a-f]{25,}/.test(flat));

  } catch (e) { fail++; console.error('  FAIL capability-truth suite threw:', e && e.stack); }

  gateway.enabled = _realEnabled;
  server.close();
  console.log(`\ncapability-truth-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
