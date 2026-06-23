# Deployment Notes

Target URL:

```text
https://agenticspiros.com/demo/posokanei-basket/
```

Static artifact:

```text
deploy/posokanei-basket-dist.zip
```

Live status:

```text
Deployed on 2026-06-18 under the existing agenticspiros.com document root.
```

Example Plesk target path:

```text
/var/www/vhosts/<domain>/httpdocs/demo/posokanei-basket/
```

The remote upload path is:

```text
demo/posokanei-basket/
```

Upload shape:

```bash
npm run build
curl --ftp-create-dirs -T dist/index.html \
  ftp://agenticspiros.com/demo/posokanei-basket/index.html
curl --ftp-create-dirs -T dist/assets/<asset-file> \
  ftp://agenticspiros.com/demo/posokanei-basket/assets/<asset-file>
```

If using Plesk File Manager instead, upload and extract:

```text
deploy/posokanei-basket-dist.zip
```

into:

```text
httpdocs/demo/posokanei-basket/
```

The production build uses absolute subpath assets via `vite.config.js`
(`base: "/demo/posokanei-basket/"`) and targets older Safari-compatible syntax.
The generated `.htaccess` disables PageSpeed and sets `index.html` as the
directory index.

Live catalog support also deploys:

```text
dist/api/posokanei.php
dist/api/update-status.php
dist/data/catalog.json
dist/data/catalog-meta.json
dist/data/refresh-status.json
```

`posokanei.php` is a same-origin proxy for the public PosoKanei catalog
endpoints. It exists because `https://api.posokanei.gov.gr` currently rejects
browser CORS requests from `agenticspiros.com`.

Current production caveat, checked on 2026-06-23: the upstream API also returns
`HTTP 403` to the Plesk server. Vercel Node, Vercel Edge, and Cloudflare Worker
probes also returned upstream `403`. `posokanei.php` therefore falls back
server-side to `data/catalog.json`, which is refreshed by an external scheduled
sync, and returns only the requested page/search results to the browser. The UI shows an
amber catalogue freshness notice with the latest sync time. Restoring true
request-time live production requests needs an upstream unblock/allowlist or a
proxy network that the upstream accepts.

`update-status.php` samples catalog stats and representative product searches
when the upstream is reachable. When the upstream is blocked, it reads
`../data/catalog.json` and reports `status: "snapshot"` plus the generated
timestamp so the UI can show the actual deployed data freshness.

`data/catalog.json` is a generated same-origin catalogue snapshot.
`data/catalog-meta.json` is a smaller generated metadata file for stats,
retailers, and categories. The PHP API uses both as a fallback when the upstream
PosoKanei API rejects server-side requests, so the frontend does not need to
download the full catalogue on first load.

`data/refresh-status.json` records the latest scheduled refresh result. On
success it stores the new catalogue timestamp; on upstream failure it stores the
failed attempt time and a short error such as `Upstream returned HTTP 403`.
`update-status.php` merges this into the UI status response.

Scheduled update check:

```bash
npm run check:updates
```

Snapshot refresh before deploying:

```bash
npm run catalog:snapshot
npm run build
```

Refresh and upload only the production fallback snapshot from a network that can
reach the upstream API:

```bash
npm run live:refresh
```

The script writes `dist/data/catalog.json` plus `dist/data/catalog-meta.json`,
uploads both under `demo/posokanei-basket/data/`, and verifies the public
catalogue timestamp. Configure FTP and public URL settings with environment
variables or `.env.local` based on `.env.example`. Use either `FTP_PASS` or
`FTP_KEYCHAIN_SERVICE` for FTP authentication.

When the upstream blocks refresh requests, the script exits non-zero but still
uploads `data/refresh-status.json` so production can show the failed refresh
attempt while continuing to serve the last successful catalogue.

When the local/deployment network is blocked but another trusted machine can
reach `api.posokanei.gov.gr`, set `POSOKANEI_REFRESH_HOST=<ssh-host>`. The
script copies the snapshot builder to that host, builds the catalogue there,
pulls back `catalog.json` and `catalog-meta.json`, then uploads them locally.
FTP credentials are not copied to the remote host.

Install the hourly macOS LaunchAgent refresh:

```bash
npm run live:install-refresh
```

The installer prints the scheduler and log paths for the local machine.

Plesk scheduled task equivalent:

```bash
curl -fsS 'https://agenticspiros.com/demo/posokanei-basket/api/update-status.php?refresh=1' >/dev/null
```

That Plesk task only works when Plesk can reach `api.posokanei.gov.gr`. While
Plesk is blocked, run `npm run live:refresh` from a separate environment that can
reach the upstream API.

Verification:

```bash
curl -L https://agenticspiros.com/demo/posokanei-basket/
curl -L https://agenticspiros.com/demo/posokanei-basket/assets/<asset-file>
curl -L https://agenticspiros.com/demo/posokanei-basket/data/catalog.json
curl -L https://agenticspiros.com/demo/posokanei-basket/data/catalog-meta.json
curl -L https://agenticspiros.com/demo/posokanei-basket/data/refresh-status.json
curl -L 'https://agenticspiros.com/demo/posokanei-basket/api/posokanei.php?resource=stats'
curl -L 'https://agenticspiros.com/demo/posokanei-basket/api/update-status.php?refresh=1'
curl -L 'https://agenticspiros.com/demo/posokanei-basket/api/posokanei.php?resource=search&title=%CE%B3%CE%AC%CE%BB%CE%B1&page=1&page_size=2'
```
