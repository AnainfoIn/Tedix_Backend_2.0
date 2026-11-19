/**
 * End-to-end tests for the generic admin resources (the old ActiveAdmin pages that are plain
 * tables: cities, schools, languages, boosters, ...). Loads every Rails table from
 * db/rails-full-schema.sql into TEST_DATABASE_URL, which must be a throwaway database.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';

const DB = process.env.TEST_DATABASE_URL;
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

  it('applies the CanCan roles', async () => {
    expect((await api('viewer').get('/cities')).status).toBe(200);
    expect((await api('viewer').post('/cities', { name: 'Iasi', countryId })).status).toBe(403);
    expect((await api('sub').get('/cities')).status).toBe(403);
    expect((await api('sub').get('/app_users')).status).toBe(200);
    expect((await api('sub').get('/terms_and_conditions')).status).toBe(200);
  });
});
