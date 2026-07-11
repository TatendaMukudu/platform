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
async function buildDemoStore() {
  const pass = await bcrypt.hash('demo1234', SALT);

  const coachId = rid();
  const athletes = [
    { key: 'maya',    name: 'Maya Chen',     pos: 'Midfield', kind: 'quiet'     },
    { key: 'deshawn', name: 'Deshawn Ellis', pos: 'Forward',  kind: 'overload'  },
    { key: 'priya',   name: 'Priya Anand',   pos: 'Defense',  kind: 'improving' },
    { key: 'jordan',  name: 'Jordan Lee',    pos: 'Keeper',   kind: 'steady'    },
    { key: 'sam',     name: 'Sam Fox',       pos: 'Wing',     kind: 'steady'    },
    { key: 'chris',   name: 'Chris Obi',     pos: 'Center',   kind: 'steady'    },
  ].map(a => ({ ...a, id: rid(), email: `${a.key}@demo.club` }));

  // ── stores ────────────────────────────────────────────────────────────────
  const orgMeta = {}, orgUsers = { [CODE]: {} }, emailIndex = {};
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

module.exports = { buildDemoStore, mergeDemo, DEMO_CODE };

if (require.main === module) main().catch(err => { console.error('[seed] failed:', err); process.exit(1); });
