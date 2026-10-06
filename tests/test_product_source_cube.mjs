import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../merge.js', import.meta.url), 'utf8');
const context = {window: {}, TextDecoder, console, Date, Uint8Array, ArrayBuffer, Map, Set};
vm.createContext(context);
vm.runInContext(source, context, {filename: 'merge.js'});
const api = context.window.FP_MERGE;

const dailyRows = [
  ['지표', '회원구분', '채널', 'BPU', '상품군', '2026'],
  ['', '', '', '', '', '9/29'],
  ['일평균거래액', '*TOTAL', '*TOTAL', '*TOTAL', '*TOTAL', '1000'],
  ['일평균거래액', '3_기존', '*TOTAL', '*TOTAL', '*TOTAL', '100'],
  ['일평균거래액', '1_당월신규', '광고', 'e-영업1', '여성', '8934746'],
  ['일평균고객수', '1_당월신규', '광고', 'e-영업1', '여성', '48'],
];
const daily = api.readCoverage(dailyRows, '상품관점 - 일자별 실적(기본).csv');
assert.deepEqual(
  Array.from(daily.sourceDaily.get('2026-09-29|1_당월신규|광고|e-영업1|여성')),
  [8934746, 48],
  'browser parser must keep member × channel × BPU × product group',
);

const sourceDaily = new Map([
  ['2026-09-29|1_당월신규|광고|e-영업1|여성', [900, 9]],
]);
const sourceWeekly = new Map([
  ['2026-10-1|1_당월신규|광고|e-영업1|여성', [700, 7]],
]);
const expanded = api.expandProductSource(sourceDaily, sourceWeekly, '2026-09-29');
assert.deepEqual(Array.from(expanded.get('2026-09-28|1_당월신규|광고|e-영업1|여성')), [700, 7]);
assert.deepEqual(Array.from(expanded.get('2026-09-29|1_당월신규|광고|e-영업1|여성')), [900, 9]);
assert.equal(expanded.has('2026-09-30|1_당월신규|광고|e-영업1|여성'), false);

console.log('OK: browser product-view cube keeps dimensions and daily-over-weekly precedence');
