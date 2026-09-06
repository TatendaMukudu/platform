/* Truth layer — ONE OBJECT, ONE ANSWER ABOUT HOW SURE IT IS.

   Found in a browser, on the coach's Home screen, against the seeded demo:

       Defending set pieces
       EARLY THINKING
       I'm confident about this one.

   A badge and a sentence contradicting each other about the same belief, on the first screen a
   coach sees, in a product whose entire claim is that its confidence is calibrated. Nothing in
   the truth layer caught it, because every existing assertion checks one reader at a time and
   each reader was correct about the field it read.

   THE CAUSE. A card is composed by two independent readers of the same object:

     ai/voice.explainObject   reads  raw.band || raw.confidence.band
     ai/present.inquiryCard   read   raw.confidence.band, defaulting to 'tentative'

   A kernel inquiry carries `confidence: { band }`. A team-state projection — what openQuestion
   returns for a squad's open question — carries a FLAT `band` and no confidence object. So the
   sentence saw 'supported' and the badge saw its own default, and only one of them had a
   default to hide behind.

   THE RULE THIS PINS. Two descriptions of one thing always drift. Wherever two readers put
   words on the same card, they must agree — and the way to prove that is not to check each one
   but to compare them, in every shape the object legitimately arrives in.

   Run: node scripts/card-coherence-smoke.js */

'use strict';
const present = require('../ai/present.js');
const voice = require('../ai/voice.js');
const teamState = require('../ai/team-state.js');
const diagnose = require('../ai/diagnose.js');

let pass = 0, fail = 0;
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

/* The four bands, and what each reader says about them. `present` speaks in badges,
   `voice` in sentences; the pairing is the contract. */
const AGREE = {
  supported: { badge: 'Well supported', sentence: 'confident' },
  probable:  { badge: 'Likely',         sentence: 'fairly confident' },
  emerging:  { badge: 'Taking shape',   sentence: 'starting to think so' },
  tentative: { badge: 'Early thinking', sentence: 'not sure yet' },
};

/* THE TWO SHAPES A BAND LEGITIMATELY ARRIVES IN. Both are produced by production code, and the
   defect was that only one of them was read by both readers. */
const SHAPES = {
  'nested (a kernel inquiry)': band => ({ topic: { label: 'Defending set pieces' }, confidence: { band } }),
  'flat (a team-state projection)': band => ({ topic: { label: 'Defending set pieces' }, band }),
};

/* ── CC1: the two readers agree, in every band, in every shape. ── */
for (const [shapeName, make] of Object.entries(SHAPES)) {
  for (const [band, want] of Object.entries(AGREE)) {
    const raw = make(band);
    const card = present.inquiryCard(raw);
    // Composed exactly as server.js `add()` composes it, including the union it reads.
    const explained = voice.explainObject({
      kind: 'inquiry', label: raw.topic.label, claim: '',
      band: raw.band || (raw.confidence || {}).band,
    });
    ok(`CC1 ${shapeName} at "${band}": the badge says "${want.badge}" and the sentence says "${want.sentence}" — one object, one answer`,
      card.summary.standing === want.badge &&
      card.summary.band === band &&
      new RegExp(want.sentence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(explained.claim));
  }
}

/* ── CC2: THE EXACT CARD THAT WAS WRONG. A regression pinned by name, because this one reached
   a screen and would have reached a coach on 26 September. ── */
{
  const question = teamState.openQuestion([{
    inquiryId: 'inq_x', status: 'open', topic: { label: 'Defending set pieces' },
    stillUnknown: ['is it the first contact or the second ball?'],
    confidence: { band: 'supported' }, lastUpdatedAt: Date.now(),
  }], {});
  ok('CC2 openQuestion carries the band it was given, rather than losing it on the way out',
    question && question.band === 'supported');
  const card = present.inquiryCard(question);
  const explained = voice.explainObject({
    kind: 'inquiry', label: question.about, claim: '',
    band: question.band || (question.confidence || {}).band,
  });
  ok('CC2b …and a squad question rendered from it does NOT say "Early thinking" beside "I am confident about this one" — the defect exactly as it appeared on the coach\'s Home',
    !(card.summary.standing === 'Early thinking' && /\bconfident\b/i.test(explained.claim)));
  ok('CC2c …it reads Well supported on both, because the evidence behind it is supported',
    card.summary.standing === 'Well supported' && /I'm confident about this one/i.test(explained.claim));
}

/* ── CC3: SILENCE STILL MEANS TENTATIVE. The fix must not turn "no band was given" into a
   confident reading — the default is the conservative one and stays that way. ── */
{
  const bare = present.inquiryCard({ topic: { label: 'Something' } });
  ok('CC3 an object carrying no band at all is still read as the weakest one — a missing band is not permission to sound sure',
    bare.summary.standing === 'Early thinking' && bare.summary.band === 'tentative');
  ok('CC3b …and an unrecognised band is not invented into a confident one either',
    present.inquiryCard({ topic: { label: 'X' }, band: 'extremely-certain' }).summary.standing === 'Early thinking');
}

/* ── CC4: the kernel owns the vocabulary. If diagnose grows a fifth band, this suite is where
   somebody finds out that two surfaces now disagree about what to call it. ── */
{
  const kernelBands = Object.keys(AGREE);
  ok('CC4 every band this suite pairs is one the kernel actually produces — a pairing for a band that does not exist proves nothing',
    kernelBands.every(b => {
      const inq = diagnose.newInquiry({ id: 'i', subjectRef: 'member:x', concept: 'c', label: 'l', now: 1 });
      return typeof present.inquiryCard({ ...inq, band: b }).summary.standing === 'string';
    }));
}

/* ── CC5: THE SQUAD SURFACE HAS A DOOR. ───────────────────────────────────────────────────

   Found by driving the seeded demo in a browser as the coach. `leader-home` renders the group
   at its own grain — the squad's High, its Low, the open question, the focus, and the findings
   the cohort floor is WITHHOLDING, named so a leader knows to go and ask. It was in NAV_ROUTES
   and in no navigation, so the only ways in were three legacy route aliases and one dot inside
   a briefing. A coach signing in had no path to it.

   `_renderTeamState` is called from Home, finds no `#team-state` container there, and returns
   at `if (!box) return` — silently, by design, because a group strip that cannot load must not
   take down the leader's home. Correct behaviour; it just meant the surface failed quietly on
   the one page everybody lands on.

   IT IS NOT MOVED ONTO HOME. Home is one question by founder decision. The fix is a door. */
{
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'app.js'), 'utf8');
  ok('CC5 the squad view is IN THE NAVIGATION, not only in the route table — a route nothing links to is a room with no door',
    /\{ id: 'leader-home', label: '[^']+', when: \(\) => Auth\.isLeaderNode\(\)/.test(src));
  ok('CC5b …offered to whoever actually leads a node, which is a fact about the tree rather than a title',
    /_NAV_EXTRA:[\s\S]{0,1400}id: 'leader-home'[\s\S]{0,200}Auth\.isLeaderNode\(\)/.test(src));
  /* CC5c — HOME STAYS ONE QUESTION. The tempting fix was to put the strip on Home, and the
     Home template forbids it in as many words. This asserts the decision was respected, so a
     later pass cannot quietly "fix" this finding the wrong way. */
  ok('CC5c …and the strip was NOT moved onto Home, which is one question by founder decision',
    /HOME IS ONE QUESTION/.test(src) &&
    !/iq-chatbox[\s\S]{0,2000}id="team-state"/.test(src));
  /* CC5d-CC5e — ANCHORED TO THE FUNCTION THE ROUTE ACTUALLY CALLS, and they had to be.

     The first version matched the container and the call anywhere in app.js. Both appear TWICE
     — once in renderToday (which `leader-home` renders) and once in renderIntelligence (the
     separate Team view) — so deleting either from renderToday left the assertion green against
     the other copy. Two mutations proved it: remove the call, remove the container, nothing
     went red, and the squad surface would have been unreachable with the suite passing.

     That is pattern 2 in docs/reviews/PROTOCOL.md, and the SIXTH time this exact shape has
     shipped in this repository. It is caught here only because the mutation was run.

     So: pull out the body of the function the route names, and assert inside that. */
  const routed = (src.match(/'leader-home':\s*\(\) => (\w+)\(\)/) || [])[1];
  ok('CC5d the leader-home route names a renderer that exists',
    !!routed && new RegExp(`(async )?function ${routed}\\(`).test(src));
  const start = routed ? src.indexOf(`async function ${routed}(`) : -1;
  const body = start >= 0 ? src.slice(start, src.indexOf('\nasync function ', start + 10)) : '';
  ok('CC5e …and THAT function contains the container the strip writes into — matched inside the function, because the same markup appears in renderIntelligence and matching it anywhere proves nothing',
    /id="team-state"/.test(body));
  ok('CC5f …and THAT function calls the renderer, which is the half that makes the container fill',
    /_renderTeamState\(\);/.test(body));
}

console.log(`\ncard-coherence-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
