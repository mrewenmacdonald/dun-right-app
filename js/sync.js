// DÙN RIGHT — Microsoft Graph / OneDrive sync layer
// Handles file uploads to OneDrive and email sending via Outlook

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const ONEDRIVE_ROOT = '00 - DÙN RIGHT APP';

const FOLDERS = {
  timesheets: `${ONEDRIVE_ROOT}/02 - TIMESHEETS`,
  safety:     `${ONEDRIVE_ROOT}/03 - SAFETY`,
  receipts:   `${ONEDRIVE_ROOT}/05 - RECEIPTS AND INVOICES`,
  photos:     `${ONEDRIVE_ROOT}/06 - PHOTOS`,
  invoices:   `${ONEDRIVE_ROOT}/04 - INVOICES`
};

// ─── Token management (MSAL) ──────────────────────────────────────────────────
let _accessToken = null;

export function setAccessToken(token) {
  _accessToken = token;
}

export function getAccessToken() {
  return _accessToken;
}

function authHeaders() {
  return {
    'Authorization': `Bearer ${_accessToken}`,
    'Content-Type': 'application/json'
  };
}

// ─── Folder creation ──────────────────────────────────────────────────────────
async function ensureFolder(path) {
  if (!_accessToken) return false;
  const parts = path.split('/');
  let currentPath = 'root';

  for (const part of parts) {
    const encoded = encodeURIComponent(part);
    try {
      const res = await fetch(`${GRAPH_BASE}/me/drive/${currentPath}:/children`, {
        headers: authHeaders()
      });
      const data = await res.json();
      const exists = data.value?.find(f => f.name === part && f.folder);
      if (!exists) {
        await fetch(`${GRAPH_BASE}/me/drive/${currentPath}:/children`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ name: part, folder: {}, '@microsoft.graph.conflictBehavior': 'rename' })
        });
      }
      currentPath = `root:/${parts.slice(0, parts.indexOf(part) + 1).join('/')}:`;
    } catch (e) {
      console.warn('ensureFolder error', e);
    }
  }
  return true;
}

function monthFolder(date) {
  const d = date ? new Date(date) : new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year  = d.getFullYear();
  const names = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return `${year}-${month} ${names[d.getMonth()]}`;
}

// ─── File upload ──────────────────────────────────────────────────────────────
export async function uploadFile(folderPath, filename, blob) {
  if (!_accessToken) {
    console.warn('No access token — queuing for sync');
    await window.DR_DB.syncQueue.add({ type: 'upload', payload: { folderPath, filename }, createdAt: new Date().toISOString(), attempts: 0 });
    return null;
  }

  await ensureFolder(folderPath);
  const path = `${folderPath}/${filename}`;
  const encoded = path.split('/').map(encodeURIComponent).join('/');

  const res = await fetch(`${GRAPH_BASE}/me/drive/root:/${encoded}:/content`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${_accessToken}`, 'Content-Type': blob.type || 'application/octet-stream' },
    body: blob
  });
  return res.ok ? await res.json() : null;
}

// ─── Upload timesheet PDF ─────────────────────────────────────────────────────
export async function uploadTimesheetPDF(pdfDoc, workOrder, projectName, userName) {
  const date   = workOrder.date || new Date().toISOString().slice(0,10);
  const month  = monthFolder(date);
  const folder = `${FOLDERS.timesheets}/${month}`;
  const safe   = s => s.replace(/[^a-zA-Z0-9\s\-_]/g, '').trim().replace(/\s+/g, '_');
  const filename = `WO-${String(workOrder.id).padStart(4,'0')}_${safe(projectName)}_${safe(userName)}_${date}.pdf`;

  const blob = pdfDoc.output('blob');
  return uploadFile(folder, filename, blob);
}

// ─── Upload invoice PDF ───────────────────────────────────────────────────────
export async function uploadInvoicePDF(pdfDoc, invoice, projectName) {
  const date     = invoice.createdAt?.slice(0,10) || new Date().toISOString().slice(0,10);
  const month    = monthFolder(date);
  const folder   = `${FOLDERS.invoices}/${month}`;
  const safe     = s => s.replace(/[^a-zA-Z0-9\s\-_]/g, '').trim().replace(/\s+/g, '_');
  const filename = `INV-${String(invoice.id).padStart(4,'0')}_${safe(projectName)}_${date}.pdf`;

  const blob = pdfDoc.output('blob');
  return uploadFile(folder, filename, blob);
}

// ─── Upload receipt photo ─────────────────────────────────────────────────────
export async function uploadReceiptPhoto(imageBlob, receipt, userName) {
  const date     = receipt.date || new Date().toISOString().slice(0,10);
  const month    = monthFolder(date);
  const folder   = `${FOLDERS.receipts}/${month}`;
  const safe     = s => s.replace(/[^a-zA-Z0-9\s\-_]/g, '').trim().replace(/\s+/g, '_');
  const ext      = imageBlob.type.includes('png') ? 'png' : 'jpg';
  const filename = `REC-${String(receipt.id).padStart(4,'0')}_${safe(userName)}_${date}.${ext}`;

  return uploadFile(folder, filename, imageBlob);
}

// ─── Upload site photo ────────────────────────────────────────────────────────
export async function uploadSitePhoto(imageBlob, projectName, userName, photoNum) {
  const date   = new Date().toISOString().slice(0,10);
  const month  = monthFolder(date);
  const safe   = s => s.replace(/[^a-zA-Z0-9\s\-_]/g, '').trim().replace(/\s+/g, '_');
  const folder = `${FOLDERS.photos}/${month}/${safe(projectName)}`;
  const ext    = imageBlob.type.includes('png') ? 'png' : 'jpg';
  const filename = `${safe(userName)}_${date}_${String(photoNum).padStart(3,'0')}.${ext}`;

  return uploadFile(folder, filename, imageBlob);
}

// ─── Upload safety form ───────────────────────────────────────────────────────
export async function uploadSafetyForm(pdfDoc, safetyForm, userName) {
  const date   = safetyForm.date || new Date().toISOString().slice(0,10);
  const month  = monthFolder(date);
  const folder = `${FOLDERS.safety}/${month}`;
  const safe   = s => s.replace(/[^a-zA-Z0-9\s\-_]/g, '').trim().replace(/\s+/g, '_');
  const filename = `${safetyForm.type.toUpperCase()}_${safe(userName)}_${date}.pdf`;

  const blob = pdfDoc.output('blob');
  return uploadFile(folder, filename, blob);
}

// ─── Send email via Outlook ───────────────────────────────────────────────────
export async function sendEmail({ to, subject, body, attachments = [] }) {
  if (!_accessToken) {
    console.warn('No access token for email');
    return false;
  }

  const message = {
    subject,
    body: { contentType: 'HTML', content: body },
    toRecipients: Array.isArray(to) ? to.map(email => ({ emailAddress: { address: email } })) : [{ emailAddress: { address: to } }],
    attachments: attachments.map(att => ({
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: att.name,
      contentType: att.contentType || 'application/pdf',
      contentBytes: att.contentBytes
    }))
  };

  const res = await fetch(`${GRAPH_BASE}/me/sendMail`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ message, saveToSentItems: true })
  });
  return res.ok;
}

// ─── Helper: PDF doc → base64 ─────────────────────────────────────────────────
export function pdfToBase64(pdfDoc) {
  return pdfDoc.output('datauristring').split(',')[1];
}

// ─── Process sync queue when back online ─────────────────────────────────────
export async function processSyncQueue() {
  if (!_accessToken || !navigator.onLine) return;
  const queue = await window.DR_DB.syncQueue.toArray();
  for (const item of queue) {
    try {
      // Re-attempt based on type
      if (item.type === 'upload' && item.blob) {
        await uploadFile(item.payload.folderPath, item.payload.filename, item.blob);
      }
      await window.DR_DB.syncQueue.delete(item.id);
    } catch (e) {
      await window.DR_DB.syncQueue.update(item.id, { attempts: (item.attempts || 0) + 1 });
    }
  }
}

window.addEventListener('online', processSyncQueue);
