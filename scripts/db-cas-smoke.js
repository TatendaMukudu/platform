/* Truth layer — P0-3b: THE DURABLE COMPARE-AND-SWAP CONTRACT.

   Pilot blocker. Contract: docs/briefs/p0-3-adjudication.md.

   WRITTEN BEFORE THE FIX, by the reviewer. Do not edit an assertion to make it pass.

   NOT REGISTERED in scripts/test.js yet. Register it in the commit that makes it green.

   ── What this proves, and what it does not ──────────────────────────────────────────────

   The rest of the suite runs with DB_OPTIONAL=1 and no PostgreSQL, deliberately: the truth
   layer is pure so it can be verified without infrastructure. That means this file CANNOT
   execute a real concurrent UPDATE and watch one of them lose.

   What it can do — and what matters most — is prove that NO UNCONDITIONAL WRITE PATH TO A
   PROTECTED UNIT REMAINS. That is a property of the source, not of a running database, and it
   is the property that actually fails today: db.js:172-176 upserts every split unit with
   `DO UPDATE SET store_value = EXCLUDED.store_value` and no predicate at all, so whichever
   process writes last wins and neither is told.

   Live PostgreSQL semantics (the predicate really is atomic, a losing CAS really does report
   zero rows) are verified once, by hand, against a real database — see the brief's
   "Migration and verification" section. They are not re-litigated on every test run.

   This is the same discipline scripts/governance-smoke.js uses: an architectural boundary that
   can be checked structurally is checked structurally, because a rule nobody can run is a rule
   that decays.

   ── The invariant ───────────────────────────────────────────────────────────────────────

       A protected durable unit may only be replaced by a write that names the revision it is
       replacing. A write naming a revision that is no longer current changes nothing and is
       reported as a conflict, distinguishably from a failure.

   Run: node scripts/db-cas-smoke.js */

'use strict';

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const fs   = require('fs');
const path = require('path');
const db   = require('../db.js');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'db.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

/* Statements that write a split durable unit. The 'main' blob is the legacy pre-migration
   restore point (server.js:416) and is deliberately NOT protected — see the brief, Decision 2. */
const _stmts = SRC.split(/`/).filter(s => /INSERT INTO iq_store/i.test(s));
const splitWrites = _stmts.filter(s => !/VALUES\s*\(\s*'main'/i.test(s));

console.log('db-cas-smoke — P0-3b: the durable compare-and-swap contract\n');

/* ── 1 · SCHEMA. There must be somewhere to keep a revision, and every existing row must get a
   deterministic starting value — a NULL revision is a row no CAS can reason about. ── */
ok('1 · iq_store declares a revision column',
  /CREATE TABLE IF NOT EXISTS iq_store[\s\S]{0,400}?\brev(ision)?\b/i.test(SRC));
ok('1 · …that is NOT NULL with a default, so no row can carry an unknown revision',
  /\brev(ision)?\b[^,\n]*\bBIGINT|INTEGER\b[^,\n]*NOT NULL[^,\n]*DEFAULT/i.test(SRC));
ok('1 · …and an existing deployment is migrated deterministically, not left to chance',
  /ALTER TABLE\s+iq_store[\s\S]{0,200}?ADD COLUMN IF NOT EXISTS\s+rev/i.test(SRC));

/* ── 2 · READS CARRY THE REVISION. A writer cannot name the revision it is replacing unless the
   read that produced its state handed one back. ── */
ok('2 · loadStores selects the revision alongside the value',
  /SELECT[\s\S]{0,160}?\brev(ision)?\b[\s\S]{0,160}?FROM iq_store/i.test(SRC));
ok('2 · …and returns it to the caller rather than discarding it',
  /loadStores/.test(SRC) && /\brevisions?\b/.test(SRC));

/* ── 3 · WRITES ARE CONDITIONAL. This is the whole blocker. ── */
ok('3 · saveStores accepts the revisions the caller expects to be replacing',
  /function saveStores\s*\(\s*units\s*,\s*(opts|options|\{)/.test(SRC));
ok('3 · every split-unit write carries a revision predicate',
  splitWrites.length > 0 && splitWrites.every(s => /WHERE[\s\S]*iq_store\.rev/i.test(s)));
ok('3 · …and a successful write advances the revision',
  splitWrites.some(s => /SET[\s\S]*\brev\s*=\s*(iq_store\.rev\s*\+\s*1|EXCLUDED\.rev)/i.test(s)));

/* ── 4 · NO UNCONDITIONAL PATH SURVIVES.

   The assertion that actually closes the hole. It is not enough to ADD a conditional write —
   the unconditional one must be gone, or every ordinary debounced save silently undoes the
   protection on the very next cycle. ── */
ok('4 · no split-unit write remains that replaces store_value with no predicate',
  splitWrites.every(s => !/DO UPDATE SET[\s\S]*store_value\s*=\s*EXCLUDED\.store_value/i.test(s)
                       || /WHERE[\s\S]*iq_store\.rev/i.test(s)));
ok('4 · the legacy main blob is left alone, so the pre-migration restore point still works',
  _stmts.some(s => /VALUES\s*\(\s*'main'/i.test(s)));

/* ── 5 · CREATION. Two processes creating the same unit at once must not produce two divergent
   accepted rows. An absent unit is revision 0; the first writer inserts revision 1; a second
   concurrent insert must lose rather than overwrite. ── */
ok('5 · concurrent creation of an absent unit is safe',
  splitWrites.some(s => /ON CONFLICT\s*\([^)]*\)\s*DO NOTHING/i.test(s)) ||
  splitWrites.some(s => /WHERE[\s\S]*iq_store\.rev\s*=/i.test(s)));

/* ── 6 · A CONFLICT IS NOT A FAILURE. Zero rows affected means another process got there first.
   That is a semantic answer the caller must be able to act on, and it must never be thrown as
   though the database were broken — the retry behaviour for the two is opposite. ── */
ok('6 · saveStores reports conflicts as a result rather than throwing',
  /conflicts?\b/.test(SRC) && /return\s*\{[^}]*conflicts?/.test(SRC));
ok('6 · …and the conflict names which units were refused, so the caller can reload exactly those',
  /conflicts\s*[:=]\s*\[|conflicts\.push\(/.test(SRC));

/* ── 7 · The contract is reachable from the server without reading db.js's internals. ── */
ok('7 · the store exports the compare-and-swap surface the server needs',
  typeof db.saveStores === 'function' && typeof db.loadStores === 'function' &&
  /saveStores[\s\S]{0,200}expect/.test(SRC));

console.log(`\ndb-cas-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
