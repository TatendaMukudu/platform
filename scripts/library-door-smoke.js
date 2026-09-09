/* Truth layer — THE LIBRARY DOORS.

   FOUNDER DECISION, September 2026: there is ONE user-facing product called Library, and it is
   the shelf — an index of live governed objects, held BY REFERENCE. Keeping something does not
   copy it, does not grant anybody access, does not create evidence, and does not change
   epistemic state. The old copy-taking Library is out of the user-facing product.

   THIS SUITE EXISTS BECAUSE THE ROUTE WAS NEVER THE PROBLEM. POST /api/library/shelf has always
   accepted a folder and always treated re-filing as a move; scripts/shelf-http-smoke.js proved
   it four separate ways and passed. What nothing tested was whether a person could reach any of
   it — and they could not. `fileToShelf(kind, id, folderId)` had exactly one call site, which
   passed two arguments, and the shelf row had two controls: open, and remove. Folders could be
   created and named, and every chip read 0 forever.

   So these are DOOR assertions, and each is scoped to the ROUTED renderer's own body rather
   than to the file. Matching a function's declaration instead of its call is lie #1 in
   docs/reviews/PROTOCOL.md and this repository has produced it seven times; matching a second
   call site elsewhere in a 13,000-line file is lie #2.

   Run: node scripts/library-door-smoke.js */

'use strict';
const fs = require('fs'), path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const appJs = R('js/app.js');
/* Comments stripped for the assertions that must be about CODE. Without this, a comment
   explaining what was retired matches the pattern that proves it was retired, and the suite
   goes red on prose or, worse, green on a comment. */
const appCode = appJs.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/* The body of ONE method of MemberApp, from its signature to the `  },` that closes it at the
   object's indent. Everything asserted below is asserted inside the thing that actually runs. */
function methodBody(src, signature) {
  const start = src.indexOf(signature);
  if (start < 0) return '';
  const end = src.indexOf('\n  },', start);
  return end < 0 ? '' : src.slice(start, end);
}

/* ── L1-L3: THE ONE LIBRARY ──────────────────────────────────────────────────────────────── */
console.log('\n  ONE LIBRARY');

const todayHeader = methodBody(appJs, 'function renderTodayAsk(');
const libraryButtons = (appJs.match(/<button[^>]*>Library<\/button>/g) || []);

ok('L1 the visible Library control opens the SHELF — the reference model — and not the old copy-taking modal',
  /onclick="navigate\('notes'\)"[^>]*>Library</.test(appJs));

ok('L1b …and `notes` is wired to the shelf renderer, so the entry point resolves to something real rather than to a route that no longer renders it',
  /notes:\s*\(\)\s*=>\s*\{[^}]*MemberApp\._renderNotesPage\(\)/.test(appJs)
  && /_renderNotesPage\(\)\s*\{\s*await this\._renderShelf\(\);/.test(appJs));

ok('L2 nothing labelled Library reaches the retired surface — one product, one name, and no second door wearing it',
  libraryButtons.length > 0 && libraryButtons.every(b => /navigate\('notes'\)/.test(b)));

/* The copy WAS the defect, not just a duplicate surface. from-chat flattened a live conversation
   into a second record beside it, and `visibility: 'shared'` granted teammates a read through a
   quieter rule than the governed audiences. Both are laws, so both are asserted. */
ok('L3 the client never takes a COPY of a conversation any more — /api/library/from-chat has no caller in the front end',
  !/\/api\/library\/from-chat/.test(appJs) && !/\/api\/library\/from-chat/.test(R('index.html')));

ok('L3b …and the client never sets the legacy shared-visibility flag, which was a second answer to who may see something',
  !/visibility['"]?\s*:\s*['"]shared/.test(appCode) && !/libShare\s*\(/.test(appCode));

ok('L3c …while keeping a conversation is still possible — by REFERENCE, through the one canonical shelf route',
  /function todayKeepChat\(\)/.test(appJs)
  && /MemberApp\.fileToShelf\('conversation'/.test(methodBody(appJs, 'async function todayKeepChat(') + appJs.slice(appJs.indexOf('async function todayKeepChat('), appJs.indexOf('async function todayKeepChat(') + 400)));

/* ── L4-L7: FOLDERS THAT CAN ACTUALLY HOLD SOMETHING ─────────────────────────────────────── */
console.log('\n  SHELF FOLDERS');

const renderShelf = methodBody(appJs, 'async _renderShelf() {');
ok('L4 the shelf renderer was found (every assertion below is scoped to its body, not to the file)',
  renderShelf.length > 400);

/* MATCHED TOGETHER WITH THE CONDITION IT SITS BEHIND, and that is the whole point of this
   assertion rather than a detail of it. Written as a bare search for the onchange handler, it
   passed against a control parked behind `${false ? ...}` — the markup was still in the file and
   could never render. That is lie #9 in PROTOCOL: text is not reachability. The test must be
   that the control is emitted WHEN THERE ARE FOLDERS, so a mutation that disables it goes red. */
ok('L5 a row carries a control that files it into a FOLDER — the third argument, from a control that actually renders whenever folders exist',
  /\$\{\(d\.folders \|\| \[\]\)\.length \?[\s\S]{0,600}?onchange="MemberApp\.fileToShelf\('\$\{[^}]*i\.kind[^}]*\}','\$\{[^}]*i\.refId[^}]*\}',this\.value\)"/.test(renderShelf));

ok('L5b …and it offers every folder that exists plus the way back out of all of them',
  /No folder<\/option>/.test(renderShelf) && /d\.folders \|\| \[\]/.test(renderShelf));

ok('L5c …showing which folder the item is in now, so the control reports state instead of only setting it',
  /selected/.test(renderShelf) && /i\.folderId/.test(renderShelf));

/* ONE FILING OPERATION. The route already moves on a re-file (ai/shelf.js `file`), so a second
   "move" endpoint or a client-side folder state machine would be two descriptions of one rule,
   and two descriptions of one rule always drift. */
const fileToShelf = methodBody(appJs, 'async fileToShelf(kind, id, folderId) {');
ok('L6 filing and moving go through the SAME canonical route — no second endpoint, no second folder state machine',
  /\/api\/library\/shelf/.test(fileToShelf)
  && /folderId: folderId \|\| null/.test(fileToShelf)
  && !/\/api\/library\/shelf\/move/.test(appJs));

ok('L6b …and the shelf is re-read from the server afterwards, so the folder counts on screen are the ones the server computed, never a number the client kept',
  /this\._renderShelf\(\)/.test(fileToShelf));

/* THE COUNT IS THE VISIBLE PROOF A FOLDER HOLDS ANYTHING. It has to come from what this reader
   can see (ai/shelf.js view()), never from what was filed — a count of everything filed would
   report the existence of what the gate just withheld. */
ok('L7 the folder chips render the server-computed count rather than counting rows the client happens to be holding',
  /f\.count/.test(renderShelf) && !/folders\.map\([^)]*=> *\{[\s\S]{0,200}?\.filter\(/.test(renderShelf));

/* ── L8: KEEPING IS STILL NOT COPYING ────────────────────────────────────────────────────── */
console.log('\n  THE LAW THE LIBRARY RESTS ON');

ok('L8 the Keep control says what it did — a reference, not a copy — because "Save" is what the old Library meant and what everybody still expects',
  /points at it, it is not a copy/.test(fileToShelf));

ok('L8b …and taking something off the shelf says the thing itself is untouched',
  /Nothing was deleted/.test(methodBody(appJs, 'async unfileFromShelf(entryId) {')));

console.log(`\nlibrary-door-smoke: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
