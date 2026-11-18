import { Get } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminController } from '../admin-controller.decorator';
import { RequirePermission } from '../ability/require-permission.decorator';

/** Headline numbers for the admin home page. Grows as modules are migrated. */
@AdminController('dashboard')
export class DashboardController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermission('read', 'dashboard')
  async summary() {
    const [adminUsers, roles, accounts] = await Promise.all([
      this.prisma.adminUser.count(),
      this.prisma.role.count(),
      this.prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*)::bigint AS n FROM accounts`,
    ]);
    return { data: { adminUsers, roles, appAccounts: Number(accounts[0]?.n ?? 0) } };
  }
}
