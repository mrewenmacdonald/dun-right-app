// DÙN RIGHT — HTTP handlers, shared by the Azure Functions entry point and the local dev server

const { getStore } = require('./store');
const eq = require('./equipment');

// Optional shared key. If EQUIPMENT_API_KEY is set in Azure, the app must send it.
function checkKey(headers) {
  const want = process.env.EQUIPMENT_API_KEY;
  if (!want) return;
  const got = headers['x-dr-key'] || '';
  if (got !== want) throw new eq.HttpError(401, 'Not authorised');
}

function ok(body, status = 200) { return { status, jsonBody: body }; }

async function run(fn) {
  try { return await fn(); }
  catch (e) {
    if (e instanceof eq.HttpError) return { status: e.status, jsonBody: { error: e.message } };
    console.error(e);
    return { status: 500, jsonBody: { error: 'Server error: ' + (e.message || 'unknown') } };
  }
}

// GET /api/equipment
const list = req => run(async () => {
  checkKey(req.headers);
  const store = getStore();
  const items = await eq.listItems(store, { includeRetired: req.query.retired === '1' });
  return ok({ items, mode: store.mode, serverTime: new Date().toISOString() });
});

// POST /api/equipment   body: {name,type,serial,notes,actor} or {import:[...], actor}
const create = req => run(async () => {
  checkKey(req.headers);
  const store = getStore();
  const body = req.body || {};
  if (Array.isArray(body.import)) return ok(await eq.importItems(store, body.import, body.actor), 201);
  return ok({ item: await eq.createItem(store, body, body.actor) }, 201);
});

// PUT /api/equipment/{tag}
const update = req => run(async () => {
  checkKey(req.headers);
  return ok({ item: await eq.updateItem(getStore(), req.params.tag, req.body || {}) });
});

// POST /api/equipment/{tag}/scan
const scan = req => run(async () => {
  checkKey(req.headers);
  return ok(await eq.applyScan(getStore(), req.params.tag, req.body || {}));
});

// GET /api/equipment/{tag}/history
const history = req => run(async () => {
  checkKey(req.headers);
  const store = getStore();
  const tag = eq.normaliseTag(req.params.tag);
  const item = await store.getItem(tag);
  if (!item) throw new eq.HttpError(404, `No equipment with tag ${tag}`);
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const { _etag, ...pub } = item;
  return ok({ item: pub, history: await store.history(tag, limit) });
});

// GET /api/equipment-activity
const activity = req => run(async () => {
  checkKey(req.headers);
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
  return ok({ activity: await getStore().recent(limit) });
});

module.exports = { list, create, update, scan, history, activity };
