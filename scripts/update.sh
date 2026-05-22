#!/bin/bash
# Atualizar o projeto sem downtime
set -e

cd /opt/saint-germain

echo "▶ Puxando atualizações..."
git pull origin main

echo "▶ Rebuilding containers alterados..."
docker-compose build --no-cache backend

echo "▶ Reiniciando serviços..."
docker-compose up -d --no-deps backend

echo "✅ Atualizado! Status:"
docker-compose ps
