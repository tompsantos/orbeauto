#!/usr/bin/env bash
set -euo pipefail

export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

PROJECT_DIR="/home/ubuntu/orbeauto"
DOMAIN="auto.orbeone.com.br"
SRC="/etc/letsencrypt/live/$DOMAIN"
DST="$PROJECT_DIR/nginx/certs/$DOMAIN"

cd "$PROJECT_DIR"

if [ ! -f "$SRC/fullchain.pem" ] || [ ! -f "$SRC/privkey.pem" ]; then
  echo "erro: certificado não encontrado em $SRC"
  exit 1
fi

mkdir -p "$DST"

sudo cp -L "$SRC/fullchain.pem" "$DST/fullchain.pem"
sudo cp -L "$SRC/privkey.pem" "$DST/privkey.pem"

sudo chown -R ubuntu:ubuntu "$PROJECT_DIR/nginx/certs"
chmod 644 "$DST/fullchain.pem"
chmod 600 "$DST/privkey.pem"

docker compose up -d orbeauto-ssl
docker restart orbeauto-ssl >/dev/null

echo "certificado ssl sincronizado e orbeauto-ssl reiniciado"
