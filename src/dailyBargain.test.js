import assert from "node:assert/strict";
import test from "node:test";
import {
  currentBargainEvidence,
  refreshDailyBargainProducts,
} from "./dailyBargain.js";

const currentCornetto = {
  id: "cornetto-classico",
  name: "CORNETTO Classico 6 τεμαχίων",
  prices: {
    ab_vasilopoulos: 6.47,
    galaxias: 8.9,
    lidl: 3,
    masoutis: 5.37,
    mymarket: 9.1,
    sklavenitis: 3,
  },
  retailerNames: {
    ab_vasilopoulos: "ΑΒ Βασιλόπουλος",
    galaxias: "Γαλαξίας",
    lidl: "Lidl",
    masoutis: "Μασούτης",
    mymarket: "My Market",
    sklavenitis: "Σκλαβενίτης",
  },
};

test("daily bargain evidence is recomputed from current catalogue prices", () => {
  assert.deepEqual(currentBargainEvidence(currentCornetto), {
    bestPrice: 3,
    bestRetailerId: "lidl",
    bestRetailerName: "Lidl",
    medianPrice: 6.47,
    highestPrice: 9.1,
    savingsVsHighest: 6.1,
    savingsPercentVsHighest: 67,
    retailerCount: 6,
  });
});

test("stale bargain products are replaced before details or basket use", () => {
  const refreshed = refreshDailyBargainProducts(
    {
      productId: "cornetto-classico",
      headline: "Cornetto",
      reason: "Old price claim",
      evidence: {
        bestPrice: 3,
        bestRetailerId: "lidl",
        bestRetailerName: "Lidl",
        highestPrice: 9.37,
        savingsVsHighest: 6.37,
        savingsPercentVsHighest: 68,
        retailerCount: 8,
      },
      product: {
        id: "cornetto-classico",
        prices: { ab_vasilopoulos: 9.25 },
      },
      date: "2026-07-12",
      generatedAt: "2026-07-12T10:17:40.958Z",
      catalogGeneratedAt: "2026-07-12T09:43:13.275Z",
      bargains: [],
    },
    [currentCornetto],
    "2026-07-25T11:52:10.687Z",
  );

  assert.equal(refreshed.product, currentCornetto);
  assert.equal(refreshed.product.prices.ab_vasilopoulos, 6.47);
  assert.equal(refreshed.evidence.highestPrice, 9.1);
  assert.equal(refreshed.evidence.savingsVsHighest, 6.1);
  assert.equal(refreshed.evidence.savingsPercentVsHighest, 67);
  assert.equal(refreshed.catalogGeneratedAt, "2026-07-25T11:52:10.687Z");
  assert.equal(refreshed.generatedAt, "2026-07-12T10:17:40.958Z");
});

test("a suggestion is hidden when no selected product has current prices", () => {
  assert.throws(
    () => refreshDailyBargainProducts(
      {
        productId: "missing",
        evidence: {},
        product: { id: "missing" },
        bargains: [],
      },
      [],
    ),
    /unavailable in the current catalogue/,
  );
});
