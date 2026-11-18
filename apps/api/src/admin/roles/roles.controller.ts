import { Body, Delete, Get, Param, Put, Query } from '@nestjs/common';
import { parseId, parseListQuery } from '../../common/list-query';
import { AdminController } from '../admin-controller.decorator';
import { RequirePermission } from '../ability/require-permission.decorator';
import { RolesService } from './roles.service';

/** Roles, as in ActiveAdmin: list, view, edit and delete (no "new", same as Rails). */
@AdminController('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @RequirePermission('read', 'roles')
  list(@Query() query: Record<string, unknown>) {
    return this.roles.list(parseListQuery(query, ['id', 'name', 'createdAt', 'updatedAt']));
  }

  @Get(':id')
  @RequirePermission('read', 'roles')
  async get(@Param('id') id: string) {
    return { data: await this.roles.get(parseId(id)) };
  }

  @Put(':id')
  @RequirePermission('manage', 'roles')
  async update(@Param('id') id: string, @Body() body: { name?: unknown }) {
    return { data: await this.roles.update(parseId(id), body ?? {}) };
  }

  @Delete(':id')
  @RequirePermission('manage', 'roles')
  async remove(@Param('id') id: string) {
    return { data: await this.roles.remove(parseId(id)) };
  }
}
