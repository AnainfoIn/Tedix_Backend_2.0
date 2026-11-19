import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

/**
 * A table this module needs is not in the database yet (P2021), e.g. the Contents tables
 * before the Rails data is loaded. Answers 503 with a plain message instead of a 500.
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class MissingTableFilter implements ExceptionFilter {
  private readonly logger = new Logger('Database');

  catch(error: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (error.code === 'P2021') {
      const table = String((error.meta as { table?: string } | undefined)?.table ?? 'a table');
      this.logger.warn(`Missing table: ${table}`);
      response.status(503).json({
        statusCode: 503,
        message: `This part of the admin is not ready: the database has no ${table} table yet.`,
      });
      return;
    }
    this.logger.error(`${error.code}: ${error.message.trim().split('\n').pop()}`);
    response.status(500).json({ statusCode: 500, message: 'Internal server error' });
  }
}
