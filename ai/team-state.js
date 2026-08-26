/* ============================================================
   ai/team-state.js — THE TEAM-GRAIN SURFACE (pure)

   One node, read as a subject in its own right:

     Men's Soccer
     High:    Player-led communication has improved over the last two sessions.
     Low:     Substitute role clarity is emerging as something worth attention.
     Inquiry: Why does communication drop after difficult results?
     Focus:   Test player-led post-match debriefs for the next two matches.
     IntelliQ: We don't yet know whether the improvement transfers after losses.

   NO NEW INTELLIGENCE. Every input here already exists: group inquiries keyed on
   group:<nodeId>, their hypotheses, their confidence, their independent-origin counts,
   their open unknowns. This module ASSEMBLES and it WITHHOLDS. It detects nothing,
   concludes nothing, and calls no model.

   DEPLOYMENT-SHAPE NEUTRAL. A node is a node. A flat team is one node; a school is a
   node with descendants; a department is a node with parents. Nothing below knows or
   cares which, and nothing below is specific to a sport, a subject or a pilot.

   THREE LAWS IT ENFORCES, none of them invented here:

     L-PR1  THE TWO-SIDED COHORT FLOOR. A count of people is a disclosure in both
            directions. Naming k of n discloses the k; it also discloses the n-k. So a
            count survives only when BOTH sides clear the floor. The one-sided version
            was defeated by the complement attack: with n = k, "two members" names
            everyone in a two-person node while satisfying k >= 2.

     L-OR1  ORIGINS, NOT PEOPLE. Five teammates repeating what the captain said are
            five contributors and one origin. A High or a Low must rest on independent
            origins; a chorus is not corroboration.

     L-DC1  DERIVED, NEVER ASSERTED. Confidence and status come from the inquiry the
            kernel computed. This module may narrow a claim. It may never strengthen
            one, and it never authors a band of its own.

   PURE: imports nothing, no IO, no clock of its own. The caller owns tenancy, auth
   and privacy before inputs arrive.
   ============================================================ */

'use strict';

/* ── VALENCE ─────────────────────────────────────────────────────────────────
   Whether something is working well or worth attention is a HUMAN judgement taken at
   the contribution boundary, not a property this module infers.

   The alternative was tried and rejected elsewhere in this codebase: a ~40-stem lexicon
   deciding what "struggling with my first touch" meant destroyed the information before
   anything could reason over it. Sentiment classification here would repeat that mistake
   at group scale, where being wrong is more expensive because more people see it.

   So the person offering material says which it is, and the kernel records that with the
   same provenance as everything else. Three values only — the third is not a hedge, it
   is the honest answer when someone genuinely does not know, and it is load-bearing:
   an inquiry nobody can call is an Inquiry, which is the correct place for it. */
const VALENCES = Object.freeze(['working_well', 'worth_attention', 'unsure']);

/* Inquiry polarity, already a field on the inquiry object (ai/diagnose.js). */
const POLARITY = Object.freeze({
  WORKING_WELL: 'strength',
  WORTH_ATTENTION: 'difficulty',
  NEUTRAL: 'neutral',
});

/* The cohort floor. Two, matching server.js MIN_COHORT — the same number, not a second
   opinion about it. Raising it is a policy change and belongs where that constant lives. */
const MIN_COHORT = 2;

/* Independent origins required before a group claim may be surfaced as a High or a Low.
   Matches ai/contribution.js MIN_INDEPENDENT_ORIGINS, and for the same reason. */
const MIN_ORIGINS = 2;

/* Confidence bands, weakest first — ai/diagnose.js _BANDS, in its order. */
const BAND_RANK = Object.freeze({ tentative: 0, emerging: 1, probable: 2, supported: 3 });

const FOCUS_STATUSES = Object.freeze(['active', 'done', 'abandoned']);
const OUTCOME_RESULTS = Object.freeze(['better', 'no_change', 'worse', 'unclear']);

function _s(v, n = 240) { return String(v == null ? '' : v).trim().slice(0, n); }
function _num(v) { return Number.isFinite(Number(v)) ? Number(v) : 0; }
function _arr(v) { return Array.isArray(v) ? v.filter(Boolean) : []; }

/* ── 1. VALENCE OF A GROUP INQUIRY ───────────────────────────────────────────
   Derived from the valences the contributors declared, never from the text.

   The rule is deliberately unforgiving of disagreement. If two people offered material
   about the same thing and called it opposite ways, the honest report is that the group
   does not agree yet — which makes it an open Inquiry, not a High that half the squad
   would dispute. Contested is a FINDING, not a failure, and it is returned as one.

   `unsure` never decides anything. It cannot create a valence and it cannot contest one:
   somebody saying "I don't know which this is" is not evidence that it is either. */
function valenceOf(contributions = []) {
  const live = _arr(contributions).filter(c => c && (c.status === 'contributed' || c.status === 'admitted'));
  const called = live.filter(c => c.valence === 'working_well' || c.valence === 'worth_attention');
  if (!called.length) return { polarity: POLARITY.NEUTRAL, contested: false, reason: 'nobody has called this one way or the other' };

  const well = called.filter(c => c.valence === 'working_well').length;
  const attention = called.filter(c => c.valence === 'worth_attention').length;

  if (well && attention) {
    return {
      polarity: POLARITY.NEUTRAL, contested: true,
      reason: `called both ways — ${well} as working well, ${attention} as worth attention`,
    };
  }
  return {
    polarity: well ? POLARITY.WORKING_WELL : POLARITY.WORTH_ATTENTION,
    contested: false,
    reason: `${called.length} ${called.length === 1 ? 'account' : 'accounts'}, all in the same direction`,
  };
}

/* ── 2. THE TWO-SIDED COHORT FLOOR ───────────────────────────────────────────
   May a count of k people out of a cohort of n be disclosed at all?

   Both sides, because a count is two statements. "Three of four" names the three AND the
   fourth. The floor was one-sided until an executed complement attack put two names on a
   coach's screen from a payload that satisfied it, so this is a correction with a body,
   not a precaution.

   n is the node's own member count. It is NOT the number of people who happened to
   contribute — using that as the denominator makes every count self-clearing. */
function cohortFloor(k, n) {
  const kk = _num(k), nn = _num(n);
  if (kk <= 0 || nn <= 0) return { ok: false, reason: 'no cohort' };
  if (kk > nn) return { ok: false, reason: 'more contributors than members — cohort is not the denominator' };
  if (kk < MIN_COHORT) return { ok: false, reason: `${kk} of ${nn} is below the floor of ${MIN_COHORT}` };
  if (nn - kk < MIN_COHORT) return { ok: false, reason: `${nn - kk} of ${nn} left uncounted — naming ${kk} names the rest` };
  return { ok: true, reason: `${kk} of ${nn}, both sides clear` };
}

/* ── 3. IS A GROUP INQUIRY FIT TO BE A HIGH OR A LOW? ────────────────────────
   A High or a Low is a CLAIM ABOUT THE GROUP put in front of a leader. It has to clear
   more than an inquiry that is merely open, because an open inquiry is visibly a
   question and a High reads as a fact.

   Three independent gates, every one of which already exists as law:

     ORIGINS     independent origins, not voices (L-OR1). One origin retold three times
                 is one origin, and the retellings are why this gate is counted and not
                 assumed.
     COHORT      the two-sided floor (L-PR1), on the DISTINCT CONTRIBUTORS. This is the
                 gate that stops a small team's High from being a roster.
     STANDING    the kernel's own band must be at least `emerging`, and the inquiry must
                 not be disputed. Surfacing a disputed claim as settled is precisely the
                 assertion this architecture exists to refuse (L-DC1).

   Returns the reasons on failure, because a suppressed finding that cannot explain
   itself is indistinguishable from a system that found nothing. */
function fitForSurface(inquiry = {}, { cohortSize = 0 } = {}) {
  const blocked = [];
  const origins = _num(inquiry.independentOrigins);
  const contributors = _num(inquiry.contributors);
  const band = _s((inquiry.confidence || {}).band || 'tentative', 32);

  if (origins < MIN_ORIGINS) {
    blocked.push({
      gate: 'origins',
      reason: `rests on ${origins || 'no'} independent origin${origins === 1 ? '' : 's'} — repetition is not corroboration`,
    });
  }
  const floor = cohortFloor(contributors, cohortSize);
  if (!floor.ok) blocked.push({ gate: 'cohort', reason: floor.reason });

  if ((BAND_RANK[band] ?? 0) < BAND_RANK.emerging) {
    blocked.push({ gate: 'standing', reason: `the kernel rates this ${band}; too early to put in front of anyone` });
  }
  if (inquiry.status === 'disputed') {
    blocked.push({ gate: 'standing', reason: 'contradicted by other accounts and not yet resolved' });
  }
  return { ok: blocked.length === 0, blocked, band, origins, contributors };
}

/* Rank two surfaceable inquiries. Confidence band first — the strongest thing we can
   honestly say leads — then independent origins, then recency. Deliberately NOT by
   severity: severity is a property of a finding about a person, and inventing one for a
   group claim would be this module authoring a judgement it has no basis for. */
function _rank(a, b) {
  const ba = BAND_RANK[_s((a.confidence || {}).band)] ?? 0;
  const bb = BAND_RANK[_s((b.confidence || {}).band)] ?? 0;
  if (ba !== bb) return bb - ba;
  const oa = _num(a.independentOrigins), ob = _num(b.independentOrigins);
  if (oa !== ob) return ob - oa;
  return _num(b.lastUpdatedAt) - _num(a.lastUpdatedAt);
}

/* ── 4. THE OPEN QUESTION ────────────────────────────────────────────────────
   What the group is still working out. Ranked the OPPOSITE way to a High: the most
   interesting open question is the one that is genuinely unresolved, so a contested
   inquiry outranks a comfortable one, and an inquiry with live unknowns outranks one
   with none.

   Deliberately NOT floor-gated on the cohort. A question contains no count and names
   nobody — "why does communication drop after difficult results?" discloses nothing
   about who said it. Gating it would suppress the one artifact on this surface that is
   safe by construction, which is how a privacy control turns into a silence bug.

   `alreadyShown` is the set of inquiries the surface is already reporting as the High or
   the Low. A question drawn from one of those is not wrong, but it is REDUNDANT — the
   High's own unknown is what the closing statement already speaks to, so promoting it to
   the Inquiry line spends the surface's third slot restating its first. An inquiry that is
   ONLY a question is the more informative answer, so it wins whenever one exists; a
   surfaced inquiry's unknown is still used rather than showing nothing. */
function openQuestion(inquiries = [], { alreadyShown = [] } = {}) {
  const live = _arr(inquiries).filter(i => i && i.status !== 'resolved' && _arr(i.stillUnknown).length);
  if (!live.length) return null;
  const shown = new Set(_arr(alreadyShown).map(id => _s(id, 64)));
  const sorted = live.slice().sort((a, b) => {
    const sa = shown.has(_s(a.inquiryId, 64)) ? 1 : 0, sb = shown.has(_s(b.inquiryId, 64)) ? 1 : 0;
    if (sa !== sb) return sa - sb;
    const ca = a.contested === true ? 1 : 0, cb = b.contested === true ? 1 : 0;
    if (ca !== cb) return cb - ca;
    const ua = _arr(a.stillUnknown).length, ub = _arr(b.stillUnknown).length;
    if (ua !== ub) return ub - ua;
    return _num(b.lastUpdatedAt) - _num(a.lastUpdatedAt);
  });
  const top = sorted[0];
  return {
    inquiryId: _s(top.inquiryId, 64),
    question: _s(_arr(top.stillUnknown)[0], 300),
    about: _s((top.topic && (top.topic.label || top.topic.canonicalConcept)) || '', 120),
    band: _s((top.confidence || {}).band || 'tentative', 32),
    contested: top.contested === true,
    otherUnknowns: _arr(top.stillUnknown).slice(1, 4).map(u => _s(u, 300)),
  };
}

/* ── 5. FOCUS ────────────────────────────────────────────────────────────────
   A team Focus is a commitment with an ORIGIN and an OUTCOME. Both fields exist from
   the first record deliberately: origin cannot be back-filled onto a Focus created
   without it, because the intent that produced it is not recoverable from anything else
   the system holds. That is the whole argument for building it now rather than later.

   `from` distinguishes a Focus the system proposed out of an inquiry from one a leader
   simply decided on. Without the distinction, outcome learning silently credits the
   system for a coach's own idea, and every efficacy number afterwards is wrong in a
   direction nobody can detect. */
function newFocus({ focusId, nodeId, text, by, now = Date.now(), reviewAt = null, inquiry = null } = {}) {
  return {
    focusId: _s(focusId, 64), nodeId: _s(nodeId, 64), text: _s(text, 300), status: 'active',
    createdAt: now, reviewAt: Number.isFinite(Number(reviewAt)) ? Number(reviewAt) : null,
    origin: { by: _s(by, 64) || null, at: now, from: inquiry ? 'inquiry' : 'leader',
      inquiryId: inquiry ? _s(inquiry.inquiryId, 64) : null }, outcome: null,
  };
}

function recordFocusOutcome(focus, { result, note = '', by, now = Date.now(), status = 'done' } = {}) {
  focus.outcome = { result: OUTCOME_RESULTS.includes(result) ? result : 'unclear',
    note: _s(note, 300), recordedBy: _s(by, 64) || null, at: now };
  focus.status = FOCUS_STATUSES.includes(status) ? status : 'done';
  return focus;
}

function normalizeFocus(focus = {}) {
  const origin = focus.origin || {};
  const outcome = focus.outcome || null;
  return {
    focusId: _s(focus.focusId, 64),
    text: _s(focus.text, 300),
    status: FOCUS_STATUSES.includes(focus.status) ? focus.status : 'active',
    createdAt: _num(focus.createdAt),
    reviewAt: _num(focus.reviewAt) || null,
    origin: {
      by: _s(origin.by, 64) || null,
      at: _num(origin.at) || _num(focus.createdAt),
      from: _s(origin.from, 32) || 'leader',
      inquiryId: _s(origin.inquiryId, 64) || null,
    },
    outcome: outcome ? {
      result: OUTCOME_RESULTS.includes(outcome.result) ? outcome.result : 'unclear',
      note: _s(outcome.note, 300),
      recordedBy: _s(outcome.recordedBy, 64) || null,
      at: _num(outcome.at),
    } : null,
  };
}

/* ── 6. WHAT INTELLIQ SAYS ───────────────────────────────────────────────────
   The closing line, and the most easily abused thing on this surface — it is the one
   sentence that sounds like the system speaking in its own voice.

   So it is a lookup over facts already established above, in a fixed order, with no
   phrasing left to a model. Each branch names the SPECIFIC thing not yet known. The
   generic version of this sentence ("more data would help") is worse than silence,
   because it is true of everything and therefore says nothing.

   Order matters: the untested Focus comes first, because an active commitment whose
   result is not yet in is the most decision-relevant uncertainty a leader has. */
function statementFor({ high, low, question, focus, withheld = [] } = {}) {
  if (focus && focus.status === 'active' && !focus.outcome) {
    const anchor = high || low;
    if (anchor) {
      return `We don't yet know whether ${_lower(anchor.about || 'this')} holds up once the focus has run. That's the next thing worth watching.`;
    }
    return `The focus is running and nothing has come back on it yet. Worth leaving it long enough to tell.`;
  }
  if (focus && focus.outcome && focus.outcome.result === 'unclear') {
    return `The focus ran, but what came back doesn't separate it from everything else that changed. Worth another pass before drawing anything from it.`;
  }
  if (high && low) {
    return `${_cap(high.about)} and ${_lower(low.about)} are moving in opposite directions. Whether they are connected is not something we can tell from what we have.`;
  }
  if (question) {
    return question.contested
      ? `People here are describing ${_lower(question.about || 'this')} differently. That disagreement is the useful part — it is worth resolving before acting on either account.`
      : `The open question is ${_lower(question.question)} Nothing we hold answers it yet.`;
  }
  if (high) {
    return `${_cap(high.about)} is holding. We have not seen it tested under pressure, so it is too early to call it settled.`;
  }
  if (low) {
    return `${_cap(low.about)} is worth attention, but we don't yet know what is driving it.`;
  }
  if (withheld.length) {
    return `There is something here, but not enough of the group has spoken to say it without pointing at individuals. More accounts would change that.`;
  }
  return `Nothing has crossed the line into a group finding yet. That is a real answer, not an empty one — it means no pattern here rests on more than one account.`;
}

function _cap(s) { const t = _s(s); return t ? t[0].toUpperCase() + t.slice(1) : t; }
function _lower(s) { const t = _s(s); return t ? t[0].toLowerCase() + t.slice(1) : t; }

/* ── 7. ASSEMBLY ─────────────────────────────────────────────────────────────
   Inputs are already-authorised projections. This function does not read storage and
   cannot widen what the caller passed it.

     node        { nodeId, name, memberCount }
     inquiries   group inquiry projections, each carrying polarity, contested,
                 independentOrigins, contributors, confidence, status, stillUnknown
     focuses     team focuses for this node
     now         caller's clock

   `withheld` is returned rather than dropped. A leader who is told "there is a finding
   here but too few people have spoken for it to be said safely" can act on that — they
   can ask more people. A leader who is shown nothing concludes there is nothing. */
function buildTeamState({ node = {}, inquiries = [], findings = [], focuses = [], now = Date.now() } = {}) {
  const memberCount = _num(node.memberCount);
  const withheld = [];
  const surfaceable = { strength: [], difficulty: [] };

  for (const inq of _arr(inquiries)) {
    const polarity = _s(inq.polarity, 32) || POLARITY.NEUTRAL;
    if (polarity !== POLARITY.WORKING_WELL && polarity !== POLARITY.WORTH_ATTENTION) continue;
    const fit = fitForSurface(inq, { cohortSize: memberCount });
    if (!fit.ok) {
      withheld.push({
        // The topic label, never the claim. Naming what is being withheld and why is
        // safe; restating the finding you just refused to surface is not.
        about: _s((inq.topic && (inq.topic.label || inq.topic.canonicalConcept)) || 'something', 120),
        kind: polarity === POLARITY.WORKING_WELL ? 'high' : 'low',
        blocked: fit.blocked,
      });
      continue;
    }
    surfaceable[polarity === POLARITY.WORKING_WELL ? 'strength' : 'difficulty'].push(inq);
  }

  const project = (inq, kind) => {
    if (!inq) return null;
    const fit = fitForSurface(inq, { cohortSize: memberCount });
    return {
      kind, source: 'contributed',
      inquiryId: _s(inq.inquiryId, 64),
      about: _s((inq.topic && (inq.topic.label || inq.topic.canonicalConcept)) || '', 120),
      claim: _s(inq.hypothesis, 300) || null,
      band: fit.band,
      status: _s(inq.status, 32),
      // Counts survive here only because fitForSurface already put them through the
      // two-sided floor. They are reported because a leader deciding whether to act on
      // a group claim is entitled to know how much it rests on.
      basis: { independentOrigins: fit.origins, contributors: fit.contributors, of: memberCount },
      stillUnknown: _arr(inq.stillUnknown).slice(0, 3).map(u => _s(u, 300)),
      lastUpdatedAt: _num(inq.lastUpdatedAt),
    };
  };

  // Detected findings are observations over admissible group streams, not things
  // people told the group. They therefore carry a distinct source and must clear
  // the same two-sided disclosure floor before becoming a team claim.
  const detected = { high: [], low: [] };
  for (const f of _arr(findings)) {
    const polarity = _s(f.polarity, 32);
    const kind = ['strength', 'progress', 'milestone', 'opportunity'].includes(polarity) ? 'high'
      : ['risk', 'friction'].includes(polarity) ? 'low' : null;
    if (!kind) continue;
    const floor = cohortFloor(f.memberCount, memberCount);
    if (!floor.ok || f.confidence === 'tentative' || f.status === 'disputed') {
      withheld.push({ about: _s(f.about || f.type || 'something', 120), kind,
        source: 'detected', blocked: [{ gate: floor.ok ? 'standing' : 'cohort', reason: floor.ok ? 'the detected pattern is still tentative or disputed' : floor.reason }] });
      continue;
    }
    detected[kind].push({ kind, source: 'detected', findingId: _s(f.findingId || f.type, 64),
      about: _s(f.about || f.type, 120), claim: _s(f.claim || f.basis, 300) || null,
      band: _s(f.confidence, 32), status: _s(f.status || 'observed', 32),
      basis: { members: _num(f.memberCount), of: memberCount }, detectedType: _s(f.type, 64) });
  }

  const high = project(surfaceable.strength.slice().sort(_rank)[0], 'high') || detected.high[0] || null;
  const low = project(surfaceable.difficulty.slice().sort(_rank)[0], 'low') || detected.low[0] || null;
  const question = openQuestion(inquiries, {
    alreadyShown: [high && high.inquiryId, low && low.inquiryId].filter(Boolean),
  });

  const allFocuses = _arr(focuses).map(normalizeFocus)
    .sort((a, b) => b.createdAt - a.createdAt);
  const focus = allFocuses.find(f => f.status === 'active') || allFocuses[0] || null;

  return {
    node: { nodeId: _s(node.nodeId, 64), name: _s(node.name, 120), memberCount },
    high, low, question, focus,
    // Focuses that have RUN. The outcome loop's whole purpose is that a group can see
    // what it tried and what came of it, so a closed focus stays visible rather than
    // disappearing the moment it stops being current.
    history: allFocuses.filter(f => f.status !== 'active' || f.outcome).slice(0, 5),
    statement: statementFor({ high, low, question, focus, withheld }),
    withheld,
    generatedAt: _num(now) || Date.now(),
    generatedBy: 'team-state',
    // No verbatim text can reach here: group inquiries hold refs, never spans, and every
    // string above is a label, a hypothesis statement or a question the kernel composed.
    carriesPrivateContent: false,
  };
}

module.exports = {
  VALENCES, POLARITY, MIN_COHORT, MIN_ORIGINS, FOCUS_STATUSES, OUTCOME_RESULTS,
  valenceOf, cohortFloor, fitForSurface, openQuestion, newFocus, recordFocusOutcome, normalizeFocus,
  statementFor, buildTeamState,
};
