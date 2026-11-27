import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ExerciseEditorService } from '../admin/exercises/exercise-editor.service';
import { hasDbChange } from '../common/db-changes';
import { PrismaService } from '../prisma/prisma.service';
import { detectTemplates } from './detect';
import { ExerciseWriter } from './exercise-writer';
import { IMPORT_TYPES, ImportQuestion, importProblems, toQuestion } from './import';
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
    private readonly writer: ExerciseWriter,
  ) {}

  // ---------- Paste questions ("Add an exercise" text box) ----------

  /**
   * Reads pasted questions with their answers into exercises of the chosen type, without saving.
   * Plain arithmetic lines ("2+3=5") of a type Part A knows become one template each (new numbers
   * every time); anything else is read by Claude into the type's answer fields.
   */
  async importPreview(body: Row) {
    const type = Number(body?.type);
    const t = IMPORT_TYPES[type];
    if (!t?.legacy) throw new BadRequestException('Choose an exercise type that can be created');
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    if (!text) throw new BadRequestException('Paste at least one question');
    if (text.length > 20000) throw new BadRequestException('That is too much text at once: paste at most about 20 questions');

    const lines = text.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
    if (t.partA && body?.generate !== false && lines.length <= 200) {
      try {
        const r = detectTemplates(lines, { type: t.partA as never });
        if (!r.skipped.length) {
          return {
            data: {
              source: 'template',
              items: r.templates.map((d) => ({ kind: 'template', partAType: t.partA, ...summary(d, 3) })),
              skipped: [],
            },
          };
        }
      } catch (e) {
        if (!(e instanceof TemplateError)) throw e;
      }
    }

    const out = await this.writer.read(type, text);
    const items = out.exercises.map((x) => {
      const question = toQuestion(type, x);
      return { kind: 'exercise', question, problems: importProblems(type, question) };
    });
    if (!items.length) throw new BadRequestException({ message: `No ${t.name} question found in the text`, problems: out.skipped.map((s) => `${s.text}: ${s.reason}`) });
    return { data: { source: 'claude', items, skipped: out.skipped } };
  }

  /**
   * Saves the items of a preview as exercises at the end of the micro lesson: a template item through
   * Part A, an exercise item through the editor (same checks as the editor's Save).
   */
  async importSave(body: Row) {
    const microLessonId = Number(body?.microLessonId);
    if (!Number.isInteger(microLessonId) || microLessonId < 1) throw new BadRequestException('microLessonId is required');
    const items: Row[] = Array.isArray(body?.items) ? body.items : [];
    if (!items.length) throw new BadRequestException('Nothing to save');
    if (items.length > 50) throw new BadRequestException('Save at most 50 exercises at once');
    const isAha = !!body?.isAha;
    const created: Row[] = [];
    const failed: Row[] = [];
    for (const [i, item] of items.entries()) {
      const wanted = typeof item?.name === 'string' && item.name.trim() ? item.name.trim().replace(/\s+/g, ' ') : `Exercise ${i + 1}`;
      try {
        if (item?.kind === 'template') {
          const r = await this.save({ examples: item.examples, type: item.partAType, microLessonId, name: wanted, isAha });
          for (const s of r.data.saved as Row[]) created.push({ exerciseId: s.exerciseId, name: s.name, kind: 'template' });
          continue;
        }
        const q = item?.question as ImportQuestion | undefined;
        if (!q || typeof q !== 'object') throw new BadRequestException('Missing question');
        const name = await this.freeName(microLessonId, wanted);
        const id = (await this.editor.create({ microLessonId, name, isAha })).data.id;
        try {
          await this.editor.save(id, { name, isAha, question: { ...q, id: null, groups: (q.groups ?? []).map((g) => ({ ...g, id: null, options: g.options.map((o) => ({ ...o, id: null })) })) } });
        } catch (e) {
          await this.editor.remove(id).catch(() => undefined);
          throw e;
        }
        created.push({ exerciseId: id, name, kind: 'exercise' });
      } catch (e) {
        const res = (e as { response?: { message?: string; problems?: string[] } }).response;
        failed.push({ index: i, name: wanted, problems: res?.problems ?? [res?.message ?? (e as Error).message] });
      }
    }
    return { data: { created, failed } };
  }

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
    // linkTo: other micro lessons whose quizzes also use the saved templates (change 005).
    const linkTo = body?.linkTo == null ? [] : Array.isArray(body.linkTo) ? body.linkTo.map(Number) : [Number(body.linkTo)];
    if (linkTo.length) {
      if (linkTo.some((x: number) => !Number.isInteger(x) || x < 1)) throw new BadRequestException('linkTo must be a list of micro lesson ids');
      await this.needLinks();
      for (const ml of linkTo) await this.microLesson(ml);
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
      const links: Row[] = [];
      for (const ml of linkTo) {
        const [had] = await this.prisma.$queryRawUnsafe<Row[]>('SELECT 1 FROM question_template_links WHERE micro_lesson_id = $1 AND exercise_id = $2', ml, id);
        const [own] = await this.prisma.$queryRawUnsafe<Row[]>('SELECT micro_lesson_id FROM bx_block_assessmenttest_assessments WHERE id = $1', id);
        if (!had && Number(own?.micro_lesson_id) !== ml) links.push((await this.link(ml, { exerciseId: id })).data);
      }
      saved.push({ exerciseId: id, name: exerciseName, type: d.typeName, pattern: d.pattern, variables: describeVariables(t), sample: sample ? brief(sample) : null, links });
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

  /**
   * A quiz for a micro lesson: one freshly generated question per exercise of the micro lesson, in
   * the exercise order, then the templates linked to it (question_template_links, change 005), each
   * giving its question_count new questions.
   */
  async quiz(microLessonId: number, seed?: number) {
    const ml = await this.microLesson(microLessonId);
    const ordered = await hasDbChange(this.prisma, 'exerciseOrder');
    const own = (
      await this.prisma.$queryRawUnsafe<Row[]>(
        ordered ? 'SELECT id FROM exercises WHERE micro_lesson_id = $1 ORDER BY position, id' : 'SELECT id FROM bx_block_assessmenttest_assessments WHERE micro_lesson_id = $1 ORDER BY id',
        microLessonId,
      )
    ).map((r) => ({ id: Number(r.id), count: 1, linkId: null as number | null }));
    const linked = (await this.linkRows(microLessonId)).map((r) => ({ id: Number(r.exercise_id), count: Number(r.question_count), linkId: Number(r.id) }));
    const exercises: Row[] = [];
    for (const [i, item] of [...own, ...linked].entries()) {
      const t = await this.load(item.id).catch(() => null);
      if (!t || t.questionId == null) continue;
      const base = { exerciseId: item.id, name: t.name, source: item.linkId == null ? 'own' : 'linked', linkId: item.linkId };
      try {
        const served = await this.serve(t, item.count, seed == null ? undefined : seed + i);
        for (const question of served.questions) exercises.push({ ...base, generated: served.generated, question, note: served.note });
      } catch (e) {
        // A template the generator cannot read (a variable without range, a broken formula) is shown as it is, with why.
        const note = (e as { response?: { message?: string } }).response?.message ?? (e as Error).message;
        exercises.push({ ...base, generated: false, question: brief({ ...t, values: {}, answer: answerText(t) }), note: `Cannot generate: ${note}` });
      }
    }
    return { data: { microLessonId, name: ml.name, exercises } };
  }

  // ---------- Part B links: one template feeds many quizzes (change 005) ----------

  /** The templates linked to a micro lesson's quiz, in order. */
  async links(microLessonId: number) {
    await this.microLesson(microLessonId);
    await this.needLinks();
    return { data: await this.linkList('l.micro_lesson_id = $1', microLessonId) };
  }

  /** The quizzes a template exercise is linked to. */
  async linksOfExercise(exerciseId: number) {
    await this.needLinks();
    await this.load(exerciseId);
    return { data: await this.linkList('l.exercise_id = $1', exerciseId) };
  }

  /** Links a template exercise to a micro lesson's quiz (at the end, unless position is given). */
  async link(microLessonId: number, body: Record<string, any>) {
    await this.microLesson(microLessonId);
    await this.needLinks();
    const exerciseId = Number(body.exerciseId);
    if (!Number.isInteger(exerciseId) || exerciseId < 1) throw new BadRequestException('exerciseId is required');
    const count = countOf(body.questionCount ?? 1);
    const t = await this.load(exerciseId);
    if (!t.variables.length) throw new BadRequestException(`Exercise ${exerciseId} is not a template: it has no variables, so it would give the same question each time`);
    const [own] = await this.prisma.$queryRawUnsafe<Row[]>('SELECT micro_lesson_id FROM bx_block_assessmenttest_assessments WHERE id = $1', exerciseId);
    if (Number(own?.micro_lesson_id) === microLessonId) throw new BadRequestException('This exercise is already in the micro lesson, so its quiz already uses it');
    const [dup] = await this.prisma.$queryRawUnsafe<Row[]>('SELECT id FROM question_template_links WHERE micro_lesson_id = $1 AND exercise_id = $2', microLessonId, exerciseId);
    if (dup) throw new BadRequestException('This template is already linked to the micro lesson');
    const position = body.position == null ? null : positionOf(body.position);
    const [row] = await this.prisma.$queryRawUnsafe<Row[]>(
      `INSERT INTO question_template_links (exercise_id, micro_lesson_id, position, question_count)
       VALUES ($1, $2, COALESCE($3::int, (SELECT COALESCE(max(position), 0) + 1 FROM question_template_links WHERE micro_lesson_id = $2)), $4)
       RETURNING id`,
      exerciseId,
      microLessonId,
      position,
      count,
    );
    return { data: (await this.linkList('l.id = $1', Number(row.id)))[0] };
  }

  /** Changes how many questions a link gives, or its position. */
  async updateLink(microLessonId: number, linkId: number, body: Record<string, any>) {
    await this.needLinks();
    await this.linkOf(microLessonId, linkId);
    const count = body.questionCount == null ? null : countOf(body.questionCount);
    const position = body.position == null ? null : positionOf(body.position);
    await this.prisma.$executeRawUnsafe(
      'UPDATE question_template_links SET question_count = COALESCE($2::int, question_count), position = COALESCE($3::int, position), updated_at = now() WHERE id = $1',
      linkId,
      count,
      position,
    );
    return { data: (await this.linkList('l.id = $1', linkId))[0] };
  }

  /** Removes a link (the template exercise stays). */
  async unlink(microLessonId: number, linkId: number) {
    await this.needLinks();
    await this.linkOf(microLessonId, linkId);
    await this.prisma.$executeRawUnsafe('DELETE FROM question_template_links WHERE id = $1', linkId);
    return { data: { id: linkId, deleted: true } };
  }

  private async needLinks() {
    if (!(await hasDbChange(this.prisma, 'templateLinks'))) {
      throw new BadRequestException('Linking templates to quizzes needs database change 005 (question_template_links)');
    }
  }

  private async linkRows(microLessonId: number): Promise<Row[]> {
    if (!(await hasDbChange(this.prisma, 'templateLinks'))) return [];
    return this.prisma.$queryRawUnsafe<Row[]>('SELECT id, exercise_id, question_count FROM question_template_links WHERE micro_lesson_id = $1 ORDER BY position, id', microLessonId);
  }

  private async linkOf(microLessonId: number, linkId: number) {
    const [row] = await this.prisma.$queryRawUnsafe<Row[]>('SELECT id FROM question_template_links WHERE id = $1 AND micro_lesson_id = $2', linkId, microLessonId);
    if (!row) throw new NotFoundException('Link not found');
  }

  private async linkList(where: string, id: number) {
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT l.id, l.exercise_id, a.name AS exercise_name, a.micro_lesson_id AS template_micro_lesson_id,
              l.micro_lesson_id, m.name AS micro_lesson_name, l.position, l.question_count
       FROM question_template_links l
       JOIN bx_block_assessmenttest_assessments a ON a.id = l.exercise_id
       JOIN bx_block_profile_micro_lessons m ON m.id = l.micro_lesson_id
       WHERE ${where} ORDER BY l.micro_lesson_id, l.position, l.id`,
      id,
    );
    return rows.map((r) => ({
      id: Number(r.id),
      exerciseId: Number(r.exercise_id),
      exerciseName: r.exercise_name,
      templateMicroLessonId: r.template_micro_lesson_id == null ? null : Number(r.template_micro_lesson_id),
      microLessonId: Number(r.micro_lesson_id),
      microLessonName: r.micro_lesson_name,
      position: Number(r.position),
      questionCount: Number(r.question_count),
    }));
  }

  private async microLesson(microLessonId: number) {
    const [ml] = await this.prisma.$queryRawUnsafe<Row[]>('SELECT id, name FROM bx_block_profile_micro_lessons WHERE id = $1', microLessonId);
    if (!ml) throw new NotFoundException('Micro lesson not found');
    return ml;
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

const countOf = (v: unknown) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 50) throw new BadRequestException('questionCount must be a whole number from 1 to 50');
  return n;
};
const positionOf = (v: unknown) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new BadRequestException('position must be a whole number from 1');
  return n;
};

const answerText = (t: QuestionTemplate) =>
  t.questionType === 3 || t.questionType === 5
    ? (t.groups[0]?.options ?? []).filter((o) => o.sequenceNumber != null).sort((a, b) => (a.sequenceNumber ?? 0) - (b.sequenceNumber ?? 0)).map((o) => o.option).join(', ')
    : t.groups.flatMap((g) => g.options.filter((o) => o.isCorrect).map((o) => o.option)).join(', ');
