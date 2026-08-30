/* Truth layer — THE CURIOSITY STOPPING RULE, WIRED (HTTP). D35, Lane C.

   `curiosity-stopping-smoke.js` proves the kernel functions in ai/diagnose.js are correct.
   It does NOT prove they are called. Every one of Lane C's call sites in server.js could be
   deleted and that suite stayed green — the same defect class that let the polarity vocabulary
   exist five times. This suite pins the WIRING, and only the wiring:

     • the kernel's chosen question is what reaches the model (never a raw frontier scan)
     • once the per-conversation cap is spent, the model is never handed another question
     • a question already asked is not handed over again inside the cooling window
     • what the person says back is fed to the kernel, so a refusal is recorded as a refusal
     • the intake path cannot open more than the per-conversation cap of first-class inquiries,
       however many turns it is given

   The organisational path is deliberately untouched: /api/inquiry/pending has its own stopping
   rule (a value gate, a health guard, a dismissal cooldown, maxAsks) and D35 does not govern it.
   `inquiry-http-smoke` asserts that behaviour and is the guard against this rule leaking into it.

   Run: node scripts/curiosity-stopping-wired-http-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
process.env.IQ_COMPOSER = '1';        // the composer and the ears only run when it is on

const gateway  = require('../ai/gateway.js');
const diagnose = require('../ai/diagnose.js');

// The model is stubbed, not called. What we assert on is the CONTEXT the wiring hands it —
// that is where the kernel's decision becomes visible, and it is the same string the real
// model would have received.
const contexts = [];
let nextProposals = null;
gateway.enabled = () => true;
gateway.complete = async ({ user }) => { contexts.push(String(user || '')); return 'Understood. Thanks for telling me.'; };
gateway.completeJSON = async () => nextProposals;

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, inquiryStates, assistantConversations } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

const C = 'cur';
_loadAllStores({
  orgMeta:  { [C]: { orgName: 'Demo Athletic Club', orgMode: 'sports' } },
  orgUsers: { [C]: { maya: { id: 'maya', name: 'Maya Chen', role: 'member', orgCode: C, status: 'active' } } },
});
_rebuildEmailIndex();

// Two open unknowns, so "the second turn asks something else" is distinguishable from
// "the second turn asks nothing". Both are frontier candidates the kernel may choose from.
const NEED_A = 'What changed around your sleep in that period?';
const NEED_B = 'What does the load look like on the days it happens?';
const seedInquiry = (id, concept, label, question) => {
  const inq = diagnose.applyProposals(
    diagnose.newInquiry({ id, subjectRef: 'member:maya', concept, label }),
    diagnose.groundProposals([
      { id: `${id}-o1`, level: 'observation', text: `${label} is inconsistent under pressure`,
        sourceSpan: 'it slips when it gets busy', source: 'self', directness: 'direct', specificity: 0.8 },
      { id: `${id}-h1`, level: 'hypothesis', text: `${label} is the visible half of something else`, basis: [`${id}-o1`] },
    ], { utterance: 'it slips when it gets busy', turnId: `${id}-t` }).accepted);
  inq.missingSignals = [{ question, resolves: `${concept} cause` }];   // the open frontier this inquiry carries
  return inq;
};

const NEED_BLOCK = 'THE MOST USEFUL THING TO LEARN NEXT';
const needQuestionIn = (ctx) => {
  const m = /What is missing: (.+)/.exec(ctx || '');
  return m ? m[1].trim() : null;
};

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = { Authorization: `Bearer ${issueToken('maya', C, 'member')}`, 'Content-Type': 'application/json' };
  const turn = (text, conversationId) => fetch(base + '/api/assistant/turn', {
    method: 'POST', headers: H, body: JSON.stringify({ text, conversationId }) }).then(r => r.json());
  const settle = () => new Promise(r => setTimeout(r, 120));   // the ears run unawaited, after the reply

  try {
    inquiryStates[C] = { 'member:maya': {
      'sleep':  seedInquiry('iq-sleep', 'sleep',  'Sleep',  NEED_A),
      'load':   seedInquiry('iq-load',  'load',   'Load',   NEED_B),
    } };

    /* W1 — the kernel picks the question and the wiring carries it. Before Lane C the composer
       flat-mapped the frontier itself; a question still reached the model, so "a question was
       asked" proves nothing. What proves the wiring is that the question is one the KERNEL is
       tracking — it must be recorded on the conversation, not merely rendered once.
       W1 itself is deliberately NOT load-bearing: unwiring the kernel entirely leaves it green,
       because the old raw frontier scan also produced a question. W1b is the one that bites. */
    const t1 = await turn('My touch keeps getting away from me when the session gets busy', undefined);
    const cid = t1.conversationId;
    const ctx1 = contexts[contexts.length - 1] || '';
    const q1 = needQuestionIn(ctx1);
    ok('W1 the kernel chooses the question and the wiring hands it to the model',
      ctx1.includes(NEED_BLOCK) && (q1 === NEED_A || q1 === NEED_B));

    const conv = () => (assistantConversations[`${C}:maya`] || []).find(c => c && c.id === cid) || {};
    ok('W1b …and the kernel is told it was asked, rather than the question being fired and forgotten',
      ((conv().curiosity || {}).asked || []).length === 1);

    /* W2 — what the person says back reaches the kernel on the very next turn. Without this
       call the rule can count questions but can never learn that one was refused, and "no"
       means nothing. The refusal is answered here, while the question it refuses is the last
       one asked — which is the only moment the wiring has to catch it. */
    await turn('No, I would rather not discuss that', cid);
    const declined = ((conv().curiosity || {}).declined || []);
    ok('W2 a refusal is fed back to the kernel and recorded against the question it refused',
      declined.length === 1);

    /* W3 — and the refused question does not come back. The second unknown may be raised;
       the one that was declined may not. */
    const q2 = needQuestionIn(contexts[contexts.length - 1] || '');
    ok('W3 a question already asked is not handed to the model again', q2 === null || q2 !== q1);

    /* W4 — the hard cap. Two unknowns exist and three questions are permitted, so what stops
       the last turn is the cap rather than an empty frontier: whatever is still unanswered,
       the conversation stops asking. This is the assertion the whole rule exists for. */
    await turn('Still the same story at the weekend fixture as well, honestly', cid);
    await turn('And once more this morning during the warm up before anything else', cid);
    await turn('One more time at the end of the session, same as every other day', cid);
    const ctxLast = contexts[contexts.length - 1] || '';
    ok('W4 once the cap is spent the model is never handed another question',
      !ctxLast.includes(NEED_BLOCK) && ((conv().curiosity || {}).asked || []).length <= diagnose.CONVERSATION_QUESTION_CAP);

    /* W5 — the intake cap, end to end. The ears are given a genuinely new concept on every
       turn; the conversation may still only open the capped number of first-class inquiries.
       Twenty routine turns on one subject must not leave twenty inquiries behind. */
    inquiryStates[C] = { 'member:maya': {} };
    const c2 = (await turn('Kicking things off here with something worth understanding properly', undefined)).conversationId;
    await settle();
    for (let i = 0; i < 8; i++) {
      // The model argues explicitly for a NEW line every time. Without the stated claim the
      // identity resolver holds the evidence anyway, and the cap would never be reached —
      // which would make this assertion pass without proving anything.
      nextProposals = { worthInquiry: true,
        concepts: [{ concept: `topic-${i}`, relationship: 'NEW', reason: 'a distinct phenomenon' }],
        proposals: [
          { id: `p${i}`, level: 'observation', domainConcept: `topic-${i}`,
            text: `something specific is happening around topic ${i}`,
            sourceSpan: 'this keeps happening to me', source: 'self', directness: 'direct', specificity: 0.8 },
        ] };
      await turn(`Another thing entirely, number ${i}: this keeps happening to me`, c2);
      await settle();
    }
    nextProposals = null;
    const built = Object.keys((inquiryStates[C] || {})['member:maya'] || {}).length;
    ok('W5 eight new concepts in one conversation cannot open more than the inquiry cap',
      built > 0 && built <= diagnose.CONVERSATION_NEW_INQUIRY_CAP);

  } catch (e) { fail++; console.error('  FAIL suite threw:', e && e.stack); }

  server.close();
  console.log(`\ncuriosity-stopping-wired-http-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
