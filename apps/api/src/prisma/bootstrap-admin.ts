import { Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../admin/auth/password';

/**
 * One-time setup for a new server, driven by environment variables:
 *   ADMIN_BOOTSTRAP_EMAIL / ADMIN_BOOTSTRAP_PASSWORD
 * Creates the Admin role if missing, and creates or resets that admin. Tables are never
 * created here: they come from the Rails database.
 * Remove the variables once the admin can sign in.
 */
export async function bootstrapAdmin(prisma: PrismaClient, logger: Logger, env = process.env): Promise<void> {
  const email = env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const password = env.ADMIN_BOOTSTRAP_PASSWORD;
  if (!email && !password) return;
  if (!email || !password) {
    logger.warn('Admin bootstrap skipped: set both ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD.');
    return;
  }
  logger.log(`Admin bootstrap: setting up ${email}`);

  // Never create tables here: the database comes from the Rails app (a restore of its dump).
  // Tables made here earlier clashed with that restore.
  const tables = await prisma.$queryRaw<{ name: string }[]>`
    SELECT table_name AS name FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_name IN ('roles', 'admin_users')`;
  if (tables.length < 2) {
    logger.warn('Admin bootstrap skipped: the roles and admin_users tables are not in the database yet. Restore the Rails database first.');
    return;
  }

  const role =
    (await prisma.role.findFirst({ where: { name: { equals: 'Admin', mode: 'insensitive' } } })) ??
    (await prisma.role.create({ data: { name: 'Admin' } }));
  const encryptedPassword = await hashPassword(password);
  const data = { encryptedPassword, roleId: role.id };
  try {
    await prisma.adminUser.upsert({ where: { email }, create: { email, ...data }, update: data });
  } catch (error) {
    // Two app processes can start together and race to create the same admin: the loser updates.
    if ((error as { code?: string }).code !== 'P2002') throw error;
    await prisma.adminUser.update({ where: { email }, data });
  }
  logger.log(`Admin bootstrap done for ${email}. Remove ADMIN_BOOTSTRAP_PASSWORD from the environment.`);
}
