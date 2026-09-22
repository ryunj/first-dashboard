import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../ai_question.js', import.meta.url), 'utf8');
const context = {window: {}, console, Intl, Date, setTimeout, clearTimeout};
vm.createContext(context);
vm.runInContext(source, context, {filename: 'ai_question.js'});
const ai = context.window.FP_AI_QUESTION;
const plain = value => JSON.parse(JSON.stringify(value));

const defaults = {
  metrics: ['amt', 'cust'], channels: ['*TOTAL'], segments: ['T'],
  availableChannels: ['*TOTAL', '광고'], availableBpus: ['e-영업1'], availableCategories: ['아웃도어'],
};
const remote = {
  text: '26년 8월 광고 실적', action: 'query', clarification: '',
  events: [{name: '2026년 8월', start: '2026-08-01', end: '2026-08-31', kind: 'month'}],
  preDays: 7, postDays: 7, metrics: ['amt'], appMetrics: [], dimensions: ['channel'],
  families: ['core'], allIntent: false, channels: ['광고'], segments: ['T'], bpus: [], categories: [],
  explicit: {metrics: true, channels: true, segments: false, bpus: false, categories: false, dimensions: true},
};

assert.equal(typeof ai.normalizeRemoteQuery, 'function', 'remote query validator must be exported');
const normalized = ai.normalizeRemoteQuery(remote, defaults);
assert.deepEqual(plain(normalized.channels), ['광고']);
assert.equal(normalized.events[0].start, '2026-08-01');

assert.throws(
  () => ai.normalizeRemoteQuery({...remote, channels: ['없는채널']}, defaults),
  /채널/,
);
assert.throws(
  () => ai.normalizeRemoteQuery({...remote, preDays: 91}, defaults),
  /1~90/,
);
assert.throws(
  () => ai.normalizeRemoteQuery({...remote, events: [{...remote.events[0], end: '2026-02-30'}]}, defaults),
  /날짜/,
);

const clarify = ai.normalizeRemoteQuery({...remote, action: 'clarify', clarification: '8월 전체를 의미하나요?', events: []}, defaults);
assert.equal(clarify.action, 'clarify');
assert.equal(clarify.clarification, '8월 전체를 의미하나요?');

console.log('OK: Gemini query conditions receive a second client-side validation');

