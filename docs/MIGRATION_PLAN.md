# Rails to Node.js migration plan

Status: **Phase 0 (foundation + admin panel shell) in progress.** Every later module is migrated only after it is approved.

## What exists today (AnainfoIn/Tedix_Backend, surveyed 2026-11-18)

| Area | Rails today | Size |
| --- | --- | --- |
| Framework | Rails 6.1, Ruby 2.7.5 (end of life), ~45 Builder.ai `bx_block_*` gems (sources vendored in `vendor/cache`) | 622 Ruby files, ~32k lines in `app/` |
| Database | PostgreSQL, 196 tables in `schema.rb` (version 2025-09-10) plus 196 newer migrations up to 2026-11-13. Many tables are unused Builder.ai boilerplate (orders, shipments, catalogues, vans) | |
| App API | JSON:API style responses (`data.attributes`), JWT HS512 signed with `SECRET_KEY_BASE`, sent in a `token` header or param, 24 h expiry plus refresh token | ~8k lines of controllers |
| Admin | ActiveAdmin with 68 pages, Devise admin users, Google Authenticator 2FA, CanCan roles (admin / sub_admin / read-only) | ~9.3k lines |
| Jobs | Sidekiq + sidekiq-cron, 16 workers (leaderboards, rewards, notifications, expiring shields, stale sessions) | |
| Integrations | Stripe (plans, subscriptions, cards, webhook), OneSignal + FCM push, SMS (Twilio, Karix, SMS Eagle), email, Google sign-in, GA4 analytics, S3-compatible storage (ActiveStorage + CarrierWave), ffmpeg video, Excel imports (roo) | |
| Client | Tedix_Frontend (React Native + web) calls `bx_block_*` and `account_block/*` endpoints | |

## Approved stack

- **API:** Node.js 22 + TypeScript + NestJS 11 (`apps/api`). One Nest module per Rails `bx_block_*` area.
- **Database:** Prisma 6 on the **same Postgres database** as Rails. No data migration. Rails migrations stay the source of truth until cutover; models are added to `schema.prisma` module by module (`npm run db:pull` shows the full schema).
- **Admin panel:** React 18 + react-admin 5 + MUI (`apps/admin`), served by the API at `/admin`. Replaces ActiveAdmin page by page.
- **Jobs (later):** BullMQ + Redis to replace Sidekiq. Each cron moves only when its module moves, and is switched off in Rails at the same time.

## How the switch-over works

Both backends run side by side on the same database. When a module is approved and verified, a reverse-proxy rule sends that module's URL prefix to Node. The mobile app keeps calling the same URLs, so it needs no release. Rollback = remove the proxy rule.

Rules for every app-facing module:

1. Same URL, method, params and response shape as Rails (JSON:API format, same error bodies and status codes).
2. App tokens stay compatible: HS512 with `SECRET_KEY_BASE`, `token` header, same refresh flow.
3. Passwords stay bcrypt (Devise and `has_secure_password` hashes are readable by Node).
4. A contract test compares Rails and Node responses for each endpoint before switching.

## Modules and proposed order

| # | Module | Rails parts | Admin pages | Risk |
| --- | --- | --- | --- | --- |
| 0 | **Foundation + admin shell** (this PR) | health check, admin auth + 2FA, roles, admin users | Dashboard, Admin Users, Roles | Low |
| 1 | Reference data (read-only) | countries, cities, schools, grades, languages, categories, sub-categories, about us, authors, sponsors, terms | Countries, Cities, Schools, Grades, Languages, Sponsors, Terms | Low |
| 2 | Accounts and sign-in | signup, email/SMS OTP, login, Google sign-in, forgot password, change password, device id, onboarding | User Management, App Users | High (every user) |
| 3 | Learning content | profiles, mains, subjects, units, lessons, micro lessons, summaries, materials, curriculum, search, ratings, feedback, report problem, share | Masters, Mains, Subjects, Units, Lessons, Micro Lessons, Contents, Question Banks | Medium |
| 4 | Notifications | in-app, push (OneSignal/FCM), broadcast, admin notifications, email, SMS templates | Notifications, Broadcast Messages, SMS Templates | Medium |
| 5 | Gamification core | event points, lesson sessions/attempts/progress, Q&A, boosters, streaks, daily goals, median grades, score credit mapping | Event Points, Boosters, Score Credit Mapping | High |
| 6 | Competitions and rewards | leaderboards, shields, shadows/boogies, arena, campaigns, puzzle mix, weekly challenges, tip competitions, monthly/campaign/banana rewards, gifts, treasure chest + their workers | Campaigns, Weekly Challenges, Tip Competitions, Rewards, Leaderboards | High |
| 7 | Payments | Stripe plans, subscriptions, cards, payment methods, webhook | Subscription Plans, User Subscriptions | High (money) |
| 8 | Analytics | GA4 reports, dashboards | Analytics pages | Low |
| 9 | Cutover | remaining routes, Sidekiq off, Rails retired, Prisma takes over migrations | ActiveAdmin off | |

## Things to fix along the way

- `env.txt`, `encryption.txt` and a database dump (`app.2025-06-25T06_00_19Z.sql.gz`) are committed to the Rails repo. They should be removed from git history and the secrets rotated.
- `schema.rb` is 196 migrations behind; the Prisma schema must be pulled from a real database, not from `schema.rb`.
