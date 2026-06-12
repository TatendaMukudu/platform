/* ============================================================
   PLATFORM — MAIN APPLICATION
   ============================================================ */

/* ════════════════════════════════════════════════════════════
   MEMBER ONBOARDING FLOW
   Shown to any invited user whose profileComplete !== true.
   Generic — no industry-specific language. 7 steps.
   ════════════════════════════════════════════════════════════ */

const OB_STEPS = [
  {
    key:         'mainGoals',
    question:    'What are your main goals while you are part of this organisation?',
    hint:        'Think about what you want to achieve, contribute, or get better at during your time here.',
    type:        'textarea',
    placeholder: 'e.g. Develop my communication skills, become more consistent, contribute meaningfully to the team…',
  },
  {
    key:         'longTermGoals',
    question:    'What long-term goals are you working toward?',
    hint:        'These can go beyond this organisation — think 1, 3, or 5 years from now.',
    type:        'textarea',
    placeholder: 'e.g. Take on a leadership role, build expertise in my field, develop the confidence to handle high-pressure situations…',
  },
  {
    key:         'strengths',
    question:    'What strengths do you want this organisation to know about?',
    hint:        'These help the people supporting you understand what you already bring.',
    type:        'textarea',
    placeholder: 'e.g. High work ethic, strong communicator, calm under pressure, I learn quickly from feedback…',
  },
  {
    key:         'improvementAreas',
    question:    'What areas would you like to improve?',
    hint:        'Honest answers here lead to the most useful support. There are no wrong answers.',
    type:        'textarea',
    placeholder: 'e.g. Managing nerves before high-stakes moments, staying consistent when things get difficult, asking for help sooner…',
  },
  {
    key:         'selectedValues',
    question:    'Which organisation values matter most to you?',
    hint:        'Select the values you feel most connected to right now.',
    type:        'values',   // rendered using orgValues tags, or free text if none
  },
  {
    key:         'personalMetrics',
    question:    'What personal metrics would you like to track?',
    hint:        'These are private to you. Pick from the suggestions or add your own.',
    type:        'metrics',
    suggestions: ['Confidence','Communication','Consistency','Readiness','Leadership','Recovery','Focus','Time Management'],
  },
  {
    key:         'freeText',
    question:    'Anything else you want IntelliQ to know?',
    hint:        'Optional — share any context that would help us give you better support.',
    type:        'textarea',
    placeholder: 'e.g. I\'ve recently been going through some changes and I\'m still finding my footing. I respond better to encouragement than criticism…',
    optional:    true,
  },
];

// State for the current onboarding session
const _ob = {
  step:     0,
  orgValues: [],   // loaded from server if available
  answers: {
    mainGoals:        '',
    longTermGoals:    '',
    strengths:        '',
    improvementAreas: '',
    selectedValues:   [],
    personalMetrics:  [],
    freeText:         '',
  },
};

/* ── Entry point — called instead of launchMemberView() when profile incomplete ── */
async function showOnboardingFlow() {
  // Load org values for step 5
  try {
    const r = await fetch('/api/values', { headers: Auth._headers() });
    const d = await r.json();
    _ob.orgValues = Array.isArray(d.values) ? d.values : [];
  } catch(e) {
    _ob.orgValues = [];
  }

  _ob.step = 0;
  Object.assign(_ob.answers, {
    mainGoals: '', longTermGoals: '', strengths: '', improvementAreas: '',
    selectedValues: [], personalMetrics: [], freeText: '',
  });

  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display          = 'none';
  const orgOvEl = document.getElementById('org-setup-overlay');
  if (orgOvEl) orgOvEl.style.display = 'none';
  document.getElementById('onboarding-overlay').style.display = 'flex';

  _obRenderStep();
}

/* ── Render the current step ─────────────────────────────────────────────── */
function _obRenderStep() {
  const step     = OB_STEPS[_ob.step];
  const total    = OB_STEPS.length;
  const progress = Math.round(((_ob.step) / total) * 100);

  // Progress bar + label
  const fill = document.getElementById('ob-progress-fill');
  if (fill) fill.style.width = Math.max(progress, 6) + '%';

  const label = document.getElementById('ob-step-label');
  if (label) label.textContent = `Step ${_ob.step + 1} of ${total}`;

  // Skip button visibility
  const skipBtn = document.getElementById('ob-skip-btn');
  if (skipBtn) skipBtn.style.display = step.optional ? 'inline' : 'inline';

  // Next button label on last step
  const nextBtn = document.getElementById('ob-next-btn');
  if (nextBtn) nextBtn.textContent = _ob.step === total - 1 ? 'Finish →' : 'Next →';

  // Render content area
  const content = document.getElementById('ob-content');
  if (!content) return;

  let inputHTML = '';

  if (step.type === 'textarea') {
    const saved = _ob.answers[step.key] || '';
    inputHTML = `
      <p class="ob-question">${step.question}</p>
      <p class="ob-hint">${step.hint}</p>
      <textarea class="ob-textarea" id="ob-input" placeholder="${step.placeholder || ''}"
        rows="4">${_escHtml(saved)}</textarea>`;

  } else if (step.type === 'values') {
    const saved = _ob.answers.selectedValues || [];
    if (_ob.orgValues.length > 0) {
      const tags = _ob.orgValues.map(v => {
        const sel = saved.includes(v) ? 'selected' : '';
        return `<span class="ob-tag ${sel}" onclick="_obToggleTag(this,'selectedValues','${_escHtml(v)}')">${_escHtml(v)}</span>`;
      }).join('');
      inputHTML = `
        <p class="ob-question">${step.question}</p>
        <p class="ob-hint">${step.hint}</p>
        <div class="ob-tag-grid" id="ob-tag-grid-values">${tags}</div>`;
    } else {
      // No org values — free text field
      const saved2 = _ob.answers.selectedValues.join(', ') || '';
      inputHTML = `
        <p class="ob-question">${step.question}</p>
        <p class="ob-hint">${step.hint}</p>
        <p class="ob-freetext-label">Your organisation hasn't set values yet. Type the values that matter most to you:</p>
        <textarea class="ob-textarea" id="ob-input" placeholder="e.g. Integrity, Accountability, Growth, Teamwork…"
          rows="3">${_escHtml(saved2)}</textarea>`;
    }

  } else if (step.type === 'metrics') {
    const saved    = _ob.answers.personalMetrics || [];
    const builtIn  = step.suggestions || [];
    const custom   = saved.filter(m => !builtIn.includes(m));
    const allTags  = [...builtIn, ...custom];
    const tags     = allTags.map(m => {
      const sel = saved.includes(m) ? 'selected' : '';
      return `<span class="ob-tag ${sel}" onclick="_obToggleTag(this,'personalMetrics','${_escHtml(m)}')">${_escHtml(m)}</span>`;
    }).join('');
    inputHTML = `
      <p class="ob-question">${step.question}</p>
      <p class="ob-hint">${step.hint}</p>
      <div class="ob-tag-grid" id="ob-tag-grid-metrics">${tags}</div>
      <div class="ob-add-custom">
        <input class="ob-add-input" id="ob-custom-metric" placeholder="Add your own…"
          onkeydown="if(event.key==='Enter'){event.preventDefault();_obAddCustomMetric();}"/>
        <button class="ob-add-button" onclick="_obAddCustomMetric()">+ Add</button>
      </div>`;
  }

  content.innerHTML = inputHTML;

  // Auto-focus textarea if present
  setTimeout(() => {
    const ta = document.getElementById('ob-input');
    if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
    const ci = document.getElementById('ob-custom-metric');
    if (ci && step.type === 'metrics') ci.focus();
  }, 50);
}

/* ── Save current step answer into _ob.answers ──────────────────────────── */
function _obSaveCurrentAnswer() {
  const step = OB_STEPS[_ob.step];
  if (step.type === 'textarea') {
    const ta = document.getElementById('ob-input');
    if (ta) _ob.answers[step.key] = ta.value.trim();
  } else if (step.type === 'values' && _ob.orgValues.length === 0) {
    // Free text fallback — split by comma
    const ta = document.getElementById('ob-input');
    if (ta) {
      _ob.answers.selectedValues = ta.value.split(',').map(s => s.trim()).filter(Boolean);
    }
  }
  // tag-based steps (values + metrics) are updated live via _obToggleTag
}

/* ── Toggle a tag on/off ─────────────────────────────────────────────────── */
function _obToggleTag(el, key, value) {
  const arr = _ob.answers[key];
  const idx = arr.indexOf(value);
  if (idx === -1) arr.push(value);
  else arr.splice(idx, 1);
  el.classList.toggle('selected', arr.includes(value));
}

/* ── Add a custom metric tag ─────────────────────────────────────────────── */
function _obAddCustomMetric() {
  const inp = document.getElementById('ob-custom-metric');
  if (!inp) return;
  const val = inp.value.trim();
  if (!val) return;
  if (!_ob.answers.personalMetrics.includes(val)) {
    _ob.answers.personalMetrics.push(val);
    // Rebuild tag grid
    const grid = document.getElementById('ob-tag-grid-metrics');
    if (grid) {
      const tag = document.createElement('span');
      tag.className = 'ob-tag selected';
      tag.textContent = val;
      tag.setAttribute('onclick', `_obToggleTag(this,'personalMetrics','${_escHtml(val)}')`);
      grid.appendChild(tag);
    }
  }
  inp.value = '';
  inp.focus();
}

/* ── Next ────────────────────────────────────────────────────────────────── */
function _obNext() {
  _obSaveCurrentAnswer();
  if (_ob.step < OB_STEPS.length - 1) {
    _ob.step++;
    _obRenderStep();
  } else {
    _obSubmitProfile();
  }
}

/* ── Skip (clears this step's answer) ───────────────────────────────────── */
function _obSkip() {
  const step = OB_STEPS[_ob.step];
  // Clear the answer for this step
  if (Array.isArray(_ob.answers[step.key])) {
    _ob.answers[step.key] = [];
  } else {
    _ob.answers[step.key] = '';
  }
  if (_ob.step < OB_STEPS.length - 1) {
    _ob.step++;
    _obRenderStep();
  } else {
    _obSubmitProfile();
  }
}

/* ── Submit all answers to server ────────────────────────────────────────── */
async function _obSubmitProfile() {
  const nextBtn = document.getElementById('ob-next-btn');
  if (nextBtn) { nextBtn.disabled = true; nextBtn.textContent = 'Saving…'; }

  // Mark complete locally IMMEDIATELY — before any async call.
  // This ensures the current session always routes past onboarding even if
  // the server call below fails (e.g. 401 from a server restart mid-session).
  const _obUserId = Auth.currentUser?.id;
  Auth.currentUser = { ...Auth.currentUser, profileComplete: true };
  Auth.save();
  // Durable flag that survives logout — used by handleLogin() repair logic
  // so the server record can be re-synced on the next email+password login.
  if (_obUserId) localStorage.setItem(`iq_profile_complete_${_obUserId}`, '1');

  try {
    const res = await fetch('/api/auth/complete-profile', {
      method:  'POST',
      headers: Auth._headers(),
      body:    JSON.stringify(_ob.answers),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Could not save profile');
    // Server confirmed — client already up to date
  } catch(e) {
    // API call failed (most commonly: server restarted → 401 → token gone).
    // Client is already correct (profileComplete: true set above).
    // handleLogin() will repair the server record automatically on next login.
    console.warn('[onboarding] Profile save to server failed — will repair on next login:', e.message);
  }

  // Belt-and-suspenders: persist goals to localStorage for MemberApp._afterAuth()
  try {
    if (_obUserId) {
      const goalsPayload = {
        goal:     _ob.answers.mainGoals    || '',
        identity: _ob.answers.longTermGoals || '',
        setAt:    new Date().toISOString(),
      };
      localStorage.setItem(`iq_goals_${_obUserId}`, JSON.stringify(goalsPayload));
    }
  } catch(e) { /* localStorage unavailable — not fatal */ }

  // Hide onboarding and continue to app
  document.getElementById('onboarding-overlay').style.display = 'none';
  _obAfterComplete();
}

/* ── Route after personal onboarding completes ───────────────────────────── */
function _obAfterComplete() {
  showToast('Welcome! Your profile is set up.', 'success');
  // SuperAdmins get routed to the admin dashboard after completing personal onboarding.
  // Everyone else (members, coaches) goes to the member view.
  if (Auth.currentUser?.role === 'superadmin') {
    launchApp();
    loadRealOrgData();
    _checkCoachDailyCheckin();
  } else {
    launchMemberView();
  }
}

/* ── Helper: HTML-escape for inline onclick values ───────────────────────── */
function _escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ── Check whether onboarding is needed ─────────────────────────────────── */
function _needsOnboarding() {
  return Auth.currentUser?.profileComplete !== true;
}

/* ═══════════════════════════════════════════════════════════════════════════
   SUPER ADMIN — ORG SETUP WIZARD (Layer 1 of 2)

   Flow:
     Phase "describe" — Super Admin types org description, hits Generate.
     Phase "loading"  — AI suggestion call in progress.
     Phase "review"   — All AI-suggested values/goals/success/behaviours/metrics
                        shown as editable tag lists. SuperAdmin reviews, edits,
                        adds, removes freely before approving.
     Phase "saving"   — POST /api/auth/complete-org-profile

   Principle: AI suggests. Humans approve.
   Nothing is locked. Every field is fully editable before submit.
   ═══════════════════════════════════════════════════════════════════════════ */

const _orgOb = {
  phase: 'describe',  // 'describe' | 'loading' | 'review' | 'saving'
  description: '',
  suggestions: {
    values:            [],
    goals:             [],
    successDefinition: '',
    behaviours:        [],
    metrics:           [],
  },
};

/* ── Entry point ──────────────────────────────────────────────────────────── */
function showOrgSetupWizard(prefillDescription = '') {
  _orgOb.phase       = 'describe';
  _orgOb.description = prefillDescription;
  _orgOb.suggestions = { values: [], goals: [], successDefinition: '', behaviours: [], metrics: [] };

  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display          = 'none';
  const obOverlay = document.getElementById('onboarding-overlay');
  if (obOverlay) obOverlay.style.display = 'none';

  const ov = document.getElementById('org-setup-overlay');
  if (ov) ov.style.display = 'flex';

  _orgObRender();
}

/* ── Render current phase ─────────────────────────────────────────────────── */
function _orgObRender() {
  const body = document.getElementById('org-ob-body');
  if (!body) return;

  if (_orgOb.phase === 'describe') {
    body.innerHTML = `
      <div class="org-ob-phase-title">Step 1 of 2 &mdash; Describe your organisation</div>
      <p class="org-ob-hint">Tell us what your organisation does, who your members are, and what you are trying to achieve. This takes about 30 seconds and helps IntelliQ set up everything for you.</p>
      <textarea id="org-ob-desc" class="org-ob-textarea" rows="5"
        placeholder="e.g. We are a professional development programme for emerging leaders in the financial sector. Our members are high-potential employees at mid-career stage. We want to accelerate their growth, build accountability habits, and prepare them for senior roles within two years."
      >${_escHtml(_orgOb.description)}</textarea>
      <div id="org-ob-desc-error" style="color:var(--danger);font-size:0.8rem;margin-top:0.4rem;display:none"></div>
      <button class="org-ob-btn-primary" onclick="_orgObRequestSuggestions()">Generate AI Suggestions &rarr;</button>
      <p class="org-ob-skip-note">Already know what you want? <a href="#" onclick="_orgObSkipToReview();return false;">Skip AI suggestions</a></p>`;

  } else if (_orgOb.phase === 'loading') {
    body.innerHTML = `
      <div class="org-ob-loading">
        <div class="org-ob-spinner"></div>
        <div class="org-ob-loading-text">Analysing your organisation&hellip;</div>
        <div class="org-ob-loading-sub">IntelliQ is generating suggested values, goals, success criteria, and metrics. This takes about 10 seconds.</div>
      </div>`;

  } else if (_orgOb.phase === 'review') {
    const s = _orgOb.suggestions;
    body.innerHTML = `
      <div class="org-ob-phase-title">Step 2 of 2 &mdash; Review &amp; Approve</div>
      <div class="org-ob-review-note">
        <strong>AI suggests. You decide.</strong> Change anything before approving — add, remove, or rename any item. Nothing is locked.
      </div>

      ${_orgObSection('values',     'Core Values',          s.values,      'tag',      'e.g. Integrity')}
      ${_orgObSection('goals',      'Organisation Goals',   s.goals,       'tag',      'e.g. Improve team performance')}
      <div class="org-ob-section">
        <div class="org-ob-section-label">Success Definition</div>
        <div class="org-ob-section-hint">How will you know the organisation is succeeding?</div>
        <textarea id="org-ob-success" class="org-ob-textarea org-ob-textarea-sm" rows="3"
          oninput="_orgOb.suggestions.successDefinition=this.value"
        >${_escHtml(s.successDefinition)}</textarea>
      </div>
      ${_orgObSection('behaviours', 'Expected Behaviours',  s.behaviours,  'tag',      'e.g. Show up prepared')}
      ${_orgObSection('metrics',    'Health Metrics',       s.metrics,     'tag',      'e.g. Engagement Score')}

      <div id="org-ob-save-error" style="color:var(--danger);font-size:0.8rem;margin-bottom:0.6rem;display:none"></div>
      <button class="org-ob-btn-primary" id="org-ob-approve-btn" onclick="_orgObSubmit()">Approve &amp; Continue &rarr;</button>`;

  } else if (_orgOb.phase === 'saving') {
    body.innerHTML = `
      <div class="org-ob-loading">
        <div class="org-ob-spinner"></div>
        <div class="org-ob-loading-text">Saving your organisation profile&hellip;</div>
      </div>`;
  }
}

/* ── Build one editable tag section ─────────────────────────────────────── */
function _orgObSection(key, label, items, _type, placeholder) {
  const tags = (Array.isArray(items) ? items : []).map((item, i) =>
    `<span class="org-ob-tag" id="org-ob-tag-${key}-${i}">
       ${_escHtml(item)}
       <button class="org-ob-tag-remove" onclick="_orgObRemoveItem('${key}',${i})" title="Remove">&times;</button>
     </span>`
  ).join('');
  return `
    <div class="org-ob-section">
      <div class="org-ob-section-label">${label}</div>
      <div class="org-ob-tag-row" id="org-ob-tags-${key}">${tags}</div>
      <div class="org-ob-add-row">
        <input class="org-ob-add-input" id="org-ob-add-${key}" type="text"
          placeholder="${placeholder}"
          onkeydown="if(event.key==='Enter'){_orgObAddItem('${key}');event.preventDefault();}">
        <button class="org-ob-add-btn" onclick="_orgObAddItem('${key}')">+ Add</button>
      </div>
    </div>`;
}

/* ── Add / remove tag items ──────────────────────────────────────────────── */
function _orgObAddItem(key) {
  const inp = document.getElementById(`org-ob-add-${key}`);
  const val = (inp?.value || '').trim();
  if (!val) return;
  if (!Array.isArray(_orgOb.suggestions[key])) _orgOb.suggestions[key] = [];
  _orgOb.suggestions[key].push(val);
  inp.value = '';
  _orgObRender(); // re-render review phase
}

function _orgObRemoveItem(key, index) {
  if (Array.isArray(_orgOb.suggestions[key])) {
    _orgOb.suggestions[key].splice(index, 1);
  }
  _orgObRender();
}

/* ── Request AI suggestions ──────────────────────────────────────────────── */
async function _orgObRequestSuggestions() {
  const desc = (document.getElementById('org-ob-desc')?.value || '').trim();
  const errEl = document.getElementById('org-ob-desc-error');

  if (!desc || desc.length < 20) {
    if (errEl) { errEl.textContent = 'Please describe your organisation in at least a sentence or two.'; errEl.style.display = 'block'; }
    return;
  }

  _orgOb.description = desc;
  _orgOb.phase = 'loading';
  _orgObRender();

  try {
    const res  = await fetch('/api/org-setup/suggest', {
      method:  'POST',
      headers: Auth._headers(),
      body:    JSON.stringify({ description: desc, orgName: Auth.currentOrg?.orgName || '' }),
    });
    const data = await res.json();

    if (!res.ok || data.error) throw new Error(data.error || 'AI suggestion failed');

    _orgOb.suggestions = {
      values:            Array.isArray(data.values)      ? data.values      : [],
      goals:             Array.isArray(data.goals)        ? data.goals        : [],
      successDefinition: typeof data.successDefinition === 'string' ? data.successDefinition : '',
      behaviours:        Array.isArray(data.behaviours)   ? data.behaviours   : [],
      metrics:           Array.isArray(data.metrics)      ? data.metrics      : [],
    };
    _orgOb.phase = 'review';
  } catch(e) {
    console.warn('[orgSetup] AI suggestion failed:', e.message);
    // Fall through to review with empty lists so admin can still fill manually
    _orgOb.suggestions = { values: [], goals: [], successDefinition: '', behaviours: [], metrics: [] };
    _orgOb.phase = 'review';
    showToast('AI suggestions unavailable — fill in the fields manually.', 'warning');
  }
  _orgObRender();
}

/* ── Skip AI, go straight to blank review ────────────────────────────────── */
function _orgObSkipToReview() {
  const desc = (document.getElementById('org-ob-desc')?.value || '').trim();
  _orgOb.description = desc;
  _orgOb.suggestions = { values: [], goals: [], successDefinition: '', behaviours: [], metrics: [] };
  _orgOb.phase = 'review';
  _orgObRender();
}

/* ── Submit approved org profile ─────────────────────────────────────────── */
async function _orgObSubmit() {
  // Sync success definition from textarea (may not have fired oninput)
  const successEl = document.getElementById('org-ob-success');
  if (successEl) _orgOb.suggestions.successDefinition = successEl.value;

  const errEl = document.getElementById('org-ob-save-error');
  const btn   = document.getElementById('org-ob-approve-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  _orgOb.phase = 'saving';
  _orgObRender();

  try {
    const res  = await fetch('/api/auth/complete-org-profile', {
      method:  'POST',
      headers: Auth._headers(),
      body:    JSON.stringify({
        description:       _orgOb.description,
        values:            _orgOb.suggestions.values,
        goals:             _orgOb.suggestions.goals,
        successDefinition: _orgOb.suggestions.successDefinition,
        behaviours:        _orgOb.suggestions.behaviours,
        metrics:           _orgOb.suggestions.metrics,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Could not save organisation profile');

    // Update local org state so organizationProfileComplete is reflected
    Auth.currentOrg = { ...Auth.currentOrg, organizationProfileComplete: true };
    Auth.save();

    // Hide org setup overlay, proceed to personal onboarding (Layer 2)
    const ov = document.getElementById('org-setup-overlay');
    if (ov) ov.style.display = 'none';

    showToast('Organisation profile saved!', 'success');
    // Now run personal onboarding (7 steps) — Layer 2
    showOnboardingFlow();

  } catch(e) {
    console.error('[orgSetup] Submit failed:', e.message);
    // Go back to review screen so admin isn't stuck
    _orgOb.phase = 'review';
    _orgObRender();
    const newErrEl = document.getElementById('org-ob-save-error');
    if (newErrEl) { newErrEl.textContent = e.message || 'Save failed — please try again.'; newErrEl.style.display = 'block'; }
    const newBtn = document.getElementById('org-ob-approve-btn');
    if (newBtn) { newBtn.disabled = false; newBtn.textContent = 'Approve & Continue →'; }
  }
}

/* ── NAVIGATION ──────────────────────────────────────────── */
function navigate(page){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  const pg = document.getElementById('page-'+page);
  if(pg) pg.classList.add('active');
  document.querySelectorAll(`.nav-item[data-page="${page}"]`).forEach(n=>n.classList.add('active'));
  // Close mobile sidebar drawer on navigation
  document.getElementById('sidebar')?.classList.remove('open');
  AppState.currentPage = page;
  document.querySelector('.topbar-title').textContent = PAGE_TITLES[page] || 'Platform';

  if(page==='dashboard') renderDashboard();
  else if(page==='members')   renderMembers();
  else if(page==='inbox')     renderPlatformInbox();
  else if(page==='analytics') renderAnalytics();
  else if(page==='intelliq')  renderIntelliQ();
  else if(page==='scenarios') renderScenarios();
  else if(page==='people')    renderPeople();
  else if(page==='alerts')    renderAlerts();
  else if(page==='reports')   renderReports();
  else if(page==='settings')     renderSettings();
  else if(page==='myteam')       renderMyTeam();
  else if(page==='assignments')  renderAssignments();
  else if(page==='teaminsights') renderTeamInsights();
}

const PAGE_TITLES = {
  dashboard:    'Overview Dashboard',
  members:      'Members & Profiles',
  inbox:        'Inbox',
  analytics:    'Analytics & Insights',
  intelliq:     'IntelliQ Engine',
  scenarios:    'AI Assessments',
  people:       'People',
  alerts:       'Alerts & Notifications',
  reports:      'Reports & Stat Sheets',
  settings:     'Platform Settings',
  myteam:       'My Team',
  assignments:  'Assignments',
  teaminsights: 'Team Insights',
};

/* ── LOGIN ────────────────────────────────────────────────── */
function showLoginPanel(panel) {
  ['login','setup','register'].forEach(p => {
    const el = document.getElementById(`login-panel-${p}`);
    if (el) el.style.display = p === panel ? 'block' : 'none';
  });
}

function initLogin() {
  // Org tile selection (setup panel)
  let selectedMode = 'school';
  document.querySelectorAll('.org-tile').forEach(tile => {
    tile.addEventListener('click', () => {
      document.querySelectorAll('.org-tile').forEach(t => t.classList.remove('active'));
      tile.classList.add('active');
      selectedMode = tile.dataset.mode;
    });
  });

  // Check for invite token in URL — must run before Auth check
  const _urlParams    = new URLSearchParams(window.location.search);
  const _inviteToken  = _urlParams.get('invite');
  if (_inviteToken) {
    _handleInviteOnBoot(_inviteToken);
    return;
  }

  // Check if already logged in via Auth
  if (Auth.init()) {
    const mode  = Auth.currentOrg?.orgMode || 'school';
    const grade = 'A';
    AppState.init(mode, Auth.currentOrg?.orgName || 'Organisation', Auth.currentUser?.name || 'User', grade);
    AppState.adminRole = Auth.ROLE_LABELS[Auth.currentUser?.role] || 'Admin';
    console.log('[ROUTE] session restore — role:', Auth.currentUser?.role, '| profileComplete:', Auth.currentUser?.profileComplete, '| orgComplete:', Auth.currentOrg?.organizationProfileComplete);

    if (Auth.isMember()) {
      // Repair: if the server lost profileComplete (server restart after onboarding),
      // the cached localStorage value may already be true — trust it.
      // If not, check for the durable iq_profile_complete_ flag written by
      // _obSubmitProfile(). If found, fix locally; server is re-synced on the
      // next email+password login via handleLogin().
      if (_needsOnboarding()) {
        const _uid = Auth.currentUser?.id;
        if (_uid && localStorage.getItem(`iq_profile_complete_${_uid}`)) {
          Auth.currentUser = { ...Auth.currentUser, profileComplete: true };
          Auth.save();
          console.log('[ROUTE] session restore — profileComplete repaired from local flag');
        }
      }
      console.log('[ROUTE] needs onboarding?', _needsOnboarding());
      if (_needsOnboarding()) { showOnboardingFlow(); return; }
      console.log('[ROUTE] launching member view');
      launchMemberView();
      return;
    }
    // SuperAdmin: check org setup first, then personal profile
    if (Auth.currentUser?.role === 'superadmin') {
      if (Auth.currentOrg?.organizationProfileComplete !== true) {
        console.log('[ROUTE] SuperAdmin needs org setup');
        showOrgSetupWizard(); return;
      }
      if (_needsOnboarding()) {
        console.log('[ROUTE] SuperAdmin needs personal onboarding');
        showOnboardingFlow(); return;
      }
    }
    launchApp();
    loadRealOrgData();
    _checkCoachDailyCheckin();
    return;
  }

  // Expose selectedMode for setup handler
  window._selectedOrgMode = selectedMode;
  document.querySelectorAll('.org-tile').forEach(tile => {
    tile.addEventListener('click', () => { window._selectedOrgMode = tile.dataset.mode; });
  });
}

async function handleLogin() {
  const email    = (document.getElementById('login-email')?.value    || '').trim();
  const password = (document.getElementById('login-password')?.value || '').trim();
  const errEl    = document.getElementById('login-error');
  errEl.style.display = 'none';

  if (!email || !password) {
    errEl.textContent = 'Please enter your email and password.'; errEl.style.display = 'block'; return;
  }

  try {
    const { org } = await Auth.login(email, password);

    // Refresh permissions and profile state from server — must be awaited so the
    // routing decision below uses authoritative data, not just the login response.
    try { await Auth.getMe(); } catch(e) { /* use login-response data if getMe fails */ }

    const mode  = org?.orgMode || 'workplace';
    const user  = Auth.currentUser;
    AppState.init(mode, org?.orgName || '', user?.name || '', 'A');
    AppState.adminRole = Auth.ROLE_LABELS[user?.role] || 'Admin';
    console.log('[ROUTE] login success — role:', user?.role, '| profileComplete:', user?.profileComplete, '| orgComplete:', org?.organizationProfileComplete);

    if (Auth.isMember()) {
      console.log('[ROUTE] needs onboarding?', _needsOnboarding());
      // Repair: server lost profileComplete (server restarted after member's onboarding).
      // Check for the durable local flag written by _obSubmitProfile() — it survives logout.
      if (_needsOnboarding()) {
        const _uid = Auth.currentUser?.id;
        if (_uid && localStorage.getItem(`iq_profile_complete_${_uid}`)) {
          console.log('[ROUTE] repairing profileComplete on server (lost on server restart)');
          try {
            const _r = await fetch('/api/auth/complete-profile', {
              method: 'POST', headers: Auth._headers(), body: JSON.stringify({}),
            });
            const _d = await _r.json();
            if (_d.ok) {
              Auth.currentUser = { ...Auth.currentUser, profileComplete: true };
              Auth.save();
              console.log('[ROUTE] profileComplete repaired on server');
            } else {
              throw new Error(_d.error || 'repair rejected');
            }
          } catch(e) {
            // Repair call failed — fix locally so at least this session works.
            // Will retry on next login.
            Auth.currentUser = { ...Auth.currentUser, profileComplete: true };
            Auth.save();
            console.warn('[ROUTE] server repair failed — set locally:', e.message);
          }
        }
      }
      if (_needsOnboarding()) { showOnboardingFlow(); return; }
      console.log('[ROUTE] launching member view');
      launchMemberView();
      return;
    }
    // SuperAdmin: check org setup first, then personal profile
    if (Auth.currentUser?.role === 'superadmin') {
      if (Auth.currentOrg?.organizationProfileComplete !== true) {
        console.log('[ROUTE] SuperAdmin needs org setup');
        showOrgSetupWizard(); return;
      }
      if (_needsOnboarding()) {
        console.log('[ROUTE] SuperAdmin needs personal onboarding');
        showOnboardingFlow(); return;
      }
    }
    launchApp();
    loadRealOrgData();
    _checkCoachDailyCheckin();
  } catch(e) {
    errEl.textContent  = e.message || 'Login failed.';
    errEl.style.display = 'block';
  }
}

async function handleSetup() {
  const orgName     = (document.getElementById('setup-org-name')?.value        || '').trim();
  const firstName   = (document.getElementById('setup-first-name')?.value      || '').trim();
  const lastName    = (document.getElementById('setup-last-name')?.value       || '').trim();
  const email       = (document.getElementById('setup-email')?.value           || '').trim().toLowerCase();
  const password    = (document.getElementById('setup-password')?.value        || '').trim();
  const grade       = document.getElementById('setup-grade')?.value            || 'A';
  const description = (document.getElementById('setup-org-description')?.value || '').trim();
  const errEl       = document.getElementById('setup-error');
  errEl.style.display = 'none';

  if (!orgName || !firstName || !lastName || !email || !password) {
    errEl.textContent = 'Please fill in all fields including first name, last name, and email.';
    errEl.style.display = 'block'; return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errEl.textContent = 'Please enter a valid email address.';
    errEl.style.display = 'block'; return;
  }

  // Quick keyword mode detection (AI analysis happens post-launch)
  let orgMode = 'workplace';
  const descLower = description.toLowerCase();
  if (/sport|football|soccer|basketball|cricket|athletics|team|player|coach|match/i.test(descLower)) orgMode = 'sports';
  else if (/school|student|pupil|class|teacher|academic|curriculum/i.test(descLower)) orgMode = 'school';
  else if (/hospital|patient|clinic|nurse|doctor|healthcare|medical/i.test(descLower)) orgMode = 'healthcare';
  else if (/military|army|navy|air force|regiment|battalion|soldier/i.test(descLower)) orgMode = 'military';
  else if (/government|ministry|department|policy|public service/i.test(descLower)) orgMode = 'government';

  try {
    const data = await Auth.setupOrg(orgName, orgMode, { firstName, lastName, email }, password);
    const fullName = `${firstName} ${lastName}`.trim();
    AppState.init(orgMode, orgName, fullName, grade);
    AppState.adminRole = 'Super Admin';
    AppState.orgDescription = description;

    showToast(`Organisation created! Welcome, ${firstName}.`, 'success');
    // New SuperAdmins go through the org setup wizard before entering the dashboard.
    // Pass description so the wizard can pre-populate Phase 1 and skip manual typing.
    showOrgSetupWizard(description || '');
  } catch(e) {
    errEl.textContent   = e.message || 'Setup failed.';
    errEl.style.display = 'block';
  }
}

/* ── INVITE BOOT HANDLER ───────────────────────────────────────────────── */
// Called on page load when ?invite=TOKEN is present in the URL.
// Validates the token server-side, then shows the registration panel.
async function _handleInviteOnBoot(token) {
  // If a user is already signed in, warn them rather than silently breaking.
  if (Auth.init()) {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app').style.display          = 'none';
    showLoginPanel('login');
    const errEl = document.getElementById('login-error');
    if (errEl) {
      errEl.textContent = `You're already signed in as ${Auth.currentUser?.name || Auth.currentUser?.email || 'another account'}. Sign out first to use this invite link.`;
      errEl.style.display = 'block';
    }
    // Strip the invite token from the URL so a reload goes to normal login
    window.history.replaceState({}, '', window.location.pathname);
    return;
  }

  // Keep token in memory for the register submit
  window._pendingInviteToken = token;

  // Show login screen while we validate
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app').style.display          = 'none';

  try {
    const res  = await fetch(`/api/auth/invite-info?token=${encodeURIComponent(token)}`);
    const data = await res.json();

    if (!res.ok || !data.ok) {
      // Invalid / expired — fall through to normal login with a message
      showLoginPanel('login');
      const errEl = document.getElementById('login-error');
      if (errEl) { errEl.textContent = data.error || 'This invite link is invalid or has expired.'; errEl.style.display = 'block'; }
      return;
    }

    // Show registration panel
    showLoginPanel('register');

    const badge = document.getElementById('invite-org-badge');
    if (badge) {
      badge.innerHTML = `You've been invited to join <strong>${data.orgName}</strong> as a <strong>${data.role}</strong>.`;
    }

    // Prefill email if invite was email-targeted
    if (data.email) {
      const emailEl = document.getElementById('reg-email');
      if (emailEl) { emailEl.value = data.email; emailEl.readOnly = true; emailEl.style.opacity = '0.7'; }
    }

    // Focus first name
    setTimeout(() => document.getElementById('reg-first-name')?.focus(), 100);

  } catch(e) {
    showLoginPanel('login');
  }
}

/* ── INVITE REGISTRATION SUBMIT ────────────────────────────────────────── */
async function handleInviteRegister() {
  const firstName = (document.getElementById('reg-first-name')?.value || '').trim();
  const lastName  = (document.getElementById('reg-last-name')?.value  || '').trim();
  const email     = (document.getElementById('reg-email')?.value      || '').trim().toLowerCase();
  const password  = (document.getElementById('reg-password')?.value   || '');
  const errEl     = document.getElementById('reg-error');
  const token     = window._pendingInviteToken;
  errEl.style.display = 'none';

  if (!firstName)      { errEl.textContent = 'First name is required.'; errEl.style.display = 'block'; return; }
  if (!email)          { errEl.textContent = 'Email address is required.'; errEl.style.display = 'block'; return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errEl.textContent = 'Enter a valid email.'; errEl.style.display = 'block'; return; }
  if (!password || password.length < 8) { errEl.textContent = 'Password must be at least 8 characters.'; errEl.style.display = 'block'; return; }
  if (!token)          { errEl.textContent = 'Invite token missing. Please use the invite link again.'; errEl.style.display = 'block'; return; }

  const btn = document.querySelector('#login-panel-register .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Creating account…'; }

  try {
    const res  = await fetch('/api/auth/join-invite', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ token, firstName, lastName, email, password }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Registration failed.');

    // Auto-login: store credentials and launch
    Auth.token       = data.token;
    Auth.currentUser = data.user;
    Auth.currentOrg  = data.org;
    // Load full permissions from /me
    await Auth.getMe();
    Auth.save();

    const mode  = data.org?.orgMode || 'workplace';
    const grade = 'A';
    AppState.init(mode, data.org?.orgName || '', data.user?.name || '', grade);
    AppState.adminRole = Auth.ROLE_LABELS[data.user?.role] || 'Member';

    // Remove invite token from URL without reload
    window._pendingInviteToken = null;
    window.history.replaceState({}, document.title, window.location.pathname);

    showToast(`Welcome, ${firstName}! Your account is ready.`, 'success');

    if (Auth.isMember()) {
      // All new members need onboarding — profileComplete is false on first join
      showOnboardingFlow();
      return;
    }
    launchApp();
    loadRealOrgData();

  } catch(e) {
    errEl.textContent   = e.message || 'Registration failed.';
    errEl.style.display = 'block';
    if (btn) { btn.disabled = false; btn.textContent = 'Create Account →'; }
  }
}

/* ── ORG INTELLIGENCE — Show extracted traits after setup ──────────────── */
async function _analyseOrgDescription(description, orgName, orgCode) {
  try {
    const res = await fetch('/api/org/describe', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ description, orgName }),
    });
    if (!res.ok) throw new Error();
    const data = await res.json();

    // Update orgMode if AI detected a different one
    if (data.orgMode && data.orgMode !== AppState.mode) {
      AppState.mode = data.orgMode;
      renderSidebar();
    }

    // Store traits on AppState
    AppState.orgTraits      = data.traits    || [];
    AppState.orgGoals       = data.goals     || [];
    AppState.orgEnvironment = data.environment || '';
    AppState.orgSuccess     = data.successLooks || '';

    // Show org intelligence modal
    document.getElementById('org-intel-sub').textContent     = `${orgName} — detected as ${data.orgMode}`;
    document.getElementById('org-intel-summary').textContent  = data.summary || '';
    document.getElementById('org-intel-env').textContent      = data.environment || '—';
    document.getElementById('org-intel-success').textContent  = data.successLooks || '—';

    const traitsEl = document.getElementById('org-intel-traits');
    traitsEl.innerHTML = (data.traits || []).map(t =>
      `<span style="font-size:0.75rem;padding:4px 10px;background:rgba(124,90,245,0.12);border:1px solid rgba(124,90,245,0.25);border-radius:20px;color:var(--accent)">${t}</span>`
    ).join('');

    const goalsEl = document.getElementById('org-intel-goals');
    goalsEl.innerHTML = (data.goals || []).map(g =>
      `<div style="display:flex;align-items:flex-start;gap:0.5rem;padding:0.4rem 0;border-bottom:1px solid var(--border);font-size:0.82rem;color:var(--text-secondary)"><span style="color:var(--accent);flex-shrink:0">→</span>${g}</div>`
    ).join('');

    openModal('org-intelligence-modal');

  } catch(err) {
    // Silent fail — org still works, just without extracted traits
    _checkCoachDailyCheckin();
  }
}

function closeOrgIntelModal() {
  closeAllModals();
  _checkCoachDailyCheckin();
}

/* ── COACH DAILY CHECK-IN ──────────────────────────────────────────────── */
function _checkCoachDailyCheckin() {
  const today    = new Date().toLocaleDateString('en-GB');
  const lastKey  = `iq_coach_checkin_${Auth.currentUser?.id || 'admin'}`;
  const lastDate = localStorage.getItem(lastKey);
  if (lastDate === today) return; // Already done today

  // Set role-specific prompt
  const role   = Auth.currentUser?.role || 'coach';
  const name   = AppState.adminName.split(' ')[0];
  const hour   = new Date().getHours();
  const tod    = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

  const prompts = {
    superadmin: `Good ${tod}, ${name}. How's the organisation running? Anything at the top of your mind — people, decisions, things you're tracking?`,
    admin:      `Good ${tod}, ${name}. How's the programme going? Any issues or highlights worth flagging?`,
    coach:      `Good ${tod}, ${name}. How's the team doing? Anyone you're keeping an eye on? Anything you want to record?`,
  };

  document.getElementById('ccc-title').textContent  = `${tod.charAt(0).toUpperCase() + tod.slice(1)} check-in`;
  document.getElementById('ccc-prompt').textContent = prompts[role] || prompts.coach;

  setTimeout(() => openModal('coach-checkin-modal'), 600);
}

async function submitCoachCheckin() {
  const text  = (document.getElementById('ccc-text')?.value || '').trim();
  if (!text)  { showToast('Write something — even a line', 'warning'); return; }

  const btn = document.getElementById('ccc-submit-btn');
  btn.textContent = 'Sending…'; btn.disabled = true;

  const today   = new Date().toLocaleDateString('en-GB');
  const lastKey = `iq_coach_checkin_${Auth.currentUser?.id || 'admin'}`;
  localStorage.setItem(lastKey, today);

  try {
    const res = await fetch('/api/checkin/freeform', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        orgCode:    AppState.orgCode || AppState.orgName.toLowerCase().replace(/\s+/g,'-'),
        memberName: AppState.adminName,
        text,
        mood:       null,
        role:       Auth.currentUser?.role || 'coach',
        orgMode:    AppState.mode,
        orgName:    AppState.orgName,
      }),
    });
    const data = res.ok ? await res.json() : { aiResponse: null };

    document.getElementById('ccc-form').style.display     = 'none';
    document.getElementById('ccc-response').style.display = 'block';
    document.getElementById('ccc-ai-text').textContent    = data.aiResponse || 'Check-in saved. Have a good session.';

  } catch(err) {
    closeAllModals();
    showToast('Check-in saved', 'success');
  }
}

/* ── MEMBER VIEW — unified shell inside main app ────────────────────────── */
function launchMemberView() {
  console.log('[ROUTE] launchMemberView — showing member shell');

  // Hide all source screens and overlays
  document.getElementById('login-screen').style.display = 'none';
  const obOv  = document.getElementById('onboarding-overlay');
  const orgOv = document.getElementById('org-setup-overlay');
  const appEl = document.getElementById('app');
  if (obOv)  obOv.style.display  = 'none';
  if (orgOv) orgOv.style.display = 'none';
  if (appEl) appEl.style.display = 'none';  // hide admin shell explicitly

  const shell = document.getElementById('member-shell');
  if (!shell) {
    console.error('[ROUTE] launchMemberView — #member-shell not found in DOM');
    _showGlobalError('Member shell missing from page — please refresh.', new Error('#member-shell not found'));
    return;
  }

  // Use inline style (not class) so it always wins regardless of prior CSS state
  shell.style.display = 'flex';
  shell.classList.add('visible');

  console.log('[ROUTE] MemberApp.init start');
  if (typeof MemberApp !== 'undefined') {
    try {
      MemberApp.init();
      console.log('[ROUTE] MemberApp.init success');
    } catch(err) {
      console.error('[ROUTE] MemberApp.init failed:', err);
      shell.innerHTML = _memberErrorHTML(err);
    }
  } else {
    console.error('[ROUTE] MemberApp is not defined — member-view.js may not have loaded');
    shell.innerHTML = _memberErrorHTML(new Error('MemberApp script not loaded'));
  }
}

function _memberErrorHTML(err) {
  const detail = err?.message || String(err);
  return `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                min-height:100vh;padding:2rem;text-align:center;gap:1.2rem;background:#fff">
      <div style="font-size:2.5rem">⚠️</div>
      <div style="font-weight:700;font-size:1.15rem;color:#111">Something went wrong loading your dashboard.</div>
      <div style="color:#666;font-size:0.85rem;max-width:320px;line-height:1.5">
        This is usually a temporary issue. Try refreshing — if it keeps happening, log out and back in.
      </div>
      <div style="display:flex;gap:0.8rem;flex-wrap:wrap;justify-content:center;margin-top:0.4rem">
        <button onclick="location.reload()"
          style="padding:0.6rem 1.6rem;border-radius:8px;background:#0066ff;color:#fff;border:none;cursor:pointer;font-size:0.9rem;font-weight:600">
          Retry
        </button>
        <button onclick="Auth.logout();location.reload()"
          style="padding:0.6rem 1.4rem;border-radius:8px;background:#f3f4f6;color:#333;border:none;cursor:pointer;font-size:0.9rem">
          Log out
        </button>
        <button onclick="navigator.clipboard?.writeText(${JSON.stringify(detail)}).then(()=>showToast('Copied','success')).catch(()=>{})"
          style="padding:0.6rem 1.2rem;border-radius:8px;background:#f3f4f6;color:#555;border:none;cursor:pointer;font-size:0.82rem">
          Copy error
        </button>
      </div>
      <details style="margin-top:0.5rem;max-width:380px">
        <summary style="font-size:0.75rem;color:#aaa;cursor:pointer">Error details</summary>
        <pre style="font-size:0.72rem;color:#999;text-align:left;white-space:pre-wrap;margin-top:0.4rem">${detail}</pre>
      </details>
    </div>`;
}

/* ── Load real org data from server and populate AppState ─────────────── */
async function loadRealOrgData() {
  try {
    let realUsers = [];

    if (Auth.isAdmin() || Auth.isSuperAdmin()) {
      // ── Admin / SuperAdmin: full org tree (needed for People management) ──
      // Filter out the superadmin account from the member list — admins
      // manage all other users but superadmin is not a "member" in the UI.
      const { flat } = await Auth.getOrgTree();
      realUsers = (flat || []).filter(u => u.role !== 'superadmin');
      console.log(`[VISIBILITY] Admin path — loaded ${realUsers.length} users via org-tree`);
    } else {
      // ── Coach / Member: server-enforced subtree visibility ────────────────
      // GET /api/workspace/visible-members returns only users this person
      // is allowed to see based on their org tree position + permissions.
      const res  = await fetch('/api/workspace/visible-members', { headers: Auth._headers() });
      const data = await res.json();
      if (data.ok) {
        // visible-members already strips superadmin; map to the same shape
        // that buildRealMemberRecord expects (id, name, email, role, …)
        realUsers = (data.members || []).map(m => ({
          id:             m.userId,
          name:           m.name,
          email:          m.email,
          role:           m.role,
          status:         m.status,
          passwordSet:    m.passwordSet,
          profileComplete:m.profileComplete,
          nodeIds:        m.nodeIds,
          latestCheckin:  m.latestCheckin, // kept on the record for My Team panel
        }));
        console.log(`[VISIBILITY] Restricted path — ${realUsers.length} visible users for ${Auth.currentUser?.id}`);
      } else {
        console.warn('[VISIBILITY] visible-members failed:', data.error);
      }
    }

    // Build real member records — clear any previous data first
    AppState.members = realUsers.map((u, i) => buildRealMemberRecord(u, i));
    AppState.stats   = buildEmptyOrgStats(AppState.members.length);
    AppState.orgDataLoaded = true;

    // Load org-specific metrics and values in parallel
    const [metricsRes, valuesRes] = await Promise.allSettled([
      fetch('/api/metrics', { headers: Auth._headers() }),
      fetch('/api/values',  { headers: Auth._headers() }),
    ]);
    if (metricsRes.status === 'fulfilled' && metricsRes.value.ok) {
      const d = await metricsRes.value.json();
      AppState.orgMetrics = d.metrics || [];
    }
    if (valuesRes.status === 'fulfilled' && valuesRes.value.ok) {
      const d = await valuesRes.value.json();
      AppState.orgValues  = d.values  || [];
    }

    // Re-render pages that are currently visible
    const page = AppState.currentPage;
    if (page === 'dashboard')    renderDashboard();
    if (page === 'members')      renderMembers();
    if (page === 'analytics')    renderAnalytics();
    if (page === 'reports')      renderReports();
    if (page === 'intelliq')     renderIntelliQ();
    if (page === 'people')       renderPeople();
    if (page === 'alerts')       renderAlerts();
    if (page === 'myteam')       renderMyTeam();
    if (page === 'assignments')  renderAssignments();
    if (page === 'teaminsights') renderTeamInsights();
    updateAlertBadge();
  } catch(e) {
    console.warn('loadRealOrgData failed:', e.message);
    // Don't crash — platform stays functional with empty state
    AppState.orgDataLoaded = true;
  }
}

/* ── REMOVE PERSON ────────────────────────────────────────────────────────
   openRemovePersonModal(userId)   — shows inline confirm modal
   _confirmRemovePerson(userId, deleteData) — calls API, updates AppState
   copyMemberInviteLink(userId, email)  — generates invite + copies link
   regenerateMemberInvite(userId, email) — generates fresh invite + shows link
─────────────────────────────────────────────────────────────────────────── */

function openRemovePersonModal(userId) {
  const member = AppState.members.find(m => m.userId === userId || m.authId === userId);
  if (!member) { showToast('Person not found', 'warning'); return; }

  _showInlineModal(`
    <div class="card-title" style="margin-bottom:0.8rem">Remove person</div>
    <div style="display:flex;align-items:center;gap:0.8rem;padding:0.8rem;background:var(--surface-2);border-radius:8px;margin-bottom:1rem">
      <div style="width:36px;height:36px;border-radius:50%;background:${member.color};display:flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:700;color:#fff;flex-shrink:0">${member.initials}</div>
      <div>
        <div style="font-weight:600;font-size:0.9rem">${member.name}</div>
        <div style="font-size:0.75rem;color:var(--text-muted)">${member.email || 'No email on record'}</div>
      </div>
    </div>

    <div style="font-size:0.82rem;color:var(--text-secondary);margin-bottom:1rem;line-height:1.6">
      <strong>What happens when you remove this person:</strong>
      <ul style="margin:0.4rem 0 0 1.2rem;padding:0">
        <li>They will immediately lose access to this organisation.</li>
        <li>Their email address can be invited again — the slot is freed.</li>
        <li>They are removed from all org tree nodes and groups.</li>
      </ul>
    </div>

    <div style="margin-bottom:1rem">
      <label style="font-size:0.78rem;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:var(--text-muted);display:block;margin-bottom:0.4rem">Data handling</label>
      <label style="display:flex;align-items:flex-start;gap:0.5rem;padding:0.6rem 0.7rem;border:1px solid var(--border);border-radius:6px;cursor:pointer;margin-bottom:0.4rem">
        <input type="radio" name="rm-data-opt" value="preserve" checked style="margin-top:2px;flex-shrink:0"/>
        <span><strong style="font-size:0.82rem">Preserve historical data</strong><br>
          <span style="font-size:0.75rem;color:var(--text-muted)">Check-ins, assessments, goals and results are kept for records.</span></span>
      </label>
      <label style="display:flex;align-items:flex-start;gap:0.5rem;padding:0.6rem 0.7rem;border:1px solid rgba(247,79,79,0.3);border-radius:6px;cursor:pointer">
        <input type="radio" name="rm-data-opt" value="delete" style="margin-top:2px;flex-shrink:0"/>
        <span><strong style="font-size:0.82rem;color:var(--danger)">Delete all data</strong><br>
          <span style="font-size:0.75rem;color:var(--text-muted)">Permanently removes all check-ins, assessments, goals and results. Cannot be undone.</span></span>
      </label>
    </div>

    <div style="display:flex;gap:0.5rem;justify-content:flex-end">
      <button class="btn btn-outline btn-sm" onclick="_closeInlineModal()">Cancel</button>
      <button class="btn btn-sm" style="background:var(--danger);color:#fff;border:none"
        onclick="_confirmRemovePerson('${userId}')">Remove ${member.name.split(' ')[0]}</button>
    </div>`);
}

async function _confirmRemovePerson(userId) {
  const deleteData = document.querySelector('input[name="rm-data-opt"]:checked')?.value === 'delete';
  const member     = AppState.members.find(m => m.userId === userId || m.authId === userId);
  const name       = member?.name || 'Person';

  const btn = document.querySelector('#_inline-modal-overlay .btn[style*="var(--danger)"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Removing…'; }

  try {
    await Auth.deleteUser(userId, { deleteData });
    _closeInlineModal();

    // Remove from local AppState immediately — no reload required
    AppState.members = AppState.members.filter(m => m.userId !== userId && m.authId !== userId);
    AppState.stats   = buildEmptyOrgStats(AppState.members.length);

    // Also remove from any OrgTree nodes in memory
    Object.values(OrgTree._nodes || {}).forEach(node => {
      if (node.memberIds) node.memberIds = node.memberIds.filter(id => id !== userId);
      if (node.leaderIds) node.leaderIds = node.leaderIds.filter(id => id !== userId);
    });

    showToast(`${name} removed${deleteData ? ' and data deleted' : ''}`, 'success');

    // Refresh whichever page is visible
    const page = AppState.currentPage;
    if (page === 'members')  renderMembers();
    if (page === 'people')   renderPeople();
    if (page === 'dashboard') renderDashboard();

  } catch(e) {
    showToast(e.message || 'Could not remove person', 'warning');
    if (btn) { btn.disabled = false; btn.textContent = `Remove`; }
  }
}

async function copyMemberInviteLink(userId, email) {
  try {
    const res  = await authFetch('/api/auth/invite', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orgCode: AppState.orgCode, role: 'member',
        label: email || userId, expiryDays: 14,
      }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    const link = `${window.location.origin}${data.url}`;
    await navigator.clipboard.writeText(link);
    showToast('Invite link copied to clipboard', 'success');
  } catch(e) {
    showToast(e.message || 'Could not generate link', 'warning');
  }
}

async function regenerateMemberInvite(userId, email) {
  try {
    const res  = await authFetch('/api/auth/invite', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orgCode: AppState.orgCode, role: 'member',
        label: email || userId, expiryDays: 14,
      }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    const link = `${window.location.origin}${data.url}`;
    const safeLink = link.replace(/'/g, "\\'");
    _showInlineModal(`
      <div class="card-title" style="margin-bottom:0.8rem">New invite link generated</div>
      <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:0.5rem">Share this link — it expires in 14 days.</div>
      <div style="font-family:monospace;font-size:0.75rem;background:var(--surface-2);border:1px solid var(--border);border-radius:6px;padding:0.6rem;word-break:break-all;margin-bottom:0.8rem;color:var(--accent)">${link}</div>
      <div style="display:flex;gap:0.5rem;justify-content:flex-end">
        <button class="btn btn-outline btn-sm" onclick="_closeInlineModal()">Close</button>
        <button class="btn btn-accent btn-sm"
          onclick="navigator.clipboard.writeText('${safeLink}').then(()=>showToast('Copied!','success'))">📋 Copy Link</button>
      </div>`);
  } catch(e) {
    showToast(e.message || 'Could not generate link', 'warning');
  }
}

/* ── Auth-aware fetch helper — intercepts 401s globally ──────────────── */
async function authFetch(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (Auth.token) headers['Authorization'] = `Bearer ${Auth.token}`;
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    _showSessionExpired();
    // Return a synthetic non-ok response so callers don't crash
    return new Response(JSON.stringify({ error: 'Session expired' }), { status: 401 });
  }
  return res;
}

let _sessionExpiredShown = false;
function _showSessionExpired() {
  if (_sessionExpiredShown) return;
  _sessionExpiredShown = true;
  // Show a non-intrusive banner at the top of the page
  const existing = document.getElementById('session-expired-banner');
  if (existing) return;
  const banner = document.createElement('div');
  banner.id = 'session-expired-banner';
  banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#f74f4f;color:#fff;text-align:center;padding:0.75rem 1rem;font-size:0.88rem;display:flex;align-items:center;justify-content:center;gap:1rem';
  banner.innerHTML = `
    <span>⏱ Your session has expired.</span>
    <button onclick="Auth.logout()" style="background:#fff;color:#f74f4f;border:none;border-radius:4px;padding:4px 14px;font-size:0.85rem;cursor:pointer;font-weight:700">Log In Again</button>
  `;
  document.body.prepend(banner);
}

function launchApp(){
  console.log('[ROUTE] launchApp — showing admin dashboard');

  // Hide all possible source screens / overlays
  document.getElementById('login-screen').style.display    = 'none';
  const obOv  = document.getElementById('onboarding-overlay');
  const orgOv = document.getElementById('org-setup-overlay');
  if (obOv)  obOv.style.display  = 'none';
  if (orgOv) orgOv.style.display = 'none';

  const app = document.getElementById('app');
  // CRITICAL: clear any inline display:none set by showOnboardingFlow() or
  // showOrgSetupWizard() before adding the class — inline styles override CSS classes.
  app.style.display = '';
  app.classList.add('visible');

  try {
    renderSidebar();
    renderTopbar();
    renderAllPages();
    navigate('dashboard');
  } catch(err) {
    console.error('[ROUTE] launchApp render error:', err);
  }

  // Use real orgCode from Auth session, fall back to derived
  const orgCode = Auth.currentUser?.orgCode || AppState.orgName.toLowerCase().replace(/\s+/g,'-');
  AppState.orgCode = orgCode;
  fetch('/api/platform/register-org', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orgCode, orgName: AppState.orgName, orgMode: AppState.mode }),
  }).catch(() => {});

  console.log('[ROUTE] launchApp — done');
}

/* ── SIDEBAR ──────────────────────────────────────────────── */
function renderSidebar(){
  const mode     = AppState.mode;
  const modeInfo = ORG_MODES[mode] || { label: AppState.orgName || 'Platform', icon: '🏢', color: '#4f8ef7' };
  const color    = modeInfo.color || '#4f8ef7';

  document.querySelector('.sb-logo-text').textContent = 'Platform';
  document.querySelector('.sb-logo-sub').textContent  = AppState.grade + '-Grade · IntelliQ';

  const badge = document.querySelector('.mode-badge');
  if (badge) {
    badge.textContent = `${modeInfo.icon || '🏢'}  ${modeInfo.label}`;
    badge.style.background = color+'22';
    badge.style.color      = color;
    badge.style.border     = `1px solid ${color}44`;
  }

  document.querySelector('.user-name').textContent = AppState.adminName;
  document.querySelector('.user-role').textContent = AppState.adminRole;
  const av = document.querySelector('.sidebar-footer .user-avatar');
  if (av) {
    av.textContent  = AppState.adminName.split(' ').map(w=>w[0]).join('').slice(0,2);
    av.style.background = color;
  }

  // ── Dynamic permission-driven nav ─────────────────────────────────────
  // Filter WORKSPACE_MODULES by Auth.canDo(). null permission = always shown.
  // Sections are rendered as group labels when a new section label appears.
  const nav = document.getElementById('sidebar-nav');
  if (nav) {
    let currentSection = null;
    let html = '';
    const activePage = AppState.currentPage || 'dashboard';

    WORKSPACE_MODULES.forEach(mod => {
      // Permission gate
      if (mod.permission !== null && !Auth.canDo(mod.permission)) return;

      // Section label
      if (mod.section && mod.section !== currentSection) {
        currentSection = mod.section;
        html += `<div class="nav-section-label">${currentSection}</div>`;
      }

      const activeClass = activePage === mod.id ? ' active' : '';
      const badgeHTML   = mod.badge
        ? `<span class="nav-badge" style="display:none">0</span>`
        : '';

      html += `<div class="nav-item${activeClass}" data-page="${mod.id}">
        <span class="nav-icon">${mod.icon}</span> ${mod.label}${badgeHTML}
      </div>`;
    });

    nav.innerHTML = html;

    // Re-attach click listeners (event delegation on the nav container)
    nav.querySelectorAll('.nav-item[data-page]').forEach(item => {
      item.addEventListener('click', () => navigate(item.dataset.page));
    });
  }

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

  // Populate user account widget
  const user = Auth.currentUser;
  if (!user) return;
  const initials = (user.name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const initEl   = document.getElementById('topbar-avatar-initials');
  const nameEl   = document.getElementById('topbar-account-name');
  const emlEl    = document.getElementById('topbar-account-email');
  const roleEl   = document.getElementById('topbar-account-role');
  if (initEl) initEl.textContent = initials;
  if (nameEl) nameEl.textContent = user.name  || '—';
  if (emlEl)  emlEl.textContent  = user.email || '—';
  if (roleEl) roleEl.textContent = Auth.ROLE_LABELS?.[user.role] || user.role || 'Admin';
}

function toggleAdminAccountMenu() {
  const menu = document.getElementById('topbar-account-menu');
  if (!menu) return;
  const opening = !menu.classList.contains('open');
  menu.classList.toggle('open', opening);
  if (opening) {
    const close = (e) => {
      const btn = document.getElementById('topbar-avatar-btn');
      if (!btn?.contains(e.target) && !menu.contains(e.target)) {
        menu.classList.remove('open');
        document.removeEventListener('click', close);
      }
    };
    setTimeout(() => document.addEventListener('click', close), 10);
  }
}

/* ── Mobile sidebar toggle ───────────────────────────────────────────── */
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  const opening = !sidebar.classList.contains('open');
  sidebar.classList.toggle('open', opening);
  if (opening) {
    // Close when clicking outside
    const close = (e) => {
      if (!sidebar.contains(e.target) && e.target.id !== 'topbar-hamburger') {
        sidebar.classList.remove('open');
        document.removeEventListener('click', close);
      }
    };
    setTimeout(() => document.addEventListener('click', close), 10);
  }
}

/* ── Onboarding empty-state HTML (reused across pages) ───────────────── */
function _emptyStateHTML(_mode) {
  // Generic — no mode-specific terms
  return `
    <div style="text-align:center;padding:3rem 1rem;max-width:480px;margin:0 auto">
      <div style="font-size:2.5rem;margin-bottom:1rem">🚀</div>
      <div style="font-size:1.05rem;font-weight:700;color:var(--text-primary);margin-bottom:0.5rem">No members yet</div>
      <div style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:1.5rem;line-height:1.6">
        Add people to your organisation to start using IntelliQ — manually, by spreadsheet, invite, or join link.
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:0.6rem;justify-content:center">
        <button class="btn btn-accent btn-sm" onclick="navigate('people');setTimeout(()=>switchPeopleTab('onboard'),100)">+ Add Person</button>
        <button class="btn btn-outline btn-sm" onclick="navigate('people');setTimeout(()=>{switchPeopleTab('onboard');_openOnboardSection('import')},100)">📁 Import</button>
        <button class="btn btn-outline btn-sm" onclick="navigate('people');setTimeout(()=>{switchPeopleTab('onboard');_openOnboardSection('invite')},100)">✉ Invite</button>
        <button class="btn btn-outline btn-sm" onclick="navigate('people');setTimeout(()=>{switchPeopleTab('onboard');_openOnboardSection('link')},100)">🔗 Join Link</button>
      </div>
    </div>`;
}

/* ── DASHBOARD ───────────────────────────────────────────── */
function renderDashboard(){
  const s     = AppState.stats;
  const color = ORG_MODES[AppState.mode]?.color || 'var(--accent)';

  // ── Empty state guard ─────────────────────────────────────
  if (AppState.orgDataLoaded && AppState.members.length === 0) {
    const statsGrid = document.getElementById('dash-stats');
    if (statsGrid) statsGrid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:3rem 1rem">
        <div style="font-size:2.5rem;margin-bottom:0.75rem">🚀</div>
        <div style="font-size:1.1rem;font-weight:700;margin-bottom:0.4rem">Your platform is set up</div>
        <div style="font-size:0.85rem;color:var(--text-secondary);max-width:360px;margin:0 auto 1.2rem">
          Start by adding people to your organisation. Use <strong>People → Onboard</strong> to add them individually or by invite.
        </div>
        <button class="btn btn-accent" onclick="navigate('people');switchPeopleTab('onboard')">+ Add First Person</button>
      </div>`;
    return;
  }

  // ── Three-question summary panel ──────────────────────────
  const atRisk    = AppState.members.filter(m => m.wellnessScore !== null && m.wellnessScore < 50).length;
  const improving = AppState.members.filter(m => m.trend === 'up').length;
  const topByIQ   = [...AppState.members].filter(m=>m.iqScore).sort((a,b)=>b.iqScore-a.iqScore)[0];
  const unreadAlerts = AppState.getUnreadAlertCount?.() || 0;

  const statsGrid = document.getElementById('dash-stats');
  statsGrid.innerHTML = `
    <!-- Question 1: What is happening? -->
    <div class="stat-card" style="border-left:3px solid ${color}">
      <div class="stat-label" style="margin-bottom:0.5rem">What is happening?</div>
      <div style="font-size:1.8rem;font-weight:800;margin-bottom:0.25rem">${s.totalMembers}</div>
      <div style="font-size:0.8rem;color:var(--text-secondary)">people in your org</div>
      <div style="font-size:0.78rem;margin-top:0.5rem;color:var(--text-muted)">
        ${s.avgIQ !== null ? `Avg IQ: <strong>${s.avgIQ}</strong> &nbsp;·&nbsp;` : ''}
        ${s.avgWellness !== null ? `Avg Wellness: <strong>${s.avgWellness}</strong>` : 'No assessment data yet'}
      </div>
    </div>

    <!-- Question 2: Who needs attention? -->
    <div class="stat-card" style="border-left:3px solid ${atRisk > 0 ? 'var(--danger)' : 'var(--success)'}">
      <div class="stat-label" style="margin-bottom:0.5rem">Who needs attention?</div>
      <div style="font-size:1.8rem;font-weight:800;margin-bottom:0.25rem;color:${atRisk>0?'var(--danger)':'var(--success)'}">${atRisk}</div>
      <div style="font-size:0.8rem;color:var(--text-secondary)">at-risk members</div>
      <div style="font-size:0.78rem;margin-top:0.5rem;color:var(--text-muted)">
        ${improving} improving &nbsp;·&nbsp; ${unreadAlerts} unread alerts
      </div>
    </div>

    <!-- Question 3: What should I do? -->
    <div class="stat-card" style="border-left:3px solid var(--accent)">
      <div class="stat-label" style="margin-bottom:0.5rem">What should I do?</div>
      ${atRisk > 0
        ? `<div style="font-size:0.88rem;font-weight:600;margin-bottom:0.25rem">Check on ${atRisk} at-risk ${atRisk===1?'member':'members'}</div>
           <div style="font-size:0.78rem;color:var(--text-muted)">Wellness below threshold — schedule a check-in</div>
           <button class="btn btn-outline btn-sm" style="margin-top:0.5rem;font-size:0.75rem" onclick="navigate('intelliq')">View IntelliQ Engine →</button>`
        : improving > 0
          ? `<div style="font-size:0.88rem;font-weight:600;margin-bottom:0.25rem">Recognise ${improving} improving ${improving===1?'member':'members'}</div>
             <div style="font-size:0.78rem;color:var(--text-muted)">Positive momentum — reinforce it</div>`
          : `<div style="font-size:0.88rem;font-weight:600;margin-bottom:0.25rem">Run your first assessments</div>
             <div style="font-size:0.78rem;color:var(--text-muted)">No data yet — assign scenarios to get started</div>
             <button class="btn btn-outline btn-sm" style="margin-top:0.5rem;font-size:0.75rem" onclick="navigate('scenarios')">Assessments →</button>`
      }
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
    <tr onclick="showProfile('${m.id}')">
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
  // ── Empty state guard ─────────────────────────────────────
  if (AppState.orgDataLoaded && AppState.members.length === 0) {
    const tabsEl = document.getElementById('members-group-tabs');
    if (tabsEl) tabsEl.innerHTML = '';
    const grid = document.getElementById('members-grid');
    if (grid) grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:3rem 1rem">
        <div style="font-size:2rem;margin-bottom:0.5rem">👥</div>
        <div style="font-weight:600;margin-bottom:0.3rem">No members yet</div>
        <div style="font-size:0.82rem;color:var(--text-secondary);margin-bottom:1rem">Add people via People → Onboard</div>
        <button class="btn btn-accent btn-sm" onclick="navigate('people');switchPeopleTab('onboard')">+ Add Person</button>
      </div>`;
    return;
  }

  // Use org-defined metrics for column headers if available
  const orgMetrics = AppState.orgMetrics || [];
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
    ? filtered.map(m => memberCardHTML(m, orgMetrics)).join('')
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
  const mode    = AppState.mode;
  const color   = ORG_MODES[mode]?.color || 'var(--accent)';
  // Use org-defined metrics; fallback to any scores keys found on members
  const metrics = (AppState.orgMetrics || []).map(m => m.name || m) ||
    Object.keys(AppState.members[0]?.scores || {});

  // ── Empty state guard ─────────────────────────────────────
  if (AppState.orgDataLoaded && AppState.members.length === 0) {
    const riskEl = document.getElementById('analytics-risk-table');
    if (riskEl) riskEl.innerHTML = `<tr><td colspan="99">${_emptyStateHTML(mode)}</td></tr>`;
    return;
  }

  // Only members with real score data
  const scoredMembers = AppState.members.filter(m => m.overall !== null);

  setTimeout(() => {
    // Metric averages bar — only use members with actual scores
    const metricAvgs = metrics.map(m => {
      const vals = scoredMembers.map(mem => mem.scores[m]).filter(v => v !== null && v !== undefined);
      return vals.length ? Math.round(vals.reduce((a,b)=>a+b,0)/vals.length) : 0;
    });
    createHorizBarChart('chart-metric-avgs', metrics, metricAvgs, color);

    // Top vs Bottom performers — only real data
    const top = [...scoredMembers].sort((a,b)=>b.overall-a.overall).slice(0,5);
    const bot = [...scoredMembers].sort((a,b)=>a.overall-b.overall).slice(0,5);
    createBarChart('chart-top-bot', [...top.map(m=>m.name.split(' ')[0]), ...bot.map(m=>m.name.split(' ')[0])],
      [{
        label: 'Performance',
        data: [...top.map(m=>m.overall), ...bot.map(m=>m.overall)],
        backgroundColor: [...top.map(()=>color+'99'), ...bot.map(()=>'#f74f4f99')],
        borderColor: [...top.map(()=>color), ...bot.map(()=>'#f74f4f')],
        borderWidth: 1, borderRadius: 4,
      }], { legend: false });

    // IQ distribution — only members with real IQ scores
    const buckets = [0,0,0,0,0]; // 0-19,20-39,40-59,60-79,80-100
    scoredMembers.filter(m => m.iqScore !== null).forEach(m => {
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

  // At-risk table — only from members with real data
  const atRisk = AppState.members.filter(m =>
    (m.wellnessScore !== null && m.wellnessScore < 50) ||
    (m.overall !== null && m.overall < 55) ||
    m.alerts > 1
  ).sort((a,b) => (a.wellnessScore ?? 100) - (b.wellnessScore ?? 100)).slice(0,8);
  document.getElementById('analytics-risk-table').innerHTML = atRisk.map(m=>`
    <tr onclick="showProfile('${m.id}')">
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
      <td><button class="btn btn-sm btn-accent" onclick="event.stopPropagation();showProfile('${m.id}')">View Profile</button></td>
    </tr>`).join('');
}

/* ── INTELLIQ PAGE ───────────────────────────────────────── */

/*
 * TODO — IntelliQ Org Intelligence Card (Priority 8)
 * Add a "What IntelliQ knows this week" card below the existing health panel,
 * above the weekly pulse section. Implementation steps:
 *
 * 1. Call GET /api/platform/org-checkins?orgCode=X and GET /api/weekly/org?orgCode=X
 * 2. From check-ins: average the mood scores (1-5) → display as team mood (e.g. "3.8/5")
 * 3. From check-in text + weekly data: count word frequency (split on spaces, lowercase,
 *    ignore stop words) → show top 5 recurring words/themes as chips
 * 4. Call GET /api/notes?orgCode=X&requesterId=adminId and count private vs shared notes
 * 5. Call GET /api/member/goals for each member → count how many have goals set
 * 6. Render as a card: mood average pill, theme chips, note counts, goal count
 * 7. Insert HTML after the id="iq-health-panel" element in renderIntelliQ()
 *
 * All data is already stored in server memory — no new endpoints needed.
 * Keep the card read-only and collapsible. Label it "This Week's Signal".
 */

function renderIntelliQ(){
  const members = AppState.members;
  const mode    = AppState.mode;
  const color   = ORG_MODES[mode]?.color || 'var(--accent)';
  const metrics = (AppState.orgMetrics || []).map(m => m.name || m);

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
    <tr onclick="showProfile('${m.id}')">
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

  // ── IntelliQ Executive Health Panel ──────────────────────
  AppState.runHealthCheck();
  const openAlerts     = AppState.alerts.filter(a => a.proactive && !a.responded);
  const unactioned     = AppState.alerts.filter(a => (a.type === 'danger' || a.type === 'warning') && !a.responded);
  const atRiskMembers  = AppState.members.filter(m => m.wellnessScore < 45 || m.overall < 55);
  const noEngagement   = AppState.members.filter(m => !m.lastActive || m.lastActive === '1 week ago');

  document.getElementById('iq-health-panel').innerHTML = `
    <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:1rem">IntelliQ Org Health View</div>

    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0.7rem;margin-bottom:1.2rem">
      ${[
        { label:'Open Warnings',   val: openAlerts.length,   color: openAlerts.length ? 'var(--warning)' : 'var(--success)', icon:'⚠' },
        { label:'Unactioned Flags',val: unactioned.length,   color: unactioned.length > 2 ? 'var(--danger)' : unactioned.length ? 'var(--warning)' : 'var(--success)', icon:'🔔' },
        { label:'At-Risk Members', val: atRiskMembers.length,color: atRiskMembers.length > 3 ? 'var(--danger)' : 'var(--warning)', icon:'🚨' },
        { label:'Low Engagement',  val: noEngagement.length, color: noEngagement.length > 4 ? 'var(--warning)' : 'var(--text-secondary)', icon:'💤' },
      ].map(s => `
        <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:0.8rem;text-align:center">
          <div style="font-size:1.2rem">${s.icon}</div>
          <div style="font-size:1.4rem;font-weight:700;color:${s.color};margin:4px 0">${s.val}</div>
          <div style="font-size:0.7rem;color:var(--text-muted)">${s.label}</div>
        </div>`).join('')}
    </div>

    ${openAlerts.length ? `
      <div style="font-size:0.75rem;font-weight:600;color:var(--text-secondary);margin-bottom:0.5rem">Active IntelliQ Warnings — requires leadership response</div>
      ${openAlerts.slice(0,4).map((a, i) => {
        const idx = AppState.alerts.indexOf(a);
        return `<div style="display:flex;align-items:center;gap:0.6rem;padding:0.6rem 0.8rem;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;margin-bottom:0.4rem;font-size:0.8rem">
          <span style="color:${a.type==='danger'?'var(--danger)':'var(--warning)'}">●</span>
          <div style="flex:1;min-width:0">
            <span style="font-weight:600">${a.member?.name || '—'}</span>
            <span style="color:var(--text-muted);margin-left:0.4rem">${a.title}</span>
          </div>
          <button class="btn btn-accent btn-sm" style="font-size:0.72rem"
            onclick="openAlertCompose(${idx})">Respond →</button>
        </div>`;
      }).join('')}
      ${openAlerts.length > 4 ? `<div style="font-size:0.75rem;color:var(--accent);cursor:pointer;margin-top:0.3rem" onclick="navigate('alerts')">+ ${openAlerts.length-4} more — view all alerts →</div>` : ''}
    ` : `<div style="font-size:0.82rem;color:var(--success);text-align:center;padding:1rem">✓ No open warnings — org looks healthy</div>`}`;

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

  // Load org intelligence summary (async — populates #org-insights-content)
  loadOrgInsights();
  // Load intervention tracker
  loadInterventions();
  // Load IntelliQ learning summary
  loadLearningSummary();
}

/* ── ORG INTELLIGENCE — "What IntelliQ Knows" ───────────────────────────── */

async function loadOrgInsights(forceRefresh = false) {
  const el   = document.getElementById('org-insights-content');
  const meta = document.getElementById('insights-meta');
  if (!el) return;

  el.innerHTML = `
    <div style="text-align:center;padding:1.5rem 0;color:var(--text-muted);font-size:0.82rem">
      <div style="font-size:1.4rem;margin-bottom:0.5rem">🧠</div>
      IntelliQ is reading the data…
    </div>`;

  const orgCode = AppState.orgCode
    || (AppState.orgName || '').toLowerCase().replace(/\s+/g, '-');

  try {
    const url = `/api/intelliq/org-insights?orgCode=${encodeURIComponent(orgCode)}`
              + (forceRefresh ? '&refresh=1' : '');
    const res = await authFetch(url);
    if (!res.ok) throw new Error(res.status === 401 ? 'Session expired — please log in again' : `Server error ${res.status}`);
    const data = await res.json();

    if (meta) {
      const ts = new Date(data.generatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      meta.textContent = `Generated at ${ts}${data.cached ? ' · cached (updates hourly)' : ''}`;
    }

    _renderOrgInsights(data, el);
  } catch(e) {
    el.innerHTML = `<div style="color:var(--text-muted);font-size:0.82rem;padding:0.5rem">
      Could not load intelligence summary — ${e.message}.
      <button class="btn btn-ghost btn-sm" onclick="loadOrgInsights(true)" style="margin-left:0.5rem">Retry</button>
    </div>`;
  }
}

function _renderOrgInsights(data, el) {
  const { ai, stats } = data || {};
  if (!ai) {
    el.innerHTML = `<div style="color:var(--text-muted);font-size:0.82rem">Intelligence data unavailable.</div>`;
    return;
  }

  const urgencyColor = { high: 'var(--danger)', medium: 'var(--warning)', low: 'var(--text-secondary)' };
  const urgencyIcon  = { high: '🔴', medium: '🟡', low: '⚪' };
  const trendColor   = { improving: 'var(--success)', stable: 'var(--text-secondary)', declining: 'var(--warning)', unknown: 'var(--text-muted)' };
  const alignIcon    = { on_track: '✓', mixed: '~', off_track: '↗', no_goal: '○', unknown: '—' };
  const alignColor   = { on_track: 'var(--success)', mixed: 'var(--warning)', off_track: 'var(--danger)', no_goal: 'var(--text-muted)', unknown: 'var(--text-muted)' };
  const evidenceLabel = { checkins: 'check-ins', weeklyAssessments: 'weeklies', goals: 'goals', assessmentScores: 'scores', notes: 'notes' };

  let html = '';

  // ── 1. Summary ─────────────────────────────────────────────────────────────
  html += `
    <div style="background:rgba(124,90,245,0.07);border:1px solid rgba(124,90,245,0.2);border-radius:10px;padding:1rem 1.1rem;margin-bottom:1rem;font-size:0.88rem;line-height:1.7;color:var(--text-primary)">
      <span style="color:var(--accent);font-weight:700;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.8px;display:block;margin-bottom:0.4rem">IntelliQ Summary</span>
      ${ai.summary}
    </div>`;

  // ── 2. Evidence-based Recommendations ─────────────────────────────────────
  const recs = ai.recommendations?.length ? ai.recommendations : (ai.recommendedActions || []).map(r => ({ action: r.action, urgency: r.priority, evidence: [] }));
  // Store in global registry for trackRecommendation()
  _currentInsightRecs = recs;
  if (recs.length > 0 && !ai.notEnoughData) {
    html += `<div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--text-muted);margin-bottom:0.6rem">Recommended Actions</div>`;
    html += recs.map((r, i) => {
      const borderColor  = urgencyColor[r.urgency] || 'var(--border)';
      const evidenceTags = (r.evidence || []).map(e =>
        `<span style="background:var(--surface-2);border:1px solid var(--border);border-radius:4px;padding:1px 6px;font-size:0.68rem;color:var(--text-muted)">${evidenceLabel[e] || e}</span>`
      ).join(' ');
      const confChipColor = r.confidence === 'high' ? 'rgba(79,200,142,0.18)' : r.confidence === 'medium' ? 'rgba(247,168,79,0.15)' : 'var(--surface-2)';
      const confChipBorder = r.confidence === 'high' ? 'rgba(79,200,142,0.4)' : r.confidence === 'medium' ? 'rgba(247,168,79,0.35)' : 'var(--border)';
      const confChipText = r.confidence === 'high' ? '#4fc88e' : r.confidence === 'medium' ? '#f7a84f' : 'var(--text-muted)';
      return `
        <div style="padding:0.65rem 0.9rem;background:var(--surface-2);border:1px solid var(--border);border-left:3px solid ${borderColor};border-radius:0 8px 8px 0;margin-bottom:0.5rem">
          <div style="display:flex;align-items:flex-start;gap:0.6rem">
            <span style="font-size:0.75rem;font-weight:700;color:var(--accent);flex-shrink:0;min-width:16px;margin-top:2px">${i+1}</span>
            <div style="flex:1">
              <div style="font-size:0.83rem;color:var(--text-primary);line-height:1.5;margin-bottom:0.3rem">${r.action}</div>
              ${r.reason ? `<div style="font-size:0.75rem;color:var(--text-secondary);line-height:1.45;margin-bottom:0.3rem">${r.reason}</div>` : ''}
              ${r.predictedOutcome ? `<div style="font-size:0.73rem;color:#4fc88e;line-height:1.4;margin-bottom:0.2rem">✓ If acted on: ${r.predictedOutcome}</div>` : ''}
              ${r.riskIfIgnored    ? `<div style="font-size:0.73rem;color:#f7a84f;line-height:1.4;margin-bottom:0.3rem">⚠ If ignored: ${r.riskIfIgnored}</div>` : ''}
              <div style="display:flex;align-items:center;gap:0.4rem;flex-wrap:wrap;margin-top:0.3rem">
                ${r.confidence ? `<span style="background:${confChipColor};border:1px solid ${confChipBorder};border-radius:4px;padding:1px 6px;font-size:0.68rem;color:${confChipText};font-weight:600">${r.confidence} confidence</span>` : ''}
                ${evidenceTags}
                <button id="track-btn-${i}" onclick="trackRecommendation(${i})"
                  style="margin-left:auto;background:transparent;border:1px solid var(--border);border-radius:4px;padding:2px 8px;font-size:0.7rem;cursor:pointer;color:var(--text-secondary)">
                  + Track
                </button>
              </div>
            </div>
          </div>
        </div>`;
    }).join('');
    html += `<div style="margin-bottom:1rem"></div>`;
  }

  // ── 2b. Risk Patterns (from local pattern engine — always reliable) ───────
  if (data.patterns && data.patterns.length > 0) {
    const patternIconMap = {
      BURNOUT_RISK:        '🔴',
      DISENGAGEMENT_RISK:  '🟠',
      CONFIDENCE_CONCERN:  '🟡',
      ISOLATION_RISK:      '🟣',
      GOAL_MISALIGNMENT:   '⚪',
    };
    const patternConfColor = { high: '#f74f4f', medium: '#f7a84f', low: 'var(--text-muted)' };
    html += `<div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--text-muted);margin-bottom:0.5rem">⚡ Risk Patterns Detected</div>`;
    html += `<div style="margin-bottom:1rem">`;
    html += data.patterns.map(p => `
      <div style="display:flex;align-items:flex-start;gap:0.6rem;padding:0.5rem 0.8rem;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;margin-bottom:0.35rem">
        <span style="flex-shrink:0;font-size:0.9rem">${patternIconMap[p.type] || '⚪'}</span>
        <div style="flex:1">
          <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.15rem">
            <span style="font-size:0.82rem;font-weight:700;color:var(--text-primary)">${p.member}</span>
            <span style="font-size:0.72rem;font-weight:600;color:${patternConfColor[p.confidence] || 'var(--text-muted)'};background:rgba(0,0,0,0.08);padding:1px 6px;border-radius:4px">${p.label}</span>
            <span style="font-size:0.68rem;color:var(--text-muted)">${p.confidence} confidence</span>
          </div>
          <div style="font-size:0.73rem;color:var(--text-secondary);line-height:1.4">${(p.signals || []).join(' · ')}</div>
        </div>
      </div>`).join('');
    html += `</div>`;
  }

  // ── 3. Needs Attention ─────────────────────────────────────────────────────
  if (ai.atRisk?.length > 0) {
    html += `<div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--text-muted);margin-bottom:0.5rem">Needs Attention</div>`;
    html += ai.atRisk.map(r => `
      <div style="display:flex;align-items:flex-start;gap:0.6rem;padding:0.6rem 0.8rem;background:var(--surface-2);border:1px solid var(--border);border-left:3px solid ${urgencyColor[r.urgency]||'var(--border)'};border-radius:0 8px 8px 0;margin-bottom:0.4rem">
        <span style="flex-shrink:0;margin-top:2px">${urgencyIcon[r.urgency]||'⚪'}</span>
        <div>
          <span style="font-weight:700;font-size:0.85rem">${r.name}</span>
          <span style="color:var(--text-secondary);font-size:0.8rem;margin-left:0.4rem">${r.reason}</span>
        </div>
      </div>`).join('');
    html += `<div style="margin-bottom:1rem"></div>`;
  }

  // ── 4. Trends (multi-week) ─────────────────────────────────────────────────
  if (ai.trends && !ai.notEnoughData) {
    const { trendDirection, trendReason, confidenceLevel, moodComparison, engagementTrend } = ai.trends;
    const tdColor = trendColor[trendDirection] || 'var(--text-muted)';
    const tdArrow = { improving: '↑', stable: '→', declining: '↓', unknown: '—' }[trendDirection] || '—';
    html += `
      <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:0.75rem 0.9rem;margin-bottom:1rem">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.4rem">
          <span style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--text-muted)">Trend (30 days)</span>
          <span style="font-size:0.8rem;font-weight:700;color:${tdColor}">${tdArrow} ${trendDirection}</span>
        </div>
        ${moodComparison ? `<div style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:0.3rem">${moodComparison}</div>` : ''}
        ${trendReason    ? `<div style="font-size:0.78rem;color:var(--text-primary)">${trendReason}</div>` : ''}
        <div style="display:flex;gap:0.5rem;margin-top:0.5rem;flex-wrap:wrap">
          ${stats?.avgMoodLast7    != null ? `<span style="background:var(--surface-1);border:1px solid var(--border);border-radius:4px;padding:2px 7px;font-size:0.7rem">This week: ${stats.avgMoodLast7}/5</span>` : ''}
          ${stats?.avgMoodPrevWeek != null ? `<span style="background:var(--surface-1);border:1px solid var(--border);border-radius:4px;padding:2px 7px;font-size:0.7rem">Prev week: ${stats.avgMoodPrevWeek}/5</span>` : ''}
          ${stats?.avgMoodLast30   != null ? `<span style="background:var(--surface-1);border:1px solid var(--border);border-radius:4px;padding:2px 7px;font-size:0.7rem">30-day avg: ${stats.avgMoodLast30}/5</span>` : ''}
          ${confidenceLevel ? `<span style="background:var(--surface-1);border:1px solid var(--border);border-radius:4px;padding:2px 7px;font-size:0.7rem;color:var(--text-muted)">confidence: ${confidenceLevel}</span>` : ''}
        </div>
      </div>`;
  }

  // ── 5. Semantic Themes ─────────────────────────────────────────────────────
  const semanticThemes = ai.semanticThemes?.length ? ai.semanticThemes : null;
  const simpleThemes   = ai.themes?.length ? ai.themes : null;
  if (semanticThemes) {
    html += `<div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--text-muted);margin-bottom:0.5rem">Recurring Themes</div>`;
    const sevColor = { high: 'rgba(247,79,79,0.12)', medium: 'rgba(247,168,79,0.1)', low: 'var(--surface-2)' };
    const sevBorder = { high: 'rgba(247,79,79,0.3)', medium: 'rgba(247,168,79,0.25)', low: 'var(--border)' };
    html += `<div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-bottom:1rem">`;
    html += semanticThemes.map(t => {
      const signals = (t.signals || []).slice(0, 4).join(', ');
      const members = (t.affectedMembers || []).join(', ');
      return `
        <div style="background:${sevColor[t.severity]||'var(--surface-2)'};border:1px solid ${sevBorder[t.severity]||'var(--border)'};border-radius:8px;padding:0.45rem 0.75rem;font-size:0.8rem">
          <span style="font-weight:700;color:var(--text-primary)">${t.theme}</span>
          ${signals ? `<span style="color:var(--text-muted);font-size:0.72rem;margin-left:0.4rem">${signals}</span>` : ''}
          ${members ? `<div style="font-size:0.7rem;color:var(--text-secondary);margin-top:2px">→ ${members}</div>` : ''}
        </div>`;
    }).join('');
    html += `</div>`;
  } else if (simpleThemes) {
    html += `<div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--text-muted);margin-bottom:0.5rem">Themes</div>`;
    html += `<div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-bottom:1rem">`;
    html += simpleThemes.map(t => `<span style="background:var(--surface-2);border:1px solid var(--border);border-radius:20px;padding:0.25rem 0.75rem;font-size:0.78rem;color:var(--text-secondary)">${t}</span>`).join('');
    html += `</div>`;
  }

  // ── 6. Member Intelligence ─────────────────────────────────────────────────
  if (ai.memberProfiles?.length > 0 && !ai.notEnoughData) {
    html += `<div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--text-muted);margin-bottom:0.5rem">Member Intelligence</div>`;
    html += `<div id="iq-member-profiles" style="margin-bottom:1rem">`;
    html += ai.memberProfiles.map((p, idx) => {
      const aColor = alignColor[p.goalAlignment] || 'var(--text-muted)';
      const aIcon  = alignIcon[p.goalAlignment]  || '—';
      const riskBadge = p.riskSignals?.length > 0
        ? `<span style="background:rgba(247,79,79,0.1);border:1px solid rgba(247,79,79,0.25);border-radius:4px;padding:1px 6px;font-size:0.68rem;color:var(--danger);margin-left:0.3rem">⚠ risk</span>`
        : '';
      const profileId = `iq-profile-${idx}`;
      return `
        <div style="border:1px solid var(--border);border-radius:8px;margin-bottom:0.4rem;overflow:hidden">
          <div onclick="document.getElementById('${profileId}').style.display=document.getElementById('${profileId}').style.display==='none'?'block':'none'"
               style="display:flex;align-items:center;justify-content:space-between;padding:0.6rem 0.8rem;cursor:pointer;background:var(--surface-2)">
            <div style="display:flex;align-items:center;gap:0.5rem">
              <span style="font-weight:700;font-size:0.85rem">${p.name}</span>
              ${riskBadge}
            </div>
            <div style="display:flex;align-items:center;gap:0.6rem">
              <span style="font-size:0.72rem;color:${aColor};font-weight:600">goal: ${aIcon} ${(p.goalAlignment||'').replace('_',' ')}</span>
              <span style="color:var(--text-muted);font-size:0.7rem">▾</span>
            </div>
          </div>
          <div id="${profileId}" style="display:none;padding:0.7rem 0.9rem;font-size:0.8rem;border-top:1px solid var(--border)">
            ${p.currentState ? `<div style="color:var(--text-primary);margin-bottom:0.5rem;line-height:1.5">${p.currentState}</div>` : ''}
            ${p.goalAlignmentExplanation ? `<div style="color:var(--text-secondary);padding:0.4rem 0.6rem;background:var(--surface-2);border-radius:6px;margin-bottom:0.5rem;line-height:1.5">${p.goalAlignmentExplanation}</div>` : ''}
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin-bottom:0.5rem">
              ${p.strengths?.length ? `<div><div style="font-size:0.68rem;font-weight:700;text-transform:uppercase;color:var(--success);margin-bottom:0.2rem">Strengths</div>${p.strengths.map(s=>`<div style="color:var(--text-secondary)">• ${s}</div>`).join('')}</div>` : ''}
              ${p.concerns?.length  ? `<div><div style="font-size:0.68rem;font-weight:700;text-transform:uppercase;color:var(--warning);margin-bottom:0.2rem">Concerns</div>${p.concerns.map(c=>`<div style="color:var(--text-secondary)">• ${c}</div>`).join('')}</div>` : ''}
            </div>
            ${p.riskSignals?.length ? `<div style="font-size:0.73rem;color:var(--danger);margin-bottom:0.4rem">${p.riskSignals.join(' · ')}</div>` : ''}
            ${p.recommendedAction ? `<div style="background:rgba(124,90,245,0.07);border:1px solid rgba(124,90,245,0.15);border-radius:6px;padding:0.4rem 0.6rem;font-size:0.78rem;color:var(--text-primary)">→ ${p.recommendedAction}</div>` : ''}
            <div style="margin-top:0.5rem;text-align:right">
              <button onclick="viewMemberTimelineByName('${p.name.replace(/'/g,"\\'")}'); event.stopPropagation();"
                style="background:transparent;border:1px solid var(--border);border-radius:4px;padding:2px 8px;font-size:0.7rem;cursor:pointer;color:var(--text-muted)">
                📅 View Timeline
              </button>
            </div>
          </div>
        </div>`;
    }).join('');
    html += `</div>`;
  }

  // ── 7. Group Intelligence ──────────────────────────────────────────────────
  if (ai.groupInsights?.length > 0 && !ai.notEnoughData) {
    html += `<div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--text-muted);margin-bottom:0.5rem">Group Intelligence</div>`;
    html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:0.5rem;margin-bottom:1rem">`;
    const moodColor = { high: 'var(--success)', okay: 'var(--text-secondary)', low: 'var(--warning)', unknown: 'var(--text-muted)' };
    html += ai.groupInsights.map(g => {
      const mColor = moodColor[g.mood] || 'var(--text-muted)';
      const themes = (g.recurringThemes || []).slice(0, 3).join(', ');
      const risks  = (g.riskSignals    || []).slice(0, 2).join(', ');
      const attn   = (g.membersNeedingAttention || []).join(', ');
      return `
        <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:0.7rem 0.8rem">
          <div style="font-weight:700;font-size:0.83rem;margin-bottom:0.4rem">${g.groupName}</div>
          <div style="display:flex;gap:0.4rem;margin-bottom:0.4rem">
            <span style="background:var(--surface-1);border:1px solid var(--border);border-radius:4px;padding:1px 6px;font-size:0.7rem;color:${mColor}">mood: ${g.mood}</span>
            <span style="background:var(--surface-1);border:1px solid var(--border);border-radius:4px;padding:1px 6px;font-size:0.7rem">engagement: ${g.engagement}</span>
          </div>
          ${themes ? `<div style="font-size:0.73rem;color:var(--text-secondary);margin-bottom:0.3rem">Themes: ${themes}</div>` : ''}
          ${risks  ? `<div style="font-size:0.73rem;color:var(--warning);margin-bottom:0.3rem">⚠ ${risks}</div>` : ''}
          ${attn   ? `<div style="font-size:0.73rem;color:var(--text-muted);margin-bottom:0.3rem">Attention: ${attn}</div>` : ''}
          ${g.suggestedAction ? `<div style="font-size:0.75rem;color:var(--accent);margin-top:0.4rem;border-top:1px solid var(--border);padding-top:0.35rem">→ ${g.suggestedAction}</div>` : ''}
        </div>`;
    }).join('');
    html += `</div>`;
  }

  // ── 8. Stats (secondary — metrics last) ───────────────────────────────────
  if (!ai.notEnoughData && stats) {
    const moodVal = stats.avgMoodLast7 != null ? `${stats.avgMoodLast7}/5` : '—';
    const tColor  = trendColor[ai.moodTrend] || 'var(--text-muted)';
    html += `
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.5rem;margin-bottom:1rem">
        ${[
          { label: 'Team Mood', val: moodVal, sub: ai.moodTrend || '—', subColor: tColor },
          { label: 'Active', val: `${stats.activeThisWeek}/${stats.memberCount}`, sub: 'this week', subColor: 'var(--text-muted)' },
          { label: 'Goals Set', val: `${stats.goalsSet}/${stats.memberCount}`, sub: stats.goalsSet === stats.memberCount ? 'all set ✓' : 'members', subColor: stats.goalsSet === stats.memberCount ? 'var(--success)' : 'var(--text-muted)' },
        ].map(s => `
          <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:0.65rem;text-align:center">
            <div style="font-size:1.2rem;font-weight:700;color:var(--text-primary)">${s.val}</div>
            <div style="font-size:0.68rem;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted);margin:2px 0">${s.label}</div>
            <div style="font-size:0.7rem;color:${s.subColor}">${s.sub}</div>
          </div>`).join('')}
      </div>`;
  }

  // ── 9. Goal Progress + Member Highlights ──────────────────────────────────
  if (ai.goalProgress && !ai.notEnoughData) {
    html += `<div style="font-size:0.8rem;color:var(--text-secondary);padding:0.5rem 0.9rem;border-left:2px solid var(--border);margin-bottom:0.8rem;line-height:1.5">${ai.goalProgress}</div>`;
  }

  if (ai.memberHighlights?.length > 0) {
    html += ai.memberHighlights.map(h => `
      <div style="display:flex;align-items:flex-start;gap:0.5rem;padding:0.5rem 0.8rem;background:rgba(79,247,122,0.05);border:1px solid rgba(79,247,122,0.18);border-radius:8px;font-size:0.8rem;margin-bottom:0.4rem">
        <span style="flex-shrink:0">✨</span>
        <div>
          <span style="font-weight:700">${h.name}</span>
          <span style="color:var(--text-secondary);margin-left:0.4rem">${h.note}</span>
        </div>
      </div>`).join('');
  }

  el.innerHTML = html;
}

/* ═══════════════════════════════════════════════════════════════════════════
   INTELLIQ MEMORY — Intervention Tracker + Timelines
   ═══════════════════════════════════════════════════════════════════════════ */

// Temp registry for recommendations from the current insight load
let _currentInsightRecs = [];

// Called when coach clicks "Track" on a recommendation
async function trackRecommendation(idx) {
  const rec = _currentInsightRecs[idx];
  if (!rec) return;
  const orgCode = AppState.orgCode || '';
  try {
    const res = await authFetch('/api/intelliq/intervention', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        orgCode,
        targetMember:   rec.targetMember   || null,
        targetMemberId: rec.targetMemberId || null,
        action:         rec.action,
        urgency:        rec.urgency  || 'medium',
        owner:          rec.owner    || 'coach',
        reason:         rec.reason   || '',
        evidence:       rec.evidence || [],
      }),
    });
    if (!res.ok) throw new Error('Failed');
    // Visual feedback on the button
    const btn = document.getElementById(`track-btn-${idx}`);
    if (btn) { btn.textContent = '✓ Tracked'; btn.disabled = true; btn.style.color = 'var(--success)'; }
    loadInterventions(); // Refresh tracker
  } catch(e) {
    alert('Could not track recommendation: ' + e.message);
  }
}

// Update an intervention's status
async function updateInterventionStatus(id, status) {
  const orgCode = AppState.orgCode || '';
  try {
    const res = await authFetch(`/api/intelliq/intervention/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ orgCode, status }),
    });
    if (!res.ok) throw new Error('Failed');
    loadInterventions();
  } catch(e) {
    alert('Could not update: ' + e.message);
  }
}

// Load and render the intervention tracker
async function loadInterventions() {
  const el    = document.getElementById('interventions-content');
  const count = document.getElementById('interventions-count');
  if (!el) return;

  el.innerHTML = `<div style="color:var(--text-muted);font-size:0.8rem;padding:0.5rem">Loading…</div>`;

  const orgCode = AppState.orgCode || '';
  try {
    const res  = await authFetch(`/api/intelliq/interventions?orgCode=${encodeURIComponent(orgCode)}`);
    if (!res.ok) throw new Error(res.status === 401 ? 'Session expired' : 'Failed');
    const data = await res.json();
    _renderInterventions(data, el, count);
  } catch(e) {
    el.innerHTML = `<div style="color:var(--text-muted);font-size:0.82rem">Could not load — ${e.message}</div>`;
  }
}

function _renderInterventions(data, el, countEl) {
  const all    = data.interventions || [];
  const active = all.filter(i => i.status === 'suggested' || i.status === 'acknowledged');
  const done   = all.filter(i => i.status === 'completed' || i.status === 'dismissed');

  if (countEl) countEl.textContent = `${all.length} total · ${active.length} active`;

  if (!all.length) {
    el.innerHTML = `<div style="text-align:center;padding:1.5rem 0;color:var(--text-muted);font-size:0.82rem">
      No tracked interventions yet.<br>
      <span style="font-size:0.75rem">Click "Track" on a recommendation in "What IntelliQ Knows" to start.</span>
    </div>`;
    return;
  }

  const urgencyColor = { high: 'var(--danger)', medium: 'var(--warning)', low: 'var(--text-secondary)' };
  const statusColor  = { suggested: 'var(--text-muted)', acknowledged: 'var(--accent)', completed: 'var(--success)', dismissed: 'var(--text-muted)' };
  const statusLabel  = { suggested: 'Suggested', acknowledged: 'In Progress', completed: 'Completed', dismissed: 'Dismissed' };
  const outcomeColor = { positive: 'var(--success)', neutral: 'var(--text-secondary)', negative: 'var(--warning)' };
  const outcomeIcon  = { positive: '↑', neutral: '→', negative: '↓' };

  let html = '';

  if (active.length > 0) {
    html += `<div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--text-muted);margin-bottom:0.5rem">Active (${active.length})</div>`;
    html += active.map(i => {
      const bColor = urgencyColor[i.urgency] || 'var(--border)';
      const canAck  = i.status === 'suggested';
      const canComp = i.status !== 'completed';
      return `
        <div style="padding:0.7rem 0.9rem;background:var(--surface-2);border:1px solid var(--border);border-left:3px solid ${bColor};border-radius:0 8px 8px 0;margin-bottom:0.5rem">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem;margin-bottom:0.35rem">
            <span style="font-size:0.83rem;font-weight:600;color:var(--text-primary);flex:1">${i.action}</span>
            <span style="font-size:0.7rem;font-weight:700;color:${statusColor[i.status]};white-space:nowrap">${statusLabel[i.status]}</span>
          </div>
          ${i.targetMember ? `<div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:0.3rem">→ ${i.targetMember}</div>` : ''}
          ${i.reason ? `<div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.4rem">${i.reason}</div>` : ''}
          <div style="display:flex;gap:0.4rem;flex-wrap:wrap;margin-top:0.4rem">
            ${canAck ? `<button onclick="updateInterventionStatus('${i.id}','acknowledged')" class="btn btn-ghost btn-sm" style="font-size:0.72rem">Acknowledge</button>` : ''}
            ${canComp ? `<button onclick="updateInterventionStatus('${i.id}','completed')" class="btn btn-outline btn-sm" style="font-size:0.72rem">Mark Complete</button>` : ''}
            <button onclick="updateInterventionStatus('${i.id}','dismissed')" class="btn btn-ghost btn-sm" style="font-size:0.72rem;color:var(--text-muted)">Dismiss</button>
          </div>
        </div>`;
    }).join('');
  }

  if (done.length > 0) {
    html += `<div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--text-muted);margin-top:0.8rem;margin-bottom:0.5rem">Completed / Dismissed (${done.length})</div>`;
    html += done.slice(0, 6).map(i => {
      const outcome = i.outcome;
      return `
        <div style="padding:0.55rem 0.8rem;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;margin-bottom:0.35rem;opacity:0.8">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem">
            <span style="font-size:0.8rem;color:var(--text-secondary);flex:1">${i.action}</span>
            <div style="display:flex;align-items:center;gap:0.4rem;flex-shrink:0">
              ${outcome?.status === 'measured'
                ? `<span style="font-size:0.75rem;font-weight:700;color:${outcomeColor[outcome.outcome]}">${outcomeIcon[outcome.outcome]} ${outcome.moodDelta > 0 ? '+' : ''}${outcome.moodDelta}</span>`
                : outcome?.status === 'pending'
                ? `<span style="font-size:0.7rem;color:var(--text-muted)">⏳ pending</span>`
                : ''}
              <span style="font-size:0.7rem;color:${statusColor[i.status]}">${statusLabel[i.status]}</span>
            </div>
          </div>
          ${outcome?.note ? `<div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.25rem">${outcome.note}</div>` : ''}
        </div>`;
    }).join('');
  }

  // Learning stats (if enough data)
  const measured = done.filter(i => i.outcome?.status === 'measured');
  if (measured.length >= 2) {
    const positive    = measured.filter(i => i.outcome.outcome === 'positive').length;
    const successRate = Math.round(positive / measured.length * 100);
    html += `
      <div style="margin-top:1rem;padding:0.6rem 0.9rem;background:rgba(124,90,245,0.06);border:1px solid rgba(124,90,245,0.15);border-radius:8px;font-size:0.8rem">
        <span style="font-weight:700">IntelliQ Learning:</span>
        <span style="color:var(--text-secondary);margin-left:0.4rem">${successRate}% of tracked interventions led to measurable mood improvement (${positive}/${measured.length} measured).</span>
      </div>`;
  }

  el.innerHTML = html;
}

// ── IntelliQ Learning Summary ────────────────────────────────────────────────
async function loadLearningSummary(forceRefresh = false) {
  const el = document.getElementById('learning-summary-content');
  if (!el) return;
  el.innerHTML = `<div style="color:var(--text-muted);font-size:0.8rem;text-align:center;padding:1rem">Loading IntelliQ learning…</div>`;
  const orgCode = AppState.orgCode;
  if (!orgCode) return;
  try {
    const url = `/api/intelliq/learning-summary?orgCode=${encodeURIComponent(orgCode)}${forceRefresh ? '&refresh=1' : ''}`;
    const res  = await authFetch(url);
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    _renderLearningSummary(data, el);
  } catch(e) {
    el.innerHTML = `<div style="color:var(--text-muted);font-size:0.8rem;padding:0.5rem">Could not load learning summary.</div>`;
  }
}

function _renderLearningSummary(data, el) {
  if (!data) { el.innerHTML = ''; return; }

  const { narrative, interventions, patternFrequency, monthlyMood, currentPredictions, generatedAt, cached } = data;

  let html = '';

  // ── Narrative ────────────────────────────────────────────────────────────
  if (narrative) {
    html += `<div style="font-size:0.84rem;color:var(--text-primary);line-height:1.65;margin-bottom:1rem;padding:0.8rem;background:var(--surface-2);border:1px solid var(--border);border-radius:8px">
      <span style="display:block;font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--text-muted);margin-bottom:0.5rem">IntelliQ's Read on This Org</span>
      ${narrative}
    </div>`;
  }

  // ── Stats row ─────────────────────────────────────────────────────────────
  const statsItems = [
    interventions?.total > 0         ? `${interventions.total} intervention${interventions.total !== 1 ? 's' : ''} tracked` : null,
    interventions?.successRate != null ? `${interventions.successRate}% success rate` : null,
    currentPredictions > 0            ? `${currentPredictions} declining trajectory${currentPredictions !== 1 ? 's' : ''}` : null,
  ].filter(Boolean);

  if (statsItems.length > 0) {
    html += `<div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-bottom:0.9rem">`;
    statsItems.forEach(s => {
      html += `<span style="background:var(--surface-2);border:1px solid var(--border);border-radius:4px;padding:2px 8px;font-size:0.73rem;color:var(--text-secondary)">${s}</span>`;
    });
    html += `</div>`;
  }

  // ── Monthly mood trend ────────────────────────────────────────────────────
  if (monthlyMood?.length > 0 && monthlyMood.some(m => m.avgMood !== null)) {
    html += `<div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--text-muted);margin-bottom:0.4rem">Mood Over Time</div>`;
    html += `<div style="display:flex;gap:0.5rem;margin-bottom:0.9rem;flex-wrap:wrap">`;
    [...monthlyMood].reverse().forEach(m => {
      const moodBg = m.avgMood >= 4 ? 'rgba(79,200,142,0.12)' : m.avgMood >= 3 ? 'rgba(247,168,79,0.1)' : m.avgMood !== null ? 'rgba(247,79,79,0.1)' : 'var(--surface-2)';
      html += `<div style="flex:1;min-width:80px;background:${moodBg};border:1px solid var(--border);border-radius:8px;padding:0.5rem;text-align:center">
        <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:0.15rem">${m.month}</div>
        <div style="font-size:1rem;font-weight:700;color:var(--text-primary)">${m.avgMood !== null ? m.avgMood + '/5' : '—'}</div>
        <div style="font-size:0.65rem;color:var(--text-muted)">${m.checkins} check-in${m.checkins !== 1 ? 's' : ''}</div>
      </div>`;
    });
    html += `</div>`;
  }

  // ── Pattern frequency ─────────────────────────────────────────────────────
  const patFreq = patternFrequency || {};
  const patEntries = Object.entries(patFreq).sort((a, b) => b[1] - a[1]);
  if (patEntries.length > 0) {
    html += `<div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--text-muted);margin-bottom:0.4rem">Recurring Patterns</div>`;
    html += `<div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-bottom:0.9rem">`;
    patEntries.forEach(([label, count]) => {
      html += `<span style="background:rgba(247,168,79,0.1);border:1px solid rgba(247,168,79,0.25);border-radius:4px;padding:2px 8px;font-size:0.73rem;color:#f7a84f">${label} <strong>(${count})</strong></span>`;
    });
    html += `</div>`;
  }

  // ── Effective intervention types ──────────────────────────────────────────
  const byType = interventions?.byType || {};
  const typeEntries = Object.entries(byType).filter(([,s]) => s.total > 0);
  if (typeEntries.length > 0) {
    html += `<div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--text-muted);margin-bottom:0.4rem">Intervention Effectiveness by Type</div>`;
    typeEntries.forEach(([type, s]) => {
      const rate = Math.round(s.positive / s.total * 100);
      const barColor = rate >= 60 ? '#4fc88e' : rate >= 40 ? '#f7a84f' : '#f74f4f';
      html += `<div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.3rem">
        <div style="flex:0 0 100px;font-size:0.75rem;color:var(--text-secondary);text-transform:capitalize">${type.replace(/_/g, ' ')}</div>
        <div style="flex:1;height:6px;background:var(--border);border-radius:3px;overflow:hidden">
          <div style="width:${rate}%;height:100%;background:${barColor};border-radius:3px"></div>
        </div>
        <div style="font-size:0.72rem;color:var(--text-muted);flex:0 0 36px;text-align:right">${rate}%</div>
      </div>`;
    });
    html += `<div style="margin-bottom:0.6rem"></div>`;
  }

  const ts = generatedAt ? new Date(generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  html += `<div style="font-size:0.67rem;color:var(--text-muted);margin-top:0.3rem">${cached ? '⚡ Cached' : '🔄 Live'} · Generated ${ts}</div>`;

  el.innerHTML = html;
}

// Load and render the org journey timeline
async function loadOrgTimeline(forceRefresh = false) {
  const el = document.getElementById('org-timeline-content');
  if (!el) return;
  el.innerHTML = `<div style="color:var(--text-muted);font-size:0.8rem;text-align:center;padding:1rem">Loading org journey…</div>`;

  const orgCode = AppState.orgCode || '';
  try {
    const res  = await authFetch(`/api/intelliq/org-timeline?orgCode=${encodeURIComponent(orgCode)}${forceRefresh ? '&refresh=1' : ''}`);
    if (!res.ok) throw new Error('Failed');
    const data = await res.json();
    _renderOrgTimeline(data, el);
  } catch(e) {
    el.innerHTML = `<div style="color:var(--text-muted);font-size:0.82rem">Could not load — ${e.message}</div>`;
  }
}

function _renderOrgTimeline(data, el) {
  const { timeline = [] } = data;
  if (!timeline.length) {
    el.innerHTML = `<div style="color:var(--text-muted);font-size:0.82rem;text-align:center;padding:1rem">No historical data yet.</div>`;
    return;
  }
  const moodColor = v => v == null ? 'var(--text-muted)' : v >= 4 ? 'var(--success)' : v >= 3 ? 'var(--text-secondary)' : 'var(--warning)';
  let html = `<div style="position:relative">`;
  html += timeline.map((m, idx) => {
    const isLast  = idx === timeline.length - 1;
    const mColor  = moodColor(m.avgMood);
    const engRate = m.totalMembers > 0 ? Math.round(m.activeMembers / m.totalMembers * 100) : 0;
    return `
      <div style="display:flex;gap:0.8rem;padding-bottom:${isLast ? '0' : '1rem'}">
        <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0">
          <div style="width:10px;height:10px;border-radius:50%;background:${mColor};flex-shrink:0;margin-top:4px"></div>
          ${!isLast ? `<div style="width:2px;flex:1;background:var(--border);margin-top:4px"></div>` : ''}
        </div>
        <div style="flex:1;padding-bottom:${isLast ? '0' : '0.5rem'}">
          <div style="display:flex;align-items:center;gap:0.6rem;margin-bottom:0.25rem">
            <span style="font-size:0.8rem;font-weight:700;color:var(--text-primary)">${m.label}</span>
            ${m.avgMood != null ? `<span style="font-size:0.72rem;color:${mColor}">${m.avgMood}/5</span>` : ''}
            ${engRate > 0 ? `<span style="font-size:0.7rem;color:var(--text-muted)">${engRate}% engaged</span>` : ''}
          </div>
          ${m.textSamples?.length ? `<div style="font-size:0.75rem;color:var(--text-secondary);line-height:1.5">"${m.textSamples[0].slice(0, 100)}${m.textSamples[0].length > 100 ? '…' : ''}"</div>` : ''}
        </div>
      </div>`;
  }).join('');
  html += `</div>`;
  el.innerHTML = html;
}

// Resolve member from AppState by name, then open timeline
function viewMemberTimelineByName(memberName) {
  const member = (AppState.members || []).find(m => m.name === memberName);
  const userId = member?.userId || member?.id || '';
  viewMemberTimeline(memberName, userId);
}

// Open member timeline modal
async function viewMemberTimeline(memberName, memberId) {
  const modal   = document.getElementById('member-timeline-modal');
  const content = document.getElementById('member-timeline-content');
  const title   = document.getElementById('timeline-modal-title');
  const sub     = document.getElementById('timeline-modal-sub');
  if (!modal) return;

  title.textContent = memberName + ' — Timeline';
  sub.textContent   = 'Loading…';
  modal.style.display = 'block';
  content.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--text-muted)">Building timeline…</div>`;

  const orgCode = AppState.orgCode || '';
  try {
    const url = `/api/intelliq/member-timeline?orgCode=${encodeURIComponent(orgCode)}&memberId=${encodeURIComponent(memberId || '')}&memberName=${encodeURIComponent(memberName)}`;
    const res  = await authFetch(url);
    if (!res.ok) throw new Error('Failed');
    const data = await res.json();
    sub.textContent = `${data.timeline?.length || 0} months of activity`;
    _renderMemberTimeline(data, content);
  } catch(e) {
    content.innerHTML = `<div style="color:var(--text-muted);font-size:0.82rem">Could not load timeline — ${e.message}</div>`;
  }
}

function _renderMemberTimeline(data, el) {
  const { timeline = [] } = data;
  if (!timeline.length) {
    el.innerHTML = `<div style="color:var(--text-muted);font-size:0.82rem;text-align:center;padding:2rem">No activity recorded yet.</div>`;
    return;
  }

  const typeIcon  = { goal_set: '🎯', checkin: '•', weekly_reflection: '📝', assessment: '📊', note: '💬', mood_improving: '↑', mood_declining: '↓', intervention_completed: '✓' };
  const typeColor = { goal_set: 'var(--accent)', checkin: 'var(--text-muted)', weekly_reflection: 'var(--text-secondary)', assessment: 'var(--accent)', note: 'var(--text-secondary)', mood_improving: 'var(--success)', mood_declining: 'var(--warning)', intervention_completed: 'var(--success)' };

  let html = '';
  timeline.slice().reverse().forEach((month, idx) => {
    const isLast = idx === timeline.length - 1;
    html += `
      <div style="display:flex;gap:0.8rem;padding-bottom:${isLast ? '0' : '1.2rem'}">
        <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;width:60px">
          <div style="font-size:0.72rem;font-weight:700;color:var(--accent);text-align:center;white-space:nowrap">${month.label.replace(' ', '\n')}</div>
          ${!isLast ? `<div style="width:2px;flex:1;background:var(--border);margin-top:4px"></div>` : ''}
        </div>
        <div style="flex:1">
          ${month.narrative ? `<div style="font-size:0.82rem;color:var(--text-primary);font-style:italic;margin-bottom:0.4rem;line-height:1.55">"${month.narrative}"</div>` : ''}
          ${month.moodAvg   ? `<div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:0.3rem">Mood avg: ${month.moodAvg}/5</div>` : ''}
          <div style="font-size:0.75rem;line-height:1.7">
            ${month.events.filter(e => !['checkin'].includes(e.type) || e.data.text).slice(0, 5).map(e => {
              const icon  = typeIcon[e.type]  || '•';
              const color = typeColor[e.type] || 'var(--text-muted)';
              let label = '';
              if (e.type === 'goal_set')              label = `Goal: "${e.data.goal?.slice(0, 60) || ''}"`;
              else if (e.type === 'weekly_reflection') label = `Weekly: "${e.data.text?.slice(0, 80) || ''}"`;
              else if (e.type === 'assessment')        label = `Assessment score: ${e.data.overall ?? '?'}/100`;
              else if (e.type === 'mood_improving')    label = `Mood improving (${e.data.from} → ${e.data.to})`;
              else if (e.type === 'mood_declining')    label = `Mood declining (${e.data.from} → ${e.data.to})`;
              else if (e.type === 'checkin' && e.data.text) label = `"${e.data.text.slice(0, 80)}"`;
              else if (e.type === 'intervention_completed') label = `Intervention completed${e.data.outcome ? ` — ${e.data.outcome}` : ''}`;
              else return '';
              return `<div style="display:flex;gap:0.4rem"><span style="color:${color}">${icon}</span><span style="color:var(--text-secondary)">${label}</span></div>`;
            }).filter(Boolean).join('')}
          </div>
        </div>
      </div>`;
  });

  el.innerHTML = html;
}

/* ── ALERTS PAGE ─────────────────────────────────────────── */
function renderAlerts(){
  // Run a health check each time the page is opened so it's always fresh
  AppState.runHealthCheck();

  const alerts  = AppState.alerts;
  const container = document.getElementById('alerts-list');
  document.getElementById('alerts-unread-count').textContent = AppState.getUnreadAlertCount();

  if (!alerts.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">✅</div><p>No alerts — org looks healthy.</p></div>`;
    return;
  }

  // Group: proactive (IntelliQ-generated) vs manual
  const proactive = alerts.filter(a => a.proactive);
  const manual    = alerts.filter(a => !a.proactive);

  const sectionHTML = (title, icon, items) => {
    if (!items.length) return '';
    return `
      <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin:1rem 0 0.6rem">${icon} ${title} (${items.length})</div>
      ${items.map((a, i) => {
        const idx = alerts.indexOf(a);
        return alertActionItemHTML(a, idx);
      }).join('')}`;
  };

  container.innerHTML =
    sectionHTML('IntelliQ Early Warnings', '🧠', proactive) +
    sectionHTML('Manual Flags & Notifications', '🔔', manual);
}

function alertActionItemHTML(a, idx) {
  const typeColors = { danger:'#f74f4f', warning:'#f7b24f', success:'#4ff77a', info:'#4f8ef7' };
  const color = typeColors[a.type] || '#4f8ef7';
  const unreadDot = a.unread ? `<span style="width:8px;height:8px;border-radius:50%;background:${color};display:inline-block;flex-shrink:0;margin-top:4px"></span>` : `<span style="width:8px;height:8px;display:inline-block;flex-shrink:0"></span>`;
  const proactiveBadge = a.proactive ? `<span style="font-size:0.65rem;background:rgba(124,90,245,0.15);color:var(--accent);border:1px solid rgba(124,90,245,0.3);border-radius:4px;padding:2px 6px;margin-left:6px">IntelliQ</span>` : '';
  const respondedBadge = a.responded ? `<span style="font-size:0.65rem;background:rgba(79,247,122,0.15);color:var(--success);border:1px solid rgba(79,247,122,0.3);border-radius:4px;padding:2px 6px;margin-left:6px">Responded</span>` : '';

  const actionBtn = a.memberId && !a.responded
    ? `<button class="btn btn-accent btn-sm" style="flex-shrink:0"
        onclick="openAlertCompose(${idx})">Respond →</button>`
    : a.member
    ? `<button class="btn btn-outline btn-sm" style="flex-shrink:0;font-size:0.73rem"
        onclick="showProfile('${a.member.id}')">View Profile</button>`
    : '';

  return `
    <div style="display:flex;gap:0.7rem;align-items:flex-start;padding:0.9rem 0;border-bottom:1px solid var(--border)"
         onclick="markAlertRead(${idx})">
      ${unreadDot}
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px;margin-bottom:0.25rem">
          <span style="font-size:0.85rem;font-weight:600;color:${color}">${a.title}</span>
          ${proactiveBadge}${respondedBadge}
        </div>
        <div style="font-size:0.8rem;color:var(--text-secondary);line-height:1.5;margin-bottom:0.35rem">${a.detail}</div>
        <div style="font-size:0.7rem;color:var(--text-muted)">${a.time}</div>
      </div>
      ${actionBtn}
    </div>`;
}

function markAlertRead(idx){
  if(AppState.alerts[idx]) AppState.alerts[idx].unread = false;
  updateAlertBadge();
  if (AppState.currentPage === 'alerts') renderAlerts();
}

function markAllRead(){
  AppState.alerts.forEach(a=>a.unread=false);
  updateAlertBadge();
  renderAlerts();
  showToast('All alerts marked as read','success');
}

/* ── ALERT COMPOSE FLOW ──────────────────────────────────── */
let _alertComposeIdx    = null;
let _alertAttachment    = null;
let _alertDifficulty    = 'Medium';

function openAlertCompose(alertIdx) {
  const a = AppState.alerts[alertIdx];
  if (!a) return;

  _alertComposeIdx = alertIdx;
  _alertAttachment = null;
  _alertDifficulty = 'Medium';

  // Header
  document.getElementById('acm-title').textContent = `Respond: ${a.title}`;
  document.getElementById('acm-sub').textContent   = a.member ? a.member.name : '';

  // Context banner
  document.getElementById('acm-context-banner').textContent = a.detail;

  // Member selector — pre-select flagged member
  const memberSel = document.getElementById('acm-member');
  memberSel.innerHTML = AppState.members
    .sort((x,y) => x.name.localeCompare(y.name))
    .map(m => `<option value="${m.id}" ${m.id === a.memberId ? 'selected' : ''}>${m.name}</option>`)
    .join('');

  // Pre-fill brief from suggested
  document.getElementById('acm-brief').value = a.suggestedBrief || '';

  // Reset panels
  document.getElementById('acm-draft-panel').style.display   = 'none';
  document.getElementById('acm-attachment-preview').innerHTML = '';
  document.getElementById('acm-embed-preview').innerHTML      = '';
  document.getElementById('acm-embed-url').value              = '';

  selectAlertDifficulty('Medium');
  openModal('alert-compose-modal');
}

function selectAlertDifficulty(diff) {
  _alertDifficulty = diff;
  document.querySelectorAll('.acm-diff-btn').forEach(btn => {
    const active = btn.dataset.diff === diff;
    const color  = ORG_MODES[AppState.mode].color;
    btn.style.background  = active ? `${color}22` : '';
    btn.style.color       = active ? color : '';
    btn.style.borderColor = active ? `${color}44` : '';
  });
}

async function handleAlertFileSelect(file) {
  if (!file) return;
  const preview = document.getElementById('acm-attachment-preview');
  preview.innerHTML = `<div style="font-size:0.8rem;color:var(--text-muted)">Processing ${file.name}…</div>`;
  try {
    _alertAttachment = await AttachmentHandler.process(file);
    preview.innerHTML = `
      <div style="display:flex;align-items:center;gap:0.6rem;padding:0.6rem 0.8rem;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;font-size:0.8rem">
        <span>${AttachmentHandler.ICONS[_alertAttachment.kind] || '📎'}</span>
        <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_alertAttachment.name}</span>
        <span style="color:var(--success);font-size:0.72rem">✓ Ready</span>
        <button onclick="_alertAttachment=null;document.getElementById('acm-attachment-preview').innerHTML=''" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:0.9rem">✕</button>
      </div>
      ${_alertAttachment.kind === 'image' ? `<img src="${_alertAttachment.preview}" style="max-height:120px;border-radius:6px;margin-top:0.4rem"/>` : ''}`;
  } catch(e) {
    preview.innerHTML = `<div style="font-size:0.8rem;color:var(--danger)">${e.message}</div>`;
  }
}

function handleAlertDrop(event) {
  event.preventDefault();
  document.getElementById('acm-dropzone').classList.remove('drag-over');
  const file = event.dataTransfer.files[0];
  if (file) handleAlertFileSelect(file);
}

function attachAlertEmbed() {
  const url = (document.getElementById('acm-embed-url').value || '').trim();
  if (!url) return;
  const embed = AttachmentHandler.processEmbed(url);
  if (!embed) return;
  _alertAttachment = embed;
  document.getElementById('acm-embed-preview').innerHTML = `
    <div style="margin-top:0.4rem">${embed.embedHTML}</div>
    <div style="font-size:0.72rem;color:var(--success);margin-top:4px">✓ Will be shown to member during scenario</div>`;
}

async function draftAlertScenario() {
  const brief  = (document.getElementById('acm-brief')?.value || '').trim();
  const member = getSelectedMemberFromSelect('acm-member');
  if (!brief)   { showToast('Write a brief first', 'warning'); return; }
  if (!member)  { showToast('Select a member', 'warning'); return; }

  const memberId = member.id;
  const btn = document.getElementById('acm-draft-btn');
  if (btn) { btn.textContent = '✦ Drafting…'; btn.disabled = true; }

  // Build image payload if attachment is image/pdf
  let imagePayload = null;
  if (_alertAttachment?.kind === 'image' || _alertAttachment?.kind === 'pdf') {
    imagePayload = { data: _alertAttachment.data, mediaType: _alertAttachment.mediaType };
  }

  try {
    const res = await fetch('/api/draft-scenario', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brief,
        orgMode:    AppState.mode,
        orgName:    AppState.orgName,
        memberName: member?.name?.split(' ')[0] || 'the member',
        difficulty: _alertDifficulty,
        image:      imagePayload,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { draft } = await res.json();

    document.getElementById('acm-draft-title').value   = draft.title   || '';
    document.getElementById('acm-draft-opening').value = draft.opening || '';
    document.getElementById('acm-draft-coachnote').textContent = draft.coachNote || '';
    document.getElementById('acm-draft-probes').innerHTML = (draft.probes || []).map((p, i) => `
      <div style="display:flex;gap:0.5rem;margin-bottom:0.4rem;align-items:flex-start">
        <span style="font-size:0.72rem;color:var(--text-muted);padding-top:8px;flex-shrink:0">${i+1}.</span>
        <input type="text" class="form-input acm-probe-input" value="${p.replace(/"/g,'&quot;')}" style="flex:1;font-size:0.82rem"/>
      </div>`).join('');

    document.getElementById('acm-draft-panel').style.display = 'block';
    document.getElementById('acm-actions').style.display     = 'none';

  } catch(err) {
    // Fallback: let coach edit manually
    document.getElementById('acm-draft-title').value   = 'Follow-up Scenario';
    document.getElementById('acm-draft-opening').value = `[AI unavailable — edit manually]\n\nBrief: ${brief}`;
    document.getElementById('acm-draft-coachnote').textContent = 'AI service offline. Edit the scenario manually.';
    document.getElementById('acm-draft-probes').innerHTML = `
      <div style="display:flex;gap:0.5rem;margin-bottom:0.4rem">
        <span style="font-size:0.72rem;color:var(--text-muted);padding-top:8px">1.</span>
        <input type="text" class="form-input acm-probe-input" value="Walk me through your thinking on this." style="flex:1;font-size:0.82rem"/>
      </div>`;
    document.getElementById('acm-draft-panel').style.display = 'block';
    document.getElementById('acm-actions').style.display     = 'none';
  } finally {
    if (btn) { btn.textContent = '✦ Draft Scenario with AI →'; btn.disabled = false; }
  }
}

function approveAlertDraft() {
  const title    = (document.getElementById('acm-draft-title')?.value   || '').trim();
  const opening  = (document.getElementById('acm-draft-opening')?.value || '').trim();
  const brief    = (document.getElementById('acm-brief')?.value         || '').trim();
  const _alertMember = getSelectedMemberFromSelect('acm-member');
  const memberId     = _alertMember?.id || null;
  const probes       = [...document.querySelectorAll('.acm-probe-input')].map(i => i.value.trim()).filter(Boolean);

  if (!title || !opening || !memberId) { showToast('Fill in title, opening, and member', 'warning'); return; }

  const scenario = {
    id:         `sc_alert_${Date.now()}`,
    title,
    brief,
    domain:     'Follow-up',
    context:    brief,
    opening,
    probes,
    difficulty: _alertDifficulty,
    attachment: _alertAttachment || null,
    createdBy:  AppState.adminName,
    createdAt:  new Date().toLocaleDateString('en-GB'),
    fromAlert:  true,
  };

  AppState.scenarios.push(scenario);

  // Mark the source alert as responded
  if (_alertComposeIdx !== null && AppState.alerts[_alertComposeIdx]) {
    AppState.alerts[_alertComposeIdx].responded = true;
    AppState.alerts[_alertComposeIdx].unread    = false;
  }

  updateAlertBadge();
  closeAllModals();
  showToast(`Scenario approved — launching for ${AppState.getMember(memberId)?.name}`, 'success');
  ScenarioEngine.start(scenario, memberId);
}

/* ── REPORTS PAGE ────────────────────────────────────────── */
function renderReports(){
  const mode    = AppState.mode;
  const color   = ORG_MODES[mode]?.color || 'var(--accent)';
  const metrics = (AppState.orgMetrics || []).map(m => m.name || m);

  // ── Empty state guard ─────────────────────────────────────
  if (AppState.orgDataLoaded && AppState.members.length === 0) {
    const tableEl = document.getElementById('stat-sheet-tbody');
    if (tableEl) tableEl.innerHTML = `<tr><td colspan="99">${_emptyStateHTML(mode)}</td></tr>`;
    return;
  }

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
    <tr onclick="showProfile('${m.id}')">
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

/* ── PEOPLE PAGE ─────────────────────────────────────────── */
async function renderPeople() {
  const subEl = document.getElementById('people-sub');
  if (subEl) subEl.textContent = `${AppState.orgName} · ${Auth.currentUser?.name || 'Admin'}`;

  const container = document.getElementById('org-tree-container');
  if (!container) return;
  container.innerHTML = `<div style="padding:1rem;color:var(--text-muted);font-size:0.85rem">Loading…</div>`;

  try {
    await OrgTree.load();
    OrgTree.render('org-tree-container');
  } catch(e) {
    container.innerHTML = `
      <div style="padding:1.5rem;text-align:center;color:var(--text-muted);font-size:0.85rem">
        <div style="font-size:1.2rem;margin-bottom:0.5rem">⚠️</div>
        Could not load tree. <a href="#" onclick="renderPeople()" style="color:var(--accent)">Try again</a>
      </div>`;
  }
}

/* ── SETTINGS PAGE ───────────────────────────────────────── */
function renderSettings(){
  const mode  = AppState.mode;
  const info  = ORG_MODES[mode] || { label: mode || 'Custom', icon: '🏢' };
  const grade = AppState.grade;

  document.getElementById('settings-org-name').textContent  = AppState.orgName;
  document.getElementById('settings-mode').textContent      = `${info.icon || ''} ${info.label || mode}`.trim();
  document.getElementById('settings-grade').innerHTML       = gradeBadgeHTML(grade);
  document.getElementById('settings-admin').textContent     = AppState.adminName;

  const features = PLATFORM_GRADES[grade]?.features || [];
  document.getElementById('settings-features').innerHTML = features.map(f=>`
    <div style="display:flex;align-items:center;gap:8px;padding:0.5rem 0;border-bottom:1px solid var(--border)">
      <span style="color:var(--success);font-size:0.9rem">✓</span>
      <span style="font-size:0.85rem">${f}</span>
    </div>`).join('');

  // Load values into textarea
  _loadValuesIntoTextarea();
}

function switchSettingsTab(tab) {
  ['org','metrics','values','goals','grade'].forEach(t => {
    const el  = document.getElementById(`settings-tab-${t}`);
    const btn = document.querySelector(`#page-settings .tab-btn[data-tab="${t}"]`);
    if (el)  el.style.display  = t === tab ? 'block' : 'none';
    if (btn) btn.classList.toggle('active', t === tab);
  });
  if (tab === 'metrics') renderMetricsSettings();
  if (tab === 'values')  _loadValuesIntoTextarea();
  if (tab === 'goals')   renderGoalsSettings();
}

/* ── METRICS SETTINGS ────────────────────────────────────── */
async function renderMetricsSettings() {
  const el = document.getElementById('settings-metrics-list');
  if (!el) return;
  el.innerHTML = '<div style="color:var(--text-muted);font-size:0.82rem">Loading…</div>';
  try {
    const res  = await fetch('/api/metrics', { headers: Auth._headers() });
    const data = await res.json();
    AppState.orgMetrics = data.metrics || [];
    if (!AppState.orgMetrics.length) {
      el.innerHTML = `
        <div style="text-align:center;padding:1.5rem;color:var(--text-muted)">
          <div style="font-size:1.5rem;margin-bottom:0.4rem">📏</div>
          No metrics defined yet. Add your first metric or use AI Suggest.
        </div>`;
      return;
    }
    el.innerHTML = AppState.orgMetrics.map((m, i) => `
      <div style="display:flex;align-items:center;gap:0.5rem;padding:0.55rem 0;border-bottom:1px solid var(--border)">
        <span style="font-size:0.8rem;color:var(--text-muted);width:20px;text-align:right">${i+1}</span>
        <span style="flex:1;font-size:0.88rem;font-weight:500">${m.name}</span>
        <span style="font-size:0.72rem;color:var(--text-muted);background:var(--surface-2);border:1px solid var(--border);border-radius:4px;padding:1px 6px">${m.source || 'org'}</span>
        ${Auth.canDo('manage_metrics') ? `
          <button onclick="deleteMetric('${m.metricId}')" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:0.85rem;padding:2px 4px" title="Delete">✕</button>` : ''}
      </div>`).join('');
  } catch(e) {
    el.innerHTML = `<div style="color:var(--danger);font-size:0.82rem">Failed to load metrics.</div>`;
  }
}

function renderAddMetric() {
  const formEl = document.getElementById('settings-metric-form');
  if (!formEl) return;
  formEl.innerHTML = `
    <div class="card">
      <div class="card-header"><div class="card-title">Add Metric</div></div>
      <div class="card-body">
        <div style="display:flex;gap:0.5rem;align-items:flex-end">
          <div style="flex:1">
            <label class="form-label">METRIC NAME</label>
            <input id="new-metric-name" class="form-input" placeholder="e.g. Accountability, Decision Quality, Resilience…" />
          </div>
          <button class="btn btn-accent btn-sm" onclick="_submitAddMetric()">Add</button>
          <button class="btn btn-outline btn-sm" onclick="document.getElementById('settings-metric-form').innerHTML=''">Cancel</button>
        </div>
        <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.4rem">Be specific. "Accountability" is better than "Good attitude".</div>
      </div>
    </div>`;
  setTimeout(() => document.getElementById('new-metric-name')?.focus(), 50);
}

async function _submitAddMetric() {
  const name = (document.getElementById('new-metric-name')?.value || '').trim();
  if (!name) { showToast('Enter a metric name', 'warning'); return; }
  try {
    const res  = await fetch('/api/metrics', {
      method: 'POST', headers: Auth._headers(),
      body: JSON.stringify({ name, source: 'org' }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    showToast(`"${name}" added ✓`, 'success');
    document.getElementById('settings-metric-form').innerHTML = '';
    renderMetricsSettings();
  } catch(e) { showToast(e.message, 'warning'); }
}

async function deleteMetric(metricId) {
  if (!confirm('Remove this metric?')) return;
  try {
    const res  = await fetch(`/api/metrics/${metricId}`, { method: 'DELETE', headers: Auth._headers() });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    renderMetricsSettings();
    showToast('Metric removed', 'success');
  } catch(e) { showToast(e.message, 'warning'); }
}

async function renderMetricSuggest() {
  const formEl = document.getElementById('settings-metric-form');
  if (!formEl) return;
  formEl.innerHTML = `<div style="padding:1rem;color:var(--text-muted);font-size:0.82rem">✨ Asking IntelliQ to suggest metrics…</div>`;
  try {
    const res  = await fetch('/api/metrics/suggest', { method: 'POST', headers: Auth._headers(), body: JSON.stringify({}) });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    const suggestions = data.suggestions || [];
    formEl.innerHTML = `
      <div class="card">
        <div class="card-header"><div class="card-title">✨ AI Metric Suggestions</div></div>
        <div class="card-body">
          <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:0.8rem">Select the ones that fit your org — you can always add more later.</div>
          ${suggestions.map((s,i)=>`
            <label style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem;border-radius:6px;cursor:pointer;border:1px solid var(--border);margin-bottom:0.3rem">
              <input type="checkbox" value="${s}" checked />
              <span style="font-size:0.85rem">${s}</span>
            </label>`).join('')}
          <div style="display:flex;gap:0.5rem;margin-top:0.8rem">
            <button class="btn btn-accent btn-sm" onclick="_addSuggestedMetrics()">Add Selected</button>
            <button class="btn btn-outline btn-sm" onclick="document.getElementById('settings-metric-form').innerHTML=''">Dismiss</button>
          </div>
        </div>
      </div>`;
  } catch(e) {
    formEl.innerHTML = `<div style="color:var(--danger);font-size:0.82rem">AI suggestion failed: ${e.message}</div>`;
  }
}

async function _addSuggestedMetrics() {
  const checkboxes = document.querySelectorAll('#settings-metric-form input[type=checkbox]:checked');
  const names      = Array.from(checkboxes).map(c => c.value);
  let added = 0;
  for (const name of names) {
    try {
      const res = await fetch('/api/metrics', {
        method: 'POST', headers: Auth._headers(),
        body: JSON.stringify({ name, source: 'org' }),
      });
      const data = await res.json();
      if (data.ok) added++;
    } catch(e) { /* skip */ }
  }
  document.getElementById('settings-metric-form').innerHTML = '';
  renderMetricsSettings();
  showToast(`${added} metric${added!==1?'s':''} added ✓`, 'success');
}

/* ── VALUES SETTINGS ─────────────────────────────────────── */
async function _loadValuesIntoTextarea() {
  const ta = document.getElementById('settings-values-input');
  if (!ta) return;
  try {
    const res  = await fetch('/api/values', { headers: Auth._headers() });
    const data = await res.json();
    ta.value = (data.values || []).join('\n');
  } catch(e) { /* non-fatal */ }
}

async function saveOrgValues() {
  const ta     = document.getElementById('settings-values-input');
  const status = document.getElementById('settings-values-status');
  if (!ta) return;
  const values = ta.value.split('\n').map(v=>v.trim()).filter(Boolean);
  try {
    const res  = await fetch('/api/values', {
      method: 'PUT', headers: Auth._headers(),
      body: JSON.stringify({ values }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    AppState.orgValues = data.values;
    if (status) { status.textContent = `Saved ${data.values.length} values ✓`; status.style.color = 'var(--success)'; }
    showToast('Values saved ✓', 'success');
  } catch(e) {
    if (status) { status.textContent = e.message; status.style.color = 'var(--danger)'; }
  }
}

/* ── GOALS SETTINGS ──────────────────────────────────────── */
async function renderGoalsSettings() {
  const el = document.getElementById('settings-goals-list');
  if (!el) return;
  el.innerHTML = '<div style="color:var(--text-muted);font-size:0.82rem">Loading…</div>';
  try {
    const res  = await fetch('/api/goals', { headers: Auth._headers() });
    const data = await res.json();
    const goals = data.goals || [];
    if (!goals.length) {
      el.innerHTML = `<div style="text-align:center;padding:1.5rem;color:var(--text-muted)">No org goals yet. Add your first goal above.</div>`;
      return;
    }
    el.innerHTML = goals.map(g => `
      <div style="display:flex;align-items:center;gap:0.6rem;padding:0.6rem 0;border-bottom:1px solid var(--border)">
        <span style="font-size:0.88rem;flex:1">${g.text}</span>
        <span style="font-size:0.72rem;color:var(--text-muted)">${g.status || 'active'}</span>
        ${Auth.canDo('manage_goals') ? `<button onclick="deleteGoal('${g.goalId}')" style="background:none;border:none;cursor:pointer;color:var(--text-muted)">✕</button>` : ''}
      </div>`).join('');
  } catch(e) {
    el.innerHTML = `<div style="color:var(--danger);font-size:0.82rem">Failed to load goals.</div>`;
  }
}

function renderAddGoal() {
  const formEl = document.getElementById('settings-goal-form');
  if (!formEl) return;
  formEl.innerHTML = `
    <div class="card">
      <div class="card-body">
        <div style="display:flex;gap:0.5rem;align-items:flex-end">
          <div style="flex:1">
            <label class="form-label">GOAL</label>
            <input id="new-goal-text" class="form-input" placeholder="e.g. Every member completes one reflection per week" />
          </div>
          <button class="btn btn-accent btn-sm" onclick="_submitAddGoal()">Add</button>
          <button class="btn btn-outline btn-sm" onclick="document.getElementById('settings-goal-form').innerHTML=''">Cancel</button>
        </div>
      </div>
    </div>`;
  setTimeout(() => document.getElementById('new-goal-text')?.focus(), 50);
}

async function _submitAddGoal() {
  const text = (document.getElementById('new-goal-text')?.value || '').trim();
  if (!text) { showToast('Enter a goal', 'warning'); return; }
  try {
    const res  = await fetch('/api/goals', {
      method: 'POST', headers: Auth._headers(),
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    document.getElementById('settings-goal-form').innerHTML = '';
    renderGoalsSettings();
    showToast('Goal added ✓', 'success');
  } catch(e) { showToast(e.message, 'warning'); }
}

async function deleteGoal(goalId) {
  if (!confirm('Remove this goal?')) return;
  try {
    const res  = await fetch(`/api/goals/${goalId}`, { method: 'DELETE', headers: Auth._headers() });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    renderGoalsSettings();
    showToast('Goal removed', 'success');
  } catch(e) { showToast(e.message, 'warning'); }
}

/* ── PEOPLE PAGE TABS ────────────────────────────────────── */
function switchPeopleTab(tab) {
  ['tree','onboard','groups'].forEach(t => {
    const el = document.getElementById(`people-tab-${t}`);
    if (el) el.style.display = t === tab ? 'block' : 'none';
  });
  document.querySelectorAll('#page-people .tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  if (tab === 'groups')  renderGroups();
  if (tab === 'tree')    renderPeople();
  if (tab === 'onboard') renderOnboardHub();
}

/* Navigate to People page and open a specific onboard sub-tab */
function openOnboardingTab(sub) {
  navigate('people');
  setTimeout(() => {
    switchPeopleTab('onboard');
    if (sub) _openOnboardSection(sub);
  }, 80);
}

/* ══════════════════════════════════════════════════════════════
   ONBOARDING HUB (Sprint 2 — invite-only, no default passwords,
   no sample data)
   ══════════════════════════════════════════════════════════════ */
function renderOnboardHub() {
  const el    = document.getElementById('onboard-hub-content');
  if (!el) return;
  const color = ORG_MODES[AppState.mode]?.color || 'var(--accent)';

  el.innerHTML = `
    <!-- Method cards -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0.75rem;margin-bottom:1.5rem">
      ${_onboardCard('add',    '👤', 'Add Person',         'Add one person with their email',   color)}
      ${_onboardCard('import', '📁', 'Import Spreadsheet', 'Upload a CSV or XLSX file',         color)}
      ${_onboardCard('invite', '✉',  'Invite by Email',    'Send personalised email invites',   color)}
      ${_onboardCard('link',   '🔗', 'Generate Join Link', 'Shareable self-registration link',  color)}
    </div>

    <!-- Active panel -->
    <div id="onboard-active-panel"></div>

    <!-- Recent additions -->
    <div id="onboard-recent" style="margin-top:1rem"></div>
  `;
  _renderOnboardRecent();
}

function _onboardCard(id, icon, label, sub, color) {
  return `
    <div onclick="_openOnboardSection('${id}')" style="cursor:pointer;background:var(--surface-1);border:1px solid var(--border);border-radius:10px;padding:1.1rem;display:flex;flex-direction:column;align-items:flex-start;gap:0.4rem;transition:border-color 0.15s"
      onmouseover="this.style.borderColor='${color}'" onmouseout="this.style.borderColor='var(--border)'">
      <span style="font-size:1.4rem">${icon}</span>
      <div style="font-size:0.88rem;font-weight:700;color:var(--text-primary)">${label}</div>
      <div style="font-size:0.75rem;color:var(--text-secondary)">${sub}</div>
    </div>`;
}

let _currentOnboardSection = null;

function _openOnboardSection(section) {
  _currentOnboardSection = section;
  const el = document.getElementById('onboard-active-panel');
  if (!el) return;

  if (section === 'add') {
    // Build node selector from OrgTree
    const nodeOptions = Object.values(OrgTree._nodes || {})
      .sort((a,b)=>a.name.localeCompare(b.name))
      .map(n => `<option value="${n.nodeId}">${n.name}</option>`).join('');

    el.innerHTML = `
      <div class="card" style="margin-bottom:0">
        <div class="card-header"><div class="card-title">👤 Add Person</div></div>
        <div class="card-body">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.7rem;margin-bottom:0.7rem">
            <div><label class="form-label">FIRST NAME *</label><input id="ob-add-first" class="form-input" placeholder="First name" /></div>
            <div><label class="form-label">LAST NAME *</label><input id="ob-add-last" class="form-input" placeholder="Last name" /></div>
            <div><label class="form-label">EMAIL ADDRESS *</label><input id="ob-add-email" class="form-input" type="email" placeholder="person@example.com" /></div>
            ${nodeOptions ? `<div style="grid-column:1/-1">
              <label class="form-label">ORG NODE (optional)</label>
              <select id="ob-add-node" class="form-input">
                <option value="">— None —</option>
                ${nodeOptions}
              </select>
            </div>` : ''}
          </div>
          <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.8rem">
            An invite link will be generated after adding. Share it with the person so they can set their own password.
          </div>
          <button class="btn btn-accent btn-sm" onclick="_submitAddPerson()">Send Invite</button>
          <span id="ob-add-result" style="margin-left:0.7rem;font-size:0.8rem"></span>
        </div>
      </div>`;

  } else if (section === 'import') {
    el.innerHTML = `
      <div class="card" style="margin-bottom:0">
        <div class="card-header"><div class="card-title">📁 Import Spreadsheet</div></div>
        <div class="card-body">
          <div style="font-size:0.82rem;color:var(--text-secondary);margin-bottom:0.8rem;line-height:1.6">
            Upload a <strong>CSV</strong> or <strong>XLSX</strong> file. Required columns: <code>name</code>, <code>email</code>. Optional: <code>role</code>, <code>group</code>/<code>department</code>.
          </div>
          <div style="margin-bottom:0.8rem">
            <input type="file" id="ob-import-file" accept=".csv,.xlsx,.xls" class="form-input" style="padding:6px" onchange="_previewImportFile()" />
          </div>
          <div id="ob-import-preview" style="margin-bottom:0.8rem"></div>
          <button class="btn btn-accent btn-sm" id="ob-import-btn" onclick="_submitImport()" style="display:none">Import All</button>
          <span id="ob-import-result" style="margin-left:0.7rem;font-size:0.8rem"></span>
        </div>
      </div>`;

  } else if (section === 'invite') {
    el.innerHTML = `
      <div class="card" style="margin-bottom:0">
        <div class="card-header"><div class="card-title">✉ Invite by Email</div></div>
        <div class="card-body">
          <div style="font-size:0.82rem;color:var(--text-secondary);margin-bottom:0.7rem;line-height:1.5">
            Enter email addresses, one per line. Each gets a unique invite link to copy and share. (Email delivery is not yet active — you copy and send the link yourself.)
          </div>
          <textarea id="ob-invite-emails" class="form-input" rows="4"
            placeholder="john@company.com&#10;sarah@company.com&#10;alex@company.com" style="margin-bottom:0.6rem;font-family:monospace"></textarea>
          <div style="display:flex;gap:0.7rem;align-items:center;margin-bottom:0.7rem;flex-wrap:wrap">
            <div style="display:flex;align-items:center;gap:0.4rem">
              <label class="form-label" style="margin:0">Group:</label>
              <input id="ob-invite-group" class="form-input" style="width:160px" placeholder="Optional" />
            </div>
          </div>
          <button class="btn btn-accent btn-sm" onclick="_submitEmailInvites()">Generate Invite Links</button>
          <div id="ob-invite-result" style="margin-top:0.8rem;font-size:0.8rem"></div>
        </div>
      </div>`;

  } else if (section === 'link') {
    el.innerHTML = `
      <div class="card" style="margin-bottom:0">
        <div class="card-header"><div class="card-title">🔗 Generate Join Link</div></div>
        <div class="card-body">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.7rem;margin-bottom:0.7rem">
            <div>
              <label class="form-label">Link Label</label>
              <input id="ob-link-label" class="form-input" placeholder="e.g. Cohort A, Leadership Team" />
            </div>
            <div>
              <label class="form-label">Group (optional)</label>
              <input id="ob-link-group" class="form-input" placeholder="e.g. Unit A, Department X…" />
            </div>
            <div>
              <label class="form-label">Expires in</label>
              <select id="ob-link-expiry" class="form-input">
                <option value="7">7 days</option>
                <option value="14">14 days</option>
                <option value="30">30 days</option>
              </select>
            </div>
            <div>
              <label class="form-label">Max uses (0 = unlimited)</label>
              <input id="ob-link-limit" class="form-input" type="number" min="0" value="0" />
            </div>
          </div>
          <button class="btn btn-accent btn-sm" onclick="_createJoinLink()">Generate Link</button>
          <div id="ob-link-result" style="margin-top:0.8rem"></div>
          <div id="ob-link-list" style="margin-top:1rem"></div>
        </div>
      </div>`;
    _loadJoinLinks();

  }
  // 'sample' section removed in Sprint 2 — no demo data injection
}

/* ── Onboard action handlers ──────────────────────────────── */
async function _submitAddPerson() {
  const firstName = (document.getElementById('ob-add-first')?.value || '').trim();
  const lastName  = (document.getElementById('ob-add-last')?.value  || '').trim();
  const email     = (document.getElementById('ob-add-email')?.value  || '').trim().toLowerCase();
  const role      = 'member';  // Default — elevate permissions via People → Permissions after onboarding
  const nodeId    = document.getElementById('ob-add-node')?.value    || '';
  const resEl     = document.getElementById('ob-add-result');
  const fullName  = `${firstName} ${lastName}`.trim();

  if (!firstName) { if (resEl) resEl.textContent = 'First name is required.'; return; }
  if (!email)     { if (resEl) resEl.textContent = 'Email address is required.'; return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { if (resEl) resEl.textContent = 'Enter a valid email.'; return; }

  try {
    if (resEl) resEl.textContent = 'Creating account…';
    const res  = await authFetch('/api/auth/create-user', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orgCode:    AppState.orgCode,
        creatorId:  Auth.currentUser?.id,
        firstName, lastName, name: fullName, email, role,
        // passwordSet = false so they get the set-password flow on first login
      }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);

    // Assign to org tree node if selected
    if (nodeId && OrgTree._nodes[nodeId]) {
      const currentIds = OrgTree._nodes[nodeId].memberIds || [];
      if (!currentIds.includes(data.user.id)) {
        await fetch(`/api/tree/node/${nodeId}`, {
          method: 'PUT', headers: Auth._headers(),
          body: JSON.stringify({ memberIds: [...currentIds, data.user.id] }),
        });
        OrgTree._nodes[nodeId].memberIds = [...currentIds, data.user.id];
      }
    }

    // Generate an invite link for this person so admin can share it
    let inviteLink = '';
    try {
      const invRes  = await authFetch('/api/auth/invite', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgCode: AppState.orgCode, role, label: email, expiryDays: 14 }),
      });
      const invData = await invRes.json();
      if (invData.ok) inviteLink = `${window.location.origin}${invData.url}`;
    } catch(_) { /* non-fatal */ }

    const safeLink = inviteLink.replace(/'/g, "\\'");
    if (resEl) resEl.innerHTML = `
      <div style="color:var(--success);margin-bottom:0.4rem">✓ Account created for ${fullName}.</div>
      ${inviteLink
        ? `<div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:0.3rem">Share this link so they can set their password:</div>
           <div style="font-family:monospace;font-size:0.72rem;color:var(--accent);word-break:break-all;margin-bottom:0.3rem">${inviteLink}</div>
           <button onclick="navigator.clipboard.writeText('${safeLink}').then(()=>showToast('Link copied!','success'))" class="btn btn-outline btn-sm" style="padding:2px 8px;font-size:0.72rem">📋 Copy Invite Link</button>`
        : `<div style="font-size:0.78rem;color:var(--text-muted)">They can log in with their email once a password is set.</div>`
      }`;
    _addMemberToAppState({ ...data.user });
    // Clear fields
    ['ob-add-first','ob-add-last','ob-add-email'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    _renderOnboardRecent();
    showToast(`${fullName} added ✓`, 'success');
  } catch(e) {
    if (resEl) resEl.textContent = e.message;
  }
}

let _importRows = [];
async function _previewImportFile() {
  const file  = document.getElementById('ob-import-file')?.files[0];
  const el    = document.getElementById('ob-import-preview');
  const btn   = document.getElementById('ob-import-btn');
  if (!file || !el) return;
  el.innerHTML = '<div style="color:var(--text-muted);font-size:0.8rem">Parsing…</div>';

  try {
    const text = await file.text();
    _importRows = _parseCSV(text);
    if (!_importRows.length) { el.innerHTML = '<div style="color:var(--warning);font-size:0.8rem">No rows found. Check file format.</div>'; return; }

    el.innerHTML = `
      <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:0.4rem">${_importRows.length} row(s) found — preview:</div>
      <div style="overflow-x:auto;max-height:180px;border:1px solid var(--border);border-radius:6px">
        <table style="width:100%;border-collapse:collapse;font-size:0.75rem">
          <thead><tr style="background:var(--surface-2)">${Object.keys(_importRows[0]).map(k=>`<th style="padding:4px 8px;text-align:left;border-bottom:1px solid var(--border)">${k}</th>`).join('')}</tr></thead>
          <tbody>${_importRows.slice(0,5).map(r=>`<tr>${Object.values(r).map(v=>`<td style="padding:4px 8px;border-bottom:1px solid var(--border);color:var(--text-secondary)">${v||''}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
      </div>`;
    if (btn) btn.style.display = 'inline-block';
  } catch(e) {
    el.innerHTML = `<div style="color:var(--danger);font-size:0.8rem">Could not parse file: ${e.message}</div>`;
  }
}

function _parseCSV(text) {
  const lines = text.replace(/\r/g,'').split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z]/g,''));
  return lines.slice(1).map(line => {
    const vals = line.split(',');
    const obj  = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim().replace(/^"|"$/g,''); });
    return obj;
  }).filter(r => r.name);
}

async function _submitImport() {
  const resEl = document.getElementById('ob-import-result');
  if (!_importRows.length) return;
  if (resEl) resEl.textContent = `Importing ${_importRows.length} people…`;
  try {
    const res  = await authFetch('/api/auth/bulk-import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgCode: AppState.orgCode, users: _importRows }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Import failed');
    if (resEl) resEl.innerHTML = `<span style="color:var(--success)">✓ ${data.created.length} imported${data.skipped.length ? `, ${data.skipped.length} skipped (already exist)` : ''}.</span>`;
    showToast(`${data.created.length} people imported`, 'success');
    await loadRealOrgData();
    _renderOnboardRecent();
  } catch(e) {
    if (resEl) resEl.textContent = e.message;
  }
}

async function _submitEmailInvites() {
  const emailsRaw = document.getElementById('ob-invite-emails')?.value || '';
  const role      = 'member';  // Permissions set post-onboarding
  const group     = document.getElementById('ob-invite-group')?.value.trim() || '';
  const resEl     = document.getElementById('ob-invite-result');
  const emails    = emailsRaw.split('\n').map(e => e.trim()).filter(Boolean);
  if (!emails.length) { if (resEl) resEl.textContent = 'Enter at least one email.'; return; }
  if (resEl) resEl.innerHTML = 'Creating invite links…';
  const results = [];
  for (const email of emails) {
    try {
      const res  = await authFetch('/api/auth/invite', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgCode: AppState.orgCode, role, group, label: email, expiryDays: 14 }),
      });
      const data = await res.json();
      if (data.ok) results.push({ email, url: `${window.location.origin}${data.url}` });
    } catch(e) { /* skip */ }
  }
  if (resEl) {
    resEl.innerHTML = results.length
      ? `<div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:0.5rem">
           ⚠️ Email delivery is not yet active. Share these links directly with each person.
         </div>` +
        results.map(r => {
          const safeUrl = r.url.replace(/'/g, "\\'");
          return `<div style="margin-bottom:0.5rem;padding:0.5rem 0.7rem;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;font-size:0.78rem">
            <div style="font-weight:600;margin-bottom:0.2rem">Invite created for <span style="color:var(--accent)">${r.email}</span></div>
            <div style="font-family:monospace;font-size:0.72rem;color:var(--text-secondary);word-break:break-all;margin-bottom:0.3rem">${r.url}</div>
            <button onclick="navigator.clipboard.writeText('${safeUrl}').then(()=>showToast('Link copied!','success'))" class="btn btn-outline btn-sm" style="padding:2px 8px;font-size:0.72rem">📋 Copy Link</button>
          </div>`;
        }).join('')
      : '<span style="color:var(--danger)">Could not generate links.</span>';
  }
}

async function _createJoinLink() {
  const label  = document.getElementById('ob-link-label')?.value.trim() || '';
  const role   = 'member';  // Permissions set post-onboarding
  const group  = document.getElementById('ob-link-group')?.value.trim() || '';
  const expiry = parseInt(document.getElementById('ob-link-expiry')?.value) || 7;
  const limit  = parseInt(document.getElementById('ob-link-limit')?.value) || 0;
  const resEl  = document.getElementById('ob-link-result');
  try {
    const res  = await authFetch('/api/auth/invite', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgCode: AppState.orgCode, role, group, label, expiryDays: expiry, usageLimit: limit || null }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    const fullUrl = `${window.location.origin}${data.url}`;
    if (resEl) resEl.innerHTML = `
      <div style="padding:0.6rem 0.8rem;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;font-size:0.8rem">
        <div style="font-weight:700;color:var(--text-primary);margin-bottom:0.3rem">🔗 ${label || 'Join Link'} created</div>
        <div style="font-family:monospace;color:var(--accent);word-break:break-all;margin-bottom:0.4rem">${fullUrl}</div>
        <button onclick="navigator.clipboard.writeText('${fullUrl}').then(()=>showToast('Link copied!','success'))" class="btn btn-outline btn-sm">📋 Copy Link</button>
      </div>`;
    showToast('Join link created', 'success');
    _loadJoinLinks();
  } catch(e) {
    if (resEl) resEl.textContent = e.message;
  }
}

async function _loadJoinLinks() {
  const el = document.getElementById('ob-link-list');
  if (!el) return;
  try {
    const res  = await authFetch(`/api/auth/join-links?orgCode=${encodeURIComponent(AppState.orgCode)}`);
    const data = await res.json();
    const links = data.links || [];
    if (!links.length) { el.innerHTML = '<div style="font-size:0.78rem;color:var(--text-muted)">No active join links.</div>'; return; }
    el.innerHTML = `<div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--text-muted);margin-bottom:0.5rem">Active Links</div>` +
      links.map(l => {
        const expires = new Date(l.expiresAt).toLocaleDateString('en-GB');
        const fullUrl = `${window.location.origin}/?invite=${l.token}`;
        return `<div style="padding:0.5rem 0.7rem;background:var(--surface-2);border:1px solid var(--border);border-radius:6px;margin-bottom:0.4rem;font-size:0.78rem">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:0.5rem;flex-wrap:wrap">
            <div>
              <span style="font-weight:600">${l.label || l.role}</span>
              ${l.group ? `<span style="color:var(--text-muted)"> · ${l.group}</span>` : ''}
              <span style="color:var(--text-muted)"> · ${l.useCount}${l.usageLimit ? '/'+l.usageLimit : ''} uses · expires ${expires}</span>
            </div>
            <button onclick="navigator.clipboard.writeText('${fullUrl}').then(()=>showToast('Copied','success'))" class="btn btn-outline btn-sm" style="padding:2px 8px">📋 Copy</button>
          </div>
        </div>`;
      }).join('');
  } catch(e) { /* ignore */ }
}

// _loadSampleData removed in Sprint 2 — no demo data injection

function _renderOnboardRecent() {
  const el = document.getElementById('onboard-recent');
  if (!el) return;
  const members = AppState.members.slice().reverse().slice(0, 8);
  if (!members.length) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--text-muted);margin-bottom:0.5rem">People in This Org (${AppState.members.length})</div>
    <div style="display:flex;flex-wrap:wrap;gap:0.4rem">
      ${members.map(m => `
        <div style="padding:0.35rem 0.7rem;background:var(--surface-1);border:1px solid var(--border);border-radius:20px;font-size:0.78rem;display:flex;align-items:center;gap:0.4rem">
          <div style="width:20px;height:20px;border-radius:50%;background:${m.color}22;color:${m.color};font-size:0.62rem;display:flex;align-items:center;justify-content:center;font-weight:700">${m.initials}</div>
          <span>${m.name}</span>
          <span style="color:var(--text-muted);font-size:0.7rem">${m.role}</span>
        </div>`).join('')}
      ${AppState.members.length > 8 ? `<div style="padding:0.35rem 0.7rem;color:var(--text-muted);font-size:0.78rem">+${AppState.members.length - 8} more</div>` : ''}
    </div>`;
}

/* ── GROUPS ──────────────────────────────────────────────── */
let _platformGroups = [];
let _currentGroupId = null;

async function renderGroups() {
  const orgCode = Auth.currentUser?.orgCode || AppState.orgCode;
  if (!orgCode) return;
  const container = document.getElementById('groups-list');
  if (!container) return;
  container.innerHTML = `<div style="color:var(--text-muted);font-size:0.82rem;padding:1rem">Loading…</div>`;

  try {
    const res  = await fetch(`/api/groups?orgCode=${encodeURIComponent(orgCode)}`);
    const data = res.ok ? await res.json() : { groups: [] };
    _platformGroups = data.groups || [];

    if (!_platformGroups.length) {
      container.innerHTML = `
        <div style="text-align:center;padding:2.5rem 1rem;background:var(--surface-1);border:1px solid var(--border);border-radius:var(--radius)">
          <div style="font-size:2rem;margin-bottom:0.6rem">👥</div>
          <div style="font-size:0.9rem;font-weight:600;margin-bottom:0.3rem">No groups yet</div>
          <div style="font-size:0.82rem;color:var(--text-secondary)">Create sub-groups within your org. People can be in multiple groups.</div>
        </div>`;
      return;
    }

    // Get all org users for display
    const treeRes  = await fetch(`/api/auth/org-tree?orgCode=${encodeURIComponent(orgCode)}`);
    const treeData = treeRes.ok ? await treeRes.json() : { flat: [] };
    const allUsers = treeData.flat || [];
    const byId     = {};
    allUsers.forEach(u => byId[u.id] = u);

    container.innerHTML = _platformGroups.map(g => {
      const members = (g.memberIds || []).map(id => byId[id]?.name || id).slice(0,5);
      const leads   = (g.leadIds   || []).map(id => byId[id]?.name || id);
      const color   = ORG_MODES[AppState.mode].color;
      return `
        <div style="background:var(--surface-1);border:1px solid var(--border);border-radius:var(--radius);padding:1rem;margin-bottom:0.7rem">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:0.5rem">
            <div>
              <div style="font-size:0.95rem;font-weight:700">${g.name}</div>
              ${g.description ? `<div style="font-size:0.8rem;color:var(--text-secondary);margin-top:2px">${g.description}</div>` : ''}
            </div>
            <div style="display:flex;gap:0.4rem">
              <button class="btn btn-outline btn-sm" onclick="openGroupDetail('${g.id}')">View Feed</button>
              <button class="btn btn-outline btn-sm" onclick="openEditGroup('${g.id}')">Edit</button>
              <button class="btn btn-sm" style="color:var(--danger);border-color:rgba(247,79,79,0.3);background:none" onclick="deleteGroup('${g.id}')">✕</button>
            </div>
          </div>
          <div style="display:flex;gap:0.4rem;flex-wrap:wrap;align-items:center">
            <span style="font-size:0.7rem;color:var(--text-muted)">${g.memberIds?.length || 0} members</span>
            ${leads.length ? `<span style="font-size:0.72rem;padding:2px 8px;background:${color}22;color:${color};border-radius:20px;border:1px solid ${color}44">Lead: ${leads.join(', ')}</span>` : ''}
            ${members.map(n => `<span style="font-size:0.72rem;padding:2px 8px;background:var(--surface-2);border:1px solid var(--border);border-radius:20px;color:var(--text-secondary)">${n}</span>`).join('')}
            ${g.memberIds?.length > 5 ? `<span style="font-size:0.72rem;color:var(--text-muted)">+${g.memberIds.length-5} more</span>` : ''}
          </div>
        </div>`;
    }).join('');
  } catch(e) {
    if (container) container.innerHTML = `<div style="color:var(--danger);font-size:0.82rem">Could not load groups.</div>`;
  }
}

async function openCreateGroup() {
  // Populate member/lead lists from org tree
  const orgCode = Auth.currentUser?.orgCode || AppState.orgCode;
  const treeRes  = await fetch(`/api/auth/org-tree?orgCode=${encodeURIComponent(orgCode)}`).catch(() => null);
  const treeData = treeRes?.ok ? await treeRes.json() : { flat: [] };
  const allUsers = (treeData.flat || []).filter(u => u.id !== Auth.currentUser?.id);

  const makeList = (containerId, preselected = []) => {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = allUsers.map(u => `
      <label style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0.2rem;cursor:pointer;font-size:0.82rem">
        <input type="checkbox" value="${u.id}" ${preselected.includes(u.id) ? 'checked' : ''}/>
        <div class="user-avatar" style="width:22px;height:22px;font-size:0.6rem;background:${COLORS[allUsers.indexOf(u)%COLORS.length]};flex-shrink:0">${u.name.slice(0,2).toUpperCase()}</div>
        ${u.name} <span style="color:var(--text-muted);font-size:0.72rem">${u.role}</span>
      </label>`).join('');
  };

  document.getElementById('cg-name').value = '';
  document.getElementById('cg-desc').value = '';
  makeList('cg-members-list');
  makeList('cg-leads-list');
  openModal('create-group-modal');
}

async function submitCreateGroup() {
  const name    = (document.getElementById('cg-name')?.value || '').trim();
  const desc    = (document.getElementById('cg-desc')?.value || '').trim();
  if (!name) { showToast('Give the group a name', 'warning'); return; }

  const memberIds = [...document.querySelectorAll('#cg-members-list input:checked')].map(cb => cb.value);
  const leadIds   = [...document.querySelectorAll('#cg-leads-list input:checked')].map(cb => cb.value);
  const orgCode   = Auth.currentUser?.orgCode || AppState.orgCode;

  try {
    const res = await fetch('/api/groups/create', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgCode, name, description: desc, memberIds, leadIds }),
    });
    if (!res.ok) throw new Error();
    closeAllModals();
    showToast(`Group "${name}" created`, 'success');
    renderGroups();
  } catch(e) {
    showToast('Could not create group', 'warning');
  }
}

async function deleteGroup(gid) {
  const orgCode = Auth.currentUser?.orgCode || AppState.orgCode;
  await fetch(`/api/groups/${gid}`, {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orgCode }),
  });
  showToast('Group removed', 'success');
  renderGroups();
}

async function openGroupDetail(gid) {
  _currentGroupId = gid;
  const group = _platformGroups.find(g => g.id === gid);
  document.getElementById('gd-title').textContent = group?.name || 'Group';
  document.getElementById('gd-sub').textContent   = `${group?.memberIds?.length || 0} members · shared notes & messages`;
  document.getElementById('gd-compose').value     = '';
  openModal('group-detail-modal');
  await loadGroupFeed(gid);
}

async function loadGroupFeed(gid) {
  const feedEl  = document.getElementById('gd-feed');
  if (!feedEl) return;
  feedEl.innerHTML = `<div style="padding:1rem;text-align:center;color:var(--text-muted);font-size:0.82rem">Loading…</div>`;

  const orgCode = Auth.currentUser?.orgCode || AppState.orgCode;
  const me      = Auth.currentUser?.id;

  try {
    const res  = await fetch(`/api/groups/${gid}/feed?orgCode=${encodeURIComponent(orgCode)}&requesterId=${encodeURIComponent(me)}`);
    const data = res.ok ? await res.json() : { notes: [], messages: [] };

    const allItems = [
      ...(data.notes    || []).map(n => ({ ...n, _kind: 'note'    })),
      ...(data.messages || []).map(m => ({ ...m, _kind: 'message' })),
    ].sort((a,b) => b.createdAt.localeCompare(a.createdAt));

    if (!allItems.length) {
      feedEl.innerHTML = `<div style="text-align:center;padding:1.5rem;color:var(--text-muted);font-size:0.82rem">No shared notes or messages yet.<br>Members post from the IntelliQ app.</div>`;
      return;
    }

    feedEl.innerHTML = allItems.map(item => {
      const isAnon   = item.anonymous || item.type === 'anonymous';
      const author   = isAnon ? 'Anonymous' : (item.authorName || item.fromName || '—');
      const icon     = isAnon ? '👤' : (item._kind === 'note' ? '📝' : '💬');
      const typeLabel = item._kind === 'note' ? (item.type || 'shared') : 'message';
      const color    = ORG_MODES[AppState.mode].color;
      const time     = new Date(item.createdAt).toLocaleString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
      return `
        <div style="padding:0.8rem 0;border-bottom:1px solid var(--border)">
          <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.4rem">
            <span>${icon}</span>
            <span style="font-size:0.82rem;font-weight:600">${author}</span>
            <span style="font-size:0.68rem;padding:2px 7px;background:var(--surface-2);border-radius:20px;border:1px solid var(--border);color:var(--text-muted)">${typeLabel}</span>
            <span style="font-size:0.7rem;color:var(--text-muted);margin-left:auto">${time}</span>
          </div>
          <div style="font-size:0.83rem;color:var(--text-secondary);line-height:1.55">${item.content}</div>
        </div>`;
    }).join('');
  } catch(e) {
    feedEl.innerHTML = `<div style="color:var(--danger);font-size:0.82rem">Could not load feed.</div>`;
  }
}

async function sendGroupMessage(anonymous) {
  const text    = (document.getElementById('gd-compose')?.value || '').trim();
  if (!text || !_currentGroupId) { showToast('Write something first', 'warning'); return; }
  const orgCode = Auth.currentUser?.orgCode || AppState.orgCode;
  const me      = Auth.currentUser;

  await fetch('/api/messages/send', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orgCode, fromId: me?.id, fromName: me?.name,
      toType: 'group', toId: _currentGroupId,
      content: text, anonymous,
    }),
  });

  document.getElementById('gd-compose').value = '';
  showToast(anonymous ? 'Sent anonymously ✓' : 'Message sent ✓', 'success');
  loadGroupFeed(_currentGroupId);
}

/* ── PLATFORM INBOX (all groups, cross-group view) ───────── */
async function renderPlatformInbox() {
  const el = document.getElementById('platform-inbox-content');
  if (!el) return;

  const orgCode = Auth.currentUser?.orgCode || AppState.orgCode;
  if (!_platformGroups.length) {
    try {
      const res = await fetch(`/api/groups?orgCode=${encodeURIComponent(orgCode)}`);
      const data = res.ok ? await res.json() : { groups: [] };
      _platformGroups = data.groups || [];
    } catch(e) {}
  }

  if (!_platformGroups.length) {
    el.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--text-muted);font-size:0.82rem">Create groups first to see their feeds here.</div>`;
    return;
  }

  el.innerHTML = _platformGroups.map(g => `
    <div style="background:var(--surface-1);border:1px solid var(--border);border-radius:var(--radius);padding:0.8rem 1rem;margin-bottom:0.6rem;cursor:pointer;display:flex;align-items:center;justify-content:space-between"
         onclick="openGroupDetail('${g.id}')">
      <div>
        <div style="font-size:0.88rem;font-weight:600">${g.name}</div>
        <div style="font-size:0.75rem;color:var(--text-muted)">${g.memberIds?.length || 0} members</div>
      </div>
      <span style="color:var(--accent);font-size:0.82rem">View →</span>
    </div>`).join('');
}

function openEditGroup(gid) {
  showToast('Edit group — coming soon', 'info');
}

/* ── WEEKLY PULSE (IntelliQ page) ───────────────────────── */
async function loadWeeklyPulse() {
  const panel  = document.getElementById('weekly-pulse-panel');
  if (!panel) return;
  panel.innerHTML = `<div style="padding:1rem;text-align:center;color:var(--text-muted);font-size:0.82rem">Loading…</div>`;

  const orgCode = AppState.orgCode || AppState.orgName.toLowerCase().replace(/\s+/g,'-');

  try {
    // Get this week's raw submissions (both endpoints require auth)
    const [rawRes, synthRes] = await Promise.all([
      authFetch(`/api/weekly/org?orgCode=${encodeURIComponent(orgCode)}`),
      authFetch('/api/weekly/synthesis', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgCode, orgName: AppState.orgName, orgMode: AppState.mode }),
      }),
    ]);

    const rawData  = rawRes.ok  ? await rawRes.json()  : { assessments: [] };
    const synthData = synthRes.ok ? await synthRes.json() : { synthesis: null };

    const entries = rawData.assessments || [];
    const synth   = synthData.synthesis;

    if (!entries.length) {
      panel.innerHTML = `
        <div style="text-align:center;padding:1.5rem 0;color:var(--text-muted);font-size:0.82rem">
          <div style="font-size:1.5rem;margin-bottom:0.5rem">📋</div>
          No weekly reflections submitted yet for ${rawData.week || 'this week'}.<br>
          Members complete these in the IntelliQ app when they open it each week.
        </div>`;
      return;
    }

    const color = ORG_MODES[AppState.mode].color;
    let html = `<div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:0.8rem">${rawData.week || 'This Week'} · ${entries.length} submission${entries.length !== 1 ? 's' : ''}</div>`;

    // IntelliQ synthesis
    if (synth) {
      html += `
        <div style="background:rgba(124,90,245,0.07);border:1px solid rgba(124,90,245,0.2);border-radius:10px;padding:0.9rem;margin-bottom:1rem">
          <div style="font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--accent);margin-bottom:0.6rem">🧠 IntelliQ Synthesis</div>
          <div style="font-size:0.88rem;font-weight:600;color:var(--text-primary);margin-bottom:0.7rem">${synth.headline || ''}</div>
          ${synth.patterns?.length ? `
            <div style="font-size:0.7rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:0.4rem">Patterns</div>
            ${synth.patterns.map(p => `<div style="font-size:0.8rem;color:var(--text-secondary);padding:3px 0">• ${p}</div>`).join('')}` : ''}
          ${synth.watchFor?.length ? `
            <div style="font-size:0.7rem;font-weight:700;text-transform:uppercase;color:var(--warning);margin:0.6rem 0 0.4rem">Watch For</div>
            ${synth.watchFor.map(w => `<div style="font-size:0.8rem;color:var(--warning);padding:3px 0">⚠ ${w}</div>`).join('')}` : ''}
          ${synth.positives?.length ? `
            <div style="font-size:0.7rem;font-weight:700;text-transform:uppercase;color:var(--success);margin:0.6rem 0 0.4rem">Positives</div>
            ${synth.positives.map(p => `<div style="font-size:0.8rem;color:var(--success);padding:3px 0">✓ ${p}</div>`).join('')}` : ''}
          ${synth.recommendations?.length ? `
            <div style="font-size:0.7rem;font-weight:700;text-transform:uppercase;color:${color};margin:0.6rem 0 0.4rem">Recommended Actions</div>
            ${synth.recommendations.map((r,i) => `<div style="font-size:0.8rem;color:var(--text-secondary);padding:3px 0">${i+1}. ${r}</div>`).join('')}` : ''}
        </div>`;
    }

    // Individual submissions (coach can see each person's input)
    html += `<div style="font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:0.6rem">Individual Reflections</div>`;
    html += entries.map(e => {
      const member = AppState.members.find(m => m.name.toLowerCase() === e.memberName.toLowerCase());
      const col    = member?.color || color;
      const init   = e.memberName.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
      return `
        <div style="padding:0.7rem 0;border-bottom:1px solid var(--border)">
          <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem">
            <div class="user-avatar" style="width:26px;height:26px;font-size:0.65rem;background:${col}">${init}</div>
            <span style="font-size:0.82rem;font-weight:600">${e.memberName}</span>
            <span style="font-size:0.7rem;color:var(--text-muted)">${e.role}</span>
          </div>
          ${Object.entries(e.data).map(([k,v]) => v && v !== '—' ? `
            <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:1px">${k}:</div>
            <div style="font-size:0.82rem;color:var(--text-secondary);margin-bottom:0.4rem;line-height:1.5">${v}</div>` : '').join('')}
        </div>`;
    }).join('');

    panel.innerHTML = html;

  } catch(err) {
    panel.innerHTML = `<div style="font-size:0.82rem;color:var(--danger);padding:0.8rem">Could not load — check server connection.</div>`;
  }
}

// renderHierarchyBuilder / addHierarchyLevel / removeHierarchyLevel / saveHierarchy
// removed in Sprint 2.5. Org structure is now managed via the Org Tree (tree.js).

/* ── PROFILE MODAL ───────────────────────────────────────── */
function showProfile(id){
  const m = AppState.getMember(id);
  if(!m) return;
  try {
    _showProfileInner(id, m);
  } catch(err) {
    console.error('[showProfile] render error for', id, err);
    // Open the modal with a warning rather than crashing the whole app
    const recsEl = document.getElementById('pm-recs');
    if (recsEl) recsEl.innerHTML = `<div style="padding:0.6rem;background:rgba(247,79,79,0.08);border:1px solid rgba(247,79,79,0.25);border-radius:6px;font-size:0.8rem;color:var(--danger)">⚠ Some profile data could not be displayed. This member may not have completed assessments yet.</div>`;
    openModal('profile-modal');
  }
}
function _showProfileInner(id, m){
  const mode    = AppState.mode;
  const metrics = (AppState.orgMetrics || []).map(mt => mt.name || mt);
  const color   = m.color;

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

  // Chat history summary
  const chatEl = document.getElementById('pm-chat-history');
  if (chatEl) {
    const chats = (m.chatHistory || []).filter(h => h.role === 'user').slice(-4).reverse();
    chatEl.innerHTML = chats.length
      ? chats.map(h => `
          <div style="padding:0.5rem 0;border-bottom:1px solid var(--border);font-size:0.8rem;color:var(--text-secondary)">
            <span style="color:var(--text-muted);font-size:0.68rem">${h.date} · Member said: </span>${h.text.slice(0, 120)}${h.text.length > 120 ? '…' : ''}
          </div>`).join('')
      : `<div style="font-size:0.8rem;color:var(--text-muted)">No check-ins recorded yet.</div>`;
  }

  // Coach input tab
  _coachConcern = 'none';
  const coachEl = document.getElementById('pm-coach-content');
  if (coachEl) coachEl.innerHTML = renderCoachInputTab(id);

  // History sparkline data
  const _history = Array.isArray(m.history) ? m.history : [];
  document.getElementById('pm-history-vals').innerHTML = _history.length
    ? _history.map((v,i)=>`
        <div style="text-align:center;font-size:0.68rem;color:var(--text-muted)">${MONTHS[i]||i+1}<br>
          <span style="color:${scoreColor(v)};font-weight:600">${v}</span></div>`).join('')
    : `<div style="font-size:0.78rem;color:var(--text-muted);padding:0.4rem 0">No history yet.</div>`;

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
      data: _history,
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
// showAddMember / submitAddMember removed in Sprint 2.5.
// All person creation goes through People → Onboard → _submitAddPerson().

/* ── SCENARIOS PAGE ──────────────────────────────────────── */
function renderScenarios() {
  const color     = ORG_MODES[AppState.mode].color;
  const scenarios = AppState.scenarios;

  const gradeBadgeEl = document.getElementById('scenarios-grade-badge');
  if (gradeBadgeEl) gradeBadgeEl.innerHTML = gradeBadgeHTML(AppState.grade);

  const container = document.getElementById('scenarios-content');
  if (!container) return;

  const domainOptions = {
    school:     ['Moral IQ','Social IQ','Behavior IQ','Academic IQ'],
    sports:     ['Tactical','Mental Resilience','Team Dynamics','Leadership'],
    workplace:  ['Ethics','Leadership','Conflict','Performance'],
    military:   ['Tactical','Ethics','Command','Stress'],
    healthcare: ['Triage','Ethics','Patient Care','Decision'],
    government: ['Policy','Crisis','Integrity','Leadership'],
  }[AppState.mode] || ['General'];

  const scenarioCards = scenarios.length ? scenarios.map(s => {
    const completions = AppState.members.reduce((n, m) =>
      n + ((m.scenarioResults || []).filter(r => r.scenarioId === s.id).length), 0);
    return `
      <div class="scenario-card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.5rem">
          <div>
            <div class="scenario-card-title">${s.title}</div>
            <div style="display:flex;gap:0.4rem;margin-top:0.3rem;flex-wrap:wrap">
              <span class="domain-badge" style="background:${color}22;color:${color};border-color:${color}44">${s.domain}</span>
              <span class="domain-badge">${s.difficulty}</span>
              ${s.avgScore ? `<span class="domain-badge" style="color:var(--success);border-color:rgba(79,247,122,0.3)">Avg ${s.avgScore}</span>` : ''}
            </div>
          </div>
          <div style="font-size:0.7rem;color:var(--text-muted);text-align:right;flex-shrink:0">
            ${completions} run${completions !== 1 ? 's' : ''}<br>
            <span style="font-size:0.65rem">${s.createdAt}</span>
          </div>
        </div>
        <div style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:0.8rem;line-height:1.5">${s.brief}</div>
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div style="font-size:0.72rem;color:var(--text-muted)">Created by ${s.createdBy}</div>
          <div style="display:flex;gap:0.4rem;align-items:center;flex-wrap:wrap">
            <select class="form-input" id="sc-launch-member-${s.id}" style="font-size:0.75rem;padding:4px 8px;height:auto">
              <option value="">— Member —</option>
              ${[...AppState.members].sort((a,b)=>a.name.localeCompare(b.name))
                .map(m=>`<option value="${m.id}">${m.name}</option>`).join('')}
            </select>
            <button class="btn btn-accent btn-sm" onclick="launchScenario('${s.id}')">▶ Run Here</button>
            <button class="btn btn-outline btn-sm" onclick="assignToMemberApp('${s.id}')" title="Send to member's app">📱 Assign</button>
          </div>
        </div>
      </div>`;
  }).join('') : `
    <div style="padding:2.5rem 1rem;text-align:center;background:var(--surface-1);border:1px solid var(--border);border-radius:var(--radius)">
      <div style="font-size:2.5rem;margin-bottom:0.8rem">🎯</div>
      <div style="font-size:0.95rem;font-weight:600;color:var(--text-primary);margin-bottom:0.4rem">No assessments yet</div>
      <div style="font-size:0.82rem;color:var(--text-secondary)">Write a brief above — the AI designs it, you approve it, then it runs with the member.</div>
    </div>`;

  container.innerHTML = `
    <!-- BRIEF INPUT -->
    <div style="background:var(--surface-1);border:1px solid var(--border);border-radius:var(--radius);padding:1.2rem;margin-bottom:1rem">
      <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:0.9rem">Create an Assessment</div>

      <div style="margin-bottom:0.8rem">
        <label class="form-label">What's going on with this person?</label>
        <textarea id="sc-brief" class="form-input" rows="3" style="resize:vertical"
          placeholder="Describe what you've observed — their behaviour, recent performance, attitude, and anything that concerns or impresses you. Be specific."></textarea>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.7rem;margin-bottom:0.9rem">
        <div>
          <label class="form-label">Depth</label>
          <div style="display:flex;gap:0.4rem;margin-top:2px">
            ${['Basic','Standard','Advanced'].map(d => `
              <button class="domain-badge sc-diff-btn" data-diff="${d}"
                style="cursor:pointer;padding:5px 10px;font-size:0.73rem"
                onclick="selectDifficulty('${d}')">${d}</button>`).join('')}
          </div>
        </div>
        <div>
          <label class="form-label">Select Member</label>
          <select id="sc-member" class="form-input">
            <option value="">— Select member —</option>
            ${[...AppState.members].sort((a,b)=>a.name.localeCompare(b.name))
              .map(m=>`<option value="${m.id}">${m.name} · ${m.role}</option>`).join('')}
          </select>
        </div>
      </div>

      <div style="display:flex;justify-content:flex-end">
        <button class="btn btn-accent" id="sc-draft-btn" onclick="draftScenario()">
          ✦ Draft Assessment with AI →
        </button>
      </div>
    </div>

    <!-- DRAFT REVIEW PANEL (hidden until AI drafts) -->
    <div id="sc-draft-panel" style="display:none;background:var(--surface-1);border:1px solid var(--accent);border-radius:var(--radius);padding:1.2rem;margin-bottom:1rem">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
        <div>
          <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--accent)">AI Draft — Review &amp; Approve</div>
          <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px">Edit anything before it goes to the member. They will never see your brief or coach notes.</div>
        </div>
        <button class="btn btn-outline btn-sm" onclick="draftScenario()">↺ Regenerate</button>

      </div>

      <div style="margin-bottom:0.9rem">
        <label class="form-label">Scenario Title</label>
        <input type="text" id="sc-draft-title" class="form-input" />
      </div>

      <div style="margin-bottom:0.9rem">
        <label class="form-label">Opening Situation <span style="font-weight:400;text-transform:none;color:var(--text-muted)">(what the member will see first)</span></label>
        <textarea id="sc-draft-opening" class="form-input" rows="4" style="resize:vertical"></textarea>
      </div>

      <div style="margin-bottom:0.9rem">
        <label class="form-label">Probe Questions <span style="font-weight:400;text-transform:none;color:var(--text-muted)">(AI will use these as follow-up framework)</span></label>
        <div id="sc-draft-probes-list"></div>
      </div>

      <div style="background:rgba(124,90,245,0.08);border:1px solid rgba(124,90,245,0.25);border-radius:8px;padding:0.9rem;margin-bottom:1rem">
        <div style="font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--accent);margin-bottom:0.4rem">🔒 Coach Note — Private</div>
        <div id="sc-draft-coachnote" style="font-size:0.82rem;color:var(--text-secondary);line-height:1.6"></div>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:0.5rem">
        <button class="btn btn-outline" onclick="document.getElementById('sc-draft-panel').style.display='none'">Cancel</button>
        <button class="btn btn-accent" onclick="approveDraft()">✓ Approve &amp; Launch</button>
      </div>
    </div>

    <!-- SCENARIO LIST -->
    <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:0.8rem">
      ${scenarios.length} Assessment${scenarios.length !== 1 ? 's' : ''} Created
    </div>
    <div class="scenario-grid">${scenarioCards}</div>`;

  selectDifficulty('Medium');
}

let _scenarioDifficulty = 'Medium';

function selectDifficulty(diff) {
  _scenarioDifficulty = diff;
  document.querySelectorAll('.sc-diff-btn').forEach(btn => {
    const active = btn.dataset.diff === diff;
    const color  = ORG_MODES[AppState.mode].color;
    btn.style.background  = active ? `${color}22` : '';
    btn.style.color       = active ? color : '';
    btn.style.borderColor = active ? `${color}44` : '';
  });
}

/* ── Member-select helper ────────────────────────────────────────────────────
   Reads the value from any member <select>, then finds the matching AppState
   member by trying every field it might have been keyed on.

   The option value is normally m.id (a UUID string like "usr_abc123"), but
   older data paths can produce numeric fallback IDs or name-based values.
   This function tolerates all of them.

   Debug logging is intentionally left in so failures surface in the console
   rather than silently showing "Select a member." Remove the logs once the
   correct value format is confirmed in production.
──────────────────────────────────────────────────────────────────────────── */
function getSelectedMemberFromSelect(selectId) {
  const sel      = document.getElementById(selectId);
  const rawValue = sel?.value ?? '';

  console.log('[ASSIGN DEBUG]', {
    selectId,
    rawValue,
    selectedIndex:  sel?.selectedIndex,
    options: sel ? [...sel.options].map(o => ({ value: o.value, text: o.text })) : [],
    memberCount: AppState.members?.length,
  });

  if (!rawValue) return null;

  const found = (AppState.members || []).find(m =>
    String(m.id)     === String(rawValue) ||
    String(m.userId) === String(rawValue) ||
    m.email          === rawValue         ||
    m.name           === rawValue
  ) || null;

  console.log('[ASSIGN DEBUG] resolved member →', found?.name ?? '(none)', '| id:', found?.id ?? '—');
  return found;
}

async function draftScenario() {
  const brief  = (document.getElementById('sc-brief')?.value || '').trim();
  const member = getSelectedMemberFromSelect('sc-member');

  if (!brief)   { showToast('Write a brief first', 'warning'); return; }
  if (!member)  { showToast('Select a member', 'warning'); return; }

  const memberId = member.id;

  const btn = document.getElementById('sc-draft-btn');
  if (btn) { btn.textContent = '✦ Drafting…'; btn.disabled = true; }

  try {
    const res = await fetch('/api/draft-scenario', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brief,
        orgMode:    AppState.mode,
        orgName:    AppState.orgName,
        memberName: member?.name?.split(' ')[0] || 'the member',
        difficulty: _scenarioDifficulty,
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { draft } = await res.json();

    // Populate draft review panel
    document.getElementById('sc-draft-title').value   = draft.title   || '';
    document.getElementById('sc-draft-opening').value = draft.opening || '';
    document.getElementById('sc-draft-coachnote').textContent = draft.coachNote || '';

    const probesList = document.getElementById('sc-draft-probes-list');
    probesList.innerHTML = (draft.probes || []).map((p, i) => `
      <div style="display:flex;gap:0.5rem;margin-bottom:0.4rem;align-items:flex-start">
        <span style="font-size:0.72rem;color:var(--text-muted);padding-top:8px;flex-shrink:0">${i+1}.</span>
        <input type="text" class="form-input sc-probe-input" value="${p.replace(/"/g,'&quot;')}" style="flex:1;font-size:0.82rem" />
      </div>`).join('');

    document.getElementById('sc-draft-panel').style.display = 'block';
    document.getElementById('sc-draft-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  } catch (err) {
    console.warn('Draft API unavailable:', err.message);
    // Fallback: populate with a basic structure so the flow still works
    const domain = document.getElementById('sc-domain')?.value || 'General';
    document.getElementById('sc-draft-title').value   = `${domain} Scenario`;
    document.getElementById('sc-draft-opening').value = `Based on your brief: ${brief}\n\n[AI unavailable — edit this opening manually before launching]`;
    document.getElementById('sc-draft-coachnote').textContent = 'AI service unavailable. You can still edit and launch this scenario manually.';
    document.getElementById('sc-draft-probes-list').innerHTML = `
      <div style="display:flex;gap:0.5rem;margin-bottom:0.4rem">
        <span style="font-size:0.72rem;color:var(--text-muted);padding-top:8px">1.</span>
        <input type="text" class="form-input sc-probe-input" value="Why did you make that decision?" style="flex:1;font-size:0.82rem" />
      </div>`;
    document.getElementById('sc-draft-panel').style.display = 'block';
  } finally {
    if (btn) { btn.textContent = '✦ Draft Scenario with AI →'; btn.disabled = false; }
  }
}

function approveDraft() {
  const title    = (document.getElementById('sc-draft-title')?.value || '').trim();
  const opening  = (document.getElementById('sc-draft-opening')?.value || '').trim();
  const brief    = (document.getElementById('sc-brief')?.value || '').trim();
  const domain   = document.getElementById('sc-domain')?.value || 'General';
  const _member  = getSelectedMemberFromSelect('sc-member');
  const memberId = _member?.id || null;

  const probeInputs = document.querySelectorAll('.sc-probe-input');
  const probes = [...probeInputs].map(i => i.value.trim()).filter(Boolean);

  if (!title)    { showToast('Scenario needs a title', 'warning'); return; }
  if (!opening)  { showToast('Opening situation is empty', 'warning'); return; }
  if (!memberId) { showToast('Select a member', 'warning'); return; }

  const scenario = {
    id:          `sc_${Date.now()}`,
    title,
    brief,
    domain,
    context:     brief,
    opening,
    probes,
    difficulty:  _scenarioDifficulty,
    createdBy:   AppState.adminName,
    createdAt:   new Date().toLocaleDateString('en-GB'),
    completions: 0,
    avgScore:    null,
  };

  AppState.scenarios.push(scenario);
  document.getElementById('sc-draft-panel').style.display = 'none';
  showToast(`Scenario approved — launching for ${AppState.getMember(memberId)?.name}`, 'success');
  ScenarioEngine.start(scenario, memberId);
  renderScenarios();
}

function launchScenario(scenarioId) {
  const scenario = AppState.scenarios.find(s => s.id === scenarioId);
  if (!scenario) return;

  const member = getSelectedMemberFromSelect(`sc-launch-member-${scenarioId}`);
  if (!member) { showToast('Select a member to launch with', 'warning'); return; }
  ScenarioEngine.start(scenario, member.id);
}

async function assignToMemberApp(scenarioId) {
  const scenario = AppState.scenarios.find(s => s.id === scenarioId);
  if (!scenario) return;

  const member = getSelectedMemberFromSelect(`sc-launch-member-${scenarioId}`);
  if (!member) { showToast('Select a member first', 'warning'); return; }
  const orgCode = AppState.orgCode || AppState.orgName.toLowerCase().replace(/\s+/g,'-');

  try {
    const res = await fetch('/api/platform/assign-scenario', {
      method:  'POST',
      headers: Auth._headers(),   // auth token required by Phase 3 endpoint
      body: JSON.stringify({
        orgCode,
        memberName: member.name,
        memberId:   member.userId || member.authId || null,
        scenario,
        // assignedByNodeId / assignedByNodeName can be passed here in
        // Phase 5 when assignments are made from the My Team panel.
        // For now they are null — assigner identity comes from the session.
      }),
    });
    if (!res.ok) throw new Error();
    showToast(`Assigned to ${member.name.split(' ')[0]}'s app ✓`, 'success');
  } catch(e) {
    showToast('Could not assign — server may be offline', 'warning');
  }
}

/* ═══════════════════════════════════════════════════════════
   PHASE 5 — LEADER LAYER
   My Team · Assignments · Team Insights
   All gates are permission-only — no hardcoded role names.
   ═══════════════════════════════════════════════════════════ */

// ── State ──────────────────────────────────────────────────
let _myTeamMembers = [];   // cached from last fetch
let _myTeamSearch  = '';

// ── My Team ────────────────────────────────────────────────
async function renderMyTeam() {
  const el      = document.getElementById('myteam-content');
  const countEl = document.getElementById('myteam-count');
  if (!el) return;

  el.innerHTML = `<div style="padding:1.5rem;text-align:center;color:var(--text-muted)">Loading team…</div>`;

  try {
    const data     = await Auth.loadVisibleMembers();
    _myTeamMembers = data.members || [];
    if (countEl) countEl.textContent = `${_myTeamMembers.length} visible member${_myTeamMembers.length !== 1 ? 's' : ''}`;
    _renderMyTeamList();
  } catch(e) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>Could not load team — try refreshing.</p></div>`;
  }
}

function filterMyTeam(search) {
  _myTeamSearch = (search || '').toLowerCase();
  _renderMyTeamList();
}

function _renderMyTeamList() {
  const el = document.getElementById('myteam-content');
  if (!el) return;

  const MOOD_ICONS = { 1:'😔', 2:'😕', 3:'😐', 4:'🙂', 5:'😄' };
  const filtered   = _myTeamSearch
    ? _myTeamMembers.filter(m =>
        m.name.toLowerCase().includes(_myTeamSearch) ||
        (m.email || '').toLowerCase().includes(_myTeamSearch))
    : _myTeamMembers;

  if (!filtered.length) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">👥</div>
        <p>${_myTeamMembers.length === 0
          ? 'No members visible yet. Ask an administrator to assign people to your area of responsibility.'
          : 'No members match your search.'}</p>
      </div>`;
    return;
  }

  el.innerHTML = `
    <div class="leader-member-list">
      ${filtered.map(m => {
        const initials   = (m.name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        const roleLabel  = Auth.ROLE_LABELS?.[m.role] || m.role || 'Member';
        const moodEmoji  = MOOD_ICONS[m.latestCheckin?.mood] || '—';
        const ckDate     = m.latestCheckin?.date || null;
        const isPending  = !m.passwordSet;
        const needsSetup = !m.profileComplete && !isPending;
        const nodeCount  = (m.nodeIds || []).length;

        return `
          <div class="leader-member-row">
            <div class="lm-avatar">${initials}</div>
            <div class="lm-info">
              <div class="lm-name">
                ${m.name}
                ${isPending  ? `<span class="lm-badge lm-badge--pending">PENDING</span>` : ''}
                ${needsSetup ? `<span class="lm-badge lm-badge--setup">SETUP</span>` : ''}
              </div>
              <div class="lm-meta">${roleLabel}${m.email ? ' · ' + m.email : ''}</div>
              ${nodeCount ? `<div class="lm-nodes">${nodeCount} node${nodeCount !== 1 ? 's' : ''}</div>` : ''}
            </div>
            <div class="lm-checkin">
              <div class="lm-mood" title="${ckDate ? 'Last check-in ' + ckDate : 'No check-in yet'}">${moodEmoji}</div>
              <div class="lm-checkin-date">${ckDate || 'No check-in'}</div>
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

// ── Assignments ────────────────────────────────────────────
async function renderAssignments() {
  const el = document.getElementById('assignments-content');
  if (!el) return;

  // AppState.members is already scoped to visible members for non-admins
  // (Phase 2 — loadRealOrgData uses /visible-members for non-edit_members users)
  const members   = AppState.members || [];
  const scenarios = AppState.scenarios || [];

  if (!members.length) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📌</div>
        <p>No visible members to assign to yet. You'll be able to assign once members are added to your area.</p>
      </div>`;
    return;
  }

  if (!scenarios.length) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🎯</div>
        <p>No assessments created yet.
          <a href="#" onclick="navigate('scenarios');return false" style="color:var(--accent)">
            Go to Assessments</a> to create one first.</p>
      </div>`;
    return;
  }

  const memberOptions = [...members]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(m => `<option value="${m.id}">${m.name}</option>`)
    .join('');

  el.innerHTML = `
    <div style="margin-bottom:1.2rem;font-size:0.82rem;color:var(--text-secondary)">
      Assigning to <strong>${members.length}</strong> visible member${members.length !== 1 ? 's' : ''}.
      Your name is recorded as the assigner on every assignment.
    </div>
    <div class="assignments-list">
      ${scenarios.map(s => `
        <div class="assignment-row card" style="margin-bottom:0.6rem">
          <div class="assignment-scenario-info">
            <div class="assignment-scenario-title">${s.title || 'Untitled'}</div>
            <div class="assignment-scenario-meta">${s.domain || '—'} · ${s.difficulty || '—'}</div>
          </div>
          <div class="assignment-actions">
            <select id="assign-sel-${s.id}" class="form-input assignment-select">
              <option value="">— Select member —</option>
              ${memberOptions}
            </select>
            <button class="btn btn-accent btn-sm" onclick="assignFromLeaderLayer('${s.id}')">Assign →</button>
          </div>
        </div>`).join('')}
    </div>`;
}

async function assignFromLeaderLayer(scenarioId) {
  const scenario = (AppState.scenarios || []).find(s => s.id === scenarioId);
  if (!scenario) return;

  const member  = getSelectedMemberFromSelect(`assign-sel-${scenarioId}`);
  if (!member)  { showToast('Select a member first', 'warning'); return; }

  const orgCode = AppState.orgCode || AppState.orgName.toLowerCase().replace(/\s+/g, '-');

  try {
    const res = await fetch('/api/platform/assign-scenario', {
      method:  'POST',
      headers: Auth._headers(),
      body: JSON.stringify({
        orgCode,
        memberName: member.name,
        memberId:   member.userId || member.authId || null,
        scenario,
        // assignedByNodeId / assignedByNodeName omitted here — identity comes from session
      }),
    });
    if (!res.ok) throw new Error();
    showToast(`Assigned "${scenario.title}" to ${member.name.split(' ')[0]} ✓`, 'success');
    const selEl = document.getElementById(`assign-sel-${scenarioId}`);
    if (selEl) selEl.value = '';  // reset selector after success
  } catch(e) {
    showToast('Could not assign — check your connection', 'warning');
  }
}

// ── Team Insights ──────────────────────────────────────────
async function renderTeamInsights() {
  const el = document.getElementById('teaminsights-content');
  if (!el) return;

  el.innerHTML = `<div style="padding:1.5rem;text-align:center;color:var(--text-muted)">Loading insights…</div>`;

  try {
    const res  = await fetch('/api/workspace/team-insights', { headers: Auth._headers() });
    const data = res.ok ? await res.json() : { ok: false, error: `HTTP ${res.status}` };

    if (!data.ok) throw new Error(data.error || 'Request failed');

    if (data.notEnoughData) {
      el.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📊</div>
          <p>Not enough check-in data yet — ask your team to complete a few check-ins.</p>
          <div style="font-size:0.78rem;color:var(--text-muted);margin-top:0.6rem">
            ${data.visibleCount} visible member${data.visibleCount !== 1 ? 's' : ''}
            · ${data.activeThisWeek} active this week
          </div>
        </div>`;
      return;
    }

    const moodVal   = data.avgMood;
    const moodEmoji = moodVal >= 4 ? '😊' : moodVal >= 3 ? '😐' : '😕';
    const moodLabel = moodVal >= 4 ? 'Good'  : moodVal >= 3 ? 'Okay' : 'Low';
    const moodColor = moodVal >= 4 ? 'var(--success)' : moodVal >= 3 ? 'var(--warning)' : 'var(--danger)';

    el.innerHTML = `
      <div class="grid-3" style="margin-bottom:1.2rem">
        <div class="stat-card">
          <div class="stat-card-val">${data.visibleCount}</div>
          <div class="stat-card-label">Team Members</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-val">${data.activeThisWeek}</div>
          <div class="stat-card-label">Active This Week</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-val" style="color:${moodColor}">${moodEmoji} ${moodVal !== null ? moodVal.toFixed(1) : '—'}</div>
          <div class="stat-card-label">Avg Mood · ${moodLabel}</div>
        </div>
      </div>

      ${(data.needsAttention || []).length ? `
        <div class="card" style="margin-bottom:1rem;border-color:rgba(247,79,122,0.3)">
          <div class="card-header">
            <div class="card-title" style="color:var(--danger)">⚠ Needs Attention (${data.needsAttention.length})</div>
          </div>
          <div class="card-body" style="padding:0.6rem 1rem">
            ${data.needsAttention.map(m => `
              <div class="leader-attn-row">
                <span class="leader-attn-name">${m.name}</span>
                <span class="leader-attn-reason">${m.reason}</span>
              </div>`).join('')}
          </div>
        </div>` : ''}

      ${data.recommendedAction ? `
        <div class="card" style="border-color:rgba(124,90,245,0.3);background:rgba(124,90,245,0.04)">
          <div class="card-header">
            <div class="card-title" style="color:var(--accent)">💡 Recommended Action</div>
          </div>
          <div style="font-size:0.85rem;color:var(--text-primary);padding:0 1rem 1rem;line-height:1.65">
            ${data.recommendedAction}
          </div>
        </div>` : ''}`;

  } catch(e) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>Could not load team insights. Try refreshing.</p></div>`;
  }
}

/* ── LEADER INPUT TAB ────────────────────────────────────── */
let _coachConcern = 'none'; // variable name kept for backward compat; represents concern level

function renderCoachInputTab(memberId) {
  const m = AppState.getMember(memberId);
  if (!m) return '';

  const metrics = (AppState.orgMetrics || []).map(mt => mt.name || mt);

  // Previous leadership inputs
  const prevInputs = (m.coachInputs || []).slice().reverse();
  const prevHTML   = prevInputs.length
    ? prevInputs.map(ci => `
        <div class="coach-log-item">
          <div class="coach-log-meta">
            <span class="coach-log-date">${ci.date}</span>
            <span class="coach-log-author">${ci.author}</span>
          </div>
          ${ci.notes ? `<div class="coach-log-notes">${ci.notes}</div>` : ''}
          ${ci.concern !== 'none' ? `<span class="coach-log-concern concern-${ci.concern}">${ci.concern === 'monitor' ? '⚠ Monitor' : '🔴 Urgent'}</span>` : ''}
          ${Object.keys(ci.scores || {}).length ? `
            <div style="display:flex;gap:0.4rem;flex-wrap:wrap;margin-top:0.5rem">
              ${Object.entries(ci.scores).map(([k,v]) => `
                <span class="score-pill" style="color:${scoreColor(v)};border-color:${scoreColor(v)}40">${k.split(' ')[0]}: ${v}</span>`).join('')}
            </div>` : ''}
        </div>`).join('')
    : `<div style="font-size:0.8rem;color:var(--text-muted);padding:0.5rem 0">No leadership inputs recorded yet.</div>`;

  // External data table
  const extData = (m.externalData || []);
  const extHTML = extData.length
    ? `<table class="ext-data-table">
        <thead><tr><th>Test / Assessment</th><th>Score</th><th>Source</th><th>Date</th></tr></thead>
        <tbody>
          ${extData.slice().reverse().map(d => `
            <tr>
              <td>${d.name}</td>
              <td><span style="color:${scoreColor(d.score)};font-weight:600">${d.score}</span></td>
              <td style="color:var(--text-secondary)">${d.source || '—'}</td>
              <td style="color:var(--text-muted)">${d.date}</td>
            </tr>`).join('')}
        </tbody>
      </table>`
    : `<div style="font-size:0.8rem;color:var(--text-muted);padding:0.5rem 0">No external data added yet.</div>`;

  // Scenario results
  const scenRes = (m.scenarioResults || []);
  const scenHTML = scenRes.length
    ? scenRes.slice().reverse().map(r => {
        const { label, color } = ScenarioEngine.getScoreLabel(r.score);
        return `<div class="scenario-result-row">
          <div style="flex:1">
            <div style="font-weight:600;font-size:0.83rem">${r.scenarioTitle}</div>
            <div style="font-size:0.72rem;color:var(--text-muted)">${r.domain} · ${r.date}</div>
          </div>
          <span style="color:${color};font-weight:700;font-size:0.9rem">${r.score}</span>
          <span class="domain-badge" style="color:${color};border-color:${color}44;background:${color}11">${label}</span>
        </div>`;
      }).join('')
    : `<div style="font-size:0.8rem;color:var(--text-muted);padding:0.5rem 0">No scenarios completed yet. Assign one from the Scenarios page.</div>`;

  return `
    <!-- ─ NEW INPUT ─ -->
    <div style="margin-bottom:1.4rem">
      <div class="section-divider">Add Leadership Input</div>
      <div class="coach-form" style="margin-top:0.8rem">

        <div>
          <label>METRIC SCORE OVERRIDES <span style="font-weight:400;text-transform:none;letter-spacing:0">(leave blank to keep current)</span></label>
          <div class="metric-score-grid" id="coach-metric-grid">
            ${metrics.map(metric => `
              <div class="metric-score-item">
                <label>${metric}</label>
                <input type="number" min="0" max="100" placeholder="${m.scores[metric]}"
                  id="ci-score-${metric.replace(/\s+/g,'_')}"
                  style="width:100%;padding:0.45rem 0.7rem;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-primary);font-size:0.82rem"/>
              </div>`).join('')}
          </div>
        </div>

        <div>
          <label>OBSERVATIONS & NOTES</label>
          <textarea id="ci-notes" placeholder="Record observations, patterns, concerns, or feedback for this individual…"></textarea>
        </div>

        <div>
          <label>CONCERN LEVEL</label>
          <div class="concern-selector">
            <button class="concern-btn active-none" id="concern-none"    onclick="setConcernLevel('none')"   >✓ No Concern</button>
            <button class="concern-btn"             id="concern-monitor" onclick="setConcernLevel('monitor')">⚠ Monitor</button>
            <button class="concern-btn"             id="concern-urgent"  onclick="setConcernLevel('urgent')" >🔴 Urgent</button>
          </div>
        </div>

        <button class="btn btn-accent btn-sm" onclick="submitCoachInput('${memberId}')" style="align-self:flex-start">
          Save Input
        </button>
      </div>
    </div>

    <!-- ─ PREVIOUS INPUTS ─ -->
    <div style="margin-bottom:1.4rem">
      <div class="section-divider">Previous Leadership Inputs</div>
      <div class="coach-input-log" style="margin-top:0.6rem">${prevHTML}</div>
    </div>

    <!-- ─ EXTERNAL DATA ─ -->
    <div style="margin-bottom:1.4rem">
      <div class="section-divider">External Test & Assessment Data</div>
      <div style="margin-top:0.6rem;margin-bottom:0.8rem">${extHTML}</div>
      <details style="margin-top:0.5rem">
        <summary style="font-size:0.8rem;color:var(--accent);cursor:pointer;user-select:none">+ Add External Test / Assessment</summary>
        <div class="coach-form" style="margin-top:0.8rem;padding:0.9rem;background:var(--bg-surface);border-radius:var(--radius-sm);border:1px solid var(--border)">
          <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:0.6rem">
            <div>
              <label>TEST / ASSESSMENT NAME</label>
              <input type="text" id="ext-name" placeholder="e.g. Fitness Test, Match Rating…"/>
            </div>
            <div>
              <label>SCORE (0–100)</label>
              <input type="number" id="ext-score" min="0" max="100" placeholder="0–100"/>
            </div>
            <div>
              <label>DATE</label>
              <input type="date" id="ext-date"/>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.6rem">
            <div>
              <label>SOURCE / EVALUATOR</label>
              <input type="text" id="ext-source" placeholder="e.g. Fitness Coach, Match Analyst…"/>
            </div>
            <div>
              <label>NOTES</label>
              <input type="text" id="ext-notes" placeholder="Optional notes…"/>
            </div>
          </div>
          <button class="btn btn-outline btn-sm" onclick="submitExternalData('${memberId}')" style="align-self:flex-start">Add Data</button>
        </div>
      </details>
    </div>

    <!-- ─ SCENARIO RESULTS ─ -->
    <div>
      <div class="section-divider">Scenario Results</div>
      <div style="margin-top:0.6rem">${scenHTML}</div>
    </div>`;
}

function setConcernLevel(level) {
  _coachConcern = level;
  ['none','monitor','urgent'].forEach(l => {
    const btn = document.getElementById(`concern-${l}`);
    if (!btn) return;
    btn.className = 'concern-btn';
    if (l === level) btn.classList.add(`active-${l}`);
  });
}

function submitCoachInput(memberId) {
  const m = AppState.getMember(memberId);
  if (!m) return;

  const metrics = (AppState.orgMetrics || []).map(mt => mt.name || mt);
  const notes   = (document.getElementById('ci-notes') || {}).value || '';

  // Collect score overrides
  const newScores = {};
  metrics.forEach(metric => {
    const key = metric.replace(/\s+/g, '_');
    const el  = document.getElementById(`ci-score-${key}`);
    if (el && el.value !== '') {
      const val = Math.min(100, Math.max(0, parseInt(el.value)));
      if (!isNaN(val)) {
        newScores[metric] = val;
        m.scores[metric]  = val;  // apply override
      }
    }
  });

  // Recalculate overall if any scores changed
  if (Object.keys(newScores).length) {
    m.overall = Math.round(Object.values(m.scores).reduce((a, b) => a + b, 0) / metrics.length);
  }

  if (!notes && Object.keys(newScores).length === 0 && _coachConcern === 'none') {
    showToast('Please add notes or score overrides before saving.', 'warning');
    return;
  }

  if (!m.coachInputs) m.coachInputs = [];
  m.coachInputs.push({
    date:    new Date().toLocaleDateString('en-GB'),
    author:  AppState.adminName,
    notes,
    concern: _coachConcern,
    scores:  newScores,
  });

  // If urgent concern, raise an alert
  if (_coachConcern === 'urgent') {
    m.alerts = (m.alerts || 0) + 1;
    AppState.alerts.unshift({
      type:   'danger',
      title:  'Urgent Concern',
      detail: `${m.name}: "${notes.slice(0, 80)}${notes.length > 80 ? '…' : ''}"`,
      time:   'Just now',
      unread: true,
      member: m,
    });
    updateAlertBadge();
  } else if (_coachConcern === 'monitor') {
    AppState.alerts.unshift({
      type:   'warning',
      title:  'Monitor Flag',
      detail: `${m.name} flagged for monitoring by ${AppState.adminName}.`,
      time:   'Just now',
      unread: true,
      member: m,
    });
    updateAlertBadge();
  }

  AppState.stats = buildEmptyOrgStats(AppState.members.length);
  _coachConcern  = 'none';
  showToast('Coach input saved successfully', 'success');

  // Re-render the tab
  const el = document.getElementById('pm-coach-content');
  if (el) el.innerHTML = renderCoachInputTab(memberId);
}

function submitExternalData(memberId) {
  const m = AppState.getMember(memberId);
  if (!m) return;

  const name   = (document.getElementById('ext-name')  || {}).value || '';
  const score  = parseInt((document.getElementById('ext-score') || {}).value);
  const date   = (document.getElementById('ext-date')  || {}).value || new Date().toLocaleDateString('en-GB');
  const source = (document.getElementById('ext-source')|| {}).value || '';
  const notes  = (document.getElementById('ext-notes') || {}).value || '';

  if (!name || isNaN(score)) {
    showToast('Please enter a test name and score.', 'warning');
    return;
  }

  if (!m.externalData) m.externalData = [];
  m.externalData.push({
    name,
    score: Math.min(100, Math.max(0, score)),
    date:  date || new Date().toLocaleDateString('en-GB'),
    source,
    notes,
  });

  showToast(`External data added for ${m.name}`, 'success');
  const el = document.getElementById('pm-coach-content');
  if (el) el.innerHTML = renderCoachInputTab(memberId);
}

/* ── GLOBAL ERROR BOUNDARY ───────────────────────────────────────────────── *
 * Catches any unhandled JS error or promise rejection and shows a visible    *
 * error panel instead of leaving a blank/black screen.                       *
 * ─────────────────────────────────────────────────────────────────────────── */
function _showGlobalError(message, err) {
  console.error('[GLOBAL ERROR]', message, err);
  const detail = err?.stack || err?.message || String(err || '');

  // Try to find a visible container to inject into — prefer body
  const target = document.body || document.documentElement;
  const panel  = document.createElement('div');
  panel.id = 'iq-global-error';
  panel.style.cssText = [
    'position:fixed','inset:0','z-index:99999',
    'background:#fff','display:flex','flex-direction:column',
    'align-items:center','justify-content:center',
    'padding:2rem','text-align:center','gap:1rem',
  ].join(';');
  panel.innerHTML = `
    <div style="font-size:2.5rem">⚠️</div>
    <div style="font-weight:700;font-size:1.15rem;color:#111">Something went wrong loading IntelliQ.</div>
    <div style="color:#666;font-size:0.85rem;max-width:340px;line-height:1.5">${message || 'An unexpected error occurred. Please refresh or log out and try again.'}</div>
    <div style="display:flex;gap:0.75rem;flex-wrap:wrap;justify-content:center;margin-top:0.4rem">
      <button onclick="location.reload()"
        style="padding:0.6rem 1.6rem;border-radius:8px;background:#0066ff;color:#fff;border:none;cursor:pointer;font-size:0.9rem;font-weight:600">
        Retry
      </button>
      <button onclick="(()=>{try{Auth.logout();}catch(e){}location.reload();})()"
        style="padding:0.6rem 1.4rem;border-radius:8px;background:#f3f4f6;color:#333;border:none;cursor:pointer;font-size:0.9rem">
        Log out
      </button>
      <button id="iq-err-copy-btn"
        style="padding:0.6rem 1.2rem;border-radius:8px;background:#f3f4f6;color:#555;border:none;cursor:pointer;font-size:0.82rem">
        Copy error details
      </button>
    </div>
    <details style="margin-top:0.5rem;max-width:420px;text-align:left">
      <summary style="font-size:0.75rem;color:#aaa;cursor:pointer">Error details</summary>
      <pre id="iq-err-detail" style="font-size:0.7rem;color:#999;white-space:pre-wrap;margin-top:0.4rem;overflow:auto;max-height:120px">${detail}</pre>
    </details>`;
  target.appendChild(panel);

  // Wire up copy button after appending
  const copyBtn = document.getElementById('iq-err-copy-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const text = document.getElementById('iq-err-detail')?.textContent || detail;
      navigator.clipboard?.writeText(text).then(() => {
        copyBtn.textContent = 'Copied ✓';
        setTimeout(() => { copyBtn.textContent = 'Copy error details'; }, 2000);
      }).catch(() => { copyBtn.textContent = 'Copy failed'; });
    });
  }
}

window.onerror = function(message, source, lineno, colno, error) {
  // Only intercept if we're not already showing an error panel
  if (document.getElementById('iq-global-error')) return false;
  // Don't catch errors from extensions or unrelated scripts
  if (source && !source.includes(location.hostname) && !source.includes('/js/')) return false;
  _showGlobalError('An unexpected error stopped IntelliQ from loading.', error || new Error(message));
  return false; // don't suppress — let DevTools also see it
};

window.addEventListener('unhandledrejection', (event) => {
  if (document.getElementById('iq-global-error')) return;
  const reason = event.reason;
  // Ignore network errors that are expected (e.g. failed fetch for optional data)
  if (reason?.name === 'TypeError' && /fetch|network/i.test(reason?.message || '')) return;
  console.error('[ROUTE] Unhandled promise rejection:', reason);
  // Don't pop the full overlay for every async blip — just log it
  // Only show overlay if the page appears blank (none of the main containers are visible)
  const appVisible  = document.getElementById('app')?.classList.contains('visible');
  const shellVis    = document.getElementById('member-shell')?.style.display === 'flex';
  const loginVis    = document.getElementById('login-screen')?.style.display !== 'none';
  if (!appVisible && !shellVis && !loginVis) {
    _showGlobalError('A network or script error prevented IntelliQ from loading.', reason);
  }
});

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
