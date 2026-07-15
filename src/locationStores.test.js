import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPlanRoute,
  buildRetailerProximity,
  filterRetailersByProximity,
  mapsDirectionsUrl,
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

test("nearby plan routes start with the closest branch and include every stop", () => {
  const plan = {
    isComplete: true,
    groups: [
      { retailer: retailers[1] },
      { retailer: retailers[2] },
      { retailer: retailers[3] },
    ],
  };
  const proximity = {
    lidl: { nearest: { id: "lidl", lat: 40.01, lon: 23 } },
    masoutis: { nearest: { id: "masoutis", lat: 40.02, lon: 23 } },
    sklavenitis: { nearest: { id: "sklavenitis", lat: 40.03, lon: 23 } },
  };
  const origin = { lat: 40, lon: 23 };
  const route = buildPlanRoute(plan, proximity, origin);

  assert.deepEqual(
    route.stops.map((stop) => stop.retailer.id),
    ["lidl", "masoutis", "sklavenitis"],
  );
  assert.ok(route.totalDistanceMeters > 0);

  const mapsUrl = new URL(mapsDirectionsUrl(route, origin));
  assert.equal(mapsUrl.searchParams.get("origin"), "40,23");
  assert.equal(mapsUrl.searchParams.get("destination"), "40.03,23");
  assert.equal(mapsUrl.searchParams.get("waypoints"), "40.01,23|40.02,23");
});

test("nearby plan routes require a matched branch for every selected chain", () => {
  const plan = {
    isComplete: true,
    groups: [{ retailer: retailers[1] }, { retailer: retailers[4] }],
  };
  assert.equal(
    buildPlanRoute(plan, { lidl: { nearest: nearbyStores[1] } }, { lat: 40, lon: 23 }),
    null,
  );
});
