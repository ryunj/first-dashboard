import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../export.js', import.meta.url), 'utf8');
const dashboard = fs.readFileSync(new URL('../dashboard.html', import.meta.url), 'utf8');
const context = {window: {}, console, Date, Blob, TextEncoder, Uint8Array, Uint32Array, DataView, ArrayBuffer, Map, Set, isFinite};
vm.createContext(context);
vm.runInContext(source, context, {filename: 'export.js'});

const dash = {
  state: {year: 2026, grain: 'week', cmp: 'yoy', cmpY: 2},
  lastCols: [{label: '9월 4주', sub: '9/21~', tip: '2026년 9월 4주'}],
  focusIdx: () => 0, modeName: () => '주 합계', cmpLbl: () => '2024년비', otherLbl: () => '전주비', baseShort: () => '2024년',
  selChans: () => ['*TOTAL'], chLabel: () => '전체', selSegs: () => ['T'], segLabel: () => '전체',
  prodFiltOn: () => false, dataMeta: {lastDate: '2026-09-27'}, METRICS: ['amt'], MET: {amt: {name: '첫구매 거래액', unit: '백만원'}},
  unitOf: () => '백만원', trNote: () => '', fmtDelta: x => x, MODEL: {amt: [{label: '전체', ch: '*TOTAL', seg: 'T', vals: [{c: 10, p: 8, d: {t: '+25%', c: 'pos'}}]}]},
};

assert.equal(typeof context.window.FP_EXPORT.build, 'function', 'export model builder must be available for regression checks');
const sheet = context.window.FP_EXPORT.build('table', dash);
const labels = sheet.rows.flatMap(row => (row || []).map(cell => cell && cell.v)).filter(Boolean);
assert.ok(labels.includes('2024 동기간'), 'selected comparison year must label the raw comparison band');
assert.ok(!labels.includes('2025 동기간'), 'hard-coded previous-year label must not remain');
assert.ok(dashboard.includes("`${y - yk()} 동기간`"), 'on-screen three-band table must use the selected comparison-year helper');
assert.equal(sheet.rows.flatMap(row => row || []).some(cell => cell && cell.v === 8 / 1e6), true, 'comparison values must remain unchanged');

console.log('OK: Excel table labels the selected 2024 comparison year');
