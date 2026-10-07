import tempfile
import unittest
from pathlib import Path

import build_data


class DiscoverRawDirectoryTests(unittest.TestCase):
    def test_directory_with_only_app_install_xlsx_is_included(self):
        with tempfile.TemporaryDirectory() as tmp:
            raw = Path(tmp) / "2026년"
            raw.mkdir()
            (raw / "APP설치데이터.xlsx").touch()

            self.assertEqual(build_data.discover([str(raw)]), [raw])


if __name__ == "__main__":
    unittest.main()
