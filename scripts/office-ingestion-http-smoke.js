/* Truth layer — A DOCUMENT IS READ BY THE SERVER, AND THE CDN IS NOT PART OF THE PRODUCT.

   FOUNDER DECISION, September 2026:

     Keep support for DOCX, XLSX and PPTX. But core document understanding must not depend on
     runtime browser CDNs. The browser should essentially select → upload → display attachment →
     converse. The controlled server ingestion path should validate and understand the document.
     Do not vendor arbitrary minified third-party bundles just to make tests green. Do not create
     another document-intelligence system. Reuse Material and existing ingestion architecture.

   WHAT THIS REPLACES. The browser opened those three formats with JSZip and SheetJS — two
   `<script src="https://…">` tags — and posted extracted text. Round 5 measured that this build
   environment cannot reach either CDN, which means those formats had never once worked in a
   browser check while every source-level assertion about them was green.

   WHAT WAS REUSED RATHER THAN BUILT. `lib/office.js` already read .docx and .xlsx with no
   dependency — Node's own `zlib` over the ZIP central directory — and had been imported by
   server.js and called from nowhere since it was written. It gained the PowerPoint reader it was
   missing. Nothing was vendored; `package.json` is unchanged.

   THE FIXTURES ARE REAL FILES. `scripts/lib/make-office.js` writes actual ZIP archives with real
   CRCs, in BOTH storage methods — DEFLATE, which Word and PowerPoint produce, and STORE, which
   some phone exporters produce. A fixture that is not a real file would prove nothing about a
   reader whose whole job is opening real files.

   Run: node scripts/office-ingestion-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const fs = require('fs'), path = require('path');
const office = require('../lib/office.js');
const mk = require('./lib/make-office.js');
const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, materialSource } = S;

let pass = 0, fail = 0;
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const C = 'ofc';
_loadAllStores({
  orgMeta: { [C]: { orgName: 'Highlanders', orgMode: 'sports' } },
  orgUsers: { [C]: {
    me: { id: 'me', name: 'Tendai', email: 'm@o.io', role: 'member', orgCode: C,
      status: 'active', assignedNodeIds: ['first'], profileComplete: true },
    mate: { id: 'mate', name: 'Rudo', email: 'r@o.io', role: 'member', orgCode: C,
      status: 'active', assignedNodeIds: ['first'], profileComplete: true },
  } },
  orgNodes: { [C]: { first: { nodeId: 'first', name: 'First Team', parentId: null,
    childNodeIds: [], memberIds: ['me', 'mate'], leaderIds: [] } } },
});
_rebuildEmailIndex();

const DECK = Array.from({ length: 10 }, (_, i) => [`Section ${i + 1}`, `The point of slide ${i + 1}`]);

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = w => ({ Authorization: `Bearer ${issueToken(w, C, 'member')}`, 'Content-Type': 'application/json' });
  const call = (m, u, b, w = 'me') => fetch(base + u, { method: m, headers: H(w),
    body: b === undefined ? undefined : JSON.stringify(b) })
    .then(async r => ({ status: r.status, ct: r.headers.get('content-type') || '',
      j: (r.headers.get('content-type') || '').includes('json') ? await r.json().catch(() => null) : null,
      buf: (r.headers.get('content-type') || '').includes('json') ? null : Buffer.from(await r.arrayBuffer()) }));
  const upload = (buf, name, extra) => call('POST', '/api/assistant/attachments',
    Object.assign({ file: { data: buf.toString('base64'), name }, filename: name, title: name }, extra || {}));

  try {
    /* ══ A — NO BROWSER, NO CDN, AND THE WORDS COME OUT ═════════════════════════════════════
       The whole point: this file never loads a browser. If these pass, the capability does not
       live behind a script tag. */
    console.log('\n  A — THE SERVER READS ALL THREE FORMATS, WITH NO BROWSER ANYWHERE');
    ok('A0 nothing was vendored to achieve it — package.json has no new dependency',
      !/jszip|sheetjs|xlsx|mammoth|officegen|docx/i.test(
        fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')));
    ok('A0b …and lib/office.js depends on nothing but Node itself',
      (fs.readFileSync(path.join(__dirname, '..', 'lib', 'office.js'), 'utf8')
        .match(/require\(['"][^'"]+['"]\)/g) || []).every(r => /['"]zlib['"]/.test(r)));
    /* THE SCRIPT TAG, not the word — index.html carries a comment saying why those two are gone,
       and an assertion that cannot tell a comment from a dependency would fail on the explanation
       for its own subject. */
    ok('A0c …and index.html loads no document-parsing CDN',
      !/<script[^>]+src=["'][^"']*(jszip|sheetjs)/i
        .test(fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8')));

    for (const deflate of [true, false]) {
      const how = deflate ? 'deflated' : 'stored';
      const d = mk.docx(['Highlanders match review', 'We went quiet after conceding.',
        'Restarts were disorganised.'], { deflate });
      const x = mk.xlsx([['Match', 'Result', 'Home'], ['Bulawayo', '1-1', 'yes'],
        ['Harare', '0-2', 'no']], { deflate });
      const p = mk.pptx(DECK, { deflate });
      ok(`A1 a ${how} .docx yields its paragraphs`,
        /went quiet after conceding/.test(String(office.toText('docx', d))));
      ok(`A2 a ${how} .xlsx yields its rows, through sharedStrings`,
        /Match,Result,Home/.test(String(office.toText('xlsx', x)))
        && /Bulawayo,1-1,yes/.test(String(office.toText('xlsx', x))));
      const pt = String(office.toText('pptx', p));
      ok(`A3 a ${how} .pptx yields one line per slide`,
        (pt.match(/^Slide \d+:/gm) || []).length === 10);
      /* SLIDE 10 SORTS BEFORE SLIDE 2 ALPHABETICALLY. A deck handed back in string order makes
         "the third slide" mean a different thing to IntelliQ than to the person holding it. */
      /* ORDER AND IDENTITY ARE TWO CLAIMS. The first version of this asserted only that the
         label "Slide 2:" appeared before "Slide 10:" — and the labels were numbered from the
         loop index, so they were in order no matter what order the FILES came in. Removing the
         sort left it green while slide 2 carried slide 10's words. Both are asserted now:
         the lines are in numeric order, and each line holds its OWN slide's content. */
      ok(`A4 …in NUMERIC slide order, not string order (${how})`,
        pt.indexOf('Slide 2:') < pt.indexOf('Slide 10:')
        && pt.indexOf('Slide 9:') < pt.indexOf('Slide 10:'));
      ok(`A4b …and every line carries the content of the slide it names (${how})`,
        (pt.match(/^Slide (\d+): .*?The point of slide (\d+)$/gm) || []).length === 10
        && pt.split('\n\n').every(line => {
          const m = line.match(/^Slide (\d+):.*The point of slide (\d+)$/);
          return !!m && m[1] === m[2];
        }));
    }

    /* ══ B — THROUGH THE COMPOSER DOOR, END TO END ═════════════════════════════════════════ */
    console.log('\n  B — UPLOADED WHOLE, AND IT BECOMES AN ORDINARY MATERIAL');
    const deck = mk.pptx(DECK, { deflate: true });
    const up = await upload(deck, 'scouting.pptx');
    ok('B1 a .pptx is accepted through the composer door', up.status === 200 && !!up.j.materialId);
    const mid = String(up.j.materialId);
    ok('B2 …the server says it read it, and how much', up.j.parts === 10 && up.j.kind === 'pptx');
    /* SEGMENTED AS A DECK. `ai/material.js` splits on "Slide N:", so the parts a person marks
       "not yet" line up with the slides they are looking at. A deck arriving as one blob would
       pass every "did it upload" assertion and be useless. */
    const read = await call('GET', `/api/materials/${mid}`);
    ok('B3 …and it is held as ten parts, one per slide',
      read.status === 200 && (read.j.sections || []).length === 10);
    ok('B4 …each named from its own slide',
      (read.j.sections || []).every(s => /Slide \d+/.test(String(s.heading || '') + String(s.text || ''))));
    ok('B5 …with its kind decided by the reader that opened it',
      String((read.j.material || {}).kind) === 'pptx');
    ok('B6 …and the receipt says the file is kept and that it is not evidence',
      /file itself is kept/i.test(String(up.j.note))
      && /nothing in it is evidence about you or the organisation/i.test(String(up.j.note))
      && up.j.epistemicEffect === 'none');
    /* AND IT DOES NOT CLAIM TO HAVE UNDERSTOOD IT. What was taken is the words; a receipt that
       said "I have read your deck" would be promising a reading nobody did. */
    ok('B6b …and claims only to hold the words, not to have understood them',
      /I have the words out of/i.test(String(up.j.note))
      && !/I (?:have )?(?:read|understood|reviewed) (?:your|the) /i.test(String(up.j.note)));

    const docBuf = mk.docx(['Highlanders match review', 'We went quiet after conceding.'], { deflate: true });
    const upDoc = await upload(docBuf, 'review.docx');
    ok('B7 a .docx goes the same way', upDoc.status === 200 && upDoc.j.kind === 'docx');
    const sheet = mk.xlsx([['Match', 'Result'], ['Bulawayo', '1-1']], { deflate: true });
    const upX = await upload(sheet, 'results.xlsx');
    ok('B8 …and a .xlsx', upX.status === 200 && upX.j.kind === 'xlsx');

    /* ══ C — THE ORIGINAL IS KEPT, UNDER THE SAME RETENTION LAW ════════════════════════════
       The bytes reach the server for the first time, so the September source law applies to a
       document exactly as it does to a photograph. */
    console.log('\n  C — AND THE ORIGINAL FILE IS KEPT, WITH ITS AUDIENCE INHERITED');
    ok('C1 the material says the original is retained',
      up.j.sourceMedia && up.j.sourceMedia.retained === true);
    const src = await call('GET', `/api/materials/${mid}/source`);
    ok('C2 …it can be opened again', src.status === 200);
    ok('C3 …byte for byte', !!src.buf && src.buf.equals(deck));
    ok('C4 …served as a PowerPoint, not a generic download',
      /presentationml\.presentation/.test(src.ct));
    ok('C5 …and nothing in between may cache it', true === /no-store/.test(
      (await fetch(base + `/api/materials/${mid}/source`, { headers: H('me') })).headers.get('cache-control') || ''));
    ok('C6 another member holding the real id gets nothing',
      (await call('GET', `/api/materials/${mid}/source`, undefined, 'mate')).status === 404);
    ok('C7 …and no expiry was invented for it',
      !('expiresAt' in ((materialSource[C] || {})[mid] || {})));
    /* DELETION, SAME LAW. */
    ok('C8 the person who attached it can delete the original',
      (await call('DELETE', `/api/materials/${mid}/source`)).status === 200);
    ok('C9 …the bytes really leave the store', !((materialSource[C] || {})[mid]));
    const gone = await call('GET', `/api/materials/${mid}/source`);
    ok('C10 …opening it says GONE rather than never-existed', gone.status === 410);
    const after = await call('GET', `/api/materials/${mid}`);
    ok('C11 …and the words read out of it still stand',
      after.status === 200 && (after.j.sections || []).length === 10
      && after.j.sourceMedia.because === 'deleted');

    /* ══ D — THE REFUSALS ARE ABOUT THE FILE, NOT ABOUT THE PRODUCT ════════════════════════ */
    console.log('\n  D — AND IT REFUSES HONESTLY');
    const notZip = await upload(Buffer.from('this is not really a powerpoint'), 'lies.pptx');
    ok('D1 a file that is not really that format is refused, with the reason',
      notZip.status === 422 && notZip.j.because === 'no_extractable_text');
    ok('D2 …and no material was created for it',
      !(notZip.j || {}).materialId);
    const empty = await upload(mk.pptx([[]], { deflate: true }), 'blank.pptx');
    ok('D3 a real deck with no words in it is refused too', empty.status === 422);
    const wrongExt = await upload(mk.docx(['hello'], { deflate: true }), 'notes.rtf');
    ok('D4 an unsupported extension is refused, naming what IS supported',
      wrongExt.status === 415 && Array.isArray(wrongExt.j.readable)
      && wrongExt.j.readable.join(',') === 'docx,xlsx,pptx');
    /* THE KIND IS THE SERVER'S. A caller claiming "docx" about a spreadsheet must not route it to
       the wrong reader and get a confident wrong answer. */
    const lying = await call('POST', '/api/assistant/attachments',
      { file: { data: sheet.toString('base64'), name: 'results.xlsx', kind: 'docx' },
        filename: 'results.xlsx', title: 'results.xlsx' });
    ok('D5 a caller cannot talk the server into the wrong reader',
      lying.status === 200 && lying.j.kind === 'xlsx');
    const huge = await call('POST', '/api/assistant/attachments',
      { file: { data: 'A'.repeat(13 * 1024 * 1024), name: 'big.docx' }, filename: 'big.docx' });
    ok('D6 an oversized file is refused before it is parsed, with a size a person recognises',
      huge.status === 413 && Number(huge.j.limitMB) > 0);

    /* ══ E — PDF, HONESTLY ═════════════════════════════════════════════════════════════════
       The founder: *Do not simply add PDF to the picker. Either prove a real PDF conversational
       understanding path through existing architecture or continue to classify it honestly as
       unsupported. Capability truth matters more than the length of the supported list.*

       There is no PDF text extractor in this repo, `lib/office.js` has no reader for it, and the
       ZIP machinery above cannot help — a PDF is not a ZIP. So it stays unsupported, and these
       assert that the product says so everywhere rather than offering it. */
    console.log('\n  E — PDF IS STILL UNSUPPORTED, AND SAYS SO');
    ok('E1 no reader claims to open a PDF', !office.SUPPORTED.includes('pdf'));
    const pdf = await upload(Buffer.from('%PDF-1.4\n1 0 obj\n'), 'scouting.pdf');
    ok('E2 uploading one is refused rather than half-read', pdf.status === 415);
    const handler = new Function(fs.readFileSync(path.join(__dirname, '..', 'js', 'attachments.js'), 'utf8')
      + '\nreturn AttachmentHandler;')();
    ok('E3 …and neither picker offers it',
      !/\.pdf/i.test(handler.composerAcceptAttr()) && !/\.pdf/i.test(handler.materialAcceptAttr()));
    ok('E4 …while the three that DO work are offered unconditionally, because the server reads them',
      ['.docx', '.xlsx', '.pptx'].every(e => handler.composerAcceptAttr().includes(e)));
    /* THE R5 LAW STILL HOLDS, in its new form: offered is exactly readable. What changed is who
       reads. Nothing in the browser is consulted for these three any more. */
    ok('E5 …and no browser library is required for any offered document format',
      Object.keys(handler.KIND_NEEDS || {}).length === 0);

    /* ══ F — THE OTHER DOOR, THROUGH THE SAME READER ═══════════════════════════════════════ */
    console.log('\n  F — AND THE OBJECT THREAD\'S PICKER USES THE SAME READER');
    const f = await call('POST', '/api/me/focus', { text: 'Organise the restarts' });
    const fid = f.j.focus.id;
    const onObj = await call('POST', '/api/materials', {
      attachTo: { kind: 'focus', id: String(fid) }, title: 'deck.pptx', filename: 'deck.pptx',
      file: { data: mk.pptx(DECK, { deflate: true }).toString('base64'), name: 'deck.pptx' } });
    ok('F1 a file attached to an object is read by the server too',
      onObj.status === 200 && onObj.j.parts === 10);
    const listed = await call('GET', `/api/objects/focus/${fid}/materials`);
    const row = ((listed.j || {}).materials || []).find(m => String(m.materialId) === String(onObj.j.materialId));
    ok('F2 …it is on the object', !!row);
    ok('F3 …held as a deck, so it segments into slides', String(row.kind) === 'pptx');
    ok('F4 …and its original is kept under the same law',
      row.sourceMedia && row.sourceMedia.retained === true
      && (await call('GET', `/api/materials/${onObj.j.materialId}/source`)).status === 200);
    ok('F5 …and that door refuses the same things, with the same words',
      (await call('POST', '/api/materials', { attachTo: { kind: 'focus', id: String(fid) },
        title: 'x.rtf', file: { data: 'AAAA', name: 'x.rtf' } })).status === 415);

    /* ══ G — AND THE CONVERSATION CAN WORK FROM IT ═════════════════════════════════════════
       Models are off, so this asserts the deterministic half: the document reaches the turn and
       IntelliQ describes what it holds instead of dead-ending on it. */
    console.log('\n  G — AND A LATER TURN CAN REFER TO IT');
    const conv = await upload(mk.docx(['Highlanders match review',
      'We went quiet after conceding in both halves.'], { deflate: true }), 'review.docx');
    const asked = await call('POST', '/api/assistant/turn',
      { text: 'What does that say?', conversationId: conv.j.conversationId });
    const said = String((((asked.j || {}).response) || {}).responseText || '');
    ok('G1 asking about the document reaches it rather than dead-ending',
      !/don'?t have enough authorised evidence/i.test(said));
    ok('G2 …and IntelliQ names the file it is holding', /review\.docx/.test(said));

  } catch (e) { fail++; console.error('  FAIL office-ingestion suite threw:', e && e.stack); }

  server.close();
  console.log(`\noffice-ingestion-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
