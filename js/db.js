// DÙN RIGHT — IndexedDB layer via Dexie (offline-first storage)

const db = new Dexie('DunRightDB');

db.version(1).stores({
  users:        '++id, username, role, email, active',
  projects:     '++id, name, clientName, clientEmail, status, createdBy, createdAt',
  workOrders:   '++id, projectId, userId, date, status, supervisorId, submittedAt, approvedAt, syncStatus',
  payItems:     '++id, name, rate, unit, active',
  consumables:  '++id, name, unit, active',
  safetyForms:  '++id, userId, projectId, type, date, status, syncStatus',
  receipts:     '++id, userId, projectId, amount, billable, date, status, syncStatus',
  photos:       '++id, userId, projectId, filename, takenAt, syncStatus',
  notifications:'++id, toUserId, fromUserId, message, scheduledAt, sentAt, read, type',
  invoices:     '++id, projectId, createdBy, status, total, createdAt, sentAt',
  invoiceItems: '++id, invoiceId, workOrderId, description, quantity, rate, amount',
  settings:     'key',
  syncQueue:    '++id, type, payload, createdAt, attempts'
});

// ─── Seed default pay items & consumables on first run ───────────────────────
db.on('ready', async () => {
  const count = await db.payItems.count();
  if (count === 0) {
    await db.payItems.bulkAdd([
      { name: 'Survey Technician',       rate: 0, unit: 'hr', active: true },
      { name: 'Locate Technician',       rate: 0, unit: 'hr', active: true },
      { name: 'Survey Assistant',        rate: 0, unit: 'hr', active: true },
      { name: 'Drafting Technician',     rate: 0, unit: 'hr', active: true },
      { name: 'Project Manager',         rate: 0, unit: 'hr', active: true },
      { name: 'Project Coordinator',     rate: 0, unit: 'hr', active: true },
      { name: 'Construction Manager',    rate: 0, unit: 'hr', active: true },
      { name: 'Construction Advisor',    rate: 0, unit: 'hr', active: true }
    ]);
  }
  const cc = await db.consumables.count();
  if (cc === 0) {
    await db.consumables.bulkAdd([
      { name: 'Paint Cans',    unit: 'each', active: true },
      { name: 'Stake Bundles', unit: 'bundle', active: true },
      { name: 'Nails',         unit: 'box',  active: true },
      { name: 'Rebar',         unit: 'each', active: true }
    ]);
  }
  // Seed demo supervisor if no users exist
  const uc = await db.users.count();
  if (uc === 0) {
    await db.users.bulkAdd([
      { username: 'ewen',   password: 'password', role: 'supervisor', name: 'Ewen MacDonald', email: 'ewen@kelticgeo.com',     active: true },
      { username: 'ivy',    password: 'password', role: 'supervisor', name: 'Ivy',             email: 'ivy@kelticgeo.com',      active: true },
      { username: 'field1', password: 'password', role: 'field',      name: 'Field Staff 1',   email: 'field1@kelticgeo.com',   active: true }
    ]);
  }
});

// ─── Auth helpers ─────────────────────────────────────────────────────────────
window.DR_DB = db;

export async function login(username, password) {
  const user = await db.users.where('username').equals(username.toLowerCase()).first();
  if (!user || user.password !== password || !user.active) return null;
  return user;
}

export async function getUser(id) {
  return db.users.get(id);
}

export async function getAllUsers() {
  return db.users.where('active').equals(1).toArray();
}

// ─── Project helpers ──────────────────────────────────────────────────────────
export async function getProjects(activeOnly = true) {
  const q = db.projects;
  return activeOnly ? q.where('status').equals('active').toArray() : q.toArray();
}

export async function createProject(data) {
  return db.projects.add({ ...data, status: 'active', createdAt: new Date().toISOString() });
}

// ─── Work Order helpers ───────────────────────────────────────────────────────
export async function createWorkOrder(data) {
  const id = await db.workOrders.add({ ...data, status: 'draft', syncStatus: 'pending', submittedAt: null });
  return id;
}

export async function getWorkOrdersByUser(userId) {
  return db.workOrders.where('userId').equals(userId).reverse().sortBy('date');
}

export async function getPendingApprovals() {
  return db.workOrders.where('status').equals('submitted').toArray();
}

// ─── Notification helpers ─────────────────────────────────────────────────────
export async function getNotifications(userId) {
  const now = new Date().toISOString();
  return db.notifications
    .where('toUserId').equals(userId)
    .filter(n => n.scheduledAt <= now)
    .reverse()
    .sortBy('scheduledAt');
}

export async function markRead(id) {
  return db.notifications.update(id, { read: true });
}

// ─── Settings helpers ─────────────────────────────────────────────────────────
export async function getSetting(key) {
  const row = await db.settings.get(key);
  return row ? row.value : null;
}

export async function setSetting(key, value) {
  return db.settings.put({ key, value });
}
