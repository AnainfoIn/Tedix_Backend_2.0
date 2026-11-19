import { generateKeyPairSync } from 'crypto';
import { DateRange } from './date-range';
import { ga4Page, GA4_PAGES } from './pages';

/** Runs every GA4 page against a fake Data API that answers any report with plausible rows. */
describe('analytics GA4 pages', () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const realFetch = global.fetch;
  let deny = false;

  const value = (name: string, i: number): string => {
    if (name === 'date') return `202611${String(10 + (i % 9)).padStart(2, '0')}`;
    if (name === 'yearMonth') return '202611';
    if (name === 'isoYearIsoWeek') return '202646';
    if (name === 'eventName') return 'lesson_started';
    if (name === 'cohort') return '2026-11-09';
    if (name === 'cohortNthWeek') return '0001';
    return `value_${i}`;
  };

  beforeAll(() => {
    process.env.GA4_PROPERTY_ID = '123';
    process.env.GA4_SERVICE_ACCOUNT_JSON = JSON.stringify({ client_email: 'sa@test.iam', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) });
    global.fetch = (async (url: string, init: RequestInit) => {
      const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
      if (url.includes('oauth2')) return json({ access_token: 'tok', expires_in: 3600 });
      if (deny) return json({ error: { message: 'no access' } }, 403);
      if (url.endsWith('/metadata')) return json({ dimensions: [{ apiName: 'customEvent:lesson_name' }, { apiName: 'customEvent:exit_step' }], metrics: [{ apiName: 'customEvent:current_progress' }] });
      const body = JSON.parse(String(init.body));
      if (url.includes('runFunnelReport')) {
        return json({ funnelTable: { metricHeaders: [{ name: 'activeUsers' }], rows: body.funnel.steps.map((_: unknown, i: number) => ({ dimensionValues: [{ value: `${i + 1}. step` }], metricValues: [{ value: String(100 - i * 10) }] })) } });
      }
      const rows = Array.from({ length: 3 }, (_, i) => ({
        dimensionValues: (body.dimensions ?? []).map((d: { name: string }) => ({ value: value(d.name, i) })),
        metricValues: (body.metrics ?? []).map(() => ({ value: String(5 + i) })),
      }));
      return json({ rows, rowCount: rows.length });
    }) as typeof fetch;
  });

  afterAll(() => {
    global.fetch = realFetch;
    delete process.env.GA4_PROPERTY_ID;
    delete process.env.GA4_SERVICE_ACCOUNT_JSON;
  });

  it.each(Object.keys(GA4_PAGES))('builds %s', async (key) => {
    const page = await ga4Page(key, DateRange.fromParams({ preset: 'last_30_days' }), true);
    expect(page.unavailable).toBeUndefined();
    expect(page.sections.length).toBeGreaterThan(2);
    expect(JSON.stringify(page)).not.toContain('NaN');
  });

  it('explains a missing property permission', async () => {
    deny = true;
    const page = await ga4Page('lessons', DateRange.fromParams({ preset: 'last_7_days' }), true);
    deny = false;
    expect(page.unavailable?.message).toContain('sa@test.iam');
    expect(page.sections).toEqual([]);
  });
});
