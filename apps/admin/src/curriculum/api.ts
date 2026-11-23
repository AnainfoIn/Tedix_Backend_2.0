import { useSyncExternalStore } from 'react';
import { apiFetch } from '../api';

export interface Named { id: number; name: string; position?: number | null; count?: number | null }
export interface LessonRow extends Named { startDate: string | null; endDate: string | null }
export interface MicroRow extends Named { type: number | null; exercises: number | null; questions: number | null }
export interface MicroSummary {
  id: number; name: string; position: number | null; type: number | null; total: number | null; textLength: number;
  exercises: number; exerciseNames: string[]; questions: number; questionTypes: number; toCheck: number; options: number; optionGroups: number;
}
export interface Curriculum {
  countries: Named[]; grades: Named[]; subjects: Named[]; masters: Named[];
  mains: Named[]; units: Named[]; lessons: LessonRow[]; microLessons: MicroRow[]; micro: MicroSummary | null;
  /** The path the lists were loaded for, first items filled in. */
  path: Record<string, number | undefined>;
}

/** The path picked on the Curriculum screen, top first; it lives in the URL. */
export const PATH_KEYS = ['country', 'grade', 'subject', 'master', 'main', 'unit', 'lesson', 'micro'] as const;
export type PathKey = (typeof PATH_KEYS)[number];
export type Path = Partial<Record<PathKey, number>>;

const QUERY: Record<PathKey, string> = {
  country: 'countryId', grade: 'gradeId', subject: 'subjectId', master: 'masterId', main: 'mainId', unit: 'unitId', lesson: 'lessonId', micro: 'microLessonId',
};

export const pathFromServer = (p: Record<string, number | undefined>): Path => {
  const out: Path = {};
  for (const k of PATH_KEYS) if (p[QUERY[k]]) out[k] = p[QUERY[k]];
  return out;
};

export const loadCurriculum = (p: Path) => {
  const q = new URLSearchParams();
  for (const k of PATH_KEYS) if (p[k]) q.set(QUERY[k], String(p[k]));
  return apiFetch<Curriculum>(`/curriculum?${q}`);
};

// ---- the country picked in the top bar, remembered in this browser

const KEY = 'tedix_admin_country';
const listeners = new Set<() => void>();
let current: number | null = (() => {
  try {
    const v = Number(localStorage.getItem(KEY));
    return v > 0 ? v : null;
  } catch {
    return null;
  }
})();

export function setCountry(id: number | null) {
  current = id;
  try {
    if (id) localStorage.setItem(KEY, String(id));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage blocked: the choice lasts until reload.
  }
  listeners.forEach((l) => l());
}

export function useCountry(): number | null {
  return useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => current);
}
