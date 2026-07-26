import assert from "node:assert/strict";
import test from "node:test";
import {
  localeForLanguage,
  translate,
  translationKeys,
} from "./i18n.js";

test("Greek and English expose the same translation keys", () => {
  assert.deepEqual(translationKeys("en"), translationKeys("el"));
});

test("core interface text and dynamic values are translated", () => {
  assert.equal(translate("el", "themeSelector"), "Θέμα εμφάνισης");
  assert.equal(translate("en", "themeSelector"), "Appearance theme");
  assert.equal(translate("el", "mobileWorkspaceNavigation"), "Προβολή εφαρμογής");
  assert.equal(
    translate("en", "lastCatalogueUpdate", { time: "15 Jul, 20:23" }),
    "Last updated: 15 Jul, 20:23",
  );
  assert.equal(
    translate("en", "catalogResults", { visible: "30", total: "8,551" }),
    "30 of 8,551 products from the updated catalogue",
  );
  assert.match(
    translate("el", "extraStopEstimateNote", { amount: "5,00 €", isFree: false }),
    /επιπλέον στάση.*τουλάχιστον 5,00 €/,
  );
  assert.match(
    translate("en", "extraStopEstimateNote", { amount: "€5.00", isFree: false }),
    /another stop.*at least €5.00/i,
  );
  assert.equal(translate("el", "priorityBalanced"), "Ισορροπία");
  assert.equal(translate("en", "priorityFewerStops"), "Fewer stops");
  assert.equal(
    translate("el", "priceDropped", { percent: "10", previous: "2,00 €" }),
    "10% κάτω · πριν 2,00 €",
  );
  assert.equal(
    translate("en", "priceIncreased", { percent: "5", previous: "€2.00" }),
    "5% up · was €2.00",
  );
  assert.match(
    translate("el", "recommendationSavingsInsight", {
      amount: "14,96 €",
      percent: "11",
      perStop: "14,96 €",
    }),
    /14,96 € \(11%\).*14,96 € ανά επιπλέον supermarket/,
  );
  assert.match(
    translate("el", "locationFilterActive", { count: "4", radius: "2χλμ." }),
    /μόνο 4 κοντινές αλυσίδες.*2χλμ.*δεν εμφανίζονται/,
  );
  assert.match(
    translate("en", "locationFilterActive", { count: "4", radius: "2 km" }),
    /only 4 nearby chains.*2 km.*are hidden/,
  );
  assert.equal(
    translate("el", "shoppingProgress", { checked: "3", total: "12" }),
    "3/12 αγορασμένα",
  );
  assert.equal(
    translate("en", "nearbyRouteSummary", { stops: "Lidl → Masoutis" }),
    "From your location: Lidl → Masoutis",
  );
  assert.equal(
    translate("el", "remainingSpend", { amount: "12,40 €" }),
    "Υπόλοιπο 12,40 €",
  );
  assert.equal(
    translate("en", "remainingRouteSummary", { next: "Lidl", later: "Masoutis" }),
    "Next: Lidl · then Masoutis",
  );
  assert.equal(
    translate("el", "remainingRouteSummary", { next: "Lidl", later: "" }),
    "Επόμενη: Lidl",
  );
  assert.equal(
    translate("el", "savedBasketSaved", { name: "Εβδομαδιαία" }),
    "Αποθηκεύτηκε η λίστα «Εβδομαδιαία».",
  );
  assert.equal(
    translate("en", "savedBasketLoaded", {
      name: "Weekly",
      products: "5 products",
      missing: "2",
    }),
    "Loaded “Weekly” with 5 products and today's prices. 2 products are no longer available.",
  );
  assert.match(translate("el", "savedBasketsPrivacy"), /Δεν αποθηκεύουν τοποθεσία, τιμές ή πρόοδο/);
  assert.equal(
    translate("el", "openPriceWatch", { count: "1" }),
    "Παρακολούθηση τιμών · 1 προϊόν",
  );
  assert.equal(
    translate("en", "priceWatchAboveTarget", { amount: "€1.25" }),
    "€1.25 above target",
  );
});

test("language selection controls locale-sensitive formatting", () => {
  assert.equal(localeForLanguage("el"), "el-GR");
  assert.equal(localeForLanguage("en"), "en-GB");
});
