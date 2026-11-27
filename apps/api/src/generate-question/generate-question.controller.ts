import { Body, Get, Param, Post, Query } from '@nestjs/common';
import { parseId } from '../common/list-query';
import { AdminController } from '../admin/admin-controller.decorator';
import { RequirePermission } from '../admin/ability/require-permission.decorator';
import { GenerateQuestionService } from './generate-question.service';

const seedOf = (seed?: string) => (seed == null || seed === '' || !Number.isInteger(Number(seed)) ? undefined : Number(seed));

/**
 * generateQuestion API, under /admin/api/workspace (signed-in admins; the MCP server uses it too).
 *
 * Part A, make templates:
 *   POST question-templates/preview    examples -> templates with sample questions (saves nothing)
 *   POST question-templates/generate   examples or template -> N questions with answers (saves nothing)
 *   POST question-templates            examples -> template exercises of a micro lesson (or into one exercise)
 *
 * Part B, serve them:
 *   GET  exercises/:id/template        the exercise read as a template (texts, options, variables, problems)
 *   GET  exercises/:id/questions       N new questions of the exercise, with answers (?count=15&seed=)
 *   GET  micro_lessons/:id/quiz        one new question per exercise of the micro lesson
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
  template(@Param('id') id: string) {
    return this.service.template(Number(parseId(id)));
  }

  @Get('exercises/:id/questions')
  @RequirePermission('read', 'micro_lessons')
  questions(@Param('id') id: string, @Query('count') count?: string, @Query('seed') seed?: string) {
    return this.service.questions(Number(parseId(id)), count == null || count === '' ? 15 : Number(count), seedOf(seed));
  }

  @Get('micro_lessons/:id/quiz')
  @RequirePermission('read', 'micro_lessons')
  quiz(@Param('id') id: string, @Query('seed') seed?: string) {
    return this.service.quiz(Number(parseId(id)), seedOf(seed));
  }
}
