/* ============================================================
   PLATFORM — MAIN APPLICATION
   ============================================================ */

/* ONE greeting authority for the client. Thresholds MATCH the behaviour layer
   (ai/behaviour.js: <12 morning · <18 afternoon · else evening) so the page
   greeting and the proactive greeting can never disagree. Every client site that
   needs a time-of-day word calls this — no duplicated greeting logic. */
function iqTimeOfDay(now) {
  const h = new Date(Number.isFinite(now) ? now : Date.now()).getHours();
  return h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
}
function iqGreeting(now) { return 'Good ' + iqTimeOfDay(now); }

/* The ONE mood→word mapping for every leader/admin surface. A leader never sees a
   member's (or the org's) mood as a raw number — only an energy DIRECTION. Keep this
   the single source so no surface can drift back to "2.1/5". */
function iqMoodWord(v) { return v == null ? '—' : v >= 4 ? 'Positive' : v >= 3 ? 'Steady' : 'Low'; }

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
  // Required anchors — a member needs a goal + at least one value for the AI to
  // reason from. Route back to the missing step instead of finishing.
  const a = _ob.answers || {};
  const hasGoal   = String(a.mainGoals || '').trim().length > 0;
  const hasValues = Array.isArray(a.selectedValues) && a.selectedValues.filter(Boolean).length >= 1;
  if (!hasGoal || !hasValues) {
    _ob.step = !hasGoal ? 0 : 4; // mainGoals / selectedValues
    _obRenderStep();
    showToast(!hasGoal ? 'Please set your main goal to continue.' : 'Please choose at least one value to continue.', 'warning');
    return;
  }

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
  // Everyone enters the unified workspace. Members land on Home; others on Dashboard.
  launchApp();
  loadRealOrgData();
  _checkCoachDailyCheckin();
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

  // Required anchors — the AI needs values + at least one goal to reason from.
  const _vals  = (_orgOb.suggestions.values || []).filter(Boolean);
  const _goals = (_orgOb.suggestions.goals  || []).filter(Boolean);
  if (_vals.length < 1 || _goals.length < 1) {
    const e = document.getElementById('org-ob-save-error');
    const msg = _vals.length < 1 ? 'Add at least one core value before finishing.' : 'Add at least one organisation goal before finishing.';
    if (e) { e.style.display = 'block'; e.textContent = msg; } else { showToast(msg, 'warning'); }
    return;
  }

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
/* ═══ CANONICAL NAVIGATION AUTHORITY (Phase-1 Cut G) ══════════════════════════
   ONE router for the whole member/leader/admin experience — desktop and the mobile
   sidebar drawer dispatch through this single function. It normalises + validates the
   destination, resolves legacy aliases to the ONE canonical surface, renders that
   surface (one renderer owner per destination), updates nav/title/active state, and
   CLEARS transient assistant context (member subject + assigned-work target) so no
   stale consequential target ever survives a navigation. Unknown/unavailable/retired
   destinations fail SAFE to Home — never a blank container, never a resurrected Studio
   or Advisor identity. There is no second router: retired assistant surfaces have no
   destinations here, and no alias recreates them. */
const NAV_ALIASES = {
  // Folded surfaces → the one canonical destination (no separate renderer, no duplicate state).
  'org-insights': 'leader-home',
  'group-health': 'leader-home',
  // The legacy "IntelliQ" org-intelligence page composed leader-facing narrative that
  // named individuals with their mood numbers (a per-member leak) and duplicated the
  // privacy-safe briefing. Retired → the briefing is the one intelligence surface.
  'intelliq':     'leader-home',
};
// destination → its ONE renderer (arrow-wrapped so declaration order/TDZ is never an issue).
const NAV_ROUTES = {
  // My Space — every user (the unified assistant + record views)
  home:            () => { if (typeof MemberApp !== 'undefined') MemberApp._renderHome(); },
  assessments:     () => { if (typeof MemberApp !== 'undefined') MemberApp._renderAssessments(); },
  apps:            () => { if (typeof MemberApp !== 'undefined') MemberApp._renderApps(); },
  checkin:         () => { if (typeof MemberApp !== 'undefined') MemberApp._setupCheckinPrompt(); },
  notes:           () => { if (typeof MemberApp !== 'undefined') MemberApp._renderNotesPage(); },
  'my-data':       () => renderMyData(),
  inquiry:         () => { if (typeof MemberApp !== 'undefined') MemberApp._renderInquiryPage(); },
  inbox:           () => { if (typeof MemberApp !== 'undefined') MemberApp._renderInbox(); },
  stats:           () => { if (typeof MemberApp !== 'undefined') MemberApp._renderStats(); },
  // Leader Workspace — scoped to the node leader's subtree
  'leader-home':   () => renderToday(),
  'leader-people': () => renderLeaderPeople(),
  'team-readiness': () => renderTeamReadiness(),
  'operating-context': () => renderOperatingContext(),
  'org-memory': () => renderOrgMemory(),
  'org-learning': () => renderObservations(),
  'org-playbook': () => renderPlaybook(),
  'operate': () => renderOperate(),
  'leader-groups': () => renderLeaderGroups(),
  'data-sources':  () => renderDataSources(),
  assignments:     () => renderAssignments(),
  // Management — org-wide
  'org-health':    () => renderOrgHealth(),
  analytics:       () => renderAnalytics(),
  scenarios:       () => renderScenarios(),
  organisation:    () => renderMyTeam(),
  people:          () => renderPeople(),
  safeguarding:   () => renderSafeguardingQueue(),
  alerts:          () => renderAlerts(),
  reports:         () => renderReports(),
  settings:        () => renderSettings(),
  // Legacy dashboards (still real destinations for admin/super)
  dashboard:       () => renderDashboard(),
  members:         () => renderMembers(),
};
function navigate(dest){
  // 1/2. normalise + resolve alias + validate → fail SAFE to Home (never blank, never a retired identity).
  let page = String(dest == null ? '' : dest).trim();
  page = NAV_ALIASES[page] || page;
  if (!Object.prototype.hasOwnProperty.call(NAV_ROUTES, page)) page = 'home';

  // 3. Context lifecycle — EVERY navigation clears the transient member-support subject and the
  //    assigned-work target, so a general turn can never act on a stale member/work context.
  //    (Explicit entry points — askAboutMember / askAboutWork — navigate first, THEN set context.)
  try { if (typeof MemberApp !== 'undefined') { if (MemberApp.clearSubject) MemberApp.clearSubject(); MemberApp._wsWorkItemId = null; } } catch (_) {}

  // 4. Activate the canonical surface + one-authority nav/title/active state.
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  const pg = document.getElementById('page-'+page);
  if(pg) pg.classList.add('active');
  document.querySelectorAll(`.nav-item[data-page="${page}"]`).forEach(n=>n.classList.add('active'));
  // Close the mobile sidebar drawer on navigation (and clear its outside-click handler).
  document.getElementById('sidebar')?.classList.remove('open');
  if (typeof _detachSidebarClose === 'function') _detachSidebarClose();
  AppState.currentPage = page;
  const _tt = document.querySelector('.topbar-title'); if (_tt) _tt.textContent = PAGE_TITLES[page] || 'Platform';

  // 5. Render (one owner per destination); a renderer failure falls safely back to Home.
  try { NAV_ROUTES[page](); }
  catch (e) { console.warn('[nav] render failed for', page, e && e.message); if (page !== 'home') return navigate('home'); }

  // Hydrate any line-icon slots the page just rendered.
  if (typeof hydrateIcons === 'function') hydrateIcons(pg || document);
}

const PAGE_TITLES = {
  // My Space — every user
  home:         'Home',
  assessments:  'MyWorkspace',
  apps:         'Apps',
  checkin:      'Check-In',
  notes:        'Notes',
  'my-data':    'My data & privacy',
  inquiry:      'Inquiries',
  inbox:        'Updates',
  stats:        'Progress',
  // Leader Workspace — node leader scoped tools
  'leader-home':   'Home',
  'leader-people': 'My People',
  'team-readiness': 'Team readiness',
  'operating-context': 'Operating context',
  'org-memory': 'Organisational memory',
  'org-learning': 'Observed over time',
  'org-playbook': 'Playbook',
  'operate': 'How we operate',
  assignments:     'Assignments',
  'org-insights':  'Intelligence',
  'group-health':  'Intelligence',
  'leader-groups': 'My Groups',
  'data-sources':  'Knowledge',
  // Organisation Health — management level
  'org-health':    'Organisation Health',
  // Intelligence
  analytics:    'Insights',
  scenarios:    'Manage Assessments',
  // Management
  organisation: 'Organisation',
  people:       'Members',
  safeguarding: 'Safeguarding',
  alerts:       'Alerts & Notifications',
  reports:      'Reports & Stat Sheets',
  settings:     'Platform Settings',
  // Kept for backward compatibility
  dashboard:    'Overview Dashboard',
  members:      'Members & Profiles',
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

    // Repair: if the server lost profileComplete (server restart after onboarding),
    // the cached localStorage value may already be true — trust it.
    // If not, check for the durable iq_profile_complete_ flag written by _obSubmitProfile().
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
    // Refresh leadership + permissions from the server before building the nav,
    // so a returning (cached) session picks up the `leads` flag and current
    // permissions. Merge only those fields to avoid clobbering profileComplete.
    (async () => {
      try {
        const meRes = await fetch('/api/auth/me', { headers: Auth._headers() });
        const me    = await meRes.json();
        if (me.ok) {
          Auth.permissions = me.permissions || Auth.permissions;
          if (me.user) Auth.currentUser = {
            ...Auth.currentUser,
            leads:             me.user.leads,
            leadershipNodeIds: me.user.leadershipNodeIds,
            role:              me.user.role,
          };
          if (me.domain) { Auth.domain = me.domain; applyDomainVocab(me.domain); }
          AppState.adminRole = Auth.ROLE_LABELS[Auth.currentUser?.role] || AppState.adminRole;
          Auth.save();
        }
      } catch(e) { /* offline — fall back to cached session */ }
      launchApp();
      loadRealOrgData();
      _checkCoachDailyCheckin();
    })();
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

    // Repair: server lost profileComplete (server restarted after member's onboarding).
    // Check for the durable local flag written by _obSubmitProfile() — it survives logout.
    console.log('[ROUTE] needs onboarding?', _needsOnboarding());
    if (_needsOnboarding()) {
      const _uid = Auth.currentUser?.id;
      if (_uid && localStorage.getItem(`iq_profile_complete_${_uid}`)) {
        console.log('[ROUTE] repairing profileComplete on server (lost on server restart)');
        try {
          const _r = await fetch('/api/auth/complete-profile', {
            method: 'POST', headers: Auth._headers(), body: JSON.stringify({ repair: true }),
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
          Auth.currentUser = { ...Auth.currentUser, profileComplete: true };
          Auth.save();
          console.warn('[ROUTE] server repair failed — set locally:', e.message);
        }
      }
    }
    if (_needsOnboarding()) { showOnboardingFlow(); return; }
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

  // Quick keyword mode detection — conservative, unambiguous terms only.
  // Intentionally avoids generic words (team, coach, player) that appear in many non-sports contexts.
  // The AI analysis from /api/org/describe will refine this after launch.
  let orgMode = 'workplace';
  const descLower = description.toLowerCase();
  if (/\b(soccer|football|basketball|cricket|athletics|rugby|netball|volleyball|tennis|swimming)\b/i.test(descLower)) orgMode = 'sports';
  else if (/\b(school|student|pupil|classroom|teacher|academic|curriculum|grades|tutor)\b/i.test(descLower)) orgMode = 'school';
  else if (/\b(hospital|patient|clinic|nurse|doctor|healthcare|medical|ward|triage|surgery)\b/i.test(descLower)) orgMode = 'healthcare';
  else if (/\b(military|army|navy|air force|regiment|battalion|soldier|squad|platoon)\b/i.test(descLower)) orgMode = 'military';
  else if (/\b(government|ministry|department|policy|public service|civil service)\b/i.test(descLower)) orgMode = 'government';

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
  const tod    = iqTimeOfDay();

  const prompts = {
    superadmin: `Good ${tod}, ${name}. How's the organisation running? Anything at the top of your mind — people, decisions, things you're tracking?`,
    admin:      `Good ${tod}, ${name}. How's the programme going? Any issues or highlights worth flagging?`,
    coach:      `Good ${tod}, ${name}. How's your group? Anyone you're keeping an eye on? Anything you want to record?`,
  };

  document.getElementById('ccc-title').textContent  = `${tod.charAt(0).toUpperCase() + tod.slice(1)} check-in`;
  document.getElementById('ccc-prompt').textContent = prompts[role] || prompts['coach'];

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
      headers: { 'Content-Type': 'application/json', ...Auth._headers() },
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
/* [REMOVED] launchMemberView — deprecated dead shim (no callers); all entry is launchApp(). Cut F sweep. */

/* [REMOVED] _memberErrorHTML — dead (no callers), Phase-1 Cut F sweep. */

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

    // Re-render the currently visible page through the ONE canonical renderer
    // (NAV_ROUTES, alias-resolved). This used to be a SECOND, divergent dispatch —
    // it mapped leader-home to a legacy dashboard (per-member mood icons + "Avg
    // Mood" numbers) and so, after this data load completed, it OVERWROTE the
    // privacy-safe briefing with the old surface. That timing swap was the "two
    // different interfaces for Team". One renderer per destination, always.
    let page = AppState.currentPage;
    page = (typeof NAV_ALIASES !== 'undefined' && NAV_ALIASES[page]) || page;
    if (page && Object.prototype.hasOwnProperty.call(NAV_ROUTES, page)) {
      try { NAV_ROUTES[page](); } catch (e) { console.warn('[reload-render] failed for', page, e && e.message); }
    }
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
          onclick="navigator.clipboard.writeText('${safeLink}').then(()=>showToast('Copied!','success'))">Copy Link</button>
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
  console.log('[ROUTE] launchApp — launching unified workspace');

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

  // D21 — the safeguarding exception is stated BEFORE anyone speaks. Fired here, at the one
  // point every person passes through on the way in, so it cannot be missed by whichever home
  // they land on. Non-blocking to render: the panel shows over the app rather than delaying it.
  showAdvanceNotices();

  try {
    renderSidebar();
    renderTopbar();
    renderAllPages();
    // Routing:
    //   member                → Home (personal)
    //   non-member + isLeaderNode → Leader Dashboard (scoped workspace)
    //   non-member, no leadership  → Overview Dashboard (admin/super)
    const isMember  = Auth.currentUser?.role === 'member';
    const isLeader  = Auth.isLeaderNode();
    if (isMember && typeof MemberApp !== 'undefined') {
      try { MemberApp.init(); } catch(e) { console.warn('[ROUTE] MemberApp.init failed:', e.message); }
    }
    // ONE assistant page for everyone: a member lands on their own "Me" assistant, and
    // leaders + admins/supers land on the leader assistant home (Today). No dashboard
    // landing — the drawer is gone and everything flows from here.
    const defaultPage = isMember ? 'home' : 'leader-home';
    navigate(defaultPage);
    // A quiet proactive cue on the gear — how many governed questions the system wants to
    // put to this reader (leaders/insights only; members get a clean no-op). Fully guarded.
    if (typeof refreshProactiveBadge === 'function') refreshProactiveBadge();
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
  const modeInfo = ORG_MODES[mode] || { label: AppState.orgName || 'Platform', icon: '', color: '#4f8ef7' };
  const color    = modeInfo.color || '#4f8ef7';

  document.querySelector('.sb-logo-text').textContent = 'Platform';
  document.querySelector('.sb-logo-sub').textContent  = AppState.grade + '-Grade · IntelliQ';

  const badge = document.querySelector('.mode-badge');
  if (badge) {
    // Universal product — no industry "mode" label. Show the org, plainly.
    badge.textContent = AppState.orgName || 'Platform';
    badge.style.background = 'transparent';
    badge.style.color      = 'var(--text-secondary)';
    badge.style.border     = '1px solid var(--border)';
  }

  // Topbar line-icons (injected once the app chrome is present). Only the notifications
  // bell remains — the nav-era member search + add-member controls are retired with the
  // drawer (you add people via the account gear → People; you ask the assistant to find one).
  if (typeof ICON !== 'undefined') {
    const set = (sel, svg) => { const el = document.querySelector(sel); if (el && !el.dataset.iconSet) { el.innerHTML = svg; el.dataset.iconSet = '1'; } };
    set('.tb-ic-bell', ICON.bell);
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
  // The sectioned navigation drawer is retired — the app flows from ONE assistant page.
  // Nothing is rendered here; the few non-conversational Setup items now live in the
  // topbar account menu (see renderTopbar → #topbar-account-links). Every old page stays
  // reachable via navigate(); it's just no longer a menu list.
  const nav = document.getElementById('sidebar-nav');
  if (nav) nav.innerHTML = '';

  hydrateIcons();
  updateAlertBadge();
}

/* Fill any <span class="ui-icon-slot" data-icon="key"> with its line icon.
   Lets static/JS-rendered markup request an icon by name without inlining SVG.
   Defensive: never throws — icon glitches must not break navigation. */
function hydrateIcons(root) {
  if (typeof ICON === 'undefined') return;
  try {
    (root || document).querySelectorAll('.ui-icon-slot[data-icon]').forEach(el => {
      if (el.dataset.iconSet) return;
      const svg = ICON[el.dataset.icon];
      if (svg) { el.innerHTML = svg; el.dataset.iconSet = '1'; }
    });
  } catch (_) { /* icon hydration is cosmetic — never block the app */ }
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

  // The ONE quiet gear: the handful of Setup surfaces that can't be conversational live
  // here now (People / Organisation / Settings), permission-gated. Everything else flows
  // from the assistant page. Each link navigates and closes the menu.
  const links = document.getElementById('topbar-account-links');
  if (links) {
    const ic = (name) => (typeof ICON !== 'undefined' && ICON[name]) ? ICON[name] : '';
    const PERSONAL = [
      { id: 'my-data', label: 'My data & privacy', icon: 'person' },
    ];
    const SETUP = [
      { id: 'people',       label: 'People',       perm: 'view_members',    icon: 'person'   },
      { id: 'organisation', label: 'Organisation', perm: 'view_team',       icon: 'building'  },
      { id: 'settings',     label: 'Settings',     perm: 'manage_settings', icon: 'settings' },
    ].filter(l => Auth.canDo(l.perm));
    const ACCOUNT_LINKS = [...PERSONAL, ...SETUP];
    links.innerHTML = ACCOUNT_LINKS.map(l => `<button class="topbar-account-link" data-page="${l.id}"><span class="tal-ic">${ic(l.icon)}</span>${l.label}</button>`).join('');
    links.querySelectorAll('.topbar-account-link[data-page]').forEach(btn => {
      btn.addEventListener('click', () => {
        const menu = document.getElementById('topbar-account-menu');
        if (menu) menu.classList.remove('open');
        navigate(btn.dataset.page);
      });
    });
    _addSafeguardingNav(links, ic);
  }

  // Proactive-updates opt-in — the assistant reaching you off-platform. Everyone controls
  // their own (not permission-gated). Reflects the current subscription state when known.
  const pro = document.getElementById('topbar-account-proactive');
  if (pro) {
    const ic = (name) => (typeof ICON !== 'undefined' && ICON[name]) ? ICON[name] : '';
    const on = !!(IQPush && IQPush._enabled);
    pro.innerHTML = `<button class="iq-proactive-toggle${on ? ' on' : ''}" id="iq-proactive-toggle">
      <span class="tal-ic">${ic('bell')}</span>${on ? 'Proactive updates on' : 'Turn on proactive updates'}</button>`;
    const btn = document.getElementById('iq-proactive-toggle');
    if (btn) btn.addEventListener('click', () => { try { IQPush.enable(); } catch (_) {} });
  }
}

// Safeguarding is a named responsibility, not a general management permission. The server
// remains authoritative; this check only decides whether to show the convenient navigation link.
async function _addSafeguardingNav(links, icon) {
  try {
    const response = await fetch('/api/safeguarding/config', { headers: Auth._headers() });
    const config = response.ok ? await response.json() : null;
    if (!config || config.isLead !== true || !links.isConnected) return;
    // renderTopbar() resets links.innerHTML synchronously but this fetch is async, so two
    // renders in flight together would each append and the lead would see two links.
    if (links.querySelector('.safeguarding-nav-link')) return;
    const button = document.createElement('button');
    button.className = 'topbar-account-link safeguarding-nav-link';
    button.dataset.page = 'safeguarding';
    button.innerHTML = `<span class="tal-ic">${icon('shield')}</span>Safeguarding`;
    button.addEventListener('click', () => {
      document.getElementById('topbar-account-menu')?.classList.remove('open');
      navigate('safeguarding');
    });
    links.appendChild(button);
  } catch (_) { /* navigation convenience fails closed; direct route remains server-authorised */ }
}

/* ── Proactive delivery: the client opt-in ───────────────────────────────────
   Registers a web-push subscription so IntelliQ can reach the person off-platform. Every
   step is guarded: a device without service-worker / push / Notification support, a denied
   permission, or a server without push configured all fail softly — the person is still
   opted in and gets their rundown in-app. Never throws into the app. */
const IQPush = {
  _enabled: false,
  _b64(b64) { const pad = '='.repeat((4 - b64.length % 4) % 4); const s = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/'); const raw = atob(s); return Uint8Array.from([...raw].map(c => c.charCodeAt(0))); },
  async enable() {
    try {
      const cfg = await fetch('/api/delivery/config', { headers: Auth._headers() }).then(r => r.json()).catch(() => null);
      if (!cfg || !cfg.ok) return;
      if (!cfg.outboundAllowed) { if (typeof showToast==='function') showToast('Proactive updates are turned off for this organisation.','info'); return; }
      // Opt in on the server regardless — even without push wired, the in-app rundown stands.
      await fetch('/api/delivery/prefs', { method: 'POST', headers: Auth._headers(), body: JSON.stringify({ enabled: true, channels: { push: true } }) }).catch(() => {});
      const supported = ('serviceWorker' in navigator) && ('PushManager' in window) && (typeof Notification !== 'undefined');
      if (supported && cfg.pushReady && cfg.vapidPublicKey) {
        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
          const reg = await navigator.serviceWorker.ready;
          let sub = await reg.pushManager.getSubscription();
          if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: this._b64(cfg.vapidPublicKey) });
          if (sub) await fetch('/api/delivery/subscribe', { method: 'POST', headers: Auth._headers(), body: JSON.stringify({ subscription: sub.toJSON() }) });
        }
      }
      this._enabled = true;
      if (typeof renderTopbar === 'function') renderTopbar();
      if (typeof showToast==='function') showToast('Proactive updates on — I’ll reach you with your rundown.','success');
    } catch (e) { console.warn('[push] enable failed:', e && e.message); }
  },
};

/* Attention badge on the gear — the count of proactive questions the system wants to put to
   this reader (leaders/insights only; a member gets a clean 403 and no badge). A quiet cue
   that something's waiting, before they open anything. Fully guarded. */
async function refreshProactiveBadge() {
  try {
    const r = await fetch('/api/inquiry/pending?limit=9', { headers: Auth._headers() });
    if (!r.ok) return;                                   // members / no perm → no badge
    const j = await r.json();
    const n = (j && j.count) || 0;
    const dot = document.getElementById('iq-gear-badge');
    if (!dot) return;
    if (n > 0) {
      dot.textContent = n > 9 ? '9+' : String(n);
      dot.style.display = 'flex';
      dot.style.pointerEvents = 'auto';
      dot.style.cursor = 'pointer';
      dot.title = `${n} thing${n === 1 ? '' : 's'} IntelliQ wants to check`;
      dot.onclick = () => navigate('leader-home');   // take me to where the questions are
    } else { dot.style.display = 'none'; }
  } catch (_) { /* cosmetic — never block the app */ }
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

/* ── Sidebar close-handler (retained) ────────────────────────────────────
   The navigation drawer + its hamburger toggle are retired (the app flows from ONE
   assistant page). navigate() still calls _detachSidebarClose() defensively to clear any
   stray outside-click handler; with no drawer to open, _sidebarCloseHandler stays null and
   this is a harmless no-op. Kept as the single owner of that teardown. */
let _sidebarCloseHandler = null;
function _detachSidebarClose() {
  if (_sidebarCloseHandler) { document.removeEventListener('click', _sidebarCloseHandler); _sidebarCloseHandler = null; }
}

/* ── Onboarding empty-state HTML (reused across pages) ───────────────── */
function _emptyStateHTML(_mode) {
  // Generic — no mode-specific terms
  return `
    <div style="text-align:center;padding:3rem 1rem;max-width:480px;margin:0 auto">
      <div style="font-size:2.5rem;margin-bottom:1rem"></div>
      <div style="font-size:1.05rem;font-weight:700;color:var(--text-primary);margin-bottom:0.5rem">No members yet</div>
      <div style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:1.5rem;line-height:1.6">
        Add people to your organisation to start using IntelliQ — manually, by spreadsheet, invite, or join link.
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:0.6rem;justify-content:center">
        <button class="btn btn-accent btn-sm" onclick="navigate('people');setTimeout(()=>switchPeopleTab('onboard'),100)">+ Add Member</button>
        <button class="btn btn-outline btn-sm" onclick="navigate('people');setTimeout(()=>{switchPeopleTab('onboard');_openOnboardSection('import')},100)">Import</button>
        <button class="btn btn-outline btn-sm" onclick="navigate('people');setTimeout(()=>{switchPeopleTab('onboard');_openOnboardSection('invite')},100)">Invite</button>
        <button class="btn btn-outline btn-sm" onclick="navigate('people');setTimeout(()=>{switchPeopleTab('onboard');_openOnboardSection('link')},100)">Join Link</button>
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
        <div style="font-size:2.5rem;margin-bottom:0.75rem"></div>
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
           <button class="btn btn-outline btn-sm" style="margin-top:0.5rem;font-size:0.75rem" onclick="navigate('leader-home')">Open the Team briefing →</button>`
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
      <td><span style="color:${scoreColor(m.iqScore)};font-weight:600">${m.iqScore ?? '—'}</span></td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="flex:1">${progressHTML(m.overall, scoreColor(m.overall))}</div>
          <span style="font-size:0.8rem;font-weight:600;width:28px;text-align:right">${m.overall ?? '—'}</span>
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
        <div style="font-size:2rem;margin-bottom:0.5rem"></div>
        <div style="font-weight:600;margin-bottom:0.3rem">No members yet</div>
        <div style="font-size:0.82rem;color:var(--text-secondary);margin-bottom:1rem">Add people via People → Onboard</div>
        <button class="btn btn-accent btn-sm" onclick="navigate('people');switchPeopleTab('onboard')">+ Add Member</button>
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
    : `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon"></div><p>No members match your search.</p></div>`;
}

function filterMembers(group){
  memberGroup = group;
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
      <td><span style="color:${scoreColor(m.wellnessScore)};font-weight:600">${m.wellnessScore ?? '—'}</span></td>
      <td><span style="color:${scoreColor(m.overall)};font-weight:600">${m.overall ?? '—'}</span></td>
      <td>${m.alerts > 0 ? `<span style="color:var(--danger)">${m.alerts} active</span>` : '—'}</td>
      <td><button class="btn btn-sm btn-accent" onclick="event.stopPropagation();showProfile('${m.id}')">View Profile</button></td>
    </tr>`).join('');
}

/* ── INTELLIQ PAGE ───────────────────────────────────────── */



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
  // A privacy-safe SUPPORT read sits above the detailed timeline: the leader-audience
  // Attention picture (directional, care-first, numberless) — "how to support", the
  // first thing a leader should see. It loads independently of the timeline.
  content.innerHTML = `<div id="leader-support-slot"></div><div id="member-timeline-body"><div style="text-align:center;padding:2rem;color:var(--text-muted)">Building timeline…</div></div>`;
  _renderLeaderSupport(memberId, memberName);

  const orgCode = AppState.orgCode || '';
  try {
    const url = `/api/intelliq/member-timeline?orgCode=${encodeURIComponent(orgCode)}&memberId=${encodeURIComponent(memberId || '')}&memberName=${encodeURIComponent(memberName)}`;
    const res  = await authFetch(url);
    if (!res.ok) throw new Error('Failed');
    const data = await res.json();
    sub.textContent = `${data.timeline?.length || 0} months of activity`;
    _renderMemberTimeline(data, document.getElementById('member-timeline-body') || content);
  } catch(e) {
    const body = document.getElementById('member-timeline-body') || content;
    body.innerHTML = `<div style="color:var(--text-muted);font-size:0.82rem">Could not load timeline — ${e.message}</div>`;
  }
}

/* The leader SUPPORT card — the privacy-safe answer to "how will a leader know?".
   Renders the leader-audience Attention Engine read: directional insights (needs
   attention / worth recognising), care-first, NEVER a private number, quote, or
   dimension. Points the leader toward a good conversation; it does not replace it.
   Fails silent (e.g. 403 / thin data) — the timeline still renders below. */
async function _renderLeaderSupport(memberId, memberName) {
  const slot = document.getElementById('leader-support-slot');
  if (!slot) return;
  if (!memberId) { slot.innerHTML = ''; return; }
  slot.innerHTML = `<div class="ls-card ls-card--loading">Reading the directional picture…</div>`;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  const first = (memberName || '').split(' ')[0] || 'them';
  try {
    const res = await authFetch(`/api/proactive/insights/leader/${encodeURIComponent(memberId)}`);
    if (!res.ok) { slot.innerHTML = ''; return; }              // not authorised / unavailable → hide, show timeline
    const j = await res.json();
    const groups = j.groups || {};
    const section = (key, label) => {
      const g = groups[key];
      if (!g || !(g.insights || []).length) return '';
      return `<div class="ls-section"><div class="ls-section-label">${esc(label)}</div>` +
        g.insights.map(a => `<div class="ls-insight ls-pol-${esc(a.polarity)}">
          <div class="ls-headline">${esc(a.headline)}</div>
          <div class="ls-body">${esc(a.body)}</div>
          ${a.suggestion && a.suggestion.text ? `<div class="ls-approach"><span>Suggested approach</span> ${esc(a.suggestion.text)}</div>` : ''}
        </div>`).join('') + `</div>`;
    };
    const body = section('needs_attention', 'May need you') + section('worth_celebrating', 'Worth recognising');
    slot.innerHTML = `<div class="ls-card">
      <div class="ls-title">How to support ${esc(first)}</div>
      <div class="ls-note">A directional, privacy-safe read. ${esc(first)}’s private details stay private — this is only what you’re authorised to see, and it points you toward a good conversation, it doesn’t replace one.</div>
      ${body || `<div class="ls-empty">Nothing stands out right now — often good news. The timeline below has the fuller picture.</div>`}
    </div>`;
  } catch (_) { slot.innerHTML = ''; }
}

function _renderMemberTimeline(data, el) {
  const { timeline = [] } = data;
  if (!timeline.length) {
    el.innerHTML = `<div style="color:var(--text-muted);font-size:0.82rem;text-align:center;padding:2rem">No activity recorded yet.</div>`;
    return;
  }

  const typeIcon  = { goal_set: '', checkin: '•', weekly_reflection: '', assessment: '', note: '', mood_improving: '↑', mood_declining: '↓', intervention_completed: '' };
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
          ${month.moodAvg   ? `<div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:0.3rem">Energy: ${iqMoodWord(month.moodAvg)}</div>` : ''}
          <div style="font-size:0.75rem;line-height:1.7">
            ${month.events.filter(e => !['checkin'].includes(e.type) || e.data.text).slice(0, 5).map(e => {
              const icon  = typeIcon[e.type]  || '•';
              const color = typeColor[e.type] || 'var(--text-muted)';
              let label = '';
              if (e.type === 'goal_set')              label = `Goal: "${e.data.goal?.slice(0, 60) || ''}"`;
              else if (e.type === 'weekly_reflection') label = `Weekly: "${e.data.text?.slice(0, 80) || ''}"`;
              else if (e.type === 'assessment')        label = `Assessment score: ${e.data.overall ?? '?'}/100`;
              else if (e.type === 'mood_improving')    label = `Mood trending up`;
              else if (e.type === 'mood_declining')    label = `Mood softening`;
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
    container.innerHTML = `<div class="empty-state"><div class="empty-icon"></div><p>No alerts — org looks healthy.</p></div>`;
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
    sectionHTML('IntelliQ Early Warnings', '', proactive) +
    sectionHTML('Manual Flags & Notifications', '', manual);
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

/* ── SAFEGUARDING LEAD QUEUE ────────────────────────────── */
async function renderSafeguardingQueue() {
  const container = document.getElementById('safeguarding-content');
  if (!container) return;
  container.innerHTML = '<div class="empty-state"><p>Loading safeguarding queue…</p></div>';

  try {
    const [flagsResponse, configResponse] = await Promise.all([
      fetch('/api/safeguarding/flags', { headers: Auth._headers() }),
      fetch('/api/safeguarding/config', { headers: Auth._headers() }),
    ]);
    if (flagsResponse.status === 403) {
      container.innerHTML = '<div class="empty-state"><p>This queue is available only to the designated safeguarding lead.</p></div>';
      return;
    }
    if (!flagsResponse.ok || !configResponse.ok) throw new Error('Safeguarding queue unavailable');
    const data = await flagsResponse.json();
    const config = await configResponse.json();
    if (data.isLead !== true || config.isLead !== true) {
      container.innerHTML = '<div class="empty-state"><p>This queue is available only to the designated safeguarding lead.</p></div>';
      return;
    }

    const flags = Array.isArray(data.flags) ? data.flags : [];
    // The API is newest-first. Preserve that order within each status; never compute a risk rank.
    const ordered = flags.filter(flag => flag.status === 'open')
      .concat(flags.filter(flag => flag.status === 'resolved'));
    const resources = Array.isArray(config.resources) ? config.resources : [];
    if (!ordered.length) {
      container.innerHTML = '<div class="empty-state"><p>No safeguarding flags are waiting.</p></div>';
      return;
    }

    container.innerHTML = ordered.map(flag => {
      const open = flag.status === 'open';
      const when = flag.at ? new Date(flag.at).toLocaleString() : 'Time unavailable';
      const resourceList = resources.length
        ? `<ul style="margin:0.45rem 0 0;padding-left:1.2rem">${resources.map(resource => {
          if (typeof resource === 'string') return `<li>${_escHtml(resource)}</li>`;
          const label = resource.label || resource.name || 'Support resource';
          const contact = resource.contact || resource.url || '';
          return `<li>${_escHtml(label)}${contact ? ` — ${_escHtml(contact)}` : ''}</li>`;
        }).join('')}</ul>`
        : '<p style="margin:0.45rem 0 0;color:var(--text-muted)">No organisation resources configured.</p>';
      return `<article class="card safeguarding-flag" data-status="${open ? 'open' : 'resolved'}" style="margin-bottom:1rem">
        <div class="card-body">
          <div style="display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;flex-wrap:wrap">
            <div><strong>${_escHtml(flag.subjectName || flag.subjectId || 'Unknown member')}</strong>
              <div style="font-size:0.75rem;color:var(--text-muted)">${_escHtml(when)}</div></div>
            <div><span class="badge">${_escHtml(flag.severity || 'unspecified')}</span>
              <span class="badge">${_escHtml(flag.category || 'uncategorised')}</span></div>
          </div>
          <blockquote style="margin:1rem 0;padding:0.8rem 1rem;border-left:3px solid var(--accent);background:var(--surface-2);white-space:pre-wrap">${_escHtml(flag.excerpt || '')}</blockquote>
          <div style="font-size:0.78rem;color:var(--text-secondary)"><strong>Support resources</strong>${resourceList}</div>
          ${open ? `<div style="margin-top:1rem"><label style="display:block;font-size:0.78rem;margin-bottom:0.35rem">Resolution note (optional)</label>
            <textarea class="form-input safeguarding-resolution-note" maxlength="500" rows="3" style="width:100%"></textarea>
            <button class="btn btn-accent btn-sm safeguarding-resolve" data-flag-id="${_escHtml(flag.id || '')}" style="margin-top:0.5rem">Resolve</button>
            <div class="safeguarding-resolve-error" role="alert" style="display:none;color:var(--danger);font-size:0.75rem;margin-top:0.4rem"></div></div>`
            : `<div style="margin-top:1rem;font-size:0.78rem;color:var(--text-muted)">Resolved${flag.resolvedAt ? ` ${_escHtml(new Date(flag.resolvedAt).toLocaleString())}` : ''}${flag.resolutionNote ? ` — ${_escHtml(flag.resolutionNote)}` : ''}</div>`}
        </div>
      </article>`;
    }).join('');

    container.querySelectorAll('.safeguarding-resolve').forEach(button => {
      button.addEventListener('click', () => resolveSafeguardingFlag(button));
    });
  } catch (_) {
    container.innerHTML = '<div class="empty-state"><p>The safeguarding queue could not be loaded. Please try again.</p></div>';
  }
}

async function resolveSafeguardingFlag(button) {
  const card = button.closest('.safeguarding-flag');
  const note = card?.querySelector('.safeguarding-resolution-note')?.value || '';
  const error = card?.querySelector('.safeguarding-resolve-error');
  button.disabled = true;
  try {
    const response = await fetch(`/api/safeguarding/flags/${encodeURIComponent(button.dataset.flagId)}/resolve`, {
      method: 'POST', headers: Auth._headers(), body: JSON.stringify({ note }),
    });
    if (!response.ok) throw new Error('Resolution was not saved');
    await renderSafeguardingQueue();
  } catch (e) {
    button.disabled = false;
    if (error) { error.textContent = e.message; error.style.display = 'block'; }
  }
}

/* ── ADVANCE NOTICE (D21) ──────────────────────────────────
   Safeguarding is the one place a person's words cross a boundary without their say-so. Telling
   them at the moment it happens is honest but late — somebody who learns the rule only by
   crossing it learns it as a betrayal rather than as something they already knew.

   It is a NOTICE, not a consent: there is no decline, because the rule applies either way. The
   button says "I understand", never "I agree", and what is recorded is that the person was
   shown it. The text is never hardcoded here — it comes from the server's single home. */
async function showAdvanceNotices() {
  try {
    const response = await fetch('/api/me/notices', { headers: Auth._headers() });
    if (!response.ok) return;
    const pending = ((await response.json()).notices || []).filter(n => n && n.acknowledged === false && n.text);
    if (!pending.length || document.getElementById('advance-notice')) return;

    const panel = document.createElement('div');
    panel.id = 'advance-notice';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.style.cssText = 'position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;padding:1.5rem;background:rgba(0,0,0,0.55)';
    panel.innerHTML = `<div class="card" style="max-width:34rem;width:100%"><div class="card-body">
      <h2 style="margin-top:0">Before you start</h2>
      <p style="color:var(--text-secondary)">What you say to IntelliQ is private. There is one exception, and you should know it now rather than find it out later.</p>
      ${pending.map(n => `<p style="padding:0.9rem 1rem;border-left:3px solid var(--accent);background:var(--surface-2)">${_escHtml(n.text)}</p>`).join('')}
      <button class="btn btn-accent" id="advance-notice-ack" style="margin-top:0.75rem">I understand</button>
      <div id="advance-notice-error" role="alert" style="display:none;color:var(--danger);font-size:0.75rem;margin-top:0.5rem"></div>
    </div></div>`;
    document.body.appendChild(panel);

    document.getElementById('advance-notice-ack')?.addEventListener('click', async (ev) => {
      const button = ev.currentTarget;
      const error = document.getElementById('advance-notice-error');
      button.disabled = true;
      try {
        // Every pending notice is acknowledged before the panel closes. If any POST fails the
        // panel STAYS — a notice recorded as shown when it was not is the one outcome worse
        // than showing it twice.
        for (const n of pending) {
          const r = await fetch('/api/me/notices/ack', {
            method: 'POST', headers: Auth._headers(), body: JSON.stringify({ id: n.id }),
          });
          if (!r.ok) throw new Error('Could not record that you have seen this. Please try again.');
        }
        panel.remove();
      } catch (e) {
        button.disabled = false;
        if (error) { error.textContent = e.message; error.style.display = 'block'; }
      }
    });
  } catch (_) { /* never block the app on this; the in-the-moment message still applies */ }
}

/* ── MY DATA & PRIVACY ─────────────────────────────────────
   A self-scoped reader only. The server chooses the subject from the authenticated session;
   this client supplies no person id and never passes the response through a leader projection. */
/* The safeguarding exception is NOT held here. It has one home — ai/safeguarding.SAFETY_EXCEPTION
   — and reaches this page through GET /api/safeguarding/config. It used to be a second copy of
   the sentence kept equal to the server's only by a test comparing two string literals; a promise
   about somebody's safety should not be maintained by string comparison. If the fetch fails we
   render nothing rather than a remembered version, because a stale safety promise is worse than
   an absent one. */

function _answerabilityRecords(items, emptyText) {
  if (!Array.isArray(items) || !items.length) return `<p style="color:var(--text-muted);margin:0">${_escHtml(emptyText)}</p>`;
  return items.map(item => {
    const detail = JSON.stringify(item, null, 2) || 'No details available';
    return `<pre style="white-space:pre-wrap;overflow-wrap:anywhere;background:var(--surface-2);padding:0.75rem;border-radius:8px;margin:0 0 0.6rem">${_escHtml(detail)}</pre>`;
  }).join('');
}

async function renderMyData() {
  const container = document.getElementById('my-data-content');
  if (!container) return;
  container.innerHTML = '<div class="empty-state"><p>Loading your record…</p></div>';
  try {
    const [dataResponse, audiencesResponse, sgResponse] = await Promise.all([
      fetch('/api/me/data', { headers: Auth._headers() }),
      fetch('/api/me/audiences', { headers: Auth._headers() }),
      fetch('/api/safeguarding/config', { headers: Auth._headers() }),
    ]);
    if (!dataResponse.ok || !audiencesResponse.ok) throw new Error('Your record is unavailable');
    const data = await dataResponse.json();
    const audienceData = await audiencesResponse.json();
    const safetyException = sgResponse.ok ? (await sgResponse.json()).safetyException || '' : '';
    const held = data.held || {};
    const audiences = Array.isArray(audienceData.audiences) ? audienceData.audiences : [];

    const audienceCards = audiences.length ? audiences.map(item => `<div class="card" style="margin-bottom:0.6rem"><div class="card-body">
      <strong>${_escHtml(item.label || item.kind || 'Audience')}</strong>${Number.isFinite(item.reaches) ? `<span class="badge" style="margin-left:0.5rem">${item.reaches} people</span>` : ''}
      <p style="margin:0.4rem 0 0;color:var(--text-secondary)">${_escHtml(item.explanation || '')}</p>
    </div></div>`).join('') : '<p style="color:var(--text-muted)">No wider audiences are available to you.</p>';

    /* WHAT INTELLIQ HAS LEARNED ABOUT HOW YOU WORK — /api/self/patterns, self-only, and until
       now it had no caller at all. This is the "it knows me" surface, and it is the reason a
       person comes back: not that the product can do anything, but that it knows THIS situation.

       Rendered as sentences rather than as the raw ledger. A habit is only ever claimed after it
       has recurred on DISTINCT DAYS (ai/self-model.js `_conf`), so the day count is the evidence
       and it is shown. Every proposal is yours to accept, park or refuse outright — the model of
       you is not something that happens TO you. */
    let selfBlock = '';
    try {
      const sp = await fetch('/api/self/patterns', { headers: Auth._headers() });
      if (sp.ok) {
        const { proposals = [], learned = [] } = await sp.json();
        const live = learned.filter(h => h && h.status !== 'dormant');
        const learnedRows = live.length ? live.map(h => `<div style="padding:0.6rem 0;border-bottom:1px solid var(--border)">
          ${_escHtml(h.label ? `${_selfPatternText(h.pattern)} — ${h.label}` : _selfPatternText(h.pattern))}
          <div style="font-size:0.75rem;color:var(--text-muted)">Seen on ${h.seenOnDays} separate day${h.seenOnDays === 1 ? '' : 's'} · ${_escHtml(h.confidence || 'tentative')}</div>
        </div>`).join('') : '<p style="color:var(--text-muted);margin:0">Nothing yet — I learn this from how you actually use IntelliQ, not from a questionnaire.</p>';
        const proposalRows = proposals.map(p => `<div class="card" style="margin:0.6rem 0"><div class="card-body">
          <p style="margin:0 0 0.6rem">${_escHtml(p.text)}</p>
          <button class="btn btn-accent btn-sm self-habit" data-habit="${_escHtml(p.habitId)}" data-response="accept">Yes, do that</button>
          <button class="btn btn-outline btn-sm self-habit" data-habit="${_escHtml(p.habitId)}" data-response="dismiss">Not now</button>
          <button class="btn btn-outline btn-sm self-habit" data-habit="${_escHtml(p.habitId)}" data-response="reject">That's not me</button>
        </div></div>`).join('');
        selfBlock = `<section class="card" style="margin-bottom:1rem"><div class="card-body">
          <h2 style="margin-top:0">What I've learned about how you work</h2>
          <p style="color:var(--text-secondary)">This is private to you. No leader sees any of it.</p>
          ${learnedRows}
          ${proposalRows ? `<h3>Things I could do for you</h3>${proposalRows}` : ''}
        </div></section>`;
      }
    } catch (_) { /* the record still renders without it */ }

    const trail = Array.isArray(held.accessTrail) ? held.accessTrail : [];
    const trailRows = trail.length ? trail.map(entry => `<div style="padding:0.7rem 0;border-bottom:1px solid var(--border)">
      <strong>${_escHtml(entry.actor || 'System')}</strong> · ${_escHtml(entry.action || 'access')}
      <div style="font-size:0.75rem;color:var(--text-muted)">${_escHtml(entry.at ? new Date(entry.at).toLocaleString() : 'Time unavailable')} · ${_escHtml(entry.basis || 'No basis recorded')}</div>
    </div>`).join('') : '<p style="color:var(--text-muted);margin:0">No access has been recorded yet.</p>';

    container.innerHTML = `<section class="card" style="margin-bottom:1rem"><div class="card-body">
      <h2 style="margin-top:0">What we hold</h2>
      <h3>Reads about me</h3>${_answerabilityRecords(held.reads, 'No reads are currently held about you.')}
      <h3>My notes</h3>${_answerabilityRecords(held.myNotes, 'You have not added any notes.')}
      <button class="btn btn-outline btn-sm" id="download-my-data">Download my data</button>
      <div id="download-my-data-error" role="alert" style="display:none;color:var(--danger);font-size:0.75rem;margin-top:0.4rem"></div>
    </div></section>
    <section class="card" style="margin-bottom:1rem"><div class="card-body">
      <h2 style="margin-top:0">Who has looked</h2>
      <p style="color:var(--text-secondary)">This trail records who accessed your data, when, and why. It does not copy what they saw.</p>
      ${trailRows}
    </div></section>
    <section style="margin-bottom:1rem">
      <div class="card" style="margin-bottom:1rem"><div class="card-body">
        <h2 style="margin-top:0">Who I speak to</h2>
        <p style="color:var(--text-secondary)">${_escHtml(audienceData.note || '')}</p>
        ${safetyException ? `<p style="padding:0.8rem 1rem;border-left:3px solid var(--accent);background:var(--surface-2)">${_escHtml(safetyException)}</p>` : ''}
      </div></div>${audienceCards}
    </section>
    ${selfBlock}`;
    document.getElementById('download-my-data')?.addEventListener('click', downloadMyData);
    container.querySelectorAll('.self-habit').forEach(b => b.addEventListener('click', () => respondToHabit(b)));
  } catch (_) {
    container.innerHTML = '<div class="empty-state"><p>Your data and privacy record could not be loaded. Please try again.</p></div>';
  }
}

/* A learned habit, in a person's own words. The kernel's pattern keys are internal vocabulary
   (D11, generalised) — nobody should read "own_assessment_first" on a screen. An unrecognised
   key returns a neutral sentence rather than the raw key, because the raw key is a leak of
   internal naming and reads as a bug. */
const _SELF_PATTERN_TEXT = {
  opens_view:           'You usually open this first thing',
  own_work_first:       'You tend to clear your own things before the team’s',
  own_assessment_first: 'You do your own assessments before setting other people’s',
  readiness_first:      'You check team readiness before anything else',
};
function _selfPatternText(pattern) { return _SELF_PATTERN_TEXT[pattern] || 'A way of working I have noticed'; }

/* accept applies it · dismiss parks it briefly · reject stands it down for a long time.
   Your model, your call — ai/self-model.js applyFeedback. */
async function respondToHabit(button) {
  const habitId = button.dataset.habit, response = button.dataset.response;
  button.disabled = true;
  try {
    const r = await fetch(`/api/self/${encodeURIComponent(habitId)}/feedback`, {
      method: 'POST', headers: Auth._headers(), body: JSON.stringify({ response }),
    });
    if (!r.ok) throw new Error('not saved');
    await renderMyData();
  } catch (_) { button.disabled = false; }
}

async function downloadMyData() {
  const error = document.getElementById('download-my-data-error');
  try {
    const response = await fetch('/api/me/export', { headers: Auth._headers() });
    if (!response.ok) throw new Error('Your download could not be prepared');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'intelliq-my-data.json';
    document.body.appendChild(link); link.click(); link.remove();
    // Revoked on the next tick, not inline: revoking synchronously after click() races the
    // browser starting the download, and some browsers abandon it. A person exercising a
    // subject access right must not get a silent no-op.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  } catch (e) {
    if (error) { error.textContent = e.message; error.style.display = 'block'; }
  }
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
        <span>${AttachmentHandler.ICONS[_alertAttachment.kind] || ''}</span>
        <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_alertAttachment.name}</span>
        <span style="color:var(--success);font-size:0.72rem">Ready</span>
        <button onclick="_alertAttachment=null;document.getElementById('acm-attachment-preview').innerHTML=''" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:0.9rem"></button>
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
    <div style="font-size:0.72rem;color:var(--success);margin-top:4px">Will be shown to member during scenario</div>`;
}

async function draftAlertScenario() {
  const brief  = (document.getElementById('acm-brief')?.value || '').trim();
  const member = getSelectedMemberFromSelect('acm-member');
  if (!brief)   { showToast('Write a brief first', 'warning'); return; }
  if (!member)  { showToast('Select a member', 'warning'); return; }

  const memberId = member.id;
  const btn = document.getElementById('acm-draft-btn');
  if (btn) { btn.textContent = 'Drafting…'; btn.disabled = true; }

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
    if (btn) { btn.textContent = 'Draft Scenario with AI →'; btn.disabled = false; }
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
      ${metrics.map(k=>`<td><span style="color:${scoreColor(m.scores[k])};font-weight:600">${m.scores[k] ?? '—'}</span></td>`).join('')}
      <td><span style="color:${scoreColor(m.iqScore)};font-weight:600">${m.iqScore ?? '—'}</span></td>
      <td><span style="font-weight:700;color:${scoreColor(m.overall)}">${m.overall ?? '—'}</span></td>
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
        <div style="font-size:1.2rem;margin-bottom:0.5rem"></div>
        Could not load tree. <a href="#" onclick="renderPeople()" style="color:var(--accent)">Try again</a>
      </div>`;
  }
}

/* ── SETTINGS PAGE ───────────────────────────────────────── */
function renderSettings(){
  const mode  = AppState.mode;
  const info  = ORG_MODES[mode] || { label: mode || 'Custom', icon: '' };
  const grade = AppState.grade;

  document.getElementById('settings-org-name').textContent  = AppState.orgName;
  document.getElementById('settings-mode').textContent      = `${info.icon || ''} ${info.label || mode}`.trim();
  document.getElementById('settings-grade').innerHTML       = gradeBadgeHTML(grade);
  document.getElementById('settings-admin').textContent     = AppState.adminName;

  const features = PLATFORM_GRADES[grade]?.features || [];
  document.getElementById('settings-features').innerHTML = features.map(f=>`
    <div style="display:flex;align-items:center;gap:8px;padding:0.5rem 0;border-bottom:1px solid var(--border)">
      <span style="color:var(--success);font-size:0.9rem"></span>
      <span style="font-size:0.85rem">${f}</span>
    </div>`).join('');

  // Load values into textarea
  _loadValuesIntoTextarea();
  if (typeof loadConnections === 'function') loadConnections();
  if (typeof loadOAuthCatalog === 'function') loadOAuthCatalog();
  if (typeof loadDomainCatalog === 'function') loadDomainCatalog();
  if (typeof loadMappings === 'function') loadMappings();
  if (typeof loadPolicies === 'function') loadPolicies();
}

/* The organisational constitution — the rules IntelliQ follows before acting. */
const _POLICY_COLOR = { allow:'#0ecfb0', require_approval:'#f7a84f', escalate:'#4f8ef7', deny:'#f74f4f' };
const _POLICY_LABEL = { allow:'may', require_approval:'needs approval', escalate:'must escalate', deny:'may never' };
async function loadPolicies() {
  const box = document.getElementById('policies-list');
  if (!box) return;
  const esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  try {
    const d = await (await fetch('/api/policies', { headers: Auth._headers() })).json();
    const list = d.policies || [];
    box.innerHTML = list.map(p => {
      const c = _POLICY_COLOR[p.effect] || '#9aa';
      const cond = p.conditions ? Object.entries(p.conditions).map(([k,v]) => `${esc(k)}: ${esc(Array.isArray(v)?v.join('/'):v)}`).join(', ') : '';
      return `<div style="display:flex;align-items:center;gap:0.5rem;padding:0.35rem 0;border-bottom:1px solid var(--border);font-size:0.8rem;${p.enabled===false?'opacity:0.45':''}">
        <span class="pill" style="background:${c}22;color:${c};font-size:0.66rem;padding:1px 7px;border-radius:10px;white-space:nowrap">${esc(_POLICY_LABEL[p.effect]||p.effect)}</span>
        <span style="flex:1;min-width:0"><b>${esc(p.capability)}${p.verb&&p.verb!=='*'?'.'+esc(p.verb):''}</b> <span style="color:var(--text-muted)">${esc(p.stage||'')}${cond?' · '+cond:''}</span>${p.note?`<div style="font-size:0.72rem;color:var(--text-muted)">${esc(p.note)}</div>`:''}</span>
        <button class="btn-ghost btn-sm" style="font-size:0.72rem" onclick="togglePolicy('${p.id}')">${p.enabled===false?'enable':'disable'}</button>
        ${p.builtin?'':`<button class="btn-ghost btn-sm" style="font-size:0.72rem;color:var(--danger)" onclick="deletePolicy('${p.id}')">×</button>`}
      </div>`;
    }).join('') + `
      <details style="margin-top:0.6rem"><summary style="cursor:pointer;font-size:0.82rem;color:var(--accent)">＋ Add a rule</summary>
        <div style="display:flex;flex-direction:column;gap:0.35rem;margin-top:0.5rem">
          <select class="form-input" id="pol-effect"><option value="allow">may (allow)</option><option value="require_approval">needs approval</option><option value="deny">may never (deny)</option><option value="escalate">must escalate</option></select>
          <input class="form-input" id="pol-cap" placeholder="capability — e.g. email, calendar, * ">
          <input class="form-input" id="pol-verb" placeholder="verb — e.g. send, create, * ">
          <input class="form-input" id="pol-note" placeholder="note (optional)">
          <button class="btn btn-accent btn-sm" onclick="addPolicy()">Add rule</button>
        </div>
      </details>`;
  } catch (e) { box.innerHTML = ''; }
}
async function _polAction(url, opts) {
  const status = document.getElementById('policies-status');
  try { const r = await fetch(url, { headers: Auth._headers(), ...opts }); if (!r.ok) throw new Error((await r.json()).error||'failed'); loadPolicies(); }
  catch (e) { if (status) status.innerHTML = `<span style="color:var(--danger)">${String(e.message).replace(/</g,'&lt;')}</span>`; }
}
function togglePolicy(id) { _polAction(`/api/policies/${id}/toggle`, { method: 'POST' }); }
function deletePolicy(id) { if (confirm('Remove this rule?')) _polAction(`/api/policies/${id}`, { method: 'DELETE' }); }
function resetPolicies() { if (confirm('Restore the default constitution? Custom rules will be removed.')) _polAction('/api/policies/reset', { method: 'POST' }); }
function addPolicy() {
  const v = id => (document.getElementById(id)?.value || '').trim();
  _polAction('/api/policies', { method: 'POST', headers: { 'Content-Type': 'application/json', ...Auth._headers() }, body: JSON.stringify({ rule: { effect: v('pol-effect'), capability: v('pol-cap') || '*', verb: v('pol-verb') || '*', stage: 'execute', note: v('pol-note') } }) });
}

/* Data mappings — the interpretation boundary UI. Four focused areas: awaiting
   review, transformation preview, validation/drift, and version history with
   activate / retire / rollback. Practical, not a visual no-code designer. */
const _MAP_BADGE = { proposed:'#f7a84f', draft:'#4f8ef7', approved:'#0ecfb0', active:'#0ecfb0', superseded:'#9aa', retired:'#9aa' };
async function loadMappings() {
  const box = document.getElementById('mappings-list');
  if (!box) return;
  const esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  try {
    const r = await fetch('/api/mappings', { headers: Auth._headers() });
    if (!r.ok) { box.innerHTML = ''; return; }
    const d = await r.json();
    const list = d.mappings || [];
    if (!list.length) { box.innerHTML = `<div style="font-size:0.8rem;color:var(--text-muted)">No connector mappings yet. When you connect a source, IntelliQ proposes one here for your review.</div>`; return; }
    // Group by provider; newest version first.
    const byProv = {};
    list.forEach(m => (byProv[m.provider] = byProv[m.provider] || []).push(m));
    box.innerHTML = Object.entries(byProv).map(([prov, versions]) => {
      versions.sort((a,b) => b.version - a.version);
      const hasSuperseded = versions.some(v => v.status === 'superseded');
      return `<div style="border:1px solid var(--border);border-radius:8px;padding:0.6rem 0.7rem;margin-bottom:0.5rem">
        <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.4rem">
          <strong>${esc(prov)}</strong>
          ${hasSuperseded ? `<button class="btn-ghost" style="margin-left:auto;font-size:0.72rem;color:var(--accent)" onclick="mappingAction('${esc(prov)}','rollback')">Roll back</button>` : ''}
        </div>
        ${versions.map(m => {
          const c = _MAP_BADGE[m.status] || '#9aa';
          const acts = [];
          if (m.status === 'proposed' || m.status === 'draft') { acts.push(`<button class="btn btn-accent btn-sm" onclick="mappingReview('${m.id}')">Review</button>`); acts.push(`<button class="btn btn-outline btn-sm" onclick="mappingAction('${m.id}','approve')">Approve</button>`); acts.push(`<button class="btn-ghost" style="color:var(--danger);font-size:0.74rem" onclick="mappingAction('${m.id}','reject')">Reject</button>`); }
          if (m.status === 'approved') { acts.push(`<button class="btn btn-accent btn-sm" onclick="mappingAction('${m.id}','activate')">Activate</button>`); acts.push(`<button class="btn btn-outline btn-sm" onclick="mappingReview('${m.id}')">Preview</button>`); }
          if (m.status === 'active') { acts.push(`<button class="btn btn-outline btn-sm" onclick="mappingReprocess('${esc(prov)}')">Reprocess held</button>`); acts.push(`<button class="btn-ghost" style="font-size:0.74rem" onclick="mappingAction('${m.id}','retire')">Retire</button>`); }
          return `<div style="display:flex;align-items:center;gap:0.5rem;padding:0.3rem 0;font-size:0.8rem;flex-wrap:wrap">
            <span style="font-family:monospace">v${m.version}</span>
            <span class="pill" style="background:${c}22;color:${c};font-size:0.68rem;padding:1px 7px;border-radius:10px">${esc(m.status)}${m.rejected ? ' · rejected' : ''}</span>
            <span style="color:var(--text-muted);font-size:0.72rem">${(m.fields||[]).length} field${(m.fields||[]).length===1?'':'s'}${m.approvedBy ? ' · approved' : ''}</span>
            <span style="margin-left:auto;display:flex;gap:0.3rem;flex-wrap:wrap">${acts.join('')}</span>
          </div>
          <div id="map-review-${m.id}" style="display:none"></div>`;
        }).join('')}
      </div>`;
    }).join('');
  } catch (e) { box.innerHTML = ''; }
}
/* Transformation preview + validation/drift for one mapping (show before approve). */
async function mappingReview(id) {
  const panel = document.getElementById(`map-review-${id}`);
  if (!panel) return;
  if (panel.style.display === 'block') { panel.style.display = 'none'; return; }
  const esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  panel.style.display = 'block';
  panel.innerHTML = `<div style="color:var(--text-muted);font-size:0.78rem;padding:0.3rem 0">Loading preview…</div>`;
  try {
    const r = await fetch(`/api/mappings/${id}/preview`, { method: 'POST', headers: { 'Content-Type':'application/json', ...Auth._headers() }, body: '{}' });
    const d = await r.json();
    const samples = d.preview?.samples || [];
    const drift = d.drift || {};
    const driftMsg = drift.drifted
      ? `<div style="color:var(--danger);font-size:0.76rem;margin:0.3rem 0">Schema changed: ${[...(drift.missing||[]).map(f=>`field "${esc(f)}" missing`), ...(drift.typeChanged||[]).map(t=>`"${esc(t.field)}" no longer numeric`), ...(drift.identityMissing?['identity field missing']:[])].join('; ')}. Ingestion is paused until re-reviewed.</div>`
      : `<div style="color:var(--success);font-size:0.76rem;margin:0.3rem 0">Schema matches — no drift.</div>`;
    panel.innerHTML = driftMsg + samples.slice(0,3).map(s => `
      <div style="border-top:1px solid var(--border);padding:0.4rem 0;font-size:0.74rem">
        <div style="color:var(--text-muted)">in: <code>${esc(JSON.stringify(s.input)).slice(0,200)}</code></div>
        <div>out: ${(s.output||[]).map(o => `<span class="pill" style="background:rgba(79,142,247,0.14);font-size:0.7rem;padding:1px 6px;border-radius:8px;margin-right:3px">${esc(o.label)} = ${esc(o.value)}${o.unit?(' '+esc(o.unit)):''}</span>`).join('') || '<span style="color:var(--text-muted)">— nothing extracted —</span>'}</div>
      </div>`).join('');
  } catch (e) { panel.innerHTML = `<div style="color:var(--danger);font-size:0.78rem">Couldn't load preview.</div>`; }
}
async function mappingAction(idOrProv, action) {
  const status = document.getElementById('mappings-status');
  if (action === 'reject' && !confirm('Reject this proposal? Held data stays held; nothing is imported.')) return;
  if (status) status.innerHTML = '<span style="color:var(--text-muted)">Working…</span>';
  try {
    const r = await fetch(`/api/mappings/${idOrProv}/${action}`, { method: 'POST', headers: Auth._headers() });
    const d = await r.json();
    if (!r.ok || !d.ok) throw new Error(d.error || 'failed');
    if (status) status.innerHTML = `<span style="color:var(--success)">Done — ${action}.</span>`;
    loadMappings();
  } catch (e) { if (status) status.innerHTML = `<span style="color:var(--danger)">${String(e.message).replace(/</g,'&lt;')}</span>`; }
}
async function mappingReprocess(provider) {
  const status = document.getElementById('mappings-status');
  if (status) status.innerHTML = '<span style="color:var(--text-muted)">Reprocessing held records…</span>';
  try {
    const r = await fetch(`/api/mappings/${provider}/reprocess`, { method: 'POST', headers: Auth._headers() });
    const d = await r.json();
    if (!r.ok || !d.ok) throw new Error(d.error || 'failed');
    if (status) status.innerHTML = `<span style="color:var(--success)">Reprocessed ${d.reprocessed||0} held record(s) → ${d.promoted||0} added.</span>`;
    loadMappings();
  } catch (e) { if (status) status.innerHTML = `<span style="color:var(--danger)">${String(e.message).replace(/</g,'&lt;')}</span>`; }
}

/* Display language (domain pack) — the same kernel, the org's own words. Renders
   the catalog with the current pack highlighted; picking one re-renders the whole
   app in that vocabulary. Admin-only; the server enforces manage_settings. */
async function loadDomainCatalog() {
  const box = document.getElementById('domain-catalog');
  if (!box) return;
  const esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  try {
    const r = await fetch('/api/org/domain', { headers: Auth._headers() });
    if (!r.ok) { box.innerHTML = ''; return; }
    const d = await r.json();
    const currentId = d.current?.id || 'universal';
    box.innerHTML = (d.catalog || []).map(p => {
      const on = p.id === currentId;
      const s = p.sample || {};
      return `<button class="btn ${on ? 'btn-accent' : 'btn-outline'} btn-sm" style="text-align:left;justify-content:flex-start" onclick="setDomain('${p.id}')">
        <span style="font-weight:600">${esc(p.label)}</span>
        <span style="font-size:0.72rem;color:${on ? 'inherit' : 'var(--text-muted)'};margin-left:0.5rem">${esc(s.person)} · ${esc(s.group)} · ${esc(s.event)}</span>
        ${on ? '<span style="margin-left:auto;font-size:0.72rem">current</span>' : ''}
      </button>`;
    }).join('');
  } catch (e) { box.innerHTML = ''; }
}
async function setDomain(pack) {
  const status = document.getElementById('domain-status');
  if (status) status.innerHTML = '<span style="color:var(--text-muted)">Updating…</span>';
  try {
    const r = await fetch('/api/org/domain', { method: 'POST', headers: { 'Content-Type': 'application/json', ...Auth._headers() }, body: JSON.stringify({ pack }) });
    const d = await r.json();
    if (!r.ok || !d.ok) throw new Error(d.error || 'failed');
    Auth.domain = d.current; applyDomainVocab(d.current); Auth.save();
    if (status) status.innerHTML = `<span style="color:var(--success)">Now showing ${d.current.label} language.</span>`;
    loadDomainCatalog();
  } catch (e) { if (status) status.innerHTML = `<span style="color:var(--danger)">${String(e.message).replace(/</g,'&lt;')}</span>`; }
}

/* Connect real apps by login (OAuth) — Strava, Google, Teams, Hudl, Fitbit… */
async function loadOAuthCatalog() {
  const box = document.getElementById('oauth-catalog');
  if (!box) return;
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  try {
    const r = await fetch('/api/oauth/catalog', { headers: Auth._headers() });
    if (!r.ok) { box.innerHTML = ''; return; }
    const d = await r.json();
    const rd = document.getElementById('oauth-redirect');
    if (rd) rd.innerHTML = `Redirect URL to register: <code style="user-select:all">${esc(d.redirectUri)}</code>`;
    box.innerHTML = (d.catalog || []).map(p => `<div style="border:1px solid var(--border);border-radius:8px;padding:0.55rem 0.7rem;margin-bottom:0.4rem">
      <div style="display:flex;align-items:center;gap:0.5rem">
        <div style="flex:1"><strong>${esc(p.label)}</strong> ${p.configured ? '<span class="pill" style="background:rgba(14,207,176,0.15);color:#0ecfb0;font-size:0.68rem">Set up</span>' : `<span style="font-size:0.72rem;color:var(--text-muted)">via ${esc(p.docs)}</span>`}</div>
        ${p.configured
          ? `<button class="btn btn-accent btn-sm" onclick="oauthConnect('${p.key}')">Connect</button>`
          : `<button class="btn btn-outline btn-sm" onclick="document.getElementById('oauth-setup-${p.key}').style.display=document.getElementById('oauth-setup-${p.key}').style.display==='none'?'block':'none'">Set up</button>`}
      </div>
      <div id="oauth-setup-${p.key}" style="display:none;margin-top:0.5rem;display:flex;flex-direction:column;gap:0.35rem">
        <input class="form-input" id="oauth-cid-${p.key}" placeholder="Client ID">
        <input class="form-input" id="oauth-secret-${p.key}" placeholder="Client secret" type="password">
        ${p.custom ? `<input class="form-input" id="oauth-authurl-${p.key}" placeholder="Authorize URL">
          <input class="form-input" id="oauth-tokenurl-${p.key}" placeholder="Token URL">
          <input class="form-input" id="oauth-dataurl-${p.key}" placeholder="Data URL (JSON)">
          <input class="form-input" id="oauth-scope-${p.key}" placeholder="Scopes (space or comma separated)">` : ''}
        <button class="btn btn-accent btn-sm" onclick="oauthSaveApp('${p.key}', ${p.custom})">Save</button>
      </div>
    </div>`).join('');
  } catch (e) { box.innerHTML = ''; }
}
async function oauthSaveApp(provider, custom) {
  const status = document.getElementById('oauth-status');
  const v = id => (document.getElementById(id)?.value || '').trim();
  const body = { provider, clientId: v('oauth-cid-' + provider), clientSecret: v('oauth-secret-' + provider) };
  if (custom) { body.authorizeUrl = v('oauth-authurl-' + provider); body.tokenUrl = v('oauth-tokenurl-' + provider); body.dataUrl = v('oauth-dataurl-' + provider); body.scope = v('oauth-scope-' + provider); }
  if (!body.clientId || !body.clientSecret) { if (status) status.innerHTML = '<span style="color:var(--danger)">Client ID and secret are required.</span>'; return; }
  try {
    const r = await fetch('/api/oauth/app', { method: 'POST', headers: { 'Content-Type': 'application/json', ...Auth._headers() }, body: JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok || !d.ok) throw new Error(d.error || 'failed');
    if (status) status.innerHTML = '<span style="color:var(--success)">Saved — you can connect now.</span>';
    loadOAuthCatalog();
  } catch (e) { if (status) status.innerHTML = `<span style="color:var(--danger)">${String(e.message).replace(/</g, '&lt;')}</span>`; }
}
async function oauthConnect(provider) {
  const status = document.getElementById('oauth-status');
  try {
    const r = await fetch(`/api/oauth/${provider}/start`, { method: 'POST', headers: Auth._headers() });
    const d = await r.json();
    if (!r.ok || !d.authorizeUrl) throw new Error(d.error || 'failed');
    window.open(d.authorizeUrl, '_blank');
    if (status) status.innerHTML = '<span style="color:var(--text-muted)">A login window opened — approve access there, then come back and Sync.</span>';
    setTimeout(() => { if (typeof loadConnections === 'function') loadConnections(); }, 4000);
  } catch (e) { if (status) status.innerHTML = `<span style="color:var(--danger)">${String(e.message).replace(/</g, '&lt;')}</span>`; }
}


/* Connections — connect to anything with a data URL; IntelliQ polls + deciphers it. */
async function loadConnections() {
  const box = document.getElementById('connections-list');
  if (!box) return;
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  try {
    const r = await fetch('/api/connections', { headers: Auth._headers() });
    if (!r.ok) { box.innerHTML = ''; return; }
    const d = await r.json();
    const list = d.connections || [];
    if (!list.length) { box.innerHTML = `<div style="font-size:0.8rem;color:var(--text-muted)">No connections yet.</div>`; return; }
    const ago = t => { if (!t) return 'never'; const s = (Date.now() - new Date(t).getTime())/1000; if (s<60) return 'just now'; if (s<3600) return Math.round(s/60)+'m ago'; if (s<86400) return Math.round(s/3600)+'h ago'; return Math.round(s/86400)+'d ago'; };
    const soon = t => { if (!t) return '—'; const s = (new Date(t).getTime() - Date.now())/1000; if (s<=0) return 'now'; if (s<3600) return 'in '+Math.round(s/60)+'m'; return 'in '+Math.round(s/3600)+'h'; };
    box.innerHTML = list.map(c => {
      const hc = _HEALTH_COLOR[c.health] || '#9aa';
      return `<div style="border:1px solid var(--border);border-radius:8px;padding:0.6rem 0.7rem;margin-bottom:0.5rem">
      <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap">
        <span style="width:8px;height:8px;border-radius:50%;background:${hc};flex:none"></span>
        <strong>${esc(c.name)}</strong>
        <span class="pill" style="background:${hc}22;color:${hc};font-size:0.68rem;padding:1px 7px;border-radius:10px">${esc(c.health || 'unknown')}</span>
        <span style="margin-left:auto;font-size:0.72rem;color:var(--text-muted)">every ${c.scheduleHours}h</span>
      </div>
      <div style="font-size:0.74rem;color:var(--text-secondary);margin-top:3px">${esc(c.healthReason || c.lastStatus || '')}</div>
      <div style="font-size:0.72rem;color:var(--text-muted);margin-top:3px;display:flex;gap:0.9rem;flex-wrap:wrap">
        <span>last ok: <b>${ago(c.lastCompletedSync)}</b></span>
        <span>next: <b>${c.paused ? 'paused' : soon(c.nextAttemptAt) === '—' ? 'scheduled' : soon(c.nextAttemptAt)}</b></span>
        <span>added: <b>${c.lastCount||0}</b></span>
        ${c.failures ? `<span style="color:var(--danger)">failed: <b>${c.failures}</b></span>` : ''}
      </div>
      <div style="display:flex;gap:0.35rem;margin-top:0.5rem;flex-wrap:wrap">
        <button class="btn btn-outline btn-sm" onclick="runConnection('${c.id}')">Sync now</button>
        ${c.paused
          ? `<button class="btn btn-accent btn-sm" onclick="connControl('${c.id}','resume')">Resume</button>`
          : `<button class="btn-ghost btn-sm" style="font-size:0.76rem" onclick="connControl('${c.id}','pause')">Pause</button>`}
        <button class="btn-ghost btn-sm" style="font-size:0.76rem" onclick="connRuns('${c.id}')">History</button>
        ${c.failures ? `<button class="btn-ghost btn-sm" style="font-size:0.76rem;color:var(--danger)" onclick="connReplay('${c.id}')">Replay failed</button>` : ''}
        <button class="btn-ghost btn-sm" title="Reset cursor" style="font-size:0.76rem;color:var(--text-muted)" onclick="connControl('${c.id}','cursor/reset')">Reset cursor</button>
        <button class="btn-ghost" title="Remove" onclick="deleteConnection('${c.id}')" style="color:var(--text-muted);margin-left:auto">×</button>
      </div>
      <div id="conn-runs-${c.id}" style="display:none;margin-top:0.5rem"></div>
    </div>`; }).join('');
  } catch (e) { box.innerHTML = ''; }
}
const _HEALTH_COLOR = { healthy:'#0ecfb0', syncing:'#4f8ef7', degraded:'#f7a84f', action_required:'#f74f4f', paused:'#9aa', disconnected:'#f74f4f' };
async function connControl(id, action) {
  const status = document.getElementById('connections-status');
  try {
    const r = await fetch(`/api/connections/${id}/${action}`, { method: 'POST', headers: Auth._headers() });
    if (!r.ok) throw new Error((await r.json()).error || 'failed');
    if (status) status.innerHTML = `<span style="color:var(--success)">Done — ${action.replace('/',' ')}.</span>`;
    loadConnections();
  } catch (e) { if (status) status.innerHTML = `<span style="color:var(--danger)">${String(e.message).replace(/</g,'&lt;')}</span>`; }
}
async function connRuns(id) {
  const panel = document.getElementById(`conn-runs-${id}`);
  if (!panel) return;
  if (panel.style.display === 'block') { panel.style.display = 'none'; return; }
  panel.style.display = 'block';
  const esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  panel.innerHTML = `<div style="color:var(--text-muted);font-size:0.76rem">Loading run history…</div>`;
  try {
    const d = await (await fetch(`/api/connections/${id}/runs`, { headers: Auth._headers() })).json();
    const runs = d.runs || [];
    if (!runs.length) { panel.innerHTML = `<div style="color:var(--text-muted);font-size:0.76rem">No runs yet.</div>`; return; }
    panel.innerHTML = runs.slice(0, 8).map(r => {
      const m = r.metrics || {};
      const c = r.status === 'completed' ? '#0ecfb0' : r.status === 'failed' ? '#f74f4f' : r.status === 'paused' ? '#f7a84f' : '#9aa';
      return `<div style="border-top:1px solid var(--border);padding:0.35rem 0;font-size:0.73rem;display:flex;gap:0.6rem;flex-wrap:wrap">
        <span class="pill" style="background:${c}22;color:${c};padding:0 6px;border-radius:8px">${esc(r.status)}</span>
        <span style="color:var(--text-muted)">${esc(r.trigger)}</span>
        <span>fetched ${m.fetched||0} · promoted ${m.promoted||0} · held ${m.held||0} · dup ${m.duplicates||0}${m.deletions?` · del ${m.deletions}`:''}</span>
        ${r.error ? `<span style="color:var(--danger)">${esc(r.error)}</span>` : ''}
        <span style="margin-left:auto;color:var(--text-muted)">${r.latencyMs!=null?r.latencyMs+'ms':''}</span>
      </div>`;
    }).join('');
  } catch (e) { panel.innerHTML = `<div style="color:var(--danger);font-size:0.76rem">Couldn't load runs.</div>`; }
}
async function connReplay(id) {
  const status = document.getElementById('connections-status');
  if (status) status.innerHTML = '<span style="color:var(--text-muted)">Replaying failed records…</span>';
  try {
    const d = await (await fetch(`/api/connections/${id}/failures/retry`, { method: 'POST', headers: Auth._headers() })).json();
    if (status) status.innerHTML = `<span style="color:var(--success)">Replayed ${d.replayed||0} of ${d.attempted||0} failed record(s).</span>`;
    loadConnections();
  } catch (e) { if (status) status.innerHTML = '<span style="color:var(--danger)">Replay failed.</span>'; }
}
async function addConnection() {
  const btn = document.getElementById('conn-add-btn');
  const status = document.getElementById('connections-status');
  const name = (document.getElementById('conn-name')?.value || '').trim();
  const url = (document.getElementById('conn-url')?.value || '').trim();
  const auth = (document.getElementById('conn-auth')?.value || '').trim();
  const scheduleHours = Number(document.getElementById('conn-hours')?.value) || 24;
  const jsonPath = (document.getElementById('conn-path')?.value || '').trim();
  if (!url) { if (status) status.innerHTML = '<span style="color:var(--danger)">A data URL is required.</span>'; return; }
  const headers = auth ? { Authorization: auth } : {};
  if (btn) { btn.disabled = true; btn.textContent = 'Adding…'; }
  try {
    const r = await fetch('/api/connections', { method: 'POST', headers: { 'Content-Type': 'application/json', ...Auth._headers() }, body: JSON.stringify({ name, url, headers, scheduleHours, source: name, jsonPath: jsonPath || undefined }) });
    const d = await r.json();
    if (!r.ok || !d.ok) throw new Error(d.error || 'failed');
    ['conn-name', 'conn-url', 'conn-auth', 'conn-path'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    if (status) status.innerHTML = '<span style="color:var(--success)">Added — syncing now…</span>';
    await loadConnections();
    await runConnection(d.connection.id);
  } catch (e) {
    if (status) status.innerHTML = `<span style="color:var(--danger)">${String(e.message).replace(/</g, '&lt;')}</span>`;
  } finally { if (btn) { btn.disabled = false; btn.textContent = 'Add & test'; } }
}
async function runConnection(id) {
  const status = document.getElementById('connections-status');
  if (status) status.innerHTML = '<span style="color:var(--text-muted)">Syncing…</span>';
  try {
    const r = await fetch(`/api/connections/${id}/run`, { method: 'POST', headers: Auth._headers() });
    const d = await r.json();
    if (status) status.innerHTML = d.connection ? `<span style="color:${d.ok ? 'var(--success)' : 'var(--danger)'}">${String(d.connection.lastStatus).replace(/</g, '&lt;')}</span>` : '';
    loadConnections();
  } catch (e) { if (status) status.innerHTML = '<span style="color:var(--danger)">Could not sync.</span>'; }
}
async function deleteConnection(id) {
  if (!confirm('Remove this connection?')) return;
  try { await fetch(`/api/connections/${id}`, { method: 'DELETE', headers: Auth._headers() }); loadConnections(); } catch (e) {}
}

/* Run the LLM self-test (admin) — proves the model is connected and shows how it
   reasons on demo-style prompts. Renders provider/model status + each output. */
/* Universal ingest — show the org's connection details so any app can send data.
   Renders the endpoint, token, and a copy-paste example. Generate/rotate on demand. */
async function loadIngestToken(regen) {
  const box = document.getElementById('ingest-token-box');
  const btn = document.getElementById('ingest-token-btn');
  if (!box) return;
  if (btn) { btn.disabled = true; btn.textContent = 'Loading…'; }
  try {
    const res = await fetch('/api/org/ingest-token', {
      method: regen ? 'POST' : 'GET', headers: Auth._headers(),
    });
    const d = await res.json();
    if (!res.ok) throw new Error();
    const esc = _escAdvisor;
    const base = location.origin;
    if (!d.token) {
      box.innerHTML = `<div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:0.6rem">No token yet — generate one to start connecting apps.</div>
        <button class="btn btn-accent btn-sm" onclick="loadIngestToken(true)">Generate token</button>`;
    } else {
      const example = `curl -X POST ${base}/api/ingest \\
  -H "Authorization: Bearer ${d.token}" \\
  -H "Content-Type: application/json" \\
  -d '{"records":[{"email":"person@org.com","label":"Soreness","value":7,"date":"2026-07-20"}]}'`;
      box.innerHTML = `
        <div style="font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px">Endpoint</div>
        <div style="font-family:monospace;font-size:0.8rem;margin-bottom:0.5rem;word-break:break-all">${esc(base)}/api/ingest</div>
        <div style="font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px">Token (keep secret)</div>
        <div style="font-family:monospace;font-size:0.78rem;margin-bottom:0.5rem;word-break:break-all;background:rgba(127,127,127,0.08);padding:0.4rem 0.5rem;border-radius:6px">${esc(d.token)}</div>
        <div style="font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px">Example</div>
        <pre style="font-size:0.72rem;white-space:pre-wrap;word-break:break-all;background:rgba(127,127,127,0.08);padding:0.5rem;border-radius:6px;margin:0.3rem 0 0.6rem">${esc(example)}</pre>
        <div style="font-size:0.74rem;color:var(--text-muted);margin-bottom:0.5rem">Send numbers keyed to a member's email (or name). Records are matched to your people; anything non-numeric is ignored — numbers only.</div>
        <button class="btn btn-outline btn-sm" onclick="loadIngestToken(true)">Regenerate token</button>`;
    }
    if (btn) btn.style.display = 'none';
  } catch (e) {
    box.innerHTML = `<div style="color:var(--danger);font-size:0.82rem">Couldn't load connection details.</div>`;
    if (btn) { btn.disabled = false; btn.textContent = 'Show connection details'; }
  }
}

async function runLlmSelfTest() {
  const btn = document.getElementById('llm-selftest-btn');
  const out = document.getElementById('llm-selftest-result');
  if (!out) return;
  if (btn) { btn.disabled = true; btn.textContent = 'Testing…'; }
  out.innerHTML = `<div style="color:var(--text-muted)">Running…</div>`;
  const esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  try {
    const r = await fetch('/api/admin/llm-selftest', { method: 'POST', headers: Auth._headers() });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'failed');
    const s = d.status || {};
    const prov = [s.providers?.claude ? 'Claude' : null, s.providers?.openai ? 'OpenAI' : null].filter(Boolean).join(' + ') || 'none';
    let html = `<div style="padding:0.5rem 0.7rem;border:1px solid var(--border);border-radius:8px;margin-bottom:0.6rem">
      <div><strong>Status:</strong> ${s.enabled ? '<span style="color:var(--success)">connected</span>' : '<span style="color:var(--danger)">no key</span>'}</div>
      <div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px">Providers: ${esc(prov)} · reason: ${esc(s.models?.reason || '—')} · micro: ${esc(s.models?.micro || '—')}</div>
    </div>`;
    if (d.note) html += `<div style="color:var(--text-secondary)">${esc(d.note)}</div>`;
    (d.results || []).forEach(res => {
      html += `<div style="padding:0.6rem 0.7rem;border:1px solid var(--border);border-radius:8px;margin-bottom:0.5rem">
        <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted)">${esc(res.label)} · ${esc(res.model)} · ${res.ms}ms</div>
        <div style="margin-top:0.4rem;line-height:1.5;color:${res.ok ? 'var(--text-primary)' : 'var(--danger)'}">${esc(res.ok ? res.output : res.error)}</div>
      </div>`;
    });
    out.innerHTML = html;
  } catch (e) {
    out.innerHTML = `<div style="color:var(--danger)">Self-test failed: ${esc(e.message)}</div>`;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Run LLM self-test'; }
  }
}

/* Install the full-scale demo club (admin) — a reliable in-app path that doesn't
   depend on env vars or a redeploy. Creates its own org; sign in with the details
   it returns. */
async function seedDemoClub() {
  const btn = document.getElementById('seed-club-btn');
  const out = document.getElementById('seed-club-result');
  if (!out) return;
  const esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  if (btn) { btn.disabled = true; btn.textContent = 'Building the club…'; }
  out.innerHTML = `<div style="color:var(--text-muted)">Generating ~226 people and a year of data — this takes a few seconds…</div>`;
  try {
    const r = await fetch('/api/admin/seed-demo-club', { method: 'POST', headers: Auth._headers() });
    const d = await r.json();
    if (!r.ok || !d.ok) throw new Error(d.error || 'failed');
    const s = d.summary || {};
    const lg = s.login || {};
    out.innerHTML = `<div style="padding:0.6rem 0.7rem;border:1px solid var(--success);border-radius:8px;background:rgba(14,207,176,0.06)">
      <div style="color:var(--success);font-weight:600;margin-bottom:0.4rem">Loaded ${esc(s.orgName || 'the demo club')} — ${s.users || ''} people, ${s.checkins || ''} check-ins.</div>
      <div style="font-size:0.82rem;line-height:1.7">Sign out, then log in (password <strong>${esc(lg.password || 'demo1234')}</strong>):<br>
        Director — <strong>${esc(lg.director || 'director@trafford.fc')}</strong><br>
        Coach — <strong>${esc(lg.firstTeamCoach || 'coach@trafford.fc')}</strong><br>
        Player — <strong>${esc(lg.samplePlayer || 'player@trafford.fc')}</strong>
      </div>
    </div>`;
  } catch (e) {
    out.innerHTML = `<div style="color:var(--danger)">Could not load the demo club: ${esc(e.message)}</div>`;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Load demo club'; }
  }
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
          <div style="font-size:1.5rem;margin-bottom:0.4rem"></div>
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
          <button onclick="deleteMetric('${m.metricId}')" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:0.85rem;padding:2px 4px" title="Delete"></button>` : ''}
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
    showToast(`"${name}" added `, 'success');
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
  formEl.innerHTML = `<div style="padding:1rem;color:var(--text-muted);font-size:0.82rem">Asking IntelliQ to suggest metrics…</div>`;
  try {
    const res  = await fetch('/api/metrics/suggest', { method: 'POST', headers: Auth._headers(), body: JSON.stringify({}) });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    const suggestions = data.suggestions || [];
    formEl.innerHTML = `
      <div class="card">
        <div class="card-header"><div class="card-title">AI Metric Suggestions</div></div>
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
  showToast(`${added} metric${added!==1?'s':''} added `, 'success');
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
    if (status) { status.textContent = `Saved ${data.values.length} values `; status.style.color = 'var(--success)'; }
    showToast('Values saved ', 'success');
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
        ${Auth.canDo('manage_goals') ? `<button onclick="deleteGoal('${g.goalId}')" style="background:none;border:none;cursor:pointer;color:var(--text-muted)"></button>` : ''}
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
    showToast('Goal added ', 'success');
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
      ${_onboardCard('add',    '', 'Add Member',         'Add one person with their email',   color)}
      ${_onboardCard('import', '', 'Import Spreadsheet', 'Upload a CSV or XLSX file',         color)}
      ${_onboardCard('invite', '',  'Invite by Email',    'Send personalised email invites',   color)}
      ${_onboardCard('link',   '', 'Generate Join Link', 'Shareable self-registration link',  color)}
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
        <div class="card-header"><div class="card-title">Add Member</div></div>
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
        <div class="card-header"><div class="card-title">Import Spreadsheet</div></div>
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
        <div class="card-header"><div class="card-title">Invite by Email</div></div>
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
        <div class="card-header"><div class="card-title">Generate Join Link</div></div>
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
        const treeRes = await fetch(`/api/tree/node/${nodeId}`, {
          method: 'PUT', headers: Auth._headers(),
          body: JSON.stringify({ memberIds: [...currentIds, data.user.id], ifRev: OrgTree._nodes[nodeId].rev }),
        });
        const treeData = await treeRes.json();
        if (!treeData.ok) throw new Error(treeData.error || 'The organisation tree changed. Reload and try again.');
        OrgTree._nodes[nodeId] = treeData.node;
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
      <div style="color:var(--success);margin-bottom:0.4rem">Account created for ${fullName}.</div>
      ${inviteLink
        ? `<div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:0.3rem">Share this link so they can set their password:</div>
           <div style="font-family:monospace;font-size:0.72rem;color:var(--accent);word-break:break-all;margin-bottom:0.3rem">${inviteLink}</div>
           <button onclick="navigator.clipboard.writeText('${safeLink}').then(()=>showToast('Link copied!','success'))" class="btn btn-outline btn-sm" style="padding:2px 8px;font-size:0.72rem">Copy Invite Link</button>`
        : `<div style="font-size:0.78rem;color:var(--text-muted)">They can log in with their email once a password is set.</div>`
      }`;
    _addMemberToAppState({ ...data.user });
    // Clear fields
    ['ob-add-first','ob-add-last','ob-add-email'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    _renderOnboardRecent();
    showToast(`${fullName} added `, 'success');
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
    if (resEl) resEl.innerHTML = `<span style="color:var(--success)">${data.created.length} imported${data.skipped.length ? `, ${data.skipped.length} skipped (already exist)` : ''}.</span>`;
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
           Email delivery is not yet active. Share these links directly with each person.
         </div>` +
        results.map(r => {
          const safeUrl = r.url.replace(/'/g, "\\'");
          return `<div style="margin-bottom:0.5rem;padding:0.5rem 0.7rem;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;font-size:0.78rem">
            <div style="font-weight:600;margin-bottom:0.2rem">Invite created for <span style="color:var(--accent)">${r.email}</span></div>
            <div style="font-family:monospace;font-size:0.72rem;color:var(--text-secondary);word-break:break-all;margin-bottom:0.3rem">${r.url}</div>
            <button onclick="navigator.clipboard.writeText('${safeUrl}').then(()=>showToast('Link copied!','success'))" class="btn btn-outline btn-sm" style="padding:2px 8px;font-size:0.72rem">Copy Link</button>
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
        <div style="font-weight:700;color:var(--text-primary);margin-bottom:0.3rem">${label || 'Join Link'} created</div>
        <div style="font-family:monospace;color:var(--accent);word-break:break-all;margin-bottom:0.4rem">${fullUrl}</div>
        <button onclick="navigator.clipboard.writeText('${fullUrl}').then(()=>showToast('Link copied!','success'))" class="btn btn-outline btn-sm">Copy Link</button>
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
            <button onclick="navigator.clipboard.writeText('${fullUrl}').then(()=>showToast('Copied','success'))" class="btn btn-outline btn-sm" style="padding:2px 8px">Copy</button>
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
          <div style="font-size:2rem;margin-bottom:0.6rem"></div>
          <div style="font-size:0.9rem;font-weight:600;margin-bottom:0.3rem">No groups yet</div>
          <div style="font-size:0.82rem;color:var(--text-secondary)">Create sub-groups within your org. People can be in multiple groups.</div>
        </div>`;
      return;
    }

    // Get all org users for display
    const treeRes  = await fetch(`/api/auth/org-tree?orgCode=${encodeURIComponent(orgCode)}`, { headers: Auth._headers() });
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
              <button class="btn btn-sm" style="color:var(--danger);border-color:rgba(247,79,79,0.3);background:none" onclick="deleteGroup('${g.id}')"></button>
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
  const treeRes  = await fetch(`/api/auth/org-tree?orgCode=${encodeURIComponent(orgCode)}`, { headers: Auth._headers() }).catch(() => null);
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
      method: 'POST', headers: { 'Content-Type': 'application/json', ...Auth._headers() },
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
    method: 'DELETE', headers: { 'Content-Type': 'application/json', ...Auth._headers() },
    body: JSON.stringify({ orgCode }),
  });
  showToast('Group removed', 'success');
  renderGroups();
}

async function openGroupDetail(gid) {
  _currentGroupId = gid;
  const group = (typeof _platformGroups !== 'undefined' && _platformGroups.find(g => g.id === gid))
    || (_leaderGroups?.led || []).find(g => g.id === gid)
    || (_leaderGroups?.member || []).find(g => g.id === gid);
  document.getElementById('gd-title').textContent = group?.name || 'Group';
  document.getElementById('gd-sub').textContent   = `${group?.memberIds?.length || 0} members · shared notes & messages`;
  document.getElementById('gd-compose').value     = '';

  // Copilot: lead-only panel. Banner shows to everyone only when ACTIVE.
  const meId   = Auth.currentUser?.id;
  _gdIsLead    = (group?.leadIds || []).includes(meId) || Auth.isAdmin();
  _gdCopilotOn = !!group?.copilotEnabled;
  const banner = document.getElementById('gd-copilot-banner');
  const panel  = document.getElementById('gd-copilot');
  const body   = document.getElementById('gd-copilot-body');
  if (banner) banner.style.display = _gdCopilotOn ? 'flex' : 'none';
  if (panel)  panel.style.display  = _gdIsLead ? 'block' : 'none';
  if (body)   body.innerHTML = '';
  if (_gdIsLead) _renderCopilotControls();

  openModal('group-detail-modal');
  await loadGroupFeed(gid);
}

let _gdIsLead = false, _gdCopilotOn = false;

function _renderCopilotControls() {
  const actions = document.getElementById('gd-copilot-actions');
  const body    = document.getElementById('gd-copilot-body');
  if (!actions) return;
  actions.innerHTML = _gdCopilotOn
    ? `<button class="btn btn-accent btn-sm" id="gd-copilot-btn" onclick="runGroupCopilot()">Get a read</button>
       <button class="btn btn-outline btn-sm" onclick="toggleGroupCopilot(false)">Turn off</button>`
    : `<button class="btn btn-accent btn-sm" onclick="toggleGroupCopilot(true)">Enable Copilot</button>`;
  if (body && !_gdCopilotOn) {
    body.innerHTML = `<div class="gd-copilot-tip">Group Copilot is off. When enabled, it helps you understand engagement and progress toward this group's goals — using activity signals, never reading out private messages. Members see a clear "Copilot is active" notice.</div>`;
  }
}

async function toggleGroupCopilot(enabled) {
  try {
    const res = await fetch(`/api/groups/${encodeURIComponent(_currentGroupId)}/copilot-settings`, {
      method: 'PUT', headers: Auth._headers(),
      body: JSON.stringify({ orgCode: AppState.orgCode, enabled }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Could not update');
    _gdCopilotOn = !!data.copilotEnabled;
    const banner = document.getElementById('gd-copilot-banner');
    if (banner) banner.style.display = _gdCopilotOn ? 'flex' : 'none';
    _renderCopilotControls();
    if (_gdCopilotOn) runGroupCopilot();
    showToast(_gdCopilotOn ? 'Group Copilot enabled' : 'Group Copilot turned off', 'success');
  } catch (err) { showToast(err.message, 'warning'); }
}

function _healthDot(color) {
  const c = color === 'green' ? 'var(--success)' : color === 'yellow' ? 'var(--warning)' : 'var(--danger)';
  return `<span class="gd-health-dot" style="background:${c}"></span>`;
}

async function runGroupCopilot() {
  const btn  = document.getElementById('gd-copilot-btn');
  const body = document.getElementById('gd-copilot-body');
  if (!_currentGroupId || !body) return;
  const old = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Reading…'; }
  body.innerHTML = `<div class="gd-copilot-loading">Reading the group's signals…</div>`;
  try {
    const res  = await fetch(`/api/groups/${encodeURIComponent(_currentGroupId)}/copilot`, { headers: Auth._headers() });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Copilot unavailable');
    if (!data.enabled) { _gdCopilotOn = false; _renderCopilotControls(); return; }

    const actions = (data.actions || []).map(a => `<li>${_escAdvisor(a)}</li>`).join('');
    const prompts = (data.prompts || []).map(p => `<li>${_escAdvisor(p)}</li>`).join('');
    body.innerHTML = `
      ${!data.hasGoals ? `<div class="gd-copilot-tip">Set this group's goals in Leader Workspace → My Groups for sharper guidance.</div>` : ''}
      <div class="gd-health-grid">
        <div class="gd-health-cell"><div class="gd-health-k">Health</div><div class="gd-health-v">${_healthDot(data.healthColor)}${_escAdvisor(data.health)}</div></div>
        <div class="gd-health-cell"><div class="gd-health-k">Participation</div><div class="gd-health-v">${data.participation}%</div></div>
        <div class="gd-health-cell"><div class="gd-health-k">Goal Progress</div><div class="gd-health-v">${_escAdvisor(data.goalProgress)}</div></div>
        <div class="gd-health-cell"><div class="gd-health-k">Engagement</div><div class="gd-health-v">${_escAdvisor(data.engagementTrend)}</div></div>
      </div>
      ${actions ? `<div class="gd-copilot-sec"><div class="gd-copilot-sec-h">Suggested actions</div><ul>${actions}</ul></div>` : ''}
      ${prompts ? `<div class="gd-copilot-sec"><div class="gd-copilot-sec-h">Discussion prompts</div><ul>${prompts}</ul></div>` : ''}
      ${data.reflection ? `<div class="gd-copilot-sec"><div class="gd-copilot-sec-h">Weekly reflection</div><div class="gd-copilot-summary">${_escAdvisor(data.reflection).replace(/\n/g,'<br>')}</div></div>` : ''}
      <div class="gd-copilot-foot">Based on participation &amp; activity signals toward this group's goals. Individual members are never named or quoted.</div>`;
  } catch (err) {
    body.innerHTML = `<div class="gd-copilot-err">${_escAdvisor(err.message || 'Something went wrong.')}</div>`;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = old; }
  }
}

async function loadGroupFeed(gid) {
  const feedEl  = document.getElementById('gd-feed');
  if (!feedEl) return;
  feedEl.innerHTML = `<div style="padding:1rem;text-align:center;color:var(--text-muted);font-size:0.82rem">Loading…</div>`;

  const orgCode = Auth.currentUser?.orgCode || AppState.orgCode;
  const me      = Auth.currentUser?.id;

  try {
    const res  = await fetch(`/api/groups/${gid}/feed?orgCode=${encodeURIComponent(orgCode)}&requesterId=${encodeURIComponent(me)}`, { headers: Auth._headers() });
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
      const icon     = isAnon ? '' : (item._kind === 'note' ? '' : '');
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
    method: 'POST', headers: { 'Content-Type': 'application/json', ...Auth._headers() },
    body: JSON.stringify({
      orgCode, fromId: me?.id, fromName: me?.name,
      toType: 'group', toId: _currentGroupId,
      content: text, anonymous,
    }),
  });

  document.getElementById('gd-compose').value = '';
  showToast(anonymous ? 'Sent anonymously ' : 'Message sent ', 'success');
  loadGroupFeed(_currentGroupId);
}


function openEditGroup(gid) {
  showToast('Edit group — coming soon', 'info');
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
    if (recsEl) recsEl.innerHTML = `<div style="padding:0.6rem;background:rgba(247,79,79,0.08);border:1px solid rgba(247,79,79,0.25);border-radius:6px;font-size:0.8rem;color:var(--danger)">Some profile data could not be displayed. This member may not have completed assessments yet.</div>`;
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
  document.getElementById('pm-joined').textContent  = m.joinDate ? `Joined ${m.joinDate}` : '';
  document.getElementById('pm-active').textContent  = m.lastActive ? `Active: ${m.lastActive}` : 'Not active yet';
  document.getElementById('pm-streak').textContent  = m.streak ? `${m.streak}-day streak` : '';
  document.getElementById('pm-iq-ring').innerHTML   = iqRingHTML(m.iqScore, scoreColor(m.iqScore), 100);
  document.getElementById('pm-overall').textContent = m.overall ?? '—';
  document.getElementById('pm-wellness').innerHTML  = wellnessMeterHTML(m.wellnessScore);
  document.getElementById('pm-notes').textContent   = m.notes;
  document.getElementById('pm-dev-plan').innerHTML  = devPlanHTML(m.devPlan);

  // Score breakdown
  document.getElementById('pm-scores').innerHTML = metrics.map(k=>`
    <div style="margin-bottom:0.7rem">
      <div style="display:flex;justify-content:space-between;margin-bottom:3px">
        <span style="font-size:0.8rem">${k}</span>
        <span style="font-size:0.8rem;font-weight:600;color:${scoreColor(m.scores[k])}">${m.scores[k] ?? '—'}</span>
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

  // Member-support tab (Cut E) — the "Ask IntelliQ" entry routes into the ONE composer; the panel
  // shows the read-only legacy advisor archive for this member.
  const _askIq = document.getElementById('pm-ask-iq');
  if (_askIq) { const m = AppState.getMember(id); _askIq.onclick = () => MemberApp.askAboutMember(id, m && m.name); }
  loadAdvisorThreads(id);
  loadBehavioralProfile(id);
  loadMemberData(id);
  loadSimilarCohort(id);

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

/* ── INDIVIDUAL ADVISOR AI (Phase 1) ─────────────────────────
   Leader asks a question about a specific member; server reasons over
   what IntelliQ knows about them, through the privacy gate + role lens.
   Additive — lives in the profile modal's "Ask Advisor" tab. */

function _escAdvisor(s){
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/* [REMOVED] The Individual Advisor composer (ADVISOR_CHIPS / renderAdvisorChips /
   setAdvisorQuestion / _renderAdvisorAnswer / askAdvisor) — Phase-1 Cut E. There is no separate
   Advisor assistant/composer/identity. A leader asks about a member through the ONE IntelliQ
   composer: the member profile's "Ask IntelliQ" entry calls MemberApp.askAboutMember(id, name),
   which routes into #iq-myworkspace with an explicit, server-validated member subject (a visible
   chip, clearable). loadAdvisorThreads below is retained as a READ-ONLY legacy archive view. */

async function loadAdvisorThreads(memberId){
  const el = document.getElementById('pm-advisor-history');
  if (!el) return;
  el.innerHTML = `<div class="advisor-muted">Loading…</div>`;
  try {
    const res  = await fetch(`/api/advisor/${encodeURIComponent(memberId)}/threads`, { headers: Auth._headers() });
    const data = await res.json();
    const threads = (data && data.threads) || [];
    if (!threads.length){ el.innerHTML = `<div class="advisor-muted">No questions asked yet.</div>`; return; }
    el.innerHTML = threads.map(t => `
      <div class="advisor-thread">
        <div class="advisor-thread-q">Q: ${_escAdvisor(t.question)}</div>
        <div class="advisor-thread-a">${_escAdvisor(t.answer).replace(/\n/g,'<br>')}</div>
        <div class="advisor-thread-meta">${_escAdvisor(new Date(t.createdAt).toLocaleString())}${t.lens ? ' · ' + _escAdvisor(t.lens) : ''}</div>
      </div>`).join('');
  } catch (err){
    el.innerHTML = `<div class="advisor-muted">Could not load history.</div>`;
  }
}

/* ── Cross-member intelligence (v1) — similar cohort + what's helped ─────────── */
async function loadSimilarCohort(memberId){
  const el = document.getElementById('pm-similar');
  if (!el) return;
  el.innerHTML = '';
  try {
    const res = await fetch(`/api/member/${encodeURIComponent(memberId)}/similar`, { headers: Auth._headers() });
    const d = await res.json();
    if (!res.ok || !d.ok) return;                    // silent — optional insight
    if (!d.cohortSize && !d.hasData) return;         // nothing useful yet → hide
    const worked = (d.whatWorked || []).filter(w => w.total > 0);
    el.innerHTML = `
      <div class="pm-similar-card">
        <div class="pm-similar-head">Similar patterns${d.cohortSize ? ` · ${d.cohortSize} member${d.cohortSize !== 1 ? 's' : ''} on a similar path` : ''}</div>
        ${worked.length ? `
          <div class="pm-similar-sub">What's tended to help ${d.scope === 'cohort' ? 'them' : 'across the org'}:</div>
          <div class="pm-similar-list">${worked.map(w => `<span class="pm-similar-chip">${_escAdvisor(w.type)} · ${w.positive}/${w.total} positive</span>`).join('')}</div>
          ${d.lowConfidence ? `<div class="pm-similar-sub" style="opacity:0.75">Early signal — few outcomes so far; treat as a hint, not proof.</div>` : ''}`
        : `<div class="pm-similar-sub">Not enough intervention history yet to say what's helped — this sharpens as outcomes accrue.</div>`}
        <div class="pm-similar-foot">Anonymous — no other member is named.</div>
      </div>`;
  } catch (_) { /* optional — stay silent */ }
}

/* ── Behavioral profile — IntelliQ's evolving understanding of a member ──────── */
const _PROFILE_TRAJ = {
  converging:  { label: 'Converging', color: 'var(--success)' },
  sustaining:  { label: 'Sustaining', color: 'var(--accent)'  },
  stalled:     { label: 'Stalled',    color: 'var(--warning)' },
  diverging:   { label: 'Diverging',  color: 'var(--danger)'  },
  unanchored:  { label: 'Unanchored', color: 'var(--text-muted)' },
  unknown:     { label: 'Building…',  color: 'var(--text-muted)' },
};

async function loadBehavioralProfile(memberId, refresh){
  // Render the agent summary into BOTH the top-of-profile lead (pm-summary) and
  // the AI Insights tab (pm-profile) — one fetch, so clicking a member leads with
  // IntelliQ's read of them, with the same card still available under the tab.
  const els = ['pm-summary', 'pm-profile'].map(id => document.getElementById(id)).filter(Boolean);
  if (!els.length) return;
  const setAll = html => els.forEach(el => { el.innerHTML = html; });
  setAll(`<div class="pm-profile-loading">IntelliQ is assembling what it understands…</div>`);
  try {
    // Never hang on "assembling…" — cap the wait and fall back gracefully.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 18000);
    let res;
    try {
      res = await fetch(`/api/member/${encodeURIComponent(memberId)}/profile${refresh ? '?refresh=1' : ''}`, { headers: Auth._headers(), signal: ctrl.signal });
    } finally { clearTimeout(timer); }
    if (res.status === 401) { setAll(`<div class="pm-profile-empty">Your session expired — please log in again.</div>`); return; }
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'unavailable');
    const p = data.profile;
    if (!p || !p.narrative) {
      setAll(`<div class="pm-profile-empty">Not enough to understand ${_escAdvisor(AppState.getMember(memberId)?.name || 'them')} yet — log data or run a check-in, and this fills in.</div>`);
      return;
    }
    const tj = _PROFILE_TRAJ[p.trajectory] || _PROFILE_TRAJ.unknown;
    const chips = (label, arr) => (arr && arr.length)
      ? `<div class="pm-profile-row"><span class="pm-profile-k">${label}</span><span class="pm-profile-chips">${arr.map(x => `<span class="pm-profile-chip">${_escAdvisor(x)}</span>`).join('')}</span></div>` : '';
    const remembered = (data.remembered || []).map(r => r.text);
    const followUps  = (p.followUps || []);
    const priv = data.privateMatters || 0;
    const nudges = (data.assessmentNudges || []);
    const nudgeHtml = nudges.length ? `<div class="pm-profile-nudges">${nudges.map(n => {
      const col = n.tone === 'repeat' ? '#0ecfb0' : '#f7b24f';
      const lead = n.tone === 'repeat' ? 'Repeat' : 'Revisit';
      return `<div class="pm-profile-nudge" style="border-left:2px solid ${col}"><span class="pm-profile-nudge-tag" style="color:${col}">${lead}</span> ${_escAdvisor(n.text)}</div>`;
    }).join('')}</div>` : '';
    setAll(`
      <div class="pm-profile-card">
        <div class="pm-profile-head">
          <span>What IntelliQ understands</span>
          <span class="pm-profile-traj" style="color:${tj.color};border-color:${tj.color}55">${tj.label}</span>
          <button class="pm-profile-refresh" title="Rebuild" onclick="loadBehavioralProfile('${memberId}', true)">↻</button>
        </div>
        <div class="pm-profile-narr">${_escAdvisor(p.narrative)}</div>
        ${chips('Tends to', p.tendencies)}
        ${chips('Driven by', p.motivators)}
        ${chips('Watch for', p.watchFor)}
        ${chips('Remembers', remembered)}
        ${followUps.length ? `<div class="pm-profile-row"><span class="pm-profile-k">Check in about</span><span class="pm-profile-chips">${followUps.map(f => `<span class="pm-profile-chip pm-profile-followup">${_escAdvisor(f)}</span>`).join('')}</span></div>` : ''}
        ${nudgeHtml}
        ${priv ? `<div class="pm-profile-priv">Also informed by ${priv} private matter${priv !== 1 ? 's' : ''} — kept confidential, used only to support them.</div>` : ''}
      </div>`);
  } catch (e) {
    setAll(`<div class="pm-profile-empty">Couldn't assemble the read just now. <button class="pm-profile-refresh" onclick="loadBehavioralProfile('${memberId}', true)">↻ Try again</button></div>`);
  }
}

/* ── Member Data hub — everything collected about a person, on their profile ───
   Consolidated view of the member's signals (metrics, sheets, observations,
   check-ins, assessments…). Sensitive items are shown locked — they inform the
   AI but their detail isn't displayed. Same store the Advisor reasons from. */
const _SIGNAL_LABELS = {
  checkin: 'Check-ins', note: 'Notes & observations', assessment: 'Assessments',
  weekly: 'Weekly reflections', voice: 'Voice notes', film: 'Film notes',
  metric: 'Metrics', sheet: 'Spreadsheets', gamestats: 'Game stats',
  document: 'Documents', external: 'External feeds', teams: 'Microsoft Teams',
  google: 'Google', outlook: 'Outlook',
};

async function loadMemberData(memberId){
  const el = document.getElementById('pm-data-content');
  if (!el) return;
  el.innerHTML = `<div style="padding:1rem;color:var(--text-muted);font-size:0.82rem">Loading…</div>`;
  try {
    const res = await fetch(`/api/signals?subjectType=member&subjectId=${encodeURIComponent(memberId)}`, { headers: Auth._headers() });
    const d = await res.json();
    const sigs = (d.signals || []).sort((a, b) => new Date(b.ts) - new Date(a.ts));
    if (!sigs.length) {
      el.innerHTML = `<div style="padding:1.2rem;color:var(--text-muted);font-size:0.82rem;text-align:center">Nothing collected yet. Upload a sheet, log an observation, or the member checks in — it all lands here for the AI to use.</div>`;
      return;
    }
    const groups = {};
    sigs.forEach(s => { (groups[s.source] = groups[s.source] || []).push(s); });
    // Order groups: strongest sources first
    const order = ['assessment','metric','gamestats','sheet','note','film','voice','weekly','checkin','document','external','teams','google','outlook'];
    const keys = Object.keys(groups).sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
    el.innerHTML = keys.map(src => `
      <div class="md-group">
        <div class="md-group-head">${_escAdvisor(_SIGNAL_LABELS[src] || src)} <span class="md-count">${groups[src].length}</span></div>
        ${groups[src].slice(0, 25).map(_memberDataRow).join('')}
      </div>`).join('');
  } catch (e) {
    el.innerHTML = `<div style="padding:1rem;color:var(--danger);font-size:0.82rem">Could not load data.</div>`;
  }
}

function _memberDataRow(s){
  const wc = s.weight === 'strong' ? 'var(--success)' : s.weight === 'medium' ? 'var(--warning)' : 'var(--text-muted)';
  const when = s.ts ? new Date(s.ts).toLocaleDateString() : '';
  const isPrivate = s.sensitivity === 'sensitive' || s.sensitivity === 'restricted' || s.redacted;
  const val = isPrivate
    ? `Private — informs the AI, not shown`
    : (s.valueText ? _escAdvisor(String(s.valueText).slice(0, 160))
       : (s.valueNum != null ? `${s.label ? _escAdvisor(s.label) + ': ' : ''}${s.valueNum}`
          : _escAdvisor(s.label || '')));
  return `
    <div class="md-row">
      <span class="md-w" style="background:${wc}" title="${s.weight || 'weak'} signal"></span>
      <div class="md-body">
        <div class="md-val${isPrivate ? ' md-private' : ''}">${val || '—'}</div>
        <div class="md-meta">${s.public ? 'public · ' : ''}${_escAdvisor(when)}</div>
      </div>
    </div>`;
}

/* ── UNIVERSAL INPUT — log any data about a member (text / metric / voice) ─────
   Feeds the universal Signal layer (POST /api/signals/ingest) which the Advisor
   and Group Copilot reason over. Voice uses the browser's speech recognition —
   no server transcription needed. The thesis: more input → stronger output. */
let _logType = 'observation';
let _logRec  = null;

function openLogSignal() {
  const mid = AppState.currentMemberId;
  if (!mid) return;
  const m = AppState.getMember(mid);
  _showInlineModal(`
    <div style="font-weight:700;margin-bottom:0.2rem">Log data for ${_escAdvisor(m?.name || 'member')}</div>
    <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:0.8rem">Anything you log feeds IntelliQ's understanding — a film note (by voice), a metric, an observation, a public stat.</div>
    <div style="display:flex;gap:0.4rem;margin-bottom:0.8rem">
      <button class="btn btn-sm btn-accent"  id="sig-t-observation" onclick="_setLogType('observation')">Observation</button>
      <button class="btn btn-sm btn-outline" id="sig-t-metric"      onclick="_setLogType('metric')">Metric</button>
      <button class="btn btn-sm btn-outline" id="sig-t-voice"       onclick="_setLogType('voice')">Voice</button>
    </div>
    <div id="sig-fields"></div>
    <div id="sig-result" style="font-size:0.8rem;margin-top:0.5rem"></div>
    <div style="display:flex;gap:0.5rem;margin-top:0.9rem">
      <button class="btn btn-accent btn-sm" onclick="submitLogSignal()">Save</button>
      <button class="btn btn-outline btn-sm" onclick="_stopDictation();_closeInlineModal()">Cancel</button>
    </div>`);
  _setLogType('observation');
}

function _setLogType(t) {
  _stopDictation();
  _logType = t;
  ['observation', 'metric', 'voice'].forEach(x => {
    const b = document.getElementById('sig-t-' + x);
    if (b) b.className = 'btn btn-sm ' + (x === t ? 'btn-accent' : 'btn-outline');
  });
  const f = document.getElementById('sig-fields');
  if (!f) return;
  if (t === 'metric') {
    f.innerHTML = `
      <input class="search-input" id="sig-label" placeholder="What (e.g. Squat 1RM, 40-yd dash)" style="width:100%;margin-bottom:0.5rem">
      <input class="search-input" id="sig-num" type="number" step="any" placeholder="Value" style="width:100%">
      <label style="display:flex;align-items:center;gap:0.4rem;font-size:0.74rem;color:var(--text-muted);margin-top:0.5rem">
        <input type="checkbox" id="sig-public"> Public stat — the AI may cite this openly</label>`;
  } else if (t === 'voice') {
    f.innerHTML = `
      <div style="display:flex;gap:0.5rem;align-items:center;margin-bottom:0.4rem">
        <button class="btn btn-outline btn-sm" id="sig-mic" onclick="_toggleDictation()">Start dictation</button>
        <span id="sig-mic-state" style="font-size:0.72rem;color:var(--text-muted)"></span>
      </div>
      <textarea class="form-input" id="sig-text" rows="4" placeholder="Speak or type a film / voice note…" style="width:100%"></textarea>`;
  } else {
    f.innerHTML = `<textarea class="form-input" id="sig-text" rows="4" placeholder="An observation about this person…" style="width:100%"></textarea>`;
  }
}

function _toggleDictation() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const stateEl = document.getElementById('sig-mic-state');
  if (!SR) { if (stateEl) stateEl.textContent = 'Voice input not supported here — type instead.'; return; }
  if (_logRec) { _stopDictation(); return; }
  const ta = document.getElementById('sig-text');
  const base = ta ? ta.value : '';
  _logRec = new SR();
  _logRec.continuous = true; _logRec.interimResults = true; _logRec.lang = 'en-US';
  _logRec.onresult = (e) => {
    let txt = '';
    for (let i = e.resultIndex; i < e.results.length; i++) txt += e.results[i][0].transcript;
    if (ta) ta.value = (base + ' ' + txt).trim();
  };
  _logRec.onend = () => { const b = document.getElementById('sig-mic'); if (b) b.textContent = 'Start dictation'; if (stateEl) stateEl.textContent = ''; _logRec = null; };
  try { _logRec.start(); } catch (_) {}
  const b = document.getElementById('sig-mic'); if (b) b.textContent = '⏹ Stop';
  if (stateEl) stateEl.textContent = 'Listening…';
}

function _stopDictation() { if (_logRec) { try { _logRec.stop(); } catch (_) {} _logRec = null; } }

async function submitLogSignal() {
  const mid = AppState.currentMemberId;
  const res = document.getElementById('sig-result');
  if (!mid) return;
  const body = { subjectType: 'member', subjectId: mid };

  if (_logType === 'metric') {
    const label = (document.getElementById('sig-label')?.value || '').trim();
    const num   = document.getElementById('sig-num')?.value;
    if (num === '' || num == null) { if (res) { res.style.color = 'var(--danger)'; res.textContent = 'Enter a value.'; } return; }
    body.source = 'metric'; body.modality = 'number'; body.label = label; body.valueNum = Number(num);
    body.public = !!document.getElementById('sig-public')?.checked;
  } else {
    const text = (document.getElementById('sig-text')?.value || '').trim();
    if (!text) { if (res) { res.style.color = 'var(--danger)'; res.textContent = 'Add some text first.'; } return; }
    body.source = _logType === 'voice' ? 'voice' : 'note';
    body.modality = _logType === 'voice' ? 'audio' : 'text';
    body.valueText = text;
  }

  _stopDictation();
  try {
    const r = await fetch('/api/signals/ingest', { method: 'POST', headers: Auth._headers(), body: JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok || !d.ok) throw new Error(d.error || 'Could not save');
    if (res) { res.style.color = 'var(--success)'; res.textContent = 'Logged — IntelliQ will use this.'; }
    setTimeout(_closeInlineModal, 800);
  } catch (e) {
    if (res) { res.style.color = 'var(--danger)'; res.textContent = '' + e.message; }
  }
}

/* ── IQComposer — one reusable input toolbar (attach · voice · text) ─────
   Bind to any textarea: put <div data-iqcompose="<textareaId>"></div> after it and
   call IQComposer.mountAll(). Dictation uses the browser; attachments are parsed
   via AttachmentHandler and exposed through IQComposer.takeAttachments(id). */
const IQComposer = {
  _state: {},   // textareaId → { recording, attachments: [{name, kind, content, data, mediaType}] }

  mountAll() {
    document.querySelectorAll('[data-iqcompose]').forEach(host => {
      const target = host.getAttribute('data-iqcompose');
      if (host.dataset.iqMounted === '1') return;
      host.dataset.iqMounted = '1';
      host.innerHTML = `
        <div class="iqc-bar">
          <button type="button" class="iqc-btn" onclick="IQComposer.pickFile('${target}')">Attach</button>
          <button type="button" class="iqc-btn" id="iqc-mic-${target}" onclick="IQComposer.toggleVoice('${target}')">Voice</button>
          <input type="file" id="iqc-file-${target}" style="display:none"
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv"
            onchange="IQComposer.onFile('${target}', this)">
          <span class="iqc-state" id="iqc-state-${target}"></span>
        </div>
        <div class="iqc-chips" id="iqc-chips-${target}"></div>`;
      if (!this._state[target]) this._state[target] = { recording: false, attachments: [] };
    });
  },

  pickFile(id) { document.getElementById(`iqc-file-${id}`)?.click(); },

  async onFile(id, input) {
    const file = input.files && input.files[0];
    if (!file) return;
    const stateEl = document.getElementById(`iqc-state-${id}`);
    if (typeof AttachmentHandler === 'undefined') { if (stateEl) stateEl.textContent = 'Attachments unavailable.'; return; }
    if (stateEl) stateEl.textContent = `Reading ${file.name}…`;
    try {
      const parsed = await AttachmentHandler.process(file);
      this._state[id].attachments.push({
        name: file.name, kind: parsed.kind,
        content: parsed.content || parsed.summary || '',
        data: parsed.data || null, mediaType: parsed.mediaType || null,
      });
      if (stateEl) stateEl.textContent = '';
      this._renderChips(id);
    } catch (e) { if (stateEl) stateEl.textContent = `${e.message}`; }
    input.value = '';
  },

  _renderChips(id) {
    const el = document.getElementById(`iqc-chips-${id}`);
    if (!el) return;
    el.innerHTML = (this._state[id].attachments || []).map((a, i) =>
      `<span class="iqc-chip">${_escAdvisor(a.name)}<button class="iqc-chip-x" onclick="IQComposer.removeAttachment('${id}',${i})">×</button></span>`
    ).join('');
  },

  removeAttachment(id, i) { this._state[id].attachments.splice(i, 1); this._renderChips(id); },

  toggleVoice(id) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const stateEl = document.getElementById(`iqc-state-${id}`);
    const micBtn  = document.getElementById(`iqc-mic-${id}`);
    const st = this._state[id];
    if (!SR) { if (stateEl) stateEl.textContent = 'Voice not supported — type instead.'; return; }
    if (st._rec) { try { st._rec.stop(); } catch (_) {} st._rec = null; return; }
    const ta = document.getElementById(id);
    const base = ta ? ta.value : '';
    const rec = new SR(); rec.continuous = true; rec.interimResults = true; rec.lang = 'en-US';
    rec.onresult = (e) => { let t = ''; for (let i = e.resultIndex; i < e.results.length; i++) t += e.results[i][0].transcript; if (ta) ta.value = (base + ' ' + t).trim(); };
    rec.onend = () => { if (micBtn) micBtn.textContent = 'Voice'; if (stateEl) stateEl.textContent = ''; st._rec = null; };
    try { rec.start(); } catch (_) {}
    st._rec = rec;
    if (micBtn) micBtn.textContent = '⏹ Stop';
    if (stateEl) stateEl.textContent = 'Listening…';
  },

  // Returns attachments and clears them (call on submit).
  takeAttachments(id) {
    const a = (this._state[id]?.attachments) || [];
    if (this._state[id]) this._state[id].attachments = [];
    this._renderChips(id);
    return a;
  },
};

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

  // Use org's own metrics as domain suggestions — fall back to generic set
  const metricNames = (AppState.metrics || []).map(m => typeof m === 'string' ? m : m.name).filter(Boolean);
  const domainOptions = metricNames.length
    ? metricNames.slice(0, 6)
    : ['Decision Making', 'Situational Awareness', 'Communication', 'Leadership', 'Ethics', 'Pressure Response'];

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
            <button class="btn btn-outline btn-sm" onclick="assignToMemberApp('${s.id}')" title="Send to member's app">Assign</button>
          </div>
        </div>
      </div>`;
  }).join('') : `
    <div style="padding:2.5rem 1rem;text-align:center;background:var(--surface-1);border:1px solid var(--border);border-radius:var(--radius)">
      <div style="font-size:2.5rem;margin-bottom:0.8rem"></div>
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
          Draft Assessment with AI →
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
        <div style="font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--accent);margin-bottom:0.4rem">Leader Note — Private</div>
        <div id="sc-draft-coachnote" style="font-size:0.82rem;color:var(--text-secondary);line-height:1.6"></div>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:0.5rem">
        <button class="btn btn-outline" onclick="document.getElementById('sc-draft-panel').style.display='none'">Cancel</button>
        <button class="btn btn-accent" onclick="approveDraft()">Approve &amp; Launch</button>
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
  if (btn) { btn.textContent = 'Drafting…'; btn.disabled = true; }

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
    if (btn) { btn.textContent = 'Draft Scenario with AI →'; btn.disabled = false; }
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
    showToast(`Assigned to ${member.name.split(' ')[0]}'s app `, 'success');
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
    el.innerHTML = `<div class="empty-state"><div class="empty-icon"></div><p>Could not load team — try refreshing.</p></div>`;
  }
}

function filterMyTeam(search) {
  _myTeamSearch = (search || '').toLowerCase();
  _renderMyTeamList();
}

function _renderMyTeamList() {
  const el = document.getElementById('myteam-content');
  if (!el) return;

  // A leader sees check-in RECENCY (are they engaging?), never a member's mood.
  // Mood is private evidence; the leader's roster answers "who's active", and the
  // briefing surfaces who needs attention — direction + care, never a number/emoji.
  const _recency = (ck) => {
    if (!ck || !ck.ts && !ck.date) return { dot: 'var(--text-muted)', word: 'No check-in' };
    const t = ck.ts ? new Date(ck.ts).getTime() : Date.parse(ck.date);
    const days = Number.isFinite(t) ? (Date.now() - t) / 86400000 : Infinity;
    if (days <= 7)  return { dot: 'var(--success)', word: 'Active this week' };
    if (days <= 30) return { dot: 'var(--warning)', word: 'Active this month' };
    return { dot: 'var(--text-muted)', word: 'Quiet lately' };
  };
  const filtered   = _myTeamSearch
    ? _myTeamMembers.filter(m =>
        m.name.toLowerCase().includes(_myTeamSearch) ||
        (m.email || '').toLowerCase().includes(_myTeamSearch))
    : _myTeamMembers;

  if (!filtered.length) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon"></div>
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
        const rec        = _recency(m.latestCheckin);
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
              <div class="lm-mood" title="${rec.word}"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${rec.dot}"></span></div>
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
        <div class="empty-icon"></div>
        <p>No visible members to assign to yet. You'll be able to assign once members are added to your area.</p>
      </div>`;
    return;
  }

  if (!scenarios.length) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon"></div>
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
    showToast(`Assigned "${scenario.title}" to ${member.name.split(' ')[0]} `, 'success');
    const selEl = document.getElementById(`assign-sel-${scenarioId}`);
    if (selEl) selEl.value = '';  // reset selector after success
  } catch(e) {
    showToast('Could not assign — check your connection', 'warning');
  }
}


/* ── ORGANISATION HEALTH ─────────────────────────────────── *
 * "How is the organisation doing?"
 * Admin-level aggregate view. Anonymous-first. Scoped via
 * getVisibleUserIds() — admins see full org.
 * ──────────────────────────────────────────────────────────── */
async function renderOrgHealth() {
  const el = document.getElementById('org-health-content');
  if (!el) return;
  el.innerHTML = `<div style="padding:1.5rem;text-align:center;color:var(--text-muted)">Loading…</div>`;

  try {
    const [insRes, membRes] = await Promise.all([
      fetch('/api/workspace/team-insights', { headers: Auth._headers() }),
      fetch('/api/workspace/visible-members', { headers: Auth._headers() }),
    ]);
    const ins  = insRes.ok  ? await insRes.json()  : { ok: false };
    const memb = membRes.ok ? await membRes.json() : { ok: false };

    if (!ins.ok) throw new Error('Could not load data');

    const members   = memb.members || [];
    const now       = Date.now();
    const moodVal   = ins.avgMood;
    const moodColor = v => v >= 4 ? 'var(--success)' : v >= 3 ? 'var(--warning)' : 'var(--danger)';
    // Even aggregated, the org sees an energy DIRECTION word, not a mood number —
    // one consistent rule (iqMoodWord) across every leader/admin surface.
    const moodWord  = iqMoodWord;

    // Participation breakdown
    const active7d  = members.filter(m => m.latestCheckin?.ts && (now - new Date(m.latestCheckin.ts).getTime()) < 7*86400000).length;
    const active30d = members.filter(m => m.latestCheckin?.ts && (now - new Date(m.latestCheckin.ts).getTime()) < 30*86400000).length;
    const neverCk   = members.filter(m => !m.latestCheckin?.ts).length;
    const pending   = members.filter(m => !m.passwordSet).length;
    const setupPct  = members.length ? Math.round(((members.length - pending) / members.length) * 100) : 0;
    const activePct = members.length ? Math.round((active7d / members.length) * 100) : 0;

    el.innerHTML = `
      <!-- Headline stats -->
      <div class="grid-3" style="margin-bottom:1.2rem">
        <div class="stat-card">
          <div class="stat-card-val">${members.length}</div>
          <div class="stat-card-label">Total Members</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-val" style="color:${activePct >= 60 ? 'var(--success)' : activePct >= 30 ? 'var(--warning)' : 'var(--danger)'}">
            ${activePct}%
          </div>
          <div class="stat-card-label">Active This Week</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-val" style="color:${moodVal ? moodColor(moodVal) : 'var(--text-muted)'}">
            ${moodWord(moodVal)}
          </div>
          <div class="stat-card-label">Team Energy</div>
        </div>
      </div>

      <!-- Engagement breakdown -->
      <div class="card" style="margin-bottom:1rem">
        <div class="card-label" style="margin-bottom:0.8rem">Engagement</div>
        <div style="display:flex;flex-direction:column;gap:0.5rem">
          ${_healthBar('Active this week',    active7d,  members.length, 'var(--success)')}
          ${_healthBar('Active last 30 days', active30d, members.length, 'var(--accent)')}
          ${_healthBar('Account set up',      members.length - pending, members.length, '#4f8ef7')}
          ${neverCk ? `
            <div style="font-size:0.78rem;color:var(--warning);margin-top:0.3rem">
              ${neverCk} member${neverCk !== 1 ? 's' : ''} ${neverCk !== 1 ? 'have' : 'has'} never checked in.
            </div>` : ''}
        </div>
      </div>

      <!-- Wellbeing summary (anonymous) -->
      ${ins.notEnoughData ? `
        <div class="card" style="margin-bottom:1rem">
          <div class="card-label" style="margin-bottom:0.4rem">Wellbeing</div>
          <div style="font-size:0.82rem;color:var(--text-muted)">Not enough check-ins yet for a meaningful wellbeing picture.</div>
        </div>` : `
        <div class="card" style="margin-bottom:1rem">
          <div class="card-label" style="margin-bottom:0.6rem">Wellbeing snapshot (anonymous)</div>
          <div style="display:flex;gap:1.2rem;flex-wrap:wrap">
            <div>
              <div style="font-size:1.4rem;font-weight:800;color:${moodColor(moodVal)}">${moodWord(moodVal)}</div>
              <div style="font-size:0.72rem;color:var(--text-muted)">Team energy</div>
            </div>
            <div>
              <div style="font-size:1.4rem;font-weight:800">${ins.activeThisWeek}</div>
              <div style="font-size:0.72rem;color:var(--text-muted)">Checked in this week</div>
            </div>
            <div>
              <div style="font-size:1.4rem;font-weight:800;color:${ins.needsAttention?.length ? 'var(--danger)' : 'var(--success)'}">
                ${ins.needsAttention?.length ?? 0}
              </div>
              <div style="font-size:0.72rem;color:var(--text-muted)">Needs attention</div>
            </div>
          </div>
          <div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.6rem">
            Individual names not shown here. Leaders can review specific cases in their workspace.
          </div>
        </div>`}

      <!-- Recommended action -->
      ${ins.recommendedAction ? `
        <div class="card" style="border-color:rgba(124,90,245,0.3);background:rgba(124,90,245,0.04)">
          <div class="card-label" style="color:var(--accent);margin-bottom:0.3rem">Suggested action</div>
          <div style="font-size:0.85rem;color:var(--text-primary);line-height:1.6">${ins.recommendedAction}</div>
        </div>` : ''}`;

  } catch(e) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon"></div><p>Could not load organisation health. Try refreshing.</p></div>`;
  }
}

// Helper: horizontal progress bar for health metrics
function _healthBar(label, value, total, color) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return `
    <div>
      <div style="display:flex;justify-content:space-between;font-size:0.78rem;margin-bottom:3px">
        <span style="color:var(--text-secondary)">${label}</span>
        <span style="color:var(--text-primary);font-weight:600">${value} / ${total} (${pct}%)</span>
      </div>
      <div style="height:6px;background:var(--surface-2);border-radius:3px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:${color};border-radius:3px;transition:width 0.4s"></div>
      </div>
    </div>`;
}


/* ── My Groups — set goals & traits for groups you LEAD ───────────────────────
   Membership ≠ leadership: you can edit a group's aims only if you're a lead of
   it. Groups you only belong to are shown read-only. Feeds the alignment TEAM
   frame (team goals + traits) used by the Advisor and Group Health. */
let _leaderGroups = { led: [], member: [], orgTraits: [] };

async function renderLeaderGroups() {
  const el = document.getElementById('leader-groups-content');
  if (!el) return;
  el.innerHTML = `<div style="padding:1.5rem;text-align:center;color:var(--text-muted)">Loading…</div>`;

  try {
    const uid = Auth.currentUser?.id;
    const [gRes, vRes] = await Promise.all([
      fetch(`/api/groups?orgCode=${encodeURIComponent(AppState.orgCode)}&memberId=${encodeURIComponent(uid)}`, { headers: Auth._headers() }),
      fetch('/api/values', { headers: Auth._headers() }).catch(() => null),
    ]);
    const gData = gRes.ok ? await gRes.json() : { groups: [] };
    const vData = vRes && vRes.ok ? await vRes.json() : { values: [] };
    const groups = gData.groups || [];

    _leaderGroups = {
      led:       groups.filter(g => (g.leadIds || []).includes(uid)),
      member:    groups.filter(g => !(g.leadIds || []).includes(uid)),
      orgTraits: vData.values || [],
    };
    _renderLeaderGroups();
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon"></div><p>Could not load your groups.</p></div>`;
  }
}

function _renderLeaderGroups() {
  const el = document.getElementById('leader-groups-content');
  if (!el) return;
  const { led, member } = _leaderGroups;

  if (!led.length && !member.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon"></div>
      <p>You're not in any groups yet. An admin can create groups in Members → Groups and make you a lead.</p></div>`;
    return;
  }

  const ledHTML = led.map(g => `
    <div class="grp-card" data-gid="${g.id}">
      <div class="grp-head">
        <div class="grp-name">${_escAdvisor(g.name)} <span class="grp-leadtag">you lead</span></div>
        <button class="btn btn-outline btn-sm" onclick="openGroupDetail('${g.id}')">Open · Copilot</button>
      </div>
      <div class="grp-aim">
        <div class="grp-aim-label">Goals</div>
        <div class="grp-chips" id="grp-goals-${g.id}">${(g.goals||[]).map(x => _aimChip(g.id,'goal',x)).join('') || '<span class="grp-none">None yet</span>'}</div>
        <div class="grp-add">
          <input class="search-input" id="grp-goal-in-${g.id}" placeholder="Add a goal…" onkeydown="if(event.key==='Enter')addGroupAim('${g.id}','goal')">
          <button class="btn btn-outline btn-sm" onclick="addGroupAim('${g.id}','goal')">Add</button>
        </div>
      </div>
      <div class="grp-aim">
        <div class="grp-aim-label">Traits</div>
        <div class="grp-chips" id="grp-traits-${g.id}">${(g.traits||[]).map(x => _aimChip(g.id,'trait',x)).join('') || '<span class="grp-none">None yet</span>'}</div>
        <div class="grp-add">
          <input class="search-input" id="grp-trait-in-${g.id}" placeholder="Add a trait…" onkeydown="if(event.key==='Enter')addGroupAim('${g.id}','trait')">
          <button class="btn btn-outline btn-sm" onclick="addGroupAim('${g.id}','trait')">Add</button>
        </div>
        ${(_leaderGroups.orgTraits||[]).length ? `<div class="grp-suggest">From org values: ${_leaderGroups.orgTraits.map(t => `<button class="grp-suggest-chip" onclick="addGroupAim('${g.id}','trait','${_escAdvisor(t).replace(/'/g,"\\'")}')">+ ${_escAdvisor(t)}</button>`).join('')}</div>` : ''}
      </div>
      <div class="grp-save"><span class="grp-saved" id="grp-saved-${g.id}"></span></div>
    </div>`).join('');

  const memberHTML = member.length ? `
    <div class="grp-section-label">Groups you're in (read-only)</div>
    ${member.map(g => `
      <div class="grp-card grp-card--ro">
        <div class="grp-name">${_escAdvisor(g.name)}</div>
        <div class="grp-ro-aims">
          ${(g.goals||[]).length ? `${(g.goals).map(_escAdvisor).join(', ')}` : ''}
          ${(g.traits||[]).length ? `<br>${(g.traits).map(_escAdvisor).join(', ')}` : ''}
          ${!(g.goals||[]).length && !(g.traits||[]).length ? '<span class="grp-none">No goals or traits set by its lead yet.</span>' : ''}
        </div>
      </div>`).join('')}` : '';

  el.innerHTML = `
    ${led.length ? `<div class="grp-section-label">Groups you lead</div>${ledHTML}` : '<div class="grp-none" style="margin-bottom:1rem">You don\'t lead any groups yet — ask an admin to make you a group lead.</div>'}
    ${memberHTML}`;
}

function _aimChip(gid, kind, value) {
  const safe = _escAdvisor(value);
  return `<span class="grp-chip">${safe}<button class="grp-chip-x" onclick="removeGroupAim('${gid}','${kind}','${safe.replace(/'/g,"\\'")}')">×</button></span>`;
}

function _groupById(gid) { return _leaderGroups.led.find(g => g.id === gid); }

function addGroupAim(gid, kind, presetVal) {
  const g = _groupById(gid); if (!g) return;
  const inputId = kind === 'goal' ? `grp-goal-in-${gid}` : `grp-trait-in-${gid}`;
  const input = document.getElementById(inputId);
  const val = (presetVal != null ? presetVal : (input?.value || '')).trim();
  if (!val) return;
  const arrKey = kind === 'goal' ? 'goals' : 'traits';
  g[arrKey] = g[arrKey] || [];
  if (!g[arrKey].includes(val)) g[arrKey].push(val);
  if (input) input.value = '';
  _renderLeaderGroups();
  _saveGroupAims(gid);
}

function removeGroupAim(gid, kind, value) {
  const g = _groupById(gid); if (!g) return;
  const arrKey = kind === 'goal' ? 'goals' : 'traits';
  g[arrKey] = (g[arrKey] || []).filter(x => x !== value);
  _renderLeaderGroups();
  _saveGroupAims(gid);
}

async function _saveGroupAims(gid) {
  const g = _groupById(gid); if (!g) return;
  const savedEl = document.getElementById(`grp-saved-${gid}`);
  if (savedEl) { savedEl.style.color = 'var(--text-muted)'; savedEl.textContent = 'Saving…'; }
  try {
    const res = await fetch(`/api/groups/${encodeURIComponent(gid)}/aims`, {
      method: 'PUT', headers: Auth._headers(),
      body: JSON.stringify({ orgCode: AppState.orgCode, goals: g.goals || [], traits: g.traits || [] }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Save failed');
    if (savedEl) { savedEl.style.color = 'var(--success)'; savedEl.textContent = 'Saved'; setTimeout(() => { if (savedEl) savedEl.textContent = ''; }, 1500); }
  } catch (err) {
    if (savedEl) { savedEl.style.color = 'var(--danger)'; savedEl.textContent = `${err.message}`; }
  }
}

/* ── Team readiness — the grounded operational briefing ───────────────────────
   Consumes GET /api/team/readiness (server-owned projection over _getOrgState). It
   RENDERS only — no readiness logic here, no percentages, no traffic lights. Answers
   four questions in order: preparing for → ready → what could prevent it → next. */
const _RD_STATE = {
  ready:                    { label: 'Ready',                   color: 'var(--success)' },
  partially_ready:          { label: 'Partially ready',         color: 'var(--warning)' },
  not_ready:                { label: 'Not ready',               color: 'var(--danger)' },
  insufficient_information: { label: 'Not enough information',  color: 'var(--text-muted)' },
  not_yet_due:              { label: 'On track — nothing due yet', color: 'var(--accent)' },
  not_applicable:           { label: 'Not applicable',          color: 'var(--text-muted)' },
};
async function renderTeamReadiness() {
  const el = document.getElementById('team-readiness-content');
  if (!el) return;
  el.innerHTML = `<div style="padding:1.5rem;text-align:center;color:var(--text-muted)">Reading your operating context…</div>`;
  let d;
  try { const r = await fetch('/api/team/readiness', { headers: Auth._headers() }); d = await r.json(); }
  catch (_) { el.innerHTML = `<div class="empty-state"><p>Couldn't load readiness. <button class="btn btn-outline btn-sm" onclick="renderTeamReadiness()">Try again</button></p></div>`; return; }

  // Empty states — calm, never a manufactured assessment.
  if (!d.focus) {
    const msg = d.emptyState === 'no_active_objective_or_event'
      ? 'There’s operating context, but no upcoming event or active objective to assess readiness against right now.'
      : 'IntelliQ doesn’t yet have a confirmed objective or upcoming event to assess readiness against.';
    el.innerHTML = `
      <div class="card" style="text-align:center;padding:2rem">
        <div style="font-size:0.9rem;color:var(--text-secondary);margin-bottom:0.9rem">${_escAdvisor(msg)}</div>
        <button class="btn btn-accent btn-sm" onclick="navigate('operating-context')">Add operating context →</button>
      </div>`;
    return;
  }

  const st = _RD_STATE[d.readiness.status] || _RD_STATE.insufficient_information;
  const areaCard = (a) => {
    const s = _RD_STATE[a.state] || _RD_STATE.insufficient_information;
    const lim = (a.limitations || []).map(l => `<div style="font-size:0.72rem;color:var(--text-muted)">Limitation: ${_escAdvisor(l)}</div>`).join('');
    return `<div class="ds-recent-row" style="align-items:flex-start">
      <div class="ds-recent-main" style="flex-direction:column;align-items:flex-start;gap:2px">
        <div style="display:flex;align-items:center;gap:0.5rem"><span style="width:8px;height:8px;border-radius:50%;background:${s.color};display:inline-block"></span><strong style="font-size:0.82rem">${_escAdvisor(a.label)}</strong> <span style="font-size:0.7rem;color:${s.color}">${s.label}</span></div>
        <div style="font-size:0.8rem;color:var(--text-secondary)">${_escAdvisor(a.statement)}</div>${lim}
      </div></div>`;
  };
  const q = (x) => {
    const who = x.targetType === 'person' ? 'a specific person'
      : x.targetType === 'role' ? `the ${_escAdvisor((x.roleRef || '').replace(/_/g, ' '))} role` : x.targetType;
    const bindBtn = (x.targetType === 'role' && x.roleRef)
      ? `<button class="btn-ghost btn-sm" style="font-size:0.72rem" onclick="trBindPrompt('${_escAdvisor(x.roleRef)}')">Bind ${_escAdvisor(x.roleRef.replace(/_/g, ' '))} to a person</button>` : '';
    const answerBtn = x.uncertaintyId ? `<button class="btn btn-outline btn-sm" style="font-size:0.72rem;margin-top:0.4rem" onclick="trAnswer('${_escAdvisor(x.uncertaintyId)}')">Answer this →</button>` : '';
    return `<div class="card" style="margin-bottom:0.5rem;${x.blocking ? 'border-left:3px solid var(--danger)' : ''}">
      <div style="font-size:0.86rem;font-weight:600">${_escAdvisor(x.question)}${x.blocking ? ' <span style="font-size:0.68rem;color:var(--danger)">blocking</span>' : ''}</div>
      <div style="font-size:0.76rem;color:var(--text-secondary);margin-top:2px">${_escAdvisor(x.reason)} · ask ${who}</div>
      <div style="display:flex;gap:0.5rem">${answerBtn}${bindBtn}</div></div>`;
  };
  const changes = (d.recentContextChanges || []).map(c => `<li style="font-size:0.78rem;color:var(--text-secondary)">${_escAdvisor(c.statement)}</li>`).join('');

  el.innerHTML = `
    <div class="card" style="margin-bottom:1rem">
      <div class="card-label" style="margin-bottom:0.4rem">Ask about your area</div>
      <div style="display:flex;gap:0.4rem">
        <input class="form-input" id="tr-ask-input" placeholder="e.g. what's still outstanding? who owns the game plan?" style="flex:1;margin:0" onkeydown="if(event.key==='Enter')trAsk()">
        <button class="btn btn-accent btn-sm" onclick="trAsk()">Ask</button>
      </div>
      <div id="tr-ask-out" style="margin-top:0.5rem"></div>
    </div>` + `
    <div class="card" style="margin-bottom:1rem">
      <div class="card-label" style="margin-bottom:0.3rem">What are we preparing for?</div>
      <div style="font-size:1rem;font-weight:700">${_escAdvisor(d.focus.title || d.focus.type || 'Current focus')}</div>
      <div style="font-size:0.78rem;color:var(--text-muted)">${d.focus.at ? new Date(d.focus.at).toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''} · chosen as the ${_escAdvisor(d.focus.orderingRule || 'current focus')}${d.focus.otherActive ? ` (+${d.focus.otherActive} more active)` : ''}</div>
    </div>

    <div class="card" style="margin-bottom:1rem">
      <div class="card-label" style="margin-bottom:0.3rem">What appears ready?</div>
      <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.4rem"><span style="width:10px;height:10px;border-radius:50%;background:${st.color};display:inline-block"></span><strong style="color:${st.color}">${st.label}</strong></div>
      <div style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:0.6rem">${_escAdvisor(d.readiness.summary)}</div>
      ${(d.readiness.supportedAreas || []).map(areaCard).join('') || '<div style="font-size:0.8rem;color:var(--text-muted)">Nothing is confirmed ready yet.</div>'}
    </div>

    ${(d.readiness.constrainedAreas || []).length ? `<div class="card" style="margin-bottom:1rem">
      <div class="card-label" style="margin-bottom:0.3rem">What could prevent readiness?</div>
      ${d.readiness.constrainedAreas.map(areaCard).join('')}
      ${(d.readiness.limitations || []).length ? `<div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.5rem">Why readiness is limited: ${d.readiness.limitations.map(_escAdvisor).join('; ')}</div>` : ''}
    </div>` : ''}

    <div class="card" style="margin-bottom:1rem">
      <div class="card-label" style="margin-bottom:0.5rem">What should happen next?</div>
      ${(d.nextQuestions || []).length ? d.nextQuestions.map(q).join('') : '<div style="font-size:0.8rem;color:var(--text-muted)">No questions need routing right now.</div>'}
    </div>

    ${changes ? `<div class="card">
      <div class="card-label" style="margin-bottom:0.4rem">What changed because you confirmed it</div>
      <ul style="margin:0 0 0 1rem">${changes}</ul>
    </div>` : ''}
    <div id="tr-routing"></div>`;
  trLoadRouting();
}

/* Node-aware routing view — what's routed TO this leader, a summary across their subtree,
   and any multi-parent ownership conflicts that reached them. Pull, not push: nothing is
   sent; it's surfaced here to act on. Silent when there's nothing (and for node-less orgs). */
async function trLoadRouting() {
  const box = document.getElementById('tr-routing');
  if (!box) return;
  let d;
  try { const r = await fetch('/api/org/routing', { headers: Auth._headers() }); d = await r.json(); }
  catch (_) { return; }
  if (!d || !d.ok) return;
  const inbox = d.inbox || [], conflicts = d.conflicts || [], roll = d.rollup;
  if (!inbox.length && !conflicts.length && !(roll && roll.total)) return;
  const uTone = { immediate: 'var(--danger)', high: 'var(--danger)', medium: 'var(--warning)', normal: 'var(--text-muted)', low: 'var(--text-muted)' };
  const row = (x) => `<div style="display:flex;justify-content:space-between;gap:0.5rem;font-size:0.8rem;padding:0.15rem 0">
    <span>${_escAdvisor(x.label)}${x.conflict ? ' <span style="font-size:0.66rem;color:var(--warning)">shared ownership</span>' : ''}</span>
    <span style="color:${uTone[x.urgency] || 'var(--text-muted)'};font-size:0.72rem">${_escAdvisor(x.urgency)}</span></div>`;
  box.innerHTML = `
    ${conflicts.length ? `<div class="card" style="margin-top:1rem;border-left:3px solid var(--warning)">
      <div class="card-label" style="margin-bottom:0.3rem">Needs an owner decision</div>
      ${conflicts.map(c => `<div style="font-size:0.8rem;margin-bottom:0.3rem">${_escAdvisor(c.label)} — <span style="color:var(--text-secondary)">${_escAdvisor(c.reason)}</span></div>`).join('')}
    </div>` : ''}
    ${inbox.length ? `<div class="card" style="margin-top:1rem">
      <div class="card-label" style="margin-bottom:0.3rem">Routed to you (${inbox.length})</div>
      ${inbox.map(row).join('')}
    </div>` : ''}
    ${roll && roll.total ? `<div class="card" style="margin-top:1rem">
      <div class="card-label" style="margin-bottom:0.3rem">Across your area</div>
      <div style="font-size:0.8rem;color:var(--text-secondary)">${roll.total} unresolved item${roll.total === 1 ? '' : 's'} in your area${roll.unassigned ? `, ${roll.unassigned} with no owner yet` : ''}.</div>
    </div>` : ''}`;
}

/* Set a readiness question as the active conversational question, then drop the leader
   into the assistant to answer it in words. The turn adjudicates → preview → confirm. */
async function trAnswer(uncertaintyId) {
  try {
    const r = await fetch('/api/assistant/active-question', { method: 'POST', headers: Auth._headers(), body: JSON.stringify({ uncertaintyId }) });
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || 'Could not open that question');
    navigate('home');
    setTimeout(() => {
      const i = document.getElementById('iq-composer-input');
      if (i) { i.placeholder = `Answer: ${d.activeQuestion.questionText}`; i.focus(); }
      if (typeof showToast === 'function') showToast('Answer in your own words — I’ll show you exactly what gets recorded before saving.', 'info');
    }, 250);
  } catch (e) { showToast(e.message || 'Could not open that question', 'error'); }
}

/* Ask a plain organisational question — answered from YOUR scoped area (never a sibling
   branch), grounded, and routed to the right owner when it can't be answered. */
async function trAsk() {
  const input = document.getElementById('tr-ask-input');
  const out = document.getElementById('tr-ask-out');
  const q = input && input.value.trim();
  if (!q || !out) return;
  out.innerHTML = `<div style="font-size:0.8rem;color:var(--text-muted)">Checking your area…</div>`;
  try {
    const r = await fetch('/api/org/ask', { method: 'POST', headers: Auth._headers(), body: JSON.stringify({ question: q }) });
    const d = await r.json();
    const route = d.routeTo ? `<div style="font-size:0.74rem;color:var(--text-muted);margin-top:0.3rem">Best person to ask: <strong>${_escAdvisor(d.routeTo.to)}</strong></div>` : '';
    const lims = (d.limitations || []).length ? `<div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.2rem">${d.limitations.map(_escAdvisor).join(' · ')}</div>` : '';
    out.innerHTML = `<div style="font-size:0.86rem;color:var(--text-primary)">${_escAdvisor(d.answer || 'No answer available.')}</div>${route}${lims}`;
  } catch (e) { out.innerHTML = `<div style="font-size:0.8rem;color:var(--text-muted)">Couldn't answer that right now.</div>`; }
}

async function trBindPrompt(roleRef) {
  const userId = prompt(`Which member currently holds the "${roleRef.replace(/_/g, ' ')}" role? Enter their user id (routing only — no permissions change).`);
  if (!userId) return;
  try {
    const r = await fetch('/api/org-context/role-binding', { method: 'POST', headers: Auth._headers(), body: JSON.stringify({ roleRef, userId: userId.trim() }) });
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || 'Could not bind');
    showToast('Role bound — questions will now route to that person.', 'success');
    renderTeamReadiness();
  } catch (e) { showToast(e.message || 'Could not bind role', 'error'); }
}

/* ── Organisational memory — the derived-state timeline (Phase A: history, not advice).
   Reads /api/org-memory/timeline: most-recent-first moments, each with a plain-language
   "what changed" and a redacted snapshot of the readiness at that moment. It NEVER
   invents advice; it recounts what changed and when. Leader-only (server-enforced). */
const _MEM_DIR = {
  resolved:  { color: 'var(--success)', glyph: '↑' },
  improved:  { color: 'var(--success)', glyph: '↑' },
  lapsed:    { color: 'var(--danger)',  glyph: '↓' },
  regressed: { color: 'var(--danger)',  glyph: '↓' },
  appeared:  { color: 'var(--accent)',  glyph: '+' },
  removed:   { color: 'var(--text-muted)', glyph: '−' },
  changed:   { color: 'var(--warning)', glyph: '~' },
};
// Safe, plain-language cause labels — the deterministic cause metadata rendered for a
// leader. Never technical; unknown stays honestly unknown.
const _MEM_CAUSE = {
  evidence_added: 'new information', evidence_superseded: 'information replaced', evidence_removed: 'information removed',
  structure_added: 'a requirement was added', structure_changed: 'a requirement changed', structure_removed: 'a requirement was removed',
  ownership_changed: 'ownership changed', became_due: 'it became due', became_stale: 'it aged past its freshness window',
  became_not_applicable: 'no longer applicable', semantics_changed: "IntelliQ's rules changed", unknown: 'cause not determined',
};
const _MEM_REMOVAL = {
  superseded: 'replaced by a newer record', intentionally_removed: 'removed deliberately',
  no_longer_applicable: 'marked no longer applicable', parent_removed: 'its event/objective was removed',
  admissibility_changed: 'no longer shared with the organisation', unknown: 'reason not determined',
};

/* Toggle the "Why did this change?" panel for a moment — fetches the leader-safe
   explanation for that fingerprint on demand. */
async function omExplain(fingerprint, btn) {
  const panel = document.getElementById('om-exp-' + fingerprint);
  if (!panel) return;
  if (panel.dataset.open === '1') { panel.style.display = 'none'; panel.dataset.open = '0'; if (btn) btn.textContent = 'Why did this change?'; return; }
  panel.style.display = 'block'; panel.dataset.open = '1'; if (btn) btn.textContent = 'Hide explanation';
  panel.innerHTML = `<div style="font-size:0.76rem;color:var(--text-muted)">Explaining…</div>`;
  let x;
  try { const r = await fetch('/api/org-memory/moments/' + encodeURIComponent(fingerprint) + '/explain', { headers: Auth._headers() }); const j = await r.json(); x = j && j.explanation; }
  catch (_) { panel.innerHTML = `<div style="font-size:0.76rem;color:var(--text-muted)">Couldn't load the explanation.</div>`; return; }
  if (!x) { panel.innerHTML = `<div style="font-size:0.76rem;color:var(--text-muted)">No explanation is available for this moment.</div>`; return; }
  const trig = x.trigger ? `<div style="font-size:0.78rem"><strong>What happened:</strong> ${_escAdvisor(x.trigger)}.</div>` : '';
  const rules = x.rulesChanged ? `<div style="font-size:0.76rem;color:var(--text-muted);margin-top:0.2rem">IntelliQ's interpretation rules changed at this point, so it isn't directly comparable to earlier moments.</div>` : '';
  const trans = (x.transitions || []).map(t => {
    const dir = _MEM_DIR[t.direction] || _MEM_DIR.changed;
    const cause = _MEM_CAUSE[t.cause] || t.cause;
    const rem = t.removalReason ? ` — ${_escAdvisor(_MEM_REMOVAL[t.removalReason] || t.removalReason)}` : '';
    return `<li style="font-size:0.78rem;color:var(--text-secondary)"><span style="color:${dir.color}">${dir.glyph}</span> ${_escAdvisor(t.claim)} <span style="color:var(--text-muted)">(${_escAdvisor(cause)}${rem})</span></li>`;
  }).join('');
  const lims = (x.limitations || []).map(l => `<li style="font-size:0.72rem;color:var(--text-muted)">${_escAdvisor(l)}</li>`).join('');
  panel.innerHTML = `
    ${trig}${rules}
    ${trans ? `<div style="font-size:0.72rem;color:var(--text-muted);margin:0.35rem 0 0.1rem">Changes</div><ul style="margin:0 0 0 1rem;padding:0">${trans}</ul>` : ''}
    ${lims ? `<div style="font-size:0.72rem;color:var(--text-muted);margin:0.35rem 0 0.1rem">Limitations</div><ul style="margin:0 0 0 1rem;padding:0">${lims}</ul>` : ''}`;
}
async function renderOrgMemory() {
  const el = document.getElementById('org-memory-content');
  if (!el) return;
  el.innerHTML = `<div style="padding:1.5rem;text-align:center;color:var(--text-muted)">Reading your organisation's memory…</div>`;
  let d;
  try { const r = await fetch('/api/org-memory/timeline', { headers: Auth._headers() }); d = await r.json(); }
  catch (_) { el.innerHTML = `<div class="empty-state"><p>Couldn't load memory right now. <button class="btn btn-outline btn-sm" onclick="renderOrgMemory()">Try again</button></p></div>`; return; }

  if (!d || !d.entries || !d.entries.length) {
    el.innerHTML = `
      <div class="card" style="text-align:center;padding:2rem">
        <div style="font-size:0.9rem;color:var(--text-secondary);margin-bottom:0.9rem">Your organisation's memory begins the moment you confirm operating context or resolve a question. There's nothing recorded yet.</div>
        <button class="btn btn-accent btn-sm" onclick="navigate('operating-context')">Add operating context →</button>
      </div>`;
    return;
  }

  const s = d.summary || {};
  const stat = (n, label) => `<div style="text-align:center"><div style="font-size:1.15rem;font-weight:700">${n}</div><div style="font-size:0.68rem;color:var(--text-muted)">${label}</div></div>`;
  const fmt = t => t ? new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

  const changeLine = (l) => `<li style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:2px">${_escAdvisor(l)}</li>`;
  const transitionChip = (t) => {
    const dir = _MEM_DIR[t.direction] || _MEM_DIR.changed;
    return `<span style="display:inline-flex;align-items:center;gap:3px;font-size:0.7rem;color:${dir.color};border:1px solid ${dir.color};border-radius:10px;padding:1px 7px;margin:2px 3px 0 0"><span>${dir.glyph}</span>${_escAdvisor(String(t.claimType || '').replace(/_/g, ' '))}</span>`;
  };
  // A semantics-change moment is visually + verbally DISTINCT from a gain/slip: it is a
  // neutral note that IntelliQ's interpretation rules changed, never an org outcome.
  const rebaselineMoment = (e) => {
    const snap = e.snapshot || {};
    return `<div class="card" style="margin-bottom:0.75rem;border-left:3px solid var(--text-muted);opacity:0.92">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:0.5rem">
        <strong style="font-size:0.82rem;color:var(--text-muted)">IntelliQ's interpretation rules changed</strong>
        <span style="font-size:0.72rem;color:var(--text-muted)">${fmt(snap.at)}</span>
      </div>
      <div style="font-size:0.78rem;color:var(--text-secondary);margin-top:0.25rem">Moments before this point are not directly comparable to those after it. This is a change in how IntelliQ interprets information — not a change in the organisation.</div>
    </div>`;
  };
  const moment = (e) => {
    const ch = e.changed || {};
    if (ch.semanticsChanged) return rebaselineMoment(e);
    const snap = e.snapshot || {};
    const rst = _RD_STATE[snap.readinessStatus] || _RD_STATE.insufficient_information;
    const focusTitle = snap.focus ? (snap.focus.title || snap.focus.type || 'Current focus') : 'No confirmed focus';
    const lines = (ch.summary || []).map(changeLine).join('');
    const chips = (ch.claimTransitions || []).map(transitionChip).join('');
    const canExplain = snap.fingerprint && !ch.baseline;
    return `<div class="card" style="margin-bottom:0.75rem">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:0.5rem">
        <strong style="font-size:0.82rem">${_escAdvisor(focusTitle)}</strong>
        <span style="font-size:0.72rem;color:var(--text-muted)">${fmt(snap.at)}</span>
      </div>
      <div style="display:flex;align-items:center;gap:0.4rem;margin:0.3rem 0">
        <span style="width:8px;height:8px;border-radius:50%;background:${rst.color};display:inline-block"></span>
        <span style="font-size:0.74rem;color:${rst.color}">${rst.label}</span>
        ${ch.baseline ? '<span style="font-size:0.68rem;color:var(--text-muted)">· timeline begins here</span>' : ''}
      </div>
      ${lines ? `<ul style="margin:0.25rem 0 0.25rem 1rem;padding:0">${lines}</ul>` : ''}
      ${chips ? `<div style="margin-top:0.25rem">${chips}</div>` : ''}
      ${canExplain ? `<button class="btn-ghost btn-sm" style="font-size:0.72rem;margin-top:0.4rem" onclick="omExplain('${_escAdvisor(snap.fingerprint)}', this)">Why did this change?</button>
      <div id="om-exp-${_escAdvisor(snap.fingerprint)}" data-open="0" style="display:none;margin-top:0.4rem;padding:0.5rem;border-left:2px solid var(--border);background:var(--surface-alt,rgba(127,127,127,0.06))"></div>` : ''}
    </div>`;
  };

  el.innerHTML = `
    <div class="card" style="margin-bottom:1rem">
      <div class="card-label" style="margin-bottom:0.5rem">Over ${s.count || d.entries.length} recorded moment${(s.count || d.entries.length) === 1 ? '' : 's'}${s.spanFrom ? ` since ${fmt(s.spanFrom)}` : ''}</div>
      <div style="display:flex;justify-content:space-around;gap:0.5rem;flex-wrap:wrap">
        ${stat(s.readinessImprovements || 0, 'readiness gains')}
        ${stat(s.readinessRegressions || 0, 'readiness slips')}
        ${stat(s.claimsResolved || 0, 'things resolved')}
        ${stat(s.claimsLapsed || 0, 'things lapsed')}
        ${s.rebaselines ? stat(s.rebaselines, 'rule changes') : ''}
      </div>
    </div>
    ${d.entries.map(moment).join('')}`;
}

/* ── Observed over time — longitudinal OBSERVATIONS (Phase B1: history, not advice).
   Reads /api/org-learning/observations. Each card is a neutral description of something
   that recurred, with occurrence count, time range, and whether contradictory history
   exists. NEVER ranked positive/negative, never causal, never about an individual. */
const _OBS_TYPE_LABEL = {
  repeated_transition: 'Repeated change', repeated_cause: 'Repeated cause',
  transition_sequence: 'Recurring sequence', recurring_requirement_type: 'Recurring requirement',
  readiness_co_occurrence: 'Co-occurrence', stable_non_change: 'Unchanged over time',
};
async function renderObservations() {
  const el = document.getElementById('org-learning-content');
  if (!el) return;
  el.innerHTML = `<div style="padding:1.5rem;text-align:center;color:var(--text-muted)">Reviewing your recorded history…</div>`;
  let d;
  try { const r = await fetch('/api/org-learning/observations', { headers: Auth._headers() }); d = await r.json(); }
  catch (_) { el.innerHTML = `<div class="empty-state"><p>Couldn't load observations right now. <button class="btn btn-outline btn-sm" onclick="renderObservations()">Try again</button></p></div>`; return; }

  const note = `<div class="card" style="margin-bottom:1rem;background:var(--surface-alt,rgba(127,127,127,0.06))">
    <div style="font-size:0.8rem;color:var(--text-secondary)">These are descriptions of repeated history — <strong>not recommendations, predictions, or proof of cause</strong>. They describe what recurred, never why, and never rank anything as good or bad.</div></div>`;

  if (!d || !d.observations || !d.observations.length) {
    el.innerHTML = note + `<div class="card" style="text-align:center;padding:2rem">
      <div style="font-size:0.9rem;color:var(--text-secondary)">Nothing has recurred often enough yet to describe. As your organisation's history grows, repeated patterns will appear here.</div></div>`;
    return;
  }

  const fmt = t => t ? new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
  const card = (o) => {
    const type = _OBS_TYPE_LABEL[o.type] || 'Observation';
    const range = o.firstObservedAt && o.lastObservedAt ? `${fmt(o.firstObservedAt)} – ${fmt(o.lastObservedAt)}` : '';
    const contra = (o.contradictions || []).map(c => `<li style="font-size:0.74rem;color:var(--text-secondary)">${_escAdvisor(c)}</li>`).join('');
    const lims = (o.limitations || []).map(l => `<li style="font-size:0.72rem;color:var(--text-muted)">${_escAdvisor(l)}</li>`).join('');
    return `<div class="card" style="margin-bottom:0.75rem">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:0.5rem">
        <span style="font-size:0.66rem;text-transform:uppercase;letter-spacing:0.04em;color:var(--text-muted)">${_escAdvisor(type)}</span>
        <span style="font-size:0.72rem;color:var(--text-muted)">${range}</span>
      </div>
      <div style="font-size:0.88rem;color:var(--text-primary);margin:0.3rem 0">${_escAdvisor(o.summary)}</div>
      <div style="font-size:0.72rem;color:var(--text-muted)">${o.occurrenceCount} occurrence${o.occurrenceCount === 1 ? '' : 's'}${o.distinctEvents ? ` · ${o.distinctEvents} event${o.distinctEvents === 1 ? '' : 's'}` : ''}</div>
      ${contra ? `<div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.4rem">Also in the history</div><ul style="margin:0.1rem 0 0 1rem;padding:0">${contra}</ul>` : ''}
      ${lims ? `<div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.3rem">Limitations</div><ul style="margin:0.1rem 0 0 1rem;padding:0">${lims}</ul>` : ''}
      <div style="display:flex;gap:0.5rem;margin-top:0.5rem">
        <button class="btn-ghost btn-sm" style="font-size:0.72rem" onclick="navigate('org-memory')">View history</button>
        <button class="btn-ghost btn-sm" style="font-size:0.72rem" onclick="obsDismiss('${_escAdvisor(o.fingerprint)}', this)">Dismiss</button>
      </div>
    </div>`;
  };
  el.innerHTML = note + d.observations.map(card).join('');
}

/* Dismiss an observation — feedback on the analytical artifact only (never deletes
   history, never changes the projection, never means it is objectively false). */
async function obsDismiss(fingerprint, btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Dismissing…'; }
  try {
    const r = await fetch('/api/org-learning/observations/' + encodeURIComponent(fingerprint) + '/dismiss', { method: 'POST', headers: Auth._headers() });
    const j = await r.json();
    if (!j.ok) throw new Error('dismiss failed');
    if (typeof showToast === 'function') showToast('Dismissed. This won’t resurface; new history can still create a fresh observation.', 'info');
    renderObservations();
  } catch (e) { if (btn) { btn.disabled = false; btn.textContent = 'Dismiss'; } if (typeof showToast === 'function') showToast('Could not dismiss right now.', 'error'); }
}

/* ── Playbook — the GOVERNED practices surface (Phase B2). Shows what the team has
   CONFIRMED as how it operates, and PROPOSED patterns (weighed for and against, with a
   confidence band) for the leader to confirm or set aside. The system never endorses:
   confirmation is always the human's. No causal or "you should" language. */
const _CONF_TONE = { 'Well supported': 'var(--success)', 'Supported': 'var(--accent)', 'Emerging': 'var(--text-muted)' };
async function renderPlaybook() {
  const el = document.getElementById('org-playbook-content');
  if (!el) return;
  el.innerHTML = `<div style="padding:1.5rem;text-align:center;color:var(--text-muted)">Reviewing your team's practices…</div>`;
  let confirmed, proposed;
  try {
    const [a, b] = await Promise.all([
      fetch('/api/org-playbook', { headers: Auth._headers() }).then(r => r.json()),
      fetch('/api/org-playbook/candidates', { headers: Auth._headers() }).then(r => r.json()),
    ]);
    confirmed = (a && a.entries) || []; proposed = (b && b.candidates) || [];
  } catch (_) { el.innerHTML = `<div class="empty-state"><p>Couldn't load the playbook right now. <button class="btn btn-outline btn-sm" onclick="renderPlaybook()">Try again</button></p></div>`; return; }

  const fmt = t => t ? new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const confChip = (label) => `<span style="font-size:0.66rem;font-family:inherit;padding:.15rem .5rem;border-radius:20px;border:1px solid ${_CONF_TONE[label] || 'var(--text-muted)'};color:${_CONF_TONE[label] || 'var(--text-muted)'}">${_escAdvisor(label)}</span>`;
  const counter = (ce) => `<span style="color:var(--success)">${ce.supporting} for</span> · <span style="color:${ce.contradicting ? 'var(--danger)' : 'var(--text-muted)'}">${ce.contradicting} against</span>`;

  // Confirmed practices (what the team has agreed), each re-checked against current history.
  const _REV_TONE = { holding: 'var(--success)', contested: 'var(--warning)', unsupported: 'var(--text-muted)' };
  const entryCard = (e) => {
    const rev = e.review || { status: 'holding', label: 'Still holding' };
    const tone = _REV_TONE[rev.status] || 'var(--text-muted)';
    const contested = rev.status !== 'holding';
    return `<div class="card" style="margin-bottom:0.6rem;border-left:3px solid ${tone}">
      <div style="display:flex;justify-content:space-between;gap:0.5rem;align-items:baseline">
        <span style="font-size:0.62rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted)">Confirmed ${fmt(e.confirmedAt)}</span>
        <span style="font-size:0.66rem;padding:.15rem .5rem;border-radius:20px;border:1px solid ${tone};color:${tone}">${_escAdvisor(rev.label)}</span>
      </div>
      <div style="font-size:0.9rem;margin:0.3rem 0">${_escAdvisor(e.statement)}</div>
      <div style="font-size:0.72rem;color:var(--text-muted)">Evidence at confirmation: ${counter(e.counterEvidence)}</div>
      ${contested ? `<div style="font-size:0.74rem;color:var(--text-secondary);margin-top:0.4rem">${_escAdvisor(rev.reason || '')}</div>` : ''}
      <div style="display:flex;gap:0.5rem;margin-top:0.5rem">
        <button class="btn-ghost btn-sm" style="font-size:0.72rem;color:${contested ? 'var(--danger)' : 'var(--text-muted)'}" onclick="pbRetire('${_escAdvisor(e.fingerprint)}', this)">Retire this practice</button>
      </div>
    </div>`;
  };

  // Proposed practices (for review) — counter-evidence + limitations shown before any action.
  const candCard = (c) => {
    const sigs = (c.counterEvidence.signals || []).map(s => `<li style="font-size:0.74rem;color:var(--text-secondary)">${_escAdvisor(s)}</li>`).join('');
    const lims = (c.limitations || []).map(l => `<li style="font-size:0.72rem;color:var(--text-muted)">${_escAdvisor(l)}</li>`).join('');
    return `<div class="card" style="margin-bottom:0.6rem">
      <div style="display:flex;justify-content:space-between;gap:0.5rem;align-items:baseline">
        <span style="font-size:0.62rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted)">Proposed pattern</span>
        ${confChip(c.confidenceLabel)}
      </div>
      <div style="font-size:0.9rem;margin:0.3rem 0">${_escAdvisor(c.statement)}</div>
      <div style="font-size:0.74rem;color:var(--text-muted)">Weighed: ${counter(c.counterEvidence)}${c.distinctEvents ? ` · across ${c.distinctEvents} event${c.distinctEvents === 1 ? '' : 's'}` : ''}</div>
      ${sigs ? `<div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.4rem">What argues against it</div><ul style="margin:0.1rem 0 0 1rem;padding:0">${sigs}</ul>` : ''}
      ${lims ? `<div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.3rem">Limitations</div><ul style="margin:0.1rem 0 0 1rem;padding:0">${lims}</ul>` : ''}
      <div style="display:flex;gap:0.5rem;margin-top:0.6rem">
        <button class="btn btn-accent btn-sm" style="font-size:0.74rem" onclick="pbConfirm('${_escAdvisor(c.fingerprint)}', this)">Recognise as how we operate</button>
        <button class="btn-ghost btn-sm" style="font-size:0.74rem" onclick="pbDismiss('${_escAdvisor(c.fingerprint)}', this)">Set aside</button>
      </div>
    </div>`;
  };

  el.innerHTML = `
    <div class="card" style="margin-bottom:1rem;background:var(--surface-alt,rgba(127,127,127,0.06))">
      <div style="font-size:0.8rem;color:var(--text-secondary)">A pattern only becomes part of your playbook when <strong>you confirm it</strong>. IntelliQ surfaces what recurred and what argues against it — it never decides, recommends, or claims cause.</div>
    </div>
    <div class="card-label" style="margin:0 0 0.5rem">Your playbook — agreed practices</div>
    ${confirmed.length ? confirmed.map(entryCard).join('') : '<div class="card" style="padding:1.2rem;color:var(--text-muted);font-size:0.85rem">Nothing confirmed yet. Confirmed practices will appear here.</div>'}
    <div class="card-label" style="margin:1.4rem 0 0.5rem">Proposed for review</div>
    ${proposed.length ? proposed.map(candCard).join('') : '<div class="card" style="padding:1.2rem;color:var(--text-muted);font-size:0.85rem">No patterns are strong enough to propose yet. As history builds, proposals will appear here for you to review.</div>'}`;
}

/* Confirm a proposed practice into the playbook — the ONLY path to team knowledge. */
async function pbConfirm(fingerprint, btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Confirming…'; }
  try {
    const r = await fetch('/api/org-playbook/candidates/' + encodeURIComponent(fingerprint) + '/confirm', { method: 'POST', headers: Auth._headers() });
    const j = await r.json();
    if (!j.ok) throw new Error('confirm failed');
    if (typeof showToast === 'function') showToast('Added to your playbook.', 'success');
    renderPlaybook();
  } catch (e) { if (btn) { btn.disabled = false; btn.textContent = 'Recognise as how we operate'; } if (typeof showToast === 'function') showToast('Could not confirm right now.', 'error'); }
}
/* Set a proposal aside — suppresses this exact candidate; new evidence can re-propose later. */
async function pbDismiss(fingerprint, btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Setting aside…'; }
  try {
    const r = await fetch('/api/org-playbook/candidates/' + encodeURIComponent(fingerprint) + '/dismiss', { method: 'POST', headers: Auth._headers() });
    const j = await r.json();
    if (!j.ok) throw new Error('dismiss failed');
    if (typeof showToast === 'function') showToast('Set aside.', 'info');
    renderPlaybook();
  } catch (e) { if (btn) { btn.disabled = false; btn.textContent = 'Set aside'; } if (typeof showToast === 'function') showToast('Could not set aside right now.', 'error'); }
}
/* Retire a confirmed practice — governed lifecycle (active → retired); never automatic. */
async function pbRetire(fingerprint, btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Retiring…'; }
  try {
    const r = await fetch('/api/org-playbook/' + encodeURIComponent(fingerprint) + '/retire', { method: 'POST', headers: Auth._headers() });
    const j = await r.json();
    if (!j.ok) throw new Error('retire failed');
    if (typeof showToast === 'function') showToast('Retired. It stays in history and can be re-proposed if it recurs.', 'info');
    renderPlaybook();
  } catch (e) { if (btn) { btn.disabled = false; btn.textContent = 'Retire this practice'; } if (typeof showToast === 'function') showToast('Could not retire right now.', 'error'); }
}

/* ── Operating context — how the team operates (governed intake) ──────────────
   Leaders describe their operation in plain words (or a quick form); IntelliQ
   extracts PROPOSED records and shows a confirmation preview. Nothing becomes a rule
   until confirmed. Reuses /api/org-context/{preview,confirm,retire} — one boundary. */
let _ocProposals = null;

async function renderOperatingContext() {
  const el = document.getElementById('operating-context-content');
  if (!el) return;
  el.innerHTML = `
    <div class="card" style="margin-bottom:1rem">
      <div class="card-label" style="margin-bottom:0.5rem">Describe how your team operates</div>
      <div style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:0.6rem">
        For example: “We play Saturday at 3pm. The head coach owns the game plan, and it must be ready 24 hours before kickoff.”
        IntelliQ turns this into events, ownership, and preparation it can reason about — you confirm before anything is saved.
      </div>
      <textarea id="oc-text" class="search-input" rows="3" placeholder="Describe an event, who owns what, or what must be ready beforehand…"
        style="width:100%;resize:vertical;font-family:inherit;line-height:1.5"></textarea>
      <div style="margin-top:0.6rem"><button class="btn btn-accent btn-sm" onclick="ocPreview(this)">Preview</button></div>
      <div id="oc-preview" style="margin-top:0.7rem"></div>
    </div>

    <div class="card">
      <div class="card-label" style="margin-bottom:0.6rem">What IntelliQ understands about your operation</div>
      <div id="oc-records"><div style="color:var(--text-muted);font-size:0.82rem">Loading…</div></div>
    </div>`;
  _ocLoadRecords();
}

async function _ocLoadRecords() {
  const el = document.getElementById('oc-records');
  if (!el) return;
  try {
    const r = await fetch('/api/org-context', { headers: Auth._headers() });
    const d = r.ok ? await r.json() : { records: [] };
    const list = d.records || [];
    if (!list.length) { el.innerHTML = `<div style="color:var(--text-muted);font-size:0.82rem">Nothing yet. Describe an event or a responsibility above — even one is enough for IntelliQ to spot when preparation is missing.</div>`; return; }
    const label = r => {
      const f = r.fields || {};
      if (r.type === 'event') return `${_escAdvisor(f.title || f.type || 'Event')}${f.startAt ? ' · ' + new Date(f.startAt).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : ''}`;
      if (r.type === 'responsibility') return `${_escAdvisor(f.role || f.subject || 'Owner')} owns ${_escAdvisor((f.claimTypes || []).join(', ').replace(/_/g, ' '))}`;
      if (r.type === 'requirement') return `${_escAdvisor((f.claimType || '').replace(/_/g, ' '))} required before the event`;
      if (r.type === 'rhythm') return `${_escAdvisor(f.process || 'Recurring')}${f.expectedOutput ? ' → ' + _escAdvisor(f.expectedOutput) : ''}`;
      if (r.type === 'dependency') return `${_escAdvisor((f.upstream || '').replace(/_/g, ' '))} before ${_escAdvisor((f.downstream || '').replace(/_/g, ' '))}`;
      return _escAdvisor(r.type);
    };
    el.innerHTML = list.map(r => `
      <div class="ds-recent-row">
        <div class="ds-recent-main"><span class="ds-recent-snip">${label(r)}</span></div>
        <div class="ds-recent-meta">${r.authority === 'organisation' ? 'Organisation record' : 'Unverified'} · <a href="#" onclick="ocRetire('${r.id}', event)" style="color:var(--danger)">remove</a></div>
      </div>`).join('');
  } catch (_) { el.innerHTML = `<div style="color:var(--text-muted);font-size:0.82rem">Could not load.</div>`; }
}

async function ocPreview(btn) {
  const text = (document.getElementById('oc-text')?.value || '').trim();
  const box = document.getElementById('oc-preview');
  if (!text) { if (box) box.innerHTML = `<div style="font-size:0.8rem;color:var(--text-muted)">Describe something first.</div>`; return; }
  if (btn) btn.disabled = true;
  try {
    const r = await fetch('/api/org-context/preview', { method: 'POST', headers: Auth._headers(), body: JSON.stringify({ text }) });
    const d = await r.json();
    if (d.blocked) { if (box) box.innerHTML = `<div style="font-size:0.82rem;color:var(--danger)">${_escAdvisor(d.message || 'That can’t become an operating rule.')}</div>`; return; }
    if (!d.proposals || !d.proposals.length) { if (box) box.innerHTML = `<div style="font-size:0.82rem;color:var(--text-muted)">I couldn’t spot an event, owner, or requirement in that. Try naming a day/time, who owns something, or what must be ready beforehand.</div>`; return; }
    _ocProposals = d.proposals;
    const lines = (d.preview?.lines || []).map(l => `<li>${_escAdvisor(l)}</li>`).join('');
    const effects = (d.preview?.effects || []).map(e => `<div style="font-size:0.76rem;color:var(--text-secondary)">• ${_escAdvisor(e)}</div>`).join('');
    const warns = (d.warnings || []).map(w => `<div style="font-size:0.74rem;color:var(--warning)">${_escAdvisor(w.message)}</div>`).join('');
    if (box) box.innerHTML = `
      <div class="card" style="background:var(--surface-2);border-color:var(--accent)">
        <div class="card-label" style="margin-bottom:0.4rem">Save these operating rules?</div>
        <ul style="margin:0 0 0.5rem 1rem;font-size:0.84rem">${lines}</ul>
        ${effects}${warns}
        <div style="font-size:0.72rem;color:var(--text-muted);margin:0.4rem 0">Authority: ${d.preview?.authority === 'organisation' ? 'organisation operating record' : 'shared — not yet verified'}</div>
        <div style="display:flex;gap:0.5rem;margin-top:0.5rem">
          <button class="btn btn-accent btn-sm" onclick="ocConfirm(this)">Confirm</button>
          <button class="btn-ghost btn-sm" onclick="document.getElementById('oc-preview').innerHTML=''">Cancel</button>
        </div>
      </div>`;
  } catch (e) { if (box) box.innerHTML = `<div style="font-size:0.82rem;color:var(--danger)">Could not preview.</div>`; }
  finally { if (btn) btn.disabled = false; }
}

async function ocConfirm(btn) {
  if (!_ocProposals) return;
  if (btn) btn.disabled = true;
  try {
    const r = await fetch('/api/org-context/confirm', { method: 'POST', headers: Auth._headers(), body: JSON.stringify({ records: _ocProposals, source: 'conversation' }) });
    const d = await r.json();
    const box = document.getElementById('oc-preview');
    if (!d.ok || !(d.created || []).length) { if (box) box.innerHTML = `<div style="font-size:0.82rem;color:var(--danger)">Couldn’t save${(d.rejected || []).length ? ' — ' + _escAdvisor((d.rejected[0].errors || [{}])[0].message || 'validation failed') : ''}.</div>`; return; }
    _ocProposals = null;
    const eff = (d.effects || []).map(e => `<div style="font-size:0.76rem;color:var(--text-secondary)">• ${_escAdvisor(e)}</div>`).join('');
    if (box) box.innerHTML = `<div style="font-size:0.84rem;color:var(--success)">Saved ${d.created.length} record${d.created.length !== 1 ? 's' : ''}. What IntelliQ can now do:</div>${eff}`;
    const ta = document.getElementById('oc-text'); if (ta) ta.value = '';
    _ocLoadRecords();
  } catch (e) { showToast('Could not save', 'error'); }
  finally { if (btn) btn.disabled = false; }
}

async function ocRetire(id, ev) {
  if (ev && ev.preventDefault) ev.preventDefault();
  if (!confirm('Remove this from what IntelliQ understands? It stays in history but stops affecting readiness.')) return;
  try {
    const r = await fetch('/api/org-context/' + encodeURIComponent(id) + '/retire', { method: 'POST', headers: Auth._headers(), body: JSON.stringify({}) });
    if (!r.ok) throw new Error();
    _ocLoadRecords();
  } catch (_) { showToast('Could not remove', 'error'); }
}

/* ── Knowledge intake — the ONE governed input door ───────────────────────────
   Paste text or upload a file (txt · md · csv · json · pdf · docx). Everything
   flows through the single canonical door (/api/evidence/import → _ingestArtifact),
   becomes canonical evidence, and is immediately answerable by the grounded
   assistant — the SAME retrieval the member Home uses. Private by default; sharing
   with the team is an explicit choice. No second import path, no per-feature logic. */

/* Map a filename to one of the intake formats the canonical door accepts. */
function _knowledgeFormat(name) {
  const ext = String(name || '').toLowerCase().split('.').pop();
  if (ext === 'csv')  return 'csv';
  if (ext === 'json') return 'json';
  if (ext === 'md' || ext === 'markdown') return 'markdown';
  if (ext === 'pdf')  return 'pdf';
  if (ext === 'doc' || ext === 'docx') return 'docx';
  return 'text';
}

async function renderDataSources() {
  const el = document.getElementById('data-sources-content');
  if (!el) return;
  const connectCard = (icon, name, note) => `
    <div class="ds-connect">
      <div class="ds-connect-top"><span class="ds-connect-icon">${icon}</span><span class="ds-connect-name">${name}</span></div>
      <div class="ds-connect-note">${note}</div>
      <button class="btn btn-outline btn-sm" onclick="showToast('${name} connector is coming — it will flow into this same knowledge base.','info')">Connect</button>
    </div>`;

  el.innerHTML = `
    <div class="card" style="margin-bottom:1rem">
      <div class="card-label" style="margin-bottom:0.5rem">Teach IntelliQ something</div>
      <div style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:0.7rem">
        Paste notes, policies, tactics, meeting minutes — anything true and useful. IntelliQ turns it into
        evidence it can cite when you ask a question. It never guesses; it only answers from what it's been given.
      </div>
      <textarea id="kn-text" class="search-input" rows="5" placeholder="Paste text here — a policy, a play, a process, a set of notes…"
        style="width:100%;resize:vertical;font-family:inherit;line-height:1.5"></textarea>
      <div class="ds-upload-row" style="margin-top:0.6rem">
        <input id="kn-name" class="search-input" style="max-width:240px" placeholder="Name it (e.g. Staff Handbook)">
        <select class="search-input" id="kn-format" style="max-width:150px" title="How to read the pasted text">
          <option value="text">Plain text</option>
          <option value="markdown">Markdown</option>
          <option value="csv">CSV (rows)</option>
          <option value="json">JSON</option>
        </select>
        <select class="search-input" id="kn-visibility" style="max-width:200px">
          <option value="private">Private to me</option>
          <option value="normal">Share with the team</option>
        </select>
        <button class="btn btn-accent btn-sm" onclick="addKnowledgeText(this)">Add to IntelliQ</button>
      </div>
      <div style="display:flex;align-items:center;gap:0.6rem;margin-top:0.7rem;flex-wrap:wrap">
        <label class="btn btn-outline btn-sm" style="cursor:pointer">
          ＋ Upload a file
          <input type="file" id="kn-file" style="display:none"
            accept=".txt,.md,.markdown,.csv,.json,.pdf,.doc,.docx"
            onchange="uploadKnowledgeFile(this)">
        </label>
        <span style="font-size:0.72rem;color:var(--text-muted)">txt · md · csv · json · pdf · docx — uploads use the visibility selected above.</span>
      </div>
      <div id="kn-result" style="font-size:0.8rem;margin-top:0.6rem"></div>
    </div>

    <div class="card" style="margin-bottom:1rem">
      <div class="card-label" style="margin-bottom:0.6rem">Connect a source <span style="font-weight:400;color:var(--text-muted);font-size:0.72rem">(coming soon)</span></div>
      <div class="ds-connect-grid">
        ${connectCard('', 'Microsoft Teams', 'Meeting notes & shared docs.')}
        ${connectCard('', 'Google Workspace', 'Docs, sheets & calendar.')}
        ${connectCard('', 'Notion / Confluence', 'Your team wiki & handbooks.')}
      </div>
      <div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.6rem">Connectors will land in <strong>this same knowledge base</strong> — one governed door, with your admin's consent.</div>
    </div>

    <div class="card">
      <div class="card-label" style="margin-bottom:0.6rem">What IntelliQ can use</div>
      <div id="kn-coverage"><div style="color:var(--text-muted);font-size:0.82rem">Loading…</div></div>
    </div>`;

  _loadKnowledgeCoverage();
}

/* The transparency + management view: every import THIS user can see (their own +
   org-shared), grouped, with a one-tap remove. Drives home "IntelliQ only knows
   what you've told it" — the trust surface behind the grounded assistant. */
async function _loadKnowledgeCoverage() {
  const el = document.getElementById('kn-coverage');
  if (!el) return;
  try {
    const r = await fetch('/api/evidence/imports', { headers: Auth._headers() });
    const d = r.ok ? await r.json() : { imports: [] };
    const list = d.imports || [];
    if (!list.length) { el.innerHTML = `<div style="color:var(--text-muted);font-size:0.82rem">Nothing yet. Paste some text or upload a file above — then ask the assistant about it.</div>`; return; }
    el.innerHTML = `
      <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:0.6rem">${d.totalUnits} item${d.totalUnits !== 1 ? 's' : ''} across ${list.length} source${list.length !== 1 ? 's' : ''} — the assistant can cite any of these.</div>
      ${list.map(g => {
        const cats = Object.keys(g.categories || {}).sort((a, b) => g.categories[b] - g.categories[a]).slice(0, 3).join(' · ');
        const when = g.importTime ? new Date(g.importTime).toLocaleDateString() : '';
        return `
        <div class="ds-recent-row">
          <div class="ds-recent-main">
            <span class="ds-recent-src">${_escAdvisor(g.sourceName)}</span>
            <span class="ds-recent-snip">${g.units} item${g.units !== 1 ? 's' : ''}${cats ? ' · ' + _escAdvisor(cats) : ''}</span>
          </div>
          <div class="ds-recent-meta">
            <span title="${g.visibility === 'normal' ? 'Shared with the team' : 'Private to you'}">${g.visibility === 'normal' ? 'Shared' : 'Private'}</span>${when ? ' · ' + when : ''}
            ${g.owned ? ` · <a href="#" onclick="deleteKnowledge('${g.importId}', event)" style="color:var(--danger)">remove</a>` : ''}
          </div>
        </div>`; }).join('')}`;
  } catch (_) {
    el.innerHTML = `<div style="color:var(--text-muted);font-size:0.82rem">Could not load.</div>`;
  }
}

/* Send content through the ONE canonical door. Handles the visibility-increase
   confirmation the server requires when a user shares with the team. */
async function _postKnowledge({ format, content, sourceName, visibility }, resEl, doneMsg) {
  const body = { format, content, sourceName, visibility };
  if (visibility === 'normal') body.confirmVisibilityIncrease = true;   // the UI choice IS the explicit confirmation
  const r = await fetch('/api/evidence/import', { method: 'POST', headers: Auth._headers(), body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.ok === false) throw new Error(d.error === 'unsupported_format' ? 'That file type isn’t supported yet.' : (d.error || 'Import failed'));
  if (resEl) {
    const parts = [];
    if (d.imported)   parts.push(`Added ${d.imported} item${d.imported !== 1 ? 's' : ''}`);
    if (d.duplicates) parts.push(`${d.duplicates} already known`);
    if (d.identityMatches) parts.push(`${d.identityMatches} matched to a person`);
    resEl.style.color = d.imported ? 'var(--success)' : 'var(--text-muted)';
    resEl.textContent = (parts.join(' · ') || doneMsg) + (d.imported ? ' — ask the assistant about it now.' : '');
  }
  _loadKnowledgeCoverage();
  return d;
}

async function addKnowledgeText(btn) {
  const ta   = document.getElementById('kn-text');
  const res  = document.getElementById('kn-result');
  const text = (ta?.value || '').trim();
  if (!text) { if (res) { res.style.color = 'var(--text-muted)'; res.textContent = 'Paste some text first.'; } return; }
  const sourceName = (document.getElementById('kn-name')?.value || '').trim() || 'Pasted note';
  const format     = document.getElementById('kn-format')?.value || 'text';
  const visibility  = document.getElementById('kn-visibility')?.value || 'private';
  if (btn) btn.disabled = true;
  if (res) { res.style.color = 'var(--text-muted)'; res.textContent = 'Adding…'; }
  try {
    await _postKnowledge({ format, content: text, sourceName, visibility }, res, 'Nothing new to add');
    if (ta) ta.value = ''; const nm = document.getElementById('kn-name'); if (nm) nm.value = '';
  } catch (err) {
    if (res) { res.style.color = 'var(--danger)'; res.textContent = err.message; }
  } finally { if (btn) btn.disabled = false; }
}

async function uploadKnowledgeFile(input) {
  const file = input.files && input.files[0];
  const res  = document.getElementById('kn-result');
  if (!file) return;
  if (typeof AttachmentHandler === 'undefined') { if (res) { res.style.color = 'var(--danger)'; res.textContent = 'Uploader not available.'; } return; }
  const format     = _knowledgeFormat(file.name);
  const visibility = document.getElementById('kn-visibility')?.value || 'private';
  if (res) { res.style.color = 'var(--text-muted)'; res.textContent = `Reading ${file.name}…`; }
  try {
    const parsed  = await AttachmentHandler.process(file);
    const content = parsed.content || parsed.summary || '';
    if (!String(content).trim()) throw new Error('Could not read any text from that file.');
    await _postKnowledge({ format, content: String(content), sourceName: file.name, visibility }, res, 'Nothing new to add');
    input.value = '';
  } catch (err) {
    if (res) { res.style.color = 'var(--danger)'; res.textContent = err.message; }
  }
}

async function deleteKnowledge(importId, ev) {
  if (ev && ev.preventDefault) ev.preventDefault();
  if (!confirm('Remove this from what IntelliQ can use? It will stop citing it immediately.')) return;
  try {
    const r = await fetch('/api/evidence/import/' + encodeURIComponent(importId), { method: 'DELETE', headers: Auth._headers() });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.ok === false) throw new Error(d.error || 'Could not remove');
    _loadKnowledgeCoverage();
  } catch (err) { showToast(err.message, 'error'); }
}

/* ════════════════════════════════════════════════════════════
   LEADER WORKSPACE
   Pages scoped to a node-leader's subtree.
   All data comes from /api/workspace/* which gates via
   getVisibleUserIds() — the server enforces the scope.
   ════════════════════════════════════════════════════════════ */

/* ── Leader Dashboard ────────────────────────────────────── *
 * Answers: "Who needs my attention right now?"
 * ── ────────────────────────────────────────────────────── */
/* ── PLATFORM INTELLIGENCE — the one consolidated leader surface ───────────────
   Briefing = main entry. Renders who-needs-attention + why-now + evidence +
   recommended action + the intervention loop (act → outcome → learning). Folds
   the old Group Health / Org Health / Intelligence pages into one rollup strip.
   Reuses the existing page-leader-home container. Private detail never shown. */
const _INTEL_SEV = { high: '#f74f4f', medium: '#f7a84f', low: '#4f8ef7' };

/* Adaptive display language. The kernel stores universal primitives; the UI shows
   them in the org's own words (player/student/team-member…). `_VOCAB` is seeded
   with the universal defaults and REPLACED by the org's resolved domain vocabulary
   from /api/auth/me (see applyDomainVocab). An org's custom words win — never a
   fixed industry bucket. */
let _VOCAB = { members: 'people', member: 'person', people: 'people' };
function _v(key) { return _VOCAB[key] || key; }
/* Load the org's resolved domain vocabulary. Keeps the universal defaults for any
   key the pack doesn't override, so the UI never shows a blank noun. */
function applyDomainVocab(domain) {
  if (!domain || !domain.vocab) return;
  _VOCAB = { members: 'people', member: 'person', people: 'people', ...domain.vocab };
}
const _TRAJ_WORD = { converging:'climbing', sustaining:'steady', up:'climbing', flat:'steady',
  down:'dipping', diverging:'drifting', stalled:'stalled', unanchored:'finding footing', unknown:'building' };
const _trajWord = t => _TRAJ_WORD[t] || 'building';

/* ── HOW WE OPERATE — one hub that unifies the four org-knowledge surfaces (context,
   playbook, patterns, history) that used to be four separate nav items. Reuses each
   existing page via navigate(); one clear place instead of a scattered list. */
function renderOperate() {
  const el = document.getElementById('operate-content');
  if (!el) return;
  const card = (title, desc, dest) => `<button class="operate-card" style="display:flex;width:100%;text-align:left;gap:0.8rem;align-items:center;padding:1rem;margin-bottom:0.7rem;border:1px solid var(--line,rgba(127,127,127,0.16));border-radius:12px;background:var(--surface,rgba(127,127,127,0.03));cursor:pointer" onclick="navigate('${dest}')">
    <span style="flex:1"><span style="display:block;font-weight:600;font-size:0.95rem;color:var(--text-primary)">${title}</span><span style="display:block;font-size:0.8rem;color:var(--text-muted);margin-top:2px">${desc}</span></span>
    <span style="color:var(--text-muted)">→</span></button>`;
  el.innerHTML =
    card('How we work', 'The events, ownership, and preparation IntelliQ reasons from. Set it up or update it.', 'operating-context') +
    card('Playbook', 'Ways your team has agreed it operates — and patterns proposed for you to confirm.', 'org-playbook') +
    card('Patterns', 'What has recurred in your history — descriptions, never advice or predictions.', 'org-learning') +
    card('History', 'How your readiness has changed over time, and exactly why.', 'org-memory');
}

/* ── TODAY — the interactive leader home. Not a board: a conversational composer plus a
   LIVE, ACTIONABLE feed assembled from everything the backend already knows (readiness,
   routing, playbook proposals, what-changed). Every item is something you DO inline —
   answer, review, open — not just read. Renders into the shared leader-home container. */
async function renderToday() {
  const el = document.getElementById('ldr-home-content');
  const title = document.getElementById('ldr-home-title');
  const sub = document.getElementById('ldr-home-sub');
  if (!el) return;
  if (title) title.textContent = 'Today';
  if (sub) sub.textContent = 'Ask, decide, and see what needs you — in one place.';
  const chips = ['What is outstanding?', 'Who owns what?', 'Are we ready?', 'What changed?'];
  el.innerHTML = `
    <div class="tdy-composer">
      <div class="tdy-chathead">
        <button class="tdy-headbtn" onclick="todayNewChat()" title="Start a new conversation">＋ New</button>
        <button class="tdy-headbtn" onclick="todayHistoryOpen()" title="Your past conversations">History</button>
        <button class="tdy-headbtn" onclick="todaySaveChatToLibrary()" title="Save this conversation to your Library">Save</button>
        <button class="tdy-headbtn" onclick="todayLibraryOpen()" title="Your Library — folders, notes, saved chats">Library</button>
      </div>
      <div id="today-history" class="tdy-history" style="display:none"></div>
      <div id="today-thread" class="tdy-thread"></div>
      <div class="tdy-inputrow">
        <input id="today-ask" placeholder="Ask me anything — or just tell me how it's going…" onkeydown="if(event.key==='Enter')todayAsk()">
        <button class="tdy-send" onclick="todayAsk()" aria-label="Send">↑</button>
      </div>
      <div id="today-ask-out"></div>
      <div class="tdy-chips">
        ${chips.map(c => `<button class="tdy-cbtn" onclick="todayQuick('${c}')">${c}</button>`).join('')}
      </div>
      <div class="tdy-privacy">Private &amp; yours · history is only visible to you · nothing informs the org until you confirm</div>
    </div>
    <!-- THE OPEN QUESTION AND THE GROUP, ON HOME.

         These were built onto renderIntelligence, which is the separate Team view — one click
         away behind "Open the full team briefing". That was a mistake: renderToday IS the
         coach's home (see the 'leader-home' route), so the four objects the product is about
         were not on the page a coach actually lands on. Both renderers write to the same
         container, so the same two strips serve both. -->
    <div id="lead-inquiry"></div>
    <div id="team-state"></div>
    <div id="today-voice"></div>
    <div id="today-inquiry"></div>
    <div id="today-feed"><div style="padding:1.2rem;text-align:center;color:var(--text-muted)">Gathering what needs you…</div></div>
    <div style="text-align:center;margin-top:1.2rem"><button class="btn-ghost btn-sm" style="color:var(--text-muted)" onclick="renderIntelligence(true)">Open the full team briefing →</button></div>`;
  todayLoadVoice();
  todayLoadInquiry();
  _renderLeadInquiry();   // the open question, self or team, above everything settled
  _renderTeamState();     // High / Low / Inquiry / Focus for each group this person is in
  todayLoadFeed();
}

/* AUTONOMOUS INQUIRY, in the flow — the questions the system itself wants to ask, surfaced
   right where you already are. Grounded + governed upstream (nothing private, nothing
   leading, nothing it could answer itself); here we just show them, each with why it
   matters and a "Not now" that stands it down so it never nags. Reuses /api/inquiry. */
async function todayLoadInquiry() {
  const box = document.getElementById('today-inquiry');
  if (!box) return;
  let j;
  try { j = await fetch('/api/inquiry/pending?limit=3', { headers: Auth._headers() }).then(r => r.ok ? r.json() : null).catch(() => null); }
  catch (_) { box.innerHTML = ''; return; }
  const qs = (j && j.questions) || [];
  if (!qs.length) { box.innerHTML = ''; return; }
  const esc = _escAdvisor;
  box.innerHTML = `
    <div class="tdy-voice tdy-inquiry">
      <div class="tdy-vhead"><span class="tdy-kicker">IntelliQ wants to check</span></div>
      ${qs.map(q => `
        <div class="tdy-belief" data-inq="${esc(q.id)}">
          <div class="tdy-claim">${esc(q.question)}</div>
          ${q.why ? `<div class="tdy-why">${esc(q.why)}</div>` : ''}
          <div class="tdy-belief-actions">
            <button class="tdy-cbtn" onclick="todayDismissInquiry('${esc(q.id)}')">Not now</button>
          </div>
        </div>`).join('')}
    </div>`;
}

async function todayDismissInquiry(id) {
  try { await fetch('/api/inquiry/' + encodeURIComponent(id) + '/dismiss', { method: 'POST', headers: Auth._headers(), body: '{}' }); } catch (_) {}
  const row = document.querySelector(`#today-inquiry [data-inq="${(window.CSS && CSS.escape) ? CSS.escape(id) : id}"]`);
  if (row) row.remove();
  const box = document.getElementById('today-inquiry');
  if (box && !box.querySelector('[data-inq]')) box.innerHTML = '';   // last one gone → clear the block
  if (typeof refreshProactiveBadge === 'function') refreshProactiveBadge();
}

/* ── THE VOICE — the reasoner, read aloud ─────────────────────────────────────
   This is the brain speaking first: what it currently believes is worth your
   attention (ripe only), grounded in the real calendar, honest about how sure it
   is — and every item is decided RIGHT HERE. "I'll have that word" tells the
   reasoner it earned its keep; "Not now" stands it down so it never nags; "Why?"
   shows the reasoner arguing against its own read. Nothing navigates; it all
   settles in place. Reuses /api/reason/agenda + the feedback endpoint. */
async function todayLoadVoice() {
  const box = document.getElementById('today-voice');
  if (!box) return;
  let packet, d, brief;
  try {
    [packet, d, brief] = await Promise.all([
      fetch('/api/intelligence/packet', { headers: Auth._headers() }).then(r => r.json()).catch(() => null),
      fetch('/api/reason/agenda', { headers: Auth._headers() }).then(r => r.json()).catch(() => null),
      fetch('/api/brief', { headers: Auth._headers() }).then(r => r.json()).catch(() => null),
    ]);
  } catch (_) { box.innerHTML = ''; return; }
  const esc = _escAdvisor;
  // The reasoner agenda still carries the RICH detail (challenge, reliability, timing) that a
  // ranked packet item flattens — so we key by beliefId and render reasoner items with their
  // full in-place feedback, while the PACKET decides order and unifies every other source.
  const agendaById = {};
  (d && d.agenda || []).forEach(a => { agendaById[a.beliefId] = a; });
  const propFor = bid => (d && d.proposals || []).find(p => p.beliefId === bid);
  _todayRoll = {};
  (d && d.agenda || []).forEach(a => { if (a.rolled) _todayRoll[a.beliefId] = a.memberBeliefIds || []; });

  // The unified queue drives what's shown, in ranked order. Skip routed inquiry questions —
  // the dedicated "IntelliQ wants to check" block (#today-inquiry) owns those with its dismiss.
  const items = (packet && packet.queue || []).filter(i => i.kind !== 'questions_upward').slice(0, 6);
  const rows = items.map(i => {
    if (i.source === 'reasoner' && agendaById[i.id]) return todayVoiceRow(agendaById[i.id], propFor(i.id));
    return todayPacketRow(i);
  }).join('');

  const opener = brief && brief.opening
    ? `<div class="tdy-opener">${esc(brief.opening)}</div>`
    : `<div class="tdy-opener">I'm watching your team — I'll speak up here the moment something's worth your attention.</div>`;
  const offers = (brief && brief.offers || []).map(o =>
    `<button class="tdy-cbtn" style="margin:0" onclick="todayBriefOffer('${esc(o.action)}')">${esc(o.text)}</button>`).join('');
  const offersRow = offers ? `<div class="tdy-chips" style="margin-top:0.6rem">${offers}</div>` : '';

  box.innerHTML = `
    <div class="tdy-voice">
      <div class="tdy-vhead"><span class="tdy-presence"><span class="r"></span><span class="d"></span></span><span class="tdy-kicker">${items.length ? "What I'm seeing" : 'Today'}</span></div>
      ${opener}
      ${rows}
      ${offersRow}
    </div>`;
}

/* A non-reasoner packet item — a playbook practice, outcome history, a process reflection,
   or a working pattern — shown as a read card with its source tag. Any suggestion is
   proposal-gated and shown as text (it never acts on its own from here). */
function todayPacketRow(i) {
  const esc = _escAdvisor;
  const SRC = { org_playbook: 'playbook', outcome_intelligence: 'outcome history', process_reflection: 'process', self_model: 'your working pattern', proactive: 'noticed', extra: 'note' };
  const tag = SRC[i.source] || (i.source || '').replace(/_/g, ' ');
  const attn = i.polarity === 'risk' || i.polarity === 'friction';
  const chip = `<span class="tdy-chip${attn ? ' attn' : ''} ghost">${esc(tag)}</span>`;
  const conf = i.confidence && i.confidence !== 'none' ? `<span class="tdy-chip ghost">${esc(i.confidence)}</span>` : '';
  const head = esc(i.title || '');
  const bodyTxt = i.question ? i.question : i.body;
  return `<div class="tdy-belief">
    <div class="tdy-metarow">${chip}${conf}</div>
    <div class="tdy-claim">${head}</div>
    ${bodyTxt ? `<div class="tdy-why" style="display:block;margin-top:.4rem"><span class="lbl">${esc(tag)}</span><div style="font-size:.85rem;color:var(--text-secondary);line-height:1.5">${esc(bodyTxt)}</div></div>` : ''}
    ${i.suggestion && i.suggestion.text ? `<div class="tdy-proposal">${esc(i.suggestion.text)}</div>` : ''}
  </div>`;
}
let _todayRoll = {};

/* A brief OFFER, wired to its real destination — governed, nothing acts on its own. */
function todayBriefOffer(action) {
  if (action === 'report') return todayOpenReport();
  if (action === 'set_assessment') return (typeof navigate === 'function') && navigate('assessments');
  // recognise / anything else → into the composer, phrased for the leader to send.
  const i = document.getElementById('today-ask');
  if (i) { i.value = action === 'recognise' ? "What's going well that I should recognise?" : ''; if (i.value) todayAsk(); else i.focus(); }
}

/* Open the grounded team report (print-ready HTML → save as PDF). Fetched WITH auth, then
   written into a new window opened synchronously so pop-up blockers don't eat it. */
async function todayOpenReport() {
  const w = window.open('', '_blank');
  try {
    const r = await fetch('/api/report/team', { headers: Auth._headers() });
    const html = await r.text();
    if (w) { w.document.open(); w.document.write(html); w.document.close(); }
  } catch (e) { if (w) w.close(); if (typeof showToast === 'function') showToast('Could not open the report right now.', 'error'); }
}

/* One belief, spoken — telemetry chips, timing, honesty, and three in-place choices. */
function todayVoiceRow(a, prop) {
  const esc = _escAdvisor, sid = a.beliefId.replace(/[^a-z0-9]/gi, '_');
  const act = a.register === 'support' ? "I'll have that word" : a.register === 'scout' ? "I'll look into it" : 'Nice — noted';
  const attn = a.severity === 'high' || a.polarity === 'risk';
  const confChip = a.confidence ? `<span class="tdy-chip${attn ? ' attn' : ''}">${esc(a.confidence)}</span>` : '';
  const relChip = `<span class="tdy-chip ghost">${esc(a.reliability && a.reliability !== 'calibrating' ? a.reliability : 'calibrating')}</span>`;
  return `<div id="voice-${sid}" class="tdy-belief">
    <div class="tdy-metarow">${confChip}${relChip}</div>
    <div class="tdy-claim">${esc(a.claim)}</div>
    ${a.timing ? `<div class="tdy-timing"><span style="font-size:0.6rem">◆</span>${esc(a.timing)}</div>` : ''}
    ${prop ? `<div class="tdy-proposal">${esc(prop.text)}</div>` : ''}
    <div class="tdy-actions">
      <button class="btn btn-accent btn-sm" onclick="todayReasonRespond('${esc(a.beliefId)}','acted',this)">${act}</button>
      <button class="btn-ghost btn-sm" onclick="todayReasonRespond('${esc(a.beliefId)}','dismissed',this)">Not now</button>
      <button class="btn-ghost btn-sm" onclick="todayReasonWhy('${sid}')">Why?</button>
    </div>
    <div id="voice-why-${sid}" class="tdy-why" style="display:none">
      <span class="lbl">why I might be wrong</span>
      <ul>${(a.challenge || []).map(c => `<li>${esc(c)}</li>`).join('')}</ul>
    </div>
  </div>`;
}

/* Reveal the reasoner's self-doubt — it challenges its own belief, in the open. */
function todayReasonWhy(sid) {
  const el = document.getElementById('voice-why-' + sid);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

/* Close the loop from the flow: tell the reasoner what the belief was worth. It settles
   in place — acted keeps it watching, dismissed stands it down. Never navigates. */
async function todayReasonRespond(beliefId, response, btn) {
  const sid = beliefId.replace(/[^a-z0-9]/gi, '_');
  const row = document.getElementById('voice-' + sid);
  const btns = row && row.querySelectorAll('button');
  if (btns) btns.forEach(b => { b.disabled = true; });
  try {
    // An org-wide roll-up fans a single decision out to every group it stands for.
    const targets = _todayRoll[beliefId] && _todayRoll[beliefId].length ? _todayRoll[beliefId] : [beliefId];
    const results = await Promise.all(targets.map(id =>
      fetch('/api/reason/' + encodeURIComponent(id) + '/feedback', {
        method: 'POST', headers: Auth._headers(), body: JSON.stringify({ response }),
      }).then(r => r.json()).catch(() => ({ ok: false }))));
    if (!results.some(j => j && j.ok)) throw new Error('failed');
    if (row) row.innerHTML = `<div class="tdy-settled">${response === 'acted' ? "On it — I'll keep watching." : "Set aside — I won't raise this again for a while."}</div>`;
  } catch (e) {
    if (btns) btns.forEach(b => { b.disabled = false; });
    if (typeof showToast === 'function') showToast('Could not save that right now.', 'error');
  }
}

/* A suggested TEAM prompt (the chips) — fills the composer and asks the team path. */
function todayQuick(q) {
  const input = document.getElementById('today-ask');
  if (input) input.value = q;
  todayAsk();   // chips go through the SAME threaded assistant — one brain, one thread
}

/* The composer — ONE assistant. A leader is a person too, so free text goes through the
   SAME unified runtime the member uses (/api/assistant/turn): a reflection ("I'm feeling a
   little tired") becomes a governed, private check-in/note offer, and a question is grounded
   — never a cold "ask someone else". The quick chips go through this SAME threaded path too.
   No parallel assistant; the same brain everywhere, in one private conversation thread. */
/* The live conversation state — a private, self-only thread. conversationId is null for a
   fresh thread; the server returns one on the first turn and we keep sending it so follow-ups
   land in the same thread (and the reasoner gets the memory). */
window.IQChat = window.IQChat || { conversationId: null };

async function todayAsk() {
  const input = document.getElementById('today-ask');
  const thread = document.getElementById('today-thread');
  const out = document.getElementById('today-ask-out');
  const q = input && input.value.trim();
  if (!q || !thread) return;
  todayHistoryClose();
  thread.insertAdjacentHTML('beforeend', todayBubble('user', q));
  if (input) input.value = '';
  if (out) out.innerHTML = `<div class="tdy-thinking">Thinking…</div>`;
  todayScrollThread();
  try {
    const r = await fetch('/api/assistant/turn', { method: 'POST', headers: Auth._headers(),
      body: JSON.stringify({ text: q, conversationId: window.IQChat.conversationId }) });
    const j = await r.json();
    if (!j || !j.ok) throw new Error('turn failed');
    window.IQChat.conversationId = j.conversationId || window.IQChat.conversationId;
    if (out) out.innerHTML = '';
    const res = j.response || {};
    thread.insertAdjacentHTML('beforeend', todayBubble('assistant', res.responseText || '', res.qa || {}));
    // Duty of care: if this turn was a safeguarding response, surface the real resources
    // prominently right under the message — help must be impossible to miss.
    if (res.safeguarding && (res.safeguarding.resources || []).length) {
      thread.insertAdjacentHTML('beforeend', todaySafeguardingCard(res.safeguarding));
    }
    // Governed proposals (check-in / note …) ride under the assistant reply, unchanged.
    if (out) out.innerHTML = todayRenderProposals(j);
    todayScrollThread();
  } catch (e) { if (out) out.innerHTML = `<div class="tdy-thinking">Couldn't answer that right now.</div>`; }
}

/* One chat bubble. Assistant bubbles carry provenance chips so the two registers — general
   reasoning vs a read of your data vs something to confirm — are visible at a glance. */
function todayBubble(role, text, qa) {
  const esc = _escAdvisor;
  const chips = (role === 'assistant') ? todayProvenanceChips(qa || {}) : '';
  return `<div class="tdy-msg tdy-msg-${role}"><div class="tdy-bubble">${esc(text)}</div>${chips}</div>`;
}
function todayProvenanceChips(qa) {
  const prov = Array.isArray(qa.provenance) ? qa.provenance : [];
  const tags = new Set(prov.map(p => p && p.tag));
  const chip = (cls, label) => `<span class="tdy-prov ${cls}">${label}</span>`;
  const out = [];
  if (tags.has('general') || qa.reasoning) out.push(chip('prov-general', 'General reasoning'));
  if (tags.has('org_data')) out.push(chip('prov-org', 'From your data'));
  if (tags.has('ask')) out.push(chip('prov-ask', 'To confirm'));
  return out.length ? `<div class="tdy-provrow">${out.join('')}</div>` : '';
}
function todayScrollThread() { const t = document.getElementById('today-thread'); if (t) t.scrollTop = t.scrollHeight; }

/* The duty-of-care card — real crisis resources, impossible to miss. Deterministic; shown
   whenever a turn returns a safeguarding response, whether or not the model is on. */
function todaySafeguardingCard(sg) {
  const esc = _escAdvisor;
  const rows = (sg.resources || []).map(x => `<div class="sg-res"><span class="sg-res-label">${esc(x.label)}</span><span class="sg-res-contact">${esc(x.contact)}</span></div>`).join('');
  // On a crisis the warm words are the reply itself, so the card leads with a plain title.
  // On a concern the reply answered what they actually said, so the card carries the offer of
  // help in its own words — otherwise the resources arrive with no one having said anything.
  const lead = sg.message ? esc(sg.message) : `You don't have to face this alone — reach out any time`;
  return `<div class="tdy-msg tdy-msg-assistant"><div class="sg-card">
    <div class="sg-title">${lead}</div>
    ${rows}
    ${sg.escalated ? `<div class="sg-note">I've let your safeguarding lead know so a person can support you.</div>` : ''}
  </div></div>`;
}

/* Start a fresh thread — the current one stays saved in history. */
function todayNewChat() {
  window.IQChat.conversationId = null;
  const t = document.getElementById('today-thread'); if (t) t.innerHTML = '';
  const o = document.getElementById('today-ask-out'); if (o) o.innerHTML = '';
  todayHistoryClose();
  const i = document.getElementById('today-ask'); if (i) i.focus();
}

/* The history drawer — your past conversations, newest first. Self-only; the server never
   returns anyone else's. */
async function todayHistoryOpen() {
  const box = document.getElementById('today-history');
  if (!box) return;
  if (box.style.display !== 'none') { todayHistoryClose(); return; }
  box.style.display = 'block';
  box.innerHTML = `<div class="tdy-thinking" style="padding:0.6rem">Loading your conversations…</div>`;
  try {
    const j = await (await fetch('/api/assistant/conversations', { headers: Auth._headers() })).json();
    const list = (j && j.conversations) || [];
    if (!list.length) { box.innerHTML = `<div class="tdy-histempty">No past conversations yet — they'll appear here, visible only to you.</div>`; return; }
    box.innerHTML = list.map(c => `
      <div class="tdy-histrow" data-id="${_escAdvisor(c.id)}">
        <div class="tdy-histmain" onclick="todayLoadConversation('${_escAdvisor(c.id)}')">
          <div class="tdy-histtitle">${_escAdvisor(c.title || 'Conversation')}</div>
          <div class="tdy-histmeta">${_escAdvisor(todayWhen(c.updatedAt))} · ${c.messageCount || 0} messages</div>
        </div>
        <button class="tdy-histdel" title="Delete this conversation" onclick="todayDeleteConversation('${_escAdvisor(c.id)}',event)">×</button>
      </div>`).join('');
  } catch (e) { box.innerHTML = `<div class="tdy-histempty">Couldn't load history right now.</div>`; }
}
function todayHistoryClose() { const b = document.getElementById('today-history'); if (b) b.style.display = 'none'; }
function todayWhen(iso) { try { const d = new Date(iso); const day = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); const tm = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); return `${day}, ${tm}`; } catch (_) { return ''; } }

/* Open a past thread back into the live view — you can keep talking and it continues. */
async function todayLoadConversation(id) {
  const thread = document.getElementById('today-thread');
  if (!thread) return;
  todayHistoryClose();
  thread.innerHTML = `<div class="tdy-thinking">Loading…</div>`;
  try {
    const j = await (await fetch('/api/assistant/conversations/' + encodeURIComponent(id), { headers: Auth._headers() })).json();
    if (!j || !j.ok) throw new Error('load failed');
    window.IQChat.conversationId = j.conversation.id;
    thread.innerHTML = (j.messages || []).map(m => todayBubble(m.role, m.text, m)).join('');
    const o = document.getElementById('today-ask-out'); if (o) o.innerHTML = '';
    todayScrollThread();
  } catch (e) { thread.innerHTML = `<div class="tdy-thinking">Couldn't open that conversation.</div>`; }
}

/* Erase a thread — the user's own, permanent until they do this. */
async function todayDeleteConversation(id, ev) {
  if (ev) ev.stopPropagation();
  try {
    await fetch('/api/assistant/conversations/' + encodeURIComponent(id), { method: 'DELETE', headers: Auth._headers() });
    if (window.IQChat.conversationId === id) todayNewChat();
    todayHistoryOpen(); todayHistoryOpen(); // refresh the list (toggle off→on)
  } catch (_) {}
}

/* ── THE LIBRARY (modal) — one home for saved chats, notes, artifacts ─────────
   Personal folders; each item private by default, shareable by an explicit choice. */
window.IQLib = window.IQLib || { view: 'mine', folderId: null, folders: [], items: [], openId: null };

/* Save the current conversation into the Library — the "successful session" flow. */
async function todaySaveChatToLibrary() {
  const conv = window.IQChat && window.IQChat.conversationId;
  if (!conv) { alert('Start a conversation first, then save it.'); return; }
  const title = prompt('Save this conversation as — give it a name:', '');
  if (title === null) return;
  try {
    const r = await (await fetch('/api/library/from-chat', { method: 'POST', headers: Auth._headers(),
      body: JSON.stringify({ conversationId: conv, title: title.trim() || undefined }) })).json();
    if (r && r.ok) { window.IQLib.view = 'mine'; window.IQLib.folderId = null; todayLibraryOpen(); }
    else alert("Couldn't save that.");
  } catch (_) { alert("Couldn't save that."); }
}

async function todayLibraryOpen() {
  document.getElementById('iq-lib-modal')?.remove();
  const el = document.createElement('div');
  el.id = 'iq-lib-modal'; el.className = 'modal-overlay'; el.style.display = 'flex';
  el.onclick = (e) => { if (e.target === el) libClose(); };
  el.innerHTML = `<div class="modal-card lib-card">
    <div class="lib-head"><div class="modal-title" style="margin:0">Library</div>
      <button class="tdy-headbtn" onclick="libClose()">Close</button></div>
    <div class="lib-body"><div class="lib-side" id="lib-side"></div><div class="lib-main" id="lib-main"></div></div>
    <div class="tdy-privacy" style="text-align:left;margin:.6rem .2rem 0">Private by default · “Shared” means teammates can see it · sharing a note never makes it a fact until you confirm it as evidence</div>
  </div>`;
  document.body.appendChild(el);
  await libLoad();
}
function libClose() { document.getElementById('iq-lib-modal')?.remove(); }

async function libLoad() {
  try {
    const [f, i] = await Promise.all([
      fetch('/api/library/folders', { headers: Auth._headers() }).then(r => r.json()),
      fetch('/api/library?scope=all', { headers: Auth._headers() }).then(r => r.json()),
    ]);
    window.IQLib.folders = (f && f.folders) || [];
    window.IQLib.items = (i && i.items) || [];
  } catch (_) { window.IQLib.folders = []; window.IQLib.items = []; }
  libRender();
}

function libRender() {
  const L = window.IQLib, esc = _escAdvisor;
  const side = document.getElementById('lib-side'), main = document.getElementById('lib-main');
  if (!side || !main) return;
  const sel = (on) => on ? 'lib-navsel' : '';
  side.innerHTML = `
    <button class="lib-nav ${sel(L.view==='mine'&&!L.folderId)}" onclick="libSelect('mine',null)">All mine</button>
    <button class="lib-nav ${sel(L.view==='shared')}" onclick="libSelect('shared',null)">Shared with me</button>
    <div class="lib-navlabel">Folders</div>
    ${L.folders.map(f => `<button class="lib-nav ${sel(L.folderId===f.id)}" onclick="libSelect('mine','${esc(f.id)}')">${esc(f.name)} <span class="lib-count">${f.itemCount||0}</span></button>`).join('')}
    <button class="lib-nav lib-addfld" onclick="libNewFolder()">＋ New folder</button>
    <button class="btn btn-accent btn-sm" style="margin-top:.6rem;width:100%" onclick="libNewNote()">＋ New note</button>`;
  // filter items for the current view
  let items = L.items.slice();
  if (L.view === 'shared') items = items.filter(x => !x.mine);
  else { items = items.filter(x => x.mine); if (L.folderId) items = items.filter(x => x.folderId === L.folderId); }
  if (L.openId) { main.innerHTML = libDetail(L.items.find(x => x.id === L.openId)); return; }
  main.innerHTML = items.length ? items.map(it => `
    <div class="lib-item" onclick="libOpen('${esc(it.id)}')">
      <div class="lib-item-main">
        <div class="lib-item-title">${esc(it.title)}</div>
        <div class="lib-item-meta">${esc(todayWhen(it.updatedAt))}${it.mine?'':' · shared with you'}</div>
      </div>
      <span class="lib-vis ${it.visibility==='shared'?'vis-shared':'vis-private'}">${it.visibility==='shared'?'Shared':'Private'}</span>
    </div>`).join('') : `<div class="tdy-histempty">Nothing here yet. Save a chat, or make a note.</div>`;
}

function libDetail(it) {
  if (!it) return '';
  const esc = _escAdvisor;
  const folderOpts = ['<option value="">— no folder —</option>'].concat(window.IQLib.folders.map(f => `<option value="${esc(f.id)}" ${it.folderId===f.id?'selected':''}>${esc(f.name)}</option>`)).join('');
  const owner = it.mine;
  return `<div class="lib-detail">
    <button class="tdy-headbtn" onclick="libBack()">← Back</button>
    <div class="lib-dtitle">${esc(it.title)}</div>
    <div class="lib-dbody">${esc(it.body||'')}</div>
    ${owner ? `<div class="lib-dactions">
      <label class="lib-dctl">Folder <select onchange="libMove('${esc(it.id)}',this.value)">${folderOpts}</select></label>
      <label class="lib-dctl">Visibility <select onchange="libShare('${esc(it.id)}',this.value)">
        <option value="private" ${it.visibility==='private'?'selected':''}>Private (only me)</option>
        <option value="shared" ${it.visibility==='shared'?'selected':''}>Shared (my teammates)</option></select></label>
      <button class="btn-ghost btn-sm" style="color:var(--danger,#d05a5a)" onclick="libDelete('${esc(it.id)}')">Delete</button>
    </div>` : `<div class="lib-dctl" style="color:var(--text-muted)">Shared with you — read-only</div>`}
  </div>`;
}
function libOpen(id) { window.IQLib.openId = id; libRender(); }
function libBack() { window.IQLib.openId = null; libRender(); }
function libSelect(view, folderId) { window.IQLib.view = view; window.IQLib.folderId = folderId; window.IQLib.openId = null; libRender(); }

async function libNewFolder() {
  const name = prompt('Folder name:', ''); if (!name || !name.trim()) return;
  try { await fetch('/api/library/folders', { method: 'POST', headers: Auth._headers(), body: JSON.stringify({ name: name.trim() }) }); await libLoad(); } catch (_) {}
}
async function libNewNote() {
  const title = prompt('Note title:', ''); if (title === null) return;
  const body = prompt('What do you want to remember?', ''); if (body === null) return;
  const folderId = (window.IQLib.view === 'mine' && window.IQLib.folderId) ? window.IQLib.folderId : null;
  try { await fetch('/api/library', { method: 'POST', headers: Auth._headers(), body: JSON.stringify({ type: 'note', title: title.trim() || 'Untitled', body, folderId }) }); await libLoad(); } catch (_) {}
}
async function libMove(id, folderId) { try { await fetch('/api/library/' + encodeURIComponent(id), { method: 'PATCH', headers: Auth._headers(), body: JSON.stringify({ folderId: folderId || null }) }); await libLoad(); } catch (_) {} }
async function libShare(id, visibility) { try { await fetch('/api/library/' + encodeURIComponent(id), { method: 'PATCH', headers: Auth._headers(), body: JSON.stringify({ visibility }) }); await libLoad(); } catch (_) {} }
async function libDelete(id) { if (!confirm('Delete this item?')) return; try { await fetch('/api/library/' + encodeURIComponent(id), { method: 'DELETE', headers: Auth._headers() }); window.IQLib.openId = null; await libLoad(); } catch (_) {} }

/* Render the GOVERNED proposals for the latest turn (check-in / private note …) with
   confirm/dismiss — nothing saved until confirmed. The reply text itself now lives in the
   assistant bubble in the thread, so this renders only the proposals + any saved note. */
function todayRenderProposals(j) {
  const esc = _escAdvisor, r = j.response || {};
  const proposals = r.primaryActions || r.proposedActions || [];
  const propHtml = proposals.map(p => {
    const priv = p.visibility === 'only_me' ? 'Private' : 'Confirm to share';
    return `<div id="today-prop-${esc(p.id)}" class="tdy-prop">
      <div class="tdy-prop-head">${esc(p.label)} <span class="tdy-nbadge">${priv}</span></div>
      ${p.why ? `<div class="tdy-prop-why">${esc(p.why)}</div>` : ''}
      <div class="tdy-actions" style="margin-top:0.5rem">
        <button class="btn btn-accent btn-sm" onclick="todayTurnConfirm('${esc(j.turnId)}','${esc(p.id)}',this)">Confirm</button>
        <button class="btn-ghost btn-sm" onclick="todayTurnDismiss('${esc(p.id)}')">Dismiss</button>
      </div></div>`;
  }).join('');
  const note = j.saved ? `<div class="tdy-note">Saved — privately, just for you.</div>`
    : (j.capturePrompt ? `<div class="tdy-note">${esc(j.capturePrompt.message)}</div>` : '');
  return `${note}${propHtml}`;
}

/* Confirm a governed proposal from the composer — the only path to a write. Settles in place. */
async function todayTurnConfirm(turnId, proposalId, btn) {
  const card = document.getElementById('today-prop-' + proposalId);
  if (btn) { btn.disabled = true; btn.textContent = 'Confirming…'; }
  try {
    const r = await fetch('/api/assistant/turn/' + encodeURIComponent(turnId) + '/confirm', { method: 'POST', headers: Auth._headers(), body: JSON.stringify({ proposalId }) });
    const d = await r.json();
    if (!d.ok) throw new Error('confirm failed');
    if (card) card.innerHTML = `<div class="tdy-settled">${_escAdvisor(d.note || 'Done.')}</div>`;
  } catch (e) { if (btn) { btn.disabled = false; btn.textContent = 'Confirm'; } if (typeof showToast === 'function') showToast('Could not confirm right now.', 'error'); }
}
/* Dismiss a proposal — nothing was written, so this just clears it from the flow. */
function todayTurnDismiss(proposalId) {
  const card = document.getElementById('today-prop-' + proposalId);
  if (card) card.remove();
}

/* The live feed — composes readiness + routing + playbook + memory into one actionable list. */
async function todayLoadFeed() {
  const box = document.getElementById('today-feed');
  if (!box) return;
  const get = p => fetch(p, { headers: Auth._headers() }).then(r => r.json()).catch(() => ({}));
  const [rd, route, cand, changed] = await Promise.all([
    get('/api/team/readiness'), get('/api/org/routing'), get('/api/org-playbook/candidates'), get('/api/org-memory/changed'),
  ]);
  const esc = _escAdvisor;
  const sections = [];

  // Focus + readiness status — one calm header line.
  if (rd && rd.focus) {
    const st = _RD_STATE[rd.readiness && rd.readiness.status] || _RD_STATE.insufficient_information;
    sections.push(`<div class="card" style="margin-bottom:0.8rem">
      <div style="font-size:0.66rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted)">Preparing for</div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:0.5rem;margin-top:0.2rem">
        <strong style="font-size:1rem">${esc(rd.focus.title || rd.focus.type || 'Current focus')}</strong>
        <span style="font-size:0.74rem;color:${st.color}">${st.label}</span>
      </div></div>`);
  }

  // Needs an answer — routed questions, answerable inline.
  const qs = (rd && rd.nextQuestions) || [];
  if (qs.length) {
    sections.push(`<div class="card" style="margin-bottom:0.8rem">
      <div class="card-label" style="margin-bottom:0.4rem">Needs an answer</div>
      ${qs.map(x => `<div style="display:flex;justify-content:space-between;gap:0.5rem;align-items:center;padding:0.3rem 0;border-bottom:1px solid var(--line-soft,rgba(127,127,127,0.08))">
        <span style="font-size:0.84rem">${esc(x.question)}${x.blocking ? ' <span style="font-size:0.66rem;color:var(--danger)">blocking</span>' : ''}</span>
        ${x.uncertaintyId ? `<button class="btn btn-outline btn-sm" style="font-size:0.72rem;white-space:nowrap" onclick="trAnswer('${esc(x.uncertaintyId)}')">Answer</button>` : ''}
      </div>`).join('')}</div>`);
  }

  // Flagged to you — routing conflicts + high-priority routed work.
  const conflicts = (route && route.conflicts) || [];
  const inbox = (route && route.inbox) || [];
  if (conflicts.length || inbox.length) {
    sections.push(`<div class="card" style="margin-bottom:0.8rem">
      <div class="card-label" style="margin-bottom:0.4rem">Flagged to you</div>
      ${conflicts.map(c => `<div style="display:flex;justify-content:space-between;gap:0.5rem;align-items:center;padding:0.3rem 0">
        <span style="font-size:0.84rem">${esc(c.label)} <span style="font-size:0.66rem;color:var(--warning)">needs an owner</span></span>
        <button class="btn-outline btn-sm" style="font-size:0.72rem;white-space:nowrap" onclick="navigate('team-readiness')">Assign</button></div>`).join('')}
      ${inbox.slice(0, 5).map(x => `<div style="display:flex;justify-content:space-between;gap:0.5rem;align-items:center;padding:0.3rem 0">
        <span style="font-size:0.84rem">${esc(x.label)}</span>
        <button class="btn-ghost btn-sm" style="font-size:0.72rem;white-space:nowrap" onclick="navigate('team-readiness')">Open</button></div>`).join('')}</div>`);
  }

  // Worth reviewing — proposed playbook practices, decided RIGHT HERE. No page to open:
  // the pattern, what argues against it, and the two choices all live in the flow, and
  // your decision settles in place. Confirming is the only path into your playbook.
  const cands = (cand && cand.candidates) || [];
  if (cands.length) {
    const patternRow = (c) => {
      const fp = esc(c.fingerprint);
      const against = (c.counterEvidence && (c.counterEvidence.signals || [])[0]) || '';
      return `<div id="today-pat-${fp}" style="padding:0.55rem 0;border-bottom:1px solid var(--line-soft,rgba(127,127,127,0.08))">
        <div style="font-size:0.84rem;color:var(--text-primary)">${esc(c.statement)}</div>
        ${against ? `<div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.15rem">Worth weighing: ${esc(against)}</div>` : ''}
        <div style="display:flex;gap:0.5rem;margin-top:0.45rem">
          <button class="btn btn-accent btn-sm" style="font-size:0.72rem" onclick="todayPattern('${fp}', true, this)">This is how we operate</button>
          <button class="btn-ghost btn-sm" style="font-size:0.72rem;color:var(--text-muted)" onclick="todayPattern('${fp}', false, this)">Not really</button>
        </div>
      </div>`;
    };
    sections.push(`<div class="card" style="margin-bottom:0.8rem">
      <div class="card-label" style="margin-bottom:0.4rem">Worth confirming</div>
      <div style="font-size:0.74rem;color:var(--text-muted);margin-bottom:0.3rem">A pattern that keeps recurring. It only joins your playbook if you say so.</div>
      ${cands.slice(0, 3).map(patternRow).join('')}</div>`);
  }

  // Since last time — what changed.
  const ch = changed && changed.changed;
  if (ch && !ch.nothingChanged && (ch.summary || []).length) {
    sections.push(`<div class="card" style="margin-bottom:0.8rem">
      <div class="card-label" style="margin-bottom:0.4rem">Since last time</div>
      <ul style="margin:0 0 0.3rem 1rem;padding:0">${(ch.summary || []).slice(0, 3).map(s => `<li style="font-size:0.8rem;color:var(--text-secondary)">${esc(s)}</li>`).join('')}</ul>
      <button class="btn-ghost btn-sm" style="font-size:0.72rem" onclick="navigate('org-memory')">View history →</button></div>`);
  }

  if (sections.length) { box.innerHTML = sections.join(''); return; }

  // Empty → the assistant keeps talking. Not a titled board of destinations, but a few
  // things IT offers to do next, phrased in first person. (No operating context / nothing
  // outstanding yet.) The voice line above already says "I'm watching"; this is "…and
  // here's how to give me something to reason about."
  const step = (label, desc, onclick) => `<button style="display:flex;width:100%;text-align:left;gap:0.7rem;align-items:flex-start;padding:0.7rem 0.4rem;border:0;border-top:1px solid var(--line-soft,rgba(127,127,127,0.1));background:transparent;cursor:pointer" onclick="${onclick}">
    <span style="flex:1"><span style="display:block;font-size:0.9rem;font-weight:600;color:var(--text-primary)">${label}</span><span style="display:block;font-size:0.78rem;color:var(--text-muted);margin-top:2px">${desc}</span></span></button>`;
  box.innerHTML = `
    <div class="card" style="padding:1.2rem 1.3rem">
      <div style="font-size:0.92rem;color:var(--text-secondary);line-height:1.5;margin-bottom:0.6rem">To reason well about your team I need a little to go on. Point me at any of these and I'll take it from there:</div>
      ${step('Tell me how your team works', 'Your events, who owns what, what prep matters — the ground I reason from.', 'todayContextStart()')}
      ${step('Set an assessment or check-in', 'Give your people work; it comes back as a grounded conversation, not a blank form.', "navigate('assessments')")}
      ${step('Just ask me something', 'Type anything in the box above — I answer from what I already know about your area.', "document.getElementById('today-ask') && document.getElementById('today-ask').focus()")}
    </div>`;
}

/* ── CONVERSATIONAL OPERATING-CONTEXT INTAKE — learning how the team works, in the flow ──
   Instead of sending the leader off to a form, the assistant interviews them right here: they
   describe one thing in plain words, it shows what it understood + what that will DO, they
   confirm, and it invites the next thing. Grows the operating context conversationally, all
   in Today. Reuses the governed /api/org-context preview + confirm — no parallel path, and
   the same hard blocks (private/wellbeing/surveillance can never become an operating rule). */
let _todayCtxProposals = null;
function todayContextStart() {
  const box = document.getElementById('today-feed');
  if (!box) return;
  box.innerHTML = `
    <div class="card" style="border-left:3px solid var(--accent)">
      <div style="font-size:0.9rem;color:var(--text-primary);line-height:1.5;margin-bottom:0.6rem">Tell me one thing about how your team works — an event, who owns what, or what prep matters. Plain words are fine, like <em>"We play matches every Saturday at 3pm and Sam runs training on Tuesdays."</em></div>
      <textarea id="today-ctx-in" class="form-input" rows="2" placeholder="Describe one thing…" style="width:100%;font-size:0.9rem;margin:0"></textarea>
      <div id="today-ctx-out" style="margin-top:0.5rem"></div>
      <div style="display:flex;gap:0.5rem;margin-top:0.5rem">
        <button class="btn btn-accent btn-sm" onclick="todayContextPreview()">Tell me</button>
        <button class="btn-ghost btn-sm" style="color:var(--text-muted)" onclick="todayLoadFeed()">Back</button>
      </div>
    </div>`;
  const t = document.getElementById('today-ctx-in'); if (t) t.focus();
}

/* Read the sentence → show what the assistant understood + what it will do (no write yet). */
async function todayContextPreview() {
  const inp = document.getElementById('today-ctx-in');
  const out = document.getElementById('today-ctx-out');
  const text = inp && inp.value.trim();
  if (!text || !out) return;
  out.innerHTML = `<div style="font-size:0.8rem;color:var(--text-muted)">Reading that…</div>`;
  try {
    const r = await fetch('/api/org-context/preview', { method: 'POST', headers: Auth._headers(), body: JSON.stringify({ text }) });
    const d = await r.json();
    if (d.blocked) { out.innerHTML = `<div style="font-size:0.82rem;color:var(--warning,#c90)">${_escAdvisor(d.message || "That looks like private information — it can't become an operating rule.")}</div>`; return; }
    const proposals = d.proposals || [];
    if (!proposals.length) { out.innerHTML = `<div style="font-size:0.82rem;color:var(--text-muted)">I couldn't pull anything structured from that. Try naming an event, an owner, or a prep step.</div>`; return; }
    _todayCtxProposals = proposals;
    const lines = (d.preview && d.preview.lines) || proposals.map(p => p.type);
    const effects = (d.preview && d.preview.effects) || [];
    out.innerHTML = `
      <div style="padding:0.5rem 0.7rem;border-left:2px solid var(--accent);background:var(--surface-alt,rgba(127,127,127,0.05));border-radius:6px">
        <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:0.2rem">Here's what I understood</div>
        <ul style="margin:0 0 0 1rem;padding:0">${lines.map(l => `<li style="font-size:0.84rem;color:var(--text-primary)">${_escAdvisor(l)}</li>`).join('')}</ul>
        ${effects.length ? `<div style="font-size:0.74rem;color:var(--text-muted);margin-top:0.35rem">${effects.map(_escAdvisor).join(' ')}</div>` : ''}
      </div>
      <div style="display:flex;gap:0.5rem;margin-top:0.5rem">
        <button class="btn btn-accent btn-sm" onclick="todayContextConfirm()">Yes, save that</button>
        <button class="btn-ghost btn-sm" style="color:var(--text-muted)" onclick="todayContextStart()">Not quite</button>
      </div>`;
  } catch (e) { out.innerHTML = `<div style="font-size:0.8rem;color:var(--text-muted)">Couldn't read that right now.</div>`; }
}

/* Confirm → the governed write. Then invite the next thing (loop) or finish. */
async function todayContextConfirm() {
  const out = document.getElementById('today-ctx-out');
  if (!_todayCtxProposals || !_todayCtxProposals.length || !out) return;
  try {
    const r = await fetch('/api/org-context/confirm', { method: 'POST', headers: Auth._headers(), body: JSON.stringify({ records: _todayCtxProposals, source: 'conversation' }) });
    const d = await r.json();
    if (!d.ok || !(d.created || []).length) throw new Error('none saved');
    _todayCtxProposals = null;
    out.innerHTML = `<div style="font-size:0.85rem;color:var(--text-primary)">Got it — saved, and I'll reason from it now.</div>
      <div style="display:flex;gap:0.5rem;margin-top:0.5rem">
        <button class="btn btn-accent btn-sm" onclick="todayContextStart()">Tell me something else</button>
        <button class="btn-ghost btn-sm" style="color:var(--text-muted)" onclick="todayLoadFeed()">Done for now</button>
      </div>`;
  } catch (e) { out.innerHTML = `<div style="font-size:0.8rem;color:var(--text-muted)">Couldn't save that right now.</div>`; }
}

/* Decide a proposed pattern IN THE FLOW — confirm folds it into the playbook, "not really"
   sets it aside. Either way the row settles in place with a one-line acknowledgement; no
   navigation, no page. Reuses the governed confirm/dismiss endpoints. */
async function todayPattern(fingerprint, confirm, btn) {
  const row = document.getElementById('today-pat-' + fingerprint);
  const btns = row && row.querySelectorAll('button');
  if (btns) btns.forEach(b => { b.disabled = true; });
  if (btn) btn.textContent = confirm ? 'Adding…' : 'Setting aside…';
  const path = '/api/org-playbook/candidates/' + encodeURIComponent(fingerprint) + (confirm ? '/confirm' : '/dismiss');
  try {
    const r = await fetch(path, { method: 'POST', headers: Auth._headers() });
    const j = await r.json();
    if (!j.ok) throw new Error('failed');
    if (row) {
      row.innerHTML = `<div style="font-size:0.8rem;color:var(--text-muted);padding:0.2rem 0">${confirm ? 'Added to your playbook.' : 'Set aside — it can come back if it keeps recurring.'}</div>`;
    }
  } catch (e) {
    if (btns) btns.forEach(b => { b.disabled = false; });
    if (btn) btn.textContent = confirm ? 'This is how we operate' : 'Not really';
    if (typeof showToast === 'function') showToast('Could not save that right now.', 'error');
  }
}

async function renderIntelligence(refresh) {
  const el    = document.getElementById('ldr-home-content');
  const title = document.getElementById('ldr-home-title');
  const sub   = document.getElementById('ldr-home-sub');
  if (!el) return;
  if (title) title.textContent = 'Team';
  if (sub)   sub.textContent   = `The ${_v('people')} you lead — who needs your attention.`;
  // Only blank to a spinner on the FIRST load (or an explicit refresh) — otherwise
  // keep what's on screen so tapping Home never flashes to an empty/frozen state
  // while the (sometimes slow) briefing loads.
  const hadContent = el.querySelector('.intel-summary, .intel-list, .intel-you');
  if (!hadContent || refresh) el.innerHTML = `<div style="padding:1.5rem;text-align:center;color:var(--text-muted)">Reading the signals…</div>`;
  // Never hang: if the briefing (which may run an AI call) is slow, bail to a clear
  // retry instead of leaving Home stuck.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 14000);
  try {
    // One surface, grown by responsibility: the coach's OWN mirror + who needs them.
    const [briefRes, meRes] = await Promise.all([
      fetch(`/api/intelligence/briefing${refresh ? '?refresh=1' : ''}`, { headers: Auth._headers(), signal: ctrl.signal }),
      fetch('/api/me/record', { headers: Auth._headers(), signal: ctrl.signal }),
    ]);
    clearTimeout(timer);
    const d = await briefRes.json();
    if (!briefRes.ok || !d.ok) throw new Error(d.error || 'unavailable');
    const me = meRes.ok ? await meRes.json() : null;
    const r  = d.rollup || {};
    const cap = s => String(s || '').replace(/^./, c => c.toUpperCase());
    const momColor = r.momentum === 'softening' ? 'var(--danger)' : r.momentum === 'building' ? 'var(--success)' : 'var(--text-secondary)';
    const n = (d.items || []).length;

    // "You" — the coach develops too (their own mirror, compact).
    const youStrip = (me && me.ok && me.reflection) ? `
      <div class="intel-you">
        <div class="intel-you-label">◍ You · your own development</div>
        <div class="intel-you-text">${_escAdvisor(me.reflection)}</div>
        ${me.trajectory ? `<div class="intel-you-dir">Your direction: <b>${_escAdvisor(_trajWord(me.trajectory))}</b></div>` : ''}
      </div>` : '';

    // Attention is not only problems: balance WORTH RECOGNISING (positive patterns the
    // kernel already found) with NEEDS YOUR ATTENTION. Split by the item's own
    // patternType — no new reasoning, just a projection of existing findings.
    // AGGREGATE and PEOPLE are two different jobs and the page needs both. The Web items say
    // what is true of the group without naming anyone; the person items are the ones a leader
    // can actually act on today, and acting is what feeds the outcome loop. Showing only the
    // aggregate leaves a page that reports and cannot be answered.
    const web     = (d.items || []).filter(it => it.perspective === 'web');
    const people  = (d.items || []).filter(it => it.perspective !== 'web');
    const webHigh = web.filter(it => it.kind === 'high');
    const webLow  = web.filter(it => it.kind !== 'high');
    const POSITIVE = new Set(['recovering', 'quiet_improvement']);
    const recognise = people.filter(it => POSITIVE.has(it.patternType));
    const needs     = people.filter(it => !POSITIVE.has(it.patternType));
    const teamSections = (webHigh.length || webLow.length || recognise.length || needs.length)
      ? `${webHigh.length ? `<div class="intel-section intel-section--positive"><b>Web Highs</b> — patterns across your scope, no one named</div><div class="intel-list">${webHigh.map(_intelCard).join('')}</div>` : ''}
         ${webLow.length ? `<details class="intel-collapse" open><summary class="intel-section"><b>Web Lows</b> — patterns across your scope, no one named</summary><div class="intel-list">${webLow.map(_intelCard).join('')}</div></details>` : ''}
         ${recognise.length ? `<div class="intel-section intel-section--positive"><b>Worth recognising</b> — ${recognise.length} ${_v(recognise.length === 1 ? 'member' : 'members')} doing well</div><div class="intel-list">${recognise.map(_intelCard).join('')}</div>` : ''}
         ${needs.length ? `<details class="intel-collapse" open><summary class="intel-section"><b>Needs your attention</b> — ${needs.length} ${_v(needs.length === 1 ? 'member' : 'members')} could use you</summary><div class="intel-list">${needs.map(_intelCard).join('')}</div></details>` : ''}`
      : `<div class="intel-section"><b>Your ${_v('members')}</b> — all steady this week</div><div class="intel-empty">Nothing needs your attention right now — all steady across your people. When a pattern emerges, it appears here with the evidence and a suggested next step.</div>`;

    el.innerHTML = `
      <div id="lead-inquiry"></div>
      <div id="team-state"></div>
      ${youStrip}
      <div id="team-prompts"></div>
      <div id="team-watch"></div>
      <div class="intel-summary">
        <div class="intel-summary-icon"></div>
        <div class="intel-summary-text">${_escAdvisor(d.summary || '')}</div>
        <button class="intel-refresh" title="Rebuild" onclick="renderIntelligence(true)">↻</button>
      </div>
      ${teamSections}
      <div class="intel-rollup">
        <div class="intel-stat"><span class="intel-stat-v">${r.memberCount || 0}</span><span class="intel-stat-l">${_v('members')}</span></div>
        <div class="intel-stat"><span class="intel-stat-v">${r.activeThisWeek || 0}/${r.memberCount || 0}</span><span class="intel-stat-l">active this week</span></div>
        <div class="intel-stat"><span class="intel-stat-v">${r.participation || 0}%</span><span class="intel-stat-l">participation</span></div>
        <div class="intel-stat"><span class="intel-stat-v" style="color:${momColor}">${cap(r.momentum || 'steady')}</span><span class="intel-stat-l">momentum</span></div>
      </div>
      <div id="org-discoveries"></div>
      <div class="intel-foot">Patterns &amp; early signals, each compared to a person's own normal — directional, never scores. Private detail informs the read but is never shown.</div>`;
    _renderLeadInquiry();  // the open question, self or team, ABOVE everything settled
    _renderTeamState();  // the GROUP as the subject — High, Low, Inquiry, Focus. Above the people, deliberately.
    _renderTeamPrompts(d.prompts || []);  // "want me to…" — proactive offers the leader can approve in one tap
    _renderTeamWatch();  // proactive early-warning banner, populated after the main read
    _renderDiscoveries();  // "how your organisation learns" — the research surface
  } catch (e) {
    clearTimeout(timer);
    // Keep any existing content rather than wiping it; only show the fallback if the
    // page is currently empty (first load failed or timed out).
    if (!el.querySelector('.intel-summary, .intel-list, .intel-you')) {
      const slow = e && e.name === 'AbortError';
      el.innerHTML = `<div class="intel-empty">${slow ? 'This is taking longer than usual.' : 'Home is unavailable right now.'} <button class="intel-refresh" onclick="renderIntelligence(true)">↻ Try again</button></div>`;
    }
  }
}

/* ── THE OPEN QUESTION, FIRST ─────────────────────────────────────────────────
   Home opens with what is unresolved, not with what is settled. A High is a report; an
   Inquiry is the only thing on this page that asks the reader for something, so it leads.

   Self and team compete on one ranking, decided server-side. Two lists would hand the reader
   the judgement the ranking exists to make. The strip says WHERE the question came from —
   "about you" or the group's name — because "why am I being asked this" is the first thing a
   coach will want to know, and a question with no provenance reads as the system nagging. */
async function _renderLeadInquiry() {
  const box = document.getElementById('lead-inquiry');
  if (!box) return;
  try {
    const res = await fetch('/api/inquiry/lead', { headers: Auth._headers() });
    if (!res.ok) { box.innerHTML = ''; return; }
    const lead = (await res.json()).lead;
    if (!lead || !lead.question) { box.innerHTML = ''; return; }
    const esc = _escAdvisor;
    const where = lead.source === 'self' ? 'About you' : esc(lead.where || 'Your group');
    /* The sentences come from the kernel (ai/voice.explainObject, D30), not from here. This
       function assembles no prose of its own — that is what let every surface phrase the same
       object its own way, and it is why "the deterministic voice" ended up living in four homes.
       If `explained` is missing (an older payload) we fall back to the bare question rather than
       inventing a sentence. */
    const x = lead.explained || null;
    const block = (title, lines) => (lines && lines.length)
      ? `<div class="linq-block"><div class="linq-block-t">${esc(title)}</div>${lines.map(l => `<div class="linq-block-l">${esc(l)}</div>`).join('')}</div>`
      : '';
    box.innerHTML = `
      <div class="linq-card">
        <div class="linq-head">Open question · ${where}</div>
        ${x && x.headline ? `<div class="linq-q">${esc(x.headline)}</div>` : `<div class="linq-q">${esc(lead.question)}</div>`}
        ${x && x.claim ? `<div class="linq-claim">${esc(x.claim)}</div>` : ''}
        ${x && x.provenance ? `<div class="linq-prov">${esc(x.provenance)}</div>` : ''}
        ${x && x.contested ? `<div class="linq-flag">${esc(x.contested)}</div>`
          : (lead.contested ? `<div class="linq-flag">People here describe this differently — that disagreement is the useful part.</div>` : '')}
        ${x ? block('What I still don’t know', x.stillUnknown) : (lead.question ? block('What I still don’t know', [lead.question]) : '')}
        ${x ? block('What would change my mind', x.wouldChangeMyMind) : ''}
        ${x && x.setAside ? `<div class="linq-more">Set aside: ${esc(x.setAside)}</div>` : ''}
      </div>`;
  } catch (_) { box.innerHTML = ''; }
}

/* ── THE TEAM AS A SUBJECT ────────────────────────────────────────────────────
   High, Low, Inquiry, Focus — the group read at the group's own grain, above the list of
   people, because a rundown of individuals is not a picture of a team.

   Everything rendered here was decided server-side by ai/team-state.js: which claim clears
   the disclosure floor, which rests on enough independent origins, what may be said at all.
   This function adds no judgement of its own — if the server withheld something, the strip
   says so in the server's own words rather than quietly rendering less.

   Failure is silent by design. This is one strip on a page that already works without it;
   a group surface that cannot load should not take down the leader's home. */
async function _renderTeamState() {
  const box = document.getElementById('team-state');
  if (!box) return;
  try {
    const mineRes = await fetch('/api/group/mine', { headers: Auth._headers() });
    if (!mineRes.ok) { box.innerHTML = ''; return; }
    const groups = (await mineRes.json()).groups || [];
    // Groups they lead first; at most two, because a third card pushes the people below the
    // fold and this strip is context for that list, not a replacement for it.
    // A node with no members is a container, not a team — it can never produce a finding, and
    // rendering it puts an empty card above the real one. Found in the first browser pass: the
    // coach leads the root node too, so "Demo Athletic Club · 0 people" sat above the squad.
    const real = groups.filter(g => (g.memberCount || 0) > 0);
    const pick = [...real.filter(g => g.role === 'leader'), ...real.filter(g => g.role !== 'leader')].slice(0, 2);
    if (!pick.length) { box.innerHTML = ''; return; }

    const states = (await Promise.all(pick.map(g =>
      fetch(`/api/group/${encodeURIComponent(g.nodeId)}/state`, { headers: Auth._headers() })
        .then(r => (r.ok ? r.json() : null)).catch(() => null)
    ))).filter(s => s && s.ok);
    if (!states.length) { box.innerHTML = ''; return; }

    box.innerHTML = states.map(_teamStateCard).join('');
  } catch (_) { box.innerHTML = ''; }
}

function _teamStateCard(s) {
  const esc = _escAdvisor;
  // A line is rendered only when the server sent one. An empty High is not "no highs" — it is
  // "nothing has cleared the bar", which the closing statement is what says so. Padding the
  // card with "None yet" placeholders would make an honest silence look like a broken screen.
  const line = (label, text, sub) => text ? `
    <div class="tstate-line">
      <div class="tstate-label">${esc(label)}</div>
      <div class="tstate-text">${esc(text)}${sub ? `<span class="tstate-sub">${esc(sub)}</span>` : ''}</div>
    </div>` : '';

  /* The provenance chip, from the kernel (D30). It was assembled here from `basis` — which meant
     the same evidence read one way on this card and another way on home. Now the sentence comes
     composed and this falls back only for an older payload. */
  const basis = (b, x) => (x && x.provenance) ? x.provenance
    : (b && b.independentOrigins
      ? `${b.independentOrigins} independent ${b.independentOrigins === 1 ? 'account' : 'accounts'}`
      : '');

  /* WHAT WOULD CHANGE OUR MIND, on the team card. One line, and the line no competitor can
     write. Rendered only when the kernel produced one — an invented falsifier would be worse
     than none, because it is a promise about how we would be corrected. */
  const changeMind = x => (x && (x.wouldChangeMyMind || []).length)
    ? `<div class="tstate-falsify">Would change our mind: ${esc(x.wouldChangeMyMind[0])}</div>` : '';

  // What was found but may not be said. Named by topic, never restated — a leader who knows
  // something is being held back can go and ask; a leader shown nothing concludes nothing is
  // there. That difference is what makes the disclosure floor survivable as a product.
  const withheld = (s.withheld || []).length ? `
    <div class="tstate-withheld">
      Not shown yet: ${(s.withheld || []).map(w => esc(w.about)).join(', ')} — too few people have spoken about
      ${(s.withheld || []).length === 1 ? 'it' : 'them'} to say so without pointing at individuals.
    </div>` : '';

  const focus = s.focus && s.focus.status === 'active' ? s.focus : null;
  const focusSub = focus
    ? (focus.origin && focus.origin.from === 'inquiry' ? 'from an open inquiry' : 'set by a leader')
    : '';

  return `
    <div class="tstate-card">
      <div class="tstate-head">
        <div class="tstate-name">${esc(s.node.name)}</div>
        <div class="tstate-count">${s.node.memberCount} ${_v(s.node.memberCount === 1 ? 'member' : 'members')}</div>
      </div>
      ${line('High', s.high && (s.high.claim || s.high.about), basis(s.high && s.high.basis, s.high && s.high.explained))}
      ${changeMind(s.high && s.high.explained)}
      ${line('Low', s.low && (s.low.claim || s.low.about), basis(s.low && s.low.basis, s.low && s.low.explained))}
      ${changeMind(s.low && s.low.explained)}
      ${line('Inquiry', s.question && s.question.question, s.question && s.question.contested ? 'people describe this differently' : '')}
      ${line('Focus', focus && focus.text, focusSub)}
      ${withheld}
      <div class="tstate-says">${esc(s.statement)}</div>
    </div>`;
}

/* The proactive voice — "want me to…". Renders the briefing's prompt offers, each
   with a one-tap CTA that drafts (a weekly plan, or a focused reflection for one
   person) and lets the leader approve, edit, or dismiss. Grounded in real signals;
   nothing is sent without approval. */
function _renderTeamPrompts(prompts) {
  const box = document.getElementById('team-prompts');
  if (!box) return;
  if (!prompts.length) { box.innerHTML = ''; return; }
  const esc = _escAdvisor;
  box.innerHTML = `<div class="intel-prompt-card">
    <div class="intel-prompt-head">IntelliQ suggests</div>
    ${prompts.map(p => `<div class="intel-prompt-row" data-tone="${esc(p.tone || '')}">
      <div class="intel-prompt-text">${esc(p.text)}</div>
      <div class="intel-prompt-actions">
        <button class="intel-watch-prep" onclick='runPrompt(this)' data-cta='${esc(JSON.stringify(p.cta || {}))}'>${esc((p.cta && p.cta.label) || 'Draft it')} →</button>
        <button class="btn btn-outline btn-sm" onclick="this.closest('.intel-prompt-row').style.display='none'">Not now</button>
      </div>
      <div class="intel-watch-draft" style="display:none"></div>
    </div>`).join('')}
  </div>`;
}

/* One CTA handler for every prompt: drafts via the prepare rails (a team plan, or a
   supportive reflection for one person) and shows it inline for approval. */
async function runPrompt(btn) {
  let cta = {}; try { cta = JSON.parse(btn.getAttribute('data-cta')); } catch (_) {}
  const row = btn.closest('.intel-prompt-row');
  const draftBox = row?.querySelector('.intel-watch-draft');
  if (!draftBox) return;
  const isTeam = cta.action !== 'support';
  const body = isTeam ? { kind: 'plan', theme: cta.theme || '' } : { kind: 'support', memberId: cta.memberId };
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = 'Drafting…';
  try {
    const res = await fetch('/api/intelligence/prepare', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...Auth._headers() },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    if (!res.ok || !d.ok) throw new Error();
    const dr = d.draft || {};
    const esc = _escAdvisor;
    btn.style.display = 'none';
    draftBox.style.display = 'block';
    const approve = isTeam
      ? `<button class="btn-primary btn-sm" onclick='deliverTeam(this)' data-draft='${esc(JSON.stringify(dr))}'>Approve &amp; send to team</button>`
      : `<button class="btn-primary btn-sm" onclick='deliverStep(${JSON.stringify(cta.memberId)}, this)' data-draft='${esc(JSON.stringify(dr))}'>Approve &amp; send</button>`;
    draftBox.innerHTML = `
      <div class="intel-draft-card">
        <div class="intel-draft-label">IntelliQ drafted this${dr.rationale ? ` — ${esc(dr.rationale)}` : ''}</div>
        <textarea class="intel-draft-msg">${esc(dr.message || '')}</textarea>
        <div class="intel-draft-meta">${isTeam ? 'Sends to your whole team as' : 'Sends as'}: <strong>${esc(dr.title)}</strong>${(dr.fields || []).length ? ` · ${dr.fields.length} short question${dr.fields.length !== 1 ? 's' : ''}` : ''}</div>
        <div class="intel-draft-actions">
          ${approve}
          <button class="btn btn-outline btn-sm" onclick="this.closest('.intel-prompt-row').style.display='none'">Not now</button>
        </div>
      </div>`;
  } catch (e) {
    btn.disabled = false; btn.textContent = orig;
    if (typeof showToast === 'function') showToast('Could not draft', 'error');
  }
}

/* "How your organisation learns" — discoveries about CONTEXT (tenure, team,
   approach), not about a person. The research surface: honest, correlational,
   evidence-gated. Rendered quietly below the fold — it's insight, not an alert. */
async function _renderDiscoveries() {
  const box = document.getElementById('org-discoveries');
  if (!box) return;
  try {
    const res = await fetch('/api/intelligence/discoveries', { headers: Auth._headers() });
    if (!res.ok) return;
    const d = await res.json();
    const items = d.discoveries || [];
    if (!items.length) { box.innerHTML = ''; return; }
    const esc = _escAdvisor;
    box.innerHTML = `<div class="intel-watch-card intel-discoveries">
      <div class="intel-watch-head">How your ${d.scope === 'team' ? 'team' : 'organisation'} learns</div>
      ${items.map(it => `<div class="intel-discovery">
        <div class="intel-discovery-area">${esc(it.area)}</div>
        <div class="intel-discovery-text">${esc(it.statement)}</div>
        <div class="intel-discovery-basis">${esc(it.basis)} · ${esc(it.confidence)}</div>
      </div>`).join('')}
      <div class="intel-watch-why" style="margin-top:0.5rem">${esc(d.note || '')}</div>
    </div>`;
  } catch (_) { /* non-fatal */ }
}

/* Proactive early-warning banner — "catch it before it becomes a problem." Fills
   #team-watch with EMERGING concerns (before they grow), who needs a conversation
   now, and who's rising. Contentless + care-first; private detail is never shown. */
async function _renderTeamWatch() {
  const box = document.getElementById('team-watch');
  if (!box) return;
  try {
    const res = await fetch('/api/intelligence/watch', { headers: Auth._headers() });
    if (!res.ok) return;
    const d = await res.json();
    if (!d.ok) return;
    const esc = _escAdvisor;
    const item = (r, color, intent) => {
      const factors = (r.factors || []).filter(Boolean);
      return `<div class="intel-watch-row" data-mid="${esc(r.memberId || '')}">
      <span class="intel-watch-dot" style="background:${color}"></span>
      <div style="flex:1"><strong>${esc(r.name)}</strong> — ${esc(r.why)}${r.careFlag ? ' <span title="private context informs this" style="opacity:0.6;font-size:0.72rem">· private context</span>' : ''}
        <div class="intel-watch-action">${esc(r.action)}</div>
        ${factors.length ? `<div class="intel-watch-why">What's working: ${factors.map(f => esc(f)).join(', ')}</div>` : ''}
        <div style="display:flex;gap:0.35rem;flex-wrap:wrap;margin-top:4px">
          ${r.memberId ? `<button class="intel-watch-prep" onclick="prepareStep('${esc(r.memberId)}','${intent}',this)">${intent === 'recognition' ? 'Prepare recognition →' : 'Prepare a step →'}</button>` : ''}
          ${intent === 'recognition' && factors.length ? `<button class="intel-watch-prep" onclick="replicateStep('${esc(factors[0])}','${esc(r.name)}',this)">Replicate across the team →</button>` : ''}
        </div>
        <div class="intel-watch-draft" style="display:none"></div></div>
    </div>`;
    };
    // Each category is a collapsible so a long watch list doesn't dominate the page.
    const cat = (rows, cls, head, color, intent, open) => rows.length
      ? `<details class="intel-watch-card ${cls} intel-collapse"${open ? ' open' : ''}><summary class="intel-watch-head">${head} <span class="collapse-count">${rows.length}</span></summary>${rows.map(r => item(r, color, intent)).join('')}</details>`
      : '';
    let html = '';
    html += cat(d.attention || [], 'intel-watch-attention', 'Needs you now', '#f74f4f', 'support', true);
    html += cat(d.emerging || [], 'intel-watch-emerging', 'Worth a look — before it grows', '#f7a84f', 'support', true);
    html += cat(d.rising || [], 'intel-watch-rising', 'Going well — worth recognising', '#0ecfb0', 'recognition', false);
    if (!html && d.scanned) {
      html = `<div class="intel-watch-card"><div class="intel-watch-head" style="color:var(--text-muted)">Nothing emerging — all ${d.scanned} steady. IntelliQ will flag drift here before it shows in results.</div></div>`;
    }
    box.innerHTML = html;
  } catch (_) { /* non-fatal — the main read still shows */ }
}

/* "Here's what I've already drafted" — IntelliQ prepares a supportive intervention
   for a flagged person; the leader approves or edits. One approval = it's sent. */
async function prepareStep(memberId, intent, btn) {
  const row = btn.closest('.intel-watch-row');
  const draftBox = row?.querySelector('.intel-watch-draft');
  if (!draftBox) return;
  btn.disabled = true; btn.textContent = 'Drafting…';
  try {
    const res = await fetch('/api/intelligence/prepare', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...Auth._headers() },
      body: JSON.stringify({ memberId, kind: intent }),
    });
    const d = await res.json();
    if (!res.ok || !d.ok) throw new Error();
    const dr = d.draft || {};
    const esc = _escAdvisor;
    btn.style.display = 'none';
    draftBox.style.display = 'block';
    draftBox.innerHTML = `
      <div class="intel-draft-card">
        <div class="intel-draft-label">IntelliQ drafted this${dr.rationale ? ` — ${esc(dr.rationale)}` : ''}</div>
        <textarea class="intel-draft-msg">${esc(dr.message || '')}</textarea>
        <div class="intel-draft-meta">Sends as: <strong>${esc(dr.title)}</strong>${(dr.fields || []).length ? ` · ${dr.fields.length} short question${dr.fields.length !== 1 ? 's' : ''}` : ''}</div>
        <div class="intel-draft-actions">
          <button class="btn-primary btn-sm" onclick='deliverStep(${JSON.stringify(memberId)}, this)' data-draft='${esc(JSON.stringify(dr))}'>Approve &amp; send</button>
          <button class="btn btn-outline btn-sm" onclick="this.closest('.intel-watch-draft').style.display='none'; this.closest('.intel-watch-row').querySelector('.intel-watch-prep').style.display=''">Not now</button>
        </div>
      </div>`;
  } catch (e) {
    btn.disabled = false; btn.textContent = intent === 'recognition' ? 'Prepare recognition →' : 'Prepare a step →';
    if (typeof showToast === 'function') showToast('Could not draft', 'error');
  }
}

async function deliverStep(memberId, btn) {
  let dr = {}; try { dr = JSON.parse(btn.getAttribute('data-draft')); } catch (_) {}
  const msgEl = btn.closest('.intel-draft-card')?.querySelector('.intel-draft-msg');
  const message = msgEl ? msgEl.value.trim() : '';
  btn.disabled = true; btn.textContent = 'Sending…';
  try {
    // The edited message becomes the first field's context; deliver assigns it.
    const fields = (dr.fields && dr.fields.length ? dr.fields : [{ label: 'How are things going?' }]);
    const res = await fetch('/api/intelligence/deliver', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...Auth._headers() },
      body: JSON.stringify({ memberId, title: dr.title, description: (message ? message + '\n\n' : '') + (dr.description || ''), fields }),
    });
    if (!res.ok) throw new Error();
    const card = btn.closest('.intel-watch-draft');
    if (card) card.innerHTML = `<div class="intel-draft-sent">Sent — it's in their queue now.</div>`;
    if (typeof showToast === 'function') showToast('Sent ', 'success');
  } catch (e) {
    btn.disabled = false; btn.textContent = 'Approve & send';
    if (typeof showToast === 'function') showToast('Could not send', 'error');
  }
}

/* Scale a success pattern — IntelliQ drafts a team-wide reflection to build the
   strength behind someone's momentum; the leader approves and it goes to everyone. */
async function replicateStep(factor, sourceName, btn) {
  const row = btn.closest('.intel-watch-row');
  const draftBox = row?.querySelector('.intel-watch-draft');
  if (!draftBox) return;
  btn.disabled = true; btn.textContent = 'Drafting…';
  try {
    const res = await fetch('/api/intelligence/prepare', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...Auth._headers() },
      body: JSON.stringify({ kind: 'replicate', factor, sourceName }),
    });
    const d = await res.json();
    if (!res.ok || !d.ok) throw new Error();
    const dr = d.draft || {};
    const esc = _escAdvisor;
    draftBox.style.display = 'block';
    draftBox.innerHTML = `
      <div class="intel-draft-card">
        <div class="intel-draft-label">IntelliQ drafted a team-wide step${dr.rationale ? ` — ${esc(dr.rationale)}` : ''}</div>
        <textarea class="intel-draft-msg">${esc(dr.message || '')}</textarea>
        <div class="intel-draft-meta">Sends to your whole team as: <strong>${esc(dr.title)}</strong></div>
        <div class="intel-draft-actions">
          <button class="btn-primary btn-sm" onclick='deliverTeam(this)' data-draft='${esc(JSON.stringify(dr))}'>Approve &amp; send to team</button>
          <button class="btn btn-outline btn-sm" onclick="this.closest('.intel-watch-draft').style.display='none'">Not now</button>
        </div>
      </div>`;
    btn.disabled = false; btn.textContent = 'Replicate across the team →';
  } catch (e) {
    btn.disabled = false; btn.textContent = 'Replicate across the team →';
    if (typeof showToast === 'function') showToast('Could not draft', 'error');
  }
}

async function deliverTeam(btn) {
  let dr = {}; try { dr = JSON.parse(btn.getAttribute('data-draft')); } catch (_) {}
  const msgEl = btn.closest('.intel-draft-card')?.querySelector('.intel-draft-msg');
  const message = msgEl ? msgEl.value.trim() : '';
  btn.disabled = true; btn.textContent = 'Sending…';
  try {
    const fields = (dr.fields && dr.fields.length ? dr.fields : [{ label: 'How could you do more of this?' }]);
    const res = await fetch('/api/intelligence/deliver', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...Auth._headers() },
      body: JSON.stringify({ toTeam: true, title: dr.title, description: (message ? message + '\n\n' : '') + (dr.description || ''), fields }),
    });
    const d = await res.json();
    if (!res.ok || !d.ok) throw new Error();
    const card = btn.closest('.intel-watch-draft');
    if (card) card.innerHTML = `<div class="intel-draft-sent">Sent to ${d.sent || 'the'} team member${d.sent === 1 ? '' : 's'} — it's in their queues now.</div>`;
    if (typeof showToast === 'function') showToast('Sent to the team ', 'success');
  } catch (e) {
    btn.disabled = false; btn.textContent = 'Approve & send to team';
    if (typeof showToast === 'function') showToast('Could not send', 'error');
  }
}

function _intelCard(it) {
  const sevColor = _INTEL_SEV[it.severity] || '#4f8ef7';
  const chips = (it.patterns || []).map(p =>
    `<span class="intel-chip" title="${_escAdvisor(p.confidence || '')}">${_escAdvisor(p.label)}</span>`).join('');
  const ev = (it.evidence || []).map(e => `<li>${_escAdvisor(e)}</li>`).join('');
  return `
    <div class="intel-card" style="border-left:3px solid ${sevColor}">
      <div class="intel-card-head">
        <span class="intel-card-name">${_escAdvisor(it.headline || 'Across your visible scope')}</span>
        <span class="intel-chips">${chips}${it.reliability && it.reliability !== 'calibrating' ? `<span class="intel-rel">${_escAdvisor(it.reliability)}</span>` : ''}</span>
      </div>
      <div class="intel-why">${_escAdvisor(it.body || it.whyNow)}</div>
      ${(it.deviations || []).length ? `<div class="intel-dev">${it.deviations.slice(0, 3).map(_intelDevChip).join('')}</div>` : ''}
      ${(it.connections || []).length ? `<div class="intel-conn">${_escAdvisor(it.connections[0].basis)} <span class="intel-conn-hint">(a connection, not a cause)</span></div>` : ''}
      ${ev ? `<details class="intel-ev"><summary>Evidence basis</summary><ul>${ev}</ul></details>` : ''}
      ${it.careFlag ? `<div class="intel-care">There may be personal context here — lead with care. Details are kept private.</div>` : ''}
      ${it.suggestion?.text || it.recommendedAction ? `<div class="intel-action"><strong>Consider:</strong> ${_escAdvisor(it.suggestion?.text || it.recommendedAction)}</div>` : ''}
      ${it.learnedNote ? `<div class="intel-learned">${_escAdvisor(it.learnedNote)}</div>` : ''}
      ${it.perspective !== 'web' && it.memberId ? `<div class="intel-cta" id="intel-cta-${it.memberId}">
        <button class="intel-btn" onclick="intelAct('${it.memberId}','${it.patternType || ''}',this)">I acted on this</button>
        <button class="intel-btn intel-btn-ghost" onclick="showProfile('${it.memberId}')">Open profile</button>
        <button class="intel-btn intel-btn-ghost" title="Teaches the system this kind of flag isn't useful here" onclick="intelDismiss('${it.patternType || ''}','${it.memberId}',this)">Not useful</button>
      </div>` : ''}
    </div>`;
}

/* ── THE LEADER'S OUTCOME LOOP ───────────────────────────────────────────────
   Notice, act, say what happened, learn. Restored after a pass that emitted only
   aggregate Web items and left POST /api/intelligence/act with no caller in the
   entire front end — an outcome loop the pilot exists to test, unreachable.

   These act on PERSON items only. A Web item names nobody, so there is nobody to
   act on and no card renders these buttons. */
async function intelAct(memberId, patternType, btn) {
  const action = prompt('What did you do? A quick note of the action you took:');
  if (!action || !action.trim()) return;
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  try {
    const res = await fetch('/api/intelligence/act', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...Auth._headers() },
      body: JSON.stringify({ orgCode: AppState.orgCode, memberId, patternType, action }),
    });
    const d = await res.json();
    if (!res.ok || !d.ok) throw new Error(d.error || 'failed');
    // Acting on a flag teaches the Confidence Engine it was useful.
    if (patternType) intelNoticeFeedback(patternType, 'useful');
    const cta = document.getElementById('intel-cta-' + memberId);
    if (cta) cta.innerHTML = `
      <span class="intel-logged">Logged — how did it go?</span>
      <button class="intel-oc" onclick="intelOutcome('${d.interventionId}','positive',this)">Helped</button>
      <button class="intel-oc" onclick="intelOutcome('${d.interventionId}','neutral',this)">No change</button>
      <button class="intel-oc" onclick="intelOutcome('${d.interventionId}','negative',this)">Worse</button>`;
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = 'I acted on this'; }
    showToast('Could not log the action', 'warning');
  }
}

/* Teach the Confidence Engine which kinds of noticing are useful here. */
async function intelNoticeFeedback(type, feedback) {
  if (!type) return;
  try {
    await fetch('/api/intelligence/notice-feedback', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...Auth._headers() },
      body: JSON.stringify({ orgCode: AppState.orgCode, type, feedback }),
    });
  } catch (_) { /* fire-and-forget */ }
}

async function intelDismiss(type, memberId, btn) {
  intelNoticeFeedback(type, 'dismiss');
  const card = btn?.closest('.intel-card');
  if (card) { card.style.opacity = '0.45'; const cta = document.getElementById('intel-cta-' + memberId); if (cta) cta.innerHTML = `<span class="intel-logged">Noted — you'll see less of this kind here.</span>`; }
}

async function intelOutcome(interventionId, outcome, btn) {
  if (btn) btn.disabled = true;
  try {
    const res = await fetch('/api/intelligence/outcome', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...Auth._headers() },
      body: JSON.stringify({ orgCode: AppState.orgCode, interventionId, outcome }),
    });
    const d = await res.json();
    if (!res.ok || !d.ok) throw new Error();
    const p = btn?.parentElement;
    if (p) p.innerHTML = `<span class="intel-logged">Outcome recorded — the system learns from this for similar patterns.</span>`;
  } catch (e) {
    if (btn) btn.disabled = false;
    showToast('Could not record the outcome', 'warning');
  }
}

/* Self-relative deviation chip — "vs their OWN normal", the Behaviour Engine view. */
function _intelDevChip(d) {
  const arrow = d.direction === 'below' ? '↓' : '↑';
  const col = d.direction === 'below' ? 'var(--danger)' : 'var(--success)';
  // Direction only — never the member's numbers (deviation %, "usual" value).
  return `<span class="intel-devchip" title="vs their own normal · ${_escAdvisor(d.confidence || '')}">
    <span style="color:${col}">${arrow}</span> ${_escAdvisor(d.label)} ${d.direction} their usual</span>`;
}

/* ── Leader People ───────────────────────────────────────── *
 * Answers: "Who am I responsible for?"
 * Full subtree member list with check-in status, role, and
 * links to profiles. No members outside the leader's subtree.
 * ── ────────────────────────────────────────────────────── */
let _leaderTree         = { tree: [], unassigned: [] };
let _leaderPeopleSearch = '';

let _peopleSummaryHTML = '';   // the calm counts strip, prepended to the tree

async function renderLeaderPeople() {
  const el       = document.getElementById('ldr-people-content');
  const countEl  = document.getElementById('ldr-people-count');
  if (!el) return;

  el.innerHTML = `<div style="padding:1.5rem;text-align:center;color:var(--text-muted)">Loading…</div>`;

  try {
    // Tree structure + the kernel's at-a-glance status for everyone in scope.
    const [treeRes, rosRes] = await Promise.all([
      fetch('/api/workspace/my-tree', { headers: Auth._headers() }),
      fetch('/api/intelligence/roster', { headers: Auth._headers() }),
    ]);
    const data = treeRes.ok ? await treeRes.json() : { ok: false };
    if (!data.ok) throw new Error('Request failed');
    const ros = rosRes.ok ? await rosRes.json() : { roster: [], counts: {}, count: 0 };

    _peopleSummaryHTML = `<div class="ppl-summary"><span class="ppl-sum">${ros.count || 0} people in your visible scope</span></div>`;

    _leaderTree = { tree: data.tree || [], unassigned: data.unassigned || [] };
    const n = data.totalVisible || ros.count || 0;
    if (countEl) countEl.textContent = `${n} ${n !== 1 ? 'people' : 'person'}${ros.orgWide ? ' across the org' : ' below you'}`;
    _renderLeaderPeopleList();
  } catch(e) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon"></div><p>Could not load your people. Try refreshing.</p></div>`;
  }
}

function filterLeaderPeople(search) {
  _leaderPeopleSearch = (search || '').toLowerCase();
  _renderLeaderPeopleList();
}

// One member row (shared by tree nodes + unassigned bucket)
function _leaderMemberRowHTML(m) {
  const initials  = (m.name || '?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  const roleLabel = Auth.ROLE_LABELS?.[m.role] || m.role || 'Member';
  const isPending = !m.passwordSet;
  return `
    <div class="leader-member-row" onclick="showProfile('${m.userId}')" style="cursor:pointer">
      <div class="lm-avatar">${initials}</div>
      <div class="lm-info">
        <div class="lm-name">${_escAdvisor(m.name)}
          ${isPending ? `<span class="lm-badge lm-badge--pending">PENDING</span>` : ''}
        </div>
        <div class="lm-meta">${_escAdvisor(roleLabel)}${m.email ? ' · ' + _escAdvisor(m.email) : ''}</div>
      </div>
      <div class="lm-status">
        <button class="lm-observe" title="Recognise or note"
          onclick="event.stopPropagation();leaderObserve('${m.userId}','${(m.name||'').replace(/['"\\<>]/g,'')}')">Recognise</button>
      </div>
    </div>`;
}

/* Leader records an observation ABOUT a person — recognition (shared with them)
   or a concern (kept private). A small self-contained modal; never throws. */
function leaderObserve(userId, name) {
  document.getElementById('observe-modal')?.remove();
  const el = document.createElement('div');
  el.id = 'observe-modal'; el.className = 'modal-overlay'; el.style.display = 'flex';
  el.dataset.kind = 'recognition';
  el.innerHTML = `
    <div class="modal-card observe-card">
      <div class="modal-title">Note about ${(name||'them').replace(/[<>]/g,'')}</div>
      <div class="obs-kind" id="obs-kind">
        <button data-k="recognition" class="active">Recognition</button>
        <button data-k="concern">Concern</button>
      </div>
      <div class="obs-hint" id="obs-hint">Recognition is shared with them — a chance to make them feel seen.</div>
      <textarea class="note-input" id="obs-text" placeholder="What did you notice?"></textarea>
      <div class="composer-actions">
        <button class="btn-primary" onclick="submitObserve('${userId}')">Send</button>
        <button class="btn btn-outline btn-sm" onclick="document.getElementById('observe-modal')?.remove()">Cancel</button>
        <span id="obs-status" style="font-size:0.78rem;color:var(--text-muted)"></span>
      </div>
    </div>`;
  el.addEventListener('click', e => { if (e.target === el) el.remove(); });
  document.body.appendChild(el);
  el.querySelectorAll('#obs-kind button').forEach(b => b.onclick = () => {
    el.querySelectorAll('#obs-kind button').forEach(x => x.classList.remove('active'));
    b.classList.add('active'); el.dataset.kind = b.dataset.k;
    const hint = document.getElementById('obs-hint');
    if (hint) hint.textContent = b.dataset.k === 'concern'
      ? 'A concern stays private — it informs your read, it is never shown to them.'
      : 'Recognition is shared with them — a chance to make them feel seen.';
  });
}

async function submitObserve(userId) {
  const el = document.getElementById('observe-modal');
  const kind = el?.dataset.kind || 'recognition';
  const text = (document.getElementById('obs-text')?.value || '').trim();
  const status = document.getElementById('obs-status');
  if (!text) { if (status) status.textContent = 'Add a line first.'; return; }
  try {
    const res = await fetch('/api/observe', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...Auth._headers() },
      body: JSON.stringify({ subjectId: userId, kind, text }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || 'failed');
    if (status) status.textContent = d.routed || 'Recorded.';
    setTimeout(() => document.getElementById('observe-modal')?.remove(), 1500);
  } catch (e) { if (status) status.textContent = 'Could not send — try again.'; }
}

// Render one tree node (recursive). Returns '' if nothing matches the search.
function _leaderNodeHTML(node, depth) {
  const matches = m => !_leaderPeopleSearch
    || m.name.toLowerCase().includes(_leaderPeopleSearch)
    || (m.email || '').toLowerCase().includes(_leaderPeopleSearch);
  const members  = (node.members || []).filter(matches);
  const childHTML = (node.children || []).map(c => _leaderNodeHTML(c, depth + 1)).join('');
  // Hide a node entirely if searching and it has no matches anywhere below.
  if (_leaderPeopleSearch && !members.length && !childHTML) return '';
  const count = _subtreeCount(node);
  return `
    <div class="ltree-node" style="margin-left:${depth ? 14 : 0}px">
      <div class="ltree-node-head">
        <span class="ltree-branch">${depth ? '└' : '▸'}</span>
        <span class="ltree-node-name">${_escAdvisor(node.name)}</span>
        <span class="ltree-node-count">${count}</span>
      </div>
      <div class="ltree-members">
        ${members.map(_leaderMemberRowHTML).join('') || (members.length === 0 && !(node.children||[]).length ? `<div class="ltree-empty">No members here yet.</div>` : '')}
      </div>
      ${childHTML}
    </div>`;
}

function _subtreeCount(node) {
  let n = (node.members || []).length;
  (node.children || []).forEach(c => { n += _subtreeCount(c); });
  return n;
}

function _renderLeaderPeopleList() {
  const el = document.getElementById('ldr-people-content');
  if (!el) return;

  const { tree, unassigned } = _leaderTree;
  const hasAny = (tree && tree.length) || (unassigned && unassigned.length);

  if (!hasAny) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon"></div>
        <p>No tiers below you yet. Add a sub-node under your group in the Org Tree,
           or use “＋ Add Member” to add someone directly under you.</p>
      </div>`;
    return;
  }

  const matches = m => !_leaderPeopleSearch
    || m.name.toLowerCase().includes(_leaderPeopleSearch)
    || (m.email || '').toLowerCase().includes(_leaderPeopleSearch);

  const treeHTML = (tree || []).map(n => _leaderNodeHTML(n, 0)).join('');
  const unMatched = (unassigned || []).filter(matches);
  const unassignedHTML = unMatched.length ? `
    <div class="ltree-node">
      <div class="ltree-node-head">
        <span class="ltree-branch">▸</span>
        <span class="ltree-node-name">Directly under you</span>
        <span class="ltree-node-count">${unMatched.length}</span>
      </div>
      <div class="ltree-members">${unMatched.map(_leaderMemberRowHTML).join('')}</div>
    </div>` : '';

  el.innerHTML = `${_peopleSummaryHTML || ''}<div class="ltree">${treeHTML}${unassignedHTML}</div>`;
}

/* ── Add Member to my subtree (item C) ───────────────────────────────────────
   A leader adds a plain member under themselves. Server forces placement into
   the leader's subtree and only permits role 'member' (see create-user). */
function toggleLeaderAddMember() {
  const box = document.getElementById('ldr-add-member');
  if (!box) return;
  const open = box.style.display !== 'none';
  box.style.display = open ? 'none' : 'block';
  if (!open) document.getElementById('ldr-add-first')?.focus();
}

async function leaderAddMember() {
  const first = (document.getElementById('ldr-add-first')?.value || '').trim();
  const last  = (document.getElementById('ldr-add-last')?.value  || '').trim();
  const email = (document.getElementById('ldr-add-email')?.value || '').trim().toLowerCase();
  const btn   = document.getElementById('ldr-add-submit');
  const out   = document.getElementById('ldr-add-result');
  if (!out) return;

  if (!first)  { out.style.color = 'var(--danger)'; out.textContent = 'First name is required.'; return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { out.style.color = 'var(--danger)'; out.textContent = 'Enter a valid email.'; return; }

  if (btn) { btn.disabled = true; btn.textContent = 'Adding…'; }
  out.style.color = 'var(--text-muted)';
  out.textContent = 'Creating account…';
  try {
    const res = await fetch('/api/auth/create-user', {
      method: 'POST', headers: Auth._headers(),
      body: JSON.stringify({
        orgCode:   AppState.orgCode,
        creatorId: Auth.currentUser?.id,
        firstName: first, lastName: last, name: `${first} ${last}`.trim(),
        email, role: 'member',
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Could not add member');

    out.style.color = 'var(--success)';
    out.textContent = `${data.user.name} added under you.`;
    ['ldr-add-first','ldr-add-last','ldr-add-email'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    renderLeaderPeople(); // refresh the list (now includes the new member)
  } catch (err) {
    out.style.color = 'var(--danger)';
    out.textContent = `${err.message}`;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Add'; }
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
          ${ci.concern !== 'none' ? `<span class="coach-log-concern concern-${ci.concern}">${ci.concern === 'monitor' ? 'Monitor' : 'Urgent'}</span>` : ''}
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
            <button class="concern-btn active-none" id="concern-none"    onclick="setConcernLevel('none')"   >No Concern</button>
            <button class="concern-btn"             id="concern-monitor" onclick="setConcernLevel('monitor')">Monitor</button>
            <button class="concern-btn"             id="concern-urgent"  onclick="setConcernLevel('urgent')" >Urgent</button>
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
    <div style="font-size:2.5rem"></div>
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
        copyBtn.textContent = 'Copied ';
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
  // Nav items are bound where the sidebar nav is rendered (the one dynamic, permission-filtered
  // binder) — Phase-1 Cut G. No second DOMContentLoaded binder (the sidebar is empty until render).
  // Notification panel toggle (null-safe — topbar chrome may be absent on the one-page flow)
  document.getElementById('notif-btn')?.addEventListener('click', toggleNotifPanel);
  document.getElementById('notif-panel-close')?.addEventListener('click', ()=>{
    document.getElementById('notif-panel')?.classList.remove('open');
  });
  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(ov => {
    ov.addEventListener('click', e => { if(e.target===ov) closeAllModals(); });
  });
  // Keyboard: Escape closes modals
  document.addEventListener('keydown', e => {
    if(e.key==='Escape') closeAllModals();
  });
});

/* ============================================================
   [REMOVED] MyWorkspace (the old app.js "conversation-first" composer).
   Phase-1 consolidation: this was a SECOND composer surface (its own mw-input,
   lenses, ask→/api/workspace/ask, capture) that duplicated the unified assistant
   surface `MemberApp._renderMyWorkspace()` (#iq-myworkspace) on the Home ("Me")
   page. Both rendered into #assessments-root and fought over it. The "MyWorkspace"
   nav item (page 'assessments') now routes to MemberApp._renderAssessments() — the
   member's assigned-work surface — so there is exactly ONE composer/one runtime.
   The /api/workspace/ask endpoint remains (still test-covered) but is now UI-orphaned
   and slated to fold into the unified _assistantTurn runtime in a following commit.
   ============================================================ */
