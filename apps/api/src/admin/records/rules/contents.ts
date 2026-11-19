import { baseError } from '../../../common/validation-error';
import { registerHooks } from '../hooks';

const MICRO_LESSON = 'BxBlockProfile::MicroLesson';
const MICRO_SUMMARY = 'BxBlockProfile::MicroSummary';
const QUESTION_BANK = 'BxBlockAssessmenttest::Questionbank';
const HIERARCHY = ['country_id', 'category_id', 'sub_category_id', 'course_id', 'main_id', 'unit_id', 'lesson_id'];

/** Assessment#set_hierarchy_from_micro_lesson: an exercise copies the micro lesson's place in the tree. */
registerHooks('exercises', {
  async validate({ prisma }, { data, values, current }) {
    if (current || values.microLessonId == null) return;
    const [ml] = await prisma.$queryRawUnsafe<Record<string, bigint>[]>(
      `SELECT ${HIERARCHY.join(', ')} FROM bx_block_profile_micro_lessons WHERE id = $1`,
      BigInt(values.microLessonId as number),
    );
    if (ml) for (const column of HIERARCHY) data[column] ??= ml[column];
  },
});

/** Summary images block deleting a micro lesson (MicroSummary is restrict_with_error in Rails). */
registerHooks('micro_lessons', {
  async beforeDelete({ prisma }, id) {
    const [{ count }] = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*)::bigint AS count FROM content_images c JOIN bx_block_profile_micro_summaries s ON s.id = c.contentable_id
       WHERE c.contentable_type = $1 AND s.micro_lesson_id = $2`,
      MICRO_SUMMARY,
      id,
    );
    if (count > 0n) baseError('Cannot delete record because dependent micro summaries exist');
  },
});

/** AnswerOptionGroup: the shape is required for Shape Pattern questions. */
registerHooks('option_groups', {
  async validate({ prisma }, { values, add }) {
    if (values.questionbankId == null || values.shapeType) return;
    const [qb] = await prisma.$queryRawUnsafe<{ question_type: number }[]>(
      'SELECT question_type FROM bx_block_assessmenttest_questionbanks WHERE id = $1',
      BigInt(values.questionbankId as number),
    );
    if (qb && Number(qb.question_type) === 11) add('shapeType', 'Shape must exist');
  },
});

/**
 * ContentImage belongs to a question bank, a micro lesson or a micro lesson's summary (created on
 * first use, like the Rails page's `micro_summaries.first_or_create!`). Key names are unique per owner.
 */
registerHooks('content_images', {
  async validate({ prisma }, { data, values, input, current, add }) {
    let type = current?.contentableType as string | undefined;
    let ownerId = current?.contentableId as number | bigint | undefined;
    if (!current) {
      type = String(input.contentableType ?? '');
      if (type === MICRO_SUMMARY && input.contentableId == null && input.summaryOfMicroLessonId != null) {
        const mlId = BigInt(String(input.summaryOfMicroLessonId));
        const [ml] = await prisma.$queryRawUnsafe<{ lesson_id: bigint }[]>('SELECT lesson_id FROM bx_block_profile_micro_lessons WHERE id = $1', mlId);
        if (!ml) return add('base', 'Micro lesson must exist');
        let [summary] = await prisma.$queryRawUnsafe<{ id: bigint }[]>('SELECT id FROM bx_block_profile_micro_summaries WHERE micro_lesson_id = $1 ORDER BY id LIMIT 1', mlId);
        if (!summary) {
          [summary] = await prisma.$queryRawUnsafe<{ id: bigint }[]>(
            'INSERT INTO bx_block_profile_micro_summaries (micro_lesson_id, lesson_id, created_at, updated_at) VALUES ($1, $2, now(), now()) RETURNING id',
            mlId,
            ml.lesson_id,
          );
        }
        ownerId = summary.id;
      } else if (input.contentableId != null && /^\d+$/.test(String(input.contentableId))) {
        ownerId = BigInt(String(input.contentableId));
      }
      const table = { [QUESTION_BANK]: 'bx_block_assessmenttest_questionbanks', [MICRO_LESSON]: 'bx_block_profile_micro_lessons', [MICRO_SUMMARY]: 'bx_block_profile_micro_summaries' }[type];
      if (!table || ownerId == null) return add('base', 'Add content images from a micro lesson or question bank page');
      const exists = await prisma.$queryRawUnsafe<unknown[]>(`SELECT 1 FROM ${table} WHERE id = $1`, BigInt(ownerId));
      if (!exists.length) return add('base', 'Contentable must exist');
      data.contentable_type = type;
      data.contentable_id = BigInt(ownerId);
      data.attr_name = 'Description';
    }
    const key = (values.keyName as string | null) ?? null;
    const dup = await prisma.$queryRawUnsafe<unknown[]>(
      `SELECT 1 FROM content_images WHERE contentable_type = $1 AND contentable_id = $2 AND key_name IS NOT DISTINCT FROM $3 ${current ? 'AND id <> $4' : ''} LIMIT 1`,
      type,
      BigInt(ownerId!),
      key,
      ...(current ? [BigInt(current.id as number)] : []),
    );
    if (dup.length) add('keyName', 'Key name has already been taken');
  },
});
