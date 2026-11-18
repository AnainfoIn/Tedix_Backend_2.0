import { SetMetadata } from '@nestjs/common';
import { AdminAction } from './ability';

export const PERMISSION_KEY = 'adminPermission';

export interface RequiredPermission {
  action: AdminAction;
  resource: string;
}

/** Declares which permission a route needs; checked by AdminAuthGuard. */
export const RequirePermission = (action: AdminAction, resource: string) =>
  SetMetadata(PERMISSION_KEY, { action, resource } satisfies RequiredPermission);
