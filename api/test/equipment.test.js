// Run: npm test   (set TEST_TABLE_CONN to also run against Azurite / real Table Storage)
const test = require('node:test');
const assert = require('node:assert');
const { MemoryStore, TableStore } = require('../src/store');
const eq = require('../src/equipment');

const stores = [['memory', () => new MemoryStore()]];
if (process.env.TEST_TABLE_CONN) stores.push(['table', () => new TableStore(process.env.TEST_TABLE_CONN)]);

const ben = { name: 'Ben Redl', username: 'ben' };
const sam = { name: 'Sam Field', username: 'sam' };
let n = 0;
const sid = () => `test-${process.pid}-${Date.now()}-${++n}`;

for (const [label, make] of stores) {
  test(`${label}: create, check out, check in`, async () => {
    const s = make();
    const item = await eq.createItem(s, { name: 'Trimble R12i', type: 'Trimble R12', serial: `SN-${Date.now()}-${n++}` }, 'ewen');
    assert.match(item.tag, /^KG-\d{4}$/);
    assert.equal(item.status, 'available');

    const out = await eq.applyScan(s, item.tag, { action: 'out', user: ben, project: '260101 YVR', scanId: sid() });
    assert.equal(out.item.status, 'out');
    assert.equal(out.item.holderName, 'Ben Redl');
    assert.equal(out.item.project, '260101 YVR');

    await new Promise(r => setTimeout(r, 5));
    const back = await eq.applyScan(s, item.tag, { action: 'in', user: ben, scanId: sid() });
    assert.equal(back.item.status, 'available');
    assert.equal(back.item.holderName, '');

    const hist = await s.history(item.tag);
    assert.equal(hist.length, 2);
    assert.equal(hist[0].action, 'in'); // newest first
  });

  test(`${label}: label URL accepted, transfer records previous holder`, async () => {
    const s = make();
    const item = await eq.createItem(s, { name: 'SX10', serial: `SX-${Date.now()}-${n++}` }, 'ewen');
    await eq.applyScan(s, item.tag, { action: 'out', user: ben, scanId: sid() });
    const url = `https://witty-plant-05789e010.7.azurestaticapps.net/?eq=${item.tag.toLowerCase()}`;
    const r = await eq.applyScan(s, url, { action: 'out', user: sam, scanId: sid() });
    assert.equal(r.item.holderName, 'Sam Field');
    assert.equal(r.prevHolder, 'Ben Redl');
  });

  test(`${label}: duplicate scanId is ignored (offline replay)`, async () => {
    const s = make();
    const item = await eq.createItem(s, { name: 'Locator' }, 'ewen');
    const id = sid();
    await eq.applyScan(s, item.tag, { action: 'out', user: ben, scanId: id });
    const again = await eq.applyScan(s, item.tag, { action: 'out', user: ben, scanId: id });
    assert.equal(again.duplicate, true);
    assert.equal((await s.history(item.tag)).length, 1);
  });

  test(`${label}: late offline scan is logged but does not override newer state`, async () => {
    const s = make();
    const item = await eq.createItem(s, { name: 'R10' }, 'ewen');
    const early = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    await eq.applyScan(s, item.tag, { action: 'out', user: sam, scanId: sid() });
    const late = await eq.applyScan(s, item.tag, { action: 'in', user: ben, at: early, scanId: sid() });
    assert.equal(late.stale, true);
    assert.equal(late.item.status, 'out');
    assert.equal(late.item.holderName, 'Sam Field');
    assert.equal((await s.history(item.tag)).length, 2);
  });

  test(`${label}: check in flagged for service, then back in service`, async () => {
    const s = make();
    const item = await eq.createItem(s, { name: 'Data collector TSC7' }, 'ewen');
    await eq.applyScan(s, item.tag, { action: 'out', user: ben, scanId: sid() });
    const r = await eq.applyScan(s, item.tag, { action: 'in', user: ben, condition: 'service', note: 'Cracked screen', scanId: sid() });
    assert.equal(r.item.status, 'service');
    assert.equal(r.item.serviceNote, 'Cracked screen');
    const fixed = await eq.updateItem(s, item.tag, { status: 'available' });
    assert.equal(fixed.status, 'available');
    assert.equal(fixed.serviceNote, '');
  });

  test(`${label}: duplicate serial and unknown tag are rejected`, async () => {
    const s = make();
    const serial = `DUP-${Date.now()}-${n++}`;
    await eq.createItem(s, { name: 'A', serial }, 'ewen');
    await assert.rejects(eq.createItem(s, { name: 'B', serial }, 'ewen'), /already tagged/);
    await assert.rejects(eq.applyScan(s, 'KG-9999', { action: 'out', user: ben, scanId: sid() }), /No equipment/);
    await assert.rejects(eq.applyScan(s, 'hello world', { action: 'out', user: ben, scanId: sid() }), /valid equipment tag/);
  });

  test(`${label}: retired items cannot be scanned`, async () => {
    const s = make();
    const item = await eq.createItem(s, { name: 'Old level' }, 'ewen');
    await eq.updateItem(s, item.tag, { status: 'retired' });
    await assert.rejects(eq.applyScan(s, item.tag, { action: 'out', user: ben, scanId: sid() }), /retired/);
    const listed = await eq.listItems(s);
    assert.ok(!listed.find(i => i.tag === item.tag));
  });
}
