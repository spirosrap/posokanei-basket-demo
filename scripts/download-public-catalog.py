"""Export the public Greek PosoKanei catalogue as gzipped JSON on stdout."""

import datetime
import gzip
import json
import shutil
import subprocess
import sys
import time
from urllib.parse import urlencode
from urllib.request import urlopen
from urllib.error import HTTPError


ORIGIN = "https://api.posokanei.gov.gr"


def fetch(path, **params):
    url = ORIGIN + path + ("?" + urlencode(params) if params else "")
    if not shutil.which("wget"):
        try:
            with urlopen(url, timeout=25) as response:
                return json.load(response)
        except HTTPError as exc:
            raise RuntimeError(f"{path} returned HTTP {exc.code}") from exc
    response = subprocess.run(
        ["wget", "--server-response", "--timeout=25", "--tries=1", "--no-verbose", "-O", "-", url],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    if response.returncode:
        statuses = [line.split()[1] for line in response.stderr.decode(errors="replace").splitlines()
                    if line.strip().startswith("HTTP/") and len(line.split()) > 1]
        if statuses:
            raise RuntimeError(f"{path} returned HTTP {statuses[-1]}")
        raise RuntimeError(f"wget failed for {path} with exit code {response.returncode}")
    return json.loads(response.stdout)


def export():
    stats = fetch("/meta/stats")
    categories = fetch("/meta/categories")["categories"]
    retailers = fetch("/meta/retailers", countries="GR")["retailers"]
    roots = [row for row in categories if row["depth"] == 0]
    if not roots:
        raise ValueError("No root categories")
    products, coverage = {}, []
    for root in roots:
        group = {}
        page = 1
        while True:
            result = fetch("/products", category=root["category_id"], countries="GR",
                           sort_by="name", sort_order="asc", page=page, page_size=100)
            if result["page"] != page or page > 1000:
                raise ValueError("Invalid page: " + str(page))
            for row in result["products"]:
                group[row["id"]] = row
            if not result["has_next"]:
                break
            if not result["products"]:
                raise ValueError("Empty intermediate page")
            page += 1
            time.sleep(0.25)
        if len(group) != result["total"]:
            raise ValueError(f"{root['category_name']}: {len(group)} unique vs {result['total']} reported")
        products.update(group)
        coverage.append(dict(category_id=root["category_id"], category_name=root["category_name"],
                             product_count=len(group)))
        print(f"{len(coverage)}/{len(roots)} categories; {len(products)} unique products",
              file=sys.stderr, flush=True)
    if not products or sum(r["product_count"] for r in coverage) != len(products):
        raise ValueError("Root totals do not match the unique catalogue")
    collected_at = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    snapshot = dict(source=ORIGIN, generated_at=collected_at,
                    stats=stats, categories=categories, retailers=retailers,
                    coverage=dict(schema_version=1, root_categories=coverage),
                    products=sorted(products.values(), key=lambda r: (r["name"], r["id"])))
    return snapshot


if __name__ == "__main__":
    snapshot = export()
    with gzip.GzipFile(fileobj=sys.stdout.buffer, mode="wb") as out:
        out.write(json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")).encode())
