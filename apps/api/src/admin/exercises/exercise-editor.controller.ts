import { Body, Delete, Param, Put } from '@nestjs/common';
import { parseId } from '../../common/list-query';
import { AdminController } from '../admin-controller.decorator';
import { RequirePermission } from '../ability/require-permission.decorator';
import { ExerciseEditorService } from './exercise-editor.service';

/** Exercise editor of the micro lesson page. /admin/api/workspace/exercises/:id */
@AdminController('workspace/exercises')
export class ExerciseEditorController {
  constructor(private readonly editor: ExerciseEditorService) {}

  @Put('order')
  @RequirePermission('manage', 'micro_lessons')
  reorder(@Body() body: Record<string, any>) {
    return this.editor.reorder(body ?? {});
  }

  @Put(':id')
  @RequirePermission('manage', 'micro_lessons')
  save(@Param('id') id: string, @Body() body: Record<string, any>) {
    return this.editor.save(Number(parseId(id)), body ?? {});
  }

  @Delete(':id')
  @RequirePermission('manage', 'micro_lessons')
  remove(@Param('id') id: string) {
    return this.editor.remove(Number(parseId(id)));
  }
}
