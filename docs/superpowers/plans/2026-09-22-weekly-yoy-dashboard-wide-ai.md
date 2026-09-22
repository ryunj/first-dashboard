# Weekly YoY and Dashboard-wide AI Query Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix partial-week YoY parity, surface selected category names in the performance table, and let the browser-only natural-language panel query every dashboard metric family and product dimension.

**Architecture:** Keep all numeric truth in the dashboard's existing calculation functions. Add small read-only query adapters to `window.__dash`; expand `ai_question.js` into period/intent parsing plus family-specific renderers; never mutate dashboard state while answering.

**Tech Stack:** Static HTML/CSS/JavaScript, Node.js assertions, Playwright browser tests, GitHub Pages.

## Global Constraints

- Preserve existing metric definitions, units, and 364-day same-weekday YoY. Weekly traffic uses the displayed daily raw sum divided by the actual data-day count in average mode.
- A partial week uses only the current dates and their matching prior dates on both sides.
- No generated-AI API, network request, or browser persistence is introduced.
- Unspecified question filters inherit the current UI state; explicit question filters take precedence.
- Product UV/CR is shown only at dimensions supported by source data and is never estimated.
- Work only in `first-dashboard`; do not touch or mix any other dashboard.

---

### Task 1: Partial-week YoY parity

**Files:**
- Modify: `dashboard.html` (`weekCols`)
- Create: `tests/test_partial_week_yoy.mjs`

**Interfaces:**
- Consumes: `weekCols(year)`, `compute(metric,row,dates,weekIndex,mode)`
- Produces: weekly columns that calculate traffic metrics from their displayed daily date lists; weekly raw remains only a missing-day fallback for additive series

- [ ] **Step 1: Write a real-backup failing test**

Load the 2026-09-21 backup, select 2026 weekly YoY, and assert the last partial week's `tr`, `jr`, and `fpr` prior values equal the corresponding daily-period calculations.

- [ ] **Step 2: Run the test and verify the old code fails**

Run: `node tests/test_partial_week_yoy.mjs` with `NODE_PATH` and `AI_REAL_BACKUP` set.

Expected before fix: weekly prior traffic differs from daily prior traffic.

- [ ] **Step 3: Implement the minimal period fix**

In `weekCols`, compute `partial = cur.length < 7` and use `cur`/`prev` daily lists for traffic metrics in both partial and complete weeks.

- [ ] **Step 4: Verify partial and complete weeks**

Assert the 2026-09-14~20 traffic average is `1,027,192 / 7 = 146,741.714...`, and rerun partial-week parity assertions.

- [ ] **Step 5: Commit**

Commit message: `fix: align partial-week yoy periods`

### Task 2: Selected category labels in performance metrics

**Files:**
- Modify: `dashboard.html` (`trNote`, `renderTable`, category caption helper)
- Create: `tests/test_category_metric_labels.mjs`

**Interfaces:**
- Consumes: `catFiltOn()`, `catTxt()`, `PROD_MET`
- Produces: `metricScopeText(metric)` returning selected category names for product metrics and an explicit non-application note for other metrics

- [ ] **Step 1: Write the browser test**

Inject product metadata with categories, select only `아웃도어`, render, and assert:

```js
assert.match(productGroupText, /카테고리 아웃도어/);
assert.match(trafficGroupText, /카테고리 아웃도어.*미적용/);
```

- [ ] **Step 2: Run the test and verify labels are missing**

Expected before fix: group captions say only `상품 기준` or `전체 기준` and omit `아웃도어`.

- [ ] **Step 3: Add scope text without changing values**

Build the table subtitle from unit, selected category text, and the existing basis note. Product metrics say `카테고리 아웃도어 · 상품 기준`; unaffected metrics say `카테고리 아웃도어 필터 미적용 · 전체 기준`.

- [ ] **Step 4: Verify table and calculations**

Assert labels are present and before/after metric values are identical.

- [ ] **Step 5: Commit**

Commit message: `fix: show selected category in metric labels`

### Task 3: Natural-language periods and intent

**Files:**
- Modify: `ai_question.js`
- Modify: `tests/test_ai_question_rules.mjs`

**Interfaces:**
- Produces: `parseQuestion(text,defaults)` with `events`, `families`, `dimensions`, `metrics`, `appMetrics`, `includeKpi`, and explicit-filter flags
- Produces: `weekPeriod(year,month,nth)` using the dashboard's Monday-Sunday/Thursday naming rule

- [ ] **Step 1: Add failing parser cases**

Cover explicit date, date range, full month, `24년 9월 3주차`, three comma-separated weeks, `채널/BPU/카테고리까지`, app metrics, KPI, and `전체 실적`.

- [ ] **Step 2: Run parser tests and verify failures**

Run: `node tests/test_ai_question_rules.mjs`.

- [ ] **Step 3: Implement period tokenization and routing**

Parse ranges before single dates, weeks before months, avoid overlapping matches, and route an unspecified metric to the core family while `전체/모든 실적` enables all families.

- [ ] **Step 4: Run parser tests**

Expected: all legacy and new parser assertions pass, including no BPU/category rejection.

- [ ] **Step 5: Commit**

Commit message: `feat: parse dashboard-wide performance questions`

### Task 4: Read-only app, KPI, and product adapters

**Files:**
- Modify: `dashboard.html` (query adapters and `window.__dash` exposure)
- Create: `tests/test_dashboard_query_adapters.mjs`

**Interfaces:**
- Produces: `queryApp(dates,ids,mode) -> [{id,name,value,unit,pct}]`
- Produces: `queryKpi() -> computeKpi() result`
- Produces: `queryProducts({dates,dimensions,channels,bpus,categories,limit}) -> {filters,total,groups}`

- [ ] **Step 1: Write failing adapter tests**

Assert adapters return official `axVal`/`computeKpi` parity, product total parity, channel/BPU/category/brand/product group names, top rows, and do not change serialized state.

- [ ] **Step 2: Run and verify adapters are absent**

Expected before fix: `queryApp` or `queryProducts` is not a function.

- [ ] **Step 3: Add read-only adapters**

Call `prodInit`, construct local date/channel/BPU/category masks, iterate `PF` without changing `PD`, and aggregate positive source rows using the existing product definitions.

- [ ] **Step 4: Run adapter tests**

Expected: parity and immutability assertions pass.

- [ ] **Step 5: Commit**

Commit message: `feat: expose read-only dashboard query adapters`

### Task 5: Multi-family answers and collapsed detail

**Files:**
- Modify: `ai_question.js`
- Modify: `dashboard.html` (only if small result styles are needed)
- Modify: `tests/test_ai_question_ui.mjs`
- Modify: `tests/test_ai_question_real_backup.mjs`

**Interfaces:**
- Consumes: Task 3 parsed intent and Task 4 adapters
- Produces: core/app/KPI/product result sections, filter summary, top-item tables, collapsed complete detail, and 14-day action guidance

- [ ] **Step 1: Add failing UI queries**

Submit the three-year week comparison and an all-results query containing channel/BPU/category dimensions. Assert all requested periods and family headings render, no unsupported-condition error appears, detail starts collapsed, no request occurs, and state is unchanged.

- [ ] **Step 2: Run and verify failures**

Expected before fix: week parsing or family rendering fails.

- [ ] **Step 3: Implement family analyzers and renderers**

Reuse current core analysis, add app/KPI/product sections, show actual inherited/explicit filters, cap visible group rows, and place the full table in `<details>`.

- [ ] **Step 4: Run UI and real-backup tests**

Expected: answers contain official calculated values and no network/state mutation.

- [ ] **Step 5: Commit**

Commit message: `feat: answer all dashboard performance questions`

### Task 6: Regression, documentation, and deployment

**Files:**
- Modify: `docs/HANDOFF.md`
- Modify: `docs/METRICS.md` only if query behavior needs a metric note

**Interfaces:**
- Produces: verified deployable static dashboard

- [ ] **Step 1: Run all automated checks**

Run JavaScript syntax checks, every Node test, Python tests when available, and `git diff --check`.

- [ ] **Step 2: Run actual-backup browser smoke tests**

Verify weekly/day parity, category label, multi-year week query, all metric families, mobile width, default-collapsed panel, and no page errors.

- [ ] **Step 3: Update handoff documentation**

Record supported question syntax, inherited-filter behavior, partial-week rule, and no-API limitation.

- [ ] **Step 4: Review the final diff and commit**

Commit message: `docs: update dashboard AI query handoff`

- [ ] **Step 5: Push and verify GitHub Pages**

Push `main`, wait for deployment, then confirm `dashboard.html` and `ai_question.js` return 200 and the deployed revision contains the new functionality.
