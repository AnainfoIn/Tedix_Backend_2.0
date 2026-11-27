import { ExpressionError, FUNCTION_NAMES, Node, evaluate, parse, variablesOf } from './expression';

/**
 * A question template: the exercise in the editor's format (question, body, hint, solution, option
 * groups) with {placeholders}, plus the variables that fill them. Stored in
 * `exercises.question_template` (DB change 004). Every time the exercise is served, new values are
 * drawn and the placeholders filled, so the student gets a fresh question with its answer.
 *
 *   variables  a: whole number 1..9, b: whole number 1..9, c = a + b
 *   body       "{a} + {b} = [Blank]"   option "{c}" (correct, fills Blank 1)
 *
 * A placeholder is `{expression}` over the variables: `{c}`, `{c + 1}`, `{2*d}`. Braces that hold no
 * variable (LaTeX such as `\text{Fill in}` or `x^{2}`) are left as they are.
 */
export interface TemplateVariable {
  name: string;
  /** integer (default) or float */
  type?: 'integer' | 'float';
  /** Random variables: the range of values (inclusive). Formula variables: values outside are rejected. */
  min?: number | null;
  max?: number | null;
  /** Random integers only: values are min, min+step, ... (default 1). */
  step?: number | null;
  /** Floats: digits after the point (default 1). */
  decimals?: number | null;
  /** Computed from the other variables, e.g. "a + b". Without it the variable is drawn at random. */
  formula?: string | null;
  /** Random variables: values never drawn, e.g. [0] for a divisor. */
  exclude?: number[] | null;
}

export interface TemplateOption {
  option: string;
  isCorrect: boolean;
  sequenceNumber: number | null;
}
export interface TemplateGroup {
  shapeType?: string | null;
  options: TemplateOption[];
}

export interface QuestionTemplate {
  version: 1;
  /** Legacy question type the app reads (0 to 13), e.g. 3 Fill in the Blank, 2 Single Choice, 10 Number Pattern. */
  questionType: number;
  question: string;
  questionBody: string | null;
  hint: string;
  solution: string;
  groups: TemplateGroup[];
  variables: TemplateVariable[];
  /** Conditions every set of values must meet, e.g. "a > b", "c <= 20". */
  constraints?: string[];
  /** Shuffle the options of each group on every variant (choice questions). */
  shuffleOptions?: boolean;
  /** What the template was made from, for people reading it later. */
  examples?: string[];
  /** Short description, e.g. "{a} + {b} = {c}". */
  pattern?: string;
}

export interface Variant {
  values: Record<string, number>;
  questionType: number;
  question: string;
  questionBody: string | null;
  hint: string;
  solution: string;
  groups: TemplateGroup[];
  /** The correct answer(s) as text, for a quick read. */
  answer: string;
}

export class TemplateError extends Error {
  constructor(public readonly problems: string[]) {
    super(problems.join('. '));
  }
}

const NAME = /^[A-Za-z][A-Za-z0-9_]*$/;
const PLACEHOLDER = /\{([^{}]+)\}/g;
const MAX_RANGE = 1e9;

/** Number as it shows in a question: whole numbers plain, floats with their decimals (no trailing zeros). */
export function formatNumber(v: number, decimals = 0): string {
  const r = Number(v.toFixed(decimals));
  return Object.is(r, -0) ? '0' : String(r);
}

interface Compiled {
  template: QuestionTemplate;
  vars: TemplateVariable[];
  random: TemplateVariable[];
  /** Formula variables in an order where each one only needs earlier ones. */
  derived: Array<{ v: TemplateVariable; node: Node }>;
  constraints: Node[];
}

/** Checks a template and returns every problem found (empty = fine). */
export function checkTemplate(t: QuestionTemplate): string[] {
  try {
    compile(t);
    return [];
  } catch (e) {
    if (e instanceof TemplateError) return e.problems;
    throw e;
  }
}

function compile(t: QuestionTemplate): Compiled {
  const problems: string[] = [];
  if (!t || typeof t !== 'object') throw new TemplateError(['The template is missing']);
  if (!Number.isInteger(t.questionType) || t.questionType < 0 || t.questionType > 13) problems.push('questionType must be 0 to 13');
  if (!t.question?.trim()) problems.push('The question is required');
  if (!t.hint?.trim()) problems.push('The hint is required');
  if (!t.solution?.trim()) problems.push('The solution is required');
  if (!Array.isArray(t.groups)) problems.push('groups must be a list');
  const vars = Array.isArray(t.variables) ? t.variables : [];
  if (!vars.length) problems.push('Add at least one variable');
  const names = new Set<string>();
  for (const v of vars) {
    if (!NAME.test(v?.name ?? '') || FUNCTION_NAMES.includes(v.name)) problems.push(`"${v?.name}" cannot be a variable name`);
    else if (names.has(v.name)) problems.push(`Variable ${v.name} is listed twice`);
    names.add(v?.name);
    if (v.type && v.type !== 'integer' && v.type !== 'float') problems.push(`Variable ${v.name}: type must be integer or float`);
    for (const k of ['min', 'max', 'step', 'decimals'] as const) {
      if (v[k] != null && (!Number.isFinite(v[k]) || Math.abs(v[k] as number) > MAX_RANGE)) problems.push(`Variable ${v.name}: ${k} must be a number`);
    }
    if (!v.formula) {
      if (v.min == null || v.max == null) problems.push(`Variable ${v.name} needs a min and max (or a formula)`);
      else if (v.min > v.max) problems.push(`Variable ${v.name}: min is above max`);
      if (v.step != null && v.step <= 0) problems.push(`Variable ${v.name}: step must be above 0`);
    }
  }

  const nodes = new Map<string, Node>();
  for (const v of vars.filter((x) => x?.formula)) {
    try {
      const node = parse(String(v.formula));
      for (const u of variablesOf(node)) if (!names.has(u)) problems.push(`Variable ${v.name}: its formula uses unknown "${u}"`);
      nodes.set(v.name, node);
    } catch (e) {
      problems.push(`Variable ${v.name}: ${(e as Error).message}`);
    }
  }
  // Order the formulas so each one comes after the variables it uses.
  const derived: Compiled['derived'] = [];
  const done = new Set(vars.filter((v) => !v.formula).map((v) => v.name));
  let pending = vars.filter((v) => v.formula && nodes.has(v.name));
  while (pending.length) {
    const ready = pending.filter((v) => [...variablesOf(nodes.get(v.name)!)].every((u) => done.has(u)));
    if (!ready.length) {
      if (!problems.some((p) => p.includes('unknown'))) problems.push(`The formulas of ${pending.map((v) => v.name).join(', ')} depend on each other`);
      break;
    }
    for (const v of ready) {
      derived.push({ v, node: nodes.get(v.name)! });
      done.add(v.name);
    }
    pending = pending.filter((v) => !ready.includes(v));
  }

  const constraints: Node[] = [];
  for (const c of t.constraints ?? []) {
    try {
      const node = parse(c);
      for (const u of variablesOf(node)) if (!names.has(u)) problems.push(`Condition "${c}" uses unknown "${u}"`);
      constraints.push(node);
    } catch (e) {
      problems.push(`Condition "${c}": ${(e as Error).message}`);
    }
  }

  // Every placeholder must only use known variables.
  const texts = [t.question, t.questionBody ?? '', t.hint, t.solution, ...(t.groups ?? []).flatMap((g) => (g?.options ?? []).map((o) => o?.option ?? ''))];
  let used = 0;
  for (const s of texts) {
    for (const [, inner] of String(s ?? '').matchAll(PLACEHOLDER)) {
      const node = tryParse(inner);
      if (!node) continue;
      const refs = [...variablesOf(node)];
      if (!refs.length) continue;
      const unknown = refs.filter((r) => !names.has(r));
      // {Fill} or \text{Find x} are text, not placeholders; only complain when it mixes known and unknown names.
      if (unknown.length && unknown.length < refs.length) problems.push(`Placeholder {${inner}} uses unknown "${unknown.join('", "')}"`);
      if (!unknown.length) used++;
    }
  }
  if (!used && vars.length) problems.push('No {placeholder} uses the variables: the question would never change');
  if (problems.length) throw new TemplateError(problems);
  return { template: t, vars, random: vars.filter((v) => !v.formula), derived, constraints };
}

function tryParse(src: string): Node | null {
  try {
    return parse(src);
  } catch (e) {
    if (e instanceof ExpressionError) return null;
    throw e;
  }
}

const decimalsOf = (v: TemplateVariable) => (v.type === 'float' ? (v.decimals ?? 1) : 0);

/** Fills the {placeholders} of a text. Negative numbers after a sign get brackets: 3 + (-2). */
export function fill(text: string, values: Record<string, number>, decimalsByName: Record<string, number> = {}): string {
  return text.replace(PLACEHOLDER, (whole, inner: string, offset: number) => {
    const node = tryParse(inner);
    if (!node) return whole;
    const refs = [...variablesOf(node)];
    if (!refs.length || refs.some((r) => !(r in values))) return whole;
    const value = evaluate(node, values);
    const decimals = node.k === 'var' ? (decimalsByName[node.name] ?? 0) : Math.max(0, ...refs.map((r) => decimalsByName[r] ?? 0));
    const shown = formatNumber(value, decimals);
    // LaTeX arguments keep their braces: \frac{a}{b} becomes \frac{1}{4}, not \frac14.
    if (/(\\[A-Za-z]+|[\^_}])$/.test(text.slice(0, offset))) return `{${shown}}`;
    const before = text.slice(0, offset).trimEnd();
    return value < 0 && /([-+*/^]|\\times|\\cdot|\\div)$/.test(before) ? `(${shown})` : shown;
  });
}

/** Small seeded random generator (mulberry32), so a seed gives the same questions again. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = s;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function draw(v: TemplateVariable, random: () => number): number {
  const min = v.min as number;
  const max = v.max as number;
  if (v.type === 'float') {
    const d = decimalsOf(v);
    return Number((min + random() * (max - min)).toFixed(d));
  }
  const step = v.step ?? 1;
  const lo = Math.ceil(min);
  const count = Math.floor((Math.floor(max) - lo) / step) + 1;
  return lo + Math.floor(random() * count) * step;
}

/** How many different sets of random values there are (capped), to stop early when there are few. */
function space(c: Compiled): number {
  let n = 1;
  for (const v of c.random) {
    const size = v.type === 'float' ? 10 ** decimalsOf(v) * ((v.max as number) - (v.min as number)) + 1 : Math.floor((Math.floor(v.max as number) - Math.ceil(v.min as number)) / (v.step ?? 1)) + 1;
    n *= Math.max(1, size - (v.exclude?.length ?? 0));
    if (n > 1e7) return Infinity;
  }
  return n;
}

/** Computes the formula variables and checks ranges and conditions; null when the values do not fit. */
export function solve(c: Compiled, picked: Record<string, number>): Record<string, number> | null {
  const values = { ...picked };
  for (const { v, node } of c.derived) {
    const x = evaluate(node, values);
    if (!Number.isFinite(x)) return null;
    const d = decimalsOf(v);
    // A whole-number (or 1-decimal) answer must really be one: 7 / 2 is not a whole number.
    if (Math.abs(Number(x.toFixed(d)) - x) > 1e-9) return null;
    if (v.min != null && x < v.min - 1e-9) return null;
    if (v.max != null && x > v.max + 1e-9) return null;
    values[v.name] = Number(x.toFixed(d));
  }
  for (const node of c.constraints) if (!evaluate(node, values)) return null;
  return values;
}

/** Fills the template with one set of values. */
export function render(t: QuestionTemplate, values: Record<string, number>, random?: () => number): Variant {
  const decimals = Object.fromEntries(t.variables.map((v) => [v.name, decimalsOf(v)]));
  const f = (s: string) => fill(s, values, decimals);
  const groups = t.groups.map((g) => {
    let options = g.options.map((o) => ({ ...o, option: f(o.option) }));
    if (t.shuffleOptions && random) {
      for (let i = options.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [options[i], options[j]] = [options[j], options[i]];
      }
      options = options.map((o, i) => ({ ...o, sequenceNumber: i + 1 }));
    }
    return { shapeType: g.shapeType ?? null, options };
  });
  return {
    values,
    questionType: t.questionType,
    question: f(t.question),
    questionBody: t.questionBody == null ? null : f(t.questionBody),
    hint: f(t.hint),
    solution: f(t.solution),
    groups,
    answer: answerOf(t.questionType, groups),
  };
}

function answerOf(questionType: number, groups: TemplateGroup[]): string {
  const all = groups[0]?.options ?? [];
  if (questionType === 3 || questionType === 5) {
    // Fill in the Blank / Sequence: the tile of each blank, in blank order.
    return all.filter((o) => o.sequenceNumber != null && o.isCorrect !== false).sort((a, b) => (a.sequenceNumber ?? 0) - (b.sequenceNumber ?? 0)).map((o) => o.option).join(', ');
  }
  return groups.flatMap((g) => g.options.filter((o) => o.isCorrect).map((o) => o.option)).join(', ');
}

export interface GenerateOptions {
  count?: number;
  seed?: number;
  /** Values for the first variant, e.g. the example the template was made from. */
  first?: Record<string, number>;
}
export interface GenerateResult {
  variants: Variant[];
  requested: number;
  /** Set when the template has fewer different questions than were asked for. */
  note?: string;
  seed: number;
}

export const MAX_COUNT = 200;

/**
 * Makes `count` different questions from the template, each with its answer. Throws TemplateError
 * when the template is invalid.
 */
export function generate(t: QuestionTemplate, opts: GenerateOptions = {}): GenerateResult {
  const c = compile(t);
  const requested = Math.min(MAX_COUNT, Math.max(1, Math.floor(opts.count ?? 15)));
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 32);
  const random = rng(seed);
  const variants: Variant[] = [];
  const seen = new Set<string>();
  const add = (values: Record<string, number>) => {
    const variant = render(t, values, random);
    // Options of one group must differ, or the student could not tell them apart.
    if (variant.groups.some((g) => new Set(g.options.map((o) => o.option)).size < g.options.length)) return;
    const key = JSON.stringify([variant.question, variant.questionBody, variant.groups.map((g) => g.options.map((o) => o.option).sort())]);
    if (seen.has(key)) return;
    seen.add(key);
    variants.push(variant);
  };

  if (opts.first) {
    const values = solve(c, Object.fromEntries(c.random.map((v) => [v.name, opts.first![v.name]])));
    if (values) add(values);
  }
  const limit = Math.min(space(c), requested);
  const attempts = 500 + requested * 500;
  for (let i = 0; i < attempts && variants.length < limit; i++) {
    const picked: Record<string, number> = {};
    for (const v of c.random) {
      let x = draw(v, random);
      for (let k = 0; k < 20 && v.exclude?.includes(x); k++) x = draw(v, random);
      picked[v.name] = x;
    }
    if (c.random.some((v) => v.exclude?.includes(picked[v.name]))) continue;
    const values = solve(c, picked);
    if (values) add(values);
  }
  const result: GenerateResult = { variants, requested, seed };
  if (variants.length < requested) {
    result.note = variants.length
      ? `Only ${variants.length} different questions fit these ranges and conditions. Widen the ranges for more.`
      : 'No values fit these ranges and conditions. Widen the ranges or relax the conditions.';
  }
  return result;
}

/** Placeholder pattern as people write it, e.g. "{a} + {b} = {c}". */
export const describeVariables = (t: QuestionTemplate) =>
  t.variables
    .map((v) =>
      v.formula
        ? `${v.name} = ${v.formula}${v.min != null && v.max != null ? `, only ${v.min} to ${v.max}` : v.min != null ? `, at least ${v.min}` : v.max != null ? `, at most ${v.max}` : ''}`
        : `${v.name}: ${v.type === 'float' ? 'number' : 'whole number'} ${v.min} to ${v.max}${v.step && v.step !== 1 ? ` step ${v.step}` : ''}${v.exclude?.length ? `, not ${v.exclude.join(', ')}` : ''}`,
    )
    .concat((t.constraints ?? []).map((c) => `only when ${c}`));
