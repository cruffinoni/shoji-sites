import subprocess
import unittest
from pathlib import Path


class TimerEngineTests(unittest.TestCase):
    def test_deterministic_timer_engine(self):
        repo = Path(__file__).resolve().parents[1]
        result = subprocess.run(
            ["node", "tests/test_timer.js"],
            cwd=repo,
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("timer engine behavior passed", result.stdout)


if __name__ == "__main__":
    unittest.main()
