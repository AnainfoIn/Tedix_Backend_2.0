import { applyDecorators, Controller, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from './auth/admin-auth.guard';

/** Every admin API route lives under /admin/api and needs a signed-in admin. */
export const ADMIN_API_PREFIX = 'admin/api';

export const AdminController = (path: string) =>
  applyDecorators(Controller(`${ADMIN_API_PREFIX}/${path}`), UseGuards(AdminAuthGuard));
