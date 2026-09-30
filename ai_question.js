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

function normalizeRemoteQuery(payload, defaults) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Gemini 응답 형식이 올바르지 않습니다.');
  const fallback = normalizeDefaults(defaults);
  const action = payload.action;
  if (!['query', 'clarify'].includes(action)) throw new Error('Gemini 응답의 처리 유형이 올바르지 않습니다.');
  const clarification = String(payload.clarification || '').trim().slice(0, 300);
  if (!Array.isArray(payload.events) || payload.events.length > 12) throw new Error('Gemini가 반환한 기간 조건이 올바르지 않습니다.');
  const events = payload.events.map(raw => {
    if (!raw || typeof raw !== 'object') throw new Error('Gemini가 반환한 기간 조건이 올바르지 않습니다.');
    const check = value => {
      const match = typeof value === 'string' && value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!match || !validDate(+match[1], +match[2], +match[3])) throw new Error('Gemini가 반환한 날짜가 올바르지 않습니다.');
      return value;
    };
    const start = check(raw.start), end = check(raw.end);
    if (toTime(end) < toTime(start)) throw new Error('행사 종료 날짜는 시작 날짜보다 빠를 수 없습니다.');
    if (!['range', 'week', 'day', 'month', 'year'].includes(raw.kind)) throw new Error('Gemini가 반환한 기간 유형이 올바르지 않습니다.');
    return {name: String(raw.name || `${start}~${end}`).trim().slice(0, 80), start, end, kind: raw.kind};
  });
  if (action === 'clarify' && !clarification) throw new Error('질문의 기간이나 조건을 조금 더 구체적으로 적어 주세요.');
  if (action === 'query' && !events.length) throw new Error('연도와 날짜 범위를 확인해 주세요.');
  const preDays = Number(payload.preDays), postDays = Number(payload.postDays);
  if (!Number.isInteger(preDays) || !Number.isInteger(postDays) || preDays < 1 || postDays < 1 || preDays > 90 || postDays > 90) throw new Error('전·후 기간은 각각 1~90일로 적어 주세요.');

  const list = (value, label) => {
    if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || !item.trim())) throw new Error(`Gemini가 반환한 ${label} 조건 형식이 올바르지 않습니다.`);
    return [...new Set(value.map(item => item.trim()))];
  };
  const allowed = (values, choices, label) => {
    if (values.some(value => !choices.includes(value))) throw new Error(`지원하지 않는 ${label} 조건이 포함되어 있습니다.`);
    return values;
  };
  const metrics = allowed(list(payload.metrics, '지표'), ALL_METRICS, '지표');
  const appMetrics = allowed(list(payload.appMetrics, '앱 지표'), APP_ALIASES.map(([, value]) => value), '앱 지표');
  const dimensions = allowed(list(payload.dimensions, '구분'), DIMENSIONS.map(([, value]) => value), '구분');
  const families = allowed(list(payload.families, '실적 영역'), ['core', 'app', 'kpi', 'product'], '실적 영역');
  const availableChannels = fallback.availableChannels.length ? fallback.availableChannels : fallback.channels;
  const channels = allowed(list(payload.channels, '채널'), availableChannels, '채널');
  const segments = allowed(list(payload.segments, '회원구분'), ['T', '1', '2', '3'], '회원구분');
  const bpus = allowed(list(payload.bpus, 'BPU'), fallback.availableBpus, 'BPU');
  const categories = allowed(list(payload.categories, '카테고리'), fallback.availableCategories, '카테고리');
  const rawExplicit = payload.explicit && typeof payload.explicit === 'object' ? payload.explicit : {};
  return {
    text: String(payload.text || '').slice(0, 1000), action, clarification, events, preDays, postDays,
    metrics: metrics.length ? metrics : fallback.metrics, appMetrics, dimensions, families,
    allIntent: !!payload.allIntent, channels: channels.length ? channels : fallback.channels,
    segments: segments.length ? segments : fallback.segments, bpus, categories,
    explicit: Object.fromEntries(['metrics', 'channels', 'segments', 'bpus', 'categories', 'dimensions'].map(key => [key, !!rawExplicit[key]])),
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
  const weeksBefore = normalized.match(/(\d{1,2})\s*주\s*전/);
  if (both) preDays = postDays = +both[1];
  if (asymmetric) { preDays = +asymmetric[1]; postDays = +asymmetric[2]; }
  else if (!both && weeksBefore) preDays = +weeksBefore[1] * 7;
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
  const productResults = parsed.families.includes('product') && typeof dash.queryProducts === 'function' ? parsed.events.map(event => {
    if (event.start > dash.dataLast) return {event, result: {available: false, reason: `요청 기간(${event.start}~${event.end})은 데이터 기준일(${dash.dataLast}) 이후입니다.`}};
    const dates = span(event.start, event.end).filter(day => day >= dash.dataFirst && day <= dash.dataLast);
    if (!dates.length) return {event, result: {available: false, reason: `요청 기간에 사용할 수 있는 상품 데이터가 없습니다. 데이터 범위: ${dash.dataFirst}~${dash.dataLast}`}};
    return {event, result: dash.queryProducts({dates, dimensions: parsed.dimensions.length ? parsed.dimensions : ['category'], channels: parsed.channels, segments: parsed.segments,
      ...(parsed.explicit.bpus ? {bpus: parsed.bpus} : {}), ...(parsed.explicit.categories ? {categories: parsed.categories} : {}), limit: 10})};
  }) : [];
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

const AI_STORE_KEY = 'fp-dashboard-ai-insights';
const AI_PAGE_SIZE = 5;
let AI_STORE_MEM = null, AI_PAGE = 1;
const AI_LIVE = new Map();
const cleanText = (value, limit = 2000) => String(value == null ? '' : value).trim().slice(0, limit);
function cleanInsight(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    headline: cleanText(source.headline, 160), summary: cleanText(source.summary, 1000),
    findings: Array.isArray(source.findings) ? source.findings.filter(x => typeof x === 'string').slice(0, 5).map(x => cleanText(x, 300)).filter(Boolean) : [],
    action: cleanText(source.action, 500), caveat: cleanText(source.caveat, 300),
  };
}
function cleanEvidence(value) {
  const source = value && typeof value === 'object' ? value : {};
  const sections = Array.isArray(source.sections) ? source.sections.slice(0, 12).filter(x => x && typeof x === 'object').map(section => ({
    title: cleanText(section.title, 120),
    columns: Array.isArray(section.columns) ? section.columns.slice(0, 10).map(x => cleanText(x, 100)) : [],
    rows: Array.isArray(section.rows) ? section.rows.slice(0, 50).filter(Array.isArray).map(row => row.slice(0, 10).map(x => cleanText(x, 200))) : [],
  })) : [];
  return {
    conditions: Array.isArray(source.conditions) ? source.conditions.slice(0, 30).map(x => cleanText(x, 200)).filter(Boolean) : [],
    sections, actionBasis: cleanText(source.actionBasis, 500), dataAsOf: cleanText(source.dataAsOf, 20),
  };
}
function cleanSnapshot(value) {
  if (!value || typeof value !== 'object' || typeof value.id !== 'string' || typeof value.question !== 'string') return null;
  const insight = cleanInsight(value.insight), evidence = cleanEvidence(value.evidence);
  if (!insight.headline || !insight.summary) return null;
  return {id: value.id.slice(0, 100), created: cleanText(value.created, 40), question: cleanText(value.question, 1000), provider: value.provider === 'gemini' ? 'gemini' : 'local', insight, evidence};
}
function aiStoreRead() {
  if (AI_STORE_MEM) return AI_STORE_MEM;
  try {
    const value = JSON.parse(root.localStorage.getItem(AI_STORE_KEY) || '[]');
    AI_STORE_MEM = Array.isArray(value) ? value.map(cleanSnapshot).filter(Boolean) : [];
  } catch (error) { AI_STORE_MEM = []; }
  return AI_STORE_MEM;
}
function aiStoreWrite(list) {
  AI_STORE_MEM = list.map(cleanSnapshot).filter(Boolean);
  try { root.localStorage.setItem(AI_STORE_KEY, JSON.stringify(AI_STORE_MEM)); } catch (error) { /* 현재 창 메모리에는 유지 */ }
}
root.FP_AI_INSIGHTS = {
  all: () => aiStoreRead().map(item => JSON.parse(JSON.stringify(item))),
  add: item => { const clean = cleanSnapshot(item); if (!clean) return false; const list = aiStoreRead(); if (list.some(old => old.id === clean.id)) return false; aiStoreWrite([clean, ...list]); return true; },
  remove: id => aiStoreWrite(aiStoreRead().filter(item => item.id !== id)),
  mergeIn: list => {
    if (!Array.isArray(list)) return 0;
    const current = new Map(aiStoreRead().map(item => [item.id, item])); let count = 0;
    for (const raw of list) { const item = cleanSnapshot(raw); if (!item) continue; const old = current.get(item.id); if (!old || item.created > old.created) { current.set(item.id, item); count++; } }
    if (count) aiStoreWrite([...current.values()].sort((a, b) => b.created.localeCompare(a.created)));
    return count;
  },
};

function buildEvidence(result, dash) {
  const parsed = result.parsed;
  const conditions = [
    ...parsed.events.map(event => `${event.name} ${event.start}~${event.end}`),
    `채널 ${parsed.channels.map(dash.chLabel).join('·')}`, `회원구분 ${parsed.segments.map(dash.segLabel).join('·')}`,
  ];
  const sections = [];
  for (const eventResult of result.eventResults) {
    if (!eventResult.items.length) continue;
    sections.push({
      title: `${eventResult.event.name} · 핵심 실적`,
      columns: ['지표', `전 ${parsed.preDays}일`, '행사 중', `후 ${parsed.postDays}일`, '전→중', '중→후'],
      rows: eventResult.items.map(item => [
        `${dash.MET[item.metric].name}${item.row.label ? ` · ${item.row.label}` : ''}`,
        formatValue(dash, item.metric, item.values.pre.avg), formatValue(dash, item.metric, item.values.during.avg),
        formatValue(dash, item.metric, item.values.post.avg), signed(item.preToDuring), signed(item.duringToPost),
      ]),
    });
  }
  for (const eventResult of result.appResults) sections.push({
    title: `${eventResult.event.name} · 앱·푸시·회원 실적`, columns: ['지표', '값'],
    rows: eventResult.rows.map(row => [row.name, row.value == null ? '데이터 부족' : row.pct ? `${(row.value * 100).toFixed(2)}%` : `${Math.round(row.value).toLocaleString('ko-KR')} ${row.unit}`]),
  });
  if (result.kpi) sections.push({
    title: `${result.kpi.y}년 KPI`, columns: ['지표', '실적', '목표', '달성률', '남은 기간 일평균 필요'],
    rows: Object.entries(result.kpi.rows).map(([id, row]) => [dash.MET[id].name, dash.fmt(id, row.act), row.target == null ? '데이터 없음' : dash.fmt(id, row.target), row.ach == null ? '–' : `${(row.ach * 100).toFixed(1)}%`, row.need == null ? '–' : dash.fmt(id, row.need)]),
  });
  for (const eventResult of result.productResults) {
    const query = eventResult.result;
    if (!query.available) { sections.push({title: `${eventResult.event.name} · 상품 실적`, columns: ['안내'], rows: [[query.reason]]}); continue; }
    sections.push({title: `${eventResult.event.name} · 상품 실적 합계`, columns: ['거래액', '주문고객수'], rows: [[`${(query.total.a / 1e6).toLocaleString('ko-KR', {maximumFractionDigits: 1})} 백만원`, `${Math.round(query.total.u).toLocaleString('ko-KR')} 명`]]});
    const dimensionLabels = {channel: '채널', bpu: 'BPU', category: '카테고리', brand: '브랜드', product: '상품'};
    for (const [dimension, group] of Object.entries(query.groups)) sections.push({title: `${eventResult.event.name} · ${dimensionLabels[dimension] || dimension}별 상위 실적`, columns: ['구분', '거래액', '주문고객수', '객단가'], rows: group.rows.slice(0, 10).map(row => [row.name, `${(row.a / 1e6).toLocaleString('ko-KR', {maximumFractionDigits: 1})} 백만원`, `${Math.round(row.u).toLocaleString('ko-KR')} 명`, row.aov == null ? '–' : `${Math.round(row.aov).toLocaleString('ko-KR')} 원`])});
  }
  const actionBasis = !result.primaryMetric ? '' : result.action.insufficient
    ? `계산 가능한 과거 행사 ${result.action.evidenceCount}개로 상승 시점 예측 근거가 부족합니다.`
    : `예상 상승 ${offsetText(result.action.onsetOffset)} · 권장 액션 시작 ${result.action.actionDate || offsetText(result.action.actionOffset)}(14일 전)`;
  return cleanEvidence({conditions, sections, actionBasis, dataAsOf: dash.dataLast});
}

function fallbackInsight(result) {
  const action = !result.primaryMetric ? '' : result.action.insufficient ? '과거 행사 근거가 더 쌓인 뒤 실행 시점을 판단하세요.' : `권장 액션은 예상 상승 시점보다 14일 전인 ${result.action.actionDate || offsetText(result.action.actionOffset)}부터 시작하세요.`;
  const headline = result.summary[0] || '질문 조건에 맞는 실적을 조회했습니다.';
  const details = result.summary.slice(1);
  return cleanInsight({
    headline,
    summary: details.join(' ') || '질문에서 지정한 기간과 필터를 기존 대시보드 산식에 적용했습니다.', findings: details.slice(0, 5), action,
    caveat: '기존 대시보드 공식 산식으로 계산한 참고 분석이며 원인을 단정하지 않습니다.',
  });
}

function renderEvidence(evidence) {
  const conditions = evidence.conditions.map(item => `<span class="condition">${esc(item)}</span>`).join('');
  const sections = evidence.sections.map(section => `<section class="aiq-result"><h4>${esc(section.title)}</h4><div class="aiq-table-wrap"><table class="aiq-table"><thead><tr>${section.columns.map(column => `<th>${esc(column)}</th>`).join('')}</tr></thead><tbody>${section.rows.map(row => `<tr>${row.map((cell, index) => `${index ? '<td>' : '<th>'}${esc(cell)}${index ? '</td>' : '</th>'}`).join('')}</tr>`).join('')}</tbody></table></div></section>`).join('');
  return `<div class="aiq-conditions">${conditions}</div>${sections}${evidence.actionBasis ? `<div class="aiq-action">${esc(evidence.actionBasis)}</div>` : ''}<div class="aiq-cap">기존 대시보드 공식 산식으로 브라우저에서 계산 · 데이터 기준일 ${esc(evidence.dataAsOf)}</div>`;
}

function renderSnapshot(snapshot, saveable) {
  const insight = snapshot.insight, findings = insight.findings.map(item => `<li>${esc(item)}</li>`).join('');
  const label = snapshot.provider === 'gemini' ? 'Gemini AI 인사이트' : '기존 산식 인사이트';
  return `<div class="aiq-answer-head"><span class="aiq-ai-label">${label}</span>${saveable ? `<button class="aiq-save" type="button" data-ai-save="${esc(snapshot.id)}">저장</button>` : ''}</div><div class="aiq-insight"><h3>${esc(insight.headline)}</h3><p>${esc(insight.summary)}</p>${findings ? `<ul>${findings}</ul>` : ''}${insight.action ? `<div class="aiq-action"><b>권장 액션</b> · ${esc(insight.action)}</div>` : ''}${insight.caveat ? `<div class="aiq-caveat">${esc(insight.caveat)}</div>` : ''}</div><details class="aiq-evidence"><summary>근거 데이터 보기</summary><div class="aiq-evidence-body">${renderEvidence(snapshot.evidence)}</div></details>`;
}

function makeSnapshot(question, insight, evidence, provider) {
  return cleanSnapshot({id: `ai${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`, created: new Date().toISOString(), question, provider, insight, evidence});
}

function finishAnswer(answer, question, result, dash, insight, provider, fallbackMessage = '') {
  const snapshot = makeSnapshot(question, insight, buildEvidence(result, dash), provider);
  AI_LIVE.set(snapshot.id, snapshot);
  answer.className = 'aiq-answer';
  answer.innerHTML = `${fallbackMessage ? `<div class="aiq-fallback">${esc(fallbackMessage)}</div>` : ''}${renderSnapshot(snapshot, true)}`;
  return snapshot;
}

const REMOTE_PENDING = new Map();
const REMOTE_HISTORY = [];

function questionDefaults(dash) {
  const productFilters = typeof dash.productQuestionFilters === 'function' ? dash.productQuestionFilters() : {};
  return {
    metrics: dash.METRICS,
    channels: dash.selChans(),
    segments: dash.selSegs(),
    availableChannels: dash.CHS,
    ...productFilters,
  };
}

function appendLocalAnswer(answer, text, dash, defaults, fallbackMessage) {
  try {
    const parsed = parseQuestion(text, defaults);
    const result = analyze(parsed, dash);
    finishAnswer(answer, text, result, dash, fallbackInsight(result), 'local', fallbackMessage);
    return parsed;
  } catch (error) {
    answer.className = 'aiq-answer aiq-error';
    answer.textContent = error && error.message ? error.message : '질문을 해석하지 못했습니다. 날짜와 조건을 확인해 주세요.';
    return null;
  }
}

function receiveRemote(response) {
  if (!response || typeof response !== 'object') return;
  const pending = REMOTE_PENDING.get(response.id);
  if (!pending) return;
  REMOTE_PENDING.delete(response.id);
  const {answer, text, dash, defaults, thread} = pending;
  if (pending.phase === 'insight') {
    if (response.ok) {
      const insight = cleanInsight(response.insight);
      if (insight.headline && insight.summary) finishAnswer(answer, text, pending.result, dash, insight, 'gemini');
      else finishAnswer(answer, text, pending.result, dash, fallbackInsight(pending.result), 'local', 'Gemini 인사이트 응답이 비어 기존 산식 요약을 표시합니다.');
    } else finishAnswer(answer, text, pending.result, dash, fallbackInsight(pending.result), 'local', response.message || 'Gemini 인사이트 연결이 원활하지 않아 기존 산식 요약을 표시합니다.');
    thread.scrollTop = thread.scrollHeight;
    return;
  }
  if (!response.ok) {
    appendLocalAnswer(answer, text, dash, defaults, response.message || 'Gemini 연결이 원활하지 않아 기존 질문 해석으로 처리했습니다.');
  } else {
    try {
      const parsed = normalizeRemoteQuery(response.query, defaults);
      if (parsed.action === 'clarify') {
        answer.className = 'aiq-answer';
        answer.innerHTML = `<div class="aiq-clarify"><b>조건 확인</b><p>${esc(parsed.clarification)}</p></div>`;
      } else {
        const result = analyze(parsed, dash);
        REMOTE_HISTORY.push({question: text, query: {events: parsed.events, metrics: parsed.metrics, families: parsed.families, channels: parsed.channels, segments: parsed.segments, bpus: parsed.bpus, categories: parsed.categories}});
        if (REMOTE_HISTORY.length > 3) REMOTE_HISTORY.shift();
        const bridge = root.FP_GEMINI_BRIDGE;
        if (!bridge || typeof bridge.request !== 'function') finishAnswer(answer, text, result, dash, fallbackInsight(result), 'local', 'Gemini 인사이트 연결이 없어 기존 산식 요약을 표시합니다.');
        else {
          const id = `gemini-insight-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
          answer.className = 'aiq-answer aiq-pending';
          answer.textContent = 'Gemini가 계산 근거를 바탕으로 인사이트를 작성하고 있습니다…';
          REMOTE_PENDING.set(id, {phase: 'insight', answer, text, dash, defaults, thread, result});
          try { bridge.request({id, type: 'gemini_insight', question: text, evidence: buildEvidence(result, dash)}); }
          catch (error) { REMOTE_PENDING.delete(id); finishAnswer(answer, text, result, dash, fallbackInsight(result), 'local', 'Gemini 인사이트 연결이 원활하지 않아 기존 산식 요약을 표시합니다.'); }
        }
      }
    } catch (error) {
      appendLocalAnswer(answer, text, dash, defaults, 'Gemini 조건 검증에 실패해 기존 질문 해석으로 처리했습니다.');
    }
  }
  thread.scrollTop = thread.scrollHeight;
}

function pageItems(total) {
  const pages = Math.max(1, Math.ceil(total / AI_PAGE_SIZE));
  if (pages <= 7) return Array.from({length: pages}, (_, index) => index + 1);
  const selected = [...new Set([1, pages, AI_PAGE - 1, AI_PAGE, AI_PAGE + 1])].filter(page => page >= 1 && page <= pages).sort((a, b) => a - b);
  const out = [];
  selected.forEach((page, index) => { if (index && page - selected[index - 1] > 1) out.push('gap'); out.push(page); });
  return out;
}

function renderSaved() {
  if (typeof document === 'undefined') return;
  const count = document.getElementById('aiSavedCount'), list = document.getElementById('aiSavedList'), pagesEl = document.getElementById('aiSavedPages');
  if (!count || !list || !pagesEl) return;
  const all = root.FP_AI_INSIGHTS.all().sort((a, b) => String(b.created).localeCompare(String(a.created)));
  const pages = Math.max(1, Math.ceil(all.length / AI_PAGE_SIZE)); AI_PAGE = Math.min(Math.max(1, AI_PAGE), pages);
  count.textContent = String(all.length);
  const visible = all.slice((AI_PAGE - 1) * AI_PAGE_SIZE, AI_PAGE * AI_PAGE_SIZE);
  const dateText = value => { const d = new Date(value); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('ko-KR', {dateStyle: 'short', timeStyle: 'short'}); };
  list.innerHTML = visible.length ? visible.map(item => `<details class="aiq-saved-item"><summary><span class="aiq-saved-q">${esc(item.question)}</span><span class="aiq-saved-t">${esc(item.insight.headline)}</span><span class="aiq-saved-d">${esc(dateText(item.created))}</span></summary><div class="aiq-saved-body"><div class="aiq-saved-tools"><button class="aiq-delete" type="button" data-ai-delete="${esc(item.id)}">삭제</button></div>${renderSnapshot(item, false)}</div></details>`).join('') : '<div class="memo-empty">저장한 인사이트가 없습니다.</div>';
  pagesEl.hidden = all.length <= AI_PAGE_SIZE;
  pagesEl.innerHTML = pagesEl.hidden ? '' : `<button class="aiq-page" type="button" data-ai-page="prev"${AI_PAGE === 1 ? ' disabled' : ''}>이전</button>${pageItems(all.length).map(page => page === 'gap' ? '<span class="aiq-page-gap">…</span>' : `<button class="aiq-page" type="button" data-ai-page="${page}"${page === AI_PAGE ? ' aria-current="page"' : ''}>${page}</button>`).join('')}<button class="aiq-page" type="button" data-ai-page="next"${AI_PAGE === pages ? ' disabled' : ''}>다음</button>`;
}

function setConnectionStatus(status) {
  if (typeof document === 'undefined') return;
  const label = document.getElementById('aiQuestionStatus');
  const hint = document.getElementById('aiQuestionHint');
  const message = status && status.message ? status.message : 'Gemini 상태 확인 중';
  if (label) label.textContent = message;
  if (hint) hint.textContent = status && status.ok
    ? 'Enter 전송 · Shift+Enter 줄바꿈 · 질문과 계산 근거 요약만 Gemini 전송 · 실적 원본 미전송'
    : 'Enter 전송 · Shift+Enter 줄바꿈 · Gemini 장애 시 기존 해석으로 자동 전환';
}

function mount(dash) {
  if (typeof document === 'undefined') return;
  const section = document.getElementById('aiQuestionSec');
  const input = document.getElementById('aiQuestionInput');
  const send = document.getElementById('aiQuestionSend');
  const thread = document.getElementById('aiQuestionThread');
  const savedToggle = document.getElementById('aiSavedToggle'), savedPanel = document.getElementById('aiSavedPanel'), savedList = document.getElementById('aiSavedList'), savedPages = document.getElementById('aiSavedPages');
  if (!section || !input || !send || !thread || !savedToggle || !savedPanel || !savedList || !savedPages || section.dataset.mounted) return;
  section.dataset.mounted = 'true';
  section.hidden = false;
  if (!root.FP_GEMINI_BRIDGE || !root.FP_GEMINI_BRIDGE.ready) {
    setConnectionStatus({ok: false, message: '기존 질문 해석 사용'});
  }
  const submit = () => {
    const text = input.value.trim();
    if (!text) return;
    const user = document.createElement('div');
    user.className = 'aiq-user'; user.textContent = text; thread.appendChild(user);
    const answer = document.createElement('div');
    const defaults = questionDefaults(dash);
    const bridge = root.FP_GEMINI_BRIDGE;
    thread.appendChild(answer);
    if (bridge && bridge.ready && typeof bridge.request === 'function') {
      const id = `gemini-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      answer.className = 'aiq-answer aiq-pending';
      answer.textContent = 'Gemini가 질문을 대시보드 조회조건으로 해석하고 있습니다…';
      REMOTE_PENDING.set(id, {phase: 'query', answer, text, dash, defaults, thread});
      try {
        bridge.request({
          id, type: 'gemini_query', question: text,
          context: {...defaults, dataFirst: dash.dataFirst, dataLast: dash.dataLast, history: REMOTE_HISTORY.slice()},
        });
      } catch (error) {
        REMOTE_PENDING.delete(id);
        appendLocalAnswer(answer, text, dash, defaults, 'Gemini 연결이 원활하지 않아 기존 질문 해석으로 처리했습니다.');
      }
    } else {
      appendLocalAnswer(answer, text, dash, defaults, '');
    }
    input.value = '';
    thread.scrollTop = thread.scrollHeight;
  };
  send.addEventListener('click', submit);
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit(); }
  });
  thread.addEventListener('click', event => {
    const button = event.target.closest('[data-ai-save]'); if (!button) return;
    const snapshot = AI_LIVE.get(button.dataset.aiSave); if (!snapshot) return;
    root.FP_AI_INSIGHTS.add(snapshot); button.textContent = '저장됨'; button.disabled = true; AI_PAGE = 1; renderSaved();
  });
  savedToggle.addEventListener('click', () => { const open = savedPanel.hidden; savedPanel.hidden = !open; savedToggle.setAttribute('aria-expanded', String(open)); if (open) { AI_PAGE = 1; renderSaved(); } });
  savedList.addEventListener('click', event => { const button = event.target.closest('[data-ai-delete]'); if (!button) return; root.FP_AI_INSIGHTS.remove(button.dataset.aiDelete); renderSaved(); });
  savedPages.addEventListener('click', event => {
    const button = event.target.closest('[data-ai-page]'); if (!button || button.disabled) return;
    const total = Math.max(1, Math.ceil(root.FP_AI_INSIGHTS.all().length / AI_PAGE_SIZE));
    AI_PAGE = button.dataset.aiPage === 'prev' ? Math.max(1, AI_PAGE - 1) : button.dataset.aiPage === 'next' ? Math.min(total, AI_PAGE + 1) : Number(button.dataset.aiPage) || 1;
    renderSaved();
  });
  renderSaved();
}

root.FP_AI_QUESTION = {parseQuestion, normalizeRemoteQuery, weekPeriod, buildPeriods, estimateAction, analyze, receiveRemote, setConnectionStatus, mount, renderSaved, buildEvidence};
})(typeof window !== 'undefined' ? window : globalThis);
