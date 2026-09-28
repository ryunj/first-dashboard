const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('ai-insight-gemini-example.html', 'utf8');
const match = html.match(/<script>([\s\S]*)<\/script>/);
if (!match) throw new Error('script missing');
if (/placeholder=|class="samples"|class="sample"/.test(html)) throw new Error('example prompt controls remain');
if (!/<div class="thread"[^>]* hidden>/.test(html)) throw new Error('chat is not initially hidden');

class FakeElement {
  constructor() {
    this.hidden = false;
    this.textContent = '';
    this.innerHTML = '';
    this.disabled = false;
    this.dataset = {};
    this.events = {};
    this.classList = { toggle() {} };
  }
  addEventListener(name, handler) { this.events[name] = handler; }
  setAttribute(name, value) { this[name] = value; }
  focus() {}
}

const elements = new Map();
const getElement = id => {
  if (!elements.has(id)) elements.set(id, new FakeElement());
  return elements.get(id);
};
const storage = new Map();
const context = {
  console,
  Date,
  Intl,
  Math,
  JSON,
  String,
  Array,
  setTimeout,
  clearTimeout,
  crypto: { randomUUID: () => `id-${Math.random()}` },
  document: { getElementById: getElement },
  localStorage: {
    getItem: key => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => storage.set(key, value)
  }
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(match[1], context);

const distinct = vm.runInContext(`JSON.stringify(selectAnswer('2026년 8월 실적').evidenceRows) !== JSON.stringify(selectAnswer('광고 채널 실적').evidenceRows)`, context);
if (!distinct) throw new Error('question-specific evidence is identical');

vm.runInContext(`globalThis.testSnapshot = buildSnapshot('2026년 8월 실적', selectAnswer('2026년 8월 실적'))`, context);
const saveControl = new FakeElement();
context.saveControl = saveControl;
vm.runInContext('saveInsight(testSnapshot, saveControl)', context);
vm.runInContext('saveInsight(testSnapshot, saveControl)', context);
let saved = JSON.parse(storage.get('firstDashboard.savedAiInsights.example.v1'));
if (saved.length !== 1) throw new Error('duplicate save was not prevented');
if (!saveControl.disabled || saveControl.textContent !== '저장됨') throw new Error('save control state is incorrect');

context.savedId = saved[0].id;
vm.runInContext('deleteInsight(savedId)', context);
saved = JSON.parse(storage.get('firstDashboard.savedAiInsights.example.v1'));
if (saved.length !== 0) throw new Error('delete did not persist');

vm.runInContext(`writeSaved(Array.from({length:12},(_,index)=>({...buildSnapshot('질문 '+index,answers.general),createdAt:new Date(Date.now()-index*1000).toISOString()}))); currentPage=1; renderSaved();`, context);
if (getElement('savedPagination').hidden) throw new Error('pagination is hidden for 12 saved items');
if (!getElement('savedPagination').innerHTML.includes('data-page="2"')) throw new Error('second page control is missing');
if ((getElement('savedList').innerHTML.match(/class="saved-item"/g)||[]).length !== 5) throw new Error('page does not contain exactly 5 items');
if (getElement('savedCount').textContent !== '12') throw new Error('saved count is incorrect');

console.log('AI insight example behavior OK');
