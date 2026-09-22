import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {chromium} = require('playwright');
const root = new URL('../', import.meta.url);
let html = fs.readFileSync(new URL('dashboard.html', root), 'utf8');
const ai = fs.readFileSync(new URL('ai_question.js', root), 'utf8');
const dates = Array.from({length: 14}, (_, index) => `2026-09-${String(index + 7).padStart(2, '0')}`);
const n = dates.length;
const data = {meta:{built:'test',sources:['test'],lastDate:dates.at(-1),channels:['*TOTAL']},daily:{p:dates,s:{
  'amt|T|*TOTAL':Array(n).fill(100),'cust|T|*TOTAL':Array(n).fill(10),'tr|*TOTAL':Array(n).fill(1000),
  'sg|*TOTAL':Array(n).fill(100),'fpn|*TOTAL':Array(n).fill(50),'crn|*TOTAL':Array(n).fill(10),
}},weekly:{p:[],s:{}}};
const marker = /<script>\r?\nwindow\.__dashMain = function \(\) \{/;
const inject = `<script>window.DASH_EMBED='test';window.DASH_DATA=${JSON.stringify(data)};window.DASH_PROD=null;window.DASH_KPI=null;</script><script>${ai}</script>`;
html = html.replace(marker, match => inject + match);

const executablePath = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(p => p && fs.existsSync(p));
const browser = await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
const page = await browser.newPage();
await page.setContent(html,{waitUntil:'networkidle'});
await page.waitForFunction(() => window.__dash && window.FP_MEMOS);
await page.evaluate(() => {
  window.FP_MEMOS.add({id:'week-37',text:'9월 2주 메모',html:'9월 2주 메모',html2:'',color:'blue',created:'2026-09-13T12:00:00+09:00',updated:'2026-09-13T12:00:00+09:00',view:{year:2026,grain:'week',mode:'avg',cmp:'yoy',cmpY:1,at:'2026-W37',range:'13',chans:['*TOTAL'],segs:['T'],layout:'block',bpus:[],bpuAll:true,cats:[],catNone:false}});
  Object.assign(window.__dash.state,{year:2026,grain:'day',mode:'avg',cmp:'yoy',cmpY:1,chans:['*TOTAL'],segs:['T']});
  window.__dash.state.at.day=''; window.__dash.render();
  document.querySelector('[data-memof="view"]').click();
});
assert.equal(await page.locator('#dateAt').inputValue(),'2026-09-20');
assert.equal(await page.locator('#memoList .memo-item').count(),0);
await page.evaluate(() => {window.__dash.state.at.day='2026-09-10';window.__dash.render();});
assert.equal(await page.locator('#memoList .memo-item').count(),1);
await browser.close();
console.log('OK: existing memo period regression still passes');
