export function mergeCatalogProducts(productsById, rows) {
  let added = 0;
  for (const product of Array.isArray(rows) ? rows : []) {
    const id = String(product?.id || product?.product_id || "").trim();
    if (!id) continue;
    if (!productsById.has(id)) added += 1;
    productsById.set(id, product);
  }
  return added;
}

export function getCatalogRootSegments(categories) {
  return (Array.isArray(categories) ? categories : [])
    .filter((category) => (
      Number(category?.depth) === 0
      && String(category?.category_id || "").trim()
    ))
    .map((category) => ({
      id: String(category.category_id).trim(),
      name: String(category.category_name || category.name || category.category_id).trim(),
      expectedCount: Number(category.product_count || 0),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function finalizeCatalogProducts(productsById, expectedTotal) {
  const products = [...productsById.values()];
  const expected = Number(expectedTotal || 0);
  if (expected > 0 && products.length < expected) {
    throw new Error(
      `Incomplete catalogue: collected ${products.length} of ${expected} products`,
    );
  }

  return products.sort((left, right) => (
    String(left?.name || "").localeCompare(String(right?.name || ""), "el")
    || String(left?.id || left?.product_id || "").localeCompare(
      String(right?.id || right?.product_id || ""),
    )
  ));
}
