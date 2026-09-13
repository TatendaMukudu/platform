/* Truth layer — THE KERNEL DOES NOT KNOW WHAT SPORT IS.

   DESIGN LAW, from ai/packs.js and from the founder: "No provider, industry, role or workflow
   gets hard-coded into the kernel when it can be expressed as a universal primitive, capability
   or configurable domain definition. Vocabulary lives in packs; intelligence lives in the kernel."

   The packs layer holds that line well. Two places on the other side of it did not, and both
   decided something a person sees.

   ── ONE — WHAT SURFACES FIRST ─────────────────────────────────────────────────────────────────
   `ai/org-state.js`, in the one function that turns state into the uncertainties a person is
   shown, held two numbers keyed to football:

       const priority = ev && ev.type === 'match' ? 0.8 : 0.5;
       const leadDays = /kickoff|availability|game_plan/.test(req.claimType) ? 2 : 1;

   Driven at cdf2a79 through the UNIVERSAL pack — an organisation that declares no `match` event
   type at all — the identical situation (one occasion in three days, 22 people depending on it,
   one thing unknown) scored 0.710 as a `deadline` and 0.770 as a `match`. So a school's exam and
   a business's launch could not reach the band a fixture reached, and any organisation could
   raise its own scores by choosing a football word.

   The second line was not merely domain-specific, it was WRONG: the sports pack itself declares
   `kickoff_time.leadDays: 1`, and the regex overrode its own pack with 2. A declaration nothing
   reads is not a declaration. Honouring it moves a sports kickoff from `high` urgency to
   `medium` at three days out — a behaviour change, and it is the fix rather than a regression,
   because 1 is the number the pack states.

   ── TWO — WHAT AN OCCASION IS CALLED ──────────────────────────────────────────────────────────
   `ai/org-context.js` turned a sentence into an event proposal with a hard-coded noun:

       const type = /match|fixture|game|final|plays?/ ? 'match' : ... : 'default';
       const title = /first team/i.test(raw) ? 'First Team ' + type : capitalise(type);

   Driven: a business typing "The product launch is on Friday at 3pm" was shown an event titled
   "Default" — a machine word, in the one sentence a person reads before confirming — and a school
   typing "we play Saturday" was handed an event called `match`. "First team", a football phrase,
   was spliced into titles for every organisation.

   THE FIX IS THE EXISTING BOUNDARY, USED. The kernel decides a universal KIND — performance,
   preparation, gathering, milestone, four shapes of occasion every organisation has — and the
   org's own resolved vocabulary supplies the word. The title echoes the noun the person actually
   used, because a pack word is the right answer only when they named no occasion at all.

   Run: node scripts/org-ontology-neutrality-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S     = require('../server.js');
const OS    = require('../ai/org-state.js');
const OC    = require('../ai/org-context.js');
const packs = require('../ai/packs.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
/* A THROW IS A FAILURE, NOT A SILENT EXIT — PROTOCOL lie #8. */
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

/* FOUR ORGANISATIONS, ONE PRODUCT. Each is a real tenant with a real leader, because the
   extraction assertions go through the HTTP route, and the route reads the vocabulary from the
   organisation the session belongs to. */
const ORGS = {
  club:   { mode: 'sports',    name: 'Riverside Club' },
  school: { mode: 'education', name: 'Northgate School' },
  firm:   { mode: 'business',  name: 'Meridian Partners' },
  plain:  { mode: '',          name: 'An Organisation' },   // no mode at all -> universal
};
const users = {}, meta = {};
for (const [code, o] of Object.entries(ORGS)) {
  meta[code]  = { orgName: o.name, orgMode: o.mode };
  users[code] = { boss: { id: 'boss', name: 'Lead', email: `b@${code}.io`, role: 'superadmin', orgCode: code, status: 'active' } };
}
_loadAllStores({ orgMeta: meta, orgUsers: users, orgNodes: Object.fromEntries(Object.keys(ORGS).map(c => [c, {}])) });
_rebuildEmailIndex();

const now = Date.UTC(2026, 0, 10);
const DAY = 86400000;

/* THE SAME SITUATION, EVERY TIME. One occasion three days out, 22 people depending on it, one
   required thing unknown. Only the event's type and the claim's name change, which is the whole
   point: if the answer moves, the kernel moved it on a word. */
const situation = (pack, evType, claimType) => ({
  now,
  organisation: { id: 'o', pack },
  events: [{ id: 'e1', type: evType, title: 'The Occasion', startAt: new Date(now + 3 * DAY).toISOString(), participants: 22 }],
  requirements: [{ id: 'e1:r1', claimType, expectedOwner: 'u1', ownerBasis: 'direct_owner',
    sensitivity: 'team-shared', consequenceIfAbsent: 'people will not know', provenance: {} }],
  claimStates: [{ requirementId: 'e1:r1', claimType, state: 'missing', neededBy: null }],
});
const scoreOf = (pack, evType, claimType) => {
  const u = OS.stateToUncertainties(situation(pack, evType, claimType))[0];
  return u ? { score: u.impactBasis.score, impact: u.impact, urgency: u.urgency } : null;
};

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const preview = (text, code) => fetch(base + '/api/org-context/preview', {
    method: 'POST',
    headers: { Authorization: `Bearer ${issueToken('boss', code, 'superadmin')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  }).then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const eventOf = async (text, code) => {
    const r = await preview(text, code);
    return ((r.j || {}).proposals || []).find(p => p.type === 'event') || null;
  };

  try {
    console.log('\n  A — A FOOTBALL WORD MEANS NOTHING TO AN ORGANISATION THAT DID NOT DECLARE IT');
    /* The universal pack declares meeting, deadline and default. It has never had a `match`.
       Before the fix, naming an event `match` still paid, because the kernel held the noun. */
    const uDeadline = scoreOf('universal', 'deadline', 'completion_status');
    const uMatch    = scoreOf('universal', 'match',    'completion_status');
    const uMeeting  = scoreOf('universal', 'meeting',  'meeting_time');
    ok('ON-A1 an undeclared event type earns no advantage in the universal pack (was 0.770 vs 0.710)',
      uMatch.score === uMeeting.score);
    ok('ON-A2 …and specifically does not beat the pack\'s own most serious occasion',
      uDeadline.score > uMatch.score);
    ok('ON-A3 …which is the number the pack declares, not one the engine kept for itself',
      OS.PACKS.universal.events.deadline.priority === 0.65
      && OS.PACKS.universal.events.match === undefined);

    console.log('\n  B — AND THE SPORTS PACK STILL GETS EVERYTHING IT DECLARED');
    /* THE OTHER HALF. A change that flattened every pack to one number would pass section A and
       be a worse product: a fixture really is the occasion a club is organised around. */
    const sMatch    = scoreOf('sports', 'match',    'kickoff_time');
    const sTraining = scoreOf('sports', 'training', 'session_time');
    ok('ON-B1 a match still outranks a training session inside the pack that says so',
      sMatch.score > sTraining.score);
    ok('ON-B2 …by exactly the amount the pack declares, which is where 0.8 now lives',
      OS.PACKS.sports.events.match.priority === 0.8
      && OS.PACKS.sports.events.training.priority === 0.5);
    ok('ON-B3 …and the same situation scores identically across packs once priority matches',
      Math.abs(sTraining.score - uMeeting.score) < 1e-9);

    console.log('\n  C — A DECLARATION NOTHING READS IS NOT A DECLARATION');
    /* The sports pack states three different lead times and the kernel replaced all three with a
       blanket 2 from a regex. The declaration is now what decides, which is checkable directly:
       two claims on the SAME event, whose only difference is the lead time their pack gives them. */
    ok('ON-C1 the sports pack really does declare different lead times for these two claims',
      OS.PACKS.sports.requirements.kickoff_time.leadDays === 1
      && OS.PACKS.sports.requirements.game_plan.leadDays === 2);
    const kickoff = scoreOf('sports', 'match', 'kickoff_time');
    const plan    = scoreOf('sports', 'match', 'game_plan');
    ok('ON-C2 …and two claims on the SAME event now differ in urgency because of it',
      plan.urgency !== kickoff.urgency);
    ok('ON-C3 …the longer lead time being the more urgent one, which is what a lead time means',
      plan.urgency === 'high' && kickoff.urgency === 'medium');
    /* AND AN UNDECLARED CLAIM FALLS BACK TO THE EVENT, THEN TO ONE DAY — never to a football
       regex that happened to be in scope. */
    const unknown = scoreOf('sports', 'match', 'some_claim_nobody_declared');
    ok('ON-C4 …while a claim the pack never mentions falls back to the event\'s own lead time',
      unknown.urgency === plan.urgency);

    console.log('\n  D — AN OCCASION IS CALLED WHAT THE ORGANISATION CALLS IT (HTTP)');
    const clubPlay   = await eventOf('Our first team plays Saturday at 3pm.', 'club');
    const schoolPlay = await eventOf('Our first team plays Saturday at 3pm.', 'school');
    const firmPlay   = await eventOf('Our first team plays Saturday at 3pm.', 'firm');
    ok('ON-D1 one sentence, one KIND, through the real route',
      clubPlay && schoolPlay && firmPlay
      && clubPlay.fields.kind === 'performance'
      && schoolPlay.fields.kind === 'performance'
      && firmPlay.fields.kind === 'performance');
    ok('ON-D2 …and three different words, each the organisation\'s own',
      clubPlay.fields.type === 'match' && schoolPlay.fields.type === 'exam'
      && firmPlay.fields.type === 'launch');
    ok('ON-D3 …so a school is never told it has a match (this was the answer for everybody)',
      schoolPlay.fields.type !== 'match' && !/match/i.test(schoolPlay.fields.title || ''));

    console.log('\n  E — AND NEVER CALLED "DEFAULT" AT A PERSON');
    const launch = await eventOf('The product launch is on Friday at 3pm.', 'firm');
    ok('ON-E1 an occasion the old kernel had no word for is titled what the person called it',
      launch && launch.fields.title === 'Launch');
    ok('ON-E2 …and the sentence they read before confirming says the same',
      /^Launch on Friday/.test(String(launch.plainLanguage || '')));
    for (const [code, text] of [['school', 'Parents evening on Thursday at 6pm.'],
                                ['firm',   'The sprint review is Wednesday at 11am.'],
                                ['plain',  'The inspection is on Monday at 9am.'],
                                ['club',   'Deadline Monday at 9am.']]) {
      const ev = await eventOf(text, code);
      ok(`ON-E3 ${code}: "${text}" never yields a machine word`,
        !!ev && !/^default$/i.test(ev.fields.title || '') && !/default/i.test(ev.fields.type || ''));
    }

    console.log('\n  F — AND NO FOOTBALL PHRASE IS SPLICED INTO ANYBODY\'S TITLES');
    ok('ON-F1 "first team" no longer appears in a title the kernel builds',
      !/first team/i.test(String((firmPlay.fields || {}).title || ''))
      && !/first team/i.test(String((schoolPlay.fields || {}).title || '')));
    /* THE SOURCE, DECOMMENTED — the explanatory prose in these modules is full of football, and
       matching raw text would find the comment about the change rather than the change. */
    const fs = require('fs');
    const strip = p => fs.readFileSync(require('path').join(__dirname, '..', p), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const state = strip('ai/org-state.js');
    ok('ON-F2 the engine no longer compares an event type to a football noun',
      !/ev\s*&&\s*ev\.type\s*===\s*'match'/.test(state));
    ok('ON-F3 …nor decides a lead time from a list of football claim names',
      !/kickoff\|availability\|game_plan/.test(state));
    const ctx = strip('ai/org-context.js');
    ok('ON-F4 …and the extractor no longer has a hard-coded "first team" title',
      !/'First Team '/.test(ctx));

    console.log('\n  G — AND AN ORGANISATION\'S OWN WORDS STILL WIN');
    /* The last line of the design law: a pack is a default, never a cage. An org that renames
       the word sees its own, and that path must survive a change that added new keys. */
    const custom = packs.resolveDomain('sports', { vocab: { eventPerformance: 'derby day' } });
    const ev = OC.extract('We play Saturday at 3pm.', { now, vocab: custom.vocab })
      .proposals.find(p => p.type === 'event');
    ok('ON-G1 an organisation that renames the occasion sees its own word',
      ev && ev.fields.type === 'derby day' && ev.fields.kind === 'performance');
    ok('ON-G2 …and a pack that declares nothing for a kind still yields a human word, not a key',
      OC.extract('Deadline Monday at 9am.', { now, vocab: {} })
        .proposals.find(p => p.type === 'event').fields.type === 'deadline');

  } catch (e) { fail++; console.error('  FAIL org-ontology-neutrality suite threw:', e && e.stack); }

  server.close();
  console.log(`\norg-ontology-neutrality-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
