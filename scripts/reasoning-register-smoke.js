/* Truth layer — TWO-REGISTER GOVERNED REASONING (pure). Proves the classifier separates
   org-fact / world-knowledge / mixed / planning questions, and that the assembler enforces
   CITE-OR-ASK in code: an org_data claim with no authorised citation is DEMOTED to a
   question (never asserted), general knowledge is kept but labelled, and a user's unverified
   assertion becomes a confirmation-gated capture rather than a fact. Run: node scripts/reasoning-register-smoke.js */

const R = require('../ai/reasoning-register.js');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

/* 1 — the classifier routes each register correctly */
ok('1 · "how is my team doing?" → org_fact', R.classifyRegister('how is my team doing?').register === 'org_fact');
ok('1 · "why is a 4-3-3 better than a 5-3-2?" → world_knowledge', R.classifyRegister('why is a 4-3-3 better than a 5-3-2?').register === 'world_knowledge');
ok('1 · "given how we are doing, should we switch to a back four?" → mixed', R.classifyRegister('given how we are doing, should we switch to a back four?').register === 'mixed');
ok('1 · "help me build a training session" → planning', R.classifyRegister('help me build a training session').register === 'planning');
ok('1 · "help me plan a session for my squad" → mixed (org + planning)', R.classifyRegister('help me plan a session for my squad').register === 'mixed');
ok('1 · "what is the offside rule?" → world_knowledge', R.classifyRegister('what is the offside rule?').register === 'world_knowledge');
ok('1 · "what is outstanding?" → org_fact (status, not general)', R.classifyRegister("what's outstanding?").register === 'org_fact');

/* 2 — wantsReasoning: only org_fact stays purely deterministic */
ok('2 · org_fact does not need the reasoning edge', R.wantsReasoning('org_fact') === false);
ok('2 · world_knowledge / mixed / planning do', R.wantsReasoning('world_knowledge') && R.wantsReasoning('mixed') && R.wantsReasoning('planning'));

/* 3 — CITE-OR-ASK: an org_data claim with a valid citation is kept; one without is demoted */
const a = R.assembleGoverned({
  claims: [
    { text: 'A 4-3-3 presses higher and holds width better.', provenance: 'general', confidence: 'high' },
    { text: 'Tomas has been pulling back defensively.', provenance: 'org_data', evidenceRefs: ['ev1'] },
    { text: 'Your whole back line is out of form.', provenance: 'org_data', evidenceRefs: ['ev_missing'] },
  ],
  allowedRefs: ['ev1'],
});
ok('3 · a cited org_data claim is kept as grounded', a.grounded.length === 1 && a.grounded[0].evidenceRefs.includes('ev1'));
ok('3 · an UNCITED org_data claim is NOT asserted (demoted to a question)', a.grounded.every(g => !/whole back line/.test(g.text)) && a.asks.some(x => /back line/i.test(x)));
ok('3 · general knowledge is kept but labelled general', a.general.length === 1 && a.provenance.some(p => p.tag === 'general'));
ok('3 · the composed answer separates general reasoning from "your recorded signals"', /press(es)? higher/i.test(a.answer) && /from your recorded signals/i.test(a.answer));
ok('3 · confidence is medium when there is a grounded, cited claim', a.confidence === 'medium');

/* 4 — a user's unverified assertion becomes a CAPTURE proposal, never a fact */
const b = R.assembleGoverned({
  claims: [{ text: 'Jimmy cannot defend in a back four.', provenance: 'user_input' }],
  allowedRefs: [],
});
ok('4 · user_input is never asserted as an org fact', b.grounded.length === 0);
ok('4 · …it is returned as a confirmation-gated capture proposal', b.captureProposals.some(p => /jimmy/i.test(p.text)));

/* 5 — an untagged claim about the org is treated as a question, not smuggled in as fact */
const c = R.assembleGoverned({ claims: [{ text: 'The team morale is collapsing.' }], allowedRefs: [] });
ok('5 · an UNTAGGED claim is never asserted (fails closed to a check)', c.grounded.length === 0 && c.asks.length >= 1);

/* 6 — general-only answers are honestly labelled "general", not a claim about the org */
const d = R.assembleGoverned({ claims: [{ text: 'A high press needs coordinated triggers.', provenance: 'general' }], allowedRefs: [] });
ok('6 · a general-only answer carries confidence "general" (not medium/high)', d.confidence === 'general');

/* 7 — the prompt + user message keep the contract explicit and bind context to refs */
ok('7 · the system prompt forbids inventing org facts', /never invent|do not guess|ONLY state an org fact/i.test(R.SYSTEM_PROMPT));
const msg = R.buildUserMessage({ question: 'should we switch?', context: [{ ref: 'ev1', text: 'Tomas pulling back' }] });
ok('7 · the user message binds each context row to a citable ref', /\[ev1\]/.test(msg) && /evidenceRefs/i.test(msg));
ok('7 · with no context it tells the model to reason generally / ask, not invent', /none/i.test(R.buildUserMessage({ question: 'x', context: [] })));

console.log(`\nreasoning-register-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
