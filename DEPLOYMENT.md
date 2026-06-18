# Deployment Notes

Target URL:

```text
https://agenticspiros.com/demo/posokanei-basket/
```

Static artifact:

```text
/Users/spiros/Downloads/posokanei-basket-demo/deploy/posokanei-basket-dist.zip
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
/Users/spiros/Downloads/posokanei-basket-demo/deploy/posokanei-basket-dist.zip
```

into:

```text
httpdocs/spiros/demo/posokanei-basket/
```

The build uses relative assets via `vite.config.js` (`base: "./"`). The generated
`.htaccess` disables PageSpeed and sets `index.html` as the directory index.

Live catalog mode also deploys:

```text
dist/api/posokanei.php
```

That PHP file is a same-origin proxy for the public PosoKanei catalog endpoints.
It exists because `https://api.posokanei.gov.gr` currently rejects browser CORS
requests from `agenticspiros.com`, while server-side requests from Plesk work.

Verification:

```bash
curl -L https://agenticspiros.com/demo/posokanei-basket/
curl -L https://agenticspiros.com/demo/posokanei-basket/assets/<asset-file>
curl -L 'https://agenticspiros.com/demo/posokanei-basket/api/posokanei.php?resource=stats'
curl -L 'https://agenticspiros.com/demo/posokanei-basket/api/posokanei.php?resource=search&title=%CE%B3%CE%AC%CE%BB%CE%B1&page=1&page_size=2'
```
