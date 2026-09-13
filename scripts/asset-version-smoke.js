/* Truth layer — SHIPPED CODE MUST ACTUALLY REACH THE BROWSER.

   Four sprints of UI work were merged to main, deployed correctly, and the founder saw no
   change at all — because every asset in index.html was still stamped `?v=20260729a`, the
   cache-buster from 29 July. Safari served July's app.js and styles.css from cache. Only
   voice.js had a fresh stamp, which is why voice appeared and nothing else did.

   That is the worst class of bug in this repository so far: everything was green, everything
   was merged, everything was deployed, and none of it was true for the person holding the
   phone. The suite proved the code was correct and could not see that nobody was running it.

   So: every versioned asset must carry the SAME stamp, and that stamp must change whenever the
   asset it points at changes. One shared stamp is deliberate — a per-file stamp is a thing
   somebody has to remember for the file they touched, and the whole reason this happened is
   that somebody did not.

   Run: node scripts/asset-version-smoke.js */

'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

/* Every local js/ or css/ reference, with the stamp it carries. */
const refs = [...html.matchAll(/(?:src|href)="((?:js|css)\/[A-Za-z0-9_.-]+\.(?:js|css))(\?v=([A-Za-z0-9]+))?"/g)]
  .map(m => ({ file: m[1], stamp: m[3] || null }));

ok('AV1 index.html references local scripts and styles', refs.length >= 5);

const unstamped = refs.filter(r => !r.stamp);
ok('AV2 every local asset carries a cache-busting stamp — an unstamped file is one a browser may serve from cache forever',
  unstamped.length === 0 || console.error('      unstamped:', unstamped.map(r => r.file).join(', ')) === undefined && unstamped.length === 0);

const stamps = [...new Set(refs.map(r => r.stamp).filter(Boolean))];
ok('AV3 they all share ONE stamp — a per-file stamp is a thing somebody has to remember, and that is exactly what failed',
  stamps.length === 1);

ok('AV4 every referenced file actually exists on disk',
  refs.every(r => fs.existsSync(path.join(root, r.file))));

/* THE GUARD THAT WOULD HAVE CAUGHT IT. The stamp is checked against a fingerprint of the files
   it is meant to bust. When app.js or styles.css changes and the stamp does not, this goes red
   — so shipping a change nobody can load becomes a failing build rather than a silent one. */
const fingerprint = crypto.createHash('sha1')
  .update(refs.map(r => fs.readFileSync(path.join(root, r.file))).join('\n'))
  .digest('hex').slice(0, 12);

const lockPath = path.join(root, 'scripts', '.asset-version.lock');
const lock = fs.existsSync(lockPath) ? JSON.parse(fs.readFileSync(lockPath, 'utf8')) : null;

/* ── A GUARD DOES NOT EDIT THE THING IT IS GUARDING ────────────────────────────────────────────
   This block used to WRITE the lock file whenever it was satisfied, so `npm test` mutated the
   repository. Two costs, and the second is the one that matters:

     - a CI run, or anybody's local run, left a dirty working tree, and a lock change could ride
       into an unrelated commit without anybody choosing it;
     - a test that can change repository state is a test whose result depends on how many times it
       has been run, which is the opposite of what a guard is for.

   It now only COMPARES, and says exactly what to run when the record is behind. Recording is a
   deliberate step -- `npm run stamp:record` -- so the person bumping the stamp is the person who
   records it. */
const UPDATE_HINT = 'run `npm run stamp:record` after bumping the stamp in index.html';

if (!lock) {
  ok(`AV5 the asset stamp record exists (${UPDATE_HINT})`, false);
} else if (lock.fingerprint !== fingerprint) {
  // The assets changed. That is fine -- but the stamp must have changed with them, AND the record
  // must have been updated deliberately rather than by the act of running this file.
  ok('AV5 assets changed, so the cache stamp changed with them — otherwise the browser keeps the old ones',
    lock.stamp !== stamps[0]);
  ok(`AV5b …and the recorded fingerprint was updated with it (${UPDATE_HINT})`, false);
} else {
  ok('AV5 assets are unchanged since the recorded stamp', true);
  ok('AV5b …and the record matches the stamp index.html actually carries', lock.stamp === stamps[0]);
}

/* AV6 — THE GUARD ITSELF. Written because the defect above was invisible: a test that writes is
   indistinguishable from one that does not, right up until you read it. */
ok('AV6 this guard does not write to the repository',
  !/fs\.writeFileSync/.test(fs.readFileSync(__filename, 'utf8').split('AV6')[0]));

console.log(`\nasset-version-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
