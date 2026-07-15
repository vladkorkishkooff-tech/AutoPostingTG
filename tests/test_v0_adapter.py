import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ai_gen import _extract_v0_assistant_content


class V0AdapterTests(unittest.TestCase):
    def test_extracts_latest_assistant_message(self):
        payload = {
            "latestVersion": {
                "messages": [
                    {"role": "user", "content": "topic"},
                    {"role": "assistant", "content": "🪐 Первый факт"},
                    {"role": "assistant", "content": "🪐 Второй факт"},
                ]
            }
        }
        self.assertEqual(_extract_v0_assistant_content(payload), "🪐 Второй факт")

    def test_returns_empty_for_missing_assistant_message(self):
        self.assertEqual(_extract_v0_assistant_content({"messages": []}), "")
