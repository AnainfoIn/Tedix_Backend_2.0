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

## Build and run in production

```bash
npm install
npm run build     # Prisma client, API, admin panel
npm start         # node apps/api/dist/main.js, serves /admin and /admin/api
```

Environment variables are listed in `apps/api/.env.example`. `DATABASE_URL` and `ADMIN_JWT_SECRET` are required.

## Tests

```bash
npm test                                         # unit tests
TEST_DATABASE_URL=postgresql://... npm run test:e2e   # API tests on a throwaway Postgres database (tables are recreated)
```

## Safety rules while Rails is live

- Never run `prisma migrate` or `prisma db push` against the shared database. Rails owns the schema until cutover.
- Add Prisma models only for tables of approved modules.
- Keep app API responses identical to Rails so the mobile app needs no changes.
