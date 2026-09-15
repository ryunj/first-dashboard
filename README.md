# 첫구매 실적 대시보드

첫구매 · 가입 · 앱푸시 수신동의 실적을 월별 · 주별 · 일별로 보는 정적 대시보드(HTML 한 장 + 스크립트).
**저장소에는 실적 데이터가 없다.** 데이터는 백업 파일(`.json.gz`)로만 주고받는다.

## 웹에서 보기 (누구나)

1. 배포 주소를 연다.
2. 받은 **백업 파일을 화면에 끌어다 놓거나** `백업 파일 열기`로 고른다.
3. 데이터는 서버로 올라가지 않고 **그 브라우저에만** 저장된다(IndexedDB). 새로고침해도 유지, 위쪽 안내줄의 `백업 데이터 지우기`로 삭제.

## Streamlit 으로 배포

Streamlit Cloud → New app → Repository `ryunj/first-dashboard` · Branch `main` · **Main file path `app.py`**.
`app.py` 가 `dashboard.html`(+ `merge.js`)을 화면 가득 띄운다. 데이터는 서버에 없고, 보는 사람이 백업 파일을 끌어다 놓거나 열면 그 브라우저에만 저장된다.
보는 사람을 제한하려면 Streamlit Cloud 앱 설정(Sharing)에서 이메일로 초대한 사람만 보게 할 수 있다.

## 일자별 갱신

| 방법 | 순서 |
|---|---|
| 브라우저만 | 전날 백업 열기 → 상단 `새 데이터 추가`에서 그날 raw 폴더(예: `2026년/0915`) 선택 · 끌어다 놓기 → 결과 확인 → `적용하고 백업 다운로드` |
| 로컬 빌드 | raw 폴더를 이 폴더에 넣고 `python build_data.py` → `data/` 갱신 + `backup/첫구매대시보드_백업_데이터YYYYMMDD.json.gz` 생성 |

- 같은 날짜 · 주차는 새 파일 값으로 바뀌고, 빈 칸은 기존 값을 지우지 않는다. 회원현황이 모두 0인 날(미갱신)은 건너뛴다.
- 브라우저는 xlsx 를 읽지 않는다 → APP설치데이터 · 조직 카테고리별 실적은 CSV 로 저장해 올린다.
- 합치는 규칙은 `build_data.py`(파이썬)와 `merge.js`(브라우저)에 같게 들어 있다. 한쪽을 바꾸면 다른 쪽도 고친다.

## 파일

| 파일 | 역할 |
|---|---|
| `dashboard.html` | 대시보드 (`index.html` 은 이리로 이동) |
| `merge.js` | 브라우저에서 raw 를 백업에 합치기 |
| `export.js` | 엑셀(.xlsx) 다운로드 — 라이브러리 없이 서식 포함 파일 생성 (PDF 는 인쇄 창에서 'PDF로 저장') |
| `app.py` · `requirements.txt` | Streamlit 배포 (Main file path `app.py`) |
| `build_data.py` | 로컬 raw 폴더 → `data/data.js` · `data/products.js` · 백업 |
| `kpi.example.js` | KPI 목표 형식 — `kpi.js` 로 복사해 값 입력 |

저장소에 올리지 않는 것(`.gitignore`): raw 폴더 · `data/` · `backup/` · `kpi.js`(목표 수치) · 검증 스크립트(`selftest.js`, `test_build.py` — 실제 수치로 대조) · 스크린샷.
