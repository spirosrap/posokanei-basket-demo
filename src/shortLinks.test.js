import assert from "node:assert/strict";
import test from "node:test";
import { canonicalizeBasketUrl, shortenBasketUrl } from "./shortLinks.js";

test("basket links are canonicalized to the live app before shortening", () => {
  assert.equal(
    canonicalizeBasketUrl("http://127.0.0.1:4178/?basket=abc_123&debug=1#test"),
    "https://agenticspiros.com/demo/posokanei-basket/?basket=abc_123",
  );
});

test("only valid basket payloads can use the shortener", () => {
  assert.throws(
    () => canonicalizeBasketUrl("https://agenticspiros.com/demo/posokanei-basket/"),
    /invalid_basket_url/u,
  );
  assert.throws(
    () => canonicalizeBasketUrl("https://example.test/?basket=bad%20token"),
    /invalid_basket_url/u,
  );
});

test("shortening sends only the canonical basket URL and validates the provider response", async () => {
  let request;
  const shortUrl = await shortenBasketUrl("https://example.test/?basket=abc123", {
    fetchImpl: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        json: async () => ({
          short_url: "https://agenticspiros.com/demo/posokanei-basket/s/Test_12345",
        }),
      };
    },
  });

  assert.equal(
    shortUrl,
    "https://agenticspiros.com/demo/posokanei-basket/s/Test_12345",
  );
  assert.match(request.url, /api\/shorten\.php$/u);
  assert.deepEqual(JSON.parse(request.options.body), {
    url: "https://agenticspiros.com/demo/posokanei-basket/?basket=abc123",
  });
});

test("shortening rejects an unexpected short-link provider", async () => {
  await assert.rejects(
    shortenBasketUrl("https://example.test/?basket=another123", {
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ short_url: "https://example.test/not-safe" }),
      }),
    }),
    /invalid_short_url/u,
  );
});
