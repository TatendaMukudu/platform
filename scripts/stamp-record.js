/* Record the current asset stamp against a fingerprint of the files it busts.

   This is the WRITE half of `scripts/asset-version-smoke.js`, split out because a guard that edits
   the thing it guards is not a guard: `npm test` used to rewrite this lock file whenever it was
   satisfied, leaving a dirty tree after every run and letting a lock change ride into an unrelated
   commit without anybody choosing it.

   Run deliberately, after bumping the stamp in index.html:  npm run stamp:record */

'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const refs = [...html.matchAll(/(?:src|href)="((?:js|css)\/[A-Za-z0-9_.-]+\.(?:js|css))(\?v=([A-Za-z0-9]+))?"/g)]
  .map(m => ({ file: m[1], stamp: m[3] || null }));
const stamps = [...new Set(refs.map(r => r.stamp).filter(Boolean))];
if (stamps.length !== 1) {
  console.error(`refusing to record: index.html carries ${stamps.length} different stamps (${stamps.join(', ') || 'none'}).`);
  process.exit(1);
}
const fingerprint = crypto.createHash('sha1')
  .update(refs.map(r => fs.readFileSync(path.join(root, r.file))).join('\n'))
  .digest('hex').slice(0, 12);

const lockPath = path.join(root, 'scripts', '.asset-version.lock');
fs.writeFileSync(lockPath, JSON.stringify({ stamp: stamps[0], fingerprint }, null, 2) + '\n');
console.log(`recorded: stamp ${stamps[0]} for fingerprint ${fingerprint}`);
