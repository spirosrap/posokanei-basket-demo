import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("downloader", Path(__file__).with_name("download-public-catalog.py"))
downloader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(downloader)


class CatalogueExport(unittest.TestCase):
    def collect(self, second_id):
        def fetch(path, **query):
            if path == "/meta/stats":
                return {"total_products": 2}
            if path == "/meta/categories":
                return {"categories": [{"category_id": "food", "depth": 0, "category_name": "Food"}]}
            if path == "/meta/retailers":
                return {"retailers": []}
            self.assertEqual((path, query["category"], query["countries"]), ("/products", "food", "GR"))
            page = query["page"]
            return {"page": page, "total": 2, "products": [{"id": "1" if page == 1 else second_id, "name": "item"}],
                    "has_next": page == 1}
        with patch.object(downloader, "fetch", fetch), patch.object(downloader.time, "sleep"):
            return downloader.export()

    def test_pages_and_collection_time(self):
        snapshot = self.collect("2")
        self.assertEqual(len(snapshot["products"]), 2)
        self.assertEqual(snapshot["coverage"]["root_categories"][0]["product_count"], 2)
        self.assertRegex(snapshot["generated_at"], r"T\d{2}:\d{2}:\d{2}\.\d{3}Z$")

    def test_repeated_page_does_not_count_as_complete(self):
        with self.assertRaisesRegex(ValueError, "1 unique vs 2 reported"):
            self.collect("1")


if __name__ == "__main__":
    unittest.main()
