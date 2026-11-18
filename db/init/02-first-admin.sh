#!/bin/bash
# Creates the first admin user from ADMIN_EMAIL / ADMIN_PASSWORD (only on first start).
# The password is stored as a bcrypt hash (pgcrypto), the same format Devise uses.
set -euo pipefail
if [ -z "${ADMIN_EMAIL:-}" ] || [ -z "${ADMIN_PASSWORD:-}" ]; then
  echo "ADMIN_EMAIL / ADMIN_PASSWORD not set: no admin user created."
  exit 0
fi
email="$(echo "$ADMIN_EMAIL" | tr '[:upper:]' '[:lower:]' | xargs)"
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v email="$email" -v password="$ADMIN_PASSWORD" <<'SQL'
INSERT INTO admin_users (email, encrypted_password, role_id, created_at, updated_at)
SELECT :'email', crypt(:'password', gen_salt('bf', 12)), id, now(), now()
FROM roles WHERE name = 'Admin'
ON CONFLICT (email) DO NOTHING;
SQL
echo "Admin user ready: $email"
