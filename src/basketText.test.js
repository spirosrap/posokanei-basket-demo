import assert from "node:assert/strict";
import test from "node:test";
import { formatBasketText, formatPortableTextFile } from "./basketText.js";

const basket = [
  { productId: "milk", quantity: 2 },
  { productId: "coffee", quantity: 1 },
];
const productMap = new Map([
  ["milk", { id: "milk", name: "Γάλα 1L" }],
  ["coffee", { id: "coffee", name: "Καφές 200g" }],
]);
const plan = {
  isComplete: true,
  chainCount: 2,
  total: 9.4,
  groups: [
    {
      retailer: { id: "sklavenitis", name: "Σκλαβενίτης" },
      total: 5,
      items: [
        { quantity: 2, product: productMap.get("milk"), lineTotal: 5 },
      ],
    },
    {
      retailer: { id: "masoutis", name: "Μασούτης" },
      total: 4.4,
      items: [
        { quantity: 1, product: productMap.get("coffee"), lineTotal: 4.4 },
      ],
    },
  ],
};

test("plain-text basket includes a checklist, grouped plan, totals, and share link", () => {
  const text = formatBasketText({
    basket,
    productMap,
    selectedStopLimit: 2,
    selectedPlanComplete: true,
    plan,
    planStopLimit: 2,
    shareUrl: "https://example.test/?basket=abc",
  });

  assert.match(text, /Λίστα αγορών · 2 προϊόντα · επιλεγμένο όριο έως 2 στάσεις/u);
  assert.match(text, /\[ \] 2 x Γάλα 1L/u);
  assert.match(text, /1\. Σκλαβενίτης · 5,00\s€/u);
  assert.match(text, /\[ \] 1 x Καφές 200g · 4,40\s€/u);
  assert.match(text, /https:\/\/example\.test\/\?basket=abc/u);
});

test("plain-text basket explains when it exports the first complete fallback plan", () => {
  const text = formatBasketText({
    basket,
    productMap,
    selectedStopLimit: 1,
    selectedPlanComplete: false,
    plan,
    planStopLimit: 2,
    shareUrl: "",
  });

  assert.match(text, /Το επιλεγμένο όριο \(έως 1 στάση\) δεν καλύπτει όλη τη λίστα/u);
  assert.match(text, /πρώτο πλήρες πλάνο \(έως 2 στάσεις\)/u);
});

test("plain-text basket supports English and an unavailable complete plan", () => {
  const text = formatBasketText({
    basket,
    productMap,
    selectedStopLimit: 1,
    selectedPlanComplete: false,
    plan: null,
    planStopLimit: null,
    shareUrl: "",
    language: "en",
  });

  assert.match(text, /Shopping list · 2 products · selected limit up to 1 stop/u);
  assert.match(text, /No complete plan is available with up to 1 stop/u);
});

test("downloaded text uses a UTF-8 BOM and Windows-compatible line endings", () => {
  const value = formatPortableTextFile("Καλάθι\nΓάλα\r\nΚαφές");
  assert.equal(value, "\uFEFFΚαλάθι\r\nΓάλα\r\nΚαφές");
  assert.doesNotMatch(value, /(?<!\r)\n/u);
});
