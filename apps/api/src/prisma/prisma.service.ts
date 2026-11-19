import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { bootstrapAdmin } from './bootstrap-admin';

const CHECK_INTERVAL_MS = 5 * 60 * 1000;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Prisma');
  private timer?: NodeJS.Timeout;
  private lastState?: 'connected' | 'failed';
  private bootstrapped = false;

  /**
   * Checks the database at startup and every 5 minutes, logging only when the state changes,
   * so the server logs show when the database becomes reachable or is lost.
   * Not awaited: the server must call listen() quickly (Hostinger allows ~3 s), and an
   * unreachable database would hold startup until the connection times out.
   */
  onModuleInit(): void {
    void this.check();
    this.timer = setInterval(() => void this.check(), CHECK_INTERVAL_MS);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.$disconnect();
  }

  private async check(): Promise<void> {
    try {
      await this.$queryRaw`SELECT 1`;
      if (this.lastState !== 'connected') this.logger.log('Database connected');
      this.lastState = 'connected';
      if (!this.bootstrapped) {
        this.bootstrapped = true;
        await bootstrapAdmin(this, this.logger).catch((error: unknown) =>
          this.logger.error(`Admin bootstrap failed: ${error instanceof Error ? error.message : error}`),
        );
      }
    } catch (error) {
      if (this.lastState !== 'failed') {
        const message = error instanceof Error ? error.message.trim().split('\n').pop() : String(error);
        this.logger.error(`Database connection failed: ${message}`);
      }
      this.lastState = 'failed';
    }
  }
}
