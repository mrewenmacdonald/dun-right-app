// DÙN RIGHT - Field Dashboard (Build #18)
// Tile dashboard home, Jobs explorer, HSE report, crew time & expense reports
// (Locate / Lab), Equipment cost report and My Profile (saved signature).
//
// Offline-first like the rest of the app: everything reads from Dexie (window.DR_DB).

import { getProjects, getAllUsers, updateUser, getSetting, setSetting } from './db.js';
import { exportToExcel, newPDF, pdfHeader, pdfFooter, pdfSection, pdfKV, pdfTable, bindSig, SAFETY_FORMS, PW, PM } from './forms.js';

const $ = id => document.getElementById(id);
const db = () => window.DR_DB;
const me = () => window.currentUser;
const isSup = () => me()?.role === 'supervisor';
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => today().slice(0, 8) + '01';
const money = n => '$' + Number(n || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hrs = n => Number(n || 0).toFixed(1);
const toast = (m, t = 'info') => window.toast ? window.toast(m, t) : console.log(m);
function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
const scroller = pageId => $(pageId)?.querySelector('.page-scroll');
const jobLabel = p => p ? `${p.projectNumber ? p.projectNumber + ' - ' : ''}${p.name}` : 'No job';

// ═════════════════════════════════════════════════════════════════════════════
//  ICONS (original line art, drawn for DÙN RIGHT; stroke = currentColor)
// ═════════════════════════════════════════════════════════════════════════════
const S = 'viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';
export const DASH_ICONS = {
  dwr:      `<svg ${S}><rect x="10" y="8" width="24" height="32" rx="3"/><path d="M17 8v-2h10v2"/><path d="M15 17h14M15 23h14M15 29h8"/><circle cx="34" cy="34" r="7" fill="var(--tile-bg)"/><path d="M34 30.5V34l2.5 1.6"/></svg>`,
  jobs:     `<svg ${S}><path d="M6 40h36"/><path d="M14 40V22l10-8 10 8v18"/><path d="M20 40v-9h8v9"/><path d="M38 12v8M34 16h8"/><circle cx="38" cy="16" r="5"/></svg>`,
  safety:   `<svg ${S}><path d="M8 32h32"/><path d="M11 32c0-9 5.8-15 13-15s13 6 13 15"/><path d="M20 17.6V12h8v5.6"/><path d="M24 12v20"/><path d="M8 32c0 3 3 4 16 4s16-1 16-4"/></svg>`,
  confidential: `<svg ${S}><rect x="6" y="12" width="30" height="22" rx="2"/><path d="M6 14l15 11 15-11"/><rect x="31" y="27" width="12" height="10" rx="1.5" fill="var(--tile-bg)"/><path d="M33.5 27v-3a3.5 3.5 0 017 0v3"/></svg>`,
  timeexp:  `<svg ${S}><rect x="9" y="6" width="26" height="36" rx="3"/><circle cx="22" cy="18" r="6"/><path d="M22 15v3l2 1.5"/><path d="M15 29h14M15 34h9"/><path d="M38 24v14M35 27h4.5a2.5 2.5 0 010 5h-3a2.5 2.5 0 000 5H41"/></svg>`,
  cost:     `<svg ${S}><path d="M6 40h36"/><path d="M10 40V28M18 40V20M26 40V24"/><circle cx="35" cy="17" r="8"/><path d="M35 12v10M32.5 14.5h3.5a1.8 1.8 0 010 3.5h-2a1.8 1.8 0 000 3.5h3.5"/></svg>`,
  envelope: `<svg ${S}><path d="M8 16h32v22a2 2 0 01-2 2H10a2 2 0 01-2-2V16z"/><path d="M8 16l6-8h20l6 8"/><path d="M24 20v16M20.5 23h5a2.5 2.5 0 010 5h-3a2.5 2.5 0 000 5H28"/></svg>`,
  personal: `<svg ${S}><rect x="6" y="10" width="36" height="28" rx="3"/><circle cx="17" cy="21" r="4.5"/><path d="M10 33c1.2-4 4-6 7-6s5.8 2 7 6"/><path d="M28 19h9M28 25h9M28 31h6"/></svg>`,
  overview: `<svg ${S}><path d="M8 34a16 16 0 1132 0"/><path d="M24 34l7-9"/><circle cx="24" cy="34" r="2.5"/><path d="M13 34h-3M38 34h-3M24 18v-3M15 24l-2-2M33 24l2-2"/></svg>`
};

// ═════════════════════════════════════════════════════════════════════════════
//  DASHBOARD (home)
// ═════════════════════════════════════════════════════════════════════════════
const TILE_HELP = {
  dwr: 'Daily Work Records log crew hours, instruments and notes for each job day.',
  jobs: 'Every active job with its DWR hours, safety forms and expenses.',
  safety: 'Fill out field safety forms or review the HSE summary.',
  confidential: 'Report a concern privately. Only supervisors can read these.',
  timeexp: 'Time and expense roll-ups by crew type and job.',
  cost: 'Instrument and equipment days charged to each job.',
  envelope: 'Group receipts into an envelope and submit for reimbursement.',
  personal: 'Your own time cards, expenses and profile.',
  overview: 'Approvals, KPIs and crew activity for supervisors.'
};

export async function renderDashboard() {
  const c = scroller('page-home');
  if (!c) return;
  const u = me();
  const [lems, envs, conf] = await Promise.all([
    db().lems.toArray(), db().expenseEnvelopes.toArray(), db().confidentialReports.toArray()
  ]);
  const myDraftDwr = lems.filter(l => l.userId === u.id && l.status === 'draft').length;
  const myDraftEnv = envs.filter(e => e.userId === u.id && e.status === 'draft').length;
  const pendDwr = lems.filter(l => l.status === 'submitted').length;
  const pendEnv = envs.filter(e => e.status === 'submitted').length;
  const openConf = conf.filter(r => r.status !== 'closed').length;
  const hasDwrToday = lems.some(l => l.userId === u.id && l.date === today());

  const tiles = [
    { k: 'dwr', t: 'Daily Work Records', badge: myDraftDwr && `${myDraftDwr} draft`, links: [['Create New', 'openNewLEMModal()'], ['Explore', "navigate('lem')"]] },
    { k: 'jobs', t: 'Jobs', links: [['Explore', "navigate('jobs')"], ...(isSup() ? [['Manage Projects', "navigate('projects')"]] : [])] },
    { k: 'safety', t: 'Safety', links: [['HSE Report', "navigate('hse')"], ['FLHA', "openSafetyForm('flha')"], ['Hazard ID / Near Miss / Enviro', "openLibraryForm('hazardid')"], ['Light Vehicle Inspection', "navigate('walkaround')"], ['Explore More…', "navigate('safety')"]] },
    { k: 'confidential', t: 'Confidential Reporting', badge: isSup() && openConf && `${openConf} open`, links: [['Open', "navigate('confidential')"]] },
    { k: 'timeexp', t: 'Time & Expense Reports', links: [['Locate Report', "openCrewReport('locate')"], ['Time Card Report', "navigate('timecards')"], ['Lab Report', "openCrewReport('lab')"]] },
    { k: 'cost', t: 'Cost Reports', links: [['Equipment Report', "navigate('equip-report')"]] },
    { k: 'envelope', t: 'Expense Envelopes', badge: myDraftEnv && `${myDraftEnv} draft`, links: [['Create New', 'openEnvelope()'], ['Explore', "navigate('expenses')"]] },
    { k: 'personal', t: 'Personal Reports', links: [['My Time Cards', "navigate('timecards')"], ['My Expenses', "navigate('expenses')"], ['My Profile & Signature', "navigate('profile')"]] }
  ];
  if (isSup()) tiles.push({ k: 'overview', t: 'Supervisor Overview', badge: (pendDwr + pendEnv) && `${pendDwr + pendEnv} to approve`, links: [['Open Overview', "navigate('overview')"], ['Approvals', "navigate('approvals')"]] });

  c.innerHTML = `
    ${!u.signature ? `<button class="dash-banner" onclick="navigate('profile')">
        <span class="dash-banner-i">i</span>
        <span>Your signature isn't on file. <u>Set it up in My Profile</u> so forms can be signed in one tap.</span>
      </button>` : ''}
    <div class="dash-hello">
      <div>
        <div class="dash-hello-name">Good ${greet()}, ${esc(u.name.split(' ')[0])}</div>
        <div class="dash-hello-sub">${new Date().toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
      </div>
      ${!hasDwrToday ? `<button class="btn btn-primary btn-sm" onclick="openNewLEMModal()">Start today's DWR</button>` : `<span class="status status-approved">DWR filed today</span>`}
    </div>
    ${isSup() && (pendDwr || pendEnv || openConf) ? `<div class="dash-strip">
        <button onclick="navigate('approvals')"><strong>${pendDwr}</strong><span>DWRs to approve</span></button>
        <button onclick="navigate('expenses')"><strong>${pendEnv}</strong><span>Envelopes to approve</span></button>
        <button onclick="navigate('confidential')"><strong>${openConf}</strong><span>Open confidential</span></button>
      </div>` : ''}
    <div class="dash-grid">
      ${tiles.map(t => `
        <section class="dash-tile">
          <header class="dash-tile-head">
            <span>${esc(t.t)}</span>
            <button class="dash-help" aria-label="About ${esc(t.t)}" onclick="this.closest('.dash-tile').classList.toggle('show-help')">?</button>
          </header>
          <div class="dash-tile-art">${DASH_ICONS[t.k]}${t.badge ? `<span class="dash-badge">${esc(t.badge)}</span>` : ''}</div>
          <p class="dash-tile-help">${esc(TILE_HELP[t.k])}</p>
          <div class="dash-links">${t.links.map(([l, fn]) => `<button class="dash-link" onclick="${fn}">${esc(l)}</button>`).join('')}</div>
        </section>`).join('')}
    </div>
    <div class="dash-foot">DÙN RIGHT · Dùn Construction Services</div>`;
}

function greet() { const h = new Date().getHours(); return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'; }

// ═════════════════════════════════════════════════════════════════════════════
//  SHARED REPORT CHROME
// ═════════════════════════════════════════════════════════════════════════════
function backBar(title, sub) {
  return `<div class="report-head">
    <button class="report-back" onclick="navigate('home')" aria-label="Back to dashboard">‹</button>
    <div><div class="section-title">${esc(title)}</div>${sub ? `<div class="text-sm text-muted">${esc(sub)}</div>` : ''}</div>
  </div>`;
}
function rangeCard(prefix, st, projects, users, onApply, extra = '') {
  return `<div class="card" style="padding:10px 12px">
    <div class="grid-2">
      <div class="form-group" style="margin:0"><label>From</label><input type="date" id="${prefix}-from" value="${st.from}"></div>
      <div class="form-group" style="margin:0"><label>To</label><input type="date" id="${prefix}-to" value="${st.to}"></div>
      <div class="form-group" style="margin:0"><label>Job</label><select id="${prefix}-proj"><option value="">All jobs</option>${projects.map(p => `<option value="${p.id}" ${String(st.project) === String(p.id) ? 'selected' : ''}>${esc(jobLabel(p))}</option>`).join('')}</select></div>
      ${isSup() && users ? `<div class="form-group" style="margin:0"><label>Employee</label><select id="${prefix}-emp"><option value="">All staff</option>${users.map(u => `<option value="${u.id}" ${String(st.employee) === String(u.id) ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></div>` : '<div></div>'}
      ${extra}
    </div>
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
      <button class="btn btn-primary btn-sm" onclick="${onApply}">Load Data</button>
      <button class="btn btn-outline btn-sm" onclick="${onApply.replace('(', 'Excel(')}">Export to Excel</button>
      <button class="btn btn-outline btn-sm" onclick="${onApply.replace('(', 'PDF(')}">Export to PDF</button>
    </div>
  </div>`;
}
function readRange(prefix, st) {
  st.from = $(`${prefix}-from`)?.value || st.from;
  st.to = $(`${prefix}-to`)?.value || st.to;
  st.project = $(`${prefix}-proj`)?.value || '';
  st.employee = $(`${prefix}-emp`)?.value || '';
}
function statGrid(items) {
  return `<div class="stat-grid">${items.map(([v, l, tone]) => `<div class="stat ${tone ? 'stat-' + tone : ''}"><strong>${v}</strong><span>${esc(l)}</span></div>`).join('')}</div>`;
}
function table(cols, rows, empty = 'No records in this range') {
  return `<div class="table-wrap"><table class="data-table">
    <thead><tr>${cols.map(c => `<th${c.r ? ' style="text-align:right"' : ''}>${esc(c.l)}</th>`).join('')}</tr></thead>
    <tbody>${rows.length ? rows.map(r => `<tr${r._group ? ' class="tc-group"' : ''}>${cols.map(c => `<td${c.r ? ' style="text-align:right"' : ''}>${c.html ? c.html(r) : esc(r[c.k] ?? '')}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${cols.length}" class="text-muted" style="text-align:center;padding:20px">${esc(empty)}</td></tr>`}</tbody>
  </table></div>`;
}

// ═════════════════════════════════════════════════════════════════════════════
//  JOBS EXPLORER
// ═════════════════════════════════════════════════════════════════════════════
const jobsState = { q: '', show: 'active' };

export async function renderJobs() {
  const c = scroller('page-jobs');
  const [projects, lems, forms, envs] = await Promise.all([getProjects(false), db().lems.toArray(), db().safetyForms.toArray(), db().expenseEnvelopes.toArray()]);
  let list = projects.filter(p => jobsState.show === 'all' || p.status === 'active');
  if (jobsState.q) { const q = jobsState.q.toLowerCase(); list = list.filter(p => [p.name, p.projectNumber, p.clientName, p.location].join(' ').toLowerCase().includes(q)); }
  list.sort((a, b) => String(b.projectNumber || '').localeCompare(String(a.projectNumber || '')));
  const stat = p => {
    const pl = lems.filter(l => l.projectId === p.id);
    const h = pl.reduce((s, l) => s + (l.labourItems || []).reduce((t, li) => t + Number(li.total || 0), 0), 0);
    const last = pl.map(l => l.date).sort().pop();
    return { dwr: pl.length, h, last, forms: forms.filter(f => f.projectId === p.id).length };
  };
  c.innerHTML = `${backBar('Jobs', `${list.length} ${jobsState.show === 'active' ? 'active' : 'total'} job${list.length === 1 ? '' : 's'}`)}
    <div class="tab-bar">
      <button class="tab-btn ${jobsState.show === 'active' ? 'active' : ''}" onclick="jobsShow('active')">Active</button>
      <button class="tab-btn ${jobsState.show === 'all' ? 'active' : ''}" onclick="jobsShow('all')">All Jobs</button>
    </div>
    <div class="form-group"><input type="search" placeholder="Search job #, name or client, then press Enter" value="${esc(jobsState.q)}"
      onkeydown="if(event.key==='Enter')jobsSearch(this.value)" onsearch="jobsSearch(this.value)"></div>
    ${list.length ? list.map(p => { const s = stat(p); return `
      <div class="list-item" onclick="openJob(${p.id})">
        <div class="list-item-left" style="min-width:0">
          <div class="list-item-title">${esc(jobLabel(p))}</div>
          <div class="list-item-sub">${esc(p.clientName || 'No client')} • ${s.dwr} DWR${s.dwr === 1 ? '' : 's'} • ${hrs(s.h)} h${s.last ? ' • last ' + s.last : ''}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px"><span class="status status-${p.status === 'active' ? 'approved' : 'draft'}">${esc(p.status)}</span><span class="chevron">›</span></div>
      </div>`; }).join('') : `<div class="empty-state"><p>No jobs match. ${isSup() ? 'Add one under Manage Projects.' : 'Ask your supervisor to add the job.'}</p></div>`}`;
}
window.jobsShow = v => { jobsState.show = v; renderJobs(); };
window.jobsSearch = q => { jobsState.q = q.trim(); renderJobs(); };

window.openJob = async id => {
  const [p, lems, forms, envs, users] = await Promise.all([db().projects.get(id), db().lems.where('projectId').equals(id).toArray(), db().safetyForms.where('projectId').equals(id).toArray(), db().expenseEnvelopes.toArray(), getAllUsers()]);
  if (!p) return;
  const h = lems.reduce((s, l) => s + (l.labourItems || []).reduce((t, li) => t + Number(li.total || 0), 0), 0);
  const lines = envs.flatMap(e => (e.lines || []).filter(l => l.projectId === id && e.status !== 'rejected'));
  const exp = lines.reduce((s, l) => s + Number(l.amount || 0), 0);
  const bill = lines.filter(l => l.billable).reduce((s, l) => s + Number(l.amount || 0), 0);
  const crew = [...new Set(lems.map(l => l.userId))].map(uid => users.find(u => u.id === uid)?.name).filter(Boolean);
  const recent = lems.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  const sheet = $('library-modal-sheet');
  sheet.innerHTML = `<div class="modal-handle"></div>
    <div class="modal-title">${esc(jobLabel(p))}</div>
    <div class="text-sm text-muted" style="margin-bottom:10px">${esc(p.clientName || 'No client')}${p.location ? ' • ' + esc(p.location) : ''} • <span class="status status-${p.status === 'active' ? 'approved' : 'draft'}">${esc(p.status)}</span></div>
    ${statGrid([[lems.length, 'DWRs'], [hrs(h), 'Crew hours'], [forms.length, 'Safety forms'], [money(exp), 'Expenses'], [money(bill), 'Billable expenses'], [crew.length, 'Crew members']])}
    ${crew.length ? `<div class="text-sm text-muted" style="margin:10px 0">Crew: ${crew.map(esc).join(', ')}</div>` : ''}
    <div class="section-header mt-12"><span class="section-title">Recent DWRs</span></div>
    ${recent.length ? recent.map(l => `<div class="list-item" onclick="closeModal('library-modal');viewLEM(${l.id})">
        <div class="list-item-left"><div class="list-item-title">${esc(l.lemNumber || 'DWR ' + l.id)}</div>
        <div class="list-item-sub">${l.date} • ${esc(users.find(u => u.id === l.userId)?.name || '')} • ${hrs((l.labourItems || []).reduce((t, li) => t + Number(li.total || 0), 0))} h</div></div>
        <span class="status status-${esc(l.status)}">${esc(l.status)}</span></div>`).join('') : '<div class="empty-state"><p>No DWRs on this job yet</p></div>'}
    <div class="grid-2 mt-12">
      <button class="btn btn-ghost" onclick="closeModal('library-modal')">Close</button>
      ${isSup() ? `<button class="btn btn-outline" onclick="closeModal('library-modal');navigate('projects')">Manage Projects</button>` : `<button class="btn btn-primary" onclick="closeModal('library-modal');openNewLEMModal()">New DWR</button>`}
    </div>`;
  window.openModal('library-modal');
};

// ═════════════════════════════════════════════════════════════════════════════
//  HSE REPORT
// ═════════════════════════════════════════════════════════════════════════════
const hseState = { from: '', to: '', project: '', employee: '' };
const LEGACY_TITLES = { flha: 'Field Level Hazard Assessment (FLHA)', fitforwork: 'Fit for Work', hazard: 'Hazard Report', simops: 'SIMOPS', environmental: 'Environmental Form' };
const formTitle = t => SAFETY_FORMS[t]?.title || LEGACY_TITLES[t] || String(t || 'Other').toUpperCase();

async function hseData() {
  if (!hseState.from) { hseState.from = monthStart(); hseState.to = today(); }
  const [forms, walks, lems, projects, users] = await Promise.all([db().safetyForms.toArray(), db().walkarounds.toArray(), db().lems.toArray(), getProjects(false), getAllUsers()]);
  const inRange = r => (r.date || '') >= hseState.from && (r.date || '') <= hseState.to;
  const okProj = r => !hseState.project || String(r.projectId) === hseState.project;
  const okUser = r => isSup() ? (!hseState.employee || String(r.userId) === hseState.employee) : r.userId === me().id;
  const F = forms.filter(r => inRange(r) && okProj(r) && okUser(r));
  const W = walks.filter(r => inRange(r) && okUser(r));
  const L = lems.filter(r => inRange(r) && okProj(r) && okUser(r));
  // FLHA compliance: crew-days on DWRs vs. FLHAs filed by the same person on the same day
  const crewDays = new Set(L.map(l => `${l.userId}|${l.date}`));
  const flhaDays = new Set(F.filter(f => f.type === 'flha').map(f => `${f.userId}|${f.date}`));
  const covered = [...crewDays].filter(k => flhaDays.has(k)).length;
  const byType = {};
  F.forEach(f => { byType[f.type] = (byType[f.type] || 0) + 1; });
  const incidents = F.filter(f => f.type === 'incident');
  const hazards = F.filter(f => f.type === 'hazardid' || f.type === 'hazard');
  const nearMiss = hazards.filter(f => /near miss/i.test(f.category || ''));
  const refusals = F.filter(f => f.type === 'refusal');
  const followUps = F.filter(f => (f.furtherAction && String(f.furtherAction).trim()) || f.followUp === true || (f.deficiencies || []).length);
  const projName = id => jobLabel(projects.find(p => p.id === id));
  const userName = id => users.find(u => u.id === id)?.name || '';
  const flagged = [...incidents, ...hazards, ...refusals].sort((a, b) => b.date.localeCompare(a.date)).map(f => ({
    date: f.date, type: formTitle(f.type), category: f.incidentType || f.category || '', severity: (f.severity || '').split(':')[0],
    job: projName(f.projectId), by: userName(f.userId), what: f.description || f.reason || '', status: f.status || 'submitted'
  }));
  return { F, W, crewDays: crewDays.size, covered, byType, incidents, hazards, nearMiss, refusals, followUps, flagged, projects, users,
    walkFails: W.filter(w => w.status === 'failed' || w.status === 'defect' || (w.defects || []).length).length };
}

export async function renderHSE() {
  const c = scroller('page-hse');
  const d = await hseData();
  const pct = d.crewDays ? Math.round(d.covered / d.crewDays * 100) : null;
  c.innerHTML = `${backBar('HSE Report', isSup() ? 'All crews' : 'My safety activity')}
    ${rangeCard('hse', hseState, d.projects, d.users, 'hseLoad()')}
    ${statGrid([
      [d.F.length + d.W.length, 'Forms filed'],
      [pct === null ? '–' : pct + '%', `FLHA coverage (${d.covered}/${d.crewDays} crew-days)`, pct === null ? '' : pct >= 95 ? 'good' : pct >= 80 ? 'warn' : 'bad'],
      [d.incidents.length, 'Incidents', d.incidents.length ? 'bad' : 'good'],
      [d.nearMiss.length, 'Near misses', d.nearMiss.length ? 'warn' : ''],
      [d.hazards.length, 'Hazard IDs'],
      [d.W.length, 'Vehicle inspections'],
      [d.refusals.length, 'Work refusals', d.refusals.length ? 'warn' : ''],
      [d.followUps.length, 'Need follow-up', d.followUps.length ? 'warn' : '']
    ])}
    <div class="section-header mt-12"><span class="section-title">Forms by Type</span></div>
    ${table([{ k: 'type', l: 'Form' }, { k: 'n', l: 'Count', r: true }],
      Object.entries(d.byType).sort((a, b) => b[1] - a[1]).map(([t, n]) => ({ type: formTitle(t), n })).concat(d.W.length ? [{ type: 'Light Vehicle Inspection', n: d.W.length }] : []))}
    <div class="section-header mt-12"><span class="section-title">Incidents, Hazards & Refusals</span></div>
    ${table([{ k: 'date', l: 'Date' }, { k: 'type', l: 'Type' }, { k: 'category', l: 'Category' }, { k: 'severity', l: 'Severity' }, { k: 'job', l: 'Job' }, { k: 'by', l: 'Reported By' }],
      d.flagged, 'Nothing reported in this range')}`;
}
window.hseLoad = () => { readRange('hse', hseState); renderHSE(); };
window.hseLoadExcel = async () => {
  readRange('hse', hseState); const d = await hseData();
  await exportToExcel(`HSE_Report_${hseState.from}_${hseState.to}.xlsx`, [
    { name: 'Summary', rows: [
      { m: 'Period', v: `${hseState.from} to ${hseState.to}` }, { m: 'Forms filed', v: d.F.length + d.W.length },
      { m: 'FLHA coverage (crew-days)', v: `${d.covered} of ${d.crewDays}` }, { m: 'Incidents', v: d.incidents.length }, { m: 'Near misses', v: d.nearMiss.length },
      { m: 'Hazard IDs', v: d.hazards.length }, { m: 'Vehicle inspections', v: d.W.length }, { m: 'Work refusals', v: d.refusals.length }, { m: 'Need follow-up', v: d.followUps.length }],
      headers: [{ key: 'm', label: 'Measure', width: 32 }, { key: 'v', label: 'Value', width: 22 }] },
    { name: 'Flagged', rows: d.flagged, headers: [{ key: 'date', label: 'Date', width: 12 }, { key: 'type', label: 'Type', width: 30 }, { key: 'category', label: 'Category', width: 20 }, { key: 'severity', label: 'Severity', width: 12 },
      { key: 'job', label: 'Job', width: 28 }, { key: 'by', label: 'Reported By', width: 20 }, { key: 'status', label: 'Status', width: 10 }, { key: 'what', label: 'Description', width: 60 }] }
  ]);
};
window.hseLoadPDF = async () => {
  readRange('hse', hseState); const d = await hseData();
  const doc = newPDF();
  let y = pdfHeader(doc, 'HSE Report', `${hseState.from} to ${hseState.to}`);
  y = pdfSection(doc, y, 'Summary');
  [['Forms filed', d.F.length + d.W.length], ['FLHA coverage', `${d.covered} of ${d.crewDays} crew-days`], ['Incidents', d.incidents.length], ['Near misses', d.nearMiss.length],
   ['Hazard IDs', d.hazards.length], ['Vehicle inspections', d.W.length], ['Work refusals', d.refusals.length], ['Need follow-up', d.followUps.length]].forEach(([k, v]) => { y = pdfKV(doc, y, k, v); });
  y = pdfSection(doc, y + 2, 'Forms by type');
  y = pdfTable(doc, y, [{ label: 'Form', key: 'type', w: PW - 2 * PM - 25 }, { label: 'Count', key: 'n', w: 25, align: 'right' }],
    Object.entries(d.byType).map(([t, n]) => ({ type: formTitle(t), n })));
  y = pdfSection(doc, y + 2, 'Incidents, hazards and refusals');
  pdfTable(doc, y, [{ label: 'Date', key: 'date', w: 20 }, { label: 'Type', key: 'type', w: 40 }, { label: 'Category', key: 'category', w: 28 }, { label: 'Sev.', key: 'severity', w: 16 },
    { label: 'Job', key: 'job', w: 40 }, { label: 'By', key: 'by', w: 28 }, { label: 'Status', key: 'status', w: 23.9 }], d.flagged);
  pdfFooter(doc);
  doc.save(`HSE_Report_${hseState.from}_${hseState.to}.pdf`);
};

// ═════════════════════════════════════════════════════════════════════════════
//  CREW TIME & EXPENSE REPORTS (Locate / Lab)
// ═════════════════════════════════════════════════════════════════════════════
const CREW_PRESETS = {
  locate: { title: 'Locate Report', sub: 'Utility locate crews: hours, km and expenses by job', match: /locat/i },
  lab:    { title: 'Lab Report', sub: 'Concrete and materials testing: hours, samples and expenses by job', match: /concrete|testing|lab|material/i }
};
const crewState = { preset: 'locate', from: '', to: '', project: '', employee: '' };

window.openCrewReport = preset => { crewState.preset = preset; window.navigate('crew-report'); };

async function crewData() {
  if (!crewState.from) { const d = new Date(); d.setDate(d.getDate() - 14); crewState.from = d.toISOString().slice(0, 10); crewState.to = today(); }
  const P = CREW_PRESETS[crewState.preset];
  const [lems, envs, projects, users] = await Promise.all([db().lems.toArray(), db().expenseEnvelopes.toArray(), getProjects(false), getAllUsers()]);
  const rows = [];
  lems.filter(l => l.date >= crewState.from && l.date <= crewState.to && (!crewState.project || String(l.projectId) === crewState.project)).forEach(l => {
    const p = projects.find(x => x.id === l.projectId);
    const samples = (l.fieldSamples || []).reduce((s, f) => s + Number(f.qty || 0), 0);
    (l.labourItems || []).forEach((li, i) => {
      if (!P.match.test(li.title || '')) return;
      const uid = li.userId || l.userId;
      if (!isSup() && uid !== me().id && l.userId !== me().id) return;
      if (crewState.employee && String(uid) !== crewState.employee) return;
      rows.push({ date: l.date, jobId: l.projectId, job: p?.projectNumber || '', project: p?.name || '', employee: li.name || users.find(u => u.id === uid)?.name || '', userId: uid,
        role: li.title || '', hours: Number(li.total || 0), km: Math.max(0, Number(li.kmStop || 0) - Number(li.kmStart || 0)),
        samples: i === 0 ? samples : 0, dwr: l.lemNumber || `DWR-${l.id}`, status: l.status });
    });
  });
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.employee.localeCompare(b.employee));
  // Expenses on the same jobs by the same people in the same window
  const crewIds = new Set(rows.map(r => r.userId));
  const jobIds = new Set(rows.map(r => r.jobId));
  const exp = envs.filter(e => e.status !== 'rejected' && crewIds.has(e.userId)).flatMap(e => (e.lines || []).filter(l => jobIds.has(l.projectId) && (l.date || e.date) >= crewState.from && (l.date || e.date) <= crewState.to).map(l => ({ ...l, userId: e.userId })));
  const byJob = {};
  rows.forEach(r => { const j = byJob[r.jobId] ||= { job: jobLabel(projects.find(p => p.id === r.jobId)), hours: 0, km: 0, samples: 0, days: new Set(), expenses: 0, billable: 0 }; j.hours += r.hours; j.km += r.km; j.samples += r.samples; j.days.add(r.date); });
  exp.forEach(l => { const j = byJob[l.projectId]; if (!j) return; j.expenses += Number(l.amount || 0); if (l.billable) j.billable += Number(l.amount || 0); });
  const jobs = Object.values(byJob).map(j => ({ ...j, days: j.days.size }));
  return { P, rows, jobs, projects, users };
}

export async function renderCrewReport() {
  const c = scroller('page-crew-report');
  const d = await crewData();
  const lab = crewState.preset === 'lab';
  const tot = d.jobs.reduce((s, j) => ({ h: s.h + j.hours, km: s.km + j.km, sm: s.sm + j.samples, e: s.e + j.expenses, b: s.b + j.billable }), { h: 0, km: 0, sm: 0, e: 0, b: 0 });
  c.innerHTML = `${backBar(d.P.title, d.P.sub)}
    ${rangeCard('crew', crewState, d.projects, d.users, 'crewLoad()')}
    ${statGrid([[hrs(tot.h), 'Crew hours'], [lab ? tot.sm : Math.round(tot.km), lab ? 'Samples taken' : 'Kilometres'], [d.jobs.length, 'Jobs'], [money(tot.b), 'Billable expenses']])}
    <div class="section-header mt-12"><span class="section-title">By Job</span></div>
    ${table([{ k: 'job', l: 'Job' }, { k: 'days', l: 'Days', r: true }, { l: 'Hours', r: true, html: r => hrs(r.hours) }, lab ? { k: 'samples', l: 'Samples', r: true } : { l: 'KM', r: true, html: r => Math.round(r.km) },
      { l: 'Expenses', r: true, html: r => money(r.expenses) }, { l: 'Billable', r: true, html: r => money(r.billable) }], d.jobs, `No ${lab ? 'lab / testing' : 'locate'} crew time in this range. Rows come from DWR labour lines with a ${lab ? 'testing technician' : 'locate crew'} role.`)}
    <div class="section-header mt-12"><span class="section-title">Daily Detail</span></div>
    ${table([{ k: 'date', l: 'Date' }, { k: 'job', l: 'Job #' }, { k: 'employee', l: 'Employee' }, { k: 'role', l: 'Role' }, { l: 'Hours', r: true, html: r => hrs(r.hours) },
      lab ? { k: 'samples', l: 'Samples', r: true } : { k: 'km', l: 'KM', r: true }, { l: 'Status', html: r => `<span class="status status-${esc(r.status)}">${esc(r.status)}</span>` }], d.rows)}`;
}
window.crewLoad = () => { readRange('crew', crewState); renderCrewReport(); };
window.crewLoadExcel = async () => {
  readRange('crew', crewState); const d = await crewData();
  await exportToExcel(`${d.P.title.replace(/\s+/g, '_')}_${crewState.from}_${crewState.to}.xlsx`, [
    { name: 'By Job', rows: d.jobs.map(j => ({ ...j, hours: +j.hours.toFixed(2), km: Math.round(j.km), expenses: +j.expenses.toFixed(2), billable: +j.billable.toFixed(2) })),
      headers: [{ key: 'job', label: 'Job', width: 34 }, { key: 'days', label: 'Days', width: 8 }, { key: 'hours', label: 'Hours', width: 10 }, { key: 'km', label: 'KM', width: 10 }, { key: 'samples', label: 'Samples', width: 10 }, { key: 'expenses', label: 'Expenses', width: 12 }, { key: 'billable', label: 'Billable', width: 12 }] },
    { name: 'Daily Detail', rows: d.rows, headers: [{ key: 'date', label: 'Date', width: 12 }, { key: 'job', label: 'Job #', width: 10 }, { key: 'project', label: 'Project', width: 28 }, { key: 'employee', label: 'Employee', width: 22 },
      { key: 'role', label: 'Role', width: 26 }, { key: 'hours', label: 'Hours', width: 8 }, { key: 'km', label: 'KM', width: 8 }, { key: 'samples', label: 'Samples', width: 9 }, { key: 'dwr', label: 'DWR #', width: 16 }, { key: 'status', label: 'Status', width: 10 }] }
  ]);
};
window.crewLoadPDF = async () => {
  readRange('crew', crewState); const d = await crewData();
  const lab = crewState.preset === 'lab';
  const doc = newPDF();
  let y = pdfHeader(doc, d.P.title, `${crewState.from} to ${crewState.to}`);
  y = pdfSection(doc, y, 'By job');
  y = pdfTable(doc, y, [{ label: 'Job', key: 'job', w: 70 }, { label: 'Days', key: 'days', w: 15, align: 'right' }, { label: 'Hours', key: 'h', w: 20, align: 'right' }, { label: lab ? 'Samples' : 'KM', key: 'x', w: 20, align: 'right' },
    { label: 'Expenses', key: 'e', w: 35.9, align: 'right' }, { label: 'Billable', key: 'b', w: 35, align: 'right' }],
    d.jobs.map(j => ({ job: j.job, days: j.days, h: hrs(j.hours), x: lab ? j.samples : Math.round(j.km), e: money(j.expenses), b: money(j.billable) })));
  y = pdfSection(doc, y + 2, 'Daily detail');
  pdfTable(doc, y, [{ label: 'Date', key: 'date', w: 20 }, { label: 'Job #', key: 'job', w: 18 }, { label: 'Employee', key: 'employee', w: 38 }, { label: 'Role', key: 'role', w: 44 },
    { label: 'Hours', key: 'h', w: 16, align: 'right' }, { label: lab ? 'Samples' : 'KM', key: 'x', w: 16, align: 'right' }, { label: 'DWR #', key: 'dwr', w: 43.9 }],
    d.rows.map(r => ({ ...r, h: hrs(r.hours), x: lab ? r.samples : r.km })));
  pdfFooter(doc);
  doc.save(`${d.P.title.replace(/\s+/g, '_')}_${crewState.from}_${crewState.to}.pdf`);
};

// ═════════════════════════════════════════════════════════════════════════════
//  EQUIPMENT COST REPORT
// ═════════════════════════════════════════════════════════════════════════════
const eqState = { from: '', to: '', project: '', employee: '' };

async function equipData() {
  if (!eqState.from) { eqState.from = monthStart(); eqState.to = today(); }
  const [lems, projects, users, rates] = await Promise.all([db().lems.toArray(), getProjects(false), getAllUsers(), getSetting('equipmentDayRates')]);
  const R = rates || {};
  const L = lems.filter(l => l.date >= eqState.from && l.date <= eqState.to && l.status !== 'rejected'
    && (!eqState.project || String(l.projectId) === eqState.project)
    && (isSup() ? (!eqState.employee || String(l.userId) === eqState.employee) : l.userId === me().id));
  const items = {}; const jobs = {};
  L.forEach(l => (l.instruments || []).filter(i => i.name).forEach(i => {
    const key = `${i.name}|${i.serialNumber || ''}`;
    const it = items[key] ||= { type: i.name, serial: i.serialNumber || '', days: new Set(), jobs: new Set() };
    it.days.add(`${l.date}|${l.projectId}`); it.jobs.add(jobLabel(projects.find(p => p.id === l.projectId)));
    const j = jobs[l.projectId] ||= { job: jobLabel(projects.find(p => p.id === l.projectId)), days: 0, cost: 0, set: new Set() };
    const dk = `${key}|${l.date}`;
    if (!j.set.has(dk)) { j.set.add(dk); j.days += 1; j.cost += Number(R[i.name] || 0); }
  }));
  const equip = Object.values(items).map(it => ({ type: it.type, serial: it.serial, days: it.days.size, rate: Number(R[it.type] || 0), cost: it.days.size * Number(R[it.type] || 0), jobs: [...it.jobs].join(', ') }))
    .sort((a, b) => b.cost - a.cost || b.days - a.days);
  return { equip, jobs: Object.values(jobs).sort((a, b) => b.cost - a.cost), R, projects, users };
}

export async function renderEquipReport() {
  const c = scroller('page-equip-report');
  const d = await equipData();
  const types = [...new Set([...d.equip.map(e => e.type), ...Object.keys(d.R)])].sort();
  const total = d.equip.reduce((s, e) => s + e.cost, 0);
  const days = d.equip.reduce((s, e) => s + e.days, 0);
  c.innerHTML = `${backBar('Equipment Report', 'Instrument days from DWRs, costed at day rates')}
    ${rangeCard('eq', eqState, d.projects, d.users, 'eqLoad()')}
    ${statGrid([[days, 'Equipment days'], [money(total), 'Equipment cost'], [d.jobs.length, 'Jobs'], [d.equip.length, 'Units used']])}
    <div class="section-header mt-12"><span class="section-title">By Job</span></div>
    ${table([{ k: 'job', l: 'Job' }, { k: 'days', l: 'Days', r: true }, { l: 'Cost', r: true, html: r => money(r.cost) }], d.jobs)}
    <div class="section-header mt-12"><span class="section-title">By Unit</span></div>
    ${table([{ k: 'type', l: 'Equipment' }, { k: 'serial', l: 'Serial #' }, { k: 'days', l: 'Days', r: true }, { l: 'Day Rate', r: true, html: r => r.rate ? money(r.rate) : '<span class="text-muted">not set</span>' },
      { l: 'Cost', r: true, html: r => money(r.cost) }, { k: 'jobs', l: 'Jobs' }], d.equip, 'No instruments logged on DWRs in this range')}
    ${isSup() ? `<div class="section-header mt-12"><span class="section-title">Day Rates</span></div>
      <div class="card" style="padding:10px 12px">
        <div class="text-sm text-muted" style="margin-bottom:8px">Internal day rate charged to the job for each equipment type.</div>
        ${(types.length ? types : ['Trimble R12', 'Trimble SX10', 'Utility Locator']).map((t, i) => `<div class="rate-row"><label for="eqr-${i}">${esc(t)}</label>
          <input type="number" id="eqr-${i}" data-type="${esc(t)}" min="0" step="5" value="${d.R[t] ?? ''}" placeholder="0.00"></div>`).join('')}
        <button class="btn btn-primary btn-sm mt-8" onclick="eqSaveRates()">Save Day Rates</button>
      </div>` : ''}`;
}
window.eqLoad = () => { readRange('eq', eqState); renderEquipReport(); };
window.eqSaveRates = async () => {
  const R = (await getSetting('equipmentDayRates')) || {};
  document.querySelectorAll('#page-equip-report input[data-type]').forEach(i => { const v = parseFloat(i.value); if (v > 0) R[i.dataset.type] = v; else delete R[i.dataset.type]; });
  await setSetting('equipmentDayRates', R);
  toast('Day rates saved', 'success');
  renderEquipReport();
};
window.eqLoadExcel = async () => {
  readRange('eq', eqState); const d = await equipData();
  await exportToExcel(`Equipment_Report_${eqState.from}_${eqState.to}.xlsx`, [
    { name: 'By Job', rows: d.jobs.map(j => ({ job: j.job, days: j.days, cost: +j.cost.toFixed(2) })), headers: [{ key: 'job', label: 'Job', width: 36 }, { key: 'days', label: 'Equipment Days', width: 14 }, { key: 'cost', label: 'Cost', width: 12 }] },
    { name: 'By Unit', rows: d.equip, headers: [{ key: 'type', label: 'Equipment', width: 22 }, { key: 'serial', label: 'Serial #', width: 16 }, { key: 'days', label: 'Days', width: 8 }, { key: 'rate', label: 'Day Rate', width: 10 }, { key: 'cost', label: 'Cost', width: 12 }, { key: 'jobs', label: 'Jobs', width: 50 }] }
  ]);
};
window.eqLoadPDF = async () => {
  readRange('eq', eqState); const d = await equipData();
  const doc = newPDF();
  let y = pdfHeader(doc, 'Equipment Report', `${eqState.from} to ${eqState.to}`);
  y = pdfSection(doc, y, 'By job');
  y = pdfTable(doc, y, [{ label: 'Job', key: 'job', w: 125.9 }, { label: 'Days', key: 'days', w: 30, align: 'right' }, { label: 'Cost', key: 'c', w: 40, align: 'right' }], d.jobs.map(j => ({ ...j, c: money(j.cost) })));
  y = pdfSection(doc, y + 2, 'By unit');
  pdfTable(doc, y, [{ label: 'Equipment', key: 'type', w: 38 }, { label: 'Serial #', key: 'serial', w: 28 }, { label: 'Days', key: 'days', w: 14, align: 'right' }, { label: 'Rate', key: 'r', w: 22, align: 'right' },
    { label: 'Cost', key: 'c', w: 26, align: 'right' }, { label: 'Jobs', key: 'jobs', w: 67.9 }], d.equip.map(e => ({ ...e, r: e.rate ? money(e.rate) : '-', c: money(e.cost) })));
  pdfFooter(doc);
  doc.save(`Equipment_Report_${eqState.from}_${eqState.to}.pdf`);
};

// ═════════════════════════════════════════════════════════════════════════════
//  MY PROFILE + SAVED SIGNATURE
// ═════════════════════════════════════════════════════════════════════════════
export async function renderProfile() {
  const c = scroller('page-profile');
  const u = me();
  c.innerHTML = `${backBar('My Profile', u.role === 'supervisor' ? 'Supervisor' : 'Field staff')}
    <div class="card">
      <div class="grid-2">
        <div class="form-group"><label>Name</label><input type="text" value="${esc(u.name)}" disabled></div>
        <div class="form-group"><label>Username</label><input type="text" value="${esc(u.username)}" disabled></div>
        <div class="form-group"><label for="pf-email">Email</label><input type="email" id="pf-email" value="${esc(u.email || '')}"></div>
        <div class="form-group"><label for="pf-phone">Phone</label><input type="tel" id="pf-phone" value="${esc(u.phone || '')}"></div>
      </div>
    </div>
    <div class="section-header mt-12"><span class="section-title">Signature on File</span>
      ${u.signature ? '<span class="status status-approved">saved</span>' : '<span class="status status-submitted">not set</span>'}</div>
    <div class="card">
      <div class="text-sm text-muted" style="margin-bottom:8px">Sign once here. Every safety form will offer a "Use my signature" button so you can sign in one tap.</div>
      ${u.signature ? `<div class="sig-saved"><img src="${u.signature}" alt="Your saved signature"></div>` : ''}
      <div class="sig-canvas-wrap"><canvas id="pf-sig" width="600" height="150" style="display:block;width:100%;touch-action:none"></canvas>
        <button type="button" class="sig-clear" onclick="clearSigCanvas('pf-sig')">Clear</button></div>
      <div class="grid-2 mt-8">
        ${u.signature ? `<button class="btn btn-ghost" onclick="profileRemoveSig()">Remove Signature</button>` : '<div></div>'}
        <button class="btn btn-primary" onclick="profileSave()">Save Profile</button>
      </div>
    </div>`;
  bindSig($('pf-sig'));
}
window.profileSave = async () => {
  const u = me(); const cv = $('pf-sig');
  const patch = { email: $('pf-email').value.trim(), phone: $('pf-phone').value.trim() };
  if (cv?.dataset.signed) patch.signature = cv.toDataURL('image/png');
  await updateUser(u.id, patch);
  Object.assign(u, patch);
  toast(patch.signature ? 'Profile and signature saved' : 'Profile saved', 'success');
  renderProfile();
};
window.profileRemoveSig = async () => {
  const u = me();
  await updateUser(u.id, { signature: null });
  u.signature = null;
  toast('Signature removed', 'success');
  renderProfile();
};
