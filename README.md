# Καλάθι Τιμών

A static React demo for building a supermarket basket and ranking Greek supermarket chains by the total cost of buying the whole list in one place.

The prototype was inspired by [posokanei.gov.gr](https://posokanei.gov.gr/), which compares supermarket product prices in Greece. This repo explores a basket-first workflow: choose the exact products you want, adjust quantities, then see which supermarket chain can cover the full list for the lowest overall total.

This is an unofficial demo. It is not affiliated with PosoKanei or any supermarket chain.

![Desktop screenshot](screenshots/desktop.png)

## What It Does

- Search or filter products by category.
- Add products to a basket.
- Adjust quantities with steppers, including `kg` products.
- Rank supermarket chains by total basket price.
- Show coverage and missing-item counts per chain.
- Highlight the cheapest complete one-stop basket.
- Optimize the basket for up to `1`, `2`, `3`, or `4` supermarket stops.
- Show which products to buy from each chain in a multi-stop plan.
- Show savings compared with the most expensive complete basket.
- Separate partial baskets from chains where you can buy everything.
- Open product detail with barcode, unit, description, and per-chain prices.
- Switch between demo data and the live PosoKanei catalog.
- Load official product photos from the PosoKanei image endpoints.
- Browse/search the official catalog with pagination instead of a fixed sample list.

## Demo Target

The app is built to run as a subpath deployment:

```text
https://agenticspiros.com/demo/posokanei-basket/
```

The React build uses relative assets (`base: "./"` in `vite.config.js`). Live mode also ships a small PHP proxy under `public/api/posokanei.php`, so production hosting must be able to execute PHP for the same-origin catalog calls.

## Screenshots

Desktop:

![Desktop app](screenshots/desktop.png)

Mobile:

![Mobile app](screenshots/mobile.png)

## Local Development

Requirements:

- Node.js 26+
- npm 11+

Install and run:

```bash
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:5173/
```

## Build

```bash
npm run build
```

The static output is written to:

```text
dist/
```

## Validation

These checks were run during the initial release:

```bash
npm run lint
npm run build
npm audit --omit=dev
```

Browser QA covered:

- Desktop first viewport.
- Mobile 390px viewport.
- No horizontal overflow on mobile.
- No browser console errors.
- Product add flow.
- Quantity update flow.
- Product detail drawer open/close.
- Live mode loading the official catalog.
- Live search for `γάλα`, including product photos.
- Adding an official live product to the basket and recalculating the plan.

## PosoKanei API Discovery

The official PosoKanei web app is a Flutter application. Its compiled bundle references these backend routes:

- `POST https://api.posokanei.gov.gr/products/search`
- `GET https://api.posokanei.gov.gr/products/{id}?sort_retailers=asc&countries=GR&include_tax=true`
- `GET https://api.posokanei.gov.gr/products/barcode/{barcode}?countries=GR&include_tax=true`
- `GET https://api.posokanei.gov.gr/meta/categories`
- `GET https://api.posokanei.gov.gr/meta/categories/tree?include_counts=true&include_hidden=false`
- `GET https://api.posokanei.gov.gr/meta/retailers?countries=GR`
- `GET https://api.posokanei.gov.gr/meta/stats`

During development on 2026-06-18:

- `GET /meta/stats` returned `8,774` total products and `8,770` active products.
- `GET /products?page=1&page_size=2&countries=GR` returned official product records with `image_url`, `price_stats`, `retailer_prices`, and category metadata.
- `POST /products/search` with `{ "title": "γάλα", "countries": ["GR"] }` returned `271` milk-related products.
- Product images are served from URLs like `https://api.posokanei.gov.gr/images/product/<id>?v=<version>`.

The official API does not allow `https://agenticspiros.com` as a browser CORS origin, so direct `fetch()` calls from a static frontend are blocked. The demo handles this with:

- A demo dataset in `src/demoData.js`.
- A same-origin PHP proxy in `public/api/posokanei.php`.
- A live catalog adapter in `src/posokaneiApi.js`.
- A visible API/demo status in the UI.
- Graceful fallback/status when the live proxy or upstream API fails.

## Data Model

Products are normalized into this shape:

```js
{
  id: "milk-1l",
  gtin: "5201054020902",
  name: "Γάλα φρέσκο πλήρες 1L",
  brand: "Δέλτα",
  category: "Γαλακτοκομικά",
  unit: "τεμ.",
  unitQuantity: "1 L",
  imageUrl: "https://api.posokanei.gov.gr/images/product/...",
  prices: {
    sklavenitis: 1.74,
    ab_vasilopoulos: 1.82,
    lidl: 1.57
  }
}
```

Basket rankings are computed locally in `src/pricing.js`.

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for the Plesk/HostEurope upload path and
static artifact notes.

Short version:

```bash
npm run build
curl --ftp-create-dirs -T dist/index.html ftp://agenticspiros.com/demo/posokanei-basket/index.html
curl --ftp-create-dirs -T dist/api/posokanei.php ftp://agenticspiros.com/demo/posokanei-basket/api/posokanei.php
```

## Limitations

- Demo mode uses sample values; Live mode reads current PosoKanei catalog responses through the same-origin proxy.
- The live API adapter is best-effort because the PosoKanei API does not appear to have public documentation.
- The UI paginates the official catalog; it does not render all 8k+ products at once.
- The app can compare one-store baskets and multi-stop plans up to four chains.
- Multi-stop plans optimize product price only; they do not include travel time, distance, parking, delivery fees, or user location.
- It does not handle delivery fees, loyalty cards, geographic availability, substitutions, coupons, or in-store stock.
- Production use should add caching, API rate limiting, error telemetry, and an explicit policy check for upstream API usage.

## License

MIT
