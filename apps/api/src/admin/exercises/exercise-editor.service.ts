import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { hasDbChange } from '../../common/db-changes';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeHtml } from '../records/sanitize';

type Row = Record<string, any>;

/** Columns an exercise copies from its micro lesson (as Rails' set_hierarchy_from_micro_lesson). */
const HIERARCHY = ['country_id', 'category_id', 'sub_category_id', 'course_id', 'main_id', 'unit_id', 'lesson_id'];

/** Legacy question types (bx_block_assessmenttest_questionbanks.question_type) the editor can save. */
export const QUESTION_TYPES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
export const SHAPE_TYPES = ['square_with_center', 'square_with_cross', 'triangle', 'triangle_with_center', 'pentagon_with_center', 'asterisk'];

export interface OptionInput {
  id?: number | null;
  option: string;
  isCorrect: boolean;
  sequenceNumber: number | null;
}
export interface GroupInput {
  id?: number | null;
  shapeType?: string | null;
  options: OptionInput[];
}
export interface ExerciseInput {
  name: string;
  isAha: boolean;
  question: {
    id?: number | null;
    questionType: number;
    question: string;
    questionBody: string | null;
    hint: string;
    solution: string;
    groups: GroupInput[];
  };
}

const text = (v: unknown) => (typeof v === 'string' ? sanitizeHtml(v.trim()) : '');
const idOf = (v: unknown) => (v == null || v === '' ? null : Number.isInteger(Number(v)) ? Number(v) : NaN);

/**
 * The exercise editor of the micro lesson page: saves an exercise with its question, option groups
 * and options in one go (Rails tables, same shape the app reads), or deletes it with its content.
 */
@Injectable()
export class ExerciseEditorService {
  constructor(private readonly prisma: PrismaService) {}

  /** Checks the body and returns it cleaned, or throws with every problem found. */
  static parse(body: Record<string, any>): ExerciseInput {
    const problems: string[] = [];
    const name = text(body?.name);
    if (name.length < 2) problems.push('Name needs at least 2 characters');
    if (name.length > 100) problems.push('Name can have at most 100 characters');
    const q = body?.question ?? {};
    const questionType = Number(q.questionType);
    if (!QUESTION_TYPES.includes(questionType)) problems.push('Choose the exercise type');
    const question = text(q.question);
    const hint = text(q.hint);
    const solution = text(q.solution);
    if (!question) problems.push('Question is required');
    if (!hint) problems.push('Hint is required');
    if (!solution) problems.push('Solution is required');
    if (idOf(q.id) !== null && Number.isNaN(idOf(q.id))) problems.push('Invalid question');
    const groups: GroupInput[] = (Array.isArray(q.groups) ? q.groups : []).map((g: Row) => ({
      id: idOf(g?.id),
      shapeType: g?.shapeType ? String(g.shapeType) : null,
      options: (Array.isArray(g?.options) ? g.options : []).map((o: Row) => ({
        id: idOf(o?.id),
        option: text(o?.option),
        isCorrect: !!o?.isCorrect,
        sequenceNumber: o?.sequenceNumber == null || o.sequenceNumber === '' ? null : Number(o.sequenceNumber),
      })),
    }));
    groups.forEach((g, i) => {
      if (Number.isNaN(g.id)) problems.push(`Invalid group ${i + 1}`);
      if (questionType === 11 && !g.shapeType) problems.push(`Shape ${i + 1} needs a shape`);
      if (g.shapeType && !SHAPE_TYPES.includes(g.shapeType)) problems.push(`Unknown shape in group ${i + 1}`);
      g.options.forEach((o, j) => {
        if (Number.isNaN(o.id)) problems.push(`Invalid option ${j + 1}`);
        if (!o.option) problems.push(`Answer ${j + 1}${groups.length > 1 ? ` in group ${i + 1}` : ''} is empty`);
        if (o.sequenceNumber !== null && !Number.isInteger(o.sequenceNumber)) problems.push(`Order of answer ${j + 1} must be a whole number`);
      });
    });
    if (problems.length) throw new BadRequestException({ message: problems.join('. '), problems });
    return { name, isAha: !!body?.isAha, question: { id: idOf(q.id), questionType, question, questionBody: text(q.questionBody) || null, hint, solution, groups } };
  }

  async save(exerciseId: number, body: Record<string, any>) {
    const input = ExerciseEditorService.parse(body);
    const [exercise] = await this.prisma.$queryRawUnsafe<Row[]>('SELECT id, micro_lesson_id FROM bx_block_assessmenttest_assessments WHERE id = $1', exerciseId);
    if (!exercise) throw new NotFoundException('Exercise not found');
    const taken = await this.prisma.$queryRawUnsafe<Row[]>(
      'SELECT 1 FROM bx_block_assessmenttest_assessments WHERE micro_lesson_id = $1 AND lower(name) = lower($2) AND id <> $3 LIMIT 1',
      exercise.micro_lesson_id,
      input.name,
      exerciseId,
    );
    if (taken.length) throw new BadRequestException({ message: 'Name has already been taken for this micro lesson', problems: ['Name has already been taken for this micro lesson'] });

    const q = input.question;
    const ordered = await hasDbChange(this.prisma, 'exerciseOrder');
    await this.prisma.$transaction(async (tx) => {
      // Saving in the editor is the check the "Check type" tag asks for.
      if (ordered) await tx.$executeRawUnsafe('UPDATE exercises SET needs_review = false, review_note = NULL WHERE id = $1', exerciseId);
      await tx.$executeRawUnsafe('UPDATE bx_block_assessmenttest_assessments SET name = $1, is_aha = $2, updated_at = now() WHERE id = $3', input.name, input.isAha, exerciseId);

      let questionId = q.id;
      if (questionId != null) {
        const n = await tx.$executeRawUnsafe(
          `UPDATE bx_block_assessmenttest_questionbanks SET question_type = $1, question = $2, question_body = $3, hint = $4, solution = $5, updated_at = now()
           WHERE id = $6 AND assessment_id = $7`,
          q.questionType, q.question, q.questionBody, q.hint, q.solution, questionId, exerciseId,
        );
        if (!n) throw new BadRequestException('This question belongs to another exercise');
      } else {
        const [row] = await tx.$queryRawUnsafe<Row[]>(
          `INSERT INTO bx_block_assessmenttest_questionbanks (assessment_id, question_type, questionbank_type, question, question_body, hint, solution, created_at, updated_at)
           VALUES ($1, $2, 'regular', $3, $4, $5, $6, now(), now()) RETURNING id`,
          exerciseId, q.questionType, q.question, q.questionBody, q.hint, q.solution,
        );
        questionId = Number(row.id);
      }

      // Groups and options: keep the ones sent (by id), add new ones, remove the rest.
      const oldGroups = await tx.$queryRawUnsafe<Row[]>('SELECT id FROM answer_option_groups WHERE questionbank_id = $1', questionId);
      const oldOptions = await tx.$queryRawUnsafe<Row[]>(
        `SELECT o.id FROM bx_block_assessmenttest_answer_options o JOIN answer_option_groups g ON g.id = o.answer_option_group_id WHERE g.questionbank_id = $1`,
        questionId,
      );
      const groupIds = new Set(oldGroups.map((g) => Number(g.id)));
      const optionIds = new Set(oldOptions.map((o) => Number(o.id)));
      const keptGroups = new Set<number>();
      const keptOptions = new Set<number>();

      for (const g of q.groups) {
        let groupId: number;
        if (g.id != null && groupIds.has(g.id)) {
          groupId = g.id;
          await tx.$executeRawUnsafe('UPDATE answer_option_groups SET shape_type = $1, updated_at = now() WHERE id = $2', g.shapeType ?? null, groupId);
        } else {
          const [row] = await tx.$queryRawUnsafe<Row[]>(
            'INSERT INTO answer_option_groups (questionbank_id, shape_type, created_at, updated_at) VALUES ($1, $2, now(), now()) RETURNING id',
            questionId, g.shapeType ?? null,
          );
          groupId = Number(row.id);
        }
        keptGroups.add(groupId);
        for (const o of g.options) {
          if (o.id != null && optionIds.has(o.id)) {
            keptOptions.add(o.id);
            await tx.$executeRawUnsafe(
              `UPDATE bx_block_assessmenttest_answer_options SET option = $1, is_correct = $2, sequence_number = $3, answer_option_group_id = $4, updated_at = now() WHERE id = $5`,
              o.option, o.isCorrect, o.sequenceNumber, groupId, o.id,
            );
          } else {
            await tx.$executeRawUnsafe(
              `INSERT INTO bx_block_assessmenttest_answer_options (questionbank_id, answer_option_group_id, option, is_correct, sequence_number, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, now(), now())`,
              questionId, groupId, o.option, o.isCorrect, o.sequenceNumber,
            );
          }
        }
      }
      const dropOptions = [...optionIds].filter((id) => !keptOptions.has(id));
      if (dropOptions.length) {
        await tx.$executeRawUnsafe('DELETE FROM bx_block_assessmenttest_answer_options WHERE id = ANY($1::bigint[])', dropOptions);
        await this.dropTranslations(tx, 'option', dropOptions);
      }
      const dropGroups = [...groupIds].filter((id) => !keptGroups.has(id));
      if (dropGroups.length) {
        await tx.$executeRawUnsafe('DELETE FROM bx_block_assessmenttest_answer_options WHERE answer_option_group_id = ANY($1::bigint[])', dropGroups);
        await tx.$executeRawUnsafe('DELETE FROM answer_option_groups WHERE id = ANY($1::bigint[])', dropGroups);
      }
    });
    return { data: { saved: true } };
  }

  /**
   * "Add exercise" on the micro lesson page (design board 2): creates the exercise with its name and
   * AHA flag, at the end of the micro lesson. Its question is added by the first save in the editor,
   * which opens with the type picked in the dialog.
   */
  async create(body: Record<string, any>) {
    const microLessonId = Number(body?.microLessonId);
    if (!Number.isInteger(microLessonId) || microLessonId <= 0) throw new BadRequestException('Invalid micro lesson');
    const name = text(body?.name).replace(/\s+/g, ' ');
    const problems: string[] = [];
    if (name.length < 2) problems.push('Name needs at least 2 characters');
    if (name.length > 100) problems.push('Name can have at most 100 characters');
    if (problems.length) throw new BadRequestException({ message: problems.join('. '), problems });
    const [ml] = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT ${HIERARCHY.join(', ')} FROM bx_block_profile_micro_lessons WHERE id = $1`,
      microLessonId,
    );
    if (!ml) throw new NotFoundException('Micro lesson not found');
    const taken = await this.prisma.$queryRawUnsafe<Row[]>(
      'SELECT 1 FROM bx_block_assessmenttest_assessments WHERE micro_lesson_id = $1 AND lower(name) = lower($2) LIMIT 1',
      microLessonId,
      name,
    );
    if (taken.length) throw new BadRequestException({ message: 'Name has already been taken for this micro lesson', problems: ['Name has already been taken for this micro lesson'] });
    const [row] = await this.prisma.$queryRawUnsafe<Row[]>(
      `INSERT INTO bx_block_assessmenttest_assessments (micro_lesson_id, name, category_type, is_aha, ${HIERARCHY.join(', ')}, created_at, updated_at)
       VALUES ($1, $2, 0, $3, ${HIERARCHY.map((_, i) => `$${i + 4}`).join(', ')}, now(), now()) RETURNING id`,
      microLessonId,
      name,
      !!body?.isAha,
      ...HIERARCHY.map((c) => ml[c] ?? null),
    );
    return { data: { id: Number(row.id), name } };
  }

  /** Sets the order of a micro lesson's exercises (drag in the exercise list). Needs DB change 003. */
  async reorder(body: Record<string, any>) {
    if (!(await hasDbChange(this.prisma, 'exerciseOrder'))) {
      throw new BadRequestException('Reordering needs database change 003 (see docs/DB_CHANGES.md)');
    }
    const microLessonId = Number(body?.microLessonId);
    const ids: number[] = Array.isArray(body?.ids) ? body.ids.map(Number) : [];
    if (!Number.isInteger(microLessonId) || !ids.every(Number.isInteger)) throw new BadRequestException('Invalid micro lesson or exercises');
    const current = (await this.prisma.$queryRawUnsafe<Row[]>('SELECT id FROM exercises WHERE micro_lesson_id = $1', microLessonId)).map((r) => Number(r.id));
    if (!current.length) throw new NotFoundException('Micro lesson has no exercises');
    if (ids.length !== current.length || new Set(ids).size !== ids.length || !ids.every((id) => current.includes(id))) {
      throw new BadRequestException('The list of exercises changed meanwhile. Reload the page and try again.');
    }
    await this.prisma.$transaction(
      ids.map((id, i) => this.prisma.$executeRawUnsafe('UPDATE exercises SET position = $1, updated_at = now() WHERE id = $2', i + 1, id)),
    );
    return { data: { ids } };
  }

  /** Deletes the exercise with its questions, option groups, options, variables and translations. Refused once students have attempted it. */
  async remove(exerciseId: number) {
    const [exercise] = await this.prisma.$queryRawUnsafe<Row[]>('SELECT id FROM bx_block_assessmenttest_assessments WHERE id = $1', exerciseId);
    if (!exercise) throw new NotFoundException('Exercise not found');
    const attempts = await this.prisma.$queryRawUnsafe<Row[]>('SELECT 1 FROM bx_block_assessmenttest_attempted_assessments WHERE assessment_id = $1 LIMIT 1', exerciseId);
    if (attempts.length) throw new BadRequestException('Students have already done this exercise, so it cannot be deleted');
    await this.prisma.$transaction(async (tx) => {
      const questions = (await tx.$queryRawUnsafe<Row[]>('SELECT id FROM bx_block_assessmenttest_questionbanks WHERE assessment_id = $1', exerciseId)).map((r) => Number(r.id));
      if (questions.length) {
        const options = (
          await tx.$queryRawUnsafe<Row[]>(
            'SELECT o.id FROM bx_block_assessmenttest_answer_options o JOIN answer_option_groups g ON g.id = o.answer_option_group_id WHERE g.questionbank_id = ANY($1::bigint[])',
            questions,
          )
        ).map((r) => Number(r.id));
        if (options.length) {
          await tx.$executeRawUnsafe('DELETE FROM bx_block_assessmenttest_answer_options WHERE id = ANY($1::bigint[])', options);
          await this.dropTranslations(tx, 'option', options);
        }
        await tx.$executeRawUnsafe('DELETE FROM answer_option_groups WHERE questionbank_id = ANY($1::bigint[])', questions);
        await tx.$executeRawUnsafe('DELETE FROM bx_block_assessmenttest_variables WHERE questionbank_id = ANY($1::bigint[])', questions);
        await tx.$executeRawUnsafe(
          `DELETE FROM content_images WHERE contentable_type = 'BxBlockAssessmenttest::Questionbank' AND contentable_id = ANY($1::bigint[])`,
          questions,
        );
        await tx.$executeRawUnsafe('DELETE FROM bx_block_assessmenttest_questionbanks WHERE id = ANY($1::bigint[])', questions);
        await this.dropTranslations(tx, 'question', questions);
      }
      await tx.$executeRawUnsafe('DELETE FROM bx_block_assessmenttest_assessments WHERE id = $1', exerciseId);
      await this.dropTranslations(tx, 'exercise', [exerciseId]);
    });
    return { data: { deleted: true } };
  }

  private async dropTranslations(tx: Pick<PrismaService, '$executeRawUnsafe' | '$queryRawUnsafe'>, itemType: string, ids: number[]) {
    // The table is created when the workspace is first opened; nothing to remove before that.
    const [t] = await tx.$queryRawUnsafe<Row[]>(`SELECT to_regclass('admin_content_translations') IS NOT NULL AS ok`);
    if (t?.ok) await tx.$executeRawUnsafe('DELETE FROM admin_content_translations WHERE item_type = $1 AND item_id = ANY($2::bigint[])', itemType, ids);
  }
}
