/* ============================================================
   PLATFORM — UI COMPONENTS & HELPERS
   ============================================================ */

/* ── SCORE PRESENTATION ───────────────────────────────────────
   Score MEANING is SERVER-SUPPLIED. The client renders truth; it must never derive a verdict
   or a judgment colour from a raw number (a number alone is not a verdict, and the client does
   not know the scale/rubric/comparability). These render numbers NEUTRALLY; assessment meaning
   comes from the server assessment presentation state (verdict → verdictStyle). */
function scoreColor(v){
  // NEUTRALIZED: no score threshold → colour. Numbers render neutrally; only a SERVER verdict
  // may carry a semantic colour (see verdictStyle).
  return (v === null || v === undefined) ? 'var(--text-muted)' : 'var(--text)';
}
function scoreLabel(){
  // NEUTRALIZED: qualitative verdicts are server-supplied (assessmentPresentationState.verdict),
  // never threshold-derived on the client.
  return '';
}
/* The ONLY sanctioned score-to-visual mapping: a BOUNDED SERVER verdict (already scale-,
   rubric- and comparability-aware) → a badge style. Never maps a raw score. */
const VERDICT_STYLE = {
  strong:              { color: 'var(--success)',    text: 'Strong result' },
  meeting_expectation: { color: 'var(--success)',    text: 'Meeting expectation' },
  improving:           { color: 'var(--success)',    text: 'Improving' },
  stable:              { color: 'var(--accent4)',    text: 'Stable' },
  developing:          { color: 'var(--accent4)',    text: 'Developing' },
  incomparable:        { color: 'var(--text-muted)', text: 'Not directly comparable' },
  uninterpreted:       { color: 'var(--text-muted)', text: 'Interpretation unavailable' },
  unknown:             { color: 'var(--text-muted)', text: 'No assessment yet' },
  declining:           { color: 'var(--danger)',     text: 'Declining' },
  concern:             { color: 'var(--danger)',     text: 'Needs attention' },
};
function verdictStyle(verdict){ return VERDICT_STYLE[verdict] || VERDICT_STYLE.unknown; }
function alertDotColor(type){
  return type==='danger'?'red' : type==='warning'?'yellow' : 'green';
}

/* ── SVG RING ────────────────────────────────────────────── */
function iqRingHTML(score, color='#4f8ef7', size=120){
  const r = size/2 - 10;
  const circ = 2*Math.PI*r;
  if (score === null || score === undefined) {
    return `
      <div class="iq-ring" style="width:${size}px;height:${size}px;">
        <svg width="${size}" height="${size}">
          <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--bg-surface)" stroke-width="9"/>
        </svg>
        <div class="iq-val" style="color:var(--text-muted)">—</div>
      </div>`;
  }
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
  if (!grade) return '';
  return `<span class="grade-badge grade-${grade}">● ${grade}-Grade</span>`;
}


/* ── PROGRESS BAR ────────────────────────────────────────── */
function progressHTML(val, color){
  if (val === null || val === undefined) return '';
  const c = color || scoreColor(val);
  return `<div class="progress"><div class="progress-bar" style="width:${val}%;background:${c}"></div></div>`;
}

/* ── MEMBER CARD ─────────────────────────────────────────── */
function memberCardHTML(m, metrics){
  const pillColors = metrics.slice(0,3).map(k => {
    const v = m.scores[k];
    if (v === null || v === undefined) return '';
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
    <div class="member-card" onclick="showProfile('${m.id}')">
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


/* ── WELLNESS METER ──────────────────────────────────────── */
function wellnessMeterHTML(score){
  if (score === null || score === undefined) {
    return `<span style="font-size:0.78rem;color:var(--text-muted)">No wellness data yet</span>`;
  }
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
  try {
    const scoreEntries = Object.entries(member.scores || {})
      .filter(([, v]) => v !== null && v !== undefined);

    // Not enough data — honest empty state
    if (scoreEntries.length === 0) {
      return ['Not enough activity yet to generate a recommendation. Ask this member to complete check-ins or assessments first.'];
    }

    const lowest  = scoreEntries.sort((a, b) => a[1] - b[1])[0];
    const highest = scoreEntries.slice().sort((a, b) => b[1] - a[1])[0];

    const recs = [
      `Focus on improving <strong>${lowest[0]}</strong> (currently ${lowest[1]}) through targeted exercises and additional coaching sessions.`,
      `${member.name} demonstrates exceptional strength in <strong>${highest[0]}</strong> (${highest[1]}). Leverage this in leadership and peer mentoring roles.`,
    ];

    if (member.wellnessScore != null) {
      recs.push(`Wellness score of ${member.wellnessScore} requires attention. Recommend a structured wellbeing check-in programme.`);
    }
    if (member.iqScore != null) {
      // NEUTRALIZED: no client-side verdict/threshold from the raw score — state it factually
      // and defer interpretation to the server assessment presentation state.
      recs.push(`IntelliQ score of ${member.iqScore} recorded from scenario practice. Open the assessment breakdown for the server-supplied interpretation and next steps.`);
    }

    return recs;
  } catch(e) {
    console.warn('[generateRecommendation] failed for', member?.name, e.message);
    return ['Recommendation data unavailable for this member.'];
  }
}
