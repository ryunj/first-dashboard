"""Regression test: an unpinned "latest" day must use its visible date for memo overlap."""
import json
import os
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]


def browser_kwargs(playwright):
    explicit = os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE')
    candidates = [
        explicit,
        r'C:\Program Files\Google\Chrome\Application\chrome.exe',
        r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
    ]
    for candidate in candidates:
        if candidate and Path(candidate).exists():
            return {'executable_path': candidate}
    return {}


def synthetic_data():
    dates = [f'2026-09-{day:02d}' for day in range(7, 21)]
    n = len(dates)
    return {
        'meta': {'built': 'test', 'sources': ['test'], 'lastDate': dates[-1], 'channels': ['*TOTAL']},
        'daily': {'p': dates, 's': {
            'amt|T|*TOTAL': [100] * n,
            'cust|T|*TOTAL': [10] * n,
            'tr|*TOTAL': [1000] * n,
            'sg|*TOTAL': [100] * n,
            'fpn|*TOTAL': [50] * n,
            'crn|*TOTAL': [10] * n,
        }},
        'weekly': {'p': [], 's': {}},
    }


def main():
    html = (ROOT / 'dashboard.html').read_text(encoding='utf-8')
    marker = '<script>\nwindow.__dashMain = function () {'
    inject = '<script>window.DASH_DATA=' + json.dumps(synthetic_data(), ensure_ascii=False)
    inject += ';window.DASH_PROD=null;window.DASH_KPI=null;</script>\n'
    assert marker in html
    html = html.replace(marker, inject + marker, 1)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, **browser_kwargs(p))
        page = browser.new_page()
        page.set_content(html, wait_until='networkidle')
        page.wait_for_function('window.__dash && window.FP_MEMOS')
        page.evaluate("""
          () => {
            window.FP_MEMOS.add({
              id:'week-37', text:'9월 2주 메모', html:'9월 2주 메모', html2:'', color:'blue',
              created:'2026-09-13T12:00:00+09:00', updated:'2026-09-13T12:00:00+09:00',
              view:{year:2026,grain:'week',mode:'avg',cmp:'yoy',cmpY:1,at:'2026-W37',range:'13',
                    chans:['*TOTAL'],segs:['T'],layout:'block',bpus:[],bpuAll:true,cats:[],catNone:false}
            });
            Object.assign(window.__dash.state,{year:2026,grain:'day',mode:'avg',cmp:'yoy',cmpY:1,chans:['*TOTAL'],segs:['T']});
            window.__dash.state.at.day='';
            window.__dash.render();
          }
        """)
        page.evaluate("document.querySelector('[data-memof=\"view\"]').click()")
        latest_count = page.locator('#memoList .memo-item').count()
        latest_date = page.locator('#dateAt').input_value()
        view_selected = page.locator('[data-memof="view"]').get_attribute('aria-pressed')

        page.evaluate("""
          () => { window.__dash.state.at.day='2026-09-10'; window.__dash.render(); }
        """)
        overlap_count = page.locator('#memoList .memo-item').count()
        browser.close()

    assert latest_date == '2026-09-20', latest_date
    assert view_selected == 'true', f'view filter did not activate: {view_selected}'
    assert latest_count == 0, f'9/20 latest view incorrectly showed {latest_count} memo(s) from 9/7~9/13'
    assert overlap_count == 1, f'9/10 overlap should show the weekly memo, got {overlap_count}'
    print('OK: latest day excludes old weekly memo; overlapping day includes it')


if __name__ == '__main__':
    main()
