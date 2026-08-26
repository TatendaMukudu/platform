/* ============================================================
   scripts/seed.js — stand up a realistic demo squad

   Writes a complete demo org straight into the store (via db.saveMain) with ~6
   MONTHS of back-dated check-ins + signals, engineered so the kernel produces a
   real, varied briefing on first open — not empty screens. Long stable baselines,
   with the story arcs playing out in the recent weeks.

   The story it creates (matches the product mockup):
     • Maya Chen   — went quiet (participation dropped)      → withdrawal
     • Deshawn E.  — training load up while mood dips         → overload
     • Priya Anand — quietly improving, unrecognised          → quiet_improvement
     • Jordan / Sam / Chris — steady (no flags)

   Run (needs a DATABASE_URL — a fresh Neon DB is ideal):
     DATABASE_URL=postgres://... node scripts/seed.js

   ⚠ Overwrites the 'main' store. Point it at a demo/pilot database.

   Login after seeding (all passwords: demo1234):
     Coach  — coach@demo.club
     Athlete— maya@demo.club  (and deshawn/priya/jordan/sam/chris @demo.club)
   ============================================================ */

const bcrypt = require('bcryptjs');
const db     = require('../db');

const SALT = 10;
const CODE = 'demo-athletic-club';
const rid  = () => Math.random().toString(36).slice(2, 10);
const dAgo = (d, hour = 9) => { const t = new Date(); t.setDate(t.getDate() - d); t.setHours(hour, 0, 0, 0); return t; };
const iso  = dt => dt.toISOString();
const dstr = dt => dt.toLocaleDateString('en-GB');
const ukey = uid => `${CODE}:${uid}`;
const MOODLBL = { 1: 'Rough', 2: 'Low', 3: 'Okay', 4: 'Good', 5: 'Great' };

/* Pure builder — returns the demo org's store slice (no DB writes). Reused by the
   CLI below and by the optional SEED_DEMO boot path in server.js (free tier has
   no shell, so the demo is seedable via an env flag instead). */
function extendSeedTeamSurface(store, { code, coachId, memberIds, teamId }) {
  // The seed deliberately crosses the same candidate/admission and Focus constructors as
  // production. It never fabricates a completed Inquiry record by assigning inquiryStates.
  const contribution = require('../ai/contribution');
  const teamState = require('../ai/team-state');
  const S = require('../server');
  S._loadAllStores(store);
  S._backfillUserNodeIds();
  const offer = ({ who, id, concept, label, valence, authority = 'self_report', explicitOpen = false }) => {
    S._noteGroupCandidates(code, who, `member:${who}`, [{ id, level: 'observation', text: label,
      sourceSpan: `Our ${label}`, concerns: 'group', originRef: `seed_origin:${id}`, originKind: 'direct_observation',
      authority, turnId: `seed_turn:${id}` }], concept, label);
    const candidate = S.groupCandidates[code].find(c => c.evidenceRef === id && c.nodeId === teamId);
    const leads = (store.orgNodes[code][teamId].leaderIds || []).includes(who);
    const gate = contribution.mayContribute({ actorId: who, ownerId: who, role: leads ? 'leader' : 'member',
      inNode: (store.orgNodes[code][teamId].memberIds || []).includes(who), leadsNode: leads, explicit: true });
    if (!candidate || !gate.allowed) throw new Error(`demo contribution refused for ${concept}`);
    candidate.status = 'contributed'; candidate.contributedAt = Date.now(); candidate.valence = valence;
    candidate.contributorRole = leads ? 'leader' : 'member'; candidate.explicitOpen = explicitOpen;
    candidate.fromSubject = `member:${who}`;
    S._admitGroupContributions(code, teamId, concept);
    return candidate;
  };
  // FIVE contributors per concept, not two. The cohort floor is five and two-sided, so a
  // demo seeded with two would open on an empty screen — which is honest but useless as a seed.
  // Widening the seed is the correct response; lowering the floor to make a demo look busy is
  // exactly the pressure the floor exists to resist.
  for (let i = 0; i < 5; i++) {
    offer({ who: memberIds[i], id: `seed_low_${i}`, concept: 'role_clarity', label: 'Role clarity', valence: 'worth_attention' });
  }
  for (let i = 5; i < 10; i++) {
    offer({ who: memberIds[i], id: `seed_high_${i}`, concept: 'peer_support', label: 'Peer support', valence: 'working_well' });
  }
  // One leader-opened finding is real but cannot clear the two-sided cohort floor.
  offer({ who: memberIds[10], id: 'seed_withheld', concept: 'travel_routine', label: 'Travel routine',
    valence: 'worth_attention', authority: 'authoritative' });

  const lowInquiry = Object.values(S.inquiryStates[code][`group:${teamId}`])
    .find(inquiry => inquiry.topic.canonicalConcept === 'role_clarity');
  const focus = teamState.newFocus({ focusId: 'tf_demo_role_clarity', nodeId: teamId,
    text: 'Clarify roles before the next shared session', by: coachId, now: Date.now(), inquiry: lowInquiry });
  teamState.recordFocusOutcome(focus, { result: 'better', note: 'Questions became more specific.', by: coachId, now: Date.now() });
  S._teamFocuses(code, teamId).unshift(focus);

  store.groupCandidates = { [code]: JSON.parse(JSON.stringify(S.groupCandidates[code])) };
  store.inquiryStates = { [code]: JSON.parse(JSON.stringify(S.inquiryStates[code])) };
  store.teamFocuses = { [code]: JSON.parse(JSON.stringify(S.teamFocuses[code])) };
}

async function buildDemoStore() {
  const pass = await bcrypt.hash('demo1234', SALT);

  const coachId = rid();
  /* FOURTEEN athletes, not six.

     This is the cohort floor showing up in the demo data, and it is the right way round. At a
     two-sided floor of five, a six-person group can never publish a group finding at any number
     of contributors — five named leaves one uncounted, and one is below the floor. A six-athlete
     demo would therefore open on a permanently empty team surface.

     The fix is a realistic squad, not a lower floor. It is also a real pilot fact: a group needs
     at least ten people before the team surface can say anything at all about it. */
  const athletes = [
    { key: 'maya',    name: 'Maya Chen',      pos: 'Midfield', kind: 'quiet'     },
    { key: 'deshawn', name: 'Deshawn Ellis',  pos: 'Forward',  kind: 'overload'  },
    { key: 'priya',   name: 'Priya Anand',    pos: 'Defense',  kind: 'improving' },
    { key: 'jordan',  name: 'Jordan Lee',     pos: 'Keeper',   kind: 'steady'    },
    { key: 'sam',     name: 'Sam Fox',        pos: 'Wing',     kind: 'steady'    },
    { key: 'chris',   name: 'Chris Obi',      pos: 'Center',   kind: 'steady'    },
    { key: 'tomas',   name: 'Tomas Varga',    pos: 'Defense',  kind: 'steady'    },
    { key: 'noor',    name: 'Noor Haddad',    pos: 'Midfield', kind: 'improving' },
    { key: 'kofi',    name: 'Kofi Mensah',    pos: 'Forward',  kind: 'steady'    },
    { key: 'lena',    name: 'Lena Brandt',    pos: 'Wing',     kind: 'quiet'     },
    { key: 'ravi',    name: 'Ravi Iyer',      pos: 'Center',   kind: 'steady'    },
    { key: 'aoife',   name: 'Aoife Byrne',    pos: 'Defense',  kind: 'steady'    },
    { key: 'yuki',    name: 'Yuki Tanaka',    pos: 'Midfield', kind: 'improving' },
    { key: 'marco',   name: 'Marco Ferrari',  pos: 'Keeper',   kind: 'steady'    },
  ].map(a => ({ ...a, id: rid(), email: `${a.key}@demo.club` }));

  // ── stores ────────────────────────────────────────────────────────────────
  const orgMeta = {}, orgUsers = { [CODE]: {} }, emailIndex = {}, orgNodes = { [CODE]: {} };
  const memberGoals = {}, memberCheckins = {}, orgSignals = { [CODE]: [] };
  const orgGroups = {}, orgValues = {}, orgGoals = {};

  orgMeta[CODE] = {
    orgName: 'Demo Athletic Club', orgMode: '', createdAt: iso(dAgo(210)),
    organizationProfile: {
      description: 'A club focused on athlete development and wellbeing.',
      values: ['Consistency', 'Effort', 'Team-first', 'Honesty'],
      goals: ['Develop every athlete', 'Keep athletes healthy and engaged'],
      successDefinition: 'Athletes who grow and stay well.',
      behaviours: ['Shows up', 'Supports teammates', 'Reflects honestly'],
      metrics: ['Training Load', 'Wellbeing'], setAt: iso(dAgo(205)), setBy: coachId,
    },
    organizationProfileComplete: true,
  };
  orgValues[CODE] = ['Consistency', 'Effort', 'Team-first', 'Honesty'];
  orgGoals[CODE]  = [
    { goalId: 'g_' + rid(), text: 'Develop every athlete', createdAt: iso(dAgo(205)) },
    { goalId: 'g_' + rid(), text: 'Keep athletes healthy and engaged', createdAt: iso(dAgo(205)) },
  ];

  orgUsers[CODE][coachId] = {
    id: coachId, firstName: 'Alex', lastName: 'Rivera', name: 'Alex Rivera',
    email: 'coach@demo.club', role: 'superadmin', orgCode: CODE, supervisorId: null,
    passwordHash: pass, passwordSet: true, status: 'active', createdAt: iso(dAgo(210)),
    levelId: 1, profileComplete: true,
  };
  emailIndex['coach@demo.club'] = { orgCode: CODE, userId: coachId };

  const pushSig = (subjectId, createdBy, source, dt, valueNum, valueText, label, sensitivity) =>
    orgSignals[CODE].push({
      id: 'sig_' + rid(), orgCode: CODE, ts: iso(dt), source, modality: 'text',
      subjectType: 'member', subjectId, category: null,
      label: label || (valueNum != null ? `Mood ${valueNum}/5` : null),
      valueNum: valueNum != null ? Number(valueNum) : null, valueText: valueText || null,
      data: null, sensitivity: sensitivity || 'normal', public: false,
      weightNum: source === 'metric' ? 3 : 2, weight: source === 'metric' ? 'strong' : 'medium',
      createdBy, createdAt: iso(dt),
    });

  const checkin = (a, dt, mood, text) => {
    const k = ukey(a.id);
    (memberCheckins[k] = memberCheckins[k] || []).push({
      memberName: a.name, text, mood, moodLabel: MOODLBL[mood] || null,
      role: 'member', orgMode: '', date: dstr(dt), ts: iso(dt),
    });
    pushSig(a.id, a.id, 'checkin', dt, mood, text, `Mood ${mood}/5`, 'sensitive'); // member-generated
  };

  athletes.forEach(a => {
    orgUsers[CODE][a.id] = {
      id: a.id, firstName: a.name.split(' ')[0], lastName: a.name.split(' ')[1] || '',
      name: a.name, email: a.email, role: 'member', orgCode: CODE, supervisorId: coachId,
      passwordHash: pass, passwordSet: true, status: 'active', createdAt: iso(dAgo(200)),
      levelId: 2, profileComplete: true,
    };
    emailIndex[a.email] = { orgCode: CODE, userId: a.id };
    memberGoals[ukey(a.id)] = {
      goal: `Grow as a ${a.pos.toLowerCase()} and be dependable for the squad`,
      mainGoals: `Grow as a ${a.pos.toLowerCase()}`, identity: 'A dependable teammate',
      selectedValues: ['Consistency', 'Effort', 'Team-first'], personalMetrics: [],
      memberName: a.name, setAt: iso(dAgo(195)),
    };

    // ~6 months of check-ins (every 2–4 days). A long, stable baseline; the STORY
    // plays out only in the recent weeks — so the kernel's self-relative read has
    // real history to compare against and the recent shifts genuinely stand out.
    for (let d = 182; d >= 0; d -= (2 + Math.floor(Math.random() * 3))) {
      let mood, text;
      if (a.kind === 'quiet') {
        if (d <= 9) continue;                          // went quiet ~9 days ago
        mood = d <= 18 ? 2 : 4;
        text = d <= 18 ? 'Bit flat lately, not sure why.' : 'Good session, felt sharp.';
      } else if (a.kind === 'overload') {
        mood = d > 21 ? 4 : d > 10 ? 3 : 2;            // steady for months → dips last ~3 weeks
        text = d > 21 ? 'Training hard, feeling strong.' : 'Tired, legs heavy, sleep is off.';
      } else if (a.kind === 'improving') {
        mood = d > 28 ? 3 : d > 14 ? 4 : 5;            // rising over the last ~4 weeks
        text = 'Working on my game — feeling steadier.';
      } else {
        mood = Math.random() < 0.15 ? 3 : 4;           // steady ~4 with a little honest noise
        text = 'Normal week, all good.';
      }
      checkin(a, dAgo(d), mood, text);
    }

    // Overload athlete: a training-load metric — steady for months, rising recently.
    if (a.kind === 'overload') {
      for (let d = 126; d >= 0; d -= 7) {
        const load = d > 28
          ? Math.round(48 + Math.random() * 6)                          // ~50 baseline for months
          : Math.round(55 + ((28 - d) / 28) * 40 + Math.random() * 4);  // → ~95 in the last 4 weeks
        pushSig(a.id, coachId, 'metric', dAgo(d), load, null, 'Training Load', 'normal');
      }
    }
  });

  orgGroups[CODE] = [{
    id: 'grp_' + rid(), name: 'Varsity Squad', description: 'First team',
    memberIds: athletes.map(a => a.id), leadIds: [coachId],
    goals: ['Reach the regional final', 'Everyone healthy at season end'],
    traits: ['Discipline', 'Team-first'], copilotEnabled: false, createdAt: iso(dAgo(200)),
  }];
  const rootId = 'demo_programme', teamId = 'demo_varsity';
  orgNodes[CODE][rootId] = { nodeId: rootId, name: 'Demo Athletic Club', parentId: null,
    childNodeIds: [teamId], memberIds: [], leaderIds: [coachId], rev: 0 };
  orgNodes[CODE][teamId] = { nodeId: teamId, name: 'Varsity Squad', parentId: rootId,
    childNodeIds: [], memberIds: athletes.map(a => a.id), leaderIds: [coachId], rev: 0 };
  orgUsers[CODE][coachId].leadershipNodeIds = [rootId, teamId];
  orgUsers[CODE][coachId].assignedNodeIds = [teamId];
  athletes.forEach(a => { orgUsers[CODE][a.id].assignedNodeIds = [teamId]; orgUsers[CODE][a.id].leadershipNodeIds = []; });

  const store = { orgMeta, orgUsers, emailIndex, orgNodes, memberGoals, memberCheckins, orgSignals, orgGroups, orgValues, orgGoals };
  extendSeedTeamSurface(store, { code: CODE, coachId, memberIds: athletes.map(a => a.id), teamId });
  return store;
}

/* ── COMPANY demo — the SAME kernel, a business domain ──────────────────────
   Proves domain-agnosticism: identical arc shapes as the athletic squad, but
   framed as a startup. The kernel should fire the same patterns (withdrawal,
   overload, quiet_improvement, baseline_shift) with zero code changes — only the
   vocabulary differs. "Workload" maps to the same LOAD primitive as "Training
   Load", so overload still fires. Self-contained; leaves the athletic seed intact. */
const COMPANY_CODE = 'demo-company';

async function buildCompanyDemoStore() {
  const pass = await bcrypt.hash('demo1234', SALT);
  const C    = COMPANY_CODE;
  const ck   = uid => `${C}:${uid}`;

  const bossId = rid();
  const staff = [
    { key: 'nadia',  name: 'Nadia Okoro',    title: 'Engineer',     kind: 'quiet'     },
    { key: 'marcus', name: 'Marcus Feld',    title: 'Engineer',     kind: 'overload'  },
    { key: 'lena',   name: 'Lena Park',      title: 'Designer',     kind: 'improving' },
    { key: 'raj',    name: 'Raj Malhotra',   title: 'PM',           kind: 'steady'    },
    { key: 'tomas',  name: 'Tomas Vidal',    title: 'Engineer',     kind: 'steady'    },
    { key: 'aisha',  name: 'Aisha Rahman',   title: 'Data',         kind: 'steady'    },
  ].map(s => ({ ...s, id: rid(), email: `${s.key}@atlas.demo` }));

  const orgMeta = {}, orgUsers = { [C]: {} }, emailIndex = {};
  const memberGoals = {}, memberCheckins = {}, orgSignals = { [C]: [] };
  const orgGroups = {}, orgValues = {}, orgGoals = {};

  orgMeta[C] = {
    orgName: 'Atlas Robotics', orgMode: '', createdAt: iso(dAgo(210)),
    organizationProfile: {
      description: 'An early-stage robotics startup shipping fast.',
      values: ['Ownership', 'Craft', 'Candour', 'Momentum'],
      goals: ['Ship the v2 launch', 'Keep the team healthy through crunch'],
      successDefinition: 'People who do their best work and stay well.',
      behaviours: ['Ships', 'Unblocks others', 'Communicates honestly'],
      metrics: ['Workload', 'Wellbeing'], setAt: iso(dAgo(205)), setBy: bossId,
    },
    organizationProfileComplete: true,
  };
  orgValues[C] = ['Ownership', 'Craft', 'Candour', 'Momentum'];
  orgGoals[C]  = [
    { goalId: 'g_' + rid(), text: 'Ship the v2 launch', createdAt: iso(dAgo(205)) },
    { goalId: 'g_' + rid(), text: 'Keep the team healthy through crunch', createdAt: iso(dAgo(205)) },
  ];

  orgUsers[C][bossId] = {
    id: bossId, firstName: 'Dana', lastName: 'Cole', name: 'Dana Cole',
    email: 'manager@atlas.demo', role: 'superadmin', orgCode: C, supervisorId: null,
    passwordHash: pass, passwordSet: true, status: 'active', createdAt: iso(dAgo(210)),
    levelId: 1, profileComplete: true,
  };
  emailIndex['manager@atlas.demo'] = { orgCode: C, userId: bossId };

  const pushSig = (subjectId, createdBy, source, dt, valueNum, valueText, label, sensitivity) =>
    orgSignals[C].push({
      id: 'sig_' + rid(), orgCode: C, ts: iso(dt), source, modality: 'text',
      subjectType: 'member', subjectId, category: null,
      label: label || (valueNum != null ? `Mood ${valueNum}/5` : null),
      valueNum: valueNum != null ? Number(valueNum) : null, valueText: valueText || null,
      data: null, sensitivity: sensitivity || 'normal', public: false,
      weightNum: source === 'metric' ? 3 : 2, weight: source === 'metric' ? 'strong' : 'medium',
      createdBy, createdAt: iso(dt),
    });

  const checkin = (s, dt, mood, text) => {
    const k = ck(s.id);
    (memberCheckins[k] = memberCheckins[k] || []).push({
      memberName: s.name, text, mood, moodLabel: MOODLBL[mood] || null,
      role: 'member', orgMode: '', date: dstr(dt), ts: iso(dt),
    });
    pushSig(s.id, s.id, 'checkin', dt, mood, text, `Mood ${mood}/5`, 'sensitive');
  };

  staff.forEach(s => {
    orgUsers[C][s.id] = {
      id: s.id, firstName: s.name.split(' ')[0], lastName: s.name.split(' ')[1] || '',
      name: s.name, email: s.email, role: 'member', orgCode: C, supervisorId: bossId,
      passwordHash: pass, passwordSet: true, status: 'active', createdAt: iso(dAgo(200)),
      levelId: 2, profileComplete: true,
    };
    emailIndex[s.email] = { orgCode: C, userId: s.id };
    memberGoals[ck(s.id)] = {
      goal: `Grow as a ${s.title} and be dependable for the team`,
      mainGoals: `Grow as a ${s.title}`, identity: 'A dependable teammate',
      selectedValues: ['Ownership', 'Craft', 'Candour'], personalMetrics: [],
      memberName: s.name, setAt: iso(dAgo(195)),
    };

    for (let d = 182; d >= 0; d -= (2 + Math.floor(Math.random() * 3))) {
      let mood, text;
      if (s.kind === 'quiet') {
        if (d <= 9) continue;                          // went quiet ~9 days ago
        mood = d <= 18 ? 2 : 4;
        text = d <= 18 ? 'Bit checked out lately, hard to focus.' : 'Shipped my tickets, solid week.';
      } else if (s.kind === 'overload') {
        mood = d > 21 ? 4 : d > 10 ? 3 : 2;
        text = d > 21 ? 'Busy but on top of it.' : 'Swamped — working nights, running on empty.';
      } else if (s.kind === 'improving') {
        mood = d > 28 ? 3 : d > 14 ? 4 : 5;
        text = 'Finding my groove — reviews going well.';
      } else {
        mood = Math.random() < 0.15 ? 3 : 4;
        text = 'Normal sprint, nothing unusual.';
      }
      checkin(s, dAgo(d), mood, text);
    }

    // Overload employee: a WORKLOAD metric — steady for months, rising recently.
    // "Workload" maps to the same LOAD primitive as "Training Load" → overload fires.
    if (s.kind === 'overload') {
      for (let d = 126; d >= 0; d -= 7) {
        const load = d > 28
          ? Math.round(45 + Math.random() * 6)
          : Math.round(52 + ((28 - d) / 28) * 42 + Math.random() * 4);
        pushSig(s.id, bossId, 'metric', dAgo(d), load, null, 'Workload', 'normal');
      }
    }
  });

  orgGroups[C] = [{
    id: 'grp_' + rid(), name: 'Product Team', description: 'Core build team',
    memberIds: staff.map(s => s.id), leadIds: [bossId],
    goals: ['Ship v2', 'Sustainable pace'], traits: ['Ownership', 'Candour'],
    copilotEnabled: false, createdAt: iso(dAgo(200)),
  }];

  return { orgMeta, orgUsers, emailIndex, memberGoals, memberCheckins, orgSignals, orgGroups, orgValues, orgGoals };
}

/* Merge a demo store slice into whatever's in `existing` (additive), unless
   SEED_REPLACE=1. Returns the store to persist. Pure — no DB. */
function mergeDemo(existing, demo, replace) {
  if (replace) return demo;
  const store = { ...existing };
  for (const [k, v] of Object.entries(demo)) store[k] = { ...(existing[k] || {}), ...v };
  return store;
}

const DEMO_CODE = CODE;

async function main() {
  await db.init();
  const demo = await buildDemoStore();
  const replace = process.env.SEED_REPLACE === '1';
  const existing = replace ? {} : await db.loadMain();
  await db.saveMain(mergeDemo(existing, demo, replace));

  const ck = Object.values(demo.memberCheckins).reduce((n, a) => n + a.length, 0);
  console.log(replace ? '  (SEED_REPLACE=1 — overwrote the entire store)' : '  (additive merge — existing orgs preserved)');
  console.log('');
  console.log(`✓ Seeded demo squad · ${ck} check-ins · ${demo.orgSignals[CODE].length} signals`);
  console.log('  Log in (password demo1234): coach@demo.club · maya@demo.club (deshawn/priya/jordan/sam/chris @demo.club)');
  console.log('');
  process.exit(0);
}

module.exports = { buildDemoStore, buildCompanyDemoStore, extendSeedTeamSurface, mergeDemo, DEMO_CODE, COMPANY_CODE };

if (require.main === module) main().catch(err => { console.error('[seed] failed:', err); process.exit(1); });
