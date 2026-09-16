# First Purchase Performance Dashboard

LF몰 첫구매·가입·앱 설치·앱푸시 수신동의 실적을 월·주·일 단위로 보는 정적 대시보드다. Streamlit은 정적 HTML을 배포하는 얇은 래퍼이며, 실적 데이터는 저장소에 커밋하지 않는다.

## Before Editing

- 현재 상태와 최근 변경은 `docs/HANDOFF.md`를 먼저 읽는다.
- 지표나 기간 비교를 건드리기 전에는 `docs/METRICS.md`를 읽는다.
- 실적 갱신 또는 배포 전에는 `docs/DATA_OPERATIONS.md`를 읽는다.
- 구조와 데이터 흐름은 `docs/ARCHITECTURE.md`를 따른다.

## Structure

- `dashboard.html`: 화면, 상태, 지표 계산, 기간 비교, 메모, 백업 UI의 기준 구현
- `build_data.py`: 로컬 raw 파일을 `data/*.js`와 백업 파일로 변환
- `merge.js`: 브라우저에서 새 raw를 기존 백업에 합치는 구현
- `export.js`: 화면 기준 엑셀·PDF 내보내기
- `app.py`: Streamlit에서 세 JavaScript/HTML 파일을 하나의 iframe으로 제공
- `kpi.example.js`: 커밋 가능한 KPI 목표 형식 예시

## Non-negotiable Invariants

- 기존 기능과 지표 정의를 삭제하거나 임의로 바꾸지 않는다.
- 공식 지표·기간 규칙은 `dashboard.html`의 `MET`, `compute()`, `monthCols()`, `weekCols()`, `dayCols()`다.
- 주차는 ISO 월요일~일요일이며, 표시 월·주차는 해당 주 목요일 기준이다.
- 전년 비교는 364일 전 동요일 기준이다. 진행 중인 전월 비교는 같은 일수까지만 쓴다.
- 주별 트래픽·가입률·첫구매율은 태블로 주간 중복 제거 트래픽을 사용한다. 월·일 누계는 일자 트래픽 합이다.
- 파생 비율은 기간 기본값을 먼저 합산한 뒤 다시 계산한다. 행별 비율을 합하거나 단순 평균내지 않는다.
- `build_data.py`와 `merge.js`의 파싱·병합·반올림 규칙은 동등해야 한다. 한쪽을 바꾸면 다른 쪽과 백업 호환성을 함께 검증한다.
- `data/`, `backup/`, raw CSV/XLSX/XLS, `kpi.js`, 실제 수치 검증 파일은 공개 저장소에 커밋하지 않는다.
- 메모와 보기 상태는 브라우저 저장소에 남고 백업에 포함된다. 저장 키와 백업 형식은 호환성을 깨지 않게 유지한다.

## Commands

- Install: `python -m pip install -r requirements.txt`
- Compile: `python -m compileall -q app.py build_data.py`
- Streamlit smoke: `python -c "from streamlit.testing.v1 import AppTest; at=AppTest.from_file('app.py', default_timeout=200); at.run(); print(at.exception or 'OK')"`
- JavaScript syntax: `node --check merge.js` and `node --check export.js`
- Run: `python -m streamlit run app.py`
- Rebuild all local data: `python build_data.py`
- Rebuild selected raw folder: `python build_data.py <raw-folder>`

## Completion Check

- 문서만 바꿔도 링크, 경로, 명령, 현재 파일 구조를 확인한다.
- 코드 변경은 Python compile, Streamlit smoke, 관련 JavaScript syntax 검사를 실행한다.
- Streamlit smoke는 iframe 래퍼의 시작만 확인한다. 화면 변경은 백업을 연 브라우저에서 관련 상호작용을 별도로 검증한다.
- 지표·기간·병합 변경은 대표 월·주·일의 기존 결과와 새 결과를 대조한다.
- 실적 갱신은 빌드 로그와 생성 백업을 확인하되, 공개 저장소에는 코드·문서만 반영한다.
- 사용자가 명시적으로 배포를 요청한 경우에만 검증된 변경을 `main`에 push한다.
