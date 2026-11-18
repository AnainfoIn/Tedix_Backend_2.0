#!/bin/bash
# Copies the Rails database (schema + data) into the local Docker database.
# WARNING: this deletes everything in the local database first.
#
#   SOURCE_DATABASE_URL=postgresql://user:pass@host:5432/tedix_backend ./scripts/clone-rails-db.sh
#   (or put SOURCE_DATABASE_URL in .env)
#
# Runs pg_dump inside the db container, so nothing needs to be installed locally.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -f .env ]; then set -a; . ./.env; set +a; fi
: "${SOURCE_DATABASE_URL:?Set SOURCE_DATABASE_URL (in .env or the environment)}"
DB_USER="${DB_USER:-tedix}"
DB_NAME="${DB_NAME:-tedix_development}"

if [ "${CONFIRM:-}" != "yes" ]; then
  read -r -p "This replaces all data in local database '$DB_NAME'. Continue? [y/N] " answer
  [ "$answer" = "y" ] || [ "$answer" = "Y" ] || { echo "Cancelled."; exit 1; }
fi

docker compose up -d db
docker compose exec -T db psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d postgres \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();" \
  -c "DROP DATABASE IF EXISTS \"$DB_NAME\";" \
  -c "CREATE DATABASE \"$DB_NAME\";"
echo "Copying... (this can take a while)"
docker compose exec -T -e SOURCE_DATABASE_URL="$SOURCE_DATABASE_URL" db bash -c \
  'pg_dump --no-owner --no-privileges "$SOURCE_DATABASE_URL" | psql -q -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
echo "Done. Restarting the API."
docker compose restart api || true
