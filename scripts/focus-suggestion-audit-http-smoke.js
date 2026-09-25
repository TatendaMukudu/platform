/* Truth layer — WHAT INTELLIQ SAYS WHEN SOMEBODY ASKS A FOCUS WHAT TO TRY.

   LIVE iPHONE RECHECK (findings R1 #42). "Can you give me suggestions on how to win and concede
   less?" came back collapsed and weakly grounded, and the founder asked for the whole suggestion
   path on a Focus re-audited, with realistic cases named: no evidence, one failed tactic, multiple
   attempts, user-reported figures, an external-source-backed option, and provider degradation.

   THIS IS AN AUDIT, AND MOST OF WHAT IT FOUND WAS ALREADY RIGHT. That is worth a file rather than
   a sentence, because the laws here are the ones a future change is most likely to break while
   making the product feel more helpful: every one of them is a rule about what NOT to say, and
   nothing on a screen ever complains about their absence.

   THE POLICY, AS THE PRODUCT ACTUALLY IMPLEMENTS IT:

     nothing is invented                  no tactic appears that the record does not hold      (A)
     nothing is ranked                    no winner, no score, no "best"                       (A, C)
     a failed attempt is carried          with its outcome word, never re-offered as new       (B, C)
     a reported figure is not evidence    theirs, usable, attributed, verified by nobody        (D)
     outside reading is never local proof and is not implied when none happened                (E)
     nothing writes                       an answer proposes; a person confirms                (F)
     and the deterministic path obeys all of it, because that is the pilot's own configuration.

   WHY THE DETERMINISTIC PATH IS WHAT IS DRIVEN. `ai/composer.js` carries these rules in its system
   prompt and a prompt reaches nobody with models off. Section G asserts the prompt AGREES with the
   code rather than substituting for it.

   WHAT THIS FILE DOES NOT ASSERT, and it is deliberate: that a Focus offers a menu of tactics. The
   governed option set lives at the INQUIRY grain, gated on the kernel's own `worth_testing`, and a
   Focus is a commitment rather than a question. Asked what to try, a Focus answers with what the
   record holds — the question it came from, what was already tried on that question, and what came
   of it — and does not manufacture choice the record does not support.

   Run: node scripts/focus-suggestion-audit-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
process.env.IQ_DETERMINISTIC_ONLY = '1';

const fs = require('fs');
const path = require('path');
const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, userAiProfiles, inquiryStates } = S;

let pass = 0, fail = 0;
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const C = 'fsa', NOW = Date.now(), DAY = 86400000;
_loadAllStores({
  orgMeta: { [C]: { orgName: 'Highlanders FC', orgMode: 'sports' } },
  orgUsers: { [C]: {
    coach: { id: 'coach', name: 'Dana Coach', email: 'c@fsa.io', role: 'coach', orgCode: C,
      status: 'active', leadershipNodeIds: ['n'], assignedNodeIds: ['n'], profileComplete: true },
  } },
  orgNodes: { [C]: { n: { nodeId: 'n', name: 'First Team', parentId: null, childNodeIds: [],
    memberIds: ['coach'], leaderIds: ['coach'] } } },
  /* A QUESTION THE FOCUSES CAME FROM, so "what was already tried on that question" has something
     to be about — which is the grounding findings R1 #42 asks for and the thing that makes the
     A → B loop worth anything. */
  inquiryStates: { [C]: { 'member:coach': { q1: {
    inquiryId: 'q1', subjectRef: 'member:coach', status: 'exploring',
    topic: { label: 'Late goals', canonicalConcept: 'football.late_goals' },
    hypotheses: [{ id: 'h1', statement: 'We drop too deep once ahead' }],
    leadingHypothesisId: 'h1',
    signals: [{ id: 's1' }, { id: 's2' }],
    confidence: { band: 'emerging', because: ['two accounts'] },
    stillUnknown: [], missingSignals: [],
  } } } },
  userAiProfiles: { [`${C}:coach`]: { focuses: [
    /* THE ONE BEING ASKED ABOUT — nothing recorded on it at all. */
    { id: 'foc_now', text: 'Concede fewer late goals', status: 'active', visibility: 'only_me',
      addresses: { kind: 'inquiry', id: 'q1' }, createdAt: new Date(NOW - 2 * DAY).toISOString() },
    /* AND ONE THAT WAS TRIED ON THE SAME QUESTION AND DID NOT HELP. The founder's experiment law
       lives on this: a materially identical failed tactic must not come back as new. */
    { id: 'foc_old', text: 'Put an extra defender on for the last ten', status: 'done',
      visibility: 'only_me', addresses: { kind: 'inquiry', id: 'q1' },
      outcome: { result: 'no', note: 'We tried an extra defender and still conceded.',
        recordedBy: 'coach', at: NOW - DAY },
      resolvedAt: new Date(NOW - DAY).toISOString(), createdAt: new Date(NOW - 3 * DAY).toISOString() },
  ] } },
});
_rebuildEmailIndex();

/* THE FOUNDER'S OWN QUESTION, verbatim, plus the two other ways a person asks it. */
const ASKS = [
  'Can you give me suggestions on how to win and concede less?',
  'What should we try now?',
  'What are our options here?',
];

/* Words that would mean a tactic had been invented, a winner picked, or a probability asserted.
   Deliberately about SHAPE rather than topic: "press higher" is a tactic whatever the sport. */
const RANKS = /\bbest\b|\bstrongest\b|\bmost likely\b|\brecommend(?:ed|ation)?\b|\boption 1\b|\bfirst choice\b|\btop (?:option|choice|pick)\b|\b\d{1,3}%\b|\bI would\b/i;
const INVENTED_TACTIC = /\bpress higher\b|\bdrop deeper\b|\bman[- ]mark\b|\bzonal\b|\bsubstitut/i;

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = { Authorization: `Bearer ${issueToken('coach', C, 'coach')}`, 'Content-Type': 'application/json' };
  const call = (m, u, b) => fetch(base + u, { method: m, headers: H,
    body: b === undefined ? undefined : JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const ask = async (text, about) => {
    const r = await call('POST', '/api/assistant/turn', { text, ...(about ? { about } : {}) });
    const resp = (r.j || {}).response || {};
    return { said: String(resp.responseText || ''), sources: resp.sources || [],
      props: (resp.proposedActions || []).map(p => p.actionType),
      qa: resp.qa || {}, composer: resp.composer || {} };
  };
  const focusOf = id => ((userAiProfiles[`${C}:coach`] || {}).focuses || []).find(f => f.id === id) || null;

  try {
    console.log('\n  A — ASKED FOR SUGGESTIONS WITH NOTHING TO GO ON');
    const answers = [];
    for (const q of ASKS) answers.push(await ask(q, { kind: 'focus', id: 'foc_now' }));
    ok('FS-A1 every way of asking is answered', answers.every(a => a.said.length > 20));
    /* AND THEY AGREE. THE DEFECT: "What are our options here?" matched the group lens, which for
       this lens appends a closing line whatever it found — so a coach standing INSIDE a Focus got
       that one sentence and nothing else, while "What should we try now?" on the same screen a
       moment earlier returned the focus, the question it came from, and the attempt that had
       already failed. Same question, same object, two different products. The branch tested that
       the group answer was non-empty; it now asks whether the group answer found a group. */
    ok('FS-A1b …and the three phrasings give the same grounded answer, not one grounded and one empty',
      new Set(answers.map(a => a.said.trim())).size === 1);
    /* THE ONE THAT MATTERS. A product that wants to feel helpful invents a tactic here, and there
       is nothing in this record that supports one. */
    ok('FS-A2 …and none of them invents a tactic the record does not hold',
      answers.every(a => !INVENTED_TACTIC.test(a.said)));
    ok('FS-A3 …ranks anything, scores anything, or names a winner',
      answers.every(a => !RANKS.test(a.said)));
    /* AND SAYS WHAT IS MISSING. "Say what is missing rather than inventing tactical advice" is the
       founder's own wording, and an answer that invents nothing AND says nothing is only half of
       it — a person is entitled to know why they got no suggestion. */
    ok('FS-A4 …while saying what the record does not hold',
      answers.every(a => /nothing has been recorded|not enough|do not have|don.t have/i.test(a.said)));
    /* AND NAMES THE QUESTION IT CAME FROM, which is the grounding #42 asks for: a Focus is not a
       free-standing wish, it is something started from something. */
    /* NAMED AS THE QUESTION IT CAME FROM, not merely containing the words. The first version of
       this matched /Late goals/i — and the focus is called "Concede fewer late goals", so the
       assertion was satisfied by the title it was meant to look past, and a mutation that stopped
       the read naming its origin at all survived it. */
    ok('FS-A5 …and names the question this focus was started from',
      answers.some(a => /You started it from the question "Late goals"/.test(a.said)));

    console.log('\n  B — AND CARRIES WHAT WAS ALREADY TRIED ON THAT QUESTION');
    /* THE FOUNDER'S EXPERIMENT LAW. A materially identical failed tactic must not be resurfaced as
       new; what the record actually holds is that it was tried and did not help, and that is what
       a person needs before deciding anything. */
    const withTried = answers.find(a => /already tried/i.test(a.said)) || answers[0];
    ok('FS-B1 an earlier attempt on the same question is named',
      /already tried/i.test(withTried.said) && /extra defender/i.test(withTried.said));
    ok('FS-B2 …with the outcome that was recorded for it',
      /did not help|didn.t help/i.test(withTried.said));
    /* AND NOT AS A SUGGESTION. The difference between "this was tried and did not help" and "try
       this" is the whole of the law, and it is a difference in the sentence. */
    ok('FS-B3 …and never re-offered as something to try',
      !/you could try an extra defender|try putting an extra defender|worth trying an extra/i.test(withTried.said));
    /* AND A SEQUENCE IS NOT A CAUSE. What was recorded after an attempt is not proof the attempt
       caused it, and the limitation travels with the answer rather than being left to phrasing. */
    ok('FS-B4 …and the answer says a recorded outcome is not proof the attempt caused it',
      (withTried.qa.limitations || []).some(l => /not proof that attempt caused it|not proof the focus caused it/i.test(String(l))));

    console.log('\n  C — A SECOND FAILED ATTEMPT DOES NOT BECOME A THIRD SUGGESTION');
    /* MULTIPLE ATTEMPTS, the founder's third named case. The point at which another variation is
       the wrong next move is the point the product must be able to reach. */
    (userAiProfiles[`${C}:coach`].focuses).push({
      id: 'foc_old2', text: 'Change the keeper distribution in the last ten', status: 'done',
      visibility: 'only_me', addresses: { kind: 'inquiry', id: 'q1' },
      outcome: { result: 'no', note: 'Kept it short and still conceded.', recordedBy: 'coach', at: NOW - 2 * 3600000 },
      resolvedAt: new Date(NOW - 2 * 3600000).toISOString(), createdAt: new Date(NOW - 2 * DAY).toISOString(),
    });
    const after = await ask('What should we try now?', { kind: 'focus', id: 'foc_now' });
    ok('FS-C1 both attempts are carried, not just the most recent',
      /extra defender/i.test(after.said) && /keeper distribution/i.test(after.said));
    ok('FS-C2 …and neither is dressed up as a fresh idea', !INVENTED_TACTIC.test(after.said));
    ok('FS-C3 …and nothing is ranked or recommended', !RANKS.test(after.said));

    console.log('\n  D — A FIGURE THEY TYPED IS THEIRS, AND IT IS NOT EVIDENCE');
    /* THE FOUNDER'S FOURTH CASE, and the one that already has its own suite — asserted here as
       part of the suggestion path, because the dangerous move is reasoning from a reported figure
       INTO a tactic. */
    const told = await ask('We have conceded in the last ten minutes in 6 of 11 games. What should we try?',
      { kind: 'focus', id: 'foc_now' });
    ok('FS-D1 the figure they typed is not denied',
      !/not in anything|cannot use numbers|have not received/i.test(told.said));
    ok('FS-D2 …and no tactic is derived from it', !INVENTED_TACTIC.test(told.said));
    ok('FS-D3 …and no cause is asserted from it',
      !/because of|caused by|due to (?:their|our) /i.test(told.said));

    console.log('\n  E — AND NOTHING IMPLIES OUTSIDE READING THAT DID NOT HAPPEN');
    /* THE FIFTH CASE. External knowledge may inform an option and must be clearly sourced; what it
       must never do is arrive unsourced, which on this deployment means not arriving at all. */
    const all = [...answers, after, told];
    ok('FS-E1 no answer claims to have read anything outside',
      all.every(a => !/i read|i looked up|according to|research (?:shows|suggests)|studies\b/i.test(a.said)));
    ok('FS-E2 …and none cites a web source or offers a link',
      all.every(a => (a.sources || []).every(s => s.kind !== 'web' && !s.url)));

    console.log('\n  F — AND ASKING FOR SUGGESTIONS WRITES NOTHING');
    /* NO OPTION MAY AUTO-CREATE OR AUTO-REVISE A FOCUS. Asked six times, in three phrasings, with
       figures and without: the record is exactly as it was. */
    ok('FS-F1 no focus was created by asking',
      ((userAiProfiles[`${C}:coach`] || {}).focuses || []).length === 3);
    ok('FS-F2 …and the focus being asked about is untouched',
      !!focusOf('foc_now') && focusOf('foc_now').status === 'active' && !focusOf('foc_now').outcome);
    ok('FS-F3 …and nothing was proposed that would write without a confirmation',
      all.every(a => a.props.every(p => p !== 'update_focus' || false)));
    /* AND THE QUESTION ITSELF IS UNTOUCHED — asking what to try is not contributing to the record
       of what is happening. */
    ok('FS-F4 …and the question it came from gained no signals',
      (((inquiryStates[C] || {})['member:coach'] || {}).q1 || {}).signals.length === 2);

    console.log('\n  G — AND THE PROMPT AGREES WITH THE CODE RATHER THAN REPLACING IT');
    /* EVERY ASSERTION ABOVE RAN WITH MODELS OFF, which is the pilot's own configuration and the
       only configuration in which the deterministic path is the whole product. The prompt carries
       the same policy for the turns a model writes; it is asserted to AGREE, and said plainly to
       be the second half rather than the implementation. */
    const composer = fs.readFileSync(path.join(__dirname, '..', 'ai', 'composer.js'), 'utf8');
    ok('FS-G1 the model is told to compare prior attempts and their outcomes before suggesting a move',
      /compare their substance and recorded/i.test(composer));
    ok('FS-G2 …and not to repackage a materially identical unsuccessful tactic as new',
      /Do not repackage a materially identical unsuccessful/i.test(composer));
    ok('FS-G3 …and that a sequence is not proof of cause',
      /A sequence is\s*\n?\s*not proof of cause/i.test(composer.replace(/',\s*\n\s*'/g, ' ')));
    ok('FS-G4 …and to say when it has no reason for another variation',
      /poor information value/i.test(composer));
    ok('FS-G5 …and that an option set is offered only when enough is known',
      /offer a small option set when enough is known/i.test(composer));

  } catch (e) { fail++; console.error('  FAIL focus-suggestion audit threw:', e && e.stack); }

  server.close();
  console.log(`\nfocus-suggestion-audit-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
