// DÙN RIGHT — Equipment data store
// Uses Azure Table Storage when EQUIPMENT_STORAGE (a storage account connection
// string) is set in the Static Web App's environment variables. Without it the
// API runs in DEMO mode: data lives in memory and is lost whenever Azure
// recycles the function, so the app shows a "demo mode" banner.

const { TableClient, odata } = require('@azure/data-tables');

const ITEMS_TABLE = 'DunEquipment';
const LOG_TABLE   = 'DunEquipmentLog';
const CFG_TABLE   = 'DunSettings';
const ITEM_PK     = 'eq';

const ITEM_FIELDS = ['tag', 'name', 'type', 'serial', 'notes', 'status', 'holderName', 'holderUsername',
  'project', 'since', 'lastScanAt', 'lastNote', 'serviceNote', 'createdAt', 'updatedAt', 'createdBy'];
const LOG_FIELDS = ['scanId', 'tag', 'itemName', 'action', 'userName', 'username', 'project', 'note',
  'condition', 'prevHolder', 'at', 'receivedAt', 'source', 'applied'];

function pick(obj, fields) {
  const out = {};
  for (const f of fields) if (obj[f] !== undefined && obj[f] !== null) out[f] = obj[f];
  return out;
}

// Newest-first sort key for log rows
function logKey(at, scanId) {
  const ms = Date.parse(at) || Date.now();
  return String(9999999999999 - ms).padStart(13, '0') + '_' + scanId;
}

// ─── Azure Table Storage backend ─────────────────────────────────────────────
class TableStore {
  constructor(conn) {
    const opts = { allowInsecureConnection: /UseDevelopmentStorage|127\.0\.0\.1|localhost/i.test(conn) };
    this.items = TableClient.fromConnectionString(conn, ITEMS_TABLE, opts);
    this.log   = TableClient.fromConnectionString(conn, LOG_TABLE, opts);
    this.cfg   = TableClient.fromConnectionString(conn, CFG_TABLE, opts);
    this.mode  = 'live';
    this._ready = null;
  }

  ready() {
    if (!this._ready) {
      const make = t => t.createTable().catch(e => { if (e.statusCode !== 409) throw e; });
      this._ready = Promise.all([make(this.items), make(this.log), make(this.cfg)])
        .catch(e => { this._ready = null; throw e; });
    }
    return this._ready;
  }

  async listItems() {
    await this.ready();
    const out = [];
    for await (const e of this.items.listEntities({ queryOptions: { filter: odata`PartitionKey eq ${ITEM_PK}` } })) {
      out.push({ ...pick(e, ITEM_FIELDS), _etag: e.etag });
    }
    return out;
  }

  async getItem(tag) {
    await this.ready();
    try {
      const e = await this.items.getEntity(ITEM_PK, tag);
      return { ...pick(e, ITEM_FIELDS), _etag: e.etag };
    } catch (e) {
      if (e.statusCode === 404) return null;
      throw e;
    }
  }

  // Returns false when the row changed underneath us (caller retries)
  async saveItem(item, isNew = false) {
    await this.ready();
    const entity = { partitionKey: ITEM_PK, rowKey: item.tag, ...pick(item, ITEM_FIELDS) };
    try {
      if (isNew) await this.items.createEntity(entity);
      else await this.items.updateEntity(entity, 'Replace', item._etag ? { etag: item._etag } : undefined);
      return true;
    } catch (e) {
      if (e.statusCode === 412 || e.statusCode === 409) return false;
      throw e;
    }
  }

  async nextTag(prefix) {
    await this.ready();
    for (let attempt = 0; attempt < 8; attempt++) {
      let row = null;
      try { row = await this.cfg.getEntity('cfg', 'tagCounter'); } catch (e) { if (e.statusCode !== 404) throw e; }
      const next = (row ? Number(row.value) : 0) + 1;
      try {
        if (row) await this.cfg.updateEntity({ partitionKey: 'cfg', rowKey: 'tagCounter', value: next }, 'Replace', { etag: row.etag });
        else await this.cfg.createEntity({ partitionKey: 'cfg', rowKey: 'tagCounter', value: next });
        return `${prefix}-${String(next).padStart(4, '0')}`;
      } catch (e) {
        if (e.statusCode !== 412 && e.statusCode !== 409) throw e;
      }
    }
    throw new Error('Could not allocate a tag number, please try again');
  }

  // Returns false if this scanId was already recorded (offline replay)
  async addLog(entry) {
    await this.ready();
    try {
      await this.log.createEntity({ partitionKey: entry.tag, rowKey: logKey(entry.at, entry.scanId), ...pick(entry, LOG_FIELDS) });
      await this.cfg.createEntity({ partitionKey: 'scan', rowKey: entry.scanId, tag: entry.tag });
      return true;
    } catch (e) {
      if (e.statusCode === 409) return false;
      throw e;
    }
  }

  async hasScan(scanId) {
    await this.ready();
    try { await this.cfg.getEntity('scan', scanId); return true; }
    catch (e) { if (e.statusCode === 404) return false; throw e; }
  }

  async history(tag, limit = 50) {
    await this.ready();
    const out = [];
    for await (const e of this.log.listEntities({ queryOptions: { filter: odata`PartitionKey eq ${tag}` } })) {
      out.push(pick(e, LOG_FIELDS));
      if (out.length >= limit) break;
    }
    return out;
  }

  async recent(limit = 100) {
    await this.ready();
    const out = [];
    for await (const e of this.log.listEntities()) out.push(pick(e, LOG_FIELDS));
    out.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    return out.slice(0, limit);
  }
}

// ─── In-memory backend (demo / tests) ────────────────────────────────────────
class MemoryStore {
  constructor() {
    this.mode = 'demo';
    this.items = new Map();
    this.logs = [];
    this.scans = new Set();
    this.counter = 0;
    this.version = 0;
  }
  async listItems() { return [...this.items.values()].map(i => ({ ...i })); }
  async getItem(tag) { const i = this.items.get(tag); return i ? { ...i } : null; }
  async saveItem(item, isNew = false) {
    const cur = this.items.get(item.tag);
    if (isNew && cur) return false;
    if (!isNew && cur && item._etag && cur._etag !== item._etag) return false;
    this.items.set(item.tag, { ...pick(item, ITEM_FIELDS), _etag: String(++this.version) });
    return true;
  }
  async nextTag(prefix) { return `${prefix}-${String(++this.counter).padStart(4, '0')}`; }
  async addLog(entry) {
    if (this.scans.has(entry.scanId)) return false;
    this.scans.add(entry.scanId);
    this.logs.push({ ...pick(entry, LOG_FIELDS), _seq: this.logs.length });
    return true;
  }
  async hasScan(scanId) { return this.scans.has(scanId); }
  async history(tag, limit = 50) {
    return this._sorted(this.logs.filter(l => l.tag === tag)).slice(0, limit);
  }
  async recent(limit = 100) {
    return this._sorted([...this.logs]).slice(0, limit);
  }
  _sorted(rows) {
    return rows.sort((a, b) => String(b.at).localeCompare(String(a.at)) || b._seq - a._seq)
      .map(({ _seq, ...r }) => r);
  }
}

let _store = null;
function getStore() {
  if (!_store) {
    const conn = process.env.EQUIPMENT_STORAGE || process.env.AzureWebJobsStorage_Equipment || '';
    _store = conn ? new TableStore(conn) : new MemoryStore();
  }
  return _store;
}
function setStore(s) { _store = s; }

module.exports = { getStore, setStore, MemoryStore, TableStore };
