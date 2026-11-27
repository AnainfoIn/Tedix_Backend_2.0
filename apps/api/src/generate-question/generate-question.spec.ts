import { detectTemplates } from './detect';
import { calc } from './expression';
import { importProblems, importSchema, toQuestion } from './import';
import { QuestionTemplate, TemplateError, checkTemplate, compile, fill, generate } from './template';

const one = (examples: string[], opts = {}) => detectTemplates(examples, opts).templates[0];

describe('expression', () => {
  it('calculates with precedence, brackets, signs and functions', () => {
    expect(calc('2 + 3 * 4')).toBe(14);
    expect(calc('(2 + 3) × 4')).toBe(20);
    expect(calc('12 ÷ 3 - -1')).toBe(5);
    expect(calc('2^3^2')).toBe(512);
    expect(calc('S*R**2', { S: 3, R: 2 })).toBe(12);
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
  it('fills {{placeholders}} and leaves LaTeX braces alone', () => {
    expect(fill('\\text{Fill in} {{a}} + {{b}} = {{a + b}}', { a: 2, b: 3 })).toBe('\\text{Fill in} 2 + 3 = 5');
    expect(fill('\\sqrt{{{b}}} + \\frac{1}{2}', { b: 4 })).toBe('\\sqrt{4} + \\frac{1}{2}');
    expect(fill('{{a}} + {{b}}', { a: 3, b: -2 })).toBe('3 + (-2)');
    expect(fill('{{a}} = {{b}}', { a: 3, b: -2 })).toBe('3 = -2');
    expect(fill('{{z}} stays', { a: 1 })).toBe('{{z}} stays');
  });
  it('reads the names the existing templates use', () => {
    const t: QuestionTemplate = { questionType: 2, question: 'q', questionBody: null, hint: 'h', solution: 's', groups: [], variables: [
      { name: 'a', min: 1, max: 3 }, { name: 'e', min: 1, max: 3 }, { name: 'b', min: 1, max: 3 }, { name: 'd', min: 1, max: 3 },
      { name: '3a', formula: '3*a' }, { name: 'max', formula: 'a + 1' },
    ] };
    const c = compile(t, false);
    const v = { a: 2, e: 3, b: 1, d: 4, '3a': 6, max: 3 };
    expect(fill('{{3a}} {{ae-bd}} {{2a}} {{max}}', v, c)).toBe('6 2 4 3');
  });
});

describe('detectTemplates (Part A)', () => {
  it('turns 2+3=5 into {{a}} + {{b}} = {{c}}, a Fill in the Blank exercise', () => {
    const d = one(['2+3=5']);
    expect(d.pattern).toBe('{{a}} + {{b}} = {{c}}');
    expect(d.typeName).toBe('Fill in the Blank');
    const t = d.template;
    expect(t.questionType).toBe(3);
    expect(t.questionBody).toBe('{{a}} + {{b}} = [Blank]');
    // The same columns as bx_block_assessmenttest_variables: name, value_type, min_val, max_val, formula.
    expect(t.variables).toEqual([
      { name: 'a', type: 'integer', min: 1, max: 9 },
      { name: 'b', type: 'integer', min: 1, max: 9 },
      { name: 'c', type: 'integer', formula: 'a + b', min: 1 },
    ]);
    // Correct tile fills Blank 1; the other tiles are distractors (as the editor saves them).
    expect(t.groups[0].options[0]).toEqual({ option: '{{c}}', isCorrect: true, sequenceNumber: 1 });
    expect(t.groups[0].options.slice(1).every((o) => !o.isCorrect && o.sequenceNumber === null)).toBe(true);
    expect(d.first).toEqual({ a: 2, b: 3, c: 5 });
  });

  it('reads a typed template, also with double braces', () => {
    expect(one(['{{a}}+{{b}}={{c}}']).template.variables.map((v) => v.formula ?? null)).toEqual([null, null, 'a + b']);
    expect(one(['{x} * {y} = {z}'], { ranges: { x: [10, 20] } }).template.variables[0]).toMatchObject({ name: 'x', min: 10, max: 20 });
  });

  it('does not take algebra for arithmetic', () => {
    expect(() => detectTemplates(['x^2 - 5x + 6 = 0'])).toThrow(TemplateError);
    expect(one(['3 x 4 = 12']).pattern).toBe('{{a}} × {{b}} = {{c}}');
  });

  it('takes ranges from the numbers of the examples', () => {
    const vars = one(['25 + 17 = 42', '30 + 45 = 75']).template.variables;
    expect(vars.slice(0, 2).map((v) => [v.min, v.max])).toEqual([[10, 99], [10, 99]]);
  });

  it('hides the ? of the example', () => {
    const d = one(['12 - ? = 7']);
    expect(d.template.questionBody).toBe('{{a}} - [Blank] = {{c}}');
    expect(d.template.groups[0].options[0].option).toBe('{{b}}');
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

  it('stores conditions as formula variables that must be 1', () => {
    const t = one(['9 - 4 = 5'], { constraints: ['a - b <= 3'] }).template;
    expect(t.variables.find((v) => v.name === 'cond1')).toEqual({ name: 'cond1', type: 'integer', formula: 'a - b <= 3', min: 1, max: 1 });
    for (const v of generate(t, { count: 20, seed: 5 }).variants) {
      expect(v.values.c).toBeGreaterThanOrEqual(1);
      expect(v.values.c).toBeLessThanOrEqual(3);
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
    expect(add.template.groups[0].options.map((o) => [o.option, o.isCorrect])).toEqual([['{{s}}', false], ['{{s + d}}', false], ['{{s + 2 * d}}', false], ['{{s + 3 * d}}', true]]);
    const times = one(['3, 6, 12, 24']);
    const v = generate(times.template, { count: 5, seed: 2 }).variants[0];
    const terms = v.groups[0].options.map((o) => Number(o.option));
    expect(terms[1] / terms[0]).toBe(terms[3] / terms[2]);
  });

  it('groups examples by shape and reports the ones it cannot use', () => {
    const r = detectTemplates(['2+3=5', '7+1=8', '9-4=5', '2+3=6', 'hello']);
    expect(r.templates.map((t) => t.pattern)).toEqual(['{{a}} + {{b}} = {{c}}', '{{a}} - {{b}} = {{c}}']);
    expect(r.templates[0].examples).toEqual(['2+3=5', '7+1=8']);
    expect(r.skipped.map((s) => s.example).sort()).toEqual(['2+3=6', 'hello']);
  });

  it('throws when no example can be used', () => {
    expect(() => detectTemplates(['2 + 3 = 6'])).toThrow(TemplateError);
    expect(() => detectTemplates([])).toThrow(/at least one example/);
  });
});

describe('generate (Part B)', () => {
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

  it('stops with a note when the ranges hold fewer questions', () => {
    const t = one(['1 + 1 = 2'], { ranges: { a: [1, 2], b: [1, 2] } }).template;
    const r = generate(t, { count: 15, seed: 1 });
    expect(r.variants).toHaveLength(4);
    expect(r.note).toMatch(/Only 4/);
  });

  it('serves an existing template as written in the data', () => {
    // Exercise 1048 on dev: distances between lines, with formula variables.
    const t: QuestionTemplate = {
      questionType: 4,
      question: '\\text{d1: y={{a}}, d2: y={{b}}, A({{xa}},{{ya}}). Potriviti:}',
      questionBody: null,
      hint: 'h',
      solution: 's',
      groups: [{ options: [{ option: '<p>|{{a}}-{{b}}| = {{dist_d1d2}}</p>', isCorrect: false, sequenceNumber: 4 }] }],
      variables: [
        { name: 'a', type: 'integer', min: 1, max: 3 },
        { name: 'b', type: 'integer', min: 5, max: 8 },
        { name: 'xa', type: 'integer', min: 1, max: 7 },
        { name: 'ya', type: 'integer', min: 9, max: 12 },
        { name: 'dist_d1d2', type: 'integer', min: 2, max: 7, formula: 'b-a' },
      ],
    };
    for (const v of generate(t, { count: 10, seed: 4, strict: false }).variants) {
      expect(v.question).not.toContain('{{');
      expect(v.groups[0].options[0].option).toBe(`<p>|${v.values.a}-${v.values.b}| = ${v.values.b - v.values.a}</p>`);
    }
  });

  it('checks new templates strictly', () => {
    const bad: QuestionTemplate = { ...base, variables: [{ name: 'a', min: 1, max: 9 }, { name: 'c', formula: 'a + z' }] };
    expect(checkTemplate(bad).join(' ')).toMatch(/unknown "z"/);
    expect(checkTemplate({ ...base, variables: [{ name: 'a', formula: 'b' }, { name: 'b', formula: 'a' }] }).join(' ')).toMatch(/depend on each other/);
    expect(checkTemplate({ ...base, variables: [{ name: 'q', min: 1, max: 2 }] }).join(' ')).toMatch(/unknown/);
  });
});

describe('import (pasted questions)', () => {
  const base = { question: '\\text{Q}', hint: 'h', solution: 's' };

  it('turns Claude\'s fields into the editor\'s groups for each type', () => {
    const single = toQuestion(2, { ...base, options: ['3', '4', '5'], correct: 1 });
    expect(single).toMatchObject({ questionType: 2, question: '<p>\\text{Q}</p>', hint: '<p>h</p>' });
    expect(single.groups[0].options).toEqual([
      { option: '<p>3</p>', isCorrect: false, sequenceNumber: 1 },
      { option: '<p>4</p>', isCorrect: true, sequenceNumber: 2 },
      { option: '<p>5</p>', isCorrect: false, sequenceNumber: 3 },
    ]);
    const blanks = toQuestion(7, { ...base, statement: '3 + [Blank] = 7', tiles: [{ text: '4', blank: 1 }, { text: '5', blank: null }] });
    expect(blanks).toMatchObject({ questionType: 3, questionBody: '3 + [Blank] = 7' });
    expect(blanks.groups[0].options).toEqual([{ option: '4', isCorrect: true, sequenceNumber: 1 }, { option: '5', isCorrect: false, sequenceNumber: null }]);
    expect(importProblems(7, blanks)).toEqual([]);
    const match = toQuestion(6, { ...base, rows: [{ left: 'a', right: '1' }, { left: 'b', right: '2' }] });
    expect(match.questionType).toBe(4);
    expect(match.groups.map((g) => g.options.map((o) => [o.option, o.sequenceNumber]))).toEqual([[['<p>a</p>', 1], ['<p>b</p>', 2]], [['<p>1</p>', 1], ['<p>2</p>', 2]]]);
    const pattern = toQuestion(10, { ...base, terms: ['2', '4', '6', '8'], hidden: 3 });
    expect(pattern.groups[0].options.map((o) => o.isCorrect)).toEqual([false, false, false, true]);
    const pairs = toQuestion(1, { ...base, pairs: [{ a: '1/2', b: '0.5' }] });
    expect(pairs).toMatchObject({ questionType: 7, groups: [{ options: [{ option: '<p>1/2</p>', sequenceNumber: 1 }, { option: '<p>0.5</p>', sequenceNumber: 2 }] }] });
    const shapes = toQuestion(11, { ...base, shapes: [{ shape: 'triangle', values: ['1', '2', '3'] }], missingShape: 0, missingValue: 2 });
    expect(shapes.groups[0]).toMatchObject({ shapeType: 'triangle', options: [{ isCorrect: false }, { isCorrect: false }, { isCorrect: true }] });
  });

  it('lists what the editor would refuse', () => {
    expect(importProblems(2, toQuestion(2, { ...base, options: ['3'], correct: 5 }))).toEqual(['Needs at least 2 options', 'Needs exactly one correct option']);
    expect(importProblems(7, toQuestion(7, { ...base, hint: '', statement: '3 + 4', tiles: [] }))).toEqual(['The statement has no [Blank]', 'Hint is missing']);
    expect(() => toQuestion(9, base)).toThrow();
  });

  it('asks Claude for every field of the type, all required', () => {
    const shape = importSchema(10).shape.exercises.element.shape;
    expect(Object.keys(shape).sort()).toEqual(['hidden', 'hint', 'question', 'solution', 'terms']);
  });
});
