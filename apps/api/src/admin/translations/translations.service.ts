import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { hasDbChange } from '../../common/db-changes';
import { askClaude, claudeConfigured } from '../latex/claude';

/**
 * Translations of micro lesson content (the language tabs of the admin workspace).
 *
 * The Rails database has no place for per-language content, so translations live in two
 * admin-owned tables, created here when missing. They only add data: no Rails table or column
 * is changed, and Rails never reads them.
 */
export type LevelType = 'grade' | 'subject' | 'master' | 'main' | 'unit' | 'lesson';
export type ItemType = 'micro_lesson' | 'exercise' | 'question' | 'option' | LevelType;
export const LEVEL_TYPES: LevelType[] = ['grade', 'subject', 'master', 'main', 'unit', 'lesson'];
export type Status = 'auto' | 'edited' | 'reviewed';

export const ITEM_FIELDS: Record<ItemType, string[]> = {
  micro_lesson: ['name', 'description'],
  exercise: ['name'],
  question: ['question', 'questionBody', 'hint', 'solution'],
  option: ['option'],
  grade: ['name'],
  subject: ['name'],
  master: ['name'],
  main: ['name'],
  unit: ['name'],
  lesson: ['name'],
};

const ITEM_SQL: Record<ItemType, { table: string; columns: Record<string, string> }> = {
  micro_lesson: { table: 'bx_block_profile_micro_lessons', columns: { name: 'name', description: 'description' } },
  exercise: { table: 'bx_block_assessmenttest_assessments', columns: { name: 'name' } },
  question: { table: 'bx_block_assessmenttest_questionbanks', columns: { question: 'question', questionBody: 'question_body', hint: 'hint', solution: 'solution' } },
  option: { table: 'bx_block_assessmenttest_answer_options', columns: { option: 'option' } },
  grade: { table: 'categories', columns: { name: 'name' } },
  subject: { table: 'sub_categories', columns: { name: 'name' } },
  master: { table: 'bx_block_profile_courses', columns: { name: 'course_name' } },
  main: { table: 'bx_block_profile_mains', columns: { name: 'name' } },
  unit: { table: 'bx_block_profile_units', columns: { name: 'name' } },
  lesson: { table: 'bx_block_profile_lessons', columns: { name: 'name' } },
};

/** Items created from this moment on default to English as their original language. */
export const ENGLISH_PRIMARY_FROM = Date.parse('2026-11-23T15:45:00Z');

const STATUSES: Status[] = ['auto', 'edited', 'reviewed'];

/** Exercise, question and option translations: own tables once DB change 002 is applied. */
const isExerciseItem = (type: string): type is 'exercise' | 'question' | 'option' => type === 'exercise' || type === 'question' || type === 'option';

/** Admin field name → exercise_translations column. */
const EXERCISE_COLUMNS: Record<string, string> = { name: 'name', question: 'question', questionBody: 'question_body', hint: 'hint', solution: 'solution' };

/** Reads translations from the change-002 tables in the same row shape as admin_content_translations. */
const EXERCISE_TRANSLATIONS_SQL: Record<'exercise' | 'question' | 'option', string> = {
  exercise: `SELECT 'exercise' AS item_type, t.exercise_id AS item_id, 'name' AS field, t.language_id, t.name AS value,
                    COALESCE(t.status ->> 'name', 'auto') AS status, t.source_hash ->> 'name' AS source_hash, t.updated_by, t.updated_at
             FROM exercise_translations t WHERE t.exercise_id = ANY($1::bigint[]) AND t.name IS NOT NULL`,
  question: `SELECT 'question' AS item_type, e.question_id AS item_id, f.field, t.language_id, f.value,
                    COALESCE(t.status ->> f.field, 'auto') AS status, t.source_hash ->> f.field AS source_hash, t.updated_by, t.updated_at
             FROM exercise_translations t JOIN exercises e ON e.id = t.exercise_id
             CROSS JOIN LATERAL (VALUES ('question', t.question), ('questionBody', t.question_body), ('hint', t.hint), ('solution', t.solution)) f (field, value)
             WHERE e.question_id = ANY($1::bigint[]) AND f.value IS NOT NULL`,
  option: `SELECT 'option' AS item_type, option_id AS item_id, 'option' AS field, language_id, option AS value, status, source_hash, updated_by, updated_at
           FROM exercise_option_translations WHERE option_id = ANY($1::bigint[])`,
};

export const SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS admin_content_translations (
    id bigserial PRIMARY KEY,
    item_type varchar NOT NULL,
    item_id bigint NOT NULL,
    field varchar NOT NULL,
    language_id bigint NOT NULL,
    value text NOT NULL,
    status varchar NOT NULL DEFAULT 'auto',
    source_hash varchar,
    updated_by varchar,
    created_at timestamp(6) NOT NULL DEFAULT now(),
    updated_at timestamp(6) NOT NULL DEFAULT now(),
    UNIQUE (item_type, item_id, field, language_id)
  )`,
  `CREATE TABLE IF NOT EXISTS admin_content_languages (
    item_type varchar NOT NULL,
    item_id bigint NOT NULL,
    original_language_id bigint NOT NULL,
    updated_at timestamp(6) NOT NULL DEFAULT now(),
    PRIMARY KEY (item_type, item_id)
  )`,
];

export const hashOf = (value: unknown) => createHash('md5').update(String(value ?? '')).digest('hex');

type Row = Record<string, any>;

export interface Language {
  id: number;
  name: string;
  code: string;
  flag: string;
}

export interface Item {
  type: ItemType;
  id: number;
  fields: Record<string, string | null>;
}

export const TRANSLATE_SYSTEM_PROMPT = String.raw`You translate content of the Tedix maths learning app for children.

You get a JSON object whose values are texts in the source language. Answer with a JSON object with exactly the same keys, each value translated into the target language.

Rules:
- Translate only human language. Keep every number, formula and LaTeX command exactly as it is.
- Some values are LaTeX strings in math mode: words are inside \text{...}. Translate only the words inside \text{...}; keep everything else, including spacing inside \text{} next to formulas, the " \\ " line separators and image keys such as tedimageone, unchanged.
- Some values contain HTML: keep every tag and attribute, translate only the text between tags.
- Keep the tone simple and friendly for school children, and use the usual maths terms of the target language.
- Never add, drop or explain anything. Reply with the JSON object only, no code fences.`;

@Injectable()
export class TranslationsService implements OnModuleInit {
  private readonly logger = new Logger(TranslationsService.name);
  private ready: Promise<boolean> | null = null;
  private hasExerciseTables = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    void this.ensureTables();
  }

  /** Creates the two translation tables when missing. Resolves false while the database is unreachable. */
  ensureTables(): Promise<boolean> {
    this.ready ??= (async () => {
      try {
        for (const sql of SCHEMA_SQL) await this.prisma.$executeRawUnsafe(sql);
        return true;
      } catch (e) {
        this.logger.warn(`Translation tables not ready: ${(e as Error).message.split('\n').pop()}`);
        this.ready = null;
        return false;
      }
    })();
    return this.ready;
  }

  async languages(): Promise<Language[]> {
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT id, name, language_code, emoji_flag FROM bx_block_language_options_languages ORDER BY id`,
    );
    return rows.map((r) => ({ id: Number(r.id), name: r.name, code: r.language_code, flag: r.emoji_flag }));
  }

  private async originalLanguageId(itemId: number, languages: Language[], itemType: ItemType = 'micro_lesson'): Promise<number | null> {
    const [row] = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT original_language_id FROM admin_content_languages WHERE item_type = $2 AND item_id = $1`,
      itemId,
      itemType,
    );
    if (row) return Number(row.original_language_id);
    // Content written before English became the primary language is Romanian; anything newer is English.
    const def = ITEM_SQL[itemType];
    const [item] = def
      ? await this.prisma.$queryRawUnsafe<Row[]>(`SELECT created_at FROM ${def.table} WHERE id = $1`, itemId).catch(() => [] as Row[])
      : [];
    const isNew = !!item?.created_at && new Date(item.created_at).getTime() >= ENGLISH_PRIMARY_FROM;
    const pick = isNew
      ? languages.find((l) => /^english/i.test(l.name) || /^EN/i.test(l.code))
      : languages.find((l) => /^roman/i.test(l.name) || /^RO/i.test(l.code));
    return (pick ?? languages[0])?.id ?? null;
  }

  async setOriginalLanguage(microLessonId: number, languageId: number) {
    await this.storeOriginalLanguage('micro_lesson', microLessonId, languageId);
    return this.workspace(microLessonId);
  }

  private async storeOriginalLanguage(itemType: ItemType, itemId: number, languageId: number) {
    await this.ensureReady();
    const languages = await this.languages();
    if (!languages.some((l) => l.id === languageId)) throw new BadRequestException('Unknown language');
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO admin_content_languages (item_type, item_id, original_language_id, updated_at) VALUES ($3, $1, $2, now())
       ON CONFLICT (item_type, item_id) DO UPDATE SET original_language_id = EXCLUDED.original_language_id, updated_at = now()`,
      itemId,
      languageId,
      itemType,
    );
  }

  static levelType(value: string): LevelType {
    if (!(LEVEL_TYPES as string[]).includes(value)) throw new BadRequestException('Unknown curriculum level');
    return value as LevelType;
  }

  /** Language tabs of one Grade, Subject, Master, Main, Unit or Lesson: its name in the original and each translation. */
  async levelWorkspace(type: LevelType, id: number) {
    await this.ensureReady();
    const fields: Record<string, string | null> = {};
    for (const f of ITEM_FIELDS[type]) fields[f] = await this.currentValue(type, id, f);
    const languages = await this.languages();
    const originalLanguageId = await this.originalLanguageId(id, languages, type);
    const translations = await this.translationsOf([{ type, id, fields }]);
    return { data: { item: { type, id, ...fields }, languages, originalLanguageId, aiConfigured: claudeConfigured(), translations } };
  }

  async setLevelOriginalLanguage(type: LevelType, id: number, languageId: number) {
    await this.currentValue(type, id, 'name');
    await this.storeOriginalLanguage(type, id, languageId);
    return this.levelWorkspace(type, id);
  }

  /** Machine translation of a level's name into the chosen languages; own wording is kept unless `replaceEdited`. */
  async translateLevel(type: LevelType, id: number, body: { languageIds?: unknown; replaceEdited?: boolean }, by: string | null, fetchImpl?: typeof fetch) {
    const { data } = await this.levelWorkspace(type, id);
    const targets = (Array.isArray(body.languageIds) ? body.languageIds.map(Number) : []).filter(
      (l) => l !== data.originalLanguageId && data.languages.some((x) => x.id === l),
    );
    if (!targets.length) throw new BadRequestException('Choose at least one language to translate into');
    const original = data.languages.find((l) => l.id === data.originalLanguageId);
    const source: Record<string, string> = {};
    for (const f of ITEM_FIELDS[type]) {
      const v = (data.item as Row)[f];
      if (typeof v === 'string' && v.trim()) source[`${type}:${id}:${f}`] = v;
    }
    const existing = new Map(data.translations.map((t) => [`${t.itemType}:${t.itemId}:${t.field}:${t.languageId}`, t]));
    const results: Array<{ languageId: number; translated: number; kept: number; error?: string }> = [];
    for (const languageId of targets) {
      const language = data.languages.find((l) => l.id === languageId)!;
      const todo: Record<string, string> = {};
      let kept = 0;
      for (const [key, value] of Object.entries(source)) {
        const t = existing.get(`${key}:${languageId}`);
        if (t && t.status !== 'auto' && !body.replaceEdited) kept++;
        else todo[key] = value;
      }
      if (!Object.keys(todo).length) {
        results.push({ languageId, translated: 0, kept });
        continue;
      }
      try {
        const translated = await this.translateBatch(todo, original?.name ?? 'the source language', language.name, fetchImpl);
        let count = 0;
        for (const [key, value] of Object.entries(translated)) {
          if (!(key in todo) || typeof value !== 'string' || !value.trim()) continue;
          const [, , field] = key.split(':');
          await this.upsert(type, id, field, languageId, value.trim(), 'auto', hashOf(todo[key]), by);
          count++;
        }
        results.push({ languageId, translated: count, kept });
      } catch (e) {
        results.push({ languageId, translated: 0, kept, error: (e as Error).message });
      }
    }
    return { data: { results } };
  }

  private async ensureReady() {
    if (!(await this.ensureTables())) throw new BadRequestException('The translation tables could not be created. Check the database connection.');
  }

  /** Everything the micro lesson workspace shows: content items in the original and their translations. */
  async workspace(microLessonId: number) {
    await this.ensureReady();
    const [lesson] = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT id, name, description, micro_lesson_type, position, updated_at FROM bx_block_profile_micro_lessons WHERE id = $1`,
      microLessonId,
    );
    if (!lesson) throw new NotFoundException('Micro lesson not found');

    const ordered = await hasDbChange(this.prisma, 'exerciseOrder');
    const exercises = await this.prisma.$queryRawUnsafe<Row[]>(
      ordered
        ? `SELECT id, name, category_type, is_aha, position, needs_review, review_note FROM exercises WHERE micro_lesson_id = $1 ORDER BY position, id`
        : `SELECT id, name, category_type, is_aha, NULL::int AS position, false AS needs_review, NULL AS review_note
           FROM bx_block_assessmenttest_assessments WHERE micro_lesson_id = $1 ORDER BY id`,
      microLessonId,
    );
    const exerciseIds = exercises.map((e) => e.id);
    const questions = exerciseIds.length
      ? await this.prisma.$queryRawUnsafe<Row[]>(
          `SELECT id, assessment_id, question, question_body, hint, solution, question_type, questionbank_type FROM bx_block_assessmenttest_questionbanks
           WHERE assessment_id = ANY($1::bigint[]) ORDER BY id`,
          exerciseIds,
        )
      : [];
    const questionIds = questions.map((q) => q.id);
    const options = questionIds.length
      ? await this.prisma.$queryRawUnsafe<Row[]>(
          `SELECT o.id, o.option, o.is_correct, o.sequence_number, g.id AS group_id, g.shape_type, g.questionbank_id
           FROM bx_block_assessmenttest_answer_options o JOIN answer_option_groups g ON g.id = o.answer_option_group_id
           WHERE g.questionbank_id = ANY($1::bigint[]) ORDER BY g.id, o.sequence_number NULLS LAST, o.id`,
          questionIds,
        )
      : [];

    const languages = await this.languages();
    const originalLanguageId = await this.originalLanguageId(microLessonId, languages);

    const items: Item[] = [
      { type: 'micro_lesson', id: Number(lesson.id), fields: { name: lesson.name, description: lesson.description } },
      ...exercises.map((e) => ({ type: 'exercise' as const, id: Number(e.id), fields: { name: e.name } })),
      ...questions.map((q) => ({
        type: 'question' as const,
        id: Number(q.id),
        fields: { question: q.question, questionBody: q.question_body, hint: q.hint, solution: q.solution },
      })),
      ...options.map((o) => ({ type: 'option' as const, id: Number(o.id), fields: { option: o.option } })),
    ];
    const translations = await this.translationsOf(items);

    return {
      data: {
        lesson: {
          id: Number(lesson.id),
          name: lesson.name,
          description: lesson.description,
          microLessonType: lesson.micro_lesson_type,
          position: lesson.position,
          updatedAt: lesson.updated_at,
        },
        languages,
        originalLanguageId,
        aiConfigured: claudeConfigured(),
        canReorder: ordered,
        exercises: exercises.map((e) => ({
          id: Number(e.id),
          name: e.name,
          categoryType: e.category_type,
          isAha: e.is_aha,
          position: e.position == null ? null : Number(e.position),
          needsReview: !!e.needs_review,
          reviewNote: e.review_note ?? null,
          questions: questions
            .filter((q) => Number(q.assessment_id) === Number(e.id))
            .map((q) => ({
              id: Number(q.id),
              questionType: q.question_type,
              questionbankType: q.questionbank_type,
              question: q.question,
              questionBody: q.question_body,
              hint: q.hint,
              solution: q.solution,
              options: options
                .filter((o) => Number(o.questionbank_id) === Number(q.id))
                .map((o) => ({ id: Number(o.id), groupId: Number(o.group_id), option: o.option, isCorrect: !!o.is_correct, sequenceNumber: o.sequence_number, shapeType: o.shape_type ?? null })),
            })),
        })),
        translations,
      },
    };
  }

  private async translationsOf(items: Item[]) {
    if (!items.length) return [];
    const byType = new Map<string, number[]>();
    for (const i of items) byType.set(i.type, [...(byType.get(i.type) ?? []), i.id]);
    const rows: Row[] = [];
    const exerciseTables = await this.exerciseTables();
    for (const [type, ids] of byType) {
      if (exerciseTables && isExerciseItem(type)) {
        rows.push(...(await this.prisma.$queryRawUnsafe<Row[]>(EXERCISE_TRANSLATIONS_SQL[type], ids)));
        continue;
      }
      rows.push(
        ...(await this.prisma.$queryRawUnsafe<Row[]>(
          `SELECT item_type, item_id, field, language_id, value, status, source_hash, updated_by, updated_at
           FROM admin_content_translations WHERE item_type = $1 AND item_id = ANY($2::bigint[])`,
          type,
          ids,
        )),
      );
    }
    const source = new Map<string, string | null>(items.flatMap((i) => Object.entries(i.fields).map(([f, v]) => [`${i.type}:${i.id}:${f}`, v] as [string, string | null])));
    return rows.map((r) => {
      const original = source.get(`${r.item_type}:${r.item_id}:${r.field}`);
      return {
        itemType: r.item_type as ItemType,
        itemId: Number(r.item_id),
        field: r.field as string,
        languageId: Number(r.language_id),
        value: r.value as string,
        status: r.status as Status,
        outdated: !!r.source_hash && r.source_hash !== hashOf(original),
        updatedBy: r.updated_by as string | null,
        updatedAt: r.updated_at,
      };
    });
  }

  private async currentValue(itemType: ItemType, itemId: number, field: string): Promise<string | null> {
    const def = ITEM_SQL[itemType];
    const column = def?.columns[field];
    if (!column) throw new BadRequestException('This field cannot be translated');
    const [row] = await this.prisma.$queryRawUnsafe<Row[]>(`SELECT "${column}" AS v FROM ${def.table} WHERE id = $1`, itemId);
    if (!row) throw new NotFoundException('Item not found');
    return row.v;
  }

  private async upsert(itemType: ItemType, itemId: number, field: string, languageId: number, value: string, status: Status, sourceHash: string, by: string | null) {
    if (isExerciseItem(itemType) && (await this.exerciseTables())) {
      if (itemType === 'option') {
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO exercise_option_translations (option_id, language_id, option, status, source_hash, updated_by, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, now(), now())
           ON CONFLICT (option_id, language_id)
           DO UPDATE SET option = EXCLUDED.option, status = EXCLUDED.status, source_hash = EXCLUDED.source_hash, updated_by = EXCLUDED.updated_by, updated_at = now()`,
          itemId, languageId, value, status, sourceHash, by,
        );
        return;
      }
      const column = EXERCISE_COLUMNS[field];
      const exerciseId = await this.exerciseIdOf(itemType, itemId);
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO exercise_translations (exercise_id, language_id, ${column}, status, source_hash, updated_by, created_at, updated_at)
         VALUES ($1, $2, $3, jsonb_build_object($4::text, $5::text), jsonb_build_object($4::text, $6::text), $7, now(), now())
         ON CONFLICT (exercise_id, language_id)
         DO UPDATE SET ${column} = EXCLUDED.${column}, status = exercise_translations.status || EXCLUDED.status,
           source_hash = exercise_translations.source_hash || EXCLUDED.source_hash, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        exerciseId, languageId, value, field, status, sourceHash, by,
      );
      return;
    }
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO admin_content_translations (item_type, item_id, field, language_id, value, status, source_hash, updated_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())
       ON CONFLICT (item_type, item_id, field, language_id)
       DO UPDATE SET value = EXCLUDED.value, status = EXCLUDED.status, source_hash = EXCLUDED.source_hash, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      itemType,
      itemId,
      field,
      languageId,
      value,
      status,
      sourceHash,
      by,
    );
  }

  /**
   * Whether DB change 002 (exercise_translations, exercise_option_translations) is applied. Until it
   * is, exercise, question and option translations stay in admin_content_translations like the rest.
   */
  private async exerciseTables(): Promise<boolean> {
    if (this.hasExerciseTables) return true;
    const [row] = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT to_regclass('exercise_translations') IS NOT NULL AND to_regclass('exercise_option_translations') IS NOT NULL AS ok`,
    );
    this.hasExerciseTables = !!row?.ok;
    return this.hasExerciseTables;
  }

  /** The exercise row an exercise or question item belongs to (a question's item id is its exercises.question_id). */
  private async exerciseIdOf(itemType: ItemType, itemId: number): Promise<number> {
    if (itemType === 'exercise') return itemId;
    const [row] = await this.prisma.$queryRawUnsafe<Row[]>('SELECT id FROM exercises WHERE question_id = $1', itemId);
    if (!row) throw new NotFoundException('Item not found');
    return Number(row.id);
  }

  private async removeTranslation(itemType: ItemType, itemId: number, field: string, languageId: number) {
    if (isExerciseItem(itemType) && (await this.exerciseTables())) {
      if (itemType === 'option') {
        await this.prisma.$executeRawUnsafe('DELETE FROM exercise_option_translations WHERE option_id = $1 AND language_id = $2', itemId, languageId);
        return;
      }
      const column = EXERCISE_COLUMNS[field];
      const exerciseId = await this.exerciseIdOf(itemType, itemId);
      await this.prisma.$executeRawUnsafe(
        `UPDATE exercise_translations SET ${column} = NULL, status = status - $3::text, source_hash = source_hash - $3::text, updated_at = now()
         WHERE exercise_id = $1 AND language_id = $2`,
        exerciseId, languageId, field,
      );
      await this.prisma.$executeRawUnsafe(
        `DELETE FROM exercise_translations WHERE exercise_id = $1 AND language_id = $2
           AND name IS NULL AND question IS NULL AND question_body IS NULL AND hint IS NULL AND solution IS NULL`,
        exerciseId, languageId,
      );
      return;
    }
    await this.prisma.$executeRawUnsafe(
      `DELETE FROM admin_content_translations WHERE item_type = $1 AND item_id = $2 AND field = $3 AND language_id = $4`,
      itemType,
      itemId,
      field,
      languageId,
    );
  }

  /** An admin's own wording for one field in one language (status "edited", or "reviewed" when only approved). */
  async save(input: { itemType?: unknown; itemId?: unknown; field?: unknown; languageId?: unknown; value?: unknown; status?: unknown }, by: string | null) {
    await this.ensureReady();
    const itemType = input.itemType as ItemType;
    if (!(itemType in ITEM_FIELDS) || !ITEM_FIELDS[itemType].includes(String(input.field))) throw new BadRequestException('This field cannot be translated');
    const itemId = Number(input.itemId);
    const languageId = Number(input.languageId);
    if (!Number.isInteger(itemId) || !Number.isInteger(languageId)) throw new BadRequestException('Invalid item or language');
    const value = typeof input.value === 'string' ? input.value.trim() : '';
    const field = String(input.field);
    if (!value) {
      await this.removeTranslation(itemType, itemId, field, languageId);
      return { data: { deleted: true } };
    }
    const status = STATUSES.includes(input.status as Status) ? (input.status as Status) : 'edited';
    const original = await this.currentValue(itemType, itemId, field);
    await this.upsert(itemType, itemId, field, languageId, value, status, hashOf(original), by);
    return { data: { saved: true } };
  }

  /**
   * Machine translation of the micro lesson (name, text content, exercises, questions, options)
   * into the chosen languages. Own wording (edited/reviewed) is kept unless `replaceEdited`,
   * and up-to-date auto translations are skipped unless `onlyMissing` is false.
   */
  async translate(
    microLessonId: number,
    body: { languageIds?: unknown; include?: { text?: boolean; exercises?: boolean }; replaceEdited?: boolean; onlyMissing?: boolean; only?: unknown },
    by: string | null,
    fetchImpl?: typeof fetch,
  ) {
    const { data } = await this.workspace(microLessonId);
    const targets = (Array.isArray(body.languageIds) ? body.languageIds.map(Number) : []).filter(
      (id) => id !== data.originalLanguageId && data.languages.some((l) => l.id === id),
    );
    if (!targets.length) throw new BadRequestException('Choose at least one language to translate into');
    const original = data.languages.find((l) => l.id === data.originalLanguageId);
    const includeText = body.include?.text !== false;
    const includeExercises = body.include?.exercises !== false;

    const source: Record<string, string> = {};
    const put = (type: ItemType, id: number, field: string, value: unknown) => {
      if (typeof value === 'string' && value.trim()) source[`${type}:${id}:${field}`] = value;
    };
    if (includeText) {
      put('micro_lesson', data.lesson.id, 'name', data.lesson.name);
      put('micro_lesson', data.lesson.id, 'description', data.lesson.description);
    }
    if (includeExercises) {
      for (const e of data.exercises) {
        put('exercise', e.id, 'name', e.name);
        for (const q of e.questions) {
          for (const f of ITEM_FIELDS.question) put('question', q.id, f, (q as Row)[f]);
          for (const o of q.options) put('option', o.id, 'option', o.option);
        }
      }
    }

    // Translate just these fields ("type:id:field"), e.g. one outdated hint.
    if (Array.isArray(body.only) && body.only.length) {
      const only = new Set(body.only.map(String));
      for (const key of Object.keys(source)) if (!only.has(key)) delete source[key];
    }

    const existing = new Map(data.translations.map((t) => [`${t.itemType}:${t.itemId}:${t.field}:${t.languageId}`, t]));
    const results: Array<{ languageId: number; translated: number; kept: number; error?: string }> = [];
    for (const languageId of targets) {
      const language = data.languages.find((l) => l.id === languageId)!;
      const todo: Record<string, string> = {};
      let kept = 0;
      for (const [key, value] of Object.entries(source)) {
        const t = existing.get(`${key}:${languageId}`);
        if (t && t.status !== 'auto' && !body.replaceEdited) {
          kept++;
          continue;
        }
        if (t && t.status === 'auto' && !t.outdated && body.onlyMissing) {
          kept++;
          continue;
        }
        todo[key] = value;
      }
      if (!Object.keys(todo).length) {
        results.push({ languageId, translated: 0, kept });
        continue;
      }
      try {
        const translated = await this.translateBatch(todo, original?.name ?? 'the source language', language.name, fetchImpl);
        let count = 0;
        for (const [key, value] of Object.entries(translated)) {
          if (!(key in todo) || typeof value !== 'string' || !value.trim()) continue;
          const [type, id, field] = key.split(':');
          await this.upsert(type as ItemType, Number(id), field, languageId, value.trim(), 'auto', hashOf(todo[key]), by);
          count++;
        }
        results.push({ languageId, translated: count, kept });
      } catch (e) {
        results.push({ languageId, translated: 0, kept, error: (e as Error).message });
      }
    }
    return { data: { results } };
  }

  /** Sends the texts in chunks so long lessons stay within one answer. */
  private async translateBatch(texts: Record<string, string>, from: string, to: string, fetchImpl?: typeof fetch): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    const entries = Object.entries(texts);
    let chunk: Array<[string, string]> = [];
    let size = 0;
    const flush = async () => {
      if (!chunk.length) return;
      const answer = await askClaude(
        TRANSLATE_SYSTEM_PROMPT,
        `Source language: ${from}\nTarget language: ${to}\n\n${JSON.stringify(Object.fromEntries(chunk))}`,
        { maxTokens: 8192, fetchImpl },
      );
      Object.assign(out, parseJsonObject(answer));
      chunk = [];
      size = 0;
    };
    for (const entry of entries) {
      if (size + entry[1].length > 6000) await flush();
      chunk.push(entry);
      size += entry[1].length;
    }
    await flush();
    return out;
  }
}

export function parseJsonObject(answer: string): Record<string, unknown> {
  const s = answer.trim().replace(/^```[a-z]*\s*/i, '').replace(/```$/, '').trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('The AI answer was not JSON');
  return JSON.parse(s.slice(start, end + 1));
}
