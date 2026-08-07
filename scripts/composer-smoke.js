/* Truth layer — THE COMPOSER (pure). The flip: the model writes the reply and the
   deterministic core RETRIEVES the authorised material and VERIFIES what came back.

   These tests pin THE CAGE — the part that must hold for the flip to be safe. We cannot
   machine-check open-domain knowledge ("a 4-3-3 gives width"), and we deliberately do not try;
   that is labelled general reasoning. What we check is that no ORGANISATIONAL SPECIFIC was
   invented: a person's name, a quoted item title, or a count claimed about their records.

   Run: node scripts/composer-smoke.js */

const c = require('../ai/composer.js');

let pass = 0, fail = 0;
const ok = (n, cond) => { if (cond) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

/* ── the context block ────────────────────────────────────────────────────── */
const ctx = c.buildContext({
  name: 'Ashton Mbeki', role: 'member', domain: 'a football club', question: 'help me improve at finishing',
  beliefs: [{ text: "You've eased off a little from your own normal." }],
  evidence: [{ text: 'Missed three clear chances against Brentwood', source: 'your note' }],
  assignedWork: [{ title: 'Strength & Conditioning Benchmark', status: 'returned' }],
  priorMessages: [{ role: 'user', text: 'I keep snatching at shots' }],
  actions: [{ label: 'Start an assessment on finishing' }],
});

ok('1 · the context carries the domain (so "finishing" is read as football, not task-completion)',
  /football/i.test(ctx));
ok('1 · …the conversation so far', /snatching at shots/i.test(ctx));
ok('1 · …their own records, their beliefs, and their assigned work',
  /Brentwood/.test(ctx) && /eased off/.test(ctx) && /Strength & Conditioning/.test(ctx));
ok('1 · …the question, and the actions available this turn',
  /THEY ASKED: help me improve at finishing/.test(ctx) && /Start an assessment on finishing/.test(ctx));
ok('2 · an EMPTY bundle states the absence explicitly (so the model is told to admit it)',
  /nothing recorded yet/i.test(c.buildContext({ question: 'how is my finishing?' })));

/* A CARD IS A THREAD — a conversation opened from an observation carries what it is about, so
   it starts where the person already is instead of from a blank page. */
const fromCard = c.buildContext({
  question: "Let's talk about this: You've been pulling back",
  about: { headline: "You've been pulling back", body: 'Your participation has eased off from your own normal.' },
});
ok('2b · a thread opened from a card carries what it is about',
  /OPENED FROM SOMETHING THE SYSTEM NOTICED/.test(fromCard)
  && /You've been pulling back/.test(fromCard) && /eased off from your own normal/.test(fromCard));
ok('2b · …and is told to open the discussion rather than restate the card',
  /Start there\./.test(fromCard) && /one question that moves it forward/.test(fromCard));
ok('2b · an ordinary thread carries no card context', !/OPENED FROM SOMETHING/.test(ctx));

/* ── the cage ─────────────────────────────────────────────────────────────── */
const roster = ['Ashton Mbeki', 'Josh Marin', 'Tomas Reyes'];
const V = (reply) => c.verifyGrounding(reply, { contextText: ctx, roster, readerName: 'Ashton Mbeki' });

ok('3 · general football reasoning passes (world knowledge is NOT fact-checked here)',
  V('In general, snatching at shots comes from rushing the plant foot. Slow the last stride down.').ok);
ok('3 · grounded claims that ARE in the context pass',
  V('Your note about the three clear chances against Brentwood is the thing to work from.').ok);
ok('4 · inventing a TEAMMATE is refused',
  !V('Josh Marin has been working on the same thing — pair up with him.').ok);
ok('4 · …and the violation says what went wrong',
  /Josh Marin/.test(V('Ask Josh Marin about it.').violations.join(' ')));
ok('5 · inventing an ITEM TITLE is refused',
  !V('Your “Finishing Under Pressure Review” covers exactly this.').ok);
ok('5 · a real item title from the context is fine',
  V('Your “Strength & Conditioning Benchmark” is still open.').ok);
ok('6 · inventing a COUNT about their records is refused',
  !V('You have 12 assigned items waiting.').ok);
ok('7 · the reader may be addressed by their own name',
  V('Ashton, the plant foot is the thing to fix.').ok);
ok('8 · quoting the person\'s OWN words back is fine (they are in the conversation)',
  V('You said you “keep snatching at shots” — that is the thread to pull.').ok);

/* ── the prompt carries the rules the cage enforces ───────────────────────── */
ok('9 · the model is told never to invent org specifics',
  /Never state a fact about this person or this organisation unless it is in CONTEXT/.test(c.SYSTEM_PROMPT));
ok('9 · …to admit an empty context rather than pad it with a guess',
  /SAY SO plainly/.test(c.SYSTEM_PROMPT) && /Never pad the gap with a guess/.test(c.SYSTEM_PROMPT));
ok('9 · …to then BUILD the missing picture with one specific question',
  /ask one specific, easy question/.test(c.SYSTEM_PROMPT));
ok('9 · …to read the domain before deciding what a word means (the "finishing" failure)',
  /putting chances away, not completing tasks/.test(c.SYSTEM_PROMPT));
ok('9 · …to actually start building when asked to build, not just offer',
  /Offering is not helping/.test(c.SYSTEM_PROMPT));
ok('9 · …and to speak to the person, in house style',
  /speak TO them/i.test(c.SYSTEM_PROMPT) && /No emojis/.test(c.SYSTEM_PROMPT));
// Read on a phone: a reply nobody scrolls to the end of is not a better reply, and markdown
// markers are shown literally rather than rendered.
ok('9 · …to keep it short enough to read on a phone',
  /under 120 words/.test(c.SYSTEM_PROMPT));
ok('9 · …and to write plain prose with no markdown',
  /NO markdown/.test(c.SYSTEM_PROMPT) && /Asterisks are shown literally/.test(c.SYSTEM_PROMPT));
// A privacy-first product cannot tell someone their private note is now shared when it is not.
// Visibility only ever widens through an explicit confirmation, so the model must never claim it.
ok('9 · …and NEVER to claim it changed who can see something',
  /do NOT say it/.test(c.SYSTEM_PROMPT) && /only ever widens through an explicit confirmation/.test(c.SYSTEM_PROMPT));

/* ── the honest degrade never fabricates ──────────────────────────────────── */
ok('10 · with nothing recorded it says so and asks for what would build the picture',
  /don't have anything recorded about your finishing/i.test(c.degradeLine('finishing'))
  && /won't guess/i.test(c.degradeLine('finishing')));

console.log(`\ncomposer-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
