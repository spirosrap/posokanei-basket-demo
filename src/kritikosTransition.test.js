import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { hasKritikosPrices, otherUnavailableChains, shoppingRetailers, eligibleSelection } from "./kritikosTransition.js";
import { buildCatalogCoverageProfile } from "../scripts/catalog-publication-guard.mjs";
import { prepareRetailerOutage } from "../scripts/retailer-outage.mjs";
import { coverageCopy } from "./catalogAvailabilityCopy.js";

const directory = [{ id: "masoutis" }, { id: "kritikos" }];
const outages = [{ id: "kritikos", name: "Κρητικός" }, { id: "lidl", name: "Lidl" }];
test("directory, old observations and unknown availability never create a separate shopping option", () => {
  for (const availability of [hasKritikosPrices(outages), hasKritikosPrices([]), false]) {
    assert.deepEqual(shoppingRetailers(directory, availability), [directory[0]]);
  }
  assert.equal(otherUnavailableChains(outages), "Lidl");
  assert.equal(shoppingRetailers(directory, hasKritikosPrices([], true)), directory);
  const saved = ["masoutis", "kritikos"];
  assert.deepEqual([...eligibleSelection(shoppingRetailers(directory, false), saved)], ["masoutis"]);
  assert.deepEqual([...eligibleSelection(shoppingRetailers(directory, true), saved)], saved);
});

test("a first real Greek Kritikos offer can return without restoring the entire old range", () => {
  const old = { products: [], availability: { unavailable_retailers: [ { id: "kritikos", previous_count: 2528 } ] } };
  const candidate = { products: [{ id: "p", retailer_prices: [
    { retailer: "kritikos", country: "GR", price: 2.35 },
    { retailer: "masoutis", country: "GR", price: 2.50 },
  ] }] };
  assert.equal(prepareRetailerOutage(old, candidate).snapshot, candidate);
  for (const offer of [{ price: null }, { price: 0 }, { price: 2, country: "CY" }]) {
    assert.equal(buildCatalogCoverageProfile({products: [{retailer_prices: [{retailer: "kritikos", ...offer}]}]}).total_offers, 0);
  }
});

test("both languages explain the transition and archived observations remain separately downloadable", () => {
  for (const lang of ["el", "en"]) {
    assert.match(coverageCopy[lang].kritikosTransitionBody, /PosoKanei/);
    assert.doesNotMatch(coverageCopy[lang].kritikosTransitionBody, /temporarily unavailable|προσωρινά μη διαθέσιμ/i);
  }
  const archive = JSON.parse(readFileSync(new URL("../public/history/kritikos.json", import.meta.url)));
  assert.equal(archive.historical_only, true);
  assert.ok(archive.snapshots.at(-1).prices.length >= 2528);
  assert.ok(archive.snapshots.every(s => s.prices.every(p => p.retailer === "kritikos" && p.price > 0)));
});
