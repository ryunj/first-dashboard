import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const mergeSource = fs.readFileSync(new URL('merge.js', root), 'utf8');
const mergeContext = {window: {}, TextDecoder, console, Date, Uint8Array, ArrayBuffer, Map, Set};
vm.createContext(mergeContext);
vm.runInContext(mergeSource, mergeContext);

const header = ['결제_일자(YYYYMMDD)', 'BPU', 'AF대분류명', '대카테고리명', 'ADMIN브랜드명', '상품코드', '상품명', '당월신규여부', '당년신규여부', '거래액', '주문고객수'];
const rows = [
  ['20260929', 'e-영업1', '광고', '가방', '브랜드', 'P1', '상품1', 'Y', 'Y', '100', '1'],
  ['20260929', 'e-영업1', '광고', '가방', '브랜드', 'P2', '상품2', 'N', 'Y', '200', '2'],
  ['20260929', 'e-영업1', '광고', '가방', '브랜드', 'P3', '상품3', 'N', 'N', '300', '3'],
];
const parsed = mergeContext.window.FP_MERGE.productRows(header, rows);
assert.deepEqual(Array.from(parsed, row => row[9]), [1, 2, 3], 'browser upload parser must preserve the three member segments');
const uploadText = [header, ...rows].map(row => row.join('\t')).join('\n');
const uploadBytes = Buffer.from(uploadText, 'utf8');
const uploaded = await mergeContext.window.FP_MERGE.merge({}, [{
  name: '조직 카테고리별 첫구매 실적.csv', lastModified: 1,
  arrayBuffer: async () => uploadBytes.buffer.slice(uploadBytes.byteOffset, uploadBytes.byteOffset + uploadBytes.byteLength),
}]);
assert.equal(uploaded.prod.meta.factFields, 7, 'browser merge must write the member-aware product format');
const uploadedSegments = [];
for (let i = 0; i < uploaded.prod.f.length; i += uploaded.prod.meta.factFields) uploadedSegments.push(uploaded.prod.f[i + 4]);
assert.deepEqual(uploadedSegments.sort(), [1, 2, 3], 'browser merge must retain each uploaded member segment');

const require = createRequire(import.meta.url);
const {chromium} = require('playwright');
let html = fs.readFileSync(new URL('dashboard.html', root), 'utf8');
const ai = fs.readFileSync(new URL('ai_question.js', root), 'utf8');
const data = {
  meta: {built: 'test', sources: ['test'], lastDate: '2026-09-29', channels: ['*TOTAL', '광고']},
  daily: {p: ['2026-09-29', '2026-09-30'], s: {
    'amt|T|*TOTAL': [9999, 8888], 'cust|T|*TOTAL': [99, 88],
    'amt|1|*TOTAL': [999, 888], 'cust|1|*TOTAL': [9, 8],
    'amt|2|*TOTAL': [999, 888], 'cust|2|*TOTAL': [9, 8],
    'amt|3|*TOTAL': [999, 888], 'cust|3|*TOTAL': [9, 8],
  }},
  weekly: {p: [
    {y: 2024, w: 1, m: 1, n: 1, start: '2024-01-01', d: 7},
    {y: 2025, w: 1, m: 1, n: 1, start: '2024-12-30', d: 7},
  ], s: {'tr|*TOTAL': [700, 800]}},
};
const prod = {
  meta: {built: 'test', start: '2026-09-29', days: 2, lastDate: '2026-09-30', rows: 5, products: 5,
    topN: null, factFields: 7, covFields: 6, covFields2: 7, covFields3: 6, covFields4: 7, positiveOnly: true},
  ch: ['광고'], bpu: ['e-영업1'], cat: ['가방', '슈즈'], brand: ['브랜드'], grp: ['여성의류', '남성의류'], paths: [0, 0, 0, 0, 1, 0],
  prods: ['P1', '상품1', 'P2', '상품2', 'P3', '상품3', 'P4', '상품4', 'P5', '상품5'],
  f: [0, 0, 0, 0, 1, 100, 1, 0, 0, 0, 1, 2, 200, 2, 0, 0, 0, 2, 3, 300, 3, 0, 0, 1, 3, 3, 400, 4, 0, 0, 1, 4, 1, 50, 1], cov: [], cov2: [], cov3: [],
  cov4: [0, 0, -1, -1, -1, 1050, 11,
    0, 1, -1, -1, -1, 150, 2, 0, 1, -1, 0, 0, 100, 1, 0, 1, -1, 0, 1, 50, 1,
    0, 2, -1, -1, -1, 200, 2, 0, 3, -1, -1, -1, 700, 7,
    1, 0, -1, -1, -1, 900, 9, 0, 1, -1, -1, -1, 80, 1, 0, 1, -1, 0, 1, 80, 1],
};
const marker = /<script>\r?\nwindow\.__dashMain = function \(\) \{/;
const inject = `<script>window.DASH_EMBED='test';window.DASH_DATA=${JSON.stringify(data)};window.DASH_KPI=null;window.DASH_PROD=${JSON.stringify(prod)};</script><script>${ai}</script>`;
html = html.replace(marker, match => inject + match);

const executablePath = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(path => fs.existsSync(path));
const browser = await chromium.launch({headless: true, ...(executablePath ? {executablePath} : {})});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.setContent(html, {waitUntil: 'networkidle', timeout: 60000});
await page.waitForFunction(() => window.__dash && window.__dash.prodReady());

const values = await page.evaluate(() => {
  const dash = window.__dash;
  const read = segs => {
    dash.state.segs = segs;
    dash.state.grain = 'day';
    dash.state.year = 2026;
    dash.state.at.day = '2026-09-29';
    dash.render();
    const query = dash.queryProducts({dates: ['2026-09-29'], segments: segs});
    return {section: dash.prodView().totalRow.a, query: query.total.a};
  };
  return {all: read(['T']), month: read(['1']), prior: read(['2']), existing: read(['3'])};
});

assert.deepEqual(values, {
  all: {section: 1050, query: 1050},
  month: {section: 150, query: 150},
  prior: {section: 200, query: 200},
  existing: {section: 700, query: 700},
}, 'headline first-purchase metrics must use the product-view source instead of the mismatched legacy daily series');

const clicked = await page.evaluate(() => {
  const dash = window.__dash;
  dash.state.segs = ['T'];
  dash.prodState.grps = [];
  dash.render();
  document.querySelector('[data-seg="1"]').click();
  document.querySelector('[data-pgrp="0"]').click();
  document.querySelector('[data-pcatopen]').click();
  document.querySelector('[data-pcat="0"]').click();
  dash.state.at.day = '2026-09-29';
  dash.render();
  return {
    segments: dash.selSegs(),
    productGroups: dash.prodState.grps.slice(),
    categories: dash.prodState.cats.slice(),
    section: dash.prodView().totalRow.a,
    top: dash.MODEL.amt.map(row => ({label: row.label, value: row.vals.at(-1).c})),
    compareYears: Array.from(document.querySelector('#selCmpY').options, o => o.textContent),
    compareDisabled: document.querySelector('#selCmpY').disabled,
    groupAllPressed: document.querySelector('[data-pgrp="-1"]').getAttribute('aria-pressed'),
    pressedGroups: Array.from(document.querySelectorAll('[data-pgrp]:not([data-pgrp="-1"])[aria-pressed="true"]'), b => b.textContent.trim()),
    zeroSaleDay: dash.compute('amt', {ch: '*TOTAL', seg: '1', grp: 0}, ['2026-09-30']).v,
  };
});
assert.deepEqual(clicked, {
  segments: ['1'],
  productGroups: [0],
  categories: [0],
  section: 100,
  top: [{label: '전체 · 여성의류 · 당월신규', value: 100}],
  compareYears: ['전년 (2025)', '2024년'],
  compareDisabled: false,
  groupAllPressed: 'false',
  pressedGroups: ['여성의류'],
  zeroSaleDay: 0,
}, 'member and product-group filters must intersect in the headline source, organization categories must filter the lower detail, and 2024 must remain selectable');
assert.equal(errors.length, 0, `page errors: ${errors.join(' | ')}`);
await browser.close();
console.log('OK: product parser and product section follow the selected member segment');
