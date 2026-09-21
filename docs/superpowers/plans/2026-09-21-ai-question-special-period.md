# AI 실적 질문·특수기간 비교 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 첫구매 대시보드 산식을 그대로 사용해 자연어 특수기간 질문에 전·중·후 비교, 자동 요약, 상승 예상 시점과 14일 선행 액션 시작일을 브라우저 안에서 답하는 접이식 질문창을 배포한다.

**Architecture:** 순수 파서·기간 생성·상승 시점 계산과 DOM 렌더링을 `ai_question.js`에 분리하고, 기존 `dashboard.html`은 위치·스타일·공식 `compute()` 연결만 담당한다. 정적 페이지는 부트 로더가 파일을 읽고, Streamlit은 `app.py`가 같은 파일을 HTML에 삽입한다. 질문은 외부로 전송하거나 저장하지 않는다.

**Tech Stack:** 정적 HTML/CSS/바닐라 JavaScript, Streamlit/Python, pytest, Playwright, Node.js syntax check

## Global Constraints

- 대상 저장소는 `ryunj/first-dashboard`뿐이며 `payments-dashboard`의 코드나 데이터를 섞지 않는다.
- 기존 `MET`, `compute()`, 날짜 열 생성, 채널·회원구분·BPU/상품 필터를 공식 계산 경로로 재사용한다.
- 질문에 명시한 지표·채널·회원구분만 현재 선택보다 우선하고, 나머지는 현재 대시보드 선택값을 따른다.
- 전·후 기간 기본값은 각각 7일이다.
- 질문창은 `#insightSec` 바로 아래, `#memoSec` 바로 위에 두고 기본 접힘으로 표시한다.
- 상승 예상은 계산 가능한 과거 행사 2개 이상일 때만 내며, 권장 액션 시작일은 예상 상승 시점보다 정확히 14일 전이다.
- GPT/API, 외부 전송, API 키, 서버 저장, localStorage를 사용하지 않는다.
- 백업, 원천 데이터, `data/`, `kpi.js`는 커밋하지 않는다.
- 기존 UI 토큰을 재사용하고 인쇄/PDF 및 기존 다운로드 결과에는 질문창을 포함하지 않는다.

---

### Task 1: 자연어 파서와 기간·상승 계산 계약

**Files:**
- Create: `ai_question.js`
- Create: `tests/test_ai_question_rules.py`

**Interfaces:**
- Produces: `window.FP_AI_QUESTION.parseQuestion(text, defaults) -> {events, preDays, postDays, metrics, channels, segments}`
- Produces: `window.FP_AI_QUESTION.buildPeriods(event, preDays, postDays) -> {pre, during, post}`
- Produces: `window.FP_AI_QUESTION.estimateAction(events, dailyValue) -> {onsetOffset, actionOffset, actionDate, evidenceCount} | {insufficient:true}`

- [ ] **Step 1: Write failing Playwright tests for parsing and period boundaries**

```python
def test_parses_two_events_and_default_windows(ai_api):
    result = ai_api("parseQuestion", "24년 추석 9월 14-18, 25년 추석 10월 3-9, 전후 영향 알려줘", {})
    assert [(e["start"], e["end"]) for e in result["events"]] == [
        ("2024-09-14", "2024-09-18"), ("2025-10-03", "2025-10-09")]
    assert (result["preDays"], result["postDays"]) == (7, 7)

def test_builds_asymmetric_windows_across_year(ai_api):
    parsed = ai_api("parseQuestion", "2025년 연말 12월 30-31 전 3일 후 10일", {})
    periods = ai_api("buildPeriods", parsed["events"][0], 3, 10)
    assert periods["pre"] == ["2025-12-27", "2025-12-28", "2025-12-29"]
    assert periods["post"][-1] == "2026-01-10"
```

- [ ] **Step 2: Run the rule tests and confirm RED**

Run: `python -m pytest tests/test_ai_question_rules.py -q`

Expected: FAIL because `ai_question.js` and `window.FP_AI_QUESTION` do not exist.

- [ ] **Step 3: Implement strict parsing and date validation**

Implement exact support for two/four-digit Korean years, `월 일-일`, slash ranges, default and explicit pre/post windows, supported metric/channel/member aliases, and descriptive `Error` messages for missing/invalid/ambiguous dates. Export the three interfaces above without making network or storage calls.

- [ ] **Step 4: Add a failing 14-day action test, then implement the deterministic estimator**

```python
def test_action_starts_fourteen_days_before_median_uplift(ai_api):
    result = ai_api("estimateAction", EVENTS, DAILY_VALUES)
    assert result["onsetOffset"] == -10
    assert result["actionOffset"] == -24
```

Use D-28~D-15 as baseline, a 3-day moving average, a 5% threshold, and persistence in at least two of the next three moving averages. Return insufficient evidence for fewer than two valid event curves.

- [ ] **Step 5: Run tests and commit the rules layer**

Run: `python -m pytest tests/test_ai_question_rules.py -q`

Expected: PASS.

Commit: `git add ai_question.js tests/test_ai_question_rules.py && git commit -m "feat: add deterministic performance question rules"`

### Task 2: 기존 공식 산식 연결과 질문 결과 생성

**Files:**
- Modify: `dashboard.html`
- Modify: `ai_question.js`
- Create: `tests/test_ai_question_calculation.py`

**Interfaces:**
- Consumes: `parseQuestion`, `buildPeriods`, `estimateAction`
- Consumes: `window.__dash.compute(metric, row, dates, weekIndex, mode)`
- Produces: `window.FP_AI_QUESTION.analyze(parsed, dash) -> {conditions, eventResults, comparisons, summary, action}`

- [ ] **Step 1: Write failing calculation parity tests**

Create synthetic `DASH_DATA`, load the dashboard and module in Playwright, and assert that question results equal direct `window.__dash.compute(...)` calls for `amt`, `cust`, `aov`, and a ratio metric. Assert the current state object and existing summary text are unchanged after analysis.

- [ ] **Step 2: Run the calculation tests and confirm RED**

Run: `python -m pytest tests/test_ai_question_calculation.py -q`

Expected: FAIL because `compute` has no explicit mode parameter and `analyze` is missing.

- [ ] **Step 3: Extend `compute` without changing current callers**

Change the signature to `function compute(m, row, dates, wi, mode = S.mode)` and replace only the two internal `S.mode === 'avg'` decisions with `mode === 'avg'`. Keep all other calculations and existing calls unchanged.

- [ ] **Step 4: Implement analysis through the dashboard interface**

Use official series keys and `compute` for every pre/during/post value. Show sum and daily average for flow metrics, recomputed official ratios for ratio metrics, percent change for values, and percentage-point change for rates. Explicit question filters override channel/member defaults; BPU/product selections remain inherited from current state.

- [ ] **Step 5: Run new and existing calculation regression tests**

Run: `python -m pytest tests/test_ai_question_calculation.py tests/test_memo_period_filter.py -q`

Expected: PASS.

Commit: `git add dashboard.html ai_question.js tests/test_ai_question_calculation.py && git commit -m "feat: connect questions to dashboard calculations"`

### Task 3: 기존 UI에 기본 접힘 질문창 적용

**Files:**
- Modify: `dashboard.html`
- Modify: `ai_question.js`
- Create: `tests/test_ai_question_ui.py`

**Interfaces:**
- Consumes: `window.FP_AI_QUESTION.analyze`
- Produces: `window.FP_AI_QUESTION.mount(dash)`

- [ ] **Step 1: Write failing placement and interaction tests**

Assert `#aiQuestionSec` immediately follows `#insightSec`, precedes `#memoSec`, its `<details>` has no `open` attribute, the example button fills the textarea, Enter sends, Shift+Enter inserts a newline, results include interpreted conditions/table/summary/action, and invalid questions show an inline correction message.

- [ ] **Step 2: Run the UI tests and confirm RED**

Run: `python -m pytest tests/test_ai_question_ui.py -q`

Expected: FAIL because the section and mount behavior are absent.

- [ ] **Step 3: Add scoped markup and CSS**

Insert `<section id="aiQuestionSec"><details class="insight" id="aiQuestionBox">...</details></section>` between the existing insight and memo sections. Reuse existing colors, radii, typography and responsive rules; scope all new selectors under `.aiq-`. Add `#aiQuestionSec` to PDF/print hide selectors and document the browser-only calculation in the help details.

- [ ] **Step 4: Implement accessible chat interaction**

Render user/answer bubbles only in memory, add status/error regions with `aria-live`, handle keyboard behavior, example fill, reset-on-refresh behavior, and deterministic 3–5 line summaries. Never call `fetch`, `XMLHttpRequest`, `WebSocket`, storage APIs, or clipboard APIs.

- [ ] **Step 5: Run UI and full browser tests**

Run: `python -m pytest tests/test_ai_question_ui.py tests/test_ai_question_calculation.py tests/test_ai_question_rules.py tests/test_memo_period_filter.py -q`

Expected: PASS.

Commit: `git add dashboard.html ai_question.js tests/test_ai_question_ui.py && git commit -m "feat: add collapsed AI performance question panel"`

### Task 4: 정적 페이지와 Streamlit 로딩 통합

**Files:**
- Modify: `dashboard.html`
- Modify: `app.py`
- Create: `tests/test_ai_question_loading.py`

**Interfaces:**
- Consumes: `window.FP_AI_QUESTION.mount(window.__dash)`
- Produces: 동일한 `ai_question.js`가 정적 페이지와 Streamlit HTML에 정확히 한 번 로드됨

- [ ] **Step 1: Write failing loader tests**

Assert the static boot list contains `ai_question.js`, the Streamlit composed HTML contains its contents before `__dashMain()` executes, `window.FP_AI_QUESTION.mount(window.__dash)` is invoked once, and script stamping includes the module modification time.

- [ ] **Step 2: Run loader tests and confirm RED**

Run: `python -m pytest tests/test_ai_question_loading.py -q`

Expected: FAIL because neither boot path loads the module.

- [ ] **Step 3: Integrate both loaders**

Load `ai_question.js` alongside direct static dependencies, read/inject it in `app.py`, include it in the cache stamp, and mount after `window.__dash` is assigned. Missing optional module must produce a visible question-panel error without breaking the rest of the dashboard.

- [ ] **Step 4: Run syntax, loader and AppTest checks**

Run: `node --check ai_question.js`

Run: `python -m py_compile app.py build_data.py`

Run: `python -m pytest tests/test_ai_question_loading.py -q`

Run the existing Streamlit `AppTest` smoke script and confirm no uncaught exception.

- [ ] **Step 5: Commit loader integration**

Commit: `git add dashboard.html app.py ai_question.js tests/test_ai_question_loading.py && git commit -m "feat: load performance questions in static and streamlit apps"`

### Task 5: 실제 백업 검증, 디버깅, 배포

**Files:**
- Create: `tests/test_ai_question_real_backup.py`
- Modify when a reproduced defect requires it: `ai_question.js`, `dashboard.html`, `app.py`

**Interfaces:**
- Consumes: environment variable `AI_REAL_BACKUP`
- Produces: reproducible real-backup validation without committing the backup

- [ ] **Step 1: Write the opt-in real backup test**

The test reads `AI_REAL_BACKUP`, skips when absent, decompresses the gzip JSON, injects it into the browser, asks the representative two-event question, and independently verifies displayed period boundaries and representative totals/averages against raw base values.

- [ ] **Step 2: Run all automated gates with the actual backup**

Run with `AI_REAL_BACKUP=D:\류은지_AI\first-dashboard\backup\첫구매대시보드_백업_데이터20260920.gz`:

`python -m pytest tests -q`

Expected: all tests pass, with no test skipping the real-backup case.

- [ ] **Step 3: Reproduce and fix every defect test-first**

For each failure, add or narrow a test that fails for the observed reason, make the smallest production change, rerun the focused test, then rerun the full suite. Do not modify expected values merely to match an incorrect implementation.

- [ ] **Step 4: Complete final verification**

Run: `node --check ai_question.js && node --check merge.js && node --check export.js`

Run: `python -m py_compile app.py build_data.py`

Run: `git diff --check`

Open desktop and narrow mobile layouts, submit valid/invalid questions, and verify no new network request occurs on submit. Confirm the panel starts collapsed and the existing dashboard still renders, filters, backs up, restores, and exports.

- [ ] **Step 5: Synchronize and deploy safely**

Fetch `origin/main`. If it advanced, rebase the feature commits on the new tip and rerun Step 4 plus the full pytest suite. Confirm no backup/data files are staged, commit any final documentation/test adjustments, then push `main` to `origin`.

- [ ] **Step 6: Verify the deployed page**

Open `https://ryunj.github.io/first-dashboard/dashboard.html`, confirm HTTP success, the AI question section and `ai_question.js` are present, the panel is collapsed under automatic insights, and a representative question works with an uploaded backup. Record the deployed commit SHA and validation result.
