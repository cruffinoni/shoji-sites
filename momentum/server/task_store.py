"""Versioned SQLite persistence for dynamically managed tasks."""
from __future__ import annotations

from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
import sqlite3
from pathlib import Path
from typing import Any
import unicodedata
from uuid import uuid4

_SCHEMA_VERSION = 1
_ESTIMATES = {"S", "M", "L"}
_FIELDS = {"title", "group", "estimate", "planned_date", "completed"}


def _timestamp() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


class TaskStore:
    """A connection-per-operation task store, safe to share between threads."""

    def __init__(self, path: Path | str):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=10, isolation_level=None)
        connection.row_factory = sqlite3.Row
        return connection

    @contextmanager
    def _connection(self):
        connection = self._connect()
        try:
            yield connection
        finally:
            connection.close()

    def _initialize(self) -> None:
        with self._connection() as conn:
            conn.execute("BEGIN IMMEDIATE")
            version = conn.execute("PRAGMA user_version").fetchone()[0]
            if version not in (0, _SCHEMA_VERSION):
                raise RuntimeError(f"Unsupported task database version: {version}")
            if version == 0:
                conn.execute("""CREATE TABLE tasks (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL CHECK(length(trim(title)) > 0),
                    task_group TEXT,
                    estimate TEXT CHECK(estimate IS NULL OR estimate IN ('S', 'M', 'L')),
                    planned_date TEXT,
                    completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0, 1)),
                    sort_order INTEGER NOT NULL UNIQUE,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )""")
                conn.execute(f"PRAGMA user_version = {_SCHEMA_VERSION}")
            conn.commit()

    @staticmethod
    def _task(row: sqlite3.Row) -> dict[str, Any]:
        result = dict(row)
        result["group"] = result.pop("task_group")
        result["completed"] = bool(result["completed"])
        return result

    @staticmethod
    def _validate(fields: dict[str, Any]) -> None:
        if "title" in fields:
            title = fields["title"]
            if not isinstance(title, str) or not title.strip():
                raise ValueError("title must be a non-empty string")
            if len(title.strip()) > 300:
                raise ValueError("title must be 300 characters or fewer")
        if "group" in fields and fields["group"] is not None and not isinstance(fields["group"], str):
            raise ValueError("group must be a string or None")
        if "estimate" in fields and fields["estimate"] is not None and (
            not isinstance(fields["estimate"], str) or fields["estimate"] not in _ESTIMATES
        ):
            raise ValueError("estimate must be S, M, L, or None")
        if "planned_date" in fields and fields["planned_date"] is not None:
            if not isinstance(fields["planned_date"], str):
                raise ValueError("planned_date must be an ISO date or None")
            try:
                parsed_date = date.fromisoformat(fields["planned_date"])
                if parsed_date.isoformat() != fields["planned_date"]:
                    raise ValueError("date is not in canonical YYYY-MM-DD form")
            except ValueError as exc:
                raise ValueError("planned_date must be an ISO date or None") from exc
        if "completed" in fields and not isinstance(fields["completed"], bool):
            raise ValueError("completed must be a boolean")

    @staticmethod
    def _title_key(title: str) -> str:
        normalized = unicodedata.normalize("NFKC", title)
        return " ".join(normalized.split()).casefold()

    @classmethod
    def _ensure_title_is_unique(cls, conn: sqlite3.Connection, title: str,
                                planned_date: str | None, exclude_id: str | None = None) -> None:
        rows = conn.execute("SELECT id, title FROM tasks WHERE planned_date IS ?", (planned_date,)).fetchall()
        if any(row["id"] != exclude_id and cls._title_key(row["title"]) == cls._title_key(title) for row in rows):
            raise ValueError("a task with this title already exists for this date")

    def create(self, title: str, *, group: str | None = None, estimate: str | None = None,
               planned_date: str | None = None) -> dict[str, Any]:
        fields = {"title": title, "group": group, "estimate": estimate, "planned_date": planned_date}
        self._validate(fields)
        now = _timestamp()
        task_id = str(uuid4())
        with self._connection() as conn:
            conn.execute("BEGIN IMMEDIATE")
            self._ensure_title_is_unique(conn, title, planned_date)
            order = conn.execute("SELECT COALESCE(MAX(sort_order), -1) + 1 FROM tasks").fetchone()[0]
            conn.execute("""INSERT INTO tasks
                (id, title, task_group, estimate, planned_date, completed, sort_order, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)""",
                (task_id, title.strip(), group, estimate, planned_date, order, now, now))
            row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
            conn.commit()
            return self._task(row)

    def list_tasks(self) -> list[dict[str, Any]]:
        with self._connection() as conn:
            rows = conn.execute("SELECT * FROM tasks ORDER BY sort_order, id").fetchall()
            return [self._task(row) for row in rows]

    def update(self, task_id: str, **fields: Any) -> dict[str, Any]:
        if not fields or fields.keys() - _FIELDS:
            raise ValueError("provide one or more supported task fields")
        self._validate(fields)
        mapping = {"group": "task_group"}
        with self._connection() as conn:
            conn.execute("BEGIN IMMEDIATE")
            row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
            if row is None:
                conn.rollback()
                raise KeyError(task_id)
            new_title = fields.get("title", row["title"])
            new_date = fields.get("planned_date", row["planned_date"])
            self._ensure_title_is_unique(conn, new_title, new_date, exclude_id=task_id)
            new_time = max(datetime.now(timezone.utc), datetime.fromisoformat(row["updated_at"]) + timedelta(microseconds=1)).isoformat(timespec="microseconds")
            columns = [mapping.get(key, key) for key in fields]
            values = [value.strip() if key == "title" else int(value) if key == "completed" else value
                      for key, value in fields.items()]
            conn.execute(f"UPDATE tasks SET {', '.join(f'{column} = ?' for column in columns)}, updated_at = ? WHERE id = ?",
                         (*values, new_time, task_id))
            updated = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
            conn.commit()
            return self._task(updated)

    def complete(self, task_id: str, completed: bool = True) -> dict[str, Any]:
        return self.update(task_id, completed=completed)

    def delete(self, task_id: str) -> bool:
        with self._connection() as conn:
            conn.execute("BEGIN IMMEDIATE")
            cursor = conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
            conn.commit()
            return cursor.rowcount == 1

    def reorder_for_date(self, target_date: str, task_ids: list[str]) -> None:
        if not isinstance(target_date, str):
            raise ValueError("date must be canonical YYYY-MM-DD")
        try:
            if date.fromisoformat(target_date).isoformat() != target_date:
                raise ValueError
        except ValueError as exc:
            raise ValueError("date must be canonical YYYY-MM-DD") from exc
        if not isinstance(task_ids, list) or any(not isinstance(task_id, str) for task_id in task_ids):
            raise ValueError("task_ids must be a list of task IDs")
        if len(set(task_ids)) != len(task_ids):
            raise ValueError("task_ids must contain unique task IDs")

        with self._connection() as conn:
            conn.execute("BEGIN IMMEDIATE")
            snapshot = conn.execute("SELECT id, planned_date FROM tasks ORDER BY sort_order, id").fetchall()
            scoped_ids = [row["id"] for row in snapshot if row["planned_date"] == target_date]
            if not scoped_ids and not task_ids:
                conn.commit()
                return
            if len(scoped_ids) != len(task_ids) or set(scoped_ids) != set(task_ids):
                raise ValueError("task_ids must contain exactly the tasks for date")
            requested = iter(task_ids)
            full_order = [next(requested) if row["planned_date"] == target_date else row["id"] for row in snapshot]
            conn.execute("UPDATE tasks SET sort_order = -sort_order - 1")
            conn.executemany("UPDATE tasks SET sort_order = ? WHERE id = ?", enumerate(full_order))
            conn.commit()

    def reorder(self, task_ids: list[str]) -> None:
        if not isinstance(task_ids, list) or not task_ids or len(set(task_ids)) != len(task_ids):
            raise ValueError("task_ids must be a non-empty list of unique task ids")
        with self._connection() as conn:
            conn.execute("BEGIN IMMEDIATE")
            existing = [row[0] for row in conn.execute("SELECT id FROM tasks ORDER BY sort_order")]
            if set(existing) != set(task_ids) or len(existing) != len(task_ids):
                conn.rollback()
                raise ValueError("reorder must contain every existing task exactly once")
            conn.execute("UPDATE tasks SET sort_order = -sort_order - 1")
            conn.executemany("UPDATE tasks SET sort_order = ? WHERE id = ?", enumerate(task_ids))
            conn.commit()
