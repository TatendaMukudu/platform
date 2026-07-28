/* ============================================================
   ai/notes.js — PURE governance for pinning + team-sharing a note

   A note is born PRIVATE. Two deliberate, reversible acts can change that:
     • PIN it — so it surfaces on your (or the team's) shelf and can be returned to.
     • SHARE it with the team — so teammates can read it and ask IntelliQ about it.

   This module owns the STATE TRANSITIONS and the SAFETY RULE, purely:
     — Sharing is refused for a note the privacy gate marked sensitive, EVEN IF the
       author taps share. Private wellbeing (theirs or someone else's) can never
       become team-visible by accident. The caller passes `isSensitive` (computed by
       ai/privacy against the note's stored sensitivity) — this module never re-reads
       raw text; it decides on the flag.
     — Every transition is a pure patch; nothing here persists or reads a DB.
     — teamView is the ONLY projection a teammate ever sees: the shareable content and
       who shared it, never the author's private AI-companion reply or the raw
       sensitivity classification.

   Scope filtering (who, in the node web, may see a shared note) is the caller's job —
   the same web primitives as evidence/reasoning — not re-implemented here.
   ============================================================ */

/* Can this note be shared with the team? Private by default; sensitive stays private. */
function canShareToTeam(note, { isSensitive } = {}) {
  if (!note || !String(note.content || '').trim()) return { allowed: false, reason: 'empty' };
  if (isSensitive) return { allowed: false, reason: 'sensitive_stays_private' };
  if (note.teamShared) return { allowed: false, reason: 'already_shared' };
  return { allowed: true, reason: null };
}

/* Deliberate share → a pure patch. Caller has already checked canShareToTeam + authorship,
   and stamps nodeScope so the web can scope who sees it. */
function share(note, { actorId, now, nodeScope = null } = {}) {
  return { ...note, teamShared: true, sharedBy: actorId || note.authorId || null,
    sharedAt: now || Date.now(), nodeScope: nodeScope || note.nodeScope || null };
}

/* Reversible — take it back to private. History (that it was shared) is not something we
   keep on the note; un-sharing simply makes it private again. */
function unshare(note) {
  const n = { ...note }; n.teamShared = false; delete n.sharedBy; delete n.sharedAt; return n;
}

function pin(note, { now } = {}) { return { ...note, pinned: true, pinnedAt: now || Date.now() }; }
function unpin(note) { const n = { ...note }; n.pinned = false; delete n.pinnedAt; return n; }

/* The ONLY thing a teammate ever sees of a shared note. No sensitivity, no private AI
   reply, no internal author id — a title, the shareable body, who shared it, when. */
function teamView(note) {
  return {
    id: note.id,
    title: note.tag || 'Note',
    content: note.content,
    sharedBy: note.authorName || null,
    sharedAt: note.sharedAt || null,
    pinned: !!note.pinned,
    kind: 'note',
  };
}

/* An author's own shelf view — richer (it's their note), but still no internal noise. */
function ownView(note) {
  return {
    id: note.id, title: note.tag || 'Note', content: note.content,
    teamShared: !!note.teamShared, pinned: !!note.pinned,
    sharedAt: note.sharedAt || null, createdAt: note.createdAt || null, kind: 'note',
  };
}

/* Grounded answer over a single note — the deterministic floor for "ask IntelliQ about this
   note". It grounds STRICTLY in the note's own words and never invents: relevance is a plain
   keyword overlap (honest, no model), and the answer only ever surfaces the note's content.
   The server may pass this note (and nothing else) to the LLM to phrase a real answer — but
   the grounding is the note alone, so a shared note can never pull in anything private. */
const _STOP = new Set(['this', 'that', 'with', 'from', 'have', 'they', 'their', 'about', 'what', 'does', 'will', 'when', 'your', 'you', 'the', 'and', 'for', 'are', 'was', 'would', 'could', 'should']);
function groundedAnswer(note, question) {
  const content = String((note && note.content) || '').trim();
  if (!content) return { relevant: false, grounded: '', answer: 'There’s nothing in this note to go on.' };
  const toks = s => (String(s || '').toLowerCase().match(/[a-z]{4,}/g) || []).filter(w => !_STOP.has(w));
  const noteSet = new Set(toks(content));
  const relevant = toks(question).some(w => noteSet.has(w));
  return {
    grounded: content,
    relevant,
    answer: relevant
      ? `Here’s what the note says: ${content}`
      : `This note doesn’t seem to cover that. For reference, it says: ${content}`,
  };
}

/* Order a set of notes for a shelf: pinned first, newest pin first, then by recency. */
function shelfSort(notes) {
  return [...(notes || [])].sort((a, b) => {
    if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
    return String(b.pinnedAt || b.sharedAt || b.createdAt || '').localeCompare(String(a.pinnedAt || a.sharedAt || a.createdAt || ''));
  });
}

module.exports = {
  canShareToTeam, share, unshare, pin, unpin, teamView, ownView, shelfSort, groundedAnswer,
};
