import { Node, evaluate, parse } from './expression';
import { QuestionTemplate, TemplateError, TemplateGroup, TemplateVariable, checkTemplate } from './template';

/**
 * generateQuestion, part A: turns example exercises into templates.
 *
 *   "2+3=5"            Fill in the Blank   {{a}} + {{b}} = [Blank]    answer {{c}}, c = a + b
 *   "12 - ? = 7"       Fill in the Blank   {{a}} - [Blank] = {{c}}    answer {{b}}
 *   "3 × 4 = 12"       (type single_choice) {{a}} \times {{b}} = ?   options {{c}}, {{c - 1}}, {{c + 1}}, {{c + 2}}
 *   "2, 4, 6, ?"       Number Pattern      terms {{s}}, {{s + d}}, ... hidden term 4
 *   "{{a}}+{{b}}={{c}}" a template typed directly (ranges from `ranges`, default 1 to 9)
 *
 * Examples with the same shape (same signs in the same places) become one template; their numbers
 * set the ranges (2 and 7 give 1 to 9, 15 and 48 give 10 to 99).
 */
export type DetectType = 'auto' | 'fill_in_the_blank' | 'single_choice' | 'number_pattern';

export type RangeInput = { min?: number; max?: number } | [number, number];

export interface DetectOptions {
  /** Exercise type to make; auto = Fill in the Blank for equations, Number Pattern for sequences. */
  type?: DetectType;
  /** Ranges by variable name, e.g. { a: [1, 20], c: { max: 20 } }. On a computed variable it is a condition. */
  ranges?: Record<string, RangeInput>;
  /** Extra conditions, e.g. ["a > b"]. Saved as formula variables cond1, cond2, ... that must be 1. */
  constraints?: string[];
  /** Own texts (may use placeholders); defaults are short English LaTeX texts like the existing exercises. */
  texts?: { question?: string; hint?: string; solution?: string };
}

export interface DetectedTemplate {
  /** Exercise type name, e.g. "Fill in the Blank". */
  typeName: string;
  /** Readable pattern, e.g. "{{a}} + {{b}} = {{c}}". */
  pattern: string;
  examples: string[];
  template: QuestionTemplate;
  /** Values of the first example, used as the saved sample question. */
  first?: Record<string, number>;
}

export interface DetectResult {
  templates: DetectedTemplate[];
  /** Examples that could not be read, with the reason. */
  skipped: Array<{ example: string; problem: string }>;
}

export const TYPE_NAMES: Record<number, string> = { 2: 'Single Choice', 3: 'Fill in the Blank', 10: 'Number Pattern' };

// ---------- reading an example ----------

type Tok =
  | { t: 'num'; v: number; dec: number }
  | { t: 'var'; name: string }
  | { t: 'unknown' }
  | { t: 'op'; op: string; sym: string }
  | { t: 'eq' };

const clean = (s: string) =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\$|\\\(|\\\)|\\\[|\\\]/g, ' ')
    .replace(/\\times/g, '×')
    .replace(/\\cdot/g, '·')
    .replace(/\\div/g, '÷')
    .replace(/\{\{/g, '{')
    .replace(/\}\}/g, '}')
    .replace(/\[Blank\]|_{1,}|□|\.{3}|…/gi, '?')
    .replace(/\{\s*\{/g, '{')
    .replace(/\}\s*\}/g, '}')
    .trim();

function tokenize(example: string): Tok[] {
  const s = clean(example);
  const out: Tok[] = [];
  let i = 0;
  const operandBefore = () => {
    const last = out[out.length - 1];
    return !!last && (last.t === 'num' || last.t === 'var' || last.t === 'unknown' || (last.t === 'op' && last.op === ')'));
  };
  while (i < s.length) {
    const c = s[i];
    const rest = s.slice(i);
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    const num = /^\d+(?:[.,]\d+)?/.exec(rest);
    if (num) {
      const text = num[0].replace(',', '.');
      out.push({ t: 'num', v: Number(text), dec: text.includes('.') ? text.split('.')[1].length : 0 });
      i += num[0].length;
      continue;
    }
    // "x" between numbers is a times sign (3 x 4); in "5x + 1" it is an unknown, which is not arithmetic.
    if ((c === 'x' || c === 'X') && operandBefore() && /^[xX]\s*[\d(?{]/.test(rest)) {
      out.push({ t: 'op', op: '*', sym: '×' });
      i++;
      continue;
    }
    // A typed template names its variables in braces: {a} or {{a}}. Other letters (x^2 + 1 = 0) are not arithmetic.
    const v = /^\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}/.exec(rest);
    if (v) {
      out.push({ t: 'var', name: v[1] });
      i += v[0].length;
      continue;
    }
    if (c === '?') {
      out.push({ t: 'unknown' });
      i++;
      continue;
    }
    if (c === '=') {
      out.push({ t: 'eq' });
      i++;
      continue;
    }
    const ops: Record<string, string> = { '+': '+', '-': '-', '−': '-', '–': '-', '*': '*', '×': '*', '·': '*', '⋅': '*', '/': '/', '÷': '/', ':': '/', '^': '^', '(': '(', ')': ')' };
    if (ops[c]) {
      // A minus with no number before it belongs to the number: -3 + 5 = 2.
      if (ops[c] === '-' && !operandBefore()) {
        const n = /^[-−–]\s*(\d+(?:[.,]\d+)?)/.exec(rest);
        if (n) {
          const text = n[1].replace(',', '.');
          out.push({ t: 'num', v: -Number(text), dec: text.includes('.') ? text.split('.')[1].length : 0 });
          i += n[0].length;
          continue;
        }
      }
      out.push({ t: 'op', op: ops[c], sym: c });
      i++;
      continue;
    }
    throw new Error(`cannot read "${c}"`);
  }
  return out;
}

const isOperand = (t: Tok) => t.t === 'num' || t.t === 'var' || t.t === 'unknown';
const shapeOf = (toks: Tok[]) => toks.map((t) => (t.t === 'num' || t.t === 'var' ? '#' : t.t === 'unknown' ? '?' : t.t === 'eq' ? '=' : t.op)).join(' ');

// ---------- ranges ----------

const digits = (n: number) => String(Math.floor(Math.abs(n))).length;
const lowOf = (v: number): number => (v === 0 ? 0 : v < 0 ? -highOf(-v) : digits(v) === 1 ? 1 : 10 ** (digits(v) - 1));
const highOf = (v: number): number => (v < 0 ? -lowOf(-v) : 10 ** digits(v) - 1);

function rangeFrom(values: number[], decimals: number, multiplier: boolean): Pick<TemplateVariable, 'type' | 'min' | 'max'> {
  if (!values.length) return { type: 'integer', min: multiplier ? 2 : 1, max: 9 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  let lo = lowOf(min);
  const hi = highOf(max);
  // 1 and 0 make dull products and quotients unless an example used them.
  if (multiplier && lo === 1 && min >= 2) lo = 2;
  if (decimals > 0) return { type: 'float', min: Math.min(lo, Math.floor(min)), max: hi + 1 - 10 ** -decimals };
  return { type: 'integer', min: lo, max: hi };
}

function applyRange(v: TemplateVariable, r: RangeInput | undefined): TemplateVariable {
  if (!r) return v;
  const o = Array.isArray(r) ? { min: r[0], max: r[1] } : r;
  const out = { ...v };
  if (o.min != null) out.min = Number(o.min);
  if (o.max != null) out.max = Number(o.max);
  if (!Number.isInteger(out.min ?? 0) || !Number.isInteger(out.max ?? 0)) out.type = 'float';
  return out;
}

/** Conditions become formula variables that must be 1 (a comparison gives 1 or 0). */
const conditionVariables = (conditions: string[]): TemplateVariable[] =>
  [...new Set(conditions)].map((c, i) => ({ name: `cond${i + 1}`, type: 'integer', formula: c, min: 1, max: 1 }));

// ---------- equations ----------

const NAMES = 'abcdfghkmnpqrtuvwyz'.split('');

interface Parsed {
  example: string;
  toks: Tok[];
}

function solveUnknown(node: Node, other: number, name: string, vars: Record<string, number>): number | null {
  // f(x) = side(x) - other; linear sides solve from two points, others by trying whole numbers.
  const f = (x: number) => evaluate(node, { ...vars, [name]: x }) - other;
  const f0 = f(0);
  const f1 = f(1);
  if (Number.isFinite(f0) && Number.isFinite(f1) && f1 !== f0) {
    const x = Number((-f0 / (f1 - f0)).toFixed(6));
    if (Math.abs(f(x)) < 1e-9) return x;
  }
  for (let k = 0; k <= 10000; k++) {
    for (const x of k ? [k, -k] : [0]) if (Math.abs(f(x)) < 1e-9) return x;
  }
  return null;
}

function equationTemplate(all: Parsed[], type: DetectType, opts: DetectOptions, bad: DetectResult['skipped']): DetectedTemplate {
  let group = all;
  const toks = group[0].toks;
  const eq = toks.findIndex((t) => t.t === 'eq');
  const slots = toks.map((t, i) => (isOperand(t) ? i : -1)).filter((i) => i >= 0);
  const leftSlots = slots.filter((i) => i < eq);
  const rightSlots = slots.filter((i) => i > eq);
  const leftOps = toks.slice(0, eq).some((t) => t.t === 'op');
  const rightOps = toks.slice(eq + 1).some((t) => t.t === 'op');
  let resultSlot: number;
  if (rightSlots.length === 1 && !rightOps && leftOps) resultSlot = rightSlots[0];
  else if (leftSlots.length === 1 && !leftOps && rightOps) resultSlot = leftSlots[0];
  else throw new Error('one side of "=" must be a single number (the result) and the other the calculation');
  const calcRange: [number, number] = resultSlot > eq ? [0, eq] : [eq + 1, toks.length];

  // Names: the letters of a typed template, else a, b, c, ... in reading order.
  const nameOf = new Map<number, string>();
  slots.forEach((i, k) => {
    const typed = group.map((g) => g.toks[i]).find((t) => t.t === 'var') as { name: string } | undefined;
    nameOf.set(i, typed?.name ?? NAMES[k]);
  });
  if (new Set(nameOf.values()).size !== slots.length) throw new Error('the same letter is used twice');

  const unknowns = slots.filter((i) => group[0].toks[i].t === 'unknown');
  const exprOf = (from: number, to: number) =>
    toks
      .slice(from, to)
      .map((t, k) => (isOperand(t) ? nameOf.get(from + k) : t.t === 'op' ? t.op : ''))
      .join(' ')
      .replace(/\( /g, '(')
      .replace(/ \)/g, ')');
  const calcExpr = exprOf(calcRange[0], calcRange[1]);
  const calcNode = parse(calcExpr);
  const resultName = nameOf.get(resultSlot)!;

  // Values of every example (the unknown solved), checked.
  const rows: Array<Record<string, number>> = [];
  // A wrong example is left out (and reported); the others of the same shape still count.
  const good: Parsed[] = [];
  for (const g of group) {
    const vals: Record<string, number> = {};
    let unknown: number | null = null;
    let typed = false;
    for (const i of slots) {
      const t = g.toks[i];
      if (t.t === 'num') vals[nameOf.get(i)!] = t.v;
      else if (t.t === 'unknown') unknown = i;
      else typed = true;
    }
    if (typed) {
      good.push(g);
      continue;
    }
    let problem: string | null = null;
    if (unknown === resultSlot) vals[resultName] = evaluate(calcNode, vals);
    else if (unknown != null) {
      const x = solveUnknown(calcNode, vals[resultName], nameOf.get(unknown)!, vals);
      if (x == null) problem = `"${g.example}": no number makes it true`;
      else vals[nameOf.get(unknown)!] = x;
    } else {
      const got = evaluate(calcNode, vals);
      if (!(Math.abs(got - vals[resultName]) < 1e-9)) problem = `"${g.example}" is not correct: the calculation gives ${Number(got.toFixed(6))}`;
    }
    if (!problem && !Number.isFinite(vals[resultName])) problem = `"${g.example}" divides by zero`;
    if (problem) {
      bad.push({ example: g.example, problem });
      continue;
    }
    good.push(g);
    rows.push(vals);
  }
  if (!good.length) throw new Error(bad[bad.length - 1].problem);
  group = good;
  const decimalsOf = (i: number) => Math.max(0, ...group.map((g) => (g.toks[i].t === 'num' ? (g.toks[i] as { dec: number }).dec : 0)));

  // Which operands sit next to * or / (multipliers, divisors).
  const nextToOp = (i: number, ops: string[]) => [toks[i - 1], toks[i + 1]].some((t) => t?.t === 'op' && ops.includes(t.op));
  const exponent = (i: number) => toks[i - 1]?.t === 'op' && (toks[i - 1] as { op: string }).op === '^';
  const divisor = (i: number) => toks[i - 1]?.t === 'op' && (toks[i - 1] as { op: string }).op === '/';

  const calcSlots = slots.filter((i) => i !== resultSlot);
  const simpleDivision =
    calcSlots.length === 2 && toks.slice(calcRange[0], calcRange[1]).filter((t) => t.t === 'op').length === 1 && divisor(calcSlots[1]) && slots.every((i) => decimalsOf(i) === 0);

  const variables: TemplateVariable[] = [];
  const valuesOf = (name: string) => rows.map((r) => r[name]);
  if (simpleDivision) {
    // a : b = c is made as a = b × c, so every question divides exactly.
    const [a, b] = calcSlots.map((i) => nameOf.get(i)!);
    const aRange = rangeFrom(valuesOf(a), 0, true);
    variables.push(applyRange({ name: a, type: 'integer', formula: `${b} * ${resultName}`, min: rows.length ? aRange.min : null, max: rows.length ? aRange.max : null }, opts.ranges?.[a]));
    variables.push(applyRange({ name: b, ...rangeFrom(valuesOf(b), 0, true) }, opts.ranges?.[b]));
    variables.push(applyRange({ name: resultName, ...rangeFrom(valuesOf(resultName), 0, true) }, opts.ranges?.[resultName]));
  } else {
    for (const i of calcSlots) {
      const name = nameOf.get(i)!;
      const v: TemplateVariable = { name, ...rangeFrom(valuesOf(name), decimalsOf(i), nextToOp(i, ['*', '/', '^'])) };
      if (exponent(i)) {
        // Small exponents, as in the examples: 2^3 gives exponents 2 to 3.
        const seen = valuesOf(name);
        v.min = seen.length ? Math.min(2, ...seen) : 2;
        v.max = Math.max(3, ...seen);
      }
      variables.push(applyRange(v, opts.ranges?.[name]));
    }
    const res = valuesOf(resultName);
    const dec = Math.max(decimalsOf(resultSlot), ...calcSlots.map((i) => decimalsOf(i)));
    const result: TemplateVariable = { name: resultName, type: dec ? 'float' : 'integer', formula: calcExpr };
    // No negative answers unless an example had one.
    if (!res.length || res.every((x) => x >= 0)) result.min = 0;
    variables.push(applyRange(result, opts.ranges?.[resultName]));
    // Reorder: random variables first, then the result, in reading order of the names.
    variables.sort((x, y) => slots.findIndex((i) => nameOf.get(i) === x.name) - slots.findIndex((i) => nameOf.get(i) === y.name));
  }

  const hiddenSlot = unknowns[0] ?? resultSlot;
  const hidden = nameOf.get(hiddenSlot)!;
  const show = (blank: string) =>
    toks
      .map((t, i) => {
        if (isOperand(t)) return i === hiddenSlot ? blank : `{{${nameOf.get(i)}}}`;
        if (t.t === 'eq') return '=';
        if (t.op === '*') return t.sym === '·' || t.sym === '*' ? '\\cdot' : '\\times';
        if (t.op === '/') return t.sym === ':' ? ':' : t.sym === '/' ? '/' : '\\div';
        return t.op;
      })
      .join(' ')
      .replace(/\( /g, '(')
      .replace(/ \)/g, ')')
      .replace(/ \^ (\{\{\w+\}\})/g, '^{$1}');
  const full = show(`{{${hidden}}}`);
  const pattern = full.replace(/\\times/g, '×').replace(/\\cdot/g, '·').replace(/\\div/g, '÷');
  const mainOp = (toks.slice(calcRange[0], calcRange[1]).find((t) => t.t === 'op' && t.op !== '(' && t.op !== ')') as { op: string } | undefined)?.op;
  const hint =
    hiddenSlot !== resultSlot
      ? '\\text{Which number makes the equality true? Try it in the equality.}'
      : ({ '+': '\\text{Add the numbers.}', '-': '\\text{Subtract the second number from the first.}', '*': '\\text{Multiply the numbers.}', '/': '\\text{Divide the first number by the second.}', '^': '\\text{Multiply the base by itself as many times as the exponent says.}' } as Record<string, string>)[mainOp ?? '+'] ?? '\\text{Calculate step by step.}';

  const constraints = [...(opts.constraints ?? [])];
  const hiddenVar = variables.find((v) => v.name === hidden)!;
  const nonNegative = (hiddenVar.min ?? -1) >= 0;
  // The wrong options are the answer - 1 and + 1, so the answer is at least 1 (no negative option).
  const atLeastOne = () => {
    if (hiddenVar.formula) hiddenVar.min = Math.max(hiddenVar.min ?? 1, 1);
    else if ((hiddenVar.min ?? 0) < 1) constraints.push(`${hidden} >= 1`);
  };
  let question: string;
  let questionBody: string | null;
  let groups: TemplateGroup[];
  let questionType: number;
  if (type === 'single_choice') {
    questionType = 2;
    question = opts.texts?.question ?? show('?');
    questionBody = null;
    // Wrong options next to the answer; the answer must be at least 1 so none of them is negative.
    if (nonNegative) atLeastOne();
    groups = [{ shapeType: null, options: [`{{${hidden}}}`, `{{${hidden} - 1}}`, `{{${hidden} + 1}}`, `{{${hidden} + 2}}`].map((o, i) => ({ option: o, isCorrect: i === 0, sequenceNumber: i + 1 })) }];
  } else {
    questionType = 3;
    question = opts.texts?.question ?? '\\text{Fill in the blank.}';
    questionBody = show('[Blank]');
    if (nonNegative) atLeastOne();
    groups = [
      {
        shapeType: null,
        options: [
          { option: `{{${hidden}}}`, isCorrect: true, sequenceNumber: 1 },
          { option: `{{${hidden} + 1}}`, isCorrect: false, sequenceNumber: null },
          { option: `{{${hidden} - 1}}`, isCorrect: false, sequenceNumber: null },
        ],
      },
    ];
  }
  const template: QuestionTemplate = {
    version: 1,
    questionType,
    question,
    questionBody,
    hint: opts.texts?.hint ?? hint,
    solution: opts.texts?.solution ?? full,
    groups,
    variables: [...variables, ...conditionVariables(constraints)],
    shuffleOptions: questionType === 2 ? true : undefined,
    examples: group.map((g) => g.example),
    pattern,
  };
  return { typeName: TYPE_NAMES[questionType], pattern, examples: template.examples!, template, first: rows[0] };
}

// ---------- number patterns ----------

function patternTerms(example: string): Array<number | null> | null {
  const s = clean(example);
  if (s.includes('=')) return null;
  const parts = s.split(/\s*[,;]\s*|\s+/).filter(Boolean);
  if (parts.length < 3) return null;
  const terms = parts.map((p) => (p === '?' ? null : /^-?\d+$/.test(p) ? Number(p) : NaN));
  if (terms.some((t) => Number.isNaN(t))) return null;
  if (terms.filter((t) => t === null).length > 1 || terms.filter((t) => t !== null).length < 3) return null;
  return terms;
}

function patternTemplate(group: Array<{ example: string; terms: Array<number | null> }>, opts: DetectOptions): DetectedTemplate {
  const n = group[0].terms.length;
  const hiddenIndex = group[0].terms.findIndex((t) => t === null);
  const hide = hiddenIndex >= 0 ? hiddenIndex : n - 1;
  let kind: 'add' | 'times' | null = null;
  const starts: number[] = [];
  const steps: number[] = [];
  for (const g of group) {
    const known = g.terms.map((t, i) => [i, t] as const).filter(([, t]) => t !== null) as Array<readonly [number, number]>;
    const [[i0, t0], [i1, t1]] = known;
    const d = (t1 - t0) / (i1 - i0);
    const isAdd = Number.isInteger(d) && known.every(([i, t]) => t === t0 + (i - i0) * d);
    const r = t0 !== 0 ? (t1 / t0) ** (1 / (i1 - i0)) : NaN;
    const rr = Math.round(r);
    const isTimes = !isAdd && Number.isFinite(r) && Math.abs(r - rr) < 1e-9 && rr !== 0 && rr !== 1 && known.every(([i, t]) => t === t0 * rr ** (i - i0));
    const k = isAdd ? 'add' : isTimes ? 'times' : null;
    if (!k) throw new Error(`"${g.example}" does not add or multiply by the same number each time`);
    if (kind && kind !== k) throw new Error('these examples follow different kinds of rule');
    kind = k;
    if (k === 'add') {
      starts.push(t0 - i0 * d);
      steps.push(d);
    } else {
      starts.push(t0 / rr ** i0);
      steps.push(rr);
    }
  }
  const stepName = kind === 'add' ? 'd' : 'r';
  const sRange = rangeFrom(starts, 0, false);
  const stepMax = Math.max(...steps.map(Math.abs));
  const step: TemplateVariable =
    kind === 'add'
      ? steps.every((d) => d < 0)
        ? { name: 'd', type: 'integer', min: -highOf(stepMax), max: -1 }
        : { name: 'd', type: 'integer', min: 1, max: highOf(stepMax) }
      : { name: 'r', type: 'integer', min: 2, max: Math.max(3, stepMax) };
  const variables = [applyRange({ name: 's', ...sRange }, opts.ranges?.s), applyRange(step, opts.ranges?.[stepName])];
  const termExpr = (i: number) => (i === 0 ? 's' : kind === 'add' ? (i === 1 ? 's + d' : `s + ${i} * d`) : i === 1 ? 's * r' : `s * r^${i}`);
  const constraints = [...(opts.constraints ?? [])];
  // Decreasing patterns stay at 0 or above, as in the examples.
  if (kind === 'add' && steps.every((d) => d < 0) && group.every((g) => g.terms.every((t) => t === null || t >= 0))) constraints.push(`${termExpr(n - 1)} >= 0`);
  const template: QuestionTemplate = {
    version: 1,
    questionType: 10,
    question: opts.texts?.question ?? '\\text{Find the missing term.}',
    questionBody: null,
    hint: opts.texts?.hint ?? (kind === 'add' ? '\\text{Look at how much each term grows.}' : '\\text{Each term is the one before multiplied by the same number.}'),
    solution:
      opts.texts?.solution ??
      (kind === 'add' ? `\\text{Each term adds } {{d}}\\text{, so the missing term is } {{${termExpr(hide)}}}.` : `\\text{Each term is multiplied by } {{r}}\\text{, so the missing term is } {{${termExpr(hide)}}}.`),
    groups: [{ shapeType: null, options: Array.from({ length: n }, (_, i) => ({ option: `{{${termExpr(i)}}}`, isCorrect: i === hide, sequenceNumber: i + 1 })) }],
    variables: [...variables, ...conditionVariables(constraints)],
    examples: group.map((g) => g.example),
    pattern: Array.from({ length: n }, (_, i) => (i === hide ? '?' : `{{${termExpr(i)}}}`)).join(', '),
  };
  return { typeName: TYPE_NAMES[10], pattern: template.pattern!, examples: template.examples!, template, first: { s: starts[0], [stepName]: steps[0] } };
}

// ---------- entry point ----------

/** Reads the examples and makes one template per shape. Throws TemplateError when nothing could be read. */
export function detectTemplates(examples: string[], opts: DetectOptions = {}): DetectResult {
  const type = opts.type ?? 'auto';
  const skipped: DetectResult['skipped'] = [];
  const equations = new Map<string, Parsed[]>();
  const patterns = new Map<string, Array<{ example: string; terms: Array<number | null> }>>();
  for (const raw of examples.map((e) => String(e ?? '').trim()).filter(Boolean)) {
    const terms = patternTerms(raw);
    if (terms && type !== 'fill_in_the_blank' && type !== 'single_choice') {
      const key = `${terms.length}:${terms.findIndex((t) => t === null)}`;
      patterns.set(key, [...(patterns.get(key) ?? []), { example: raw, terms }]);
      continue;
    }
    if (type === 'number_pattern') {
      skipped.push({ example: raw, problem: 'is not a number pattern like "2, 4, 6, ?"' });
      continue;
    }
    try {
      const toks = tokenize(raw);
      if (toks.filter((t) => t.t === 'eq').length !== 1) throw new Error('needs exactly one "=" (like 2 + 3 = 5) or a list of numbers (like 2, 4, 6, 8)');
      if (toks.filter((t) => t.t === 'unknown').length > 1) throw new Error('can have only one "?"');
      const key = shapeOf(toks);
      equations.set(key, [...(equations.get(key) ?? []), { example: raw, toks }]);
    } catch (e) {
      skipped.push({ example: raw, problem: (e as Error).message });
    }
  }

  const templates: DetectedTemplate[] = [];
  for (const group of equations.values()) {
    try {
      templates.push(equationTemplate(group, type, opts, skipped));
    } catch (e) {
      group.filter((g) => !skipped.some((s) => s.example === g.example)).forEach((g) => skipped.push({ example: g.example, problem: (e as Error).message }));
    }
  }
  for (const group of patterns.values()) {
    try {
      templates.push(patternTemplate(group, opts));
    } catch (e) {
      group.forEach((g) => skipped.push({ example: g.example, problem: (e as Error).message }));
    }
  }
  for (const t of templates) {
    const problems = checkTemplate(t.template);
    if (problems.length) throw new TemplateError(problems.map((p) => `${t.pattern}: ${p}`));
  }
  if (!templates.length) {
    throw new TemplateError(skipped.length ? skipped.map((s) => (s.problem.startsWith('"') ? s.problem : `"${s.example}" ${s.problem}`)) : ['Give at least one example, like "2 + 3 = 5"']);
  }
  return { templates, skipped };
}
