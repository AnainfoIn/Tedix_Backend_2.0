import { Body, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { parseId, parseListQuery } from '../../common/list-query';
import { AdminController } from '../admin-controller.decorator';
import { can } from '../ability/ability';
import { RequirePermission } from '../ability/require-permission.decorator';
import { AuthenticatedAdmin } from '../auth/admin-auth.guard';
import { CurrentAdmin } from '../auth/current-admin.decorator';
import { AdminUserInput, AdminUsersService } from './admin-users.service';

@AdminController('admin_users')
export class AdminUsersController {
  constructor(private readonly adminUsers: AdminUsersService) {}

  @Get()
  @RequirePermission('read', 'admin_users')
  list(@Query() query: Record<string, unknown>) {
    const twoFactor = query.twoFactorEnabled;
    return this.adminUsers.list(parseListQuery(query, ['id', 'email', 'createdAt', 'updatedAt']), {
      twoFactorEnabled: twoFactor === 'true' ? true : twoFactor === 'false' ? false : undefined,
      roleId: typeof query.roleId === 'string' && /^\d+$/.test(query.roleId) ? BigInt(query.roleId) : undefined,
    });
  }

  /** The 2FA secret and QR code are only shown to admins who can manage admin users. */
  @Get(':id')
  @RequirePermission('read', 'admin_users')
  async get(@Param('id') id: string, @CurrentAdmin() admin: AuthenticatedAdmin) {
    return { data: await this.adminUsers.get(parseId(id), can(admin.roleName, 'manage', 'admin_users')) };
  }

  @Post()
  @RequirePermission('manage', 'admin_users')
  async create(@Body() body: AdminUserInput) {
    return { data: await this.adminUsers.create(body ?? {}) };
  }

  @Put(':id')
  @RequirePermission('manage', 'admin_users')
  async update(@Param('id') id: string, @Body() body: AdminUserInput) {
    return { data: await this.adminUsers.update(parseId(id), body ?? {}) };
  }

  @Delete(':id')
  @RequirePermission('manage', 'admin_users')
  async remove(@Param('id') id: string) {
    return { data: await this.adminUsers.remove(parseId(id)) };
  }

  @Post(':id/enable_2fa')
  @RequirePermission('manage', 'admin_users')
  async enableTwoFactor(@Param('id') id: string) {
    return { data: await this.adminUsers.enableTwoFactor(parseId(id)) };
  }

  @Post(':id/disable_2fa')
  @RequirePermission('manage', 'admin_users')
  async disableTwoFactor(@Param('id') id: string) {
    return { data: await this.adminUsers.disableTwoFactor(parseId(id)) };
  }
}
