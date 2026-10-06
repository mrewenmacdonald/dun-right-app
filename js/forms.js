// DÙN RIGHT - Field Forms Suite
// Daily Work Records explorer, Time Cards, Safety form library, Confidential Reporting,
// Expense Envelopes, Excel/PDF export.
//
// Everything here is offline-first (Dexie/IndexedDB) and follows the same
// modal-sheet / list-item patterns as app.js. Functions that need to be reachable
// from inline onclick handlers are attached to window.

import { getProjects, getUser, getAllUsers } from './db.js';

const $  = id => document.getElementById(id);
const db = () => window.DR_DB;
const me = () => window.currentUser;
const isSup = () => me()?.role === 'supervisor';
const today = () => new Date().toISOString().slice(0, 10);
const nowIso = () => new Date().toISOString();

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function toast(msg, type = 'info') { if (window.toast) window.toast(msg, type); else console.log(msg); }
function openModal(id)  { window.openModal(id); }
function closeModal(id) { window.closeModal(id); }

async function notifySupervisors(message, type) {
  const sups = await db().users.where('role').equals('supervisor').toArray();
  for (const s of sups) {
    if (s.id === me().id) continue;
    await db().notifications.add({ toUserId: s.id, fromUserId: me().id, message, scheduledAt: nowIso(), read: false, type });
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  EXPORT HELPERS (Excel via SheetJS, PDF via jsPDF)
// ═════════════════════════════════════════════════════════════════════════════
let xlsxLoading = null;
async function ensureXLSX() {
  if (window.XLSX) return window.XLSX;
  if (!xlsxLoading) {
    xlsxLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload = () => resolve(window.XLSX);
      s.onerror = () => reject(new Error('Excel library unavailable offline'));
      document.head.appendChild(s);
    });
  }
  return xlsxLoading;
}

/** rows: array of objects with identical keys; headers: optional [{key,label,width}] */
export async function exportToExcel(filename, sheets) {
  try {
    const XLSX = await ensureXLSX();
    const wb = XLSX.utils.book_new();
    for (const sh of sheets) {
      const headers = sh.headers || Object.keys(sh.rows[0] || {}).map(k => ({ key: k, label: k }));
      const aoa = [headers.map(h => h.label)];
      sh.rows.forEach(r => aoa.push(headers.map(h => r[h.key] ?? '')));
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = headers.map(h => ({ wch: h.width || Math.max(12, h.label.length + 2) }));
      ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: aoa.length - 1, c: headers.length - 1 } }) };
      XLSX.utils.book_append_sheet(wb, ws, (sh.name || 'Sheet1').slice(0, 31));
    }
    XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : filename + '.xlsx');
    toast('Excel file downloaded', 'success');
  } catch (e) {
    console.error(e);
    // Offline fallback: CSV
    const sh = sheets[0];
    const headers = sh.headers || Object.keys(sh.rows[0] || {}).map(k => ({ key: k, label: k }));
    const csv = [headers.map(h => `"${h.label}"`).join(',')]
      .concat(sh.rows.map(r => headers.map(h => `"${String(r[h.key] ?? '').replace(/"/g, '""')}"`).join(','))).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = filename.replace(/\.xlsx$/, '') + '.csv';
    a.click();
    toast('Excel library offline, exported CSV instead', 'info');
  }
}

const DUN = { purple: [58, 30, 90], purpleLight: [92, 60, 130], gold: [200, 169, 110], dark: [30, 30, 30], grey: [110, 110, 110], rowAlt: [244, 240, 248] };
const PW = 215.9, PH = 279.4, PM = 10;

function pdfHeader(doc, title, subtitle) {
  doc.setFillColor(...DUN.purple); doc.rect(0, 0, PW, 20, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(255, 255, 255);
  doc.text('DÙN CONSTRUCTION SERVICES', PM, 9);
  doc.setFontSize(8); doc.setFont('helvetica', 'normal');
  doc.text('Field Management Platform', PM, 14.5);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text(title.toUpperCase(), PW - PM, 9, { align: 'right' });
  if (subtitle) { doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.text(subtitle, PW - PM, 14.5, { align: 'right' }); }
  doc.setTextColor(...DUN.dark);
  return 27;
}
function pdfFooter(doc) {
  const n = doc.internal.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setDrawColor(...DUN.gold); doc.setLineWidth(0.4); doc.line(PM, PH - 12, PW - PM, PH - 12);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...DUN.grey);
    doc.text(`Generated ${new Date().toLocaleString('en-CA')}`, PM, PH - 8);
    doc.text(`Page ${i} of ${n}`, PW - PM, PH - 8, { align: 'right' });
  }
}
function pdfSection(doc, y, title) {
  if (y > PH - 30) { doc.addPage(); y = 20; }
  doc.setFillColor(...DUN.purpleLight); doc.rect(PM, y, PW - 2 * PM, 6.5, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(255, 255, 255);
  doc.text(title.toUpperCase(), PM + 2.5, y + 4.6);
  doc.setTextColor(...DUN.dark);
  return y + 9;
}
function pdfKV(doc, y, label, value) {
  const lines = doc.splitTextToSize(String(value ?? '-') || '-', PW - 2 * PM - 45);
  if (y + lines.length * 4.2 > PH - 18) { doc.addPage(); y = 20; }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.text(label, PM + 1, y);
  doc.setFont('helvetica', 'normal'); doc.text(lines, PM + 45, y);
  return y + Math.max(1, lines.length) * 4.2 + 1;
}
function pdfPara(doc, y, text) {
  const lines = doc.splitTextToSize(String(text || '-'), PW - 2 * PM - 4);
  if (y + lines.length * 4.2 > PH - 18) { doc.addPage(); y = 20; }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.text(lines, PM + 2, y);
  return y + lines.length * 4.2 + 2;
}
/** cols: [{label, key, w(mm), align}] */
function pdfTable(doc, y, cols, rows) {
  const drawHead = (yy) => {
    doc.setFillColor(...DUN.purple); doc.rect(PM, yy, PW - 2 * PM, 6, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(255, 255, 255);
    let x = PM;
    cols.forEach(c => { doc.text(c.label, c.align === 'right' ? x + c.w - 1.5 : x + 1.5, yy + 4.2, { align: c.align || 'left' }); x += c.w; });
    doc.setTextColor(...DUN.dark);
    return yy + 6;
  };
  y = drawHead(y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
  rows.forEach((r, i) => {
    const cellLines = cols.map(c => doc.splitTextToSize(String(r[c.key] ?? ''), c.w - 3));
    const h = Math.max(...cellLines.map(l => l.length)) * 3.6 + 2.2;
    if (y + h > PH - 16) { doc.addPage(); y = drawHead(20); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); }
    if (i % 2) { doc.setFillColor(...DUN.rowAlt); doc.rect(PM, y, PW - 2 * PM, h, 'F'); }
    let x = PM;
    cols.forEach((c, ci) => { doc.text(cellLines[ci], c.align === 'right' ? x + c.w - 1.5 : x + 1.5, y + 3.6, { align: c.align || 'left' }); x += c.w; });
    y += h;
  });
  doc.setDrawColor(...DUN.gold); doc.setLineWidth(0.2); doc.line(PM, y, PW - PM, y);
  return y + 4;
}
function newPDF() { return new window.jspdf.jsPDF({ unit: 'mm', format: 'letter' }); }

// ═════════════════════════════════════════════════════════════════════════════
//  GENERIC FORM EXPLORER (tabs + filters + search + export)
// ═════════════════════════════════════════════════════════════════════════════
const explorerState = {}; // key -> { tab, q, from, to, status, project, employee, filtersOpen }

/**
 * cfg = {
 *   key, title, containerId, createLabel, onCreate(),
 *   load(): Promise<rows>,  // raw records; each must have userId, date, status
 *   rowTitle(r), rowSub(r), onOpen(id), statuses:[...],
 *   exportRows(rows): [{...}], exportHeaders: [{key,label,width}], exportName
 *   pdfCols: [{label,key,w}], pdfTitle
 * }
 */
export async function renderExplorer(cfg) {
  const st = explorerState[cfg.key] = Object.assign({ tab: 'mine-open', q: '', from: '', to: '', status: '', project: '', employee: '', filtersOpen: false }, explorerState[cfg.key] || {});
  const container = $(cfg.containerId)?.querySelector('.page-scroll') || $(cfg.containerId);
  if (!container) return;

  const [all, projects, users] = await Promise.all([cfg.load(), getProjects(false), getAllUsers()]);
  const sup = isSup();
  let rows = all;
  if (st.tab === 'mine-open') rows = rows.filter(r => r.userId === me().id && r.status !== 'submitted' && r.status !== 'approved' && r.status !== 'sent');
  if (st.tab === 'mine')      rows = rows.filter(r => r.userId === me().id);
  if (st.from)     rows = rows.filter(r => (r.date || '') >= st.from);
  if (st.to)       rows = rows.filter(r => (r.date || '') <= st.to);
  if (st.status)   rows = rows.filter(r => r.status === st.status);
  if (st.project)  rows = rows.filter(r => String(r.projectId) === st.project);
  if (st.employee) rows = rows.filter(r => String(r.userId) === st.employee);
  if (st.q) {
    const q = st.q.toLowerCase();
    rows = rows.filter(r => JSON.stringify(r).toLowerCase().includes(q));
  }
  rows.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.id - a.id));
  window[`_explorer_${cfg.key}_rows`] = rows;
  window[`_explorer_${cfg.key}_cfg`] = cfg;

  const projName = id => projects.find(p => p.id === id)?.name || '';
  const userName = id => users.find(u => u.id === id)?.name || '';
  const statuses = cfg.statuses || ['draft', 'submitted', 'approved', 'rejected'];

  container.innerHTML = `
    <div class="section-header">
      <span class="section-title">${esc(cfg.title)}</span>
      ${cfg.onCreate ? `<button class="btn btn-primary btn-sm" onclick="${cfg.onCreate}">+ ${esc(cfg.createLabel || 'Create')}</button>` : ''}
    </div>
    <div class="tab-bar">
      <button class="tab-btn ${st.tab==='mine-open'?'active':''}" onclick="explorerTab('${cfg.key}','mine-open')">My Forms (Not Submitted)</button>
      <button class="tab-btn ${st.tab==='mine'?'active':''}" onclick="explorerTab('${cfg.key}','mine')">All My Forms</button>
      ${sup ? `<button class="tab-btn ${st.tab==='all'?'active':''}" onclick="explorerTab('${cfg.key}','all')">All Staff</button>` : ''}
    </div>
    <div class="card" style="padding:10px 12px">
      <div style="display:flex;justify-content:space-between;align-items:center;cursor:pointer" onclick="explorerToggleFilters('${cfg.key}')">
        <span class="text-sm" style="font-weight:600">▼ Filter Settings ${(st.from||st.to||st.status||st.project||st.employee)?'<span class="badge-pill">on</span>':''}</span>
        <span class="text-sm text-muted">${rows.length} record${rows.length===1?'':'s'}</span>
      </div>
      <div id="explorer-filters-${cfg.key}" style="display:${st.filtersOpen?'grid':'none'};grid-template-columns:1fr 1fr;gap:8px;margin-top:10px">
        <div class="form-group" style="margin:0"><label>From</label><input type="date" value="${st.from}" onchange="explorerFilter('${cfg.key}','from',this.value)"></div>
        <div class="form-group" style="margin:0"><label>To</label><input type="date" value="${st.to}" onchange="explorerFilter('${cfg.key}','to',this.value)"></div>
        <div class="form-group" style="margin:0"><label>Status</label>
          <select onchange="explorerFilter('${cfg.key}','status',this.value)"><option value="">Any</option>${statuses.map(s=>`<option value="${s}" ${st.status===s?'selected':''}>${s}</option>`).join('')}</select></div>
        <div class="form-group" style="margin:0"><label>Project</label>
          <select onchange="explorerFilter('${cfg.key}','project',this.value)"><option value="">Any</option>${projects.map(p=>`<option value="${p.id}" ${st.project==String(p.id)?'selected':''}>${esc(p.name)}</option>`).join('')}</select></div>
        ${sup && st.tab==='all' ? `<div class="form-group" style="margin:0;grid-column:1/-1"><label>Employee</label>
          <select onchange="explorerFilter('${cfg.key}','employee',this.value)"><option value="">Any</option>${users.map(u=>`<option value="${u.id}" ${st.employee==String(u.id)?'selected':''}>${esc(u.name)}</option>`).join('')}</select></div>` : ''}
        <button class="btn btn-ghost btn-sm" style="grid-column:1/-1" onclick="explorerClear('${cfg.key}')">Clear filters</button>
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:10px">
      <input type="search" placeholder="Type and press Enter to search" value="${esc(st.q)}"
        onkeydown="if(event.key==='Enter')explorerSearch('${cfg.key}',this.value)" onsearch="explorerSearch('${cfg.key}',this.value)">
    </div>
    <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
      <button class="btn btn-outline btn-sm" onclick="explorerExportExcel('${cfg.key}')">📊 Export to Excel</button>
      <button class="btn btn-outline btn-sm" onclick="explorerExportPDF('${cfg.key}')">📄 Export to PDF</button>
    </div>
    ${rows.length ? rows.map(r => `
      <div class="list-item" onclick="${cfg.onOpen}(${r.id})">
        <div class="list-item-left">
          <div class="list-item-title">${cfg.rowTitle(r, { projName, userName })}</div>
          <div class="list-item-sub">${cfg.rowSub(r, { projName, userName })}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="status status-${esc(r.status||'submitted')}">${esc(r.status||'submitted')}</span>
          <span class="chevron">›</span>
        </div>
      </div>`).join('')
    : `<div class="empty-state"><p>No records to display</p></div>`}
  `;
}

window.explorerTab = (key, tab) => { explorerState[key].tab = tab; renderExplorer(window[`_explorer_${key}_cfg`]); };
window.explorerToggleFilters = key => { explorerState[key].filtersOpen = !explorerState[key].filtersOpen; renderExplorer(window[`_explorer_${key}_cfg`]); };
window.explorerFilter = (key, f, v) => { explorerState[key][f] = v; renderExplorer(window[`_explorer_${key}_cfg`]); };
window.explorerSearch = (key, q) => { explorerState[key].q = q.trim(); renderExplorer(window[`_explorer_${key}_cfg`]); };
window.explorerClear = key => { Object.assign(explorerState[key], { from: '', to: '', status: '', project: '', employee: '', q: '' }); renderExplorer(window[`_explorer_${key}_cfg`]); };
window.explorerExportExcel = async key => {
  const cfg = window[`_explorer_${key}_cfg`], rows = window[`_explorer_${key}_rows`];
  if (!rows?.length) { toast('Nothing to export', 'error'); return; }
  const data = await cfg.exportRows(rows);
  await exportToExcel(`${cfg.exportName || key}_${today()}.xlsx`, [{ name: cfg.title, rows: data, headers: cfg.exportHeaders }]);
};
window.explorerExportPDF = async key => {
  const cfg = window[`_explorer_${key}_cfg`], rows = window[`_explorer_${key}_rows`];
  if (!rows?.length) { toast('Nothing to export', 'error'); return; }
  const data = await cfg.exportRows(rows);
  const doc = newPDF();
  let y = pdfHeader(doc, cfg.pdfTitle || cfg.title, `${data.length} records · exported by ${me().name}`);
  const cols = cfg.pdfCols || cfg.exportHeaders.map(h => ({ label: h.label, key: h.key, w: (PW - 2 * PM) / cfg.exportHeaders.length }));
  pdfTable(doc, y, cols, data);
  pdfFooter(doc);
  doc.save(`${cfg.exportName || key}_${today()}.pdf`);
};

// ═════════════════════════════════════════════════════════════════════════════
//  DAILY WORK RECORDS (LEM explorer)
// ═════════════════════════════════════════════════════════════════════════════
const HOUR_TYPES = [['survey', 'Surveying'], ['draft', 'Drafting'], ['office', 'Office'], ['other', 'Other'], ['travel', 'Travel']];

export async function renderDWRExplorer() {
  const projects = await getProjects(false);
  const users = await getAllUsers();
  await renderExplorer({
    key: 'dwr', title: 'Daily Work Records', containerId: 'page-lem',
    createLabel: 'Create', onCreate: 'openNewLEMModal()',
    load: () => db().lems.toArray(),
    rowTitle: r => esc(r.lemNumber || `LEM-${String(r.id).padStart(4, '0')}`),
    rowSub: (r, h) => {
      const hrs = (r.labourItems || []).reduce((s, l) => s + (l.total || 0), 0);
      return `${r.date} • ${esc(h.projName(r.projectId) || '-')} • ${hrs.toFixed(1)}h${isSup() ? ' • ' + esc(h.userName(r.userId)) : ''}`;
    },
    onOpen: 'viewLEM',
    exportName: 'DWR',
    exportHeaders: [
      { key: 'lem', label: 'DWR / LEM #', width: 16 }, { key: 'date', label: 'Date', width: 12 }, { key: 'project', label: 'Project', width: 28 },
      { key: 'projectNumber', label: 'Job #', width: 10 }, { key: 'employee', label: 'Employee', width: 20 }, { key: 'title', label: 'Role', width: 22 },
      { key: 'survey', label: 'Surveying', width: 10 }, { key: 'draft', label: 'Drafting', width: 10 }, { key: 'office', label: 'Office', width: 8 },
      { key: 'other', label: 'Other', width: 8 }, { key: 'travel', label: 'Travel', width: 8 }, { key: 'total', label: 'Total Hrs', width: 10 },
      { key: 'km', label: 'KM', width: 8 }, { key: 'status', label: 'Status', width: 10 }, { key: 'submittedBy', label: 'Submitted By', width: 20 }, { key: 'notes', label: 'Notes', width: 40 }
    ],
    pdfCols: [
      { label: 'DWR #', key: 'lem', w: 28 }, { label: 'Date', key: 'date', w: 20 }, { label: 'Project', key: 'project', w: 42 },
      { label: 'Employee', key: 'employee', w: 32 }, { label: 'Role', key: 'title', w: 30 }, { label: 'Hrs', key: 'total', w: 14, align: 'right' },
      { label: 'Status', key: 'status', w: 18 }, { label: 'By', key: 'submittedBy', w: 12 }
    ],
    exportRows: rows => {
      const out = [];
      rows.forEach(r => {
        const p = projects.find(x => x.id === r.projectId);
        const by = users.find(u => u.id === r.userId)?.name || '';
        const items = (r.labourItems || []).length ? r.labourItems : [{ name: by, total: 0 }];
        items.forEach(l => out.push({
          lem: r.lemNumber || `LEM-${String(r.id).padStart(4, '0')}`, date: r.date, project: p?.name || '', projectNumber: p?.projectNumber || '',
          employee: l.name || by, title: l.title || '', survey: l.survey || 0, draft: l.draft || 0, office: l.office || 0, other: l.other || 0,
          travel: l.travel || 0, total: l.total || 0, km: Math.max(0, (l.kmStop || 0) - (l.kmStart || 0)), status: r.status, submittedBy: by, notes: r.notes || ''
        }));
      });
      return out;
    }
  });
}

// ═════════════════════════════════════════════════════════════════════════════
//  TIME CARDS (derived from LEM labour rows)
// ═════════════════════════════════════════════════════════════════════════════
const tcState = { from: '', to: '', group: '', employee: '' };

export async function renderTimeCards() {
  const container = $('page-timecards').querySelector('.page-scroll');
  if (!tcState.from) {
    const d = new Date(); d.setDate(d.getDate() - 14);
    tcState.from = d.toISOString().slice(0, 10); tcState.to = today();
  }
  const [lems, projects, users] = await Promise.all([db().lems.toArray(), getProjects(false), getAllUsers()]);
  const sup = isSup();

  // Flatten to one row per employee × hour type
  const rows = [];
  lems.filter(l => l.date >= tcState.from && l.date <= tcState.to).forEach(l => {
    const p = projects.find(x => x.id === l.projectId);
    (l.labourItems || []).forEach(li => {
      if (!sup && li.userId !== me().id && l.userId !== me().id) return;
      if (tcState.employee && String(li.userId) !== tcState.employee) return;
      HOUR_TYPES.forEach(([k, label]) => {
        const h = Number(li[k] || 0);
        if (h > 0) rows.push({ date: l.date, job: p?.projectNumber || String(l.projectId || ''), project: p?.name || '', lineItem: label, employee: li.name, hours: h, status: l.status, lem: l.lemNumber || '' });
      });
    });
  });
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.employee.localeCompare(b.employee));
  window._tcRows = rows;
  const total = rows.reduce((s, r) => s + r.hours, 0);

  // Grouping
  let body = '';
  const renderRow = r => `<tr><td>${r.date}</td><td>${esc(r.job)}</td><td>${esc(r.lineItem)}</td><td>${esc(r.employee)}</td><td style="text-align:right">${r.hours.toFixed(1)}</td><td><span class="status status-${r.status}">${r.status}</span></td></tr>`;
  if (tcState.group) {
    const groups = {};
    rows.forEach(r => { const k = r[tcState.group]; (groups[k] ||= []).push(r); });
    Object.keys(groups).sort().forEach(k => {
      const gt = groups[k].reduce((s, r) => s + r.hours, 0);
      body += `<tr class="tc-group"><td colspan="4">${esc(k)}</td><td style="text-align:right">${gt.toFixed(1)}</td><td></td></tr>` + groups[k].map(renderRow).join('');
    });
  } else body = rows.map(renderRow).join('');

  container.innerHTML = `
    <div class="section-header"><span class="section-title">My Time Cards</span></div>
    <div class="card" style="padding:10px 12px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div class="form-group" style="margin:0"><label>From</label><input type="date" id="tc-from" value="${tcState.from}"></div>
        <div class="form-group" style="margin:0"><label>To</label><input type="date" id="tc-to" value="${tcState.to}"></div>
        <div class="form-group" style="margin:0"><label>Group by</label>
          <select id="tc-group"><option value="">None</option><option value="date" ${tcState.group==='date'?'selected':''}>Date</option><option value="job" ${tcState.group==='job'?'selected':''}>Job #</option><option value="lineItem" ${tcState.group==='lineItem'?'selected':''}>Line Item</option><option value="employee" ${tcState.group==='employee'?'selected':''}>Employee</option><option value="status" ${tcState.group==='status'?'selected':''}>Status</option></select></div>
        ${sup ? `<div class="form-group" style="margin:0"><label>Employee</label>
          <select id="tc-emp"><option value="">All</option>${users.map(u=>`<option value="${u.id}" ${tcState.employee==String(u.id)?'selected':''}>${esc(u.name)}</option>`).join('')}</select></div>` : '<div></div>'}
      </div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <button class="btn btn-primary btn-sm" onclick="tcLoad()">Load Data</button>
        <button class="btn btn-outline btn-sm" onclick="tcExport()">📊 Export to Excel</button>
      </div>
    </div>
    <div class="card" style="padding:8px;overflow-x:auto">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px" class="text-sm text-muted">
        <span>${rows.length} line${rows.length===1?'':'s'}</span><span>Total: <strong style="color:var(--gold)">${total.toFixed(1)} h</strong></span>
      </div>
      <table class="data-table">
        <thead><tr><th>Date</th><th>Job #</th><th>Line Item</th><th>Employee</th><th style="text-align:right">Hours</th><th>Status</th></tr></thead>
        <tbody>${body || '<tr><td colspan="6" class="text-muted" style="text-align:center;padding:20px">No time entries in this range</td></tr>'}</tbody>
      </table>
    </div>`;
}
window.tcLoad = () => {
  tcState.from = $('tc-from').value; tcState.to = $('tc-to').value; tcState.group = $('tc-group').value;
  tcState.employee = $('tc-emp')?.value || '';
  renderTimeCards();
};
window.tcExport = () => exportToExcel(`TimeCards_${tcState.from}_${tcState.to}.xlsx`, [{
  name: 'Time Cards', rows: window._tcRows || [],
  headers: [{ key: 'date', label: 'Date', width: 12 }, { key: 'job', label: 'Job #', width: 10 }, { key: 'project', label: 'Project', width: 28 }, { key: 'lineItem', label: 'Line Item', width: 14 },
            { key: 'employee', label: 'Employee', width: 22 }, { key: 'hours', label: 'Hours', width: 8 }, { key: 'status', label: 'Status', width: 10 }, { key: 'lem', label: 'DWR #', width: 16 }]
}]);

// ═════════════════════════════════════════════════════════════════════════════
//  SAFETY FORM LIBRARY - schema-driven forms
// ═════════════════════════════════════════════════════════════════════════════
// Field types: text, textarea, date, time, number, select, toggle, checklist,
// repeater (sub-fields), signature, photo, info, employee
const SEV = ['Low: first aid / no injury', 'Medium: medical aid', 'High: lost time / serious', 'Critical: fatality potential'];

export const SAFETY_FORMS = {
  incident: {
    title: 'Employee Incident Report', icon: '🩹', notify: true,
    fields: [
      { k: 'date', l: 'Date of Incident', t: 'date' }, { k: 'time', l: 'Time', t: 'time' },
      { k: 'projectId', l: 'Project', t: 'project' }, { k: 'location', l: 'Exact Location', t: 'text' },
      { k: 'incidentType', l: 'Incident Type', t: 'select', o: ['Injury', 'Near Miss', 'Property Damage', 'Vehicle', 'Environmental Spill', 'Public / Third Party', 'Other'] },
      { k: 'severity', l: 'Severity', t: 'select', o: SEV },
      { k: 'injuredName', l: 'Injured / Involved Person', t: 'text' }, { k: 'bodyPart', l: 'Body Part / Damage', t: 'text' },
      { k: 'description', l: 'Description of What Happened', t: 'textarea' },
      { k: 'firstAid', l: 'First aid administered', t: 'toggle' }, { k: 'medical', l: 'Medical attention required', t: 'toggle' },
      { k: 'worksafe', l: 'WorkSafeBC / OHS reportable', t: 'toggle' },
      { k: 'witnesses', l: 'Witnesses', t: 'repeater', f: [{ k: 'name', l: 'Name' }, { k: 'phone', l: 'Phone' }] },
      { k: 'rootCause', l: 'Immediate / Root Cause', t: 'textarea' }, { k: 'corrective', l: 'Corrective Actions', t: 'textarea' },
      { k: 'photos', l: 'Photos', t: 'photo' },
      { k: 'reportedTo', l: 'Reported To (Supervisor)', t: 'text' }, { k: 'signature', l: 'Reporter Signature', t: 'signature' }
    ]
  },
  toolbox: {
    title: 'Toolbox / Tailgate Meeting', icon: '📣',
    fields: [
      { k: 'date', l: 'Date', t: 'date' }, { k: 'time', l: 'Time', t: 'time' },
      { k: 'projectId', l: 'Project', t: 'project' }, { k: 'location', l: 'Location', t: 'text' },
      { k: 'leader', l: 'Meeting Leader', t: 'text', d: 'me' },
      { k: 'topics', l: 'Topics Discussed', t: 'checklist', o: ['Site hazards today', 'PPE requirements', 'Traffic / public interface', 'Underground utilities', 'Heavy equipment / lifting', 'Weather', 'Emergency plan & muster point', 'Recent incidents / lessons learned', 'Housekeeping', 'Fit for work'] },
      { k: 'notes', l: 'Discussion Notes', t: 'textarea' },
      { k: 'actions', l: 'Action Items', t: 'repeater', f: [{ k: 'item', l: 'Action' }, { k: 'owner', l: 'Owner' }, { k: 'due', l: 'Due', t: 'date' }] },
      { k: 'attendees', l: 'Attendees (print & sign)', t: 'repeater', f: [{ k: 'name', l: 'Name' }, { k: 'company', l: 'Company' }], sig: true },
      { k: 'signature', l: 'Leader Signature', t: 'signature' }
    ]
  },
  hazardid: {
    title: 'Hazard ID / Near Miss / Enviro Report', icon: '⚠️', notify: true,
    fields: [
      { k: 'date', l: 'Date', t: 'date' }, { k: 'time', l: 'Time', t: 'time' },
      { k: 'projectId', l: 'Project', t: 'project' }, { k: 'location', l: 'Location', t: 'text' },
      { k: 'category', l: 'Report Type', t: 'select', o: ['Hazard Identification', 'Near Miss', 'Positive Observation', 'Environmental Concern', 'Public Safety'] },
      { k: 'description', l: 'What was observed?', t: 'textarea' },
      { k: 'severity', l: 'Potential Severity', t: 'select', o: SEV },
      { k: 'likelihood', l: 'Likelihood', t: 'select', o: ['Unlikely', 'Possible', 'Likely', 'Almost certain'] },
      { k: 'immediateAction', l: 'Immediate Action Taken', t: 'textarea' },
      { k: 'controlled', l: 'Hazard controlled / made safe', t: 'toggle' },
      { k: 'furtherAction', l: 'Further Action Required', t: 'textarea' },
      { k: 'photos', l: 'Photos', t: 'photo' }, { k: 'signature', l: 'Signature', t: 'signature' }
    ]
  },
  hseinspection: {
    title: 'HSE Site Inspection', icon: '🔍',
    fields: [
      { k: 'date', l: 'Date', t: 'date' }, { k: 'projectId', l: 'Project', t: 'project' }, { k: 'location', l: 'Site / Area', t: 'text' },
      { k: 'inspector', l: 'Inspector', t: 'text', d: 'me' },
      { k: 'items', l: 'Inspection Checklist (mark compliant items)', t: 'checklist', o: [
        'Site orientation & signage in place', 'FLHA / hazard assessment completed today', 'PPE worn correctly by all workers', 'First aid kit stocked & accessible', 'Fire extinguisher present & tagged',
        'Emergency contacts & muster point posted', 'Excavations sloped / shored, ladders in place', 'Traffic control plan followed', 'Overhead / underground utilities identified', 'Housekeeping acceptable',
        'Equipment inspected, guards in place', 'Fuel / chemicals stored properly (SDS available)', 'Spill kit available', 'Erosion & sediment controls maintained', 'Workers aware of task hazards'
      ] },
      { k: 'deficiencies', l: 'Deficiencies Found', t: 'repeater', f: [{ k: 'item', l: 'Deficiency' }, { k: 'action', l: 'Corrective Action' }, { k: 'owner', l: 'Owner' }, { k: 'due', l: 'Due', t: 'date' }] },
      { k: 'notes', l: 'General Comments', t: 'textarea' }, { k: 'photos', l: 'Photos', t: 'photo' }, { k: 'signature', l: 'Inspector Signature', t: 'signature' }
    ]
  },
  refusal: {
    title: 'Unsafe Work Refusal', icon: '✋', notify: true,
    fields: [
      { k: 'info', t: 'info', v: 'Under WorkSafeBC OHS Regulation 3.12 and Alberta OHS Act, a worker has the right to refuse work they reasonably believe presents an undue hazard. Report the refusal to your supervisor immediately. No worker will be disciplined for a good-faith refusal.' },
      { k: 'date', l: 'Date', t: 'date' }, { k: 'time', l: 'Time', t: 'time' },
      { k: 'projectId', l: 'Project', t: 'project' }, { k: 'location', l: 'Location', t: 'text' },
      { k: 'task', l: 'Task Refused', t: 'text' },
      { k: 'reason', l: 'Reason for Refusal (describe the hazard)', t: 'textarea' },
      { k: 'reportedTo', l: 'Supervisor Notified', t: 'text' }, { k: 'reportedAt', l: 'Time Notified', t: 'time' },
      { k: 'investigation', l: 'Supervisor Investigation / Findings', t: 'textarea' },
      { k: 'resolution', l: 'Resolution', t: 'select', o: ['Hazard eliminated, work resumed', 'Hazard controlled, work resumed', 'Work reassigned', 'Unresolved, escalated to JOHS Committee / WorkSafeBC'] },
      { k: 'workerAgrees', l: 'Worker agrees with resolution', t: 'toggle' },
      { k: 'signature', l: 'Worker Signature', t: 'signature' }, { k: 'supSignature', l: 'Supervisor Signature', t: 'signature' }
    ]
  },
  witness: {
    title: 'Witness Statement', icon: '👁️',
    fields: [
      { k: 'date', l: 'Date of Statement', t: 'date' }, { k: 'incidentDate', l: 'Date of Incident', t: 'date' }, { k: 'incidentTime', l: 'Time of Incident', t: 'time' },
      { k: 'projectId', l: 'Project', t: 'project' }, { k: 'location', l: 'Location', t: 'text' },
      { k: 'witnessName', l: 'Witness Name', t: 'text', d: 'me' }, { k: 'witnessCompany', l: 'Company / Position', t: 'text' }, { k: 'witnessPhone', l: 'Phone', t: 'text' },
      { k: 'relation', l: 'Relationship to incident', t: 'select', o: ['Directly involved', 'Eyewitness', 'Arrived after', 'Supervisor', 'Other'] },
      { k: 'statement', l: 'Statement (in your own words, what you saw and heard)', t: 'textarea', rows: 8 },
      { k: 'conditions', l: 'Weather / lighting / conditions', t: 'text' },
      { k: 'truth', l: 'I declare this statement is true to the best of my knowledge', t: 'toggle' },
      { k: 'signature', l: 'Witness Signature', t: 'signature' }
    ]
  },
  observation: {
    title: 'Worksite Observation', icon: '📝',
    fields: [
      { k: 'date', l: 'Date', t: 'date' }, { k: 'time', l: 'Time', t: 'time' },
      { k: 'projectId', l: 'Project', t: 'project' }, { k: 'location', l: 'Location', t: 'text' },
      { k: 'observer', l: 'Observer', t: 'text', d: 'me' },
      { k: 'type', l: 'Observation Type', t: 'select', o: ['Safe behaviour (positive)', 'At-risk behaviour', 'Unsafe condition', 'Housekeeping', 'Environmental', 'Quality'] },
      { k: 'categories', l: 'Categories', t: 'checklist', o: ['PPE', 'Body position / ergonomics', 'Tools & equipment', 'Procedures', 'Line of fire', 'Communication', 'Traffic / vehicles', 'Excavation', 'Environmental'] },
      { k: 'description', l: 'What was observed?', t: 'textarea' },
      { k: 'feedback', l: 'Feedback given / discussion', t: 'textarea' },
      { k: 'followUp', l: 'Follow-up required', t: 'toggle' }, { k: 'followUpDetail', l: 'Follow-up details', t: 'text' },
      { k: 'photos', l: 'Photos', t: 'photo' }, { k: 'signature', l: 'Signature', t: 'signature' }
    ]
  },
  policyack: {
    title: 'Policy Acknowledgement', icon: '📜',
    fields: [
      { k: 'date', l: 'Date', t: 'date' },
      { k: 'policyId', l: 'Policy Document', t: 'policy' },
      { k: 'ack', l: 'I have read and understood this policy and agree to comply', t: 'toggle', required: true },
      { k: 'questions', l: 'Questions / comments', t: 'textarea' },
      { k: 'signature', l: 'Employee Signature', t: 'signature' }
    ]
  }
};

const SAFETY_TILES = [
  { type: 'flha', title: 'Field Level Hazard Assessment (FLHA)', icon: '📋', open: "openSafetyForm('flha')" },
  { type: 'fitforwork', title: 'Fit for Work', icon: '✅', open: "openSafetyForm('fitforwork')" },
  { type: 'toolbox', title: 'Toolbox / Tailgate Meeting', icon: '📣' },
  { type: 'hazardid', title: 'Hazard ID / Near Miss / Enviro', icon: '⚠️' },
  { type: 'incident', title: 'Employee Incident Report', icon: '🩹' },
  { type: 'hseinspection', title: 'HSE Site Inspection', icon: '🔍' },
  { type: 'walkaround', title: 'Light Vehicle Inspection', icon: '🚛', open: "navigate('walkaround')", explore: "navigate('walkaround')" },
  { type: 'refusal', title: 'Unsafe Work Refusal', icon: '✋' },
  { type: 'witness', title: 'Witness Statement', icon: '👁️' },
  { type: 'observation', title: 'Worksite Observation', icon: '📝' },
  { type: 'simops', title: 'SIMOPS', icon: '🔀', open: 'openSIMOPSForm()' },
  { type: 'environmental', title: 'Environmental Form', icon: '🌱', open: 'openEnvironmentalForm()' },
  { type: 'policy', title: 'Policy Documentation', icon: '📜', open: 'openPolicyLibrary()', explore: 'openPolicyLibrary()' }
];
const TYPE_TITLE = t => SAFETY_FORMS[t]?.title || SAFETY_TILES.find(x => x.type === t)?.title || t.toUpperCase();

export async function renderSafetyDashboard() {
  const container = $('page-safety').querySelector('.page-scroll');
  const forms = await db().safetyForms.toArray();
  const counts = {};
  forms.forEach(f => counts[f.type] = (counts[f.type] || 0) + 1);
  container.innerHTML = `
    <div class="section-header"><span class="section-title">Safety</span>
      <button class="btn btn-outline btn-sm" onclick="navigate('safety-explore')">Explore All</button></div>
    <div class="tile-grid">
      ${SAFETY_TILES.map(t => `
        <div class="tile">
          <div class="tile-head">${esc(t.title)}</div>
          <div class="tile-icon">${t.icon}</div>
          <button class="tile-link" onclick="${t.open || `openLibraryForm('${t.type}')`}">Create New</button>
          <button class="tile-link" onclick="${t.explore || `exploreSafety('${t.type}')`}">Explore${counts[t.type] ? ` (${counts[t.type]})` : ''}</button>
        </div>`).join('')}
    </div>`;
}

window.exploreSafety = type => { explorerState.safety ||= {}; explorerState.safety.typeFilter = type; window.navigate('safety-explore'); };

export async function renderSafetyExplorer() {
  const st = explorerState.safety ||= {};
  const type = st.typeFilter || '';
  await renderExplorer({
    key: 'safety', title: type ? TYPE_TITLE(type) : 'All Safety Forms', containerId: 'page-safety-explore',
    createLabel: 'Create', onCreate: type && SAFETY_FORMS[type] ? `openLibraryForm('${type}')` : "navigate('safety')",
    load: async () => { const all = await db().safetyForms.toArray(); return type ? all.filter(f => f.type === type) : all; },
    statuses: ['submitted', 'reviewed', 'closed'],
    rowTitle: (r, h) => `${esc(TYPE_TITLE(r.type))} - ${r.date}`,
    rowSub: (r, h) => `${esc(r.location || r.task || r.description?.slice(0, 60) || '')}${isSup() ? ' • ' + esc(h.userName(r.userId)) : ''}`,
    onOpen: 'viewSafetyForm',
    exportName: 'SafetyForms',
    exportHeaders: [{ key: 'type', label: 'Form', width: 26 }, { key: 'date', label: 'Date', width: 12 }, { key: 'employee', label: 'Employee', width: 20 }, { key: 'project', label: 'Project', width: 26 },
                    { key: 'location', label: 'Location', width: 24 }, { key: 'summary', label: 'Summary', width: 50 }, { key: 'status', label: 'Status', width: 10 }],
    pdfCols: [{ label: 'Form', key: 'type', w: 38 }, { label: 'Date', key: 'date', w: 20 }, { label: 'Employee', key: 'employee', w: 30 }, { label: 'Project', key: 'project', w: 36 }, { label: 'Summary', key: 'summary', w: 54 }, { label: 'Status', key: 'status', w: 18 }],
    exportRows: async rows => {
      const [projects, users] = await Promise.all([getProjects(false), getAllUsers()]);
      return rows.map(r => ({
        type: TYPE_TITLE(r.type), date: r.date, employee: users.find(u => u.id === r.userId)?.name || '', project: projects.find(p => p.id === r.projectId)?.name || '',
        location: r.location || '', summary: (r.description || r.task || r.notes || r.reason || r.statement || '').slice(0, 200), status: r.status || 'submitted'
      }));
    }
  });
  // Type selector on top of the explorer
  const c = $('page-safety-explore').querySelector('.page-scroll');
  const sel = document.createElement('div');
  sel.className = 'form-group';
  sel.innerHTML = `<select onchange="exploreSafety(this.value)"><option value="">All form types</option>${SAFETY_TILES.filter(t => t.type !== 'policy' && t.type !== 'walkaround').map(t => `<option value="${t.type}" ${type === t.type ? 'selected' : ''}>${esc(t.title)}</option>`).join('')}</select>`;
  c.insertBefore(sel, c.children[1]);
}

// ── Rendering a schema form ──────────────────────────────────────────────────
let sigCounter = 0;
function bindSig(canvas) {
  const ctx = canvas.getContext('2d'); ctx.strokeStyle = '#2a1640'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  let drawing = false;
  const pos = e => { const r = canvas.getBoundingClientRect(); const s = canvas.width / r.width; const src = e.touches ? e.touches[0] : e; return { x: (src.clientX - r.left) * s, y: (src.clientY - r.top) * s }; };
  const start = e => { e.preventDefault(); drawing = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); canvas.dataset.signed = '1'; };
  const move = e => { if (!drawing) return; e.preventDefault(); const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
  canvas.addEventListener('mousedown', start); canvas.addEventListener('mousemove', move); window.addEventListener('mouseup', () => drawing = false);
  canvas.addEventListener('touchstart', start, { passive: false }); canvas.addEventListener('touchmove', move, { passive: false }); canvas.addEventListener('touchend', () => drawing = false);
}
window.clearSigCanvas = id => { const c = $(id); if (c) { c.getContext('2d').clearRect(0, 0, c.width, c.height); delete c.dataset.signed; } };

function sigHtml(id) {
  return `<div class="sig-canvas-wrap"><canvas id="${id}" class="lib-sig" width="600" height="150" style="display:block;width:100%;touch-action:none"></canvas>
    <button type="button" class="sig-clear" onclick="clearSigCanvas('${id}')">Clear</button>
    ${me()?.signature ? `<button type="button" class="sig-use" onclick="useSavedSig('${id}')">Use my signature</button>` : ''}</div>`;
}
// Stamp the signature saved in My Profile onto a form's signature pad
window.useSavedSig = id => {
  const c = $(id); const sig = me()?.signature;
  if (!c || !sig) return;
  const img = new Image();
  img.onload = () => { const ctx = c.getContext('2d'); ctx.clearRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height); c.dataset.signed = '1'; };
  img.src = sig;
};

async function fieldHtml(f, ctx) {
  const id = `lf-${f.k}`;
  const wrap = inner => `<div class="form-group" data-k="${f.k}">${f.l ? `<label>${esc(f.l)}</label>` : ''}${inner}</div>`;
  const dflt = f.d === 'me' ? me().name : (f.d || '');
  switch (f.t) {
    case 'info': return `<div class="card" style="font-size:0.82rem;line-height:1.45;color:var(--muted)">${esc(f.v)}</div>`;
    case 'date': return wrap(`<input type="date" id="${id}" value="${today()}">`);
    case 'time': return wrap(`<input type="time" id="${id}" value="${new Date().toTimeString().slice(0, 5)}">`);
    case 'number': return wrap(`<input type="number" id="${id}" step="any">`);
    case 'text': return wrap(`<input type="text" id="${id}" value="${esc(dflt)}">`);
    case 'textarea': return wrap(`<textarea id="${id}" rows="${f.rows || 3}"></textarea>`);
    case 'select': return wrap(`<select id="${id}">${f.o.map(o => `<option>${esc(o)}</option>`).join('')}</select>`);
    case 'project': return wrap(`<select id="${id}"><option value="">Select project...</option>${ctx.projects.map(p => `<option value="${p.id}">${esc(p.projectNumber ? p.projectNumber + ' - ' : '')}${esc(p.name)}</option>`).join('')}</select>`);
    case 'employee': return wrap(`<select id="${id}"><option value="">Select...</option>${ctx.users.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select>`);
    case 'policy': return wrap(`<select id="${id}"><option value="">Select policy...</option>${ctx.policies.map(p => `<option value="${p.id}">${esc(p.title)} (v${esc(p.version || '1')})</option>`).join('')}</select>`);
    case 'toggle': return `<div class="toggle-row" data-k="${f.k}"><span class="toggle-label">${esc(f.l)}</span><button type="button" class="toggle" id="${id}" onclick="this.classList.toggle('on')"></button></div>`;
    case 'checklist': return wrap(`<div class="card" style="padding:6px 12px" id="${id}">${f.o.map((o, i) => `<div class="toggle-row"><span class="toggle-label" style="font-size:0.85rem">${esc(o)}</span><button type="button" class="toggle" data-v="${esc(o)}" onclick="this.classList.toggle('on')"></button></div>`).join('')}</div>`);
    case 'repeater': return `<div class="form-group" data-k="${f.k}"><div class="section-header" style="margin-bottom:6px"><span class="section-title" style="font-size:0.85rem">${esc(f.l)}</span>
        <button type="button" class="btn btn-sm btn-outline" onclick="libAddRow('${f.k}')">+ Add</button></div><div id="${id}-rows"></div></div>`;
    case 'photo': return wrap(`<input type="file" id="${id}" accept="image/*" capture="environment" multiple style="border:1.5px dashed var(--gold);background:transparent;padding:12px" onchange="libPreviewPhotos(this)"><div id="${id}-preview" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px"></div>`);
    case 'signature': return wrap(sigHtml(id));
  }
  return '';
}

window.libAddRow = k => {
  const f = window._libForm.fields.find(x => x.k === k);
  const rows = $(`lf-${k}-rows`);
  const row = document.createElement('div'); row.className = 'card lib-row'; row.style.padding = '8px';
  const cols = f.f.length;
  row.innerHTML = `<div style="display:grid;grid-template-columns:repeat(${Math.min(cols, 2)},1fr);gap:6px">
    ${f.f.map(sf => `<div class="form-group" style="margin:0"><label style="font-size:0.7rem">${esc(sf.l)}</label><input type="${sf.t || 'text'}" class="lr-${sf.k}" data-k="${sf.k}"></div>`).join('')}
  </div>${f.sig ? `<div style="margin-top:6px">${sigHtml('lib-sig-' + (++sigCounter))}</div>` : ''}
  <button type="button" onclick="this.closest('.lib-row').remove()" class="btn btn-danger btn-sm" style="margin-top:6px">Remove</button>`;
  rows.appendChild(row);
  if (f.sig) bindSig(row.querySelector('canvas'));
};

window.libPreviewPhotos = input => {
  const prev = $(input.id + '-preview'); prev.innerHTML = '';
  Array.from(input.files).forEach(file => {
    const r = new FileReader();
    r.onload = e => { const img = document.createElement('img'); img.src = e.target.result; img.style.cssText = 'width:80px;height:80px;object-fit:cover;border-radius:6px'; prev.appendChild(img); };
    r.readAsDataURL(file);
  });
};

function shrinkImage(file, max = 1280) {
  return new Promise(res => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = img.width * s; c.height = img.height * s;
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.75));
    };
    img.src = url;
  });
}

window.openLibraryForm = async type => {
  const def = SAFETY_FORMS[type];
  if (!def) { toast('Unknown form', 'error'); return; }
  const ctx = { projects: await getProjects(true), users: await getAllUsers(), policies: await db().policies.filter(r => r.active === true || r.active === 1).toArray() };
  window._libForm = { type, ...def };
  const parts = [];
  for (const f of def.fields) parts.push(await fieldHtml(f, ctx));
  const modal = $('library-modal-sheet');
  modal.innerHTML = `<div class="modal-handle"></div><div class="modal-title">${def.icon} ${esc(def.title)}</div>
    ${parts.join('')}
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:16px">
      <button class="btn btn-ghost" onclick="closeModal('library-modal')">Cancel</button>
      <button class="btn btn-outline" onclick="submitLibraryForm(true)">📄 Submit + PDF</button>
      <button class="btn btn-success" onclick="submitLibraryForm(false)">Submit</button>
    </div>`;
  modal.querySelectorAll('canvas.lib-sig').forEach(bindSig);
  def.fields.filter(f => f.t === 'repeater').forEach(f => window.libAddRow(f.k));
  openModal('library-modal');
};

async function collectLibraryForm() {
  const def = window._libForm; const data = {};
  for (const f of def.fields) {
    const id = `lf-${f.k}`; const elx = $(id);
    switch (f.t) {
      case 'info': break;
      case 'toggle': data[f.k] = elx?.classList.contains('on') || false; break;
      case 'checklist': data[f.k] = Array.from(elx.querySelectorAll('.toggle.on')).map(b => b.dataset.v); break;
      case 'repeater': data[f.k] = Array.from($(`${id}-rows`).querySelectorAll('.lib-row')).map(r => {
        const o = {}; r.querySelectorAll('input[data-k]').forEach(i => o[i.dataset.k] = i.value);
        const c = r.querySelector('canvas'); if (c && c.dataset.signed) o.signature = c.toDataURL('image/png');
        return o;
      }).filter(o => Object.values(o).some(v => v)); break;
      case 'photo': data[f.k] = []; for (const file of Array.from(elx.files || [])) data[f.k].push(await shrinkImage(file)); break;
      case 'signature': data[f.k] = elx?.dataset.signed ? elx.toDataURL('image/png') : null; break;
      case 'project': case 'policy': case 'employee': data[f.k] = parseInt(elx.value) || null; break;
      default: data[f.k] = elx?.value ?? '';
    }
  }
  return data;
}

window.submitLibraryForm = async withPdf => {
  const def = window._libForm;
  const data = await collectLibraryForm();
  for (const f of def.fields) if (f.required && !data[f.k]) { toast(`Required: ${f.l}`, 'error'); return; }
  if (!data.date) data.date = today();
  const rec = { ...data, type: def.type, userId: me().id, projectId: data.projectId || null, status: 'submitted', syncStatus: 'pending', createdAt: nowIso() };
  const id = await db().safetyForms.add(rec); rec.id = id;
  if (def.notify) await notifySupervisors(`${def.icon} ${def.title} submitted by ${me().name}${data.location ? ' at ' + data.location : ''}`, 'safety_alert');
  closeModal('library-modal');
  toast(`${def.title} submitted`, 'success');
  if (withPdf) await window.safetyFormPDF(id);
  if (window.currentPage === 'safety-explore') renderSafetyExplorer(); else renderSafetyDashboard();
};

// ── View + PDF for any safety form (schema or legacy) ───────────────────────
function describeForm(rec) {
  const def = SAFETY_FORMS[rec.type];
  const skip = new Set(['id', 'type', 'userId', 'status', 'syncStatus', 'createdAt', 'projectId', 'signature', 'supSignature', 'photos']);
  const out = [];
  if (def) {
    def.fields.forEach(f => {
      if (skip.has(f.k) || f.t === 'info') return;
      const v = rec[f.k];
      if (f.t === 'toggle') out.push({ l: f.l, v: v ? 'Yes' : 'No' });
      else if (f.t === 'checklist') out.push({ l: f.l, v: (v || []).length ? v.join('; ') : '-' });
      else if (f.t === 'repeater') out.push({ l: f.l, rows: v || [], cols: f.f });
      else if (f.t === 'policy') out.push({ l: f.l, v: rec._policyTitle || v || '-' });
      else out.push({ l: f.l, v: v ?? '-' });
    });
  } else {
    Object.keys(rec).filter(k => !skip.has(k) && k !== 'date').forEach(k => {
      const v = rec[k];
      out.push({ l: k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()), v: Array.isArray(v) ? v.map(x => typeof x === 'object' ? Object.values(x).filter(y => typeof y === 'string' && !y.startsWith('data:')).join(' / ') : x).join('; ') : (typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v ?? '-')) });
    });
  }
  return out;
}

window.viewSafetyForm = async id => {
  const rec = await db().safetyForms.get(id); if (!rec) return;
  const [user, projects] = await Promise.all([getUser(rec.userId), getProjects(false)]);
  if (rec.policyId) rec._policyTitle = (await db().policies.get(rec.policyId))?.title;
  const proj = projects.find(p => p.id === rec.projectId);
  const items = describeForm(rec);
  const modal = $('library-modal-sheet');
  modal.innerHTML = `<div class="modal-handle"></div><div class="modal-title">${esc(TYPE_TITLE(rec.type))}</div>
    <div class="text-sm text-muted">${rec.date} • ${esc(user?.name || '')} • <span class="status status-${esc(rec.status||'submitted')}">${esc(rec.status||'submitted')}</span></div>
    ${proj ? `<div class="text-sm text-muted mt-4">Project: <strong>${esc(proj.name)}</strong></div>` : ''}
    <div class="divider"></div>
    ${items.map(it => it.rows ? `<div class="form-group"><label>${esc(it.l)}</label>${it.rows.length ? it.rows.map(r => `<div class="list-item" style="padding:8px;cursor:default"><div class="list-item-left text-sm">${it.cols.map(c => r[c.k] ? `<strong>${esc(c.l)}:</strong> ${esc(r[c.k])} ` : '').join('')}${r.signature ? '<span class="text-gold">✍︎ signed</span>' : ''}</div></div>`).join('') : '<div class="text-sm text-muted">-</div>'}</div>`
      : `<div class="form-group"><label>${esc(it.l)}</label><div class="text-sm" style="white-space:pre-wrap">${esc(it.v || '-')}</div></div>`).join('')}
    ${(rec.photos || []).length ? `<div class="form-group"><label>Photos</label><div style="display:flex;gap:6px;flex-wrap:wrap">${rec.photos.map(p => `<img src="${p}" style="width:90px;height:90px;object-fit:cover;border-radius:6px">`).join('')}</div></div>` : ''}
    ${rec.signature ? `<div class="form-group"><label>Signature</label><img src="${rec.signature}" style="background:#fff;border-radius:6px;max-height:70px"></div>` : ''}
    ${rec.supSignature ? `<div class="form-group"><label>Supervisor Signature</label><img src="${rec.supSignature}" style="background:#fff;border-radius:6px;max-height:70px"></div>` : ''}
    ${isSup() && rec.status === 'submitted' ? `<div class="grid-2 mt-8"><button class="btn btn-outline" onclick="setSafetyStatus(${id},'reviewed')">Mark Reviewed</button><button class="btn btn-success" onclick="setSafetyStatus(${id},'closed')">Close Out</button></div>` : ''}
    <div class="grid-2 mt-8"><button class="btn btn-outline" onclick="safetyFormPDF(${id})">📄 PDF</button><button class="btn btn-ghost" onclick="closeModal('library-modal')">Close</button></div>`;
  openModal('library-modal');
};

window.setSafetyStatus = async (id, status) => {
  await db().safetyForms.update(id, { status, reviewedBy: me().id, reviewedAt: nowIso() });
  closeModal('library-modal'); toast(`Form marked ${status}`, 'success');
  if (window.currentPage === 'safety-explore') renderSafetyExplorer(); else renderSafetyDashboard();
};

window.safetyFormPDF = async id => {
  const rec = await db().safetyForms.get(id); if (!rec) return;
  const [user, projects] = await Promise.all([getUser(rec.userId), getProjects(false)]);
  if (rec.policyId) rec._policyTitle = (await db().policies.get(rec.policyId))?.title;
  const proj = projects.find(p => p.id === rec.projectId);
  const doc = newPDF();
  let y = pdfHeader(doc, TYPE_TITLE(rec.type), `${rec.date} · ${user?.name || ''}`);
  y = pdfKV(doc, y, 'Submitted by', user?.name || '');
  y = pdfKV(doc, y, 'Date', rec.date);
  if (proj) y = pdfKV(doc, y, 'Project', `${proj.projectNumber ? proj.projectNumber + ' - ' : ''}${proj.name}`);
  y = pdfKV(doc, y, 'Status', rec.status || 'submitted');
  y += 2;
  for (const it of describeForm(rec)) {
    if (it.rows) {
      y = pdfSection(doc, y, it.l);
      if (it.rows.length) {
        const w = (PW - 2 * PM) / it.cols.length;
        y = pdfTable(doc, y, it.cols.map(c => ({ label: c.l, key: c.k, w })), it.rows.map(r => Object.fromEntries(it.cols.map(c => [c.k, r[c.k] || '']))));
      } else y = pdfPara(doc, y, '-');
    } else if (String(it.v || '').length > 60) { y = pdfSection(doc, y, it.l); y = pdfPara(doc, y, it.v); }
    else y = pdfKV(doc, y, it.l, it.v);
  }
  if ((rec.photos || []).length) {
    y = pdfSection(doc, y, 'Photos');
    let x = PM;
    for (const p of rec.photos) {
      if (x + 60 > PW - PM) { x = PM; y += 48; }
      if (y + 45 > PH - 18) { doc.addPage(); y = 20; x = PM; }
      try { doc.addImage(p, 'JPEG', x, y, 58, 43); } catch (e) {}
      x += 62;
    }
    y += 50;
  }
  const sigs = [['Signature', rec.signature], ['Supervisor Signature', rec.supSignature]].filter(s => s[1]);
  if (sigs.length) {
    y = pdfSection(doc, y, 'Signatures');
    if (y + 30 > PH - 18) { doc.addPage(); y = 20; }
    sigs.forEach(([l, s], i) => { const x = PM + i * 95; doc.setFontSize(7.5); doc.text(l, x, y); try { doc.addImage(s, 'PNG', x, y + 2, 70, 18); } catch (e) {} doc.setDrawColor(...DUN.grey); doc.line(x, y + 21, x + 70, y + 21); });
    y += 28;
  }
  pdfFooter(doc);
  doc.save(`${TYPE_TITLE(rec.type).replace(/[^A-Za-z0-9]+/g, '_')}_${rec.date}_${(user?.name || '').replace(/\s+/g, '_')}.pdf`);
};

// ── Policy Documentation library ────────────────────────────────────────────
window.openPolicyLibrary = async () => {
  const policies = await db().policies.toArray();
  const acks = await db().safetyForms.where('type').equals('policyack').toArray();
  const users = await getAllUsers();
  const modal = $('library-modal-sheet');
  modal.innerHTML = `<div class="modal-handle"></div><div class="modal-title">📜 Policy Documentation</div>
    <div class="text-sm text-muted" style="margin-bottom:10px">Company policies and procedures. Open a policy to read it, then sign the acknowledgement.</div>
    ${isSup() ? `<button class="btn btn-outline btn-full" style="margin-bottom:10px" onclick="openAddPolicy()">+ Add Policy Document</button>` : ''}
    ${policies.filter(p => p.active || isSup()).map(p => {
      const myAck = acks.find(a => a.policyId === p.id && a.userId === me().id);
      const ackCount = new Set(acks.filter(a => a.policyId === p.id).map(a => a.userId)).size;
      return `<div class="list-item" style="cursor:default;flex-wrap:wrap;gap:6px">
        <div class="list-item-left">
          <div class="list-item-title">${esc(p.title)} <span class="text-muted text-sm">v${esc(p.version || '1')}</span>${p.active ? '' : ' <span class="status status-rejected">inactive</span>'}</div>
          <div class="list-item-sub">${esc(p.category || 'Policy')} • ${p.effectiveDate || ''}${isSup() ? ` • ${ackCount}/${users.length} acknowledged` : (myAck ? ' • ✅ acknowledged ' + myAck.date : ' • ⏳ not yet acknowledged')}</div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-sm btn-outline" onclick="openPolicyDoc(${p.id})">Open</button>
          ${!myAck ? `<button class="btn btn-sm btn-primary" onclick="ackPolicy(${p.id})">Sign</button>` : ''}
          ${isSup() ? `<button class="btn btn-sm btn-ghost" onclick="togglePolicy(${p.id},${p.active ? 0 : 1})">${p.active ? 'Retire' : 'Restore'}</button>` : ''}
        </div></div>`;
    }).join('') || '<div class="empty-state"><p>No policy documents yet</p></div>'}
    <button class="btn btn-ghost btn-full mt-8" onclick="closeModal('library-modal')">Close</button>`;
  openModal('library-modal');
};
window.openPolicyDoc = async id => {
  const p = await db().policies.get(id); if (!p) return;
  if (p.fileData) { const a = document.createElement('a'); a.href = p.fileData; a.download = p.fileName || (p.title + '.pdf'); a.click(); return; }
  const modal = $('library-modal-sheet');
  modal.innerHTML = `<div class="modal-handle"></div><div class="modal-title">${esc(p.title)}</div>
    <div class="text-sm text-muted">v${esc(p.version || '1')} • effective ${p.effectiveDate || '-'}</div><div class="divider"></div>
    <div style="white-space:pre-wrap;font-size:0.9rem;line-height:1.5">${esc(p.body || '')}</div>
    <div class="grid-2 mt-12"><button class="btn btn-primary" onclick="ackPolicy(${p.id})">Sign Acknowledgement</button><button class="btn btn-ghost" onclick="openPolicyLibrary()">Back</button></div>`;
};
window.ackPolicy = async policyId => { await window.openLibraryForm('policyack'); const s = $('lf-policyId'); if (s) s.value = policyId; };
window.togglePolicy = async (id, active) => { await db().policies.update(id, { active }); window.openPolicyLibrary(); };
window.openAddPolicy = () => {
  const modal = $('library-modal-sheet');
  modal.innerHTML = `<div class="modal-handle"></div><div class="modal-title">Add Policy Document</div>
    <div class="form-group"><label>Title</label><input type="text" id="pol-title"></div>
    <div class="form-group"><label>Category</label><select id="pol-cat"><option>Health & Safety</option><option>Environmental</option><option>HR / Conduct</option><option>Drug & Alcohol</option><option>Vehicle / Driving</option><option>Quality</option><option>Other</option></select></div>
    <div class="grid-2"><div class="form-group"><label>Version</label><input type="text" id="pol-ver" value="1.0"></div><div class="form-group"><label>Effective Date</label><input type="date" id="pol-date" value="${today()}"></div></div>
    <div class="form-group"><label>Policy Text (or attach a PDF below)</label><textarea id="pol-body" rows="8"></textarea></div>
    <div class="form-group"><label>Attach PDF (optional, max ~2 MB)</label><input type="file" id="pol-file" accept="application/pdf" style="border:1.5px dashed var(--gold);background:transparent;padding:12px"></div>
    <div class="grid-2"><button class="btn btn-ghost" onclick="openPolicyLibrary()">Cancel</button><button class="btn btn-primary" onclick="savePolicy()">Save</button></div>`;
};
window.savePolicy = async () => {
  const title = $('pol-title').value.trim(); if (!title) { toast('Title required', 'error'); return; }
  const file = $('pol-file').files[0]; let fileData = null, fileName = null;
  if (file) {
    if (file.size > 2.5e6) { toast('PDF too large (limit 2 MB)', 'error'); return; }
    fileData = await new Promise(r => { const fr = new FileReader(); fr.onload = e => r(e.target.result); fr.readAsDataURL(file); }); fileName = file.name;
  }
  await db().policies.add({ title, category: $('pol-cat').value, version: $('pol-ver').value, effectiveDate: $('pol-date').value, body: $('pol-body').value, fileData, fileName, active: 1, createdBy: me().id, createdAt: nowIso() });
  const users = await getAllUsers();
  for (const u of users) if (u.id !== me().id) await db().notifications.add({ toUserId: u.id, fromUserId: me().id, message: `📜 New policy to acknowledge: ${title}`, scheduledAt: nowIso(), read: false, type: 'policy' });
  toast('Policy saved, staff notified', 'success'); window.openPolicyLibrary();
};

// ═════════════════════════════════════════════════════════════════════════════
//  CONFIDENTIAL REPORTING
// ═════════════════════════════════════════════════════════════════════════════
export async function renderConfidential() {
  const container = $('page-confidential').querySelector('.page-scroll');
  const sup = isSup();
  let reviewHtml = '';
  if (sup) {
    const reports = await db().confidentialReports.reverse().sortBy('createdAt');
    reviewHtml = `<div class="section-header mt-16"><span class="section-title">Received Reports (designated reviewers only)</span></div>
      ${reports.length ? reports.map(r => `<div class="list-item" onclick="viewConfidential(${r.id})">
        <div class="list-item-left"><div class="list-item-title">${r.anonymous ? '🕶️ Anonymous' : '👤 ' + esc(r.reporterName)} - ${r.createdAt.slice(0, 10)}</div>
        <div class="list-item-sub">${esc(r.details.slice(0, 90))}${r.details.length > 90 ? '…' : ''}</div></div>
        <span class="status status-${r.status === 'open' ? 'submitted' : 'approved'}">${r.status}</span></div>`).join('') : '<div class="empty-state"><p>No reports received</p></div>'}`;
  }
  container.innerHTML = `
    <div class="section-header"><span class="section-title">Confidential Reporting</span></div>
    <div class="card" style="font-size:0.85rem;line-height:1.5;color:var(--text)">
      <p>This form gives every employee a safe and confidential way to report concerns about unethical behaviour, violations of company policy, unsafe practices, illegal activity, or other conduct inconsistent with Dùn Construction Services' values.</p>
      <p class="mt-8">Reports may be submitted <strong>anonymously</strong>. You are not required to provide your name unless you choose to. Complete anonymity may limit our ability to fully investigate or follow up.</p>
      <p class="mt-8">All reports are treated as <strong>confidential</strong> and reviewed by designated personnel only. Information is shared strictly on a need-to-know basis.</p>
      <p class="mt-8">The Company strictly <strong>prohibits retaliation</strong> against anyone who submits a report in good faith. Retaliation is itself a serious violation of company policy and will result in disciplinary action.</p>
      <p class="mt-8">This form should <strong>not</strong> be used for emergencies or immediate danger to people, property, or the environment. In those cases contact your supervisor or emergency services following the Dùn emergency reporting procedure.</p>
      <p class="mt-8 text-muted">By submitting, you acknowledge the information is accurate to the best of your knowledge and submitted in good faith.</p>
    </div>
    <div class="form-group"><label>Report Details</label><textarea id="cr-details" rows="7" placeholder="Describe your concern in as much detail as you are comfortable sharing." oninput="document.getElementById('cr-count').textContent=this.value.length"></textarea>
      <div class="text-sm text-muted">Character count: <span id="cr-count">0</span></div></div>
    <div class="toggle-row"><span class="toggle-label" style="font-size:0.85rem">Include my name with this report. If left off, the report is stored and sent without your identity.</span><button class="toggle" id="cr-identify" onclick="this.classList.toggle('on')"></button></div>
    <div class="form-group mt-8"><label>Attach photo / document (optional)</label><input type="file" id="cr-file" accept="image/*,application/pdf" style="border:1.5px dashed var(--gold);background:transparent;padding:12px"></div>
    <button class="btn btn-primary btn-full mt-8" onclick="submitConfidential()">Submit Report</button>
    ${reviewHtml}`;
}

window.submitConfidential = async () => {
  const details = $('cr-details').value.trim();
  if (details.length < 10) { toast('Please describe your concern', 'error'); return; }
  const identify = $('cr-identify').classList.contains('on');
  let attachment = null;
  const file = $('cr-file').files[0];
  if (file) attachment = file.type.startsWith('image/') ? await shrinkImage(file) : await new Promise(r => { const fr = new FileReader(); fr.onload = e => r(e.target.result); fr.readAsDataURL(file); });
  await db().confidentialReports.add({
    details, anonymous: !identify, reporterId: identify ? me().id : null, reporterName: identify ? me().name : null, reporterEmail: identify ? me().email : null,
    attachment, attachmentName: file?.name || null, status: 'open', createdAt: nowIso()
  });
  // Notify designated reviewers without revealing identity
  const sups = await db().users.where('role').equals('supervisor').toArray();
  for (const s of sups) await db().notifications.add({ toUserId: s.id, fromUserId: 0, message: '🔒 A new confidential report has been submitted', scheduledAt: nowIso(), read: false, type: 'confidential' });
  // Best-effort email through Microsoft Graph if connected
  try {
    if (window.DR_sendEmail && window.DR_isMSConnected?.()) {
      await window.DR_sendEmail({ to: sups.map(s => s.email).filter(Boolean), subject: 'Confidential report submitted (DÙN RIGHT)', body: `A confidential report was submitted ${identify ? 'by ' + me().name : 'anonymously'}.\n\n${details}` });
    }
  } catch (e) { console.warn('confidential email skipped', e); }
  $('cr-details').value = ''; $('cr-count').textContent = '0'; $('cr-identify').classList.remove('on'); $('cr-file').value = '';
  toast('Report submitted. Thank you.', 'success');
  if (isSup()) renderConfidential();
};

window.viewConfidential = async id => {
  const r = await db().confidentialReports.get(id); if (!r) return;
  const modal = $('library-modal-sheet');
  modal.innerHTML = `<div class="modal-handle"></div><div class="modal-title">🔒 Confidential Report</div>
    <div class="text-sm text-muted">${r.createdAt.slice(0, 16).replace('T', ' ')} • ${r.anonymous ? 'Anonymous' : esc(r.reporterName) + ' (' + esc(r.reporterEmail || '') + ')'} • <span class="status status-${r.status === 'open' ? 'submitted' : 'approved'}">${r.status}</span></div>
    <div class="divider"></div><div style="white-space:pre-wrap;font-size:0.9rem;line-height:1.5">${esc(r.details)}</div>
    ${r.attachment ? (r.attachment.startsWith('data:image') ? `<img src="${r.attachment}" style="max-width:100%;border-radius:8px;margin-top:10px">` : `<a class="btn btn-outline btn-sm mt-8" href="${r.attachment}" download="${esc(r.attachmentName || 'attachment')}">Download attachment</a>`) : ''}
    <div class="form-group mt-12"><label>Reviewer Notes</label><textarea id="cr-notes" rows="3">${esc(r.reviewNotes || '')}</textarea></div>
    <div class="grid-2"><button class="btn btn-outline" onclick="closeConfidential(${id},'under review')">Save Notes</button><button class="btn btn-success" onclick="closeConfidential(${id},'closed')">Close Report</button></div>
    <button class="btn btn-ghost btn-full mt-8" onclick="closeModal('library-modal')">Back</button>`;
  openModal('library-modal');
};
window.closeConfidential = async (id, status) => {
  await db().confidentialReports.update(id, { status, reviewNotes: $('cr-notes').value, reviewedBy: me().id, reviewedAt: nowIso() });
  closeModal('library-modal'); toast('Saved', 'success'); renderConfidential();
};

// ═════════════════════════════════════════════════════════════════════════════
//  EXPENSE ENVELOPES
// ═════════════════════════════════════════════════════════════════════════════
const EXP_CATS = ['Fuel', 'Meals', 'Accommodation', 'Materials / Supplies', 'Equipment Rental', 'Parking / Tolls', 'Vehicle Repair', 'Safety / PPE', 'Office', 'Other'];
const money = n => '$' + Number(n || 0).toFixed(2);
const envTotal = e => (e.lines || []).reduce((s, l) => s + (Number(l.amount) || 0), 0);

export async function renderExpenses() {
  const projects = await getProjects(false); const users = await getAllUsers();
  await renderExplorer({
    key: 'expenses', title: 'Expense Envelopes', containerId: 'page-expenses',
    createLabel: 'Create', onCreate: 'openEnvelope()',
    load: () => db().expenseEnvelopes.toArray(),
    statuses: ['draft', 'submitted', 'approved', 'rejected', 'paid'],
    rowTitle: r => `${esc(r.title)} - ${money(envTotal(r))}`,
    rowSub: (r, h) => `${r.date} • ${(r.lines || []).length} item${(r.lines || []).length === 1 ? '' : 's'}${isSup() ? ' • ' + esc(h.userName(r.userId)) : ''}`,
    onOpen: 'openEnvelope',
    exportName: 'Expenses',
    exportHeaders: [{ key: 'envelope', label: 'Envelope', width: 24 }, { key: 'envDate', label: 'Envelope Date', width: 13 }, { key: 'employee', label: 'Employee', width: 20 }, { key: 'status', label: 'Status', width: 10 },
                    { key: 'date', label: 'Receipt Date', width: 12 }, { key: 'vendor', label: 'Vendor', width: 22 }, { key: 'category', label: 'Category', width: 16 }, { key: 'project', label: 'Project', width: 24 },
                    { key: 'billable', label: 'Billable', width: 8 }, { key: 'subtotal', label: 'Subtotal', width: 10 }, { key: 'gst', label: 'GST', width: 8 }, { key: 'amount', label: 'Total', width: 10 }, { key: 'notes', label: 'Notes', width: 30 }],
    pdfCols: [{ label: 'Envelope', key: 'envelope', w: 36 }, { label: 'Employee', key: 'employee', w: 30 }, { label: 'Date', key: 'date', w: 20 }, { label: 'Vendor', key: 'vendor', w: 36 }, { label: 'Category', key: 'category', w: 26 }, { label: 'Bill', key: 'billable', w: 12 }, { label: 'Total', key: 'amount', w: 20, align: 'right' }, { label: 'Status', key: 'status', w: 16 }],
    exportRows: rows => {
      const out = [];
      rows.forEach(e => {
        const by = users.find(u => u.id === e.userId)?.name || '';
        (e.lines || []).forEach(l => out.push({ envelope: e.title, envDate: e.date, employee: by, status: e.status, date: l.date, vendor: l.vendor, category: l.category, project: projects.find(p => p.id === l.projectId)?.name || '',
          billable: l.billable ? 'Yes' : 'No', subtotal: Number(l.amount || 0) - Number(l.gst || 0), gst: Number(l.gst || 0), amount: Number(l.amount || 0), notes: l.notes || '' }));
      });
      return out;
    }
  });
}

window.openEnvelope = async id => {
  const projects = await getProjects(true);
  const env = id ? await db().expenseEnvelopes.get(id) : { title: `Expenses ${today().slice(0, 7)}`, date: today(), lines: [], status: 'draft', userId: me().id };
  const editable = env.status === 'draft' && env.userId === me().id;
  const owner = id ? await getUser(env.userId) : me();
  window._env = env; window._envProjects = projects;
  const modal = $('library-modal-sheet');
  modal.innerHTML = `<div class="modal-handle"></div><div class="modal-title">💵 ${id ? esc(env.title) : 'New Expense Envelope'}</div>
    <div class="text-sm text-muted">${esc(owner?.name || '')} • <span class="status status-${env.status}">${env.status}</span>${env.approvedAt ? ' • approved ' + env.approvedAt.slice(0, 10) : ''}</div>
    <div class="grid-2 mt-8">
      <div class="form-group"><label>Envelope Title</label><input type="text" id="env-title" value="${esc(env.title)}" ${editable ? '' : 'disabled'}></div>
      <div class="form-group"><label>Date</label><input type="date" id="env-date" value="${env.date}" ${editable ? '' : 'disabled'}></div>
    </div>
    <div class="section-header"><span class="section-title">Receipts</span>${editable ? '<button class="btn btn-sm btn-outline" onclick="envAddLine()">+ Add Receipt</button>' : ''}</div>
    <div id="env-lines"></div>
    <div class="card" style="text-align:right;padding:10px"><span class="text-muted text-sm">Envelope total </span><strong style="color:var(--gold);font-size:1.1rem" id="env-total">${money(envTotal(env))}</strong></div>
    ${env.status === 'rejected' && env.rejectReason ? `<div class="card" style="border-color:var(--danger)"><div class="card-title" style="color:var(--danger)">Rejected</div><div class="text-sm">${esc(env.rejectReason)}</div></div>` : ''}
    ${editable ? `<div class="grid-2 mt-8"><button class="btn btn-ghost" onclick="closeModal('library-modal')">Cancel</button><button class="btn btn-outline" onclick="saveEnvelope('draft')">Save Draft</button></div>
      <button class="btn btn-success btn-full mt-8" onclick="saveEnvelope('submitted')">Submit for Approval</button>` :
      `${isSup() && env.status === 'submitted' ? `<div class="grid-2 mt-8"><button class="btn btn-danger" onclick="rejectEnvelope(${env.id})">✗ Reject</button><button class="btn btn-success" onclick="approveEnvelope(${env.id})">✓ Approve</button></div>` : ''}
       ${isSup() && env.status === 'approved' ? `<button class="btn btn-outline btn-full mt-8" onclick="markEnvelopePaid(${env.id})">Mark Reimbursed / Paid</button>` : ''}
       <div class="grid-2 mt-8"><button class="btn btn-outline" onclick="envelopePDF(${env.id})">📄 PDF</button><button class="btn btn-ghost" onclick="closeModal('library-modal')">Close</button></div>`}`;
  (env.lines || []).forEach(l => window.envAddLine(l, editable));
  if (editable && !env.lines?.length) window.envAddLine();
  openModal('library-modal');
};

window.envAddLine = (line = {}, editable = true) => {
  const projects = window._envProjects || [];
  const row = document.createElement('div'); row.className = 'card env-line'; row.style.padding = '10px';
  const dis = editable ? '' : 'disabled';
  row.innerHTML = `
    <div class="grid-2">
      <div class="form-group" style="margin-bottom:6px"><label style="font-size:0.7rem">Date</label><input type="date" class="el-date" value="${line.date || today()}" ${dis}></div>
      <div class="form-group" style="margin-bottom:6px"><label style="font-size:0.7rem">Category</label><select class="el-cat" ${dis}>${EXP_CATS.map(c => `<option ${line.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
    </div>
    <div class="form-group" style="margin-bottom:6px"><label style="font-size:0.7rem">Vendor / Description</label><input type="text" class="el-vendor" value="${esc(line.vendor || '')}" placeholder="e.g. Petro-Canada, Langley" ${dis}></div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px">
      <div class="form-group" style="margin-bottom:6px"><label style="font-size:0.7rem">Total ($)</label><input type="number" class="el-amount" step="0.01" min="0" value="${line.amount ?? ''}" oninput="envRecalc()" ${dis}></div>
      <div class="form-group" style="margin-bottom:6px"><label style="font-size:0.7rem">GST ($)</label><input type="number" class="el-gst" step="0.01" min="0" value="${line.gst ?? ''}" ${dis}></div>
      <div class="form-group" style="margin-bottom:6px"><label style="font-size:0.7rem">Payment</label><select class="el-pay" ${dis}><option ${line.payment === 'Personal' ? 'selected' : ''}>Personal</option><option ${line.payment === 'Company card' ? 'selected' : ''}>Company card</option><option ${line.payment === 'Cash float' ? 'selected' : ''}>Cash float</option></select></div>
    </div>
    <div class="toggle-row" style="padding:6px 0"><span class="toggle-label text-sm">Billable to project</span><button type="button" class="toggle el-billable ${line.billable ? 'on' : ''}" onclick="if(!this.disabled){this.classList.toggle('on');this.closest('.env-line').querySelector('.el-proj-wrap').style.display=this.classList.contains('on')?'block':'none'}" ${dis}></button></div>
    <div class="form-group el-proj-wrap" style="display:${line.billable ? 'block' : 'none'};margin-bottom:6px"><label style="font-size:0.7rem">Project</label><select class="el-project" ${dis}><option value="">Select…</option>${projects.map(p => `<option value="${p.id}" ${line.projectId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
    <div class="form-group" style="margin-bottom:6px"><label style="font-size:0.7rem">Notes</label><input type="text" class="el-notes" value="${esc(line.notes || '')}" ${dis}></div>
    <div class="form-group" style="margin-bottom:6px"><label style="font-size:0.7rem">Receipt Photo</label>
      ${editable ? `<input type="file" class="el-photo" accept="image/*" capture="environment" style="border:1.5px dashed var(--gold);background:transparent;padding:8px" onchange="envPhotoChanged(this)">` : ''}
      <div class="el-photo-prev" style="margin-top:6px">${line.photo ? `<img src="${line.photo}" style="max-height:120px;border-radius:6px">` : ''}</div>
      <input type="hidden" class="el-photo-data" value="${line.photo || ''}"></div>
    ${editable ? `<button type="button" class="btn btn-danger btn-sm" onclick="this.closest('.env-line').remove();envRecalc()">Remove</button>` : ''}`;
  $('env-lines').appendChild(row);
};
window.envPhotoChanged = async input => {
  const file = input.files[0]; if (!file) return;
  const data = await shrinkImage(file, 1000);
  const row = input.closest('.env-line');
  row.querySelector('.el-photo-data').value = data;
  row.querySelector('.el-photo-prev').innerHTML = `<img src="${data}" style="max-height:120px;border-radius:6px">`;
};
window.envRecalc = () => { const t = Array.from(document.querySelectorAll('.env-line .el-amount')).reduce((s, i) => s + (parseFloat(i.value) || 0), 0); const e = $('env-total'); if (e) e.textContent = money(t); };

function collectEnvelopeLines() {
  return Array.from(document.querySelectorAll('.env-line')).map(r => ({
    date: r.querySelector('.el-date').value, category: r.querySelector('.el-cat').value, vendor: r.querySelector('.el-vendor').value.trim(),
    amount: parseFloat(r.querySelector('.el-amount').value) || 0, gst: parseFloat(r.querySelector('.el-gst').value) || 0, payment: r.querySelector('.el-pay').value,
    billable: r.querySelector('.el-billable').classList.contains('on'), projectId: parseInt(r.querySelector('.el-project').value) || null,
    notes: r.querySelector('.el-notes').value, photo: r.querySelector('.el-photo-data').value || null
  })).filter(l => l.vendor || l.amount);
}

window.saveEnvelope = async status => {
  const env = window._env; const lines = collectEnvelopeLines();
  if (status === 'submitted') {
    if (!lines.length) { toast('Add at least one receipt', 'error'); return; }
    const missing = lines.filter(l => !l.photo);
    if (missing.length) { toast(`Receipt photo required for ${missing.length} item${missing.length > 1 ? 's' : ''}`, 'error'); return; }
  }
  const data = { title: $('env-title').value.trim() || env.title, date: $('env-date').value, lines, status, userId: env.userId, syncStatus: 'pending', updatedAt: nowIso() };
  if (status === 'submitted') data.submittedAt = nowIso();
  if (env.id) await db().expenseEnvelopes.update(env.id, data); else await db().expenseEnvelopes.add({ ...data, createdAt: nowIso() });
  if (status === 'submitted') await notifySupervisors(`💵 ${me().name} submitted expense envelope "${data.title}" for ${money(envTotal(data))}`, 'expense');
  closeModal('library-modal'); toast(status === 'submitted' ? 'Envelope submitted for approval' : 'Draft saved', 'success'); renderExpenses();
};
window.approveEnvelope = async id => {
  const env = await db().expenseEnvelopes.get(id);
  await db().expenseEnvelopes.update(id, { status: 'approved', approvedBy: me().id, approvedAt: nowIso() });
  await db().notifications.add({ toUserId: env.userId, fromUserId: me().id, message: `✅ Expense envelope "${env.title}" approved (${money(envTotal(env))})`, scheduledAt: nowIso(), read: false, type: 'expense' });
  closeModal('library-modal'); toast('Envelope approved', 'success'); renderExpenses();
};
window.rejectEnvelope = async id => {
  const reason = prompt('Reason for rejection:'); if (reason === null) return;
  const env = await db().expenseEnvelopes.get(id);
  await db().expenseEnvelopes.update(id, { status: 'rejected', rejectReason: reason, rejectedBy: me().id, rejectedAt: nowIso() });
  await db().notifications.add({ toUserId: env.userId, fromUserId: me().id, message: `❌ Expense envelope "${env.title}" rejected: ${reason}`, scheduledAt: nowIso(), read: false, type: 'expense' });
  closeModal('library-modal'); toast('Envelope rejected', 'info'); renderExpenses();
};
window.markEnvelopePaid = async id => { await db().expenseEnvelopes.update(id, { status: 'paid', paidAt: nowIso() }); closeModal('library-modal'); toast('Marked paid', 'success'); renderExpenses(); };

window.envelopePDF = async id => {
  const env = await db().expenseEnvelopes.get(id); if (!env) return;
  const [user, projects] = await Promise.all([getUser(env.userId), getProjects(false)]);
  const doc = newPDF();
  let y = pdfHeader(doc, 'Expense Envelope', `${env.title} · ${env.date}`);
  y = pdfKV(doc, y, 'Employee', user?.name || ''); y = pdfKV(doc, y, 'Status', env.status); y = pdfKV(doc, y, 'Submitted', env.submittedAt?.slice(0, 10) || '-');
  y = pdfSection(doc, y + 2, 'Receipts');
  y = pdfTable(doc, y, [{ label: 'Date', key: 'date', w: 20 }, { label: 'Vendor', key: 'vendor', w: 50 }, { label: 'Category', key: 'category', w: 30 }, { label: 'Project', key: 'project', w: 40 }, { label: 'Pay', key: 'payment', w: 20 }, { label: 'GST', key: 'gst', w: 15, align: 'right' }, { label: 'Total', key: 'amount', w: 20.9, align: 'right' }],
    (env.lines || []).map(l => ({ ...l, project: l.billable ? (projects.find(p => p.id === l.projectId)?.name || '') : 'Non-billable', gst: Number(l.gst || 0).toFixed(2), amount: Number(l.amount || 0).toFixed(2) })));
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text(`TOTAL  ${money(envTotal(env))}`, PW - PM, y + 2, { align: 'right' }); y += 10;
  const photos = (env.lines || []).filter(l => l.photo);
  if (photos.length) {
    doc.addPage(); y = pdfHeader(doc, 'Receipt Images', env.title);
    for (const l of photos) {
      if (y + 100 > PH - 18) { doc.addPage(); y = 20; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.text(`${l.date}  ${l.vendor}  ${money(l.amount)}`, PM, y); y += 3;
      try { doc.addImage(l.photo, 'JPEG', PM, y, 90, 90); } catch (e) {}
      y += 96;
    }
  }
  pdfFooter(doc);
  doc.save(`Expenses_${env.title.replace(/[^A-Za-z0-9]+/g, '_')}_${(user?.name || '').replace(/\s+/g, '_')}.pdf`);
};

// ═════════════════════════════════════════════════════════════════════════════
//  FIELD DASHBOARD (tile home for the form suite)
// ═════════════════════════════════════════════════════════════════════════════
export async function renderFormsHome() {
  const container = $('page-forms').querySelector('.page-scroll');
  const [lems, envs, tcs] = await Promise.all([db().lems.where('userId').equals(me().id).toArray(), db().expenseEnvelopes.where('userId').equals(me().id).toArray(), db().safetyForms.where('userId').equals(me().id).count()]);
  const openDwr = lems.filter(l => l.status === 'draft').length;
  const openEnv = envs.filter(e => e.status === 'draft').length;
  const tiles = [
    { t: 'Daily Work Records', i: '🗓️', links: [['Create New', 'openNewLEMModal()'], ['Explore', "navigate('lem')"]], badge: openDwr ? `${openDwr} draft${openDwr > 1 ? 's' : ''}` : '' },
    { t: 'Safety', i: '🦺', links: [['FLHA', "openSafetyForm('flha')"], ['Hazard ID / Near Miss', "openLibraryForm('hazardid')"], ['Light Vehicle Inspection', "navigate('walkaround')"], ['Explore More…', "navigate('safety')"]], badge: tcs ? `${tcs} filed` : '' },
    { t: 'Confidential Reporting', i: '✉️', links: [['Open', "navigate('confidential')"]] },
    { t: 'Expense Envelopes', i: '💵', links: [['Create New', 'openEnvelope()'], ['Explore', "navigate('expenses')"]], badge: openEnv ? `${openEnv} draft${openEnv > 1 ? 's' : ''}` : '' },
    { t: 'Personal Reports', i: '📁', links: [['My Time Cards', "navigate('timecards')"], ['My Expenses', "navigate('expenses')"]] }
  ];
  container.innerHTML = `<div class="section-header"><span class="section-title">Field Forms</span></div>
    <div class="tile-grid">${tiles.map(t => `<div class="tile"><div class="tile-head">${t.t}${t.badge ? `<span class="badge-pill" style="float:right">${t.badge}</span>` : ''}</div><div class="tile-icon">${t.i}</div>
      ${t.links.map(([l, fn]) => `<button class="tile-link" onclick="${fn}">${l}</button>`).join('')}</div>`).join('')}</div>`;
}

// Shared helpers for dashboard.js (Build #18)
export { newPDF, pdfHeader, pdfFooter, pdfSection, pdfKV, pdfTable, bindSig, PW, PM };
