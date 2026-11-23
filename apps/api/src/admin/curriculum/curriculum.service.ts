import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

type Row = Record<string, any>;
export interface CurriculumQuery {
  countryId?: number; gradeId?: number; subjectId?: number; masterId?: number;
  mainId?: number; unitId?: number; lessonId?: number; microLessonId?: number;
}

const n = (v: unknown) => (v == null ? null : Number(v));
const day = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? null : String(v).slice(0, 10));

/**
 * Everything the Curriculum screen shows in one call: the Grade, Subject and Master choices, the
 * Mains, Units, Lessons and Micro lessons columns with their counts, and the selected micro lesson's summary.
 * A level with nothing picked is left empty; the client picks the first item and asks again.
 */
@Injectable()
export class CurriculumService {
  constructor(private readonly prisma: PrismaService) {}

  private q(sql: string, ...args: unknown[]) {
    return this.prisma.$queryRawUnsafe<Row[]>(sql, ...args);
  }

  async load(p: CurriculumQuery) {
    const countries = (await this.q('SELECT id, name FROM account_block_countries ORDER BY name, id')).map((r) => ({ id: n(r.id)!, name: r.name }));
    const countryId = p.countryId ?? null;
    const path: CurriculumQuery = { countryId: countryId ?? undefined };
    const out: Row = { countries, grades: [], subjects: [], masters: [], mains: [], units: [], lessons: [], microLessons: [], micro: null, path };
    if (!countryId) return out;
    // keep the pick when it is in the list, else the first item; nothing when the list is empty
    const settle = (key: keyof CurriculumQuery, list: Array<{ id: number }>) => {
      const want = p[key];
      p[key] = want && list.some((x) => x.id === want) ? want : list[0]?.id;
      if (p[key]) path[key] = p[key];
    };

    out.grades = (await this.q(`SELECT c.id, c.name, c.position, (SELECT COUNT(*) FROM categories_sub_categories l WHERE l.category_id = c.id) AS count
       FROM categories c WHERE c.country_id = $1 ORDER BY c.position NULLS LAST, c.id`, countryId))
      .map((r) => ({ id: n(r.id)!, name: r.name, position: n(r.position), count: n(r.count) }));
    settle('gradeId', out.grades);
    if (p.gradeId) {
      out.subjects = (await this.q(
        `SELECT s.id, s.name,
           (SELECT COUNT(*) FROM bx_block_profile_courses m WHERE m.sub_category_id = s.id AND m.category_id = $1) AS count,
           (SELECT string_agg(c.name, ', ' ORDER BY c.position NULLS LAST, c.id) FROM categories_sub_categories l2 JOIN categories c ON c.id = l2.category_id
             WHERE l2.sub_category_id = s.id AND l2.category_id <> $1) AS also
         FROM sub_categories s JOIN categories_sub_categories l ON l.sub_category_id = s.id
         WHERE l.category_id = $1 AND s.country_id = $2 ORDER BY s.name, s.id`, p.gradeId, countryId,
      )).map((r) => ({ id: n(r.id)!, name: r.name, count: n(r.count), also: r.also ?? null }));
    }
    settle('subjectId', out.subjects);
    if (p.gradeId && p.subjectId) {
      out.masters = (await this.q(
        `SELECT c.id, c.course_name AS name, c.position, (SELECT COUNT(*) FROM bx_block_profile_mains m WHERE m.course_id = c.id) AS count
         FROM bx_block_profile_courses c WHERE c.category_id = $1 AND c.sub_category_id = $2 ORDER BY c.position NULLS LAST, c.id`,
        p.gradeId, p.subjectId,
      )).map((r) => ({ id: n(r.id)!, name: r.name, position: n(r.position), count: n(r.count) }));
    }
    settle('masterId', out.masters);
    if (p.masterId) {
      out.mains = (await this.q(
        `SELECT m.id, m.name, m.position, (SELECT COUNT(*) FROM bx_block_profile_units u WHERE u.main_id = m.id) AS count
         FROM bx_block_profile_mains m WHERE m.course_id = $1 ORDER BY m.position NULLS LAST, m.id`, p.masterId,
      )).map((r) => ({ id: n(r.id)!, name: r.name, position: n(r.position), count: n(r.count) }));
    }
    settle('mainId', out.mains);
    if (p.mainId) {
      out.units = (await this.q(
        `SELECT u.id, u.name, u.position, (SELECT COUNT(*) FROM bx_block_profile_lessons l WHERE l.unit_id = u.id) AS count
         FROM bx_block_profile_units u WHERE u.main_id = $1 ORDER BY u.position NULLS LAST, u.id`, p.mainId,
      )).map((r) => ({ id: n(r.id)!, name: r.name, position: n(r.position), count: n(r.count) }));
    }
    settle('unitId', out.units);
    if (p.unitId) {
      out.lessons = (await this.q(
        `SELECT l.id, l.name, l.position, l.start_date, l.end_date,
           (SELECT COUNT(*) FROM bx_block_profile_micro_lessons m WHERE m.lesson_id = l.id) AS count
         FROM bx_block_profile_lessons l WHERE l.unit_id = $1 ORDER BY l.position NULLS LAST, l.id`, p.unitId,
      )).map((r) => ({ id: n(r.id)!, name: r.name, position: n(r.position), startDate: day(r.start_date), endDate: day(r.end_date), count: n(r.count) }));
    }
    settle('lessonId', out.lessons);
    if (p.lessonId) {
      out.microLessons = (await this.q(
        `SELECT m.id, m.name, m.position, m.micro_lesson_type,
           (SELECT COUNT(*) FROM bx_block_assessmenttest_assessments a WHERE a.micro_lesson_id = m.id) AS exercises,
           (SELECT COUNT(*) FROM bx_block_assessmenttest_questionbanks q JOIN bx_block_assessmenttest_assessments a ON a.id = q.assessment_id
             WHERE a.micro_lesson_id = m.id) AS questions
         FROM bx_block_profile_micro_lessons m WHERE m.lesson_id = $1 ORDER BY m.position NULLS LAST, m.id`, p.lessonId,
      )).map((r) => ({
        id: n(r.id)!, name: r.name, position: n(r.position), type: n(r.micro_lesson_type),
        exercises: n(r.exercises), questions: n(r.questions),
      }));
    }
    settle('microLessonId', out.microLessons);
    if (p.microLessonId) out.micro = await this.summary(p.microLessonId);
    return out;
  }

  private async summary(id: number) {
    const [m] = await this.q('SELECT id, name, position, micro_lesson_type, lesson_id, description FROM bx_block_profile_micro_lessons WHERE id = $1', id);
    if (!m) return null;
    const [{ total }] = await this.q('SELECT COUNT(*) AS total FROM bx_block_profile_micro_lessons WHERE lesson_id = $1', m.lesson_id);
    const exercises = await this.q('SELECT name FROM bx_block_assessmenttest_assessments WHERE micro_lesson_id = $1 ORDER BY id', id);
    const [qs] = await this.q(
      `SELECT COUNT(*) AS questions, COUNT(DISTINCT q.question_type) AS types,
         COUNT(*) FILTER (WHERE q.question IS NULL OR btrim(q.question) = '') AS unreadable
       FROM bx_block_assessmenttest_questionbanks q JOIN bx_block_assessmenttest_assessments a ON a.id = q.assessment_id
       WHERE a.micro_lesson_id = $1`, id,
    );
    const [os] = await this.q(
      `SELECT COUNT(o.id) AS options, COUNT(DISTINCT g.id) AS groups
       FROM answer_option_groups g
       JOIN bx_block_assessmenttest_questionbanks q ON q.id = g.questionbank_id
       JOIN bx_block_assessmenttest_assessments a ON a.id = q.assessment_id
       LEFT JOIN bx_block_assessmenttest_answer_options o ON o.answer_option_group_id = g.id
       WHERE a.micro_lesson_id = $1`, id,
    );
    return {
      id: n(m.id)!, name: m.name, position: n(m.position), type: n(m.micro_lesson_type), total: n(total),
      textLength: String(m.description ?? '').length,
      exercises: exercises.length, exerciseNames: exercises.map((e) => e.name),
      questions: n(qs?.questions) ?? 0, questionTypes: n(qs?.types) ?? 0, toCheck: n(qs?.unreadable) ?? 0,
      options: n(os?.options) ?? 0, optionGroups: n(os?.groups) ?? 0,
    };
  }
}
