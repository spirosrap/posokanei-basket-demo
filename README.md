# Καλάθι Τιμών Supermarket

A React app for building a supermarket basket from the live PosoKanei catalog and ranking Greek supermarket chains by the total cost of the selected groceries.

The app is inspired by [posokanei.gov.gr](https://posokanei.gov.gr/), which compares supermarket product prices in Greece. The workflow is basket-first: choose the exact products you want, adjust quantities, decide whether you can make `1`, `2`, `3`, or `4` supermarket stops, then see the cheapest complete plan.

This is an unofficial app. It is not affiliated with PosoKanei or any supermarket chain.

Live app: [agenticspiros.com/demo/posokanei-basket](https://agenticspiros.com/demo/posokanei-basket/)

![Desktop screenshot showing a two-stop supermarket basket plan](screenshots/desktop.png)

## Ελληνικά

Το **Καλάθι Τιμών Supermarket** σε βοηθά να φτιάξεις μια λίστα με προϊόντα supermarket και να δεις πού συμφέρει να τα αγοράσεις συνολικά.

Η βασική ιδέα είναι απλή:

- Διαλέγεις προϊόντα από τον live κατάλογο του PosoKanei.
- Προσθέτεις τις ποσότητες που θέλεις στο καλάθι.
- Επιλέγεις πόσες στάσεις είσαι διατεθειμένος να κάνεις: `1`, `2`, `3` ή `4` αλυσίδες.
- Η εφαρμογή βρίσκει το φθηνότερο πλήρες πλάνο για τη λίστα σου.
- Αν επιλέξεις περισσότερες από μία στάσεις, σου δείχνει τι αγοράζεις από κάθε αλυσίδα.

Για παράδειγμα, αν θέλεις να πας μόνο σε ένα supermarket, η εφαρμογή ταξινομεί τις αλυσίδες από τη φθηνότερη έως την ακριβότερη για ολόκληρο το καλάθι. Αν αντέχεις δύο ή τρεις στάσεις, υπολογίζει αν συμφέρει να χωριστεί η λίστα σε περισσότερες αλυσίδες.

Η εφαρμογή διαβάζει live προϊόντα, φωτογραφίες και τιμές μέσω μικρού PHP proxy, επειδή το επίσημο API δεν επιτρέπει απευθείας browser requests από τρίτα domains. Υπάρχει επίσης endpoint και script για περιοδικό έλεγχο ενημερώσεων τιμών/προϊόντων.

## What It Does

- Search or filter live products by category or barcode.
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
- Load official product photos from the PosoKanei image endpoints.
- Browse/search the official catalog with pagination instead of a fixed sample list.
- Show the last product/price update check in the UI.
- Provide a scheduler-friendly update check script and PHP endpoint.

## Live Target

The app is built to run as a subpath deployment:

```text
https://agenticspiros.com/demo/posokanei-basket/
```

The React build uses relative assets (`base: "./"` in `vite.config.js`). The live catalog uses small PHP endpoints under `public/api/`, so production hosting must be able to execute PHP for the same-origin catalog and update-status calls.

## Screenshots

Desktop, with a two-stop optimized basket:

![Desktop app with a two-stop plan](screenshots/desktop.png)

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
- Loading the official catalog.
- Live search for `γάλα`, including product photos.
- Adding an official live product to the basket and recalculating the plan.
- Update-status endpoint and scheduled-check script.

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

- `GET /meta/stats` returned live catalog counts around `8.8k` total products and `8.7k` active products.
- `GET /products?page=1&page_size=2&countries=GR` returned official product records with `image_url`, `price_stats`, `retailer_prices`, and category metadata.
- `POST /products/search` with `{ "title": "γάλα", "countries": ["GR"] }` returned `271` milk-related products.
- Product images are served from URLs like `https://api.posokanei.gov.gr/images/product/<id>?v=<version>`.

The official API does not allow `https://agenticspiros.com` as a browser CORS origin, so direct `fetch()` calls from a static frontend are blocked. The app handles this with:

- A same-origin PHP proxy in `public/api/posokanei.php`.
- A cached update-status endpoint in `public/api/update-status.php`.
- A live catalog adapter in `src/posokaneiApi.js`.
- A visible catalog and update-check status in the UI.
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

## Product/Price Update Checks

The app includes a lightweight update checker:

- `public/api/update-status.php` samples `meta/stats` plus a few representative product searches, fingerprints the result, and caches the status for 30 minutes.
- `npm run check:updates` calls the deployed endpoint with `?refresh=1` and writes the latest status to `.cache/posokanei-update-status.json`.
- `npm run catalog:snapshot` builds `public/data/catalog.json`, a same-origin fallback catalogue used when the hosted PHP proxy is blocked by the upstream API.
- The UI reads `api/update-status.php` and shows the last check time near the top of the app.

For a cron job:

```bash
*/30 * * * * cd /path/to/posokanei-basket-demo && npm run check:updates
```

To refresh the fallback catalogue before deploying:

```bash
npm run catalog:snapshot
npm run build
```

For Plesk Scheduled Tasks, a simple curl check is enough:

```bash
curl -fsS 'https://agenticspiros.com/demo/posokanei-basket/api/update-status.php?refresh=1' >/dev/null
```

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for the Plesk/HostEurope upload path and
static artifact notes.

Short version:

```bash
npm run build
curl --ftp-create-dirs -T dist/index.html ftp://agenticspiros.com/demo/posokanei-basket/index.html
curl --ftp-create-dirs -T dist/api/posokanei.php ftp://agenticspiros.com/demo/posokanei-basket/api/posokanei.php
curl --ftp-create-dirs -T dist/api/update-status.php ftp://agenticspiros.com/demo/posokanei-basket/api/update-status.php
curl --ftp-create-dirs -T dist/data/catalog.json ftp://agenticspiros.com/demo/posokanei-basket/data/catalog.json
```

## Limitations

- The live API adapter is best-effort because the PosoKanei API does not appear to have public documentation.
- If the upstream API blocks the production host, the app falls back to the last generated `data/catalog.json` snapshot.
- The UI paginates the official catalog; it does not render all 8k+ products at once.
- The app can compare one-store baskets and multi-stop plans up to four chains.
- Multi-stop plans optimize product price only; they do not include travel time, distance, parking, delivery fees, or user location.
- It does not handle delivery fees, loyalty cards, geographic availability, substitutions, coupons, or in-store stock.
- Production use should add caching, API rate limiting, error telemetry, and an explicit policy check for upstream API usage.

## License

MIT
