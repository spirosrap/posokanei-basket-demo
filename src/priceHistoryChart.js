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
  const firstPrice = points[0].price;
  const latestPrice = points[points.length - 1].price;
  const delta = round(latestPrice - firstPrice, 4);
  return {
    firstPrice,
    latestPrice,
    minimumPrice: Math.min(...prices),
    maximumPrice: Math.max(...prices),
    observations: points.length,
    changes,
    delta,
    percentage: firstPrice > 0 ? round((delta / firstPrice) * 100, 2) : null,
    direction: delta < 0 ? "decrease" : delta > 0 ? "increase" : "same",
  };
}

function niceStep(value) {
  if (!Number.isFinite(value) || value <= 0) return 0.1;
  const exponent = Math.floor(Math.log10(value));
  const magnitude = 10 ** exponent;
  const fraction = value / magnitude;
  const niceFraction = fraction <= 1.5
    ? 1
    : fraction <= 2.25
      ? 2
      : fraction <= 3.5
        ? 2.5
        : fraction <= 7.5
          ? 5
          : 10;
  return niceFraction * magnitude;
}

function priceScale(rawMinPrice, rawMaxPrice) {
  const range = rawMaxPrice - rawMinPrice;
  let step = niceStep(range > 0 ? range / 5 : Math.max(rawMaxPrice * 0.08, 0.1));

  const createDomain = () => {
    const margin = range > 0 ? step * 0.35 : step;
    const minPrice = Math.max(0, Math.floor((rawMinPrice - margin) / step) * step);
    const maxPrice = Math.ceil((rawMaxPrice + margin) / step) * step;
    return {
      minPrice: round(minPrice, 4),
      maxPrice: round(Math.max(maxPrice, minPrice + step), 4),
    };
  };

  let domain = createDomain();
  if (Math.round((domain.maxPrice - domain.minPrice) / step) + 1 > 7) {
    step = niceStep(step * 1.5);
    domain = createDomain();
  }

  const tickCount = Math.round((domain.maxPrice - domain.minPrice) / step);
  const prices = Array.from(
    { length: tickCount + 1 },
    (_, index) => round(domain.maxPrice - index * step, 4),
  );
  return { ...domain, prices };
}

function parsedTimestamp(value) {
  if (Number.isFinite(value)) return Number(value);
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function createPriceHistoryChart(
  history,
  {
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT,
    observedUntilMs: observedUntilValue,
  } = {},
) {
  const rawSeries = Array.isArray(history?.retailers) ? history.retailers : [];
  const allPoints = rawSeries.flatMap((series) => series.points || []);
  if (!allPoints.length) return null;

  const rawMinTime = Math.min(...allPoints.map((point) => point.observedAtMs));
  const rawMaxTime = Math.max(...allPoints.map((point) => point.observedAtMs));
  const requestedObservedUntil = parsedTimestamp(observedUntilValue);
  const observedUntilMs = Math.max(rawMaxTime, requestedObservedUntil || rawMaxTime);
  const timePadding = rawMinTime === observedUntilMs ? 30 * 60 * 1000 : 0;
  const minTime = rawMinTime - timePadding;
  const maxTime = observedUntilMs + timePadding;
  const rawMinPrice = Math.min(...allPoints.map((point) => point.price));
  const rawMaxPrice = Math.max(...allPoints.map((point) => point.price));
  const { minPrice, maxPrice, prices: yTickPrices } = priceScale(rawMinPrice, rawMaxPrice);
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
    const latestPoint = points[points.length - 1];
    const currentX = scale(observedUntilMs, minTime, maxTime, plot.left, plot.right);
    return {
      ...entry,
      color: PRICE_HISTORY_COLORS[index % PRICE_HISTORY_COLORS.length],
      points,
      path: stepPath(points),
      continuationPath: currentX > latestPoint.x + 0.5
        ? `M ${round(latestPoint.x)} ${round(latestPoint.y)} H ${round(currentX)}`
        : "",
      currentPoint: {
        ...latestPoint,
        observedAtMs: observedUntilMs,
        x: currentX,
      },
      hasContinuation: currentX > latestPoint.x + 0.5,
      summary: historySummary(points),
    };
  });
  const yTicks = yTickPrices.map((price) => ({
    price,
    y: scale(price, minPrice, maxPrice, plot.bottom, plot.top),
  }));
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
    observedUntilMs,
    timeSpanMs: observedUntilMs - rawMinTime,
    minPrice,
    maxPrice,
    series,
    yTicks,
    xTicks,
  };
}
