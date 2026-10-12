// DÙN RIGHT — Equipment check-in / check-out rules (storage agnostic)

const crypto = require('crypto');

const STATUSES = ['available', 'out', 'service', 'retired'];
const TAG_PREFIX = () => (process.env.EQUIPMENT_TAG_PREFIX || 'KG').toUpperCase().replace(/[^A-Z0-9]/g, '') || 'KG';
const TAG_RE = /^[A-Z0-9]{1,6}-\d{3,6}$/;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const clean = (v, max = 200) => (v === undefined || v === null) ? '' : String(v).trim().slice(0, max);
const nowIso = () => new Date().toISOString();

function normaliseTag(raw) {
  let s = clean(raw, 500);
  // Accept a full label URL (https://…/?eq=KG-0001) or the bare tag
  const m = s.match(/[?&#]eq=([^&#\s]+)/i);
  if (m) s = decodeURIComponent(m[1]);
  s = s.toUpperCase().replace(/\s+/g, '');
  if (!TAG_RE.test(s)) throw new HttpError(400, 'Not a valid equipment tag');
  return s;
}

function publicItem(item) {
  if (!item) return item;
  const { _etag, ...rest } = item;
  return rest;
}

async function listItems(store, { includeRetired = false } = {}) {
  const items = await store.listItems();
  return items
    .filter(i => includeRetired || i.status !== 'retired')
    .sort((a, b) => a.tag.localeCompare(b.tag, undefined, { numeric: true }))
    .map(publicItem);
}

async function createItem(store, body, actor) {
  const name = clean(body.name, 120);
  if (!name) throw new HttpError(400, 'Name is required');
  const serial = clean(body.serial, 80);
  if (serial) {
    const dup = (await store.listItems()).find(i => i.serial && i.serial.toUpperCase() === serial.toUpperCase() && i.status !== 'retired');
    if (dup) throw new HttpError(409, `Serial ${serial} is already tagged as ${dup.tag}`);
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const tag = await store.nextTag(TAG_PREFIX());
    const ts = nowIso();
    const item = {
      tag, name, serial,
      type: clean(body.type, 80) || 'Other',
      notes: clean(body.notes, 500),
      status: 'available', holderName: '', holderUsername: '', project: '', since: '',
      lastScanAt: '', lastNote: '', serviceNote: '',
      createdAt: ts, updatedAt: ts, createdBy: clean(actor, 80)
    };
    if (await store.saveItem(item, true)) return publicItem(item);
  }
  throw new HttpError(503, 'Could not create the item, please try again');
}

async function updateItem(store, rawTag, body) {
  const tag = normaliseTag(rawTag);
  for (let attempt = 0; attempt < 5; attempt++) {
    const item = await store.getItem(tag);
    if (!item) throw new HttpError(404, `No equipment with tag ${tag}`);
    for (const f of ['name', 'type', 'serial', 'notes']) if (body[f] !== undefined) item[f] = clean(body[f], f === 'notes' ? 500 : 120);
    if (!item.name) throw new HttpError(400, 'Name is required');
    if (body.status !== undefined) {
      if (!STATUSES.includes(body.status)) throw new HttpError(400, 'Invalid status');
      item.status = body.status;
      if (body.status === 'available' || body.status === 'retired') {
        item.holderName = ''; item.holderUsername = ''; item.project = ''; item.since = '';
        if (body.status === 'available') item.serviceNote = '';
      }
      if (body.status === 'service' && body.serviceNote !== undefined) item.serviceNote = clean(body.serviceNote, 500);
    }
    item.updatedAt = nowIso();
    if (await store.saveItem(item)) return publicItem(item);
  }
  throw new HttpError(503, 'Item was busy, please try again');
}

// body: { action: 'out'|'in', user:{name,username}, project, note, condition:'ok'|'service', at, scanId, source }
async function applyScan(store, rawTag, body) {
  const tag = normaliseTag(rawTag);
  const action = body.action === 'in' ? 'in' : body.action === 'out' ? 'out' : null;
  if (!action) throw new HttpError(400, 'action must be "out" or "in"');
  const userName = clean(body.user && body.user.name, 80);
  const username = clean(body.user && body.user.username, 40).toLowerCase();
  if (!userName) throw new HttpError(400, 'User is required');

  const scanId = clean(body.scanId, 60) || crypto.randomUUID();
  if (!/^[A-Za-z0-9_-]{6,60}$/.test(scanId)) throw new HttpError(400, 'Bad scanId');
  if (await store.hasScan(scanId)) {
    const current = await store.getItem(tag);
    return { item: publicItem(current), duplicate: true };
  }

  // Client time is used for ordering offline scans, but never trusted beyond "now"
  const receivedAt = nowIso();
  let at = Date.parse(body.at) ? new Date(body.at).toISOString() : receivedAt;
  if (at > receivedAt) at = receivedAt;

  const condition = body.condition === 'service' ? 'service' : 'ok';
  const note = clean(body.note, 500);
  const project = clean(body.project, 120);

  for (let attempt = 0; attempt < 5; attempt++) {
    const item = await store.getItem(tag);
    if (!item) throw new HttpError(404, `No equipment with tag ${tag}. Ask a supervisor to add it.`);
    if (item.status === 'retired') throw new HttpError(409, `${tag} has been retired`);

    const prevHolder = item.holderName || '';
    // An offline scan that arrives after a newer scan is logged but does not change current state
    const stale = item.lastScanAt && at < item.lastScanAt;

    if (!stale) {
      if (action === 'out') {
        item.status = 'out';
        item.holderName = userName;
        item.holderUsername = username;
        item.project = project;
        item.since = at;
      } else {
        item.status = condition === 'service' ? 'service' : 'available';
        item.serviceNote = condition === 'service' ? (note || 'Flagged at check-in') : '';
        item.holderName = ''; item.holderUsername = ''; item.project = ''; item.since = '';
      }
      item.lastScanAt = at;
      item.lastNote = note;
      item.updatedAt = receivedAt;
      if (!(await store.saveItem(item))) continue; // someone else scanned at the same moment, retry
    }

    await store.addLog({
      scanId, tag, itemName: item.name, action, userName, username, project, note,
      condition: action === 'in' ? condition : '',
      prevHolder: prevHolder && prevHolder !== userName ? prevHolder : '',
      at, receivedAt, source: clean(body.source, 20) || 'scan', applied: !stale
    });
    return { item: publicItem(stale ? await store.getItem(tag) : item), duplicate: false, stale: !!stale, prevHolder };
  }
  throw new HttpError(503, 'Item was busy, please try again');
}

async function importItems(store, list, actor) {
  if (!Array.isArray(list) || !list.length) throw new HttpError(400, 'Nothing to import');
  if (list.length > 500) throw new HttpError(400, 'Import at most 500 items at a time');
  const created = [], skipped = [];
  for (const raw of list) {
    try { created.push(await createItem(store, raw, actor)); }
    catch (e) { skipped.push({ name: clean(raw && raw.name, 120), serial: clean(raw && raw.serial, 80), reason: e.message }); }
  }
  return { created, skipped };
}

module.exports = { HttpError, normaliseTag, listItems, createItem, updateItem, applyScan, importItems, STATUSES };
