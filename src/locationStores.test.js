import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRetailerProximity,
  filterRetailersByProximity,
} from "./locationStores.js";

const retailers = [
  { id: "ab_vasilopoulos", name: "ΑΒ Βασιλόπουλος", shortName: "ΑΒ" },
  { id: "lidl", name: "Lidl", shortName: "LD" },
  { id: "masoutis", name: "Μασούτης", shortName: "ΜΣ" },
  { id: "sklavenitis", name: "Σκλαβενίτης", shortName: "ΣΚ" },
  { id: "halkiadakis", name: "Χαλκιαδάκης", shortName: "ΧΑ" },
];

const nearbyStores = [
  { id: "1", name: "ΑΒ Βασιλόπουλος", brand: "ΑΒ Βασιλόπουλος", distanceMeters: 810 },
  { id: "2", name: "Lidl", brand: "Lidl", distanceMeters: 860 },
  { id: "3", name: "Σκλαβενίτης", brand: "Σκλαβενίτης", distanceMeters: 430 },
  { id: "4", name: "Μασούτης", brand: "Μασούτης", distanceMeters: 370 },
  { id: "5", name: "Τζιβαέρι", distanceMeters: 120 },
  { id: "6", name: "Market Κρεάτων", distanceMeters: 520 },
  { id: "7", name: "MixMax", distanceMeters: 940 },
];

test("location eligibility keeps only chains with a matched nearby branch", () => {
  const proximity = buildRetailerProximity(retailers, nearbyStores);
  const eligible = filterRetailersByProximity(retailers, proximity, true);

  assert.deepEqual(
    eligible.map((retailer) => retailer.id),
    ["ab_vasilopoulos", "lidl", "masoutis", "sklavenitis"],
  );
  assert.equal(proximity.halkiadakis, null);
});

test("location filtering is inactive before permission is granted", () => {
  const proximity = buildRetailerProximity(retailers, nearbyStores);
  assert.equal(filterRetailersByProximity(retailers, proximity, false), retailers);
});
