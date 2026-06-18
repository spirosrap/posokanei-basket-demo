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

The build uses relative assets via `vite.config.js` (`base: "./"`), so no
server rewrite is required for the main demo path. The generated `.htaccess`
disables PageSpeed and sets `index.html` as the directory index.

Verification:

```bash
curl -L https://agenticspiros.com/demo/posokanei-basket/
curl -L https://agenticspiros.com/demo/posokanei-basket/assets/<asset-file>
```
