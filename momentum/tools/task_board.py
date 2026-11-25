#!/usr/bin/env python3
"""Add tasks to the local Momentum API."""
from __future__ import annotations

import argparse
from datetime import date
import json
import os
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen


DEFAULT_API_URL = os.environ.get(
    "MOMENTUM_API_URL",
    "http://127.0.0.1:8082/s/momentum/api",
)
_ESTIMATES = ("S", "M", "L")


class TaskBoardError(RuntimeError):
    """A user-facing Momentum CLI error."""


class TaskBoardClient:
    def __init__(self, base_url: str = DEFAULT_API_URL, timeout: float = 5.0):
        parsed = urlsplit(base_url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.query or parsed.fragment:
            raise TaskBoardError("API URL must be an HTTP(S) base URL without a query or fragment")
        if timeout <= 0:
            raise TaskBoardError("timeout must be greater than zero")
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def add_task(
        self,
        title: str,
        planned_date: str,
        *,
        group: str | None = None,
        estimate: str | None = None,
    ) -> dict:
        if not isinstance(title, str) or not title.strip():
            raise TaskBoardError("title must not be empty")
        try:
            parsed_date = date.fromisoformat(planned_date)
        except (TypeError, ValueError) as exc:
            raise TaskBoardError("date must be canonical YYYY-MM-DD") from exc
        if parsed_date.isoformat() != planned_date:
            raise TaskBoardError("date must be canonical YYYY-MM-DD")
        if estimate is not None and estimate not in _ESTIMATES:
            raise TaskBoardError("estimate must be S, M, or L")

        payload = {"title": title, "planned_date": planned_date}
        if group is not None:
            payload["group"] = group
        if estimate is not None:
            payload["estimate"] = estimate
        url = f"{self.base_url}/tasks"
        request = Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urlopen(request, timeout=self.timeout) as response:
                response_body = response.read()
        except HTTPError as exc:
            try:
                error_body = json.loads(exc.read().decode("utf-8"))
                detail = error_body.get("error") if isinstance(error_body, dict) else None
            except (UnicodeDecodeError, json.JSONDecodeError):
                detail = None
            message = detail or f"HTTP {exc.code}"
            raise TaskBoardError(f"Momentum rejected the task: {message}") from exc
        except (URLError, TimeoutError, OSError) as exc:
            raise TaskBoardError(f"Cannot reach Momentum API at {url}: {exc}") from exc

        try:
            response_payload = json.loads(response_body.decode("utf-8"))
            task = response_payload["task"]
            if not isinstance(task, dict):
                raise TypeError("task is not an object")
        except (UnicodeDecodeError, json.JSONDecodeError, KeyError, TypeError) as exc:
            raise TaskBoardError("Momentum API returned an invalid create response") from exc
        return task


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="momentum",
        description="Add a task to Momentum.",
    )
    commands = parser.add_subparsers(dest="command", required=True)
    add = commands.add_parser("add", help="add a task")
    add.add_argument("title", help="task title")
    add.add_argument("--date", dest="planned_date", help="planned date (YYYY-MM-DD; defaults to today)")
    add.add_argument("--group", help="optional task group")
    add.add_argument("--estimate", choices=_ESTIMATES, help="optional effort estimate")
    add.add_argument("--api-url", default=DEFAULT_API_URL, help=argparse.SUPPRESS)
    add.add_argument("--timeout", type=float, default=5.0, help=argparse.SUPPRESS)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    planned_date = args.planned_date or date.today().isoformat()
    try:
        task = TaskBoardClient(args.api_url, args.timeout).add_task(
            args.title,
            planned_date,
            group=args.group,
            estimate=args.estimate,
        )
    except TaskBoardError as exc:
        print(f"momentum: {exc}", file=sys.stderr)
        return 1

    task_id = task.get("id", "unknown id")
    title = task.get("title", args.title)
    print(f"Added: {title} — {planned_date} (id: {task_id})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
