import { prepareCatalogSearch, queryCatalogSearch } from "./catalogSearch.js";
import {
  findProductAlternatives,
  prepareProductAlternatives,
} from "./productAlternatives.js";

let preparedCatalog = null;
let preparedAlternatives = null;

self.addEventListener("message", async (event) => {
  const message = event.data || {};
  if (message.type === "init") {
    try {
      const response = await fetch(message.url, {
        cache: message.cacheMode === "force-cache" ? "force-cache" : "default",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(`catalog_runtime_${response.status}`);
      const catalog = await response.json();
      const products = catalog.products || [];
      preparedCatalog = prepareCatalogSearch(products);
      preparedAlternatives = prepareProductAlternatives(products);
      self.postMessage({
        type: "ready",
        generatedAt: catalog.generated_at || "",
        productCount: catalog.products?.length || 0,
      });
    } catch (error) {
      self.postMessage({ type: "init-error", error: String(error?.message || error) });
    }
    return;
  }

  if (message.type === "query" && preparedCatalog) {
    const startedAt = performance.now();
    const result = queryCatalogSearch(preparedCatalog, message.params);
    self.postMessage({
      type: "result",
      requestId: message.requestId,
      result: {
        ...result,
        query_time_ms: Math.max(0.1, performance.now() - startedAt),
      },
    });
  }

  if (message.type === "alternatives" && preparedAlternatives) {
    const startedAt = performance.now();
    const result = findProductAlternatives(preparedAlternatives, message.params);
    self.postMessage({
      type: "result",
      requestId: message.requestId,
      result: {
        ...result,
        query_time_ms: Math.max(0.1, performance.now() - startedAt),
        source: "snapshot-worker",
      },
    });
  }
});
