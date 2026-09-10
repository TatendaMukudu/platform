/* ============================================================
   ai/priority-office.js — Priority Office (pure)

   The final stamping desk before delivery. It decides which already-safe items
   deserve attention first, and whether to ask the user before changing their lead
   view. It does NOT detect, reason, scope, summarize raw evidence, execute, or
   create a new fact.

   Inputs are artifacts from other layers: reasoner reads, proactive insights,
   outcome-intelligence briefs, unified feed items, confidence labels, and explicit
   user-behaviour preferences. Output is a ranked queue the UI can consume later.

   PURE: imports only the canonical polarity owner, no DB, no AI, no IO.
   ============================================================ */

'use strict';

const polarityOwner = require('./intelligence-feed');

const PRIORITY_RANK = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };
const CONF_RANK = { confirmed: 0, clear: 1, reliable: 1, well_supported: 1, supported: 1, emerging: 2, promising: 2, tentative: 3, calibrating: 3, low: 3, none: 4 };
const POLARITY_RANK = Object.freeze({ low: 0, neither: 1, high: 2 });

function _s(v, n = 160) { return String(v == null ? '' : v).trim().slice(0, n); }
function _key(v) { return _s(v || 'unknown', 80).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'unknown'; }
function _rank(map, value, fallback) { const k = _key(value); return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : fallback; }
function _hash(str) { let h = 5381; const s = String(str); for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i); return (h >>> 0).toString(36); }

function normalizeItem(item = {}, source = 'unknown') {
  const patternType = _key(item.patternType || item.type || item.kind || item.action);
  const polarity = _key(item.polarity || (item.outcomeLine ? 'neutral' : 'neutral'));
  const priority = _key(item.priority || item.severity || 'low');
  const confidence = _key(item.kernelConfidence || item.confidence || item.reliability || 'none');
  const fallbackKey = `${source}:${patternType}:${item.subjectId || item.scope || item.title || item.headline || _hash(JSON.stringify(item))}`;
  const id = _s(item.id || item.dedupeKey || fallbackKey, 120);
  const title = _s(item.headline || item.title || item.signal || item.opening || item.question || patternType.replace(/_/g, ' '), 160);
  const body = _s(item.body || item.outcomeLine || item.text || item.line || item.why || '', 400);
  const suggestion = item.suggestion || item.suggestedNextStep || null;
  return {
    id,
    source: item.source || source,
    kind: item.kind || null,
    patternType,
    subjectId: item.subjectId != null ? _s(item.subjectId, 80) : null,
    scope: item.scope != null ? _s(item.scope, 120) : null,
    bucket: _key(item.bucket || item.suggestedSurface || item.group || item.kind || patternType),
    polarity,
    priority,
    confidence,
    title,
    body,
    question: item.question ? _s(item.question, 360) : null,
    suggestion: suggestion ? { ...suggestion, requiresConfirmation: suggestion.requiresConfirmation === true } : null,
    limitations: Array.isArray(item.limitations) ? item.limitations.map(x => _s(x, 160)) : [],
    rationale: Array.isArray(item.rationale) ? item.rationale.map(x => _s(x, 160)) : [],
  };
}

function _score(item, prefs = {}) {
  let score = 0;
  score += (4 - _rank(PRIORITY_RANK, item.priority, 4)) * 100;
  score += (4 - _rank(CONF_RANK, item.confidence, 4)) * 20;
  const polarityBucket = polarityOwner.bucketOf(item) || 'neither';
  score += (2 - _rank(POLARITY_RANK, polarityBucket, 1)) * 8;
  if (item.limitations.includes('no_outcome_history')) score -= 10;
  if (item.limitations.includes('small_sample')) score -= 5;
  const preferred = Array.isArray(prefs.preferredBuckets) ? prefs.preferredBuckets.map(_key) : [];
  if (preferred.includes(item.bucket) || preferred.includes(item.patternType) || preferred.includes(_key(item.source))) score += 12;
  if (prefs.pinnedFirst && (_key(prefs.pinnedFirst) === item.bucket || _key(prefs.pinnedFirst) === item.patternType || _key(prefs.pinnedFirst) === _key(item.source))) score += 30;
  return score;
}

function buildQueue({ reads = [], insights = [], outcomeBriefs = [], feedItems = [], extras = [], prefs = {}, suppressed = [] } = {}) {
  const suppressedSet = new Set((suppressed || []).map(x => _s(x)));
  const all = [
    ...reads.map(x => normalizeItem(x, 'reasoner')),
    ...insights.map(x => normalizeItem(x, 'proactive')),
    ...outcomeBriefs.map(x => normalizeItem(x, 'outcome_intelligence')),
    ...feedItems.map(x => normalizeItem(x, x.source || 'intelligence_feed')),
    ...extras.map(x => normalizeItem(x, 'extra')),
  ].filter(i => i.title || i.body || i.question).filter(i => !suppressedSet.has(i.id));

  const seen = new Set();
  const queue = all.filter(i => {
    const k = `${i.source}:${i.kind || ''}:${i.patternType}:${i.subjectId || i.scope || ''}:${i.title}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).map(i => {
    const score = _score(i, prefs);
    const rationale = [...i.rationale];
    rationale.push(`priority:${i.priority}`);
    if (i.confidence && i.confidence !== 'none') rationale.push(`confidence:${i.confidence}`);
    if (i.source === 'outcome_intelligence') rationale.push('outcome_history');
    if (i.source === 'process_reflection') rationale.push('process_question');
    if (i.source === 'self_model') rationale.push('personal_accommodation');
    if (i.source === 'org_playbook') rationale.push('playbook_learning');
    if (i.limitations.length) rationale.push(...i.limitations.map(l => `limitation:${l}`));
    return { ...i, score, rationale };
  }).sort((a, b) => (b.score - a.score) || a.id.localeCompare(b.id));

  return queue;
}

function askFirstOffer(queue, usage = {}) {
  const preferred = _key(usage.opensFirst || usage.asksFirst || usage.preferredFirst);
  if (!preferred || preferred === 'unknown' || !queue.length) return null;
  const match = queue.find(i => i.bucket === preferred || i.patternType === preferred || i.source === preferred);
  if (!match || match.id === queue[0].id) return null;
  return {
    text: `You often look for ${preferred.replace(/_/g, ' ')} first. Want IntelliQ to lead with that when it is available?`,
    preferredTarget: preferred,
    targetItemId: match.id,
    requiresConfirmation: true,
  };
}

function stamp(input = {}) {
  const queue = buildQueue(input);
  const lead = queue[0] || null;
  return {
    lead,
    queue,
    askFirst: askFirstOffer(queue, input.usageSignals || {}),
    empty: queue.length === 0,
    message: queue.length ? null : 'Nothing needs prioritising right now.',
    generatedBy: 'priority-office',
    safe: queue.every(i => !i.suggestion || i.suggestion.requiresConfirmation === true),
  };
}

/* ══════════════════════════════════════════════════════════════════════════════════════════
   ATTENTION — "what deserves my attention now, and why?"

   THE SAME DESK, A SECOND WINDOW. `buildQueue` above ranks already-derived FEED ARTIFACTS. This
   ranks CANONICAL OBJECTS — an Inquiry, a Focus, a High, a Low — and the difference matters
   enough to sit in one module rather than two: a second Priority Office would be a second answer
   to "what matters", and two answers to that question is exactly the drift this codebase spends
   its time correcting.

   IT IS A READER. It takes objects and edges the CALLER HAS ALREADY AUTHORISED, and it takes no
   userId, no org and no store, so it cannot decide access even by accident. An object the caller
   did not pass in cannot appear, cannot influence an order, and cannot leak its existence through
   a gap in a ranking.

   NO SCORE. Ordering is a DECLARED SEQUENCE of reason codes, not a weighted sum. A weighted score
   is a number nobody can argue with and everybody has to trust; a declared order is a list a
   founder can read and disagree with. Ties break on when the thing actually changed, then on the
   canonical ref, so the same inputs always produce the same order.

   NO PREDICTION, NO PERSON SCORE. Every reason code below is a statement about a RECORD and about
   the PAST: something arrived, something is still open, something was recorded. None is about a
   person, and none is about what happens next. */

/* THE REASON CODES. Closed, and each one is a deterministic fact somebody can check. The order of
   this array IS the ranking law — earlier means it comes first. It is short on purpose. */
const ATTENTION_REASONS = Object.freeze([
  'explicitly_prioritised',        // a human marked it. Nothing outranks somebody saying so.
  'contradiction_added',           // a current dissenting account arrived since they last looked
  'new_independent_evidence',      // the count of CURRENT INDEPENDENT ORIGINS grew
  'unresolved_after_focus_outcome',// the work was closed out; the question it addressed is still open
  'outcome_missing',               // a focus has been running and nothing was ever recorded
  'related_state_changed',         // something it is connected to moved
]);

const _reasonRank = r => { const i = ATTENTION_REASONS.indexOf(r); return i < 0 ? ATTENTION_REASONS.length : i; };
const _ms = v => (Number.isFinite(Number(v)) ? Number(v) : Date.parse(String(v || '')) || 0);

/* A focus that has been open this long with no outcome is worth a nudge. Declared, not tuned:
   two weeks is the founder's review rhythm, and a number in a constant with a name is a number
   somebody can change on purpose. */
const OUTCOME_OVERDUE_MS = 14 * 24 * 60 * 60 * 1000;

/* WHAT COUNTS AS INDEPENDENT, borrowed rather than re-implemented. The caller passes
   `currentOriginCount` — ai/diagnose.js's own function — so this desk cannot accidentally invent
   a second definition of independence in which one person saying a thing twice is two accounts. */
function attentionQueue({ objects = [], edges = [], seen = {}, marked = [], now = Date.now(),
  currentOriginCount = null, max = 10 } = {}) {
  const rows = (Array.isArray(objects) ? objects : []).filter(o => o && o.kind && o.id);
  const refOf = o => `${o.kind}:${o.id}`;
  const byRef = new Map(rows.map(o => [refOf(o), o]));
  const markedSet = new Set((Array.isArray(marked) ? marked : []).map(String));
  const originsOf = typeof currentOriginCount === 'function' ? currentOriginCount : () => 0;
  const out = [];

  const add = (o, reason, changedAt, detail) => {
    if (!ATTENTION_REASONS.includes(reason)) return;      // closed vocabulary, enforced at the writer
    out.push({ ref: refOf(o), kind: o.kind, reason, changedAt: _ms(changedAt) || 0,
      /* `detail` is COUNTS AND REFS ONLY. A statement here would put evidence text into a ranking,
         which is the one thing a ranking must never carry. */
      detail: detail || {} });
  };

  for (const o of rows) {
    const raw = o.raw || {};
    const last = _ms(seen[refOf(o)]);
    const signals = Array.isArray(raw.signals) ? raw.signals : [];
    const current = signals.filter(s => s && s.status === 'active');

    /* WHOSE MARK IT IS, carried in the detail so it cannot be read as anybody else's. The queue is
       built from ONE person's marks (the caller passes their own `marked` list and nobody else's),
       so `byYou` is a fact about this row rather than an attribution the desk had to work out. It
       matters because the failure mode here is not a leak, it is a misreading: a thing at the top
       with no owner named reads as the organisation having decided it is important, and that is a
       claim nobody made. */
    if (markedSet.has(refOf(o))) add(o, 'explicitly_prioritised', raw.markedAt || now, { byYou: true });

    /* A dissent that ARRIVED SINCE THEY LOOKED. Not "there is a dissent" — a standing disagreement
       they have already read is not news, and re-raising it every time would train them to ignore
       the surface entirely. */
    const newDissent = current.filter(s => s.dissents && _ms(s.at) > last);
    if (last && newDissent.length) {
      add(o, 'contradiction_added', Math.max(...newDissent.map(s => _ms(s.at))),
        { records: newDissent.length, refs: newDissent.map(s => String(s.ref || '')).filter(Boolean).sort() });
    }

    /* INDEPENDENT ORIGINS, THEN AND NOW. Counted through the kernel's own function on both sides,
       so five messages from one person move nothing and a correction cannot add a voice. */
    if (last && (o.kind === 'inquiry') && String(raw.status || 'open') !== 'settled') {
      /* THE "BEFORE" COUNT MUST USE THE STATUS AS IT WAS THEN, and getting this wrong is subtle
         enough to be worth naming. Filtering by date and then counting with TODAY'S status
         retroactively erases history: a record that was live when they last looked, and has since
         been corrected, reads as though it was never there — so the count appears to have GROWN
         and a plain correction surfaces as new independent evidence. A correction is not news.

         A signal that was superseded by something that arrived AFTER they looked was still
         standing when they looked, so it is restored to active for the historical count only. */
      const atOf = new Map(signals.map(s => [String(s && s.ref), _ms(s && s.at)]));
      const asItWas = signals.filter(s => _ms(s.at) <= last).map(s => {
        const killedAt = s && s.supersededBy ? (atOf.get(String(s.supersededBy)) || 0) : 0;
        return (killedAt && killedAt > last) ? { ...s, status: 'active' } : s;
      });
      const before = originsOf(asItWas);
      const after = originsOf(signals);
      if (after > before) {
        const newest = current.filter(s => _ms(s.at) > last).map(s => _ms(s.at));
        add(o, 'new_independent_evidence', newest.length ? Math.max(...newest) : now,
          { originsBefore: before, originsNow: after });
      }
    }

    if (o.kind === 'focus') {
      const created = _ms(raw.createdAt);
      const hasOutcome = !!raw.outcome;
      if (!hasOutcome && created && (now - created) > OUTCOME_OVERDUE_MS && String(raw.status || 'active') === 'active') {
        add(o, 'outcome_missing', created, { openForDays: Math.floor((now - created) / 86400000) });
      }
      /* THE LOOP LEFT HALF-SHUT. The work was closed out and the question it was started to work
         on is still open — which is the most useful thing this desk can notice, and it is a plain
         reading of two fields rather than an opinion about whether the work succeeded. */
      const addr = raw.addresses && raw.addresses.kind && raw.addresses.id
        ? `${raw.addresses.kind}:${raw.addresses.id}` : null;
      const target = addr ? byRef.get(addr) : null;
      if (hasOutcome && target && String((target.raw || {}).status || 'open') !== 'settled') {
        add(target, 'unresolved_after_focus_outcome', raw.resolvedAt || now, { focus: refOf(o), outcome: String(raw.outcome) });
      }
    }
  }

  /* CONNECTED THINGS THAT MOVED. Only across edges the caller supplied, so this cannot reach an
     object that was never authorised — and only when the far side genuinely changed since they
     looked, so a static connection never becomes a standing reason to be interrupted. */
  for (const e of (Array.isArray(edges) ? edges : [])) {
    const from = byRef.get(e && e.from), to = byRef.get(e && e.to);
    if (!from || !to) continue;
    const last = _ms(seen[e.from]);
    const movedAt = _ms((to.raw || {}).lastUpdatedAt || (to.raw || {}).resolvedAt);
    if (last && movedAt > last) add(from, 'related_state_changed', movedAt, { related: e.to, via: e.type });
  }

  /* ONE ROW PER OBJECT, keeping its strongest reason, and every reason it had — a person asking
     "why is this here" deserves all of it, and a person scanning deserves one line. */
  /* ONE ROW PER OBJECT, WITH EVERY REASON IT HAD AND EACH REASON'S OWN DETAIL. An earlier version
     kept only the winning reason's detail and reduced the rest to bare words, which silently threw
     away the answer to "which focus, and what did they record" whenever an object had two reasons
     — the row still looked complete, which is the worst way to lose something. */
  const best = new Map();
  for (const row of out) {
    const entry = { reason: row.reason, changedAt: row.changedAt, detail: row.detail };
    const prior = best.get(row.ref);
    if (!prior) { best.set(row.ref, { ...row, reasons: [entry] }); continue; }
    prior.reasons.push(entry);
    if (_reasonRank(row.reason) < _reasonRank(prior.reason)) {
      prior.reason = row.reason; prior.changedAt = row.changedAt; prior.detail = row.detail;
    }
  }
  for (const r of best.values()) {
    r.reasons.sort((a, b) => _reasonRank(a.reason) - _reasonRank(b.reason) || b.changedAt - a.changedAt);
    r.alsoBecause = r.reasons.filter(x => x.reason !== r.reason).map(x => x.reason);
  }

  return [...best.values()]
    .sort((a, b) => _reasonRank(a.reason) - _reasonRank(b.reason)
      || b.changedAt - a.changedAt
      || a.ref.localeCompare(b.ref))
    .slice(0, Math.max(0, max));
}

/* ── SAYING THE REASON OUT LOUD ───────────────────────────────────────────────────────────────
   A reason code is a fact the desk computed; `new_independent_evidence` is not a sentence anybody
   should ever be shown. This turns each code into the plainest true statement of that fact, and it
   lives HERE, beside the codes it phrases, so that adding a seventh code without a way to say it
   is visible in one file rather than discovered on a screen.

   THIS IS A LABEL, NOT INTELLIQ TALKING. It states what the desk found and stops. It is rendered
   in the card's own reason slot, never as an assistant message, because deterministic prose
   wearing the assistant's voice is how a product changes character without saying so. The actual
   explanation -- "why this one, and what does it rest on?" -- is a composed turn, which is where
   prose belongs and where the degraded notice already tells you when the model was unavailable.

   WHAT IT MAY NOT SAY. No score, no rank, no percentage, no prediction, and no claim that one
   thing caused another. Counts of separate accounts are facts about the record and are stated as
   such -- the same thing the provenance line has always said -- never as a strength rating. */
function attentionSentence(row = {}) {
  const d = (row && row.detail) || {};
  const n = v => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);
  switch (row && row.reason) {
    case 'explicitly_prioritised':
      return 'You marked this as important.';
    case 'contradiction_added': {
      const c = n(d.records);
      return c > 1
        ? `${c} accounts that disagree have come in since you last looked.`
        : 'An account that disagrees has come in since you last looked.';
    }
    case 'new_independent_evidence': {
      const before = n(d.originsBefore), now = n(d.originsNow);
      // Never render a count the desk did not actually supply — an empty number in front of a
      // person is worse than the plain sentence underneath it.
      if (!now || now <= before) return 'Separate accounts have come in since you last looked.';
      return `${now} separate accounts have said something about this now, where there ${
        before === 1 ? 'was 1' : `were ${before}`} last time you looked.`;
    }
    case 'unresolved_after_focus_outcome':
      return 'You recorded an outcome for the work on this, and the question itself is still open.';
    case 'outcome_missing': {
      const days = n(d.openForDays);
      return days
        ? `This has been open ${days} days and no outcome has been recorded.`
        : 'This has been open a while and no outcome has been recorded.';
    }
    case 'related_state_changed':
      return 'Something this is connected to has changed since you last looked.';
    default:
      return null;
  }
}

module.exports = {
  normalizeItem, buildQueue, askFirstOffer, stamp,
  PRIORITY_RANK, CONF_RANK, POLARITY_RANK,
  ATTENTION_REASONS, OUTCOME_OVERDUE_MS, attentionQueue, attentionSentence,
  _score, _key,
};
