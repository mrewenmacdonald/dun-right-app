// DÙN RIGHT — Equipment tracking with QR scan in / scan out
// Shared across every phone through the /api equipment service (Azure Functions + Table Storage).
// Works offline: scans queue on the device and sync when signal returns.

import { getProjects, getAllEquipment } from './db.js';

// If EQUIPMENT_API_KEY is set in the Azure Static Web App settings, put the same value here.
const API_KEY = '';
const API = '/api';

const CACHE_KEY  = 'dr_eq_cache_v1';
const QUEUE_KEY  = 'dr_eq_queue_v1';
const FAILED_KEY = 'dr_eq_failed_v1';
const PROJ_KEY   = 'dr_eq_last_project';
const IMPORT_KEY = 'dr_eq_imported';
const TAG_RE = /^[A-Z0-9]{1,6}-\d{3,6}$/;

export const EQUIPMENT_KIT_TYPES = [
  'Trimble R10', 'Trimble R12', 'Trimble R12i', 'Trimble SX10', 'Trimble S6', 'Trimble S7', 'Trimble VX',
  'Data Collector', 'Utility Locator', 'GPR Unit', 'Digital Level', 'Mavic 3E Drone', 'Phantom 4 RTK Drone',
  'Radio', 'Tripod', 'Prism / Pole', 'Battery Kit', 'Laptop / Tablet', 'Other'
];

// ─── Small helpers ───────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toast = (m, t = 'info', d) => window.toast ? window.toast(m, t, d) : console.log(m);
const me = () => window.currentUser || null;
const isSupervisor = () => me()?.role === 'supervisor';
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } }
};
const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));

export function parseTag(raw) {
  let s = String(raw || '').trim();
  const m = s.match(/[?&#]eq=([^&#\s]+)/i);
  if (m) { try { s = decodeURIComponent(m[1]); } catch { s = m[1]; } }
  s = s.toUpperCase().replace(/\s+/g, '');
  return TAG_RE.test(s) ? s : null;
}

function ago(iso) {
  if (!iso) return '';
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (mins < 60) return `${mins} min`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} days`;
}
function when(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' }) + ' ' +
         d.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' });
}

const STATUS = {
  available: { label: 'Available',   color: 'var(--success)' },
  out:       { label: 'Checked out', color: 'var(--gold)' },
  service:   { label: 'Needs service', color: 'var(--warning)' },
  retired:   { label: 'Retired',     color: 'var(--muted)' }
};
const pill = st => { const s = STATUS[st] || STATUS.available;
  return `<span class="eq-pill" style="color:${s.color};border-color:${s.color}">${s.label}</span>`; };

// ─── State ───────────────────────────────────────────────────────────────────
const state = {
  items: store.get(CACHE_KEY, { items: [] }).items || [],
  mode: store.get(CACHE_KEY, {}).mode || null,
  syncedAt: store.get(CACHE_KEY, {}).syncedAt || null,
  tab: null,
  search: '',
  loading: false,
  serverError: null
};
function saveCache() { store.set(CACHE_KEY, { items: state.items, mode: state.mode, syncedAt: state.syncedAt }); }
const findItem = tag => state.items.find(i => i.tag === tag);
const queue = () => store.get(QUEUE_KEY, []);

// ─── API ─────────────────────────────────────────────────────────────────────
async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (API_KEY) headers['x-dr-key'] = API_KEY;
  let res;
  try {
    res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  } catch (e) {
    const err = new Error('No connection'); err.offline = true; throw err;
  }
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok || !data) {
    const err = new Error(data?.error || `Equipment service unavailable (${res.status})`);
    err.status = res.status;
    // 404 with no JSON body means the /api functions are not deployed yet
    err.offline = !data && (res.status >= 500 || res.status === 404);
    throw err;
  }
  return data;
}

export async function refreshItems() {
  if (!navigator.onLine) return false;
  state.loading = true;
  try {
    await flushQueue();
    const data = await api('/equipment');
    state.items = data.items || [];
    state.mode = data.mode;
    state.syncedAt = new Date().toISOString();
    state.serverError = null;
    // Re-apply anything still queued so the screen shows this phone's pending scans
    for (const q of queue()) applyLocal(q);
    saveCache();
    return true;
  } catch (e) {
    state.serverError = e.message;
    return false;
  } finally {
    state.loading = false;
  }
}

// Optimistically apply a scan to the cached list
function applyLocal(scan) {
  const it = findItem(scan.tag);
  if (!it) return;
  if (scan.action === 'out') {
    Object.assign(it, { status: 'out', holderName: scan.user.name, holderUsername: scan.user.username, project: scan.project || '', since: scan.at });
  } else {
    Object.assign(it, { status: scan.condition === 'service' ? 'service' : 'available', holderName: '', holderUsername: '', project: '', since: '',
      serviceNote: scan.condition === 'service' ? (scan.note || 'Flagged at check-in') : '' });
  }
  it.lastScanAt = scan.at;
  it._pending = true;
}

let flushing = null;
export function flushQueue() {
  if (flushing) return flushing;
  flushing = (async () => {
    let sent = 0;
    while (navigator.onLine) {
      const q = queue();
      if (!q.length) break;
      const scan = q[0];
      try {
        const res = await api(`/equipment/${encodeURIComponent(scan.tag)}/scan`, { method: 'POST', body: scan });
        if (res.item) { const i = state.items.findIndex(x => x.tag === res.item.tag); if (i >= 0) state.items[i] = res.item; }
        sent++;
      } catch (e) {
        if (e.offline || e.status === 429 || e.status === 503) break;
        // Rejected (unknown tag, retired, …): keep a record so the user can see it
        const failed = store.get(FAILED_KEY, []);
        failed.unshift({ ...scan, error: e.message, failedAt: new Date().toISOString() });
        store.set(FAILED_KEY, failed.slice(0, 50));
        toast(`Scan of ${scan.tag} was rejected: ${e.message}`, 'error', 5000);
      }
      store.set(QUEUE_KEY, queue().filter(x => x.scanId !== scan.scanId));
    }
    if (sent) { saveCache(); toast(`${sent} equipment scan${sent > 1 ? 's' : ''} synced`, 'success'); }
  })().finally(() => { flushing = null; });
  return flushing;
}

// Record a check-in or check-out. Returns { ok, queued, item, prevHolder }
async function submitScan(tag, action, { project = '', note = '', condition = 'ok', source = 'scan' } = {}) {
  const u = me();
  const scan = {
    scanId: uuid(), tag, action, project, note, condition, source,
    user: { name: u.name, username: u.username }, at: new Date().toISOString()
  };
  const before = findItem(tag) ? { ...findItem(tag) } : null;
  applyLocal(scan);
  saveCache();

  const enqueue = () => { store.set(QUEUE_KEY, [...queue(), scan]); return { ok: true, queued: true, item: findItem(tag) }; };
  if (!navigator.onLine || queue().length) { const r = enqueue(); if (navigator.onLine) flushQueue(); return r; }
  try {
    const res = await api(`/equipment/${encodeURIComponent(tag)}/scan`, { method: 'POST', body: scan });
    const i = state.items.findIndex(x => x.tag === tag);
    if (i >= 0 && res.item) state.items[i] = res.item;
    saveCache();
    return { ok: true, item: res.item, prevHolder: res.prevHolder };
  } catch (e) {
    if (e.offline) return enqueue();
    const i = state.items.findIndex(x => x.tag === tag);
    if (i >= 0 && before) state.items[i] = before;
    saveCache();
    return { ok: false, error: e.message };
  }
}

// ─── App hooks ───────────────────────────────────────────────────────────────
window.addEventListener('online', async () => {
  if (!me()) return;
  await refreshItems();
  if (window.currentPage === 'equipment') renderEquipmentPage();
});

// Called after login. Syncs queued scans and handles label links (…/?eq=KG-0001)
export async function initEquipment() {
  refreshItems().then(() => { if (window.currentPage === 'equipment') renderEquipmentPage(); });
  const tag = parseTag(new URLSearchParams(location.search).get('eq') ? location.search : '');
  if (tag && me() && me().role !== 'client') {
    history.replaceState({}, '', location.pathname);
    window.navigate('equipment');
    if (!findItem(tag)) await refreshItems();
    openScanner({ startTag: tag });
  }
}

// ─── Equipment page ──────────────────────────────────────────────────────────
export async function renderEquipmentPage() {
  const page = $('page-equipment');
  if (!page) return;
  const scroll = page.querySelector('.page-scroll');
  if (!state.tab) state.tab = isSupervisor() ? 'out' : 'mine';
  scroll.innerHTML = buildPage();
  if (!state.loading && navigator.onLine && (!state.syncedAt || Date.now() - Date.parse(state.syncedAt) > 15000)) {
    await refreshItems();
    if (window.currentPage === 'equipment') scroll.innerHTML = buildPage();
  }
  maybeOfferImport();
}

function buildPage() {
  const u = me();
  const items = state.items.filter(i => i.status !== 'retired');
  const mine = items.filter(i => i.status === 'out' && i.holderUsername === u.username);
  const counts = {
    out: items.filter(i => i.status === 'out').length,
    available: items.filter(i => i.status === 'available').length,
    service: items.filter(i => i.status === 'service').length
  };
  const q = queue().length;
  const failed = store.get(FAILED_KEY, []).length;

  let html = `
    <button class="eq-scan-hero" onclick="eqOpenScanner()">
      <span class="eq-scan-icon">${svgQR()}</span>
      <span><strong>Scan equipment</strong><small>Pick up or return gear</small></span>
    </button>`;

  if (state.mode === 'demo') html += `<div class="eq-banner warn"><strong>Demo mode.</strong> The equipment service has no storage connected yet, so scans can be lost. ${isSupervisor() ? 'See EQUIPMENT-SETUP.md in the app repo to connect Azure Table Storage.' : 'Let your supervisor know.'}</div>`;
  if (!navigator.onLine) html += `<div class="eq-banner">No signal. Scans are saved on this phone and will sync automatically.</div>`;
  else if (state.serverError && !state.items.length) html += `<div class="eq-banner warn">Can't reach the equipment service: ${esc(state.serverError)}</div>`;
  if (q) html += `<div class="eq-banner">${q} scan${q > 1 ? 's' : ''} waiting to sync. <button class="eq-link" onclick="eqSyncNow()">Sync now</button></div>`;
  if (failed && isSupervisor()) html += `<div class="eq-banner warn">${failed} offline scan${failed > 1 ? 's were' : ' was'} rejected. <button class="eq-link" onclick="eqShowFailed()">Review</button></div>`;

  if (isSupervisor()) {
    html += `<div class="eq-actions">
      <button class="btn btn-primary btn-sm" onclick="eqAddItem()">+ Add equipment</button>
      <button class="btn btn-outline btn-sm" onclick="eqPrintLabels()">Print QR labels</button>
    </div>`;
  }

  html += `<div class="eq-counts">
    <div><b style="color:var(--gold)">${counts.out}</b><span>Out</span></div>
    <div><b style="color:var(--success)">${counts.available}</b><span>Available</span></div>
    <div><b style="color:var(--warning)">${counts.service}</b><span>Service</span></div>
  </div>`;

  const tabs = [['mine', `Mine (${mine.length})`], ['out', 'Out'], ['all', 'All'], ['service', 'Service'], ['activity', 'Activity']];
  html += `<div class="eq-tabs">${tabs.map(([k, l]) => `<button class="${state.tab === k ? 'on' : ''}" onclick="eqTab('${k}')">${l}</button>`).join('')}</div>`;

  if (state.tab === 'activity') {
    html += `<div id="eq-activity"><div class="flex-center" style="height:80px"><div class="spinner"></div></div></div>`;
    setTimeout(loadActivity, 0);
    return html;
  }

  html += `<input class="eq-search" type="search" placeholder="Search name, tag, serial or person" value="${esc(state.search)}" oninput="eqSearch(this.value)">`;
  html += `<div id="eq-list">${buildList()}</div>`;
  if (state.syncedAt) html += `<p class="text-muted text-sm" style="text-align:center;margin:14px 0 4px">Updated ${esc(when(state.syncedAt))}</p>`;
  return html;
}

function buildList() {
  const u = me();
  const term = state.search.trim().toLowerCase();
  let list = state.items.filter(i => i.status !== 'retired');
  if (state.tab === 'mine') list = list.filter(i => i.status === 'out' && i.holderUsername === u.username);
  if (state.tab === 'out') list = list.filter(i => i.status === 'out').sort((a, b) => String(a.since).localeCompare(String(b.since)));
  if (state.tab === 'service') list = list.filter(i => i.status === 'service');
  if (term) list = list.filter(i => [i.tag, i.name, i.serial, i.type, i.holderName, i.project].some(v => String(v || '').toLowerCase().includes(term)));

  if (!list.length) {
    const msg = state.tab === 'mine' ? 'You have no equipment checked out. Tap Scan equipment when you pick something up.'
      : !state.items.length ? (isSupervisor() ? 'No equipment yet. Tap + Add equipment to tag your first item.' : 'No equipment has been set up yet.')
      : 'Nothing here.';
    return `<div class="empty-state">${svgQR()}<p>${esc(msg)}</p></div>`;
  }
  return list.map(i => `
    <button class="eq-row" onclick="eqOpenItem('${esc(i.tag)}')">
      <div class="eq-row-main">
        <div class="eq-row-title">${esc(i.name)}${i._pending ? ' <span class="eq-sync-dot" title="Waiting to sync"></span>' : ''}</div>
        <div class="eq-row-sub">${esc(i.tag)}${i.serial ? ` · S/N ${esc(i.serial)}` : ''}</div>
        ${i.status === 'out' ? `<div class="eq-row-who">${esc(i.holderName)}${i.project ? ` · ${esc(i.project)}` : ''} · ${esc(ago(i.since))}</div>` : ''}
        ${i.status === 'service' && i.serviceNote ? `<div class="eq-row-who" style="color:var(--warning)">${esc(i.serviceNote)}</div>` : ''}
      </div>
      ${pill(i.status)}
    </button>`).join('');
}

window.eqTab = t => { state.tab = t; renderEquipmentPage(); };
window.eqSearch = v => { state.search = v; const l = $('eq-list'); if (l) l.innerHTML = buildList(); };
window.eqSyncNow = async () => { await refreshItems(); renderEquipmentPage(); };
window.eqOpenScanner = () => openScanner({});

async function loadActivity() {
  const box = $('eq-activity');
  if (!box) return;
  try {
    const { activity } = await api('/equipment-activity?limit=100');
    box.innerHTML = activity.length ? activity.map(logRow).join('') : '<div class="empty-state"><p>No scans yet.</p></div>';
  } catch (e) {
    box.innerHTML = `<div class="eq-banner warn">${e.offline ? 'Activity needs a connection.' : esc(e.message)}</div>`;
  }
}

function logRow(l) {
  const verb = l.action === 'out' ? 'checked out' : (l.condition === 'service' ? 'returned for service' : 'checked in');
  return `<div class="eq-log">
    <div class="eq-log-dot" style="background:${l.action === 'out' ? 'var(--gold)' : l.condition === 'service' ? 'var(--warning)' : 'var(--success)'}"></div>
    <div>
      <div><strong>${esc(l.userName)}</strong> ${verb} <strong>${esc(l.itemName || l.tag)}</strong></div>
      <div class="text-muted text-sm">${esc(l.tag)} · ${esc(when(l.at))}${l.project ? ` · ${esc(l.project)}` : ''}${l.prevHolder ? ` · from ${esc(l.prevHolder)}` : ''}${l.applied === false ? ' · synced late' : ''}</div>
      ${l.note ? `<div class="text-sm" style="margin-top:2px">“${esc(l.note)}”</div>` : ''}
    </div>
  </div>`;
}

// ─── Item detail sheet ───────────────────────────────────────────────────────
window.eqOpenItem = async tag => {
  const it = findItem(tag);
  if (!it) return;
  const u = me();
  const sheet = $('equipment-modal-sheet');
  const mineOut = it.status === 'out' && it.holderUsername === u.username;
  sheet.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-title">${esc(it.name)}</div>
    <div class="eq-detail">
      <div>${pill(it.status)}</div>
      <div class="eq-kv"><span>Tag</span><b>${esc(it.tag)}</b></div>
      ${it.type ? `<div class="eq-kv"><span>Type</span><b>${esc(it.type)}</b></div>` : ''}
      ${it.serial ? `<div class="eq-kv"><span>Serial</span><b>${esc(it.serial)}</b></div>` : ''}
      ${it.status === 'out' ? `<div class="eq-kv"><span>With</span><b>${esc(it.holderName)}</b></div>
        <div class="eq-kv"><span>Since</span><b>${esc(when(it.since))} (${esc(ago(it.since))})</b></div>
        ${it.project ? `<div class="eq-kv"><span>Project</span><b>${esc(it.project)}</b></div>` : ''}` : ''}
      ${it.status === 'service' ? `<div class="eq-kv"><span>Issue</span><b style="color:var(--warning)">${esc(it.serviceNote || '')}</b></div>` : ''}
      ${it.notes ? `<div class="eq-kv"><span>Notes</span><b>${esc(it.notes)}</b></div>` : ''}
    </div>
    <div class="eq-sheet-btns">
      ${mineOut ? `<button class="btn btn-success btn-full" onclick="eqQuick('${esc(it.tag)}','in')">Check in</button>`
                : `<button class="btn btn-primary btn-full" onclick="eqQuick('${esc(it.tag)}','out')">Check out to me</button>`}
      ${isSupervisor() && it.status === 'out' && !mineOut ? `<button class="btn btn-ghost btn-full" onclick="eqQuick('${esc(it.tag)}','in')">Mark returned to shop</button>` : ''}
      ${isSupervisor() && it.status === 'service' ? `<button class="btn btn-success btn-full" onclick="eqSetStatus('${esc(it.tag)}','available')">Back in service</button>` : ''}
      ${isSupervisor() ? `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
        <button class="btn btn-ghost btn-sm" onclick="eqEditItem('${esc(it.tag)}')">Edit</button>
        <button class="btn btn-ghost btn-sm" onclick="eqPrintLabels(['${esc(it.tag)}'])">Label</button>
        <button class="btn btn-danger btn-sm" onclick="eqRetire('${esc(it.tag)}')">Retire</button>
      </div>` : ''}
    </div>
    <div class="section-header mt-12"><span class="section-title">History</span></div>
    <div id="eq-history"><div class="flex-center" style="height:60px"><div class="spinner"></div></div></div>
    <button class="btn btn-ghost btn-full" style="margin-top:12px" onclick="closeModal('equipment-modal')">Close</button>`;
  window.openModal('equipment-modal');
  try {
    const { history } = await api(`/equipment/${encodeURIComponent(tag)}/history?limit=30`);
    const box = $('eq-history');
    if (box) box.innerHTML = history.length ? history.map(logRow).join('') : '<p class="text-muted text-sm">No scans yet.</p>';
  } catch (e) {
    const box = $('eq-history');
    if (box) box.innerHTML = `<p class="text-muted text-sm">${e.offline ? 'History needs a connection.' : esc(e.message)}</p>`;
  }
};

// Check in/out from the item sheet without scanning (opens the same confirm panel)
window.eqQuick = (tag, action) => { window.closeModal('equipment-modal'); openScanner({ startTag: tag, forceAction: action, manual: true }); };

window.eqSetStatus = async (tag, status, extra = {}) => {
  try {
    const { item } = await api(`/equipment/${encodeURIComponent(tag)}`, { method: 'PUT', body: { status, ...extra } });
    const i = state.items.findIndex(x => x.tag === tag);
    if (i >= 0) state.items[i] = item;
    saveCache();
    window.closeModal('equipment-modal');
    toast(status === 'retired' ? `${tag} retired` : `${tag} is ${STATUS[status].label.toLowerCase()}`, 'success');
    renderEquipmentPage();
  } catch (e) { toast(e.offline ? 'Needs a connection' : e.message, 'error'); }
};
window.eqRetire = tag => { if (confirm(`Retire ${tag}? It will disappear from the lists and its label will stop working. History is kept.`)) window.eqSetStatus(tag, 'retired'); };

// ─── Add / edit (supervisor) ─────────────────────────────────────────────────
function itemForm(it = {}) {
  return `
    <div class="form-group"><label>Type</label>
      <select id="eqf-type" onchange="if(!$('eqf-name').dataset.touched) $('eqf-name').value=this.value==='Other'?'':this.value">
        ${EQUIPMENT_KIT_TYPES.map(t => `<option ${t === (it.type || 'Trimble R12i') ? 'selected' : ''}>${esc(t)}</option>`).join('')}
      </select></div>
    <div class="form-group"><label>Name shown on label</label>
      <input id="eqf-name" maxlength="60" value="${esc(it.name ?? 'Trimble R12i')}" oninput="this.dataset.touched=1" placeholder="e.g. Trimble R12i Base"></div>
    <div class="form-group"><label>Serial number</label><input id="eqf-serial" maxlength="60" value="${esc(it.serial || '')}" autocapitalize="characters"></div>
    <div class="form-group"><label>Notes (optional)</label><input id="eqf-notes" maxlength="300" value="${esc(it.notes || '')}" placeholder="Kit contents, owner, calibration due…"></div>`;
}
window.$ = window.$ || $;

window.eqAddItem = (keepType) => {
  const sheet = $('equipment-modal-sheet');
  sheet.innerHTML = `<div class="modal-handle"></div><div class="modal-title">Add equipment</div>
    ${itemForm(keepType ? { type: keepType, name: keepType } : {})}
    <p class="text-muted text-sm" style="margin:-4px 0 12px">A tag number (like KG-0001) is assigned automatically for the QR label.</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <button class="btn btn-ghost" onclick="closeModal('equipment-modal')">Cancel</button>
      <button class="btn btn-primary" id="eqf-save" onclick="eqSaveNew()">Add</button>
    </div>`;
  window.openModal('equipment-modal');
};

window.eqSaveNew = async () => {
  const body = { type: $('eqf-type').value, name: $('eqf-name').value.trim(), serial: $('eqf-serial').value.trim(),
                 notes: $('eqf-notes').value.trim(), actor: me().name };
  if (!body.name) { toast('Give it a name', 'error'); return; }
  $('eqf-save').disabled = true;
  try {
    const { item } = await api('/equipment', { method: 'POST', body });
    state.items.push(item);
    saveCache();
    const sheet = $('equipment-modal-sheet');
    sheet.innerHTML = `<div class="modal-handle"></div><div class="modal-title">Added ${esc(item.tag)}</div>
      <p style="margin-bottom:14px">${esc(item.name)}${item.serial ? ` (S/N ${esc(item.serial)})` : ''} is ready. Print its label and stick it on.</p>
      <div style="display:grid;gap:10px">
        <button class="btn btn-primary btn-full" onclick="eqPrintLabels(['${esc(item.tag)}'])">Print label</button>
        <button class="btn btn-outline btn-full" onclick="eqAddItem('${esc(item.type)}')">Add another</button>
        <button class="btn btn-ghost btn-full" onclick="closeModal('equipment-modal')">Done</button>
      </div>`;
    renderEquipmentPage();
  } catch (e) {
    $('eqf-save').disabled = false;
    toast(e.offline ? 'Adding equipment needs a connection' : e.message, 'error', 4000);
  }
};

window.eqEditItem = tag => {
  const it = findItem(tag);
  const sheet = $('equipment-modal-sheet');
  sheet.innerHTML = `<div class="modal-handle"></div><div class="modal-title">Edit ${esc(tag)}</div>
    ${itemForm(it)}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <button class="btn btn-ghost" onclick="eqOpenItem('${esc(tag)}')">Back</button>
      <button class="btn btn-primary" onclick="eqSaveEdit('${esc(tag)}')">Save</button>
    </div>`;
  $('eqf-name').dataset.touched = 1;
};

window.eqSaveEdit = async tag => {
  const body = { type: $('eqf-type').value, name: $('eqf-name').value.trim(), serial: $('eqf-serial').value.trim(), notes: $('eqf-notes').value.trim() };
  try {
    const { item } = await api(`/equipment/${encodeURIComponent(tag)}`, { method: 'PUT', body });
    const i = state.items.findIndex(x => x.tag === tag);
    if (i >= 0) state.items[i] = item;
    saveCache();
    toast('Saved', 'success');
    window.eqOpenItem(tag);
    renderEquipmentPage();
  } catch (e) { toast(e.offline ? 'Needs a connection' : e.message, 'error'); }
};

window.eqShowFailed = () => {
  const failed = store.get(FAILED_KEY, []);
  const sheet = $('equipment-modal-sheet');
  sheet.innerHTML = `<div class="modal-handle"></div><div class="modal-title">Rejected offline scans</div>
    <p class="text-muted text-sm" style="margin-bottom:10px">These were scanned without signal and the server refused them when they synced.</p>
    ${failed.map(f => `<div class="eq-log"><div class="eq-log-dot" style="background:var(--danger)"></div><div>
      <div><strong>${esc(f.user?.name)}</strong> ${f.action === 'out' ? 'check out' : 'check in'} <strong>${esc(f.tag)}</strong></div>
      <div class="text-muted text-sm">${esc(when(f.at))} · ${esc(f.error)}</div></div></div>`).join('')}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px">
      <button class="btn btn-ghost" onclick="closeModal('equipment-modal')">Close</button>
      <button class="btn btn-danger" onclick="localStorage.removeItem('${FAILED_KEY}');closeModal('equipment-modal');eqTab('${state.tab || 'out'}')">Clear list</button>
    </div>`;
  window.openModal('equipment-modal');
};

// One-time import of the old per-phone equipment list into the shared list
async function maybeOfferImport() {
  if (!isSupervisor() || store.get(IMPORT_KEY, false) || state.mode !== 'live') return;
  let local = [];
  // EM-001 / LEV-001 are placeholder rows the app seeds on every new phone, so skip them
  try { local = (await getAllEquipment()).filter(e => e.serialNumber && !['EM-001', 'LEV-001'].includes(e.serialNumber)); } catch { return; }
  const serials = new Set(state.items.map(i => String(i.serial || '').toUpperCase()));
  local = local.filter(e => !serials.has(String(e.serialNumber).toUpperCase()));
  if (!local.length) return;
  const box = document.createElement('div');
  box.className = 'eq-banner';
  box.innerHTML = `This phone's old equipment list has ${local.length} item${local.length > 1 ? 's' : ''} with serial numbers that aren't in the shared list. <button class="eq-link" id="eq-import-btn">Import them</button> <button class="eq-link" id="eq-import-no">Dismiss</button>`;
  const scroll = $('page-equipment')?.querySelector('.page-scroll');
  if (!scroll || scroll.querySelector('#eq-import-btn')) return;
  scroll.insertBefore(box, scroll.children[1] || null);
  $('eq-import-no').onclick = () => { store.set(IMPORT_KEY, true); box.remove(); };
  $('eq-import-btn').onclick = async () => {
    try {
      const res = await api('/equipment', { method: 'POST', body: { actor: me().name,
        import: local.map(e => ({ name: e.name, type: e.type || 'Other', serial: e.serialNumber, notes: e.serviceNote || '' })) } });
      store.set(IMPORT_KEY, true);
      toast(`Imported ${res.created.length} item${res.created.length === 1 ? '' : 's'}${res.skipped.length ? `, skipped ${res.skipped.length}` : ''}`, 'success', 4000);
      await refreshItems();
      renderEquipmentPage();
    } catch (e) { toast(e.message, 'error'); }
  };
}

// ─── LEM / DWR integration: fill "Equipment Used" from my checked-out gear ──
window.eqFillLEMFromMyGear = async () => {
  if (navigator.onLine) await refreshItems();
  const mine = state.items.filter(i => i.status === 'out' && i.holderUsername === me().username);
  if (!mine.length) { toast('You have no equipment checked out', 'info'); return; }
  const container = $('lem-equipment-rows');
  if (!container) return;
  const existing = new Set([...container.querySelectorAll('.eq-serial')].map(s => s.value.trim().toUpperCase()).filter(Boolean));
  let added = 0;
  for (const it of mine) {
    if (it.serial && existing.has(it.serial.toUpperCase())) continue;
    let slot = [...container.querySelectorAll('.eq-slot')].find(s => !s.querySelector('.eq-type').value);
    if (!slot) { window.addEquipmentSlot(); slot = container.lastElementChild; }
    const sel = slot.querySelector('.eq-type');
    const opt = [...sel.options].find(o => o.value === it.type) || [...sel.options].find(o => it.type && o.value && it.type.startsWith(o.value)) || [...sel.options].find(o => o.value === 'Other');
    sel.value = opt ? opt.value : '';
    window.onEquipmentTypeSelected(sel);
    slot.querySelector('.eq-serial').value = it.serial || it.tag;
    added++;
  }
  toast(added ? `Added ${added} item${added > 1 ? 's' : ''} from your checked-out gear` : 'Your checked-out gear is already listed', 'success');
};

// ─── Scanner ─────────────────────────────────────────────────────────────────
const scanner = { stream: null, timer: null, raf: null, busy: false, detector: null, batch: false, session: [], lastBad: 0, video: null, canvas: null };

function loadJsQR() {
  if (window.jsQR) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = '/js/vendor/jsQR.min.js';
    s.onload = res; s.onerror = () => rej(new Error('Could not load the QR reader'));
    document.head.appendChild(s);
  });
}

export async function openScanner({ startTag = null, forceAction = null, manual = false } = {}) {
  closeScanner();
  scanner.session = [];
  scanner.busy = false;
  const ov = document.createElement('div');
  ov.id = 'eq-scan-overlay';
  ov.innerHTML = `
    <div class="eq-scan-top">
      <button class="eq-scan-x" onclick="eqCloseScanner()" aria-label="Close">✕</button>
      <div class="eq-scan-title">Scan equipment</div>
      <label class="eq-batch"><input type="checkbox" id="eq-batch" ${scanner.batch ? 'checked' : ''} onchange="eqBatch(this.checked)"> Several items</label>
    </div>
    <div class="eq-scan-view">
      <video id="eq-video" playsinline muted autoplay></video>
      <div class="eq-scan-frame"><i></i><i></i><i></i><i></i></div>
      <div class="eq-scan-hint" id="eq-scan-hint">Point the camera at the QR label</div>
    </div>
    <div class="eq-scan-session" id="eq-session"></div>
    <div class="eq-scan-bottom">
      <form onsubmit="event.preventDefault();eqManualTag()" class="eq-manual">
        <input id="eq-manual" placeholder="Or type tag, e.g. KG-0012" autocapitalize="characters" autocomplete="off">
        <button class="btn btn-outline btn-sm" type="submit">Go</button>
      </form>
    </div>
    <div class="eq-panel" id="eq-panel"></div>`;
  document.body.appendChild(ov);
  document.body.classList.add('eq-scanning');
  scanner.video = $('eq-video');
  scanner.canvas = document.createElement('canvas');
  renderSession();

  if (startTag) {
    // Opened from a label link or the item sheet: go straight to the confirm panel
    $('eq-scan-hint').textContent = manual ? '' : 'Point the camera at the QR label';
    showPanel(startTag, { forceAction, manual });
    if (manual) return;
  }
  startCamera();
}

async function startCamera() {
  const hint = $('eq-scan-hint');
  if (!navigator.mediaDevices?.getUserMedia) {
    if (hint) hint.textContent = 'Camera not available here. Type the tag number below.';
    return;
  }
  try {
    scanner.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  } catch (e) {
    if (hint) hint.textContent = e.name === 'NotAllowedError'
      ? 'Camera permission was blocked. Allow camera access for this app in Settings, or type the tag below.'
      : 'Could not start the camera. Type the tag number below.';
    return;
  }
  const v = scanner.video;
  if (!v) { stopStream(); return; }
  v.srcObject = scanner.stream;
  try { await v.play(); } catch { /* iOS sometimes needs a tap; autoplay+muted usually works */ }

  if ('BarcodeDetector' in window) {
    try {
      const formats = await window.BarcodeDetector.getSupportedFormats();
      if (formats.includes('qr_code')) scanner.detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    } catch { scanner.detector = null; }
  }
  if (!scanner.detector) {
    try { await loadJsQR(); } catch (e) { if (hint) hint.textContent = e.message; return; }
  }
  scanLoop();
}

function scanLoop() {
  clearTimeout(scanner.timer);
  scanner.timer = setTimeout(async () => {
    const v = scanner.video;
    if (!v || !scanner.stream) return;
    if (!scanner.busy && v.readyState >= 2 && v.videoWidth) {
      let text = null;
      try {
        if (scanner.detector) {
          const codes = await scanner.detector.detect(v);
          text = codes[0]?.rawValue || null;
        } else {
          const scale = Math.min(1, 720 / Math.max(v.videoWidth, v.videoHeight));
          const w = Math.round(v.videoWidth * scale), h = Math.round(v.videoHeight * scale);
          const c = scanner.canvas; c.width = w; c.height = h;
          const ctx = c.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(v, 0, 0, w, h);
          const img = ctx.getImageData(0, 0, w, h);
          const code = window.jsQR(img.data, w, h, { inversionAttempts: 'attemptBoth' });
          text = code?.data || null;
        }
      } catch { text = null; }
      if (text) onCode(text);
    }
    scanLoop();
  }, 140);
}

function onCode(text) {
  const tag = parseTag(text);
  if (!tag) {
    if (Date.now() - scanner.lastBad > 2500) { scanner.lastBad = Date.now(); toast('That QR code isn\'t an equipment tag', 'error'); }
    return;
  }
  // Ignore the same label still in view right after confirming it
  if (scanner.session.length && scanner.session[scanner.session.length - 1].tag === tag && Date.now() - scanner.session[scanner.session.length - 1].t < 3000) return;
  try { navigator.vibrate && navigator.vibrate(60); } catch { /* not supported on iOS */ }
  showPanel(tag, {});
}

window.eqManualTag = () => {
  const tag = parseTag($('eq-manual').value);
  if (!tag) { toast('Enter a tag like KG-0012', 'error'); return; }
  $('eq-manual').value = '';
  $('eq-manual').blur();
  showPanel(tag, {});
};
window.eqBatch = on => { scanner.batch = on; renderSession(); };

function renderSession() {
  const box = $('eq-session');
  if (!box) return;
  if (!scanner.session.length) { box.innerHTML = scanner.batch ? '<span class="text-muted">Scan each item, they\'ll stack up here.</span>' : ''; return; }
  box.innerHTML = scanner.session.map(s =>
    `<span class="eq-chip ${s.action}">${s.action === 'out' ? '↑' : '↓'} ${esc(s.tag)} ${esc(s.name)}${s.queued ? ' ⏳' : ''}</span>`).join('') +
    `<button class="btn btn-primary btn-sm" onclick="eqCloseScanner()">Done (${scanner.session.length})</button>`;
}

async function projectOptions() {
  let projects = [];
  try { projects = await getProjects(true); } catch { projects = []; }
  const last = store.get(PROJ_KEY, '');
  const opts = projects.map(p => {
    const label = [p.projectNumber, p.name].filter(Boolean).join(' ');
    return `<option ${label === last ? 'selected' : ''}>${esc(label)}</option>`;
  }).join('');
  return `<option value="">No project / shop</option>${opts}${last && !projects.some(p => [p.projectNumber, p.name].filter(Boolean).join(' ') === last) ? `<option selected>${esc(last)}</option>` : ''}`;
}

async function showPanel(tag, { forceAction = null, manual = false }) {
  scanner.busy = true;
  const panel = $('eq-panel');
  if (!panel) return;
  let it = findItem(tag);
  if (!it && navigator.onLine) { await refreshItems(); it = findItem(tag); }
  panel.classList.add('open');

  if (!it) {
    panel.innerHTML = `<div class="eq-panel-title">${esc(tag)}</div>
      <p style="margin:8px 0 16px">This tag isn't in the equipment list${navigator.onLine ? '' : ' on this phone yet (no signal to check)'}. ${isSupervisor() ? 'Add it from the Equipment page.' : 'Let your supervisor know.'}</p>
      <button class="btn btn-ghost btn-full" onclick="eqResume()">Scan again</button>`;
    return;
  }

  const u = me();
  const mine = it.status === 'out' && it.holderUsername === u.username;
  const action = forceAction || (mine ? 'in' : 'out');
  const other = action === 'out' ? 'in' : 'out';
  const canOther = action === 'out' ? (it.status === 'out' && (mine || isSupervisor())) : true;

  let statusLine = '';
  if (it.status === 'available') statusLine = '<span style="color:var(--success)">Available</span>';
  if (it.status === 'out') statusLine = mine ? `<span style="color:var(--gold)">Checked out to you · ${esc(ago(it.since))}</span>`
    : `<span style="color:var(--gold)">With ${esc(it.holderName)} since ${esc(when(it.since))}</span>${it.project ? ` · ${esc(it.project)}` : ''}`;
  if (it.status === 'service') statusLine = `<span style="color:var(--warning)">Flagged for service: ${esc(it.serviceNote || '')}</span>`;

  const warn = action === 'out' && it.status === 'out' && !mine
    ? `<div class="eq-warn">This is checked out to ${esc(it.holderName)}. Checking it out moves it to you.</div>`
    : action === 'out' && it.status === 'service'
    ? `<div class="eq-warn">This item was flagged for service. Make sure it's working before you take it.</div>` : '';

  panel.innerHTML = `
    <div class="eq-panel-title">${esc(it.name)}</div>
    <div class="text-muted text-sm">${esc(it.tag)}${it.serial ? ` · S/N ${esc(it.serial)}` : ''}</div>
    <div class="text-sm" style="margin:6px 0 10px">${statusLine}</div>
    ${warn}
    ${action === 'out' ? `
      <div class="form-group"><label>Project</label><select id="eq-proj">${await projectOptions()}</select></div>` : `
      <div class="eq-cond">
        <button type="button" class="on" id="eq-cond-ok" onclick="eqCond('ok')">Working fine</button>
        <button type="button" id="eq-cond-svc" onclick="eqCond('service')">Needs service</button>
      </div>`}
    <div class="form-group"><input id="eq-note" maxlength="300" placeholder="${action === 'in' ? 'Note (what\'s wrong, missing parts…)' : 'Note (optional)'}"></div>
    <button class="btn ${action === 'out' ? 'btn-primary' : 'btn-success'} btn-full eq-confirm" id="eq-confirm" onclick="eqConfirm('${esc(it.tag)}','${action}',${manual})">
      ${action === 'out' ? 'Check out to me' : 'Check in'}
    </button>
    <div class="eq-panel-foot">
      <button class="eq-link" onclick="${manual ? 'eqCloseScanner()' : 'eqResume()'}">${manual ? 'Cancel' : 'Cancel, scan again'}</button>
      ${canOther ? `<button class="eq-link" onclick="eqSwitch('${esc(it.tag)}','${other}',${manual})">${other === 'in' ? (mine ? 'Check in instead' : 'Mark returned instead') : 'Check out instead'}</button>` : ''}
    </div>`;
  window._eqCond = 'ok';
}

window.eqCond = c => {
  window._eqCond = c;
  $('eq-cond-ok')?.classList.toggle('on', c === 'ok');
  $('eq-cond-svc')?.classList.toggle('on', c === 'service');
  if (c === 'service') $('eq-note')?.focus();
};
window.eqSwitch = (tag, action, manual) => showPanel(tag, { forceAction: action, manual });

window.eqResume = () => {
  const panel = $('eq-panel');
  if (panel) { panel.classList.remove('open'); panel.innerHTML = ''; }
  scanner.busy = false;
  if (!scanner.stream) startCamera();
};

window.eqConfirm = async (tag, action, manual) => {
  const btn = $('eq-confirm');
  if (btn) btn.disabled = true;
  const project = action === 'out' ? ($('eq-proj')?.value || '') : '';
  const note = $('eq-note')?.value.trim() || '';
  const condition = action === 'in' ? (window._eqCond || 'ok') : 'ok';
  if (action === 'in' && condition === 'service' && !note) { toast('Say what needs fixing', 'error'); if (btn) btn.disabled = false; return; }
  if (action === 'out') store.set(PROJ_KEY, project);

  const r = await submitScan(tag, action, { project, note, condition, source: manual ? 'manual' : 'scan' });
  if (!r.ok) { toast(r.error, 'error', 4000); if (btn) btn.disabled = false; return; }
  const it = findItem(tag);
  const name = it?.name || tag;
  const msg = action === 'out' ? `${name} checked out to you` : condition === 'service' ? `${name} checked in, flagged for service` : `${name} checked in`;
  toast(r.queued ? `${msg} (will sync when online)` : msg, 'success');
  scanner.session.push({ tag, name, action, queued: !!r.queued, t: Date.now() });

  if (scanner.batch && !manual) { renderSession(); window.eqResume(); }
  else closeScanner();
  if (window.currentPage === 'equipment') renderEquipmentPage();
};

function stopStream() {
  clearTimeout(scanner.timer);
  if (scanner.stream) scanner.stream.getTracks().forEach(t => t.stop());
  scanner.stream = null;
}
function closeScanner() {
  stopStream();
  scanner.busy = false;
  document.getElementById('eq-scan-overlay')?.remove();
  document.body.classList.remove('eq-scanning');
}
window.eqCloseScanner = () => { closeScanner(); if (window.currentPage === 'equipment') renderEquipmentPage(); };
document.addEventListener('visibilitychange', () => { if (document.hidden && scanner.stream) { stopStream(); } else if (!document.hidden && $('eq-scan-overlay') && !scanner.busy && !scanner.stream) startCamera(); });

// ─── QR labels ───────────────────────────────────────────────────────────────
export function labelUrl(tag) { return `${location.origin}/?eq=${encodeURIComponent(tag)}`; }

function qrSvg(text) {
  const qr = window.qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount(), q = 2; // quiet zone in modules (label has its own white margin)
  let path = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) path += `M${c + q} ${r + q}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + 2 * q} ${n + 2 * q}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}

function loadQRGen() {
  if (window.qrcode) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = '/js/vendor/qrcode.min.js';
    s.onload = res; s.onerror = () => rej(new Error('Could not load the label generator'));
    document.head.appendChild(s);
  });
}

// Avery 5160 / 8160 layout: 30 labels per Letter sheet, 2-5/8" x 1"
const LABEL_LAYOUTS = {
  avery5160: { name: 'Avery 5160 / 8160 (30 per sheet, 2⅝" × 1")', cols: 3, rows: 10, w: 2.625, h: 1, top: 0.5, left: 0.1875, gapX: 0.125, gapY: 0 },
  avery5163: { name: 'Avery 5163 / 8163 (10 per sheet, 4" × 2")',  cols: 2, rows: 5,  w: 4,     h: 2, top: 0.5, left: 0.15625, gapX: 0.1875, gapY: 0 }
};

window.eqPrintLabels = async (tags) => {
  window.closeModal('equipment-modal');
  try { await loadQRGen(); } catch (e) { toast(e.message, 'error'); return; }
  const all = state.items.filter(i => i.status !== 'retired').sort((a, b) => a.tag.localeCompare(b.tag, undefined, { numeric: true }));
  if (!all.length) { toast('Add equipment first', 'error'); return; }
  const chosen = new Set(tags && tags.length ? tags : all.map(i => i.tag));
  const ov = document.createElement('div');
  ov.id = 'eq-label-overlay';
  ov.innerHTML = `
    <div class="eq-label-tools">
      <div class="eq-scan-top" style="position:static">
        <button class="eq-scan-x" onclick="document.getElementById('eq-label-overlay').remove();document.body.classList.remove('eq-printing')">✕</button>
        <div class="eq-scan-title">QR labels</div><span></span>
      </div>
      <div class="form-group"><label>Label sheet</label><select id="eql-layout" onchange="eqRenderLabels()">
        ${Object.entries(LABEL_LAYOUTS).map(([k, l]) => `<option value="${k}">${esc(l.name)}</option>`).join('')}</select></div>
      <div class="form-group"><label>Start at label position (to reuse a part-used sheet)</label><input id="eql-start" type="number" min="1" value="1" oninput="eqRenderLabels()"></div>
      <div class="form-group"><label>Items (${all.length})</label>
        <div class="eq-label-pick">${all.map(i => `<label><input type="checkbox" value="${esc(i.tag)}" ${chosen.has(i.tag) ? 'checked' : ''} onchange="eqRenderLabels()"> ${esc(i.tag)} ${esc(i.name)}</label>`).join('')}</div>
        <div style="display:flex;gap:8px;margin-top:6px"><button class="eq-link" onclick="eqLabelAll(true)">Select all</button><button class="eq-link" onclick="eqLabelAll(false)">Clear</button></div>
      </div>
      <button class="btn btn-primary btn-full" onclick="window.print()">Print / Save as PDF</button>
      <p class="text-muted text-sm" style="margin-top:8px">Print at 100% scale (“Actual size”), not “Fit to page”. Weatherproof or laminated labels hold up best on field gear.</p>
    </div>
    <div class="eq-label-preview"><div id="eq-print-root"></div></div>`;
  document.body.appendChild(ov);
  document.body.classList.add('eq-printing');
  window.eqRenderLabels();
};

window.eqLabelAll = on => { document.querySelectorAll('.eq-label-pick input').forEach(c => { c.checked = on; }); window.eqRenderLabels(); };

window.eqRenderLabels = () => {
  const L = LABEL_LAYOUTS[$('eql-layout').value];
  const start = Math.max(1, parseInt($('eql-start').value, 10) || 1) - 1;
  const tags = [...document.querySelectorAll('.eq-label-pick input:checked')].map(c => c.value);
  const items = tags.map(findItem).filter(Boolean);
  const per = L.cols * L.rows;
  const cells = [...Array(start).fill(null), ...items];
  const pages = [];
  for (let p = 0; p < Math.max(1, Math.ceil(cells.length / per)); p++) pages.push(cells.slice(p * per, (p + 1) * per));
  const big = L.h >= 2;
  $('eq-print-root').innerHTML = pages.map(page => `
    <div class="eq-sheet" style="padding:${L.top}in 0 0 ${L.left}in;grid-template-columns:repeat(${L.cols},${L.w}in);grid-auto-rows:${L.h}in;column-gap:${L.gapX}in;row-gap:${L.gapY}in">
      ${page.map(it => it ? `
        <div class="eq-label ${big ? 'big' : ''}">
          <div class="eq-label-qr">${qrSvg(labelUrl(it.tag))}</div>
          <div class="eq-label-text">
            <div class="eq-label-co">KELTIC GEOMATICS</div>
            <div class="eq-label-tag">${esc(it.tag)}</div>
            <div class="eq-label-name">${esc(it.name)}</div>
            ${it.serial ? `<div class="eq-label-sn">S/N ${esc(it.serial)}</div>` : ''}
            <div class="eq-label-foot">Scan in DÙN RIGHT to sign out</div>
          </div>
        </div>` : '<div></div>').join('')}
    </div>`).join('');
};

// ─── Icons ───────────────────────────────────────────────────────────────────
function svgQR() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/></svg>`;
}
export { svgQR };
