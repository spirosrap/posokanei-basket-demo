import assert from "node:assert/strict";
import test from "node:test";
import { formatPlanText } from "./planText.js";

const plan = {
  isComplete: true,
  chainCount: 2,
  total: 9.4,
  groups: [
    {
      retailer: { id: "sklavenitis", name: "Σκλαβενίτης" },
      total: 5,
      items: [
        {
          quantity: 2,
          product: { id: "milk", name: "Γάλα 1L" },
          lineTotal: 5,
        },
      ],
    },
    {
      retailer: { id: "masoutis", name: "Μασούτης" },
      total: 4.4,
      items: [
        {
          quantity: 1,
          product: { id: "coffee", name: "Καφές 200g" },
          lineTotal: 4.4,
        },
      ],
    },
  ],
};

test("shopping-plan text is grouped by chain with quantities and totals", () => {
  const text = formatPlanText(plan);
  assert.match(text, /Πλάνο αγορών · 2 στάσεις/u);
  assert.match(text, /1\. Σκλαβενίτης/u);
  assert.match(text, /- 2 x Γάλα 1L/u);
  assert.match(text, /2\. Μασούτης/u);
  assert.match(text, /- 1 x Καφές 200g/u);
  assert.doesNotMatch(text, /Lidl/u);
});

test("incomplete plans are not exported as shopping instructions", () => {
  assert.equal(formatPlanText({ ...plan, isComplete: false }), "");
});
