import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {chromium} = require('playwright');

const root = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch({headless: true, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
const page = await browser.newPage({viewport: {width: 1508, height: 360}});

try {
  await page.goto(pathToFileURL(path.join(root, 'dashboard.html')).href, {waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => document.querySelector('#asof')?.textContent?.startsWith('데이터 ~'));
  const summary = await page.locator('#asof').textContent();
  assert.ok(summary.includes('최근 업로드:1006'), 'header should show the latest dated upload source');
  assert.ok(!summary.includes('raw '), 'header should not print the full source history');
  await page.locator('#asof').evaluate(el => {
    el.textContent = '데이터 ~2026-10-06 · raw 9월2주차, 2026년/0914, 2026년/0915, 2026년/0916, 2026년/0917, 업로드:0920, 업로드:업로드, 업로드:0921, 업로드:0930, 업로드:1001, 업로드:1005, 업로드:1006';
  });

  const box = async selector => page.locator(selector).boundingBox();
  const [brand, menu, tools] = await Promise.all([box('.brand'), box('.menu'), box('.bk-tools')]);
  assert.ok(brand && menu && tools, 'header controls must be visible');
  assert.ok(Math.abs((tools.y + tools.height / 2) - (menu.y + menu.height / 2)) < 4, 'backup controls must remain on the same top row as the mode controls');
  assert.ok(tools.x > menu.x, 'backup controls must remain to the right of the mode controls');
  assert.ok(tools.x + tools.width > 1400, 'backup controls must stay aligned to the right edge');

  await page.locator('button[data-set="grain"][data-v="week"]').click();
  await page.waitForFunction(() => document.querySelector('#selAt')?.options[0]?.textContent?.includes('주차'));
  await page.locator('#selAt').selectOption({index: 2});
  await page.locator('#filtSum').evaluate(el => {
    el.textContent = '회원구분 전체 · 채널 전체 · BPU 전체 · 상품군 전체 · 조직 카테고리 전체';
  });
  const [periodBar, filter] = await Promise.all([page.locator('header .bar2').first().boundingBox(), box('#btnFilt')]);
  assert.ok(periodBar && filter, 'period controls and filter summary must be visible');
  assert.ok(filter.y < periodBar.y + 40, 'filter summary must stay on the first controls row for a prior week');
} finally {
  await browser.close();
}

console.log('OK: long 1006 provenance text keeps backup controls at the top right');
