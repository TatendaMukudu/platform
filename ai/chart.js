/* ============================================================
   ai/chart.js — A GRAPH IS A VIEW OF THE RECORD, NOT A NEW SOURCE OF NUMBERS.

   Founder, September 2026, asked where graphing belongs: "I want graphs to be a spontaneous
   thing created in a focus, high, low, inquiry when discussing with the assistant kinda like what
   ChatGPT does." And asked where the numbers come from: "The server, always."

   Both answers are laws here, and the second is the dangerous one. A chart is the most
   persuasive object a product can put in front of somebody — a line going up reads as a fact
   before anybody has looked at the axis. So every guarantee this codebase already makes about
   claims has to hold for pictures too, and one of them has to be made new.

   ── THE LAWS ────────────────────────────────────────────────────────────────────────────────

   L-CH1  EVERY POINT NAMES ITS EVIDENCE. A point carries the refs it was computed from. A point
          with no refs is refused — not drawn faintly, not drawn with a caveat. This is the same
          guarantee governArtifact makes about a written figure, and it exists for the same
          reason: a number that traces to nothing is an invented number whatever shape it is
          drawn in.

   L-CH2  A COUNT MUST EQUAL ITS OWN EVIDENCE. For a count series, the value AT a point must be
          exactly the number of distinct refs that point names. This is what makes L-CH1 more
          than decoration: refs could otherwise be attached to a fabricated number and pass. A
          count that disagrees with the evidence it cites is refused.

   L-CH3  NOTHING IS SCORED. A chart may plot COUNTS (how many independent origins, how many
          people), BANDS (the kernel's own four steps) and DATES. It may NOT plot a rating, an
          index, a percentile or a 0-100 performance number. This product deliberately removed a
          scoring system that reduced people to figures; a chart is exactly how that system would
          come back, because a score is far easier to defend as a picture than as a sentence.
          The unit whitelist is the whole defence and it is deliberately short.

   L-CH4  A GROUP SERIES IS COHORT-FLOORED. Five people either side, the same two-sided floor
          every other group surface uses. A bar chart of four is a roster with the names taken
          off, and anybody in the room can put them back. Below the floor the chart is REFUSED
          WITH A REASON rather than quietly returned empty — an empty chart reads as "nothing
          happened", which is a different and false claim.

   L-CH5  A CHART SAYS WHAT IT CANNOT SHOW. Every spec carries `limitations`. A picture with no
          stated limits is read as complete.

   ── WHAT IS DELIBERATELY NOT HERE ───────────────────────────────────────────────────────────

   No banding, no confidence, no cohort arithmetic of its own. This module RECEIVES a series the
   server built by calling the production kernel and decides whether it may be drawn. A second
   implementation of banding that only charts use is how a chart ends up disagreeing with the
   sentence printed beside it.

   Pure: no IO, no LLM, no clock of its own.
   ============================================================ */

'use strict';

/* The kinds of picture this product will draw. Short on purpose — each one exists because a
   specific question was asked of it, and a chart nobody asked for is a chart nobody reads. */
const CHART_KINDS = Object.freeze(['firming', 'timeline', 'spread']);

/* L-CH3 — THE UNIT WHITELIST. This is the anti-scoring law and the most important eight lines in
   the file. `count` is how many of a thing the record holds. `band` is the kernel's own ladder.
   `date` is when. There is no `score`, no `rating`, no `percent`, no `index` — and adding one
   would be reintroducing the scoring system this product removed, in the one format where
   nobody would argue with it. */
const UNITS = Object.freeze(['count', 'band', 'date']);

/* The kernel's four steps, as positions on an axis. Read from diagnose's ladder rather than
   invented here — if that ladder ever gains a step, this must be updated with it and the guard
   below will say so rather than silently plotting a band it does not know. */
const BAND_STEPS = Object.freeze(['tentative', 'emerging', 'probable', 'supported']);

const _s = (v, n = 200) => String(v == null ? '' : v).slice(0, n);
const _num = v => (Number.isFinite(Number(v)) ? Number(v) : null);
const _arr = v => (Array.isArray(v) ? v : []);
const _refs = p => [...new Set(_arr(p && p.refs).map(r => _s(r, 120)).filter(Boolean))];

/* ── 1. HOW A BELIEF FIRMED UP ───────────────────────────────────────────────────────────────

   The founder's first pick, and the one that teaches the law while it answers the question.

   TWO SERIES, and the pairing is the point. `origins` is how many INDEPENDENT origins had spoken
   by each date; `band` is what the kernel made of the evidence at that moment. Drawn together
   they show the thing people find hardest to believe about this product: that a belief does not
   firm up because somebody said it louder or more often, it firms up when a SECOND independent
   origin arrives. The threshold line is where a call becomes possible at all.

   Built from dated occasions the server hands over — one entry per moment the record changed,
   each naming the refs live at that moment and the band the kernel derived from them. Nothing is
   recomputed here. */
function buildFirming({ title = '', occasions = [], threshold = null, limitations = [] } = {}) {
  const pts = [];
  const bandPts = [];
  for (const o of _arr(occasions)) {
    const at = _num(o && o.at);
    if (at === null) continue;
    const refs = _refs(o);
    // L-CH2 — the value IS the evidence, computed from it rather than trusted alongside it. A
    // caller passing a count that disagrees with its own refs cannot get it past this, because
    // the count is never read from the caller in the first place.
    pts.push({ at, value: refs.length, refs, label: _s(o.label, 120) });
    const bi = BAND_STEPS.indexOf(_s(o.band, 40));
    if (bi >= 0) bandPts.push({ at, value: bi, refs, label: _s(o.band, 40) });
  }
  const series = [{ key: 'origins', name: 'Independent origins', unit: 'count', points: pts }];
  if (bandPts.length) series.push({
    key: 'band', name: 'What the evidence supported', unit: 'band', points: bandPts,
    ticks: BAND_STEPS.slice(),
  });
  return {
    kind: 'firming', title: _s(title || 'How this firmed up', 160), series,
    /* The line that says where a call becomes possible. Drawn because the shape of this chart is
       only legible against it: two origins is not "a bit more evidence", it is the difference
       between a question and a finding. */
    threshold: _num(threshold) === null ? null : { unit: 'count', value: _num(threshold),
      name: 'Enough independent origins to be called' },
    /* THE CAVEAT IS INTRINSIC, NOT SUPPLIED. A suite caught this as optional: the server passed
       "origins, not messages" in as a limitation, so the single most important thing to say about
       this chart depended on every future caller remembering to say it. The line below is what
       the chart PLOTS, so the chart states it. */
    limitations: [
      'Independent origins, not messages — the same person saying it again does not move this.',
      'Counts occasions on the record. Something that happened and was never said is not here.',
      ...(_arr(limitations).map(l => _s(l, 200))),
    ],
  };
}

/* ── 2. WHAT HAPPENED, IN ORDER ──────────────────────────────────────────────────────────────
   A focus is something you work towards, so the honest picture of one is what happened and when:
   set, material attached, people engaging, reviewed, closed. Dates only — a timeline that
   invented a magnitude for each event would be a score wearing a different hat. */
function buildTimeline({ title = '', events = [], limitations = [] } = {}) {
  const points = [];
  for (const e of _arr(events)) {
    const at = _num(e && e.at);
    if (at === null) continue;
    const refs = _refs(e);
    points.push({ at, value: at, refs, label: _s(e.label, 160), marker: _s(e.marker, 40) || 'event' });
  }
  points.sort((a, b) => a.at - b.at);
  return {
    kind: 'timeline', title: _s(title || 'What happened, in order', 160),
    series: [{ key: 'events', name: 'On the record', unit: 'date', points }],
    threshold: null,
    limitations: [
      'What is written down, not everything that happened.',
      ...(_arr(limitations).map(l => _s(l, 200))),
    ],
  };
}

/* ── 3. HOW IT LANDED ACROSS A GROUP ─────────────────────────────────────────────────────────

   Founder: "aggregate stats across their squad and I think this is where graphing can be
   beneficial." And, in the same breath, the constraint that makes it safe: names appear only
   where the evidence is already public to that audience.

   So this counts PEOPLE PER CATEGORY and nothing else — no names, no per-person values, no
   ordering that would let a reader reconstruct who is in which bar. `cohort` carries {k, n} and
   the caller supplies the floor verdict from the production rule; a failing floor refuses the
   whole chart rather than dropping the small bars, because dropping them is what turns a chart
   into a puzzle with one missing piece. */
function buildSpread({ title = '', categories = [], cohort = null, floor = null, limitations = [] } = {}) {
  const got = [], not = [];
  for (const c of _arr(categories)) {
    const key = _s(c && c.key, 80), label = _s(c && c.label, 160);
    const gr = _refs(c);
    const nr = [...new Set(_arr(c && c.notRefs).map(r => _s(r, 120)).filter(Boolean))];
    got.push({ at: null, key, label, value: gr.length, refs: gr });
    not.push({ at: null, key, label, value: nr.length, refs: nr });
  }
  return {
    kind: 'spread', title: _s(title || 'How it landed', 160),
    /* TWO SERIES, NOT ONE, and this is L-MT3 carried into the picture. A single bar of "said they
       had it" makes a part where three people said they were stuck look identical to a part
       nobody opened — both are zero. Collapsing those is exactly the error the material module
       refuses to make in words, and it would be worse in a chart, because nobody argues with a
       bar. */
    series: [
      { key: 'got', name: 'Said they had it', unit: 'count', points: got },
      { key: 'not_yet', name: 'Said not yet', unit: 'count', points: not },
    ],
    threshold: null,
    cohort: cohort ? { k: _num(cohort.k), n: _num(cohort.n) } : null,
    floor: floor ? { ok: floor.ok === true, reason: _s(floor.reason, 200) } : null,
    limitations: [
      'Counts people, never names them, and never says which bar anybody is in.',
      'Somebody who said nothing is not counted as anything — silence is not an answer.',
      'A part with nothing against it had nothing said about it. That is not the same as nobody understanding it.',
      ...(_arr(limitations).map(l => _s(l, 200))),
    ],
  };
}

/* ── 4. THE GATE ─────────────────────────────────────────────────────────────────────────────

   Nothing reaches a screen without passing this. Returns { ok, violations, chart } — and on a
   refusal returns NO chart at all, so there is no half-drawn version for a caller to reach for.

   `basis` is the set of refs the server says this chart is allowed to be built from. A point
   naming a ref outside it is not a provenance slip, it is a chart drawn from something the
   viewer was never cleared to see, so it fails the same way an invented one does. */
function governChart(spec = {}, { basis = null } = {}) {
  const violations = [];
  const kind = _s(spec.kind, 40);
  if (!CHART_KINDS.includes(kind)) violations.push({ kind: 'unknown_chart', value: kind });

  /* L-CH4, CHECKED FIRST, and the order is the point.

     When the cohort floor fails, the caller has nothing to put in the chart — so the floor
     refusal used to arrive BEHIND an `empty` violation, and refusalNote, which reads the first
     one, told the reader "nothing on the record to draw yet". That is a privacy refusal wearing
     the costume of an absence: the coach is told their squad said nothing when in fact their
     squad is too small to be shown. Wrong in a way that would never have been reported, because
     both outcomes look like a missing chart.

     The floor verdict is computed by the production rule and handed in; this refuses on it. A
     chart that quietly drops the bars below the floor is worse still, because the reader takes
     the remaining bars for the whole group. */
  if (spec.floor && spec.floor.ok !== true) {
    violations.push({ kind: 'below_cohort_floor', reason: _s(spec.floor.reason, 200) });
  }

  const allowed = basis ? new Set(_arr(basis).map(r => _s(r, 120))) : null;
  const series = _arr(spec.series);
  if (!series.length) violations.push({ kind: 'empty' });

  let plotted = 0;
  for (const s of series) {
    const unit = _s(s && s.unit, 40);
    // L-CH3. The whitelist, enforced. A caller inventing `score` or `rating` gets refused here,
    // which is the only place the removed scoring system could realistically come back.
    if (!UNITS.includes(unit)) { violations.push({ kind: 'invented_scale', series: _s(s && s.key, 80), unit }); continue; }
    for (const p of _arr(s && s.points)) {
      plotted++;
      const refs = _refs(p);
      /* L-CH1, MADE EXACT. The first version refused every point with no refs, which collided
         with an honest zero: "nobody said they had this part" is a real fact about the world and
         its evidence is genuinely empty. A whole chart was being refused because one bar was zero.

         The purpose of L-CH1 is to catch a NON-ZERO number standing on nothing. So the rule is
         that an unprovenanced point must be ZERO — which merges L-CH1 into L-CH2 rather than
         loosening it: every non-zero value still has to equal the evidence it names, and a zero
         trivially equals its own empty evidence. Nothing that was refused before is drawn now
         except a truthful nought. */
      if (!refs.length && _num(p && p.value) !== 0) {
        violations.push({ kind: 'unprovenanced', series: _s(s.key, 80), at: _num(p && p.at) });
        continue;
      }
      if (allowed) {
        const outside = refs.filter(r => !allowed.has(r));
        if (outside.length) violations.push({ kind: 'outside_basis', series: _s(s.key, 80), refs: outside.slice(0, 5) });
      }
      const v = _num(p && p.value);
      if (v === null) { violations.push({ kind: 'not_a_number', series: _s(s.key, 80) }); continue; }
      // L-CH2 — a count must equal its own evidence.
      if (unit === 'count' && v !== refs.length) {
        violations.push({ kind: 'count_disagrees_with_evidence', series: _s(s.key, 80), value: v, refs: refs.length });
      }
      // A band must be one the kernel actually has. An unknown step means this file has drifted
      // from diagnose's ladder, and plotting it would put a position on an axis that means
      // nothing.
      if (unit === 'band' && !(v >= 0 && v < BAND_STEPS.length && Number.isInteger(v))) {
        violations.push({ kind: 'unknown_band', series: _s(s.key, 80), value: v });
      }
    }
  }
  if (!plotted && !violations.some(v => v.kind === 'empty')) violations.push({ kind: 'empty' });

  // L-CH5.
  if (!_arr(spec.limitations).length) violations.push({ kind: 'no_stated_limits' });

  if (violations.length) return { ok: false, violations, chart: null };
  return { ok: true, violations: [], chart: spec };
}

/* The sentence that goes under a refusal. A chart that cannot be drawn should say why in the
   words the reader would use, because "insufficient data" is how a product teaches people that
   its refusals are noise to be clicked past. */
function refusalNote(violations = []) {
  const v = _arr(violations)[0] || {};
  switch (v.kind) {
    case 'below_cohort_floor':
      return `Not enough people for a picture that stays anonymous — ${_s(v.reason, 160)}.`;
    case 'empty':
      return 'Nothing on the record to draw yet.';
    case 'unprovenanced':
    case 'outside_basis':
    case 'count_disagrees_with_evidence':
      return 'Held back — part of this chart could not be traced to the record it claims to show.';
    case 'invented_scale':
      return 'Held back — nothing here is scored, and this asked for a scale that would be one.';
    default:
      return 'Held back — this could not be drawn from the record as it stands.';
  }
}

module.exports = {
  CHART_KINDS, UNITS, BAND_STEPS,
  buildFirming, buildTimeline, buildSpread, governChart, refusalNote,
};
