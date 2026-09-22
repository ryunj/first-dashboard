import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {chromium} = require('playwright');
const root = new URL('../', import.meta.url);
let html = fs.readFileSync(new URL('dashboard.html', root), 'utf8');
const aiSource = fs.readFileSync(new URL('ai_question.js', root), 'utf8');
const marker = /<script>\r?\nwindow\.__dashMain = function \(\) \{/;

const dataScript = String.raw`<script>
(() => {
  const dates=[], start=Date.UTC(2025,0,1), end=Date.UTC(2026,8,21), day=864e5;
  for(let t=start;t<=end;t+=day) dates.push(new Date(t).toISOString().slice(0,10));
  const amt=dates.map(()=>100000000), cust=dates.map(()=>1000), tr=dates.map(()=>10000), sg=dates.map(()=>1000), fpn=dates.map(()=>300), crn=dates.map(()=>100);
  window.DASH_EMBED='test'; window.DASH_PROD=null; window.DASH_KPI=null;
  window.DASH_DATA={meta:{built:'test',sources:['test'],lastDate:dates.at(-1),channels:['*TOTAL','광고']},daily:{p:dates,s:{
    'amt|T|*TOTAL':amt,'cust|T|*TOTAL':cust,'amt|T|광고':amt,'cust|T|광고':cust,
    'tr|*TOTAL':tr,'sg|*TOTAL':sg,'fpn|*TOTAL':fpn,'crn|*TOTAL':crn,
    'tr|광고':tr,'sg|광고':sg,'fpn|광고':fpn,'crn|광고':crn
  }},weekly:{p:[],s:{}}};
  window.__geminiRequests=[];
  window.FP_GEMINI_BRIDGE={ready:true,request(request){
    window.__geminiRequests.push(request);
    const query={text:request.question,action:'query',clarification:'',events:[{name:'작년 8월',start:'2025-08-01',end:'2025-08-31',kind:'month'}],preDays:7,postDays:7,metrics:['amt'],appMetrics:[],dimensions:[],families:['core'],allIntent:false,channels:['*TOTAL'],segments:['T'],bpus:[],categories:[],explicit:{metrics:true,channels:false,segments:false,bpus:false,categories:false,dimensions:false}};
    setTimeout(()=>window.FP_AI_QUESTION.receiveRemote({id:request.id,ok:true,query}),10);
  }};
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
const browser = await chromium.launch({headless:true, ...(executablePath ? {executablePath} : {})});
const page = await browser.newPage({viewport:{width:1280,height:900}});
await page.setContent(html, {waitUntil:'networkidle'});
await page.waitForFunction(() => window.__dash && window.FP_AI_QUESTION);

await page.locator('#aiQuestionBox summary').click();
await page.locator('#aiQuestionInput').fill('작년 8월 광고 성과가 어땠어?');
await page.locator('#aiQuestionSend').click();
await page.waitForFunction(() => document.querySelector('.aiq-answer')?.textContent.includes('해석한 조건'));
const answer = await page.locator('.aiq-answer').last().innerText();
assert.match(answer, /2025-08-01/);
assert.match(answer, /첫구매 거래액/);
const request = await page.evaluate(() => window.__geminiRequests[0]);
assert.equal(request.type, 'gemini_query');
assert.equal(request.context.dataFirst, '2025-01-01');
assert.ok(!JSON.stringify(request).includes('100000000'), 'raw performance values must not leave the browser');
assert.ok(!('data' in request.context), 'raw dashboard data must not be in Gemini context');

await page.evaluate(() => {
  window.FP_GEMINI_BRIDGE.request = request => setTimeout(() => window.FP_AI_QUESTION.receiveRemote({id:request.id,ok:false,message:'Gemini 연결 실패 · 기존 질문 해석 사용'}), 10);
});
await page.locator('#aiQuestionInput').fill('25년 8월 첫구매 거래액 알려줘');
await page.locator('#aiQuestionSend').click();
await page.waitForFunction(() => [...document.querySelectorAll('.aiq-answer')].at(-1)?.textContent.includes('기존 질문 해석'));
assert.match(await page.locator('.aiq-answer').last().innerText(), /2025-08-01/);

await browser.close();
console.log('OK: Gemini bridge, official browser calculation and local fallback');

