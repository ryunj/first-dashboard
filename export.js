// 첫구매 대시보드 — 엑셀(.xlsx) 다운로드
// 외부 라이브러리 없이 OOXML(시트 XML · 서식)을 직접 만들어 무압축 zip 으로 묶는다(인터넷이 막힌 곳 · Streamlit 안에서도 동작).
// 값은 화면과 같은 기준(기간 · 필터 · 일평균/누계 · 비교 기준)을 window.__dash 에서 받아 숫자 셀 + 서식으로 쓴다.
//   FP_EXPORT.xlsx(['sum', 'table', 'prod', 'app', 'kpi']) → {blob, name, sheets}
(function () {
'use strict';

/* ---------- zip (무압축 · UTF-8 파일명) ---------- */
const enc = new TextEncoder();
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function zip(files) {
  const now = new Date(), time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const parts = [], central = [];
  let off = 0;
  for (const f of files) {
    const name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(data), size = data.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, time, true); lh.setUint16(12, date, true); lh.setUint32(14, crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true);
    lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), name, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, time, true); ch.setUint16(14, date, true); ch.setUint32(16, crc, true); ch.setUint32(20, size, true); ch.setUint32(24, size, true);
    ch.setUint16(28, name.length, true); ch.setUint16(30, 0, true); ch.setUint16(32, 0, true); ch.setUint16(34, 0, true); ch.setUint16(36, 0, true);
    ch.setUint32(38, 0, true); ch.setUint32(42, off, true);
    central.push(new Uint8Array(ch.buffer), name);
    off += 30 + name.length + size;
  }
  const cdSize = central.reduce((a, x) => a + x.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], {type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}

/* ---------- 서식 ---------- */
// [이름, numFmtId, fontId, fillId, borderId, 가로정렬, 들여쓰기]
const XF = [
  ['default', 0, 0, 0, 0], ['title', 0, 2, 0, 0], ['note', 0, 3, 0, 0], ['head', 0, 1, 2, 1, 'center'], ['headL', 0, 1, 2, 1, 'left'],
  ['group', 0, 1, 3, 1, 'left'], ['label', 0, 0, 0, 1, 'left'], ['labelB', 0, 1, 0, 1, 'left'], ['labelSub', 0, 7, 0, 1, 'left', 1],
  ['int', 164, 0, 0, 1], ['dec1', 165, 0, 0, 1], ['pct1', 167, 0, 0, 1], ['pct2', 168, 0, 0, 1],
  ['pos', 0, 4, 0, 1, 'right'], ['neg', 0, 5, 0, 1, 'right'], ['flat', 0, 0, 0, 1, 'right'],
  ['intP', 164, 6, 0, 1], ['dec1P', 165, 6, 0, 1], ['pct1P', 167, 6, 0, 1], ['pct2P', 168, 6, 0, 1],
  ['intB', 164, 1, 0, 1], ['dec1B', 165, 1, 0, 1], ['pct1B', 167, 1, 0, 1], ['pct2B', 168, 1, 0, 1],
];
const XI = Object.fromEntries(XF.map((x, i) => [x[0], i]));
function stylesXml() {
  const font = (o = {}) => `<font>${o.b ? '<b/>' : ''}<sz val="${o.sz || 10}"/>${o.color ? `<color rgb="FF${o.color}"/>` : ''}<name val="맑은 고딕"/><family val="2"/></font>`;
  const fonts = [font(), font({b: 1}), font({b: 1, sz: 14}), font({sz: 9, color: '898781'}), font({b: 1, color: '006300'}), font({b: 1, color: 'D03B3B'}), font({color: '7A7973'}), font({color: '52514E'})];
  const solid = c => `<fill><patternFill patternType="solid"><fgColor rgb="FF${c}"/><bgColor indexed="64"/></patternFill></fill>`;
  const side = s => `<${s} style="thin"><color rgb="FFE1E0D9"/></${s}>`;
  const xfs = XF.map(([, nf, fo, fi, bo, al, ind]) => `<xf numFmtId="${nf}" fontId="${fo}" fillId="${fi}" borderId="${bo}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"${al ? ` applyAlignment="1"><alignment horizontal="${al}" vertical="center"${ind ? ` indent="${ind}"` : ''}/></xf>` : '/>'}`);
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<numFmts count="5"><numFmt numFmtId="164" formatCode="#,##0"/><numFmt numFmtId="165" formatCode="#,##0.0"/><numFmt numFmtId="166" formatCode="#,##0.00"/><numFmt numFmtId="167" formatCode="0.0%"/><numFmt numFmtId="168" formatCode="0.00%"/></numFmts>'
    + `<fonts count="${fonts.length}">${fonts.join('')}</fonts>`
    + `<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>${solid('EFEEEA')}${solid('F6F6F3')}</fills>`
    + `<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border>${side('left')}${side('right')}${side('top')}${side('bottom')}<diagonal/></border></borders>`
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + `<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>`
    + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
}

/* ---------- 시트 ---------- */
const xesc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c])).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
const colName = c => { let s = ''; for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; };
const ref = (r, c) => colName(c) + (r + 1);
const okNum = v => typeof v === 'number' && isFinite(v);
function sheet(name) { return {name, rows: [], widths: {}, merges: [], freeze: null}; }
function put(sh, r, c, cell) { (sh.rows[r] || (sh.rows[r] = []))[c] = cell; }
function sheetXml(sh) {
  const view = sh.freeze
    ? `<sheetView workbookViewId="0" showGridLines="0"><pane${sh.freeze.c ? ` xSplit="${sh.freeze.c}"` : ''} ySplit="${sh.freeze.r}" topLeftCell="${ref(sh.freeze.r, sh.freeze.c)}" activePane="${sh.freeze.c ? 'bottomRight' : 'bottomLeft'}" state="frozen"/></sheetView>`
    : '<sheetView workbookViewId="0" showGridLines="0"/>';
  const cols = Object.entries(sh.widths).map(([c, w]) => `<col min="${+c + 1}" max="${+c + 1}" width="${w}" customWidth="1"/>`).join('');
  let data = '';
  sh.rows.forEach((row, r) => {
    if (!row) return;
    let cells = '';
    row.forEach((cell, c) => {
      if (!cell) return;
      const s = XI[cell.s] || 0, at = `r="${ref(r, c)}" s="${s}"`;
      if (okNum(cell.v)) cells += `<c ${at}><v>${cell.v}</v></c>`;
      else if (cell.v === '' || cell.v == null) cells += `<c ${at}/>`;
      else cells += `<c ${at} t="inlineStr"><is><t xml:space="preserve">${xesc(cell.v)}</t></is></c>`;
    });
    data += `<row r="${r + 1}">${cells}</row>`;
  });
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + `<sheetViews>${view}</sheetViews><sheetFormatPr defaultRowHeight="16.5" defaultColWidth="11"/>${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${data}</sheetData>`
    + (sh.merges.length ? `<mergeCells count="${sh.merges.length}">${sh.merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '')
    + '</worksheet>';
}
function workbook(sheets) {
  const names = new Set();
  sheets.forEach(sh => {
    let n = sh.name.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31), k = 2;
    while (names.has(n)) n = `${sh.name.slice(0, 28)} ${k++}`;
    names.add(n);
    sh.name = n;
  });
  const files = [
    {name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '</Types>'},
    {name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'},
    {name: 'xl/workbook.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
      + sheets.map((sh, i) => `<sheet name="${xesc(sh.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>'},
    {name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
      + `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`},
    {name: 'xl/styles.xml', data: stylesXml()},
    ...sheets.map((sh, i) => ({name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(sh)})),
  ];
  return zip(files);
}

/* ---------- 화면 값 → 셀 ---------- */
const GRAIN = {month: '월별', week: '주별', day: '일별'};
const pad = n => String(n).padStart(2, '0');
const nowText = () => { const t = new Date(); return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())} ${pad(t.getHours())}:${pad(t.getMinutes())}`; };
function context(d) {
  const cols = d.lastCols, k = d.focusIdx(cols), col = k >= 0 ? cols[k] : null;
  const filt = d.prodFiltOn && d.prodFiltOn() ? ` · ${d.filtBase ? d.filtBase() : '상품 기준'} ${d.prodFiltTxt()} (거래액·고객수·객단가만)` : '';
  return `기준 ${col ? col.tip : '–'} · ${d.modeName()} · ${d.cmpLbl()} · 채널 ${d.selChans().map(d.chLabel).join('·')} · 회원구분 ${d.selSegs().map(d.segLabel).join('·')}${filt} · 데이터 ~${d.dataMeta.lastDate} · 출력 ${nowText()}`;
}
function head(sh, title, lines) {
  put(sh, 0, 0, {v: title, s: 'title'});
  lines.forEach((t, i) => put(sh, 1 + i, 0, {v: t, s: 'note'}));
  return 2 + lines.length;  // 한 줄 띄우고 표 시작
}
function metricStyle(d, m) { const M = d.MET[m]; return M.pct ? (M.dp === 1 ? 'pct1' : 'pct2') : m === 'amt' ? 'dec1' : 'int'; }
function num(d, m, v, variant = '') {  // 화면 단위(거래액 = 백만원)의 숫자 셀
  if (!okNum(v)) return {v: '–', s: 'flat'};
  return {v: m === 'amt' ? v / 1e6 : v, s: metricStyle(d, m) + variant};
}
const delta = f => ({v: f && f.t ? f.t : '–', s: f && f.c === 'pos' ? 'pos' : f && f.c === 'neg' ? 'neg' : 'flat'});
const text = (v, s = 'label') => ({v: v == null ? '' : String(v), s});

function sheetSum(d) {
  const L = d.lastSum;
  if (!L) return null;
  const sh = sheet('실적 요약');
  let r = head(sh, '실적 요약', [context(d), L.tip]);
  ['지표', '값', '단위', d.cmpLbl(), d.otherLbl(), d.baseShort()].forEach((h, c) => put(sh, r, c, {v: h, s: c ? 'head' : 'headL'}));
  r++;
  for (const x of L.rows) {
    put(sh, r, 0, text(x.name, 'labelB'));
    put(sh, r, 1, num(d, x.m, x.c, 'B'));
    put(sh, r, 2, text(x.unit));
    put(sh, r, 3, delta(x.main));
    put(sh, r, 4, delta(x.other));
    put(sh, r, 5, num(d, x.m, x.p, 'P'));
    r++;
  }
  sh.widths = {0: 18, 1: 14, 2: 9, 3: 12, 4: 12, 5: 14};
  sh.freeze = {r: 5, c: 1};
  return sh;
}
function sheetTable(d) {
  const S = d.state, cols = d.lastCols, n = cols.length, y = S.year;
  if (!n) return null;
  const sh = sheet('실적 표');
  let r = head(sh, `${GRAIN[S.grain]} 실적 (${d.modeName()})`, [context(d)]);
  const top = r;
  const third = S.cmp === 'pop' ? `${d.baseShort()} (직전 기간)` : `${y - 1} 동기간`;
  put(sh, r, 0, {v: '구분', s: 'headL'});
  put(sh, r + 1, 0, {v: '', s: 'headL'});
  sh.merges.push(`${ref(r, 0)}:${ref(r + 1, 0)}`);
  [`${y} 실적`, d.cmpLbl(), third].forEach((b, i) => {
    for (let k = 0; k < n; k++) {
      put(sh, r, 1 + i * n + k, {v: k ? '' : b, s: 'head'});
      put(sh, r + 1, 1 + i * n + k, {v: cols[k].label + (cols[k].sub ? ` ${cols[k].sub}` : ''), s: 'head'});
    }
    if (n > 1) sh.merges.push(`${ref(r, 1 + i * n)}:${ref(r, i * n + n)}`);
  });
  r += 2;
  for (const m of d.METRICS) {
    const unit = [d.unitOf(m), d.trNote(m)].filter(Boolean).join(' · ');
    for (let c = 0; c <= 3 * n; c++) put(sh, r, c, {v: c ? '' : `${d.MET[m].name}${unit ? ` (${unit})` : ''}`, s: 'group'});
    r++;
    for (const row of d.MODEL[m] || []) {
      put(sh, r, 0, text(row.label, row.ch === '*TOTAL' && row.seg === 'T' ? 'labelB' : 'labelSub'));
      row.vals.forEach((v, k) => {
        put(sh, r, 1 + k, num(d, m, v.c));
        put(sh, r, 1 + n + k, delta(d.fmtDelta(v.d)));
        put(sh, r, 1 + 2 * n + k, num(d, m, v.p, 'P'));
      });
      r++;
    }
  }
  sh.widths = {0: 24};
  for (let c = 1; c <= 3 * n; c++) sh.widths[c] = 11;
  sh.freeze = {r: top + 2, c: 1};
  return sh;
}
function sheetProd(d) {
  const V = d.prodView(), E = V && V.exp;
  if (!E) return null;
  const sh = sheet('상품 구성');
  let r = head(sh, '상품 구성 · 첫구매', [context(d), `${E.tip} · ${E.viewName} · ${E.filters} · 경로 ${E.crumb || '전체'} · ${E.level} 단계 · 표시 ${E.avg ? '일평균' : '합계'}`]);
  const H = [E.level, ...(E.hasCode ? ['상품코드'] : []), '거래액(백만원)', E.baseName, E.cLbl, '주문고객수', E.baseName, E.cLbl,
    ...(E.uvOn ? ['상품UV', `상품UV ${E.cLbl}`, '상품CR', `상품CR ${E.cLbl}`] : []), `구성비(${E.basis})`, '주 채널'];
  const top = r;
  H.forEach((h, c) => put(sh, r, c, {v: h, s: c ? 'head' : 'headL'}));
  r++;
  for (const x of E.rows) {
    let c = 0;
    const B = x.total ? 'B' : '';
    put(sh, r, c++, text(x.name, x.total ? 'labelB' : 'label'));
    if (E.hasCode) put(sh, r, c++, text(x.code || ''));
    put(sh, r, c++, okNum(x.a) ? {v: x.a / 1e6, s: 'dec1' + B} : {v: '–', s: 'flat'});
    put(sh, r, c++, okNum(x.pa) ? {v: x.pa / 1e6, s: 'dec1P'} : {v: '–', s: 'flat'});
    put(sh, r, c++, delta(x.da));
    put(sh, r, c++, okNum(x.u) ? {v: x.u, s: 'int' + B} : {v: '–', s: 'flat'});
    put(sh, r, c++, okNum(x.pu) ? {v: x.pu, s: 'intP'} : {v: '–', s: 'flat'});
    put(sh, r, c++, delta(x.du));
    if (E.uvOn) {
      put(sh, r, c++, okNum(x.uv) ? {v: x.uv, s: 'int' + B} : {v: '–', s: 'flat'});
      put(sh, r, c++, delta(x.duv));
      put(sh, r, c++, okNum(x.cr) ? {v: x.cr, s: 'pct1' + B} : {v: '–', s: 'flat'});
      put(sh, r, c++, delta(x.dcr));
    }
    put(sh, r, c++, okNum(x.share) ? {v: x.share, s: 'pct1'} : {v: '–', s: 'flat'});
    put(sh, r, c++, text(x.main, 'flat'));
    r++;
  }
  if (E.rest) put(sh, r++, 0, {v: `그 외 ${E.rest.n.toLocaleString()}개 · 거래액 ${(E.rest.a / 1e6).toFixed(1)}백만 · 주문고객수 ${Math.round(E.rest.u).toLocaleString()}명`, s: 'note'});
  sh.widths = {0: 30};
  for (let c = 1; c < H.length; c++) sh.widths[c] = 12;
  if (E.hasCode) sh.widths[1] = 15;
  sh.freeze = {r: top + 1, c: 1};
  // 기간별 표 — 기간마다 값 · 비교
  const T = E.table();
  if (T && T.cols.length) {
    r++;
    for (let c = 0; c <= T.cols.length * 2; c++) put(sh, r, c, {v: c ? '' : `기간별 · ${T.basis}${E.avg ? '(일평균)' : ''} · ${E.cLbl2}`, s: 'group'});
    r++;
    put(sh, r, 0, {v: '항목', s: 'headL'});
    put(sh, r + 1, 0, {v: '', s: 'headL'});
    sh.merges.push(`${ref(r, 0)}:${ref(r + 1, 0)}`);
    T.cols.forEach((col, k) => {
      put(sh, r, 1 + 2 * k, {v: col.label, s: 'head'});
      put(sh, r, 2 + 2 * k, {v: '', s: 'head'});
      sh.merges.push(`${ref(r, 1 + 2 * k)}:${ref(r, 2 + 2 * k)}`);
      put(sh, r + 1, 1 + 2 * k, {v: '값', s: 'head'});
      put(sh, r + 1, 2 + 2 * k, {v: E.cLbl2, s: 'head'});
    });
    r += 2;
    const isAmt = T.metric === 'amt';
    for (const row of T.rows) {
      put(sh, r, 0, text(row.label, row.total ? 'labelB' : 'label'));
      row.vals.forEach((x, k) => {
        put(sh, r, 1 + 2 * k, okNum(x.v) ? {v: isAmt ? x.v / 1e6 : x.v, s: (isAmt ? 'dec1' : 'int') + (row.total ? 'B' : '')} : {v: '–', s: 'flat'});
        put(sh, r, 2 + 2 * k, delta(x.d));
      });
      r++;
    }
    for (let c = 1; c <= T.cols.length * 2; c++) sh.widths[c] = Math.max(sh.widths[c] || 0, 11);
  }
  return sh;
}
function sheetApp(d) {
  const cols = d.lastCols, n = cols.length;
  if (!n || !d.AX_ORDER.length) return null;
  const k = d.focusIdx(cols), col = k >= 0 ? cols[k] : null;
  const sh = sheet('앱 설치·수신동의');
  let r = head(sh, '신규회원 앱 설치 · 앱푸시 수신동의', [context(d), '모두 앱 설치자 기준 · 흐름은 기간 합(일평균 메뉴면 일평균), 회원 · 기기 수는 기간 말 값']);
  const top = r;
  put(sh, r, 0, {v: '지표', s: 'headL'});
  cols.forEach((c, i) => put(sh, r, 1 + i, {v: c.label, s: 'head'}));
  put(sh, r, 1 + n, {v: col ? `${col.label} ${d.cmpLbl()}` : d.cmpLbl(), s: 'head'});
  r++;
  let grp = '';
  for (const id of d.AX_ORDER) {
    const M = d.AX[id];
    if (M.grp !== grp) {
      grp = M.grp;
      for (let c = 0; c <= n + 1; c++) put(sh, r, c, {v: c ? '' : grp, s: 'group'});
      r++;
    }
    put(sh, r, 0, text(`${M.name}${M.type === 'stock' ? ' (기간 말)' : ''}`, M.sub ? 'labelSub' : 'labelB'));
    cols.forEach((c, i) => {
      const v = d.axVal(id, c.cur);
      put(sh, r, 1 + i, okNum(v) ? {v, s: M.pct ? 'pct2' : 'int'} : {v: '–', s: 'flat'});
    });
    put(sh, r, 1 + n, col ? delta(d.axFmtDelta(id, d.axVal(id, col.cur), d.axVal(id, col.prev))) : {v: '–', s: 'flat'});
    r++;
  }
  sh.widths = {0: 30};
  for (let c = 1; c <= n + 1; c++) sh.widths[c] = 11;
  sh.freeze = {r: top + 1, c: 1};
  return sh;
}
function sheetKpi(d) {
  const K = d.computeKpi();
  if (!K) return null;
  const sh = sheet('KPI');
  let r = head(sh, `${K.y} KPI 목표`, [context(d), `실적 = ${K.src} · ${K.from} ~ ${K.to} ${K.el}일 경과 / ${K.yearDays}일 · 전년 동기 ${K.prevFrom} ~ ${K.prevTo}(364일 전 동요일)`]);
  const top = r;
  ['지표', '누적 실적', '연간 목표', '달성률', '연간 경과율', '일평균', '목표 일평균', '목표 대비', `남은 ${K.left}일 필요 일평균`, '전년 동기 누적', '전년비']
    .forEach((h, c) => put(sh, r, c, {v: h, s: c ? 'head' : 'headL'}));
  r++;
  const NAME = {amt: '첫구매 거래액(백만원)', cust: '첫구매 고객수', tr: '비회원 트래픽', sg: '가입자수'};
  for (const m of ['amt', 'cust', 'tr', 'sg']) {
    const R = K.rows[m];
    if (!R) continue;
    const v = x => (okNum(x) ? {v: m === 'amt' ? x / 1e6 : x, s: m === 'amt' ? 'dec1' : 'int'} : {v: '–', s: 'flat'});
    const vs = R.target != null && R.tAvg ? R.avg / R.tAvg : null;
    put(sh, r, 0, text(NAME[m], 'labelB'));
    put(sh, r, 1, v(R.act));
    put(sh, r, 2, R.target != null ? v(R.target) : {v: '미입력', s: 'flat'});
    put(sh, r, 3, okNum(R.ach) ? {v: R.ach, s: 'pct1'} : {v: '–', s: 'flat'});
    put(sh, r, 4, {v: K.pace, s: 'pct1'});
    put(sh, r, 5, v(R.avg));
    put(sh, r, 6, R.target != null ? v(R.tAvg) : {v: '–', s: 'flat'});
    put(sh, r, 7, okNum(vs) ? {v: vs, s: 'pct1'} : {v: '–', s: 'flat'});
    put(sh, r, 8, R.target != null ? v(R.need) : {v: '–', s: 'flat'});
    put(sh, r, 9, {...v(R.prev), s: okNum(R.prev) ? (m === 'amt' ? 'dec1P' : 'intP') : 'flat'});
    put(sh, r, 10, delta(d.fmtDelta(d.delta(m, R.act, R.prev))));
    r++;
  }
  const J = K.jr;
  if (J) {
    put(sh, r, 0, text('가입률 (가입자 ÷ 트래픽)', 'labelB'));
    put(sh, r, 1, okNum(J.act) ? {v: J.act, s: 'pct2'} : {v: '–', s: 'flat'});
    put(sh, r, 2, okNum(J.target) ? {v: J.target, s: 'pct2'} : {v: '미입력', s: 'flat'});
    for (let c = 3; c <= 8; c++) put(sh, r, c, {v: '', s: 'flat'});
    put(sh, r, 9, okNum(J.prev) ? {v: J.prev, s: 'pct2P'} : {v: '–', s: 'flat'});
    put(sh, r, 10, delta(d.fmtDelta(d.delta('jr', J.act, J.prev))));
    r++;
  }
  sh.widths = {0: 26, 1: 14, 2: 14, 3: 10, 4: 11, 5: 12, 6: 12, 7: 10, 8: 18, 9: 14, 10: 10};
  sh.freeze = {r: top + 1, c: 1};
  return sh;
}

const BUILD = {sum: sheetSum, table: sheetTable, prod: sheetProd, app: sheetApp, kpi: sheetKpi};
function xlsx(parts) {
  const d = window.__dash;
  if (!d) throw new Error('대시보드가 아직 열리지 않았습니다');
  const sheets = parts.map(p => (BUILD[p] ? BUILD[p](d) : null)).filter(Boolean);
  if (!sheets.length) throw new Error('받을 데이터가 없습니다');
  const t = new Date(), stamp = `${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}_${pad(t.getHours())}${pad(t.getMinutes())}`;
  const blob = workbook(sheets);
  return {blob, name: `첫구매실적_${GRAIN[d.state.grain]}_${String(d.dataMeta.lastDate || '').replace(/-/g, '')}_${stamp}.xlsx`, sheets: sheets.map(s => s.name)};
}
window.FP_EXPORT = {xlsx, zip, crc32, version: 1};
})();
