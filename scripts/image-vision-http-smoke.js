/* Truth layer — AN IMAGE THE PERSON ATTACHED IS AN IMAGE INTELLIQ HAS READ.

   LIVE iPHONE BLOCKER (findings R1 #1). The founder attached a readable PNG screenshot of a season
   statistics table. The composer showed `IMG_1918.png`. Asked whether IntelliQ had read it, the
   answer was that no image came through and it could not see or read the image.

   That is a chain, and any link can break it while the others look fine:

     the bytes reach the route          (upload)
     the route reaches the vision gateway  (read)
     the description is stored as material bound to THIS conversation  (binding)
     the next turn in that conversation can reason from it  (read-back)

   Only the last one is visible to a person, which is why the live report reads as "it cannot see
   the image" whatever actually failed. This walks all four.

   AND WHAT AN IMAGE IS, EPISTEMICALLY, DOES NOT CHANGE. A description of a picture is an account of
   a picture — external, described context — never an observation somebody made of the world. It is
   material like any other material after this point, with the same laws and no second path.

   Run: node scripts/image-vision-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;
const ai = require('../ai/gateway.js');

let pass = 0, fail = 0;
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const C = 'img', NOW = Date.now();

_loadAllStores({
  orgMeta: { [C]: { orgName: 'Highlanders FC', orgMode: 'sports' } },
  orgUsers: { [C]: {
    coach: { id: 'coach', name: 'Dana Coach', email: 'c@i.io', role: 'coach', orgCode: C,
      status: 'active', leadershipNodeIds: ['n'], assignedNodeIds: ['n'], profileComplete: true },
    /* SOMEBODY ELSE WITH THE SAME PICTURE — section F's scope check needs a real second owner,
       because deduplicating on bytes alone would otherwise be a door into another person's file. */
    other: { id: 'other', name: 'Sam Other', email: 'o@i.io', role: 'member', orgCode: C,
      status: 'active', assignedNodeIds: ['n'], profileComplete: true },
  } },
  orgNodes: { [C]: { n: { nodeId: 'n', name: 'First Team', parentId: null, childNodeIds: [],
    memberIds: ['coach'], leaderIds: ['coach'] } } },
});
_rebuildEmailIndex();

/* THE ONE SEAM: a gateway that can actually look at a picture. Everything after it — the storage,
   the binding, the context builder, the read-back — is the real thing. The description below is
   what a vision model would return for the founder's screenshot. */
const SEEN = 'A league statistics table. It lists 28 played, 9 wins, 15 draws, 4 losses, '
  + '1.50 points per game, 0.93 scored per match and 0.71 conceded per match, with home 5-8-1 and away 4-7-3.';
const REAL = { enabled: ai.enabled, budgetAvailable: ai.budgetAvailable,
  canUnderstand: ai.canUnderstand, understand: ai.understand, complete: ai.complete, completeJSON: ai.completeJSON };
let sawMedia = null, calls = 0, varyReads = false;
Object.assign(ai, {
  enabled: () => true,
  budgetAvailable: () => true,
  canUnderstand: (what) => what === 'image',
  /* COUNTED, because section F's whole claim is that a retry does not read the picture again.

     AND DELIBERATELY NOT STABLE WHEN SECTION F ASKS. Vision is not deterministic, and that is the
     whole defect: the same league table came back live as "fourth on 24 points from 16 played"
     and as "4th place with 24 points after 16 games". A stub that returns one fixed sentence
     would let the OLD text-checksum deduplication pass section F — measured, a mutation reverting
     the key left F2 and F3 green — so the section would have proved nothing about the key it
     exists to defend. */
  understand: async (o) => {
    sawMedia = (o && o.media) || null;
    calls++;
    return varyReads ? `${SEEN} Read number ${calls}, worded differently this time.` : SEEN;
  },
  complete: async () => '',
  completeJSON: async () => null,
});

/* A REAL 1x1 PNG. Small, but genuinely a PNG: the route checks the mimetype and the byte budget,
   and a fixture that sent a string where bytes belong would pass the route while proving nothing
   about what reaches the gateway. */
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
/* AND A SECOND, GENUINELY DIFFERENT PICTURE for the retry section — different bytes, so it is a
   new upload rather than a lookup of the one section A already made. */
const PNG2_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGPgqjgBAAHaAUsQ+/EAAAAAAElFTkSuQmCC';

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = { Authorization: `Bearer ${issueToken('coach', C, 'coach')}`, 'Content-Type': 'application/json' };
  const call = (m, u, b) => fetch(base + u, { method: m, headers: H,
    body: b === undefined ? undefined : JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));

  try {
    console.log('\n  A — THE BYTES REACH THE VISION GATEWAY');
    const up = await call('POST', '/api/assistant/attachments', {
      image: { data: PNG_B64, mimetype: 'image/png', name: 'IMG_1918.png' },
      title: 'IMG_1918.png', filename: 'IMG_1918.png',
    });
    ok('IV-A1 attaching a PNG is accepted rather than refused', up.status === 200);
    /* THE BYTES THEMSELVES, not a filename and not a promise. The live failure reads identically
       whether the picture was sent or only its name was. */
    ok('IV-A2 …and the actual image data was handed to the gateway, not just its name',
      !!sawMedia && sawMedia.type === 'image' && sawMedia.data === PNG_B64
      && sawMedia.mimetype === 'image/png');

    console.log('\n  B — AND WHAT IS KEPT IS THE READING, SAID TO BE A READING');
    const convId = (up.j || {}).conversationId || null;
    const materialId = (up.j || {}).materialId || ((up.j || {}).material || {}).id || null;
    ok('IV-B1 the upload returns the conversation it is bound to', !!convId);
    ok('IV-B2 …and a material id for what was stored', !!materialId);
    /* THE DESCRIPTION SAYS WHERE IT CAME FROM. An account of a picture must never be mistaken for
       an account of the world, by a person or by a model handed it as context. */
    ok('IV-B3 what was stored is the reading of the picture, and says so',
      /image/i.test(JSON.stringify(up.j || {})) || /appears to show/i.test(JSON.stringify(up.j || {})));

    console.log('\n  C — THE NEXT TURN IN THAT CONVERSATION CAN ACTUALLY USE IT');
    /* THE ONE A PERSON SEES. Everything above can work and this still fail, which is exactly what
       the live report describes: the file was named on screen and the assistant said no image came
       through. */
    const turn = await call('POST', '/api/assistant/turn',
      { text: 'Did you read the image? What does it say?', conversationId: convId });
    const said = String(((turn.j || {}).response || {}).responseText || '');
    ok('IV-C1 the turn is answered', turn.status === 200 && said.length > 0);
    ok('IV-C2 …and it does NOT claim no image came through, which is the live failure',
      !/no image came through|cannot see|can't see|could not see|didn.t come through/i.test(said));
    ok('IV-C3 …and it can say what the picture showed',
      /28|statistic|table|draw/i.test(said));

    console.log('\n  D — AND IT IS STILL EXTERNAL CONTEXT, NOT SOMEBODY\'S OBSERVATION');
    const mat = await call('GET', `/api/materials/${materialId}`);
    ok('IV-D1 the image is held as material a person can open again',
      mat.status === 200 && /IMG_1918/.test(JSON.stringify(mat.j || {})));
    /* THE BYTES ARE KEPT, WHICH IS WHAT MAKES "IT CAN BE LOOKED AT AGAIN" TRUE rather than a
       comforting sentence. The branch that offers a re-read is only honest while this holds. */
    ok('IV-D1b …with the picture itself retained, so a re-read is a real offer',
      (up.j || {}).imageRetained === true);
    ok('IV-D2 …and reading a picture created no evidence about anybody',
      !/"kind":"observation"/.test(JSON.stringify(mat.j || {}))
      && (up.j || {}).epistemicEffect === 'none');

    console.log('\n  E — AND WHAT THE NOTE DOES NOT COVER IS STILL NOT GUESSED AT');
    /* THE CASE THE RE-READ BRANCH WAS WRITTEN FOR, and it is now conditional, so it needs its own
       proof. A description written to answer a question nobody had asked yet will not mention
       everything in the picture. When it does not, the honest answer is that the original is here
       and can be looked at again — never an invention from a note that is silent on the subject. */
    const gap = await call('POST', '/api/assistant/turn',
      { text: 'Who was the referee?', conversationId: convId });
    const gapSaid = String(((gap.j || {}).response || {}).responseText || '');
    ok('IV-E1 a question the note does not answer is not answered from the note',
      !/\b\d{3,}\b/.test(gapSaid.replace(/IMG_?1918/gi, '')));
    ok('IV-E2 …and it says the picture itself is still there to be looked at',
      /look at|looked at|re-?read|read it again/i.test(gapSaid));
    ok('IV-E3 …and does not claim the image never arrived, which is the live failure',
      !/no image came through|cannot see|can't see|could not see/i.test(gapSaid));

    console.log('\n  F — ONE SELECTION IS ONE ATTACHMENT, EVEN WHEN THE ANSWER NEVER ARRIVED');
    /* ── LIVE iPHONE: one image, two filenames, then stuck ─────────────────────────────────
       The founder attached one picture and the composer rendered its name twice before sitting
       on "Sending and reading image…". Reproduced on this route by sending the picture the way
       a phone whose reply never came back sends it — byte-identical, carrying no conversationId,
       because the client never learned one:

         materials created : 2     conversations created : 2     vision calls : 2

       THE KEY WAS THE WRONG THING. `_materialChecksum` hashes the material's TEXT, and an image
       material's text is the sentence a vision model wrote about it. Vision is not deterministic:
       the same league table came back as "fourth on 24 points from 16 played" and as "4th place
       with 24 points after 16 games". Different sentence, different checksum — so the retry
       defeated the material deduplication AND the conversation reconciliation that hangs off it,
       and the person really did have two of everything to look at.

       `attachment-retry-http-smoke` never caught it because text bytes ARE identical on a retry.
       An image was the one shape whose identity passed through a model on the way to the key. */
    /* A DIFFERENT PICTURE FROM SECTION A'S, deliberately. The first version of this reused the
       same bytes, so `first` already resolved to the material section A had made — F1 and F2
       passed without a fresh upload ever happening, and F4 then counted a vision call that was
       never going to occur. A retry test needs something to retry. */
    varyReads = true;   // from here on, a second read of one picture is a different sentence
    const visionBefore = calls;
    const first = await call('POST', '/api/assistant/attachments', {
      image: { data: PNG2_B64, mimetype: 'image/png', name: 'RETRY.png' },
      title: 'RETRY.png', filename: 'RETRY.png' });
    ok('IV-F1 the picture is accepted', first.status === 200 && !!(first.j || {}).materialId);
    const again = await call('POST', '/api/assistant/attachments', {
      image: { data: PNG2_B64, mimetype: 'image/png', name: 'RETRY.png' },
      title: 'RETRY.png', filename: 'RETRY.png' });
    ok('IV-F2 …and sending the same bytes again resolves to the SAME material',
      again.status === 200 && (again.j || {}).materialId === (first.j || {}).materialId);
    ok('IV-F3 …and to the same conversation, so one upload leaves one thread',
      (again.j || {}).conversationId === (first.j || {}).conversationId);
    /* THE HALF THAT FIXES THE STUCK STATE. A retry that re-reads the picture spends another
       vision call and comes back with a different sentence — which is how the duplicate was
       made. Looking the bytes up BEFORE the model runs is what makes Try again free. */
    ok('IV-F4 …and the picture is not read a second time, which is what makes a retry free',
      calls === visionBefore + 1);
    /* AND THE DEDUPLICATION IS THE OWNER'S OWN. Equal bytes belonging to somebody else must not
       be a way into their material, exactly as the text checksum has always been scoped. */
    const other = await fetch(base + '/api/assistant/attachments', { method: 'POST',
      headers: { Authorization: `Bearer ${issueToken('other', C, 'member')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: { data: PNG2_B64, mimetype: 'image/png', name: 'RETRY.png' },
        title: 'RETRY.png', filename: 'RETRY.png' }) }).then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
    ok('IV-F5 …while the same bytes from somebody else are their own material, not a way into this one',
      other.status === 200 && (other.j || {}).materialId !== (first.j || {}).materialId);
    /* AND NONE OF IT BECAME EVIDENCE. Attaching twice is still attaching; a retry must not be a
       second route into the record any more than the first attempt was. */
    ok('IV-F6 …and neither attempt created evidence about anybody',
      (first.j || {}).epistemicEffect === 'none' && (again.j || {}).epistemicEffect === 'none');

  } catch (e) { fail++; console.error('  FAIL image-vision suite threw:', e && e.stack); }

  Object.assign(ai, REAL);
  server.close();
  console.log(`\nimage-vision-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
