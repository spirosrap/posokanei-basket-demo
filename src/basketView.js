function searchKey(value) {
  return String(value ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("el-GR");
}

export function filterBasket(basket, productMap, assignments, query, outsideOnly) {
  const words = searchKey(query).trim().split(/\s+/u).filter(Boolean);
  return basket.filter((entry) => {
    const product = productMap.get(entry.productId);
    if (!product) return false;
    if (outsideOnly && assignments.has(entry.productId)) return false;
    if (!words.length) return true;
    const text = searchKey(`${product.name} ${product.brand ?? ""} ${product.gtin ?? product.barcode ?? ""}`);
    return words.every((word) => text.includes(word));
  });
}
