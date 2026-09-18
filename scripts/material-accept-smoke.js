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
/* ── AND THE READERS ARE PRESENT WHILE THE OLD ASSERTIONS RUN ──────────────────────────────
   Three of the five Material kinds are read by libraries that arrive from a CDN, and the handler
   now derives what it OFFERS from what actually loaded (section N proves that both ways). In
   Node neither library exists, so without this the whole file below would be measuring the
   degraded list and would quietly stop testing the thing it was written for. Declared here, at
   the top, rather than discovered later as three mysterious failures. */
globalThis.JSZip = globalThis.JSZip || {};
globalThis.XLSX  = globalThis.XLSX  || {};
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

/* ── M7 — THE SHARED COMPOSER WAS A THIRD LIST, AND IT AGREED WITH NEITHER ──────────────────
   Every composer in the product renders from _composerHTML, and its paperclip carried a
   hand-written `.txt,.md,.markdown,.csv,.json,.pdf,.doc,.docx`. That list:

     offered .json and .markdown   the parser has no entry for either — process() throws
     offered .doc                  routes to the docx processor, which opens a zip; a legacy
                                   binary is not a zip, so it throws rather than returning empty
     offered .pdf                  comes back as BYTES, so the "no text" error is the only
                                   possible outcome on a path that sends text to the server
     omitted .pptx and .xlsx       the two formats the whole material capability exists for

   And wsAttach sends TEXT to /api/assistant/attachments, so this IS the Material path — the same
   path the Material picker uses, advertising a different set of files. */
const composerInput = (appJs.match(/<input type="file" class="iq-attach-input"[^>]*>/) || [''])[0];
/* ── AND THEN THE COMPOSER GREW A SECOND CAPABILITY ────────────────────────────────────────
   The law here was never "call materialAcceptAttr". It is that the picker is DERIVED from the
   owner beside the processors and is never a hand-written list, because a hand-written list
   drifts and then advertises files the product refuses.

   The composer now also takes a PHOTOGRAPH, which the Material list cannot describe: a picture is
   not turned into words in the browser, it is read by the server through the vision gateway. So
   the composer asks `composerAcceptAttr` -- the Material list PLUS the image types the server will
   actually read -- and `composerAcceptAttr` is itself derived from the same two owners. The
   derivation law is intact; what changed is that there are two capabilities behind one paperclip.

   The Material picker elsewhere (iqt-mat-file) still asks for the Material list alone, because
   that path really does only take text. */
ok('M7 the shared composer\'s paperclip is DERIVED from the handler, never hand-written',
  /(materialAcceptAttr|composerAcceptAttr)\(\)/.test(composerInput)
  && !/accept="\.[a-z]/.test(composerInput));
ok('M7b …and no longer advertises a format the parser would refuse or throw on',
  !/\.json/.test(composerInput) && !/\.markdown/.test(composerInput)
  && !/\.doc[,"]/.test(composerInput) && !/\.pdf/.test(composerInput));
ok('M7c …and it offers the two formats the capability was built for, which the hand-written list left out',
  (() => { const attr = A && A.composerAcceptAttr ? A.composerAcceptAttr() : '';
    return attr.includes('.pptx') && attr.includes('.xlsx') && /composerAcceptAttr/.test(composerInput); })());
/* THE IMAGE HALF, AND THE ONE THING IT MUST NOT DO. `image/*` would let an iPhone offer a HEIC,
   which is what it produces by default and which nothing in this product can read -- the picker
   would accept it and the upload would refuse it, which is the hollow-control shape this codebase
   has been caught by before. The readable types are named, so the file chooser does the refusing
   before anybody waits. */
ok('M7c2 …and the composer additionally offers the image types the SERVER can read',
  (() => { const attr = A && A.composerAcceptAttr ? A.composerAcceptAttr() : '';
    return attr.includes('image/jpeg') && attr.includes('image/png') && attr.includes('image/webp'); })());
ok('M7c3 …and never the wildcard, which would offer an iPhone HEIC nothing here can read',
  (() => { const attr = A && A.composerAcceptAttr ? A.composerAcceptAttr() : '';
    return !attr.includes('image/*') && !/heic|heif/i.test(attr); })());
ok('M7c4 …while the Material-only picker still asks for the Material list alone',
  (() => { const mat = (appJs.match(/<input type="file" id="iqt-mat-file"[^>]*>/) || [''])[0];
    return /materialAcceptAttr\(\)/.test(mat) && !/composerAcceptAttr/.test(mat); })());
ok('M7d …through the same `typeof` guard, since the window form renders an EMPTY accept that offers every file on the phone',
  /typeof AttachmentHandler !== 'undefined' \? AttachmentHandler\.(materialAcceptAttr|composerAcceptAttr)\(\)/.test(composerInput));
ok('M7e NO hand-written accept list survives on a path that sends text to the server',
  (() => {
    const inputs = appJs.match(/<input type="file"[^>]*>/g) || [];
    const textPath = inputs.filter(t => /wsAttach|iqt-mat-file/.test(t));
    return textPath.length >= 2
      && textPath.every(t => /(materialAcceptAttr|composerAcceptAttr)\(\)/.test(t));
  })());

/* ── M8 — AN UPLOAD IS A WRITE, AND EVERY OTHER WRITE IN THIS FILE IS BOUNDED ──────────────
   wsAttach had no ceiling at all: a stalled POST left "Reading that file…" on the screen for as
   long as somebody was willing to wait, which is the defect the bounded reader exists to remove,
   arriving through the one door that had not been fixed. And its error card had no control, on
   the surface where a person has already done the work of finding the file. */
/* DECOMMENTED, and the reason is the same trap twice in one round: the comment that explains why
   the old sentence went away quotes the old sentence, so a search for it finds the explanation
   and reports the defect as still present. An assertion that cannot tell code from the prose
   about it will be wrong in whichever direction somebody last wrote. */
const wsAttachFn = appJs.slice(appJs.indexOf('async wsAttach(fileInput)'), appJs.indexOf('async assistantTurn('))
  .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, ' ');
ok('M8 the upload is bounded — a stalled POST cannot leave the card reading forever',
  wsAttachFn.length > 400 && /new AbortController\(\)/.test(wsAttachFn) && /signal: ctrl\.signal/.test(wsAttachFn));
ok('M8b …and the timer is cleared in a `finally`, so it stays live through the body read',
  /finally \{ clearTimeout\(timer\); \}/.test(wsAttachFn));
/* M8c USED TO PIN THE OPPOSITE SENTENCE, and the reason is worth keeping. It asserted the card
   said "took too long to send. Nothing was saved", under the heading "rather than reporting a
   save that did not happen" — which is the right instinct aimed at the wrong risk. The risk in
   the other direction is larger: an aborted fetch says nothing about what the server did with the
   bytes it already had, so "Nothing was saved" is a claim the client cannot make, and it is the
   sentence that makes somebody upload the same document again. What the card may say is that it
   could not CONFIRM. See attachment-retry-http-smoke, which drives the retry that sentence
   invites and proves the server reconciles it to one material and one thread. */
ok('M8c …and a timeout says what it KNOWS — that it could not confirm — rather than claiming a loss it cannot see',
  !/Nothing was saved/.test(wsAttachFn)
  && /cannot tell you whether it saved/i.test(wsAttachFn)
  && /will not be added twice/i.test(wsAttachFn));
ok('M8d a failed upload offers a retry, because the picker has already been cleared',
  /wsAttachRetry/.test(wsAttachFn) && /Try again/.test(wsAttachFn));
ok('M8e …once, not forever — a control that retries endlessly teaches somebody to keep pressing it',
  /this\._retryAttach = null;/.test(appJs));

/* ── M9 — AND ATTACHING SOMETHING DOES NOT CONTRIBUTE IT ───────────────────────────────────
   THIS ASSERTION USED TO PIN A SENTENCE: "context for this conversation, not evidence about you
   or your organisation". The founder removed that sentence, for two reasons that are both about
   truth rather than tidiness.

   It was a parser receipt with a lecture attached — the card also announced how many PARTS the
   file had been split into, which is machinery, and attaching something is meant to be another
   way of speaking rather than a filing operation.

   And "not evidence" had quietly become FALSE as a flat claim. It is not evidence YET. The person
   may say "use this as evidence", and the governed route for that exists (M9b). A sentence that
   forecloses something the product supports teaches people not to ask for it.

   So what is asserted here now is the LAW rather than the wording of one card: the attach path
   uploads, and does nothing else. A receipt claiming the boundary is worth nothing if the code
   beside it crosses the boundary, and a missing receipt costs nothing if the code does not. */
ok('M9 attaching uploads and does no more — the client contributes nothing on the person\'s behalf',
  /\/api\/assistant\/attachments/.test(wsAttachFn)
  && !/\/contribute/.test(wsAttachFn)
  && !/applyProposals/.test(wsAttachFn)
  && !/\/evidence/.test(wsAttachFn));
ok('M9a …and the card it shows makes no claim about what the file proves',
  !/is evidence/i.test(wsAttachFn) && !/proves/i.test(wsAttachFn));

/* ── M10 — A SUCCESSFUL ATTACHMENT SAYS NOTHING AT ALL ─────────────────────────────────────
   The file is already in the thread as the PERSON'S OWN message, because attaching is another way
   of speaking. A second bubble from IntelliQ confirming it arrived is the product narrating its
   own plumbing — first "Read 10 parts from IMG_1918.png", then "I can see IMG_1918.png". Both are
   receipts. Somebody who attaches a screenshot and writes "look at all those draws" should get an
   answer about the draws.

   The waiting bubble is NOT removed: a phone on a stadium connection needs to see that something
   is happening, and on failure the error and its retry are the only way back. Asserting both
   halves, because "say nothing" is only right for the case where there is nothing to say. */
ok('M10 a successful attachment removes the waiting bubble rather than replacing it with a receipt',
  /const quietly = \(\) =>/.test(wsAttachFn) && /p\.remove\(\)/.test(wsAttachFn)
  && !/I can see \$\{/.test(wsAttachFn));
ok('M10b …while the waiting state still exists, because an upload in flight must be visible',
  /iq-attach-pending/.test(wsAttachFn) && /Reading \$\{esc\(file\.name\)\}/.test(wsAttachFn));
ok('M10c …and a FAILED attachment still speaks, because an error with no words is a dead end',
  /done\(/.test(wsAttachFn) && /Try again/.test(wsAttachFn));
ok('M9b …and turning one into evidence is a separate, deliberate act with its own route',
  /\/classification/.test(appJs));

/* ── N — A LIST IS ONLY TRUE IF THE THING THAT READS IT LOADED ─────────────────────────────
   THE HOLE. Word, PowerPoint and spreadsheets are read by libraries fetched from a CDN — JSZip
   and SheetJS, two <script src="https://..."> tags in index.html. The whole of this file above
   asks "does the picker offer only what the parsers can read", and every one of those assertions
   passed while the answer depended on a network request nobody checked.

   The founder's device is a phone on a stadium connection, and this is installable. Offline, on a
   filtered network, or on a second visit with no signal, the page still runs and those globals do
   not exist. The picker offered .docx anyway; `_processDocx` reached `JSZip.loadAsync` and threw
   `JSZip is not defined` at somebody who had just chosen a file. That is the exact hollow-control
   shape this file was written to prevent, arriving through the one gap the rule did not cover:
   what is ADVERTISED was hard-coded while what is POSSIBLE was not.

   ASSERTED BOTH WAYS, because a one-directional test here proves nothing. With the libraries
   present the offer must be unchanged — a fix that quietly narrowed the product for everybody
   would be worse than the bug. With them absent the format must not be offered AND, if it is
   reached anyway by a drag or a share sheet, the refusal must be a sentence about what is missing
   rather than a library's ReferenceError. */
console.log('\n  N — AND WHAT IS OFFERED DEPENDS ON WHAT ACTUALLY LOADED');
/* THE SWAP IS AWAITED BEFORE IT IS UNDONE. `_processDocx` is async, so if the globals were put
   back while it was still suspended on `await file.arrayBuffer()`, `JSZip` would be present again
   by the time the processor reached it — and N4 would be asserting against a different error than
   the one a coach actually saw. Found by mutating the guard away and watching N4 stay green. */
const handlerWith = async present => {
  const had = { JSZip: globalThis.JSZip, XLSX: globalThis.XLSX };
  if (present) { globalThis.JSZip = {}; globalThis.XLSX = {}; }
  else { delete globalThis.JSZip; delete globalThis.XLSX; }
  let h = null;
  try { h = new Function(`${src}\nreturn AttachmentHandler;`)(); } catch (_) { h = null; }
  let out = null;
  if (h) {
    /* A FILE THAT BEHAVES LIKE A FILE, so that WITHOUT the guard this really does reach
       `JSZip.loadAsync` and really does produce the ReferenceError a coach was being shown. A
       stub with no arrayBuffer would fail earlier, for a reason that is not the bug. */
    const f = { name: 'plan.docx',
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      arrayBuffer: async () => new ArrayBuffer(8) };
    let refusal = null;
    try { await h.process(f); } catch (e) { refusal = String(e && e.message); }
    out = { material: h.materialAcceptAttr(), composer: h.composerAcceptAttr(),
      kinds: h.readableMaterialKinds(), refusal };
  }
  globalThis.JSZip = had.JSZip; globalThis.XLSX = had.XLSX;
  if (had.JSZip === undefined) delete globalThis.JSZip;
  if (had.XLSX === undefined) delete globalThis.XLSX;
  return out;
};


(async () => {
const withLibs = await handlerWith(true);
const noLibs   = await handlerWith(false);
ok('N1 with the readers loaded, the offer is exactly what it always was',
  !!withLibs && ['.docx', '.xlsx', '.pptx', '.txt', '.md', '.csv'].every(e => withLibs.material.includes(e)));
ok('N1b …and the composer still offers them alongside the image types',
  !!withLibs && withLibs.composer.includes('.pptx') && withLibs.composer.includes('image/png'));
ok('N2 with the readers MISSING, the formats that need them are not offered',
  !!noLibs && !noLibs.material.includes('.docx') && !noLibs.material.includes('.pptx')
  && !noLibs.material.includes('.xlsx'));
ok('N2b …and neither does the composer, which is the picker a person actually presses',
  !!noLibs && !noLibs.composer.includes('.docx') && !noLibs.composer.includes('.xlsx'));
ok('N3 …while the formats that need nothing are still offered, so a lost CDN does not take the whole door with it',
  !!noLibs && noLibs.material.includes('.txt') && noLibs.material.includes('.csv')
  && noLibs.material.includes('.md') && noLibs.composer.includes('image/jpeg'));
ok('N3b …and the handler says which kinds it can actually read right now, not which it knows about',
  !!noLibs && noLibs.kinds.length === 2 && !noLibs.kinds.includes('docx')
  && !!withLibs && withLibs.kinds.length === 5);

/* THE FILE THAT GETS THERE ANYWAY. A drag, a share sheet, or a page cached before the connection
   went: the picker is not the only door, so the refusal has to be readable too. */
  const msg = noLibs && noLibs.refusal;
  ok('N4 a file picked anyway is refused with a sentence, not a library\'s ReferenceError',
    typeof msg === 'string' && !/is not defined/.test(msg) && !/ReferenceError/.test(msg));
  ok('N4b …that names what is missing and what still works',
    typeof msg === 'string' && /did not load/i.test(msg) && /paste the text/i.test(msg));
  const fine = withLibs && withLibs.refusal;
  ok('N4c …and with the readers present that refusal does not happen at all',
    fine === null || !/did not load/i.test(String(fine)));

  console.log(`\nmaterial-accept-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
