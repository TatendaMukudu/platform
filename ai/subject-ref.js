'use strict';

/* Typed subject identity. Parsing is deliberately syntactic and fail-closed;
   authorization and existence remain the caller's responsibility. */
const KINDS = Object.freeze(['member', 'group', 'organisation', 'relationship-claim']);

/* ── RELATIONSHIP REFERENCES (D-A3) ──────────────────────────────────────────
   A relationship claim is an Inquiry subject, not a row in a relationship store — there is no
   store here and there must never be one. The reference itself carries its endpoints, for one
   reason: ERASURE MUST BE ABLE TO FIND IT. If the endpoints lived in an index instead, removing
   a person would depend on that index being kept in step by hand, and the day it drifts a claim
   naming an erased person outlives them.

   The grammar:
     undirected   relationship-claim:<a>~<b>#<concept>     endpoints SORTED
     directed     relationship-claim:<from>><to>#<concept>  order MEANS something

   Sorting the undirected form is what stops A↔B and B↔A becoming two subjects — which would be
   two inquiries, two confidences, and two halves of one body of evidence that never corroborate
   each other. Where direction genuinely matters ("A mentors B" is not "B mentors A") it is
   DECLARED, because direction carried by accidental argument order is direction a sort destroys. */
const REL = 'relationship-claim';
const UNDIRECTED = '~';
const DIRECTED = '>';
const CONCEPT = '#';
/* An endpoint may not contain the grammar's own punctuation, or a crafted id could forge a
   different subject. Refused rather than escaped: an id with a tilde in it is a bug upstream. */
const _badEndpoint = (v) => typeof v !== 'string' || !v || /[~>#:\s]/.test(v) || v.length > 80;

function relationshipRef(endpoints = [], { concept = '', directed = false } = {}) {
  const eps = Array.isArray(endpoints) ? endpoints.map(e => String(e == null ? '' : e).trim()) : [];
  if (eps.length !== 2) return null;
  if (eps.some(_badEndpoint)) return null;
  if (eps[0] === eps[1]) return null;                       // a thing is not in a relationship with itself
  const c = String(concept || '').trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, '_').replace(/^_+|_+$/g, '');
  if (!c) return null;
  const pair = directed ? eps.join(DIRECTED) : [...eps].sort().join(UNDIRECTED);
  return `${REL}:${pair}${CONCEPT}${c}`;
}

function _parseRelationship(id) {
  const at = id.lastIndexOf(CONCEPT);
  if (at < 1) return null;
  const pair = id.slice(0, at), concept = id.slice(at + 1);
  if (!concept) return null;
  const directed = pair.includes(DIRECTED);
  const eps = directed ? pair.split(DIRECTED) : pair.split(UNDIRECTED);
  if (eps.length !== 2 || eps.some(_badEndpoint) || eps[0] === eps[1]) return null;
  return { endpoints: eps, directed, concept };
}

function parse(ref) {
  if (typeof ref !== 'string') return null;
  const at = ref.indexOf(':');
  if (at < 1) return null;
  const kind = ref.slice(0, at);
  const id = ref.slice(at + 1);
  if (!KINDS.includes(kind) || !id || id.length > 200 || /\s/.test(id)) return null;
  if (kind === REL) {
    const rel = _parseRelationship(id);
    if (!rel) return null;                                   // fail closed — Lane D invariant 14
    return Object.freeze({ kind, id, ref: `${kind}:${id}`, endpoints: Object.freeze(rel.endpoints),
      directed: rel.directed, concept: rel.concept });
  }
  return Object.freeze({ kind, id, ref: `${kind}:${id}`, endpoints: Object.freeze([]), directed: false, concept: '' });
}

/* The erasure door. Every subject a person can be named in must answer this, so that removing
   somebody is a sweep over references rather than a list of stores somebody has to remember. */
function endpointsOf(ref) {
  const p = parse(ref);
  return p ? [...p.endpoints] : [];
}
function mentions(ref, id) {
  if (!id) return false;
  return endpointsOf(ref).includes(String(id));
}

module.exports = { KINDS, REL, parse, relationshipRef, endpointsOf, mentions };
