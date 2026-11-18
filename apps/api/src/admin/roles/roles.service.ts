import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ListQuery } from '../../common/list-query';
import { baseError, throwIfErrors } from '../../common/validation-error';
import { PrismaService } from '../../prisma/prisma.service';

/** Same rules as BxBlockRolesPermissions::Role in Rails. */
export const PROTECTED_ROLE_NAMES = ['Admin', 'Teacher', 'Student'];

export function normalizeRoleName(name: unknown): string {
  return typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : '';
}

export function roleNameErrors(name: string): string[] {
  if (!name) return ["Name can't be blank"];
  const errors: string[] = [];
  if (name.length < 2) errors.push('Name is too short (minimum is 2 characters)');
  if (name.length > 20) errors.push('Name is too long (maximum is 20 characters)');
  if (!/^[a-zA-Z ]+$/.test(name)) errors.push('Name can only contain letters and spaces');
  return errors;
}

const isProtected = (name: string) => PROTECTED_ROLE_NAMES.some((p) => p.toLowerCase() === name.toLowerCase());

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListQuery) {
    const where: Prisma.RoleWhereInput = query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {};
    const [data, total] = await this.prisma.$transaction([
      this.prisma.role.findMany({ where, skip: query.skip, take: query.take, orderBy: { [query.sortField]: query.sortOrder } }),
      this.prisma.role.count({ where }),
    ]);
    return { data, total };
  }

  async get(id: bigint) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  async update(id: bigint, input: { name?: unknown }) {
    const role = await this.get(id);
    const name = normalizeRoleName(input.name);
    const errors = roleNameErrors(name);
    if (!errors.length && name.toLowerCase() !== role.name.toLowerCase()) {
      const clash = await this.prisma.role.findFirst({
        where: { name: { equals: name, mode: 'insensitive' }, NOT: { id } },
      });
      if (clash) errors.push('Name has already been taken');
    }
    throwIfErrors({ name: errors });
    if (name !== role.name && isProtected(role.name)) baseError('Role could not be renamed.');
    return this.prisma.role.update({ where: { id }, data: { name } });
  }

  async remove(id: bigint) {
    const role = await this.get(id);
    if (isProtected(role.name)) baseError('Role could not be destroyed.');
    const adminUsers = await this.prisma.adminUser.count({ where: { roleId: id } });
    const accounts = await this.prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*)::bigint AS n FROM accounts WHERE role_id = ${id}`;
    if (adminUsers > 0 || Number(accounts[0]?.n ?? 0) > 0) {
      baseError('Cannot delete record because dependent accounts or admin users exist');
    }
    await this.prisma.role.delete({ where: { id } });
    return role;
  }
}
