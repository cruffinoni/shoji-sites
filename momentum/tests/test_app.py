import importlib.util
import json
import tempfile
import threading
import unittest
from http.client import HTTPConnection
from pathlib import Path

SERVER_PATH = Path(__file__).resolve().parents[1] / "server" / "app.py"


class TaskApiTests(unittest.TestCase):
    def setUp(self):
        import sys
        self.original_sys_path = sys.path[:]
        sys.path.insert(0, str(SERVER_PATH.parent))
        spec = importlib.util.spec_from_file_location("app", SERVER_PATH)
        self.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.module)
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmp.name) / "tasks.sqlite3"
        self.server = self.module.create_server("127.0.0.1", 0, self.db_path)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.port = self.server.server_address[1]

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        self.tmp.cleanup()
        import sys
        sys.path[:] = self.original_sys_path
        self.assertEqual(sys.path, self.original_sys_path)

    def request(self, method, path, body=None, raw=None):
        conn = HTTPConnection("127.0.0.1", self.port, timeout=3)
        payload = raw if raw is not None else None if body is None else json.dumps(body)
        headers = {"Content-Type": "application/json"} if payload is not None else {}
        conn.request(method, path, body=payload, headers=headers)
        response = conn.getresponse()
        data = response.read()
        status, response_headers = response.status, response.headers
        conn.close()
        return status, json.loads(data) if data else None, response_headers

    def create_task(self, title, planned_date="2026-10-24", **extra):
        return self.request("POST", "/day-reset-api/tasks", {"title": title, "planned_date": planned_date, **extra})

    def test_database_unavailable_returns_json_500_without_disconnect(self):
        self.db_path.unlink()
        self.db_path.mkdir()
        try:
            status, payload, headers = self.request("GET", "/tasks?date=2026-10-24")
            self.assertEqual(status, 500)
            self.assertEqual(payload, {"error": "task database unavailable"})
            self.assertEqual(headers.get_content_type(), "application/json")
        finally:
            self.db_path.rmdir()

    def test_server_refuses_non_loopback_binding(self):
        with self.assertRaises(ValueError):
            self.module.create_server("0.0.0.0", 0, self.db_path)

    def test_server_allows_non_loopback_when_requested(self):
        server = self.module.create_server("0.0.0.0", 0, self.db_path, allow_non_loopback=True)
        try:
            self.assertEqual(server.server_address[0], "0.0.0.0")
        finally:
            server.server_close()

    def test_health_headers_and_prefix_stripping(self):
        status, payload, headers = self.request("GET", "/day-reset-api/healthz")
        self.assertEqual((status, payload), (200, {"ok": True}))
        self.assertEqual(headers.get("Cache-Control"), "no-store")
        self.assertEqual(headers.get("X-Content-Type-Options"), "nosniff")
        self.assertEqual(self.request("GET", "/healthz")[:2], (200, {"ok": True}))

    def test_create_filter_update_delete_crud(self):
        status, payload, _ = self.create_task("Buy milk", group="Home", estimate="S")
        task = payload["task"]
        self.assertEqual(status, 201)
        self.assertEqual(task["title"], "Buy milk")
        self.assertEqual(task["planned_date"], "2026-10-24")
        self.assertEqual(task["group"], "Home")
        self.assertEqual(self.request("GET", "/day-reset-api/tasks?date=2026-10-24")[1]["tasks"], [task])
        self.create_task("Other", "2026-10-25")
        self.assertEqual(len(self.request("GET", "/tasks?date=2026-10-24")[1]["tasks"]), 1)
        status, updated, _ = self.request("PATCH", f"/tasks/{task['id']}", {"completed": True, "title": "Buy oat milk"})
        self.assertEqual(status, 200)
        self.assertTrue(updated["task"]["completed"])
        self.assertEqual(updated["task"]["title"], "Buy oat milk")
        self.assertEqual(self.request("DELETE", f"/tasks/{task['id']}")[0], 204)
        self.assertEqual(self.request("DELETE", f"/tasks/{task['id']}")[0], 404)

    def test_duplicate_task_titles_are_rejected_but_same_title_on_another_date_is_allowed(self):
        status, first, _ = self.create_task("Buy   milk", "2026-10-24")
        self.assertEqual(status, 201)
        status, payload, _ = self.create_task(" buy milk ", "2026-10-24")
        self.assertEqual(status, 400)
        self.assertIn("already exists", payload["error"])
        self.assertEqual(self.create_task("Buy milk", "2026-10-25")[0], 201)

    def test_reorder_is_scoped_to_date_and_empty_date_is_noop(self):
        a = self.create_task("A")[1]["task"]["id"]
        b = self.create_task("B", "2026-10-25")[1]["task"]["id"]
        c = self.create_task("C")[1]["task"]["id"]
        d = self.create_task("D", "2026-10-25")[1]["task"]["id"]
        status, _, _ = self.request("PUT", "/tasks/reorder?date=2026-10-24", {"task_ids": [c, a]})
        self.assertEqual(status, 200)
        self.assertEqual([x["id"] for x in self.request("GET", "/tasks?date=2026-10-24")[1]["tasks"]], [c, a])
        self.assertEqual([x["id"] for x in self.request("GET", "/tasks?date=2026-10-25")[1]["tasks"]], [b, d])
        self.assertEqual(self.request("PUT", "/tasks/reorder?date=2026-10-26", {"task_ids": []})[0], 200)

    def test_database_persists_across_server_recreation(self):
        task = self.create_task("Persist me")[1]["task"]
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        self.server = self.module.create_server("127.0.0.1", 0, self.db_path)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.port = self.server.server_address[1]
        self.assertEqual(self.request("GET", "/tasks?date=2026-10-24")[1]["tasks"][0]["id"], task["id"])

    def test_rejects_invalid_dates_payloads_and_unknown_fields(self):
        for date in ["20261024", "2026-02-30", "2026-10-24T00:00:00"]:
            self.assertEqual(self.request("GET", f"/tasks?date={date}")[0], 400)
        for body in [{"title": "Missing date"}, {"title": "", "planned_date": "2026-10-24"},
                     {"title": "   ", "planned_date": "2026-10-24"},
                     {"title": "x", "planned_date": "2026-10-24", "unknown": 1}]:
            self.assertEqual(self.request("POST", "/tasks", body)[0], 400)
        task_id = self.create_task("Valid")[1]["task"]["id"]
        for body in [{}, {"unknown": 1}, {"completed": 1}, {"estimate": "XL"}, {"planned_date": "20261024"}]:
            self.assertEqual(self.request("PATCH", f"/tasks/{task_id}", body)[0], 400)
        self.assertEqual(self.request("POST", "/tasks", raw='{"title":')[0], 400)

    def test_unknown_task_and_invalid_reorder_are_rejected(self):
        self.assertEqual(self.request("PATCH", "/tasks/absent", {"title": "x"})[0], 404)
        self.assertEqual(self.request("DELETE", "/tasks/absent")[0], 404)
        task = self.create_task("A")[1]["task"]["id"]
        task_b = self.create_task("B")[1]["task"]["id"]
        self.assertEqual(self.request("PUT", "/tasks/reorder?date=2026-10-24", {"task_ids": ["unknown"]})[0], 400)
        self.assertEqual(self.request("PUT", "/tasks/reorder?date=2026-10-24", {"task_ids": [task, task]})[0], 400)
        self.assertEqual(self.request("PUT", "/tasks/reorder?date=2026-10-24", {"task_ids": [task]})[0], 400)
        self.assertEqual([item["id"] for item in self.request("GET", "/tasks?date=2026-10-24")[1]["tasks"]], [task, task_b])


if __name__ == "__main__":
    unittest.main()
