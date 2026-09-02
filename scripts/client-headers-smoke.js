/* Truth layer — A JSON POST WITHOUT A CONTENT-TYPE IS A POST THE SERVER NEVER READS.

   `_authHeaders()` returned only `{ Authorization }`. Express therefore did not parse the body
   of any JSON POST made through it, `req.body.text` arrived empty, and the server answered
   "text required" — which is exactly what the founder saw when sending from a thread. Home
   worked only because that one call site happened to set the header itself.

   33 fetches in js/app.js use that helper. One missing header broke every JSON POST among them
   at once, and it presented as a UI bug ("the send button does nothing"), which is why it
   survived several passes: I kept looking at the button.

   Two rules, both mechanical:
     · the shared header helper must carry Content-Type
     · no POST with a JSON body may be sent without one

   Run: node scripts/client-headers-smoke.js */

'use strict';
const fs = require('fs');
const path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

/* The helper itself. */
const helper = app.slice(app.indexOf('  _authHeaders() {'), app.indexOf('  _lsResults()'));
ok('CH1 the shared header helper exists', helper.length > 20);
ok('CH2 …and it carries Content-Type, so a JSON body is actually parsed',
  /['"]Content-Type['"]\s*:\s*['"]application\/json['"]/.test(helper));
ok('CH3 …and it still carries the token when there is one',
  /Authorization/.test(helper) && /Auth\.token/.test(helper));

/* Every fetch that sends a JSON body. Each must reach a header set that includes Content-Type —
   either the shared helper (now compliant) or an inline object that sets it. */
const posts = [...app.matchAll(/fetch\(([\s\S]{0,400}?)body:\s*JSON\.stringify/g)].map(m => m[1]);
ok('CH4 the file does send JSON bodies', posts.length >= 5);

/* Two compliant helpers exist: MemberApp._authHeaders (js/app.js) and Auth._headers
   (js/auth.js). Both are verified above / below to carry Content-Type, so reaching either one
   is enough; anything else must set the header itself. An earlier version of this check knew
   only about the first and reported 38 false positives, which is its own lesson — an assertion
   that cries wolf gets ignored exactly when it is right. */
const bad = posts.filter(chunk =>
  !/_authHeaders\(\)/.test(chunk) && !/_headers\(/.test(chunk) && !/Content-Type/.test(chunk));
if (bad.length) console.error(`       ${bad.length} JSON POST(s) with neither a header helper nor a Content-Type`);
ok('CH5 every JSON body is sent with a Content-Type — through a helper or explicitly',
  bad.length === 0);

const authHelper = fs.readFileSync(path.join(__dirname, '..', 'js', 'auth.js'), 'utf8');
const authSlice = authHelper.slice(authHelper.indexOf('  _headers(extra'), authHelper.indexOf('  isMember()'));
ok('CH6 the OTHER header helper carries Content-Type too — both doors, or the guard has a hole',
  /['"]Content-Type['"]\s*:\s*['"]application\/json['"]/.test(authSlice));

console.log(`\nclient-headers-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
