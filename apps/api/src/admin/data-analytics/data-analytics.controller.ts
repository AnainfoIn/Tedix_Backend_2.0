import { Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { RequirePermission } from '../ability/require-permission.decorator';
import { AdminController } from '../admin-controller.decorator';
import { DataAnalyticsService } from './data-analytics.service';

/** DataAnalytics menu: read-only counts over the curriculum. Nothing here writes to the database. */
@AdminController('data-analytics')
export class DataAnalyticsController {
  constructor(private readonly service: DataAnalyticsService) {}

  /** GET /admin/api/data-analytics/generated-questions?countryId=: one row per micro lesson with exercises. */
  @Get('generated-questions')
  @RequirePermission('read', 'lessons')
  generated(@Query('countryId') countryId?: string) {
    const id = Number(countryId);
    return this.service.generatedQuestions(Number.isSafeInteger(id) && id > 0 ? id : undefined);
  }

  /** GET /admin/api/data-analytics/generated-questions/micro-lessons/:id: that micro lesson's exercises. */
  @Get('generated-questions/micro-lessons/:id')
  @RequirePermission('read', 'lessons')
  micro(@Param('id', ParseIntPipe) id: number) {
    return this.service.microLessonExercises(id);
  }
}
