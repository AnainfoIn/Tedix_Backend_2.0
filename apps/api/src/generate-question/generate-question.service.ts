import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ExerciseEditorService } from '../admin/exercises/exercise-editor.service';
import { hasDbChange } from '../common/db-changes';
import { PrismaService } from '../prisma/prisma.service';
import { brief, parseRequest, summary, templatesOf } from './requests';
import { MAX_COUNT, QuestionTemplate, TemplateError, describeVariables, generate } from './template';

type Row = Record<string, any>;

/** Turns TemplateError (bad examples or template) into a 400 the panel and the MCP server can show. */
function guard<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof TemplateError) throw new BadRequestException({ message: e.message, problems: e.problems });
    throw e;
  }
}

/**
 * generateQuestion: makes templates from example exercises ("2 + 3 = 5" becomes {a} + {b} = {c}),
 * saves them as exercises of a micro lesson, and serves each template exercise with new numbers.
 */
@Injectable()
export class GenerateQuestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly editor: ExerciseEditorService,
  ) {}

  /** Shows the templates the examples give, with sample questions. Saves nothing. */
  preview(body: Row) {
    return guard(() => {
      const req = parseRequest(body);
      const { templates, skipped } = templatesOf(req);
      return { data: { templates: templates.map((t) => summary(t, req.count, req.seed)), skipped } };
    });
  }

  /** Saves each template as an exercise (new ones in a micro lesson, or into one existing exercise). */
  async save(body: Row) {
    await this.requireChange();
    const req = guard(() => parseRequest(body));
    const { templates, skipped } = guard(() => templatesOf(req));
    const exerciseId = body?.exerciseId == null || body.exerciseId === '' ? null : Number(body.exerciseId);
    const microLessonId = body?.microLessonId == null || body.microLessonId === '' ? null : Number(body.microLessonId);
    if (exerciseId != null && templates.length !== 1) {
      throw new BadRequestException(`These examples make ${templates.length} templates; an existing exercise can hold one. Save them into a micro lesson instead.`);
    }
    if (exerciseId == null && (microLessonId == null || !Number.isInteger(microLessonId) || microLessonId <= 0)) {
      throw new BadRequestException('Give the micro lesson (microLessonId) or the exercise (exerciseId) to save into');
    }
    const name = typeof body?.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
    const saved: Row[] = [];
    for (const [i, d] of templates.entries()) {
      const sample = guard(() => generate(d.template, { count: 1, seed: req.seed, first: d.first })).variants[0];
      if (!sample) throw new BadRequestException(`${d.pattern}: no values fit the ranges and conditions`);
      let id: number;
      let questionId: number | null = null;
      let exerciseName: string;
      let isAha = !!body?.isAha;
      if (exerciseId != null) {
        const [ex] = await this.prisma.$queryRawUnsafe<Row[]>('SELECT id, name, is_aha, question_id FROM exercises WHERE id = $1', exerciseId);
        if (!ex) throw new NotFoundException('Exercise not found');
        id = Number(ex.id);
        questionId = ex.question_id == null ? null : Number(ex.question_id);
        exerciseName = name || ex.name;
        if (body?.isAha == null) isAha = !!ex.is_aha;
      } else {
        exerciseName = await this.freeName(microLessonId!, name ? (templates.length > 1 ? `${name} (${i + 1})` : name) : `${d.typeName}: ${d.pattern}`);
        id = (await this.editor.create({ microLessonId, name: exerciseName, isAha })).data.id;
      }
      const created = exerciseId == null;
      await this.editor.save(id, {
        name: exerciseName,
        isAha,
        question: {
          id: questionId,
          questionType: sample.questionType,
          question: sample.question,
          questionBody: sample.questionBody,
          hint: sample.hint,
          solution: sample.solution,
          groups: sample.groups,
        },
      }).catch(async (e) => {
        // Do not leave an empty exercise behind.
        if (created) await this.editor.remove(id).catch(() => undefined);
        throw e;
      });
      await this.prisma.$executeRawUnsafe(
        `UPDATE exercises SET question_template = $1::jsonb, questionbank_type = 'template', updated_at = now() WHERE id = $2`,
        JSON.stringify(d.template),
        id,
      );
      saved.push({ exerciseId: id, name: exerciseName, type: d.typeName, pattern: d.pattern, sample: brief(sample) });
    }
    return { data: { saved, skipped } };
  }

  /** Makes questions without saving: from examples or a template in the body. */
  generateFrom(body: Row) {
    return guard(() => {
      const req = parseRequest(body);
      const { templates, skipped } = templatesOf(req);
      return {
        data: {
          templates: templates.map((d) => {
            const r = generate(d.template, { count: req.count, seed: req.seed });
            return { type: d.typeName, pattern: d.pattern, questions: r.variants.map(brief), note: r.note, seed: r.seed };
          }),
          skipped,
        },
      };
    });
  }

  /** The template of an exercise (null when it is a normal exercise). */
  async get(exerciseId: number) {
    const t = await this.load(exerciseId);
    return { data: t ? { exerciseId, template: t, variables: describeVariables(t) } : { exerciseId, template: null } };
  }

  /** New questions for a template exercise: what is served each time the exercise is called. */
  async variants(exerciseId: number, count: number, seed?: number) {
    if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) throw new BadRequestException(`count must be a whole number from 1 to ${MAX_COUNT}`);
    const t = await this.load(exerciseId);
    if (!t) throw new BadRequestException(`Exercise ${exerciseId} is not a template exercise`);
    const r = guard(() => generate(t, { count, seed }));
    return { data: { exerciseId, pattern: t.pattern ?? null, questions: r.variants.map(brief), requested: r.requested, note: r.note, seed: r.seed } };
  }

  /** Turns a template exercise back into a normal one; it keeps its sample question. */
  async remove(exerciseId: number) {
    await this.requireChange();
    const n = await this.prisma.$executeRawUnsafe(
      `UPDATE exercises SET question_template = NULL, questionbank_type = 'regular', updated_at = now() WHERE id = $1 AND question_template IS NOT NULL`,
      exerciseId,
    );
    if (!n) throw new NotFoundException('This exercise has no template');
    return { data: { removed: true } };
  }

  private async load(exerciseId: number): Promise<QuestionTemplate | null> {
    await this.requireChange();
    const [row] = await this.prisma.$queryRawUnsafe<Row[]>('SELECT question_template FROM exercises WHERE id = $1', exerciseId);
    if (!row) throw new NotFoundException('Exercise not found');
    return (row.question_template as QuestionTemplate) ?? null;
  }

  private async requireChange() {
    if (!(await hasDbChange(this.prisma, 'questionTemplate'))) {
      throw new BadRequestException('Question templates need database change 004 (see docs/DB_CHANGES.md)');
    }
  }

  /** The name, or the name with (2), (3), ... when the micro lesson already has it. */
  private async freeName(microLessonId: number, wanted: string) {
    const base = wanted.slice(0, 92);
    for (let n = 1; n < 100; n++) {
      const name = n === 1 ? base : `${base} (${n})`;
      const taken = await this.prisma.$queryRawUnsafe<Row[]>('SELECT 1 FROM exercises WHERE micro_lesson_id = $1 AND lower(name) = lower($2) LIMIT 1', microLessonId, name);
      if (!taken.length) return name;
    }
    throw new BadRequestException('Choose another name: this one is taken in the micro lesson');
  }
}
