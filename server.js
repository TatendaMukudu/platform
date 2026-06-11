require('dotenv').config();
const express   = require('express');
const Anthropic  = require('@anthropic-ai/sdk');
const path      = require('path');
const bcrypt    = require('bcryptjs');
const fs        = require('fs');   // kept for store.json → Postgres one-time migration
const db        = require('./db');

const app    = express();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(express.json());
app.use(express.static(path.join(__dirname)));

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
      await db.saveMain({
        orgMeta, orgUsers, inviteTokens, emailIndex, pendingInvites,
        orgGroups, orgNotes, orgMessages, orgStore,
        assignedScenarios, memberResults, memberCheckins,
        memberGoals, weeklyAssessments, orgInterventions,
        orgNodes, orgMetrics, orgValues, orgGoals, userPermissions,
      });
    } catch(e) { console.error('[db] Save failed:', e.message); }
  }, 500);
}

/* ── Session tokens ───────────────────────────────────────────────────────────
   Issued on login / setup / member join. NOT persisted — tokens die on restart
   so users re-authenticate naturally. 24-hour expiry.
   ─────────────────────────────────────────────────────────────────────────── */
const activeSessions = {}; // token → { userId, orgCode, role, expiresAt }

const SALT_ROUNDS = 10;

// Detect passwords still stored with the old toy simpleHash (short hex, no $2b$ prefix)
function isLegacyHash(h) { return h && !h.startsWith('$2b$') && !h.startsWith('$2a$'); }

// Legacy hash used only for migration path — new code never calls this for new passwords
function simpleHash(str) { let h = 0; for (const c of str) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h.toString(16); }

function issueToken(userId, orgCode, role) {
  const token = generateToken();
  activeSessions[token] = {
    userId, orgCode: (orgCode || '').toLowerCase(), role,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
  };
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
function buildReflectionPrompt(orgMode, orgName, orgValues = [], orgMetrics = []) {
  // orgMode kept as optional fallback context only (Option B soft deprecation)
  const verticalCtx = {
    school:     'students in a school environment. Academic pressure, peer relationships, behaviour, and moral development are common themes.',
    sports:     'athletes in a sports club. Performance pressure, team dynamics, coaching relationships, and mental resilience are common themes.',
    workplace:  'employees in a workplace. Professional conduct, leadership, team conflict, stress, and work-life balance are common themes.',
    military:   'personnel in a military unit. Discipline, command decisions, ethics under pressure, and stress management are common themes.',
    healthcare: 'healthcare workers. Patient care decisions, ethical dilemmas, burnout, and high-stakes stress are common themes.',
    government: 'government officials and public servants. Policy decisions, integrity, public accountability, and crisis management are common themes.',
  };

  const contextLine = orgMode && verticalCtx[orgMode]
    ? `You are speaking with ${verticalCtx[orgMode]}`
    : `You are speaking with individuals in a professional or institutional environment.`;

  const valuesLine  = orgValues.length  ? `\nORG VALUES: ${orgValues.join(', ')} — connect your reflections to these where relevant.` : '';
  const metricsLine = orgMetrics.length ? `\nORG PERFORMANCE DIMENSIONS: ${orgMetrics.map(m=>typeof m==='string'?m:m.name).join(', ')} — explore how the member's behaviour connects to these.` : '';

  return `You are the IntelliQ Reflection Assistant — an empathetic, intelligent AI coach embedded in the IntelliQ platform used by ${orgName}.

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
function buildScenarioPrompt(orgMode, orgName, title, context, memberName, difficulty, opening = null, probes = null, orgValues = [], orgMetrics = []) {
  const difficultyNote = {
    easy:   'Start with a clear, straightforward situation. Keep the stakes moderate.',
    medium: 'Present a situation with genuine tension and no obvious right answer.',
    hard:   'Create high-stakes complexity with competing obligations, time pressure, and moral ambiguity.',
  }[difficulty] || 'Present a situation with genuine tension and no obvious right answer.';

  return `You are the IntelliQ Scenario Facilitator — an intelligent evaluator running a live decision-making assessment in the IntelliQ platform used by ${orgName}.

You are assessing ${memberName} using a scenario in the domain: "${title}".
SCENARIO CONTEXT: ${context}
DIFFICULTY: ${difficultyNote}
${opening ? `\nAPPROVED OPENING — use this exact opening to begin:\n"${opening}"\n` : ''}
${probes?.length ? `\nAPPROVED PROBE FRAMEWORK — the coach has pre-approved these follow-up angles. Use them as your guide but adapt naturally to what ${memberName} says:\n${probes.map((p, i) => `${i+1}. ${p}`).join('\n')}\n` : ''}
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
    memberName,
    scenarioContext,    // reflection mode: completed scenario summary
    promptType,         // 'reflection' (default) | 'scenario'
    scenarioRunContext, // scenario mode: { title, context, difficulty, opening, probes, image }
  } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  // Load org-specific values and metrics for prompt enrichment
  const code    = (orgCode || '').toLowerCase();
  const values  = orgValues[code]  || [];
  const metrics = (orgMetrics[code] || []).map(m => m.name || m);

  try {
    let systemPrompt;

    if (promptType === 'scenario') {
      const sc = scenarioRunContext || {};
      systemPrompt = buildScenarioPrompt(
        orgMode || '',
        orgName  || 'your organisation',
        sc.title || 'Decision Making',
        sc.context || 'A challenging workplace or social situation',
        memberName || 'the member',
        sc.difficulty || 'medium',
        sc.opening  || null,
        sc.probes   || null,
        values,
        metrics
      );
    } else {
      systemPrompt = buildReflectionPrompt(orgMode || '', orgName || 'your organisation', values, metrics);
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
app.post('/api/draft-scenario', async (req, res) => {
  const { brief, orgMode, orgName, memberName, difficulty, image } = req.body;
  if (!brief) return res.status(400).json({ error: 'brief required' });

  const hasImage = image && image.data && image.mediaType;

  const systemPrompt = `You are an expert scenario designer for IntelliQ, a performance intelligence platform used by ${orgName || 'an organisation'}.

A coach/professional has written a brief about a member. Your job is to draft a scenario that will be used to assess that member's decision-making, reasoning, and self-awareness.

ORGANISATION TYPE: ${orgMode || 'school'}
MEMBER: ${memberName || 'the member'}
DIFFICULTY: ${difficulty || 'medium'}
${hasImage ? '\nAn image has been attached by the coach. Build the scenario around what is shown in the image — reference specific elements the member should notice and respond to.' : ''}

OUTPUT FORMAT — respond with valid JSON only, no extra text:
{
  "opening": "The vivid opening situation (2-3 sentences). ${hasImage ? 'Reference the image directly — e.g. \"Take a look at the clip/diagram/sheet below.\" Then set the scene.' : 'Ground it in reality.'} Do not resolve the tension.",
  "probes": [
    "First follow-up — references something specific in the image or brief",
    "Second follow-up — introduces a complication or raises stakes",
    "Third follow-up — tests self-awareness or understanding"
  ],
  "coachNote": "What this scenario is designed to reveal, and what strong vs weak responses look like. 2-3 sentences. Reference the image content if relevant.",
  "title": "A short scenario title (3-6 words)"
}

RULES:
- The opening must feel real and specific
- Do not make the right answer obvious
- The probes should escalate
- The coachNote is private — never shown to the member
- Adapt to the org type`;

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

You are writing a private debrief for a ${coachRole || 'coach/supervisor'} — NOT for the member. The member will never see this.

Your job: analyse ${memberName}'s responses to the "${scenarioTitle}" scenario and give the coach practical, specific guidance.

ORGANISATION TYPE: ${orgMode || 'school'}

OUTPUT FORMAT — valid JSON only:
{
  "headline": "One sentence summary of the most important thing the coach should know",
  "whatThisReveals": "2-3 sentences on what ${memberName}'s reasoning pattern shows — not just the score, but the WHY behind it. What does this tell you about how they think?",
  "watchFor": ["Specific behaviour or pattern to observe in real situations", "Another thing to monitor"],
  "coachingActions": ["Concrete action the coach can take this week", "A second specific action", "Optional third action"],
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
  orgMeta[orgCode]  = { orgName, orgMode: orgMode || 'workplace', createdAt: new Date().toISOString() };
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
  if (roleLevel[role] <= roleLevel[creator.role] && creator.role !== 'superadmin') {
    return res.status(403).json({ error: 'You cannot create someone at or above your level' });
  }

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
    supervisorId: supervisorId || creatorId,
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

  // Resolve permissions: explicit grants merged with role defaults
  const explicitGrants = userPermissions[session.orgCode]?.[session.userId] || {};
  const roleDefaults   = _resolveRoleDefaults(user.role);
  const permissions    = { ...roleDefaults, ...explicitGrants };

  res.json({ ok: true, user: { ...user, passwordHash: undefined }, org, permissions });
});

/* ── Permission defaults by role (fallback when no explicit grant) ───────── */
function _resolveRoleDefaults(role) {
  const d = {
    superadmin: {
      view_members: true, edit_members: true, delete_members: true,
      view_analytics: true, manage_metrics: true, manage_values: true,
      manage_goals: true, manage_tree: true, manage_permissions: true,
      assign_scenarios: true, view_reports: true, manage_settings: true,
    },
    admin: {
      view_members: true, edit_members: true, delete_members: false,
      view_analytics: true, manage_metrics: true, manage_values: true,
      manage_goals: true, manage_tree: true, manage_permissions: false,
      assign_scenarios: true, view_reports: true, manage_settings: false,
    },
    coach: {
      view_members: true, edit_members: false, delete_members: false,
      view_analytics: true, manage_metrics: false, manage_values: false,
      manage_goals: false, manage_tree: false, manage_permissions: false,
      assign_scenarios: true, view_reports: true, manage_settings: false,
    },
    member: {
      view_members: false, edit_members: false, delete_members: false,
      view_analytics: false, manage_metrics: false, manage_values: false,
      manage_goals: false, manage_tree: false, manage_permissions: false,
      assign_scenarios: false, view_reports: false, manage_settings: false,
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

    const explicit = userPermissions[session.orgCode]?.[session.userId] || {};
    const defaults = _resolveRoleDefaults(user.role);
    const allowed  = explicit[perm] !== undefined ? explicit[perm] : (defaults[perm] || false);

    if (!allowed) return res.status(403).json({ error: `Permission denied: ${perm}` });
    req.iqSession = session;
    next();
  };
}

/* ── Get org hierarchy tree ─────────────────────────────────────────────── */
app.get('/api/auth/org-tree', (req, res) => {
  const { orgCode } = req.query;
  const code  = (orgCode || '').toLowerCase();
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

  // 8. Hard-delete historical data if requested
  if (deleteData) {
    const uKey = userKey(code, userId);
    const mKey = memberKey(code, name);
    [uKey, mKey].forEach(k => {
      delete memberGoals[k];
      delete memberCheckins[k];
      delete weeklyAssessments[k];
      delete memberResults[k];
      delete assignedScenarios[k];
    });
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

  const {
    mainGoals        = '',
    longTermGoals    = '',
    strengths        = '',
    improvementAreas = '',
    selectedValues   = [],
    personalMetrics  = [],
    freeText         = '',
  } = req.body;

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
   Node: { nodeId, name, parentId, childNodeIds, memberIds, leaderIds, createdAt, updatedAt }
   ═══════════════════════════════════════════════════════════════════════════ */

app.get('/api/tree', requireAuth, (req, res) => {
  const code  = req.iqSession.orgCode;
  const nodes = Object.values(orgNodes[code] || {});
  res.json({ ok: true, nodes });
});

app.post('/api/tree/node', requirePermission('manage_tree'), (req, res) => {
  const code = req.iqSession.orgCode;
  const { name, parentId } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  if (!orgNodes[code]) orgNodes[code] = {};
  const nodeId = 'nd_' + generateId();
  const now    = new Date().toISOString();
  orgNodes[code][nodeId] = { nodeId, name: name.trim(), parentId: parentId || null, memberIds: [], leaderIds: [], createdAt: now, updatedAt: now };
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
  const { name, parentId, memberIds, leaderIds } = req.body;
  const now = new Date().toISOString();
  if (name      !== undefined) node.name      = name.trim();
  if (memberIds !== undefined) node.memberIds = memberIds;
  if (leaderIds !== undefined) node.leaderIds = leaderIds;
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
  const group = { id: groupId(), name, description: description || '', memberIds: memberIds || [], leadIds: leadIds || [], createdAt: new Date().toISOString() };
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
        system: prompts[type] || prompts.private,
        messages: [{ role: 'user', content: userMsg }],
      });
      note.aiResponse = response.content[0]?.text?.trim() || null;
    } catch(e) { /* non-critical */ }
  }

  scheduleSave();
  res.json({ ok: true, note: _sanitizeNote(note, authorId) });
});

/* ── Get notes — requires auth ───────────────────────────────────────────── */
app.get('/api/notes', requireAuth, (req, res) => {
  const { orgCode, requesterId, groupId: gid, type } = req.query;
  if (!orgCode || !requesterId) return res.status(400).json({ error: 'missing fields' });
  const code = orgCode.toLowerCase().trim();

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
  const { orgCode, requesterId, groupId: gid, toType } = req.query;
  if (!orgCode || !requesterId) return res.status(400).json({ error: 'missing fields' });
  const code = orgCode.toLowerCase().trim();

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
app.get('/api/groups/:groupId/feed', (req, res) => {
  const { orgCode, requesterId } = req.query;
  if (!orgCode || !requesterId) return res.status(400).json({ error: 'missing fields' });
  const code = orgCode.toLowerCase().trim();
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
  const { orgCode } = req.query;
  if (!orgCode) return res.status(400).json({ error: 'orgCode required' });
  const code  = orgCode.toLowerCase().trim();
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

/* ── Platform assigns a scenario to a member ────────────────────────────── */
app.post('/api/platform/assign-scenario', (req, res) => {
  const { orgCode, memberName, scenario } = req.body;
  if (!orgCode || !memberName || !scenario) {
    return res.status(400).json({ error: 'orgCode, memberName and scenario required' });
  }
  const key = memberKey(orgCode, memberName);
  if (!assignedScenarios[key]) assignedScenarios[key] = [];
  if (!assignedScenarios[key].find(s => s.id === scenario.id)) {
    assignedScenarios[key].push({ ...scenario, assignedAt: new Date().toISOString(), status: 'pending' });
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
    orgMode:    org?.orgMode  || 'school',
    memberName: memberName.trim(),
    orgCode:    code,
    token,
  });
});

/* ── Member gets pending scenarios ─────────────────────────────────────── */
app.get('/api/member/pending', (req, res) => {
  const { orgCode, memberName, userId } = req.query;
  if (!orgCode) return res.status(400).json({ error: 'orgCode required' });

  // Resolve memberName from userId when provided (unified app path)
  let resolvedName = memberName;
  if (userId && !resolvedName) {
    const user = orgUsers[orgCode.toLowerCase()]?.[userId];
    if (user) resolvedName = user.name;
  }
  if (!resolvedName) return res.status(400).json({ error: 'memberName or userId required' });

  const key     = memberKey(orgCode, resolvedName);
  const pending = (assignedScenarios[key] || []).filter(s => s.status === 'pending');
  res.json({ scenarios: pending });
});

/* ── Member submits scenario result ─────────────────────────────────────── */
app.post('/api/member/submit-result', (req, res) => {
  const { orgCode, memberName, memberId, scenarioId, result } = req.body;
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
  scheduleSave();
  res.json({ ok: true });
});

/* ── Platform pulls member results ─────────────────────────────────────── */
app.get('/api/platform/member-results', requireAuth, (req, res) => {
  const { orgCode, memberName } = req.query;
  if (!orgCode || !memberName) return res.status(400).json({ error: 'missing fields' });
  const key = memberKey(orgCode, memberName);
  res.json({
    results:  memberResults[key]  || [],
    checkins: memberCheckins[key] || [],
  });
});

/* ── Platform pulls all results for org ─────────────────────────────────── */
app.get('/api/platform/org-results', requireAuth, (req, res) => {
  const { orgCode } = req.query;
  if (!orgCode) return res.status(400).json({ error: 'orgCode required' });
  const code    = orgCode.toLowerCase().trim();
  const results = {};
  Object.keys(memberResults).forEach(key => {
    if (!key.startsWith(code + ':')) return;
    const entries = memberResults[key];
    if (!entries?.length) return;
    // Use memberName from the entry; fall back to parsing the key
    const name = entries[0]?.memberName || key.split(':').slice(1).join(':');
    results[name] = entries;
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
  "orgMode": "school|sports|workplace|military|healthcare|government",
  "summary": "One sentence capturing what this org is really about",
  "traits": ["specific trait 1", "specific trait 2", "specific trait 3", "specific trait 4"],
  "goals": ["meaningful org goal 1", "meaningful org goal 2", "meaningful org goal 3"],
  "environment": "The kind of culture/environment they want to build (1 sentence)",
  "successLooks": "What success looks like for them specifically (1 sentence)"
}

RULES:
- orgMode must be exactly one of: school, sports, workplace, military, healthcare, government
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

app.get('/api/member/goals', (req, res) => {
  const { orgCode, memberName, memberId } = req.query;
  if (!orgCode || (!memberName && !memberId)) return res.status(400).json({ error: 'missing fields' });
  const key = memberId
    ? userKey(orgCode, memberId)
    : memberKey(orgCode, memberName);
  // Also try the other format as fallback (data may have been saved under either key)
  const altKey = memberId ? memberKey(orgCode, memberName || '') : null;
  res.json({ goals: memberGoals[key] || (altKey ? memberGoals[altKey] : null) || null });
});

/* ═══════════════════════════════════════════════════════════════════════════
   FREEFORM CHECK-IN — Free text + AI response
   Accepts memberId (stable) or memberName (legacy). Prefers memberId.
   ═══════════════════════════════════════════════════════════════════════════ */
app.post('/api/checkin/freeform', async (req, res) => {
  const { orgCode, memberName, memberId, text, mood, role, orgMode, orgName, goals } = req.body;
  if (!orgCode || !memberName || !text) return res.status(400).json({ error: 'missing fields' });

  const key = memberId
    ? userKey(orgCode, memberId)
    : memberKey(orgCode, memberName);

  if (!memberCheckins[key]) memberCheckins[key] = [];

  const moodLabels = { 1:'Rough', 2:'Low', 3:'Okay', 4:'Good', 5:'Great' };
  const checkin = {
    memberName,   // always store name inside entry for display
    text,
    mood: mood || null,
    moodLabel: moodLabels[mood] || null,
    role: role || 'member',
    orgMode: orgMode || 'school',
    date: new Date().toLocaleDateString('en-GB'),
    ts:   new Date().toISOString(),
  };
  memberCheckins[key].push(checkin);

  const rolePrompts = {
    member:  `You are IntelliQ, a warm and perceptive performance intelligence system. A team member has just submitted their daily check-in. Read what they shared, acknowledge it genuinely in 1-2 sentences, then if they have a goal — leave them with one specific, actionable thought about it. Keep it brief and human. Max 3 sentences total. Never be generic or robotic.`,
    coach:   `You are IntelliQ, a performance intelligence assistant for coaches. A coach has submitted their daily check-in. Acknowledge what they shared briefly. If they mentioned a specific player or session, reflect something useful back. If there's a pattern worth noting, surface it. Max 3 sentences. Be direct and practical.`,
    admin:   `You are IntelliQ, a performance intelligence assistant. An admin has submitted a check-in. Acknowledge briefly. If anything sounds like it needs org-level attention, note it. Max 2 sentences.`,
  };

  const systemPrompt = rolePrompts[role] || rolePrompts.member;
  let userContent = '';
  if (mood) userContent += `Mood: ${moodLabels[mood]}\n`;
  if (goals?.goal) userContent += `Their season goal: "${goals.goal}"\n`;
  if (goals?.identity) userContent += `Who they want to become: "${goals.identity}"\n`;
  userContent += `\nCheck-in: ${text}`;

  try {
    const response = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 120,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userContent }],
    });
    const aiResponse = response.content[0]?.text?.trim() || '';
    checkin.aiResponse = aiResponse;
    scheduleSave();
    res.json({ ok: true, aiResponse });
  } catch(err) {
    console.error('Checkin AI error:', err.message);
    scheduleSave();
    res.json({ ok: true, aiResponse: null });
  }
});

/* ── Platform: pull all checkins for org — requires auth ────────────────── */
app.get('/api/platform/org-checkins', requireAuth, (req, res) => {
  const { orgCode } = req.query;
  if (!orgCode) return res.status(400).json({ error: 'orgCode required' });
  const code    = orgCode.toLowerCase().trim();
  const results = {};
  Object.keys(memberCheckins).forEach(key => {
    if (!key.startsWith(code + ':')) return;
    const entries = memberCheckins[key];
    if (!entries?.length) return;
    // Use memberName stored inside the entry; fall back to key parsing for legacy data
    const name = entries[0]?.memberName || key.split(':').slice(1).join(':');
    if (name) results[name] = entries;
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
  const { orgCode, memberName, memberId, role, orgMode, orgName, data, goals } = req.body;
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
    member: `You are IntelliQ. A team member has completed their weekly reflection. Read what they shared and respond in 2-3 sentences: acknowledge their week genuinely, and if they have a goal, connect something they said to it. Be warm and specific. Max 3 sentences.`,
    coach:  `You are IntelliQ, a performance intelligence assistant. A coach has submitted their weekly assessment. Read it and respond with one practical insight or observation worth acting on. Reference specifics they mentioned. Max 3 sentences.`,
    staff:  `You are IntelliQ. A staff member has submitted their weekly report. Acknowledge what they shared and note anything that may need follow-up. Max 2 sentences.`,
  };

  const roleKey = role === 'member' ? 'member' : role === 'coach' ? 'coach' : 'staff';
  let userMsg = '';
  if (goals?.goal) userMsg += `Their goal: "${goals.goal}"\n\n`;
  userMsg += `Weekly reflection:\n${Object.entries(data).map(([k,v]) => `${k}: ${v}`).join('\n')}`;

  let aiResponse = null;
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 150,
      system: rolePrompts[roleKey],
      messages: [{ role: 'user', content: userMsg }],
    });
    aiResponse = response.content[0]?.text?.trim() || null;
  } catch(e) { /* non-critical */ }

  const entry = {
    memberName, memberId: memberId || null,
    role: role || 'member', orgMode: orgMode || 'school',
    data, week, aiResponse,
    submittedAt: new Date().toISOString(),
  };
  weeklyAssessments[key].push(entry);
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
    const goals     = (memberGoals[memberKey(code, u.name)] || memberGoals[userKey(code, u.id)] || [])
                        .filter(g => g.status !== 'completed');
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
  const { orgCode, refresh } = req.query;
  if (!orgCode) return res.status(400).json({ error: 'orgCode required' });
  const code = orgCode.toLowerCase().trim();

  const CACHE_TTL    = 60 * 60 * 1000;
  const cached       = orgInsightCache[code];
  const forceRefresh = refresh === '1';
  if (cached && !forceRefresh && (Date.now() - cached.generatedAt < CACHE_TTL)) {
    return res.json({ ...cached.data, cached: true });
  }

  const agg = _aggregateOrgData(code);
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
  const SYSTEM = `You are IntelliQ, a decision-support intelligence system. You receive structured data about an organisation — member goals, check-ins, weekly reflections, assessment scores, groups. Your job is NOT to describe the data, but to synthesise it into intelligence: what does it mean, what patterns exist, and what should the coach do?

OUTPUT FORMAT — valid JSON only, absolutely no markdown or extra text outside the JSON object:
{
  "summary": "2-3 sentences. What does the coach need to know TODAY? Name specific people and specific patterns. Never be generic.",
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
      "recommendedAction": "One concrete action for the coach, with their name."
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
      "owner": "coach|admin|member",
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
  const { orgCode, memberId, memberName, refresh } = req.query;
  if (!orgCode) return res.status(400).json({ error: 'orgCode required' });
  const code    = orgCode.toLowerCase().trim();
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
  const { orgCode, groupId, refresh } = req.query;
  if (!orgCode || !groupId) return res.status(400).json({ error: 'orgCode and groupId required' });
  const code  = orgCode.toLowerCase().trim();
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
  const { orgCode } = req.query;
  if (!orgCode) return res.status(400).json({ error: 'orgCode required' });
  const code = orgCode.toLowerCase().trim();
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
   LEARNING ENGINE — Patterns, Predictions, Effectiveness, Summary
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── GET /api/intelliq/patterns — rule-based risk patterns for org ────────── */
app.get('/api/intelliq/patterns', requireAuth, (req, res) => {
  const { orgCode } = req.query;
  if (!orgCode) return res.status(400).json({ error: 'orgCode required' });
  const code = orgCode.toLowerCase().trim();
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
  const { orgCode } = req.query;
  if (!orgCode) return res.status(400).json({ error: 'orgCode required' });
  const code = orgCode.toLowerCase().trim();
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
  const { orgCode } = req.query;
  if (!orgCode) return res.status(400).json({ error: 'orgCode required' });
  const code = orgCode.toLowerCase().trim();
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
  const { orgCode, refresh } = req.query;
  if (!orgCode) return res.status(400).json({ error: 'orgCode required' });
  const code   = orgCode.toLowerCase().trim();
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
      { action: 'Ask members to complete their first check-in in the IntelliQ app.', urgency: 'high', owner: 'coach', reason: 'No member activity recorded yet.', evidence: [] },
      { action: 'Ensure all members have set a personal goal on first login.', urgency: 'medium', owner: 'coach', reason: `${agg.memberCount - agg.membersWithGoals.length} member(s) have no goal set.`, evidence: ['goals'] },
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
      urgency: r.urgency, owner: 'coach', reason: r.reason, evidence: ['checkins'],
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
}

const PORT = process.env.PORT || 3000;

(async () => {
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

    // 6. Start HTTP server
    app.listen(PORT, () => {
      console.log('');
      console.log(`[server] ✓ IntelliQ ready on port ${PORT}`);
      console.log(`[server]   API key: ${process.env.ANTHROPIC_API_KEY ? '✓ loaded' : '✗ MISSING — set ANTHROPIC_API_KEY'}`);
      console.log(`[server]   Persistence: Neon Postgres (DATABASE_URL)`);
      console.log('');
    });

  } catch (err) {
    console.error('[server] FATAL startup error:', err.message);
    process.exit(1);
  }
})();
