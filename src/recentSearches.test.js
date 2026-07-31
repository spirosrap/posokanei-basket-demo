import assert from "node:assert/strict";
import test from "node:test";
import {
  addRecentSearch,
  loadRecentSearches,
  normalizeRecentSearch,
  persistRecentSearches,
  RECENT_SEARCHES_KEY,
} from "./recentSearches.js";

test("normalizes, deduplicates, and caps recent searches", () => {
  const searches = ["γάλα", "ΨΩΜΙ", "τυρί", "καφές", "ρύζι", "λάδι"];
  assert.deepEqual(addRecentSearch(searches, "  ψωμί  "), [
    "ψωμί",
    "γάλα",
    "τυρί",
    "καφές",
    "ρύζι",
    "λάδι",
  ]);
  assert.equal(normalizeRecentSearch("  cottage   cheese "), "cottage cheese");
});

test("ignores one-character searches and tolerates unavailable storage", () => {
  assert.deepEqual(addRecentSearch(["γάλα"], "x"), ["γάλα"]);
  assert.deepEqual(loadRecentSearches({ getItem: () => "not-json" }), []);
  assert.doesNotThrow(() => persistRecentSearches(["γάλα"], {
    setItem: () => {
      throw new Error("blocked");
    },
  }));
});

test("persists a sanitized recent-search list", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  persistRecentSearches([" γάλα ", "ΓΑΛΑ", "ψωμί"], storage);
  assert.equal(values.has(RECENT_SEARCHES_KEY), true);
  assert.deepEqual(loadRecentSearches(storage), ["γάλα", "ψωμί"]);
});
