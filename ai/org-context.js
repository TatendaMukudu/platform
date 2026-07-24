/* ============================================================
   ai/org-context.js — PURE operating-context extraction, validation & projection

   Turns how an organisation DESCRIBES its operation (a sentence in the composer, or a
   structured import) into PROPOSED structured records — events, objectives,
   responsibilities, requirements, operating rhythms, dependencies, decisions — that a
   human then confirms. It also validates those records and PROJECTS the confirmed,
   effective ones into the shape the org-state model consumes.

   It NEVER persists and NEVER auto-confirms: extraction is automatic, persistence is
   deliberate (the caller owns the governed write). PURE: no DB/UI/network; time comes
   from `now`. It refuses to encode private/wellbeing/surveillance content as operating
   rules — those are hard-blocked before they can ever reach the state model.
   ============================================================ */

const DAY = 86400000;
const DOW = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const RECORD_TYPES = Object.freeze(['event', 'objective', 'responsibility', 'requirement', 'rhythm', 'dependency', 'decision']);

/* Never allow operating context to encode private/sensitive/surveillance content.
   These are HARD blocks at extraction and validation — they can never become rules. */
const FORBIDDEN = [
  { re: /\b(anxious|depress|burn(?:t|ed)? ?out|mental health|therapy|medication|diagnos|wellbeing|morale|feeling low)\b/i, reason: 'private_wellbeing_cannot_be_an_operating_rule' },
  { re: /\b(lazy|underperform|not committed|poor attitude|weak link)\b/i, reason: 'personal_performance_judgment_not_a_fact' },
  { re: /\b(religion|ethnic|disab|pregnan|sexual|gender identity)\b/i, reason: 'protected_attribute_cannot_be_a_condition' },
  { re: /\b(after[- ]?hours|working late|response time|always online|weekend availability as|presence)\b/i, reason: 'surveillance_or_presence_expectation' },
];
function forbidden(text) { const t = String(text || ''); for (const f of FORBIDDEN) if (f.re.test(t)) return f.reason; return null; }

/* ── relative date/time resolution (deterministic in `now`) ── */
function nextWeekday(now, dow, hour = 0, min = 0) {
  const cur = new Date(now).getDay();
  let delta = (dow - cur + 7) % 7; if (delta === 0) delta = 7;      // "Saturday" = the NEXT Saturday
  const r = new Date(now + delta * DAY); r.setHours(hour, min, 0, 0); return r.toISOString();
}
function atTime(baseMs, hour, min = 0) { const r = new Date(baseMs); r.setHours(hour, min, 0, 0); return r.toISOString(); }
function parseClock(s) {
  const m = String(s || '').match(/(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/i);
  if (!m) return null;
  let h = +m[1]; const min = m[2] ? +m[2] : 0; const ap = m[3] ? m[3].toLowerCase().replace(/\./g, '') : null;
  if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0;
  if (!ap && h >= 1 && h <= 8) h += 12;                             // a bare "3"/"5" for a session ⇒ afternoon/evening
  return { h: h % 24, min };
}
// A claim-type keyword map so extracted requirements/responsibilities use canonical types.
const CLAIM_KEYWORDS = [
  ['game_plan', /\b(game ?plan|tactic|formation|line[- ]?up|shape|set[- ]?piece)\b/i],
  ['kickoff_time', /\b(kick[- ]?off|kickoff|start time|starts? at)\b/i],
  ['availability', /\b(availab|squad|selection|player list|who'?s (?:in|out))\b/i],
  ['transport_confirmation', /\b(transport|coach travel|bus|travel)\b/i],
  ['session_time', /\b(session|training) (?:time|at|starts?)\b/i],
  ['meeting_time', /\b(meeting|review) (?:time|at|starts?)\b/i],
];
function claimTypeOf(text) { for (const [ct, re] of CLAIM_KEYWORDS) if (re.test(text)) return ct; return null; }

/* ── EXTRACTION — a sentence → PROPOSED records (never persisted). ── */
function extract(text, ctx = {}) {
  const now = ctx.now || Date.now();
  const raw = String(text || '').trim();
  const proposals = [];
  const warnings = [];
  const block = forbidden(raw);
  if (block) return { proposals: [], warnings: [], blocked: block };

  const lower = raw.toLowerCase();
  const dayIdx = DOW.findIndex(d => new RegExp(`\\b${d}\\b`, 'i').test(raw));
  const rel = /\btomorrow\b/i.test(raw) ? 1 : /\btoday\b/i.test(raw) ? 0 : null;
  const clock = (raw.match(/\bat\s+([0-9][0-9:. ]*\s*(?:a\.?m\.?|p\.?m\.?)?)/i) || raw.match(/\b([0-9]{1,2}(?::[0-9]{2})?\s*(?:a\.?m\.?|p\.?m\.?))\b/i));
  const time = clock ? parseClock(clock[1]) : null;

  // EVENT — a play/match/meeting/training/launch/review with a day (+ optional time).
  const eventVerb = /\b(play|plays|playing|match|fixture|game|meeting|meet|training|session|launch|review|deadline|final)\b/i.test(raw);
  if (eventVerb && (dayIdx >= 0 || rel != null)) {
    const type = /\b(match|fixture|game|final|plays?|playing)\b/i.test(raw) ? 'match' : /\b(training|session)\b/i.test(raw) ? 'training' : /\b(meeting|meet|review)\b/i.test(raw) ? 'meeting' : 'default';
    let startAt = null;
    if (dayIdx >= 0) startAt = nextWeekday(now, dayIdx, time ? time.h : 0, time ? time.min : 0);
    else if (rel != null) startAt = atTime(now + rel * DAY, time ? time.h : 0, time ? time.min : 0);
    const title = /first team/i.test(raw) ? 'First Team ' + type : (type[0].toUpperCase() + type.slice(1));
    proposals.push({ type: 'event', fields: { type, title, startAt, scope: /first team/i.test(raw) ? 'team' : 'team' },
      confidence: 0.7, plainLanguage: `${title} on ${new Date(startAt).toLocaleString('en-GB', { weekday: 'long', hour: '2-digit', minute: '2-digit' })}` });
  }

  // RESPONSIBILITY — "<who> owns/leads/is responsible for <claim>".
  const respM = raw.match(/\b(the\s+)?([a-z][a-z '\-]{1,40}?)\s+(?:owns?|leads?|is responsible for|is in charge of|manages?)\s+(?:the\s+)?([a-z][a-z ]{1,40})/i);
  if (respM) {
    const subject = respM[2].trim();
    const ct = claimTypeOf(respM[3]) || respM[3].trim().toLowerCase().replace(/\s+/g, '_');
    const looksLikeRole = /\b(coach|manager|lead|head|director|coordinator|admin|captain|physio|analyst|officer)\b/i.test(subject);
    proposals.push({ type: 'responsibility', fields: { subject, role: looksLikeRole ? subject : null, claimTypes: [ct], type: 'owns' },
      confidence: 0.65, isNamedPerson: !looksLikeRole, plainLanguage: `${subject} owns ${ct.replace(/_/g, ' ')}` });
    if (!looksLikeRole) warnings.push({ code: 'named_person_responsibility', message: `"${subject}" looks like a person — a role (e.g. "Head Coach") is more durable when people change.` });
  }

  // REQUIREMENT — "<claim> should be ready/shared <N hours/day> before <event>".
  const reqM = raw.match(/\b([a-z][a-z ]{1,40}?)\s+(?:should|must|needs? to)\s+(?:be\s+)?(?:ready|shared|confirmed|done|complete[d]?|finalis|final)[a-z]*\b(?:[\s\S]*?\b(\d+)\s*(hour|hr|day)s?\b[\s\S]*?\bbefore\b\s*([a-z ]+))?/i);
  if (reqM) {
    const ct = claimTypeOf(reqM[1]) || reqM[1].trim().toLowerCase().replace(/\s+/g, '_');
    const offsetH = reqM[2] ? (+reqM[2]) * (/(day)/i.test(reqM[3]) ? 24 : 1) : null;
    const anchor = reqM[4] ? claimTypeOf(reqM[4]) || 'event.start' : 'event.start';
    proposals.push({ type: 'requirement', fields: { claimType: ct, neededByRule: { before: anchor, offsetHours: offsetH != null ? offsetH : 24 }, freshDays: 14 },
      confidence: 0.6, plainLanguage: `${ct.replace(/_/g, ' ')} required ${offsetH != null ? offsetH + ' hours ' : ''}before ${anchor === 'event.start' ? 'the event' : anchor.replace(/_/g, ' ')}` });
  }

  // OPERATING RHYTHM — "we <do X> every <day/period> [and should produce <output>]".
  const rhyM = raw.match(/\b(?:we\s+)?([a-z][a-z ]{1,40}?)\s+(?:happens?|is|occurs?|runs?|review|reviews?)?\s*\b(?:every|each)\s+([a-z]+)\b/i);
  if (rhyM && /\bevery|each\b/i.test(raw)) {
    const process = rhyM[1].trim();
    const period = rhyM[2].toLowerCase();
    const cadenceDays = DOW.includes(period) ? 7 : /week/.test(period) ? 7 : /month/.test(period) ? 30 : /day/.test(period) ? 1 : null;
    const outM = raw.match(/\bproduce[s]?\s+(?:a\s+)?([a-z][a-z ]{1,40})/i);
    proposals.push({ type: 'rhythm', fields: { process, cadenceDays, day: DOW.includes(period) ? period : null, expectedOutput: outM ? outM[1].trim() : null },
      confidence: 0.6, plainLanguage: `${process} every ${period}${outM ? `, producing ${outM[1].trim()}` : ''}` });
  }

  // DEPENDENCY — "<A> is required before <B>" / "<B> depends on <A>".
  const depM = raw.match(/\b([a-z][a-z ]{2,40}?)\s+(?:is\s+)?(?:required|needed|confirmed)?\s*before\s+(?:the\s+)?([a-z][a-z ]{2,40})/i)
            || raw.match(/\b([a-z][a-z ]{2,40}?)\s+depends? on\s+(?:the\s+)?([a-z][a-z ]{2,40})/i);
  if (depM) {
    const upstream = claimTypeOf(depM[1]) || depM[1].trim().toLowerCase().replace(/\s+/g, '_');
    const downstream = claimTypeOf(depM[2]) || depM[2].trim().toLowerCase().replace(/\s+/g, '_');
    proposals.push({ type: 'dependency', fields: { upstream, downstream, type: 'blocks' },
      confidence: 0.55, plainLanguage: `${upstream.replace(/_/g, ' ')} must be done before ${downstream.replace(/_/g, ' ')}` });
  }

  return { proposals, warnings, blocked: null };
}

/* ── VALIDATION — hard blocks (privacy/authorization/tenant/structural) vs warnings. ── */
function validate(record, ctx = {}) {
  const hard = [], warn = [];
  const f = record.fields || {};
  const push = (arr, code, message) => arr.push({ code, message });

  if (!RECORD_TYPES.includes(record.type)) push(hard, 'unknown_type', `Unknown record type "${record.type}".`);
  if (!record.scope || !record.scope.kind) push(hard, 'missing_scope', 'Every record must declare a scope.');
  if (forbidden(JSON.stringify(f))) push(hard, 'forbidden_content', 'This cannot be an operating rule (private/sensitive/surveillance).');

  if (record.type === 'event') {
    const s = f.startAt ? Date.parse(f.startAt) : NaN, e = f.endAt ? Date.parse(f.endAt) : null;
    if (f.startAt && !Number.isFinite(s)) push(hard, 'invalid_date', 'The start time is not a valid date.');
    if (e != null && Number.isFinite(e) && Number.isFinite(s) && e < s) push(hard, 'end_before_start', 'The event ends before it starts.');
  }
  if (record.type === 'requirement') {
    if (!f.claimType) push(hard, 'requirement_without_subject', 'A requirement must say what information is required.');
  }
  if (record.type === 'rhythm') {
    if (!f.cadenceDays) push(hard, 'rhythm_without_cadence', 'A recurring rhythm needs a cadence (e.g. weekly).');
  }
  if (record.type === 'responsibility') {
    if (!f.subject && !f.role) push(hard, 'responsibility_without_subject', 'A responsibility needs a person or role.');
    if (f.subject && !f.role && (!record.effectiveTo)) push(warn, 'named_person_long_lived', 'A long-lived responsibility on a named person may become stale when roles change — prefer a role.');
  }
  if (record.type === 'dependency') {
    if (f.upstream && f.downstream && f.upstream === f.downstream) push(hard, 'self_blocking', 'Something cannot depend on itself.');
  }
  // Visibility beyond the actor's permission is a hard block.
  if (record.visibility === 'organization' && ctx.actorCanShareOrg === false) push(hard, 'visibility_beyond_permission', 'You cannot create organisation-wide records.');
  // Unknown role/person reference (when a resolver is supplied).
  if (record.type === 'responsibility' && f.role && ctx.knownRoles && !ctx.knownRoles.includes(String(f.role).toLowerCase()) && ctx.strictRoles) push(warn, 'unknown_role', `Role "${f.role}" isn't a known role yet.`);

  return { ok: hard.length === 0, hardErrors: hard, warnings: warn };
}

/* Detect dependency CYCLES (incl. self-blocking) across a set of dependency records. */
function detectCycles(dependencies) {
  const adj = new Map();
  for (const d of (dependencies || [])) {
    const u = (d.fields || d).upstream, v = (d.fields || d).downstream;
    if (!u || !v) continue;
    if (!adj.has(u)) adj.set(u, []); adj.get(u).push(v);
  }
  const cycles = [];
  const WHITE = 0, GRAY = 1, BLACK = 2; const color = new Map();
  const stack = [];
  const dfs = (n) => {
    color.set(n, GRAY); stack.push(n);
    for (const m of (adj.get(n) || [])) {
      if (color.get(m) === GRAY) { const i = stack.indexOf(m); cycles.push(stack.slice(i).concat(m)); }
      else if ((color.get(m) || WHITE) === WHITE) dfs(m);
    }
    stack.pop(); color.set(n, BLACK);
  };
  for (const n of adj.keys()) if ((color.get(n) || WHITE) === WHITE) dfs(n);
  return { hasCycle: cycles.length > 0, cycles };
}

/* Authority is NOT inferred from wording — it comes from WHO confirmed it. A leader/
   admin makes authoritative organisation operating context; anyone else is
   shared-but-unverified until an authorised leader confirms. */
function authorityFor(actorRole) {
  const leader = ['superadmin', 'admin', 'owner', 'manager', 'leader'].includes(String(actorRole || '').toLowerCase());
  return leader ? 'organisation' : 'shared_unverified';
}

/* Plain-language PREVIEW of what will be created + what IntelliQ will infer. */
function preview(proposals, ctx = {}) {
  const lines = (proposals || []).map(p => p.plainLanguage || `${p.type}`);
  const effects = [];
  if (proposals.some(p => p.type === 'event')) effects.push('This creates an upcoming event.');
  if (proposals.some(p => p.type === 'requirement')) effects.push('IntelliQ will flag when this preparation is missing or overdue.');
  if (proposals.some(p => p.type === 'responsibility')) effects.push('Questions about it will route to the named owner.');
  if (proposals.some(p => p.type === 'rhythm')) effects.push('IntelliQ will notice when the recurring output is overdue.');
  const authority = authorityFor(ctx.actorRole);
  return { lines, effects, authority, visibility: ctx.visibility || 'organization', requiresConfirmation: true };
}

/* ── PROJECTION — reduce durable, CONFIRMED, effective records into the org-state
   configuration shape. Retired/superseded records are excluded; the latest effective
   version of each wins. Never mutates history — it reads the effective set. ── */
function projectConfig(records, now = Date.now()) {
  const active = (records || []).filter(r => r.status === 'active' && r.confirmedAt &&
    (!r.effectiveFrom || Date.parse(r.effectiveFrom) <= now) && (!r.effectiveTo || Date.parse(r.effectiveTo) > now));
  const cfg = { events: [], objectives: [], responsibilities: [], requirements: [], rhythms: [], dependencies: [], decisions: [] };
  for (const r of active) {
    const f = r.fields || {};
    if (r.type === 'event') cfg.events.push({ id: r.id, type: f.type || 'default', title: f.title, startAt: f.startAt, endAt: f.endAt || null, scope: f.scope || 'team', owner: f.owner || null, participants: f.participants || null });
    else if (r.type === 'objective') cfg.objectives.push({ id: r.id, title: f.title, priority: f.priority || 'normal', owner: f.owner || null, targetAt: f.targetAt || null, successCriteria: f.successCriteria || null });
    else if (r.type === 'responsibility') cfg.responsibilities.push({ subject: f.role || f.subject, role: f.role || null, claimTypes: f.claimTypes || [], effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo });
    else if (r.type === 'requirement') cfg.requirements.push({ id: r.id, claimType: f.claimType, neededBy: f.neededBy || null, freshDays: f.freshDays, expectedOwner: f.expectedOwner || null, matches: f.matches || null });
    else if (r.type === 'rhythm') cfg.rhythms.push({ id: r.id, process: f.process, cadenceDays: f.cadenceDays, expectedOutput: f.expectedOutput || null, owner: f.owner || null, lastOutputAt: f.lastOutputAt || null });
    else if (r.type === 'dependency') cfg.dependencies.push({ upstream: f.upstream, downstream: f.downstream, type: f.type || 'blocks', deadlineAt: f.deadlineAt || null });
    else if (r.type === 'decision') cfg.decisions.push({ id: r.id, question: f.question, owner: f.owner || null, requiredBy: f.requiredBy || null, requiredInputs: f.requiredInputs || [], status: f.status || 'open' });
  }
  return cfg;
}

module.exports = { RECORD_TYPES, FORBIDDEN, forbidden, extract, validate, detectCycles, authorityFor, preview, projectConfig,
  nextWeekday, parseClock, claimTypeOf };
