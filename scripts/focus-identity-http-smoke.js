/* Truth layer — A FOCUS IS NOT AN INQUIRY.

   The product holds four kinds of object on one read, and three of them are things IntelliQ
   BELIEVES from evidence: an inquiry, a high, a low. Each deserves a confidence band, because
   each is a claim that could be wrong. THE FOURTH IS NOT A BELIEF. A Focus is a commitment a
   person or a group made, in their own words. It is true because they said it.

   `_objectBucket` ran all four through `voice.explainObject` and `present.inquiryCard`. Driven
   over HTTP at 0e09556 — a member typing "Work on my first touch" into POST /api/me/focus got
   back a card reading:

       claim:     "My read is that Work on my first touch. Not sure yet."
       standing:  "Early thinking"
       status:    "Looking into this"
       band:      "tentative"

   The product hedging about whether somebody meant what they had just typed, one second after
   they typed it. That is not a wording problem: deterministic code decided a commitment was a
   tentative hypothesis, and the prose reported that decision faithfully.

   A SECOND FINDING FELL OUT OF FIXING THE FIRST. ai/team-state.js `newFocus` computed
   `Number.isFinite(Number(reviewAt)) ? Number(reviewAt) : null` over a parameter defaulting to
   null — and `Number(null)` is 0, which is finite. So every group Focus set without a review
   date was STORED with `reviewAt: 0`: a review due on 1 January 1970. It survived unnoticed
   because `normalizeFocus` reads it back through `_num(x) || null`, turning 0 into null on the
   wire, and the two surfaces that consumed it both treated 0 as absent. The stored record and
   its own wire shape disagreed, and the first surface to ask "is this overdue" rather than
   "does it have a date" answered yes for every Focus in the product.

   WHAT IS DELIBERATELY NOT CHANGED. Identity itself was audited and found sound, so nothing was
   invented to fix it: a personal Focus keeps `foc_…`, a group Focus keeps `tf_…`, both resolve
   on every object route, each outcome route refuses the other kind's id, and the card already
   carried `whose` and `whoseNodeId`. Section A asserts that as the law it is, because a later
   change that unified the two id spaces would look like a tidy-up and would break the thing
   that currently works.

   Run: node scripts/focus-identity-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S       = require('../server.js');
const present = require('../ai/present.js');
const voice   = require('../ai/voice.js');
const teamState = require('../ai/team-state.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, teamFocuses, userAiProfiles } = S;

let pass = 0, fail = 0;
/* A THROW IS A FAILURE, NOT A SILENT EXIT — PROTOCOL lie #8. */
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const O = 'fid';
_loadAllStores({
  orgMeta: { [O]: { orgName: 'Focus Org', orgMode: 'sports' } },
  orgUsers: { [O]: {
    lead: { id: 'lead', name: 'Lead',  email: 'l@f.io',  role: 'coach',  orgCode: O, status: 'active', leadershipNodeIds: ['squad'] },
    mem1: { id: 'mem1', name: 'Mem One', email: 'm1@f.io', role: 'member', orgCode: O, status: 'active', assignedNodeIds: ['squad'] },
    mem2: { id: 'mem2', name: 'Mem Two', email: 'm2@f.io', role: 'member', orgCode: O, status: 'active', assignedNodeIds: ['squad'] },
  } },
  orgNodes: { [O]: { squad: { nodeId: 'squad', name: 'Squad', parentId: null, childNodeIds: [],
    memberIds: ['mem1', 'mem2'], leaderIds: ['lead'], rev: 1 } } },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = t => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });
  const call = (m, u, b, t) => fetch(base + u, { method: m, headers: H(t),
    body: b === undefined ? undefined : JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const get  = (u, t)    => call('GET',  u, undefined, t);
  const post = (u, b, t) => call('POST', u, b, t);
  const bucket = async t => ((await get('/api/objects?kind=focus&scope=all', t)).j || {}).objects || [];
  const byId = (list, id) => list.find(o => String(o.id) === String(id)) || null;

  const tLead = issueToken('lead', O, 'coach');
  const tM1   = issueToken('mem1', O, 'member');
  const tM2   = issueToken('mem2', O, 'member');

  try {
    console.log('\n  A — TWO WAYS A FOCUS COMES INTO EXISTENCE, AND BOTH KEEP ONE IDENTITY');
    const group = await post('/api/group/squad/focus', { text: 'Press higher in the first fifteen' }, tLead);
    ok('FI-A1 a leader sets one for the group', group.status === 200 && !!(group.j || {}).focus);
    const gid = ((group.j || {}).focus || {}).focusId;

    /* MANUAL CREATION IS THE POINT OF THIS ROUTE. "Make this a focus" once navigated to the
       composer and typed a prompt-starter into the box; the route exists so a person can state
       a commitment in their own words without the assistant proposing it first. */
    const own = await post('/api/me/focus', { text: 'Work on my first touch' }, tM1);
    ok('FI-A2 …and a member creates their own, by hand, in their own words',
      own.status === 200 && !!(own.j || {}).focus);
    const oid = ((own.j || {}).focus || {}).id;
    ok('FI-A3 …with the text stored exactly as typed, not summarised into something else',
      ((own.j || {}).focus || {}).text === 'Work on my first touch'
      && (userAiProfiles[`${O}:mem1`].focuses || [])[0].text === 'Work on my first touch');

    const mine = await bucket(tM1);
    ok('FI-A4 both reach the person, in one list, each with ONE id',
      !!byId(mine, gid) && !!byId(mine, oid));
    ok('FI-A5 …and the card says whose each one is, so a client never guesses from the id shape',
      byId(mine, oid).whose === 'you' && byId(mine, oid).whoseNodeId === null
      && byId(mine, gid).whose === 'Squad' && byId(mine, gid).whoseNodeId === 'squad');

    for (const id of [gid, oid]) {
      const [th, rd, mt] = await Promise.all([
        get(`/api/objects/focus/${id}/thread`, tM1),
        get(`/api/objects/focus/${id}/reading`, tM1),
        get(`/api/objects/focus/${id}/materials`, tM1),
      ]);
      ok(`FI-A6 ${id.slice(0, 3)}…: every object route resolves it — one identity, not one per surface`,
        th.status === 200 && rd.status === 200 && mt.status === 200);
    }

    /* THE TWO OUTCOME ROUTES ARE NOT INTERCHANGEABLE, and each refusing the other's id is what
       keeps a member from closing the squad's commitment through their own door. */
    const crossPersonal = await post('/api/me/focus/outcome', { focusId: gid, outcome: 'helped' }, tM1);
    ok('FI-A7 a member cannot close the GROUP\'s focus through their personal outcome route',
      crossPersonal.status === 404
      && !(teamFocuses[O].squad.find(f => f.focusId === gid) || {}).outcome);
    const crossGroup = await post(`/api/group/squad/focus/${oid}/outcome`, { result: 'helped' }, tLead);
    ok('FI-A8 …and a leader cannot close a member\'s PERSONAL focus through the group route',
      crossGroup.status === 404);

    console.log('\n  B — AND IS NEVER PRESENTED AS SOMETHING INTELLIQ MERELY SUSPECTS');
    const ownCard = byId(mine, oid);
    ok('FI-B1 the claim line states the commitment rather than hedging about it (was "My read is that…")',
      ownCard.explained.claim === 'You said you would work on this: Work on my first touch.');
    ok('FI-B2 …and carries NO confidence, because a commitment has none to carry',
      ownCard.explained.confidence === null && ownCard.explained.provenance === null);
    ok('FI-B3 …and offers nothing that would change its mind, which is meaningless about a decision',
      ownCard.explained.wouldChangeMyMind.length === 0 && ownCard.explained.whyIThinkThat === null);
    ok('FI-B4 the standing is the state of the work, not a confidence band (was "Early thinking")',
      ownCard.present.summary.standing === 'Being worked on'
      && ownCard.present.summary.status === 'Open');
    ok('FI-B5 …and the band is a value no confidence scale produces, so no surface can confuse them',
      ownCard.present.summary.band === 'stated'
      && !Object.values(present.BAND_TEXT).includes(ownCard.present.summary.standing));
    ok('FI-B6 …and it says plainly that the person decided this rather than IntelliQ inferring it',
      /you set this/i.test(ownCard.present.summary.standingWhy)
      && /not something IntelliQ inferred/i.test(ownCard.present.summary.standingWhy));
    ok('FI-B7 the person\'s own words survive into the card unaltered',
      ownCard.present.summary.thinking === 'Work on my first touch'
      && ownCard.present.summary.title === 'Work on my first touch');

    const groupCard = byId(mine, gid);
    ok('FI-B8 a group focus is attributed to the group, not to the person reading it',
      groupCard.explained.claim === 'Squad is working on this: Press higher in the first fifteen.'
      && /^Squad set this/.test(groupCard.present.summary.standingWhy));
    ok('FI-B9 …and the "what would tell you this was working" prompt is not put to somebody who cannot answer it',
      groupCard.present.summary.openQuestion === null
      && ownCard.present.summary.openQuestion === 'What would tell you this was working?');

    /* AN INQUIRY IS UNCHANGED. A fix that flattened every card into the commitment reading would
       pass everything above and destroy the thing the product is actually for.

       THIS WAS ONE ASSERTION AND HAD TO BECOME TWO. It built an inquiry carrying a hypothesis but
       NO `hypothesisStanding`, and asserted the badge read "Taking shape" — which was right when
       it was written and went stale under a later law. `thinking` is now admitted as the card's
       claim only when the kernel has given that hypothesis standing of its own, so for this exact
       fixture the card has NO claim; and a badge is a statement about a claim. Leaving it meant
       the card rendered, at 390px, "WELL SUPPORTED" directly above "I don't have a read on this
       yet" — the contradiction this round removed.

       So the law is asserted where it actually lives, in both directions: a hypothesis WITH
       standing is a belief and carries a band, and one WITHOUT is not a claim and carries none.
       What makes an inquiry an inquiry rather than a commitment — the confidence vocabulary and
       "Looking into this" — is asserted on both, because that is the thing FI-B10 was written to
       protect and it must survive either way. */
    const settled = present.inquiryCard({ inquiryId: 'i1', topic: { label: 'Arrival timing' },
      confidence: { band: 'emerging' }, status: 'exploring',
      hypothesis: 'People arrive late on Tuesdays',
      hypothesisStanding: { band: 'emerging', supportedBy: 2 } });
    ok('FI-B10 an inquiry whose explanation has standing reads as a belief, with a band',
      settled.summary.standing === 'Taking shape' && settled.summary.band === 'emerging'
      && settled.summary.status === 'Looking into this'
      && settled.summary.thinking === 'People arrive late on Tuesdays');
    const unsettled = present.inquiryCard({ inquiryId: 'i2', topic: { label: 'Arrival timing' },
      confidence: { band: 'emerging' }, status: 'exploring',
      hypothesis: 'People arrive late on Tuesdays' });
    ok('FI-B10b …and one whose explanation has none states no claim, so it wears no badge either',
      unsettled.summary.thinking === null && unsettled.summary.standing === null);
    ok('FI-B10c …while still being an INQUIRY rather than a commitment: the band enum and the '
      + 'status survive, and the explanation is kept as a suggestion at its own standing',
      unsettled.summary.band === 'emerging' && unsettled.summary.status === 'Looking into this'
      && !!unsettled.summary.possibleExplanation
      && unsettled.summary.possibleExplanation.statement === 'People arrive late on Tuesdays');
    const inqVoice = voice.explainObject({ kind: 'inquiry', label: 'Arrival timing',
      claim: 'people arrive late on Tuesdays', band: 'emerging', seed: 'x' });
    ok('FI-B11 …and still climbs the epistemic ladder in its grammar',
      /^(I think|My read is that|What I make of it:)/.test(inqVoice.claim)
      && typeof inqVoice.confidence === 'string' && inqVoice.confidence.length > 0);

    console.log('\n  C — A FOCUS WITH NO REVIEW DATE IS NOT A FOCUS OVERDUE SINCE 1970');
    const stored = teamFocuses[O].squad.find(f => f.focusId === gid);
    ok('FI-C1 the STORED record has no review date, rather than the epoch (was 0)',
      stored.reviewAt === null);
    ok('FI-C2 …which is what the constructor now produces, at its owner',
      teamState.newFocus({ focusId: 't', nodeId: 'n', text: 'x', by: 'u' }).reviewAt === null);
    ok('FI-C3 …and the stored record agrees with its own wire shape, which is how this hid',
      teamState.normalizeFocus(stored).reviewAt === stored.reviewAt);
    ok('FI-C4 …so nothing is reported as due a look that nobody ever scheduled',
      groupCard.present.detail.reviewAt === null && groupCard.present.detail.overdue === false
      && groupCard.present.summary.status !== 'Due a look');

    /* A REAL DATE STILL WORKS, in both directions — otherwise "never overdue" would pass C4 and
       the review loop would be quietly dead. */
    const soon = await post('/api/group/squad/focus',
      { text: 'Look at set pieces', reviewAt: Date.now() + 7 * 86400000 }, tLead);
    const late = await post('/api/group/squad/focus',
      { text: 'Look at throw-ins', reviewAt: Date.now() - 7 * 86400000 }, tLead);
    const after = await bucket(tM1);
    const soonCard = byId(after, ((soon.j || {}).focus || {}).focusId);
    const lateCard = byId(after, ((late.j || {}).focus || {}).focusId);
    ok('FI-C5 a review date in the future is kept and is not overdue',
      soonCard.present.detail.reviewAt > Date.now() && soonCard.present.detail.overdue === false);
    ok('FI-C6 …and one in the past IS, so the review loop still fires for the ones that mean it',
      lateCard.present.detail.overdue === true
      && lateCard.present.summary.status === 'Due a look');

    console.log('\n  D — ONE FOCUS, ONE OUTCOME SHAPE, AND SOMEBODY ACTUALLY HEARS ABOUT IT');
    /* A group Focus recorded `{ result, note, recordedBy, at }`; a personal one recorded the bare
       string `'helped'`. Every reader in the product was written against the object. */
    await post('/api/me/focus/outcome', { focusId: oid, outcome: 'helped' }, tM1);
    const storedOwn = (userAiProfiles[`${O}:mem1`].focuses || []).find(f => f.id === oid);
    ok('FI-D1 a personal outcome is stored in the same shape as a group one (was the string "helped")',
      storedOwn.outcome && typeof storedOwn.outcome === 'object'
      && storedOwn.outcome.result === 'helped' && storedOwn.outcome.recordedBy === 'mem1');

    const closed = byId(await bucket(tM1), oid);
    ok('FI-D2 …the card reads as closed, in words rather than a status enum',
      closed.present.summary.standing === 'Closed' && closed.present.summary.status === 'It helped');
    ok('FI-D3 …and the outcome travels in the detail, so no surface re-derives it',
      closed.present.detail.outcome && closed.present.detail.outcome.result === 'helped'
      && closed.present.detail.outcome.reading === 'It helped');

    /* THE CASUALTY OF THE DIVERGENCE, DRIVEN. `_proactiveInsights` asks
       `if (f.outcome && f.outcome.result …)` over personal focuses, so it had never once fired:
       the person who did the rarest thing in the product — recording how their own commitment
       actually went — was never told. This is the assertion that makes the shape fix matter. */
    const highs = ((await get('/api/objects?kind=high&scope=all', tM1)).j || {}).objects || [];
    ok('FI-D4 …so the person is finally told that what they set out to do worked',
      highs.some(h => /Something you set out to do worked/.test(String((h.explained || {}).headline || ''))));
    ok('FI-D5 …and it is a recognition, carrying none of their own words with it',
      highs.every(h => !/Work on my first touch/i.test(JSON.stringify(h))));

    /* A FOCUS CLOSED BEFORE THE CONSTRUCTOR WAS CORRECTED IS ALREADY ON DISK AS A STRING, and
       reading it honestly is better than rewriting somebody's stored record to suit a reader. */
    const legacy = present.focusCard({ id: 'old', text: 'Something I did last month',
      status: 'done', outcome: 'no' });
    ok('FI-D6 a focus stored the old way still reads correctly rather than as still open',
      legacy.summary.standing === 'Closed' && legacy.summary.status === 'It did not help'
      && legacy.detail.outcome.result === 'no');
    ok('FI-D7 …and an unclear result is a first-class answer, named rather than left blank',
      present.focusCard({ id: 'f', text: 'x', status: 'done', outcome: { result: 'unclear' } })
        .detail.outcome.reading === 'Too tangled up in other things to tell');

    /* AND THE SAME THING THROUGH THE PRODUCTION PATH, not only the pure card. This is what a
       record closed before the constructor was corrected genuinely looks like in the store, so
       it is written into the store rather than handed to a function: the recognition has to
       reach somebody whose focus was closed last month as surely as one closed just now. */
    userAiProfiles[`${O}:mem2`] = userAiProfiles[`${O}:mem2`] || { focuses: [] };
    userAiProfiles[`${O}:mem2`].focuses = [{ id: 'foc_legacy', text: 'Something from before',
      type: 'self_set', status: 'done', outcome: 'helped', visibility: 'private',
      participants: ['mem2'], createdAt: new Date().toISOString(),
      resolvedAt: new Date().toISOString() }];
    const legacyHighs = ((await get('/api/objects?kind=high&scope=all', tM2)).j || {}).objects || [];
    ok('FI-D8 a focus closed the OLD way still earns its recognition, from a record already on disk',
      legacyHighs.some(h => /Something you set out to do worked/.test(String((h.explained || {}).headline || ''))));

    console.log('\n  E — AND THE OTHER PEOPLE SEE EXACTLY WHAT THEY SHOULD');
    const otherMember = await bucket(tM2);
    ok('FI-E1 a squad-mate sees the group focus',
      !!byId(otherMember, gid));
    ok('FI-E2 …and never the private one somebody made for themselves',
      !byId(otherMember, oid));
    const leaderView = await bucket(tLead);
    ok('FI-E3 …and neither does the leader, because private means private upward too',
      !!byId(leaderView, gid) && !byId(leaderView, oid));

  } catch (e) { fail++; console.error('  FAIL focus-identity suite threw:', e && e.stack); }

  server.close();
  console.log(`\nfocus-identity-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
