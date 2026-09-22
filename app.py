# -*- coding: utf-8 -*-
"""첫구매 실적 대시보드 — Streamlit 배포용 (Streamlit Cloud 의 Main file path: app.py)

dashboard.html 을 그대로 화면 가득 띄운다. 데이터는 저장소에도 서버에도 없다:
화면에 백업 파일(.json.gz)을 끌어다 놓거나 '백업 파일 열기'로 고르면, 보는 사람의 브라우저(IndexedDB)에만 저장해 조회한다.
Gemini 는 서버에서 자연어를 조회조건으로만 바꾸며 실제 실적 계산은 브라우저의 기존 공식이 담당한다.
"""
from pathlib import Path

import streamlit as st
import streamlit.components.v1 as components

from gemini_query import (
    GeminiQueryError,
    connection_test,
    generate_query,
    load_gemini_config,
    public_connection_status,
)

ROOT = Path(__file__).resolve().parent
DASHBOARD_COMPONENT = components.declare_component(
    "first_purchase_dashboard",
    path=str(ROOT / "streamlit_component"),
)

st.set_page_config(page_title='첫구매 실적 대시보드', page_icon='📊', layout='wide', initial_sidebar_state='collapsed')
# Streamlit 기본 헤더 · 여백을 걷어 내고 대시보드가 화면을 꽉 채우게
st.markdown(
    """<style>
    header[data-testid="stHeader"], [data-testid="stToolbar"], [data-testid="stDecoration"], footer {display: none !important;}
    .block-container, [data-testid="stMainBlockContainer"] {padding: 0 !important; max-width: 100% !important;}
    /* 바깥(Streamlit) 페이지는 스크롤하지 않고 대시보드 iframe 이 화면 높이를 꽉 채운다 —
       기본 컴포넌트 칸(900px)이 화면보다 크거나 작으면 두 겹 스크롤 · 하단 잘림이 생긴다 */
    html, body, .stApp, [data-testid="stAppViewContainer"], [data-testid="stMain"] {overflow: hidden !important;}
    [data-testid="stVerticalBlock"] {gap: 0 !important;}
    [data-testid="stMainBlockContainer"], [data-testid="stVerticalBlock"], [data-testid="stElementContainer"]:has(iframe) {height: 100vh !important; height: 100dvh !important;}
    iframe {display: block; width: 100% !important; height: 100vh !important; height: 100dvh !important; border: 0;}
    </style>""",
    unsafe_allow_html=True,
)


@st.cache_data(show_spinner=False)
def page(stamp):
    """dashboard.html + 보조 JS 를 한 장으로 — stamp(수정시각)가 바뀌면 다시 읽는다"""
    html = (ROOT / 'dashboard.html').read_text(encoding='utf-8')
    merge = (ROOT / 'merge.js').read_text(encoding='utf-8')
    export = (ROOT / 'export.js').read_text(encoding='utf-8')
    ai_question = (ROOT / 'ai_question.js').read_text(encoding='utf-8')
    marker = '<div id="selbar"'
    if marker not in html:
        raise RuntimeError('dashboard.html 구조가 바뀌어 보조 JS 를 넣을 자리를 찾지 못했습니다')
    # DASH_EMBED: 같은 폴더의 data/data.js · kpi.js · products.js 를 찾지 않고 백업으로만 연다
    return html.replace(marker, f"<script>window.DASH_EMBED = 'streamlit';</script>\n<script>\n{merge}\n</script>\n<script>\n{export}\n</script>\n<script>\n{ai_question}\n</script>\n{marker}", 1)


@st.cache_data(ttl=3600, show_spinner=False)
def check_gemini(api_key, model):
    """배포 세션마다 반복 호출하지 않도록 최소 연결 확인을 캐시한다."""
    return connection_test(api_key, model=model)


config = load_gemini_config(st.secrets)
if config.api_key:
    try:
        check = check_gemini(config.api_key, config.model)
        gemini_status = public_connection_status(config, checked=True, ok=True, message=check["message"])
    except GeminiQueryError:
        gemini_status = public_connection_status(config, checked=True, ok=False)
else:
    gemini_status = public_connection_status(config, checked=False)

stamp = tuple((ROOT / f).stat().st_mtime for f in ('dashboard.html', 'merge.js', 'export.js', 'ai_question.js'))
response = st.session_state.get("gemini_ai_response")
request = DASHBOARD_COMPONENT(
    html=page(stamp),
    pageStamp="|".join(str(value) for value in stamp),
    geminiStatus=gemini_status,
    aiResponse=response,
    key="first-purchase-dashboard",
    default=None,
)

if isinstance(request, dict) and request.get("type") == "gemini_query" and request.get("id"):
    request_id = str(request["id"])[:100]
    if request_id != st.session_state.get("gemini_last_request_id"):
        question = request.get("question", "")
        context = request.get("context") if isinstance(request.get("context"), dict) else {}
        try:
            if not config.api_key:
                raise GeminiQueryError("Gemini 키가 설정되지 않아 기존 질문 해석을 사용합니다.")
            query = generate_query(question, context, config.api_key, model=config.model)
            result = {"id": request_id, "ok": True, "query": query}
        except GeminiQueryError as error:
            result = {"id": request_id, "ok": False, "message": str(error)}
        st.session_state["gemini_last_request_id"] = request_id
        st.session_state["gemini_ai_response"] = result
        st.rerun()
