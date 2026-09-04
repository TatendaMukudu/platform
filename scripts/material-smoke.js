/* Truth layer — MATERIAL SOMEBODY ATTACHED, AND WHETHER IT LANDED (the kernel).

   Founder, September 2026: "If a coach for example can attach a PowerPoint for scouting and ask
   IntelliQ to recreate it for another game and players interact with that. Then we've achieved a
   massive goal." And what should come back: "Read it and work from it! ... 'wasn't well
   understood by 80% of players and they are struggling with A,B,C'."

   THAT LAST SENTENCE IS THE WHOLE DESIGN PROBLEM, because A, B and C have to come from somewhere.
   The tempting answer is a classifier reading the deck and naming the topics. This codebase
   already removed one classifier for destroying information before anything could reason over it,
   and a topic-namer would be worse — it would INVENT the categories a coach is then told their
   squad is struggling with, and the coach would act on them.

   The answer is that A, B and C are PARTS OF THE MATERIAL ITSELF. A deck has slides. A document
   has sections. The author already decided what the parts are and what each is called, by writing
   it. So nothing here ever names a topic that is not already a heading in the file, and the
   suite's job is to keep it that way.

   THE OTHER LAW THIS SUITE EXISTS FOR: SILENCE IS NOT CONFUSION. A section nobody opened is "not
   looked at", never "not understood". Collapsing those two manufactures a problem out of an
   absence, and a coach re-teaches something the squad already had.

   Run: node scripts/material-smoke.js */

'use strict';

const material = require('../ai/material.js');
const teamState = require('../ai/team-state.js');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

const DECK = [
  'Slide 1: Pressing traps — force them wide, then trap on the touchline',
  'Slide 2: Rest defence — two stay, nobody follows the striker inside',
  'Slide 3: Set pieces — near post flick, second ball at the top of the box',
].join('\n');

/* ── MS1-MS4: the parts are the author's. ── */
{
  const secs = material.segment(DECK, { kind: 'pptx' });
  ok('MS1 a deck segments on the author\'s own slide boundaries — the most deliberate division a person ever makes',
    secs.length === 3 && secs[0].ordinal === 1 && secs[2].ordinal === 3);
  ok('MS2 THE HEADING IS A QUOTATION, NOT A DESCRIPTION — it is the author\'s own first line, so nothing here names a topic they did not write',
    /Pressing traps/.test(secs[0].heading) && /Rest defence/.test(secs[1].heading) &&
    secs.every((s, i) => DECK.includes(s.heading.replace(/…$/, '').slice(0, 20))));
  ok('MS2b …with the "Slide N:" scaffolding stripped from the heading but the words untouched',
    !/^Slide/.test(secs[0].heading));
  ok('MS3 ids are STABLE and come from the ordinal, so fixing a typo on slide 3 does not orphan every question asked about slide 3',
    secs.map(s => s.id).join(',') === 's1,s2,s3' &&
    material.segment(DECK.replace('near post', 'near-post'), { kind: 'pptx' }).map(s => s.id).join(',') === 's1,s2,s3');
  ok('MS4 segmentation is deterministic — the same file gives the same parts every time, which is what lets last week\'s answer still point at the same part',
    JSON.stringify(material.segment(DECK, { kind: 'pptx' })) === JSON.stringify(secs));
}

/* ── MS5: prose with no structure is ONE part, never chopped into equal lengths. ── */
{
  const prose = 'A single continuous paragraph about the plan for Saturday that has no headings and no blank lines anywhere in it at all, going on for a while.';
  const secs = material.segment(prose, { kind: 'text' });
  ok('MS5 prose with no structure is ONE part — chopping it every N characters would invent boundaries and then report a squad\'s understanding of them',
    secs.length === 1);
  const paras = material.segment('First thing we talked about.\n\nSecond thing we talked about.', { kind: 'text' });
  ok('MS5b …but a paragraph break the author typed IS a boundary, because they typed it',
    paras.length === 2);
}

/* ── MS6-MS7: what the assistant may work from. ── */
{
  const m = { title: 'Saturday scouting', filename: 'sat.pptx', sections: material.segment(DECK, { kind: 'pptx' }) };
  const ctx = material.contextFor(m, {});
  ok('MS6 the assistant is handed the author\'s own words, with the parts NAMED, so an answer can say which slide it came from',
    /\[s1\]/.test(ctx.text) && /\[s3\]/.test(ctx.text) && /touchline/.test(ctx.text));
  ok('MS6b …and it is not summarised on the way — a summary made here would become the thing every later answer is grounded in, and nobody approved it',
    ctx.text.includes('force them wide, then trap on the touchline'));
  const small = material.contextFor(m, { cap: 90 });
  ok('MS7 when only part fits, it SAYS so — an answer built from one slide must not be presented as having read the deck',
    small.partial === true && small.sectionIds.length < 3);
  ok('MS7b …and a full read says it is not partial, so the flag means something',
    ctx.partial === false);
}

/* ── MS8-MS10: understanding is DECLARED. ── */
{
  const m = { sections: material.segment(DECK, { kind: 'pptx' }) };
  ok('MS8 there are exactly two things a person may say, and neither is "seemed unsure" — a third state could only be arrived at by reading their words for hesitancy',
    JSON.stringify(material.ENGAGEMENT) === JSON.stringify(['got_it', 'not_yet']));
  const junk = material.understanding(m, [
    { personId: 'p1', sectionId: 's1', state: 'maybe', at: 1 },
    { personId: 'p2', sectionId: 's1', state: '', at: 2 },
  ], { members: 12 });
  ok('MS9 an unrecognised declaration counts as NOTHING rather than being coerced to the nearest one — guessing here is the classifier arriving through the one door built to keep it out',
    junk.parts[0].gotIt === 0 && junk.parts[0].notYet === 0 && junk.cohort.k === 0);

  /* L-MT4 — one person is one voice, latest word wins. */
  const changed = material.understanding(m, [
    { personId: 'p1', sectionId: 's1', state: 'not_yet', at: 100 },
    { personId: 'p1', sectionId: 's1', state: 'not_yet', at: 200 },
    { personId: 'p1', sectionId: 's1', state: 'got_it',  at: 300 },
  ], { members: 12 });
  ok('MS10 somebody who asks about slide 1 four times is ONE person struggling, not four',
    changed.parts[0].notYet === 0 && changed.parts[0].gotIt === 1);
  ok('MS10b …and their LATEST word is the one that counts, so a person is allowed to change their mind',
    changed.parts[0].gotIt === 1);
}

/* ── MS11-MS13: SILENCE IS NOT CONFUSION. The law this suite exists for. ── */
{
  const m = { sections: material.segment(DECK, { kind: 'pptx' }) };
  const u = material.understanding(m, [
    { personId: 'p1', sectionId: 's1', state: 'got_it',  at: 1 },
    { personId: 'p2', sectionId: 's1', state: 'not_yet', at: 2 },
    { personId: 'p3', sectionId: 's1', state: 'not_yet', at: 3 },
    { personId: 'p4', sectionId: 's1', state: 'got_it',  at: 4 },
    { personId: 'p5', sectionId: 's1', state: 'not_yet', at: 5 },
    { personId: 'p6', sectionId: 's2', state: 'got_it',  at: 6 },
  ], { members: 12, floor: teamState.cohortFloor(6, 12) });

  const s1 = u.parts.find(p => p.sectionId === 's1');
  const s3 = u.parts.find(p => p.sectionId === 's3');
  ok('MS11 the nine people who said nothing about slide 1 are QUIET, not "not yet" — collapsing those two manufactures a problem out of an absence',
    s1.gotIt === 2 && s1.notYet === 3 && s1.quiet === 7);
  ok('MS12 a part NOBODY opened is reported as not looked at, never as not understood — a coach re-teaching something the squad already had is the cost of getting this wrong',
    s3.state === 'not_looked_at' && s3.notYet === 0 && u.untouched.includes('s3'));
  ok('MS12b …and "nothing said about it at all" is its own list, because it is a different thing for a coach to act on than "this part did not land"',
    u.untouched.length === 1 && u.untouched[0] === 's3');
  ok('MS13 the parts most people said they did not have YET are ranked — this is the founder\'s "struggling with A, B, C", and A is a heading the coach wrote',
    u.struggling.length === 1 && /Pressing traps/.test(u.struggling[0].heading));
  ok('MS13b …and the plain sentence quotes that heading rather than naming a topic',
    /Pressing traps/.test(material.landedNote(u)) && /6 people have said/.test(material.landedNote(u)));
}

/* ── MS14-MS16: the cohort floor, and the refusal that carries no counts. ── */
{
  const m = { sections: material.segment(DECK, { kind: 'pptx' }) };
  const engagements = [
    { personId: 'p1', sectionId: 's1', state: 'not_yet', at: 1 },
    { personId: 'p2', sectionId: 's1', state: 'not_yet', at: 2 },
    { personId: 'p3', sectionId: 's1', state: 'got_it',  at: 3 },
  ];
  const u = material.understanding(m, engagements, { members: 6, floor: teamState.cohortFloor(3, 6) });
  ok('MS14 a report on three people in a squad of six is REFUSED — "two of six did not get it" is a name in a small squad',
    u.ok === false && /below the floor/i.test(u.reason || ''));
  ok('MS14b …and the refusal carries NO counts at all, because returning them beside an ok:false is how a caller ends up rendering them anyway',
    u.parts.length === 0 && u.struggling.length === 0 && u.untouched.length === 0);
  ok('MS14c …and says so plainly rather than reading as "nothing happened"',
    /Held back/i.test(material.landedNote(u)));

  const wide = material.understanding(m, [...engagements,
    { personId: 'p4', sectionId: 's1', state: 'got_it', at: 4 },
    { personId: 'p5', sectionId: 's1', state: 'got_it', at: 5 },
  ], { members: 14, floor: teamState.cohortFloor(5, 14) });
  ok('MS15 …and above the floor it reports, which is what proves MS14 is a gate rather than an always-refuse',
    wide.ok === true && wide.parts.length === 3);

  /* THE OTHER SIDE OF THE FLOOR, which is the half people forget. */
  const nearlyAll = material.understanding(m,
    Array.from({ length: 9 }, (_, i) => ({ personId: `p${i}`, sectionId: 's1', state: 'got_it', at: i })),
    { members: 11, floor: teamState.cohortFloor(9, 11) });
  ok('MS16 nine of eleven is ALSO refused — naming the nine names the two, which is the half of a two-sided floor people forget',
    nearlyAll.ok === false);
}

/* ── MS17: nobody has said anything at all. ── */
{
  const m = { sections: material.segment(DECK, { kind: 'pptx' }) };
  const u = material.understanding(m, [], { members: 12 });
  ok('MS17 with nobody having answered, the report says silence is neither agreement nor confusion — rather than an encouraging zero',
    /Silence is not agreement, and it is not confusion either/.test(material.landedNote(u)));
}

/* ── MS18: caps. A file this big is a library, not a briefing. ── */
{
  const many = Array.from({ length: 400 }, (_, i) => `Slide ${i + 1}: part ${i + 1} of the plan`).join('\n');
  ok('MS18 an enormous file is bounded rather than accepted whole — a 400-slide deck is not a briefing anybody is going to engage with part by part',
    material.segment(many, { kind: 'pptx' }).length === material.SECTION_CAP);
}

console.log(`\nmaterial-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
