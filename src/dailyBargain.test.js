import assert from "node:assert/strict";
import test from "node:test";
import {
  currentBargainEvidence,
  isMeaningfulBargainEvidence,
  refreshDailyBargainProducts,
  sanitizeBargainHeadline,
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

test("stale percentage claims are removed from daily bargain headlines", () => {
  const currentJuice = {
    id: "olympos-juice",
    name: "ΟΛΥΜΠΟΣ Φυσικός Χυμός Μήλο Πορτοκάλι Καρότο 1lt",
    brand: "ΟΛΥΜΠΟΣ",
    category: "Ανάμικτοι Χυμοί",
    prices: {
      halkiadakis: 2.09,
      sklavenitis: 2.58,
      bazaar: 2.6,
    },
    retailerNames: {
      halkiadakis: "Χαλκιαδάκης",
      sklavenitis: "Σκλαβενίτης",
      bazaar: "Bazaar",
    },
  };
  const refreshed = refreshDailyBargainProducts(
    {
      productId: "olympos-juice",
      headline: "ΟΛΥΜΠΟΣ χυμός: 72% χαμηλότερα",
      evidence: {
        bestPrice: 0.73,
        bestRetailerId: "sklavenitis",
        savingsPercentVsHighest: 72,
      },
      product: { id: "olympos-juice" },
      bargains: [],
    },
    [currentJuice],
  );

  assert.equal(refreshed.headline, "ΟΛΥΜΠΟΣ χυμός");
  assert.equal(refreshed.evidence.bestPrice, 2.09);
  assert.equal(refreshed.evidence.bestRetailerId, "halkiadakis");
  assert.equal(refreshed.evidence.savingsPercentVsHighest, 19.6);
  assert.doesNotMatch(refreshed.headline, /72%/u);
});

test("product percentages remain when only a trailing bargain claim is removed", () => {
  assert.equal(
    sanitizeBargainHeadline(
      "ΟΛΥΜΠΟΣ Γιαούρτι 2%: 45% φθηνότερα",
      { brand: "ΟΛΥΜΠΟΣ", category: "Γιαούρτι" },
    ),
    "ΟΛΥΜΠΟΣ Γιαούρτι 2%",
  );
});

test("a collapsed bargain is replaced by the next verified daily pick", () => {
  const refreshed = refreshDailyBargainProducts(
    {
      productId: "collapsed",
      headline: "Παλιό προϊόν: 50% χαμηλότερα",
      evidence: {},
      product: { id: "collapsed" },
      bargains: [
        {
          productId: "collapsed",
          headline: "Παλιό προϊόν: 50% χαμηλότερα",
          evidence: {},
          product: { id: "collapsed" },
        },
        {
          productId: "cornetto-classico",
          headline: "Cornetto: 68% χαμηλότερα",
          evidence: {},
          product: { id: "cornetto-classico" },
        },
      ],
    },
    [
      {
        id: "collapsed",
        prices: { first: 2.5, second: 2.6 },
      },
      currentCornetto,
    ],
  );

  assert.equal(refreshed.productId, "cornetto-classico");
  assert.equal(refreshed.bargains.length, 1);
  assert.equal(refreshed.headline, "Cornetto");
  assert.equal(isMeaningfulBargainEvidence(refreshed.evidence), true);
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
