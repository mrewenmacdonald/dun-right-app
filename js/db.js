// DÙN RIGHT — IndexedDB layer via Dexie (offline-first storage)

const db = new Dexie('DunRightDB');

// ─── v1: Original schema (preserved for upgrade path) ────────────────────────
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

// ─── v2: Adds LEMs, equipment, vehicles, walkarounds ─────────────────────────
db.version(2).stores({
  users:               '++id, username, role, email, active',
  projects:            '++id, name, clientName, clientEmail, status, createdBy, createdAt',
  workOrders:          '++id, projectId, userId, date, status, supervisorId, submittedAt, approvedAt, syncStatus',
  lems:                '++id, lemNumber, projectId, userId, date, status, supervisorId, submittedAt, approvedAt, syncStatus',
  payItems:            '++id, name, rate, unit, active',
  consumables:         '++id, name, unit, active',
  safetyForms:         '++id, userId, projectId, type, date, status, syncStatus',
  receipts:            '++id, userId, projectId, amount, billable, date, status, syncStatus',
  photos:              '++id, userId, projectId, filename, takenAt, syncStatus',
  notifications:       '++id, toUserId, fromUserId, message, scheduledAt, sentAt, read, type',
  invoices:            '++id, projectId, createdBy, status, total, createdAt, sentAt',
  invoiceItems:        '++id, invoiceId, lemId, description, quantity, rate, amount',
  settings:            'key',
  syncQueue:           '++id, type, payload, createdAt, attempts',
  equipment:           '++id, name, serialNumber, batteryStatus, status, active, assignedTo',
  equipmentAssignments:'++id, equipmentId, userId, lemId, assignedAt, returnedAt',
  vehicles:            '++id, name, plate, make, model, active',
  walkarounds:         '++id, vehicleId, userId, date, status, syncStatus'
});

// ─── v3: Adds per-LEM equipment & battery tracking, project number index ─────
db.version(3).stores({
  users:               '++id, username, role, email, active',
  projects:            '++id, name, projectNumber, clientName, clientEmail, status, createdBy, createdAt',
  workOrders:          '++id, projectId, userId, date, status, supervisorId, submittedAt, approvedAt, syncStatus',
  lems:                '++id, lemNumber, projectId, userId, date, status, supervisorId, submittedAt, approvedAt, syncStatus',
  payItems:            '++id, name, rate, unit, active',
  consumables:         '++id, name, unit, active',
  safetyForms:         '++id, userId, projectId, type, date, status, syncStatus',
  receipts:            '++id, userId, projectId, amount, billable, date, status, syncStatus',
  photos:              '++id, userId, projectId, filename, takenAt, syncStatus',
  notifications:       '++id, toUserId, fromUserId, message, scheduledAt, sentAt, read, type',
  invoices:            '++id, projectId, createdBy, status, total, createdAt, sentAt',
  invoiceItems:        '++id, invoiceId, lemId, description, quantity, rate, amount',
  settings:            'key',
  syncQueue:           '++id, type, payload, createdAt, attempts',
  equipment:           '++id, name, type, serialNumber, status, active, assignedTo',
  equipmentAssignments:'++id, equipmentId, userId, lemId, assignedAt, returnedAt',
  lemEquipment:        '++id, lemId, userId, equipmentType, serialNumber',
  lemBatteries:        '++id, lemId, userId, batteryType, quantity',
  vehicles:            '++id, name, plate, make, model, active',
  walkarounds:         '++id, vehicleId, userId, date, status, syncStatus'
});

// ─── Seed on first run ────────────────────────────────────────────────────────
db.on('ready', async () => {
  // Pay items
  const piCount = await db.payItems.count();
  if (piCount === 0) {
    await db.payItems.bulkAdd([
      { name: 'Survey Technician',    rate: 0, unit: 'hr', active: true },
      { name: 'Locate Technician',    rate: 0, unit: 'hr', active: true },
      { name: 'Survey Assistant',     rate: 0, unit: 'hr', active: true },
      { name: 'Drafting Technician',  rate: 0, unit: 'hr', active: true },
      { name: 'Project Manager',      rate: 0, unit: 'hr', active: true },
      { name: 'Project Coordinator',  rate: 0, unit: 'hr', active: true },
      { name: 'Construction Manager', rate: 0, unit: 'hr', active: true },
      { name: 'Construction Advisor', rate: 0, unit: 'hr', active: true }
    ]);
  }

  // Consumables
  const ccCount = await db.consumables.count();
  if (ccCount === 0) {
    await db.consumables.bulkAdd([
      { name: 'Paint Cans',    unit: 'each',   active: true },
      { name: 'Stake Bundles', unit: 'bundle', active: true },
      { name: 'Nails',         unit: 'box',    active: true },
      { name: 'Rebar',         unit: 'each',   active: true },
      { name: 'Flagging Tape', unit: 'roll',   active: true },
      { name: 'Marking Paint', unit: 'can',    active: true }
    ]);
  }

  // Users
  const ucCount = await db.users.count();
  if (ucCount === 0) {
    await db.users.bulkAdd([
      { username: 'ewen',   password: 'password', role: 'supervisor', name: 'Ewen MacDonald', email: 'ewen@kelticgeo.com',   active: true, hourlyRate: 85, province: 'BC' },
      { username: 'ivy',    password: 'password', role: 'supervisor', name: 'Ivy',             email: 'ivy@kelticgeo.com',    active: true, hourlyRate: 85, province: 'BC' },
      { username: 'field1', password: 'password', role: 'field',      name: 'Field Staff 1',   email: 'field1@kelticgeo.com', active: true, hourlyRate: 50, province: 'BC' }
    ]);
  }

  // Equipment — Keltic Geomatics instrument fleet
  const eqCount = await db.equipment.count();
  if (eqCount === 0) {
    await db.equipment.bulkAdd([
      { name: 'Trimble R10',             type: 'Trimble R10',            serialNumber: '',        status: 'available', active: true, assignedTo: null },
      { name: 'Trimble R12',             type: 'Trimble R12',            serialNumber: '',        status: 'available', active: true, assignedTo: null },
      { name: 'Trimble SX10',            type: 'Trimble SX10',           serialNumber: '',        status: 'available', active: true, assignedTo: null },
      { name: 'Trimble S7',              type: 'Trimble S7',             serialNumber: '',        status: 'available', active: true, assignedTo: null },
      { name: 'Trimble VX',              type: 'Trimble VX',             serialNumber: '',        status: 'available', active: true, assignedTo: null },
      { name: 'Utility Locator',         type: 'Utility Locator',        serialNumber: 'EM-001',  status: 'available', active: true, assignedTo: null },
      { name: 'Mavic 3E Drone',          type: 'Mavic 3E Drone',         serialNumber: '',        status: 'available', active: true, assignedTo: null },
      { name: 'Phantom 4 RTK Drone',     type: 'Phantom 4 RTK Drone',    serialNumber: '',        status: 'available', active: true, assignedTo: null },
      { name: 'Digital Level',           type: 'Other',                  serialNumber: 'LEV-001', status: 'available', active: true, assignedTo: null }
    ]);
  }

  // Default vehicle
  const vCount = await db.vehicles.count();
  if (vCount === 0) {
    await db.vehicles.bulkAdd([
      { name: 'Truck 1', plate: '', make: '', model: '', year: '', active: true }
    ]);
  }
});

// ─── Auth ─────────────────────────────────────────────────────────────────────
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

// ─── Projects ─────────────────────────────────────────────────────────────────
export async function getProjects(activeOnly = true) {
  return activeOnly
    ? db.projects.where('status').equals('active').toArray()
    : db.projects.toArray();
}

export async function createProject(data) {
  return db.projects.add({ ...data, status: 'active', createdAt: new Date().toISOString() });
}

// ─── Project Number Generator ─────────────────────────────────────────────────
export async function generateProjectNumber() {
  const yy = String(new Date().getFullYear()).slice(2); // e.g. "26"
  const counterKey = `projectCounter_${yy}`;
  const current = await db.settings.get(counterKey);
  const next = (current ? current.value : 0) + 1;
  await db.settings.put({ key: counterKey, value: next });
  return `${yy}${String(next).padStart(4, '0')}`; // e.g. "260001"
}

// ─── LEMs ─────────────────────────────────────────────────────────────────────
export async function createLEM(data) {
  return db.lems.add({ ...data, status: 'draft', syncStatus: 'pending', submittedAt: null });
}

export async function getLEMsByUser(userId) {
  return db.lems.where('userId').equals(userId).reverse().sortBy('date');
}

export async function getAllLEMs() {
  return db.lems.reverse().sortBy('date');
}

export async function getPendingLEMs() {
  return db.lems.where('status').equals('submitted').toArray();
}

// ─── Equipment ────────────────────────────────────────────────────────────────
export async function getAllEquipment() {
  return db.equipment.where('active').equals(1).toArray();
}

// ─── Notifications ────────────────────────────────────────────────────────────
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

// ─── Settings ─────────────────────────────────────────────────────────────────
export async function getSetting(key) {
  const row = await db.settings.get(key);
  return row ? row.value : null;
}

export async function setSetting(key, value) {
  return db.settings.put({ key, value });
}
