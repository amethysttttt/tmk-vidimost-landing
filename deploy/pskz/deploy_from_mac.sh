#!/bin/bash
# Запуск с Mac после того, как на VPS добавлен SSH-ключ.
set -euo pipefail
HOST="${1:-root@185.146.3.124}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SECRETS="${HOME}/.config/tmk-crm"
DBURL_FILE="${SECRETS}/database.url"
ENV_FILE="${SECRETS}/pskz.env"

mkdir -p "$SECRETS"
if [[ ! -f "$DBURL_FILE" ]]; then
  echo "Нет $DBURL_FILE"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  INGEST=$(openssl rand -hex 24)
  CRMPASS=$(openssl rand -base64 18 | tr -d '/+=' | head -c 20)
  DBURL=$(cat "$DBURL_FILE")
  umask 077
  cat > "$ENV_FILE" <<EOF
DATABASE_URL=${DBURL}
CRM_LOGIN=admin
CRM_PASSWORD=${CRMPASS}
CRM_INGEST_SECRET=${INGEST}
CRM_PUBLIC_URL=https://ai.tmk-technohorizon.kz
NOTIFY_EMAIL=kaelggbet@gmail.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=
SMTP_PASS=
EOF
  echo "Created $ENV_FILE (допишите SMTP_USER/SMTP_PASS)"
fi

echo "== bootstrap packages =="
ssh "$HOST" 'export DEBIAN_FRONTEND=noninteractive; apt-get update -y; apt-get install -y python3 python3-venv python3-pip nginx rsync curl ca-certificates'

echo "== sync code =="
ssh "$HOST" 'mkdir -p /var/www/tmk-landing && chown -R root:www-data /var/www/tmk-landing'
rsync -az --delete \
  --exclude '.git' --exclude '.venv' --exclude '.env' --exclude '.env.local' \
  --exclude '__pycache__' --exclude '.vercel' --exclude 'deploy' \
  --exclude 'apps-script' --exclude 'tools/devserver.py' \
  "$ROOT/" "$HOST:/var/www/tmk-landing/"

scp "$ROOT/tools/prodserver.py" "$HOST:/var/www/tmk-landing/tools/prodserver.py"
scp "$ENV_FILE" "$HOST:/var/www/tmk-landing/.env"
scp "$ROOT/deploy/pskz/tmk-landing.service" "$HOST:/etc/systemd/system/tmk-landing.service"
scp "$ROOT/deploy/pskz/nginx-ai.tmk-technohorizon.kz.conf" "$HOST:/etc/nginx/sites-available/ai.tmk-technohorizon.kz"

echo "== venv + service =="
ssh "$HOST" bash -s <<'REMOTE'
set -euo pipefail
cd /var/www/tmk-landing
python3 -m venv .venv
.venv/bin/pip install -U pip
.venv/bin/pip install -r requirements.txt
chown -R www-data:www-data /var/www/tmk-landing
chmod 640 /var/www/tmk-landing/.env
ln -sfn /etc/nginx/sites-available/ai.tmk-technohorizon.kz /etc/nginx/sites-enabled/ai.tmk-technohorizon.kz
nginx -t
systemctl daemon-reload
systemctl enable tmk-landing
systemctl restart tmk-landing
systemctl reload nginx
systemctl --no-pager -l status tmk-landing | head -20
curl -s -o /dev/null -w "local_crm=%{http_code}\n" http://127.0.0.1:8790/crm
REMOTE

echo "OK. DNS: A-запись ai → 185.146.3.124 (сейчас ещё Vercel)."
echo "Пароль CRM и ingest — в $ENV_FILE"
