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
    this.currentUser = null;
    this.currentOrg  = null;
    this.token       = null;
    localStorage.removeItem('iq_auth');
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
    // Fetch permissions after login (login endpoint doesn't resolve them)
    this.save();
    // Fire-and-forget permissions refresh — non-blocking
    this.getMe().catch(() => {});
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

  /* ── Delete user ───────────────────────────────────────── */
  async deleteUser(userId) {
    const res  = await fetch('/api/auth/delete-user', {
      method: 'DELETE', headers: this._headers(),
      body: JSON.stringify({ orgCode: this.currentUser.orgCode, userId }),
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
