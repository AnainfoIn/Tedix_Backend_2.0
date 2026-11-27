import { detectTemplates } from './detect';
import { calc } from './expression';
import { QuestionTemplate, TemplateError, checkTemplate, fill, generate } from './template';

const one = (examples: string[], opts = {}) => detectTemplates(examples, opts).templates[0];

describe('expression', () => {
  it('calculates with precedence, brackets, signs and functions', () => {
    expect(calc('2 + 3 * 4')).toBe(14);
    expect(calc('(2 + 3) × 4')).toBe(20);
    expect(calc('12 ÷ 3 - -1')).toBe(5);
    expect(calc('2^3^2')).toBe(512);
    expect(calc('max(a, b) - min(a, b)', { a: 3, b: 8 })).toBe(5);
    expect(calc('a > b', { a: 3, b: 2 })).toBe(1);
    expect(calc('1 / 0')).toBeNaN();
  });
  it('refuses anything that is not arithmetic', () => {
    expect(() => calc('process.exit()')).toThrow();
    expect(() => calc('2 +')).toThrow();
    expect(() => calc('foo(1)')).toThrow(/Unknown function/);
  });
});

describe('fill', () => {
  it('fills placeholders and leaves LaTeX braces alone', () => {
    expect(fill('\\text{Fill in} {a} + {b} = {a + b}', { a: 2, b: 3 })).toBe('\\text{Fill in} 2 + 3 = 5');
    expect(fill('x^{2} + \\frac{a}{b}', { a: 1, b: 4 })).toBe('x^{2} + \\frac{1}{4}');
    expect(fill('{a} + {b}', { a: 3, b: -2 })).toBe('3 + (-2)');
    expect(fill('{a} = {b}', { a: 3, b: -2 })).toBe('3 = -2');
    expect(fill('{a}', { a: 1.25 }, { a: 2 })).toBe('1.25');
  });
});

describe('detectTemplates', () => {
  it('turns 2+3=5 into {a} + {b} = {c}, a Fill in the Blank exercise', () => {
    const d = one(['2+3=5']);
    expect(d.pattern).toBe('{a} + {b} = {c}');
    expect(d.typeName).toBe('Fill in the Blank');
    const t = d.template;
    expect(t.questionType).toBe(3);
    expect(t.questionBody).toBe('{a} + {b} = [Blank]');
    expect(t.variables).toEqual([
      { name: 'a', type: 'integer', min: 1, max: 9 },
      { name: 'b', type: 'integer', min: 1, max: 9 },
      { name: 'c', type: 'integer', formula: 'a + b', min: 0 },
    ]);
    // Correct tile fills Blank 1; the other tiles are distractors (as the editor saves them).
    expect(t.groups[0].options[0]).toEqual({ option: '{c}', isCorrect: true, sequenceNumber: 1 });
    expect(t.groups[0].options.slice(1).every((o) => !o.isCorrect && o.sequenceNumber === null)).toBe(true);
    expect(d.first).toEqual({ a: 2, b: 3, c: 5 });
  });

  it('reads a typed template, also with double braces', () => {
    expect(one(['{{a}+{b}={c}}']).template.variables.map((v) => v.formula ?? null)).toEqual([null, null, 'a + b']);
    expect(one(['{x} * {y} = {z}'], { ranges: { x: [10, 20] } }).template.variables[0]).toMatchObject({ name: 'x', min: 10, max: 20 });
  });

  it('takes ranges from the numbers of the examples', () => {
    const vars = one(['25 + 17 = 42', '30 + 45 = 75']).template.variables;
    expect(vars.slice(0, 2).map((v) => [v.min, v.max])).toEqual([[10, 99], [10, 99]]);
  });

  it('hides the ? of the example', () => {
    const d = one(['12 - ? = 7']);
    expect(d.template.questionBody).toBe('{a} - [Blank] = {c}');
    expect(d.template.groups[0].options[0].option).toBe('{b}');
    expect(d.first).toEqual({ a: 12, b: 5, c: 7 });
  });

  it('makes divisions that always divide exactly', () => {
    const d = one(['12 : 3 = 4']);
    expect(d.template.variables[0]).toMatchObject({ name: 'a', formula: 'b * c' });
    for (const v of generate(d.template, { count: 40, seed: 3 }).variants) {
      expect(v.values.a / v.values.b).toBe(v.values.c);
      expect(v.questionBody).toMatch(/^\d+ : \d+ = \[Blank\]$/);
    }
  });

  it('makes single choice questions with 4 different options', () => {
    const d = one(['3 × 4 = 12'], { type: 'single_choice' });
    expect(d.template.questionType).toBe(2);
    for (const v of generate(d.template, { count: 20, seed: 1 }).variants) {
      const opts = v.groups[0].options;
      expect(new Set(opts.map((o) => o.option)).size).toBe(4);
      expect(opts.filter((o) => o.isCorrect).map((o) => Number(o.option))).toEqual([v.values.a * v.values.b]);
      expect(opts.map((o) => o.sequenceNumber)).toEqual([1, 2, 3, 4]);
    }
  });

  it('reads number patterns (adding and multiplying)', () => {
    const add = one(['2, 4, 6, ?']);
    expect(add.typeName).toBe('Number Pattern');
    expect(add.template.groups[0].options.map((o) => [o.option, o.isCorrect])).toEqual([['{s}', false], ['{s + d}', false], ['{s + 2 * d}', false], ['{s + 3 * d}', true]]);
    const times = one(['3, 6, 12, 24']);
    const v = generate(times.template, { count: 5, seed: 2 }).variants[0];
    const terms = v.groups[0].options.map((o) => Number(o.option));
    expect(terms[1] / terms[0]).toBe(terms[3] / terms[2]);
  });

  it('groups examples by shape and reports the ones it cannot use', () => {
    const r = detectTemplates(['2+3=5', '7+1=8', '9-4=5', '2+3=6', 'hello']);
    expect(r.templates.map((t) => t.pattern)).toEqual(['{a} + {b} = {c}', '{a} - {b} = {c}']);
    expect(r.templates[0].examples).toEqual(['2+3=5', '7+1=8']);
    expect(r.skipped.map((s) => s.example).sort()).toEqual(['2+3=6', 'hello']);
  });

  it('throws when no example can be used', () => {
    expect(() => detectTemplates(['2 + 3 = 6'])).toThrow(TemplateError);
    expect(() => detectTemplates([])).toThrow(/at least one example/);
  });
});

describe('generate', () => {
  const base = one(['2+3=5']).template;

  it('makes 15 different questions with their answers', () => {
    const r = generate(base, { count: 15, seed: 42 });
    expect(r.variants).toHaveLength(15);
    expect(new Set(r.variants.map((v) => v.questionBody)).size).toBe(15);
    for (const v of r.variants) {
      expect(Number(v.answer)).toBe(v.values.a + v.values.b);
      expect(v.questionBody).toBe(`${v.values.a} + ${v.values.b} = [Blank]`);
      expect(v.solution).toBe(`${v.values.a} + ${v.values.b} = ${v.values.c}`);
    }
  });

  it('gives the same questions for the same seed', () => {
    expect(generate(base, { count: 5, seed: 9 }).variants).toEqual(generate(base, { count: 5, seed: 9 }).variants);
  });

  it('keeps subtraction answers at 0 or more and follows conditions', () => {
    const t = one(['9 - 4 = 5'], { constraints: ['a - b <= 3'] }).template;
    for (const v of generate(t, { count: 20, seed: 5 }).variants) {
      expect(v.values.c).toBeGreaterThanOrEqual(1);
      expect(v.values.c).toBeLessThanOrEqual(3);
    }
  });

  it('stops with a note when the ranges hold fewer questions', () => {
    const t = one(['1 + 1 = 2'], { ranges: { a: [1, 2], b: [1, 2] } }).template;
    const r = generate(t, { count: 15, seed: 1 });
    expect(r.variants).toHaveLength(4);
    expect(r.note).toMatch(/Only 4/);
  });

  it('checks templates given by hand', () => {
    const bad: QuestionTemplate = { ...base, variables: [{ name: 'a', min: 1, max: 9 }, { name: 'c', formula: 'a + z' }] };
    expect(checkTemplate(bad).join(' ')).toMatch(/unknown "z"/);
    expect(checkTemplate({ ...base, variables: [{ name: 'a', formula: 'b' }, { name: 'b', formula: 'a' }] }).join(' ')).toMatch(/depend on each other/);
    expect(checkTemplate({ ...base, variables: [{ name: 'q', min: 1, max: 2 }] }).join(' ')).toMatch(/never change/);
  });
});
