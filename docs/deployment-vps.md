# iTrack VPS Deployment

This setup runs iTrack on one VPS with Docker Compose:

- Nginx serves the React build and forwards Laravel routes to PHP-FPM.
- Laravel runs in a PHP 8.4-FPM container.
- Queue and scheduler use the same backend image.
- MySQL 8.4 runs on a private Docker network with a named persistent volume.

This repository's default Compose stack assumes Apache is already the public
web server. Apache keeps ports 80/443, and the Docker Nginx container listens
only on `127.0.0.1:8080`.

## 1. VPS prerequisites

Install Docker Engine and the Docker Compose plugin on the VPS. Point your domain, for example `itrack.yourdomain.com`, to the VPS public IP.

## 2. Clone and configure

```bash
git clone https://github.com/iamrgalisanao/itrack.git
cd itrack
cp .env.production.example .env
nano .env
```

Set these before first boot:

- `APP_URL`
- `APP_KEY`
- `DB_PASSWORD`
- `DB_ROOT_PASSWORD`
- `SANCTUM_STATEFUL_DOMAINS`
- `CORS_ALLOWED_ORIGINS`

Generate an app key value with:

```bash
printf 'base64:%s\n' "$(openssl rand -base64 32)"
```

Paste the printed value into `APP_KEY`.

## 3. Build and start

Default Apache-fronted deployment:

```bash
docker compose build
docker compose up -d
docker compose exec backend php artisan migrate --force
docker compose exec backend php artisan storage:link
docker compose exec backend php artisan optimize
```

If this is a fresh installation and you want the seeded sample/persona data:

```bash
docker compose exec backend php artisan db:seed --force
```

## 4. Verify

```bash
docker compose ps
curl -I http://localhost/up
docker compose logs --tail=100 backend
```

The app should respond at:

```text
http://itrack.yourdomain.com/
http://itrack.yourdomain.com/api/
http://itrack.yourdomain.com/up
```

## 5. HTTPS

The default Compose stack publishes HTTP only on `127.0.0.1:8080`, intended
for Apache to proxy over HTTPS. For production, put HTTPS in front of it before
real users log in.

Recommended options:

- Use Cloudflare proxy with "Full" or "Full strict" TLS.
- Or install Certbot/Nginx on the host and reverse proxy HTTPS traffic to `127.0.0.1:8080`.
- Or extend the included Nginx container with mounted Let's Encrypt certificates and a `443` server block.

### Apache-fronted VPS

If Apache is already configured on the VPS, enable the proxy modules:

```bash
sudo a2enmod proxy proxy_http headers ssl rewrite
sudo systemctl reload apache2
```

Use a virtual host like this, replacing the domain and certificate paths:

```apache
<VirtualHost *:80>
    ServerName itrack.yourdomain.com
    Redirect permanent / https://itrack.yourdomain.com/
</VirtualHost>

<VirtualHost *:443>
    ServerName itrack.yourdomain.com

    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/itrack.yourdomain.com/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/itrack.yourdomain.com/privkey.pem

    ProxyPreserveHost On
    RequestHeader set X-Forwarded-Proto "https"
    RequestHeader set X-Forwarded-Port "443"

    ProxyPass / http://127.0.0.1:8080/
    ProxyPassReverse / http://127.0.0.1:8080/

    ErrorLog ${APACHE_LOG_DIR}/itrack-error.log
    CustomLog ${APACHE_LOG_DIR}/itrack-access.log combined
</VirtualHost>
```

Then run the stack with:

```bash
docker compose up -d
```

Keep `SESSION_SECURE_COOKIE=true` once the browser-facing URL is HTTPS.

## 6. Updates

For Apache-fronted deployment:

```bash
git pull
docker compose build
docker compose up -d
docker compose exec backend php artisan migrate --force
docker compose exec backend php artisan optimize
docker compose exec queue php artisan queue:restart
```


## 7. Database backups

Create a compressed local backup:

```bash
sh scripts/backup-mysql.sh
```

Copy backups off the VPS using your preferred provider or tool, such as `scp`, `rclone`, S3-compatible storage, or Hostinger backups. Do not rely only on the Docker volume.

Example daily cron:

```cron
15 2 * * * cd /path/to/itrack && /bin/sh scripts/backup-mysql.sh >> /var/log/itrack-backup.log 2>&1
```

## 8. Important production notes

- Do not publish MySQL port `3306`.
- Keep `.env` out of git.
- Use long random database passwords.
- Run `php artisan migrate --force` only after taking a backup on existing production data.
- Watch disk space because uploads, logs, Docker images, and MySQL data all live on the VPS.
