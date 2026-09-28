import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {chromium} = require('playwright');
const root = new URL('../', import.meta.url);
let html = fs.readFileSync(new URL('dashboard.html', root), 'utf8');
const aiSource = fs.readFileSync(new URL('ai_question.js', root), 'utf8');
const marker = /<script>\r?\nwindow\.__dashMain = function \(\) \{/;
assert.ok(marker.test(html), 'dashboard main marker changed');

const dataScript = String.raw`<script>
(() => {
  const dates=[], start=Date.UTC(2024,7,1), end=Date.UTC(2025,10,1), day=864e5;
  for(let t=start;t<=end;t+=day) dates.push(new Date(t).toISOString().slice(0,10));
  const valueFor=d=>{
    const ranges=[['2024-09-04','2024-09-18'],['2025-09-23','2025-10-09']];
    return ranges.some(([a,b])=>d>=a&&d<=b)?150000000:100000000;
  };
  const amt=dates.map(valueFor), cust=amt.map(v=>v/100000), tr=dates.map(()=>10000), sg=dates.map(()=>1000), fpn=dates.map(()=>300), crn=dates.map(()=>100);
  window.DASH_EMBED='test';
  window.DASH_PROD=null; window.DASH_KPI=null;
  window.DASH_DATA={meta:{built:'test',sources:['test'],lastDate:dates.at(-1),channels:['*TOTAL','직접']},daily:{p:dates,s:{
    'amt|T|*TOTAL':amt,'cust|T|*TOTAL':cust,'amt|T|직접':amt,'cust|T|직접':cust,
    'amt|1|*TOTAL':amt,'cust|1|*TOTAL':cust,'amt|1|직접':amt,'cust|1|직접':cust,
    'tr|*TOTAL':tr,'sg|*TOTAL':sg,'fpn|*TOTAL':fpn,'crn|*TOTAL':crn,
    'tr|직접':tr,'sg|직접':sg,'fpn|직접':fpn,'crn|직접':crn
  }},weekly:{p:[],s:{}}};
})();
</script>
<script>${aiSource}</script>
`;
html = html.replace(marker, match => dataScript + match);

const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find(p => p && fs.existsSync(p));

const browser = await chromium.launch({headless: true, ...(executablePath ? {executablePath} : {})});
const page = await browser.newPage({viewport: {width: 1280, height: 900}});
const errors=[]; const requests=[];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => requests.push(request.url()));
await page.setContent(html, {waitUntil: 'networkidle'});
await page.waitForFunction(() => window.__dash && window.FP_AI_QUESTION);

assert.equal(errors.length, 0, `page errors: ${errors.join(' | ')}`);
assert.equal(await page.locator('#insightSec + #aiQuestionSec').count(), 1, 'AI section must follow insights');
assert.equal(await page.locator('#aiQuestionSec + #memoSec').count(), 1, 'AI section must precede memos');
assert.equal(await page.locator('#aiQuestionBox').getAttribute('open'), null, 'AI panel must start collapsed');
assert.match(await page.locator('#aiQuestionStatus').innerText(), /기존 질문 해석/, 'static page must show local parser status');

await page.locator('#aiQuestionBox summary').click();
assert.equal(await page.locator('#aiQuestionInput').getAttribute('placeholder'), null, 'question input must not show an example prompt');
assert.equal(await page.locator('#aiQuestionExample').count(), 0, 'example question button must be removed');

const beforeState = await page.evaluate(() => JSON.stringify(window.__dash.state));
const beforeRequests = requests.length;
await page.locator('#aiQuestionInput').fill('24년 추석 9월 14-18, 25년 추석 10월 3-9, 첫구매 거래액 전후 영향 알려줘');
await page.locator('#aiQuestionSend').click();
await page.waitForSelector('.aiq-answer');
const answer = await page.locator('.aiq-answer').last().innerText();
assert.match(answer, /권장 액션 시작/);
assert.match(answer, /14일 전/);
assert.match(answer, /과거 관찰 변화 범위/);
assert.equal(requests.length, beforeRequests, 'submitting a question must not make a network request');
assert.equal(await page.evaluate(() => JSON.stringify(window.__dash.state)), beforeState, 'question must not mutate dashboard state');
assert.equal(await page.locator('.aiq-insight').last().count(), 1, 'answer must lead with an insight');
assert.equal(await page.locator('details.aiq-evidence').last().getAttribute('open'), null, 'evidence must start collapsed');
await page.locator('details.aiq-evidence').last().locator('summary').click();
const evidence = await page.locator('details.aiq-evidence').last().innerText();
assert.match(evidence, /2024-09-14/);
assert.match(evidence, /2025-10-09/);
assert.match(evidence, /전 7일/);
assert.match(evidence, /행사 중/);
await page.locator('[data-ai-save]').last().click();
assert.match(await page.locator('#aiSavedToggle').innerText(), /1/, 'saved insight count must update');
const backupPayload = await page.evaluate(() => window.FP_BACKUP.makePayload());
assert.equal(backupPayload.insights.length, 1, 'manual backup payload must include explicitly saved insights');

await page.evaluate(() => {
  const base = window.FP_AI_INSIGHTS.all()[0];
  for (let index = 0; index < 6; index++) window.FP_AI_INSIGHTS.add({...base, id:`page-${index}`, created:new Date(Date.now()+index).toISOString(), question:`저장 질문 ${index}`});
  window.FP_AI_QUESTION.renderSaved();
});
await page.locator('#aiSavedToggle').click();
assert.equal(await page.locator('#aiSavedList > details').count(), 5, 'saved insights must paginate by five');
assert.ok(await page.locator('#aiSavedPages [data-ai-page="2"]').count(), 'second page button must be shown');

const parity = await page.evaluate(() => {
  const dates=[]; for(let d=14;d<=18;d++) dates.push(`2024-09-${String(d).padStart(2,'0')}`);
  return window.__dash.compute('amt',{ch:'*TOTAL',seg:'T'},dates,null,'avg').v;
});
assert.match(evidence, new RegExp((parity / 1e6).toLocaleString('ko-KR')));

await page.locator('#aiQuestionInput').fill('추석 영향 알려줘');
await page.locator('#aiQuestionSend').click();
assert.match(await page.locator('.aiq-error').last().innerText(), /연도|날짜/);

await page.locator('#aiQuestionInput').fill('20년 행사 1월 1-3 영향 알려줘');
await page.locator('#aiQuestionSend').click();
assert.match(await page.locator('.aiq-error').last().innerText(), /사용 가능한 데이터.*2024-08-01.*2025-11-01/);

await page.setViewportSize({width: 390, height: 844});
assert.ok((await page.locator('#aiQuestionSec').boundingBox()).width <= 390, 'AI panel must fit mobile viewport');

await browser.close();
console.log('OK: collapsed AI panel, official calculation parity, errors and no network calls');
