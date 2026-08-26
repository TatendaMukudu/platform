/* ============================================================
   ai/scoped-intelligence-packet.js - Scoped Intelligence Packet (pure)

   The packet layer applies the organisation web to an already-normalized feed.
   It makes each person smarter inside their scope, not distracted by the whole
   organisation.

   Rules:
     - A leader reasons over their led node(s) and descendants.
     - A member reasons over their own node(s), direct parent context, and self.
     - Sibling branches do not leak sideways.
     - A good question may travel upward as a safe artifact, but the asker does
       not receive broader information just because they asked it.

   PURE: no DB, no AI, no IO. Callers own tenant/auth/privacy before inputs arrive.
   ============================================================ */

'use strict';

const graph = require('./org-graph');
const priority = require('./priority-office');
const guard = require('./language-guard');

const QUESTION_KINDS = Object.freeze(['process_challenge', 'context_gap', 'policy_question', 'practice_question', 'goal_question']);
const PACKET_SECTIONS = Object.freeze(['needs_attention', 'working_well', 'process_questions', 'outcome_history', 'personal_patterns', 'playbook', 'questions_upward', 'other']);

function _s(v, n = 240) { return String(v == null ? '' : v).trim().slice(0, n); }
function _key(v) { return _s(v || 'unknown', 100).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'unknown'; }
function _hash(str) { let h = 5381; const s = String(str); for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i); return (h >>> 0).toString(36); }
function _arr(v) { return Array.isArray(v) ? v.filter(Boolean) : v ? [v] : []; }
function _nodeList(nodes) { return Array.isArray(nodes) ? nodes : Object.values(nodes || {}); }

function actorScope(nodes = [], actor = {}) {
  const userId = actor.userId || actor.id;
  const g = graph.buildGraph(nodes);
  const declared = {
    leaderNodeIds: actor.leaderNodeIds || graph.scopeOfActor(nodes, userId).leaderNodeIds,
    memberNodeIds: actor.memberNodeIds || graph.scopeOfActor(nodes, userId).memberNodeIds,
  };
  const visibleNodes = graph.visibleScope(g, declared);
  // W-3 can make a branch leader see every node in a shallow graph. Authority
  // therefore comes from leading a root node, never from incidental coverage.
  const leadsARootNode = declared.leaderNodeIds.some(
    n => g.byId.has(n) && (g.parentsOf.get(n) || new Set()).size === 0);
  const role = declared.leaderNodeIds.length ? (leadsARootNode ? 'top_leader' : 'leader') : 'member';
  return { graph: g, userId, role, leaderNodeIds: declared.leaderNodeIds, memberNodeIds: declared.memberNodeIds, visibleNodes };
}

function subjectNodeIds(nodes = [], subjectId) {
  const out = [];
  for (const n of _nodeList(nodes)) if (n && n.nodeId && (n.memberIds || []).includes(subjectId)) out.push(n.nodeId);
  return out.sort();
}

function canUseItem(item = {}, scope = {}, nodes = [], opts = {}) {
  const userId = scope.userId;
  if (!item || item.safe === false) return false;

  if (item.scope != null) return graph.canSee(scope.visibleNodes, item.scope);

  if (item.level === 'personal' || item.level === 'person' || item.subjectId) {
    if (item.subjectId && item.subjectId === userId) return true;
    if (!item.subjectId) return scope.role !== 'member' || opts.allowPersonalWithoutSubject === true;
    if (scope.role === 'member') return false;
    const subjectNodes = subjectNodeIds(nodes, item.subjectId);
    return subjectNodes.some(n => scope.visibleNodes.includes(n));
  }

  return item.scope == null && opts.includeOrgWide !== false;
}

function sectionOf(item = {}) {
  if (item.source === 'outcome_intelligence' || item.kind === 'outcome_history') return 'outcome_history';
  if (item.source === 'process_reflection' || item.kind === 'process_question') return 'process_questions';
  if (item.source === 'self_model') return 'personal_patterns';
  if (item.source === 'org_playbook') return 'playbook';
  if (item.polarity === 'risk' || item.polarity === 'friction') return 'needs_attention';
  if (['progress', 'strength', 'milestone', 'opportunity'].includes(item.polarity)) return 'working_well';
  return 'other';
}

function sectionItems(items = []) {
  const sections = {};
  for (const s of PACKET_SECTIONS) sections[s] = [];
  for (const item of items) sections[sectionOf(item)].push(item);
  return sections;
}

function questionArtifact(question = {}, scope = {}, nodes = {}) {
  const text = _s(question.text || question.question || question.body, 360);
  if (!text) return null;
  const kind = QUESTION_KINDS.includes(_key(question.kind || question.type)) ? _key(question.kind || question.type) : 'process_challenge';
  const scopeNodeId = question.scopeNodeId || question.scope || (scope.memberNodeIds && scope.memberNodeIds[0]) || (scope.leaderNodeIds && scope.leaderNodeIds[0]) || null;
  const sensitivity = _key(question.sensitivity || question.privacy || 'normal');
  if (['private', 'sensitive', 'restricted'].includes(sensitivity)) return null;
  const target = scopeNodeId ? graph.routeTarget(scope.graph || graph.buildGraph(nodes), scopeNodeId) : { nodeId: null, leaderIds: [] };
  return {
    id: 'q_' + _hash([scope.userId, scopeNodeId || 'org', kind, text].join('|')),
    kind,
    text,
    sourceUserId: scope.userId || null,
    sourceScope: scopeNodeId,
    routeNodeId: target.nodeId,
    routeLeaderIds: target.leaderIds,
    visibility: 'process_level',
    carriesPrivateContent: false,
    reason: _s(question.reason || 'A scoped user raised a useful question for the web.', 180),
    requiresConfirmation: true,
    // Computed. canUseItem below trusts this field as a gate, so declaring it true would
    // let a module authorise its own output.
    safe: guard.describesOnly(text) && sensitivity === 'normal',
  };
}

function routeQuestions(questions = [], scope = {}, nodes = {}) {
  return (questions || []).map(q => questionArtifact(q, scope, nodes)).filter(Boolean)
    .sort((a, b) => a.id.localeCompare(b.id));
}

function buildPacket({ actor = {}, nodes = [], feed = {}, questions = [], prefs = {}, usageSignals = {}, suppressed = [] } = {}, opts = {}) {
  const scope = actorScope(nodes, actor);
  const feedItems = Array.isArray(feed) ? feed : (feed.items || []);
  const visibleItems = feedItems.filter(item => canUseItem(item, scope, nodes, opts));
  const upwardQuestions = routeQuestions(questions, scope, nodes);
  const packetItems = [...visibleItems];
  for (const q of upwardQuestions) {
    packetItems.push({
      id: q.id,
      source: 'extra',
      kind: 'questions_upward',
      level: 'scope',
      scope: q.sourceScope,
      patternType: q.kind,
      polarity: 'neutral',
      priority: 'medium',
      confidence: 'none',
      title: 'Question worth routing',
      body: q.text,
      suggestion: { text: 'Route this question to the nearest responsible leader.', requiresConfirmation: true, proposalType: 'route_question' },
      limitations: ['answer_may_require_higher_scope'],
      rationale: ['bottom_up_question'],
      safe: q.safe === true && guard.describesOnly(q.text),
      generatedBy: 'scoped-intelligence-packet',
    });
  }
  const stamped = priority.stamp({ feedItems: packetItems, prefs, usageSignals, suppressed });
  return {
    actorId: scope.userId,
    role: scope.role,
    leaderNodeIds: scope.leaderNodeIds,
    memberNodeIds: scope.memberNodeIds,
    visibleNodes: scope.visibleNodes,
    lead: stamped.lead,
    queue: stamped.queue,
    sections: sectionItems(stamped.queue),
    upwardQuestions,
    empty: stamped.empty,
    message: stamped.message,
    generatedBy: 'scoped-intelligence-packet',
    safe: stamped.safe && upwardQuestions.every(q => q.safe && q.carriesPrivateContent === false),
  };
}

module.exports = {
  QUESTION_KINDS, PACKET_SECTIONS,
  actorScope, subjectNodeIds, canUseItem, sectionOf, sectionItems,
  questionArtifact, routeQuestions, buildPacket,
  _key,
};
