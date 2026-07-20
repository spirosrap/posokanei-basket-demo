export const PRICE_HISTORY_COLORS = [
  "#0f766e",
  "#2563eb",
  "#d97706",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
  "#be185d",
  "#4f46e5",
  "#15803d",
  "#b45309",
  "#475569",
  "#ca8a04",
];

const DEFAULT_WIDTH = 900;
const DEFAULT_HEIGHT = 330;
const PADDING = { top: 18, right: 22, bottom: 36, left: 64 };

function scale(value, inputMin, inputMax, outputMin, outputMax) {
  if (inputMin === inputMax) return (outputMin + outputMax) / 2;
  return outputMin + ((value - inputMin) / (inputMax - inputMin)) * (outputMax - outputMin);
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function stepPath(points) {
  if (!points.length) return "";
  return points.slice(1).reduce(
    (path, point) => `${path} H ${round(point.x)} V ${round(point.y)}`,
    `M ${round(points[0].x)} ${round(points[0].y)}`,
  );
}

function historySummary(points) {
  const prices = points.map((point) => point.price);
  const changes = points.slice(1).reduce(
    (count, point, index) => count + (point.price !== points[index].price ? 1 : 0),
    0,
  );
  return {
    firstPrice: points[0].price,
    latestPrice: points[points.length - 1].price,
    minimumPrice: Math.min(...prices),
    maximumPrice: Math.max(...prices),
    observations: points.length,
    changes,
  };
}

export function createPriceHistoryChart(
  history,
  { width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT } = {},
) {
  const rawSeries = Array.isArray(history?.retailers) ? history.retailers : [];
  const allPoints = rawSeries.flatMap((series) => series.points || []);
  if (!allPoints.length) return null;

  const rawMinTime = Math.min(...allPoints.map((point) => point.observedAtMs));
  const rawMaxTime = Math.max(...allPoints.map((point) => point.observedAtMs));
  const timePadding = rawMinTime === rawMaxTime ? 30 * 60 * 1000 : 0;
  const minTime = rawMinTime - timePadding;
  const maxTime = rawMaxTime + timePadding;
  const rawMinPrice = Math.min(...allPoints.map((point) => point.price));
  const rawMaxPrice = Math.max(...allPoints.map((point) => point.price));
  const priceRange = rawMaxPrice - rawMinPrice;
  const pricePadding = priceRange > 0
    ? Math.max(0.04, priceRange * 0.1)
    : Math.max(0.1, rawMaxPrice * 0.05);
  const minPrice = Math.max(0, rawMinPrice - pricePadding);
  const maxPrice = rawMaxPrice + pricePadding;
  const plot = {
    left: PADDING.left,
    right: width - PADDING.right,
    top: PADDING.top,
    bottom: height - PADDING.bottom,
  };
  const projectPoint = (point) => ({
    ...point,
    x: scale(point.observedAtMs, minTime, maxTime, plot.left, plot.right),
    y: scale(point.price, minPrice, maxPrice, plot.bottom, plot.top),
  });
  const series = rawSeries.map((entry, index) => {
    const points = entry.points.map(projectPoint);
    return {
      ...entry,
      color: PRICE_HISTORY_COLORS[index % PRICE_HISTORY_COLORS.length],
      points,
      path: stepPath(points),
      summary: historySummary(points),
    };
  });
  const yTicks = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    const price = maxPrice - ratio * (maxPrice - minPrice);
    return {
      price,
      y: scale(price, minPrice, maxPrice, plot.bottom, plot.top),
    };
  });
  const xTickCount = width < 500 ? 2 : width < 720 ? 3 : 4;
  const xTicks = Array.from({ length: xTickCount }, (_, index) => {
    const ratio = index / (xTickCount - 1);
    const observedAtMs = minTime + ratio * (maxTime - minTime);
    return {
      observedAtMs,
      x: scale(observedAtMs, minTime, maxTime, plot.left, plot.right),
    };
  });

  return {
    width,
    height,
    plot,
    minTime,
    maxTime,
    minPrice,
    maxPrice,
    series,
    yTicks,
    xTicks,
  };
}
