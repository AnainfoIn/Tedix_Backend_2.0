import { Controller, Get, Header, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../common/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Same contract as the Rails `/healthcheck` route: plain text "Ok". */
  @Public()
  @Get('healthcheck')
  @Header('Content-Type', 'text/plain')
  check(): string {
    return 'Ok';
  }

  /**
   * Database check for deployments: says whether the database answers, how many tables it
   * has, and whether the admin tables exist. No data or connection details are returned.
   */
  @Public()
  @Get('healthcheck/db')
  async database() {
    try {
      const rows = await this.prisma.$queryRaw<{ tables: bigint; admin_tables: bigint }[]>`
        SELECT COUNT(*)::bigint AS tables,
               COUNT(*) FILTER (WHERE table_name IN ('admin_users', 'roles'))::bigint AS admin_tables
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`;
      return {
        database: 'ok',
        tables: Number(rows[0]?.tables ?? 0),
        adminTablesPresent: Number(rows[0]?.admin_tables ?? 0) === 2,
      };
    } catch {
      throw new ServiceUnavailableException({ database: 'unreachable' });
    }
  }
}
