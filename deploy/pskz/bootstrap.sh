#!/bin/bash
# Первый вход по VNC/SSH: открыть SSH-ключ деплоя и базовые пакеты.
set -euo pipefail
PUBKEY="${1:-}"
if [[ -z "$PUBKEY" ]]; then
  echo "Usage: bash bootstrap.sh 'ssh-ed25519 AAAA... comment'"
  exit 1
fi
mkdir -p /root/.ssh
chmod 700 /root/.ssh
touch /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys
grep -qxF "$PUBKEY" /root/.ssh/authorized_keys || echo "$PUBKEY" >> /root/.ssh/authorized_keys
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y python3 python3-venv python3-pip nginx rsync curl ca-certificates
echo "OK: key installed, packages ready"
