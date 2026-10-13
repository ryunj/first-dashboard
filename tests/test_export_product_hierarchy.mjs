import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../export.js', import.meta.url), 'utf8');
const context = {window: {}, console, Date, Blob, TextEncoder, Uint8Array, Uint32Array, DataView, ArrayBuffer, Map, Set, isFinite};
vm.createContext(context);
vm.runInContext(source, context, {filename: 'export.js'});

const current = ['2026-10-01'], previous = ['2025-10-02'];
const hierarchy = new Map([
  [current, [
    {key:'0|1|2', bpu:'e-영업1', category:'여성의류', brand:'브랜드A', a:30e6, u:120},
    {key:'0|1|3', bpu:'e-영업1', category:'여성의류', brand:'브랜드B', a:20e6, u:80},
  ]],
  [previous, [
    {key:'0|1|2', bpu:'e-영업1', category:'여성의류', brand:'브랜드A', a:25e6, u:100},
  ]],
]);
const exp = {
  tip:'2026년 10월', viewName:'BPU 기준', filters:'전 채널 · 회원구분 전체', crumb:'', level:'BPU', avg:false, hasCode:false,
  baseName:'2025년', cLbl:'전년비', cLbl2:'전년비', weekCompare:false, uvOn:false, basis:'거래액',
  rows:[{name:'합계', total:true, code:'', a:50e6, pa:25e6, da:{t:'+100%',c:'pos'}, u:200, pu:100, du:{t:'+100%',c:'pos'}, share:1, main:'직접 100%'}],
  rest:null, table:() => null,
};
const dash = {
  state:{year:2026,grain:'month',mode:'sum',cmp:'yoy',cmpY:1,layout:'block'},
  lastCols:[{label:'10월',tip:'2026년 10월'}], focusIdx:()=>0, modeName:()=> '월 합계', cmpLbl:()=> '전년비',
  selChans:()=>['*TOTAL'], chLabel:()=> '전체', selSegs:()=>['T'], segLabel:()=> '전체', prodFiltOn:()=>false,
  dataMeta:{lastDate:'2026-10-12'}, prodView:()=>({cur:current,prev:previous,exp}), productHierarchy:dates=>hierarchy.get(dates) || [],
};

const sheet = context.window.FP_EXPORT.build('prod', dash);
const labels = sheet.rows.flatMap(row => (row || []).map(cell => cell && cell.v)).filter(v => v !== undefined && v !== '');
assert.ok(labels.includes('BPU·카테고리·브랜드 상세'), 'product export must include a hierarchy detail section');
for (const label of ['BPU','카테고리','브랜드','e-영업1','여성의류','브랜드A','브랜드B']) {
  assert.ok(labels.includes(label), `product export must include ${label}`);
}
assert.ok(labels.includes(30), 'product hierarchy must export current amount in millions');
assert.ok(labels.includes(25), 'product hierarchy must export comparison amount in millions');
assert.ok(labels.includes(120), 'product hierarchy must export current customer count');
assert.ok(labels.includes(100), 'product hierarchy must export comparison customer count');

console.log('OK: product Excel includes BPU, category and brand hierarchy details');
