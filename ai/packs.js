/* ============================================================
   ai/packs.js — Domain Packs (universal, pluggable)

   A Domain Pack is NOT an agent and NOT a subsystem. It is a small, declarative
   lens the five kernel agents load: it says which signal sources map to which
   behavioural DIMENSION, how to read each dimension, and (optionally) which
   relationships are worth noticing. Same idea as ai/lenses.js and ai/values.js.

   DESIGN LAW: universal by default, vertical by addition.
   The default UNIVERSAL pack reasons over the behavioural dimensions EVERY person
   has — regardless of whether they're a student, athlete, employee, or patient.
   An industry pack (e.g. a hypothetical "clinical" pack) plugs in later by adding
   dimensions + source mappings; the kernel and the five agents never change.

   Nothing here is industry-specific. Vocabulary lives in packs; intelligence lives
   in the kernel.
   ============================================================ */

/* A dimension = a universal axis of human behaviour we can track self-relatively.
   concernDir = the direction a leader/mentor should care about ('below' = pulling
   back, 'both' = either way). */
const UNIVERSAL_DIMENSIONS = {
  mood:               { label: 'mood',               concernDir: 'below' },
  check_in_frequency: { label: 'check-in cadence',   concernDir: 'below' },
  reflection_cadence: { label: 'reflection cadence', concernDir: 'below' },
  contribution:       { label: 'contribution',       concernDir: 'below' },
  helping:            { label: 'supporting others',  concernDir: 'both'  },
};

/* Map raw signal SOURCES → the dimension they feed. Source-agnostic ingestion +
   this map = any new input type slots into a universal dimension with no code.
   Anything unmapped is still tracked as its own numeric stream by the Analyst
   (so a stat sheet, a grade, a GPS metric, or a KPI all participate in
   cross-signal reasoning without needing an entry here). */
const UNIVERSAL_SOURCE_MAP = {
  checkin:    'check_in_frequency',
  note:       'reflection_cadence',
  weekly:     'reflection_cadence',
  film:       'contribution',
  voice:      'contribution',
  document:   'contribution',
};

const UNIVERSAL = {
  id: 'universal',
  label: 'Universal Human',
  dimensions: UNIVERSAL_DIMENSIONS,
  sourceMap:  UNIVERSAL_SOURCE_MAP,
  // No hard-coded relationships — the Analyst DISCOVERS co-movements from evidence
  // rather than us pre-declaring "sleep causes grades." Honest by construction.
  relationships: [],
};

const PACKS = { universal: UNIVERSAL };

/* Resolve the pack for an org. Today everything uses UNIVERSAL; an org's mode/type
   can select a vertical pack later without touching the kernel. */
function resolvePack(/* orgMode */) {
  return UNIVERSAL;
}

/* Human label for a dimension or an arbitrary signal stream key. */
function labelFor(pack, key) {
  return (pack.dimensions[key] && pack.dimensions[key].label) || key;
}

module.exports = { PACKS, UNIVERSAL, resolvePack, labelFor, UNIVERSAL_DIMENSIONS };
