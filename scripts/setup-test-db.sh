#!/usr/bin/env bash
# Provisions a dedicated test database so `pnpm test` doesn't truncate the dev DB.
#
# Reads DATABASE_URL from .env. Derives a test database name by appending "_test"
# to the dev DB's path component. Creates the DB if missing and applies migrations.
# Prints the resulting TEST_DATABASE_URL on success — add it to .env if not present.
set -euo pipefail

# Load .env without exporting unrelated vars.
if [ -f .env ]; then
  set -a; . ./.env; set +a
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set. Aborting." >&2
  exit 1
fi

# Strip query string to get the bare connection URL.
base_url="${DATABASE_URL%%\?*}"
query="${DATABASE_URL#"$base_url"}"
dev_db="${base_url##*/}"
prefix="${base_url%/*}"
test_db="${dev_db}_test"
test_url="${prefix}/${test_db}${query}"

echo "Dev DB:  $dev_db"
echo "Test DB: $test_db"

# Find a way to run psql: prefer local binary, fall back to running it inside
# the postgres docker container if present.
if command -v psql >/dev/null 2>&1; then
  psql_cmd() { psql "$@"; }
else
  pg_container=$(docker ps --filter "ancestor=postgres:17-alpine" --format '{{.ID}}' | head -n1)
  if [ -z "$pg_container" ]; then
    echo "Neither local psql nor a running postgres docker container found." >&2
    exit 1
  fi
  echo "Using psql inside container $pg_container"
  psql_cmd() {
    local url="$1"; shift
    docker exec -i "$pg_container" psql "$url" "$@"
  }
fi

# Create the test DB if missing (connect to maintenance db "postgres").
admin_url="${prefix}/postgres"
existing=$(psql_cmd "$admin_url" -tA -c "SELECT 1 FROM pg_database WHERE datname='${test_db}'" 2>/dev/null || true)
existing=$(echo "$existing" | tr -d '[:space:]')
if [ "$existing" = "1" ]; then
  echo "  · test DB already exists"
else
  psql_cmd "$admin_url" -c "CREATE DATABASE \"${test_db}\""
  echo "  + created test DB"
fi

# Apply migrations.
DATABASE_URL="$test_url" npx prisma migrate deploy

echo ""
echo "Done. Add this to your .env:"
echo "TEST_DATABASE_URL=${test_url}"
