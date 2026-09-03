/* ============================================================
   ai/escalation.js — THE LADDER (pure)

   Founder, September 2026:

     "if a high or low person has to go through a leader and the owner... let's say it goes
      through 5 leaders they will all have different perspectives with different evidence, such
      as a weight room coach's evidence for you doing well will be different to a head coach.
      Which is only advantageous to our system. And each time a leader pushes it away the bigger
      the priority becomes because it'll be a bottleneck on the user's page."

   Both halves of that are right, and they are the same mechanism seen from two ends.

   LOOKING UP: a belief about one person, put to five people who see that person from five
   different vantages, comes back with five accounts that are genuinely independent. A strength
   coach and a head coach watching the same player are not two people repeating one story — they
   are two origins, and origins are the currency this whole system runs on (L-OR1). Routing is
   therefore not overhead on the way to an answer. Routing IS the evidence-gathering.

   LOOKING DOWN: a thing that five people have each passed along is not a thing of declining
   importance. It is a thing nobody has owned, which is a fact about the organisation rather
   than about the person, and it belongs at the TOP of their page rather than quietly ageing at
   the bottom. Ordinary software treats a dismissal as a signal to show something less. Here a
   pass is a signal to show it MORE, because the person is still carrying it.

   SIX LAWS, and the first is the one the founder chose explicitly:

     L-ES1  A RAISE IS THE SUBJECT'S ACT. Nothing about a person travels to their leaders
            because the machine decided it should. They called it, and then they raised it, and
            both are taps they made. Automatic routing was on the table and was rejected: a
            private read on yourself arriving in front of five people the instant you tap is not
            something a player expects the first time.

     L-ES2  A PASS MUST SAY WHY. A pass with no reason is a dismissal wearing a routing label,
            and it would let the priority climb of L-ES3 be driven by silence. Saying why is
            also the only thing that makes a pass worth anything to the person.

     L-ES3  BEING PASSED ALONG RAISES PRIORITY. Never lowers it. See above.

     L-ES4  A REASON IS SPEECH UNTIL ITS AUTHOR MAKES IT EVIDENCE. The forum law, unchanged
            (ai/forum.js). A leader saying "not my area, try the strength staff" is routing and
            must never become an observation about the player. A leader who offers their actual
            read is giving an account, deliberately and attributably, and that one becomes an
            origin. The leader chooses which they are doing; nothing here infers it from the
            wording, because inferring meaning from wording is the mistake this codebase has
            already made once and does not repeat.

     L-ES5  THE LADDER IS FINITE AND ORDERED, and running off the end is an outcome rather than
            an error. Five people looked and nobody took it: that is the most informative state
            this object has, and it is reported in those words.

     L-ES6  ONLY THE PERSON HOLDING IT MAY ACT ON IT. Not the leader after them, not the one
            before who already passed. A ladder where anybody can reach in is a queue with no
            accountability, which is the thing being measured.

   PURE: imports nothing, no IO, no clock of its own. The caller owns tenancy, auth and privacy
   before anything arrives here, and owns turning `readsOf` into kernel proposals afterwards.
   ============================================================ */

'use strict';

/* A stop's state. `waiting` is the only one that can be acted on, and only by its own leader. */
const STOP_STATES = Object.freeze(['ahead', 'waiting', 'passed', 'taken']);

/* A raise's state.
     open      — somebody is holding it right now.
     held      — a leader took it. It has an owner, which is what the person wanted.
     exhausted — every stop passed. Nobody owns it, and that is the finding.
     withdrawn — the person took it back. Their raise, their call. */
const RAISE_STATES = Object.freeze(['open', 'held', 'exhausted', 'withdrawn']);

/* What a leader is doing when they pass it on. The difference is the whole of L-ES4. */
const PASS_KINDS = Object.freeze(['read', 'handoff']);

/* How far a raise can climb. Each pass moves it up one; the names are the priority-office's own
   (ai/priority-office.js PRIORITY_RANK) so nothing has to translate between two vocabularies. */
const PRIORITY_LADDER = Object.freeze(['medium', 'high', 'urgent']);

function _s(v, n = 400) { return String(v == null ? '' : v).trim().slice(0, n); }
function _num(v) { return Number.isFinite(Number(v)) ? Number(v) : 0; }
function _arr(v) { return Array.isArray(v) ? v.filter(Boolean) : []; }

/* ── BUILDING ONE ────────────────────────────────────────────────────────────
   The ladder arrives already ordered and already filtered by the caller, which is the only
   place that knows the org tree. This module never asks who leads what; it would need org data
   to do it, and needing org data is how a pure module stops being one. */
function newRaise({ raiseId, inquiryId, subjectId, valence, label = '', ladder = [], now = 0 } = {}) {
  const stops = _arr(ladder)
    .filter(l => l && l.leaderId && l.leaderId !== subjectId)
    .map((l, i) => ({
      leaderId: _s(l.leaderId, 80),
      nodeId: _s(l.nodeId || '', 80),
      nodeName: _s(l.nodeName || '', 120),
      // A leader's standing on this ladder, in the person's own words rather than a role name:
      // "the people who run your first team" is what a player understands.
      because: _s(l.because || '', 160),
      state: i === 0 ? 'waiting' : 'ahead',
      reason: '',
      passKind: null,
      at: null,
    }));
  return {
    raiseId: _s(raiseId, 80),
    inquiryId: _s(inquiryId, 80),
    subjectId: _s(subjectId, 80),
    valence: valence === 'working_well' ? 'working_well' : 'worth_attention',
    label: _s(label, 160),
    raisedAt: _num(now),
    stops,
    cursor: stops.length ? 0 : -1,
    status: stops.length ? 'open' : 'exhausted',
    lastMovedAt: _num(now),
  };
}

/* Whose hands is it in right now? Null once it is held, exhausted or withdrawn. */
function holder(raise = {}) {
  const stops = _arr(raise.stops);
  const i = _num(raise.cursor);
  if (raise.status !== 'open' || i < 0 || i >= stops.length) return null;
  return stops[i] || null;
}

/* L-ES6, in one place so no route has to remember it. */
function mayAct(raise = {}, userId) {
  const h = holder(raise);
  return !!h && !!userId && h.leaderId === userId;
}

/* ── PASSING IT ON ───────────────────────────────────────────────────────────
   The reason is required (L-ES2) and the kind is declared rather than guessed (L-ES4). */
function pass(raise = {}, { by, reason, kind = 'handoff', now = 0 } = {}) {
  if (!mayAct(raise, by)) return { ok: false, error: 'this is not yours to pass on right now' };
  const why = _s(reason, 400);
  if (!why) return { ok: false, error: 'say why before passing it on — a pass with no reason is a dismissal' };
  const passKind = PASS_KINDS.includes(kind) ? kind : 'handoff';

  const stops = _arr(raise.stops).map(s => ({ ...s }));
  const i = _num(raise.cursor);
  stops[i] = { ...stops[i], state: 'passed', reason: why, passKind, at: _num(now) };

  const next = i + 1;
  const more = next < stops.length;
  if (more) stops[next] = { ...stops[next], state: 'waiting' };

  return {
    ok: true,
    raise: { ...raise, stops, cursor: more ? next : stops.length,
      status: more ? 'open' : 'exhausted', lastMovedAt: _num(now) },
    // Said back to the leader plainly, because a pass that silently raises the priority of
    // somebody else's problem is a thing they should know they did.
    note: more
      ? 'Passed on. It moves up, and it moves up their list too — nobody has taken it yet.'
      : 'Passed on, and there is nobody after you. It goes back to them saying exactly that.',
  };
}

/* ── TAKING IT ───────────────────────────────────────────────────────────────
   The point of the whole ladder. A note is optional here precisely because it is required on a
   pass: taking something on is an answer in itself, and demanding a paragraph for it would put
   the friction on the helpful act rather than the deferring one. */
function take(raise = {}, { by, note = '', now = 0 } = {}) {
  if (!mayAct(raise, by)) return { ok: false, error: 'this is not yours to take right now' };
  const stops = _arr(raise.stops).map(s => ({ ...s }));
  const i = _num(raise.cursor);
  stops[i] = { ...stops[i], state: 'taken', reason: _s(note, 400), passKind: 'read', at: _num(now) };
  return {
    ok: true,
    raise: { ...raise, stops, status: 'held', lastMovedAt: _num(now) },
    note: 'Taken on. They can see it has an owner now.',
  };
}

/* The person's own act, symmetrical with raising it (L-ES1). Withdrawing does not erase what
   leaders already said — those were their accounts, given honestly, and deleting somebody
   else's words because you changed your mind about asking is not a thing this system does. */
function withdraw(raise = {}, { by, now = 0 } = {}) {
  if (!by || by !== raise.subjectId) return { ok: false, error: 'only the person who raised it can take it back' };
  if (raise.status === 'withdrawn') return { ok: false, error: 'already taken back' };
  return {
    ok: true,
    raise: { ...raise, status: 'withdrawn', lastMovedAt: _num(now) },
    note: 'Taken back. What anyone already said about it stays on the record — those were their words, not yours.',
  };
}

/* ── L-ES3, THE ESCALATION ───────────────────────────────────────────────────
   Count the passes and climb. Exhausted is the top by definition: everybody available has
   looked at it and nobody owns it. Held drops out of the priority race entirely — it has an
   owner, so it is no longer a bottleneck on the person's page, which is the only thing being
   ranked here. */
function passCount(raise = {}) {
  return _arr(raise.stops).filter(s => s && s.state === 'passed').length;
}

function priorityOf(raise = {}) {
  if (raise.status === 'held' || raise.status === 'withdrawn') return 'low';
  if (raise.status === 'exhausted') return 'urgent';
  const n = passCount(raise);
  return PRIORITY_LADDER[Math.min(n, PRIORITY_LADDER.length - 1)];
}

/* ── WHAT THE PERSON IS TOLD ─────────────────────────────────────────────────
   Plainly, and without a number dressed up as a status. "Waiting on" names a person because the
   person who raised it is entitled to know where their own thing is sitting — anonymising that
   would leave them with a stalled object and nobody to ask about it. */
function statusLine(raise = {}, nameOf = id => id) {
  const n = passCount(raise);
  const h = holder(raise);
  if (raise.status === 'withdrawn') return 'You took this back.';
  if (raise.status === 'held') {
    const who = _arr(raise.stops).find(s => s && s.state === 'taken');
    return who ? `${nameOf(who.leaderId)} has taken this on.` : 'Somebody has taken this on.';
  }
  if (raise.status === 'exhausted') {
    return n === 1
      ? 'The one person it could go to has passed it on. Nobody has taken it.'
      : `All ${n} people it could go to have passed it on. Nobody has taken it.`;
  }
  const waiting = h ? `Waiting on ${nameOf(h.leaderId)}` : 'Waiting';
  if (!n) return `${waiting}.`;
  return `${waiting} — ${n} ${n === 1 ? 'person has' : 'people have'} passed it on before them.`;
}

/* ── L-ES4, THE EVIDENCE BOUNDARY ────────────────────────────────────────────
   Only the stops whose author said they were giving their READ come back here, and they come
   back as material for the caller to hand to the kernel — not as signals, not as anything with
   a confidence on it. Each carries its own author as its origin, which is the entire reason the
   founder wanted this: five vantages are five origins, and a strength coach's account of a
   player is not the head coach's account repeated.

   What this deliberately does NOT do is decide anything is corroborated. It hands over
   independently-sourced material and the kernel bands it, exactly as if the person had said it
   themselves on five separate occasions. */
function readsOf(raise = {}) {
  return _arr(raise.stops)
    .filter(s => s && s.passKind === 'read' && s.reason && (s.state === 'passed' || s.state === 'taken'))
    .map(s => ({
      byId: s.leaderId,
      text: s.reason,
      nodeId: s.nodeId,
      at: _num(s.at),
      // FLAT, because ai/diagnose.js reads originKind/originRef off the proposal itself. A
      // nested {kind, ref} is silently discarded as "origin not established", which is exactly
      // how the Alma seed ended up showing three separate players as one source.
      originKind: 'leader_report',
      originRef: `leader:${s.leaderId}`,
    }));
}

/* How many genuinely separate vantages have reported. Not a count of messages — a leader who
   holds two roles is still one origin, and this is the number that means something. */
function originCount(raise = {}) {
  return new Set(readsOf(raise).map(r => r.originRef)).size;
}

module.exports = {
  STOP_STATES, RAISE_STATES, PASS_KINDS, PRIORITY_LADDER,
  newRaise, holder, mayAct, pass, take, withdraw,
  passCount, priorityOf, statusLine, readsOf, originCount,
};
