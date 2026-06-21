/* ============================================================
   PLATFORM — ORG TREE
   Generic node-based org tree. No type assumptions — just
   nodes with names, descriptions, parents, members, and leaders.

   OrgNode: {
     nodeId, name, description, parentId, childNodeIds[],
     memberIds[], leaderIds[], createdAt, updatedAt
   }
   ============================================================ */

const OrgTree = {

  _nodes:    {},   // nodeId → OrgNode
  _expanded: new Set(),

  /* ── Load from server ───────────────────────────────────── */
  async load() {
    const res  = await fetch('/api/tree', { headers: Auth._headers() });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Failed to load tree');
    this._nodes = {};
    (data.nodes || []).forEach(n => { this._nodes[n.nodeId] = n; });
    return this;
  },

  /* ── Build tree (roots = nodes with no parent) ──────────── */
  _buildTree() {
    const byId  = this._nodes;
    const roots = [];
    Object.values(byId).forEach(node => {
      if (!node.parentId || !byId[node.parentId]) roots.push(node);
    });
    return roots.sort((a, b) => a.name.localeCompare(b.name));
  },

  _getChildren(parentId) {
    return Object.values(this._nodes)
      .filter(n => n.parentId === parentId)
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  /* ── Count helpers ──────────────────────────────────────── */
  _getDescendantIds(nodeId) {
    // BFS — returns Set of all descendant nodeIds (not including nodeId itself)
    const result  = new Set();
    const visited = new Set();
    const queue   = [...(this._nodes[nodeId]?.childNodeIds || [])];
    while (queue.length) {
      const id = queue.shift();
      if (visited.has(id)) continue;
      visited.add(id);
      result.add(id);
      const n = this._nodes[id];
      if (n?.childNodeIds) n.childNodeIds.forEach(c => queue.push(c));
    }
    return result;
  },

  _subtreeMemberCount(nodeId) {
    // Total unique member+leader count across node + all descendants
    const ids = new Set();
    const all = [nodeId, ...this._getDescendantIds(nodeId)];
    all.forEach(nid => {
      const n = this._nodes[nid];
      if (!n) return;
      (n.memberIds  || []).forEach(id => ids.add(id));
      (n.leaderIds  || []).forEach(id => ids.add(id));
    });
    return ids.size;
  },

  /* ── Render into a container element ───────────────────── */
  render(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;

    const roots = this._buildTree();
    const users = AppState?.members || [];

    if (!Object.keys(this._nodes).length) {
      el.innerHTML = `
        <div style="text-align:center;padding:3rem 2rem;color:var(--text-muted)">
          <div style="font-size:2.5rem;margin-bottom:0.6rem">🏗️</div>
          <div style="font-size:0.92rem;font-weight:700;color:var(--text-primary);margin-bottom:0.4rem">No structure yet</div>
          <div style="font-size:0.82rem;max-width:340px;margin:0 auto;line-height:1.6">
            Add your first group, department, team, or unit — then nest more nodes inside it.
          </div>
          ${Auth.canDo('manage_tree') ? `<button class="btn btn-accent btn-sm" style="margin-top:1.2rem" onclick="OrgTree.openAddNode(null)">+ Create First Node</button>` : ''}
        </div>`;
      return;
    }

    const canManage = Auth.canDo('manage_tree');
    el.innerHTML = `
      <div style="padding:1rem 0.5rem">
        ${canManage ? `
          <div style="display:flex;justify-content:flex-end;margin-bottom:1rem;padding:0 0.5rem">
            <button class="btn btn-accent btn-sm" onclick="OrgTree.openAddNode(null)">+ Add Top-Level Node</button>
          </div>` : ''}
        <div class="org-tree-list">${this._renderNodes(roots, 0, users, true)}</div>
      </div>`;
  },

  _renderNodes(nodes, depth, users, isRoot) {
    return nodes.map((node, i) => {
      const isLast = i === nodes.length - 1;
      return this._renderNode(node, depth, users, isLast, isRoot);
    }).join('');
  },

  _renderNode(node, depth, users, isLast, isRoot) {
    const children    = this._getChildren(node.nodeId);
    const hasKids     = children.length > 0;
    const expanded    = this._expanded.has(node.nodeId);
    const memberCount = (node.memberIds || []).length;
    const leaderCount = (node.leaderIds || []).length;
    const descIds     = this._getDescendantIds(node.nodeId);
    const subtotal    = this._subtreeMemberCount(node.nodeId);
    const canManage   = Auth.canDo('manage_tree');

    // Leader pills
    const leaderPills = (node.leaderIds || []).slice(0, 3).map(uid => {
      const u = users.find(m => m.userId === uid || m.id === uid);
      return u ? `<span style="font-size:0.7rem;background:rgba(124,90,245,0.15);border:1px solid rgba(124,90,245,0.35);color:var(--accent);border-radius:20px;padding:2px 7px">★ ${this._escHtml(u.name)}</span>` : '';
    }).filter(Boolean).join('');

    // Member pills (non-leaders)
    const nonLeaderIds = (node.memberIds || []).filter(id => !(node.leaderIds || []).includes(id));
    const memberPills  = nonLeaderIds.slice(0, 4).map(uid => {
      const u = users.find(m => m.userId === uid || m.id === uid);
      return u ? `<span style="font-size:0.7rem;background:var(--surface-2);border:1px solid var(--border);border-radius:20px;padding:2px 7px">${this._escHtml(u.name)}</span>` : '';
    }).filter(Boolean).join('');

    const overflow = (node.leaderIds || []).length > 3 || nonLeaderIds.length > 4
      ? `<span style="font-size:0.7rem;color:var(--text-muted)">+${Math.max(0, (node.leaderIds||[]).length - 3) + Math.max(0, nonLeaderIds.length - 4)} more</span>`
      : '';

    // Stats line
    const statParts = [];
    if (memberCount > 0 || leaderCount > 0) statParts.push(`${memberCount + leaderCount} ${(memberCount + leaderCount) === 1 ? 'person' : 'people'}`);
    if (leaderCount > 0) statParts.push(`${leaderCount} ${leaderCount === 1 ? 'leader' : 'leaders'}`);
    if (descIds.size > 0) statParts.push(`${subtotal} in subtree`);
    const statsLine = statParts.join(' · ');

    // Branch connector
    const indent = depth * 20;
    const connector = isRoot ? '' : `
      <div style="position:absolute;left:${indent - 12}px;top:0;bottom:0;width:12px;
        border-left:2px solid var(--border);border-bottom:2px solid var(--border);
        border-bottom-left-radius:4px;height:18px;top:14px"></div>`;

    return `
      <div style="position:relative;margin-left:${indent}px;margin-bottom:0.35rem">
        ${connector}
        <div style="background:var(--surface-1);border:1px solid var(--border);border-radius:8px;padding:0.65rem 0.8rem">
          <div style="display:flex;align-items:flex-start;gap:0.5rem">
            ${hasKids ? `
              <button onclick="OrgTree._toggle('${node.nodeId}')"
                style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:0.85rem;padding:0;width:18px;flex-shrink:0;margin-top:1px">
                ${expanded ? '▾' : '▸'}
              </button>` : '<span style="width:18px;flex-shrink:0"></span>'}
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap">
                <span style="font-weight:700;font-size:0.88rem">${this._escHtml(node.name)}</span>
                ${statsLine ? `<span style="font-size:0.72rem;color:var(--text-muted)">${statsLine}</span>` : ''}
              </div>
              ${node.description ? `<div style="font-size:0.75rem;color:var(--text-secondary);margin-top:2px;line-height:1.4">${this._escHtml(node.description)}</div>` : ''}
              ${(leaderPills || memberPills) ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:5px">${leaderPills}${memberPills}${overflow}</div>` : ''}
            </div>
          </div>
          ${canManage || true ? `
            <div style="display:flex;gap:0.35rem;flex-wrap:wrap;margin-top:0.55rem;padding-top:0.45rem;border-top:1px solid var(--border)">
              ${canManage ? `
                <button class="btn btn-outline btn-sm" style="padding:2px 7px;font-size:0.72rem" onclick="OrgTree.openAddNode('${node.nodeId}')">+ Child</button>
                <button class="btn btn-outline btn-sm" style="padding:2px 7px;font-size:0.72rem" onclick="OrgTree.openAddSibling('${node.nodeId}')">+ Sibling</button>
                <button class="btn btn-outline btn-sm" style="padding:2px 7px;font-size:0.72rem" onclick="OrgTree.openManageNode('${node.nodeId}')">⋯ Manage</button>
                <button class="btn btn-outline btn-sm" style="padding:2px 7px;font-size:0.72rem" onclick="OrgTree.openMoveNode('${node.nodeId}')">↕ Move</button>` : ''}
              <button class="btn btn-outline btn-sm" style="padding:2px 7px;font-size:0.72rem" onclick="OrgTree.openAssignPeople('${node.nodeId}')">👥 Assign People</button>
            </div>` : ''}
        </div>
        ${hasKids && expanded ? `
          <div style="margin-top:0.3rem">
            ${this._renderNodes(children, depth + 1, users, false)}
          </div>` : ''}
      </div>`;
  },

  _toggle(nodeId) {
    if (this._expanded.has(nodeId)) this._expanded.delete(nodeId);
    else this._expanded.add(nodeId);
    this.render('org-tree-container');
  },

  _escHtml(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  },

  /* ══════════════════════════════════════════════════════════
     ADD NODE
  ══════════════════════════════════════════════════════════ */
  openAddNode(parentId) {
    const parentNode = parentId ? this._nodes[parentId] : null;
    const title = parentId
      ? `Add node inside <strong>"${this._escHtml(parentNode?.name || parentId)}"</strong>`
      : 'Add top-level node';
    _showInlineModal(`
      <div style="font-size:0.95rem;font-weight:700;margin-bottom:1rem">${title}</div>
      <div class="form-group">
        <label class="form-label">Name</label>
        <input id="_tree-add-name" class="form-input" placeholder="e.g. Engineering, U18 Squad, Rehab Group…" autofocus />
      </div>
      <div class="form-group" style="margin-top:0.6rem">
        <label class="form-label">Description <span style="color:var(--text-muted);font-weight:400">(optional)</span></label>
        <input id="_tree-add-desc" class="form-input" placeholder="What does this node represent?" />
      </div>
      <div style="display:flex;gap:0.5rem;margin-top:1rem">
        <button class="btn btn-accent btn-sm" onclick="OrgTree._submitAddNode('${parentId || ''}')">Create Node</button>
        <button class="btn btn-outline btn-sm" onclick="_closeInlineModal()">Cancel</button>
      </div>`);
    setTimeout(() => document.getElementById('_tree-add-name')?.focus(), 50);
  },

  async _submitAddNode(parentId) {
    const name = (document.getElementById('_tree-add-name')?.value || '').trim();
    const desc = (document.getElementById('_tree-add-desc')?.value || '').trim();
    if (!name) { showToast('Enter a node name', 'warning'); return; }
    try {
      const res  = await fetch('/api/tree/node', {
        method: 'POST', headers: Auth._headers(),
        body: JSON.stringify({ name, description: desc, parentId: parentId || null }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      this._nodes[data.node.nodeId] = data.node;
      if (parentId) this._expanded.add(parentId);
      _closeInlineModal();
      this.render('org-tree-container');
      showToast(`"${name}" created`, 'success');
    } catch(e) { showToast(e.message, 'warning'); }
  },

  /* ── Add sibling: same parent as the reference node ─────── */
  openAddSibling(nodeId) {
    const node       = this._nodes[nodeId];
    const parentId   = node?.parentId || null;
    const parentNode = parentId ? this._nodes[parentId] : null;
    const title = parentId
      ? `Add node alongside <strong>"${this._escHtml(node?.name || nodeId)}"</strong>`
      : 'Add top-level node (sibling)';
    _showInlineModal(`
      <div style="font-size:0.95rem;font-weight:700;margin-bottom:1rem">${title}</div>
      <div class="form-group">
        <label class="form-label">Name</label>
        <input id="_tree-add-name" class="form-input" placeholder="e.g. Medical Staff, U16 Squad…" autofocus />
      </div>
      <div class="form-group" style="margin-top:0.6rem">
        <label class="form-label">Description <span style="color:var(--text-muted);font-weight:400">(optional)</span></label>
        <input id="_tree-add-desc" class="form-input" placeholder="What does this node represent?" />
      </div>
      <div style="display:flex;gap:0.5rem;margin-top:1rem">
        <button class="btn btn-accent btn-sm" onclick="OrgTree._submitAddNode('${parentId || ''}')">Create Node</button>
        <button class="btn btn-outline btn-sm" onclick="_closeInlineModal()">Cancel</button>
      </div>`);
    setTimeout(() => document.getElementById('_tree-add-name')?.focus(), 50);
  },

  /* ══════════════════════════════════════════════════════════
     MANAGE (rename / description / delete)
  ══════════════════════════════════════════════════════════ */
  openManageNode(nodeId) {
    const node = this._nodes[nodeId];
    if (!node) { if (typeof showToast === 'function') showToast('Tree still loading — refresh and try again.', 'warning'); return; }
    _showInlineModal(`
      <div style="font-size:0.95rem;font-weight:700;margin-bottom:1rem">Manage node</div>
      <div class="form-group">
        <label class="form-label">Name</label>
        <input id="_tree-mgmt-name" class="form-input" value="${this._escHtml(node.name)}" />
      </div>
      <div class="form-group" style="margin-top:0.6rem">
        <label class="form-label">Description <span style="color:var(--text-muted);font-weight:400">(optional)</span></label>
        <input id="_tree-mgmt-desc" class="form-input" value="${this._escHtml(node.description || '')}" placeholder="What does this node represent?" />
      </div>
      <div style="display:flex;gap:0.5rem;justify-content:space-between;margin-top:1.2rem">
        <button class="btn btn-outline btn-sm" style="color:var(--danger);border-color:rgba(247,79,79,0.4)"
          onclick="OrgTree._deleteNode('${nodeId}','${this._escHtml(node.name)}')">Delete node</button>
        <div style="display:flex;gap:0.5rem">
          <button class="btn btn-outline btn-sm" onclick="_closeInlineModal()">Cancel</button>
          <button class="btn btn-accent btn-sm" onclick="OrgTree._submitManageNode('${nodeId}')">Save</button>
        </div>
      </div>`);
    setTimeout(() => document.getElementById('_tree-mgmt-name')?.focus(), 50);
  },

  async _submitManageNode(nodeId) {
    const name = (document.getElementById('_tree-mgmt-name')?.value || '').trim();
    const desc = (document.getElementById('_tree-mgmt-desc')?.value || '').trim();
    if (!name) { showToast('Name cannot be empty', 'warning'); return; }
    try {
      const res  = await fetch(`/api/tree/node/${nodeId}`, {
        method: 'PUT', headers: Auth._headers(),
        body: JSON.stringify({ name, description: desc }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      this._nodes[nodeId].name        = data.node.name;
      this._nodes[nodeId].description = data.node.description || '';
      _closeInlineModal();
      this.render('org-tree-container');
      showToast('Saved ✓', 'success');
    } catch(e) { showToast(e.message, 'warning'); }
  },

  async _deleteNode(nodeId, name) {
    if (!confirm(`Delete "${name}"?\n\nChild nodes will move up to the parent. People will be unassigned from this node.`)) return;
    try {
      const res  = await fetch(`/api/tree/node/${nodeId}`, {
        method: 'DELETE', headers: Auth._headers(),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      delete this._nodes[nodeId];
      _closeInlineModal();
      await this.load();
      this.render('org-tree-container');
      showToast(`"${name}" deleted`, 'success');
    } catch(e) { showToast(e.message, 'warning'); }
  },

  /* ══════════════════════════════════════════════════════════
     MOVE NODE (reparent)
  ══════════════════════════════════════════════════════════ */
  openMoveNode(nodeId) {
    const node = this._nodes[nodeId];
    if (!node) { if (typeof showToast === 'function') showToast('Tree still loading — refresh and try again.', 'warning'); return; }

    // Exclude self and all descendants (can't move into own subtree)
    const descendants = this._getDescendantIds(nodeId);
    descendants.add(nodeId);

    // Build flat list of all valid target parents, sorted alphabetically
    const options = Object.values(this._nodes)
      .filter(n => !descendants.has(n.nodeId))
      .sort((a, b) => a.name.localeCompare(b.name));

    const makeRow = (value, label, checked) => `
      <label style="display:flex;align-items:center;gap:0.6rem;padding:0.4rem 0.5rem;border-radius:6px;cursor:pointer;border:1px solid var(--border)">
        <input type="radio" name="_move-target" value="${value}" ${checked ? 'checked' : ''} />
        <span style="font-size:0.85rem">${label}</span>
      </label>`;

    _showInlineModal(`
      <div style="font-size:0.95rem;font-weight:700;margin-bottom:0.4rem">Move <em>"${this._escHtml(node.name)}"</em></div>
      <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:1rem">Choose where to place it in the tree.</div>
      <div style="max-height:320px;overflow-y:auto;display:flex;flex-direction:column;gap:0.3rem" id="_tree-move-list">
        ${makeRow('__root__', '— Make top-level node —', !node.parentId)}
        ${options.map(n => makeRow(n.nodeId, this._escHtml(n.name), node.parentId === n.nodeId)).join('')}
      </div>
      <div style="display:flex;gap:0.5rem;margin-top:1rem">
        <button class="btn btn-accent btn-sm" onclick="OrgTree._submitMove('${nodeId}')">Move</button>
        <button class="btn btn-outline btn-sm" onclick="_closeInlineModal()">Cancel</button>
      </div>`);
  },

  async _submitMove(nodeId) {
    const selected = document.querySelector('#_tree-move-list input[type=radio]:checked');
    if (!selected) { showToast('Select a destination', 'warning'); return; }
    const newParentId = selected.value === '__root__' ? null : selected.value;
    const node = this._nodes[nodeId];
    if (newParentId === node.parentId) { _closeInlineModal(); return; }
    try {
      const res  = await fetch(`/api/tree/node/${nodeId}`, {
        method: 'PUT', headers: Auth._headers(),
        body: JSON.stringify({ parentId: newParentId }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      _closeInlineModal();
      await this.load();
      if (newParentId) this._expanded.add(newParentId);
      this.render('org-tree-container');
      showToast(`"${node.name}" moved ✓`, 'success');
    } catch(e) { showToast(e.message, 'warning'); }
  },

  /* ══════════════════════════════════════════════════════════
     ASSIGN PEOPLE (member + leader toggles)
  ══════════════════════════════════════════════════════════ */
  openAssignPeople(nodeId) {
    const node    = this._nodes[nodeId];
    if (!node) { if (typeof showToast === 'function') showToast('Tree still loading — refresh and try again.', 'warning'); return; }
    const members = (AppState?.members || [])
      .filter(m => m.role !== 'superadmin')
      .sort((a, b) => a.name.localeCompare(b.name));
    const currentMembers = new Set(node.memberIds  || []);
    const currentLeaders = new Set(node.leaderIds  || []);

    _showInlineModal(`
      <div style="font-size:0.95rem;font-weight:700;margin-bottom:0.3rem">Assign people to <em>"${this._escHtml(node.name)}"</em></div>
      <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:0.8rem">
        <strong>In node</strong> — person belongs here.
        <strong style="color:var(--accent)">Leader</strong> — person leads this node and can see its subtree.
      </div>
      <div style="display:grid;grid-template-columns:1fr auto auto;gap:0.3rem 0.6rem;align-items:center;
                  font-size:0.72rem;color:var(--text-muted);font-weight:700;text-transform:uppercase;
                  letter-spacing:0.4px;padding:0 0.3rem 0.4rem;border-bottom:1px solid var(--border);margin-bottom:0.4rem">
        <span>Person</span><span>In node</span><span style="color:var(--accent)">Leader</span>
      </div>
      <div style="max-height:320px;overflow-y:auto;display:flex;flex-direction:column;gap:0.25rem" id="_tree-assign-list">
        ${members.length ? members.map(m => {
          const uid = m.userId || m.id;
          return `
            <div style="display:grid;grid-template-columns:1fr auto auto;gap:0.3rem 0.8rem;align-items:center;
                        padding:0.35rem 0.4rem;border-radius:6px;border:1px solid var(--border)">
              <div>
                <div style="font-size:0.85rem;font-weight:600">${this._escHtml(m.name)}</div>
                <div style="font-size:0.72rem;color:var(--text-muted)">${m.role}</div>
              </div>
              <input type="checkbox" class="_assign-member" value="${uid}" ${currentMembers.has(uid) ? 'checked' : ''}
                style="width:16px;height:16px;cursor:pointer"
                onchange="OrgTree._onMemberToggle(this,'${uid}')" />
              <input type="checkbox" class="_assign-leader" value="${uid}" ${currentLeaders.has(uid) ? 'checked' : ''}
                style="width:16px;height:16px;cursor:pointer;accent-color:var(--accent)"
                onchange="OrgTree._onLeaderToggle(this,'${uid}')" />
            </div>`;
        }).join('') : '<div style="color:var(--text-muted);font-size:0.82rem;padding:0.5rem">No people in org yet.</div>'}
      </div>
      <div style="display:flex;gap:0.5rem;margin-top:1rem">
        <button class="btn btn-accent btn-sm" onclick="OrgTree._submitAssignPeople('${nodeId}')">Save assignments</button>
        <button class="btn btn-outline btn-sm" onclick="_closeInlineModal()">Cancel</button>
      </div>`);
  },

  // When leader checkbox ticked, also auto-tick the member checkbox
  _onLeaderToggle(checkbox, uid) {
    if (checkbox.checked) {
      const memberCb = document.querySelector(`#_tree-assign-list ._assign-member[value="${uid}"]`);
      if (memberCb) memberCb.checked = true;
    }
  },

  // When member checkbox unticked, also untick leader
  _onMemberToggle(checkbox, uid) {
    if (!checkbox.checked) {
      const leaderCb = document.querySelector(`#_tree-assign-list ._assign-leader[value="${uid}"]`);
      if (leaderCb) leaderCb.checked = false;
    }
  },

  async _submitAssignPeople(nodeId) {
    const memberIds = Array.from(document.querySelectorAll('#_tree-assign-list ._assign-member:checked')).map(c => c.value);
    const leaderIds = Array.from(document.querySelectorAll('#_tree-assign-list ._assign-leader:checked')).map(c => c.value);
    try {
      const res  = await fetch(`/api/tree/node/${nodeId}`, {
        method: 'PUT', headers: Auth._headers(),
        body: JSON.stringify({ memberIds, leaderIds }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      this._nodes[nodeId].memberIds = data.node.memberIds;
      this._nodes[nodeId].leaderIds = data.node.leaderIds;
      _closeInlineModal();
      this.render('org-tree-container');
      showToast('Assignments saved ✓', 'success');
    } catch(e) { showToast(e.message, 'warning'); }
  },
};

/* ── Inline modal helper (lightweight, reused) ───────────────────────────── */
function _showInlineModal(html) {
  let overlay = document.getElementById('_inline-modal-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = '_inline-modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:900;display:flex;align-items:center;justify-content:center;padding:1rem';
    overlay.addEventListener('click', e => { if (e.target === overlay) _closeInlineModal(); });
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `<div style="background:var(--surface-1);border:1px solid var(--border);border-radius:12px;padding:1.5rem;max-width:500px;width:100%;max-height:85vh;overflow-y:auto">${html}</div>`;
  overlay.style.display = 'flex';
}

function _closeInlineModal() {
  const el = document.getElementById('_inline-modal-overlay');
  if (el) el.style.display = 'none';
}
