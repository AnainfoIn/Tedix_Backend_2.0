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
  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
    } catch (error) {
      this.logger.error(`Database connection failed: ${error instanceof Error ? error.message.split('\n').pop() : error}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
