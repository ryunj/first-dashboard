import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {chromium} = require('playwright');
const root = new URL('../', import.meta.url);
let html = fs.readFileSync(new URL('dashboard.html', root), 'utf8');
const ai = fs.readFileSync(new URL('ai_question.js', root), 'utf8');
const dates = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28'];
const data = {meta:{built:'test',sources:['test'],lastDate:dates.at(-1),channels:['*TOTAL']},daily:{p:dates,s:{
  'amt|T|*TOTAL':[100,0,0,0,0,0,0,120], 'cust|T|*TOTAL':[10,0,0,0,0,0,0,12],
  'tr|*TOTAL':[1000,0,0,0,0,0,0,1200], 'sg|*TOTAL':[100,0,0,0,0,0,0,120],
}},weekly:{p:[],s:{}}};
const prod = {meta:{built:'test',start:dates[0],days:8,lastDate:dates.at(-1),rows:2,products:1,topN:null,factFields:7,covFields:6,covFields2:7,covFields3:6,positiveOnly:true},
  ch:['광고'],bpu:['e-영업1'],cat:['여성의류'],brand:['브랜드'],grp:[],paths:[0,0,0],prods:['P1','상품1'],
  f:[0,0,0,0,0,100,10,7,0,0,0,0,120,12],cov:[],cov2:[],cov3:[]};
const marker = /<script>\r?\nwindow\.__dashMain = function \(\) \{/;
html = html.replace(marker, match => `<script>window.DASH_EMBED='test';window.DASH_DATA=${JSON.stringify(data)};window.DASH_KPI=null;window.DASH_PROD=${JSON.stringify(prod)};</script><script>${ai}</script>${match}`);
const executablePath = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(p => fs.existsSync(p));
const browser = await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
const page = await browser.newPage();
await page.setContent(html,{waitUntil:'networkidle',timeout:60000});
await page.waitForFunction(() => window.__dash && window.__dash.prodReady());
const result = await page.evaluate(() => {
  const d=window.__dash; Object.assign(d.state,{grain:'week',year:2026,mode:'sum',cmp:'yoy',cmpY:1}); d.state.at.week=''; d.render();
  const e=d.prodView().exp, row=e.rows[0];
  return {weekCompare:e.weekCompare,wa:row.wa,wda:row.wda,wu:row.wu,wdu:row.wdu,text:document.querySelector('#pdBody').innerText};
});
await browser.close();
assert.equal(result.weekCompare,true);
assert.equal(result.wa,100);
assert.equal(result.wu,10);
assert.match(result.wda.t,/20/);
assert.match(result.wdu.t,/20/);
assert.match(result.text,/전주비/);
console.log('OK: product first-purchase rows include previous-week values and rates');
