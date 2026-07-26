import test from "node:test";
import assert from "node:assert/strict";
import {
  findProductAlternatives,
  prepareProductAlternatives,
} from "./productAlternatives.js";

function product({
  id,
  name,
  brand,
  category,
  categoryId,
  quantity,
  price,
  unitPrice,
  retailer = "store-a",
}) {
  return {
    id,
    name,
    brand,
    category,
    category_ids: ["food", categoryId],
    unit: "kg",
    unit_quantity: quantity,
    retailer_prices: [{ retailer, price, price_normalized: unitPrice }],
  };
}

test("strict alternatives keep cottage cheese separate from general cream cheese", () => {
  const products = [
    product({ id: "cottage", name: "ARLA Cottage 200g", brand: "Arla", category: "Μαλακά/Αλοιφώμενα", categoryId: "soft-cheese", quantity: 0.2, price: 1.95, unitPrice: 9.75 }),
    product({ id: "protein-cottage", name: "DAIRLY Cottage Cheese Protein 200g", brand: "Dairly", category: "Μαλακά/Αλοιφώμενα", categoryId: "soft-cheese", quantity: 0.2, price: 1.55, unitPrice: 7.75 }),
    product({ id: "cream", name: "ARLA Τυρί Κρέμα 200g", brand: "Arla", category: "Μαλακά/Αλοιφώμενα", categoryId: "soft-cheese", quantity: 0.2, price: 1.6, unitPrice: 8 }),
    product({ id: "feta", name: "Φέτα ΠΟΠ 200g", brand: "Delta", category: "Μαλακά/Αλοιφώμενα", categoryId: "soft-cheese", quantity: 0.2, price: 2.2, unitPrice: 11 }),
  ];
  const result = findProductAlternatives(prepareProductAlternatives(products), {
    productId: "cottage",
    retailerIds: ["store-a"],
  });

  assert.deepEqual(result.suggestions.map((item) => item.product.id), ["protein-cottage"]);
  assert.equal(result.suggestions[0].matchKind, "specific");
  assert.deepEqual(result.suggestions[0].traits, ["protein"]);
});

test("strict alternatives keep German-style bread within the same bread family", () => {
  const products = [
    product({ id: "german-multi", name: "ΚΑΤΣΕΛΗΣ Ψωμί Τοστ Γερμανικού Τύπου Πολύσπορο 500g", brand: "ΚΑΤΣΕΛΗΣ", category: "Ψωμί τυποποιημένο", categoryId: "bread", quantity: 0.5, price: 2.06, unitPrice: 4.12 }),
    product({ id: "german-whole", name: "ΠΑΠΑΔΟΠΟΥΛΟΥ Ψωμί Ολικής Άλεσης Γερμανικού Τύπου 500g", brand: "ΠΑΠΑΔΟΠΟΥΛΟΥ", category: "Ψωμί τυποποιημένο", categoryId: "bread", quantity: 0.5, price: 2.48, unitPrice: 4.96 }),
    product({ id: "toast", name: "ΚΑΡΑΜΟΛΕΓΚΟΣ Ψωμί Τοστ Πολύσπορο 500g", brand: "ΚΑΡΑΜΟΛΕΓΚΟΣ", category: "Ψωμί τυποποιημένο", categoryId: "bread", quantity: 0.5, price: 1.56, unitPrice: 3.12 }),
  ];
  const result = findProductAlternatives(prepareProductAlternatives(products), {
    productId: "german-multi",
    retailerIds: ["store-a"],
  });

  assert.deepEqual(result.suggestions.map((item) => item.product.id), ["german-whole"]);
});

test("specific catalogue categories can offer close variants while excluding impractical packs", () => {
  const products = [
    product({ id: "mild", name: "HELLMANN'S Μουστάρδα Απαλή 500g", brand: "HELLMANN'S", category: "Μουστάρδα", categoryId: "mustard", quantity: 0.5, price: 2.68, unitPrice: 5.36 }),
    product({ id: "mild-cheap", name: "17 DELICATESSEN Μουστάρδα Απαλή 250g", brand: "17 DELICATESSEN", category: "Μουστάρδα", categoryId: "mustard", quantity: 0.25, price: 0.88, unitPrice: 3.52 }),
    product({ id: "spicy", name: "17 DELICATESSEN Μουστάρδα Πικάντικη 250g", brand: "17 DELICATESSEN", category: "Μουστάρδα", categoryId: "mustard", quantity: 0.25, price: 0.88, unitPrice: 3.52 }),
    product({ id: "catering", name: "BRAVA Μουστάρδα Απαλή 4kg", brand: "BRAVA", category: "Μουστάρδα", categoryId: "mustard", quantity: 4, price: 9.5, unitPrice: 2.38 }),
    product({ id: "other-store", name: "Μουστάρδα Απαλή 450g", brand: "Other", category: "Μουστάρδα", categoryId: "mustard", quantity: 0.45, price: 1.2, unitPrice: 2.67, retailer: "store-b" }),
  ];
  const result = findProductAlternatives(prepareProductAlternatives(products), {
    productId: "mild",
    retailerIds: ["store-a"],
    limit: 6,
  });

  assert.deepEqual(
    new Set(result.suggestions.map((item) => item.product.id)),
    new Set(["mild-cheap", "spicy"]),
  );
  assert.ok(result.suggestions.every((item) => item.savingsAmount > 0));
});

test("alternative results are intentionally capped", () => {
  const source = product({ id: "source", name: "Μουστάρδα Απαλή 500g", brand: "Source", category: "Μουστάρδα", categoryId: "mustard", quantity: 0.5, price: 3, unitPrice: 6 });
  const candidates = Array.from({ length: 12 }, (_, index) => product({
    id: `candidate-${index}`,
    name: `Μουστάρδα Απαλή ${250 + index}g`,
    brand: `Brand ${index}`,
    category: "Μουστάρδα",
    categoryId: "mustard",
    quantity: 0.25 + index / 1000,
    price: 1 + index / 100,
    unitPrice: 4 + index / 100,
  }));
  const result = findProductAlternatives(prepareProductAlternatives([source, ...candidates]), {
    productId: "source",
    retailerIds: ["store-a"],
    limit: 5,
  });

  assert.equal(result.suggestions.length, 5);
});

test("equivalent cheese keeps the selected sliced format", () => {
  const products = [
    product({ id: "sliced", name: "ΝΟΥΝΟΥ Γκούντα σε Φέτες 200g", brand: "ΝΟΥΝΟΥ", category: "Γκούντα", categoryId: "gouda", quantity: 0.2, price: 2.2, unitPrice: 11 }),
    product({ id: "other-sliced", name: "ΦΑΓΕ Γκούντα σε Φέτες 200g", brand: "ΦΑΓΕ", category: "Γκούντα", categoryId: "gouda", quantity: 0.2, price: 1.9, unitPrice: 9.5 }),
    product({ id: "grated", name: "MILBONA Γκούντα Τριμμένη 200g", brand: "MILBONA", category: "Γκούντα", categoryId: "gouda", quantity: 0.2, price: 1.5, unitPrice: 7.5 }),
  ];
  const result = findProductAlternatives(prepareProductAlternatives(products), {
    productId: "sliced",
    retailerIds: ["store-a"],
  });

  assert.deepEqual(result.suggestions.map((item) => item.product.id), ["other-sliced"]);
});
