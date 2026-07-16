import assert from "node:assert/strict";
import test from "node:test";
import {
  loadSavedBaskets,
  MAX_SAVED_BASKETS,
  parseSavedBaskets,
  persistSavedBaskets,
  removeSavedBasket,
  SAVED_BASKETS_KEY,
  upsertSavedBasket,
} from "./savedBaskets.js";

const draft = {
  name: "Εβδομαδιαία ψώνια",
  basket: [
    { productId: "milk-1", quantity: 2 },
    { productId: "coffee-2", quantity: 1 },
  ],
  maxChains: 3,
  retailerIds: ["lidl", "masoutis"],
  extraStopCost: 5,
};

test("saved baskets preserve recurring-list planning settings", () => {
  const [saved] = upsertSavedBasket([], draft, {
    id: "weekly",
    now: "2026-07-15T12:00:00.000Z",
  });

  assert.deepEqual(saved, {
    id: "weekly",
    ...draft,
    updatedAt: "2026-07-15T12:00:00.000Z",
  });
});

test("saving the same name updates instead of duplicating the list", () => {
  const first = upsertSavedBasket([], draft, {
    id: "weekly",
    now: "2026-07-15T12:00:00.000Z",
  });
  const updated = upsertSavedBasket(
    first,
    { ...draft, name: "  εβδομαδιαία   ψώνια ", maxChains: 2 },
    { id: "ignored", now: "2026-07-16T12:00:00.000Z" },
  );

  assert.equal(updated.length, 1);
  assert.equal(updated[0].id, "weekly");
  assert.equal(updated[0].name, "εβδομαδιαία ψώνια");
  assert.equal(updated[0].maxChains, 2);
});

test("saved basket parsing ignores corrupt entries and private extra fields", () => {
  const parsed = parseSavedBaskets({
    version: 1,
    baskets: [
      {
        id: "weekly",
        ...draft,
        updatedAt: "2026-07-15T12:00:00.000Z",
        location: { lat: 40, lon: 23 },
        prices: [1, 2],
        checkedIds: ["milk-1"],
      },
      { id: "broken", name: "", basket: [] },
    ],
  });

  assert.equal(parsed.length, 1);
  assert.equal("location" in parsed[0], false);
  assert.equal("prices" in parsed[0], false);
  assert.equal("checkedIds" in parsed[0], false);
});

test("saved baskets normalize legacy fractional quantities to whole products", () => {
  const parsed = parseSavedBaskets({
    version: 1,
    baskets: [{
      id: "legacy",
      ...draft,
      basket: [{ productId: "milk-1", quantity: 1.5 }],
      updatedAt: "2026-07-15T12:00:00.000Z",
    }],
  });

  assert.equal(parsed[0].basket[0].quantity, 2);
});

test("saved baskets persist through the versioned local payload", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const baskets = upsertSavedBasket([], draft, {
    id: "weekly",
    now: "2026-07-15T12:00:00.000Z",
  });

  persistSavedBaskets(baskets, storage);
  assert.match(values.get(SAVED_BASKETS_KEY), /"version":1/);
  assert.deepEqual(loadSavedBaskets(storage), baskets);
});

test("storage failures are surfaced instead of reporting a false save", () => {
  const baskets = upsertSavedBasket([], draft, {
    id: "weekly",
    now: "2026-07-15T12:00:00.000Z",
  });
  const storage = {
    setItem() {
      throw new Error("storage_disabled");
    },
  };

  assert.throws(() => persistSavedBaskets(baskets, storage), /storage_disabled/);
});

test("saved basket management caps the library and supports deletion", () => {
  let baskets = [];
  for (let index = 0; index < MAX_SAVED_BASKETS + 2; index += 1) {
    baskets = upsertSavedBasket(
      baskets,
      { ...draft, name: `List ${index}` },
      { id: `list-${index}`, now: new Date(2026, 0, index + 1) },
    );
  }

  assert.equal(baskets.length, MAX_SAVED_BASKETS);
  assert.equal(baskets[0].id, `list-${MAX_SAVED_BASKETS + 1}`);
  assert.equal(removeSavedBasket(baskets, baskets[0].id).length, MAX_SAVED_BASKETS - 1);
});
