import { z } from 'zod';

/**
 * Pasted questions -> exercises of one type, in the shape the exercise editor saves
 * (option groups with option, isCorrect, sequenceNumber: the "Fields per type" design board).
 *
 * Claude reads the pasted text into a simple shape per type (below); this file turns that shape into
 * the editor's groups, so the rules of each type live in code, not in the prompt.
 */

export interface ImportOption {
  option: string;
  isCorrect: boolean;
  sequenceNumber: number | null;
}
export interface ImportGroup {
  shapeType: string | null;
  options: ImportOption[];
}
export interface ImportQuestion {
  questionType: number;
  question: string;
  questionBody: string | null;
  hint: string;
  solution: string;
  groups: ImportGroup[];
}

/** The 12 editor types (same numbers as the admin's TYPES), the question type saved for each, and Part A's name. */
export const IMPORT_TYPES: Record<number, { name: string; legacy: number | null; partA?: string; fields: string }> = {
  1: { name: 'Tap & Pair', legacy: 7, fields: 'pairs of cards that belong together' },
  2: { name: 'Single Choice', legacy: 2, partA: 'single_choice', fields: 'options with exactly one correct (also True / False)' },
  3: { name: 'Multiple Choice', legacy: 6, fields: 'options, one or more correct' },
  4: { name: 'Memory Card', legacy: 9, fields: 'the answer on the back of the card' },
  5: { name: 'Number Line', legacy: 13, fields: 'labelled points with their whole-number positions; which ones the student places' },
  6: { name: 'Match the Column', legacy: 4, fields: 'rows of a left item and the right item it matches' },
  7: { name: 'Drag & Drop / Sequence / Fill in the Blank', legacy: 3, partA: 'fill_in_the_blank', fields: 'a statement with [Blank] slots and the tiles that fill them, plus distractor tiles' },
  8: { name: 'Find the Mistake', legacy: 8, fields: 'the expression split into parts with one wrong part, and a cross question "why is it wrong" with one correct answer' },
  9: { name: 'Lego Build Problem', legacy: null, fields: '' },
  10: { name: 'Number Pattern', legacy: 10, partA: 'number_pattern', fields: 'the terms of a sequence in order, one of them hidden' },
  11: { name: 'Shape Pattern', legacy: 11, fields: 'shapes with a value on each vertex, one value missing' },
  12: { name: 'Rule Discovery', legacy: 12, fields: 'input -> output example rows, one output hidden' },
};

export const SHAPE_TYPES = ['triangle', 'triangle_with_center', 'square_with_center', 'square_with_cross', 'pentagon_with_center', 'asterisk'] as const;

// ---------- what Claude fills in, per type ----------

const common = {
  question: z.string().describe('The instruction / question the student reads'),
  hint: z.string().describe('A short hint that helps without giving the answer'),
  solution: z.string().describe('The worked solution with the answer'),
};

const ANSWERS: Record<number, z.ZodRawShape> = {
  1: { pairs: z.array(z.object({ a: z.string(), b: z.string() })).describe('Each pair of cards that belong together') },
  2: { options: z.array(z.string()).describe('The options in order'), correct: z.number().int().describe('0-based index of the one correct option') },
  3: { options: z.array(z.object({ text: z.string(), correct: z.boolean() })) },
  4: { back: z.string().describe('The answer on the back of the card') },
  5: { points: z.array(z.object({ label: z.string().describe('Short label such as a'), at: z.number().int().describe('Whole-number position on the line'), toFind: z.boolean().describe('True when the student must place it') })) },
  6: { rows: z.array(z.object({ left: z.string(), right: z.string() })).describe('Each left item with the right item it matches') },
  7: {
    statement: z.string().describe('The statement with [Blank] where each missing piece goes, e.g. "3 + [Blank] = 7"'),
    tiles: z.array(z.object({ text: z.string(), blank: z.number().int().nullable().describe('1-based number of the blank this tile fills, or null for a distractor') })),
  },
  8: {
    parts: z.array(z.object({ text: z.string(), mistake: z.boolean() })).describe('The worked expression split into parts, in order; exactly one is the mistake'),
    crossAnswers: z.array(z.object({ text: z.string(), correct: z.boolean() })).describe('Answers to "why is this part wrong?", exactly one correct'),
  },
  10: { terms: z.array(z.string()).describe('The terms in order'), hidden: z.number().int().describe('0-based index of the term the student must find') },
  11: {
    shapes: z.array(z.object({ shape: z.enum(SHAPE_TYPES), values: z.array(z.string()).describe('One value per vertex, in order') })),
    missingShape: z.number().int().describe('0-based index of the shape with the missing value'),
    missingValue: z.number().int().describe('0-based index of the missing value in that shape'),
  },
  12: { rows: z.array(z.object({ input: z.string(), output: z.string() })), hiddenRow: z.number().int().describe('0-based index of the row whose output the student must find') },
};

/** The structured output Claude returns for a type: every question found in the text. */
export function importSchema(type: number) {
  return z.object({
    exercises: z.array(z.object({ ...common, ...ANSWERS[type] })),
    skipped: z.array(z.object({ text: z.string(), reason: z.string() })).describe('Parts of the text that are not a question of this type, with why'),
  });
}
export type ImportOutput = { exercises: Array<Record<string, any>>; skipped: Array<{ text: string; reason: string }> };

export const importSystemPrompt = (type: number) => {
  const t = IMPORT_TYPES[type];
  return [
    'You turn questions that a teacher pasted into exercises for Tedix, a maths learning app for school students.',
    `Every exercise is of the type "${t.name}": ${t.fields}.`,
    'Make one exercise for each question in the text, in the order given. Keep the teacher\'s language (often Romanian) and wording; do not invent new questions.',
    'When the text gives the answer, use it. When it does not, work it out carefully. Check every answer.',
    'When a hint or solution is missing, write a short one in the same language.',
    'Text fields (question, hint, solution, options, cards, answers) are shown with KaTeX: put words inside \\text{...} and maths as LaTeX, for example: \\text{Calculati: } \\frac{1}{2}+\\frac{1}{3}.',
    'Short values (number pattern terms, shape values, number line labels, the [Blank] statement) are plain text like 12 or x+1.',
    'Put anything that is not a question of this type under skipped, with the reason.',
  ].join('\n');
};

// ---------- Claude's shape -> the editor's groups ----------

const rich = (s: unknown) => {
  const v = String(s ?? '').trim();
  return !v || v.startsWith('<') ? v : `<p>${v}</p>`;
};
const plain = (s: unknown) => String(s ?? '').trim();
const o = (option: string, isCorrect: boolean, sequenceNumber: number | null): ImportOption => ({ option, isCorrect, sequenceNumber });
const g = (options: ImportOption[], shapeType: string | null = null): ImportGroup => ({ shapeType, options });
const list = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export function toQuestion(type: number, x: Record<string, any>): ImportQuestion {
  const t = IMPORT_TYPES[type];
  if (!t?.legacy) throw new Error(`Type ${type} cannot be imported`);
  let questionBody: string | null = null;
  let groups: ImportGroup[] = [];
  switch (type) {
    case 1:
      groups = list<any>(x.pairs).map((p) => g([o(rich(p.a), false, 1), o(rich(p.b), false, 2)]));
      break;
    case 2:
      groups = [g(list<string>(x.options).map((s, i) => o(rich(s), i === x.correct, i + 1)))];
      break;
    case 3:
      groups = [g(list<any>(x.options).map((s, i) => o(rich(s.text), !!s.correct, i + 1)))];
      break;
    case 4:
      groups = [g([o(rich(x.back), true, 1)])];
      break;
    case 5:
      groups = [g(list<any>(x.points).map((p) => o(plain(p.label), !!p.toFind, Number.isInteger(p.at) ? p.at : null)))];
      break;
    case 6: {
      // Two groups, left and right, matched by position (as the editor saves them).
      const rows = list<any>(x.rows);
      groups = [g(rows.map((r, i) => o(rich(r.left), false, i + 1))), g(rows.map((r, i) => o(rich(r.right), false, i + 1)))];
      break;
    }
    case 7:
      questionBody = plain(x.statement);
      // The correct tile of blank n has sequence n; distractors have none.
      groups = [g(list<any>(x.tiles).map((s) => o(plain(s.text), s.blank != null, s.blank ?? null)))];
      break;
    case 8:
      groups = [
        g(list<any>(x.parts).map((p, i) => o(rich(p.text), !!p.mistake, i + 1))),
        g(list<any>(x.crossAnswers).map((a, i) => o(rich(a.text), !!a.correct, i + 1))),
      ];
      break;
    case 10:
      groups = [g(list<string>(x.terms).map((s, i) => o(plain(s), i === x.hidden, i + 1)))];
      break;
    case 11:
      groups = list<any>(x.shapes).map((s, si) =>
        g(list<string>(s.values).map((v, vi) => o(plain(v), si === x.missingShape && vi === x.missingValue, vi + 1)), (SHAPE_TYPES as readonly string[]).includes(s.shape) ? s.shape : 'triangle'),
      );
      break;
    case 12:
      groups = list<any>(x.rows).map((r, i) => g([o(rich(r.input), false, 1), o(rich(r.output), i === x.hiddenRow, 2)]));
      break;
  }
  return { questionType: t.legacy, question: rich(x.question), questionBody, hint: rich(x.hint), solution: rich(x.solution), groups };
}

const filled = (s: string | null | undefined) => !!String(s ?? '').replace(/<[^>]+>/g, '').trim();

/** What the editor would ask to fix before saving (the same checks as the admin's problemsOf). */
export function importProblems(type: number, q: ImportQuestion): string[] {
  const p: string[] = [];
  const opts = q.groups.flatMap((x) => x.options);
  const correct = opts.filter((x) => x.isCorrect).length;
  if (!filled(q.question)) p.push('Question is missing');
  switch (type) {
    case 1:
      if (!q.groups.length) p.push('No pairs');
      break;
    case 2:
      if (opts.length < 2) p.push('Needs at least 2 options');
      if (correct !== 1) p.push('Needs exactly one correct option');
      break;
    case 3:
      if (opts.length < 2) p.push('Needs at least 2 options');
      if (!correct) p.push('Needs a correct option');
      break;
    case 5:
      if (opts.some((x) => x.sequenceNumber == null)) p.push('Every point needs a position');
      break;
    case 6:
      if (!opts.length) p.push('No rows');
      break;
    case 7: {
      const blanks = (q.questionBody?.match(/\[Blank\]/g) ?? []).length;
      if (!blanks) p.push('The statement has no [Blank]');
      for (let b = 1; b <= blanks; b++) if (opts.filter((x) => x.sequenceNumber === b).length !== 1) p.push(`Blank ${b} needs exactly one tile`);
      break;
    }
    case 8:
      if ((q.groups[0]?.options ?? []).filter((x) => x.isCorrect).length !== 1) p.push('Mark exactly one part as the mistake');
      if ((q.groups[1]?.options ?? []).filter((x) => x.isCorrect).length !== 1) p.push('The cross question needs exactly one correct answer');
      break;
    case 10:
      if (opts.length < 3) p.push('Needs at least 3 terms');
      if (correct !== 1) p.push('Needs exactly one hidden term');
      break;
    case 11:
    case 12:
      if (correct !== 1) p.push('Needs exactly one missing value');
      break;
  }
  if (opts.some((x) => !filled(x.option))) p.push('An answer is empty');
  if (!filled(q.hint)) p.push('Hint is missing');
  if (!filled(q.solution)) p.push('Solution is missing');
  return p;
}
