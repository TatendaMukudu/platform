/* ============================================================
   ai/org-routing.js — PURE node-aware routing of unresolved work

   Given the org node graph and a set of UNRESOLVED items (each with a subject node and,
   where known, an explicit owner), this decides WHO should see each item and rolls
   audience-safe summaries UP the web to responsible ancestors. It is the "proactive"
   layer only in the sense that it computes what should reach whom WITHOUT being asked — it
   does NOT send anything. Governed delivery (email/push) is deliberately elsewhere.

   The rules honour two hard constraints:
     • OWNERSHIP IS EXPLICIT, NEVER INFERRED FROM ANCESTRY. A direct owner wins. Otherwise
       an item escalates to the nearest LEADER at/above its node — and when a node has
       MULTIPLE PARENTS with no explicit owner, that is a CONFLICT: the item is surfaced to
       all responsible parents and flagged for a human to assign a primary owner. The module
       never silently picks a winner.
     • BRANCH ISOLATION. A leader's rollup covers only their own subtree; a sibling branch's
       items never appear. One person reached via several paths sees an item ONCE (deduped).

   Discipline: PURE — imports nothing, deterministic, cycle-safe. Member-safe output (labels
   + urgency + counts; no raw evidence, ids beyond node/user refs the caller already holds).
   ============================================================ */

const uniq = arr => [...new Set(arr)];

/* Transitive descendants of a node (cycle-safe), over a graph { childrenOf: Map }. */
function _descendants(graph, nodeId) {
  const out = new Set(); const stack = [...(graph.childrenOf.get(nodeId) || [])];
  while (stack.length) { const id = stack.pop(); if (out.has(id)) continue; out.add(id); for (const n of (graph.childrenOf.get(id) || [])) if (!out.has(n)) stack.push(n); }
  return out;
}
/* The nearest leader(s) at or above a node, per parent path (breadth-first up). Returns a
   deterministic, sorted list of user ids (may be >1 when parents diverge). */
function _nearestLeaders(graph, nodeId) {
  const found = new Set(), seen = new Set(), q = [nodeId];
  while (q.length) {
    const id = q.shift();
    if (id == null || seen.has(id)) continue; seen.add(id);
    const n = graph.byId.get(id);
    if (n && (n.leaderIds || []).length) { (n.leaderIds || []).forEach(l => found.add(l)); continue; }   // stop climbing this path once a leader is found
    for (const p of (graph.parentsOf.get(id) || [])) q.push(p);
  }
  return uniq([...found]).sort();
}

/* ── buildRoutes — decide, for each item, the target(s) and whether it is a conflict.
   item: { id, label, urgency, subjectNodeId, ownerUserId? }. ── */
function buildRoutes(graph, items = []) {
  const routes = [];
  for (const it of items) {
    const base = { itemId: it.id, label: it.label || 'unresolved item', urgency: it.urgency || 'normal', subjectNodeId: it.subjectNodeId || null };
    if (it.ownerUserId) { routes.push({ ...base, via: 'owner', targets: [it.ownerUserId], conflict: false }); continue; }
    if (!it.subjectNodeId || !graph.byId.has(it.subjectNodeId)) { routes.push({ ...base, via: 'unassigned', targets: [], conflict: false, needsOwner: true }); continue; }
    const parents = [...(graph.parentsOf.get(it.subjectNodeId) || [])];
    // A leader ON the subject node owns it directly (single, explicit).
    const own = graph.byId.get(it.subjectNodeId);
    if (own && (own.leaderIds || []).length) { routes.push({ ...base, via: 'node_leader', targets: uniq(own.leaderIds).sort(), conflict: false }); continue; }
    // No leader on the node → escalate to the nearest leader(s) above. Multiple divergent
    // parents with no explicit owner = a CONFLICT (surface to all; a human assigns a primary).
    const leaders = _nearestLeaders(graph, it.subjectNodeId);
    const conflict = parents.length >= 2 && leaders.length >= 2;
    routes.push({ ...base, via: leaders.length ? 'escalated' : 'unassigned', targets: leaders, conflict, needsOwner: leaders.length === 0, ...(conflict ? { conflictParents: parents.sort() } : {}) });
  }
  return routes;
}

/* ── inboxFor — the items routed TO a person, deduped (reached via several paths → once). ── */
function inboxFor(routes, userId) {
  const seen = new Set(), out = [];
  for (const r of routes) {
    if (!(r.targets || []).includes(userId)) continue;
    if (seen.has(r.itemId)) continue; seen.add(r.itemId);
    out.push({ itemId: r.itemId, label: r.label, urgency: r.urgency, via: r.via, conflict: !!r.conflict, sharedWith: (r.targets || []).filter(t => t !== userId) });
  }
  return out.sort((a, b) => (URG[b.urgency] || 0) - (URG[a.urgency] || 0) || String(a.itemId).localeCompare(String(b.itemId)));
}
const URG = { immediate: 4, high: 3, medium: 2, normal: 1, low: 0 };

/* ── rollupFor — an audience-safe summary of unresolved items across a leader's OWN subtree
   (their led nodes + all descendants). A sibling branch never appears. Counts + labels only. ── */
function rollupFor(graph, items = [], { leaderNodeIds = [] } = {}) {
  const scope = new Set();
  for (const n of leaderNodeIds) { if (!graph.byId.has(n)) continue; scope.add(n); for (const d of _descendants(graph, n)) scope.add(d); }
  const inScope = items.filter(it => it.subjectNodeId && scope.has(it.subjectNodeId));
  const byUrgency = {};
  for (const it of inScope) byUrgency[it.urgency || 'normal'] = (byUrgency[it.urgency || 'normal'] || 0) + 1;
  return {
    total: inScope.length, byUrgency,
    unassigned: inScope.filter(it => !it.ownerUserId).length,
    items: inScope.map(it => ({ label: it.label || 'unresolved item', urgency: it.urgency || 'normal', hasOwner: !!it.ownerUserId }))
      .sort((a, b) => (URG[b.urgency] || 0) - (URG[a.urgency] || 0) || a.label.localeCompare(b.label)),
  };
}

/* ── conflicts — multi-parent items with no explicit owner, needing a human ownership
   decision (never resolved by ancestry). Safe: labels + which parents share responsibility. ── */
function conflicts(routes) {
  return routes.filter(r => r.conflict).map(r => ({ itemId: r.itemId, label: r.label, urgency: r.urgency,
    reason: 'This work sits under more than one area and has no assigned owner — a leader needs to decide who owns it.',
    sharedBetween: r.conflictParents || [], routedTo: r.targets || [] }));
}

module.exports = { buildRoutes, inboxFor, rollupFor, conflicts, _nearestLeaders, _descendants };
