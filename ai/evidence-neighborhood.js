/* ============================================================
   ai/evidence-neighborhood.js — explicit cross-evidence relationships (pure)

   This module does NOT retrieve, authorise, infer sentiment, call AI, set confidence,
   or mutate truth. It receives artifacts that have already passed scope/privacy gates
   and identifies only explicit canonical relationships between them.

   Related evidence can change ATTENTION, never epistemic confidence.
   ============================================================ */

'use strict';

function _arr(v) { return Array.isArray(v) ? v.filter(Boolean).map(String) : v ? [String(v)] : []; }
function _uniq(v) { return [...new Set(_arr(v))].sort(); }
function _priorityRank(p) {
  return ({ urgent: 5, high: 4, medium: 3, low: 2, none: 1 })[String(p || 'none')] || 1;
}
function _higherPriority(a, b) { return _priorityRank(a) >= _priorityRank(b) ? (a || 'none') : (b || 'none'); }
function _intersects(a, b) {
  const A = new Set(_arr(a));
  return _arr(b).some(x => A.has(x));
}
function _refs(item = {}) {
  return {
    evidence: _uniq(item.evidenceRefs),
    concepts: _uniq(item.conceptRefs),
    objects: _uniq(item.objectRefs),
    contexts: _uniq(item.contextRefs),
  };
}
function _relationshipKinds(a = {}, b = {}) {
  const A = _refs(a), B = _refs(b), kinds = [];
  if (_intersects(A.evidence, B.evidence)) kinds.push('same_evidence');
  if (_intersects(A.concepts, B.concepts)) kinds.push('same_concept');
  if (_intersects(A.objects, B.objects)) kinds.push('same_object_ref');
  if (_intersects(A.contexts, B.contexts)) kinds.push('same_context_ref');

  const aAddresses = _arr(a.addressesRefs || a.addressesRef);
  const bAddresses = _arr(b.addressesRefs || b.addressesRef);
  const aIds = _uniq([a.id, ...A.objects]);
  const bIds = _uniq([b.id, ...B.objects]);
  if (_intersects(aAddresses, bIds) || _intersects(bAddresses, aIds)) kinds.push('explicit_address');

  const aLineage = _arr([a.corrects, a.correctionOf, a.supersedes, a.supersededBy].flat().filter(Boolean));
  const bLineage = _arr([b.corrects, b.correctionOf, b.supersedes, b.supersededBy].flat().filter(Boolean));
  if (_intersects(aLineage, bIds) || _intersects(bLineage, aIds)) kinds.push('lineage');
  return [...new Set(kinds)];
}

function connect(items = [], { currentId = null, max = 12 } = {}) {
  const rows = (items || []).filter(Boolean);
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i], b = rows[j];
      const kinds = _relationshipKinds(a, b);
      if (!kinds.length) continue;
      if (currentId && String(a.id) !== String(currentId) && String(b.id) !== String(currentId)) continue;

      const priority = _higherPriority(a.priority, b.priority);
      const ids = [String(a.id || ''), String(b.id || '')].sort();
      out.push({
        id: `rel:${ids[0]}:${ids[1]}`,
        source: 'extra',
        kind: 'related_evidence',
        level: a.level === b.level ? (a.level || 'scope') : 'scope',
        subjectId: a.subjectId && a.subjectId === b.subjectId ? a.subjectId : null,
        scope: a.scope && a.scope === b.scope ? a.scope : null,
        polarity: 'neutral',
        priority,
        confidence: 'none',
        title: 'Related evidence is worth another look',
        body: priority === 'urgent' || priority === 'high'
          ? 'A related authorised item elsewhere is already carrying higher attention.'
          : 'These authorised items are explicitly related in the current evidence graph.',
        relationKinds: kinds,
        relatedItemIds: ids,
        evidenceRefs: _uniq([...(a.evidenceRefs || []), ...(b.evidenceRefs || [])]),
        conceptRefs: _uniq([...(a.conceptRefs || []), ...(b.conceptRefs || [])]),
        objectRefs: _uniq([...(a.objectRefs || []), ...(b.objectRefs || [])]),
        limitations: ['relationship_changes_attention_not_confidence', 'no_causal_claim'],
        rationale: kinds.map(k => `relationship:${k}`),
        requiresConfirmation: false,
        generatedBy: 'evidence-neighborhood',
      });
    }
  }
  return out.sort((x, y) => _priorityRank(y.priority) - _priorityRank(x.priority) || x.id.localeCompare(y.id)).slice(0, max);
}

module.exports = { connect, _relationshipKinds, _priorityRank };
