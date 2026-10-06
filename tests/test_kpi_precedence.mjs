import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../dashboard.html', import.meta.url), 'utf8');
const match = html.match(/const preferKpi = ([^;]+);/);
assert.ok(match, 'dashboard must define explicit KPI precedence');
const preferKpi = vm.runInNewContext(`(${match[1]})`);
const local = {year: 2026, targets: {amt: 200}};
const backup = {year: 2026, targets: {amt: 100}};
assert.equal(preferKpi(local, backup), local, 'fresh local kpi.js must win over stale backup KPI');
assert.equal(preferKpi(null, backup), backup, 'backup KPI remains the fallback on the deployed data-less page');

console.log('OK: freshly loaded KPI targets take precedence over an older active backup');
