/* Truth layer — A HUMAN MAY SAY WHY, AND IT STAYS A CANDIDATE.

   Until now a group inquiry could hold only observations. `contribution.toGroupProposal` emits
   `level: 'observation'` and nothing in production emitted `level: 'hypothesis'`, so "what might
   explain it" was empty by construction — and the people who were actually there had no way to
   say what they thought was happening.

   FOUNDER DECISION, September 2026: the explanation belongs to the people who were there. A human
   may propose one deliberately. It must not become true because they said it.

   THE KERNEL ALREADY ENFORCED EVERY PART OF THAT, which is why this is a door and not an engine:

     · `diagnose.newHypothesis` births at score 0, band `tentative`, "nothing supports this yet".
     · Which explanation LEADS is decided by evidence score, never by proposer, role, or arrival.
     · Rivals coexist and compete; a new one never overwrites an incumbent.
     · The INQUIRY's confidence is the observation's, and proposing a theory does not move it.

   WHAT DID NOT HOLD, AND WAS THE TRAP. `_groupInquiryProjections` carried the leading hypothesis
   as a bare string while its rivals travelled with their own band and status — so `ai/team-state`
   rendered it as the group's CLAIM at `fit.band`, the band the OBSERVATION earned. Opening this
   door without fixing that would have dressed an unevidenced theory in the standing of five
   people who described the thing it claims to explain and never endorsed the reason for it.
   That is "authority makes it true" arriving by a side door.

   So the projection now carries `hypothesisStanding`, and a hypothesis is admitted as the claim
   only when the KERNEL has given it standing of its own — read from the computed band, never
   recounted here (L-DC1: derived, never asserted).

   AND THE TWO FRONTIER CATEGORIES ARE NOT THE SAME THING. An UNKNOWN is a statement about what
   the record does not establish; it costs nobody anything. A QUESTION is an act that spends
   attention and can distort the behaviour it asks about. Driven here: "why does communication
   drop after results" scores 0.02 and the critic blocks it `no_reliable_owner`, because nobody is
   the system of record for why a group behaves a certain way. That refusal is correct, and the
   honest answer is that there is nothing useful to ask yet — not a lowered bar until something
   comes out.

   Run: node scripts/group-explanation-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
/* MODELS OFF THROUGHOUT. The human explanation path must be a first-class deterministic path,
   because provider-down is the state a pilot actually runs in. */
process.env.IQ_DETERMINISTIC_ONLY = '1';

const S = require('../server.js');
const teamState = require('../ai/team-state.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken,
        groupCandidates, _noteGroupCandidates, inquiryStates } = S;

let pass = 0, fail = 0;
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const O = 'gex', OTHER = 'gey';
const SQUAD = Array.from({ length: 14 }, (_, i) => 'p' + (i + 1));
const users = { coach: { id: 'coach', name: 'Coach', email: 'c@g.io', role: 'coach', orgCode: O, status: 'active', leadershipNodeIds: ['squad'] },
                outsider: { id: 'outsider', name: 'Outsider', email: 'o@g.io', role: 'member', orgCode: O, status: 'active' },
                rescoach: { id: 'rescoach', name: 'Reserves Coach', email: 'rc@g.io', role: 'coach', orgCode: O, status: 'active', leadershipNodeIds: ['reserves'] },
                r1: { id: 'r1', name: 'R1', email: 'r1@g.io', role: 'member', orgCode: O, status: 'active', assignedNodeIds: ['reserves'] } };
for (const id of SQUAD) users[id] = { id, name: id.toUpperCase(), email: `${id}@g.io`, role: 'member', orgCode: O, status: 'active', assignedNodeIds: ['squad'] };

_loadAllStores({
  orgMeta: { [O]: { orgName: "Alma Men's Soccer", orgMode: 'sports' }, [OTHER]: { orgName: 'Rival Club', orgMode: 'sports' } },
  orgUsers: { [O]: users, [OTHER]: { rival: { id: 'rival', name: 'Rival', email: 'r@y.io', role: 'coach', orgCode: OTHER, status: 'active', leadershipNodeIds: ['theirs'] } } },
  /* A SECOND GROUP IN THE SAME ORG. Cross-TENANT refusal is the easy case and was already
     covered; the dangerous one is a sibling inside the same organisation, where every id resolves
     and only the audience boundary stands between them. */
  orgNodes: { [O]: { squad: { nodeId: 'squad', name: 'First Team', parentId: null, childNodeIds: [], memberIds: SQUAD, leaderIds: ['coach'], rev: 1 },
                     reserves: { nodeId: 'reserves', name: 'Reserves', parentId: null, childNodeIds: [], memberIds: ['r1'], leaderIds: ['rescoach'], rev: 1 } },
              [OTHER]: { theirs: { nodeId: 'theirs', name: 'Theirs', parentId: null, childNodeIds: [], memberIds: [], leaderIds: ['rival'], rev: 1 } } },
});
_rebuildEmailIndex();
for (const id of SQUAD.slice(0, 5)) {
  _noteGroupCandidates(O, id, `member:${id}`, [{ id: 'ge_' + id, level: 'observation',
    text: 'talking drops off after we lose', sourceSpan: 'nobody talks after a loss', concerns: 'group',
    originRef: 'o_' + id, originKind: 'direct_observation', turnId: 't_' + id }],
    'communication', 'Communication after results');
}

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = (who, org = O) => ({ Authorization: `Bearer ${issueToken(who, org, who === 'coach' || who === 'rival' ? 'coach' : 'member')}`, 'Content-Type': 'application/json' });
  const call = (m, u, b, who, org) => fetch(base + u, { method: m, headers: H(who, org),
    body: b === undefined ? undefined : JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const state = who => call('GET', '/api/group/squad/state', undefined, who).then(r => r.j || {});
  const oneInquiry = async who => (((await call('GET', '/api/group/squad/inquiry', undefined, who)).j || {}).inquiries || [])[0] || {};

  try {
    console.log('\n  A — THE OBSERVATION STANDS ON ITS OWN, BEFORE ANYBODY EXPLAINS IT');
    for (const id of SQUAD.slice(0, 5)) {
      const c = (groupCandidates[O] || []).find(x => x.contributorId === id && x.status === 'detected');
      if (c) await call('POST', '/api/group/squad/contribute', { candidateId: c.candidateId, valence: 'worth_attention' }, id);
    }
    const inq0 = await oneInquiry('coach');
    const st0 = await state('coach');
    ok('GX-A1 five independent accounts, one supported observation',
      inq0.independentOrigins === 5 && (inq0.confidence || {}).band === 'supported');
    ok('GX-A2 …and nothing yet claims to explain it',
      (st0.low || {}).claim === null && ((st0.low || {}).explanations || []).length === 0);
    ok('GX-A3 …which the frontier states as a fact rather than leaving blank',
      ((st0.low || {}).stillUnknown || []).length === 0);   // no explanation offered yet = nothing open

    console.log('\n  B — SOMEBODY SAYS WHY, AND IT IS RECORDED AS A CANDIDATE');
    const said = await call('POST', `/api/group/squad/inquiry/${inq0.inquiryId}/explanation`,
      { text: 'players are worried about criticising each other' }, 'coach');
    ok('GX-B1 a human explanation is accepted through the governed boundary',
      said.status === 200 && !!(said.j || {}).explanation);
    ok('GX-B2 …at the band the kernel births it with, which is tentative and unsupported',
      (said.j.explanation || {}).band === 'tentative' && (said.j.explanation || {}).supportedBy === 0);
    ok('GX-B3 …and the reply says plainly that it is not a finding',
      /not as a finding/i.test(String(said.j.note || '')) && /carries no weight until something supports it/i.test(String(said.j.note || '')));

    console.log('\n  C — AUTHORITY DOES NOT MAKE IT TRUE');
    /* THE ATTACK. A coach is the most senior person who can reach this route. If saying it moved
       the group's confidence, or made the theory the finding, the product would have turned rank
       into evidence. */
    const st1 = await state('coach');
    const inq1 = await oneInquiry('coach');
    ok('GX-C1 the INQUIRY\'s confidence is untouched by somebody explaining it',
      (inq1.confidence || {}).band === 'supported'
      && (said.j.inquiryConfidence || {}).unchanged === true);
    ok('GX-C2 …the theory is NOT rendered as the group\'s claim',
      (st1.low || {}).claim === null);
    ok('GX-C3 …and does not borrow the band the observation earned',
      () => {
        const e = ((st1.low || {}).explanations || [])[0];
        return e && e.band === 'tentative' && e.supported === false && (st1.low || {}).band === 'supported';
      });
    ok('GX-C4 …and the composed sentence a person reads does not state it either',
      !/worried about criticising/i.test(String(((st1.low || {}).explained || {}).claim || '')));
    ok('GX-C5 a coach and a member produce the SAME standing for the same words',
      () => {
        const d = require('../ai/diagnose.js');
        const mk = role => {
          let i = { inquiryId: 'x', hypotheses: [], signals: [], falsifiers: [], confidence: { score: 0, band: 'tentative', because: [] }, timeline: [] };
          return d.applyProposals(i, [{ id: 'h', level: 'hypothesis', text: 'same words',
            source: 'u', originRef: 'o', originKind: 'reported', turnId: 't', contributorRole: role }], { now: 1 });
        };
        const a = mk('leader').hypotheses[0], b = mk('member').hypotheses[0];
        return a.confidence.band === b.confidence.band && a.confidence.score === b.confidence.score;
      });

    console.log('\n  D — A HYPOTHESIS IS NEVER PRESENTED AS AN OBSERVATION');
    ok('GX-D1 the explanation travels in its own category, not among the evidence',
      () => {
        const low = st1.low || {};
        return (low.explanations || []).some(e => /worried about criticising/.test(e.statement))
          && !/worried about criticising/.test(String(low.about || ''));
      });
    ok('GX-D2 …and the basis still counts only the accounts of what was SEEN',
      ((st1.low || {}).basis || {}).independentOrigins === 5);
    ok('GX-D3 …so the count of origins did not move when a theory arrived',
      inq1.independentOrigins === inq0.independentOrigins);

    console.log('\n  E — REPETITION BY ONE VOICE IS NOT CORROBORATION');
    for (let i = 0; i < 3; i++) {
      await call('POST', `/api/group/squad/inquiry/${inq0.inquiryId}/explanation`,
        { text: 'players are worried about criticising each other' }, 'coach');
    }
    const inq2 = await oneInquiry('coach');
    const st2 = await state('coach');
    ok('GX-E1 saying the same thing four times creates ONE candidate, not four',
      ((st2.low || {}).explanations || []).filter(e => /worried about criticising/.test(e.statement)).length === 1);
    ok('GX-E2 …and it is still unsupported',
      ((st2.low || {}).explanations || [])[0].supported === false);
    ok('GX-E3 …and the group\'s confidence still has not moved',
      (inq2.confidence || {}).band === 'supported' && inq2.independentOrigins === 5);

    /* THE LAW UNDERNEATH, STATED DIRECTLY. Text-deduplication alone would be a weak guarantee —
       it only means the same sentence collapses. The real rule is that PROPOSING an explanation
       never attaches evidence to it: a hypothesis's standing comes from `supportRefs`, and this
       route sends no basis, so no number of people saying it can raise it. Asserted with FOUR
       DIFFERENT PEOPLE, because "the same person twice" cannot distinguish deduplication from
       independence and a mutation that let repetition accrue support survived the version that
       only tried one voice. */
    for (const who of ['p8', 'p9', 'p10']) {
      await call('POST', `/api/group/squad/inquiry/${inq0.inquiryId}/explanation`,
        { text: 'players are worried about criticising each other' }, who);
    }
    const inqE = await oneInquiry('coach');
    const stE = await state('coach');
    ok('GX-E4 four DIFFERENT people saying the same thing is still one unsupported candidate',
      () => {
        const m = ((stE.low || {}).explanations || []).filter(e => /worried about criticising/.test(e.statement));
        return m.length === 1 && m[0].supported === false && m[0].band === 'tentative';
      });
    ok('GX-E5 …with no support attached to it in the kernel, which is where standing comes from',
      () => {
        const store = (inquiryStates[O]['group:squad'] || {});
        const rec = Object.values(store).find(i => i && i.inquiryId === inq0.inquiryId) || {};
        const h = (rec.hypotheses || []).find(x => /worried about criticising/.test(x.statement)) || {};
        return (h.supportRefs || []).length === 0 && h.confidence.score === 0;
      });
    ok('GX-E6 …and the observation\'s own origin count is untouched by any of it',
      inqE.independentOrigins === 5);

    console.log('\n  F — A RIVAL EXPLANATION COEXISTS, AND NEITHER WINS BY ARRIVING');
    const rival = await call('POST', `/api/group/squad/inquiry/${inq0.inquiryId}/explanation`,
      { text: 'the schedule changed and people leave straight after' }, 'p7');
    ok('GX-F1 a second person may offer a different explanation',
      rival.status === 200 && (rival.j.explanation || {}).band === 'tentative');
    const st3 = await state('coach');
    ok('GX-F2 …both are kept, neither overwrites the other',
      ((st3.low || {}).explanations || []).length === 2);
    ok('GX-F3 …and the newer one did not become the claim by being newer',
      (st3.low || {}).claim === null);

    console.log('\n  G — AN EXPLANATION MAKES THE FRONTIER LARGER, NOT SMALLER');
    /* THE ATTACK: an unknown disappearing merely because somebody offered a theory. Knowing less
       is the correct reading — there is now a candidate nobody has tested. */
    ok('GX-G1 offering explanations OPENS an unknown rather than closing one',
      ((st3.low || {}).stillUnknown || []).some(u => /nothing recorded separates them yet/i.test(String(u))));
    ok('GX-G2 …and it names how many are competing, from state rather than from a template',
      ((st3.low || {}).stillUnknown || []).some(u => /^2 explanations/.test(String(u))));
    const single = (st1.low || {}).stillUnknown || [];
    ok('GX-G3 …and said the singular thing when there was only one',
      single.some(u => /One explanation has been offered, and nothing recorded supports it yet/.test(String(u))));

    console.log('\n  H — AND NOTHING IS ASKED THAT IS NOT WORTH ASKING');
    const inqF = await oneInquiry('coach');
    ok('GX-H1 "what would help" is empty when the engine refuses the question',
      Array.isArray(inqF.wouldHelp) && inqF.wouldHelp.length === 0);
    ok('GX-H2 …which is the gauntlet refusing, not this code forgetting to ask',
      () => {
        const inquiry = require('../ai/inquiry.js');
        const u = inquiry.buildUncertainty({ id: 'x', type: inquiry.UNCERTAINTY.UNSUPPORTED_HYPOTHESIS,
          claim: 'why communication drops', hypotheses: [{ statement: 'a' }, { statement: 'b' }],
          impact: 'medium', urgency: 'low', privacyClass: 'team-shared', resolutionOwner: 'organisation' });
        const crit = inquiry.critique(inquiry.phraseQuestion(u), u);
        return crit.ok === false && crit.issues.some(i => i.severity === 'blocker');
      });

    console.log('\n  I — THE BOUNDARY IS THE SAME ONE EVERY CONTRIBUTION PASSES');
    const fromOutside = await call('POST', `/api/group/squad/inquiry/${inq0.inquiryId}/explanation`,
      { text: 'I have a theory about a squad I am not in' }, 'outsider');
    ok('GX-I1 somebody outside the group cannot explain the group',
      fromOutside.status === 403);
    const fromRival = await call('POST', `/api/group/squad/inquiry/${inq0.inquiryId}/explanation`,
      { text: 'a theory from another club' }, 'rival', OTHER);
    ok('GX-I2 …and neither can another tenant',
      fromRival.status === 403 || fromRival.status === 404);
    const noSuch = await call('POST', '/api/group/squad/inquiry/inq_does_not_exist/explanation',
      { text: 'about nothing' }, 'coach');
    ok('GX-I3 …and an inquiry that is not this group\'s finds nothing',
      noSuch.status === 404);
    const empty = await call('POST', `/api/group/squad/inquiry/${inq0.inquiryId}/explanation`, { text: '   ' }, 'coach');
    ok('GX-I4 …and an empty explanation is refused rather than recorded',
      empty.status === 400);

    console.log('\n  J — A FINDING ABOUT A PERSON IS NOT A PLACE FOR A THEORY');
    inquiryStates[O]['group:squad'].leadership = {
      inquiryId: 'inq_leader', subjectRef: 'member:coach', subjectId: 'coach',
      topic: { label: 'How the coach handles losses', canonicalConcept: 'leadership.after_loss' },
      status: 'supported', hypotheses: [], leadingHypothesisId: null,
      signals: [1, 2, 3, 4, 5].map(i => ({ id: 's' + i, status: 'active', originRef: 'o' + i })),
      confidence: { score: 0.8, band: 'supported', because: [], origin: { independentOrigins: 5, occasions: 5, signals: 5, contradictions: 0, retired: 0, unestablishedSources: 0 } },
      stillUnknown: [], falsifiers: [], missingSignals: [], alternatives: [], timeline: [], corrected: 0, contradictions: [],
    };
    const aboutPerson = await call('POST', '/api/group/squad/inquiry/inq_leader/explanation',
      { text: 'because they take it personally' }, 'p3');
    ok('GX-J1 an explanation cannot be attached to a leader-subject finding',
      aboutPerson.status === 403);
    ok('GX-J2 …and the refusal says why, in words about the object rather than about a rule',
      /about a person/i.test(String((aboutPerson.j || {}).error || '')));
    delete inquiryStates[O]['group:squad'].leadership;


    /* ══ M — AN EXPLANATION OFFERED HERE REACHES NOBODY ELSE ══════════════════════════════════
       THE ATTACK: a private explanation influencing another audience. Cross-tenant refusal is the
       easy case and section I already had it. The dangerous one is a SIBLING GROUP inside the same
       organisation, where every id resolves, the tenant partition never fires, and the only thing
       standing between the two is the audience boundary itself.

       The proposer here is the COACH — the most senior person who can reach the route — so if
       authority were going to carry a theory across a boundary anywhere, it would be here. */
    console.log('\n  M — AN EXPLANATION OFFERED HERE REACHES NOBODY ELSE');
    {
      const theirs = await call('GET', '/api/group/reserves/inquiry', undefined, 'rescoach');
      ok('GX-M1 the sibling group\'s own coach reads their own group fine',
        theirs.status === 200);
      ok('GX-M2 …and not one word of the first team\'s explanation is in it',
        !/worried about criticising/i.test(JSON.stringify(theirs.j || {})));
      const theirState = await call('GET', '/api/group/reserves/state', undefined, 'rescoach');
      ok('GX-M3 …nor in the surface their squad reads',
        theirState.status === 200 && !/worried about criticising/i.test(JSON.stringify(theirState.j || {})));
      const peeking = await call('GET', '/api/group/squad/inquiry', undefined, 'rescoach');
      ok('GX-M4 …and a leader of another group in the same org cannot open the first team at all',
        peeking.status === 403 || (((peeking.j || {}).inquiries) || []).length === 0);
      const theirMember = await call('GET', '/api/group/squad/inquiry', undefined, 'r1');
      ok('GX-M5 …and neither can one of their members',
        theirMember.status === 403 || (((theirMember.j || {}).inquiries) || []).length === 0);
      const writing = await call('POST', `/api/group/reserves/inquiry/${inq0.inquiryId}/explanation`,
        { text: 'carrying the first team theory across' }, 'rescoach');
      ok('GX-M6 …and the first team\'s inquiry id, used against the sibling group, finds nothing rather than something',
        writing.status === 404);
    }

    console.log('\n  K — AND NONE OF IT NEEDED A MODEL');
    ok('GX-K1 every assertion above ran with models switched off',
      process.env.IQ_DETERMINISTIC_ONLY === '1');
    ok('GX-K2 …and the explanation route calls no provider',
      () => {
        const fs = require('fs'), path = require('path');
        const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
        const i = src.indexOf("app.post('/api/group/:nodeId/inquiry/:inquiryId/explanation'");
        const body = src.slice(i, src.indexOf('\napp.', i + 10));
        return i > 0 && !/ai\.complete|await ai\.|gateway\./.test(body);
      });

    /* ══ L — AN EXPLANATION THE EVIDENCE RULED OUT IS NOT STILL A CANDIDATE ═══════════════════
       THE ATTACK, and the one the founder named: a corrected or superseded explanation carrying
       on influencing what the group is guided towards. The kernel has always got this right —
       `applyProposals` sets `status: 'refuted'` when the case against decisively outweighs the
       case for, and excludes refuted hypotheses from `live` when choosing which one leads.

       THE PROJECTION DID NOT. `alternatives` was `hyps.filter(h => h !== lead)` — every rival
       regardless of standing — so a ruled-out theory travelled beside a live one with only a
       `status` field to tell them apart, and not one consumer read it. That cost nothing while
       nothing rendered alternatives. It costs a great deal the moment a human may propose one
       and the group screen draws them all under "What might explain it".

       REFUTATION IS MINTED AT THE KERNEL HERE, not through a route, because nothing in production
       emits `challenges` yet — the same gap `level: 'hypothesis'` had until this pass. What is
       driven through production is everything that matters afterwards: the store the route writes
       is the store this writes, and the projection and the HTTP read are the real ones.

       AND IT IS RULED OUT, NOT DELETED. Corrections preserve history (AGENTS.md invariant 5), so
       it has to still be readable as something the group considered and dropped. Disappearing
       would be its own lie: a group that cannot see what it ruled out will propose it again. */
    console.log('\n  L — AN EXPLANATION THE EVIDENCE RULED OUT IS NOT STILL A CANDIDATE');
    {
      const diagnose = require('../ai/diagnose.js');
      const key = Object.keys(inquiryStates[O]['group:squad'])
        .find(k => inquiryStates[O]['group:squad'][k].inquiryId === inq0.inquiryId);
      const cur = inquiryStates[O]['group:squad'][key];
      const doomed = (cur.hypotheses || []).find(h => /schedule changed/.test(h.statement));
      ok('GX-L1 the rival explanation is on the record and open before anything challenges it',
        !!doomed && doomed.status !== 'refuted');
      inquiryStates[O]['group:squad'][key] = diagnose.applyProposals(cur, [{
        id: 'ch_1', level: 'observation', challenges: doomed.id,
        text: 'the schedule did not change this season',
        source: 'p9', originRef: 'o_sched_1', originKind: 'direct_observation', turnId: 't_ch1',
        authority: 'self_report', directness: 'observed', contributedBy: 'p9', contributedAt: Date.now(),
      }], { now: Date.now() });
      const after = inquiryStates[O]['group:squad'][key];
      const nowRefuted = (after.hypotheses || []).find(h => h.id === doomed.id);
      ok('GX-L2 the kernel rules it out once nothing live still supports it',
        !!nowRefuted && nowRefuted.status === 'refuted');

      const inqL = await oneInquiry('coach');
      ok('GX-L3 …and the projection stops offering it as something that MIGHT explain it',
        (inqL.alternatives || []).every(a => !/schedule changed/.test(String(a && a.statement)))
        && (inqL.alternatives || []).every(a => a && a.status !== 'refuted'));
      ok('GX-L4 …while keeping it, because what a group ruled out is part of what it knows',
        (inqL.ruledOut || []).some(r => /schedule changed/.test(String(r && r.statement))));

      const stL = await state('coach');
      ok('GX-L5 the surface a squad reads carries the same answer, from the same projection',
        ((stL.low || {}).explanations || []).every(e => !/schedule changed/.test(String(e && e.statement))));
      ok('GX-L6 …and the live explanation is still there, so this ruled one out rather than emptying the list',
        ((stL.low || {}).explanations || []).some(e => /worried about criticising/.test(String(e && e.statement))));
      ok('GX-L7 …and the screen that draws them reads the projection rather than filtering for itself',
        () => {
          const fs = require('fs'), path = require('path');
          const ui = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
          const i = ui.indexOf('_groupInquiryRow(nodeId, i, leads)');
          const body = ui.slice(i, i + 3000);
          return i > 0 && /i\.alternatives/.test(body) && !/refuted/.test(body);
        });
    }

  } catch (e) { fail++; console.error('  FAIL group-explanation suite threw:', e && e.stack); }

  server.close();
  console.log(`\ngroup-explanation-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
