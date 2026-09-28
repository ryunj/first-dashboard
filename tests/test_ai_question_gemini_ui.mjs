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
    const insight={headline:'8월 거래액 흐름을 확인했습니다.',summary:'전년 동기간과 비교한 결과입니다.',findings:['첫구매 거래액 근거를 확인했습니다.'],action:'상승 예상 시점 2주 전부터 준비하세요.',caveat:'원인을 단정하지 않습니다.'};
    setTimeout(()=>window.FP_AI_QUESTION.receiveRemote(request.type==='gemini_insight'?{id:request.id,ok:true,insight}:{id:request.id,ok:true,query}),10);
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
await page.waitForFunction(() => document.querySelector('.aiq-answer')?.textContent.includes('Gemini AI 인사이트'));
const answer = await page.locator('.aiq-answer').last().innerText();
assert.match(answer, /첫구매 거래액/);
const requests = await page.evaluate(() => window.__geminiRequests);
assert.deepEqual(requests.map(request => request.type), ['gemini_query','gemini_insight']);
assert.equal(requests[0].context.dataFirst, '2025-01-01');
assert.ok(!JSON.stringify(requests).includes('100000000'), 'raw performance values must not leave the browser');
assert.ok(!('data' in requests[0].context), 'raw dashboard data must not be in Gemini context');
assert.ok(Array.isArray(requests[1].evidence.sections), 'Gemini insight request must contain bounded aggregate evidence');
assert.equal(await page.locator('details.aiq-evidence').last().getAttribute('open'), null, 'evidence must start collapsed');
await page.locator('details.aiq-evidence').last().locator('summary').click();
assert.match(await page.locator('details.aiq-evidence').last().innerText(), /2025-08-01/);

await page.evaluate(() => {
  window.FP_GEMINI_BRIDGE.request = request => setTimeout(() => window.FP_AI_QUESTION.receiveRemote({id:request.id,ok:false,message:'Gemini 연결 실패 · 기존 질문 해석 사용'}), 10);
});
await page.locator('#aiQuestionInput').fill('25년 8월 첫구매 거래액 알려줘');
await page.locator('#aiQuestionSend').click();
await page.waitForFunction(() => [...document.querySelectorAll('.aiq-answer')].at(-1)?.textContent.includes('기존 질문 해석'));
await page.locator('details.aiq-evidence').last().locator('summary').click();
assert.match(await page.locator('details.aiq-evidence').last().innerText(), /2025-08-01/);

await browser.close();
console.log('OK: Gemini bridge, official browser calculation and local fallback');
