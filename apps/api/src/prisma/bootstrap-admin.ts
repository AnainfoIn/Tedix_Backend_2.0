import { Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../admin/auth/password';

/**
 * One-time setup for a new server, driven by environment variables:
 *   ADMIN_BOOTSTRAP_EMAIL / ADMIN_BOOTSTRAP_PASSWORD
 * Creates the admin tables if the database is empty (same definitions as Rails and
 * db/init/01-admin-schema.sql), the Admin role if missing, and creates or resets that admin.
 * Remove the variables once the admin can sign in.
 */
export async function bootstrapAdmin(prisma: PrismaClient, logger: Logger, env = process.env): Promise<void> {
  const email = env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const password = env.ADMIN_BOOTSTRAP_PASSWORD;
  if (!email || !password) return;

  const statements = [
    `CREATE TABLE IF NOT EXISTS roles (
       id bigserial PRIMARY KEY,
       name character varying NOT NULL,
       created_at timestamp(6) without time zone NOT NULL,
       updated_at timestamp(6) without time zone NOT NULL)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS index_roles_on_name ON roles (name)`,
    `CREATE TABLE IF NOT EXISTS admin_users (
       id bigserial PRIMARY KEY,
       email character varying NOT NULL,
       encrypted_password character varying NOT NULL,
       reset_password_token character varying,
       reset_password_sent_at timestamp without time zone,
       remember_created_at timestamp without time zone,
       created_at timestamp(6) without time zone NOT NULL,
       updated_at timestamp(6) without time zone NOT NULL,
       role_id bigint NOT NULL,
       google_secret character varying,
       two_factor_enabled boolean DEFAULT false,
       mfa_secret character varying)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS index_admin_users_on_email ON admin_users (email)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS index_admin_users_on_reset_password_token ON admin_users (reset_password_token)`,
    `CREATE TABLE IF NOT EXISTS accounts (
       id bigserial PRIMARY KEY,
       email character varying,
       role_id integer,
       created_at timestamp(6) without time zone NOT NULL,
       updated_at timestamp(6) without time zone NOT NULL)`,
  ];
  for (const sql of statements) await prisma.$executeRawUnsafe(sql);

  const role =
    (await prisma.role.findFirst({ where: { name: { equals: 'Admin', mode: 'insensitive' } } })) ??
    (await prisma.role.create({ data: { name: 'Admin' } }));
  const encryptedPassword = await hashPassword(password);
  await prisma.adminUser.upsert({
    where: { email },
    create: { email, encryptedPassword, roleId: role.id },
    update: { encryptedPassword, roleId: role.id },
  });
  logger.log(`Admin bootstrap done for ${email}. Remove ADMIN_BOOTSTRAP_PASSWORD from the environment.`);
}
