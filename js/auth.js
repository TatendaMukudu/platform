/* ============================================================
   PLATFORM — AUTH & HIERARCHY
   Handles login, org setup, user management, and the
   visual hierarchy tree.
   ============================================================ */

const Auth = {

  /* ── State ─────────────────────────────────────────────── */
  currentUser:  null,
  currentOrg:   null,
  token:        null,
  permissions:  null,  // Sprint 2: loaded from server via getMe()

  ROLE_LABELS: {
    superadmin: 'Super Admin',
    admin:      'Admin',
    coach:      'Coach / Staff',
    member:     'Member',
  },
  ROLE_ICONS: {
    superadmin: '🔑',
    admin:      '📋',
    coach:      '👟',
    member:     '🔵',
  },
  ROLE_ORDER: { superadmin:1, admin:2, coach:3, member:4 },

  /* ── Boot ──────────────────────────────────────────────── */
  init() {
    const saved = localStorage.getItem('iq_auth');
    if (saved) {
      try {
        const { user, org, token, permissions } = JSON.parse(saved);
        this.currentUser = user;
        this.currentOrg  = org;
        this.token       = token || null;
        this.permissions = permissions || null;
        return true; // already logged in
      } catch(e) { localStorage.removeItem('iq_auth'); }
    }
    return false;
  },

  save() {
    localStorage.setItem('iq_auth', JSON.stringify({
      user:        this.currentUser,
      org:         this.currentOrg,
      token:       this.token,
      permissions: this.permissions,
    }));
  },

  /* ── Permission check ──────────────────────────────────── */
  canDo(perm) {
    if (!this.permissions) return this.isSuperAdmin(); // not loaded yet
    return this.permissions[perm] === true;
  },

  logout() {
    // Wipe member-specific localStorage so data doesn't leak on shared devices.
    // Keys are user-ID-scoped so only this user's entries are removed.
    const uid = this.currentUser?.id;
    if (uid) {
      ['iq_results_', 'iq_checkins_', 'iq_goals_', 'iq_insight_'].forEach(prefix =>
        localStorage.removeItem(prefix + uid)
      );
      // Sweep weekly-assessment flags: iq_weekly_{week}_{userId}
      const toRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('iq_weekly_') && k.endsWith('_' + uid)) toRemove.push(k);
      }
      toRemove.forEach(k => localStorage.removeItem(k));
    }
    this.currentUser = null;
    this.currentOrg  = null;
    this.token       = null;
    localStorage.removeItem('iq_auth');
    // Strip URL query params (e.g. invite token) so the login screen is clean
    if (window.location.search || window.location.hash) {
      window.history.replaceState({}, '', window.location.pathname);
    }
    location.reload();
  },

  /* ── Auth headers helper ───────────────────────────────── */
  _headers(extra = {}) {
    const h = { 'Content-Type': 'application/json', ...extra };
    if (this.token) h['Authorization'] = `Bearer ${this.token}`;
    return h;
  },

  isMember()     { return this.currentUser?.role === 'member'; },
  isCoach()      { return ['coach','admin','superadmin'].includes(this.currentUser?.role); },
  isAdmin()      { return ['admin','superadmin'].includes(this.currentUser?.role); },
  isSuperAdmin() { return this.currentUser?.role === 'superadmin'; },

  // Returns true if this user leads anyone — a node, a supervisor subtree, or a
  // group. The server computes this in /api/auth/me as `leads` (see _isLeader);
  // we fall back to leadershipNodeIds for older cached sessions.
  // Leader users get a scoped Leader Workspace in the nav.
  isLeaderNode() {
    return this.currentUser?.leads === true
      || (this.currentUser?.leadershipNodeIds?.length || 0) > 0;
  },

  canManageRole(role) {
    const myLevel   = this.ROLE_ORDER[this.currentUser?.role] || 99;
    const theirLevel = this.ROLE_ORDER[role] || 99;
    return myLevel < theirLevel || this.isSuperAdmin();
  },

  /* ── Setup org ─────────────────────────────────────────── */
  async setupOrg(orgName, orgMode, { firstName, lastName, email }, password) {
    const adminName = `${firstName} ${lastName}`.trim();
    const res  = await fetch('/api/auth/setup-org', {
      method: 'POST', headers: this._headers(),
      body: JSON.stringify({ orgName, orgMode, adminName, firstName, lastName, email, password }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    if (data.token) {
      this.currentUser = data.user || { id: data.userId, name: adminName, firstName, lastName, email, role: 'superadmin', orgCode: data.orgCode };
      this.currentOrg  = { orgCode: data.orgCode, orgName: data.orgName, orgMode };
      this.token = data.token;
      this.save();
    }
    return data;
  },

  /* ── Login ─────────────────────────────────────────────── */
  async login(email, password) {
    const res  = await fetch('/api/auth/login', {
      method: 'POST', headers: this._headers(),
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    this.currentUser = data.user;
    this.currentOrg  = data.org;
    this.token       = data.token || null;
    this.save();
    // NOTE: getMe() is NOT called here. Callers (handleLogin, handleInviteRegister)
    // explicitly await getMe() after Auth.login() so they control the sequence.
    // The old fire-and-forget pattern caused a race: getMe() could overwrite
    // profileComplete:true (written by repair logic) with false from the server.
    return data;
  },

  // createUser removed in Sprint 2.5 — use /api/auth/create-user directly with email required.
  // bulkCreate removed in Sprint 2 — name-only creation without email is no longer supported.

  /* ── Generate invite link ──────────────────────────────── */
  async generateInvite({ orgCode, role = 'member', label = '', expiryDays = 14 } = {}) {
    const res  = await fetch('/api/auth/invite', {
      method: 'POST', headers: this._headers(),
      body: JSON.stringify({
        orgCode: orgCode || this.currentUser?.orgCode,
        role,
        label,
        expiryDays,
      }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    return `${location.origin}/?invite=${data.token}`;
  },

  /* ── Get current user profile (refreshes from server) ─── */
  async getMe() {
    const res  = await fetch('/api/auth/me', { headers: this._headers() });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    this.currentUser = data.user;
    this.currentOrg  = data.org;
    this.permissions = data.permissions || null;
    this.save();
    return data;
  },

  /* ── Visibility-scoped member list (Phase 2) ──────────── *
   *  Returns only users this account is permitted to see,    *
   *  enforced server-side by tree position + permissions.    *
   *  SuperAdmin/Admin → full org. Coach → subtree. Member → self.
   * ──────────────────────────────────────────────────────── */
  async loadVisibleMembers() {
    const res  = await fetch('/api/workspace/visible-members', { headers: this._headers() });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    return data; // { ok, members[], visibleCount, requestingUserId }
  },

  /* ── Get hierarchy tree ────────────────────────────────── */
  async getOrgTree() {
    const res  = await fetch(
      `/api/auth/org-tree?orgCode=${encodeURIComponent(this.currentUser.orgCode)}`,
      { headers: this._headers() }
    );
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    return data;
  },

  /* ── Update user ───────────────────────────────────────── */
  async updateUser(userId, updates) {
    const res  = await fetch('/api/auth/update-user', {
      method: 'PUT', headers: this._headers(),
      body: JSON.stringify({ orgCode: this.currentUser.orgCode, userId, updates }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    return data.user;
  },

  /* ── Remove person (full cleanup) ─────────────────────── */
  async deleteUser(userId, { deleteData = false } = {}) {
    const qs  = deleteData ? '?deleteData=true' : '';
    const res = await fetch(`/api/auth/users/${encodeURIComponent(userId)}${qs}`, {
      method: 'DELETE', headers: this._headers(),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    return data;
  },
};

/* ============================================================
   HierarchyTree removed in Sprint 2.5.
   The supervisor-chain model is fully replaced by OrgTree (js/tree.js).
   All org structure is managed via generic nodes with parentId.
   People are onboarded via People → Onboard (email-required flow).
   ============================================================ */

// Stub kept so any stale onclick="HierarchyTree.*" calls fail gracefully
const HierarchyTree = {
  load() { console.warn('HierarchyTree is removed. Use OrgTree.'); return Promise.resolve(this); },
  render() { console.warn('HierarchyTree is removed. Use OrgTree.'); },
  openAddBelow() { if (typeof showToast === 'function') showToast('Use People → Onboard to add people.', 'info'); },
  openManage() { if (typeof showToast === 'function') showToast('Use People → Org Tree to manage structure.', 'info'); },
  addBulk() { if (typeof showToast === 'function') showToast('Bulk name-only creation is removed. Use People → Onboard → Import.', 'warning'); },
  _tree: [], _flat: [], _expanded: new Set(),
  async load() { return this; },

};

/* ── Helper: add a newly-created auth user into AppState.members ──────
   Uses buildRealMemberRecord so scores start null (real, not random).
   Never called at login — only called when a member is added via the UI
   so the page updates immediately without a full reload.
────────────────────────────────────────────────────────────────────── */
function _addMemberToAppState(authUser) {
  if (!AppState?.members) return;
  const existing = AppState.members.find(m =>
    m.userId === authUser.id || m.name.toLowerCase() === authUser.name.toLowerCase()
  );
  if (existing) return;
  const record = buildRealMemberRecord(authUser, AppState.members.length, AppState.mode);
  AppState.members.push(record);
  AppState.stats = buildEmptyOrgStats(AppState.members.length);
}
