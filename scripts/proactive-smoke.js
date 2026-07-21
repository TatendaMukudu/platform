/* Truth layer — the PROACTIVE SURFACING LAYER (ai/proactive.js + server projection).

   Proves the proactive layer is a bounded, post-kernel PROJECTION — not a second
   brain. Two halves:
     • PURE  — the artifact, surfacing policy, per-pattern deterministic messages,
               audience safety (adversarial), bounded communication preferences.
     • HTTP  — boots the real app (DB_OPTIONAL, no AI key), seeds a mood decline,
               and proves: a real pattern surfaces to the owner WITH specifics, the
               SAME pattern reaches a leader WITHOUT any number/quote/basis, the
               empty state is valid, authz holds, and feedback/suppression work.

   No DB, no AI key. Run:  node scripts/proactive-smoke.js   (part of `npm test`) */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const proactive = require('../ai/proactive');
const intel     = require('../ai/intelligence');
const behaviour = require('../ai/behaviour');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

/* ── PURE: 1 · artifact shape + stable, deterministic id ─────────────────────── */
{
  const f = { type: 'momentum_drop', severity: 'high', confidence: 'clear', basis: 'mood 2.1/5 vs 4.1/5 (6 check-ins)' };
  const a = proactive.toInsight(f, { audience: 'self', subjectId: 'u1', now: 0 });
  const b = proactive.toInsight(f, { audience: 'self', subjectId: 'u1', now: 999 });
  ok('1 · insight carries the required fields', ['id','dedupeKey','patternType','audience','severity','headline','body','suggestion','surfacedAt'].every(k => k in a));
  ok('1 · id is stable + deterministic for the same subject+pattern+audience', a.id === b.id && a.dedupeKey === 'u1:momentum_drop:self');
  ok('1 · the insight adds no conclusion — it mirrors the kernel severity', a.severity === 'high' && a.patternType === 'momentum_drop');
}

/* ── PURE: 2 · behaviour caps volume at ≤3 per bucket ─────────────────────────── */
{
  const many = ['high','medium','low','low','high','medium'].map((s, i) =>
    proactive.toInsight({ type: 'withdrawal', severity: s, confidence: 'emerging' }, { audience: 'self', subjectId: 'u' + i }));
  ok('2 · behaviour caps a bucket at 3', behaviour.plan(many, { limit: 3, now: 0 }).groups.needs_attention.insights.length === 3);
}

/* ── PURE: 3 · "nothing needs your attention" is a VALID result, not an error ─── */
{
  const self = behaviour.plan([], { now: 0 });
  const lead = behaviour.plan([], { audience: 'leader', now: 0 });
  ok('3 · empty is a first-class calm result (self)', self.empty === true && /nothing needs you/i.test(self.message));
  ok('3 · empty is a first-class calm result (leader)', lead.empty === true && /nothing needs your attention/i.test(lead.message));
}

/* ── PURE: 4 · deterministic ranking — priority, then confidence ──────────────── */
{
  const lowClear = proactive.toInsight({ type: 'plateau',  severity: 'low',  confidence: 'clear'    }, { audience: 'self', subjectId: 'a' });
  const highTent = proactive.toInsight({ type: 'overload', severity: 'high', confidence: 'tentative'}, { audience: 'self', subjectId: 'b' });
  const medEmerg = proactive.toInsight({ type: 'isolation',severity: 'medium',confidence: 'emerging'}, { audience: 'self', subjectId: 'c' });
  const order = behaviour.plan([lowClear, medEmerg, highTent], { limit: 3, now: 0 }).groups.needs_attention.insights.map(i => i.severity);
  ok('4 · priority wins ranking within a bucket (high → medium → low)', order.join(',') === 'high,medium,low');
}

/* ── PURE: 5 · de-duplication by dedupeKey ───────────────────────────────────── */
{
  const dup = ['high','low'].map(s => proactive.toInsight({ type: 'withdrawal', severity: s, confidence: 'clear' }, { audience: 'self', subjectId: 'u1' }));
  const out = behaviour.plan(dup, { limit: 3, now: 0 }).groups.needs_attention.insights;
  ok('5 · the same subject+pattern surfaces once (keeps the most severe)', out.length === 1 && out[0].severity === 'high');
}

/* ── PURE: 6 · a deterministic message exists for EVERY kernel pattern, both
             audiences, with NO AI key (they are static templates) ────────────── */
{
  const types = Object.keys(intel.PATTERN_LABEL);
  const missing = types.filter(t => !(proactive.MESSAGES[t] && proactive.MESSAGES[t].self && proactive.MESSAGES[t].leader));
  ok('6 · every kernel pattern has a self + leader deterministic message', missing.length === 0 || (console.log('    missing:', missing), false));
  // Even an unknown type never throws and never surfaces empty text.
  const fb = proactive.toInsight({ type: 'brand_new_pattern', severity: 'low' }, { audience: 'leader', subjectId: 'x' });
  ok('6 · an unknown pattern degrades to a safe fallback, never a crash', !!fb.headline && !!fb.body);
}

/* ── PURE: 7 · audience safety — a leader-audience insight carries NO number ──── */
{
  const leak = { type: 'momentum_drop', severity: 'high', confidence: 'clear', basis: 'mood 2.1/5 over two weeks vs 4.1/5 before (60% of normal)' };
  const li = proactive.toInsight(leak, { audience: 'leader', subjectId: 'u1', subjectName: 'Sam' });
  const check = proactive.audienceSafe(li);
  ok('7 · leader insight is audience-safe (no numeric/quote/basis leak)', check.ok);
  ok('7 · leader insight renders no score anywhere a human sees it', !/\d(?:\.\d)?\s*\/\s*5|\d{1,3}\s*%/.test([li.headline, li.body, li.suggestion && li.suggestion.text].join(' ')));
}

/* ── PURE: 8 · audience safety — a leader insight never carries evidence basis ── */
{
  const li = proactive.toInsight({ type: 'baseline_shift', severity: 'high', confidence: 'clear', basis: 'sleep below their usual (60%); mood below usual' },
    { audience: 'leader', subjectId: 'u1', subjectName: 'Sam' });
  const si = proactive.toInsight({ type: 'baseline_shift', severity: 'high', confidence: 'clear', basis: 'sleep below your usual' },
    { audience: 'self', subjectId: 'u1' });
  ok('8 · leader basis is stripped (never rendered)', li.basis.length === 0);
  ok('8 · owner keeps their own basis (it is their data)', si.basis.length === 1);
}

/* ── PURE: 9 · adversarial — a private-implying pattern degrades to care-first ── */
{
  // baseline_shift can be driven by private context; the leader form must not name
  // the dimension or imply the disclosure — only a curious, care-first nudge.
  const li = proactive.toInsight({ type: 'baseline_shift', severity: 'high', confidence: 'clear', basis: 'therapy attendance below usual; medication skipped' },
    { audience: 'leader', subjectId: 'u1', subjectName: 'Sam', careFlag: true });
  const rendered = [li.headline, li.body, li.suggestion && li.suggestion.text].join('  ');
  ok('9 · leader form implies no private dimension (no therapy/medication leak)', !/therap|medicat|diagnos|skipped/i.test(rendered));
  ok('9 · the leader form stays curious/care-first', /curious|check-in|1:1|curiosity/i.test(rendered));
  ok('9 · audience-safe holds even against a private-loaded basis', proactive.audienceSafe(li).ok);
}

/* ── PURE: 10 · protected-trait language never appears, any audience ──────────── */
{
  // The message table is authored clean; assert the guard would catch a violation.
  const dirty = { ...proactive.toInsight({ type: 'withdrawal', severity: 'low' }, { audience: 'leader', subjectId: 'u' }), body: 'Their anxiety disorder may be flaring.' };
  ok('10 · protected-trait language is flagged as unsafe', proactive.audienceSafe(dirty).violations.includes('protected_trait_language'));
  ok('10 · every shipped message is clean of protected-trait language',
     Object.values(proactive.MESSAGES).every(m => ['self','leader'].every(aud =>
       !/\b(race|ethnic|religio|sexual|gender identity|disab|pregnan|diagnos|depress|anxiety disorder|medicat|therapy|HIV|immigration)\b/i.test(m[aud].headline + ' ' + m[aud].body + ' ' + m[aud].suggestion))));
}

/* ── PURE: 11 · every suggestion is proposal-gated (surface, never act) ───────── */
{
  const all = Object.keys(intel.PATTERN_LABEL).flatMap(t => ['self','leader'].map(aud =>
    proactive.toInsight({ type: t, severity: 'medium', confidence: 'clear' }, { audience: aud, subjectId: 'u' })));
  ok('11 · no suggestion is ever auto-runnable — all require confirmation',
     all.every(i => !i.suggestion || i.suggestion.requiresConfirmation === true));
}

/* ── PURE: 12 · communication preferences are bounded (allow-list only) ───────── */
{
  const p = proactive.normalizePreferences({ length: 'brief', tone: 'HACKED', cadence: 'daily', race: 'x', diagnosis: 'y', __proto__: { polluted: true } });
  ok('12 · only allow-listed keys/values survive; junk + protected keys dropped',
     JSON.stringify(p) === JSON.stringify({ length: 'brief', tone: 'warm', cadence: 'daily' }));
  ok('12 · defaults fill any unset preference', proactive.normalizePreferences({}).length === 'standard');
}

/* ── PURE: 13 · applyPreferences changes HOW it reads, never WHAT surfaces ────── */
{
  const base = proactive.toInsight({ type: 'momentum_drop', severity: 'high', confidence: 'clear' }, { audience: 'self', subjectId: 'u' });
  const brief = proactive.applyPreferences(base, { length: 'brief' });
  ok('13 · brief trims the body but keeps the same insight identity', brief.dedupeKey === base.dedupeKey && brief.body.length < base.body.length && brief.severity === base.severity);
  ok('13 · applyPreferences is deterministic', proactive.applyPreferences(base, { length: 'brief' }).body === brief.body);
  ok('13 · unknown prefs fall back to defaults (no throw)', !!proactive.applyPreferences(base, { length: 'nonsense' }).body);
}

/* ── PURE: 19 · ATTENTION ENGINE — polarity is a projection, not a new detector ─ */
{
  ok('19 · negative patterns project to polarity=risk', ['momentum_drop','withdrawal','overload','data_gap','baseline_shift'].every(t => proactive.PATTERN_POLARITY[t] === 'risk'));
  ok('19 · positive patterns the kernel already emits project to polarity=progress', proactive.PATTERN_POLARITY.recovering === 'progress' && proactive.PATTERN_POLARITY.quiet_improvement === 'progress');
  const risk = proactive.toInsight({ type: 'momentum_drop', severity: 'high', confidence: 'clear' }, { audience: 'self', subjectId: 'u' });
  const prog = proactive.toInsight({ type: 'recovering', severity: 'low', confidence: 'clear' }, { audience: 'self', subjectId: 'u' });
  ok('19 · a risk and a win land in different buckets', behaviour.bucketOf(risk) === 'needs_attention' && behaviour.bucketOf(prog) === 'worth_celebrating');
}

/* ── PURE: 20 · Home groups into "Your Attention" — needs / celebrate / opportunity */
{
  const risk = proactive.toInsight({ type: 'overload', severity: 'high', confidence: 'clear' }, { audience: 'self', subjectId: 'u' });
  const win  = proactive.toInsight({ type: 'recovering', severity: 'low', confidence: 'clear' }, { audience: 'self', subjectId: 'u' });
  const mile = proactive.toInsight(proactive.milestoneFinding({ key: 'checkin_streak', subjectId: 'u', days: 21, best: true }), { audience: 'self', subjectId: 'u' });
  const opp  = proactive.toInsight(proactive.opportunityFinding({ key: 'ready', subjectId: 'u', headline: 'Ready for more?', body: 'You have finished early several weeks.', suggestion: 'Talk it through.' }), { audience: 'self', subjectId: 'u' });
  const g = behaviour.plan([risk, win, mile, opp], { audience: 'self' }).groups;
  ok('20 · three buckets, correctly populated', g.needs_attention.insights.length === 1 && g.worth_celebrating.insights.length === 2 && g.opportunities.insights.length === 1);
  ok('20 · an empty bucket is a first-class calm state, not an error', behaviour.plan([win], { audience: 'self' }).groups.needs_attention.empty === true);
  ok('20 · all-empty is a valid, calm whole-surface result', behaviour.plan([], { audience: 'self' }).empty === true);
}

/* ── PURE: 21 · priority is INDEPENDENT of polarity ──────────────────────────── */
{
  const bigWin  = proactive.toInsight(proactive.milestoneFinding({ key: 'checkin_streak', subjectId: 'u', days: 40, best: true, priority: 'high' }), { audience: 'self', subjectId: 'u' });
  const lowRisk = proactive.toInsight({ type: 'plateau', severity: 'low', confidence: 'clear' }, { audience: 'self', subjectId: 'v' });
  ok('21 · a high-priority milestone can outrank a low-priority risk', behaviour.SEV_RANK[bigWin.priority] < behaviour.SEV_RANK[lowRisk.priority]);
  // within a bucket, ranking is by priority, not by polarity/sentiment
  const a = proactive.toInsight(proactive.milestoneFinding({ key: 'k1', subjectId: 'u', days: 40, best: true, priority: 'high' }), { audience: 'self', subjectId: 'u' });
  const b = proactive.toInsight(proactive.milestoneFinding({ key: 'k2', subjectId: 'u2', days: 15, best: false }), { audience: 'self', subjectId: 'u2' });
  ok('21 · within a bucket, higher priority sorts first', behaviour.plan([b, a], { audience: 'self' }).groups.worth_celebrating.insights[0].priority === 'high');
}

/* ── PURE: 22 · milestone is deterministic + leader-safe; opportunity is self-only */
{
  const selfM = proactive.toInsight(proactive.milestoneFinding({ key: 'checkin_streak', subjectId: 'u', days: 21, best: true }), { audience: 'self', subjectId: 'u' });
  const leadM = proactive.toInsight(proactive.milestoneFinding({ key: 'checkin_streak', subjectId: 'u', days: 21, best: true }), { audience: 'leader', subjectId: 'u', subjectName: 'Mia' });
  ok('22 · the owner milestone celebrates the specific streak', /21 days/.test(selfM.body) && selfM.polarity === 'milestone');
  ok('22 · the leader milestone is directional + numberless + safe', proactive.audienceSafe(leadM).ok && !/\d/.test(leadM.body));
  ok('22 · a leader surface carries no opportunities bucket', !('opportunities' in behaviour.plan([leadM], { audience: 'leader' }).groups));
  // opportunity is framed as a question, never a verdict/prediction
  const opp = proactive.opportunityFinding({ key: 'ready', subjectId: 'u', headline: 'Ready for more?', body: 'Want to take on something bigger?' });
  ok('22 · an opportunity is a question, never a prediction/verdict', /\?/.test(opp.render.self.body) && !/\b(will|predict|forecast|guarantee)\b/i.test(opp.render.self.body));
}

/* ── PURE: 23 · explore prompts — every insight can start a conversation ──────── */
{
  const win  = proactive.toInsight({ type: 'recovering', severity: 'low', confidence: 'clear' }, { audience: 'self', subjectId: 'u' });
  const risk = proactive.toInsight({ type: 'momentum_drop', severity: 'high', confidence: 'clear' }, { audience: 'self', subjectId: 'u' });
  ok('23 · a win carries a reinforcing explore prompt', /helped|working|keep/i.test(win.explore));
  ok('23 · a risk carries a supportive, non-alarmist explore prompt', /explore|support|changed/i.test(risk.explore));
  ok('23 · explore never diagnoses, predicts, or assumes a cause', ![win, risk].some(i => /\b(because|will|diagnos|predict|forecast|must be|caused by)\b/i.test(i.explore)));
}

/* ── PURE: 24 · the proactive OPENING consumes artifacts (never generates) ────── */
{
  const win  = proactive.toInsight({ type: 'recovering', severity: 'low', confidence: 'clear' }, { audience: 'self', subjectId: 'u' });
  const risk = proactive.toInsight({ type: 'overload', severity: 'high', confidence: 'clear' }, { audience: 'self', subjectId: 'v' });
  const grouped = behaviour.plan([risk, win], { audience: 'self' });
  const morning = behaviour.opening(grouped, { name: 'Mia Chen', now: new Date('2026-07-21T08:00:00').getTime() });
  const evening = behaviour.opening(grouped, { name: 'Mia Chen', now: new Date('2026-07-21T20:00:00').getTime() });
  ok('24 · greeting is deterministic + time-aware', /^Good morning, Mia\./.test(morning.greeting) && /^Good evening, Mia\./.test(evening.greeting));
  ok('24 · the opening LEADS with a win when there is one', morning.sections[0].label === 'Worth celebrating');
  ok('24 · it carries an invitation to explore', /explore/i.test(morning.invitation || ''));
  // grounding: every item in the opening is one of the input insights — nothing invented.
  const inputKeys = new Set([risk, win].map(i => i.dedupeKey));
  const openKeys  = morning.sections.flatMap(s => s.insights.map(i => i.dedupeKey));
  ok('24 · the opening surfaces ONLY verified artifacts (no fabrication)', openKeys.length > 0 && openKeys.every(k => inputKeys.has(k)));
  // empty is a calm, valid opening — never an alarm, never a void.
  const empty = behaviour.opening(behaviour.plan([], { audience: 'self' }), { name: 'Mia', now: new Date('2026-07-21T08:00:00').getTime() });
  ok('24 · an empty opening is calm + valid (not an alarm)', empty.empty === true && /nothing needs you/i.test(empty.greeting) && empty.sections.length === 0);
}

/* ── PURE: 25 · a leader opening never leaks a number/quote/basis ─────────────── */
{
  const risk = proactive.toInsight({ type: 'momentum_drop', severity: 'high', confidence: 'clear', basis: 'mood 2.1/5' }, { audience: 'leader', subjectId: 'u', subjectName: 'Sam' });
  const op = behaviour.opening(behaviour.plan([risk], { audience: 'leader' }), { audience: 'leader', name: 'Sam', now: Date.now() });
  const items = op.sections.flatMap(s => s.insights);
  ok('25 · a leader opening carries no score/percent', !/\d(?:\.\d)?\s*\/\s*5|\d{1,3}\s*%/.test(JSON.stringify(op)));
  ok('25 · leader opening insights carry no evidence basis', items.length > 0 && items.every(i => (i.basis || []).length === 0));
}

/* ── PURE: 26 · GOVERNANCE — the behaviour layer is structurally pure ────────── */
{
  const fs = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'ai', 'behaviour.js'), 'utf8');
  // The boundary is a FILE boundary: behaviour imports NOTHING (no kernel, evidence,
  // server, AI, or projection) — it cannot reason, interpret, or change visibility.
  ok('26 · behaviour.js imports nothing (cannot reason or read evidence)', !/\brequire\s*\(/.test(src));
  // Projection no longer owns delivery — those verbs live only in the behaviour layer.
  ok('26 · projection no longer exports delivery (attention/surface/opening)',
     !('attention' in proactive) && !('surface' in proactive) && !('composeOpening' in proactive));
  ok('26 · delivery lives in the behaviour layer', typeof behaviour.plan === 'function' && typeof behaviour.opening === 'function');
  // Behaviour cannot mint an insight — it only arranges what projection produced.
  ok('26 · behaviour exposes no insight-creation surface', !('toInsight' in behaviour) && !('milestoneFinding' in behaviour));
}

/* ── HTTP + INTEGRATION ──────────────────────────────────────────────────────── */
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, _proactiveInsights, noticeFeedback, insightSuppression } = require('../server.js');

const CODE = 'pc', DAY = 86400000, now = Date.now();
const ev = (id, subj, mood, daysAgo) => ({ id, orgCode: CODE, status: 'active', subjectId: subj, type: 'metric', label: 'mood',
  visibility: 'shared', value: mood, observedAt: new Date(now - daysAgo * DAY).toISOString(), provider: 'checkin', source: 'observed' });

_loadAllStores({
  orgMeta:  { [CODE]: { orgName: 'ProCo', createdAt: new Date().toISOString() } },
  orgUsers: { [CODE]: {
    lead: { id: 'lead', name: 'Lead',  email: 'l@p.co', role: 'superadmin', orgCode: CODE, supervisorId: null,   status: 'active' },
    m:    { id: 'm',    name: 'Mia',   email: 'm@p.co', role: 'member',     orgCode: CODE, supervisorId: 'lead', status: 'active' },
    out:  { id: 'out',  name: 'Outsider', email: 'o@p.co', role: 'member',  orgCode: CODE, supervisorId: null,   status: 'active' },
  } },
  memberGoals: { [`${CODE}:m`]: [{ goal: 'ship', setAt: new Date(now - 30 * DAY).toISOString() }] },
  evidenceLog: { [CODE]: [
    ev('e1','m',4.2,40), ev('e2','m',4.0,35), ev('e3','m',4.1,30),   // was fine
    ev('e4','m',2.2,6),  ev('e5','m',2.0,3),  ev('e6','m',2.1,1),    // now declining
  ] },
});
_rebuildEmailIndex();

// flatten the grouped Attention Engine output into one array (test helper).
const flat = out => Object.values(out.groups || {}).flatMap(g => g.insights || []);
const bucketOf = (out, b) => (out.groups && out.groups[b] && out.groups[b].insights) || [];

// 14 · a real seeded pattern surfaces to the OWNER, in the needs-attention bucket, with specifics …
{
  const self = _proactiveInsights(CODE, 'm', { audience: 'self', now });
  const top = bucketOf(self, 'needs_attention')[0];
  ok('14 · owner sees the real momentum_drop in "needs attention"', !self.empty && top && top.patternType === 'momentum_drop');
  ok('14 · the risk is projected with polarity=risk in the needs_attention bucket', top && top.polarity === 'risk' && top.bucket === 'needs_attention');
  ok('14 · owner insight keeps its specific, private-to-them basis', top && Array.isArray(top.basis) && top.basis.length > 0);
}
// … and the SAME pattern reaches a LEADER with no number/quote/basis
{
  const lead = _proactiveInsights(CODE, 'lead', { audience: 'leader', subjectId: 'm', now });
  const li = bucketOf(lead, 'needs_attention')[0];
  ok('14 · leader sees the same pattern, directionally', li && li.patternType === 'momentum_drop');
  ok('14 · leader insight leaks no number/quote/basis (audience-safe on real data)', li && proactive.audienceSafe(li).ok && li.basis.length === 0);
  ok('14 · leader gets NO opportunities bucket', !('opportunities' in (lead.groups || {})));
  ok('14 · leader insight is not the owner’s wording', li && li.body !== bucketOf(_proactiveInsights(CODE, 'm', { audience: 'self', now }), 'needs_attention')[0].body);
}

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const tokLead = issueToken('lead', CODE, 'superadmin');
  const tokM    = issueToken('m', CODE, 'member');
  const tokOut  = issueToken('out', CODE, 'member');
  const call = async (path, tok, opts = {}) => {
    const headers = { ...(opts.headers || {}), ...(tok ? { Authorization: `Bearer ${tok}` } : {}) };
    if (opts.body) headers['Content-Type'] = 'application/json';
    const r = await fetch(base + path, { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    let j = null; try { j = await r.json(); } catch (_) {}
    return { status: r.status, j };
  };

  try {
    // 15 · authorization — the endpoints gate exactly like the rest of the OS
    ok('15 · proactive insights require auth (401 without a token)', (await call('/api/proactive/insights', null)).status === 401);
    ok('15 · a member cannot read leader-audience insights about another member',
       (await call('/api/proactive/insights/leader/m', tokOut)).status === 403);
    const leadRead = await call('/api/proactive/insights/leader/m', tokLead);
    ok('15 · an authorised leader can read directional insights', leadRead.status === 200 && flat(leadRead.j).length > 0);
    ok('15 · leader HTTP payload leaks no score', !/\d(?:\.\d)?\s*\/\s*5|\d{1,3}\s*%/.test(JSON.stringify(leadRead.j.groups)));

    // 16 · feedback + suppression close the loop
    const before = JSON.stringify(noticeFeedback[CODE] || {});
    await call('/api/proactive/insights/x/feedback', tokM, { method: 'POST', body: { dedupeKey: 'm:momentum_drop:self', patternType: 'momentum_drop', action: 'not_useful' } });
    ok('16 · not_useful teaches the Confidence Engine (records a dismiss)',
       (noticeFeedback[CODE]?.momentum_drop?.dismiss || 0) >= 1 && JSON.stringify(noticeFeedback[CODE]) !== before);

    await call('/api/proactive/insights/x/feedback', tokM, { method: 'POST', body: { dedupeKey: 'm:momentum_drop:self', action: 'mute' } });
    const afterMute = await call('/api/proactive/insights', tokM);
    ok('16 · mute suppresses THAT insight for THAT person',
       (insightSuppression[`${CODE}:m`] || []).includes('m:momentum_drop:self') &&
       !flat(afterMute.j).some(i => i.dedupeKey === 'm:momentum_drop:self'));

    // 17 · bounded preferences round-trip over HTTP
    const put = await call('/api/proactive/preferences', tokM, { method: 'PUT', body: { preferences: { length: 'brief', tone: 'plain', secret: 'race' } } });
    ok('17 · preferences PUT stores only allow-listed knobs', put.status === 200 && !('secret' in put.j.preferences) && put.j.preferences.length === 'brief');

    // 17b · the proactive OPENING endpoint — grounded, deterministic, numberless
    const openA = await call('/api/assistant/opening', tokM);
    ok('17b · opening requires auth', (await call('/api/assistant/opening', null)).status === 401);
    ok('17b · opening returns a grounded greeting', openA.status === 200 && !!openA.j.opening && /deserves your attention|nothing needs you/i.test(openA.j.opening.greeting));
    ok('17b · opening HTTP payload leaks no score', !/\d(?:\.\d)?\s*\/\s*5|\d{1,3}\s*%/.test(JSON.stringify(openA.j.opening)));

    // 18 · Confidence Engine suppression — an unproven type is stood down, org-wide
    noticeFeedback[CODE] = noticeFeedback[CODE] || {};
    noticeFeedback[CODE].withdrawal = { useful: 0, dismiss: 7 };   // proven unhelpful here
    const stood = _proactiveInsights(CODE, 'm', { audience: 'self', now });
    ok('18 · a proven-unhelpful pattern type is suppressed by the Confidence Engine',
       !flat(stood).some(i => i.patternType === 'withdrawal'));
  } catch (e) { fail++; console.log('  ✗ HTTP suite threw:', e && e.message); }

  server.close();
  console.log(`\nproactive-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
