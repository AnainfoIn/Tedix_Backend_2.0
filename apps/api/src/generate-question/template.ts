import { ExpressionError, FUNCTION_NAMES, Node, evaluate, parse, variablesOf } from './expression';

/**
 * A question template, in the format the existing template exercises already use: the exercise's
 * own question, body, hint, solution and answer options with {{placeholders}}, and its rows in
 * `bx_block_assessmenttest_variables` (name, value_type, min_val, max_val, formula), with
 * `questionbank_type = 'template'`. Every time the exercise is served, new values are drawn and the
 * placeholders filled, so the student gets a fresh question with its answer.
 *
 *   variables  a: integer 1..9, b: integer 1..9, c = a + b (min 0)
 *   body       "{{a}} + {{b}} = [Blank]"   option "{{c}}" (correct, fills Blank 1)
 *
 * A placeholder is a variable name, `{{c}}`, or an expression over the variables, `{{c + 1}}`. A
 * formula variable with a min or max is a condition: values outside are not used. So a condition
 * like "a > b" is stored as a variable with formula "a > b" and min 1 (comparisons give 1 or 0).
 */
export interface TemplateVariable {
  name: string;
  /** integer (default) or float (shown with up to 2 decimals) */
  type?: 'integer' | 'float';
  /** Random variables: the range of values (inclusive). Formula variables: values outside are not used. */
  min?: number | null;
  max?: number | null;
  /** Computed from the other variables, e.g. "a + b". Without it the variable is drawn at random. */
  formula?: string | null;
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
  version?: 1;
  /** Legacy question type the app reads (0 to 13), e.g. 3 Fill in the Blank, 2 Single Choice, 10 Number Pattern. */
  questionType: number;
  question: string;
  questionBody: string | null;
  hint: string;
  solution: string;
  groups: TemplateGroup[];
  variables: TemplateVariable[];
  /** Shuffle the options of each group on every variant (choice questions). */
  shuffleOptions?: boolean;
  /** What the template was made from (not stored). */
  examples?: string[];
  /** Short description, e.g. "{{a}} + {{b}} = {{c}}" (not stored). */
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

/** Names in the data include "3a" or "dist_d1d2"; expressions see the ones that do not start with a letter under an alias. */
const NAME_OK = /^[A-Za-z0-9_]+$/;
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const PLACEHOLDER = /\{\{\s*([^{}]+?)\s*\}\}/g;
const MAX_RANGE = 1e9;
const FLOAT_DECIMALS = 2;

/** Number as it shows in a question: whole numbers plain, floats with up to their decimals (no trailing zeros). */
export function formatNumber(v: number, decimals = 0): string {
  const r = Number(v.toFixed(decimals));
  return Object.is(r, -0) ? '0' : String(r);
}

export interface Compiled {
  template: QuestionTemplate;
  vars: TemplateVariable[];
  random: TemplateVariable[];
  /** Formula variables in an order where each one only needs earlier ones. */
  derived: Array<{ v: TemplateVariable; node: Node }>;
  /** Rewrites an expression so names like "3a" can be parsed. */
  safe: (src: string) => string;
  /** Values keyed by the names expressions use. */
  env: (values: Record<string, number>) => Record<string, number>;
  names: Set<string>;
  /** New templates: a whole-number formula must give a whole number, and options must differ. Existing ones: rounded, as they are. */
  strict: boolean;
}

const decimalsOf = (v: TemplateVariable) => (v.type === 'float' ? FLOAT_DECIMALS : 0);

function tryParse(src: string): Node | null {
  try {
    return parse(src);
  } catch (e) {
    if (e instanceof ExpressionError) return null;
    throw e;
  }
}

/**
 * Checks a template. Strict (for new templates): every placeholder must use known variables and at
 * least one must use them. Not strict (serving existing exercises): only the variables are checked.
 */
export function checkTemplate(t: QuestionTemplate, strict = true): string[] {
  try {
    compile(t, strict);
    return [];
  } catch (e) {
    if (e instanceof TemplateError) return e.problems;
    throw e;
  }
}

export function compile(t: QuestionTemplate, strict = true): Compiled {
  const problems: string[] = [];
  if (!t || typeof t !== 'object') throw new TemplateError(['The template is missing']);
  if (!Number.isInteger(t.questionType) || t.questionType < 0 || t.questionType > 13) problems.push('questionType must be 0 to 13');
  if (strict) {
    if (!t.question?.trim()) problems.push('The question is required');
    if (!t.hint?.trim()) problems.push('The hint is required');
    if (!t.solution?.trim()) problems.push('The solution is required');
  }
  if (!Array.isArray(t.groups)) problems.push('groups must be a list');
  const vars = Array.isArray(t.variables) ? t.variables : [];
  if (!vars.length) problems.push('Add at least one variable');
  const names = new Set<string>();
  for (const v of vars) {
    // New templates use plain names; existing ones may have names like "2k+1", which work in {{2k+1}}.
    if (strict ? !NAME_OK.test(v?.name ?? '') || /^\d+$/.test(v.name) || FUNCTION_NAMES.includes(v.name) : !String(v?.name ?? '').trim()) problems.push(`"${v?.name}" cannot be a variable name`);
    else if (names.has(v.name)) problems.push(`Variable ${v.name} is listed twice`);
    names.add(v?.name);
    if (v.type && v.type !== 'integer' && v.type !== 'float') problems.push(`Variable ${v.name}: type must be integer or float`);
    for (const k of ['min', 'max'] as const) {
      if (v[k] != null && (!Number.isFinite(v[k]) || Math.abs(v[k] as number) > MAX_RANGE)) problems.push(`Variable ${v.name}: ${k} must be a number`);
    }
    if (!v.formula) {
      if (v.min == null || v.max == null) problems.push(`Variable ${v.name} needs a min and max (or a formula)`);
      else if (v.min > v.max) problems.push(`Variable ${v.name}: min is above max`);
    }
  }

  // Aliases for names an expression cannot hold ("3a" -> __v0), longest first so "a1" is not cut by "a".
  const aliases = [...names].filter((n) => !IDENT.test(n) || FUNCTION_NAMES.includes(n)).sort((a, b) => b.length - a.length).map((n, i) => [n, `__v${i}`] as const);
  const aliased = (src: string) =>
    aliases.reduce((acc, [n, a]) => acc.replace(new RegExp(`(?<![A-Za-z0-9_])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9_])`, 'g'), a), src);
  const known = new Set([...names].filter((n) => IDENT.test(n) && !FUNCTION_NAMES.includes(n)).concat(aliases.map(([, a]) => a)));
  // Written as in a textbook: {{ae-bd}} is a*e - b*d and {{2a}} is 2*a, when a, b, d, e are variables.
  const split = (word: string): string[] | null => {
    if (!word) return [];
    for (let k = word.length; k > 0; k--) {
      if (known.has(word.slice(0, k))) {
        const rest = split(word.slice(k));
        if (rest) return [word.slice(0, k), ...rest];
      }
    }
    return null;
  };
  const safe = (src: string) =>
    aliased(src)
      .replace(/(\d)\s*([A-Za-z_(])/g, '$1*$2')
      .replace(/[A-Za-z_][A-Za-z0-9_]*/g, (w, at: number, all: string) => {
        if (known.has(w) || (FUNCTION_NAMES.includes(w) && all[at + w.length] === '(')) return w;
        const parts = split(w);
        return parts && parts.length > 1 ? `(${parts.join('*')})` : w;
      });
  const back = new Map<string, string>(aliases.map(([n, a]) => [a, n]));
  const orig = (u: string) => back.get(u) ?? u;
  const env = (values: Record<string, number>) => {
    const out: Record<string, number> = { ...values };
    for (const [n, a] of aliases) if (n in values) out[a] = values[n];
    return out;
  };

  const nodes = new Map<string, Node>();
  for (const v of vars.filter((x) => x?.formula)) {
    try {
      const node = parse(safe(String(v.formula)));
      for (const u of variablesOf(node)) if (!names.has(orig(u))) problems.push(`Variable ${v.name}: its formula uses unknown "${orig(u)}"`);
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
    const ready = pending.filter((v) => [...variablesOf(nodes.get(v.name)!)].every((u) => done.has(orig(u))));
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

  if (strict) {
    const texts = [t.question, t.questionBody ?? '', t.hint, t.solution, ...(t.groups ?? []).flatMap((g) => (g?.options ?? []).map((o) => o?.option ?? ''))];
    let used = 0;
    for (const s of texts) {
      for (const [, inner] of String(s ?? '').matchAll(PLACEHOLDER)) {
        if (names.has(inner)) {
          used++;
          continue;
        }
        const node = tryParse(safe(inner));
        const unknown = node ? [...variablesOf(node)].map(orig).filter((r) => !names.has(r)) : [inner];
        if (unknown.length) problems.push(`Placeholder {{${inner}}} uses unknown "${unknown.join('", "')}"`);
        else used++;
      }
    }
    if (!used && vars.length) problems.push('No {{placeholder}} uses the variables: the question would never change');
  }
  if (problems.length) throw new TemplateError(problems);
  return { template: t, vars, random: vars.filter((v) => !v.formula), derived, safe, env, names, strict };
}

/** Fills the {{placeholders}} of a text. Negative numbers after a sign get brackets: 3 + (-2). Unknown ones stay. */
export function fill(text: string, values: Record<string, number>, c?: Pick<Compiled, 'safe' | 'env' | 'vars'>): string {
  const decimals = Object.fromEntries((c?.vars ?? []).map((v) => [v.name, decimalsOf(v)]));
  return text.replace(PLACEHOLDER, (whole, inner: string, offset: number) => {
    let value: number;
    let dec: number;
    if (inner in values) {
      value = values[inner];
      dec = decimals[inner] ?? (Number.isInteger(value) ? 0 : FLOAT_DECIMALS);
    } else {
      const node = tryParse(c ? c.safe(inner) : inner);
      if (!node) return whole;
      const refs = [...variablesOf(node)];
      const e = c ? c.env(values) : values;
      if (!refs.length || refs.some((r) => !(r in e))) return whole;
      value = evaluate(node, e);
      dec = Number.isInteger(value) ? 0 : FLOAT_DECIMALS;
    }
    if (!Number.isFinite(value)) return whole;
    const shown = formatNumber(value, dec);
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
  if (v.type === 'float') return Number((min + random() * (max - min)).toFixed(FLOAT_DECIMALS));
  const lo = Math.ceil(min);
  return lo + Math.floor(random() * (Math.floor(max) - lo + 1));
}

/** How many different sets of random values there are (capped), to stop early when there are few. */
function space(c: Compiled): number {
  let n = 1;
  for (const v of c.random) {
    n *= v.type === 'float' ? Infinity : Math.max(1, Math.floor(v.max as number) - Math.ceil(v.min as number) + 1);
    if (n > 1e7) return Infinity;
  }
  return n;
}

/** Computes the formula variables and checks their min / max; null when the values do not fit. */
export function solve(c: Compiled, picked: Record<string, number>): Record<string, number> | null {
  const values = { ...picked };
  for (const { v, node } of c.derived) {
    const x = evaluate(node, c.env(values));
    if (!Number.isFinite(x)) return null;
    // A whole-number answer must really be one: 7 / 2 is not a whole number.
    if (c.strict && v.type !== 'float' && Math.abs(Math.round(x) - x) > 1e-9) return null;
    if (v.min != null && x < v.min - 1e-9) return null;
    if (v.max != null && x > v.max + 1e-9) return null;
    values[v.name] = Number(x.toFixed(decimalsOf(v)));
  }
  return values;
}

/** Fills the template with one set of values. */
export function render(t: QuestionTemplate, values: Record<string, number>, random?: () => number, c: Compiled = compile(t, false)): Variant {
  const f = (s: string) => fill(s, values, c);
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
    question: f(t.question ?? ''),
    questionBody: t.questionBody == null ? null : f(t.questionBody),
    hint: f(t.hint ?? ''),
    solution: f(t.solution ?? ''),
    groups,
    answer: answerOf(t.questionType, groups),
  };
}

function answerOf(questionType: number, groups: TemplateGroup[]): string {
  const all = groups[0]?.options ?? [];
  if (questionType === 3 || questionType === 5) {
    // Fill in the Blank / Sequence: the tile of each blank, in blank order.
    return all.filter((o) => o.sequenceNumber != null).sort((a, b) => (a.sequenceNumber ?? 0) - (b.sequenceNumber ?? 0)).map((o) => o.option).join(', ');
  }
  return groups.flatMap((g) => g.options.filter((o) => o.isCorrect).map((o) => o.option)).join(', ');
}

export interface GenerateOptions {
  count?: number;
  seed?: number;
  /** Values for the first variant, e.g. the example the template was made from. */
  first?: Record<string, number>;
  /** false for existing exercises: placeholders are not checked. */
  strict?: boolean;
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
  const c = compile(t, opts.strict ?? true);
  const requested = Math.min(MAX_COUNT, Math.max(1, Math.floor(opts.count ?? 15)));
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 32);
  const random = rng(seed);
  const variants: Variant[] = [];
  const seen = new Set<string>();
  const add = (values: Record<string, number>) => {
    const variant = render(t, values, random, c);
    // Options of one group must differ, or the student could not tell them apart.
    if (c.strict && variant.groups.some((g) => new Set(g.options.map((o) => o.option)).size < g.options.length)) return;
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
    for (const v of c.random) picked[v.name] = draw(v, random);
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

/** The variables in words, e.g. "a: whole number 1 to 9", "c = a + b, at least 0". */
export const describeVariables = (t: QuestionTemplate) =>
  t.variables.map((v) =>
    v.formula
      ? `${v.name} = ${v.formula}${v.min != null && v.max != null ? (v.min === v.max ? `, must be ${v.min}` : `, only ${v.min} to ${v.max}`) : v.min != null ? `, at least ${v.min}` : v.max != null ? `, at most ${v.max}` : ''}`
      : `${v.name}: ${v.type === 'float' ? 'number' : 'whole number'} ${v.min} to ${v.max}`,
  );
