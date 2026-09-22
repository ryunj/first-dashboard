import assert from 'node:assert/strict';
import fs from 'node:fs';

const dashboard = fs.readFileSync(new URL('../dashboard.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../app.py', import.meta.url), 'utf8');

assert.match(dashboard, /\['data\/data\.js', 'kpi\.js', 'ai_question\.js'\]/, 'static boot must load AI module');
assert.match(dashboard, /FP_AI_QUESTION\.mount\(window\.__dash\)/, 'dashboard must mount AI module after exposing its API');
assert.match(app, /ai_question = \(ROOT \/ 'ai_question\.js'\)\.read_text/, 'Streamlit must read AI module');
assert.match(app, /\{ai_question\}/, 'Streamlit must inject AI module');
assert.match(app, /'export\.js', 'ai_question\.js'/, 'Streamlit cache stamp must include AI module');

console.log('OK: static and Streamlit loading paths include AI questions');
