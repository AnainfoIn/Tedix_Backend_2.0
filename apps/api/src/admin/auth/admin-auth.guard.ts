import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../../common/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { can } from '../ability/ability';
import { PERMISSION_KEY, RequiredPermission } from '../ability/require-permission.decorator';
import { AdminTokenService } from './admin-token.service';

export interface AuthenticatedAdmin {
  id: bigint;
  email: string;
  roleName: string;
}

/**
 * Checks the `Authorization: Bearer <token>` header on admin routes, reloads the admin
 * from the database (so deleted admins and role changes take effect at once), and
 * enforces @RequirePermission.
 */
@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: AdminTokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const request = context.switchToHttp().getRequest<Request & { admin?: AuthenticatedAdmin }>();
    const header = request.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : undefined;
    const claims = this.tokens.verify(token, 'admin');
    if (!claims) throw new UnauthorizedException('Please sign in again');

    const admin = await this.prisma.adminUser.findUnique({
      where: { id: BigInt(claims.sub) },
      include: { role: true },
    });
    if (!admin || AdminTokenService.passwordVersion(admin.encryptedPassword) !== claims.pv) {
      throw new UnauthorizedException('Please sign in again');
    }
    request.admin = { id: admin.id, email: admin.email, roleName: admin.role.name };

    const required = this.reflector.getAllAndOverride<RequiredPermission | undefined>(PERMISSION_KEY, targets);
    if (required && !can(admin.role.name, required.action, required.resource)) {
      throw new ForbiddenException('You are not authorized to perform this action');
    }
    return true;
  }
}
