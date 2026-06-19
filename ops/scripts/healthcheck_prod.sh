#!/usr/bin/env bash
set -euo pipefail

export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

DOMAIN="${1:-auto.orbeone.com.br}"

echo "checando containers..."
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep -E 'orbeauto|orberisk_nginx' || true

echo
echo "checando https landing..."
curl -fsSI "https://$DOMAIN/" | head -n 1

echo
echo "checando https app..."
curl -fsSI "https://$DOMAIN/app/" | head -n 1

echo
echo "checando api..."
curl -fsS "https://$DOMAIN/api/health"
echo

echo
echo "checando redirect http -> https..."
curl -sI "http://$DOMAIN/app/" | grep -iE 'HTTP/|location:' || true

echo
echo "checando portas locais..."
sudo ss -ltnp | grep -E ':80|:443|:8080|:8001|:5174' || true

echo
echo "healthcheck concluído"
