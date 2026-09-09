/* Truth layer — THE MATERIAL PICKER ONLY OFFERS WHAT IT CAN READ.

   Two capabilities, two lists, and conflating them was the defect. The CHAT attachment path
   sends a file to the model as a document or image block, so it legitimately offers PDFs and
   pictures. The MATERIAL path sends TEXT to the server — the server never holds the file — so a
   format the browser-side handler cannot turn into words is not a Material, however legitimate
   it is elsewhere. The Material picker borrowed the chat list, so it advertised `image/*`,
   `.pdf`, `.doc` and `.ppt`, and a coach reaching for a scouting PDF picked it, waited for it to
   read, and was then told nothing readable came out of it. The refusal message was honest. The
   picker should never have offered the file.

   THE ASSERTION IS THE MAPPING, NOT THE STRING. A hardcoded expected accept-list would pass
   while a processor quietly stopped returning text, which is lie #6 in docs/reviews/PROTOCOL.md
   — an assertion that defends the bug. So every advertised extension is followed to the kind it
   routes to, and that kind's processor is required to return `content`.

   Run: node scripts/material-accept-smoke.js */

'use strict';
const fs = require('fs'), path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const src = R('js/attachments.js');
const appJs = R('js/app.js');

/* The real object, evaluated — not a regex guess at what it contains. It is a plain top-level
   const with no DOM access at definition time, so it loads outside a browser unchanged. */
let A = null;
try { A = new Function(`${src}\nreturn AttachmentHandler;`)(); } catch (_) { A = null; }
ok('M0 the attachment handler loads outside a browser, so this suite is testing the real object rather than its source text',
  !!A && typeof A.materialAcceptAttr === 'function');

/* Which kinds actually hand back words. Read from the processors, so the answer comes from the
   code that does the work rather than from a list somebody remembered to update. */
const returnsContent = kind => {
  const fn = { docx: '_processDocx', xlsx: '_processXlsx', pptx: '_processPptx', text: '_processText', csv: '_processCsv',
    pdf: '_processPDF', image: '_processImage' }[kind];
  if (!fn) return false;
  const start = src.indexOf(`async ${fn}(`);
  if (start < 0) return false;
  const end = src.indexOf('\n  },', start);
  const body = end < 0 ? src.slice(start) : src.slice(start, end);
  // `content,` (shorthand) and `content: x` both count; `claudeMsg` embedding a local does not.
  return /(^|[\s{,])content\s*[,:]/m.test(body);
};

console.log('\n  WHAT THE PARSERS CAN ACTUALLY DO');
ok('M1 pptx returns text — the founder\'s scouting-deck case, named because it is the one that must not regress',
  returnsContent('pptx'));
ok('M1b docx, xlsx, plain text and csv return text too',
  ['docx', 'xlsx', 'text', 'csv'].every(returnsContent));
ok('M1c PDF and images do NOT — they come back as bytes for the model, with no words for the server',
  !returnsContent('pdf') && !returnsContent('image'));

console.log('\n  WHAT THE MATERIAL PICKER OFFERS');
const exts = A ? Object.keys(A.MATERIAL_EXTENSIONS) : [];
ok('M2 every extension the Material picker advertises maps to a parser that returns text',
  exts.length > 0 && exts.every(e => returnsContent(A.MATERIAL_EXTENSIONS[e])));

ok('M2b …and the accept attribute is DERIVED from that map, so the picker and the parser table cannot drift apart',
  A && A.materialAcceptAttr() === exts.join(','));

ok('M3 PDF is not offered as a Material until that path can read one',
  !/\.pdf/i.test(A ? A.materialAcceptAttr() : '.pdf'));
ok('M3b …nor are images, for the same reason',
  !/image/i.test(A ? A.materialAcceptAttr() : 'image'));
ok('M3c …nor .doc or .ppt, which are the subtler trap: they route to the docx and pptx processors, which open a zip, and the legacy binary formats are not zips — they throw rather than returning empty',
  !/(^|,)\.(doc|ppt)(,|$)/.test(A ? A.materialAcceptAttr() : '.doc'));

console.log('\n  THE TWO CAPABILITIES STAY SEPARATE');
ok('M4 the CHAT path still offers PDFs and images — it sends them to the model as document blocks, and narrowing it would break a capability that works',
  A && /image\/\*/.test(A.ACCEPT_ATTR) && /\.pdf/.test(A.ACCEPT_ATTR));

/* The door. A correct list on the handler proves nothing if the input still asks for the other
   one — which is exactly the shape of the original defect. */
const matInput = (appJs.match(/<input type="file" id="iqt-mat-file"[^>]*>/) || [''])[0];
ok('M5 the Material file input asks for the MATERIAL list',
  /materialAcceptAttr\(\)/.test(matInput));
ok('M5b …and no longer borrows the chat list, which is how it came to advertise what it refuses',
  !/ACCEPT_ATTR/.test(matInput));

/* THE GUARD THAT WAS ALWAYS FALSE. `AttachmentHandler` is a top-level `const` in a classic
   script, and a top-level const does not become a property of `window` — so a
   `window.AttachmentHandler && ...` guard evaluated to undefined every single time and the
   attribute rendered EMPTY. An empty accept offers every file on the phone, which is the exact
   opposite of what the guard existed to do, and no source-level test could see it because the
   source said the right thing. It was found by opening the page in a browser. Pinned here so it
   cannot come back, and pinned across the whole file because the other call sites already use
   the right idiom and must keep using it. */
ok('M6 the picker\'s guard is `typeof AttachmentHandler`, not `window.AttachmentHandler` — the handler is a top-level const, so the window form is always undefined and the accept attribute renders empty',
  /typeof AttachmentHandler !== 'undefined' \? AttachmentHandler\.materialAcceptAttr\(\)/.test(matInput));
ok('M6b …and no guard anywhere in the client reaches for the handler through window',
  !/window\.AttachmentHandler\s*&&/.test(appJs));

console.log(`\nmaterial-accept-smoke: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
