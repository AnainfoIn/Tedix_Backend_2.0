import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { askClaude, claudeConfigured } from '../latex/claude';

/**
 * Translations of micro lesson content (the language tabs of the admin workspace).
 *
 * The Rails database has no place for per-language content, so translations live in two
 * admin-owned tables, created here when missing. They only add data: no Rails table or column
 * is changed, and Rails never reads them.
 */
export type ItemType = 'micro_lesson' | 'exercise' | 'question' | 'option';
export type Status = 'auto' | 'edited' | 'reviewed';

export const ITEM_FIELDS: Record<ItemType, string[]> = {
  micro_lesson: ['name', 'description'],
  exercise: ['name'],
  question: ['question', 'questionBody', 'hint', 'solution'],
  option: ['option'],
};

const ITEM_SQL: Record<ItemType, { table: string; columns: Record<string, string> }> = {
  micro_lesson: { table: 'bx_block_profile_micro_lessons', columns: { name: 'name', description: 'description' } },
  exercise: { table: 'bx_block_assessmenttest_assessments', columns: { name: 'name' } },
  question: { table: 'bx_block_assessmenttest_questionbanks', columns: { question: 'question', questionBody: 'question_body', hint: 'hint', solution: 'solution' } },
  option: { table: 'bx_block_assessmenttest_answer_options', columns: { option: 'option' } },
};

const STATUSES: Status[] = ['auto', 'edited', 'reviewed'];

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

  private async originalLanguageId(itemId: number, languages: Language[]): Promise<number | null> {
    const [row] = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT original_language_id FROM admin_content_languages WHERE item_type = 'micro_lesson' AND item_id = $1`,
      itemId,
    );
    if (row) return Number(row.original_language_id);
    const romanian = languages.find((l) => /^roman/i.test(l.name) || /^RO/i.test(l.code));
    return (romanian ?? languages[0])?.id ?? null;
  }

  async setOriginalLanguage(microLessonId: number, languageId: number) {
    await this.ensureReady();
    const languages = await this.languages();
    if (!languages.some((l) => l.id === languageId)) throw new BadRequestException('Unknown language');
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO admin_content_languages (item_type, item_id, original_language_id, updated_at) VALUES ('micro_lesson', $1, $2, now())
       ON CONFLICT (item_type, item_id) DO UPDATE SET original_language_id = EXCLUDED.original_language_id, updated_at = now()`,
      microLessonId,
      languageId,
    );
    return this.workspace(microLessonId);
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

    const exercises = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT id, name, category_type, is_aha FROM bx_block_assessmenttest_assessments WHERE micro_lesson_id = $1 ORDER BY id`,
      microLessonId,
    );
    const exerciseIds = exercises.map((e) => e.id);
    const questions = exerciseIds.length
      ? await this.prisma.$queryRawUnsafe<Row[]>(
          `SELECT id, assessment_id, question, question_body, hint, solution, question_type FROM bx_block_assessmenttest_questionbanks
           WHERE assessment_id = ANY($1::bigint[]) ORDER BY id`,
          exerciseIds,
        )
      : [];
    const questionIds = questions.map((q) => q.id);
    const options = questionIds.length
      ? await this.prisma.$queryRawUnsafe<Row[]>(
          `SELECT o.id, o.option, o.is_correct, o.sequence_number, g.id AS group_id, g.questionbank_id
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
        exercises: exercises.map((e) => ({
          id: Number(e.id),
          name: e.name,
          categoryType: e.category_type,
          isAha: e.is_aha,
          questions: questions
            .filter((q) => Number(q.assessment_id) === Number(e.id))
            .map((q) => ({
              id: Number(q.id),
              questionType: q.question_type,
              question: q.question,
              questionBody: q.question_body,
              hint: q.hint,
              solution: q.solution,
              options: options
                .filter((o) => Number(o.questionbank_id) === Number(q.id))
                .map((o) => ({ id: Number(o.id), groupId: Number(o.group_id), option: o.option, isCorrect: !!o.is_correct, sequenceNumber: o.sequence_number })),
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
    for (const [type, ids] of byType) {
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
      await this.prisma.$executeRawUnsafe(
        `DELETE FROM admin_content_translations WHERE item_type = $1 AND item_id = $2 AND field = $3 AND language_id = $4`,
        itemType,
        itemId,
        field,
        languageId,
      );
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
