export const BASKET_HISTORY_LIMIT = 20;

export function createBasketHistory(basket) {
  return { past: [], present: basket, future: [] };
}

function sameBasket(left, right) {
  return left.length === right.length && left.every((entry, index) =>
    entry.productId === right[index].productId && entry.quantity === right[index].quantity,
  );
}

export function basketHistoryReducer(state, action) {
  if (action.type === "undo") {
    if (!state.past.length) return state;
    return {
      past: state.past.slice(0, -1),
      present: state.past.at(-1),
      future: [state.present, ...state.future],
    };
  }
  if (action.type === "redo") {
    if (!state.future.length) return state;
    return {
      past: [...state.past, state.present].slice(-BASKET_HISTORY_LIMIT),
      present: state.future[0],
      future: state.future.slice(1),
    };
  }
  if (action.type !== "edit" && action.type !== "reset") return state;
  const next = typeof action.value === "function" ? action.value(state.present) : action.value;
  if (sameBasket(state.present, next)) {
    return action.clearHistory ? createBasketHistory(next) : state;
  }
  if (action.type === "reset") return createBasketHistory(next);
  return {
    past: [...state.past, state.present].slice(-BASKET_HISTORY_LIMIT),
    present: next,
    future: [],
  };
}
