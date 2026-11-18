#!/bin/bash
# Copies a whole Postgres database (schema + data) from OLD to NEW, then compares row counts.
#
#   OLD_DATABASE_URL=postgresql://user:pass@old-host:5432/tedix_backend \
#   NEW_DATABASE_URL=postgresql://user:pass@new-host:5432/tedix \
#   ./scripts/migrate-db.sh
#
# Run it on a machine that can reach BOTH databases (for example the server that hosts the
# old database, after the new database's firewall allows that server's IP).
# Uses the postgres:16 Docker image, so only Docker is needed. If the old database runs in a
# Docker network, set DOCKER_NETWORK to that network name and use the container name as host.
#
# WARNING: objects in NEW that also exist in OLD are dropped and recreated (--clean).
set -euo pipefail
: "${OLD_DATABASE_URL:?Set OLD_DATABASE_URL}"
: "${NEW_DATABASE_URL:?Set NEW_DATABASE_URL}"
NETWORK="${DOCKER_NETWORK:-host}"
DUMP_DIR="$(mktemp -d)"
pg() { docker run --rm -i --network "$NETWORK" -v "$DUMP_DIR:/dump" postgres:16 "$@"; }

if [ "${CONFIRM:-}" != "yes" ]; then
  read -r -p "This overwrites matching tables in the NEW database. Continue? [y/N] " answer
  [ "$answer" = "y" ] || [ "$answer" = "Y" ] || { echo "Cancelled."; exit 1; }
fi

echo "1/3 Dumping the old database..."
pg pg_dump --format=custom --no-owner --no-privileges --file=/dump/tedix.dump "$OLD_DATABASE_URL"
ls -lh "$DUMP_DIR/tedix.dump"

echo "2/3 Restoring into the new database..."
pg pg_restore --no-owner --no-privileges --clean --if-exists --jobs=4 \
  --dbname="$NEW_DATABASE_URL" /dump/tedix.dump || echo "pg_restore reported warnings (usually harmless on a first restore); check the counts below."

echo "3/3 Comparing row counts (exact count per table)..."
COUNT_SQL="SELECT string_agg(format('SELECT %L AS t, COUNT(*) AS n FROM %I.%I', tablename, schemaname, tablename), ' UNION ALL ') FROM pg_tables WHERE schemaname = 'public'"
counts() { local q; q=$(pg psql -At "$1" -c "$COUNT_SQL"); pg psql -At -F' ' "$1" -c "$q ORDER BY 1"; }
counts "$OLD_DATABASE_URL" > "$DUMP_DIR/old.txt"
counts "$NEW_DATABASE_URL" > "$DUMP_DIR/new.txt"
if diff -u "$DUMP_DIR/old.txt" "$DUMP_DIR/new.txt" > "$DUMP_DIR/diff.txt"; then
  echo "All $(wc -l < "$DUMP_DIR/old.txt") tables match. Examples:"
  grep -E '^(accounts|admin_users|roles|bx_block_profile_lessons) ' "$DUMP_DIR/new.txt" || true
else
  echo "Row counts differ:"; cat "$DUMP_DIR/diff.txt"; exit 1
fi
echo "Done. The dump is kept at $DUMP_DIR/tedix.dump"
