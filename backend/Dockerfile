FROM php:8.4-fpm

WORKDIR /var/www/html

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        git \
        libzip-dev \
        unzip \
        zip \
    && docker-php-ext-install bcmath pdo_mysql zip \
    && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

COPY backend/composer.json backend/composer.lock ./
RUN composer install \
    --no-dev \
    --no-interaction \
    --no-progress \
    --prefer-dist \
    --optimize-autoloader \
    --no-scripts

COPY backend/ ./
COPY docker/backend/entrypoint.sh /usr/local/bin/itrack-entrypoint

RUN chmod +x /usr/local/bin/itrack-entrypoint \
    && mkdir -p storage/framework/cache/data storage/framework/sessions storage/framework/views storage/logs bootstrap/cache \
    && chown -R www-data:www-data storage bootstrap/cache \
    && composer dump-autoload --optimize

ENTRYPOINT ["itrack-entrypoint"]
CMD ["php-fpm"]
