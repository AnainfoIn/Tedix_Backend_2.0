/**
 * Creates or resets an admin user from the command line.
 *
 *   npm run admin:create -- admin@example.com 'Password1'
 *
 * Uses the existing "Admin" role (creates it only if missing). The password is stored
 * as a Devise-compatible bcrypt hash, so it also works in the Rails ActiveAdmin.
 */
import { PrismaClient } from '@prisma/client';
import { hashPassword, passwordErrors } from '../admin/auth/password';

async function main(): Promise<void> {
  const [emailArg, password] = process.argv.slice(2);
  const email = (emailArg ?? '').trim().toLowerCase();
  if (!email || !password) {
    throw new Error("Usage: npm run admin:create -- <email> '<password>'");
  }
  const errors = passwordErrors(password, password);
  if (errors.length) throw new Error(errors.join(', '));

  const prisma = new PrismaClient();
  try {
    const role =
      (await prisma.role.findFirst({ where: { name: { equals: 'Admin', mode: 'insensitive' } } })) ??
      (await prisma.role.create({ data: { name: 'Admin' } }));
    const encryptedPassword = await hashPassword(password);
    const admin = await prisma.adminUser.upsert({
      where: { email },
      create: { email, encryptedPassword, roleId: role.id },
      update: { encryptedPassword },
    });
    console.log(`Admin user ready: ${admin.email} (id ${admin.id})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
