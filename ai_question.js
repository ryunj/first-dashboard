(function (root) {
'use strict';

const DAY = 864e5;
const ALL_METRICS = ['amt', 'cust', 'aov', 'tr', 'sg', 'jr', 'cr', 'fpr'];
const METRIC_ALIASES = [
  ['당일가입 CR', 'cr'], ['당일가입CR', 'cr'], ['첫구매 거래액', 'amt'], ['첫구매 고객수', 'cust'],
  ['비회원 트래픽', 'tr'], ['첫구매 객단가', 'aov'], ['첫구매율', 'fpr'], ['가입자수', 'sg'],
  ['가입률', 'jr'], ['거래액', 'amt'], ['고객수', 'cust'], ['객단가', 'aov'], ['트래픽', 'tr'],
];
const SEGMENT_ALIASES = [
  ['당월신규', '1'], ['기가입신규', '2'], ['기존회원', '3'], ['기존', '3'], ['회원전체', 'T'],
];

const pad = n => String(n).padStart(2, '0');
const toTime = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const ymd = t => new Date(t).toISOString().slice(0, 10);
const addDays = (s, n) => ymd(toTime(s) + n * DAY);
const span = (start, end) => {
  const out = [];
  for (let t = toTime(start), last = toTime(end); t <= last; t += DAY) out.push(ymd(t));
  return out;
};
const median = values => {
  const a = values.slice().sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : Math.round((a[mid - 1] + a[mid]) / 2);
};
const average = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

function validDate(year, month, day) {
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

function normalizeDefaults(defaults) {
  const source = defaults || {};
  return {
    metrics: Array.isArray(source.metrics) && source.metrics.length ? source.metrics.slice() : ALL_METRICS.slice(),
    channels: Array.isArray(source.channels) && source.channels.length ? source.channels.slice() : ['*TOTAL'],
    segments: Array.isArray(source.segments) && source.segments.length ? source.segments.slice() : ['T'],
    availableChannels: Array.isArray(source.availableChannels) ? source.availableChannels.slice() : [],
  };
}

function findAliases(text, aliases) {
  const found = [], ordered = aliases.slice().sort((a, b) => b[0].length - a[0].length);
  let remaining = text;
  for (const [label, value] of ordered) {
    if (!remaining.includes(label)) continue;
    if (!found.includes(value)) found.push(value);
    remaining = remaining.split(label).join(' '.repeat(label.length));
  }
  return found;
}

function parseQuestion(input, defaults) {
  const text = String(input || '').trim();
  if (!text) throw new Error('질문에 연도와 날짜 범위를 적어 주세요.');
  if (text.length > 1000) throw new Error('질문은 1,000자 이내로 적어 주세요.');
  const unsupported = [
    [/\bBPU\b/i, 'BPU'], [/카테고리|상품별/, '카테고리·상품'],
    [/앱\s*설치|앱푸시/, '앱 설치·앱푸시'], [/\bKPI\b/i, 'KPI'],
  ].filter(([pattern]) => pattern.test(text)).map(([, label]) => label);
  if (unsupported.length) throw new Error(`지원하지 않는 조건: ${unsupported.join(', ')}. 현재는 실적 지표·채널·회원구분 질문을 지원합니다.`);
  const fallback = normalizeDefaults(defaults);
  const normalized = text
    .replace(/(\d{1,2})\s*\/\s*(\d{1,2})/g, '$1월 $2')
    .replace(/[–—]/g, '-');
  const events = [];
  const eventRe = /(?:^|[,\n]\s*|그리고\s*|vs\s*|비교\s*)(20\d{2}|\d{2})\s*년\s*([^,\n\d]{0,24}?)\s*(\d{1,2})\s*월\s*(\d{1,2})\s*(?:일)?\s*(?:-|~|부터)\s*(?:(\d{1,2})\s*월\s*)?(\d{1,2})\s*(?:일|일까지)?/gi;
  let match;
  while ((match = eventRe.exec(normalized))) {
    const year = +match[1] < 100 ? 2000 + +match[1] : +match[1];
    const startMonth = +match[3], startDay = +match[4], endMonth = +(match[5] || match[3]), endDay = +match[6];
    if (!validDate(year, startMonth, startDay) || !validDate(year, endMonth, endDay)) {
      throw new Error(`${year}년 날짜가 올바르지 않습니다.`);
    }
    const start = `${year}-${pad(startMonth)}-${pad(startDay)}`;
    const end = `${year}-${pad(endMonth)}-${pad(endDay)}`;
    if (toTime(end) < toTime(start)) throw new Error('행사 종료 날짜는 시작 날짜보다 빠를 수 없습니다.');
    const name = match[2].replace(/\s*(행사|기간)\s*$/i, '').trim() || `행사 ${events.length + 1}`;
    events.push({name, start, end});
  }
  if (!events.length) throw new Error('연도와 날짜 범위를 확인해 주세요. 예: 24년 추석 9월 14-18');

  let preDays = 7, postDays = 7;
  const both = normalized.match(/전후\s*(\d{1,3})\s*일/);
  const asymmetric = normalized.match(/전\s*(\d{1,3})\s*일\s*후\s*(\d{1,3})\s*일/);
  if (both) preDays = postDays = +both[1];
  if (asymmetric) { preDays = +asymmetric[1]; postDays = +asymmetric[2]; }
  if (preDays < 1 || postDays < 1 || preDays > 90 || postDays > 90) throw new Error('전·후 기간은 각각 1~90일로 적어 주세요.');

  const metrics = findAliases(normalized, METRIC_ALIASES);
  const segments = findAliases(normalized, SEGMENT_ALIASES);
  const available = fallback.availableChannels.filter(ch => ch && ch !== '*TOTAL');
  const channelAliases = [...available.map(ch => [ch, ch]), ['직접', '직접'], ['제휴', '제휴'], ['네이버', '네이버'], ['카카오', '카카오']];
  const channels = findAliases(normalized, channelAliases);

  return {
    text,
    events,
    preDays,
    postDays,
    metrics: metrics.length ? metrics : fallback.metrics,
    channels: channels.length ? channels : fallback.channels,
    segments: segments.length ? segments : fallback.segments,
    explicit: {metrics: metrics.length > 0, channels: channels.length > 0, segments: segments.length > 0},
  };
}

function buildPeriods(event, preDays, postDays) {
  return {
    pre: span(addDays(event.start, -preDays), addDays(event.start, -1)),
    during: span(event.start, event.end),
    post: span(addDays(event.end, 1), addDays(event.end, postDays)),
  };
}

function estimateAction(events, dailyValue, targetStart) {
  const onsets = [];
  for (const event of events || []) {
    const baselineValues = [];
    for (let offset = -28; offset <= -15; offset++) {
      const value = dailyValue(event, offset);
      if (Number.isFinite(value)) baselineValues.push(value);
    }
    if (baselineValues.length < 7) continue;
    const baseline = average(baselineValues);
    if (!(baseline > 0)) continue;
    const moving = new Map();
    for (let offset = -28; offset <= -1; offset++) {
      const values = [-2, -1, 0].map(n => dailyValue(event, offset + n)).filter(Number.isFinite);
      if (values.length === 3) moving.set(offset, average(values));
    }
    const threshold = baseline * 1.05;
    let onset = null;
    for (let offset = -28; offset <= -1; offset++) {
      if ((moving.get(offset) || -Infinity) < threshold) continue;
      let kept = 0;
      for (let next = 1; next <= 3; next++) if ((moving.get(offset + next) || -Infinity) >= threshold) kept++;
      if (kept >= 2) { onset = offset; break; }
    }
    if (onset != null) onsets.push(onset);
  }
  if (onsets.length < 2) return {insufficient: true, evidenceCount: onsets.length};
  const onsetOffset = median(onsets), actionOffset = onsetOffset - 14;
  return {
    insufficient: false,
    onsetOffset,
    actionOffset,
    actionDate: targetStart ? addDays(targetStart, actionOffset) : null,
    evidenceCount: onsets.length,
    onsetRange: [Math.min(...onsets), Math.max(...onsets)],
  };
}

const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[ch]);
const signed = delta => {
  if (!delta || !Number.isFinite(delta.v)) return '–';
  const value = Math.abs(delta.v).toFixed(delta.dp == null ? 1 : delta.dp);
  return `${delta.v > 0 ? '+' : delta.v < 0 ? '△' : ''}${value}${delta.unit}`;
};
const offsetText = offset => offset === 0 ? '행사 시작일' : `행사 시작 D${offset > 0 ? '+' : ''}${offset}`;

function analyze(parsed, dash) {
  if (!dash || typeof dash.compute !== 'function') throw new Error('대시보드 계산 기능을 불러오지 못했습니다. 새로고침해 주세요.');
  const beforeRange = parsed.events.find(event => event.end < dash.dataFirst);
  if (beforeRange) throw new Error(`요청한 기간이 데이터 범위보다 이전입니다. 사용 가능한 데이터: ${dash.dataFirst} ~ ${dash.dataLast}`);
  const invalidChannels = parsed.channels.filter(channel => !dash.CHS.includes(channel));
  if (invalidChannels.length) throw new Error(`채널을 찾지 못했습니다: ${invalidChannels.join(', ')}. 지원 채널: ${dash.CHS.map(dash.chLabel).join(', ')}`);
  const segmentKeys = dash.SEGS.map(item => item[0]);
  const invalidSegments = parsed.segments.filter(segment => !segmentKeys.includes(segment));
  if (invalidSegments.length) throw new Error(`회원구분을 찾지 못했습니다. 지원 회원구분: ${dash.SEGS.map(item => item[1]).join(', ')}`);
  const unknownMetrics = parsed.metrics.filter(metric => !dash.MET[metric]);
  if (unknownMetrics.length) throw new Error('지원하지 않는 지표가 포함되어 있습니다.');

  const eventResults = parsed.events.map(event => {
    const periods = buildPeriods(event, parsed.preDays, parsed.postDays);
    const items = [];
    for (const metric of parsed.metrics) {
      const rows = dash.questionRows(metric, parsed.channels, parsed.segments);
      for (const row of rows) {
        const values = {};
        for (const [periodName, dates] of Object.entries(periods)) {
          const avg = dash.compute(metric, row, dates, null, 'avg').v;
          const sum = dash.MET[metric].type === 'flow' ? dash.compute(metric, row, dates, null, 'sum').v : avg;
          values[periodName] = {avg, sum};
        }
        items.push({
          metric,
          row,
          values,
          preToDuring: dash.delta(metric, values.during.avg, values.pre.avg),
          duringToPost: dash.delta(metric, values.post.avg, values.during.avg),
          preToPost: dash.delta(metric, values.post.avg, values.pre.avg),
        });
      }
    }
    return {event, periods, items};
  });

  const primaryMetric = parsed.metrics[0];
  const primaryRows = dash.questionRows(primaryMetric, parsed.channels, parsed.segments);
  const primaryRow = primaryRows[0];
  const historical = parsed.events.filter(event => event.end <= dash.dataLast);
  const target = parsed.events.find(event => event.start > dash.dataLast) || null;
  const action = primaryRow ? estimateAction(historical, (event, offset) => {
    const date = addDays(event.start, offset);
    return dash.compute(primaryMetric, primaryRow, [date], null, 'sum').v;
  }, target && target.start) : {insufficient: true, evidenceCount: 0};
  const observedChanges = primaryRow ? historical.map(event => {
    const baselineDates = span(addDays(event.start, -28), addDays(event.start, -15));
    const duringDates = span(event.start, event.end);
    const baseline = dash.compute(primaryMetric, primaryRow, baselineDates, null, 'avg').v;
    const during = dash.compute(primaryMetric, primaryRow, duringDates, null, 'avg').v;
    return dash.delta(primaryMetric, during, baseline);
  }).filter(change => change && Number.isFinite(change.v)) : [];
  if (observedChanges.length) action.observedRange = {
    min: Math.min(...observedChanges.map(change => change.v)),
    max: Math.max(...observedChanges.map(change => change.v)),
    unit: observedChanges[0].unit,
    dp: observedChanges[0].dp,
  };

  const summary = [];
  for (const result of eventResults.slice(0, 2)) {
    const item = result.items.find(value => value.metric === primaryMetric);
    if (!item || item.values.during.avg == null) {
      summary.push(`${result.event.name}: 행사 기간의 ${dash.MET[primaryMetric].name} 데이터가 부족합니다.`);
      continue;
    }
    summary.push(`${result.event.name}: 행사 중 ${dash.MET[primaryMetric].name}은 전 ${parsed.preDays}일 대비 ${signed(item.preToDuring)} 변했습니다.`);
  }
  if (eventResults.length > 1) {
    const first = eventResults[0].items.find(value => value.metric === primaryMetric);
    const last = eventResults.at(-1).items.find(value => value.metric === primaryMetric);
    const comparison = first && last ? dash.delta(primaryMetric, last.values.during.avg, first.values.during.avg) : null;
    summary.push(`${eventResults.at(-1).event.name} 행사 중 일평균은 ${eventResults[0].event.name} 대비 ${signed(comparison)}입니다.`);
  }
  if (action.observedRange) {
    const range = action.observedRange;
    const low = signed({v: range.min, unit: range.unit, dp: range.dp});
    const high = signed({v: range.max, unit: range.unit, dp: range.dp});
    summary.push(`과거 관찰 변화 범위는 행사 전 기준선 대비 ${low}${low === high ? '' : ` ~ ${high}`}입니다.`);
  }
  if (action.insufficient) summary.push(`상승 시점 예측은 계산 가능한 과거 행사가 2개 이상 필요합니다(현재 ${action.evidenceCount}개).`);
  else summary.push(`예상 상승 시점은 ${offsetText(action.onsetOffset)}, 권장 액션 시작은 그보다 14일 전인 ${action.actionDate || offsetText(action.actionOffset)}입니다.`);

  return {parsed, eventResults, primaryMetric, action, summary: summary.slice(0, 5)};
}

function formatValue(dash, metric, value) {
  if (value == null) return '데이터 부족';
  const unit = dash.MET[metric].pct ? '' : (dash.MET[metric].unit || '');
  return `${dash.fmt(metric, value)}${unit ? ` ${unit}` : ''}`;
}

function renderAnalysis(result, dash) {
  const p = result.parsed;
  const filters = `채널 ${p.channels.map(dash.chLabel).join('·')} · 회원구분 ${p.segments.map(dash.segLabel).join('·')}`;
  const events = result.eventResults.map(eventResult => {
    const rows = eventResult.items.map(item => {
      const flow = dash.MET[item.metric].type === 'flow';
      const cell = period => {
        const value = item.values[period];
        const main = formatValue(dash, item.metric, value.avg);
        const sub = flow && value.sum != null ? `<small>합계 ${esc(dash.fmt(item.metric, value.sum))}</small>` : '';
        return `<td>${esc(main)}${sub}</td>`;
      };
      return `<tr><th>${esc(dash.MET[item.metric].name)}<small>${esc(item.row.label || '')}</small></th>${cell('pre')}${cell('during')}${cell('post')}<td>${esc(signed(item.preToDuring))}</td><td>${esc(signed(item.duringToPost))}</td></tr>`;
    }).join('');
    return `<section class="aiq-result"><h4>${esc(eventResult.event.name)} <span>${esc(eventResult.event.start)} ~ ${esc(eventResult.event.end)}</span></h4><div class="aiq-table-wrap"><table class="aiq-table"><thead><tr><th>지표</th><th>전 ${p.preDays}일</th><th>행사 중</th><th>후 ${p.postDays}일</th><th>전→중</th><th>중→후</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
  }).join('');
  const action = result.action.insufficient
    ? `<b>예측 근거 부족</b> · 계산 가능한 과거 행사 ${result.action.evidenceCount}개 (2개 이상 필요)`
    : `<b>권장 액션 시작</b> · ${esc(result.action.actionDate || offsetText(result.action.actionOffset))} <span>예상 상승 ${esc(offsetText(result.action.onsetOffset))}보다 14일 전</span>`;
  return `<div class="aiq-conditions"><b>해석한 조건</b> · 전 ${p.preDays}일 / 행사 중 / 후 ${p.postDays}일 · ${esc(filters)}</div>${events}<div class="aiq-action">${action}</div><div class="aiq-summary"><b>자동 요약</b><ul>${result.summary.map(line => `<li>${esc(line)}</li>`).join('')}</ul></div><div class="aiq-cap">기존 대시보드 공식 산식으로 브라우저 안에서 계산했습니다. 원인을 단정하지 않으며, 예측은 과거 패턴을 이어 본 참고값입니다.</div>`;
}

function mount(dash) {
  if (typeof document === 'undefined') return;
  const section = document.getElementById('aiQuestionSec');
  const input = document.getElementById('aiQuestionInput');
  const send = document.getElementById('aiQuestionSend');
  const example = document.getElementById('aiQuestionExample');
  const thread = document.getElementById('aiQuestionThread');
  if (!section || !input || !send || !example || !thread || section.dataset.mounted) return;
  section.dataset.mounted = 'true';
  section.hidden = false;
  const submit = () => {
    const text = input.value.trim();
    if (!text) return;
    const user = document.createElement('div');
    user.className = 'aiq-user'; user.textContent = text; thread.appendChild(user);
    try {
      const parsed = parseQuestion(text, {
        metrics: dash.METRICS,
        channels: dash.selChans(),
        segments: dash.selSegs(),
        availableChannels: dash.CHS,
      });
      const result = analyze(parsed, dash);
      const answer = document.createElement('div');
      answer.className = 'aiq-answer'; answer.innerHTML = renderAnalysis(result, dash); thread.appendChild(answer);
    } catch (error) {
      const answer = document.createElement('div');
      answer.className = 'aiq-answer aiq-error';
      answer.textContent = error && error.message ? error.message : '질문을 해석하지 못했습니다. 날짜와 조건을 확인해 주세요.';
      thread.appendChild(answer);
    }
    input.value = '';
    thread.scrollTop = thread.scrollHeight;
  };
  example.addEventListener('click', () => {
    input.value = '24년 추석 9월 14-18, 25년 추석 10월 3-9, 첫구매 거래액 전후 영향 알려줘';
    input.focus();
  });
  send.addEventListener('click', submit);
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit(); }
  });
}

root.FP_AI_QUESTION = {parseQuestion, buildPeriods, estimateAction, analyze, mount};
})(typeof window !== 'undefined' ? window : globalThis);
