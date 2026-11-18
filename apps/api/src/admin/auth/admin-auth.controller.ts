import { Body, Get, HttpCode, Ip, Post } from '@nestjs/common';
import { Public } from '../../common/public.decorator';
import { AdminController } from '../admin-controller.decorator';
import { AdminAuthService } from './admin-auth.service';
import { AuthenticatedAdmin } from './admin-auth.guard';
import { CurrentAdmin } from './current-admin.decorator';

@AdminController('auth')
export class AdminAuthController {
  constructor(private readonly auth: AdminAuthService) {}

  /** Step 1: email + password. Returns a session, or a short-lived challenge when 2FA is on. */
  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: { email?: unknown; password?: unknown }, @Ip() ip: string) {
    return { data: await this.auth.login(body?.email, body?.password, ip) };
  }

  /** Step 2 (only when 2FA is on): the 6-digit authenticator code. */
  @Public()
  @Post('verify-otp')
  @HttpCode(200)
  async verifyOtp(@Body() body: { challengeToken?: unknown; otp?: unknown }) {
    return { data: await this.auth.verifyOtp(body?.challengeToken, body?.otp) };
  }

  @Get('me')
  async me(@CurrentAdmin() admin: AuthenticatedAdmin) {
    return { data: await this.auth.me(admin.id) };
  }
}
