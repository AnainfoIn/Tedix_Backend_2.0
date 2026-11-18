import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import * as jwt from 'jsonwebtoken';
import { APP_ENV } from '../../config/env.module';
import { AppEnv } from '../../config/env';

type TokenType = 'admin' | 'admin_2fa';

interface AdminClaims {
  sub: string;
  typ: TokenType;
  /** Fingerprint of the password hash: changing the password signs the admin out everywhere. */
  pv: string;
}

const CHALLENGE_TTL_SECONDS = 5 * 60;

/**
 * Admin panel tokens. These are separate from the mobile app's tokens (which use
 * SECRET_KEY_BASE and HS512 for Rails compatibility) and never valid for the app API.
 */
@Injectable()
export class AdminTokenService {
  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  static passwordVersion(encryptedPassword: string): string {
    return createHash('sha256').update(encryptedPassword).digest('hex').slice(0, 16);
  }

  issueSession(adminId: bigint, encryptedPassword: string): { token: string; expiresAt: string } {
    const ttl = this.env.adminJwtTtlHours * 3600;
    const token = this.sign('admin', adminId, encryptedPassword, ttl);
    return { token, expiresAt: new Date(Date.now() + ttl * 1000).toISOString() };
  }

  issueChallenge(adminId: bigint, encryptedPassword: string): string {
    return this.sign('admin_2fa', adminId, encryptedPassword, CHALLENGE_TTL_SECONDS);
  }

  /** Returns the claims, or null when the token is missing, invalid, expired or of another type. */
  verify(token: string | undefined, type: TokenType): AdminClaims | null {
    if (!token) return null;
    try {
      const claims = jwt.verify(token, this.env.adminJwtSecret, {
        algorithms: ['HS256'],
        audience: 'tedix-admin',
      }) as AdminClaims;
      return claims.typ === type && /^\d+$/.test(claims.sub) ? claims : null;
    } catch {
      return null;
    }
  }

  private sign(typ: TokenType, adminId: bigint, encryptedPassword: string, ttlSeconds: number): string {
    const claims: AdminClaims = {
      sub: adminId.toString(),
      typ,
      pv: AdminTokenService.passwordVersion(encryptedPassword),
    };
    return jwt.sign(claims, this.env.adminJwtSecret, {
      algorithm: 'HS256',
      audience: 'tedix-admin',
      expiresIn: ttlSeconds,
    });
  }
}
