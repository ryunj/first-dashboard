# Product-view source migration implementation plan

> **For Codex:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Make headline first-purchase performance use `상품관점 - 일자별 실적(기본)` and `상품관점 - 주별 실적(기본)` as the authoritative source, while retaining the 52 organization categories only in the lower detail area.

**Architecture:** Add a backward-compatible product-view cube keyed by date, member segment, channel, BPU, and the product groups present in the source. Exact daily values take precedence; weekly daily-average values fill dates not present in the daily export. The browser backup merger must reproduce the Python builder result. UI product-group state is kept separate from organization-category detail state.

**Tech Stack:** Python data builder, browser JavaScript dashboard/backup merger, Node-based regression tests.

---

### Task 1: Lock source parsing rules with failing tests

**Files:**
- Modify: `tests/test_product_member_parser.py`
- Modify or add: `tests/test_product_source_cube.js`

- [x] Add a parser test covering member × channel × BPU × product-group values from a daily product-view export.
- [x] Add a weekly fallback test proving weekly daily averages populate missing dates and exact daily rows win.
- [x] Run the focused tests and confirm they fail for the missing source cube.

### Task 2: Build the authoritative product-view cube

**Files:**
- Modify: `build_data.py`
- Modify: `merge.js`

- [x] Encode a new backward-compatible cube with date, member segment, channel, BPU, product group, amount, and customers.
- [x] Parse both daily and weekly product-view sources.
- [x] Expand weekly daily-average values across eligible dates, without replacing exact daily values.
- [x] Add matching browser-side merge logic and metadata.
- [x] Run focused parser and merger tests.

### Task 3: Separate top product-group filters from organization-category detail

**Files:**
- Modify: `dashboard.html`
- Modify or add: `tests/test_product_group_ui.js`

- [x] Add a failing UI regression test for source product groups and member × BPU × product-group intersection.
- [x] Decode and query the new source cube in headline tables/cards/charts.
- [x] Replace the top organization-category control with the source product groups.
- [x] Keep organization categories in the lower detail section only and preserve their member/channel/BPU filtering.
- [x] Persist the new filter state without misreading old category selections.
- [x] Show a clear compatibility notice for backups that predate the new cube.

### Task 4: Update metric definitions and handoff documentation

**Files:**
- Modify: `docs/METRICS.md`
- Modify: `docs/DATA_OPERATIONS.md`
- Modify: `docs/HANDOFF.md`
- Modify: `dashboard.html`

- [x] Document the source precedence, product-group source rule, and weekly fallback rule.
- [x] Explain that the lower organization-category detail is a different classification and may not equal headline product-view totals.

### Task 5: Validate against the 2026-09-29 source and backup

**Files:**
- Read: `D:/류은지_AI/first-dashboard/2026년/0929/상품관점 - 일자별 실적(기본).csv`
- Read: `D:/류은지_AI/first-dashboard/2026년/0929/상품관점 - 주별 실적(기본).csv`
- Read: `D:/류은지_AI/first-dashboard/backup/첫구매대시보드_백업_데이터20260929_20260930_1357.json.gz`

- [x] Rebuild data outside the operational folder and verify the latest total equals the raw product-view source.
- [x] Verify 2025 weekly comparison values are available from the weekly source.
- [x] Run the complete regression suite and browser smoke checks.
- [x] Review the diff for accidental UI changes and confirm only the intended filter/data-source behavior changed.

### Task 6: Prepare the completed change

- [x] Create a new backup artifact if the workflow generates one; never overwrite an existing operational backup.
- [x] Commit the verified source and documentation changes.
- [x] Do not push/deploy until the user explicitly requests deployment.

### Task 7: Fix KPI source precedence

**Files:**
- Modify: `dashboard.html`
- Add: `tests/test_kpi_precedence.mjs`

- [x] Reproduce an active backup overwriting a newer local `kpi.js` target.
- [x] Preserve the freshly loaded local KPI when present; use the backup KPI only when no local KPI exists.
- [x] Verify KPI actuals still recalculate from the newly loaded performance data.

### Task 8: Add previous-week comparison to product/first-purchase detail

**Files:**
- Modify: `dashboard.html`
- Modify: `export.js`
- Add: `tests/test_product_week_over_week.mjs`

- [x] Add a failing weekly product regression that expects both selected year comparison and previous-week comparison.
- [x] Calculate previous-week values from each weekly column's `prevP` independently of the main comparison toggle.
- [x] Show previous-week value/rate in the product detail and include it in the product Excel sheet.
- [x] Keep annual cumulative product view as year-over-year only.

### Task 9: Correct selected comparison-year labels in Excel and screen table

**Files:**
- Modify: `dashboard.html`
- Modify: `export.js`
- Add: `tests/test_export_compare_year.mjs`

- [x] Reproduce 2024 values labelled as 2025 when `year=2026`, `cmpY=2`.
- [x] Replace hard-coded `year - 1` labels with the selected comparison year helper.
- [x] Verify both the on-screen three-band table and generated Excel model say `2024 동기간` while retaining the existing numbers.
