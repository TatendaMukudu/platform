/* ============================================================
   ai/org-graph.js — PURE organisational information-web scoping

   The organisation is a graph of nodes (teams, groups, functions). A node can have
   MANY parents — e.g. an "athletic trainers" node that reports to both "team" and "team
   psychologists". Information flows through that web with a deliberate ASYMMETRY:

     • A PARENT sees UP THE WHOLE SUBTREE beneath it — its children, grandchildren, …
       to the furthest descendant. (A CEO can see what is happening across every group
       under them; a team lead sees everything within their team.)
     • A CHILD sees ONLY what comes from its DIRECT PARENT — not its siblings, not other
       branches, not its grandparents. (A member sees what their team shares down to
       them, and no further.)

   This module computes those visibility scopes and where a question should be routed. It
   is the RULE that scopes retrieval, org-state, and inquiry per person — so answers pull
   across the web correctly and questions land where they can be answered.

   Discipline: PURE — imports nothing, deterministic, cycle-safe. It NEVER reads evidence
   content; it only reasons over node structure + membership. Callers apply the scope.
   ============================================================ */

const uniqSort = arr => [...new Set(arr)].sort();

/* Normalise a node collection into an adjacency model. Accepts an array or a
   `{nodeId → node}` map. A node may declare parents via `parentIds` (multi) or `parentId`
   (single), and/or children via `childNodeIds`; every edge is applied both ways so the
   graph is consistent regardless of which side declared it. Dangling/self edges ignored. */
function buildGraph(nodes) {
  const list = Array.isArray(nodes) ? nodes : Object.values(nodes || {});
  const byId = new Map();
  for (const n of list) if (n && n.nodeId) byId.set(n.nodeId, n);
  const parentsOf = new Map(), childrenOf = new Map();
  for (const id of byId.keys()) { parentsOf.set(id, new Set()); childrenOf.set(id, new Set()); }
  const addEdge = (parent, child) => {
    if (parent === child || !byId.has(parent) || !byId.has(child)) return;
    parentsOf.get(child).add(parent); childrenOf.get(parent).add(child);
  };
  for (const n of byId.values()) {
    const ps = Array.isArray(n.parentIds) ? n.parentIds : (n.parentId ? [n.parentId] : []);
    for (const p of ps) addEdge(p, n.nodeId);
    for (const c of (n.childNodeIds || [])) addEdge(n.nodeId, c);
  }
  return { byId, parentsOf, childrenOf };
}

/* Transitive walk over an adjacency map from a start node (cycle-safe; excludes start). */
function _walk(map, start) {
  const out = new Set();
  const stack = [...(map.get(start) || [])];
  while (stack.length) {
    const id = stack.pop();
    if (out.has(id)) continue;
    out.add(id);
    for (const nx of (map.get(id) || [])) if (!out.has(nx)) stack.push(nx);
  }
  return out;
}
function descendants(graph, nodeId) { return _walk(graph.childrenOf, nodeId); }
function ancestors(graph, nodeId)   { return _walk(graph.parentsOf, nodeId); }

/* ── THE SCOPE — the set of node ids whose shared information an actor may draw on.
   Leader of a node ⇒ that node + its ENTIRE subtree (sees down to the furthest child).
   Member of a node ⇒ that node + its DIRECT parents only (sees info coming from its
   parent, and no further). The union over every node the actor leads/belongs to. ── */
function visibleScope(graph, { leaderNodeIds = [], memberNodeIds = [] } = {}) {
  const seen = new Set();
  for (const n of leaderNodeIds) {
    if (!graph.byId.has(n)) continue;
    seen.add(n);
    for (const d of descendants(graph, n)) seen.add(d);
  }
  for (const n of memberNodeIds) {
    if (!graph.byId.has(n)) continue;
    seen.add(n);
    for (const p of (graph.parentsOf.get(n) || [])) seen.add(p);
  }
  return uniqSort([...seen]);
}

/* Derive an actor's leader/member node ids from a node collection's leaderIds/memberIds. */
function scopeOfActor(nodes, userId) {
  const list = Array.isArray(nodes) ? nodes : Object.values(nodes || {});
  const leaderNodeIds = [], memberNodeIds = [];
  for (const n of list) {
    if (!n || !n.nodeId) continue;
    if ((n.leaderIds || []).includes(userId)) leaderNodeIds.push(n.nodeId);
    else if ((n.memberIds || []).includes(userId)) memberNodeIds.push(n.nodeId);
  }
  return { leaderNodeIds: uniqSort(leaderNodeIds), memberNodeIds: uniqSort(memberNodeIds) };
}

/* Convenience: the full visible-scope set for a user over a node collection. */
function visibleNodesFor(nodes, userId) {
  const graph = buildGraph(nodes);
  return visibleScope(graph, scopeOfActor(nodes, userId));
}

/* ── ROUTING — where a question/prompt about a node should go: the nearest leader AT or
   ABOVE the node (breadth-first up the parents). So an unanswered item is prompted to the
   person who can actually resolve it, walking up the web until a leader is found. ── */
function routeTarget(graph, nodeId) {
  const queue = [nodeId], seen = new Set();
  while (queue.length) {
    const id = queue.shift();
    if (id == null || seen.has(id)) continue;
    seen.add(id);
    const n = graph.byId.get(id);
    if (n && (n.leaderIds || []).length) return { nodeId: id, leaderIds: uniqSort(n.leaderIds) };
    for (const p of (graph.parentsOf.get(id) || [])) queue.push(p);
  }
  return { nodeId: null, leaderIds: [] };
}

/* Can an actor (with visible scope `visible`) see information SCOPED to `scopeNodeId`?
   A null/absent scope is org-wide (broadcast) and visible to everyone — this is the safe
   default that preserves behaviour for orgs with no node structure configured. */
function canSee(visible, scopeNodeId) {
  if (scopeNodeId == null) return true;
  return Array.isArray(visible) ? visible.includes(scopeNodeId) : !!(visible && visible.has(scopeNodeId));
}

module.exports = {
  buildGraph, descendants, ancestors, visibleScope, scopeOfActor, visibleNodesFor, routeTarget, canSee,
};
