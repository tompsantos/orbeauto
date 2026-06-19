#!/usr/bin/env bash
set -euo pipefail

export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

PROJECT_DIR="/home/ubuntu/orbeauto"
STAMP=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_DIR="$PROJECT_DIR/backups/$STAMP"

cd "$PROJECT_DIR"

mkdir -p "$BACKUP_DIR"

echo "gerando dump do postgres..."
docker exec orbeauto-db pg_dump -U orbeauto orbeauto > "$BACKUP_DIR/orbeauto-db.sql"

echo "compactando uploads..."
tar -czf "$BACKUP_DIR/uploads.tar.gz" uploads

echo "salvando configs principais..."
cp docker-compose.yml "$BACKUP_DIR/docker-compose.yml"
cp .env "$BACKUP_DIR/.env"
cp -r nginx "$BACKUP_DIR/nginx"
cp -r ops/proxy "$BACKUP_DIR/proxy"

echo "backup criado em $BACKUP_DIR"
