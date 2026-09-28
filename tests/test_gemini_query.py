import copy
import json
import unittest

from gemini_query import (
    GeminiQueryError,
    connection_test,
    generate_insight,
    generate_query,
    load_gemini_config,
    normalize_query,
    public_connection_status,
)


CONTEXT = {
    "metrics": ["amt", "cust", "aov", "tr", "sg", "jr", "cr", "fpr"],
    "channels": ["*TOTAL"],
    "segments": ["T"],
    "availableChannels": ["*TOTAL", "직접", "광고"],
    "bpus": [],
    "categories": [],
    "availableBpus": ["e-영업1", "e-영업2"],
    "availableCategories": ["아웃도어", "리빙"],
    "dataFirst": "2024-01-01",
    "dataLast": "2026-09-21",
}


def valid_payload():
    return {
        "action": "query",
        "clarification": "",
        "events": [
            {
                "name": "2026년 8월",
                "start": "2026-08-01",
                "end": "2026-08-31",
                "kind": "month",
            }
        ],
        "preDays": 7,
        "postDays": 7,
        "metrics": ["amt", "cust"],
        "appMetrics": [],
        "dimensions": ["channel", "bpu", "category"],
        "families": ["core", "product"],
        "channels": ["광고"],
        "segments": ["T"],
        "bpus": ["e-영업1"],
        "categories": ["아웃도어"],
        "explicit": {
            "metrics": True,
            "channels": True,
            "segments": False,
            "bpus": True,
            "categories": True,
            "dimensions": True,
        },
    }


class SecretTests(unittest.TestCase):
    def test_secret_loading_exposes_only_status(self):
        config = load_gemini_config({"GEMINI_API_KEY": "secret-value", "GEMINI_MODEL": "gemini-test"})
        self.assertEqual(config.api_key, "secret-value")
        self.assertEqual(config.model, "gemini-test")
        status = public_connection_status(config, checked=False)
        self.assertEqual(status, {"configured": True, "checked": False, "ok": False, "message": "Gemini 키 설정됨"})
        self.assertNotIn("secret-value", json.dumps(status, ensure_ascii=False))

    def test_missing_secret_is_safe(self):
        config = load_gemini_config({})
        self.assertIsNone(config.api_key)
        self.assertFalse(public_connection_status(config, checked=False)["configured"])


class ValidationTests(unittest.TestCase):
    def test_normalizes_allowed_query_without_calculating_values(self):
        result = normalize_query(valid_payload(), CONTEXT, question="8월 광고 실적")
        self.assertEqual(result["events"][0]["start"], "2026-08-01")
        self.assertEqual(result["channels"], ["광고"])
        self.assertNotIn("result", result)
        self.assertNotIn("values", result)

    def test_rejects_invalid_date_and_unknown_filters(self):
        bad_date = valid_payload()
        bad_date["events"][0]["end"] = "2026-02-30"
        with self.assertRaisesRegex(GeminiQueryError, "날짜"):
            normalize_query(bad_date, CONTEXT, question="질문")

        bad_channel = valid_payload()
        bad_channel["channels"] = ["없는채널"]
        with self.assertRaisesRegex(GeminiQueryError, "채널"):
            normalize_query(bad_channel, CONTEXT, question="질문")

    def test_rejects_unknown_metric_and_excessive_window(self):
        bad_metric = valid_payload()
        bad_metric["metrics"] = ["made_up"]
        with self.assertRaisesRegex(GeminiQueryError, "지표"):
            normalize_query(bad_metric, CONTEXT, question="질문")

        bad_window = valid_payload()
        bad_window["preDays"] = 91
        with self.assertRaisesRegex(GeminiQueryError, "1~90"):
            normalize_query(bad_window, CONTEXT, question="질문")

    def test_clarification_does_not_require_events(self):
        payload = valid_payload()
        payload.update(action="clarify", clarification="8월 전체를 의미하나요?", events=[])
        result = normalize_query(payload, CONTEXT, question="8월 행사 어때?")
        self.assertEqual(result["action"], "clarify")
        self.assertEqual(result["events"], [])


class ApiTests(unittest.TestCase):
    def test_minimal_connection_call_keeps_key_in_header_only(self):
        captured = {}

        def transport(url, headers, payload, timeout):
            captured.update(url=url, headers=headers, payload=payload, timeout=timeout)
            return {"candidates": [{"content": {"parts": [{"text": '{"status":"ok"}'}]}}]}

        result = connection_test("secret-value", model="gemini-test", transport=transport)
        self.assertTrue(result["ok"])
        self.assertEqual(captured["headers"]["x-goog-api-key"], "secret-value")
        self.assertNotIn("secret-value", json.dumps(captured["payload"], ensure_ascii=False))
        self.assertNotIn("secret-value", json.dumps(result, ensure_ascii=False))

    def test_generate_query_extracts_and_validates_structured_json(self):
        payload = valid_payload()

        def transport(url, headers, request_payload, timeout):
            self.assertEqual(headers["x-goog-api-key"], "secret-value")
            self.assertEqual(request_payload["generationConfig"]["response_mime_type"], "application/json")
            self.assertIn("response_schema", request_payload["generationConfig"])
            self.assertIn("2주 전", request_payload["system_instruction"]["parts"][0]["text"])
            self.assertIn("preDays=14", request_payload["system_instruction"]["parts"][0]["text"])
            return {"candidates": [{"content": {"parts": [{"text": json.dumps(payload, ensure_ascii=False)}]}}]}

        result = generate_query("8월 광고 실적", CONTEXT, "secret-value", model="gemini-test", transport=transport)
        self.assertEqual(result["action"], "query")
        self.assertEqual(result["events"][0]["end"], "2026-08-31")

    def test_generate_insight_uses_only_bounded_aggregate_evidence(self):
        captured = {}
        response = {
            "headline": "8월 거래액은 늘었지만 가입 전환은 약해졌습니다.",
            "summary": "거래액 증가보다 트래픽 증가가 더 컸습니다.",
            "findings": ["첫구매 거래액은 전년 동기간 대비 18.6% 증가했습니다."],
            "action": "예상 상승 시점 2주 전부터 가입 전환을 점검하세요.",
            "caveat": "원인으로 단정할 수 없습니다.",
        }
        evidence = {
            "conditions": ["2026년 8월", "전년 동기간·동요일", "채널 전체"],
            "sections": [{
                "title": "핵심 실적",
                "columns": ["지표", "2025", "2026", "증감"],
                "rows": [["첫구매 거래액", "98백만원", "116백만원", "+18.6%"]],
            }],
            "actionBasis": "권장 액션 시작은 예상 상승 시점 14일 전",
            "dataAsOf": "2026-09-21",
            "rawBackup": {"daily": [100000000, 200000000]},
        }

        def transport(url, headers, request_payload, timeout):
            captured["prompt"] = request_payload["contents"][0]["parts"][0]["text"]
            captured["schema"] = request_payload["generationConfig"]["response_schema"]
            return {"candidates": [{"content": {"parts": [{"text": json.dumps(response, ensure_ascii=False)}]}}]}

        result = generate_insight("8월 전년비를 알려줘", evidence, "secret-value", model="gemini-test", transport=transport)
        self.assertEqual(result["headline"], response["headline"])
        self.assertIn("+18.6%", captured["prompt"])
        self.assertNotIn("rawBackup", captured["prompt"])
        self.assertNotIn("100000000", captured["prompt"])
        self.assertEqual(captured["schema"]["required"], ["headline", "summary", "findings", "action", "caveat"])

    def test_generate_insight_rejects_unusable_response(self):
        def transport(*_args):
            payload = {"headline": "", "summary": "", "findings": [], "action": "", "caveat": ""}
            return {"candidates": [{"content": {"parts": [{"text": json.dumps(payload)}]}}]}

        with self.assertRaisesRegex(GeminiQueryError, "인사이트"):
            generate_insight("질문", {"conditions": [], "sections": []}, "secret-value", transport=transport)

    def test_prompt_context_drops_raw_or_unknown_client_fields(self):
        payload = valid_payload()
        captured = {}

        def transport(url, headers, request_payload, timeout):
            captured["prompt"] = request_payload["contents"][0]["parts"][0]["text"]
            return {"candidates": [{"content": {"parts": [{"text": json.dumps(payload, ensure_ascii=False)}]}}]}

        context = copy.deepcopy(CONTEXT)
        context["data"] = {"raw": [100000000]}
        context["history"] = [{"question": "이전 질문", "query": {"events": []}, "rawValues": [100000000]}]
        generate_query("8월 광고 실적", context, "secret-value", model="gemini-test", transport=transport)
        self.assertNotIn("rawValues", captured["prompt"])
        self.assertNotIn("100000000", captured["prompt"])
        self.assertNotIn('"data"', captured["prompt"])
        self.assertIn("이전 질문", captured["prompt"])

    def test_bad_json_and_api_failure_are_user_safe(self):
        def bad_json(*_args):
            return {"candidates": [{"content": {"parts": [{"text": "not-json"}]}}]}

        with self.assertRaisesRegex(GeminiQueryError, "응답 형식"):
            generate_query("질문", CONTEXT, "secret-value", transport=bad_json)

        def failed(*_args):
            raise RuntimeError("request failed with secret-value")

        with self.assertRaises(GeminiQueryError) as raised:
            generate_query("질문", CONTEXT, "secret-value", transport=failed)
        self.assertNotIn("secret-value", str(raised.exception))


if __name__ == "__main__":
    unittest.main()
