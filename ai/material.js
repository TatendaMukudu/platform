/* ============================================================
   ai/material.js — MATERIAL SOMEBODY ATTACHED, AND WHETHER IT LANDED.

   Founder, September 2026, on what would make this product worth having: "If a coach for example
   can attach a PowerPoint for scouting and ask IntelliQ to recreate it for another game and
   players interact with that. Then we've achieved a massive goal." And on what should come back:
   "Read it and work from it! ... 'wasn't well understood by 80% of players and they are
   struggling with A,B,C'."

   That last sentence is the whole design problem, because A, B and C have to come from
   somewhere. The tempting answer is a classifier reading the deck and naming the topics. This
   codebase already removed one classifier for destroying information before anything could
   reason over it, and a topic-namer would be a worse one — it would invent the categories a
   coach is then told their squad is struggling with.

   THE ANSWER: A, B AND C ARE PARTS OF THE MATERIAL ITSELF. A deck has slides. A document has
   sections. The coach already decided what the parts are and what each one is called, by writing
   it. So the unit of understanding is a SECTION THE AUTHOR WROTE, addressed by a stable id, and
   nothing here ever names a topic that is not already a heading in the file.

   ── THE LAWS ────────────────────────────────────────────────────────────────────────────────

   L-MT1  SECTIONS COME FROM THE AUTHOR, NEVER FROM A READER. Segmentation follows the structure
          already in the file — slide boundaries, headings, blank lines. It does not group by
          meaning, name a theme, or decide what a passage is "about".

   L-MT2  UNDERSTANDING IS DECLARED, NEVER INFERRED. A person says they have it or they do not.
          Their words are not read for confidence, hesitancy or sentiment. This is the same law
          that governs direction, applied where the temptation is strongest — a coach asking "did
          they get it?" is exactly the question a product answers by guessing.

   L-MT3  SILENCE IS NOT CONFUSION. A section nobody opened is reported as NOT LOOKED AT, never
          as not understood. These are different facts about the world and collapsing them
          manufactures a problem out of an absence — which is how a coach ends up re-teaching
          something the squad already had.

   L-MT4  ONE PERSON IS ONE VOICE PER SECTION, and their most recent word is the one that counts.
          Somebody who asks four questions about slide 3 is one person struggling, not four.

   L-MT5  A REPORT ABOUT A GROUP IS COHORT-FLOORED AND NAMELESS. Counts of people, never a list
          of them, and only above the two-sided floor every other group surface uses. "Two of six
          did not get it" is a name in a small squad.

   Pure: no IO, no LLM, no clock of its own.
   ============================================================ */

'use strict';

const TEXT_CAP     = 200000;   // what one attachment may hold. Beyond this a file is a library, not a briefing.
const SECTION_CAP  = 200;      // how many parts one attachment may have.
const SECTION_TEXT = 4000;     // what one part may hold.
const MIN_SECTION  = 12;       // shorter than this is a stray line, not a section.
const CONTEXT_CAP  = 12000;    // what the assistant may be handed from one attachment in one turn.

/* L-MT2 — the only two things a person may say about a part, and they say them deliberately.
   There is no third state meaning "seemed unsure", because that state could only be arrived at
   by reading somebody's words for hesitancy. */
const ENGAGEMENT = Object.freeze(['got_it', 'not_yet']);

/* The file shapes whose structure this module knows how to follow. Anything else is treated as
   plain prose, which is honest — an unknown format has no structure we can claim to read. */
const KINDS = Object.freeze(['pptx', 'docx', 'xlsx', 'text', 'csv', 'pdf']);

const _s = (v, n = 200) => String(v == null ? '' : v).slice(0, n);
const _arr = v => (Array.isArray(v) ? v : []);
const _num = v => (Number.isFinite(Number(v)) ? Number(v) : null);

/* A heading for a part, taken from the part. Never composed, never summarised — the first line
   if the author wrote one, otherwise the opening words verbatim, which is a QUOTATION and not a
   description of what the passage means. */
function _heading(text) {
  const first = _s(text, 400).split('\n').map(l => l.trim()).find(Boolean) || '';
  const slide = first.match(/^Slide\s+\d+:\s*(.+)$/i);
  const body = slide ? slide[1] : first;
  if (body.length <= 90) return body;
  const cut = body.slice(0, 90);
  const sp = cut.lastIndexOf(' ');
  return (sp > 40 ? cut.slice(0, sp) : cut) + '…';
}

/* ── 1. THE PARTS THE AUTHOR WROTE ───────────────────────────────────────────────────────────

   L-MT1. Three structures, in order of how explicit the author was:

     SLIDES     "Slide 1: …" is what the deck extractor emits, and a slide boundary is the most
                deliberate division a person ever makes. Nothing beats it.
     BLANK LINE a paragraph break the author typed.
     WHOLE      no structure found, so one part. NOT an arbitrary split every N characters —
                chopping prose into equal lengths invents boundaries and then reports a squad's
                understanding of them.

   Deterministic: the same file segments the same way every time, which is what lets an
   engagement recorded last week still point at the same part today. */
function segment(text, { kind = 'text' } = {}) {
  const src = _s(text, TEXT_CAP);
  if (!src.trim()) return [];

  let parts = [];
  const slides = src.split(/\n(?=Slide\s+\d+\s*:)/g).map(s => s.trim()).filter(Boolean);
  if (slides.length > 1 && /^Slide\s+\d+\s*:/i.test(slides[0])) {
    parts = slides;
  } else {
    const paras = src.split(/\n\s*\n+/g).map(s => s.trim()).filter(s => s.length >= MIN_SECTION);
    parts = paras.length > 1 ? paras : [src.trim()];
  }

  return parts.slice(0, SECTION_CAP).map((t, i) => ({
    // A stable id from the ORDINAL, not from a hash of the content. An author fixing a typo on
    // slide 3 should not orphan every question their squad asked about slide 3.
    id: `s${i + 1}`,
    ordinal: i + 1,
    heading: _heading(t),
    text: _s(t, SECTION_TEXT),
    kind: KINDS.includes(kind) ? kind : 'text',
  }));
}

/* ── 2. WHAT THE ASSISTANT MAY WORK FROM ─────────────────────────────────────────────────────

   Founder: "The conversation must primarily flow from the context that was supplied in that
   focus." So this is the passage, bounded, with the parts named — and the naming matters as much
   as the text, because an answer that says which slide it came from is an answer somebody can
   check.

   Returns the sections' own words. It does NOT summarise them here: a summary made at this layer
   would be the thing the model then reasons over, and every later answer would be grounded in a
   paraphrase nobody approved. */
function contextFor(material = {}, { sectionIds = null, cap = CONTEXT_CAP } = {}) {
  const want = sectionIds ? new Set(_arr(sectionIds).map(String)) : null;
  const secs = _arr(material.sections).filter(s => s && (!want || want.has(String(s.id))));
  const lines = [];
  let used = 0;
  const included = [];
  for (const s of secs) {
    const block = `[${s.id}] ${s.heading}\n${s.text}`;
    if (used + block.length > cap) break;
    lines.push(block);
    included.push(s.id);
    used += block.length;
  }
  return {
    title: _s(material.title, 200),
    filename: _s(material.filename, 200),
    sectionIds: included,
    // Said plainly so the caller can put it in front of a reader: an answer built from part of a
    // deck should not be presented as if it read the whole thing.
    partial: included.length < secs.length,
    text: lines.join('\n\n'),
  };
}

/* ── 3. DID IT LAND? ─────────────────────────────────────────────────────────────────────────

   `engagements` are declarations: { personId, sectionId, state, at }. Everything below is
   counting, and the counting rules ARE the laws.

   L-MT4 one person is one voice per section, latest word wins.
   L-MT3 quiet is its own outcome and never folded into "not yet".
   L-MT5 counts of people, never names, and the floor decides whether it may be shown at all.

   `floor` is the verdict from the production cohort rule, handed in. This module does not
   own that arithmetic — a second copy of the floor is how two surfaces end up disagreeing about
   who may be named. */
function understanding(material = {}, engagements = [], { members = 0, floor = null } = {}) {
  const sections = _arr(material.sections);
  const n = _num(members) || 0;

  // L-MT4 — latest declaration per (person, section).
  const latest = new Map();
  for (const e of _arr(engagements)) {
    if (!e || !ENGAGEMENT.includes(_s(e.state, 20))) continue;
    const pid = _s(e.personId, 120), sid = _s(e.sectionId, 40);
    if (!pid || !sid) continue;
    const k = `${sid}|${pid}`;
    const prev = latest.get(k);
    if (!prev || (_num(e.at) || 0) >= (_num(prev.at) || 0)) latest.set(k, e);
  }

  const bySection = new Map();
  const everyone = new Set();
  for (const [k, e] of latest) {
    const sid = k.split('|')[0];
    const bucket = bySection.get(sid) || { got: [], not: [] };
    (e.state === 'got_it' ? bucket.got : bucket.not).push(_s(e.ref, 120) || `eng:${_s(e.personId, 120)}:${sid}`);
    bySection.set(sid, bucket);
    everyone.add(_s(e.personId, 120));
  }

  const parts = sections.map(s => {
    const b = bySection.get(String(s.id)) || { got: [], not: [] };
    const heard = b.got.length + b.not.length;
    return {
      sectionId: s.id, ordinal: s.ordinal, heading: s.heading,
      gotIt: b.got.length, notYet: b.not.length,
      // L-MT3. Named `quiet`, not `unknown` and certainly not `notYet`, because the word is what
      // stops a reader collapsing it.
      quiet: Math.max(0, n - heard),
      gotRefs: b.got, notRefs: b.not,
      state: heard === 0 ? 'not_looked_at' : (b.not.length > b.got.length ? 'more_said_not_yet' : 'more_said_got_it'),
    };
  });

  const k = everyone.size;
  const ok = !floor || floor.ok === true;
  return {
    ok,
    // The refusal carries the reason and NO counts. Returning the numbers with an ok:false beside
    // them is how a caller ends up rendering them anyway.
    reason: ok ? null : _s(floor && floor.reason, 200),
    cohort: { k, n },
    parts: ok ? parts : [],
    // The parts most people said they did not have yet, which is the coach's actual question.
    // Ordered by how many said so; ties by the author's own ordering, never by anything derived.
    struggling: ok
      ? parts.filter(p => p.notYet > 0).sort((a, b) => b.notYet - a.notYet || a.ordinal - b.ordinal).slice(0, 5)
      : [],
    // L-MT3 again, as its own list, because "nobody has opened slides 7-12" is a different thing
    // for a coach to do something about than "slide 3 did not land".
    untouched: ok ? parts.filter(p => p.state === 'not_looked_at').map(p => p.sectionId) : [],
  };
}

/* The plain sentence a coach reads. Deterministic, so it says the same thing with the writing
   engine off — and it never states a proportion the counts do not support. */
function landedNote(u = {}) {
  if (!u || u.ok !== true) return u && u.reason ? `Held back: ${u.reason}.` : 'Nothing to report yet.';
  const parts = _arr(u.parts);
  if (!parts.length) return 'Nothing attached to report on.';
  const heard = (u.cohort || {}).k || 0;
  if (!heard) return 'Nobody has said whether this landed yet. Silence is not agreement, and it is not confusion either.';
  const worst = _arr(u.struggling)[0];
  const bits = [`${heard} ${heard === 1 ? 'person has' : 'people have'} said where they are with this`];
  if (worst) bits.push(`the part most said they do not have yet is "${_s(worst.heading, 90)}" (${worst.notYet})`);
  const quietParts = _arr(u.untouched).length;
  if (quietParts) bits.push(`${quietParts} ${quietParts === 1 ? 'part has' : 'parts have'} had nothing said about them at all`);
  return bits.join('; ') + '.';
}

module.exports = {
  TEXT_CAP, SECTION_CAP, SECTION_TEXT, CONTEXT_CAP, MIN_SECTION, ENGAGEMENT, KINDS,
  segment, contextFor, understanding, landedNote,
};
