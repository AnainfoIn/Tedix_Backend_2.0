# Tedix Backend 2.0

Node.js rewrite of the Tedix Rails backend, migrated module by module (see [docs/MIGRATION_PLAN.md](docs/MIGRATION_PLAN.md)).

- `apps/api`: NestJS + Prisma API. Shares the Postgres database with the Rails app during the migration.
- `apps/admin`: React admin panel (react-admin), served by the API at `/admin`.

## Run locally

```bash
nvm use                       # Node 22
npm install
cp apps/api/.env.example apps/api/.env   # set DATABASE_URL to a copy of the Tedix database
npm run dev:api               # API on http://localhost:4000
npm run dev:admin             # admin panel on http://localhost:5173/admin/
```

Create or reset an admin user (works for Rails ActiveAdmin too):

```bash
npm run admin:create -- you@example.com 'Password1'
```

Existing ActiveAdmin users can sign in with their current password and 2FA codes.

## Run everything with Docker (database included)

The repo includes a Postgres 16 database and the API in `docker-compose.yml`.

```bash
cp .env.example .env          # set DB_PASSWORD, DB_PORT, API_PORT, ADMIN_JWT_SECRET, ADMIN_EMAIL/ADMIN_PASSWORD
docker compose up -d --build
```

- Database: `localhost:<DB_PORT>` (default 5432), user/password/name from `.env`. Connect with psql, DBeaver, TablePlus...
- Admin panel: `http://localhost:<API_PORT>/admin/` (default 4000), sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
- A fresh database gets the admin tables and the Admin/Teacher/Student roles from `db/init/` (runs only the first time; `docker compose down -v` wipes the data).
- The database port only listens on this machine by default. Set `DB_BIND=0.0.0.0` to open it to other machines, with a strong password and a firewall.

To load the real Rails data into this database (deletes the local data first):

```bash
SOURCE_DATABASE_URL=postgresql://user:pass@host:5432/tedix_backend ./scripts/clone-rails-db.sh
```

Docker needs a VPS or your own machine. Hostinger shared/cloud web hosting cannot run Docker or Postgres; there the app runs as a Node.js site with an external `DATABASE_URL`.

## Build and run in production

```bash
npm install
npm run build     # Prisma client, API, admin panel
npm start         # node apps/api/dist/main.js, serves /admin and /admin/api
```

Environment variables are listed in `apps/api/.env.example`. `DATABASE_URL` and `ADMIN_JWT_SECRET` are required.

### Contents (Countries to Lessons)

The admin's Contents section uses the Rails tables (`account_block_countries`, `categories`, `sub_categories`,
`bx_block_profile_courses`, `_mains`, `_units`, `_lessons`) and Active Storage for icons and materials.

- A database without the Rails data can get empty tables with `psql "$DATABASE_URL" -f db/content-schema.sql`
  (it only creates what is missing). Until then the Contents pages answer "not ready".
- Files go to the same S3 bucket as Rails. Set `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_ACCESS_KEY`, `STORAGE_BUCKET`,
  `STORAGE_ENDPOINT` and `STORAGE_REGION` (the Rails app's values). Without them, pages work but files can't be
  shown or uploaded.

## Tests

```bash
npm test                                         # unit tests
TEST_DATABASE_URL=postgresql://... npm run test:e2e   # API tests on a throwaway Postgres database (tables are recreated)
```

## Safety rules while Rails is live

- Never run `prisma migrate` or `prisma db push` against the shared database. Rails owns the schema until cutover.
- Add Prisma models only for tables of approved modules.
- Keep app API responses identical to Rails so the mobile app needs no changes.
