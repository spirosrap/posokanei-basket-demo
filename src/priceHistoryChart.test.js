import assert from "node:assert/strict";
import test from "node:test";
import { createPriceHistoryChart } from "./priceHistoryChart.js";

const history = {
  retailers: [
    {
      retailerId: "chain-a",
      retailerName: "Αλυσίδα Α",
      points: [
        {
          observedAt: "2026-07-17T10:00:00.000Z",
          observedAtMs: Date.parse("2026-07-17T10:00:00.000Z"),
          price: 4,
        },
        {
          observedAt: "2026-07-17T11:00:00.000Z",
          observedAtMs: Date.parse("2026-07-17T11:00:00.000Z"),
          price: 3.5,
        },
        {
          observedAt: "2026-07-17T12:00:00.000Z",
          observedAtMs: Date.parse("2026-07-17T12:00:00.000Z"),
          price: 3.5,
        },
      ],
    },
  ],
};

test("price-history chart renders changes as a step path", () => {
  const chart = createPriceHistoryChart(history);
  const [series] = chart.series;

  assert.match(series.path, /^M .+ H .+ V .+ H .+ V /);
  assert.deepEqual(series.summary, {
    firstPrice: 4,
    latestPrice: 3.5,
    minimumPrice: 3.5,
    maximumPrice: 4,
    observations: 3,
    changes: 1,
  });
  assert.equal(chart.xTicks.length, 4);
  assert.equal(chart.yTicks.length, 5);
  assert.equal(
    series.points.every((point) => (
      point.x >= chart.plot.left
      && point.x <= chart.plot.right
      && point.y >= chart.plot.top
      && point.y <= chart.plot.bottom
    )),
    true,
  );
});

test("price-history chart requires at least one observation", () => {
  assert.equal(createPriceHistoryChart({ retailers: [] }), null);
});

test("narrow charts use only start and end time labels", () => {
  const chart = createPriceHistoryChart(history, { width: 320, height: 250 });

  assert.equal(chart.xTicks.length, 2);
  assert.equal(chart.xTicks[0].observedAtMs, chart.minTime);
  assert.equal(chart.xTicks[1].observedAtMs, chart.maxTime);
});
