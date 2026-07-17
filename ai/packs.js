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

/* Source → universal PRIMITIVE translation (the domain→kernel mapping). Signals
   carry meaning as a primitive type, never as an industry noun. Declared here;
   an unknown field can be inferred (LLM/embedding) + human-confirmed later. */
const SOURCE_PRIMITIVE = {
  assessment: 'outcome', gamestats: 'outcome', metric: 'outcome', sheet: 'outcome',
  checkin: 'participation', note: 'participation', weekly: 'participation',
  film: 'participation', voice: 'participation', document: 'participation',
};
/* Refine by the field's own name — universal heuristics, no industry words. */
function primitiveForSignal(source, label) {
  const l = String(label || '');
  if (/load|workload|demand|hours|minutes|volume|caseload/i.test(l)) return 'load';
  if (/skill|fitness|speed|strength|accuracy|rating|proficien|competen/i.test(l)) return 'capability';
  if (/budget|cost|capacity|headcount|inventory|funds/i.test(l)) return 'resource';
  return SOURCE_PRIMITIVE[source] || 'outcome';
}
/* Valence comes from meaning, not the kernel: which direction is "good". */
function valenceFor(label) {
  return /stress|fatigue|anxiety|pain|risk|error|absence|burnout|turnover|incident|defect/i.test(String(label || ''))
    ? 'down-good' : 'up-good';
}

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

/* ============================================================
   DOMAIN PACKS — "broad at the core, specialized at the edges."

   The KERNEL only ever stores universal primitives (person, group, event,
   observation, metric, commitment, intervention, outcome…). A Domain Pack is a
   pure DISPLAY lens: it maps those primitives to the words a given kind of org
   actually uses. A club sees "player / team / match"; a school sees
   "student / class / lesson"; a business sees "team member / department /
   meeting". Same kernel, same intelligence — only the vocabulary changes.

   DESIGN LAW (the user's): "No provider, industry, role or workflow gets
   hard-coded into the kernel when it can be expressed as a universal primitive,
   capability or configurable domain definition." So nothing below teaches the
   kernel anything — it only renames primitives for humans. An org can also supply
   its OWN word for any primitive (custom overrides) without a code change.
   ============================================================ */

/* Each pack maps the universal primitives → the words that org shows its people.
   Keys are the primitives (+ plural/alias forms the UI asks for). Everything the
   UI needs a noun for is here, so the app never hard-codes an industry word. */
const DOMAIN_VOCAB = {
  universal: {
    person:'person', people:'people', member:'person', members:'people',
    group:'group', groups:'groups', event:'session', events:'sessions',
    observation:'note', observations:'notes', metric:'measure', metrics:'measures',
    commitment:'commitment', intervention:'support', outcome:'outcome', goal:'goal',
  },
  sports: {
    person:'player', people:'players', member:'player', members:'players',
    group:'team', groups:'teams', event:'match', events:'matches',
    observation:'coach note', observations:'coach notes', metric:'match load', metrics:'match loads',
    commitment:'training target', intervention:'modified session', outcome:'performance gain', goal:'target',
  },
  education: {
    person:'student', people:'students', member:'student', members:'students',
    group:'class', groups:'classes', event:'lesson', events:'lessons',
    observation:'teacher feedback', observations:'teacher feedback', metric:'test result', metrics:'test results',
    commitment:'assignment', intervention:'tutoring', outcome:'grade improvement', goal:'learning goal',
  },
  business: {
    person:'team member', people:'team members', member:'team member', members:'team members',
    group:'department', groups:'departments', event:'meeting', events:'meetings',
    observation:'manager feedback', observations:'manager feedback', metric:'performance metric', metrics:'performance metrics',
    commitment:'deliverable', intervention:'support plan', outcome:'delivery', goal:'objective',
  },
  nonprofit: {
    person:'participant', people:'participants', member:'participant', members:'participants',
    group:'cohort', groups:'cohorts', event:'session', events:'sessions',
    observation:'mentor note', observations:'mentor notes', metric:'progress measure', metrics:'progress measures',
    commitment:'goal', intervention:'support plan', outcome:'milestone reached', goal:'goal',
  },
};

const DOMAIN_LABELS = {
  universal: 'Universal', sports: 'Sports', education: 'Education',
  business: 'Business', nonprofit: 'Nonprofit / Development',
};

/* The set an org can choose from (Settings selector). Custom = universal base the
   org renames itself. */
const DOMAIN_IDS = ['universal', 'sports', 'education', 'business', 'nonprofit'];

/* Map the legacy free-text orgMode onto a domain pack. Anything unmapped stays
   universal — honest by default, never a wrong industry guess. */
const ORGMODE_DOMAIN = {
  sports: 'sports',
  school: 'education', education: 'education',
  workplace: 'business', business: 'business', government: 'business',
  nonprofit: 'nonprofit', charity: 'nonprofit',
};

/* Resolve the DISPLAY domain for an org.
   - orgMode: the org's stored free-text type (from signup / AI detection)
   - config:  optional { pack, vocab } — an explicit pack choice and/or the org's
     OWN word overrides. Custom words always win, so an org is never boxed in.
   Returns { id, label, vocab } — a complete, ready-to-render vocabulary. */
function resolveDomain(orgMode, config) {
  const cfg = config || {};
  const id = (cfg.pack && DOMAIN_VOCAB[cfg.pack]) ? cfg.pack
           : (ORGMODE_DOMAIN[String(orgMode || '').toLowerCase()] || 'universal');
  const base = DOMAIN_VOCAB[id] || DOMAIN_VOCAB.universal;
  // Org-supplied custom words override the pack's defaults (still only display).
  const custom = (cfg.vocab && typeof cfg.vocab === 'object') ? cfg.vocab : {};
  const vocab = { ...base };
  for (const k of Object.keys(custom)) {
    if (custom[k] && typeof custom[k] === 'string') vocab[k] = custom[k].slice(0, 40);
  }
  return { id, label: DOMAIN_LABELS[id] || 'Custom', vocab };
}

/* The catalog for a Settings picker: [{ id, label, sample }] where sample shows
   the org what the words become (person/group/event) before they commit. */
function domainCatalog() {
  return DOMAIN_IDS.map(id => ({
    id, label: DOMAIN_LABELS[id],
    sample: { person: DOMAIN_VOCAB[id].person, group: DOMAIN_VOCAB[id].group, event: DOMAIN_VOCAB[id].event },
  }));
}

/* ── The prompt-context builder (the ONE place domain language is expressed) ──
   Converts a resolved domain (+ the role of the person in focus, if known) into a
   COMPACT instruction the model receives as ORGANISATIONAL CONTEXT — never a
   find-and-replace command. Every AI entry point calls this rather than embedding
   its own copy, so the guidance is consistent and lives in exactly one place.

   Design constraints (from the spec):
     • semantic guidance, not blind replacement
     • role-sensitive (a coach is not a "player")
     • preserves named structures + custom words
     • never changes a claim's meaning, source, or confidence
     • token-controlled: only the concepts relevant to THIS generation, and NOTHING
       at all when the pack adds no words over universal wording (keeps universal
       mode unchanged and free).

   opts:
     subjectRole — actual role of the person in focus ('a coach', 'a director'…),
                   when known. Suppresses calling them the generic person word.
     concepts    — primitives relevant to this generation (defaults to the everyday
                   set). Pass a subset to trim tokens further. */
function domainDirective(domain, opts = {}) {
  if (!domain || !domain.vocab) return '';
  const v = domain.vocab;
  const uni = DOMAIN_VOCAB.universal;
  const concepts = opts.concepts || ['person', 'group', 'event', 'observation', 'metric', 'commitment', 'intervention', 'outcome'];
  const MEANS = {
    person: 'a member of the organisation', group: 'a group of them',
    event: 'a scheduled event', observation: 'a recorded note or piece of feedback',
    metric: 'a tracked measure', commitment: 'a commitment or target',
    intervention: 'a support action', outcome: 'a result',
  };
  const pairs = concepts
    .filter(k => v[k] && v[k] !== uni[k])   // only where the pack actually renames it
    .map(k => `${MEANS[k] || k} → "${v[k]}"`);
  const roleLine = opts.subjectRole
    ? `The person in focus here is ${opts.subjectRole}, not ${v.person ? `a "${v.person}"` : 'a generic member'} — refer to them by that role or by name, never by the generic term.`
    : '';
  if (!pairs.length && !roleLine) return '';   // universal + no role nuance → add nothing

  const label = String(domain.label || 'this').trim();
  const art = /^[aeiou]/i.test(label) ? 'an' : 'a';
  return [
    `ORGANISATION LANGUAGE — this is ${art} ${label} organisation.`,
    pairs.length ? `Use its everyday words naturally when you mean the matching concept: ${pairs.join('; ')}.` : '',
    `Treat this as CONTEXT, not a find-and-replace rule: do not mechanically swap every "person", "group" or "event". Not everyone is ${v.person ? `a "${v.person}"` : 'the same'} — respect each subject's ACTUAL role (coach, analyst, physio, director, teacher, counsellor, parent, manager, and so on) and use it, or their name, when you know it.`,
    `Preserve the organisation's own named teams, groups, roles and workflows exactly as given; the org's custom words always win over any default.`,
    `Wording never changes meaning: a renamed note is still an observation (not a verified fact), and the confidence, source and status of every claim are unchanged.`,
    roleLine,
  ].filter(Boolean).join(' ');
}

/* A short, stable fingerprint of the vocabulary a generation ran under — stored
   alongside generated prose so historical outputs stay attributable to the words
   in effect at the time, even after an org later changes its display language. */
function vocabVersion(domain) {
  if (!domain || !domain.vocab) return 'none';
  const s = (domain.id || 'universal') + '|' + Object.keys(domain.vocab).sort().map(k => `${k}=${domain.vocab[k]}`).join(',');
  let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `${domain.id || 'universal'}.${h.toString(36)}`;
}

module.exports = {
  PACKS, UNIVERSAL, resolvePack, labelFor, UNIVERSAL_DIMENSIONS,
  primitiveForSignal, valenceFor,
  DOMAIN_VOCAB, DOMAIN_LABELS, DOMAIN_IDS, resolveDomain, domainCatalog,
  domainDirective, vocabVersion,
};
