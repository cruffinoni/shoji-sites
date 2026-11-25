#!/usr/bin/env python3
"""Small SQLite-backed JSON API for Momentum."""
from __future__ import annotations

from datetime import date
import ipaddress
import json
import sqlite3
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from task_store import TaskStore

_PREFIX = "/day-reset-api"
_MAX_BODY = 16 * 1024


def create_server(host: str = "127.0.0.1", port: int = 8766,
                  state_path: Path | str | None = None,
                  allow_non_loopback: bool = False) -> ThreadingHTTPServer:
    if not host:
        raise ValueError("API bind host must not be empty")
    if not allow_non_loopback and host != "localhost":
        try:
            address = ipaddress.ip_address(host)
        except ValueError as exc:
            raise ValueError("API must bind to a loopback address") from exc
        if not address.is_loopback:
            raise ValueError("API must bind to a loopback address")
    db_path = Path(state_path) if state_path is not None else Path.home() / ".local/state/task-board/tasks.sqlite3"
    store = TaskStore(db_path)

    class Handler(BaseHTTPRequestHandler):
        server_version = "TaskBoard/1"

        def _path(self) -> str:
            path = urlsplit(self.path).path
            if path == _PREFIX:
                return "/"
            if path.startswith(_PREFIX + "/"):
                return path[len(_PREFIX):]
            return path

        def _send(self, status: int, payload: object | None = None) -> None:
            body = b"" if payload is None else json.dumps(payload, separators=(",", ":")).encode("utf-8")
            self.send_response(status)
            if payload is not None:
                self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            if body:
                self.wfile.write(body)

        def _error(self, status: int, message: str) -> None:
            self._send(status, {"error": message})

        def _json_body(self) -> dict | None:
            try:
                raw_length = self.headers.get("Content-Length")
                if raw_length is None or not raw_length.isascii() or not raw_length.isdecimal():
                    raise ValueError("invalid Content-Length")
                length = int(raw_length)
                if length < 1:
                    raise ValueError("empty body")
                if length > _MAX_BODY:
                    self._error(413, "request body too large")
                    return None
                raw = self.rfile.read(length)
                if len(raw) != length:
                    raise ValueError("incomplete body")
                def pairs(items):
                    result = {}
                    for key, value in items:
                        if key in result:
                            raise ValueError("duplicate JSON field")
                        result[key] = value
                    return result
                value = json.loads(raw.decode("utf-8"), object_pairs_hook=pairs,
                                   parse_constant=lambda value: (_ for _ in ()).throw(ValueError(value)))
                if not isinstance(value, dict):
                    raise ValueError("JSON body must be an object")
                return value
            except (ValueError, UnicodeDecodeError, json.JSONDecodeError):
                self._error(400, "invalid request body")
                return None

        def _date_query(self) -> str | None:
            values = parse_qs(urlsplit(self.path).query, keep_blank_values=True).get("date", [])
            if len(values) != 1 or not values[0]:
                raise ValueError("date query parameter is required")
            value = values[0]
            try:
                if date.fromisoformat(value).isoformat() != value:
                    raise ValueError
            except ValueError as exc:
                raise ValueError("date must be canonical YYYY-MM-DD") from exc
            return value

        def do_GET(self) -> None:
            path = self._path()
            if path == "/healthz":
                self._send(200, {"ok": True})
                return
            if path != "/tasks":
                self._error(404, "not found")
                return
            try:
                target_date = self._date_query()
                self._send(200, {"tasks": [task for task in store.list_tasks() if task["planned_date"] == target_date]})
            except ValueError as exc:
                self._error(400, str(exc))
            except (OSError, RuntimeError, sqlite3.Error):
                self._error(500, "task database unavailable")

        def do_POST(self) -> None:
            if self._path() != "/tasks":
                self._error(404, "not found")
                return
            body = self._json_body()
            if body is None:
                return
            allowed = {"title", "planned_date", "group", "estimate"}
            if set(body) - allowed or "title" not in body or "planned_date" not in body:
                self._error(400, "title and planned_date are required; unsupported fields are not allowed")
                return
            try:
                if not isinstance(body["planned_date"], str) or date.fromisoformat(body["planned_date"]).isoformat() != body["planned_date"]:
                    raise ValueError("planned_date must be canonical YYYY-MM-DD")
                task = store.create(body["title"], planned_date=body["planned_date"],
                                    group=body.get("group"), estimate=body.get("estimate"))
                self._send(201, {"task": task})
            except ValueError as exc:
                self._error(400, str(exc))
            except (OSError, RuntimeError, sqlite3.Error):
                self._error(500, "task database unavailable")

        def do_PATCH(self) -> None:
            path = self._path()
            prefix = "/tasks/"
            if not path.startswith(prefix) or not path[len(prefix):] or "/" in path[len(prefix):]:
                self._error(404, "not found")
                return
            task_id = path[len(prefix):]
            body = self._json_body()
            if body is None:
                return
            allowed = {"title", "group", "estimate", "planned_date", "completed"}
            if not body or set(body) - allowed:
                self._error(400, "one or more supported task fields are required")
                return
            try:
                task = store.update(task_id, **body)
                self._send(200, {"task": task})
            except KeyError:
                self._error(404, "unknown task")
            except ValueError as exc:
                self._error(400, str(exc))
            except (OSError, RuntimeError, sqlite3.Error):
                self._error(500, "task database unavailable")

        def do_DELETE(self) -> None:
            path = self._path()
            prefix = "/tasks/"
            if not path.startswith(prefix) or not path[len(prefix):] or "/" in path[len(prefix):]:
                self._error(404, "not found")
                return
            try:
                if not store.delete(path[len(prefix):]):
                    self._error(404, "unknown task")
                else:
                    self._send(204)
            except (OSError, RuntimeError, sqlite3.Error):
                self._error(500, "task database unavailable")

        def do_PUT(self) -> None:
            if self._path() != "/tasks/reorder":
                self._error(404, "not found")
                return
            try:
                target_date = self._date_query()
            except ValueError as exc:
                self._error(400, str(exc))
                return
            body = self._json_body()
            if body is None:
                return
            if set(body) != {"task_ids"} or not isinstance(body["task_ids"], list):
                self._error(400, "task_ids list is required")
                return
            try:
                requested = body["task_ids"]
                if any(not isinstance(item, str) for item in requested):
                    raise ValueError("task_ids must contain task IDs")
                store.reorder_for_date(target_date, requested)
                self._send(200, {"ok": True})
            except ValueError as exc:
                self._error(400, str(exc))
            except (OSError, RuntimeError, sqlite3.Error):
                self._error(500, "task database unavailable")

        def log_message(self, format: str, *args) -> None:
            return

    server = ThreadingHTTPServer((host, port), Handler)
    server.daemon_threads = True
    return server


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8766)
    parser.add_argument("--db-file", default=str(Path.home() / ".local/state/task-board/tasks.sqlite3"))
    parser.add_argument("--allow-non-loopback", action="store_true",
                        help="allow binding beyond loopback; use only inside a private container network")
    args = parser.parse_args()
    server = create_server(args.host, args.port, Path(args.db_file),
                           allow_non_loopback=args.allow_non_loopback)
    try:
        server.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
