/* Truth layer — WHICH BUILD IS THIS, AND IS THE PHONE RUNNING IT?

   The first live-recovery pass ended by admitting it could not rule out stale assets as an
   explanation for what the founder saw, because nothing in the product could answer the question.
   That admission is the reason this file exists.

   Four facts, kept separate because they fail separately, and conflating them is how "it's
   deployed" became something people believed rather than checked:

     commit      which source this process was built from
     startedAt   when THIS process began -- how you tell a restart from a service you left running
     assetStamp  which client the server is handing out right now
     readiness   whether the required stores are actually loaded

   READINESS IS THE ONE WITH A RULE ATTACHED: the product must not report itself ready before the
   stores are loaded. A boolean that defaults to true cannot express that, so `ready` is derived
   from a timestamp which is null until a load actually happens.

   Run: node scripts/build-identity-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const fs = require('fs'), path = require('path');
const S = require('../server.js');
const { app, _loadAllStores } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { let v = false; try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };
const R = f => { try { return fs.readFileSync(path.join(__dirname, '..', f), 'utf8'); } catch (_) { return ''; } };

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = u => fetch(base + u).then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));

  try {
    console.log('\n  A — THE SERVER CAN SAY WHICH BUILD IT IS');
    const before = await get('/api/health');
    const b = (before.j || {}).build || {};
    ok('BI-A1 health reports a build block', before.status === 200 && !!before.j.build);
    ok('BI-A2 …naming the commit it was built from, or saying "unknown" rather than guessing',
      typeof b.commit === 'string' && b.commit.length > 0
      && (b.commit === 'unknown' || /^[0-9a-f]{7}$/.test(b.commit)));
    ok('BI-A3 …a short form a person can compare against a PR head by eye',
      typeof b.commitShort === 'string'
      && (b.commitShort === 'unknown' || b.commit === b.commitShort));
    ok('BI-A3b …and the PUBLIC payload carries only the short form, because a 40-character hash is the shape of a leaked key',
      !/[0-9a-f]{25,}/.test(JSON.stringify(before.j)));
    ok('BI-A4 …when this process started, so a restart is detectable',
      !!b.startedAt && !Number.isNaN(Date.parse(b.startedAt)));
    ok('BI-A5 …and an id minted once per process, so two answers can be proved to share one',
      typeof b.startId === 'string' && b.startId.length >= 4);
    const again = await get('/api/health');
    ok('BI-A6 …which is stable across requests to the SAME process',
      again.j.build.startId === b.startId && again.j.build.startedAt === b.startedAt);

    console.log('\n  A — AND WHICH CLIENT IT IS SERVING');
    const htmlStamp = (R('index.html').match(/(?:src|href)="(?:js|css)\/[A-Za-z0-9_.-]+\.(?:js|css)\?v=([A-Za-z0-9]+)"/) || [])[1];
    ok('BI-A7 the asset stamp it reports is the one index.html actually carries',
      !!htmlStamp && b.assetStamp === htmlStamp);
    ok('BI-A8 …and it is not a hard-coded constant that could drift from the file',
      !new RegExp(`assetStamp:\\s*['"\`]${htmlStamp}`).test(R('server.js')));

    console.log('\n  B — READINESS IS NOT ONE FLAG, AND DOES NOT DEFAULT TO TRUE');
    const r0 = (before.j || {}).readiness || {};
    ok('BI-B1 before any store is loaded, the product does NOT report itself ready',
      r0.storesLoaded === false && r0.ready === false);
    ok('BI-B2 …while still admitting the process itself is alive — a different question',
      r0.process === true);
    ok('BI-B3 …and the durable store is answered separately from the stores being loaded',
      'durableStore' in r0 && 'persistenceMode' in r0);

    _loadAllStores({ orgMeta: { bix: { orgName: 'B' } }, orgUsers: { bix: {} } });
    const after = await get('/api/health');
    const r1 = after.j.readiness;
    ok('BI-B4 once the stores are loaded it says so, with when',
      r1.storesLoaded === true && r1.ready === true && !!r1.storesLoadedAt);
    ok('BI-B5 …and loading the stores did not change which build this is',
      after.j.build.startId === b.startId);

    console.log('\n  C — NO SECRETS IN THE DIAGNOSTIC');
    const blob = JSON.stringify(after.j);
    ok('BI-C1 the health payload carries no key, token, password or connection string',
      !/sk-|postgres:\/\/|password|secret|apiKey|Bearer /i.test(blob));
    ok('BI-C2 …and health is readable without a session, because it is how you check a deploy',
      before.status === 200);

    console.log('\n  D — THE CLIENT KNOWS WHICH ASSETS IT ACTUALLY LOADED');
    const APP = R('js/app.js');
    /* The client's own stamp must come from the DOM -- the tag the browser really loaded -- and
       never from a constant, which would only ever report what the source says rather than what
       arrived. That distinction is the entire point of the check. */
    /* BI-D1 FIRST MATCHED THE querySelector LINE ANYWHERE IN THE FUNCTION, so replacing the
       RETURN with a baked-in literal left it green -- the selector was still written, just no
       longer used. The body is read as a whole now, and a literal stamp inside it is the defect
       being guarded against, so the guard refuses to find one. */
    const stampFn = APP.slice(APP.indexOf('function _clientAssetStamp()'),
                              APP.indexOf('async function _reloadForNewBuild()'));
    ok('BI-D1 the client reads its stamp from the loaded script tag, not from a baked-in constant',
      stampFn.length > 120
      && /querySelector\('script\[src\*="js\/app\.js\?v="\]'\)/.test(stampFn)
      && /src\.match\(\/\[\?&\]v=/.test(stampFn)
      && !new RegExp(`['"\`]${htmlStamp}['"\`]`).test(stampFn));
    ok('BI-D2 …and compares it with the stamp the SERVER says it is serving',
      /server\.assetStamp !== mine/.test(APP));
    ok('BI-D3 …treating two unknowns as unknown rather than as a mismatch',
      /server\.assetStamp !== 'unknown'[\s\S]{0,80}mine !== 'unknown'/.test(APP));
    ok('BI-D4 a stale shell is offered a reload that clears caches and the worker, not a bare reload',
      /async function _reloadForNewBuild\(\)/.test(APP)
      && /caches\.delete\(k\)/.test(APP) && /unregister\(\)/.test(APP)
      && /searchParams\.set\('_fresh'/.test(APP));
    ok('BI-D5 …offered once, not looped — it asks, it does not reload by itself',
      /if \(document\.getElementById\('iq-stale-build'\)\) return true;/.test(APP)
      && !/_announceStaleBuild[\s\S]{0,300}location\.replace/.test(APP));
    ok('BI-D6 the build line is rendered where an ordinary person can read it, not only in devtools',
      /_renderBuildLine\(\)/.test(APP) && /iq-build-line/.test(APP));

    console.log('\n  E — THE SERVICE WORKER CANNOT PIN AN OLD SHELL');
    const SW = R('sw.js');
    ok('BI-E1 it is network-first for GETs, so a fresh deploy wins as soon as the phone is online',
      /NETWORK-FIRST/i.test(SW) || /fetch\(req\)[\s\S]{0,200}catch/.test(SW));
    ok('BI-E2 …it never caches API responses', /pathname\.startsWith\('\/api\/'\)\)\s*return/.test(SW));
    ok('BI-E3 …and it drops every cache that is not the current one on activate',
      /keys\.filter\(k => k !== CACHE\)\.map\(k => caches\.delete\(k\)\)/.test(SW));
    ok('BI-E4 …taking control of open tabs immediately rather than waiting for every one to close',
      /skipWaiting\(\)/.test(SW) && /clients\.claim\(\)/.test(SW));

    console.log('\n  F — THE ASSET GUARD DOES NOT EDIT THE REPOSITORY');
    /* Found by this pass: asset-version-smoke WROTE its lock file whenever it was satisfied, so
       `npm test` mutated the working tree and a lock change could ride into an unrelated commit
       without anybody choosing it. A test whose result depends on how many times it has been run
       is the opposite of a guard. */
    const AV = R('scripts/asset-version-smoke.js');
    ok('BI-F1 the asset guard contains no write at all', !/fs\.writeFileSync/.test(AV));
    ok('BI-F2 …and recording is a deliberate, separate step',
      fs.existsSync(path.join(__dirname, 'stamp-record.js'))
      && /stamp:record/.test(R('package.json')));
  } catch (e) { fail++; console.error('  FAIL build identity suite threw:', e && e.stack); }

  server.close();
  console.log(`\nbuild-identity-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
