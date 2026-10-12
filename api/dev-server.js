// Local test server: serves the app and the equipment API on one port, no Azure tools needed.
//   cd api && npm install && node dev-server.js            (in-memory demo data)
//   EQUIPMENT_STORAGE="<connection string>" node dev-server.js   (real Table Storage)
// Then open http://localhost:8080

const http = require('http');
const fs = require('fs');
const path = require('path');
const h = require('./src/handlers');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.PORT || 8080;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

const routes = [
  ['GET',  /^\/api\/equipment$/,                 h.list,     []],
  ['POST', /^\/api\/equipment$/,                 h.create,   []],
  ['PUT',  /^\/api\/equipment\/([^/]+)$/,        h.update,   ['tag']],
  ['POST', /^\/api\/equipment\/([^/]+)\/scan$/,   h.scan,     ['tag']],
  ['GET',  /^\/api\/equipment\/([^/]+)\/history$/, h.history, ['tag']],
  ['GET',  /^\/api\/equipment-activity$/,        h.activity, []]
];

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith('/api/')) {
    const r = routes.find(([m, re]) => m === req.method && re.test(url.pathname));
    if (!r) { res.writeHead(404); return res.end(); }
    const match = url.pathname.match(r[1]);
    const params = Object.fromEntries(r[3].map((k, i) => [k, decodeURIComponent(match[i + 1])]));
    let raw = '';
    for await (const chunk of req) raw += chunk;
    let body = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
    const out = await r[2]({ method: req.method, params, query: Object.fromEntries(url.searchParams), headers: req.headers, body });
    res.writeHead(out.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify(out.jsonBody));
  }
  let file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) file = path.join(ROOT, 'index.html');
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`DÙN RIGHT dev server on http://localhost:${PORT}`));
