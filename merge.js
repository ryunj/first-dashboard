// 첫구매 대시보드 — 새 raw(태블로 crosstab CSV 등)를 지금 보고 있는 데이터(data.js 또는 불러온 백업)에 합친다.
// build_data.py 의 파일 판별 · 집계 규칙을 브라우저로 옮긴 것이다. 규칙을 바꾸면 두 파일을 같이 고칠 것.
//
//   FP_MERGE.merge({data, kpi, prod}, files) → Promise<{data, kpi, prod, log, summary}>
//     data = data.js 의 DASH_DATA 형태 · prod = products.js 의 DASH_PROD 형태 (없으면 null)
//     files = File 목록 (CSV · 폴더째 골라도 됨). 같은 날짜 · 주차 값은 새 파일 값으로 바뀌고, None(빈 칸)은 기존 값을 지우지 않는다.
//
// 상품 구성: 새 파일에 든 날짜는 그날 상품 행을 통째로 바꾼다(build_data.py 와 같음). 모든 상품을 개별로 보관하는 백업(topN 없음)이면 새 상품도 모두 개별.
//   예전 백업(브랜드별 연간 상위 N 만 개별)이면 이미 합쳐진 이력을 다시 풀 수 없어 이미 개별인 상품 + 빈 자리 · 기준을 넘는 새 상품만 개별로 둔다(합계는 정확).
// 커버리지(상품관점 실측)는 [거래액, 고객수, 상품UV] — 예전 백업(상품UV 없음)은 UV 0 으로 채운다.
(function () {
'use strict';

const CHANNEL_ORDER = ['*TOTAL', '직접', '광고', 'EP', 'PUSH', '제휴', '브랜드광고', '미디어커머스'];
const MEMBER = {'*TOTAL': 'T', '1_당월신규': '1', '2_기가입신규': '2', '3_기존': '3'};
const OVERALL_METRIC = {'일평균거래액': 'amt', '일평균고객수': 'cust'};
const SIMPLE_FILES = [['당일가입 첫구매율', 'cr'], ['첫구매율', 'fpr'], ['비회원 트래픽', 'tr'], ['비회원트래픽', 'tr'], ['가입자수', 'sg']];
const RATE_TO_COUNT = [['cr', 'sg', 'crn'], ['fpr', 'tr', 'fpn']];
const PRODUCT_TABLE_KEY = '조직 카테고리별', PRODUCT_CSV_KEY = '상품관점';
const PRODUCT_COLS = [['date', '결제_일자'], ['bpu', 'BPU'], ['ch', 'AF대분류'], ['cat', '대카테고리'], ['brand', '브랜드'],
                      ['code', '상품코드'], ['name', '상품명'], ['amt', '거래액'], ['cust', '주문고객수']];
const NEWMEMBER_KEY = '신규회원실적대시보드';
const NEWMEMBER_METRICS = {'총)첫구매 거래액 (당년신규)': 'nya', '총)첫구매 고객수 (당년신규)': 'nyc',
                           '순)첫구매 거래액 (당년신규)': 'nyna', '순)첫구매 고객수 (당년신규)': 'nync'};
const APP_KEY = 'APP설치';
const APP_COLS = {'전체 설치': 'all', '신규 설치': 'new', '재설치': 're', '스토어 방문': 'visit', '삭제': 'del', 'Push 활성 기기': 'pushdev', '순증 설치': 'net'};
const PUSH_KEY = 'PUSH';
const PUSH_SEG = {'기존': 'ex', '신규': 'ny', 'Total': 'tot'};
const PUSH_ITEM = {'수신동의': 'stock', '증감': 'chg', '신규추가(+)': 'add', '기존이탈(-)': 'out'};
const MEMBER_STATUS_KEY = '회원현황';
const MEMBER_STATUS = {'누적회원수(천)': 'cum', '신규회원수': 'new', '유효회원수': 'valid'};
const CHANNEL_BASES = new Set(['amt', 'cust', 'tr', 'sg', 'cr', 'fpr', 'nya', 'nyc', 'nyna', 'nync']);
const WEEKDAY_KO = '월화수목금토일';
const MALL_EXISTING_SHARE = 0.7;
const YEAR_RE = /^\d{4}$/, DATE_RE = /^(\d{1,2})\/(\d{1,2})$/, WEEK_RE = /^(\d{1,2})월\s*(\d)주차$/;

/* ---------- 날짜 ---------- */
const DAY = 864e5;
const pad = n => String(n).padStart(2, '0');
const toUTC = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const ymd = t => new Date(t).toISOString().slice(0, 10);
const addDays = (s, n) => ymd(toUTC(s) + n * DAY);
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const nowText = () => { const d = new Date(); return `${localToday()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
function isoDate(y, m, d) {
  const t = Date.UTC(y, m - 1, d), x = new Date(t);
  return x.getUTCFullYear() === y && x.getUTCMonth() === m - 1 && x.getUTCDate() === d ? ymd(t) : null;
}
function isoWeekOf(s) {  // ISO 주 — 그 주 목요일의 연도 · 주번호
  const t = toUTC(s), dow = (new Date(t).getUTCDay() + 6) % 7, th = t + (3 - dow) * DAY, ty = new Date(th).getUTCFullYear();
  return {y: ty, w: 1 + Math.floor((th - Date.UTC(ty, 0, 1)) / DAY / 7)};
}
function isoMonday(y, w) {
  const j4 = Date.UTC(y, 0, 4), dow = (new Date(j4).getUTCDay() + 6) % 7;
  return ymd(j4 - dow * DAY + (w - 1) * 7 * DAY);
}
const WEEK_MAPS = new Map();
function isoWeekMap(y) {  // (월, n주차) → {w, monday} · 라벨의 월 = 그 주 목요일이 속한 달 (build_data.iso_week_map)
  if (!WEEK_MAPS.has(y)) {
    const out = new Map(), seen = {}, weeks = isoWeekOf(`${y}-12-28`).w;
    for (let w = 1; w <= weeks; w++) {
      const mon = isoMonday(y, w), m = +addDays(mon, 3).slice(5, 7);
      seen[m] = (seen[m] || 0) + 1;
      out.set(`${m}-${seen[m]}`, {w, monday: mon});
    }
    WEEK_MAPS.set(y, out);
  }
  return WEEK_MAPS.get(y);
}

/* ---------- 파일 읽기 ---------- */
async function readText(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  if (buf.length >= 5 && String.fromCharCode(...buf.subarray(0, 5)) === 'SCDSA') throw new Error('DRM 암호화 파일(SCDSA) — DRM 해제 후 올려 주세요');
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder('utf-16le').decode(buf.subarray(2));
  if (buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder('utf-16be').decode(buf.subarray(2));
  try { return new TextDecoder('utf-8', {fatal: true}).decode(buf).replace(/^﻿/, ''); }
  catch (e) { return new TextDecoder('euc-kr').decode(buf); }
}
function parseCsv(text) {  // 파이썬 csv.reader(기본 방언) 와 같게 — 따옴표는 칸 맨 앞에서만, "" 는 따옴표 하나
  const head = text.split('\n', 1)[0];
  const delim = head.split('\t').length >= head.split(',').length ? '\t' : ',';
  const rows = [];
  let row = [], cell = '', quoted = false, inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuote) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQuote = false; } else cell += ch;
      continue;
    }
    if (ch === '"' && cell === '' && !quoted) { inQuote = quoted = true; continue; }
    if (ch === delim) { row.push(cell); cell = ''; quoted = false; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = ''; quoted = false;
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.map(r => (r.length === 1 && r[0] === '' ? [] : r.map(c => c.trim())));
}
function toNum(s) {
  s = String(s == null ? '' : s).replace(/,/g, '').trim();
  if (s === '' || s === '-') return null;
  const pct = s.endsWith('%'), t = pct ? s.slice(0, -1) : s;
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return null;
  const v = parseFloat(t);
  return pct ? v / 100 : v;
}
function roundTo(v, dp) {  // 파이썬 round() 처럼 딱 .5 이면 짝수 쪽으로
  const f = 10 ** dp, x = v * f, r = Math.round(x);
  return (Math.abs(x % 1) === 0.5 ? (r % 2 === 0 ? r : r - 1) : r) / f;
}
function roundKey(key, v) {  // build_data._round
  if (v == null) return null;
  const base = key.split('|')[0];
  if (base === 'amt' || base === 'nya' || base === 'nyna') return roundTo(v, 0);
  if (base === 'crn' || base === 'fpn' || base === 'cust') return roundTo(v, 3);
  return roundTo(v, 2);
}

/* ---------- raw 해석 (build_data.py 와 같은 규칙) ---------- */
function put(S, kind, key, period, value) {
  if (period == null) return;
  let ser = S[kind].get(key);
  if (!ser) S[kind].set(key, ser = new Map());
  if (value !== null || !ser.has(period)) ser.set(period, value);
}
function parseCrosstab(rows) {
  const first = (rows[0] || []).findIndex(v => YEAR_RE.test(v));
  if (first < 0) throw new Error('연도 헤더 행이 없음');
  let hr = -1;
  for (let i = 0; i < Math.min(6, rows.length); i++) {
    const v = rows[i].length > first ? rows[i][first] : '';
    if (DATE_RE.test(v) || WEEK_RE.test(v)) { hr = i; break; }
  }
  if (hr < 0) throw new Error('날짜/주차 헤더 행이 없음');
  const kind = DATE_RE.test(rows[hr][first]) ? 'daily' : 'weekly';
  const periods = [];
  for (let c = first; c < rows[hr].length; c++) {
    const y = c < rows[0].length ? rows[0][c] : '', m = (kind === 'daily' ? DATE_RE : WEEK_RE).exec(rows[hr][c]);
    if (!YEAR_RE.test(y) || !m) periods.push(null);
    else if (kind === 'daily') periods.push(isoDate(+y, +m[1], +m[2]));
    else periods.push(`${+y}-${+m[1]}-${+m[2]}`);
  }
  if (kind === 'weekly' && hr + 1 < rows.length) {
    // 진행 중인 주('일마감') — 같은 주차 라벨의 지난 연도 열도 그 요일까지만 잘려 나온다 → 최근 연도 열만 쓰고 나머지 연도는 버린다(기존 완결 값 유지)
    const flags = rows[hr + 1], part = [];
    for (let c = first; c < rows[hr].length; c++) if (c < flags.length && flags[c] === '일마감' && periods[c - first]) part.push(periods[c - first].split('-').map(Number));
    if (part.length) {
      const latest = Math.max(...part.map(p => p[0])), labels = new Set(part.map(p => `${p[1]}-${p[2]}`));
      for (let j = 0; j < periods.length; j++) {
        if (!periods[j]) continue;
        const [y, m, n] = periods[j].split('-').map(Number);
        if (labels.has(`${m}-${n}`) && y !== latest) periods[j] = null;
      }
    }
  }
  const records = [];
  for (const r of rows.slice(hr + 1)) {
    const cells = r.slice(first);
    if (!cells.some(c => /\d/.test(c))) continue;  // 요일 · 주마감 헤더 행
    records.push([r.slice(0, first), cells.map(toNum)]);
  }
  return {kind, periods, records};
}
function inferMdDates(labels, weekdays) {  // 연도 없는 'M/D' — 마지막 열을 오늘 이전 가장 가까운 날짜로 보고 뒤에서부터 연도를 붙인다
  const out = new Array(labels.length).fill(null);
  let nxt = addDays(localToday(), 1);
  for (let i = labels.length - 1; i >= 0; i--) {
    const m = DATE_RE.exec(labels[i]);
    if (!m) continue;
    const ny = +nxt.slice(0, 4);
    let c = null;
    for (const y of [ny, ny - 1, ny - 2]) {
      const x = isoDate(y, +m[1], +m[2]);
      if (!x) continue;
      c = x;
      if (x < nxt) break;
    }
    if (!c) continue;
    out[i] = c;
    nxt = c;
  }
  let warn = '';
  if (weekdays) {
    const bad = out.filter((d, i) => d && weekdays[i] && weekdays[i].replace(/[()]/g, '') && WEEKDAY_KO[(new Date(toUTC(d)).getUTCDay() + 6) % 7] !== weekdays[i].replace(/[()]/g, ''));
    if (bad.length) warn = ` · ⚠ 요일이 맞지 않는 날짜 ${bad.length}개(예: ${bad.slice(0, 3).join(', ')})`;
  }
  return {dates: out, warn};
}
const span = ds => { const v = ds.filter(Boolean); return v.length ? `${v[0]} ~ ${v[v.length - 1]}` : '날짜 없음'; };

function loadNewmember(rows, S) {
  const head = rows[0];
  const first = head.findIndex(h => /^\d{4}\.\s*\d/.test(h));
  const colMet = head.indexOf('지표'), colAge = head.indexOf('연령대'), colCh = head.indexOf('채널');
  if (first < 0 || colMet < 0 || colAge < 0 || colCh < 0) throw new Error('지표 · 연령대 · 채널 · 날짜 열을 찾지 못함');
  const dates = head.slice(first).map(h => { const m = /^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/.exec(h); return m ? isoDate(+m[1], +m[2], +m[3]) : null; });
  let n = 0;
  for (const r of rows.slice(1)) {
    const base = r.length > first ? NEWMEMBER_METRICS[r[colMet]] : null;
    if (!base || r[colAge] !== 'Total') continue;
    const ch = r[colCh] === 'Total' ? '*TOTAL' : r[colCh];
    r.slice(first).forEach((v, j) => put(S, 'daily', `${base}|${ch}`, dates[j], toNum(v)));
    n++;
  }
  return `일별 신규회원 당년신규 첫구매 ${n}행 (${span(dates)})`;
}
function loadMemberStatus(rows, S) {
  const wd = rows.length > 1 && rows[1].slice(1, 4).some(c => c.startsWith('(')) ? rows[1].slice(1) : null;
  const {dates, warn} = inferMdDates(rows[0].slice(1), wd);
  const data = {};
  for (const r of rows.slice(1)) if (r.length && Object.prototype.hasOwnProperty.call(MEMBER_STATUS, r[0])) data[MEMBER_STATUS[r[0]]] = r.slice(1).map(toNum);
  // 아직 갱신되지 않은 날은 0으로 내보낸다 → 세 값이 모두 0 · 빈 칸인 날은 건너뛴다
  const empty = new Set(dates.map((_, j) => j).filter(j => Object.values(data).every(vals => !(j < vals.length ? vals[j] : null))));
  for (const [key, vals] of Object.entries(data)) vals.forEach((v, j) => { if (j < dates.length && !empty.has(j)) put(S, 'daily', `mem|${key}`, dates[j], v); });
  const skipped = [...empty].sort((a, b) => a - b).map(j => dates[j]);
  return `일별 회원현황 ${Object.keys(data).length}행 (${span(dates)})${skipped.length ? ` · 값이 모두 0인 날 제외 ${skipped.join(', ')}` : ''}${warn}`;
}
function loadPush(rows, S) {
  const hr = rows.slice(0, 5).findIndex(r => r.some(c => DATE_RE.test(c)));
  if (hr < 0) throw new Error('날짜(M/D) 행을 찾지 못함');
  const first = rows[hr].findIndex(c => DATE_RE.test(c));
  const {dates} = inferMdDates(rows[hr].slice(first));
  const data = new Map();
  for (const r of rows.slice(hr + 1)) {
    const seg = r.length ? PUSH_SEG[r[0]] : null, item = r.length > 1 ? PUSH_ITEM[r[1]] : null;
    if (!seg || !item) continue;
    const vals = r.slice(first).map(toNum);
    while (vals.length < dates.length) vals.push(null);
    data.set(`${seg}_${item}`, vals);
  }
  const at = (k, j) => (data.get(`tot_${k}`) || [])[j] ?? null;
  const bad = [];
  dates.forEach((day, j) => {
    if (!day) return;
    const stock = at('stock', j), chg = at('chg', j), add = at('add', j), out = at('out', j);
    if (day.endsWith('-01-01')) {  // 연초 재분류 — 추가 · 이탈만 비운다
      for (const [k, vals] of data) if (k.endsWith('_add') || k.endsWith('_out')) vals[j] = null;
    } else if (stock === 0) {  // 원천 오류: 재고 0 · 전원 이탈 → 그날 전부 제외
      bad.push(day);
      for (const vals of data.values()) vals[j] = null;
    } else if ((chg !== null && stock && chg === stock) || (add === 0 && out === 0)) {  // 증감 칸에 재고 값 · 흐름 모두 0 → 흐름 제외
      bad.push(day);
      for (const [k, vals] of data) if (!k.endsWith('_stock')) vals[j] = null;
    }
  });
  for (const [k, vals] of data) vals.forEach((v, j) => { if (j < dates.length) put(S, 'daily', `push|${k}`, dates[j], v); });
  return `일별 앱푸시 수신동의 ${data.size}행 (${span(dates)})${bad.length ? ` · 흐름 원천 오류로 제외한 날 ${bad.join(', ')}` : ''}`;
}
function loadApp(rows, S) {
  const header = (rows[0] || []).map(h => String(h || '').trim());
  const asDay = v => { const m = /^(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})/.exec(String(v || '')); return m ? isoDate(+m[1], +m[2], +m[3]) : null; };
  const dateCol = header.findIndex((h, i) => h === '날짜' && rows.slice(1, 6).some(r => r.length > i && asDay(r[i])));
  if (dateCol < 0) throw new Error('날짜 열(YYYY-MM-DD)을 찾지 못함');
  const cols = Object.entries(APP_COLS).filter(([h]) => header.includes(h)).map(([h, key]) => [key, header.indexOf(h)]);
  const seen = new Map();
  let dup = 0;
  for (const r of rows.slice(1)) {
    const day = r.length > dateCol ? asDay(r[dateCol]) : null;
    if (!day) continue;
    if (seen.has(day)) dup++;
    seen.set(day, cols.map(([, i]) => r[i]));  // 같은 날짜가 또 나오면 뒤 행
  }
  for (const [day, vals] of seen) cols.forEach(([key], j) => put(S, 'daily', `app|${key}`, day, vals[j] == null || vals[j] === '' ? null : toNum(vals[j])));
  const days = [...seen.keys()].sort();
  return `일별 앱 설치 ${days.length}일 (${span(days)})${dup ? ` · 중복 날짜 ${dup}건은 뒤 행 사용` : ''}`;
}
function overallIsFirstPurchase(records) {
  const total = group => records.reduce((a, [labels, vals]) => a + (labels[0] === '일평균거래액' && labels[1] === group && labels[2] === '*TOTAL'
    ? vals.reduce((s, v) => s + (v || 0), 0) : 0), 0);
  const tot = total('*TOTAL'), share = tot ? total('3_기존') / tot : null;
  return {looks: share !== null && share <= MALL_EXISTING_SHARE, share};
}
function loadSeriesFile(stem, rows, S) {  // build_data.load_file (상품 파일은 따로)
  if (stem.includes(NEWMEMBER_KEY)) return loadNewmember(rows, S);
  if (stem.includes(MEMBER_STATUS_KEY)) return loadMemberStatus(rows, S);
  if (stem.toUpperCase().startsWith(PUSH_KEY)) return loadPush(rows, S);
  if (stem.includes(APP_KEY)) return loadApp(rows, S);
  const {kind, periods, records} = parseCrosstab(rows);
  const kindKo = kind === 'daily' ? '일별' : '주별', range = span(kind === 'daily' ? periods : periods.map(p => p && p.replace(/^(\d+)-(\d+)-(\d+)$/, '$1년 $2월 $3주')));
  if (stem.includes('전체관점')) {
    const {looks, share} = overallIsFirstPurchase(records), named = stem.includes('첫구매');
    if (!(named || looks)) return null;  // MALL 전체 거래액
    let n = 0;
    for (const [labels, vals] of records) {
      const met = OVERALL_METRIC[labels[0]], grp = labels.length > 2 ? MEMBER[labels[1]] : undefined;
      if (!met || grp === undefined) continue;
      vals.forEach((v, j) => put(S, kind, `${met}|${grp}|${labels[2]}`, periods[j], v));
      n++;
    }
    const note = named !== looks ? ` · 파일명과 내용이 달라 ${looks ? '내용' : '파일명'} 기준 첫구매로 읽음(기존회원 비중 ${Math.round(share * 100)}%)` : '';
    return `${kindKo} 전체관점(첫구매) ${n}행 (${range})${note}`;
  }
  const hit = SIMPLE_FILES.find(([kw]) => stem.includes(kw));
  if (!hit) return null;
  for (const [labels, vals] of records) vals.forEach((v, j) => put(S, kind, `${hit[1]}|${labels[0]}`, periods[j], v));
  return `${kindKo} ${hit[1]} ${records.length}행 (${range})`;
}
function readCoverage(rows, name) {  // 상품관점 일자별 CSV → Map('날짜|채널|BPU' → [거래액, 고객수])
  const {kind, periods, records} = parseCrosstab(rows);
  const out = new Map();
  if (kind !== 'daily') return {out, note: '주별 — 상품 커버리지는 일자별 파일만 씀'};
  const total = member => records.reduce((a, [l, vals]) => a + (l[0] === '일평균거래액' && l[1] === member && l[2] === '*TOTAL' && l[3] === '*TOTAL' && l[4] === '*TOTAL'
    ? vals.reduce((s, v) => s + (v || 0), 0) : 0), 0);
  const whole = total('*TOTAL'), existing = total('3_기존');
  if (whole && existing / whole > MALL_EXISTING_SHARE) return {out, note: `기존회원 거래액 비중 ${Math.round(existing / whole * 100)}% → MALL 전체 파일로 보고 뺌`};
  for (const [labels, vals] of records) {
    const met = {'일평균거래액': 0, '일평균고객수': 1, '상품UV': 2}[labels[0]];
    if (met === undefined || labels.length < 5 || labels[1] !== '*TOTAL' || labels[4] !== '*TOTAL') continue;
    vals.forEach((v, j) => {
      if (periods[j] == null || v === null) return;
      const key = `${periods[j]}|${labels[2]}|${labels[3]}`;
      const o = out.get(key) || [0, 0, 0];
      o[met] = v;
      out.set(key, o);
    });
  }
  return {out, note: `상품 커버리지 ${out.size.toLocaleString()}칸 (${span(periods)})`};
}
function productRows(header, rows) {  // build_data._product_rows
  header = header.map(h => String(h || '').trim());
  const col = {};
  for (const [k, kw] of PRODUCT_COLS) {
    const i = header.findIndex(h => h.includes(kw));
    if (i < 0) throw new Error(`필요한 열을 찾지 못함: ${kw}`);
    col[k] = i;
  }
  const need = Math.max(...Object.values(col)), out = [];
  for (const r of rows) {
    if (r.length <= need) continue;
    const ds = String(r[col.date] || '').replace(/-/g, '').slice(0, 8);
    if (!/^\d+$/.test(ds)) continue;
    const text = (k, def) => (r[col[k]] !== '' && r[col[k]] != null ? String(r[col[k]]).trim() : def);
    out.push([`${ds.slice(0, 4)}-${ds.slice(4, 6)}-${ds.slice(6, 8)}`, text('bpu', '(미지정)'), text('ch', '미분류'), text('cat', '(미지정)'),
              text('brand', '(미지정)'), text('code', '(코드없음)'), text('name', ''), toNum(r[col.amt]) || 0, toNum(r[col.cust]) || 0]);
  }
  return out;
}

/* ---------- 합치기: 실적 시리즈 ---------- */
const emptyData = () => ({meta: {built: '', sources: [], lastDate: null, channels: []}, daily: {p: [], s: {}}, weekly: {p: [], s: {}}});
function mergeSeries(base, S, sources) {
  const D0 = base.daily, W0 = base.weekly;
  const stats = {newDates: [], filledDates: 0, changedCells: 0, changedEx: [], newWeeks: 0, updatedWeeks: 0, warn: []};
  const note = (key, p, oldV, newV) => {
    if (oldV == null || newV == null || Math.abs(oldV - newV) <= Math.max(1e-9, Math.abs(oldV) * 1e-9)) return;
    stats.changedCells++;
    if (stats.changedEx.length < 5) stats.changedEx.push(`${key} ${p}: ${oldV} → ${newV}`);
  };
  // 일별 — 기존 값을 Map 으로 펼치고 새 값을 덮는다 (빈 칸은 기존 값 유지)
  const dSer = new Map(Object.entries(D0.s).map(([k, arr]) => [k, new Map(D0.p.map((p, i) => [p, arr[i]]))]));
  const setVal = (ser, key, p, v, rounded) => {
    let tgt = ser.get(key);
    if (!tgt) ser.set(key, tgt = new Map());
    if (v === null) { if (!tgt.has(p)) tgt.set(p, null); return; }
    note(key, p, tgt.get(p), rounded);
    tgt.set(p, rounded);
  };
  const incomingDates = new Set();
  for (const [key, ser] of S.daily) {
    const b = key.split('|')[0];
    for (const [p, v] of ser) if (v !== null) incomingDates.add(p);
    if (b === 'cr' || b === 'fpr') continue;
    for (const [p, v] of ser) setVal(dSer, key, p, v, roundKey(key, v));
  }
  for (const [rate, den, name] of RATE_TO_COUNT) for (const [key, ser] of S.daily) {  // 비율 → 개수(분모 × 비율)
    if (!key.startsWith(rate + '|')) continue;
    const ch = key.slice(rate.length + 1), dser = dSer.get(`${den}|${ch}`), out = `${name}|${ch}`;
    for (const [p, r] of ser) {
      const dv = dser ? dser.get(p) : null;
      setVal(dSer, out, p, r === null || dv == null ? null : r * dv, r === null || dv == null ? null : roundKey(out, r * dv));
    }
  }
  const oldDates = new Set(D0.p);
  const dates = [...new Set([...D0.p, ...incomingDates])].sort();
  stats.newDates = dates.filter(p => !oldDates.has(p));
  stats.filledDates = [...incomingDates].filter(p => oldDates.has(p)).length;
  const last = dates.length ? dates[dates.length - 1] : null;
  const dailyS = {};
  for (const key of [...dSer.keys()].sort()) {
    const ser = dSer.get(key), arr = dates.map(p => (ser.has(p) ? ser.get(p) : null));
    if (arr.some(v => v !== null)) dailyS[key] = arr;
  }

  // 주별 — 주 합계로 저장(거래액 · 고객수 = 일평균 × 일수), 트래픽은 tru · 첫구매율 분자는 fpnu
  const wk = p => `${p.y}-${p.m}-${p.n}`;
  const wSer = new Map(Object.entries(W0.s).map(([k, arr]) => [k, new Map(W0.p.map((p, i) => [wk(p), arr[i]]))]));
  const wMeta = new Map(W0.p.map(p => [wk(p), {...p}]));
  const incomingWeeks = new Set();
  for (const ser of S.weekly.values()) for (const [p, v] of ser) if (v !== null) incomingWeeks.add(p);
  for (const k of incomingWeeks) {
    const [y, m, n] = k.split('-').map(Number), cal = isoWeekMap(y).get(`${m}-${n}`);
    if (!cal) { stats.warn.push(`${y}년 ${m}월 ${n}주차는 ISO 달력에 없음 — 제외`); continue; }
    let d = 7;
    if (last && cal.monday <= last && last <= addDays(cal.monday, 6)) d = Math.round((toUTC(last) - toUTC(cal.monday)) / DAY) + 1;  // 진행 중인 주
    if (wMeta.has(k)) stats.updatedWeeks++; else stats.newWeeks++;
    wMeta.set(k, {y, m, n, w: cal.w, start: cal.monday, d});
  }
  const RENAME = {tr: 'tru', fpn: 'fpnu'};
  const wName = key => { const i = key.indexOf('|'), b = key.slice(0, i); return (RENAME[b] || b) + key.slice(i); };
  for (const [key, ser] of S.weekly) {
    const b = key.split('|')[0];
    if (b === 'cr' || b === 'fpr') continue;
    for (const [p, v] of ser) {
      if (!wMeta.has(p)) continue;
      const val = v === null ? null : (b === 'amt' || b === 'cust' ? v * wMeta.get(p).d : v);
      setVal(wSer, wName(key), p, val, roundKey(key, val));
    }
  }
  for (const [rate, den, name] of RATE_TO_COUNT) for (const [key, ser] of S.weekly) {
    if (!key.startsWith(rate + '|')) continue;
    const ch = key.slice(rate.length + 1), dser = wSer.get(`${den === 'tr' ? 'tru' : den}|${ch}`), out = wName(`${name}|${ch}`);
    for (const [p, r] of ser) {
      if (!wMeta.has(p)) continue;
      const dv = dser ? dser.get(p) : null, val = r === null || dv == null ? null : r * dv;
      setVal(wSer, out, p, val, roundKey(`${name}|${ch}`, val));
    }
  }
  const weeks = [...wMeta.values()].sort((a, b) => a.y - b.y || a.m - b.m || a.n - b.n);
  const weeklyS = {};
  for (const key of [...wSer.keys()].sort()) {
    const ser = wSer.get(key), arr = weeks.map(p => { const k = wk(p); return ser.has(k) ? ser.get(k) : null; });
    if (arr.some(v => v !== null)) weeklyS[key] = arr;
  }

  const chans = new Set(base.meta.channels || []);
  for (const src of [S.daily, S.weekly]) for (const key of src.keys()) if (CHANNEL_BASES.has(key.split('|')[0])) chans.add(key.split('|').pop());
  const channels = [...CHANNEL_ORDER.filter(c => chans.has(c)), ...[...chans].filter(c => !CHANNEL_ORDER.includes(c)).sort()];
  const data = {
    meta: {...base.meta, built: nowText(), sources: [...new Set([...(base.meta.sources || []), ...sources])], lastDate: last, channels},
    daily: {p: dates, s: dailyS},
    weekly: {p: weeks, s: weeklyS},
  };
  return {data, stats};
}

/* ---------- 합치기: 상품 구성 ---------- */
const emptyProd = () => ({meta: {built: '', topN: null, covFields: 6, start: null, days: 0, lastDate: null, rows: 0, products: 0}, ch: [], bpu: [], cat: [], brand: [], paths: [], prods: [], f: [], cov: []});
function mergeProducts(prod, byDay, cov, lastDate) {
  prod = prod || emptyProd();
  const stats = {days: [...byDay.keys()].sort(), rows: 0, newProducts: 0, covCells: cov.size};
  const lists = {ch: [...prod.ch], bpu: [...prod.bpu], cat: [...prod.cat], brand: [...prod.brand]};
  const maps = Object.fromEntries(Object.entries(lists).map(([k, arr]) => [k, new Map(arr.map((v, i) => [v, i]))]));
  const idxOf = (k, v) => { let i = maps[k].get(v); if (i === undefined) { i = lists[k].length; lists[k].push(v); maps[k].set(v, i); } return i; };
  const paths = [...prod.paths], pathIdx = new Map();
  for (let p = 0; p < paths.length / 3; p++) pathIdx.set(`${paths[p * 3]}|${paths[p * 3 + 1]}|${paths[p * 3 + 2]}`, p);
  const prods = [...prod.prods], prodIdx = new Map();
  for (let q = 0; q < prods.length / 2; q++) prodIdx.set(prods[q * 2], q);
  const start0 = prod.meta.start ? toUTC(prod.meta.start) : null;

  // 기존 사실 풀기 → 새 파일에 든 날짜는 통째로 뺀다
  const replace = new Set([...byDay.keys()].map(toUTC));
  const facts = [];
  for (let j = 0, day = 0; j < prod.f.length; j += 6) {
    day += prod.f[j];
    const t = start0 + day * DAY;
    if (!replace.has(t)) facts.push([t, prod.f[j + 1], prod.f[j + 2], prod.f[j + 3], prod.f[j + 4], prod.f[j + 5]]);
  }
  // 연도 × 브랜드 경로별로 이미 개별 보관 중인 상품의 연간 거래액
  const yearOf = t => new Date(t).getUTCFullYear();
  const kept = new Map();
  for (const [t, , p, q, a] of facts) {
    if (q < 0) continue;
    const yp = `${yearOf(t)}|${p}`;
    let m = kept.get(yp);
    if (!m) kept.set(yp, m = new Map());
    m.set(q, (m.get(q) || 0) + a);
  }
  // 새 행 → 경로 · 상품 후보
  const incoming = [];
  const cand = new Map();  // 'year|path' → Map(code → 거래액)
  for (const rows of byDay.values()) for (const r of rows) {
    const [day, bpu, ch, cat, brand, code, name, amt, cust] = r;
    const bk = `${idxOf('bpu', bpu)}|${idxOf('cat', cat)}|${idxOf('brand', brand)}`;
    let p = pathIdx.get(bk);
    if (p === undefined) { p = paths.length / 3; paths.push(...bk.split('|').map(Number)); pathIdx.set(bk, p); }
    const t = toUTC(day), yp = `${yearOf(t)}|${p}`;
    incoming.push([t, idxOf('ch', ch), p, code, name, amt, cust, yp]);
    let m = cand.get(yp);
    if (!m) cand.set(yp, m = new Map());
    m.set(code, (m.get(code) || 0) + amt);
    stats.rows++;
  }
  const keep = new Set(), topN = null;  // 새로 들어오는 상품은 늘 개별 보관 — 예전 백업(상위 N만 개별)에 합쳐도 새 날짜는 기타로 묶지 않는다
  for (const [yp, codes] of cand) {
    if (!topN) { for (const [code] of codes) keep.add(`${yp}|${code}`); continue; }
    const have = kept.get(yp) || new Map();
    const floor = have.size >= topN ? [...have.values()].sort((a, b) => b - a)[topN - 1] : null;
    let slots = Math.max(0, topN - have.size);
    const fresh = [...codes].filter(([code]) => { const q = prodIdx.get(code); return !(q !== undefined && have.has(q)); }).sort((a, b) => b[1] - a[1]);
    for (const [code] of codes) { const q = prodIdx.get(code); if (q !== undefined && have.has(q)) keep.add(`${yp}|${code}`); }
    for (const [code, amt] of fresh) {
      if (slots > 0) { keep.add(`${yp}|${code}`); slots--; }
      else if (floor !== null && amt > floor) keep.add(`${yp}|${code}`);
    }
  }
  const agg = new Map();
  for (const [t, c, p, code, name, amt, cust, yp] of incoming) {
    let q = -1;
    if (keep.has(`${yp}|${code}`)) {
      q = prodIdx.get(code);
      if (q === undefined) { q = prods.length / 2; prods.push(code, name); prodIdx.set(code, q); stats.newProducts++; }
      else if (name) prods[q * 2 + 1] = name;  // 최신 상품명
    }
    const k = `${t}|${c}|${p}|${q}`;
    const o = agg.get(k) || [t, c, p, q, 0, 0];
    o[4] += amt; o[5] += cust;
    agg.set(k, o);
  }
  for (const o of agg.values()) facts.push(o);  // 펼치기(...)는 행이 많으면 호출 스택을 넘는다

  // 커버리지(상품관점 실측) — 같은 날짜 · 채널 · BPU 칸은 새 값으로
  const covMap = new Map();
  const cf = prod.meta.covFields || 5;
  for (let j = 0, day = 0; j < prod.cov.length; j += cf) {
    day += prod.cov[j];
    const t = start0 + day * DAY, c = prod.cov[j + 1], b = prod.cov[j + 2];
    covMap.set(`${t}|${c}|${b}`, [t, c, b, prod.cov[j + 3], prod.cov[j + 4], cf >= 6 ? prod.cov[j + 5] : 0]);
  }
  let startT = start0 !== null ? start0 : Infinity;
  for (const x of facts) if (x[0] < startT) startT = x[0];  // Math.min(...42만 개)는 호출 스택을 넘는다
  for (const [key, [a, u, uv]] of cov) {
    const [day, ch, bpu] = key.split('|');
    const c = ch === '*TOTAL' ? -1 : idxOf('ch', ch), b = bpu === '*TOTAL' ? -1 : idxOf('bpu', bpu), t = toUTC(day);
    if (!isFinite(startT) || t < startT) continue;
    covMap.set(`${t}|${c}|${b}`, [t, c, b, a, u, uv || 0]);
  }
  if (!facts.length) return {prod: prod.f.length ? prod : null, stats};

  // 다시 인코딩 (날짜 차분)
  facts.sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2] || x[3] - y[3]);
  const f = [];
  let prev = 0, maxDay = 0;
  for (const [t, c, p, q, a, u] of facts) {
    if (roundTo(a, 0) === 0 && roundTo(u, 0) === 0) continue;
    const d = Math.round((t - startT) / DAY);
    f.push(d - prev, c, p, q, roundTo(a, 0), roundTo(u, 0));
    prev = d;
    maxDay = Math.max(maxDay, d);
  }
  const covArr = [...covMap.values()].sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]);
  const covOut = [];
  prev = 0;
  for (const [t, c, b, a, u, uv] of covArr) {
    const d = Math.round((t - startT) / DAY);
    covOut.push(d - prev, c, b, roundTo(a, 0), roundTo(u, 0), roundTo(uv || 0, 0));
    prev = d;
    maxDay = Math.max(maxDay, d);
  }
  const out = {
    meta: {...prod.meta, built: nowText(), topN: null, legacyTopN: prod.meta.topN || prod.meta.legacyTopN || null, covFields: 6, start: ymd(startT), days: maxDay + 1, lastDate: lastDate || prod.meta.lastDate,
           rows: (prod.meta.rows || 0) + stats.rows, products: (prod.meta.products || 0) + stats.newProducts},
    ch: lists.ch, bpu: lists.bpu, cat: lists.cat, brand: lists.brand, paths, prods, f, cov: covOut,
  };
  return {prod: out, stats};
}

/* ---------- 진입점 ---------- */
function orderFiles(files) {  // 폴더끼리는 가장 최근 파일 수정시각 순(나중 폴더가 덮어씀), 폴더 안에서는 파일 이름 순 — build_data.py 와 같게
  const rel = f => f.relPath || f.webkitRelativePath || f.name;
  const dirOf = f => { const r = rel(f); return r.includes('/') ? r.slice(0, r.lastIndexOf('/')) : ''; };
  const groups = new Map();
  for (const f of files) { const d = dirOf(f); if (!groups.has(d)) groups.set(d, []); groups.get(d).push(f); }
  return [...groups.entries()]
    .map(([d, fs]) => ({d, fs: fs.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)), t: Math.max(...fs.map(x => x.lastModified || 0))}))
    .sort((a, b) => a.t - b.t)
    .flatMap(g => g.fs.map(f => ({f, rel: rel(f), dir: g.d})));
}
async function merge(base, files) {
  base = base || {};
  const baseData = base.data || emptyData();
  const S = {daily: new Map(), weekly: new Map()};
  const byDay = new Map(), cov = new Map(), log = [], sources = new Set();
  for (const {f, rel, dir} of orderFiles([...files])) {
    const name = f.name, dot = name.lastIndexOf('.'), stem = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
    const entry = {file: rel, status: '건너뜀', note: ''};
    log.push(entry);
    try {
      if (ext === 'xlsx' || ext === 'xls') {
        if (stem.includes(APP_KEY) || stem.includes(PRODUCT_TABLE_KEY)) throw new Error('xlsx 는 브라우저에서 읽지 않습니다 — 엑셀에서 CSV로 저장해 올려 주세요');
        entry.note = 'xlsx — 대시보드가 쓰지 않는 파일';
        continue;
      }
      if (ext !== 'csv' && ext !== 'txt') { entry.note = '지원하지 않는 형식'; continue; }
      const rows = parseCsv(await readText(f));
      if (!rows.length) { entry.note = '빈 파일'; continue; }
      let res = null;
      if (stem.includes(PRODUCT_CSV_KEY)) {
        const r = readCoverage(rows, name);
        for (const [k, v] of r.out) cov.set(k, v);
        res = r.out.size ? r.note : null;
        if (!res) entry.note = r.note;
      } else if (stem.includes(PRODUCT_TABLE_KEY)) {
        const rs = productRows(rows[0], rows.slice(1)), days = [...new Set(rs.map(r => r[0]))].sort();
        for (const d of days) byDay.set(d, []);  // 같은 날짜는 나중 파일이 통째로 바꾼다
        for (const r of rs) byDay.get(r[0]).push(r);
        res = `상품 ${rs.length.toLocaleString()}행 (${span(days)})`;
      } else {
        res = loadSeriesFile(stem, rows, S);
        if (!res) entry.note = stem.includes('전체관점') ? 'MALL 전체 파일 — 대시보드 미사용' : stem.includes('가입율') ? '가입률은 가입자수 ÷ 트래픽으로 다시 계산 — 읽지 않음' : '대시보드가 쓰지 않는 파일';
      }
      if (res) { entry.status = '읽음'; entry.note = res; sources.add(dir || '업로드'); }
    } catch (e) {
      entry.status = '오류';
      entry.note = e.message;
    }
  }
  const {data, stats} = mergeSeries(baseData, S, [...sources].map(s => `업로드:${s}`));
  let prodOut = base.prod || null, pstats = null;
  if (byDay.size || cov.size) {
    const r = mergeProducts(base.prod || null, byDay, cov, data.meta.lastDate);
    prodOut = r.prod;
    pstats = r.stats;
  } else if (prodOut) {
    prodOut = {...prodOut, meta: {...prodOut.meta, lastDate: data.meta.lastDate}};
  }
  const summary = {
    before: baseData.meta.lastDate, after: data.meta.lastDate, newDates: stats.newDates, filledDates: stats.filledDates,
    changedCells: stats.changedCells, changedEx: stats.changedEx, newWeeks: stats.newWeeks, updatedWeeks: stats.updatedWeeks, warn: stats.warn,
    productDays: pstats ? pstats.days : [], productRows: pstats ? pstats.rows : 0, newProducts: pstats ? pstats.newProducts : 0, coverageCells: pstats ? pstats.covCells : 0,
    read: log.filter(x => x.status === '읽음').length, skipped: log.filter(x => x.status === '건너뜀').length, errors: log.filter(x => x.status === '오류').length,
  };
  summary.changed = summary.read > 0 && (stats.newDates.length > 0 || stats.filledDates > 0 || stats.newWeeks > 0 || stats.updatedWeeks > 0 || (pstats && (pstats.rows > 0 || pstats.covCells > 0)));
  return {data, kpi: base.kpi || null, prod: prodOut, log, summary};
}

window.FP_MERGE = {merge, parseCsv, parseCrosstab, inferMdDates, isoWeekMap, readText, toNum, roundTo, version: 1};
})();
