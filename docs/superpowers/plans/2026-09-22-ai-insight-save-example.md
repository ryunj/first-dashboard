# AI Insight Save Example Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 질문 예시 요소를 제거하고, 사용자가 선택해 저장한 AI 인사이트만 접힌 목록에 보관하는 독립 HTML 예시를 완성한다.

**Architecture:** `ai-insight-gemini-example.html` 한 파일 안에서 화면, 질문별 예시 응답, 저장소 제어를 분리된 함수로 관리한다. 일반 채팅은 메모리에만 두고, 명시적으로 저장한 인사이트 스냅샷만 `localStorage`에 기록한다.

**Tech Stack:** HTML5, CSS, vanilla JavaScript, browser localStorage

## Global Constraints

- 실제 Gemini API를 호출하지 않는다.
- 실제 대시보드 코드는 예시 화면 승인 전에는 변경하지 않는다.
- 근거 데이터는 기본 접힘 상태로 둔다.
- 저장하지 않은 일반 질문·답변은 새로고침과 백업 복원 대상에서 제외한다.
- 저장 목록은 최신순으로 20건을 먼저 표시한다.

---

### Task 1: 질문 입력과 저장 목록 UI

**Files:**
- Modify: `ai-insight-gemini-example.html`

**Interfaces:**
- Consumes: 기존 `#question`, `#askButton`, `#thread` 요소
- Produces: `#savedToggle`, `#savedCount`, `#savedPanel`, `#savedList`, `#savedMore` 요소

- [ ] **Step 1: 실패 조건 확인**

Run: `rg -n "placeholder=|class=\"samples\"|class=\"sample\"" ai-insight-gemini-example.html`
Expected: 예시 문구와 예시 질문 버튼이 검색된다.

- [ ] **Step 2: 입력부 단순화와 저장 목록 마크업 추가**

입력란의 `placeholder`를 제거하고 `.samples`, `.sample` 버튼을 삭제한다. 카드 상단에 `저장한 인사이트 0` 버튼을 추가하고, 질문 입력부와 채팅 사이에 기본 접힘 저장 목록을 배치한다.

- [ ] **Step 3: 반응형·접근성 스타일 추가**

저장 버튼은 최소 높이 32px, 저장 목록 토글은 최소 높이 44px을 유지한다. 포커스 표시, 접힘 상태, 모바일 한 열 배치를 기존 색상 체계로 구현한다.

- [ ] **Step 4: 정적 조건 확인**

Run: `rg -n "placeholder=|class=\"samples\"|class=\"sample\"" ai-insight-gemini-example.html`
Expected: 결과가 없다.

### Task 2: 질문별 근거 데이터와 저장 동작

**Files:**
- Modify: `ai-insight-gemini-example.html`

**Interfaces:**
- Consumes: `selectAnswer(question)`이 선택한 응답 객체
- Produces: `loadSaved()`, `writeSaved(items)`, `saveInsight(snapshot)`, `deleteInsight(id)`, `renderSaved()` 함수

- [ ] **Step 1: 질문별 예시 응답 구조 확장**

각 응답 객체에 `conditions`, `evidenceRows`, `action`을 넣어 8월·광고·일반 질문의 근거 조건과 표 값이 서로 다르게 렌더링되도록 한다.

- [ ] **Step 2: 저장 스냅샷 생성**

답변마다 질문, 제목, 설명, 지표, 액션, 조건, 근거 행, 기준일을 가진 객체를 만들고 고유 ID를 부여한다. 답변 헤더의 `저장` 버튼은 이 객체를 사용한다.

- [ ] **Step 3: localStorage 저장·삭제 구현**

키 `firstDashboard.savedAiInsights.example.v1`에 배열을 저장한다. JSON 읽기 실패 시 빈 배열을 사용하고, 같은 ID는 중복 저장하지 않으며 삭제 후 즉시 목록과 건수를 갱신한다.

- [ ] **Step 4: 접힌 저장 목록과 더 보기 구현**

목록은 최신순으로 20건만 먼저 렌더링하고, 남은 항목이 있으면 `더 보기`를 표시한다. 각 항목의 본문과 근거 데이터는 `<details>`로 기본 접힘 처리한다.

- [ ] **Step 5: JavaScript 문법 검증**

Run: `node -e 'const fs=require("fs");const h=fs.readFileSync("ai-insight-gemini-example.html","utf8");const m=h.match(/<script>([\s\S]*)<\/script>/);new Function(m[1]);console.log("JavaScript syntax OK")'`
Expected: `JavaScript syntax OK`

### Task 3: 사용자 흐름 검증

**Files:**
- Verify: `ai-insight-gemini-example.html`

**Interfaces:**
- Consumes: 완성된 독립 HTML
- Produces: 검증된 예시 파일

- [ ] **Step 1: 질문 누적과 근거 차이 확인**

8월 질문과 광고 질문을 각각 입력하고, 두 답변이 누적되며 근거 조건과 표 값이 서로 다른지 확인한다.

- [ ] **Step 2: 저장과 새로고침 확인**

한 답변만 저장한 뒤 새로고침한다. 채팅은 초기 예시 상태로 돌아가고 저장한 인사이트만 접힌 목록에 남는지 확인한다.

- [ ] **Step 3: 삭제 확인**

저장 목록에서 항목을 삭제하고 새로고침해도 다시 나타나지 않는지 확인한다.

- [ ] **Step 4: 최종 변경 범위 확인**

Run: `git status --short`
Expected: 실제 대시보드 파일은 변경되지 않고 예시 HTML과 관련 문서만 변경되어 있다.
