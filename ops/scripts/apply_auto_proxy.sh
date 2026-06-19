#!/usr/bin/env bash
set -euo pipefail

export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

PROJECT_DIR="/home/ubuntu/orbeauto"
PROXY_FILE="$PROJECT_DIR/ops/proxy/auto-orbeone.conf"

cd "$PROJECT_DIR"

if ! docker ps --format '{{.Names}}' | grep -qx 'orberisk_nginx'; then
  echo "erro: container orberisk_nginx não está rodando"
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -qx 'orbeauto-gateway'; then
  echo "erro: container orbeauto-gateway não está rodando"
  exit 1
fi

docker network connect orbeauto_default orberisk_nginx 2>/dev/null || true

docker cp "$PROXY_FILE" orberisk_nginx:/etc/nginx/conf.d/auto-orbeone.conf

docker exec orberisk_nginx sh -lc 'nginx -t && nginx -s reload'

echo "proxy auto.orbeone.com.br aplicado no orberisk_nginx"
