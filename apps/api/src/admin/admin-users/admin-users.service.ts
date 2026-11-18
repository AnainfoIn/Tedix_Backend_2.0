import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppEnv } from '../../config/env';
import { APP_ENV } from '../../config/env.module';
import { ListQuery } from '../../common/list-query';
import { baseError, FieldErrors, throwIfErrors } from '../../common/validation-error';
import { PrismaService } from '../../prisma/prisma.service';
import { hashPassword, passwordErrors } from '../auth/password';
import { generateTotpSecret, provisioningUri, qrCodeSvg } from '../auth/totp';

const EMAIL_FORMAT = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
/** The Rails form only offers the "Admin" role for admin users. */
const ADMIN_ROLE_NAME = 'admin';

export interface AdminUserInput {
  email?: unknown;
  roleId?: unknown;
  password?: unknown;
  passwordConfirmation?: unknown;
}

const publicSelect = {
  id: true,
  email: true,
  roleId: true,
  twoFactorEnabled: true,
  createdAt: true,
  updatedAt: true,
  role: { select: { id: true, name: true } },
} satisfies Prisma.AdminUserSelect;

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  async list(query: ListQuery, filters: { twoFactorEnabled?: boolean; roleId?: bigint }) {
    const where: Prisma.AdminUserWhereInput = {
      ...(query.q ? { email: { contains: query.q, mode: 'insensitive' } } : {}),
      ...(filters.twoFactorEnabled !== undefined ? { twoFactorEnabled: filters.twoFactorEnabled } : {}),
      ...(filters.roleId !== undefined ? { roleId: filters.roleId } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.adminUser.findMany({
        where,
        select: publicSelect,
        skip: query.skip,
        take: query.take,
        orderBy: { [query.sortField]: query.sortOrder },
      }),
      this.prisma.adminUser.count({ where }),
    ]);
    return { data, total };
  }

  async get(id: bigint, withTwoFactorSetup = false) {
    const admin = await this.prisma.adminUser.findUnique({
      where: { id },
      select: { ...publicSelect, googleSecret: true },
    });
    if (!admin) throw new NotFoundException('Admin user not found');
    const { googleSecret, ...rest } = admin;
    if (!withTwoFactorSetup || !rest.twoFactorEnabled || !googleSecret) return rest;
    const uri = provisioningUri(this.env.admin2faIssuer, rest.email, googleSecret);
    return { ...rest, twoFactorSetup: { secret: googleSecret, qrCodeSvg: await qrCodeSvg(uri) } };
  }

  async create(input: AdminUserInput) {
    const { email, roleId, errors } = await this.validate(input, null);
    errors.password = passwordErrors(input.password, input.passwordConfirmation);
    throwIfErrors(errors);
    const created = await this.prisma.adminUser.create({
      data: { email, roleId: roleId!, encryptedPassword: await hashPassword(String(input.password)) },
      select: { id: true },
    });
    return this.get(created.id);
  }

  async update(id: bigint, input: AdminUserInput) {
    const current = await this.get(id);
    const { email, roleId, errors } = await this.validate(input, current);
    const changingPassword = typeof input.password === 'string' && input.password.length > 0;
    if (changingPassword) errors.password = passwordErrors(input.password, input.passwordConfirmation);
    throwIfErrors(errors);
    await this.prisma.adminUser.update({
      where: { id },
      data: {
        email,
        roleId: roleId!,
        ...(changingPassword ? { encryptedPassword: await hashPassword(String(input.password)) } : {}),
      },
    });
    return this.get(id);
  }

  async remove(id: bigint) {
    const admin = await this.get(id);
    const others = await this.prisma.adminUser.count({ where: { NOT: { id } } });
    if (others === 0) baseError('Admin user could not be destroyed.');
    await this.prisma.adminUser.delete({ where: { id } });
    return admin;
  }

  /** Same as Rails `enable_2fa!`: keeps an existing secret or creates one. */
  async enableTwoFactor(id: bigint) {
    const admin = await this.prisma.adminUser.findUnique({ where: { id }, select: { googleSecret: true } });
    if (!admin) throw new NotFoundException('Admin user not found');
    await this.prisma.adminUser.update({
      where: { id },
      data: { twoFactorEnabled: true, googleSecret: admin.googleSecret || generateTotpSecret() },
    });
    return this.get(id, true);
  }

  /** Same as Rails `disable_2fa!`. */
  async disableTwoFactor(id: bigint) {
    await this.get(id);
    await this.prisma.adminUser.update({ where: { id }, data: { twoFactorEnabled: false, googleSecret: null } });
    return this.get(id);
  }

  private async validate(input: AdminUserInput, current: { id: bigint; email: string; roleId: bigint } | null) {
    const errors: FieldErrors = { email: [], roleId: [] };

    const email =
      input.email === undefined && current ? current.email : typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    if (!email) errors.email.push("Email can't be blank");
    else {
      if (email.length > 60) errors.email.push('Email is too long (maximum is 60 characters)');
      if (!EMAIL_FORMAT.test(email)) errors.email.push('Email must be a valid email address');
      const clash = await this.prisma.adminUser.findFirst({
        where: { email: { equals: email, mode: 'insensitive' }, ...(current ? { NOT: { id: current.id } } : {}) },
      });
      if (clash) errors.email.push('Email has already been taken');
    }

    let roleId: bigint | null = current?.roleId ?? null;
    if (input.roleId !== undefined && input.roleId !== null && input.roleId !== '') {
      roleId = /^\d+$/.test(String(input.roleId)) ? BigInt(String(input.roleId)) : null;
      const role = roleId ? await this.prisma.role.findUnique({ where: { id: roleId } }) : null;
      if (!role) errors.roleId.push('Role must exist');
      else if (role.name.toLowerCase() !== ADMIN_ROLE_NAME) errors.roleId.push('Role must be Admin');
    } else if (!roleId) {
      errors.roleId.push('Role must exist');
    }
    return { email, roleId, errors };
  }
}
