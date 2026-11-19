import { IMAGE_RULES, labelEnum, REF, ref } from './refs';
import { FieldDef, ResourceDef, timestamps } from './types';

const MICRO_LESSON = 'BxBlockProfile::MicroLesson';
const MICRO_SUMMARY = 'BxBlockProfile::MicroSummary';
const QUESTION_BANK = 'BxBlockAssessmenttest::Questionbank';

const EXERCISE_REF = { resource: 'exercises', table: 'bx_block_assessmenttest_assessments', labelColumn: 'name' };
const QUESTION_BANK_REF = { resource: 'question_banks', table: 'bx_block_assessmenttest_questionbanks', labelColumn: 'id', labelExpr: `'Question #' || id` };
const OPTION_GROUP_REF = { resource: 'option_groups', table: 'answer_option_groups', labelColumn: 'id', labelExpr: `'Option group #' || id` };

/** "Country/Grade/Subject/Master/Main/Unit/Lesson" of a row that has the seven ids (alias `alias`). */
const pathSql = (alias: string) => `concat_ws('/',
  (SELECT name FROM account_block_countries WHERE id = ${alias}.country_id),
  (SELECT name FROM categories WHERE id = ${alias}.category_id),
  (SELECT name FROM sub_categories WHERE id = ${alias}.sub_category_id),
  (SELECT course_name FROM bx_block_profile_courses WHERE id = ${alias}.course_id),
  (SELECT name FROM bx_block_profile_mains WHERE id = ${alias}.main_id),
  (SELECT name FROM bx_block_profile_units WHERE id = ${alias}.unit_id),
  (SELECT name FROM bx_block_profile_lessons WHERE id = ${alias}.lesson_id))`;

/** The Contents tree pickers, filling in step by step like the Rails form (country first, lesson last). */
const HIERARCHY: Array<[string, typeof REF.country, string, string]> = [
  ['countryId', REF.country, 'Country', 'countryId'],
  ['categoryId', REF.grade, 'Grade', 'gradeId'],
  ['subCategoryId', REF.subject, 'Subject', 'subjectId'],
  ['courseId', REF.master, 'Master', 'masterId'],
  ['mainId', REF.main, 'Main', 'mainId'],
  ['unitId', REF.unit, 'Unit', 'unitId'],
  ['lessonId', REF.lesson, 'Lesson', 'lessonId'],
];
const hierarchyFields = (): FieldDef[] =>
  HIERARCHY.map(([name, target, label], i) => {
    const above = HIERARCHY.slice(0, i);
    return ref(name, target, {
      label,
      required: true,
      list: true,
      cascade: i ? Object.fromEntries(above.map(([field, , , key]) => [key, field])) : undefined,
      resets: HIERARCHY.slice(i + 1).map(([field]) => field),
    });
  });

const QUESTION_TYPES = labelEnum({
  MCQ: 0, Challenge: 1, 'True / False': 2, 'Fill in the Blank': 3, 'Match the Column': 4, Sequence: 5, 'Multiple Choice': 6,
  'Match the Pairs / Tap and Pair': 7, 'Find the Mistake': 8, 'Memory Card': 9, 'Number Pattern': 10, 'Shape Pattern': 11,
  'Rule Discovery': 12, 'Number Line': 13,
});

export const SHAPE_TYPES = labelEnum({
  'Square with Center': 'square_with_center', 'Square with Cross': 'square_with_cross', Triangle: 'triangle',
  'Triangle with Center': 'triangle_with_center', 'Pentagon with Center': 'pentagon_with_center', Asterisk: 'asterisk',
});

const PDF = { accept: ['application/pdf'], acceptMessage: 'must be a valid PDF format', maxMb: 10 };
const VIDEO = { accept: ['video/3gpp', 'video/mp4', 'video/x-flv'], acceptMessage: 'must be a valid video format (3gp, mp4, flv)', maxMb: 50 };

export const CONTENTS: ResourceDef[] = [
  {
    key: 'micro_lessons',
    table: 'bx_block_profile_micro_lessons',
    label: 'Micro Lessons',
    singular: 'Micro Lesson',
    group: 'Contents',
    priority: 8,
    permission: 'micro_lessons',
    railsClass: MICRO_LESSON,
    actions: ['create', 'edit', 'delete'],
    search: ['name'],
    representation: 'name',
    position: { scope: 'lesson_id' },
    fields: [
      { name: 'path', expr: pathSql('t'), type: 'string', list: false },
      ...hierarchyFields(),
      { name: 'name', type: 'string', required: true, min: 2, max: 100, sanitize: true, normalize: 'squish', filter: true, unique: { scope: ['lessonId'], caseSensitive: false, message: 'Name has already been taken for this lesson' } },
      { name: 'microLessonType', label: 'Type', type: 'enum', choices: labelEnum({ Video: 0, Text: 1 }), required: true, filter: true, list: false },
      { name: 'summaryVideo', label: 'Content (Video)', type: 'file', attachment: 'summary_video', required: true, when: { field: 'microLessonType', in: [0] }, ...VIDEO, hint: 'MP4, 3GP or FLV, up to 50 MB. Also used as the summary video.' },
      { name: 'description', label: 'Content (Text)', type: 'html', required: true, max: 5000, sanitize: true, when: { field: 'microLessonType', in: [1] }, list: false },
      { name: 'cheatsheetPdf', label: 'Cheatsheet (PDF)', type: 'file', attachment: 'cheatsheet_pdf', ...PDF },
      { name: 'summaryPdf', label: 'Summary (PDF)', type: 'file', attachment: 'summary_pdf', ...PDF },
      ...timestamps(),
    ],
    children: [
      { resource: 'exercises', field: 'microLessonId', label: 'Exercises', columns: ['name', 'categoryType', 'isAha', 'questionCount'] },
      { resource: 'content_images', field: 'contentableId', fixed: { contentableType: MICRO_LESSON }, label: 'Content Images', columns: ['keyName', 'image'] },
      { resource: 'content_images', field: 'summaryOfMicroLessonId', fixed: { contentableType: MICRO_SUMMARY }, label: 'Summary Images', columns: ['keyName', 'image'] },
    ],
    restrictDependents: [
      { table: 'bx_block_assessmenttest_assessments', column: 'micro_lesson_id', label: 'assessments' },
      { table: 'content_images', column: 'contentable_id', typeColumn: 'contentable_type', typeValue: MICRO_LESSON, label: 'content images' },
    ],
    // Summary images block deleting (hook); the empty summary record itself goes with the micro lesson.
    destroyDependents: [{ table: 'bx_block_profile_micro_summaries', column: 'micro_lesson_id', label: 'micro summaries' }],
  },
  {
    key: 'exercises',
    table: 'bx_block_assessmenttest_assessments',
    label: 'Exercises',
    singular: 'Exercise',
    group: 'Contents',
    priority: 8.1,
    permission: 'assessments',
    hidden: true,
    actions: ['create', 'edit', 'delete'],
    search: ['name'],
    representation: 'name',
    returnTo: { field: 'microLessonId', resource: 'micro_lessons' },
    fields: [
      { name: 'path', expr: `${pathSql('t')} || '/' || COALESCE((SELECT name FROM bx_block_profile_micro_lessons WHERE id = t.micro_lesson_id), '')`, type: 'string', list: false },
      ref('microLessonId', REF.microLesson, { label: 'Micro lesson', required: true, form: 'create' }),
      { name: 'name', type: 'string', required: true, min: 2, max: 100, sanitize: true, normalize: 'squish', filter: true, unique: { scope: ['microLessonId'], caseSensitive: false, message: 'Name has already been taken for this micro lesson' } },
      { name: 'categoryType', label: 'Type', type: 'enum', choices: labelEnum({ Exercise: 0, Challenge: 1, Both: 2 }), required: true, filter: true, defaultValue: 0 },
      { name: 'isAha', label: 'Is AHA', type: 'boolean', filter: true },
      { name: 'questionCount', label: 'Questions', expr: '(SELECT COUNT(*)::int FROM bx_block_assessmenttest_questionbanks q WHERE q.assessment_id = t.id)', type: 'integer', show: false },
      ...timestamps(),
    ],
    children: [{ resource: 'question_banks', field: 'assessmentId', label: 'Question Banks', columns: ['questionType', 'question'] }],
    restrictDependents: [
      { table: 'bx_block_assessmenttest_questionbanks', column: 'assessment_id', label: 'questionbanks' },
      { table: 'bx_block_assessmenttest_attempted_assessments', column: 'assessment_id', label: 'attempted assessments' },
    ],
  },
  {
    key: 'question_banks',
    table: 'bx_block_assessmenttest_questionbanks',
    label: 'Question Banks',
    singular: 'Question Bank',
    group: 'Contents',
    priority: 8.2,
    permission: 'question_banks',
    railsClass: QUESTION_BANK,
    hidden: true,
    actions: ['create', 'edit', 'delete'],
    search: ['question'],
    returnTo: { field: 'assessmentId', resource: 'exercises' },
    fields: [
      ref('assessmentId', EXERCISE_REF, { label: 'Exercise', required: true, form: 'create' }),
      { name: 'questionbankType', label: 'Type', type: 'enum', choices: labelEnum({ Regular: 'regular', Template: 'template' }), required: true, filter: true, defaultValue: 'regular' },
      { name: 'questionType', type: 'enum', choices: QUESTION_TYPES, required: true, filter: true },
      { name: 'question', type: 'html', required: true, sanitize: true, filter: true },
      { name: 'questionBody', type: 'html', sanitize: true, list: false },
      { name: 'hint', type: 'html', required: true, sanitize: true, list: false },
      { name: 'solution', type: 'html', required: true, sanitize: true, list: false },
      ...timestamps(),
    ],
    children: [
      { resource: 'option_groups', field: 'questionbankId', label: 'Option Groups', columns: ['shapeType', 'optionsText'] },
      { resource: 'content_images', field: 'contentableId', fixed: { contentableType: QUESTION_BANK }, label: 'Content Images', columns: ['keyName', 'image'] },
      { resource: 'variables', field: 'questionbankId', label: 'Variables', columns: ['name', 'valueType', 'minVal', 'maxVal', 'formula'] },
    ],
    restrictDependents: [
      { table: 'answer_option_groups', column: 'questionbank_id', label: 'answer option groups' },
      { table: 'content_images', column: 'contentable_id', typeColumn: 'contentable_type', typeValue: QUESTION_BANK, label: 'content images' },
      { table: 'bx_block_assessmenttest_variables', column: 'questionbank_id', label: 'variables' },
    ],
  },
  {
    key: 'option_groups',
    table: 'answer_option_groups',
    label: 'Option Groups',
    singular: 'Option Group',
    group: 'Contents',
    priority: 8.3,
    permission: 'question_banks',
    hidden: true,
    actions: ['create', 'edit', 'delete'],
    returnTo: { field: 'questionbankId', resource: 'question_banks' },
    fields: [
      ref('questionbankId', QUESTION_BANK_REF, { label: 'Question bank', required: true, form: 'create' }),
      { name: 'shapeType', label: 'Shape', type: 'enum', choices: SHAPE_TYPES, hint: 'Only for Shape Pattern questions, where it is required' },
      {
        name: 'optionsText',
        label: 'Options',
        expr: `(SELECT string_agg(regexp_replace(o.option, '<[^>]*>', '', 'g') || CASE WHEN o.is_correct THEN ' ✓' ELSE '' END, ', ' ORDER BY o.sequence_number NULLS LAST, o.created_at) FROM bx_block_assessmenttest_answer_options o WHERE o.answer_option_group_id = t.id)`,
        type: 'string',
        show: false,
      },
      ...timestamps(),
    ],
    children: [{ resource: 'answer_options', field: 'answerOptionGroupId', label: 'Options in this Group', columns: ['option', 'sequenceNumber', 'isCorrect'] }],
    restrictDependents: [{ table: 'bx_block_assessmenttest_answer_options', column: 'answer_option_group_id', label: 'options' }],
  },
  {
    key: 'answer_options',
    table: 'bx_block_assessmenttest_answer_options',
    label: 'Options',
    singular: 'Option',
    group: 'Contents',
    priority: 8.4,
    permission: 'question_banks',
    hidden: true,
    actions: ['create', 'edit', 'delete'],
    returnTo: { field: 'answerOptionGroupId', resource: 'option_groups' },
    defaultSort: { field: 'sequenceNumber', order: 'ASC' },
    fields: [
      ref('answerOptionGroupId', OPTION_GROUP_REF, { label: 'Option group', required: true, form: 'create' }),
      { name: 'option', type: 'html', required: true, sanitize: true },
      { name: 'sequenceNumber', type: 'integer' },
      { name: 'isCorrect', label: 'This is the missing/target value', type: 'boolean' },
      ...timestamps(),
    ],
  },
  {
    key: 'variables',
    table: 'bx_block_assessmenttest_variables',
    label: 'Variables',
    singular: 'Variable',
    group: 'Contents',
    priority: 8.5,
    permission: 'question_banks',
    hidden: true,
    actions: ['create', 'edit', 'delete'],
    returnTo: { field: 'questionbankId', resource: 'question_banks' },
    fields: [
      ref('questionbankId', QUESTION_BANK_REF, { label: 'Question bank', required: true, form: 'create' }),
      { name: 'name', label: 'Variable Name', type: 'string', required: true, max: 100, sanitize: true, unique: { scope: ['questionbankId'], caseSensitive: false } },
      { name: 'valueType', type: 'enum', choices: labelEnum({ Integer: 'integer', Float: 'float' }), required: true, defaultValue: 'integer' },
      { name: 'minVal', label: 'Min value', type: 'decimal' },
      { name: 'maxVal', label: 'Max value', type: 'decimal' },
      { name: 'formula', type: 'string', sanitize: true, hint: 'Example: a + b' },
      ...timestamps(),
    ],
  },
  {
    key: 'content_images',
    table: 'content_images',
    label: 'Content Images',
    singular: 'Content Image',
    group: 'Contents',
    priority: 8.6,
    permission: 'content_images',
    railsClass: 'BxBlockProfile::ContentImage',
    hidden: true,
    actions: ['create', 'edit', 'delete'],
    search: ['keyName'],
    representation: 'keyName',
    returnTo: { pathField: 'parentPath' },
    note: 'Content images are added from a micro lesson or question bank page.',
    fields: [
      { name: 'contentableType', label: 'Belongs to', type: 'enum', choices: labelEnum({ 'Question Bank': QUESTION_BANK, 'Micro Lesson': MICRO_LESSON, 'Micro Summary': MICRO_SUMMARY }), form: false, filter: true },
      { name: 'contentableId', label: 'Belongs to ID', type: 'integer', form: false, list: false },
      {
        name: 'summaryOfMicroLessonId',
        expr: `(SELECT s.micro_lesson_id FROM bx_block_profile_micro_summaries s WHERE t.contentable_type = '${MICRO_SUMMARY}' AND s.id = t.contentable_id)`,
        type: 'integer',
        list: false,
        show: false,
      },
      {
        name: 'parentPath',
        expr: `CASE t.contentable_type WHEN '${QUESTION_BANK}' THEN 'question_banks/' || t.contentable_id WHEN '${MICRO_LESSON}' THEN 'micro_lessons/' || t.contentable_id
          ELSE 'micro_lessons/' || (SELECT s.micro_lesson_id FROM bx_block_profile_micro_summaries s WHERE s.id = t.contentable_id) END`,
        type: 'string',
        list: false,
        show: false,
      },
      { name: 'keyName', type: 'string', max: 100, normalize: 'squish', filter: true },
      { name: 'attrName', label: 'Attribute Name', type: 'string', form: false, list: false },
      { name: 'image', type: 'image', required: true, ...IMAGE_RULES },
      ...timestamps(),
    ],
  },
];
