import { BadRequestException, Get, Param, Query } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RequirePermission } from '../ability/require-permission.decorator';
import { AdminController } from '../admin-controller.decorator';
import { DateRange } from './date-range';
import { appUsersPage, ga4Page, GA4_PAGES, Page, subscriptionsPage } from './pages';
import type { Points } from './reports';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

/** Analytics menu (app/admin/*_analytics.rb). Two pages read the app database, the rest GA4. */
@AdminController('analytics')
export class AnalyticsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':page')
  @RequirePermission('read', 'analytics')
  async page(@Param('page') page: string, @Query() query: Record<string, unknown>): Promise<{ data: Page }> {
    if (page === 'app-users' || page === 'subscriptions') return { data: await this.dbPage(page, query) };
    if (!GA4_PAGES[page]) throw new BadRequestException(`Unknown analytics page "${page}"`);
    const refresh = query.refresh !== undefined && query.refresh !== '' && query.refresh !== '0';
    return { data: await ga4Page(page, DateRange.fromParams(query), refresh) };
  }

  private async dbPage(page: 'app-users' | 'subscriptions', query: Record<string, unknown>): Promise<Page> {
    const countries = (await this.prisma.$queryRawUnsafe<{ name: string }[]>('SELECT name FROM account_block_countries ORDER BY id')).map((r) => r.name);
    const country = typeof query.country === 'string' && query.country ? query.country : undefined;
    const [match] = country && country !== 'All'
      ? await this.prisma.$queryRawUnsafe<{ id: bigint }[]>('SELECT id FROM account_block_countries WHERE name = $1 ORDER BY id LIMIT 1', country)
      : [];
    // Same as Rails: an unknown country name falls back to all users.
    const where = match ? 'WHERE a.id IN (SELECT p.account_id FROM bx_block_profile_profiles p WHERE p.country_id = $1)' : '';
    const params = match ? [match.id] : [];

    if (page === 'app-users') {
      const [c] = await this.prisma.$queryRawUnsafe<Array<Record<string, bigint>>>(
        `SELECT COUNT(*)::bigint AS total,
                COUNT(*) FILTER (WHERE a.learning_premium IS FALSE AND a.payment_premium IS FALSE)::bigint AS free,
                COUNT(*) FILTER (WHERE a.learning_premium IS TRUE)::bigint AS self_premium,
                COUNT(*) FILTER (WHERE a.payment_premium IS TRUE)::bigint AS paid_premium
           FROM accounts a ${where}`, ...params);
      return appUsersPage({
        countries,
        country,
        counts: {
          total: Number(c.total), free: Number(c.free), selfPremium: Number(c.self_premium), paidPremium: Number(c.paid_premium),
          signups: await this.monthly(`SELECT a.created_at AS at, 1 AS v FROM accounts a ${where}`, params),
          premium: await this.monthly(
            `SELECT a.created_at AS at, 1 AS v FROM accounts a ${where ? `${where} AND` : 'WHERE'} (a.learning_premium IS TRUE OR a.payment_premium IS TRUE)`, params),
        },
      });
    }

    const subs = `FROM bx_block_stripe_integration_subscriptions s JOIN bx_block_stripe_integration_plans pl ON pl.id = s.plan_id
                  JOIN accounts a ON a.id = s.account_id ${where}`;
    const [s] = await this.prisma.$queryRawUnsafe<Array<Record<string, bigint>>>(
      `SELECT COALESCE(SUM(pl.price_cents), 0)::bigint AS total,
              COUNT(*) FILTER (WHERE pl.interval = 0)::bigint AS monthly,
              COUNT(*) FILTER (WHERE pl.interval = 1)::bigint AS yearly ${subs}`, ...params);
    return subscriptionsPage({
      countries,
      country,
      subscriptions: {
        totalCents: Number(s.total), monthly: Number(s.monthly), yearly: Number(s.yearly),
        perMonth: await this.monthly(`SELECT s.created_at AS at, pl.price_cents AS v ${subs}`, params),
      },
    });
  }

  /** groupdate's group_by_month: every month from the first to the last row, gaps filled with 0. */
  private async monthly(source: string, params: unknown[]): Promise<Points> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ month: string; total: bigint }>>(
      `WITH src AS (${source}),
            bounds AS (SELECT date_trunc('month', MIN(at)) AS lo, date_trunc('month', MAX(at)) AS hi FROM src)
       SELECT to_char(m, 'YYYY-MM-DD') AS month, COALESCE(SUM(src.v), 0)::bigint AS total
         FROM bounds, generate_series(bounds.lo, bounds.hi, interval '1 month') m
         LEFT JOIN src ON date_trunc('month', src.at) = m
        GROUP BY m ORDER BY m`, ...params);
    return rows.map((r) => [monthLabel(r.month), Number(r.total)]);
  }
}
