/* ============================================================
   PLATFORM — DATA LAYER
   Mock data for all org types, members, metrics, alerts
   ============================================================ */

const COLORS = ['#4f8ef7','#7c5af5','#0ecfb0','#f7b24f','#f74f7a','#4ff77a','#f74f4f','#b24ff7','#4fb8f7','#f7e44f'];

const ORG_MODES = {
  school:     { label:'School',      icon:'🎓', color:'#4f8ef7', metrics:['Academic','Behavior','Moral IQ','Wellness','Engagement','Teacher Rating'] },
  sports:     { label:'Sports Club', icon:'⚽', color:'#f74f7a', metrics:['Tactical IQ','Fitness','Readiness','Consistency','Coachability','Mental'] },
  workplace:  { label:'Workplace',   icon:'🏢', color:'#4ff7b2', metrics:['Performance','Leadership','Engagement','Values Fit','Teamwork','Initiative'] },
  military:   { label:'Military',    icon:'🎖️', color:'#f7c44f', metrics:['Tactical IQ','Discipline','Ethics','Stress IQ','Fitness','Command'] },
  healthcare: { label:'Healthcare',  icon:'🏥', color:'#b24ff7', metrics:['Triage Perf','Ethics','Patient Int.','Decision IQ','Accuracy','Empathy'] },
  government: { label:'Government',  icon:'🏛️', color:'#4fb8f7', metrics:['Decision IQ','Crisis Mgmt','Leadership','Compliance','Public Svc','Integrity'] },
};

const PLATFORM_GRADES = {
  A: { label:'A-Grade', features:['Full IntelliQ','Real-time monitoring','Behavioral trend analysis','Wellness alerts','AI development plans','External data integration','Mandated reporter tools','Advanced analytics','Complete security'] },
  B: { label:'B-Grade', features:['Performance tracking','Basic IntelliQ','Limited dashboards','Limited reporting'] },
  C: { label:'C-Grade', features:['Simple monitoring','Basic evaluation','Minimal AI','No advanced analytics'] },
};

function rnd(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }
function rndFloat(min,max,d=1){ return parseFloat((Math.random()*(max-min)+min).toFixed(d)); }
function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

const FIRST_NAMES = ['James','Emma','Liam','Olivia','Noah','Ava','William','Sophia','Benjamin','Isabella','Lucas','Mia','Henry','Charlotte','Alexander','Amelia','Daniel','Harper','Michael','Evelyn','Tatenda','Chidi','Aisha','Yuki','Diego','Priya','Andre','Fatima','Kofi','Mei'];
const LAST_NAMES  = ['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Wilson','Anderson','Taylor','Thomas','Moore','Martin','Jackson','Thompson','White','Harris','Lewis','Robinson','Moyo','Okafor','Nakamura','Rivera','Sharma','Mensah','Singh','Diallo','Chen','Mbeki'];
const ROLES = {
  school:    ['Student','Student','Student','Class Rep','Prefect'],
  sports:    ['Forward','Midfielder','Defender','Goalkeeper','Captain','Sub'],
  workplace: ['Analyst','Senior Analyst','Manager','Team Lead','Executive','Associate'],
  military:  ['Recruit','Cadet','Corporal','Sergeant','Lieutenant','Commander'],
  healthcare:['Nurse','Doctor','Specialist','Resident','Consultant','Technician'],
  government:['Officer','Senior Officer','Director','Deputy Director','Minister','Advisor'],
};
const GROUPS = {
  school:    ['Class 10A','Class 10B','Class 11A','Class 11B','Class 12A'],
  sports:    ['First Team','Reserve Team','U21 Squad','Academy','Coaching Staff'],
  workplace: ['Engineering','Marketing','Finance','Operations','HR','Product'],
  military:  ['Alpha Squad','Bravo Squad','Charlie Company','HQ Unit','Special Ops'],
  healthcare:['Ward A','Ward B','ICU','ER','Outpatient','Surgery'],
  government:['Public Affairs','Policy','Finance','Legal','Operations','Intelligence'],
};

function generateMembers(mode, count=24){
  const metrics = ORG_MODES[mode].metrics;
  return Array.from({length:count}, (_,i) => {
    const fn = pick(FIRST_NAMES), ln = pick(LAST_NAMES);
    const scores = {};
    metrics.forEach(m => { scores[m] = rnd(45,98); });
    const iqScore = rnd(48,99);
    return {
      id: i+1,
      name: `${fn} ${ln}`,
      initials: fn[0]+ln[0],
      role: pick(ROLES[mode]),
      group: pick(GROUPS[mode]),
      color: COLORS[i % COLORS.length],
      iqScore,
      iqGrade: iqScore >= 80 ? 'A' : iqScore >= 60 ? 'B' : 'C',
      scores,
      overall: Math.round(Object.values(scores).reduce((a,b)=>a+b,0)/metrics.length),
      wellnessScore: rnd(30,100),
      streak: rnd(0,30),
      alerts: rnd(0,3),
      lastActive: pick(['Today','Yesterday','2 days ago','3 days ago','1 week ago']),
      trend: pick(['up','up','up','down','stable']),
      trendVal: rnd(1,12),
      history: Array.from({length:12}, () => rnd(50,98)),
      joinDate: `${pick(['Jan','Feb','Mar','Apr','Sep','Oct'])} ${rnd(2020,2024)}`,
      notes: pick([
        'Shows strong leadership potential. Consistent performer.',
        'Needs additional support in core areas. Recommend mentoring.',
        'Exceptional performer. Ready for advanced program.',
        'Slight decline observed. Environmental factors flagged.',
        'High potential. Some behavioral flags to monitor.',
        'Well-rounded individual. Meeting all benchmarks.',
      ]),
      devPlan: [
        { text: 'Complete advanced module assessment', done: Math.random()>0.5 },
        { text: 'Weekly check-in with supervisor', done: Math.random()>0.5 },
        { text: 'Peer collaboration exercise', done: Math.random()>0.3 },
        { text: 'Wellness and mindfulness session', done: Math.random()>0.6 },
      ],
      coachInputs:     [],
      externalData:    [],
      scenarioResults: [],
      chatHistory:     [],
    };
  });
}

function generateAlerts(mode, members){
  const types = [
    { type:'warning', title:'Performance Drop', detail:(m)=>`${m.name} showed a ${rnd(8,22)}% decline this week.` },
    { type:'danger',  title:'Wellness Alert',   detail:(m)=>`${m.name}'s wellness score is critically low (${rnd(15,29)}).` },
    { type:'success', title:'Milestone Reached',detail:(m)=>`${m.name} achieved a new personal best.` },
    { type:'info',    title:'New Assessment',   detail:(m)=>`${m.name} completed IntelliQ evaluation.` },
    { type:'warning', title:'Attendance Flag',  detail:(m)=>`${m.name} has missed ${rnd(2,5)} sessions.` },
    { type:'danger',  title:'Behavioral Flag',  detail:(m)=>`Unusual behavior pattern detected for ${m.name}.` },
    { type:'success', title:'Goal Completed',   detail:(m)=>`${m.name} completed all development plan tasks.` },
    { type:'info',    title:'Report Ready',     detail:(m)=>`Monthly IntelliQ report for ${m.name} is ready.` },
  ];
  const times = ['2 min ago','8 min ago','34 min ago','1h ago','2h ago','5h ago','Yesterday','2 days ago'];
  return Array.from({length:18}, () => {
    const m = pick(members);
    const t = pick(types);
    return { ...t, detail: t.detail(m), time: pick(times), unread: Math.random()>0.5, member: m };
  });
}

function generateOrgStats(mode, members){
  const avg = arr => Math.round(arr.reduce((a,b)=>a+b,0)/arr.length);
  return {
    totalMembers: members.length,
    avgIQ: avg(members.map(m=>m.iqScore)),
    avgWellness: avg(members.map(m=>m.wellnessScore)),
    avgOverall: avg(members.map(m=>m.overall)),
    topPerformer: members.reduce((a,b) => a.overall>b.overall?a:b),
    atRisk: members.filter(m=>m.wellnessScore<50 || m.overall<55).length,
    improving: members.filter(m=>m.trend==='up').length,
    alerts: members.reduce((s,m)=>s+m.alerts,0),
  };
}

function generatePerformanceHistory(months=12){
  let base = rndFloat(60,75);
  return Array.from({length:months}, (_,i) => {
    base += rndFloat(-5,7);
    base = Math.max(40, Math.min(98, base));
    return parseFloat(base.toFixed(1));
  });
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Session-level app state
const AppState = {
  mode: 'school',
  grade: 'A',
  orgName: 'Westfield Academy',
  adminName: 'Dr. A. Moyo',
  adminRole: 'Head of Performance',
  members: [],
  alerts: [],
  stats: {},
  scenarios: [],
  currentMemberId: null,
  currentPage: 'dashboard',
  currentGroup: 'All',

  // Org-defined hierarchy — labels are fully customisable
  // level 1 = top of org, higher numbers = further down
  orgLevels: [
    { id: 1, label: 'Head Coach',       canSeeBelow: true },
    { id: 2, label: 'Assistant Coach',  canSeeBelow: true },
    { id: 3, label: 'Support Staff',    canSeeBelow: false },
    { id: 4, label: 'Player / Member',  canSeeBelow: false },
  ],

  init(mode, orgName, adminName, grade='A'){
    this.mode = mode;
    this.orgName = orgName;
    this.adminName = adminName;
    this.grade = grade;
    this.members = generateMembers(mode, 24);
    this.alerts = generateAlerts(mode, this.members);
    this.stats = generateOrgStats(mode, this.members);
    this.perfHistory = generatePerformanceHistory(12);
    this.scenarios = [];
    // Assign random levels to members for demo
    this.members.forEach((m, i) => {
      m.levelId = i < 2 ? 2 : i < 6 ? 3 : 4;
      m.supervisorId = i < 2 ? null : (i % 2 === 0 ? 1 : 2);
    });
  },

  getGroups(){
    return ['All', ...new Set(this.members.map(m=>m.group))];
  },

  getFilteredMembers(group='All', search=''){
    let list = this.members;
    if(group !== 'All') list = list.filter(m=>m.group===group);
    if(search) list = list.filter(m=>m.name.toLowerCase().includes(search.toLowerCase()) || m.role.toLowerCase().includes(search.toLowerCase()));
    return list;
  },

  getMember(id){
    return this.members.find(m=>m.id===id);
  },

  getUnreadAlertCount(){
    return this.alerts.filter(a=>a.unread).length;
  },

  getLevelLabel(levelId) {
    const l = this.orgLevels.find(l => l.id === levelId);
    return l ? l.label : 'Member';
  },

  /* ── PROACTIVE HEALTH CHECK ───────────────────────────────
     Scans the org and generates early-warning alerts.
     Called on load and after each scenario completion.
     Catches problems while there is still a window to act.
  ──────────────────────────────────────────────────────── */
  runHealthCheck() {
    const newAlerts = [];

    this.members.forEach(m => {
      const firstName = m.name.split(' ')[0];
      const results   = m.scenarioResults || [];

      // ── 1. Score drift (slow decline, not a crash yet) ──
      if (results.length >= 3) {
        const last3 = results.slice(-3).map(r => r.score);
        const isDrifting = last3[2] < last3[1] && last3[1] < last3[0] && (last3[0] - last3[2]) >= 8;
        if (isDrifting) {
          newAlerts.push({
            type:           'warning',
            alertKind:      'score_drift',
            title:          'Score Drifting Down',
            detail:         `${m.name}'s last 3 scenario scores: ${last3[0]} → ${last3[1]} → ${last3[2]}. Gradual decline — early window to act.`,
            time:           'Just now',
            unread:         true,
            member:         m,
            memberId:       m.id,
            proactive:      true,
            suggestedBrief: `${firstName} has been slowly declining across three scenarios (${last3.join(' → ')}). Nothing critical yet but I want to understand the pattern and run a targeted check-in before it gets worse.`,
          });
        }
      }

      // ── 2. Wellness dropping silently ──
      if (m.wellnessScore < 45 && m.overall >= 60) {
        const alreadyFlagged = this.alerts.some(a => a.alertKind === 'silent_wellness' && a.memberId === m.id);
        if (!alreadyFlagged) {
          newAlerts.push({
            type:           'warning',
            alertKind:      'silent_wellness',
            title:          'Wellness Quietly Dropping',
            detail:         `${m.name} — performance looks fine (${m.overall}) but wellness is at ${m.wellnessScore}. Often a leading indicator.`,
            time:           'Just now',
            unread:         true,
            member:         m,
            memberId:       m.id,
            proactive:      true,
            suggestedBrief: `${firstName}'s performance numbers look fine but their wellness score has dropped to ${m.wellnessScore}. I want to run a scenario that naturally opens a conversation — not a confrontation, just a check-in.`,
          });
        }
      }

      // ── 3. Persistent weakness in one dimension ──
      if (results.length >= 2) {
        const dims = ['ethical_reasoning','stakeholder_awareness','pressure_response','self_awareness'];
        dims.forEach(dim => {
          const vals = results.map(r => r.dimensions?.[dim]).filter(v => v != null);
          if (vals.length >= 2) {
            const avg = Math.round(vals.reduce((s,v) => s+v, 0) / vals.length);
            if (avg < 55) {
              newAlerts.push({
                type:           'info',
                alertKind:      'weak_dimension',
                title:          'Consistent Weakness Detected',
                detail:         `${m.name} consistently scores low on ${dim.replace(/_/g,' ')} (avg ${avg} across ${vals.length} scenarios).`,
                time:           'Just now',
                unread:         true,
                member:         m,
                memberId:       m.id,
                proactive:      true,
                weakDimension:  dim,
                suggestedBrief: `${firstName} keeps scoring low on ${dim.replace(/_/g,' ')} (avg ${avg}). I want to run a scenario specifically designed to develop this area.`,
              });
            }
          }
        });
      }
    });

    // ── 4. Unacknowledged flags (nobody acted on a flagged member) ──
    const oldFlags = this.alerts.filter(a =>
      (a.type === 'danger' || a.type === 'warning') &&
      a.memberId &&
      !a.responded &&
      a.time !== 'Just now'
    );
    // Group by member — if same member has 2+ unresponded flags, surface it
    const flagCounts = {};
    oldFlags.forEach(a => { flagCounts[a.memberId] = (flagCounts[a.memberId] || 0) + 1; });
    Object.entries(flagCounts).forEach(([mid, count]) => {
      if (count >= 2) {
        const m = this.getMember(parseInt(mid));
        if (!m) return;
        const alreadyNoted = newAlerts.some(a => a.alertKind === 'no_action' && a.memberId === m.id);
        if (!alreadyNoted) {
          newAlerts.push({
            type:           'danger',
            alertKind:      'no_action',
            title:          'No Action Taken',
            detail:         `${m.name} has been flagged ${count} times with no coaching response recorded. IntelliQ is escalating.`,
            time:           'Just now',
            unread:         true,
            member:         m,
            memberId:       m.id,
            proactive:      true,
            suggestedBrief: `${m.name.split(' ')[0]} has been flagged ${count} times with no follow-up. I need to assess where things stand and decide on an action.`,
          });
        }
      }
    });

    // Add new alerts to front of list (avoid duplicates of same kind+member within last 5 alerts)
    newAlerts.forEach(na => {
      const isDup = this.alerts.slice(0,5).some(
        a => a.alertKind === na.alertKind && a.memberId === na.memberId
      );
      if (!isDup) this.alerts.unshift(na);
    });

    if (newAlerts.length) {
      if (typeof updateAlertBadge === 'function') updateAlertBadge();
    }

    return newAlerts.length;
  },

  // Called after every scenario completion (result already stored by ScenarioEngine)
  recordScenarioResult(memberId, result) {
    this.runHealthCheck();
  },
};
