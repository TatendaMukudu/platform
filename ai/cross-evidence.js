/* ============================================================================================
   ai/cross-evidence.js — the relationships that ALREADY EXIST, read back (PURE)

   THE FINDING THIS MODULE IS BUILT ON. The relationships the founder asked for are not missing
   from the product; they are missing from the READER. A personal Focus has carried
   `addresses: {kind, id}` since the object-and-focus contract. A High or Low carries the
   `inquiryId` it was projected from. A Focus carries its own `outcome`. Evidence carries
   `originRef`, `status` and `supersededBy`. Every edge below is one of those fields, read.

   So this module ADDS NO TRUTH. It creates no store, mints no id, and writes nothing. Given a set
   of objects that have ALREADY passed the caller's scope gate, it returns the edges between them
   and nothing else. That is the whole contract, and it is what makes "relevance is not
   authorisation" hold structurally rather than by remembering: an edge to something the caller
   did not pass in cannot be returned, because this module has never seen it.

   WHAT IT MAY NOT DO, and each of these is a law with a history:
     - read storage, call a model, or take a userId (it cannot authorise, so it cannot be asked to)
     - copy a statement, a headline, a body, a claim or a message into an edge (L-EV: evidence is
       referenced, never copied)
     - raise confidence because an edge exists (repetition is not corroboration; two objects
       citing ONE origin is one origin, and an edge between them does not make it two)
     - say anything about the future

   WHAT IT MAY DO: name that A and B are connected, by which existing field, in which direction.

   Run: node scripts/cross-evidence-smoke.js
   ============================================================================================ */

'use strict';

/* THE VOCABULARY IS CLOSED, and it is deliberately short. Every type below is a field that
   already exists on a governed object — nothing here is a new concept the product would then owe
   a definition for. `informed_by`, `reinforced_by` and `contradicted_by` are NOT here on purpose:
   deciding that evidence REINFORCES or CONTRADICTS a direction is a judgement the product does
   not currently make anywhere, and inventing it in a reader would be an ontology change wearing
   a retrieval change's clothes. See docs/reviews/CROSS_EVIDENCE_R2.md, "Stopped on". */
const REL = Object.freeze([
  'addresses',        // a Focus was started to work on this Inquiry/High/Low   (focus.addresses)
  'addressed_by',     // …the same edge, read from the object being worked on
  'projected_from',   // a High/Low is a projection of this Inquiry             (raw.inquiryId)
  'projected_to',     // …the same edge, read from the Inquiry
  'shares_evidence',  // two objects cite at least one identical evidence ref
  'supersedes',       // a correction: this record replaced that one            (supersededBy)
  'superseded_by',
]);

const INVERSE = Object.freeze({
  addresses: 'addressed_by', addressed_by: 'addresses',
  projected_from: 'projected_to', projected_to: 'projected_from',
  supersedes: 'superseded_by', superseded_by: 'supersedes',
  shares_evidence: 'shares_evidence',
});

const KINDS = Object.freeze(['focus', 'inquiry', 'high', 'low']);

const _s = (v, n = 120) => String(v == null ? '' : v).trim().slice(0, n);
const _arr = v => (Array.isArray(v) ? v.filter(Boolean) : []);

/* THE CANONICAL REF. One shape, `kind:id`, the same one `about` uses to bind threads and the
   shelf uses to file. A second address format would be a second identity for the same object. */
function ref(kind, id) {
  const k = _s(kind, 20), i = _s(id, 80);
  return KINDS.includes(k) && i ? `${k}:${i}` : null;
}
function refOf(obj) { return obj ? ref(obj.kind, obj.id) : null; }
function parseRef(r) {
  const s = _s(r, 120), i = s.indexOf(':');
  if (i < 1) return null;
  const kind = s.slice(0, i), id = s.slice(i + 1);
  return KINDS.includes(kind) && id ? { kind, id } : null;
}

/* WHAT THIS OBJECT POINTS AT, taken only from fields that already exist. Returns refs, never
   text. An object whose pointer names something outside the passed-in set simply yields no edge —
   the caller's scope gate decided that, not this module. */
/* WHAT A FOCUS WAS STARTED TO WORK ON — AND THERE ARE TWO RECORDS OF IT, BECAUSE THERE ARE TWO
   KINDS OF FOCUS AND TWO OWNERS WROTE THEM.

     A PERSONAL Focus carries  raw.addresses = { kind, id }   — the object-and-focus contract
     A GROUP Focus carries     raw.origin.inquiryId           — ai/team-state.js newFocus()

   This module read the first shape only, so a group Focus produced `edges: []` and `addresses:
   null` — no relationship at all, on the half of the product where the A -> B loop is the point.
   An independent gate found it, and found the reason the suite did not: the fixture that proved
   this reader was a PERSONAL Focus written in the personal shape, so its green result said
   nothing whatever about the group path it was taken to cover.

   READ BOTH, DO NOT REWRITE EITHER. The alternative — normalising stored group Focuses into the
   personal shape — would put a second author on records ai/team-state.js owns, and would have to
   run against every focus that already exists. `origin.inquiryId` is the canonical owner's field
   and stays the canonical owner's field; this is the reader catching up to it.

   `origin.from` is NOT consulted here on purpose. It distinguishes a Focus the system proposed
   from one a leader decided alone, which matters to outcome learning and not at all to whether
   the link exists: a leader who starts a focus on an inquiry has still started it on that
   inquiry. Requiring from === 'inquiry' would drop a real edge over a provenance flag. */
function _addressed(o) {
  const a = (o && o.raw && o.raw.addresses) || (o && o.addresses) || null;
  if (a && a.kind && a.id) { const r = ref(a.kind, a.id); if (r) return { ref: r, basis: 'focus.addresses' }; }
  if (!o || o.kind !== 'focus') return null;
  const origin = (o.raw && o.raw.origin) || o.origin || null;
  const inquiryId = origin && origin.inquiryId ? _s(origin.inquiryId, 80) : '';
  const r = inquiryId ? ref('inquiry', inquiryId) : null;
  /* THE BASIS NAMES THE FIELD THAT PRODUCED THE EDGE, and it has to be the RIGHT field: this
     module's own rule is that an edge nobody can trace back to a field is an edge somebody will
     eventually treat as a judgement. A group edge reported as `focus.addresses` would send the
     next reader to a field that is not there. */
  return r ? { ref: r, basis: 'focus.origin.inquiryId' } : null;
}
function _addressRef(o) { const a = _addressed(o); return a ? a.ref : null; }
function _projectedFromRef(o) {
  // A High or Low is a projection OF an inquiry. A focus is not, and an inquiry is not itself.
  if (!o || (o.kind !== 'high' && o.kind !== 'low')) return null;
  const id = (o.raw && (o.raw.inquiryId || o.raw.sourceInquiryId)) || null;
  return id ? ref('inquiry', id) : null;
}
/* EVIDENCE REFS, AS REFS. Signals are read for their `ref` and `originRef` only; nothing else on
   a signal is touched, so no statement can travel out of here inside an edge. */
function evidenceRefsOf(o) {
  const out = new Set();
  for (const s of _arr(o && o.raw && o.raw.signals)) {
    if (s && s.ref) out.add(_s(s.ref, 120));
  }
  for (const r of _arr(o && o.raw && o.raw.evidenceRefs)) out.add(_s(r, 120));
  const basis = o && o.raw && o.raw.basis;
  for (const b of _arr(basis && basis.refs)) out.add(_s(b, 120));
  out.delete('');
  return [...out].sort();
}
/* ORIGINS, kept separate from evidence refs and never counted here. This module reports which
   origins two objects have in common so a caller can SAY it; it must not be read as corroboration.
   Two objects resting on the same one telling is one telling, which is the point of surfacing it. */
function originRefsOf(o) {
  const out = new Set();
  for (const s of _arr(o && o.raw && o.raw.signals)) {
    if (s && s.originRef) out.add(_s(s.originRef, 120));
  }
  out.delete('');
  return [...out].sort();
}
function _lineageRefs(o) {
  const out = new Set();
  for (const s of _arr(o && o.raw && o.raw.signals)) {
    if (s && s.supersededBy) out.add(_s(s.supersededBy, 120));
  }
  out.delete('');
  return [...out].sort();
}

/* ── THE EDGES ──────────────────────────────────────────────────────────────────────────────
   Directed, deduplicated, and only ever between two objects the caller handed in. `basis` says
   WHICH field produced the edge, because an edge nobody can trace back to a field is an edge
   somebody will eventually treat as a judgement. */
function edges(objects = []) {
  const rows = _arr(objects).filter(o => refOf(o));
  const byRef = new Map(rows.map(o => [refOf(o), o]));
  const out = [];
  const seen = new Set();
  const add = (from, type, to, basis) => {
    if (!from || !to || from === to || !byRef.has(from) || !byRef.has(to)) return;
    if (!REL.includes(type)) return;
    const key = `${from}|${type}|${to}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ from, type, to, basis: _s(basis, 60) });
  };

  for (const o of rows) {
    const self = refOf(o);

    const addressed = _addressed(o);
    if (addressed) {
      add(self, 'addresses', addressed.ref, addressed.basis);
      add(addressed.ref, 'addressed_by', self, addressed.basis);
    }

    const projected = _projectedFromRef(o);
    if (projected) { add(self, 'projected_from', projected, 'raw.inquiryId'); add(projected, 'projected_to', self, 'raw.inquiryId'); }

    const lineage = new Set(_lineageRefs(o));
    if (lineage.size) {
      for (const other of rows) {
        const oref = refOf(other);
        if (oref === self) continue;
        if (evidenceRefsOf(other).some(r => lineage.has(r))) {
          add(self, 'superseded_by', oref, 'signal.supersededBy');
          add(oref, 'supersedes', self, 'signal.supersededBy');
        }
      }
    }
  }

  /* SHARED EVIDENCE — symmetric, so it is emitted once per ordered pair in both directions and
     carries WHICH refs are shared, as refs. */
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i], b = rows[j];
      const A = new Set(evidenceRefsOf(a));
      const shared = evidenceRefsOf(b).filter(r => A.has(r));
      if (!shared.length) continue;
      add(refOf(a), 'shares_evidence', refOf(b), 'signal.ref');
      add(refOf(b), 'shares_evidence', refOf(a), 'signal.ref');
    }
  }
  return out;
}

/* Everything touching one object, with the object's own ref removed from each edge's far side so
   a caller can render "this is connected to X" without re-deriving direction. */
function neighbourhood(objects = [], target = null) {
  const t = _s(target, 120);
  return edges(objects).filter(e => e.from === t);
}

/* ── THE A -> B LOOP ────────────────────────────────────────────────────────────────────────
   Assembled from the edges above and nothing else, for ONE Focus:

     A   what the focus was started to work on   (focus.addresses)
     ->  the focus itself
     ->  what it rested on                       (shared evidence, shared origins)
     ->  the outcome the person recorded         (focus.outcome — the canonical owner's field)
     B   what has been OBSERVED since            (evidence on A dated after the outcome)

   `observedSince` is deliberately named for what it is. It is a count of records that arrived
   after the outcome was recorded, on the thing the focus addressed. It is NOT a claim that the
   focus caused them, and NOT a claim about what happens next — the kernel may describe observed
   movement and may not predict. A caller that renders this as "it worked" has broken product
   law 3 (correlation is not cause), and no field here will help them do it. */
function loop(objects = [], focusRef = null) {
  const rows = _arr(objects).filter(o => refOf(o));
  const byRef = new Map(rows.map(o => [refOf(o), o]));
  const f = byRef.get(_s(focusRef, 120));
  if (!f || f.kind !== 'focus') return null;

  const all = edges(rows);
  const self = refOf(f);
  const addressesRef = (all.find(e => e.from === self && e.type === 'addresses') || {}).to || null;
  const a = addressesRef ? byRef.get(addressesRef) : null;

  const raw = f.raw || {};
  /* THE OUTCOME IS A RECORD, NOT A STRING. `teamState.recordFocusOutcome` writes
     `{ result, note, by, at }`, and this read was `raw.outcome || null` clipped to 20 characters
     — so `_s` stringified the object and the bundle handed the model "the person recorded the
     outcome of this focus as: [object Object]". Nothing failed: the field was present, the
     sentence was well formed, and the only thing wrong with it was that it said nothing. Found by
     driving the real turn and reading the prompt. The older string form is still accepted, because
     a focus closed before that field became a record still has a result worth stating. */
  const _rawOutcome = raw.outcome || null;
  const outcome = (_rawOutcome && typeof _rawOutcome === 'object')
    ? (_rawOutcome.result || null)
    : _rawOutcome;
  /* WHEN IT WAS CLOSED — AND, AGAIN, THERE ARE TWO RECORDS OF IT.

       A PERSONAL Focus writes  raw.resolvedAt      — an ISO string
       A GROUP Focus writes     raw.outcome.at      — an epoch number, by recordFocusOutcome

     Reading only the first meant a group Focus with a recorded outcome had `resolvedAt: null`,
     and `observedSince` is gated on it — so "what has arrived SINCE you closed this" was null on
     every group Focus in the product. That is the second half of the same defect as `addresses`
     above: the reader knew one owner's field names and the loop it exists to close belongs to
     both. The two are recorded SEPARATELY rather than fixed together, because the timestamp and
     the link fail independently and a reader who fixed one would have been satisfied.

     A number is taken as an epoch, a string is parsed. Nothing here writes back. */
  const _at = (v) => {
    if (v == null || v === '') return null;
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
    const p = Date.parse(String(v));
    return Number.isFinite(p) && p > 0 ? p : null;
  };
  const resolvedAt = _at(raw.resolvedAt)
    || (_rawOutcome && typeof _rawOutcome === 'object' ? _at(_rawOutcome.at) : null);

  /* WHAT ARRIVED AFTER. Only on the object the focus addressed, only from signals that are
     current, and only as a COUNT plus their refs — the statements stay where they live. */
  let observedSince = null;
  if (a && resolvedAt) {
    const after = _arr(a.raw && a.raw.signals)
      .filter(s => s && s.status === 'active' && (Number(s.at) || 0) > resolvedAt);
    observedSince = { since: resolvedAt, records: after.length,
      refs: [...new Set(after.map(s => _s(s.ref, 120)).filter(Boolean))].sort() };
  }

  const sharedOrigins = a ? originRefsOf(f).filter(r => new Set(originRefsOf(a)).has(r)) : [];

  return {
    focus: self,
    addresses: addressesRef,
    /* One origin cited by both is ONE origin. Named `sharedOrigins` and not `corroboration` for
       exactly that reason — the count is here to be shown, never to be added up into standing. */
    sharedOrigins,
    sharedEvidence: a ? evidenceRefsOf(f).filter(r => new Set(evidenceRefsOf(a)).has(r)) : [],
    outcome: outcome ? _s(outcome, 20) : null,
    resolvedAt,
    observedSince,
    /* WHERE THE LOOP IS OPEN. A person asking "are we closer?" deserves to be told which part of
       the answer does not exist yet, rather than a confident-sounding sentence built over a gap. */
    open: [
      !addressesRef ? 'this focus does not say what it was started to work on' : null,
      !outcome ? 'no outcome has been recorded yet' : null,
      addressesRef && outcome && observedSince && observedSince.records === 0
        ? 'nothing has been recorded on it since the outcome' : null,
    ].filter(Boolean),
  };
}

/* HOW ONE PIECE OF EVIDENCE STANDS TO ONE FOCUS. Three words, closed, and DECLARED — never read
   off the direction that evidence carries on an inquiry, which is a different question with a
   different answer (see `_declareFocusRelation`).

   It lives here, in the module that owns how things relate, because it had begun to live in two
   places: the writer in `server.js` and the proposal path in `ai/composer-actions.js` both need
   it, and two copies of a closed vocabulary is how a fourth word eventually gets in through
   whichever copy somebody forgot. One owner; both import it; the WRITER still enforces it, because
   a check that lives only where a suggestion is made is a check you can walk around by proposing
   from somewhere else.

   `unclear` is not a hedge. It is the honest answer when somebody has looked and cannot tell, and
   having it is what stops `supports` becoming the default for anything ambiguous. */
const FOCUS_RELATIONS = Object.freeze(['supports', 'undermines', 'unclear']);

module.exports = { REL, INVERSE, KINDS, FOCUS_RELATIONS, ref, refOf, parseRef, edges, neighbourhood, loop,
  evidenceRefsOf, originRefsOf };
