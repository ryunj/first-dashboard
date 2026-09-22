import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../ai_question.js', import.meta.url), 'utf8');
const context = {window: {}, console, Intl, Date, setTimeout, clearTimeout};
vm.createContext(context);
vm.runInContext(source, context, {filename: 'ai_question.js'});
const ai = context.window.FP_AI_QUESTION;
const plain = value => JSON.parse(JSON.stringify(value));

assert.ok(ai, 'FP_AI_QUESTION must be exported');

const basic = ai.parseQuestion(
  '24년 추석 9월 14-18, 25년 추석 10월 3-9, 전후 영향 알려줘',
  {metrics: ['amt'], channels: ['*TOTAL'], segments: ['T']},
);
assert.deepEqual(
  plain(basic.events.map(({start, end}) => [start, end])),
  [['2024-09-14', '2024-09-18'], ['2025-10-03', '2025-10-09']],
);
assert.equal(basic.preDays, 7);
assert.equal(basic.postDays, 7);
assert.deepEqual(plain(basic.metrics), ['amt']);

const custom = ai.parseQuestion(
  '2025년 연말 12월 30-31 전 3일 후 10일 첫구매 거래액 직접 당월신규',
  {metrics: ['cust'], channels: ['*TOTAL'], segments: ['T']},
);
assert.equal(custom.preDays, 3);
assert.equal(custom.postDays, 10);
assert.deepEqual(plain(custom.metrics), ['amt']);
assert.deepEqual(plain(custom.channels), ['직접']);
assert.deepEqual(plain(custom.segments), ['1']);
const periods = ai.buildPeriods(custom.events[0], custom.preDays, custom.postDays);
assert.deepEqual(plain(periods.pre), ['2025-12-27', '2025-12-28', '2025-12-29']);
assert.equal(periods.post.at(-1), '2026-01-10');

assert.throws(
  () => ai.parseQuestion('2025년 행사 2월 30-31 영향', {}),
  /날짜/,
);
assert.throws(
  () => ai.parseQuestion('추석 전후 영향 알려줘', {}),
  /연도|날짜/,
);
const dimensional = ai.parseQuestion('25년 추석 10월 3-9 채널/BPU/카테고리까지 알려줘', {});
assert.deepEqual(plain(dimensional.dimensions), ['channel', 'bpu', 'category']);
assert.deepEqual(plain(dimensional.families), ['product']);
const selectedProductFilters = ai.parseQuestion('26년 9월 아웃도어 카테고리 e-영업1 BPU 실적', {
  availableBpus: ['e-영업1', 'e-영업2'], availableCategories: ['아웃도어', '리빙'],
});
assert.deepEqual(plain(selectedProductFilters.bpus), ['e-영업1']);
assert.deepEqual(plain(selectedProductFilters.categories), ['아웃도어']);
assert.equal(selectedProductFilters.explicit.bpus, true);
assert.equal(selectedProductFilters.explicit.categories, true);

const weekly = ai.parseQuestion('24년 9월 3주차, 25년 9월3주차, 26년 9월 3주차 비교 및 인사이트', {});
assert.deepEqual(plain(weekly.events.map(({start, end}) => [start, end])), [
  ['2024-09-16', '2024-09-22'], ['2025-09-15', '2025-09-21'], ['2026-09-14', '2026-09-20'],
]);

const monthly = ai.parseQuestion('2026년 8월 앱 신규 설치와 KPI 알려줘', {});
assert.deepEqual(plain(monthly.events.map(({start, end}) => [start, end])), [['2026-08-01', '2026-08-31']]);
assert.ok(monthly.families.includes('app'));
assert.ok(monthly.families.includes('kpi'));
assert.deepEqual(plain(monthly.appMetrics), ['appNew']);

const everything = ai.parseQuestion('2026년 9월 모든 실적 보여줘', {});
assert.deepEqual(plain(everything.families), ['core', 'app', 'kpi', 'product']);
assert.throws(
  () => ai.parseQuestion(`25년 행사 10월 3-9 ${'질문'.repeat(600)}`, {}),
  /1,000자/,
);

const events = [
  {name: '행사A', start: '2024-10-01', end: '2024-10-05'},
  {name: '행사B', start: '2025-10-01', end: '2025-10-05'},
];
const dailyValue = (event, offset) => {
  const onset = event.name === '행사A' ? -11 : -9;
  return offset >= onset ? 120 : 100;
};
const action = ai.estimateAction(events, dailyValue);
assert.equal(action.onsetOffset, -10);
assert.equal(action.actionOffset, -24);
assert.equal(action.evidenceCount, 2);
assert.equal(action.actionDate, null);

const insufficient = ai.estimateAction(events.slice(0, 1), dailyValue);
assert.equal(insufficient.insufficient, true);

const overlappingChannel = ai.parseQuestion(
  '25년 브랜드광고 행사 10월 3-9 거래액 알려줘',
  {channels: ['*TOTAL'], availableChannels: ['*TOTAL', '광고', '브랜드광고']},
);
assert.deepEqual(plain(overlappingChannel.channels), ['브랜드광고']);

console.log('OK: AI question parsing, periods and 14-day action timing');
