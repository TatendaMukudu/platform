/* ============================================================
   ai/audience.js — WHO WILL KNOW I SAID THIS (pure)

   The answer to the only privacy question a person actually asks. Not a `public/private`
   toggle, which tells someone nothing about who "public" means, but a named audience that
   resolves through the organisation's real structure.

   ── AN AUDIENCE IS A REFERENCE, NEVER A LIST ────────────────────────────────
   The single most important decision in this module. An audience is stored as
   { kind, nodeId } and resolved to people AT READ TIME, against current membership.

   Storing a materialised list of user ids would be a snapshot, and a snapshot is wrong the
   moment somebody joins, leaves, or stops leading a node. "Visible to coaching staff" must
   mean whoever coaches that node today — not whoever coached it the afternoon the record was
   written. Stale audience permissions are the classic access-control bug and this shape makes
   them structurally impossible rather than something a sweep has to catch.

   ── AUDIENCE NARROWS. IT NEVER GRANTS ───────────────────────────────────────
   This module is NOT a permission system and must never become one. Admissibility is decided
   before it, by `_kernelEvidence` in server.js, which is the only door to kernel reasoning.
   An audience can make something visible to FEWER people than admissibility would allow. It
   can never make something visible to more.

   Written as a law because it is the one way this file could become dangerous:

       visible(x) = admissible(x) AND withinAudience(x)

   never `admissible(x) OR withinAudience(x)`, and never withinAudience alone.

   ── ACCURACY OVER COMFORT ───────────────────────────────────────────────────
   No label here claims anonymity. The system does not provide anonymity under a threat model
   where a coach knows the roster and the cohort is small — the two-sided floor exists precisely
   because it does not. So the vocabulary is `aggregated` and `protected contribution`, which
   are true, rather than `anonymous`, which would not be.

   PURE: imports nothing, no IO. The caller owns tenancy and admissibility before inputs arrive.
   ============================================================ */

'use strict';

/* ── THE KINDS ───────────────────────────────────────────────────────────────
   Deliberately few, and every one of them resolves through org structure rather than through
   a role string. Adding a kind means adding a resolver below, which is the point: a kind that
   cannot be resolved deterministically cannot be offered to a user as a promise. */
const AUDIENCE_KINDS = Object.freeze([
  'self',           // the person who captured it, and nobody else
  'node_leaders',   // whoever leads that node TODAY — "coaching staff"
  'node_members',   // everyone in that node, leaders included — "the team"
  'node_forum',     // the node's deliberation surface; same reach as node_members, different act
  'org_admins',     // organisation administrators
]);

/* Human labels. These are what a person reads BEFORE they submit, so they are written as
   answers to "who will know I said this", not as category names. */
const LABELS = Object.freeze({
  self: 'Only me',
  node_leaders: 'Coaching staff',
  node_members: 'The team',
  node_forum: 'Team forum',
  org_admins: 'Organisation administrators',
});

/* What each audience means in practice, shown when a person asks to inspect the label. Every
   sentence here must remain true of the code; if one stops being true it is a defect, not
   marketing copy that drifted. */
const EXPLANATIONS = Object.freeze({
  self: 'Nobody else can read this. It is not contributed to any group, it counts toward no group finding, and no leader can see it or see that it exists.',
  node_leaders: 'Whoever leads this group can read this, and that is resolved fresh each time — if someone stops leading, they stop seeing it.',
  node_members: 'Everyone in this group can read this, including whoever leads it.',
  node_forum: 'Posted where the group deliberates. Everyone in the group can read it. Speech in the forum is not evidence until you separately contribute it.',
  org_admins: 'Organisation administrators can read this.',
});

function _s(v, n = 120) { return String(v == null ? '' : v).trim().slice(0, n); }
function _arr(v) { return Array.isArray(v) ? v.filter(Boolean) : []; }

/* ── 1. CONSTRUCTION ─────────────────────────────────────────────────────────
   Build the durable reference that rides on an evidence envelope or a contribution.

   An unknown kind falls back to `self`. That direction is the only safe default: guessing
   wrong toward `self` withholds something the person may have meant to share, which they can
   correct; guessing wrong the other way publishes something they did not, which they cannot. */
function audienceRef({ kind, nodeId = null } = {}) {
  const k = AUDIENCE_KINDS.includes(kind) ? kind : 'self';
  // Only node-scoped kinds carry a node. Keeping a nodeId on `self` would imply the node has
  // some claim on it, and something has to be the one place that is decided.
  const needsNode = k === 'node_leaders' || k === 'node_members' || k === 'node_forum';
  return { kind: k, nodeId: needsNode ? (_s(nodeId, 64) || null) : null };
}

/* A node-scoped audience without a node cannot be resolved, so it cannot be honoured, so it
   must not be storable. Callers check this BEFORE writing, never after. */
function isResolvable(ref = {}) {
  if (!AUDIENCE_KINDS.includes(ref.kind)) return false;
  if (ref.kind === 'node_leaders' || ref.kind === 'node_members' || ref.kind === 'node_forum') {
    return !!_s(ref.nodeId, 64);
  }
  return true;
}

/* ── 2. WHAT A PERSON READS BEFORE THEY SUBMIT ───────────────────────────────
   The group's real name is used where there is one, because "Coaching staff" is a category and
   "Coaching staff for Men's Soccer" is an answer. */
function describe(ref = {}, { nodeName = '' } = {}) {
  const kind = AUDIENCE_KINDS.includes(ref.kind) ? ref.kind : 'self';
  const name = _s(nodeName, 60);
  const base = LABELS[kind];
  const label = (name && kind !== 'self' && kind !== 'org_admins') ? `${base} · ${name}` : base;
  return { kind, nodeId: ref.nodeId || null, label, explanation: EXPLANATIONS[kind] };
}

/* ── 3. RESOLUTION — AT READ TIME, AGAINST TODAY'S STRUCTURE ─────────────────
   The whole reason an audience is a reference. `nodes` and `ownerId` are passed in by the
   caller from current state; this function holds no state of its own and therefore cannot hold
   a stale one.

   Returns the ids AND the reason, because "who can see this" is a question that deserves an
   explanation rather than a list. */
function resolve(ref = {}, { ownerId = null, nodes = {} } = {}) {
  const kind = AUDIENCE_KINDS.includes(ref.kind) ? ref.kind : 'self';
  const node = ref.nodeId ? (nodes[ref.nodeId] || null) : null;

  if (kind === 'self') {
    return { userIds: ownerId ? [ownerId] : [], why: 'only the person who captured it' };
  }
  if (!node) {
    // A node-scoped audience whose node has gone. Fail CLOSED: the record becomes private
    // rather than falling back to something broader. A deleted group must not widen anything.
    return { userIds: ownerId ? [ownerId] : [], why: 'the group no longer exists, so this stays with its author' };
  }
  if (kind === 'node_leaders') {
    return { userIds: _arr(node.leaderIds), why: `whoever leads ${_s(node.name, 60) || 'this group'} right now` };
  }
  if (kind === 'node_members' || kind === 'node_forum') {
    const ids = [...new Set([..._arr(node.memberIds), ..._arr(node.leaderIds)])];
    return { userIds: ids, why: `everyone in ${_s(node.name, 60) || 'this group'} right now` };
  }
  // org_admins is resolved by the caller against its own role table; this module refuses to
  // guess at a role vocabulary it does not own.
  return { userIds: [], why: 'organisation administrators, resolved by role' };
}

/* Is this specific reader inside the audience? The one predicate every read path should use,
   so there is one definition of "within audience" rather than one per call site. */
function includes(ref = {}, viewerId, ctx = {}) {
  if (!viewerId) return false;
  // The author always retains their own material, whatever audience it carries.
  if (ctx.ownerId && viewerId === ctx.ownerId) return true;
  return resolve(ref, ctx).userIds.includes(viewerId);
}

/* ── 4. "CAN MY COACH SEE WHAT I JUST SAID?" ─────────────────────────────────
   Answered from state, never by a model. Every input is a fact the kernel already holds:
   who owns it, whether it was contributed, what audience it carries, who leads the node today,
   and whether a safety exception applies.

   `contributed` is deliberately separate from `audience`. They answer different questions —
   audience is who MAY read the record, contribution is whether its content has crossed into
   the group's reasoning. A person can have said something to their coach that the team's
   findings still do not rest on, and conflating the two would misreport both. */
function whoCanSee({ audience = null, ownerId = null, visibility = 'normal', contributed = false,
                     safetyException = null } = {}, { nodes = {}, nodeName = '' } = {}) {
  const ref = audience && isResolvable(audience) ? audience : audienceRef({ kind: 'self' });
  const desc = describe(ref, { nodeName });
  const res = resolve(ref, { ownerId, nodes });

  const isPrivate = ref.kind === 'self' || visibility === 'private';
  const parts = [];

  if (isPrivate) {
    parts.push('Only you.');
    parts.push(contributed
      ? 'The point you contributed is part of the group\'s reasoning, but your words are not — the group holds a reference, never your text.'
      : 'This has not been contributed to the coaching staff or the team.');
  } else {
    parts.push(`${desc.label}. That is ${res.why}.`);
    parts.push(contributed
      ? 'You contributed this, so it counts toward what the group is working out.'
      : 'You have not contributed this, so it counts toward no group finding.');
  }

  // Said last and said plainly. A person is entitled to know the limits of a promise BEFORE
  // they rely on it, and burying the exception would make every sentence above dishonest.
  if (safetyException) parts.push(_s(safetyException, 300));

  return {
    audience: desc,
    contributed: contributed === true,
    canSee: res.userIds,
    why: res.why,
    // The sentence a person reads. Composed here so every surface says the same thing.
    statement: parts.join(' '),
    safetyException: safetyException ? _s(safetyException, 300) : null,
    derivedFrom: ['ownerRef', 'visibility', 'audience', 'contribution state', 'current node membership'],
  };
}

module.exports = {
  AUDIENCE_KINDS, LABELS, EXPLANATIONS,
  audienceRef, isResolvable, describe, resolve, includes, whoCanSee,
};
