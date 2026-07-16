function normalizedText(value) {
  return String(value || "").trim().toLocaleLowerCase("el-GR");
}

function compareNullableNumber(left, right, field) {
  const leftValue = Number(left.raw[field]);
  const rightValue = Number(right.raw[field]);
  const leftValid = Number.isFinite(leftValue);
  const rightValid = Number.isFinite(rightValue);
  if (!leftValid && rightValid) return 1;
  if (leftValid && !rightValid) return -1;
  if (leftValid && rightValid && leftValue !== rightValue) return leftValue - rightValue;
  return left.name.localeCompare(right.name, "el");
}

function productComparator(sortMode) {
  if (sortMode === "name") return (left, right) => left.name.localeCompare(right.name, "el");
  const field = sortMode === "unit_price" ? "min_unit_price" : "min_price";
  return (left, right) => compareNullableNumber(left, right, field);
}

export function prepareCatalogSearch(rawProducts = []) {
  const entries = rawProducts.map((raw) => {
    const name = String(raw.name || "");
    const gtin = String(raw.gtin || "");
    return {
      raw,
      name,
      gtin,
      category: String(raw.category || raw.subcategory || ""),
      categoryIds: Array.isArray(raw.category_ids) ? raw.category_ids.map(String) : [],
      searchText: normalizedText([
        name,
        raw.brand,
        raw.category,
        raw.subcategory,
        gtin,
        raw.unit,
        raw.unit_quantity,
      ].filter(Boolean).join(" ")),
    };
  });

  return {
    price: [...entries].sort(productComparator("price")),
    unit_price: [...entries].sort(productComparator("unit_price")),
    name: [...entries].sort(productComparator("name")),
  };
}

export function queryCatalogSearch(
  prepared,
  { query = "", categoryId = "all", page = 1, pageSize = 30, sortMode = "price" } = {},
) {
  const normalizedQuery = normalizedText(query);
  const barcode = /^\d{8,14}$/.test(normalizedQuery) ? normalizedQuery : "";
  const source = prepared[sortMode] || prepared.price || [];
  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.max(1, Number(pageSize) || 30);
  const start = (safePage - 1) * safePageSize;
  const end = start + safePageSize;
  const products = [];
  let total = 0;

  for (const entry of source) {
    const categoryMatches =
      categoryId === "all" ||
      entry.category === categoryId ||
      entry.categoryIds.includes(String(categoryId));
    if (!categoryMatches) continue;
    if (barcode ? entry.gtin !== barcode : normalizedQuery && !entry.searchText.includes(normalizedQuery)) {
      continue;
    }
    if (total >= start && total < end) products.push(entry.raw);
    total += 1;
  }

  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  return {
    products,
    total,
    page: safePage,
    page_size: safePageSize,
    total_pages: totalPages,
    has_next: safePage < totalPages,
    source: "snapshot-worker",
  };
}
