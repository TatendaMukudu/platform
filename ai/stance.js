/* ============================================================
   ai/stance.js — WHAT KIND OF THING IS INTELLIQ SAYING?

   Founder, September 2026, drawing a line they asked to be preserved carefully:

     | What happened               | "These records describe…" with dates and sources     |
     | What appears to be happening| "The current evidence suggests…" with uncertainty    |
     | What to do next             | "Given your goal, one option is…" with reasoning     |

     "A recommended direction is a judgment, not a fact. IntelliQ should be willing to recommend
      something clearly, while showing why and allowing people to disagree."

   ── WHY THIS IS A MODULE AND NOT A PROMPT ───────────────────────────────────────────────────

   `ai/reasoning-register.js` already asks a different question: may this claim be made at all, and
   from what — org data, world knowledge, or the person's own input. That governs the SOURCE.

   This governs the STANCE: the same sourced claim can be offered as a record, as a reading, or as
   a recommendation, and those are three different promises to the listener. A product that
   collapses them sounds confident and is dishonest — the failure is not inventing a fact, it is
   presenting a judgment in the grammar of one. Nothing upstream catches that, because every word
   of it may be perfectly well sourced.

   ── THE LAWS ────────────────────────────────────────────────────────────────────────────────

   L-SN1  THREE STANCES, AND AN UNRECOGNISED ONE IS REFUSED. Not defaulted to the safest, because
          a caller that forgot to say is a caller that has not decided, and picking for them is
          how the distinction quietly stops being made.

   L-SN2  A RECORD MUST CARRY ITS RECEIPTS. Dates and sources, or it is not a record. A claim
          about what happened, with nothing to check it against, is a reading wearing a record's
          grammar — so it is DEMOTED to a reading rather than refused, because the content may be
          perfectly good and it is the certainty that was wrong.

   L-SN3  A READING MUST CARRY ITS UNCERTAINTY. "The evidence suggests" with no statement of what
          would change the picture is a verdict with a hedge in front of it.

   L-SN4  A RECOMMENDATION MUST NAME THE GOAL IT SERVES AND AT LEAST ONE TRADE-OFF, and must be
          marked as a judgment. This is the founder's line, made mechanical: a recommendation
          with no trade-off is being sold, not offered, and a person cannot disagree with
          something that has not shown its cost.

   L-SN5  THE STANCE IS DECLARED, NEVER INFERRED FROM WORDING. Same law the direction of a signal
          obeys, for the same reason: reading "you should probably" for confidence is a classifier,
          and this codebase removed one for destroying information before anything could reason
          over it.

   L-SN6  AGREEMENT IS NOT CORROBORATION. Founder: "a room agreeing with a story doesn't make it
          independently verified." A reading's strength comes from independent ORIGINS; the number
          of people who nodded is not an input to it and cannot be passed as one.

   Pure: no IO, no LLM, no clock of its own.
   ============================================================ */

'use strict';

/* The three, in the order they escalate in commitment: what is written down, what it looks like,
   what to do. Frozen because a fourth would be a new promise to a listener and should not be
   addable by accident. */
const STANCES = Object.freeze(['record', 'reading', 'recommendation']);

/* The founder's own openers. Kept here rather than in a prompt so the grammar of each stance is
   the same every time — a reading that some days opens like a record is a product whose
   confidence varies with the weather. */
const OPENERS = Object.freeze({
  record:         'These records describe',
  reading:        'The current evidence suggests',
  recommendation: 'Given your goal, one option is',
});

/* What each stance PROMISES, said in the product's own words when somebody asks why it is
   phrased this way. */
const PROMISE = Object.freeze({
  record:         'This is what is written down, with when and where it came from.',
  reading:        'This is what the evidence looks like to IntelliQ. It could be wrong, and what would change it is said.',
  recommendation: 'This is a judgment, not a finding. It serves a goal, it has a cost, and you can disagree with it.',
});

const _s = (v, n = 400) => String(v == null ? '' : v).slice(0, n);
const _arr = v => (Array.isArray(v) ? v : []);
const _clean = a => [...new Set(_arr(a).map(x => _s(x, 200)).filter(Boolean))];

/* A source is only a source if it can be gone and looked at. A bare string with no ref is a
   citation somebody typed, which is the thing this module exists to stop being enough. */
function _sources(list) {
  return _arr(list)
    .map(s => (typeof s === 'string' ? { ref: s, label: s } : s))
    .filter(s => s && _s(s.ref, 200))
    .map(s => ({ ref: _s(s.ref, 200), label: _s(s.label || s.ref, 200), at: Number.isFinite(s.at) ? s.at : null }));
}

/* ── GOVERN ──────────────────────────────────────────────────────────────────────────────────

   Returns { ok, stance, violations, statement }. A RECORD that cannot show its receipts is
   returned as a READING rather than refused — `demoted` says so, and the caller can tell the
   listener that the certainty came down rather than dropping the content on the floor. */
function govern(claim = {}) {
  const violations = [];
  const asked = _s(claim.stance, 40);

  // L-SN1.
  if (!STANCES.includes(asked)) {
    return { ok: false, stance: null, demoted: false,
      violations: [{ kind: 'unknown_stance', value: asked }], statement: null };
  }

  const text = _s(claim.text, 1200).trim();
  if (!text) violations.push({ kind: 'empty' });

  // L-SN6, checked before anything else uses it: a count of people who agreed may not be handed
  // in as evidential weight. Refused rather than ignored, so a caller learns the input is wrong.
  if (claim.agreementCount != null || claim.agreedBy != null) {
    violations.push({ kind: 'agreement_is_not_corroboration' });
  }

  const sources = _sources(claim.sources);
  const dated = sources.filter(s => s.at !== null);
  let stance = asked;
  let demoted = false;

  if (asked === 'record') {
    // L-SN2. Both halves: something to check, and WHEN. A source with no date cannot support a
    // claim about what happened, only that something was said at some point.
    if (!sources.length || !dated.length) {
      stance = 'reading';
      demoted = true;
      violations.push({ kind: 'record_without_receipts', sources: sources.length, dated: dated.length });
    }
  }

  if (stance === 'reading') {
    // L-SN3.
    const unknown = _clean(claim.stillUnknown);
    if (!unknown.length) violations.push({ kind: 'reading_without_uncertainty' });
  }

  if (stance === 'recommendation') {
    // L-SN4.
    if (!_s(claim.goal, 200).trim()) violations.push({ kind: 'recommendation_without_goal' });
    if (!_clean(claim.tradeoffs).length) violations.push({ kind: 'recommendation_without_tradeoff' });
  }

  // A demotion is a fact about the answer, not a failure of it: the content stands, the grammar
  // changes. Every other violation blocks.
  const blocking = violations.filter(v => v.kind !== 'record_without_receipts');
  if (blocking.length) return { ok: false, stance, demoted, violations, statement: null };

  return {
    ok: true, stance, demoted, violations,
    statement: {
      stance,
      opener: OPENERS[stance],
      promise: PROMISE[stance],
      text,
      sources: stance === 'record' ? sources : sources,
      stillUnknown: _clean(claim.stillUnknown),
      goal: stance === 'recommendation' ? _s(claim.goal, 200) : null,
      tradeoffs: stance === 'recommendation' ? _clean(claim.tradeoffs) : [],
      // The one word a listener needs to know what they are being handed. A recommendation says
      // so on itself rather than relying on the reader noticing the verb.
      isJudgment: stance === 'recommendation',
    },
  };
}

/* The sentence, assembled. Deterministic, so it reads the same with the writing engine off — and
   so the STANCE is never something a model chose while composing. */
function say(statement = {}) {
  if (!statement || !STANCES.includes(statement.stance)) return '';
  const bits = [`${statement.opener} ${statement.text}`.replace(/\s+/g, ' ').trim()];
  if (statement.stance === 'record' && (statement.sources || []).length) {
    const when = statement.sources.filter(s => s.at).map(s => new Date(s.at).toLocaleDateString());
    bits.push(`(${statement.sources.length} ${statement.sources.length === 1 ? 'record' : 'records'}${when.length ? `, ${when.join(' and ')}` : ''})`);
  }
  if (statement.stance === 'reading' && (statement.stillUnknown || []).length) {
    bits.push(`What would change this: ${statement.stillUnknown[0]}`);
  }
  if (statement.stance === 'recommendation') {
    bits.push(`This is a judgment, not a finding.`);
    if (statement.tradeoffs.length) bits.push(`The cost: ${statement.tradeoffs[0]}`);
  }
  return bits.join(' ');
}

module.exports = { STANCES, OPENERS, PROMISE, govern, say };
