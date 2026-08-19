/* Truth layer — P0-2: AN ACKNOWLEDGED WRITE SURVIVES SHUTDOWN.

   Pilot blocker. See docs/briefs/p0-pilot-blockers.md.

   WRITTEN BEFORE THE FIX, by the reviewer. Do not edit an assertion to make it pass.

   NOT REGISTERED in scripts/test.js yet. Register it in the commit that makes it green.

   ── The defect ──────────────────────────────────────────────────────────────────────────

   server.js:273  SAVE_DEBOUNCE_MS defaults to 1500
   server.js:386  _saveTimer = setTimeout(() => { _saveTimer = null; _runSave(); }, SAVE_DEBOUNCE_MS)

   `grep "process.on(" server.js db.js` returns only `unhandledRejection` and
   `uncaughtException`. There is no SIGTERM, SIGINT or beforeExit handler anywhere.

   Render sends SIGTERM on every deploy. A person submits a check-in, contests a belief, or
   contributes to a group; the API returns 200; 1.4 seconds later the process exits and the
   write is gone. The user was told it worked. Nothing records that it did not.

   Worse if a save had already failed: server.js:283 puts failures on a retry backoff, so an
   entire failed batch is waiting in memory with nothing to flush it.

   ── The invariant ───────────────────────────────────────────────────────────────────────

       Once the API has acknowledged a mutation, graceful termination cannot silently discard
       it because the debounce has not fired.

   Silence is the specific failure. A shutdown that cannot flush must say so, not exit 0.

   Run: node scripts/shutdown-durability-smoke.js */

'use strict';

process.env.DB_OPTIONAL     = '1';
process.env.NODE_ENV        = 'test';
process.env.SAVE_DEBOUNCE_MS = '30000';   // deliberately long: nothing may rely on it firing
process.env.SAVE_RETRY_MS    = '30000';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const db = require('../db.js');
  const S  = require('../server.js');
  const { orgMeta, scheduleSave } = S;

  /* A fake store, so we assert on what actually left the process rather than what we hoped. */
  const written = [];
  let failNext = false;
  db.saveStores = async (units) => {
    if (failNext) { failNext = false; throw new Error('simulated write failure'); }
    written.push(Object.keys(units));
    return { rows: Object.keys(units).length, bytes: 0 };
  };
  db.deleteStores = async () => 0;

  console.log('shutdown-durability-smoke — P0-2\n');

  /* 1 — a shutdown path must exist and be reachable. Its absence is the defect: today the
     process has no idea it is being asked to stop, so it cannot possibly flush. */
  const listeners = process.listenerCount('SIGTERM');
  ok('1 · the process listens for SIGTERM', listeners >= 1);

  const flush = S._flushAndClose || S._gracefulShutdown || S._shutdown;
  ok('1 · …and a graceful-shutdown routine is reachable for testing', typeof flush === 'function');

  if (typeof flush !== 'function') {
    console.log('\n  → No graceful-shutdown routine is exported. The remaining cases cannot run.');
    console.log(`\nshutdown-durability-smoke: ${pass} passed, ${fail + 5} failed`);
    process.exit(1);
  }

  /* 2 — THE HEADLINE. A mutation still inside the debounce window survives shutdown.

     The debounce is set to 30 seconds above, so a pass here cannot be the timer firing by
     luck — only an explicit flush can produce it. */
  {
    orgMeta.shutdownco = { orgName: 'Shutdown Co', orgMode: 'sports' };
    scheduleSave();                       // acknowledged; nothing written yet
    written.length = 0;
    await flush();
    ok('2 · a pending write is flushed on shutdown, not lost to the debounce',
      written.length > 0);
    ok('2 · …and the flush waits for the write rather than firing and forgetting',
      written.flat().some(k => k.startsWith('store:orgMeta')));
  }

  /* 3 — a failed save must not exit quietly. If the flush cannot persist, the operator needs
     to know: a silent exit 0 after losing data is worse than a noisy failure. */
  {
    orgMeta.shutdownco.orgName = 'Shutdown Co 2';
    scheduleSave();
    written.length = 0;
    failNext = true;
    let signalled = false;
    try {
      const r = await flush();
      if (r && r.ok === false) signalled = true;           // reported as a result
    } catch (_) { signalled = true; }                       // or thrown
    ok('3 · a flush that cannot persist reports failure rather than exiting silently', signalled);
  }

  /* 4 — shutdown is idempotent. Process managers send SIGTERM more than once, and a second
     signal must not corrupt state or double-write. */
  {
    orgMeta.shutdownco.orgName = 'Shutdown Co 3';
    scheduleSave();
    written.length = 0;
    await flush();
    const afterFirst = written.length;
    await flush();
    ok('4 · a second shutdown signal is safe and does not re-write', written.length === afterFirst);
  }

  /* 5 — no mutation, no write. The flush must not turn every deploy into a full rewrite of
     every store, which is the egress bug scripts/persistence-smoke.js exists to prevent. */
  {
    written.length = 0;
    await flush();
    ok('5 · shutting down with nothing pending writes nothing', written.length === 0);
  }

  console.log(`\nshutdown-durability-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
