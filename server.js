require('dotenv').config();
const express   = require('express');
const Anthropic  = require('@anthropic-ai/sdk');
const path      = require('path');
const bcrypt    = require('bcryptjs');
const fs        = require('fs');   // kept for store.json → Postgres one-time migration
const db        = require('./db');

/* ── AI layer (Phase 1) ──────────────────────────────────────────────────────
   One gateway controls model choice / retries / validation; the privacy gate
   enforces "private may inform, never reveal"; lenses shape advice by role. */
const ai         = require('./ai/gateway');
const privacy    = require('./ai/privacy');
const lenses     = require('./ai/lenses');
const valuesLens = require('./ai/values');
const embeddings = require('./ai/embeddings');
const intel      = require('./ai/intelligence');
const baseline   = require('./ai/baseline');
const agents     = require('./ai/agents');
const packs      = require('./ai/packs');
const primitives = require('./ai/primitives');
const confidence = require('./ai/confidence');
const adapters   = require('./ai/adapters');
const connectors = require('./ai/connectors');

const app    = express();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/* ── Process-level crash guards ───────────────────────────────────────────────
   A single unhandled async error should never take the whole server down and
   sign everyone out. Log loudly; keep serving. (DB/boot failures still exit via
   db.js — these guards are for in-flight request bugs.) */
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason && reason.stack ? reason.stack : reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err && err.stack ? err.stack : err);
});

// 25mb so base64 rich-media (images/PDF) in chat/scenarios isn't rejected by the
// default 100kb body limit — a real, silent failure mode for attachments.
app.use(express.json({ limit: '25mb' }));
// Serve static assets, but force browsers to revalidate HTML/JS/CSS on every load
// (etag makes this cheap) so a Render redeploy is picked up on the next refresh
// instead of a stale cached bundle — the cause of "I deployed but nothing changed".
app.use(express.static(path.join(__dirname), {
  setHeaders: (res, filePath) => {
    if (/\.(html|js|css)$/i.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
  },
}));

/* ── Persistence ──────────────────────────────────────────────────────────────
   All in-memory stores are persisted to Neon Postgres (via db.js).
   On startup, data is loaded from Postgres. A one-time migration from
   store.json is performed if Postgres is empty and the file still exists.

   scheduleSave() debounces writes to Postgres (500 ms), same as before.
   ─────────────────────────────────────────────────────────────────────────── */

// Legacy store.json path — used only for the one-time migration at startup.
const DATA_DIR   = process.env.DATA_DIR || path.join(__dirname, 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');

let _saveTimer = null;
function scheduleSave() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(async () => {
    try {
      // Prune expired sessions before saving so the blob doesn't grow unbounded
      const now = Date.now();
      for (const [token, s] of Object.entries(activeSessions)) {
        if (s.expiresAt < now) delete activeSessions[token];
      }
      await db.saveMain({
        orgMeta, orgUsers, inviteTokens, emailIndex, pendingInvites,
        orgGroups, orgNotes, orgMessages, orgStore,
        assignedScenarios, memberResults, memberCheckins,
        memberGoals, weeklyAssessments, orgInterventions,
        orgNodes, orgMetrics, orgValues, orgGoals, userPermissions,
        userAiProfiles, advisorThreads, orgSignals, noticeFeedback,
        userConsents, connectedSources, pendingActions,
        assessmentTemplates, assessmentAssignments, orgTutorials,
        activeSessions,
      });
    } catch(e) { console.error('[db] Save failed:', e.message); }
  }, 500);
}

/* ── Data retention (GDPR storage limitation) ─────────────────────────────────
   Personal signals + check-ins older than the retention window are purged, so we
   don't hold data longer than we need. Default 2 years; set RETENTION_DAYS to
   override. Runs on boot and daily. Only removes OLD data — recent is untouched. */
const RETENTION_DAYS = parseInt(process.env.RETENTION_DAYS, 10) > 0 ? parseInt(process.env.RETENTION_DAYS, 10) : 730;
function _purgeExpired(retentionDays = RETENTION_DAYS) {
  const cutoff = Date.now() - retentionDays * 86400000;
  const keep = ts => { const t = ts ? new Date(ts).getTime() : NaN; return !Number.isFinite(t) || t >= cutoff; };
  let removed = 0;
  for (const code of Object.keys(orgSignals)) {
    if (!Array.isArray(orgSignals[code])) continue;
    const before = orgSignals[code].length;
    orgSignals[code] = orgSignals[code].filter(s => keep(s.ts));
    removed += before - orgSignals[code].length;
  }
  for (const k of Object.keys(memberCheckins)) {
    if (!Array.isArray(memberCheckins[k])) continue;
    const before = memberCheckins[k].length;
    memberCheckins[k] = memberCheckins[k].filter(c => keep(c.ts));
    removed += before - memberCheckins[k].length;
  }
  if (removed) { console.log(`[retention] purged ${removed} record(s) older than ${retentionDays}d`); scheduleSave(); }
  return removed;
}

/* ── Session tokens ───────────────────────────────────────────────────────────
   Persisted to Postgres so tokens survive server restarts (Railway redeploys).
   Expired sessions are pruned before each save and on load.
   24-hour expiry per token.
   ─────────────────────────────────────────────────────────────────────────── */
const activeSessions = {}; // token → { userId, orgCode, role, expiresAt }

const SALT_ROUNDS = 10;

// Detect passwords still stored with the old toy simpleHash (short hex, no $2b$ prefix)
function isLegacyHash(h) { return h && !h.startsWith('$2b$') && !h.startsWith('$2a$'); }

// Legacy hash used only for migration path — new code never calls this for new passwords
function simpleHash(str) { let h = 0; for (const c of str) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h.toString(16); }

/* Directive built from the ORG's values, desired traits and success definition
   (captured at setup, editable in Settings). Prepended to AI system prompts so
   every surface reasons from what the organisation actually values. */
function _worldviewDirective(code) {
  const c = (code || '').toLowerCase();
  const prof = orgMeta[c]?.organizationProfile || {};
  const vals = (orgValues[c] && orgValues[c].length) ? orgValues[c] : (prof.values || []);
  return valuesLens.orgDirective(vals, prof.behaviours || [], prof.successDefinition || '', orgMeta[c]?.orgName);
}

/* Directive built from a MEMBER's own goals/values/growth (member onboarding).
   Used by member-facing AI so responses anchor to what THEY want to become. */
function _memberValuesDirective(code, userId) {
  if (!userId) return '';
  const c = (code || '').toLowerCase();
  const profile = memberGoals[userKey(c, userId)];
  return valuesLens.memberDirective(profile, orgUsers[c]?.[userId]?.name);
}

function issueToken(userId, orgCode, role) {
  const token = generateToken();
  activeSessions[token] = {
    userId, orgCode: (orgCode || '').toLowerCase(), role,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
  };
  scheduleSave(); // persist so this token survives a server restart
  return token;
}

function verifyToken(tokenStr) {
  if (!tokenStr) return null;
  const s = activeSessions[tokenStr];
  if (!s) return null;
  if (s.expiresAt < Date.now()) { delete activeSessions[tokenStr]; return null; }
  return s;
}

// Middleware — applied to endpoints that expose aggregate org data
function requireAuth(req, res, next) {
  const header = (req.headers.authorization || '').replace('Bearer ', '').trim();
  const token  = header || req.query.token || req.body?.token;
  const session = verifyToken(token);
  if (!session) return res.status(401).json({ error: 'Authentication required. Please log in again.' });
  req.iqSession = session;
  next();
}

/* ─── REFLECTION SYSTEM PROMPT ─────────────────────────────────────────── */
function buildReflectionPrompt(orgMode, orgName, orgValues = [], orgMetrics = [], orgProfile = {}) {
  const verticalCtx = {
    school:     'students in a school environment. Academic pressure, peer relationships, behaviour, and moral development are common themes.',
    sports:     'athletes in a sports club. Performance pressure, team dynamics, coaching relationships, and mental resilience are common themes.',
    workplace:  'employees in a workplace. Professional conduct, leadership, team conflict, stress, and work-life balance are common themes.',
    military:   'personnel in a military unit. Discipline, command decisions, ethics under pressure, and stress management are common themes.',
    healthcare: 'healthcare workers. Patient care decisions, ethical dilemmas, burnout, and high-stakes stress are common themes.',
    government: 'government officials and public servants. Policy decisions, integrity, public accountability, and crisis management are common themes.',
  };

  // Prefer rich org description over generic vertical tag
  let contextLine;
  if (orgProfile.orgSummary) {
    contextLine = `You are speaking with members of ${orgName}. About this organisation: ${orgProfile.orgSummary}`;
    if (orgProfile.orgEnvironment)      contextLine += ` Environment: ${orgProfile.orgEnvironment}`;
    if (orgProfile.orgSuccessDefinition) contextLine += ` Success looks like: ${orgProfile.orgSuccessDefinition}`;
  } else if (orgMode && verticalCtx[orgMode]) {
    contextLine = `You are speaking with ${verticalCtx[orgMode]}`;
  } else {
    contextLine = `You are speaking with individuals in a professional or institutional environment.`;
  }

  const valuesLine  = orgValues.length  ? `\nORG VALUES: ${orgValues.join(', ')} — connect your reflections to these where relevant.` : '';
  const metricsLine = orgMetrics.length ? `\nORG PERFORMANCE DIMENSIONS: ${orgMetrics.map(m=>typeof m==='string'?m:m.name).join(', ')} — explore how the member's behaviour connects to these.` : '';

  return `You are the IntelliQ Reflection Assistant — an empathetic, intelligent AI embedded in the IntelliQ platform used by ${orgName}.

${contextLine}${valuesLine}${metricsLine}

YOUR ROLE:
Guide structured post-scenario reflections and standalone check-ins. Help individuals develop genuine self-awareness and understand their decision-making patterns. You are not a therapist — but you are warm, perceptive, and take what people share seriously.

REFLECTION STRUCTURE — move through these phases naturally, don't announce them:
1. Reaction — immediate emotional response
2. Reasoning — unpacking the thinking behind their choices
3. Influences — what shaped their decisions (people, experiences, environment)
4. External — gently checking on life outside this context
5. Closing — a forward-looking takeaway

TONE:
- Conversational, warm, direct. Not clinical or robotic.
- Ask one question at a time.
- Reference what they actually said — never give generic responses.
- Use their name naturally but not excessively.

SAFEGUARDING — MANDATORY — HIGHEST PRIORITY:
You are a mandated reporter. If anything suggests self-harm, suicidal ideation, abuse, threats, feeling unsafe, or severe hopelessness — you MUST:
1. Respond with care, without alarm
2. State that what they shared is important and you are flagging it for a trusted adult
3. Ask if there is someone nearby they feel safe with
4. Include the exact string [[MANDATED_FLAG]] in your response

Catch nuanced language — "I've been in a really dark place" or "I just don't see the point anymore" should trigger this, not only explicit statements.`;
}

/* ─── SCENARIO SYSTEM PROMPT ────────────────────────────────────────────── */
function buildScenarioPrompt(orgMode, orgName, title, context, memberName, difficulty, opening = null, probes = null, orgValues = [], orgMetrics = [], orgProfile = {}) {
  const difficultyNote = {
    easy:   'Start with a clear, straightforward situation. Keep the stakes moderate.',
    medium: 'Present a situation with genuine tension and no obvious right answer.',
    hard:   'Create high-stakes complexity with competing obligations, time pressure, and moral ambiguity.',
  }[difficulty] || 'Present a situation with genuine tension and no obvious right answer.';

  const orgCtxLine = orgProfile.orgSummary
    ? `ORGANISATION: ${orgName} — ${orgProfile.orgSummary}${orgProfile.orgEnvironment ? ' ' + orgProfile.orgEnvironment : ''}`
    : `ORGANISATION: ${orgName}${orgMode ? ' (type: ' + orgMode + ')' : ''}`;

  return `You are the IntelliQ Scenario Facilitator — an intelligent evaluator running a live decision-making assessment in the IntelliQ platform used by ${orgName}.

${orgCtxLine}
You are assessing ${memberName} using a scenario in the domain: "${title}".
SCENARIO CONTEXT: ${context}
DIFFICULTY: ${difficultyNote}
${opening ? `\nAPPROVED OPENING — use this exact opening to begin:\n"${opening}"\n` : ''}
${probes?.length ? `\nAPPROVED PROBE FRAMEWORK — the leader has pre-approved these follow-up angles. Use them as your guide but adapt naturally to what ${memberName} says:\n${probes.map((p, i) => `${i+1}. ${p}`).join('\n')}\n` : ''}
YOUR JOB:
1. ${opening ? `Start with the approved opening above — present it naturally, do not just read it verbatim.` : `Open with a vivid, specific, realistic situation tied to the context above.`}
2. Let ${memberName} respond in their own words.
3. React to what they actually say. ${probes?.length ? `Use the approved probes as your framework.` : `Probe reasoning: "Why that approach?", "What would you do if X changed?", "Who else is affected?"`}
4. Introduce a complication or escalation based on their response — raise the stakes when they handle something well.
5. After 5–7 exchanges you have enough data. Wrap up naturally, then output your scoring.

SCORING — output this when ready (after sufficient exchanges):
Append this block on a new line at the end of your closing message:
[[SCORE:{"ethical_reasoning":75,"stakeholder_awareness":80,"pressure_response":65,"self_awareness":70,"overall":73,"summary":"2-3 sentence honest assessment of their decision-making quality","strengths":["specific strength 1","specific strength 2"],"development":["specific area 1","specific area 2"]}]]

SCORING CRITERIA:
- ethical_reasoning: Did they weigh right/wrong, fairness, duty? Did they justify their choices?
- stakeholder_awareness: Did they consider who else is affected, not just the immediate situation?
- pressure_response: How did they handle complexity, time pressure, or escalation?
- self_awareness: Did they acknowledge uncertainty, reflect on their own role, or show intellectual honesty?
- overall: Weighted composite. Be honest — a 70 earned through genuine reasoning is more valuable than an inflated 90.
- strengths/development: Specific, actionable, tied to what they actually said. Not generic.

SAFEGUARDING — MANDATORY:
If anything suggests self-harm, abuse, threats, or danger — respond with care, include [[MANDATED_FLAG]], ask if they're safe. This overrides the scenario immediately.

TONE:
- Direct and realistic. This is an assessment, not a therapy session.
- Keep scenario descriptions concise — one short paragraph to open, then let them respond.
- React specifically to what they say. No generic follow-up questions.
- Do not reveal the scoring criteria to the member.`;
}

/* ─── CHAT / SCENARIO ENDPOINT ──────────────────────────────────────────── */
app.post('/api/chat', async (req, res) => {
  const {
    messages,
    orgMode,
    orgName,
    orgCode,
    userId,             // optional: member's server userId for memory lookup
    memberName,
    scenarioContext,    // reflection mode: completed scenario summary
    promptType,         // 'reflection' (default) | 'scenario'
    scenarioRunContext, // scenario mode: { title, context, difficulty, opening, probes, image }
  } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  // Load org-specific values, metrics, and profile for prompt enrichment
  const code    = (orgCode || '').toLowerCase();
  const values  = orgValues[code]  || [];
  const metrics = (orgMetrics[code] || []).map(m => m.name || m);
  const orgProfile = orgMeta[code] || {};

  try {
    let systemPrompt;

    if (promptType === 'scenario') {
      const sc = scenarioRunContext || {};
      systemPrompt = buildScenarioPrompt(
        orgMode || orgProfile.orgMode || '',
        orgName  || 'your organisation',
        sc.title || 'Decision Making',
        sc.context || 'A general situational assessment',
        memberName || 'the member',
        sc.difficulty || 'medium',
        sc.opening  || null,
        sc.probes   || null,
        values,
        metrics,
        orgProfile
      );
    } else {
      const memBlock = userId ? _buildMemoryBlock(code, userId) : '';
      systemPrompt = buildReflectionPrompt(orgMode || orgProfile.orgMode || '', orgName || 'your organisation', values, metrics, orgProfile);
      if (memBlock) systemPrompt += memBlock;
      if (scenarioContext) {
        systemPrompt += `\n\nSCENARIO JUST COMPLETED:\nTitle: ${scenarioContext.title}\nScore: ${scenarioContext.score}/100 (${scenarioContext.label})\n`;
        if (scenarioContext.answers?.length) {
          systemPrompt += 'Their answers:\n' + scenarioContext.answers.map((a, i) =>
            `Q${i+1}: "${a.chosen}" — Score: ${a.score}/100`
          ).join('\n');
        }
      }
    }

    // If scenario has an attached image, inject it into the first user message
    const scenarioImage = scenarioRunContext?.image;
    const apiMessages = messages.map((m, i) => {
      if (i === 0 && m.role === 'user' && scenarioImage?.data) {
        return {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: scenarioImage.mediaType || 'image/jpeg', data: scenarioImage.data } },
            { type: 'text', text: m.content },
          ],
        };
      }
      return { role: m.role, content: m.content };
    });

    const response = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system:     systemPrompt,
      messages:   apiMessages,
    });

    const raw = response.content[0]?.text || '';

    // Extract structured score block if present
    const scoreMatch = raw.match(/\[\[SCORE:(\{[\s\S]*?\})\]\]/);
    let scoreData = null;
    if (scoreMatch) {
      try { scoreData = JSON.parse(scoreMatch[1]); } catch(e) { console.warn('Score parse error:', e.message); }
    }

    const mandated = raw.includes('[[MANDATED_FLAG]]');
    const cleaned  = raw
      .replace(/\[\[SCORE:[\s\S]*?\]\]/, '')
      .replace('[[MANDATED_FLAG]]', '')
      .trim();

    res.json({ text: cleaned, mandated, score: scoreData });

  } catch (err) {
    console.error('Anthropic API error:', err.message);
    res.status(500).json({ error: 'AI service unavailable', detail: err.message });
  }
});

/* ─── SCENARIO DRAFT ENDPOINT ──────────────────────────────────────────── */
app.post('/api/draft-scenario', requireAuth, async (req, res) => {
  const { brief, orgMode, orgName, orgCode, memberName, difficulty, image } = req.body;
  if (!brief) return res.status(400).json({ error: 'brief required' });

  const hasImage = image && image.data && image.mediaType;
  const code = (orgCode || req.iqSession?.orgCode || '').toLowerCase();
  const profile = orgMeta[code] || {};

  const orgCtx = profile.orgSummary
    ? `ORGANISATION: ${orgName || profile.orgName || 'an organisation'} — ${profile.orgSummary}`
    : `ORGANISATION TYPE: ${orgMode || profile.orgMode || 'general'}`;

  const systemPrompt = `You are an expert scenario designer for IntelliQ, a performance intelligence platform used by ${orgName || 'an organisation'}.

A leader has written a brief about a member. Your job is to draft a scenario that will be used to assess that member's decision-making, reasoning, and self-awareness.

${orgCtx}
MEMBER: ${memberName || 'the member'}
DIFFICULTY: ${difficulty || 'medium'}
${hasImage ? '\nEvidence has been attached. Build the scenario around what is shown — reference specific elements the member should notice and respond to.' : ''}

OUTPUT FORMAT — respond with valid JSON only, no extra text:
{
  "opening": "The vivid opening situation (2-3 sentences). ${hasImage ? 'Reference the image directly — e.g. \"Take a look at the clip/diagram/sheet below.\" Then set the scene.' : 'Ground it in reality.'} Do not resolve the tension.",
  "probes": [
    "First follow-up — references something specific in the image or brief",
    "Second follow-up — introduces a complication or raises stakes",
    "Third follow-up — tests self-awareness or understanding"
  ],
  "coachNote": "What this scenario is designed to reveal, and what strong vs weak responses look like. 2-3 sentences. Reference the evidence content if relevant.",
  "title": "A short scenario title (3-6 words)"
}

RULES:
- The opening must feel real and specific
- Do not make the right answer obvious
- The probes should escalate
- The coachNote is private — never shown to the member
- Adapt language and context to the organisation type`;

  const userContent = hasImage
    ? [
        { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } },
        { type: 'text', text: `Coach brief: ${brief}` },
      ]
    : `Coach brief: ${brief}`;

  try {
    const response = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 700,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userContent }],
    });

    const raw = response.content[0]?.text || '';
    const jsonStr = raw.replace(/```json\n?|\n?```/g, '').trim();

    let draft;
    try { draft = JSON.parse(jsonStr); }
    catch(e) { return res.status(500).json({ error: 'Draft parse failed', raw }); }

    res.json({ draft });

  } catch (err) {
    console.error('Draft scenario error:', err.message);
    res.status(500).json({ error: 'AI service unavailable', detail: err.message });
  }
});

/* ─── COACH DEBRIEF ENDPOINT ────────────────────────────────────────────── */
app.post('/api/coach-debrief', async (req, res) => {
  const { conversation, scores, memberName, scenarioTitle, orgMode, orgName, coachRole } = req.body;
  if (!conversation || !scores) return res.status(400).json({ error: 'conversation and scores required' });

  const systemPrompt = `You are an expert performance analyst for IntelliQ, used by ${orgName || 'an organisation'}.

You are writing a private debrief for a ${coachRole || 'leader/supervisor'} — NOT for the member. The member will never see this.

Your job: analyse ${memberName}'s responses to the "${scenarioTitle}" scenario and give the leader practical, specific guidance.

ORGANISATION TYPE: ${orgMode || 'general'}

OUTPUT FORMAT — valid JSON only:
{
  "headline": "One sentence summary of the most important thing the leader should know",
  "whatThisReveals": "2-3 sentences on what ${memberName}'s reasoning pattern shows — not just the score, but the WHY behind it. What does this tell you about how they think?",
  "watchFor": ["Specific behaviour or pattern to observe in real situations", "Another thing to monitor"],
  "coachingActions": ["Concrete action the leader can take this week", "A second specific action", "Optional third action"],
  "escalate": false
}

Set "escalate" to true ONLY if the conversation contains anything suggesting the member needs support beyond normal coaching (wellbeing concern, significant distress, safeguarding indicator).

Be honest. Be specific. Reference what ${memberName} actually said. Do not give generic coaching advice.`;

  const conversationText = conversation
    .map(m => `${m.role === 'user' ? memberName : 'AI'}: ${m.content}`)
    .join('\n');

  try {
    const response = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system:     systemPrompt,
      messages:   [{
        role:    'user',
        content: `SCORES: Ethical Reasoning ${scores.ethical_reasoning}, Stakeholder Awareness ${scores.stakeholder_awareness}, Pressure Response ${scores.pressure_response}, Self Awareness ${scores.self_awareness}, Overall ${scores.overall}\n\nCONVERSATION:\n${conversationText}`,
      }],
    });

    const raw     = response.content[0]?.text || '';
    const jsonStr = raw.replace(/```json\n?|\n?```/g, '').trim();

    let debrief;
    try { debrief = JSON.parse(jsonStr); }
    catch(e) { return res.status(500).json({ error: 'Debrief parse failed', raw }); }

    res.json({ debrief });

  } catch (err) {
    console.error('Coach debrief error:', err.message);
    res.status(500).json({ error: 'AI service unavailable', detail: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   AUTH — ORG & USER MANAGEMENT
   ═══════════════════════════════════════════════════════════════════════════ */

// ── In-memory stores — populated from Postgres at startup via _loadAllStores() ──
const orgMeta      = {};  // orgCode → { orgName, orgMode, createdAt }
const orgUsers     = {};  // orgCode → { userId → userObject }
const inviteTokens = {};  // token → { orgCode, role, supervisorId, expiresAt }
const emailIndex   = {};  // email (lowercase) → { orgCode, userId }
const pendingInvites = {}; // token → { email, orgCode, role, ... }

// ── Sprint 2 stores ────────────────────────────────────────────────────────
const orgNodes        = {};  // orgCode → { nodeId → OrgNode }
const orgMetrics      = {};  // orgCode → [{ metricId, name, source, order }]
const orgValues       = {};  // orgCode → [string]
const orgGoals        = {};  // orgCode → [{ goalId, text, createdAt }]
const userPermissions = {};  // orgCode → { userId → { perm → bool } }

// ── Memory Engine ──────────────────────────────────────────────────────────
const userAiProfiles  = {};  // `orgCode:userId` → { openThreads, recentThemes, priorFollowUps, lastUpdated }
// Consent ledger (GDPR): `orgCode:userId` → { [scope]: { granted, at } }. The person
// owns it; drawing external app data is gated on it and it is revocable at any time.
const userConsents    = {};
const connectedSources= {};  // `orgCode:userId` → { [sourceId]: { connectedAt, lastPull } }
const pendingActions  = {};  // `orgCode:userId` → [{ id, action, summary, payload, status, createdAt }]
// Assessments: a leader creates a TEMPLATE (a way they want something done — a
// spreadsheet, film breakdown, a way of playing) and ASSIGNS it. The assignee
// (leader or member) fills it and returns it; the assigner reviews. Tutorials are
// pinned how-to references anyone can look back at. `orgCode` → [ ... ].
const assessmentTemplates   = {};  // [{ id, title, description, kind, fields:[{label,hint}], createdBy, createdByName, createdAt }]
const assessmentAssignments = {};  // [{ id, templateId, title, kind, fields, assignerId/Name, assigneeId/Name, status, response:{}, feedback, score, assignedAt, submittedAt, returnedAt }]
const orgTutorials          = {};  // [{ id, title, body, url, kind, createdBy, createdByName, createdAt }]
const CONSENT_VERSION = '2026-07';
const _consentKey = (code, uid) => `${code}:${uid}`;
function _getConsents(code, uid) { const k = _consentKey(code, uid); return (userConsents[k] = userConsents[k] || {}); }
function _hasConsent(code, uid, scope) { return _getConsents(code, uid)[scope]?.granted === true; }

/* Get or create a user's AI memory profile */
function _getMemory(orgCode, userId) {
  const key = `${orgCode}:${userId}`;
  if (!userAiProfiles[key]) {
    userAiProfiles[key] = {
      openThreads:    [],  // [{ id, text, source, date, occurrences, resolved }]
      recentThemes:   [],  // string[], max 10
      priorFollowUps: [],  // [{ id, commitment, source, date, resolved }]
      focuses:        [],  // [{ id, text, type, status:'active'|'done', outcome, createdAt }] — approved work
      model:          agents.personModel.blankModel(),  // the Person Model (self-owned, categorical tokens only)
      lastUpdated:    null,
    };
  }
  // Back-fill fields for profiles created before they existed.
  if (!userAiProfiles[key].model)   userAiProfiles[key].model   = agents.personModel.blankModel();
  if (!userAiProfiles[key].focuses) userAiProfiles[key].focuses = [];
  return userAiProfiles[key];
}

/* Update memory after a check-in insight or scenario score.
   source: 'checkin' | 'weekly' | 'scenario'
   data: { watchOutFor?, themes?[], development?[], suggestedNextAction? } */
function _updateUserMemory(orgCode, userId, source, data) {
  if (!orgCode || !userId) return;
  const mem = _getMemory(orgCode, userId);
  const today = new Date().toISOString().split('T')[0];
  let changed = false;

  // ── 1. Open threads from watchOutFor ──────────────────────────────────────
  if (data.watchOutFor && typeof data.watchOutFor === 'string') {
    const text = data.watchOutFor.trim();
    if (text && text.toLowerCase() !== 'null') {
      // Check for existing similar thread (simple keyword overlap, 40% threshold)
      const textWords = new Set(text.toLowerCase().split(/\W+/).filter(w => w.length > 3));
      const similar = mem.openThreads.find(t => {
        if (t.resolved) return false;
        const tWords = new Set(t.text.toLowerCase().split(/\W+/).filter(w => w.length > 3));
        const shared = [...textWords].filter(w => tWords.has(w)).length;
        return shared >= Math.ceil(textWords.size * 0.4);
      });
      if (similar) {
        similar.occurrences = (similar.occurrences || 1) + 1;
        similar.date = today;
      } else {
        mem.openThreads.push({
          id:          `${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
          text,
          source,
          date:        today,
          occurrences: 1,
          resolved:    false,
        });
      }
      changed = true;
    }
  }

  // ── 2. Scenario development areas → open threads ──────────────────────────
  if (Array.isArray(data.development)) {
    for (const dev of data.development.slice(0, 3)) {
      if (!dev || typeof dev !== 'string') continue;
      const text = dev.trim();
      const already = mem.openThreads.find(t => !t.resolved && t.text.toLowerCase().includes(text.toLowerCase().slice(0, 30)));
      if (!already) {
        mem.openThreads.push({
          id:          `${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
          text,
          source:      'scenario',
          date:        today,
          occurrences: 1,
          resolved:    false,
        });
        changed = true;
      }
    }
  }

  // ── 3. Recent themes (keywords from watchOutFor + development) ─────────────
  const themeWords = [];
  if (data.watchOutFor) themeWords.push(...data.watchOutFor.toLowerCase().split(/\W+/).filter(w => w.length > 4));
  if (Array.isArray(data.themes)) themeWords.push(...data.themes.map(t => t.toLowerCase().trim()).filter(Boolean));
  if (themeWords.length) {
    for (const word of themeWords) {
      if (!mem.recentThemes.includes(word)) {
        mem.recentThemes.unshift(word);
        changed = true;
      }
    }
    mem.recentThemes = mem.recentThemes.slice(0, 10); // cap at 10
  }

  // ── 4. Prior follow-ups from suggestedNextAction ───────────────────────────
  if (data.suggestedNextAction && typeof data.suggestedNextAction === 'string') {
    const action = data.suggestedNextAction.trim();
    if (action && !mem.priorFollowUps.find(f => !f.resolved && f.commitment === action)) {
      mem.priorFollowUps.push({
        id:         `${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
        commitment: action,
        source,
        date:       today,
        resolved:   false,
      });
      // Cap at 10 unresolved follow-ups
      const unresolved = mem.priorFollowUps.filter(f => !f.resolved);
      if (unresolved.length > 10) {
        const oldest = unresolved.sort((a, b) => a.date.localeCompare(b.date))[0];
        oldest.resolved = true;
      }
      changed = true;
    }
  }

  // ── Person Model: accumulate structured, categorical understanding ────────
  // Only ever categorical tokens (privacy-by-construction). Deterministic and
  // wrapped so it can never break a check-in. Timing = when they engage; an
  // overload/withdrawal read maps to what tends to overwhelm them.
  try {
    const hour = new Date().getHours();
    const timing = hour < 11 ? 'morning' : hour < 16 ? 'midday' : hour < 21 ? 'evening' : 'night';
    const obs = { timing };
    const blob = `${data.watchOutFor || ''} ${(data.themes || []).join(' ')} ${data.suggestedNextAction || ''}`.toLowerCase();
    if (/overload|too much|overwhelm|heavy|burnout|exhaust/.test(blob)) obs.overwhelmers = 'load';
    else if (/isolat|withdraw|alone|disconnect/.test(blob))            obs.overwhelmers = 'isolation';
    else if (/uncertain|unsure|unclear|confus/.test(blob))            obs.overwhelmers = 'uncertainty';
    agents.personModel.update(mem.model || (mem.model = agents.personModel.blankModel()), obs);
    changed = true;
  } catch (_) { /* model update is best-effort; never blocks a check-in */ }

  if (changed) {
    // Cap open threads at 20 (keep most recent unresolved)
    const unresolved = mem.openThreads.filter(t => !t.resolved);
    if (unresolved.length > 20) {
      unresolved.sort((a, b) => a.date.localeCompare(b.date));
      unresolved.slice(0, unresolved.length - 20).forEach(t => { t.resolved = true; });
    }
    mem.lastUpdated = new Date().toISOString();
    scheduleSave();
  }
}

/* Build the memory injection block for AI prompts */
function _buildMemoryBlock(orgCode, userId) {
  const mem = userAiProfiles[`${orgCode}:${userId}`];
  if (!mem) return '';

  const activeThreads  = (mem.openThreads  || []).filter(t => !t.resolved).slice(0, 5);
  const activeFollowUps = (mem.priorFollowUps || []).filter(f => !f.resolved).slice(0, 3);
  const themes          = (mem.recentThemes || []).slice(0, 6);

  if (!activeThreads.length && !activeFollowUps.length && !themes.length) return '';

  const lines = ['MEMBER MEMORY — real observations from prior sessions (only reference if directly relevant):'];
  if (activeThreads.length) {
    lines.push('Recurring themes:');
    activeThreads.forEach(t => {
      const freq = t.occurrences > 1 ? ` (mentioned ${t.occurrences}× — last: ${t.date})` : ` (${t.date})`;
      lines.push(`  - "${t.text}"${freq}`);
    });
  }
  if (activeFollowUps.length) {
    lines.push('Prior follow-ups:');
    activeFollowUps.forEach(f => lines.push(`  - "${f.commitment}" (${f.date}, unresolved)`));
  }
  if (themes.length) {
    lines.push(`Keywords: ${themes.join(', ')}`);
  }
  lines.push('Do not force memory into every response. Reference it only when the member says something that connects naturally.');

  return '\n\n' + lines.join('\n');
}

// Rebuild emailIndex from orgUsers (called after _loadAllStores at startup)
function _rebuildEmailIndex() {
  for (const [orgCode, users] of Object.entries(orgUsers)) {
    for (const [userId, user] of Object.entries(users)) {
      if (user.email) emailIndex[user.email.toLowerCase()] = { orgCode, userId };
    }
  }
}

function generateId()    { return Math.random().toString(36).slice(2,10); }
function generateToken() { return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2); }
function toOrgCode(name) { return name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); }

/* ── Setup new org (first super admin) ─────────────────────────────────── */
app.post('/api/auth/setup-org', async (req, res) => {
  const { orgName, orgMode, adminName, firstName, lastName, email, password } = req.body;
  // Support legacy adminName OR new firstName+lastName
  const fName = (firstName || '').trim();
  const lName = (lastName  || '').trim();
  const fullName = fName && lName ? `${fName} ${lName}` : (adminName || '').trim();
  const emailNorm = (email || '').toLowerCase().trim();

  if (!orgName || !fullName || !password) return res.status(400).json({ error: 'Missing fields: organisation name, admin name and password are required.' });
  if (!emailNorm) return res.status(400).json({ error: 'Email address is required for Super Admin creation.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) return res.status(400).json({ error: 'Please enter a valid email address.' });

  // Global email uniqueness check
  if (emailIndex[emailNorm]) return res.status(400).json({ error: 'An account with this email already exists.' });

  const orgCode = toOrgCode(orgName);
  if (orgUsers[orgCode] && Object.keys(orgUsers[orgCode]).length > 0) {
    return res.status(400).json({ error: 'Organisation already exists. Ask your admin for an invite.' });
  }

  const userId      = generateId();
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  orgMeta[orgCode]  = { orgName, orgMode: orgMode || '', createdAt: new Date().toISOString() };
  orgUsers[orgCode] = {};
  orgUsers[orgCode][userId] = {
    id:           userId,
    firstName:    fName || fullName,
    lastName:     lName || '',
    name:         fullName,
    email:        emailNorm,
    role:         'superadmin',
    orgCode,
    supervisorId: null,
    passwordHash,
    passwordSet:  true,
    status:       'active',
    createdAt:    new Date().toISOString(),
    levelId:      1,
  };
  emailIndex[emailNorm] = { orgCode, userId };
  scheduleSave();

  const token = issueToken(userId, orgCode, 'superadmin');
  res.json({ ok: true, orgCode, userId, orgName, role: 'superadmin', token,
             user: { ...orgUsers[orgCode][userId], passwordHash: undefined } });
});

/* ── Login — email + password only ─────────────────────────────────────── */
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const emailNorm = (email || '').toLowerCase().trim();

  if (!emailNorm) return res.status(400).json({ error: 'Email address is required.' });
  if (!password)  return res.status(400).json({ error: 'Password is required.' });

  const entry = emailIndex[emailNorm];
  if (!entry) return res.status(401).json({ error: 'No account found with that email address.' });

  const code = entry.orgCode;
  const user = orgUsers[code]?.[entry.userId];
  if (!user) return res.status(401).json({ error: 'Account not found. Please contact your admin.' });

  // Lazy bcrypt migration: verify old hash then upgrade
  let passwordValid = false;
  if (isLegacyHash(user.passwordHash)) {
    if (simpleHash(password) === user.passwordHash) {
      passwordValid = true;
      user.passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      scheduleSave();
    }
  } else {
    passwordValid = await bcrypt.compare(password, user.passwordHash);
  }

  if (!passwordValid) return res.status(401).json({ error: 'Email or password incorrect.' });

  const org   = orgMeta[code];
  const token = issueToken(user.id, code, user.role);
  res.json({ ok: true, user: { ...user, passwordHash: undefined }, org, token });
});

/* ── Create user (admin/coach adds someone below them) ─────────────────── */
app.post('/api/auth/create-user', async (req, res) => {
  const { orgCode, creatorId, name, firstName, lastName, email, role, supervisorId, password, group } = req.body;
  const code  = (orgCode || '').toLowerCase();
  const users = orgUsers[code];
  if (!users) return res.status(404).json({ error: 'Org not found' });

  const creator = users[creatorId];
  if (!creator) return res.status(403).json({ error: 'Creator not found' });

  const roleLevel = { superadmin:1, admin:2, coach:3, member:4 };
  // A leader (node / supervisor / group lead) may add plain MEMBERS under
  // themselves even when their own role is 'member' — item C. They cannot create
  // anyone above member, and the new member is forced into their subtree below.
  const leaderAddingMember = role === 'member' && _isLeader(code, creatorId);
  if (roleLevel[role] <= roleLevel[creator.role] && creator.role !== 'superadmin' && !leaderAddingMember) {
    return res.status(403).json({ error: 'You cannot create someone at or above your level' });
  }
  // For non-admin leaders, force placement under themselves so they can never
  // create a user outside their own subtree.
  const isPrivileged = ['superadmin','admin','coach'].includes(creator.role);
  const effectiveSupervisorId = isPrivileged ? (supervisorId || creatorId) : creatorId;

  // Build full name
  const fName = (firstName || '').trim();
  const lName = (lastName  || '').trim();
  const fullName = fName && lName ? `${fName} ${lName}` : (name || '').trim();
  if (!fullName) return res.status(400).json({ error: 'Name is required' });

  const emailNorm = (email || '').toLowerCase().trim();
  if (!emailNorm) return res.status(400).json({ error: 'Email address is required.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (emailIndex[emailNorm]) return res.status(400).json({ error: 'An account with this email already exists.' });

  const exists = Object.values(users).find(u => u.name.toLowerCase() === fullName.toLowerCase());
  if (exists) return res.status(400).json({ error: 'Someone with that name already exists in this org' });

  const userId          = generateId();
  const hasPassword     = !!(password && password.trim());
  // If no password supplied: set a cryptographically random hash so no one can log in
  // with a guessed default. The user must activate via an invite link (passwordSet: false).
  const rawPassword     = hasPassword ? password : (Math.random().toString(36) + Math.random().toString(36));
  const passwordHash    = await bcrypt.hash(rawPassword, SALT_ROUNDS);

  users[userId] = {
    id:           userId,
    firstName:    fName || fullName,
    lastName:     lName || '',
    name:         fullName,
    email:        emailNorm,
    role,
    orgCode:      code,
    supervisorId: effectiveSupervisorId,
    group:        group || '',
    passwordHash,
    passwordSet:  hasPassword,
    status:       'active',
    createdAt:    new Date().toISOString(),
    levelId:      roleLevel[role] || 4,
  };
  emailIndex[emailNorm] = { orgCode: code, userId };
  scheduleSave();

  res.json({ ok: true, user: { ...users[userId], passwordHash: undefined } });
});

/* ── Bulk create (name-only) REMOVED — use bulk-import with email instead ── */
// POST /api/auth/bulk-create was removed in Sprint 2.
// All new users must be created with an email address via /api/auth/create-user
// or imported in bulk via /api/auth/bulk-import (which requires email column).

/* ── Generate invite link ───────────────────────────────────────────────── */
app.post('/api/auth/invite', (req, res) => {
  const { orgCode, role, supervisorId, group, label, usageLimit, expiryDays } = req.body;
  const token = generateToken();
  const days  = Math.min(Math.max(parseInt(expiryDays) || 7, 1), 90);
  inviteTokens[token] = {
    orgCode:    orgCode.toLowerCase(),
    role:       role || 'member',
    supervisorId,
    group:      group || '',
    label:      label || '',
    usageLimit: usageLimit ? parseInt(usageLimit) : null,
    useCount:   0,
    expiresAt:  Date.now() + days * 24 * 60 * 60 * 1000,
    createdAt:  new Date().toISOString(),
  };
  scheduleSave();
  const inviteUrl = `/?invite=${token}`;
  console.log(`[INVITE] token=${token} | url=${inviteUrl} | org=${orgCode} | role=${role || 'member'}`);
  res.json({ ok: true, token, url: inviteUrl });
});

/* ── Validate invite token (no account created — used by registration page) ── */
app.get('/api/auth/invite-info', (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'token required' });
  const invite = inviteTokens[token];
  if (!invite) return res.status(404).json({ error: 'Invalid or expired invite link.' });
  if (invite.expiresAt < Date.now()) return res.status(410).json({ error: 'This invite link has expired.' });
  if (invite.usageLimit && (invite.useCount || 0) >= invite.usageLimit)
    return res.status(410).json({ error: 'This invite link has reached its usage limit.' });
  const org = orgMeta[invite.orgCode];
  res.json({
    ok:      true,
    orgName: org?.orgName || invite.orgCode,
    role:    invite.role,
    group:   invite.group || '',
    email:   invite.email || '',   // prefill if invite was email-targeted
  });
});

/* ── Join via invite ────────────────────────────────────────────────────── */
app.post('/api/auth/join-invite', async (req, res) => {
  const { token, name, firstName, lastName, email, password } = req.body;
  const invite = inviteTokens[token];
  if (!invite) return res.status(404).json({ error: 'Invalid or expired invite link' });
  if (invite.expiresAt < Date.now()) return res.status(410).json({ error: 'Invite link has expired' });
  if (invite.usageLimit && (invite.useCount || 0) >= invite.usageLimit) return res.status(410).json({ error: 'This invite link has reached its usage limit' });

  const code  = invite.orgCode;
  const users = orgUsers[code];
  if (!users) return res.status(404).json({ error: 'Organisation not found' });

  // Build full name
  const fName = (firstName || '').trim();
  const lName = (lastName  || '').trim();
  const fullName = fName && lName ? `${fName} ${lName}` : (name || '').trim();
  if (!fullName) return res.status(400).json({ error: 'Full name is required' });

  // Email: use provided, or fall back to invite-embedded email
  const emailNorm = ((email || invite.email || '')).toLowerCase().trim();
  if (!emailNorm) return res.status(400).json({ error: 'Email address is required.' });
  if (emailIndex[emailNorm]) return res.status(400).json({ error: 'An account with this email already exists. Please log in instead.' });

  const exists = Object.values(users).find(u => u.name.toLowerCase() === fullName.toLowerCase());
  if (exists) return res.status(400).json({ error: 'That name is already taken in this org' });

  const roleLevel   = { superadmin:1, admin:2, coach:3, member:4 };
  const userId      = generateId();
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  users[userId] = {
    id: userId,
    firstName:    fName || fullName,
    lastName:     lName || '',
    name:         fullName,
    email:        emailNorm,
    role:         invite.role,
    orgCode:      code,
    supervisorId: invite.supervisorId,
    group:        invite.group || '',
    passwordHash,
    passwordSet:  true,
    status:       'active',
    createdAt:    new Date().toISOString(),
    levelId:      roleLevel[invite.role] || 4,
  };
  emailIndex[emailNorm] = { orgCode: code, userId };

  // Auto-add to group if specified
  if (invite.group && orgGroups[code]) {
    const gObj = orgGroups[code].find(g => g.name.toLowerCase() === (invite.group || '').toLowerCase());
    if (gObj && !gObj.memberIds.includes(userId)) gObj.memberIds.push(userId);
  }
  invite.useCount = (invite.useCount || 0) + 1;
  scheduleSave();

  const org   = orgMeta[code];
  const tkn   = issueToken(userId, code, invite.role);
  res.json({ ok: true, user: { ...users[userId], passwordHash: undefined }, org, token: tkn });
});

/* ── Get current user profile ───────────────────────────────────────────── */
app.get('/api/auth/me', (req, res) => {
  const header  = (req.headers.authorization || '').replace('Bearer ', '').trim();
  const token   = header || req.query.token;
  const session = verifyToken(token);
  if (!session) return res.status(401).json({ error: 'Authentication required.' });

  const user = orgUsers[session.orgCode]?.[session.userId];
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const org = orgMeta[session.orgCode];

  // Unified permission resolution (role defaults → leader grants → explicit).
  // `leads` tells the client whether to show the Leader Workspace, and is true
  // for node leaders, supervisor-tree leaders, AND group leads — see _isLeader.
  const permissions = _effectivePermissions(session.orgCode, session.userId);
  const leads       = _isLeader(session.orgCode, session.userId);

  res.json({ ok: true, user: { ...user, passwordHash: undefined, leads }, org, permissions });
});

/* ── Permission defaults by role (fallback when no explicit grant) ───────── */
function _resolveRoleDefaults(role) {
  const d = {
    superadmin: {
      view_members: true, edit_members: true, delete_members: true,
      view_analytics: true, manage_metrics: true, manage_values: true,
      manage_goals: true, manage_tree: true, manage_permissions: true,
      assign_scenarios: true, view_reports: true, manage_settings: true,
      // Phase 1: leader layer permissions
      view_team: true, review_checkins: true, view_insights: true,
    },
    admin: {
      view_members: true, edit_members: true, delete_members: false,
      view_analytics: true, manage_metrics: true, manage_values: true,
      manage_goals: true, manage_tree: true, manage_permissions: false,
      assign_scenarios: true, view_reports: true, manage_settings: false,
      // Phase 1: leader layer permissions
      view_team: true, review_checkins: true, view_insights: true,
    },
    coach: {
      view_members: true, edit_members: false, delete_members: false,
      view_analytics: true, manage_metrics: false, manage_values: false,
      manage_goals: false, manage_tree: false, manage_permissions: false,
      assign_scenarios: true, view_reports: true, manage_settings: false,
      // Phase 1: leader layer — coaches can see their team and assign
      view_team: true, review_checkins: true, view_insights: true,
    },
    member: {
      view_members: false, edit_members: false, delete_members: false,
      view_analytics: false, manage_metrics: false, manage_values: false,
      manage_goals: false, manage_tree: false, manage_permissions: false,
      assign_scenarios: false, view_reports: false, manage_settings: false,
      // Phase 1: members never see the leader layer
      view_team: false, review_checkins: false, view_insights: false,
    },
  };
  return d[role] || d.member;
}

/* ── Permission middleware factory ──────────────────────────────────────── */
function requirePermission(perm) {
  return (req, res, next) => {
    const header  = (req.headers.authorization || '').replace('Bearer ', '').trim();
    const session = verifyToken(header || req.query.token);
    if (!session) return res.status(401).json({ error: 'Authentication required.' });

    const user = orgUsers[session.orgCode]?.[session.userId];
    if (!user) return res.status(401).json({ error: 'User not found.' });

    // SuperAdmin bypasses all permission checks
    if (user.role === 'superadmin') { req.iqSession = session; return next(); }

    const allowed = _effectivePermissions(session.orgCode, session.userId)[perm] === true;

    if (!allowed) return res.status(403).json({ error: `Permission denied: ${perm}` });
    req.iqSession = session;
    next();
  };
}

/* ── Get org hierarchy tree ─────────────────────────────────────────────── */
app.get('/api/auth/org-tree', requireAuth, (req, res) => {
  // SECURITY: was unauthenticated — anyone who knew an org code could enumerate
  // the whole member directory (names, emails, roles). Now requires auth and is
  // scoped to the caller's own org from the session. Fixed 2026-07-09.
  const code  = req.iqSession.orgCode;
  if (!code) return res.status(403).json({ error: 'Forbidden' });
  const users = orgUsers[code];
  if (!users) return res.status(404).json({ error: 'Org not found' });

  const all  = Object.values(users).map(u => ({ ...u, passwordHash: undefined, children: [] }));
  const byId = {};
  all.forEach(u => byId[u.id] = u);

  const roots = [];
  all.forEach(u => {
    if (!u.supervisorId || !byId[u.supervisorId]) roots.push(u);
    else byId[u.supervisorId].children.push(u);
  });

  res.json({ ok: true, tree: roots, flat: all });
});

/* ── Update user ────────────────────────────────────────────────────────── */
app.put('/api/auth/update-user', async (req, res) => {
  const { orgCode, userId, updates } = req.body;
  const code  = (orgCode||'').toLowerCase();
  const users = orgUsers[code];
  if (!users || !users[userId]) return res.status(404).json({ error: 'User not found' });
  const safe = ['name','firstName','lastName','role','supervisorId','group','status'];
  safe.forEach(k => { if (updates[k] !== undefined) users[userId][k] = updates[k]; });
  // Recompute name if first/last changed
  if ((updates.firstName || updates.lastName) && !updates.name) {
    users[userId].name = `${users[userId].firstName || ''} ${users[userId].lastName || ''}`.trim();
  }
  // Email update: check uniqueness, update index
  if (updates.email) {
    const newEmail = updates.email.toLowerCase().trim();
    const oldEmail = users[userId].email;
    if (newEmail !== oldEmail) {
      if (emailIndex[newEmail]) return res.status(400).json({ error: 'Email already in use.' });
      if (oldEmail) delete emailIndex[oldEmail];
      emailIndex[newEmail] = { orgCode: code, userId };
      users[userId].email = newEmail;
    }
  }
  if (updates.password) users[userId].passwordHash = await bcrypt.hash(updates.password, SALT_ROUNDS);
  scheduleSave();
  res.json({ ok: true, user: { ...users[userId], passwordHash: undefined } });
});

/* ── Remove person — full cleanup ───────────────────────────────────────── */
//
//  DELETE /api/auth/users/:userId
//  DELETE /api/auth/users/:userId?deleteData=true   (also wipes historical data)
//
//  Cleans:
//    orgUsers  · emailIndex  · inviteTokens  · pendingInvites
//    orgNodes memberIds/leaderIds  · orgGroups memberIds/leadIds
//    userPermissions
//
//  With ?deleteData=true also cleans:
//    memberGoals · memberCheckins · weeklyAssessments
//    memberResults · assignedScenarios
//
function _removePerson(code, userId, deleteData) {
  const users = orgUsers[code];
  if (!users || !users[userId]) return { ok: false, error: 'User not found' };

  const user  = users[userId];
  const email = (user.email || '').toLowerCase();
  const name  = user.name  || '';

  // 1. Remove from emailIndex
  if (email && emailIndex[email]) delete emailIndex[email];

  // 2. Remove invite tokens linked to this org + email
  Object.keys(inviteTokens).forEach(token => {
    const t = inviteTokens[token];
    if (t.orgCode === code && (t.label === email || t.email === email)) {
      delete inviteTokens[token];
    }
  });

  // 3. Remove pendingInvites linked to this org + email
  Object.keys(pendingInvites).forEach(k => {
    const p = pendingInvites[k];
    if (p.orgCode === code && p.email === email) delete pendingInvites[k];
  });

  // 4. Remove from all org tree nodes (memberIds and leaderIds)
  const nodes = orgNodes[code] || {};
  Object.values(nodes).forEach(node => {
    if (node.memberIds) node.memberIds = node.memberIds.filter(id => id !== userId);
    if (node.leaderIds) node.leaderIds = node.leaderIds.filter(id => id !== userId);
  });

  // 5. Remove from all groups (memberIds and leadIds)
  const groups = orgGroups[code] || [];
  groups.forEach(g => {
    if (g.memberIds) g.memberIds = g.memberIds.filter(id => id !== userId && id !== name);
    if (g.leadIds)   g.leadIds   = g.leadIds.filter(id   => id !== userId && id !== name);
  });

  // 6. Remove explicit permissions
  if (userPermissions[code]) delete userPermissions[code][userId];

  // 7. Remove user record itself
  delete users[userId];

  // 8. Hard-delete ALL of this person's data (GDPR Art 17 — right to erasure).
  //    Must leave NO orphaned personal data anywhere, including the raw check-in
  //    text in signals, the AI memory/Person Model, notes, and messages.
  if (deleteData) {
    const uKey = userKey(code, userId);
    const mKey = memberKey(code, name);
    [uKey, mKey].forEach(k => {
      delete memberGoals[k];
      delete memberCheckins[k];
      delete memberResults[k];
      delete assignedScenarios[k];
    });
    // AI memory + Person Model (derived personal data, may hold raw threads)
    delete userAiProfiles[uKey];
    delete userAiProfiles[mKey];
    // Signals — contain raw check-in text (sensitive). Remove any about or by them.
    if (Array.isArray(orgSignals[code])) {
      orgSignals[code] = orgSignals[code].filter(s => s.subjectId !== userId && s.createdBy !== userId);
    }
    // Notes authored by them (incl. private content)
    Object.keys(orgNotes).forEach(id => {
      const n = orgNotes[id];
      if (n && n.orgCode === code && n.authorId === userId) delete orgNotes[id];
    });
    // Messages they sent
    Object.keys(orgMessages).forEach(id => {
      const m = orgMessages[id];
      if (m && m.orgCode === code && (m._realFromId === userId || m.fromId === userId)) delete orgMessages[id];
    });
    // Weekly assessments are keyed by week, not user — filter each week's entries.
    Object.keys(weeklyAssessments).forEach(wk => {
      if (!wk.startsWith(code + ':')) return;
      weeklyAssessments[wk] = (weeklyAssessments[wk] || []).filter(e =>
        e.memberId !== userId && (e.memberName || '').toLowerCase() !== name.toLowerCase());
    });
    // Advisor threads about them
    if (advisorThreads && typeof advisorThreads === 'object') {
      Object.keys(advisorThreads).forEach(k => {
        if (k === uKey || k === mKey || k.startsWith(`${code}:${userId}`)) delete advisorThreads[k];
      });
    }
    // Consent ledger, connected sources, pending assistant actions
    [uKey, mKey].forEach(k => { delete userConsents[k]; delete connectedSources[k]; delete pendingActions[k]; });
    // Assessments they authored or that were assigned to them (may hold their work)
    if (Array.isArray(assessmentTemplates[code]))
      assessmentTemplates[code] = assessmentTemplates[code].filter(t => t.createdBy !== userId);
    if (Array.isArray(assessmentAssignments[code]))
      assessmentAssignments[code] = assessmentAssignments[code].filter(a => a.assigneeId !== userId && a.assignerId !== userId);
    if (Array.isArray(orgTutorials[code]))
      orgTutorials[code] = orgTutorials[code].filter(t => t.createdBy !== userId);
  }

  return { ok: true };
}

app.delete('/api/auth/users/:userId', requirePermission('delete_members'), (req, res) => {
  const code       = req.iqSession.orgCode;
  const { userId } = req.params;
  const deleteData = req.query.deleteData === 'true';

  const result = _removePerson(code, userId, deleteData);
  if (!result.ok) return res.status(404).json(result);
  scheduleSave();
  res.json({ ok: true, deleteData });
});

/* ── Legacy delete-user endpoint — forwards to _removePerson ────────────── */
app.delete('/api/auth/delete-user', requireAuth, (req, res) => {
  const { orgCode, userId } = req.body;
  const code   = (orgCode || req.iqSession?.orgCode || '').toLowerCase();
  const result = _removePerson(code, userId, false);
  if (!result.ok) return res.status(404).json(result);
  scheduleSave();
  res.json({ ok: true });
});

/* ── Complete member profile (first-login onboarding) ──────────────────── *
 *  POST /api/auth/complete-profile
 *  Body: { mainGoals, longTermGoals, strengths, improvementAreas,
 *          selectedValues[], personalMetrics[], freeText }
 *  Sets profileComplete = true on the user record.
 *  Also stores the profile data in memberGoals[userKey] for use by IntelliQ.
 * ─────────────────────────────────────────────────────────────────────────── */
app.post('/api/auth/complete-profile', requireAuth, (req, res) => {
  const { orgCode: _c, userId: _u, ...body } = req.body;
  const code   = req.iqSession.orgCode;
  const userId = req.iqSession.userId;
  const user   = orgUsers[code]?.[userId];
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Repair path (login re-sync of an already-complete profile): just re-affirm
  // completion — never re-validate or overwrite the existing goals/values.
  if (req.body?.repair === true) {
    user.profileComplete = true;
    scheduleSave();
    return res.json({ ok: true, user: { ...user, passwordHash: undefined } });
  }

  const {
    mainGoals        = '',
    longTermGoals    = '',
    strengths        = '',
    improvementAreas = '',
    selectedValues   = [],
    personalMetrics  = [],
    freeText         = '',
  } = req.body;

  // Required anchors — a member needs a goal + at least one value.
  const _mv = (Array.isArray(selectedValues) ? selectedValues : []).map(v => String(v).trim()).filter(Boolean);
  if (!String(mainGoals || '').trim()) return res.status(400).json({ error: 'A main goal is required.' });
  if (_mv.length < 1)                  return res.status(400).json({ error: 'At least one value is required.' });

  // Store profile data in memberGoals — extends existing structure
  const key = userKey(code, userId);
  memberGoals[key] = {
    ...(memberGoals[key] || {}),
    goal:             mainGoals,       // primary "goal" field used by IntelliQ chat prompts
    identity:         longTermGoals,   // "who they want to become" → maps to long-term vision
    mainGoals,
    longTermGoals,
    strengths,
    improvementAreas,
    selectedValues:   Array.isArray(selectedValues)  ? selectedValues  : [],
    personalMetrics:  Array.isArray(personalMetrics) ? personalMetrics : [],
    freeText,
    memberName: user.name,
    setAt:      new Date().toISOString(),
  };

  // Mark profile complete on the user record
  user.profileComplete = true;
  scheduleSave();

  res.json({ ok: true, user: { ...user, passwordHash: undefined } });
});

/* ── Complete organisation profile (SuperAdmin Layer 1 onboarding) ─────── *
 *  POST /api/auth/complete-org-profile                                       *
 *  Requires SuperAdmin. Saves org profile, sets organizationProfileComplete. *
 * ─────────────────────────────────────────────────────────────────────────── */
app.post('/api/auth/complete-org-profile', requireAuth, (req, res) => {
  const code   = req.iqSession.orgCode;
  const userId = req.iqSession.userId;
  const user   = orgUsers[code]?.[userId];
  const org    = orgMeta[code];

  if (!org)  return res.status(404).json({ error: 'Organisation not found' });
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.role !== 'superadmin') return res.status(403).json({ error: 'Only Super Admins can complete the organisation profile' });

  const {
    description       = '',
    values            = [],
    goals             = [],
    successDefinition = '',
    behaviours        = [],
    metrics           = [],
  } = req.body;

  // Required anchors — the AI reasons from these; an org can't finish without them.
  const _vals  = (Array.isArray(values) ? values : []).map(v => String(v).trim()).filter(Boolean);
  const _goals = (Array.isArray(goals)  ? goals  : []).map(g => String(g).trim()).filter(Boolean);
  if (_vals.length < 1)  return res.status(400).json({ error: 'At least one core value is required.' });
  if (_goals.length < 1) return res.status(400).json({ error: 'At least one organisation goal is required.' });

  // Save org profile — fully human-approved, nothing auto-locked
  org.organizationProfile = {
    description,
    values:            Array.isArray(values)      ? values      : [],
    goals:             Array.isArray(goals)        ? goals        : [],
    successDefinition,
    behaviours:        Array.isArray(behaviours)   ? behaviours   : [],
    metrics:           Array.isArray(metrics)      ? metrics      : [],
    setAt: new Date().toISOString(),
    setBy: userId,
  };
  org.organizationProfileComplete = true;

  // Flow the approved profile into the LIVE stores the app + AI actually read,
  // so values/goals/metrics set at creation reach the Advisor, Copilot, etc.
  const profile = org.organizationProfile;
  if (profile.values.length) orgValues[code] = [...profile.values];
  if (profile.goals.length && !(orgGoals[code] && orgGoals[code].length)) {
    orgGoals[code] = profile.goals.map(g => ({ goalId: 'g_' + generateId(), text: String(g), createdAt: new Date().toISOString() }));
  }
  if (profile.metrics.length && !(orgMetrics[code] && orgMetrics[code].length)) {
    orgMetrics[code] = profile.metrics.map((m, i) => ({ metricId: 'm_' + generateId(), name: String(m), source: 'org', order: i }));
  }

  scheduleSave();
  res.json({ ok: true, org: { ...org } });
});

/* ── AI suggestions for org setup wizard ─────────────────────────────────── *
 *  POST /api/org-setup/suggest                                                *
 *  Body: { description, orgName }                                             *
 *  Returns: { values[], goals[], successDefinition, behaviours[], metrics[] } *
 * ─────────────────────────────────────────────────────────────────────────── */
app.post('/api/org-setup/suggest', requireAuth, async (req, res) => {
  const { description = '', orgName = '' } = req.body;
  if (!description || description.trim().length < 10) {
    return res.status(400).json({ error: 'Organisation description is required.' });
  }

  const systemPrompt = `You are an organisational intelligence assistant helping a Super Admin set up their IntelliQ platform.
Your job is to analyse the organisation description and suggest appropriate values, goals, success criteria, expected behaviours, and metrics.
Keep suggestions professional, generic (not sports-specific or school-specific unless the description says so), actionable, and concise.
Return ONLY valid JSON — no markdown, no explanation, no extra text.`;

  const userPrompt = `Organisation name: ${orgName || 'Not specified'}
Description: ${description.trim()}

Based on this, suggest:
- 4-6 core organisational VALUES (single words or short phrases)
- 3-5 primary GOALS for the organisation (action-oriented sentences)
- A SUCCESS DEFINITION (1-2 sentences describing what success looks like)
- 4-6 expected BEHAVIOURS from members (short phrases)
- 4-6 HEALTH METRICS to track (short metric names like "Engagement Score")

Return exactly this JSON shape:
{
  "values": ["...", "..."],
  "goals": ["...", "..."],
  "successDefinition": "...",
  "behaviours": ["...", "..."],
  "metrics": ["...", "..."]
}`;

  try {
    const response = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 800,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userPrompt }],
    });

    const raw = response.content?.[0]?.text || '{}';
    let parsed;
    try {
      // Strip any accidental markdown fences
      const cleaned = raw.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();
      parsed = JSON.parse(cleaned);
    } catch(e) {
      console.error('[org-setup/suggest] JSON parse failed:', raw);
      return res.status(500).json({ error: 'AI returned malformed data — please try again or fill in manually.' });
    }

    res.json({
      values:            Array.isArray(parsed.values)      ? parsed.values      : [],
      goals:             Array.isArray(parsed.goals)        ? parsed.goals        : [],
      successDefinition: typeof parsed.successDefinition === 'string' ? parsed.successDefinition : '',
      behaviours:        Array.isArray(parsed.behaviours)   ? parsed.behaviours   : [],
      metrics:           Array.isArray(parsed.metrics)      ? parsed.metrics      : [],
    });
  } catch(err) {
    console.error('[org-setup/suggest] Anthropic error:', err.message);
    res.status(500).json({ error: 'AI service unavailable — please fill in the fields manually.' });
  }
});

/* ── Set member password (first-login flow) ─────────────────────────────── */
app.post('/api/auth/set-password', async (req, res) => {
  const { orgCode, userId, currentPassword, newPassword } = req.body;

  // ── Token-only path: unified app sends a Bearer token, no currentPassword needed
  //    Allowed only when passwordSet === false (first-login).
  const authHeader = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (authHeader) {
    const session = verifyToken(authHeader);
    if (!session) return res.status(401).json({ error: 'Invalid or expired token' });
    const user = orgUsers[session.orgCode]?.[session.userId];
    if (!user) return res.status(404).json({ error: 'User not found' });
    // Only allow skipping current-password check when password was never set
    if (user.passwordSet !== false) return res.status(403).json({ error: 'Current password required' });
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Password must be 6+ characters' });
    user.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    user.passwordSet  = true;
    scheduleSave();
    const token = issueToken(session.userId, session.orgCode, user.role);
    return res.json({ ok: true, token });
  }

  // ── Legacy path: orgCode + userId + currentPassword (platform set-password form)
  const code  = (orgCode || '').toLowerCase();
  const users = orgUsers[code];
  if (!users || !users[userId]) return res.status(404).json({ error: 'User not found' });

  const user = users[userId];

  // Verify current password (supports legacy hash migration)
  let valid = false;
  if (isLegacyHash(user.passwordHash)) {
    valid = simpleHash(currentPassword) === user.passwordHash;
  } else {
    valid = await bcrypt.compare(currentPassword, user.passwordHash);
  }
  if (!valid) return res.status(401).json({ error: 'Current password incorrect' });

  user.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  user.passwordSet  = true;
  scheduleSave();

  const token = issueToken(userId, code, user.role);
  res.json({ ok: true, token });
});

/* ═══════════════════════════════════════════════════════════════════════════
   SPRINT 2 — ORG TREE
   Flat node store reconstructed as tree by parentId.
   Node: { nodeId, name, description, parentId, childNodeIds, memberIds, leaderIds, createdAt, updatedAt }
   User records carry derived caches kept in sync by _syncUserNodeArrays():
     user.assignedNodeIds    — nodeIds where this user appears in node.memberIds
     user.leadershipNodeIds  — nodeIds where this user appears in node.leaderIds
   ═══════════════════════════════════════════════════════════════════════════ */

app.get('/api/tree', requireAuth, (req, res) => {
  const code  = req.iqSession.orgCode;
  const nodes = Object.values(orgNodes[code] || {});
  res.json({ ok: true, nodes });
});

app.post('/api/tree/node', requirePermission('manage_tree'), (req, res) => {
  const code = req.iqSession.orgCode;
  const { name, parentId, description } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  if (!orgNodes[code]) orgNodes[code] = {};
  const nodeId = 'nd_' + generateId();
  const now    = new Date().toISOString();
  orgNodes[code][nodeId] = {
    nodeId,
    name:        name.trim(),
    description: (description || '').trim(),
    parentId:    parentId || null,
    childNodeIds: [],
    memberIds:   [],
    leaderIds:   [],
    createdAt:   now,
    updatedAt:   now,
  };
  // Add to parent's childNodeIds
  if (parentId && orgNodes[code][parentId]) {
    if (!orgNodes[code][parentId].childNodeIds) orgNodes[code][parentId].childNodeIds = [];
    orgNodes[code][parentId].childNodeIds.push(nodeId);
    orgNodes[code][parentId].updatedAt = now;
  }
  scheduleSave();
  res.json({ ok: true, node: orgNodes[code][nodeId] });
});

app.put('/api/tree/node/:nodeId', requirePermission('manage_tree'), (req, res) => {
  const code   = req.iqSession.orgCode;
  const nodeId = req.params.nodeId;
  const node   = orgNodes[code]?.[nodeId];
  if (!node) return res.status(404).json({ error: 'Node not found' });
  const { name, description, parentId, memberIds, leaderIds } = req.body;
  const now = new Date().toISOString();
  if (name        !== undefined) node.name        = name.trim();
  if (description !== undefined) node.description = description.trim();
  // Sync user arrays before and after membership changes
  const oldMemberIds = [...(node.memberIds || [])];
  const oldLeaderIds = [...(node.leaderIds || [])];
  if (memberIds !== undefined) node.memberIds = memberIds;
  if (leaderIds !== undefined) node.leaderIds = leaderIds;
  if (memberIds !== undefined || leaderIds !== undefined) {
    _syncUserNodeArrays(code, nodeId, oldMemberIds, node.memberIds, oldLeaderIds, node.leaderIds);
  }
  // Handle reparenting
  if (parentId !== undefined && parentId !== node.parentId) {
    // Remove from old parent
    if (node.parentId && orgNodes[code][node.parentId]) {
      const op = orgNodes[code][node.parentId];
      op.childNodeIds = (op.childNodeIds || []).filter(id => id !== nodeId);
      op.updatedAt = now;
    }
    // Add to new parent
    if (parentId && orgNodes[code][parentId]) {
      if (!orgNodes[code][parentId].childNodeIds) orgNodes[code][parentId].childNodeIds = [];
      orgNodes[code][parentId].childNodeIds.push(nodeId);
      orgNodes[code][parentId].updatedAt = now;
    }
    node.parentId = parentId || null;
  }
  node.updatedAt = now;
  scheduleSave();
  res.json({ ok: true, node });
});

app.delete('/api/tree/node/:nodeId', requirePermission('manage_tree'), (req, res) => {
  const code   = req.iqSession.orgCode;
  const nodeId = req.params.nodeId;
  const node   = orgNodes[code]?.[nodeId];
  if (!node) return res.status(404).json({ error: 'Node not found' });
  const now = new Date().toISOString();
  // Remove nodeId from user caches before deleting
  _syncUserNodeArrays(code, nodeId, node.memberIds || [], [], node.leaderIds || [], []);
  // Remove from parent
  if (node.parentId && orgNodes[code][node.parentId]) {
    const p = orgNodes[code][node.parentId];
    p.childNodeIds = (p.childNodeIds || []).filter(id => id !== nodeId);
    p.updatedAt = now;
  }
  // Reparent children to deleted node's parent
  (node.childNodeIds || []).forEach(childId => {
    if (orgNodes[code][childId]) {
      orgNodes[code][childId].parentId  = node.parentId;
      orgNodes[code][childId].updatedAt = now;
    }
  });
  delete orgNodes[code][nodeId];
  scheduleSave();
  res.json({ ok: true });
});

/* ═══════════════════════════════════════════════════════════════════════════
   PHASE 2 — VISIBILITY ENGINE
   Core rule:
     · Permissions decide WHAT a user can do.
     · Org tree position decides WHO a user can see.
   Enforced server-side only — clients never receive hidden users.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── Leader grants — the scoped permission set a leader receives ─────────────
   Applied to anyone detected as a leader (see _isLeader), on top of their role
   defaults. Deliberately does NOT include org-wide admin powers (manage_*,
   delete_members, manage_settings) — leaders manage their subtree, not the org. */
const LEADER_GRANTS = {
  view_team:        true,
  review_checkins:  true,
  view_insights:    true,
  assign_scenarios: true,
  view_reports:     true,
  view_members:     true,
};

/* ── _isLeader — robust leadership detection across all three structures ──────
   A user is a leader if ANY of these hold:
     1. they lead >=1 org node   (orgNodes[].leaderIds / user.leadershipNodeIds)
     2. they supervise >=1 user  (legacy supervisorId tree)
     3. they lead >=1 group      (orgGroups[].leadIds)
     4. they SIT IN A NODE THAT HAS SUB-NODES (hierarchy leadership) — i.e. their
        node tier is above another. This makes the tree intuitive: a person in
        "Coach" (which has child "Player") leads the Player branch automatically,
        without anyone having to tick a separate "leader" box.
   This is what fixes "I'm a leader but the app treats me as a member": node
   leaderIds are only ever set by manually editing a node, so orgs built via
   onboarding (which sets supervisorId) were never recognized as having leaders. */
function _isLeader(orgCode, userId) {
  const user = orgUsers[orgCode]?.[userId];
  if (!user) return false;
  if ((user.leadershipNodeIds || []).length) return true;
  const users = orgUsers[orgCode] || {};
  if (Object.values(users).some(u => u.id !== userId && u.supervisorId === userId)) return true;
  if ((orgGroups[orgCode] || []).some(g => (g.leadIds || []).includes(userId))) return true;
  if (_leadsViaHierarchy(orgCode, userId)) return true;
  return false;
}

/* A user leads via hierarchy if any node they belong to (member or leader) has
   at least one sub-node beneath it — their tier sits above another. */
function _leadsViaHierarchy(orgCode, userId) {
  const nodes = orgNodes[orgCode] || {};
  for (const nid of getUserNodeIds(orgCode, userId)) {
    if ((nodes[nid]?.childNodeIds || []).length) return true;
  }
  return false;
}

/* ── _effectivePermissions — single source of truth for what a user can do ────
   roleDefaults -> leader grants (if a leader) -> explicit per-user overrides.
   Used by /api/auth/me, _userHasPerm, and requirePermission so the client and
   the server can never disagree about a user's permissions. */
function _effectivePermissions(orgCode, userId) {
  const user = orgUsers[orgCode]?.[userId];
  if (!user) return {};
  const roleDefaults = _resolveRoleDefaults(user.role);
  const leaderGrants = _isLeader(orgCode, userId) ? LEADER_GRANTS : {};
  const explicit     = userPermissions[orgCode]?.[userId] || {};
  return { ...roleDefaults, ...leaderGrants, ...explicit };
}

/* ── Internal: resolve a single permission for any user ─────────────────── */
function _userHasPerm(orgCode, userId, perm) {
  const user = orgUsers[orgCode]?.[userId];
  if (!user) return false;
  if (user.role === 'superadmin') return true;
  return _effectivePermissions(orgCode, userId)[perm] === true;
}

/* ── Get all node IDs where a user appears (as member OR leader) ────────── */
function getUserNodeIds(orgCode, userId) {
  const nodes = orgNodes[orgCode] || {};
  return Object.values(nodes)
    .filter(n =>
      (n.memberIds || []).includes(userId) ||
      (n.leaderIds || []).includes(userId)
    )
    .map(n => n.nodeId);
}

/* ── Collect a node + all descendant node IDs (BFS, cycle-safe) ─────────── */
function getDescendantNodeIds(orgCode, rootNodeId) {
  const nodes   = orgNodes[orgCode] || {};
  const visited = new Set();
  const queue   = [rootNodeId];
  while (queue.length) {
    const curr = queue.shift();
    if (visited.has(curr)) continue;
    visited.add(curr);
    const node = nodes[curr];
    if (node?.childNodeIds) node.childNodeIds.forEach(c => queue.push(c));
  }
  return [...visited];
}

/* ── Sync user.assignedNodeIds / user.leadershipNodeIds on node membership changes ──
 *  Called whenever memberIds or leaderIds on a node change (PUT or DELETE).
 *  Keeps the per-user cached arrays in sync with the node stores so that
 *  getVisibleUserIds() can use O(1) lookups instead of full scans.
 * ──────────────────────────────────────────────────────────────────────── */
function _syncUserNodeArrays(orgCode, nodeId, oldMemberIds, newMemberIds, oldLeaderIds, newLeaderIds) {
  const users = orgUsers[orgCode];
  if (!users) return;
  const add    = (arr, id) => { if (!arr.includes(id)) arr.push(id); };
  const remove = (arr, id) => { const i = arr.indexOf(id); if (i !== -1) arr.splice(i, 1); };

  // Members removed
  (oldMemberIds || []).filter(id => !(newMemberIds || []).includes(id)).forEach(uid => {
    if (users[uid]) { if (!users[uid].assignedNodeIds) users[uid].assignedNodeIds = []; remove(users[uid].assignedNodeIds, nodeId); }
  });
  // Members added
  (newMemberIds || []).filter(id => !(oldMemberIds || []).includes(id)).forEach(uid => {
    if (users[uid]) { if (!users[uid].assignedNodeIds) users[uid].assignedNodeIds = []; add(users[uid].assignedNodeIds, nodeId); }
  });
  // Leaders removed
  (oldLeaderIds || []).filter(id => !(newLeaderIds || []).includes(id)).forEach(uid => {
    if (users[uid]) { if (!users[uid].leadershipNodeIds) users[uid].leadershipNodeIds = []; remove(users[uid].leadershipNodeIds, nodeId); }
  });
  // Leaders added
  (newLeaderIds || []).filter(id => !(oldLeaderIds || []).includes(id)).forEach(uid => {
    if (users[uid]) { if (!users[uid].leadershipNodeIds) users[uid].leadershipNodeIds = []; add(users[uid].leadershipNodeIds, nodeId); }
  });
}

/* ── Derive user.assignedNodeIds / user.leadershipNodeIds from orgNodes ──
 *  Run once at startup after _loadAllStores() to initialise the cached
 *  arrays on every user record — safe to run repeatedly (always rebuilt fresh).
 * ──────────────────────────────────────────────────────────────────────── */
function _backfillUserNodeIds() {
  let userCount = 0;
  for (const [orgCode, nodes] of Object.entries(orgNodes)) {
    const users = orgUsers[orgCode];
    if (!users) continue;
    // Reset caches
    Object.values(users).forEach(u => { u.assignedNodeIds = []; u.leadershipNodeIds = []; });
    // Rebuild from node membership
    Object.values(nodes).forEach(node => {
      (node.memberIds || []).forEach(uid => {
        if (users[uid]) {
          if (!users[uid].assignedNodeIds.includes(node.nodeId)) users[uid].assignedNodeIds.push(node.nodeId);
        }
      });
      (node.leaderIds || []).forEach(uid => {
        if (users[uid]) {
          if (!users[uid].leadershipNodeIds.includes(node.nodeId)) users[uid].leadershipNodeIds.push(node.nodeId);
        }
      });
    });
    userCount += Object.keys(users).length;
  }
  console.log(`[startup] _backfillUserNodeIds: processed ${userCount} user records`);
}

/* ── Collect all users below a user in the legacy supervisorId tree (BFS) ──── */
function getSupervisedSubtreeIds(orgCode, userId) {
  const users = orgUsers[orgCode] || {};
  const childrenOf = {};
  Object.values(users).forEach(u => {
    if (u.supervisorId) (childrenOf[u.supervisorId] = childrenOf[u.supervisorId] || []).push(u.id);
  });
  const out   = new Set();
  const queue = [...(childrenOf[userId] || [])];
  while (queue.length) {
    const id = queue.shift();
    if (out.has(id)) continue;
    out.add(id);
    (childrenOf[id] || []).forEach(c => queue.push(c));
  }
  return [...out];
}

/* ── Get node IDs where a user is a LEADER (used for visibility scoping) ── */
function getUserLeaderNodeIds(orgCode, userId) {
  const user = orgUsers[orgCode]?.[userId];
  if (!user) return [];
  // Use cached array if populated; fall back to full scan for safety
  if (user.leadershipNodeIds?.length) return [...user.leadershipNodeIds];
  const nodes = orgNodes[orgCode] || {};
  return Object.values(nodes)
    .filter(n => (n.leaderIds || []).includes(userId))
    .map(n => n.nodeId);
}

/* ── Compute the set of user IDs visible to the requesting user ─────────── *
 *
 *  Visibility rules (evaluated in order):
 *  1. SuperAdmin                    → everyone in the org
 *  2. Has edit_members permission   → everyone (full People management access)
 *  3. Has view_team permission      → all users in own tree node(s) + descendants
 *     3a. Has view_team but no node → only self (unassigned leader)
 *  4. Everyone else                 → only self
 *
 * ──────────────────────────────────────────────────────────────────────── */
function getVisibleUserIds(orgCode, requestingUserId) {
  const user = orgUsers[orgCode]?.[requestingUserId];
  if (!user) return [];

  // Rule 1 — SuperAdmin sees all
  if (user.role === 'superadmin') {
    return Object.keys(orgUsers[orgCode] || {});
  }

  // Rule 2 — Full member management permission sees all
  if (_userHasPerm(orgCode, requestingUserId, 'edit_members')) {
    return Object.keys(orgUsers[orgCode] || {});
  }

  // Rule 3 — view_team: see everyone below this user, composed across ALL three
  // leadership structures (node subtree + legacy supervisor subtree + led groups)
  // so visibility matches _isLeader detection regardless of how the org was built.
  if (_userHasPerm(orgCode, requestingUserId, 'view_team')) {
    const visibleIds = new Set([requestingUserId]); // always include self

    const allNodes = orgNodes[orgCode] || {};
    const addPeople = nid => {
      const n = allNodes[nid];
      if (!n) return;
      (n.memberIds || []).forEach(id => visibleIds.add(id));
      (n.leaderIds || []).forEach(id => visibleIds.add(id));
    };

    // (a) Node subtrees this user LEADS — sees that node + all descendants
    getUserLeaderNodeIds(orgCode, requestingUserId).forEach(nid =>
      getDescendantNodeIds(orgCode, nid).forEach(addPeople)
    );

    // (a2) Hierarchy leadership — for any node this user belongs to, see the
    // people in its DESCENDANT nodes (the tiers below), but not their own peers.
    getUserNodeIds(orgCode, requestingUserId).forEach(nid =>
      getDescendantNodeIds(orgCode, nid).forEach(d => { if (d !== nid) addPeople(d); })
    );

    // (b) Legacy supervisor subtree (everyone who reports up to this user)
    getSupervisedSubtreeIds(orgCode, requestingUserId).forEach(id => visibleIds.add(id));

    // (c) Members of any group this user leads
    (orgGroups[orgCode] || [])
      .filter(g => (g.leadIds || []).includes(requestingUserId))
      .forEach(g => (g.memberIds || []).forEach(id => visibleIds.add(id)));

    return [...visibleIds];
  }

  // Rule 4 — standard member: only self
  return [requestingUserId];
}

/* ── GET /api/workspace/visible-members ──────────────────────────────────
 *
 *  Returns the subset of org users the requesting user is allowed to see.
 *  Fields per member: userId, name, email, role, status, passwordSet,
 *    profileComplete, nodeIds, latestCheckin (snippet).
 *  Never exposes passwordHash or any user outside the visible set.
 *
 * ──────────────────────────────────────────────────────────────────────── */
app.get('/api/workspace/visible-members', requireAuth, (req, res) => {
  const { orgCode, userId } = req.iqSession;
  const code = orgCode;
  const user = orgUsers[code]?.[userId];
  if (!user) return res.status(404).json({ error: 'User not found' });

  const visibleIds = getVisibleUserIds(code, userId);
  const myNodeIds  = getUserNodeIds(code, userId);

  console.log(
    `[VISIBILITY] userId=${userId} role=${user.role} ` +
    `nodes=${myNodeIds.join(',') || 'none'} visibleCount=${visibleIds.length}`
  );

  // Build reverse index: userId → nodeIds (from the whole tree — only used
  // for users who are already in the visible set, so no data leakage)
  const allNodes   = orgNodes[code] || {};
  const userNodeMap = {};
  Object.values(allNodes).forEach(n => {
    [...(n.memberIds || []), ...(n.leaderIds || [])].forEach(uid => {
      if (!userNodeMap[uid]) userNodeMap[uid] = [];
      if (!userNodeMap[uid].includes(n.nodeId)) userNodeMap[uid].push(n.nodeId);
    });
  });

  const members = visibleIds
    .map(uid => {
      const u = orgUsers[code]?.[uid];
      if (!u) return null;

      // Latest check-in — try userId key first, then legacy name key
      const ckList =
        memberCheckins[userKey(code, uid)] ||
        memberCheckins[memberKey(code, u.name || '')] ||
        [];
      const latest = ckList.length ? ckList[ckList.length - 1] : null;
      const latestCheckin = latest
        ? {
            date:      latest.date  || null,
            mood:      latest.mood  || null,
            moodLabel: latest.moodLabel || null,
            text:      (latest.text || '').slice(0, 120), // snippet — not the full entry
            ts:        latest.ts    || null,
          }
        : null;

      return {
        userId:          u.id,
        name:            u.name            || '',
        email:           u.email           || '',
        role:            u.role            || 'member',
        status:          u.status          || 'active',
        passwordSet:     u.passwordSet     !== false,
        profileComplete: u.profileComplete === true,
        nodeIds:         userNodeMap[uid]  || [],
        latestCheckin,
      };
    })
    .filter(Boolean);

  res.json({
    ok: true,
    members,
    requestingUserId: userId,
    visibleCount:     members.length,
  });
});

/* ── GET /api/workspace/team-insights ────────────────────────────────────
 *
 *  Aggregated snapshot for anyone with view_insights or review_checkins.
 *  Uses getVisibleUserIds() — same scoping rules as visible-members.
 *
 *  Returns:
 *    visibleCount      — total members in scope
 *    activeThisWeek    — members with ≥1 check-in since Monday
 *    avgMood           — average mood across this-week check-ins (1–5) | null
 *    needsAttention    — [ { userId, name, reason } ] (capped at 5)
 *    recommendedAction — plain-text suggestion | null
 *    notEnoughData     — true when <3 active check-ins this week
 *    canReviewCheckins — whether caller has full check-in text access
 *
 * ──────────────────────────────────────────────────────────────────────── */
app.get('/api/workspace/team-insights', requireAuth, (req, res) => {
  const { orgCode, userId } = req.iqSession;
  const code = orgCode;

  const canViewInsights   = _userHasPerm(code, userId, 'view_insights');
  const canReviewCheckins = _userHasPerm(code, userId, 'review_checkins');
  if (!canViewInsights && !canReviewCheckins) {
    return res.status(403).json({ error: 'Permission denied: view_insights or review_checkins required' });
  }

  const visibleIds   = getVisibleUserIds(code, userId);
  const visibleCount = visibleIds.length;

  if (visibleCount === 0) {
    return res.json({ ok: true, visibleCount: 0, activeThisWeek: 0, avgMood: null,
                      needsAttention: [], recommendedAction: null, notEnoughData: true, canReviewCheckins });
  }

  // Start-of-week: most recent Monday at 00:00 local
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun … 6=Sat
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  monday.setHours(0, 0, 0, 0);

  let activeThisWeek = 0;
  let moodSum = 0;
  let moodCount = 0;
  const needsAttention = [];

  visibleIds.forEach(uid => {
    const u = orgUsers[code]?.[uid];
    if (!u || u.role === 'superadmin') return;

    const ckList =
      memberCheckins[userKey(code, uid)] ||
      memberCheckins[memberKey(code, u.name || '')] ||
      [];

    // Check-ins from this calendar week
    const thisWeek = ckList.filter(c => {
      const ts = c.ts ? new Date(c.ts) : null;
      return ts && ts >= monday;
    });

    if (thisWeek.length > 0) {
      activeThisWeek++;
      thisWeek.forEach(c => { if (c.mood) { moodSum += c.mood; moodCount++; } });
    }

    // Needs-attention heuristics
    const lastCk = ckList.length ? ckList[ckList.length - 1] : null;
    const daysSince = lastCk?.ts
      ? Math.floor((Date.now() - new Date(lastCk.ts).getTime()) / 86400000)
      : null;

    if (daysSince !== null && daysSince >= 7) {
      needsAttention.push({ userId: uid, name: u.name || '', reason: `No check-in for ${daysSince} days` });
    } else if (thisWeek.length > 0) {
      const weekMoods = thisWeek.filter(c => c.mood).map(c => c.mood);
      if (weekMoods.length) {
        const weekAvg = weekMoods.reduce((s, v) => s + v, 0) / weekMoods.length;
        if (weekAvg < 2.5) needsAttention.push({ userId: uid, name: u.name || '', reason: 'Low mood this week' });
      }
    }
  });

  const avgMood      = moodCount > 0 ? Math.round((moodSum / moodCount) * 10) / 10 : null;
  const notEnoughData = activeThisWeek < 3;

  let recommendedAction = null;
  if (needsAttention.length > 0) {
    recommendedAction = `${needsAttention.length} team member${needsAttention.length !== 1 ? 's' : ''} may need a direct conversation — check in personally or assign a targeted assessment.`;
  } else if (activeThisWeek < Math.ceil(visibleCount * 0.5)) {
    recommendedAction = `Fewer than half your team has checked in this week. Consider prompting engagement.`;
  } else if (avgMood !== null && avgMood >= 3.8) {
    recommendedAction = `Team energy is strong this week. A good moment to assign a stretch assessment.`;
  }

  console.log(`[TEAM-INSIGHTS] userId=${userId} visible=${visibleCount} active=${activeThisWeek} mood=${avgMood} attn=${needsAttention.length}`);

  res.json({
    ok: true,
    visibleCount,
    activeThisWeek,
    avgMood,
    needsAttention:    needsAttention.slice(0, 5),
    commonThemes:      null, // Phase 8
    recommendedAction,
    notEnoughData,
    canReviewCheckins,
  });
});

/* ── GET /api/workspace/group-health ──────────────────────────────────────────
   Item D — metrics on a leader's group, scoped to their subtree.
   Aggregate health (participation / wellbeing / engagement / completion) PLUS a
   per-member DIRECTIONAL state — NOT a ranked scoreboard, per the alignment
   canon ("if a screen lets you sort people by a number, it's wrong").
   States: converging · sustaining · stalled · diverging · unanchored · unknown.
 * ──────────────────────────────────────────────────────────────────────── */
function _memberDirection(code, u) {
  // Returns { state, note } from mood trajectory + activity + goal presence.
  const keys   = [userKey(code, u.id), memberKey(code, u.name || '')];
  const cks    = [];
  keys.forEach(k => (memberCheckins[k] || []).forEach(c => {
    const ts = c.ts || c.date;
    if (ts) cks.push({ mood: c.mood != null ? Number(c.mood) : null, t: new Date(ts).getTime() });
  }));
  cks.sort((a, b) => a.t - b.t);

  const hasGoal = normalizeMemberGoals(_memberGoalsFor(code, u)).length > 0;
  const lastT   = cks.length ? cks[cks.length - 1].t : null;
  const daysSince = lastT != null ? Math.floor((Date.now() - lastT) / 86400000) : null;

  if (!hasGoal) return { state: 'unanchored', note: 'No goal set yet — anchor a goal first.' };

  const moods = cks.filter(c => c.mood != null);
  if (moods.length < 2 || daysSince === null || daysSince > 21) {
    return { state: 'unknown', note: daysSince != null ? `Quiet for ${daysSince}d — not enough recent signal.` : 'No check-ins yet.' };
  }

  // Compare recent half vs earlier half of available mood points.
  const mid    = Math.floor(moods.length / 2);
  const earlier = moods.slice(0, mid).map(c => c.mood);
  const recent  = moods.slice(mid).map(c => c.mood);
  const avg = a => a.reduce((s, v) => s + v, 0) / a.length;
  const delta = avg(recent) - avg(earlier);
  const recentAvg = avg(recent);

  if (delta > 0.3)  return { state: 'converging', note: 'Mood trending up.' };
  if (delta < -0.3) return { state: 'diverging',  note: 'Mood trending down — worth a check-in.' };
  if (daysSince > 10) return { state: 'stalled', note: `Steady but quiet (${daysSince}d since last check-in).` };
  if (recentAvg < 2.7) return { state: 'stalled', note: 'Steady but low — may be stuck.' };
  return { state: 'sustaining', note: 'Consistent and engaged.' };
}

app.get('/api/workspace/group-health', requireAuth, (req, res) => {
  const { orgCode, userId } = req.iqSession;
  const code = orgCode;

  if (!_userHasPerm(code, userId, 'view_insights') && !_userHasPerm(code, userId, 'review_checkins')) {
    return res.status(403).json({ error: 'Permission denied: view_insights or review_checkins required' });
  }

  const now      = Date.now();
  const members  = getVisibleUserIds(code, userId)
    .map(uid => orgUsers[code]?.[uid])
    .filter(u => u && u.id !== userId && u.role !== 'superadmin');

  const STATE_ORDER = ['diverging', 'stalled', 'unanchored', 'unknown', 'sustaining', 'converging'];
  const counts = { converging: 0, sustaining: 0, stalled: 0, diverging: 0, unanchored: 0, unknown: 0 };

  let active7 = 0, active30 = 0, withGoal = 0, setup = 0;
  let mood7Sum = 0, mood7Cnt = 0, mood30Sum = 0, mood30Cnt = 0;

  const perMember = members.map(u => {
    const cks = (memberCheckins[userKey(code, u.id)] || memberCheckins[memberKey(code, u.name || '')] || []);
    const lastTs = cks.length ? new Date(cks[cks.length - 1].ts || cks[cks.length - 1].date).getTime() : null;
    if (lastTs && now - lastTs < 7 * 86400000)  active7++;
    if (lastTs && now - lastTs < 30 * 86400000) active30++;
    if (u.passwordSet !== false) setup++;
    cks.forEach(c => {
      const t = new Date(c.ts || c.date).getTime();
      if (c.mood == null || isNaN(t)) return;
      if (now - t < 7 * 86400000)  { mood7Sum += Number(c.mood);  mood7Cnt++; }
      if (now - t < 30 * 86400000) { mood30Sum += Number(c.mood); mood30Cnt++; }
    });

    const dir = _memberDirection(code, u);
    counts[dir.state] = (counts[dir.state] || 0) + 1;
    if (dir.state !== 'unanchored') withGoal++;
    return { userId: u.id, name: u.name || '', state: dir.state, note: dir.note };
  });

  // Sort by attention-need (diverging first) — this orders by STATE, not by any
  // per-person score, so it stays a triage list, not a ranking.
  perMember.sort((a, b) => STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state));

  const mood7  = mood7Cnt  ? Math.round((mood7Sum  / mood7Cnt)  * 10) / 10 : null;
  const mood30 = mood30Cnt ? Math.round((mood30Sum / mood30Cnt) * 10) / 10 : null;
  const moodTrend = (mood7 != null && mood30 != null)
    ? (mood7 > mood30 + 0.2 ? 'improving' : mood7 < mood30 - 0.2 ? 'declining' : 'steady')
    : 'unknown';

  res.json({
    ok: true,
    groupSize: members.length,
    participation: { active7, active30, total: members.length },
    wellbeing:     { mood7, mood30, trend: moodTrend },
    engagement:    { withGoal, setup, total: members.length },
    states:        counts,
    members:       perMember,
    notEnoughData: members.length === 0,
  });
});

/* ── GET /api/workspace/my-tree ───────────────────────────────────────────────
   The leader's people as a TREE (the node tiers BELOW them), not a flat list.
   Roots = nodes the leader explicitly leads + the direct children of nodes they
   belong to. Each node carries its visible members; people visible to the leader
   but not in any shown node land in an "unassigned" bucket. Scoped server-side. */
function _leaderMemberCard(code, uid) {
  const u = orgUsers[code]?.[uid];
  if (!u || u.role === 'superadmin') return null;
  const ck = memberCheckins[userKey(code, uid)] || memberCheckins[memberKey(code, u.name || '')] || [];
  const last = ck.length ? ck[ck.length - 1] : null;
  return {
    userId: u.id, name: u.name || '', email: u.email || '', role: u.role || 'member',
    passwordSet: u.passwordSet !== false,
    latestCheckin: last ? { date: last.date || null, mood: last.mood || null, ts: last.ts || null } : null,
  };
}

app.get('/api/workspace/my-tree', requireAuth, (req, res) => {
  const { orgCode, userId } = req.iqSession;
  const code = orgCode;
  if (!_userHasPerm(code, userId, 'view_team')) {
    return res.status(403).json({ error: 'Permission denied: view_team required' });
  }

  const nodes      = orgNodes[code] || {};
  const visible    = new Set(getVisibleUserIds(code, userId));
  visible.delete(userId);

  // Root nodes to display: explicitly-led nodes + direct children of own nodes.
  const roots = new Set(getUserLeaderNodeIds(code, userId));
  getUserNodeIds(code, userId).forEach(nid =>
    (nodes[nid]?.childNodeIds || []).forEach(c => roots.add(c))
  );

  const seenMembers = new Set();
  const buildNode = (nid) => {
    const n = nodes[nid];
    if (!n) return null;
    const ids = [...new Set([...(n.memberIds || []), ...(n.leaderIds || [])])]
      .filter(id => visible.has(id));
    const members = ids.map(id => { seenMembers.add(id); return _leaderMemberCard(code, id); }).filter(Boolean);
    const children = (n.childNodeIds || []).map(buildNode).filter(Boolean);
    return { nodeId: n.nodeId, name: n.name, members, children };
  };

  const tree = [...roots].map(buildNode).filter(Boolean);

  // Visible members not placed in any shown node (e.g. added via supervisor).
  const unassigned = [...visible].filter(id => !seenMembers.has(id))
    .map(id => _leaderMemberCard(code, id)).filter(Boolean);

  res.json({ ok: true, tree, unassigned, totalVisible: visible.size });
});

/* ── GET /api/workspace/briefing — PROACTIVE "what needs you" feed ─────────────
   Deterministic alerts (mood decline, gone quiet, dipped results, unanchored) +
   an AI briefing synthesised from the WEIGHTED signal picture. Names members in
   the alert list (leader's own management view); the narrative stays aggregate.
   Cached per leader for 2h. This is the push, not the pull. */
const leaderBriefingCache = {}; // `${code}:${userId}` → { data, ts }
const BRIEFING_TTL = 2 * 60 * 60 * 1000;

function _memberLastActivity(code, id, name) {
  let last = 0;
  [userKey(code, id), memberKey(code, name || '')].forEach(k =>
    (memberCheckins[k] || []).forEach(c => { const t = new Date(c.ts || c.date).getTime(); if (!isNaN(t)) last = Math.max(last, t); }));
  // Only the member's OWN inputs count as engagement. Data logged ABOUT them by a
  // coach (observations, imported sheets) has createdBy !== the member, and must
  // NOT mask disengagement — otherwise a "gone quiet" alert never fires for the
  // very people it exists to surface.
  _gatherSignals(code, 'member', id, 40)
    .filter(s => s.createdBy === id)
    .forEach(s => { const t = new Date(s.ts).getTime(); if (!isNaN(t)) last = Math.max(last, t); });
  return last || null;
}

function _memberAlert(code, u) {
  const now = Date.now();
  const cks = [];
  const seenTs = new Set();  // a check-in stored under both the id-key and the legacy name-key must count once
  [userKey(code, u.id), memberKey(code, u.name || '')].forEach(k =>
    (memberCheckins[k] || []).forEach(c => {
      const t = new Date(c.ts || c.date).getTime();
      if (isNaN(t) || seenTs.has(t)) return;
      seenTs.add(t);
      cks.push({ mood: c.mood != null ? Number(c.mood) : null, t });
    }));
  cks.sort((a, b) => a.t - b.t);
  const lastAct = _memberLastActivity(code, u.id, u.name);
  const days = lastAct ? Math.floor((now - lastAct) / 86400000) : null;
  const hasGoal = normalizeMemberGoals(_memberGoalsFor(code, u)).length > 0;

  // Gone quiet (weighted by how long)
  if (days === null) return { severity: 'medium', reason: 'no activity yet', action: 'Invite them to their first check-in.' };
  if (days >= 14)   return { severity: 'high',   reason: `quiet for ${days} days`, action: 'Reach out personally.' };

  // Mood decline — compare the last 14 days to the preceding ~4 weeks, weighted by
  // TIME not an arbitrary half-split of all history (which let an old low patch
  // fire long after it mattered). Needs ≥2 points in each window to claim a trend,
  // so it never calls a decline off one or two check-ins.
  const avg = a => a.reduce((s, v) => s + v.mood, 0) / a.length;
  const RECENT_MS = 14 * 86400000, PRIOR_MS = 42 * 86400000;
  const recentPts = cks.filter(c => c.mood != null && now - c.t < RECENT_MS);
  const priorPts  = cks.filter(c => c.mood != null && now - c.t >= RECENT_MS && now - c.t < PRIOR_MS);
  if (recentPts.length >= 2) {
    const recent = avg(recentPts);
    if (priorPts.length >= 2 && recent < avg(priorPts) - 0.5 && recent < 3) {
      return { severity: 'high', reason: 'mood trending down', action: 'Check in — ask how they’re doing, listen first.' };
    }
    if (recent < 2.5) return { severity: 'medium', reason: 'low mood recently', action: 'A supportive conversation may help.' };
  }

  // Dipped result (strong signal)
  const lowAssessment = _gatherSignals(code, 'member', u.id, 20)
    .find(s => s.source === 'assessment' && s.valueNum != null && s.valueNum < 50 && (Date.now() - new Date(s.ts).getTime()) < 30 * 86400000);
  if (lowAssessment) return { severity: 'medium', reason: 'a recent result dipped', action: 'Review the assessment together and set one focus.' };

  if (days >= 10) return { severity: 'medium', reason: `quiet for ${days} days`, action: 'A quick nudge would help re-engage them.' };
  if (!hasGoal)   return { severity: 'low', reason: 'no goal set yet', action: 'Help them anchor a personal goal.' };
  return null;
}

app.get('/api/workspace/briefing', requireAuth, async (req, res) => {
  const { orgCode, userId } = req.iqSession;
  const code = orgCode;
  if (!_userHasPerm(code, userId, 'view_team') && !_userHasPerm(code, userId, 'view_insights')) {
    return res.status(403).json({ error: 'Permission denied' });
  }
  const cacheKey = `${code}:${userId}`;
  const cached = leaderBriefingCache[cacheKey];
  if (cached && req.query.refresh !== '1' && Date.now() - cached.ts < BRIEFING_TTL) {
    return res.json({ ...cached.data, cached: true });
  }

  const members = getVisibleUserIds(code, userId)
    .map(id => orgUsers[code]?.[id]).filter(u => u && u.id !== userId && u.role !== 'superadmin');

  const SEV = { high: 0, medium: 1, low: 2 };
  const alerts = [];
  let activeWeek = 0;
  members.forEach(u => {
    const last = _memberLastActivity(code, u.id, u.name);
    if (last && Date.now() - last < 7 * 86400000) activeWeek++;
    const a = _memberAlert(code, u);
    if (a) alerts.push({ memberId: u.id, name: u.name, ...a });
  });
  alerts.sort((x, y) => SEV[x.severity] - SEV[y.severity]);
  const topAlerts = alerts.slice(0, 8);

  // AI briefing from the aggregate weighted picture (no individual names).
  const highN = alerts.filter(a => a.severity === 'high').length;
  const reasons = {};
  alerts.forEach(a => { reasons[a.reason] = (reasons[a.reason] || 0) + 1; });
  const reasonLine = Object.entries(reasons).map(([r, n]) => `${n}× ${r}`).join(', ');
  const brief = [
    `GROUP: ${members.length} members, ${activeWeek} active this week.`,
    alerts.length ? `Attention flags: ${alerts.length} (${highN} high). Patterns: ${reasonLine}.` : 'No attention flags this week.',
    'Signals are weighted: results and repeated patterns count more than one-off notes.',
  ].join('\n');

  let narrative = null;
  try {
    narrative = await ai.complete({
      tier: 'reason', maxTokens: 220,
      system: [`You are IntelliQ, briefing a group's leader. In 2-4 sentences say what the week looks like and the ONE or TWO things to prioritise. Aggregate only — do not name individuals (the leader sees the named list separately). Directional, practical, warm. No scores.`, _worldviewDirective(code)].filter(Boolean).join('\n\n'),
      user: brief,
    });
  } catch (_) { /* fall back to no narrative */ }

  const data = {
    ok: true,
    generatedAt: new Date().toISOString(),
    memberCount: members.length,
    activeThisWeek: activeWeek,
    alerts: topAlerts,
    highCount: highN,
    briefing: narrative || (alerts.length
      ? `${alerts.length} member(s) could use your attention this week — see the list below.`
      : `Your group looks steady this week — ${activeWeek}/${members.length} active.`),
  };
  leaderBriefingCache[cacheKey] = { data, ts: Date.now() };
  res.json(data);
});

/* ═══════════════════════════════════════════════════════════════════════════
   PLATFORM INTELLIGENCE LOOP (v1)
   Input → Signal → PATTERN → Judgment → Action → Outcome → Learning

   ONE consolidated leader surface. The engine (ai/intelligence.js) is pure and
   privacy-safe: it only ever receives DERIVED features (numbers, weights,
   timestamps, directions, booleans) assembled here through the privacy gate —
   never raw note/check-in text. Sensitive context enters only as a boolean flag.
   ═══════════════════════════════════════════════════════════════════════════ */
const intelBriefingCache = {}; // `${code}:${userId}` → { data, ts }
const noticeFeedback = {};     // orgCode → { noticingType → { useful, dismiss } } — the Confidence Engine's memory

/* Confidence Engine read: per-noticing-type reliability, from humans' feedback. */
function _reliabilityByType(code) {
  const fb = noticeFeedback[code] || {};
  const out = {};
  Object.keys(fb).forEach(type => { out[type] = confidence.reliability(fb[type]); });
  return out;
}

/* Deduped mood series for a member: [{ t(ms), mood(1-5) }] ascending. No text. */
function _memberMoodSeries(code, u) {
  const seen = new Set(); const out = [];
  [userKey(code, u.id), memberKey(code, u.name || '')].forEach(k =>
    (memberCheckins[k] || []).forEach(c => {
      const t = new Date(c.ts || c.date).getTime();
      if (isNaN(t) || seen.has(t) || c.mood == null) return;
      seen.add(t); out.push({ t, mood: Number(c.mood) });
    }));
  return out.sort((a, b) => a.t - b.t);
}

/* Directional trajectory from a mood series: 'up' | 'down' | 'flat' | null. */
function _trajectoryFromMood(series, now) {
  const recent = series.filter(p => now - p.t <  intel.RECENT);
  const prior  = series.filter(p => now - p.t >= intel.RECENT && now - p.t < intel.PRIOR);
  if (recent.length < 2 || prior.length < 2) return null;
  const ra = recent.reduce((s, p) => s + p.mood, 0) / recent.length;
  const pa = prior.reduce((s, p) => s + p.mood, 0) / prior.length;
  const d = ra - pa;
  return d > 0.4 ? 'up' : d < -0.4 ? 'down' : 'flat';
}

/* Team trajectory: pooled mood direction of the member's first group's peers. */
function _teamTrajectory(code, u, now) {
  const g = (orgGroups[code] || []).find(x =>
    (x.memberIds || []).includes(u.id) || (x.leadIds || []).includes(u.id));
  if (!g) return null;
  const peers = [...new Set([...(g.memberIds || []), ...(g.leadIds || [])])].filter(id => id !== u.id);
  const pooled = [];
  peers.forEach(id => {
    const pu = orgUsers[code]?.[id]; if (!pu) return;
    _memberMoodSeries(code, pu).forEach(p => pooled.push(p));
  });
  return _trajectoryFromMood(pooled.sort((a, b) => a.t - b.t), now);
}

/* Assemble the PRIVACY-SAFE feature set the engine reasons over. No raw text. */
function _buildMemberIntelInput(code, u, now) {
  const moodSeries = _memberMoodSeries(code, u);
  const sigs = _gatherSignals(code, 'member', u.id, 80);
  const signalSeries = sigs.map(s => ({
    t: new Date(s.ts).getTime(),
    source: s.source,
    weight: s.weight || 'weak',
    own: s.createdBy === u.id,
  })).filter(s => !isNaN(s.t));

  // Concern signals — timestamps only (low-mood check-ins + dipped results).
  const concernSeries = [];
  moodSeries.forEach(p => { if (p.mood <= 2) concernSeries.push({ t: p.t }); });
  sigs.forEach(s => {
    const t = new Date(s.ts).getTime();
    if (!isNaN(t) && s.source === 'assessment' && s.valueNum != null && s.valueNum < 50) concernSeries.push({ t });
  });

  // "Helping / among-others" proxy — timestamps only: shared notes the member
  // authored + messages they sent to a group. No content is read.
  const helpingSeries = [];
  Object.values(orgNotes).forEach(n => {
    if (n.orgCode === code && n.authorId === u.id && n.type && n.type !== 'private') {
      const t = new Date(n.createdAt).getTime(); if (!isNaN(t)) helpingSeries.push({ t });
    }
  });
  Object.values(orgMessages).forEach(mm => {
    if (mm.orgCode === code && mm._realFromId === u.id && mm.toType === 'group') {
      const t = new Date(mm.createdAt).getTime(); if (!isNaN(t)) helpingSeries.push({ t });
    }
  });

  const mem = userAiProfiles[`${code}:${u.id}`];
  const hasSensitiveContext =
    !!(mem?.keyMemory || []).some(k => k.sensitive) ||
    sigs.some(s => privacy.isPrivate(s.sensitivity));

  // ── Behaviour Engine (ai/baseline): compare the member to THEIR OWN normal ──
  // Build weekly-rate + level series per behavioural dimension, then let the
  // Behaviour Engine find deviations-from-self. All numeric — no text.
  const checkinTs = []; const seenCk = new Set();
  [userKey(code, u.id), memberKey(code, u.name || '')].forEach(k =>
    (memberCheckins[k] || []).forEach(c => {
      const t = new Date(c.ts || c.date).getTime();
      if (!isNaN(t) && !seenCk.has(t)) { seenCk.add(t); checkinTs.push(t); }
    }));
  const ownSignalTs  = signalSeries.filter(s => s.own).map(s => s.t);
  const reflectionTs = signalSeries.filter(s => s.own && (s.source === 'note' || s.source === 'weekly')).map(s => s.t);
  const dimSeries = {
    mood:               moodSeries.map(p => ({ t: p.t, v: p.mood })),
    check_in_frequency: _weeklyCounts(checkinTs, now),
    reflection_cadence: _weeklyCounts(reflectionTs, now),
    contribution:       _weeklyCounts(ownSignalTs, now),
    helping:            _weeklyCounts(helpingSeries.map(h => h.t), now),
  };
  let deviations = [], fingerprint = null;
  try { const b = baseline.analyze(dimSeries, now); deviations = b.deviations; fingerprint = b.fingerprint; } catch (_) {}

  // ── Cross-signal reasoning (ai/agents): honest connections across ANY streams ──
  // The five behavioural dimensions PLUS any raw numeric signal (a stat, a grade,
  // attendance, a KPI) — self-relative, correlated over time. Domain-agnostic:
  // it reasons over numbers-vs-self, not industry meaning. Connections, never causes.
  // Streams are typed by universal PRIMITIVE + VALENCE (the domain→kernel mapping),
  // so the pattern engine reasons about "a participation stream declining", not
  // about "check-ins". The five behavioural dimensions PLUS any raw numeric signal.
  const pack = packs.resolvePack(orgMeta[code]?.orgMode);
  const streams = [
    { key: 'mood',               label: packs.labelFor(pack, 'mood'),               primitive: 'state',         valence: 'up-good', series: dimSeries.mood },
    { key: 'check_in_frequency', label: packs.labelFor(pack, 'check_in_frequency'), primitive: 'participation', valence: 'up-good', series: dimSeries.check_in_frequency },
    { key: 'reflection_cadence', label: packs.labelFor(pack, 'reflection_cadence'), primitive: 'participation', valence: 'up-good', series: dimSeries.reflection_cadence },
    { key: 'contribution',       label: packs.labelFor(pack, 'contribution'),       primitive: 'participation', valence: 'up-good', series: dimSeries.contribution },
    { key: 'helping',            label: packs.labelFor(pack, 'helping'),            primitive: 'relational',    valence: 'up-good', series: dimSeries.helping },
  ];
  const numeric = {};
  sigs.forEach(s => {
    if (s.valueNum == null) return;
    const t = new Date(s.ts).getTime(); if (isNaN(t)) return;
    const key = `${s.source}${s.label ? ':' + s.label : ''}`;
    const label = s.label || (SIGNAL_SOURCES[s.source]?.label || s.source);
    (numeric[key] = numeric[key] || {
      key, label,
      // Signals may declare their own primitive/valence (best); else infer universally.
      primitive: s.primitive || packs.primitiveForSignal(s.source, s.label),
      valence:   s.valence   || packs.valenceFor(s.label),
      series: [],
    }).series.push({ t, v: Number(s.valueNum) });
  });
  Object.values(numeric).forEach(st => { if (st.series.length >= 6) streams.push(st); });

  let connections = [];
  try { connections = agents.crossSignal(streams, now); } catch (_) {}
  // The Universal Pattern Engine: domain-free structures (withdrawal/isolation/
  // overload/plateau) over the typed streams — same logic for any human system.
  let structural = [];
  try { structural = primitives.structuralPatterns(streams, now); } catch (_) {}

  return {
    id: u.id, name: u.name || 'This member', now,
    moodSeries, signalSeries, concernSeries, helpingSeries,
    lastActivityT: _memberLastActivity(code, u.id, u.name),
    goalCount: normalizeMemberGoals(_memberGoalsFor(code, u)).length,
    memberTrajectory: _trajectoryFromMood(moodSeries, now),
    teamTrajectory:   _teamTrajectory(code, u, now),
    hasSensitiveContext,
    deviations, fingerprint, connections, structural,
    // The ephemeral relationship graph (honest: correlational, never causal).
    streams: streams.map(s => ({ key: s.key, label: s.label, primitive: s.primitive })),
  };
}

/* Weekly event counts over a trailing window → one point per week [{t, v}].
   Zero-fills quiet weeks (a drop to zero IS the signal). Feeds the Behaviour
   Engine's rate dimensions. */
function _weeklyCounts(times, now, weeks = 16) {
  const buckets = new Array(weeks).fill(0);
  (times || []).forEach(t => {
    const w = Math.floor((now - t) / (7 * 86400000));
    if (w >= 0 && w < weeks) buckets[w]++;
  });
  return buckets.map((v, i) => ({ t: now - (i * 7 + 3.5) * 86400000, v })).sort((a, b) => a.t - b.t);
}

/* Close the loop: which action CATEGORY has helped each pattern, from the org's
   own logged interventions + recorded/measured outcomes. */
function _learningByPattern(code) {
  const acc = {};
  (orgInterventions[code] || []).forEach(i => {
    const pt = i.patternType; if (!pt) return;
    const oc = i.recordedOutcome || (i.outcome?.status === 'measured' ? i.outcome.outcome : null);
    if (!oc) return;
    const s = acc[pt] || (acc[pt] = { actions: {}, positive: 0, total: 0 });
    s.total++; if (oc === 'positive') s.positive++;
    const cat = _categorizeAction(i.action);
    const a = s.actions[cat] || (s.actions[cat] = { label: cat, positive: 0, total: 0 });
    a.total++; if (oc === 'positive') a.positive++;
  });
  const out = {};
  Object.entries(acc).forEach(([pt, s]) => {
    const best = Object.values(s.actions).sort((a, b) => b.positive - a.positive || b.total - a.total)[0];
    out[pt] = { action: best ? best.label : null, positive: s.positive, total: s.total };
  });
  return out;
}

/* ── GET /api/intelligence/briefing — the ONE leader intelligence surface ─────
   Consolidates: who-needs-attention + why-now + evidence + recommended action +
   group rollup (folds the old Group Health / Org Health / Intelligence pages).
   Privacy-safe throughout; the only AI call is the aggregate summary (gateway). */
app.get('/api/intelligence/briefing', requireAuth, async (req, res) => {
  const { orgCode, userId } = req.iqSession;
  const code = orgCode;
  const isAdmin = orgUsers[code]?.[userId]?.role === 'superadmin';
  if (!isAdmin && !_userHasPerm(code, userId, 'view_team') && !_userHasPerm(code, userId, 'view_insights')) {
    return res.status(403).json({ error: 'Permission denied' });
  }

  const cacheKey = `${code}:${userId}`;
  const cached = intelBriefingCache[cacheKey];
  if (cached && req.query.refresh !== '1' && Date.now() - cached.ts < BRIEFING_TTL) {
    return res.json({ ...cached.data, cached: true });
  }

  const now = Date.now();
  const members = getVisibleUserIds(code, userId)
    .map(id => orgUsers[code]?.[id]).filter(u => u && u.id !== userId && u.role !== 'superadmin');
  const learning = _learningByPattern(code);

  const reliabilityByType = _reliabilityByType(code);
  const items = []; let activeWeek = 0; const patternCounts = {};
  members.forEach(u => {
    let m; try { m = _buildMemberIntelInput(code, u, now); } catch (_) { return; }
    if (m.lastActivityT && now - m.lastActivityT < 7 * 86400000) activeWeek++;
    // Kernel findings = self-relative/trajectory patterns + the universal structural
    // patterns (withdrawal/isolation/overload/plateau), ranked together by severity.
    const SEVR = { high: 0, medium: 1, low: 2 };
    const findings = [...intel.detectPatterns(m), ...(m.structural || [])]
      .sort((a, b) => SEVR[a.severity] - SEVR[b.severity]);
    if (!findings.length) return;
    const item = intel.composeBriefingItem(m, findings, learning);
    if (!item) return;
    item.graph = { nodes: m.streams || [], edges: item.connections || [] }; // honest, correlational
    // Confidence Engine: suppress a noticing type that's earned enough feedback and
    // proven mostly unhelpful here; label the rest honestly.
    const rel = reliabilityByType[item.patternType];
    if (!confidence.shouldSurface(rel)) return;
    item.reliability = confidence.label(rel);
    findings.forEach(f => { patternCounts[f.type] = (patternCounts[f.type] || 0) + 1; });
    items.push(item);
  });
  const SEV = { high: 0, medium: 1, low: 2 };
  items.sort((a, b) => SEV[a.severity] - SEV[b.severity]);
  const top = items.slice(0, 15);

  const participation = members.length ? Math.round((activeWeek / members.length) * 100) : 0;
  const drops = patternCounts.momentum_drop || 0, ups = patternCounts.quiet_improvement || 0;
  const momentum = drops > ups ? 'softening' : ups > drops ? 'building' : 'steady';

  let narrative = null;
  try {
    const brief = [
      `${members.length} members, ${activeWeek} active this week (participation ${participation}%).`,
      `Patterns noticed: ${Object.entries(patternCounts).map(([k, v]) => `${v}× ${intel.PATTERN_LABEL[k] || k}`).join(', ') || 'none'}.`,
      `Overall momentum: ${momentum}.`,
    ].join('\n');
    narrative = await ai.complete({
      tier: 'reason', maxTokens: 200,
      system: [
        `You are Platform Intelligence, briefing a leader in 2-3 sentences: the shape of the week and the ONE thing to prioritise. Aggregate only — NEVER name an individual (the leader sees the named list separately). Honest and directional — say "pattern" or "early signal", never "prediction" and never scores.`,
        _worldviewDirective(code),
      ].filter(Boolean).join('\n\n'),
      user: brief,
    });
  } catch (_) { /* narrative is optional */ }

  const data = {
    ok: true,
    generatedAt: new Date().toISOString(),
    summary: narrative || (top.length
      ? `${top.length} member(s) show patterns worth a look this week.`
      : `Your group looks steady — ${activeWeek}/${members.length} active, nothing flagged.`),
    rollup: { memberCount: members.length, activeThisWeek: activeWeek, participation, momentum, patternCounts },
    items: top,
  };
  intelBriefingCache[cacheKey] = { data, ts: Date.now() };
  res.json(data);
});

/* ── GET /api/intelligence/roster — EVERYONE in scope, at-a-glance status ──────
   The briefing shows who needs you *today*; the roster shows your whole tree
   (org-wide for a superadmin) with a one-word kernel read each, so a leader can
   scan everyone, not just the flagged few. Deterministic (no AI call), cached. */
const rosterCache = {}; // `${code}:${userId}` → { data, ts }

app.get('/api/intelligence/roster', requireAuth, (req, res) => {
  const { orgCode, userId } = req.iqSession;
  const code = orgCode;
  const isAdmin = orgUsers[code]?.[userId]?.role === 'superadmin';
  if (!isAdmin && !_userHasPerm(code, userId, 'view_team') && !_userHasPerm(code, userId, 'view_insights')) {
    return res.status(403).json({ error: 'Permission denied' });
  }
  const key = `${code}:${userId}`;
  const cached = rosterCache[key];
  if (cached && req.query.refresh !== '1' && Date.now() - cached.ts < BRIEFING_TTL) {
    return res.json({ ...cached.data, cached: true });
  }

  const now = Date.now();
  const members = getVisibleUserIds(code, userId)
    .map(id => orgUsers[code]?.[id]).filter(u => u && u.id !== userId && u.role !== 'superadmin');

  const counts = { attention: 0, improving: 0, steady: 0, 'no-data': 0 };
  const roster = members.map(u => {
    let m; try { m = _buildMemberIntelInput(code, u, now); } catch (_) { m = null; }
    const findings = m ? [...intel.detectPatterns(m), ...(m.structural || [])] : [];
    const lastDays = m?.lastActivityT ? Math.floor((now - m.lastActivityT) / 86400000) : null;
    const hasData = (m?.moodSeries?.length || 0) > 0 || (m?.signalSeries?.length || 0) > 0 || lastDays != null;

    let status = 'steady', topLabel = null;
    if (!hasData) { status = 'no-data'; }
    else {
      const urgent  = findings.find(f => f.severity === 'high') || findings.find(f => f.severity === 'medium');
      const improve = findings.find(f => f.type === 'quiet_improvement');
      if (urgent)       { status = 'attention'; topLabel = intel.PATTERN_LABEL[urgent.type] || urgent.type; }
      else if (improve) { status = 'improving'; topLabel = 'Quietly improving'; }
      else              { status = 'steady'; }
    }
    counts[status]++;
    return { id: u.id, name: u.name || '', status, topLabel, lastActiveDays: lastDays };
  });

  const ORDER = { attention: 0, improving: 1, steady: 2, 'no-data': 3 };
  roster.sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.name.localeCompare(b.name));

  const data = { ok: true, count: members.length, counts, roster, orgWide: isAdmin };
  rosterCache[key] = { data, ts: Date.now() };
  res.json(data);
});

/* ── POST /api/intelligence/act — leader logs an action taken on a briefing item.
   Ties the intervention to the PATTERN so the loop can learn per-pattern. */
app.post('/api/intelligence/act', requireAuth, (req, res) => {
  const { orgCode, userId } = req.iqSession;
  const code = orgCode;
  const { memberId, patternType, action } = req.body || {};
  if (!action || !String(action).trim()) return res.status(400).json({ error: 'action required' });
  if (memberId && !getVisibleUserIds(code, userId).includes(memberId)) {
    return res.status(403).json({ error: 'Member not in your visible scope' });
  }
  if (!orgInterventions[code]) orgInterventions[code] = [];
  const intv = {
    id: _intvId(), createdAt: new Date().toISOString(),
    targetMember: orgUsers[code]?.[memberId]?.name || null,
    targetMemberId: memberId || null, targetGroup: null,
    action: String(action).slice(0, 300),
    patternType: patternType || null,
    urgency: 'medium', owner: userId, reason: 'briefing', evidence: [],
    status: 'completed', acknowledgedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(), dismissedAt: null,
    outcome: null, recordedOutcome: null,
  };
  orgInterventions[code].push(intv);
  scheduleSave();
  res.json({ ok: true, interventionId: intv.id });
});

/* ── POST /api/intelligence/outcome — leader records how an action went.
   Explicit outcome (positive|neutral|negative) closes the learning loop. */
app.post('/api/intelligence/outcome', requireAuth, (req, res) => {
  const { orgCode, userId } = req.iqSession;
  const code = orgCode;
  const { interventionId, outcome } = req.body || {};
  const VALID = ['positive', 'neutral', 'negative'];
  if (!interventionId || !VALID.includes(outcome)) return res.status(400).json({ error: 'interventionId and valid outcome required' });
  const intv = (orgInterventions[code] || []).find(i => i.id === interventionId);
  if (!intv) return res.status(404).json({ error: 'Not found' });
  if (intv.owner !== userId && orgUsers[code]?.[userId]?.role !== 'superadmin') {
    return res.status(403).json({ error: 'Only the logger can record the outcome' });
  }
  intv.recordedOutcome = outcome;
  intv.outcomeRecordedAt = new Date().toISOString();
  intelBriefingCache[`${code}:${userId}`] = null; // learning changed — invalidate
  scheduleSave();
  res.json({ ok: true });
});

/* ── POST /api/intelligence/notice-feedback — teach the Confidence Engine ──────
   Either lens sends { type, feedback:'useful'|'dismiss' }. The kernel learns which
   KINDS of noticing are actually useful here, and stops surfacing the ones that
   aren't. This is how proactivity earns (or loses) the right to speak. */
/* Record a useful/dismiss signal for a noticing TYPE and invalidate the caches
   it affects. Shared by the leader feedback endpoint and the member Learn loop. */
function _recordNoticeFeedback(code, type, feedback) {
  if (!['useful', 'dismiss'].includes(feedback)) return null;
  if (!noticeFeedback[code]) noticeFeedback[code] = {};
  const t = noticeFeedback[code][String(type)] || (noticeFeedback[code][String(type)] = { useful: 0, dismiss: 0 });
  t[feedback]++;
  Object.keys(intelBriefingCache).forEach(k => { if (k.startsWith(code + ':')) intelBriefingCache[k] = null; });
  Object.keys(meRecordCache).forEach(k => { if (k.startsWith(code + ':')) meRecordCache[k] = null; });
  scheduleSave();
  return t;
}

app.post('/api/intelligence/notice-feedback', requireAuth, (req, res) => {
  const { orgCode } = req.iqSession;
  const code = orgCode;
  const { type, feedback } = req.body || {};
  if (!type || !['useful', 'dismiss'].includes(feedback)) return res.status(400).json({ error: 'type and useful|dismiss required' });
  const t = _recordNoticeFeedback(code, type, feedback);
  res.json({ ok: true, reliability: confidence.label(confidence.reliability(t)) });
});

/* ── POST /api/signals/import-csv — a source adapter in action ─────────────────
   The "everything is a signal" contract: a spreadsheet becomes per-member metric
   signals through the SAME attribution + scope-safety path as the smart import.
   Body: { csv, fileName?, public? }. */
app.post('/api/signals/import-csv', requireAuth, (req, res) => {
  const { orgCode, userId } = req.iqSession;
  const code = orgCode;
  const csvText = String(req.body?.csv || '');
  if (!csvText.trim()) return res.status(400).json({ error: 'csv content required' });

  let parsed; try { parsed = adapters.csv(csvText); } catch (e) { return res.status(400).json({ error: 'Could not parse CSV: ' + e.message }); }
  if (!parsed.members.length) return res.json({ ok: true, imported: 0, matched: [], unmatched: [], note: 'No member rows found (first column should be the member name).' });

  const roster = getVisibleUserIds(code, userId)
    .map(id => orgUsers[code]?.[id]).filter(u => u && u.role !== 'superadmin')
    .map(u => ({ id: u.id, name: (u.name || '').toLowerCase().trim(), first: (u.firstName || (u.name || '').split(' ')[0] || '').toLowerCase().trim() }));
  if (!roster.length) return res.status(400).json({ error: 'No members in your scope to attribute data to.' });

  const result = _attributeMembers(code, userId, parsed.members, roster, String(req.body?.fileName || 'import.csv').slice(0, 120), !!req.body?.public);
  res.json({ ok: true, ...result });
});

/* ═══════════════════════════════════════════════════════════════════════════
   INTELLIQ — the PERSON'S OWN lens over the same kernel.
   The record belongs to the individual: they see their OWN behavioural portrait,
   what has shifted vs THEIR OWN normal, their values/goals, and a warm reflection
   from the Coach agent. Self-owned, self-relative, never scored. Sensitive context
   informs the reflection's tone but is never enumerated back at them.
   ═══════════════════════════════════════════════════════════════════════════ */
const meRecordCache = {}; // `${code}:${userId}` → { data, ts }

app.get('/api/me/record', requireAuth, async (req, res) => {
  const { orgCode, userId } = req.iqSession;
  const code = orgCode;
  const me = orgUsers[code]?.[userId];
  if (!me) return res.status(404).json({ error: 'Not found' });

  const cacheKey = `${code}:${userId}`;
  const cached = meRecordCache[cacheKey];
  if (cached && req.query.refresh !== '1' && Date.now() - cached.ts < BRIEFING_TTL) {
    return res.json({ ...cached.data, cached: true });
  }

  const now = Date.now();
  let m; try { m = _buildMemberIntelInput(code, me, now); } catch (_) { m = null; }

  // Their own stated aims/values (person-authored core of the human model).
  const goalRec = _memberGoalsFor(code, me) || {};
  const goals  = normalizeMemberGoals(goalRec).map(g => g.title).filter(Boolean);
  const values = Array.isArray(goalRec.selectedValues) ? goalRec.selectedValues.filter(Boolean) : [];

  // Portrait = their behavioural fingerprint (self-relative normals). Never a score.
  const portrait = m?.fingerprint || {};
  const shifts   = (m?.deviations || []).map(d => ({ label: d.label, direction: d.direction, deviationPct: d.deviationPct, confidence: d.confidence }));
  const trajectory = m?.memberTrajectory || null;

  // The Coach agent reflects — warm, self-relative, values-anchored. Via the gateway.
  let reflection = null;
  const enoughToReflect = (m?.moodSeries?.length || 0) >= 1 || Object.keys(portrait).length > 0 || goals.length > 0;
  if (enoughToReflect) {
    try {
      // The person's own confidence-gated understanding shapes STYLE only.
      const understanding = agents.personModel.understanding(userAiProfiles[`${code}:${userId}`]?.model);
      const { system, user } = agents.coachReflectionPrompt({
        name: me.name, values, goals,
        fingerprint: portrait, deviations: m?.deviations || [],
        trajectory, hasSensitiveContext: !!m?.hasSensitiveContext,
        understanding,
      });
      reflection = await ai.complete({ tier: 'reason', system, user, maxTokens: 220 });
      // Belt-and-suspenders: strip any private span that could have slipped in.
      reflection = privacy.redact(reflection, m?.privateStrings || []);
    } catch (_) { reflection = null; }
  }

  const data = {
    ok: true,
    generatedAt: new Date().toISOString(),
    name: me.name,
    reflection: reflection || (goals.length
      ? `You're just getting started here. As you check in and reflect, this becomes a clearer mirror of who you're becoming.`
      : `Welcome. Name one thing you're working toward, and IntelliQ starts building an honest picture of your growth — just for you.`),
    portrait,          // { dim: { label, normal } } — self-relative normals
    shifts,            // what's different from THEIR own normal, lately
    connections: (m?.connections || []).map(c => ({ a: c.a, b: c.b, relation: c.relation, basis: c.basis, confidence: c.confidence })),
    patterns: (m?.structural || []).map(s => ({ type: s.type, basis: s.basis, confidence: s.confidence })),
    trajectory,        // directional word, never a score
    values, goals,
    ownedByYou: true,  // this record is theirs
  };
  meRecordCache[cacheKey] = { data, ts: Date.now() };
  res.json(data);
});

/* GET /api/me/context — the proactive "Me" context open-state (Individual
   Experience Phase 1–3). Reasoning-first, self-owned, privacy-safe. The kernel
   has "already worked": what changed since last visit, what it noticed
   (self-relative), the person's own open questions, and a prepared suggestion.
   Fully deterministic from the kernel — no AI key required, so it always works. */
app.get('/api/me/context', requireAuth, async (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const me = orgUsers[code]?.[userId];
  if (!me) return res.status(404).json({ error: 'Not found' });

  const now = Date.now();
  let m; try { m = _buildMemberIntelInput(code, me, now); } catch (_) { m = null; }
  const mem = _getMemory(code, userId);

  // Since last visit — deterministic. Count the person's OWN signals since then.
  const lastSeen = mem.lastSeen ? new Date(mem.lastSeen).getTime() : null;
  let newSince = 0;
  try {
    const mine = (orgSignals[code] || []).filter(s => s.subjectId === userId);
    newSince = lastSeen ? mine.filter(s => new Date(s.ts).getTime() > lastSeen).length : 0;
  } catch (_) {}

  // What the kernel NOTICED — self-relative shifts + structural patterns. Gated,
  // privacy-safe (labels/directions only, never raw text).
  const noticed = [];
  (m?.deviations || []).forEach(d => noticed.push({
    kind: 'shift', text: `${d.label} is ${d.direction} your usual lately`, confidence: d.confidence || 'tentative',
  }));
  (m?.structural || []).forEach(s => noticed.push({
    kind: 'pattern', text: intel.PATTERN_LABEL[s.type] || s.type, confidence: s.confidence || 'tentative',
  }));

  // The person's OWN open questions — self-owned memory threads (never leave them).
  const questions = (mem.openThreads || []).filter(t => !t.resolved).slice(0, 4)
    .map(t => ({ id: t.id, text: t.text }));

  // Prepared — one gentle, approvable suggestion from the top signal. Carries the
  // pattern type so approving it can close the loop (Learn) later.
  const prepared = [];
  const top = (m?.structural || [])[0] || (m?.deviations || [])[0];
  const activeFocusTexts = new Set((mem.focuses || []).filter(f => f.status === 'active').map(f => f.text));
  if (top) {
    const ptext = top.type ? (intel.DEFAULT_ACTION[top.type] || 'A small, supportive focus this week.') : 'A small, supportive focus this week.';
    if (!activeFocusTexts.has(ptext)) prepared.push({ text: ptext, type: top.type || null });
  }

  // A deterministic, honest opening line (no AI needed).
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  let opening;
  if (noticed.length)      opening = `Since you were last here, I looked over your week — ${noticed.length === 1 ? "there's one thing" : `there are ${noticed.length} things`} worth a moment.`;
  else if (newSince > 0)   opening = `I've taken in ${newSince} new ${newSince === 1 ? 'thing' : 'things'} since your last visit and folded ${newSince === 1 ? 'it' : 'them'} into your picture.`;
  else                     opening = `Nothing new demands your attention right now. Add anything on your mind and I'll take it from there.`;

  // If a model is configured, let the Coach VOICE the opening warmly. The
  // judgment stays deterministic above; the LLM only turns it into words.
  // Privacy-safe: it sees labels/directions (never raw text) and is redacted.
  // Skipped entirely with no key, so the endpoint stays fast and offline-safe.
  if (ai.enabled()) {
    try {
      const obs = noticed.map(x => `- ${x.text}`).join('\n') || '- nothing notably different from their own normal lately';
      const sys = `You are IntelliQ, ${me.name}'s private mirror. Write ONE warm, brief opening (max 2 sentences) that makes them feel seen. Speak to them as "you". Self-relative, no scores, no advice, no invented specifics.`;
      const usr = `Observations about THEIR OWN recent patterns — never quote or state private detail:\n${obs}\n\nWrite the opening line only.`;
      const line = await ai.complete({ tier: 'micro', system: sys, user: usr, maxTokens: 90 });
      if (line && line.trim()) opening = privacy.redact(line.trim(), m?.privateStrings || []);
    } catch (_) { /* keep the deterministic opening */ }
  }

  // Mark this visit.
  mem.lastSeen = new Date().toISOString();
  scheduleSave();

  // Active focuses — approved work still in flight (the person's own commitments).
  const focuses = (mem.focuses || []).filter(f => f.status === 'active')
    .map(f => ({ id: f.id, text: f.text }));

  // Recognition ABOUT them from others (leader or peer) — the draw-in: they open
  // the app and find someone acknowledged them. Positive/attributed by design.
  const recognitions = (orgSignals[code] || [])
    .filter(s => s.subjectId === userId && s.source === 'observation' && s.data && s.data.kind === 'recognition')
    .sort((a, b) => new Date(b.ts) - new Date(a.ts)).slice(0, 3)
    .map(s => ({ text: s.valueText || 'recognised your work', by: s.data.byName || 'Someone on your team', date: s.ts }));

  res.json({
    ok: true, name: me.name, greeting, opening, newSince, noticed, questions, prepared, focuses, recognitions,
    understanding: agents.personModel.understanding(mem.model),
    trajectory: m?.memberTrajectory || null,
  });
});

/* POST /api/compose — the universal composer (one input; the AI reasons over it).
   v1: text. Stores as the person's own signal (sensitive by default), updates
   their Person Model, reasons over the updated picture, and returns what it
   understood + what it noticed. AI-optional: the "noticed" is real kernel output;
   the acknowledgement degrades to an honest deterministic line without a key. */
app.post('/api/compose', requireAuth, async (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const me   = orgUsers[code]?.[userId];
  const text = (req.body?.text || '').trim();
  const moodRaw = Number(req.body?.mood);
  const mood = Number.isInteger(moodRaw) && moodRaw >= 1 && moodRaw <= 5 ? moodRaw : null;  // optional
  if (!me) return res.status(404).json({ error: 'Not found' });
  if (!text && !mood) return res.status(400).json({ error: 'text or mood required' });
  if (text.length > 4000) return res.status(400).json({ error: 'too long' });

  // Store as the person's own check-in + signal. Free text is a personal
  // disclosure → sensitive by default (the privacy gate treats it as such).
  const moodLabels = { 1:'Rough', 2:'Low', 3:'Okay', 4:'Good', 5:'Great' };
  const key = userKey(code, userId);
  if (!memberCheckins[key]) memberCheckins[key] = [];
  memberCheckins[key].push({
    memberName: me.name, text: text || null, mood, moodLabel: mood ? moodLabels[mood] : null,
    role: me.role || 'member', orgMode: '', date: new Date().toLocaleDateString('en-GB'), ts: new Date().toISOString(),
  });
  try {
    _emitSignalSafe(code, { subjectType:'member', subjectId:userId, source:'checkin', modality:'text',
      valueNum: mood, valueText: text || null, label: mood ? `Mood ${mood}/5` : 'Note', sensitivity:'sensitive' }, userId);
  } catch (_) {}

  // Update memory + Person Model (deterministic; wrapped so it can't break compose).
  try {
    const blob = text.toLowerCase();
    const watch = /worr|stress|struggl|overwhelm|tired|anx|heavy|burnout|exhaust|isolat|alone/.test(blob) ? text.slice(0, 140) : null;
    _updateUserMemory(code, userId, 'checkin', { watchOutFor: watch, themes: [] });
  } catch (_) {}

  // Reason freshly over the updated picture.
  const now = Date.now();
  let m; try { m = _buildMemberIntelInput(code, me, now); } catch (_) { m = null; }
  const noticed = [];
  (m?.deviations || []).slice(0, 2).forEach(d => noticed.push(`${d.label} is ${d.direction} your usual lately`));
  (m?.structural || []).slice(0, 2).forEach(s => noticed.push(intel.PATTERN_LABEL[s.type] || s.type));

  let acknowledgement = "Got it — I've added that and folded it into your picture.";
  if (ai.enabled() && text) {
    try {
      const sys = `You are IntelliQ, ${me.name}'s private mirror. They just shared something with you. Reply in ONE warm, brief sentence that shows you genuinely understood — reflect their own words back gently. No advice, no scores, no platitudes. Speak to them as "you".`;
      const line = await ai.complete({ tier: 'micro', system: sys, user: `They wrote: "${text}"\n\nAcknowledge warmly in one sentence.`, maxTokens: 80 });
      // Self-facing (their own words reflected back to them) — no redaction needed.
      if (line && line.trim()) acknowledgement = line.trim();
    } catch (_) { /* keep the deterministic acknowledgement */ }
  }

  res.json({
    ok: true,
    acknowledgement,
    noticed,
    understanding: agents.personModel.understanding(_getMemory(code, userId).model),
  });
});

/* POST /api/me/prepared/act — approve (or dismiss) a prepared suggestion.
   Approve → it becomes one of the person's own active focuses (the visible
   Recommend → Approve → Execute step). Self-scoped. */
app.post('/api/me/prepared/act', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const { text, type, decision } = req.body || {};
  if (!code || !userId) return res.status(403).json({ error: 'Forbidden' });
  if (!text || (decision !== 'approve' && decision !== 'dismiss')) {
    return res.status(400).json({ error: 'text and decision (approve|dismiss) required' });
  }
  const mem = _getMemory(code, userId);
  if (decision === 'approve') {
    mem.focuses = mem.focuses || [];
    mem.focuses.unshift({
      id: 'foc_' + generateId(), text: String(text).slice(0, 300), type: type || null,
      status: 'active', outcome: null, createdAt: new Date().toISOString(),
    });
  } else {
    // Dismiss teaches the Confidence Engine this kind of nudge didn't land for them.
    if (type) { try { _recordNoticeFeedback(code, type, 'dismiss'); } catch (_) {} }
  }
  mem.lastUpdated = new Date().toISOString();
  scheduleSave();
  res.json({ ok: true, focuses: (mem.focuses || []).filter(f => f.status === 'active').map(f => ({ id: f.id, text: f.text })) });
});

/* POST /api/me/focus/outcome — close the loop: report how an approved focus went.
   Observe outcome → LEARN. Resolves the focus and teaches the Confidence Engine
   (helped → useful; didn't → dismiss) for the pattern type that suggested it.
   Self-scoped. This is the lifecycle's final step (…Execute → Observe → Learn). */
app.post('/api/me/focus/outcome', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const { focusId, outcome } = req.body || {};
  if (!code || !userId) return res.status(403).json({ error: 'Forbidden' });
  if (!focusId || !['helped', 'no', 'mixed'].includes(outcome)) {
    return res.status(400).json({ error: 'focusId and outcome (helped|no|mixed) required' });
  }
  const mem = _getMemory(code, userId);
  const f = (mem.focuses || []).find(x => x.id === focusId);
  if (!f) return res.status(404).json({ error: 'focus not found' });

  f.status = 'done';
  f.outcome = outcome;
  f.resolvedAt = new Date().toISOString();

  // LEARN — feed the Confidence Engine so what genuinely helps this person
  // surfaces more, and what doesn't fades.
  if (f.type && outcome !== 'mixed') {
    try { _recordNoticeFeedback(code, f.type, outcome === 'helped' ? 'useful' : 'dismiss'); } catch (_) {}
  }
  mem.lastUpdated = new Date().toISOString();
  scheduleSave();
  res.json({ ok: true });
});

/* GET /api/me/export — the person downloads EVERYTHING we hold about them
   (GDPR Art 15/20 — right of access & portability). Strictly self-scoped:
   the caller only ever gets their own data. One honest, complete JSON. */
app.get('/api/me/export', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const me = orgUsers[code]?.[userId];
  if (!me) return res.status(404).json({ error: 'Not found' });
  const uKey = userKey(code, userId);
  const mKey = memberKey(code, me.name || '');

  const { passwordHash, ...profile } = me;   // never export the password hash
  const bundle = {
    exportedAt: new Date().toISOString(),
    note: 'This is all the personal data IntelliQ holds about you.',
    profile,
    goals:       memberGoals[uKey] || memberGoals[mKey] || null,
    checkins:    memberCheckins[uKey] || memberCheckins[mKey] || [],
    results:     memberResults[uKey] || memberResults[mKey] || [],
    // A person's own signals — BUT exclude third-party welfare/safeguarding
    // observations others recorded about them (sensitive, reporter-protected).
    // GDPR Art 15(4): access must not adversely affect the rights of others.
    signals: (orgSignals[code] || []).filter(s =>
      (s.subjectId === userId || s.createdBy === userId) &&
      !(s.source === 'observation' && s.createdBy !== userId && s.sensitivity !== 'normal')),
    notes:       Object.values(orgNotes).filter(n => n.orgCode === code && n.authorId === userId),
    aiMemory:    userAiProfiles[uKey] || null,   // their own model — theirs to see
    weekly:      Object.entries(weeklyAssessments)
                   .filter(([wk]) => wk.startsWith(code + ':'))
                   .flatMap(([, arr]) => (arr || []).filter(e => e.memberId === userId || (e.memberName || '').toLowerCase() === (me.name || '').toLowerCase())),
  };
  res.setHeader('Content-Disposition', 'attachment; filename="intelliq-my-data.json"');
  res.json(bundle);
});

/* POST /api/observe — record an observation ABOUT someone (the "works even if the
   person never logs in" path + peer recognition). An observation is just a signal
   with subjectId = the person and createdBy = the observer, so the kernel already
   reasons over it by subject regardless of who authored it.

   Directions supported (all "considered" by the kernel):
     • leader → member (top-down)        • leader ↔ leader (peer)
     • member ↔ member (lateral)         • member → leader (upward / 360)
   Guardrails so it can't be weaponised:
     • RECOGNITION (positive) — anyone in the org may record it about anyone; it's
       surfaced to the subject (attribution kept). Dignity-preserving by design.
     • CONCERN / NOTE — requires the author to actually lead/see the subject (scope);
       stored SENSITIVE (informs the kernel, never shown to the subject or peers).
       A peer cannot file a public "concern" about someone (no pile-ons).
   Weight reflects the relationship: a leader's observation weighs more than a peer's. */
app.post('/api/observe', requireAuth, (req, res) => {
  const { orgCode: code, userId: authorId } = req.iqSession;
  const { subjectId, kind, text, metricLabel, metricValue } = req.body || {};
  const author  = orgUsers[code]?.[authorId];
  const subject = orgUsers[code]?.[subjectId];
  if (!author || !subject) return res.status(404).json({ error: 'Not found' });
  const k = ['recognition', 'concern', 'note'].includes(kind) ? kind : 'note';
  const body = String(text || '').trim();
  const mNum = metricValue != null && Number.isFinite(Number(metricValue)) ? Number(metricValue) : null;
  if (!body && mNum == null) return res.status(400).json({ error: 'text or a metric is required' });

  const leadsSubject = getVisibleUserIds(code, authorId).includes(subjectId) &&
    (_userHasPerm(code, authorId, 'view_insights') || _userHasPerm(code, authorId, 'view_members') ||
     author.role === 'superadmin' || subject.supervisorId === authorId);
  const isPeer = !leadsSubject;

  // Permission + handling by kind:
  //  • recognition — anyone, about anyone. Positive, surfaced to the subject.
  //  • concern     — a LEADER files a scoped concern (weight strong). A PEER may
  //    also raise one, but it is handled as a private SAFEGUARDING flag: low
  //    weight (needs corroboration — one voice can't mark someone), sensitive
  //    (informs the responsible leader only, never the subject or other peers),
  //    reporter-protected, optionally anonymous. "See something, say something"
  //    done safely — a peer cannot weaponise it, and a real welfare worry isn't lost.
  //  • note        — a neutral record, for someone who leads the person only.
  if (k === 'note' && isPeer) {
    return res.status(403).json({ error: 'Notes are for someone who leads this person. Use recognition, or raise a concern.' });
  }

  const anonymous     = req.body?.anonymous === true;
  const peerSafeguard = isPeer && k === 'concern';
  const sensitivity   = k === 'recognition' ? 'normal' : 'sensitive';
  const weightNum     = k === 'recognition' ? (leadsSubject ? 3 : 2)
                      : (leadsSubject ? 3 : 1);            // peer concern = low weight, corroboration-gated
  try {
    _emitSignalSafe(code, {
      subjectType: 'member', subjectId, source: 'observation', modality: 'text',
      valueNum: mNum, valueText: body || null,
      label: metricLabel ? String(metricLabel).slice(0, 120) : (k === 'recognition' ? 'Recognition' : 'Observation'),
      sensitivity, weightNum,
      data: {
        kind,
        // Attribution only for positive recognition; concerns protect the reporter.
        byName: (k === 'recognition' && !anonymous) ? author.name : undefined,
        byRole: author.role,
        peerReport: peerSafeguard || undefined,           // a peer welfare flag → corroboration-gated
        reporterProtected: (k !== 'recognition' || anonymous) || undefined,
      },
    }, authorId);
  } catch (e) { return res.status(500).json({ error: 'could not record' }); }

  // Recognition is surfaced to the subject — clear their proactive cache so it shows.
  if (k === 'recognition') {
    Object.keys(meRecordCache).forEach(key => { if (key.startsWith(code + ':')) meRecordCache[key] = null; });
  }
  scheduleSave();
  res.json({
    ok: true, kind: k,
    weight: weightNum >= 3 ? 'strong' : weightNum >= 2 ? 'medium' : 'low',
    routed: peerSafeguard
      ? 'Raised privately with the people responsible for their wellbeing. Thank you for looking out for them.'
      : (k === 'recognition' ? 'Shared with them.' : 'Recorded.'),
  });
});

/* ── CONSENT LEDGER + external app connectors (GDPR: informed, revocable) ─────
   The person owns their consent. Drawing data from an external app requires
   their explicit, recorded, revocable consent for that source — and it's always
   THEIR OWN data (self-scoped). Withdraw any time → disconnect + stop drawing. */

app.get('/api/me/consent', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  res.json({ ok: true, version: CONSENT_VERSION, consents: _getConsents(code, userId), connectors: connectors.list() });
});

app.post('/api/me/consent', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const { scope, granted } = req.body || {};
  if (!scope || typeof scope !== 'string') return res.status(400).json({ error: 'scope required' });
  const c = _getConsents(code, userId);
  c[scope] = { granted: granted === true, at: new Date().toISOString(), version: CONSENT_VERSION };
  // Revoking an external scope disconnects that source too (stop drawing at once).
  if (granted !== true && scope.startsWith('external:')) {
    const src = scope.slice('external:'.length);
    const conn = connectedSources[_consentKey(code, userId)];
    if (conn && conn[src]) delete conn[src];
  }
  scheduleSave();
  res.json({ ok: true, scope, granted: c[scope].granted });
});

app.get('/api/me/sources', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const conn = connectedSources[_consentKey(code, userId)] || {};
  res.json({ ok: true, sources: connectors.list().map(s => ({
    ...s, consented: _hasConsent(code, userId, s.scope), connected: !!conn[s.id], lastPull: conn[s.id]?.lastPull || null,
    assistConsented: s.assist ? _hasConsent(code, userId, s.assist.scope) : false,
  })) });
});

/* Connect an external app — REQUIRES the person's consent for its scope first.
   Self-scoped: you only ever connect YOUR OWN apps. (The OAuth token exchange is
   the provider-specific integration point; the consent + mapping are real now.) */
app.post('/api/me/connect', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const src = connectors.get(req.body?.source);
  if (!src) return res.status(400).json({ error: 'unknown source' });
  if (!_hasConsent(code, userId, src.scope)) {
    return res.status(403).json({ error: 'consent_required', scope: src.scope, message: `Grant consent for "${src.label}" before connecting.` });
  }
  const key = _consentKey(code, userId);
  const conn = connectedSources[key] = connectedSources[key] || {};
  conn[src.id] = { connectedAt: new Date().toISOString(), lastPull: null };
  scheduleSave();
  res.json({ ok: true, source: src.id, connected: true });
});

app.delete('/api/me/connect/:source', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const conn = connectedSources[_consentKey(code, userId)] || {};
  delete conn[req.params.source];
  scheduleSave();
  res.json({ ok: true, disconnected: req.params.source });
});

/* Draw data from a connected+consented source → universal signals (self only).
   Accepts `data` (raw provider export) — the real-time OAuth auto-fetch is the
   integration point. Data minimisation: connectors map to numeric signals only,
   never raw content. */
app.post('/api/me/sources/pull', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const src = connectors.get(req.body?.source);
  if (!src) return res.status(400).json({ error: 'unknown source' });
  if (!_hasConsent(code, userId, src.scope)) return res.status(403).json({ error: 'consent_required', scope: src.scope });
  const conn = connectedSources[_consentKey(code, userId)] || {};
  if (!conn[src.id]) return res.status(400).json({ error: 'not_connected' });

  const raw = Array.isArray(req.body?.data) ? req.body.data.slice(0, 2000) : [];   // integration point / manual export
  let signals = [];
  try { signals = src.map(raw) || []; } catch (_) { signals = []; }
  let emitted = 0;
  for (const s of signals) {
    if (!Number.isFinite(s.valueNum)) continue;
    try {
      _emitSignalSafe(code, {
        subjectType: 'member', subjectId: userId, source: 'metric', modality: 'data',
        valueNum: s.valueNum, label: s.label, ts: s.ts, sensitivity: 'normal',
        data: { connector: src.id, primitive: s.primitive, valence: s.valence },
      }, userId);
      emitted++;
    } catch (_) {}
  }
  conn[src.id].lastPull = new Date().toISOString();
  scheduleSave();
  res.json({ ok: true, source: src.id, imported: emitted });
});

/* ── The assistant: draft → APPROVE → execute. IntelliQ can act on your behalf
   (schedule a meeting, send a generic email) — but ONLY after you approve, and
   ONLY with write consent for that action. Nothing outward happens unilaterally.
   The provider call (Google Calendar / Microsoft Graph / mail) is the OAuth
   integration point; the draft + approval + consent gate are real today. */

app.get('/api/me/actions', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const list = (pendingActions[_consentKey(code, userId)] || []).filter(a => a.status === 'pending');
  res.json({ ok: true, actions: list, canDo: connectors.listActions() });
});

/* Draft an action (proposed by the user, or by IntelliQ on their behalf). Nothing
   is performed here — it becomes a pending item awaiting the person's approval. */
app.post('/api/me/actions', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const def = connectors.getAction(req.body?.action);
  if (!def) return res.status(400).json({ error: 'unknown action' });
  const prepared = def.prepare(req.body?.params || {});
  if (!prepared.valid) return res.status(400).json({ error: prepared.error || 'invalid params' });
  const key = _consentKey(code, userId);
  const item = { id: 'act_' + generateId(), action: def.id, writeScope: def.writeScope,
    summary: prepared.summary, payload: prepared.payload, status: 'pending', createdAt: new Date().toISOString() };
  (pendingActions[key] = pendingActions[key] || []).push(item);
  scheduleSave();
  res.json({ ok: true, action: { id: item.id, action: item.action, summary: item.summary, needsConsent: !_hasConsent(code, userId, def.writeScope) } });
});

/* Approve → EXECUTE. Requires write consent for the action's scope. The actual
   provider send is stubbed until OAuth; everything up to it is enforced. */
app.post('/api/me/actions/:id/approve', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const list = pendingActions[_consentKey(code, userId)] || [];
  const item = list.find(a => a.id === req.params.id && a.status === 'pending');
  if (!item) return res.status(404).json({ error: 'action not found' });
  if (!_hasConsent(code, userId, item.writeScope)) {
    return res.status(403).json({ error: 'consent_required', scope: item.writeScope, message: `Grant ${item.writeScope} to let IntelliQ do this for you.` });
  }
  // ── Provider integration point (OAuth write). Stubbed: mark executed. ──
  item.status = 'done'; item.executedAt = new Date().toISOString();
  item.result = 'Executed (provider integration pending — no external send in this build).';
  scheduleSave();
  res.json({ ok: true, id: item.id, status: 'done', result: item.result });
});

app.post('/api/me/actions/:id/reject', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const list = pendingActions[_consentKey(code, userId)] || [];
  const item = list.find(a => a.id === req.params.id && a.status === 'pending');
  if (item) { item.status = 'rejected'; scheduleSave(); }
  res.json({ ok: true });
});

/* ═══════════════════════════════════════════════════════════════════════════
   ASSESSMENTS — a leader defines a way they want something done (a spreadsheet,
   a film breakdown, a way of playing), assigns it, the assignee fills it and
   returns it, the leader reviews. Completions feed the kernel as signals so an
   assessment is not a dead form — it becomes part of the person's growth record.
   TUTORIALS — pinned how-to references anyone can look back at.
   ═══════════════════════════════════════════════════════════════════════════ */
const ASSESS_KINDS = ['spreadsheet', 'film', 'play', 'skill', 'general'];
const _shortId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
function _publicAssignment(a) {
  return { id: a.id, templateId: a.templateId, title: a.title, kind: a.kind, fields: a.fields,
    assignerName: a.assignerName, assigneeName: a.assigneeName, assigneeId: a.assigneeId,
    status: a.status, response: a.response || {}, note: a.note || '', feedback: a.feedback || '',
    score: a.score ?? null, assignedAt: a.assignedAt, submittedAt: a.submittedAt || null, returnedAt: a.returnedAt || null };
}

/* GET /api/assessments — everything the caller needs for the tab, role-scoped. */
app.get('/api/assessments', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const leader = _isLeader(code, userId);
  const all = assessmentAssignments[code] || [];
  res.json({
    ok: true,
    canCreate: leader,
    templates: (assessmentTemplates[code] || []).map(t => ({ id: t.id, title: t.title, description: t.description, kind: t.kind, fields: t.fields, createdByName: t.createdByName })),
    assigned: all.filter(a => a.assigneeId === userId).map(_publicAssignment),           // things I must fill
    issued:   leader ? all.filter(a => a.assignerId === userId).map(_publicAssignment) : [], // things I gave out
    tutorials: (orgTutorials[code] || []).map(t => ({ id: t.id, title: t.title, body: t.body, url: t.url, kind: t.kind, createdByName: t.createdByName, createdAt: t.createdAt })),
  });
});

/* POST /api/assessments/templates — a leader defines an assessment. */
app.post('/api/assessments/templates', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  if (!_isLeader(code, userId)) return res.status(403).json({ error: 'Only a leader can create assessments' });
  const { title, description, kind, fields } = req.body || {};
  if (!String(title || '').trim()) return res.status(400).json({ error: 'title required' });
  const me = orgUsers[code]?.[userId];
  const tpl = {
    id: _shortId(), title: String(title).slice(0, 160).trim(),
    description: String(description || '').slice(0, 2000),
    kind: ASSESS_KINDS.includes(kind) ? kind : 'general',
    fields: Array.isArray(fields) ? fields.slice(0, 30).map(f => ({ label: String(f?.label || '').slice(0, 160), hint: String(f?.hint || '').slice(0, 400) })).filter(f => f.label) : [],
    createdBy: userId, createdByName: me?.name || 'Leader', createdAt: new Date().toISOString(),
  };
  (assessmentTemplates[code] = assessmentTemplates[code] || []).push(tpl);
  scheduleSave();
  res.json({ ok: true, template: tpl });
});

app.delete('/api/assessments/templates/:id', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const list = assessmentTemplates[code] || [];
  const t = list.find(x => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'not found' });
  if (t.createdBy !== userId && !_isLeader(code, userId)) return res.status(403).json({ error: 'not allowed' });
  assessmentTemplates[code] = list.filter(x => x.id !== req.params.id);
  scheduleSave();
  res.json({ ok: true });
});

/* POST /api/assessments/assign — assign a template to people. A leader may assign
   to anyone in their visible range; anyone may self-assign (assign to themselves). */
app.post('/api/assessments/assign', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const { templateId, assigneeIds } = req.body || {};
  const tpl = (assessmentTemplates[code] || []).find(t => t.id === templateId);
  if (!tpl) return res.status(404).json({ error: 'template not found' });
  const targets = Array.isArray(assigneeIds) && assigneeIds.length ? assigneeIds : [userId];
  const leader = _isLeader(code, userId);
  const inRange = new Set(getVisibleUserIds(code, userId));
  const selfOnly = targets.every(id => id === userId);
  if (!selfOnly && !leader) return res.status(403).json({ error: 'Only a leader can assign to others' });
  const bad = targets.find(id => id !== userId && !inRange.has(id));
  if (bad) return res.status(403).json({ error: 'assignee outside your range' });
  const me = orgUsers[code]?.[userId];
  const created = [];
  targets.forEach(aid => {
    const subj = orgUsers[code]?.[aid];
    if (!subj) return;
    const a = {
      id: _shortId(), templateId: tpl.id, title: tpl.title, kind: tpl.kind, fields: tpl.fields,
      assignerId: userId, assignerName: me?.name || 'Leader', assigneeId: aid, assigneeName: subj.name || 'Member',
      status: 'assigned', response: {}, note: '', feedback: '', score: null,
      assignedAt: new Date().toISOString(),
    };
    (assessmentAssignments[code] = assessmentAssignments[code] || []).push(a);
    created.push(_publicAssignment(a));
  });
  scheduleSave();
  res.json({ ok: true, assigned: created });
});

/* POST /api/assessments/:id/submit — the assignee fills it in and returns it. */
app.post('/api/assessments/:id/submit', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const a = (assessmentAssignments[code] || []).find(x => x.id === req.params.id);
  if (!a) return res.status(404).json({ error: 'not found' });
  if (a.assigneeId !== userId) return res.status(403).json({ error: 'not your assessment' });
  const { response, note } = req.body || {};
  a.response = (response && typeof response === 'object') ? response : {};
  a.note = String(note || '').slice(0, 4000);
  a.status = 'submitted'; a.submittedAt = new Date().toISOString();
  // Completing an assessment is a participation signal — the kernel learns the
  // person engaged (never the private contents; just that it was done).
  _emitSignalSafe(code, {
    subjectType: 'member', subjectId: userId, source: 'assessment', modality: 'number',
    label: `Assessment completed: ${a.title}`.slice(0, 120), valueNum: 1, primitive: 'participation', sensitivity: 'normal',
  }, userId);
  scheduleSave();
  res.json({ ok: true, assignment: _publicAssignment(a) });
});

/* POST /api/assessments/:id/return — the assigner reviews: feedback + optional score. */
app.post('/api/assessments/:id/return', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const a = (assessmentAssignments[code] || []).find(x => x.id === req.params.id);
  if (!a) return res.status(404).json({ error: 'not found' });
  const canReview = a.assignerId === userId || (_isLeader(code, userId) && new Set(getVisibleUserIds(code, userId)).has(a.assigneeId));
  if (!canReview) return res.status(403).json({ error: 'not allowed' });
  const { feedback, score } = req.body || {};
  a.feedback = String(feedback || '').slice(0, 4000);
  const s = Number(score);
  a.score = Number.isFinite(s) ? Math.max(0, Math.min(100, s)) : a.score;
  a.status = 'returned'; a.returnedAt = new Date().toISOString();
  // A returned score is a citable capability signal about the subject.
  if (Number.isFinite(a.score)) _emitSignalSafe(code, {
    subjectType: 'member', subjectId: a.assigneeId, source: 'assessment', modality: 'number',
    label: `Assessment score: ${a.title}`.slice(0, 120), valueNum: a.score, primitive: 'capability', sensitivity: 'normal',
  }, userId);
  scheduleSave();
  res.json({ ok: true, assignment: _publicAssignment(a) });
});

/* Tutorials — pinned how-to references. Leaders pin; everyone can read. */
app.post('/api/tutorials', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  if (!_isLeader(code, userId)) return res.status(403).json({ error: 'Only a leader can pin a tutorial' });
  const { title, body, url, kind } = req.body || {};
  if (!String(title || '').trim()) return res.status(400).json({ error: 'title required' });
  const me = orgUsers[code]?.[userId];
  const t = {
    id: _shortId(), title: String(title).slice(0, 160).trim(),
    body: String(body || '').slice(0, 5000), url: String(url || '').slice(0, 500),
    kind: ASSESS_KINDS.includes(kind) ? kind : 'general',
    createdBy: userId, createdByName: me?.name || 'Leader', createdAt: new Date().toISOString(),
  };
  (orgTutorials[code] = orgTutorials[code] || []).push(t);
  scheduleSave();
  res.json({ ok: true, tutorial: t });
});

app.delete('/api/tutorials/:id', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const list = orgTutorials[code] || [];
  const t = list.find(x => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'not found' });
  if (t.createdBy !== userId && !_isLeader(code, userId)) return res.status(403).json({ error: 'not allowed' });
  orgTutorials[code] = list.filter(x => x.id !== req.params.id);
  scheduleSave();
  res.json({ ok: true });
});

/* POST /api/admin/llm-selftest — prove the language model is connected and show
   how it reasons on demo-style prompts. Admin-gated (manage_settings). No shell
   needed: runs from the browser against whatever key the host has configured.
   With no key, reports that the kernel is on its deterministic fallbacks. */
app.post('/api/admin/llm-selftest', requirePermission('manage_settings'), async (req, res) => {
  const status = {
    enabled:   ai.enabled(),
    models:    ai.MODELS,
    providers: { claude: !!process.env.ANTHROPIC_API_KEY, openai: !!process.env.OPENAI_API_KEY },
  };
  if (!ai.enabled()) {
    return res.json({ ok: true, status, results: [],
      note: 'No language-model key is configured on this host. Set ANTHROPIC_API_KEY (or OPENAI_API_KEY) and the kernel will use it; until then it runs on its deterministic fallbacks.' });
  }
  // Two demo-shaped prompts — the kind of content the seeded orgs produce — one
  // per tier, so you see both the fast path and the reasoning path.
  const trials = [
    { tier: 'micro', label: 'Check-in acknowledgement (fast tier)',
      system: 'You are a supportive coach. Reply in ONE warm, genuine sentence. No emojis.',
      user:   'A team member wrote: "Tough week — legs feel heavy but I got through every session." Acknowledge it warmly.' },
    { tier: 'reason', label: 'Coaching reflection (reasoning tier)',
      system: 'You are a thoughtful performance coach. In 2–3 sentences, reflect on what this pattern suggests and offer one gentle next step. No emojis, no lists.',
      user:   "Over six weeks a player's participation stayed high, but their self-reported energy has drifted down three weeks running. What might be going on, and what's one supportive step?" },
  ];
  const results = [];
  for (const t of trials) {
    const started = Date.now();
    try {
      const out = await ai.complete({ tier: t.tier, system: t.system, user: t.user, maxTokens: 160 });
      results.push({ label: t.label, tier: t.tier, model: ai.MODELS[t.tier], ms: Date.now() - started, ok: true, output: out });
    } catch (e) {
      results.push({ label: t.label, tier: t.tier, model: ai.MODELS[t.tier], ms: Date.now() - started, ok: false, error: e.message });
    }
  }
  res.json({ ok: true, status, results });
});

/* Aggregate a SET of people into a privacy-safe unit read (counts + pattern
   types + percentages only — never a name or private detail). Shared by the
   overall range roll-up and each sub-unit. */
const _POSITIVE_PATTERNS = new Set(['recovering', 'quiet_improvement']);
function _aggregatePeople(code, ids, now, monday) {
  const users = ids.map(id => orgUsers[code]?.[id]).filter(u => u && u.role !== 'superadmin');
  const patternCounts = {}; let attention = 0, positive = 0, active = 0;
  const traj = { up: 0, down: 0, steady: 0 };
  const idSet = new Set(users.map(u => u.id));
  users.forEach(u => {
    let m; try { m = _buildMemberIntelInput(code, u, now); } catch (_) { m = null; }
    (m ? intel.detectPatterns(m) : []).forEach(p => {
      patternCounts[p.type] = (patternCounts[p.type] || 0) + 1;
      if (p.severity === 'high') attention++;
      if (_POSITIVE_PATTERNS.has(p.type)) positive++;
    });
    const tr = m?.memberTrajectory; if (tr && traj[tr] != null) traj[tr]++;
    const ck = memberCheckins[userKey(code, u.id)] || memberCheckins[memberKey(code, u.name || '')] || [];
    if (ck.some(c => c.ts && new Date(c.ts) >= monday)) active++;
  });
  const recognition = (orgSignals[code] || []).filter(s =>
    s.source === 'observation' && s.data && s.data.kind === 'recognition' &&
    idSet.has(s.subjectId) && new Date(s.ts) >= monday).length;
  const size = users.length;
  const pct = n => size ? Math.round((n / size) * 100) : 0;
  const status = size === 0 ? 'no-data'
    : attention >= Math.ceil(size * 0.34) ? 'strained'
    : positive >= attention ? 'thriving' : 'steady';
  const topConcern = Object.entries(patternCounts).filter(([t]) => !_POSITIVE_PATTERNS.has(t)).sort((a, b) => b[1] - a[1])[0];
  return {
    size, active, status, attention, positive, recognition,
    percent: { active: pct(active), needsAttention: pct(attention), doingWell: pct(positive) },
    trajectory: traj.down > traj.up && traj.down >= traj.steady ? 'down' : traj.up > traj.steady ? 'up' : 'steady',
    focus: topConcern ? (intel.PATTERN_LABEL[topConcern[0]] || topConcern[0]) : null,
    focusAction: topConcern ? (intel.DEFAULT_ACTION[topConcern[0]] || null) : null,
    momentum: positive * 2 + recognition - attention * 2,
  };
}

/* GET /api/org/divisions — oversight roll-up for ANY leader, scoped to THEIR
   range (their node + everything beneath it, all the way down — via
   getVisibleUserIds). A head-of-department sees their whole sub-tree as
   aggregate PERCENTAGES; the CEO sees the org. Privacy-safe: counts + pattern
   types + percentages only, never a name or private detail. */
app.get('/api/org/divisions', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const range = getVisibleUserIds(code, userId).filter(id => id !== userId);   // the people they oversee
  if (range.length === 0 && !(orgUsers[code]?.[userId]?.role === 'superadmin')) {
    return res.status(403).json({ error: 'This view is for leaders — it shows the people you oversee.' });
  }
  const now = Date.now();
  const monday = new Date(now); const dow = monday.getDay();
  monday.setDate(monday.getDate() - (dow === 0 ? 6 : dow - 1)); monday.setHours(0, 0, 0, 0);
  const rangeSet = new Set(range);

  // Overall — everyone in this leader's range, as percentages.
  const overall = _aggregatePeople(code, range, now, monday);

  // Per sub-unit — only groups that intersect the range, only the visible members.
  const units = (orgGroups[code] || [])
    .map(g => ({ g, ids: (g.memberIds || []).filter(id => rangeSet.has(id)) }))
    .filter(x => x.ids.length)
    .map(({ g, ids }) => ({ id: g.id, name: g.name, ..._aggregatePeople(code, ids, now, monday) }));

  const STAT = { thriving: 0, steady: 1, strained: 2, 'no-data': 3 };
  units.sort((a, b) => STAT[a.status] - STAT[b.status] || b.momentum - a.momentum);
  const best = [...units].filter(u => u.size > 0).sort((a, b) => b.momentum - a.momentum)[0];
  const unitOfWeek = best && (best.positive > 0 || best.recognition > 0)
    ? { name: best.name, why: `Best momentum this week — ${best.percent.doingWell}% doing well${best.recognition ? `, ${best.recognition} recognitions` : ''}, ${best.percent.needsAttention}% needing attention.` }
    : null;

  res.json({
    ok: true, generatedAt: new Date().toISOString(),
    range: { people: overall.size, ...overall.percent, status: overall.status, trajectory: overall.trajectory, focus: overall.focus, focusAction: overall.focusAction },
    divisions: units.map(({ momentum, ...u }) => u),
    unitOfWeek,
    summary: { total: units.length, thriving: units.filter(u => u.status === 'thriving').length, strained: units.filter(u => u.status === 'strained').length },
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   SPRINT 2 — METRICS
   Three sources: org (superadmin-defined), shared (leader), personal (member)
   ═══════════════════════════════════════════════════════════════════════════ */

app.get('/api/metrics', requireAuth, (req, res) => {
  const code = req.iqSession.orgCode;
  res.json({ ok: true, metrics: orgMetrics[code] || [] });
});

app.post('/api/metrics', requirePermission('manage_metrics'), (req, res) => {
  const code = req.iqSession.orgCode;
  const { name, source } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  if (!orgMetrics[code]) orgMetrics[code] = [];
  const metric = {
    metricId: 'met_' + generateId(),
    name:     name.trim(),
    source:   source || 'org',
    order:    orgMetrics[code].length,
    createdAt: new Date().toISOString(),
  };
  orgMetrics[code].push(metric);
  scheduleSave();
  res.json({ ok: true, metric });
});

app.put('/api/metrics/:metricId', requirePermission('manage_metrics'), (req, res) => {
  const code   = req.iqSession.orgCode;
  const metric = (orgMetrics[code] || []).find(m => m.metricId === req.params.metricId);
  if (!metric) return res.status(404).json({ error: 'Metric not found' });
  if (req.body.name  !== undefined) metric.name  = req.body.name.trim();
  if (req.body.order !== undefined) metric.order = req.body.order;
  scheduleSave();
  res.json({ ok: true, metric });
});

app.delete('/api/metrics/:metricId', requirePermission('manage_metrics'), (req, res) => {
  const code = req.iqSession.orgCode;
  if (!orgMetrics[code]) return res.status(404).json({ error: 'Not found' });
  const before = orgMetrics[code].length;
  orgMetrics[code] = orgMetrics[code].filter(m => m.metricId !== req.params.metricId);
  if (orgMetrics[code].length === before) return res.status(404).json({ error: 'Metric not found' });
  scheduleSave();
  res.json({ ok: true });
});

// AI metric suggestions
app.post('/api/metrics/suggest', requirePermission('manage_metrics'), async (req, res) => {
  const code   = req.iqSession.orgCode;
  const meta   = orgMeta[code] || {};
  const desc   = req.body.description || meta.orgDescription || meta.orgName || '';
  const values = orgValues[code] || [];
  try {
    const response = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system:     'You are a performance measurement expert. Output valid JSON only.',
      messages:   [{
        role:    'user',
        content: `Suggest 5-8 performance metrics for an organisation described as: "${desc}"${values.length ? '. Their values are: ' + values.join(', ') : ''}.
Output JSON array of strings: ["Metric Name 1", "Metric Name 2", ...]. Be specific to the organisation. No generic HR metrics.`,
      }],
    });
    const raw  = response.content[0]?.text || '[]';
    const json = raw.replace(/```json\n?|\n?```/g, '').trim();
    const suggestions = JSON.parse(json);
    res.json({ ok: true, suggestions });
  } catch(e) {
    res.status(500).json({ error: 'AI unavailable', detail: e.message });
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   SPRINT 2 — VALUES STORE
   ═══════════════════════════════════════════════════════════════════════════ */

app.get('/api/values', requireAuth, (req, res) => {
  const code = req.iqSession.orgCode;
  res.json({ ok: true, values: orgValues[code] || [] });
});

app.put('/api/values', requirePermission('manage_values'), (req, res) => {
  const code = req.iqSession.orgCode;
  const { values } = req.body;
  if (!Array.isArray(values)) return res.status(400).json({ error: 'values must be an array of strings' });
  orgValues[code] = values.map(v => String(v).trim()).filter(Boolean);
  scheduleSave();
  res.json({ ok: true, values: orgValues[code] });
});

/* ═══════════════════════════════════════════════════════════════════════════
   SPRINT 2 — GOALS STORE (org-level goals)
   ═══════════════════════════════════════════════════════════════════════════ */

app.get('/api/goals', requireAuth, (req, res) => {
  const code = req.iqSession.orgCode;
  res.json({ ok: true, goals: orgGoals[code] || [] });
});

app.post('/api/goals', requirePermission('manage_goals'), (req, res) => {
  const code = req.iqSession.orgCode;
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });
  if (!orgGoals[code]) orgGoals[code] = [];
  const goal = { goalId: 'goal_' + generateId(), text: text.trim(), createdAt: new Date().toISOString(), status: 'active' };
  orgGoals[code].push(goal);
  scheduleSave();
  res.json({ ok: true, goal });
});

app.put('/api/goals/:goalId', requirePermission('manage_goals'), (req, res) => {
  const code = req.iqSession.orgCode;
  const goal = (orgGoals[code] || []).find(g => g.goalId === req.params.goalId);
  if (!goal) return res.status(404).json({ error: 'Goal not found' });
  if (req.body.text   !== undefined) goal.text   = req.body.text.trim();
  if (req.body.status !== undefined) goal.status = req.body.status;
  scheduleSave();
  res.json({ ok: true, goal });
});

app.delete('/api/goals/:goalId', requirePermission('manage_goals'), (req, res) => {
  const code = req.iqSession.orgCode;
  if (!orgGoals[code]) return res.status(404).json({ error: 'Not found' });
  orgGoals[code] = orgGoals[code].filter(g => g.goalId !== req.params.goalId);
  scheduleSave();
  res.json({ ok: true });
});

/* ═══════════════════════════════════════════════════════════════════════════
   SPRINT 2 — PERMISSIONS
   ═══════════════════════════════════════════════════════════════════════════ */

app.get('/api/permissions', requirePermission('manage_permissions'), (req, res) => {
  const code = req.iqSession.orgCode;
  res.json({ ok: true, permissions: userPermissions[code] || {} });
});

app.put('/api/permissions', requirePermission('manage_permissions'), (req, res) => {
  const code   = req.iqSession.orgCode;
  const { userId, grants } = req.body;
  if (!userId || typeof grants !== 'object') return res.status(400).json({ error: 'userId and grants object required' });
  if (!orgUsers[code]?.[userId]) return res.status(404).json({ error: 'User not found' });
  if (!userPermissions[code]) userPermissions[code] = {};
  userPermissions[code][userId] = { ...(userPermissions[code][userId] || {}), ...grants };
  scheduleSave();
  res.json({ ok: true, permissions: userPermissions[code][userId] });
});

/* ═══════════════════════════════════════════════════════════════════════════
   GROUPS — Sub-teams within an org
   ═══════════════════════════════════════════════════════════════════════════ */

const orgGroups   = {};  // populated at startup via _loadAllStores()
const orgNotes    = {};
const orgMessages = {};

function noteId()  { return 'n_'   + generateId(); }
function msgId()   { return 'm_'   + generateId(); }
function groupId() { return 'grp_' + generateId(); }

/* ── Create group ─────────────────────────────────────────────────────────── */
app.post('/api/groups/create', (req, res) => {
  const { orgCode, name, description, memberIds, leadIds } = req.body;
  if (!orgCode || !name) return res.status(400).json({ error: 'orgCode and name required' });
  const code = orgCode.toLowerCase().trim();
  if (!orgGroups[code]) orgGroups[code] = [];
  const group = { id: groupId(), name, description: description || '', memberIds: memberIds || [], leadIds: leadIds || [], goals: [], traits: [], copilotEnabled: false, createdAt: new Date().toISOString() };
  orgGroups[code].push(group);
  scheduleSave();
  res.json({ ok: true, group });
});

/* ── List groups for org (filtered by memberId if provided) ─────────────── */
app.get('/api/groups', (req, res) => {
  const { orgCode, memberId } = req.query;
  if (!orgCode) return res.status(400).json({ error: 'orgCode required' });
  let groups = orgGroups[orgCode.toLowerCase().trim()] || [];
  if (memberId) {
    groups = groups.filter(g => g.memberIds.includes(memberId) || g.leadIds.includes(memberId));
  }
  res.json({ groups });
});

/* ── Update group ────────────────────────────────────────────────────────── */
app.put('/api/groups/:groupId', (req, res) => {
  const { orgCode, name, description, memberIds, leadIds } = req.body;
  const code   = orgCode?.toLowerCase().trim();
  const groups = orgGroups[code] || [];
  const g      = groups.find(g => g.id === req.params.groupId);
  if (!g) return res.status(404).json({ error: 'Group not found' });
  if (name        !== undefined) g.name        = name;
  if (description !== undefined) g.description = description;
  if (memberIds   !== undefined) g.memberIds   = memberIds;
  if (leadIds     !== undefined) g.leadIds     = leadIds;
  scheduleSave();
  res.json({ ok: true, group: g });
});

/* ── Set a group's GOALS & TRAITS (the TEAM frame) ────────────────────────────
   Only a LEAD of the group (or an admin/superadmin) may set its aims — being a
   member is not enough. This is the membership-vs-leadership distinction: a coach
   leads "Quarterbacks" (can set goals) but is only a member of "Staff" (cannot). */
app.put('/api/groups/:groupId/aims', requireAuth, (req, res) => {
  const { orgCode, userId } = req.iqSession;
  const code   = orgCode;
  const groups = orgGroups[code] || [];
  const g      = groups.find(g => g.id === req.params.groupId);
  if (!g) return res.status(404).json({ error: 'Group not found' });

  const isLead  = (g.leadIds || []).includes(userId);
  const isAdmin = orgUsers[code]?.[userId]?.role === 'superadmin' || _userHasPerm(code, userId, 'manage_goals');
  if (!isLead && !isAdmin) {
    return res.status(403).json({ error: 'Only a lead of this group can set its goals and traits.' });
  }

  const clean = arr => Array.isArray(arr)
    ? [...new Set(arr.map(s => String(s).trim()).filter(Boolean))].slice(0, 20)
    : undefined;
  const goals  = clean(req.body.goals);
  const traits = clean(req.body.traits);
  if (goals  !== undefined) g.goals  = goals;
  if (traits !== undefined) g.traits = traits;
  scheduleSave();
  res.json({ ok: true, group: g });
});

/* ── PUT /api/groups/:groupId/copilot-settings — lead enables/disables Copilot ─
   The real consent gate: no analysis happens unless the lead turns it on. */
app.put('/api/groups/:groupId/copilot-settings', requireAuth, (req, res) => {
  const { orgCode, userId } = req.iqSession;
  const code = orgCode;
  const g    = (orgGroups[code] || []).find(g => g.id === req.params.groupId);
  if (!g) return res.status(404).json({ error: 'Group not found' });
  const isLead  = (g.leadIds || []).includes(userId);
  const isAdmin = orgUsers[code]?.[userId]?.role === 'superadmin' || _userHasPerm(code, userId, 'manage_settings');
  if (!isLead && !isAdmin) return res.status(403).json({ error: 'Only a lead can change Copilot settings.' });
  if (typeof req.body.enabled === 'boolean') g.copilotEnabled = req.body.enabled;
  scheduleSave();
  res.json({ ok: true, copilotEnabled: !!g.copilotEnabled });
});

/* ── GET /api/groups/:groupId/copilot — the Group Copilot (coach for the LEAD) ─
   Positioned as "help the group reach its stated goals", NOT "monitoring".
   SIGNALS-FIRST (participation / activity / goal signals — not message content),
   AGGREGATE-ONLY (advice, never naming or exposing individuals), DIRECTIONAL
   language (no scores). Through the AI gateway + privacy gate. Lead-only, and
   only runs when the lead has enabled the Copilot for the group. */
app.get('/api/groups/:groupId/copilot', requireAuth, async (req, res) => {
  const { orgCode, userId } = req.iqSession;
  const code = orgCode;
  const g    = (orgGroups[code] || []).find(g => g.id === req.params.groupId);
  if (!g) return res.status(404).json({ error: 'Group not found' });

  const isLead  = (g.leadIds || []).includes(userId);
  const isAdmin = orgUsers[code]?.[userId]?.role === 'superadmin' || _userHasPerm(code, userId, 'view_analytics');
  if (!isLead && !isAdmin) return res.status(403).json({ error: 'Only a lead of this group can use the Copilot.' });

  if (!g.copilotEnabled) return res.json({ ok: true, enabled: false });

  const memberIds = [...new Set([...(g.memberIds || []), ...(g.leadIds || [])])].filter(id => id !== userId);
  const now    = Date.now();
  const WEEK   = 7 * 86400000;

  // ── SIGNALS (no message content) ──────────────────────────────────────────
  let active7 = 0, activePrev = 0;            // members active this week / prior week
  let quietCount = 0;                          // became/stayed quiet (10+ days)
  let moodSum = 0, moodCnt = 0;
  memberIds.forEach(id => {
    const u = orgUsers[code]?.[id]; if (!u) return;
    const cks = memberCheckins[userKey(code, id)] || memberCheckins[memberKey(code, u.name || '')] || [];
    let a7 = false, aPrev = false, lastTs = null;
    cks.forEach(c => {
      const t = new Date(c.ts || c.date).getTime(); if (isNaN(t)) return;
      lastTs = Math.max(lastTs || 0, t);
      if (now - t < WEEK) a7 = true;
      else if (now - t < 2 * WEEK) aPrev = true;
      if (c.mood != null && now - t < 2 * WEEK) { moodSum += Number(c.mood); moodCnt++; }
    });
    if (a7) active7++;
    if (aPrev) activePrev++;
    const days = lastTs ? Math.floor((now - lastTs) / 86400000) : null;
    if (days === null || days >= 10) quietCount++;
  });

  // Group message volume (count only — never content) this week vs prior
  let msg7 = 0, msgPrev = 0;
  Object.values(orgMessages).forEach(m => {
    if (m.orgCode !== code || m.toType !== 'group' || m.toId !== g.id) return;
    const t = new Date(m.createdAt).getTime(); if (isNaN(t)) return;
    if (now - t < WEEK) msg7++; else if (now - t < 2 * WEEK) msgPrev++;
  });

  const total       = memberIds.length;
  const participation = total ? Math.round((active7 / total) * 100) : 0;
  const recentAct   = active7 + msg7;
  const priorAct    = activePrev + msgPrev;
  const engagementTrend = priorAct === 0 ? (recentAct > 0 ? 'Increasing' : 'Quiet')
    : recentAct > priorAct * 1.15 ? 'Increasing'
    : recentAct < priorAct * 0.85 ? 'Decreasing' : 'Steady';

  // Directional health (no score)
  const health = total === 0 ? 'No members yet'
    : participation >= 70 ? 'Sustaining'
    : participation >= 40 ? 'Holding'
    : 'Needs attention';
  const healthColor = health === 'Sustaining' ? 'green' : health === 'Holding' ? 'yellow' : 'red';

  // Goal progress (directional, heuristic until Phase 2 goal-progress signals)
  const goalProgress = !(g.goals && g.goals.length) ? 'No goals set'
    : participation >= 70 && engagementTrend !== 'Decreasing' ? 'Strong'
    : participation >= 40 ? 'Moderate' : 'Early';

  // ── AI: actions / prompts / reflection — from SIGNALS + goals/traits only ──
  const signalBrief = [
    `Group: ${g.name} (${total} members).`,
    g.goals?.length  ? `Goals: ${g.goals.join('; ')}.`   : 'Goals: none set.',
    g.traits?.length ? `Traits: ${g.traits.join(', ')}.` : 'Traits: none set.',
    `Participation this week: ${participation}% (${active7}/${total}).`,
    `Engagement trend: ${engagementTrend}.`,
    `Members who have gone quiet (10+ days): ${quietCount}.`,
    moodCnt ? `Recent average mood: ${Math.round((moodSum / moodCnt) * 10) / 10}/5.` : 'Mood: no recent data.',
    `Goal progress (directional): ${goalProgress}.`,
  ].join('\n');

  const system = [
    `You are the IntelliQ Group Copilot — a coach for the group's LEAD. Your job is to help the group move toward its stated goals. You are NOT a monitor and you do not surveil members.`,
    privacy.GATE_DIRECTIVE,
    `Hard rules: speak in AGGREGATE only — never name or single out an individual. Give the lead ADVICE, not exposure. Use directional language, never scores. Tie everything to the group's goals and traits.`,
    _worldviewDirective(code),
  ].filter(Boolean).join('\n\n');

  const user = [
    'SIGNALS (counts and trends only — no message content):',
    signalBrief,
    '',
    'Return ONLY JSON: {"actions":["1-3 aggregate suggested actions for the lead, e.g. \'Some members have gone quiet — reach out personally\'"],"prompts":["2-3 discussion prompts derived from the group goals/traits the lead could post"],"reflection":"one short weekly reflection: what may be helping vs slowing progress toward the goals"}',
  ].join('\n');

  let out = null;
  try {
    out = await ai.completeJSON({ tier: 'reason', system, user, maxTokens: 500, schema: ['actions'] });
  } catch (err) {
    console.warn('[group-copilot] AI error:', err.message);
  }

  res.json({
    ok: true,
    enabled:   true,
    groupName: g.name,
    health, healthColor,
    participation,
    goalProgress,
    engagementTrend,
    hasGoals:  !!(g.goals && g.goals.length),
    actions:   Array.isArray(out?.actions) ? out.actions.slice(0, 3)
               : (quietCount > 0 ? [`${quietCount} member(s) have become less active — consider reaching out personally to see how they're doing.`] : []),
    prompts:   Array.isArray(out?.prompts) ? out.prompts.slice(0, 3) : [],
    reflection: out?.reflection || null,
  });
});

/* ── Delete group ─────────────────────────────────────────────────────────── */
app.delete('/api/groups/:groupId', (req, res) => {
  const { orgCode } = req.body;
  const code = orgCode?.toLowerCase().trim();
  if (!orgGroups[code]) return res.status(404).json({ error: 'Org not found' });
  orgGroups[code] = orgGroups[code].filter(g => g.id !== req.params.groupId);
  scheduleSave();
  res.json({ ok: true });
});

/* ═══════════════════════════════════════════════════════════════════════════
   NOTES — Private / Shared / Anonymous
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── Create note ─────────────────────────────────────────────────────────── */
app.post('/api/notes', async (req, res) => {
  const { orgCode, authorId, authorName, content, type, tag, groupId: gid, orgMode, orgName, goals } = req.body;
  if (!orgCode || !authorId || !content || !type) return res.status(400).json({ error: 'missing fields' });

  const id   = noteId();
  const note = {
    id, orgCode: orgCode.toLowerCase().trim(),
    groupId: gid || null,
    authorId, authorName,
    content, type,
    tag: tag || null,
    // Phase 1: classify sensitivity at write time so the privacy gate can act
    // on it later (private may inform AI reasoning, never be revealed).
    sensitivity: privacy.classifyText(content, { type, tag }),
    createdAt: new Date().toISOString(),
    aiResponse: null,
  };
  orgNotes[id] = note;

  const shouldGetAIResponse = type === 'private' || type === 'anonymous' || type === 'shared';
  if (shouldGetAIResponse) {
    const prompts = {
      private:   `You are IntelliQ, a private AI companion. Someone has written a private note — only they and you see this. Respond with 1-2 sentences: acknowledge what they've written with genuine care, and if useful, offer one thought or gentle prompt to go deeper. Be warm and human, not clinical.`,
      shared:    `You are IntelliQ. Someone has written a note they're sharing with their group. Acknowledge it briefly (1 sentence) and note anything that might be useful context for their goals or development. Max 2 sentences.`,
      anonymous: `You are IntelliQ. Someone has posted an anonymous note to their group. Acknowledge it (1 sentence). This response is shown only to the author — not the group. Max 2 sentences.`,
    };
    const userMsg = goals?.goal ? `Their goal: "${goals.goal}"\n\nNote: ${content}` : `Note: ${content}`;
    try {
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001', max_tokens: 100,
        system: [prompts[type] || prompts.private, _worldviewDirective(note.orgCode), _memberValuesDirective(note.orgCode, authorId)].filter(Boolean).join('\n\n'),
        messages: [{ role: 'user', content: userMsg }],
      });
      note.aiResponse = response.content[0]?.text?.trim() || null;
    } catch(e) { /* non-critical */ }
  }

  // Every note becomes a signal the AI can use (private/anonymous → inform-only).
  _emitSignalSafe(note.orgCode, {
    subjectType: 'member', subjectId: authorId, source: 'note',
    modality: 'text', label: note.tag || null, valueText: content,
    sensitivity: note.sensitivity,
  }, authorId);

  scheduleSave();
  res.json({ ok: true, note: _sanitizeNote(note, authorId) });
});

/* ── Get notes — requires auth ───────────────────────────────────────────── */
app.get('/api/notes', requireAuth, (req, res) => {
  const { groupId: gid, type } = req.query;
  // SECURITY: identity comes from the session, never the query. Previously
  // requesterId was read from the query, so any logged-in user could read
  // another member's PRIVATE notes by passing their id (IDOR). Fixed 2026-07-09.
  const code        = req.iqSession.orgCode;
  const requesterId = req.iqSession.userId;
  if (!code || !requesterId) return res.status(403).json({ error: 'Forbidden' });

  const myGroups = (orgGroups[code] || []).filter(g =>
    g.memberIds.includes(requesterId) || g.leadIds.includes(requesterId)
  ).map(g => g.id);

  const notes = Object.values(orgNotes)
    .filter(n => {
      if (n.orgCode !== code) return false;
      if (gid && n.groupId !== gid) return false;
      if (type && n.type !== type) return false;
      if (n.type === 'private') return n.authorId === requesterId;
      if (n.groupId) return myGroups.includes(n.groupId) || n.authorId === requesterId;
      return n.authorId === requesterId;
    })
    .map(n => _sanitizeNote(n, requesterId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  res.json({ notes });
});

function _sanitizeNote(note, requesterId) {
  if (note.type === 'anonymous' && note.authorId !== requesterId) {
    return { ...note, authorId: null, authorName: 'Anonymous' };
  }
  return note;
}

/* ── Delete own note ─────────────────────────────────────────────────────── */
app.delete('/api/notes/:noteId', (req, res) => {
  const { requesterId } = req.body;
  const note = orgNotes[req.params.noteId];
  if (!note) return res.status(404).json({ error: 'Note not found' });
  if (note.authorId !== requesterId) return res.status(403).json({ error: 'Not your note' });
  delete orgNotes[req.params.noteId];
  scheduleSave();
  res.json({ ok: true });
});

/* ═══════════════════════════════════════════════════════════════════════════
   MESSAGES — Known or Anonymous, to a person / group / org
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── Send message ─────────────────────────────────────────────────────────── */
app.post('/api/messages/send', (req, res) => {
  const { orgCode, fromId, fromName, toType, toId, content, anonymous } = req.body;
  if (!orgCode || !fromId || !content || !toType) return res.status(400).json({ error: 'missing fields' });
  const id  = msgId();
  const msg = {
    id, orgCode: orgCode.toLowerCase().trim(),
    fromId, fromName: anonymous ? 'Anonymous' : fromName,
    _realFromId: fromId,
    toType, toId: toId || null,
    content, anonymous: !!anonymous,
    createdAt: new Date().toISOString(),
    readBy: [],
  };
  orgMessages[id] = msg;
  scheduleSave();
  res.json({ ok: true, messageId: id });
});

/* ── Get messages — requires auth ────────────────────────────────────────── */
app.get('/api/messages', requireAuth, (req, res) => {
  const { groupId: gid, toType } = req.query;
  // SECURITY: identity from the session, never the query — previously a
  // caller-supplied requesterId let any logged-in user read another member's
  // direct messages (IDOR). Fixed 2026-07-09.
  const code        = req.iqSession.orgCode;
  const requesterId = req.iqSession.userId;
  if (!code || !requesterId) return res.status(403).json({ error: 'Forbidden' });

  const myGroups = (orgGroups[code] || []).filter(g =>
    g.memberIds.includes(requesterId) || g.leadIds.includes(requesterId)
  ).map(g => g.id);

  const msgs = Object.values(orgMessages)
    .filter(m => {
      if (m.orgCode !== code) return false;
      if (gid && m.toId !== gid) return false;
      if (toType && m.toType !== toType) return false;
      if (m._realFromId === requesterId) return true;
      if (m.toType === 'user' && m.toId === requesterId) return true;
      if (m.toType === 'group' && myGroups.includes(m.toId)) return true;
      if (m.toType === 'org' && m.orgCode === code) return true;
      return false;
    })
    .map(m => _sanitizeMsg(m, requesterId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  res.json({ messages: msgs });
});

/* ── Mark message read ───────────────────────────────────────────────────── */
app.post('/api/messages/:msgId/read', (req, res) => {
  const { requesterId } = req.body;
  const m = orgMessages[req.params.msgId];
  if (!m) return res.status(404).json({ error: 'Not found' });
  if (!m.readBy.includes(requesterId)) m.readBy.push(requesterId);
  scheduleSave();
  res.json({ ok: true });
});

function _sanitizeMsg(msg, requesterId) {
  if (msg.anonymous && msg._realFromId !== requesterId) {
    const { _realFromId, ...safe } = msg;
    return safe;
  }
  const { _realFromId, ...safe } = msg;
  return safe;
}

/* ── Group feed (shared + anonymous notes + messages) ────────────────────── */
app.get('/api/groups/:groupId/feed', requireAuth, (req, res) => {
  // SECURITY: identity from the session, never the query. Was unauthenticated and
  // trusted a caller-supplied requesterId for group-membership checks (IDOR).
  const code        = req.iqSession.orgCode;
  const requesterId = req.iqSession.userId;
  if (!code || !requesterId) return res.status(403).json({ error: 'Forbidden' });
  const gid  = req.params.groupId;

  const groups = orgGroups[code] || [];
  const group  = groups.find(g => g.id === gid);
  if (group) {
    const isMemberOrLead = group.memberIds.includes(requesterId) || group.leadIds.includes(requesterId);
    const users = orgUsers[code] || {};
    const requesterUser = users[requesterId];
    const isOrgStaff = requesterUser && ['superadmin','admin','coach'].includes(requesterUser.role);
    if (!isMemberOrLead && !isOrgStaff) {
      return res.status(403).json({ error: 'Not a member of this group' });
    }
  }

  const notes = Object.values(orgNotes)
    .filter(n => n.orgCode === code && n.groupId === gid && (n.type === 'shared' || n.type === 'anonymous'))
    .map(n => _sanitizeNote(n, requesterId))
    .sort((a,b) => b.createdAt.localeCompare(a.createdAt));

  const messages = Object.values(orgMessages)
    .filter(m => m.orgCode === code && m.toType === 'group' && m.toId === gid)
    .map(m => _sanitizeMsg(m, requesterId))
    .sort((a,b) => b.createdAt.localeCompare(a.createdAt));

  res.json({ notes, messages });
});


/* ═══════════════════════════════════════════════════════════════════════════
   MEMBER APP — SHARED SESSION STORE
   ═══════════════════════════════════════════════════════════════════════════ */

const orgStore          = {};  // populated at startup via _loadAllStores()
const assignedScenarios = {};
const memberResults     = {};
const memberCheckins    = {};
const orgInterventions  = {};  // orgCode → [intervention, ...]
const advisorThreads    = {};  // orgCode → [{ id, memberId, requesterId, requesterRole, question, answer, evidence, createdAt }]

/* ═══════════════════════════════════════════════════════════════════════════
   UNIVERSAL SIGNAL INGESTION  (the input layer)
   Product thesis: the more input the ecosystem ingests, the stronger the output.
   Every input — check-in, voice film note, spreadsheet row, game stat, coach
   observation, or an external feed (Teams / Google / Outlook) — normalises into
   ONE Signal shape that the AI (Advisor, Group Copilot, memory) reasons over.
   Sources are a registry so new connectors plug in without touching the core.
   ═══════════════════════════════════════════════════════════════════════════ */
const orgSignals = {};  // orgCode → [ signal ]

/* Source registry — declares known/plannable input sources + their defaults.
   `integration:true` sources are OAuth connectors (built later) but the contract
   is here now so the rest of the system can already reason about them. */
const SIGNAL_SOURCES = {
  checkin:   { label: 'Check-in',           modality: 'text',   defaultSensitivity: 'sensitive' },
  note:      { label: 'Note / observation', modality: 'text',   defaultSensitivity: 'normal' },
  assessment:{ label: 'Assessment',         modality: 'text',   defaultSensitivity: 'normal' },
  weekly:    { label: 'Weekly reflection',  modality: 'text',   defaultSensitivity: 'sensitive' },
  voice:     { label: 'Voice note',         modality: 'audio',  defaultSensitivity: 'normal' },
  film:      { label: 'Film note',          modality: 'text',   defaultSensitivity: 'normal' },
  metric:    { label: 'Metric',             modality: 'number', defaultSensitivity: 'normal' },
  sheet:     { label: 'Spreadsheet row',    modality: 'sheet',  defaultSensitivity: 'normal' },
  gamestats: { label: 'Game stats',         modality: 'number', defaultSensitivity: 'public' },
  document:  { label: 'Document',           modality: 'file',   defaultSensitivity: 'normal' },
  external:  { label: 'External feed',      modality: 'data',   defaultSensitivity: 'normal' },
  teams:     { label: 'Microsoft Teams',    modality: 'event',  defaultSensitivity: 'normal', integration: true },
  google:    { label: 'Google Workspace',   modality: 'event',  defaultSensitivity: 'normal', integration: true },
  outlook:   { label: 'Outlook / Email',    modality: 'event',  defaultSensitivity: 'normal', integration: true },
};

function signalId() { return 'sig_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7); }

/* ── Signal weighting — not everything is equally important ────────────────────
   STRONG  : assessment results, metrics, game stats, stat sheets (hard outcomes)
   MEDIUM  : reflections, notes, check-ins, film/voice/document
   WEAK    : one-off external events / messages / comments
   Effective weight also rises with REPETITION (repeated behaviour) and RECENCY,
   so a recurring pattern outweighs a single strong data point. Keeps the AI from
   treating one stray note like a season of results. */
const SIGNAL_WEIGHTS = {
  assessment: 3, metric: 3, gamestats: 3, sheet: 3,
  weekly: 2, note: 2, checkin: 2, film: 2, document: 2, voice: 2,
  external: 1, teams: 1, google: 1, outlook: 1,
};
function _signalBaseWeight(source) { return SIGNAL_WEIGHTS[source] != null ? SIGNAL_WEIGHTS[source] : 1; }
function _weightTier(n) { return n >= 3 ? 'strong' : n >= 2 ? 'medium' : 'weak'; }

/* Normalise + store one raw signal. Returns the stored signal (or null if invalid). */
function _ingestSignal(code, raw, createdBy) {
  if (!raw || !raw.source) return null;
  const src = SIGNAL_SOURCES[raw.source] || { modality: 'data', defaultSensitivity: 'normal' };
  const text = raw.valueText != null ? String(raw.valueText) : '';
  const sensitivity = raw.public ? 'public'
    : raw.sensitivity || (text ? privacy.classifyText(text, { source: raw.source }) : src.defaultSensitivity);
  const sig = {
    id:          signalId(),
    orgCode:     code,
    ts:          raw.ts || new Date().toISOString(),
    source:      raw.source,
    modality:    raw.modality || src.modality || 'data',
    subjectType: raw.subjectType || 'member',     // member | group | org
    subjectId:   raw.subjectId || null,
    category:    raw.category || null,            // perf-framework category (optional)
    label:       raw.label != null ? String(raw.label).slice(0, 120) : null,
    valueNum:    raw.valueNum != null && !isNaN(Number(raw.valueNum)) ? Number(raw.valueNum) : null,
    valueText:   text.slice(0, 4000) || null,
    data:        raw.data || null,                // structured payload (sheet row, event, etc.)
    sensitivity,
    public:      sensitivity === 'public',
    weightNum:   raw.weightNum != null ? raw.weightNum : _signalBaseWeight(raw.source),
    weight:      _weightTier(raw.weightNum != null ? raw.weightNum : _signalBaseWeight(raw.source)),
    createdBy:   createdBy || null,
    createdAt:   new Date().toISOString(),
  };
  if (!orgSignals[code]) orgSignals[code] = [];
  orgSignals[code].push(sig);
  return sig;
}

/* Resolve a userId from a member name within an org (best-effort). */
function _resolveUserIdByName(code, name) {
  if (!name) return null;
  const n = String(name).toLowerCase().trim();
  const u = Object.values(orgUsers[code] || {}).find(u => (u.name || '').toLowerCase().trim() === n);
  return u ? u.id : null;
}

/* Emit a signal from an input touchpoint — never throws (input flow must not
   break if signal capture fails). This is how EVERY input becomes signal. */
function _emitSignalSafe(code, raw, createdBy) {
  try { return _ingestSignal(code, raw, createdBy); } catch (e) { console.warn('[signal] emit failed:', e.message); return null; }
}

/* Recent signals for a subject (used by the AI layer). */
function _gatherSignals(code, subjectType, subjectId, limit = 40) {
  return (orgSignals[code] || [])
    .filter(s => s.subjectType === subjectType && (subjectId == null || s.subjectId === subjectId))
    .sort((a, b) => new Date(b.ts) - new Date(a.ts))
    .slice(0, limit);
}

// Key helpers — new code uses userId keys; legacy name keys still supported for reads
function memberKey(orgCode, memberName) {
  return `${orgCode.toLowerCase().trim()}:${memberName.toLowerCase().trim()}`;
}
function userKey(orgCode, userId) {
  return `${orgCode.toLowerCase().trim()}:${userId}`;
}

/* ── Platform registers org ─────────────────────────────────────────────── */
app.post('/api/platform/register-org', (req, res) => {
  const { orgCode, orgName, orgMode } = req.body;
  if (!orgCode) return res.status(400).json({ error: 'orgCode required' });
  orgStore[orgCode.toLowerCase().trim()] = { orgName, orgMode };
  scheduleSave();
  res.json({ ok: true });
});

/* ── Update org mode ────────────────────────────────────────────────────── */
app.post('/api/platform/update-org-mode', requireAuth, (req, res) => {
  const { orgCode, orgMode } = req.body;
  if (!orgCode || !orgMode) return res.status(400).json({ error: 'orgCode and orgMode required' });
  const code = orgCode.toLowerCase().trim();
  if (orgMeta[code]) { orgMeta[code].orgMode = orgMode; scheduleSave(); }
  if (orgStore[code]) { orgStore[code].orgMode = orgMode; scheduleSave(); }
  res.json({ ok: true });
});

/* ── Bulk import users (CSV/XLSX parsed client-side) ─────────────────── */
app.post('/api/auth/bulk-import', requireAuth, async (req, res) => {
  const { orgCode, users: importRows } = req.body;
  if (!orgCode || !Array.isArray(importRows)) return res.status(400).json({ error: 'orgCode and users[] required' });
  const code    = orgCode.toLowerCase().trim();
  const creator = req.user;

  if (!orgUsers[code]) return res.status(404).json({ error: 'Org not found' });

  const created = [], skipped = [], failed = [];

  for (const row of importRows) {
    const name  = (row.name  || '').trim();
    const email = (row.email || '').trim().toLowerCase();
    const role  = (['admin','coach','member'].includes(row.role?.toLowerCase()) ? row.role.toLowerCase() : 'member');
    const group = (row.group || row.department || '').trim();

    if (!name) { failed.push({ row, reason: 'Missing name' }); continue; }
    if (!email) { failed.push({ row, reason: 'Missing email' }); continue; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { failed.push({ row: name, reason: 'Invalid email format' }); continue; }

    // Check for duplicate by email (global) or name (org)
    if (emailIndex[email]) { skipped.push(`${name} (email already used)`); continue; }
    const existing = Object.values(orgUsers[code]).find(u => u.name.toLowerCase() === name.toLowerCase());
    if (existing) { skipped.push(name); continue; }

    const userId = generateId();
    const password = name.toLowerCase().replace(/\s+/g, '');
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const roleLevel = { admin: 2, coach: 3, member: 4 };
    // Parse firstName/lastName from name or explicit columns
    const fName = (row.firstName || name.split(' ')[0] || '').trim();
    const lName = (row.lastName  || name.split(' ').slice(1).join(' ') || '').trim();

    orgUsers[code][userId] = {
      id: userId,
      firstName: fName, lastName: lName,
      name, email, role, orgCode: code,
      group, department: group,
      passwordHash, passwordSet: false,
      status: 'active',
      createdAt: new Date().toISOString(),
      levelId: roleLevel[role] || 4,
      supervisorId: req.iqSession.userId,
      importedAt: new Date().toISOString(),
    };
    emailIndex[email] = { orgCode: code, userId };

    // Auto-create group if it doesn't exist
    if (group) {
      if (!orgGroups[code]) orgGroups[code] = [];
      const groupExists = orgGroups[code].some(g => g.name.toLowerCase() === group.toLowerCase());
      if (!groupExists) {
        orgGroups[code].push({
          id: generateId(), name: group, orgCode: code,
          memberIds: [], createdAt: new Date().toISOString(),
        });
      }
      // Add member to group
      const gObj = orgGroups[code].find(g => g.name.toLowerCase() === group.toLowerCase());
      if (gObj && !gObj.memberIds.includes(userId)) gObj.memberIds.push(userId);
    }

    created.push({ id: userId, name, role, group });
  }

  scheduleSave();
  res.json({ ok: true, created, skipped, failed, total: importRows.length });
});

/* ── List active join/invite links ───────────────────────────────────── */
app.get('/api/auth/join-links', requireAuth, (req, res) => {
  // SECURITY: invite links grant org access (at a role) — admin-only, own org.
  // Was gated on requireAuth only, exposing them to any authenticated user.
  const code   = req.iqSession.orgCode;
  const userId = req.iqSession.userId;
  const role   = orgUsers[code]?.[userId]?.role;
  if (!code || !(role === 'superadmin' || role === 'admin' || _userHasPerm(code, userId, 'manage_settings'))) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  const now   = Date.now();
  const links = Object.entries(inviteTokens)
    .filter(([, t]) => t.orgCode === code && t.expiresAt > now)
    .map(([token, t]) => ({
      token,
      url:        `/?invite=${token}`,
      role:       t.role,
      group:      t.group || '',
      label:      t.label || '',
      usageLimit: t.usageLimit || null,
      useCount:   t.useCount || 0,
      expiresAt:  new Date(t.expiresAt).toISOString(),
      createdAt:  t.createdAt || null,
    }));
  res.json({ links });
});

/* ── Load sample data for org ─────────────────────────────────────────── */
/* ── load-sample REMOVED (Sprint 2) ─────────────────────────────────────── */
// Demo data injection is no longer supported. All people must be real users
// with valid email addresses. Use /api/auth/create-user or bulk-import.
app.post('/api/auth/load-sample', requireAuth, (req, res) => {
  res.status(410).json({ error: 'Sample data loading has been removed. Please add real members using the People → Onboard section.' });
});

/* ── Platform assigns a scenario to a member ────────────────────────────── *
 *
 *  Body: { orgCode, memberName?, memberId?, scenario,
 *          assignedByNodeId?, assignedByNodeName? }
 *
 *  Assigner identity is always taken from the auth session — the client
 *  never controls assignedByUserId / assignedByName to prevent spoofing.
 *  assignedByNodeId / assignedByNodeName are optional context fields the
 *  admin UI may pass when the assignment is made on behalf of a node/group.
 *
 * ──────────────────────────────────────────────────────────────────────── */
app.post('/api/platform/assign-scenario', requireAuth, (req, res) => {
  const {
    orgCode, memberName, memberId, scenario,
    assignedByNodeId, assignedByNodeName,
  } = req.body;

  const code = (orgCode || req.iqSession.orgCode || '').toLowerCase().trim();
  if (!code || !scenario) {
    return res.status(400).json({ error: 'orgCode and scenario required' });
  }

  // Resolve member name — prefer memberId lookup for accuracy
  let resolvedName = memberName;
  if (memberId && !resolvedName) {
    const u = orgUsers[code]?.[memberId];
    if (u) resolvedName = u.name;
  }
  if (!resolvedName) {
    return res.status(400).json({ error: 'memberName or memberId required' });
  }

  // Assigner always comes from the verified session — never from request body
  const assignerUser       = orgUsers[code]?.[req.iqSession.userId];
  const assignedByUserId   = req.iqSession.userId;
  const assignedByName     = assignerUser?.name  || 'Organisation';
  const assignedByRole     = assignerUser?.role   || 'admin';

  const key = memberKey(code, resolvedName);
  if (!assignedScenarios[key]) assignedScenarios[key] = [];

  // Prevent exact duplicate (same scenario id, same assigner, already pending)
  const alreadyPending = assignedScenarios[key].find(
    s => s.id === scenario.id && s.status === 'pending'
  );
  if (!alreadyPending) {
    assignedScenarios[key].push({
      ...scenario,
      status:             'pending',
      assignedAt:         new Date().toISOString(),
      assignedByUserId,
      assignedByName,
      assignedByRole,
      assignedByNodeId:   assignedByNodeId   || null,
      assignedByNodeName: assignedByNodeName || null,
    });
  }

  scheduleSave();
  res.json({ ok: true, total: assignedScenarios[key].length });
});

/* ── Member joins org — issues token if userId is valid ─────────────────── */
app.post('/api/member/join', (req, res) => {
  const { orgCode, memberName, userId } = req.body;
  if (!orgCode || !memberName) return res.status(400).json({ error: 'orgCode and memberName required' });
  const code = orgCode.toLowerCase().trim();
  const org  = orgStore[code];

  // Issue a token if the userId is a real user in this org
  let token = null;
  if (userId && orgUsers[code]?.[userId]) {
    const user = orgUsers[code][userId];
    token = issueToken(userId, code, user.role);
  }

  res.json({
    ok:         true,
    orgName:    org?.orgName  || orgCode,
    orgMode:    org?.orgMode  || '',
    memberName: memberName.trim(),
    orgCode:    code,
    token,
  });
});

/* ── Member gets pending scenarios ─────────────────────────────────────── *
 *
 *  Returns pending + completed scenarios for the requesting member.
 *  Each scenario object includes assigner metadata fields:
 *    assignedByUserId, assignedByName, assignedByRole,
 *    assignedByNodeId, assignedByNodeName, assignedAt
 *  Legacy assignments that predate Phase 3 will have these fields as null/
 *  undefined; clients should fall back to "Assigned by: Organisation".
 *
 * ──────────────────────────────────────────────────────────────────────── */
app.get('/api/member/pending', requireAuth, (req, res) => {
  const { orgCode, memberName, userId } = req.query;
  const code = (orgCode || req.iqSession.orgCode || '').toLowerCase().trim();
  if (!code) return res.status(400).json({ error: 'orgCode required' });

  // Resolve memberName from userId when provided (unified app path)
  let resolvedName = memberName;
  if (!resolvedName) {
    const uid  = userId || req.iqSession.userId;
    const user = orgUsers[code]?.[uid];
    if (user) resolvedName = user.name;
  }
  if (!resolvedName) return res.status(400).json({ error: 'memberName or userId required' });

  const key      = memberKey(code, resolvedName);
  const all      = assignedScenarios[key] || [];
  const pending  = all.filter(s => s.status === 'pending');
  const completed = all.filter(s => s.status === 'completed');

  // Enrich each scenario: ensure assigner fallback for legacy entries
  const enrich = sc => ({
    ...sc,
    assignedByName:     sc.assignedByName     || 'Organisation',
    assignedByRole:     sc.assignedByRole     || null,
    assignedByNodeId:   sc.assignedByNodeId   || null,
    assignedByNodeName: sc.assignedByNodeName || null,
  });

  res.json({
    scenarios: pending.map(enrich),
    completed: completed.map(enrich),
  });
});

/* ── Member submits scenario result ─────────────────────────────────────── */
app.post('/api/member/submit-result', (req, res) => {
  const { orgCode, memberName, memberId, userId, scenarioId, result } = req.body;
  if (!orgCode || !result) return res.status(400).json({ error: 'missing fields' });

  // Resolve memberName from memberId (unified app path)
  let resolvedName = memberName;
  if (memberId && !resolvedName) {
    const user = orgUsers[orgCode.toLowerCase()]?.[memberId];
    if (user) resolvedName = user.name;
  }
  if (!resolvedName) return res.status(400).json({ error: 'memberName or memberId required' });

  const key = memberKey(orgCode, resolvedName);

  if (assignedScenarios[key]) {
    const sc = assignedScenarios[key].find(s => s.id === scenarioId);
    if (sc) sc.status = 'completed';
  }

  if (!memberResults[key]) memberResults[key] = [];
  // Store memberName and memberId inside result for display + future migration
  memberResults[key].push({ ...result, memberName: resolvedName, memberId: memberId || null, submittedAt: new Date().toISOString() });

  // Update memory from scenario development areas
  const resolvedUserId = userId || memberId;
  if (resolvedUserId && result?.dimensions?.development?.length) {
    _updateUserMemory(orgCode.toLowerCase(), resolvedUserId, 'scenario', {
      development: result.dimensions.development,
    });
  }

  // Assessment completion → signals: the score (citable) + what it revealed.
  const _code = orgCode.toLowerCase().trim();
  const _aid  = resolvedUserId || _resolveUserIdByName(_code, resolvedName);
  if (_aid) {
    const sc = result.score || result.dimensions || {};
    if (sc.overall != null) _emitSignalSafe(_code, {
      subjectType: 'member', subjectId: _aid, source: 'assessment', modality: 'number',
      label: 'Assessment overall', valueNum: Number(sc.overall), sensitivity: 'normal',
    }, _aid);
    const parts = [];
    if (sc.summary) parts.push(sc.summary);
    if (Array.isArray(sc.strengths) && sc.strengths.length)   parts.push('Strengths: ' + sc.strengths.join(', '));
    if (Array.isArray(sc.development) && sc.development.length) parts.push('Development: ' + sc.development.join(', '));
    if (parts.length) _emitSignalSafe(_code, {
      subjectType: 'member', subjectId: _aid, source: 'assessment', modality: 'text',
      label: result.scenarioTitle || 'Assessment', valueText: parts.join(' · '), sensitivity: 'normal',
    }, _aid);
  }

  scheduleSave();
  res.json({ ok: true });
});

/* ── Member submits check-in (legacy simple endpoint) ───────────────────── */
app.post('/api/member/checkin', (req, res) => {
  const { orgCode, memberName, mood, note } = req.body;
  if (!orgCode || !memberName) return res.status(400).json({ error: 'missing fields' });
  const key = memberKey(orgCode, memberName);
  if (!memberCheckins[key]) memberCheckins[key] = [];
  memberCheckins[key].push({
    memberName,
    mood, note,
    date: new Date().toLocaleDateString('en-GB'),
    ts:   new Date().toISOString(),
  });
  const _cid = _resolveUserIdByName((orgCode || '').toLowerCase().trim(), memberName);
  if (_cid) _emitSignalSafe((orgCode || '').toLowerCase().trim(), {
    subjectType: 'member', subjectId: _cid, source: 'checkin', modality: 'text',
    valueNum: mood != null ? Number(mood) : null, valueText: note || null,
    label: mood != null ? `Mood ${mood}/5` : null, sensitivity: 'sensitive',
  }, _cid);
  scheduleSave();
  res.json({ ok: true });
});

/* Leader-analytics gate. Returns { code, userId } when the session may view
   org/member insight, else sends 403 and returns null. Identity ALWAYS comes
   from the session — analytics endpoints must never authorize on a query orgCode. */
function _requireInsight(req, res) {
  const { orgCode: code, userId } = req.iqSession;
  if (!code || !userId) { res.status(403).json({ error: 'Forbidden' }); return null; }
  const ok = _userHasPerm(code, userId, 'view_insights') ||
             _userHasPerm(code, userId, 'review_checkins') ||
             orgUsers[code]?.[userId]?.role === 'superadmin';
  if (!ok) { res.status(403).json({ error: 'Insufficient permissions' }); return null; }
  return { code, userId };
}

/* Shared privacy-safe projection of a check-in for any leader-facing surface.
   Check-in free-text is a personal disclosure (classified sensitive by default);
   sensitive/restricted entries are redacted to a contentless marker so leaders
   see engagement (mood, cadence) but never a member's private words. */
function _safeCheckinEntry(c) {
  const sens = privacy.classifyText(c.text || '', { source: 'checkin' });
  const isPrivate = sens === 'sensitive' || sens === 'restricted';
  return {
    memberName: c.memberName, mood: c.mood, moodLabel: c.moodLabel,
    role: c.role, date: c.date, ts: c.ts,
    text: isPrivate ? null : c.text,
    private: isPrivate,
  };
}

/* ── Platform pulls member results ─────────────────────────────────────────
   SECURITY (fixed 2026-07-09): was requireAuth-only, letting any logged-in user
   read any member's raw check-ins by name. Now session-scoped and gated: the
   member themselves, or a leader with review_checkins/view_insights within scope;
   check-ins are privacy-filtered for the leader path. */
app.get('/api/platform/member-results', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const { memberName } = req.query;
  if (!code || !memberName) return res.status(400).json({ error: 'missing fields' });

  const target   = _resolveUserIdByName(code, memberName);
  const isSelf   = target && target === userId;
  const canLead  = _userHasPerm(code, userId, 'view_insights') || _userHasPerm(code, userId, 'review_checkins');
  const inScope  = target && getVisibleUserIds(code, userId).includes(target);
  if (!isSelf && !(canLead && inScope)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const key      = memberKey(code, memberName);
  const checkins = memberCheckins[key] || [];
  res.json({
    results:  memberResults[key] || [],
    // Self sees their own words; a leader sees the privacy-filtered projection.
    checkins: isSelf ? checkins : checkins.map(_safeCheckinEntry),
  });
});

/* ── Platform pulls all results for org ─────────────────────────────────────
   SECURITY (fixed 2026-07-09): was requireAuth-only. Now session-scoped, gated,
   and limited to the caller's visible members. */
app.get('/api/platform/org-results', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  if (!code || !userId) return res.status(403).json({ error: 'Forbidden' });
  if (!_userHasPerm(code, userId, 'view_insights') && !_userHasPerm(code, userId, 'review_checkins')
      && orgUsers[code]?.[userId]?.role !== 'superadmin') {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  const results = {};
  getVisibleUserIds(code, userId).forEach(uid => {
    const u = orgUsers[code]?.[uid];
    if (!u || u.role === 'superadmin') return;
    const entries = memberResults[userKey(code, uid)] || memberResults[memberKey(code, u.name || '')] || [];
    if (entries.length) results[u.name || uid] = entries;
  });
  res.json({ results });
});

/* ═══════════════════════════════════════════════════════════════════════════
   ORG INTELLIGENCE — FREEFORM DESCRIPTION → AI TRAIT EXTRACTION
   ═══════════════════════════════════════════════════════════════════════════ */
app.post('/api/org/describe', async (req, res) => {
  const { description, orgName } = req.body;
  if (!description) return res.status(400).json({ error: 'description required' });

  const systemPrompt = `You are an intelligent org analyst for IntelliQ, a performance intelligence platform.

An organisation admin has described their organisation in their own words. Your job is to:
1. Determine the closest org category
2. Extract the key values, goals, and environment they want to create
3. Identify what "success" means to them

OUTPUT FORMAT — valid JSON only, no extra text:
{
  "orgMode": "school|sports|workplace|military|healthcare|government|other",
  "summary": "One sentence capturing what this org is really about",
  "traits": ["specific trait 1", "specific trait 2", "specific trait 3", "specific trait 4"],
  "goals": ["meaningful org goal 1", "meaningful org goal 2", "meaningful org goal 3"],
  "environment": "The kind of culture/environment they want to build (1 sentence)",
  "successLooks": "What success looks like for them specifically (1 sentence)"
}

RULES:
- orgMode must be exactly one of: school, sports, workplace, military, healthcare, government, other
- traits should be observable, specific characteristics (e.g. "athlete wellbeing first", "high accountability culture", "data-driven decisions")
- goals should be meaningful outcomes, not generic platitudes
- Be grounded in what they actually wrote — do not invent things they didn't mention`;

  try {
    const response = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: `Organisation: ${orgName}\n\nDescription: ${description}` }],
    });
    const raw     = response.content[0]?.text || '';
    const jsonStr = raw.replace(/```json\n?|\n?```/g, '').trim();
    let traits;
    try { traits = JSON.parse(jsonStr); }
    catch(e) { return res.status(500).json({ error: 'Parse failed', raw }); }
    res.json({ ok: true, ...traits });
  } catch(err) {
    console.error('Org describe error:', err.message);
    res.status(500).json({ error: 'AI unavailable', detail: err.message });
  }
});

/* ─── ORG PROFILE UPDATE ────────────────────────────────────────────────── */
/* Stores AI-extracted org profile fields (description, summary, traits, etc.)
   These come from /api/org/describe and are persisted here by the setup wizard.
   Additive merge — never overwrites orgName, orgMode, or createdAt.          */
app.put('/api/org/profile', requireAuth, (req, res) => {
  const { orgCode, orgMode, orgDescription, orgSummary, orgEnvironment, orgSuccessDefinition, orgTraits } = req.body;
  const code = (orgCode || req.iqSession?.orgCode || '').toLowerCase().trim();
  if (!code) return res.status(400).json({ error: 'orgCode required' });

  // Only superadmin for this org may update the profile
  const user = orgUsers[code]?.[req.iqSession.userId];
  if (!user || user.role !== 'superadmin') return res.status(403).json({ error: 'Forbidden' });

  if (!orgMeta[code]) return res.status(404).json({ error: 'Organisation not found' });

  // Additive merge — never overwrite immutable fields
  if (orgMode            !== undefined) orgMeta[code].orgMode             = orgMode;
  if (orgDescription     !== undefined) orgMeta[code].orgDescription      = orgDescription;
  if (orgSummary         !== undefined) orgMeta[code].orgSummary          = orgSummary;
  if (orgEnvironment     !== undefined) orgMeta[code].orgEnvironment      = orgEnvironment;
  if (orgSuccessDefinition !== undefined) orgMeta[code].orgSuccessDefinition = orgSuccessDefinition;
  if (orgTraits          !== undefined) orgMeta[code].orgTraits           = orgTraits;

  scheduleSave();
  res.json({ ok: true, org: orgMeta[code] });
});

/* ═══════════════════════════════════════════════════════════════════════════
   MEMBER GOALS — Individual goal & identity intake
   Accepts memberId (stable) or memberName (legacy). Prefers memberId.
   ═══════════════════════════════════════════════════════════════════════════ */
const memberGoals = {};  // populated at startup via _loadAllStores()

app.post('/api/member/goals', (req, res) => {
  const { orgCode, memberName, memberId, goal, identity } = req.body;
  if (!orgCode || (!memberName && !memberId)) return res.status(400).json({ error: 'missing fields' });
  // Prefer stable userId as key; fall back to name for backward compat
  const key = memberId
    ? userKey(orgCode, memberId)
    : memberKey(orgCode, memberName);
  memberGoals[key] = { goal: goal || '', identity: identity || '', memberName, setAt: new Date().toISOString() };
  scheduleSave();
  res.json({ ok: true });
});

app.get('/api/member/goals', requireAuth, (req, res) => {
  // SECURITY: was unauthenticated. Now auth'd and scoped — the member themselves,
  // or a leader who has this member in scope. Fixed 2026-07-09.
  const { memberName, memberId } = req.query;
  const code = req.iqSession.orgCode;
  if (!code || (!memberName && !memberId)) return res.status(400).json({ error: 'missing fields' });

  const targetId = memberId || _resolveUserIdByName(code, memberName || '');
  const isSelf   = targetId && targetId === req.iqSession.userId;
  const canLead  = (_userHasPerm(code, req.iqSession.userId, 'view_insights') ||
                    _userHasPerm(code, req.iqSession.userId, 'view_members')) &&
                   targetId && getVisibleUserIds(code, req.iqSession.userId).includes(targetId);
  if (!isSelf && !canLead) return res.status(403).json({ error: 'Insufficient permissions' });

  const key    = memberId ? userKey(code, memberId) : memberKey(code, memberName);
  const altKey = memberId ? memberKey(code, memberName || '') : null;
  res.json({ goals: memberGoals[key] || (altKey ? memberGoals[altKey] : null) || null });
});

/* ═══════════════════════════════════════════════════════════════════════════
   MEMORY ENGINE — Read / resolve user AI profile
   ═══════════════════════════════════════════════════════════════════════════ */

/* GET /api/user/memory — the person reads their OWN model.

   PRIVACY GOVERNANCE (council-ratified 2026-07-09): a member's Person Model is
   THEIRS. It is inspectable and correctable by the person, and Platform (leaders,
   admins) NEVER receives it raw — org-level insight comes only from the
   privacy-gated briefing, never from these private threads. So this endpoint is
   strictly self-scoped: it ignores any userId in the query and returns only the
   caller's own memory. There is no leader cross-read path, by construction. */
app.get('/api/user/memory', requireAuth, (req, res) => {
  const code   = req.iqSession.orgCode;
  const userId = req.iqSession.userId;
  if (!code || !userId) return res.status(403).json({ error: 'Forbidden' });
  const mem = userAiProfiles[`${code}:${userId}`] || null;
  res.json({ memory: mem });
});

/* PUT /api/user/memory/resolve — the person corrects/resolves their OWN model.
   Self-scoped for the same governance reason as the GET above. */
app.put('/api/user/memory/resolve', requireAuth, (req, res) => {
  const { threadId, followUpId } = req.body;
  if (!threadId && !followUpId) {
    return res.status(400).json({ error: 'threadId or followUpId required' });
  }
  const code   = req.iqSession.orgCode;
  const userId = req.iqSession.userId;
  if (!code || !userId) return res.status(403).json({ error: 'Forbidden' });

  const mem = _getMemory(code, userId);
  if (threadId) {
    const t = mem.openThreads.find(t => t.id === threadId);
    if (t) { t.resolved = true; t.resolvedAt = new Date().toISOString(); }
  }
  if (followUpId) {
    const f = mem.priorFollowUps.find(f => f.id === followUpId);
    if (f) { f.resolved = true; f.resolvedAt = new Date().toISOString(); }
  }
  mem.lastUpdated = new Date().toISOString();
  scheduleSave();
  res.json({ ok: true, memory: mem });
});

/* ═══════════════════════════════════════════════════════════════════════════
   FREEFORM CHECK-IN — Free text + AI response
   Phase 4: Member role returns structured insight object.
   Other roles (leader/admin) return a plain text aiResponse as before.
   Accepts memberId (stable) or memberName (legacy). Prefers memberId.
   ═══════════════════════════════════════════════════════════════════════════ */
app.post('/api/checkin/freeform', async (req, res) => {
  const { orgCode, memberName, memberId, userId, text, mood, role, orgMode, orgName, goals } = req.body;
  if (!orgCode || !memberName || !text) return res.status(400).json({ error: 'missing fields' });

  const code = (orgCode || '').toLowerCase().trim();
  const key = memberId
    ? userKey(code, memberId)
    : memberKey(code, memberName);

  if (!memberCheckins[key]) memberCheckins[key] = [];

  const moodLabels = { 1:'Rough', 2:'Low', 3:'Okay', 4:'Good', 5:'Great' };
  const checkin = {
    memberName,
    text,
    mood:      mood || null,
    moodLabel: moodLabels[mood] || null,
    role:      role || 'member',
    orgMode:   orgMode || '',
    date:      new Date().toLocaleDateString('en-GB'),
    ts:        new Date().toISOString(),
  };
  memberCheckins[key].push(checkin);

  const _fid = memberId || _resolveUserIdByName(code, memberName);
  if (_fid) _emitSignalSafe(code, {
    subjectType: 'member', subjectId: _fid, source: 'checkin', modality: 'text',
    valueNum: mood != null ? Number(mood) : null, valueText: text || null,
    label: mood != null ? `Mood ${mood}/5` : null, sensitivity: 'sensitive',
  }, _fid);

  const effectiveRole = role || 'member';

  /* ── MEMBER: structured insight (Phase 4) ─────────────────────────────── */
  if (effectiveRole === 'member') {

    // Gather server-side context
    const stored       = memberGoals[key] || memberGoals[memberKey(code, memberName)] || {};
    const focusGoal    = goals?.goal      || stored.goal     || '';
    const identityGoal = goals?.identity  || stored.identity || '';

    // Recent check-ins before this one (last 5 entries, already pushed above so slice -6,-1)
    const prior = (memberCheckins[key] || []).slice(-6, -1);
    const recentMoodStr = prior.length
      ? prior.map(c => `${c.date}: ${c.moodLabel || 'unknown'}`).join(' | ')
      : 'This is the first check-in';

    const orgVals       = (orgValues[code]   || []).slice(0, 6).join(', ') || null;
    const orgMetricList = (orgMetrics[code]  || []).slice(0, 6).map(m => m.name || m).join(', ') || null;

    // Memory injection — only for members with a userId
    const memoryBlock = userId ? _buildMemoryBlock(code, userId) : '';

    const systemPrompt = `You are IntelliQ — a warm, perceptive, and honest performance intelligence system.

A member has submitted their daily check-in. Return a structured insight that is genuinely useful and grounded strictly in what they actually wrote. Do not invent data, assume context, or fake trends.
${memoryBlock}
RULES:
- Observe only what the member explicitly shared — never project or extrapolate
- If this is their first check-in, acknowledge it honestly ("This is your first check-in — patterns will emerge over time")
- Keep language generic — no sports-specific, school-specific, or workplace-specific wording unless the member used those words themselves
- suggestedNextAction must be concrete and specific to TODAY's check-in — not generic advice
- watchOutFor: only include if there is a genuine signal (avoidance language, persistent low mood, contradictions) — otherwise null
- goalConnection: only include if a goal is set and today's check-in has a real connection to it — otherwise null
- metricSignals: only include if org metrics are defined and the member mentioned something relevant — otherwise null
- Max 2 sentences per field. Keep it tight and human.

OUTPUT — valid JSON only, no markdown fencing, no extra text:
{
  "summary": "One honest sentence of what IntelliQ noticed today",
  "whatIntelliQNoticed": "A specific personal observation from today's check-in (1-2 sentences)",
  "goalConnection": "How today connects to their focus goal, or null",
  "metricSignals": "Any metric-relevant signals from what they shared, or null",
  "suggestedNextAction": "One concrete specific action based on what they wrote today",
  "encouragement": "A brief genuine note — 1 sentence, not generic",
  "watchOutFor": "A real concern if present in their words, or null"
}`;

    const userContent = [
      `Member: ${memberName}`,
      focusGoal    ? `Focus goal: "${focusGoal}"` : 'Focus goal: not set',
      identityGoal ? `Identity aspiration: "${identityGoal}"` : null,
      orgVals       ? `Organisation values: ${orgVals}` : null,
      orgMetricList ? `Organisation metrics: ${orgMetricList}` : null,
      `Recent mood history: ${recentMoodStr}`,
      ``,
      `Today's mood: ${moodLabels[mood] || 'not specified'}`,
      `Today's check-in: "${text}"`,
    ].filter(Boolean).join('\n');

    try {
      const response = await client.messages.create({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 600,
        system:     [systemPrompt, _worldviewDirective(code), _memberValuesDirective(code, userId)].filter(Boolean).join('\n\n'),
        messages:   [{ role: 'user', content: userContent }],
      });

      const raw     = (response.content[0]?.text || '').trim();
      const jsonStr = raw.replace(/^```(?:json)?\n?/,'').replace(/\n?```$/,'').trim();

      let insight;
      try {
        insight = JSON.parse(jsonStr);
      } catch(parseErr) {
        // AI returned non-JSON — degrade gracefully
        console.warn('[CHECKIN] insight parse failed, using raw as summary');
        insight = {
          summary:             raw.slice(0, 160) || 'Check-in received.',
          whatIntelliQNoticed: null,
          goalConnection:      null,
          metricSignals:       null,
          suggestedNextAction: null,
          encouragement:       null,
          watchOutFor:         null,
        };
      }

      checkin.insight    = insight;
      checkin.aiResponse = insight.summary || null; // backward compat

      // Update user memory from this insight
      if (userId && insight) {
        _updateUserMemory(code, userId, 'checkin', {
          watchOutFor:        insight.watchOutFor,
          suggestedNextAction: insight.suggestedNextAction,
        });
      }

      scheduleSave();
      return res.json({ ok: true, insight, aiResponse: checkin.aiResponse });

    } catch(err) {
      console.error('[CHECKIN] AI error:', err.message);
      scheduleSave();
      return res.json({ ok: true, insight: null, aiResponse: null });
    }
  }

  /* ── LEADER / ADMIN: lightweight plain-text response (unchanged) ─────── */
  const leaderPrompts = {
    leader: `You are IntelliQ, a performance intelligence assistant for leaders. A leader has submitted their daily check-in. Acknowledge what they shared briefly. If they mentioned a specific person or situation, reflect something useful back. Max 3 sentences. Be direct and practical.`,
    admin:  `You are IntelliQ, a performance intelligence assistant. An admin has submitted a check-in. Acknowledge briefly. If anything sounds like it needs org-level attention, note it. Max 2 sentences.`,
  };

  const leaderRoleKey = (effectiveRole === 'admin' || effectiveRole === 'superadmin') ? 'admin' : 'leader';
  const systemPrompt = leaderPrompts[leaderRoleKey];
  let userContent = '';
  if (mood) userContent += `Mood: ${moodLabels[mood]}\n`;
  userContent += `Check-in: ${text}`;

  try {
    const response = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 150,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userContent }],
    });
    const aiResponse = response.content[0]?.text?.trim() || '';
    checkin.aiResponse = aiResponse;
    scheduleSave();
    return res.json({ ok: true, insight: null, aiResponse });
  } catch(err) {
    console.error('[CHECKIN] AI error (leader):', err.message);
    scheduleSave();
    return res.json({ ok: true, insight: null, aiResponse: null });
  }
});

/* ── Platform: pull all checkins for org — requires auth ────────────────── */
app.get('/api/platform/org-checkins', requireAuth, (req, res) => {
  // SECURITY: session-scoped (never trust orgCode from the query), permission-
  // gated, and scoped to the caller's visible members — same rules as
  // team-insights. Previously this was requireAuth-only, which let any logged-in
  // user read every member's raw check-in text across orgs. Fixed 2026-07-09.
  const { orgCode: code, userId } = req.iqSession;
  if (!code || !userId) return res.status(403).json({ error: 'Forbidden' });

  const canViewInsights   = _userHasPerm(code, userId, 'view_insights');
  const canReviewCheckins = _userHasPerm(code, userId, 'review_checkins');
  if (!canViewInsights && !canReviewCheckins) {
    return res.status(403).json({ error: 'Permission denied: view_insights or review_checkins required' });
  }

  // PRIVACY LAW: check-in free-text is redacted for sensitive/restricted entries
  // via the shared _safeCheckinEntry projection — leaders see engagement, never
  // a member's private words.
  const results = {};
  getVisibleUserIds(code, userId).forEach(uid => {
    const u = orgUsers[code]?.[uid];
    if (!u || u.role === 'superadmin') return;
    const entries = memberCheckins[userKey(code, uid)] || memberCheckins[memberKey(code, u.name || '')] || [];
    if (entries.length) results[u.name || uid] = entries.map(_safeCheckinEntry);
  });
  res.json({ checkins: results });
});

/* ═══════════════════════════════════════════════════════════════════════════
   WEEKLY ASSESSMENTS — Role-specific weekly reflection forms
   Accepts memberId (stable) or memberName (legacy). Prefers memberId.
   ═══════════════════════════════════════════════════════════════════════════ */

const weeklyAssessments = {};  // populated at startup via _loadAllStores()

function weekKey(orgCode, weekStr) {
  return `${orgCode.toLowerCase().trim()}:${weekStr}`;
}

function currentWeekStr() {
  const d    = new Date();
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2,'0')}`;
}

/* ── Submit weekly assessment ───────────────────────────────────────────── */
app.post('/api/weekly/submit', async (req, res) => {
  const { orgCode, memberName, memberId, userId, role, orgMode, orgName, data, goals } = req.body;
  if (!orgCode || !memberName || !data) return res.status(400).json({ error: 'missing fields' });

  const week = currentWeekStr();
  const key  = weekKey(orgCode, week);
  if (!weeklyAssessments[key]) weeklyAssessments[key] = [];

  // Remove prior submission this week for this member (by id or name)
  const idx = weeklyAssessments[key].findIndex(e =>
    (memberId && e.memberId === memberId) ||
    (!memberId && e.memberName.toLowerCase() === memberName.toLowerCase())
  );
  if (idx > -1) weeklyAssessments[key].splice(idx, 1);

  const rolePrompts = {
    member: `You are IntelliQ. A member has completed their weekly reflection. Read what they shared and respond in 2-3 sentences: acknowledge their week genuinely, and if they have a goal, connect something they said to it. Be warm and specific. Max 3 sentences.`,
    leader: `You are IntelliQ, a performance intelligence assistant. A leader has submitted their weekly reflection. Read it and respond with one practical insight or observation worth acting on. Reference specifics they mentioned. Max 3 sentences.`,
    staff:  `You are IntelliQ. A staff member has submitted their weekly report. Acknowledge what they shared and note anything that may need follow-up. Max 2 sentences.`,
  };

  const roleKey = role === 'member' ? 'member' : (role === 'coach' || role === 'admin' || role === 'superadmin') ? 'leader' : 'staff';
  const code    = (orgCode || '').toLowerCase().trim();

  // Memory injection for members
  const memoryBlock = (roleKey === 'member' && userId)
    ? _buildMemoryBlock(code, userId)
    : '';
  const memberSystemPrompt = `You are IntelliQ. A member has completed their weekly reflection. Read what they shared and respond in 2-3 sentences: acknowledge their week genuinely, and if they have a goal, connect something they said to it. Be warm and specific. Max 3 sentences.${memoryBlock ? '\n' + memoryBlock : ''}`;

  const finalRolePrompts = {
    member: memberSystemPrompt,
    leader: rolePrompts.leader,
    staff:  rolePrompts.staff,
  };

  let userMsg = '';
  if (goals?.goal) userMsg += `Their goal: "${goals.goal}"\n\n`;
  userMsg += `Weekly reflection:\n${Object.entries(data).map(([k,v]) => `${k}: ${v}`).join('\n')}`;

  let aiResponse = null;
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 150,
      system: [finalRolePrompts[roleKey], _worldviewDirective(code), _memberValuesDirective(code, userId)].filter(Boolean).join('\n\n'),
      messages: [{ role: 'user', content: userMsg }],
    });
    aiResponse = response.content[0]?.text?.trim() || null;
  } catch(e) { /* non-critical */ }

  // Update memory for members: use weekly reflection text as theme source
  if (roleKey === 'member' && userId) {
    const allText = Object.values(data).filter(Boolean).join(' ');
    // Extract themes from the 'hard' / 'overall' fields if present
    const themes = [];
    if (data.hard)    themes.push(...data.hard.toLowerCase().split(/\W+/).filter(w => w.length > 4).slice(0, 3));
    if (data.overall) themes.push(...data.overall.toLowerCase().split(/\W+/).filter(w => w.length > 4).slice(0, 3));
    if (themes.length) _updateUserMemory(code, userId, 'weekly', { themes });
  }

  const entry = {
    memberName, memberId: memberId || null,
    role: role || 'member', orgMode: orgMode || '',
    data, week, aiResponse,
    submittedAt: new Date().toISOString(),
  };
  weeklyAssessments[key].push(entry);

  // Weekly reflection → signal (free text the AI can mine; inform-only).
  const _wid = memberId || _resolveUserIdByName(code, memberName);
  const _wtext = Object.values(data || {}).filter(Boolean).join(' · ').slice(0, 1500);
  if (_wid && _wtext) _emitSignalSafe(code, {
    subjectType: 'member', subjectId: _wid, source: 'weekly', modality: 'text',
    valueText: _wtext, sensitivity: 'sensitive',
  }, _wid);

  scheduleSave();

  res.json({ ok: true, aiResponse, week });
});

/* ── Get weekly assessments for org — requires auth ─────────────────────── */
app.get('/api/weekly/org', requireAuth, (req, res) => {
  const { orgCode, week } = req.query;
  if (!orgCode) return res.status(400).json({ error: 'orgCode required' });
  const w   = week || currentWeekStr();
  const key = weekKey(orgCode, w);
  res.json({ week: w, assessments: weeklyAssessments[key] || [] });
});

/* ── Get own weekly history ─────────────────────────────────────────────── */
app.get('/api/weekly/member', (req, res) => {
  const { orgCode, memberName, memberId } = req.query;
  if (!orgCode || (!memberName && !memberId)) return res.status(400).json({ error: 'missing fields' });
  const code = orgCode.toLowerCase().trim();
  const history = [];
  Object.keys(weeklyAssessments).forEach(key => {
    if (!key.startsWith(code + ':')) return;
    const entries = weeklyAssessments[key].filter(e =>
      (memberId && e.memberId === memberId) ||
      (!memberId && e.memberName?.toLowerCase() === memberName?.toLowerCase())
    );
    history.push(...entries);
  });
  history.sort((a, b) => b.week.localeCompare(a.week));
  res.json({ history });
});

/* ── IntelliQ synthesis of this week's inputs — requires auth ───────────── */
app.post('/api/weekly/synthesis', requireAuth, async (req, res) => {
  const { orgCode, orgName, orgMode, week } = req.body;
  if (!orgCode) return res.status(400).json({ error: 'orgCode required' });

  const w    = week || currentWeekStr();
  const key  = weekKey(orgCode, w);
  const entries = weeklyAssessments[key] || [];

  if (entries.length === 0) {
    return res.json({ synthesis: null, message: 'No weekly assessments submitted yet for this week.' });
  }

  const systemPrompt = `You are IntelliQ, an intelligent performance system used by ${orgName || 'an organisation'}.

You have received the weekly assessment inputs from multiple people across the organisation. Your job is to synthesise what all of them are saying together — finding patterns, gaps, and things that need attention.

OUTPUT FORMAT — valid JSON:
{
  "headline": "The most important thing the admin/coach should know this week (1 sentence)",
  "patterns": ["Pattern 1 across multiple inputs", "Pattern 2"],
  "watchFor": ["Specific person or situation to keep an eye on"],
  "positives": ["Something going well worth acknowledging"],
  "recommendations": ["One concrete action for this week", "Optional second action"]
}

Be specific and grounded — only say what the data actually supports. Do not invent things nobody mentioned.`;

  const inputsText = entries.map(e =>
    `${e.memberName} (${e.role}):\n${Object.entries(e.data).map(([k,v]) => `  ${k}: ${v}`).join('\n')}`
  ).join('\n\n');

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 600,
      system: systemPrompt,
      messages: [{ role: 'user', content: `Week: ${w}\nOrg: ${orgName}\n\n${inputsText}` }],
    });
    const raw = response.content[0]?.text || '';
    const jsonStr = raw.replace(/```json\n?|\n?```/g, '').trim();
    let synthesis;
    try { synthesis = JSON.parse(jsonStr); }
    catch(e) { return res.json({ synthesis: null, raw }); }
    res.json({ synthesis, week: w, count: entries.length });
  } catch(err) {
    res.status(500).json({ error: 'AI unavailable', detail: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   INTELLIQ ORG INTELLIGENCE v2 — "What IntelliQ Knows"
   Decision-support intelligence: multi-week trends, member profiles,
   group intelligence, semantic theme clustering, evidence-based recommendations.
   Cached per org for 1 hour. Force refresh: ?refresh=1
   ═══════════════════════════════════════════════════════════════════════════ */

const orgInsightCache = {}; // orgCode → { data, generatedAt } — in-memory only

// Return the ISO week string for N weeks in the past
function _weekStrOffset(n) {
  const d    = new Date(Date.now() - n * 7 * 24 * 60 * 60 * 1000);
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const wk   = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(wk).padStart(2, '0')}`;
}

function _avgMood(checkins) {
  const scores = checkins.filter(c => c.mood !== null && c.mood !== undefined).map(c => Number(c.mood));
  if (!scores.length) return null;
  return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
}

// ── Pattern & Prediction helpers ──────────────────────────────────────────────

function _countConsecutiveDeclines(weeklyAvgs) {
  // weeklyAvgs: array of {week, avg} sorted newest-first
  // Returns number of consecutive weekly declines from most recent
  let count = 0;
  for (let i = 0; i < weeklyAvgs.length - 1; i++) {
    if (weeklyAvgs[i].avg !== null && weeklyAvgs[i + 1].avg !== null &&
        weeklyAvgs[i].avg < weeklyAvgs[i + 1].avg - 0.1) {
      count++;
    } else break;
  }
  return count;
}

function _detectMemberPatternsFromData(name, weeklyMoodAvgs, allMemberCheckins, weeklySubCount, hasGoal, latestScores, orgTextCorpus) {
  // weeklyMoodAvgs: [{week, avg}] newest-first, up to 4 weeks
  // allMemberCheckins: check-ins last 30 days for this member
  // weeklySubCount: number of weekly reflections submitted last 30 days
  // hasGoal: boolean
  // latestScores: {ethical_reasoning, pressure_response, self_awareness, overall} or {}
  // orgTextCorpus: all recent text entries for this member
  const patterns = [];

  const validMoods = weeklyMoodAvgs.filter(w => w.avg !== null);
  const recentAvg  = validMoods.length ? validMoods[0].avg : null;
  const consecutive = _countConsecutiveDeclines(weeklyMoodAvgs);

  const thisWeekCheckins = allMemberCheckins.filter(c => c.isThisWeek).length;
  const prevWeekCheckins = allMemberCheckins.filter(c => c.isPrevWeek).length;
  const totalCheckins    = allMemberCheckins.length;

  const textSample = orgTextCorpus.join(' ').toLowerCase();
  const doubtWords = ['not sure', "don't know", 'confused', 'struggling', 'lost', 'doubt', 'unsure', 'overwhelmed', 'stuck'];
  const isolationWords = ['alone', 'nobody', 'no one', 'ignored', 'left out', 'excluded', 'disconnected'];
  const burnoutWords = ['exhausted', 'burnt out', 'burned out', 'drained', 'no energy', 'tired', 'can\'t keep up'];
  const doubtSignals = doubtWords.filter(w => textSample.includes(w)).length;
  const isolationSignals = isolationWords.filter(w => textSample.includes(w)).length;
  const burnoutSignals = burnoutWords.filter(w => textSample.includes(w)).length;

  const pressureScore = latestScores?.pressure_response || null;
  const overallScore  = latestScores?.overall || null;

  // ── Burnout Risk ──────────────────────────────────────────────────────────
  const burnoutFlags = [];
  if (recentAvg !== null && recentAvg < 2.5) burnoutFlags.push(`mood ${recentAvg}/5`);
  if (consecutive >= 3) burnoutFlags.push(`${consecutive} consecutive weekly mood declines`);
  if (burnoutSignals >= 2) burnoutFlags.push('burnout language detected in reflections');
  if (thisWeekCheckins > 0 && recentAvg !== null && recentAvg < 2.5) burnoutFlags.push('still engaging despite low mood');
  if (burnoutFlags.length >= 2) {
    patterns.push({
      type:       'BURNOUT_RISK',
      label:      'Burnout Risk',
      confidence: burnoutFlags.length >= 3 ? 'high' : 'medium',
      signals:    burnoutFlags,
    });
  }

  // ── Disengagement Risk ───────────────────────────────────────────────────
  const disengFlags = [];
  if (thisWeekCheckins === 0) disengFlags.push('no check-in this week');
  if (prevWeekCheckins === 0) disengFlags.push('no check-in previous week');
  if (weeklySubCount === 0)   disengFlags.push('no weekly reflections submitted');
  if (totalCheckins < 2)     disengFlags.push('fewer than 2 check-ins in 30 days');
  if (disengFlags.length >= 2) {
    patterns.push({
      type:       'DISENGAGEMENT_RISK',
      label:      'Disengagement Risk',
      confidence: disengFlags.length >= 3 ? 'high' : 'medium',
      signals:    disengFlags,
    });
  }

  // ── Confidence Concern ───────────────────────────────────────────────────
  const confFlags = [];
  if (doubtSignals >= 2) confFlags.push(`doubt/uncertainty language (${doubtSignals} signals)`);
  if (pressureScore !== null && pressureScore < 3) confFlags.push(`low pressure response score (${pressureScore}/5)`);
  if (overallScore !== null && overallScore < 3) confFlags.push(`below-average assessment score (${overallScore}/5)`);
  if (recentAvg !== null && recentAvg < 2.8) confFlags.push(`low mood (${recentAvg}/5)`);
  if (confFlags.length >= 2) {
    patterns.push({
      type:       'CONFIDENCE_CONCERN',
      label:      'Confidence Concern',
      confidence: confFlags.length >= 3 ? 'high' : 'medium',
      signals:    confFlags,
    });
  }

  // ── Isolation Risk ───────────────────────────────────────────────────────
  const isoFlags = [];
  if (isolationSignals >= 1) isoFlags.push('isolation language detected');
  if (totalCheckins < 2)     isoFlags.push('minimal participation');
  if (recentAvg !== null && recentAvg < 2.5) isoFlags.push(`low mood (${recentAvg}/5)`);
  if (isoFlags.length >= 2) {
    patterns.push({
      type:       'ISOLATION_RISK',
      label:      'Isolation Risk',
      confidence: isoFlags.length >= 3 ? 'high' : 'medium',
      signals:    isoFlags,
    });
  }

  // ── Goal Misalignment ────────────────────────────────────────────────────
  const goalFlags = [];
  if (hasGoal) {
    if (weeklySubCount === 0)                 goalFlags.push('has goal but no weekly reflections submitted');
    if (totalCheckins > 0 && consecutive >= 2) goalFlags.push('declining engagement alongside active goal');
    if (recentAvg !== null && recentAvg < 2.8) goalFlags.push('goal-holder showing low mood');
    if (goalFlags.length >= 2) {
      patterns.push({
        type:       'GOAL_MISALIGNMENT',
        label:      'Goal Abandonment Risk',
        confidence: goalFlags.length >= 3 ? 'high' : 'medium',
        signals:    goalFlags,
      });
    }
  }

  return patterns;
}

function _predictMemberRisksFromData(name, weeklyMoodAvgs) {
  // weeklyMoodAvgs: [{week, avg}] newest-first
  // Returns array of {type, prediction, confidence, reasons, urgency} or []
  const valid = weeklyMoodAvgs.filter(w => w.avg !== null);
  if (valid.length < 3) return [];

  // Linear slope over last 3-4 points (newest-first → reverse for regression)
  const pts = valid.slice(0, 4).reverse(); // oldest first
  const n = pts.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  pts.forEach((p, i) => { sumX += i; sumY += p.avg; sumXY += i * p.avg; sumX2 += i * i; });
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

  const predictions = [];
  if (slope < -0.2) {
    // Project 2 periods forward from most recent
    const projected = valid[0].avg + slope * 2;
    const urgency   = projected < 2.0 ? 'high' : projected < 2.5 ? 'medium' : 'low';
    const conf      = valid.length >= 4 ? 'high' : 'medium';
    predictions.push({
      type:             'MOOD_DECLINE_RISK',
      label:            'Mood Decline Trajectory',
      prediction:       `If current trend continues, mood may reach ~${Math.max(1, Math.round(projected * 10) / 10).toFixed(1)}/5 within 2 weeks`,
      confidence:       conf,
      urgency,
      reasons:          [`Slope: ${slope.toFixed(2)} per week over last ${n} periods`, `Current mood: ${valid[0].avg}/5`],
    });
  }
  return predictions;
}

/* ── normalizeMemberGoals ─────────────────────────────────────────────────
   memberGoals[key] can be either:
     • Array   — set by old goal-management endpoints
     • Object  — set by POST /api/auth/complete-profile (onboarding)
   This normaliser always returns an Array so callers can safely call .filter()
   without crashing on object-format data.
──────────────────────────────────────────────────────────────────────────── */
function normalizeMemberGoals(goalData) {
  if (!goalData) return [];
  if (Array.isArray(goalData)) return goalData;
  if (typeof goalData === 'object') {
    const goals = [];
    if (goalData.goal || goalData.mainGoals) {
      goals.push({
        id: 'profile_main_goal',
        title: goalData.goal || goalData.mainGoals,
        status: 'active',
        source: 'profile',
      });
    }
    if (goalData.longTermGoals || goalData.identity) {
      goals.push({
        id: 'profile_long_term_goal',
        title: goalData.longTermGoals || goalData.identity,
        status: 'active',
        source: 'profile',
      });
    }
    if (Array.isArray(goalData.personalMetrics)) {
      goalData.personalMetrics.forEach(metric => {
        goals.push({
          id: 'metric_' + String(metric).toLowerCase().replace(/\W+/g, '_'),
          title: metric,
          status: 'active',
          source: 'personal_metric',
          type: 'metric',
        });
      });
    }
    return goals;
  }
  return [];
}

/* Resolve a member's raw goal record across every key shape it might live under:
   the stable id-key (onboarding), the legacy name-key, and — as a last resort —
   a record whose stored memberName matches (recovers goals stranded under an
   unexpected/old key, e.g. after a name change). Without this, a member who DOES
   have goals can read as "unanchored" purely from a key mismatch, and the advisor
   then treats that false absence as the finding. */
function _memberGoalsFor(code, u) {
  if (!u) return null;
  const direct = memberGoals[userKey(code, u.id)] || (u.name ? memberGoals[memberKey(code, u.name)] : null);
  if (direct) return direct;
  const nm = (u.name || '').toLowerCase().trim();
  if (nm) {
    for (const g of Object.values(memberGoals)) {
      if (g && typeof g === 'object' && !Array.isArray(g) && (g.memberName || '').toLowerCase().trim() === nm) return g;
    }
  }
  return null;
}

function _aggregateOrgData(code) {
  const users  = orgUsers[code]  || {};
  const meta   = orgMeta[code]   || {};
  const groups = orgGroups[code] || [];

  const WEEK_MS       = 7  * 24 * 60 * 60 * 1000;
  const MONTH_MS      = 30 * 24 * 60 * 60 * 1000;
  const now           = Date.now();
  const weekAgo       = now - WEEK_MS;
  const monthAgo      = now - MONTH_MS;
  const prevWeekFrom  = now - 14 * 24 * 60 * 60 * 1000; // 7–14 days ago
  const prevWeekTo    = now - WEEK_MS;

  const allMembers = Object.values(users).filter(u => u.role !== 'superadmin');

  // ── Collect ALL check-ins across last 30 days ─────────────────────────────
  const allCheckins = [];
  Object.entries(memberCheckins).forEach(([key, entries]) => {
    if (!key.startsWith(code + ':')) return;
    (entries || []).forEach(c => {
      const ts = c.ts || c.date;
      if (!ts) return;
      const time = new Date(ts).getTime();
      if (time < monthAgo) return;
      allCheckins.push({
        memberName: c.memberName || key.split(':').slice(1).join(':'),
        mood: c.mood != null ? Number(c.mood) : null,
        text: c.text || c.note || '',
        role: c.role || 'member',
        ts, time,
        isThisWeek: time > weekAgo,
        isPrevWeek: time > prevWeekFrom && time <= prevWeekTo,
      });
    });
  });

  const recentCheckins = allCheckins.filter(c => c.isThisWeek);
  const prevCheckins   = allCheckins.filter(c => c.isPrevWeek);

  // Consolidated per-member (handles both name-key and userId-key entries)
  const checkinsByMember = {};
  allCheckins.forEach(c => {
    const n = c.memberName || 'Unknown';
    if (!checkinsByMember[n]) checkinsByMember[n] = [];
    checkinsByMember[n].push(c);
  });

  const moodLast7    = _avgMood(recentCheckins);
  const moodLast30   = _avgMood(allCheckins);
  const moodPrevWeek = _avgMood(prevCheckins);
  const moodCount7   = recentCheckins.filter(c => c.mood !== null).length;

  // ── Engagement ────────────────────────────────────────────────────────────
  const activeThisWeek  = new Set(recentCheckins.map(c => c.memberName)).size;
  const activeLast30    = new Set(allCheckins.map(c => c.memberName)).size;
  const inactiveMembers = allMembers
    .filter(u => !recentCheckins.some(c => c.memberName === u.name))
    .map(u => u.name);

  // ── At-risk rule-based signals ────────────────────────────────────────────
  const atRiskComputed = [];
  Object.entries(checkinsByMember).forEach(([name, checkins]) => {
    const thisWeekMoods = checkins.filter(c => c.isThisWeek && c.mood !== null).map(c => c.mood);
    if (!thisWeekMoods.length) return;
    const avg = thisWeekMoods.reduce((a, b) => a + b, 0) / thisWeekMoods.length;
    if (avg <= 2) {
      atRiskComputed.push({ name, reason: `Low mood avg ${avg.toFixed(1)}/5 across ${thisWeekMoods.length} check-in(s)`, urgency: 'high' });
    } else if (avg < 2.8) {
      atRiskComputed.push({ name, reason: `Below-average mood (${avg.toFixed(1)}/5) this week`, urgency: 'medium' });
    } else if (thisWeekMoods.length >= 3) {
      const last    = thisWeekMoods[thisWeekMoods.length - 1];
      const prevAvg = thisWeekMoods.slice(0, -1).reduce((a, b) => a + b, 0) / (thisWeekMoods.length - 1);
      if (last < prevAvg - 1.2) {
        atRiskComputed.push({ name, reason: 'Mood dropping sharply — latest well below recent average', urgency: 'medium' });
      }
    }
  });
  inactiveMembers.forEach(name => atRiskComputed.push({ name, reason: 'No check-in this week', urgency: 'low' }));

  // ── Goals ─────────────────────────────────────────────────────────────────
  const membersWithGoals    = [];
  const membersWithoutGoals = [];
  allMembers.forEach(u => {
    const goal = memberGoals[userKey(code, u.id)] || memberGoals[memberKey(code, u.name)];
    if (goal?.goal) membersWithGoals.push({ name: u.name, userId: u.id, goal: goal.goal, identity: goal.identity || '' });
    else membersWithoutGoals.push(u.name);
  });

  // ── Weekly reflections — last 4 weeks ─────────────────────────────────────
  const last4WeekKeys    = [0, 1, 2, 3].map(n => weekKey(code, _weekStrOffset(n)));
  const allWeeklyEntries = last4WeekKeys.flatMap(k => weeklyAssessments[k] || []);
  const thisWeekEntries  = weeklyAssessments[last4WeekKeys[0]] || [];

  // ── Assessment/scenario results per member ────────────────────────────────
  const resultsByMember = {};
  allMembers.forEach(u => {
    const all = [
      ...(memberResults[memberKey(code, u.name)] || []),
      ...(memberResults[userKey(code, u.id)]     || []),
    ];
    if (all.length) resultsByMember[u.name] = all.slice(-4);
  });

  // ── Shared/anonymous notes — last 30 days ─────────────────────────────────
  const recentSharedNotes = Object.values(orgNotes).filter(
    n => n.orgCode === code && n.type !== 'private' && new Date(n.createdAt).getTime() > monthAgo
  );

  // ── Group cross-reference ─────────────────────────────────────────────────
  const groupData = groups.map(g => {
    const memberIds  = g.memberIds || [];
    const gmUsers    = allMembers.filter(u => memberIds.includes(u.id));
    const gmNames    = gmUsers.map(u => u.name);
    const gmCheckins = allCheckins.filter(c => gmNames.includes(c.memberName) && c.isThisWeek);
    return {
      id: g.id, name: g.name,
      memberCount: memberIds.length,
      memberNames: gmNames,
      avgMood: _avgMood(gmCheckins),
      activeCount: new Set(gmCheckins.map(c => c.memberName)).size,
      noteCount: Object.values(orgNotes).filter(
        n => n.orgCode === code && n.groupId === g.id && new Date(n.createdAt).getTime() > weekAgo
      ).length,
    };
  });

  // ── Text corpus for semantic theme detection ───────────────────────────────
  const textCorpus = [
    ...allCheckins.map(c => c.text),
    ...allWeeklyEntries.flatMap(e => Object.values(e.data || {})),
    ...recentSharedNotes.map(n => n.content),
  ].filter(Boolean).map(t => String(t).slice(0, 200));

  // ── Per-member pattern detection & predictions ────────────────────────────
  const memberPatterns     = {};
  const memberPredictions  = {};

  allMembers.forEach(u => {
    const mCheckins = checkinsByMember[u.name] || [];
    const rawGoals  = memberGoals[memberKey(code, u.name)] || memberGoals[userKey(code, u.id)];
    const goals     = normalizeMemberGoals(rawGoals).filter(g => g.status !== 'completed');
    const scores    = resultsByMember[u.name] || {};

    // Build per-week mood averages (last 4 weeks)
    const weeklyMoodAvgs = [0, 1, 2, 3].map(n => {
      const wStr = _weekStrOffset(n);
      const wCheckins = mCheckins.filter(c => {
        if (!c.ts && !c.date) return false;
        // crude: check if entry is approximately in that week
        const t = new Date(c.ts || c.date).getTime();
        const wStart = Date.now() - (n + 1) * 7 * 24 * 60 * 60 * 1000;
        const wEnd   = Date.now() - n * 7 * 24 * 60 * 60 * 1000;
        return t >= wStart && t < wEnd;
      });
      return { week: wStr, avg: _avgMood(wCheckins) };
    });

    // Weekly reflection count
    const memberName = u.name;
    const memberId   = u.id;
    const weeklySubCount = Object.values(weeklyAssessments).reduce((sum, entries) => {
      return sum + (entries || []).filter(e =>
        (e.memberName === memberName || e.memberId === memberId) &&
        new Date(e.submittedAt || 0).getTime() > monthAgo
      ).length;
    }, 0);

    // Member text corpus
    const memberText = mCheckins.map(c => c.text).filter(Boolean);

    memberPatterns[u.name]    = _detectMemberPatternsFromData(
      u.name, weeklyMoodAvgs, mCheckins, weeklySubCount, goals.length > 0, scores, memberText
    );
    memberPredictions[u.name] = _predictMemberRisksFromData(u.name, weeklyMoodAvgs);
  });

  return {
    meta, allMembers, memberCount: allMembers.length,
    allCheckins, recentCheckins, checkinsByMember,
    moodLast7, moodLast30, moodPrevWeek, moodCount7,
    activeThisWeek, activeLast30, inactiveMembers,
    atRiskComputed,
    membersWithGoals, membersWithoutGoals,
    allWeeklyEntries, thisWeekEntries,
    resultsByMember,
    recentSharedNotes,
    groupData, textCorpus,
    memberPatterns, memberPredictions,
    thisWeek: _weekStrOffset(0),
  };
}

function _buildInsightPrompt(agg, orgCode) {
  const lines = [];

  // ── Header ────────────────────────────────────────────────────────────────
  lines.push(`ORG: ${agg.meta.orgName || orgCode} (${agg.meta.orgMode || 'general'})`);
  lines.push(`WEEK: ${agg.thisWeek} | Members: ${agg.memberCount}`);
  lines.push(`ENGAGEMENT: ${agg.activeThisWeek}/${agg.memberCount} active this week, ${agg.activeLast30}/${agg.memberCount} active last 30 days`);

  const trendDir = agg.moodLast7 !== null && agg.moodPrevWeek !== null
    ? (agg.moodLast7 > agg.moodPrevWeek + 0.3 ? 'up ↑' : agg.moodLast7 < agg.moodPrevWeek - 0.3 ? 'down ↓' : 'stable →')
    : '—';
  lines.push(`MOOD: This week avg ${agg.moodLast7 ?? '—'}/5 (${agg.moodCount7} responses) | Prev week ${agg.moodPrevWeek ?? '—'}/5 | Last 30d avg ${agg.moodLast30 ?? '—'}/5 | vs last week: ${trendDir}`);
  if (agg.inactiveMembers.length) lines.push(`NO CHECK-IN THIS WEEK: ${agg.inactiveMembers.join(', ')}`);
  lines.push('');

  // ── Per-member cross-referenced profiles ──────────────────────────────────
  lines.push('MEMBER PROFILES (goals + check-ins + weekly reflections + assessments):');
  agg.allMembers.forEach(u => {
    const thisWeekC  = (agg.checkinsByMember[u.name] || []).filter(c => c.isThisWeek);
    const allC       = agg.checkinsByMember[u.name]  || [];
    const moods7     = thisWeekC.filter(c => c.mood !== null).map(c => c.mood);
    const avgM       = moods7.length ? (moods7.reduce((a, b) => a + b, 0) / moods7.length).toFixed(1) : null;
    const text7      = thisWeekC.map(c => c.text).filter(Boolean).slice(0, 3).join(' / ').slice(0, 280);
    const text30     = allC.filter(c => !c.isThisWeek).map(c => c.text).filter(Boolean).slice(-4).join(' / ').slice(0, 280);
    const goalObj    = agg.membersWithGoals.find(g => g.name === u.name);
    const weeklies   = agg.allWeeklyEntries.filter(e => e.memberName === u.name || (e.memberId && e.memberId === u.id)).slice(-2);
    const weeklyText = weeklies.map(e => Object.values(e.data || {}).filter(Boolean).join(' | ').slice(0, 250)).join(' // ');
    const results    = agg.resultsByMember[u.name] || [];
    const scoreLines = results.map(r => r.score
      ? `overall:${r.score.overall ?? '?'} ethical:${r.score.ethical_reasoning ?? '?'} pressure:${r.score.pressure_response ?? '?'} self-awareness:${r.score.self_awareness ?? '?'}`
      : null).filter(Boolean).slice(-2).join(' | ');

    lines.push(`\n[${u.name}] role:${u.role}`);
    lines.push(`  Goal: ${goalObj ? `"${goalObj.goal.slice(0, 130)}"` : 'not set'}${goalObj?.identity ? ` | Identity: "${goalObj.identity.slice(0, 80)}"` : ''}`);
    lines.push(`  Mood this week: ${avgM !== null ? `${avgM}/5 (${moods7.length} check-ins)` : 'no check-in'}`);
    if (text7)   lines.push(`  Check-in text (this week): "${text7}"`);
    if (text30)  lines.push(`  Check-in text (prev weeks): "${text30}"`);
    if (weeklyText) lines.push(`  Weekly reflections: "${weeklyText}"`);
    if (scoreLines) lines.push(`  Assessment scores: ${scoreLines}`);
  });
  lines.push('');

  // ── Groups ────────────────────────────────────────────────────────────────
  if (agg.groupData.length > 0) {
    lines.push('GROUPS:');
    agg.groupData.forEach(g => {
      const mStr = g.avgMood !== null ? `avg mood ${g.avgMood}/5` : 'no mood data';
      lines.push(`${g.name}: members [${g.memberNames.join(', ')}] — ${g.activeCount}/${g.memberCount} active, ${mStr}`);
    });
    lines.push('');
  }

  // ── Text corpus for semantic clustering ───────────────────────────────────
  const corpus = agg.textCorpus.filter(Boolean).slice(0, 35);
  if (corpus.length > 0) {
    lines.push('ALL MEMBER TEXT (check-ins + reflections + notes — use for semantic theme clustering):');
    corpus.forEach((t, i) => lines.push(`${i + 1}. "${t}"`));
    lines.push('');
  }

  // ── Detected risk patterns (rule-based, pre-computed) ────────────────────
  const allPatternNames = Object.entries(agg.memberPatterns || {})
    .flatMap(([name, pats]) => pats.map(p => `${name}: ${p.label} (${p.confidence} confidence — ${p.signals.join('; ')})`));
  const allPredictions = Object.entries(agg.memberPredictions || {})
    .flatMap(([name, preds]) => preds.map(p => `${name}: ${p.label} — ${p.prediction}`));

  if (allPatternNames.length > 0) {
    lines.push('DETECTED RISK PATTERNS (algorithm-detected, include in recommendations):');
    allPatternNames.forEach(s => lines.push(`  • ${s}`));
    lines.push('');
  }
  if (allPredictions.length > 0) {
    lines.push('TRAJECTORY PREDICTIONS (linear trend extrapolation):');
    allPredictions.forEach(s => lines.push(`  • ${s}`));
    lines.push('');
  }

  return lines.join('\n');
}

app.get('/api/intelliq/org-insights', requireAuth, async (req, res) => {
  const { refresh } = req.query;
  const g = _requireInsight(req, res); if (!g) return;
  const code = g.code;  // session org — never trust a query orgCode for analytics

  const CACHE_TTL    = 60 * 60 * 1000;
  const cached       = orgInsightCache[code];
  const forceRefresh = refresh === '1';
  if (cached && !forceRefresh && (Date.now() - cached.generatedAt < CACHE_TTL)) {
    return res.json({ ...cached.data, cached: true });
  }

  let agg;
  try {
    agg = _aggregateOrgData(code);
  } catch(e) {
    console.error('[org-insights] _aggregateOrgData failed:', e.message, e.stack);
    return res.status(500).json({ error: 'Intelligence data unavailable — internal error. Please try again.' });
  }
  const stats = {
    memberCount:       agg.memberCount,
    activeThisWeek:    agg.activeThisWeek,
    activeLast30:      agg.activeLast30,
    avgMoodLast7:      agg.moodLast7,
    avgMoodLast30:     agg.moodLast30,
    avgMoodPrevWeek:   agg.moodPrevWeek,
    moodCount:         agg.moodCount7,
    goalsSet:          agg.membersWithGoals.length,
    weeklySubmissions: agg.thisWeekEntries.length,
    inactiveMembers:   agg.inactiveMembers,
    atRiskComputed:    agg.atRiskComputed,
    week:              agg.thisWeek,
  };

  const hasAnyData = agg.allCheckins.length > 0
    || agg.allWeeklyEntries.length > 0
    || agg.membersWithGoals.length > 0;

  if (!hasAnyData || agg.memberCount === 0) {
    const result = {
      generatedAt: new Date().toISOString(), cached: false, stats,
      ai: _noDataFallback(agg),
    };
    orgInsightCache[code] = { data: result, generatedAt: Date.now() };
    return res.json(result);
  }

  // ── Claude synthesis with v2 structured output ────────────────────────────
  const SYSTEM = `You are IntelliQ, a decision-support intelligence system. You receive structured data about an organisation — member goals, check-ins, weekly reflections, assessment scores, groups. Your job is NOT to describe the data, but to synthesise it into intelligence: what does it mean, what patterns exist, and what should the leader do?

OUTPUT FORMAT — valid JSON only, absolutely no markdown or extra text outside the JSON object:
{
  "summary": "2-3 sentences. What does the leader need to know TODAY? Name specific people and specific patterns. Never be generic.",
  "moodTrend": "improving|stable|declining|unknown",
  "moodNote": "One sentence comparing this week's mood to the previous week and 30-day trend.",
  "notEnoughData": false,

  "trends": {
    "trendDirection": "improving|stable|declining",
    "trendReason": "One sentence — reference the actual numbers and which members are driving the change.",
    "confidenceLevel": "high|medium|low",
    "engagementTrend": "improving|stable|declining",
    "moodComparison": "One sentence comparing this week to prev week and 30-day avg with specific numbers."
  },

  "semanticThemes": [
    {
      "theme": "Cluster label — e.g. Fatigue / Burnout, Confidence Concerns, Leadership Tension, Transition Stress",
      "signals": ["exact word or short phrase from the actual text"],
      "affectedMembers": ["name — only if clearly identifiable"],
      "severity": "high|medium|low"
    }
  ],

  "memberProfiles": [
    {
      "name": "exact member name from data",
      "currentState": "One sentence — where is this person right now, specifically?",
      "strengths": ["one specific observable strength grounded in their data"],
      "concerns": ["one specific concern with data evidence"],
      "goalAlignment": "on_track|mixed|off_track|no_goal",
      "goalAlignmentExplanation": "One sentence — does their behavior match their goal? Reference the goal and the check-in/assessment evidence.",
      "riskSignals": ["specific signal — e.g. 'mood avg 1.8/5', 'pressure_response score 42'"],
      "recommendedAction": "One concrete action for the leader, with their name."
    }
  ],

  "groupInsights": [
    {
      "groupName": "exact group name",
      "mood": "high|okay|low|unknown",
      "engagement": "high|medium|low",
      "recurringThemes": ["theme"],
      "riskSignals": ["specific signal"],
      "positiveSignals": ["specific signal"],
      "membersNeedingAttention": ["name"],
      "suggestedAction": "One concrete group-level action."
    }
  ],

  "recommendations": [
    {
      "action": "Specific action — who, what, when.",
      "urgency": "high|medium|low",
      "owner": "leader|admin|member",
      "reason": "Why — reference actual data from the brief.",
      "evidence": ["checkins", "weeklyAssessments", "goals", "assessmentScores", "notes"],
      "confidence": "high|medium|low",
      "predictedOutcome": "One sentence: what likely improves if this action is taken?",
      "riskIfIgnored": "One sentence: what likely happens if this is not acted on?"
    }
  ],

  "memberHighlights": [
    { "name": "...", "note": "Specific positive observation with data support." }
  ],

  "goalProgress": "One sentence summarising goal-setting and whether people's actions align with their goals.",

  "atRisk": [
    { "name": "...", "reason": "Specific reason with data.", "urgency": "high|medium|low" }
  ],

  "themes": ["short label 1", "short label 2", "short label 3"],

  "groupHighlights": [],

  "recommendedActions": [
    { "priority": "high|medium|low", "action": "..." }
  ]
}

CRITICAL RULES:
- Synthesise, don't describe. "Timmy is struggling with leadership confidence" is synthesis. "Timmy checked in 3 times" is description.
- Every recommendation must name the person and reference specific data.
- semanticThemes: cluster conceptually similar text even if words differ (overwhelmed/drained/burned out → Fatigue). Max 4.
- memberProfiles: include ALL members — even those with no data (state "No activity this week — unknown").
- goalAlignment: "off_track" if check-ins or assessments contradict the stated goal direction. "on_track" if they support it. "mixed" if partial.
- recommendations: max 4, highest urgency first. Each must have evidence[] listing the data sources that support it. Each must include confidence, predictedOutcome, riskIfIgnored.
- atRisk max 3, memberHighlights max 2.
- groupInsights: only include groups that have members with data. Skip empty groups.
- confidenceLevel: "high" if 4+ data points, "medium" if 2-3, "low" if 0-1.
- If DETECTED RISK PATTERNS are listed in the brief, use them to inform your recommendations and atRisk entries. Do not ignore them.
- riskPatterns in each recommendation: reference the pattern label (e.g. "Burnout Risk") if that pattern was the driver.`;

  let ai = null;
  try {
    const response = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 2400,
      system:     SYSTEM,
      messages:   [{ role: 'user', content: _buildInsightPrompt(agg, code) }],
    });
    const raw = (response.content[0]?.text || '').replace(/```json\n?|\n?```/g, '').trim();
    ai = JSON.parse(raw);
  } catch(err) {
    console.warn('Org insights v2 — AI fallback:', err.message);
  }

  if (!ai) ai = _buildFallbackInsight(agg);

  // Flatten patterns for the frontend — include in response so the UI can render them without a second call
  const flatPatterns = Object.entries(agg.memberPatterns || {})
    .flatMap(([name, pats]) => pats.map(p => ({ member: name, ...p })));
  const flatPredictions = Object.entries(agg.memberPredictions || {})
    .flatMap(([name, preds]) => preds.map(p => ({ member: name, ...p })));

  const result = { generatedAt: new Date().toISOString(), cached: false, stats, ai, patterns: flatPatterns, predictions: flatPredictions };
  orgInsightCache[code] = { data: result, generatedAt: Date.now() };
  res.json(result);
});

/* ═══════════════════════════════════════════════════════════════════════════
   INTELLIQ MEMORY — Timelines + Intervention Tracking + Outcome Analysis
   Timelines: computed on demand from existing stores, cached 30 min.
   Interventions: persisted in orgInterventions store.
   ═══════════════════════════════════════════════════════════════════════════ */

const memberTimelineCache = {}; // `orgCode:userId`  → { data, ts }
const groupTimelineCache  = {}; // `orgCode:groupId` → { data, ts }
const orgTimelineCache    = {}; // orgCode            → { data, ts }
const TIMELINE_TTL        = 30 * 60 * 1000; // 30 minutes

function _intvId() { return 'intv_' + Math.random().toString(36).slice(2, 10); }

// Categorise an intervention action by keyword for learning stats
function _categorizeAction(action) {
  const a = action || '';
  if (/private|1-on-1|one.on.one|conversation|speak with|talk to/i.test(a)) return 'Private conversation';
  if (/group|session|workshop|team meeting/i.test(a))                        return 'Group session';
  if (/goal|objective|check on progress/i.test(a))                           return 'Goal review';
  if (/nudge|remind|encourage|prompt|check.in/i.test(a))                     return 'Engagement nudge';
  if (/assessment|scenario|assign/i.test(a))                                 return 'Assessment assigned';
  return 'Other';
}

// Measure outcome of a completed intervention (mood delta pre/post)
function _measureInterventionOutcome(code, intv) {
  const { targetMember, targetMemberId, createdAt, completedAt } = intv;
  if (!completedAt) return null;

  const completedTs = new Date(completedAt).getTime();
  const createdTs   = new Date(createdAt).getTime();
  const MIN_WAIT    = 7 * 24 * 60 * 60 * 1000;

  if (Date.now() < completedTs + MIN_WAIT) {
    return {
      status:     'pending',
      note:       'Needs 7+ days of post-intervention check-ins.',
      checkAfter: new Date(completedTs + MIN_WAIT).toISOString(),
    };
  }

  const keys = [
    targetMember   ? memberKey(code, targetMember)   : null,
    targetMemberId ? userKey(code, targetMemberId)   : null,
  ].filter(Boolean);

  const allC = [];
  keys.forEach(k => (memberCheckins[k] || []).forEach(c => {
    const ts = c.ts || c.date;
    if (ts) allC.push({ mood: c.mood != null ? Number(c.mood) : null, time: new Date(ts).getTime() });
  }));

  const PRE = 21 * 24 * 60 * 60 * 1000;
  const beforeC = allC.filter(c => c.time >= createdTs - PRE && c.time < createdTs);
  const afterC  = allC.filter(c => c.time >= completedTs     && c.time <= completedTs + PRE);

  const beforeMoods = beforeC.filter(c => c.mood !== null).map(c => c.mood);
  const afterMoods  = afterC.filter(c => c.mood !== null).map(c => c.mood);

  if (!beforeMoods.length || !afterMoods.length) {
    return { status: 'insufficient_data', note: 'Not enough check-ins to measure impact.' };
  }

  const beforeAvg = beforeMoods.reduce((a, b) => a + b, 0) / beforeMoods.length;
  const afterAvg  = afterMoods.reduce((a, b)  => a + b, 0) / afterMoods.length;
  const moodDelta = afterAvg - beforeAvg;

  // ── Engagement delta (check-in frequency) ─────────────────────────────────
  const PRE_DAYS  = PRE / (24 * 60 * 60 * 1000);
  const beforeRate = beforeC.length / PRE_DAYS * 7; // per week
  const afterRate  = afterC.length  / PRE_DAYS * 7;
  const engDelta   = afterRate - beforeRate;

  // ── Weekly participation delta ─────────────────────────────────────────────
  const countWeekliesInWindow = (from, to) => {
    const name = targetMember || '';
    const id   = targetMemberId || '';
    return Object.values(weeklyAssessments).reduce((sum, entries) => {
      return sum + (entries || []).filter(e =>
        (e.memberName === name || e.memberId === id) &&
        new Date(e.submittedAt || 0).getTime() >= from &&
        new Date(e.submittedAt || 0).getTime() < to
      ).length;
    }, 0);
  };
  const weeklyBefore = countWeekliesInWindow(createdTs - PRE, createdTs);
  const weeklyAfter  = countWeekliesInWindow(completedTs, completedTs + PRE);
  const weeklyDelta  = weeklyAfter - weeklyBefore;

  // ── changesDetected ────────────────────────────────────────────────────────
  const changesDetected = [
    {
      dimension: 'mood',
      before:    Math.round(beforeAvg * 10) / 10,
      after:     Math.round(afterAvg  * 10) / 10,
      delta:     Math.round(moodDelta * 10) / 10,
      direction: moodDelta > 0.3 ? 'improved' : moodDelta < -0.3 ? 'declined' : 'unchanged',
    },
    {
      dimension: 'engagement',
      before:    Math.round(beforeRate * 10) / 10,
      after:     Math.round(afterRate  * 10) / 10,
      delta:     Math.round(engDelta   * 10) / 10,
      direction: engDelta > 0.3 ? 'improved' : engDelta < -0.3 ? 'declined' : 'unchanged',
    },
  ];
  if (weeklyBefore > 0 || weeklyAfter > 0) {
    changesDetected.push({
      dimension: 'weekly_participation',
      before:    weeklyBefore,
      after:     weeklyAfter,
      delta:     weeklyDelta,
      direction: weeklyDelta > 0 ? 'improved' : weeklyDelta < 0 ? 'declined' : 'unchanged',
    });
  }

  // ── Confidence level ───────────────────────────────────────────────────────
  const totalPoints = beforeMoods.length + afterMoods.length;
  const confidence  = totalPoints >= 8 ? 'high' : totalPoints >= 4 ? 'medium' : 'low';

  // ── Likely drivers (rule-based inference) ─────────────────────────────────
  const likelyDrivers = [];
  const moodUp   = moodDelta  >  0.3;
  const moodDown = moodDelta  < -0.3;
  const engUp    = engDelta   >  0.2;
  const engDown  = engDelta   < -0.2;
  if (moodUp   && engUp)   likelyDrivers.push('Both mood and engagement improved — intervention appears to have addressed core needs');
  if (moodUp   && !engUp)  likelyDrivers.push('Mood improved without significant engagement change — emotional impact without behavior change');
  if (!moodUp  && engUp)   likelyDrivers.push('Engagement increased but mood unchanged — member re-engaged but underlying concerns may persist');
  if (moodDown && engDown) likelyDrivers.push('Both mood and engagement declined — intervention may not have addressed root cause');
  if (weeklyDelta > 0)     likelyDrivers.push('Weekly reflection participation increased — stronger accountability loop forming');

  // ── Overall outcome ────────────────────────────────────────────────────────
  const positiveSignals  = changesDetected.filter(c => c.direction === 'improved').length;
  const negativeSignals  = changesDetected.filter(c => c.direction === 'declined').length;
  const overallOutcome   = positiveSignals > negativeSignals ? 'positive'
                         : negativeSignals > positiveSignals ? 'negative' : 'neutral';

  return {
    status:          'measured',
    moodBefore:      Math.round(beforeAvg  * 10) / 10,
    moodAfter:       Math.round(afterAvg   * 10) / 10,
    moodDelta:       Math.round(moodDelta  * 10) / 10,
    dataPoints:      { before: beforeMoods.length, after: afterMoods.length },
    outcome:         overallOutcome,
    confidence,
    changesDetected,
    likelyDrivers,
    outcomeSummary:  likelyDrivers[0] || (moodDelta > 0.5 ? `Mood improved ${moodDelta.toFixed(1)} points.` : 'No significant change detected.'),
    note:            moodDelta >  0.5 ? `Mood improved ${moodDelta.toFixed(1)} points.`
                   : moodDelta < -0.5 ? `Mood declined ${moodDelta.toFixed(1)} points.`
                   : 'No significant mood change detected.',
  };
}

// ── Build member timeline from existing data stores ───────────────────────────
async function _buildMemberTimeline(code, userId, memberName) {
  const events = [];

  // Goal events
  const goal = memberGoals[userKey(code, userId)] || memberGoals[memberKey(code, memberName)];
  if (goal?.setAt) events.push({ type: 'goal_set', ts: goal.setAt, data: { goal: goal.goal, identity: goal.identity || '' } });

  // Check-ins
  const checkinKeys = [userKey(code, userId), memberKey(code, memberName)];
  const seenCheckins = new Set();
  checkinKeys.forEach(k => (memberCheckins[k] || []).forEach(c => {
    const ts = c.ts || c.date;
    if (!ts || seenCheckins.has(ts)) return;
    seenCheckins.add(ts);
    events.push({ type: 'checkin', ts, data: { mood: c.mood != null ? Number(c.mood) : null, text: (c.text || c.note || '').slice(0, 120) } });
  }));

  // Weekly reflections (all weeks)
  Object.entries(weeklyAssessments).forEach(([key, entries]) => {
    if (!key.startsWith(code + ':')) return;
    (entries || []).forEach(e => {
      if (e.memberName !== memberName && e.memberId !== userId) return;
      const ts = e.submittedAt;
      if (!ts) return;
      events.push({ type: 'weekly_reflection', ts, data: { role: e.role || 'member', text: Object.values(e.data || {}).filter(Boolean).join(' | ').slice(0, 180) } });
    });
  });

  // Assessment results
  const seenResults = new Set();
  checkinKeys.forEach(k => (memberResults[k] || []).forEach(r => {
    const ts = r.submittedAt;
    if (!ts || seenResults.has(ts)) return;
    seenResults.add(ts);
    const score = r.score;
    events.push({ type: 'assessment', ts, data: { overall: score?.overall, summary: score?.summary?.slice(0, 120) || '', strengths: score?.strengths || [], development: score?.development || [] } });
  }));

  // Notes authored by this member (their own notes)
  Object.values(orgNotes).filter(n => n.orgCode === code && n.authorId === userId).forEach(n => {
    events.push({ type: 'note', ts: n.createdAt, data: { noteType: n.type, tag: n.tag, content: n.content.slice(0, 100) } });
  });

  // Intervention completions targeting this member
  (orgInterventions[code] || [])
    .filter(i => (i.targetMember === memberName || i.targetMemberId === userId) && i.completedAt)
    .forEach(i => {
      events.push({ type: 'intervention_completed', ts: i.completedAt, data: { action: i.action, outcome: i.outcome?.outcome, delta: i.outcome?.moodDelta } });
    });

  // Sort chronologically
  events.sort((a, b) => new Date(a.ts) - new Date(b.ts));

  // Group by month
  const byMonth = {};
  events.forEach(e => {
    const month = (e.ts || '').slice(0, 7);
    if (!month) return;
    if (!byMonth[month]) byMonth[month] = [];
    byMonth[month].push(e);
  });

  // Add computed mood change events between adjacent months
  const months = Object.keys(byMonth).sort();
  let prevMoodAvg = null;
  months.forEach(month => {
    const cis = byMonth[month].filter(e => e.type === 'checkin' && e.data.mood !== null);
    if (!cis.length) return;
    const avg = cis.reduce((s, e) => s + e.data.mood, 0) / cis.length;
    if (prevMoodAvg !== null) {
      const delta = avg - prevMoodAvg;
      if (delta >  0.8) byMonth[month].unshift({ type: 'mood_improving', ts: month + '-01T00:00:00Z', data: { from: prevMoodAvg.toFixed(1), to: avg.toFixed(1), delta: delta.toFixed(1) } });
      if (delta < -0.8) byMonth[month].unshift({ type: 'mood_declining', ts: month + '-01T00:00:00Z', data: { from: prevMoodAvg.toFixed(1), to: avg.toFixed(1), delta: delta.toFixed(1) } });
    }
    prevMoodAvg = avg;
  });

  // Generate 1-sentence AI narrative for months with 3+ events
  const monthData = await Promise.all(months.map(async month => {
    const evs = byMonth[month] || [];
    const label = new Date(month + '-15').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    const checkins = evs.filter(e => e.type === 'checkin');
    const moodAvg  = checkins.filter(e => e.data.mood !== null).length > 0
      ? (checkins.filter(e => e.data.mood !== null).reduce((s, e) => s + e.data.mood, 0) / checkins.filter(e => e.data.mood !== null).length).toFixed(1)
      : null;

    let narrative = null;
    if (evs.length >= 2) {
      const brief = evs.slice(0, 6).map(e => {
        if (e.type === 'goal_set')              return `Goal set: "${e.data.goal}"`;
        if (e.type === 'checkin' && e.data.text) return `Check-in: "${e.data.text}"`;
        if (e.type === 'weekly_reflection')      return `Weekly: "${e.data.text}"`;
        if (e.type === 'assessment')             return `Assessment score: ${e.data.overall ?? '?'}/100`;
        if (e.type === 'mood_improving')         return `Mood improved: ${e.data.from}→${e.data.to}`;
        if (e.type === 'mood_declining')         return `Mood declined: ${e.data.from}→${e.data.to}`;
        if (e.type === 'intervention_completed') return `Intervention: ${e.data.action}`;
        return null;
      }).filter(Boolean).join(' | ');
      try {
        const r = await client.messages.create({
          model: 'claude-haiku-4-5-20251001', max_tokens: 80,
          system: `Write ONE sentence (max 20 words) summarising what this data shows about a member during this month. Past tense. Specific. No fluff.`,
          messages: [{ role: 'user', content: `${memberName} — ${label}: ${brief}` }],
        });
        narrative = r.content[0]?.text?.trim() || null;
      } catch(e) { /* non-critical */ }
    }

    return { month, label, eventCount: evs.length, moodAvg, events: evs, narrative };
  }));

  return { member: memberName, userId, timeline: monthData.filter(m => m.eventCount > 0) };
}

// ── Build group timeline ────────────────────────────────────────────────────────
function _buildGroupTimeline(code, group) {
  const memberIds   = group.memberIds || [];
  const users       = orgUsers[code]   || {};
  const gmUsers     = Object.values(users).filter(u => memberIds.includes(u.id));

  // Collect all check-ins for group members, grouped by month
  const monthlyMood = {}; // month → [mood scores]
  const monthlyText = {}; // month → [text snippets]

  gmUsers.forEach(u => {
    const keys = [userKey(code, u.id), memberKey(code, u.name)];
    keys.forEach(k => (memberCheckins[k] || []).forEach(c => {
      const ts = c.ts || c.date;
      if (!ts) return;
      const month = ts.slice(0, 7);
      if (c.mood != null) {
        if (!monthlyMood[month]) monthlyMood[month] = [];
        monthlyMood[month].push(Number(c.mood));
      }
      if (c.text || c.note) {
        if (!monthlyText[month]) monthlyText[month] = [];
        monthlyText[month].push((c.text || c.note || '').slice(0, 80));
      }
    }));

    // Weekly reflections
    Object.entries(weeklyAssessments).forEach(([key, entries]) => {
      if (!key.startsWith(code + ':')) return;
      entries.filter(e => e.memberName === u.name || e.memberId === u.id).forEach(e => {
        const month = (e.submittedAt || '').slice(0, 7);
        if (!month) return;
        const text = Object.values(e.data || {}).filter(Boolean).join(' | ').slice(0, 100);
        if (text) { if (!monthlyText[month]) monthlyText[month] = []; monthlyText[month].push(text); }
      });
    });
  });

  const months = [...new Set([...Object.keys(monthlyMood), ...Object.keys(monthlyText)])].sort();
  const timeline = months.map(month => {
    const moods = monthlyMood[month] || [];
    const avgMood = moods.length ? Math.round((moods.reduce((a, b) => a + b, 0) / moods.length) * 10) / 10 : null;
    const texts   = (monthlyText[month] || []).slice(0, 4);
    return {
      month,
      label:        new Date(month + '-15').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
      avgMood,
      checkInCount: moods.length,
      textSamples:  texts,
    };
  });

  return { groupId: group.id, groupName: group.name, memberCount: gmUsers.length, timeline };
}

// ── Build org timeline ────────────────────────────────────────────────────────
function _buildOrgTimeline(code) {
  const users  = orgUsers[code]  || {};
  const allMembers = Object.values(users).filter(u => u.role !== 'superadmin');

  const monthlyMood = {};
  const monthlyActive = {};
  const monthlyText = {};

  allMembers.forEach(u => {
    const keys = [userKey(code, u.id), memberKey(code, u.name)];
    keys.forEach(k => (memberCheckins[k] || []).forEach(c => {
      const ts = c.ts || c.date;
      if (!ts) return;
      const month = ts.slice(0, 7);
      if (c.mood != null) {
        if (!monthlyMood[month])   monthlyMood[month]   = [];
        if (!monthlyActive[month]) monthlyActive[month] = new Set();
        monthlyMood[month].push(Number(c.mood));
        monthlyActive[month].add(u.name);
      }
      if (c.text || c.note) {
        if (!monthlyText[month]) monthlyText[month] = [];
        monthlyText[month].push((c.text || c.note || '').slice(0, 80));
      }
    }));
  });

  const months = [...new Set([...Object.keys(monthlyMood), ...Object.keys(monthlyText)])].sort();
  const timeline = months.map(month => {
    const moods     = monthlyMood[month] || [];
    const avgMood   = moods.length ? Math.round((moods.reduce((a, b) => a + b, 0) / moods.length) * 10) / 10 : null;
    const active    = monthlyActive[month]?.size || 0;
    const texts     = (monthlyText[month] || []).slice(0, 5);
    return {
      month,
      label:         new Date(month + '-15').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
      avgMood,
      activeMembers: active,
      totalMembers:  allMembers.length,
      textSamples:   texts,
    };
  });

  return { orgCode: code, orgName: orgMeta[code]?.orgName || code, memberCount: allMembers.length, timeline };
}

/* ── GET member timeline ───────────────────────────────────────────────── */
app.get('/api/intelliq/member-timeline', requireAuth, async (req, res) => {
  const { memberId, memberName, refresh } = req.query;
  const g = _requireInsight(req, res); if (!g) return;
  const code = g.code;  // session org — never trust a query orgCode for analytics

  // SCOPE: the target member must be within the requester's visible subtree.
  // A leader can only pull the timeline of someone they actually lead.
  const targetId = memberId || _resolveUserIdByName(code, memberName || '');
  if (!targetId || !getVisibleUserIds(code, g.userId).includes(targetId)) {
    return res.status(403).json({ error: 'Member not in your scope' });
  }

  const cacheKey = `${code}:${memberId || memberName || ''}`;
  const cached  = memberTimelineCache[cacheKey];

  if (cached && refresh !== '1' && (Date.now() - cached.ts < TIMELINE_TTL)) {
    return res.json({ ...cached.data, cached: true });
  }

  // Resolve member name from userId if only id provided
  let resolvedName = memberName || '';
  if (memberId && !resolvedName) {
    const u = (orgUsers[code] || {})[memberId];
    resolvedName = u?.name || memberId;
  }

  try {
    const data = await _buildMemberTimeline(code, memberId || '', resolvedName);
    memberTimelineCache[cacheKey] = { data, ts: Date.now() };
    res.json(data);
  } catch(err) {
    res.status(500).json({ error: 'Timeline generation failed', detail: err.message });
  }
});

/* ── GET group timeline ────────────────────────────────────────────────── */
app.get('/api/intelliq/group-timeline', requireAuth, (req, res) => {
  const { groupId, refresh } = req.query;
  if (!groupId) return res.status(400).json({ error: 'groupId required' });
  const g = _requireInsight(req, res); if (!g) return;
  const code  = g.code;  // session org — never trust a query orgCode for analytics
  const cacheKey = `${code}:${groupId}`;
  const cached = groupTimelineCache[cacheKey];

  if (cached && refresh !== '1' && (Date.now() - cached.ts < TIMELINE_TTL)) {
    return res.json({ ...cached.data, cached: true });
  }

  const group = (orgGroups[code] || []).find(g => g.id === groupId);
  if (!group) return res.status(404).json({ error: 'Group not found' });

  const data = _buildGroupTimeline(code, group);
  groupTimelineCache[cacheKey] = { data, ts: Date.now() };
  res.json(data);
});

/* ── GET org timeline ──────────────────────────────────────────────────── */
app.get('/api/intelliq/org-timeline', requireAuth, (req, res) => {
  const { orgCode, refresh } = req.query;
  if (!orgCode) return res.status(400).json({ error: 'orgCode required' });
  const code   = orgCode.toLowerCase().trim();
  const cached = orgTimelineCache[code];

  if (cached && refresh !== '1' && (Date.now() - cached.ts < TIMELINE_TTL)) {
    return res.json({ ...cached.data, cached: true });
  }

  const data = _buildOrgTimeline(code);
  orgTimelineCache[code] = { data, ts: Date.now() };
  res.json(data);
});

/* ── POST create intervention ──────────────────────────────────────────── */
app.post('/api/intelliq/intervention', requireAuth, (req, res) => {
  const { orgCode, targetMember, targetMemberId, targetGroup, action, urgency, owner, reason, evidence } = req.body;
  if (!orgCode || !action) return res.status(400).json({ error: 'orgCode and action required' });
  const code = orgCode.toLowerCase().trim();

  if (!orgInterventions[code]) orgInterventions[code] = [];
  const intv = {
    id:             _intvId(),
    createdAt:      new Date().toISOString(),
    targetMember:   targetMember   || null,
    targetMemberId: targetMemberId || null,
    targetGroup:    targetGroup    || null,
    action,
    urgency:        urgency  || 'medium',
    owner:          owner    || 'coach',
    reason:         reason   || '',
    evidence:       evidence || [],
    status:         'suggested',
    acknowledgedAt: null,
    completedAt:    null,
    dismissedAt:    null,
    outcome:        null,
  };
  orgInterventions[code].push(intv);
  scheduleSave();
  res.json({ ok: true, intervention: intv });
});

/* ── PATCH update intervention status ──────────────────────────────────── */
app.patch('/api/intelliq/intervention/:id', requireAuth, (req, res) => {
  const { orgCode, status, outcomeNote } = req.body;
  if (!orgCode || !status) return res.status(400).json({ error: 'orgCode and status required' });
  const code        = orgCode.toLowerCase().trim();
  const interventions = orgInterventions[code] || [];
  const intv        = interventions.find(i => i.id === req.params.id);
  if (!intv) return res.status(404).json({ error: 'Intervention not found' });

  const VALID = ['suggested', 'acknowledged', 'completed', 'dismissed'];
  if (!VALID.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  intv.status = status;
  if (status === 'acknowledged' && !intv.acknowledgedAt) intv.acknowledgedAt = new Date().toISOString();
  if (status === 'completed'    && !intv.completedAt)    {
    intv.completedAt = new Date().toISOString();
    intv.outcome     = _measureInterventionOutcome(code, intv);
  }
  if (status === 'dismissed'    && !intv.dismissedAt)    intv.dismissedAt = new Date().toISOString();
  if (outcomeNote) intv.outcomeNote = outcomeNote;

  scheduleSave();
  res.json({ ok: true, intervention: intv });
});

/* ── GET interventions for org ─────────────────────────────────────────── */
app.get('/api/intelliq/interventions', requireAuth, (req, res) => {
  const { orgCode, status } = req.query;
  if (!orgCode) return res.status(400).json({ error: 'orgCode required' });
  const code = orgCode.toLowerCase().trim();
  let all = orgInterventions[code] || [];
  if (status) all = all.filter(i => i.status === status);
  // Return most recent first
  res.json({ interventions: [...all].reverse() });
});

/* ── GET intervention analysis + learning stats ─────────────────────────── */
app.get('/api/intelliq/intervention-analysis', requireAuth, (req, res) => {
  const g = _requireInsight(req, res); if (!g) return;
  const code = g.code;  // session org — never trust a query orgCode for analytics
  const all  = orgInterventions[code] || [];

  const byStatus = { suggested: 0, acknowledged: 0, completed: 0, dismissed: 0 };
  all.forEach(i => { if (byStatus[i.status] !== undefined) byStatus[i.status]++; });

  const measured  = all.filter(i => i.status === 'completed' && i.outcome?.status === 'measured');
  const outcomes  = { positive: 0, neutral: 0, negative: 0 };
  measured.forEach(i => { if (outcomes[i.outcome.outcome] !== undefined) outcomes[i.outcome.outcome]++; });

  // Learning stats by action type
  const actionStats = {};
  measured.forEach(i => {
    const type = _categorizeAction(i.action);
    if (!actionStats[type]) actionStats[type] = { total: 0, positive: 0, neutral: 0, negative: 0, moodDeltas: [] };
    actionStats[type].total++;
    actionStats[type][i.outcome.outcome]++;
    actionStats[type].moodDeltas.push(i.outcome.moodDelta);
  });
  const patterns = Object.entries(actionStats).map(([type, s]) => ({
    type,
    total:       s.total,
    successRate: Math.round(s.positive / s.total * 100),
    avgMoodDelta: s.moodDeltas.length ? Math.round((s.moodDeltas.reduce((a, b) => a + b, 0) / s.moodDeltas.length) * 10) / 10 : 0,
    outcomes:    { positive: s.positive, neutral: s.neutral, negative: s.negative },
  })).sort((a, b) => b.successRate - a.successRate);

  // Pending outcome checks — re-measure on request
  const pendingOutcomes = all.filter(i => i.status === 'completed' && i.outcome?.status === 'pending');
  pendingOutcomes.forEach(i => {
    const fresh = _measureInterventionOutcome(code, i);
    if (fresh && fresh.status !== 'pending') { i.outcome = fresh; scheduleSave(); }
  });

  res.json({
    total: all.length, byStatus, outcomes,
    patterns,
    successRate:    measured.length > 0 ? Math.round(outcomes.positive / measured.length * 100) : null,
    avgMoodDelta:   measured.length > 0 ? Math.round(measured.reduce((s, i) => s + (i.outcome.moodDelta || 0), 0) / measured.length * 10) / 10 : null,
    recent:         [...all].reverse().slice(0, 8),
    hasEnoughData:  measured.length >= 3,
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   INDIVIDUAL ADVISOR AI  (Phase 1)

   A leader selects a member and asks a question ("How do I motivate them?",
   "How do I improve accountability?"). The advisor reasons over everything
   IntelliQ knows about that person — but through the Privacy Gate (private
   may inform, never be revealed) and the requester's role Lens.

   Built on EXISTING data only — no schema migration. Profile-backed reasoning
   arrives in Phase 2 once the signals table exists.
   ═══════════════════════════════════════════════════════════════════════════ */

/* Build the two-tier advisor context for a member from current stores.
   Returns { citable[], privateInforming[], privateStrings[] } where
   privateStrings are raw spans the redaction pass must never let through. */
function _buildAdvisorContext(code, member, requesterUser) {
  const memberId   = member.id;
  const memberName = member.name || '';
  const keys       = [userKey(code, memberId), memberKey(code, memberName)];

  const citable          = [];
  const privateInforming = [];
  const privateStrings   = [];

  // ── Identity ──────────────────────────────────────────────────────────────
  citable.push(`Name: ${memberName}${member.role ? ` · role: ${member.role}` : ''}`);

  // ── Alignment anchors — the three frames the advisor reasons across ────────
  // These are STATED AIMS (not private). They are the references behaviour is
  // measured against; they are never a hierarchy.
  //  • Member aims  = the engine (intrinsic goals)
  //  • Team context = the shared middle (group emphasis / culture)
  //  • Org values   = the guardrails (ethical boundaries + identity)
  const goals = normalizeMemberGoals(_memberGoalsFor(code, member));
  if (goals.length) {
    citable.push(`MEMBER aim(s): ${goals.map(g => g.title || g.text).filter(Boolean).join('; ')}`);
  } else {
    citable.push('MEMBER aim(s): none stated yet — treat as UNANCHORED; the absence is itself the finding.');
  }
  (orgGroups[code] || [])
    .filter(g => (g.memberIds || []).includes(memberId) || (g.leadIds || []).includes(memberId))
    .forEach(g => citable.push(`TEAM context — ${g.name}${g.description ? `: ${g.description}` : ''}`));
  const _orgValues = orgValues[code] || [];
  if (_orgValues.length) citable.push(`ORG values (guardrails): ${_orgValues.join(', ')}`);
  const _orgGoals = orgGoals[code] || [];
  if (_orgGoals.length) citable.push(`ORG priorities: ${_orgGoals.map(g => g.text).filter(Boolean).slice(0, 4).join('; ')}`);

  // ── Check-ins: mood numbers citable, free text informs only ───────────────
  const checkins = [];
  const seen = new Set();
  keys.forEach(k => (memberCheckins[k] || []).forEach(c => {
    const ts = c.ts || c.date; if (!ts || seen.has(ts)) return; seen.add(ts);
    checkins.push({ mood: c.mood != null ? Number(c.mood) : null, text: (c.text || c.note || '').trim(), ts });
  }));
  checkins.sort((a, b) => new Date(b.ts) - new Date(a.ts));
  const moods = checkins.filter(c => c.mood !== null).map(c => c.mood);
  if (moods.length) {
    const recent = moods.slice(0, 10);
    const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
    citable.push(`Recent mood: ${Math.round(avg * 10) / 10}/5 across ${recent.length} check-in(s); ${checkins.length} total.`);
  } else {
    citable.push('No check-in mood data yet.');
  }
  checkins.slice(0, 6).forEach(c => {
    if (!c.text) return;
    privateInforming.push(`Check-in note: ${c.text}`);
    privateStrings.push(c.text);
  });

  // ── Weekly reflections: completion citable, text informs only ─────────────
  let weeklyCount = 0;
  Object.entries(weeklyAssessments).forEach(([key, entries]) => {
    if (!key.startsWith(code + ':')) return;
    (entries || []).forEach(e => {
      if (e.memberName !== memberName && e.memberId !== memberId) return;
      weeklyCount++;
      const text = Object.values(e.data || {}).filter(Boolean).join(' | ').trim();
      if (text) { privateInforming.push(`Weekly reflection: ${text.slice(0, 300)}`); privateStrings.push(text.slice(0, 300)); }
    });
  });
  if (weeklyCount) citable.push(`Completed ${weeklyCount} weekly reflection(s).`);

  // ── Assessment results: scores/strengths/development are citable ──────────
  const results = [];
  keys.forEach(k => (memberResults[k] || []).forEach(r => results.push(r)));
  if (results.length) {
    const last = results[results.length - 1]?.score || {};
    const bits = [];
    if (last.overall != null) bits.push(`latest overall ${last.overall}/100`);
    if (Array.isArray(last.strengths) && last.strengths.length) bits.push(`strengths: ${last.strengths.slice(0, 3).join(', ')}`);
    if (Array.isArray(last.development) && last.development.length) bits.push(`development areas: ${last.development.slice(0, 3).join(', ')}`);
    citable.push(`Assessments completed: ${results.length}${bits.length ? ` (${bits.join('; ')})` : ''}.`);
  }

  // ── Memory profile: behavioral observations inform reasoning ──────────────
  const mem = userAiProfiles[`${code}:${memberId}`];
  if (mem) {
    // Durable long-term memory (persists even after signals age out) — significant
    // facts/events. Sensitive ones inform reasoning only; non-sensitive are citable.
    (mem.keyMemory || []).forEach(k => {
      const line = `[strong] Remembered${k.firstSeen ? ` (since ${k.firstSeen})` : ''}: ${k.text}`;
      if (k.sensitive) { privateInforming.push(line); privateStrings.push(k.text); }
      else citable.push(line);
    });
    (mem.openThreads || []).filter(t => !t.resolved).slice(0, 5).forEach(t => {
      privateInforming.push(`Recurring observation${t.occurrences > 1 ? ` (×${t.occurrences})` : ''}: ${t.text}`);
      privateStrings.push(t.text);
    });
    (mem.priorFollowUps || []).filter(f => !f.resolved).slice(0, 3).forEach(f => {
      privateInforming.push(`Open follow-up: ${f.commitment}`);
    });
  }

  // ── Authored notes: private/restricted inform only; shared are citable ────
  Object.values(orgNotes)
    .filter(n => n.orgCode === code && n.authorId === memberId)
    .forEach(n => {
      const sens = n.sensitivity || privacy.classifyText(n.content, { type: n.type, tag: n.tag });
      if (privacy.isPrivate(sens)) {
        privateInforming.push(`Private note (${sens}): ${n.content.slice(0, 200)}`);
        privateStrings.push(n.content.slice(0, 200));
      } else {
        citable.push(`Shared note: ${n.content.slice(0, 160)}`);
      }
    });

  // ── Interventions targeting this member: coach actions are citable ────────
  (orgInterventions[code] || [])
    .filter(i => i.targetMember === memberName || i.targetMemberId === memberId)
    .slice(-5)
    .forEach(i => {
      const out = i.outcome?.outcome ? ` → ${i.outcome.outcome}` : '';
      citable.push(`Past action: ${i.action} [${i.status}]${out}`);
    });

  // ── Patterns + predictions from the aggregator (derived, citable) ─────────
  try {
    const agg = _aggregateOrgData(code);
    (agg.memberPatterns?.[memberName] || []).forEach(p => citable.push(`Pattern: ${p.label || p.type} (${p.confidence || 'n/a'} confidence)`));
    (agg.memberPredictions?.[memberName] || []).forEach(p => citable.push(`Trajectory: ${p.prediction}`));
  } catch (_) { /* aggregation is best-effort here */ }

  // ── Ingested signals — WEIGHTED so the AI doesn't treat noise like results ──
  // The universal input layer: public/normal = citable, sensitive = inform-only.
  // Effective weight = base(source) + repetition + recency, so repeated behaviour
  // and recent hard outcomes outrank one-off notes. Strong/medium are included;
  // weak one-offs are capped to keep reasoning signal-rich, not noisy.
  const sigs = _gatherSignals(code, 'member', memberId, 60);
  // "Repeated behaviour" means the MEMBER repeatedly did the same thing — so only
  // count signals the member generated themselves. How many times a coach logged
  // about them is coach activity, not member behaviour, and must not inflate weight.
  const ownSrcCount = {};
  sigs.forEach(s => { if (s.createdBy === memberId) ownSrcCount[s.source] = (ownSrcCount[s.source] || 0) + 1; });
  const nowTs = Date.now();
  const baseW = s => s.weightNum != null ? s.weightNum : _signalBaseWeight(s.source);
  // Effective weight drives ORDERING only (recurring + recent surface first)…
  const effective = s => {
    let w = baseW(s);
    if ((ownSrcCount[s.source] || 0) >= 3) w += 1;                   // member's own repeated behaviour
    if (nowTs - new Date(s.ts).getTime() < 14 * 86400000) w += 0.5;  // recent
    return w;
  };
  const ranked = sigs
    .map(s => ({ s, w: effective(s) }))
    .sort((a, b) => b.w - a.w || new Date(b.s.ts) - new Date(a.s.ts));

  let weakUsed = 0;
  ranked.forEach(({ s }) => {
    // …but the strength LABEL reflects the source's TRUE weight, so a soft note is
    // never dressed up as a hard outcome ([strong]) by recency/repetition alone.
    const tier = _weightTier(baseW(s));
    if (tier === 'weak' && weakUsed >= 3) return;                     // cap noise
    if (tier === 'weak') weakUsed++;
    const src   = SIGNAL_SOURCES[s.source]?.label || s.source;
    const valid = s.valueText || (s.valueNum != null ? `${s.label ? s.label + ': ' : ''}${s.valueNum}` : null)
                  || (s.data ? JSON.stringify(s.data).slice(0, 200) : null);
    if (!valid) return;
    const tag  = tier === 'strong' ? '[strong] ' : tier === 'weak' ? '[minor] ' : '';
    const line = `${tag}${src}${s.label && s.valueText ? ` (${s.label})` : ''}: ${valid}`;
    if (privacy.isPrivate(s.sensitivity)) {
      privateInforming.push(line);
      if (s.valueText) privateStrings.push(s.valueText.slice(0, 200));
    } else {
      citable.push(line);
    }
  });

  return { citable, privateInforming, privateStrings };
}

/* ═══════════════════════════════════════════════════════════════════════════
   BEHAVIORAL PROFILE — the AI's evolving understanding of a person
   Synthesised from the member's weighted evidence THROUGH the privacy gate, so
   the stored narrative is safe to show leaders (sensitive detail informs it but
   is never exposed). Cached on the member's memory record; rebuilt as evidence
   grows. Replaces keyword threads as the primary "understanding" the AI reasons
   from. Directional language, no scores.
   ═══════════════════════════════════════════════════════════════════════════ */
function _memberSignalCount(code, userId, name) {
  // Count DISTINCT check-ins across the id-key and the legacy name-key — a member
  // with entries under both (or where the two keys collide) must not be counted
  // twice, or the profile would look like it has more evidence than it does and
  // rebuild too eagerly.
  const seen = new Set();
  [userKey(code, userId), memberKey(code, name || '')].forEach(k =>
    (memberCheckins[k] || []).forEach(c => seen.add(c.ts || c.date || JSON.stringify(c))));
  return _gatherSignals(code, 'member', userId, 500).length + seen.size;
}

function _profileStale(profile, signalCount) {
  if (!profile) return true;
  if (Date.now() - new Date(profile.builtAt).getTime() > 12 * 60 * 60 * 1000) return true; // 12h
  if (signalCount - (profile.signalBasis || 0) >= 5) return true;                            // meaningful new evidence
  return false;
}

/* Merge newly-extracted durable memories into the persistent record (dedupe by
   keyword overlap), so significant facts survive even after signals age out. */
function _mergeKeyMemory(mem, items) {
  if (!Array.isArray(mem.keyMemory)) mem.keyMemory = [];
  const today = new Date().toISOString().split('T')[0];
  items.forEach(it => {
    const text = String(it.text || '').trim();
    if (!text) return;
    const words = new Set(text.toLowerCase().split(/\W+/).filter(w => w.length > 3));
    const dup = mem.keyMemory.find(k => {
      const kw = new Set(k.text.toLowerCase().split(/\W+/).filter(w => w.length > 3));
      if (!kw.size || !words.size) return false;
      // Treat as the SAME memory only on high overlap against the LARGER phrase.
      // Measuring against the larger set (not the new one) and at 0.7 keeps
      // distinct events that merely share common words apart — e.g. "father
      // passed away" vs "mother passed away" (2/3 = 0.67) stay as two memories
      // instead of the second silently overwriting the first.
      const shared = [...words].filter(w => kw.has(w)).length;
      return shared >= Math.ceil(Math.max(words.size, kw.size) * 0.7);
    });
    if (dup) { dup.lastSeen = today; return; }
    mem.keyMemory.push({
      id: 'km_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      text, kind: it.kind || 'fact',
      sensitive: !!it.sensitive,
      firstSeen: today, lastSeen: today,
    });
  });
  // Keep the record bounded — drop oldest non-sensitive first.
  if (mem.keyMemory.length > 40) {
    mem.keyMemory.sort((a, b) => (a.sensitive === b.sensitive ? a.lastSeen.localeCompare(b.lastSeen) : a.sensitive ? 1 : -1));
    mem.keyMemory = mem.keyMemory.slice(mem.keyMemory.length - 40);
  }
}

async function _buildBehavioralProfile(code, userId) {
  const member = orgUsers[code]?.[userId];
  if (!member) return null;
  const mem = _getMemory(code, userId);
  const ctx = _buildAdvisorContext(code, member, member);
  const signalCount = _memberSignalCount(code, userId, member.name);

  // Feed the durable record back in so the AI keeps continuity across rebuilds.
  const remembered = (mem.keyMemory || []).map(k => `- ${k.text}${k.sensitive ? ' (sensitive)' : ''}`).join('\n');

  const digest = [
    remembered ? 'ALREADY REMEMBERED (durable — keep and update):\n' + remembered + '\n' : '',
    'OBSERVABLE EVIDENCE:',
    ...ctx.citable,
    ctx.privateInforming.length ? '\nPRIVATE (informs only — never reveal):' : '',
    ...ctx.privateInforming,
  ].filter(Boolean).join('\n');

  const system = [
    `You are IntelliQ, maintaining a longitudinal understanding of one person for the leaders who support them. You (1) synthesise who they are behaviourally, (2) keep a durable memory of SIGNIFICANT facts and life events worth remembering long-term (e.g. a family bereavement, an injury, a big goal, a role change), and (3) note things worth checking up on. Safe, humane, evidence-based — not a data dump or a verdict.`,
    privacy.GATE_DIRECTIVE,
    `Weigh strong and repeated evidence over one-off notes ([strong] beats [minor]). Directional language, never scores.
For durable memory: capture the SIGNIFICANT and lasting (life events, circumstances, big goals, recurring struggles) — not routine activity. Mark anything personal or sensitive with "sensitive": true; phrase it with care and never in a way that exposes private detail if surfaced.
For follow-ups: things a leader should gently check on later, phrased safely (e.g. "a supportive check-in may help right now" — not the private reason).`,
    _worldviewDirective(code),
    _memberValuesDirective(code, userId),
  ].filter(Boolean).join('\n\n');

  const user = `PERSON: ${member.name}\n\n${digest}\n\nReturn ONLY JSON: {"narrative":"2-4 sentences: who they are behaviourally and where they're trending","tendencies":["how they tend to respond"],"motivators":["what drives/engages them"],"watchFor":["early signs worth watching"],"trajectory":"converging|sustaining|stalled|diverging|unanchored|unknown","remember":[{"text":"a significant durable fact/event worth keeping","kind":"event|circumstance|goal|struggle|fact","sensitive":true|false}],"followUps":[{"text":"a gentle, safely-phrased thing to check on later"}]}`;

  let out = null;
  try {
    out = await ai.completeJSON({ tier: 'reason', system, user, maxTokens: 800, schema: ['narrative'] });
  } catch (err) { console.warn('[profile] AI error:', err.message); }
  if (!out) return mem.profile || null;

  // Redact any verbatim private span that slipped through.
  const priv = ctx.privateStrings || [];
  const clean = s => typeof s === 'string' ? privacy.redact(s, priv) : s;

  // Accumulate durable memory (persists across rebuilds).
  if (Array.isArray(out.remember)) {
    _mergeKeyMemory(mem, out.remember.map(r => ({ ...r, text: clean(r.text || '') })).filter(r => r.text));
  }

  // Trajectory hysteresis — the label rebuilds every 12h and the model can wobble
  // between converging/sustaining/stalled on the same evidence. Hold the prior
  // label unless real new evidence accrued since the last build, and never let a
  // real label regress to "unknown" on noise. A leader should see the direction
  // change because the person changed, not because the model re-rolled.
  const prevTraj  = mem.profile?.trajectory;
  const prevBasis = mem.profile?.signalBasis || 0;
  let trajectory  = out.trajectory || 'unknown';
  if (prevTraj && prevTraj !== 'unknown') {
    if (trajectory === 'unknown') {
      trajectory = prevTraj;                                        // don't regress on a noisy rebuild
    } else if (trajectory !== prevTraj && (signalCount - prevBasis) < 3) {
      trajectory = prevTraj;                                        // hold unless the evidence really moved
    }
  }

  mem.profile = {
    narrative:  clean(out.narrative || ''),
    tendencies: Array.isArray(out.tendencies) ? out.tendencies.map(clean).slice(0, 6) : [],
    motivators: Array.isArray(out.motivators) ? out.motivators.map(clean).slice(0, 6) : [],
    watchFor:   Array.isArray(out.watchFor)   ? out.watchFor.map(clean).slice(0, 6)   : [],
    trajectory,
    followUps:  Array.isArray(out.followUps)  ? out.followUps.map(f => clean(f.text || f)).filter(Boolean).slice(0, 4) : [],
    builtAt:    new Date().toISOString(),
    signalBasis: signalCount,
  };
  scheduleSave();

  // Cross-member vector (optional — gated on embeddings + pgvector). Fire-and-
  // forget so it never blocks or breaks the profile response.
  if (embeddings.enabled() && db.vectorsReady()) {
    const summary = [mem.profile.narrative, ...(mem.profile.tendencies || []), ...(mem.profile.motivators || [])].filter(Boolean).join('. ');
    embeddings.embed(summary)
      .then(vec => vec && db.upsertMemberVector(code, userId, vec, summary))
      .catch(e => console.warn('[profile] vector upsert failed:', e.message));
  }

  return mem.profile;
}

async function _getBehavioralProfile(code, userId, force) {
  const member = orgUsers[code]?.[userId];
  if (!member) return null;
  const mem = _getMemory(code, userId);
  const signalCount = _memberSignalCount(code, userId, member.name);
  if (force || _profileStale(mem.profile, signalCount)) {
    return await _buildBehavioralProfile(code, userId);
  }
  return mem.profile;
}

/* ── GET /api/member/:memberId/profile — the behavioral understanding ──────── */
app.get('/api/member/:memberId/profile', requireAuth, async (req, res) => {
  const { orgCode, userId } = req.iqSession;
  const code = (orgCode || '').toLowerCase().trim();
  const memberId = req.params.memberId;
  if (!getVisibleUserIds(code, userId).includes(memberId)) return res.status(403).json({ error: 'Member not in your visible scope' });
  if (!(_userHasPerm(code, userId, 'view_insights') || _userHasPerm(code, userId, 'review_checkins') || orgUsers[code]?.[userId]?.role === 'superadmin')) {
    return res.status(403).json({ error: 'Permission denied: view_insights required' });
  }
  try {
    const profile = await _getBehavioralProfile(code, memberId, req.query.refresh === '1');
    const mem = userAiProfiles[`${code}:${memberId}`] || {};
    const km  = mem.keyMemory || [];
    // Durable memory: non-sensitive facts are shown; sensitive personal matters
    // are acknowledged (count) but their detail is never exposed to the leader.
    res.json({
      ok: true,
      profile: profile || null,
      remembered: km.filter(k => !k.sensitive).map(k => ({ text: k.text, since: k.firstSeen, kind: k.kind })),
      privateMatters: km.filter(k => k.sensitive).length,
    });
  } catch (err) {
    console.error('[profile] error:', err.message);
    res.status(502).json({ error: 'Could not build the profile right now.' });
  }
});

/* ── GET /api/member/:memberId/similar — cross-member intelligence (v1) ────────
   "Members on a similar path, and what's helped them." Finds a cohort sharing
   this member's risk patterns/trajectory, then aggregates which interventions
   had positive outcomes for that cohort (falls back to org-wide when the cohort
   has little intervention history). ANONYMOUS — never names other members.
   This is the flywheel first slice; embeddings/Postgres are the scale upgrade. */
app.get('/api/member/:memberId/similar', requireAuth, async (req, res) => {
  const { orgCode, userId } = req.iqSession;
  const code = (orgCode || '').toLowerCase().trim();
  const memberId = req.params.memberId;
  if (!getVisibleUserIds(code, userId).includes(memberId)) return res.status(403).json({ error: 'Member not in your visible scope' });
  if (!(_userHasPerm(code, userId, 'view_insights') || orgUsers[code]?.[userId]?.role === 'superadmin')) {
    return res.status(403).json({ error: 'Permission denied' });
  }
  const member = orgUsers[code]?.[memberId];
  if (!member) return res.status(404).json({ error: 'Member not found' });

  // Vector cohort (nearest neighbours) when pgvector + embeddings are live;
  // otherwise rule-based pattern overlap below. Both stay anonymous.
  let vectorCohort = null;
  if (embeddings.enabled() && db.vectorsReady()) {
    try {
      const rows = await db.nearestMembers(code, memberId, 8);
      const names = rows.map(r => orgUsers[code]?.[r.user_id]?.name).filter(Boolean);
      if (names.length) vectorCohort = { set: new Set(names), method: 'embedding' };
    } catch (e) { console.warn('[similar] vector query failed:', e.message); }
  }

  let agg; try { agg = _aggregateOrgData(code); } catch (_) { agg = { memberPatterns: {}, memberPredictions: {} }; }
  const myPatterns = new Set((agg.memberPatterns?.[member.name] || []).map(p => p.type));
  const myTraj     = (agg.memberPredictions?.[member.name] || []).length > 0;

  // Cohort: nearest-neighbour (embeddings) when available, else members sharing a
  // risk pattern / declining trajectory. Names only scope the intervention
  // lookup — never returned. Anonymous either way.
  const sharedPatterns = new Set();
  let cohort, method;
  if (vectorCohort) {
    cohort = vectorCohort.set;
    method = 'embedding';
  } else {
    cohort = new Set();
    method = 'pattern';
    Object.entries(agg.memberPatterns || {}).forEach(([name, pats]) => {
      if (name === member.name) return;
      const shared = pats.map(p => p.type).filter(t => myPatterns.has(t));
      if (shared.length) { cohort.add(name); shared.forEach(t => sharedPatterns.add(t)); }
    });
    if (myTraj) Object.entries(agg.memberPredictions || {}).forEach(([name, preds]) => {
      if (name !== member.name && preds.length) cohort.add(name);
    });
  }

  // What has helped: measured, positive interventions — cohort-scoped if we have
  // enough, else org-wide. Aggregate by action type. Anonymous.
  const measured = (orgInterventions[code] || []).filter(i => i.status === 'completed' && i.outcome?.status === 'measured');
  const tally = list => {
    const by = {};
    list.forEach(i => { const t = _categorizeAction(i.action); by[t] = by[t] || { positive: 0, total: 0 }; by[t].total++; if (i.outcome.outcome === 'positive') by[t].positive++; });
    return Object.entries(by).map(([type, s]) => ({ type, positive: s.positive, total: s.total })).sort((a, b) => b.positive - a.positive);
  };
  // A cohort of one is not a cohort — and its "shared pattern" could point a
  // leader straight at a single identifiable person, breaking the anonymity
  // promise. Require at least MIN_COHORT before framing anything around it.
  const MIN_COHORT = 2;
  // Never present a single outcome (1/1) as if it were evidence — require a
  // minimum sample before a "what helped" type is shown as guidance.
  const MIN_SAMPLE = 2;
  const cohortValid = cohort.size >= MIN_COHORT;

  const cohortIntns = cohortValid ? measured.filter(i => cohort.has(i.targetMember)) : [];
  let whatWorked = tally(cohortIntns).filter(w => w.total >= MIN_SAMPLE);
  let scope = 'cohort';
  if (whatWorked.length === 0) { whatWorked = tally(measured).filter(w => w.total >= MIN_SAMPLE); scope = 'org'; }
  const lowConfidence = whatWorked.length > 0 && whatWorked[0].total < 3;

  res.json({
    ok: true,
    cohortSize: cohortValid ? cohort.size : 0,
    sharedPatterns: cohortValid ? [...sharedPatterns] : [],
    whatWorked: whatWorked.slice(0, 4),
    scope,
    method,
    lowConfidence,
    hasData: whatWorked.length > 0,
  });
});

const ADVISOR_SYSTEM = `You are the IntelliQ Individual Advisor — embedded in ONE member's profile to help a leader support, develop, and lead THIS specific person. You are not a score machine. You never rank people and never output a number as a verdict.

HOW YOU THINK — ALIGNMENT, NOT OBEDIENCE:
Alignment is the coherence between what this person actually does over time and what they — and the communities they belong to — say they are trying to become. It is directional (are they becoming it?), never a fixed grade, and never "doing what the coach says." You reason across three frames, which are NOT a hierarchy:
- MEMBER aims  = the engine (their own goals; intrinsic motivation is what actually drives durable growth).
- TEAM context = the shared middle (group emphasis and culture).
- ORG values   = the guardrails (ethical boundaries and identity).
Optimize for: the member's own goals, pursued within org guardrails, integrated with team context.

DIRECTIONAL LANGUAGE — NEVER SCORES:
Describe trajectory with words, not numbers: converging, sustaining, stalled, diverging, unanchored (no stated aim yet), or unknown (not enough signal). Never say "62% aligned" or assign a grade.

WEIGH THE EVIDENCE:
Not all signals are equal. Lean on [strong] signals (results, metrics, attendance, repeated behaviour, long-term trends) and converging patterns across several signals. Treat [minor] one-offs (a single note/message) lightly — never build a judgement on one of them. A pattern across signals beats any single data point.

CONFLICT DOCTRINE:
- MEMBER aim vs TEAM aim → seek INTEGRATION first: show how pursuing the team's aim also serves the member's own goal. If they genuinely conflict, name the honest tradeoff for the humans to decide — do not coerce toward the team.
- TEAM vs ORG values → the org value is the guardrail and should win, but treat it as a culture issue for leadership, never as a mark against this individual.
- Anchored to NOTHING → highest care, not the worst grade. Lead with curiosity; most often we simply never captured what they want.
- Aligned across all three → reinforce and stretch (leadership / mentoring opportunities).

OUTPUT RULES:
- Be specific to this person. No platitudes, no generic coaching advice.
- Recommend actions the requester can take, not descriptions of the data.
- Reason from your understanding of the person; do not recite or quote source material.
- If a stated aim is missing, say so plainly — that absence is the finding, not a failure.`;

/* ── POST /api/advisor/:memberId/ask ──────────────────────────────────────── */
app.post('/api/advisor/:memberId/ask', requireAuth, async (req, res) => {
  const { orgCode } = req.iqSession;
  const requesterId = req.iqSession.userId;
  const code        = (orgCode || '').toLowerCase().trim();
  const memberId    = req.params.memberId;
  const question    = (req.body?.question || '').trim();
  const mode        = req.body?.mode === 'briefing' ? 'briefing' : 'question';

  // In briefing mode the question is optional (we generate a full briefing).
  if (mode !== 'briefing' && !question) return res.status(400).json({ error: 'question required' });
  if (question.length > 600) return res.status(400).json({ error: 'question too long' });

  const requester = orgUsers[code]?.[requesterId];
  const member    = orgUsers[code]?.[memberId];
  if (!requester) return res.status(401).json({ error: 'Requester not found' });
  if (!member)    return res.status(404).json({ error: 'Member not found' });

  // Permission: must be able to see this member AND have an insight permission.
  const visible = getVisibleUserIds(code, requesterId);
  if (!visible.includes(memberId)) return res.status(403).json({ error: 'Member not in your visible scope' });
  const canAdvise = requester.role === 'superadmin'
    || _userHasPerm(code, requesterId, 'view_insights')
    || _userHasPerm(code, requesterId, 'review_checkins');
  if (!canAdvise) return res.status(403).json({ error: 'Permission denied: view_insights required' });

  // Build privacy-tiered context + role lens.
  const ctx  = _buildAdvisorContext(code, member, requester);
  const lens = lenses.lensFor(requester);

  // Lead with the synthesised behavioral understanding (cached — no extra call).
  const _prof = _getMemory(code, memberId).profile;
  if (_prof?.narrative) ctx.citable.unshift(`[strong] Behavioral understanding: ${_prof.narrative}`);

  const system = [
    ADVISOR_SYSTEM,
    privacy.GATE_DIRECTIVE,
    lenses.lensDirective(lens),
    _worldviewDirective(code),
    _memberValuesDirective(code, memberId),
  ].filter(Boolean).join('\n\n');

  const contextBlock = privacy.buildContextBlock({ citable: ctx.citable, privateInforming: ctx.privateInforming });

  const userMsg = mode === 'briefing'
    ? [
        `Produce an alignment briefing on ${member.name || 'this member'} for a ${lens?.label || requester.role}.`,
        '',
        contextBlock,
        '',
        'Write the briefing under these four short headings, a sentence or two each:',
        '1. What we are seeing',
        '2. Why it might be happening',
        '3. How this aligns (member aims · team context · org values) — use directional words, no scores',
        '4. What to try next',
      ].join('\n')
    : [
        `QUESTION (from a ${lens?.label || requester.role}): ${question}`,
        '',
        contextBlock,
        '',
        'Answer in 3-5 sentences with specific, actionable guidance for this person, reasoning across their member/team/org aims where relevant. Use directional language, never scores.',
      ].join('\n');

  let answer;
  try {
    answer = await ai.complete({ tier: 'reason', system, user: userMsg, maxTokens: mode === 'briefing' ? 600 : 400 });
  } catch (err) {
    console.error('[advisor] AI error:', err.message);
    return res.status(502).json({ error: 'Advisor unavailable right now. Please try again.' });
  }

  // Last-line privacy defence.
  answer = privacy.redact(answer, ctx.privateStrings);

  // Persist the thread (non-sensitive: question + safe answer only).
  if (!advisorThreads[code]) advisorThreads[code] = [];
  const thread = {
    id:            `adv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    memberId, memberName: member.name || '',
    requesterId, requesterRole: requester.role,
    lens:          lens?.label || null,
    mode,
    question:      mode === 'briefing' ? 'Full alignment briefing' : question,
    answer,
    createdAt:     new Date().toISOString(),
  };
  advisorThreads[code].push(thread);
  scheduleSave();

  res.json({
    ok: true,
    answer,
    mode,
    lens: lens?.label || null,
    evidenceCount: ctx.citable.length,
    threadId: thread.id,
  });
});

/* ── GET /api/advisor/:memberId/threads — prior advisor Q&A for a member ───── */
app.get('/api/advisor/:memberId/threads', requireAuth, (req, res) => {
  const { orgCode, userId } = req.iqSession;
  const code     = (orgCode || '').toLowerCase().trim();
  const memberId = req.params.memberId;

  const visible = getVisibleUserIds(code, userId);
  if (!visible.includes(memberId)) return res.status(403).json({ error: 'Member not in your visible scope' });

  const threads = (advisorThreads[code] || [])
    .filter(t => t.memberId === memberId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 30);
  res.json({ threads });
});

/* ── GET /api/signals/sources — the input source registry ──────────────────── */
app.get('/api/signals/sources', requireAuth, (req, res) => {
  res.json({ sources: SIGNAL_SOURCES });
});

/* ── POST /api/signals/ingest — universal input endpoint ──────────────────────
   Accepts one signal or { signals: [...] }. Any modality (text/number/voice
   transcript/sheet row/event/external feed). Scoped: you may attach a signal to
   yourself, or to a member/group you can see/lead. Sensitivity auto-classified. */
app.post('/api/signals/ingest', requireAuth, (req, res) => {
  const { orgCode, userId } = req.iqSession;
  const code  = orgCode;
  const batch = Array.isArray(req.body?.signals) ? req.body.signals : [req.body];

  const visible = new Set(getVisibleUserIds(code, userId));
  const canAttach = (s) => {
    if (s.subjectType === 'org') return _userHasPerm(code, userId, 'view_team') || orgUsers[code]?.[userId]?.role === 'superadmin';
    if (s.subjectType === 'group') {
      const g = (orgGroups[code] || []).find(x => x.id === s.subjectId);
      return !!g && ((g.leadIds || []).includes(userId) || orgUsers[code]?.[userId]?.role === 'superadmin');
    }
    // member: self, or a member you can see
    return s.subjectId === userId || visible.has(s.subjectId);
  };

  const stored = [];
  for (const raw of batch) {
    if (!raw || !raw.source) continue;
    if (raw.subjectId && !canAttach(raw)) continue; // silently skip out-of-scope
    const sig = _ingestSignal(code, raw, userId);
    if (sig) stored.push({ id: sig.id, source: sig.source, modality: sig.modality, subjectId: sig.subjectId });
  }
  if (!stored.length) return res.status(400).json({ error: 'No valid in-scope signals to ingest.' });
  scheduleSave();
  res.json({ ok: true, ingested: stored.length, signals: stored });
});

/* ── GET /api/signals — query signals for a subject you can see ──────────────── */
app.get('/api/signals', requireAuth, (req, res) => {
  const { orgCode, userId } = req.iqSession;
  const code = orgCode;
  const { subjectType = 'member', subjectId } = req.query;

  if (subjectType === 'member' && subjectId && subjectId !== userId) {
    if (!getVisibleUserIds(code, userId).includes(subjectId)) {
      return res.status(403).json({ error: 'Subject not in your visible scope' });
    }
  }
  // Raw sensitive/restricted text is only returned to leaders/admins; members
  // get their own. Public + normal always returned.
  const isLeaderOrAdmin = _userHasPerm(code, userId, 'view_insights') || orgUsers[code]?.[userId]?.role === 'superadmin';
  const signals = _gatherSignals(code, subjectType, subjectId, 100).map(s => {
    if (privacy.isPrivate(s.sensitivity) && !isLeaderOrAdmin && s.subjectId !== userId) {
      return { ...s, valueText: null, data: null, redacted: true };
    }
    return s;
  });
  res.json({ signals });
});

/* ── GET /api/signals/recent — transparency list of what the AI can use ────────
   Recent signals across the requester's scope (members they see + groups they
   lead + org + things they logged). Powers the Data Sources "what's feeding the
   AI" view. Enriched with subject + source labels; sensitive text summarised. */
app.get('/api/signals/recent', requireAuth, (req, res) => {
  const { orgCode, userId } = req.iqSession;
  const code    = orgCode;
  const visible = new Set(getVisibleUserIds(code, userId));
  const ledGroupIds = new Set((orgGroups[code] || []).filter(g => (g.leadIds || []).includes(userId)).map(g => g.id));

  const inScope = s =>
    s.createdBy === userId ||
    (s.subjectType === 'org') ||
    (s.subjectType === 'member' && s.subjectId && visible.has(s.subjectId)) ||
    (s.subjectType === 'group'  && ledGroupIds.has(s.subjectId));

  const subjectName = s => {
    if (s.subjectType === 'org') return 'Organization';
    if (s.subjectType === 'group') return (orgGroups[code] || []).find(g => g.id === s.subjectId)?.name || 'Group';
    return orgUsers[code]?.[s.subjectId]?.name || 'Member';
  };

  const list = (orgSignals[code] || [])
    .filter(inScope)
    .sort((a, b) => new Date(b.ts) - new Date(a.ts))
    .slice(0, 60)
    .map(s => ({
      id: s.id, ts: s.ts, source: s.source,
      sourceLabel: SIGNAL_SOURCES[s.source]?.label || s.source,
      modality: s.modality, sensitivity: s.sensitivity, public: s.public,
      weight: s.weight || _weightTier(s.weightNum != null ? s.weightNum : _signalBaseWeight(s.source)),
      subjectType: s.subjectType, subject: subjectName(s),
      label: s.label,
      snippet: privacy.isPrivate(s.sensitivity)
        ? '(private — informs the AI, not shown)'
        : (s.valueText ? s.valueText.slice(0, 100) : (s.valueNum != null ? String(s.valueNum) : (s.label || s.sourceLabel))),
    }));

  res.json({ signals: list });
});

/* ── Match an extracted name to a visible member's userId (fuzzy, safe) ──────── */
function _matchMember(code, candidates, name) {
  if (!name) return null;
  const n = String(name).toLowerCase().trim();
  // exact full-name, then "contains", then first-name match
  let hit = candidates.find(c => c.name === n);
  if (!hit) hit = candidates.find(c => c.name.includes(n) || n.includes(c.name));
  if (!hit) hit = candidates.find(c => c.first && (c.first === n || n.startsWith(c.first + ' ') || n.endsWith(' ' + c.first)));
  return hit ? hit.id : null;
}

/* Attribute AI-extracted per-member data and ingest as signals (scope-safe). */
function _attributeMembers(code, userId, members, roster, fileName, isPublic) {
  const matched = [], unmatched = [];
  let imported = 0;
  (Array.isArray(members) ? members : []).slice(0, 60).forEach(m => {
    const mid = _matchMember(code, roster, m.name);
    if (!mid) { if (m.name) unmatched.push(m.name); return; }
    let count = 0;
    (Array.isArray(m.metrics) ? m.metrics : []).slice(0, 30).forEach(mt => {
      if (!mt || (mt.label == null && mt.value == null)) return;
      const num = Number(mt.value);
      const sig = _ingestSignal(code, {
        subjectType: 'member', subjectId: mid, source: 'sheet',
        modality: isNaN(num) ? 'text' : 'number',
        label: mt.label != null ? String(mt.label) : null,
        valueNum: isNaN(num) ? null : num,
        valueText: isNaN(num) ? (mt.value != null ? String(mt.value) : null) : null,
        public: isPublic,
      }, userId);
      if (sig) { count++; imported++; }
    });
    if (m.note && String(m.note).trim()) {
      const sig = _ingestSignal(code, {
        subjectType: 'member', subjectId: mid, source: 'document',
        modality: 'text', label: fileName, valueText: String(m.note), public: isPublic,
      }, userId);
      if (sig) { count++; imported++; }
    }
    if (count) matched.push({ name: orgUsers[code]?.[mid]?.name || m.name, signals: count });
  });
  if (imported) scheduleSave();
  return { imported, matched, unmatched };
}

const _IMPORT_SCHEMA_HINT = 'Return ONLY JSON: {"members":[{"name":"<roster name>","metrics":[{"label":"e.g. Squat 1RM","value":"number or short text"}],"note":"<concise factual summary of anything else about this person, else empty>"}]}';
const _IMPORT_SYSTEM = `You extract structured, per-person data from a document, spreadsheet, or an IMAGE/scan of one, for a performance organisation. Attribute data ONLY to people in the provided roster — ignore anyone not on it. Read tables/columns carefully. Be faithful to the source; do not invent numbers.`;

/* ── POST /api/signals/import — SMART import (text OR image/PDF via vision) ────
   Accepts { content } (extracted text) OR { media:{kind:'image'|'pdf', mediaType,
   data(base64)} } for scanned stat sheets. The AI maps rows/mentions to the
   requester's VISIBLE roster and files metrics + notes under the right member. */
app.post('/api/signals/import', requireAuth, async (req, res) => {
  const { orgCode, userId } = req.iqSession;
  const code     = orgCode;
  const fileName = String(req.body?.fileName || 'upload').slice(0, 120);
  const isPublic = !!req.body?.public;
  const content  = String(req.body?.content || '').slice(0, 8000);
  const media    = req.body?.media; // { kind:'image'|'pdf', mediaType, data }

  if (!content.trim() && !(media && media.data)) {
    return res.status(400).json({ error: 'No content to import.' });
  }

  const roster = getVisibleUserIds(code, userId)
    .map(id => orgUsers[code]?.[id]).filter(u => u && u.role !== 'superadmin')
    .map(u => ({ id: u.id, name: (u.name || '').toLowerCase().trim(), first: (u.firstName || (u.name || '').split(' ')[0] || '').toLowerCase().trim() }));
  if (!roster.length) return res.status(400).json({ error: 'No members in your scope to attribute data to.' });

  const rosterList = roster.map(r => r.name).join(', ');
  const promptText = `ROSTER (only attribute to these names): ${rosterList}\n\nFILE: ${fileName}\n\n${_IMPORT_SCHEMA_HINT}`;

  // Build messages: a vision block for image/PDF, else plain text content.
  let messages;
  if (media && media.data) {
    const block = media.kind === 'pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: media.data } }
      : { type: 'image',    source: { type: 'base64', media_type: media.mediaType || 'image/jpeg', data: media.data } };
    messages = [{ role: 'user', content: [ block, { type: 'text', text: promptText + '\n\nExtract the per-member data from the attached file.' } ] }];
  } else {
    messages = [{ role: 'user', content: `${promptText}\n\nCONTENT:\n${content}` }];
  }

  let parsed = null;
  try {
    parsed = await ai.completeJSON({ tier: 'reason', system: `${_IMPORT_SYSTEM}\n\n${privacy.GATE_DIRECTIVE}`, messages, maxTokens: 1100, schema: ['members'] });
  } catch (err) {
    console.warn('[signals/import] AI error:', err.message);
    return res.status(502).json({ error: 'Import analysis failed. Try again.' });
  }
  if (!parsed || !Array.isArray(parsed.members)) {
    return res.json({ ok: true, imported: 0, matched: [], unmatched: [], note: 'No per-member data found in this file.' });
  }

  res.json({ ok: true, ..._attributeMembers(code, userId, parsed.members, roster, fileName, isPublic) });
});

/* ═══════════════════════════════════════════════════════════════════════════
   LEARNING ENGINE — Patterns, Predictions, Effectiveness, Summary
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── GET /api/intelliq/patterns — rule-based risk patterns for org ────────── */
app.get('/api/intelliq/patterns', requireAuth, (req, res) => {
  const g = _requireInsight(req, res); if (!g) return;
  const code = g.code;  // session org — never trust a query orgCode for analytics
  const agg  = _aggregateOrgData(code);

  const flat = [];
  Object.entries(agg.memberPatterns || {}).forEach(([name, pats]) => {
    pats.forEach(p => flat.push({ member: name, ...p }));
  });

  const summary = {
    totalMembers:    agg.memberCount,
    membersAtRisk:   new Set(flat.map(p => p.member)).size,
    patternCounts:   flat.reduce((acc, p) => { acc[p.type] = (acc[p.type] || 0) + 1; return acc; }, {}),
    highConfidence:  flat.filter(p => p.confidence === 'high').length,
    patterns:        flat,
  };
  res.json(summary);
});

/* ── GET /api/intelliq/predictions — trajectory predictions ──────────────── */
app.get('/api/intelliq/predictions', requireAuth, (req, res) => {
  const g = _requireInsight(req, res); if (!g) return;
  const code = g.code;  // session org — never trust a query orgCode for analytics
  const agg  = _aggregateOrgData(code);

  const flat = [];
  Object.entries(agg.memberPredictions || {}).forEach(([name, preds]) => {
    preds.forEach(p => flat.push({ member: name, ...p }));
  });

  const high   = flat.filter(p => p.urgency === 'high');
  const medium = flat.filter(p => p.urgency === 'medium');

  res.json({
    totalPredictions: flat.length,
    highUrgency:      high.length,
    mediumUrgency:    medium.length,
    predictions:      flat.sort((a, b) => (a.urgency === 'high' ? -1 : 1)),
    generatedAt:      new Date().toISOString(),
  });
});

/* ── GET /api/intelliq/intervention-effectiveness — per-type breakdown ────── */
app.get('/api/intelliq/intervention-effectiveness', requireAuth, (req, res) => {
  const g = _requireInsight(req, res); if (!g) return;
  const code = g.code;  // session org — never trust a query orgCode for analytics
  const all  = orgInterventions[code] || [];

  const measured = all.filter(i => i.status === 'completed' && i.outcome?.status === 'measured');

  const byType = {};
  measured.forEach(i => {
    const type = _categorizeAction(i.action);
    if (!byType[type]) byType[type] = { total: 0, positive: 0, neutral: 0, negative: 0, moodDeltas: [], engDeltas: [] };
    byType[type].total++;
    byType[type][i.outcome.outcome]++;
    if (i.outcome.moodDelta != null) byType[type].moodDeltas.push(i.outcome.moodDelta);
    const engChange = (i.outcome.changesDetected || []).find(c => c.dimension === 'engagement');
    if (engChange) byType[type].engDeltas.push(engChange.delta || 0);
  });

  const effectiveness = Object.entries(byType).map(([type, s]) => ({
    type,
    total:              s.total,
    successRate:        Math.round(s.positive / s.total * 100),
    avgMoodDelta:       s.moodDeltas.length ? Math.round((s.moodDeltas.reduce((a, b) => a + b, 0) / s.moodDeltas.length) * 10) / 10 : null,
    avgEngagementDelta: s.engDeltas.length  ? Math.round((s.engDeltas.reduce((a, b) => a + b, 0)  / s.engDeltas.length)  * 10) / 10 : null,
    outcomes:           { positive: s.positive, neutral: s.neutral, negative: s.negative },
    verdict:            s.positive / s.total >= 0.6 ? 'effective' : s.positive / s.total >= 0.4 ? 'mixed' : 'low-impact',
  })).sort((a, b) => b.successRate - a.successRate);

  res.json({
    totalMeasured: measured.length,
    byType:        effectiveness,
    mostEffective: effectiveness[0] || null,
    hasEnoughData: measured.length >= 3,
  });
});

/* ── Learning-summary cache ───────────────────────────────────────────────── */
const learningSummaryCache = {}; // orgCode → { data, generatedAt }
const LEARNING_CACHE_TTL   = 2 * 60 * 60 * 1000; // 2 hours

/* ── GET /api/intelliq/learning-summary — org-level learning narrative ───── */
app.get('/api/intelliq/learning-summary', requireAuth, async (req, res) => {
  const { refresh } = req.query;
  const g = _requireInsight(req, res); if (!g) return;
  const code   = g.code;  // session org — never trust a query orgCode for analytics
  const cached = learningSummaryCache[code];
  if (cached && refresh !== '1' && Date.now() - cached.generatedAt < LEARNING_CACHE_TTL) {
    return res.json({ ...cached.data, cached: true });
  }

  const agg  = _aggregateOrgData(code);
  const all  = orgInterventions[code] || [];

  // ── Intervention stats ─────────────────────────────────────────────────
  const measured = all.filter(i => i.status === 'completed' && i.outcome?.status === 'measured');
  const positive = measured.filter(i => i.outcome.outcome === 'positive').length;
  const intStats = {
    total:           all.length,
    completed:       all.filter(i => i.status === 'completed').length,
    measured:        measured.length,
    successRate:     measured.length > 0 ? Math.round(positive / measured.length * 100) : null,
    byType:          {},
  };
  measured.forEach(i => {
    const t = _categorizeAction(i.action);
    if (!intStats.byType[t]) intStats.byType[t] = { total: 0, positive: 0 };
    intStats.byType[t].total++;
    if (i.outcome.outcome === 'positive') intStats.byType[t].positive++;
  });

  // ── Pattern frequency ──────────────────────────────────────────────────
  const allPatterns = Object.values(agg.memberPatterns || {}).flat();
  const patternFreq = allPatterns.reduce((acc, p) => { acc[p.label] = (acc[p.label] || 0) + 1; return acc; }, {});

  // ── Monthly mood trend (last 3 months) ────────────────────────────────
  const monthlyMood = [0, 1, 2].map(n => {
    const from = Date.now() - (n + 1) * 30 * 24 * 60 * 60 * 1000;
    const to   = Date.now() - n * 30 * 24 * 60 * 60 * 1000;
    const mc   = agg.allCheckins.filter(c => c.time >= from && c.time < to);
    return { month: n === 0 ? 'current' : n === 1 ? '1 month ago' : '2 months ago', avgMood: _avgMood(mc), checkins: mc.length };
  });

  // ── Build learning data block for Claude ──────────────────────────────
  const byTypeLines = Object.entries(intStats.byType).map(([t, s]) =>
    `${t}: ${s.total} completed, ${Math.round(s.positive / s.total * 100)}% positive`
  ).join(', ');
  const patternLines = Object.entries(patternFreq).map(([l, c]) => `${l}: ${c} member(s)`).join(', ');
  const moodLine = monthlyMood.map(m => `${m.month}: ${m.avgMood ?? 'no data'}/5 (${m.checkins} check-ins)`).join(' | ');
  const predCount = Object.values(agg.memberPredictions || {}).flat().length;

  const learningBrief = [
    `ORG: ${agg.meta.orgName || code} (${agg.meta.orgMode || 'general'}) — ${agg.memberCount} members`,
    `INTERVENTION HISTORY: ${intStats.total} tracked, ${intStats.completed} completed, ${intStats.measured} measured.`,
    intStats.successRate !== null ? `Overall success rate: ${intStats.successRate}%.` : 'Not enough measured outcomes yet.',
    byTypeLines ? `By action type: ${byTypeLines}.` : '',
    patternLines ? `Current risk patterns: ${patternLines}.` : 'No current risk patterns detected.',
    `Monthly mood: ${moodLine}.`,
    predCount > 0 ? `Active trajectory predictions: ${predCount} members showing declining trends.` : '',
    `Org mood this week: ${agg.moodLast7 ?? 'no data'}/5 | Last 30d: ${agg.moodLast30 ?? 'no data'}/5.`,
    `Active this week: ${agg.activeThisWeek}/${agg.memberCount} members.`,
  ].filter(Boolean).join('\n');

  // ── Claude narrative (150 tokens, cached 2h) ──────────────────────────
  let narrative = null;
  try {
    const response = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system:     `You are IntelliQ, a learning intelligence system. You receive a summary of what an org has done and what has worked. Write 3-4 short sentences that describe what IntelliQ has learned about this specific organisation over time: what intervention approaches work best, what patterns recur, and what the trajectory looks like. Be specific. Be honest about limited data. Do not be generic. Do not use headers or bullet points. Write as one flowing paragraph.`,
      messages:   [{ role: 'user', content: learningBrief }],
    });
    narrative = response.content[0]?.text?.trim() || null;
  } catch(err) {
    console.warn('learning-summary AI error:', err.message);
  }

  const result = {
    generatedAt:     new Date().toISOString(),
    cached:          false,
    orgName:         agg.meta.orgName || code,
    narrative:       narrative || `IntelliQ is building its understanding of this organisation. ${intStats.total} intervention(s) tracked so far. More data will unlock richer learning.`,
    interventions:   intStats,
    patternFrequency: patternFreq,
    monthlyMood,
    currentPredictions: predCount,
    memberCount:     agg.memberCount,
  };

  learningSummaryCache[code] = { data: result, generatedAt: Date.now() };
  res.json(result);
});

function _noDataFallback(agg) {
  return {
    summary: 'Not enough data yet. Once members complete a check-in or weekly reflection, IntelliQ will synthesise what it learns here.',
    moodTrend: 'unknown', moodNote: 'No mood data collected yet.', notEnoughData: true,
    trends: { trendDirection: 'unknown', trendReason: 'No data yet.', confidenceLevel: 'low', engagementTrend: 'unknown', moodComparison: 'No data yet.' },
    semanticThemes: [], memberProfiles: [], groupInsights: [],
    recommendations: [
      { action: 'Ask members to complete their first check-in in the IntelliQ app.', urgency: 'high', owner: 'leader', reason: 'No member activity recorded yet.', evidence: [] },
      { action: 'Ensure all members have set a personal goal on first login.', urgency: 'medium', owner: 'leader', reason: `${agg.memberCount - agg.membersWithGoals.length} member(s) have no goal set.`, evidence: ['goals'] },
    ],
    memberHighlights: [], goalProgress: `${agg.membersWithGoals.length} of ${agg.memberCount} member(s) have set goals.`,
    atRisk: [], themes: [], groupHighlights: [], recommendedActions: [],
  };
}

function _buildFallbackInsight(agg) {
  const moodTrend = agg.moodLast7 === null ? 'unknown'
    : agg.moodPrevWeek !== null && agg.moodLast7 > agg.moodPrevWeek + 0.3 ? 'improving'
    : agg.moodPrevWeek !== null && agg.moodLast7 < agg.moodPrevWeek - 0.3 ? 'declining'
    : 'stable';
  const engTrend = agg.activeThisWeek >= Math.ceil(agg.memberCount * 0.7) ? 'stable' : 'declining';

  return {
    summary: `${agg.activeThisWeek} of ${agg.memberCount} members active this week.`
      + (agg.moodLast7 !== null ? ` Team mood: ${agg.moodLast7}/5.` : '')
      + (agg.atRiskComputed.length > 0 ? ` ${agg.atRiskComputed.length} member(s) need attention.` : ''),
    moodTrend, notEnoughData: false,
    moodNote: agg.moodLast7 !== null ? `Team mood ${agg.moodLast7}/5 this week.` : 'No mood data.',
    trends: {
      trendDirection: moodTrend, engagementTrend: engTrend,
      confidenceLevel: agg.moodCount7 >= 4 ? 'high' : agg.moodCount7 >= 2 ? 'medium' : 'low',
      trendReason: agg.moodLast7 !== null && agg.moodPrevWeek !== null
        ? `Mood moved from ${agg.moodPrevWeek}/5 last week to ${agg.moodLast7}/5 this week.`
        : 'Insufficient data for trend comparison.',
      moodComparison: agg.moodLast30 !== null
        ? `Last 30d avg: ${agg.moodLast30}/5 — this week: ${agg.moodLast7 ?? '—'}/5.`
        : 'No historical data yet.',
    },
    semanticThemes: [],
    memberProfiles: agg.allMembers.map(u => {
      const thisWeekC = (agg.checkinsByMember[u.name] || []).filter(c => c.isThisWeek);
      const moods     = thisWeekC.filter(c => c.mood !== null).map(c => c.mood);
      const avg       = moods.length ? moods.reduce((a, b) => a + b, 0) / moods.length : null;
      const hasGoal   = agg.membersWithGoals.some(g => g.name === u.name);
      return {
        name: u.name,
        currentState: avg !== null ? `Mood ${avg.toFixed(1)}/5 this week (${moods.length} check-ins)` : 'No check-in this week — status unknown',
        strengths: [], concerns: thisWeekC.length === 0 ? ['No check-in this week'] : [],
        goalAlignment: hasGoal ? 'unknown' : 'no_goal',
        goalAlignmentExplanation: hasGoal ? 'Insufficient check-in data for alignment analysis.' : 'No goal set.',
        riskSignals: avg !== null && avg < 2.5 ? [`Low mood avg ${avg.toFixed(1)}/5`] : [],
        recommendedAction: avg !== null && avg < 2.5 ? `Check in with ${u.name} directly this week.`
          : thisWeekC.length === 0 ? `Nudge ${u.name} to check in.` : '',
      };
    }),
    groupInsights: agg.groupData.filter(g => g.memberCount > 0).map(g => ({
      groupName: g.name,
      mood: g.avgMood === null ? 'unknown' : g.avgMood >= 4 ? 'high' : g.avgMood >= 3 ? 'okay' : 'low',
      engagement: g.memberCount === 0 ? 'low' : g.activeCount / g.memberCount >= 0.7 ? 'high' : g.activeCount > 0 ? 'medium' : 'low',
      recurringThemes: [], riskSignals: [], positiveSignals: [],
      membersNeedingAttention: [], suggestedAction: '',
    })),
    recommendations: agg.atRiskComputed.slice(0, 3).map(r => ({
      action: `Check in with ${r.name} — ${r.reason.toLowerCase()}.`,
      urgency: r.urgency, owner: 'leader', reason: r.reason, evidence: ['checkins'],
    })),
    memberHighlights: [],
    goalProgress: `${agg.membersWithGoals.length} of ${agg.memberCount} members have set goals.`,
    atRisk: agg.atRiskComputed.slice(0, 3),
    themes: [], groupHighlights: [],
    recommendedActions: agg.atRiskComputed.slice(0, 2).map(r => ({ priority: r.urgency, action: `Check in with ${r.name}.` })),
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   STARTUP — Postgres init → load stores → start HTTP server
   ═══════════════════════════════════════════════════════════════════════════ */

/* Populate all in-memory store objects from a loaded data blob.
   Uses Object.assign so the existing const references stay valid. */
function _loadAllStores(data) {
  Object.assign(orgMeta,          data.orgMeta          || {});
  Object.assign(orgUsers,         data.orgUsers         || {});
  Object.assign(inviteTokens,     data.inviteTokens     || {});
  Object.assign(emailIndex,       data.emailIndex       || {});
  Object.assign(pendingInvites,   data.pendingInvites   || {});
  Object.assign(orgNodes,         data.orgNodes         || {});
  Object.assign(orgMetrics,       data.orgMetrics       || {});
  Object.assign(orgValues,        data.orgValues        || {});
  Object.assign(orgGoals,         data.orgGoals         || {});
  Object.assign(userPermissions,  data.userPermissions  || {});
  Object.assign(orgGroups,        data.orgGroups        || {});
  Object.assign(orgNotes,         data.orgNotes         || {});
  Object.assign(orgMessages,      data.orgMessages      || {});
  Object.assign(orgStore,         data.orgStore         || {});
  Object.assign(assignedScenarios,data.assignedScenarios|| {});
  Object.assign(memberResults,    data.memberResults    || {});
  Object.assign(memberCheckins,   data.memberCheckins   || {});
  Object.assign(memberGoals,      data.memberGoals      || {});
  Object.assign(weeklyAssessments,data.weeklyAssessments|| {});
  Object.assign(orgInterventions, data.orgInterventions || {});
  Object.assign(userAiProfiles,   data.userAiProfiles   || {});
  Object.assign(advisorThreads,   data.advisorThreads   || {});
  Object.assign(userConsents,     data.userConsents     || {});
  Object.assign(connectedSources, data.connectedSources || {});
  Object.assign(pendingActions,   data.pendingActions   || {});
  Object.assign(assessmentTemplates,   data.assessmentTemplates   || {});
  Object.assign(assessmentAssignments, data.assessmentAssignments || {});
  Object.assign(orgTutorials,          data.orgTutorials          || {});
  Object.assign(orgSignals,       data.orgSignals       || {});
  Object.assign(noticeFeedback,   data.noticeFeedback   || {});
  // Restore sessions, pruning any that expired while the server was down
  const _now = Date.now();
  const _savedSessions = data.activeSessions || {};
  for (const [token, s] of Object.entries(_savedSessions)) {
    if (s.expiresAt > _now) activeSessions[token] = s;
  }
  console.log(`[sessions] Restored ${Object.keys(activeSessions).length} active session(s) from Postgres`);
}

/* ═══════════════════════════════════════════════════════════════════════════
   ROBUSTNESS — registered AFTER all routes.
   - Unknown /api/* paths return a clean 404 JSON instead of the SPA HTML.
   - Any error thrown in a route (or a malformed JSON body) is caught here and
     returned as JSON instead of crashing the process or leaking a stack trace.
   ═══════════════════════════════════════════════════════════════════════════ */
app.use('/api', (req, res) => {
  res.status(404).json({ error: `Unknown API endpoint: ${req.method} ${req.path}` });
});

// eslint-disable-next-line no-unused-vars  (Express needs the 4-arg signature)
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  // Body-parser raises a 400 for malformed JSON — surface it cleanly.
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body.' });
  }
  console.error(`[error] ${req.method} ${req.originalUrl} →`, err.message);
  if (res.headersSent) return next(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong on our end. Please try again.' : err.message });
});

const PORT = process.env.PORT || 3000;

// Export a minimal surface for the endpoint smoke test (in-process, DB_OPTIONAL).
// Requiring this module never boots a listener — only running it directly does.
module.exports = { app, _loadAllStores, _rebuildEmailIndex, issueToken, _purgeExpired };

if (require.main === module) (async () => {
  try {
    // 1. Connect to Postgres + create schema
    await db.init();

    // 2. Load persisted data
    let storeData = await db.loadMain();

    // 3. One-time migration: if Postgres is empty and store.json still exists,
    //    copy it into Postgres so no existing data is lost on first deploy.
    if (Object.keys(storeData).length === 0 && fs.existsSync(STORE_FILE)) {
      console.log('[db] Postgres is empty — migrating from store.json...');
      try {
        const jsonData = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
        await db.saveMain(jsonData);
        storeData = jsonData;
        console.log('[db] Migration complete ✓  store.json data is now in Postgres.');
        console.log('[db] You can delete data/store.json — it will no longer be used.');
      } catch (e) {
        console.warn('[db] Migration skipped (store.json unreadable):', e.message);
      }
    }

    // 4. Populate in-memory stores
    _loadAllStores(storeData);

    // 5. Repair emailIndex (handles any missing entries from loaded data)
    _rebuildEmailIndex();

    // 5a2. Optional demo seed on boot — for hosts with no shell (e.g. Render free
    //      tier). Set SEED_DEMO=1 to add the demo squad; idempotent (skips if the
    //      demo org already exists) and additive (never wipes other orgs).
    // Optional demo seeds on boot (no shell needed). SEED_DEMO → athletic squad,
    // SEED_COMPANY → business team. '1' is idempotent; 'force' re-seeds.
    const _seedOnBoot = async (flag, build, code, creds) => {
      const v = process.env[flag];
      if (v !== '1' && v !== 'force') return;
      try {
        const seed = require('./scripts/seed');
        if (v === 'force' || !orgMeta[code]) {
          const demo = await seed[build]();
          _loadAllStores(demo);          // additive merge into the in-memory stores
          _rebuildEmailIndex();
          scheduleSave();
          const n = Object.keys(demo.orgUsers[code] || {}).length;
          console.log(`[seed] ✓ ${flag}=${v} — ready (${n} users in ${code}). ${creds}`);
        } else {
          console.log(`[seed] ${flag}=1 but ${code} already present — skipping (use ${flag}=force to re-seed).`);
        }
      } catch (e) { console.warn(`[seed] ${flag} boot seed failed (non-fatal):`, e.message); }
    };
    await _seedOnBoot('SEED_DEMO',    'buildDemoStore',        require('./scripts/seed').DEMO_CODE,    'Log in: coach@demo.club / maya@demo.club — password demo1234.');
    await _seedOnBoot('SEED_COMPANY', 'buildCompanyDemoStore', require('./scripts/seed').COMPANY_CODE, 'Log in: manager@atlas.demo / marcus@atlas.demo — password demo1234.');

    // 5b. Derive user.assignedNodeIds / user.leadershipNodeIds from orgNodes
    _backfillUserNodeIds();

    // 5c. Optional pgvector for cross-member similarity — only if embeddings are
    //     configured. Fully non-fatal; disables itself and falls back otherwise.
    if (embeddings.enabled()) {
      try { await db.initVectors(embeddings.DIM); }
      catch (e) { console.warn('[db] initVectors failed (non-fatal):', e.message); }
    } else {
      console.log('[db] embeddings not configured — cross-member similarity uses rule-based fallback');
    }

    // 5d. Data retention (GDPR storage limitation) — purge expired personal data
    //     on boot, then daily. Runs only in the live server (never in test mode).
    _purgeExpired();
    setInterval(() => { try { _purgeExpired(); } catch (e) { console.warn('[retention] purge failed:', e.message); } }, 24 * 60 * 60 * 1000).unref();

    // 6. Start HTTP server
    app.listen(PORT, () => {
      console.log('');
      console.log(`[server] ✓ IntelliQ ready on port ${PORT}`);
      console.log(`[server]   API key: ${process.env.ANTHROPIC_API_KEY ? '✓ loaded' : '✗ MISSING — set ANTHROPIC_API_KEY'}`);
      console.log(`[server]   Persistence: Neon Postgres (DATABASE_URL)`);
      console.log(`[server]   Retention: ${RETENTION_DAYS} days (RETENTION_DAYS to override)`);
      console.log('');
    });

  } catch (err) {
    console.error('[server] FATAL startup error:', err.message);
    process.exit(1);
  }
})();
