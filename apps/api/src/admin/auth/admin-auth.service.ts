import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { permissionsFor } from '../ability/ability';
import { AdminTokenService } from './admin-token.service';
import { LoginRateLimiter } from './login-rate-limiter';
import { verifyPassword } from './password';
import { verifyTotp } from './totp';

const INVALID_LOGIN = 'Invalid email or password';

export type LoginResult =
  | { otpRequired: true; challengeToken: string }
  | { otpRequired: false; token: string; expiresAt: string; admin: AdminProfile };

export interface AdminProfile {
  id: bigint;
  email: string;
  role: string;
  twoFactorEnabled: boolean;
  permissions: ReturnType<typeof permissionsFor>;
}

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: AdminTokenService,
    private readonly limiter: LoginRateLimiter,
  ) {}

  async login(emailInput: unknown, password: unknown, ip: string): Promise<LoginResult> {
    const email = typeof emailInput === 'string' ? emailInput.trim().toLowerCase() : '';
    const limitKey = `login:${ip}:${email}`;
    this.limiter.assertAllowed(limitKey);

    const admin = email
      ? await this.prisma.adminUser.findUnique({ where: { email }, include: { role: true } })
      : null;
    const ok = admin && typeof password === 'string' && (await verifyPassword(password, admin.encryptedPassword));
    if (!admin || !ok) {
      this.limiter.recordFailure(limitKey);
      throw new UnauthorizedException(INVALID_LOGIN);
    }
    this.limiter.reset(limitKey);

    // Same rule as Rails: 2FA is asked only when it is enabled and a secret exists.
    if (admin.twoFactorEnabled && admin.googleSecret) {
      return { otpRequired: true, challengeToken: this.tokens.issueChallenge(admin.id, admin.encryptedPassword) };
    }
    return { otpRequired: false, ...this.tokens.issueSession(admin.id, admin.encryptedPassword), admin: this.profile(admin) };
  }

  async verifyOtp(challengeToken: unknown, otp: unknown): Promise<LoginResult> {
    const claims = this.tokens.verify(typeof challengeToken === 'string' ? challengeToken : undefined, 'admin_2fa');
    if (!claims) throw new UnauthorizedException('Your sign-in expired. Please sign in again.');

    const limitKey = `otp:${claims.sub}`;
    this.limiter.assertAllowed(limitKey);

    const admin = await this.prisma.adminUser.findUnique({ where: { id: BigInt(claims.sub) }, include: { role: true } });
    if (!admin || AdminTokenService.passwordVersion(admin.encryptedPassword) !== claims.pv) {
      throw new UnauthorizedException('Your sign-in expired. Please sign in again.');
    }
    if (!verifyTotp(String(otp ?? '').trim(), admin.googleSecret)) {
      this.limiter.recordFailure(limitKey);
      throw new UnauthorizedException('Invalid OTP code. Please try again.');
    }
    this.limiter.reset(limitKey);
    return { otpRequired: false, ...this.tokens.issueSession(admin.id, admin.encryptedPassword), admin: this.profile(admin) };
  }

  async me(adminId: bigint): Promise<AdminProfile> {
    const admin = await this.prisma.adminUser.findUniqueOrThrow({ where: { id: adminId }, include: { role: true } });
    return this.profile(admin);
  }

  private profile(admin: {
    id: bigint;
    email: string;
    twoFactorEnabled: boolean | null;
    googleSecret: string | null;
    role: { name: string };
  }): AdminProfile {
    return {
      id: admin.id,
      email: admin.email,
      role: admin.role.name,
      twoFactorEnabled: Boolean(admin.twoFactorEnabled && admin.googleSecret),
      permissions: permissionsFor(admin.role.name),
    };
  }
}
