import re
import unittest
from pathlib import Path
from urllib.parse import urljoin, urlparse

class FrontendRouteTests(unittest.TestCase):
    def test_stylesheet_and_script_assets_resolve_beneath_site_route(self):
        repo = Path(__file__).resolve().parents[1]
        html = (repo / "web" / "index.html").read_text(encoding="utf-8")
        references = re.findall(r'''(?:href|src)=["']([^"']+)["']''', html)
        asset_references = [reference for reference in references if reference.endswith((".css", ".js", ".svg"))]

        self.assertEqual(set(asset_references), {"styles.css", "timer.js", "app.js", "favicon.svg"})
        for reference in asset_references:
            resolved = urlparse(urljoin("https://example.test/s/momentum/", reference))
            self.assertTrue(resolved.path.startswith("/s/momentum/"), reference)
            relative = resolved.path.removeprefix("/s/momentum/")
            self.assertTrue((repo / "dist" / relative).is_file(), reference)
            self.assertTrue((repo / "web" / relative).is_file(), reference)


if __name__ == "__main__":
    unittest.main()
