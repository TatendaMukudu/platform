/* ============================================================
   PLATFORM — MAIN APPLICATION
   ============================================================ */

/* ── NAVIGATION ──────────────────────────────────────────── */
function navigate(page){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  const pg = document.getElementById('page-'+page);
  if(pg) pg.classList.add('active');
  document.querySelectorAll(`.nav-item[data-page="${page}"]`).forEach(n=>n.classList.add('active'));
  AppState.currentPage = page;
  document.querySelector('.topbar-title').textContent = PAGE_TITLES[page] || 'Platform';

  if(page==='dashboard') renderDashboard();
  else if(page==='members') renderMembers();
  else if(page==='analytics') renderAnalytics();
  else if(page==='intelliq') renderIntelliQ();
  else if(page==='alerts')   renderAlerts();
  else if(page==='reports')  renderReports();
  else if(page==='settings') renderSettings();
}

const PAGE_TITLES = {
  dashboard: 'Overview Dashboard',
  members:   'Members & Profiles',
  analytics: 'Analytics & Insights',
  intelliq:  'IntelliQ Engine',
  alerts:    'Alerts & Notifications',
  reports:   'Reports & Stat Sheets',
  settings:  'Platform Settings',
};

/* ── LOGIN ────────────────────────────────────────────────── */
function initLogin(){
  let selectedMode = 'school';
  document.querySelectorAll('.org-tile').forEach(tile => {
    tile.addEventListener('click', () => {
      document.querySelectorAll('.org-tile').forEach(t=>t.classList.remove('active'));
      tile.classList.add('active');
      selectedMode = tile.dataset.mode;
    });
  });

  document.getElementById('login-form').addEventListener('submit', e => {
    e.preventDefault();
    const orgName  = document.getElementById('login-org').value  || 'My Organization';
    const userName = document.getElementById('login-name').value || 'Admin User';
    const grade    = document.getElementById('login-grade').value || 'A';
    AppState.init(selectedMode, orgName, userName, grade);
    launchApp();
  });
}

function launchApp(){
  document.getElementById('login-screen').style.display = 'none';
  const app = document.getElementById('app');
  app.classList.add('visible');
  renderSidebar();
  renderTopbar();
  renderAllPages();
  navigate('dashboard');
}

/* ── SIDEBAR ──────────────────────────────────────────────── */
function renderSidebar(){
  const mode = AppState.mode;
  const modeInfo = ORG_MODES[mode];
  const color = modeInfo.color;

  document.querySelector('.sb-logo-text').textContent = 'Platform';
  document.querySelector('.sb-logo-sub').textContent  = modeInfo.label + ' · ' + AppState.grade + '-Grade';

  const badge = document.querySelector('.mode-badge');
  badge.textContent = modeInfo.icon + '  ' + modeInfo.label;
  badge.style.background = color+'22';
  badge.style.color = color;
  badge.style.border = `1px solid ${color}44`;

  document.querySelector('.user-name').textContent = AppState.adminName;
  document.querySelector('.user-role').textContent = AppState.adminRole;
  const av = document.querySelector('.sidebar-footer .user-avatar');
  av.textContent = AppState.adminName.split(' ').map(w=>w[0]).join('').slice(0,2);
  av.style.background = color;

  updateAlertBadge();
}

function updateAlertBadge(){
  const count = AppState.getUnreadAlertCount();
  document.querySelectorAll('.nav-badge').forEach(b => {
    b.textContent = count;
    b.style.display = count ? 'inline' : 'none';
  });
}

/* ── TOPBAR ──────────────────────────────────────────────── */
function renderTopbar(){
  document.getElementById('topbar-org').textContent = AppState.orgName;
}

/* ── DASHBOARD ───────────────────────────────────────────── */
function renderDashboard(){
  const s = AppState.stats;
  const mode = AppState.mode;
  const color = ORG_MODES[mode].color;
  const metrics = ORG_MODES[mode].metrics;

  // Stat cards
  const statsGrid = document.getElementById('dash-stats');
  statsGrid.innerHTML = `
    <div class="stat-card">
      <div style="display:flex;align-items:flex-start;justify-content:space-between">
        <div class="stat-label">Total Members</div>
        <span class="stat-icon">👥</span>
      </div>
      <div class="stat-value" style="color:${color}">${s.totalMembers}</div>
      <div class="stat-change up">↑ Active organization</div>
    </div>
    <div class="stat-card">
      <div style="display:flex;align-items:flex-start;justify-content:space-between">
        <div class="stat-label">Avg IntelliQ Score</div>
        <span class="stat-icon">🧠</span>
      </div>
      <div class="stat-value" style="color:${scoreColor(s.avgIQ)}">${s.avgIQ}</div>
      <div class="stat-change ${s.avgIQ>=70?'up':'down'}">
        ${s.avgIQ>=70?'↑':'↓'} ${scoreLabel(s.avgIQ)}
      </div>
    </div>
    <div class="stat-card">
      <div style="display:flex;align-items:flex-start;justify-content:space-between">
        <div class="stat-label">Avg Wellness</div>
        <span class="stat-icon">💚</span>
      </div>
      <div class="stat-value" style="color:${scoreColor(s.avgWellness)}">${s.avgWellness}</div>
      <div class="stat-change ${s.avgWellness>=60?'up':'down'}">
        ${s.atRisk} at risk · ${s.improving} improving
      </div>
    </div>
    <div class="stat-card">
      <div style="display:flex;align-items:flex-start;justify-content:space-between">
        <div class="stat-label">Avg Performance</div>
        <span class="stat-icon">📈</span>
      </div>
      <div class="stat-value" style="color:${scoreColor(s.avgOverall)}">${s.avgOverall}</div>
      <div class="stat-change up">↑ Org-wide metric</div>
    </div>
    <div class="stat-card">
      <div style="display:flex;align-items:flex-start;justify-content:space-between">
        <div class="stat-label">Active Alerts</div>
        <span class="stat-icon">🔔</span>
      </div>
      <div class="stat-value" style="color:var(--warning)">${s.alerts}</div>
      <div class="stat-change">${AppState.getUnreadAlertCount()} unread</div>
    </div>
    <div class="stat-card">
      <div style="display:flex;align-items:flex-start;justify-content:space-between">
        <div class="stat-label">Top Performer</div>
        <span class="stat-icon">⭐</span>
      </div>
      <div class="stat-value" style="font-size:1.1rem;padding-top:4px">${s.topPerformer.name.split(' ')[0]}</div>
      <div class="stat-change up">Score: ${s.topPerformer.overall}</div>
    </div>`;

  // Performance history chart
  setTimeout(() => {
    createLineChart('chart-perf-history', MONTHS, [
      {
        label: 'Avg Performance',
        data: AppState.perfHistory,
        borderColor: color,
        backgroundColor: color+'22',
        fill: true, tension: 0.4, borderWidth: 2, pointRadius: 3,
      },
      {
        label: 'IntelliQ Trend',
        data: AppState.perfHistory.map(v => Math.round(v * 0.97 + Math.random()*4-2)),
        borderColor: '#7c5af5',
        backgroundColor: 'transparent',
        tension: 0.4, borderWidth: 2, pointRadius: 0, borderDash: [5,5],
      },
    ]);

    // Group avg bar chart
    const groups = AppState.getGroups().filter(g=>g!=='All');
    const groupAvgs = groups.map(g => {
      const ms = AppState.members.filter(m=>m.group===g);
      return Math.round(ms.reduce((s,m)=>s+m.overall,0)/ms.length);
    });
    createBarChart('chart-group-avg', groups, [{
      label: 'Avg Performance',
      data: groupAvgs,
      backgroundColor: groups.map((_,i)=>COLORS[i]+'99'),
      borderColor: groups.map((_,i)=>COLORS[i]),
      borderWidth: 1, borderRadius: 4,
    }], { legend: false });

    // Wellness distribution doughnut
    const excellent = AppState.members.filter(m=>m.wellnessScore>=80).length;
    const good      = AppState.members.filter(m=>m.wellnessScore>=60 && m.wellnessScore<80).length;
    const moderate  = AppState.members.filter(m=>m.wellnessScore>=40 && m.wellnessScore<60).length;
    const critical  = AppState.members.filter(m=>m.wellnessScore<40).length;
    createDoughnutChart('chart-wellness', ['Excellent','Good','Moderate','Critical'],
      [excellent, good, moderate, critical],
      ['#4ff77a','#4f8ef7','#f7b24f','#f74f4f']);

    // IQ vs Performance scatter
    createScatterChart('chart-scatter', AppState.members);
  }, 50);

  // Recent alerts
  const alertsContainer = document.getElementById('dash-alerts');
  alertsContainer.innerHTML = AppState.alerts.slice(0,6).map((a,i)=>alertItemHTML(a,i)).join('');

  // Top 5 performers
  const top5 = [...AppState.members].sort((a,b)=>b.overall-a.overall).slice(0,5);
  document.getElementById('dash-top5').innerHTML = top5.map(m => `
    <tr onclick="showProfile(${m.id})">
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="user-avatar" style="width:28px;height:28px;font-size:0.7rem;background:${m.color}">${m.initials}</div>
          ${m.name}
        </div>
      </td>
      <td>${m.role}</td>
      <td><span style="color:${scoreColor(m.iqScore)};font-weight:600">${m.iqScore}</span></td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="flex:1">${progressHTML(m.overall, scoreColor(m.overall))}</div>
          <span style="font-size:0.8rem;font-weight:600;width:28px;text-align:right">${m.overall}</span>
        </div>
      </td>
      <td>${gradeBadgeHTML(m.iqGrade)}</td>
    </tr>`).join('');
}

/* ── MEMBERS PAGE ────────────────────────────────────────── */
let memberSearch = '', memberGroup = 'All';

function renderMembers(){
  const mode = AppState.mode;
  const metrics = ORG_MODES[mode].metrics;
  const groups = AppState.getGroups();

  // Group filter tabs
  const groupTabs = document.getElementById('members-group-tabs');
  groupTabs.innerHTML = groups.map(g =>
    `<button class="tab-btn ${g===memberGroup?'active':''}" onclick="filterMembers('${g}')">${g}</button>`
  ).join('');

  const filtered = AppState.getFilteredMembers(memberGroup, memberSearch);
  document.getElementById('members-count').textContent = `${filtered.length} members`;

  const grid = document.getElementById('members-grid');
  grid.innerHTML = filtered.length
    ? filtered.map(m => memberCardHTML(m, metrics)).join('')
    : `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🔍</div><p>No members match your search.</p></div>`;
}

function filterMembers(group){
  memberGroup = group;
  renderMembers();
}

function searchMembers(val){
  memberSearch = val;
  renderMembers();
}

/* ── ANALYTICS PAGE ──────────────────────────────────────── */
function renderAnalytics(){
  const mode = AppState.mode;
  const color = ORG_MODES[mode].color;
  const metrics = ORG_MODES[mode].metrics;

  setTimeout(() => {
    // Metric averages bar
    const metricAvgs = metrics.map(m => {
      const vals = AppState.members.map(mem=>mem.scores[m]);
      return Math.round(vals.reduce((a,b)=>a+b,0)/vals.length);
    });
    createHorizBarChart('chart-metric-avgs', metrics, metricAvgs, color);

    // Top vs Bottom performers
    const top = [...AppState.members].sort((a,b)=>b.overall-a.overall).slice(0,5);
    const bot = [...AppState.members].sort((a,b)=>a.overall-b.overall).slice(0,5);
    createBarChart('chart-top-bot', [...top.map(m=>m.name.split(' ')[0]), ...bot.map(m=>m.name.split(' ')[0])],
      [{
        label: 'Performance',
        data: [...top.map(m=>m.overall), ...bot.map(m=>m.overall)],
        backgroundColor: [...top.map(()=>color+'99'), ...bot.map(()=>'#f74f4f99')],
        borderColor: [...top.map(()=>color), ...bot.map(()=>'#f74f4f')],
        borderWidth: 1, borderRadius: 4,
      }], { legend: false });

    // IQ distribution
    const buckets = [0,0,0,0,0]; // 0-19,20-39,40-59,60-79,80-100
    AppState.members.forEach(m => {
      const b = Math.min(4, Math.floor(m.iqScore/20));
      buckets[b]++;
    });
    createBarChart('chart-iq-dist', ['0-19','20-39','40-59','60-79','80-100'],
      [{ label:'Members', data:buckets, backgroundColor:'#7c5af599', borderColor:'#7c5af5', borderWidth:1, borderRadius:4 }],
      { legend:false });

    // Trend over 6 months per group
    const groups = AppState.getGroups().filter(g=>g!=='All');
    const last6 = MONTHS.slice(-6);
    const datasets = groups.slice(0,4).map((g,i) => ({
      label: g,
      data: Array.from({length:6}, () => rnd(55,92)),
      borderColor: COLORS[i],
      backgroundColor: 'transparent',
      tension: 0.4, borderWidth: 2, pointRadius: 2,
    }));
    createLineChart('chart-group-trend', last6, datasets, { yMin:40 });
  }, 50);

  // At-risk table
  const atRisk = AppState.members.filter(m=>m.wellnessScore<50||m.overall<55||m.alerts>1)
    .sort((a,b)=>a.wellnessScore-b.wellnessScore).slice(0,8);
  document.getElementById('analytics-risk-table').innerHTML = atRisk.map(m=>`
    <tr onclick="showProfile(${m.id})">
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="user-avatar" style="width:28px;height:28px;font-size:0.7rem;background:${m.color}">${m.initials}</div>
          ${m.name}
        </div>
      </td>
      <td>${m.group}</td>
      <td><span style="color:${scoreColor(m.wellnessScore)};font-weight:600">${m.wellnessScore}</span></td>
      <td><span style="color:${scoreColor(m.overall)};font-weight:600">${m.overall}</span></td>
      <td>${m.alerts > 0 ? `<span style="color:var(--danger)">${m.alerts} active</span>` : '—'}</td>
      <td><button class="btn btn-sm btn-accent" onclick="event.stopPropagation();showProfile(${m.id})">View Profile</button></td>
    </tr>`).join('');
}

/* ── INTELLIQ PAGE ───────────────────────────────────────── */
function renderIntelliQ(){
  const members = AppState.members;
  const mode = AppState.mode;
  const color = ORG_MODES[mode].color;
  const metrics = ORG_MODES[mode].metrics;

  // Top IQ scores
  const top = [...members].sort((a,b)=>b.iqScore-a.iqScore);

  // IQ Rings for top 4
  document.getElementById('iq-top-rings').innerHTML = top.slice(0,4).map(m=>`
    <div style="text-align:center">
      ${iqRingHTML(m.iqScore, scoreColor(m.iqScore), 110)}
      <div style="font-size:0.82rem;font-weight:600;margin-top:6px">${m.name.split(' ')[0]}</div>
      <div style="font-size:0.72rem;color:var(--text-secondary)">${m.role}</div>
      ${gradeBadgeHTML(m.iqGrade)}
    </div>`).join('');

  // IQ leaderboard table
  document.getElementById('iq-leaderboard').innerHTML = top.map((m,i)=>`
    <tr onclick="showProfile(${m.id})">
      <td><span style="font-weight:700;color:var(--text-muted)">#${i+1}</span></td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="user-avatar" style="width:28px;height:28px;font-size:0.7rem;background:${m.color}">${m.initials}</div>
          ${m.name}
        </div>
      </td>
      <td>${m.group}</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          ${progressHTML(m.iqScore, scoreColor(m.iqScore))}
          <span style="font-size:0.82rem;font-weight:700;color:${scoreColor(m.iqScore)};width:30px">${m.iqScore}</span>
        </div>
      </td>
      <td>${gradeBadgeHTML(m.iqGrade)}</td>
      <td><span style="color:${scoreColor(m.wellnessScore)}">${m.wellnessScore}</span></td>
    </tr>`).join('');

  setTimeout(()=>{
    // Radar for org average
    const avgScores = metrics.map(k => {
      return Math.round(members.reduce((s,m)=>s+(m.scores[k]||0),0)/members.length);
    });
    createRadarChart('chart-org-radar', metrics, [{
      label: AppState.orgName,
      data: avgScores,
      borderColor: color,
      backgroundColor: color+'33',
      borderWidth: 2,
      pointBackgroundColor: color,
      pointRadius: 4,
    }]);

    // Mental readiness histogram
    const buckets = [0,0,0,0,0];
    members.forEach(m => { buckets[Math.min(4,Math.floor(m.wellnessScore/20))]++; });
    createBarChart('chart-readiness', ['Very Low','Low','Moderate','High','Peak'],
      [{ label:'Members', data:buckets, backgroundColor:['#f74f4f99','#f7a84f99','#f7b24f99','#4f8ef799','#4ff77a99'],
         borderColor:['#f74f4f','#f7a84f','#f7b24f','#4f8ef7','#4ff77a'], borderWidth:1, borderRadius:4 }],
      { legend:false });
  }, 50);
}

/* ── ALERTS PAGE ─────────────────────────────────────────── */
function renderAlerts(){
  const container = document.getElementById('alerts-list');
  container.innerHTML = AppState.alerts.map((a,i)=>alertItemHTML(a,i)).join('');
  document.getElementById('alerts-unread-count').textContent = AppState.getUnreadAlertCount();
}

function markAlertRead(idx){
  if(AppState.alerts[idx]) AppState.alerts[idx].unread = false;
  updateAlertBadge();
  renderAlerts();
}

function markAllRead(){
  AppState.alerts.forEach(a=>a.unread=false);
  updateAlertBadge();
  renderAlerts();
  showToast('All alerts marked as read','success');
}

/* ── REPORTS PAGE ────────────────────────────────────────── */
function renderReports(){
  const mode = AppState.mode;
  const color = ORG_MODES[mode].color;
  const metrics = ORG_MODES[mode].metrics;

  // Summary stat sheet
  const s = AppState.stats;
  document.getElementById('report-org').textContent = AppState.orgName;
  document.getElementById('report-mode').textContent = ORG_MODES[mode].label;
  document.getElementById('report-grade').innerHTML = gradeBadgeHTML(AppState.grade);
  document.getElementById('report-date').textContent = new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});
  document.getElementById('report-total').textContent = s.totalMembers;
  document.getElementById('report-avg-iq').textContent = s.avgIQ;
  document.getElementById('report-avg-perf').textContent = s.avgOverall;
  document.getElementById('report-at-risk').textContent = s.atRisk;

  // Member stat sheet table
  const sorted = [...AppState.members].sort((a,b)=>b.overall-a.overall);
  document.getElementById('stat-sheet-thead').innerHTML = `
    <tr>
      <th>Rank</th><th>Name</th><th>Group</th>
      ${metrics.map(m=>`<th>${m}</th>`).join('')}
      <th>IntelliQ</th><th>Overall</th><th>Grade</th>
    </tr>`;
  document.getElementById('stat-sheet-tbody').innerHTML = sorted.map((m,i)=>`
    <tr onclick="showProfile(${m.id})">
      <td><span style="font-weight:700;color:var(--text-muted)">${i+1}</span></td>
      <td>
        <div style="display:flex;align-items:center;gap:6px">
          <div class="user-avatar" style="width:24px;height:24px;font-size:0.65rem;background:${m.color}">${m.initials}</div>
          ${m.name}
        </div>
      </td>
      <td style="color:var(--text-secondary)">${m.group}</td>
      ${metrics.map(k=>`<td><span style="color:${scoreColor(m.scores[k])};font-weight:600">${m.scores[k]}</span></td>`).join('')}
      <td><span style="color:${scoreColor(m.iqScore)};font-weight:600">${m.iqScore}</span></td>
      <td><span style="font-weight:700;color:${scoreColor(m.overall)}">${m.overall}</span></td>
      <td>${gradeBadgeHTML(m.iqGrade)}</td>
    </tr>`).join('');
}

/* ── SETTINGS PAGE ───────────────────────────────────────── */
function renderSettings(){
  const mode = AppState.mode;
  const info = ORG_MODES[mode];
  const grade = AppState.grade;

  document.getElementById('settings-org-name').textContent  = AppState.orgName;
  document.getElementById('settings-mode').textContent      = info.label;
  document.getElementById('settings-grade').innerHTML       = gradeBadgeHTML(grade);
  document.getElementById('settings-admin').textContent     = AppState.adminName;

  // Feature list for current grade
  const features = PLATFORM_GRADES[grade].features;
  document.getElementById('settings-features').innerHTML = features.map(f=>`
    <div style="display:flex;align-items:center;gap:8px;padding:0.5rem 0;border-bottom:1px solid var(--border)">
      <span style="color:var(--success);font-size:0.9rem">✓</span>
      <span style="font-size:0.85rem">${f}</span>
    </div>`).join('');

  // Mode cards
  document.getElementById('settings-modes').innerHTML = Object.entries(ORG_MODES).map(([k,v])=>`
    <div class="org-tile ${k===mode?'active':''}" onclick="switchMode('${k}')" style="${k===mode?'border-color:'+v.color+';background:'+v.color+'22;color:'+v.color:''}">
      <div class="tile-icon">${v.icon}</div>
      <div style="font-size:0.72rem">${v.label}</div>
    </div>`).join('');
}

function switchMode(newMode){
  AppState.mode = newMode;
  AppState.members = generateMembers(newMode, 24);
  AppState.alerts  = generateAlerts(newMode, AppState.members);
  AppState.stats   = generateOrgStats(newMode, AppState.members);
  AppState.perfHistory = generatePerformanceHistory(12);
  renderSidebar();
  renderSettings();
  showToast(`Switched to ${ORG_MODES[newMode].label} mode`, 'success');
}

/* ── PROFILE MODAL ───────────────────────────────────────── */
function showProfile(id){
  const m = AppState.getMember(id);
  if(!m) return;
  const mode = AppState.mode;
  const metrics = ORG_MODES[mode].metrics;
  const color = m.color;

  AppState.currentMemberId = id;

  const modal = document.getElementById('profile-modal');
  document.getElementById('pm-name').textContent    = m.name;
  document.getElementById('pm-role').textContent    = `${m.role} · ${m.group}`;
  document.getElementById('pm-avatar').textContent  = m.initials;
  document.getElementById('pm-avatar').style.background = color;
  document.getElementById('pm-grade').innerHTML     = gradeBadgeHTML(m.iqGrade);
  document.getElementById('pm-joined').textContent  = `Joined ${m.joinDate}`;
  document.getElementById('pm-active').textContent  = `Active: ${m.lastActive}`;
  document.getElementById('pm-streak').textContent  = `🔥 ${m.streak}-day streak`;
  document.getElementById('pm-iq-ring').innerHTML   = iqRingHTML(m.iqScore, scoreColor(m.iqScore), 100);
  document.getElementById('pm-overall').textContent = m.overall;
  document.getElementById('pm-wellness').innerHTML  = wellnessMeterHTML(m.wellnessScore);
  document.getElementById('pm-notes').textContent   = m.notes;
  document.getElementById('pm-dev-plan').innerHTML  = devPlanHTML(m.devPlan);

  // Score breakdown
  document.getElementById('pm-scores').innerHTML = metrics.map(k=>`
    <div style="margin-bottom:0.7rem">
      <div style="display:flex;justify-content:space-between;margin-bottom:3px">
        <span style="font-size:0.8rem">${k}</span>
        <span style="font-size:0.8rem;font-weight:600;color:${scoreColor(m.scores[k])}">${m.scores[k]}</span>
      </div>
      ${progressHTML(m.scores[k], scoreColor(m.scores[k]))}
    </div>`).join('');

  // AI recommendations
  const recs = generateRecommendation(m, metrics);
  document.getElementById('pm-recs').innerHTML = recs.map(r=>`
    <div style="padding:0.5rem 0;border-bottom:1px solid var(--border);font-size:0.83rem;line-height:1.55;color:var(--text-secondary)">
      → ${r}
    </div>`).join('');

  // History sparkline data
  document.getElementById('pm-history-vals').innerHTML = m.history.map((v,i)=>`
    <div style="text-align:center;font-size:0.68rem;color:var(--text-muted)">${MONTHS[i]||i+1}<br>
      <span style="color:${scoreColor(v)};font-weight:600">${v}</span></div>`).join('');

  openModal('profile-modal');

  setTimeout(()=>{
    createRadarChart('pm-radar', metrics, [{
      label: m.name,
      data: metrics.map(k=>m.scores[k]),
      borderColor: color,
      backgroundColor: color+'33',
      borderWidth: 2,
      pointBackgroundColor: color,
      pointRadius: 4,
    }]);
    createLineChart('pm-chart', MONTHS, [{
      label:'Performance',
      data: m.history,
      borderColor: color,
      backgroundColor: color+'22',
      fill:true, tension:0.4, borderWidth:2, pointRadius:3,
    }]);
  }, 80);
}

function toggleDevPlan(idx){
  const m = AppState.getMember(AppState.currentMemberId);
  if(m && m.devPlan[idx]){
    m.devPlan[idx].done = !m.devPlan[idx].done;
    document.getElementById('pm-dev-plan').innerHTML = devPlanHTML(m.devPlan);
    showToast(m.devPlan[idx].done ? 'Task completed!' : 'Task unchecked','success');
  }
}

/* ── NOTIFICATION PANEL ──────────────────────────────────── */
function toggleNotifPanel(){
  document.getElementById('notif-panel').classList.toggle('open');
}

/* ── RENDER ALL PAGES (structure) ───────────────────────── */
function renderAllPages(){
  // Pages are in HTML already; just initialize tab listeners
  document.querySelectorAll('[data-tabs]').forEach(container => {
    container.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabs = btn.closest('.tabs');
        tabs.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        const target = btn.dataset.tab;
        container.querySelectorAll('.tab-panel').forEach(p=>{
          p.classList.toggle('active', p.dataset.panel===target);
        });
      });
    });
  });
}

/* ── EXPORT REPORT ───────────────────────────────────────── */
function exportReport(){
  showToast('Generating PDF report... (demo mode)','info');
  setTimeout(()=>showToast('Report ready for download','success'), 2000);
}

/* ── ADD MEMBER MODAL ────────────────────────────────────── */
function showAddMember(){
  openModal('add-member-modal');
}
function submitAddMember(e){
  e.preventDefault();
  const name  = document.getElementById('am-name').value;
  const role  = document.getElementById('am-role').value;
  const group = document.getElementById('am-group').value;
  if(!name||!role||!group){ showToast('Please fill all fields','warning'); return; }
  const mode = AppState.mode;
  const metrics = ORG_MODES[mode].metrics;
  const scores = {};
  metrics.forEach(m=>{ scores[m]=rnd(55,90); });
  const iq = rnd(55,90);
  AppState.members.push({
    id: AppState.members.length+1,
    name, role, group,
    initials: name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase(),
    color: COLORS[AppState.members.length % COLORS.length],
    iqScore: iq, iqGrade: iq>=80?'A':iq>=60?'B':'C',
    scores, overall: Math.round(Object.values(scores).reduce((a,b)=>a+b,0)/metrics.length),
    wellnessScore: rnd(55,90), streak: 0, alerts: 0,
    lastActive:'Today', trend:'stable', trendVal:0,
    history: Array.from({length:12},()=>rnd(55,90)),
    joinDate:`${pick(['Jan','Feb','Mar','Apr','May','Jun'])} 2025`,
    notes:'New member. Awaiting initial assessment.',
    devPlan:[
      {text:'Complete onboarding assessment',done:false},
      {text:'Initial IntelliQ evaluation',done:false},
      {text:'Set performance baseline',done:false},
    ],
  });
  AppState.stats = generateOrgStats(mode, AppState.members);
  closeAllModals();
  renderMembers();
  showToast(`${name} added successfully!`,'success');
  e.target.reset();
}

/* ── INIT ────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initLogin();
  // Nav items
  document.querySelectorAll('.nav-item[data-page]').forEach(item => {
    item.addEventListener('click', () => navigate(item.dataset.page));
  });
  // Notification panel toggle
  document.getElementById('notif-btn').addEventListener('click', toggleNotifPanel);
  document.getElementById('notif-panel-close').addEventListener('click', ()=>{
    document.getElementById('notif-panel').classList.remove('open');
  });
  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(ov => {
    ov.addEventListener('click', e => { if(e.target===ov) closeAllModals(); });
  });
  // Search
  document.getElementById('topbar-search-input').addEventListener('input', e => {
    if(AppState.currentPage==='members') searchMembers(e.target.value);
  });
  // Keyboard: Escape closes modals
  document.addEventListener('keydown', e => {
    if(e.key==='Escape') closeAllModals();
  });
});
