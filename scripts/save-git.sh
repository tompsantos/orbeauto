#!/usr/bin/env bash
set -e

cd /home/ubuntu/orbeauto

MSG="${*:-atualiza orbeauto}"

echo "=== orbeauto -> github ==="
echo "mensagem: $MSG"
echo ""

echo "=== status atual ==="
git status --short

echo ""
echo "=== checagem rápida anti-vazamento ==="
if git add -n . | grep -Ei "\.env$|docker-compose\.yml$|backups/|uploads/|dist/|\.xml$|\.pdf$|\.xlsx$|\.rar$|\.zip$|\.pfx$|\.p12$|\.pem$|secret|senha|password|stable|bkp|quebrado"; then
  echo ""
  echo "parei: apareceu arquivo sensível/sujo no commit."
  exit 1
fi

echo "ok: nada perigoso apareceu no dry-run"
echo ""

git add .

if git diff --cached --quiet; then
  echo "nada novo para commitar."
  exit 0
fi

echo "=== commit ==="
git commit -m "$MSG"

echo ""
echo "=== push ==="
git push

echo ""
echo "ok: github atualizado."
