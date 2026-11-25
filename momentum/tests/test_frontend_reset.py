import subprocess
import unittest
from pathlib import Path


class FrontendInteractionTests(unittest.TestCase):
    def test_delegated_frontend_interactions_and_persistence(self):
        repo = Path(__file__).resolve().parents[1]
        result = subprocess.run(
            ["node", "tests/test_reset_frontend.js"],
            cwd=repo,
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("frontend delegated interactions passed", result.stdout)


if __name__ == "__main__":
    unittest.main()
