import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {chromium} = require('playwright');
const root = new URL('../', import.meta.url);
let html = fs.readFileSync(new URL('dashboard.html', root), 'utf8');
const ai = fs.readFileSync(new URL('ai_question.js', root), 'utf8');
const dates = ['2026-02-09','2026-02-10','2026-02-11','2026-02-12','2026-02-13','2026-02-14','2026-02-15'];
const signups = [2656,8725,3637,1800,1350,1196,1194];
const dailyRates = [.178,.07,.134,.226,.224,.243,.265];
const data = {
  meta:{built:'test',sources:[],lastDate:dates.at(-1),channels:['*TOTAL']},
  daily:{p:dates,s:{
    'amt|T|*TOTAL':dates.map(() => 1),
    'cust|T|*TOTAL':dates.map(() => 1),
    'tr|*TOTAL':dates.map(() => 10000),
    'sg|*TOTAL':signups,
    'crn|*TOTAL':signups.map((value,index) => value * dailyRates[index]),
  }},
  weekly:{p:[{y:2026,m:2,n:2,w:7,start:'2026-02-09',d:7}],s:{
    'sg|*TOTAL':[20558],
    'crn|*TOTAL':[20558 * .141],
  }},
};
const marker = /<script>\r?\nwindow\.__dashMain = function \(\) \{/;
html = html.replace(marker, match => `<script>window.DASH_EMBED='test';window.DASH_DATA=${JSON.stringify(data)};window.DASH_KPI=null;window.DASH_PROD=null;</script><script>${ai}</script>${match}`);

const executablePath = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(path => fs.existsSync(path));
const browser = await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
const page = await browser.newPage();
try {
  await page.setContent(html,{waitUntil:'networkidle',timeout:60000});
  await page.waitForFunction(() => window.__dash);
  const result = await page.evaluate(() => {
    const dash = window.__dash, state = dash.state;
    Object.assign(state,{grain:'week',year:2026,mode:'avg',cmp:'yoy',cmpY:1});
    const col = dash.getCols(true).find(value => value.id === '2026-W07');
    return {weekIndex:col?.wk?.cur ?? null, value:dash.evalCol('cr',{ch:'*TOTAL',seg:'T'},col).c};
  });
  assert.equal(result.weekIndex,0,'complete weekly column must retain its matching weekly raw index');
  assert.ok(Math.abs(result.value - .141) < 1e-12,`weekly CR must use weekly raw 14.1%, got ${result.value}`);
} finally {
  await browser.close();
}

console.log('OK: complete-week signup CR matches the weekly raw ratio');
