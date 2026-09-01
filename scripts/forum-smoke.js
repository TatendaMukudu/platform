/* Truth layer — FORUM: SPEECH BEFORE EVIDENCE (HTTP, model OFF).

   Forum creates speech before it creates evidence. A message is conversation — not a signal, not
   a contribution, not an origin, not corroboration, not a fact. Ten people agreeing changes
   nothing, and that is structural rather than a promise: ai/forum.js contains no reference to
   evidence, confidence or origins, and the post route touches forumThreads and nothing else.

   The standard this suite holds the code to is not "members can discuss group inquiries". It is
   that people can deliberate together without IntelliQ confusing conversation, popularity,
   authority, repetition or visibility with truth.

   Run: node scripts/forum-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.IQ_DETERMINISTIC_ONLY = '1';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

(async () => {
  const S = require('../server.js');
  const f = require('../ai/forum.js');
  const d = require('../ai/diagnose.js');
  const {
    app, orgMeta, orgUsers, orgNodes, inquiryStates, groupCandidates, forumThreads, safeguardingFlags,
    issueToken, _noteGroupCandidates, _removePerson,
  } = S;

  const CODE = 'fc', OTHER = 'school';
  orgMeta[CODE]  = { orgName: 'Forum FC', orgMode: 'sports' };
  orgMeta[OTHER] = { orgName: 'Elsewhere School', orgMode: 'education' };
  const mk = (id, role = 'member') => ({ id, name: id, email: `${id}@x.test`, role, status: 'active', assignedNodeIds: [], leadershipNodeIds: [] });
  orgUsers[CODE] = { pA: mk('pA'), pB: mk('pB'), pC: mk('pC'), pD: mk('pD'), pE: mk('pE'),
                     coach: mk('coach', 'coach'), stranger: mk('stranger') };
  orgUsers[OTHER] = { alien: mk('alien') };
  orgNodes[CODE] = { u18: { nodeId: 'u18', name: 'U18s', parentId: null, childNodeIds: [],
                            memberIds: ['pA', 'pB', 'pC', 'pD', 'pE'], leaderIds: ['coach'] } };
  orgNodes[OTHER] = { yr9: { nodeId: 'yr9', name: 'Year 9', parentId: null, childNodeIds: [], memberIds: ['alien'], leaderIds: [] } };
  for (const id of ['pA', 'pB', 'pC', 'pD', 'pE']) orgUsers[CODE][id].assignedNodeIds = ['u18'];
  orgUsers[CODE].coach.assignedNodeIds = ['u18']; orgUsers[CODE].coach.leadershipNodeIds = ['u18'];
  orgUsers[OTHER].alien.assignedNodeIds = ['yr9'];

  const server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = (code, id) => ({ Authorization: `Bearer ${issueToken(id, code, (orgUsers[code] || {})[id]?.role || 'member')}`, 'Content-Type': 'application/json' });
  const GET  = (code, id, p) => fetch(base + p, { headers: H(code, id) }).then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) }));
  const POST = (code, id, p, b) => fetch(base + p, { method: 'POST', headers: H(code, id), body: JSON.stringify(b || {}) }).then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) }));
  const PATCH = (code, id, p, b) => fetch(base + p, { method: 'PATCH', headers: H(code, id), body: JSON.stringify(b || {}) }).then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) }));

  // ── STEP 1. A real group inquiry, opened the ordinary way ──────────────────────────────────
  console.log('\n  STEP 1 — a group inquiry exists, opened through the existing boundary');
  const give = async (who, ref, span, originRef, extra = {}) => {
    _noteGroupCandidates(CODE, who, `member:${who}`, [{
      id: ref, level: 'observation', text: 'press trigger', sourceSpan: span, concerns: 'group',
      originRef, originKind: 'direct_observation', turnId: ref, ...extra,
    }], 'press_trigger', 'Press trigger clarity');
    const c = groupCandidates[CODE][groupCandidates[CODE].length - 1];
    return POST(CODE, who, '/api/group/u18/contribute', { candidateId: c.candidateId });
  };
  await give('pA', 'seed1', 'Our press trigger is unclear', 'pa_saturday');
  await give('pB', 'seed2', 'We do not know when the 8 should jump', 'pb_training');

  const G = () => Object.values((inquiryStates[CODE] || {})['group:u18'] || {})[0];
  ok('1 · the group inquiry exists with admitted evidence', !!G() && G().signals.length === 2);
  const INQ = G().inquiryId;

  /* The measurement that every "zero epistemic effect" assertion below rests on. */
  const epistemic = () => {
    const g = G();
    const active = g.signals.filter(s => d.isActive(s));
    return JSON.stringify({
      signals: active.length,
      origins: [...new Set(active.filter(s => s.originRef).map(s => s.originRef))].sort(),
      contributors: [...new Set(active.map(s => s.contributedBy))].sort(),
      confidence: g.confidence.score,
      band: g.confidence.band,
      hypotheses: g.hypotheses.map(h => ({ id: h.id, s: h.status, c: h.confidence.score })),
      lead: g.leadingHypothesisId,
      frontier: (g.missingSignals || []).map(m => m.question),
      candidates: (groupCandidates[CODE] || []).length,
    });
  };

  // ── STEP 2. Speech ─────────────────────────────────────────────────────────────────────────
  console.log('\n  STEP 2-4 — conversation cannot become evidence');
  const beforeTalking = epistemic();
  const post = (who, text, extra) => POST(CODE, who, `/api/group/u18/forum/${INQ}`, { text, ...extra });

  const m1 = await post('pA', 'I think the winger is jumping before the striker closes the centre-back.');
  ok('5 · a member can post', m1.status === 200 && !!m1.body.messageId);
  ok('9 · …and the route says outright that it changed nothing epistemically', m1.body.epistemicEffect === 'none');
  {
    const view = await GET(CODE, 'pB', `/api/group/u18/forum/${INQ}`);
    ok('1 · a node member can read the forum', view.status === 200 && view.body.messages.length === 1);
    // D-A2: attribution used to be asserted here. The founder has ruled the other way for pilot,
    // so what must now hold is the opposite — and the stronger half of it is that the KERNEL
    // still knows, which is what keeps origin counting and correction working.
    ok('7 · …with the author hidden from another member', view.body.messages[0].authorId == null
      && view.body.messages[0].mine === false);
    ok('7b · …while the kernel keeps protected authorship',
      forumThreads[CODE][INQ].messages[0].authorId === 'pA');
    const own = await GET(CODE, 'pA', `/api/group/u18/forum/${INQ}`);
    ok('7c · …and the author can still find their own words', own.body.messages[0].mine === true);
    ok('8 · …and the message persisted', view.body.messages[0].text.includes('winger is jumping'));
    const lead = await GET(CODE, 'coach', `/api/group/u18/forum/${INQ}`);
    ok('2 · a node leader can read it', lead.status === 200 && lead.body.messages.length === 1);
  }
  ok('9-12 · posting changed NO signal, origin, contributor, confidence, hypothesis or frontier',
    epistemic() === beforeTalking);

  // ── STEP 3-4. Agreement, at volume ─────────────────────────────────────────────────────────
  const m2 = await post('pB', 'I agree.');
  ok('13 · "I agree" has zero epistemic effect', epistemic() === beforeTalking);
  for (const who of ['pC', 'pD', 'pE', 'coach']) {
    await post(who, 'Agreed, the press trigger is definitely the problem.');
  }
  ok('13 · six people all agreeing STILL has zero epistemic effect', epistemic() === beforeTalking);
  {
    const view = await GET(CODE, 'pA', `/api/group/u18/forum/${INQ}`);
    ok('13 · …though the conversation is fully visible as conversation', view.body.messages.length === 6);
  }
  ok('13 · …and no candidate was manufactured either',
    (groupCandidates[CODE] || []).length === JSON.parse(beforeTalking).candidates);

  // ── Access control ─────────────────────────────────────────────────────────────────────────
  console.log('\n  ACCESS');
  {
    const nm = await GET(CODE, 'stranger', `/api/group/u18/forum/${INQ}`);
    ok('3 · a non-member of the node cannot read it', nm.status === 403);
    const nw = await post('stranger', 'let me in');
    ok('6 · …and cannot post', nw.status === 403);
    const alien = await GET(OTHER, 'alien', `/api/group/u18/forum/${INQ}`);
    ok('4 · another org fails closed', alien.status === 404);
    const alienW = await POST(OTHER, 'alien', `/api/group/u18/forum/${INQ}`, { text: 'hello' });
    ok('30 · …on write too', alienW.status === 404);
    const ghost = await GET(CODE, 'pA', '/api/group/u18/forum/inq_does_not_exist');
    ok('· a thread cannot exist without a real group inquiry', ghost.status === 404);
  }

  // ── STEP 5. Deliberate contribution ────────────────────────────────────────────────────────
  console.log('\n  STEP 5 — the author deliberately offers their own account');
  const beforeContribute = JSON.parse(epistemic());
  const c1 = await POST(CODE, 'pA', `/api/group/u18/forum/${INQ}/${m1.body.messageId}/contribute`, {});
  ok('14 · the author can contribute their own message', c1.status === 200 && c1.body.contributed === m1.body.messageId);
  {
    const after = JSON.parse(epistemic());
    ok('16 · …through the existing contribution boundary (a candidate was created)',
      (groupCandidates[CODE] || []).some(x => x.evidenceRef === m1.body.messageId));
    ok('5 · …and it became a signal on the group inquiry',
      after.signals === beforeContribute.signals + 1);
    ok('17 · …carrying an origin of its own, because it is their own account',
      after.origins.length === beforeContribute.origins.length + 1 && c1.body.origin === 'direct_observation');
    ok('· …and the contributor is recorded', after.contributors.includes('pA'));
    ok('· …and confidence was recomputed by the existing machinery', after.confidence !== beforeContribute.confidence);
  }
  {
    const view = await GET(CODE, 'pB', `/api/group/u18/forum/${INQ}`);
    const m = view.body.messages.find(x => x.messageId === m1.body.messageId);
    ok('· the thread shows the author stood behind it', m.contributed === true);
  }

  // ── STEP 6. Ownership ──────────────────────────────────────────────────────────────────────
  console.log('\n  STEP 6 — leadership is not ownership of testimony');
  {
    const stolen = await POST(CODE, 'coach', `/api/group/u18/forum/${INQ}/${m2.body.messageId}/contribute`, {});
    ok('15 · a LEADER cannot turn a member\'s message into evidence', stolen.status === 403);
    ok('15 · …and is told why', /only the author/.test(stolen.body.error || ''));
    const peer = await POST(CODE, 'pC', `/api/group/u18/forum/${INQ}/${m2.body.messageId}/contribute`, {});
    ok('15 · nor can a teammate', peer.status === 403);
    ok('· the pure predicate agrees, with no server involved',
      !f.mayContributeMessage({ actorId: 'coach', message: { authorId: 'pA', status: 'visible' }, leadsNode: true }).allowed &&
      f.mayContributeMessage({ actorId: 'pA', message: { authorId: 'pA', status: 'visible' }, inNode: true }).allowed);
  }

  // ── STEP 7. Disagreement ───────────────────────────────────────────────────────────────────
  console.log('\n  STEP 7 — disagreement survives, and Forum does not settle it');
  {
    const dis = await post('pB', 'I disagree. The trigger is fine; the problem is the winger\'s starting position.');
    const before = JSON.parse(epistemic());
    const cd = await POST(CODE, 'pB', `/api/group/u18/forum/${INQ}/${dis.body.messageId}/contribute`, {});
    ok('19 · a contradictory account can be contributed too', cd.status === 200);
    const after = JSON.parse(epistemic());
    ok('19 · …both accounts survive side by side',
      after.signals === before.signals + 1 && after.contributors.includes('pA') && after.contributors.includes('pB'));
    ok('19 · …with a distinct origin, because pB saw it themselves',
      after.origins.length === before.origins.length + 1);
    /* Forum does not reconcile the two accounts, and neither does it pretend they agree. Both
       stand as separate signals with separate origins, and what that means for the picture is
       the kernel's to decide — here independence has already saturated, so a fourth origin
       correctly moves nothing, which is the kernel being right rather than Forum being quiet. */
    ok('· Forum reconciled nothing — both accounts stand as separate origins',
      after.origins.length === before.origins.length + 1 &&
      G().signals.filter(x => d.isActive(x)).length === before.signals + 1);
    ok('· …and confidence is whatever the kernel says, computed by it alone',
      after.confidence === d.deriveConfidence(G().signals.filter(x => x.kind !== 'interpretation' && d.isActive(x)), { now: G().lastUpdatedAt }).score);
    /* Comments are stripped before the check. The point is that no voting MECHANISM exists in the
       code; prose explaining why one must not exist is the opposite of a violation, and a word
       blacklist that reads comments fails on the documentation that proves it right. */
    {
      const src = require('fs').readFileSync(require('path').join(__dirname, '../ai/forum.js'), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
      ok('· Forum resolved nothing: no vote, no consensus, no winner',
        !/vote|consensus|agree_count|majority/i.test(src));
    }
  }

  // ── STEP 8. Repetition ─────────────────────────────────────────────────────────────────────
  console.log('\n  STEP 8 — repeating someone else cannot manufacture independence');
  {
    const echo = await post('pC', 'Same as pA said — the winger jumps early.');
    const before = JSON.parse(epistemic());
    const ce = await POST(CODE, 'pC', `/api/group/u18/forum/${INQ}/${echo.body.messageId}/contribute`, { echoes: m1.body.messageId });
    ok('18 · an echo can be contributed', ce.status === 200);
    const after = JSON.parse(epistemic());
    ok('18 · …the contributor count rises', after.contributors.length === before.contributors.length + 1);
    ok('18 · …but the INDEPENDENT ORIGIN COUNT DOES NOT',
      after.origins.length === before.origins.length);
    ok('18 · …because it carries the original\'s origin, marked as reported', ce.body.origin === 'reported');
    ok('18 · …so confidence cannot rise merely from repetition', after.confidence <= before.confidence + 0.001);
  }

  // ── STEP 9. Correction ─────────────────────────────────────────────────────────────────────
  console.log('\n  STEP 9 — the two histories stay distinct');
  {
    const mineCand = (groupCandidates[CODE] || []).find(x => x.evidenceRef === m1.body.messageId);
    const before = JSON.parse(epistemic());
    const w = await POST(CODE, 'pA', '/api/group/u18/withdraw', { candidateId: mineCand.candidateId, reason: 'I watched it back — I was wrong' });
    ok('20 · withdrawal goes through the EXISTING epistemic lifecycle', w.status === 200);
    const g = G();
    const sig = g.signals.find(s => s.ref === m1.body.messageId);
    ok('20 · …the signal is superseded, not deleted', !!sig && !d.isActive(sig));
    ok('20 · …history explains it', (g.timeline || []).some(e => e.kind === 'correction'));
    ok('20 · …and the active read shrank', JSON.parse(epistemic()).signals === before.signals - 1);
    const view = await GET(CODE, 'pB', `/api/group/u18/forum/${INQ}`);
    ok('· the Forum message is still there — speech was not retracted, evidence was',
      view.body.messages.some(x => x.messageId === m1.body.messageId && x.status === 'visible'));
  }

  // ── STEP 9b. Editing speech must not rewrite evidence ──────────────────────────────────────
  {
    const mB = await post('pD', 'The centre-backs step up too late in my view.');
    await POST(CODE, 'pD', `/api/group/u18/forum/${INQ}/${mB.body.messageId}/contribute`, {});
    const before = JSON.parse(epistemic());
    const ed = await PATCH(CODE, 'pD', `/api/group/u18/forum/${INQ}/${mB.body.messageId}`, { text: 'Actually never mind.' });
    ok('21 · editing contributed speech does NOT silently rewrite the evidence',
      ed.status === 200 && ed.body.evidenceUnchanged === true && JSON.parse(epistemic()).signals === before.signals);
    ok('21 · …and the author is told the evidence still stands', /Withdraw it separately/.test(ed.body.note || ''));
    const rm = await PATCH(CODE, 'pD', `/api/group/u18/forum/${INQ}/${mB.body.messageId}`, { remove: true });
    ok('21 · removing the message likewise leaves the evidence alone',
      rm.status === 200 && JSON.parse(epistemic()).signals === before.signals);
    const view = await GET(CODE, 'pB', `/api/group/u18/forum/${INQ}`);
    const t = view.body.messages.find(x => x.messageId === mB.body.messageId);
    ok('21 · …the removed turn stays as a tombstone, so replies do not dangle',
      !!t && t.status === 'removed' && t.text === null && t.authorId === null);
    const nope = await PATCH(CODE, 'pC', `/api/group/u18/forum/${INQ}/${m2.body.messageId}`, { text: 'hijack' });
    ok('· only the author may edit their own message', nope.status === 403);
  }

  // ── Un-contributed removal ─────────────────────────────────────────────────────────────────
  {
    const throwaway = await post('pE', 'ignore me');
    const before = JSON.parse(epistemic());
    await PATCH(CODE, 'pE', `/api/group/u18/forum/${INQ}/${throwaway.body.messageId}`, { remove: true });
    ok('21 · removing an UN-contributed message touches no evidence at all', epistemic() === JSON.stringify(before) || JSON.parse(epistemic()).signals === before.signals);
  }

  // ── STEP 10. Membership change ─────────────────────────────────────────────────────────────
  console.log('\n  STEP 10 — leaving the node');
  {
    const beforeLeave = JSON.parse(epistemic());
    orgNodes[CODE].u18.memberIds = orgNodes[CODE].u18.memberIds.filter(x => x !== 'pB');
    orgUsers[CODE].pB.assignedNodeIds = [];
    const r = await GET(CODE, 'pB', `/api/group/u18/forum/${INQ}`);
    ok('22 · a former member loses read access', r.status === 403);
    const w = await post('pB', 'still here?');
    ok('22 · …and write access', w.status === 403);
    const cont = await POST(CODE, 'pB', `/api/group/u18/forum/${INQ}/${m2.body.messageId}/contribute`, {});
    ok('22 · …and cannot contribute after losing authorisation', cont.status === 403);
    const view = await GET(CODE, 'pA', `/api/group/u18/forum/${INQ}`);
    /* D-A2: this used to read authorId off the API view. Under anonymity that field is null for
       everyone, so the assertion would have passed without testing anything. It now reads the
       KERNEL record, which is both the honest test and the stronger one — losing membership must
       not rewrite what a person said, and the system must still know they said it. */
    ok('· their historical speech is not silently rewritten',
      view.body.messages.some(x => x.status === 'visible')
      && forumThreads[CODE][INQ].messages.some(x => x.authorId === 'pB' && x.status === 'visible'));
    ok('23 · …and their contributed evidence survives membership removal',
      JSON.parse(epistemic()).contributors.includes('pB') &&
      JSON.parse(epistemic()).signals === beforeLeave.signals);
  }

  // ── STEP 12 / leakage ──────────────────────────────────────────────────────────────────────
  console.log('\n  LEAKAGE');
  {
    safeguardingFlags[CODE] = [{ id: 'sg1', subjectId: 'pA', severity: 'concern', excerpt: 'everything feels pointless', at: new Date().toISOString(), status: 'open' }];
    inquiryStates[CODE]['member:pA'] = { nerves: d.applyProposals(
      d.newInquiry({ id: 'inq_priv', subjectRef: 'member:pA', concept: 'nerves', label: 'Nerves' }),
      [{ id: 'privsig', level: 'observation', text: 'nervous', sourceSpan: 'I get nervous before matches', source: 'pA' }]) };
    const view = await GET(CODE, 'pC', `/api/group/u18/forum/${INQ}`);
    const inq = await GET(CODE, 'pC', '/api/group/u18/inquiry');
    const blob = JSON.stringify(view.body) + JSON.stringify(inq.body);
    ok('28 · no safeguarding excerpt reaches Forum or the group read', !/pointless/.test(blob));
    ok('12 · no private Self span leaks', !/I get nervous before matches/.test(blob));
    ok('12 · …nor an unrelated Self inquiry', !/inq_priv|nerves/.test(blob));
    ok('29 · no private candidate internals leak (no candidateId, evidenceRef or originRef)',
      !/candidateId|evidenceRef|originRef/.test(blob));
    ok('· the group read still explains itself with SAFE aggregates',
      typeof inq.body.inquiries[0].independentOrigins === 'number' &&
      typeof inq.body.inquiries[0].contributors === 'number' &&
      'confidence' in inq.body.inquiries[0]);
    ok('· a Forum payload carries no epistemic fields at all',
      !('confidence' in view.body) && !('signals' in view.body) && !('origins' in view.body));
  }

  // ── Structural guarantee ───────────────────────────────────────────────────────────────────
  console.log('\n  STRUCTURE');
  {
    const src = require('fs').readFileSync(require('path').join(__dirname, '../ai/forum.js'), 'utf8');
    // Strip prose: the header explains what Forum must NOT do, so it names the very things the
    // CODE must never mention. What matters is the executable half.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    ok('9 · Forum is structurally incapable of epistemic effect — the code names no such concept',
      !/deriveConfidence|applyProposals|hypothes|confidence|signal|corroborat/i.test(code));
    ok('· and it imports nothing that could reach the kernel', !/require\(/.test(code));
  }

  // ── Persistence + erasure ──────────────────────────────────────────────────────────────────
  console.log('\n  DURABILITY');
  {
    const units = S._durableUnits();
    ok('25 · forum threads partition by org with no special handling', !!units[`store:forumThreads:${CODE}`]);
    const snapshot = JSON.stringify(S._durableUnits());
    S._applyUnits(JSON.parse(snapshot));
    ok('25 · …and survive reconstruction', (forumThreads[CODE] || {})[INQ].messages.length > 0);
    ok('26-27 · Self and Group state from PR #57 are untouched',
      !!inquiryStates[CODE]['member:pA'] && !!inquiryStates[CODE]['group:u18']);

    const beforeErase = JSON.parse(epistemic());
    _removePerson(CODE, 'pC', true);
    const view = await GET(CODE, 'pA', `/api/group/u18/forum/${INQ}`);
    /* D-A2: the view's authorId is null for everyone now, so checking it here would prove
       nothing. Erasure has to be verified where authorship actually lives. */
    ok('24 · erasure removes their words and their authorship from the thread',
      !JSON.stringify(view.body).includes('Same as pA said') &&
      !forumThreads[CODE][INQ].messages.some(m => m.authorId === 'pC' && m.status !== 'removed'));
    ok('24 · …leaving tombstones rather than holes', view.body.messages.some(m => m.status === 'removed'));
    ok('24 · …while what they contributed stays governed by the evidence lifecycle',
      JSON.parse(epistemic()).signals === beforeErase.signals);
  }

  server.close();
  console.log(`\nforum-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
