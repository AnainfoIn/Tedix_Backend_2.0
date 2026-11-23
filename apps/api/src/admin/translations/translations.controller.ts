import { Body, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { parseId } from '../../common/list-query';
import { AdminController } from '../admin-controller.decorator';
import { RequirePermission } from '../ability/require-permission.decorator';
import { AuthenticatedAdmin } from '../auth/admin-auth.guard';
import { CurrentAdmin } from '../auth/current-admin.decorator';
import { TranslationsService } from './translations.service';

/** Micro lesson workspace: language tabs, translations and Translate. /admin/api/workspace/... */
@AdminController('workspace')
export class TranslationsController {
  constructor(private readonly translations: TranslationsService) {}

  @Get('micro_lessons/:id')
  @RequirePermission('read', 'micro_lessons')
  workspace(@Param('id') id: string) {
    return this.translations.workspace(Number(parseId(id)));
  }

  @Put('micro_lessons/:id/original_language')
  @RequirePermission('manage', 'micro_lessons')
  setOriginal(@Param('id') id: string, @Body() body: { languageId?: unknown }) {
    return this.translations.setOriginalLanguage(Number(parseId(id)), Number(body?.languageId));
  }

  @Post('micro_lessons/:id/translate')
  @HttpCode(200)
  @RequirePermission('manage', 'micro_lessons')
  translate(@Param('id') id: string, @Body() body: Record<string, any>, @CurrentAdmin() admin: AuthenticatedAdmin) {
    return this.translations.translate(Number(parseId(id)), body ?? {}, admin?.email ?? null);
  }

  @Get('levels/:type/:id')
  @RequirePermission('read', 'lessons')
  level(@Param('type') type: string, @Param('id') id: string) {
    return this.translations.levelWorkspace(TranslationsService.levelType(type), Number(parseId(id)));
  }

  @Put('levels/:type/:id/original_language')
  @RequirePermission('manage', 'lessons')
  setLevelOriginal(@Param('type') type: string, @Param('id') id: string, @Body() body: { languageId?: unknown }) {
    return this.translations.setLevelOriginalLanguage(TranslationsService.levelType(type), Number(parseId(id)), Number(body?.languageId));
  }

  @Post('levels/:type/:id/translate')
  @HttpCode(200)
  @RequirePermission('manage', 'lessons')
  translateLevel(@Param('type') type: string, @Param('id') id: string, @Body() body: Record<string, any>, @CurrentAdmin() admin: AuthenticatedAdmin) {
    return this.translations.translateLevel(TranslationsService.levelType(type), Number(parseId(id)), body ?? {}, admin?.email ?? null);
  }

  @Put('levels/translations')
  @RequirePermission('manage', 'lessons')
  saveLevel(@Body() body: Record<string, unknown>, @CurrentAdmin() admin: AuthenticatedAdmin) {
    TranslationsService.levelType(String(body?.itemType));
    return this.translations.save(body ?? {}, admin?.email ?? null);
  }

  @Put('translations')
  @RequirePermission('manage', 'micro_lessons')
  save(@Body() body: Record<string, unknown>, @CurrentAdmin() admin: AuthenticatedAdmin) {
    return this.translations.save(body ?? {}, admin?.email ?? null);
  }
}
