# 실적 갱신·검증·배포

## 가장 빠른 갱신: 브라우저

1. 배포된 대시보드에서 최신 `.json.gz` 백업을 연다.
2. 상단 `새 데이터 추가`에 해당 날짜 raw 폴더를 올린다.
3. 파일별 읽음/건너뜀/오류, 새 날짜, 변경된 기존 셀 수를 확인한다.
4. 결과가 맞으면 적용하고 새 백업을 다운로드한다.
5. 새 백업을 다시 열어 최신 데이터 날짜와 주요 지표를 확인한다.

브라우저는 XLSX를 읽지 않는다. `APP설치데이터`와 `조직 카테고리별 첫구매 실적`은 CSV로 저장해 올린다. 이 방식은 작업한 사람의 브라우저 IndexedDB만 갱신한다. 다른 사람의 브라우저 데이터는 바뀌지 않으므로, 갱신한 백업을 안전한 경로로 공유하고 각자가 새 백업을 열어야 한다. 코드 저장소 push나 대시보드 재배포는 실적 갱신에 필요하지 않다.

## 로컬 전체 빌드

1. 저장소 아래에 전체 이력 raw 폴더와 일자별 추가 폴더를 준비한다.
2. 실제 목표가 필요하면 `kpi.example.js`를 `kpi.js`로 복사해 값을 입력한다.
3. `python build_data.py`를 실행한다. 특정 폴더만 읽으려면 경로를 인자로 준다.
4. `data/data.js`, `data/products.js`, `backup/첫구매대시보드_백업_데이터YYYYMMDD.json.gz` 생성 여부를 확인한다.
5. 빌드 로그에서 읽음/건너뜀/오류, 일별 기간, 주별 기간, 시리즈 수, 상품 행·상품 수를 확인한다.

같은 날짜·주차는 수정시각이 늦은 입력이 덮어쓰며, 빈 값은 기존 값을 지우지 않는다. 회원현황만 있고 핵심 실적이 없는 뒤쪽 날짜는 최신 실적일로 채택하지 않는다.

## 필수 대조

- 최신 날짜가 의도한 날짜인지 확인한다.
- 전체 채널에서 첫구매 거래액·고객수·트래픽·가입자수를 원천과 대조한다.
- 최신 완결 주와 진행 중 주를 각각 확인한다.
- 가입률, 당일가입 CR, 첫구매율이 분자·분모 재계산과 일치하는지 본다.
- 상품 커버리지, 상품UV/CR, 신규 설치, 수신동의, 회원현황이 기대한 날짜까지 들어왔는지 본다.
- 기존 백업을 연 뒤 새 raw를 브라우저로 합친 결과와 로컬 빌드 결과가 같은지 확인한다.
- 메모가 있는 백업을 열고 리뷰/계획 한쪽만 쓴 메모, 기간 겹침 필터, 수정·삭제를 확인한다.

## 코드 검증

```text
python -m compileall -q app.py build_data.py
python -c "from streamlit.testing.v1 import AppTest; at=AppTest.from_file('app.py', default_timeout=200); at.run(); print(at.exception or 'OK')"
node --check merge.js
node --check export.js
```

실데이터는 Git에 없으므로 앱 smoke 성공과 실적 재빌드 성공은 별도로 보고한다.

## 로컬 실행

```text
python -m pip install -r requirements.txt
python -m streamlit run app.py
```

Streamlit 컴포넌트에서는 `dashboard.html`, `merge.js`, `export.js`, `ai_question.js`가 한 문서로 합쳐진다. 저장소에 `data/`가 없어도 백업 파일을 열어 사용할 수 있다. 로컬에 Gemini 키가 없으면 기존 브라우저 질문 해석으로 동작한다.

## 배포

- Streamlit Community Cloud: repository `ryunj/first-dashboard`, branch `main`, main file `app.py`
- Gemini 질문 기능: Settings → Secrets에 `GEMINI_API_KEY = "..."` 등록. 키 값은 로그·화면·저장소에 기록하지 않는다. 모델을 바꿀 때만 `GEMINI_MODEL = "..."`을 추가한다.
- 코드/문서 수정은 검증 후 `main`에 push하면 자동 재배포된다.
- 실적 업데이트만 하는 일반 운영은 새 백업 파일을 사용자에게 전달하면 되며 코드 배포가 필요 없다.
- 같은 대시보드 주소를 여러 사람이 사용해도 백업은 사용자 브라우저별로 독립이다. 서버에 실적을 올리거나 자동 동기화하지 않는다.
- 공개 저장소에는 `data/`, `backup/`, raw CSV/XLSX/XLS, `kpi.js`, 실제 수치 검증 파일을 올리지 않는다.
- 백업에는 민감한 실적·KPI·메모가 포함될 수 있으므로 사내 보안 기준에 따라 전달한다.
