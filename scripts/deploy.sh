#!/usr/bin/env bash
set -e

cd /home/ubuntu/orbeauto

echo "=== github -> orbeauto VPS ==="

if [ -n "$(git status --porcelain)" ]; then
  echo "parei: existem mudanças locais não salvas."
  echo ""
  git status --short
  echo ""
  echo "use up.git \"mensagem\" antes, ou resolva essas mudanças manualmente."
  exit 1
fi

echo ""
echo "=== puxando código ==="
git pull --ff-only origin main

echo ""
echo "=== rebuild/restart ==="
docker compose up -d --build

echo ""
echo "=== containers ==="
docker compose ps

echo ""
echo "ok: vps atualizada."
