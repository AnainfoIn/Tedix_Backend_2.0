import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

type Row = Record<string, any>;
const n = (v: unknown) => (v == null ? null : Number(v));

/** Counts for one micro lesson; every level above is the sum of its micro lessons. */
export interface GeneratedCounts {
  exercises: number;
  /** questionbank_type = 'template': the question is a template whose values are generated from its variables. */
  template: number;
  /** Template questions that have at least one variable defined (so values can actually be generated). */
  templateWithVariables: number;
  regular: number;
  /** Exercises with no question yet (questionbank_type is empty). */
  noQuestion: number;
}

export interface GeneratedRow extends GeneratedCounts {
  microLesson: { id: number; name: string; position: number | null };
  lesson: { id: number; name: string | null; position: number | null };
  unit: { id: number; name: string | null; position: number | null };
  main: { id: number; name: string | null; position: number | null };
  master: { id: number; name: string | null; position: number | null };
  subject: { id: number; name: string | null };
  grade: { id: number; name: string | null; position: number | null };
  country: { id: number; name: string | null };
}

/**
 * DataAnalytics: read-only counts of generated (template) vs regular questions per curriculum
 * level. A "generated" question is an exercise whose questionbank_type is 'template': in the Rails
 * admin these questions carry variables (name, integer/float, min, max, formula) and the app fills
 * in the values, so each student sees generated numbers. 'regular' questions have fixed values.
 * The ancestors are the ids stored on the micro lesson, the same ones the Curriculum screen filters by.
 */
@Injectable()
export class DataAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private q(sql: string, ...args: unknown[]) {
    return this.prisma.$queryRawUnsafe<Row[]>(sql, ...args);
  }

  /** One row per micro lesson that has exercises, optionally for one country. */
  async generatedQuestions(countryId?: number): Promise<{ rows: GeneratedRow[]; unplaced: GeneratedCounts }> {
    const rows = await this.q(
      `WITH ex AS (
         SELECT e.micro_lesson_id,
           COUNT(*) AS exercises,
           COUNT(*) FILTER (WHERE e.questionbank_type = 'template') AS template,
           COUNT(*) FILTER (WHERE e.questionbank_type = 'template'
             AND EXISTS (SELECT 1 FROM bx_block_assessmenttest_variables v WHERE v.questionbank_id = e.question_id)) AS template_vars,
           COUNT(*) FILTER (WHERE e.questionbank_type = 'regular') AS regular,
           COUNT(*) FILTER (WHERE e.question_id IS NULL) AS no_question
         FROM exercises e GROUP BY e.micro_lesson_id
       )
       SELECT ex.*, m.id AS ml_id, m.name AS ml_name, m.position AS ml_pos,
         m.lesson_id, l.name AS lesson_name, l.position AS lesson_pos,
         m.unit_id, u.name AS unit_name, u.position AS unit_pos,
         m.main_id, mn.name AS main_name, mn.position AS main_pos,
         m.course_id, c.course_name AS master_name, c.position AS master_pos,
         m.sub_category_id, s.name AS subject_name,
         m.category_id, g.name AS grade_name, g.position AS grade_pos,
         m.country_id, co.name AS country_name
       FROM ex
       LEFT JOIN bx_block_profile_micro_lessons m ON m.id = ex.micro_lesson_id
       LEFT JOIN bx_block_profile_lessons l ON l.id = m.lesson_id
       LEFT JOIN bx_block_profile_units u ON u.id = m.unit_id
       LEFT JOIN bx_block_profile_mains mn ON mn.id = m.main_id
       LEFT JOIN bx_block_profile_courses c ON c.id = m.course_id
       LEFT JOIN sub_categories s ON s.id = m.sub_category_id
       LEFT JOIN categories g ON g.id = m.category_id
       LEFT JOIN account_block_countries co ON co.id = m.country_id`,
    );
    const unplaced: GeneratedCounts = { exercises: 0, template: 0, templateWithVariables: 0, regular: 0, noQuestion: 0 };
    const out: GeneratedRow[] = [];
    for (const r of rows) {
      const counts: GeneratedCounts = {
        exercises: n(r.exercises)!, template: n(r.template)!, templateWithVariables: n(r.template_vars)!,
        regular: n(r.regular)!, noQuestion: n(r.no_question)!,
      };
      if (r.ml_id == null) {
        // Exercise points at a micro lesson that no longer exists: counted apart, never hidden.
        if (!countryId) for (const k of Object.keys(unplaced) as Array<keyof GeneratedCounts>) unplaced[k] += counts[k];
        continue;
      }
      if (countryId && n(r.country_id) !== countryId) continue;
      out.push({
        ...counts,
        microLesson: { id: n(r.ml_id)!, name: r.ml_name, position: n(r.ml_pos) },
        lesson: { id: n(r.lesson_id)!, name: r.lesson_name, position: n(r.lesson_pos) },
        unit: { id: n(r.unit_id)!, name: r.unit_name, position: n(r.unit_pos) },
        main: { id: n(r.main_id)!, name: r.main_name, position: n(r.main_pos) },
        master: { id: n(r.course_id)!, name: r.master_name, position: n(r.master_pos) },
        subject: { id: n(r.sub_category_id)!, name: r.subject_name },
        grade: { id: n(r.category_id)!, name: r.grade_name, position: n(r.grade_pos) },
        country: { id: n(r.country_id)!, name: r.country_name },
      });
    }
    return { rows: out, unplaced };
  }

  /** The exercises of one micro lesson with their question kind, for the last drill-down step. */
  async microLessonExercises(microLessonId: number) {
    const rows = await this.q(
      `SELECT e.id, e.name, e.question_type, e.questionbank_type, e.question,
         (SELECT COUNT(*) FROM bx_block_assessmenttest_variables v WHERE e.question_id IS NOT NULL AND v.questionbank_id = e.question_id) AS variables
       FROM exercises e WHERE e.micro_lesson_id = $1
       ORDER BY e.position NULLS LAST, e.id`,
      microLessonId,
    );
    return rows.map((r) => ({
      id: n(r.id)!, name: r.name as string, questionType: n(r.question_type),
      kind: (r.questionbank_type ?? null) as string | null,
      question: typeof r.question === 'string' ? r.question.slice(0, 200) : null,
      variables: n(r.variables)!,
    }));
  }
}
