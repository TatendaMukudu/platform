/* Truth layer — WHAT IS KEPT, WHO MAY OPEN IT, AND WHAT DELETING IT DOES.

   FOUNDER DECISION, September 2026, quoted because the distinctions are the law:

     IntelliQ may retain original attachments.
     attachment ≠ evidence, attachment ≠ organisational truth, attachment ≠ permission to share.
     The audience is inherited from the context it was contributed into.
     Deletion removes bytes but does not rewrite history — a tombstone says "Source attachment
     deleted".
     Do not invent a retention duration.

   Every one of those is an assertion below rather than a sentence in a comment.

   WHY AN IMAGE IS THE ONLY THING RETAINED TODAY is not a decision, it is arithmetic: a document
   is parsed in the browser and only its TEXT is sent, so the server never receives the original
   and cannot keep what it never held. Section A asserts that difference is stated honestly —
   `never_held` rather than a missing field — because "there is no original" and "the original was
   deleted" are different facts and a person is entitled to know which one they are looking at.

   Run: node scripts/source-retention-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

/* THE VISION BOUNDARY, STUBBED. Reading a picture needs a provider; KEEPING one does not, and
   this file is about the keeping. The stub returns a description so the rest of the door runs
   exactly as it does in production, and nothing below depends on what it says. */
const gateway = require('../ai/gateway.js');
gateway.enabled = () => true;
gateway.deterministicOnly = () => false;
gateway.canUnderstand = () => true;
gateway.understand = async () => 'A whiteboard with four names and a diagram of a back four.';
gateway.complete = async () => 'Understood.';
gateway.completeJSON = async () => ({ actions: [] });

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, materials, materialSource } = S;

let pass = 0, fail = 0;
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

/* A REAL ONE-PIXEL PNG. Bytes rather than a placeholder string, so the read route is asserted to
   hand back the same bytes that went in rather than something that merely has a length. */
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const C = 'srt', X = 'other';
_loadAllStores({
  orgMeta: { [C]: { orgName: 'Highlanders', orgMode: 'sports' },
             [X]: { orgName: 'Elsewhere', orgMode: 'sports' } },
  orgUsers: {
    [C]: {
      me:    { id: 'me', name: 'Tendai', email: 'me@sr.io', role: 'member', orgCode: C,
        status: 'active', assignedNodeIds: ['first'], profileComplete: true },
      mate:  { id: 'mate', name: 'Rudo', email: 'r@sr.io', role: 'member', orgCode: C,
        status: 'active', assignedNodeIds: ['first'], profileComplete: true },
      coach: { id: 'coach', name: 'Coach', email: 'c@sr.io', role: 'coach', orgCode: C,
        status: 'active', leadershipNodeIds: ['first'], assignedNodeIds: ['first'], profileComplete: true },
    },
    [X]: { far: { id: 'far', name: 'Far', email: 'f@sr.io', role: 'coach', orgCode: X,
      status: 'active', leadershipNodeIds: ['th'], assignedNodeIds: [], profileComplete: true } },
  },
  orgNodes: {
    [C]: { first: { nodeId: 'first', name: 'First Team', parentId: null, childNodeIds: [],
      memberIds: ['me', 'mate', 'coach'], leaderIds: ['coach'] } },
    [X]: { th: { nodeId: 'th', name: 'Theirs', parentId: null, childNodeIds: [], memberIds: [], leaderIds: ['far'] } },
  },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const tok = (who, org) => issueToken(who, org || C, who === 'coach' || who === 'far' ? 'coach' : 'member');
  const H = (who, org) => ({ Authorization: `Bearer ${tok(who, org)}`, 'Content-Type': 'application/json' });
  const call = (m, u, b, who, org) => fetch(base + u, { method: m, headers: H(who, org),
    body: b === undefined ? undefined : JSON.stringify(b) })
    .then(async r => ({ status: r.status, ct: r.headers.get('content-type') || '',
      cc: r.headers.get('cache-control') || '',
      j: (r.headers.get('content-type') || '').includes('json') ? await r.json().catch(() => null) : null,
      buf: (r.headers.get('content-type') || '').includes('json') ? null
        : Buffer.from(await r.arrayBuffer()) }));

  try {
    /* ══ A — WHAT IS KEPT, AND WHAT HONESTLY IS NOT ════════════════════════════════════════ */
    console.log('\n  A — THE ORIGINAL IS KEPT WHEN THERE IS ONE, AND SAID SO WHEN THERE IS NOT');
    const doc = await call('POST', '/api/assistant/attachments',
      { filename: 'notes.txt', text: 'We stopped talking after the second goal.' }, 'me');
    ok('A1 a document attaches', doc.status === 200 && !!doc.j.materialId);
    ok('A2 …and says plainly that no original was ever held, rather than leaving it blank',
      doc.j.sourceMedia && doc.j.sourceMedia.retained === false
      && doc.j.sourceMedia.because === 'never_held');

    const img = await call('POST', '/api/assistant/attachments',
      { filename: 'whiteboard.png', image: { mimetype: 'image/png', data: PNG_B64 } }, 'me');
    ok('A3 a photograph attaches', img.status === 200 && !!img.j.materialId);
    const mid = img.j.materialId;
    ok('A4 …and the picture itself is kept', img.j.imageRetained === true
      && img.j.sourceMedia && img.j.sourceMedia.retained === true);
    ok('A5 …with its own type recorded, not guessed later',
      img.j.sourceMedia.mimetype === 'image/png');
    /* NO DURATION WAS INVENTED. The founder said not to, and the way a TTL creeps in is that
       somebody adds one "for safety" and nobody notices until a coach's photograph is gone. */
    const held = (materialSource[C] || {})[mid] || {};
    ok('A6 …and nothing anywhere set an expiry on it',
      !('expiresAt' in held) && !('ttl' in held) && !('retainUntil' in held)
      && !('expiresAt' in (img.j.sourceMedia || {})));

    /* ══ B — THE ORIGINAL COMES BACK, BYTE FOR BYTE ════════════════════════════════════════
       A description is a reading. If the thing it is a reading of cannot be opened again, nobody
       can ever check the reading, which is the whole reason for keeping it. */
    console.log('\n  B — AND IT CAN BE OPENED AGAIN');
    const opened = await call('GET', `/api/materials/${mid}/source`, undefined, 'me');
    ok('B1 the person who attached it can open the original', opened.status === 200);
    ok('B2 …and gets the picture, not an account of it', opened.ct === 'image/png');
    ok('B3 …the same bytes that went in',
      !!opened.buf && opened.buf.equals(Buffer.from(PNG_B64, 'base64')));
    ok('B4 …and nothing in between is allowed to keep a copy',
      /no-store/.test(opened.cc) && /private/.test(opened.cc));
    /* THE MATERIAL SAYS WHERE ITS ORIGINAL IS, so a surface can offer to open it rather than a
       person having to know a URL shape. */
    const read = await call('GET', `/api/materials/${mid}`, undefined, 'me');
    ok('B5 the material itself says the original is there',
      read.status === 200 && read.j.sourceMedia && read.j.sourceMedia.retained === true);
    ok('B6 …and where to open it', String((read.j.sourceMedia || {}).openAt || '').includes(mid));

    /* ══ C — POSSESSING THE URL IS NOT ACCESS ══════════════════════════════════════════════
       The founder's standing rule, in their words: "a media URL or identifier must never become
       an authorization bypass". The id below is the real one. */
    console.log('\n  C — AND HOLDING THE LINK IS NOT PERMISSION TO OPEN IT');
    const byOther = await call('GET', `/api/materials/${mid}/source`, undefined, 'mate');
    ok('C1 another member holding the real id cannot open it', byOther.status === 404);
    ok('C2 …and is not told it exists', !byOther.buf);
    const byLeader = await call('GET', `/api/materials/${mid}/source`, undefined, 'coach');
    ok('C3 leading the group is not a way in either — this was private to the person',
      byLeader.status === 404);
    const byStranger = await call('GET', `/api/materials/${mid}/source`, undefined, 'far', X);
    ok('C4 another organisation holding the id gets nothing', byStranger.status === 404);
    const noAuth = await fetch(base + `/api/materials/${mid}/source`);
    ok('C5 …and no session at all gets nothing', noAuth.status === 401 || noAuth.status === 403);

    /* ══ D — THE AUDIENCE IS INHERITED, NOT DECLARED ═══════════════════════════════════════
       The one that matters most: a source has no audience of its own. It has the audience of the
       context it was contributed into, so contributing the material into a place other people can
       read is what makes the original readable there — and it is the SAME decision, not a second
       one somebody has to remember to make. */
    console.log('\n  D — THE AUDIENCE COMES FROM WHERE IT WAS CONTRIBUTED, NOT FROM THE FILE');
    const shared = await call('POST', '/api/me/focus',
      { text: 'Organise the first restart', groupId: 'first' }, 'coach');
    const sfid = shared.j.focus.id;
    /* A MATERIAL CONTRIBUTED TO THE OBJECT, seeded rather than uploaded, and the seam that makes
       that necessary is stated rather than hidden. The two doors differ DELIBERATELY: a composer
       upload is part of a private conversation (`visibility: 'private'` — the founder's "talking
       to IntelliQ is not contributing to the organisation"), while POST /api/materials
       contributes to an object (`visibility: 'object'`). Only the composer door receives image
       bytes today, so the only sources that exist in production are private ones, and the SHARED
       half of inherited audience has no upload path to reach it. Seeding one here exercises the
       real read route, with the real authority owner, against the real shared state — which is
       the property under test. That gap is a founder question, recorded in the round report, not
       something this file quietly closes. */
    const smid = 'mat_seed_board';
    materials[C][smid] = { materialId: smid, byId: 'coach', orgCode: C,
      title: 'board.png', filename: 'board.png', kind: 'image',
      sections: [{ id: 's1', ordinal: 1, heading: null, text: 'A whiteboard with a back four.' }],
      refs: [{ kind: 'focus', id: String(sfid), at: Date.now(), by: 'coach' }],
      checksum: 'seed_board', visibility: 'object', provenance: 'internal', createdAt: Date.now(),
      sourceMedia: { retained: true, mimetype: 'image/png', bytes: 70 } };
    materialSource[C] = materialSource[C] || {};
    materialSource[C][smid] = { mimetype: 'image/png', data: PNG_B64, bytes: 70,
      at: Date.now(), byId: 'coach' };
    ok('D1 a photograph contributed to a Focus the coach shares with the member',
      (await call('GET', `/api/materials/${smid}/source`, undefined, 'coach')).status === 200);
    /* THE CONTROL. The identical bytes, kept twice, and the two originals are readable by
       different people — which is only possible if the audience is coming from the context and
       not from the file. */
    ok('D2 …the member can open THAT original',
      (await call('GET', `/api/materials/${smid}/source`, undefined, 'me')).status === 200);
    ok('D3 …while the same bytes uploaded privately stay private to their owner',
      (await call('GET', `/api/materials/${mid}/source`, undefined, 'me')).status === 200
      && (await call('GET', `/api/materials/${mid}/source`, undefined, 'coach')).status === 404);
    ok('D4 …and somebody outside the group can open neither',
      (await call('GET', `/api/materials/${smid}/source`, undefined, 'far', X)).status === 404
      && (await call('GET', `/api/materials/${mid}/source`, undefined, 'far', X)).status === 404);
    /* AND THE COMPOSER DOOR REALLY IS THE PRIVATE ONE, asserted rather than assumed, because the
       whole of D rests on the two doors meaning different things. */
    const intoShared = await call('POST', '/api/assistant/attachments',
      { filename: 'mine.png', about: { kind: 'focus', id: String(sfid) },
        image: { mimetype: 'image/png', data: PNG_B64 } }, 'coach');
    ok('D5 a picture taken while TALKING about that Focus is still the private door',
      intoShared.status === 200
      && (await call('GET', `/api/materials/${intoShared.j.materialId}/source`, undefined, 'me')).status === 404);

    /* ══ E — RETAINING IS NOT ADMITTING ════════════════════════════════════════════════════
       attachment ≠ evidence, attachment ≠ organisational truth. Keeping a photograph must not
       move anything about what the organisation believes. */
    console.log('\n  E — KEEPING A PICTURE CHANGES NOTHING ABOUT WHAT IS BELIEVED');
    ok('E1 the attachment receipt still says it has no epistemic effect',
      intoShared.j.epistemicEffect === 'none');
    ok('E2 …and says in words that what it shows is not evidence about anybody',
      /not evidence about you or the organisation/i.test(String(intoShared.j.note || '')));
    const beliefs = await call('GET', '/api/objects?kind=inquiry&scope=self', undefined, 'coach');
    ok('E3 …and no belief appeared because a file was kept',
      (((beliefs.j || {}).objects) || []).length === 0);

    /* ══ F — DELETION REMOVES BYTES AND DOES NOT REWRITE HISTORY ═══════════════════════════ */
    console.log('\n  F — DELETING THE ORIGINAL LEAVES A TOMBSTONE, NOT A HOLE');
    const notYours = await call('DELETE', `/api/materials/${smid}/source`, undefined, 'me');
    ok('F1 a reader of somebody else\'s document cannot delete its original',
      notYours.status === 403);
    ok('F1b …and it is still there', (await call('GET',
      `/api/materials/${smid}/source`, undefined, 'me')).status === 200);
    const gone = await call('DELETE', `/api/materials/${smid}/source`, undefined, 'coach');
    ok('F2 the person who attached it can delete the original', gone.status === 200);
    ok('F3 …and the bytes are actually gone from the store',
      !((materialSource[C] || {})[smid]));
    const after = await call('GET', `/api/materials/${smid}/source`, undefined, 'me');
    ok('F4 …opening it now says GONE, not "never existed"', after.status === 410);
    ok('F5 …in words a person can read', /Source attachment deleted/i.test(
      String(((after.j || {}).label) || ((after.j || {}).error) || '')));
    /* THE HISTORY IS NOT REWRITTEN. The material, its parts and its place on the Focus stay
       exactly as they were; only the file is gone. */
    const still = await call('GET', `/api/materials/${smid}`, undefined, 'me');
    ok('F6 the material itself still exists', still.status === 200);
    ok('F7 …still carries what was read from it', (still.j.sections || []).length > 0);
    ok('F8 …and says the original was DELETED rather than never held',
      still.j.sourceMedia.retained === false && still.j.sourceMedia.because === 'deleted'
      && still.j.sourceMedia.label === 'Source attachment deleted');
    const onFocus = await call('GET', `/api/objects/focus/${sfid}/materials`, undefined, 'me');
    ok('F9 …and it is still attached where it was',
      (((onFocus.j || {}).materials) || []).some(m => m.materialId === smid));
    ok('F10 …where the list shows the tombstone in its place',
      (((onFocus.j || {}).materials) || []).find(m => m.materialId === smid)
        .sourceMedia.label === 'Source attachment deleted');
    /* AND DELETING IS IDEMPOTENT rather than an error, because a second press on a bad connection
       is the ordinary case and must not read as a failure. */
    const again = await call('DELETE', `/api/materials/${smid}/source`, undefined, 'coach');
    ok('F11 deleting again is not an error', again.status === 200 && again.j.already === true);

    /* ══ G — AND RE-SENDING THE SAME FILE DOES NOT UNDO THE DELETION ═══════════════════════
       Materials are deduplicated by the checksum of their TEXT, and an image material's text is
       its description. So the same photograph sent again lands on the SAME material — and must
       not quietly restore bytes their owner deliberately removed. */
    console.log('\n  G — AND SENDING IT AGAIN DOES NOT PUT IT BACK');
    const pmid = intoShared.j.materialId;
    ok('G0 the coach deletes the original of their own private one',
      (await call('DELETE', `/api/materials/${pmid}/source`, undefined, 'coach')).status === 200);
    const resent = await call('POST', '/api/assistant/attachments',
      { filename: 'mine.png', about: { kind: 'focus', id: String(sfid) },
        image: { mimetype: 'image/png', data: PNG_B64 } }, 'coach');
    ok('G1 the resend lands on the same material', resent.j.materialId === pmid);
    ok('G2 …and the deletion still stands', resent.j.imageRetained === false);
    ok('G3 …with the tombstone intact', (await call('GET',
      `/api/materials/${pmid}/source`, undefined, 'coach')).status === 410);

  } catch (e) { fail++; console.error('  FAIL source-retention suite threw:', e && e.stack); }

  server.close();
  console.log(`\nsource-retention-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
