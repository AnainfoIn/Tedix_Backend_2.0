import { Body, Delete, Get, MethodNotAllowedException, Param, Post, Put, Query, Type, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { parseId } from '../../common/list-query';
import { RequirePermission } from '../ability/require-permission.decorator';
import { AdminController } from '../admin-controller.decorator';
import { parseIdList } from '../contents/contents.service';
import { RESOURCES } from './defs';
import { ResourceDef } from './defs/types';
import { Files, RecordsService } from './records.service';

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const LIST_KEYS = new Set(['page', 'perPage', 'sort', 'order', 'q', 'ids']);

/** One controller per resource: GET/POST /admin/api/<key>, GET/PUT/DELETE /admin/api/<key>/:id. */
function recordController(def: ResourceDef): Type<unknown> {
  const fileFields = def.fields.filter((f) => f.type === 'image' || f.type === 'file').map((f) => ({ name: f.name, maxCount: 1 }));
  const files = () => FileFieldsInterceptor(fileFields, { limits: { fileSize: MAX_UPLOAD_BYTES } });
  const allow = (action: 'create' | 'edit' | 'delete') => {
    if (!def.actions.includes(action)) throw new MethodNotAllowedException(`${def.label} cannot be ${action === 'edit' ? 'edited' : action === 'create' ? 'added' : 'deleted'} here`);
  };

  @AdminController(def.key)
  class RecordController {
    constructor(readonly records: RecordsService) {}

    @Get()
    @RequirePermission('read', def.permission)
    list(@Query() query: Record<string, unknown>) {
      if (query.ids !== undefined) return this.records.many(def, parseIdList(query.ids));
      const page = Math.max(1, Number(query.page ?? 1) || 1);
      const perPage = Math.min(200, Math.max(1, Number(query.perPage ?? 25) || 25));
      const filters = Object.fromEntries(Object.entries(query).filter(([k]) => !LIST_KEYS.has(k)));
      return this.records.list(def, {
        skip: (page - 1) * perPage,
        take: perPage,
        sortField: String(query.sort ?? def.defaultSort?.field ?? 'id'),
        sortOrder: String(query.order ?? def.defaultSort?.order ?? 'ASC').toLowerCase() === 'desc' ? 'desc' : 'asc',
        q: typeof query.q === 'string' && query.q.trim() ? query.q.trim() : undefined,
        filters,
      });
    }

    @Get(':id')
    @RequirePermission('read', def.permission)
    async get(@Param('id') id: string) {
      return { data: await this.records.get(def, parseId(id)) };
    }

    @Post()
    @RequirePermission('manage', def.permission)
    @UseInterceptors(files())
    async create(@Body() body: Record<string, unknown>, @UploadedFiles() uploaded: Files) {
      allow('create');
      return { data: await this.records.create(def, body ?? {}, uploaded ?? {}) };
    }

    @Put(':id')
    @RequirePermission('manage', def.permission)
    @UseInterceptors(files())
    async update(@Param('id') id: string, @Body() body: Record<string, unknown>, @UploadedFiles() uploaded: Files) {
      allow('edit');
      return { data: await this.records.update(def, parseId(id), body ?? {}, uploaded ?? {}) };
    }

    @Delete(':id')
    @RequirePermission('manage', def.permission)
    async remove(@Param('id') id: string) {
      allow('delete');
      return this.records.remove(def, parseId(id));
    }

    @Put(':id/position')
    @RequirePermission('manage', def.permission)
    async move(@Param('id') id: string, @Body() body: { position?: unknown }) {
      allow('edit');
      return { data: await this.records.move(def, parseId(id), Number(body?.position)) };
    }
  }
  Object.defineProperty(RecordController, 'name', { value: `${def.singular.replace(/\W/g, '')}RecordsController` });
  return RecordController;
}

export const RECORD_CONTROLLERS: Type<unknown>[] = RESOURCES.map(recordController);
