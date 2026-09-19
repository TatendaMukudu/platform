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

   L-MT6  WHAT KIND OF THING THIS IS, IS DECLARED AND CHECKED — NEVER ASSUMED FROM THE UPLOAD.

          A file arriving in this product could be three completely different things, and the
          difference is not in the file:

            EXTERNAL CONTEXT       a scouting deck, an article, somebody else's research. Useful
                                   to read from. It says nothing about anybody here, and it is
                                   the DEFAULT, because "somebody attached a file" is not a claim.
            PERSONAL EVIDENCE      the attacher's own account of their own experience. They are
                                   the authority on that and need nobody's permission for it.
            ORGANISATION EVIDENCE  a claim about the organisation or the people in it. This is
                                   the one that can change what the product believes about
                                   somebody, and it is the one a person cannot simply assert.

          USER ASSERTION ALONE IS NOT AUTHORITATIVE EVIDENCE. Organisation evidence needs three
          separate things, and each blocks a different way of being wrong:

            PERMISSION    somebody entitled to speak for the group it concerns. Without this,
                          anybody could upload a document asserting what the squad is like.
            PROVENANCE    where it came from, stated. Without this, a claim about an organisation
                          has no source, and a source is what distinguishes evidence from
                          opinion — the same rule the citation gate applies to the outside world.
            CONFIRMATION  the person deliberately says "this is evidence about the organisation",
                          separately from attaching it. Without this, the classification is a
                          side effect of an upload, and consequential things must never be side
                          effects.

          A request that fails any of them is not refused outright — it is DOWNGRADED to external
          context and told why. Refusing the upload would lose the file; silently accepting it
          would let an assertion become a fact. Downgrading keeps the material and refuses only
          the claim, which is the part that was not earned.

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

/* L-MT6 — the closed vocabulary. Three, in increasing order of what they can do, and the default
   is deliberately the one that can do nothing. */
/* IS THERE ANYTHING A PERSON COULD READ IN THIS?

   `"".trim()` is the obvious check and it is not enough: String.prototype.trim strips WHITESPACE,
   and a NUL is not whitespace. A corrupt binary file — a .pptx that failed to parse, an image
   renamed to .txt — arrives as control characters, survives `text.trim()` intact, and becomes a
   material with a control-character heading that a coach then sees in their attachment list.
   Found by attaching one.

   So "readable" means what it says: at least one character somebody could actually read. Letters,
   digits and ordinary punctuation count; control characters and lone whitespace do not. */
const _READABLE = /[\p{L}\p{N}\p{P}\p{S}]/u;
function hasReadableText(text) {
  const t = String(text == null ? '' : text);
  // Strip the C0 and C1 control ranges before asking, so a file that is ONLY control characters
  // answers no rather than answering yes because it is non-empty.
  return _READABLE.test(t.replace(/[\u0000-\u001F\u007F-\u009F]/g, ''));
}

const CLASSES = Object.freeze(['external_context', 'personal_evidence', 'organisation_evidence']);
const DEFAULT_CLASS = 'external_context';

/* What each one MEANS, in the words a person reads before they choose it. Held here rather than
   in a template so the screen, the confirmation card and the report cannot describe the same
   choice three ways. */
const CLASS_TEXT = Object.freeze({
  external_context: {
    label: 'Something to read from',
    means: 'Material to work from. It says nothing about anybody here and changes nothing IntelliQ believes.',
  },
  personal_evidence: {
    label: 'My own account',
    means: 'Your own experience, in your own words. You are the authority on that, and it is yours alone unless you share it.',
  },
  organisation_evidence: {
    label: 'Evidence about this organisation',
    means: 'A claim about this organisation or its people. It needs somebody entitled to say it, a stated source, and your explicit confirmation — attaching a file is not enough on its own.',
  },
});

/* THE DECISION, PURE. Given what was asked for and what is true about the asker, returns the
   class that will actually be recorded, whether the request was granted, and — when it was not —
   which of the three requirements was missing, in words.

   It DOWNGRADES rather than refuses, for the reason in L-MT6: refusing loses the file, accepting
   silently lets an assertion become a fact, and downgrading refuses only the claim. */
function classifyRequest({ requested = '', mayAttest = false, provenance = '', confirmed = false } = {}) {
  const want = CLASSES.includes(String(requested)) ? String(requested) : DEFAULT_CLASS;

  // External context asks for nothing and is therefore always available.
  if (want === 'external_context') return { class: want, granted: true, missing: [], reason: '' };

  /* Personal evidence needs only that the person meant it. They are the authority on their own
     experience, so there is nobody to ask — but it is still a deliberate act rather than a
     property of the upload, because "I attached a file" is not "this is my account". */
  if (want === 'personal_evidence') {
    if (!confirmed) {
      return { class: DEFAULT_CLASS, granted: false, missing: ['confirmation'],
        reason: 'Kept as something to read from. Say deliberately that it is your own account and it will be recorded as that.' };
    }
    return { class: want, granted: true, missing: [], reason: '' };
  }

  // Organisation evidence. All three, and each is named separately when it is missing, because
  // "you cannot do that" teaches nothing and "you need X" is actionable.
  const missing = [];
  if (!mayAttest) missing.push('permission');
  if (!String(provenance || '').trim()) missing.push('provenance');
  if (!confirmed) missing.push('confirmation');
  if (missing.length) {
    const WORDS = {
      permission: 'somebody entitled to speak for the group it concerns',
      provenance: 'a stated source — where this came from',
      confirmation: 'your explicit confirmation that it is evidence about the organisation',
    };
    return {
      class: DEFAULT_CLASS, granted: false, missing,
      reason: `Kept as something to read from. Evidence about the organisation needs ${
        missing.map(m => WORDS[m]).join(', and ')}. Attaching a file is not enough on its own.`,
    };
  }
  return { class: want, granted: true, missing: [], reason: '' };
}

/* The file shapes whose structure this module knows how to follow. Anything else is treated as
   plain prose, which is honest — an unknown format has no structure we can claim to read. */
/* ── AND A PHOTOGRAPH, WHICH IS READ BEFORE IT IS STORED ──────────────────────────────────────
   Everything else in this list arrives as text the client extracted. An image cannot: the bytes
   mean nothing to `segment`, and `hasReadableText` would correctly refuse them as binary. So an
   image is READ at the door -- once, through `ai.gateway.understand`, which has spoken Claude
   image blocks and OpenAI `image_url` since it was written and had no caller in the tree -- and
   what is stored is the description that came back.

   That has a consequence worth stating rather than discovering: the BYTES ARE NOT KEPT. A later
   turn reasons over the description, not over the picture, so "look at it again and tell me
   something else" is not a thing this can do. Keeping the bytes would need a storage, privacy and
   provenance model for binary that this product does not have, and inventing one quietly is how
   an attachment feature comes to exist without anybody agreeing what it means.

   Its class is `external_context` like any other material: something to read from, which says
   nothing about anybody here and changes nothing IntelliQ believes. A description is a model's
   account of a picture, and a model's account of a picture is the weakest kind of material in the
   product -- not an observation, and never an origin. */
const KINDS = Object.freeze(['pptx', 'docx', 'xlsx', 'text', 'csv', 'pdf', 'image']);

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
  const whole = _arr(material.sections).filter(Boolean);
  const secs = whole.filter(s => !want || want.has(String(s.id)));
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
    provenance: material.provenance === 'external' ? 'external' : 'internal',
    sectionIds: included,
    /* PARTIAL IS MEASURED AGAINST THE WHOLE DOCUMENT, NEVER AGAINST THE SELECTION.
       This compared `included` to `secs` — the already-filtered set — so handing over three
       slides of twenty reported partial:false, and the composer would then have been told it
       was safe to speak for the whole deck. Two things narrow what is here: the cap, and a
       caller's choice of sections. Both leave the reader with less than the document, and the
       reader is entitled to know that either way. */
    partial: included.length < whole.length,
    // What the caller asked to leave out, distinct from what the cap cut off. A caller that
    // narrowed deliberately can say so; one that simply ran out of room cannot claim it did.
    narrowed: !!want,
    text: lines.join('\n\n'),
  };
}

/* ── 2b. GOING BACK TO THE SOURCE ────────────────────────────────────────────────────────────

   FOUNDER, September 2026: *Retained source material exists partly so IntelliQ can inspect it
   again. If that information was not preserved in the initial description, IntelliQ must be
   capable of re-reading the authorized source rather than fabricating an answer or claiming the
   information is unavailable while the source still exists.*

   `contextFor` above hands over as much as fits under a cap, in document order. That is right for
   "here is the briefing" and wrong for "what was their home record again?" — the answer may be in
   part nineteen of a twenty-part deck, outside the cap, present the whole time and never offered.

   So this looks through the WHOLE material for the parts that bear on a question, and returns
   their own words. It is deterministic, needs no model, and cannot fabricate: what comes back is
   text that is already in the document, with the part it came from named so somebody can check.

   IT IS RETRIEVAL, NOT UNDERSTANDING. No scoring of relevance beyond word overlap, no summary, no
   inference. A word that appears in the question and in a part is a reason to show that part to a
   person; it is not a claim about what the part means. The reading stays the reader's. */
const _STOP = new Set(('a,an,and,are,as,at,be,but,by,can,did,do,does,for,from,had,has,have,how,i,'
  + 'if,in,into,is,it,its,me,my,no,not,of,on,or,our,so,that,the,their,them,then,there,these,they,'
  + 'this,to,was,we,were,what,when,where,which,who,why,will,with,you,your,again,about,tell,say'
).split(','));

/* ── AND A WORD IS NOT ALWAYS SOMETHING WITH SPACES AROUND IT ─────────────────────────────────
   Splitting on whitespace and matching whole tokens is right for most of the writing systems this
   product will meet, and silently wrong for three of the largest. Measured, not assumed:

     Arabic, Greek, Cyrillic, Latin   a question found its answer in the document
     Chinese, Japanese                NOTHING, every time
     Korean                           NOTHING, every time

   Two different causes with one remedy. Chinese and Japanese do not put spaces between words, so
   a whole sentence arrives as ONE token and `includes` can only match the identical sentence.
   Korean does use spaces but attaches its particles to the word: the question says 점유율에 and
   the document says 점유율이 — the same word, one character apart — so whole-token matching never
   fires.

   This matters more than it looks. The directive this product sends says "answer this person in
   the language they are writing in", which is a claim of universality; deterministic re-reading
   returning nothing for a third of the world while that sentence goes out is the product claiming
   a capability it does not have. It is also NOT a translation problem — the words are right there
   in the document in the person's own script — so it is fixable here, in the one function that
   decides what a word is, rather than by adding anything.

   The remedy is character bigrams over runs of Han, Kana and Hangul, which is the ordinary way
   those scripts are indexed. 报告怎么说控球 becomes 报告 告怎 怎么 么说 说控 控球, and the document
   contains 报告 and 控球; 점유율에 and 점유율이 share 점유 and 유율. A one-character run is kept whole,
   because a one-character word is a real word in these scripts. Everything else keeps the
   whitespace rule exactly as it was, including the length and stopword filters, which are about
   English noise and have nothing to say about a bigram. */
const _CJK_RUN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu;

function terms(question) {
  const out = [];
  const plain = w => { if (w.length > 2 && !_STOP.has(w)) out.push(w); };
  for (const word of String(question || '').toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/\s+/)) {
    if (!word) continue;
    /* `match` with a global regex returns every run and leaves no sticky state behind, which a
       `test` in the same breath would; there is one regex here and it is used one way. */
    const runs = word.match(_CJK_RUN);
    if (!runs) { plain(word); continue; }
    /* The runs of unspaced script become bigrams; whatever is left of the token — a number, a
       borrowed Latin word — is still an ordinary word and keeps the ordinary rule. */
    let rest = word;
    for (const run of runs) {
      rest = rest.replace(run, ' ');
      if (run.length === 1) { out.push(run); continue; }
      for (let i = 0; i + 2 <= run.length; i++) out.push(run.slice(i, i + 2));
    }
    for (const w of rest.split(/\s+/)) if (w) plain(w);
  }
  return [...new Set(out)];
}
const _terms = terms;

function findIn(material = {}, question, { max = 3, cap = CONTEXT_CAP } = {}) {
  const terms = _terms(question);
  if (!terms.length) return null;
  const secs = _arr(material.sections).filter(Boolean);
  if (!secs.length) return null;
  const scored = secs.map(s => {
    const hay = `${s.heading || ''} ${s.text || ''}`.toLowerCase();
    /* WHICH of the asked-about words are in this part, not how many times. A part that repeats
       one word twenty times is not more about the question than a part that mentions two of
       them — counting occurrences would rank a header block above the answer. */
    const hits = terms.filter(t => hay.includes(t));
    return { s, hits: hits.length, matched: hits };
  }).filter(x => x.hits > 0);
  if (!scored.length) return null;
  scored.sort((a, b) => (b.hits - a.hits) || (a.s.ordinal - b.s.ordinal));
  const take = scored.slice(0, Math.max(1, max));
  const lines = [];
  let used = 0;
  for (const x of take) {
    /* WHAT A PERSON READS, NOT WHAT THE STORE CALLS IT. `contextFor` prefixes `[s2]` because it
       is talking to a model that may need to cite a part; this is talking to somebody, and an
       internal section id in front of a sentence is architecture vocabulary in a conversation.

       AND THE HEADING IS NOT ALWAYS A HEADING. `segment` derives one from a part's opening line,
       so for ordinary prose the "heading" IS the first line of the text — printing both gave the
       same sentence twice. It is shown only when it says something the text does not already
       start with, which for a deck is "Slide 3: …" and for a paragraph is nothing. */
    const head = String(x.s.heading || '').trim();
    const body = String(x.s.text || '').trim();
    /* CONTAINS, not starts-with. A slide's text begins "Slide 3: …" while its derived heading is
       the words after that, so a prefix test says they differ and prints the same sentence twice.
       The question is whether the heading adds anything the body does not already say. */
    const block = (head && !body.toLowerCase().includes(head.toLowerCase().slice(0, 40)))
      ? `${head}\n${body}` : body;
    if (!block) continue;
    if (used + block.length > cap) break;
    lines.push(block);
    used += block.length;
  }
  if (!lines.length) return null;
  return {
    title: _s(material.title, 200),
    filename: _s(material.filename, 200),
    sectionIds: take.slice(0, lines.length).map(x => x.s.id),
    headings: take.slice(0, lines.length).map(x => _s(x.s.heading, 120)),
    matched: [...new Set(take.flatMap(x => x.matched))],
    /* WHETHER THIS SEARCHED THE WHOLE THING. A caller that only ever sees the capped context
       would otherwise report "not in the document" about a part it was never shown. */
    searched: secs.length,
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
  CLASSES, DEFAULT_CLASS, CLASS_TEXT, classifyRequest, hasReadableText,
  /* `terms` is exported because the learning read was carrying its OWN COPY of this tokeniser —
     the same regex, the same length rule, a slightly different stopword list — so a question in
     Korean or Chinese failed in two places for one reason, and fixing one of them would have left
     the other broken and looking correct. What a word is has one owner. */
  segment, contextFor, findIn, terms, understanding, landedNote,
};
