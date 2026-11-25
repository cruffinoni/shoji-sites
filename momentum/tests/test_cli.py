from datetime import date
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import subprocess
import sys
import threading
import unittest
from typing import Any


CLI_PATH = Path(__file__).resolve().parents[1] / "tools" / "task_board.py"


class RecordingApiHandler(BaseHTTPRequestHandler):
    requests = []
    status_code = 201
    response_body: Any = {"task": {"id": "task-123", "title": "Sample task", "planned_date": "2026-10-24"}}

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        self.__class__.requests.append((self.path, body))
        payload = json.dumps(self.__class__.response_body).encode("utf-8")
        self.send_response(self.__class__.status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, format, *args):
        pass


class TaskBoardCliTests(unittest.TestCase):
    def setUp(self):
        RecordingApiHandler.requests = []
        RecordingApiHandler.status_code = 201
        RecordingApiHandler.response_body = {
            "task": {"id": "task-123", "title": "Sample task", "planned_date": "2026-10-24"}
        }
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), RecordingApiHandler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.api_url = f"http://127.0.0.1:{self.server.server_address[1]}/day-reset-api"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    def run_cli(self, *args):
        return subprocess.run(
            [sys.executable, str(CLI_PATH), "add", *args, "--api-url", self.api_url],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )

    def test_add_defaults_to_today_and_sends_metadata(self):
        result = self.run_cli("Buy oat milk", "--group", "Home", "--estimate", "S")

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(RecordingApiHandler.requests), 1)
        path, payload = RecordingApiHandler.requests[0]
        self.assertEqual(path, "/day-reset-api/tasks")
        self.assertEqual(payload, {
            "title": "Buy oat milk",
            "planned_date": date.today().isoformat(),
            "group": "Home",
            "estimate": "S",
        })
        self.assertIn("task-123", result.stdout)
        self.assertEqual(result.stderr, "")

    def test_add_uses_explicit_date_and_omits_unset_metadata(self):
        result = self.run_cli("Call the dentist", "--date", "2026-10-25")

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(RecordingApiHandler.requests[0], (
            "/day-reset-api/tasks",
            {"title": "Call the dentist", "planned_date": "2026-10-25"},
        ))

    def test_invalid_date_is_rejected_without_request(self):
        result = self.run_cli("Invalid date task", "--date", "2026-02-30")

        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(RecordingApiHandler.requests, [])
        self.assertIn("YYYY-MM-DD", result.stderr)

    def test_api_error_is_reported_without_traceback(self):
        RecordingApiHandler.status_code = 400
        RecordingApiHandler.response_body = {"error": "invalid task title"}

        result = self.run_cli("A task")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("invalid task title", result.stderr)
        self.assertNotIn("Traceback", result.stderr)


if __name__ == "__main__":
    unittest.main()
