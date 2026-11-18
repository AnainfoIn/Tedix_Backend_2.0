import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;

/**
 * Small in-memory limit on failed admin sign-ins per IP and email.
 * Enough for a single API instance; move to Redis when the API runs on several instances.
 */
@Injectable()
export class LoginRateLimiter {
  private readonly failures = new Map<string, number[]>();

  assertAllowed(key: string): void {
    if (this.recent(key).length >= MAX_FAILURES) {
      throw new HttpException('Too many sign-in attempts. Try again in 15 minutes.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  recordFailure(key: string): void {
    this.failures.set(key, [...this.recent(key), Date.now()]);
  }

  reset(key: string): void {
    this.failures.delete(key);
  }

  private recent(key: string): number[] {
    const cutoff = Date.now() - WINDOW_MS;
    const list = (this.failures.get(key) ?? []).filter((time) => time > cutoff);
    if (list.length) this.failures.set(key, list);
    else this.failures.delete(key);
    return list;
  }
}
