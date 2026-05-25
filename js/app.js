// DÙN RIGHT — Main application logic
import { login, getAllUsers, getUser, getProjects, createProject,
         createWorkOrder, getWorkOrdersByUser, getPendingApprovals,
         getNotifications, markRead, getSetting, setSetting } from './db.js';
import { generateTimesheetPDF, generateInvoicePDF } from './pdf.js';
import { setAccessToken, uploadTimesheetPDF, uploadInvoicePDF,
         uploadReceiptPhoto, uploadSitePhoto, uploadSafetyForm,
         sendEmail, pdfToBase64 } from './sync.js';

// ─── State ────────────────────────────────────────────────────────────────────
let currentUser = null;
let currentPage = 'home';

const $ = id => document.getElementById(id);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

// ─── Toast notifications ───────────────────────────────────────────────────
function toast(msg, type = 'info', duration = 3000) {
  const container = $('toast-container');
  const t = el('div', `toast ${type}`, msg);
  container.appendChild(t);
  setTimeout(() => t.remove(), duration);
}

// ─── Modal helpers ────────────────────────────────────────────────────────────
function openModal(id) {
  const o = $(id + '-overlay');
  if (o) { o.classList.add('open'); }
}
function closeModal(id) {
  const o = $(id + '-overlay');
  if (o) { o.classList.remove('open'); }
}

// ─── Navigation ───────────────────────────────────────────────────────────────
function navigate(page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
  const target = $('page-' + page);
  if (target) target.style.display = 'block';

  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const navItem = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (navItem) navItem.classList.add('active');

  // Refresh page content
  if (page === 'home')      renderHome();
  if (page === 'workorder') renderWorkOrderList();
  if (page === 'safety')    renderSafetyPage();
  if (page === 'receipts')  renderReceiptsPage();
  if (page === 'photos')    renderPhotosPage();
  if (page === 'approvals') renderApprovals();
  if (page === 'projects')  renderProjects();
  if (page === 'invoicing') renderInvoicing();
  if (page === 'staff')     renderStaff();
}

// ─── Login ────────────────────────────────────────────────────────────────────
async function handleLogin(e) {
  e.preventDefault();
  const username = $('login-username').value.trim();
  const password = $('login-password').value;
  const user = await login(username, password);
  if (!user) { toast('Invalid username or password', 'error'); return; }
  currentUser = user;
  sessionStorage.setItem('dr_user_id', user.id);
  showApp();
}

function showApp() {
  $('login-screen').style.display = 'none';
  $('app-shell').style.display = 'block';
  buildNav();
  $('header-user-name').textContent = currentUser.name.split(' ')[0];
  updateNotifBadge();
  navigate('home');
}

function buildNav() {
  const nav = $('bottom-nav');
  nav.innerHTML = '';

  const fieldItems = [
    { page: 'home',      icon: svgHome(),       label: 'Home' },
    { page: 'workorder', icon: svgClipboard(),  label: 'Work Orders' },
    { page: 'safety',    icon: svgShield(),     label: 'Safety' },
    { page: 'receipts',  icon: svgReceipt(),    label: 'Receipts' },
    { page: 'photos',    icon: svgCamera(),     label: 'Photos' }
  ];
  const supervisorExtra = [
    { page: 'approvals', icon: svgCheck(),      label: 'Approve' },
    { page: 'projects',  icon: svgFolder(),     label: 'Projects' },
    { page: 'invoicing', icon: svgDoc(),        label: 'Invoices' },
    { page: 'staff',     icon: svgPeople(),     label: 'Staff' }
  ];

  const items = currentUser.role === 'supervisor'
    ? [fieldItems[0], fieldItems[1], ...supervisorExtra.slice(0,2), { page: 'more', icon: svgGrid(), label: 'More' }]
    : fieldItems;

  items.forEach(item => {
    const btn = el('button', 'nav-item', `${item.icon}<span>${item.label}</span>`);
    btn.dataset.page = item.page;
    btn.addEventListener('click', () => {
      if (item.page === 'more') showMoreMenu();
      else navigate(item.page);
    });
    nav.appendChild(btn);
  });

  // Extra supervisor pages not in nav (accessed via 'More')
  if (currentUser.role === 'supervisor') {
    buildMoreMenu(supervisorExtra.slice(2), fieldItems.slice(1));
  }
}

function buildMoreMenu(extra, fieldBase) {
  const overlay = $('more-overlay');
  overlay.innerHTML = `<div class="modal-sheet" id="more-sheet">
    <div class="modal-handle"></div>
    <div class="modal-title">More</div>
    <div id="more-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;"></div>
  </div>`;
  const grid = $('more-grid');
  const all = [...fieldBase, ...extra];
  all.forEach(item => {
    const btn = el('button', 'card flex-center', `<div style="text-align:center">${item.icon}<br><span style="font-size:0.8rem;margin-top:6px;display:block">${item.label}</span></div>`);
    btn.style.flexDirection = 'column';
    btn.addEventListener('click', () => { closeModal('more'); navigate(item.page); });
    grid.appendChild(btn);
  });
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal('more'); });
}

function showMoreMenu() { openModal('more'); }

// ─── Home page ────────────────────────────────────────────────────────────────
async function renderHome() {
  const container = $('page-home');
  const notifs = await getNotifications(currentUser.id);
  const unread  = notifs.filter(n => !n.read);
  const pending = currentUser.role === 'supervisor' ? await getPendingApprovals() : [];

  let html = `<div class="section-header"><span class="section-title">Good ${greeting()}, ${currentUser.name.split(' ')[0]}</span></div>`;

  if (unread.length) {
    html += `<div class="card" style="border-color:var(--warning)">
      <div class="card-title">🔔 Notifications (${unread.length})</div>`;
    unread.slice(0,3).forEach(n => {
      html += `<div class="list-item" onclick="markNotifRead(${n.id})">
        <div class="list-item-left">
          <div class="list-item-title">${escHtml(n.message)}</div>
          <div class="list-item-sub">${timeSince(n.scheduledAt)}</div>
        </div>
      </div>`;
    });
    html += '</div>';
  }

  if (currentUser.role === 'supervisor' && pending.length) {
    html += `<div class="card" style="border-color:var(--gold)">
      <div class="card-title">⏳ Awaiting Approval (${pending.length})</div>
      <button class="btn btn-outline btn-full mt-8" onclick="navigate('approvals')">Review Now</button>
    </div>`;
  }

  // Quick actions
  html += `<div class="section-header mt-12"><span class="section-title">Quick Actions</span></div>
  <div class="grid-2">
    <button class="btn btn-primary" onclick="navigate('workorder')">📋 New Work Order</button>
    <button class="btn btn-outline" onclick="navigate('safety')">🦺 Safety Form</button>
    <button class="btn btn-ghost" onclick="navigate('receipts')">🧾 Submit Receipt</button>
    <button class="btn btn-ghost" onclick="navigate('photos')">📷 Upload Photos</button>
  </div>`;

  // Today's work orders
  const wos = await getWorkOrdersByUser(currentUser.id);
  const today = new Date().toISOString().slice(0,10);
  const todayWOs = wos.filter(w => w.date === today);
  if (todayWOs.length === 0) {
    html += `<div class="card mt-12" style="border-color:var(--warning)">
      <div class="card-title text-muted">No work order for today</div>
      <button class="btn btn-primary btn-full mt-8" onclick="openNewWOModal()">Create Today's Work Order</button>
    </div>`;
  }

  container.querySelector('.page-scroll').innerHTML = html;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

window.markNotifRead = async (id) => {
  await markRead(id);
  renderHome();
  updateNotifBadge();
};

async function updateNotifBadge() {
  const notifs = await getNotifications(currentUser.id);
  const count = notifs.filter(n => !n.read).length;
  const badge = $('notif-count');
  if (badge) {
    badge.textContent = count || '';
    badge.style.display = count ? 'flex' : 'none';
  }
}

// ─── Work Order module ────────────────────────────────────────────────────────
async function renderWorkOrderList() {
  const container = $('page-workorder').querySelector('.page-scroll');
  const wos = await getWorkOrdersByUser(currentUser.id);

  let html = `<div class="section-header">
    <span class="section-title">Work Orders</span>
    <button class="btn btn-primary btn-sm" onclick="openNewWOModal()">+ New</button>
  </div>`;

  if (!wos.length) {
    html += `<div class="empty-state">${svgClipboard()}<p>No work orders yet</p></div>`;
  } else {
    wos.forEach(wo => {
      html += `<div class="list-item" onclick="viewWorkOrder(${wo.id})">
        <div class="list-item-left">
          <div class="list-item-title">WO-${String(wo.id).padStart(4,'0')} — ${wo.date}</div>
          <div class="list-item-sub">Project ID: ${wo.projectId || '—'} • ${wo.labourItems?.length || 0} pay items</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="status status-${wo.status}">${wo.status}</span>
          <span class="chevron">›</span>
        </div>
      </div>`;
    });
  }

  container.innerHTML = html;
}

window.openNewWOModal = async () => {
  const projects = await getProjects();
  const payItems = await window.DR_DB.payItems.where('active').equals(1).toArray();
  const consumables = await window.DR_DB.consumables.where('active').equals(1).toArray();

  const modal = $('wo-modal-sheet');
  modal.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-title">New Work Order</div>
    <div class="form-group">
      <label>Date</label>
      <input type="date" id="wo-date" value="${new Date().toISOString().slice(0,10)}">
    </div>
    <div class="form-group">
      <label>Project</label>
      <select id="wo-project">
        <option value="">Select project...</option>
        ${projects.map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('')}
      </select>
    </div>
    <div class="divider"></div>
    <div class="section-header"><span class="section-title">Labour</span>
      <button class="btn btn-sm btn-outline" onclick="addLabourRow()">+ Add</button>
    </div>
    <div id="labour-rows"></div>
    <div class="divider"></div>
    <div class="section-header"><span class="section-title">Travel & LOA</span></div>
    <div class="toggle-row">
      <span class="toggle-label">Billable Travel</span>
      <button class="toggle" id="tog-billable-travel" onclick="toggleBtn(this,'wo-billable-travel-amt')"></button>
    </div>
    <div id="wo-billable-travel-amt" style="display:none" class="form-group mt-8">
      <label>Billable Travel Amount ($)</label>
      <input type="number" id="wo-travel-amt" min="0" step="0.01" value="0">
    </div>
    <div class="toggle-row">
      <span class="toggle-label">Non-Billable Travel</span>
      <button class="toggle" id="tog-nb-travel" onclick="toggleBtn(this, null)"></button>
    </div>
    <div class="toggle-row">
      <span class="toggle-label">LOA (Living Out Allowance)</span>
      <button class="toggle" id="tog-loa" onclick="toggleBtn(this,'wo-loa-section')"></button>
    </div>
    <div id="wo-loa-section" style="display:none">
      <div class="form-group mt-8">
        <label>LOA Billable?</label>
        <div style="display:flex;gap:10px">
          <label style="display:flex;align-items:center;gap:6px;font-size:0.9rem;text-transform:none;letter-spacing:0">
            <input type="radio" name="loa-type" value="billable" checked> Billable
          </label>
          <label style="display:flex;align-items:center;gap:6px;font-size:0.9rem;text-transform:none;letter-spacing:0">
            <input type="radio" name="loa-type" value="nonbillable"> Non-Billable
          </label>
        </div>
      </div>
      <div class="form-group">
        <label>LOA Amount ($)</label>
        <input type="number" id="wo-loa-amt" min="0" step="0.01" value="0">
      </div>
    </div>
    <div class="divider"></div>
    <div class="section-header"><span class="section-title">Consumables</span>
      <button class="btn btn-sm btn-outline" onclick="addConsumableRow()">+ Add</button>
    </div>
    <div id="consumable-rows"></div>
    <div class="divider"></div>
    <div class="form-group">
      <label>Notes / Comments</label>
      <textarea id="wo-notes" placeholder="Any notes for this work order..."></textarea>
    </div>
    <div class="form-group">
      <label>Signature</label>
      <div class="sig-canvas-wrap">
        <canvas id="sigCanvas" width="600" height="150"></canvas>
        <button class="sig-clear" onclick="clearSig()">Clear</button>
      </div>
      <p class="text-muted text-sm">Sign with your finger above</p>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px">
      <button class="btn btn-ghost" onclick="closeModal('wo-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="submitWorkOrder('draft')">Save Draft</button>
    </div>
    <button class="btn btn-success btn-full mt-8" onclick="submitWorkOrder('submitted')">Submit for Approval</button>
  `;

  // Seed one labour row
  setTimeout(() => {
    addLabourRow();
    setupSigCanvas();
  }, 50);

  openModal('wo-modal');
};

let payItemsCache = [];
let consumablesCache = [];

window.addLabourRow = async () => {
  if (!payItemsCache.length) payItemsCache = await window.DR_DB.payItems.where('active').equals(1).toArray();
  const container = $('labour-rows');
  const row = el('div', 'labour-row');
  row.innerHTML = `
    <select>${payItemsCache.map(p => `<option value="${p.id}" data-rate="${p.rate}">${escHtml(p.name)}</option>`).join('')}</select>
    <input type="number" placeholder="Hrs" min="0" step="0.5" value="8">
    <input type="number" placeholder="Rate" min="0" step="0.01" value="${payItemsCache[0]?.rate || 0}">
    <button onclick="this.parentElement.remove()" style="background:var(--danger);color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:1rem">×</button>
  `;
  row.querySelector('select').addEventListener('change', function() {
    const opt = this.options[this.selectedIndex];
    row.querySelectorAll('input')[1].value = opt.dataset.rate || 0;
  });
  container.appendChild(row);
};

window.addConsumableRow = async () => {
  if (!consumablesCache.length) consumablesCache = await window.DR_DB.consumables.where('active').equals(1).toArray();
  const container = $('consumable-rows');
  const row = el('div', 'consumable-row');
  row.innerHTML = `
    <select>${consumablesCache.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('')}</select>
    <input type="number" placeholder="Qty" min="1" value="1">
    <button onclick="this.parentElement.remove()" style="background:var(--danger);color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:1rem">×</button>
  `;
  container.appendChild(row);
};

window.toggleBtn = (btn, targetId) => {
  btn.classList.toggle('on');
  if (targetId) {
    const t = $(targetId);
    if (t) t.style.display = btn.classList.contains('on') ? 'block' : 'none';
  }
};

// Signature canvas
let sigDrawing = false;
function setupSigCanvas() {
  const canvas = $('sigCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#1a1a2e';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';

  function pos(e) {
    const r = canvas.getBoundingClientRect();
    const scale = canvas.width / r.width;
    const src = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - r.left) * scale, y: (src.clientY - r.top) * scale };
  }

  canvas.addEventListener('mousedown',  e => { sigDrawing = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); });
  canvas.addEventListener('mousemove',  e => { if (!sigDrawing) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); });
  canvas.addEventListener('mouseup',    () => sigDrawing = false);
  canvas.addEventListener('touchstart', e => { e.preventDefault(); sigDrawing = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); }, { passive: false });
  canvas.addEventListener('touchmove',  e => { e.preventDefault(); if (!sigDrawing) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); }, { passive: false });
  canvas.addEventListener('touchend',   () => sigDrawing = false);
}

window.clearSig = () => {
  const canvas = $('sigCanvas');
  if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
};

window.submitWorkOrder = async (status) => {
  const projectId = parseInt($('wo-project').value);
  if (!projectId) { toast('Please select a project', 'error'); return; }

  // Gather labour rows
  const labourRows = $('labour-rows').querySelectorAll('.labour-row');
  const labourItems = [];
  labourRows.forEach(row => {
    const sel = row.querySelector('select');
    const inputs = row.querySelectorAll('input');
    const name = sel.options[sel.selectedIndex]?.text || '';
    const hours = parseFloat(inputs[0].value) || 0;
    const rate  = parseFloat(inputs[1].value) || 0;
    if (name && hours > 0) labourItems.push({ name, hours, rate });
  });

  // Gather consumables
  const conRows = $('consumable-rows').querySelectorAll('.consumable-row');
  const consumables = [];
  conRows.forEach(row => {
    const sel = row.querySelector('select');
    const input = row.querySelector('input');
    const name = sel.options[sel.selectedIndex]?.text || '';
    const qty  = parseFloat(input.value) || 1;
    const unit = consumablesCache.find(c => c.name === name)?.unit || 'each';
    if (name) consumables.push({ name, qty, unit });
  });

  // Travel / LOA
  const billableTravel    = $('tog-billable-travel')?.classList.contains('on') || false;
  const nonBillableTravel = $('tog-nb-travel')?.classList.contains('on') || false;
  const loa               = $('tog-loa')?.classList.contains('on') || false;
  const billableTravelAmount = parseFloat($('wo-travel-amt')?.value) || 0;
  const loaAmount            = parseFloat($('wo-loa-amt')?.value) || 0;
  const loaBillable          = document.querySelector('input[name="loa-type"]:checked')?.value === 'billable';

  // Signature
  const canvas = $('sigCanvas');
  const signature = canvas ? canvas.toDataURL('image/png') : null;

  const wo = {
    projectId, userId: currentUser.id, date: $('wo-date').value,
    labourItems, consumables,
    billableTravel, nonBillableTravel, loa,
    billableTravelAmount, loaAmount, loaBillable,
    notes: $('wo-notes').value,
    signature, status
  };

  if (status === 'submitted') wo.submittedAt = new Date().toISOString();

  const id = await createWorkOrder(wo);
  closeModal('wo-modal');
  toast(status === 'submitted' ? 'Work order submitted for approval!' : 'Draft saved', 'success');

  // Notify supervisors
  if (status === 'submitted') {
    const supervisors = await window.DR_DB.users.where('role').equals('supervisor').toArray();
    for (const sup of supervisors) {
      await window.DR_DB.notifications.add({
        toUserId: sup.id, fromUserId: currentUser.id,
        message: `${currentUser.name} submitted a work order for approval`,
        scheduledAt: new Date().toISOString(), read: false, type: 'approval_request'
      });
    }
  }

  navigate(currentPage);
};

// ─── Approvals (Supervisor) ───────────────────────────────────────────────────
async function renderApprovals() {
  const container = $('page-approvals').querySelector('.page-scroll');
  const pending = await getPendingApprovals();

  let html = `<div class="section-header"><span class="section-title">Pending Approvals</span></div>`;

  if (!pending.length) {
    html += `<div class="empty-state">${svgCheck()}<p>All caught up! No pending approvals.</p></div>`;
  } else {
    for (const wo of pending) {
      const user = await getUser(wo.userId);
      const projects = await getProjects(false);
      const proj = projects.find(p => p.id === wo.projectId);
      const labour = wo.labourItems || [];
      const total = labour.reduce((s, i) => s + i.hours * i.rate, 0);

      html += `<div class="card">
        <div class="card-title">WO-${String(wo.id).padStart(4,'0')} — ${wo.date}</div>
        <div class="text-sm text-muted">Field Staff: <strong style="color:var(--text)">${user?.name || '—'}</strong></div>
        <div class="text-sm text-muted">Project: <strong style="color:var(--text)">${proj?.name || '—'}</strong></div>
        <div class="text-sm text-muted mt-8">Labour: ${labour.map(l => `${l.name} × ${l.hours}h`).join(', ')}</div>
        ${wo.billableTravel ? `<div class="text-sm text-muted">Billable Travel: $${wo.billableTravelAmount}</div>` : ''}
        ${wo.loa && wo.loaBillable ? `<div class="text-sm text-muted">LOA: $${wo.loaAmount}</div>` : ''}
        <div class="divider"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <button class="btn btn-danger btn-sm" onclick="rejectWO(${wo.id})">Reject</button>
          <button class="btn btn-success btn-sm" onclick="approveWO(${wo.id})">Approve & PDF</button>
        </div>
      </div>`;
    }
  }
  container.innerHTML = html;
}

window.approveWO = async (woId) => {
  const wo = await window.DR_DB.workOrders.get(woId);
  if (!wo) return;

  await window.DR_DB.workOrders.update(woId, {
    status: 'approved', supervisorId: currentUser.id,
    approvedAt: new Date().toISOString()
  });

  const projects = await getProjects(false);
  const proj  = projects.find(p => p.id === wo.projectId);
  const user  = await getUser(wo.userId);

  // Generate PDF
  const pdfDoc = await generateTimesheetPDF(wo, proj, user, currentUser);

  // Upload to OneDrive
  const uploaded = await uploadTimesheetPDF(pdfDoc, wo, proj?.name || 'Project', user?.name || 'Staff');

  // Notify field staff
  await window.DR_DB.notifications.add({
    toUserId: wo.userId, fromUserId: currentUser.id,
    message: `Your work order WO-${String(woId).padStart(4,'0')} was approved`,
    scheduledAt: new Date().toISOString(), read: false, type: 'approval'
  });

  // Ask about emailing client
  if (proj?.clientEmail) {
    const emailIt = confirm(`Email timesheet to ${proj.clientName} (${proj.clientEmail})?`);
    if (emailIt) {
      const b64 = pdfToBase64(pdfDoc);
      const sent = await sendEmail({
        to: proj.clientEmail,
        subject: `Timesheet — ${proj.name} — ${wo.date}`,
        body: `<p>Please find attached the approved timesheet for <strong>${proj.name}</strong> dated ${wo.date}.</p><p>Regards,<br>${currentUser.name}<br>DÙN RIGHT Field Services</p>`,
        attachments: [{ name: `Timesheet_${wo.date}.pdf`, contentType: 'application/pdf', contentBytes: b64 }]
      });
      if (sent) toast('Email sent to client', 'success');
    }
  }

  toast('Work order approved!', 'success');
  renderApprovals();
};

window.rejectWO = async (woId) => {
  const reason = prompt('Reason for rejection (optional):') || '';
  await window.DR_DB.workOrders.update(woId, { status: 'rejected' });
  const wo = await window.DR_DB.workOrders.get(woId);
  await window.DR_DB.notifications.add({
    toUserId: wo.userId, fromUserId: currentUser.id,
    message: `Work order WO-${String(woId).padStart(4,'0')} was rejected. ${reason}`,
    scheduledAt: new Date().toISOString(), read: false, type: 'rejection'
  });
  toast('Work order rejected', 'error');
  renderApprovals();
};

// ─── Projects (Supervisor) ────────────────────────────────────────────────────
async function renderProjects() {
  const container = $('page-projects').querySelector('.page-scroll');
  const projects = await getProjects(false);

  let html = `<div class="section-header">
    <span class="section-title">Projects</span>
    <button class="btn btn-primary btn-sm" onclick="openNewProjectModal()">+ New</button>
  </div>`;

  if (!projects.length) {
    html += `<div class="empty-state">${svgFolder()}<p>No projects yet</p></div>`;
  } else {
    projects.forEach(p => {
      html += `<div class="list-item">
        <div class="list-item-left">
          <div class="list-item-title">${escHtml(p.name)}</div>
          <div class="list-item-sub">${escHtml(p.clientName || '—')} • <span class="status status-${p.status}">${p.status}</span></div>
        </div>
        <button class="btn btn-sm btn-ghost" onclick="editProject(${p.id})">Edit</button>
      </div>`;
    });
  }

  container.innerHTML = html;
}

window.openNewProjectModal = () => {
  const modal = $('project-modal-sheet');
  modal.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-title">New Project</div>
    <div class="form-group"><label>Project Name</label><input type="text" id="proj-name" placeholder="e.g. Highway 40 Survey"></div>
    <div class="form-group"><label>Client Name</label><input type="text" id="proj-client" placeholder="Client company name"></div>
    <div class="form-group"><label>Client Email</label><input type="email" id="proj-email" placeholder="client@company.com"></div>
    <div class="form-group"><label>Billable Travel Rate ($/km or $/day)</label><input type="number" id="proj-travel-rate" min="0" step="0.01" value="0"></div>
    <div class="form-group"><label>LOA Daily Rate ($)</label><input type="number" id="proj-loa-rate" min="0" step="0.01" value="0"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px">
      <button class="btn btn-ghost" onclick="closeModal('project-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="saveProject()">Create</button>
    </div>
  `;
  openModal('project-modal');
};

window.saveProject = async () => {
  const name = $('proj-name').value.trim();
  if (!name) { toast('Project name is required', 'error'); return; }
  await createProject({
    name, clientName: $('proj-client').value.trim(),
    clientEmail: $('proj-email').value.trim(),
    travelRate: parseFloat($('proj-travel-rate').value) || 0,
    loaRate: parseFloat($('proj-loa-rate').value) || 0,
    createdBy: currentUser.id
  });
  closeModal('project-modal');
  toast('Project created', 'success');
  renderProjects();
};

// ─── Safety module ────────────────────────────────────────────────────────────
async function renderSafetyPage() {
  const container = $('page-safety').querySelector('.page-scroll');
  const forms = await window.DR_DB.safetyForms.where('userId').equals(currentUser.id).reverse().sortBy('date');

  let html = `<div class="section-header">
    <span class="section-title">Safety Forms</span>
  </div>
  <div class="grid-2 mt-8">
    <button class="btn btn-primary" onclick="openSafetyForm('fitforwork')">✅ Fit for Work</button>
    <button class="btn btn-outline" onclick="openSafetyForm('flha')">📋 FLHA</button>
    <button class="btn btn-ghost" onclick="openSafetyForm('jha')">🔍 JHA</button>
    <button class="btn btn-ghost" onclick="openSafetyForm('hazard')">⚠️ Hazard Report</button>
  </div>
  <div class="section-header mt-16"><span class="section-title">Recent Forms</span></div>`;

  if (!forms.length) {
    html += `<div class="empty-state">${svgShield()}<p>No safety forms submitted yet</p></div>`;
  } else {
    forms.forEach(f => {
      html += `<div class="list-item">
        <div class="list-item-left">
          <div class="list-item-title">${f.type.toUpperCase()} — ${f.date}</div>
          <div class="list-item-sub">${f.syncStatus === 'synced' ? '☁️ Saved to OneDrive' : '📱 Stored locally'}</div>
        </div>
        <span class="status status-approved">✓</span>
      </div>`;
    });
  }

  container.innerHTML = html;
}

window.openSafetyForm = (type) => {
  const modal = $('safety-modal-sheet');
  const titles = { fitforwork: 'Fit for Work Assessment', flha: 'Field Level Hazard Assessment', jha: 'Job Hazard Analysis', hazard: 'Hazard Report' };

  const hazardCategories = [
    'Fall / Trip hazards', 'Moving equipment / vehicles', 'Electrical hazards',
    'Chemical / substance exposure', 'Extreme weather conditions', 'Wildlife / animal hazards',
    'Manual handling / ergonomics', 'Overhead hazards', 'Underground hazards / utilities',
    'Unstable ground / terrain', 'Traffic management', 'Lone worker risks'
  ];

  let formHtml = `<div class="modal-handle"></div>
    <div class="modal-title">${titles[type] || type.toUpperCase()}</div>
    <div class="form-group"><label>Date</label><input type="date" id="sf-date" value="${new Date().toISOString().slice(0,10)}"></div>`;

  if (type === 'fitforwork') {
    formHtml += `
      <div class="card">
        <div class="card-title">Self Assessment</div>
        ${['Well rested (6+ hours sleep)', 'No alcohol / drug impairment', 'Physically capable today', 'Mentally fit and focused', 'Wearing required PPE', 'Aware of today\'s hazards'].map(q =>
          `<div class="toggle-row"><span class="toggle-label">${q}</span><button class="toggle" onclick="toggleBtn(this,null)"></button></div>`
        ).join('')}
      </div>
      <div class="form-group"><label>Any concerns to report?</label><textarea id="sf-notes" placeholder="Optional notes..."></textarea></div>`;
  }

  if (type === 'flha' || type === 'jha') {
    formHtml += `
      <div class="form-group">
        <label>Task / Job Description</label>
        <input type="text" id="sf-task" placeholder="Describe the work being performed">
      </div>
      <div class="card">
        <div class="card-title">Hazards Present (check all that apply)</div>
        ${hazardCategories.map((h, i) =>
          `<div class="toggle-row"><span class="toggle-label">${h}</span><button class="toggle" id="haz-${i}" onclick="toggleBtn(this,null)"></button></div>`
        ).join('')}
      </div>
      <div class="form-group"><label>Controls / Mitigations</label><textarea id="sf-controls" placeholder="How are hazards being controlled?"></textarea></div>
      <div class="form-group"><label>Emergency Assembly Point</label><input type="text" id="sf-assembly" placeholder="Where to meet in an emergency"></div>`;
  }

  if (type === 'hazard') {
    formHtml += `
      <div class="form-group"><label>Hazard Description</label><textarea id="sf-hazard-desc" placeholder="Describe the hazard..."></textarea></div>
      <div class="form-group">
        <label>Severity</label>
        <select id="sf-severity">
          <option value="low">Low — Minor, no injury expected</option>
          <option value="medium">Medium — Possible injury</option>
          <option value="high">High — Likely injury</option>
          <option value="critical">Critical — Life threatening</option>
        </select>
      </div>
      <div class="form-group"><label>Immediate Action Taken</label><textarea id="sf-action" placeholder="What did you do about it?"></textarea></div>`;
  }

  formHtml += `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px">
      <button class="btn btn-ghost" onclick="closeModal('safety-modal')">Cancel</button>
      <button class="btn btn-success" onclick="submitSafetyForm('${type}')">Submit</button>
    </div>`;

  modal.innerHTML = formHtml;
  openModal('safety-modal');
};

window.submitSafetyForm = async (type) => {
  const projects = await getProjects();
  const date = $('sf-date')?.value || new Date().toISOString().slice(0,10);

  const form = {
    userId: currentUser.id, type, date,
    projectId: projects[0]?.id || null,
    notes: $('sf-notes')?.value || $('sf-hazard-desc')?.value || '',
    task: $('sf-task')?.value || '',
    controls: $('sf-controls')?.value || '',
    status: 'submitted',
    syncStatus: 'pending',
    createdAt: new Date().toISOString()
  };

  const id = await window.DR_DB.safetyForms.add(form);
  closeModal('safety-modal');
  toast('Safety form submitted', 'success');
  renderSafetyPage();
};

// ─── Receipts module ──────────────────────────────────────────────────────────
async function renderReceiptsPage() {
  const container = $('page-receipts').querySelector('.page-scroll');
  const receipts = await window.DR_DB.receipts.where('userId').equals(currentUser.id).reverse().sortBy('date');

  let html = `<div class="section-header">
    <span class="section-title">Receipts</span>
    <button class="btn btn-primary btn-sm" onclick="openReceiptModal()">+ Add</button>
  </div>`;

  if (!receipts.length) {
    html += `<div class="empty-state">${svgReceipt()}<p>No receipts submitted yet</p></div>`;
  } else {
    receipts.forEach(r => {
      html += `<div class="list-item">
        <div class="list-item-left">
          <div class="list-item-title">$${Number(r.amount).toFixed(2)} — ${r.date}</div>
          <div class="list-item-sub">${r.billable ? '💰 Billable' : '🏢 Non-billable'} • ${r.description || 'No description'}</div>
        </div>
        <span class="status status-${r.status || 'submitted'}">${r.status || 'submitted'}</span>
      </div>`;
    });
  }

  container.innerHTML = html;
}

window.openReceiptModal = async () => {
  const projects = await getProjects();
  const modal = $('receipt-modal-sheet');
  modal.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-title">Submit Receipt</div>
    <div class="form-group"><label>Date</label><input type="date" id="rec-date" value="${new Date().toISOString().slice(0,10)}"></div>
    <div class="form-group"><label>Amount ($)</label><input type="number" id="rec-amount" min="0" step="0.01" placeholder="0.00"></div>
    <div class="form-group"><label>Description / Vendor</label><input type="text" id="rec-desc" placeholder="e.g. Fuel - Petro Canada"></div>
    <div class="toggle-row">
      <span class="toggle-label">Billable to Client?</span>
      <button class="toggle" id="tog-rec-billable" onclick="toggleBillable(this)"></button>
    </div>
    <div id="rec-project-wrap" style="display:none;margin-top:10px" class="form-group">
      <label>Bill to Project</label>
      <select id="rec-project">
        <option value="">Select project...</option>
        ${projects.map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('')}
      </select>
    </div>
    <div class="form-group mt-12">
      <label>Receipt Photo</label>
      <input type="file" id="rec-photo" accept="image/*" capture="environment" style="background:transparent;border:1.5px dashed var(--gold);padding:12px;cursor:pointer">
      <div id="rec-photo-preview" style="margin-top:8px"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px">
      <button class="btn btn-ghost" onclick="closeModal('receipt-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="submitReceipt()">Submit</button>
    </div>
  `;

  $('rec-photo').addEventListener('change', function() {
    const file = this.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      $('rec-photo-preview').innerHTML = `<img src="${e.target.result}" style="max-width:100%;border-radius:8px;max-height:150px">`;
    };
    reader.readAsDataURL(file);
  });

  openModal('receipt-modal');
};

window.toggleBillable = (btn) => {
  btn.classList.toggle('on');
  $('rec-project-wrap').style.display = btn.classList.contains('on') ? 'block' : 'none';
};

window.submitReceipt = async () => {
  const amount = parseFloat($('rec-amount').value);
  if (!amount || isNaN(amount)) { toast('Please enter an amount', 'error'); return; }

  const billable = $('tog-rec-billable').classList.contains('on');
  const projectId = billable ? parseInt($('rec-project').value) || null : null;

  const receipt = {
    userId: currentUser.id, date: $('rec-date').value,
    amount, description: $('rec-desc').value,
    billable, projectId, status: 'submitted',
    syncStatus: 'pending', submittedAt: new Date().toISOString()
  };

  const id = await window.DR_DB.receipts.add(receipt);
  receipt.id = id;

  // Upload photo
  const file = $('rec-photo').files[0];
  if (file) {
    await uploadReceiptPhoto(file, receipt, currentUser.name);
  }

  // Notify supervisors
  const supervisors = await window.DR_DB.users.where('role').equals('supervisor').toArray();
  for (const sup of supervisors) {
    await window.DR_DB.notifications.add({
      toUserId: sup.id, fromUserId: currentUser.id,
      message: `${currentUser.name} submitted a ${billable ? 'billable' : 'non-billable'} receipt of $${amount.toFixed(2)}`,
      scheduledAt: new Date().toISOString(), read: false, type: 'receipt'
    });
  }

  closeModal('receipt-modal');
  toast('Receipt submitted', 'success');
  renderReceiptsPage();
};

// ─── Photos module ────────────────────────────────────────────────────────────
async function renderPhotosPage() {
  const container = $('page-photos').querySelector('.page-scroll');
  const projects = await getProjects();

  let html = `<div class="section-header"><span class="section-title">Site Photos</span></div>
  <div class="card">
    <div class="form-group">
      <label>Project</label>
      <select id="photo-project">
        <option value="">Select project...</option>
        ${projects.map(p => `<option value="${p.id}" data-name="${escHtml(p.name)}">${escHtml(p.name)}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label>Photos</label>
      <input type="file" id="photo-input" accept="image/*" capture="environment" multiple style="background:transparent;border:1.5px dashed var(--gold);padding:12px;cursor:pointer">
    </div>
    <div id="photo-previews" style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:8px"></div>
    <button class="btn btn-primary btn-full mt-12" onclick="uploadPhotos()">Upload to OneDrive</button>
  </div>`;

  const recentPhotos = await window.DR_DB.photos.where('userId').equals(currentUser.id).reverse().limit(20).sortBy('takenAt');
  if (recentPhotos.length) {
    html += `<div class="section-header mt-12"><span class="section-title">Uploaded</span></div>`;
    recentPhotos.forEach(p => {
      html += `<div class="list-item">
        <div class="list-item-left">
          <div class="list-item-title">${p.filename}</div>
          <div class="list-item-sub">${p.takenAt?.slice(0,10)} • ${p.syncStatus === 'synced' ? '☁️ OneDrive' : '📱 Pending sync'}</div>
        </div>
      </div>`;
    });
  }

  container.innerHTML = html;

  $('photo-input').addEventListener('change', function() {
    const previews = $('photo-previews');
    previews.innerHTML = '';
    Array.from(this.files).forEach(file => {
      const reader = new FileReader();
      reader.onload = e => {
        previews.innerHTML += `<img src="${e.target.result}" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px">`;
      };
      reader.readAsDataURL(file);
    });
  });
}

window.uploadPhotos = async () => {
  const input = $('photo-input');
  const projectSel = $('photo-project');
  const projectName = projectSel.options[projectSel.selectedIndex]?.dataset.name || 'General';

  if (!input.files.length) { toast('Select photos first', 'error'); return; }

  let count = await window.DR_DB.photos.where('userId').equals(currentUser.id).count();

  for (const file of input.files) {
    count++;
    const filename = await uploadSitePhoto(file, projectName, currentUser.name, count);
    await window.DR_DB.photos.add({
      userId: currentUser.id, projectId: parseInt(projectSel.value) || null,
      filename: `${currentUser.name.replace(/\s+/g,'_')}_${new Date().toISOString().slice(0,10)}_${String(count).padStart(3,'0')}`,
      takenAt: new Date().toISOString(), syncStatus: filename ? 'synced' : 'pending'
    });
  }

  toast(`${input.files.length} photo(s) uploaded`, 'success');
  renderPhotosPage();
};

// ─── Staff management (Supervisor) ───────────────────────────────────────────
async function renderStaff() {
  const container = $('page-staff').querySelector('.page-scroll');
  const users = await getAllUsers();

  let html = `<div class="section-header">
    <span class="section-title">Staff</span>
    <button class="btn btn-primary btn-sm" onclick="openAddStaffModal()">+ Add</button>
  </div>`;

  users.forEach(u => {
    html += `<div class="list-item">
      <div class="list-item-left">
        <div class="list-item-title">${escHtml(u.name)}</div>
        <div class="list-item-sub">${u.role} • ${u.email || '—'}</div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-sm btn-ghost" onclick="openSendReminderModal(${u.id},'${escHtml(u.name)}')">🔔 Ping</button>
        <button class="btn btn-sm btn-danger" onclick="deactivateUser(${u.id})">Remove</button>
      </div>
    </div>`;
  });

  html += `<div class="section-header mt-16"><span class="section-title">Send Reminder</span></div>
  <div class="card">
    <div class="form-group"><label>Message</label><textarea id="reminder-msg" placeholder="Reminder message..."></textarea></div>
    <div class="form-group"><label>Schedule For</label><input type="datetime-local" id="reminder-time"></div>
    <div class="toggle-row">
      <span class="toggle-label">Send to ALL staff</span>
      <button class="toggle" id="tog-all-staff" onclick="toggleBtn(this,'reminder-individual')"></button>
    </div>
    <div id="reminder-individual">
      <div class="form-group mt-8"><label>Or Select Specific Staff</label>
        <select id="reminder-user">
          ${users.filter(u => u.id !== currentUser.id).map(u => `<option value="${u.id}">${escHtml(u.name)}</option>`).join('')}
        </select>
      </div>
    </div>
    <button class="btn btn-primary btn-full mt-8" onclick="sendReminder()">Send Reminder</button>
  </div>`;

  container.innerHTML = html;
  $('reminder-time').value = new Date(Date.now() + 60000).toISOString().slice(0,16);
}

window.sendReminder = async () => {
  const msg = $('reminder-msg').value.trim();
  if (!msg) { toast('Enter a message', 'error'); return; }
  const allStaff = $('tog-all-staff').classList.contains('on');
  const scheduledAt = $('reminder-time').value ? new Date($('reminder-time').value).toISOString() : new Date().toISOString();
  const users = allStaff ? await getAllUsers() : [{ id: parseInt($('reminder-user').value) }];

  for (const u of users) {
    if (u.id === currentUser.id) continue;
    await window.DR_DB.notifications.add({
      toUserId: u.id, fromUserId: currentUser.id, message: msg,
      scheduledAt, read: false, type: 'reminder'
    });
  }
  toast(`Reminder scheduled for ${users.length} staff`, 'success');
  $('reminder-msg').value = '';
};

window.deactivateUser = async (id) => {
  if (!confirm('Remove this staff member?')) return;
  await window.DR_DB.users.update(id, { active: false });
  toast('Staff member removed', 'info');
  renderStaff();
};

window.openAddStaffModal = () => {
  const modal = $('staff-modal-sheet');
  modal.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-title">Add Staff Member</div>
    <div class="form-group"><label>Full Name</label><input type="text" id="staff-name" placeholder="Full name"></div>
    <div class="form-group"><label>Username</label><input type="text" id="staff-username" placeholder="login username"></div>
    <div class="form-group"><label>Password</label><input type="password" id="staff-pass" placeholder="Temporary password"></div>
    <div class="form-group"><label>Email</label><input type="email" id="staff-email" placeholder="email@company.com"></div>
    <div class="form-group"><label>Role</label>
      <select id="staff-role"><option value="field">Field Staff</option><option value="supervisor">Supervisor</option></select>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px">
      <button class="btn btn-ghost" onclick="closeModal('staff-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="addStaff()">Add</button>
    </div>
  `;
  openModal('staff-modal');
};

window.addStaff = async () => {
  const name = $('staff-name').value.trim();
  const username = $('staff-username').value.trim().toLowerCase();
  if (!name || !username) { toast('Name and username required', 'error'); return; }
  const exists = await window.DR_DB.users.where('username').equals(username).first();
  if (exists) { toast('Username already taken', 'error'); return; }
  await window.DR_DB.users.add({
    name, username, password: $('staff-pass').value,
    email: $('staff-email').value, role: $('staff-role').value, active: true
  });
  closeModal('staff-modal');
  toast('Staff member added', 'success');
  renderStaff();
};

// ─── Invoicing (Supervisor) ───────────────────────────────────────────────────
async function renderInvoicing() {
  const container = $('page-invoicing').querySelector('.page-scroll');
  const invoices = await window.DR_DB.invoices.toArray();
  const projects = await getProjects(false);

  let html = `<div class="section-header">
    <span class="section-title">Invoices</span>
    <button class="btn btn-primary btn-sm" onclick="openNewInvoiceModal()">+ New</button>
  </div>`;

  if (!invoices.length) {
    html += `<div class="empty-state">${svgDoc()}<p>No invoices created yet</p></div>`;
  } else {
    for (const inv of invoices) {
      const proj = projects.find(p => p.id === inv.projectId);
      html += `<div class="list-item" onclick="viewInvoice(${inv.id})">
        <div class="list-item-left">
          <div class="list-item-title">INV-${String(inv.id).padStart(4,'0')} — ${proj?.name || '—'}</div>
          <div class="list-item-sub">$${Number(inv.total || 0).toFixed(2)} • ${inv.createdAt?.slice(0,10)}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="status status-${inv.status}">${inv.status}</span>
          <span class="chevron">›</span>
        </div>
      </div>`;
    }
  }

  container.innerHTML = html;
}

window.openNewInvoiceModal = async () => {
  const projects = await getProjects(false);
  const approvedWOs = await window.DR_DB.workOrders.where('status').equals('approved').toArray();
  const modal = $('invoice-modal-sheet');

  modal.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-title">New Invoice</div>
    <div class="form-group"><label>Project</label>
      <select id="inv-project" onchange="loadApprovedWOs(this.value)">
        <option value="">Select project...</option>
        ${projects.map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('')}
      </select>
    </div>
    <div id="inv-wo-section" style="display:none">
      <div class="section-header mt-8"><span class="section-title">Attach Work Orders</span></div>
      <div id="inv-wo-list"></div>
    </div>
    <div class="section-header mt-8"><span class="section-title">Line Items</span>
      <button class="btn btn-sm btn-outline" onclick="addInvLine()">+ Add Line</button>
    </div>
    <div id="inv-lines"></div>
    <div class="form-group mt-8"><label>Payment Terms</label>
      <select id="inv-terms">
        <option value="30 days net">30 days net</option>
        <option value="15 days net">15 days net</option>
        <option value="Due on receipt">Due on receipt</option>
      </select>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px">
      <button class="btn btn-ghost" onclick="closeModal('invoice-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="saveInvoice()">Create Invoice</button>
    </div>
  `;

  openModal('invoice-modal');
};

window.loadApprovedWOs = async (projectId) => {
  if (!projectId) return;
  const wos = await window.DR_DB.workOrders.where('projectId').equals(parseInt(projectId)).filter(w => w.status === 'approved').toArray();
  const section = $('inv-wo-section');
  const list = $('inv-wo-list');
  section.style.display = 'block';

  if (!wos.length) { list.innerHTML = '<p class="text-muted text-sm">No approved work orders for this project</p>'; return; }

  list.innerHTML = wos.map(wo => `
    <div class="toggle-row">
      <span class="toggle-label">WO-${String(wo.id).padStart(4,'0')} — ${wo.date}</span>
      <input type="checkbox" value="${wo.id}" id="wo-check-${wo.id}" style="width:20px;height:20px;cursor:pointer">
    </div>`).join('');
};

window.addInvLine = () => {
  const container = $('inv-lines');
  const row = el('div', 'card mt-8');
  row.innerHTML = `
    <div class="form-group"><label>Description</label><input type="text" class="inv-desc" placeholder="Line item description"></div>
    <div class="grid-2">
      <div class="form-group"><label>Qty</label><input type="number" class="inv-qty" value="1" min="0" step="0.5"></div>
      <div class="form-group"><label>Rate ($)</label><input type="number" class="inv-rate" value="0" min="0" step="0.01"></div>
    </div>
    <button onclick="this.closest('.card').remove()" class="btn btn-danger btn-sm">Remove</button>
  `;
  container.appendChild(row);
};

window.saveInvoice = async () => {
  const projectId = parseInt($('inv-project').value);
  if (!projectId) { toast('Select a project', 'error'); return; }

  // Gather attached WO ids
  const woIds = Array.from(document.querySelectorAll('#inv-wo-list input[type=checkbox]:checked')).map(cb => parseInt(cb.value));

  // Gather line items
  const lines = [];
  document.querySelectorAll('#inv-lines .card').forEach(card => {
    const desc = card.querySelector('.inv-desc').value;
    const qty  = parseFloat(card.querySelector('.inv-qty').value) || 1;
    const rate = parseFloat(card.querySelector('.inv-rate').value) || 0;
    if (desc) lines.push({ description: desc, quantity: qty, rate, amount: qty * rate });
  });

  const total = lines.reduce((s, l) => s + l.amount, 0);

  const invId = await window.DR_DB.invoices.add({
    projectId, workOrderIds: woIds, status: 'draft',
    total, dueDate: $('inv-terms').value,
    createdBy: currentUser.id, createdAt: new Date().toISOString()
  });

  for (const line of lines) await window.DR_DB.invoiceItems.add({ invoiceId: invId, ...line });

  closeModal('invoice-modal');
  toast('Invoice created', 'success');
  renderInvoicing();
};

window.viewInvoice = async (invId) => {
  const inv = await window.DR_DB.invoices.get(invId);
  if (!inv) return;
  const items = await window.DR_DB.invoiceItems.where('invoiceId').equals(invId).toArray();
  const projects = await getProjects(false);
  const proj = projects.find(p => p.id === inv.projectId);

  const modal = $('inv-view-modal-sheet');
  modal.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-title">INV-${String(invId).padStart(4,'0')}</div>
    <div class="text-sm text-muted">Project: <strong style="color:var(--text)">${proj?.name || '—'}</strong></div>
    <div class="text-sm text-muted">Client: ${proj?.clientName || '—'}</div>
    <div class="divider"></div>
    ${items.map(i => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)">
      <span class="text-sm">${i.description}</span>
      <span class="text-sm text-gold">$${Number(i.amount).toFixed(2)}</span>
    </div>`).join('')}
    <div style="display:flex;justify-content:space-between;padding:12px 0" class="mt-8">
      <strong>Total (+ GST)</strong>
      <strong class="text-gold">$${(inv.total * 1.05).toFixed(2)}</strong>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px">
      <button class="btn btn-ghost" onclick="closeModal('inv-view-modal')">Close</button>
      <button class="btn btn-primary" onclick="finalizeInvoice(${invId})">Generate & Email PDF</button>
    </div>
  `;
  openModal('inv-view-modal');
};

window.finalizeInvoice = async (invId) => {
  const inv = await window.DR_DB.invoices.get(invId);
  const items = await window.DR_DB.invoiceItems.where('invoiceId').equals(invId).toArray();
  const projects = await getProjects(false);
  const proj = projects.find(p => p.id === inv.projectId);
  const wos = inv.workOrderIds ? await Promise.all(inv.workOrderIds.map(id => window.DR_DB.workOrders.get(id))) : [];

  const pdf = await generateInvoicePDF(inv, proj, items, wos);
  await uploadInvoicePDF(pdf, inv, proj?.name || 'Project');
  await window.DR_DB.invoices.update(invId, { status: 'sent', sentAt: new Date().toISOString() });

  if (proj?.clientEmail) {
    const b64 = pdfToBase64(pdf);
    await sendEmail({
      to: proj.clientEmail,
      subject: `Invoice INV-${String(invId).padStart(4,'0')} — ${proj.name}`,
      body: `<p>Please find attached invoice INV-${String(invId).padStart(4,'0')} for <strong>${proj.name}</strong>.</p><p>Payment terms: ${inv.dueDate || '30 days net'}</p><p>Regards,<br>${currentUser.name}<br>DÙN RIGHT Field Services</p>`,
      attachments: [{ name: `Invoice_INV-${String(invId).padStart(4,'0')}.pdf`, contentType: 'application/pdf', contentBytes: b64 }]
    });
  }

  closeModal('inv-view-modal');
  toast('Invoice finalized and emailed', 'success');
  renderInvoicing();
};

// ─── Utility functions ────────────────────────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function timeSince(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── SVG icons ────────────────────────────────────────────────────────────────
function svgHome()      { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`; }
function svgClipboard() { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>`; }
function svgShield()    { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`; }
function svgReceipt()   { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 2v20l3-2 3 2 3-2 3 2 3-2V2z"/><line x1="8" y1="9" x2="16" y2="9"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="12" y2="17"/></svg>`; }
function svgCamera()    { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>`; }
function svgCheck()     { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`; }
function svgFolder()    { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>`; }
function svgDoc()       { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`; }
function svgPeople()    { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>`; }
function svgGrid()      { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>`; }

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Try to restore session
  const savedId = sessionStorage.getItem('dr_user_id');
  if (savedId) {
    const user = await window.DR_DB.users.get(parseInt(savedId));
    if (user && user.active) { currentUser = user; showApp(); return; }
  }
  $('login-form').addEventListener('submit', handleLogin);
  $('login-screen').style.display = 'flex';
});

// Expose for inline handlers
window.navigate = navigate;
window.openModal = openModal;
window.closeModal = closeModal;
window.viewWorkOrder = async (id) => { toast('Viewing WO ' + id, 'info'); };
window.editProject = async (id) => { toast('Edit project ' + id + ' coming soon', 'info'); };
