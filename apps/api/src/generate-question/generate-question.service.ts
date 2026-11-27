import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ExerciseEditorService } from '../admin/exercises/exercise-editor.service';
import { hasDbChange } from '../common/db-changes';
import { PrismaService } from '../prisma/prisma.service';
import { brief, parseRequest, summary, templatesOf } from './requests';
import { MAX_COUNT, QuestionTemplate, TemplateError, TemplateGroup, TemplateVariable, checkTemplate, describeVariables, generate } from './template';

type Row = Record<string, any>;
type Tx = Pick<PrismaService, '$queryRawUnsafe' | '$executeRawUnsafe'>;

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
 * generateQuestion.
 *
 * Part A, make a template: examples like "2+3=5" become an exercise in the format the existing
 * template exercises use. Its question has {{a}} placeholders, its variables are rows of
 * bx_block_assessmenttest_variables, and questionbank_type is 'template'. No new table or column.
 *
 * Part B, serve it: an exercise (or every exercise of a micro lesson, for a quiz) is read with its
 * variables and comes back with new numbers each time, with the answer. Works for the template
 * exercises that exist already as well as new ones.
 */
@Injectable()
export class GenerateQuestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly editor: ExerciseEditorService,
  ) {}

  // ---------- Part A ----------

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
      const t = d.template;
      let id: number;
      let questionId: number | null = null;
      let exerciseName: string;
      let isAha = !!body?.isAha;
      if (exerciseId != null) {
        const [ex] = await this.prisma.$queryRawUnsafe<Row[]>('SELECT id, name, is_aha FROM bx_block_assessmenttest_assessments WHERE id = $1', exerciseId);
        if (!ex) throw new NotFoundException('Exercise not found');
        const [q] = await this.prisma.$queryRawUnsafe<Row[]>('SELECT id FROM bx_block_assessmenttest_questionbanks WHERE assessment_id = $1 ORDER BY id LIMIT 1', exerciseId);
        id = Number(ex.id);
        questionId = q ? Number(q.id) : null;
        exerciseName = name || ex.name;
        if (body?.isAha == null) isAha = !!ex.is_aha;
      } else {
        exerciseName = await this.freeName(microLessonId!, name ? (templates.length > 1 ? `${name} (${i + 1})` : name) : `${d.typeName}: ${d.pattern}`);
        id = (await this.editor.create({ microLessonId, name: exerciseName, isAha })).data.id;
      }
      // The editor saves the question and its answer options, with the {{placeholders}} as written.
      await this.editor
        .save(id, {
          name: exerciseName,
          isAha,
          question: { id: questionId, questionType: t.questionType, question: t.question, questionBody: t.questionBody, hint: t.hint, solution: t.solution, groups: t.groups },
        })
        .catch(async (e) => {
          if (exerciseId == null) await this.editor.remove(id).catch(() => undefined);
          throw e;
        });
      const [q] = await this.prisma.$queryRawUnsafe<Row[]>('SELECT id FROM bx_block_assessmenttest_questionbanks WHERE assessment_id = $1 ORDER BY id LIMIT 1', id);
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`UPDATE bx_block_assessmenttest_questionbanks SET questionbank_type = 'template', updated_at = now() WHERE id = $1`, q.id);
        await this.writeVariables(tx, Number(q.id), t.variables);
      });
      const sample = guard(() => generate(t, { count: 1, seed: req.seed, first: d.first })).variants[0];
      saved.push({ exerciseId: id, name: exerciseName, type: d.typeName, pattern: d.pattern, variables: describeVariables(t), sample: sample ? brief(sample) : null });
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

  // ---------- Part B ----------

  /** An exercise as a template: its question, options and variables. */
  async template(exerciseId: number) {
    const t = await this.load(exerciseId);
    const problems = t.variables.length ? checkTemplate(t, true) : [];
    return { data: { exerciseId, questionbankType: t.questionbankType, template: t, variables: describeVariables(t), problems } };
  }

  /**
   * New questions for an exercise: what a quiz gets each time it calls the exercise. A template
   * exercise gets new numbers; an exercise without variables comes back as it is.
   */
  async questions(exerciseId: number, count = 15, seed?: number) {
    if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) throw new BadRequestException(`count must be a whole number from 1 to ${MAX_COUNT}`);
    return { data: await this.serve(await this.load(exerciseId), count, seed) };
  }

  /** A quiz for a micro lesson: one freshly generated question per exercise, in the exercise order. */
  async quiz(microLessonId: number, seed?: number) {
    const [ml] = await this.prisma.$queryRawUnsafe<Row[]>('SELECT id, name FROM bx_block_profile_micro_lessons WHERE id = $1', microLessonId);
    if (!ml) throw new NotFoundException('Micro lesson not found');
    const ordered = await hasDbChange(this.prisma, 'exerciseOrder');
    const ids = (
      await this.prisma.$queryRawUnsafe<Row[]>(
        ordered ? 'SELECT id FROM exercises WHERE micro_lesson_id = $1 ORDER BY position, id' : 'SELECT id FROM bx_block_assessmenttest_assessments WHERE micro_lesson_id = $1 ORDER BY id',
        microLessonId,
      )
    ).map((r) => Number(r.id));
    const exercises: Row[] = [];
    for (const [i, id] of ids.entries()) {
      const t = await this.load(id).catch(() => null);
      if (!t || t.questionId == null) continue;
      try {
        const served = await this.serve(t, 1, seed == null ? undefined : seed + i);
        exercises.push({ exerciseId: id, name: t.name, generated: served.generated, question: served.questions[0] ?? null, note: served.note });
      } catch (e) {
        // A template the generator cannot read (a variable without range, a broken formula) is shown as it is, with why.
        const note = (e as { response?: { message?: string } }).response?.message ?? (e as Error).message;
        exercises.push({ exerciseId: id, name: t.name, generated: false, question: brief({ ...t, values: {}, answer: answerText(t) }), note: `Cannot generate: ${note}` });
      }
    }
    return { data: { microLessonId, name: ml.name, exercises } };
  }

  private async serve(t: LoadedTemplate, count: number, seed?: number) {
    const base = { exerciseId: t.exerciseId, name: t.name, questionbankType: t.questionbankType };
    if (t.questionId == null) throw new BadRequestException(`Exercise ${t.exerciseId} has no question yet`);
    if (!t.variables.length) {
      // Nothing to generate: the question as it is.
      const note = t.questionbankType === 'template' ? 'This template exercise has no variables, so it cannot change. Add its variables.' : undefined;
      return { ...base, generated: false, questions: [brief({ ...t, values: {}, answer: answerText(t) })], note };
    }
    const r = guard(() => generate(t, { count, seed, strict: false }));
    return { ...base, generated: true, questions: r.variants.map(brief), requested: r.requested, note: r.note, seed: r.seed };
  }

  /** Reads an exercise with its question, option groups and variables (through the Rails names). */
  private async load(exerciseId: number): Promise<LoadedTemplate> {
    const [ex] = await this.prisma.$queryRawUnsafe<Row[]>('SELECT id, name FROM bx_block_assessmenttest_assessments WHERE id = $1', exerciseId);
    if (!ex) throw new NotFoundException('Exercise not found');
    const [q] = await this.prisma.$queryRawUnsafe<Row[]>(
      'SELECT id, question_type, questionbank_type, question, question_body, hint, solution FROM bx_block_assessmenttest_questionbanks WHERE assessment_id = $1 ORDER BY id LIMIT 1',
      exerciseId,
    );
    const options = q
      ? await this.prisma.$queryRawUnsafe<Row[]>(
          `SELECT g.id AS group_id, g.shape_type, o.option, o.is_correct, o.sequence_number FROM answer_option_groups g
           JOIN bx_block_assessmenttest_answer_options o ON o.answer_option_group_id = g.id WHERE g.questionbank_id = $1 ORDER BY g.id, o.id`,
          q.id,
        )
      : [];
    const groups: TemplateGroup[] = [];
    const byId = new Map<string, TemplateGroup>();
    for (const o of options) {
      const key = String(o.group_id);
      if (!byId.has(key)) {
        const g: TemplateGroup = { shapeType: o.shape_type ?? null, options: [] };
        byId.set(key, g);
        groups.push(g);
      }
      byId.get(key)!.options.push({ option: o.option ?? '', isCorrect: !!o.is_correct, sequenceNumber: o.sequence_number == null ? null : Number(o.sequence_number) });
    }
    const variables: TemplateVariable[] = q
      ? (await this.prisma.$queryRawUnsafe<Row[]>('SELECT name, value_type, min_val, max_val, formula FROM bx_block_assessmenttest_variables WHERE questionbank_id = $1 ORDER BY id', q.id)).map((v) => ({
          name: String(v.name).trim(),
          type: v.value_type === 'float' ? 'float' : 'integer',
          min: v.min_val == null ? null : Number(v.min_val),
          max: v.max_val == null ? null : Number(v.max_val),
          formula: v.formula?.trim() ? String(v.formula).trim() : null,
        }))
      : [];
    return {
      exerciseId: Number(ex.id),
      name: ex.name,
      questionId: q ? Number(q.id) : null,
      questionbankType: q?.questionbank_type ?? null,
      questionType: q ? Number(q.question_type) : 6,
      question: q?.question ?? '',
      questionBody: q?.question_body ?? null,
      hint: q?.hint ?? '',
      solution: q?.solution ?? '',
      groups,
      variables,
      shuffleOptions: q ? Number(q.question_type) === 2 && variables.length > 0 : false,
    };
  }

  /** Replaces the question's variables (same rows Rails' "Variables" form writes). */
  private async writeVariables(tx: Tx, questionId: number, variables: TemplateVariable[]) {
    await tx.$executeRawUnsafe('DELETE FROM bx_block_assessmenttest_variables WHERE questionbank_id = $1', questionId);
    for (const v of variables) {
      await tx.$executeRawUnsafe(
        `INSERT INTO bx_block_assessmenttest_variables (questionbank_id, name, value_type, min_val, max_val, formula, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, now(), now())`,
        questionId,
        v.name,
        v.type ?? 'integer',
        v.min ?? null,
        v.max ?? null,
        v.formula ?? null,
      );
    }
  }

  /** The name, or the name with (2), (3), ... when the micro lesson already has it. */
  private async freeName(microLessonId: number, wanted: string) {
    const base = wanted.slice(0, 92);
    for (let n = 1; n < 100; n++) {
      const name = n === 1 ? base : `${base} (${n})`;
      const taken = await this.prisma.$queryRawUnsafe<Row[]>(
        'SELECT 1 FROM bx_block_assessmenttest_assessments WHERE micro_lesson_id = $1 AND lower(name) = lower($2) LIMIT 1',
        microLessonId,
        name,
      );
      if (!taken.length) return name;
    }
    throw new BadRequestException('Choose another name: this one is taken in the micro lesson');
  }
}

interface LoadedTemplate extends QuestionTemplate {
  exerciseId: number;
  name: string;
  questionId: number | null;
  questionbankType: string | null;
}

const answerText = (t: QuestionTemplate) =>
  t.questionType === 3 || t.questionType === 5
    ? (t.groups[0]?.options ?? []).filter((o) => o.sequenceNumber != null).sort((a, b) => (a.sequenceNumber ?? 0) - (b.sequenceNumber ?? 0)).map((o) => o.option).join(', ')
    : t.groups.flatMap((g) => g.options.filter((o) => o.isCorrect).map((o) => o.option)).join(', ');
