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
const APP_ALIASES = [
  ['앱 신규 설치', 'appNew'], ['신규 설치', 'appNew'], ['전체 설치', 'appAll'], ['재설치', 'appRe'],
  ['스토어 방문', 'appVisit'], ['순증 설치', 'appNet'], ['앱 삭제', 'appDel'], ['Push 활성 기기', 'appDev'],
  ['수신동의 순증', 'pChg'], ['수신동의 이탈', 'pOut'], ['수신동의 추가', 'pAdd'], ['수신동의 회원', 'pTot'],
  ['유효회원수', 'mValid'], ['누적회원수', 'mCum'], ['신규회원수', 'mNew'],
];
const DIMENSIONS = [['채널', 'channel'], ['BPU', 'bpu'], ['카테고리', 'category'], ['브랜드', 'brand'], ['상품', 'product']];

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

function weekPeriod(year, month, nth) {
  if (month < 1 || month > 12 || nth < 1 || nth > 6) throw new Error('주차를 확인해 주세요.');
  const first = Date.UTC(year, month - 1, 1), day = new Date(first).getUTCDay();
  const firstThursday = first + ((4 - day + 7) % 7) * DAY;
  const thursday = firstThursday + (nth - 1) * 7 * DAY;
  if (new Date(thursday).getUTCMonth() !== month - 1) throw new Error(`${year}년 ${month}월 ${nth}주차는 존재하지 않습니다.`);
  return {start: ymd(thursday - 3 * DAY), end: ymd(thursday + 3 * DAY)};
}

function normalizeDefaults(defaults) {
  const source = defaults || {};
  return {
    metrics: Array.isArray(source.metrics) && source.metrics.length ? source.metrics.slice() : ALL_METRICS.slice(),
    channels: Array.isArray(source.channels) && source.channels.length ? source.channels.slice() : ['*TOTAL'],
    segments: Array.isArray(source.segments) && source.segments.length ? source.segments.slice() : ['T'],
    availableChannels: Array.isArray(source.availableChannels) ? source.availableChannels.slice() : [],
    bpus: Array.isArray(source.bpus) ? source.bpus.slice() : [],
    categories: Array.isArray(source.categories) ? source.categories.slice() : [],
    availableBpus: Array.isArray(source.availableBpus) ? source.availableBpus.slice() : [],
    availableCategories: Array.isArray(source.availableCategories) ? source.availableCategories.slice() : [],
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
  const fallback = normalizeDefaults(defaults);
  const normalized = text.replace(/(\d{1,2})\s*\/\s*(\d{1,2})/g, '$1월 $2').replace(/[–—]/g, '-');
  const found = [], overlaps = (a, b) => found.some(x => a < x.endIndex && b > x.index);
  const add = (index, raw, event) => { const endIndex = index + raw.length; if (!overlaps(index, endIndex)) found.push({...event, index, endIndex}); };
  const yearOf = value => +value < 100 ? 2000 + +value : +value;
  let match;
  const rangeRe = /(20\d{2}|\d{2})\s*년\s*([^,\n\d]{0,24}?)\s*(\d{1,2})\s*월\s*(\d{1,2})\s*(?:일)?\s*(?:-|~|부터)\s*(?:(\d{1,2})\s*월\s*)?(\d{1,2})\s*(?:일|일까지)?/gi;
  while ((match = rangeRe.exec(normalized))) {
    const year = yearOf(match[1]), sm = +match[3], sd = +match[4], em = +(match[5] || match[3]), ed = +match[6];
    if (!validDate(year, sm, sd) || !validDate(year, em, ed)) throw new Error(`${year}년 날짜가 올바르지 않습니다.`);
    const start = `${year}-${pad(sm)}-${pad(sd)}`, end = `${year}-${pad(em)}-${pad(ed)}`;
    if (toTime(end) < toTime(start)) throw new Error('행사 종료 날짜는 시작 날짜보다 빠를 수 없습니다.');
    const label = match[2].replace(/\s*(행사|기간)\s*$/i, '').trim();
    add(match.index, match[0], {name: label || `${year}년 ${sm}월 ${sd}-${ed}일`, start, end, kind: 'range'});
  }
  const weekRe = /(20\d{2}|\d{2})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*주차/gi;
  while ((match = weekRe.exec(normalized))) {
    const year = yearOf(match[1]), month = +match[2], nth = +match[3], period = weekPeriod(year, month, nth);
    add(match.index, match[0], {name: `${year}년 ${month}월 ${nth}주차`, ...period, kind: 'week'});
  }
  const dayRe = /(20\d{2}|\d{2})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/gi;
  while ((match = dayRe.exec(normalized))) {
    const year = yearOf(match[1]), month = +match[2], day = +match[3];
    if (!validDate(year, month, day)) throw new Error(`${year}년 날짜가 올바르지 않습니다.`);
    const date = `${year}-${pad(month)}-${pad(day)}`;
    add(match.index, match[0], {name: `${year}년 ${month}월 ${day}일`, start: date, end: date, kind: 'day'});
  }
  const monthRe = /(20\d{2}|\d{2})\s*년\s*(\d{1,2})\s*월(?!\s*\d)/gi;
  while ((match = monthRe.exec(normalized))) {
    const year = yearOf(match[1]), month = +match[2];
    if (month < 1 || month > 12) throw new Error(`${year}년 월을 확인해 주세요.`);
    add(match.index, match[0], {name: `${year}년 ${month}월`, start: `${year}-${pad(month)}-01`, end: `${year}-${pad(month)}-${pad(new Date(Date.UTC(year, month, 0)).getUTCDate())}`, kind: 'month'});
  }
  const allIntent = /(?:전체|모든)\s*실적/.test(normalized);
  const kpiIntent = /\bKPI\b|목표|달성률/i.test(normalized);
  if (!found.length && (allIntent || kpiIntent)) {
    const ym = normalized.match(/(20\d{2}|\d{2})\s*년/);
    if (ym) { const year = yearOf(ym[1]); found.push({name: `${year}년`, start: `${year}-01-01`, end: `${year}-12-31`, kind: 'year', index: ym.index, endIndex: ym.index + ym[0].length}); }
  }
  const events = found.sort((a, b) => a.index - b.index).map(({index, endIndex, ...event}) => event);
  if (!events.length) throw new Error('연도와 날짜 범위를 확인해 주세요. 예: 24년 9월 3주차 또는 24년 추석 9월 14-18');

  let preDays = 7, postDays = 7;
  const both = normalized.match(/전후\s*(\d{1,3})\s*일/);
  const asymmetric = normalized.match(/전\s*(\d{1,3})\s*일\s*후\s*(\d{1,3})\s*일/);
  if (both) preDays = postDays = +both[1];
  if (asymmetric) { preDays = +asymmetric[1]; postDays = +asymmetric[2]; }
  if (preDays < 1 || postDays < 1 || preDays > 90 || postDays > 90) throw new Error('전·후 기간은 각각 1~90일로 적어 주세요.');

  const metrics = findAliases(normalized, METRIC_ALIASES);
  const appMetrics = findAliases(normalized, APP_ALIASES);
  const segments = findAliases(normalized, SEGMENT_ALIASES);
  const available = fallback.availableChannels.filter(ch => ch && ch !== '*TOTAL');
  const channelAliases = [...available.map(ch => [ch, ch]), ['직접', '직접'], ['제휴', '제휴'], ['네이버', '네이버'], ['카카오', '카카오']];
  const channels = findAliases(normalized, channelAliases);
  const bpus = findAliases(normalized, fallback.availableBpus.map(name => [name, name]));
  const categories = findAliases(normalized, fallback.availableCategories.map(name => [name, name]));
  const dimensions = DIMENSIONS.filter(([label]) => new RegExp(`${label}\\s*(?:별|까지)?`, 'i').test(normalized)).map(([, value]) => value);
  const productIntent = dimensions.length > 0 || /상품\s*실적|상품\s*구성/i.test(normalized);
  const appIntent = appMetrics.length > 0 || /앱\s*실적|앱푸시|앱\s*설치|회원\s*실적/i.test(normalized);
  const families = allIntent ? ['core', 'app', 'kpi', 'product'] : [
    ...(metrics.length > 0 || (!appIntent && !kpiIntent && !productIntent) ? ['core'] : []), ...(appIntent ? ['app'] : []), ...(kpiIntent ? ['kpi'] : []), ...(productIntent ? ['product'] : []),
  ];

  return {
    text,
    events,
    preDays,
    postDays,
    metrics: metrics.length ? metrics : fallback.metrics,
    appMetrics,
    dimensions,
    families,
    allIntent,
    channels: channels.length ? channels : fallback.channels,
    segments: segments.length ? segments : fallback.segments,
    bpus: bpus.length ? bpus : fallback.bpus,
    categories: categories.length ? categories : fallback.categories,
    explicit: {metrics: metrics.length > 0, channels: channels.length > 0, segments: segments.length > 0, bpus: bpus.length > 0, categories: categories.length > 0, dimensions: dimensions.length > 0},
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
  const unknownMetrics = parsed.families.includes('core') ? parsed.metrics.filter(metric => !dash.MET[metric]) : [];
  if (unknownMetrics.length) throw new Error('지원하지 않는 지표가 포함되어 있습니다.');

  const eventResults = parsed.events.map(event => {
    const periods = buildPeriods(event, parsed.preDays, parsed.postDays);
    const items = [];
    for (const metric of (parsed.families.includes('core') ? parsed.metrics : [])) {
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

  const appIds = parsed.appMetrics.length ? parsed.appMetrics : (dash.AX_ORDER || []);
  const appResults = parsed.families.includes('app') && typeof dash.queryApp === 'function' ? parsed.events.map(event => ({
    event, rows: dash.queryApp(span(event.start, event.end), appIds, 'sum'),
  })) : [];
  const productResults = parsed.families.includes('product') && typeof dash.queryProducts === 'function' ? parsed.events.map(event => ({
    event, result: dash.queryProducts({dates: span(event.start, event.end), dimensions: parsed.dimensions.length ? parsed.dimensions : ['category'], channels: parsed.channels,
      ...(parsed.explicit.bpus ? {bpus: parsed.bpus} : {}), ...(parsed.explicit.categories ? {categories: parsed.categories} : {}), limit: 10}),
  })) : [];
  const kpi = parsed.families.includes('kpi') && typeof dash.queryKpi === 'function' ? dash.queryKpi() : null;

  const primaryMetric = parsed.families.includes('core') ? parsed.metrics[0] : null;
  const primaryRows = primaryMetric ? dash.questionRows(primaryMetric, parsed.channels, parsed.segments) : [];
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
  for (const result of (primaryMetric ? eventResults.slice(0, 2) : [])) {
    const item = result.items.find(value => value.metric === primaryMetric);
    if (!item || item.values.during.avg == null) {
      summary.push(`${result.event.name}: 행사 기간의 ${dash.MET[primaryMetric].name} 데이터가 부족합니다.`);
      continue;
    }
    summary.push(`${result.event.name}: 행사 중 ${dash.MET[primaryMetric].name}은 전 ${parsed.preDays}일 대비 ${signed(item.preToDuring)} 변했습니다.`);
  }
  if (primaryMetric && eventResults.length > 1) {
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
  if (primaryMetric && action.insufficient) summary.push(`상승 시점 예측은 계산 가능한 과거 행사가 2개 이상 필요합니다(현재 ${action.evidenceCount}개).`);
  else if (primaryMetric) summary.push(`예상 상승 시점은 ${offsetText(action.onsetOffset)}, 권장 액션 시작은 그보다 14일 전인 ${action.actionDate || offsetText(action.actionOffset)}입니다.`);

  if (!parsed.families.includes('core')) {
    summary.length = 0;
    summary.push(`요청한 ${parsed.families.map(x => ({app: '앱·회원', kpi: 'KPI', product: '상품'}[x] || x)).join('·')} 실적을 기존 대시보드 산식으로 조회했습니다.`);
  }
  return {parsed, eventResults, appResults, productResults, kpi, primaryMetric, action, summary: summary.slice(0, 5)};
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
  const app = result.appResults.map(eventResult => `<section class="aiq-result"><h4>${esc(eventResult.event.name)} · 앱·푸시·회원 실적</h4><div class="aiq-table-wrap"><table class="aiq-table"><thead><tr><th>지표</th><th>값</th></tr></thead><tbody>${eventResult.rows.map(row => `<tr><th>${esc(row.name)}<small>${esc(row.group)}</small></th><td>${row.value == null ? '데이터 부족' : esc(row.pct ? `${(row.value * 100).toFixed(2)}%` : `${Math.round(row.value).toLocaleString('ko-KR')} ${row.unit}`)}</td></tr>`).join('')}</tbody></table></div></section>`).join('');
  const dimLabel = {channel: '채널', bpu: 'BPU', category: '카테고리', brand: '브랜드', product: '상품'};
  const products = result.productResults.map(eventResult => {
    const q = eventResult.result;
    if (!q.available) return `<section class="aiq-result"><h4>${esc(eventResult.event.name)} · 상품 실적</h4><p>${esc(q.reason)}</p></section>`;
    const groups = Object.entries(q.groups).map(([dim, group]) => {
      const visible = group.rows.slice(0, 10);
      const body = visible.map(row => `<tr><th>${esc(row.name)}</th><td>${esc((row.a / 1e6).toLocaleString('ko-KR', {maximumFractionDigits: 1}))} 백만원</td><td>${esc(Math.round(row.u).toLocaleString('ko-KR'))} 명</td><td>${row.aov == null ? '–' : esc(Math.round(row.aov).toLocaleString('ko-KR')) + ' 원'}</td></tr>`).join('');
      const full = group.all.length > visible.length ? `<details><summary>전체 ${group.totalCount.toLocaleString('ko-KR')}개 상세</summary><div class="aiq-table-wrap"><table class="aiq-table"><tbody>${group.all.map(row => `<tr><th>${esc(row.name)}</th><td>${esc((row.a / 1e6).toLocaleString('ko-KR', {maximumFractionDigits: 1}))} 백만원</td></tr>`).join('')}</tbody></table></div></details>` : '';
      return `<h5>${esc(dimLabel[dim])}별 상위 실적</h5><div class="aiq-table-wrap"><table class="aiq-table"><thead><tr><th>${esc(dimLabel[dim])}</th><th>거래액</th><th>주문고객수</th><th>객단가</th></tr></thead><tbody>${body}</tbody></table></div>${full}`;
    }).join('');
    return `<section class="aiq-result"><h4>${esc(eventResult.event.name)} · 상품 실적</h4><div class="aiq-conditions">채널 ${esc(q.filters.channels.join('·'))} · BPU ${esc(q.filters.bpus.join('·'))} · 카테고리 ${esc(q.filters.categories.join('·'))}</div><p><b>합계</b> · 거래액 ${esc((q.total.a / 1e6).toLocaleString('ko-KR', {maximumFractionDigits: 1}))} 백만원 · 주문고객수 ${esc(Math.round(q.total.u).toLocaleString('ko-KR'))} 명</p>${groups}</section>`;
  }).join('');
  const kpi = result.kpi ? `<section class="aiq-result"><h4>${esc(result.kpi.y)}년 KPI</h4><div class="aiq-table-wrap"><table class="aiq-table"><thead><tr><th>지표</th><th>실적</th><th>목표</th><th>달성률</th><th>남은 기간 일평균 필요</th></tr></thead><tbody>${Object.entries(result.kpi.rows).map(([id, row]) => `<tr><th>${esc(dash.MET[id].name)}</th><td>${esc(dash.fmt(id, row.act))}</td><td>${row.target == null ? '데이터 없음' : esc(dash.fmt(id, row.target))}</td><td>${row.ach == null ? '–' : esc((row.ach * 100).toFixed(1)) + '%'}</td><td>${row.need == null ? '–' : esc(dash.fmt(id, row.need))}</td></tr>`).join('')}</tbody></table></div></section>` : (p.families.includes('kpi') ? '<section class="aiq-result"><h4>KPI</h4><p>이 백업에 KPI 목표 데이터가 없습니다.</p></section>' : '');
  const action = !result.primaryMetric ? '' : result.action.insufficient
    ? `<b>예측 근거 부족</b> · 계산 가능한 과거 행사 ${result.action.evidenceCount}개 (2개 이상 필요)`
    : `<b>권장 액션 시작</b> · ${esc(result.action.actionDate || offsetText(result.action.actionOffset))} <span>예상 상승 ${esc(offsetText(result.action.onsetOffset))}보다 14일 전</span>`;
  return `<div class="aiq-conditions"><b>해석한 조건</b> · ${esc(p.events.map(e => `${e.name} ${e.start}~${e.end}`).join(' · '))} · ${esc(filters)}</div>${events}${app}${kpi}${products}${action ? `<div class="aiq-action">${action}</div>` : ''}<div class="aiq-summary"><b>자동 요약</b><ul>${result.summary.map(line => `<li>${esc(line)}</li>`).join('')}</ul></div><div class="aiq-cap">기존 대시보드 공식 산식으로 브라우저 안에서 계산했습니다. 원인을 단정하지 않으며, 예측은 과거 패턴을 이어 본 참고값입니다.</div>`;
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
      const productFilters = typeof dash.productQuestionFilters === 'function' ? dash.productQuestionFilters() : {};
      const parsed = parseQuestion(text, {
        metrics: dash.METRICS,
        channels: dash.selChans(),
        segments: dash.selSegs(),
        availableChannels: dash.CHS,
        ...productFilters,
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

root.FP_AI_QUESTION = {parseQuestion, weekPeriod, buildPeriods, estimateAction, analyze, mount};
})(typeof window !== 'undefined' ? window : globalThis);
