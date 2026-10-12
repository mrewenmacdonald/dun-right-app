// DÙN RIGHT — Azure Functions (Node v4 programming model) for equipment tracking.
// Deployed automatically by Azure Static Web Apps from the /api folder.

const { app } = require('@azure/functions');
const h = require('../handlers');

// Adapt an Azure HttpRequest to the plain object the handlers expect
function wrap(handler) {
  return async (request) => {
    let body = null;
    if (request.method !== 'GET') {
      try { body = await request.json(); } catch { body = {}; }
    }
    const headers = {};
    request.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
    const query = Object.fromEntries(request.query.entries());
    const res = await handler({ method: request.method, params: request.params || {}, query, headers, body });
    return { ...res, headers: { 'Cache-Control': 'no-store' } };
  };
}

app.http('equipmentList',     { methods: ['GET'],  authLevel: 'anonymous', route: 'equipment',                handler: wrap(h.list) });
app.http('equipmentCreate',   { methods: ['POST'], authLevel: 'anonymous', route: 'equipment',                handler: wrap(h.create) });
app.http('equipmentUpdate',   { methods: ['PUT'],  authLevel: 'anonymous', route: 'equipment/{tag}',          handler: wrap(h.update) });
app.http('equipmentScan',     { methods: ['POST'], authLevel: 'anonymous', route: 'equipment/{tag}/scan',     handler: wrap(h.scan) });
app.http('equipmentHistory',  { methods: ['GET'],  authLevel: 'anonymous', route: 'equipment/{tag}/history',  handler: wrap(h.history) });
app.http('equipmentActivity', { methods: ['GET'],  authLevel: 'anonymous', route: 'equipment-activity',       handler: wrap(h.activity) });
