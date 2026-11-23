import { Get, Query } from '@nestjs/common';
import { AdminController } from '../admin-controller.decorator';
import { RequirePermission } from '../ability/require-permission.decorator';
import { CurriculumQuery, CurriculumService } from './curriculum.service';

const KEYS: Array<keyof CurriculumQuery> = ['countryId', 'gradeId', 'subjectId', 'masterId', 'mainId', 'unitId', 'lessonId', 'microLessonId'];

/** GET /admin/api/curriculum: the columns of the Curriculum screen for the picked path. */
@AdminController('curriculum')
export class CurriculumController {
  constructor(private readonly curriculum: CurriculumService) {}

  @Get()
  @RequirePermission('read', 'lessons')
  load(@Query() query: Record<string, string>) {
    const p: CurriculumQuery = {};
    for (const k of KEYS) {
      const v = Number(query[k]);
      if (Number.isSafeInteger(v) && v > 0) p[k] = v;
    }
    return this.curriculum.load(p);
  }
}
