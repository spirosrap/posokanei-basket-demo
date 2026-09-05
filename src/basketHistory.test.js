import test from "node:test";
import assert from "node:assert/strict";
import { createBasketHistory, basketHistoryReducer as reduce, BASKET_HISTORY_LIMIT } from "./basketHistory.js";

const initial = [{ productId: "milk", quantity: 1 }];
const edit = (state, value) => reduce(state, { type: "edit", value });

test("add, quantity, remove and clear edits round-trip through undo and redo", () => {
  let state = createBasketHistory(initial);
  const snapshots = [initial];
  for (const basket of [
    [...initial, { productId: "bread", quantity: 2 }],
    [{ productId: "milk", quantity: 6 }, { productId: "bread", quantity: 2 }],
    [{ productId: "bread", quantity: 2 }],
    [],
  ]) {
    state = edit(state, basket);
    snapshots.push(basket);
  }
  for (const basket of snapshots.slice(0, -1).reverse()) {
    state = reduce(state, { type: "undo" });
    assert.deepEqual(state.present, basket);
  }
  assert.equal(reduce(state, { type: "undo" }), state);
  for (const basket of snapshots.slice(1)) {
    state = reduce(state, { type: "redo" });
    assert.deepEqual(state.present, basket);
  }
  assert.equal(reduce(state, { type: "redo" }), state);
  assert.deepEqual(initial, [{ productId: "milk", quantity: 1 }]);
});

test("functional edits apply to the latest state; no-ops preserve redo", () => {
  let state = edit(createBasketHistory(initial), (basket) => [...basket, { productId: "bread", quantity: 2 }]);
  state = reduce(state, { type: "undo" });
  assert.equal(edit(state, initial.map((entry) => ({ ...entry }))), state);
  state = edit(state, (basket) => basket.map((entry) => ({ ...entry, quantity: 3 })));
  assert.equal(state.future.length, 0);
  assert.equal(state.present[0].quantity, 3);
});

test("history is bounded and new lists or catalogue pruning reset it", () => {
  let state = createBasketHistory(initial);
  for (let quantity = 2; quantity < 80; quantity++) {
    state = edit(state, [{ productId: "milk", quantity }]);
  }
  assert.equal(state.past.length, BASKET_HISTORY_LIMIT);
  const sameReset = reduce(state, { type: "reset", value: state.present, clearHistory: true });
  assert.deepEqual(sameReset.past, []);
  assert.equal(reduce(state, { type: "reset", value: (basket) => basket }), state);
  state = reduce(state, { type: "reset", value: [] });
  assert.deepEqual(state, createBasketHistory([]));
  assert.equal(reduce(state, { type: "unknown" }), state);
});
