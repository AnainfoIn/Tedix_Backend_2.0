/**
 * generateQuestion MCP server (stdio): give it example exercises like "2+3=5" and it makes the
 * template ({a} + {b} = {c}), saves it as an exercise of a micro lesson, and generates fresh
 * questions with answers ("15 questions") whenever asked.
 *
 * Preview and generate-from-examples run here, without the API. Saving and reading saved
 * exercises go through the 2.0 admin API, so they follow the admin's permissions:
 *
 *   TEDIX_API_URL            e.g. http://localhost:4000 (the API, which serves /admin/api)
 *   TEDIX_ADMIN_TOKEN        a signed-in admin token, or:
 *   TEDIX_ADMIN_EMAIL / TEDIX_ADMIN_PASSWORD (+ TEDIX_ADMIN_OTP_SECRET for accounts with 2FA)
 *
 * Run: npm run mcp -w apps/api (dev) or node apps/api/dist/generate-question/mcp-server.js (built).
 * See docs/GENERATE_QUESTION.md for the Claude Desktop / Claude Code setup.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { authenticator } from 'otplib';
import { z } from 'zod';
import { brief, parseRequest, summary, templatesOf } from './requests';
import { TemplateError, generate } from './template';

type Row = Record<string, any>;

// ---------- API client ----------

let token = process.env.TEDIX_ADMIN_TOKEN?.trim() || '';

const apiUrl = () => {
  const url = process.env.TEDIX_API_URL?.trim();
  if (!url) throw new Error('Set TEDIX_API_URL (the Tedix 2.0 API, e.g. http://localhost:4000) to save or read exercises');
  return url.replace(/\/$/, '');
};

async function signIn(): Promise<string> {
  const email = process.env.TEDIX_ADMIN_EMAIL?.trim();
  const password = process.env.TEDIX_ADMIN_PASSWORD;
  if (!email || !password) throw new Error('Set TEDIX_ADMIN_TOKEN, or TEDIX_ADMIN_EMAIL and TEDIX_ADMIN_PASSWORD');
  const post = async (path: string, body: Row) => {
    const res = await fetch(`${apiUrl()}/admin/api/auth/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const json = (await res.json().catch(() => ({}))) as Row;
    if (!res.ok) throw new Error(`Sign-in failed: ${json.message ?? res.status}`);
    return json.data as Row;
  };
  let result = await post('login', { email, password });
  if (result.otpRequired) {
    const secret = process.env.TEDIX_ADMIN_OTP_SECRET?.trim();
    if (!secret) throw new Error('This admin has 2FA: set TEDIX_ADMIN_OTP_SECRET, or use TEDIX_ADMIN_TOKEN');
    result = await post('verify-otp', { challengeToken: result.challengeToken, otp: authenticator.generate(secret) });
  }
  return String(result.token);
}

async function api(method: string, path: string, body?: Row): Promise<Row> {
  if (!token) token = await signIn();
  const call = () =>
    fetch(`${apiUrl()}/admin/api/${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  let res = await call();
  if (res.status === 401 && process.env.TEDIX_ADMIN_EMAIL) {
    token = await signIn();
    res = await call();
  }
  const json = (await res.json().catch(() => ({}))) as Row;
  if (!res.ok) {
    const problems = Array.isArray(json.problems) ? `\n- ${json.problems.join('\n- ')}` : '';
    throw new Error(`${json.message ?? `The API answered ${res.status}`}${problems}`);
  }
  return json.data as Row;
}

// ---------- text for the model ----------

/** LaTeX made readable: \text{Fill in} -> Fill in, \times -> ×. */
const plain = (s: string | null | undefined) =>
  String(s ?? '')
    .replace(/\\text\{([^{}]*)\}/g, '$1')
    .replace(/\\times/g, '×')
    .replace(/\\cdot/g, '·')
    .replace(/\\div/g, '÷')
    .replace(/\^\{([^{}]*)\}/g, '^$1')
    .replace(/\\\\/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function questionLines(questions: Array<ReturnType<typeof brief>>): string {
  return questions
    .map((q, i) => {
      const body = q.questionBody ? ` ${plain(q.questionBody)}` : '';
      const options = q.questionType === 2 || q.questionType === 6 ? `   (options: ${q.groups[0]?.options.map((o) => plain(o.option)).join(', ')})` : '';
      const ask = q.questionType === 10 ? `${plain(q.question)} ${q.groups[0]?.options.map((o) => (o.isCorrect ? '?' : plain(o.option))).join(', ')}` : `${plain(q.question)}${body}`;
      return `${i + 1}. ${ask}${options}  ->  answer: ${plain(q.answer)}`;
    })
    .join('\n');
}

const ok = (text: string, data?: unknown) => ({
  content: [{ type: 'text' as const, text }, ...(data === undefined ? [] : [{ type: 'text' as const, text: `JSON:\n${JSON.stringify(data, null, 1)}` }])],
});
const fail = (e: unknown) => ({
  isError: true,
  content: [{ type: 'text' as const, text: e instanceof TemplateError ? `Could not use these examples:\n- ${e.problems.join('\n- ')}` : (e as Error).message }],
});

// ---------- tools ----------

const range = z.union([
  z.tuple([z.number(), z.number()]),
  z.object({ min: z.number().optional(), max: z.number().optional(), step: z.number().optional(), decimals: z.number().optional(), exclude: z.array(z.number()).optional() }),
]);
const shared = {
  examples: z.array(z.string()).optional().describe('Example exercises, one per item: "2+3=5", "12 - ? = 7", "3 × 4 = 12", "2, 4, 6, ?", or a template "{a}+{b}={c}". Examples with the same shape become one template.'),
  type: z.enum(['auto', 'fill_in_the_blank', 'single_choice', 'number_pattern']).optional().describe('Exercise type to make. auto: equations become Fill in the Blank, number lists become Number Pattern.'),
  ranges: z.record(z.string(), range).optional().describe('Ranges by variable, e.g. {"a": [1, 20], "b": {"min": 2, "max": 9}}. On the result variable (c) it is a condition, e.g. {"c": {"max": 20}}. Default: from the examples (2 gives 1-9, 25 gives 10-99).'),
  constraints: z.array(z.string()).optional().describe('Extra conditions every question must meet, e.g. ["a > b", "c <= 20"].'),
  texts: z.object({ question: z.string().optional(), hint: z.string().optional(), solution: z.string().optional() }).optional().describe('Own question / hint / solution texts (LaTeX like the other exercises, may use {a} placeholders). Default: short English texts.'),
};
const template = z.record(z.string(), z.any()).optional().describe('A full template (as returned by preview) instead of examples.');

export function createServer() {
  const server = new McpServer({ name: 'tedix-generate-question', version: '1.0.0' });

  server.registerTool(
    'preview_question_templates',
    {
      title: 'Preview question templates',
      description:
        'Reads example exercises (like "2+3=5") and shows the template each one becomes ({a} + {b} = {c}), its exercise type, the number ranges, and sample questions with answers. Saves nothing. Use it first, then save_question_templates.',
      inputSchema: { ...shared, examples: shared.examples.unwrap(), count: z.number().int().min(1).max(50).optional().describe('Sample questions per template (default 5)') },
    },
    async (args) => {
      try {
        const req = parseRequest({ ...args, count: args.count ?? 5 });
        const { templates, skipped } = templatesOf(req);
        const out = templates.map((t) => summary(t, req.count, req.seed));
        const text = out
          .map((t, i) => `Template ${i + 1}: ${t.type} — ${plain(t.pattern)}\nFrom: ${t.examples.join(' | ')}\nVariables: ${t.variables.join('; ')}\n${questionLines(t.questions)}${t.note ? `\nNote: ${t.note}` : ''}`)
          .concat(skipped.length ? [`Not used:\n${skipped.map((s) => `- ${s.problem.startsWith('"') ? s.problem : `"${s.example}" ${s.problem}`}`).join('\n')}`] : [])
          .join('\n\n');
        return ok(text, { templates: out.map(({ questions, ...t }) => t), skipped });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    'save_question_templates',
    {
      title: 'Save question templates',
      description:
        'Saves the templates made from the examples as exercises of a micro lesson (one exercise per template), or into one existing exercise. Each saved exercise keeps the first example as its visible sample, and is served with new random numbers every time. Ask the user before saving.',
      inputSchema: {
        ...shared,
        template,
        microLessonId: z.number().int().optional().describe('Micro lesson to add the new exercises to (find it with find_micro_lessons)'),
        exerciseId: z.number().int().optional().describe('Or: an existing exercise to turn into this template (replaces its question)'),
        name: z.string().optional().describe('Exercise name (default: type and pattern, e.g. "Fill in the Blank: {a} + {b} = {c}")'),
        isAha: z.boolean().optional(),
      },
    },
    async (args) => {
      try {
        const data = await api('POST', 'workspace/question-templates', args);
        const lines = (data.saved as Row[]).map((s) => `- Exercise ${s.exerciseId} "${s.name}" (${s.type}): ${plain(s.pattern)}; sample: ${plain(s.sample.questionBody ?? s.sample.question)} -> ${plain(s.sample.answer)}`);
        const skipped = (data.skipped as Row[]).map((s) => `- "${s.example}": ${s.problem}`);
        return ok(`Saved ${lines.length} template exercise${lines.length === 1 ? '' : 's'}:\n${lines.join('\n')}${skipped.length ? `\nNot used:\n${skipped.join('\n')}` : ''}`, data);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    'generate_questions',
    {
      title: 'Generate questions',
      description:
        'Makes new questions with their answers (default 15), each with different random numbers: from a saved template exercise (exerciseId), or straight from examples or a template without saving.',
      inputSchema: {
        ...shared,
        template,
        exerciseId: z.number().int().optional().describe('A saved template exercise'),
        count: z.number().int().min(1).max(200).optional().describe('How many questions (default 15)'),
        seed: z.number().int().optional().describe('Same seed, same questions (for a repeatable set)'),
      },
    },
    async (args) => {
      try {
        const count = args.count ?? 15;
        if (args.exerciseId != null) {
          const data = await api('GET', `workspace/exercises/${args.exerciseId}/variants?count=${count}${args.seed != null ? `&seed=${args.seed}` : ''}`);
          return ok(`${data.questions.length} questions from exercise ${args.exerciseId}${data.pattern ? ` (${plain(data.pattern)})` : ''}:\n${questionLines(data.questions)}${data.note ? `\nNote: ${data.note}` : ''}`, data);
        }
        const req = parseRequest({ ...args, count });
        const { templates, skipped } = templatesOf(req);
        const out = templates.map((t) => {
          const r = generate(t.template, { count: req.count, seed: req.seed });
          return { type: t.typeName, pattern: t.pattern, questions: r.variants.map(brief), note: r.note, seed: r.seed };
        });
        const text = out.map((t) => `${t.type} — ${plain(t.pattern)}:\n${questionLines(t.questions)}${t.note ? `\nNote: ${t.note}` : ''}`).join('\n\n');
        return ok(text + (skipped.length ? `\n\nNot used:\n${skipped.map((s) => `- "${s.example}": ${s.problem}`).join('\n')}` : ''), { templates: out, skipped });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    'find_micro_lessons',
    {
      title: 'Find micro lessons',
      description: 'Finds micro lessons by name, to know where to save exercises.',
      inputSchema: { search: z.string().describe('Part of the micro lesson name') },
    },
    async ({ search }) => {
      try {
        const res = await api('GET', `micro_lessons?perPage=20&q=${encodeURIComponent(search)}`);
        const rows = (Array.isArray(res) ? res : (res.items ?? res.rows ?? [])) as Row[];
        if (!rows.length) return ok(`No micro lesson matches "${search}".`);
        return ok(rows.map((r) => `- ${r.id}: ${r.name}${r.path ? ` (${r.path})` : ''}`).join('\n'));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    'get_exercise_template',
    {
      title: 'Get exercise template',
      description: 'Shows the template saved on an exercise (variables, ranges, texts), or says it is a normal exercise.',
      inputSchema: { exerciseId: z.number().int() },
    },
    async ({ exerciseId }) => {
      try {
        const data = await api('GET', `workspace/exercises/${exerciseId}/template`);
        if (!data.template) return ok(`Exercise ${exerciseId} is a normal exercise (no template).`);
        return ok(`Exercise ${exerciseId}: ${plain(data.template.pattern ?? data.template.questionBody ?? data.template.question)}\nVariables: ${data.variables.join('; ')}`, data);
      } catch (e) {
        return fail(e);
      }
    },
  );

  return server;
}

if (require.main === module) {
  createServer()
    .connect(new StdioServerTransport())
    .catch((e) => {
      process.stderr.write(`generateQuestion MCP server failed: ${(e as Error).message}\n`);
      process.exit(1);
    });
}
