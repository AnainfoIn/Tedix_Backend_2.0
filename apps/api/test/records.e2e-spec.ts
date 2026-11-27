/**
 * End-to-end tests for the generic admin resources (the old ActiveAdmin pages that are plain
 * tables: cities, schools, languages, boosters, ...). Loads every Rails table from
 * db/rails-full-schema.sql into TEST_DATABASE_URL, which must be a throwaway database.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';

const DB = process.env.TEST_DATABASE_URL;

/** Runs every db/changes/<nnn>/up.sql in order, one statement at a time (Prisma runs one per call). */
async function applyDbChanges(prisma: PrismaClient) {
  const dir = join(__dirname, '..', '..', '..', 'db', 'changes');
  for (const change of readdirSync(dir).filter((d) => /^\d{3}-/.test(d)).sort()) {
    const statements = splitSql(readFileSync(join(dir, change, 'up.sql'), 'utf8')).filter((st) => !/^(BEGIN|COMMIT|SET LOCAL\b)/i.test(st));
    await prisma.$transaction(statements.map((st) => prisma.$executeRawUnsafe(st)));
  }
}

/** Splits a SQL script on top-level semicolons, skipping -- comments, quotes and $tag$ bodies. */
function splitSql(sql: string): string[] {
  const out: string[] = [];
  let cur = '';
  for (let i = 0; i < sql.length; ) {
    const rest = sql.slice(i);
    const dollar = /^\$[A-Za-z_]*\$/.exec(rest);
    if (rest.startsWith('--')) {
      i = sql.indexOf('\n', i) === -1 ? sql.length : sql.indexOf('\n', i);
    } else if (dollar) {
      const close = sql.indexOf(dollar[0], i + dollar[0].length) + dollar[0].length;
      cur += sql.slice(i, close);
      i = close;
    } else if (sql[i] === "'") {
      const close = sql.indexOf("'", i + 1) + 1;
      cur += sql.slice(i, close);
      i = close;
    } else if (sql[i] === ';') {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
      i++;
    } else {
      cur += sql[i++];
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
const describeDb = DB ? describe : describe.skip;
const DEVISE_HASH = '$2a$04$aEX3E3SpgSkH/LW7CJH.puiX6W7gGQNNJ0Z3i/qm49cfgsfih/mUO'; // "secret123"

describeDb('generic admin resources (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    process.env.DATABASE_URL = DB;
    process.env.ADMIN_JWT_SECRET = 'test-secret-test-secret-test-secret';
    process.env.STORAGE_SERVICE = 'memory';
    prisma = new PrismaClient({ datasourceUrl: DB });
    await prisma.$executeRawUnsafe('DROP SCHEMA public CASCADE');
    await prisma.$executeRawUnsafe('CREATE SCHEMA public');
    const ddl = readFileSync(join(__dirname, '..', '..', '..', 'db', 'rails-full-schema.sql'), 'utf8');
    for (const statement of ddl.replace(/^--.*$/gm, '').split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) {
      await prisma.$executeRawUnsafe(statement);
    }
    // TEST_DB_CHANGES=1 also applies db/changes/*/up.sql, to check the app on the changed schema.
    if (process.env.TEST_DB_CHANGES) await applyDbChanges(prisma);
    await prisma.$executeRawUnsafe(
      `INSERT INTO roles (name, created_at, updated_at) VALUES ('Admin', now(), now()), ('sub_admin', now(), now()), ('Editor', now(), now())`,
    );
    for (const [email, role] of [['admin@tedix.test', 'Admin'], ['sub@tedix.test', 'sub_admin'], ['viewer@tedix.test', 'Editor']]) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO admin_users (email, encrypted_password, role_id, created_at, updated_at)
         SELECT '${email}', '${DEVISE_HASH}', id, now(), now() FROM roles WHERE name = '${role}'`,
      );
    }
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    setupApp(app, { serveAdmin: false });
    await app.init();
    for (const who of ['admin', 'sub', 'viewer']) {
      const res = await request(app.getHttpServer()).post('/admin/api/auth/login').send({ email: `${who}@tedix.test`, password: 'secret123' });
      if (!res.body.data?.token) throw new Error(`login failed for ${who}: ${res.status} ${JSON.stringify(res.body)}`);
      tokens[who] = res.body.data.token;
    }
  });

  afterAll(async () => {
    await app?.close();
    // Leave an empty schema: the other suites create only the tables they need.
    await prisma?.$executeRawUnsafe('DROP SCHEMA public CASCADE').catch(() => undefined);
    await prisma?.$executeRawUnsafe('CREATE SCHEMA public').catch(() => undefined);
    await prisma?.$disconnect();
    delete process.env.STORAGE_SERVICE;
  });

  const api = (who = 'admin') => {
    const server = app.getHttpServer();
    const auth = { Authorization: `Bearer ${tokens[who]}` };
    return {
      get: (url: string) => request(server).get(`/admin/api${url}`).set(auth),
      post: (url: string, body: object) => request(server).post(`/admin/api${url}`).set(auth).send(body),
      put: (url: string, body: object) => request(server).put(`/admin/api${url}`).set(auth).send(body),
      del: (url: string) => request(server).delete(`/admin/api${url}`).set(auth),
    };
  };

  let countryId: number;

  it('creates cities with the Rails rules and refuses deleting one that has schools', async () => {
    const country = await api().post('/countries', { name: 'Romania', alpha2: 'RO', alpha3: 'ROU', countryCode: '40' });
    expect(country.status).toBe(201);
    countryId = country.body.data.id;

    const blank = await api().post('/cities', { name: ' ', countryId });
    expect(blank.status).toBe(422);
    expect(blank.body.errors.name).toEqual(["Name can't be blank"]);
    expect((await api().post('/cities', { name: 'Cluj' })).body.errors.countryId).toEqual(['Country must exist']);

    const city = await api().post('/cities', { name: '  Cluj   Napoca ', countryId });
    expect(city.status).toBe(201);
    expect(city.body.data).toMatchObject({ name: 'Cluj Napoca', countryId, countryIdLabel: 'Romania' });
    const dup = await api().post('/cities', { name: 'cluj napoca', countryId });
    expect(dup.body.errors.name).toEqual(['Name has already been taken']);

    const school = await api().post('/schools', { name: 'Colegiul National', cityId: city.body.data.id });
    expect(school.status).toBe(201);
    const blocked = await api().del(`/cities/${city.body.data.id}`);
    expect(blocked.status).toBe(422);
    expect(blocked.body.message).toBe('Cannot delete record because dependent schools exist');

    expect((await api().del(`/schools/${school.body.data.id}`)).status).toBe(200);
    expect((await api().del(`/cities/${city.body.data.id}`)).status).toBe(200);
  });

  it('lists with search, filters, sorting and paging', async () => {
    for (const name of ['Arad', 'Brasov', 'Constanta']) await api().post('/cities', { name, countryId });
    const page = await api().get('/cities?sort=name&order=DESC&perPage=2&page=1');
    expect(page.body.total).toBe(3);
    expect(page.body.data.map((c: { name: string }) => c.name)).toEqual(['Constanta', 'Brasov']);
    expect((await api().get('/cities?q=ras')).body.data.map((c: { name: string }) => c.name)).toEqual(['Brasov']);
    expect((await api().get(`/cities?countryId=${countryId}&name=an`)).body.total).toBe(1);
    const ids = (await api().get('/cities')).body.data.map((c: { id: number }) => c.id);
    expect((await api().get(`/cities?ids=${ids.slice(0, 2).join(',')}`)).body.data).toHaveLength(2);
    expect((await api().get('/cities?sort=nope')).status).toBe(200);
  });

  it('normalises and validates languages', async () => {
    const bad = await api().post('/languages', { name: 'R0', languageCode: 'ro', emojiFlag: 'x' });
    expect(bad.status).toBe(422);
    expect(bad.body.errors).toMatchObject({
      name: ['Name can only contain letters and spaces'],
      languageCode: ['Code must contain exactly 3 uppercase letters'],
      emojiFlag: ['Emoji flag must contain exactly one valid country flag emoji'],
    });
    const ok = await api().post('/languages', { name: 'Romanian', languageCode: 'ron', emojiFlag: '🇷🇴' });
    expect(ok.status).toBe(201);
    expect(ok.body.data.languageCode).toBe('RON');
  });

  it('edits boosters with a text duration and keeps the key read-only', async () => {
    await prisma.$executeRawUnsafe(
      `INSERT INTO bx_block_educational_gamification_boosters (key, description, duration_in_seconds, created_at, updated_at) VALUES ('double_xp', 'Double XP', 3600, now(), now())`,
    );
    const [{ id }] = await prisma.$queryRawUnsafe<{ id: bigint }[]>('SELECT id FROM bx_block_educational_gamification_boosters');
    expect((await api().post('/boosters', { key: 'x' })).status).toBe(405);
    const bad = await api().put(`/boosters/${id}`, { durationInSeconds: '2 weeks' });
    expect(bad.body.errors.durationInSeconds[0]).toMatch(/must be like/);
    const ok = await api().put(`/boosters/${id}`, { durationInSeconds: '1 days, 2 hours, 30 mins', key: 'hacked' });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ key: 'double_xp', durationInSeconds: 95400, durationInSecondsText: '1 days, 2 hours, 30 mins' });
  });

  it('allows only one Terms and Conditions record', async () => {
    expect((await api().post('/terms_and_conditions', { description: '<p>Terms</p>' })).status).toBe(201);
    const second = await api().post('/terms_and_conditions', { description: '<p>More</p>' });
    expect(second.status).toBe(422);
    expect(second.body.message).toMatch(/can not create more than one record/);
  });

  it('shows app users with their profile, and filters by country', async () => {
    const grade = await api().post('/grades', { name: 'Grade 5', countryId });
    await prisma.$executeRawUnsafe(
      `INSERT INTO accounts (email, password_digest, app_language_id, role_id, status, activated, total_xp, created_at, updated_at) VALUES ('kid@tedix.test', 'x', 1, 1, 0, true, 120, now(), now()), ('other@tedix.test', 'x', 1, 1, 1, false, 5, now(), now())`,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO bx_block_profile_profiles (account_id, user_name, app_country_id, country_id, category_id, created_at, updated_at)
       SELECT id, 'kiddo', ${countryId}, ${countryId}, ${grade.body.data.id}, now(), now() FROM accounts WHERE email = 'kid@tedix.test'`,
    );
    const list = await api().get(`/app_users?countryId=${countryId}`);
    expect(list.body.total).toBe(1);
    expect(list.body.data[0]).toMatchObject({ email: 'kid@tedix.test', userName: 'kiddo', countryIdLabel: 'Romania', gradeIdLabel: 'Grade 5', status: 0, totalXp: 120 });
    const id = list.body.data[0].id;
    const edit = await api().put(`/app_users/${id}`, { status: 1, email: 'changed@tedix.test', isBlacklisted: true });
    expect(edit.body.data).toMatchObject({ status: 1, email: 'kid@tedix.test', isBlacklisted: true });
    expect((await api().get('/app_users?q=kidd')).body.total).toBe(1);
    expect((await api().del(`/app_users/${id}`)).status).toBe(405);
  });

  const PNG = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000fa0000003208020000004f4f5d5c0000000049454e44ae426082',
    'hex',
  ); // 250×50 header only: enough for the size check and the upload

  it('requires images, orders shadow categories and lists them on the shield', async () => {
    const server = app.getHttpServer();
    const auth = { Authorization: `Bearer ${tokens.admin}` };
    const noImage = await api().post('/shields', { name: 'Iron', content: '<p>x</p>', xpMultiplier: 2, durationUnit: 'days', durationValue: 3 });
    expect(noImage.body.errors.image).toEqual(['Display image must be attached']);
    const shield = await request(server).post('/admin/api/shields').set(auth)
      .field('name', 'Iron').field('content', '<p>Strong</p>').field('xpMultiplier', '2').field('durationUnit', 'weeks').field('durationValue', '1')
      .attach('image', PNG, { filename: 'iron.png', contentType: 'image/png' });
    expect(shield.status).toBe(201);
    expect(shield.body.data.image).toMatchObject({ filename: 'iron.png' });
    const shieldId = shield.body.data.id;
    const a = (await api().post('/shadow_categories', { shieldId, name: 'Forest' })).body.data;
    const b = (await api().post('/shadow_categories', { shieldId, name: 'Sea' })).body.data;
    expect([a.position, b.position]).toEqual([1, 2]);
    await api().put(`/shadow_categories/${b.id}/position`, { position: 1 });
    const list = await api().get(`/shadow_categories?shieldId=${shieldId}&sort=position&order=ASC`);
    expect(list.body.data.map((c: { name: string }) => c.name)).toEqual(['Sea', 'Forest']);
    const blocked = await api().del(`/shields/${shieldId}`);
    expect(blocked.body.message).toBe('Cannot delete record because dependent shadow categories exist');
  });

  it('asks for the gift or the XP depending on the prize type', async () => {
    const xp = await api().post('/monthly_reward_configs', { metricType: 0, prizeType: 1, winnerCount: 3 });
    expect(xp.body.errors).toEqual({ xpAmount: ["XP amount can't be blank"] });
    expect((await api().post('/monthly_reward_configs', { metricType: 0, prizeType: 1, xpAmount: 50, winnerCount: 3 })).status).toBe(201);
    const dup = await api().post('/monthly_reward_configs', { metricType: 0, prizeType: 0, winnerCount: 1 });
    expect(dup.body.errors).toEqual({ metricType: ['Metric is already configured'], rewardGiftId: ['Prize gift must exist'] });
  });

  it('keeps sponsors and campaigns linked, and locks a live campaign', async () => {
    const sponsor = await api().post('/sponsors', { name: 'Acme', contactName: 'Ana', typeOfSponsor: 'SMB', countryId, fromDateOfContract: '2026-01-01', toDateOfContract: '2025-01-01' });
    expect(sponsor.body.errors.toDateOfContract).toEqual(['Contract end date must be after start date']);
    const promo = await api().post('/sponsors', { name: 'Acme', contactName: 'Ana', typeOfSponsor: 'SMB', countryId, fromDateOfContract: '2026-01-01', toDateOfContract: '2027-01-01', puzzleMix: true });
    expect(promo.body.errors.bannerImage).toEqual(['Banner image must be attached when promo options are enabled']);
    const ok = await api().post('/sponsors', { name: 'Acme', contactName: 'Ana', typeOfSponsor: 'SMB', countryId, fromDateOfContract: '2026-01-01', toDateOfContract: '2027-01-01' });
    expect(ok.status).toBe(201);
    const future = (days: number) => new Date(Date.now() + days * 86400000).toISOString();
    const campaign = {
      arenaType: 'periodic', name: 'Spring Cup', fromDate: future(1), toDate: future(10), status: 0, sponsorIds: [ok.body.data.id],
      audience: ['Students'], countryIds: [countryId], gradeIds: [1], subjectIds: [1], lessonIds: [1], lessonSelectionMode: 'auto',
    };
    const missing = await api().post('/campaigns', { ...campaign, lessonIds: [] , gradeIds: [999] });
    expect(missing.body.errors).toMatchObject({ lessonIds: ['Selected lessons must exist'], gradeIds: ['Grades must exist'] });
    const grade = (await api().get('/grades')).body.data[0];
    await prisma.$executeRawUnsafe(`INSERT INTO sub_categories (id, name, country_id, created_at, updated_at) VALUES (1, 'Math', ${countryId}, now(), now())`);
    await prisma.$executeRawUnsafe(`INSERT INTO bx_block_profile_lessons (id, name, unit_id, course_id, category_id, sub_category_id, main_id, country_id, start_date, end_date, created_at, updated_at) VALUES (1, 'L1', 1, 1, 1, 1, 1, 1, now(), now(), now(), now())`);
    const created = await api().post('/campaigns', { ...campaign, gradeIds: [grade.id] });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ sponsorIds: [ok.body.data.id], sponsorIdsLabels: ['Acme'], countryIds: [countryId], audience: ['Students'] });
    expect((await api().get(`/sponsors/${ok.body.data.id}`)).body.data.campaignIds).toEqual([created.body.data.id]);
    const id = created.body.data.id;
    const publish = await api().put(`/campaigns/${id}`, { status: 1 });
    expect(publish.body.errors.base).toHaveLength(4);
    for (const rewardType of [0, 1, 2, 3]) {
      expect((await api().post('/campaign_rewards', { campaignId: id, rewardType, prizeType: 1, xpAmount: 10, winnerCount: 1 })).status).toBe(201);
    }
    expect((await api().post('/campaign_rewards', { campaignId: id, rewardType: 0, prizeType: 1, xpAmount: 10, winnerCount: 1 })).body.errors.rewardType)
      .toEqual(['Reward type is already configured for this campaign']);
    expect((await api().put(`/campaigns/${id}`, { status: 1 })).status).toBe(200);
    await prisma.$executeRawUnsafe(`UPDATE campaigns SET from_date = now() - interval '1 day' WHERE id = ${id}`);
    const locked = await api().put(`/campaigns/${id}`, { name: 'Renamed', toDate: future(5) });
    expect(locked.body.errors).toMatchObject({
      name: ['Name cannot be changed once the campaign is live or has activity'],
      toDate: ['To date cannot be shortened once the campaign is live — you can only extend it'],
    });
    expect((await api().del(`/campaigns/${id}`)).body.message).toBe('Cannot delete record because dependent campaign rewards, sponsor campaigns exist');
  });

  it('lists claimed rewards only and enforces the claim status rules', async () => {
    const [{ id: campaignId }] = await prisma.$queryRawUnsafe<{ id: bigint }[]>('SELECT id FROM campaigns LIMIT 1');
    const [{ id: rewardId }] = await prisma.$queryRawUnsafe<{ id: bigint }[]>(`SELECT id FROM campaign_rewards WHERE campaign_id = ${campaignId} LIMIT 1`);
    const [{ id: accountId }] = await prisma.$queryRawUnsafe<{ id: bigint }[]>('SELECT id FROM accounts LIMIT 1');
    await prisma.$executeRawUnsafe(
      `INSERT INTO campaign_reward_allocations (campaign_id, campaign_reward_id, account_id, reward_type, prize_type, status, reward_gift_name, full_name, phone, created_at, updated_at) VALUES
       (${campaignId}, ${rewardId}, ${accountId}, 0, 0, 0, 'Bike', NULL, NULL, now(), now()),
       (${campaignId}, ${rewardId}, ${accountId}, 0, 0, 1, 'Bike', 'Ana Pop', '+40712345678', now(), now())`,
    );
    const list = await api().get('/campaign_reward_claims');
    expect(list.body.total).toBe(1);
    const claim = list.body.data[0];
    expect(claim).toMatchObject({ status: 1, rewardGiftName: 'Bike', campaignIdLabel: 'Spring Cup' });
    expect((await api().get(`/campaign_reward_claims?accountEmail=${encodeURIComponent(claim.accountIdLabel.slice(0, 4))}`)).body.total).toBe(1);
    const pendingId = Number(claim.id) - 1;
    expect((await api().get(`/campaign_reward_claims/${pendingId}`)).status).toBe(404);
    // The campaign is not closed yet, so the claim cannot change (campaign_must_be_closed).
    expect((await api().put(`/campaign_reward_claims/${claim.id}`, { status: 2 })).body.errors.base).toEqual(['Rewards can only be allocated once the campaign is closed']);
    await prisma.$executeRawUnsafe(`UPDATE campaigns SET status = 2 WHERE id = ${campaignId}`);
    const shipped = await api().put(`/campaign_reward_claims/${claim.id}`, { status: 2, trackingNumber: 'TRK1', fullName: 'Hacked' });
    expect(shipped.body.data).toMatchObject({ status: 2, trackingNumber: 'TRK1', fullName: 'Ana Pop' });
    expect((await api().put(`/campaign_reward_claims/${claim.id}`, { status: 3 })).body.errors.base).toEqual(['Reward has already been finalized and cannot be edited']);
    expect((await api().post('/campaign_reward_claims', { status: 1 })).status).toBe(405);
    expect((await api().del(`/campaign_reward_claims/${claim.id}`)).status).toBe(405);

    await prisma.$executeRawUnsafe(
      `INSERT INTO monthly_reward_allocations (month, year, metric_type, prize_type, account_id, status, created_at, updated_at) VALUES (1, 2026, 3, 0, ${accountId}, 0, now(), now())`,
    );
    expect((await api().get('/monthly_reward_claims')).body.total).toBe(0);
    await prisma.$executeRawUnsafe('UPDATE monthly_reward_allocations SET status = 1');
    const monthly = (await api().get('/monthly_reward_claims?metricType=3')).body.data[0];
    expect((await api().put(`/monthly_reward_claims/${monthly.id}`, { status: 2 })).body.data.status).toBe(2);
    expect((await api('sub').get('/monthly_reward_claims')).status).toBe(403);
    expect((await api('viewer').put(`/monthly_reward_claims/${monthly.id}`, { status: 1 })).status).toBe(403);
  });

  it('creates subscription plans with Stripe references and lists user subscriptions', async () => {
    const bad = await api().post('/subscription_plans', { name: ' x ', interval: 0, intervalCount: 0, priceCents: -1 });
    expect(bad.body.errors).toMatchObject({
      name: ['Name is too short (minimum is 2 characters)'],
      intervalCount: ['Interval count must be greater than 0'],
      priceCents: ['Price (€) must be greater than or equal to 0'],
      description: ["Description can't be blank"],
    });
    const plan = await api().post('/subscription_plans', { name: 'Premium  Monthly', interval: 0, intervalCount: 1, priceCents: 5, description: 'All lessons' });
    expect(plan.status).toBe(201);
    expect(plan.body.data).toMatchObject({ name: 'Premium Monthly', active: true });
    expect(plan.body.data.stripePriceId).toMatch(/^test_price_/);
    expect((await api().post('/subscription_plans', { name: 'premium monthly', interval: 1, intervalCount: 1, priceCents: 50, description: 'x' })).body.errors.name)
      .toEqual(['Name has already been taken']);
    const edited = await api().put(`/subscription_plans/${plan.body.data.id}`, { name: 'Renamed', priceCents: 99, description: 'Everything', active: false });
    expect(edited.body.data).toMatchObject({ name: 'Premium Monthly', priceCents: 5, description: 'Everything', active: false });
    expect((await api().del(`/subscription_plans/${plan.body.data.id}`)).status).toBe(405);

    const [{ id: accountId }] = await prisma.$queryRawUnsafe<{ id: bigint }[]>(`SELECT account_id AS id FROM bx_block_profile_profiles WHERE user_name = 'kiddo'`);
    await prisma.$executeRawUnsafe(
      `INSERT INTO bx_block_stripe_integration_subscriptions (plan_id, account_id, status, auto_renewal, start_date, end_date, created_at, updated_at) VALUES (${plan.body.data.id}, ${accountId}, 'active', true, now(), now() + interval '1 month', now(), now())`,
    );
    const subs = await api().get('/user_subscriptions?userName=kidd&status=active');
    expect(subs.body.total).toBe(1);
    expect(subs.body.data[0]).toMatchObject({ userName: 'kiddo', planIdLabel: 'Premium Monthly', status: 'active' });
    expect((await api().put(`/user_subscriptions/${subs.body.data[0].id}`, { status: 'canceled' })).status).toBe(405);
  });

  it('builds micro lessons with exercises, question banks, options and images', async () => {
    const [lesson] = await prisma.$queryRawUnsafe<Record<string, bigint>[]>('SELECT id, country_id, category_id, sub_category_id, course_id, main_id, unit_id FROM bx_block_profile_lessons WHERE id = 1');
    const c = lesson.country_id, g = lesson.category_id, s = lesson.sub_category_id;
    await prisma.$executeRawUnsafe(`INSERT INTO bx_block_profile_courses (id, course_name, country_id, category_id, sub_category_id, created_at, updated_at) VALUES (${lesson.course_id}, 'Algebra', ${c}, ${g}, ${s}, now(), now())`);
    await prisma.$executeRawUnsafe(`INSERT INTO bx_block_profile_mains (id, name, course_id, country_id, category_id, sub_category_id, created_at, updated_at) VALUES (${lesson.main_id}, 'Basics', ${lesson.course_id}, ${c}, ${g}, ${s}, now(), now())`);
    await prisma.$executeRawUnsafe(`INSERT INTO bx_block_profile_units (id, name, main_id, course_id, country_id, category_id, sub_category_id, created_at, updated_at) VALUES (${lesson.unit_id}, 'Unit 1', ${lesson.main_id}, ${lesson.course_id}, ${c}, ${g}, ${s}, now(), now())`);
    const tree = {
      countryId: Number(c), categoryId: Number(g), subCategoryId: Number(s), courseId: Number(lesson.course_id),
      mainId: Number(lesson.main_id), unitId: Number(lesson.unit_id), lessonId: 1,
    };
    const text = await api().post('/micro_lessons', { ...tree, name: 'Fractions', microLessonType: 1 });
    expect(text.body.errors).toEqual({ description: ["Content (Text) can't be blank"] });
    const video = await api().post('/micro_lessons', { ...tree, name: 'Fractions', microLessonType: 0 });
    expect(video.body.errors).toEqual({ summaryVideo: ['Content (Video) must be attached'] });
    const ml = await api().post('/micro_lessons', { ...tree, name: '  <b>Fractions</b>  ', microLessonType: 1, description: '<p onclick="x()">Hi <script>alert(1)</script><a href="y">there</a></p>' });
    expect(ml.status).toBe(201);
    expect(ml.body.data).toMatchObject({ name: '<b>Fractions</b>', description: '<p>Hi there</p>', position: 1, path: 'Romania/Grade 5/Math/Algebra/Basics/Unit 1/L1' });
    expect((await api().post('/micro_lessons', { ...tree, name: '<b>fractions</b>', microLessonType: 1, description: 'x' })).body.errors.name).toEqual(['Name has already been taken for this lesson']);
    const mlId = ml.body.data.id;

    const exercise = await api().post('/exercises', { microLessonId: mlId, name: 'Practice', categoryType: 0 });
    expect(exercise.status).toBe(201);
    const [copied] = await prisma.$queryRawUnsafe<{ unit_id: bigint; lesson_id: bigint }[]>(`SELECT unit_id, lesson_id FROM bx_block_assessmenttest_assessments WHERE id = ${exercise.body.data.id}`);
    expect(copied).toEqual({ unit_id: lesson.unit_id, lesson_id: 1n });
    const qb = await api().post('/question_banks', { assessmentId: exercise.body.data.id, questionbankType: 'regular', questionType: 11, question: 'Next?', hint: 'h', solution: 's' });
    expect(qb.status).toBe(201);
    expect((await api().post('/option_groups', { questionbankId: qb.body.data.id })).body.errors.shapeType).toEqual(['Shape must exist']);
    const group = await api().post('/option_groups', { questionbankId: qb.body.data.id, shapeType: 'triangle' });
    expect((await api().post('/answer_options', { answerOptionGroupId: group.body.data.id, option: '<p>3</p>', sequenceNumber: 1, isCorrect: true })).status).toBe(201);
    expect((await api().get(`/option_groups/${group.body.data.id}`)).body.data.optionsText).toBe('3 ✓');
    expect((await api().post('/variables', { questionbankId: qb.body.data.id, name: 'a', valueType: 'integer' })).status).toBe(201);
    expect((await api().post('/variables', { questionbankId: qb.body.data.id, name: 'A', valueType: 'integer' })).body.errors.name).toEqual(['Variable Name has already been taken']);

    const image = await request(app.getHttpServer()).post('/admin/api/content_images').set({ Authorization: `Bearer ${tokens.admin}` })
      .field('contentableType', 'BxBlockProfile::MicroSummary').field('summaryOfMicroLessonId', String(mlId)).field('keyName', 'pie')
      .attach('image', PNG, { filename: 'pie.png', contentType: 'image/png' });
    expect(image.status).toBe(201);
    expect(image.body.data).toMatchObject({ contentableType: 'BxBlockProfile::MicroSummary', summaryOfMicroLessonId: mlId, parentPath: `micro_lessons/${mlId}`, attrName: 'Description' });
    expect((await api().get(`/content_images?contentableType=BxBlockProfile::MicroSummary&summaryOfMicroLessonId=${mlId}`)).body.total).toBe(1);
    expect((await api().post('/content_images', { keyName: 'orphan' })).body.errors.base).toEqual(['Add content images from a micro lesson or question bank page']);

    // The exercise editor: one exercise with its question, groups and options, saved and deleted in one go.
    const second = await api().post('/exercises', { microLessonId: mlId, name: 'Second', categoryType: 0 });
    const editorBody = (questionId: number | null, groups: object[]) => ({
      name: 'Second edited', isAha: true,
      question: { id: questionId, questionType: 0, question: 'Pick one', questionBody: null, hint: 'h', solution: 's', groups },
    });
    const sid = second.body.data.id;
    expect((await api().put(`/workspace/exercises/${sid}`, editorBody(null, [{ options: [{ option: 'A', isCorrect: true, sequenceNumber: null }, { option: 'B', isCorrect: false, sequenceNumber: null }] }]))).status).toBe(200);
    const [saved] = await prisma.$queryRawUnsafe<Record<string, any>[]>(
      `SELECT a.name, a.is_aha, q.id AS qid, q.hint FROM bx_block_assessmenttest_assessments a JOIN bx_block_assessmenttest_questionbanks q ON q.assessment_id = a.id WHERE a.id = ${sid}`,
    );
    expect(saved).toMatchObject({ name: 'Second edited', is_aha: true, hint: 'h' });
    const opts = await prisma.$queryRawUnsafe<Record<string, any>[]>(
      `SELECT o.id, o.option FROM bx_block_assessmenttest_answer_options o JOIN answer_option_groups g ON g.id = o.answer_option_group_id WHERE g.questionbank_id = ${saved.qid} ORDER BY o.id`,
    );
    expect(opts.map((o) => o.option)).toEqual(['A', 'B']);
    const [grp] = await prisma.$queryRawUnsafe<Record<string, any>[]>(`SELECT id FROM answer_option_groups WHERE questionbank_id = ${saved.qid}`);
    const resave = await api().put(`/workspace/exercises/${sid}`, editorBody(Number(saved.qid), [{ id: Number(grp.id), options: [{ id: Number(opts[1].id), option: 'B!', isCorrect: true, sequenceNumber: null }] }]));
    expect(resave.status).toBe(200);
    expect((await prisma.$queryRawUnsafe<Record<string, any>[]>(`SELECT count(*)::int AS n FROM bx_block_assessmenttest_questionbanks WHERE assessment_id = ${sid}`))[0].n).toBe(1);
    expect((await api().put(`/workspace/exercises/${exercise.body.data.id}`, editorBody(Number(saved.qid), []))).status).toBe(400);
    // Translations of the exercise, its question and an option (own tables after DB change 002).
    await prisma.$executeRawUnsafe(
      `INSERT INTO bx_block_language_options_languages (name, language_code, emoji_flag, created_at, updated_at)
       VALUES ('Romanian', 'RO', 'ro', now(), now()), ('English', 'EN', 'en', now(), now())`,
    );
    const [en] = await prisma.$queryRawUnsafe<Record<string, any>[]>(`SELECT id FROM bx_block_language_options_languages WHERE language_code = 'EN'`);
    const tr = (itemType: string, itemId: number, field: string, value: string, status?: string) =>
      api().put('/workspace/translations', { itemType, itemId, field, languageId: Number(en.id), value, status });
    expect((await tr('exercise', sid, 'name', 'Second (EN)')).status).toBe(200);
    expect((await tr('question', Number(saved.qid), 'hint', 'Hint EN', 'reviewed')).status).toBe(200);
    expect((await tr('question', Number(saved.qid), 'question', 'Pick one EN')).status).toBe(200);
    expect((await tr('option', Number(opts[1].id), 'option', 'B EN')).status).toBe(200);
    expect((await tr('question', Number(saved.qid), 'question', '')).status).toBe(200);
    const ws = (await api().get(`/workspace/micro_lessons/${mlId}`)).body.data;
    const mine = ws.translations
      .filter((t: any) => t.languageId === Number(en.id))
      .map((t: any) => `${t.itemType}:${t.field}=${t.value}:${t.status}:${t.outdated}`)
      .sort();
    expect(mine).toEqual(['exercise:name=Second (EN):edited:false', 'option:option=B EN:edited:false', 'question:hint=Hint EN:reviewed:false']);
    if (process.env.TEST_DB_CHANGES) {
      const rows = await prisma.$queryRawUnsafe<Record<string, any>[]>(`SELECT name, question, hint, status FROM exercise_translations WHERE exercise_id = ${sid}`);
      expect(rows).toEqual([{ name: 'Second (EN)', question: null, hint: 'Hint EN', status: { name: 'edited', hint: 'reviewed' } }]);
    }

    if (process.env.TEST_DB_CHANGES) {
      const [row] = await prisma.$queryRawUnsafe<Record<string, any>[]>(`SELECT name, question FROM exercises WHERE id = ${sid}`);
      expect(row).toEqual({ name: 'Second edited', question: 'Pick one' });
    }
    // Exercise list order (DB change 003): drag to reorder; refused before the change.
    const order = await api().put('/workspace/exercises/order', { microLessonId: mlId, ids: [sid, exercise.body.data.id] });
    if (process.env.TEST_DB_CHANGES) {
      expect(order.status).toBe(200);
      const list = (await api().get(`/workspace/micro_lessons/${mlId}`)).body.data;
      expect(list.canReorder).toBe(true);
      expect(list.exercises.map((x: any) => [x.id, x.position])).toEqual([[sid, 1], [exercise.body.data.id, 2]]);
      expect((await api().put('/workspace/exercises/order', { microLessonId: mlId, ids: [sid] })).status).toBe(400);
      await prisma.$executeRawUnsafe(`UPDATE exercises SET needs_review = true, review_note = 'x' WHERE id = ${sid}`);
      expect((await api().get(`/workspace/micro_lessons/${mlId}`)).body.data.exercises[0]).toMatchObject({ needsReview: true, reviewNote: 'x' });
      await api().put(`/workspace/exercises/${sid}`, editorBody(Number(saved.qid), [{ id: Number(grp.id), options: [{ id: Number(opts[1].id), option: 'B!', isCorrect: true, sequenceNumber: null }] }]));
      expect((await api().get(`/workspace/micro_lessons/${mlId}`)).body.data.exercises[0]).toMatchObject({ needsReview: false, reviewNote: null });
    } else {
      expect(order.status).toBe(400);
      expect((await api().get(`/workspace/micro_lessons/${mlId}`)).body.data.canReorder).toBe(false);
    }
    // "Add exercise" dialog: creates the exercise (hierarchy from the micro lesson, last in the list), no question yet.
    expect((await api().post('/workspace/exercises', { microLessonId: mlId, name: 'x' })).status).toBe(400);
    expect((await api().post('/workspace/exercises', { microLessonId: mlId, name: 'second EDITED' })).body.message).toBe('Name has already been taken for this micro lesson');
    expect((await api().post('/workspace/exercises', { microLessonId: 999999, name: 'Third' })).status).toBe(404);
    const added = await api().post('/workspace/exercises', { microLessonId: mlId, name: '  Third   one ', isAha: true });
    expect(added.status).toBe(201);
    const aid = added.body.data.id;
    const [addedRow] = await prisma.$queryRawUnsafe<Record<string, any>[]>(
      `SELECT a.name, a.is_aha, a.category_type, a.lesson_id = m.lesson_id AND a.unit_id = m.unit_id AS same_place
       FROM bx_block_assessmenttest_assessments a JOIN bx_block_profile_micro_lessons m ON m.id = a.micro_lesson_id WHERE a.id = ${aid}`,
    );
    expect(addedRow).toEqual({ name: 'Third one', is_aha: true, category_type: 0, same_place: true });
    const wsAdded = (await api().get(`/workspace/micro_lessons/${mlId}`)).body.data;
    expect(wsAdded.exercises.find((x: any) => x.id === aid)).toMatchObject({ name: 'Third one', questions: [] });
    if (process.env.TEST_DB_CHANGES) expect(wsAdded.exercises.map((x: any) => x.id)).toEqual([sid, exercise.body.data.id, aid]);
    expect((await api().put(`/workspace/exercises/${aid}`, { ...editorBody(null, [{ options: [{ option: 'A', isCorrect: true, sequenceNumber: null }] }]), name: 'Third one' })).status).toBe(200);
    expect((await api().del(`/workspace/exercises/${aid}`)).status).toBe(200);

    // generateQuestion: examples become template exercises, served with new numbers (needs DB change 004).
    const preview = await api().post('/workspace/question-templates/preview', { examples: ['2+3=5', '12 : 3 = 4', '2+3=6'], count: 3, seed: 1 });
    expect(preview.status).toBe(201);
    expect(preview.body.data.templates.map((t: any) => t.pattern)).toEqual(['{a} + {b} = {c}', '{a} : {b} = {c}']);
    expect(preview.body.data.templates[0].questions[0]).toMatchObject({ questionBody: '2 + 3 = [Blank]', answer: '5' });
    expect(preview.body.data.skipped.map((x: any) => x.example)).toEqual(['2+3=6']);
    expect((await api().post('/workspace/question-templates/preview', { examples: ['hello'] })).status).toBe(400);
    const loose = await api().post('/workspace/question-templates/generate', { examples: ['2+3=5'], count: 15 });
    expect(loose.body.data.templates[0].questions).toHaveLength(15);
    expect((await api('viewer').post('/workspace/question-templates', { examples: ['2+3=5'], microLessonId: mlId })).status).toBe(403);
    const tpl = await api().post('/workspace/question-templates', { examples: ['2+3=5', '7 - 4 = 3'], microLessonId: mlId });
    if (process.env.TEST_DB_CHANGES) {
      expect(tpl.status).toBe(201);
      const [add, sub] = tpl.body.data.saved;
      expect(add).toMatchObject({ name: 'Fill in the Blank: {a} + {b} = {c}', sample: { questionBody: '2 + 3 = [Blank]', answer: '5' } });
      expect(sub).toMatchObject({ name: 'Fill in the Blank: {a} - {b} = {c}', sample: { questionBody: '7 - 4 = [Blank]', answer: '3' } });
      const [row] = await prisma.$queryRawUnsafe<Record<string, any>[]>(
        `SELECT questionbank_type, question_type, question_body, question_template->>'pattern' AS pattern FROM exercises WHERE id = ${add.exerciseId}`,
      );
      expect(row).toEqual({ questionbank_type: 'template', question_type: 3, question_body: '2 + 3 = [Blank]', pattern: '{a} + {b} = {c}' });
      // Rails and the app read the sample through the old-name views, in the editor's format.
      const tiles = await prisma.$queryRawUnsafe<Record<string, any>[]>(
        `SELECT o.option, o.is_correct, o.sequence_number FROM bx_block_assessmenttest_answer_options o
         JOIN answer_option_groups g ON g.id = o.answer_option_group_id JOIN bx_block_assessmenttest_questionbanks q ON q.id = g.questionbank_id
         WHERE q.assessment_id = ${add.exerciseId} ORDER BY o.id`,
      );
      expect(tiles).toEqual([
        { option: '5', is_correct: true, sequence_number: 1 },
        { option: '6', is_correct: false, sequence_number: null },
        { option: '4', is_correct: false, sequence_number: null },
      ]);
      const variants = await api().get(`/workspace/exercises/${add.exerciseId}/variants?count=15&seed=3`);
      expect(variants.status).toBe(200);
      expect(variants.body.data.questions).toHaveLength(15);
      expect(new Set(variants.body.data.questions.map((q: any) => q.questionBody)).size).toBe(15);
      for (const q of variants.body.data.questions) expect(Number(q.answer)).toBe(q.values.a + q.values.b);
      expect((await api('viewer').get(`/workspace/exercises/${add.exerciseId}/variants?count=2`)).status).toBe(200);
      expect((await api().get(`/workspace/exercises/${add.exerciseId}/variants?count=0`)).status).toBe(400);
      // Into an existing exercise: it keeps its name, its question becomes the template's sample.
      const into = await api().post('/workspace/question-templates', { examples: ['2, 4, 6, ?'], exerciseId: sub.exerciseId });
      expect(into.body.data.saved[0]).toMatchObject({ exerciseId: sub.exerciseId, name: sub.name, type: 'Number Pattern' });
      expect((await api().get(`/workspace/exercises/${sub.exerciseId}/template`)).body.data.template.questionType).toBe(10);
      expect((await api().post('/workspace/question-templates', { examples: ['2+3=5', '2,4,6,?'], exerciseId: sub.exerciseId })).status).toBe(400);
      const again = await api().post('/workspace/question-templates', { examples: ['2+3=5'], microLessonId: mlId });
      expect(again.body.data.saved[0].name).toBe('Fill in the Blank: {a} + {b} = {c} (2)');
      // Back to a normal exercise; it keeps the sample.
      expect((await api().del(`/workspace/exercises/${add.exerciseId}/template`)).status).toBe(200);
      expect((await api().get(`/workspace/exercises/${add.exerciseId}/variants`)).status).toBe(400);
      expect((await api().get(`/workspace/exercises/${add.exerciseId}/template`)).body.data.template).toBeNull();
      // Rails removing the question (through the view) removes the template too.
      const againId = again.body.data.saved[0].exerciseId;
      await prisma.$executeRawUnsafe(`DELETE FROM bx_block_assessmenttest_answer_options WHERE answer_option_group_id IN (SELECT id FROM answer_option_groups WHERE questionbank_id = (SELECT question_id FROM exercises WHERE id = ${againId}))`);
      await prisma.$executeRawUnsafe(`DELETE FROM answer_option_groups WHERE questionbank_id = (SELECT question_id FROM exercises WHERE id = ${againId})`);
      await prisma.$executeRawUnsafe(`DELETE FROM bx_block_assessmenttest_questionbanks WHERE assessment_id = ${againId}`);
      expect(await prisma.$queryRawUnsafe(`SELECT question_template FROM exercises WHERE id = ${againId}`)).toEqual([{ question_template: null }]);
      for (const id of [add.exerciseId, sub.exerciseId, againId]) expect((await api().del(`/workspace/exercises/${id}`)).status).toBe(200);
    } else {
      expect(tpl.status).toBe(400);
      expect(tpl.body.message).toMatch(/database change 004/);
    }

    expect((await api().del(`/workspace/exercises/${sid}`)).status).toBe(200);
    expect(await prisma.$queryRawUnsafe(`SELECT id FROM bx_block_assessmenttest_assessments WHERE id = ${sid}`)).toEqual([]);

    expect((await api().del(`/exercises/${exercise.body.data.id}`)).body.message).toBe('Cannot delete record because dependent questionbanks exist');
    expect((await api().del(`/micro_lessons/${mlId}`)).body.message).toBe('Cannot delete record because dependent assessments exist');
    await prisma.$executeRawUnsafe('DELETE FROM bx_block_assessmenttest_assessments');
    expect((await api().del(`/micro_lessons/${mlId}`)).body.message).toBe('Cannot delete record because dependent micro summaries exist');
    expect((await api().del(`/content_images/${image.body.data.id}`)).status).toBe(200);
    expect((await api().del(`/micro_lessons/${mlId}`)).status).toBe(200);
    expect(await prisma.$queryRawUnsafe('SELECT id FROM bx_block_profile_micro_summaries')).toEqual([]);
    expect((await api('sub').get('/exercises')).status).toBe(200);
    expect((await api('sub').post('/exercises', { name: 'x' })).status).toBe(403);
  });

  it('creates notifications with their channels, schedule and targeting', async () => {
    const empty = await api().post('/notifications', {});
    expect(empty.body.errors).toEqual({ base: ['At least one notification type must be selected'], targetCountry: ["Targeting settings can't be blank"] });
    const missing = await api().post('/notifications', { inapp: true, sms: true, smsSponsorMessage: true, targetCountry: ['Romania'] });
    expect(missing.body.errors).toMatchObject({
      inappSubject: ["Admin inapp notification subject can't be blank"],
      smsName: ["Admin sms notification name can't be blank"],
      smsSponsorBody: ["Admin sms notification sponsor body can't be blank"],
    });
    const created = await api().post('/notifications', {
      inapp: true, inappSubject: 'Hello', inappContent: 'Line 1\nLine <2>', inappIsButton: true,
      push: true, pushSubject: 'Ping', pushContent: 'Open the app',
      scheduleType: 'weekly', scheduleTime: '2026-12-01T09:30:00Z', recurrenceWeekday: [1, 3],
      targetCountry: ['Romania'], targetCity: ['Nowhere'], targetAccountType: ['student'],
    });
    expect(created.status).toBe(201);
    const n = created.body.data;
    expect(n).toMatchObject({
      types: 'In-App, Push', status: 'draft', scheduleText: 'Weekly on Monday, Wednesday at 09:30', recurrenceWeekday: [1, 3],
      targetingSummary: 'Countries: Romania | Cities: Nowhere | Account Types: student',
      inappSubject: 'Hello', inappContent: 'Line 1\nLine <2>', inappIsButton: true, pushSubject: 'Ping', pushContent: 'Open the app',
    });
    expect(n.targetedAccountsCount).toBeGreaterThanOrEqual(0);
    const [{ body }] = await prisma.$queryRawUnsafe<{ body: string }[]>(`SELECT body FROM action_text_rich_texts WHERE record_type = 'BxBlockNotifications::AdminInappNotification'`);
    expect(body).toBe('<div>Line 1<br>Line &lt;2&gt;</div>');

    const [{ id: kid }] = await prisma.$queryRawUnsafe<{ id: bigint }[]>(`SELECT account_id AS id FROM bx_block_profile_profiles WHERE user_name = 'kiddo'`);
    await prisma.$executeRawUnsafe(`UPDATE bx_block_profile_profiles SET city = 'Iasi', school = 'School 1', grade = '5' WHERE account_id = ${kid}`);
    const options = await api().get('/notifications/targeting-options?type=cities&country=Romania');
    expect(options.body.data).toEqual(['Iasi']);
    const updated = await api().put(`/notifications/${n.id}`, { push: false, targetCity: ['Iasi'], accountIds: [Number(kid)] });
    expect(updated.body.data).toMatchObject({ types: 'In-App', targetedAccountsCount: 1, manualAccountsCount: 1, totalAccountsCount: 1, inappSubject: 'Hello' });
    expect(updated.body.data.pushSubject).toBeUndefined();
    expect(await prisma.$queryRawUnsafe('SELECT id FROM admin_push_notifications')).toEqual([]);
    expect((await api().get('/notifications?inapp=true')).body.total).toBe(1);
    expect((await api('viewer').get(`/notifications/${n.id}`)).status).toBe(200);
    expect((await api('viewer').del(`/notifications/${n.id}`)).status).toBe(403);
    expect((await api().del(`/notifications/${n.id}`)).status).toBe(200);
    expect(await prisma.$queryRawUnsafe('SELECT id FROM action_text_rich_texts')).toEqual([]);
  });

  it('serves the analytics pages', async () => {
    const users = await api().get('/analytics/app-users?country=Romania');
    expect(users.status).toBe(200);
    expect(users.body.data).toMatchObject({ source: 'db', country: 'Romania' });
    expect(users.body.data.sections[0].title).toBe('Overview — Romania');
    expect(users.body.data.sections[0].blocks[0].items[0].label).toBe('All Users');
    const subs = await api('viewer').get('/analytics/subscriptions');
    expect(subs.body.data.sections[0].blocks[0].items.map((k: { label: string }) => k.label))
      .toEqual(['Total Amount Collected', 'Monthly Subscribers', 'Yearly Subscribers']);
    const ga4 = await api().get('/analytics/lessons?preset=last_7_days');
    expect(ga4.body.data).toMatchObject({ source: 'ga4', sections: [], range: { preset: 'last_7_days', days: 7 } });
    expect(ga4.body.data.unavailable.message).toContain('GA4_PROPERTY_ID');
    expect((await api().get('/analytics/nope')).status).toBe(400);
    expect((await api('sub').get('/analytics/app-users')).status).toBe(403);
  });

  it('applies the CanCan roles', async () => {
    expect((await api('viewer').get('/cities')).status).toBe(200);
    expect((await api('viewer').post('/cities', { name: 'Iasi', countryId })).status).toBe(403);
    expect((await api('sub').get('/cities')).status).toBe(403);
    expect((await api('sub').get('/app_users')).status).toBe(200);
    expect((await api('sub').get('/terms_and_conditions')).status).toBe(200);
  });
});
