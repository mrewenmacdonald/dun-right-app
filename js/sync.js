// DÙN RIGHT — Microsoft Graph / OneDrive sync layer
// PKCE OAuth + file uploads + email via Graph API

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const ONEDRIVE_ROOT = '00 - DÙN RIGHT APP';

const FOLDERS = {
  timesheets: `${ONEDRIVE_ROOT}/02 - TIMESHEETS`,
  safety:     `${ONEDRIVE_ROOT}/03 - SAFETY`,
  receipts:   `${ONEDRIVE_ROOT}/05 - RECEIPTS AND INVOICES`,
  photos:     `${ONEDRIVE_ROOT}/06 - PHOTOS`,
  invoices:   `${ONEDRIVE_ROOT}/04 - INVOICES`
};

// ─── PKCE OAuth config — fill CLIENT_ID after Azure app registration ──────────
const MS_CLIENT_ID = 'PASTE_CLIENT_ID_HERE';
const MS_TENANT    = 'common';
const MS_REDIRECT  = window.location.origin;
const MS_SCOPES    = 'Files.ReadWrite Mail.Send User.Read offline_access';

// ─── Token state ──────────────────────────────────────────────────────────────
let _accessToken = null;

export function setAccessToken(token) { _accessToken = token; }
export function getAccessToken()      { return _accessToken; }
function authHeaders() {
  return { 'Authorization': `Bearer ${_accessToken}`, 'Content-Type': 'application/json' };
}

// ─── PKCE helpers ─────────────────────────────────────────────────────────────
function generateCodeVerifier() {
  const a = new Uint8Array(32);
  crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}
async function generateCodeChallenge(v) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v));
  return btoa(String.fromCharCode(...new Uint8Array(d))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}

// ─── Initiate Microsoft login (redirects away) ────────────────────────────────
export async function initiateMSLogin() {
  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  sessionStorage.setItem('pkce_verifier', verifier);
  const p = new URLSearchParams({
    client_id: MS_CLIENT_ID, response_type: 'code',
    redirect_uri: MS_REDIRECT, scope: MS_SCOPES,
    code_challenge: challenge, code_challenge_method: 'S256', response_mode: 'query'
  });
  window.location.href = `https://login.microsoftonline.com/${MS_TENANT}/oauth2/v2.0/authorize?${p}`;
}

// ─── Handle redirect callback (call on page load) ─────────────────────────────
export async function handleMSAuthCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (!code) return false;
  const verifier = sessionStorage.getItem('pkce_verifier');
  if (!verifier) return false;

  const res = await fetch(`https://login.microsoftonline.com/${MS_TENANT}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: MS_CLIENT_ID, grant_type: 'authorization_code',
      code, redirect_uri: MS_REDIRECT, code_verifier: verifier, scope: MS_SCOPES
    })
  });
  if (!res.ok) return false;

  const t = await res.json();
  localStorage.setItem('ms_access_token', t.access_token);
  localStorage.setItem('ms_refresh_token', t.refresh_token || '');
  localStorage.setItem('ms_token_expiry',  String(Date.now() + t.expires_in * 1000));
  _accessToken = t.access_token;
  sessionStorage.removeItem('pkce_verifier');
  window.history.replaceState({}, '', window.location.pathname);
  return true;
}

// ─── Refresh token silently ───────────────────────────────────────────────────
async function _refreshToken() {
  const refresh = localStorage.getItem('ms_refresh_token');
  if (!refresh) return false;
  const res = await fetch(`https://login.microsoftonline.com/${MS_TENANT}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: MS_CLIENT_ID, grant_type: 'refresh_token',
      refresh_token: refresh, scope: MS_SCOPES
    })
  });
  if (!res.ok) {
    ['ms_access_token','ms_refresh_token','ms_token_expiry'].forEach(k => localStorage.removeItem(k));
    _accessToken = null;
    return false;
  }
  const t = await res.json();
  localStorage.setItem('ms_access_token', t.access_token);
  localStorage.setItem('ms_refresh_token', t.refresh_token || refresh);
  localStorage.setItem('ms_token_expiry',  String(Date.now() + t.expires_in * 1000));
  _accessToken = t.access_token;
  return true;
}

// ─── Load stored token on app start ──────────────────────────────────────────
export async function loadMSToken() {
  const token  = localStorage.getItem('ms_access_token');
  const expiry = parseInt(localStorage.getItem('ms_token_expiry') || '0');
  if (token && Date.now() < expiry - 60000) { _accessToken = token; return true; }
  return _refreshToken();
}

export function isMSConnected() {
  return !!localStorage.getItem('ms_refresh_token') || (
    !!localStorage.getItem('ms_access_token') &&
    Date.now() < parseInt(localStorage.getItem('ms_token_expiry') || '0') - 60000
  );
}

export function disconnectMS() {
  ['ms_access_token','ms_refresh_token','ms_token_expiry'].forEach(k => localStorage.removeItem(k));
  _accessToken = null;
}

// ─── Ensure folders exist ─────────────────────────────────────────────────────
async function ensureFolder(path) {
  if (!_accessToken) return false;
  const parts = path.split('/');
  for (let i = 1; i <= parts.length; i++) {
    const currentPath = parts.slice(0, i).join('/');
    const parentPath  = i === 1 ? 'root' : `root:/${parts.slice(0, i-1).join('/')}:`;
    const folderName  = parts[i-1];
    try {
      const res = await fetch(
        `${GRAPH_BASE}/me/drive/${parentPath}/children?$filter=name eq '${encodeURIComponent(folderName)}' and folder ne null`,
        { headers: authHeaders() }
      );
      const data = await res.json();
      if (!data.value?.length) {
        await fetch(`${GRAPH_BASE}/me/drive/${parentPath}/children`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ name: folderName, folder: {}, '@microsoft.graph.conflictBehavior': 'rename' })
        });
      }
    } catch(e) { console.warn('ensureFolder:', e); }
  }
  return true;
}

function monthFolder(date) {
  const d = date ? new Date(date + 'T12:00:00') : new Date();
  const names = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')} ${names[d.getMonth()]}`;
}

// ─── Core file upload ─────────────────────────────────────────────────────────
export async function uploadFile(folderPath, filename, blob) {
  if (!_accessToken) {
    await window.DR_DB.syncQueue.add({
      type: 'upload', payload: { folderPath, filename },
      createdAt: new Date().toISOString(), attempts: 0
    });
    return null;
  }
  await ensureFolder(folderPath);
  const path    = `${folderPath}/${filename}`;
  const encoded = path.split('/').map(p => encodeURIComponent(p)).join('/');
  const res = await fetch(`${GRAPH_BASE}/me/drive/root:/${encoded}:/content`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${_accessToken}`, 'Content-Type': blob.type || 'application/pdf' },
    body: blob
  });
  return res.ok ? await res.json() : null;
}

const safe = s => (s || '').replace(/[^a-zA-Z0-9\s\-_]/g,'').trim().replace(/\s+/g,'_');

// ─── Upload timesheet (LEM) PDF ───────────────────────────────────────────────
export async function uploadTimesheetPDF(pdfDoc, workOrder, projectName, userName) {
  const date     = workOrder.date || new Date().toISOString().slice(0,10);
  const month    = monthFolder(date);
  const folder   = `${FOLDERS.timesheets}/${month}`;
  const filename = `LEM-${String(workOrder.id).padStart(4,'0')}_${safe(projectName)}_${safe(userName)}_${date}.pdf`;
  return uploadFile(folder, filename, pdfDoc.output('blob'));
}

// ─── Upload invoice PDF ───────────────────────────────────────────────────────
export async function uploadInvoicePDF(pdfDoc, invoice, projectName) {
  const date     = invoice.createdAt?.slice(0,10) || new Date().toISOString().slice(0,10);
  const month    = monthFolder(date);
  const folder   = `${FOLDERS.invoices}/${month}`;
  const filename = `INV-${String(invoice.id).padStart(4,'0')}_${safe(projectName)}_${date}.pdf`;
  return uploadFile(folder, filename, pdfDoc.output('blob'));
}

// ─── Upload receipt photo ─────────────────────────────────────────────────────
export async function uploadReceiptPhoto(imageBlob, receipt, userName) {
  const date     = receipt.date || new Date().toISOString().slice(0,10);
  const folder   = `${FOLDERS.receipts}/${monthFolder(date)}`;
  const ext      = imageBlob.type.includes('png') ? 'png' : 'jpg';
  const filename = `REC-${String(receipt.id).padStart(4,'0')}_${safe(userName)}_${date}.${ext}`;
  return uploadFile(folder, filename, imageBlob);
}

// ─── Upload safety form PDF ───────────────────────────────────────────────────
export async function uploadSafetyForm(pdfDoc, safetyForm, userName) {
  const date     = safetyForm.date || new Date().toISOString().slice(0,10);
  const folder   = `${FOLDERS.safety}/${monthFolder(date)}`;
  const filename = `${(safetyForm.type||'FORM').toUpperCase()}_${safe(userName)}_${date}.pdf`;
  return uploadFile(folder, filename, pdfDoc.output('blob'));
}

// ─── Upload site photo ────────────────────────────────────────────────────────
export async function uploadSitePhoto(imageBlob, projectName, userName, photoNum) {
  const date   = new Date().toISOString().slice(0,10);
  const folder = `${FOLDERS.photos}/${monthFolder(date)}/${safe(projectName)}`;
  const ext    = imageBlob.type.includes('png') ? 'png' : 'jpg';
  return uploadFile(folder, `${safe(userName)}_${date}_${String(photoNum).padStart(3,'0')}.${ext}`, imageBlob);
}

// ─── Send email via Outlook / Graph ──────────────────────────────────────────
export async function sendEmail({ to, subject, body, attachments = [] }) {
  if (!_accessToken) return false;
  const message = {
    subject,
    body: { contentType: 'HTML', content: body },
    toRecipients: (Array.isArray(to) ? to : [to]).map(e => ({ emailAddress: { address: e } })),
    attachments: attachments.map(a => ({
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: a.name, contentType: a.contentType || 'application/pdf', contentBytes: a.contentBytes
    }))
  };
  const res = await fetch(`${GRAPH_BASE}/me/sendMail`, {
    method: 'POST', headers: authHeaders(),
    body: JSON.stringify({ message, saveToSentItems: true })
  });
  return res.ok;
}

export function pdfToBase64(pdfDoc) {
  return pdfDoc.output('datauristring').split(',')[1];
}

// ─── Sync queue retry ─────────────────────────────────────────────────────────
export async function processSyncQueue() {
  if (!_accessToken || !navigator.onLine) return;
  const queue = await window.DR_DB.syncQueue.toArray();
  for (const item of queue) {
    try {
      if (item.type === 'upload' && item.blob) {
        await uploadFile(item.payload.folderPath, item.payload.filename, item.blob);
      }
      await window.DR_DB.syncQueue.delete(item.id);
    } catch(e) {
      await window.DR_DB.syncQueue.update(item.id, { attempts: (item.attempts || 0) + 1 });
    }
  }
}

window.addEventListener('online', processSyncQueue);
