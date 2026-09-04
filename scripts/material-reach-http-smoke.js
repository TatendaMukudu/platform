/* Truth layer — A COACH ATTACHES A DECK AND FINDS OUT WHETHER IT LANDED, END TO END.

   Founder, September 2026, asked what would make this product worth having: "If a coach for
   example can attach a PowerPoint for scouting and ask IntelliQ to recreate it for another game
   and players interact with that. Then we've achieved a massive goal." And what should come back:
   "Read it and work from it! ... 'wasn't well understood by 80% of players and they are
   struggling with A,B,C'." And where the talking happens: "The conversation must primarily flow
   from the context that was supplied in that focus."

   This suite walks that sentence from one end to the other with real requests, because every
   piece of it existed separately before and none of it was reachable: the parser has been in
   js/attachments.js the whole time, extracting text from pptx, docx and xlsx in the browser, and
   sending it precisely nowhere. The server had no idea attachments existed.

   THE PART THAT NEEDED A DECISION, not just wiring: WHO MAY SEE IT. Material is attached to an
   OBJECT and is readable by exactly the people that object is readable by — no second permission
   model. That is why _allObjectsFor was extracted rather than copied: a second implementation of
   a privacy merge is how a file ends up visible to a room the focus was never shared with, and
   nothing would have failed.

   Run: node scripts/material-reach-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const teamState = require('../ai/team-state.js');
const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, _teamFocuses, _materials, _engageOf, inquiryStates } = S;
const diagnose = require('../ai/diagnose.js');
const renderArtifact = require('../ai/render-artifact.js');
const material = require('../ai/material.js');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

/* TWELVE PLAYERS, AND THE FIXTURE DEPENDS ON IT. The two-sided cohort floor is 5, so a squad of
   six can never produce a report at all — every assertion about what a coach is told would pass
   against a permanently refusing surface, and the gates could be deleted with nothing noticing.
   Twelve, with six who answer, exercises the report rather than assuming it. */
const C = 'mat';
const SQUAD = Array.from({ length: 12 }, (_, i) => `p${i + 1}`);
const users = {
  coach: { id: 'coach', name: 'Head Coach', email: 'c@x.io', role: 'coach', orgCode: C, status: 'active', leadershipNodeIds: ['n1'] },
  other: { id: 'other', name: 'Other Coach', email: 'oc@x.io', role: 'coach', orgCode: C, status: 'active', leadershipNodeIds: ['n2'] },
  out:   { id: 'out',   name: 'Other Squad', email: 'o@x.io', role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['n2'] },
};
SQUAD.forEach((id, i) => { users[id] = { id, name: `Player ${i + 1}`, email: `${id}@x.io`, role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['n1'] }; });

_loadAllStores({
  orgMeta:  { [C]: { orgName: 'A Club', orgMode: 'sports' } },
  orgUsers: { [C]: users },
  orgNodes: { [C]: {
    n1: { nodeId: 'n1', name: 'First Team', parentId: null, childNodeIds: [], memberIds: SQUAD, leaderIds: ['coach'] },
    n2: { nodeId: 'n2', name: 'Reserves',   parentId: null, childNodeIds: [], memberIds: ['out'], leaderIds: ['other'] },
  } },
});
_rebuildEmailIndex();
_teamFocuses(C, 'n1').push(teamState.newFocus({
  focusId: 'tf1', nodeId: 'n1', text: 'Saturday away — the press', by: 'coach', now: Date.now() }));

/* What AttachmentHandler._processPptx emits in the browser: slide-numbered text, nothing more. */
const DECK = [
  'Slide 1: Pressing traps — force them wide, then trap on the touchline',
  'Slide 2: Rest defence — two stay back, nobody follows the striker inside',
  'Slide 3: Set pieces — near post flick, second ball at the top of the box',
].join('\n');

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = t => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });
  const get  = (u, t) => fetch(base + u, { headers: H(t) }).then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const post = (u, t, b) => fetch(base + u, { method: 'POST', headers: H(t), body: JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));

  const coachT = issueToken('coach', C, 'coach');
  const otherT = issueToken('other', C, 'coach');
  const outT   = issueToken('out', C, 'member');
  const T = {}; SQUAD.forEach(id => { T[id] = issueToken(id, C, 'member'); });

  try {
    /* ── MR1-MR3: the coach attaches, and the parts are the ones they wrote. ── */
    const att = await post('/api/materials', coachT, {
      attachTo: { kind: 'focus', id: 'tf1' },
      title: 'Saturday scouting', filename: 'saturday.pptx', kind: 'pptx', text: DECK,
    });
    ok('MR1 a coach attaches a deck to a squad focus, and the server holds it',
      att.status === 200 && !!att.j.materialId && att.j.parts === 3);
    const MID = att.j.materialId;
    ok('MR1b …split into the author\'s own slides, with the author\'s own headings — nothing named a topic',
      att.j.sections.map(s => s.heading).every(h => DECK.includes(h.replace(/…$/, '').slice(0, 20))) &&
      /Pressing traps/.test(att.j.sections[0].heading));
    ok('MR2 it is listed on the focus it hangs on, for the squad to find',
      (await get('/api/objects/focus/tf1/materials', T.p1)).j.materials.some(m => m.materialId === MID));
    ok('MR3 a player can open it and read the coach\'s own words',
      /touchline/.test(JSON.stringify((await get(`/api/materials/${MID}`, T.p1)).j.sections)));

    /* ── MR4-MR6: WHO MAY SEE IT is the object's audience, with no second model. ── */
    const outsider = await get(`/api/materials/${MID}`, outT);
    ok('MR4 somebody on another squad cannot read it — material inherits the audience of the thing it is attached to, and they cannot open that',
      outsider.status === 404);
    ok('MR4b …and gets a 404 rather than a 403, because confirming the thing exists is a leak on its own',
      outsider.status === 404 && !/forbidden/i.test(JSON.stringify(outsider.j)));
    ok('MR5 …nor is it listed to them',
      (await get('/api/objects/focus/tf1/materials', outT)).status === 404);
    const byPlayer = await post('/api/materials', coachT === null ? '' : T.p1, {
      attachTo: { kind: 'focus', id: 'tf1' }, title: 'mine', filename: 'x.txt', kind: 'text', text: 'some words here' });
    ok('MR6 a PLAYER cannot attach to a squad focus — material attached there reaches everybody in the squad, so it is a leader\'s act',
      byPlayer.status === 403 && /do not lead/i.test(byPlayer.j.error || ''));
    const byOtherCoach = await post('/api/materials', otherT, {
      attachTo: { kind: 'focus', id: 'tf1' }, title: 'theirs', filename: 'x.txt', kind: 'text', text: 'some words here' });
    ok('MR6b …and neither can a coach who leads a different squad — leading is scoped to the node, as it is everywhere else',
      byOtherCoach.status === 404 || byOtherCoach.status === 403);

    /* ── MR7-MR9: THE CONVERSATION FLOWS FROM IT. ── */
    const ctx = S._materialContext(C, 'p1', 'focus:tf1');
    ok('MR7 a player\'s conversation about this focus is handed the coach\'s material — "the conversation must primarily flow from the context that was supplied in that focus"',
      ctx && /touchline/.test(ctx.text) && /\[s1\]/.test(ctx.text));
    ok('MR7b …resolved through the READER\'S OWN view, so somebody on another squad is handed nothing even though the material plainly exists',
      S._materialContext(C, 'out', 'focus:tf1') === null);
    const composer = require('../ai/composer.js');
    const built = composer.buildContext({ name: 'Player One', question: 'what is the plan', material: ctx });
    ok('MR8 …and it reaches the composer ABOVE everything else, because an answer that draws on everything except the deck is the wrong answer however well grounded it is elsewhere',
      /WORK FROM THIS FIRST/.test(built) && built.indexOf('WORK FROM THIS FIRST') < built.indexOf('WHAT THE SYSTEM HAS OBSERVED'));
    ok('MR8b …told to name the part it answered from, which is what makes an answer checkable',
      /say which/i.test(built) && /\[s2\]/.test(built));
    ok('MR9 …and told not to add tactics or numbers that are not in the coach\'s words',
      /Do not add tactics, names, drills or numbers that are not in them/.test(built));
    /* MR9b — ADDED BECAUSE A MUTATION BIT NOTHING. MR7-MR9 call buildContext with a context this
       suite fetched itself, which proves the module works and proves nothing about whether the
       SERVER ever hands it over. Cutting the wire in _composeTurn left every one of them green.
       This asserts the wiring: the turn's own context builder is called with the material. */
    const srv = require('fs').readFileSync(require('path').join(__dirname, '..', 'server.js'), 'utf8');
    ok('MR9b the SERVER passes the material into the composer on a turn about this object — the module working is not the same as the wire being connected',
      /material: _materialContext\(code, userId, about\)/.test(srv));

    /* ── MR10-MR12: players say where they are, and it is DECLARED. ── */
    const guessed = await post(`/api/materials/${MID}/engaged`, T.p1, { sectionId: 's1', state: 'sort of' });
    ok('MR10 an unrecognised state is refused rather than coerced to the nearest one — IntelliQ does not work out which one you meant',
      guessed.status === 400 && /will not work out which one you meant/i.test(guessed.j.error || ''));
    const said = await post(`/api/materials/${MID}/engaged`, T.p1, { sectionId: 's1', state: 'not_yet',
      because: 'I do not know when to jump and when to hold' });
    ok('MR11 a player says where they are with one part, in their own words',
      said.status === 200 && said.j.state === 'not_yet');
    ok('MR11b …and is told plainly that it lands against the MATERIAL and not against them — which is the difference between this and a test',
      /against the material, not against you/i.test(said.j.note || '') && /never who/i.test(said.j.note || ''));
    ok('MR11c …their words become evidence with themselves as the origin, on an inquiry about the part rather than about the player',
      !!said.j.inquiryId);
    const badSection = await post(`/api/materials/${MID}/engaged`, T.p1, { sectionId: 's99', state: 'got_it' });
    ok('MR12 a part that does not exist is refused rather than recorded against nothing',
      badSection.status === 404);

    /* Six of twelve answer — enough for the floor in both directions. */
    await post(`/api/materials/${MID}/engaged`, T.p2, { sectionId: 's1', state: 'not_yet' });
    await post(`/api/materials/${MID}/engaged`, T.p3, { sectionId: 's1', state: 'not_yet' });
    await post(`/api/materials/${MID}/engaged`, T.p4, { sectionId: 's1', state: 'got_it' });
    await post(`/api/materials/${MID}/engaged`, T.p5, { sectionId: 's2', state: 'got_it' });
    await post(`/api/materials/${MID}/engaged`, T.p6, { sectionId: 's2', state: 'got_it' });

    /* ── MR13-MR17: THE REPORT. The founder's sentence, answered. ── */
    const rep = await get(`/api/materials/${MID}/understanding`, coachT);
    ok('MR13 the coach is told how it landed', rep.status === 200 && rep.j.reported === true);
    ok('MR13b …in counts of people, with the group size beside them so a number means something',
      rep.j.cohort.said === 6 && rep.j.cohort.of === 12);
    const s1 = rep.j.parts.find(p => p.sectionId === 's1');
    const s3 = rep.j.parts.find(p => p.sectionId === 's3');
    ok('MR14 THE PART THEY ARE STRUGGLING WITH IS THE COACH\'S OWN HEADING — this is "struggling with A, B, C", and A is a slide they wrote, not a topic anything invented',
      rep.j.struggling.length >= 1 && /Pressing traps/.test(rep.j.struggling[0].heading));
    ok('MR14b …with the counts behind it', s1.notYet === 3 && s1.gotIt === 1);
    ok('MR15 SILENCE IS NOT CONFUSION — the eight who said nothing about slide 1 are quiet, not struggling',
      s1.quiet === 8 && s1.gotIt + s1.notYet + s1.quiet === 12);
    ok('MR15b …and a slide NOBODY opened is reported as not looked at, which is a different thing for a coach to do about',
      s3.state === 'not_looked_at' && rep.j.untouched.includes('s3'));
    /* MR16 — SHARPENED AFTER IT PASSED ON A LEAK. The first version searched for `"p4"` WITH
       QUOTES, and the refs at the time were `eng:p4:mat_x:s1:...` — so every player id was in the
       report and the assertion sailed past it, because the quotes it looked for were not there.
       Provenance refs travel to the client; an identifier that says whose it is undoes the
       anonymity of the entire surface. Now it looks for the id ANYWHERE in the payload. */
    ok('MR16 NO NAMES AND NO IDS ANYWHERE IN IT — the coach learns what did not land, never who did not get it, and not through an identifier either',
      !SQUAD.some(id => new RegExp(`\\b${id}\\b`).test(JSON.stringify(rep.j))) &&
      !Object.values(users).some(u => u.role === 'member' && JSON.stringify(rep.j).includes(u.name)));
    ok('MR16b …and it says on the report that it counts people and never names them',
      (rep.j.limitations || []).some(l => /never names them/i.test(l)));
    ok('MR17 a PLAYER cannot read the report — it is for whoever attached it',
      (await get(`/api/materials/${MID}/understanding`, T.p1)).status === 403);
    ok('MR17b …and neither can a coach who leads a different squad',
      (await get(`/api/materials/${MID}/understanding`, otherT)).status === 404);

    /* ── MR18: THE FLOOR BITES ON A SMALL SQUAD. The gate, exercised rather than assumed. ── */
    _teamFocuses(C, 'n2').push(teamState.newFocus({
      focusId: 'tf2', nodeId: 'n2', text: 'Reserves plan', by: 'other', now: Date.now() }));
    const small = await post('/api/materials', otherT, {
      attachTo: { kind: 'focus', id: 'tf2' }, title: 'Reserves brief', filename: 'r.pptx', kind: 'pptx', text: DECK });
    await post(`/api/materials/${small.j.materialId}/engaged`, outT, { sectionId: 's1', state: 'not_yet' });
    const smallRep = await get(`/api/materials/${small.j.materialId}/understanding`, otherT);
    ok('MR18 a report on a ONE-PERSON squad is refused — "one of one did not get it" is a name, and the floor is the whole reason this surface can exist',
      smallRep.status === 200 && smallRep.j.reported === false && /below the floor/i.test(smallRep.j.reason || ''));
    /* MR18c — THE LINE A DEFECT IN THIS SUITE DREW. The refusal first came back as ok:false, so
       every client would have read a lawful refusal as a failed request and rendered nothing —
       the one outcome a refusal must never produce. `ok` is whether the request worked; whether
       there is a report is its own field. */
    ok('MR18c …as a SUCCESSFUL request that carries a refusal, not a failed one — a client that treats a lawful refusal as an error shows nothing, which is how the floor becomes invisible',
      smallRep.j.ok === true && /Held back/i.test(smallRep.j.note || ''));
    ok('MR18b …carrying no counts at all, because returning them beside an ok:false is how they get rendered anyway',
      (smallRep.j.parts || []).length === 0);

    /* ── MR19-MR22: THE GRAPH. ── */
    const ch = await get('/api/objects/focus/tf1/chart', coachT);
    ok('MR19 a graph appears on the focus, built by the server',
      ch.status === 200 && !!ch.j.chart);
    ok('MR19b …and it is the spread of how each part landed, with the coach\'s headings as the bars',
      ch.j.chart.kind === 'spread' && ch.j.chart.series[0].points.some(p => /Pressing traps/.test(p.label)));
    ok('MR20 every point names the evidence it counts, and the count IS that evidence',
      ch.j.chart.series[0].points.every(p => p.value === (p.refs || []).length));
    ok('MR20b …and the units are only ever count, band or date — nothing on this chart is a score',
      ch.j.chart.series.every(s => ['count', 'band', 'date'].includes(s.unit)));
    /* MR20c — THE LEAK TWO MUTATIONS FOUND, and the reason it survived the first pass.

       Provenance refs TRAVEL TO THE CLIENT — they are what makes a point traceable. The first
       version built them as `eng:<userId>:<materialId>:...`, so every bar in the coach's picture
       carried the ids of the players in it, and the anonymity the whole surface rests on was
       undone by the identifier rather than by the number. MR16 missed it because it searched for
       a QUOTED id and the refs were unquoted. A ref only has to be unique for counting to work;
       it must not say whose it is. */
    const chartJSON = JSON.stringify(ch.j);
    ok('MR20c NO PLAYER ID SURVIVES INTO THE CHART — a provenance ref that says whose it is undoes the anonymity of the entire surface, without changing a single number',
      !SQUAD.some(id => new RegExp(`\\b${id}\\b`).test(chartJSON)) &&
      !Object.values(users).some(u => u.role === 'member' && chartJSON.includes(u.name)));
    ok('MR20d …and the coach\'s report ships no provenance refs at all, because an identifier travelling to a client is one more thing that has to be proven anonymous',
      !/gotRefs|notRefs/.test(JSON.stringify(rep.j)));
    /* MR21 — REWRITTEN, AND IT FOUND A LEAK. The first version of this assertion had two truthy
       expressions ANDed in front of the real one, so it would have passed on almost anything.
       Written properly it showed that a player's timeline carried one dot per teammate who had
       engaged — a count of their squad's engagement, and in a small squad a short list of who was
       in the room. Aggregates are the leader's read; the dates the focus itself carries are
       everybody's. */
    const playerCh = await get('/api/objects/focus/tf1/chart', T.p1);
    ok('MR21 a PLAYER gets no aggregate picture of their squad — not the spread, and not a dot for every teammate who engaged either',
      playerCh.status === 200 &&
      (playerCh.j.chart === null || playerCh.j.chart.kind !== 'spread') &&
      !JSON.stringify(playerCh.j).includes('said where they were with it'));
    ok('MR21b …while the coach\'s own timeline still carries them, which is what proves the line above is a gate and not an absence',
      JSON.stringify((await get('/api/objects/focus/tf1/chart?kind=timeline', coachT)).j)
        .includes('said where they were with it'));
    const smallCh = await get('/api/objects/focus/tf2/chart', otherT);
    ok('MR22 the chart on the small squad is REFUSED WITH A REASON rather than drawn from one person',
      smallCh.j.chart === null && /stays anonymous/i.test(smallCh.j.note || ''));

    /* ── MR25: HOW A BELIEF FIRMED UP — the founder's first pick for a graph, end to end.

       Nothing in the fixture above exercised it: a team focus has no signals, so the firming
       branch was dead and a mutation making it count MESSAGES instead of ORIGINS bit nothing.
       That is the single law this chart exists to teach, so it needs a belief with real evidence
       behind it. ── */
    const DAY = 86400000;
    const t0 = Date.now() - 30 * DAY;
    {
      const mine = (inquiryStates[C] = inquiryStates[C] || {});
      const sub = (mine['member:p7'] = mine['member:p7'] || {});
      let q = diagnose.newInquiry({ id: 'inq_firm', subjectRef: 'member:p7', concept: 'soccer.press',
        label: 'Pressing after a turnover', domain: 'sports', now: t0 });
      const sig = (origin, at, n) => ({
        id: `p_${origin}_${n}`, level: 'observation', directness: 'direct', authority: 'third_party',
        source: 'other', specificity: 0.7, statement: 'watched it', originKind: 'leader_report',
        originRef: origin, turnId: `t_${origin}_${n}`, direction: 'decline',
      });
      // Three independent origins on three different days...
      q = diagnose.applyProposals(q, [sig('leader:a', t0, 1)], { now: t0, evidenceRefOf: x => `${x.originRef}#${x.id}` });
      q = diagnose.applyProposals(q, [sig('leader:b', t0 + 5 * DAY, 1)], { now: t0 + 5 * DAY, evidenceRefOf: x => `${x.originRef}#${x.id}` });
      q = diagnose.applyProposals(q, [sig('leader:c', t0 + 12 * DAY, 1)], { now: t0 + 12 * DAY, evidenceRefOf: x => `${x.originRef}#${x.id}` });
      // ...and FOUR more from origins already counted. These are the ones that must move nothing.
      for (let i = 2; i <= 5; i++) {
        q = diagnose.applyProposals(q, [sig('leader:a', t0 + (12 + i) * DAY, i)],
          { now: t0 + (12 + i) * DAY, evidenceRefOf: x => `${x.originRef}#${x.id}` });
      }
      sub['soccer.press'] = q;
    }
    const firm = await get('/api/objects/inquiry/inq_firm/chart?kind=firming', T.p7);
    ok('MR25 a belief with real evidence behind it draws HOW IT FIRMED UP',
      firm.status === 200 && firm.j.chart && firm.j.chart.kind === 'firming');
    const originsSeries = firm.j.chart.series.find(x => x.key === 'origins');
    ok('MR25b THE CURVE IS INDEPENDENT ORIGINS, NOT MESSAGES — seven accounts from three origins is three points, and the four repeats move nothing',
      originsSeries.points.length === 3 &&
      originsSeries.points.map(pt => pt.value).join(',') === '1,2,3');
    ok('MR25c …every point counting exactly the evidence it names',
      originsSeries.points.every(pt => pt.value === pt.refs.length));
    ok('MR25d …drawn against the threshold where a call becomes possible, because the shape is only legible against it',
      firm.j.chart.threshold && firm.j.chart.threshold.value === teamState.MIN_ORIGINS);
    ok('MR25e …with what the kernel made of the evidence at each moment, from the production kernel rather than a second copy of banding',
      (firm.j.chart.series.find(x => x.key === 'band') || {}).points.length === 3);
    ok('MR25f …and the chart says on itself that repeats do not move it, which is what people find hardest to believe about this product',
      firm.j.chart.limitations.some(l => /the same person saying it again does not move this/i.test(l)));

    /* ── MR23: recreating it, governed. ── */
    const recomp = await post(`/api/materials/${MID}/recompose`, coachT, { intent: 'the same plan for next week at home' });
    ok('MR23 the coach can ask for it recreated for another game, and gets a DRAFT back',
      recomp.status === 200 && !!recomp.j.draft && recomp.j.confirmationRequired === true);
    ok('MR23b …drawn only from the parts they attached, with nothing sent or attached anywhere',
      /Pressing traps|Rest defence|Set pieces/.test(JSON.stringify(recomp.j.draft)) &&
      /Nothing has been sent or attached/i.test(recomp.j.note || ''));
    ok('MR23c a player cannot recreate somebody else\'s briefing — they can read it and ask about it',
      (await post(`/api/materials/${MID}/recompose`, T.p1, { intent: 'x' })).status === 403);
    /* MR23d-e — ADDED BECAUSE A MUTATION BIT NOTHING. With no model configured the composed
       branch never runs in a test, so removing the governance call changed no answer this suite
       could produce. Recomposing a scouting brief for a different opponent is EXACTLY where a
       model helpfully invents a formation or a number, so the guarantee is the feature. Asserted
       two ways: the dataset shape makes an invented figure catchable, and the route is wired to
       catch it. */
    const matDataset = { title: 'Saturday scouting',
      rows: material.segment(DECK, { kind: 'pptx' }).map(x => ({ id: x.id, label: x.heading, detail: x.text })) };
    ok('MR23d the material\'s own parts are the dataset, so a recreated brief quoting a number that is not in the deck is REFUSED',
      renderArtifact.governArtifact({
        composed: { title: 'Next week', body: 'Press in a 4-2-3-1 with 7 players ahead of the ball.', usedRefs: ['s1'] },
        dataset: matDataset, format: 'summary',
      }).ok === false);
    ok('MR23e …while one drawn from the coach\'s own words passes, which is what proves the line above is a gate rather than an always-refuse',
      renderArtifact.governArtifact({
        composed: { title: 'Next week', body: 'Force them wide, then trap on the touchline.', usedRefs: ['s1'] },
        dataset: matDataset, format: 'summary',
      }).ok === true);
    ok('MR23f …and the route runs that gate and falls back to the plain version rather than showing an invented figure',
      /const gov = renderArtifact\.governArtifact\(\{ composed, dataset, format: 'summary' \}\);/.test(srv) &&
      /is not in the material you attached, so I fell back/.test(srv));

    /* ── MR24: THE CALL SITES. A route with no caller is not a feature. ── */
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'app.js'), 'utf8');
    ok('MR24 the attach control exists and posts the extracted text — the parser has been in the browser all along and sent it nowhere',
      /MemberApp\.attachMaterial\(/.test(src) && /fetch\('\/api\/materials'/.test(src) &&
      /AttachmentHandler\.process\(file\)/.test(src));
    ok('MR24b …a player can open a part and say where they are with it',
      /MemberApp\.markSection\('/.test(src) && /materials\/\$\{encodeURIComponent\(ctx\.materialId\)\}\/engaged/.test(src));
    ok('MR24c …the coach\'s report and the recreate control are both reachable',
      /_renderMaterialReport\(/.test(src) && /\/understanding/.test(src) && /recomposeMaterial\(/.test(src));
    /* MR24d-f — SHARPENED AFTER THREE MUTATIONS BIT NOTHING. Each of these first matched the
       function's own DEFINITION, so deleting the call that invokes it left them green: the
       renderer existed, was never run, and the suite said the feature was reachable. Existence is
       not invocation, and a regex that matches `async _renderChart(` proves only that somebody
       wrote one. These match the CALL. */
    ok('MR24d …and the chart is rendered from the server\'s numbers — the CALL is asserted, not the function\'s own definition, which is what let a deleted call stay green',
      /this\._renderChart\(kind, objectId\);/.test(src) &&
      /objects\/\$\{encodeURIComponent\(kind\)\}\/\$\{encodeURIComponent\(objectId\)\}\/chart/.test(src));
    /* MR24e — AND THIS ONE WAS MASKED TOO, one level deeper. `this._renderMaterial(kind, objectId)`
       appears TWICE in the file — once in the thread's render pipeline, once inside attachMaterial
       to refresh after an upload — so deleting the pipeline call left the regex satisfied by the
       other one. The feature would have been unreachable from the object with the suite green.
       Anchored to the pipeline itself, in order. */
    ok('MR24e …the material panel is opened BY THE OBJECT THREAD\'s render pipeline — the same call appears elsewhere in the file, so matching the call alone proved nothing',
      /this\._renderCallRow\(objectId\);\s*\n\s*this\._renderChart\(kind, objectId\);\s*\n\s*this\._renderMaterial\(kind, objectId\);/.test(src));
    ok('MR24f …and the chart\'s stated limits are actually put on the page, because a picture that does not say what it cannot show is read as showing everything',
      /parts\.push\(`<ul class="iqt-chart-lim">\$\{\(c\.limitations \|\| \[\]\)/.test(src));

  } catch (e) { fail++; console.error('  FAIL suite threw:', e && e.stack); }

  server.close();
  console.log(`\nmaterial-reach-http-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
