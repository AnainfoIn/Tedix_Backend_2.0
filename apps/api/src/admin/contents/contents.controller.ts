import { Body, Delete, Get, Param, Post, Put, Query, Type, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { parseId, parseListQuery } from '../../common/list-query';
import { AdminController } from '../admin-controller.decorator';
import { RequirePermission } from '../ability/require-permission.decorator';
import { ContentsService, ListFilters, parseIdList, parseIdValue, UploadedFiles as Files } from './contents.service';
import { ALL_FILE_FIELDS, IdField, LevelKey, LEVELS } from './levels';

const ID_FIELDS: IdField[] = ['countryId', 'gradeId', 'subjectId', 'masterId', 'mainId', 'unitId'];
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const fileFields = () =>
  FileFieldsInterceptor(ALL_FILE_FIELDS.map((name) => ({ name, maxCount: 1 })), { limits: { fileSize: MAX_UPLOAD_BYTES } });

export function readFilters(query: Record<string, unknown>): ListFilters {
  const filters: ListFilters = {};
  for (const field of ID_FIELDS) {
    const id = parseIdValue(query[field]);
    if (id !== null) filters[field] = id;
  }
  return filters;
}

/** One admin controller per level: /admin/api/countries, /admin/api/grades, ... */
function levelController(key: LevelKey): Type<unknown> {
  const level = LEVELS[key];
  const sortable = ['id', 'name', 'createdAt', 'updatedAt', ...(level.positionScope ? ['position'] : [])];

  @AdminController(key)
  class LevelController {
    constructor(readonly contents: ContentsService) {}

    @Get()
    @RequirePermission('read', level.resource)
    list(@Query() query: Record<string, unknown>) {
      if (query.ids !== undefined) return this.contents.many(key, parseIdList(query.ids));
      return this.contents.list(key, parseListQuery(query, sortable), readFilters(query));
    }

    @Get(':id')
    @RequirePermission('read', level.resource)
    async get(@Param('id') id: string) {
      return { data: await this.contents.get(key, parseId(id)) };
    }

    @Post()
    @RequirePermission('manage', level.resource)
    @UseInterceptors(fileFields())
    async create(@Body() body: Record<string, unknown>, @UploadedFiles() files: Files) {
      return { data: await this.contents.create(key, body ?? {}, files ?? {}) };
    }

    @Put(':id')
    @RequirePermission('manage', level.resource)
    @UseInterceptors(fileFields())
    async update(@Param('id') id: string, @Body() body: Record<string, unknown>, @UploadedFiles() files: Files) {
      return { data: await this.contents.update(key, parseId(id), body ?? {}, files ?? {}) };
    }

    @Delete(':id')
    @RequirePermission('manage', level.resource)
    async remove(@Param('id') id: string) {
      return { data: await this.contents.remove(key, parseId(id)) };
    }

    @Put(':id/position')
    @RequirePermission('manage', level.resource)
    async move(@Param('id') id: string, @Body() body: { position?: unknown }) {
      return { data: await this.contents.move(key, parseId(id), body?.position) };
    }
  }
  Object.defineProperty(LevelController, 'name', { value: `${level.plural}Controller` });
  return LevelController;
}

/** Tree browser: the children of one node. `?countryId=1&gradeId=2` lists that grade's subjects. */
@AdminController('contents')
export class ContentsTreeController {
  constructor(private readonly contents: ContentsService) {}

  @Get('tree')
  @RequirePermission('read', 'contents')
  tree(@Query() query: Record<string, unknown>) {
    return this.contents.tree(readFilters(query));
  }
}

export const CONTENT_CONTROLLERS: Type<unknown>[] = [
  ContentsTreeController,
  ...(Object.keys(LEVELS) as LevelKey[]).map(levelController),
];
