import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedAdmin } from './admin-auth.guard';

/** The signed-in admin user, set by AdminAuthGuard. */
export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedAdmin => ctx.switchToHttp().getRequest().admin,
);
