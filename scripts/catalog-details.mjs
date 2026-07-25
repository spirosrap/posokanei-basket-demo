import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export function createProductDetailRecords(snapshot) {
  return (Array.isArray(snapshot?.products) ? snapshot.products : [])
    .map((product) => ({
      id: String(product?.id || product?.product_id || product?.gtin || ""),
      gtin: product?.gtin || product?.barcode || "",
      name: product?.name || product?.title || "",
      brand: product?.brand || "",
      category: product?.category || product?.subcategory || "",
      category_ids: Array.isArray(product?.category_ids) ? product.category_ids : [],
      unit: product?.unit || "",
      unit_quantity: product?.unit_quantity ?? null,
      image_url: product?.image_url || "",
      has_image: Boolean(product?.has_image),
      image_version: product?.image_version || "",
      description: product?.description || "",
      retailer_prices: (Array.isArray(product?.retailer_prices) ? product.retailer_prices : [])
        .map((offer) => ({
          retailer: offer?.retailer || offer?.retailer_id || "",
          retailer_display_name: offer?.retailer_display_name || offer?.retailer_name || "",
          price: offer?.price ?? null,
          price_normalized: offer?.price_normalized ?? offer?.unit_price ?? null,
          last_updated: offer?.last_updated || "",
          price_change: offer?.price_change || null,
          price_history: Array.isArray(offer?.price_history) ? offer.price_history : [],
        })),
    }))
    .filter((product) => product.id);
}

export async function writeProductDetailsJsonl(snapshot, outputPath) {
  const records = createProductDetailRecords(snapshot);
  const text = records.length
    ? `${records.map((product) => JSON.stringify(product)).join("\n")}\n`
    : "";
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, text, "utf8");
  const verificationProduct = records.find((product) => (
    product.description
    && product.retailer_prices.some((offer) => offer.price_history.length)
  )) || records.find((product) => product.description) || records[0];
  return {
    count: records.length,
    bytes: Buffer.byteLength(text),
    verificationProductId: verificationProduct?.id || "",
  };
}
