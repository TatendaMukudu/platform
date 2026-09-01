/* ============================================================
   ai/forum.js — DELIBERATION AROUND AN INQUIRY (pure)

   Forum creates speech before it creates evidence.

   A Forum message is conversation. It is not a signal, a contribution, a corroboration, an
   origin, a hypothesis, a confidence input or a fact — and the way that is guaranteed is not a
   rule anyone has to remember but the shape of this file: it contains no reference to evidence,
   confidence, origins or hypotheses, and it cannot produce any. Ten people agreeing here changes
   nothing anywhere, because there is nothing in this module that could change it.

   The intended path is:

     group inquiry → thread → member speech → a DELIBERATE contribution → the existing
     contribution boundary (ai/contribution.js) → the existing kernel (ai/diagnose.js)

   and never:

     message → signal

   The one thing Forum knows about epistemology is where the door is. It does not walk through
   it; ai/contribution.js does, with the same checks it already applies to everything else.

   PURE: imports nothing, no IO.
   ============================================================ */

/* A message is visible or it is removed. Removal hides speech; it does not touch anything the
   speech may have become — those are different lifecycles, and conflating them would let editing
   a sentence silently rewrite what an inquiry was reasoned from. */
const MESSAGE_STATES = ['visible', 'removed'];

const MAX_MESSAGE = 4000;
const THREAD_CAP = 500;                  // a deliberation, not an archive

/* Every Forum discussion is anchored to a real group inquiry. There are deliberately no
   free-floating team threads: an unanchored thread is a place where a topic can accumulate
   apparent importance without ever passing the evidence boundary, which is the exact confusion
   between conversation and truth this whole layer exists to prevent. */
function newThread({ inquiryId, nodeId, subjectRef, now = Date.now() } = {}) {
  return {
    inquiryId: String(inquiryId || ''),
    nodeId: String(nodeId || ''),
    subjectRef: String(subjectRef || ''),
    createdAt: now,
    messages: [],
  };
}

function newMessage({ id, authorId, text, replyTo = null, now = Date.now() } = {}) {
  return {
    messageId: String(id || `fm_${now}`),
    authorId: String(authorId || ''),
    text: String(text || '').slice(0, MAX_MESSAGE),
    replyTo: replyTo ? String(replyTo) : null,
    at: now,
    status: 'visible',
    editedAt: null,
    /* If the author later contributes this statement, the evidence reference is recorded here so
       the two histories can be told apart and neither can be mistaken for the other. It is a
       LINK, not a state: the message being contributed changes nothing about the message, and
       removing the message changes nothing about the evidence. */
    contributedAs: null,
    contributedAt: null,
  };
}

/* Speech is the author's. Removing it hides it and keeps the record that something was said and
   withdrawn, because a thread that silently loses turns misrepresents the conversation that
   actually happened. */
function removeMessage(message, { now = Date.now() } = {}) {
  return { ...message, status: 'removed', removedAt: now, text: '' };
}

function editMessage(message, text, { now = Date.now() } = {}) {
  return { ...message, text: String(text || '').slice(0, MAX_MESSAGE), editedAt: now };
}

/* What a reader may see. Removed messages keep their place as a tombstone rather than vanishing.
   Note what is NOT here: nothing about evidence, candidates, confidence or origins. A Forum read
   cannot leak epistemic provenance because it never holds any.

   D-A2 · ANONYMOUS TO HUMANS, KNOWN TO THE KERNEL. `authorId` never leaves this function. Every
   reader — leaders included, because candour with the people above you is the entire reason
   Forum is worth having — sees unattributed speech. The viewer sees their OWN messages flagged,
   so they can find and correct what they said.

   Anonymity here is a RENDERING property. The stored message keeps its author, so independent
   origins are still counted, echoes still refuse to corroborate, corrections are still
   attributable and a withdrawal still knows what it withdraws. Removing authorship rather than
   hiding it would let one person post five times and manufacture a consensus.

   `viewerId` is required for ownership. Absent it, nothing is anyone's — the projection fails
   closed rather than falling back to attribution. */
function visibleThread(thread, { limit = 200, viewerId = null } = {}) {
  const viewer = viewerId ? String(viewerId) : null;
  const msgs = ((thread && thread.messages) || []).slice(-limit).map(m => ({
    messageId: m.messageId,
    // Never the author. Not for a leader, not for an admin, not when the message is removed.
    authorId: null,
    mine: m.status !== 'removed' && !!viewer && m.authorId === viewer,
    text: m.status === 'removed' ? null : m.text,
    at: m.at,
    editedAt: m.editedAt,
    replyTo: m.replyTo,
    status: m.status,
    // That a statement was offered as its author's own account is part of the conversation —
    // it says "somebody stands behind this", which other people can reasonably see. It carries
    // no weight, no identity and no reference to what the evidence became.
    contributed: !!m.contributedAs,
  }));
  return { inquiryId: (thread || {}).inquiryId, nodeId: (thread || {}).nodeId, messages: msgs };
}

/* ── WHO MAY DO WHAT ─────────────────────────────────────────────────────────
   Membership of the node governs reading and speaking. Authorship governs editing, removing and
   contributing. Leadership governs neither of the last three — a leader runs the group, not the
   contents of somebody's testimony, and that separation is the point of Phase 5.

   Pure predicates so the policy is testable without a server. */
function mayRead({ inNode = false, leadsNode = false } = {}) {
  return inNode || leadsNode;
}
function mayPost({ inNode = false, leadsNode = false } = {}) {
  return inNode || leadsNode;
}
function mayEdit({ actorId, message } = {}) {
  return !!actorId && !!message && message.authorId === actorId && message.status !== 'removed';
}

/* THE ONE RULE THAT MATTERS MOST HERE.

   A member may offer their own words as their own account. Nobody may turn someone else's words
   into evidence attributed to them — not a teammate, and specifically not a leader. Leadership
   does not confer ownership of another person's testimony, and there is no proxy consent: if a
   coach wants a claim represented, the coach gives their own account of it, which the existing
   authority rules then weigh on its own merits.

   Returns a reason on refusal because "you cannot do that" is not an explanation. */
function mayContributeMessage({ actorId, message, inNode = false, leadsNode = false } = {}) {
  if (!actorId || !message) return { allowed: false, reason: 'no message' };
  if (!inNode && !leadsNode) return { allowed: false, reason: 'not part of this group' };
  if (message.status === 'removed') return { allowed: false, reason: 'message was removed' };
  if (message.authorId !== actorId) {
    return { allowed: false, reason: 'only the author may offer their own statement as evidence' };
  }
  if (message.contributedAs) return { allowed: false, reason: 'already contributed' };
  return { allowed: true, reason: 'the author is offering their own account' };
}

/* ── FORUM IS NOT AN ORIGIN ──────────────────────────────────────────────────
   Typing something into a shared thread does not make it a new observation of the world. What
   decides the origin is what the statement IS:

     · an account of something the author saw themselves — a genuine new origin;
     · a restatement of something already contributed — the SAME origin, marked as reported, so
       agreeing in public cannot become corroboration.

   The author says which, by pointing at the message they are echoing. That is the honest place
   for the decision: they know, and the alternative is guessing from wording, which would either
   invent independence or destroy it. What the kernel guarantees regardless is that a declared
   echo can never add an origin. */
function originForMessage(message, { echoesMessage = null } = {}) {
  if (echoesMessage && echoesMessage.contributedOrigin) {
    return {
      originRef: String(echoesMessage.contributedOrigin),
      originKind: 'reported',
      // The retelling is the author's, but what it rests on is not.
      directness: 'inferred',
    };
  }
  return {
    originRef: `forum_${message.messageId}`,
    originKind: 'direct_observation',
    directness: 'direct',
  };
}

module.exports = {
  MESSAGE_STATES, MAX_MESSAGE, THREAD_CAP,
  newThread, newMessage, removeMessage, editMessage, visibleThread,
  mayRead, mayPost, mayEdit, mayContributeMessage, originForMessage,
};
