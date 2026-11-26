import { Exercise, Question } from './types';

/**
 * The 12 exercise types of the editor design and the old question types (0 to 13) the app reads.
 * Answers keep the shape the mobile app expects: option groups with options, `is_correct` and
 * `sequence_number` (see the "Fields per type" design board).
 */
export interface TypeSpec {
  n: number;
  name: string;
  legacy: number[];
  /** What the student is asked to do, shown above the answers in the phone preview. */
  task: string;
}

export const TYPES: TypeSpec[] = [
  { n: 1, name: 'Tap & Pair', legacy: [7], task: 'Tap the two cards that belong together' },
  { n: 2, name: 'Single Choice', legacy: [2], task: 'Choose the correct answer' },
  { n: 3, name: 'Multiple Choice', legacy: [6, 0, 1], task: 'Select all that apply' },
  { n: 4, name: 'Memory Card', legacy: [9], task: 'Think of the answer, then reveal it' },
  { n: 5, name: 'Number Line', legacy: [13], task: 'Place the points on the line' },
  { n: 6, name: 'Match the Column', legacy: [4], task: 'Match each item with its pair' },
  { n: 7, name: 'Drag & Drop / Sequence / Fill in the Blank', legacy: [3, 5], task: 'Drag the right tile into each gap' },
  { n: 8, name: 'Find the Mistake', legacy: [8], task: 'Tap the wrong part, then say why' },
  { n: 9, name: 'Lego Build Problem', legacy: [], task: 'Build the expression from the pieces' },
  { n: 10, name: 'Number Pattern', legacy: [10], task: 'Find the missing term' },
  { n: 11, name: 'Shape Pattern', legacy: [11], task: 'Find the missing number' },
  { n: 12, name: 'Rule Discovery', legacy: [12], task: 'Find the rule, then the missing output' },
];

export const typeOf = (questionType: number | null | undefined): TypeSpec =>
  TYPES.find((t) => t.legacy.includes(Number(questionType))) ?? TYPES[2];

export const SHAPES: Array<{ value: string; label: string; vertices: number }> = [
  { value: 'triangle', label: 'Triangle', vertices: 3 },
  { value: 'triangle_with_center', label: 'Triangle with center', vertices: 4 },
  { value: 'square_with_center', label: 'Square with center', vertices: 5 },
  { value: 'square_with_cross', label: 'Square with cross', vertices: 5 },
  { value: 'pentagon_with_center', label: 'Pentagon with center', vertices: 6 },
  { value: 'asterisk', label: 'Asterisk', vertices: 6 },
];

export interface DOpt {
  key: string;
  id?: number;
  option: string;
  isCorrect: boolean;
  sequenceNumber: number | null;
}
export interface DGroup {
  key: string;
  id?: number;
  shapeType: string | null;
  options: DOpt[];
}
export interface Draft {
  name: string;
  isAha: boolean;
  questionId?: number;
  questionType: number;
  question: string;
  questionBody: string;
  hint: string;
  solution: string;
  groups: DGroup[];
}

let seq = 0;
export const newKey = () => `n${++seq}`;
export const opt = (option = '', isCorrect = false, sequenceNumber: number | null = null): DOpt => ({ key: newKey(), option, isCorrect, sequenceNumber });
export const group = (options: DOpt[] = [], shapeType: string | null = null): DGroup => ({ key: newKey(), shapeType, options });

export function draftOf(exercise: Exercise, question: Question | undefined, fallbackType = 6): Draft {
  const groups: DGroup[] = [];
  for (const o of question?.options ?? []) {
    let g = groups.find((x) => x.id === o.groupId);
    if (!g) {
      g = { key: `g${o.groupId}`, id: o.groupId, shapeType: o.shapeType ?? null, options: [] };
      groups.push(g);
    }
    g.options.push({ key: `o${o.id}`, id: o.id, option: o.option ?? '', isCorrect: !!o.isCorrect, sequenceNumber: o.sequenceNumber ?? null });
  }
  return {
    name: exercise.name ?? '',
    isAha: !!exercise.isAha,
    questionId: question?.id,
    questionType: question?.questionType ?? fallbackType,
    question: question?.question ?? '',
    questionBody: question?.questionBody ?? '',
    hint: question?.hint ?? '',
    solution: question?.solution ?? '',
    groups,
  };
}

export const bodyOf = (d: Draft) => ({
  name: d.name,
  isAha: d.isAha,
  question: {
    id: d.questionId ?? null,
    questionType: d.questionType,
    question: d.question,
    questionBody: d.questionBody || null,
    hint: d.hint,
    solution: d.solution,
    groups: d.groups.map((g) => ({
      id: g.id ?? null,
      shapeType: g.shapeType,
      options: g.options.map((o) => ({ id: o.id ?? null, option: o.option, isCorrect: o.isCorrect, sequenceNumber: o.sequenceNumber })),
    })),
  },
});

/** All options of the draft in one list (single-group types). */
export const allOptions = (d: Draft) => d.groups.flatMap((g) => g.options);

/** Replaces the options of a single-group type, keeping the group's id. */
export const withOptions = (d: Draft, options: DOpt[]): Draft => ({ ...d, groups: [{ ...(d.groups[0] ?? group()), options }] });

/** Number of [Blank] slots in the statement. */
export const blankCount = (body: string) => (body.match(/\[Blank\]/g) ?? []).length;

/** Match the Column rows: two groups (left, right) matched by position, or one group split in half. */
export function matchRows(d: Draft): Array<{ left: DOpt | null; right: DOpt | null }> {
  let left: DOpt[];
  let right: DOpt[];
  if (d.groups.length >= 2) {
    left = d.groups[0].options;
    right = d.groups[1].options;
  } else {
    const all = d.groups[0]?.options ?? [];
    const half = Math.ceil(all.length / 2);
    left = all.slice(0, half);
    right = all.slice(half);
  }
  return Array.from({ length: Math.max(left.length, right.length) }, (_, i) => ({ left: left[i] ?? null, right: right[i] ?? null }));
}

export function withMatchRows(d: Draft, rows: Array<{ left: DOpt | null; right: DOpt | null }>): Draft {
  const left = rows.map((r, i) => ({ ...(r.left ?? opt()), sequenceNumber: i + 1 }));
  if (d.groups.length >= 2) {
    const right = rows.map((r, i) => ({ ...(r.right ?? opt()), sequenceNumber: i + 1 }));
    return { ...d, groups: [{ ...d.groups[0], options: left }, { ...d.groups[1], options: right }] };
  }
  const right = rows.map((r, i) => ({ ...(r.right ?? opt()), sequenceNumber: rows.length + i + 1 }));
  return withOptions(d, [...left, ...right]);
}

const filled = (s: string | null | undefined) => !!String(s ?? '').replace(/<[^>]+>/g, '').trim();

/** The checks needed to save valid data for the app, per type (the "Needed to save" lists of the design). */
export function problemsOf(d: Draft): string[] {
  const p: string[] = [];
  const t = typeOf(d.questionType);
  if (d.name.trim().length < 2) p.push('Name needs at least 2 characters.');
  if (!filled(d.question)) p.push(t.n === 7 ? 'Instruction is required.' : t.n === 4 ? 'Front of the card (question) is required.' : 'Question is required.');
  const opts = allOptions(d);
  const empty = opts.filter((o) => !filled(o.option)).length;

  switch (t.n) {
    case 1:
      if (!d.groups.length) p.push('Add at least one pair.');
      if (d.groups.some((g) => g.options.length < 2 || g.options.some((o) => !filled(o.option)))) p.push('Every card needs text.');
      break;
    case 2:
      if (opts.filter((o) => filled(o.option)).length < 2) p.push('Fill at least 2 options.');
      if (opts.filter((o) => o.isCorrect).length !== 1) p.push('Mark exactly one option as correct.');
      if (empty) p.push(`${empty} option${empty > 1 ? 's are' : ' is'} empty: type ${empty > 1 ? 'their' : 'its'} text or remove ${empty > 1 ? 'them' : 'it'}.`);
      break;
    case 3:
      if (opts.filter((o) => filled(o.option)).length < 2) p.push('Fill at least 2 options.');
      if (!opts.some((o) => o.isCorrect)) p.push('Mark at least one option as correct.');
      if (empty) p.push(`${empty} option${empty > 1 ? 's are' : ' is'} empty: type ${empty > 1 ? 'their' : 'its'} text or remove ${empty > 1 ? 'them' : 'it'}.`);
      break;
    case 4:
      if (!opts.some((o) => filled(o.option))) p.push('Back of the card is required.');
      break;
    case 5:
      if (!opts.length) p.push('Add at least one point.');
      if (opts.some((o) => !filled(o.option) || o.sequenceNumber == null)) p.push('Every point needs a label and a position.');
      break;
    case 6: {
      const rows = matchRows(d);
      if (!rows.length) p.push('Add at least one row.');
      if (rows.some((r) => !filled(r.left?.option) || !filled(r.right?.option))) p.push('Fill left and right in every row.');
      break;
    }
    case 7: {
      const blanks = blankCount(d.questionBody);
      if (!blanks) p.push('The statement needs at least one blank.');
      d.groups.forEach((g, gi) => {
        const set = d.groups.length > 1 ? ` in answer set ${gi + 1}` : '';
        for (let b = 1; b <= blanks; b++) {
          const n = g.options.filter((o) => o.sequenceNumber === b).length;
          if (n !== 1) p.push(`Every blank needs exactly one correct tile: Blank ${b} has ${n ? n : 'none'}${set}.`);
        }
        g.options.forEach((o, i) => { if (!filled(o.option)) p.push(`Tile ${i + 1}${set} is empty.`); });
        g.options.forEach((o, i) => { if (o.sequenceNumber != null && o.sequenceNumber > blanks) p.push(`Tile ${i + 1}${set} fills Blank ${o.sequenceNumber}, which is not in the statement.`); });
      });
      if (!d.groups.length && blanks) p.push('Add the tiles that fill the blanks.');
      break;
    }
    case 8: {
      const [parts, answers] = [d.groups[0]?.options ?? [], d.groups[1]?.options ?? []];
      if (parts.length < 2) p.push('Split the expression into at least 2 parts.');
      if (parts.filter((o) => o.isCorrect).length !== 1) p.push('Mark exactly one part as the mistake.');
      if (parts.some((o) => !filled(o.option))) p.push('Every part needs text.');
      if (answers.length < 2) p.push('Give the cross question at least 2 answers.');
      if (answers.filter((o) => o.isCorrect).length !== 1) p.push('Mark exactly one answer of the cross question as correct.');
      if (answers.some((o) => !filled(o.option))) p.push('Every answer of the cross question needs text.');
      break;
    }
    case 10:
      if (opts.length < 3) p.push('Add at least 3 terms.');
      if (opts.filter((o) => o.isCorrect).length !== 1) p.push('Mark exactly one term as hidden.');
      if (empty) p.push('Every term needs a value.');
      break;
    case 11:
      if (!d.groups.length) p.push('Add at least one shape.');
      if (d.groups.some((g) => !g.shapeType)) p.push('Pick the shape of every card.');
      if (opts.some((o) => !filled(o.option))) p.push('Every vertex needs a value.');
      if (opts.filter((o) => o.isCorrect).length !== 1) p.push('Mark exactly one value as missing.');
      break;
    case 12:
      if (d.groups.length < 2) p.push('Add at least 2 example rows.');
      if (d.groups.some((g) => g.options.length < 2 || g.options.some((o) => !filled(o.option)))) p.push('Fill input and output in every row.');
      if (opts.filter((o) => o.isCorrect).length !== 1) p.push('Mark exactly one output as hidden.');
      break;
  }
  if (!filled(d.hint)) p.push('Hint is required.');
  if (!filled(d.solution)) p.push('Solution is required.');
  return p;
}

export const sameDraft = (a: Draft, b: Draft) => JSON.stringify(bodyOf(a)) === JSON.stringify(bodyOf(b));
