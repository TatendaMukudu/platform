/* ============================================================
   ai/diagnose.js — SEMANTIC INTAKE (pure)

   The input side of the flip. Until now the ears were ai/comprehend.js: a ~40-stem lexicon
   that turned "I've been struggling with my first touch when someone closes me down" into
   `support_need = true`. It destroyed the information before anything else could reason over
   it — the words "first touch" do not exist in its vocabulary, so neither did the problem.

   This module is the intake engine for the platform. The pipeline it serves:

     raw utterance → SEMANTIC PROPOSAL → adjudication → inquiry state
                   → question selection → conversation → confirmed evidence → re-derivation

   and the boundaries are rigid:

     • It NEVER writes evidence, never mutates a person, never decides someone "lacks
       confidence". It proposes candidate interpretations, explicitly grounded in what was
       actually said. Deterministic code then decides what a proposal is allowed to do.
     • The four epistemic levels never collapse into one field. "I lose the ball when pressed"
       is an OBSERVATION. "Poor scanning" is an INTERPRETATION. "Scanning deficiency causes
       loss of possession" is a HYPOTHESIS. "Scanning is the primary limiting factor" is a
       CONCLUSION — and the model may never propose one of those at all.
     • CONFIDENCE is computed here from deterministic factors. A model asserting 0.87 is
       extremely articulate fake mathematics, and is discarded.

   The primitive is deliberately called an INQUIRY, not a diagnosis. The same machinery has to
   surface what someone is unusually good at, the conditions under which they perform well, and
   the habits that produce success — not only what is wrong. "Diagnostic state" is the product
   word; naming the primitive after problems would quietly bias the engine into a weakness
   detector.

   Why this needs no domain packs: the LLM supplies domain language, this kernel supplies
   universal epistemology — what was claimed, who said it, how directly, what supports it, what
   contradicts it, what is still unknown, what to ask next, how confident we may be. Those
   questions are identical whether the sentence is "my first touch disappears under pressure",
   "the line keeps missing tolerance after the tooling change", or "our reps aren't converting
   enterprise demos".

   PURE: imports only the canonical polarity vocabulary, no IO or network. The model call lives
   at the server edge.
   ============================================================ */

const polarityOwner = require('./intelligence-feed');

/* ── EPISTEMIC LEVELS ────────────────────────────────────────────────────────
   Ordered by how much they claim. A level may only rest on levels beneath it. */
const LEVELS = ['observation', 'interpretation', 'hypothesis', 'conclusion'];
const LEVEL_RANK = { observation: 0, interpretation: 1, hypothesis: 2, conclusion: 3 };

/* A CONCLUSION is never the model's to draw — it is the deterministic core's, from a
   supported hypothesis. Listing it keeps the refusal explicit rather than implied. */
const MODEL_MAY_PROPOSE = new Set(['observation', 'interpretation', 'hypothesis']);

const _norm = s => String(s == null ? '' : s).toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();

/* Does this span genuinely come from what they said? Exact containment first — that is the
   guarantee we want. But a model that drops a filler word ("struggling with first touch" for
   "struggling with my first touch") is still pointing at real words, and rejecting it throws
   away a true observation. So we fall back to: every word of the span appears in the utterance,
   in order. That still cannot admit an invented claim — every token has to be theirs. */
function _spanIsTheirs(span, utterance) {
  const s = _norm(span), u = _norm(utterance);
  if (!s || !u) return false;
  if (u.includes(s)) return true;
  const words = s.split(' ').filter(Boolean);
  if (words.length < 2) return false;                 // a single word is not a quotation
  let from = 0;
  for (const w of words) {
    const at = u.indexOf(w, from);
    if (at === -1) return false;                       // a word they never said → not theirs
    from = at + w.length;
  }
  return true;
}
const _clamp01 = n => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);

/* ── 1. GROUNDING ────────────────────────────────────────────────────────────
   Every proposal must be traceable to what the person actually said. An OBSERVATION carries a
   sourceSpan that has to appear in the utterance — near-verbatim, so we can point at the words
   that caused it. An INTERPRETATION or HYPOTHESIS must rest on at least one accepted
   observation, so "poor scanning habits" can always be traced back to a real sentence.

   Returns { accepted, rejected } — rejected proposals carry the reason, which is worth logging:
   a model that keeps failing grounding is a model that is guessing. */
function groundProposals(proposals, { utterance = '', turnId = '', knownObservationIds = [] } = {}) {
  const accepted = [], rejected = [];
  const okIds = new Set(knownObservationIds);

  for (const raw of Array.isArray(proposals) ? proposals : []) {
    const p = raw && typeof raw === 'object' ? raw : {};
    const level = String(p.level || '').toLowerCase();
    // The contract asks for "text". Accept the obvious synonyms too: losing a real observation
    // because a model called the field "claim" is a self-inflicted wound, and the grounding
    // discipline below is unchanged either way.
    const text = String(p.text || p.claim || p.statement || p.content || '').trim();

    if (!text) { rejected.push({ proposal: p, reason: 'empty text' }); continue; }
    if (!LEVELS.includes(level)) { rejected.push({ proposal: p, reason: `unknown level "${p.level}"` }); continue; }
    if (!MODEL_MAY_PROPOSE.has(level)) {
      // The refusal that matters most: a model does not get to conclude.
      rejected.push({ proposal: p, reason: 'a conclusion is not the model\'s to draw' });
      continue;
    }

    if (level === 'observation') {
      const span = String(p.sourceSpan || '').trim();
      if (!span) { rejected.push({ proposal: p, reason: 'observation without a source span' }); continue; }
      if (!_spanIsTheirs(span, utterance)) {
        rejected.push({ proposal: p, reason: 'source span does not appear in what they said' });
        continue;
      }
      const id = String(p.id || `obs_${accepted.length}_${turnId}`);
      okIds.add(id);
      accepted.push({ ...p, id, level, text, sourceSpan: span, turnId, grounded: true });
      continue;
    }

    // interpretation / hypothesis — must rest on observations we accepted.
    const basis = (Array.isArray(p.basis) ? p.basis : []).map(String).filter(b => okIds.has(b));
    if (!basis.length) {
      rejected.push({ proposal: p, reason: `${level} with no grounded observation beneath it` });
      continue;
    }
    accepted.push({ ...p, id: String(p.id || `${level}_${accepted.length}_${turnId}`), level, text, basis, turnId, grounded: true });
  }
  return { accepted, rejected };
}

/* ── 2. CONFIDENCE (deterministic) ───────────────────────────────────────────
   Never the model's number. Computed from the shape of the evidence beneath a claim:

     independence  — how many SEPARATE signals, not how many times one was repeated
     directness    — the person's own words about themselves beat an inference about them
     authority     — an authoritative record beats an unverified self-report for org facts
     corroboration — independent sources agreeing
     recency       — stale signals decay; the world moves
     specificity   — "my touch gets away when pressed from behind" beats "not great lately"
     contradiction — anything that disagrees pulls confidence DOWN, hard

   Returns a band as well as a score, because a band is what a person should ever be shown. */
const _BANDS = [
  { at: 0.75, band: 'supported' },
  { at: 0.50, band: 'probable' },
  { at: 0.25, band: 'emerging' },
  { at: 0.00, band: 'tentative' },
];

/* ── ORIGIN ──────────────────────────────────────────────────────────────────
   Three different questions that were previously one:

     source    — who or what handed this evidence to IntelliQ
     origin    — the underlying occurrence the evidence ultimately comes from
     occasion  — the telling: when this particular account was given

   The captain says after Saturday's match "their press kept forcing us backwards". Four
   teammates later say "yeah, like the captain said". That is five sources, five occasions, and
   ONE origin. It is not five people who noticed something.

   Contrast: player A notices it, player B notices it independently, the coach notices it, and
   video analysis identifies it. Same match — one occasion in the everyday sense — but four
   origins, because four separate observations were made. Origin is about what was observed
   separately, not about when.

   originKind says what KIND of thing the evidence traces back to. It is deliberately coarse:
   fine-grained provenance is the canonical evidence layer's job, and this kernel only needs
   enough to weigh independence. */
const ORIGIN_KINDS = [
  'direct_observation',   // the source saw it themselves
  'self_report',          // the subject describing their own experience
  'reported',             // relaying what someone else observed — NOT an independent origin
  'document',             // an import, file or record
  'system',               // derived by IntelliQ from data it already holds
  'unknown',              // we could not establish it. The default, and it is conservative.
];

/* How much credit reports of unestablished origin may earn between them, in units of "distinct
   origin". Two, meaning at most one possible corroborator: without origin we cannot rule out
   that a whole room is repeating one telling, so a room may never out-weigh two people known to
   have seen a thing separately. Deliberately a small calibrated constant in the same spirit as
   the occasion ceiling below, not a tunable. */
const UNKNOWN_ORIGIN_CAP = 2;

/* ── SIGNAL STATUS ───────────────────────────────────────────────────────────
   A signal is 'active' until something says otherwise. The alternatives are what make a picture
   correctable rather than merely accumulating:

     superseded — a later account replaced this one ("I watched the video; my touch was fine")
     withdrawn  — the source retracted it without replacing it

   Neither deletes anything. The claim, its timestamp and its provenance all stay, because "we
   believed X because of A, then A was corrected by B" is a far more trustworthy thing to be able
   to say than pretending A never happened. They simply stop counting as current support. */
const SIGNAL_STATUSES = ['active', 'superseded', 'withdrawn'];
const isActive = s => !s || !s.status || s.status === 'active';

/* How decisively the case against must beat the case for before an explanation is ruled out,
   and how close the two must be to count as a live disagreement. The margin is what stops one
   weak dissent felling a well-evidenced explanation; the contest band is what stops a real
   disagreement being rounded to "still open, nothing to see". */
const REFUTATION_MARGIN = 1.25;
const CONTEST_MARGIN    = 0.6;

function deriveConfidence(signals = [], { now = Date.now(), halfLifeDays = 45, asCounterEvidence = false } = {}) {
  const all = (Array.isArray(signals) ? signals : []).filter(Boolean);
  // A corrected signal stays in the record for history, but it is no longer something we
  // believe. Counting it would mean a claim the person has since withdrawn still holds the
  // picture up — see supersede().
  const list = all.filter(s => isActive(s));
  if (!list.length) {
    return all.length
      ? { score: 0, band: 'tentative', because: [`${all.length} signal${all.length === 1 ? '' : 's'}, all superseded or withdrawn`] }
      : { score: 0, band: 'tentative', because: ['nothing recorded yet'] };
  }

  const because = [];

  /* INDEPENDENCE, measured in ORIGINS rather than sources.

     `source` is who handed us the evidence. `origin` is the underlying occurrence it ultimately
     comes from. They are not the same thing, and the difference is the whole reason this exists:
     five teammates repeating what the captain said after Saturday's match is five sources and
     ONE origin. Counting sources, the old behaviour, reads that as five confirmations — a system
     growing certain because a room agreed with itself.

     For one member talking about themselves this rarely bit, because a member IS one source. Add
     a group, where several people discussing the same session is the ordinary case, and counting
     sources manufactures confidence out of repetition. */
  const known = new Map();          // originRef → true
  const unknownSources = new Set();
  for (const s of list) {
    const ref = s.originRef ? String(s.originRef) : '';
    if (ref) known.set(ref, true);
    else unknownSources.add(String(s.source || 'self'));
  }

  /* Unknown origin is NOT independent origin. If we cannot tell whether five reports trace back
     to one telling, crediting them as five clean confirmations invents the very independence we
     failed to establish. But nor is unknown worthless — different people saying a thing is weak
     evidence that they saw it separately. So unknown origins earn at most UNKNOWN_ORIGIN_CAP:
     the credit of "possibly one corroborating voice", and never more, however large the room. */
  const unknownEff = Math.min(UNKNOWN_ORIGIN_CAP, unknownSources.size);
  const nEff = known.size + unknownEff;
  const independence = Math.min(1, (nEff - 1) / 3 + (nEff ? 0.34 : 0));
  if (known.size && unknownSources.size) {
    because.push(`${known.size} distinct origin${known.size === 1 ? '' : 's'}, plus ${unknownSources.size} report${unknownSources.size === 1 ? '' : 's'} of unestablished origin`);
  } else if (known.size) {
    because.push(`${known.size} independent origin${known.size === 1 ? '' : 's'}`);
  } else {
    because.push(`${unknownSources.size} source${unknownSources.size === 1 ? '' : 's'}, origin not established`);
  }

  // TEMPORAL independence, which is a different thing and was missing. An evidentiary OCCASION
  // is one telling: someone restating the same situation twice in a single message is one
  // occasion, not two confirmations. Without this, paraphrase inflates confidence —
  // attendance_timing reached "probable" off two sentences from one conversation, which is a
  // system growing certain because a person spoke at length rather than because it learned
  // anything. Two signals split across two weeks is real corroboration; two in one breath is not.
  const occasions = new Set(list.map(s => `${s.source || 'self'}@${s.turnId || s.at || ''}`));
  const temporal = Math.min(1, (occasions.size - 1) / 3 + (occasions.size ? 0.34 : 0));
  if (occasions.size !== list.length) {
    because.push(`${list.length} signals across ${occasions.size} occasion${occasions.size === 1 ? '' : 's'}`);
  }

  const avg = (fn) => list.reduce((a, s) => a + fn(s), 0) / list.length;
  const directness  = avg(s => (s.directness === 'direct' ? 1 : 0.45));
  const authority   = avg(s => (s.authority === 'authoritative' ? 1 : s.authority === 'corroborated' ? 0.75 : 0.5));
  const specificity = avg(s => _clamp01(typeof s.specificity === 'number' ? s.specificity : 0.5));
  const recency     = avg(s => {
    const at = Number(s.at) || now;
    const days = Math.max(0, (now - at) / 86400000);
    return Math.pow(0.5, days / Math.max(1, halfLifeDays));
  });

  const contradictions = list.filter(s => s.contradicts || s.dissents).length;
  const contradictionPenalty = contradictions ? Math.pow(0.45, contradictions) : 1;
  if (contradictions) because.push(`${contradictions} contradicting signal${contradictions === 1 ? '' : 's'}`);

  // One telling should never read as settled, however specific or however many ways it was
  // phrased. The ceiling is on OCCASIONS, not signals — the point is that the person has only
  // told us once, and saying it twice in that once does not make it twice true.
  /* Both ceilings below cap how strongly a claim may be ASSERTED. They must not cap how strongly
     it can be DOUBTED, which is a different act: it is properly easier to unsettle a claim than
     to establish one, and one credible account saying "that isn't what happened" should register
     fully even though the same account could not settle the matter by itself. Weighing
     counter-evidence therefore skips them — otherwise a single contradiction is discounted for
     being single, and a well-supported explanation becomes almost impossible to challenge. */
  const singleOccasionCeiling = (occasions.size === 1 && !asCounterEvidence) ? 0.45 : 1;
  if (list.length === 1) because.push('only one signal so far');
  else if (occasions.size === 1) because.push('all from one telling');

  /* The same ceiling, one level up. Everything tracing to ONE established origin is one thing
     that happened, however many people relayed it and across however many days. Retelling is not
     corroboration, so a single-origin picture cannot reach 'supported' on volume alone — it needs
     a second origin. Set just above the single-occasion ceiling: a claim many people repeat over
     weeks is worth marginally more than one said once, and much less than two people who saw it
     separately. */
  const singleOriginCeiling = (known.size === 1 && !unknownSources.size && !asCounterEvidence) ? 0.55 : 1;
  if (singleOriginCeiling < 1 && list.length > 1) because.push('all tracing back to one origin');

  const score = _clamp01(
    independence * 0.22 + temporal * 0.18 + directness * 0.16
    + authority * 0.16 + specificity * 0.14 + recency * 0.14
  ) * contradictionPenalty * singleOccasionCeiling * singleOriginCeiling;

  const band = (_BANDS.find(b => score >= b.at) || _BANDS[_BANDS.length - 1]).band;
  return { score: Math.round(score * 100) / 100, band, because };
}

/* ── 3. THE INQUIRY STATE ────────────────────────────────────────────────────
   One live line of understanding about a subject. Neutral by construction: `polarity` may be a
   strength or a difficulty or a condition for success, so the engine is not a weakness detector.

   AN INQUIRY IS A PROJECTION, NOT A STORE. It holds evidenceRefs — never copies of the text.
   The first cut of this module copied signal text inline, which quietly created a second
   substrate: no provenance, no inherited visibility, and no deletion path, so erasing a piece
   of evidence would have left its content sitting in an inquiry forever. Canonical evidence
   stays the one provenance-bearing truth; this reads it.

   `signals` therefore carries only what the KERNEL needs to weigh a claim — the reference, and
   the shape of the evidence (how direct, whose authority, how specific, when, does it dissent).
   Rendering resolves refs through the normal authorised read, so a reader can only ever see
   what they were already entitled to see. */
function newInquiry({ id, subjectRef, concept, label, domain = '', polarity = 'neutral', now = Date.now(), parentId = null, canonicalMeaning = '' } = {}) {
  return {
    inquiryId: String(id || `inq_${now}`),
    subjectRef: String(subjectRef || ''),
    // IDENTITY IS THE OBJECT, NOT THE STRING. The concept name is vocabulary: one more way this
    // has been referred to. Keying understanding on the spelling meant a model saying
    // "session_attendance" where it once said "training_attendance" created a second belief
    // about the same thing — and then both crossed thresholds independently, so the system grew
    // more confident precisely because it had grown less coherent. Aliases accumulate; the
    // inquiry persists.
    canonicalMeaning: String(canonicalMeaning || label || concept || ''),
    displayLabel: String(label || concept || ''),
    aliases: [String(concept || '')].filter(Boolean),
    // REFINES gives the frontier a shape: "we know attendance is inconsistent; the open question
    // is whether lateness or absence drives it" is a different statement from four flat cards.
    parentId: parentId ? String(parentId) : null,
    // Why this exists as its own line of inquiry, in the comprehension layer's own words.
    provenance: [],                    // [{ at, relationship, targetId, concept, reason }]
    topic: { canonicalConcept: String(concept || ''), label: String(label || concept || ''), domain: String(domain || '') },
    polarity: polarityOwner.normalizePolarity(polarity), // one canonical vocabulary; legacy aliases normalize at intake
    hypotheses: [],                    // [{ id, statement, confidence, supportRefs, challengeRefs, status }]
    leadingHypothesisId: null,
    signals: [],                       // [{ ref, kind, directness, authority, specificity, at, dissents }] — REFS ONLY
    missingSignals: [],                // the collection frontier
    falsifiers: [],                    // what would show the leading hypothesis is wrong
    confidence: { score: 0, band: 'tentative', because: ['nothing recorded yet'] },
    status: 'exploring',               // exploring | probable | supported | disputed | resolved
    timeline: [],                      // HOW the understanding changed — see _recordTimeline
    createdAt: now, lastUpdatedAt: now,
  };
}

/* ── THE TIMELINE ────────────────────────────────────────────────────────────
   An inquiry that only shows its current state throws away the most defensible thing it has:
   how it got there. "Scanning is the leading explanation" is an assertion. "Technical was
   leading until film evidence arrived on the 5th, and it has not recovered" is a record — and
   it is what makes a conclusion auditable, contestable, and worth trusting later.

   The same discipline as signals applies: entries reference evidence, they never quote it.
   Hypothesis statements are the system's own proposals and may appear; a person's words may not.
   Only MATERIAL change is recorded — re-applying known evidence writes nothing, or the history
   becomes noise and the blob grows for no reason. */
const TIMELINE_CAP = 40;

function _recordTimeline(before, after, now) {
  const events = [];
  const bSig = new Set((before.signals || []).map(s => s.ref));
  const fresh = (after.signals || []).filter(s => !bSig.has(s.ref));
  if (fresh.length) {
    const dissent = fresh.filter(s => s.dissents).length;
    events.push({ at: now, kind: dissent ? 'contradiction' : 'evidence',
      summary: dissent
        ? `${dissent} signal${dissent === 1 ? '' : 's'} arrived that disagree with the current read`
        : `${fresh.length} new signal${fresh.length === 1 ? '' : 's'}`,
      refs: fresh.map(s => s.ref) });
  }

  /* A correction is the most important thing that can happen to a picture, and the least
     visible if it is not recorded: the signal is still there, it simply stopped counting. Saying
     so is what lets the system explain "we thought X because of A; A was corrected by B". */
  const wasActive = new Map((before.signals || []).map(s => [s.ref, !s.status || s.status === 'active']));
  const corrected = (after.signals || []).filter(s => !isActive(s) && wasActive.get(s.ref) === true);
  if (corrected.length) {
    const withdrawn = corrected.filter(s => s.status === 'withdrawn').length;
    events.push({ at: now, kind: 'correction',
      summary: withdrawn === corrected.length
        ? `${corrected.length} earlier account${corrected.length === 1 ? ' was' : 's were'} withdrawn`
        : `${corrected.length} earlier account${corrected.length === 1 ? '' : 's'} corrected by later evidence`,
      refs: corrected.map(s => s.ref) });
  }

  const bHyp = new Set((before.hypotheses || []).map(h => h.id));
  for (const h of (after.hypotheses || [])) {
    if (!bHyp.has(h.id)) events.push({ at: now, kind: 'hypothesis', summary: `New explanation on the table: ${h.statement}`, refs: [] });
  }

  for (const h of (after.hypotheses || [])) {
    const was = (before.hypotheses || []).find(x => x.id === h.id);
    if (was && was.status !== 'refuted' && h.status === 'refuted') {
      events.push({ at: now, kind: 'refuted', summary: `Ruled out by the evidence: ${h.statement}`, refs: h.challengeRefs.slice(0, 4) });
    }
  }

  if (before.leadingHypothesisId !== after.leadingHypothesisId) {
    const lead = (after.hypotheses || []).find(h => h.id === after.leadingHypothesisId);
    const old = (before.hypotheses || []).find(h => h.id === before.leadingHypothesisId);
    if (lead) events.push({ at: now, kind: 'lead_change',
      summary: old ? `The evidence now favours "${lead.statement}" over "${old.statement}"` : `Leading explanation: ${lead.statement}`,
      refs: [], from: old ? old.statement : null, to: lead.statement });
  }

  const bBand = (before.confidence || {}).band, aBand = (after.confidence || {}).band;
  if (bBand !== aBand) events.push({ at: now, kind: 'confidence', summary: `Confidence moved from ${bBand} to ${aBand}`, refs: [], from: bBand, to: aBand });
  if (before.status !== after.status) events.push({ at: now, kind: 'status', summary: `Now ${after.status}`, refs: [], from: before.status, to: after.status });

  if (!events.length) return after.timeline || [];
  // Keep the beginning (where it started is never noise) and the most recent movement.
  const all = [...(after.timeline || []), ...events];
  return all.length <= TIMELINE_CAP ? all
    : [...all.slice(0, 3), { at: all[3].at, kind: 'elided', summary: `${all.length - TIMELINE_CAP} earlier changes not kept`, refs: [] }, ...all.slice(-(TIMELINE_CAP - 4))];
}

/* A hypothesis is a first-class object, not a sentence on the inquiry. Evidence SUPPORTS or
   CHALLENGES it, and each hypothesis carries its own confidence — so three rival explanations
   can rise and fall independently as evidence arrives, which is what makes the reasoning
   longitudinal instead of a snapshot recomputed from a flat list. */
function newHypothesis({ id, statement, now = Date.now() } = {}) {
  return {
    id: String(id || `hyp_${now}`),
    statement: String(statement || '').trim(),
    supportRefs: [], challengeRefs: [],
    confidence: { score: 0, band: 'tentative', because: ['nothing supports this yet'] },
    status: 'open',                    // open | leading | refuted | settled
    createdAt: now,
  };
}

const _STATUS_FOR = (band, contradictions) =>
  contradictions ? 'disputed' : band === 'supported' ? 'supported' : band === 'probable' ? 'probable' : 'exploring';

/* Apply GROUNDED proposals to an inquiry. Nothing here becomes evidence — this is the working
   picture, from which a person may later confirm something into the real record. */
/* Normalise whatever the intake layer said about where a claim comes from.

   Conservative by construction: an unrecognised kind, or a kind that names no occurrence,
   becomes 'unknown' with no originRef — which earns the capped credit rather than the
   independence of an established origin. A claim of independence we cannot check is exactly
   what this module exists to stop being free.

   'reported' is the important case. Someone relaying what another person observed carries the
   origin of the ORIGINAL observation, so the retelling adds a voice and not a witness. */
function originOf(p = {}) {
  const kindRaw = String(p.originKind || '').toLowerCase().replace(/[\s-]+/g, '_');
  const kind = ORIGIN_KINDS.includes(kindRaw) ? kindRaw : 'unknown';
  const ref = String(p.originRef || '').trim().slice(0, 120);
  // A kind without a reference cannot be distinguished from any other occurrence of that kind,
  // so it establishes nothing about independence and is recorded as unknown.
  if (!ref) return { originKind: kind === 'unknown' ? 'unknown' : kind, originRef: null };
  return { originKind: kind, originRef: ref };
}

/* ── CORRECTION ──────────────────────────────────────────────────────────────
   "Actually, I watched the video — my touch was fine, the problem was my body position."

   Correction and contradiction are different things and must not be conflated.

     CONTRADICTION — two accounts disagree. The coach says positioning was the problem, the
                     player says it was fine. BOTH stay live; the disagreement is the finding,
                     and deciding it is not the kernel's to do silently.
     CORRECTION    — the account is revised at its own source, or by something entitled to
                     overrule it. The earlier claim stops being current. Nobody now asserts it.

   So who may correct what is decided deterministically, never by the model's say-so: the same
   source may always revise itself, and an authoritative record may overrule an unverified
   report. Anything else claiming to correct is treated as a contradiction instead — which
   preserves it, weighs it against the claim, and leaves the disagreement visible. */
function canCorrect(prior, incoming) {
  if (!prior || !incoming) return false;
  const same = String(prior.source || '') === String(incoming.source || '');
  if (same) return true;                                    // a source revising itself
  return incoming.authority === 'authoritative' && prior.authority !== 'authoritative';
}

/* Mark a signal superseded or withdrawn, keeping it. Returns a NEW signal — callers work on
   copies, so history cannot be edited by accident. */
function supersede(signal, { by = null, at = Date.now(), reason = '', status = 'superseded' } = {}) {
  return {
    ...signal,
    status: SIGNAL_STATUSES.includes(status) ? status : 'superseded',
    supersededBy: by ? String(by) : null,
    supersededAt: at,
    supersededReason: String(reason || '').slice(0, 300),
  };
}

function applyProposals(inquiry, accepted = [], { now = Date.now(), evidenceRefOf } = {}) {
  const next = JSON.parse(JSON.stringify(inquiry));
  // A proposal points at governed evidence. Until the caller supplies a real ref (the evidence
  // this turn produced), we hold the proposal's own id — still a reference, never the content.
  const refOf = typeof evidenceRefOf === 'function' ? evidenceRefOf : (p => String(p.id));

  for (const p of accepted) {
    if (p.level === 'observation' || p.level === 'interpretation') {
      const isInterp = p.level === 'interpretation';
      const ref = refOf(p);
      if (next.signals.some(s => s.ref === ref)) continue;           // idempotent on replay
      next.signals.push({
        ref, kind: isInterp ? 'interpretation' : 'observation',
        directness: isInterp ? 'inferred' : (p.directness || 'direct'),
        authority: isInterp ? 'unverified' : (p.authority || 'self_report'),
        source: isInterp ? 'interpretation' : (p.source || 'self'),
        // WHAT THIS IS ULTIMATELY BASED ON. Absent means unknown, which is treated
        // conservatively rather than as independent — see deriveConfidence. A retelling names
        // the origin it is retelling, so relaying a thing never counts as observing it.
        ...originOf(p),
        status: 'active',
        specificity: isInterp ? 0.4 : p.specificity,
        // The turn this came from, so confidence can tell one telling from two. Without it,
        // three paraphrases of one sentence weigh as three occasions.
        turnId: p.turnId || null,
        at: now, dissents: !!p.contradicts,
        // Which hypothesis this bears on, and which way. The model may say; if it does not,
        // the signal still counts toward the inquiry but weighs on nothing in particular.
        supports: p.supports ? String(p.supports) : null,
        challenges: p.challenges ? String(p.challenges) : null,
        /* Contribution provenance, when this evidence crossed a boundary to get here (see
           ai/contribution.js). Absent for ordinary Self evidence, which never crossed one. The
           kernel does not read these — they answer "who put this here and may they take it
           back", which is a governance question, not an epistemic one. */
        ...(p.contributedBy ? {
          contributedBy: String(p.contributedBy),
          contributedAt: p.contributedAt || now,
          contributorRole: p.contributorRole || 'member',
          contributorVisibility: p.contributorVisibility === 'anonymous' ? 'anonymous' : 'named',
          verbatim: p.verbatim === true,
          fromSubject: p.fromSubject || null,
        } : {}),
      });

      /* "I take that back" is not evidence FOR anything. A withdrawal exists so the record can
         say the claim was retracted and by whom; counting it as a live observation would mean
         retracting something left the evidence base exactly as large as before, which is how a
         withdrawal ends up costing nothing. A correction that REPLACES a claim is different —
         that one is a real account and counts normally. */
      if (p.withdraws) next.signals[next.signals.length - 1].status = 'withdrawn';

      /* A proposal may say it CORRECTS an earlier claim. Whether it gets to is decided here,
         not by the model asserting it: the same source may revise itself, and an authoritative
         record may overrule an unverified one. Anything else becomes a contradiction, so the
         disagreement is kept and weighed rather than one side quietly winning. */
      const targets = (Array.isArray(p.corrects) ? p.corrects : (p.corrects ? [p.corrects] : [])).map(String);
      const incoming = next.signals[next.signals.length - 1];
      for (const t of targets) {
        const i = next.signals.findIndex(s => s.ref === t && s.ref !== ref);
        if (i === -1) continue;
        if (canCorrect(next.signals[i], incoming)) {
          next.signals[i] = supersede(next.signals[i], {
            by: ref, at: now,
            reason: String(p.correctionReason || p.text || '').slice(0, 300),
            status: p.withdraws ? 'withdrawn' : 'superseded',
          });
        } else {
          // Not entitled to correct — so it disagrees instead, and both accounts stand.
          incoming.dissents = true;
          incoming.disputes = incoming.disputes || [];
          if (!incoming.disputes.includes(t)) incoming.disputes.push(t);
        }
      }
    } else if (p.level === 'hypothesis') {
      // Rival explanations COEXIST. A new one never overwrites the old — they compete, and
      // evidence decides. This is the difference between reasoning and last-writer-wins.
      let h = next.hypotheses.find(x => _norm(x.statement) === _norm(p.text));
      if (!h) { h = newHypothesis({ id: p.id, statement: p.text, now }); next.hypotheses.push(h); }
      for (const b of (Array.isArray(p.basis) ? p.basis : [])) {
        if (!h.supportRefs.includes(String(b))) h.supportRefs.push(String(b));
      }
      for (const alt of (Array.isArray(p.alternatives) ? p.alternatives : [])) {
        const t = String(alt || '').trim();
        if (t && !next.hypotheses.some(x => _norm(x.statement) === _norm(t))) {
          next.hypotheses.push(newHypothesis({ id: `${p.id}_alt${next.hypotheses.length}`, statement: t, now }));
        }
      }
      for (const f of (Array.isArray(p.falsifiers) ? p.falsifiers : [])) {
        const t = String(f || '').trim();
        if (t && !next.falsifiers.includes(t)) next.falsifiers.push(t);
      }
    }
  }

  // Route each signal to the hypotheses it bears on, so a rival can be CHALLENGED by the very
  // evidence that supports another — the thing a flat signal list could never express.
  for (const s of next.signals) {
    if (s.supports) { const h = next.hypotheses.find(x => x.id === s.supports); if (h && !h.supportRefs.includes(s.ref)) h.supportRefs.push(s.ref); }
    if (s.challenges) { const h = next.hypotheses.find(x => x.id === s.challenges); if (h && !h.challengeRefs.includes(s.ref)) h.challengeRefs.push(s.ref); }
  }

  // Each hypothesis earns its OWN confidence from the evidence beneath it. Challenging
  // evidence is passed through as a contradiction, so a well-attacked hypothesis falls.
  const byRef = new Map(next.signals.map(s => [s.ref, s]));
  for (const h of next.hypotheses) {
    // Confidence is built from what SUPPORTS a hypothesis; challenges then cut it. Counting a
    // challenge into the evidence base was double-counting in the wrong direction — it made a
    // well-attacked explanation look better supported than a fresh rival, purely because more
    // had been said about it. Being argued with is not evidence in your favour.
    //
    // Corrected support is not support. A hypothesis resting on a claim its own source has since
    // withdrawn must fall, or the picture is held up by something nobody asserts any more.
    const support   = h.supportRefs.map(r => byRef.get(r)).filter(s => s && isActive(s));
    const challenge = h.challengeRefs.map(r => byRef.get(r)).filter(s => s && isActive(s));
    const nChallenges = challenge.length;
    const base = support.length ? deriveConfidence(support, { now })
      : { score: 0, band: 'tentative', because: ['nothing supports this yet'] };
    const score = Math.round(base.score * Math.pow(0.45, nChallenges) * 100) / 100;
    h.confidence = {
      score,
      band: (_BANDS.find(b => score >= b.at) || _BANDS[_BANDS.length - 1]).band,
      because: nChallenges ? [...base.because, `${nChallenges} piece${nChallenges === 1 ? '' : 's'} of evidence against it`] : base.because,
    };

    /* REFUTATION IS A BALANCE, NOT A BIOGRAPHY.

       The old rule was `challenged && never supported`, which handed permanent life to any
       explanation that once had a single signal behind it: no quantity of later evidence could
       rule it out, because history recorded that something had supported it once. A system that
       cannot abandon an explanation is not reasoning, it is accumulating.

       So the question is what the evidence says NOW. Support is weighed against challenge on the
       same scale — both are just evidence — and the outcome is one of three honest positions:

         refuted   — nothing live still supports it, or the case against clearly outweighs the
                     case for. "Clearly" matters: one weak dissent must not fell a well-evidenced
                     explanation, so the challenge has to beat support by a margin.
         contested — real evidence on both sides and no clear winner. This is a finding in its
                     own right, and flattening it to open/refuted would throw away the most
                     interesting state a picture can be in.
         open      — the ordinary case. */
    const supportScore   = base.score;
    const challengeScore = challenge.length ? deriveConfidence(challenge, { now, asCounterEvidence: true }).score : 0;
    if (h.status === 'settled') {
      // A settled hypothesis stays settled unless the evidence beneath it is actually gone.
      if (!support.length) h.status = 'refuted';
    } else if (nChallenges && !support.length) {
      h.status = 'refuted';                                   // challenged, nothing live for it
    } else if (nChallenges && challengeScore > supportScore * REFUTATION_MARGIN) {
      h.status = 'refuted';                                   // the case against decisively wins
    } else if (nChallenges && challengeScore >= supportScore * CONTEST_MARGIN) {
      h.status = 'contested';                                 // genuine disagreement, unresolved
    } else {
      h.status = 'open';
    }
  }

  // The leading hypothesis is whichever the evidence currently favours — not whichever arrived
  // most recently. It can change hands, and change back, without anything being lost.
  const live = next.hypotheses.filter(h => h.status !== 'refuted');
  const lead = live.slice().sort((a, b) => b.confidence.score - a.confidence.score)[0] || null;
  next.leadingHypothesisId = lead ? lead.id : null;
  for (const h of next.hypotheses) if (h.status === 'leading') h.status = 'open';
  if (lead && lead.status === 'open') lead.status = 'leading';

  // The INQUIRY's confidence is how well we understand the phenomenon — which is the leading
  // explanation's confidence, not the volume of signals collected about it.
  // Superseded signals are history, not evidence: a claim its own source has withdrawn cannot
  // still be holding the inquiry's confidence up.
  const real = next.signals.filter(s => s.kind !== 'interpretation' && isActive(s));
  next.confidence = lead && lead.confidence.score > 0 ? lead.confidence : deriveConfidence(real, { now });
  next.status = lead && lead.status === 'contested'
    ? 'disputed'
    : _STATUS_FOR(next.confidence.band, real.filter(s => s.dissents).length);
  next.timeline = _recordTimeline(inquiry, next, now);
  next.lastUpdatedAt = now;
  return next;
}

/* ── 4. DIAGNOSTIC YIELD ─────────────────────────────────────────────────────
   What a turn was WORTH. Deliberately not just (uncertaintyBefore − uncertaintyAfter), because
   that metric is gamed by becoming confidently wrong. Reward learning something useful and
   defensible; penalise the failure modes that make a system sound smart and be useless. */
function diagnosticYield(before, after, { proposals = [], rejected = [], now = Date.now() } = {}) {
  const uBefore = 1 - (before?.confidence?.score || 0);
  const uAfter  = 1 - (after?.confidence?.score || 0);
  const uncertaintyReduction = Math.max(0, uBefore - uAfter);

  const newSignals = (after?.signals || []).filter(s => s.kind !== 'interpretation')
    .filter(s => !(before?.signals || []).some(b => b.ref === s.ref));
  const evidenceQuality = newSignals.length
    ? newSignals.reduce((a, s) => a + (s.directness === 'direct' ? 1 : 0.5) * _clamp01(typeof s.specificity === 'number' ? s.specificity : 0.5), 0) / newSignals.length
    : 0;

  const relevance    = after?.topic?.canonicalConcept ? 1 : 0.5;
  const actionability = (after?.missingSignals || []).length || (after?.hypotheses || []).length ? 1 : 0.5;

  // Novelty: repeating what we already hold is worth nothing. Signals are references now, so
  // "already held" is a ref we have seen before — which is a stricter and cheaper test than
  // comparing text, and it cannot be fooled by a reworded duplicate of the same evidence.
  const seen = new Set((before?.signals || []).map(s => s.ref));
  const fresh = newSignals.filter(s => !seen.has(s.ref));
  const novelty = newSignals.length ? fresh.length / newSignals.length : 0;

  let score = uncertaintyReduction * (0.2 + 0.8 * evidenceQuality) * relevance * actionability * (0.2 + 0.8 * novelty);

  const penalties = [];
  const unsupported = (rejected || []).filter(r => /no grounded observation|source span/.test(r.reason || '')).length;
  if (unsupported) { score *= Math.pow(0.6, unsupported); penalties.push(`${unsupported} unsupported inference`); }
  if (novelty === 0 && newSignals.length) { score *= 0.4; penalties.push('repeated what was already held'); }
  const dissentAfter = (after?.signals || []).filter(s => s.dissents).length;
  const dissentBefore = (before?.signals || []).filter(s => s.dissents).length;
  if (dissentAfter > dissentBefore) { score *= 0.7; penalties.push('introduced a contradiction'); }
  // Premature certainty: a big confidence jump off a single signal is a red flag, not a win.
  const signalCount = (after?.signals || []).filter(s => s.kind !== 'interpretation').length;
  if (signalCount <= 1 && (after?.confidence?.score || 0) > 0.5) { score *= 0.3; penalties.push('premature certainty'); }

  return { score: Math.round(_clamp01(score) * 100) / 100, uncertaintyReduction: Math.round(uncertaintyReduction * 100) / 100,
    evidenceQuality: Math.round(evidenceQuality * 100) / 100, novelty: Math.round(novelty * 100) / 100, penalties };
}

/* ── 5. QUESTION SELECTION ───────────────────────────────────────────────────
   The kernel decides WHAT needs to be learned; the model only decides HOW to ask it. Candidates
   are ranked by what answering would be worth, divided by what it costs the person to answer.
   The winner is handed to the model as a NEED ("distinguish scanning from execution"), and it
   returns the natural sentence. That division is far safer than letting the model pick. */
function rankQuestions(candidates = [], { now = Date.now() } = {}) {
  return (Array.isArray(candidates) ? candidates : [])
    .map(c => {
      const gain       = _clamp01(c.expectedInformationGain);
      const importance = _clamp01(typeof c.hypothesisImportance === 'number' ? c.hypothesisImportance : 0.5);
      const answerable = _clamp01(typeof c.answerability === 'number' ? c.answerability : 0.8);
      const impact     = _clamp01(typeof c.decisionImpact === 'number' ? c.decisionImpact : 0.5);
      const burden     = Math.max(0.1, _clamp01(typeof c.burden === 'number' ? c.burden : 0.3));
      const value = (gain * importance * answerable * impact) / burden;
      return { ...c, value: Math.round(value * 1000) / 1000 };
    })
    .sort((a, b) => b.value - a.value);
}

/* Turn an inquiry's open unknowns into ranked candidates, deriving the ranking factors from the
   inquiry's OWN state rather than asking a model to score them:

     gain       — the less we understand, the more any answer is worth
     importance — how much rests on the leading explanation being right
     impact     — a contested inquiry needs settling more than a quiet one
     burden     — carried from the unknown itself (asking for a season of film is expensive)

   This is the kernel deciding WHAT must be learned. The model only phrases it. */
function frontierFor(inquiry) {
  const inq = inquiry || {};
  const conf = (inq.confidence && inq.confidence.score) || 0;
  const hyps = inq.hypotheses || [];
  const live = hyps.filter(h => h.status !== 'refuted');
  const lead = hyps.find(h => h.id === inq.leadingHypothesisId) || null;
  const contested = live.length > 1;
  const dissents = (inq.signals || []).filter(s => s.dissents).length > 0;

  return (inq.missingSignals || []).filter(u => u && u.question).map(u => ({
    question: String(u.question),
    resolves: u.resolves,
    inquiryId: inq.inquiryId,
    topic: (inq.topic && (inq.topic.label || inq.topic.canonicalConcept)) || '',
    // An answer is worth most when we understand least.
    expectedInformationGain: typeof u.expectedInformationGain === 'number' ? u.expectedInformationGain : (1 - conf),
    // A leading explanation that is barely ahead is worth more work than a settled one.
    hypothesisImportance: lead ? (contested ? 0.9 : 0.6) : 0.5,
    // A contradiction in the record is the strongest reason to go and find out.
    decisionImpact: dissents ? 0.95 : (contested ? 0.8 : 0.5),
    answerability: typeof u.answerability === 'number' ? u.answerability : 0.85,
    burden: typeof u.burden === 'number' ? u.burden : 0.3,
  }));
}

/* The single highest-value thing to learn next, as a NEED for the model to phrase. */
function nextNeed(inquiry, candidates = []) {
  const ranked = rankQuestions(candidates);
  if (!ranked.length) return null;
  const top = ranked[0];
  return { need: top.resolves || top.question || '', why: top.why || '', candidate: top,
    distinguishes: Array.isArray(top.resolves) ? top.resolves : (top.resolves ? [top.resolves] : []) };
}

/* ── 6. THE EXTRACTION PROMPT ────────────────────────────────────────────────
   What the model is asked for at intake. Note what it is NOT asked for: a conclusion, or a
   confidence number. Both are computed here from the shape of the evidence. */
const INTAKE_PROMPT = [
  'You are the intake layer of a governed organisational assistant. You do NOT reply to the',
  'person here. You read what they said and propose SEMANTIC STRUCTURE for the system to weigh.',
  '',
  'Return ONLY JSON in EXACTLY this shape. Every proposal MUST have "id", "level" and "text" —',
  'those three field names precisely, not "claim", "statement", "content" or anything else:',
  '',
  '{',
  '  "worthInquiry": true,',
  '  "proposals": [',
  '    { "id": "o1", "level": "observation", "text": "first touch degrades under immediate pressure",',
  '      "sourceSpan": "struggling with my first touch", "domainConcept": "football.first_touch",',
  '      "source": "self", "directness": "direct", "specificity": 0.8 },',
  '    { "id": "h1", "level": "hypothesis", "text": "pressure is being seen too late",',
  '      "basis": ["o1"], "domainConcept": "football.first_touch",',
  '      "alternatives": ["the touch itself is technically loose"],',
  '      "falsifiers": ["clean touches when pressure is called early"] }',
  '  ],',
  '  "unknowns": [',
  '    { "question": "does it happen when you see the defender coming?",',
  '      "concept": "football.first_touch",',
  '      "resolves": ["scanning_vs_execution"], "burden": 0.2 }',
  '  ]',
  '}',
  '',
  'Each unknown MUST name the "concept" it would resolve, using one of the domainConcept values',
  'you used above. An unknown that belongs to everything belongs to nothing.',
  '',
  'A proposal is one of exactly three levels, and they must never be collapsed:',
  '  • "observation"    — what they actually reported. MUST carry "sourceSpan": a short quote',
  '    copied VERBATIM from their message. If you cannot quote it, it is not an observation.',
  '  • "interpretation" — what you think it means. MUST carry "basis": the ids of observations',
  '    it rests on. "Poor scanning" is an interpretation, never an observation.',
  '  • "hypothesis"     — a candidate explanation linking things. MUST carry "basis", and should',
  '    carry "alternatives" (rival explanations) and "falsifiers" (what would show it is wrong).',
  'You may NOT return a conclusion. Deciding what is settled is not your job.',
  'Do NOT return confidence numbers. Confidence is computed from the evidence, not asserted.',
  'Give every proposal a short "id" ("o1", "h1") so later proposals can reference it in "basis".',
  '',
  'Name the domain concept precisely ("football.first_touch", "manufacturing.tolerance_drift"),',
  'because a vague concept cannot be retrieved or connected to anything later.',
  '',
  'ORIGIN — WHAT IS THIS ULTIMATELY BASED ON? Every observation may carry "originKind", and',
  '"originRef" naming the specific occurrence it traces back to:',
  '  direct_observation — the speaker saw it themselves',
  '  self_report        — the speaker describing their own experience',
  '  reported           — the speaker relaying what SOMEONE ELSE observed',
  '  document           — a file, record or import',
  '  system             — derived from data already held',
  '',
  'Two accounts of the SAME underlying occurrence must share the same "originRef". If four people',
  'each repeat what the captain said after Saturday\'s match, that is ONE origin repeated four',
  'times, not four observations — give all four the captain\'s originRef and mark them "reported".',
  'If two people each noticed a thing SEPARATELY, they are different origins, so give them',
  'different refs.',
  '',
  'This decides nothing about confidence: the system computes that. What it must never do is',
  'mistake a room agreeing with itself for several people finding the same thing out. So if you',
  'cannot tell whether two accounts come from the same underlying occurrence, OMIT originRef. An',
  'omission is read as "not established" and treated cautiously. A GUESS that two reports are',
  'independent is the one error here with no floor under it — never guess in that direction.',
  '',
  'WHO IS THIS ABOUT? An observation may carry "concerns": "self", "group" or "both".',
  '  self  — about this person: how they felt, what they did, what happened to them.',
  '  group — about a team, class or department AS A COLLECTIVE: how it operates, what it is',
  '          unclear about, a shared pattern. "Our press trigger is unclear" is group.',
  '  both  — genuinely both ("I keep getting caught because we drop too early").',
  '',
  'Say "group" only when they were describing the collective, not merely when a group gets',
  'mentioned: "I get nervous before matches" is self, even though matches involve a team. This',
  'publishes nothing and shares nothing — it only lets the system offer them the choice later,',
  'and their conversation stays private either way. When unsure, say self.',
  '',
  'CORRECTIONS. If what they are saying now revises something recorded EARLIER — "actually, I',
  'watched it back and my touch was fine, the problem was my body position" — add "corrects":',
  '[the ids of the earlier observations it replaces] to the new observation, and',
  '"correctionReason" saying briefly what changed. Use "withdraws": true when they are taking a',
  'claim back without replacing it. Only use this when they are revising THEIR OWN earlier',
  'account, or when an authoritative record overrules an unverified one. Two people simply',
  'disagreeing is NOT a correction — that is a contradiction, and both accounts stay.',
  '',
  'IDENTITY — THE MOST IMPORTANT PART. If you are shown OPEN INQUIRIES, every concept you name',
  'must declare where its evidence belongs, in a "concepts" array alongside "proposals":',
  '',
  '  "concepts": [',
  '    { "concept": "football.session_attendance", "relationship": "REFINES",',
  '      "targetInquiryId": "inq_7f2a",',
  '      "reason": "narrows the open attendance question to what happens once he is there" }',
  '  ]',
  '',
  'relationship is one of:',
  '  SAME_AS     — the same question already open, differently worded. Evidence joins it.',
  '  REFINES     — a genuine sub-question OF an open one ("is it lateness or absence driving it?").',
  '  SUPPORTS    — bears on an open question without being it.',
  '  CONTRADICTS — cuts against what an open inquiry currently reads.',
  '  RELATED_TO  — connected, but its own line.',
  '  NEW         — none of the open inquiries can absorb this.',
  '',
  'targetInquiryId is REQUIRED for everything except NEW, and must be an id from the list.',
  '',
  'You may not declare NEW until you have considered every open inquiry and rejected it. If you',
  'declare NEW, "reason" must say WHY none of them can hold this evidence. "New topic" is not a',
  'reason. An unjustified NEW is treated as SAME_AS, because a second name for one question makes',
  'the system more confident while making it less coherent — both halves grow certain separately.',
  '',
  'Wording is not identity. If the open list has "training_attendance" and you would have written',
  '"session_attendance" for the same question, that is SAME_AS — say so and keep their words.',
  '',
  'ONE PHENOMENON, ONE CONCEPT. This is the rule people get wrong most often. Someone describing',
  'why they skip a session is telling you ONE story — do not file it as attendance_timing AND',
  'attendance_pattern AND training_attendance AND motivation. Those are four names for the thing',
  'they said once. Ask yourself what single ongoing phenomenon is being described and put the',
  'observations, the interpretation and the hypothesis under that one concept. Use a second',
  'concept only when they genuinely raised a SEPARATE matter that would still make sense if the',
  'first had never come up.',
  '',
  'If you are shown concepts already open for this person, REUSE the exact string when it fits.',
  'A near-synonym starts a second pile for the same thing, and two shallow piles are worth less',
  'than one that is deepening.',
  '',
  'Look for STRENGTHS and CONDITIONS FOR SUCCESS as carefully as for difficulties: what someone',
  'is unusually good at, and what circumstances bring out their best, matter just as much.',
  '',
  'WORTH AN INQUIRY? Also return "worthInquiry": true|false. TRUE only when there is an ongoing',
  '  phenomenon worth understanding, diagnosing or improving. FALSE for coordination and one-off',
  '  facts — "what time is practice", "who has the keys", "is the meeting moved" — and for pure',
  '  requests for general knowledge. Those are perfectly good conversations; they are just not',
  '  something to build a model of. Over-creating inquiries makes the picture noise.',
  '',
  'For "unknowns", list what you cannot tell from what was said — each with "question" (the thing',
  'that needs settling, in plain terms), "resolves" (what it would distinguish between), and',
  '"burden" 0-1 (how much effort answering costs them). Rank nothing; the system ranks.',
].join('\n');

/* ── IDENTITY: WHERE DOES THIS EVIDENCE BELONG? ──────────────────────────────
   The comprehension layer does not get to decide that something is new by inventing a name for
   it. For every concept it proposes, it must state a RELATIONSHIP to the inquiries already open
   for this person, and NEW is a claim it has to earn: it means "none of these can absorb this",
   and it must say why.

   The distinction being protected is real. "Does he attend training", "does he arrive on time"
   and "how does he participate across sessions" are related but not identical, and string
   normalisation would have destroyed that difference to fix a spelling problem. REFINES exists
   so a genuine sub-question can hang off its parent instead of competing with it. */
const RELATIONSHIPS = ['NEW', 'SAME_AS', 'REFINES', 'SUPPORTS', 'CONTRADICTS', 'RELATED_TO'];

/* Where a proposed concept's evidence should land, given the open frontier.

   Returns { action, targetId, reason }:
     'apply'  — evidence joins an existing inquiry (SAME_AS, SUPPORTS, CONTRADICTS)
     'refine' — a child inquiry under targetId (REFINES)
     'create' — a genuinely new line of inquiry (NEW, justified)
     'link'   — recorded as related, evidence stays where it was (RELATED_TO)

   An unusable claim degrades toward the frontier, never away from it: a relationship naming a
   target that does not exist, or a bare NEW with no reason while plausible inquiries are open,
   becomes SAME_AS the nearest open inquiry rather than a new one. The failure mode of this
   system is fragmentation, so ambiguity resolves toward coherence. */
function resolveIdentity({ concept, relationship, targetId, reason = '' } = {}, frontier = []) {
  const open = (Array.isArray(frontier) ? frontier : []).filter(f => f && f.inquiryId);
  const byId = new Map(open.map(f => [String(f.inquiryId), f]));
  const rel = RELATIONSHIPS.includes(String(relationship || '').toUpperCase())
    ? String(relationship).toUpperCase() : '';

  // An alias already in use is the same inquiry, whatever the model called the relationship.
  // This is the one place a string decides anything, and only because the string was ours.
  const byAlias = open.find(f => (f.aliases || []).some(a => _norm(a) === _norm(concept)));

  /* THE RELATIONSHIP SURVIVES THE ROUTING DECISION.

     SAME_AS, SUPPORTS and CONTRADICTS all route the same way — the evidence joins an inquiry
     that already exists — and the first cut of this returned only that routing. The three were
     therefore indistinguishable downstream, and the caller stamped every one of them SAME_AS.
     Evidence that CUT AGAINST an inquiry was filed as another way of saying the same thing,
     which is the exact opposite of what it meant. `relationship` is now returned alongside
     `action` so that what the evidence DOES to the inquiry outlives the decision of where to
     put it. */
  if (!open.length) return { action: 'create', relationship: 'NEW', targetId: null, reason: reason || 'nothing open yet' };
  if (byAlias && (!rel || rel === 'NEW')) {
    return { action: 'apply', relationship: 'SAME_AS', targetId: byAlias.inquiryId, reason: 'concept already an alias of this inquiry' };
  }

  const target = targetId ? byId.get(String(targetId)) : null;

  // A relationship that needs a target but names one we do not have is not a decision; treat it
  // as an unmade one rather than letting it open a new line by accident. The stated relationship
  // is still kept: a contradiction aimed at a target we cannot resolve is still a contradiction,
  // and downgrading it to agreement would be the very flattening this guards against.
  if (rel && rel !== 'NEW' && !target) {
    return { action: 'apply', relationship: rel, targetId: (byAlias || open[0]).inquiryId,
      reason: `relationship ${rel} named an unknown target — held with the nearest open inquiry` };
  }

  switch (rel) {
    case 'SAME_AS':
    case 'SUPPORTS':
    case 'CONTRADICTS':
      return { action: 'apply', relationship: rel, targetId: target.inquiryId, reason: reason || rel };
    case 'REFINES':
      return { action: 'refine', relationship: 'REFINES', targetId: target.inquiryId, reason: reason || 'refines an open question' };
    case 'RELATED_TO':
      return { action: 'link', relationship: 'RELATED_TO', targetId: target.inquiryId, reason: reason || 'related' };
    case 'NEW':
      // NEW is only NEW when it was argued for. Unargued, with a frontier to compare against,
      // it is the model coining a synonym — which is the behaviour this exists to stop.
      if (String(reason || '').trim().length >= 12) {
        return { action: 'create', relationship: 'NEW', targetId: null, reason };
      }
      return { action: 'apply', relationship: 'SAME_AS', targetId: (byAlias || open[0]).inquiryId,
        reason: 'claimed NEW without saying why none of the open inquiries fit' };
    default:
      return { action: 'apply', relationship: 'SAME_AS', targetId: (byAlias || open[0]).inquiryId,
        reason: 'no relationship stated — evidence held rather than given a new line' };
  }
}

/* Record that a concept name refers to an inquiry. Names are vocabulary; this is how it grows. */
function addAlias(inquiry, concept, provenance) {
  const c = String(concept || '').trim();
  if (!c) return inquiry;
  if (!Array.isArray(inquiry.aliases)) inquiry.aliases = [];
  if (!inquiry.aliases.some(a => _norm(a) === _norm(c))) inquiry.aliases.push(c);
  if (provenance) {
    if (!Array.isArray(inquiry.provenance)) inquiry.provenance = [];
    inquiry.provenance.push(provenance);
    if (inquiry.provenance.length > 20) inquiry.provenance.splice(0, inquiry.provenance.length - 20);
  }
  return inquiry;
}

/* ── CONSOLIDATION ───────────────────────────────────────────────────────────
   How many inquiries one turn is allowed to become.

   The first live turn produced five for one story: training_attendance, attendance_timing,
   attendance_pattern, motivation, training_structure. All five were the same person explaining
   the same Tuesday. Nothing was wrong with the extraction — each proposal was grounded — but
   filing one phenomenon five ways gives five shallow piles instead of one that deepens, and a
   picture that fragments faster than it accumulates is not a picture.

   The intake prompt asks the model to consolidate. This does not depend on it obliging:

     • A concept with no OBSERVATION of its own gets no inquiry. A hypothesis rests on
       observations filed under some other concept; it belongs with them, not alone in a shell
       carrying a confidence band and nothing recorded.
     • A turn may open at most `cap` concepts that are NEW to this subject. Beyond that,
       proposals fold into the primary.

   Folding moves the filing, never the content: every accepted proposal still lands somewhere,
   so consolidating costs no reasoning. The primary is the concept carrying the most
   observations — what the person actually reported on, not what the model found interesting.

   Returns { byConcept, primary, folded } and does not mutate its input. */
function consolidate(groups, { existing = {}, cap = 2 } = {}) {
  const byConcept = {};
  for (const [c, props] of Object.entries(groups || {})) byConcept[c] = (props || []).slice();
  const concepts = Object.keys(byConcept);
  if (!concepts.length) return { byConcept, primary: null, folded: [] };

  const observationsIn = c => byConcept[c].filter(p => p && p.level === 'observation').length;
  // Observations first — the anchor is what they reported, not what the model found
  // interesting. Then a concept already open for this subject, because folding into an
  // established pile deepens it while folding it into a newcomer starts the sprawl over. Then
  // total proposals, as the richer grouping. Name last, so the same input always consolidates
  // the same way and the picture never depends on key order.
  const primary = concepts.slice().sort((a, b) =>
    (observationsIn(b) - observationsIn(a))
    || ((existing[b] ? 1 : 0) - (existing[a] ? 1 : 0))
    || (byConcept[b].length - byConcept[a].length)
    || a.localeCompare(b))[0];

  let opened = 0;
  const folded = [];
  for (const c of concepts) {
    if (c === primary) continue;
    let why = '';
    if (!observationsIn(c)) why = 'no observation of its own';
    else if (!existing[c] && opened >= cap) why = 'over the new-concept cap for one turn';
    else if (!existing[c]) opened++;
    if (!why) continue;
    byConcept[primary].push(...byConcept[c]);
    delete byConcept[c];
    folded.push({ concept: c, why });
  }
  return { byConcept, primary, folded };
}

/* ── THE BOUNDED FRONTIER ────────────────────────────────────────────────────
   How many open questions a person is worth holding at once.

   Not a cap on what may be understood — a cap on what is being ACTIVELY WORKED. Attention is
   the scarce thing: twelve half-live inquiries is not more understanding than five, it is less,
   because nothing gets the evidence it needs to settle and the page stops being readable.

   The rule is expected diagnostic yield, not age and not tidiness: of everything still open
   about this person, which few would most change what we understand or do next. That question
   already has an answer in ai/inquiry.js — impact, information gain, answer reliability,
   urgency, minus the cost of asking. This does not reimplement it; the caller injects it.

   Nothing is merged and nothing is deleted. Parking is reversible and evidence-driven: new
   evidence raises an inquiry's value and it comes back. Merging on a cap would have made an
   attention budget silently rewrite what the system believes is true, which is a different
   thing entirely and not one a budget is entitled to do. */
function boundFrontier(inquiries = [], { cap = 6, valueOf = null, now = Date.now() } = {}) {
  const list = (Array.isArray(inquiries) ? inquiries : []).filter(Boolean);
  const score = typeof valueOf === 'function' ? valueOf : (() => 0);
  const scored = list.map(i => {
    let v = 0;
    try { v = Number(score(i)) || 0; } catch (_) { v = 0; }
    return { inquiry: i, value: _clamp01(v) };
  });
  // Ties break toward the better-evidenced inquiry, then the more recently moved: between two
  // equally valuable questions, hold the one we are further along with.
  scored.sort((a, b) => (b.value - a.value)
    || ((b.inquiry.signals || []).length - (a.inquiry.signals || []).length)
    || ((b.inquiry.lastUpdatedAt || 0) - (a.inquiry.lastUpdatedAt || 0)));

  const active = [], parked = [];
  for (const s of scored) (active.length < Math.max(1, cap) ? active : parked).push(s);

  for (const s of active) {
    if (s.inquiry.parkedAt) { s.inquiry.parkedAt = null; s.inquiry.parkedBecause = null; }
    s.inquiry.frontierValue = s.value;
  }
  for (const s of parked) {
    s.inquiry.frontierValue = s.value;
    if (!s.inquiry.parkedAt) {
      s.inquiry.parkedAt = now;
      s.inquiry.parkedBecause = 'other open questions would tell us more right now';
    }
  }
  return { active: active.map(s => s.inquiry), parked: parked.map(s => s.inquiry) };
}

module.exports = {
  LEVELS, LEVEL_RANK, MODEL_MAY_PROPOSE, INTAKE_PROMPT, boundFrontier,
  groundProposals, deriveConfidence, newInquiry, newHypothesis, applyProposals, frontierFor,
  diagnosticYield, rankQuestions, nextNeed, consolidate,
  RELATIONSHIPS, resolveIdentity, addAlias,
  // Origin + correction: what evidence is based on, and what happens when it turns out to be wrong.
  ORIGIN_KINDS, SIGNAL_STATUSES, UNKNOWN_ORIGIN_CAP, REFUTATION_MARGIN, CONTEST_MARGIN,
  originOf, canCorrect, supersede, isActive,
};
