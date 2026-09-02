/* Truth layer — WHAT A COLD START COSTS.

   Neon emailed to say the database had used 86% of its 5 GB monthly network allowance. For a
   pilot with one person on it. The cause was not writes — split persistence already makes a
   write cost what it changed, and db.js says so in a comment written when that was built.

   It was the READ. Every boot, in every mode, called db.loadMain() for the legacy blob, and in
   split mode _reconstruct then deleted every key it had just populated and replaced them with
   the split rows. The whole platform came down the wire to be thrown away, and the split rows
   came down after it. The seeded club serialises to 21 MB, so a cold start moved ~42 MB.

   That only looks small until you count starts. Render's free tier spins down after a quarter
   of an hour idle and cold-starts on the next request; every deploy restarts too. A hundred
   starts in a month is an ordinary month, and a hundred starts was 4.3 GB.

   The shape of the bug is worth naming, because it is the third one this month: something
   correct and expensive, running on a path where it was not needed, with no number anywhere
   saying what it cost. The suite the codebase already had proved the writes were cheap and
   could not see that the reads were not.

   So: the blob is read ONLY when there are no split rows, and that is asserted by counting the
   calls rather than by reading the code.

   Run: node scripts/boot-bandwidth-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const path = require('path');
const db = require('../db.js');
const S = require('../server.js');
const { _reconstruct, _persistedStores, orgUsers } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

/* A stand-in for the database, counting what each boot actually pulls. */
const realLoadStores = db.loadStores;
const realLoadMain = db.loadMain;
let mainCalls = 0, storeCalls = 0;

const BLOB = { orgMeta: { blb: { orgName: 'From The Legacy Blob' } },
  orgUsers: { blb: { u1: { id: 'u1', name: 'Blob Person', orgCode: 'blb', status: 'active' } } } };
const UNITS = { 'store:orgMeta:spl': { spl: { orgName: 'From The Split Rows' } },
  'store:orgUsers:spl': { spl: { u2: { id: 'u2', name: 'Split Person', orgCode: 'spl', status: 'active' } } } };

const clear = () => { for (const store of Object.values(_persistedStores())) for (const k of Object.keys(store)) delete store[k]; };

(async () => {
  try {
    /* ── BB1-BB3: the ordinary boot. Split rows exist, so the blob is never touched. ── */
    db.loadMain   = async () => { mainCalls++;  return JSON.parse(JSON.stringify(BLOB)); };
    db.loadStores = async () => { storeCalls++; return { units: JSON.parse(JSON.stringify(UNITS)), revisions: {} }; };

    clear(); mainCalls = 0; storeCalls = 0;
    const r1 = await _reconstruct(db.loadMain);
    ok('BB1 the split rows are what loaded — they are authoritative',
      r1 && r1.authoritative === 'split' && !!(orgUsers.spl && orgUsers.spl.u2));
    ok('BB2 THE LEGACY BLOB WAS NEVER READ — this is the whole fix; it used to be read on every single boot and then discarded',
      mainCalls === 0);
    ok('BB3 …and the split rows were read exactly once, not once per store',
      storeCalls === 1);

    /* ── BB4-BB6: the genuine first boot after the migration. No split rows, so the blob is
       the only thing that exists and it must still be read. Skipping it here would not save
       bandwidth, it would lose the platform. ── */
    db.loadStores = async () => { storeCalls++; return { units: {}, revisions: {} }; };
    clear(); mainCalls = 0; storeCalls = 0;
    const r2 = await _reconstruct(db.loadMain);
    ok('BB4 with no split rows the blob IS read — the saving must never become data loss',
      mainCalls === 1);
    ok('BB5 …and its contents actually populate the stores',
      !!(orgUsers.blb && orgUsers.blb.u1) && r2.authoritative === 'main');
    ok('BB6 …and it is read once, not once per store', mainCalls === 1);

    /* ── BB7-BB8: the blob loader is called LAZILY. Passing the function rather than the data
       is what defers the read; passing pre-loaded data would have paid for it already. ── */
    let called = 0;
    db.loadStores = async () => ({ units: JSON.parse(JSON.stringify(UNITS)), revisions: {} });
    clear();
    await _reconstruct(async () => { called++; return BLOB; });
    ok('BB7 the loader is a function the boot may decline to call, not data it has already paid for',
      called === 0);

    clear();
    await _reconstruct(BLOB);          // the old shape must still work
    ok('BB8 a plain object still works — the split rows win over it, as they always did',
      !!(orgUsers.spl && orgUsers.spl.u2) && !orgUsers.blb);

    /* ── BB9: split read fails. The blob earns its cost exactly here, and nowhere else. ── */
    db.loadStores = async () => { throw new Error('connection reset'); };
    clear(); mainCalls = 0;
    const r3 = await _reconstruct(db.loadMain);
    ok('BB9 when the split rows cannot be read, the blob is loaded — stale-but-real beats nothing, and durable writes stay refused',
      mainCalls === 1 && !!(orgUsers.blb && orgUsers.blb.u1) && r3.authoritative === 'unavailable');

    /* ── BB10: the number itself. A cold start that reads everything twice is not visible in
       any test that only checks correctness, which is why this went unnoticed for a month. ── */
    // The 21.5 MB club that made this bug expensive has been deleted; the demo is now 31 KB.
    // What remains worth asserting is the RATIO, not a number — a boot that reads the store
    // twice costs twice, whatever the store happens to weigh this month.
    const { buildAlmaStore } = require('../scripts/seed-alma.js');
    const { store } = await buildAlmaStore();
    const mb = Object.values(store).reduce((n, v) => n + Buffer.byteLength(JSON.stringify(v), 'utf8'), 0) / 1048576;
    console.log(`       the demo organisation serialises to ${(mb * 1024).toFixed(0)} KB (the seed it replaced was 21,500 KB)`);
    ok('BB10 the demo seed is small enough that a cold start is cheap — the old one was 700x this and was read twice per boot',
      mb > 0 && mb < 1);

  } catch (e) { fail++; console.error('  FAIL suite threw:', e && e.stack); }

  db.loadStores = realLoadStores;
  db.loadMain = realLoadMain;
  console.log(`\nboot-bandwidth-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
