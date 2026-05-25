// DÙN RIGHT — Main application logic
import { login, getAllUsers, getUser, getProjects, createProject,
         createLEM, getLEMsByUser, getPendingLEMs, getAllEquipment,
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
    { page: 'approvals',  icon: svgCheck(),    label: 'Approve' },
    { page: 'projects',   icon: svgFolder(),   label: 'Projects' },
    { page: 'invoicing',  icon: svgDoc(),      label: 'Invoices' },
    { page: 'staff',      icon: svgPeople(),   label: 'Staff' },
    { page: 'equipment',  icon: svgWrench(),   label: 'Equipment' },
    { page: 'walkaround', icon: svgTruck(),    label: 'Walkaround' }
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
  const equipment = await getAllEquipment();

  const modal = $('wo-modal-sheet');
  modal.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-title">New LEM (Daily Field Ticket)</div>

    <div class="form-group">
      <label>Date</label>
      <input type="date" id="lem-date" value="${new Date().toISOString().slice(0,10)}" onchange="updateLEMNumber()">
    </div>
    <div class="form-group">
      <label>Project</label>
      <select id="lem-project" onchange="updateLEMNumber()">
        <option value="">Select project...</option>
        ${projects.map(p => `<option value="${p.id}" data-num="${escHtml(p.projectNumber || String(p.id).padStart(6,'0'))}">${escHtml(p.name)}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label>LEM #</label>
      <input type="text" id="lem-number" placeholder="Auto-generated" readonly style="background:var(--surface);color:var(--muted)">
    </div>

    <div class="divider"></div>

    <!-- LABOUR SECTION -->
    <div class="section-header">
      <span class="section-title">Labour</span>
      <button class="btn btn-sm btn-outline" onclick="addLabourRow()">+ Add Person</button>
    </div>
    <div id="labour-rows"></div>

    <div class="divider"></div>

    <!-- INSTRUMENTS SECTION -->
    <div class="section-header">
      <span class="section-title">Instruments Used</span>
      <button class="btn btn-sm btn-outline" onclick="addInstrumentRow()">+ Add</button>
    </div>
    <div id="instrument-rows"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px">
      ${equipment.map(eq => `
        <label style="display:flex;align-items:center;gap:8px;font-size:0.85rem;text-transform:none;letter-spacing:0;padding:6px 0;cursor:pointer">
          <input type="checkbox" class="eq-check" data-id="${eq.id}" data-name="${escHtml(eq.name)}" data-serial="${escHtml(eq.serialNumber || '')}">
          ${escHtml(eq.name)}
        </label>`).join('')}
    </div>

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

  setTimeout(() => {
    addLabourRow();
    setupSigCanvas();
  }, 50);

  openModal('wo-modal');
};

window.updateLEMNumber = () => {
  const sel = $('lem-project');
  const opt = sel.options[sel.selectedIndex];
  const projNum = opt ? (opt.dataset.num || String(opt.value).padStart(6,'0')) : '000000';
  const date = $('lem-date')?.value || new Date().toISOString().slice(0,10);
  if ($('lem-number')) $('lem-number').value = generateLEMNumber(projNum, date);
};

// Labour rows with Keltic hour types
let lemUsersCache = [];

window.addLabourRow = async () => {
  if (!lemUsersCache.length) lemUsersCache = await window.DR_DB.users.where('active').equals(1).toArray();
  const container = $('labour-rows');
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
    <div class="form-group"><label>Title / Role</label><input type="text" class="lr-title" placeholder="e.g. Survey Technician"></div>
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
      <div class="form-group"><label style="font-size:0.75rem">LOA Food ($)</label><input type="number" class="lr-loa-food" min="0" step="0.01" value="0"></div>
      <div class="form-group"><label style="font-size:0.75rem">LOA Accom ($)</label><input type="number" class="lr-loa-accom" min="0" step="0.01" value="0"></div>
    </div>
    <div class="form-group"><label style="font-size:0.75rem">Hourly Rate ($/hr)</label><input type="number" class="lr-rate" min="0" step="0.01" value="0"></div>
    <button onclick="this.closest('.card').remove()" class="btn btn-danger btn-sm" style="margin-top:4px">Remove</button>
  `;
  row.querySelector('.lr-employee').addEventListener('change', function() {
    const opt = this.options[this.selectedIndex];
    const rateInput = row.querySelector('.lr-rate');
    if (opt && opt.dataset.rate) rateInput.value = opt.dataset.rate;
  });
  container.appendChild(row);
};

// Instrument rows (free-form addition beyond the checkboxes)
window.addInstrumentRow = () => {
  const container = $('instrument-rows');
  const row = el('div', 'consumable-row mt-4');
  row.innerHTML = `
    <input type="text" placeholder="Instrument name" style="flex:2">
    <input type="text" placeholder="Serial #" style="flex:1">
    <input type="number" placeholder="Qty" min="1" value="1" style="flex:0.5">
    <button onclick="this.parentElement.remove()" style="background:var(--danger);color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:1rem">×</button>
  `;
  container.appendChild(row);
};

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
    const title  = row.querySelector('.lr-title')?.value || '';
    if (empName) labourItems.push({ userId: empId, name: empName, title, survey, draft, office, other, travel, total, rate, kmStart, kmStop, loaFood, loaAccom });
  });

  // Instruments from checkboxes
  const instruments = [];
  document.querySelectorAll('.eq-check:checked').forEach(cb => {
    instruments.push({ id: parseInt(cb.dataset.id), name: cb.dataset.name, serialNumber: cb.dataset.serial, qty: 1 });
  });
  // Instrument rows (free-form)
  $('instrument-rows').querySelectorAll('.consumable-row').forEach(row => {
    const inputs = row.querySelectorAll('input');
    const name = inputs[0]?.value;
    const serial = inputs[1]?.value || '';
    const qty = parseInt(inputs[2]?.value) || 1;
    if (name) instruments.push({ name, serialNumber: serial, qty });
  });

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

  const lemData = {
    lemNumber, projectId, userId: currentUser.id,
    date: $('lem-date').value,
    labourItems, instruments, consumables, fieldSamples,
    notes: $('lem-notes').value,
    signature, status
  };

  if (status === 'submitted') lemData.submittedAt = new Date().toISOString();

  const id = await createLEM(lemData);
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

window.viewLEM = (id) => { toast('LEM ' + id + ' — full view coming soon', 'info'); };

// ─── Equipment Page ───────────────────────────────────────────────────────────
async function renderEquipment() {
  const container = $('page-equipment').querySelector('.page-scroll');
  const equipment = await getAllEquipment();
  const users = await getAllUsers();

  let html = `<div class="section-header">
    <span class="section-title">Equipment</span>
    <button class="btn btn-primary btn-sm" onclick="openAddEquipmentModal()">+ Add</button>
  </div>`;

  if (!equipment.length) {
    html += `<div class="empty-state">${svgWrench()}<p>No equipment listed</p></div>`;
  } else {
    equipment.forEach(eq => {
      const assignedUser = users.find(u => u.id === eq.assignedTo);
      const batteryDisplay = eq.batteryStatus !== null && eq.batteryStatus !== undefined
        ? `🔋 ${eq.batteryStatus}%` : '—';
      const statusColor = eq.status === 'available' ? 'var(--success)' : eq.status === 'in-use' ? 'var(--gold)' : 'var(--danger)';

      html += `<div class="card mt-8">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <div class="card-title" style="margin-bottom:2px">${escHtml(eq.name)}</div>
            <div class="text-sm text-muted">S/N: ${escHtml(eq.serialNumber || '—')}</div>
            <div class="text-sm text-muted">${batteryDisplay} • <span style="color:${statusColor}">${eq.status}</span></div>
            ${assignedUser ? `<div class="text-sm" style="color:var(--gold);margin-top:2px">Assigned to: ${escHtml(assignedUser.name)}</div>` : ''}
            ${eq.serviceNote ? `<div class="text-sm" style="color:var(--warning);margin-top:4px">⚠️ Service: ${escHtml(eq.serviceNote)}</div>` : ''}
            ${eq.replacementRequired ? `<div class="text-sm" style="color:var(--danger)">🔴 Replacement Required</div>` : ''}
          </div>
          <div style="display:flex;flex-direction:column;gap:6px">
            <button class="btn btn-sm btn-outline" onclick="editEquipmentBattery(${eq.id}, ${eq.batteryStatus || 0})">🔋 Update</button>
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
    <div class="modal-title">Add Equipment</div>
    <div class="form-group"><label>Equipment Name</label><input type="text" id="eq-name" placeholder="e.g. Total Station"></div>
    <div class="form-group"><label>Serial Number</label><input type="text" id="eq-serial" placeholder="S/N"></div>
    <div class="form-group"><label>Battery Status (%)</label><input type="number" id="eq-battery" min="0" max="100" value="100"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px">
      <button class="btn btn-ghost" onclick="closeModal('equipment-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="saveEquipment()">Add</button>
    </div>
  `;
  openModal('equipment-modal');
};

window.saveEquipment = async () => {
  const name = $('eq-name').value.trim();
  if (!name) { toast('Name required', 'error'); return; }
  await window.DR_DB.equipment.add({
    name,
    serialNumber: $('eq-serial').value.trim(),
    batteryStatus: parseInt($('eq-battery').value) || 100,
    status: 'available', active: true, assignedTo: null,
    serviceNote: null, replacementRequired: false
  });
  closeModal('equipment-modal');
  toast('Equipment added', 'success');
  renderEquipment();
};

window.editEquipmentBattery = async (id, current) => {
  const val = prompt(`Update battery status (current: ${current}%):`, current);
  if (val === null) return;
  const pct = Math.max(0, Math.min(100, parseInt(val)));
  if (isNaN(pct)) { toast('Invalid value', 'error'); return; }
  await window.DR_DB.equipment.update(id, { batteryStatus: pct });
  toast('Battery updated', 'success');
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

window.openNewProjectModal = () => {
  const modal = $('project-modal-sheet');
  modal.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-title">New Project</div>
    <div class="form-group"><label>Project Name</label><input type="text" id="proj-name" placeholder="e.g. Highway 40 Survey"></div>
    <div class="form-group"><label>Project Number</label><input type="text" id="proj-number" placeholder="e.g. 240205"></div>
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
  await createProject({
    name,
    projectNumber: $('proj-number').value.trim(),
    clientName: $('proj-client').value.trim(),
    clientEmail: $('proj-email').value.trim(),
    travelRate: parseFloat($('proj-travel-rate').value) || 0,
    loaRate: parseFloat($('proj-loa-rate').value) || 0,
    createdBy: currentUser.id
  });
  closeModal('project-modal');
  toast('Project created', 'success');
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
    formHtml += `<div class="card">${['Well rested (6+ hours sleep)', 'No alcohol / drug impairment', 'Physically capable today', 'Mentally fit and focused', 'Wearing required PPE', "Aware of today's hazards"].map(q =>
      `<div class="toggle-row"><span class="toggle-label">${q}</span><button class="toggle" onclick="toggleBtn(this,null)"></button></div>`
    ).join('')}</div>
    <div class="form-group"><label>Any concerns?</label><textarea id="sf-notes" placeholder="Optional notes..."></textarea></div>`;
  }

  if (type === 'flha' || type === 'jha') {
    formHtml += `<div class="form-group"><label>Task Description</label><input type="text" id="sf-task" placeholder="Describe the work being performed"></div>
      <div class="card"><div class="card-title">Hazards Present</div>
        ${hazardCategories.map((h, i) => `<div class="toggle-row"><span class="toggle-label">${h}</span><button class="toggle" id="haz-${i}" onclick="toggleBtn(this,null)"></button></div>`).join('')}
      </div>
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

  formHtml += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px">
    <button class="btn btn-ghost" onclick="closeModal('safety-modal')">Cancel</button>
    <button class="btn btn-success" onclick="submitSafetyForm('${type}')">Submit</button>
  </div>`;

  modal.innerHTML = formHtml;
  openModal('safety-modal');
};

window.submitSafetyForm = async (type) => {
  const projects = await getProjects();
  const date = $('sf-date')?.value || new Date().toISOString().slice(0,10);
  await window.DR_DB.safetyForms.add({
    userId: currentUser.id, type, date,
    projectId: projects[0]?.id || null,
    notes: $('sf-notes')?.value || $('sf-hazard-desc')?.value || '',
    task: $('sf-task')?.value || '',
    controls: $('sf-controls')?.value || '',
    status: 'submitted', syncStatus: 'pending',
    createdAt: new Date().toISOString()
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

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
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
window.currentUser = null;
