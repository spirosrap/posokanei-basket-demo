# Deployment Notes

Primary target:

```text
https://kalathitimon.com/
```

Compatibility mirror:

```text
https://agenticspiros.com/demo/posokanei-basket/
```

Static artifact:

```text
deploy/posokanei-basket-dist.zip
```

Live status:

```text
Dedicated production domain launched on 2026-07-16 with HTTPS.
The original subpath remains online as a compatibility mirror.
```

Example Plesk primary target path:

```text
/var/www/vhosts/<subscription>/<kalathitimon-document-root>/
```

The primary FTP account should be scoped to the domain document root, so its
remote upload path is:

```text
/
```

Upload shape:

```bash
npm run build
curl --ftp-create-dirs -T dist/index.html \
  ftp://<production-ftp-host>/index.html
curl --ftp-create-dirs -T dist/assets/<asset-file> \
  ftp://<production-ftp-host>/assets/<asset-file>
```

If using Plesk File Manager instead, upload and extract:

```text
deploy/posokanei-basket-dist.zip
```

into the document root of `kalathitimon.com`.

The normal production build uses root assets (`base: "/"`) and targets older
Safari-compatible syntax. `npm run build:legacy` creates the old
`/demo/posokanei-basket/` subpath build when that mirror needs a full app update.
The generated `.htaccess` disables PageSpeed, redirects `www` to the apex domain,
routes `/s/<code>` through the basket opener, and keeps the SPA fallback on
`index.html`. It prefers committed build-time Brotli files, falls back to Gzip,
and preserves identity responses for clients that do not support compression.

Live application support uses these build outputs:

```text
dist/api/posokanei.php
dist/api/update-status.php
dist/api/branches.php
```

The normal hourly refresh uses an isolated staging directory that is not touched
by Vite builds:

```text
.cache/catalog-refresh-output/catalog.json
.cache/catalog-refresh-output/catalog-meta.json
.cache/catalog-refresh-output/refresh-status.json
```

`posokanei.php` is a same-origin proxy for the public PosoKanei catalogue
endpoints. It exists because `https://api.posokanei.gov.gr` currently rejects
browser CORS requests from the production site.

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
`../data/catalog.json` and reports `status: "snapshot"` plus the script-built
snapshot timestamp so the UI can show the actual deployed data freshness.

`branches.php` accepts browser-approved coordinates with a POST request, sets
`Cache-Control: no-store`, and queries OpenStreetMap/Overpass for nearby
`shop=supermarket` locations. It supports the optional proximity UI and is not
part of the PosoKanei product/price refresh path.

`data/catalog.json` is a same-origin catalogue snapshot built by the refresh
script from PosoKanei API responses; it is not AI-generated.
`data/catalog-meta.json` is a smaller script-built metadata file for stats,
retailers, and categories. The PHP API uses both as a fallback when the upstream
PosoKanei API rejects server-side requests, so the frontend does not need to
download the full catalogue on first load.

`data/refresh-status.json` records the latest scheduled refresh result. On
success it stores the new catalogue timestamp; on upstream failure it stores the
failed attempt time and a short error such as `Upstream returned HTTP 403`.
`update-status.php` merges this into the UI status response.

`data/daily-bargain.json` contains the featured daily suggestion plus eight
additional bargains used by `/bargains/`. They are generated in one daily request
on the Mac from public catalogue facts using `gpt-5.6-sol` with `high` reasoning,
then uploaded like the other static data files. Every product ID is validated for
uniqueness and membership in the code-built candidate list. Displayed prices,
retailers, and savings are computed and validated by code; AI only selects the
verified candidates and writes the Greek editorial text.

Scheduled update check:

```bash
npm run check:updates
```

This check exits nonzero for failed refreshes, a catalogue older than three
hours, a stopped scheduler, malformed metadata, or a success receipt newer than
the deployed catalogue. HTTP 200 alone is not success. A fresh scheduled snapshot
is healthy even when the Plesk request-time proxy is blocked. Configure the age
limit with `POSOKANEI_MAX_AGE_SECONDS` (default `10800`). Its local JSON receipt
includes `health.healthy`, reasons, catalogue age, and observation time; connection
failures overwrite the old receipt instead of leaving a previous success behind.

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

Build and deploy the static app and PHP endpoints while preserving the current
production data directory:

```bash
npm run build
npm run live:deploy
```

For a first installation or an intentional complete restore, include the built
data directory explicitly:

```bash
DEPLOY_INCLUDE_DATA=1 npm run live:deploy
```

`live:deploy` parses `.env.local` without sourcing it as shell code and reads the
FTP password from either `FTP_PASS` or the configured macOS Keychain item.
Every file is first uploaded under a unique temporary FTP name and then renamed
over the destination. This keeps the previous complete file available throughout
the transfer and prevents PHP or a browser from reading partially uploaded JSON.
By default, the script excludes `dist/data/` so a UI release cannot replace a newer
live catalogue with an older local build artifact. Use `npm run live:refresh` for
normal catalogue, refresh-status, and daily-bargain publishing.

`live:refresh` writes its complete generation under the isolated
`.cache/catalog-refresh-output/` staging directory, updates the staged
`daily-bargain.json` once per Athens calendar day, publishes the
data files to the primary domain, and verifies the public catalogue and suggestion
timestamps. Optional `FTP_MIRROR_*` and `POSOKANEI_MIRROR_PUBLIC_CATALOG_URL`
settings publish and verify the same files on the old subpath as a best-effort mirror. Configure
targets with environment variables or the ignored `.env.local`, based on
`.env.example`. Use either `FTP_PASS` or `FTP_KEYCHAIN_SERVICE` for primary FTP
authentication; the mirror has matching legacy variables.

Keeping refresh staging outside `dist/` is intentional: `vite build` recreates
`dist/`, while the hourly refresh may still be downloading or publishing a
catalogue. The separate directory prevents either process from deleting or
replacing the other's files. The compression-only recovery command continues to
use an explicitly prepared `dist/data/` generation.

Every successful refresh also creates `.br` and `.gz` companions for the full,
metadata, runtime, bootstrap, full and preview price-change JSON/CSV, and daily-bargain files. Raw
files remain the source of truth and the status file is still published last. To
backfill compression without contacting PosoKanei or changing any catalogue value,
use:

```bash
npm run live:deploy:compression
```

This command first requires the local and public catalogue generation timestamps
to match, uploads only compressed companions, and verifies Brotli and Gzip delivery.
The normal UI deployment also includes precompressed hashed JavaScript/CSS and a
versioned `sw.js`. The worker caches only the HTML app shell after first load; data,
API, and `/s/<code>` requests are deliberately excluded.

The recent-changes UI first reads `data/price-changes-preview.json`, containing the
newest 80 rows plus full summary counts and the retailer directory. Search,
filtering, non-default sorting, and pagination then load the complete
`data/price-changes.json`. The normal hourly refresh publishes and verifies both.
To regenerate and publish only the preview from an already verified local full feed:

```bash
npm run price-changes:preview
npm run live:deploy:preview
npm run live:deploy:preview:mirror
```

To publish only a regenerated compact runtime search catalogue and its compressed
variants without changing prices or any other catalogue artifact, use:

```bash
npm run catalog:runtime
npm run live:deploy:runtime
npm run live:deploy:runtime:mirror
```

Every production build also runs `npm run check:performance`. It requires the
recent-changes UI to remain a lazy route chunk and enforces raw and Brotli budgets
for both that chunk and the main application bundle.

After a headers-only Apache configuration adjustment, publish just `.htaccess`
without re-uploading application or catalogue files:

```bash
npm run live:deploy:config
npm run live:deploy:config:mirror
```

Keep `OPENAI_API_KEY` only in the private environment of the Mac running the
LaunchAgent, or store it in the macOS Keychain service
`posokanei-basket-openai-api-key` under the local macOS account. The key is not
required on Plesk and must never be copied into `public/`, `dist/`, FTP, `.env.local`,
or the repository. Only public product data is sent in
the once-daily model request, with `store: false`; user baskets and locations are
not part of this pipeline.

The installer runs the refresh through an interactive login shell so an existing
key exported by the private local shell setup is available to the scheduled daily
bargain step. It does not write the key into the LaunchAgent plist.

Manual daily suggestion generation:

```bash
npm run bargain:daily
npm run bargain:daily -- --force
```

The first command is date-guarded. The second is intended for an explicit manual
replacement of the current day's suggestion.

The ignored `.cache/daily-bargain-attempt.json` file records that the automatic AI
request was attempted for the current Athens date. This prevents an API failure
from being retried on every hourly catalogue refresh. A deliberate `--force` run
bypasses both the successful-generation and attempt guards.

When the upstream blocks refresh requests, the script exits non-zero but still
uploads `data/refresh-status.json` so production can show the failed refresh
attempt while continuing to serve the last successful catalogue.

When the local/deployment network is blocked but another trusted machine can
reach `api.posokanei.gov.gr`, set `POSOKANEI_REFRESH_HOST=<ssh-host>`. The
script copies the snapshot builder to that host, builds the catalogue there,
pulls back `catalog.json` and `catalog-meta.json`, then uploads them locally.
FTP credentials are not copied to the remote host.

For resilience, set `POSOKANEI_REFRESH_HOSTS=runner-a,runner-b,runner-c` instead
of a single host. The refresh script tries each SSH runner in order and uses the
first one that successfully builds the snapshot. This avoids stale production
data when one trusted runner is asleep, offline, or temporarily blocked.

Each runner now probes `/meta/stats` with the same client as the crawl before
transferring the previous catalogue. Failed runs keep diagnostics for every runner
(public receipts use ordinal numbers) and do not replace catalogue prices or their
timestamp. SSH keepalives bound disconnected sessions. The hourly scheduler retries
normally after access returns; a 403 is not repeatedly retried within a crawl.

Incident diagnosed 2026-09-21: the catalogue had stopped updating on 2026-09-19
at 07:25 UTC. Identical stats and search requests on Dell and HP succeeded over
HTTP/1.1 while stats over HTTP/2 returned 403. The snapshot curl client now explicitly
uses `--http1.1`, with TLS verification unchanged. Other tested internet routes,
including the Mac VPN route, still returned 403 over HTTP/1.1; this was not a
universal PosoKanei outage. Verify the actual API, not just the homepage, and compare
protocols on the same runner before attributing a denial solely to an exit node.

The same incident exposed an independent hosting problem: Imunify360's
informational rule `77138486` logged successful service-worker requests, and the
`plesk-modsecurity` Fail2Ban jail counted those audit events toward its three-event
ban threshold. In Plesk, the domains `kalathitimon.com` and `agenticspiros.com`
exclude only rule `77138486` under Web Application Firewall > Security rule IDs.
The WAF stays On, and Fail2Ban stays enabled. Preserve this domain setting when
migrating hosting. Do not put `SecRuleRemoveById` in `.htaccess`: this host rejects
it there with HTTP 500. Verify recovery using repeated `/sw.js` requests with a
`Service-Worker: script` header, followed by a ban-list check and catalogue search.

The snapshot builder sends a browser-like `User-Agent` by default because the
upstream API can return `HTTP 403` to obvious automation client strings. Override
it with `POSOKANEI_USER_AGENT` only when the upstream rules change.

Install the hourly macOS LaunchAgent refresh:

```bash
npm run live:install-refresh
```

The installer prints the scheduler and log paths for the local machine.

The frontend retries transient HTTP/network failures and allows up to 45 seconds
for the full snapshot fallback. A rejected snapshot request is cleared from the
in-memory cache so a later action can recover in the same browser session.

Plesk scheduled task equivalent:

```bash
curl -fsS 'https://kalathitimon.com/api/update-status.php?refresh=1' >/dev/null
```

That Plesk task only works when Plesk can reach `api.posokanei.gov.gr`. While
Plesk is blocked, run `npm run live:refresh` from a separate environment that can
reach the upstream API.

Verification:

```bash
curl -L https://kalathitimon.com/
curl -L https://kalathitimon.com/assets/<asset-file>
curl -L https://kalathitimon.com/data/catalog.json
curl -L https://kalathitimon.com/data/catalog-meta.json
curl -L https://kalathitimon.com/data/price-changes-preview.json
curl -L https://kalathitimon.com/data/refresh-status.json
curl -L 'https://kalathitimon.com/api/posokanei.php?resource=stats'
curl -L 'https://kalathitimon.com/api/update-status.php?refresh=1'
curl -L 'https://kalathitimon.com/api/posokanei.php?resource=search&title=%CE%B3%CE%AC%CE%BB%CE%B1&page=1&page_size=2'
curl -fsS -X POST 'https://kalathitimon.com/api/branches.php' \
  -H 'Content-Type: application/json' \
  --data '{"lat":37.9838,"lon":23.7275,"radiusKm":2}'
```

The same catalogue timestamps can be checked on the compatibility mirror after a
refresh. Primary publishing is required; a mirror failure is reported but does not
invalidate a successful primary update.

## Partial retailer outages

Since v0.38.2, one completely missing retailer feed can be isolated when it
previously had at least 100 offers, represented no more than 20% of all offers,
and at least two other chains remain. Only that feed is removed from the
comparison baseline; all other category, retailer, offer and product-count
publication guards still apply. Broader failures remain blocked.

Products exclusive to the missing retailer retain their IDs and descriptions
with empty prices, preserving saved baskets without treating stale prices as
current. They cannot enter a shopping plan and sort after priced products.
Metadata records the unavailable retailer, its last available timestamp and the
number of retained unpriced products. The app displays the outage even after a
successful refresh; check:updates reports retailer_unavailable until recovery.
A returning feed must recover at least 80% of its previous offer count before the
warning clears. A partial reappearance below that threshold remains guarded.

The September 28 incident was a missing Lidl feed on independent runners, not a
connection failure. Do not bypass coverage guards or change network settings to
resolve this condition. The existing hourly refresh handles isolation and recovery.
