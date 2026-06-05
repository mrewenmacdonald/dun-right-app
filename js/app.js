// DÙN RIGHT — Main application logic
import { login, getAllUsers, getUser, getProjects, createProject, generateProjectNumber,
         createLEM, getLEMsByUser, getAllLEMs, getPendingLEMs, getAllEquipment,
         getNotifications, markRead, getSetting, setSetting,
         createPO, getPOsByUser, getAllPOs, getPOsByProject,
         createMileageLog, getMileageByUser, getAllMileage, getMileageByProject } from './db.js';
import { generateLEMPDF, generateInvoicePDF, generatePOPDF, generateSIMOPSPDF, generateEnvironmentalPDF } from './pdf.js';
import { setAccessToken, uploadTimesheetPDF, uploadInvoicePDF,
         uploadReceiptPhoto, uploadSitePhoto, uploadSafetyForm,
         sendEmail, pdfToBase64,
         handleMSAuthCallback, loadMSToken, initiateMSLogin, isMSConnected, disconnectMS } from './sync.js';

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
  if (page === 'admin')            renderAdmin();
  if (page === 'pos')              renderPurchaseOrders();
  if (page === 'mileage')          renderMileage();
  if (page === 'payroll')          renderPayroll();
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
    { page: 'walkaround',    icon: svgTruck(),    label: 'Walkaround' },
    { page: 'admin',         icon: svgGear(),     label: 'Admin' }
  ];

  const bottomItems = currentUser.role === 'supervisor'
    ? [fieldItems[0], fieldItems[1], supervisorExtra[0], supervisorExtra[7], { page: 'more', icon: svgGrid(), label: 'More' }]
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
  if (currentUser.role === 'supervisor') {
    await renderSupervisorHome();
  } else {
    await renderFieldHome();
  }
}

// ─── Supervisor Home ───────────────────────────────────────────────────────────
async function renderSupervisorHome() {
  const container = $('page-home').querySelector('.page-scroll');
  const allLems   = await window.DR_DB.lems.toArray();
  const submitted = allLems.filter(l => l.status === 'submitted');
  const drafts    = allLems.filter(l => l.status === 'draft');
  const approved  = allLems.filter(l => l.status === 'approved');
  const projects  = await getProjects(true);
  const allUsers  = await getAllUsers();
  const fieldStaff = allUsers.filter(u => u.role === 'field');
  const notifs    = await getNotifications(currentUser.id);
  const unread    = notifs.filter(n => !n.read);

  let html = `
    <div class="section-header">
      <span class="section-title">Good ${greeting()}, ${escHtml(currentUser.name.split(' ')[0])}</span>
    </div>

    <!-- KPI Strip -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px">
      <div class="card" style="text-align:center;padding:10px;border-color:var(--gold);cursor:pointer" onclick="navigate('approvals')">
        <div style="font-size:1.6rem;font-weight:800;color:var(--gold)">${submitted.length}</div>
        <div style="font-size:0.65rem;text-transform:uppercase;color:var(--text-muted)">Pending</div>
      </div>
      <div class="card" style="text-align:center;padding:10px;cursor:pointer" onclick="navigate('approvals')">
        <div style="font-size:1.6rem;font-weight:800;color:var(--text-muted)">${drafts.length}</div>
        <div style="font-size:0.65rem;text-transform:uppercase;color:var(--text-muted)">Drafts</div>
      </div>
      <div class="card" style="text-align:center;padding:10px;cursor:pointer" onclick="navigate('projects')">
        <div style="font-size:1.6rem;font-weight:800;color:var(--success)">${projects.length}</div>
        <div style="font-size:0.65rem;text-transform:uppercase;color:var(--text-muted)">Projects</div>
      </div>
      <div class="card" style="text-align:center;padding:10px;cursor:pointer" onclick="navigate('approvals')">
        <div style="font-size:1.6rem;font-weight:800">${approved.length}</div>
        <div style="font-size:0.65rem;text-transform:uppercase;color:var(--text-muted)">Approved</div>
      </div>
    </div>`;

  // Unread notifications
  if (unread.length) {
    html += `<div class="card" style="border-color:var(--warning);margin-bottom:8px">
      <div class="card-title">🔔 ${unread.length} unread notification${unread.length>1?'s':''}</div>`;
    unread.slice(0,2).forEach(n => {
      html += `<div class="list-item" onclick="markNotifRead(${n.id})">
        <div class="list-item-left">
          <div class="list-item-title" style="font-size:0.82rem">${escHtml(n.message)}</div>
          <div class="list-item-sub">${timeSince(n.scheduledAt)}</div>
        </div>
      </div>`;
    });
    html += `</div>`;
  }

  // Submitted LEMs needing action
  if (submitted.length) {
    html += `<div class="section-header mt-8"><span class="section-title">⏳ Needs Approval</span>
      <button class="btn btn-sm btn-gold" onclick="navigate('approvals')" style="background:var(--gold);color:#000;border:none;border-radius:6px;padding:4px 12px;font-size:0.75rem;font-weight:700;cursor:pointer">View All</button>
    </div>`;
    for (const lem of submitted.slice(0, 3)) {
      const user = await getUser(lem.userId);
      const proj = projects.find(p => p.id === lem.projectId) || (await getProjects(false)).find(p => p.id === lem.projectId);
      const hrs = (lem.labourItems||[]).reduce((s,l)=>s+(l.total||0),0);
      html += `<div class="card" style="border-color:var(--gold)">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <div class="card-title" style="font-size:0.9rem">${escHtml(lem.lemNumber||'LEM-'+String(lem.id).padStart(4,'0'))}</div>
            <div class="text-sm text-muted">${escHtml(user?.name||'—')} · ${lem.date} · ${hrs.toFixed(1)}h</div>
            <div class="text-sm text-muted">${escHtml(proj?.name||'No project')}</div>
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-danger btn-sm" onclick="rejectLEM(${lem.id})">✗</button>
            <button class="btn btn-success btn-sm" onclick="approveLEM(${lem.id})">✓</button>
          </div>
        </div>
      </div>`;
    }
    if (submitted.length > 3) {
      html += `<button class="btn btn-outline btn-full mt-4" onclick="navigate('approvals')">+ ${submitted.length-3} more</button>`;
    }
  }

  // Team overview
  html += `<div class="section-header mt-12"><span class="section-title">👥 Team Status</span></div>`;
  const today = new Date().toISOString().slice(0,10);
  for (const staff of fieldStaff) {
    const staffLems = allLems.filter(l => l.userId === staff.id).sort((a,b)=>b.date.localeCompare(a.date));
    const latestLem = staffLems[0];
    const todayLem  = staffLems.find(l => l.date === today);
    const statusDot = todayLem ? (todayLem.status==='submitted'?'🟡':todayLem.status==='approved'?'🟢':'🔵') : '⚪';
    html += `<div class="card" style="padding:10px 12px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-weight:600;font-size:0.88rem">${statusDot} ${escHtml(staff.name)}</div>
          <div class="text-sm text-muted">${todayLem ? 'LEM today: ' + (todayLem.status) : latestLem ? 'Last: ' + latestLem.date : 'No LEMs yet'}</div>
        </div>
        <div class="text-sm text-muted">${staffLems.length} total</div>
      </div>
    </div>`;
  }

  // Supervisor quick actions
  html += `<div class="section-header mt-12"><span class="section-title">Quick Actions</span></div>
    <div class="grid-2">
      <button class="btn btn-primary" onclick="navigate('approvals')">✅ Approvals</button>
      <button class="btn btn-outline" onclick="navigate('projects')">📁 Projects</button>
      <button class="btn btn-ghost" onclick="navigate('invoicing')">🧾 Invoicing</button>
      <button class="btn btn-ghost" onclick="navigate('admin')">⚙️ Admin</button>
      <button class="btn btn-ghost" onclick="navigate('lem-dashboard')">📊 LEM Board</button>
      <button class="btn btn-ghost" onclick="openTimeOffRequest()">📅 Time Off</button>
      <button class="btn btn-ghost" onclick="navigate('pos')">🛒 Purchase Orders</button>
      <button class="btn btn-ghost" onclick="navigate('mileage')">🚗 Mileage</button>
      <button class="btn btn-ghost" onclick="navigate('payroll')">💰 Payroll</button>
    </div>`;

  container.innerHTML = html;
}

// ─── Field Staff Home ──────────────────────────────────────────────────────────
async function renderFieldHome() {
  const container = $('page-home').querySelector('.page-scroll');
  const notifs = await getNotifications(currentUser.id);
  const unread  = notifs.filter(n => !n.read);

  let html = `<div class="section-header"><span class="section-title">Good ${greeting()}, ${escHtml(currentUser.name.split(' ')[0])}</span></div>`;

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

  html += `<div class="section-header mt-12"><span class="section-title">Quick Actions</span></div>
  <div class="grid-2">
    <button class="btn btn-primary" onclick="navigate('lem')">📋 New LEM</button>
    <button class="btn btn-outline" onclick="navigate('safety')">🦺 Safety Form</button>
    <button class="btn btn-ghost" onclick="navigate('walkaround')">🚛 Vehicle Check</button>
    <button class="btn btn-ghost" onclick="navigate('receipts')">🧾 Receipt</button>
    <button class="btn btn-ghost" onclick="openTimeOffRequest()">📅 Time Off</button>
    <button class="btn btn-ghost" onclick="navigate('mileage')">🚗 Mileage</button>
    <button class="btn btn-ghost" onclick="navigate('pos')">🛒 Purchase Orders</button>
  </div>`;

  const lems = await getLEMsByUser(currentUser.id);
  const today = new Date().toISOString().slice(0, 10);
  const todayLEMs = lems.filter(l => l.date === today);
  if (todayLEMs.length === 0) {
    html += `<div class="card mt-12" style="border-color:var(--warning)">
      <div class="card-title text-muted">No LEM for today</div>
      <button class="btn btn-primary btn-full mt-8" onclick="openNewLEMModal()">Create Today's LEM</button>
    </div>`;
  }

  container.innerHTML = html;
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

  // Validate serial numbers only when submitting (not for draft saves)
  if (status === 'submitted') {
    const missingSerial = instruments.filter(i => i.name && i.name !== 'Other' && !i.serialNumber);
    if (missingSerial.length > 0) {
      toast(`Serial number required for: ${missingSerial.map(i => i.name).join(', ')}`, 'error');
      return;
    }
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
  // Show both submitted (pending approval) and outstanding drafts
  const allLems = await window.DR_DB.lems.toArray();
  const submitted = allLems.filter(l => l.status === 'submitted');
  const drafts    = allLems.filter(l => l.status === 'draft');
  const projects  = await getProjects(false);

  let html = `<div class="section-header"><span class="section-title">Pending LEM Approvals</span></div>`;

  if (!submitted.length && !drafts.length) {
    html += `<div class="empty-state">${svgCheck()}<p>All caught up! No pending LEMs.</p></div>`;
  }

  // ── Submitted LEMs (require action) ────────────────────────────────────
  if (submitted.length) {
    for (const lem of submitted) {
      const user = await getUser(lem.userId);
      const proj = projects.find(p => p.id === lem.projectId);
      const labour = lem.labourItems || [];
      const totalHrs = labour.reduce((s, l) => s + (l.total || 0), 0);
      html += `<div class="card" style="border-color:var(--gold)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div class="card-title">${escHtml(lem.lemNumber || 'LEM-' + String(lem.id).padStart(4,'0'))}</div>
          <span style="background:var(--gold);color:#000;font-size:0.7rem;font-weight:700;padding:2px 8px;border-radius:10px">SUBMITTED</span>
        </div>
        <div class="text-sm text-muted">Field Staff: <strong style="color:var(--text)">${escHtml(user?.name || '—')}</strong></div>
        <div class="text-sm text-muted">Project: <strong style="color:var(--text)">${escHtml(proj?.name || '—')}</strong></div>
        <div class="text-sm text-muted">Date: ${lem.date}</div>
        <div class="text-sm text-muted mt-8">Labour: ${labour.length} person(s) • ${totalHrs.toFixed(1)} hrs</div>
        ${lem.instruments?.length ? `<div class="text-sm text-muted">Instruments: ${lem.instruments.map(i => i.name).join(', ')}</div>` : ''}
        <div class="divider"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <button class="btn btn-danger btn-sm" onclick="rejectLEM(${lem.id})">Reject</button>
          <button class="btn btn-success btn-sm" onclick="approveLEM(${lem.id})">Approve & PDF</button>
        </div>
      </div>`;
    }
  }

  // ── Draft LEMs (field staff haven't submitted yet) ──────────────────────
  if (drafts.length) {
    html += `<div class="section-header mt-12"><span class="section-title">Outstanding Drafts</span><span class="text-sm text-muted" style="font-size:0.75rem">Not yet submitted</span></div>`;
    for (const lem of drafts) {
      const user = await getUser(lem.userId);
      const proj = projects.find(p => p.id === lem.projectId);
      html += `<div class="card" style="border-color:var(--border);opacity:0.85">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div class="card-title" style="color:var(--text-muted)">${escHtml(lem.lemNumber || 'LEM-' + String(lem.id).padStart(4,'0'))}</div>
          <span style="background:var(--border);color:var(--text-muted);font-size:0.7rem;font-weight:700;padding:2px 8px;border-radius:10px">DRAFT</span>
        </div>
        <div class="text-sm text-muted">Field Staff: <strong style="color:var(--text)">${escHtml(user?.name || '—')}</strong></div>
        <div class="text-sm text-muted">Project: <strong style="color:var(--text)">${escHtml(proj?.name || '—')}</strong></div>
        <div class="text-sm text-muted">Date: ${lem.date}</div>
        <div class="divider"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
          <button class="btn btn-outline btn-sm" onclick="sendDraftReminder(${lem.id}, ${lem.userId})">📨 Remind</button>
          <button class="btn btn-success btn-sm" onclick="approveLEM(${lem.id})">✓ Approve</button>
        </div>
      </div>`;
    }
  }

  container.innerHTML = html;
}

window.sendDraftReminder = async (lemId, userId) => {
  const lem = await window.DR_DB.lems.get(lemId);
  await window.DR_DB.notifications.add({
    toUserId: userId, fromUserId: currentUser.id,
    message: `Reminder: Please submit LEM ${lem?.lemNumber || lemId} for approval`,
    scheduledAt: new Date().toISOString(), read: false, type: 'reminder'
  });
  toast('Reminder sent', 'success');
};

window.approveLEM = async (lemId) => {
  if (currentUser?.role !== 'supervisor') { toast('Only supervisors can approve LEMs', 'error'); return; }
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

  // Download the approved PDF locally
  pdfDoc.save(`LEM_${lem.lemNumber}_${lem.date || 'approved'}.pdf`);

  // Upload to OneDrive if Microsoft account is connected
  try {
    const odResult = await uploadTimesheetPDF(pdfDoc, lem, proj?.name || 'Project', user?.name || 'Staff');
    if (odResult) toast('📁 Saved to OneDrive: 00 - DÙN RIGHT APP/02 - TIMESHEETS', 'success');
  } catch(e) { console.warn('OneDrive upload skipped:', e.message); }

  // In-app notification to field staff
  await window.DR_DB.notifications.add({
    toUserId: lem.userId, fromUserId: currentUser.id,
    message: `Your LEM ${lem.lemNumber} was approved by ${currentUser.name}`,
    scheduledAt: new Date().toISOString(), read: false, type: 'approval'
  });

  // Open email client pre-addressed to field staff + client + kelticfield@gmail.com
  const emailTo = ['kelticfield@gmail.com'];
  if (user?.email) emailTo.push(user.email);
  if (proj?.clientEmail) emailTo.push(proj.clientEmail);
  const lemDate = lem.date || new Date().toISOString().slice(0,10);
  const mailSubj = encodeURIComponent(`Approved LEM ${lem.lemNumber} — ${proj?.name || 'Project'} — ${lemDate}`);
  const mailBody = encodeURIComponent(
    `Hi,\n\nLEM ${lem.lemNumber} for ${proj?.name || 'the project'} on ${lemDate} has been approved by ${currentUser.name}.\n\nPlease find the LEM PDF attached.\n\nRegards,\n${currentUser.name}\nKeltic Geomatics Field Services`
  );
  window.open(`mailto:${emailTo.join(',')}?subject=${mailSubj}&body=${mailBody}`, '_blank');
  toast('✅ LEM approved! PDF downloaded — attach it to the email.', 'success');
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
  const titles = { fitforwork: 'Fit for Work Assessment', flha: 'Field Level Hazard Assessment (FLHA)', hazard: 'Hazard Report' };

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

  if (type === 'flha') {
    formHtml += `
    <div style="margin-top:16px;border-top:1px solid var(--border);padding-top:12px">
      <div style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin-bottom:8px">
        📧 Email FLHA (optional)
      </div>
      <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:8px">
        Always sent to: <strong style="color:var(--gold)">kelticfield@gmail.com</strong>
      </div>
      <div class="form-group" style="margin-bottom:6px">
        <input type="email" id="flha-email-1" placeholder="Additional email 1" autocomplete="email">
      </div>
      <div class="form-group" style="margin-bottom:6px">
        <input type="email" id="flha-email-2" placeholder="Additional email 2" autocomplete="email">
      </div>
      <div class="form-group" style="margin-bottom:0">
        <input type="email" id="flha-email-3" placeholder="Additional email 3" autocomplete="email">
      </div>
    </div>`;
  }

  formHtml += `<div style="display:grid;grid-template-columns:${type==='flha'?'1fr 1fr 1fr 1fr':'1fr 1fr'};gap:8px;margin-top:16px">
    <button class="btn btn-ghost" onclick="closeModal('safety-modal')">Cancel</button>
    ${type === 'flha' ? `<button class="btn btn-outline" onclick="printFLHA()">🖨️ PDF</button>
    <button class="btn btn-outline" onclick="emailFLHA()" style="background:var(--surface);border-color:var(--gold);color:var(--gold)">📧 Email</button>` : '<div></div>'}
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
      company: $('sf-company')?.value || 'Keltic Geomatics',
      task: $('sf-task')?.value || '',
      location: $('sf-location')?.value || '',
      muster: $('sf-muster')?.value || '',
      ppe: $('sf-ppe')?.value || 'yes',
      controls: $('sf-controls')?.value || '',
      hazards, taskRows, crewRows,
      preparedBy: currentUser.name
    };
    const pdf = await generateFLHAPDF(formData);
    pdf.save(`FLHA_${formData.date}_${currentUser.name.replace(/\s+/g,'_')}.pdf`);
  } catch(e) {
    console.error('FLHA PDF error:', e);
    toast('PDF generation failed: ' + e.message, 'error');
  }
};


window.emailFLHA = async () => {
  try {
    const { generateFLHAPDF } = await import('./pdf.js');
    // Collect form data (same as printFLHA)
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
      company: $('sf-company')?.value || 'Keltic Geomatics',
      task: $('sf-task')?.value || '',
      location: $('sf-location')?.value || '',
      muster: $('sf-muster')?.value || '',
      ppe: $('sf-ppe')?.value || 'yes',
      controls: $('sf-controls')?.value || '',
      hazards, taskRows, crewRows,
      preparedBy: currentUser.name
    };

    // Generate & download PDF
    const pdf = await generateFLHAPDF(formData);
    const filename = `FLHA_${formData.date}_${currentUser.name.replace(/\s+/g,'_')}.pdf`;
    pdf.save(filename);

    // Build recipient list — kelticfield@gmail.com always first
    const AUTO_EMAIL = 'kelticfield@gmail.com';
    const extras = [
      ($('flha-email-1')?.value || '').trim(),
      ($('flha-email-2')?.value || '').trim(),
      ($('flha-email-3')?.value || '').trim()
    ].filter(e => e && e.includes('@'));
    const allTo = [AUTO_EMAIL, ...extras].join(',');

    const subject = encodeURIComponent(`FLHA — ${formData.location || formData.task || 'Keltic Geomatics'} — ${formData.date}`);
    const body = encodeURIComponent(
      `Hi,\n\nPlease find the Field Level Hazard Assessment attached.\n\n` +
      `Date: ${formData.date}\n` +
      `Prepared by: ${formData.preparedBy}\n` +
      `Location: ${formData.location || '—'}\n` +
      `Work description: ${formData.task || '—'}\n\n` +
      `The FLHA PDF (${filename}) has been downloaded — please attach it to this email before sending.\n\n` +
      `Keltic Geomatics`
    );

    // Open mailto — PDF was already downloaded, user attaches and sends
    window.location.href = `mailto:${allTo}?subject=${subject}&body=${body}`;

    toast('📧 PDF downloaded — attach it to the email that opened', 'success');
  } catch(e) {
    console.error('FLHA email error:', e);
    toast('Email prep failed: ' + e.message, 'error');
  }
};

window.submitSafetyForm = async (type) => {
  const projects = await getProjects();
  const date = $('sf-date')?.value || new Date().toISOString().slice(0,10);
  let extraData = {};
  if (type === 'flha') {
    const hazards = [];
    document.querySelectorAll('.flha-haz:checked').forEach(cb => {
      hazards.push({ category: cb.dataset.cat, item: cb.dataset.item });
    });
    extraData = {
      company: $('sf-company')?.value || 'Keltic Geomatics',
      location: $('sf-location')?.value || '',
      muster: $('sf-muster')?.value || '',
      ppe: $('sf-ppe')?.value || 'yes',
      hazards,
      controls: $('sf-controls')?.value || ''
    };
  }
  await window.DR_DB.safetyForms.add({
    userId: currentUser.id, type, date,
    projectId: projects[0]?.id || null,
    notes: $('sf-notes')?.value || $('sf-hazard-desc')?.value || '',
    task: $('sf-task')?.value || '',
    controls: $('sf-controls')?.value || '',
    status: 'submitted', syncStatus: 'pending',
    createdAt: new Date().toISOString(),
    ...extraData
  });
  closeModal('safety-modal');
  toast('Safety form submitted', 'success');
  renderSafetyPage();
};

// ─── Receipts ─────────────────────────────────────────────────────────────────
async function renderReceiptsPage() {
  const container = $('page-receipts').querySelector('.page-scroll');
  const receipts = await window.DR_DB.receipts.where('userId').equals(currentUser.id).reverse().sortBy('date');
  let html = `<div class="section-header">
    <span class="section-title">Receipts</span>
    <button class="btn btn-primary btn-sm" onclick="openReceiptModal()">+ Add</button>
  </div>`;
  if (!receipts.length) {
    html += `<div class="empty-state">${svgReceipt()}<p>No receipts yet</p></div>`;
  } else {
    receipts.forEach(r => {
      html += `<div class="list-item">
        <div class="list-item-left">
          <div class="list-item-title">$${Number(r.amount).toFixed(2)} — ${r.date}</div>
          <div class="list-item-sub">${r.billable ? '💰 Billable' : '🏢 Non-billable'} • ${r.description || '—'}</div>
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
  const receipt = {
    userId: currentUser.id, date: $('rec-date').value,
    amount, description: $('rec-desc').value,
    billable, projectId: billable ? parseInt($('rec-project').value) || null : null,
    status: 'submitted', syncStatus: 'pending', submittedAt: new Date().toISOString()
  };
  const id = await window.DR_DB.receipts.add(receipt);
  receipt.id = id;
  const file = $('rec-photo').files[0];
  if (file) { try { await uploadReceiptPhoto(file, receipt, currentUser.name); } catch(e) {} }
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

// ─── Photos ───────────────────────────────────────────────────────────────────
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
          <div class="list-item-sub">${p.takenAt?.slice(0,10)} • ${p.syncStatus === 'synced' ? '☁️ OneDrive' : '📱 Pending'}</div>
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
    const filename = await uploadSitePhoto(file, projectName, currentUser.name, count).catch(() => null);
    await window.DR_DB.photos.add({
      userId: currentUser.id, projectId: parseInt(projectSel.value) || null,
      filename: `${currentUser.name.replace(/\s+/g,'_')}_${new Date().toISOString().slice(0,10)}_${String(count).padStart(3,'0')}`,
      takenAt: new Date().toISOString(), syncStatus: filename ? 'synced' : 'pending'
    });
  }
  toast(`${input.files.length} photo(s) uploaded`, 'success');
  renderPhotosPage();
};

// ─── Staff management ─────────────────────────────────────────────────────────
async function renderStaff() {
  const container = $('page-staff').querySelector('.page-scroll');
  const users = await getAllUsers();
  let html = `<div class="section-header">
    <span class="section-title">Staff</span>
    <button class="btn btn-primary btn-sm" onclick="openAddStaffModal()">+ Add</button>
  </div>`;
  users.forEach(u => {
    html += `<div class="list-item">
      <div class="list-item-left" onclick="viewEmployeeProfile(${u.id})" style="cursor:pointer;flex:1">
        <div class="list-item-title">${escHtml(u.name)}</div>
        <div class="list-item-sub">${u.role} • ${u.province || '—'} • ${u.hourlyRate ? '$' + u.hourlyRate + '/hr' : 'rate not set'}</div>
        <div class="list-item-sub" style="font-size:0.75rem">${u.email || '—'}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
        <button class="btn btn-sm btn-ghost" onclick="viewEmployeeProfile(${u.id})">Profile</button>
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
  const PROVINCES = ['AB','BC','MB','NB','NL','NS','NT','NU','ON','PE','QC','SK','YT'];
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
    <div class="form-group"><label>Hourly Rate ($/hr)</label><input type="number" id="staff-rate" min="0" step="0.01" placeholder="e.g. 55.00"></div>
    <div class="form-group"><label>Province</label>
      <select id="staff-province">
        ${PROVINCES.map(p => `<option value="${p}"${p === 'BC' ? ' selected' : ''}>${p}</option>`).join('')}
      </select>
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
    email: $('staff-email').value, role: $('staff-role').value,
    hourlyRate: parseFloat($('staff-rate').value) || 0,
    province: $('staff-province').value,
    active: true
  });
  closeModal('staff-modal');
  toast('Staff member added', 'success');
  renderStaff();
};

window.openSendReminderModal = (userId, name) => {
  toast(`Use the reminder section below to ping ${name}`, 'info');
};

// ─── Invoicing ────────────────────────────────────────────────────────────────
async function renderInvoicing() {
  const container = $('page-invoicing').querySelector('.page-scroll');
  const invoices = await window.DR_DB.invoices.toArray();
  const projects = await getProjects(false);
  let html = `<div class="section-header">
    <span class="section-title">Invoices</span>
    <button class="btn btn-primary btn-sm" onclick="openNewInvoiceModal()">+ New</button>
  </div>`;
  if (!invoices.length) {
    html += `<div class="empty-state">${svgDoc()}<p>No invoices yet</p></div>`;
  } else {
    for (const inv of invoices) {
      const proj = projects.find(p => p.id === inv.projectId);
      html += `<div class="list-item" onclick="viewInvoice(${inv.id})">
        <div class="list-item-left">
          <div class="list-item-title">INV-${String(inv.id).padStart(4,'0')} — ${escHtml(proj?.name || '—')}</div>
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
  const modal = $('invoice-modal-sheet');
  modal.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-title">New Invoice</div>
    <div class="form-group"><label>Project</label>
      <select id="inv-project" onchange="loadApprovedLEMs(this.value)">
        <option value="">Select project...</option>
        ${projects.map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('')}
      </select>
    </div>
    <div id="inv-lem-section" style="display:none">
      <div class="section-header mt-8"><span class="section-title">Attach LEMs</span></div>
      <div id="inv-lem-list"></div>
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

window.loadApprovedLEMs = async (projectId) => {
  if (!projectId) return;
  const lems = await window.DR_DB.lems.where('projectId').equals(parseInt(projectId)).filter(l => l.status === 'approved').toArray();
  const section = $('inv-lem-section');
  const list = $('inv-lem-list');
  section.style.display = 'block';
  if (!lems.length) { list.innerHTML = '<p class="text-muted text-sm">No approved LEMs for this project</p>'; return; }
  list.innerHTML = lems.map(lem => `
    <div class="toggle-row">
      <span class="toggle-label">${escHtml(lem.lemNumber || `LEM-${String(lem.id).padStart(4,'0')}`)} — ${lem.date}</span>
      <input type="checkbox" value="${lem.id}" id="lem-check-${lem.id}" style="width:20px;height:20px;cursor:pointer">
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
  const lemIds = Array.from(document.querySelectorAll('#inv-lem-list input[type=checkbox]:checked')).map(cb => parseInt(cb.value));
  const lines = [];
  document.querySelectorAll('#inv-lines .card').forEach(card => {
    const desc = card.querySelector('.inv-desc').value;
    const qty  = parseFloat(card.querySelector('.inv-qty').value) || 1;
    const rate = parseFloat(card.querySelector('.inv-rate').value) || 0;
    if (desc) lines.push({ description: desc, quantity: qty, rate, amount: qty * rate });
  });
  const total = lines.reduce((s, l) => s + l.amount, 0);
  const invId = await window.DR_DB.invoices.add({
    projectId, lemIds, status: 'draft', total,
    dueDate: $('inv-terms').value,
    createdBy: currentUser.id, createdAt: new Date().toISOString()
  });
  for (const line of lines) await window.DR_DB.invoiceItems.add({ invoiceId: invId, lemId: null, ...line });
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
    <div class="text-sm text-muted">Project: <strong style="color:var(--text)">${escHtml(proj?.name || '—')}</strong></div>
    <div class="text-sm text-muted">Client: ${escHtml(proj?.clientName || '—')}</div>
    <div class="divider"></div>
    ${items.map(i => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)">
      <span class="text-sm">${escHtml(i.description)}</span>
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
  const pdf = await generateInvoicePDF(inv, proj, items, []);
  try { await uploadInvoicePDF(pdf, inv, proj?.name || 'Project'); } catch(e) {}
  await window.DR_DB.invoices.update(invId, { status: 'sent', sentAt: new Date().toISOString() });
  if (proj?.clientEmail) {
    try {
      const b64 = pdfToBase64(pdf);
      await sendEmail({
        to: proj.clientEmail,
        subject: `Invoice INV-${String(invId).padStart(4,'0')} — ${proj.name}`,
        body: `<p>Please find attached invoice INV-${String(invId).padStart(4,'0')} for <strong>${proj.name}</strong>.</p><p>Regards,<br>${currentUser.name}<br>Keltic Geomatics</p>`,
        attachments: [{ name: `Invoice_INV-${String(invId).padStart(4,'0')}.pdf`, contentType: 'application/pdf', contentBytes: b64 }]
      });
    } catch(e) {}
  }
  closeModal('inv-view-modal');
  toast('Invoice finalized and emailed', 'success');
  renderInvoicing();
};

// ─── Utilities ────────────────────────────────────────────────────────────────
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

// ─── SVG Icons ────────────────────────────────────────────────────────────────
// ─── Admin Dashboard (Supervisor only) ────────────────────────────────────────
let adminTab = 'users';

async function renderAdmin() {
  if (currentUser.role !== 'supervisor') { navigate('home'); return; }
  const container = $('page-admin').querySelector('.page-scroll') || $('page-admin');

  const TAB_STYLE = (t) => `padding:8px 16px;border-radius:6px;font-size:0.82rem;font-weight:600;cursor:pointer;border:none;transition:all 0.2s;${adminTab===t?'background:var(--gold);color:#000':'background:var(--surface);color:var(--text-muted)'}`;

  const msConnected = isMSConnected();
  let html = `
    <div class="section-header"><span class="section-title">⚙️ Admin Dashboard</span></div>
    <div class="card" style="border-color:${msConnected ? 'var(--success)' : 'var(--warning)'};padding:10px 14px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-size:0.82rem;font-weight:700">${msConnected ? '✅ Microsoft Connected' : '⚠️ Microsoft Not Connected'}</div>
        <div class="text-sm text-muted">${msConnected ? 'LEMs auto-save to OneDrive' : 'Connect to enable OneDrive & email'}</div>
      </div>
      ${msConnected
        ? `<button class="btn btn-sm btn-danger" onclick="disconnectMicrosoft()">Disconnect</button>`
        : `<button class="btn btn-sm btn-primary" onclick="connectMicrosoft()">Connect</button>`}
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;padding:4px 0 12px">
      <button style="${TAB_STYLE('users')}"    onclick="setAdminTab('users')">👥 Users</button>
      <button style="${TAB_STYLE('lems')}"     onclick="setAdminTab('lems')">📋 All LEMs</button>
      <button style="${TAB_STYLE('projects')}" onclick="setAdminTab('projects')">📁 Projects</button>
      <button style="${TAB_STYLE('equipment')}"onclick="setAdminTab('equipment')">🔧 Equipment</button>
      <button style="${TAB_STYLE('timeoff')}"  onclick="setAdminTab('timeoff')">📅 Time Off</button>
    </div>`;

  if (adminTab === 'users') {
    const users = await window.DR_DB.users.toArray();
    html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <div class="text-sm text-muted">${users.length} staff members</div>
      <button class="btn btn-sm btn-primary" onclick="openAddStaffModal()">+ Add Staff</button>
    </div>`;
    for (const u of users) {
      html += `<div class="card" style="opacity:${u.active?1:0.5}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <div class="card-title" style="margin-bottom:2px">${escHtml(u.name)}</div>
            <div class="text-sm text-muted">${u.role === 'supervisor' ? '🟡 Supervisor' : '🔵 Field'} · ${escHtml(u.email||'')}</div>
            <div class="text-sm text-muted">Rate: $${u.hourlyRate||0}/hr · Province: ${u.province||'BC'}</div>
          </div>
          <span style="font-size:0.72rem;font-weight:700;padding:2px 8px;border-radius:10px;background:${u.active?'var(--success)':'var(--danger)'};color:#fff">${u.active?'Active':'Inactive'}</span>
        </div>
        <div class="divider"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px">
          <button class="btn btn-sm btn-outline" onclick="adminEditRate(${u.id},${u.hourlyRate||0})">Edit Rate</button>
          <button class="btn btn-sm btn-outline" onclick="adminToggleRole(${u.id},'${u.role}')">Toggle Role</button>
          <button class="btn btn-sm ${u.active?'btn-danger':'btn-success'}" onclick="adminToggleActive(${u.id},${u.active})">${u.active?'Deactivate':'Activate'}</button>
        </div>
      </div>`;
    }
  }

  if (adminTab === 'lems') {
    const lems = await window.DR_DB.lems.reverse().sortBy('date');
    const projects = await getProjects(false);
    const STATUS_COLOR = { draft:'var(--border)', submitted:'var(--gold)', approved:'var(--success)', rejected:'var(--danger)' };
    html += `<div class="text-sm text-muted" style="margin-bottom:8px">${lems.length} total LEMs</div>`;
    const byStatus = { draft:0, submitted:0, approved:0, rejected:0 };
    lems.forEach(l => { if (byStatus[l.status] !== undefined) byStatus[l.status]++; });
    html += `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:12px">
      ${Object.entries(byStatus).map(([s,n])=>`<div class="card" style="text-align:center;padding:8px;border-color:${STATUS_COLOR[s]}">
        <div style="font-size:1.3rem;font-weight:700">${n}</div>
        <div style="font-size:0.7rem;text-transform:uppercase;color:var(--text-muted)">${s}</div>
      </div>`).join('')}
    </div>`;
    for (const lem of lems.slice(0,50)) {
      const u = await getUser(lem.userId);
      const proj = projects.find(p => p.id === lem.projectId);
      const labour = lem.labourItems || [];
      const hrs = labour.reduce((s,l) => s+(l.total||0), 0);
      html += `<div class="card" style="border-left:3px solid ${STATUS_COLOR[lem.status]||'var(--border)'}">
        <div style="display:flex;justify-content:space-between">
          <span class="card-title" style="font-size:0.9rem">${escHtml(lem.lemNumber||'LEM-'+String(lem.id).padStart(4,'0'))}</span>
          <span style="font-size:0.7rem;font-weight:700;padding:2px 8px;border-radius:10px;background:${STATUS_COLOR[lem.status]||'var(--border)'};color:${lem.status==='submitted'?'#000':'#fff'}">${lem.status?.toUpperCase()}</span>
        </div>
        <div class="text-sm text-muted">${escHtml(u?.name||'—')} · ${escHtml(proj?.name||'—')} · ${lem.date}</div>
        <div class="text-sm text-muted">${hrs.toFixed(1)} hrs · ${lem.instruments?.length||0} instruments</div>
      </div>`;
    }
  }

  if (adminTab === 'projects') {
    const projects = await getProjects(false);
    html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <div class="text-sm text-muted">${projects.length} projects</div>
      <button class="btn btn-sm btn-primary" onclick="openNewProjectModal()">+ New Project</button>
    </div>`;
    for (const p of projects) {
      html += `<div class="card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <div class="card-title">${escHtml(p.name)}</div>
            <div class="text-sm text-muted">#${escHtml(p.projectNumber||'—')} · ${escHtml(p.clientName||'No client')}</div>
            <div class="text-sm text-muted">${escHtml(p.clientEmail||'')}</div>
          </div>
          <span style="font-size:0.72rem;font-weight:700;padding:2px 8px;border-radius:10px;background:${p.status==='active'?'var(--success)':'var(--border)'};color:${p.status==='active'?'#fff':'var(--text-muted)'}">${p.status?.toUpperCase()||'ACTIVE'}</span>
        </div>
        <div class="divider"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
          <button class="btn btn-sm btn-outline" onclick="adminEditProject(${p.id})">Edit</button>
          <button class="btn btn-sm ${p.status==='active'?'btn-danger':'btn-success'}" onclick="adminToggleProject(${p.id},'${p.status}')">
            ${p.status==='active'?'Close Project':'Reopen'}
          </button>
        </div>
      </div>`;
    }
  }

  if (adminTab === 'equipment') {
    const equip = await window.DR_DB.equipment.toArray();
    html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <div class="text-sm text-muted">${equip.length} instruments</div>
      <button class="btn btn-sm btn-primary" onclick="adminAddEquipment()">+ Add</button>
    </div>`;
    const STATUS_COLOR = { available:'var(--success)', 'in-use':'var(--gold)', maintenance:'var(--danger)' };
    for (const eq of equip) {
      html += `<div class="card" style="opacity:${eq.active?1:0.5}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <div class="card-title" style="font-size:0.9rem">${escHtml(eq.name)}</div>
            <div class="text-sm text-muted">S/N: ${escHtml(eq.serialNumber||'—')} · Type: ${escHtml(eq.type||eq.name)}</div>
          </div>
          <span style="font-size:0.72rem;font-weight:700;padding:2px 8px;border-radius:10px;background:${STATUS_COLOR[eq.status]||'var(--border)'};color:${eq.status==='available'?'#fff':eq.status==='in-use'?'#000':'#fff'}">${eq.status?.toUpperCase()||'—'}</span>
        </div>
        <div class="divider"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
          <button class="btn btn-sm btn-outline" onclick="adminEditEquipment(${eq.id})">Edit S/N</button>
          <button class="btn btn-sm ${eq.active?'btn-danger':'btn-success'}" onclick="adminToggleEquipment(${eq.id},${eq.active})">${eq.active?'Retire':'Restore'}</button>
        </div>
      </div>`;
    }
  }

  if (adminTab === 'timeoff') {
    const requests = await window.DR_DB.notifications
      .where('type').equals('timeoff_request').reverse().sortBy('scheduledAt');
    html += `<div class="text-sm text-muted" style="margin-bottom:12px">${requests.length} time-off request(s)</div>`;
    if (!requests.length) {
      html += `<div class="empty-state">${svgCheck()}<p>No time-off requests.</p></div>`;
    }
    // Build simple monthly calendar for current month
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth()+1, 0);
    const monthName = firstDay.toLocaleString('default',{month:'long',year:'numeric'});
    const approvedDates = requests.filter(r => r.approved).map(r => r.requestDate);
    html += `<div style="margin:12px 0;font-size:0.85rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em">${monthName}</div>`;
    html += `<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center;font-size:0.7rem;font-weight:700;color:var(--text-muted);margin-bottom:4px">
      <div>SUN</div><div>MON</div><div>TUE</div><div>WED</div><div>THU</div><div>FRI</div><div>SAT</div>
    </div>`;
    html += `<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px">`;
    const startPad = firstDay.getDay();
    for (let i = 0; i < startPad; i++) html += `<div></div>`;
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const hasReq = requests.find(r => r.requestDate === dateStr);
      const isToday = d === now.getDate();
      html += `<div style="padding:4px 2px;border-radius:4px;font-size:0.8rem;text-align:center;
        background:${hasReq ? (hasReq.approved ? 'var(--success)' : 'var(--gold)') : 'transparent'};
        color:${hasReq ? '#fff' : isToday ? 'var(--gold)' : 'var(--text)'};
        font-weight:${isToday ? '700' : '400'};
        border:${isToday ? '1px solid var(--gold)' : '1px solid transparent'}">
        ${d}${hasReq ? `<div style="font-size:0.55rem;line-height:1">${escHtml(hasReq.staffName||'')}</div>` : ''}
      </div>`;
    }
    html += `</div>`;
    // List of requests
    if (requests.length) {
      html += `<div class="section-header mt-12"><span class="section-title">Requests</span></div>`;
      for (const r of requests) {
        html += `<div class="card">
          <div class="card-title" style="font-size:0.9rem">${escHtml(r.staffName||'Unknown')}</div>
          <div class="text-sm text-muted">Dates: ${escHtml(r.requestDate||'—')}${r.endDate ? ' → ' + r.endDate : ''}</div>
          <div class="text-sm text-muted">${escHtml(r.message||'')}</div>
          ${!r.approved && !r.denied ? `<div class="divider"></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
            <button class="btn btn-danger btn-sm" onclick="adminDenyTimeOff(${r.id})">Deny</button>
            <button class="btn btn-success btn-sm" onclick="adminApproveTimeOff(${r.id})">Approve & Email</button>
          </div>` : r.approved ? `<div class="text-sm" style="color:var(--success);font-weight:600;margin-top:4px">✓ Approved</div>` : `<div class="text-sm" style="color:var(--danger);font-weight:600;margin-top:4px">✗ Denied</div>`}
        </div>`;
      }
    }
  }

  container.innerHTML = html;
}

window.setAdminTab = (tab) => { adminTab = tab; renderAdmin(); };

window.adminEditRate = async (userId, currentRate) => {
  const newRate = prompt(`New hourly rate for this employee (current: $${currentRate}/hr):`, currentRate);
  if (newRate === null) return;
  const rate = parseFloat(newRate);
  if (isNaN(rate) || rate < 0) { toast('Invalid rate', 'error'); return; }
  await window.DR_DB.users.update(userId, { hourlyRate: rate });
  toast('Rate updated', 'success');
  renderAdmin();
};

window.adminToggleRole = async (userId, currentRole) => {
  const newRole = currentRole === 'supervisor' ? 'field' : 'supervisor';
  if (!confirm(`Change this user to ${newRole}?`)) return;
  await window.DR_DB.users.update(userId, { role: newRole });
  toast(`Role changed to ${newRole}`, 'success');
  renderAdmin();
};

window.adminToggleActive = async (userId, currentActive) => {
  if (!confirm(`${currentActive ? 'Deactivate' : 'Activate'} this user?`)) return;
  await window.DR_DB.users.update(userId, { active: !currentActive });
  toast(currentActive ? 'User deactivated' : 'User activated', 'success');
  renderAdmin();
};

window.adminToggleProject = async (projectId, currentStatus) => {
  const newStatus = currentStatus === 'active' ? 'closed' : 'active';
  await window.DR_DB.projects.update(projectId, { status: newStatus });
  toast(`Project ${newStatus}`, 'success');
  renderAdmin();
};

window.adminEditProject = async (projectId) => {
  const p = await window.DR_DB.projects.get(projectId);
  if (!p) return;
  const newName = prompt('Project name:', p.name);
  if (!newName) return;
  const newClient = prompt('Client name:', p.clientName||'');
  const newEmail = prompt('Client email:', p.clientEmail||'');
  await window.DR_DB.projects.update(projectId, {
    name: newName.trim(),
    clientName: newClient?.trim()||p.clientName,
    clientEmail: newEmail?.trim()||p.clientEmail
  });
  toast('Project updated', 'success');
  renderAdmin();
};

window.adminAddEquipment = async () => {
  const name = prompt('Equipment name:');
  if (!name) return;
  const serial = prompt('Serial number (leave blank if unknown):', '');
  await window.DR_DB.equipment.add({ name: name.trim(), type: name.trim(), serialNumber: serial?.trim()||'', status: 'available', active: true, assignedTo: null });
  toast('Equipment added', 'success');
  renderAdmin();
};

window.adminEditEquipment = async (eqId) => {
  const eq = await window.DR_DB.equipment.get(eqId);
  if (!eq) return;
  const newSerial = prompt('Serial number:', eq.serialNumber||'');
  if (newSerial === null) return;
  await window.DR_DB.equipment.update(eqId, { serialNumber: newSerial.trim() });
  toast('Serial number updated', 'success');
  renderAdmin();
};

window.adminToggleEquipment = async (eqId, currentActive) => {
  await window.DR_DB.equipment.update(eqId, { active: !currentActive });
  toast(currentActive ? 'Equipment retired' : 'Equipment restored', 'success');
  renderAdmin();
};

window.adminApproveTimeOff = async (notifId) => {
  await window.DR_DB.notifications.update(notifId, { approved: true, read: true });
  const req = await window.DR_DB.notifications.get(notifId);
  if (req) {
    await window.DR_DB.notifications.add({
      toUserId: req.fromUserId, fromUserId: currentUser.id,
      message: `Your time-off request for ${req.requestDate} has been approved`,
      scheduledAt: new Date().toISOString(), read: false, type: 'timeoff_approved'
    });
    // Draft approval email
    const staffUser = await getUser(req.fromUserId);
    const dateRange = req.endDate && req.endDate !== req.requestDate ? `${req.requestDate} to ${req.endDate}` : req.requestDate;
    const toAddr = staffUser?.email ? `${staffUser.email},kelticfield@gmail.com` : 'kelticfield@gmail.com';
    const subj = encodeURIComponent(`Time Off Approved — ${dateRange}`);
    const body = encodeURIComponent(
      `Hi ${req.staffName || staffUser?.name || 'there'},\n\nYour time-off request for ${dateRange} has been approved.\n\nRegards,\n${currentUser.name}\nKeltic Geomatics`
    );
    window.open(`mailto:${toAddr}?subject=${subj}&body=${body}`, '_blank');
  }
  toast('✅ Approved — email client opened to notify staff', 'success');
  renderAdmin();
};

window.adminDenyTimeOff = async (notifId) => {
  await window.DR_DB.notifications.update(notifId, { denied: true, read: true });
  const req = await window.DR_DB.notifications.get(notifId);
  if (req) {
    await window.DR_DB.notifications.add({
      toUserId: req.fromUserId, fromUserId: currentUser.id,
      message: `Your time-off request for ${req.requestDate} was not approved`,
      scheduledAt: new Date().toISOString(), read: false, type: 'timeoff_denied'
    });
    // Draft denial email
    const staffUser = await getUser(req.fromUserId);
    const dateRange = req.endDate && req.endDate !== req.requestDate ? `${req.requestDate} to ${req.endDate}` : req.requestDate;
    const toAddr = staffUser?.email ? staffUser.email : 'kelticfield@gmail.com';
    const subj = encodeURIComponent(`Time Off Request — ${dateRange}`);
    const body = encodeURIComponent(
      `Hi ${req.staffName || staffUser?.name || 'there'},\n\nUnfortunately your time-off request for ${dateRange} cannot be approved at this time. Please contact us to discuss alternatives.\n\nRegards,\n${currentUser.name}\nKeltic Geomatics`
    );
    window.open(`mailto:${toAddr}?subject=${subj}&body=${body}`, '_blank');
  }
  toast('Request denied — email client opened', 'error');
  renderAdmin();
};

// Time-off request (for field staff — accessible from home page)
window.openTimeOffRequest = () => {
  const modal = $('wo-modal-sheet');
  modal.innerHTML = `<div class="modal-handle"></div>
    <div class="modal-title">📅 Request Time Off</div>
    <div class="form-group"><label>Start Date</label><input type="date" id="to-start" value="${new Date().toISOString().slice(0,10)}"></div>
    <div class="form-group"><label>End Date (leave blank for single day)</label><input type="date" id="to-end"></div>
    <div class="form-group"><label>Reason (optional)</label><textarea id="to-reason" placeholder="Reason for time off..." rows="2"></textarea></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:16px">
      <button class="btn btn-ghost" onclick="closeModal('wo-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="submitTimeOffRequest()">Submit Request</button>
    </div>`;
  openModal('wo-modal');
};

window.submitTimeOffRequest = async () => {
  const startDate = $('to-start')?.value;
  const endDate   = $('to-end')?.value || startDate;
  const reason    = $('to-reason')?.value || 'Time off requested';
  if (!startDate) { toast('Please select a date', 'error'); return; }
  const supervisors = await window.DR_DB.users.where('role').equals('supervisor').toArray();
  for (const sup of supervisors) {
    await window.DR_DB.notifications.add({
      toUserId: sup.id, fromUserId: currentUser.id,
      message: reason,
      requestDate: startDate, endDate: endDate,
      staffName: currentUser.name,
      scheduledAt: new Date().toISOString(), read: false, type: 'timeoff_request'
    });
  }
  closeModal('wo-modal');
  toast('Time-off request sent to supervisors', 'success');
};


function svgHome()      { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`; }
function svgClipboard() { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>`; }
function svgShield()    { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`; }
function svgReceipt()   { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 2v20l3-2 3 2 3-2 3 2 3-2V2z"/><line x1="8" y1="9" x2="16" y2="9"/><line x1="8" y1="13" x2="16" y2="13"/></svg>`; }
function svgCamera()    { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>`; }
function svgCheck()     { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`; }
function svgFolder()    { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>`; }
function svgDoc()       { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`; }
function svgPeople()    { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>`; }
function svgGrid()      { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>`; }
function svgWrench()    { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>`; }
function svgTruck()     { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`; }
function svgGear()      { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>`; }

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Handle Microsoft OAuth callback redirect
  const msCallback = await handleMSAuthCallback();
  if (msCallback) { console.log('Microsoft account connected'); }

  // Restore stored MS token silently
  await loadMSToken();

  const savedId = sessionStorage.getItem('dr_user_id');
  if (savedId) {
    const user = await window.DR_DB.users.get(parseInt(savedId));
    if (user && user.active) { currentUser = user; showApp(); return; }
  }
  $('login-form').addEventListener('submit', handleLogin);
  $('login-screen').style.display = 'flex';
});

// Microsoft auth actions
window.connectMicrosoft = () => initiateMSLogin();
window.disconnectMicrosoft = () => { disconnectMS(); renderAdmin(); toast('Microsoft disconnected', 'success'); };

// Expose for inline handlers
window.navigate = navigate;
window.openModal = openModal;
window.closeModal = closeModal;
window.currentUser = null;

// ─── Phase 2 Features ────────────────────────────────────────────────────────

Object.defineProperty(window, 'currentUser', {
  get: () => currentUser,
  configurable: true
});

// ─── Additional SVG icons ─────────────────────────────────────────────────────
function svgCart()  { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 001.98 1.61h9.72a2 2 0 001.98-1.61L23 6H6"/></svg>`; }
function svgCar()   { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 5v3h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`; }
function svgMoney() { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>`; }
function svgPlus()  { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`; }
function svgTrash() { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>`; }

// ─── FEATURE 1: Purchase Orders ───────────────────────────────────────────────
async function renderPurchaseOrders() {
  const container = $('page-pos').querySelector('.page-scroll');
  const pos = currentUser.role === 'supervisor' ? await getAllPOs() : await getPOsByUser(currentUser.id);
  const projects = await getProjects(false);

  let html = `<div class="section-header">
    <span class="section-title">Purchase Orders</span>
    <button class="btn btn-primary btn-sm" onclick="openNewPOModal()">+ New PO</button>
  </div>`;

  if (!pos.length) {
    html += `<div class="empty-state">${svgCart()}<p>No purchase orders yet</p></div>`;
  } else {
    for (const po of pos) {
      const proj = projects.find(p => p.id === po.projectId);
      let staffName = '';
      if (currentUser.role === 'supervisor') {
        const u = await getUser(po.userId);
        staffName = u ? ` • ${escHtml(u.name)}` : '';
      }
      const statusColors = { pending: 'warning', approved: 'success', rejected: 'danger' };
      html += `<div class="card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <div class="card-title">PO-${String(po.id).padStart(4,'0')}</div>
            <div class="text-sm text-muted">${escHtml(proj?.name || '—')}${staffName}</div>
            <div class="text-sm text-muted mt-4">Vendor: <strong style="color:var(--text)">${escHtml(po.vendorName)}</strong></div>
            <div class="text-sm text-muted">${escHtml(po.description || '')}</div>
            <div class="text-sm mt-4"><strong class="text-gold">$${Number(po.estimatedCost || 0).toFixed(2)}</strong> • ${po.date}</div>
          </div>
          <span class="status status-${statusColors[po.status] || 'pending'}">${po.status}</span>
        </div>
        ${currentUser.role === 'supervisor' && po.status === 'pending' ? `
        <div class="divider"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <button class="btn btn-danger btn-sm" onclick="rejectPO(${po.id})">Reject</button>
          <button class="btn btn-success btn-sm" onclick="approvePO(${po.id})">Approve</button>
        </div>` : ''}
      </div>`;
    }
  }

  container.innerHTML = html;
}

window.openNewPOModal = async () => {
  const projects = await getProjects();
  const modal = $('po-modal-sheet');
  modal.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-title">New Purchase Order</div>
    <div class="form-group">
      <label>Date</label>
      <input type="date" id="po-date" value="${new Date().toISOString().slice(0,10)}">
    </div>
    <div class="form-group">
      <label>Project</label>
      <select id="po-project">
        <option value="">Select project...</option>
        ${projects.map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label>Vendor Name</label>
      <input type="text" id="po-vendor" placeholder="Supplier / vendor name">
    </div>
    <div class="form-group">
      <label>Description</label>
      <textarea id="po-desc" placeholder="What are you purchasing?"></textarea>
    </div>
    <div class="form-group">
      <label>Estimated Cost ($)</label>
      <input type="number" id="po-cost" min="0" step="0.01" placeholder="0.00">
    </div>
    <div class="form-group">
      <label>Notes</label>
      <textarea id="po-notes" placeholder="Additional notes (optional)"></textarea>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px">
      <button class="btn btn-ghost" onclick="closeModal('po-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="submitPO()">Submit PO</button>
    </div>
  `;
  openModal('po-modal');
};

window.submitPO = async () => {
  const projectId = parseInt($('po-project').value);
  if (!projectId) { toast('Please select a project', 'error'); return; }
  const vendorName = $('po-vendor').value.trim();
  if (!vendorName) { toast('Please enter a vendor name', 'error'); return; }
  const estimatedCost = parseFloat($('po-cost').value) || 0;

  const po = {
    projectId, userId: currentUser.id,
    vendorName, description: $('po-desc').value,
    estimatedCost, date: $('po-date').value,
    notes: $('po-notes').value
  };

  const id = await createPO(po);

  // Notify supervisors
  const supervisors = await window.DR_DB.users.where('role').equals('supervisor').toArray();
  for (const sup of supervisors) {
    await window.DR_DB.notifications.add({
      toUserId: sup.id, fromUserId: currentUser.id,
      message: `${currentUser.name} submitted PO-${String(id).padStart(4,'0')} for $${estimatedCost.toFixed(2)} — ${vendorName}`,
      scheduledAt: new Date().toISOString(), read: false, type: 'po_request'
    });
  }

  closeModal('po-modal');
  toast('Purchase order submitted', 'success');
  renderPurchaseOrders();
};

window.approvePO = async (poId) => {
  const po = await window.DR_DB.purchaseOrders.get(poId);
  if (!po) return;
  await window.DR_DB.purchaseOrders.update(poId, {
    status: 'approved', approvedBy: currentUser.id, approvedAt: new Date().toISOString()
  });
  await window.DR_DB.notifications.add({
    toUserId: po.userId, fromUserId: currentUser.id,
    message: `Your PO-${String(poId).padStart(4,'0')} has been approved`,
    scheduledAt: new Date().toISOString(), read: false, type: 'po_approved'
  });
  // Generate PO PDF
  try {
    const proj = (await getProjects(false)).find(p => p.id === po.projectId);
    const poUser = await getUser(po.userId);
    const fullPO = { ...po, status: 'approved', approvedAt: new Date().toISOString() };
    const pdf = await generatePOPDF(fullPO, proj, poUser);
    pdf.save(`PO-${String(poId).padStart(4,'0')}_${po.vendorName?.replace(/\s+/g,'_')}.pdf`);
  } catch(e) { console.error('PO PDF error:', e); }
  toast('PO approved', 'success');
  renderPurchaseOrders();
};

window.rejectPO = async (poId) => {
  const modal = $('po-reject-modal-sheet');
  modal.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-title">Reject PO-${String(poId).padStart(4,'0')}</div>
    <div class="form-group">
      <label>Reason for Rejection</label>
      <textarea id="po-reject-reason" placeholder="Explain why this PO is being rejected..."></textarea>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px">
      <button class="btn btn-ghost" onclick="closeModal('po-reject-modal')">Cancel</button>
      <button class="btn btn-danger" onclick="confirmRejectPO(${poId})">Reject PO</button>
    </div>
  `;
  openModal('po-reject-modal');
};

window.confirmRejectPO = async (poId) => {
  const reason = $('po-reject-reason').value.trim();
  const po = await window.DR_DB.purchaseOrders.get(poId);
  if (!po) return;
  await window.DR_DB.purchaseOrders.update(poId, {
    status: 'rejected', rejectedBy: currentUser.id,
    rejectedAt: new Date().toISOString(), rejectionReason: reason
  });
  await window.DR_DB.notifications.add({
    toUserId: po.userId, fromUserId: currentUser.id,
    message: `PO-${String(poId).padStart(4,'0')} was rejected. ${reason}`,
    scheduledAt: new Date().toISOString(), read: false, type: 'po_rejected'
  });
  closeModal('po-reject-modal');
  toast('PO rejected', 'error');
  renderPurchaseOrders();
};

// ─── FEATURE 2: Mileage Log ───────────────────────────────────────────────────
async function renderMileage() {
  const container = $('page-mileage').querySelector('.page-scroll');
  const logs = currentUser.role === 'supervisor' ? await getAllMileage() : await getMileageByUser(currentUser.id);
  const projects = await getProjects(false);

  let html = `<div class="section-header">
    <span class="section-title">Mileage Log</span>
    <button class="btn btn-primary btn-sm" onclick="openMileageModal()">+ Log Trip</button>
  </div>`;

  if (!logs.length) {
    html += `<div class="empty-state">${svgCar()}<p>No mileage entries yet</p></div>`;
  } else {
    for (const log of logs) {
      const proj = projects.find(p => p.id === log.projectId);
      let staffName = '';
      if (currentUser.role === 'supervisor') {
        const u = await getUser(log.userId);
        staffName = u ? `<div class="text-sm text-muted">${escHtml(u.name)}</div>` : '';
      }
      html += `<div class="card">
        <div class="card-title">${log.date} — ${Number(log.totalKm || 0).toFixed(1)} km</div>
        ${staffName}
        <div class="text-sm text-muted">Project: ${escHtml(proj?.name || '—')}</div>
        <div class="text-sm text-muted">Purpose: ${escHtml(log.purpose || '—')}</div>
        <div class="text-sm text-muted mt-4">
          ${escHtml(log.startLocation || '—')} → ${escHtml(log.endLocation || '—')}
        </div>
        ${log.startKm && log.endKm ? `<div class="text-sm text-muted">Odometer: ${log.startKm} → ${log.endKm} km</div>` : ''}
        ${log.notes ? `<div class="text-sm text-muted mt-4">${escHtml(log.notes)}</div>` : ''}
      </div>`;
    }
  }

  container.innerHTML = html;
}

window.openMileageModal = async () => {
  const projects = await getProjects();
  const modal = $('mileage-modal-sheet');
  modal.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-title">Log Trip</div>
    <div class="form-group">
      <label>Date</label>
      <input type="date" id="mil-date" value="${new Date().toISOString().slice(0,10)}">
    </div>
    <div class="form-group">
      <label>Project</label>
      <select id="mil-project">
        <option value="">Select project...</option>
        ${projects.map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label>Purpose / Description</label>
      <input type="text" id="mil-purpose" placeholder="e.g. Site visit — Highway 40">
    </div>
    <div class="form-group">
      <label>Start Location</label>
      <div style="display:flex;gap:8px">
        <input type="text" id="mil-start" placeholder="Start address or coords" style="flex:1">
        <button class="btn btn-sm btn-ghost" onclick="gpsToField('mil-start')">📍 GPS</button>
      </div>
    </div>
    <div class="form-group">
      <label>End Location</label>
      <div style="display:flex;gap:8px">
        <input type="text" id="mil-end" placeholder="End address or coords" style="flex:1">
        <button class="btn btn-sm btn-ghost" onclick="gpsToField('mil-end')">📍 GPS</button>
      </div>
    </div>
    <div class="grid-2">
      <div class="form-group">
        <label>Start KM (odometer)</label>
        <input type="number" id="mil-start-km" min="0" step="1" placeholder="0" oninput="calcMileageTotal()">
      </div>
      <div class="form-group">
        <label>End KM (odometer)</label>
        <input type="number" id="mil-end-km" min="0" step="1" placeholder="0" oninput="calcMileageTotal()">
      </div>
    </div>
    <div class="form-group">
      <label>Total KM</label>
      <input type="number" id="mil-total-km" min="0" step="0.1" placeholder="Auto-calculated or enter manually">
    </div>
    <div class="form-group">
      <label>Notes</label>
      <textarea id="mil-notes" placeholder="Optional notes..."></textarea>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px">
      <button class="btn btn-ghost" onclick="closeModal('mileage-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="saveMileageLog()">Save</button>
    </div>
  `;
  openModal('mileage-modal');
};

window.calcMileageTotal = () => {
  const s = parseFloat($('mil-start-km').value) || 0;
  const e = parseFloat($('mil-end-km').value) || 0;
  if (e > s) $('mil-total-km').value = (e - s).toFixed(1);
};

window.gpsToField = (fieldId) => {
  if (!navigator.geolocation) { toast('GPS not available', 'error'); return; }
  toast('Getting location...', 'info', 1500);
  navigator.geolocation.getCurrentPosition(
    pos => {
      const coords = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
      const field = $(fieldId);
      if (field) field.value = coords;
    },
    () => toast('Could not get GPS location', 'error')
  );
};

window.saveMileageLog = async () => {
  const purpose = $('mil-purpose').value.trim();
  if (!purpose) { toast('Please enter a purpose', 'error'); return; }

  const startKm  = parseFloat($('mil-start-km').value) || null;
  const endKm    = parseFloat($('mil-end-km').value) || null;
  let   totalKm  = parseFloat($('mil-total-km').value) || null;
  if (!totalKm && startKm !== null && endKm !== null && endKm > startKm) {
    totalKm = endKm - startKm;
  }
  if (!totalKm) { toast('Please enter total km or odometer readings', 'error'); return; }

  await createMileageLog({
    userId: currentUser.id,
    projectId: parseInt($('mil-project').value) || null,
    date: $('mil-date').value,
    purpose,
    startLocation: $('mil-start').value,
    endLocation:   $('mil-end').value,
    startKm, endKm, totalKm,
    notes: $('mil-notes').value
  });

  closeModal('mileage-modal');
  toast('Mileage entry saved', 'success');
  renderMileage();
};

// ─── FEATURE 3: SIMOPS Safety Form ───────────────────────────────────────────
window.openSIMOPSForm = async () => {
  const projects = await getProjects();
  const modal = $('simops-modal-sheet');
  modal.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-title">SIMOPS Safety Form</div>
    <div class="text-sm text-muted mb-8">Simultaneous Operations Assessment</div>

    <div class="section-header mt-8"><span class="section-title">Header</span></div>
    <div class="form-group"><label>Date</label><input type="date" id="sim-date" value="${new Date().toISOString().slice(0,10)}"></div>
    <div class="form-group"><label>Location</label><input type="text" id="sim-location" placeholder="Site location"></div>
    <div class="form-group"><label>Project</label>
      <select id="sim-project">
        <option value="">Select project...</option>
        ${projects.map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('')}
      </select>
    </div>
    <div class="form-group"><label>Work Description</label><textarea id="sim-work-desc" placeholder="Describe the scope of work"></textarea></div>
    <div class="form-group"><label>Supervising Foreman</label><input type="text" id="sim-supervisor" value="${escHtml(currentUser.name)}"></div>

    <div class="section-header mt-12"><span class="section-title">Section 1 — Operations Inventory</span></div>
    <div class="text-sm text-muted mb-8">List all simultaneous operations on site</div>
    <div id="sim-ops-rows"></div>
    <button class="btn btn-outline btn-full mt-8" onclick="addSIMOPSRow()">+ Add Operation</button>

    <div class="section-header mt-12"><span class="section-title">Section 2 — Hazard Identification</span></div>
    <div class="card">
      ${['Pressurized lines', 'Energized equipment', 'Crane / lifting ops', 'Excavation',
         'Hot work', 'Confined space', 'Traffic', 'Other'].map((h, i) =>
        `<div class="toggle-row"><span class="toggle-label">${h}</span><button class="toggle" id="sim-haz-${i}" onclick="toggleBtn(this,null)"></button></div>`
      ).join('')}
    </div>

    <div class="section-header mt-12"><span class="section-title">Section 3 — Communication Protocol</span></div>
    <div class="form-group"><label>Radio Channel</label><input type="text" id="sim-radio" placeholder="e.g. Channel 4"></div>
    <div class="form-group"><label>Check-in Frequency</label>
      <select id="sim-checkin">
        <option value="15min">Every 15 minutes</option>
        <option value="30min">Every 30 minutes</option>
        <option value="1hr">Every 1 hour</option>
      </select>
    </div>
    <div class="form-group"><label>Emergency Contact</label><input type="text" id="sim-emergency" placeholder="Name and phone number"></div>
    <div class="form-group"><label>Muster Point</label><input type="text" id="sim-muster" placeholder="Emergency assembly location"></div>

    <div class="section-header mt-12"><span class="section-title">Section 4 — Personnel Sign-off</span></div>
    <div id="sim-signoff-rows"></div>
    <button class="btn btn-outline btn-full mt-8" onclick="addSIMOPSSignoff()">+ Add Person</button>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px">
      <button class="btn btn-ghost" onclick="closeModal('simops-modal')">Cancel</button>
      <button class="btn btn-success" onclick="submitSIMOPS()">Submit Form</button>
    </div>
  `;

  // Seed one op row and one signoff
  addSIMOPSRow();
  addSIMOPSSignoff();
  openModal('simops-modal');
};

window.addSIMOPSRow = () => {
  const container = $('sim-ops-rows');
  const row = el('div', 'card mt-8');
  row.innerHTML = `
    <div class="grid-2">
      <div class="form-group"><label>Operation</label><input type="text" class="sim-op-name" placeholder="e.g. Pipeline pressure test"></div>
      <div class="form-group"><label>Company</label><input type="text" class="sim-op-company" placeholder="Company name"></div>
    </div>
    <div class="grid-2">
      <div class="form-group"><label>Supervisor</label><input type="text" class="sim-op-sup" placeholder="Supervisor name"></div>
      <div class="form-group"><label>Phone</label><input type="tel" class="sim-op-phone" placeholder="Phone number"></div>
    </div>
    <button onclick="this.closest('.card').remove()" class="btn btn-danger btn-sm">Remove</button>
  `;
  container.appendChild(row);
};

let simSigCtx = [];
window.addSIMOPSSignoff = () => {
  const container = $('sim-signoff-rows');
  const idx = container.children.length;
  const row = el('div', 'card mt-8');
  row.innerHTML = `
    <div class="form-group"><label>Name</label><input type="text" class="sim-person-name" placeholder="Full name"></div>
    <div class="form-group"><label>Signature</label>
      <div class="sig-canvas-wrap">
        <canvas class="sim-sig-canvas" id="sim-sig-${idx}" width="500" height="120"></canvas>
        <button class="sig-clear" onclick="clearSimSig(${idx})">Clear</button>
      </div>
    </div>
  `;
  container.appendChild(row);
  setTimeout(() => setupGenericSigCanvas(`sim-sig-${idx}`), 50);
};

window.clearSimSig = (idx) => {
  const canvas = $(`sim-sig-${idx}`);
  if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
};

function setupGenericSigCanvas(canvasId) {
  const canvas = $(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#1a1a2e';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  let drawing = false;

  function pos(e) {
    const r = canvas.getBoundingClientRect();
    const scale = canvas.width / r.width;
    const src = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - r.left) * scale, y: (src.clientY - r.top) * scale };
  }

  canvas.addEventListener('mousedown',  e => { drawing = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); });
  canvas.addEventListener('mousemove',  e => { if (!drawing) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); });
  canvas.addEventListener('mouseup',    () => drawing = false);
  canvas.addEventListener('touchstart', e => { e.preventDefault(); drawing = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); }, { passive: false });
  canvas.addEventListener('touchmove',  e => { e.preventDefault(); if (!drawing) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); }, { passive: false });
  canvas.addEventListener('touchend',   () => drawing = false);
}

window.submitSIMOPS = async () => {
  const location = $('sim-location').value.trim();
  if (!location) { toast('Please enter a location', 'error'); return; }

  // Gather ops
  const ops = [];
  $('sim-ops-rows').querySelectorAll('.card').forEach(row => {
    ops.push({
      name:    row.querySelector('.sim-op-name').value,
      company: row.querySelector('.sim-op-company').value,
      supervisor: row.querySelector('.sim-op-sup').value,
      phone:   row.querySelector('.sim-op-phone').value
    });
  });

  // Gather hazards
  const hazardLabels = ['Pressurized lines', 'Energized equipment', 'Crane / lifting ops', 'Excavation',
                        'Hot work', 'Confined space', 'Traffic', 'Other'];
  const hazards = hazardLabels.filter((_, i) => $(`sim-haz-${i}`)?.classList.contains('on'));

  // Gather sign-offs
  const signoffs = [];
  $('sim-signoff-rows').querySelectorAll('.card').forEach((row, i) => {
    const name = row.querySelector('.sim-person-name').value;
    const canvas = row.querySelector('.sim-sig-canvas');
    const sig = canvas ? canvas.toDataURL() : null;
    signoffs.push({ name, signature: sig });
  });

  const form = {
    userId: currentUser.id, type: 'simops',
    date: $('sim-date').value,
    projectId: parseInt($('sim-project').value) || null,
    location, workDescription: $('sim-work-desc').value,
    supervisor: $('sim-supervisor').value,
    operations: ops, hazards,
    radioChannel: $('sim-radio').value,
    checkinFrequency: $('sim-checkin').value,
    emergencyContact: $('sim-emergency').value,
    musterPoint: $('sim-muster').value,
    signoffs,
    status: 'submitted', syncStatus: 'pending',
    createdAt: new Date().toISOString()
  };

  await window.DR_DB.safetyForms.add(form);
  try {
    const proj = (await getProjects(false)).find(p => p.id === form.projectId);
    const pdf = await generateSIMOPSPDF(form, proj);
    pdf.save(`SIMOPS_${form.date}_${currentUser.name.replace(/\s+/g,'_')}.pdf`);
  } catch(e) { console.error('SIMOPS PDF error:', e); }
  closeModal('simops-modal');
  toast('SIMOPS form submitted', 'success');
  renderSafetyPage();
};

// ─── FEATURE 4: Environmental Safety Form ────────────────────────────────────
window.openEnvironmentalForm = async () => {
  const projects = await getProjects();
  const modal = $('env-modal-sheet');

  const envHazards = [
    'Wetlands / water body nearby', 'Wildlife habitat', 'Contaminated soil',
    'Spill risk', 'Erosion potential', 'Protected vegetation',
    'Cultural / archaeological sites', 'Other'
  ];

  modal.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-title">Environmental Safety Form</div>

    <div class="section-header mt-8"><span class="section-title">Header</span></div>
    <div class="form-group"><label>Date</label><input type="date" id="env-date" value="${new Date().toISOString().slice(0,10)}"></div>
    <div class="form-group"><label>Location</label><input type="text" id="env-location" placeholder="Site location"></div>
    <div class="form-group"><label>Project</label>
      <select id="env-project">
        <option value="">Select project...</option>
        ${projects.map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('')}
      </select>
    </div>
    <div class="form-group"><label>Weather Conditions</label><input type="text" id="env-weather" placeholder="e.g. Clear, 15°C, wind NW"></div>

    <div class="section-header mt-12"><span class="section-title">Section 1 — Environmental Hazards</span></div>
    <div class="card" id="env-hazard-checks">
      ${envHazards.map((h, i) =>
        `<div class="toggle-row"><span class="toggle-label">${h}</span><button class="toggle" id="env-haz-${i}" onclick="toggleBtn(this,null);updateEnvMitigations()"></button></div>`
      ).join('')}
    </div>

    <div class="section-header mt-12"><span class="section-title">Section 2 — Mitigation Measures</span></div>
    <div id="env-mitigations"><p class="text-muted text-sm">Select hazards above to add mitigations.</p></div>

    <div class="section-header mt-12"><span class="section-title">Section 3 — Spill Kit Inventory</span></div>
    <div class="card">
      ${['Absorbent pads', 'Booms', 'Nitrile gloves', 'Waste bags', 'Eye wash station'].map((item, i) =>
        `<div class="toggle-row"><span class="toggle-label">${item}</span><button class="toggle" id="env-spill-${i}" onclick="toggleBtn(this,null)"></button></div>`
      ).join('')}
    </div>

    <div class="section-header mt-12"><span class="section-title">Section 4 — Waste Management</span></div>
    <div id="env-waste-rows"></div>
    <button class="btn btn-outline btn-full mt-8" onclick="addEnvWasteRow()">+ Add Waste Type</button>

    <div class="section-header mt-12"><span class="section-title">Section 5 — Sign-off</span></div>
    <div class="form-group"><label>Completed By</label><input type="text" id="env-signoff-name" value="${escHtml(currentUser.name)}"></div>
    <div class="form-group"><label>Sign-off Date</label><input type="date" id="env-signoff-date" value="${new Date().toISOString().slice(0,10)}"></div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px">
      <button class="btn btn-ghost" onclick="closeModal('env-modal')">Cancel</button>
      <button class="btn btn-success" onclick="submitEnvironmental()">Submit Form</button>
    </div>
  `;

  addEnvWasteRow();
  openModal('env-modal');
};

const ENV_HAZARDS = [
  'Wetlands / water body nearby', 'Wildlife habitat', 'Contaminated soil',
  'Spill risk', 'Erosion potential', 'Protected vegetation',
  'Cultural / archaeological sites', 'Other'
];

window.updateEnvMitigations = () => {
  const container = $('env-mitigations');
  const active = ENV_HAZARDS.filter((_, i) => $(`env-haz-${i}`)?.classList.contains('on'));
  if (!active.length) {
    container.innerHTML = '<p class="text-muted text-sm">Select hazards above to add mitigations.</p>';
    return;
  }
  container.innerHTML = active.map(h => `
    <div class="form-group">
      <label>${escHtml(h)}</label>
      <textarea class="env-mitigation-field" data-hazard="${escHtml(h)}" placeholder="Mitigation measures for: ${escHtml(h)}"></textarea>
    </div>`).join('');
};

window.addEnvWasteRow = () => {
  const container = $('env-waste-rows');
  const row = el('div', 'card mt-8');
  row.innerHTML = `
    <div class="grid-2">
      <div class="form-group"><label>Waste Type</label><input type="text" class="env-waste-type" placeholder="e.g. Contaminated soil"></div>
      <div class="form-group"><label>Disposal Method</label><input type="text" class="env-waste-disposal" placeholder="e.g. Licensed contractor"></div>
    </div>
    <button onclick="this.closest('.card').remove()" class="btn btn-danger btn-sm">Remove</button>
  `;
  container.appendChild(row);
};

window.submitEnvironmental = async () => {
  const location = $('env-location').value.trim();
  if (!location) { toast('Please enter a location', 'error'); return; }

  const spillLabels = ['Absorbent pads', 'Booms', 'Nitrile gloves', 'Waste bags', 'Eye wash station'];
  const spillKit = spillLabels.filter((_, i) => $(`env-spill-${i}`)?.classList.contains('on'));

  const hazards = ENV_HAZARDS.filter((_, i) => $(`env-haz-${i}`)?.classList.contains('on'));

  const mitigations = {};
  document.querySelectorAll('.env-mitigation-field').forEach(f => {
    mitigations[f.dataset.hazard] = f.value;
  });

  const waste = [];
  $('env-waste-rows').querySelectorAll('.card').forEach(row => {
    waste.push({
      type:     row.querySelector('.env-waste-type').value,
      disposal: row.querySelector('.env-waste-disposal').value
    });
  });

  const form = {
    userId: currentUser.id, type: 'environmental',
    date: $('env-date').value,
    projectId: parseInt($('env-project').value) || null,
    location, weather: $('env-weather').value,
    hazards, mitigations, spillKit, waste,
    signoffName: $('env-signoff-name').value,
    signoffDate: $('env-signoff-date').value,
    status: 'submitted', syncStatus: 'pending',
    createdAt: new Date().toISOString()
  };

  await window.DR_DB.safetyForms.add(form);
  try {
    const proj = (await getProjects(false)).find(p => p.id === form.projectId);
    const pdf = await generateEnvironmentalPDF(form, proj);
    pdf.save(`Environmental_${form.date}_${currentUser.name.replace(/\s+/g,'_')}.pdf`);
  } catch(e) { console.error('Environmental PDF error:', e); }
  closeModal('env-modal');
  toast('Environmental form submitted', 'success');
  renderSafetyPage();
};

// ─── FEATURE 5: Weekly Payroll Summary ────────────────────────────────────────
async function renderPayroll() {
  if (currentUser.role !== 'supervisor') { navigate('home'); return; }
  const container = $('page-payroll').querySelector('.page-scroll');

  // Determine current week (Mon–Sun)
  const today = new Date();
  const dayOfWeek = (today.getDay() + 6) % 7; // 0=Mon, 6=Sun
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - dayOfWeek);
  const weekEnd   = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const weekStartStr = weekStart.toISOString().slice(0,10);
  const weekEndStr   = weekEnd.toISOString().slice(0,10);

  let html = `<div class="section-header">
    <span class="section-title">Payroll Summary</span>
  </div>
  <div class="card">
    <div class="form-group">
      <label>Week Starting (Monday)</label>
      <input type="date" id="payroll-week-start" value="${weekStartStr}" onchange="refreshPayroll()">
    </div>
  </div>
  <div id="payroll-content"></div>`;

  container.innerHTML = html;
  await refreshPayroll();
}

window.refreshPayroll = async () => {
  const weekStartInput = $('payroll-week-start');
  if (!weekStartInput) return;

  const startDate = new Date(weekStartInput.value);
  // Snap to Monday
  const dayOfWeek = (startDate.getDay() + 6) % 7;
  startDate.setDate(startDate.getDate() - dayOfWeek);
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 6);

  const startStr = startDate.toISOString().slice(0,10);
  const endStr   = endDate.toISOString().slice(0,10);

  // Get all approved work orders in this week
  const allWOs = await window.DR_DB.lems
    .where('status').equals('approved')
    .filter(w => w.date >= startStr && w.date <= endStr)
    .toArray();

  const users = await getAllUsers();
  const payContent = $('payroll-content');
  if (!payContent) return;

  if (!allWOs.length) {
    payContent.innerHTML = `<div class="card mt-8"><p class="text-muted text-sm">No approved work orders for the week of ${startStr} to ${endStr}.</p></div>`;
    return;
  }

  // Classify labour rows by pay item type keywords
  function classifyHours(labourItems) {
    const cats = { survey: 0, draft: 0, office: 0, travel: 0, other: 0 };
    (labourItems || []).forEach(item => {
      const n = (item.name || '').toLowerCase();
      if (n.includes('survey') || n.includes('locate') || n.includes('construction')) cats.survey += item.hours;
      else if (n.includes('draft') || n.includes('cad')) cats.draft += item.hours;
      else if (n.includes('office') || n.includes('coordinator') || n.includes('manager')) cats.office += item.hours;
      else if (n.includes('travel')) cats.travel += item.hours;
      else cats.other += item.hours;
    });
    return cats;
  }

  // Group by user
  const byUser = {};
  for (const wo of allWOs) {
    if (!byUser[wo.userId]) byUser[wo.userId] = { wos: [], cats: { survey: 0, draft: 0, office: 0, travel: 0, other: 0 } };
    byUser[wo.userId].wos.push(wo);
    const cats = classifyHours(wo.labourItems);
    Object.keys(cats).forEach(k => byUser[wo.userId].cats[k] += cats[k]);
  }

  let tableHtml = `
  <div class="section-header mt-8"><span class="section-title">Week: ${startStr} — ${endStr}</span></div>
  <div style="overflow-x:auto">
  <table style="width:100%;border-collapse:collapse;font-size:0.8rem">
    <thead>
      <tr style="background:var(--surface-2)">
        <th style="text-align:left;padding:8px 6px">Employee</th>
        <th style="padding:6px;text-align:center">Survey</th>
        <th style="padding:6px;text-align:center">Draft</th>
        <th style="padding:6px;text-align:center">Office</th>
        <th style="padding:6px;text-align:center">Travel</th>
        <th style="padding:6px;text-align:center">Other</th>
        <th style="padding:6px;text-align:center;color:var(--gold)">Total</th>
      </tr>
    </thead>
    <tbody>`;

  const totals = { survey: 0, draft: 0, office: 0, travel: 0, other: 0, grand: 0 };

  for (const [userId, data] of Object.entries(byUser)) {
    const u = users.find(u => u.id === parseInt(userId));
    const c = data.cats;
    const total = c.survey + c.draft + c.office + c.travel + c.other;
    totals.survey += c.survey; totals.draft += c.draft; totals.office += c.office;
    totals.travel += c.travel; totals.other += c.other; totals.grand += total;

    tableHtml += `<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:8px 6px;font-weight:600">${escHtml(u?.name || 'Unknown')}</td>
      <td style="padding:6px;text-align:center">${c.survey || '—'}</td>
      <td style="padding:6px;text-align:center">${c.draft || '—'}</td>
      <td style="padding:6px;text-align:center">${c.office || '—'}</td>
      <td style="padding:6px;text-align:center">${c.travel || '—'}</td>
      <td style="padding:6px;text-align:center">${c.other || '—'}</td>
      <td style="padding:6px;text-align:center;color:var(--gold);font-weight:700">${total}</td>
    </tr>`;
  }

  tableHtml += `<tr style="background:var(--surface-2);font-weight:700">
    <td style="padding:8px 6px">TOTALS</td>
    <td style="padding:6px;text-align:center">${totals.survey}</td>
    <td style="padding:6px;text-align:center">${totals.draft}</td>
    <td style="padding:6px;text-align:center">${totals.office}</td>
    <td style="padding:6px;text-align:center">${totals.travel}</td>
    <td style="padding:6px;text-align:center">${totals.other}</td>
    <td style="padding:6px;text-align:center;color:var(--gold)">${totals.grand}</td>
  </tr>
    </tbody>
  </table>
  </div>
  <button class="btn btn-outline btn-full mt-12" onclick="generatePayrollPDF('${startStr}','${endStr}')">📄 Export PDF</button>`;

  payContent.innerHTML = tableHtml;
};

window.generatePayrollPDF = async (startStr, endStr) => {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  // Header
  doc.setFillColor(26, 26, 46);
  doc.rect(0, 0, 210, 28, 'F');
  doc.setFillColor(200, 169, 110);
  doc.rect(0, 28, 210, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(200, 169, 110);
  doc.text('DÙN RIGHT', 14, 17);
  doc.setFontSize(10);
  doc.setTextColor(200, 200, 200);
  doc.text('FIELD SERVICES', 14, 23);
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text('WEEKLY PAYROLL SUMMARY', 196, 17, { align: 'right' });
  doc.setTextColor(0, 0, 0);

  let y = 38;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(80, 80, 80);
  doc.text(`Pay Period: ${startStr} to ${endStr}`, 14, y);
  doc.text(`Generated: ${new Date().toISOString().slice(0,10)}  |  By: ${currentUser.name}`, 14, y + 6);
  y += 16;

  const allWOs = await window.DR_DB.lems
    .where('status').equals('approved')
    .filter(w => w.date >= startStr && w.date <= endStr)
    .toArray();

  const users = await getAllUsers();

  function classifyHours(labourItems) {
    const cats = { survey: 0, draft: 0, office: 0, travel: 0, other: 0 };
    (labourItems || []).forEach(item => {
      const n = (item.name || '').toLowerCase();
      if (n.includes('survey') || n.includes('locate') || n.includes('construction')) cats.survey += item.hours;
      else if (n.includes('draft') || n.includes('cad')) cats.draft += item.hours;
      else if (n.includes('office') || n.includes('coordinator') || n.includes('manager')) cats.office += item.hours;
      else if (n.includes('travel')) cats.travel += item.hours;
      else cats.other += item.hours;
    });
    return cats;
  }

  const byUser = {};
  for (const wo of allWOs) {
    if (!byUser[wo.userId]) byUser[wo.userId] = { cats: { survey: 0, draft: 0, office: 0, travel: 0, other: 0 } };
    const cats = classifyHours(wo.labourItems);
    Object.keys(cats).forEach(k => byUser[wo.userId].cats[k] += cats[k]);
  }

  // Table header
  doc.setFillColor(26, 26, 46);
  doc.rect(12, y, 186, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  const cols = [16, 70, 95, 115, 135, 155, 175, 196];
  const headers = ['Employee', 'Survey', 'Draft', 'Office', 'Travel', 'Other', 'Total'];
  headers.forEach((h, i) => doc.text(h, i === 6 ? cols[i+1] : cols[i], y + 5.5, i === 6 ? { align: 'right' } : {}));
  y += 8;

  const totals = { survey: 0, draft: 0, office: 0, travel: 0, other: 0, grand: 0 };
  doc.setFont('helvetica', 'normal');
  let rowIdx = 0;

  for (const [userId, data] of Object.entries(byUser)) {
    const u = users.find(u => u.id === parseInt(userId));
    const c = data.cats;
    const total = c.survey + c.draft + c.office + c.travel + c.other;
    totals.survey += c.survey; totals.draft += c.draft; totals.office += c.office;
    totals.travel += c.travel; totals.other += c.other; totals.grand += total;

    if (rowIdx % 2 === 0) { doc.setFillColor(250, 250, 250); doc.rect(12, y, 186, 7, 'F'); }
    doc.setTextColor(40, 40, 40);
    doc.text(u?.name || 'Unknown', 16, y + 5);
    [c.survey, c.draft, c.office, c.travel, c.other].forEach((v, i) => {
      doc.text(v ? String(v) : '—', cols[i+1], y + 5);
    });
    doc.setTextColor(200, 169, 110);
    doc.text(String(total), cols[7], y + 5, { align: 'right' });
    doc.setTextColor(40, 40, 40);
    y += 7; rowIdx++;
  }

  // Totals row
  doc.setFillColor(200, 169, 110);
  doc.rect(12, y, 186, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(26, 26, 46);
  doc.text('TOTALS', 16, y + 5);
  [totals.survey, totals.draft, totals.office, totals.travel, totals.other].forEach((v, i) => {
    doc.text(String(v), cols[i+1], y + 5);
  });
  doc.text(String(totals.grand), cols[7], y + 5, { align: 'right' });

  // Footer
  doc.setFillColor(200, 169, 110);
  doc.rect(0, 288, 210, 0.5, 'F');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text('DÙN RIGHT — Confidential Payroll Document', 14, 294);
  doc.text('Page 1 of 1', 196, 294, { align: 'right' });

  doc.save(`Payroll_${startStr}_to_${endStr}.pdf`);
  toast('Payroll PDF downloaded', 'success');
};

// ─── FEATURE 6: Client Portal ─────────────────────────────────────────────────
async function renderClientHome() {
  const container = $('page-home');

  // Get the client's project
  const projId = currentUser.projectId;
  const projects = await getProjects(false);
  const proj = projects.find(p => p.id === projId);

  // Get approved work orders for this project
  let wos = [];
  if (projId) {
    wos = await window.DR_DB.lems
      .where('projectId').equals(projId)
      .filter(w => w.status === 'approved')
      .toArray();
    wos.sort((a, b) => b.date.localeCompare(a.date));
  }

  // Get invoices for this project
  let invoices = [];
  if (projId) {
    invoices = await window.DR_DB.invoices
      .where('projectId').equals(projId)
      .filter(inv => inv.status === 'sent' || inv.status === 'paid')
      .toArray();
    invoices.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }

  let html = `<div class="section-header">
    <span class="section-title">Welcome, ${escHtml(currentUser.name.split(' ')[0])}</span>
  </div>`;

  if (!proj) {
    html += `<div class="card"><p class="text-muted text-sm">No project assigned to your account. Please contact your project manager.</p></div>`;
    container.querySelector('.page-scroll').innerHTML = html;
    return;
  }

  html += `<div class="card" style="border-color:var(--gold)">
    <div class="card-title">${escHtml(proj.name)}</div>
    <div class="text-sm text-muted">Client: ${escHtml(proj.clientName || currentUser.name)}</div>
    <div class="text-sm text-muted">Status: <span class="status status-${proj.status}">${proj.status}</span></div>
  </div>`;

  // Work Orders / LEMs
  html += `<div class="section-header mt-12"><span class="section-title">Approved Timesheets (${wos.length})</span></div>`;
  if (!wos.length) {
    html += `<div class="card"><p class="text-muted text-sm">No approved timesheets yet.</p></div>`;
  } else {
    for (const wo of wos) {
      const u = await getUser(wo.userId);
      const totalHrs = (wo.labourItems || []).reduce((s, i) => s + i.hours, 0);
      html += `<div class="card">
        <div class="card-title">WO-${String(wo.id).padStart(4,'0')} — ${wo.date}</div>
        <div class="text-sm text-muted">Staff: ${escHtml(u?.name || '—')}</div>
        <div class="text-sm text-muted">Labour: ${(wo.labourItems || []).map(l => `${l.name} × ${l.hours}h`).join(', ')}</div>
        <div class="text-sm mt-4"><strong class="text-gold">${totalHrs} hrs total</strong></div>
      </div>`;
    }
  }

  // Invoices
  html += `<div class="section-header mt-12"><span class="section-title">Invoices (${invoices.length})</span></div>`;
  if (!invoices.length) {
    html += `<div class="card"><p class="text-muted text-sm">No invoices yet.</p></div>`;
  } else {
    for (const inv of invoices) {
      const signedBadge = inv.signatureDataUrl
        ? `<div class="text-sm" style="color:var(--success)">✅ Signed ${inv.signedAt?.slice(0,10)}</div>`
        : `<button class="btn btn-outline btn-sm mt-8" onclick="openSignaturePad(${inv.id})">✍️ Sign Invoice</button>`;
      html += `<div class="card">
        <div class="card-title">INV-${String(inv.id).padStart(4,'0')}</div>
        <div class="text-sm text-muted">$${Number(inv.total || 0).toFixed(2)} + GST • ${inv.createdAt?.slice(0,10)}</div>
        <div class="text-sm text-muted">Status: <span class="status status-${inv.status}">${inv.status}</span></div>
        ${signedBadge}
      </div>`;
    }
  }

  container.querySelector('.page-scroll').innerHTML = html;
}

window.openAddClientModal = async () => {
  const projects = await getProjects(false);
  const modal = $('client-modal-sheet');
  modal.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-title">Add Client Portal User</div>
    <div class="form-group"><label>Company Name</label><input type="text" id="client-company" placeholder="Client company name"></div>
    <div class="form-group"><label>Contact Name</label><input type="text" id="client-name" placeholder="Contact full name"></div>
    <div class="form-group"><label>Username</label><input type="text" id="client-username" placeholder="login username"></div>
    <div class="form-group"><label>Password</label><input type="password" id="client-pass" placeholder="Temporary password"></div>
    <div class="form-group"><label>Project Access</label>
      <select id="client-project">
        <option value="">Select project...</option>
        ${projects.map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('')}
      </select>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px">
      <button class="btn btn-ghost" onclick="closeModal('client-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="addClient()">Create Client</button>
    </div>
  `;
  openModal('client-modal');
};

window.addClient = async () => {
  const name     = $('client-name').value.trim();
  const username = $('client-username').value.trim().toLowerCase();
  const company  = $('client-company').value.trim();
  if (!name || !username) { toast('Name and username required', 'error'); return; }
  const exists = await window.DR_DB.users.where('username').equals(username).first();
  if (exists) { toast('Username already taken', 'error'); return; }
  const projectId = parseInt($('client-project').value) || null;
  await window.DR_DB.users.add({
    name: name + (company ? ` (${company})` : ''),
    username, password: $('client-pass').value,
    email: '', role: 'client', active: true, projectId
  });
  closeModal('client-modal');
  toast('Client portal user created', 'success');
  renderStaff();
};

// ─── FEATURE 7: Photo Annotation ─────────────────────────────────────────────
let annotationResolve = null;

window.openPhotoAnnotation = (photoDataUrl) => {
  return new Promise(resolve => {
    annotationResolve = resolve;
    const modal = $('photo-annotate-modal-sheet');
    modal.innerHTML = `
      <div style="background:var(--surface);padding:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;border-bottom:1px solid var(--border)">
        <button class="btn btn-sm btn-primary" id="ann-tool-draw" onclick="setAnnotateTool('draw')">✏️ Draw</button>
        <button class="btn btn-sm btn-ghost" id="ann-tool-arrow" onclick="setAnnotateTool('arrow')">➡️ Arrow</button>
        <button class="btn btn-sm btn-ghost" id="ann-tool-text" onclick="setAnnotateTool('text')">T Text</button>
        <div style="display:flex;gap:4px">
          ${['#e53935','#FFD600','#ffffff','#111111'].map(c =>
            `<button onclick="setAnnotateColor('${c}')" style="width:24px;height:24px;border-radius:50%;background:${c};border:2px solid var(--border);cursor:pointer"></button>`
          ).join('')}
        </div>
        <button class="btn btn-sm btn-ghost" onclick="annotateUndo()">↩ Undo</button>
        <button class="btn btn-sm btn-success" onclick="annotationDone()" style="margin-left:auto">Done ✓</button>
      </div>
      <div style="flex:1;position:relative;overflow:hidden;background:#000">
        <canvas id="ann-canvas" style="width:100%;height:100%;display:block;touch-action:none"></canvas>
      </div>
    `;
    $('photo-annotate-modal-overlay').classList.add('open');
    setTimeout(() => setupAnnotationCanvas(photoDataUrl), 50);
  });
};

let annState = {
  tool: 'draw', color: '#e53935', drawing: false,
  history: [], img: null, ctx: null, canvas: null,
  startX: 0, startY: 0, textMode: false
};

function setupAnnotationCanvas(dataUrl) {
  const canvas = $('ann-canvas');
  if (!canvas) return;
  const parent = canvas.parentElement;
  canvas.width  = parent.offsetWidth  || 800;
  canvas.height = parent.offsetHeight || 600;
  const ctx = canvas.getContext('2d');
  annState.canvas = canvas;
  annState.ctx = ctx;

  const img = new Image();
  img.onload = () => {
    annState.img = img;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    annState.history = [ctx.getImageData(0, 0, canvas.width, canvas.height)];
  };
  img.src = dataUrl;

  function getPos(e) {
    const r = canvas.getBoundingClientRect();
    const scaleX = canvas.width / r.width;
    const scaleY = canvas.height / r.height;
    const src = e.touches ? e.touches[0] : e;
    return {
      x: (src.clientX - r.left) * scaleX,
      y: (src.clientY - r.top) * scaleY
    };
  }

  canvas.addEventListener('mousedown',  e => annStart(e, getPos(e)));
  canvas.addEventListener('mousemove',  e => annMove(e, getPos(e)));
  canvas.addEventListener('mouseup',    e => annEnd(e, getPos(e)));
  canvas.addEventListener('touchstart', e => { e.preventDefault(); annStart(e, getPos(e)); }, { passive: false });
  canvas.addEventListener('touchmove',  e => { e.preventDefault(); annMove(e, getPos(e)); }, { passive: false });
  canvas.addEventListener('touchend',   e => { e.preventDefault(); annEnd(e, getPos(e)); }, { passive: false });
}

function annStart(e, p) {
  const { ctx, tool, color, history } = annState;
  if (tool === 'text') {
    const text = prompt('Enter annotation text:');
    if (text) {
      ctx.font = '20px sans-serif';
      ctx.fillStyle = color;
      ctx.fillText(text, p.x, p.y);
      annState.history.push(ctx.getImageData(0, 0, annState.canvas.width, annState.canvas.height));
    }
    return;
  }
  annState.drawing = true;
  annState.startX = p.x;
  annState.startY = p.y;
  if (tool === 'draw') {
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
  }
}

function annMove(e, p) {
  if (!annState.drawing) return;
  const { ctx, tool, color, history, startX, startY } = annState;
  if (tool === 'draw') {
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  } else if (tool === 'arrow') {
    // Redraw last snapshot + preview arrow
    if (history.length) ctx.putImageData(history[history.length - 1], 0, 0);
    drawArrow(ctx, startX, startY, p.x, p.y, color);
  }
}

function annEnd(e, p) {
  if (!annState.drawing) return;
  annState.drawing = false;
  const { ctx, tool, color, startX, startY } = annState;
  if (tool === 'arrow') drawArrow(ctx, startX, startY, p.x, p.y, color);
  annState.history.push(ctx.getImageData(0, 0, annState.canvas.width, annState.canvas.height));
}

function drawArrow(ctx, x1, y1, x2, y2, color) {
  const headLen = 18;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI/6), y2 - headLen * Math.sin(angle - Math.PI/6));
  ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI/6), y2 - headLen * Math.sin(angle + Math.PI/6));
  ctx.closePath();
  ctx.fill();
}

window.setAnnotateTool = (tool) => {
  annState.tool = tool;
  ['draw','arrow','text'].forEach(t => {
    const btn = $(`ann-tool-${t}`);
    if (btn) btn.className = `btn btn-sm ${t === tool ? 'btn-primary' : 'btn-ghost'}`;
  });
};

window.setAnnotateColor = (color) => {
  annState.color = color;
};

window.annotateUndo = () => {
  if (annState.history.length <= 1) return;
  annState.history.pop();
  annState.ctx.putImageData(annState.history[annState.history.length - 1], 0, 0);
};

window.annotationDone = () => {
  const dataUrl = annState.canvas ? annState.canvas.toDataURL('image/png') : null;
  $('photo-annotate-modal-overlay').classList.remove('open');
  if (annotationResolve) { annotationResolve(dataUrl); annotationResolve = null; }
};

// Wire annotation into photo preview — update photo input handler
function wrapPhotoInputWithAnnotation(inputEl, previewEl) {
  inputEl.addEventListener('change', function() {
    const previews = previewEl;
    previews.innerHTML = '';
    Array.from(this.files).forEach((file, idx) => {
      const reader = new FileReader();
      reader.onload = async e => {
        const dataUrl = e.target.result;
        const annotated = await window.openPhotoAnnotation(dataUrl);
        const finalUrl = annotated || dataUrl;
        previews.innerHTML += `<div style="position:relative">
          <img src="${finalUrl}" data-annotated="${finalUrl}" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px">
        </div>`;
      };
      reader.readAsDataURL(file);
    });
  });
}

// ─── FEATURE 8: Client Signature on Invoices ─────────────────────────────────
window.openSignaturePad = (invoiceId) => {
  const modal = $('sig-pad-modal-sheet');
  modal.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-title">Sign Invoice INV-${String(invoiceId).padStart(4,'0')}</div>
    <p class="text-muted text-sm">Sign with your finger or mouse in the box below</p>
    <div class="sig-canvas-wrap mt-8">
      <canvas id="inv-sig-canvas" width="600" height="200"></canvas>
      <button class="sig-clear" onclick="clearInvSig()">Clear</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px">
      <button class="btn btn-ghost" onclick="closeModal('sig-pad-modal')">Cancel</button>
      <button class="btn btn-success" onclick="saveInvoiceSignature(${invoiceId})">Save Signature</button>
    </div>
  `;
  openModal('sig-pad-modal');
  setTimeout(() => setupGenericSigCanvas('inv-sig-canvas'), 50);
};

window.clearInvSig = () => {
  const canvas = $('inv-sig-canvas');
  if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
};

window.saveInvoiceSignature = async (invoiceId) => {
  const canvas = $('inv-sig-canvas');
  if (!canvas) return;
  const sigDataUrl = canvas.toDataURL('image/png');

  await window.DR_DB.invoices.update(invoiceId, {
    signatureDataUrl: sigDataUrl,
    signedAt: new Date().toISOString(),
    signedBy: currentUser.name,
    status: 'signed'
  });

  closeModal('sig-pad-modal');
  closeModal('inv-view-modal');
  toast('Signature saved', 'success');

  if (currentUser.role === 'supervisor') renderInvoicing();
  else if (currentUser.role === 'client') renderClientHome();
};
