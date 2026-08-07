/* ============================================================
   ai/composer.js — THE ONE VOICE (pure, deterministic guards around a model call)

   The flip: the model is no longer a FALLBACK that only speaks when the deterministic
   layer fails. It is the COMPOSER — it always writes the reply. The deterministic core
   keeps its real job, which was never "produce prose":

     • RETRIEVE — gather everything this person is authorised to see (their evidence, the
       reasoner's beliefs about them, their assigned work, the conversation so far).
     • VERIFY  — check the written reply against that bundle and reject invented specifics.

   Why: stitched-together templates produced replies that argued with themselves ("Happy to
   build you an assessment… which one do you mean?… I can start one") and answered a question
   about FINISHING IN FOOTBALL with an assessment about finishing tasks you start. Ordering the
   templates better cannot fix that — only something that comprehends the question can.

   THE CAGE (enforced here in code, not merely requested in the prompt):
     • Any organisational specific — a person's name, a number, a quoted item title — must
       appear in the authorised bundle. If it does not, the reply is refused and the caller
       degrades honestly. The model may reason freely about the WORLD; it may not invent a
       fact about THIS organisation.
     • No data is not a reason to lie. With nothing recorded, the honest move is to say so,
       reason generally (clearly labelled), and ask for what would build the picture.

   PURE: imports nothing, no IO, no network. The model call itself lives at the server edge.
   ============================================================ */

const SYSTEM_PROMPT = [
  'You are IntelliQ — one assistant, one voice. You are talking WITH a person about their own',
  'work and development. You are given a CONTEXT block: everything the system knows about them',
  'and is authorised to show them right now.',
  '',
  'GROUND RULES — these are checked in code after you answer, so breaking them fails the turn:',
  '  1. Never state a fact about this person or this organisation unless it is in CONTEXT.',
  '     No invented names, numbers, dates, results, scores, or item titles. Not one.',
  '  2. If CONTEXT has nothing on what they asked, SAY SO plainly — "there is nothing recorded',
  '     about your finishing yet" — and then be genuinely useful anyway with general knowledge,',
  '     clearly framed as general ("in general…", "typically…"). Never pad the gap with a guess.',
  '  3. After being useful, help BUILD the missing picture: ask one specific, easy question whose',
  '     answer would let you say something grounded next time. One question, not a list.',
  '',
  'REASON, do not recite. You are given the raw material; your job is to think with it and',
  'answer the actual question. Use general/domain knowledge freely — that is why you are here.',
  'Read the DOMAIN and the conversation before choosing what a word means: "finishing" for a',
  'footballer is putting chances away, not completing tasks. Getting this wrong is a real failure.',
  '',
  'IF THEY ASK YOU TO BUILD SOMETHING (an assessment, a plan, a session), actually start building',
  'it in the conversation: ask what specifically is going wrong, work through it with them. Do not',
  'just announce that you can do it. Offering is not helping.',
  '',
  'VOICE: speak TO them ("you"), never about them in the third person. Plain, warm, direct',
  'British English. Short sentences. No emojis, no exclamation marks, no "Great question", no',
  'restating their question back to them. Be concrete. Cut every word that earns nothing.',
  '',
  'LENGTH AND FORMAT — this is read on a phone:',
  '  • Keep it under 120 words. A reply they scroll past helps nobody. Make the cut ruthlessly:',
  '    the single most useful point, then your one question. Depth comes from the next turn.',
  '  • Plain prose only. NO markdown — no **bold**, no *italics*, no bullet lists, no headings.',
  '    Asterisks are shown literally to the person, so they are never formatting, only litter.',
  '',
  'AVAILABLE ACTIONS may be listed in CONTEXT. You may offer one in passing, in your own words.',
  'Nothing is ever saved or shared until they confirm it, so never claim you have done it.',
  'If they tell you to SHARE something, make it public, or change who can see it, do NOT say it',
  'is done — you cannot do it. Their audience only ever widens through an explicit confirmation',
  'on the card. Say plainly that you have not changed it and point them at the control. Telling',
  'someone their private note is now shared when it is not is the worst mistake you can make.',
  '',
  'NEVER DESCRIBE THE INTERFACE. You cannot see their screen, so any button, menu, icon or',
  'location you describe is a guess, and sending someone hunting for a control that does not',
  'exist is its own kind of fabrication. The only controls you may name are the ones written in',
  'AVAILABLE ACTIONS, and on a suggestion card those are exactly: Confirm, Edit / Correct, and',
  'Dismiss. Say "use Edit / Correct on the card" — never "the privacy button, usually top right".',
].join('\n');

const _clip = (s, n = 400) => { const t = String(s == null ? '' : s); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

/* ── 1. BUILD THE CONTEXT BLOCK ──────────────────────────────────────────────
   Pure string assembly over the already-scoped bundle the caller retrieved. Everything in
   here is authorised for this reader; the model may use anything it is given and nothing else. */
function buildContext({
  name = '', role = '', domain = '', question = '', about = null,
  beliefs = [],        // [{ text }]        the reasoner's reads about them (self-view)
  evidence = [],       // [{ text, source }] their own notes / authorised records
  assignedWork = [],   // [{ title, status }]
  priorMessages = [],  // [{ role, text }]
  actions = [],        // [{ label }]       confirmable proposals available this turn
} = {}) {
  const L = [];
  L.push('CONTEXT');
  L.push(`Person: ${name || 'this person'}${role ? ` (${role})` : ''}`);
  if (domain) L.push(`Domain: ${domain}`);
  L.push('');

  // A thread opened FROM an observation card carries what it is about, so the conversation
  // starts where the person already is instead of from a blank page.
  if (about && (about.headline || about.body)) {
    L.push('THIS CONVERSATION WAS OPENED FROM SOMETHING THE SYSTEM NOTICED:');
    if (about.headline) L.push(`  ${_clip(about.headline, 200)}`);
    if (about.body) L.push(`  ${_clip(about.body, 300)}`);
    L.push('  Start there. Open with what it means for them and one question that moves it forward.');
    L.push('');
  }

  const prior = (Array.isArray(priorMessages) ? priorMessages : []).filter(m => m && m.text).slice(-8);
  if (prior.length) {
    L.push('CONVERSATION SO FAR:');
    for (const m of prior) L.push(`  ${m.role === 'assistant' ? 'You' : 'Them'}: ${_clip(m.text, 240)}`);
    L.push('');
  }

  const bel = (Array.isArray(beliefs) ? beliefs : []).filter(b => b && b.text).slice(0, 8);
  L.push(bel.length ? 'WHAT THE SYSTEM HAS OBSERVED ABOUT THEM (you may state these):' : 'WHAT THE SYSTEM HAS OBSERVED ABOUT THEM: nothing recorded yet.');
  for (const b of bel) L.push(`  - ${_clip(b.text, 240)}`);
  L.push('');

  const ev = (Array.isArray(evidence) ? evidence : []).filter(e => e && e.text).slice(0, 10);
  L.push(ev.length ? 'THEIR OWN RECORDS AND NOTES (you may quote these):' : 'THEIR OWN RECORDS AND NOTES: none on this topic.');
  for (const e of ev) L.push(`  - ${_clip(e.text, 240)}${e.source ? ` [${_clip(e.source, 60)}]` : ''}`);
  L.push('');

  const work = (Array.isArray(assignedWork) ? assignedWork : []).filter(w => w && w.title).slice(0, 10);
  if (work.length) {
    L.push('THEIR ASSIGNED WORK:');
    for (const w of work) L.push(`  - “${_clip(w.title, 120)}” (${w.status || 'assigned'})`);
    L.push('');
  }

  const acts = (Array.isArray(actions) ? actions : []).filter(a => a && a.label).slice(0, 5);
  if (acts.length) {
    L.push('AVAILABLE ACTIONS (offer at most one, in your own words; it is not done until they confirm):');
    for (const a of acts) L.push(`  - ${_clip(a.label, 120)}`);
    L.push('');
  }

  L.push(`THEY ASKED: ${_clip(question, 600)}`);
  return L.join('\n');
}

/* ── 2. VERIFY THE WRITTEN REPLY ─────────────────────────────────────────────
   The cage. We cannot machine-check open-domain football knowledge — and we do not try; that
   is labelled general reasoning. What we CAN check, and do, is that no ORGANISATIONAL SPECIFIC
   was invented. Three concrete classes, each verifiable against the bundle:

     • a person's name that is not the reader and was not in the authorised context,
     • a quoted item title that does not exist in the context,
     • a grounding claim ("you have 5 assigned items") whose number is not in the context.

   Returns { ok, violations } — the caller refuses the reply and degrades honestly on !ok. */
const _NUM_CLAIM = /\byou (?:have|had|completed|submitted|logged|recorded)\s+(\d{1,4})\b/gi;
const _QUOTED = /[“"]([^”"]{4,120})[”"]/g;

function verifyGrounding(reply, { contextText = '', roster = [], readerName = '' } = {}) {
  const text = String(reply || '');
  const ctx = String(contextText || '').toLowerCase();
  const violations = [];

  // (a) NAMES — anyone on the roster who is not the reader must have been in the context.
  const reader = String(readerName || '').toLowerCase();
  for (const raw of (Array.isArray(roster) ? roster : [])) {
    const person = String(raw || '').trim();
    if (!person || person.length < 3) continue;
    if (reader && (person.toLowerCase() === reader || reader.includes(person.toLowerCase()))) continue;
    const re = new RegExp(`\\b${person.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (re.test(text) && !ctx.includes(person.toLowerCase())) {
      violations.push(`named "${person}", who is not in the authorised context`);
    }
  }

  // (b) QUOTED TITLES — a quoted phrase presented as one of their items must exist verbatim.
  //     (Quoting the person's own words back is fine: those are in the conversation context.)
  let m;
  _QUOTED.lastIndex = 0;
  while ((m = _QUOTED.exec(text)) !== null) {
    const phrase = m[1].trim();
    if (phrase.length < 8) continue;              // short quotes are turns of phrase, not titles
    if (!ctx.includes(phrase.toLowerCase())) violations.push(`quoted “${_clip(phrase, 60)}”, which is not in the authorised context`);
  }

  // (c) COUNTS — "you have N x" is a claim about their records; N must appear in the context.
  _NUM_CLAIM.lastIndex = 0;
  while ((m = _NUM_CLAIM.exec(text)) !== null) {
    if (!new RegExp(`\\b${m[1]}\\b`).test(ctx)) violations.push(`claimed the number ${m[1]} about their records, which is not in the authorised context`);
  }

  return { ok: violations.length === 0, violations };
}

/* ── 3. HONEST DEGRADE ───────────────────────────────────────────────────────
   When there is no model, no budget, or the reply failed verification, we never fake it.
   The caller falls back to the deterministic path; this is the line for the case where even
   that has nothing — it stays useful by being truthful about the gap and asking to fill it. */
function degradeLine(topic) {
  const t = String(topic || '').trim();
  return t
    ? `I don't have anything recorded about your ${t} yet, so I won't guess. Tell me what's actually happening with it — when it goes wrong, and what it feels like — and I'll have something real to work with.`
    : `I don't have anything recorded on that yet, so I won't guess. Tell me a bit more and I'll have something real to work with.`;
}

module.exports = { SYSTEM_PROMPT, buildContext, verifyGrounding, degradeLine };
