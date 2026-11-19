export function hasKritikosPrices(availability, confirmed) {
  if (typeof confirmed === "boolean") return confirmed;
  if (availability?.some((row) => row.id === "kritikos")) return false;
  return null;
}

export function shoppingRetailers(directory, hasPrices) {
  return hasPrices === true ? directory : directory.filter(({ id }) => id !== "kritikos");
}

export function otherUnavailableChains(rows = []) {
  return rows.filter(({ id }) => id !== "kritikos").map(({ name }) => name).join(", ");
}

export function eligibleSelection(retailers, savedIds) {
  const ids = retailers.map(({ id }) => id);
  return new Set(savedIds === null ? ids : ids.filter(id => savedIds.includes(id)));
}
