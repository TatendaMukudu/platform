/* ============================================================
   ai/inquiry.js — PURE Inquiry / Epistemic-Planning primitives

   The reasoning layer that decides WHAT the organisation needs to know next, WHY,
   WHO can answer, and whether asking is WORTH THE COST — before anything is asked.

   Questions are ACTIONS: every question spends attention, creates social pressure,
   can expose assumptions, and can distort behaviour. So a proposed question runs the
   same gauntlet an intervention does — value, critic, health-guard — and this module
   only ever RECOMMENDS. It never sends, never writes evidence, never talks to a
   person. It is PURE: no DB, no AI, no I/O. The caller (which holds authorisation)
   feeds it already-admissible beliefs and an org model, and gets back ranked,
   critiqued, routed question PLANS — or nothing, which is the common, correct answer.

   Governing rule, encoded:
     Do not ask "what information can I collect?"
     Ask "what decision / risk / goal / uncertainty would this resolve — and is asking
     this person the safest, least-costly way to resolve it?"
   ============================================================ */

const UNCERTAINTY = Object.freeze({
  MISSING_REQUIRED:     'missing_required',      // a claim that SHOULD exist for a live decision is absent
  STALE:                'stale',                 // a required claim exists but is past its useful life
  CONTRADICTION:        'contradiction',         // admissible beliefs disagree
  UNRESOLVED_DECISION:  'unresolved_decision',   // a decision is open and blocking
  BLOCKED_DEPENDENCY:   'blocked_dependency',    // progress waits on one missing fact
  UNSUPPORTED_HYPOTHESIS: 'unsupported_hypothesis', // a pattern has competing explanations, none confirmed
});

const IMPACT  = Object.freeze({ none: 0, low: 0.3, medium: 0.6, high: 0.9, critical: 1 });
const URGENCY = Object.freeze({ none: 0, low: 0.3, medium: 0.6, high: 0.9, immediate: 1 });
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const round = n => Math.round(n * 100) / 100;

/* Normalise an uncertainty into the canonical object with safe defaults. The caller
   supplies whatever it can derive; missing fields fall back to conservative values
   (low impact, low urgency) so a thin signal never masquerades as an emergency. */
function buildUncertainty(u = {}) {
  u = u || {};
  const beliefs = Array.isArray(u.currentBeliefs) ? u.currentBeliefs.slice(0, 8) : [];
  return {
    id: u.id || null,
    type: Object.values(UNCERTAINTY).includes(u.type) ? u.type : UNCERTAINTY.MISSING_REQUIRED,
    claim: String(u.claim || '').slice(0, 240),          // the uncertain proposition (neutral, no accusation)
    requiredFor: Array.isArray(u.requiredFor) ? u.requiredFor.slice(0, 6) : [],
    currentBeliefs: beliefs,                              // [{ value, authority, confidence }]
    hypotheses: Array.isArray(u.hypotheses) ? u.hypotheses.slice(0, 8) : [],
    impact: u.impact in IMPACT ? u.impact : 'low',
    urgency: u.urgency in URGENCY ? u.urgency : 'low',
    resolutionOwner: u.resolutionOwner || null,          // role/id best able to answer
    ownerAuthoritative: u.ownerAuthoritative === true,   // is that owner the SYSTEM OF RECORD for this claim?
    privacyClass: u.privacyClass || 'team-shared',       // team-shared | org | personal-private | sensitive
    derivable: u.derivable === true,                     // could this be answered from evidence we already hold?
    systemOfRecord: u.systemOfRecord || null,            // an authorised record that could answer without asking a person
    subjectId: u.subjectId || null,                      // the person a claim is ABOUT (never asked-about publicly)
    lastAskedAt: u.lastAskedAt || null,                  // for duplication / cadence control
    observedBaseline: u.observedBaseline || null,        // e.g. "attendance below its 3-week baseline"
  };
}

/* Expected INFORMATION GAIN [0,1]: how much an answer would actually reduce this
   uncertainty. A contradiction between two near-equal beliefs is highly separable;
   a claim already implied by evidence is near-zero (ask nothing). A hypothesis set is
   worth most when one answer discriminates many explanations. */
function infoGain(u) {
  if (u.derivable) return 0.05;                                   // we can answer it ourselves — do that instead
  if (u.type === UNCERTAINTY.CONTRADICTION) {
    // A disputed record is inherently worth fixing (floor 0.5); the closer the two
    // beliefs, the MORE a resolving answer buys us (up to 1).
    const cs = (u.currentBeliefs || []).map(b => Number(b.confidence) || 0).sort((a, b) => b - a);
    if (cs.length < 2) return 0.6;
    return clamp(0.5 + (1 - Math.abs(cs[0] - cs[1])) * 0.5, 0.5, 1);
  }
  if (u.type === UNCERTAINTY.UNSUPPORTED_HYPOTHESIS) {
    return clamp(0.3 + 0.1 * Math.max(0, (u.hypotheses || []).length - 1), 0.3, 1);
  }
  if (u.type === UNCERTAINTY.MISSING_REQUIRED || u.type === UNCERTAINTY.BLOCKED_DEPENDENCY) return 0.8;
  if (u.type === UNCERTAINTY.STALE) return 0.7;   // confirming a stale record fully resolves it
  return 0.5;
}

/* Answer RELIABILITY [0,1] — how much we can trust the chosen owner's answer for THIS
   claim type. The system-of-record for a fact is authoritative; a named owner is
   solid; an unrouted ask is weak. (Reuses the same authority intuition as evidence.) */
function answerReliability(u) {
  if (u.systemOfRecord) return 0.95;
  if (u.resolutionOwner && u.ownerAuthoritative) return 0.85;
  if (u.resolutionOwner) return 0.6;
  return 0.25;
}

/* Costs [0,~1] of asking THIS person THIS question now. */
function askCosts(u) {
  const sensitivity = u.privacyClass === 'sensitive' ? 0.6 : u.privacyClass === 'personal-private' ? 0.5 : 0.03;
  const interruption = 0.05;                                      // any ask spends some attention
  const duplication = u.lastAskedAt ? 0.5 : 0;                    // asked recently → heavy penalty
  return { sensitivity, interruption, duplication };
}

/* QUESTION VALUE [0,1] — the gate. Only asks that clear the threshold are worth a
   human's attention:
     value = impact × infoGain × reliability × (urgency-weighted) − costs
   Derivable/duplicated/sensitive uncertainties collapse toward zero by construction. */
function questionValue(u) {
  const U = buildUncertainty(u);
  const impact = IMPACT[U.impact];
  const gain = infoGain(U);
  const reliability = answerReliability(U);
  const urg = URGENCY[U.urgency];
  const benefit = impact * gain * reliability * (0.55 + 0.45 * urg);
  const c = askCosts(U);
  const value = clamp(benefit - c.sensitivity - c.interruption - c.duplication, 0, 1);
  return round(value);
}

/* Non-leading PHRASING: separate the OBSERVATION from the HYPOTHESIS. Never assume a
   cause ("why has motivation dropped"); state what was observed and ask an open,
   answerable question. Returns a neutral string. */
function phraseQuestion(u) {
  const U = buildUncertainty(u);
  if (U.type === UNCERTAINTY.CONTRADICTION) {
    const vals = (U.currentBeliefs || []).map(b => b.value).filter(Boolean);
    return `There are two different records for ${U.claim || 'this'}${vals.length ? ` (${vals.slice(0, 2).join(' vs ')})` : ''}. Which is correct?`;
  }
  if (U.type === UNCERTAINTY.STALE) {
    return `Our record for ${U.claim || 'this'} may be out of date${U.observedBaseline ? ` (${U.observedBaseline})` : ''}. Is it still current, or has it changed?`;
  }
  if (U.type === UNCERTAINTY.UNSUPPORTED_HYPOTHESIS && U.observedBaseline) {
    // Observation first, hypothesis-neutral prompt second (never an accusation).
    return `${U.observedBaseline}. Were there any schedule, availability, or operational changes that might explain it?`;
  }
  if (U.type === UNCERTAINTY.BLOCKED_DEPENDENCY) {
    return `${U.claim || 'A required detail'} is needed before this can move forward. Can you confirm it?`;
  }
  return `Could you confirm ${U.claim || 'this'}?`;
}

/* The QUESTION CRITIC — challenge a proposed question BEFORE it could reach a person.
   Returns { ok, issues:[{code,severity}] }. A blocker issue means: do not ask. */
function critique(u, question) {
  const U = buildUncertainty(u);
  const text = String(question || phraseQuestion(U));
  const l = text.toLowerCase();
  const issues = [];
  const flag = (code, severity) => issues.push({ code, severity });

  // Leading / assumes its own conclusion ("why has X dropped/failed/lost …").
  if (/\bwhy (?:has|have|did|is|are|do|does)\b.*\b(drop|fell|fallen|declin|lost|fail|worse|down|disengag|demotivat|unmotivat)/.test(l)) flag('leading', 'blocker');
  // Accusatory: names a negative trait as fact.
  if (/\b(lazy|careless|negligent|incompeten|not committed|don'?t care)\b/.test(l)) flag('accusatory', 'blocker');
  // Privacy exposure: a private/sensitive subject must never become a public/leader ask.
  if (U.privacyClass === 'personal-private' || U.privacyClass === 'sensitive') flag('privacy_exposure', 'blocker');
  // Obtainable elsewhere: we should derive or read the system of record first.
  if (U.derivable || U.systemOfRecord) flag('obtainable_elsewhere', 'blocker');
  // Unanswerable by the routed owner (asking someone about a claim they don't own).
  if (!U.resolutionOwner) flag('no_reliable_owner', 'blocker');
  // Not actionable: nothing changes with the answer.
  if (IMPACT[U.impact] <= 0) flag('not_actionable', 'blocker');
  // Vague.
  if (text.trim().length < 12) flag('too_vague', 'warn');
  // Duplication / cadence.
  if (U.lastAskedAt) flag('asked_recently', 'blocker');

  const ok = !issues.some(i => i.severity === 'blocker');
  return { ok, issues };
}

/* HEALTH GUARD — reject inquiries that could raise output while HARMING the
   organisation (wellbeing, autonomy, privacy, fairness, sustainability). This is the
   objective constraint: optimise legitimate goals + human health, never engagement.
   Returns { rejected, reason } — rejected asks are dropped, not queued. */
function healthGuard(u) {
  const U = buildUncertainty(u);
  // Never turn a private/emotional disclosure into a management signal.
  if (U.privacyClass === 'personal-private' || U.privacyClass === 'sensitive')
    return { rejected: true, reason: 'private_or_sensitive_disclosure' };
  // Never single out a person for an explanation of underperformance.
  if (U.subjectId && /\b(underperform|low performer|explain (?:their|his|her) (?:performance|output|numbers)|why are they behind)\b/i.test(U.claim || ''))
    return { rejected: true, reason: 'targets_individual_performance' };
  // Never probe wellbeing/effort as a productivity proxy (late hours, availability-as-loyalty).
  if (/\b(working late|after hours|weekend|why aren'?t you (?:responding|available)|commitment|loyalty|return (?:from|to) (?:injury|training) (?:early|sooner))\b/i.test(U.claim || ''))
    return { rejected: true, reason: 'wellbeing_used_as_performance_proxy' };
  return { rejected: false, reason: null };
}

/* ROUTING — pick the LEAST-BURDENSOME resolution path, in order:
   derive → system-of-record → responsible owner → narrow group → escalate.
   Never asks a group what one owner can answer. */
function route(u) {
  const U = buildUncertainty(u);
  if (U.derivable)      return { method: 'derive_from_evidence', target: null };
  if (U.systemOfRecord) return { method: 'inspect_system_of_record', target: U.systemOfRecord };
  if (U.resolutionOwner) return { method: 'ask_owner', target: U.resolutionOwner };
  return { method: 'escalate', target: null };                   // no safe owner → surface to a human to route
}

/* Given an UNSUPPORTED_HYPOTHESIS with competing explanations, pick the ONE inquiry
   that best DISCRIMINATES them at the lowest cost — the difference between intelligent
   inquiry and blanket surveying. `hypotheses` carry a `separatedBy` tag (which single
   fact would rule them in/out); we choose the fact that separates the most, cheapest. */
function discriminate(u) {
  const U = buildUncertainty(u);
  const tally = new Map();
  for (const h of U.hypotheses) {
    const key = h.separatedBy || h.probe;
    if (!key) continue;
    const rec = tally.get(key) || { key, separates: 0, cost: h.probeCost != null ? h.probeCost : 0.3, owner: h.probeOwner || U.resolutionOwner };
    rec.separates += 1;
    tally.set(key, rec);
  }
  const ranked = [...tally.values()].sort((a, b) => (b.separates - a.separates) || (a.cost - b.cost) || (a.key < b.key ? -1 : 1));
  return ranked[0] || null;
}

/* ANSWER ADJUDICATION — when an answer eventually arrives it does NOT auto-become
   truth. Classify observation vs interpretation, and whether the answerer is
   authoritative for THIS claim (reuses the evidence authority tiers). Recommends how
   the answer should enter canonical evidence: authoritative | reported | needs
   corroboration. Pure — the caller applies it through the governed door. */
function adjudicateAnswer({ answer, answererRole, claimType, ownerRole, conflictsWithAuthoritative } = {}) {
  const text = String(answer || '');
  const interpretation = /\b(i (?:think|feel|reckon|guess|believe)|seems?|maybe|probably|might be|burn(?:t|ed)? ?out|morale|vibe)\b/i.test(text);
  const authoritative = !!(answererRole && ownerRole && answererRole === ownerRole) && !interpretation;
  let recommend;
  if (authoritative && !conflictsWithAuthoritative) recommend = 'authoritative';
  else if (interpretation) recommend = 'reported_perception';
  else if (conflictsWithAuthoritative) recommend = 'needs_corroboration';
  else recommend = 'reported';
  return { kind: interpretation ? 'interpretation' : 'observation', authoritative, recommend };
}

/* THE PLANNER — turn raw uncertainties into a ranked, deduped, capped set of
   recommendation-only QUESTION PLANS. An uncertainty becomes a plan ONLY if it:
   clears the value threshold, survives the critic, passes the health guard, is routed
   to a real owner, and isn't a near-duplicate of one already planned. Returns at most
   `maxAsks` — restraint is a feature. This NEVER sends; status is always 'recommended'. */
function planInquiries(uncertainties, opts = {}) {
  const threshold = Number.isFinite(opts.threshold) ? opts.threshold : 0.4;
  const maxAsks = Number.isInteger(opts.maxAsks) ? opts.maxAsks : 3;
  const seen = new Set();
  const plans = [];
  const rejected = [];
  for (const raw of (uncertainties || [])) {
    const u = buildUncertainty(raw);
    const guard = healthGuard(u);
    if (guard.rejected) { rejected.push({ id: u.id, reason: guard.reason }); continue; }
    const routing = route(u);
    // Prefer NOT asking a person when we can answer it ourselves or from a record.
    if (routing.method === 'derive_from_evidence' || routing.method === 'inspect_system_of_record') {
      rejected.push({ id: u.id, reason: 'answerable_without_asking', routing }); continue;
    }
    const question = phraseQuestion(u);
    const crit = critique(u, question);
    const value = questionValue(u);
    if (!crit.ok) { rejected.push({ id: u.id, reason: 'failed_critique', issues: crit.issues }); continue; }
    if (value < threshold) { rejected.push({ id: u.id, reason: 'below_value_threshold', value }); continue; }
    const dedupeKey = `${routing.target}|${question.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`;
    if (seen.has(dedupeKey)) { rejected.push({ id: u.id, reason: 'duplicate' }); continue; }
    seen.add(dedupeKey);
    plans.push({
      id: 'inq_' + (u.id || Math.random().toString(36).slice(2, 9)),
      uncertaintyId: u.id, uncertaintyType: u.type,
      question, why: u.requiredFor.length ? `Needed for ${u.requiredFor.join(', ')}.` : 'Resolves an open uncertainty.',
      requiredFor: u.requiredFor, method: routing.method, owner: routing.target,
      visibility: u.privacyClass === 'org' ? 'organisation' : 'team-shared',
      askWorthiness: value, critique: crit.issues, status: 'recommended',
    });
  }
  plans.sort((a, b) => b.askWorthiness - a.askWorthiness);
  return { plans: plans.slice(0, maxAsks), considered: (uncertainties || []).length, rejected };
}

module.exports = {
  UNCERTAINTY, IMPACT, URGENCY,
  buildUncertainty, infoGain, answerReliability, askCosts, questionValue,
  phraseQuestion, critique, healthGuard, route, discriminate, adjudicateAnswer, planInquiries,
};
