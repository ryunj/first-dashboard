import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import {createRequire} from 'node:module';

const backupPath = process.env.AI_REAL_BACKUP;
if (!backupPath) {
  console.log('SKIP: set AI_REAL_BACKUP to run partial-week YoY validation');
  process.exit(0);
}
const require = createRequire(import.meta.url);
const {chromium} = require('playwright');
const backup = JSON.parse(zlib.gunzipSync(fs.readFileSync(backupPath)));
const root = new URL('../', import.meta.url);
let html = fs.readFileSync(new URL('dashboard.html', root), 'utf8');
const ai = fs.readFileSync(new URL('ai_question.js', root), 'utf8');
const marker = /<script>\r?\nwindow\.__dashMain = function \(\) \{/;
const data = JSON.stringify(backup.data).replace(/<\//g, '<\\/');
html = html.replace(marker, match => `<script>window.DASH_EMBED='test';window.DASH_DATA=${data};window.DASH_KPI=null;window.DASH_PROD=null;</script><script>${ai}</script>${match}`);

const executablePath = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(path => path && fs.existsSync(path));
const browser = await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
const page = await browser.newPage();
await page.setContent(html,{waitUntil:'networkidle',timeout:60000});
await page.waitForFunction(() => window.__dash);

const values = await page.evaluate(() => {
  const dash = window.__dash, state = dash.state, row = {ch:'광고',seg:'T'};
  const read = (grain, at) => {
    state.grain = grain; state.year = 2026; state.mode = 'avg'; state.cmp = 'yoy'; state.cmpY = 1;
    state.at[grain] = at;
    const col = dash.getCols(true).find(value => value.id === at);
    if (!col) throw new Error(`missing ${grain} column ${at}`);
    return Object.fromEntries(['tr','jr','fpr'].map(metric => [metric, dash.evalCol(metric,row,col)]));
  };
  state.grain = 'week'; state.year = 2026; state.cmp = 'yoy';
  const columns = dash.getCols(true);
  const partial = columns.find(value => value.id === '2026-W39');
  const complete = columns.find(value => value.cur.length === 7 && value.wk && value.wk.cur != null);
  return {week:read('week','2026-W39'),day:read('day','2026-09-21'), partialWeeklyRef: partial && partial.wk, completeWeeklyRef: complete && complete.wk};
});

for (const metric of ['tr','jr','fpr']) {
  assert.equal(values.week[metric].c, values.day[metric].c, `${metric}: one-day partial-week current must equal daily current`);
  assert.equal(values.week[metric].p, values.day[metric].p, `${metric}: one-day partial-week YoY must use the same prior weekday`);
}
assert.equal(values.partialWeeklyRef, null, 'partial week must not use a full-week deduplicated reference');
assert.ok(values.completeWeeklyRef && values.completeWeeklyRef.cur != null, 'complete week must retain its weekly deduplicated reference');

await browser.close();
console.log('OK: one-day partial week uses same-period/same-weekday YoY for traffic-based metrics');
