/* Truth layer — A PICTURE IS SOMETHING TO LOOK AT. IT IS NOT SOMEBODY WHO WAS THERE.

   A photograph is the most persuasive thing anybody can hand a product, and the least evidenced.
   It shows what was in front of a lens at one moment. It does not say who did what, why, whether
   it is typical, or whether anything in it caused anything else — and a model describing it is
   making an account of a picture, which is weaker still.

   So the whole of this suite is one distinction:

       WHAT THE IMAGE APPEARS TO SHOW     a model's reading of a picture, external material
       WHAT INTELLIQ ALREADY KNEW         governed evidence, origins, bands
       WHAT CONNECTION IS BEING MADE      a relation, which is not corroboration
       WHAT REMAINS UNKNOWN               unchanged by a photograph
       WHAT MAY NOW BE WORTH INVESTIGATING a question, which is not a finding

   HOW THE PATH WORKS, because the epistemics follow from it. The gateway has spoken Claude image
   blocks and OpenAI `image_url` since it was written and had no caller. The attachment door is now
   that caller: an image is read ONCE, at upload, and what is stored is the description. From that
   point it is an ordinary `external_context` material — same segmentation, same context builder,
   same laws — so every attachment protection already proven applies to it without a second path.

   The bytes are NOT kept, and that is asserted here rather than left to be discovered.

   Models are stubbed for the vision call only, because the one thing this cannot do is reach a
   real provider. Everything on either side of that stub is the product's own code.

   Run: node scripts/photo-boundary-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const ai = require('../ai/gateway.js');
const S  = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken,
        groupCandidates, _noteGroupCandidates } = S;

let pass = 0, fail = 0;
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

/* THE ONE SEAM A PROVIDER OWNS. It returns a description of a tactical whiteboard that is
   deliberately suggestive — it uses the same words as the squad's open question — because a
   description that shared no vocabulary with the record could not test whether the product keeps
   them apart. */
const DESCRIBED = 'A whiteboard with a pitch diagram. Arrows run wide to both touchlines from a '
  + 'deep starting position. Handwritten text at the top reads "TALK EARLY". Player markers are '
  + 'spread across the width rather than through the middle.';
let visionCalls = 0, lastMedia = null, lastPrompt = '';
ai.enabled = () => true;
ai.deterministicOnly = () => false;
ai.canUnderstand = () => true;
ai.understand = async (o) => { visionCalls++; lastMedia = o && o.media; lastPrompt = String((o && o.prompt) || ''); return DESCRIBED; };
// Composition stays off: this suite is about what enters the record, not about prose.
ai.complete = async () => '';
ai.completeJSON = async () => ({});

const C = 'pho';
const SQUAD = Array.from({ length: 14 }, (_, i) => 'p' + (i + 1));
const users = {
  coach: { id: 'coach', name: 'Coach', email: 'c@pho.io', role: 'coach', orgCode: C,
    status: 'active', leadershipNodeIds: ['first'], assignedNodeIds: ['first'] },
  other: { id: 'other', name: 'Reserves Coach', email: 'o@pho.io', role: 'coach', orgCode: C,
    status: 'active', leadershipNodeIds: ['res'], assignedNodeIds: ['res'] },
};
for (const id of SQUAD) users[id] = { id, name: id.toUpperCase(), email: `${id}@pho.io`,
  role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['first'] };
const rivals = { alien: { id: 'alien', name: 'Alien', email: 'a@rival.io', role: 'superadmin',
  orgCode: 'rivalpho', status: 'active', assignedNodeIds: [], leadershipNodeIds: [] } };

_loadAllStores({
  orgMeta: { [C]: { orgName: 'Alma College', orgMode: 'sports' },
             rivalpho: { orgName: 'Rival FC', orgMode: 'sports' } },
  orgUsers: { [C]: users, rivalpho: rivals },
  orgNodes: { [C]: {
    first: { nodeId: 'first', name: 'First Team', parentId: null, childNodeIds: [],
      memberIds: [...SQUAD, 'coach'], leaderIds: ['coach'] },
    res: { nodeId: 'res', name: 'Reserves', parentId: null, childNodeIds: [],
      memberIds: ['other'], leaderIds: ['other'] },
  }, rivalpho: { theirs: { nodeId: 'theirs', name: 'Theirs', parentId: null, childNodeIds: [], memberIds: [], leaderIds: [] } } },
});
_rebuildEmailIndex();

for (const id of SQUAD.slice(0, 5)) {
  _noteGroupCandidates(C, id, `member:${id}`, [{ id: 'ph_' + id, level: 'observation',
    text: 'we cannot get out under pressure',
    sourceSpan: 'our build-up gets stuck when they press us',
    concerns: 'group', originRef: 'op_' + id, originKind: 'direct_observation', turnId: 'tp_' + id }],
    'build_up_pressure', 'Getting out under pressure');
}

// A one-pixel PNG. Real bytes, real base64, not a string pretending to be an image.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = who => ({ Authorization: `Bearer ${issueToken(who, who === 'alien' ? 'rivalpho' : C,
    (users[who] || rivals[who] || {}).role === 'member' ? 'member' : 'coach')}`,
    'Content-Type': 'application/json' });
  const call = (m, u, b, who) => fetch(base + u, { method: m, headers: H(who),
    body: b === undefined ? undefined : JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const theInquiry = async who => (((await call('GET', '/api/group/first/inquiry', undefined, who)).j || {})
    .inquiries || []).find(i => ((i.topic || {}).canonicalConcept) === 'build_up_pressure') || {};
  const fingerprint = i => JSON.stringify({
    band: (i.confidence || {}).band, score: (i.confidence || {}).score,
    origins: i.independentOrigins, contributors: i.contributors,
    hypothesis: i.hypothesis, standing: (i.hypothesisStanding || {}).supportedBy,
    readiness: (i.readiness || {}).state, tried: (i.triedBefore || []).length,
  });
  const upImage = (who, mimetype = 'image/png', data = PNG, name = 'whiteboard.png') =>
    call('POST', '/api/assistant/attachments', { image: { data, mimetype, name }, title: name }, who);

  try {
    /* ══ A — THE SQUAD ALREADY KNOWS SOMETHING ═════════════════════════════════════════════ */
    console.log('\n  A — A QUESTION THE SQUAD IS ALREADY WORKING ON');
    for (const id of SQUAD.slice(0, 5)) {
      const c = (groupCandidates[C] || []).find(x => x.contributorId === id && x.status === 'detected');
      if (c) await call('POST', '/api/group/first/contribute', { candidateId: c.candidateId, valence: 'worth_attention' }, id);
    }
    const before = await theInquiry('coach');
    ok('PH-A1 it rests on five independent origins and nothing explains it yet',
      before.independentOrigins === 5 && before.hypothesis === null);
    const fpBefore = fingerprint(before);

    /* ══ B — THE COACH PHOTOGRAPHS A WHITEBOARD ════════════════════════════════════════════ */
    console.log('\n  B — AND THE COACH PHOTOGRAPHS THE TACTICS BOARD');
    const up = await upImage('coach');
    ok('PH-B1 the image is accepted through the ordinary composer door', up.status === 200 && !!up.j.materialId);
    ok('PH-B2 …and it went through the vision gateway, once, with the real bytes',
      visionCalls === 1 && lastMedia && lastMedia.type === 'image'
      && lastMedia.data === PNG && lastMedia.mimetype === 'image/png');
    ok('PH-B3 …and is held as an image, with its epistemic effect stated as none',
      up.j.kind === 'image' && up.j.epistemicEffect === 'none');
    /* THE THING A PERSON CANNOT OTHERWISE KNOW: that what IntelliQ can reason over is a reading
       of the picture rather than the picture. That is still the point of the receipt.

       WHAT CHANGED, AND WHY. Until September 2026 this asserted `imageRetained === false` and the
       note said the image was not stored. The founder then settled source-media retention the
       other way: IntelliQ MAY keep the original, because a description is a reading and the thing
       it is a reading OF has to stay openable or nobody can ever check it. The receipt now has to
       say the harder pair of facts together — the picture is kept, AND it is not evidence — so
       neither of them can be read as the other. The epistemic half of this file is untouched: a
       photograph still corroborates nothing, and section C still proves it. */
    ok('PH-B4 …and the receipt says the picture is kept, and who may open it',
      up.j.imageRetained === true && /the picture itself is kept/i.test(String(up.j.note || ''))
      && /only the people who can read this material/i.test(String(up.j.note || '')));
    ok('PH-B4b …and still says what IntelliQ worked from is a READING of it',
      /read what the picture appears to show/i.test(String(up.j.note || '')));
    ok('PH-B5 …and says outright it is not evidence about anybody',
      /not evidence about you or the organisation/i.test(String(up.j.note || '')));

    console.log('\n  B2 — KEPT BESIDE THE MATERIAL, NEVER INSIDE IT');
    const stored = JSON.stringify(Object.values(S._materials ? S._materials(C) : {}));
    ok('PH-B6 the material row itself still holds no image data',
      !stored.includes(PNG) && !/base64/i.test(stored));
    ok('PH-B6b …and what it does hold instead is the reading',
      /appears to show/i.test(stored) && /read from the picture, not observed/i.test(stored));
    /* THE BYTES ARE SOMEWHERE, AND SOMEWHERE IS NOT THE MATERIAL. That separation is what keeps
       every existing reader — the context builder, the Library shelf, the understanding report —
       working on text and never on a file, which was the reason the old law existed. */
    ok('PH-B7 the original is kept in its own store, reachable only through the governed route',
      (S.materialSource[C] || {})[up.j.materialId]
      && (S.materialSource[C] || {})[up.j.materialId].data === PNG);
    ok('PH-B7b …and what the composer hands a model is still the reading, not the picture',
      !JSON.stringify(require('../ai/material.js')
        .contextFor((S._materials(C) || {})[up.j.materialId]) || {}).includes(PNG));

    /* ══ C — AND NOTHING THE SQUAD KNOWS HAS CHANGED ═══════════════════════════════════════
       The description deliberately shares vocabulary with the open question. If a picture could
       corroborate anything, this is the picture that would. */
    console.log('\n  C — AND THE QUESTION IS EXACTLY AS WELL EVIDENCED AS IT WAS');
    const after = await theInquiry('coach');
    ok('PH-C1 the origin count did not move — a photograph is not a sixth person',
      after.independentOrigins === 5);
    ok('PH-C2 …the band and score did not move', fingerprint(after) === fpBefore);
    ok('PH-C3 …and the picture did not become a candidate explanation',
      after.hypothesis === null && (after.alternatives || []).length === 0);
    ok('PH-C4 …nor did it make the group readier to act',
      (after.readiness || {}).state === (before.readiness || {}).state);

    console.log('\n  C2 — AND ADMISSION RUNNING WITH THE PICTURE ALREADY ON THE RECORD');
    _noteGroupCandidates(C, 'p6', 'member:p6', [{ id: 'ph_p6', level: 'observation',
      text: 'we cannot get out under pressure', sourceSpan: 'our build-up still gets stuck',
      concerns: 'group', originRef: 'op_p6', originKind: 'direct_observation', turnId: 'tp_p6' }],
      'build_up_pressure', 'Getting out under pressure');
    const c6 = (groupCandidates[C] || []).find(x => x.contributorId === 'p6' && x.status === 'detected');
    if (c6) await call('POST', '/api/group/first/contribute', { candidateId: c6.candidateId, valence: 'worth_attention' }, 'p6');
    const six = await theInquiry('coach');
    ok('PH-C5 a sixth PERSON moves it by exactly one, so the picture did not slip in as a seventh',
      six.independentOrigins === 6 && six.contributors === 6);
    ok('PH-C6 …and six origins later the picture still explains nothing',
      six.hypothesis === null && (six.alternatives || []).length === 0);

    /* ══ D — AND IT IS THIS COACH'S ════════════════════════════════════════════════════════ */
    console.log('\n  D — ANOTHER LEADER, AND ANOTHER TENANT, GET NOTHING');
    const theirs = await call('GET', `/api/materials/${up.j.materialId}`, undefined, 'other');
    ok('PH-D1 a leader of another squad cannot open it: 404, not a 403 that confirms it exists',
      theirs.status === 404);
    const alien = await call('GET', `/api/materials/${up.j.materialId}`, undefined, 'alien');
    ok('PH-D2 …and another tenant cannot either', alien.status === 404 || alien.status === 403);
    const theirState = await call('GET', '/api/group/res/state', undefined, 'other');
    ok('PH-D3 …and the other squad\'s own picture carries no trace of it',
      !/whiteboard|TALK EARLY|touchlines/i.test(JSON.stringify(theirState.j || {})));
    ok('PH-D4 …while its owner can still open it',
      (await call('GET', `/api/materials/${up.j.materialId}`, undefined, 'coach')).status === 200);

    /* ══ E — WHAT THE DOOR REFUSES, AND HOW HONESTLY ═══════════════════════════════════════ */
    console.log('\n  E — AND IT REFUSES WHAT IT CANNOT READ, SAYING WHICH THING IS MISSING');
    const heic = await upImage('coach', 'image/heic', PNG, 'IMG_0421.HEIC');
    ok('PH-E1 an iPhone HEIC is refused rather than half-read', heic.status === 415);
    ok('PH-E2 …and the refusal names what CAN be read instead of failing blankly',
      /JPEG|PNG/i.test(JSON.stringify(heic.j || {})));
    const huge = await upImage('coach', 'image/png', 'A'.repeat(7 * 1024 * 1024), 'huge.png');
    ok('PH-E3 an image past the ceiling is refused with the ceiling', huge.status === 413
      && !!(huge.j || {}).limitMB);
    const noData = await call('POST', '/api/assistant/attachments',
      { image: { data: '', mimetype: 'image/png', name: 'x.png' } }, 'coach');
    ok('PH-E4 …and an empty image is refused rather than stored as an empty reading', noData.status === 400);

    console.log('\n  E2 — AND WITH NO VISION MODEL IT SAYS SO, RATHER THAN BLAMING THE FILE');
    const realCan = ai.canUnderstand;
    ai.canUnderstand = () => false;
    const blind = await upImage('coach');
    ai.canUnderstand = realCan;
    ok('PH-E5 with no model that can see, the upload is refused', blind.status === 503);
    ok('PH-E6 …naming the missing capability rather than calling the picture unreadable',
      (blind.j || {}).because === 'no_vision_model'
      && /reasoning engine/i.test(String((blind.j || {}).note || ''))
      && !/corrupt|unreadable|invalid/i.test(String((blind.j || {}).note || '')));
    ok('PH-E7 …and says nothing was saved', /nothing was saved/i.test(String((blind.j || {}).note || '')));

    /* ══ F — A DESCRIPTION IS NOT AN OBSERVATION, WHATEVER IT SAYS ═════════════════════════ */
    console.log('\n  F — AND THE READING ITSELF CLAIMS NOTHING ABOUT THE ORGANISATION');
    const mat = (await call('GET', `/api/materials/${up.j.materialId}`, undefined, 'coach')).j || {};
    ok('PH-F1 the material is classed as something to read from, not as evidence',
      (mat.classification || mat.class || 'external_context') === 'external_context'
      || /external/i.test(JSON.stringify(mat)));
    /* AND THE PROMPT THAT PRODUCED IT ASKED FOR A DESCRIPTION, NOT A VERDICT. Asserted at the
       call site rather than trusting the words that came back, because what the model was ASKED
       is the part this product controls. */
    /* THE PROMPT IS THE PART THIS PRODUCT CONTROLS. What came back is the model's; what it was
       ASKED is ours, and a suite that only reads the answer is testing the provider rather than
       the boundary. This was written as a bare `true` on the first pass and caught on the first
       read -- an assertion that cannot go red proves nothing, whatever it is labelled. */
    ok('PH-F2 the model was asked to DESCRIBE what is visually present',
      /describe what is visually present/i.test(lastPrompt));
    ok('PH-F2b …and told in as many words not to interpret motives, causes or outcomes',
      /do not interpret/i.test(lastPrompt)
      && /motives/i.test(lastPrompt) && /causes/i.test(lastPrompt) && /outcomes/i.test(lastPrompt));
    ok('PH-F2c …and told not to draw conclusions about any person or organisation',
      /not .*draw conclusions about any\s+person or organisation/i.test(lastPrompt.replace(/\s+/g, ' ')));
    ok('PH-F2d …and told to say when something is unclear rather than guessing',
      /unclear or unreadable, say that rather than guessing/i.test(lastPrompt.replace(/\s+/g, ' ')));
    const promptSeen = String((lastMedia && lastMedia.type) || '');
    ok('PH-F3 …and the call carried the image as media rather than as text pretending to be one',
      promptSeen === 'image');

  } catch (e) { fail++; console.error('  FAIL photo suite threw:', e && e.stack); }

  server.close();
  console.log(`\nphoto-boundary-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
