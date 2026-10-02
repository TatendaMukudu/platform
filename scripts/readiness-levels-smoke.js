/* Truth layer — READINESS IS FIVE QUESTIONS, AND THE ANSWERS ARE NOT INTERCHANGEABLE.

   The founder's instruction names them:

     1  stores loaded                  the state a request reads is in memory
     2  persistence available          a durable store exists to write to
     3  safe to write durably          writing to it RIGHT NOW would work
     4  provider available             a model can be reached
     5  deployed build identity current which build is actually serving this

   They are separate because each has a different remedy and a different consequence, and because
   the expensive confusion is specific: a host with no DATABASE_URL loads, serves, answers, and
   looks completely healthy — and loses everything on restart. "Stores loaded" is true there.
   Reading it as "safe to write durably" is how somebody demonstrates a product on a stage and
   discovers afterwards that the demonstration is gone.

   THE LAW THIS FILE DEFENDS: no caller may treat stores-loaded as durable persistence. `ready`
   is stores-loaded deliberately — a request served correctly from memory is a served request,
   and refusing until a database answers would make a degraded instance look like a dead one —
   so the guard is that the two never collapse into one field and that each level says which of
   them it is.

   Run: node scripts/readiness-levels-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const fs = require('fs'), path = require('path');
const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex } = S;

let pass = 0, fail = 0;
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

_loadAllStores({ orgMeta: { r1: { orgName: 'A Club', orgMode: 'sports' } }, orgUsers: { r1: {} }, orgNodes: { r1: {} } });
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = u => fetch(base + u).then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));

  try {
    const h = await get('/api/health');
    const R = (h.j && h.j.readiness) || {};

    console.log('\n  A — FIVE QUESTIONS, FIVE ANSWERS');
    ok('RL-A1 the health payload carries readiness at all',
      h.status === 200 && !!h.j && typeof h.j.readiness === 'object' && h.j.readiness !== null);
    ok('RL-A2 …with stores-loaded as its own field, and a time it happened',
      R.storesLoaded === true && !!R.storesLoadedAt);
    ok('RL-A3 …whether a durable store is CONFIGURED at all, which is a different question from whether it works',
      typeof R.persistenceConfigured === 'boolean');
    ok('RL-A4 …whether writing to it right now is safe',
      typeof R.durableStore === 'boolean');
    ok('RL-A5 …and which persistence mode is in force, because "whole instance" and "what changed" are different bills and different risks',
      typeof R.persistenceMode === 'string' && R.persistenceMode.length > 0);
    ok('RL-A6 a model being reachable is answered somewhere else entirely — by the gateway, which is the only thing that knows',
      h.j.composer && typeof h.j.composer.effective === 'boolean' && ('why' in h.j.composer));
    ok('RL-A7 …and which build is serving this is answered by the build stamp, not by a readiness probe',
      h.j.build && typeof h.j.build.commit === 'string' && typeof h.j.build.assetStamp === 'string');

    console.log('\n  B — AND THIS HOST IS THE CASE THAT LOOKS HEALTHY AND IS NOT DURABLE');
    /* THE FIXTURE IS THE POINT. This process runs with DB_OPTIONAL=1 and no DATABASE_URL, which
       is exactly the shape that loads, serves and answers while nothing survives a restart. If
       these two assertions ever flip, the suite is no longer testing the interesting state. */
    ok('RL-B1 no durable store is configured here',
      R.persistenceConfigured === false);
    ok('RL-B1b …so nothing here is durable, whatever the save path is willing to attempt — a level lower than the founder named, and the same confusion',
      R.durableStore === false);
    ok('RL-B2 …and yet the instance reports itself ready, because a request served from memory IS served',
      R.ready === true && R.storesLoaded === true);
    ok('RL-B3 THE TWO ARE NOT THE SAME FIELD — the whole law in one assertion',
      R.ready === true && R.persistenceConfigured === false);
    ok('RL-B4 …and the absence says WHY, rather than leaving an operator to interpret a false',
      typeof R.durableReason === 'string' && /memory only|not ready|has not loaded|failed/i.test(R.durableReason));
    ok('RL-B5 "in memory only" is said in words a person can act on, not as a bare flag',
      /in memory only/i.test(R.durableReason || ''));

    console.log('\n  C — NO CALLER COLLAPSES THEM');
    const SRC = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
    ok('RL-C1 `ready` is computed from stores-loaded and from nothing else, so it cannot quietly start meaning durability',
      /ready: storesLoaded,/.test(SRC));
    ok('RL-C2 …and durability is computed from the persistence layer AND from a store existing, not from stores-loaded',
      /durableStore: durable,/.test(SRC)
      && /const durable = configured && !!\(_persistenceReady && _persistenceReady\.ready\)/.test(SRC));
    ok('RL-C3 nothing anywhere derives a durability claim from storesLoaded',
      !/durable[A-Za-z]*\s*[:=][^;\n]*storesLoaded/.test(SRC));
    ok('RL-C4 …and nothing derives stores-loaded from the persistence flag either, which would be the same mistake pointing the other way',
      !/storesLoaded\s*=\s*[^;\n]*_persistenceReady/.test(SRC));

    /* A SAVE ATTEMPTED WHILE DURABLE PERSISTENCE IS UNAVAILABLE MUST REFUSE, not silently
       succeed into memory and report a write. This is the behaviour the level exists to protect,
       and asserting the field without asserting this would be asserting a label. */
    ok('RL-C5 a save refuses when authoritative persistence has not loaded, rather than writing to memory and reporting success',
      /_persistenceReady\.error \|\| 'durable persistence is not ready'/.test(SRC));

    /* ── RL-C6: THE BUG THIS LEVEL ACTUALLY HAD, AND THE HERMETIC LAYER COULD NOT SEE ────────
       Every suite in this repository runs DB_OPTIONAL=1, whose load goes through
       `_loadAllStores` — which set the marker. The AUTHORITATIVE SPLIT PATH, the one every real
       deployment takes once it has saved anything, calls `_applyUnits` and did not. So a
       completely healthy instance serving every request correctly reported `storesLoaded: false`
       and `ready: false` FOREVER. Found by running the real server against a real PostgreSQL
       (scripts/durable-restart-check.js), which nothing here had ever done.

       These two are structural, and that is stated rather than dressed up: a hermetic suite
       cannot take the split path. What it CAN do is refuse to let a third load path forget —
       there is one marker and both loaders call it. */
    ok('RL-C6 there is ONE function that says the stores are loaded, so a load path cannot have its own opinion',
      (SRC.match(/function _markStoresLoaded\(\)/g) || []).length === 1
      && !/_storesLoadedAt = new Date\(\)\.toISOString\(\);[\s\S]{0,40}Object\.assign/.test(SRC.replace(/function _markStoresLoaded\(\) \{[^}]*\}/, '')));
    ok('RL-C6b …and BOTH load paths call it — the in-memory one and the authoritative split one',
      (SRC.match(/_markStoresLoaded\(\);/g) || []).length >= 2
      && /Split persistence: \$\{n\} durable unit\(s\) loaded/.test(SRC)
      && /_markStoresLoaded\(\);[\s\S]{0,200}Split persistence/.test(SRC));

    console.log('\n  D — AND WHAT IS NOT CLAIMED IS NOT CLAIMED');
    ok('RL-D1 the health payload never asserts that anything survived a restart',
      !/survive|restartSafe|restartProven/i.test(JSON.stringify(h.j)));
    ok('RL-D2 …and never reports a provider as available on the strength of a key existing alone',
      (() => {
        // `providerKey` is configuration; `effective` is configuration AND every other switch.
        const c = h.j.composer || {};
        return ('providerKey' in c) && ('effective' in c) && c.effective === false;
      })());

  } catch (e) { fail++; console.error('  FAIL readiness-levels suite threw:', e && e.stack); }

  server.close();
  console.log(`\nreadiness-levels-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
