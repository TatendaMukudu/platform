/* ============================================================
   ai/evidence-class.js — EVIDENCE SCOPE (pure)

   Evidence can establish only the kind of proposition it actually carries. A calendar can
   establish that a meeting occurred; it cannot establish that the meeting was useful. Message
   metadata can establish communication rhythm; it cannot establish how the message was received.

   A governed adapter supplies class vocabulary; model proposals do not. This module owns the
   allowlists and decides compatibility. Unknown fails closed. Derived evidence must name the
   already-governed input classes it restates and can never outrun them.
   ============================================================ */
'use strict';

const EVIDENCE_CLASSES = Object.freeze([
  'occurrence', 'communication', 'reported_experience', 'observation', 'document', 'derived', 'unknown',
]);
const CLAIM_CLASSES = Object.freeze([
  'occurrence', 'communication', 'reported_experience', 'observation', 'document',
]);

const ORIGIN_CLASS = Object.freeze({
  direct_observation: 'observation',
  self_report: 'reported_experience',
  reported: 'observation',
  document: 'document',
  system: 'derived',
  unknown: 'unknown',
});

const key = value => String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');

function evidenceClassOf(value = {}) {
  const explicit = key(typeof value === 'string' ? value : value.evidenceClass);
  if (EVIDENCE_CLASSES.includes(explicit)) return explicit;
  const origin = key(value && typeof value === 'object' ? value.originKind : '');
  return ORIGIN_CLASS[origin] || 'unknown';
}

function claimClassOf(value = {}) {
  const explicit = key(typeof value === 'string' ? value : value.claimClass);
  return CLAIM_CLASSES.includes(explicit) ? explicit : 'unknown';
}

function basisClassesOf(evidence = {}) {
  const input = Array.isArray(evidence.basisClasses) ? evidence.basisClasses : [];
  return [...new Set(input.map(claimClassOf).filter(c => c !== 'unknown'))].sort();
}

function canEstablish(evidence = {}, claim = {}) {
  const evidenceClass = evidenceClassOf(evidence);
  const claimClass = claimClassOf(claim);
  if (evidenceClass === 'unknown' || claimClass === 'unknown') return false;
  if (evidenceClass === 'derived') return basisClassesOf(evidence).includes(claimClass);
  return evidenceClass === claimClass;
}

function partitionSupport(evidence = [], claim = {}) {
  const admissible = [], excluded = [];
  for (const item of Array.isArray(evidence) ? evidence : []) {
    if (canEstablish(item, claim)) admissible.push(item);
    else excluded.push({ ref: item && item.ref ? String(item.ref) : null, reason: 'class_mismatch',
      evidenceClass: evidenceClassOf(item), claimClass: claimClassOf(claim) });
  }
  return { admissible, excluded };
}

module.exports = {
  EVIDENCE_CLASSES, CLAIM_CLASSES, ORIGIN_CLASS,
  evidenceClassOf, claimClassOf, basisClassesOf, canEstablish, partitionSupport,
};
