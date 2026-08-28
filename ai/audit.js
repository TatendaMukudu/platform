/* ============================================================
   ai/audit.js — the accountability trail (pure)

   IntelliQ routes a sensitive read (a belief about a person) only to the leaders who
   may see them. This module records THAT: an append-only, content-free, tamper-evident
   log of who accessed whose data, when, and on what basis. It is what turns "we scope
   access" into something an organisation can PROVE — the difference between a tool a
   school or a club can defend to a parent or a regulator, and one they can't.

   Two duties, both a compliance requirement (GDPR accountability, Art 5(2); and the
   audit trail behind Art 15 subject-access and Art 30 records of processing):

     • RECORD every accountable access — actor, action, subject, a basis LABEL, and time.
     • PROVE the record wasn't altered — each entry carries a hash chained to the one
       before it, so a deleted or edited entry breaks the chain and is detectable.

   CONTENT-FREE BY CONSTRUCTION (this is what keeps the log itself from becoming a second
   pool of sensitive data): an entry stores only WHO / WHAT / WHOM / WHEN and a short,
   non-sensitive basis label. It never stores the belief's claim, a quote, a score, or
   any note text. The subject is an id; the trail is about access, not content.

   PURE: imports only node:crypto for the chain hash. No DB / IO / clock of its own.
   ============================================================ */

const crypto = require('crypto');

// The ONLY actions the trail records — a fixed vocabulary so the log can never be used to
// smuggle free-text. Each is an accountable read or export of personal data.
const ACTIONS = new Set([
  'agenda_view',     // a leader read the reasoner's agenda (beliefs about people)
  'report_view',     // a grounded report about a team/person was rendered
  'subject_access',  // a person exercised their right to a copy of their own data (Art 15)
  'erasure',         // a person's data was erased (Art 17)
  'belief_contest',  // a subject contested a belief held about them
  'outbound_delivery', // IntelliQ proactively reached a person off-platform (digest/alert)
  'finding_view',    // a governed finding was emitted to a person (emission proxy, not a read receipt)
]);

const _h = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const _clean = (v, max) => (v == null ? null : String(v).slice(0, max || 120));
const _findingRef = v => {
  const ref = _clean(v, 160);
  return ref && /^[A-Za-z0-9:_-]+$/.test(ref) ? ref : null;
};

/* Build ONE normalized, content-free entry chained to the previous one. `prev` is the last
   entry in the log (or null for the first). Returns the entry to append; never mutates the
   log. `subjectIds` is the set of people whose data this access touched (deduped). */
function record({ actor = null, action = '', subjectIds = [], findingRefs = [], basis = null, at = 0 } = {}, prev = null) {
  if (!ACTIONS.has(action)) return null;                       // allow-list guard — unknown actions are refused
  const subjects = [...new Set((Array.isArray(subjectIds) ? subjectIds : [subjectIds]).filter(Boolean).map(s => _clean(s, 80)))].sort();
  const findings = [...new Set((Array.isArray(findingRefs) ? findingRefs : [findingRefs]).map(_findingRef).filter(Boolean))].sort();
  const seq = prev && Number.isFinite(prev.seq) ? prev.seq + 1 : 0;
  const prevHash = prev && prev.hash ? prev.hash : 'GENESIS';
  const body = {
    seq,
    actor: _clean(actor, 80),
    action,
    subjectIds: subjects,
    findingRefs: findings,             // stable references only; never headline, basis, figure or prose
    basis: _clean(basis, 120),         // a short label ("scoped team read"), never content
    at: Number.isFinite(at) ? at : 0,
  };
  // The chain: each entry's hash covers its own body AND the previous hash. Edit or drop
  // any entry and every subsequent hash fails to reproduce — the tamper is localized.
  const hash = _h(prevHash + '|' + JSON.stringify(body));
  return { ...body, prevHash, hash };
}

/* Append an access to a log (returns a NEW array — the caller persists it). Optionally
   bounded: keep only the most recent `cap` entries (the chain re-bases cleanly because we
   never rewrite retained entries, only forget the oldest prefix). */
function append(log, entry, cap = 0) {
  if (!entry) return log || [];
  const next = [...(log || []), entry];
  if (cap > 0 && next.length > cap) return next.slice(next.length - cap);
  return next;
}

/* The last entry — the chain tip a new record links to. */
function tip(log) { return (log && log.length) ? log[log.length - 1] : null; }

/* Everything the trail shows about ONE person — the basis of a Subject Access Request's
   "who has accessed your data" section. Content-free: it lists accesses, not content. */
function subjectTrail(log, subjectId) {
  const id = _clean(subjectId, 80);
  return (log || []).filter(e => (e.subjectIds || []).includes(id))
    .map(e => ({ actor: e.actor, action: e.action, basis: e.basis, at: e.at }));
}

/* Everything ONE actor accessed — the accountability view (what did this leader look at). */
function actorTrail(log, actor) {
  const a = _clean(actor, 80);
  return (log || []).filter(e => e.actor === a)
    .map(e => ({ action: e.action, subjectIds: e.subjectIds, basis: e.basis, at: e.at }));
}

/* Verify the chain end-to-end: recompute each entry's hash from the prior hash + its body.
   Returns { ok, brokenAt } — the seq of the first entry whose hash doesn't reproduce (a
   tamper), or ok:true if the whole trail is intact. This is the tamper-evidence guarantee. */
function verify(log) {
  // A bounded log may have deliberately forgotten its oldest prefix. The first retained
  // prevHash is therefore the chain anchor; every retained body remains tamper-evident.
  let prevHash = log && log.length ? (log[0].prevHash || 'GENESIS') : 'GENESIS';
  for (const e of (log || [])) {
    const body = { seq: e.seq, actor: e.actor, action: e.action, subjectIds: e.subjectIds };
    // Legacy entries predate findingRefs. Preserve their historical hash while chaining the
    // new field into every entry that actually carries it.
    if (Array.isArray(e.findingRefs)) body.findingRefs = e.findingRefs;
    Object.assign(body, { basis: e.basis, at: e.at });
    const expect = _h(prevHash + '|' + JSON.stringify(body));
    if (e.prevHash !== prevHash || e.hash !== expect) return { ok: false, brokenAt: e.seq };
    prevHash = e.hash;
  }
  return { ok: true, brokenAt: null };
}

module.exports = { record, append, tip, subjectTrail, actorTrail, verify, ACTIONS };
