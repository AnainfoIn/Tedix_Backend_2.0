/**
 * End-to-end tests for the admin API against a real Postgres.
 * Needs TEST_DATABASE_URL pointing at a throwaway database; the tables are recreated.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import request from 'supertest';
import { currentTotp } from '../src/admin/auth/totp';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';

const DB = process.env.TEST_DATABASE_URL;
const describeDb = DB ? describe : describe.skip;

// Devise hash of "secret123" made by Ruby's bcrypt gem, as the Rails app stores it.
const DEVISE_HASH = '$2a$04$aEX3E3SpgSkH/LW7CJH.puiX6W7gGQNNJ0Z3i/qm49cfgsfih/mUO';
const TOTP_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

describeDb('admin API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let adminToken: string;
  let ids: Record<string, number>;

  beforeAll(async () => {
    process.env.DATABASE_URL = DB;
    process.env.ADMIN_JWT_SECRET = 'test-secret-test-secret-test-secret';
    prisma = new PrismaClient({ datasourceUrl: DB });
    const ddl = readFileSync(join(__dirname, 'rails-schema.sql'), 'utf8');
    for (const statement of ddl.replace(/--.*$/gm, '').split(';').map((s) => s.trim()).filter(Boolean)) {
      await prisma.$executeRawUnsafe(statement);
    }
    const now = "now()";
    await prisma.$executeRawUnsafe(
      `INSERT INTO roles (name, created_at, updated_at) VALUES ('Admin', ${now}, ${now}), ('sub_admin', ${now}, ${now}), ('Teacher', ${now}, ${now}), ('Editor', ${now}, ${now})`,
    );
    const roles = await prisma.role.findMany();
    const roleId = (name: string) => Number(roles.find((r) => r.name === name)!.id);
    await prisma.$executeRawUnsafe(
      `INSERT INTO admin_users (email, encrypted_password, role_id, created_at, updated_at) VALUES
        ('admin@tedix.test', '${DEVISE_HASH}', ${roleId('Admin')}, ${now}, ${now}),
        ('sub@tedix.test', '${DEVISE_HASH}', ${roleId('sub_admin')}, ${now}, ${now}),
        ('viewer@tedix.test', '${DEVISE_HASH}', ${roleId('Editor')}, ${now}, ${now})`,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO admin_users (email, encrypted_password, role_id, two_factor_enabled, google_secret, created_at, updated_at)
       VALUES ('otp@tedix.test', '${DEVISE_HASH}', ${roleId('Admin')}, true, '${TOTP_SECRET}', ${now}, ${now})`,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO accounts (email, role_id, created_at, updated_at) VALUES ('kid@tedix.test', ${roleId('Teacher')}, ${now}, ${now})`,
    );
    ids = { Admin: roleId('Admin'), Teacher: roleId('Teacher'), Editor: roleId('Editor'), sub_admin: roleId('sub_admin') };

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    setupApp(app, { serveAdmin: false });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  const login = (email: string, password = 'secret123') =>
    request(app.getHttpServer()).post('/admin/api/auth/login').send({ email, password });
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  it('answers the Rails-compatible health check', async () => {
    await request(app.getHttpServer()).get('/healthcheck').expect(200, 'Ok');
  });

  it('bootstraps an admin from environment variables', async () => {
    const { bootstrapAdmin } = await import('../src/prisma/bootstrap-admin');
    const { Logger } = await import('@nestjs/common');
    await bootstrapAdmin(prisma, new Logger('test'), { ADMIN_BOOTSTRAP_EMAIL: 'Boot@Tedix.test', ADMIN_BOOTSTRAP_PASSWORD: 'bootpass1' });
    await login('boot@tedix.test', 'bootpass1').expect(200);
    await bootstrapAdmin(prisma, new Logger('test'), { ADMIN_BOOTSTRAP_EMAIL: 'boot@tedix.test', ADMIN_BOOTSTRAP_PASSWORD: 'bootpass2' });
    await login('boot@tedix.test', 'bootpass2').expect(200);
    await prisma.adminUser.delete({ where: { email: 'boot@tedix.test' } });
  });

  it('reports database status without data', async () => {
    const res = await request(app.getHttpServer()).get('/healthcheck/db').expect(200);
    expect(res.body).toMatchObject({ database: 'ok', adminTablesPresent: true });
  });

  it('signs in with a password hashed by Rails/Devise', async () => {
    const res = await login(' Admin@Tedix.test ').expect(200);
    expect(res.body.data.otpRequired).toBe(false);
    expect(res.body.data.admin).toMatchObject({ email: 'admin@tedix.test', role: 'Admin' });
    adminToken = res.body.data.token;
  });

  it('rejects a wrong password and requests without a token', async () => {
    await login('admin@tedix.test', 'nope').expect(401);
    await request(app.getHttpServer()).get('/admin/api/roles').expect(401);
    await request(app.getHttpServer()).get('/admin/api/roles').set(auth('garbage')).expect(401);
  });

  it('asks for the authenticator code when 2FA is on', async () => {
    const step1 = await login('otp@tedix.test').expect(200);
    expect(step1.body.data).toEqual({ otpRequired: true, challengeToken: expect.any(String) });
    const challengeToken = step1.body.data.challengeToken;

    // The challenge token is not a session token.
    await request(app.getHttpServer()).get('/admin/api/auth/me').set(auth(challengeToken)).expect(401);
    await request(app.getHttpServer()).post('/admin/api/auth/verify-otp').send({ challengeToken, otp: '000000' }).expect(401);
    const step2 = await request(app.getHttpServer())
      .post('/admin/api/auth/verify-otp')
      .send({ challengeToken, otp: currentTotp(TOTP_SECRET) })
      .expect(200);
    expect(step2.body.data.admin.email).toBe('otp@tedix.test');
  });

  it('lists, searches and sorts roles', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/api/roles?page=1&perPage=2&sort=id&order=DESC')
      .set(auth(adminToken))
      .expect(200);
    expect(res.body.total).toBe(4);
    expect(res.body.data.map((r: { name: string }) => r.name)).toEqual(['Editor', 'Teacher']);
    const search = await request(app.getHttpServer()).get('/admin/api/roles?q=edi').set(auth(adminToken)).expect(200);
    expect(search.body.data).toHaveLength(1);
    await request(app.getHttpServer()).get('/admin/api/roles?sort=encrypted_password').set(auth(adminToken)).expect(400);
  });

  it('enforces the Rails role rules', async () => {
    await request(app.getHttpServer()).put(`/admin/api/roles/${ids.Teacher}`).set(auth(adminToken)).send({ name: 'Tutor' }).expect(422);
    await request(app.getHttpServer()).delete(`/admin/api/roles/${ids.Admin}`).set(auth(adminToken)).expect(422);
    const bad = await request(app.getHttpServer()).put(`/admin/api/roles/${ids.Editor}`).set(auth(adminToken)).send({ name: 'x1' }).expect(422);
    expect(bad.body.errors.name).toContain('Name can only contain letters and spaces');
    const ok = await request(app.getHttpServer()).put(`/admin/api/roles/${ids.Editor}`).set(auth(adminToken)).send({ name: '  Content   Editor ' }).expect(200);
    expect(ok.body.data.name).toBe('Content Editor');
  });

  it('applies sub_admin and read-only permissions', async () => {
    const sub = (await login('sub@tedix.test')).body.data.token;
    await request(app.getHttpServer()).get('/admin/api/roles').set(auth(sub)).expect(200);
    await request(app.getHttpServer()).get('/admin/api/admin_users').set(auth(sub)).expect(403);

    const viewer = (await login('viewer@tedix.test')).body.data.token;
    await request(app.getHttpServer()).get('/admin/api/admin_users').set(auth(viewer)).expect(200);
    await request(app.getHttpServer()).put(`/admin/api/roles/${ids.Editor}`).set(auth(viewer)).send({ name: 'Nope' }).expect(403);
  });

  it('creates, edits and deletes admin users with Rails validations', async () => {
    const invalid = await request(app.getHttpServer())
      .post('/admin/api/admin_users')
      .set(auth(adminToken))
      .send({ email: 'ADMIN@tedix.test', roleId: ids.Teacher, password: 'abc', passwordConfirmation: 'abd' })
      .expect(422);
    expect(invalid.body.errors.email).toContain('Email has already been taken');
    expect(invalid.body.errors.roleId).toContain('Role must be Admin');
    expect(invalid.body.errors.password).toContain('Password is too short (minimum is 6 characters)');

    const created = await request(app.getHttpServer())
      .post('/admin/api/admin_users')
      .set(auth(adminToken))
      .send({ email: 'New@Tedix.test', roleId: ids.Admin, password: 'newpass1', passwordConfirmation: 'newpass1' })
      .expect(201);
    const id = created.body.data.id;
    expect(created.body.data.email).toBe('new@tedix.test');
    expect(created.body.data).not.toHaveProperty('encryptedPassword');
    const stored = await prisma.adminUser.findUniqueOrThrow({ where: { id: BigInt(id) } });
    expect(stored.encryptedPassword).toMatch(/^\$2[aby]\$12\$/);

    const newToken = (await login('new@tedix.test', 'newpass1').expect(200)).body.data.token;
    await request(app.getHttpServer())
      .put(`/admin/api/admin_users/${id}`)
      .set(auth(adminToken))
      .send({ password: 'changed1', passwordConfirmation: 'changed1' })
      .expect(200);
    // Changing the password signs that admin out.
    await request(app.getHttpServer()).get('/admin/api/auth/me').set(auth(newToken)).expect(401);

    const enabled = await request(app.getHttpServer()).post(`/admin/api/admin_users/${id}/enable_2fa`).set(auth(adminToken)).expect(201);
    expect(enabled.body.data.twoFactorSetup.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(enabled.body.data.twoFactorSetup.qrCodeSvg).toContain('<svg');
    expect((await login('new@tedix.test', 'changed1')).body.data.otpRequired).toBe(true);

    await request(app.getHttpServer()).delete(`/admin/api/admin_users/${id}`).set(auth(adminToken)).expect(200);
  });

  it('shows dashboard numbers', async () => {
    const res = await request(app.getHttpServer()).get('/admin/api/dashboard').set(auth(adminToken)).expect(200);
    expect(res.body.data).toEqual({ adminUsers: 4, roles: 4, appAccounts: 1 });
  });

  it('refuses to delete a role still used by accounts', async () => {
    await prisma.$executeRawUnsafe(`UPDATE roles SET name = 'Old Teacher' WHERE id = ${ids.Teacher}`);
    await request(app.getHttpServer()).delete(`/admin/api/roles/${ids.Teacher}`).set(auth(adminToken)).expect(422);
  });
});
