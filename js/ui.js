/* ============================================================
   PLATFORM — UI COMPONENTS & HELPERS
   ============================================================ */

/* ── COLOUR UTILS ────────────────────────────────────────── */
function scoreColor(v){
  if(v >= 80) return 'var(--success)';
  if(v >= 60) return 'var(--accent4)';
  return 'var(--danger)';
}
function scoreLabel(v){
  if(v >= 85) return 'Excellent';
  if(v >= 70) return 'Good';
  if(v >= 55) return 'Average';
  return 'Needs Support';
}
function alertDotColor(type){
  return type==='danger'?'red' : type==='warning'?'yellow' : 'green';
}

/* ── SVG RING ────────────────────────────────────────────── */
function iqRingHTML(score, color='#4f8ef7', size=120){
  const r = size/2 - 10;
  const circ = 2*Math.PI*r;
  const dash = (score/100)*circ;
  return `
    <div class="iq-ring" style="width:${size}px;height:${size}px;">
      <svg width="${size}" height="${size}">
        <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--bg-surface)" stroke-width="9"/>
        <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none"
          stroke="${color}" stroke-width="9"
          stroke-dasharray="${dash.toFixed(1)} ${circ.toFixed(1)}"
          stroke-linecap="round"/>
      </svg>
      <div class="iq-val" style="color:${color}">${score}<span>/ 100</span></div>
    </div>`;
}

/* ── GRADE BADGE ─────────────────────────────────────────── */
function gradeBadgeHTML(grade){
  return `<span class="grade-badge grade-${grade}">● ${grade}-Grade</span>`;
}

/* ── STATUS DOT ──────────────────────────────────────────── */
function statusDotHTML(score){
  const cls = score>=70?'green':score>=50?'yellow':'red';
  return `<span class="status-dot ${cls}"></span>`;
}

/* ── PROGRESS BAR ────────────────────────────────────────── */
function progressHTML(val, color){
  const c = color || scoreColor(val);
  return `<div class="progress"><div class="progress-bar" style="width:${val}%;background:${c}"></div></div>`;
}

/* ── MEMBER CARD ─────────────────────────────────────────── */
function memberCardHTML(m, metrics){
  const pillColors = metrics.slice(0,3).map(k => {
    const v = m.scores[k];
    return `<span class="score-pill" style="color:${scoreColor(v)};border-color:${scoreColor(v)}40">${k.split(' ')[0]}: ${v}</span>`;
  }).join('');
  const trendIcon  = m.trend==='up'?'↑':m.trend==='down'?'↓':'→';
  const trendColor = m.trend==='up'?'var(--success)':m.trend==='down'?'var(--danger)':'var(--text-muted)';
  const isPending  = m.passwordSet === false;

  // Admin action row — only shown when user has permission to manage/delete members
  const canManage  = typeof Auth !== 'undefined' && (Auth.isSuperAdmin() || Auth.canDo('delete_members') || Auth.canDo('edit_members'));
  const adminRow   = canManage ? `
    <div class="member-card-actions" onclick="event.stopPropagation()">
      ${isPending ? `
        <button class="mca-btn" title="Copy invite link"
          onclick="copyMemberInviteLink('${m.userId}','${m.email}')">🔗 Copy Invite</button>
        <button class="mca-btn" title="Generate new invite link"
          onclick="regenerateMemberInvite('${m.userId}','${m.email}')">↺ New Invite</button>` : ''}
      <button class="mca-btn mca-btn-danger" title="Remove person"
        onclick="openRemovePersonModal('${m.userId}')">✕ Remove</button>
    </div>` : '';

  return `
    <div class="member-card" onclick="showProfile(${m.id})">
      <div class="member-avatar" style="background:${m.color}">${m.initials}</div>
      <div class="member-info">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div class="member-name">${m.name}${isPending
            ? ' <span style="font-size:0.65rem;font-weight:600;background:rgba(247,178,79,0.15);color:#f7b24f;border:1px solid rgba(247,178,79,0.35);border-radius:4px;padding:1px 5px;vertical-align:middle">PENDING</span>'
            : ''}</div>
          <span style="font-size:0.85rem;color:${trendColor};font-weight:700">${trendIcon}${m.trendVal}%</span>
        </div>
        <div class="member-meta">${m.role}${m.group ? ' · ' + m.group : ''}</div>
        <div class="member-scores">${pillColors}</div>
        <div style="margin-top:6px">${m.overall !== null ? progressHTML(m.overall) : '<span style="font-size:0.72rem;color:var(--text-muted)">Not yet assessed</span>'}</div>
      </div>
      ${adminRow}
    </div>`;
}

/* ── ALERT ROW ───────────────────────────────────────────── */
function alertItemHTML(a, idx){
  const dotClass = alertDotColor(a.type);
  return `
    <div class="alert-item ${a.unread?'unread':''}" onclick="markAlertRead(${idx})">
      <div class="alert-dot-wrap"><span class="status-dot ${dotClass}"></span></div>
      <div style="flex:1">
        <div class="alert-title">${a.title}</div>
        <div class="alert-detail">${a.detail}</div>
      </div>
      <div class="alert-time">${a.time}</div>
    </div>`;
}

/* ── HEATMAP ─────────────────────────────────────────────── */
function heatmapHTML(data){
  // data: 7 rows x 12 cols (weeks x months isn't quite right but good visual)
  const weeks = 16;
  const days  = 7;
  const cells = Array.from({length:days}, () => Array.from({length:weeks}, () => Math.random()));
  let html = '<div style="display:flex;gap:3px;flex-direction:column">';
  cells.forEach(row => {
    html += '<div class="heatmap-row">';
    row.forEach(v => {
      const alpha = (0.1 + v*0.9).toFixed(2);
      html += `<div class="hm-cell" style="background:rgba(79,142,247,${alpha})" title="${Math.round(v*100)}%"></div>`;
    });
    html += '</div>';
  });
  html += '</div>';
  return html;
}

/* ── WELLNESS METER ──────────────────────────────────────── */
function wellnessMeterHTML(score){
  return `
    <div class="wellness-bar">
      <div class="marker" style="left:${score}%"></div>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:0.68rem;color:var(--text-muted);margin-top:2px">
      <span>Critical</span><span>Low</span><span>Moderate</span><span>Good</span><span>Excellent</span>
    </div>`;
}

/* ── DEVELOPMENT PLAN ────────────────────────────────────── */
function devPlanHTML(plan){
  return plan.map((item, i) => `
    <div class="dev-plan-item">
      <div class="dev-checkbox ${item.done?'checked':''}" onclick="toggleDevPlan(${i})">${item.done?'✓':''}</div>
      <div style="flex:1;font-size:0.85rem;${item.done?'opacity:0.5;text-decoration:line-through':''}">${item.text}</div>
    </div>`).join('');
}

/* ── MODAL ───────────────────────────────────────────────── */
function openModal(id){ document.getElementById(id).classList.add('open'); }
function closeModal(id){ document.getElementById(id).classList.remove('open'); }
function closeAllModals(){
  document.querySelectorAll('.modal-overlay.open').forEach(m=>m.classList.remove('open'));
}

/* ── TABS ────────────────────────────────────────────────── */
function initTabs(containerSel){
  document.querySelectorAll(containerSel+' .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabs = btn.closest('.tabs');
      const panels = btn.closest('[data-tabs]') || btn.closest('.card') || btn.closest('.page');
      tabs.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      const target = btn.dataset.tab;
      panels.querySelectorAll('.tab-panel').forEach(p => {
        p.classList.toggle('active', p.dataset.panel===target);
      });
    });
  });
}

/* ── TOAST ───────────────────────────────────────────────── */
let toastTimeout;
function showToast(msg, type='info'){
  let t = document.getElementById('toast');
  if(!t){
    t = document.createElement('div');
    t.id = 'toast';
    t.style.cssText = `position:fixed;bottom:1.5rem;right:1.5rem;z-index:9999;
      padding:0.7rem 1.2rem;border-radius:8px;font-size:0.85rem;font-weight:500;
      background:var(--bg-card);border:1px solid var(--border);box-shadow:var(--shadow);
      transition:all 0.3s;transform:translateY(100px);opacity:0;`;
    document.body.appendChild(t);
  }
  const colors = { info:'var(--accent)', success:'var(--success)', warning:'var(--warning)', danger:'var(--danger)' };
  t.style.borderLeftColor = colors[type]||colors.info;
  t.style.borderLeftWidth = '3px';
  t.textContent = msg;
  t.style.transform = 'translateY(0)'; t.style.opacity = '1';
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => { t.style.transform='translateY(100px)'; t.style.opacity='0'; }, 3000);
}

/* ── RECOMMENDATION ENGINE (mock AI) ────────────────────── */
function generateRecommendation(member, metrics){
  const lowest = Object.entries(member.scores).sort((a,b)=>a[1]-b[1])[0];
  const highest = Object.entries(member.scores).sort((a,b)=>b[1]-a[1])[0];
  const recs = [
    `Focus on improving <strong>${lowest[0]}</strong> (currently ${lowest[1]}) through targeted exercises and additional coaching sessions.`,
    `${member.name} demonstrates exceptional strength in <strong>${highest[0]}</strong> (${highest[1]}). Leverage this in leadership and peer mentoring roles.`,
    `Wellness score of ${member.wellnessScore} requires attention. Recommend a structured wellbeing check-in programme.`,
    `IntelliQ score of ${member.iqScore} indicates ${scoreLabel(member.iqScore).toLowerCase()} decision intelligence. ${member.iqScore<70?'Additional scenario training is advised.':'Consider advanced scenario modules.'}`,
  ];
  return recs;
}
