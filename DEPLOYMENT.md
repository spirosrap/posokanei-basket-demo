# Deployment Notes

Target URL:

```text
https://agenticspiros.com/demo/posokanei-basket/
```

Static artifact:

```text
/Users/spiros/Downloads/posokanei-basket-demo/deploy/posokanei-basket-dist.zip
```

Expected Plesk path, following the existing `agenticspiros.com`/SecurityTech setup:

```text
/var/www/vhosts/securitytech.gr/httpdocs/spiros/demo/posokanei-basket/
```

Safe upload shape after SFTP/SSH access is available:

```bash
ssh <user>@83.169.39.81 'mkdir -p /var/www/vhosts/securitytech.gr/httpdocs/spiros/demo/posokanei-basket'
rsync -av --delete \
  /Users/spiros/Downloads/posokanei-basket-demo/dist/ \
  <user>@83.169.39.81:/var/www/vhosts/securitytech.gr/httpdocs/spiros/demo/posokanei-basket/
```

If using Plesk File Manager instead, upload and extract:

```text
/Users/spiros/Downloads/posokanei-basket-demo/deploy/posokanei-basket-dist.zip
```

into:

```text
httpdocs/spiros/demo/posokanei-basket/
```

The build uses relative assets via `vite.config.js` (`base: "./"`), so no server rewrite is required for the main demo path. The generated `.htaccess` disables PageSpeed and sets `index.html` as the directory index.
