/** The Contents tree as the panel shows it. Mirrors apps/api/src/admin/contents/levels.ts. */
export type LevelKey = 'countries' | 'grades' | 'subjects' | 'masters' | 'mains' | 'units' | 'lessons';
export type IdField = 'countryId' | 'gradeId' | 'subjectId' | 'masterId' | 'mainId' | 'unitId';

export interface Level {
  key: LevelKey;
  singular: string;
  plural: string;
  /** The id this level is known by in its children's records. */
  idField?: IdField;
  /** Parent fields picked on the form, top first (the last one is the real parent). */
  pickers: IdField[];
  ordered: boolean;
  hasFiles: boolean;
  child?: LevelKey;
}

export const FIELD_LEVEL: Record<IdField, LevelKey> = {
  countryId: 'countries', gradeId: 'grades', subjectId: 'subjects', masterId: 'masters', mainId: 'mains', unitId: 'units',
};

export const FIELD_LABEL: Record<IdField, string> = {
  countryId: 'Country', gradeId: 'Grade', subjectId: 'Subject', masterId: 'Master', mainId: 'Main', unitId: 'Unit',
};

export const LEVELS: Record<LevelKey, Level> = {
  countries: { key: 'countries', singular: 'Country', plural: 'Countries', idField: 'countryId', pickers: [], ordered: false, hasFiles: false, child: 'grades' },
  grades: { key: 'grades', singular: 'Grade', plural: 'Grades', idField: 'gradeId', pickers: ['countryId'], ordered: true, hasFiles: true, child: 'subjects' },
  subjects: { key: 'subjects', singular: 'Subject', plural: 'Subjects', idField: 'subjectId', pickers: ['countryId'], ordered: false, hasFiles: true, child: 'masters' },
  masters: { key: 'masters', singular: 'Master', plural: 'Masters', idField: 'masterId', pickers: ['countryId', 'gradeId', 'subjectId'], ordered: true, hasFiles: true, child: 'mains' },
  mains: { key: 'mains', singular: 'Main', plural: 'Mains', idField: 'mainId', pickers: ['countryId', 'gradeId', 'subjectId', 'masterId'], ordered: true, hasFiles: true, child: 'units' },
  units: { key: 'units', singular: 'Unit', plural: 'Units', idField: 'unitId', pickers: ['countryId', 'gradeId', 'subjectId', 'masterId', 'mainId'], ordered: true, hasFiles: true, child: 'lessons' },
  lessons: { key: 'lessons', singular: 'Lesson', plural: 'Lessons', pickers: ['countryId', 'gradeId', 'subjectId', 'masterId', 'mainId', 'unitId'], ordered: true, hasFiles: true },
};

export const LEVEL_ORDER: LevelKey[] = ['countries', 'grades', 'subjects', 'masters', 'mains', 'units', 'lessons'];

/** Ancestor columns shown in lists (subjects show their grades instead). */
export const ANCESTORS: Record<LevelKey, IdField[]> = {
  countries: [],
  grades: ['countryId'],
  subjects: ['countryId'],
  masters: ['countryId', 'gradeId', 'subjectId'],
  mains: ['countryId', 'gradeId', 'subjectId', 'masterId'],
  units: ['countryId', 'gradeId', 'subjectId', 'masterId', 'mainId'],
  lessons: ['countryId', 'gradeId', 'subjectId', 'masterId', 'mainId', 'unitId'],
};
