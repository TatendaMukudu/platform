/* ============================================================
   ai/reason.js — the Reasoner (the belief ledger)

   The nervous system over the organs. The detector (ai/intelligence) says, in a
   single snapshot, "right now this person shows momentum_drop." This module is the
   layer ABOVE that: it takes those snapshot findings as OBSERVATIONS accumulating
   over time and across people, forms HYPOTHESES it holds provisionally, tracks what
   argues AGAINST each, lets stale ones fade, notices when the same thing recurs
   across a group, and decides which beliefs are ripe to raise — and in what
   register (an arm over the shoulder, or a focused scout).

   It is the "only reader who keeps trying to piece the whole picture together" —
   and, crucially, one that constantly challenges its own truth.

   INVARIANTS (the tests attack these):
     • Pure. Imports nothing. No DB, no AI, no IO. Deterministic: identical inputs →
       identical ledger. The caller (server) derives observations from the detector
       and persists the returned ledger; this module only reasons.
     • Privacy by construction. Receives only privacy-safe observations (kind,
       severity, evidence-volume confidence word, a privacy-safe `basis` string,
       counts, a timestamp, an optional careFlag). It never receives raw note /
       check-in / reflection TEXT and structurally cannot quote one. Every CLAIM it
       writes is a fixed template — never a quotation, never a number.
     • Believes provisionally. Every belief carries what would CONFIRM it AND what
       would REFUTE it. Confidence is evidence-volume (tentative/emerging/clear),
       never a statistical claim, and is net of counter-evidence. Nothing is ever
       certain — counter-evidence can CONTEST a belief; silence lets it go DORMANT.
     • Autonomy of thought, restraint in action. The reasoner decides what to
       believe, how urgent it is, and whether it is ripe to raise. It NEVER decides
       to do anything to a person: every proposal is proposal-gated
       (requiresConfirmation: true) and a human is always the one who acts.

   NON-CAUSAL. Like every layer here, it describes what recurred and what co-occurred.
   It never says "because". The human supplies the meaning.
   ============================================================ */

const DAY   = 86400000;
const STALE = 21 * DAY;   // no fresh signal for three weeks → the belief goes dormant
const DISMISS_COOLDOWN = 14 * DAY;  // "not now" → don't raise this belief again for two weeks
const WRONG_COOLDOWN   = 60 * DAY;  // "that's wrong" → stand it down for much longer
const HORIZON = 21 * DAY;           // how far ahead a real event pulls a belief's urgency forward

// The human responses a belief can receive. acted/useful = the noticing earned its keep;
// dismissed = "not now" (a nudge to stop nagging); wrong = "you misread this" (strong).
const RESPONSES = new Set(['acted', 'useful', 'dismissed', 'wrong']);

const SEV_RANK  = { high: 3, medium: 2, low: 1 };
const CONF_RANK = { clear: 2, emerging: 1, tentative: 0 };

/* ── The axes of concern ─────────────────────────────────────────────────────
   Each observation kind sits on an AXIS and has a POLARITY. Two kinds on the same
   axis with opposite polarity are evidence for and against each other: a `recovering`
   observation is counter-evidence to a `momentum_drop` belief, because they are the
   same axis (momentum) pulling opposite ways. This is how the reasoner argues with
   itself instead of only accumulating alarm. */
const AXIS = {
  momentum_drop:          { axis: 'momentum',   polarity: 'risk' },
  recovering:             { axis: 'momentum',   polarity: 'progress' },
  quiet_improvement:      { axis: 'momentum',   polarity: 'progress' },
  repeated_concern:       { axis: 'concern',    polarity: 'risk' },
  baseline_shift:         { axis: 'baseline',   polarity: 'risk' },
  member_team_divergence: { axis: 'alignment',  polarity: 'risk' },
  invisible_load:         { axis: 'load',       polarity: 'risk' },
  overload:               { axis: 'load',       polarity: 'risk' },
  withdrawal:             { axis: 'engagement', polarity: 'risk' },
  data_gap:               { axis: 'engagement', polarity: 'risk' },
  isolation:              { axis: 'connection', polarity: 'risk' },
  plateau:                { axis: 'growth',     polarity: 'risk' },
};

/* Axes that are about a PERSON'S WELLBEING rather than task performance. A ripe risk
   on one of these is raised support-first ("an arm over the shoulder before a scout");
   a risk on a performance axis (growth, alignment) can be raised as a focused scout.
   This is the reasoner's sense of "a time and a place". */
const WELLBEING_AXES = new Set(['momentum', 'engagement', 'load', 'connection', 'baseline', 'concern']);

const KIND_LABEL = {
  momentum_drop: 'momentum dip', recovering: 'recovery', quiet_improvement: 'quiet improvement',
  repeated_concern: 'recurring concern', baseline_shift: 'shift from the usual',
  member_team_divergence: 'divergence from the group', invisible_load: 'invisible load',
  overload: 'overload risk', withdrawal: 'pulling back', data_gap: 'going quiet',
  isolation: 'thinning connection', plateau: 'plateau',
};

/* Honest, descriptive CLAIM templates — never causal, never a number, never a quote.
   `who` is the subject's name if the caller supplied one, else a neutral pronoun. */
const CLAIM = {
  momentum_drop:          who => `${who}'s momentum has been running below their own normal.`,
  repeated_concern:       who => `The same concern keeps recurring for ${who} — not a one-off.`,
  baseline_shift:         who => `${who} is running differently from their own usual.`,
  member_team_divergence: who => `${who} is trending differently from their group.`,
  invisible_load:         who => `${who} may be carrying a lot for others.`,
  overload:               who => `${who} may be overloaded — demand up while wellbeing is down.`,
  withdrawal:             who => `${who} has been pulling back from their own normal.`,
  data_gap:               who => `${who} was checking in regularly, then went quiet.`,
  isolation:              who => `${who}'s connection signals have been thinning.`,
  plateau:                who => `${who}'s growth has flattened despite steady effort.`,
  recovering:             who => `${who} has been climbing back toward their normal.`,
  quiet_improvement:      who => `${who} has been quietly improving.`,
};

/* SELF-audience claims — the SAME belief, phrased for the person it's about. Warm,
   non-alarmist, second person. A person seeing their own read is a fairness + transparency
   right (their own evidence), and the doorway to contesting it. */
const CLAIM_SELF = {
  momentum_drop:          () => 'Your recent check-ins have been running a little below your own normal.',
  repeated_concern:       () => 'The same concern has come up a few times for you lately.',
  baseline_shift:         () => 'A few things are running differently from your own usual lately.',
  member_team_divergence: () => "You've been trending a bit differently from your group lately.",
  invisible_load:         () => 'You may be carrying a lot for others right now.',
  overload:               () => 'Things may be piling up — demand has looked high lately.',
  withdrawal:             () => "You've eased off a little from your own normal.",
  data_gap:              () => "It's been quiet lately — no pressure at all.",
  isolation:              () => 'Your connections have felt a little thinner lately.',
  plateau:                () => 'Your growth has felt a bit flat lately, despite steady effort.',
  recovering:             () => "You've been climbing back toward your normal — good to see.",
  quiet_improvement:      () => "You've been quietly improving lately.",
};

const _cap = s => (s && s.length) ? s[0].toUpperCase() + s.slice(1) : s;
const _who = name => name || 'this person';

/* What it would take to confirm / refute a belief — the provisional half of every
   belief, so it can never harden into unchallenged certainty. */
function _confirm(polarity) {
  return polarity === 'progress'
    ? 'the improvement holding over the coming weeks'
    : 'the same signal recurring over the coming weeks';
}
function _refute(polarity, who) {
  return polarity === 'progress'
    ? 'a fall back toward the earlier dip'
    : `the signal easing back toward ${who}'s normal, or them telling us the read is off`;
}

/* Add an evidence record to a belief's support/counter list, deduped by observation
   id, so the same observation never counts twice across ticks. Records are LIGHT and
   privacy-safe (id, timestamp, severity, the basis string) so the ledger is fully
   self-contained between ticks — no need to re-feed the original stream. */
function _upsert(list, rec) {
  if (!list.some(r => r.id === rec.id)) list.push(rec);
}

/* Evidence-volume confidence, NET of counter-evidence. Never a statistical claim;
   never above 'clear'. */
function _confWord(net) { return net >= 6 ? 'clear' : net >= 3 ? 'emerging' : 'tentative'; }

/* ── The fold ─────────────────────────────────────────────────────────────────
   reason({ priorBeliefs, observations, now, scopeLabel }) → { beliefs, agenda,
   proposals, retired }. A pure fold: it merges this tick's observations into the
   prior ledger, re-weighs every belief against its counter-evidence and its age,
   forms cross-subject "shared" hypotheses, and ranks what is ripe to raise. */
/* The nearest real, upcoming event that bears on a belief — its scope (a match for that
   team) or org-wide (a season deadline), within the horizon. Events are FACTS with dates;
   no prediction. This is what turns "a time and a place" from an axis guess into the org's
   actual calendar: a wellbeing risk two days before a match is more pressing, and there's a
   natural moment to act before then. */
function _eventHorizon(scope, events, now) {
  let best = null;
  for (const e of (events || [])) {
    if (!e || !Number.isFinite(e.at)) continue;
    const dt = e.at - now;
    if (dt <= 0 || dt > HORIZON) continue;                       // past, or too far to matter yet
    if (e.scope != null && scope != null && e.scope !== scope) continue; // a different branch's event
    if (!best || e.at < best.at) best = e;
  }
  if (!best) return null;
  return { label: best.label || 'an upcoming event', at: best.at, days: Math.max(0, Math.round((best.at - now) / DAY)) };
}

function reason({ priorBeliefs = [], observations = [], now = Date.now(), scopeLabel = {}, context = {} } = {}) {
  const events = context.events || [];
  // 1 · Seed the ledger from prior per-subject beliefs. Shared (cross-subject)
  //     beliefs are DERIVED fresh every tick, so we drop any carried in.
  const ledger = new Map();
  for (const b of priorBeliefs) {
    if (b && b.id && !b.shared) {
      ledger.set(b.id, {
        ...b,
        support: (b.support || []).map(r => ({ ...r })),
        counter: (b.counter || []).map(r => ({ ...r })),
      });
    }
  }

  // 2 · Fold in this tick's observations. Each observation supports its own
  //     (subject, kind) belief; a PROGRESS observation additionally registers as
  //     COUNTER-evidence on any RISK belief sharing its subject + axis.
  const obs = [...observations].filter(o => o && o.id && o.kind && AXIS[o.kind])
    .sort((a, b) => (a.t || 0) - (b.t || 0) || String(a.id).localeCompare(String(b.id)));

  const beliefKey = (subjectId, kind) => `${subjectId || 'org'}::${kind}`;

  for (const o of obs) {
    const meta = AXIS[o.kind];
    const id = beliefKey(o.subjectId, o.kind);
    let b = ledger.get(id);
    if (!b) {
      b = {
        id, subjectId: o.subjectId || null, subjectName: o.subjectName || null,
        scope: o.scope || null, kind: o.kind, axis: meta.axis, polarity: meta.polarity,
        claim: _cap(CLAIM[o.kind] ? CLAIM[o.kind](_who(o.subjectName)) : `${_cap(_who(o.subjectName))} — ${KIND_LABEL[o.kind] || o.kind}.`),
        support: [], counter: [], careFlag: false,
        firstSeen: o.t || now, lastSeen: o.t || now,
        whatWouldConfirm: _confirm(meta.polarity),
        whatWouldRefute:  _refute(meta.polarity, _who(o.subjectName)),
      };
      ledger.set(id, b);
    }
    _upsert(b.support, { id: o.id, t: o.t || now, severity: o.severity || 'low', basis: o.basis || '' });
    if (o.subjectName && !b.subjectName) b.subjectName = o.subjectName;
    if (o.scope && !b.scope) b.scope = o.scope;
    b.careFlag = b.careFlag || !!o.careFlag;
    b.firstSeen = Math.min(b.firstSeen, o.t || now);
    b.lastSeen  = Math.max(b.lastSeen,  o.t || now);

    // Opposition: a progress observation argues against risk beliefs on the same axis.
    if (meta.polarity === 'progress') {
      for (const rb of ledger.values()) {
        if (rb.polarity === 'risk' && rb.axis === meta.axis && rb.subjectId === (o.subjectId || null)) {
          _upsert(rb.counter, { id: o.id, t: o.t || now, basis: o.basis || '' });
        }
      }
    }
  }

  // 3 · Re-weigh every belief: net evidence → confidence; counter-vs-support and age
  //     → status. This is where the reasoner challenges itself each tick.
  for (const b of ledger.values()) {
    const support = b.support.length, counter = b.counter.length;
    const net = Math.max(0, support - counter);
    b.supportCount = support;
    b.counterCount = counter;
    b.confidence = _confWord(net);
    b.severity = b.support.reduce((s, r) => (SEV_RANK[r.severity] > SEV_RANK[s] ? r.severity : s), 'low');
    const dormant   = (now - b.lastSeen) > STALE;
    // A person's unresolved contest is epistemic counter-evidence, not an anti-nag timer.
    // More supporting observations and the passage of time cannot silently settle it.
    const subjectContest = b.contest && b.contest.status === 'unresolved';
    const contested = subjectContest || (counter > 0 && counter >= support);
    b.status = contested ? 'contested' : dormant ? 'dormant' : 'open';
    b.staleDays = Math.floor((now - b.lastSeen) / DAY);
  }

  // 3.5 · OUTCOME — did the belief go anywhere? This is the reasoner grading its own
  //       reads, so it can calibrate which kinds of noticing are worth surfacing. A risk
  //       that gave way to an OPEN progress belief on the same axis RESOLVED (a real
  //       concern that turned around — the noticing earned its keep). A thin risk that
  //       simply went quiet FADED (a likely over-read). Between them: still active, or
  //       matured-then-lapsed (ambiguous — not counted either way).
  const progressOpen = new Set();
  for (const b of ledger.values()) if (b.polarity === 'progress' && b.status === 'open') progressOpen.add(`${b.subjectId}::${b.axis}`);
  for (const b of ledger.values()) {
    if (b.polarity === 'progress') { b.outcome = 'progress'; continue; }
    const resolved = progressOpen.has(`${b.subjectId}::${b.axis}`);
    b.outcome =
      b.status === 'open'      ? 'active'
      : b.status === 'contested' ? (resolved ? 'resolved' : 'contested')
      : /* dormant */            (b.supportCount >= 3 ? 'lapsed' : 'faded');
  }

  // 4 · Cross-subject hypotheses — the pattern no single person's view shows. When
  //     ≥2 distinct subjects in the same scope hold an OPEN risk belief of the same
  //     kind, surface it as one thing to look at as a GROUP. Descriptive, not causal.
  const shared = [];
  const groups = new Map();
  for (const b of ledger.values()) {
    if (b.status !== 'open' || b.polarity !== 'risk' || !b.subjectId) continue;
    const k = `${b.scope || 'org'}::${b.kind}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(b);
  }
  for (const [k, members] of groups) {
    const distinct = [...new Set(members.map(m => m.subjectId))];
    if (distinct.length < 2) continue;
    const kind = members[0].kind, scope = members[0].scope || null;
    const label = scopeLabel[scope] || (scope ? 'this group' : 'the organisation');
    const sev = members.reduce((s, m) => (SEV_RANK[m.severity] > SEV_RANK[s] ? m.severity : s), 'low');
    shared.push({
      id: 'shared::' + k, shared: true, kind, axis: members[0].axis, polarity: 'risk',
      scope, subjectId: null, distinctSubjects: distinct.length, memberBeliefIds: members.map(m => m.id).sort(),
      subjects: distinct.slice().sort(), scopeText: label,   // the cohort + where, for same-cohort collapse
      claim: `${_cap(KIND_LABEL[kind] || kind)} is showing up across ${distinct.length} people in ${label} — worth looking at as a group, not only one at a time.`,
      supportCount: distinct.length, counterCount: 0,
      confidence: _confWord(distinct.length >= 3 ? distinct.length + 2 : distinct.length),
      severity: sev, status: 'open', careFlag: members.some(m => m.careFlag),
      firstSeen: Math.min(...members.map(m => m.firstSeen)), lastSeen: Math.max(...members.map(m => m.lastSeen)),
      staleDays: 0,
      whatWouldConfirm: 'the same signal in more of the group, or it persisting',
      whatWouldRefute:  'it turning out to be one or two individuals, not a shared pattern',
    });
  }

  const beliefs = [...ledger.values(), ...shared].sort((a, b) => a.id.localeCompare(b.id));

  // 4.5 · Ground each belief in the real calendar — the nearest event that bears on it.
  for (const b of beliefs) b.horizon = _eventHorizon(b.scope || null, events, now);

  // 5 · The agenda — rank by urgency, decide register + readiness. Never an action.
  //     A dismissed belief is held silently through its cooldown (anti-nagging): the
  //     reasoner still BELIEVES it, but it will not keep putting it in front of a human.
  const agenda = beliefs
    .filter(b => b.status !== 'dormant' && !isSuppressed(b, now))
    .map(b => agendaItem(b, now))
    .sort((a, b) => b.urgency - a.urgency || SEV_RANK[b.severity] - SEV_RANK[a.severity] || a.beliefId.localeCompare(b.beliefId));

  // 6 · Proposals — only from ripe items, always proposal-gated. Surface, never act.
  const proposals = agenda.filter(a => a.readiness === 'ripe').map(proposalFrom);

  const retired = beliefs.filter(b => b.status === 'dormant').map(b => b.id);
  return { beliefs, agenda, proposals, retired };
}

/* Register — the KIND of moment this belief calls for. Encodes "a time and a place":
     support     — a person-first check-in (risk on a wellbeing axis, or flagged /
                   high-severity). Lead with care, not a task.
     acknowledge — a progress belief worth naming out loud.
     scout       — a risk on a performance axis (growth / alignment): a focused
                   review is the right register, not an emotional check-in. */
function _register(b) {
  if (b.polarity === 'progress') return 'acknowledge';
  // Private context may shape the subject's own support, but it cannot steer an
  // organisational recommendation. Register is derived only from the admissible
  // claim axis and severity, so two leader-visible worlds that differ solely by
  // private evidence remain semantically identical.
  const wellbeing = WELLBEING_AXES.has(b.axis) || b.severity === 'high';
  return wellbeing ? 'support' : 'scout';
}

/* Readiness — when to ASK and when to HOLD. Thin evidence or a contested belief is
   held (raise it and you cry wolf); an open belief with real weight behind it is ripe. */
function _readiness(b) {
  if (b.status !== 'open') return 'hold';        // contested → challenge before raising
  if (b.confidence === 'tentative') return 'hold'; // too thin to put in front of a human
  return 'ripe';
}

/* Urgency — how much this matters right now. Independent of good/bad: severity +
   confidence + breadth (a shared pattern outweighs one person) + freshness. Higher
   surfaces first. */
function _urgency(b, now) {
  let u = SEV_RANK[b.severity] * 3 + CONF_RANK[b.confidence] * 2;
  if (b.shared) u += Math.min(b.distinctSubjects, 5);
  if ((now - b.lastSeen) < 7 * DAY) u += 1;      // a fresh signal is more pressing
  if (b.polarity === 'progress') u -= 1;          // wins matter, but rarely most-urgent
  // A real event pulls urgency forward — the closer it is, the more pressing acting first.
  if (b.horizon) u += b.horizon.days <= 2 ? 4 : b.horizon.days <= 7 ? 2 : 1;
  return u;
}

/* The timing note — the natural moment a real event creates. Deterministic; only present
   when there's an event on the horizon. */
function _timing(b, register) {
  if (!b.horizon) return null;
  const when = b.horizon.days === 0 ? 'today' : b.horizon.days === 1 ? 'tomorrow' : `in ${b.horizon.days} days`;
  const verb = register === 'support' ? 'have that word' : register === 'scout' ? 'do this' : 'mark it';
  return `${b.horizon.label} is ${when} — a natural moment to ${verb} before then.`;
}

function agendaItem(b, now) {
  const register = _register(b);
  const readiness = _readiness(b);
  const s = b.supportCount === 1 ? '' : 's';
  return {
    beliefId: b.id, shared: !!b.shared, kind: b.kind, subjectId: b.subjectId || null,
    subjectName: b.subjectName || null, scope: b.scope || null,
    distinctSubjects: b.shared ? (b.distinctSubjects || 0) : undefined,
    subjects: b.shared ? (b.subjects || []) : undefined,       // the cohort, for same-cohort collapse
    scopeText: b.shared ? (b.scopeText || null) : undefined,
    memberBeliefIds: b.shared ? (b.memberBeliefIds || []) : undefined,
    claim: b.claim, severity: b.severity, confidence: b.confidence, polarity: b.polarity,
    status: b.status, contested: b.status === 'contested',
    urgency: _urgency(b, now), register, readiness,
    timing: _timing(b, register),
    why: `${b.claim} (${b.confidence}; ${b.supportCount} signal${s}${b.counterCount ? `, ${b.counterCount} against` : ''}).`,
    challenge: challenge(b, now),
  };
}

/* Roll up several SHARED beliefs of the SAME kind — the same pattern showing across
   multiple groups one leader oversees — into ONE org-wide read, so the feed says it once
   instead of four near-identical cards. Purely presentational + reader-dependent, so it
   runs AFTER scoping (the caller passes the scoped agenda). Per-person items and a lone
   shared item are untouched. The rolled item keeps its constituents' ids so a decision can
   fan out to all of them. */
function rollUpShared(agenda) {
  const shared = (agenda || []).filter(a => a && a.shared);
  const rest   = (agenda || []).filter(a => a && !a.shared);
  const byKind = {};
  for (const a of shared) (byKind[a.kind] = byKind[a.kind] || []).push(a);
  const rolled = [];
  for (const [kind, items] of Object.entries(byKind)) {
    if (items.length < 2) { rolled.push(items[0]); continue; }        // one group → leave as-is
    const top = items.slice().sort((a, b) => (b.urgency || 0) - (a.urgency || 0))[0];
    const groups = items.length;
    const people = items.reduce((s, i) => s + (i.distinctSubjects || 0), 0);
    const label = KIND_LABEL[kind] || kind;
    rolled.push({
      ...top,
      beliefId: `rollup:${kind}`, rolled: true, groups, people,
      memberBeliefIds: items.map(i => i.beliefId),
      subjects: [...new Set(items.flatMap(i => i.subjects || []))].sort(),   // union cohort, for same-cohort collapse
      claim: `${_cap(label)} is showing up across ${groups} of your groups${people ? ` (${people} people)` : ''} — worth an org-wide look, not group by group.`,
      why: `${_cap(label)} recurring across ${groups} groups.`,
    });
  }
  // Same-COHORT collapse — if two patterns of DIFFERENT kinds cover the exact same people,
  // say it ONCE (otherwise the same N people surface twice: "pulling back" AND "shift from the
  // usual" across the same 6). Distinct signals over DIFFERENT groups stay separate.
  const out = [...rest, ..._collapseByCohort(rolled)];
  return out.sort((a, b) => (b.urgency || 0) - (a.urgency || 0) || String(a.beliefId).localeCompare(String(b.beliefId)));
}

/* Merge shared/rolled items whose cohort (the set of underlying people) is identical. Only
   merges when there are ≥2 real subjects in common and ≥2 items share them — so a genuinely
   different group is never folded in. Presentational only; the merged card keeps every
   constituent's ids so a decision still fans out to all of them. */
function _collapseByCohort(items) {
  if ((items || []).length < 2) return items || [];
  const byCohort = new Map();
  for (const it of items) {
    const subs = (it.subjects || []).slice().sort();
    const sig = subs.length >= 2 ? subs.join(',') : ('_solo:' + (it.beliefId || it.id));  // no cohort → never merge
    if (!byCohort.has(sig)) byCohort.set(sig, []);
    byCohort.get(sig).push(it);
  }
  const out = [];
  for (const grp of byCohort.values()) out.push(grp.length < 2 ? grp[0] : _mergeCohort(grp));
  return out;
}

function _mergeCohort(grp) {
  grp = grp.slice().sort((a, b) => (b.urgency || 0) - (a.urgency || 0));
  const top = grp[0];
  const labels = grp.map(g => (KIND_LABEL[g.kind] || g.kind).toLowerCase());
  const n = top.distinctSubjects || (top.subjects || []).length;
  const where = top.rolled
    ? `the same ${top.people || n} people across ${top.groups} of your groups`
    : `the same ${n} people${top.scopeText ? ' in ' + top.scopeText : ''}`;
  return {
    ...top,
    beliefId: 'cohort:' + grp.map(g => g.kind).sort().join('+'),
    cohortMerged: true, kinds: grp.map(g => g.kind),
    memberBeliefIds: [...new Set(grp.flatMap(g => g.memberBeliefIds || []))],
    claim: `A few different shifts are showing up across ${where} — ${_joinLabels(labels)}. Worth looking at as a group, not only one at a time.`,
    why: `Multiple shifts (${labels.join(', ')}) across the same ${n} people.`,
    severity: grp.reduce((s, g) => (SEV_RANK[g.severity] > SEV_RANK[s] ? g.severity : s), 'low'),
    careFlag: grp.some(g => g.careFlag),
    urgency: Math.max(...grp.map(g => g.urgency || 0)),
  };
}

/* "a" · "a and b" · "a, b and c" */
function _joinLabels(xs) {
  const a = [...new Set(xs)];
  if (a.length <= 1) return a[0] || '';
  if (a.length === 2) return `${a[0]} and ${a[1]}`;
  return `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`;
}

/* Proposal — proposal-gated ALWAYS. This module never executes it; the caller must
   route it through the existing proposal → confirm → execute pipeline. The verb
   follows the register, so care-first stays care-first. */
const PROPOSAL_TEXT = {
  support:     who => `Consider a supportive check-in with ${who} — listen first, before anything task-related.`,
  scout:       who => `Consider a focused scout / review with ${who} on this.`,
  acknowledge: who => `Worth acknowledging with ${who} — naming a good turn helps it hold.`,
};
const PROPOSAL_TYPE = { support: 'supportive_checkin', scout: 'scout', acknowledge: 'recognition' };

function proposalFrom(item) {
  const who = item.shared ? 'the group' : _who(item.subjectName);
  return {
    beliefId: item.beliefId,
    proposalType: PROPOSAL_TYPE[item.register] || 'supportive_checkin',
    register: item.register,
    text: (PROPOSAL_TEXT[item.register] || PROPOSAL_TEXT.support)(who),
    requiresConfirmation: true,   // invariant: surface, never act
  };
}

/* ── Calibration — closing the loop ──────────────────────────────────────────
   The reasoner is only trustworthy if it learns whether its beliefs were TRUE. Two
   signals feed that: the belief's OWN trajectory (did it resolve, or fade?) and the
   human's RESPONSE to the proposal (acted / useful / dismissed / wrong). This module
   turns both into the { useful, dismiss } tally the Confidence Engine consumes — but
   it does not import the Confidence Engine; the server composes the two (pure modules
   never depend on each other). */

/* Is this belief in a dismissal cooldown — held so we don't nag? */
function isSuppressed(belief, now = Date.now()) {
  return !!(belief && belief.suppressUntil && now < belief.suppressUntil);
}

/* Record a human's response to a belief, in place. dismissed/wrong start a cooldown
   (stop raising it); acted/useful clear any cooldown (it earned attention). Returns the
   updated belief, or null if unknown. */
function applyFeedback(beliefs, beliefId, response, now = Date.now(), by = null) {
  if (!RESPONSES.has(response)) return null;
  const b = (beliefs || []).find(x => x && x.id === beliefId);
  if (!b) return null;
  b.feedback = { response, at: now, by: by || null };
  if (response === 'dismissed')   b.suppressUntil = now + DISMISS_COOLDOWN;
  else if (response === 'wrong') {
    b.suppressUntil = now + WRONG_COOLDOWN;
    // Only the affected person's own "wrong" is a contest. A leader's calibration
    // response retains its existing cooldown semantics and cannot speak for the subject.
    if (by && by === b.subjectId) {
      b.contest = { status: 'unresolved', by, at: now };
      _upsert(b.counter, { id: `contest:${by}`, t: now, by, kind: 'subject_contest' });
      b.status = 'contested'; // immediate visibility; the tick recomputation also honours it
    }
  }
  else                            delete b.suppressUntil;   // acted / useful → re-engage
  return b;
}

/* Per-KIND reliability tally, in the Confidence Engine's { useful, dismiss } shape.
   Combines self-corroboration (resolved = useful, faded/contested = dismiss) with any
   human feedback recorded on the belief. Kinds with no closed evidence simply don't
   appear — the Confidence Engine then reports "calibrating", never false reliability. */
function outcomeTally(beliefs) {
  const tally = {};
  const bump = (kind, field) => { (tally[kind] || (tally[kind] = { useful: 0, dismiss: 0 }))[field]++; };
  for (const b of (beliefs || [])) {
    if (!b || !b.kind || b.shared) continue;
    if (b.outcome === 'resolved')  bump(b.kind, 'useful');
    else if (b.outcome === 'faded' || b.outcome === 'contested') bump(b.kind, 'dismiss');
    if (b.feedback) {
      const r = b.feedback.response;
      if (r === 'acted' || r === 'useful') bump(b.kind, 'useful');
      else if (r === 'dismissed' || r === 'wrong') bump(b.kind, 'dismiss');
    }
  }
  return tally;
}

/* ── The voice (deterministic floor) ─────────────────────────────────────────
   Turn the ripe agenda into a short, warm spoken rundown — the proactive line the
   assistant opens with. This is PURE and always available: it is the guaranteed
   output, and the fallback the optional LLM phrasing degrades to. It adds NOTHING the
   reasoner didn't already decide — it only strings the claims (and their timing)
   together. No score, no cause, no prediction: just what's already been reasoned. */
const _NUM = ['no', 'one', 'two', 'three', 'four', 'five'];
function speak(agenda, { now } = {}) {
  const ripe = (agenda || []).filter(a => a.readiness === 'ripe');
  if (!ripe.length) return "Nothing's pressing right now — your group looks steady.";
  const top = ripe.slice(0, 3);
  const lead = ripe.length === 1 ? 'One thing stands out.' : `${_cap(_NUM[Math.min(ripe.length, 5)])} things stand out.`;
  const parts = top.map(a => a.timing ? `${a.claim} ${a.timing}` : a.claim);
  return `${lead} ${parts.join(' ')}`.trim();
}

/* subjectView — what the PERSON a belief is about may see about themselves: a warm,
   self-phrased read, its confidence, what would change it, and that they can say it's
   wrong. Deliberately minimal — no urgency, register, severity, or the leader-facing
   challenge; those are about how to approach the person, not for the person. */
function subjectView(belief) {
  if (!belief) return null;
  const self = CLAIM_SELF[belief.kind];
  return {
    beliefId: belief.id,
    kind: belief.kind,
    claim: self ? self() : belief.claim,
    status: belief.status,
    confidence: belief.confidence,
    whatWouldChangeIt: belief.whatWouldRefute || null,
    canContest: true,   // the person can always tell us it's wrong (rectification)
  };
}

/* Challenge — the reasoner arguing against its own belief. Plain reasons it might be
   wrong, so a human can correct it and it never reads as unearned certainty. */
function challenge(b, now = Date.now()) {
  const reasons = [];
  if (b.counterCount) reasons.push(`${b.counterCount} observation${b.counterCount === 1 ? '' : 's'} argue the other way`);
  if (b.confidence === 'tentative') reasons.push(`the evidence is still thin (${b.supportCount} signal${b.supportCount === 1 ? '' : 's'})`);
  const staleDays = Math.floor((now - b.lastSeen) / DAY);
  if (staleDays >= 10) reasons.push(`no fresh signal in ${staleDays} days`);
  reasons.push(`it would be refuted by ${b.whatWouldRefute}`);
  return reasons;
}

module.exports = {
  reason, challenge, rollUpShared,
  // calibration — closing the loop
  applyFeedback, isSuppressed, outcomeTally, RESPONSES,
  // the subject's right to see + contest
  subjectView, CLAIM_SELF,
  // the voice (deterministic floor for the optional LLM phrasing)
  speak,
  // exported for tests + downstream projection
  agendaItem, proposalFrom,
  AXIS, WELLBEING_AXES, KIND_LABEL, STALE, DISMISS_COOLDOWN, WRONG_COOLDOWN, HORIZON,
  _confWord, _register, _readiness, _urgency, _eventHorizon, _timing,
};
