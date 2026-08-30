'use strict';

/* Typed subject identity. Parsing is deliberately syntactic and fail-closed;
   authorization and existence remain the caller's responsibility. */
const KINDS = Object.freeze(['member', 'group', 'organisation', 'relationship-claim']);

function parse(ref) {
  if (typeof ref !== 'string') return null;
  const at = ref.indexOf(':');
  if (at < 1) return null;
  const kind = ref.slice(0, at);
  const id = ref.slice(at + 1);
  if (!KINDS.includes(kind) || !id || id.length > 200 || /\s/.test(id)) return null;
  return Object.freeze({ kind, id, ref: `${kind}:${id}` });
}

module.exports = { KINDS, parse };
