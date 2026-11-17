#!/usr/bin/env bash
set -e

# ==============================================================================
# MLForge VPS Setup & Deployment Helper
# Configures Nginx reverse proxy, SSL (Certbot), and production Docker containers
# for mlforge.adityajagtap.com and mlforge-api.adityajagtap.com
# ==============================================================================

EMAIL="${1:-admin@adityajagtap.com}"
DOMAIN_WEB="mlforge.adityajagtap.com"
DOMAIN_API="mlforge-api.adityajagtap.com"

echo "=== 1. Checking prerequisites ==="
if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    apt-get install -y docker-compose-plugin
fi

if ! command -v nginx &> /dev/null; then
    echo "Installing Nginx..."
    apt-get update && apt-get install -y nginx
fi

if ! command -v certbot &> /dev/null; then
    echo "Installing Certbot..."
    apt-get update && apt-get install -y certbot python3-certbot-nginx
fi

echo "=== 2. Setting up Nginx Virtual Hosts ==="
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

cp "$SCRIPT_DIR/nginx/mlforge.conf" /etc/nginx/sites-available/
ln -sf /etc/nginx/sites-available/mlforge.conf /etc/nginx/sites-enabled/

echo "Testing Nginx configuration..."
nginx -t
systemctl reload nginx

echo "=== 3. Obtaining SSL Certificates with Certbot ==="
echo "Note: DNS for $DOMAIN_WEB and $DOMAIN_API must already point to this VPS IP."
certbot --nginx \
    -d "$DOMAIN_WEB" \
    -d "$DOMAIN_API" \
    --non-interactive \
    --agree-tos \
    -m "$EMAIL" \
    --redirect || {
        echo "WARNING: Certbot SSL setup failed. Please check that DNS records are active and point to this server."
    }

echo "=== 4. Checking Environment Configuration ==="
cd "$REPO_DIR"
if [ ! -f .env.prod ]; then
    echo "Creating .env.prod from template..."
    cp .env.prod.example .env.prod
    API_KEY=$(openssl rand -hex 32 2>/dev/null || date +%s | sha256sum | head -c 64)
    sed -i "s/changeme-generate-a-strong-random-api-key/$API_KEY/" .env.prod
    echo ".env.prod created with generated MLFORGE_API_KEY=$API_KEY"
fi

echo "=== 5. Starting MLForge Production Containers ==="
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

echo "=== 6. Status Check ==="
docker compose -f docker-compose.prod.yml ps
echo "Verification:"
echo "API Health: curl -s http://127.0.0.1:8050/api/v1/health"
echo "Web URL: https://$DOMAIN_WEB"
echo "API URL: https://$DOMAIN_API"
