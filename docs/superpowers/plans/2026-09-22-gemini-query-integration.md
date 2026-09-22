# Gemini 자연어 실적문의 연동 계획

## 목표

기존 `ai_question.js`의 공식 계산·렌더링 경로는 유지하고, Streamlit 서버의 Gemini API가 자연어를 검증 가능한 조회조건 JSON으로만 변환한다. 실적 원본과 계산 결과는 서버나 Gemini로 보내지 않는다.

## 고정 원칙

- API 키는 `st.secrets["GEMINI_API_KEY"]`에서만 읽고 브라우저 HTML·JavaScript·로그·오류문에 포함하지 않는다.
- Gemini는 기간·지표·필터·구분을 해석할 뿐 숫자를 계산하지 않는다.
- 실제 실적은 기존 `analyze()`와 `window.__dash`의 공식 함수로 브라우저에서 계산한다.
- Gemini 출력은 서버에서 스키마와 허용값을 검증·정규화한 뒤 브라우저에서도 다시 검증한다.
- Gemini가 없거나 실패하면 기존 로컬 파서로 같은 질문을 처리한다.
- 질문 UI 위치, 기본 접힘, 기존 스타일, 14일 선행 액션 규칙은 바꾸지 않는다.

## 구조

```text
질문창
  -> Streamlit 양방향 컴포넌트(질문 + 현재 허용 필터만 전달)
  -> app.py
  -> gemini_query.py (키 로딩, REST 호출, JSON 추출·검증)
  -> 검증된 조회조건
  -> ai_question.js
  -> 기존 analyze()/window.__dash 공식 계산
```

Streamlit의 기존 단방향 `components.html()`은 iframe 입력을 Python으로 돌려줄 수 없으므로, 얇은 커스텀 컴포넌트 래퍼를 사용한다. 래퍼는 질문과 검증된 조회조건만 중계하며 데이터 백업에는 접근하지 않는다.

## 구현 순서

1. 키 설정 여부, 응답 추출, 조회조건 검증, 오류 변환의 실패 테스트를 먼저 추가한다.
2. `gemini_query.py`에 순수 검증 함수와 주입 가능한 HTTP 호출 함수를 구현한다.
3. 컴포넌트 래퍼와 `app.py`의 요청/응답 연결을 추가한다.
4. `ai_question.js`에 Gemini 요청 대기·응답 검증·로컬 fallback을 추가한다.
5. UI 문구를 실제 동작에 맞추고 키·연결 상태만 노출한다.
6. Python·Node·브라우저·Streamlit 회귀 검사를 모두 실행한다.

## 오류 처리

- 키 없음: `Gemini 미연결 · 기존 질문 해석 사용`
- 인증·할당량·네트워크 오류: 키나 원문 응답을 노출하지 않는 안내 후 로컬 파서로 fallback
- JSON 오류·스키마 위반·허용되지 않은 값: 서버에서 거절하고 로컬 파서로 fallback
- 애매한 질문: Gemini가 `clarification`을 반환하면 계산하지 않고 확인 질문을 표시

## 테스트 기준

- 실제 키를 fixture·스냅샷·커밋에 넣지 않는다.
- 가짜 전송 함수를 사용해 요청 헤더에만 키가 있고 반환 payload에는 키가 없는지 확인한다.
- 잘못된 날짜·지표·채널·회원구분·BPU·카테고리·초과 길이를 거절한다.
- Gemini 성공 시 기존 `analyze()` 결과가 공식 `compute()`와 일치한다.
- Gemini 실패·미연결 시 기존 로컬 파서 결과가 유지된다.

