import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Prisma');

  /**
   * Connects at startup, but keeps the app running when the database is unreachable
   * (for example before DATABASE_URL is set on a new server): /healthcheck still answers,
   * and Prisma retries the connection on the next query.
   */
  onModuleInit(): void {
    // Not awaited: the server must call listen() quickly (Hostinger allows ~3 s), and an
    // unreachable database would hold startup until the connection times out.
    this.$connect().then(
      () => this.logger.log('Database connected'),
      (error: unknown) =>
        this.logger.error(`Database connection failed: ${error instanceof Error ? error.message.split('\n').pop() : error}`),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
