import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {chromium} = require('playwright');
const root = new URL('../', import.meta.url);
let html = fs.readFileSync(new URL('dashboard.html', root), 'utf8');
const ai = fs.readFileSync(new URL('ai_question.js', root), 'utf8');
const dates = ['2025-10-13', '2026-10-12'];
const pair = (previous, current) => [previous, current];
const data = {
  meta:{built:'test',sources:[],lastDate:'2026-10-12',channels:['*TOTAL','직접']},
  daily:{p:dates,s:{
    'amt|T|*TOTAL':pair(90e6,100e6),'cust|T|*TOTAL':pair(9,10),
    'amt|T|직접':pair(20e6,40e6),'cust|T|직접':pair(2,4),
    'tr|*TOTAL':pair(900,1000),'sg|*TOTAL':pair(90,100),'crn|*TOTAL':pair(27,30),'fpn|*TOTAL':pair(9,10),
    'tr|직접':pair(180,400),'sg|직접':pair(18,40),'crn|직접':pair(5.4,12),'fpn|직접':pair(1.8,4),
  }},
  weekly:{p:[],s:{}},
};
const marker = /<script>\r?\nwindow\.__dashMain = function \(\) \{/;
html = html.replace(marker, match => `<script>window.DASH_EMBED='test';window.DASH_DATA=${JSON.stringify(data)};window.DASH_KPI=null;window.DASH_PROD=null;</script><script>${ai}</script>${match}`);

const executablePath = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(path => fs.existsSync(path));
const browser = await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
const page = await browser.newPage();
try {
  await page.setContent(html,{waitUntil:'networkidle',timeout:60000});
  await page.waitForFunction(() => window.__dash);
  await page.evaluate(() => {
    Object.assign(window.__dash.state,{grain:'day',year:2026,mode:'avg',cmp:'yoy',cmpY:1});
    window.__dash.state.at.day = '2026-10-12';
    window.__dash.render();
  });
  assert.match(await page.locator('#sumDesc').innerText(),/· 전체 ·/);
  assert.equal((await page.locator('#tiles .t-v').first().innerText()).replace(/\s/g,''),'100백만원');
  await page.locator('#btnFilt').click();
  await page.locator('[data-chan="직접"]').click();
  assert.deepEqual(await page.evaluate(() => window.__dash.state.chans),['*TOTAL','직접'],'total and individual series must remain available for comparison');
  assert.match(await page.locator('#sumDesc').innerText(),/· 직접 \(선택 중 첫 번째\) ·/,'summary must prioritize the selected individual channel over the total comparison line');
  assert.equal((await page.locator('#tiles .t-v').first().innerText()).replace(/\s/g,''),'40백만원');
} finally {
  await browser.close();
}

console.log('OK: summary prioritizes an explicitly selected individual channel');
