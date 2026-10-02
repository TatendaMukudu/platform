/* Cloud Chromium gate — ONE SELECTION IS ONE ATTACHMENT, ON THE SCREEN A PERSON IS LOOKING AT.

   LIVE iPHONE. The founder attached one image and the composer rendered its filename TWICE,
   then sat on "Sending and reading image…" without ever producing an answer. It reproduced with
   more than one image, which rules out anything about a particular file.

   WHY THIS IS A BROWSER GATE AND NOT AN HTTP ONE. The server's half — a retry resolving to one
   material and one thread — is proved at `image-vision-http-smoke` section F, and it was only
   half the defect. The other half is entirely in the rendering: how many bubbles exist, which
   element the pending state lives in, and whether anything stops a second upload starting. None
   of that is observable from the route, and all of it is what the person actually met.

   THE THREE FAULTS, each measured here before it was fixed:

     TWO SELECTIONS COULD BE IN FLIGHT AT ONCE. Nothing serialised them, so a picker firing
     `change` twice — or a thumb tapping twice on a slow connection — drew two filename bubbles,
     two pending bubbles, and spent two vision calls on one picture.

     THE RETRY DREW THE FILENAME AGAIN. "Try again" calls back into `wsAttach`, which began by
     rendering the person's own message, so one selection ended with two bubbles bearing one name.

     AND THE PENDING BUBBLE HAD A FIXED ID. `getElementById('iq-attach-pending')` returns the
     FIRST match, so with two in flight the second attach cleared the first's bubble and left its
     own on screen with nothing able to reach it again. That is the stuck state.

   DRIVEN THROUGH THE REAL PICKER, with a real PNG on a real `input[type=file]`, at 390px,
   against the real route — because the whole defect lives in the gap between what the route does
   and what the screen shows.

   Run: node scripts/attach-once-browser-check.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV = 'test';

const { chromium } = require('playwright-core');
const { chromiumPath } = require('./lib/chromium-path.js');
const ai = require('../ai/gateway.js');
const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, _materials } = S;

let pass = 0, fail = 0;
const ok = (n, c) => {
  if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const C = 'ato';
_loadAllStores({
  orgMeta: { [C]: { orgName: 'Alma College', orgMode: 'sports' } },
  orgUsers: { [C]: { coach: { id: 'coach', name: 'Dana Coach', email: 'c@ato.io', role: 'coach',
    orgCode: C, status: 'active', leadershipNodeIds: ['ft'], assignedNodeIds: ['ft'], profileComplete: true } } },
  orgNodes: { [C]: { ft: { nodeId: 'ft', name: 'First Team', parentId: null, childNodeIds: [],
    memberIds: ['coach'], leaderIds: ['coach'] } } },
});
_rebuildEmailIndex();

/* A REAL PNG. The route checks the mimetype and the byte budget, so a fixture that posted a
   string where bytes belong would pass the route while proving nothing about the picker. */
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
/* TWO MORE, GENUINELY DIFFERENT PICTURES. Section B needs the first upload to be SLOW so the
   second overlaps it, and the server now returns instantly for bytes it has already read — so
   reusing section A's picture made B's first attach finish before B's second one started, and
   the guard was never reached. Different bytes, different pictures, real reads. */
const PNG_B1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGPgqjgBAAHaAUsQ+/EAAAAAAElFTkSuQmCC';
const PNG_B2 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGM4IWcDAALUASNyYth2AAAAAElFTkSuQmCC';
/* AND SECTION C'S OWN, so "one attempt plus one retry leaves one material" is a claim about the
   retry rather than about bytes an earlier section had already attached. */
const PNG_C = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP48EEEAATIAfXuneOLAAAAAElFTkSuQmCC';
const SEEN = 'A league table screenshot showing the side fourth on 24 points from 16 played.';

const REAL = { enabled: ai.enabled, budgetAvailable: ai.budgetAvailable,
  canUnderstand: ai.canUnderstand, understand: ai.understand, complete: ai.complete, completeJSON: ai.completeJSON };
let visionCalls = 0, slowVision = false;
Object.assign(ai, {
  enabled: () => true, budgetAvailable: () => true,
  canUnderstand: (what) => what === 'image',
  /* COUNTED AND OPTIONALLY SLOW. The count is how "one picture, one read" is measured; the delay
     is what lets two selections genuinely overlap, which is the condition the first fault needs
     and which no amount of calling the function twice in a row would produce. */
  /* AND A DIFFERENT PICTURE READS DIFFERENTLY, which reality does and a fixed string does not.
     With one sentence for every image the TEXT checksum matched across sections and three
     distinct pictures all deduplicated into the first one's material — so section C's count
     measured the stub rather than the retry. The suffix is derived from the bytes, so identical
     bytes still read identically, which is what the retry claim needs. */
  understand: async (o) => {
    visionCalls++;
    if (slowVision) await new Promise(r => setTimeout(r, 1500));
    /* HASHED OVER THE WHOLE PICTURE, not its tail. Two 1x1 PNGs differing only in their pixel
       bytes share an identical base64 ending — the IEND chunk — so a suffix taken from the last
       few characters made two different pictures read identically, and section C's retry
       deduplicated into section B's material by TEXT. The bug was in the stub and it cost an
       hour; the assertion it broke was right all along. */
    const d = String(((o || {}).media || {}).data || '');
    return `${SEEN} (picture ${require('crypto').createHash('sha256').update(d).digest('hex').slice(0, 10)})`;
  },
  complete: async () => '', completeJSON: async () => null,
});

(async () => {
  const server = await new Promise(res => { const s = app.listen(0, () => res(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = issueToken('coach', C, 'coach');
  const browser = await chromium.launch({ executablePath: chromiumPath(chromium), args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => { if (!/^Chart is not defined$/.test(e.message)) errors.push(e.message); });
  const posts = [];
  page.on('request', r => { if (/\/api\/assistant\/attachments/.test(r.url()) && r.method() === 'POST') posts.push(r.url()); });

  try {
    await page.addInitScript(([t, code]) => {
      localStorage.setItem('iq_auth', JSON.stringify({
        user: { id: 'coach', name: 'Dana Coach', role: 'coach', orgCode: code, profileComplete: true },
        org: { orgName: 'Alma College', orgMode: 'sports', organizationProfileComplete: true },
        token: t, permissions: null, domain: null }));
      localStorage.setItem('iq_profile_complete_coach', '1');
    }, [token, C]);
    await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);
    const notice = await page.$('button:has-text("I understand")');
    if (notice) await notice.click().catch(() => {});
    await page.waitForTimeout(700);

    /* THE PICKER'S OWN PATH: a File on the real input, then the real change handler. */
    const choose = (name, bytes) => page.evaluate(async ([b64, n]) => {
      const bin = atob(b64); const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const dt = new DataTransfer();
      /* A FIXED `lastModified`, because a real picker gives the file's own mtime and
         `new File()` defaults to Date.now(). Without this, choosing the same picture twice
         produced two different identities here and nowhere else, and section A would have
         proved the wrong branch. */
      dt.items.add(new File([u8], n, { type: 'image/png', lastModified: 1700000000000 }));
      const input = document.querySelector('.iq-attach-input');
      if (!input) return false;
      input.files = dt.files;
      return true;
    }, [bytes || PNG, name]);
    /* FIRED, NOT AWAITED — and the block body is the whole reason. `page.evaluate` AWAITS a
       promise the function returns, so `() => MemberApp.wsAttach(...)` made the two taps
       sequential and the overlap this section exists to create never happened: the guard was
       never reached and section A passed nothing. A block body returns undefined, so the attach
       runs in the page while this side carries on, which is what a second tap actually is. */
    const fire = () => page.evaluate(() => { MemberApp.wsAttach(document.querySelector('.iq-attach-input')); });
    const seen = () => page.evaluate(() => {
      const t = document.getElementById('iq-conversation');
      if (!t) return { names: [], pendings: 0, pendingText: [] };
      return {
        names: [...t.querySelectorAll('.iq-msg-user')].map(n => n.textContent.trim()),
        pendings: t.querySelectorAll('.iq-pending').length,
        pendingText: [...t.querySelectorAll('.iq-pending')].map(n => n.textContent.trim()),
      };
    });
    const clear = () => page.evaluate(() => { const t = document.getElementById('iq-conversation'); if (t) t.innerHTML = ''; });

    ok('AO-0 the composer really has a file picker to drive', await choose('IMG_1918.png'));

    console.log('\n  A — TWO TAPS ON ONE PICTURE ARE STILL ONE ATTACHMENT');
    slowVision = true;
    await fire();
    await page.waitForTimeout(350);
    await choose('IMG_1918.png');
    await fire();
    await page.waitForTimeout(600);
    const mid = await seen();
    ok('AO-A1 the filename is in the thread exactly once',
      mid.names.filter(n => /IMG_1918\.png/.test(n)).length === 1);
    ok('AO-A2 …and there is one waiting bubble, not two',
      mid.pendings === 1 && /Sending and reading image/i.test(mid.pendingText[0] || ''));
    ok('AO-A3 …and only one request left the browser', posts.length === 1);
    ok('AO-A4 …so the picture was read once, not twice', visionCalls === 1);
    /* AND THE WAIT ENDS. A bounded reading state is the founder's second symptom, and the only
       way to prove it is to wait for it to finish and find nothing left behind. */
    await page.waitForTimeout(2200);
    const after = await seen();
    ok('AO-A5 …and when it finishes the waiting bubble is gone, not left on screen',
      after.pendings === 0);
    ok('AO-A6 …leaving the filename once and no announcement of the plumbing',
      after.names.filter(n => /IMG_1918\.png/.test(n)).length === 1);

    console.log('\n  B — A DIFFERENT FILE WHILE ONE IS IN FLIGHT IS TOLD, NOT SWALLOWED');
    /* THE PERSON CHOSE IT. Dropping it silently would be a quieter defect than the one being
       fixed, and stacking it would be the one being fixed. */
    await clear();
    slowVision = true;
    await choose('FIRST.png', PNG_B1);
    await fire();
    await page.waitForTimeout(300);
    await choose('SECOND.png', PNG_B2);
    await fire();
    await page.waitForTimeout(400);
    const busy = await page.evaluate(() => (document.getElementById('iq-conversation') || {}).textContent || '');
    ok('AO-B1 the second file is not quietly dropped — the person is told', /Still sending/i.test(busy));
    ok('AO-B2 …and it did not start a second upload either',
      !/SECOND\.png/.test((await seen()).names.join('|')));
    await page.waitForTimeout(2400);

    console.log('\n  C — AND "TRY AGAIN" REUSES THE BUBBLES IT ALREADY HAS');
    await clear();
    slowVision = false;
    posts.length = 0;
    const before = Object.values(_materials(C)).filter(m => m && m.byId === 'coach').length;
    await page.route('**/api/assistant/attachments', r => r.abort('failed'));
    await choose('RETRY_C.png', PNG_C);
    await fire();
    await page.waitForTimeout(1500);
    const failed = await seen();
    ok('AO-C1 a failure leaves the filename once', failed.names.filter(n => /RETRY_C/.test(n)).length === 1);
    ok('AO-C2 …with one short error and a way back, rather than a silent dead end',
      await page.evaluate(() => {
        const t = document.getElementById('iq-conversation');
        const b = t && t.querySelector('button');
        return !!b && /try again/i.test(b.textContent || '')
          && (t.querySelectorAll('.iq-error-text').length === 1);
      }));
    ok('AO-C3 …and nothing is still claiming to be reading the image',
      !failed.pendingText.some(t => /Sending and reading image/i.test(t)));
    await page.unroute('**/api/assistant/attachments');
    await page.evaluate(() => { const b = document.querySelector('#iq-conversation button'); if (b) b.click(); });
    await page.waitForTimeout(2200);
    const retried = await seen();
    /* THE FOUNDER'S OWN SCREENSHOT, as an assertion: one selection may never show two names. */
    ok('AO-C4 pressing it does NOT draw the filename a second time',
      retried.names.filter(n => /RETRY_C/.test(n)).length === 1);
    ok('AO-C5 …and the error card is gone rather than left contradicting the result',
      await page.evaluate(() => !document.querySelector('#iq-conversation .iq-error-text')));
    ok('AO-C6 …and nothing is left waiting', retried.pendings === 0);
    /* ONE ATTACHMENT, ON THE SERVER TOO. The retry went through the real route, so this is the
       end-to-end claim rather than a statement about rendering. */
    const mine = Object.values(_materials(C)).filter(m => m && m.byId === 'coach');
    ok('AO-C7 …and one attempt plus one retry left ONE new material, not one per attempt',
      mine.length === before + 1);
    ok('AO-C8 …and reading a picture still created no evidence about anybody',
      mine.every(m => m.visibility === 'private' && m.provenance === 'external'));
    /* ── AND THE SAME PICTURE CHOSEN AGAIN, DELIBERATELY, IS STILL ONE MATERIAL ───────────
       Section C's first attempt is aborted in the browser, so only the retry ever reaches the
       server — which means nothing above it can tell whether the SERVER's byte key works. A
       mutation removing that key left this whole file green. This is the end-to-end claim: two
       uploads of one picture that both arrive, one material, and the picture read once. */
    const beforeAgain = Object.values(_materials(C)).filter(m => m && m.byId === 'coach').length;
    const visionBefore = visionCalls;
    await choose('RETRY_C.png', PNG_C);
    await fire();
    await page.waitForTimeout(2000);
    ok('AO-C9 choosing the same picture again adds no second material',
      Object.values(_materials(C)).filter(m => m && m.byId === 'coach').length === beforeAgain);
    ok('AO-C10 …and does not read the picture a second time',
      visionCalls === visionBefore);
    /* ── AND THE NEXT TURN CITES ONE ATTACHMENT, WHICH IS THE OTHER HALF OF "ONE SELECTION" ──
       `_pendingAttachment` is what the next message carries. Before the byte key, a retry
       overwrote it with a SECOND material id, so the turn that followed was grounded in a
       different copy of the same picture than the one the person had been looking at. */
    const pending = await page.evaluate(() => JSON.stringify(MemberApp._pendingAttachment || null));
    const only = Object.values(_materials(C)).find(m => m && m.filename === 'RETRY_C.png');
    ok('AO-C11 the attachment the next turn will carry is the one material, not a second copy',
      !!only && JSON.parse(pending) && JSON.parse(pending).id === only.materialId);
    /* ONE TURN, AND IT IS ABOUT THE PICTURE. The brief's "one durable turn" is only true if the
       message after an attachment is answered once, from the image. */
    const turns = [];
    page.on('request', r => { if (/\/api\/assistant\/turn/.test(r.url()) && r.method() === 'POST') turns.push(r.postData() || ''); });
    await page.evaluate(() => { const t = document.getElementById('iq-composer-input'); if (t) t.value = 'What does that picture show?'; });
    await page.evaluate(() => MemberApp.wsSend());
    await page.waitForTimeout(2500);
    ok('AO-C12 …and asking about it sends exactly one turn, carrying that one attachment',
      turns.length === 1 && /"attachment"/.test(turns[0])
      && (turns[0].match(new RegExp(only.materialId, 'g')) || []).length === 1);

    ok('AO-Z these rendered journeys raised no uncaught client error', errors.length === 0);
  } catch (e) { fail++; console.error('  FAIL attach-once browser check threw:', e && e.stack); }

  Object.assign(ai, REAL);
  await browser.close();
  server.close();
  console.log(`\nattach-once-browser-check: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
