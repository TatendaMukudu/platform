/* ============================================================
   scripts/seed.js — stand up a realistic demo squad

   Writes a complete demo org straight into the store (via db.saveMain) with ~6
   weeks of back-dated check-ins + signals, engineered so the kernel produces a
   real, varied briefing on first open — not empty screens.

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

async function main() {
  await db.init();
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
    orgName: 'Demo Athletic Club', orgMode: '', createdAt: iso(dAgo(60)),
    organizationProfile: {
      description: 'A club focused on athlete development and wellbeing.',
      values: ['Consistency', 'Effort', 'Team-first', 'Honesty'],
      goals: ['Develop every athlete', 'Keep athletes healthy and engaged'],
      successDefinition: 'Athletes who grow and stay well.',
      behaviours: ['Shows up', 'Supports teammates', 'Reflects honestly'],
      metrics: ['Training Load', 'Wellbeing'], setAt: iso(dAgo(58)), setBy: coachId,
    },
    organizationProfileComplete: true,
  };
  orgValues[CODE] = ['Consistency', 'Effort', 'Team-first', 'Honesty'];
  orgGoals[CODE]  = [
    { goalId: 'g_' + rid(), text: 'Develop every athlete', createdAt: iso(dAgo(58)) },
    { goalId: 'g_' + rid(), text: 'Keep athletes healthy and engaged', createdAt: iso(dAgo(58)) },
  ];

  orgUsers[CODE][coachId] = {
    id: coachId, firstName: 'Alex', lastName: 'Rivera', name: 'Alex Rivera',
    email: 'coach@demo.club', role: 'superadmin', orgCode: CODE, supervisorId: null,
    passwordHash: pass, passwordSet: true, status: 'active', createdAt: iso(dAgo(60)),
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
      passwordHash: pass, passwordSet: true, status: 'active', createdAt: iso(dAgo(50)),
      levelId: 2, profileComplete: true,
    };
    emailIndex[a.email] = { orgCode: CODE, userId: a.id };
    memberGoals[ukey(a.id)] = {
      goal: `Grow as a ${a.pos.toLowerCase()} and be dependable for the squad`,
      mainGoals: `Grow as a ${a.pos.toLowerCase()}`, identity: 'A dependable teammate',
      selectedValues: ['Consistency', 'Effort', 'Team-first'], personalMetrics: [],
      memberName: a.name, setAt: iso(dAgo(45)),
    };

    // ~6 weeks of check-ins, shaped per story. day 42 → recent.
    for (let d = 42; d >= 0; d -= 3) {
      let mood, text;
      if (a.kind === 'quiet') {
        // strong + frequent early, then goes quiet (~last 9 days: nothing).
        if (d <= 9) continue;
        mood = d <= 14 ? 2 : 4;
        text = d <= 14 ? 'Bit flat this week.' : 'Good session, felt sharp.';
      } else if (a.kind === 'overload') {
        mood = d > 28 ? 4 : d > 14 ? 3 : 2;   // steady → dipping
        text = d > 14 ? 'Training hard.' : 'Tired, legs heavy, not sleeping great.';
      } else if (a.kind === 'improving') {
        mood = d > 28 ? 3 : d > 14 ? 4 : 5;   // rising
        text = 'Working on my game, feeling steadier.';
      } else {
        mood = 4; text = 'All good, normal week.';
      }
      checkin(a, dAgo(d + Math.floor(Math.random() * 2)), mood, text);
    }

    // Overload athlete: rising training-load metric (coach-logged, primitive=load).
    if (a.kind === 'overload') {
      for (let i = 8; i >= 0; i--) {
        const d = i * 5;                       // ~every 5 days, 40 days back
        const load = Math.round(45 + (8 - i) * 6 + Math.random() * 4); // 45 → ~95
        pushSig(a.id, coachId, 'metric', dAgo(d), load, null, 'Training Load', 'normal');
      }
    }
  });

  orgGroups[CODE] = [{
    id: 'grp_' + rid(), name: 'Varsity Squad', description: 'First team',
    memberIds: athletes.map(a => a.id), leadIds: [coachId],
    goals: ['Reach the regional final', 'Everyone healthy at season end'],
    traits: ['Discipline', 'Team-first'], copilotEnabled: false, createdAt: iso(dAgo(50)),
  }];

  const store = { orgMeta, orgUsers, emailIndex, memberGoals, memberCheckins, orgSignals, orgGroups, orgValues, orgGoals };
  await db.saveMain(store);

  const ckCount = Object.values(memberCheckins).reduce((n, a) => n + a.length, 0);
  console.log('');
  console.log('✓ Seeded demo squad into the store.');
  console.log(`  org: Demo Athletic Club (${CODE})`);
  console.log(`  1 coach + ${athletes.length} athletes · ${ckCount} check-ins · ${orgSignals[CODE].length} signals`);
  console.log('');
  console.log('  Log in (password for all: demo1234):');
  console.log('    Coach   → coach@demo.club');
  console.log('    Athlete → maya@demo.club  (deshawn / priya / jordan / sam / chris @demo.club)');
  console.log('');
  process.exit(0);
}

main().catch(err => { console.error('[seed] failed:', err); process.exit(1); });
