#!/usr/bin/env bash
set -euo pipefail

export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

PROJECT_DIR="/home/ubuntu/orbeauto"
DOMAIN="auto.orbeone.com.br"
CERT="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"

cd "$PROJECT_DIR"

mkdir -p "$PROJECT_DIR/ops/logs"

exec 9>/tmp/orbeauto-renew-ssl.lock
if ! flock -n 9; then
  echo "renovação já está rodando"
  exit 0
fi

if [ ! -f "$CERT" ]; then
  echo "erro: certificado não encontrado"
  exit 1
fi

END_DATE=$(sudo openssl x509 -enddate -noout -in "$CERT" | cut -d= -f2)
END_EPOCH=$(date -d "$END_DATE" +%s)
NOW_EPOCH=$(date +%s)
DAYS_LEFT=$(( (END_EPOCH - NOW_EPOCH) / 86400 ))

echo "certificado expira em $DAYS_LEFT dia(s)"

if [ "$DAYS_LEFT" -gt 30 ]; then
  echo "renovação ainda não necessária"
  exit 0
fi

echo "renovação necessária. pausando orberisk_nginx para liberar porta 80..."

docker stop orberisk_nginx >/dev/null

cleanup() {
  docker start orberisk_nginx >/dev/null 2>&1 || true
}
trap cleanup EXIT

sudo certbot renew \
  --cert-name "$DOMAIN" \
  --standalone \
  --preferred-challenges http \
  --quiet

docker start orberisk_nginx >/dev/null
trap - EXIT

bash "$PROJECT_DIR/ops/scripts/sync_auto_ssl.sh"
bash "$PROJECT_DIR/ops/scripts/apply_auto_proxy.sh"

echo "renovação ssl concluída"
