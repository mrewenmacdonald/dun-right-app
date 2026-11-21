// Copies the static web app into www/ so Capacitor can bundle it.
// The app has no build step, so this is a plain copy.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'www');
const items = ['index.html', 'manifest.json', 'service-worker.js', 'css', 'js', 'icons'];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const item of items) {
  const src = path.join(root, item);
  if (!fs.existsSync(src)) {
    console.warn(`skip (not found): ${item}`);
    continue;
  }
  fs.cpSync(src, path.join(out, item), { recursive: true });
  console.log(`copied: ${item}`);
}
console.log(`www ready: ${out}`);
