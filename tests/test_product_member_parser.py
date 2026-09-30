import unittest
import sys
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


if __name__ == '__main__':
    unittest.main()
