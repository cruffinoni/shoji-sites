import tempfile
import unittest
from pathlib import Path

from server.task_store import TaskStore


class TaskStoreTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / "tasks.sqlite3"
        self.store = TaskStore(self.path)

    def tearDown(self):
        self.tmp.cleanup()

    def test_initializes_versioned_empty_store(self):
        self.assertEqual(self.store.list_tasks(), [])
        import sqlite3
        with sqlite3.connect(self.path) as conn:
            self.assertEqual(conn.execute("PRAGMA user_version").fetchone()[0], 1)

    def test_create_and_list_dynamic_tasks_in_order(self):
        first = self.store.create("Buy milk", group="Errands", estimate="S", planned_date="2026-10-25")
        second = self.store.create("Write report", group="Work", estimate="L")
        listed = self.store.list_tasks()
        self.assertEqual([task["id"] for task in listed], [first["id"], second["id"]])
        self.assertEqual(first["title"], "Buy milk")
        self.assertEqual(first["group"], "Errands")
        self.assertEqual(first["estimate"], "S")
        self.assertEqual(first["planned_date"], "2026-10-25")
        self.assertFalse(first["completed"])
        self.assertLessEqual(first["created_at"], first["updated_at"])
        self.assertIsNone(second["planned_date"])

    def test_duplicate_titles_are_rejected_per_date_after_case_and_whitespace_normalization(self):
        self.store.create("Buy   milk", planned_date="2026-10-25")
        with self.assertRaisesRegex(ValueError, "already exists"):
            self.store.create(" buy milk ", planned_date="2026-10-25")
        self.store.create("Buy milk", planned_date="2026-10-26")
        self.store.create("Other task", planned_date="2026-10-25")

    def test_titles_over_300_characters_are_rejected_on_create_and_update(self):
        task = self.store.create("Original")
        too_long = "x" * 301
        with self.assertRaisesRegex(ValueError, "300 characters or fewer"):
            self.store.create(too_long)
        with self.assertRaisesRegex(ValueError, "300 characters or fewer"):
            self.store.update(task["id"], title=too_long)

    def test_title_uniqueness_uses_unicode_compatibility_normalization(self):
        self.store.create("Focus", planned_date="2026-10-25")
        with self.assertRaisesRegex(ValueError, "already exists"):
            self.store.create("Ｆｏｃｕｓ", planned_date="2026-10-25")

    def test_title_updates_cannot_duplicate_another_task_on_the_same_date(self):
        first = self.store.create("Buy milk", planned_date="2026-10-25")
        second = self.store.create("Write report", planned_date="2026-10-25")
        with self.assertRaisesRegex(ValueError, "already exists"):
            self.store.update(second["id"], title=" BUY   MILK ")
        self.assertEqual(self.store.update(first["id"], title="BUY MILK")["title"], "BUY MILK")

    def test_update_complete_delete_and_reorder(self):
        a = self.store.create("A")
        b = self.store.create("B")
        c = self.store.create("C")
        updated = self.store.update(a["id"], title="Updated", group="Home", estimate="M")
        self.assertEqual(updated["title"], "Updated")
        self.assertEqual(updated["group"], "Home")
        self.assertGreaterEqual(updated["updated_at"], a["updated_at"])
        complete = self.store.complete(a["id"], True)
        self.assertTrue(complete["completed"])
        self.store.reorder([c["id"], a["id"], b["id"]])
        self.assertEqual([t["id"] for t in self.store.list_tasks()], [c["id"], a["id"], b["id"]])
        self.assertTrue(self.store.delete(b["id"]))
        self.assertFalse(self.store.delete(b["id"]))

    def test_unhashable_estimate_values_raise_value_error(self):
        task = self.store.create("Keep")
        for value in ([], {}):
            with self.subTest(value=value), self.assertRaises(ValueError):
                self.store.create("Invalid estimate", estimate=value)
            with self.subTest(value=value), self.assertRaises(ValueError):
                self.store.update(task["id"], estimate=value)

    def test_rejects_invalid_fields_and_incomplete_reorder_without_partial_write(self):
        task = self.store.create("Keep")
        with self.assertRaises(ValueError):
            self.store.create("", estimate="XL")
        with self.assertRaises(ValueError):
            self.store.update(task["id"], estimate="XL")
        with self.assertRaises(ValueError):
            self.store.reorder([])
        with self.assertRaises(ValueError):
            self.store.reorder(["missing"])
        self.assertEqual([t["id"] for t in self.store.list_tasks()], [task["id"]])
        self.assertEqual(self.store.list_tasks()[0]["title"], "Keep")

    def test_reorder_for_date_reorders_scope_preserving_other_tasks(self):
        a = self.store.create("A", planned_date="2026-10-24")
        b = self.store.create("B", planned_date="2026-10-25")
        c = self.store.create("C", planned_date="2026-10-24")
        d = self.store.create("D", planned_date="2026-10-25")

        self.store.reorder_for_date("2026-10-24", [c["id"], a["id"]])

        self.assertEqual([task["id"] for task in self.store.list_tasks()],
                         [c["id"], b["id"], a["id"], d["id"]])

    def test_reorder_rolls_back_when_scoped_write_fails(self):
        import sqlite3

        a = self.store.create("A", planned_date="2026-10-24")
        b = self.store.create("B", planned_date="2026-10-24")
        original = [task["id"] for task in self.store.list_tasks()]
        with sqlite3.connect(self.path) as conn:
            conn.execute(f"""CREATE TRIGGER abort_scoped_reorder
                BEFORE UPDATE OF sort_order ON tasks
                WHEN OLD.id = '{b['id']}' AND NEW.sort_order >= 0
                BEGIN SELECT RAISE(ABORT, 'forced reorder failure'); END""")
        try:
            with self.assertRaisesRegex(sqlite3.IntegrityError, "forced reorder failure"):
                self.store.reorder_for_date("2026-10-24", [b["id"], a["id"]])
        finally:
            with sqlite3.connect(self.path) as conn:
                conn.execute("DROP TRIGGER abort_scoped_reorder")
        self.assertEqual([task["id"] for task in self.store.list_tasks()], original)

    def test_reorder_rolls_back_when_a_later_sort_update_fails(self):
        import sqlite3

        a = self.store.create("A")
        b = self.store.create("B")
        c = self.store.create("C")
        original_order = [task["id"] for task in self.store.list_tasks()]
        with sqlite3.connect(self.path) as conn:
            conn.execute(f"""CREATE TRIGGER abort_later_reorder_update
                BEFORE UPDATE OF sort_order ON tasks
                WHEN OLD.id = '{b['id']}' AND NEW.sort_order >= 0
                BEGIN SELECT RAISE(ABORT, 'forced reorder failure'); END""")

        try:
            with self.assertRaisesRegex(sqlite3.IntegrityError, "forced reorder failure"):
                self.store.reorder([c["id"], a["id"], b["id"]])
        finally:
            with sqlite3.connect(self.path) as conn:
                conn.execute("DROP TRIGGER abort_later_reorder_update")

        self.assertEqual([task["id"] for task in self.store.list_tasks()], original_order)

    def test_planned_date_requires_canonical_calendar_date(self):
        for value in ("20261025", "2026-W43-7"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                self.store.create("Invalid date", planned_date=value)

    def test_missing_task_operations_are_explicit(self):
        with self.assertRaises(KeyError):
            self.store.update("missing", title="Nope")
        with self.assertRaises(KeyError):
            self.store.complete("missing")

    def test_separate_store_instances_share_persistent_database(self):
        task = self.store.create("Persist")
        reopened = TaskStore(self.path)
        self.assertEqual(reopened.list_tasks()[0]["id"], task["id"])


if __name__ == "__main__":
    unittest.main()
