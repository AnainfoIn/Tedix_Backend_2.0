import { Module } from '@nestjs/common';
import { AdminUsersController } from './admin-users/admin-users.controller';
import { AdminUsersService } from './admin-users/admin-users.service';
import { AdminAuthController } from './auth/admin-auth.controller';
import { AdminAuthGuard } from './auth/admin-auth.guard';
import { AdminAuthService } from './auth/admin-auth.service';
import { AdminTokenService } from './auth/admin-token.service';
import { LoginRateLimiter } from './auth/login-rate-limiter';
import { DashboardController } from './dashboard/dashboard.controller';
import { RolesController } from './roles/roles.controller';
import { RolesService } from './roles/roles.service';

/** Admin panel API (replaces ActiveAdmin). Each migrated module adds its admin controllers here. */
@Module({
  controllers: [AdminAuthController, DashboardController, RolesController, AdminUsersController],
  providers: [AdminTokenService, AdminAuthGuard, AdminAuthService, LoginRateLimiter, RolesService, AdminUsersService],
})
export class AdminModule {}
