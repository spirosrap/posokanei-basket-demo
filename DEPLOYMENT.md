# Deployment Notes

Target URL:

```text
https://agenticspiros.com/demo/posokanei-basket/
```

Static artifact:

```text
/Users/spiros/Projects/posokanei-basket-demo/deploy/posokanei-basket-dist.zip
```

Live status:

```text
Deployed on 2026-06-18 under the existing agenticspiros.com document root.
```

Plesk path, following the existing `agenticspiros.com`/SecurityTech setup:

```text
/var/www/vhosts/securitytech.gr/httpdocs/spiros/demo/posokanei-basket/
```

The FTP account for `agenticspiros.com` opens at the personal-site document
root, so the remote upload path is:

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
/Users/spiros/Projects/posokanei-basket-demo/deploy/posokanei-basket-dist.zip
```

into:

```text
httpdocs/spiros/demo/posokanei-basket/
```

The build uses relative assets via `vite.config.js` (`base: "./"`). The generated
`.htaccess` disables PageSpeed and sets `index.html` as the directory index.

Live catalog support also deploys:

```text
dist/api/posokanei.php
dist/api/update-status.php
dist/data/catalog.json
```

`posokanei.php` is a same-origin proxy for the public PosoKanei catalog
endpoints. It exists because `https://api.posokanei.gov.gr` currently rejects
browser CORS requests from `agenticspiros.com`.

Current production caveat, checked on 2026-06-23: the upstream API also returns
`HTTP 403` to the Plesk server. Vercel Node, Vercel Edge, and Cloudflare Worker
probes also returned upstream `403`. The app therefore falls back to
`data/catalog.json`, which is refreshed hourly from this Mac, and shows an amber
snapshot freshness notice in the UI. Restoring true request-time live production
requests needs an upstream unblock/allowlist or a proxy network that the
upstream accepts.

`update-status.php` samples catalog stats and representative product searches
when the upstream is reachable. When the upstream is blocked, it reads
`../data/catalog.json` and reports `status: "snapshot"` plus the generated
timestamp so the UI can show the actual deployed data freshness.

`data/catalog.json` is a generated same-origin catalogue snapshot. The frontend
uses it as a fallback when the hosted PHP proxy is reachable but the upstream
PosoKanei API rejects server-side requests.

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
FTP_USER=agenticspirosftp npm run live:refresh
```

The script writes `dist/data/catalog.json`, uploads it to
`demo/posokanei-basket/data/catalog.json`, and verifies the public timestamp. It
uses `FTP_PASS` when set, or the macOS Keychain service
`Plesk FTP agenticspiros.com` on Spiros' Mac.

Install the hourly macOS LaunchAgent refresh:

```bash
npm run live:install-refresh
```

Installed local job and logs:

```text
~/Library/LaunchAgents/com.agenticspiros.posokanei-basket-refresh.plist
~/Library/Logs/posokanei-basket-refresh.log
~/Library/Logs/posokanei-basket-refresh.err.log
```

Plesk scheduled task equivalent:

```bash
curl -fsS 'https://agenticspiros.com/demo/posokanei-basket/api/update-status.php?refresh=1' >/dev/null
```

That Plesk task only works when Plesk can reach `api.posokanei.gov.gr`. While
Plesk is blocked, the installed LaunchAgent on Spiros' Mac runs
`npm run live:refresh` every hour.

Verification:

```bash
curl -L https://agenticspiros.com/demo/posokanei-basket/
curl -L https://agenticspiros.com/demo/posokanei-basket/assets/<asset-file>
curl -L https://agenticspiros.com/demo/posokanei-basket/data/catalog.json
curl -L 'https://agenticspiros.com/demo/posokanei-basket/api/posokanei.php?resource=stats'
curl -L 'https://agenticspiros.com/demo/posokanei-basket/api/update-status.php?refresh=1'
curl -L 'https://agenticspiros.com/demo/posokanei-basket/api/posokanei.php?resource=search&title=%CE%B3%CE%AC%CE%BB%CE%B1&page=1&page_size=2'
```
