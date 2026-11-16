#!/bin/bash
# Обновление кода на VPS без захода на сервер.
# Не трогает .env и не ставит пакеты (для CI / повседневного деплоя).
#
# Использование:
#   ./deploy/pskz/deploy_code.sh
#   DEPLOY_HOST=root@185.146.3.124 ./deploy/pskz/deploy_code.sh
set -euo pipefail

HOST="${DEPLOY_HOST:-root@185.146.3.124}"
REMOTE_DIR="${DEPLOY_PATH:-/var/www/tmk-landing}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

echo "== sync $ROOT → $HOST:$REMOTE_DIR =="
ssh -o StrictHostKeyChecking=accept-new "$HOST" "mkdir -p '$REMOTE_DIR'"

rsync -az --delete \
  --exclude '.git' \
  --exclude '.venv' \
  --exclude '.env' \
  --exclude '.env.local' \
  --exclude '__pycache__' \
  --exclude '.vercel' \
  --exclude 'deploy' \
  --exclude 'apps-script' \
  --exclude 'tools/devserver.py' \
  --exclude '.github' \
  --exclude '*.pyc' \
  --exclude '.DS_Store' \
  "$ROOT/" "$HOST:$REMOTE_DIR/"

# prodserver нужен сервису (исключён выше вместе с tools/devserver — копируем явно)
scp -o StrictHostKeyChecking=accept-new \
  "$ROOT/tools/prodserver.py" \
  "$HOST:$REMOTE_DIR/tools/prodserver.py"

if [[ -f "$ROOT/deploy/pskz/nginx-ai.tmk-technohorizon.kz.conf" ]]; then
  scp -o StrictHostKeyChecking=accept-new \
    "$ROOT/deploy/pskz/nginx-ai.tmk-technohorizon.kz.conf" \
    "$HOST:/etc/nginx/sites-available/ai.tmk-technohorizon.kz" || true
fi

if [[ -f "$ROOT/deploy/pskz/tmk-landing.service" ]]; then
  scp -o StrictHostKeyChecking=accept-new \
    "$ROOT/deploy/pskz/tmk-landing.service" \
    "$HOST:/etc/systemd/system/tmk-landing.service" || true
fi

echo "== remote install + restart =="
ssh -o StrictHostKeyChecking=accept-new "$HOST" bash -s <<REMOTE
set -euo pipefail
cd '$REMOTE_DIR'
if [[ ! -d .venv ]]; then
  python3 -m venv .venv
fi
.venv/bin/pip install -q -U pip
.venv/bin/pip install -q -r requirements.txt
chown -R www-data:www-data '$REMOTE_DIR'
if [[ -f .env ]]; then
  chmod 640 .env
  chown root:www-data .env || true
fi
ln -sfn /etc/nginx/sites-available/ai.tmk-technohorizon.kz /etc/nginx/sites-enabled/ai.tmk-technohorizon.kz 2>/dev/null || true
nginx -t
systemctl daemon-reload
systemctl enable tmk-landing >/dev/null
systemctl restart tmk-landing
systemctl reload nginx
systemctl --no-pager -l is-active tmk-landing
curl -s -o /dev/null -w "local_ok=%{http_code}\n" http://127.0.0.1:8790/ || true
REMOTE

echo "OK: deployed to $HOST:$REMOTE_DIR"
