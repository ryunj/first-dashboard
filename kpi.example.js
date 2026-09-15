// KPI 목표 예시 — 이 파일을 kpi.js 로 복사해 목표값을 넣는다. kpi.js 는 실제 목표 수치라 저장소에 올리지 않는다(.gitignore).
// 빌드(build_data.py)가 만드는 백업 파일에는 kpi.js 내용이 함께 담겨, 웹에서 백업을 불러오면 KPI 도 보인다.
window.DASH_KPI = {
  year: 2026,
  // 당년신규 = 당월신규(1) + 기가입신규(2)
  segs: ['1', '2'],
  segLabel: '당년신규',
  // 실적 원천 — 'newmember' = 신규회원실적대시보드 총)첫구매 거래액·고객수 (당년신규). 그 파일이 없으면 위 segs(전체관점 회원구분) 합을 쓴다
  source: 'newmember',
  targets: {
    amt: null,   // 첫구매 거래액 연간 누적 목표 (원)
    cust: null,  // 첫구매 고객수 연간 누적 목표 (명)
    tr: null,    // 비회원 트래픽 연간 누적 목표
    sg: null,    // 가입자수 연간 누적 목표
  },
};
