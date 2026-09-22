# 아키텍처

## 실행 구조

```text
raw CSV/XLSX ── build_data.py ──> data/data.js + data/products.js
       │                              │
       └──────── merge.js <── 기존 .json.gz 백업
                                      │
kpi.js ───────────────────────────────┤
                                      v
dashboard.html + export.js ── app.py/Streamlit component
                                      │
                         IndexedDB 백업 + localStorage 상태/메모

자연어 질문 ── streamlit_component ──> gemini_query.py ──> Gemini API
     ^                                      │
     └──── 검증된 조회조건 JSON만 반환 ─────┘
```

두 가지 데이터 갱신 경로가 있다. 로컬에서는 Python이 전체 raw를 빌드하고, 브라우저에서는 JavaScript가 기존 백업에 일자별 raw를 합친다. 최종 백업 형식은 동일하다.

## 파일 책임

| 파일 | 책임 |
|---|---|
| `dashboard.html` | UI, 기간/필터 상태, 공식 지표 계산, 차트·표, 상품 드릴다운, 앱 지표, KPI, 인사이트, 메모, 백업 저장/복원 |
| `build_data.py` | raw 탐색·파싱, 일/주 시리즈 생성, 상품 데이터 압축, 백업 생성 |
| `merge.js` | 브라우저 raw 파싱과 증분 병합, Python 빌드 규칙의 동등 구현 |
| `export.js` | 현재 화면 상태를 엑셀 또는 PDF로 내보내기 |
| `app.py` | 정적 파일을 읽어 Streamlit iframe에 삽입하고 화면 높이를 맞춤 |
| `gemini_query.py` | Streamlit Secrets의 키를 서버에서만 읽고 Gemini 응답을 허용된 조회조건으로 검증 |
| `streamlit_component/index.html` | 질문을 Python 서버로, 검증된 조회조건을 대시보드 iframe으로 중계 |
| `index.html` | 정적 호스팅에서 `dashboard.html`로 이동 |
| `kpi.example.js` | 실제 목표 파일 `kpi.js`의 공개 가능한 형식 |

## 데이터 모델

메인 데이터는 `meta`, `daily`, `weekly`로 구성된다. `daily.p`는 날짜 배열, `weekly.p`는 연·월·주차·ISO 주·시작일·일수 메타 배열이고, 각 `s` 객체는 같은 길이의 지표 배열을 가진다.

주요 시리즈 키는 `기본지표|회원구분|채널` 또는 `기본지표|채널` 형태다. 거래액·고객수만 회원구분을 가진다. 비율 원천은 재집계할 수 있도록 분자(`crn`, `fpn`/`fpnu`)와 분모를 저장한다.

상품 데이터는 사전 배열과 정수 인덱스로 압축한다. `f`는 날짜·채널·경로·상품·거래액·고객수, `cov`와 `cov2`는 커버리지 및 상품UV/CR 계산용 집계다.

백업 payload는 `format`, `version`, `created`, `source`, `lastDate`, `built`, `data`, `kpi`, `prod`, 선택적으로 `memos`를 가진다.

## 브라우저 저장

- 보기 설정: localStorage `fp-dashboard-v4`
- 메모: localStorage `fp-dashboard-memos`
- 활성 백업: IndexedDB `fp-dashboard-backup`, object store `kv`, key `active`
- 주소 해시: 보기와 상품 드릴다운 상태를 공유/복원

Streamlit 컴포넌트 안의 대시보드 iframe은 `DASH_EMBED='streamlit'`로 동작하며 저장소의 `data/*.js`를 직접 찾지 않고 사용자가 연 백업을 기준으로 실행한다. Gemini에는 질문·허용 지표/필터 목록·최근 구조화 문맥만 전달하고 백업 원본이나 실적 값은 전달하지 않는다.

## 호환성 경계

- 백업 포맷 version 1과 기존 메모의 단일 `text`/`html` 형식을 계속 읽어야 한다.
- 상품 데이터 구형 백업은 연간 상위 상품만 남아 있을 수 있으므로 안내 후 읽을 수 있어야 한다.
- `app.py`가 HTML 삽입 지점으로 찾는 `<div id="selbar"` 마커를 유지한다.
- `window.__dash` 공개 객체는 `export.js`와 검증 도구가 사용하므로 이름 변경 시 함께 수정한다.
- Streamlit iframe과 정적 `dashboard.html` 실행 경로를 모두 유지한다.
