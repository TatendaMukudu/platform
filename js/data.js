/* ============================================================
   PLATFORM — DATA LAYER
   Static config, mode definitions, and org AppState.
   All member data is real — loaded via loadRealOrgData() after login.
   ============================================================ */

const COLORS = ['#4f8ef7','#7c5af5','#0ecfb0','#f7b24f','#f74f7a','#4ff77a','#f74f4f','#b24ff7','#4fb8f7','#f7e44f'];

/* ── Icon set — monochrome line icons (inherit currentColor) ───────────────
   One consistent stroke-based family instead of coloured emoji, so the chrome
   reads like a professional product. Used in nav and headings. */
const _svg = inner => `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
const ICON = {
  home:     _svg('<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/>'),
  checkin:  _svg('<path d="M21 14.5a2 2 0 0 1-2 2H8l-4 3.5V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z"/>'),
  notes:    _svg('<path d="M15 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M8 13h8M8 17h5"/>'),
  inbox:    _svg('<path d="M4 13h4l2 3h4l2-3h4"/><path d="M5 5h14l2.5 8v5a2 2 0 0 1-2 2H4.5a2 2 0 0 1-2-2v-5z"/>'),
  people:   _svg('<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16.5 5.3a3.2 3.2 0 0 1 0 6.4M21 20a6 6 0 0 0-3.8-5.6"/>'),
  person:   _svg('<circle cx="12" cy="8" r="3.5"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/>'),
  building: _svg('<path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16"/><path d="M14 9h4a2 2 0 0 1 2 2v10"/><path d="M8 7h2M8 11h2M8 15h2M3 21h18"/>'),
  settings: _svg('<path d="M4 21v-6M4 11V3M12 21v-8M12 9V3M20 21v-4M20 13V3"/><path d="M2 15h4M10 9h4M18 17h4"/>'),
  bell:     _svg('<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>'),
  search:   _svg('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>'),
  plus:     _svg('<path d="M12 5v14M5 12h14"/>'),
  message:  _svg('<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-4-.9L3 21l1.9-4.9A8.4 8.4 0 1 1 21 11.5z"/>'),
  spark:    _svg('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.5 2.5M15.2 15.2l2.5 2.5M17.7 6.3l-2.5 2.5M8.8 15.2l-2.5 2.5"/>'),
  clipboard:_svg('<path d="M9 4h6a1 1 0 0 1 1 1v1h1a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h1V5a1 1 0 0 1 1-1z"/><path d="M9 4a1 1 0 0 0-1 1v1h8V5a1 1 0 0 0-1-1"/><path d="m9 14 2 2 4-4"/>'),
  plug:     _svg('<path d="M9 2v6M15 2v6"/><path d="M7 8h10v3a5 5 0 0 1-10 0z"/><path d="M12 16v6"/>'),
};

/* ── Org mode display config ──────────────────────────────────────────────
   orgMode is kept as optional AI/reporting context only (Option B).
   Do NOT use for metrics, hierarchy, permissions, or UI branching.
   Metrics are defined per-org in the Metrics settings, not here.
─────────────────────────────────────────────────────────────────────────── */
const ORG_MODES = {
  school:     { label:'School',      icon:'', color:'#4f8ef7' },
  sports:     { label:'Sports Club', icon:'', color:'#f74f7a' },
  workplace:  { label:'Workplace',   icon:'', color:'#4ff7b2' },
  military:   { label:'Military',    icon:'', color:'#f7c44f' },
  healthcare: { label:'Healthcare',  icon:'', color:'#b24ff7' },
  government: { label:'Government',  icon:'', color:'#4fb8f7' },
};

const PLATFORM_GRADES = {
  A: { label:'A-Grade', features:['Full IntelliQ','Real-time monitoring','Behavioral trend analysis','Wellness alerts','AI development plans','External data integration','Mandated reporter tools','Advanced analytics','Complete security'] },
  B: { label:'B-Grade', features:['Performance tracking','Basic IntelliQ','Limited dashboards','Limited reporting'] },
  C: { label:'C-Grade', features:['Simple monitoring','Basic evaluation','Minimal AI','No advanced analytics'] },
};

/* ── Utility functions ────────────────────────────────────── */
function rnd(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }
function rndFloat(min,max,d=1){ return parseFloat((Math.random()*(max-min)+min).toFixed(d)); }
function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Sample data generators removed in Sprint 2.
// All member data is real — loaded via loadRealOrgData() from server.

/* ── Real-user member record constructor ─────────────────────
   Used when mirroring server users into AppState.members.
   All score fields start null — filled in as the member
   completes assessments and check-ins.
─────────────────────────────────────────────────────────────── */
function buildRealMemberRecord(authUser, index, _modeIgnored) {
  // mode argument ignored — metrics are org-defined, loaded separately
  const scores = {};  // populated when org metrics load
  const name = authUser.name || '';
  const parts = name.trim().split(/\s+/);
  return {
    id:           authUser.id || (index + 1),
    userId:       authUser.id,
    name,
    initials:     parts.map(p => p[0]).join('').slice(0, 2).toUpperCase(),
    role:         authUser.role || 'member',
    group:        authUser.group || authUser.department || '',
    color:        COLORS[index % COLORS.length],
    iqScore:      null,
    iqGrade:      null,
    scores,
    overall:      null,
    wellnessScore:null,
    streak:       0,
    alerts:       0,
    lastActive:   null,
    trend:        'stable',
    trendVal:     0,
    history:      [],
    joinDate:     authUser.createdAt ? new Date(authUser.createdAt).toLocaleDateString('en-GB') : '',
    notes:        '',
    devPlan:      [{ text: 'Complete onboarding', done: false }],
    coachInputs:  [], externalData: [], scenarioResults: [], chatHistory: [],
    authId:       authUser.id,
    email:        authUser.email        || '',
    passwordSet:  authUser.passwordSet  !== false,  // false = pending setup
    isSampleData: false,
  };
}

/* ── Empty real org stats (used when members have no score data) */
function buildEmptyOrgStats(memberCount) {
  return {
    totalMembers: memberCount,
    avgIQ:        null,
    avgWellness:  null,
    avgOverall:   null,
    topPerformer: null,
    atRisk:       0,
    improving:    0,
    alerts:       0,
  };
}

/* ── Workspace modules — single source of truth for navigation ────────────
   Every module has: id (matches data-page / navigate() target), label,
   icon, section (used as nav group header), and permission (or null for
   always-visible items).  renderSidebar() filters this list by Auth.canDo()
   so no hardcoded role/type branching ever appears in nav HTML.
   ─────────────────────────────────────────────────────────────────────── */
// The simplified front door: Setup → Add → Home. Everything the app does is one
// of three things — set up once, put in, or get out. Items removed from this list
// are HIDDEN from nav only: their pages, routes, and backend are all intact and
// one line away from returning (see the "hidden" note at the end). Maneuverable
// by design — nothing is deleted, so nothing is dismally wrong.
const WORKSPACE_MODULES = [
  // ── My Space — EVERY user, leaders included. Their own proactive "Me" space
  //    (composer + what IntelliQ noticed about THEM). "Regardless of node." ──
  { section: 'My Space', id: 'home',    icon: ICON.home,    label: 'Me',     permission: null },
  // Check-In is folded into the Me composer (optional mood + "what happened?"),
  // so it's no longer a separate nav item. The page still exists and is reachable.
  // Notes now live INSIDE the Me space (no separate tab) — the page stays
  // reachable for full options (tags / sharing) via navigate('notes').
  { section: null,        id: 'assessments', icon: ICON.clipboard, label: 'Assessments', permission: null },
  { section: null,        id: 'apps',    icon: ICON.plug,    label: 'Apps',     permission: null },
  // Inbox demoted from the main nav — IntelliQ is the intelligence layer, not a
  // messaging app (Teams / Slack / email own comms). Proactive "updates from
  // IntelliQ" live in the Me space (noticed / prepared). The page stays reachable.

  // ── Team — shown when the user leads ≥1 node (scoped server-side) ───────
  { section: 'Team', id: 'leader-home',   icon: ICON.people, label: 'Team',      leaderOnly: true }, // the people they lead
  { section: null,    id: 'leader-people', icon: ICON.person, label: 'My People', leaderOnly: true },

  // ── Setup — admin / superadmin (people · org aims & values · settings) ──
  { section: 'Setup', id: 'people',       icon: ICON.person,   label: 'People',       permission: 'view_members'    },
  { section: null,     id: 'organisation', icon: ICON.building, label: 'Organisation', permission: 'view_team'       },
  { section: null,     id: 'settings',     icon: ICON.settings, label: 'Settings',     permission: 'manage_settings' },

  // ── Hidden from nav, fully reachable + backend intact (restore any line) ──
  //   assessments · stats · assignments · leader-groups · data-sources ·
  //   analytics · intelliq · scenarios · org-health · alerts · reports
  //   Their pages and data still work; outputs folded into Home/the briefing,
  //   inputs folded into Check-In/Notes.
];

/* ─────────────────────────────────────────────────────────────
   AppState — session-level state.
   members[] starts EMPTY. Populated by loadRealOrgData() after login.
   No sample data generators — all data is real.
───────────────────────────────────────────────────────────── */
const AppState = {
  mode:      'school',
  grade:     'A',
  orgName:   '',
  orgCode:   '',
  adminName: '',
  adminRole: '',
  members:   [],
  alerts:    [],
  stats:     {},
  scenarios: [],
  currentMemberId: null,
  currentPage:     'dashboard',
  currentGroup:    'All',
  orgDataLoaded:   false,   // true once loadRealOrgData() completes

  // Sprint 2: org-defined metrics and values (loaded async from server)
  orgMetrics: [],  // [{ metricId, name, source, order }]
  orgValues:  [],  // [string]

  init(mode, orgName, adminName, grade='A') {
    this.mode       = mode;
    this.orgName    = orgName;
    this.adminName  = adminName;
    this.grade      = grade;
    this.members    = [];          // always start empty — real data loaded async
    this.alerts     = [];
    this.stats      = buildEmptyOrgStats(0);
    this.perfHistory = [];
    this.scenarios  = [];
    this.orgMetrics = [];
    this.orgValues  = [];
    this.orgDataLoaded = false;
  },

  getGroups() {
    const groups = new Set(this.members.map(m => m.group).filter(Boolean));
    return ['All', ...groups];
  },

  getFilteredMembers(group='All', search='') {
    let list = this.members;
    if (group !== 'All') list = list.filter(m => m.group === group);
    if (search) list = list.filter(m =>
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.role.toLowerCase().includes(search.toLowerCase())
    );
    return list;
  },

  getMember(id) {
    // Support both numeric mock ids and string auth ids
    return this.members.find(m => m.id === id || m.userId === id || String(m.id) === String(id));
  },

  getUnreadAlertCount() {
    return this.alerts.filter(a => a.unread).length;
  },

  /* ── PROACTIVE HEALTH CHECK ───────────────────────────────
     Scans real members for scenario-based alerts.
     Only fires if members have actual scenario results.
  ──────────────────────────────────────────────────────── */
  runHealthCheck() {
    const newAlerts = [];

    this.members.forEach(m => {
      const firstName = m.name.split(' ')[0];
      const results   = m.scenarioResults || [];

      // 1. Score drift
      if (results.length >= 3) {
        const last3 = results.slice(-3).map(r => r.score);
        const isDrifting = last3[2] < last3[1] && last3[1] < last3[0] && (last3[0] - last3[2]) >= 8;
        if (isDrifting) {
          newAlerts.push({
            type: 'warning', alertKind: 'score_drift',
            title: 'Score Drifting Down',
            detail: `${m.name}'s last 3 scenario scores: ${last3[0]} → ${last3[1]} → ${last3[2]}. Gradual decline — early window to act.`,
            time: 'Just now', unread: true, member: m, memberId: m.id, proactive: true,
            suggestedBrief: `${firstName} has been slowly declining across three scenarios (${last3.join(' → ')}). Nothing critical yet but I want to understand the pattern and run a targeted check-in before it gets worse.`,
          });
        }
      }

      // 2. Wellness dropping silently (only if real data present)
      if (m.wellnessScore !== null && m.wellnessScore < 45 && m.overall !== null && m.overall >= 60) {
        const alreadyFlagged = this.alerts.some(a => a.alertKind === 'silent_wellness' && a.memberId === m.id);
        if (!alreadyFlagged) {
          newAlerts.push({
            type: 'warning', alertKind: 'silent_wellness',
            title: 'Wellness Quietly Dropping',
            detail: `${m.name} — performance looks fine (${m.overall}) but wellness is at ${m.wellnessScore}. Often a leading indicator.`,
            time: 'Just now', unread: true, member: m, memberId: m.id, proactive: true,
            suggestedBrief: `${firstName}'s performance numbers look fine but their wellness score has dropped to ${m.wellnessScore}. I want to run a scenario that naturally opens a conversation — not a confrontation, just a check-in.`,
          });
        }
      }

      // 3. Persistent weakness in one dimension
      if (results.length >= 2) {
        const dims = ['ethical_reasoning','stakeholder_awareness','pressure_response','self_awareness'];
        dims.forEach(dim => {
          const vals = results.map(r => r.dimensions?.[dim]).filter(v => v != null);
          if (vals.length >= 2) {
            const avg = Math.round(vals.reduce((s,v) => s+v,0)/vals.length);
            if (avg < 55) {
              newAlerts.push({
                type: 'info', alertKind: 'weak_dimension',
                title: 'Consistent Weakness Detected',
                detail: `${m.name} consistently scores low on ${dim.replace(/_/g,' ')} (avg ${avg} across ${vals.length} scenarios).`,
                time: 'Just now', unread: true, member: m, memberId: m.id, proactive: true,
                weakDimension: dim,
                suggestedBrief: `${firstName} keeps scoring low on ${dim.replace(/_/g,' ')} (avg ${avg}). I want to run a scenario specifically designed to develop this area.`,
              });
            }
          }
        });
      }
    });

    // 4. Unacknowledged flags
    const oldFlags = this.alerts.filter(a =>
      (a.type === 'danger' || a.type === 'warning') && a.memberId && !a.responded && a.time !== 'Just now'
    );
    const flagCounts = {};
    oldFlags.forEach(a => { flagCounts[a.memberId] = (flagCounts[a.memberId] || 0) + 1; });
    Object.entries(flagCounts).forEach(([mid, count]) => {
      if (count >= 2) {
        const m = this.getMember(mid);
        if (!m) return;
        const alreadyNoted = newAlerts.some(a => a.alertKind === 'no_action' && a.memberId === m.id);
        if (!alreadyNoted) {
          newAlerts.push({
            type: 'danger', alertKind: 'no_action',
            title: 'No Action Taken',
            detail: `${m.name} has been flagged ${count} times with no coaching response recorded. IntelliQ is escalating.`,
            time: 'Just now', unread: true, member: m, memberId: m.id, proactive: true,
            suggestedBrief: `${m.name.split(' ')[0]} has been flagged ${count} times with no follow-up. I need to assess where things stand and decide on an action.`,
          });
        }
      }
    });

    newAlerts.forEach(na => {
      const isDup = this.alerts.slice(0,5).some(a => a.alertKind === na.alertKind && a.memberId === na.memberId);
      if (!isDup) this.alerts.unshift(na);
    });

    if (newAlerts.length && typeof updateAlertBadge === 'function') updateAlertBadge();
    return newAlerts.length;
  },

  recordScenarioResult(memberId, result) {
    this.runHealthCheck();
  },
};
