import { DetectOptions, DetectType, DetectedTemplate, RangeInput, TYPE_NAMES, detectTemplates } from './detect';
import { MAX_COUNT, QuestionTemplate, TemplateError, Variant, checkTemplate, describeVariables, generate } from './template';

/** Request helpers shared by the API and the MCP server (no Nest or database here). */
type Row = Record<string, any>;

const TYPES: DetectType[] = ['auto', 'fill_in_the_blank', 'single_choice', 'number_pattern'];

/** Reads the request body of the preview, generate and save calls. */
export function parseRequest(body: Row): { examples: string[]; template: QuestionTemplate | null; options: DetectOptions; count: number; seed?: number } {
  const raw = body?.examples;
  const examples = (Array.isArray(raw) ? raw.map(String) : typeof raw === 'string' ? raw.split(/\r?\n/) : []).map((s) => s.trim()).filter(Boolean);
  const template = body?.template && typeof body.template === 'object' ? ({ version: 1, ...body.template } as QuestionTemplate) : null;
  if (!examples.length && !template) throw new TemplateError(['Give examples (like "2 + 3 = 5") or a template']);
  if (examples.length > 200) throw new TemplateError(['At most 200 examples at a time']);
  const type = (body?.type ?? 'auto') as DetectType;
  if (!TYPES.includes(type)) throw new TemplateError([`type must be one of ${TYPES.join(', ')}`]);
  const count = body?.count == null || body.count === '' ? 15 : Number(body.count);
  if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) throw new TemplateError([`count must be a whole number from 1 to ${MAX_COUNT}`]);
  const seed = body?.seed == null || body.seed === '' ? undefined : Number(body.seed);
  if (seed !== undefined && !Number.isInteger(seed)) throw new TemplateError(['seed must be a whole number']);
  const ranges = body?.ranges && typeof body.ranges === 'object' ? (body.ranges as Record<string, RangeInput>) : undefined;
  const constraints = Array.isArray(body?.constraints) ? body.constraints.map(String) : undefined;
  const t = body?.texts ?? {};
  const texts = { question: t.question ? String(t.question) : undefined, hint: t.hint ? String(t.hint) : undefined, solution: t.solution ? String(t.solution) : undefined };
  return { examples, template, options: { type, ranges, constraints, texts }, count, seed };
}

/** The templates of a request: detected from the examples, or the one given. */
export function templatesOf(req: ReturnType<typeof parseRequest>): { templates: DetectedTemplate[]; skipped: Array<{ example: string; problem: string }> } {
  if (req.template) {
    const problems = checkTemplate(req.template);
    if (problems.length) throw new TemplateError(problems);
    const t = req.template;
    return { templates: [{ typeName: TYPE_NAMES[t.questionType] ?? `Type ${t.questionType}`, pattern: t.pattern ?? t.questionBody ?? t.question, examples: t.examples ?? [], template: t }], skipped: [] };
  }
  return detectTemplates(req.examples, req.options);
}

/** What the preview shows for one template: its pattern, variables and a few questions with answers. */
export function summary(d: DetectedTemplate, count: number, seed?: number) {
  const result = generate(d.template, { count, seed, first: d.first });
  return {
    type: d.typeName,
    questionType: d.template.questionType,
    pattern: d.pattern,
    examples: d.examples,
    variables: describeVariables(d.template),
    template: d.template,
    questions: result.variants.map(brief),
    note: result.note,
    seed: result.seed,
  };
}

/** A generated question in the editor's shape, plus its answer. */
export const brief = (v: Variant) => ({
  question: v.question,
  questionBody: v.questionBody,
  answer: v.answer,
  values: v.values,
  questionType: v.questionType,
  hint: v.hint,
  solution: v.solution,
  groups: v.groups,
});

