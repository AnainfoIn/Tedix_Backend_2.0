import { Body, Delete, Get, Param, Post, Put, Query, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { parseId } from '../../common/list-query';
import { RequirePermission } from '../ability/require-permission.decorator';
import { AdminController } from '../admin-controller.decorator';
import { parseIdList } from '../contents/contents.service';
import { NotificationsService } from './notifications.service';

const LIST_KEYS = new Set(['page', 'perPage', 'sort', 'order', 'q', 'ids']);
const upload = () => FileFieldsInterceptor([{ name: 'inappImage', maxCount: 1 }], { limits: { fileSize: 10 * 1024 * 1024 } });
const names = (v: unknown) => (typeof v === 'string' && v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);

/** Notifications (UnifiedNotification), as on the old ActiveAdmin page: all actions. */
@AdminController('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @RequirePermission('read', 'notifications')
  list(@Query() query: Record<string, unknown>) {
    if (query.ids !== undefined) return this.notifications.many(parseIdList(query.ids));
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const perPage = Math.min(200, Math.max(1, Number(query.perPage ?? 25) || 25));
    return this.notifications.list({
      skip: (page - 1) * perPage,
      take: perPage,
      sortField: String(query.sort ?? 'id'),
      sortOrder: String(query.order ?? 'DESC').toLowerCase() === 'asc' ? 'asc' : 'desc',
      filters: Object.fromEntries(Object.entries(query).filter(([k]) => !LIST_KEYS.has(k))),
    });
  }

  /** Cities, schools or grades for the targeting dropdowns (Rails `country_data`). */
  @Get('targeting-options')
  @RequirePermission('read', 'notifications')
  async options(@Query() query: Record<string, unknown>) {
    return { data: await this.notifications.options(String(query.type ?? ''), names(query.country), names(query.city), names(query.school)) };
  }

  @Get(':id')
  @RequirePermission('read', 'notifications')
  async get(@Param('id') id: string) {
    return { data: await this.notifications.get(parseId(id)) };
  }

  @Post()
  @RequirePermission('manage', 'notifications')
  @UseInterceptors(upload())
  async create(@Body() body: Record<string, unknown>, @UploadedFiles() files: Record<string, any>) {
    return { data: await this.notifications.create(body ?? {}, files ?? {}) };
  }

  @Put(':id')
  @RequirePermission('manage', 'notifications')
  @UseInterceptors(upload())
  async update(@Param('id') id: string, @Body() body: Record<string, unknown>, @UploadedFiles() files: Record<string, any>) {
    return { data: await this.notifications.update(parseId(id), body ?? {}, files ?? {}) };
  }

  @Delete(':id')
  @RequirePermission('manage', 'notifications')
  async remove(@Param('id') id: string) {
    return { data: await this.notifications.remove(parseId(id)) };
  }
}
