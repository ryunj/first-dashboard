import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import {createRequire} from 'node:module';

const backupPath = process.env.PRODUCT_MEMBER_BACKUP;
if (!backupPath) {
  console.log('SKIP: set PRODUCT_MEMBER_BACKUP to validate product member filters');
  process.exit(0);
}
const backup = JSON.parse(zlib.gunzipSync(fs.readFileSync(backupPath)));
assert.equal(backup.prod.meta.factFields, 7);
const lastDay = backup.prod.meta.days - 1, expected = {T: {a: 0, u: 0}, 1: {a: 0, u: 0}, 2: {a: 0, u: 0}, 3: {a: 0, u: 0}};
let day = 0;
for (let i = 0; i < backup.prod.f.length; i += 7) {
  day += backup.prod.f[i];
  if (day !== lastDay) continue;
  const seg = backup.prod.f[i + 4], a = backup.prod.f[i + 5], u = backup.prod.f[i + 6];
  expected[seg].a += a; expected[seg].u += u; expected.T.a += a; expected.T.u += u;
}

const require = createRequire(import.meta.url);
const {chromium} = require('playwright');
const root = new URL('../', import.meta.url);
let html = fs.readFileSync(new URL('dashboard.html', root), 'utf8');
const marker = /<script>\r?\nwindow\.__dashMain = function \(\) \{/;
const inject = `<script>window.DASH_EMBED='test';window.DASH_DATA=${JSON.stringify(backup.data).replace(/<\//g, '<\\/')};window.DASH_KPI=null;window.DASH_PROD=${JSON.stringify(backup.prod).replace(/<\//g, '<\\/')};</script>`;
html = html.replace(marker, match => inject + match);
const executablePath = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(path => fs.existsSync(path));
const browser = await chromium.launch({headless: true, ...(executablePath ? {executablePath} : {})});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.setContent(html, {waitUntil: 'domcontentloaded', timeout: 120000});
await page.waitForFunction(() => window.__dash && window.__dash.prodReady(), null, {timeout: 120000});
const actual = await page.evaluate(lastDate => {
  const dash = window.__dash;
  dash.state.grain = 'day'; dash.state.year = +lastDate.slice(0, 4); dash.state.at.day = lastDate;
  dash.state.chans = ['*TOTAL']; dash.prodState.cats = []; dash.prodState.catNone = false; dash.prodState.bpus = []; dash.prodState.bpuAll = true;
  const read = seg => { dash.state.segs = [seg]; dash.render(); const row = dash.prodView().totalRow; return {a: row.a, u: row.u}; };
  return {T: read('T'), 1: read('1'), 2: read('2'), 3: read('3')};
}, backup.prod.meta.lastDate);
for (const seg of ['T', '1', '2', '3']) {
  assert.equal(actual[seg].a, expected[seg].a, `${seg} product amount must match encoded facts`);
  assert.equal(actual[seg].u, expected[seg].u, `${seg} product customer sum must match encoded facts`);
}
assert.equal(actual[1].a + actual[2].a + actual[3].a, actual.T.a);
assert.equal(actual[1].u + actual[2].u + actual[3].u, actual.T.u);
assert.equal(errors.length, 0, `page errors: ${errors.join(' | ')}`);
await browser.close();
console.log(`OK: ${backup.prod.meta.lastDate} product totals follow T/1/2/3 member filters and reconcile`);
