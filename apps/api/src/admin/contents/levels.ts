/**
 * The Contents tree, top to bottom: Country > Grade > Subject > Master > Main > Unit > Lesson.
 * Port of the ActiveAdmin pages under the "Contents" menu (app/admin/countries.rb ... lessons.rb)
 * and of the rules in their Rails models.
 */
export type LevelKey = 'countries' | 'grades' | 'subjects' | 'masters' | 'mains' | 'units' | 'lessons';
export type IdField = 'countryId' | 'gradeId' | 'subjectId' | 'masterId' | 'mainId' | 'unitId';

/** Files a level can have, keyed by the admin field name, with the Rails attachment name. */
export const FILE_FIELDS = {
  image: { attachment: 'image', label: 'Display icon', kind: 'image' },
  cheatsheetPdf: { attachment: 'cheatsheet_pdf', label: 'Cheatsheet (PDF)', kind: 'pdf' },
  summaryPdf: { attachment: 'summary_pdf', label: 'Summary (PDF)', kind: 'pdf' },
  summaryVideo: { attachment: 'summary_video', label: 'Summary (video)', kind: 'video' },
} as const;
export type FileField = keyof typeof FILE_FIELDS;
export const ALL_FILE_FIELDS = Object.keys(FILE_FIELDS) as FileField[];

/** Same limits as BuilderBase::ApplicationRecord in Rails. */
export const FILE_RULES = {
  image: { types: ['image/jpeg', 'image/png', 'image/jpg'], maxBytes: 5 * 1024 * 1024, typeError: 'must be a valid image format (jpeg, jpg, png)' },
  pdf: { types: ['application/pdf'], maxBytes: 10 * 1024 * 1024, typeError: 'must be a valid PDF format' },
  video: { types: ['video/3gpp', 'video/mp4', 'video/x-flv'], maxBytes: 50 * 1024 * 1024, typeError: 'must be a valid video format (3gp, mp4, flv)' },
} as const;

export interface Dependent {
  table: string;
  column: string;
  label: string;
}

export interface LevelConfig {
  key: LevelKey;
  /** Resource key for permissions (same names as the Rails CanCan ability). */
  resource: string;
  singular: string;
  plural: string;
  /** Prisma model delegate name. */
  model: 'country' | 'grade' | 'subject' | 'master' | 'main' | 'unit' | 'lesson';
  /** Rails class name, used as Active Storage record_type. */
  recordType: string;
  /** The id field that names this level in its descendants (gradeId for grades). */
  ownIdField?: IdField;
  /** The parent the admin picks. Its own ancestors are copied from it. */
  parent?: { level: LevelKey; field: IdField };
  /** Ancestor id columns this level stores, top first. */
  ancestors: IdField[];
  /** Name must be unique (ignoring case) within this field; null = unique overall. */
  uniqueWithin: IdField | null;
  /** Ordered with acts_as_list within this field. */
  positionScope?: IdField;
  nameMin: number;
  files: FileField[];
  defaultIcon?: string;
  /** The next level down, shown on the detail page. */
  child?: LevelKey;
  /** Rows elsewhere that block deleting (dependent: :restrict_with_error). */
  dependents: Dependent[];
}

const MATERIALS: FileField[] = ['image', 'cheatsheetPdf', 'summaryPdf', 'summaryVideo'];
const dep = (table: string, column: string, label: string): Dependent => ({ table, column, label });
const below = (column: string, from: number): Dependent[] =>
  [
    dep('categories', column, 'grades'),
    dep('sub_categories', column, 'subjects'),
    dep('bx_block_profile_courses', column, 'masters'),
    dep('bx_block_profile_mains', column, 'mains'),
    dep('bx_block_profile_units', column, 'units'),
    dep('bx_block_profile_lessons', column, 'lessons'),
    dep('bx_block_profile_micro_lessons', column, 'micro lessons'),
  ]
    .slice(from)
    .concat(dep('bx_block_assessmenttest_assessments', column, 'assessments'));

export const LEVELS: Record<LevelKey, LevelConfig> = {
  countries: {
    key: 'countries', resource: 'countries', singular: 'Country', plural: 'Countries', model: 'country',
    recordType: 'AccountBlock::Country', ownIdField: 'countryId', ancestors: [], uniqueWithin: null, nameMin: 2,
    files: [], child: 'grades',
    dependents: [
      dep('bx_block_profile_profiles', 'country_id', 'profiles'),
      dep('account_block_cities', 'country_id', 'cities'),
      ...below('country_id', 0),
      dep('sponsors', 'country_id', 'sponsors'),
    ],
  },
  grades: {
    key: 'grades', resource: 'categories', singular: 'Grade', plural: 'Grades', model: 'grade',
    recordType: 'BxBlockCategories::Category', ownIdField: 'gradeId', parent: { level: 'countries', field: 'countryId' },
    ancestors: ['countryId'], uniqueWithin: 'countryId', positionScope: 'countryId', nameMin: 0,
    files: MATERIALS, defaultIcon: 'grade_icon.jpeg', child: 'subjects',
    dependents: below('category_id', 2),
  },
  subjects: {
    key: 'subjects', resource: 'sub_categories', singular: 'Subject', plural: 'Subjects', model: 'subject',
    recordType: 'BxBlockCategories::SubCategory', ownIdField: 'subjectId', parent: { level: 'countries', field: 'countryId' },
    ancestors: ['countryId'], uniqueWithin: 'countryId', nameMin: 2,
    files: MATERIALS, defaultIcon: 'subject_icon.jpeg', child: 'masters',
    dependents: [
      ...below('sub_category_id', 2),
      dep('student_subject_tiers', 'sub_category_id', 'student tiers'),
      dep('tier_histories', 'sub_category_id', 'tier histories'),
    ],
  },
  masters: {
    key: 'masters', resource: 'courses', singular: 'Master', plural: 'Masters', model: 'master',
    recordType: 'BxBlockProfile::Course', ownIdField: 'masterId', parent: { level: 'subjects', field: 'subjectId' },
    ancestors: ['countryId', 'gradeId', 'subjectId'], uniqueWithin: 'subjectId', positionScope: 'subjectId', nameMin: 2,
    files: MATERIALS, defaultIcon: 'master_icon.jpeg', child: 'mains',
    dependents: below('course_id', 3),
  },
  mains: {
    key: 'mains', resource: 'mains', singular: 'Main', plural: 'Mains', model: 'main',
    recordType: 'BxBlockProfile::Main', ownIdField: 'mainId', parent: { level: 'masters', field: 'masterId' },
    ancestors: ['countryId', 'gradeId', 'subjectId', 'masterId'], uniqueWithin: 'masterId', positionScope: 'masterId', nameMin: 2,
    files: MATERIALS, defaultIcon: 'main_icon.jpeg', child: 'units',
    dependents: below('main_id', 4),
  },
  units: {
    key: 'units', resource: 'units', singular: 'Unit', plural: 'Units', model: 'unit',
    recordType: 'BxBlockProfile::Unit', ownIdField: 'unitId', parent: { level: 'mains', field: 'mainId' },
    ancestors: ['countryId', 'gradeId', 'subjectId', 'masterId', 'mainId'], uniqueWithin: 'mainId', positionScope: 'mainId', nameMin: 2,
    files: MATERIALS, defaultIcon: 'unit_icon.jpeg', child: 'lessons',
    dependents: below('unit_id', 5),
  },
  lessons: {
    key: 'lessons', resource: 'lessons', singular: 'Lesson', plural: 'Lessons', model: 'lesson',
    recordType: 'BxBlockProfile::Lesson', parent: { level: 'units', field: 'unitId' },
    ancestors: ['countryId', 'gradeId', 'subjectId', 'masterId', 'mainId', 'unitId'], uniqueWithin: 'unitId', positionScope: 'unitId', nameMin: 2,
    files: MATERIALS, defaultIcon: 'lesson_icon.jpeg',
    dependents: [
      ...below('lesson_id', 6),
      dep('bx_block_profile_micro_summaries', 'lesson_id', 'micro summaries'),
      dep('puzzle_mix_sessions', 'lesson_id', 'puzzle mix sessions'),
      dep('lesson_sessions', 'lesson_id', 'lesson sessions'),
      dep('campaign_lessons', 'lesson_id', 'campaigns'),
      dep('weekly_challenges', 'lesson_id', 'weekly challenges'),
    ],
  },
};

/** Which level an ancestor id field points at. */
export const LEVEL_OF_FIELD: Record<IdField, LevelKey> = {
  countryId: 'countries', gradeId: 'grades', subjectId: 'subjects', masterId: 'masters', mainId: 'mains', unitId: 'units',
};

/** "for this country", the wording of the Rails uniqueness messages. */
export const SCOPE_WORD: Record<IdField, string> = {
  countryId: 'country', gradeId: 'grade', subjectId: 'subject', masterId: 'master', mainId: 'main', unitId: 'unit',
};
