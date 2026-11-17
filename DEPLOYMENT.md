# MLForge VPS Deployment Guide

This guide documents the deployment of **MLForge** to your Hostinger VPS (`187.127.108.141`) behind dedicated subdomains with automatic HTTPS (Let's Encrypt) and GitHub Actions CI/CD.

## Target Domains & Architecture

| Component | Target URL | Loopback Port | Technology |
| :--- | :--- | :--- | :--- |
| **Frontend UI** | `https://mlforge.adityajagtap.com` | `127.0.0.1:8051` | React 18, Vite, Tailwind CSS, Nginx container |
| **Backend API** | `https://mlforge-api.adityajagtap.com` | `127.0.0.1:8050` | FastAPI, Python 3.12, Uvicorn, SQLite/MLflow |

*(Note: Nginx also accepts `mlforgeapi.adityajagtap.com` if configured in DNS).*

```
                       Public Internet (HTTPS 443 / HTTP 80)
                                       │
                                       ▼
                       Host VPS Nginx Reverse Proxy
                     (SSL Terminated via Let's Encrypt)
                      ┌────────────────┴────────────────┐
                      │                                 │
     Proxy to 127.0.0.1:8051           Proxy to 127.0.0.1:8050
                      │                                 │
                      ▼                                 ▼
         [mlforge-frontend container]       [mlforge-backend container]
                 (Nginx)                       (FastAPI / Uvicorn)
                                                        │
                                                        ▼
                                              Persistent Docker Volume
                                              (/data/mlforge.db, etc.)
```

---

## Step 1: DNS Records (Hostinger DNS Zone Editor)

In your Hostinger hPanel (**Domains** -> **adityajagtap.com** -> **DNS / Nameservers** -> **DNS Records**):

| Type | Name | Value | TTL |
| :--- | :--- | :--- | :--- |
| **A** | `mlforge` | `187.127.108.141` | 300 |
| **A** | `mlforge-api` | `187.127.108.141` | 300 |

Verify:
```bash
nslookup mlforge.adityajagtap.com
nslookup mlforge-api.adityajagtap.com
```

---

## Step 2: Dedicated Deploy Key

The dedicated ED25519 deploy key is generated at:
* **Private Key:** `./mlforge-deploy` *(untracked, protected by `.gitignore`)*
* **Public Key:** `./mlforge-deploy.pub`

Public key:
```text
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEqLloz4dkfbM0a2rT7QRgudtjyOEOhbpG4sXmLiF+ST mlforge-deploy
```

Verify connection:
```bash
ssh -i ./mlforge-deploy root@187.127.108.141 "whoami"
```

---

## Step 3: Server Inspection

Checked and verified on `187.127.108.141`:
* System Nginx is running on ports `80` and `443`.
* Ports `127.0.0.1:8050` and `127.0.0.1:8051` are available.
* Docker and Certbot are installed and operational.

---

## Step 4: Clone Repository on VPS

On the VPS:
```bash
cd /root
git clone https://github.com/AdityaJagtap18/MLForge.git mlforge
cd mlforge
```

---

## Step 5: Configure Production Environment (`.env.prod`)

Create `.env.prod`:
```bash
cp .env.prod.example .env.prod
nano .env.prod
```

Configure:
```ini
MLFORGE_ENV=production
MLFORGE_API_KEY=<strong_generated_secret_key>
MLFORGE_CORS_ORIGINS=https://mlforge.adityajagtap.com
HOST_PORT_API=8050
HOST_PORT_WEB=8051
```

Generate a random API key:
```bash
openssl rand -hex 32
```

---

## Step 6: Configure Nginx & SSL

Copy the virtual host configuration:
```bash
cp deploy/nginx/mlforge.conf /etc/nginx/sites-available/
ln -sf /etc/nginx/sites-available/mlforge.conf /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

Obtain SSL certificate with Certbot:
```bash
certbot --nginx \
  -d mlforge.adityajagtap.com \
  -d mlforge-api.adityajagtap.com \
  --non-interactive \
  --agree-tos \
  -m admin@adityajagtap.com \
  --redirect
```

*(Or simply run `chmod +x deploy/setup-vps.sh && ./deploy/setup-vps.sh`)*

---

## Step 7: Launch Production Containers

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

Verify status:
```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f
```

---

## Step 8: Verification

```bash
curl -s https://mlforge-api.adityajagtap.com/api/v1/health
# Expected: {"status":"ok","database":"ok","model_catalog":"ok"}
```

Visit `https://mlforge.adityajagtap.com` in your browser.

---

## Step 9: Configure GitHub Secrets for CI/CD

In your GitHub repository (**Settings** -> **Secrets and variables** -> **Actions**):

| Secret Name | Value |
| :--- | :--- |
| `VPS_HOST` | `187.127.108.141` |
| `VPS_USER` | `root` |
| `VPS_SSH_KEY` | Contents of `mlforge-deploy` (private key) |
| `VPS_PORT` | `22` |
| `VPS_DEPLOY_PATH` | `/root/mlforge` |

Every push to `main` will now run tests, build container images, push to GHCR, and restart the production containers automatically!
