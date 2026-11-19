/**
 * End-to-end tests for the Contents admin API (Countries to Lessons) against a real Postgres.
 * Needs TEST_DATABASE_URL pointing at a throwaway database; the tables are recreated.
 * Files go to an in-memory store (STORAGE_SERVICE=memory).
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';
import { MemoryObjectStore } from '../src/storage/object-store';
import { StorageService } from '../src/storage/storage.service';

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;
const DEVISE_HASH = '$2a$04$aEX3E3SpgSkH/LW7CJH.puiX6W7gGQNNJ0Z3i/qm49cfgsfih/mUO'; // "secret123"
const CONTENT_TABLES = [
  'account_block_countries', 'categories', 'sub_categories', 'categories_sub_categories', 'bx_block_profile_courses',
  'bx_block_profile_mains', 'bx_block_profile_units', 'bx_block_profile_lessons', 'active_storage_blobs',
  'active_storage_attachments', 'bx_block_profile_micro_lessons',
];

const runSql = async (prisma: PrismaClient, file: string) => {
  const ddl = readFileSync(file, 'utf8');
  for (const statement of ddl.replace(/--.*$/gm, '').split(';').map((s) => s.trim()).filter(Boolean)) {
    await prisma.$executeRawUnsafe(statement);
  }
};

describeDb('contents admin API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let store: MemoryObjectStore;
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    process.env.DATABASE_URL = DB;
    process.env.ADMIN_JWT_SECRET = 'test-secret-test-secret-test-secret';
    process.env.STORAGE_SERVICE = 'memory';
    prisma = new PrismaClient({ datasourceUrl: DB });
    await runSql(prisma, join(__dirname, 'rails-schema.sql'));
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS ${CONTENT_TABLES.join(', ')} CASCADE`);
    await runSql(prisma, join(__dirname, '..', '..', '..', 'db', 'content-schema.sql'));
    // A dependent table from a later module, to check that deletes are blocked.
    await prisma.$executeRawUnsafe(
      'CREATE TABLE bx_block_profile_micro_lessons (id bigserial PRIMARY KEY, name varchar NOT NULL, lesson_id bigint NOT NULL, unit_id bigint, main_id bigint, course_id bigint, category_id bigint, sub_category_id bigint, country_id bigint)',
    );
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
    store = app.get(StorageService).store as MemoryObjectStore;
    for (const who of ['admin', 'sub', 'viewer']) {
      const res = await request(app.getHttpServer()).post('/admin/api/auth/login').send({ email: `${who}@tedix.test`, password: 'secret123' });
      if (!res.body.data?.token) throw new Error(`login failed for ${who}: ${res.status} ${JSON.stringify(res.body)}`);
      tokens[who] = res.body.data.token;
    }
  });

  afterAll(async () => {
    await app?.close();
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
      upload: (method: 'post' | 'put', url: string) => request(server)[method](`/admin/api${url}`).set(auth),
    };
  };

  const ids: Record<string, number> = {};

  it('creates countries with the Rails rules', async () => {
    const bad = await api().post('/countries', { name: 'X', alpha2: 'ind', alpha3: 'IN', countryCode: '12345' }).expect(422);
    expect(bad.body.errors).toEqual({
      name: ['Name is too short (minimum is 2 characters)'],
      alpha2: ['Alpha2 must contain exactly 2 uppercase letters'],
      alpha3: ['Alpha3 must contain exactly 3 uppercase letters'],
      countryCode: ['Code must contain only numbers and be between 1 to 4 digits'],
    });
    const india = await api().post('/countries', { name: '  India ', alpha2: 'in', alpha3: 'ind', countryCode: '91' }).expect(201);
    expect(india.body.data).toMatchObject({ name: 'India', alpha2: 'IN', alpha3: 'IND', countryCode: '91' });
    ids.india = india.body.data.id;
    const dup = await api().post('/countries', { name: 'india', alpha2: 'IN', alpha3: 'XYZ', countryCode: '1' }).expect(422);
    expect(dup.body.errors).toEqual({ name: ['Name has already been taken'], alpha2: ['Alpha2 has already been taken'] });
    ids.france = (await api().post('/countries', { name: 'France', alpha2: 'FR', alpha3: 'FRA', countryCode: '33' }).expect(201)).body.data.id;
  });

  it('orders grades within their country and attaches the default icon', async () => {
    const g6 = await api().post('/grades', { name: 'Grade 6', countryId: ids.india }).expect(201);
    const g7 = await api().post('/grades', { name: 'Grade 7', countryId: ids.india }).expect(201);
    const fr = await api().post('/grades', { name: 'Grade 6', countryId: ids.france }).expect(201);
    expect([g6.body.data.position, g7.body.data.position, fr.body.data.position]).toEqual([1, 2, 1]);
    expect(g6.body.data.image).toMatchObject({ filename: 'grade_icon.jpeg', contentType: 'image/jpeg' });
    expect(g6.body.data.image.url).toMatch(/^memory:\/\//);
    expect(g6.body.data.path).toBe('India');
    Object.assign(ids, { g6: g6.body.data.id, g7: g7.body.data.id, frG6: fr.body.data.id });
    const dup = await api().post('/grades', { name: 'grade 6', countryId: ids.india }).expect(422);
    expect(dup.body.errors.name).toEqual(['Name has already been taken for this country']);
    const list = await api().get(`/grades?countryId=${ids.india}&sort=position`).expect(200);
    expect(list.body.data.map((g: any) => g.name)).toEqual(['Grade 6', 'Grade 7']);
    expect(list.body.data[0].countryName).toBe('India');
  });

  it('needs grades from the same country for a subject', async () => {
    const none = await api().post('/subjects', { name: 'Maths', countryId: ids.india }).expect(422);
    expect(none.body.errors.gradeIds).toEqual(['Grades must exist']);
    const wrong = await api().post('/subjects', { name: 'Maths', countryId: ids.india, gradeIds: [ids.frG6] }).expect(422);
    expect(wrong.body.errors.gradeIds).toEqual(['Grades must belong to the selected country']);
    const maths = await api().post('/subjects', { name: 'Maths', countryId: ids.india, gradeIds: [ids.g6, ids.g7] }).expect(201);
    expect(maths.body.data.gradeNames).toEqual(['Grade 6', 'Grade 7']);
    ids.maths = maths.body.data.id;
    ids.science = (await api().post('/subjects', { name: 'Science', countryId: ids.india, gradeIds: [ids.g7] }).expect(201)).body.data.id;
    const inG6 = await api().get(`/subjects?gradeId=${ids.g6}`).expect(200);
    expect(inG6.body.data.map((s: any) => s.name)).toEqual(['Maths']);
  });

  it('builds masters, mains, units and lessons with ancestors copied from the parent', async () => {
    const wrong = await api().post('/masters', { name: 'Algebra', countryId: ids.india, gradeId: ids.g6, subjectId: ids.science }).expect(422);
    expect(wrong.body.errors.subjectId).toEqual(['Subject is not taught in the selected grade']);
    const algebra = await api().post('/masters', { name: 'Algebra', countryId: ids.india, gradeId: ids.g6, subjectId: ids.maths }).expect(201);
    ids.algebra = algebra.body.data.id;
    const main = await api().post('/mains', { name: 'Equations', masterId: ids.algebra }).expect(201);
    expect(main.body.data).toMatchObject({ countryId: ids.india, gradeId: ids.g6, subjectId: ids.maths, masterId: ids.algebra });
    expect(main.body.data.path).toBe('India / Grade 6 / Maths / Algebra');
    ids.main = main.body.data.id;
    ids.unit = (await api().post('/units', { name: 'Linear', mainId: ids.main }).expect(201)).body.data.id;
    const badLesson = await api().post('/lessons', { name: 'Intro', unitId: ids.unit, startDate: '2026-12-10', endDate: '2026-12-01' }).expect(422);
    expect(badLesson.body.errors).toEqual({ endDate: ['End date must be after start date'] });
    const missing = await api().post('/lessons', { name: 'Intro', unitId: ids.unit }).expect(422);
    expect(missing.body.errors).toEqual({ startDate: ['Start date must be set'], endDate: ['End date must be set'] });
    const l1 = await api().post('/lessons', { name: 'Intro', unitId: ids.unit, startDate: '2026-12-01', endDate: '2026-12-10', isUpgraded: 'true' }).expect(201);
    expect(l1.body.data).toMatchObject({ startDate: '2026-12-01', endDate: '2026-12-10', isUpgraded: true, lessonNumber: 1, position: 1, mainId: ids.main });
    ids.l1 = l1.body.data.id;
    ids.l2 = (await api().post('/lessons', { name: 'Practice', unitId: ids.unit, startDate: '2026-12-01', endDate: '2026-12-02' }).expect(201)).body.data.id;
    ids.l3 = (await api().post('/lessons', { name: 'Test', unitId: ids.unit, startDate: '2026-12-01', endDate: '2026-12-02' }).expect(201)).body.data.id;
    const unit = await api().get(`/units/${ids.unit}`).expect(200);
    expect(unit.body.data.children).toMatchObject({ level: 'lessons', data: [{ name: 'Intro' }, { name: 'Practice' }, { name: 'Test' }] });
  });

  it('moves an item like acts_as_list insert_at', async () => {
    await api().put(`/lessons/${ids.l3}/position`, { position: 1 }).expect(200);
    const unit = await api().get(`/units/${ids.unit}`).expect(200);
    expect(unit.body.data.children.data.map((l: any) => [l.name, l.position])).toEqual([['Test', 1], ['Intro', 2], ['Practice', 3]]);
  });

  it('keeps descendants in step when a master moves to another subject', async () => {
    await api().put(`/subjects/${ids.science}`, { gradeIds: [ids.g6, ids.g7] }).expect(200);
    await api().put(`/masters/${ids.algebra}`, { subjectId: ids.science }).expect(200);
    const lesson = await api().get(`/lessons/${ids.l1}`).expect(200);
    expect(lesson.body.data).toMatchObject({ subjectId: ids.science, subjectName: 'Science' });
    await api().put(`/masters/${ids.algebra}`, { subjectId: ids.maths }).expect(200);
  });

  it('checks and stores uploaded files in Active Storage', async () => {
    const bad = await api().upload('put', `/units/${ids.unit}`).attach('cheatsheetPdf', Buffer.from('hello'), { filename: 'a.txt', contentType: 'text/plain' }).expect(422);
    expect(bad.body.errors.cheatsheetPdf).toEqual(['Cheatsheet (PDF) must be a valid PDF format']);
    const ok = await api()
      .upload('put', `/units/${ids.unit}`)
      .field('name', 'Linear equations')
      .attach('cheatsheetPdf', Buffer.from('%PDF-1.4 test'), { filename: 'sheet.pdf', contentType: 'application/pdf' })
      .expect(200);
    expect(ok.body.data).toMatchObject({ name: 'Linear equations', cheatsheetPdf: { filename: 'sheet.pdf', byteSize: 13 } });
    const attachment = await prisma.storageAttachment.findFirst({ where: { recordType: 'BxBlockProfile::Unit', name: 'cheatsheet_pdf' } });
    const blob = await prisma.storageBlob.findUnique({ where: { id: attachment!.blobId } });
    expect(blob).toMatchObject({ serviceName: 'minio', filename: 'sheet.pdf' });
    expect(blob!.key).toMatch(/^[a-z0-9]{28}$/);
    expect(store.files.has(blob!.key)).toBe(true);
    await api().put(`/units/${ids.unit}`, { removeCheatsheetPdf: true }).expect(200);
    expect(store.files.has(blob!.key)).toBe(false);
  });

  it('refuses to delete while something depends on it', async () => {
    const blocked = await api().del(`/units/${ids.unit}`).expect(422);
    expect(blocked.body.errors.base).toEqual(['Cannot delete this unit because it still has lessons.']);
    await prisma.$executeRawUnsafe(`INSERT INTO bx_block_profile_micro_lessons (name, lesson_id) VALUES ('m', ${ids.l2})`);
    const usedLesson = await api().del(`/lessons/${ids.l2}`).expect(422);
    expect(usedLesson.body.errors.base).toEqual(['Cannot delete this lesson because it still has micro lessons.']);
    const before = store.files.size;
    await api().del(`/lessons/${ids.l3}`).expect(200);
    expect(store.files.size).toBe(before - 1);
    const unit = await api().get(`/units/${ids.unit}`).expect(200);
    expect(unit.body.data.children.data.map((l: any) => [l.name, l.position])).toEqual([['Intro', 1], ['Practice', 2]]);
  });

  it('deletes a grade and the subjects taught only in it', async () => {
    const g8 = (await api().post('/grades', { name: 'Grade 8', countryId: ids.india }).expect(201)).body.data.id;
    const art = (await api().post('/subjects', { name: 'Art', countryId: ids.india, gradeIds: [g8] }).expect(201)).body.data.id;
    await api().put(`/subjects/${ids.science}`, { gradeIds: [ids.g7, g8] }).expect(200);
    await api().del(`/grades/${g8}`).expect(200);
    await api().get(`/subjects/${art}`).expect(404);
    const science = await api().get(`/subjects/${ids.science}`).expect(200);
    expect(science.body.data.gradeIds).toEqual([ids.g7]);
    const blocked = await api().del(`/countries/${ids.india}`).expect(422);
    expect(blocked.body.errors.base[0]).toBe('Cannot delete this country because it still has grades, subjects, masters, mains, units, lessons.');
  });

  it('serves the tree one level at a time', async () => {
    const roots = await api().get('/contents/tree').expect(200);
    expect(roots.body).toMatchObject({ level: 'countries', data: [{ name: 'France' }, { name: 'India' }] });
    const india = roots.body.data.find((c: any) => c.name === 'India');
    const grades = await api().get(`/contents/tree?countryId=${india.filter.countryId}`).expect(200);
    expect(grades.body.data.map((g: any) => g.name)).toEqual(['Grade 6', 'Grade 7']);
    const subjects = await api().get(`/contents/tree?countryId=${ids.india}&gradeId=${ids.g6}`).expect(200);
    expect(subjects.body).toMatchObject({ level: 'subjects', data: [{ name: 'Maths' }] });
    const masters = await api().get(`/contents/tree?${new URLSearchParams(subjects.body.data[0].filter)}`).expect(200);
    expect(masters.body).toMatchObject({ level: 'masters', data: [{ name: 'Algebra' }] });
  });

  it('applies the admin roles', async () => {
    await api('sub').get('/grades').expect(200);
    await api('sub').get('/contents/tree').expect(200);
    await api('sub').post('/grades', { name: 'Grade 9', countryId: ids.india }).expect(403);
    await api('sub').get('/countries').expect(403);
    await api('viewer').get('/countries').expect(200);
    await api('viewer').del(`/lessons/${ids.l1}`).expect(403);
  });
});
