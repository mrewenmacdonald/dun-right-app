// DÙN RIGHT — Main application logic
import { login, getAllUsers, getUser, getProjects, createProject, generateProjectNumber,
         createLEM, getLEMsByUser, getAllLEMs, getPendingLEMs, getAllEquipment,
         getNotifications, markRead, getSetting, setSetting } from './db.js';
import { generateLEMPDF, generateInvoicePDF } from './pdf.js';
import { setAccessToken, uploadTimesheetPDF, uploadInvoicePDF,
         uploadReceiptPhoto, uploadSitePhoto, uploadSafetyForm,
         sendEmail, pdfToBase64 } from './sync.js';

// ─── State ────────────────────────────────────────────────────────────────────
let currentUser = null;
let currentPage = 'home';
let viewingEmployeeId = null;

const $ = id => document.getElementById(id);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

// ─── Toast ────────────────────────────────────────────────────────────────────
function toast(msg, type = 'info', duration = 3000) {
  const container = $('toast-container');
  const t = el('div', `toast ${type}`, msg);
  container.appendChild(t);
  setTimeout(() => t.remove(), duration);
}

// ─── Modals ───────────────────────────────────────────────────────────────────
function openModal(id) {
  const o = $(id + '-overlay');
  if (o) o.classList.add('open');
}
function closeModal(id) {
  const o = $(id + '-overlay');
  if (o) o.classList.remove('open');
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

  if (page === 'home')             renderHome();
  if (page === 'lem')              renderLEMList();
  if (page === 'safety')           renderSafetyPage();
  if (page === 'receipts')         renderReceiptsPage();
  if (page === 'photos')           renderPhotosPage();
  if (page === 'approvals')        renderApprovals();
  if (page === 'projects')         renderProjects();
  if (page === 'invoicing')        renderInvoicing();
  if (page === 'staff')            renderStaff();
  if (page === 'equipment')        renderEquipment();
  if (page === 'walkaround')       renderWalkaround();
  if (page === 'employee-profile') renderEmployeeProfile();
  if (page === 'lem-dashboard')    renderLEMDashboard();
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
    { page: 'home',      icon: svgHome(),      label: 'Home' },
    { page: 'lem',       icon: svgClipboard(), label: 'LEMs' },
    { page: 'safety',   icon: svgShield(),    label: 'Safety' },
    { page: 'receipts', icon: svgReceipt(),   label: 'Receipts' },
    { page: 'photos',   icon: svgCamera(),    label: 'Photos' }
  ];
  const supervisorExtra = [
    { page: 'approvals',     icon: svgCheck(),    label: 'Approve' },
    { page: 'projects',      icon: svgFolder(),   label: 'Projects' },
    { page: 'lem-dashboard', icon: svgClipboard(),label: 'LEM Board' },
    { page: 'invoicing',     icon: svgDoc(),      label: 'Invoices' },
    { page: 'staff',         icon: svgPeople(),   label: 'Staff' },
    { page: 'equipment',     icon: svgWrench(),   label: 'Equipment' },
    { page: 'walkaround',    icon: svgTruck(),    label: 'Walkaround' }
  ];

  const bottomItems = currentUser.role === 'supervisor'
    ? [fieldItems[0], fieldItems[1], supervisorExtra[0], supervisorExtra[1], { page: 'more', icon: svgGrid(), label: 'More' }]
    : [...fieldItems.slice(0, 4), { page: 'more', icon: svgGrid(), label: 'More' }];

  bottomItems.forEach(item => {
    const btn = el('button', 'nav-item', `${item.icon}<span>${item.label}</span>`);
    btn.dataset.page = item.page;
    btn.addEventListener('click', () => {
      if (item.page === 'more') showMoreMenu();
      else navigate(item.page);
    });
    nav.appendChild(btn);
  });

  if (currentUser.role === 'supervisor') {
    buildMoreMenu(supervisorExtra.slice(2), fieldItems.slice(1));
  } else {
    buildMoreMenu([], [fieldItems[4]]);
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────
const TITLE_ROLES = [
  '1 Person Survey Crew',
  '2 Person Survey Crew',
  '1 Person Utility Locate Crew',
  '2 Person Locate Crew',
  'Survey Manager',
  'Project Manager',
  'Project Coordinator',
  'CAD Technician',
  'Construction Manager',
  'Construction Advisor',
  'Concrete Testing Technician',
  'Director of Business Development'
];

const EQUIPMENT_TYPES = [
  'Trimble R10',
  'Trimble R12',
  'Trimble SX10',
  'Trimble S6',
  'Trimble S7',
  'Trimble VX',
  'Utility Locator',
  'Mavic 3E Drone',
  'Phantom 4 RTK Drone',
  'Other'
];

const BATTERY_TYPES = [
  'Trimble GPS Battery',
  'Trimble Total Station Battery',
  'Trimble Data Collector Battery',
  'Tripod',
  'Prism / Pole',
  'Drone Battery',
  'Extension Cable',
  'Other Accessory'
];

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
    const btn = el('button', 'card flex-center',
      `<div style="text-align:center">${item.icon}<br><span style="font-size:0.8rem;margin-top:6px;display:block">${item.label}</span></div>`);
    btn.style.flexDirection = 'column';
    btn.addEventListener('click', () => { closeModal('more'); navigate(item.page); });
    grid.appendChild(btn);
  });
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal('more'); });
}

function showMoreMenu() { openModal('more'); }

// ─── Home ─────────────────────────────────────────────────────────────────────
async function renderHome() {
  const container = $('page-home');
  const notifs = await getNotifications(currentUser.id);
  const unread  = notifs.filter(n => !n.read);
  const pending = currentUser.role === 'supervisor' ? await getPendingLEMs() : [];

  let html = `<div class="section-header"><span class="section-title">Good ${greeting()}, ${currentUser.name.split(' ')[0]}</span></div>`;

  if (unread.length) {
    html += `<div class="card" style="border-color:var(--warning)">
      <div class="card-title">🔔 Notifications (${unread.length})</div>`;
    unread.slice(0, 3).forEach(n => {
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
      <div class="card-title">⏳ LEMs Awaiting Approval (${pending.length})</div>
      <button class="btn btn-outline btn-full mt-8" onclick="navigate('approvals')">Review Now</button>
    </div>`;
  }

  html += `<div class="section-header mt-12"><span class="section-title">Quick Actions</span></div>
  <div class="grid-2">
    <button class="btn btn-primary" onclick="navigate('lem')">📋 New LEM</button>
    <button class="btn btn-outline" onclick="navigate('safety')">🦺 Safety Form</button>
    <button class="btn btn-ghost" onclick="navigate('walkaround')">🚛 Vehicle Check</button>
    <button class="btn btn-ghost" onclick="navigate('receipts')">🧾 Receipt</button>
  </div>`;

  if (currentUser.role === 'supervisor') {
    html += `<div class="grid-2 mt-8">
      <button class="btn btn-ghost" onclick="navigate('equipment')">🔧 Equipment</button>
      <button class="btn btn-ghost" onclick="navigate('staff')">👥 Staff</button>
    </div>`;
  }

  const lems = await getLEMsByUser(currentUser.id);
  const today = new Date().toISOString().slice(0, 10);
  const todayLEMs = lems.filter(l => l.date === today);
  if (todayLEMs.length === 0) {
    html += `<div class="card mt-12" style="border-color:var(--warning)">
      <div class="card-title text-muted">No LEM for today</div>
      <button class="btn btn-primary btn-full mt-8" onclick="openNewLEMModal()">Create Today's LEM</button>
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

// ─── LEM Number generator ─────────────────────────────────────────────────────
function generateLEMNumber(projectNumber, date) {
  // Format: {projectNumber}-{YYMMDD}
  const d = date || new Date().toISOString().slice(0, 10);
  const parts = d.split('-');
  const yy = parts[0].slice(2);
  const mm = parts[1];
  const dd = parts[2];
  return `${projectNumber || '000000'}-${yy}${mm}${dd}`;
}

// ─── LEM List ─────────────────────────────────────────────────────────────────
async function renderLEMList() {
  const container = $('page-lem').querySelector('.page-scroll');
  const lems = await getLEMsByUser(currentUser.id);

  let html = `<div class="section-header">
    <span class="section-title">LEMs</span>
    <button class="btn btn-primary btn-sm" onclick="openNewLEMModal()">+ New</button>
  </div>`;

  if (!lems.length) {
    html += `<div class="empty-state">${svgClipboard()}<p>No LEMs yet</p></div>`;
  } else {
    const projects = await getProjects(false);
    lems.forEach(lem => {
      const proj = projects.find(p => p.id === lem.projectId);
      html += `<div class="list-item" onclick="viewLEM(${lem.id})">
        <div class="list-item-left">
          <div class="list-item-title">${escHtml(lem.lemNumber || `LEM-${String(lem.id).padStart(4,'0')}`)}</div>
          <div class="list-item-sub">${lem.date} • ${escHtml(proj?.name || '—')}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="status status-${lem.status}">${lem.status}</span>
          <span class="chevron">›</span>
        </div>
      </div>`;
    });
  }

  container.innerHTML = html;
}

// ─── New LEM Modal ────────────────────────────────────────────────────────────
window.openNewLEMModal = async () => {
  const projects = await getProjects();

  const modal = $('wo-modal-sheet');
  modal.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-title">New LEM (Daily Field Ticket)</div>

    <div class="form-group">
      <label>Date</label>
      <input type="date" id="lem-date" value="${new Date().toISOString().slice(0,10)}" onchange="updateLEMNumber()">
    </div>
    <div class="form-group">
      <label>Search Project (name or number)</label>
      <input type="text" id="lem-project-search" placeholder="Type to search projects..." oninput="filterLEMProjects(this.value)" autocomplete="off">
      <div id="lem-project-list" style="max-height:180px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;margin-top:4px;display:none;background:var(--surface)"></div>
      <input type="hidden" id="lem-project" value="">
      <div id="lem-project-selected" style="margin-top:4px;font-size:0.85rem;color:var(--gold)"></div>
    </div>
    <div class="form-group">
      <label>LEM #</label>
      <input type="text" id="lem-number" placeholder="Select a project first" readonly style="background:var(--surface);color:var(--muted)">
    </div>

    <div class="divider"></div>

    <!-- LABOUR SECTION -->
    <div class="section-header">
      <span class="section-title">Labour</span>
      <button class="btn btn-sm btn-outline" onclick="addLabourRow()">+ Add Person</button>
    </div>
    <div id="labour-rows"></div>

    <div class="divider"></div>

    <!-- EQUIPMENT SECTION -->
    <div class="section-header">
      <span class="section-title">Equipment Used</span>
    </div>
    <div id="lem-equipment-rows"></div>
    <div class="form-group mt-8">
      <label>Additional Equipment / Notes</label>
      <textarea id="lem-equipment-notes" placeholder="Other tools, accessories..." rows="2"></textarea>
    </div>

    <div class="divider"></div>

    <!-- BATTERIES & ACCESSORIES -->
    <div class="section-header">
      <span class="section-title">Batteries &amp; Accessories</span>
      <button class="btn btn-sm btn-outline" onclick="addBatteryRow()">+ Add</button>
    </div>
    <div id="lem-battery-rows"></div>

    <div class="divider"></div>

    <!-- CONSUMABLES SECTION -->
    <div class="section-header">
      <span class="section-title">Consumables</span>
      <button class="btn btn-sm btn-outline" onclick="addConsumableRow()">+ Add</button>
    </div>
    <div id="consumable-rows"></div>

    <div class="divider"></div>

    <!-- FIELD SAMPLES SECTION -->
    <div class="section-header">
      <span class="section-title">Field Samples</span>
      <button class="btn btn-sm btn-outline" onclick="addFieldSampleRow()">+ Add Sample</button>
    </div>
    <div id="field-sample-rows"></div>

    <div class="divider"></div>

    <!-- NOTES -->
    <div class="form-group">
      <label>Notes / Comments</label>
      <textarea id="lem-notes" placeholder="Any notes for this LEM..."></textarea>
    </div>

    <!-- SIGNATURE -->
    <div class="form-group">
      <label>Field Staff Signature</label>
      <div class="sig-canvas-wrap">
        <canvas id="sigCanvas" width="600" height="150"></canvas>
        <button class="sig-clear" onclick="clearSig()">Clear</button>
      </div>
      <p class="text-muted text-sm">Sign with your finger above</p>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px">
      <button class="btn btn-ghost" onclick="closeModal('wo-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="submitLEM('draft')">Save Draft</button>
    </div>
    <button class="btn btn-success btn-full mt-8" onclick="submitLEM('submitted')">Submit for Approval</button>
  `;

  // Store projects for search
  window._lemProjectsCache = projects;

  setTimeout(() => {
    addLabourRow();
    setupSigCanvas();
    initLEMEquipmentSlots();
    addBatteryRow();
  }, 50);

  openModal('wo-modal');
};

// ─── Project search for LEM ───────────────────────────────────────────────────
window.filterLEMProjects = (query) => {
  const list = $('lem-project-list');
  if (!list) return;
  const projects = window._lemProjectsCache || [];
  const q = query.trim().toLowerCase();
  const filtered = q
    ? projects.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.projectNumber || '').toLowerCase().includes(q))
    : projects;

  if (!filtered.length) {
    list.innerHTML = '<div style="padding:8px;color:var(--muted);font-size:0.85rem">No projects found</div>';
    list.style.display = 'block';
    return;
  }
  list.innerHTML = filtered.map(p => {
    const num = escHtml(p.projectNumber || String(p.id).padStart(6,'0'));
    const name = escHtml(p.name);
    return `<div onclick="selectLEMProject(${p.id},'${name}','${num}')"
       style="padding:10px;cursor:pointer;border-bottom:1px solid var(--border);font-size:0.9rem">
      <strong>${name}</strong>
      <span style="color:var(--muted);font-size:0.8rem;margin-left:8px">#${num}</span>
    </div>`;
  }).join('');
  list.style.display = 'block';
};

window.selectLEMProject = (id, name, projNum) => {
  $('lem-project').value = id;
  $('lem-project-search').value = name;
  $('lem-project-selected').textContent = `✓ #${projNum} — ${name}`;
  $('lem-project-list').style.display = 'none';
  // Store num for LEM number generation
  window._selectedProjNum = projNum;
  updateLEMNumber();
};

// ─── Equipment slots for LEM ──────────────────────────────────────────────────
const MIN_EQ_SLOTS = 5;

function initLEMEquipmentSlots() {
  const container = $('lem-equipment-rows');
  if (!container) return;
  container.innerHTML = '';
  for (let i = 0; i < MIN_EQ_SLOTS; i++) addEquipmentSlot();
}

window.addEquipmentSlot = () => {
  const container = $('lem-equipment-rows');
  if (!container) return;
  const idx = container.querySelectorAll('.eq-slot').length;
  const slot = el('div', 'eq-slot card mt-8');
  slot.style.padding = '8px';
  slot.innerHTML = `
    <div class="form-group" style="margin-bottom:6px">
      <label style="font-size:0.75rem">Equipment Type</label>
      <select class="eq-type" onchange="onEquipmentTypeSelected(this)">
        <option value="">— Select equipment —</option>
        ${EQUIPMENT_TYPES.map(t => `<option value="${escHtml(t)}">${escHtml(t)}</option>`).join('')}
      </select>
    </div>
    <div class="eq-serial-wrap" style="display:none">
      <div class="form-group" style="margin-bottom:0">
        <label style="font-size:0.75rem;color:var(--danger)">Serial Number (required)</label>
        <input type="text" class="eq-serial" placeholder="Enter serial number...">
      </div>
    </div>
  `;
  container.appendChild(slot);
};

window.onEquipmentTypeSelected = (sel) => {
  const slot = sel.closest('.eq-slot');
  const wrap = slot.querySelector('.eq-serial-wrap');
  const serialInput = slot.querySelector('.eq-serial');
  if (sel.value) {
    wrap.style.display = 'block';
    serialInput.focus();
    // Check if we need to add a new slot
    const container = $('lem-equipment-rows');
    const slots = container.querySelectorAll('.eq-slot');
    const allFilled = Array.from(slots).every(s => s.querySelector('.eq-type').value);
    if (allFilled) addEquipmentSlot();
  } else {
    wrap.style.display = 'none';
  }
};

window.addBatteryRow = () => {
  const container = $('lem-battery-rows');
  if (!container) return;
  const row = el('div', 'consumable-row mt-4');
  row.innerHTML = `
    <select class="bat-type" style="flex:2">
      <option value="">Select type...</option>
      ${BATTERY_TYPES.map(t => `<option value="${escHtml(t)}">${escHtml(t)}</option>`).join('')}
    </select>
    <input type="number" class="bat-qty" placeholder="Qty" min="1" value="1" style="flex:0.6">
    <button onclick="this.parentElement.remove()" style="background:var(--danger);color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:1rem;padding:0 8px">×</button>
  `;
  container.appendChild(row);
};

window.updateLEMNumber = () => {
  const projNum = window._selectedProjNum || '000000';
  const date = $('lem-date')?.value || new Date().toISOString().slice(0,10);
  if ($('lem-number')) $('lem-number').value = generateLEMNumber(projNum, date);
};

// Labour rows with Keltic hour types
let lemUsersCache = [];

window.addLabourRow = async () => {
  if (!lemUsersCache.length) lemUsersCache = await window.DR_DB.users.where('active').equals(1).toArray();
  const container = $('labour-rows');
  const isSupervisor = currentUser.role === 'supervisor';
  const row = el('div', 'card mt-8');
  row.style.padding = '10px';
  row.innerHTML = `
    <div class="form-group">
      <label>Employee</label>
      <select class="lr-employee">
        <option value="">Select employee...</option>
        ${lemUsersCache.map(u => `<option value="${u.id}" data-rate="${u.hourlyRate || 0}">${escHtml(u.name)}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label>Title / Role</label>
      <select class="lr-title">
        <option value="">Select role...</option>
        ${TITLE_ROLES.map(r => `<option value="${escHtml(r)}">${escHtml(r)}</option>`).join('')}
      </select>
    </div>
    <div style="margin-bottom:6px;font-size:0.75rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--muted)">Hours by Type</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
      <div class="form-group"><label style="font-size:0.75rem">Surveying</label><input type="number" class="lr-survey" min="0" step="0.5" value="0"></div>
      <div class="form-group"><label style="font-size:0.75rem">Drafting</label><input type="number" class="lr-draft" min="0" step="0.5" value="0"></div>
      <div class="form-group"><label style="font-size:0.75rem">Office</label><input type="number" class="lr-office" min="0" step="0.5" value="0"></div>
      <div class="form-group"><label style="font-size:0.75rem">Other</label><input type="number" class="lr-other" min="0" step="0.5" value="0"></div>
      <div class="form-group" style="grid-column:1/-1"><label style="font-size:0.75rem">Travel</label><input type="number" class="lr-travel" min="0" step="0.5" value="0"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:4px">
      <div class="form-group"><label style="font-size:0.75rem">KM Start</label><input type="number" class="lr-km-start" min="0" step="1" value="0"></div>
      <div class="form-group"><label style="font-size:0.75rem">KM Stop</label><input type="number" class="lr-km-stop" min="0" step="1" value="0"></div>
    </div>
    ${isSupervisor ? `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:4px;padding:8px;background:rgba(255,165,0,0.08);border-radius:6px;border:1px dashed var(--gold)">
      <div style="grid-column:1/-1;font-size:0.7rem;font-weight:700;color:var(--gold);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:2px">🔒 Supervisor Only</div>
      <div class="form-group"><label style="font-size:0.75rem">LOA Food ($)</label><input type="number" class="lr-loa-food" min="0" step="0.01" value="0"></div>
      <div class="form-group"><label style="font-size:0.75rem">LOA Accom ($)</label><input type="number" class="lr-loa-accom" min="0" step="0.01" value="0"></div>
      <div class="form-group" style="grid-column:1/-1"><label style="font-size:0.75rem">Hourly Rate ($/hr)</label><input type="number" class="lr-rate" min="0" step="0.01" value="0"></div>
    </div>` : `
    <input type="hidden" class="lr-loa-food" value="0">
    <input type="hidden" class="lr-loa-accom" value="0">
    <input type="hidden" class="lr-rate" value="0">`}
    <button onclick="this.closest('.card').remove()" class="btn btn-danger btn-sm" style="margin-top:8px">Remove</button>
  `;
  if (isSupervisor) {
    row.querySelector('.lr-employee').addEventListener('change', function() {
      const opt = this.options[this.selectedIndex];
      const rateInput = row.querySelector('.lr-rate');
      if (opt && opt.dataset.rate) rateInput.value = opt.dataset.rate;
    });
  }
  container.appendChild(row);
};

// (instrument rows replaced by equipment slots in v2.1)

let consumablesCache = [];

window.addConsumableRow = async () => {
  if (!consumablesCache.length) consumablesCache = await window.DR_DB.consumables.where('active').equals(1).toArray();
  const container = $('consumable-rows');
  const row = el('div', 'consumable-row mt-4');
  row.innerHTML = `
    <select style="flex:2">${consumablesCache.map(c => `<option value="${c.id}" data-unit="${c.unit}">${escHtml(c.name)}</option>`).join('')}</select>
    <input type="number" placeholder="Qty" min="1" value="1" style="flex:0.7">
    <button onclick="this.parentElement.remove()" style="background:var(--danger);color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:1rem">×</button>
  `;
  container.appendChild(row);
};

window.addFieldSampleRow = () => {
  const container = $('field-sample-rows');
  const row = el('div', 'consumable-row mt-4');
  row.innerHTML = `
    <input type="text" placeholder="Sample type (e.g. Core sample)" style="flex:2">
    <input type="number" placeholder="Qty" min="1" value="1" style="flex:0.7">
    <input type="text" placeholder="Notes" style="flex:1.5">
    <button onclick="this.parentElement.remove()" style="background:var(--danger);color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:1rem">×</button>
  `;
  container.appendChild(row);
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

window.toggleBtn = (btn, targetId) => {
  btn.classList.toggle('on');
  if (targetId) {
    const t = $(targetId);
    if (t) t.style.display = btn.classList.contains('on') ? 'block' : 'none';
  }
};

window.submitLEM = async (status) => {
  const projectId = parseInt($('lem-project').value);
  if (!projectId) { toast('Please select a project', 'error'); return; }

  const lemNumber = $('lem-number').value || generateLEMNumber('000000', $('lem-date').value);

  // Gather labour rows
  const labourItems = [];
  $('labour-rows').querySelectorAll('.card').forEach(row => {
    const empSel = row.querySelector('.lr-employee');
    const empId  = parseInt(empSel?.value) || null;
    const empName = empSel?.options[empSel.selectedIndex]?.text || '';
    const survey = parseFloat(row.querySelector('.lr-survey')?.value) || 0;
    const draft  = parseFloat(row.querySelector('.lr-draft')?.value)  || 0;
    const office = parseFloat(row.querySelector('.lr-office')?.value) || 0;
    const other  = parseFloat(row.querySelector('.lr-other')?.value)  || 0;
    const travel = parseFloat(row.querySelector('.lr-travel')?.value) || 0;
    const total  = survey + draft + office + other + travel;
    const rate   = parseFloat(row.querySelector('.lr-rate')?.value)   || 0;
    const kmStart= parseFloat(row.querySelector('.lr-km-start')?.value) || 0;
    const kmStop = parseFloat(row.querySelector('.lr-km-stop')?.value)  || 0;
    const loaFood= parseFloat(row.querySelector('.lr-loa-food')?.value) || 0;
    const loaAccom= parseFloat(row.querySelector('.lr-loa-accom')?.value)|| 0;
    const titleSel = row.querySelector('.lr-title');
    const title = titleSel?.value || '';
    if (empName) labourItems.push({ userId: empId, name: empName, title, survey, draft, office, other, travel, total, rate, kmStart, kmStop, loaFood, loaAccom });
  });

  // Equipment from new slots
  const instruments = [];
  const eqSlots = $('lem-equipment-rows');
  if (eqSlots) {
    eqSlots.querySelectorAll('.eq-slot').forEach(slot => {
      const eqType = slot.querySelector('.eq-type')?.value;
      const serial = slot.querySelector('.eq-serial')?.value?.trim() || '';
      if (eqType) {
        if (!serial) {
          // Warn but don't block — serial validation is advisory
        }
        instruments.push({ name: eqType, serialNumber: serial, qty: 1 });
      }
    });
  }
  // Additional equipment notes
  const equipmentNotes = $('lem-equipment-notes')?.value || '';

  // Batteries
  const batteries = [];
  const batRows = $('lem-battery-rows');
  if (batRows) {
    batRows.querySelectorAll('.consumable-row').forEach(row => {
      const batType = row.querySelector('.bat-type')?.value;
      const qty = parseInt(row.querySelector('.bat-qty')?.value) || 1;
      if (batType) batteries.push({ batteryType: batType, quantity: qty });
    });
  }

  // Consumables
  const consumables = [];
  $('consumable-rows').querySelectorAll('.consumable-row').forEach(row => {
    const sel = row.querySelector('select');
    const input = row.querySelector('input');
    const name = sel?.options[sel.selectedIndex]?.text || '';
    const qty  = parseFloat(input?.value) || 1;
    const unit = consumablesCache.find(c => c.name === name)?.unit || 'each';
    if (name) consumables.push({ name, qty, unit });
  });

  // Field samples
  const fieldSamples = [];
  $('field-sample-rows').querySelectorAll('.consumable-row').forEach(row => {
    const inputs = row.querySelectorAll('input');
    const type  = inputs[0]?.value;
    const qty   = parseInt(inputs[1]?.value) || 1;
    const notes = inputs[2]?.value || '';
    if (type) fieldSamples.push({ type, qty, notes });
  });

  // Signature
  const canvas = $('sigCanvas');
  const signature = canvas ? canvas.toDataURL('image/png') : null;

  // Validate: require serial numbers for equipment with type selected
  const missingSerial = instruments.filter(i => i.name && i.name !== 'Other' && !i.serialNumber);
  if (missingSerial.length > 0) {
    toast(`Serial number required for: ${missingSerial.map(i => i.name).join(', ')}`, 'error');
    return;
  }

  const lemData = {
    lemNumber, projectId, userId: currentUser.id,
    date: $('lem-date').value,
    labourItems, instruments, batteries, consumables, fieldSamples,
    equipmentNotes,
    notes: $('lem-notes').value,
    signature, status
  };

  if (status === 'submitted') lemData.submittedAt = new Date().toISOString();

  const id = await createLEM(lemData);

  // Save equipment to lemEquipment table
  for (const eq of instruments) {
    if (eq.name) {
      await window.DR_DB.lemEquipment.add({ lemId: id, userId: currentUser.id, equipmentType: eq.name, serialNumber: eq.serialNumber || '' });
    }
  }
  // Save batteries to lemBatteries table
  for (const bat of batteries) {
    await window.DR_DB.lemBatteries.add({ lemId: id, userId: currentUser.id, batteryType: bat.batteryType, quantity: bat.quantity });
  }

  closeModal('wo-modal');
  toast(status === 'submitted' ? 'LEM submitted for approval!' : 'Draft saved', 'success');

  if (status === 'submitted') {
    const supervisors = await window.DR_DB.users.where('role').equals('supervisor').toArray();
    for (const sup of supervisors) {
      await window.DR_DB.notifications.add({
        toUserId: sup.id, fromUserId: currentUser.id,
        message: `${currentUser.name} submitted LEM ${lemNumber} for approval`,
        scheduledAt: new Date().toISOString(), read: false, type: 'approval_request'
      });
    }
  }

  navigate(currentPage);
};

window.viewLEM = async (id) => {
  const lem = await window.DR_DB.lems.get(id);
  if (!lem) return;
  const projects = await getProjects(false);
  const proj = projects.find(p => p.id === lem.projectId);
  const lemEqs = await window.DR_DB.lemEquipment.where('lemId').equals(id).toArray();
  const isSupervisor = currentUser.role === 'supervisor';

  const modal = $('wo-modal-sheet');
  const labour = lem.labourItems || [];
  modal.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-title">${escHtml(lem.lemNumber || `LEM-${String(id).padStart(4,'0')}`)}</div>
    <div class="text-sm text-muted">Date: ${lem.date} • <span class="status status-${lem.status}">${lem.status}</span></div>
    <div class="text-sm text-muted mt-4">Project: <strong>${escHtml(proj?.name || '—')}</strong></div>

    ${labour.length > 0 ? `
    <div class="section-header mt-12"><span class="section-title">Labour</span></div>
    ${labour.map(l => `
      <div class="card mt-4">
        <div class="card-title" style="margin-bottom:2px">${escHtml(l.name)}</div>
        ${l.title ? `<div class="text-sm text-muted">${escHtml(l.title)}</div>` : ''}
        <div class="text-sm">Surveying: ${l.survey||0}h · Drafting: ${l.draft||0}h · Office: ${l.office||0}h · Other: ${l.other||0}h · Travel: ${l.travel||0}h</div>
        <div class="text-sm"><strong>Total: ${(l.total||0).toFixed(1)}h</strong></div>
        ${isSupervisor ? `
        <div class="text-sm text-muted">Rate: $${(l.rate||0).toFixed(2)}/hr → <strong style="color:var(--gold)">$${((l.total||0)*(l.rate||0)).toFixed(2)}</strong></div>
        <div class="text-sm text-muted">LOA: Food $${(l.loaFood||0).toFixed(2)} + Accom $${(l.loaAccom||0).toFixed(2)}</div>` : ''}
      </div>`).join('')}` : ''}

    ${lemEqs.length > 0 ? `
    <div class="section-header mt-12"><span class="section-title">Equipment</span></div>
    ${lemEqs.map(e => `<div class="list-item">
      <div class="list-item-left">
        <div class="list-item-title">${escHtml(e.equipmentType)}</div>
        <div class="list-item-sub">S/N: ${escHtml(e.serialNumber || '—')}</div>
      </div>
    </div>`).join('')}` : ''}

    ${lem.notes ? `<div class="form-group mt-12"><label>Notes</label><div class="text-sm">${escHtml(lem.notes)}</div></div>` : ''}

    <button class="btn btn-ghost btn-full mt-12" onclick="closeModal('wo-modal')">Close</button>
  `;
  openModal('wo-modal');
};

// ─── Supervisor LEM Dashboard ─────────────────────────────────────────────────
async function renderLEMDashboard() {
  const container = $('page-lem-dashboard');
  if (!container) return;
  const scroll = container.querySelector('.page-scroll');
  if (!scroll) return;

  const allLEMs = await getAllLEMs();
  const projects = await getProjects(false);
  const users = await getAllUsers();

  // Equipment conflict detection across active LEMs
  const activeStatuses = ['draft','submitted','approved'];
  const activeLEMs = allLEMs.filter(l => activeStatuses.includes(l.status));
  const serialMap = {};
  for (const lem of activeLEMs) {
    const eqs = await window.DR_DB.lemEquipment.where('lemId').equals(lem.id).toArray();
    for (const eq of eqs) {
      if (!eq.serialNumber) continue;
      const key = eq.serialNumber.toUpperCase();
      if (!serialMap[key]) serialMap[key] = [];
      serialMap[key].push({ lemNumber: lem.lemNumber, type: eq.equipmentType, date: lem.date });
    }
  }
  const conflicts = Object.entries(serialMap).filter(([, lems]) => lems.length > 1);

  let html = `<div class="section-header">
    <span class="section-title">LEM Dashboard</span>
    <span class="text-sm text-muted">${allLEMs.length} total LEMs</span>
  </div>`;

  if (conflicts.length > 0) {
    html += `<div class="card mt-8" style="border-color:var(--danger)">
      <div class="card-title" style="color:var(--danger)">⚠️ Equipment Conflicts (${conflicts.length})</div>
      <div class="text-sm text-muted">Same serial number on multiple active LEMs:</div>`;
    conflicts.forEach(([serial, lems]) => {
      html += `<div class="mt-4" style="padding:6px;background:rgba(231,76,60,0.1);border-radius:4px">
        <strong class="text-sm">S/N: ${escHtml(serial)}</strong>
        <span class="text-sm text-muted"> (${escHtml(lems[0].type)})</span>`;
      lems.forEach(l => {
        html += `<div class="text-sm text-muted" style="margin-left:12px">• ${escHtml(l.lemNumber || 'LEM')} — ${l.date}</div>`;
      });
      html += '</div>';
    });
    html += '</div>';
  }

  // Summary cards
  const totals = { draft: 0, submitted: 0, approved: 0, rejected: 0 };
  allLEMs.forEach(l => { if (totals[l.status] !== undefined) totals[l.status]++; });
  html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0">
    <div class="card" style="text-align:center;padding:10px">
      <div style="font-size:1.5rem;font-weight:700;color:var(--gold)">${totals.submitted}</div>
      <div class="text-sm text-muted">Awaiting Approval</div>
    </div>
    <div class="card" style="text-align:center;padding:10px">
      <div style="font-size:1.5rem;font-weight:700;color:var(--success)">${totals.approved}</div>
      <div class="text-sm text-muted">Approved</div>
    </div>
    <div class="card" style="text-align:center;padding:10px">
      <div style="font-size:1.5rem;font-weight:700;color:var(--muted)">${totals.draft}</div>
      <div class="text-sm text-muted">Drafts</div>
    </div>
    <div class="card" style="text-align:center;padding:10px">
      <div style="font-size:1.5rem;font-weight:700;color:var(--danger)">${totals.rejected}</div>
      <div class="text-sm text-muted">Rejected</div>
    </div>
  </div>`;

  // All LEMs with full financial detail
  html += `<div class="section-header mt-8"><span class="section-title">All LEMs — Full Financial View</span></div>`;

  if (!allLEMs.length) {
    html += `<div class="empty-state"><p>No LEMs yet</p></div>`;
  } else {
    for (const lem of allLEMs) {
      const proj = projects.find(p => p.id === lem.projectId);
      const user = users.find(u => u.id === lem.userId);
      const labour = lem.labourItems || [];

      // Calculate financials
      let totalLabourAmt = 0;
      let totalHrs = 0;
      let totalLOA = 0;
      const labourDetails = labour.map(l => {
        const hrs = l.total || 0;
        const rate = l.rate || 0;
        const amt = hrs * rate;
        const loa = (l.loaFood || 0) + (l.loaAccom || 0);
        totalLabourAmt += amt;
        totalHrs += hrs;
        totalLOA += loa;
        return { ...l, amt, loa };
      });

      // Equipment on this LEM
      const lemEqs = await window.DR_DB.lemEquipment.where('lemId').equals(lem.id).toArray();

      html += `<div class="card mt-8" style="border-color:${lem.status === 'submitted' ? 'var(--gold)' : lem.status === 'approved' ? 'var(--success)' : 'var(--border)'}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <div class="card-title" style="margin-bottom:2px">${escHtml(lem.lemNumber || `LEM-${String(lem.id).padStart(4,'0')}`)}</div>
            <div class="text-sm text-muted">${lem.date} • ${escHtml(proj?.name || '—')}</div>
            <div class="text-sm text-muted">Submitted by: ${escHtml(user?.name || '—')}</div>
          </div>
          <span class="status status-${lem.status}">${lem.status}</span>
        </div>

        ${labourDetails.length > 0 ? `
        <div class="divider" style="margin:8px 0"></div>
        <div class="text-sm" style="font-weight:600;margin-bottom:4px">Labour (${totalHrs.toFixed(1)} hrs)</div>
        ${labourDetails.map(l => `
          <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:0.82rem;border-bottom:1px solid var(--border)">
            <div>
              <span>${escHtml(l.name)}</span>
              ${l.title ? `<span class="text-muted" style="margin-left:6px;font-size:0.75rem">${escHtml(l.title)}</span>` : ''}
              <div class="text-muted" style="font-size:0.75rem">
                ${[l.survey ? `${l.survey}h Survey` : '', l.draft ? `${l.draft}h Draft` : '', l.office ? `${l.office}h Office` : '', l.travel ? `${l.travel}h Travel` : ''].filter(Boolean).join(' · ')}
              </div>
            </div>
            <div style="text-align:right">
              <div style="color:var(--gold)">$${l.amt.toFixed(2)}</div>
              <div class="text-muted" style="font-size:0.75rem">@$${(l.rate||0).toFixed(2)}/hr</div>
              ${l.loa > 0 ? `<div style="color:var(--muted);font-size:0.75rem">LOA: $${l.loa.toFixed(2)}</div>` : ''}
            </div>
          </div>`).join('')}
        <div style="display:flex;justify-content:flex-end;padding:6px 0;font-size:0.85rem">
          <strong style="color:var(--gold)">Labour: $${totalLabourAmt.toFixed(2)} + LOA: $${totalLOA.toFixed(2)} = $${(totalLabourAmt + totalLOA).toFixed(2)}</strong>
        </div>` : ''}

        ${lemEqs.length > 0 ? `
        <div class="text-sm text-muted" style="margin-top:4px">Equipment: ${lemEqs.map(e => `${escHtml(e.equipmentType)} (${escHtml(e.serialNumber || 'no S/N')})`).join(', ')}</div>` : ''}

        ${lem.status === 'submitted' ? `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
          <button class="btn btn-danger btn-sm" onclick="rejectLEM(${lem.id})">Reject</button>
          <button class="btn btn-success btn-sm" onclick="approveLEM(${lem.id})">Approve & PDF</button>
        </div>` : ''}
      </div>`;
    }
  }

  scroll.innerHTML = html;
}

// ─── Equipment Page ───────────────────────────────────────────────────────────
async function renderEquipment() {
  const container = $('page-equipment').querySelector('.page-scroll');
  const equipment = await getAllEquipment();
  const users = await getAllUsers();

  let html = `<div class="section-header">
    <span class="section-title">Equipment</span>
    <button class="btn btn-primary btn-sm" onclick="openAddEquipmentModal()">+ Add</button>
  </div>`;

  // Check for equipment conflicts (same serial on multiple active LEMs)
  let conflicts = {};
  if (currentUser.role === 'supervisor') {
    const activeLEMs = await window.DR_DB.lems.where('status').anyOf(['submitted','approved']).toArray();
    const serialMap = {};
    for (const lem of activeLEMs) {
      const lemEqs = await window.DR_DB.lemEquipment.where('lemId').equals(lem.id).toArray();
      for (const leq of lemEqs) {
        if (!leq.serialNumber) continue;
        const key = leq.serialNumber.toUpperCase();
        if (!serialMap[key]) serialMap[key] = [];
        serialMap[key].push({ lemNumber: lem.lemNumber, userId: lem.userId });
      }
    }
    for (const [serial, lems] of Object.entries(serialMap)) {
      if (lems.length > 1) conflicts[serial] = lems;
    }
  }

  if (Object.keys(conflicts).length > 0) {
    html += `<div class="card mt-8" style="border-color:var(--danger)">
      <div class="card-title" style="color:var(--danger)">⚠️ Equipment Conflicts Detected</div>`;
    for (const [serial, lems] of Object.entries(conflicts)) {
      html += `<div class="text-sm mt-4"><strong>S/N: ${escHtml(serial)}</strong> appears on multiple active LEMs:</div>`;
      lems.forEach(l => { html += `<div class="text-sm text-muted" style="margin-left:12px">• ${escHtml(l.lemNumber || 'LEM')}</div>`; });
    }
    html += '</div>';
  }

  if (!equipment.length) {
    html += `<div class="empty-state">${svgWrench()}<p>No equipment listed</p></div>`;
  } else {
    equipment.forEach(eq => {
      const assignedUser = users.find(u => u.id === eq.assignedTo);
      const statusColor = eq.status === 'available' ? 'var(--success)' : eq.status === 'in-use' ? 'var(--gold)' : 'var(--danger)';

      html += `<div class="card mt-8">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <div class="card-title" style="margin-bottom:2px">${escHtml(eq.name)}</div>
            ${eq.serialNumber ? `<div class="text-sm text-muted">S/N: ${escHtml(eq.serialNumber)}</div>` : ''}
            <div class="text-sm" style="color:${statusColor};margin-top:2px">${eq.status}</div>
            ${assignedUser ? `<div class="text-sm" style="color:var(--gold);margin-top:2px">Assigned to: ${escHtml(assignedUser.name)}</div>` : ''}
            ${eq.serviceNote ? `<div class="text-sm" style="color:var(--warning);margin-top:4px">⚠️ Service: ${escHtml(eq.serviceNote)}</div>` : ''}
            ${eq.replacementRequired ? `<div class="text-sm" style="color:var(--danger)">🔴 Replacement Required</div>` : ''}
          </div>
          <div style="display:flex;flex-direction:column;gap:6px">
            <button class="btn btn-sm btn-outline" onclick="openServiceModal(${eq.id}, '${escHtml(eq.name)}')">🔧 Service</button>
          </div>
        </div>
        ${currentUser.role === 'supervisor' ? `
        <div style="display:flex;gap:6px;margin-top:8px">
          <button class="btn btn-sm btn-ghost" onclick="assignEquipment(${eq.id})">Assign</button>
          <button class="btn btn-sm btn-ghost" onclick="unassignEquipment(${eq.id})">Unassign</button>
          <button class="btn btn-sm btn-danger" onclick="deactivateEquipment(${eq.id})">Remove</button>
        </div>` : ''}
      </div>`;
    });
  }

  container.innerHTML = html;
}

window.openAddEquipmentModal = () => {
  const modal = $('equipment-modal-sheet');
  modal.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-title">Add Equipment to Fleet</div>
    <div class="form-group">
      <label>Equipment Type</label>
      <select id="eq-type" onchange="onAddEqTypeChange(this)">
        <option value="">Select type...</option>
        ${EQUIPMENT_TYPES.map(t => `<option value="${escHtml(t)}">${escHtml(t)}</option>`).join('')}
      </select>
    </div>
    <div id="eq-serial-wrap" style="display:none">
      <div class="form-group">
        <label style="color:var(--danger)">Serial Number (required)</label>
        <input type="text" id="eq-serial" placeholder="Enter serial number...">
      </div>
    </div>
    <div class="form-group"><label>Notes (optional)</label><input type="text" id="eq-notes" placeholder="Any notes about this unit"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px">
      <button class="btn btn-ghost" onclick="closeModal('equipment-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="saveEquipment()">Add</button>
    </div>
  `;
  openModal('equipment-modal');
};

window.onAddEqTypeChange = (sel) => {
  $('eq-serial-wrap').style.display = sel.value ? 'block' : 'none';
  if (sel.value) $('eq-serial').focus();
};

window.saveEquipment = async () => {
  const type = $('eq-type')?.value || '';
  const serial = $('eq-serial')?.value?.trim() || '';
  if (!type) { toast('Select an equipment type', 'error'); return; }
  if (!serial) { toast('Serial number is required', 'error'); return; }
  const notes = $('eq-notes')?.value?.trim() || '';
  await window.DR_DB.equipment.add({
    name: type + (serial ? ` (${serial})` : ''),
    type,
    serialNumber: serial,
    status: 'available', active: true, assignedTo: null,
    serviceNote: notes || null, replacementRequired: false
  });
  closeModal('equipment-modal');
  toast('Equipment added to fleet', 'success');
  renderEquipment();
};

window.openServiceModal = (id, name) => {
  const modal = $('equipment-modal-sheet');
  modal.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-title">Service Request — ${escHtml(name)}</div>
    <div class="form-group"><label>Problem Description</label><textarea id="svc-note" placeholder="Describe the issue..."></textarea></div>
    <div class="toggle-row" style="margin-top:8px">
      <span class="toggle-label" style="color:var(--danger)">Replacement Required?</span>
      <button class="toggle" id="svc-replace" onclick="toggleBtn(this, null)"></button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px">
      <button class="btn btn-ghost" onclick="closeModal('equipment-modal')">Cancel</button>
      <button class="btn btn-danger" onclick="submitServiceRequest(${id})">Submit Request</button>
    </div>
  `;
  openModal('equipment-modal');
};

window.submitServiceRequest = async (id) => {
  const note = $('svc-note').value.trim();
  if (!note) { toast('Please describe the issue', 'error'); return; }
  const replacementRequired = $('svc-replace').classList.contains('on');
  await window.DR_DB.equipment.update(id, { serviceNote: note, replacementRequired, status: 'service' });

  // Alert supervisors
  const eq = await window.DR_DB.equipment.get(id);
  const supervisors = await window.DR_DB.users.where('role').equals('supervisor').toArray();
  for (const sup of supervisors) {
    await window.DR_DB.notifications.add({
      toUserId: sup.id, fromUserId: currentUser.id,
      message: `⚠️ Service required for ${eq.name}: ${note}${replacementRequired ? ' — REPLACEMENT REQUIRED' : ''}`,
      scheduledAt: new Date().toISOString(), read: false, type: 'service_alert'
    });
  }

  closeModal('equipment-modal');
  toast('Service request submitted — supervisors notified', 'success');
  renderEquipment();
};

window.assignEquipment = async (id) => {
  const users = await getAllUsers();
  const modal = $('equipment-modal-sheet');
  modal.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-title">Assign Equipment</div>
    <div class="form-group">
      <label>Assign To</label>
      <select id="assign-user">
        ${users.map(u => `<option value="${u.id}">${escHtml(u.name)}</option>`).join('')}
      </select>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px">
      <button class="btn btn-ghost" onclick="closeModal('equipment-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="doAssignEquipment(${id})">Assign</button>
    </div>
  `;
  openModal('equipment-modal');
};

window.doAssignEquipment = async (id) => {
  const userId = parseInt($('assign-user').value);
  await window.DR_DB.equipment.update(id, { assignedTo: userId, status: 'in-use' });
  await window.DR_DB.equipmentAssignments.add({ equipmentId: id, userId, assignedAt: new Date().toISOString(), returnedAt: null });
  closeModal('equipment-modal');
  toast('Equipment assigned', 'success');
  renderEquipment();
};

window.unassignEquipment = async (id) => {
  const assignment = await window.DR_DB.equipmentAssignments.where('equipmentId').equals(id).filter(a => !a.returnedAt).last();
  if (assignment) await window.DR_DB.equipmentAssignments.update(assignment.id, { returnedAt: new Date().toISOString() });
  await window.DR_DB.equipment.update(id, { assignedTo: null, status: 'available' });
  toast('Equipment unassigned', 'success');
  renderEquipment();
};

window.deactivateEquipment = async (id) => {
  if (!confirm('Remove this equipment?')) return;
  await window.DR_DB.equipment.update(id, { active: false });
  toast('Equipment removed', 'info');
  renderEquipment();
};

// ─── Vehicle Walkaround ───────────────────────────────────────────────────────
const WALKAROUND_ITEMS = [
  'Headlights / taillights functioning',
  'Brake lights functioning',
  'Turn signals / hazard lights functioning',
  'Windshield — no cracks or obstructions',
  'Windshield wipers functioning',
  'All mirrors in place and adjusted',
  'Tires — adequate pressure and tread depth',
  'No visible body damage (new)',
  'Engine oil level OK',
  'Coolant level OK',
  'Windshield washer fluid OK',
  'Brakes — no unusual noises or pulling',
  'Horn functioning',
  'Seatbelts functioning for all seats',
  'Fire extinguisher present and charged',
  'First aid kit present and stocked',
  'Emergency safety vest / cones present',
  'No fluid leaks under vehicle'
];

async function renderWalkaround() {
  const container = $('page-walkaround').querySelector('.page-scroll');
  const vehicles = await window.DR_DB.vehicles.where('active').equals(1).toArray();
  const recent = await window.DR_DB.walkarounds
    .where('userId').equals(currentUser.id)
    .reverse().limit(10).sortBy('date');

  let html = `<div class="section-header">
    <span class="section-title">Vehicle Walkaround</span>
  </div>`;

  if (!vehicles.length) {
    html += `<div class="card"><div class="card-title text-muted">No vehicles configured</div></div>`;
  } else {
    html += `<div class="form-group">
      <label>Vehicle</label>
      <select id="wa-vehicle">
        ${vehicles.map(v => `<option value="${v.id}">${escHtml(v.name)}${v.plate ? ` — ${v.plate}` : ''}</option>`).join('')}
      </select>
    </div>
    <div class="card mt-8">
      <div class="card-title">Today's Inspection Checklist</div>
      <div id="wa-checklist">
        ${WALKAROUND_ITEMS.map((item, i) => `
          <div class="toggle-row">
            <span class="toggle-label">${item}</span>
            <button class="toggle" id="wa-item-${i}" onclick="toggleBtn(this, null)"></button>
          </div>`).join('')}
      </div>
    </div>
    <div class="form-group mt-12">
      <label>Issues / Notes</label>
      <textarea id="wa-notes" placeholder="Describe any issues found..."></textarea>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px">
      <button class="btn btn-outline" onclick="submitWalkaround('pass')">✅ All Good — Submit</button>
      <button class="btn btn-danger" onclick="submitWalkaround('issue')">⚠️ Issues Found</button>
    </div>`;
  }

  if (recent.length) {
    html += `<div class="section-header mt-16"><span class="section-title">Recent Checks</span></div>`;
    recent.forEach(w => {
      const icon = w.status === 'pass' ? '✅' : '⚠️';
      html += `<div class="list-item">
        <div class="list-item-left">
          <div class="list-item-title">${icon} ${w.date}</div>
          <div class="list-item-sub">${w.notes || 'No issues noted'}</div>
        </div>
        <span class="status status-${w.status === 'pass' ? 'approved' : 'rejected'}">${w.status}</span>
      </div>`;
    });
  }

  container.innerHTML = html;
}

window.submitWalkaround = async (status) => {
  const vehicleId = parseInt($('wa-vehicle')?.value);
  if (!vehicleId) { toast('Select a vehicle', 'error'); return; }

  const checklist = WALKAROUND_ITEMS.map((item, i) => ({
    item,
    checked: document.getElementById(`wa-item-${i}`)?.classList.contains('on') || false
  }));
  const failedItems = checklist.filter(c => !c.checked).map(c => c.item);
  const notes = $('wa-notes')?.value || '';

  const walkaround = {
    vehicleId, userId: currentUser.id,
    date: new Date().toISOString().slice(0, 10),
    status, checklist, issues: failedItems,
    notes, syncStatus: 'pending',
    createdAt: new Date().toISOString()
  };

  await window.DR_DB.walkarounds.add(walkaround);

  // If issues or status='issue', notify supervisors
  if (status === 'issue' || failedItems.length > 0 || notes.trim()) {
    const supervisors = await window.DR_DB.users.where('role').equals('supervisor').toArray();
    const vehicle = await window.DR_DB.vehicles.get(vehicleId);
    for (const sup of supervisors) {
      await window.DR_DB.notifications.add({
        toUserId: sup.id, fromUserId: currentUser.id,
        message: `🚛 Vehicle issue reported by ${currentUser.name} — ${vehicle?.name || 'Vehicle'}: ${notes || failedItems.slice(0,2).join(', ')}`,
        scheduledAt: new Date().toISOString(), read: false, type: 'vehicle_alert'
      });
    }
    toast('Issues reported — supervisors notified', 'success');
  } else {
    toast('Walkaround completed — all clear!', 'success');
  }

  navigate('walkaround');
};

// ─── Employee Profile Page ────────────────────────────────────────────────────
async function renderEmployeeProfile() {
  const container = $('page-employee-profile').querySelector('.page-scroll');
  if (!viewingEmployeeId) {
    container.innerHTML = `<div class="empty-state"><p>No employee selected</p></div>`;
    return;
  }

  const user = await getUser(viewingEmployeeId);
  if (!user) {
    container.innerHTML = `<div class="empty-state"><p>Employee not found</p></div>`;
    return;
  }

  const lems = await window.DR_DB.lems.where('userId').equals(viewingEmployeeId).reverse().sortBy('date');
  const assignedEquipment = await window.DR_DB.equipment.where('assignedTo').equals(viewingEmployeeId).toArray();
  const projects = await getProjects(false);

  let html = `
    <div class="section-header">
      <button class="btn btn-ghost btn-sm" onclick="navigate('staff')">← Back</button>
      <span class="section-title">${escHtml(user.name)}</span>
    </div>
    <div class="card">
      <div class="card-title">${escHtml(user.name)}</div>
      <div class="text-sm text-muted">${user.role} • ${user.email || '—'}</div>
      ${user.hourlyRate ? `<div class="text-sm text-muted">Rate: $${user.hourlyRate}/hr</div>` : ''}
      ${user.province ? `<div class="text-sm text-muted">Province: ${user.province}</div>` : ''}
    </div>`;

  // Assigned equipment
  html += `<div class="section-header mt-12"><span class="section-title">Assigned Equipment (${assignedEquipment.length})</span></div>`;
  if (!assignedEquipment.length) {
    html += `<div class="empty-state" style="padding:12px 0"><p style="font-size:0.9rem">No equipment assigned</p></div>`;
  } else {
    assignedEquipment.forEach(eq => {
      html += `<div class="list-item">
        <div class="list-item-left">
          <div class="list-item-title">${escHtml(eq.name)}</div>
          <div class="list-item-sub">S/N: ${escHtml(eq.serialNumber || '—')} • 🔋 ${eq.batteryStatus !== null ? eq.batteryStatus + '%' : '—'}</div>
        </div>
      </div>`;
    });
  }

  // Past LEMs
  html += `<div class="section-header mt-12"><span class="section-title">Past LEMs (${lems.length})</span></div>`;
  if (!lems.length) {
    html += `<div class="empty-state" style="padding:12px 0"><p style="font-size:0.9rem">No LEMs submitted yet</p></div>`;
  } else {
    lems.forEach(lem => {
      const proj = projects.find(p => p.id === lem.projectId);
      html += `<div class="list-item">
        <div class="list-item-left">
          <div class="list-item-title">${escHtml(lem.lemNumber || `LEM-${String(lem.id).padStart(4,'0')}`)}</div>
          <div class="list-item-sub">${lem.date} • ${escHtml(proj?.name || '—')}</div>
        </div>
        <span class="status status-${lem.status}">${lem.status}</span>
      </div>`;
    });
  }

  container.innerHTML = html;
}

window.viewEmployeeProfile = (userId) => {
  viewingEmployeeId = userId;
  navigate('employee-profile');
};

// ─── Approvals (Supervisor) ───────────────────────────────────────────────────
async function renderApprovals() {
  const container = $('page-approvals').querySelector('.page-scroll');
  const pending = await getPendingLEMs();

  let html = `<div class="section-header"><span class="section-title">Pending LEM Approvals</span></div>`;

  if (!pending.length) {
    html += `<div class="empty-state">${svgCheck()}<p>All caught up! No pending LEMs.</p></div>`;
  } else {
    const projects = await getProjects(false);
    for (const lem of pending) {
      const user = await getUser(lem.userId);
      const proj = projects.find(p => p.id === lem.projectId);
      const labour = lem.labourItems || [];
      const totalHrs = labour.reduce((s, l) => s + (l.total || 0), 0);

      html += `<div class="card">
        <div class="card-title">${escHtml(lem.lemNumber || `LEM-${String(lem.id).padStart(4,'0')}`)}</div>
        <div class="text-sm text-muted">Field Staff: <strong style="color:var(--text)">${escHtml(user?.name || '—')}</strong></div>
        <div class="text-sm text-muted">Project: <strong style="color:var(--text)">${escHtml(proj?.name || '—')}</strong></div>
        <div class="text-sm text-muted">Date: ${lem.date}</div>
        <div class="text-sm text-muted mt-8">Labour: ${labour.length} person(s) • ${totalHrs.toFixed(1)} total hours</div>
        ${lem.instruments?.length ? `<div class="text-sm text-muted">Instruments: ${lem.instruments.map(i => i.name).join(', ')}</div>` : ''}
        <div class="divider"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <button class="btn btn-danger btn-sm" onclick="rejectLEM(${lem.id})">Reject</button>
          <button class="btn btn-success btn-sm" onclick="approveLEM(${lem.id})">Approve & PDF</button>
        </div>
      </div>`;
    }
  }
  container.innerHTML = html;
}

window.approveLEM = async (lemId) => {
  const lem = await window.DR_DB.lems.get(lemId);
  if (!lem) return;

  await window.DR_DB.lems.update(lemId, {
    status: 'approved', supervisorId: currentUser.id,
    approvedAt: new Date().toISOString()
  });

  const projects = await getProjects(false);
  const proj = projects.find(p => p.id === lem.projectId);
  const user = await getUser(lem.userId);

  const pdfDoc = await generateLEMPDF(lem, proj, user, currentUser);

  try { await uploadTimesheetPDF(pdfDoc, lem, proj?.name || 'Project', user?.name || 'Staff'); } catch(e) {}

  await window.DR_DB.notifications.add({
    toUserId: lem.userId, fromUserId: currentUser.id,
    message: `Your LEM ${lem.lemNumber} was approved`,
    scheduledAt: new Date().toISOString(), read: false, type: 'approval'
  });

  if (proj?.clientEmail) {
    const emailIt = confirm(`Email LEM to ${proj.clientName} (${proj.clientEmail})?`);
    if (emailIt) {
      try {
        const b64 = pdfToBase64(pdfDoc);
        await sendEmail({
          to: proj.clientEmail,
          subject: `LEM ${lem.lemNumber} — ${proj.name} — ${lem.date}`,
          body: `<p>Please find attached the approved LEM for <strong>${proj.name}</strong> dated ${lem.date}.</p><p>Regards,<br>${currentUser.name}<br>Keltic Geomatics</p>`,
          attachments: [{ name: `LEM_${lem.lemNumber}.pdf`, contentType: 'application/pdf', contentBytes: b64 }]
        });
        toast('Email sent to client', 'success');
      } catch(e) {}
    }
  }

  toast('LEM approved!', 'success');
  renderApprovals();
};

window.rejectLEM = async (lemId) => {
  const reason = prompt('Reason for rejection (optional):') || '';
  await window.DR_DB.lems.update(lemId, { status: 'rejected' });
  const lem = await window.DR_DB.lems.get(lemId);
  await window.DR_DB.notifications.add({
    toUserId: lem.userId, fromUserId: currentUser.id,
    message: `LEM ${lem.lemNumber} was rejected. ${reason}`,
    scheduledAt: new Date().toISOString(), read: false, type: 'rejection'
  });
  toast('LEM rejected', 'error');
  renderApprovals();
};

// ─── Projects ─────────────────────────────────────────────────────────────────
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
          <div class="list-item-sub">${escHtml(p.projectNumber ? `#${p.projectNumber} • ` : '')}${escHtml(p.clientName || '—')} • <span class="status status-${p.status}">${p.status}</span></div>
        </div>
        <button class="btn btn-sm btn-ghost" onclick="editProject(${p.id})">Edit</button>
      </div>`;
    });
  }

  container.innerHTML = html;
}

window.openNewProjectModal = async () => {
  const autoNum = await generateProjectNumber();
  // Peek but don't commit yet — will commit on save
  const yy = String(new Date().getFullYear()).slice(2);
  const counterKey = `projectCounter_${yy}`;
  const current = await window.DR_DB.settings.get(counterKey);
  // Decrement back — generateProjectNumber already incremented, we'll re-increment on save
  if (current) await window.DR_DB.settings.put({ key: counterKey, value: current.value - 1 });

  const modal = $('project-modal-sheet');
  modal.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-title">New Project</div>
    <div class="form-group"><label>Project Name</label><input type="text" id="proj-name" placeholder="e.g. Highway 40 Survey"></div>
    <div class="form-group">
      <label>Project Number <span style="color:var(--muted);font-size:0.75rem">(auto-generated, can override)</span></label>
      <input type="text" id="proj-number" value="${escHtml(autoNum)}" placeholder="e.g. 260001">
    </div>
    <div class="form-group"><label>Client Name</label><input type="text" id="proj-client" placeholder="Client company name"></div>
    <div class="form-group"><label>Client Email</label><input type="email" id="proj-email" placeholder="client@company.com"></div>
    <div class="form-group"><label>Billable Travel Rate ($/km)</label><input type="number" id="proj-travel-rate" min="0" step="0.01" value="0"></div>
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
  // If user kept auto-number, regenerate to claim it; otherwise use their override
  const projNumber = $('proj-number').value.trim() || await generateProjectNumber();
  await createProject({
    name,
    projectNumber: projNumber,
    clientName: $('proj-client').value.trim(),
    clientEmail: $('proj-email').value.trim(),
    travelRate: parseFloat($('proj-travel-rate').value) || 0,
    loaRate: parseFloat($('proj-loa-rate').value) || 0,
    createdBy: currentUser.id
  });
  closeModal('project-modal');
  toast(`Project created — #${projNumber}`, 'success');
  renderProjects();
};

window.editProject = (id) => { toast('Edit project coming soon', 'info'); };

// ─── Safety ───────────────────────────────────────────────────────────────────
async function renderSafetyPage() {
  const container = $('page-safety').querySelector('.page-scroll');
  const forms = await window.DR_DB.safetyForms.where('userId').equals(currentUser.id).reverse().sortBy('date');

  let html = `<div class="section-header"><span class="section-title">Safety Forms</span></div>
  <div class="grid-2 mt-8">
    <button class="btn btn-primary" onclick="openSafetyForm('fitforwork')">✅ Fit for Work</button>
    <button class="btn btn-outline" onclick="openSafetyForm('flha')">📋 FLHA</button>
    <button class="btn btn-ghost" onclick="openSafetyForm('jha')">🔍 JHA</button>
    <button class="btn btn-ghost" onclick="openSafetyForm('hazard')">⚠️ Hazard Report</button>
  </div>
  <div class="section-header mt-16"><span class="section-title">Recent Forms</span></div>`;

  if (!forms.length) {
    html += `<div class="empty-state">${svgShield()}<p>No safety forms yet</p></div>`;
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

// ─── FLHA Hazard Categories (48 total) ───────────────────────────────────────
const FLHA_CATEGORIES = [
  {
    title: 'Environmental',
    color: '#2ecc71',
    items: [
      '1. Extreme heat / sun exposure',
      '2. Extreme cold / wind chill',
      '3. Rain / wet / slippery conditions',
      '4. Lightning / electrical storm',
      '5. High winds / gusts',
      '6. Poor visibility / fog / dust',
      '7. Icy / frozen surfaces',
      '8. Wildlife / animal hazards',
      '9. Insects / vector-borne hazards',
      '10. Terrain hazards (slopes, ditches, soft ground)',
      '11. Flooding / standing water / spring thaw'
    ]
  },
  {
    title: 'Ergonomic',
    color: '#3498db',
    items: [
      '12. Awkward posture / body positioning',
      '13. Manual material handling',
      '14. Heavy lifting / lowering',
      '15. Repetitive motion / strain',
      '16. Prolonged standing / walking on uneven ground',
      '17. Hand-arm vibration (equipment use)',
      '18. Fatigue / physical exertion'
    ]
  },
  {
    title: 'Access / Egress',
    color: '#e67e22',
    items: [
      '19. Uneven / unstable ground surface',
      '20. Working at elevation (banks, embankments)',
      '21. Confined / restricted space',
      '22. Trenches / excavations nearby',
      '23. Unimproved / off-road access',
      '24. Entering / exiting vehicles or equipment',
      '25. Slip, trip and fall hazards (debris, cables, stakes)'
    ]
  },
  {
    title: 'Overhead',
    color: '#9b59b6',
    items: [
      '26. Overhead power lines (within 7m)',
      '27. Falling objects / tools from above',
      '28. Suspended loads / rigging overhead',
      '29. Low clearance structures / bridges',
      '30. Unstable overhead tree branches / widowmakers',
      '31. Low-flying aircraft / helicopter operations',
      '32. Birds / nests / wasp nests overhead'
    ]
  },
  {
    title: 'Rigging & Hoisting',
    color: '#e74c3c',
    items: [
      '33. Improper rigging / incorrect sling angle',
      '34. Load swinging / unexpected movement',
      '35. Equipment overload / capacity exceeded',
      '36. Ground instability under crane / equipment',
      '37. Communication failure during lift',
      '38. Tag line control / load management'
    ]
  },
  {
    title: 'Electrical',
    color: '#f39c12',
    items: [
      '39. Buried / underground utilities (gas, power, telecom)',
      '40. Overhead conductors / energized lines',
      '41. Ground fault / stray current / current leakage',
      '42. Equipment power failure or malfunction',
      '43. Temporary power sources / generators',
      '44. Electromagnetic interference (GPS, radio equipment)'
    ]
  },
  {
    title: 'Personal Limitations',
    color: '#1abc9c',
    items: [
      '45. Fatigue / insufficient rest (< 8 hours)',
      '46. Physical impairment / existing injury',
      '47. Medication effects / substance impairment',
      '48. Lack of training / unfamiliarity with task'
    ]
  }
];

window.openSafetyForm = (type) => {
  const modal = $('safety-modal-sheet');
  const titles = { fitforwork: 'Fit for Work Assessment', flha: 'Field Level Hazard Assessment (FLHA)', jha: 'Job Hazard Analysis', hazard: 'Hazard Report' };

  let formHtml = `<div class="modal-handle"></div>
    <div class="modal-title">${titles[type] || type.toUpperCase()}</div>
    <div class="form-group"><label>Date</label><input type="date" id="sf-date" value="${new Date().toISOString().slice(0,10)}"></div>`;

  if (type === 'fitforwork') {
    formHtml += `<div class="card">${['Well rested (6+ hours sleep)', 'No alcohol / drug impairment', 'Physically capable today', 'Mentally fit and focused', 'Wearing required PPE', "Aware of today's hazards"].map(q =>
      `<div class="toggle-row"><span class="toggle-label">${q}</span><button class="toggle" onclick="toggleBtn(this,null)"></button></div>`
    ).join('')}</div>
    <div class="form-group"><label>Any concerns?</label><textarea id="sf-notes" placeholder="Optional notes..."></textarea></div>`;
  }

  if (type === 'flha') {
    // Full Keltic FLHA form
    formHtml += `
    <div class="form-group"><label>Company</label><input type="text" id="sf-company" value="Keltic Geomatics" placeholder="Company name"></div>
    <div class="form-group"><label>Work Description</label><input type="text" id="sf-task" placeholder="Describe the scope of work"></div>
    <div class="form-group"><label>Task Location / Site</label><input type="text" id="sf-location" placeholder="Site address or description"></div>
    <div class="form-group"><label>Muster Point</label><input type="text" id="sf-muster" placeholder="Emergency assembly point"></div>
    <div class="form-group"><label>PPE Inspected?</label>
      <select id="sf-ppe"><option value="yes">Yes — all PPE inspected and serviceable</option><option value="partial">Partial — some items missing</option><option value="no">No — PPE not inspected</option></select>
    </div>

    <div style="margin:12px 0;font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text)">
      ⚠️ STOP &amp; THINK — Hazard Identification (check all that apply)
    </div>

    ${FLHA_CATEGORIES.map(cat => `
      <div style="margin-bottom:8px">
        <div style="background:${cat.color};color:#fff;padding:6px 10px;border-radius:4px;font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">
          ${cat.title}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px">
          ${cat.items.map((item, i) => `
            <label style="display:flex;align-items:flex-start;gap:6px;font-size:0.78rem;text-transform:none;letter-spacing:0;padding:4px 6px;cursor:pointer;border-radius:4px">
              <input type="checkbox" class="flha-haz" data-cat="${escHtml(cat.title)}" data-item="${escHtml(item)}" style="margin-top:2px;flex-shrink:0">
              <span>${escHtml(item)}</span>
            </label>`).join('')}
        </div>
      </div>`).join('')}

    <div style="margin-top:12px;font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text)">Tasks / Hazards / Controls</div>
    <div id="sf-task-rows"></div>
    <button class="btn btn-sm btn-outline mt-4" onclick="addFLHATaskRow()">+ Add Task Row</button>

    <div class="form-group mt-12"><label>Additional Notes / Controls</label>
      <textarea id="sf-controls" placeholder="Additional hazard controls, emergency procedures..." rows="3"></textarea>
    </div>

    <div style="margin-top:12px;font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text)">Crew — Print Name &amp; Sign</div>
    <div id="sf-crew-rows"></div>
    <button class="btn btn-sm btn-outline mt-4" onclick="addFLHACrewRow()">+ Add Crew Member</button>

    <div style="margin-top:12px;font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text)">Job Completion</div>
    <div class="card mt-4">
      ${['All tools and equipment accounted for','Site left clean — no debris or hazards remaining','PPE removed and stored properly','Crew members returned safe','Supervisor notified of completion'].map(item =>
        `<div class="toggle-row"><span class="toggle-label" style="font-size:0.85rem">${item}</span><button class="toggle" onclick="toggleBtn(this,null)"></button></div>`
      ).join('')}
    </div>`;
  }

  if (type === 'jha') {
    formHtml += `<div class="form-group"><label>Task Description</label><input type="text" id="sf-task" placeholder="Describe the work being performed"></div>
      <div class="form-group"><label>Controls / Mitigations</label><textarea id="sf-controls" placeholder="How are hazards being controlled?"></textarea></div>
      <div class="form-group"><label>Emergency Assembly Point</label><input type="text" id="sf-assembly"></div>`;
  }

  if (type === 'hazard') {
    formHtml += `<div class="form-group"><label>Hazard Description</label><textarea id="sf-hazard-desc" placeholder="Describe the hazard..."></textarea></div>
      <div class="form-group"><label>Severity</label><select id="sf-severity">
        <option value="low">Low — Minor, no injury expected</option>
        <option value="medium">Medium — Possible injury</option>
        <option value="high">High — Likely injury</option>
        <option value="critical">Critical — Life threatening</option>
      </select></div>
      <div class="form-group"><label>Immediate Action Taken</label><textarea id="sf-action" placeholder="What did you do?"></textarea></div>`;
  }

  formHtml += `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:16px">
    <button class="btn btn-ghost" onclick="closeModal('safety-modal')">Cancel</button>
    ${type === 'flha' ? `<button class="btn btn-outline" onclick="printFLHA()">🖨️ Print / PDF</button>` : '<div></div>'}
    <button class="btn btn-success" onclick="submitSafetyForm('${type}')">Submit</button>
  </div>`;

  modal.innerHTML = formHtml;

  if (type === 'flha') {
    addFLHATaskRow();
    addFLHACrewRow();
  }

  openModal('safety-modal');
};

window.addFLHATaskRow = () => {
  const container = $('sf-task-rows');
  if (!container) return;
  const row = el('div', 'card mt-4');
  row.style.padding = '8px';
  row.innerHTML = `
    <div style="display:grid;grid-template-columns:2fr 2fr 1fr 2fr;gap:6px;align-items:start">
      <div class="form-group" style="margin:0"><label style="font-size:0.7rem">Task Step</label><input type="text" class="ft-task" placeholder="Task step"></div>
      <div class="form-group" style="margin:0"><label style="font-size:0.7rem">Hazard</label><input type="text" class="ft-hazard" placeholder="Hazard identified"></div>
      <div class="form-group" style="margin:0"><label style="font-size:0.7rem">Priority</label>
        <select class="ft-priority">
          <option value="L">L</option><option value="M">M</option><option value="H">H</option>
        </select>
      </div>
      <div class="form-group" style="margin:0"><label style="font-size:0.7rem">Control Measure</label><input type="text" class="ft-control" placeholder="Control / mitigation"></div>
    </div>
    <button onclick="this.closest('.card').remove()" class="btn btn-danger btn-sm" style="margin-top:6px">Remove</button>
  `;
  container.appendChild(row);
};

window.addFLHACrewRow = () => {
  const container = $('sf-crew-rows');
  if (!container) return;
  const row = el('div', 'consumable-row mt-4');
  row.innerHTML = `
    <input type="text" class="crew-name" placeholder="Print name" style="flex:1.5">
    <input type="text" class="crew-role" placeholder="Role / title" style="flex:1">
    <button onclick="this.parentElement.remove()" style="background:var(--danger);color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:1rem;padding:0 8px">×</button>
  `;
  container.appendChild(row);
};

window.printFLHA = async () => {
  // Gather form data and call PDF generator
  try {
    const { generateFLHAPDF } = await import('./pdf.js');
    const hazards = [];
    document.querySelectorAll('.flha-haz:checked').forEach(cb => {
      hazards.push({ category: cb.dataset.cat, item: cb.dataset.item });
    });
    const taskRows = [];
    document.querySelectorAll('#sf-task-rows .card').forEach(row => {
      taskRows.push({
        task: row.querySelector('.ft-task')?.value || '',
        hazard: row.querySelector('.ft-hazard')?.value || '',
        priority: row.querySelector('.ft-priority')?.value || 'L',
        control: row.querySelector('.ft-control')?.value || ''
      });
    });
    const crewRows = [];
    document.querySelectorAll('#sf-crew-rows .consumable-row').forEach(row => {
      crewRows.push({ name: row.querySelector('.crew-name')?.value || '', role: row.querySelector('.crew-role')?.value || '' });
    });
    const formData = {
      date: $('sf-date')?.value || new Date().toISOString().slice(0,10),
      company: $('sf-