import { Body, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { parseId } from '../common/list-query';
import { AdminController } from '../admin/admin-controller.decorator';
import { RequirePermission } from '../admin/ability/require-permission.decorator';
import { GenerateQuestionService } from './generate-question.service';

/**
 * generateQuestion API, under /admin/api/workspace (signed-in admins; the MCP server uses it too).
 *
 *   POST   question-templates/preview    examples -> templates with sample questions (saves nothing)
 *   POST   question-templates/generate   examples or template -> N questions with answers (saves nothing)
 *   POST   question-templates            examples -> saved as template exercises of a micro lesson
 *   GET    exercises/:id/template        the template of an exercise
 *   GET    exercises/:id/variants        N new questions of a template exercise (?count=15&seed=)
 *   DELETE exercises/:id/template        back to a normal exercise
 */
@AdminController('workspace')
export class GenerateQuestionController {
  constructor(private readonly service: GenerateQuestionService) {}

  @Post('question-templates/preview')
  @RequirePermission('read', 'micro_lessons')
  preview(@Body() body: Record<string, any>) {
    return this.service.preview(body ?? {});
  }

  @Post('question-templates/generate')
  @RequirePermission('read', 'micro_lessons')
  generate(@Body() body: Record<string, any>) {
    return this.service.generateFrom(body ?? {});
  }

  @Post('question-templates')
  @RequirePermission('manage', 'micro_lessons')
  save(@Body() body: Record<string, any>) {
    return this.service.save(body ?? {});
  }

  @Get('exercises/:id/template')
  @RequirePermission('read', 'micro_lessons')
  get(@Param('id') id: string) {
    return this.service.get(Number(parseId(id)));
  }

  @Get('exercises/:id/variants')
  @RequirePermission('read', 'micro_lessons')
  variants(@Param('id') id: string, @Query('count') count?: string, @Query('seed') seed?: string) {
    const s = seed == null || seed === '' ? undefined : Number(seed);
    return this.service.variants(Number(parseId(id)), count == null || count === '' ? 15 : Number(count), Number.isInteger(s) ? s : undefined);
  }

  @Delete('exercises/:id/template')
  @RequirePermission('manage', 'micro_lessons')
  remove(@Param('id') id: string) {
    return this.service.remove(Number(parseId(id)));
  }
}
