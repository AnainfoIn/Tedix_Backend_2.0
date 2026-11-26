import { apiFetch } from '../api';

export type ItemType = 'micro_lesson' | 'exercise' | 'question' | 'option' | 'grade' | 'subject' | 'master' | 'main' | 'unit' | 'lesson';
export type Status = 'auto' | 'edited' | 'reviewed';

export interface Language {
  id: number;
  name: string;
  code: string;
  flag: string;
}

export interface Translation {
  itemType: ItemType;
  itemId: number;
  field: string;
  languageId: number;
  value: string;
  status: Status;
  outdated: boolean;
  updatedBy: string | null;
  updatedAt: string;
}

export interface OptionRow {
  id: number;
  groupId: number;
  option: string;
  isCorrect: boolean;
  sequenceNumber: number | null;
  shapeType?: string | null;
}

export interface Question {
  id: number;
  questionType: number;
  /** "template" = the question has variables, so it "Needs fixed values" before students see it. */
  questionbankType?: string | null;
  question: string | null;
  questionBody: string | null;
  hint: string | null;
  solution: string | null;
  options: OptionRow[];
}

export interface Exercise {
  id: number;
  name: string;
  categoryType: number;
  isAha: boolean | null;
  /** Order in the micro lesson (DB change 003; null before it). */
  position?: number | null;
  /** "Check type" tag: old data whose type needs a check; saving in the editor clears it. */
  needsReview?: boolean;
  reviewNote?: string | null;
  questions: Question[];
}

export interface Workspace {
  lesson: { id: number; name: string; description: string | null; microLessonType: number; position: number | null; updatedAt: string };
  languages: Language[];
  originalLanguageId: number | null;
  aiConfigured: boolean;
  /** Exercises can be reordered (DB change 003 applied). */
  canReorder?: boolean;
  exercises: Exercise[];
  translations: Translation[];
}

export const QUESTION_FIELDS: Array<{ field: 'question' | 'questionBody' | 'hint' | 'solution'; label: string }> = [
  { field: 'question', label: 'Question' },
  { field: 'questionBody', label: 'Question body' },
  { field: 'hint', label: 'Hint' },
  { field: 'solution', label: 'Solution' },
];

export const QUESTION_TYPE_LABELS: Record<number, string> = {
  0: 'MCQ', 1: 'Challenge', 2: 'True / False', 3: 'Fill in the Blank', 4: 'Match the Column', 5: 'Sequence', 6: 'Multiple Choice',
  7: 'Match the Pairs / Tap and Pair', 8: 'Find the Mistake', 9: 'Memory Card', 10: 'Number Pattern', 11: 'Shape Pattern',
  12: 'Rule Discovery', 13: 'Number Line',
};
export const CATEGORY_LABELS: Record<number, string> = { 0: 'Exercise', 1: 'Challenge', 2: 'Both' };

export const loadWorkspace = (id: number | string) => apiFetch<{ data: Workspace }>(`/workspace/micro_lessons/${id}`).then((r) => r.data);

export const saveTranslation = (body: { itemType: ItemType; itemId: number; field: string; languageId: number; value: string; status?: Status }) =>
  apiFetch('/workspace/translations', { method: 'PUT', body: JSON.stringify(body) });

/** Saves an exercise in its original language: name, AHA, its question and the answer groups and options. */
export const saveExercise = (id: number, body: unknown) =>
  apiFetch<{ data: { saved: boolean } }>(`/workspace/exercises/${id}`, { method: 'PUT', body: JSON.stringify(body) });

export const createExercise = (body: { microLessonId: number; name: string; isAha: boolean }) =>
  apiFetch<{ data: { id: number; name: string } }>('/workspace/exercises', { method: 'POST', body: JSON.stringify(body) });

export const deleteExercise = (id: number) => apiFetch(`/workspace/exercises/${id}`, { method: 'DELETE' });

export const setOriginalLanguage = (id: number, languageId: number) =>
  apiFetch<{ data: Workspace }>(`/workspace/micro_lessons/${id}/original_language`, { method: 'PUT', body: JSON.stringify({ languageId }) }).then((r) => r.data);

export interface TranslateResult {
  languageId: number;
  translated: number;
  kept: number;
  error?: string;
}

export const translateLesson = (id: number, body: { languageIds: number[]; include: { text: boolean; exercises: boolean }; replaceEdited: boolean; onlyMissing?: boolean; only?: string[] }) =>
  apiFetch<{ data: { results: TranslateResult[] } }>(`/workspace/micro_lessons/${id}/translate`, { method: 'POST', body: JSON.stringify(body) }).then((r) => r.data.results);

/** Lookup of translations by item, field and language. */
export function indexTranslations(list: Translation[]) {
  const map = new Map(list.map((t) => [`${t.itemType}:${t.itemId}:${t.field}:${t.languageId}`, t]));
  return (type: ItemType, id: number, field: string, languageId: number) => map.get(`${type}:${id}:${field}:${languageId}`);
}

/** Every translatable (non-empty) source field of the lesson, as [type, id, field]. */
export function sourceFields(ws: Workspace): Array<[ItemType, number, string]> {
  const out: Array<[ItemType, number, string]> = [];
  const add = (t: ItemType, id: number, f: string, v: unknown) => {
    if (typeof v === 'string' && v.trim()) out.push([t, id, f]);
  };
  add('micro_lesson', ws.lesson.id, 'name', ws.lesson.name);
  add('micro_lesson', ws.lesson.id, 'description', ws.lesson.description);
  for (const e of ws.exercises) {
    add('exercise', e.id, 'name', e.name);
    for (const q of e.questions) {
      for (const { field } of QUESTION_FIELDS) add('question', q.id, field, q[field]);
      for (const o of q.options) add('option', o.id, 'option', o.option);
    }
  }
  return out;
}

export interface LanguageSummary {
  total: number;
  missing: number;
  outdated: number;
  auto: number;
  edited: number;
  reviewed: number;
}

export function summarize(ws: Workspace, languageId: number, filter?: (t: ItemType, id: number) => boolean): LanguageSummary {
  const get = indexTranslations(ws.translations);
  const s: LanguageSummary = { total: 0, missing: 0, outdated: 0, auto: 0, edited: 0, reviewed: 0 };
  for (const [type, id, field] of sourceFields(ws)) {
    if (filter && !filter(type, id)) continue;
    s.total++;
    const t = get(type, id, field, languageId);
    if (!t) s.missing++;
    else {
      if (t.outdated) s.outdated++;
      s[t.status]++;
    }
  }
  return s;
}

/** The single status a tab, item or chip shows for a summary. */
export function statusOf(s: LanguageSummary): { label: string; tone: Tone } {
  if (!s.total) return { label: 'Nothing to translate', tone: 'miss' };
  if (s.missing === s.total) return { label: 'Not translated', tone: 'miss' };
  if (s.missing) return { label: `${s.missing} missing`, tone: 'old' };
  if (s.outdated) return { label: 'Outdated', tone: 'old' };
  if (s.auto) return { label: s.auto === s.total ? 'Auto · complete' : 'Auto', tone: 'auto' };
  if (s.edited) return { label: 'Edited', tone: 'edit' };
  return { label: 'Reviewed', tone: 'rev' };
}

export type Tone = 'orig' | 'auto' | 'edit' | 'rev' | 'old' | 'miss' | 'pend' | 'fail';

export const TONES: Record<Tone, { bg: string; fg: string }> = {
  orig: { bg: '#1565c0', fg: '#fff' },
  auto: { bg: '#fff3cd', fg: '#7a4b00' },
  edit: { bg: '#f3e5f5', fg: '#6a1b9a' },
  rev: { bg: '#e8f5e9', fg: '#1b5e20' },
  old: { bg: '#ffe0cc', fg: '#8a3200' },
  miss: { bg: '#eeeeee', fg: '#424242' },
  pend: { bg: '#e3f2fd', fg: '#0d47a1' },
  fail: { bg: '#ffebee', fg: '#b71c1c' },
};

export const STATUS_TONE: Record<Status, Tone> = { auto: 'auto', edited: 'edit', reviewed: 'rev' };
export const STATUS_LABEL: Record<Status, string> = { auto: 'Auto', edited: 'Edited', reviewed: 'Reviewed' };
