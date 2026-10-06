import unittest
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import build_data


class ProductMemberParserTest(unittest.TestCase):
    def test_product_rows_map_member_flags_to_dashboard_segments(self):
        header = [
            '결제_일자(YYYYMMDD)', 'BPU', 'AF대분류명', '대카테고리명',
            'ADMIN브랜드명', '상품코드', '상품명', '당월신규여부',
            '당년신규여부', '거래액', '주문고객수',
        ]
        rows = [
            ['20260929', 'e-영업1', '광고', '가방', '브랜드', 'P1', '상품1', 'Y', 'Y', '100', '1'],
            ['20260929', 'e-영업1', '광고', '가방', '브랜드', 'P2', '상품2', 'N', 'Y', '200', '2'],
            ['20260929', 'e-영업1', '광고', '가방', '브랜드', 'P3', '상품3', 'N', 'N', '300', '3'],
        ]

        parsed = build_data._product_rows(header, rows, 'test.csv')

        self.assertEqual([row[9] for row in parsed], [1, 2, 3])
        self.assertEqual(sum(row[7] for row in parsed), 600)

    def test_legacy_product_rows_remain_readable_without_member_flags(self):
        header = [
            '결제_일자(YYYYMMDD)', 'BPU', 'AF대분류명', '대카테고리명',
            'ADMIN브랜드명', '상품코드', '상품명', '거래액', '주문고객수',
        ]
        rows = [['20260929', 'e-영업1', '광고', '가방', '브랜드', 'P1', '상품1', '100', '1']]

        parsed = build_data._product_rows(header, rows, 'legacy.csv')

        self.assertEqual(parsed[0][9], 0)

    def test_product_view_daily_rows_keep_member_bpu_and_product_group(self):
        rows = [
            ['지표', '회원구분', '채널', 'BPU', '상품군', '2026'],
            ['', '', '', '', '', '9/29'],
            ['일평균거래액', '*TOTAL', '*TOTAL', '*TOTAL', '*TOTAL', '1000'],
            ['일평균거래액', '3_기존', '*TOTAL', '*TOTAL', '*TOTAL', '100'],
            ['일평균거래액', '1_당월신규', '광고', 'e-영업1', '여성', '8934746'],
            ['일평균고객수', '1_당월신규', '광고', 'e-영업1', '여성', '48'],
        ]
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / '상품관점 - 일자별 실적(기본).csv'
            path.write_text('\n'.join(','.join(row) for row in rows), encoding='utf-8-sig')
            daily, weekly = {}, {}

            build_data.read_product_csv(path, source_daily=daily, source_weekly=weekly)

        self.assertEqual(daily[('2026-09-29', '1_당월신규', '광고', 'e-영업1', '여성')], [8934746.0, 48.0])
        self.assertEqual(weekly, {})

    def test_weekly_product_view_fills_missing_dates_but_daily_wins(self):
        weekly = {
            (2026, 10, 1, '1_당월신규', '광고', 'e-영업1', '여성'): [700.0, 7.0],
        }
        daily = {
            ('2026-09-29', '1_당월신규', '광고', 'e-영업1', '여성'): [900.0, 9.0],
        }

        result = build_data._expand_product_source(daily, weekly, '2026-09-29')

        self.assertEqual(result[('2026-09-28', '1_당월신규', '광고', 'e-영업1', '여성')], [700.0, 7.0])
        self.assertEqual(result[('2026-09-29', '1_당월신규', '광고', 'e-영업1', '여성')], [900.0, 9.0])
        self.assertNotIn(('2026-09-30', '1_당월신규', '광고', 'e-영업1', '여성'), result)


if __name__ == '__main__':
    unittest.main()
