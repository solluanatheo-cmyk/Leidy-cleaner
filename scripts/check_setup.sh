#!/usr/bin/env bash
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Verificando presença de .env no projeto..."
if [ -f "$ROOT_DIR/.env" ]; then
  echo " .env encontrado"
else
  echo " .env NÃO encontrado — crie um a partir de .env.example"
  ls -la "$ROOT_DIR/.env.example" >/dev/null 2>&1 && echo " Use: cp .env.example .env && ajuste valores"
fi

check_port() {
  local host=$1
  local port=$2
  if command -v nc >/dev/null 2>&1; then
    nc -z "$host" "$port" >/dev/null 2>&1 && return 0 || return 1
  elif command -v ss >/dev/null 2>&1; then
    ss -tnl | grep -q ":$port" && return 0 || return 1
  else
    echo "  (não foi possível testar porta: nem 'nc' nem 'ss' disponíveis)"
    return 2
  fi
}

echo "Checando PostgreSQL em localhost:5432..."
if check_port 127.0.0.1 5432; then
  echo " Postgres parece estar escutando em 5432"
else
  echo " Postgres NÃO alcançável em 127.0.0.1:5432 — verifique se o banco está ativo ou ajuste DATABASE_URL"
fi

echo "Checando Redis em localhost:6379..."
if check_port 127.0.0.1 6379; then
  echo " Redis parece estar escutando em 6379"
else
  echo " Redis NÃO alcançável em 127.0.0.1:6379 — ajuste REDIS_URL se não usar"
fi

echo "Verifique também se o diretório backend/logs existe. Se não, será criado ao iniciar o backend."

echo "Pronto."
