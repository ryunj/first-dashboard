import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import {createRequire} from 'node:module';

const backupPath = process.env.AI_REAL_BACKUP;
if (!backupPath) {
  console.log('SKIP: set AI_REAL_BACKUP to run the real backup validation');
  process.exit(0);
}
const require = createRequire(import.meta.url);
const {chromium} = require('playwright');
const backup = JSON.parse(zlib.gunzipSync(fs.readFileSync(backupPath)));
assert.equal(backup.format, 'fp-dashboard-backup');
assert.match(backup.data.meta.lastDate, /^\d{4}-\d{2}-\d{2}$/);

const root = new URL('../', import.meta.url);
let html = fs.readFileSync(new URL('dashboard.html', root), 'utf8');
const aiSource = fs.readFileSync(new URL('ai_question.js', root), 'utf8');
const marker = /<script>\r?\nwindow\.__dashMain = function \(\) \{/;
const safeData = JSON.stringify(backup.data).replace(/<\//g, '<\\/');
const safeKpi = JSON.stringify(backup.kpi).replace(/<\//g, '<\\/');
const safeProd = JSON.stringify(backup.prod).replace(/<\//g, '<\\/');
const inject = `<script>window.DASH_EMBED='test';window.DASH_DATA=${safeData};window.DASH_KPI=${safeKpi};window.DASH_PROD=${safeProd};</script><script>${aiSource}</script>`;
html = html.replace(marker, match => inject + match);

const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find(p => p && fs.existsSync(p));
const browser = await chromium.launch({headless: true, ...(executablePath ? {executablePath} : {})});
const page = await browser.newPage({viewport: {width: 1280, height: 900}});
const errors=[]; page.on('pageerror', error => errors.push(error.message));
await page.setContent(html, {waitUntil: 'networkidle', timeout: 60000});
await page.waitForFunction(() => window.__dash && document.querySelector('#aiQuestionSec:not([hidden])'), null, {timeout: 30000});
assert.equal(errors.length, 0, `page errors: ${errors.join(' | ')}`);

const question = '24년 추석 9월 14-18, 25년 추석 10월 3-9, 첫구매 거래액 전후 영향 알려줘';
await page.locator('#aiQuestionBox summary').click();
await page.locator('#aiQuestionInput').fill(question);
await page.locator('#aiQuestionSend').click();
const answer = await page.locator('.aiq-answer').last().innerText();
assert.match(answer, /2024-09-14/);
assert.match(answer, /2025-10-09/);
assert.doesNotMatch(answer, /대시보드 계산 기능을 불러오지 못했습니다/);

const dates = backup.data.daily.p;
const values = backup.data.daily.s['amt|T|*TOTAL'];
const alternate = backup.data.daily.s['nma|*TOTAL'];
const index = new Map(dates.map((date, i) => [date, i]));
const firstOfficialIndex = values.findIndex(Number.isFinite);
const firstOfficialDate = firstOfficialIndex < 0 ? '9999-12-31' : dates[firstOfficialIndex];
const eventDates = ['2024-09-14','2024-09-15','2024-09-16','2024-09-17','2024-09-18'];
const available = eventDates.map(date => {
  const i = index.get(date);
  const official = values[i];
  return official == null && date < firstOfficialDate && alternate ? alternate[i] : official;
}).filter(Number.isFinite);
assert.ok(available.length >= 3, 'real backup must cover at least half of the event');
const independentAverage = available.reduce((sum, value) => sum + value, 0) / available.length;
const dashboardAverage = await page.evaluate(eventDates => window.__dash.compute('amt', {ch:'*TOTAL',seg:'T'}, eventDates, null, 'avg').v, eventDates);
assert.ok(Math.abs(dashboardAverage - independentAverage) < 0.001, 'dashboard average must match independent raw calculation');
const formatted = await page.evaluate(value => window.__dash.fmt('amt', value), dashboardAverage);
assert.ok(answer.includes(formatted), `answer must show independently verified value ${formatted}`);

await page.locator('#aiQuestionInput').fill('24년 9월 3주차, 25년 9월3주차, 26년 9월 3주차 비교 및 인사이트');
await page.locator('#aiQuestionSend').click();
const weekAnswer = await page.locator('.aiq-answer').last().innerText();
assert.match(weekAnswer, /2024-09-16~2024-09-22/);
assert.match(weekAnswer, /2025-09-15~2025-09-21/);
assert.match(weekAnswer, /2026-09-14~2026-09-20/);

const stateBeforeAll = await page.evaluate(() => JSON.stringify(window.__dash.state));
await page.locator('#aiQuestionInput').fill('2026년 9월 모든 실적 채널별 BPU별 카테고리별 보여줘');
await page.locator('#aiQuestionSend').click();
const allAnswer = await page.locator('.aiq-answer').last().innerText();
assert.match(allAnswer, /앱·푸시·회원 실적/);
assert.match(allAnswer, /KPI/);
assert.match(allAnswer, /상품 실적/);
assert.match(allAnswer, /채널별 상위 실적/);
assert.match(allAnswer, /BPU별 상위 실적/);
assert.match(allAnswer, /카테고리별 상위 실적/);
assert.doesNotMatch(allAnswer, /지원하지 않는 조건/);
assert.equal(await page.evaluate(() => JSON.stringify(window.__dash.state)), stateBeforeAll, 'all-results question must not mutate dashboard state');

const labelCheck = await page.evaluate(() => {
  const q = window.__dash.queryProducts({dates:['2026-09-21'],dimensions:['category']});
  const outdoor = q.groups.category.all.find(row => row.name === '아웃도어');
  if (!outdoor) return {found:false};
  window.__dash.prodState.cats = [outdoor.key];
  window.__dash.prodState.catNone = false;
  window.__dash.render();
  const groups = [...document.querySelectorAll('#tblWrap tr.grp')].map(row => row.innerText.replace(/\s+/g, ' '));
  return {found:true, amount:groups.find(x => x.startsWith('첫구매 거래액')), traffic:groups.find(x => x.startsWith('비회원 트래픽'))};
});
assert.equal(labelCheck.found, true, 'real backup must include 아웃도어 category');
assert.match(labelCheck.amount, /카테고리 아웃도어/);
assert.match(labelCheck.traffic, /카테고리 아웃도어 필터 미적용/);
assert.equal(errors.length, 0, `page errors after all queries: ${errors.join(' | ')}`);

await browser.close();
console.log(`OK: real backup ${backup.data.meta.lastDate}, weekly periods, all metric families, category labels and official parity`);
