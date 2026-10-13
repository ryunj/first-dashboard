import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../export.js', import.meta.url), 'utf8');
const dashboard = fs.readFileSync(new URL('../dashboard.html', import.meta.url), 'utf8');
const context = {window: {}, console, Date, Blob, TextEncoder, Uint8Array, Uint32Array, DataView, ArrayBuffer, Map, Set, isFinite};
vm.createContext(context);
vm.runInContext(source, context, {filename: 'export.js'});

const dash = {
  state: {year: 2026, grain: 'week', cmp: 'yoy', cmpY: 2, layout: 'block'},
  lastCols: [{label: '9월 4주', sub: '9/21~', tip: '2026년 9월 4주', cur: ['2026-09-21']}],
  focusIdx: () => 0, modeName: () => '주 합계', cmpLbl: () => '2024년비', otherLbl: () => '전주비', baseShort: () => '2024년',
  selChans: () => ['*TOTAL'], chLabel: () => '전체', selSegs: () => ['T'], segLabel: () => '전체',
  prodFiltOn: () => false, dataMeta: {lastDate: '2026-09-27'}, METRICS: ['amt'], MET: {amt: {name: '첫구매 거래액', unit: '백만원'}},
  unitOf: () => '백만원', trNote: () => '', fmtDelta: x => x, MODEL: {amt: [{label: '전체', ch: '*TOTAL', seg: 'T', vals: [{c: 10, p: 8, d: {t: '+25%', c: 'pos'}}]}]},
  periodComparisons: () => ({week: ['2026-09-14'], month: ['2026-08-21']}),
  compute: (_m, _row, dates) => ({v: dates[0] === '2026-09-14' ? 5 : 4}),
  delta: (_m, c, p) => ({t: `${Math.round((c / p - 1) * 100)}%`, c: c >= p ? 'pos' : 'neg'}),
};

assert.equal(typeof context.window.FP_EXPORT.build, 'function', 'export model builder must be available for regression checks');
const sheet = context.window.FP_EXPORT.build('table', dash);
const labels = sheet.rows.flatMap(row => (row || []).map(cell => cell && cell.v)).filter(Boolean);
assert.ok(labels.includes('2024 동기간'), 'selected comparison year must label the raw comparison band');
assert.ok(!labels.includes('2025 동기간'), 'hard-coded previous-year label must not remain');
assert.ok(dashboard.includes("`${y - yk()} 동기간`"), 'on-screen three-band table must use the selected comparison-year helper');
assert.equal(sheet.rows.flatMap(row => row || []).some(cell => cell && cell.v === 8 / 1e6), true, 'comparison values must remain unchanged');
assert.ok(labels.includes('전주비'), 'performance export must always include week-over-week comparison');
assert.ok(labels.includes('전월비'), 'performance export must always include month-over-month comparison');

dash.state.layout = 'stack';
const stacked = context.window.FP_EXPORT.build('table', dash);
const stackedLabels = stacked.rows.flatMap(row => (row || []).map(cell => cell && cell.v)).filter(v => v !== undefined && v !== '');
assert.ok(stackedLabels.includes('기준'), 'three-row comparison export must include a basis column');
assert.ok(stackedLabels.includes(2026), 'three-row comparison export must include the current-year row');
assert.ok(stackedLabels.includes(2024), 'three-row comparison export must include the selected comparison-year row');
assert.ok(stackedLabels.includes('2024년비'), 'three-row comparison export must include the comparison-rate row');
assert.ok(!stackedLabels.includes('2026 실적'), 'three-row comparison export must not use the horizontal Excel-style current band');
assert.ok(!stackedLabels.includes('2024 동기간'), 'three-row comparison export must not use the horizontal Excel-style comparison band');
assert.equal(stacked.rows.flatMap(row => row || []).some(cell => cell && cell.v === 8 / 1e6), true, 'three-row comparison export must retain comparison values');
assert.ok(stackedLabels.includes('전주비'), 'stacked performance export must include week-over-week comparison');
assert.ok(stackedLabels.includes('전월비'), 'stacked performance export must include month-over-month comparison');

console.log('OK: Excel export follows the selected table layout and comparison year');
