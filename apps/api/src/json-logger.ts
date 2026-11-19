import { LoggerService } from '@nestjs/common';

/**
 * One JSON line per entry ({timestamp, level, message, context}), the format Hostinger's
 * runtime log viewer reads. Used in production; development keeps Nest's coloured output.
 */
export class JsonLogger implements LoggerService {
  log(message: unknown, ...rest: unknown[]) { this.write('INFO', message, rest); }
  error(message: unknown, ...rest: unknown[]) { this.write('ERROR', message, rest); }
  warn(message: unknown, ...rest: unknown[]) { this.write('WARN', message, rest); }
  debug(message: unknown, ...rest: unknown[]) { this.write('DEBUG', message, rest); }
  verbose(message: unknown, ...rest: unknown[]) { this.write('DEBUG', message, rest); }

  private write(level: string, message: unknown, rest: unknown[]): void {
    const context = typeof rest[rest.length - 1] === 'string' ? (rest.pop() as string) : undefined;
    const stack = level === 'ERROR' && typeof rest[0] === 'string' ? rest[0] : undefined;
    const text = message instanceof Error ? message.message : typeof message === 'string' ? message : JSON.stringify(message);
    const line = JSON.stringify({ timestamp: new Date().toISOString(), level, message: text, context, stack });
    (level === 'ERROR' ? process.stderr : process.stdout).write(line + '\n');
  }
}
